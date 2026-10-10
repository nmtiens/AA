import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool, timedQuery, withTransaction } from '../db.js';
import { ensureWorkshopGroups, getWorkshopMapping, normWorkshop } from '../server/workshopGroups.js';
import { authenticateJWT, requireRole } from '../server/auth.js';
import { validateBody } from '../server/validation.js';
import { app } from '../server/app.js';

// ============================================================================
// VIEW PROJECT MAPPING — danh sách công trình đã setup cho từng view (Luồng
// đỏ, Căn mẫu...), lưu tập trung ở DB thay vì localStorage để mọi người dùng
// truy cập web ở bất kỳ máy nào đều thấy cùng 1 cấu hình do admin setup.
// ============================================================================
const viewMappingSchema = z.object({
  projects: z.array(z.string()),
});

// Cấu hình nhỏ đọc lúc mở app (view-project-mapping, table-column-config): giữ trong bộ nhớ 30 giây, DB tạm lỗi
// (vd pooler hết kết nối khi cả trang bắn ~20 request lúc đăng nhập) thì thử lại 1 lần, vẫn lỗi thì trả bản cũ
// đã có — trước 2 API này hay trả 500 đúng lúc vừa đăng nhập. Lưu (POST) thì xoá bản nhớ.
const SETTINGS_TTL_MS = 30_000;
const settingsCache = new Map<string, { at: number; value: unknown }>();
const readSetting = async <T>(key: string, load: () => Promise<T>): Promise<T> => {
  const hit = settingsCache.get(key);
  if (hit && Date.now() - hit.at < SETTINGS_TTL_MS) return hit.value as T;
  try {
    let value: T;
    try { value = await load(); } catch {
      await new Promise(r => setTimeout(r, 400));
      value = await load();
    }
    settingsCache.set(key, { at: Date.now(), value });
    return value;
  } catch (error) {
    if (hit) { console.error(`Lỗi đọc ${key} — trả bản đã lưu:`, error); return hit.value as T; }
    throw error;
  }
};

