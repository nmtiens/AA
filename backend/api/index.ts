import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z, ZodSchema } from 'zod';
import { pool, timedQuery } from '../src/db.js';

// Giới hạn số query chạy song song, tránh 1 request xin quá nhiều connection
// cùng lúc từ transaction-mode pooler (pool phía server rất nhỏ và dùng chung).
async function runWithLimit<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let idx = 0;
  const worker = async () => {
    while (idx < tasks.length) {
      const current = idx++;
      results[current] = await tasks[current]();
    }
  };
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;



// ============================================================================
// CẤU HÌNH BẮT BUỘC QUA ENV (xem .env.example cuối file / README đã gửi trước)
// ============================================================================
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET chưa được cấu hình trong biến môi trường.');
}
const JWT_SECRET_SAFE = JWT_SECRET || 'dev-only-insecure-secret';

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  throw new Error('ALLOWED_ORIGINS chưa được cấu hình trong biến môi trường (bắt buộc ở production).');
}

// ============================================================================
// MIDDLEWARE HẠ TẦNG: helmet, CORS whitelist, compression, rate limit chung
// ============================================================================
app.set('trust proxy', 1); // cần thiết khi chạy sau proxy/CDN (Vercel...) để rate-limit theo IP thật hoạt động đúng
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || (allowedOrigins.length === 0 && process.env.NODE_ENV !== 'production') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS: origin không được phép'));
  },
  credentials: true,
}));
app.use(compression()); // Nén gzip response — giảm 70-90% dung lượng JSON
app.use(express.json({ limit: '1mb' }));

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Thử đăng nhập quá nhiều lần, vui lòng thử lại sau ít phút' },
});
const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Yêu cầu quá nhiều lần, vui lòng thử lại sau' },
});
const otpVerifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Nhập sai quá nhiều lần, vui lòng yêu cầu mã OTP mới' },
});
const warmupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// AUTH MIDDLEWARE: JWT + phân quyền role
// ============================================================================
interface AuthTokenPayload {
  id: string | number;
  username: string;
  role: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

const signAuthToken = (payload: AuthTokenPayload): string =>
  jwt.sign(payload, JWT_SECRET_SAFE, { expiresIn: '8h' });

const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'Thiếu token xác thực' });
  try {
    req.user = jwt.verify(token, JWT_SECRET_SAFE) as AuthTokenPayload;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn' });
  }
};

const requireRole = (...allowedRoles: string[]) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Chưa xác thực' });
  if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ success: false, message: 'Không có quyền truy cập' });
  next();
};

const requireSelfOrRole = (usernameParam: (req: Request) => string, ...allowedRoles: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Chưa xác thực' });
    const target = usernameParam(req);
    if (req.user.username === target || allowedRoles.includes(req.user.role)) return next();
    return res.status(403).json({ success: false, message: 'Không có quyền truy cập' });
  };

const requireWarmupSecret = (req: Request, res: Response, next: NextFunction) => {
  const expected = process.env.WARMUP_SECRET;
  if (!expected) return res.status(503).json({ ok: false, error: 'WARMUP_SECRET chưa được cấu hình' });
  if (req.headers['x-warmup-key'] !== expected) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  next();
};

// ============================================================================
// VALIDATE INPUT (zod)
// ============================================================================
const validateBody = (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ', errors: result.error.flatten().fieldErrors });
  }
  req.body = result.data;
  next();
};

const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });
const forgotPasswordSchema = z.object({ email: z.string().email() });
const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  newPassword: z.string().min(8, 'Mật khẩu mới phải có ít nhất 8 ký tự'),
});
const changePasswordSchema = z.object({
  username: z.string().min(1),
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Mật khẩu mới phải có ít nhất 8 ký tự'),
});
const createUserSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8, 'Mật khẩu phải có ít nhất 8 ký tự'),
  fullName: z.string().min(1),
  email: z.string().email().optional().nullable(),
  role: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  msnv: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
