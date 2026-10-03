import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { validateBody } from '../server/validation.js';
import { app } from '../server/app.js';
import { PREF_KEYS, mergePrefs, isMissingSchema, invalidateUsersCache } from '../notifications.js';

// ============================================================================
// HỘP THÔNG BÁO + CÀI ĐẶT THÔNG BÁO của người đang đăng nhập (đã qua middleware JWT chung).
// Chưa chạy SQL tạo bảng thì trả `available: false` thay vì lỗi 500.
// ============================================================================

const me = (req: Request) => String(req.user!.id);

// Danh sách (mới nhất trước), phân trang bằng `before` = id thông báo cuối của trang trước
app.get('/api/notifications', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 30));
    const before = Number(req.query.before) || null;
    const [list, unread] = await Promise.all([
      pool.query(
        `SELECT id, kind, title, body, vuong_mac_id, hex, actor, created_at, read_at
         FROM notifications
         WHERE user_id = $1 AND ($2::bigint IS NULL OR id < $2)
         ORDER BY id DESC LIMIT $3`,
        [me(req), before, limit + 1]
      ),
      pool.query('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [me(req)]),
    ]);
    const rows = list.rows.slice(0, limit);
    res.json({
      success: true,
      available: true,
      unread: unread.rows[0].n,
      hasMore: list.rows.length > limit,
      items: rows.map(r => ({
        id: Number(r.id), kind: r.kind, title: r.title, body: r.body,
        vuongMacId: r.vuong_mac_id === null ? null : Number(r.vuong_mac_id),
        hex: r.hex, actor: r.actor, createdAt: r.created_at, readAt: r.read_at,
      })),
    });
  } catch (e) {
    if (isMissingSchema(e)) return res.json({ success: true, available: false, unread: 0, hasMore: false, items: [] });
    console.error('Lỗi /api/notifications:', e);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

app.get('/api/notifications/unread-count', async (req: Request, res: Response) => {
  try {
    const r = await pool.query('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [me(req)]);
    res.json({ success: true, available: true, unread: r.rows[0].n });
  } catch (e) {
    if (isMissingSchema(e)) return res.json({ success: true, available: false, unread: 0 });
    console.error('Lỗi /api/notifications/unread-count:', e);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// Đánh dấu đã đọc: có `ids` => các thông báo đó; không có => tất cả
const readSchema = z.object({ ids: z.array(z.number().int().positive()).max(500).optional() });
app.post('/api/notifications/read', validateBody(readSchema), async (req: Request, res: Response) => {
  try {
    const ids: number[] | undefined = req.body.ids;
    if (ids && ids.length === 0) return res.json({ success: true });
    await pool.query(
      `UPDATE notifications SET read_at = now()
       WHERE user_id = $1 AND read_at IS NULL AND ($2::bigint[] IS NULL OR id = ANY($2::bigint[]))`,
      [me(req), ids ?? null]
    );
    res.json({ success: true });
  } catch (e) {
    if (isMissingSchema(e)) return res.json({ success: true, available: false });
    console.error('Lỗi /api/notifications/read:', e);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// Cài đặt bật/tắt từng loại thông báo
app.get('/api/notifications/prefs', async (req: Request, res: Response) => {
  try {
    const r = await pool.query('SELECT notify_prefs FROM users WHERE id = $1', [req.user!.id]);
    res.json({ success: true, available: true, prefs: mergePrefs(r.rows[0]?.notify_prefs) });
  } catch (e) {
    if (isMissingSchema(e)) return res.json({ success: true, available: false, prefs: mergePrefs(null) });
    console.error('Lỗi /api/notifications/prefs:', e);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

const prefsSchema = z.object({
  prefs: z.object(Object.fromEntries(PREF_KEYS.map(k => [k, z.boolean().optional()])) as Record<string, z.ZodOptional<z.ZodBoolean>>),
});
app.put('/api/notifications/prefs', validateBody(prefsSchema), async (req: Request, res: Response) => {
  try {
    const cur = await pool.query('SELECT notify_prefs FROM users WHERE id = $1', [req.user!.id]);
    const next = mergePrefs({ ...mergePrefs(cur.rows[0]?.notify_prefs), ...req.body.prefs });
    await pool.query('UPDATE users SET notify_prefs = $1::jsonb WHERE id = $2', [JSON.stringify(next), req.user!.id]);
    invalidateUsersCache();
    res.json({ success: true, available: true, prefs: next });
  } catch (e) {
    if (isMissingSchema(e)) return res.status(409).json({ success: false, available: false, message: 'Chưa bật tính năng cài đặt thông báo (cần chạy SQL)' });
    console.error('Lỗi PUT /api/notifications/prefs:', e);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});
