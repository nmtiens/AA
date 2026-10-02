import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool, timedQuery } from '../db.js';
import { runWithLimit, GRACE_UNTIL_HOUR, vnDayKey, vnHour } from '../server/common.js';
import { authenticateJWT, requireRole } from '../server/auth.js';
import { validateBody } from '../server/validation.js';
import { parseSafeDate, fetchTableData, TABLES, getVersions, refreshAllDataCache, STOCK_TREND_CONFIG, ANALYSIS_TABLES } from '../server/data.js';
import { app } from '../server/app.js';

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
