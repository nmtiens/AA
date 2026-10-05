import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool, timedQuery } from '../db.js';
import { runWithLimit, GRACE_UNTIL_HOUR, vnDayKey, vnHour } from '../server/common.js';
import { authenticateJWT, requireRole } from '../server/auth.js';
import { validateBody } from '../server/validation.js';
import { parseSafeDate, fetchTableData, TABLES, getVersions, refreshAllDataCache, STOCK_TREND_CONFIG, ANALYSIS_TABLES } from '../server/data.js';
import { app } from '../server/app.js';

app.get('/api/all-data', async (req: Request, res: Response) => {
  try {
    const { payload } = await refreshAllDataCache();
    // ?tables=production,order: chỉ trả các bảng client cần (thường là bảng vừa đổi phiên bản),
    // tránh tải lại cả 12 bảng (~51k dòng sản xuất) khi chỉ 1 bảng thay đổi.
    // Không truyền => trả đủ 12 bảng như cũ (tương thích ngược với client cũ).
    const requested = String(req.query.tables || '').split(',').map(s => s.trim()).filter(Boolean);
    if (requested.length === 0) return res.json(payload);
    const subset: Record<string, unknown> = {};
    for (const key of requested) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) subset[key] = payload[key];
    }
    res.json(subset);
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

// Vật tư theo danh sách hex. Bảng vat_tu không có cột hex: mã nhà máy = 4 số đầu + hex
// (vd 1002250607396 -> hex 250607396). 1 ô ma_nha_may có thể chứa NHIỀU mã, cách nhau
// bằng dấu cách/phẩy, có khi kèm chữ ("1007260102622, HỦY ĐIỀU CHỈNH...") hoặc ghi thẳng
// hex 9 số. Nên tách mọi dãy số: dãy 13 số -> bỏ 4 số đầu; dãy 9 số -> chính là hex.
// Ô nhiều mã = 1 vật tư mua gộp cho nhiều hạng mục. Mỗi dòng vật tư trả về 1 lần, kèm
// các hex + mã nhà máy KHỚP danh sách hỏi (matched_codes) và tổng số mã trong ô gộp (total_codes).
// Hex không khớp được vật tư nào: lấy vật tư CHƯA có mã nhà máy chỉ định (ô trống / không có
// dãy 9 hoặc 13 số) của cùng công trình (production.ma_cong_trinh = vat_tu.trackingno).
// body.mode: 'matched' (mặc định) -> { rows } | 'unassigned' -> { rows } | 'unassigned-count' -> { lines, prs }
//            | 'hex-counts' -> { [hex]: số dòng vật tư khớp theo mã nhà máy }
const MATERIAL_BY_HEX_COLUMNS = [
  'ma_nha_may', 'trang_thai', 'trang_thai_sap', 'tinh_trang_pr', 'nguoi_yeu_cau',
  'so_pr', 'pr_line', 'ngay_pr', 'ma_vat_tu_sap', 'ten_vat_tu', 'nhom_vt', 'dvt',
  'so_luong_yeu_cau', 'so_luong_da_nhan_sap', 'so_luong_con_lai',
  'ngay_can_vat_tu', 'so_po', 'tinh_trang_po', 'ghi_chu_tinh_trang_po',
  'ngay_du_kien_giao_hang_pmh_nhap', 'ngay_thuc_te_ve', 'ngay_ve', 'sl_hang_ve_thuc_te',
  'team_pr_note', 'item_note_pr', 'ghi_chu_kho',
];

// Tách mọi mã trong ô ma_nha_may thành (id dòng vật tư, mã, hex)
const MATERIAL_CODES_CTE = `m AS (
  SELECT v.id, t AS code, CASE WHEN LENGTH(t) = 13 THEN SUBSTRING(t FROM 5) ELSE t END AS hex
  FROM vat_tu v, REGEXP_SPLIT_TO_TABLE(v.ma_nha_may, '[^0-9]+') AS t
  WHERE v.ma_nha_may IS NOT NULL AND LENGTH(t) IN (9, 13)
)`;

// Vật tư chưa có mã nhà máy, thuộc công trình của các hex KHÔNG khớp được vật tư nào
const UNASSIGNED_CTE = `${MATERIAL_CODES_CTE}, prj AS (
  SELECT DISTINCT UPPER(TRIM(p.ma_cong_trinh)) AS code
  FROM production_status_app p
  WHERE p.hex::text = ANY($1::text[])
    AND COALESCE(TRIM(p.ma_cong_trinh), '') <> ''
    AND NOT EXISTS (SELECT 1 FROM m WHERE m.hex = p.hex::text)
), u AS (
  SELECT v.*
  FROM vat_tu v JOIN prj ON UPPER(TRIM(v.trackingno)) = prj.code
  WHERE v.ma_nha_may IS NULL
     OR v.ma_nha_may !~ '(^|[^0-9])([0-9]{9}|[0-9]{13})([^0-9]|$)'
)`;

app.post('/api/material/by-hex', async (req: Request, res: Response) => {
  try {
    const hexes = Array.isArray(req.body?.hexes)
      ? req.body.hexes.map((h: unknown) => String(h).trim()).filter(Boolean)
      : [];
    const mode = String(req.body?.mode || 'matched');
    if (hexes.length > 5000) return res.status(400).json({ error: 'Too many hexes' });
    if (hexes.length === 0) {
      return res.json(mode === 'unassigned-count' ? { lines: 0, prs: 0 } : mode === 'hex-counts' ? {} : { rows: [] });
    }

    if (mode === 'hex-counts') {
      const c = await timedQuery(
        `WITH ${MATERIAL_CODES_CTE}
         SELECT hex, COUNT(DISTINCT id)::int AS n FROM m WHERE hex = ANY($1::text[]) GROUP BY hex`,
        [hexes],
        { timeoutMs: 20000 }
      );
      const out: Record<string, number> = {};
      c.rows.forEach((row: { hex: string; n: number }) => { out[row.hex] = row.n; });
      return res.json(out);
    }

    if (mode === 'unassigned-count') {
      const c = await timedQuery(
        `WITH ${UNASSIGNED_CTE}
         SELECT COUNT(*)::int AS lines, COUNT(DISTINCT so_pr)::int AS prs FROM u`,
        [hexes],
        { timeoutMs: 20000 }
      );
      return res.json(c.rows[0] ?? { lines: 0, prs: 0 });
    }

    const selectCols = MATERIAL_BY_HEX_COLUMNS.map(c => `v."${c}"`).join(', ');

    if (mode === 'unassigned') {
      const u = await timedQuery(
        `WITH ${UNASSIGNED_CTE}
         SELECT v.trackingno, v.ten_cong_trinh, ${selectCols}
         FROM u AS v
         ORDER BY v.trackingno, v.so_pr NULLS LAST, v.pr_line NULLS LAST
         LIMIT 20000`,
        [hexes],
        { timeoutMs: 20000 }
      );
      return res.json({ rows: u.rows });
    }

    const r = await timedQuery(
      `WITH ${MATERIAL_CODES_CTE}, hit AS (
         SELECT id,
                ARRAY_AGG(DISTINCT hex ORDER BY hex) FILTER (WHERE hex = ANY($1::text[])) AS hexes,
                ARRAY_AGG(DISTINCT code ORDER BY code) FILTER (WHERE hex = ANY($1::text[])) AS matched_codes,
                COUNT(DISTINCT code)::int AS total_codes
         FROM m
         GROUP BY id
         HAVING BOOL_OR(hex = ANY($1::text[]))
       ), pr AS (
         -- Tổng số hex / dòng của mỗi PR trên TOÀN BỘ vật tư (không chỉ các hex đang xem)
         SELECT v2.so_pr, COUNT(DISTINCT m.hex)::int AS pr_total_hexes, COUNT(DISTINCT m.id)::int AS pr_total_lines
         FROM m JOIN vat_tu v2 ON v2.id = m.id
         WHERE v2.so_pr IS NOT NULL
         GROUP BY v2.so_pr
       )
       SELECT hit.hexes, hit.matched_codes, hit.total_codes,
              pr.pr_total_hexes, pr.pr_total_lines, ${selectCols}
       FROM hit JOIN vat_tu v ON v.id = hit.id
       LEFT JOIN pr ON pr.so_pr = v.so_pr
       ORDER BY hit.hexes[1], v.so_pr NULLS LAST, v.pr_line NULLS LAST`,
      [hexes],
      { timeoutMs: 20000 }
    );
    res.json({ rows: r.rows });
  } catch (error) {
    console.error('Lỗi /api/material/by-hex:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Chi tiết 1 PR: PR đó mua cho những hex nào (trên toàn bộ dữ liệu), mỗi hex thuộc
// hạng mục / công trình / PC nào. Mỗi dòng = 1 cặp (dòng vật tư của PR, hex).
// body.inFilterHexes (tuỳ chọn): các hex trong bộ lọc của trang đang mở -> trả thêm
// filterValues = tập giá trị các thuộc tính của những hex đó, để client giải thích vì sao
// 1 hex của PR nằm NGOÀI bộ lọc (vd Tình trạng IPO / PC / công trình khác).
const PR_REASON_COLUMNS: Record<string, string> = {
  tinh_trang_ipo: 'tinh_trang_ipo',
  ten_pc: 'ten_pc',
  ten_pm: 'ten_pm',
  khu_vuc_du_an: 'khu_vuc_du_an',
  ten_cong_trinh: 'ten_cong_trinh',
  thang_can_giao: `COALESCE(TO_CHAR(ngay_can_giao, 'MM/YYYY'), '')`,
};

app.post('/api/material/pr-hexes', async (req: Request, res: Response) => {
  try {
    const pr = Number(req.body?.pr);
    if (!Number.isFinite(pr) || pr <= 0) return res.status(400).json({ error: 'Invalid PR' });
    const inFilterHexes: string[] = Array.isArray(req.body?.inFilterHexes)
      ? req.body.inFilterHexes.map((h: unknown) => String(h).trim()).filter(Boolean)
      : [];
    if (inFilterHexes.length > 5000) return res.status(400).json({ error: 'Too many hexes' });

    const reasonSelect = Object.entries(PR_REASON_COLUMNS).map(([k, expr]) => `${expr} AS ${k}`).join(', ');
    const r = await timedQuery(
      `WITH m AS (
         SELECT v.id, t AS code, CASE WHEN LENGTH(t) = 13 THEN SUBSTRING(t FROM 5) ELSE t END AS hex
         FROM vat_tu v, REGEXP_SPLIT_TO_TABLE(v.ma_nha_may, '[^0-9]+') AS t
         WHERE v.so_pr = $1 AND v.ma_nha_may IS NOT NULL AND LENGTH(t) IN (9, 13)
       ), p AS (
         SELECT DISTINCT ON (hex::text) hex::text AS hex, ten_hang_muc, ma_cong_trinh, ${reasonSelect}
         FROM production_status_app
         WHERE hex::text IN (SELECT hex FROM m)
       )
       SELECT DISTINCT ON (v.pr_line, m.hex)
              v.pr_line, v.ten_vat_tu, v.trang_thai, v.dvt, v.so_luong_yeu_cau, v.so_luong_con_lai,
              m.hex, m.code AS ma_nha_may, (p.hex IS NOT NULL) AS in_production,
              p.ten_hang_muc, p.ma_cong_trinh, ${Object.keys(PR_REASON_COLUMNS).map(k => `p.${k}`).join(', ')}
       FROM vat_tu v
       JOIN m ON m.id = v.id
       LEFT JOIN p ON p.hex = m.hex
       WHERE v.so_pr = $1
       ORDER BY v.pr_line, m.hex`,
      [pr],
      { timeoutMs: 20000 }
    );

    const filterValues: Record<string, string[]> = {};
    if (inFilterHexes.length > 0) {
      const f = await timedQuery(
        `SELECT ${Object.entries(PR_REASON_COLUMNS)
          .map(([k, expr]) => `ARRAY_AGG(DISTINCT COALESCE(${expr}, '')) AS ${k}`).join(', ')}
         FROM production_status_app
         WHERE hex::text = ANY($1::text[])`,
        [inFilterHexes],
        { timeoutMs: 20000 }
      );
      Object.keys(PR_REASON_COLUMNS).forEach(k => { filterValues[k] = f.rows[0]?.[k] ?? []; });
    }
    res.json({ rows: r.rows, filterValues });
  } catch (error) {
    console.error('Lỗi /api/material/pr-hexes:', error);
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


// --- NHẬT KÝ CẬP NHẬT DỮ LIỆU: dùng cho trang "Logs" hiển thị màu theo trạng thái ---
const TABLE_DISPLAY_NAMES: Record<string, string> = {
  dht: 'Dữ liệu Đơn hàng tổng',
  tkbv_full: 'Dữ liệu TKBV',
  pthsp_full: 'Dữ liệu PTHSP',
  nhap_kho: 'Dữ liệu Nhập kho',
  xuat_kho: 'Dữ liệu Xuất kho',
  ton_kho: 'Dữ liệu Tồn kho',
  production_status_app: 'Dữ liệu Sản xuất',
  vat_tu: 'Vật tư',
  khsx: 'Kế hoạch SX',
  khsx_nam: 'Dữ liệu kế hoạch năm',
  phan_tich_kh_th: 'Phân tích KH-TH',
  diem_danh: 'Dữ liệu Điểm danh',
};

// Thứ tự hiển thị mong muốn — khớp với thứ tự 6 card P001→Tồn kho ở "Tổng quan Đơn hàng",
// các bảng còn lại xếp tiếp theo sau. Index nhỏ hơn = ưu tiên hiển thị trước (khi cùng trạng thái).
const TABLE_DISPLAY_ORDER: string[] = [
  'dht', 'tkbv_full', 'pthsp_full', 'nhap_kho', 'xuat_kho', 'ton_kho',
  'production_status_app', 'vat_tu', 'khsx', 'khsx_nam', 'phan_tich_kh_th', 'diem_danh',
];

// ============================================================================
// [MỚI] MỞ RỘNG BẢNG table_versions CHO NHẬT KÝ CẬP NHẬT DỮ LIỆU
// Chạy 1 lần trên DB (migration thủ công, KHÔNG tự chạy từ code):
//
//   ALTER TABLE table_versions
//     ADD COLUMN IF NOT EXISTS display_label TEXT,
//     ADD COLUMN IF NOT EXISTS source_note TEXT,
//     ADD COLUMN IF NOT EXISTS note TEXT,
//     ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE,
//     ADD COLUMN IF NOT EXISTS manual_data_as_of_date DATE,
//     ADD COLUMN IF NOT EXISTS notes_updated_by TEXT,
//     ADD COLUMN IF NOT EXISTS notes_updated_at TIMESTAMPTZ;
//
// - display_label / manual_data_as_of_date: chỉ có ý nghĩa với dòng is_manual = TRUE
//   (nguồn dữ liệu tạo thủ công qua API bên dưới, không gắn với ETL/sync thật).
// - source_note, note: nhập tay cho MỌI dòng (kể cả 12 bảng hệ thống) — lưu
//   CHUNG bảng table_versions với nhật ký, đúng yêu cầu, không tạo bảng riêng.
// ============================================================================

// "Dữ liệu cập nhật đến ngày": ngày nghiệp vụ MỚI NHẤT có trong dữ liệu — khác
// last_updated (là thời điểm ETL/sync chạy). Chỉ tính tự động được cho các bảng
// có cột ngày nghiệp vụ rõ ràng, khớp đúng dateCol dùng ở ANALYSIS_TABLES /
// STOCK_TREND_CONFIG bên dưới (khai báo lại ở đây vì 2 map đó định nghĩa sau).
const DATA_AS_OF_DATE_COLUMN: Record<string, string> = {
  dht: 'ngay_nhan_tu_pm',
  tkbv_full: 'ngay_nhan',
  pthsp_full: 'ngay_hoan_thanh',
  nhap_kho: 'date',
  xuat_kho: 'date',
  ton_kho: 'date_parsed',
};

const fetchDataAsOfDates = async (): Promise<Record<string, string | null>> => {
  const entries = Object.entries(DATA_AS_OF_DATE_COLUMN);
  const results = await runWithLimit(
    entries.map(([table, col]) => async (): Promise<readonly [string, string | null]> => {
      try {
        const r = await timedQuery(`SELECT MAX("${col}") AS max_date FROM ${table}`);
        const maxDate = r.rows[0]?.max_date;
        return [table, maxDate ? new Date(maxDate).toISOString().slice(0, 10) : null] as const;
      } catch (error) {
        console.error(`Lỗi lấy "dữ liệu cập nhật đến ngày" cho ${table}:`, error);
        return [table, null] as const;
      }
    }),
    3
  );
  return Object.fromEntries(results);
};

const createLogEntrySchema = z.object({
  tableName: z.string().min(2).max(64).regex(/^[a-z][a-z0-9_]*$/, 'Chỉ gồm chữ thường, số, dấu gạch dưới, bắt đầu bằng chữ'),
  label: z.string().min(1).max(128),
  sourceNote: z.string().max(500).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
  dataAsOfDate: z.string().optional().nullable(),
});
const updateLogEntrySchema = z.object({
  sourceNote: z.string().max(500).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
  label: z.string().min(1).max(128).optional(), // chỉ áp dụng cho dòng is_manual
  dataAsOfDate: z.string().optional().nullable(), // chỉ áp dụng cho dòng is_manual
});

app.get('/api/data-update-log', async (_req: Request, res: Response) => {
  try {
    const [versionsResult, asOfDates] = await Promise.all([
      timedQuery(`
        SELECT table_name, last_updated, display_label, source_note, note,
               is_manual, manual_data_as_of_date
        FROM table_versions
        ORDER BY table_name
      `),
      fetchDataAsOfDates(),
    ]);

    const nowDate = new Date();
    const now = nowDate.getTime();

    // Các ngày (theo giờ VN) được coi là "đã cập nhật"
    const okDayKeys = new Set<string>([vnDayKey(nowDate)]);
    if (vnHour(nowDate) < GRACE_UNTIL_HOUR) {
      okDayKeys.add(vnDayKey(new Date(now - 24 * 60 * 60 * 1000)));
    }

    const rows = versionsResult.rows.map(row => {
      const lastUpdated = row.last_updated ? new Date(row.last_updated) : null;
      const hoursAgo = lastUpdated ? (now - lastUpdated.getTime()) / (1000 * 60 * 60) : Infinity;
      const dataAsOfDate = row.is_manual
        ? (row.manual_data_as_of_date ? new Date(row.manual_data_as_of_date).toISOString().slice(0, 10) : null)
        : (asOfDates[row.table_name] ?? null);

      return {
        table: row.table_name,
        label: row.display_label || TABLE_DISPLAY_NAMES[row.table_name] || row.table_name,
        lastUpdated: row.last_updated,
        // SỬA: theo ngày lịch giờ VN thay vì cửa sổ 24h
        isFresh: lastUpdated ? okDayKeys.has(vnDayKey(lastUpdated)) : false,
        hoursAgo: Number.isFinite(hoursAgo) ? Number(hoursAgo.toFixed(1)) : null,
        dataAsOfDate,
        sourceNote: row.source_note || '',
        note: row.note || '',
        isManual: !!row.is_manual,
      };
    });

    // Sắp xếp: các bảng ĐÃ cập nhật lên trước (theo thứ tự nghiệp vụ cố định),
    // các bảng CHƯA cập nhật đẩy xuống cuối (cũng theo thứ tự nghiệp vụ đó).
    // Nguồn thêm thủ công (is_manual, không nằm trong TABLE_DISPLAY_ORDER) xếp
    // cuối mỗi nhóm.
    rows.sort((a, b) => {
      if (a.isFresh !== b.isFresh) return a.isFresh ? -1 : 1;
      const ai = TABLE_DISPLAY_ORDER.indexOf(a.table);
      const bi = TABLE_DISPLAY_ORDER.indexOf(b.table);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    res.json(rows);
  } catch (error) {
    console.error('Lỗi /api/data-update-log:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- THÊM 1 NGUỒN DỮ LIỆU THỦ CÔNG (không gắn với bảng ETL thật) ---
app.post(
  '/api/data-update-log',
  authenticateJWT,
  requireRole('ADMIN'),
  validateBody(createLogEntrySchema),
  async (req: Request, res: Response) => {
    try {
      const { tableName, label, sourceNote, note, dataAsOfDate } = req.body;

      if (TABLES.includes(tableName)) {
        return res.status(409).json({ success: false, message: 'Trùng tên với bảng dữ liệu hệ thống' });
      }
      const existing = await pool.query('SELECT table_name FROM table_versions WHERE table_name = $1', [tableName]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ success: false, message: 'Nguồn dữ liệu này đã tồn tại' });
      }

      const parsedDate = parseSafeDate(dataAsOfDate);
      await pool.query(
        `INSERT INTO table_versions
           (table_name, last_updated, display_label, source_note, note,
            is_manual, manual_data_as_of_date, notes_updated_by, notes_updated_at)
         VALUES ($1, now(), $2, $3, $4, TRUE, $5, $6, now())`,
        [
          tableName, label, sourceNote || null, note || null,
          parsedDate ? parsedDate.toISOString().slice(0, 10) : null,
          req.user!.username,
        ]
      );

      res.json({ success: true, message: 'Đã thêm nguồn dữ liệu' });
    } catch (error) {
      console.error('Lỗi thêm data-update-log:', error);
      res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
    }
  }
);

// --- SỬA GHI CHÚ / NGUỒN DỮ LIỆU TỪ (áp dụng cho MỌI dòng) — và label / ngày
// dữ liệu (chỉ áp dụng cho dòng thủ công, vì dòng hệ thống lấy tự động) ---
app.put(
  '/api/data-update-log/:table',
  authenticateJWT,
  requireRole('ADMIN'),
  validateBody(updateLogEntrySchema),
  async (req: Request, res: Response) => {
    try {
      const { table } = req.params;
      const existing = await pool.query('SELECT is_manual FROM table_versions WHERE table_name = $1', [table]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy nguồn dữ liệu' });
      }
      const isManual = !!existing.rows[0].is_manual;

      const fields: string[] = ['notes_updated_by = $1', 'notes_updated_at = now()'];
      const values: any[] = [req.user!.username];
      let idx = 2;
      const push = (col: string, val: any) => { fields.push(`${col} = $${idx}`); values.push(val); idx++; };

      if (req.body.sourceNote !== undefined) push('source_note', req.body.sourceNote || null);
      if (req.body.note !== undefined) push('note', req.body.note || null);

      if (isManual) {
        if (req.body.label !== undefined) push('display_label', req.body.label);
        if (req.body.dataAsOfDate !== undefined) {
          const parsedDate = parseSafeDate(req.body.dataAsOfDate);
          push('manual_data_as_of_date', parsedDate ? parsedDate.toISOString().slice(0, 10) : null);
        }
      }

      if (fields.length === 2) {
        return res.status(400).json({ success: false, message: 'Không có dữ liệu để cập nhật' });
      }

      values.push(table);
      await pool.query(`UPDATE table_versions SET ${fields.join(', ')} WHERE table_name = $${idx}`, values);

      res.json({ success: true, message: 'Đã lưu' });
    } catch (error) {
      console.error('Lỗi sửa data-update-log:', error);
      res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
    }
  }
);

// --- XÓA 1 NGUỒN DỮ LIỆU THỦ CÔNG — không cho xóa 12 bảng hệ thống, vì
// table_versions của chúng gắn liền với cơ chế cache/ETL đang chạy ---
app.delete(
  '/api/data-update-log/:table',
  authenticateJWT,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { table } = req.params;
      const existing = await pool.query('SELECT is_manual FROM table_versions WHERE table_name = $1', [table]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy nguồn dữ liệu' });
      }
      if (!existing.rows[0].is_manual) {
        return res.status(403).json({ success: false, message: 'Không thể xóa nguồn dữ liệu hệ thống' });
      }
      await pool.query('DELETE FROM table_versions WHERE table_name = $1', [table]);
      res.json({ success: true, message: 'Đã xóa nguồn dữ liệu' });
    } catch (error) {
      console.error('Lỗi xóa data-update-log:', error);
      res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
    }
  }
);
