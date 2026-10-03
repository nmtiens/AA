import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { validateBody } from '../server/validation.js';
import { app } from '../server/app.js';
import { PREF_KEYS, mergePrefs, isMissingSchema, invalidateUsersCache } from '../notifications.js';
import { isPushEnabled, sendToUsers } from '../vuongMacPush.js';

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

// ---------------------------------------------------------------------------
// KIỂM TRA: vì sao không nhận được thông báo? Trả về tình trạng từng khâu (không lộ khoá bí mật).
// ---------------------------------------------------------------------------
const safeCount = async (sql: string, params: any[] = []): Promise<number | null> => {
  try { return Number((await pool.query(sql, params)).rows[0]?.n ?? 0); }
  catch (e) { if (isMissingSchema(e)) return null; throw e; }
};

app.get('/api/notifications/diagnose', async (req: Request, res: Response) => {
  try {
    const uid = me(req);
    const [user, mySubs, inboxMine, inboxAll7d, prefs] = await Promise.all([
      pool.query('SELECT full_name FROM users WHERE id = $1', [req.user!.id]),
      safeCount('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = $1', [uid]),
      safeCount('SELECT COUNT(*) AS n FROM notifications WHERE user_id = $1', [uid]),
      safeCount(`SELECT COUNT(*) AS n FROM notifications WHERE created_at > now() - interval '7 days'`),
      pool.query('SELECT notify_prefs FROM users WHERE id = $1', [req.user!.id]).then(r => r.rows[0]?.notify_prefs ?? null).catch(() => undefined),
    ]);
    let lastBotScan: string | null = null;
    try {
      lastBotScan = (await pool.query('SELECT MAX(notified_at) AS t FROM vuong_mac_bot_notifications')).rows[0]?.t ?? null;
    } catch { /* bảng chưa có */ }

    res.json({
      success: true,
      server: {
        vapid: isPushEnabled(),                       // đủ VAPID_PUBLIC_KEY / PRIVATE_KEY / SUBJECT
        cronSecret: !!process.env.CRON_SECRET,
        inboxTable: inboxMine !== null,               // đã chạy SQL tạo bảng notifications
        prefsColumn: prefs !== undefined,             // đã có cột users.notify_prefs
      },
      me: {
        fullName: user.rows[0]?.full_name ?? null,
        devices: mySubs ?? 0,                         // số thiết bị đã bật thông báo đẩy
        inboxCount: inboxMine ?? 0,
        prefs: mergePrefs(prefs ?? null),
      },
      system: {
        notifications7d: inboxAll7d,                  // tổng thông báo đã tạo 7 ngày qua (mọi người)
        lastBotScan,                                  // lần gần nhất cron nhắc hạn BOT gửi được thông báo
      },
    });
  } catch (e) {
    console.error('Lỗi /api/notifications/diagnose:', e);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// Gửi thử 1 thông báo cho CHÍNH MÌNH (vào hộp thông báo + đẩy lên các thiết bị đã bật)
app.post('/api/notifications/test', async (req: Request, res: Response) => {
  try {
    const uid = me(req);
    const title = 'Thông báo thử';
    const body = 'Nếu bạn thấy thông báo này thì thông báo đã hoạt động.';
    let savedToInbox = false;
    try {
      await pool.query(
        `INSERT INTO notifications (user_id, kind, title, body, actor) VALUES ($1, 'test', $2, $3, $4)`,
        [uid, title, body, req.user!.username]
      );
      savedToInbox = true;
    } catch (e) {
      if (!isMissingSchema(e)) throw e;
    }
    const push = await sendToUsers([uid], { title, body, tag: `test-${Date.now()}`, target: { hex: '', category: '', id: 0 } });
    res.json({ success: true, savedToInbox, pushEnabled: isPushEnabled(), ...push });
  } catch (e) {
    console.error('Lỗi /api/notifications/test:', e);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});
