import { parseNameList, expandProjectNames, normNameSql } from './projectAlias.js';
import type { Request } from 'express';
import { timedQuery } from '../db.js';
import { runWithLimit } from './common.js';

// --- WHITELIST CỘT: CHỈ TRUY XUẤT CÁC CỘT CẦN THIẾT ---
export const REPORT_COLUMNS: Record<string, string[]> = {
 production_status_app: [
  'hex', 'tinh_trang', 'tinh_trang_ipo',
  'gia_tri_don_hang_con_lai', 'gia_tri_con_lai',
  'ten_cong_trinh', 'xuong_chinh', 'ten_hang_muc', 'phan_loai_nhom_san_pham',
  'so_ngay_cd_hien_tai', 'bop',
  'tri_gia_don_hang_tong', 'thanh_tien_tinh_phieu', 'thanh_tien_nhap_kho_luy_ke', 'bot_du_an', 'khach_hang', 'khu_vuc_du_an', 'ma_nha_may', 'ma_cong_trinh',
  // Báo cáo tiến độ công trình
  'ten_pm', 'ten_pc', 'ngay_can_giao', 'ngay_khnk_thang', 'ngay_khnk_tuan',
  // Hạn tham khảo khi chưa có KH / ngày cần giao (utils/productionMetrics.deadlineOf)
  'ngay_can',
  // Tổng quan công trình: giá trị đã xuất kho lũy kế / tồn kho hiện tại theo hạng mục
  'thanh_tien_xuat_kho_luy_ke', 'thanh_tien_ton_kho_hien_tai',
  // Hạng mục nhập đủ SỐ LƯỢNG coi là đã xong khi đếm / tính hạn (utils/productionMetrics.isQtyComplete)
  'so_luong_don_hang_tong', 'so_luong_nhap_kho_luy_ke',
  // Báo cáo tiến độ công trình (bộ lọc nhóm CT / tình trạng dự án) + tổng quan 1 công trình
  // (luồng triển khai BV → phiếu → chuyền → nhập kho, tuổi đơn từ ngày nhận PM). Cột ngắn, thêm ít dung lượng.
  'nhom_ct', 'tinh_trang_du_an', 'ngay_nhan_tu_pm', 'tinh_trang_trien_khai_ban_ve', 'tinh_trang_phieu',
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
  'hex','thanh_tien_nhap_kho','so_luong_nhap_kho' , 'xuong_chinh', 'ten_cong_trinh', 'ma_cong_trinh',
    'nam', 'thang', 'ngay', 'date', 'tuan', 'ghi_chu', 'ten_hang_muc'
  ],
 xuat_kho: [
  'hex', 'so_luong_xuat_kho', 'thanh_tien_xuat_kho', 'date', 'xuong_chinh', 'ten_cong_trinh', 'ghi_chu', 'tinh_doi_voi_hang_tp', 'ten_hang_muc',
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
    // Năm — bảng KH-TH tuần lọc theo năm đang chọn (cùng số tuần ở 2 năm khác nhau không bị cộng lẫn)
    'nam',
    'dung_ke_hoach', 'thuc_hien_dung_ke_hoach_1_phan', 'rot_ke_hoach', 'thuc_hien_rot_ke_hoach_1_phan',
    'nhap_kho_truoc_ke_hoach', 'vuot_ke_hoach', 'nhap_kho_ngoai_ke_hoach',

  ],
  diem_danh: [
  'xuong_chinh', 'so_luong_cong_nhan', 'gio_cong_hanh_chinh', 'gio_cong_tang_ca',
    'tuan', 'nam', 'thang', 'ngay', 'dinh_bien',

  ]
};

