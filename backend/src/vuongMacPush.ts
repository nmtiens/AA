// Đặt CÙNG THƯ MỤC với file server chính (để import '../src/db.js' đúng như file server đang dùng).
import type { Express, RequestHandler } from 'express';
import webpush from 'web-push';
import { z } from 'zod';
import { pool } from '../src/db.js';
import { notify, idsByFullName, type NotifyKind } from './notifications.js';

// ---------------------------------------------------------------------------
// Đọc env LAZY (trong hàm), vì server chính gọi dotenv.config() SAU các import.
// ---------------------------------------------------------------------------
let pushEnabled = false;
function initWebPush() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  pushEnabled = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);
  if (pushEnabled) webpush.setVapidDetails(VAPID_SUBJECT!, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
  else console.warn('[push] Thiếu VAPID_* trong env: thông báo đẩy đang TẮT');
}

// ---------------------------------------------------------------------------
// "08:00 28/09/2026 - 16:21 30/09/2026" -> Date của mốc KẾT THÚC (giờ Việt Nam, +07:00)
// ---------------------------------------------------------------------------
const BOT_END_RE = /(\d{2}):(\d{2}) (\d{2})\/(\d{2})\/(\d{4})\s*$/;
export function parseBotEnd(bot?: string | null): Date | null {
  const m = BOT_END_RE.exec((bot ?? '').trim());
  if (!m) return null;
  const [, hh, mi, dd, mo, yyyy] = m;
  const d = new Date(`${yyyy}-${mo}-${dd}T${hh}:${mi}:00+07:00`);
  return isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Gửi push
// ---------------------------------------------------------------------------
export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  target: { hex: string; category: string; id: number };
}

async function runLimited<T>(items: T[], limit: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/** Đủ khoá VAPID để gửi thông báo đẩy chưa (dùng cho màn "Kiểm tra thông báo") */
export const isPushEnabled = () => pushEnabled;

/** Gửi đẩy tới mọi thiết bị đã đăng ký của các user. Trả về số thiết bị gửi được / lỗi. */
export async function sendToUsers(userIds: string[], payload: PushPayload): Promise<{ sent: number; failed: number; devices: number }> {
  if (!pushEnabled || userIds.length === 0) return { sent: 0, failed: 0, devices: 0 };
  const { rows } = await pool.query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1::text[])', [userIds]);
  const body = JSON.stringify(payload);
  let sent = 0, failed = 0;
  await runLimited(rows, 5, async (s: any) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600, urgency: 'high' });
      sent++;
    } catch (err: any) {
      failed++;
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]); // thiết bị đã gỡ/hết hạn
      } else {
        console.error('[push] lỗi gửi', err?.statusCode, err?.body);
      }
    }
  });
  return { sent, failed, devices: rows.length };
}

// Người nhận: người tạo + thành viên cùng phòng ban với người tạo (đúng nhóm có quyền thao tác, xem canModifyVuongMac)
export async function recipientsFor(createdBy: string | null, createdDept: string | null, excludeUsername?: string) {
  const r = await pool.query(
    `SELECT u.id::text AS id
       FROM users u
      WHERE u.is_active = true
        AND ($3::text IS NULL OR u.username <> $3::text)
        AND (u.username = $1::text
             OR ($2::text IS NOT NULL AND TRIM($2::text) <> '' AND LOWER(TRIM(u.department)) = LOWER(TRIM($2::text))))`,
    [createdBy, createdDept, excludeUsername ?? null]);
  return r.rows.map((x: any) => x.id as string);
}


// ---------------------------------------------------------------------------
// Quét hạn BOT — gọi bởi cron (mỗi 1–5 phút)
// ---------------------------------------------------------------------------
type Kind = 'due60' | 'due15' | 'overdue';
const kindOf = (botEnd: Date, now: Date): Kind | null => {
  const mins = (botEnd.getTime() - now.getTime()) / 60000;
  return mins <= 0 ? 'overdue' : mins <= 15 ? 'due15' : mins <= 60 ? 'due60' : null;
};
const TITLE: Record<Kind, (hex: string) => string> = {
  due60:   (h) => `BOT còn dưới 1 giờ — Hex ${h}`,
  due15:   (h) => `BOT còn dưới 15 phút — Hex ${h}`,
  overdue: (h) => `BOT đã quá hạn — Hex ${h}`,
};

