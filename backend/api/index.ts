import express, { Request, Response } from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import { pool } from '../src/db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(compression()); // Nén gzip response — giảm 70-90% dung lượng JSON
app.use(express.json());

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
    'so_luong_yeu_cau', 'dvt', 'ngay_pr',  'nhom_vt', 'so_po',
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

  // Nếu input dạng epoch timestamp (chuỗi số hoặc kiểu number)
  if (!isNaN(Number(rawInput))) {
    const num = Number(rawInput);
    // Nếu là timestamp milliseconds (ví dụ: 1714000000000), còn ít hơn thì coi là seconds
    const dateVal = new Date(num > 10000000000 ? num : num * 1000);
    return !isNaN(dateVal.getTime()) ? dateVal : null;
  }

  // Nếu input dạng ISO String (ví dụ: "2026-08-28T02:41:02.841Z")
  const parsed = new Date(rawInput);
  return !isNaN(parsed.getTime()) ? parsed : null;
};

// Helper lấy dữ liệu an toàn cho từng bảng (INCREMENTAL SYNC + CẮT CỘT)
const fetchTableData = async (tableName: string, updatedAfter?: string) => {
  try {
    const cols = REPORT_COLUMNS[tableName];
    const selectClause = cols ? cols.map(c => `"${c}"`).join(', ') : '*';

    let query = `SELECT ${selectClause} FROM ${tableName}`;
    let values: any[] = [];

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
const VERSION_KEYS = [
  'production', 'material', 'khsx', 'order', 'inventory',
  'tkbv', 'pthsp', 'analysis', 'yearlyPlan', 'export', 'attendance', 'stock'
];

// Thay hàm getVersions() cũ bằng bản này —
// 1 query nhẹ thay vì 12 query MAX() trên bảng lớn
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
let cachedData: any = null;
let cachedVersions: Record<string, string> | null = null;

app.get('/api/all-data', async (_req: Request, res: Response) => {
  try {
    const versions = await getVersions();

    if (cachedData && JSON.stringify(versions) === JSON.stringify(cachedVersions)) {
      return res.json(cachedData);
    }

    const [
      production, material, khsx, order, inventory,
      tkbv, pthsp, analysis, yearlyPlan, exportData,
      attendance, stock
    ] = await Promise.all(TABLES.map(t => fetchTableData(t)));

    const payload = {
      production, material, khsx, order, inventory,
      tkbv, pthsp, analysis, yearlyPlan, export: exportData,
      attendance, stock,
    };

    cachedData = payload;
    cachedVersions = versions;

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
    let values: any[] = [];
    
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

// ============================================================================
// CÁC ENDPOINT MỚI — TÍNH TOÁN Ở DATABASE THAY VÌ Ở FRONTEND
// ============================================================================

const ANALYSIS_TABLES: Record<string, {
  table: string; dateCol: string; valueCol: string; hexCol: string;
  xuongCol: string; congTrinhCol: string;
}> = {
  order:     { table: 'dht',        dateCol: 'ngay_nhan_tu_pm', valueCol: 'tri_gia_don_hang_tong', hexCol: 'hex', xuongCol: 'xuong_chinh', congTrinhCol: 'ten_cong_trinh' },
  tkbv:      { table: 'tkbv_full',  dateCol: 'ngay_nhan',       valueCol: 'tri_gia_don_hang_tong', hexCol: 'hex', xuongCol: 'xuong_chinh', congTrinhCol: 'ten_cong_trinh' },
  pthsp:     { table: 'pthsp_full', dateCol: 'ngay_hoan_thanh', valueCol: 'tri_gia_don_hang_tong', hexCol: 'hex', xuongCol: 'xuong_chinh', congTrinhCol: 'ten_cong_trinh' },
  inventory: { table: 'nhap_kho',   dateCol: 'date',            valueCol: 'thanh_tien_nhap_kho',   hexCol: 'hex', xuongCol: 'xuong_chinh', congTrinhCol: 'ten_cong_trinh' },
  export:    { table: 'xuat_kho',   dateCol: 'date',            valueCol: 'so_luong_xuat_kho',     hexCol: 'hex', xuongCol: 'xuong_chinh', congTrinhCol: 'ten_cong_trinh' },
};
const ALLOWED_ANALYSIS_KEYS = new Set(Object.keys(ANALYSIS_TABLES));

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

// Trả về: số liệu "trong ngày" + "lũy kế tháng" cho 5 nguồn dữ liệu cùng lúc
// Dùng cho: 5 card ở phần "BÁO CÁO TỔNG QUAN"
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

    // Không có bất kỳ tham số ngày nào -> lấy tổng hợp toàn bộ thời gian
    const useAllTime = !hasDateTo && !hasDateFrom && !useExplicitDates;

    const dateToDate = parseSafeDate(req.query.dateTo as string)
      || parseSafeDate(req.query.date as string)
      || new Date();
    const dateFromDate = parseSafeDate(req.query.dateFrom as string) || dateToDate;

    const dateToStr = dateToDate.toISOString().slice(0, 10);
    const dateFromStr = dateFromDate.toISOString().slice(0, 10);
    const monthStart = `${dateToStr.slice(0, 7)}-01`;

    const entries = await Promise.all(
  Object.entries(ANALYSIS_TABLES).map(async ([key, cfg]) => {
    let periodCond: string;
    let mtdCond: string;
    let params: any[];

    if (useAllTime) {
      periodCond = 'TRUE';
      mtdCond = `parse_vn_date("${cfg.dateCol}") BETWEEN $1 AND $2`;
      params = [monthStart, dateToStr];
    } else if (useExplicitDates) {
      periodCond = `parse_vn_date("${cfg.dateCol}") = ANY($1::date[])`;
      mtdCond = `parse_vn_date("${cfg.dateCol}") BETWEEN $2 AND $3`;
      params = [explicitDates, monthStart, dateToStr];
    } else {
      periodCond = `parse_vn_date("${cfg.dateCol}") BETWEEN $1 AND $2`;
      const monthEnd = new Date(dateToDate.getFullYear(), dateToDate.getMonth() + 1, 0).toISOString().slice(0, 10);
mtdCond = `parse_vn_date("${cfg.dateCol}") BETWEEN $3 AND $4`;
params = [dateFromStr, dateToStr, monthStart, monthEnd];
    }

    // Card 1 (P001 - Đơn hàng mới): đếm TỔNG SỐ DÒNG, không loại trùng hex.
    // Các card còn lại vẫn đếm theo hex duy nhất như cũ.
   // Áp dụng đếm duy nhất (DISTINCT) theo mã HEX cho tất cả các card để đếm đúng số đơn hàng
    const countExpr = `COUNT(DISTINCT "${cfg.hexCol}")`;

    const q = `
      SELECT
        ${countExpr} FILTER (WHERE ${periodCond}) AS period_count,
        COALESCE(SUM(${numericExpr(cfg.valueCol)}) FILTER (WHERE ${periodCond}), 0) AS period_value,
        ${countExpr} FILTER (WHERE ${mtdCond}) AS mtd_count,
        COALESCE(SUM(${numericExpr(cfg.valueCol)}) FILTER (WHERE ${mtdCond}), 0) AS mtd_value
      FROM ${cfg.table}
    `;

    const r = await pool.query(q, params);
    return [key, {
      daily: { count: Number(r.rows[0].period_count), value: Number(r.rows[0].period_value) },
      mtd: { count: Number(r.rows[0].mtd_count), value: Number(r.rows[0].mtd_value) },
    }] as const;
  })
);

    const results: Record<string, any> = {};
    entries.forEach(([key, val]) => { results[key] = val; });
    res.json({ date: dateToStr, dateFrom: dateFromStr, ...results });
  } catch (error) {
    console.error('Lỗi overview/summary:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Trả về: chi tiết theo Xưởng hoặc Công trình cho 1 nguồn dữ liệu
// Dùng cho: modal "Xem chi tiết" của mỗi card
app.get('/api/overview/by-group', async (req: Request, res: Response) => {
  try {
    const { key, groupBy, date } = req.query as { key: string; groupBy: string; date?: string };
    if (!ALLOWED_ANALYSIS_KEYS.has(key)) return res.status(400).json({ error: 'Invalid key' });
    if (groupBy !== 'xuong' && groupBy !== 'congtrinh') return res.status(400).json({ error: 'Invalid groupBy' });

    const cfg = ANALYSIS_TABLES[key];
    const groupCol = groupBy === 'congtrinh' ? cfg.congTrinhCol : cfg.xuongCol;
    const targetDate = parseSafeDate(date) || new Date();
    const dateStr = targetDate.toISOString().slice(0, 10);
    const monthStart = `${dateStr.slice(0, 7)}-01`;

    const q = `
      SELECT
        COALESCE(NULLIF(TRIM("${groupCol}"), ''), 'Chưa xác định') AS name,
        COUNT(DISTINCT "${cfg.hexCol}") FILTER (WHERE parse_vn_date("${cfg.dateCol}") = $1) AS daily_count,
        COALESCE(SUM(${numericExpr(cfg.valueCol)}) FILTER (WHERE parse_vn_date("${cfg.dateCol}") = $1), 0) AS daily_value,
        COUNT(DISTINCT "${cfg.hexCol}") FILTER (WHERE parse_vn_date("${cfg.dateCol}") BETWEEN $2 AND $1) AS mtd_count,
        COALESCE(SUM(${numericExpr(cfg.valueCol)}) FILTER (WHERE parse_vn_date("${cfg.dateCol}") BETWEEN $2 AND $1), 0) AS mtd_value
      FROM ${cfg.table}
      WHERE parse_vn_date("${cfg.dateCol}") BETWEEN $2 AND $1
      GROUP BY 1
      ORDER BY mtd_value DESC
    `;
    const r = await pool.query(q, [dateStr, monthStart]);
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

// Trả về: danh sách các ngày có dữ liệu tồn kho + tổng mỗi ngày (không kéo hết 150k dòng chi tiết)
app.get('/api/stock/dates', async (_req: Request, res: Response) => {
  try {
    const q = `
      SELECT parse_vn_date(date) AS d,
             COUNT(DISTINCT ma_id_sap) AS count,
             COALESCE(SUM(${numericExpr('gia_tri')}), 0) AS value
      FROM ton_kho
      WHERE parse_vn_date(date) IS NOT NULL
      GROUP BY 1
      ORDER BY 1 DESC
    `;
    const r = await pool.query(q);
    res.json(r.rows.map(row => ({ date: row.d, count: Number(row.count), value: Number(row.value) })));
  } catch (error) {
    console.error('Lỗi stock/dates:', error);
    res.status(500).json({ error: 'Internal Server Error' });
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
      WHERE parse_vn_date(date) = $1
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

// Trả về: kế hoạch năm 2026, quý, thực hiện, theo xưởng
app.get('/api/revenue/2026', async (_req: Request, res: Response) => {
  try {
    const planQ = await pool.query(`
      SELECT
        COALESCE(SUM(${numericExpr('thanh_tien_ke_hoach')}), 0) AS total,
        COALESCE(SUM(${numericExpr('thanh_tien_ke_hoach')})
          FILTER (WHERE NULLIF(regexp_replace(thang::text, '[^0-9]', '', 'g'), '')::int BETWEEN 1 AND 3), 0) AS q1,
        COALESCE(SUM(${numericExpr('thanh_tien_ke_hoach')})
          FILTER (WHERE NULLIF(regexp_replace(thang::text, '[^0-9]', '', 'g'), '')::int BETWEEN 1 AND 6), 0) AS q2,
        COALESCE(SUM(${numericExpr('thanh_tien_ke_hoach')})
          FILTER (WHERE NULLIF(regexp_replace(thang::text, '[^0-9]', '', 'g'), '')::int BETWEEN 1 AND 9), 0) AS q3
      FROM khsx_nam WHERE nam::text LIKE '%2026%'
    `);

    const actualQ = await pool.query(`
      SELECT COALESCE(SUM(${numericExpr('thanh_tien_nhap_kho')}), 0) AS total
      FROM nhap_kho
      WHERE nam::text LIKE '%2026%' OR date::text LIKE '%2026%' OR EXTRACT(YEAR FROM parse_vn_date(date::text)) = 2026
    `);

    const TARGET_WORKSHOPS = ['2A', '3A', '4A', '5A', '8AB', '8C'];

    const byWorkshopPlanQ = await pool.query(`
      SELECT CASE WHEN xuong_chinh = ANY($1::text[]) THEN xuong_chinh ELSE 'KHÁC' END AS name,
             COALESCE(SUM(${numericExpr('thanh_tien_ke_hoach')}), 0) AS plan
      FROM khsx_nam WHERE nam::text LIKE '%2026%'
      GROUP BY 1
    `, [TARGET_WORKSHOPS]);

    const byWorkshopActualQ = await pool.query(`
      SELECT CASE WHEN xuong_chinh = ANY($1::text[]) THEN xuong_chinh ELSE 'KHÁC' END AS name,
             COALESCE(SUM(${numericExpr('thanh_tien_nhap_kho')}), 0) AS actual
      FROM nhap_kho
      WHERE nam::text LIKE '%2026%' OR date::text LIKE '%2026%' OR EXTRACT(YEAR FROM parse_vn_date(date::text)) = 2026
      GROUP BY 1
    `, [TARGET_WORKSHOPS]);

    const planRow = planQ.rows[0];
    const targetTotal = Number(planRow.total);

    // FIX: đơn vị gốc trong DB là VND -> phải chia cho 1 Tỷ (1_000_000_000)
    // để khớp đơn vị "Tỷ" với targetTotal (từ khsx_nam) và với byWorkshop bên dưới.
    // Trước đây chia nhầm cho 1000 khiến actualTotal bị lệch ~1 triệu lần
    // (VD: hiện 1,890,719,857.8 thay vì đúng ra phải là 949.2).
    const actualTotal = Number(actualQ.rows[0].total) / 1000000000;

    const workshopMap: Record<string, { plan: number; actual: number }> = {};
    byWorkshopPlanQ.rows.forEach(r => { workshopMap[r.name] = { plan: Number(r.plan), actual: 0 }; });
    byWorkshopActualQ.rows.forEach(r => {
      if (!workshopMap[r.name]) workshopMap[r.name] = { plan: 0, actual: 0 };
      workshopMap[r.name].actual = Number(r.actual) / 1000000000;
    });

    const byWorkshop = Object.entries(workshopMap)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => (a.name === 'KHÁC' ? 1 : b.name === 'KHÁC' ? -1 : a.name.localeCompare(b.name)));

    res.json({
      targetRevenue2026: targetTotal,
      quarterlyTargets: { q1: Number(planRow.q1), q2: Number(planRow.q2), q3: Number(planRow.q3), q4: targetTotal },
      actual: { value: actualTotal, percent: targetTotal > 0 ? (actualTotal / targetTotal) * 100 : 0 },
      byWorkshop,
    });
  } catch (error) {
    console.error('Lỗi revenue/2026:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

import bcrypt from 'bcrypt';

// ============================================================================
// AUTH API — TRUY XUẤT BẢNG users TRONG POSTGRES (thay cho Google Sheets)
// ============================================================================

// --- ĐĂNG NHẬP ---
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ thông tin' });
    }

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

    const { password_hash, ...safeUser } = user;

    res.json({
      success: true,
      user: {
        id: safeUser.id,
        username: safeUser.username,
        fullName: safeUser.full_name,
        email: safeUser.email,
        role: safeUser.role,
        permissions: safeUser.permissions || [],
      },
    });
  } catch (error) {
    console.error('Lỗi đăng nhập:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// --- QUÊN MẬT KHẨU: GỬI OTP ---
app.post('/api/auth/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Vui lòng nhập email' });

    const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ success: false, message: 'Email không tồn tại trong hệ thống' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 số
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // hết hạn sau 5 phút

    await pool.query(
      `UPDATE users SET otp_code = $1, otp_expires_at = $2, updated_at = now() WHERE id = $3`,
      [otp, expiresAt, user.id]
    );

    // TODO: cắm module gửi email thật ở đây (nodemailer/SES/...) — gửi otp tới email
    console.log(`[DEV] OTP cho ${email}: ${otp}`);

    res.json({ success: true, message: 'Đã gửi mã OTP đến email của bạn' });
  } catch (error) {
    console.error('Lỗi gửi OTP:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// --- XÁC THỰC OTP + ĐỔI MẬT KHẨU ---
app.post('/api/auth/verify-otp', async (req: Request, res: Response) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập đủ thông tin' });
    }

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

    const newHash = await bcrypt.hash(newPassword, 10);
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
app.post('/api/auth/change-password', async (req: Request, res: Response) => {
  try {
    const { username, oldPassword, newPassword } = req.body;
    if (!username || !oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập đủ thông tin' });
    }

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

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`,
      [newHash, user.id]
    );

    res.json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (error) {
    console.error('Lỗi đổi mật khẩu:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});


// --- LẤY DANH SÁCH USER ---
app.get('/api/users', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, username, full_name, email, role, permissions,
              msnv, department, note, is_active, created_at, updated_at
       FROM users ORDER BY created_at DESC`
    );

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

    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Lỗi lấy danh sách user:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// --- THÊM USER MỚI ---
app.post('/api/users', async (req: Request, res: Response) => {
  try {
    const { username, password, fullName, email, role, permissions, msnv, department, note, status } = req.body;

    if (!username || !password || !fullName) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ tên đăng nhập, mật khẩu, họ tên' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Tên đăng nhập đã tồn tại' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const isActive = status !== 'INACTIVE';

    const result = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, email, role, permissions, msnv, department, note, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, username, full_name, email, role, permissions, msnv, department, note, is_active, created_at`,
      [
        username,
        passwordHash,
        fullName,
        email || null,
        role || 'USER',
        permissions || [],
        msnv || null,
        department || null,
        note || null,
        isActive,
      ]
    );

    const u = result.rows[0];
    res.json({
      success: true,
      message: 'Tạo user thành công',
      data: {
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
      },
    });
  } catch (error) {
    console.error('Lỗi tạo user:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// --- CẬP NHẬT USER ---
app.put('/api/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, fullName, email, role, permissions, msnv, department, note, status } = req.body;

    const existing = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
    }

    // Build câu UPDATE động — chỉ đổi mật khẩu nếu có nhập
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const push = (col: string, val: any) => {
      fields.push(`${col} = $${idx}`);
      values.push(val);
      idx++;
    };

    if (fullName !== undefined) push('full_name', fullName);
    if (email !== undefined) push('email', email || null);
    if (role !== undefined) push('role', role);
    if (permissions !== undefined) push('permissions', permissions || []);
    if (msnv !== undefined) push('msnv', msnv || null);
    if (department !== undefined) push('department', department || null);
    if (note !== undefined) push('note', note || null);
    if (status !== undefined) push('is_active', status === 'ACTIVE');

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
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
      },
    });
  } catch (error) {
    console.error('Lỗi cập nhật user:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// --- XÓA USER ---
app.delete('/api/users/:id', async (req: Request, res: Response) => {
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


// Trả về: Tổng KH vs TH (đã DEDUP theo HEX) — theo Xưởng & theo Công trình
// Dùng cho: Section "Thống kê Tổng hợp: Kế hoạch & Nhập kho"
app.get('/api/khsx-nhapkho/summary', async (req: Request, res: Response) => {
  try {
    const { nam, thang, mode = 'month', tuan, ngay, congTrinh, xuong } = req.query as Record<string, string>;
    if (!nam) return res.status(400).json({ error: 'Missing nam' });

    const isWeek = mode === 'week';
    const phanLoaiPattern = isWeek ? '%TUẦN%' : '%THÁNG%';

    const normalize = (s: string) => s.trim().toUpperCase();
    const congTrinhList = congTrinh
      ? congTrinh.split(',').map(s => normalize(s)).filter(Boolean)
      : [];
    const xuongList = xuong
      ? xuong.split(',').map(s => normalize(s)).filter(Boolean)
      : [];

    // ---------- KHSX (Kế hoạch) ----------
    // QUAN TRỌNG: KHÔNG dedup theo hex. Đã verify: SUM trực tiếp trên toàn bộ dòng
    // khớp filter mới ra đúng số (165.08). Dedup theo hex trước đây làm mất dòng hợp lệ
    // (1 hex có thể có nhiều dòng kế hoạch khác giá trị nhau — không phải trùng lặp).
    const khParams: any[] = [phanLoaiPattern, nam];
    let khWhere = `WHERE UPPER(TRIM(phan_loai_kh)) LIKE $1 AND nam::text = $2`;
    if (thang) { khParams.push(thang); khWhere += ` AND thang::text = $${khParams.length}`; }
    if (isWeek && tuan) { khParams.push(tuan); khWhere += ` AND tuan::text = $${khParams.length}`; }
    if (isWeek && ngay) { khParams.push(ngay); khWhere += ` AND ngay::text = $${khParams.length}`; }
    if (congTrinhList.length) {
      khParams.push(congTrinhList);
      khWhere += ` AND UPPER(TRIM(ten_cong_trinh)) = ANY($${khParams.length}::text[])`;
    }
    if (xuongList.length) {
      khParams.push(xuongList);
      khWhere += ` AND UPPER(TRIM(xuong_chinh)) = ANY($${khParams.length}::text[])`;
    }

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

    // ---------- NHAP_KHO (Thực hiện) ----------
    // Giữ nguyên logic cũ: 1 hex có thể nhập kho nhiều lần khác ngày (giao hàng từng phần)
    // => chỉ loại duplicate thật sự (trùng y hệt hex + ngày + giá trị), không dedup theo hex đơn thuần.
        // ---------- NHAP_KHO (Thực hiện) ----------
    // QUAN TRỌNG: KHÔNG dedup theo hex hay theo tổ hợp (hex, date, thanh_tien_nhap_kho).
    // Đã verify: nhiều dòng có cùng hex+date+giá trị vẫn là các lần nhập kho hợp lệ khác nhau
    // (trùng giá trị chỉ là trùng hợp, không phải duplicate dữ liệu). Dedup trước đây làm mất
    // 197 dòng hợp lệ, khiến tổng TH giảm sai từ 150.9 xuống 149.05.
    const thParams: any[] = [nam];
    let thWhere = `WHERE nam::text = $1`;
    if (thang) { thParams.push(thang); thWhere += ` AND thang::text = $${thParams.length}`; }
    if (isWeek && tuan) { thParams.push(tuan); thWhere += ` AND tuan::text = $${thParams.length}`; }
    if (isWeek && ngay) { thParams.push(ngay); thWhere += ` AND ngay::text = $${thParams.length}`; }
    if (congTrinhList.length) {
      thParams.push(congTrinhList);
      thWhere += ` AND UPPER(TRIM(ten_cong_trinh)) = ANY($${thParams.length}::text[])`;
    }
    if (xuongList.length) {
      thParams.push(xuongList);
      thWhere += ` AND UPPER(TRIM(xuong_chinh)) = ANY($${thParams.length}::text[])`;
    }

    const thQuery = `
      SELECT
        TRIM(xuong_chinh) AS xuong,
        TRIM(ten_cong_trinh) AS cong_trinh,
        TRIM(ma_cong_trinh) AS ma_cong_trinh,
        COALESCE(SUM(${numericExpr('thanh_tien_nhap_kho')}), 0) / 1000000000 AS gia_tri
      FROM nhap_kho
      ${thWhere}
      GROUP BY TRIM(xuong_chinh), TRIM(ten_cong_trinh), TRIM(ma_cong_trinh)
    `;
    const thResult = await pool.query(thQuery, thParams);

    // ---------- Merge theo Xưởng ----------
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

    // ---------- Merge theo Công trình (Top 10) ----------
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
// app.listen(PORT, () => {
//  console.log(`Server running on http://localhost:${PORT}`);
// });

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;