// HELPER VALIDATE DATE AN TOÀN
export const parseSafeDate = (rawInput?: string): Date | null => {
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
export const parseExplicitDates = (req: Request): string[] =>
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
export const applyNonStockDateFilter = (
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
export const getPeriodRangeFromKey = (value: string, granularity: string): { start: string; end: string } => {
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
export const buildStockSnapshotCondition = (
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
// Loại dòng thuộc hạng mục ĐÃ HỦY (tinh_trang_ipo chứa "HỦY") — cùng quy tắc với giao diện
// (đơn hủy không tính giá trị). Dòng không có hex (không nối được sản xuất) vẫn giữ.
// Tập HEX đã HỦY (dùng làm CTE khi 1 câu lệnh cần tham chiếu nhiều lần — Postgres tính 1 lần).
// Cột đặt tên `cx_hex` (không phải `hex`): biểu thức hexExpr của bảng ngoài thường là `hex` không có tiền tố
// bảng; nếu bảng con cũng có cột `hex` thì bên trong NOT EXISTS, `hex` sẽ bị gán cho bảng con (cx.hex = cx.hex
// luôn đúng => loại sạch mọi dòng).
export const CANCELLED_HEX_SQL = `SELECT DISTINCT hex::text AS cx_hex FROM production_status_app
     WHERE hex IS NOT NULL AND UPPER(COALESCE(tinh_trang_ipo, '')) LIKE '%HỦY%'`;
// NOT EXISTS thay cho NOT IN (subquery): Postgres làm hash anti-join (quét bảng sản xuất 1 lần, băm rồi
// dò), trong khi NOT IN phải băm trong work_mem và rơi về quét lặp khi tập HỦY lớn (đo trên dev: nhanh 2x).
// Dòng hex NULL: so sánh NULL không khớp => vẫn giữ (giống COALESCE(..., '') NOT IN trước đây).
// `cte`: tên CTE đã chứa tập HỦY (cột `cx_hex` text) nếu câu lệnh đã khai báo CANCELLED_HEX_SQL.
export const notCancelledHexCond = (hexExpr: string, cte?: string): string =>
  `NOT EXISTS (SELECT 1 FROM ${cte ?? `(${CANCELLED_HEX_SQL})`} cx WHERE cx.cx_hex = ${hexExpr}::text)`;

// 1 công trình được chọn (?congTrinh=) -> so với mọi cách viết của cùng mã
export const projectNameCondition = (colExpr: string, name: string, params: any[]): string => {
  params.push(expandProjectNames([name]));
  return `${normNameSql(colExpr)} = ANY($${params.length}::text[])`;
};

export const eqNormalized = (colExpr: string, paramIdx: number) =>
  `UPPER(TRIM(${colExpr})) = UPPER(TRIM($${paramIdx}))`;

export const hasCtWhitelist = (req: Request): boolean => req.query.ctWhitelist !== undefined;
// Danh sách công trình của view: mở rộng thành mọi cách viết của cùng mã (server/projectAlias.ts)
export const parseCtWhitelist = (req: Request): string[] =>
  expandProjectNames(parseNameList(req.query.ctWhitelist));
export const applyCtWhitelist = (
  req: Request,
  congTrinhColExpr: string | undefined,
  conditions: string[],
  params: any[],
): void => {
  if (!hasCtWhitelist(req) || !congTrinhColExpr) return;
  const wl = parseCtWhitelist(req);
  params.push(wl);
  conditions.push(`${normNameSql(congTrinhColExpr)} = ANY($${params.length}::text[])`);
};

// [JOIN DEDUP FIX] Một ma_id_sap/hex có thể khớp NHIỀU dòng trong
// production_status_app (vd: 1 vật tư dùng cho nhiều hạng mục). LEFT JOIN trực
// tiếp sẽ nhân dòng bảng chính lên N lần, làm SUM/COUNT bị thổi phồng sai.
// Dedup bằng DISTINCT ON trước khi join (trùng updated_at thì lấy id lớn nhất — cố định, không đổi
// giữa các lần truy vấn; 1 mã có thể có nhiều dòng ở nhiều xưởng cùng thời điểm cập nhật). Đặt tên CTE là "p" để mọi chỗ tham
// chiếu "p.xuong_chinh", "p.dvt", "p.phan_loai_nhom_san_pham"... không cần sửa.
// Mã ID SAP bên sản xuất (production_status_app.ma_id_sap, text) có 2 dạng: 12 số và 18 số = 12 số chèn
// 6 số 0 ở giữa ('300000000000189659' = '300000189659'); ton_kho.ma_id_sap (bigint) chỉ có dạng 12 số.
// Chuẩn hoá về 12 số trước khi nối / DISTINCT ON — không thì ~119 mã tồn mất xưởng / tình trạng.
export const sapKeySql = (col: string): string =>
  `(CASE WHEN LENGTH(${col}::text) = 18 AND SUBSTRING(${col}::text FROM 7 FOR 6) = '000000'
     THEN SUBSTRING(${col}::text FROM 1 FOR 6) || SUBSTRING(${col}::text FROM 13 FOR 6)
     ELSE ${col}::text END)`;
// Biểu thức khoá nối phía production_status_app theo tên cột (ma_id_sap => chuẩn hoá, cột khác giữ nguyên)
export const productionKeySql = (col: string, alias = ''): string => {
  const ref = `${alias ? `${alias}.` : ''}"${col}"`;
  return col === 'ma_id_sap' ? sapKeySql(ref) : ref;
};

export const buildMatchedProductionCTE = (joinKey: string): string => {
  // Cột ra vẫn tên "${joinKey}" (đã chuẩn hoá nếu là ma_id_sap) => chỗ nối p."${joinKey}" không cần sửa
  const key = productionKeySql(joinKey);
  return `
  p AS (
    SELECT DISTINCT ON (${key})
      ${key} AS "${joinKey}", xuong_chinh, dvt, phan_loai_nhom_san_pham, tinh_trang, tinh_trang_ipo
    FROM production_status_app
    WHERE "${joinKey}" IS NOT NULL
    ORDER BY ${key}, updated_at DESC NULLS LAST, id DESC
  )
`;
};

// Helper lấy dữ liệu an toàn cho từng bảng (INCREMENTAL SYNC + CẮT CỘT)
// [ĐO TIMING] Đây là hàm chạy cho /api/all-data và mọi route trong apiRoutes —
// đổi sang timedQuery để tách bạch connect-time vs query-time khi DEBUG_DB_TIMING=true.
export const fetchTableData = async (tableName: string, updatedAfter?: string, strict = false) => {
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
export const TABLES = [
  'production_status_app', 'vat_tu', 'khsx', 'dht', 'nhap_kho',
  'tkbv_full', 'pthsp_full', 'phan_tich_kh_th', 'khsx_nam',
  'xuat_kho', 'diem_danh', 'ton_kho'
];

// Trước đây có 1 mảng VERSION_KEYS song song với TABLES, dễ lệch thứ tự nếu
// sửa 1 trong 2 mà quên sửa cái kia. Gộp thành 1 map duy nhất.
export const TABLE_TO_VERSION_KEY: Record<string, string> = {
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
// Mở 1 trang, giao diện bắn ~15 request cùng lúc và mỗi request đều hỏi phiên bản bảng để kiểm tra
// cache => gộp lại: giữ kết quả 3 giây và các lần gọi đồng thời dùng chung 1 query.
const VERSIONS_TTL_MS = 3000;
let versionsMemo: { at: number; value: Record<string, string> } | null = null;
let versionsInflight: Promise<Record<string, string>> | null = null;

export const getVersions = async (): Promise<Record<string, string>> => {
  if (versionsMemo && Date.now() - versionsMemo.at < VERSIONS_TTL_MS) return versionsMemo.value;
  if (versionsInflight) return versionsInflight;
  versionsInflight = (async () => {
    try {
      // ORDER BY table_name: thứ tự key cố định để JSON.stringify(versions) so sánh được giữa 2 lần gọi
      const result = await timedQuery(`SELECT table_name, last_updated FROM table_versions ORDER BY table_name`);
      const out: Record<string, string> = {};
      result.rows.forEach(row => {
        const key = TABLE_TO_VERSION_KEY[row.table_name];
        if (key) out[key] = row.last_updated;
      });
      versionsMemo = { at: Date.now(), value: out };
      return out;
    } finally {
      versionsInflight = null;
    }
  })();
  return versionsInflight;
};

// Lấy version của 1 tập con các bảng (dùng cho cache theo endpoint)
export const getRelevantVersions = async (keys: string[]): Promise<Record<string, string>> => {
  const all = await getVersions();
  const out: Record<string, string> = {};
  keys.forEach(k => { if (all[k] !== undefined) out[k] = all[k]; });
  return out;
};

// Giới hạn số entry trong 1 cache Map, tránh phình bộ nhớ vô hạn khi user
// chọn nhiều khoảng ngày khác nhau (mỗi khoảng ngày = 1 cache key riêng).
export const CACHE_MAX_ENTRIES = 50;
export const trimCache = (cache: Map<string, any>) => {
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
// Nhiều request /api/all-data tới khi cache rỗng (cold start, nhiều tab) => chỉ nạp 1 lần
let allDataInflight: Promise<{ payload: any; versions: Record<string, string>; fromCache: boolean }> | null = null;


// Hàm riêng cho ton_kho trong /api/all-data: chỉ lấy snapshot NGÀY MỚI NHẤT,
// tránh kéo toàn bộ lịch sử (từng gây statement timeout + OOM trên serverless).
// Chi tiết lịch sử theo ngày vẫn có qua /api/stock/dates và /api/stock/by-project.
export const fetchLatestStockSnapshot = async () => {
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
export const refreshAllDataCache = async (): Promise<{ payload: any; versions: Record<string, string>; fromCache: boolean }> => {
  const versions = await getVersions();
  if (cachedData && cachedVersions && JSON.stringify(versions) === JSON.stringify(cachedVersions)) {
    return { payload: cachedData, versions: cachedVersions, fromCache: true };
  }
  if (allDataInflight) return allDataInflight;

  allDataInflight = (async () => {
    try {
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
      return { payload, versions, fromCache: false };
    } finally {
      allDataInflight = null;
    }
  })();
  return allDataInflight;
};

export interface TrendTableConfig {
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
export const STOCK_TREND_CONFIG: TrendTableConfig = {
  table: 'ton_kho',
  dateCol: 'date_parsed',
  valueCol: 'gia_tri',
  valueDivisor: 1,
  hexCol: 'ma_id_sap',
  congTrinhCol: 'ten_cong_trinh',
  dvtCol: 'dvt',
  joinProductionForFilters: true,
  xuongViaProductionJoin: true,
  productionJoinCol: 'ma_id_sap', // ton_kho <-> production_status_app khớp qua ma_id_sap (phía sản xuất chuẩn hoá — sapKeySql)
};
export const ANALYSIS_TABLES: Record<string, TrendTableConfig> = {
  order:     { table: 'dht',        dateCol: 'ngay_nhan_tu_pm', valueCol: 'tri_gia_don_hang_tong', hexCol: 'hex', xuongCol: 'xuong_chinh', congTrinhCol: 'ten_cong_trinh', valueDivisor: 1,  dvtCol: 'dvt', joinProductionForFilters: true, productionJoinCol: 'hex' },
  tkbv:      { table: 'tkbv_full',  dateCol: 'ngay_nhan',       valueCol: 'tri_gia_don_hang_tong', hexCol: 'hex', xuongCol: 'xuong_chinh', congTrinhCol: 'ten_cong_trinh', valueDivisor: 1, joinProductionForFilters: true, productionJoinCol: 'hex' },
  pthsp:     { table: 'pthsp_full', dateCol: 'ngay_hoan_thanh', valueCol: 'tri_gia_don_hang_tong', hexCol: 'hex', xuongCol: 'xuong_chinh', congTrinhCol: 'ten_cong_trinh', valueDivisor: 1, joinProductionForFilters: true, productionJoinCol: 'hex' },
  inventory: { table: 'nhap_kho',   dateCol: 'date',            valueCol: 'thanh_tien_nhap_kho',   hexCol: 'hex', xuongCol: 'xuong_chinh', congTrinhCol: 'ten_cong_trinh', valueDivisor: 1, joinProductionForFilters: true, productionJoinCol: 'hex' },
  // Xuất kho: giá trị (thành tiền, triệu đồng) như các nguồn khác — dòng đơn vị phụ (không "TÍNH") có thành tiền 0 nên không cộng trùng
  export:    { table: 'xuat_kho',   dateCol: 'date',            valueCol: 'thanh_tien_xuat_kho',   hexCol: 'hex', xuongCol: 'xuong_chinh', congTrinhCol: 'ten_cong_trinh', valueDivisor: 1, joinProductionForFilters: true, productionJoinCol: 'hex' },
};
export const ALLOWED_ANALYSIS_KEYS = new Set(Object.keys(ANALYSIS_TABLES));
export const TREND_SOURCES = new Set([...Object.keys(ANALYSIS_TABLES), 'stock']);

// Ép text -> numeric. Dạng khoa học ("6.4e-06", "1.5E+03") ép thẳng — trước bị xoá ký tự ngoài [0-9.-]
// nên "6.4e-06" thành "6.4-06" => NULL, "1.5e+03" thành "1.503" (sai im lặng). Dấu phẩy ngăn nghìn được
// bỏ; số mũ quá 3 chữ số => NULL (tránh lỗi tràn numeric làm hỏng cả câu lệnh). Dạng khác giữ hành vi cũ.
// Cột generated *_num trong DB vẫn dùng biểu thức cũ — đề xuất sửa: sql/2026-10-10_fix_sci_numbers.sql
const SCI_NUMBER_RE = `'^\\s*-?[0-9]+(\\.[0-9]+)?[eE][-+]?[0-9]+\\s*$'`;
const SCI_EXP_OK_RE = `'[eE][-+]?0*[0-9]{1,3}\\s*$'`;
const numericFromText = (textExpr: string) => `
  CASE
    WHEN REPLACE(${textExpr}, ',', '') ~ ${SCI_NUMBER_RE}
    THEN CASE WHEN ${textExpr} ~ ${SCI_EXP_OK_RE} THEN TRIM(REPLACE(${textExpr}, ',', ''))::numeric END
    ELSE NULLIF(
      CASE
        WHEN regexp_replace(${textExpr}, '[^0-9.-]', '', 'g') ~ '^-?[0-9]+(\\.[0-9]+)?$'
        THEN regexp_replace(${textExpr}, '[^0-9.-]', '', 'g')
        ELSE NULL
      END,
      ''
    )::numeric
  END
`;

export const numericExpr = (col: string) => numericFromText(`"${col}"::text`);

// Đặt ngay dưới numericExpr — dùng khi cần alias bảng (trường hợp có JOIN)
export const numericExprQualified = (qualifiedCol: string) => numericFromText(`${qualifiedCol}::text`);


// Map "table.column" -> tên generated column numeric tương ứng (xem migration 001).
// Khi có trong map, dùng thẳng cột đã tính sẵn (có index) thay vì regex runtime.
export const NUMERIC_GENERATED_COLUMNS: Record<string, string> = {
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
export const numericCol = (table: string, col: string): string => {
  const generated = NUMERIC_GENERATED_COLUMNS[`${table}.${col}`];
  return generated ? `"${generated}"` : numericExpr(col);
};

// Dùng khi CÓ alias bảng (trường hợp JOIN, ví dụ /api/trend với alias "m")
export const numericColQualified = (table: string, alias: string, col: string): string => {
  const generated = NUMERIC_GENERATED_COLUMNS[`${table}.${col}`];
  return generated ? `${alias}."${generated}"` : numericExprQualified(`${alias}."${col}"`);
};
