import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool, timedQuery } from '../db.js';
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
    const r = await timedQuery(`SELECT table_id, allowed_columns, default_visible_columns FROM table_column_config`);
    const result: Record<string, { allowedColumns: string[]; defaultVisibleColumns: string[] }> = {};
    r.rows.forEach(row => {
      result[row.table_id] = {
        allowedColumns: Array.isArray(row.allowed_columns) ? row.allowed_columns : [],
        defaultVisibleColumns: Array.isArray(row.default_visible_columns) ? row.default_visible_columns : [],
      };
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

      res.json({ success: true, message: 'Đã lưu setup cột' });
    } catch (error) {
      console.error('Lỗi table-column-config POST:', error);
      res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
    }
  }
);
