import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z, ZodSchema } from 'zod';
import { pool } from '../src/db.js';

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
    'id', 'hex', 'tinh_trang', 'tinh_trang_ipo',
    'gia_tri_don_hang_con_lai', 'gia_tri_con_lai',
    'ten_cong_trinh', 'xuong_chinh', 'ten_hang_muc',
    'so_ngay_cd_hien_tai', 'bop',
    'tri_gia_don_hang_tong', 'thanh_tien_tinh_phieu', 'thanh_tien_nhap_kho_luy_ke',
    'updated_at'
  ],
  vat_tu: [
    'id', 'trang_thai', 'nguoi_tao', 'nguoi_yeu_cau',
    'ten_cong_trinh', 'so_pr', 'pr_line', 'ma_vat_tu_sap', 'ten_vat_tu',
    'so_luong_yeu_cau', 'dvt', 'ngay_pr', 'nhom_vt', 'so_po',
    'item_note_pr', 'ngay_du_kien_giao_hang_pmh_nhap',
    'so_luong_da_nhan_sap', 'so_luong_con_lai', 'tinh_trang_po',
    'ghi_chu_tinh_trang_po', 'thanh_tien', 'ngay_ve',
    'sl_hang_ve_thuc_te', 'updated_at',
    'team_pr_note',
  ],
  khsx: [
    'id', 'xuong_chinh', 'ten_cong_trinh', 'ma_cong_trinh', 'thanh_tien_ke_hoach',
    'phan_loai_kh', 'nam', 'thang', 'ngay', 'tuan',
    'updated_at'
  ],
  nhap_kho: [
    'id', 'thanh_tien_nhap_kho', 'xuong_chinh', 'ten_cong_trinh', 'ma_cong_trinh',
    'nam', 'thang', 'ngay', 'date', 'hex', 'tuan',
    'updated_at'
  ],
  xuat_kho: [
    'id', 'hex', 'so_luong_xuat_kho', 'date', 'xuong_chinh', 'ten_cong_trinh',
    'updated_at'
  ],
  ton_kho: [
    'id', 'date', 'gia_tri', 'ma_id_sap', 'ten_cong_trinh',
    'updated_at'
  ],
  dht: [
    'id', 'hex', 'ngay_nhan_tu_pm', 'tri_gia_don_hang_tong', 'xuong_chinh', 'ten_cong_trinh',
    'updated_at'
  ],
  tkbv_full: [
    'id', 'ngay_nhan', 'tri_gia_don_hang_tong', 'hex', 'xuong_chinh', 'ten_cong_trinh',
    'updated_at'
  ],
  pthsp_full: [
    'id', 'ngay_hoan_thanh', 'tri_gia_don_hang_tong', 'hex', 'xuong_chinh', 'ten_cong_trinh',
    'updated_at'
  ],
  khsx_nam: [
    'id', 'thanh_tien_ke_hoach', 'nam', 'thang', 'xuong_chinh',
    'updated_at'
  ],
  phan_tich_kh_th: [
    'id', 'xuong_chinh', 'ten_cong_trinh', 'thanh_tien_ke_hoach', 'nhap_kho_tuan', 'tuan',
    'dung_ke_hoach', 'thuc_hien_dung_ke_hoach_1_phan', 'rot_ke_hoach', 'thuc_hien_rot_ke_hoach_1_phan',
    'nhap_kho_truoc_ke_hoach', 'vuot_ke_hoach', 'nhap_kho_ngoai_ke_hoach',
    'updated_at'
  ],
  diem_danh: [
    'id', 'xuong_chinh', 'so_luong_cong_nhan', 'gio_cong_hanh_chinh', 'gio_cong_tang_ca',
    'tuan', 'nam', 'thang', 'ngay', 'dinh_bien',
    'updated_at'
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

// Helper lấy dữ liệu an toàn cho từng bảng (INCREMENTAL SYNC + CẮT CỘT)
const fetchTableData = async (tableName: string, updatedAfter?: string) => {
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

    const result = await pool.query(query, values);
    return result.rows;
  } catch (error) {
    console.error(`Lỗi truy vấn bảng ${tableName}:`, error);
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

const getVersions = async () => {
  const result = await pool.query(`SELECT table_name, last_updated FROM table_versions`);
  const out: Record<string, string> = {};
  result.rows.forEach(row => {
    const key = TABLE_TO_VERSION_KEY[row.table_name];
    if (key) out[key] = row.last_updated;
  });
  return out;
};

// --- CACHE IN-MEMORY CHO /api/all-data ---
// LƯU Ý (serverless/Vercel): biến module-level chỉ cache trong phạm vi 1
// instance. Nhiều instance song song hoặc cold start sẽ không chia sẻ cache
// này. Nếu cần cache đáng tin cậy giữa nhiều instance, cân nhắc chuyển sang
// Upstash Redis (REST API, hợp với serverless).
let cachedData: any = null;
let cachedVersions: Record<string, string> | null = null;

const refreshAllDataCache = async () => {
  const versions = await getVersions();
  if (cachedData && JSON.stringify(versions) === JSON.stringify(cachedVersions)) {
    return { payload: cachedData, fromCache: true };
  }

  // TRƯỚC: Promise.all(TABLES.map(t => fetchTableData(t)))
  // → xin 12 connection cùng lúc, một mình chiếm gần hết pool (max: 3).
  // SAU: chạy tối đa 2 query song song, còn lại xếp hàng.
  const [
    production, material, khsx, order, inventory,
    tkbv, pthsp, analysis, yearlyPlan, exportData,
    attendance, stock
  ] = await runWithLimit(
    TABLES.map(t => () => fetchTableData(t)),
    2
  );

  const payload = {
    production, material, khsx, order, inventory,
    tkbv, pthsp, analysis, yearlyPlan, export: exportData,
    attendance, stock,
  };
  cachedData = payload;
  cachedVersions = versions;
  return { payload, fromCache: false };
};

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

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Lỗi truy vấn production full:', error);
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
  dvtCol?: string;                     // 👈 thêm mới — chỉ dht (order) có cột này
  joinProductionForPhanLoai?: boolean;
}

const STOCK_TREND_CONFIG: TrendTableConfig = {
  table: 'ton_kho',
  dateCol: 'date_parsed',
  valueCol: 'gia_tri',
  valueDivisor: 1,
  hexCol: 'ma_id_sap',
  congTrinhCol: 'ten_cong_trinh',
};
const ANALYSIS_TABLES: Record<string, TrendTableConfig> = {
  order:     { table: 'dht',        dateCol: 'ngay_nhan_tu_pm', valueCol: 'tri_gia_don_hang_tong', hexCol: 'hex', xuongCol: 'xuong_chinh', congTrinhCol: 'ten_cong_trinh', valueDivisor: 1,  dvtCol: 'dvt', joinProductionForPhanLoai: true,  },
  tkbv:      { table: 'tkbv_full',  dateCol: 'ngay_nhan',       valueCol: 'tri_gia_don_hang_tong', hexCol: 'hex', xuongCol: 'xuong_chinh', congTrinhCol: 'ten_cong_trinh', valueDivisor: 1 },
  pthsp:     { table: 'pthsp_full', dateCol: 'ngay_hoan_thanh', valueCol: 'tri_gia_don_hang_tong', hexCol: 'hex', xuongCol: 'xuong_chinh', congTrinhCol: 'ten_cong_trinh', valueDivisor: 1 },
  inventory: { table: 'nhap_kho',   dateCol: 'date',            valueCol: 'thanh_tien_nhap_kho',   hexCol: 'hex', xuongCol: 'xuong_chinh', congTrinhCol: 'ten_cong_trinh', valueDivisor: 1000000 },
  export:    { table: 'xuat_kho',   dateCol: 'date',            valueCol: 'so_luong_xuat_kho',     hexCol: 'hex', xuongCol: 'xuong_chinh', congTrinhCol: 'ten_cong_trinh', valueDivisor: 1 },
};
const ALLOWED_ANALYSIS_KEYS = new Set(Object.keys(ANALYSIS_TABLES));
const TREND_SOURCES = new Set([...Object.keys(ANALYSIS_TABLES), 'stock']);

/**
 * LƯU Ý HIỆU NĂNG: regex parse trên mỗi hàng ở mỗi request là nguyên nhân
 * chính khiến các endpoint tổng hợp chậm dần khi bảng lớn lên (Postgres
 * không dùng được index cho biểu thức này). Giải pháp lâu dài: migration
 * thêm cột `<col>_num numeric GENERATED ALWAYS AS (...) STORED` + index, rồi
 * tham chiếu thẳng cột đó thay vì gọi numericExpr(col). Xem file migration
 * đã gửi kèm ở lần trả lời trước nếu cần.
 */
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

app.get('/api/overview/summary', async (req: Request, res: Response) => {
  try {
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
      const explicitLo = sorted[0];
      const explicitHi = sorted[sorted.length - 1];
      outerLo = explicitLo < outerLo ? explicitLo : outerLo;
      outerHi = explicitHi > outerHi ? explicitHi : outerHi;
    }

    const subQueries: string[] = [];
    const allParams: any[] = [];

    Object.entries(ANALYSIS_TABLES).forEach(([key, cfg]) => {
      let periodCond: string;
      let mtdCond: string;
      let lastMonthCond: string;
      let localParams: any[];

      if (useAllTime) {
        periodCond = 'TRUE';
        mtdCond = `date_parsed BETWEEN $P1 AND $P2`;
        lastMonthCond = `date_parsed BETWEEN $P3 AND $P4`;
        localParams = [monthStart, dateToStr, prevMonthStart, prevMonthEnd];
      } else if (useExplicitDates) {
        periodCond = `date_parsed = ANY($P1::date[])`;
        mtdCond = `date_parsed BETWEEN $P2 AND $P3`;
        lastMonthCond = `date_parsed BETWEEN $P4 AND $P5`;
        localParams = [explicitDates, monthStart, dateToStr, prevMonthStart, prevMonthEnd];
      } else {
        periodCond = `date_parsed BETWEEN $P1 AND $P2`;
        mtdCond = `date_parsed BETWEEN $P3 AND $P4`;
        lastMonthCond = `date_parsed BETWEEN $P5 AND $P6`;
        localParams = [dateFromStr, dateToStr, monthStart, monthEnd, prevMonthStart, prevMonthEnd];
      }

      const baseIdx = allParams.length;
      localParams.forEach(p => allParams.push(p));
      const remap = (cond: string) =>
        cond.replace(/\$P(\d+)/g, (_, n) => `$${baseIdx + Number(n)}`);

      const countExpr = `COUNT(DISTINCT "${cfg.hexCol}")`;

      let outerWhere = 'TRUE';
      if (!useAllTime) {
        allParams.push(outerLo, outerHi);
        outerWhere = `date_parsed BETWEEN $${allParams.length - 1} AND $${allParams.length}`;
      }

      subQueries.push(`
        SELECT
          '${key}' AS source_key,
          ${countExpr} FILTER (WHERE ${remap(periodCond)}) AS period_count,
          COALESCE(SUM(${numericExpr(cfg.valueCol)}) FILTER (WHERE ${remap(periodCond)}), 0) / ${cfg.valueDivisor} AS period_value,
          ${countExpr} FILTER (WHERE ${remap(mtdCond)}) AS mtd_count,
          COALESCE(SUM(${numericExpr(cfg.valueCol)}) FILTER (WHERE ${remap(mtdCond)}), 0) / ${cfg.valueDivisor} AS mtd_value,
          ${countExpr} FILTER (WHERE ${remap(lastMonthCond)}) AS last_month_count,
          COALESCE(SUM(${numericExpr(cfg.valueCol)}) FILTER (WHERE ${remap(lastMonthCond)}), 0) / ${cfg.valueDivisor} AS last_month_value
        FROM ${cfg.table}
        WHERE ${outerWhere}
      `);
    });

    const finalQuery = subQueries.join('\nUNION ALL\n');
    const r = await pool.query(finalQuery, allParams);

    const results: Record<string, any> = {};
    r.rows.forEach(row => {
      results[row.source_key] = {
        daily: { count: Number(row.period_count), value: Number(row.period_value) },
        mtd: { count: Number(row.mtd_count), value: Number(row.mtd_value) },
        lastMonth: { count: Number(row.last_month_count), value: Number(row.last_month_value) },
      };
    });

    res.json({ date: dateToStr, dateFrom: dateFromStr, ...results });
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
    const groupCol = groupBy === 'congtrinh' ? cfg.congTrinhCol : cfg.xuongCol;

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
      periodCond = `date_parsed = ANY($1::date[])`;
    } else {
      params.push(dateFromStr, dateToStr);
      periodCond = `date_parsed BETWEEN $1 AND $2`;
    }
    const monthStartIdx = params.length + 1;
    const refDateIdx = params.length + 2;
    params.push(monthStart, refDateStr);
    const mtdCond = `date_parsed BETWEEN $${monthStartIdx} AND $${refDateIdx}`;

    const loCandidates = useExplicitDates ? [monthStart, ...explicitDates] : [monthStart, dateFromStr];
    const hiCandidates = useExplicitDates ? [refDateStr, ...explicitDates] : [refDateStr, dateToStr];
    const outerLo = loCandidates.sort()[0];
    const outerHi = hiCandidates.sort().slice(-1)[0];
    const outerLoIdx = params.length + 1;
    const outerHiIdx = params.length + 2;
    params.push(outerLo, outerHi);

    const q = `
      SELECT
        COALESCE(NULLIF(TRIM("${groupCol}"), ''), 'Chưa xác định') AS name,
        COUNT(DISTINCT "${cfg.hexCol}") FILTER (WHERE ${periodCond}) AS daily_count,
        COALESCE(SUM(${numericExpr(cfg.valueCol)}) FILTER (WHERE ${periodCond}), 0) / ${cfg.valueDivisor} AS daily_value,
        COUNT(DISTINCT "${cfg.hexCol}") FILTER (WHERE ${mtdCond}) AS mtd_count,
        COALESCE(SUM(${numericExpr(cfg.valueCol)}) FILTER (WHERE ${mtdCond}), 0) / ${cfg.valueDivisor} AS mtd_value
      FROM ${cfg.table}
      WHERE date_parsed BETWEEN $${outerLoIdx} AND $${outerHiIdx}
      GROUP BY 1
      ORDER BY mtd_value DESC
    `;
    const r = await pool.query(q, params);
    res.json(
      r.rows
        .map(row => ({
          name: row.name as string,
          dailyCount: Number(row.daily_count),
          dailyValue: Number(row.daily_value),
          mtdCount: Number(row.mtd_count),
          mtdValue: Number(row.mtd_value),
        }))
        .filter(row => row.mtdCount > 0 || row.mtdValue > 0)
    );
  } catch (error) {
    console.error('Lỗi overview/by-group:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- CACHE IN-MEMORY CHO /api/stock/dates ---
let cachedStockDates: any = null;
let cachedStockDatesVersion: string | null = null;

const refreshStockDatesCache = async () => {
  const verResult = await pool.query(
    `SELECT last_updated FROM table_versions WHERE table_name = 'ton_kho'`
  );
  const currentVersion = verResult.rows[0]?.last_updated
    ? String(verResult.rows[0].last_updated)
    : null;

  if (cachedStockDates && currentVersion && currentVersion === cachedStockDatesVersion) {
    return { payload: cachedStockDates, fromCache: true };
  }

  const q = `
    SELECT date_parsed AS d,
           COUNT(DISTINCT ma_id_sap) AS count,
           COALESCE(SUM(${numericExpr('gia_tri')}), 0) AS value
    FROM ton_kho
    WHERE date_parsed IS NOT NULL
    GROUP BY 1
    ORDER BY 1 DESC
  `;
  const r = await pool.query(q);
  const payload = r.rows.map(row => ({ date: row.d, count: Number(row.count), value: Number(row.value) }));

  cachedStockDates = payload;
  cachedStockDatesVersion = currentVersion;
  return { payload, fromCache: false };
};

app.get('/api/stock/dates', async (_req: Request, res: Response) => {
  try {
    const { payload } = await refreshStockDatesCache();
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

    const { fromCache: stockFromCache } = await refreshStockDatesCache();
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
    const q = `
      SELECT COALESCE(NULLIF(TRIM(ten_cong_trinh), ''), 'Chưa xác định') AS name,
             COUNT(DISTINCT ma_id_sap) AS count,
             COALESCE(SUM(${numericExpr('gia_tri')}), 0) AS value
      FROM ton_kho
      WHERE date_parsed = $1
      GROUP BY 1
      ORDER BY value DESC
    `;
    const r = await pool.query(q, [date]);
    res.json(r.rows.map(row => ({ name: row.name, count: Number(row.count), value: Number(row.value) })));
  } catch (error) {
    console.error('Lỗi stock/by-project:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Trả về: kế hoạch năm, quý, thực hiện, theo xưởng.
// Trước đây năm 2026 bị hardcode trong SQL — giờ nhận qua path param ?/:year, mặc định năm hiện tại.
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
      () => pool.query(`
        SELECT
          COALESCE(SUM(${numericExpr('thanh_tien_ke_hoach')}), 0) AS total,
          COALESCE(SUM(${numericExpr('thanh_tien_ke_hoach')})
            FILTER (WHERE NULLIF(regexp_replace(thang::text, '[^0-9]', '', 'g'), '')::int BETWEEN 1 AND 3), 0) AS q1,
          COALESCE(SUM(${numericExpr('thanh_tien_ke_hoach')})
            FILTER (WHERE NULLIF(regexp_replace(thang::text, '[^0-9]', '', 'g'), '')::int BETWEEN 1 AND 6), 0) AS q2,
          COALESCE(SUM(${numericExpr('thanh_tien_ke_hoach')})
            FILTER (WHERE NULLIF(regexp_replace(thang::text, '[^0-9]', '', 'g'), '')::int BETWEEN 1 AND 9), 0) AS q3
        FROM khsx_nam WHERE nam::text = $1
      `, [String(year)]),

      () => pool.query(`
        SELECT COALESCE(SUM(${numericExpr('thanh_tien_nhap_kho')}), 0) AS total
        FROM nhap_kho
        WHERE date_parsed BETWEEN $1 AND $2
      `, [yearStart, yearEnd]),

      () => pool.query(`
        SELECT CASE WHEN xuong_chinh = ANY($1::text[]) THEN xuong_chinh ELSE 'KHÁC' END AS name,
               COALESCE(SUM(${numericExpr('thanh_tien_ke_hoach')}), 0) AS plan
        FROM khsx_nam WHERE nam::text = $2
        GROUP BY 1
      `, [TARGET_WORKSHOPS, String(year)]),

      () => pool.query(`
        SELECT CASE WHEN xuong_chinh = ANY($1::text[]) THEN xuong_chinh ELSE 'KHÁC' END AS name,
               COALESCE(SUM(${numericExpr('thanh_tien_nhap_kho')}), 0) AS actual
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
// AUTH API — TRUY XUẤT BẢNG users TRONG POSTGRES
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

// Trả về: Tổng KH vs TH (đã DEDUP theo HEX) — theo Xưởng & theo Công trình
app.get('/api/khsx-nhapkho/summary', async (req: Request, res: Response) => {
  try {
    const { nam, thang, mode = 'month', tuan, ngay, congTrinh, xuong } = req.query as Record<string, string>;
    if (!nam) return res.status(400).json({ error: 'Missing nam' });

    const isWeek = mode === 'week';
    const phanLoaiPattern = isWeek ? '%TUẦN%' : '%THÁNG%';

    const normalize = (s: string) => s.trim().toUpperCase();
    const congTrinhList = congTrinh ? congTrinh.split(',').map(s => normalize(s)).filter(Boolean) : [];
    const xuongList = xuong ? xuong.split(',').map(s => normalize(s)).filter(Boolean) : [];

    const khParams: any[] = [phanLoaiPattern, nam];
    let khWhere = `WHERE UPPER(TRIM(phan_loai_kh)) LIKE $1 AND nam::text = $2`;
    if (thang) { khParams.push(thang); khWhere += ` AND thang::text = $${khParams.length}`; }
    if (isWeek && tuan) { khParams.push(tuan); khWhere += ` AND tuan::text = $${khParams.length}`; }
    if (isWeek && ngay) { khParams.push(ngay); khWhere += ` AND ngay::text = $${khParams.length}`; }
    if (congTrinhList.length) { khParams.push(congTrinhList); khWhere += ` AND UPPER(TRIM(ten_cong_trinh)) = ANY($${khParams.length}::text[])`; }
    if (xuongList.length) { khParams.push(xuongList); khWhere += ` AND UPPER(TRIM(xuong_chinh)) = ANY($${khParams.length}::text[])`; }

    const khQuery = `
      SELECT
        TRIM(xuong_chinh) AS xuong,
        TRIM(ten_cong_trinh) AS cong_trinh,
        TRIM(ma_cong_trinh) AS ma_cong_trinh,
        COALESCE(SUM(${numericExpr('thanh_tien_ke_hoach')}), 0) / 1000 AS gia_tri
      FROM khsx
      ${khWhere}
      GROUP BY TRIM(xuong_chinh), TRIM(ten_cong_trinh), TRIM(ma_cong_trinh)
    `;
    const khResult = await pool.query(khQuery, khParams);

    const thParams: any[] = [nam];
    let thWhere = `WHERE nam::text = $1`;
    if (thang) { thParams.push(thang); thWhere += ` AND thang::text = $${thParams.length}`; }
    if (isWeek && tuan) { thParams.push(tuan); thWhere += ` AND tuan::text = $${thParams.length}`; }
    if (isWeek && ngay) { thParams.push(ngay); thWhere += ` AND ngay::text = $${thParams.length}`; }
    if (congTrinhList.length) { thParams.push(congTrinhList); thWhere += ` AND UPPER(TRIM(ten_cong_trinh)) = ANY($${thParams.length}::text[])`; }
    if (xuongList.length) { thParams.push(xuongList); thWhere += ` AND UPPER(TRIM(xuong_chinh)) = ANY($${thParams.length}::text[])`; }

    const thQuery = `
      SELECT
        TRIM(xuong_chinh) AS xuong,
        TRIM(ten_cong_trinh) AS cong_trinh,
        TRIM(ma_cong_trinh) AS ma_cong_trinh,
        COALESCE(SUM(${numericExpr('thanh_tien_nhap_kho')}), 0) / ${VND_TO_TY} AS gia_tri
      FROM nhap_kho
      ${thWhere}
      GROUP BY TRIM(xuong_chinh), TRIM(ten_cong_trinh), TRIM(ma_cong_trinh)
    `;
    const thResult = await pool.query(thQuery, thParams);

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

    res.json({
      totalKh: Number(totalKh.toFixed(2)),
      totalTh: Number(totalTh.toFixed(2)),
      completionRate: Number(completionRate.toFixed(1)),
      byXuong,
      byCongTrinh,
    });
  } catch (error) {
    console.error('Lỗi khsx-nhapkho/summary:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/trend', async (req: Request, res: Response) => {
  try {
    const source = req.query.source as string;
    if (!TREND_SOURCES.has(source)) return res.status(400).json({ error: 'Invalid source' });

    const cfg: TrendTableConfig = source === 'stock' ? STOCK_TREND_CONFIG : ANALYSIS_TABLES[source];

    const granularity = (req.query.granularity as string) || 'day';
    const truncUnit = granularity === 'week' ? 'week' : granularity === 'month' ? 'month' : 'day';

    const dateFrom = parseSafeDate(req.query.dateFrom as string);
    const dateTo = parseSafeDate(req.query.dateTo as string);
    const xuong = (req.query.xuong as string) || '';
    const congTrinh = (req.query.congTrinh as string) || '';
    const dvt = (req.query.dvt as string) || '';           // 👈 mới
    const phanLoai = (req.query.phanLoai as string) || ''; // 👈 mới

    // Chỉ JOIN production_status_app khi thực sự cần lọc theo phân loại —
    // tránh ảnh hưởng hiệu năng/hành vi của các request không dùng filter này.
    const needsJoin = !!(phanLoai && cfg.joinProductionForPhanLoai && cfg.hexCol);
    const mainAlias = needsJoin ? 'm' : '';
    const colBare = (name: string) => (mainAlias ? `${mainAlias}.${name}` : name);
    const colQuoted = (name: string) => (mainAlias ? `${mainAlias}."${name}"` : `"${name}"`);

    const conditions: string[] = [`${colBare(cfg.dateCol)} IS NOT NULL`];
    const params: any[] = [];

    if (dateFrom) { params.push(dateFrom.toISOString().slice(0, 10)); conditions.push(`${colBare(cfg.dateCol)} >= $${params.length}`); }
    if (dateTo) { params.push(dateTo.toISOString().slice(0, 10)); conditions.push(`${colBare(cfg.dateCol)} <= $${params.length}`); }
    if (xuong && cfg.xuongCol) { params.push(xuong); conditions.push(`${colBare(cfg.xuongCol)} = $${params.length}`); }
    if (congTrinh && cfg.congTrinhCol) { params.push(congTrinh); conditions.push(`${colBare(cfg.congTrinhCol)} = $${params.length}`); }
    if (dvt && cfg.dvtCol) { params.push(dvt); conditions.push(`${colBare(cfg.dvtCol)} = $${params.length}`); }
    if (needsJoin) { params.push(phanLoai); conditions.push(`p.phan_loai_nhom_san_pham = $${params.length}`); }

    const useDefaultLimit = !dateFrom && !dateTo;
    const limit = granularity === 'day' ? 15 : 12;

    const countExpr = cfg.hexCol ? `COUNT(DISTINCT ${colBare(cfg.hexCol)})` : `COUNT(*)`;
    const valueExpr = needsJoin
      ? `SUM(${numericExprQualified(colQuoted(cfg.valueCol))})`
      : `SUM(${numericExpr(cfg.valueCol)})`;
    const joinClause = needsJoin ? `LEFT JOIN production_status_app p ON p.hex = ${colBare(cfg.hexCol!)}` : '';

    const q = `
      SELECT
        date_trunc('${truncUnit}', ${colBare(cfg.dateCol)})::date AS period,
        COALESCE(${valueExpr}, 0) / ${cfg.valueDivisor} AS total_value,
        ${countExpr} AS total_count
      FROM ${cfg.table} ${mainAlias}
      ${joinClause}
      WHERE ${conditions.join(' AND ')}
      GROUP BY 1
      ORDER BY 1 ${useDefaultLimit ? 'DESC' : 'ASC'}
      ${useDefaultLimit ? `LIMIT ${limit}` : ''}
    `;
    const r = await pool.query(q, params);
    const rows = (useDefaultLimit ? r.rows.reverse() : r.rows).map(row => ({
      period: row.period,
      total: Number(row.total_value),
      totalCount: Number(row.total_count),
    }));
    res.json(rows);
  } catch (error) {
    console.error('Lỗi /api/trend:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Danh sách các giá trị xưởng distinct, dùng cho dropdown filter
app.get('/api/filters/xuong', async (_req: Request, res: Response) => {
  try {
    const q = `
      SELECT DISTINCT TRIM(xuong_chinh) AS name
      FROM khsx
      WHERE xuong_chinh IS NOT NULL AND TRIM(xuong_chinh) <> ''
      ORDER BY 1
    `;
    const r = await pool.query(q);
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
      SELECT DISTINCT TRIM(ten_cong_trinh) AS name
      FROM khsx
      WHERE ten_cong_trinh IS NOT NULL AND TRIM(ten_cong_trinh) <> ''
      ORDER BY 1
    `;
    const r = await pool.query(q);
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
      SELECT DISTINCT TRIM(dvt) AS name
      FROM dht
      WHERE dvt IS NOT NULL AND TRIM(dvt) <> ''
      ORDER BY 1
    `;
    const r = await pool.query(q);
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
    const r = await pool.query(q);
    res.json(r.rows.map(row => ({ code: row.name, name: row.name })));
  } catch (error) {
    console.error('Lỗi filters/phan-loai-nhom-san-pham:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Trả về: tổng hợp theo XƯỞNG (không group theo thời gian) — dùng cho biểu đồ so sánh xưởng
app.get('/api/trend-by-xuong', async (req: Request, res: Response) => {
  try {
    const source = req.query.source as string;
    if (!TREND_SOURCES.has(source)) return res.status(400).json({ error: 'Invalid source' });

    const cfg: TrendTableConfig = source === 'stock' ? STOCK_TREND_CONFIG : ANALYSIS_TABLES[source];
    if (!cfg.xuongCol) {
      return res.json([]);
    }

    const dateFrom = parseSafeDate(req.query.dateFrom as string);
    const dateTo = parseSafeDate(req.query.dateTo as string);
    const xuong = (req.query.xuong as string) || '';        // 👈 THÊM DÒNG NÀY
    const congTrinh = (req.query.congTrinh as string) || '';
    const dvt = (req.query.dvt as string) || '';
    const phanLoai = (req.query.phanLoai as string) || '';

    const needsJoin = !!(phanLoai && cfg.joinProductionForPhanLoai && cfg.hexCol);
    const mainAlias = needsJoin ? 'm' : '';
    const colBare = (name: string) => (mainAlias ? `${mainAlias}.${name}` : name);
    const colQuoted = (name: string) => (mainAlias ? `${mainAlias}."${name}"` : `"${name}"`);

    const conditions: string[] = [`${colBare(cfg.dateCol)} IS NOT NULL`];
    const params: any[] = [];

    if (dateFrom) { params.push(dateFrom.toISOString().slice(0, 10)); conditions.push(`${colBare(cfg.dateCol)} >= $${params.length}`); }
    if (dateTo) { params.push(dateTo.toISOString().slice(0, 10)); conditions.push(`${colBare(cfg.dateCol)} <= $${params.length}`); }
    if (xuong && cfg.xuongCol) { params.push(xuong); conditions.push(`${colBare(cfg.xuongCol)} = $${params.length}`); }   // 👈 THÊM ĐIỀU KIỆN
    if (congTrinh && cfg.congTrinhCol) { params.push(congTrinh); conditions.push(`${colBare(cfg.congTrinhCol)} = $${params.length}`); }
    if (dvt && cfg.dvtCol) { params.push(dvt); conditions.push(`${colBare(cfg.dvtCol)} = $${params.length}`); }
    if (needsJoin) { params.push(phanLoai); conditions.push(`p.phan_loai_nhom_san_pham = $${params.length}`); }

    const countExpr = cfg.hexCol ? `COUNT(DISTINCT ${colBare(cfg.hexCol)})` : `COUNT(*)`;
    const valueExpr = needsJoin
      ? `SUM(${numericExprQualified(colQuoted(cfg.valueCol))})`
      : `SUM(${numericExpr(cfg.valueCol)})`;
    const joinClause = needsJoin ? `LEFT JOIN production_status_app p ON p.hex = ${colBare(cfg.hexCol!)}` : '';

    const q = `
      SELECT
        COALESCE(NULLIF(TRIM(${colBare(cfg.xuongCol)}), ''), 'Chưa xác định') AS xuong,
        COALESCE(${valueExpr}, 0) / ${cfg.valueDivisor} AS total_value,
        ${countExpr} AS total_count
      FROM ${cfg.table} ${mainAlias}
      ${joinClause}
      WHERE ${conditions.join(' AND ')}
      GROUP BY 1
      ORDER BY total_value DESC
    `;
    const r = await pool.query(q, params);
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

// Trả về: tổng hợp theo CÔNG TRÌNH (không group theo thời gian) — dùng cho biểu đồ so sánh công trình
// Trả về: tổng hợp theo CÔNG TRÌNH (không group theo thời gian) — dùng cho biểu đồ so sánh công trình
app.get('/api/trend-by-congtrinh', async (req: Request, res: Response) => {
  try {
    const source = req.query.source as string;
    if (!TREND_SOURCES.has(source)) return res.status(400).json({ error: 'Invalid source' });

    const cfg: TrendTableConfig = source === 'stock' ? STOCK_TREND_CONFIG : ANALYSIS_TABLES[source];
    if (!cfg.congTrinhCol) {
      return res.json([]);
    }

    const dateFrom = parseSafeDate(req.query.dateFrom as string);
    const dateTo = parseSafeDate(req.query.dateTo as string);
    const xuong = (req.query.xuong as string) || '';
    const congTrinh = (req.query.congTrinh as string) || '';   // 👈 THÊM DÒNG NÀY — trước đây thiếu hoàn toàn
    const dvt = (req.query.dvt as string) || '';
    const phanLoai = (req.query.phanLoai as string) || '';

    const needsJoin = !!(phanLoai && cfg.joinProductionForPhanLoai && cfg.hexCol);
    const mainAlias = needsJoin ? 'm' : '';
    const colBare = (name: string) => (mainAlias ? `${mainAlias}.${name}` : name);
    const colQuoted = (name: string) => (mainAlias ? `${mainAlias}."${name}"` : `"${name}"`);

    const conditions: string[] = [`${colBare(cfg.dateCol)} IS NOT NULL`];
    const params: any[] = [];

    if (dateFrom) { params.push(dateFrom.toISOString().slice(0, 10)); conditions.push(`${colBare(cfg.dateCol)} >= $${params.length}`); }
    if (dateTo) { params.push(dateTo.toISOString().slice(0, 10)); conditions.push(`${colBare(cfg.dateCol)} <= $${params.length}`); }
    if (xuong && cfg.xuongCol) { params.push(xuong); conditions.push(`${colBare(cfg.xuongCol)} = $${params.length}`); }
    if (congTrinh && cfg.congTrinhCol) { params.push(congTrinh); conditions.push(`${colBare(cfg.congTrinhCol)} = $${params.length}`); }  // 👈 THÊM ĐIỀU KIỆN LỌC
    if (dvt && cfg.dvtCol) { params.push(dvt); conditions.push(`${colBare(cfg.dvtCol)} = $${params.length}`); }
    if (needsJoin) { params.push(phanLoai); conditions.push(`p.phan_loai_nhom_san_pham = $${params.length}`); }

    const countExpr = cfg.hexCol ? `COUNT(DISTINCT ${colBare(cfg.hexCol)})` : `COUNT(*)`;
    const valueExpr = needsJoin
      ? `SUM(${numericExprQualified(colQuoted(cfg.valueCol))})`
      : `SUM(${numericExpr(cfg.valueCol)})`;
    const joinClause = needsJoin ? `LEFT JOIN production_status_app p ON p.hex = ${colBare(cfg.hexCol!)}` : '';

    const q = `
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
    const r = await pool.query(q, params);
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

// --- LẤY THÔNG TIN USER HIỆN TẠI TỪ TOKEN (dùng để refresh state, không tin snapshot cũ) ---
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