const updateUserSchema = z.object({
  password: z.string().min(8).optional(),
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
  role: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  msnv: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

// ============================================================================
// HẰNG SỐ QUY ĐỔI TIỀN TỆ (trước đây là magic number rải rác)
// ============================================================================
const VND_TO_TRIEU = 1_000_000;
const VND_TO_TY = 1_000_000_000;
const TARGET_WORKSHOPS = ['2A', '3A', '4A', '5A', '8AB', '8C'];
const DEFAULT_REVENUE_YEAR = new Date().getUTCFullYear();

app.get('/', (_req: Request, res: Response) => {
  res.send('Server Backend PostgreSQL đang hoạt động bình thường!');
});

// --- WHITELIST CỘT: CHỈ TRUY XUẤT CÁC CỘT CẦN THIẾT ---
const REPORT_COLUMNS: Record<string, string[]> = {
 production_status_app: [
  'hex', 'tinh_trang', 'tinh_trang_ipo',
  'gia_tri_don_hang_con_lai', 'gia_tri_con_lai',
  'ten_cong_trinh', 'xuong_chinh', 'ten_hang_muc', 'phan_loai_nhom_san_pham',
  'so_ngay_cd_hien_tai', 'bop',
  'tri_gia_don_hang_tong', 'thanh_tien_tinh_phieu', 'thanh_tien_nhap_kho_luy_ke',
],
  vat_tu: [
  'trang_thai', 'trang_thai_sap', 'nguoi_tao', 'nguoi_yeu_cau',
    'ten_cong_trinh', 'so_pr', 'pr_line', 'ma_vat_tu_sap', 'ten_vat_tu',
    'so_luong_yeu_cau', 'dvt', 'ngay_pr', 'nhom_vt', 'so_po',
    'item_note_pr', 'ngay_du_kien_giao_hang_pmh_nhap',   'team_pr_note',
    'so_luong_da_nhan_sap', 'so_luong_con_lai', 'tinh_trang_po',
    'ghi_chu_tinh_trang_po', 'thanh_tien', 'ngay_ve',
    'sl_hang_ve_thuc_te',
],
  khsx: [
  'xuong_chinh', 'ten_cong_trinh', 'ma_cong_trinh', 'thanh_tien_ke_hoach',
    'phan_loai_kh', 'nam', 'thang', 'ngay', 'tuan',

  ],
  nhap_kho: [
  'hex','thanh_tien_nhap_kho', 'xuong_chinh', 'ten_cong_trinh', 'ma_cong_trinh',
    'nam', 'thang', 'ngay', 'date', 'tuan',
  ],
 xuat_kho: [
  'hex', 'so_luong_xuat_kho', 'thanh_tien_xuat_kho', 'date', 'xuong_chinh', 'ten_cong_trinh', 'ghi_chu',
],
 ton_kho: [
  'hex','date', 'gia_tri', 'ma_id_sap',  'ten_cong_trinh',
],
  dht: [
 'hex', 'ngay_nhan_tu_pm', 'tri_gia_don_hang_tong', 'xuong_chinh', 'ten_cong_trinh',

  ],
  tkbv_full: [
    'hex','ngay_nhan', 'tri_gia_don_hang_tong',  'xuong_chinh', 'ten_cong_trinh',
   
  ],
  pthsp_full: [
    'hex','ngay_hoan_thanh', 'tri_gia_don_hang_tong',  'xuong_chinh', 'ten_cong_trinh',
    
  ],
  khsx_nam: [
     'thanh_tien_ke_hoach', 'nam', 'thang', 'xuong_chinh',
  
  ],
  phan_tich_kh_th: [
 'xuong_chinh', 'ten_cong_trinh', 'thanh_tien_ke_hoach', 'nhap_kho_tuan', 'tuan',
    'dung_ke_hoach', 'thuc_hien_dung_ke_hoach_1_phan', 'rot_ke_hoach', 'thuc_hien_rot_ke_hoach_1_phan',
    'nhap_kho_truoc_ke_hoach', 'vuot_ke_hoach', 'nhap_kho_ngoai_ke_hoach',

  ],
  diem_danh: [
  'xuong_chinh', 'so_luong_cong_nhan', 'gio_cong_hanh_chinh', 'gio_cong_tang_ca',
    'tuan', 'nam', 'thang', 'ngay', 'dinh_bien',

  ]
};

// HELPER VALIDATE DATE AN TOÀN
const parseSafeDate = (rawInput?: string): Date | null => {
  if (!rawInput || rawInput === '0' || rawInput === 'undefined' || rawInput === 'null') {
    return null;
  }
  if (!isNaN(Number(rawInput))) {
    const num = Number(rawInput);
    const dateVal = new Date(num > 10000000000 ? num : num * 1000);
    return !isNaN(dateVal.getTime()) ? dateVal : null;
  }
  const parsed = new Date(rawInput);
  return !isNaN(parsed.getTime()) ? parsed : null;
};

// [DATES FIX] Danh sách ngày rời rạc (csv yyyy-mm-dd) do client gửi qua ?dates=.
// Có mặt và không rỗng thì ưu tiên tuyệt đối so với dateFrom/dateTo cho phần điều
// kiện lọc theo ngày (KHÔNG áp dụng cho nhánh 'stock' — snapshot xử lý riêng).
const parseExplicitDates = (req: Request): string[] =>
  Array.from(new Set(
    String(req.query.dates || '')
      .split(',')
      .map(s => parseSafeDate(s.trim()))
      .filter((d): d is Date => d !== null)
      .map(d => d.toISOString().slice(0, 10))
  )).sort();

// [DATES FIX] Áp điều kiện ngày cho các bảng KHÔNG PHẢI snapshot (mọi bảng trừ
// ton_kho). Có explicitDates -> dùng đúng tập ngày đó; không thì fallback về
// dateFrom/dateTo như cũ.
const applyNonStockDateFilter = (
  dateColExpr: string,
  explicitDates: string[],
  dateFrom: Date | null,
  dateTo: Date | null,
  conditions: string[],
  params: any[],
): void => {
  if (explicitDates.length > 0) {
    params.push(explicitDates);
    conditions.push(`${dateColExpr}::date = ANY($${params.length}::date[])`);
    return;
  }
  if (dateFrom) { params.push(dateFrom.toISOString().slice(0, 10)); conditions.push(`${dateColExpr} >= $${params.length}`); }
  if (dateTo) { params.push(dateTo.toISOString().slice(0, 10)); conditions.push(`${dateColExpr} <= $${params.length}`); }
};

// MỚI: quy đổi 1 "periodKey" (do client sinh ra khi vẽ TrendChart — xem hàm
// periodKey() phía frontend) thành khoảng [start, end] để lọc chi tiết dữ liệu
// khi người dùng bấm xem chi tiết 1 cột trên biểu đồ theo thời gian.
// - day: periodKey chính là ngày đó -> start = end = ngày đó
// - week: periodKey là ngày thứ Hai đầu tuần -> end = Chủ nhật cùng tuần
// - month: periodKey là ngày 01 đầu tháng -> end = ngày cuối tháng
const getPeriodRangeFromKey = (value: string, granularity: string): { start: string; end: string } => {
  const d = parseSafeDate(value) || new Date(value);
  if (granularity === 'week') {
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  if (granularity === 'month') {
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  const iso = d.toISOString().slice(0, 10);
  return { start: iso, end: iso };
};

// [SNAPSHOT FIX] 'ton_kho' là bảng snapshot (ảnh chụp tồn kho theo ngày), KHÔNG
// PHẢI bảng giao dịch — nên không bao giờ được SUM/gộp nhiều ngày lại với nhau.
// Luôn ép về đúng 1 ngày đại diện (mới nhất, không vượt quá upperBound nếu có).
// [SNAPSHOT FIX] 'ton_kho' là bảng snapshot theo ngày — KHÔNG BAO GIỜ được SUM
// nhiều ngày lại với nhau. Luôn ép về đúng 1 ngày đại diện (mới nhất, không vượt
// quá upperBound nếu có).
const buildStockSnapshotCondition = (
  table: string,
  dateColExpr: string,
  rawDateCol: string,
  upperBound: Date | null,
  params: any[]
): string => {
  if (upperBound) {
    params.push(upperBound.toISOString().slice(0, 10));
    return `${dateColExpr} = (SELECT MAX(${rawDateCol}) FROM ${table} WHERE ${rawDateCol} <= $${params.length})`;
  }
  return `${dateColExpr} = (SELECT MAX(${rawDateCol}) FROM ${table})`;
};

// [FILTER FIX] So khớp không phân biệt hoa/thường và khoảng trắng thừa — đồng bộ
// với cách /api/overview/summary, /api/khsx-nhapkho/summary, /api/stock/* đã làm.
const eqNormalized = (colExpr: string, paramIdx: number) =>
  `UPPER(TRIM(${colExpr})) = UPPER(TRIM($${paramIdx}))`;

const hasCtWhitelist = (req: Request): boolean => req.query.ctWhitelist !== undefined;
const parseCtWhitelist = (req: Request): string[] =>
  String(req.query.ctWhitelist || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
const applyCtWhitelist = (
  req: Request,
  congTrinhColExpr: string | undefined,
  conditions: string[],
  params: any[],
): void => {
  if (!hasCtWhitelist(req) || !congTrinhColExpr) return;
  const wl = parseCtWhitelist(req);
  params.push(wl);
  conditions.push(`UPPER(TRIM(${congTrinhColExpr})) = ANY($${params.length}::text[])`);
};

// [JOIN DEDUP FIX] Một ma_id_sap/hex có thể khớp NHIỀU dòng trong
// production_status_app (vd: 1 vật tư dùng cho nhiều hạng mục). LEFT JOIN trực
// tiếp sẽ nhân dòng bảng chính lên N lần, làm SUM/COUNT bị thổi phồng sai.
// Dedup bằng DISTINCT ON trước khi join. Đặt tên CTE là "p" để mọi chỗ tham
// chiếu "p.xuong_chinh", "p.dvt", "p.phan_loai_nhom_san_pham"... không cần sửa.
const buildMatchedProductionCTE = (joinKey: string): string => `
  p AS (
    SELECT DISTINCT ON ("${joinKey}")
      "${joinKey}", xuong_chinh, dvt, phan_loai_nhom_san_pham, tinh_trang, tinh_trang_ipo
    FROM production_status_app
    WHERE "${joinKey}" IS NOT NULL
    ORDER BY "${joinKey}", updated_at DESC NULLS LAST
  )
`;

// Helper lấy dữ liệu an toàn cho từng bảng (INCREMENTAL SYNC + CẮT CỘT)
// [ĐO TIMING] Đây là hàm chạy cho /api/all-data và mọi route trong apiRoutes —
// đổi sang timedQuery để tách bạch connect-time vs query-time khi DEBUG_DB_TIMING=true.
const fetchTableData = async (tableName: string, updatedAfter?: string, strict = false) => {
  try {
    const cols = REPORT_COLUMNS[tableName];
    const selectClause = cols ? cols.map(c => `"${c}"`).join(', ') : '*';

    let query = `SELECT ${selectClause} FROM ${tableName}`;
    const values: any[] = [];

    const validDate = parseSafeDate(updatedAfter);
    if (validDate) {
      query += ` WHERE updated_at >= $1`;
      values.push(validDate.toISOString());
    }

    const result = await timedQuery(query, values);
    return result.rows;
  } catch (error) {
    console.error(`Lỗi truy vấn bảng ${tableName}:`, error);
    if (strict) throw error; // all-data: lỗi thì KHÔNG được cache bảng rỗng
    return [];
  }
};

// --- LẤY VERSION (dùng MAX(updated_at)) ---
const TABLES = [
  'production_status_app', 'vat_tu', 'khsx', 'dht', 'nhap_kho',
  'tkbv_full', 'pthsp_full', 'phan_tich_kh_th', 'khsx_nam',
  'xuat_kho', 'diem_danh', 'ton_kho'
];

// Trước đây có 1 mảng VERSION_KEYS song song với TABLES, dễ lệch thứ tự nếu
// sửa 1 trong 2 mà quên sửa cái kia. Gộp thành 1 map duy nhất.
const TABLE_TO_VERSION_KEY: Record<string, string> = {
  production_status_app: 'production',
  vat_tu: 'material',
  khsx: 'khsx',
  dht: 'order',
  nhap_kho: 'inventory',
  tkbv_full: 'tkbv',
  pthsp_full: 'pthsp',
  phan_tich_kh_th: 'analysis',
  khsx_nam: 'yearlyPlan',
  xuat_kho: 'export',
  diem_danh: 'attendance',
  ton_kho: 'stock',
};

// [ĐO TIMING] Được gọi bởi /api/check-versions — request xuất hiện dày đặc nhất
// trong log (poll mỗi 60s + mount + visibilitychange). Đổi sang timedQuery để
// xem đây có phải nguồn gây tranh chấp connection hay không.
const getVersions = async () => {
  // MỚI: thêm ORDER BY table_name — nếu không có, Postgres không đảm bảo thứ tự row,
  // khiến object `out` có thể có thứ tự key khác nhau giữa 2 lần gọi dù giá trị giống
  // hệt nhau. refreshAllDataCache() so sánh cache bằng JSON.stringify(versions), nên
  // thứ tự key khác nhau -> cache bị coi là stale oan -> query lại toàn bộ /api/all-data
  // không cần thiết.
  const result = await timedQuery(`SELECT table_name, last_updated FROM table_versions ORDER BY table_name`);
  const out: Record<string, string> = {};
  result.rows.forEach(row => {
    const key = TABLE_TO_VERSION_KEY[row.table_name];
    if (key) out[key] = row.last_updated;
  });
  return out;
};

// Lấy version của 1 tập con các bảng (dùng cho cache theo endpoint)
const getRelevantVersions = async (keys: string[]): Promise<Record<string, string>> => {
  const all = await getVersions();
  const out: Record<string, string> = {};
  keys.forEach(k => { if (all[k] !== undefined) out[k] = all[k]; });
  return out;
};

// Giới hạn số entry trong 1 cache Map, tránh phình bộ nhớ vô hạn khi user
// chọn nhiều khoảng ngày khác nhau (mỗi khoảng ngày = 1 cache key riêng).
const CACHE_MAX_ENTRIES = 50;
const trimCache = (cache: Map<string, any>) => {
  if (cache.size <= CACHE_MAX_ENTRIES) return;
  const oldestKey = cache.keys().next().value; // Map giữ thứ tự insert
  if (oldestKey !== undefined) cache.delete(oldestKey);
};

// --- CACHE IN-MEMORY CHO /api/all-data ---
// LƯU Ý (serverless/Vercel): biến module-level chỉ cache trong phạm vi 1
// instance. Nhiều instance song song hoặc cold start sẽ không chia sẻ cache
// này. Nếu cần cache đáng tin cậy giữa nhiều instance, cân nhắc chuyển sang
// Upstash Redis (REST API, hợp với serverless).
let cachedData: any = null;
let cachedVersions: Record<string, string> | null = null;


// Hàm riêng cho ton_kho trong /api/all-data: chỉ lấy snapshot NGÀY MỚI NHẤT,
// tránh kéo toàn bộ lịch sử (từng gây statement timeout + OOM trên serverless).
// Chi tiết lịch sử theo ngày vẫn có qua /api/stock/dates và /api/stock/by-project.
const fetchLatestStockSnapshot = async () => {
  try {
    const cols = REPORT_COLUMNS.ton_kho;
    const selectClause = cols.map(c => `"${c}"`).join(', ');
    const query = `
      SELECT ${selectClause}
      FROM ton_kho
      WHERE date_parsed = (SELECT MAX(date_parsed) FROM ton_kho)
    `;
    const result = await timedQuery(query);
    return result.rows;
  } catch (error) {
    console.error('Lỗi truy vấn ton_kho (latest snapshot):', error);
    return [];
  }
};
const refreshAllDataCache = async () => {
  const versions = await getVersions();
  if (cachedData && JSON.stringify(versions) === JSON.stringify(cachedVersions)) {
    return { payload: cachedData, fromCache: true };
  }

  // 'ton_kho' tách riêng: chỉ lấy snapshot ngày mới nhất (xem fetchLatestStockSnapshot),
  // các bảng còn lại vẫn lấy đầy đủ như cũ.
  const otherTables = TABLES.filter(t => t !== 'ton_kho');

  const [
    production, material, khsx, order, inventory,
    tkbv, pthsp, analysis, yearlyPlan, exportData,
    attendance,
  ] = await runWithLimit(
  otherTables.map(t => () => fetchTableData(t, undefined, true)),
    2
  );
  const stock = await fetchLatestStockSnapshot();

  const payload = {
    production, material, khsx, order, inventory,
    tkbv, pthsp, analysis, yearlyPlan, export: exportData,
    attendance, stock,
  };
  cachedData = payload;
  cachedVersions = versions;
  return { payload, fromCache: false };
};

// --- CACHE IN-MEMORY CHO /api/overview/summary ---
const overviewSummaryCache = new Map<string, { versions: Record<string, string>; payload: any }>();
const OVERVIEW_SUMMARY_VERSION_KEYS = ['order', 'tkbv', 'pthsp', 'inventory', 'export'];

// --- CACHE IN-MEMORY CHO /api/khsx-nhapkho/summary ---
const khsxNhapKhoCache = new Map<string, { versions: Record<string, string>; payload: any }>();
const KHSX_NHAPKHO_VERSION_KEYS = ['khsx', 'inventory'];


app.get('/api/all-data', async (_req: Request, res: Response) => {
  try {
    const { payload } = await refreshAllDataCache();
    res.json(payload);
  } catch (error) {
    console.error('Lỗi khi fetch dữ liệu:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Danh sách các route đơn lẻ
const apiRoutes = [
  { path: '/api/production', table: 'production_status_app' },
  { path: '/api/material', table: 'vat_tu' },
  { path: '/api/khsx', table: 'khsx' },
  { path: '/api/order', table: 'dht' },
  { path: '/api/inventory', table: 'nhap_kho' },
  { path: '/api/tkbv', table: 'tkbv_full' },
  { path: '/api/pthsp', table: 'pthsp_full' },
  { path: '/api/analysis', table: 'phan_tich_kh_th' },
  { path: '/api/yearly-plan', table: 'khsx_nam' },
  { path: '/api/export', table: 'xuat_kho' },
  { path: '/api/attendance', table: 'diem_danh' },
  { path: '/api/stock', table: 'ton_kho' }
];

apiRoutes.forEach(({ path, table }) => {
  app.get(path, async (req: Request, res: Response) => {
    const { updated_after } = req.query;
    const data = await fetchTableData(table, updated_after as string);
    res.json(data);
  });
});

// Route riêng cho trang cần ĐẦY ĐỦ cột
app.get('/api/production/full', async (req: Request, res: Response) => {
  const { updated_after } = req.query;
  try {
    let query = `SELECT * FROM production_status_app`;
    const values: any[] = [];

    const validDate = parseSafeDate(updated_after as string);
    if (validDate) {
      query += ` WHERE updated_at >= $1`;
      values.push(validDate.toISOString());
    }

    const result = await timedQuery(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Lỗi truy vấn production full:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const NOTE_COLUMNS = [
  'tong_hop_ghi_chu_nhap_kho', 'tong_hop_thong_tin_qc', 'tong_hop_ghi_chu_xuat_kho',
  'ghi_chu_don_hang_tong', 'ghi_chu_phieu',
];
const NOTE_PREVIEW_CHARS = 101; // 100 ký tự + 1 để client biết có bị cắt để thêm "..."

// Lấy ghi chú theo danh sách hex. full=false: chỉ 101 ký tự đầu (cho bảng); full=true: nguyên văn (cho xuất CSV)
app.post('/api/production/notes', async (req: Request, res: Response) => {
  try {
    const hexes = Array.isArray(req.body?.hexes)
      ? req.body.hexes.map((h: unknown) => String(h)).filter(Boolean)
      : [];
    if (hexes.length === 0) return res.json({});
    if (hexes.length > 2000) return res.status(400).json({ error: 'Too many hexes' });
    const full = req.body?.full === true;

    const selectCols = NOTE_COLUMNS
      .map(c => full ? `"${c}"` : `LEFT("${c}"::text, ${NOTE_PREVIEW_CHARS}) AS "${c}"`)
      .join(', ');

    const r = await timedQuery(
      `SELECT DISTINCT ON (hex::text) hex::text AS hex, ${selectCols}
       FROM production_status_app
       WHERE hex::text = ANY($1::text[])
       ORDER BY hex::text, updated_at DESC NULLS LAST`,
      [hexes],
      { timeoutMs: 20000 }
    );

    const out: Record<string, Record<string, string | null>> = {};
    r.rows.forEach(row => {
      const { hex, ...rest } = row;
      out[hex] = rest;
    });
    res.json(out);
  } catch (error) {
    console.error('Lỗi /api/production/notes:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- API KIỂM TRA PHIÊN BẢN ---
app.get('/api/check-versions', async (_req: Request, res: Response) => {
  try {
    const versions = await getVersions();
    res.json(versions);
  } catch (error) {
    console.error('Lỗi check version:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

interface TrendTableConfig {
  table: string;
  dateCol: string;
  valueCol: string;
  valueDivisor: number;
  hexCol?: string;
  xuongCol?: string;
  congTrinhCol?: string;
  dvtCol?: string;
  joinProductionForFilters?: boolean;
  xuongViaProductionJoin?: boolean;
  productionJoinCol?: string; // MỚI: cột bên production_status_app dùng để join (mặc định 'hex')
}
const STOCK_TREND_CONFIG: TrendTableConfig = {
  table: 'ton_kho',
  dateCol: 'date_parsed',
  valueCol: 'gia_tri',
  valueDivisor: 1,
  hexCol: 'ma_id_sap',
  congTrinhCol: 'ten_cong_trinh',
  dvtCol: 'dvt',
  joinProductionForFilters: true,
  xuongViaProductionJoin: true,
  productionJoinCol: 'ma_id_sap', // ton_kho <-> production_status_app khớp qua ma_id_sap (giữ nguyên, đã đúng)
};
const ANALYSIS_TABLES: Record<string, TrendTableConfig> = {
  order:     { table: 'dht',        dateCol: 'ngay_nhan_tu_pm', valueCol: 'tri_gia_don_hang_tong', hexCol: 'hex', xuongCol: 'xuong_chinh', congTrinhCol: 'ten_cong_trinh', valueDivisor: 1,  dvtCol: 'dvt', joinProductionForFilters: true, productionJoinCol: 'hex' },
  tkbv:      { table: 'tkbv_full',  dateCol: 'ngay_nhan',       valueCol: 'tri_gia_don_hang_tong', hexCol: 'hex', xuongCol: 'xuong_chinh', congTrinhCol: 'ten_cong_trinh', valueDivisor: 1, joinProductionForFilters: true, productionJoinCol: 'hex' },
  pthsp:     { table: 'pthsp_full', dateCol: 'ngay_hoan_thanh', valueCol: 'tri_gia_don_hang_tong', hexCol: 'hex', xuongCol: 'xuong_chinh', congTrinhCol: 'ten_cong_trinh', valueDivisor: 1, joinProductionForFilters: true, productionJoinCol: 'hex' },
  inventory: { table: 'nhap_kho',   dateCol: 'date',            valueCol: 'thanh_tien_nhap_kho',   hexCol: 'hex', xuongCol: 'xuong_chinh', congTrinhCol: 'ten_cong_trinh', valueDivisor: 1000000, joinProductionForFilters: true, productionJoinCol: 'hex' },
  export:    { table: 'xuat_kho',   dateCol: 'date',            valueCol: 'so_luong_xuat_kho',     hexCol: 'hex', xuongCol: 'xuong_chinh', congTrinhCol: 'ten_cong_trinh', valueDivisor: 1, joinProductionForFilters: true, productionJoinCol: 'hex' },
};
const ALLOWED_ANALYSIS_KEYS = new Set(Object.keys(ANALYSIS_TABLES));
const TREND_SOURCES = new Set([...Object.keys(ANALYSIS_TABLES), 'stock']);

const numericExpr = (col: string) => `
  NULLIF(
    CASE 
      WHEN regexp_replace("${col}"::text, '[^0-9.-]', '', 'g') ~ '^-?[0-9]+(\\.[0-9]+)?$' 
      THEN regexp_replace("${col}"::text, '[^0-9.-]', '', 'g') 
      ELSE NULL 
    END, 
    ''
  )::numeric
`;

// Đặt ngay dưới numericExpr — dùng khi cần alias bảng (trường hợp có JOIN)
const numericExprQualified = (qualifiedCol: string) => `
  NULLIF(
    CASE 
      WHEN regexp_replace(${qualifiedCol}::text, '[^0-9.-]', '', 'g') ~ '^-?[0-9]+(\\.[0-9]+)?$' 
      THEN regexp_replace(${qualifiedCol}::text, '[^0-9.-]', '', 'g') 
      ELSE NULL 
    END, 
    ''
  )::numeric
`;


// Map "table.column" -> tên generated column numeric tương ứng (xem migration 001).
// Khi có trong map, dùng thẳng cột đã tính sẵn (có index) thay vì regex runtime.
const NUMERIC_GENERATED_COLUMNS: Record<string, string> = {
  'dht.tri_gia_don_hang_tong': 'tri_gia_don_hang_tong_num',
  'tkbv_full.tri_gia_don_hang_tong': 'tri_gia_don_hang_tong_num',
  'pthsp_full.tri_gia_don_hang_tong': 'tri_gia_don_hang_tong_num',
  'nhap_kho.thanh_tien_nhap_kho': 'thanh_tien_nhap_kho_num',
  'xuat_kho.so_luong_xuat_kho': 'so_luong_xuat_kho_num',
  'ton_kho.gia_tri': 'gia_tri_num',
  'khsx.thanh_tien_ke_hoach': 'thanh_tien_ke_hoach_num',
  'khsx_nam.thanh_tien_ke_hoach': 'thanh_tien_ke_hoach_num',
};

// Dùng khi KHÔNG có alias bảng (query đơn giản, FROM table trực tiếp)
const numericCol = (table: string, col: string): string => {
  const generated = NUMERIC_GENERATED_COLUMNS[`${table}.${col}`];
  return generated ? `"${generated}"` : numericExpr(col);
};

// Dùng khi CÓ alias bảng (trường hợp JOIN, ví dụ /api/trend với alias "m")
const numericColQualified = (table: string, alias: string, col: string): string => {
  const generated = NUMERIC_GENERATED_COLUMNS[`${table}.${col}`];
  return generated ? `${alias}."${generated}"` : numericExprQualified(`${alias}."${col}"`);
};

// [ĐO TIMING] Endpoint từng mất 34.71s trên Network tab — điểm nóng số 1.
app.get('/api/overview/summary', async (req: Request, res: Response) => {
  try {
    const congTrinhList = String(req.query.congTrinh || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort();
    const xuongList = String(req.query.xuong || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort();
    const tinhTrangList = String(req.query.tinhTrang || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort();
    const tinhTrangIpoList = String(req.query.tinhTrangIpo || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort();
    const needsRoleJoin = tinhTrangList.length > 0 || tinhTrangIpoList.length > 0;

    const cacheKey = JSON.stringify({
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null,
      date: req.query.date || null,
      dates: req.query.dates || null,
      congTrinh: congTrinhList,
      xuong: xuongList,
      tinhTrang: tinhTrangList,
      tinhTrangIpo: tinhTrangIpoList,
    });
     const overviewVersions = await getRelevantVersions(
      needsRoleJoin ? [...OVERVIEW_SUMMARY_VERSION_KEYS, 'production'] : OVERVIEW_SUMMARY_VERSION_KEYS
    );
    const cachedOverview = overviewSummaryCache.get(cacheKey);
    if (cachedOverview && JSON.stringify(cachedOverview.versions) === JSON.stringify(overviewVersions)) {
      return res.json(cachedOverview.payload);
    }

    const hasDateTo = !!(req.query.dateTo || req.query.date);
    const hasDateFrom = !!req.query.dateFrom;

    const explicitDates = String(req.query.dates || '')
      .split(',')
      .map(s => parseSafeDate(s.trim()))
      .filter((d): d is Date => d !== null)
      .map(d => d.toISOString().slice(0, 10));
    const useExplicitDates = explicitDates.length > 0;
    const useAllTime = !hasDateTo && !hasDateFrom && !useExplicitDates;

    const dateToDate = parseSafeDate(req.query.dateTo as string)
      || parseSafeDate(req.query.date as string)
      || new Date();
    const dateFromDate = parseSafeDate(req.query.dateFrom as string) || dateToDate;

    const dateToStr = dateToDate.toISOString().slice(0, 10);
    const dateFromStr = dateFromDate.toISOString().slice(0, 10);
    const monthStart = `${dateToStr.slice(0, 7)}-01`;
    const monthEnd = new Date(Date.UTC(dateToDate.getUTCFullYear(), dateToDate.getUTCMonth() + 1, 0))
      .toISOString().slice(0, 10);

    const prevMonthRef = new Date(Date.UTC(dateToDate.getUTCFullYear(), dateToDate.getUTCMonth() - 1, 1));
    const prevMonthStart = prevMonthRef.toISOString().slice(0, 7) + '-01';
    const prevMonthEnd = new Date(Date.UTC(prevMonthRef.getUTCFullYear(), prevMonthRef.getUTCMonth() + 1, 0))
      .toISOString().slice(0, 10);

    let outerLo = dateFromStr < monthStart ? dateFromStr : monthStart;
    outerLo = prevMonthStart < outerLo ? prevMonthStart : outerLo;
    let outerHi = dateToStr > monthEnd ? dateToStr : monthEnd;
    if (useExplicitDates) {
      const sorted = [...explicitDates].sort();
      outerLo = sorted[0] < outerLo ? sorted[0] : outerLo;
      outerHi = sorted[sorted.length - 1] > outerHi ? sorted[sorted.length - 1] : outerHi;
    }

    const subQueries: string[] = [];
    const allParams: any[] = [];

    // MỚI: mọi bảng nguồn giờ dùng alias 't' cố định để qualify cột an toàn khi có JOIN
    Object.entries(ANALYSIS_TABLES).forEach(([key, cfg]) => {
      const alias = 't';
      const colBare = (name: string) => `${alias}.${name}`;

      let periodCond: string;
      let mtdCond: string;
      let lastMonthCond: string;
      let localParams: any[];

            if (useAllTime) {
        periodCond = 'TRUE';
        mtdCond = `${colBare('date_parsed')} BETWEEN $P1 AND $P2`;
        lastMonthCond = `${colBare('date_parsed')} BETWEEN $P3 AND $P4`;
        localParams = [monthStart, dateToStr, prevMonthStart, prevMonthEnd];
      } else if (useExplicitDates) {
        periodCond = `${colBare('date_parsed')} = ANY($P1::date[])`;
        mtdCond = `${colBare('date_parsed')} BETWEEN $P2 AND $P3`;
        lastMonthCond = `${colBare('date_parsed')} BETWEEN $P4 AND $P5`;
        localParams = [explicitDates, monthStart, dateToStr, prevMonthStart, prevMonthEnd];
      } else {
        periodCond = `${colBare('date_parsed')} BETWEEN $P1 AND $P2`;
        mtdCond = `${colBare('date_parsed')} BETWEEN $P3 AND $P4`;
        lastMonthCond = `${colBare('date_parsed')} BETWEEN $P5 AND $P6`;
        localParams = [dateFromStr, dateToStr, monthStart, monthEnd, prevMonthStart, prevMonthEnd];
      }

      const baseIdx = allParams.length;
      localParams.forEach(p => allParams.push(p));
      const remap = (cond: string) => cond.replace(/\$P(\d+)/g, (_, n) => `$${baseIdx + Number(n)}`);

      const countExpr = `COUNT(DISTINCT ${colBare(cfg.hexCol!)})`;

      const outerConds: string[] = [];
            if (!useAllTime) {
        allParams.push(outerLo, outerHi);
        outerConds.push(`${colBare('date_parsed')} BETWEEN $${allParams.length - 1} AND $${allParams.length}`);
      }
      if (congTrinhList.length && cfg.congTrinhCol) {
        allParams.push(congTrinhList);
        outerConds.push(`UPPER(TRIM(${colBare(cfg.congTrinhCol)})) = ANY($${allParams.length}::text[])`);
      }
      if (xuongList.length && cfg.xuongCol) {
        allParams.push(xuongList);
        outerConds.push(`UPPER(TRIM(${colBare(cfg.xuongCol)})) = ANY($${allParams.length}::text[])`);
      }
      if (needsRoleJoin) {
        if (tinhTrangList.length) {
          allParams.push(tinhTrangList);
          outerConds.push(`UPPER(TRIM(p.tinh_trang)) = ANY($${allParams.length}::text[])`);
        }
        if (tinhTrangIpoList.length) {
          allParams.push(tinhTrangIpoList);
          outerConds.push(`UPPER(TRIM(p.tinh_trang_ipo)) = ANY($${allParams.length}::text[])`);
        }
      }
      const outerWhere = outerConds.length ? outerConds.join(' AND ') : 'TRUE';

      // MỚI: JOIN production_status_app chỉ khi cần lọc tinh_trang/tinh_trang_ipo.
      // LEFT JOIN + filter p.xxx = ANY(...) => dòng không có hex khớp bên production
      // sẽ có p.tinh_trang IS NULL và tự động bị loại (đúng như đã thống nhất).
      const joinClause = needsRoleJoin
        ? `LEFT JOIN production_status_app p ON p."${cfg.productionJoinCol || 'hex'}"::text = ${colBare(cfg.hexCol!)}::text`
        : '';

      subQueries.push(`
        SELECT
          '${key}' AS source_key,
          ${countExpr} FILTER (WHERE ${remap(periodCond)}) AS period_count,
          COALESCE(SUM(${numericColQualified(cfg.table, alias, cfg.valueCol)}) FILTER (WHERE ${remap(periodCond)}), 0) / ${cfg.valueDivisor} AS period_value,
          ${countExpr} FILTER (WHERE ${remap(mtdCond)}) AS mtd_count,
          COALESCE(SUM(${numericColQualified(cfg.table, alias, cfg.valueCol)}) FILTER (WHERE ${remap(mtdCond)}), 0) / ${cfg.valueDivisor} AS mtd_value,
          ${countExpr} FILTER (WHERE ${remap(lastMonthCond)}) AS last_month_count,
          COALESCE(SUM(${numericColQualified(cfg.table, alias, cfg.valueCol)}) FILTER (WHERE ${remap(lastMonthCond)}), 0) / ${cfg.valueDivisor} AS last_month_value
        FROM ${cfg.table} ${alias}
        ${joinClause}
        WHERE ${outerWhere}
      `);
    });

    const finalQuery = subQueries.join('\nUNION ALL\n');
    const r = await timedQuery(finalQuery, allParams);

    const results: Record<string, any> = {};
    r.rows.forEach(row => {
      results[row.source_key] = {
        daily: { count: Number(row.period_count), value: Number(row.period_value) },
        mtd: { count: Number(row.mtd_count), value: Number(row.mtd_value) },
        lastMonth: { count: Number(row.last_month_count), value: Number(row.last_month_value) },
      };
    });

    const overviewPayload = { date: dateToStr, dateFrom: dateFromStr, ...results };
    overviewSummaryCache.set(cacheKey, { versions: overviewVersions, payload: overviewPayload });
    trimCache(overviewSummaryCache);
    res.json(overviewPayload);
  } catch (error) {
    console.error('Lỗi overview/summary:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/overview/by-group', async (req: Request, res: Response) => {
  try {
    const { key, groupBy } = req.query as { key: string; groupBy: string };
    if (!ALLOWED_ANALYSIS_KEYS.has(key)) return res.status(400).json({ error: 'Invalid key' });
    if (groupBy !== 'xuong' && groupBy !== 'congtrinh') return res.status(400).json({ error: 'Invalid groupBy' });

    const cfg = ANALYSIS_TABLES[key];
    const alias = 't';
    const colBare = (name: string) => `${alias}.${name}`;
    const groupColRaw = groupBy === 'congtrinh' ? cfg.congTrinhCol : cfg.xuongCol;
    if (!groupColRaw) return res.json([]);
    const groupCol = colBare(groupColRaw);

    const congTrinhList = String(req.query.congTrinh || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort();
    const xuongList = String(req.query.xuong || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort();
    const tinhTrangList = String(req.query.tinhTrang || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort();
    const tinhTrangIpoList = String(req.query.tinhTrangIpo || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort();
    const needsRoleJoin = tinhTrangList.length > 0 || tinhTrangIpoList.length > 0;

    const explicitDates = String(req.query.dates || '')
      .split(',')
      .map(s => parseSafeDate(s.trim()))
      .filter((d): d is Date => d !== null)
      .map(d => d.toISOString().slice(0, 10));
    const useExplicitDates = explicitDates.length > 0;

    const dateToRaw = parseSafeDate(req.query.dateTo as string) || parseSafeDate(req.query.date as string) || new Date();
    const dateFromRaw = parseSafeDate(req.query.dateFrom as string) || dateToRaw;
    const dateToStr = dateToRaw.toISOString().slice(0, 10);
    const dateFromStr = dateFromRaw.toISOString().slice(0, 10);

    const refDateStr = useExplicitDates ? [...explicitDates].sort().slice(-1)[0] : dateToStr;
    const monthStart = `${refDateStr.slice(0, 7)}-01`;

        const params: any[] = [];
    let periodCond: string;
    if (useExplicitDates) {
      params.push(explicitDates);
      periodCond = `${colBare('date_parsed')} = ANY($1::date[])`;
    } else {
      params.push(dateFromStr, dateToStr);
      periodCond = `${colBare('date_parsed')} BETWEEN $1 AND $2`;
    }
    const monthStartIdx = params.length + 1;
    const refDateIdx = params.length + 2;
    params.push(monthStart, refDateStr);
    const mtdCond = `${colBare('date_parsed')} BETWEEN $${monthStartIdx} AND $${refDateIdx}`;

    const loCandidates = useExplicitDates ? [monthStart, ...explicitDates] : [monthStart, dateFromStr];
    const hiCandidates = useExplicitDates ? [refDateStr, ...explicitDates] : [refDateStr, dateToStr];
    const outerLo = loCandidates.sort()[0];
    const outerHi = hiCandidates.sort().slice(-1)[0];
    const outerLoIdx = params.length + 1;
    const outerHiIdx = params.length + 2;
    params.push(outerLo, outerHi);

    const extraConds: string[] = [];
    if (congTrinhList.length && cfg.congTrinhCol) {
      params.push(congTrinhList);
      extraConds.push(`UPPER(TRIM(${colBare(cfg.congTrinhCol)})) = ANY($${params.length}::text[])`);
    }
    if (xuongList.length && cfg.xuongCol) {
      params.push(xuongList);
      extraConds.push(`UPPER(TRIM(${colBare(cfg.xuongCol)})) = ANY($${params.length}::text[])`);
    }
    if (needsRoleJoin) {
      if (tinhTrangList.length) {
        params.push(tinhTrangList);
        extraConds.push(`UPPER(TRIM(p.tinh_trang)) = ANY($${params.length}::text[])`);
      }
      if (tinhTrangIpoList.length) {
        params.push(tinhTrangIpoList);
        extraConds.push(`UPPER(TRIM(p.tinh_trang_ipo)) = ANY($${params.length}::text[])`);
      }
    }
    const extraWhere = extraConds.length ? ` AND ${extraConds.join(' AND ')}` : '';
    const joinClause = needsRoleJoin
      ? `LEFT JOIN production_status_app p ON p."${cfg.productionJoinCol || 'hex'}"::text = ${colBare(cfg.hexCol!)}::text`
      : '';

       const q = `
      SELECT
        COALESCE(NULLIF(TRIM(${groupCol}), ''), 'Chưa xác định') AS name,
        COUNT(DISTINCT ${colBare(cfg.hexCol!)}) FILTER (WHERE ${periodCond}) AS daily_count,
        COALESCE(SUM(${numericColQualified(cfg.table, alias, cfg.valueCol)}) FILTER (WHERE ${periodCond}), 0) / ${cfg.valueDivisor} AS daily_value,
        COUNT(DISTINCT ${colBare(cfg.hexCol!)}) FILTER (WHERE ${mtdCond}) AS mtd_count,
        COALESCE(SUM(${numericColQualified(cfg.table, alias, cfg.valueCol)}) FILTER (WHERE ${mtdCond}), 0) / ${cfg.valueDivisor} AS mtd_value
      FROM ${cfg.table} ${alias}
      ${joinClause}
      WHERE ${colBare('date_parsed')} BETWEEN $${outerLoIdx} AND $${outerHiIdx}${extraWhere}
      GROUP BY 1
      ORDER BY mtd_value DESC
    `;
    const r = await timedQuery(q, params);
    res.json(
  r.rows
    .map(row => ({
      name: row.name as string,
      dailyCount: Number(row.daily_count),
      dailyValue: Number(row.daily_value),
      mtdCount: Number(row.mtd_count),
      mtdValue: Number(row.mtd_value),
    }))
    .filter(row =>
      row.dailyCount > 0 || row.dailyValue > 0 ||
      row.mtdCount > 0 || row.mtdValue > 0
    )
);
  } catch (error) {
    console.error('Lỗi overview/by-group:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- CACHE IN-MEMORY CHO /api/stock/dates (theo bộ lọc tổng) ---
// TRƯỚC: 1 biến module-level duy nhất (không phân biệt filter).
// SAU: Map key theo bộ lọc, giống overviewSummaryCache/khsxNhapKhoCache.
const stockDatesCache = new Map<string, { versions: Record<string, string>; payload: any }>();

interface StockFilterParams {
  congTrinh: string[];
  xuong: string[];
  tinhTrang: string[];
  tinhTrangIpo: string[];
}
const parseStockFilters = (req: Request): StockFilterParams => ({
  congTrinh: String(req.query.congTrinh || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort(),
  xuong: String(req.query.xuong || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort(),
  tinhTrang: String(req.query.tinhTrang || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort(),
  tinhTrangIpo: String(req.query.tinhTrangIpo || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort(),
});

// [ĐO TIMING] Endpoint từng bị "pending" 25.39s trên production — điểm nóng số 2.
const refreshStockDatesCache = async (filters: StockFilterParams) => {
  const needsJoin = filters.xuong.length > 0 || filters.tinhTrang.length > 0 || filters.tinhTrangIpo.length > 0;
  const cacheKey = JSON.stringify(filters);
  const versions = await getRelevantVersions(needsJoin ? ['stock', 'production'] : ['stock']);

  const cached = stockDatesCache.get(cacheKey);
  if (cached && JSON.stringify(cached.versions) === JSON.stringify(versions)) {
    return { payload: cached.payload, fromCache: true };
  }

  const conds: string[] = ['s.date_parsed IS NOT NULL'];
  const params: any[] = [];
  if (filters.congTrinh.length) {
    params.push(filters.congTrinh);
    conds.push(`UPPER(TRIM(s.ten_cong_trinh)) = ANY($${params.length}::text[])`);
  }

  // SỬA: thay LEFT JOIN trực tiếp trên toàn bộ lịch sử ton_kho (rất nặng, gây
  // statement timeout) bằng CTE lọc TRƯỚC tập ma_id_sap thỏa điều kiện xưởng/
  // tình trạng/IPO từ production_status_app (bảng snapshot hiện tại, nhỏ hơn
  // nhiều và không có nhiều dòng lặp theo ngày như ton_kho), sau đó chỉ INNER
  // JOIN ton_kho với tập ma_id_sap đã lọc sẵn này — giảm chi phí đáng kể.
  let cteClause = '';
  let joinClause = '';
  if (needsJoin) {
    const pConds: string[] = [];
    if (filters.xuong.length) { params.push(filters.xuong); pConds.push(`UPPER(TRIM(xuong_chinh)) = ANY($${params.length}::text[])`); }
    if (filters.tinhTrang.length) { params.push(filters.tinhTrang); pConds.push(`UPPER(TRIM(tinh_trang)) = ANY($${params.length}::text[])`); }
    if (filters.tinhTrangIpo.length) { params.push(filters.tinhTrangIpo); pConds.push(`UPPER(TRIM(tinh_trang_ipo)) = ANY($${params.length}::text[])`); }

    cteClause = `
      WITH matched_ids AS (
        SELECT DISTINCT ma_id_sap FROM production_status_app
        WHERE ma_id_sap IS NOT NULL${pConds.length ? ` AND ${pConds.join(' AND ')}` : ''}
      )
    `;
    joinClause = `INNER JOIN matched_ids m ON m.ma_id_sap::text = s.ma_id_sap::text`;
  }

  const q = `
    ${cteClause}
    SELECT s.date_parsed AS d,
          COUNT(DISTINCT s.ma_id_sap) AS count,
           COALESCE(SUM(${numericColQualified('ton_kho', 's', 'gia_tri')}), 0) AS value
    FROM ton_kho s
    ${joinClause}
    WHERE ${conds.join(' AND ')}
    GROUP BY 1
    ORDER BY 1 DESC
  `;
  const r = await timedQuery(q, params);
  const payload = r.rows.map(row => ({ date: row.d, count: Number(row.count), value: Number(row.value) }));

  stockDatesCache.set(cacheKey, { versions, payload });
  trimCache(stockDatesCache);
  return { payload, fromCache: false };
};

app.get('/api/stock/dates', async (req: Request, res: Response) => {
  try {
    const { payload } = await refreshStockDatesCache(parseStockFilters(req));
    res.json(payload);
  } catch (error) {
    console.error('Lỗi stock/dates:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================================
// WARM-UP ENDPOINT — nay yêu cầu header x-warmup-key + rate limit riêng
// (trước đây public hoàn toàn, có thể bị gọi dồn dập để ép tính lại cache nặng)
// ============================================================================
app.get('/api/warmup', warmupLimiter, requireWarmupSecret, async (_req: Request, res: Response) => {
  const startedAt = Date.now();
  const warmed: string[] = [];
  try {
    const { fromCache: allDataFromCache } = await refreshAllDataCache();
    warmed.push(allDataFromCache ? 'all-data (cached)' : 'all-data (refreshed)');

    // MỚI: chỉ warm-up cache cho trường hợp KHÔNG lọc (mặc định), vì không thể
    // warm trước mọi tổ hợp filter có thể có.
    const { fromCache: stockFromCache } = await refreshStockDatesCache({
      congTrinh: [], xuong: [], tinhTrang: [], tinhTrangIpo: [],
    });
    warmed.push(stockFromCache ? 'stock-dates (cached)' : 'stock-dates (refreshed)');

    res.json({ ok: true, warmed, ms: Date.now() - startedAt });
  } catch (error) {
    console.error('Lỗi warmup:', error);
    res.status(500).json({ ok: false, error: 'Warmup failed' });
  }
});

// Trả về: tồn kho theo công trình, tại 1 ngày cụ thể
app.get('/api/stock/by-project', async (req: Request, res: Response) => {
  try {
    const { date } = req.query as { date: string };
    if (!date) return res.status(400).json({ error: 'Missing date' });

    const filters = parseStockFilters(req);
    const needsJoin = filters.xuong.length > 0 || filters.tinhTrang.length > 0 || filters.tinhTrangIpo.length > 0;

    const conds: string[] = ['s.date_parsed = $1'];
    const params: any[] = [date];
    if (filters.congTrinh.length) {
      params.push(filters.congTrinh);
      conds.push(`UPPER(TRIM(s.ten_cong_trinh)) = ANY($${params.length}::text[])`);
    }

    let cteClause = '';
    let joinClause = '';
    if (needsJoin) {
      const pConds: string[] = [];
      if (filters.xuong.length) { params.push(filters.xuong); pConds.push(`UPPER(TRIM(xuong_chinh)) = ANY($${params.length}::text[])`); }
      if (filters.tinhTrang.length) { params.push(filters.tinhTrang); pConds.push(`UPPER(TRIM(tinh_trang)) = ANY($${params.length}::text[])`); }
      if (filters.tinhTrangIpo.length) { params.push(filters.tinhTrangIpo); pConds.push(`UPPER(TRIM(tinh_trang_ipo)) = ANY($${params.length}::text[])`); }

      cteClause = `
        WITH matched_ids AS (
          SELECT DISTINCT ma_id_sap FROM production_status_app
          WHERE ma_id_sap IS NOT NULL${pConds.length ? ` AND ${pConds.join(' AND ')}` : ''}
        )
      `;
      joinClause = `INNER JOIN matched_ids m ON m.ma_id_sap::text = s.ma_id_sap::text`;
    }

    const q = `
      ${cteClause}
      SELECT COALESCE(NULLIF(TRIM(s.ten_cong_trinh), ''), 'Chưa xác định') AS name,
            COUNT(DISTINCT s.ma_id_sap) AS count,
             COALESCE(SUM(${numericColQualified('ton_kho', 's', 'gia_tri')}), 0) AS value
      FROM ton_kho s
      ${joinClause}
      WHERE ${conds.join(' AND ')}
      GROUP BY 1
      ORDER BY value DESC
    `;
    const r = await timedQuery(q, params);
    res.json(r.rows.map(row => ({ name: row.name, count: Number(row.count), value: Number(row.value) })));
  } catch (error) {
    console.error('Lỗi stock/by-project:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


const STOCK_EXPORT_LABELS: Record<string, string> = {
  id: 'ID',
  date: 'NGÀY',
  gia_tri: 'GIÁ TRỊ TỒN KHO',
  ma_id_sap: 'MÃ ID SAP',
  hex: 'HEX',
  ten_cong_trinh: 'TÊN CÔNG TRÌNH',
  updated_at: 'CẬP NHẬT LÚC',
};

const csvEscape = (value: any): string => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};
const stockExportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Xuất tồn kho quá nhiều lần, vui lòng thử lại sau' },
});

app.get('/api/stock/export/csv', stockExportLimiter, async (req: Request, res: Response) => {
  try {
    const datesParam = String(req.query.dates || '').trim();
    const allCols = REPORT_COLUMNS.ton_kho;
    const requestedCols = String(req.query.cols || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    const cols = requestedCols.length > 0
      ? requestedCols.filter(c => allCols.includes(c))
      : allCols;
    if (cols.length === 0) return res.status(400).json({ error: 'Không có cột hợp lệ' });

    const selectClause = cols.map(c => `"${c}"`).join(', ');
    const params: any[] = [];
    let whereClause = '';
    let fileSuffix = 'Toan_Bo';

    if (datesParam) {
      // MỚI: validate từng ngày bằng parseSafeDate (nhất quán với các route khác),
      // và chuẩn hóa về YYYY-MM-DD trước khi dùng làm tham số SQL lẫn tên file —
      // tránh lỗi cast Postgres mơ hồ và tránh giá trị lạ lọt vào header response.
      const dates = datesParam
        .split(',')
        .map(s => parseSafeDate(s.trim()))
        .filter((d): d is Date => d !== null)
        .map(d => d.toISOString().slice(0, 10));

      if (dates.length === 0) {
        return res.status(400).json({ error: 'Danh sách ngày không hợp lệ' });
      }

      params.push(dates);
      whereClause = `WHERE date_parsed = ANY($1::date[])`;
      fileSuffix = dates.length === 1 ? `Moc_${dates[0]}` : `${dates.length}_Moc_Thoi_Gian`;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Ton_Kho_${fileSuffix}_${new Date().toISOString().slice(0, 10)}.csv"`
    );

    res.write('\uFEFF');
    res.write(cols.map(c => csvEscape(STOCK_EXPORT_LABELS[c] || c.toUpperCase())).join(',') + '\r\n');

    const BATCH_SIZE = 5000;
    let offset = 0;
    while (true) {
      const query = `
        SELECT ${selectClause} FROM ton_kho
        ${whereClause}
        ORDER BY id
        LIMIT ${BATCH_SIZE} OFFSET ${offset}
      `;
      const result = await timedQuery(query, params);
      if (result.rows.length === 0) break;

      const chunk = result.rows
        .map(row => cols.map(c => csvEscape(row[c])).join(','))
        .join('\r\n') + '\r\n';
      res.write(chunk);

      offset += BATCH_SIZE;
      if (result.rows.length < BATCH_SIZE) break;
    }

    res.end();
  } catch (error) {
    console.error('Lỗi stock/export/csv:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Internal Server Error' });
    else res.end();
  }
});

// --- CACHE IN-MEMORY CHO /api/stock/total-count ---
let cachedStockTotalCount: number | null = null;
let cachedStockTotalCountVersion: string | null = null;

app.get('/api/stock/total-count', async (_req: Request, res: Response) => {
  try {
    const verResult = await timedQuery(
      `SELECT last_updated FROM table_versions WHERE table_name = 'ton_kho'`
    );
    const currentVersion = verResult.rows[0]?.last_updated
      ? String(verResult.rows[0].last_updated)
      : null;

    if (cachedStockTotalCount !== null && currentVersion && currentVersion === cachedStockTotalCountVersion) {
      return res.json({ total: cachedStockTotalCount });
    }

    // COUNT(*) thật — khớp đúng số dòng mà /api/stock/export/csv (scope ALL) sẽ trả về
    const r = await timedQuery(`SELECT COUNT(*) AS total FROM ton_kho`);
    const total = Number(r.rows[0].total);

    cachedStockTotalCount = total;
    cachedStockTotalCountVersion = currentVersion;
    res.json({ total });
  } catch (error) {
    console.error('Lỗi stock/total-count:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Trả về: kế hoạch năm, quý, thực hiện, theo xưởng.
// Trước đây năm 2026 bị hardcode trong SQL — giờ nhận qua path param ?/:year, mặc định năm hiện tại.
// [ĐO TIMING] 4 query chạy song song (giới hạn 2) — đổi cả 4 sang timedQuery.
app.get(['/api/revenue', '/api/revenue/:year'], async (req: Request, res: Response) => {
  try {
    const yearParam = Number(req.params.year);
    const year = Number.isInteger(yearParam) && yearParam > 2000 && yearParam < 2100
      ? yearParam
      : DEFAULT_REVENUE_YEAR;

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    // TRƯỚC: Promise.all([...4 query...]) → xin 4 connection cùng lúc.
    // SAU: giới hạn 2 song song.
    const [planQ, actualQ, byWorkshopPlanQ, byWorkshopActualQ] = await runWithLimit([
      () => timedQuery(`
        SELECT
          COALESCE(SUM(${numericCol('khsx_nam', 'thanh_tien_ke_hoach')}), 0) AS total,
          COALESCE(SUM(${numericCol('khsx_nam', 'thanh_tien_ke_hoach')})
            FILTER (WHERE NULLIF(regexp_replace(thang::text, '[^0-9]', '', 'g'), '')::int BETWEEN 1 AND 3), 0) AS q1,
          COALESCE(SUM(${numericCol('khsx_nam', 'thanh_tien_ke_hoach')})
            FILTER (WHERE NULLIF(regexp_replace(thang::text, '[^0-9]', '', 'g'), '')::int BETWEEN 1 AND 6), 0) AS q2,
          COALESCE(SUM(${numericCol('khsx_nam', 'thanh_tien_ke_hoach')})
            FILTER (WHERE NULLIF(regexp_replace(thang::text, '[^0-9]', '', 'g'), '')::int BETWEEN 1 AND 9), 0) AS q3
              FROM khsx_nam WHERE nam = $1::bigint
      `, [String(year)]),

      () => timedQuery(`
        SELECT COALESCE(SUM(${numericCol('nhap_kho', 'thanh_tien_nhap_kho')}), 0) AS total
        FROM nhap_kho
        WHERE date_parsed BETWEEN $1 AND $2
      `, [yearStart, yearEnd]),

      () => timedQuery(`
        SELECT CASE WHEN xuong_chinh = ANY($1::text[]) THEN xuong_chinh ELSE 'KHÁC' END AS name,
               COALESCE(SUM(${numericCol('khsx_nam', 'thanh_tien_ke_hoach')}), 0) AS plan
        FROM khsx_nam WHERE nam = $2::bigint
        GROUP BY 1
      `, [TARGET_WORKSHOPS, String(year)]),

      () => timedQuery(`
        SELECT CASE WHEN xuong_chinh = ANY($1::text[]) THEN xuong_chinh ELSE 'KHÁC' END AS name,
               COALESCE(SUM(${numericCol('nhap_kho', 'thanh_tien_nhap_kho')}), 0) AS actual
        FROM nhap_kho
        WHERE date_parsed BETWEEN $2 AND $3
        GROUP BY 1
      `, [TARGET_WORKSHOPS, yearStart, yearEnd]),
    ], 2);

    const targetTotal = Number(planQ.rows[0].total);
    const actualTotal = Number(actualQ.rows[0].total) / VND_TO_TY;

    const workshopMap: Record<string, { plan: number; actual: number }> = {};
    byWorkshopPlanQ.rows.forEach(r => { workshopMap[r.name] = { plan: Number(r.plan), actual: 0 }; });
    byWorkshopActualQ.rows.forEach(r => {
      if (!workshopMap[r.name]) workshopMap[r.name] = { plan: 0, actual: 0 };
      workshopMap[r.name].actual = Number(r.actual) / VND_TO_TY;
    });

    const byWorkshop = Object.entries(workshopMap)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => (a.name === 'KHÁC' ? 1 : b.name === 'KHÁC' ? -1 : a.name.localeCompare(b.name)));

    res.json({
      year,
      targetRevenue2026: targetTotal,
      quarterlyTargets: { q1: Number(planQ.rows[0].q1), q2: Number(planQ.rows[0].q2), q3: Number(planQ.rows[0].q3), q4: targetTotal },
      actual: { value: actualTotal, percent: targetTotal > 0 ? (actualTotal / targetTotal) * 100 : 0 },
      byWorkshop,
    });
  } catch (error) {
    console.error('Lỗi revenue:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
// ============================================================================
// VIEW PROJECT MAPPING — danh sách công trình đã setup cho từng view (Luồng
// đỏ, Căn mẫu...), lưu tập trung ở DB thay vì localStorage để mọi người dùng
// truy cập web ở bất kỳ máy nào đều thấy cùng 1 cấu hình do admin setup.
// ============================================================================
const viewMappingSchema = z.object({
  projects: z.array(z.string()),
});

// GET: public (mọi user cần đọc để lọc đúng dữ liệu view của họ, không cần đăng nhập admin)
app.get('/api/view-project-mapping', async (_req: Request, res: Response) => {
  try {
    const r = await timedQuery(`SELECT view_id, projects FROM view_project_mapping`);
    const mapping: Record<string, string[]> = {};
    r.rows.forEach(row => {
      mapping[row.view_id] = Array.isArray(row.projects) ? row.projects : [];
    });
    res.json(mapping);
  } catch (error) {
    console.error('Lỗi view-project-mapping GET:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST: chỉ ADMIN được sửa — lưu (upsert) danh sách công trình cho 1 view
app.post(
  '/api/view-project-mapping/:viewId',
  authenticateJWT,
  requireRole('ADMIN'),
  validateBody(viewMappingSchema),
  async (req: Request, res: Response) => {
    try {
      const { viewId } = req.params;
      const { projects } = req.body;

      await pool.query(
        `INSERT INTO view_project_mapping (view_id, projects, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (view_id) DO UPDATE
         SET projects = EXCLUDED.projects, updated_at = now()`,
        [viewId, JSON.stringify(projects)]
      );

      res.json({ success: true, message: 'Đã lưu setup' });
    } catch (error) {
      console.error('Lỗi view-project-mapping POST:', error);
      res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
    }
  }
);
// ============================================================================
// AUTH API — TRUY XUẤT BẢNG users TRONG POSTGRES
// (Giữ nguyên pool.query — không phải điểm nóng, không cần đo timing)
// ============================================================================

// --- ĐĂNG NHẬP (nay phát hành JWT) ---
app.post('/api/auth/login', loginLimiter, validateBody(loginSchema), async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    const result = await pool.query(
      `SELECT id, username, password_hash, full_name, email, role, permissions, is_active
       FROM users WHERE username = $1`,
      [username]
    );

    const user = result.rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại hoặc đã bị khóa' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Sai tên đăng nhập hoặc mật khẩu' });
    }

    const token = signAuthToken({ id: user.id, username: user.username, role: user.role });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        permissions: user.permissions || [],
      },
    });
  } catch (error) {
    console.error('Lỗi đăng nhập:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// --- QUÊN MẬT KHẨU: GỬI OTP ---
// Trả cùng 1 message dù email tồn tại hay không, tránh lộ danh sách email có tài khoản.
app.post('/api/auth/forgot-password', otpRequestLimiter, validateBody(forgotPasswordSchema), async (req: Request, res: Response) => {
  const genericMessage = 'Nếu email tồn tại trong hệ thống, mã OTP đã được gửi tới email đó';
  try {
    const { email } = req.body;

    const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

   if (user) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await pool.query(
    `UPDATE users SET otp_code = $1, otp_expires_at = $2, updated_at = now() WHERE id = $3`,
    [otp, expiresAt, user.id]
  );

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[DEV] OTP cho ${email}: ${otp}`);
  }
  // TODO: gọi service gửi email thật ở đây khi có (nodemailer/SES/...)
}

    res.json({ success: true, message: genericMessage });
  } catch (error) {
    console.error('Lỗi gửi OTP:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// --- XÁC THỰC OTP + ĐỔI MẬT KHẨU ---
app.post('/api/auth/verify-otp', otpVerifyLimiter, validateBody(verifyOtpSchema), async (req: Request, res: Response) => {
  try {
    const { email, otp, newPassword } = req.body;

    const result = await pool.query(
      `SELECT id, otp_code, otp_expires_at FROM users WHERE email = $1`,
      [email]
    );
    const user = result.rows[0];

    if (!user || user.otp_code !== otp) {
      return res.status(400).json({ success: false, message: 'Mã OTP không đúng' });
    }
    if (!user.otp_expires_at || new Date(user.otp_expires_at) < new Date()) {
      return res.status(400).json({ success: false, message: 'Mã OTP đã hết hạn' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      `UPDATE users SET password_hash = $1, otp_code = NULL, otp_expires_at = NULL, updated_at = now() WHERE id = $2`,
      [newHash, user.id]
    );

    res.json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (error) {
    console.error('Lỗi xác thực OTP:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// --- ĐỔI MẬT KHẨU (khi đã đăng nhập, biết mật khẩu cũ) ---
// Nay yêu cầu JWT hợp lệ + chỉ được tự đổi mật khẩu của chính mình (hoặc admin).
app.post(
  '/api/auth/change-password',
  authenticateJWT,
  requireSelfOrRole((req) => req.body?.username, 'ADMIN'),
  validateBody(changePasswordSchema),
  async (req: Request, res: Response) => {
    try {
      const { username, oldPassword, newPassword } = req.body;

      const result = await pool.query(
        `SELECT id, password_hash FROM users WHERE username = $1`,
        [username]
      );
      const user = result.rows[0];
      if (!user) {
        return res.status(404).json({ success: false, message: 'Tài khoản không tồn tại' });
      }

      const isMatch = await bcrypt.compare(oldPassword, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Mật khẩu cũ không đúng' });
      }

      const newHash = await bcrypt.hash(newPassword, 12);
      await pool.query(
        `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`,
        [newHash, user.id]
      );

      res.json({ success: true, message: 'Đổi mật khẩu thành công' });
    } catch (error) {
      console.error('Lỗi đổi mật khẩu:', error);
      res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
    }
  }
);

// ============================================================================
// USERS API — nay yêu cầu JWT + role ADMIN cho toàn bộ (trước đây public hoàn toàn)
// (Giữ nguyên pool.query — CRUD nhỏ, không phải điểm nóng)
// ============================================================================
const usersRouter = express.Router();
usersRouter.use(authenticateJWT, requireRole('ADMIN'));

// --- LẤY DANH SÁCH USER (có phân trang) ---
usersRouter.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
    const offset = (page - 1) * pageSize;

    const [countResult, result] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query(
        `SELECT id, username, full_name, email, role, permissions,
                msnv, department, note, is_active, created_at, updated_at
         FROM users ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      ),
    ]);

    const users = result.rows.map(u => ({
      id: u.id,
      username: u.username,
      fullName: u.full_name,
      email: u.email,
      role: u.role,
      permissions: u.permissions || [],
      msnv: u.msnv,
      department: u.department,
      note: u.note,
      status: u.is_active ? 'ACTIVE' : 'INACTIVE',
      createdAt: u.created_at,
      updatedAt: u.updated_at,
    }));

    res.json({
      success: true,
      data: users,
      pagination: { page, pageSize, total: Number(countResult.rows[0].count) },
    });
  } catch (error) {
    console.error('Lỗi lấy danh sách user:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// --- THÊM USER MỚI ---
usersRouter.post('/', validateBody(createUserSchema), async (req: Request, res: Response) => {
  try {
    const { username, password, fullName, email, role, permissions, msnv, department, note, status } = req.body;

    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Tên đăng nhập đã tồn tại' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const isActive = status !== 'INACTIVE';

    const result = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, email, role, permissions, msnv, department, note, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, username, full_name, email, role, permissions, msnv, department, note, is_active, created_at`,
      [username, passwordHash, fullName, email || null, role || 'USER', permissions || [], msnv || null, department || null, note || null, isActive]
    );

    const u = result.rows[0];
    res.json({
      success: true,
      message: 'Tạo user thành công',
      data: {
        id: u.id, username: u.username, fullName: u.full_name, email: u.email,
        role: u.role, permissions: u.permissions || [], msnv: u.msnv,
        department: u.department, note: u.note, status: u.is_active ? 'ACTIVE' : 'INACTIVE',
      },
    });
  } catch (error) {
    console.error('Lỗi tạo user:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// --- CẬP NHẬT USER ---
usersRouter.put('/:id', validateBody(updateUserSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, fullName, email, role, permissions, msnv, department, note, status } = req.body;

    const existing = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
    }

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    const push = (col: string, val: any) => { fields.push(`${col} = $${idx}`); values.push(val); idx++; };

    if (fullName !== undefined) push('full_name', fullName);
    if (email !== undefined) push('email', email || null);
    if (role !== undefined) push('role', role);
    if (permissions !== undefined) push('permissions', permissions || []);
    if (msnv !== undefined) push('msnv', msnv || null);
    if (department !== undefined) push('department', department || null);
    if (note !== undefined) push('note', note || null);
    if (status !== undefined) push('is_active', status === 'ACTIVE');

    if (password) {
      const passwordHash = await bcrypt.hash(password, 12);
      push('password_hash', passwordHash);
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'Không có dữ liệu để cập nhật' });
    }

    fields.push(`updated_at = now()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, username, full_name, email, role, permissions, msnv, department, note, is_active`,
      values
    );

    const u = result.rows[0];
    res.json({
      success: true,
      message: 'Cập nhật thành công',
      data: {
        id: u.id, username: u.username, fullName: u.full_name, email: u.email,
        role: u.role, permissions: u.permissions || [], msnv: u.msnv,
        department: u.department, note: u.note, status: u.is_active ? 'ACTIVE' : 'INACTIVE',
      },
    });
  } catch (error) {
    console.error('Lỗi cập nhật user:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// --- XÓA USER ---
usersRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const target = await pool.query('SELECT username FROM users WHERE id = $1', [id]);
    if (target.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
    }
    if (target.rows[0].username === 'admin') {
      return res.status(403).json({ success: false, message: 'Không thể xóa tài khoản admin' });
    }

    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true, message: 'Xóa user thành công' });
  } catch (error) {
    console.error('Lỗi xóa user:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

app.use('/api/users', usersRouter);

// [ĐO TIMING] Endpoint tổng hợp phức tạp — 2 query chính (khQuery, thQuery).
app.get('/api/khsx-nhapkho/summary', async (req: Request, res: Response) => {
  try {
    const { nam, thang, mode = 'month', tuan, ngay, congTrinh, xuong } = req.query as Record<string, string>;
    if (!nam) return res.status(400).json({ error: 'Missing nam' });

    const khsxCacheKey = JSON.stringify({ nam, thang, mode, tuan, ngay, congTrinh, xuong });
    const khsxVersions = await getRelevantVersions(KHSX_NHAPKHO_VERSION_KEYS);
    const cachedKhsx = khsxNhapKhoCache.get(khsxCacheKey);
    if (cachedKhsx && JSON.stringify(cachedKhsx.versions) === JSON.stringify(khsxVersions)) {
      return res.json(cachedKhsx.payload);
    }

    const isWeek = mode === 'week';
    const phanLoaiPattern = isWeek ? '%TUẦN%' : '%THÁNG%';

    const normalize = (s: string) => s.trim().toUpperCase();
    const congTrinhList = congTrinh ? congTrinh.split(',').map(s => normalize(s)).filter(Boolean) : [];
    const xuongList = xuong ? xuong.split(',').map(s => normalize(s)).filter(Boolean) : [];

        const khParams: any[] = [phanLoaiPattern, nam];
    let khWhere = `WHERE UPPER(TRIM(phan_loai_kh)) LIKE $1 AND nam = $2::bigint`;
    if (thang) { khParams.push(thang); khWhere += ` AND thang = $${khParams.length}::bigint`; }
    if (isWeek && tuan) { khParams.push(tuan); khWhere += ` AND tuan = $${khParams.length}::double precision`; }
    if (isWeek && ngay) { khParams.push(ngay); khWhere += ` AND ngay = $${khParams.length}::double precision`; }
    if (congTrinhList.length) { khParams.push(congTrinhList); khWhere += ` AND UPPER(TRIM(ten_cong_trinh)) = ANY($${khParams.length}::text[])`; }
    if (xuongList.length) { khParams.push(xuongList); khWhere += ` AND UPPER(TRIM(xuong_chinh)) = ANY($${khParams.length}::text[])`; }

    const khQuery = `
      SELECT
        TRIM(xuong_chinh) AS xuong,
        TRIM(ten_cong_trinh) AS cong_trinh,
        TRIM(ma_cong_trinh) AS ma_cong_trinh,
        COALESCE(SUM(${numericCol('khsx', 'thanh_tien_ke_hoach')}), 0) / 1000 AS gia_tri
      FROM khsx
      ${khWhere}
      GROUP BY TRIM(xuong_chinh), TRIM(ten_cong_trinh), TRIM(ma_cong_trinh)
    `;
    const khResult = await timedQuery(khQuery, khParams);

       const thParams: any[] = [nam];
    let thWhere = `WHERE nam = $1::bigint`;
    if (thang) { thParams.push(thang); thWhere += ` AND thang = $${thParams.length}::bigint`; }
    if (isWeek && tuan) { thParams.push(tuan); thWhere += ` AND tuan = $${thParams.length}::bigint`; }
    if (isWeek && ngay) { thParams.push(ngay); thWhere += ` AND ngay = $${thParams.length}::bigint`; }
    if (congTrinhList.length) { thParams.push(congTrinhList); thWhere += ` AND UPPER(TRIM(ten_cong_trinh)) = ANY($${thParams.length}::text[])`; }
    if (xuongList.length) { thParams.push(xuongList); thWhere += ` AND UPPER(TRIM(xuong_chinh)) = ANY($${thParams.length}::text[])`; }

    const thQuery = `
      SELECT
        TRIM(xuong_chinh) AS xuong,
        TRIM(ten_cong_trinh) AS cong_trinh,
        TRIM(ma_cong_trinh) AS ma_cong_trinh,
        COALESCE(SUM(${numericCol('nhap_kho', 'thanh_tien_nhap_kho')}), 0) / ${VND_TO_TY} AS gia_tri
      FROM nhap_kho
      ${thWhere}
      GROUP BY TRIM(xuong_chinh), TRIM(ten_cong_trinh), TRIM(ma_cong_trinh)
    `;
    const thResult = await timedQuery(thQuery, thParams);

    const xuongMap = new Map<string, { kh: number; th: number }>();
    khResult.rows.forEach(r => {
      const k = r.xuong || 'Chưa xác định';
      const e = xuongMap.get(k) || { kh: 0, th: 0 };
      e.kh += Number(r.gia_tri);
      xuongMap.set(k, e);
    });
    thResult.rows.forEach(r => {
      const k = r.xuong || 'Chưa xác định';
      const e = xuongMap.get(k) || { kh: 0, th: 0 };
      e.th += Number(r.gia_tri);
      xuongMap.set(k, e);
    });
    const byXuong = Array.from(xuongMap.entries())
      .map(([xuong, v]) => ({ xuong, kh: Number(v.kh.toFixed(2)), th: Number(v.th.toFixed(2)) }))
      .sort((a, b) => a.xuong.localeCompare(b.xuong));

    const ctMap = new Map<string, { code: string; kh: number; th: number }>();
    khResult.rows.forEach(r => {
      const k = r.cong_trinh || 'Chưa xác định';
      const e = ctMap.get(k) || { code: r.ma_cong_trinh || '', kh: 0, th: 0 };
      e.kh += Number(r.gia_tri);
      if (r.ma_cong_trinh) e.code = r.ma_cong_trinh;
      ctMap.set(k, e);
    });
    thResult.rows.forEach(r => {
      const k = r.cong_trinh || 'Chưa xác định';
      const e = ctMap.get(k) || { code: r.ma_cong_trinh || '', kh: 0, th: 0 };
      e.th += Number(r.gia_tri);
      if (r.ma_cong_trinh && !e.code) e.code = r.ma_cong_trinh;
      ctMap.set(k, e);
    });
    const byCongTrinh = Array.from(ctMap.entries())
      .map(([name, v]) => ({ name, code: v.code || name, kh: Number(v.kh.toFixed(2)), th: Number(v.th.toFixed(2)) }))
      .sort((a, b) => Math.max(b.kh, b.th) - Math.max(a.kh, a.th))
      .slice(0, 10);

    const totalKh = byXuong.reduce((a, b) => a + b.kh, 0);
    const totalTh = byXuong.reduce((a, b) => a + b.th, 0);
    const completionRate = totalKh > 0 ? (totalTh / totalKh) * 100 : 0;

       const khsxPayload = {
      totalKh: Number(totalKh.toFixed(2)),
      totalTh: Number(totalTh.toFixed(2)),
      completionRate: Number(completionRate.toFixed(1)),
      byXuong,
      byCongTrinh,
    };
    khsxNhapKhoCache.set(khsxCacheKey, { versions: khsxVersions, payload: khsxPayload });
    trimCache(khsxNhapKhoCache);
    res.json(khsxPayload);
  } catch (error) {
    console.error('Lỗi khsx-nhapkho/summary:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// [ĐO TIMING] Dùng chung cho biểu đồ trend của mọi bảng lớn (dht, nhap_kho, xuat_kho, tkbv_full, pthsp_full, ton_kho).
app.get('/api/trend', async (req: Request, res: Response) => {
  try {
    const source = req.query.source as string;
    if (!TREND_SOURCES.has(source)) return res.status(400).json({ error: 'Invalid source' });

    const cfg: TrendTableConfig = source === 'stock' ? STOCK_TREND_CONFIG : ANALYSIS_TABLES[source];
    const isStock = source === 'stock';

    const granularity = (req.query.granularity as string) || 'day';
    const truncUnit = granularity === 'week' ? 'week' : granularity === 'month' ? 'month' : 'day';

    const dateFrom = parseSafeDate(req.query.dateFrom as string);
    const dateTo = parseSafeDate(req.query.dateTo as string);
    const explicitDates = isStock ? [] : parseExplicitDates(req); // [DATES FIX]
    const xuong = (req.query.xuong as string) || '';
    const congTrinh = (req.query.congTrinh as string) || '';
    const dvt = (req.query.dvt as string) || '';
    const phanLoai = (req.query.phanLoai as string) || '';

    const needsDvtJoin = !!(dvt && !cfg.dvtCol);
    const needsPhanLoaiJoin = !!phanLoai;
    const needsXuongJoin = !!(xuong && !cfg.xuongCol && cfg.xuongViaProductionJoin);
    const needsJoin = !!(cfg.joinProductionForFilters && cfg.hexCol && (needsDvtJoin || needsPhanLoaiJoin || needsXuongJoin));

    const mainAlias = needsJoin ? 'm' : '';
    const colBare = (name: string) => (mainAlias ? `${mainAlias}.${name}` : name);

    const conditions: string[] = [`${colBare(cfg.dateCol)} IS NOT NULL`];
    const params: any[] = [];

    // [SNAPSHOT FIX]
    if (isStock) {
      conditions.push(buildStockSnapshotCondition(cfg.table, colBare(cfg.dateCol), cfg.dateCol, dateTo, params));
    } else {
      // [DATES FIX] Ưu tiên danh sách ngày rời rạc nếu có
      applyNonStockDateFilter(colBare(cfg.dateCol), explicitDates, dateFrom, dateTo, conditions, params);
    }

    // [FILTER FIX] chuẩn hóa UPPER/TRIM
    if (xuong) {
      if (cfg.xuongCol) {
        params.push(xuong); conditions.push(eqNormalized(colBare(cfg.xuongCol), params.length));
      } else if (cfg.xuongViaProductionJoin) {
        params.push(xuong); conditions.push(eqNormalized('p.xuong_chinh', params.length));
      }
    }
    if (congTrinh && cfg.congTrinhCol) {
      params.push(congTrinh); conditions.push(eqNormalized(colBare(cfg.congTrinhCol), params.length));
    }
    applyCtWhitelist(req, cfg.congTrinhCol ? colBare(cfg.congTrinhCol) : undefined, conditions, params);
    if (dvt) {
      if (cfg.dvtCol) {
        params.push(dvt); conditions.push(eqNormalized(colBare(cfg.dvtCol), params.length));
      } else if (needsJoin) {
        params.push(dvt); conditions.push(eqNormalized('p.dvt', params.length));
      }
    }
    if (phanLoai && needsJoin) { params.push(phanLoai); conditions.push(`p.phan_loai_nhom_san_pham = $${params.length}`); }

    // [DATES FIX] Có dates rời rạc thì không áp limit mặc định — hiển thị đúng các
    // ngày đã chọn, dù ít hay nhiều.
    const useDefaultLimit = !dateFrom && !dateTo && explicitDates.length === 0;
    const limit = granularity === 'day' ? 15 : 12;

    const countExpr = cfg.hexCol ? `COUNT(DISTINCT ${colBare(cfg.hexCol)})` : `COUNT(*)`;
    const valueExpr = needsJoin
      ? `SUM(${numericColQualified(cfg.table, mainAlias, cfg.valueCol)})`
      : `SUM(${numericCol(cfg.table, cfg.valueCol)})`;
    const joinKey = cfg.productionJoinCol || 'hex';
    const joinClause = needsJoin ? `LEFT JOIN p ON p."${joinKey}"::text = ${colBare(cfg.hexCol!)}::text` : '';

    const cteList: string[] = [];
    if (needsJoin) cteList.push(buildMatchedProductionCTE(joinKey));

    // [COUNT FIX] Số HEX DUY NHẤT trên CẢ KHOẢNG (không phải cộng dồn từng cột) —
    // để badge "Tổng" ở client không đếm trùng 1 HEX xuất hiện ở nhiều kỳ khác nhau.
    // Không áp dụng cho stock (snapshot, không có khái niệm "trùng theo ngày").
    const distinctTotalExpr = (!isStock && cfg.hexCol)
      ? `(SELECT ${countExpr} FROM ${cfg.table} ${mainAlias} ${joinClause} WHERE ${conditions.join(' AND ')})`
      : 'NULL::bigint';

    let q: string;
    if (isStock && truncUnit !== 'day') {
      cteList.push(`
        period_dates AS (
          SELECT date_trunc('${truncUnit}', ${colBare(cfg.dateCol)})::date AS period,
                 MAX(${colBare(cfg.dateCol)}) AS snap_date
          FROM ${cfg.table} ${mainAlias}
          ${joinClause}
          WHERE ${conditions.join(' AND ')}
          GROUP BY 1
        )
      `);
      q = `
        WITH ${cteList.join(',\n')}
        SELECT
          pd.period AS period,
          COALESCE(${valueExpr}, 0) / ${cfg.valueDivisor} AS total_value,
          ${countExpr} AS total_count,
          NULL::bigint AS distinct_total_count
        FROM period_dates pd
        JOIN ${cfg.table} ${mainAlias} ON ${colBare(cfg.dateCol)} = pd.snap_date
        ${joinClause}
        WHERE ${conditions.join(' AND ')} AND ${colBare(cfg.dateCol)} = pd.snap_date
        GROUP BY pd.period
        ORDER BY pd.period ${useDefaultLimit ? 'DESC' : 'ASC'}
        ${useDefaultLimit ? `LIMIT ${limit}` : ''}
      `;
    } else {
      const withClause = cteList.length ? `WITH ${cteList.join(',\n')}` : '';
      q = `
        ${withClause}
        SELECT
          date_trunc('${truncUnit}', ${colBare(cfg.dateCol)})::date AS period,
          COALESCE(${valueExpr}, 0) / ${cfg.valueDivisor} AS total_value,
          ${countExpr} AS total_count,
          ${distinctTotalExpr} AS distinct_total_count
        FROM ${cfg.table} ${mainAlias}
        ${joinClause}
        WHERE ${conditions.join(' AND ')}
        GROUP BY 1
        ORDER BY 1 ${useDefaultLimit ? 'DESC' : 'ASC'}
        ${useDefaultLimit ? `LIMIT ${limit}` : ''}
      `;
    }
    const r = await timedQuery(q, params);
    const rows = (useDefaultLimit ? r.rows.reverse() : r.rows).map(row => ({
      period: row.period,
      total: Number(row.total_value),
      totalCount: Number(row.total_count),
      ...(row.distinct_total_count != null ? { distinctTotalCount: Number(row.distinct_total_count) } : {}),
    }));
    res.json(rows);
  } catch (error) {
    console.error('Lỗi /api/trend:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// [ĐO TIMING] 4 route filters/* — đang mất 2-3.6s bất thường trong log dù query rất nhẹ.
// Danh sách các giá trị xưởng distinct, dùng cho dropdown filter
app.get('/api/filters/xuong', async (_req: Request, res: Response) => {
  try {
    const q = `
      SELECT DISTINCT ON (UPPER(TRIM(name))) TRIM(name) AS name
      FROM (
        SELECT xuong_chinh AS name FROM khsx WHERE xuong_chinh IS NOT NULL AND TRIM(xuong_chinh) <> ''
        UNION ALL
        SELECT xuong_chinh FROM dht WHERE xuong_chinh IS NOT NULL AND TRIM(xuong_chinh) <> ''
        UNION ALL
        SELECT xuong_chinh FROM nhap_kho WHERE xuong_chinh IS NOT NULL AND TRIM(xuong_chinh) <> ''
        UNION ALL
        SELECT xuong_chinh FROM xuat_kho WHERE xuong_chinh IS NOT NULL AND TRIM(xuong_chinh) <> ''
        UNION ALL
        SELECT xuong_chinh FROM tkbv_full WHERE xuong_chinh IS NOT NULL AND TRIM(xuong_chinh) <> ''
        UNION ALL
        SELECT xuong_chinh FROM pthsp_full WHERE xuong_chinh IS NOT NULL AND TRIM(xuong_chinh) <> ''
        UNION ALL
        SELECT xuong_chinh FROM production_status_app WHERE xuong_chinh IS NOT NULL AND TRIM(xuong_chinh) <> ''
      ) t
      ORDER BY UPPER(TRIM(name)), name
    `;
    const r = await timedQuery(q);
    res.json(r.rows.map(row => ({ code: row.name, name: row.name })));
  } catch (error) {
    console.error('Lỗi filters/xuong:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Danh sách công trình distinct, dùng cho dropdown filter
app.get('/api/filters/cong-trinh', async (_req: Request, res: Response) => {
  try {
    const q = `
      SELECT DISTINCT ON (UPPER(TRIM(name))) TRIM(name) AS name
      FROM (
        SELECT ten_cong_trinh AS name FROM khsx WHERE ten_cong_trinh IS NOT NULL AND TRIM(ten_cong_trinh) <> ''
        UNION ALL
        SELECT ten_cong_trinh FROM dht WHERE ten_cong_trinh IS NOT NULL AND TRIM(ten_cong_trinh) <> ''
        UNION ALL
        SELECT ten_cong_trinh FROM nhap_kho WHERE ten_cong_trinh IS NOT NULL AND TRIM(ten_cong_trinh) <> ''
        UNION ALL
        SELECT ten_cong_trinh FROM xuat_kho WHERE ten_cong_trinh IS NOT NULL AND TRIM(ten_cong_trinh) <> ''
        UNION ALL
        SELECT ten_cong_trinh FROM tkbv_full WHERE ten_cong_trinh IS NOT NULL AND TRIM(ten_cong_trinh) <> ''
        UNION ALL
        SELECT ten_cong_trinh FROM pthsp_full WHERE ten_cong_trinh IS NOT NULL AND TRIM(ten_cong_trinh) <> ''
        UNION ALL
        SELECT ten_cong_trinh FROM ton_kho WHERE ten_cong_trinh IS NOT NULL AND TRIM(ten_cong_trinh) <> ''
      ) t
      ORDER BY UPPER(TRIM(name)), name
    `;
    const r = await timedQuery(q);
    res.json(r.rows.map(row => ({ code: row.name, name: row.name })));
  } catch (error) {
    console.error('Lỗi filters/cong-trinh:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Danh sách đơn vị tính (dvt) distinct từ dht — dùng cho dropdown filter Đơn hàng mới
app.get('/api/filters/dvt', async (_req: Request, res: Response) => {
  try {
    const q = `
      SELECT DISTINCT UPPER(TRIM(dvt)) AS name FROM dht
      WHERE dvt IS NOT NULL AND TRIM(dvt) <> ''
      UNION
      SELECT DISTINCT UPPER(TRIM(dvt)) AS name FROM ton_kho
      WHERE dvt IS NOT NULL AND TRIM(dvt) <> ''
      ORDER BY 1
    `;
    const r = await timedQuery(q);
    res.json(r.rows.map(row => ({ code: row.name, name: row.name })));
  } catch (error) {
    console.error('Lỗi filters/dvt:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Danh sách phân loại nhóm sản phẩm distinct từ production_status_app — dùng cho dropdown filter
app.get('/api/filters/phan-loai-nhom-san-pham', async (_req: Request, res: Response) => {
  try {
    const q = `
      SELECT DISTINCT TRIM(phan_loai_nhom_san_pham) AS name
      FROM production_status_app
      WHERE phan_loai_nhom_san_pham IS NOT NULL AND TRIM(phan_loai_nhom_san_pham) <> ''
      ORDER BY 1
    `;
    const r = await timedQuery(q);
    res.json(r.rows.map(row => ({ code: row.name, name: row.name })));
  } catch (error) {
    console.error('Lỗi filters/phan-loai-nhom-san-pham:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// [ĐO TIMING] Trả về: tổng hợp theo XƯỞNG (không group theo thời gian) — dùng cho biểu đồ so sánh xưởng
app.get('/api/trend-by-xuong', async (req: Request, res: Response) => {
  try {
    const source = req.query.source as string;
    if (!TREND_SOURCES.has(source)) return res.status(400).json({ error: 'Invalid source' });

    const cfg: TrendTableConfig = source === 'stock' ? STOCK_TREND_CONFIG : ANALYSIS_TABLES[source];
    if (!cfg.xuongCol && !cfg.xuongViaProductionJoin) {
      return res.json([]);
    }
    const isStock = source === 'stock';

    const dateFrom = parseSafeDate(req.query.dateFrom as string);
    const dateTo = parseSafeDate(req.query.dateTo as string);
    const xuong = (req.query.xuong as string) || '';
    const congTrinh = (req.query.congTrinh as string) || '';
    const dvt = (req.query.dvt as string) || '';
    const phanLoai = (req.query.phanLoai as string) || '';

    const needsDvtJoin = !!(dvt && !cfg.dvtCol);
    const needsPhanLoaiJoin = !!phanLoai;
    const needsXuongJoin = !!(cfg.xuongViaProductionJoin && !cfg.xuongCol);
    const needsJoin = !!(cfg.joinProductionForFilters && cfg.hexCol && (needsDvtJoin || needsPhanLoaiJoin || needsXuongJoin));

    const mainAlias = needsJoin ? 'm' : '';
    const colBare = (name: string) => (mainAlias ? `${mainAlias}.${name}` : name);

    const conditions: string[] = [`${colBare(cfg.dateCol)} IS NOT NULL`];
    const params: any[] = [];

        if (isStock) {
      conditions.push(buildStockSnapshotCondition(cfg.table, colBare(cfg.dateCol), cfg.dateCol, dateTo, params));
    } else {
      applyNonStockDateFilter(colBare(cfg.dateCol), parseExplicitDates(req), dateFrom, dateTo, conditions, params); // [DATES FIX]
    }

    if (xuong) {
      if (cfg.xuongCol) {
        params.push(xuong); conditions.push(eqNormalized(colBare(cfg.xuongCol), params.length));
      } else if (cfg.xuongViaProductionJoin) {
        params.push(xuong); conditions.push(eqNormalized('p.xuong_chinh', params.length));
      }
    }
    if (congTrinh && cfg.congTrinhCol) {
      params.push(congTrinh); conditions.push(eqNormalized(colBare(cfg.congTrinhCol), params.length));
    }
    applyCtWhitelist(req, cfg.congTrinhCol ? colBare(cfg.congTrinhCol) : undefined, conditions, params);
    if (dvt) {
      if (cfg.dvtCol) {
        params.push(dvt); conditions.push(eqNormalized(colBare(cfg.dvtCol), params.length));
      } else if (needsJoin) {
        params.push(dvt); conditions.push(eqNormalized('p.dvt', params.length));
      }
    }
    if (phanLoai && needsJoin) { params.push(phanLoai); conditions.push(`p.phan_loai_nhom_san_pham = $${params.length}`); }

    const countExpr = cfg.hexCol ? `COUNT(DISTINCT ${colBare(cfg.hexCol)})` : `COUNT(*)`;
    const valueExpr = needsJoin
      ? `SUM(${numericColQualified(cfg.table, mainAlias, cfg.valueCol)})`
      : `SUM(${numericCol(cfg.table, cfg.valueCol)})`;
    const joinKey = cfg.productionJoinCol || 'hex';
    const joinClause = needsJoin ? `LEFT JOIN p ON p."${joinKey}"::text = ${colBare(cfg.hexCol!)}::text` : '';
    const withClause = needsJoin ? `WITH ${buildMatchedProductionCTE(joinKey)}` : '';

    const xuongExpr = cfg.xuongCol ? colBare(cfg.xuongCol) : 'p.xuong_chinh';

    const q = `
      ${withClause}
      SELECT
        COALESCE(NULLIF(TRIM(${xuongExpr}), ''), 'TỒN KHO KHÁC') AS xuong,
        COALESCE(${valueExpr}, 0) / ${cfg.valueDivisor} AS total_value,
        ${countExpr} AS total_count
      FROM ${cfg.table} ${mainAlias}
      ${joinClause}
      WHERE ${conditions.join(' AND ')}
      GROUP BY 1
      ORDER BY total_value DESC
    `;
    const r = await timedQuery(q, params);
    const rows = r.rows.map(row => ({
      xuongCode: row.xuong,
      xuongName: row.xuong,
      total: Number(row.total_value),
      totalCount: Number(row.total_count),
    }));
    res.json(rows);
  } catch (error) {
    console.error('Lỗi /api/trend-by-xuong:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// [ĐO TIMING] Trả về: tổng hợp theo CÔNG TRÌNH (không group theo thời gian) — dùng cho biểu đồ so sánh công trình
app.get('/api/trend-by-congtrinh', async (req: Request, res: Response) => {
  try {
    const source = req.query.source as string;
    if (!TREND_SOURCES.has(source)) return res.status(400).json({ error: 'Invalid source' });

    const cfg: TrendTableConfig = source === 'stock' ? STOCK_TREND_CONFIG : ANALYSIS_TABLES[source];
    if (!cfg.congTrinhCol) {
      return res.json([]);
    }
    const isStock = source === 'stock';

    const dateFrom = parseSafeDate(req.query.dateFrom as string);
    const dateTo = parseSafeDate(req.query.dateTo as string);
    const xuong = (req.query.xuong as string) || '';
    const congTrinh = (req.query.congTrinh as string) || '';
    const dvt = (req.query.dvt as string) || '';
    const phanLoai = (req.query.phanLoai as string) || '';

    const needsDvtJoin = !!(dvt && !cfg.dvtCol);
    const needsPhanLoaiJoin = !!phanLoai;
    const needsXuongJoin = !!(xuong && !cfg.xuongCol && cfg.xuongViaProductionJoin);
    const needsJoin = !!(cfg.joinProductionForFilters && cfg.hexCol && (needsDvtJoin || needsPhanLoaiJoin || needsXuongJoin));

    const mainAlias = needsJoin ? 'm' : '';
    const colBare = (name: string) => (mainAlias ? `${mainAlias}.${name}` : name);

    const conditions: string[] = [`${colBare(cfg.dateCol)} IS NOT NULL`];
    const params: any[] = [];

        if (isStock) {
      conditions.push(buildStockSnapshotCondition(cfg.table, colBare(cfg.dateCol), cfg.dateCol, dateTo, params));
    } else {
      applyNonStockDateFilter(colBare(cfg.dateCol), parseExplicitDates(req), dateFrom, dateTo, conditions, params); // [DATES FIX]
    }

    if (xuong) {
      if (cfg.xuongCol) {
        params.push(xuong); conditions.push(eqNormalized(colBare(cfg.xuongCol), params.length));
      } else if (cfg.xuongViaProductionJoin) {
        params.push(xuong); conditions.push(eqNormalized('p.xuong_chinh', params.length));
      }
    }
    if (congTrinh && cfg.congTrinhCol) {
      params.push(congTrinh); conditions.push(eqNormalized(colBare(cfg.congTrinhCol), params.length));
    }
    applyCtWhitelist(req, cfg.congTrinhCol ? colBare(cfg.congTrinhCol) : undefined, conditions, params);
    if (dvt) {
      if (cfg.dvtCol) {
        params.push(dvt); conditions.push(eqNormalized(colBare(cfg.dvtCol), params.length));
      } else if (needsJoin) {
        params.push(dvt); conditions.push(eqNormalized('p.dvt', params.length));
      }
    }
    if (phanLoai && needsJoin) { params.push(phanLoai); conditions.push(`p.phan_loai_nhom_san_pham = $${params.length}`); }

    const countExpr = cfg.hexCol ? `COUNT(DISTINCT ${colBare(cfg.hexCol)})` : `COUNT(*)`;
    const valueExpr = needsJoin
      ? `SUM(${numericColQualified(cfg.table, mainAlias, cfg.valueCol)})`
      : `SUM(${numericCol(cfg.table, cfg.valueCol)})`;
    const joinKey = cfg.productionJoinCol || 'hex';
    const joinClause = needsJoin ? `LEFT JOIN p ON p."${joinKey}"::text = ${colBare(cfg.hexCol!)}::text` : '';
    const withClause = needsJoin ? `WITH ${buildMatchedProductionCTE(joinKey)}` : '';

    const q = `
      ${withClause}
      SELECT
        COALESCE(NULLIF(TRIM(${colBare(cfg.congTrinhCol)}), ''), 'Chưa xác định') AS cong_trinh,
        COALESCE(${valueExpr}, 0) / ${cfg.valueDivisor} AS total_value,
        ${countExpr} AS total_count
      FROM ${cfg.table} ${mainAlias}
      ${joinClause}
      WHERE ${conditions.join(' AND ')}
      GROUP BY 1
      ORDER BY total_value DESC
    `;
    const r = await timedQuery(q, params);
    const rows = r.rows.map(row => ({
      congTrinhCode: row.cong_trinh,
      congTrinhName: row.cong_trinh,
      total: Number(row.total_value),
      totalCount: Number(row.total_count),
    }));
    res.json(rows);
  } catch (error) {
    console.error('Lỗi /api/trend-by-congtrinh:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// [MỚI - ĐÃ SỬA JOIN] Trả về: tổng hợp theo ĐƠN VỊ TÍNH (DVT)
app.get('/api/trend-by-dvt', async (req: Request, res: Response) => {
  try {
    const source = req.query.source as string;
    if (!TREND_SOURCES.has(source)) return res.status(400).json({ error: 'Invalid source' });

    const cfg: TrendTableConfig = source === 'stock' ? STOCK_TREND_CONFIG : ANALYSIS_TABLES[source];
    const isStock = source === 'stock';

    const dateFrom = parseSafeDate(req.query.dateFrom as string);
    const dateTo = parseSafeDate(req.query.dateTo as string);
    const xuong = (req.query.xuong as string) || '';
    const congTrinh = (req.query.congTrinh as string) || '';
    const dvt = (req.query.dvt as string) || '';
    const phanLoai = (req.query.phanLoai as string) || '';

    const needsDvtJoin = !cfg.dvtCol;
    const needsPhanLoaiJoin = !!phanLoai;
    const needsXuongJoin = !!(xuong && !cfg.xuongCol && cfg.xuongViaProductionJoin);
    const needsJoin = !!(cfg.joinProductionForFilters && cfg.hexCol && (needsDvtJoin || needsPhanLoaiJoin || needsXuongJoin));

    const mainAlias = needsJoin ? 'm' : '';
    const colBare = (name: string) => (mainAlias ? `${mainAlias}.${name}` : name);

    const conditions: string[] = [`${colBare(cfg.dateCol)} IS NOT NULL`];
    const params: any[] = [];

        if (isStock) {
      conditions.push(buildStockSnapshotCondition(cfg.table, colBare(cfg.dateCol), cfg.dateCol, dateTo, params));
    } else {
      applyNonStockDateFilter(colBare(cfg.dateCol), parseExplicitDates(req), dateFrom, dateTo, conditions, params); // [DATES FIX]
    }

    if (xuong) {
      if (cfg.xuongCol) {
        params.push(xuong); conditions.push(eqNormalized(colBare(cfg.xuongCol), params.length));
      } else if (cfg.xuongViaProductionJoin) {
        params.push(xuong); conditions.push(eqNormalized('p.xuong_chinh', params.length));
      }
    }
    if (congTrinh && cfg.congTrinhCol) {
      params.push(congTrinh); conditions.push(eqNormalized(colBare(cfg.congTrinhCol), params.length));
    }
    applyCtWhitelist(req, cfg.congTrinhCol ? colBare(cfg.congTrinhCol) : undefined, conditions, params);  
    if (dvt) {
      if (cfg.dvtCol) {
        params.push(dvt); conditions.push(eqNormalized(colBare(cfg.dvtCol), params.length));
      } else if (needsJoin) {
        params.push(dvt); conditions.push(eqNormalized('p.dvt', params.length));
      }
    }
    if (phanLoai && needsJoin) { params.push(phanLoai); conditions.push(`p.phan_loai_nhom_san_pham = $${params.length}`); }

    const countExpr = cfg.hexCol ? `COUNT(DISTINCT ${colBare(cfg.hexCol)})` : `COUNT(*)`;
    const valueExpr = needsJoin
      ? `SUM(${numericColQualified(cfg.table, mainAlias, cfg.valueCol)})`
      : `SUM(${numericCol(cfg.table, cfg.valueCol)})`;
    const joinKey = cfg.productionJoinCol || 'hex';
    const joinClause = needsJoin ? `LEFT JOIN p ON p."${joinKey}"::text = ${colBare(cfg.hexCol!)}::text` : '';
    const withClause = needsJoin ? `WITH ${buildMatchedProductionCTE(joinKey)}` : '';

    const dvtExpr = cfg.dvtCol ? colBare(cfg.dvtCol) : 'p.dvt';

    const q = `
      ${withClause}
      SELECT
        COALESCE(NULLIF(UPPER(TRIM(${dvtExpr})), ''), 'Chưa xác định') AS dvt,
        COALESCE(${valueExpr}, 0) / ${cfg.valueDivisor} AS total_value,
        ${countExpr} AS total_count
      FROM ${cfg.table} ${mainAlias}
      ${joinClause}
      WHERE ${conditions.join(' AND ')}
      GROUP BY 1
      ORDER BY total_value DESC
    `;
    const r = await timedQuery(q, params);
    const rows = r.rows.map(row => ({
      dvtCode: row.dvt,
      dvtName: row.dvt,
      total: Number(row.total_value),
      totalCount: Number(row.total_count),
    }));
    res.json(rows);
  } catch (error) {
    console.error('Lỗi /api/trend-by-dvt:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// [MỚI - ĐÃ SỬA JOIN] Trả về: tổng hợp theo PHÂN LOẠI NHÓM SẢN PHẨM
app.get('/api/trend-by-phanloai', async (req: Request, res: Response) => {
  try {
    const source = req.query.source as string;
    if (!TREND_SOURCES.has(source)) return res.status(400).json({ error: 'Invalid source' });

    const cfg: TrendTableConfig = source === 'stock' ? STOCK_TREND_CONFIG : ANALYSIS_TABLES[source];
    if (!cfg.joinProductionForFilters || !cfg.hexCol) {
      return res.json([]);
    }
    const isStock = source === 'stock';

    const dateFrom = parseSafeDate(req.query.dateFrom as string);
    const dateTo = parseSafeDate(req.query.dateTo as string);
    const xuong = (req.query.xuong as string) || '';
    const congTrinh = (req.query.congTrinh as string) || '';
    const dvt = (req.query.dvt as string) || '';
    const phanLoai = (req.query.phanLoai as string) || '';   // ← THÊM DÒNG NÀY
    const mainAlias = 'm';
    const colBare = (name: string) => `${mainAlias}.${name}`;

    const conditions: string[] = [`${colBare(cfg.dateCol)} IS NOT NULL`];
    const params: any[] = [];

        if (isStock) {
      conditions.push(buildStockSnapshotCondition(cfg.table, colBare(cfg.dateCol), cfg.dateCol, dateTo, params));
    } else {
      applyNonStockDateFilter(colBare(cfg.dateCol), parseExplicitDates(req), dateFrom, dateTo, conditions, params); // [DATES FIX]
    }

    if (xuong) {
      if (cfg.xuongCol) {
        params.push(xuong); conditions.push(eqNormalized(colBare(cfg.xuongCol), params.length));
      } else if (cfg.xuongViaProductionJoin) {
        params.push(xuong); conditions.push(eqNormalized('p.xuong_chinh', params.length));
      }
    }
    if (congTrinh && cfg.congTrinhCol) {
      params.push(congTrinh); conditions.push(eqNormalized(colBare(cfg.congTrinhCol), params.length));
    }
    applyCtWhitelist(req, cfg.congTrinhCol ? colBare(cfg.congTrinhCol) : undefined, conditions, params);
    if (dvt) {
      if (cfg.dvtCol) {
        params.push(dvt); conditions.push(eqNormalized(colBare(cfg.dvtCol), params.length));
      } else {
        params.push(dvt); conditions.push(eqNormalized('p.dvt', params.length));
      }
    }
    if (phanLoai) {                                          // ← THÊM KHỐI NÀY
     params.push(phanLoai);
     conditions.push(`p.phan_loai_nhom_san_pham = $${params.length}`);
   }

    const countExpr = `COUNT(DISTINCT ${colBare(cfg.hexCol)})`;
    const valueExpr = `SUM(${numericColQualified(cfg.table, mainAlias, cfg.valueCol)})`;
    const joinKey = cfg.productionJoinCol || 'hex';
    const joinClause = `LEFT JOIN p ON p."${joinKey}"::text = ${colBare(cfg.hexCol!)}::text`;
    const withClause = `WITH ${buildMatchedProductionCTE(joinKey)}`;

    const q = `
      ${withClause}
      SELECT
        COALESCE(NULLIF(TRIM(p.phan_loai_nhom_san_pham), ''), 'Chưa xác định') AS phan_loai,
        COALESCE(${valueExpr}, 0) / ${cfg.valueDivisor} AS total_value,
        ${countExpr} AS total_count
      FROM ${cfg.table} ${mainAlias}
      ${joinClause}
      WHERE ${conditions.join(' AND ')}
      GROUP BY 1
      ORDER BY total_value DESC
    `;
    const r = await timedQuery(q, params);
    const rows = r.rows.map(row => ({
      phanLoaiCode: row.phan_loai,
      phanLoaiName: row.phan_loai,
      total: Number(row.total_value),
      totalCount: Number(row.total_count),
    }));
    res.json(rows);
  } catch (error) {
    console.error('Lỗi /api/trend-by-phanloai:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================================
// [MỚI] KHUNG NHÌN CHI TIẾT DỮ LIỆU — dùng cho tính năng "con mắt" trên 4 loại
// biểu đồ (theo thời gian, theo xưởng, theo công trình, theo ĐVT/phân loại).
// Khi người dùng bấm chọn 1 cột rồi bấm icon con mắt, frontend gọi endpoint
// này để lấy TOÀN BỘ dòng dữ liệu gốc khớp với giá trị cột đó + bộ lọc hiện
// tại (không lấy full toàn bộ bảng).
// ============================================================================
const DETAIL_DIMENSIONS = new Set(['period', 'xuong', 'congtrinh', 'dvt', 'phanloai']);

// MỚI: các nhãn "sentinel" mà /api/trend-by-* trả về thay cho giá trị gốc khi
// cột NULL/rỗng (xem COALESCE(NULLIF(...), '<nhãn>') ở các route đó). Khi người
// dùng bấm "Xem chi tiết" trên đúng cột này, value gửi lên sẽ là chuỗi nhãn đó
// chứ không phải giá trị thật trong DB (vì giá trị thật là NULL/rỗng) — nên
// không thể so `= value` như bình thường, phải chuyển thành điều kiện IS NULL
// hoặc rỗng.
const UNKNOWN_VALUE_LABELS = new Set(['CHƯA XÁC ĐỊNH', 'TỒN KHO KHÁC']);
const isUnknownValueLabel = (v: string) => UNKNOWN_VALUE_LABELS.has(v.trim().toUpperCase());

app.get('/api/detail', async (req: Request, res: Response) => {
  try {
    const source = req.query.source as string;
    if (!TREND_SOURCES.has(source)) return res.status(400).json({ error: 'Invalid source' });

    const dimension = (req.query.dimension as string) || '';
    if (!DETAIL_DIMENSIONS.has(dimension)) return res.status(400).json({ error: 'Invalid dimension' });

    const value = ((req.query.value as string) || '').trim();
    if (!value) return res.status(400).json({ error: 'Missing value' });

    const cfg: TrendTableConfig = source === 'stock' ? STOCK_TREND_CONFIG : ANALYSIS_TABLES[source];
    const isStock = source === 'stock';
    const granularity = (req.query.granularity as string) || 'day';

    const xuong = (req.query.xuong as string) || '';
    const congTrinh = (req.query.congTrinh as string) || '';
    const dvt = (req.query.dvt as string) || '';
    const phanLoai = (req.query.phanLoai as string) || '';
    const dateFrom = parseSafeDate(req.query.dateFrom as string);
    const dateTo = parseSafeDate(req.query.dateTo as string);

    const needsDvtJoin = dimension === 'dvt' ? !cfg.dvtCol : !!(dvt && !cfg.dvtCol);
    const needsPhanLoaiJoin = dimension === 'phanloai' || !!phanLoai;
    const needsXuongJoin = dimension === 'xuong'
      ? (!cfg.xuongCol && !!cfg.xuongViaProductionJoin)
      : !!(xuong && !cfg.xuongCol && cfg.xuongViaProductionJoin);
    const needsJoin = !!(cfg.joinProductionForFilters && cfg.hexCol && (needsDvtJoin || needsPhanLoaiJoin || needsXuongJoin));

    const alias = needsJoin ? 'm' : '';
    const colBare = (name: string) => (alias ? `${alias}.${name}` : name);

    const conditions: string[] = [`${colBare(cfg.dateCol)} IS NOT NULL`];
    const params: any[] = [];

    // Chiều thời gian
      // [DATES FIX] Danh sách ngày rời rạc — dùng cho cả nhánh 'period' lẫn các
    // chiều khác (xưởng/công trình/ĐVT/phân loại), trừ stock (snapshot).
    const explicitDates = isStock ? [] : parseExplicitDates(req);

    // Chiều thời gian
    if (dimension === 'period') {
      const { start, end } = getPeriodRangeFromKey(value, granularity);
      if (isStock && granularity !== 'day') {
        // [SNAPSHOT FIX] Khớp đúng cách /api/trend tính cột tuần/tháng: chỉ lấy
        // ĐÚNG 1 ngày đại diện (mới nhất trong kỳ) — không liệt kê cả tuần/tháng.
        params.push(start, end);
        conditions.push(
          `${colBare(cfg.dateCol)} = (SELECT MAX(${cfg.dateCol}) FROM ${cfg.table} WHERE ${cfg.dateCol} BETWEEN $${params.length - 1} AND $${params.length})`
        );
      } else if (!isStock && granularity === 'day' && explicitDates.length > 0) {
        // [DATES FIX] Bấm xem chi tiết 1 cột ngày: cột đó (value) đã LÀ 1 ngày cụ
        // thể, nên chỉ cần khớp đúng ngày đó — không cần lọc thêm theo explicitDates
        // (start/end đã đúng đúng 1 ngày rồi). Giữ điều kiện BETWEEN start/end như
        // nhánh mặc định bên dưới cho nhất quán.
        params.push(start, end);
        conditions.push(`${colBare(cfg.dateCol)} BETWEEN $${params.length - 1} AND $${params.length}`);
      } else {
        params.push(start, end);
        conditions.push(`${colBare(cfg.dateCol)} BETWEEN $${params.length - 1} AND $${params.length}`);
      }
    } else if (isStock) {
      // [SNAPSHOT FIX] Các chiều khác (xưởng/công trình/ĐVT/phân loại): tồn kho
      // luôn chỉ xem đúng 1 ngày đại diện, không liệt kê nhiều ngày snapshot.
      conditions.push(buildStockSnapshotCondition(cfg.table, colBare(cfg.dateCol), cfg.dateCol, dateTo, params));
    } else {
      // [DATES FIX] Bấm xem chi tiết 1 cột xưởng/công trình/ĐVT/phân loại: phải lọc
      // đúng tập ngày người dùng đang chọn ở "Bộ lọc ngày chung", không phải cả
      // khoảng [dateFrom, dateTo] liên tục (nếu không sẽ lại lệch giống lỗi ban đầu).
      applyNonStockDateFilter(colBare(cfg.dateCol), explicitDates, dateFrom, dateTo, conditions, params);
    }

    const emptyCond = (colExpr: string) => `(${colExpr} IS NULL OR TRIM(${colExpr}::text) = '')`;

    // Chiều xưởng — [FILTER FIX] chuẩn hóa UPPER/TRIM
    if (dimension === 'xuong') {
      const colExpr = cfg.xuongCol ? colBare(cfg.xuongCol) : (cfg.xuongViaProductionJoin ? 'p.xuong_chinh' : null);
      if (colExpr) {
        if (isUnknownValueLabel(value)) {
          conditions.push(emptyCond(colExpr));
        } else {
          params.push(value); conditions.push(eqNormalized(colExpr, params.length));
        }
      }
    } else if (xuong) {
      if (cfg.xuongCol) { params.push(xuong); conditions.push(eqNormalized(colBare(cfg.xuongCol), params.length)); }
      else if (cfg.xuongViaProductionJoin) { params.push(xuong); conditions.push(eqNormalized('p.xuong_chinh', params.length)); }
    }

    // Chiều công trình
    if (dimension === 'congtrinh' && cfg.congTrinhCol) {
      if (isUnknownValueLabel(value)) {
        conditions.push(emptyCond(colBare(cfg.congTrinhCol)));
      } else {
        params.push(value); conditions.push(eqNormalized(colBare(cfg.congTrinhCol), params.length));
      }
    } else if (congTrinh && cfg.congTrinhCol) {
      params.push(congTrinh); conditions.push(eqNormalized(colBare(cfg.congTrinhCol), params.length));
    }
    applyCtWhitelist(req, cfg.congTrinhCol ? colBare(cfg.congTrinhCol) : undefined, conditions, params);
    // Chiều ĐVT
    if (dimension === 'dvt') {
      const colExpr = cfg.dvtCol ? colBare(cfg.dvtCol) : 'p.dvt';
      if (isUnknownValueLabel(value)) {
        conditions.push(emptyCond(colExpr));
      } else {
        params.push(value); conditions.push(eqNormalized(colExpr, params.length));
      }
    } else if (dvt) {
      if (cfg.dvtCol) { params.push(dvt); conditions.push(eqNormalized(colBare(cfg.dvtCol), params.length)); }
      else if (needsJoin) { params.push(dvt); conditions.push(eqNormalized('p.dvt', params.length)); }
    }

    // Chiều phân loại nhóm sản phẩm
    if (dimension === 'phanloai') {
      if (isUnknownValueLabel(value)) {
        conditions.push(emptyCond('p.phan_loai_nhom_san_pham'));
      } else {
        params.push(value); conditions.push(`p.phan_loai_nhom_san_pham = $${params.length}`);
      }
    } else if (phanLoai && needsJoin) {
      params.push(phanLoai); conditions.push(`p.phan_loai_nhom_san_pham = $${params.length}`);
    }

    const joinKey = cfg.productionJoinCol || 'hex';
    const joinClause = needsJoin
      ? `LEFT JOIN p ON p."${joinKey}"::text = ${colBare(cfg.hexCol!)}::text`
      : '';
    const withClause = needsJoin ? `WITH ${buildMatchedProductionCTE(joinKey)}` : '';

    const cols = REPORT_COLUMNS[cfg.table] || [];
    if (cols.length === 0) return res.status(400).json({ error: 'Bảng không được hỗ trợ' });
    const selectClause = cols.map(c => `${alias ? `${alias}.` : ''}"${c}"`).join(', ');

    const DETAIL_LIMIT = 500;
    const q = `
      ${withClause}
      SELECT ${selectClause}
      FROM ${cfg.table} ${alias}
      ${joinClause}
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${colBare(cfg.dateCol)} DESC
      LIMIT ${DETAIL_LIMIT + 1}
    `;
    const r = await timedQuery(q, params);
    const truncated = r.rows.length > DETAIL_LIMIT;
    const rows = truncated ? r.rows.slice(0, DETAIL_LIMIT) : r.rows;

    res.json({ rows, columns: cols, truncated });
  } catch (error) {
    console.error('Lỗi /api/detail:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- LẤY THÔNG TIN USER HIỆN TẠI TỪ TOKEN (dùng để refresh state, không tin snapshot cũ) ---
// (Giữ nguyên pool.query — nhẹ, chạy trên bảng users nhỏ)
app.get('/api/auth/me', authenticateJWT, async (req: Request, res: Response) => {
  try {
    // req.user chỉ chứa id/username/role từ token — cần query DB để lấy dữ liệu mới nhất
    // (role, permissions, status... có thể đã bị admin đổi sau khi token được phát hành)
    const result = await pool.query(
      `SELECT id, username, full_name, email, role, permissions, is_active
       FROM users WHERE id = $1`,
      [req.user!.id]
    );

    const user = result.rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại hoặc đã bị khóa' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        permissions: user.permissions || [],
      },
    });
  } catch (error) {
    console.error('Lỗi /api/auth/me:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// --- 404 cho các route không khớp ---
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Không tìm thấy endpoint' });
});

// --- ERROR HANDLER TẬP TRUNG (bắt cả lỗi từ CORS callback) ---
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Lỗi không được xử lý:', err);
  res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;