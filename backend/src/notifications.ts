import { pool } from './db.js';
import { sendToUsers, recipientsFor } from './vuongMacPush.js';

// ============================================================================
// THÔNG BÁO VƯỚNG MẮC: mỗi sự kiện vừa LƯU vào hộp thông báo (bảng notifications) vừa GỬI
// thông báo đẩy (Web Push) tới các thiết bị đã bật. Tôn trọng cài đặt bật/tắt từng loại của
// từng người (users.notify_prefs). Không bao giờ ném lỗi ra ngoài: lỗi thông báo không được
// làm hỏng thao tác chính (thêm/sửa vướng mắc...).
//
// Cần chạy 1 lần: backend/sql/2026-10-03_notifications.sql. Khi chưa chạy, phần đẩy vẫn hoạt
// động, chỉ có hộp thông báo + cài đặt là tạm tắt.
// ============================================================================

export type NotifyKind =
  | 'mention' | 'assigned' | 'resolved' | 'reopened' | 'extend'
  | 'due60' | 'due15' | 'overdue' | 'new_in_dept'
  // Quy trình mới (2026-10-10): nhận xử lý, xác nhận đóng, bình luận, leo thang khi quá hạn lâu
  | 'accepted' | 'closed' | 'comment' | 'escalated';

export const PREF_KEYS = ['mention', 'assigned', 'status', 'extend', 'due', 'newInDept'] as const;
export type PrefKey = typeof PREF_KEYS[number];
export type NotifyPrefs = Record<PrefKey, boolean>;

// "Vướng mắc mới trong phòng ban" mặc định TẮT (dễ gây phiền), các loại khác BẬT
export const DEFAULT_PREFS: NotifyPrefs = {
  mention: true, assigned: true, status: true, extend: true, due: true, newInDept: false,
};

const PREF_OF: Record<NotifyKind, PrefKey> = {
  mention: 'mention', assigned: 'assigned', resolved: 'status', reopened: 'status', extend: 'extend',
  due60: 'due', due15: 'due', overdue: 'due', new_in_dept: 'newInDept',
  accepted: 'status', closed: 'status', comment: 'mention', escalated: 'due',
};

export const mergePrefs = (raw: unknown): NotifyPrefs => {
  const out = { ...DEFAULT_PREFS };
  if (raw && typeof raw === 'object') {
    for (const k of PREF_KEYS) if (typeof (raw as any)[k] === 'boolean') out[k] = (raw as any)[k];
  }
  return out;
};

// Lỗi "bảng / cột chưa tồn tại" => chưa chạy file SQL
export const isMissingSchema = (e: any) => e?.code === '42P01' || e?.code === '42703';
let warnedMissing = false;
const warnMissing = () => {
  if (warnedMissing) return;
  warnedMissing = true;
  console.warn('[notify] Chưa có bảng notifications / cột users.notify_prefs — chạy backend/sql/2026-10-03_notifications.sql để bật hộp thông báo');
};

// ---------------------------------------------------------------------------
// Danh sách người dùng đang hoạt động (cache 60 giây — dùng cho tag tên & người xử lý)
// ---------------------------------------------------------------------------
interface UserLite { id: string; username: string; fullName: string; role: string; prefs: NotifyPrefs }
let usersCache: { at: number; list: UserLite[] } | null = null;

async function activeUsers(): Promise<UserLite[]> {
  if (usersCache && Date.now() - usersCache.at < 60_000) return usersCache.list;
  let rows: any[];
  try {
    rows = (await pool.query(
      `SELECT id::text AS id, username, COALESCE(full_name, '') AS full_name, role, notify_prefs
       FROM users WHERE is_active`)).rows;
  } catch (e) {
    if (!isMissingSchema(e)) throw e;
    warnMissing();
    rows = (await pool.query(
      `SELECT id::text AS id, username, COALESCE(full_name, '') AS full_name, role FROM users WHERE is_active`)).rows;
  }
  const list = rows.map(r => ({
    id: r.id, username: r.username, fullName: String(r.full_name).trim(), role: String(r.role ?? ''), prefs: mergePrefs(r.notify_prefs),
  }));
  usersCache = { at: Date.now(), list };
  return list;
}

/** Xoá cache sau khi ai đó đổi cài đặt thông báo */
export const invalidateUsersCache = () => { usersCache = null; };

const lower = (s: string) => s.toLocaleLowerCase('vi');
const isWordChar = (ch: string | undefined) => !!ch && /[\p{L}\p{N}_]/u.test(ch);

/**
 * Người được tag trong đoạn chữ: "@Họ Tên" khớp họ tên (users.full_name), không phân biệt hoa thường.
 * Kiểm tra ranh giới để "@Nguyễn Văn A" không khớp nhầm khi chữ thật là "@Nguyễn Văn An".
 */