export async function scanBotDeadlines() {
  const { rows } = await pool.query(
    `SELECT vm.id, vm.hex, vm.category, vm.content, vm.bot_end, vm.created_by, vm.handler, u.department AS created_department
       FROM vuong_mac vm
       LEFT JOIN users u ON u.username = vm.created_by
      WHERE vm.is_resolved = false
        AND vm.bot_end IS NOT NULL
        AND vm.bot_end <= now() + interval '60 minutes'
        AND vm.bot_end >= now() - interval '7 days'      -- quá hạn > 7 ngày thì thôi, tránh làm phiền
      ORDER BY vm.bot_end
      LIMIT 100`);
  const now = new Date();
  let notified = 0;
  for (const it of rows) {
    const kind = kindOf(new Date(it.bot_end), now);
    if (!kind) continue;
    // Ghi nhật ký TRƯỚC: đã có (cron chạy chồng, hoặc mốc này báo rồi) thì bỏ qua => không báo trùng
    const ins = await pool.query(
      `INSERT INTO vuong_mac_bot_notifications (vuong_mac_id, kind, bot_end) VALUES ($1,$2,$3)
       ON CONFLICT DO NOTHING RETURNING 1`, [it.id, kind, it.bot_end]);
    if (!ins.rowCount) continue;
    // Người nhận: người xử lý + người tạo + cùng phòng ban người tạo; lưu cả vào hộp thông báo
    const kindN: NotifyKind = kind;
    await notify({ id: it.id, hex: it.hex, category: it.category }, [{
      kind: kindN,
      userIds: [
        ...(await idsByFullName(it.handler)),
        ...(await recipientsFor(it.created_by, it.created_department)),
      ],
      title: TITLE[kind](it.hex),
      body: it.content,
    }]);
    notified++;
  }
  return { checked: rows.length, notified };
}

// ---------------------------------------------------------------------------
// Đăng ký route
// ---------------------------------------------------------------------------
const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(2000),
    keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
  }),
  userAgent: z.string().max(500).optional().nullable(),
});
const unsubscribeSchema = z.object({ endpoint: z.string().url().max(2000) });

export function registerVuongMacPush(app: Express, deps: { authenticateJWT: RequestHandler }) {
  initWebPush();
  const { authenticateJWT } = deps;

  app.post('/api/push/subscribe', authenticateJWT, async (req, res) => {
    const p = subscribeSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ' });
    const { subscription: s, userAgent } = p.data;
    try {
      await pool.query(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (endpoint) DO UPDATE
           SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
               user_agent = EXCLUDED.user_agent, last_seen_at = now()`,
        [String(req.user!.id), s.endpoint, s.keys.p256dh, s.keys.auth, userAgent ?? null]);
      res.sendStatus(204);
    } catch (e) {
      console.error('Lỗi push/subscribe:', e);
      res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
    }
  });

  app.post('/api/push/unsubscribe', authenticateJWT, async (req, res) => {
    const p = unsubscribeSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ' });
    try {
      await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2',
        [p.data.endpoint, String(req.user!.id)]);
      res.sendStatus(204);
    } catch (e) {
      console.error('Lỗi push/unsubscribe:', e);
      res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
    }
  });

  // Vercel Cron tự gửi "Authorization: Bearer <CRON_SECRET>". Dịch vụ ngoài có thể dùng header x-cron-key.
  const cronAuth: RequestHandler = (req, res, next) => {
    const expected = process.env.CRON_SECRET;
    if (!expected) return res.status(503).json({ ok: false, error: 'CRON_SECRET chưa được cấu hình' });
    const auth = req.headers.authorization;
    const key = auth?.startsWith('Bearer ') ? auth.slice(7) : (req.headers['x-cron-key'] as string | undefined);
    if (key !== expected) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    next();
  };

  app.get('/api/cron/vuong-mac-bot', cronAuth, async (_req, res) => {
    try {
      const startedAt = Date.now();
      const r = await scanBotDeadlines();
      res.json({ ok: true, ...r, ms: Date.now() - startedAt });
    } catch (e) {
      console.error('Lỗi cron vuong-mac-bot:', e);
      res.status(500).json({ ok: false, error: 'Scan failed' });
    }
  });
}