// GET: public (mọi user cần đọc để lọc đúng dữ liệu view của họ, không cần đăng nhập admin)
app.get('/api/view-project-mapping', async (_req: Request, res: Response) => {
  try {
    const mapping = await readSetting('view-project-mapping', async () => {
      const r = await timedQuery(`SELECT view_id, projects FROM view_project_mapping`);
      const out: Record<string, string[]> = {};
      r.rows.forEach(row => {
        out[row.view_id] = Array.isArray(row.projects) ? row.projects : [];
      });
      return out;
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
      settingsCache.delete('view-project-mapping');

      res.json({ success: true, message: 'Đã lưu setup' });
    } catch (error) {
      console.error('Lỗi view-project-mapping POST:', error);
      res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
    }
  }
);

// ============================================================================
// SETUP GỘP XƯỞNG — mã xưởng gốc -> xưởng gộp (bảng workshop_group_mapping).
// GET: mọi user đã đăng nhập (trang setup + để frontend gộp đúng tên xưởng).
// POST: chỉ ADMIN — thay toàn bộ setup.
// ============================================================================
const workshopGroupSchema = z.object({
  mapping: z.record(z.string().max(100), z.string().max(100)),
});

app.get('/api/workshop-groups', authenticateJWT, async (req: Request, res: Response) => {
  try {
    // ?codes=1: kèm danh sách mã xưởng đang có trong dữ liệu + số dòng ở từng bảng (cho trang setup)
    let codes: { code: string; counts: Record<string, number>; total: number }[] | undefined;
    if (req.query.codes) {
      const tables = ['production_status_app', 'nhap_kho', 'xuat_kho', 'dht', 'khsx', 'khsx_nam'];
      const r = await timedQuery(
        tables.map(t => `SELECT '${t}' AS tbl, UPPER(TRIM(xuong_chinh::text)) AS code, COUNT(*)::int AS n
           FROM ${t} WHERE xuong_chinh IS NOT NULL AND TRIM(xuong_chinh::text) <> '' GROUP BY 2`).join(' UNION ALL ')
      );
      const byCode = new Map<string, Record<string, number>>();
      r.rows.forEach((row: { tbl: string; code: string; n: number }) => {
        const c = byCode.get(row.code) || {};
        c[row.tbl] = (c[row.tbl] || 0) + Number(row.n);
        byCode.set(row.code, c);
      });
      codes = [...byCode.entries()]
        .map(([code, counts]) => ({ code, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) }))
        .sort((a, b) => b.total - a.total);
    }
    res.json({ mapping: getWorkshopMapping(), codes });
  } catch (error) {
    console.error('Lỗi workshop-groups GET:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post(
  '/api/workshop-groups',
  authenticateJWT,
  requireRole('ADMIN'),
  validateBody(workshopGroupSchema),
  async (req: Request, res: Response) => {
    try {
      const entries = Object.entries(req.body.mapping as Record<string, string>)
        .map(([raw, group]) => [normWorkshop(raw), normWorkshop(group)] as const)
        .filter(([raw, group]) => raw && group && raw !== group);
      const by = req.user?.username || null;
      await withTransaction(async client => {
        await client.query('DELETE FROM workshop_group_mapping');
        for (const [raw, group] of entries) {
          await client.query(
            `INSERT INTO workshop_group_mapping (xuong_raw, xuong_group, updated_at, updated_by)
             VALUES ($1, $2, now(), $3)`,
            [raw, group, by]
          );
        }
      });
      await ensureWorkshopGroups(true);
      res.json({ success: true, message: 'Đã lưu setup gộp xưởng', mapping: getWorkshopMapping() });
    } catch (error: any) {
      if (error?.code === '42P01') {
        return res.status(500).json({ success: false, message: 'Chưa tạo bảng workshop_group_mapping (chạy file SQL 2026-10-07_workshop_groups.sql)' });
      }
      console.error('Lỗi workshop-groups POST:', error);
      res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
    }
  }
);

// ============================================================================
// TABLE COLUMN CONFIG — cấu hình cột được phép hiển thị / mặc định hiện cho
// từng bảng dữ liệu (Sản xuất, Đơn hàng, Nhập/Xuất kho...), lưu tập trung ở
// DB giống hệt cơ chế view_project_mapping ở trên.
//
// Migration cần chạy 1 lần trên DB (Postgres):
//
//   CREATE TABLE IF NOT EXISTS table_column_config (
//     table_id TEXT PRIMARY KEY,
//     allowed_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
//     default_visible_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
//     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
//   );
// ============================================================================
const tableColumnConfigSchema = z.object({
  allowedColumns: z.array(z.string()),
  defaultVisibleColumns: z.array(z.string()),
});

// GET: public (mọi user cần đọc để biết cột nào hiển thị, không cần đăng nhập admin)
app.get('/api/table-column-config', async (_req: Request, res: Response) => {
  try {
    const result = await readSetting('table-column-config', async () => {
      const r = await timedQuery(`SELECT table_id, allowed_columns, default_visible_columns FROM table_column_config`);
      const out: Record<string, { allowedColumns: string[]; defaultVisibleColumns: string[] }> = {};
      r.rows.forEach(row => {
        out[row.table_id] = {
          allowedColumns: Array.isArray(row.allowed_columns) ? row.allowed_columns : [],
          defaultVisibleColumns: Array.isArray(row.default_visible_columns) ? row.default_visible_columns : [],
        };
      });
      return out;
    });
    res.json(result);
  } catch (error) {
    console.error('Lỗi table-column-config GET:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST: chỉ ADMIN được sửa — lưu (upsert) cấu hình cột cho 1 bảng
app.post(
  '/api/table-column-config/:tableId',
  authenticateJWT,
  requireRole('ADMIN'),
  validateBody(tableColumnConfigSchema),
  async (req: Request, res: Response) => {
    try {
      const { tableId } = req.params;
      const { allowedColumns, defaultVisibleColumns } = req.body;

      await pool.query(
        `INSERT INTO table_column_config (table_id, allowed_columns, default_visible_columns, updated_at)
         VALUES ($1, $2::jsonb, $3::jsonb, now())
         ON CONFLICT (table_id) DO UPDATE
         SET allowed_columns = EXCLUDED.allowed_columns,
             default_visible_columns = EXCLUDED.default_visible_columns,
             updated_at = now()`,
        [tableId, JSON.stringify(allowedColumns), JSON.stringify(defaultVisibleColumns)]
      );
      settingsCache.delete('table-column-config');

      res.json({ success: true, message: 'Đã lưu setup cột' });
    } catch (error) {
      console.error('Lỗi table-column-config POST:', error);
      res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
    }
  }
);