export async function findMentionedIds(...texts: (string | null | undefined)[]): Promise<Set<string>> {
  const text = lower(texts.filter(Boolean).join('\n'));
  const out = new Set<string>();
  if (!text.includes('@')) return out;
  for (const u of await activeUsers()) {
    if (!u.fullName) continue;
    const needle = '@' + lower(u.fullName);
    let i = text.indexOf(needle);
    while (i !== -1) {
      // Trước "@" không phải chữ/số (loại email "a@a.vn"), sau tên không dính chữ/số
      if (!isWordChar(text[i - 1]) && !isWordChar(text[i + needle.length])) { out.add(u.id); break; }
      i = text.indexOf(needle, i + 1);
    }
  }
  return out;
}

/** Người dùng có họ tên = người xử lý (so không phân biệt hoa thường) */
export async function idsByFullName(name?: string | null): Promise<string[]> {
  const n = lower((name ?? '').trim());
  if (!n) return [];
  return (await activeUsers()).filter(u => lower(u.fullName) === n).map(u => u.id);
}

/** Tài khoản ADMIN đang hoạt động — nhận thông báo leo thang khi vướng mắc quá hạn lâu */
export async function adminIds(): Promise<string[]> {
  return (await activeUsers()).filter(u => u.role === 'ADMIN').map(u => u.id);
}

export async function idsByUsername(...usernames: (string | null | undefined)[]): Promise<string[]> {
  const set = new Set(usernames.filter(Boolean) as string[]);
  return (await activeUsers()).filter(u => set.has(u.username)).map(u => u.id);
}

export { recipientsFor };

// ---------------------------------------------------------------------------
// Gửi
// ---------------------------------------------------------------------------
export interface VMRef { id: number; hex: string; category: string }
export interface NotifyEvent {
  kind: NotifyKind;
  userIds: Iterable<string>;
  title: string;
  body?: string | null;
}

const clip = (s: string, n = 140) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/**
 * Gửi nhiều loại thông báo cho 1 vướng mắc. Mỗi người chỉ nhận 1 thông báo: loại đứng TRƯỚC
 * trong `events` được ưu tiên (vd. vừa được tag vừa cùng phòng ban => chỉ nhận "được tag").
 * `actorUsername`: người thao tác — không tự báo cho chính mình.
 */
export async function notify(vm: VMRef, events: NotifyEvent[], actorUsername?: string | null): Promise<void> {
  try {
    const users = await activeUsers();
    const byId = new Map(users.map(u => [u.id, u]));
    const actorId = actorUsername ? users.find(u => u.username === actorUsername)?.id : undefined;

    const chosen = new Map<string, NotifyEvent>();
    for (const ev of events) {
      for (const id of ev.userIds) {
        if (id === actorId || chosen.has(id)) continue;
        const u = byId.get(id);
        if (!u || !u.prefs[PREF_OF[ev.kind]]) continue;
        chosen.set(id, ev);
      }
    }
    if (chosen.size === 0) return;

    // 1) Lưu vào hộp thông báo
    const rows = [...chosen.entries()];
    try {
      await pool.query(
        `INSERT INTO notifications (user_id, kind, title, body, vuong_mac_id, hex, actor)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::int[], $6::text[], $7::text[])`,
        [
          rows.map(([id]) => id),
          rows.map(([, ev]) => ev.kind),
          rows.map(([, ev]) => ev.title),
          rows.map(([, ev]) => (ev.body ? clip(ev.body, 500) : null)),
          rows.map(() => vm.id),
          rows.map(() => vm.hex),
          rows.map(() => actorUsername ?? null),
        ]
      );
    } catch (e) {
      if (isMissingSchema(e)) warnMissing();
      else console.error('[notify] lưu thông báo lỗi', e);
    }

    // 2) Gửi đẩy — gom theo từng sự kiện
    for (const ev of events) {
      const ids = rows.filter(([, e]) => e === ev).map(([id]) => id);
      if (ids.length === 0) continue;
      await sendToUsers(ids, {
        title: ev.title,
        body: clip(ev.body ?? ''),
        tag: `${ev.kind}-${vm.id}`,
        target: { hex: vm.hex, category: vm.category, id: vm.id },
      });
    }
  } catch (e) {
    console.error('[notify] lỗi', e);
  }
}

/** Tên hiển thị của người thao tác trong tiêu đề thông báo */
export async function displayName(username?: string | null): Promise<string> {
  if (!username) return 'Ai đó';
  const u = (await activeUsers()).find(x => x.username === username);
  return u?.fullName || username;
}
