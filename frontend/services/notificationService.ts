import { getToken } from './userService';

// Hộp thông báo + cài đặt thông báo (xem backend/src/routes/notifications.ts)

export type NotifyKind =
  | 'mention' | 'assigned' | 'resolved' | 'reopened' | 'extend'
  | 'due60' | 'due15' | 'overdue' | 'new_in_dept'
  | 'accepted' | 'closed' | 'comment' | 'escalated';

export interface AppNotification {
  id: number;
  kind: NotifyKind;
  title: string;
  body: string | null;
  vuongMacId: number | null;
  hex: string | null;
  actor: string | null;
  createdAt: string;
  readAt: string | null;
}

export const PREF_LABELS = {
  mention:   { label: 'Có người tag tên tôi / bình luận', hint: 'Khi ai đó gõ @Tên của bạn hoặc bình luận vào vướng mắc của bạn' },
  assigned:  { label: 'Được giao xử lý', hint: 'Khi bạn được chọn làm người xử lý' },
  status:    { label: 'Nhận xử lý / đã xử lý / đóng / mở lại', hint: 'Vướng mắc tôi tạo, tôi xử lý hoặc được tag' },
  extend:    { label: 'Xin thêm thời gian', hint: 'Vướng mắc của phòng ban / tôi xử lý' },
  due:       { label: 'Nhắc hạn BOT', hint: 'Còn 1 giờ, còn 15 phút, khi quá hạn và khi quá hạn hơn 24 giờ (báo quản lý)' },
  newInDept: { label: 'Vướng mắc mới trong phòng ban', hint: 'Mỗi khi đồng nghiệp tạo vướng mắc' },
} as const;
export type PrefKey = keyof typeof PREF_LABELS;
export type NotifyPrefs = Record<PrefKey, boolean>;

const headers = () => {
  const t = getToken();
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
};

const json = async (r: Response) => {
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || `Lỗi ${r.status}`);
  return d;
};

export const fetchNotifications = async (before?: number): Promise<{
  items: AppNotification[]; unread: number; hasMore: boolean; available: boolean;
}> => {
  const qs = before ? `?before=${before}` : '';
  return json(await fetch(`/api/notifications${qs}`, { headers: headers() }));
};

export const fetchUnreadCount = async (): Promise<{ unread: number; available: boolean }> =>
  json(await fetch('/api/notifications/unread-count', { headers: headers() }));

/** Không truyền ids = đánh dấu đã đọc tất cả */
export const markNotificationsRead = async (ids?: number[]) =>
  json(await fetch('/api/notifications/read', { method: 'POST', headers: headers(), body: JSON.stringify(ids ? { ids } : {}) }));

export const fetchNotifyPrefs = async (): Promise<{ prefs: NotifyPrefs; available: boolean }> =>
  json(await fetch('/api/notifications/prefs', { headers: headers() }));

export const saveNotifyPrefs = async (prefs: Partial<NotifyPrefs>): Promise<{ prefs: NotifyPrefs }> =>
  json(await fetch('/api/notifications/prefs', { method: 'PUT', headers: headers(), body: JSON.stringify({ prefs }) }));

// ---------------- Kiểm tra vì sao không nhận được thông báo ----------------
export interface NotifyDiagnose {
  server: { vapid: boolean; cronSecret: boolean; inboxTable: boolean; prefsColumn: boolean };
  me: { fullName: string | null; devices: number; inboxCount: number; prefs: NotifyPrefs };
  system: { notifications7d: number | null; lastBotScan: string | null };
}

export const fetchNotifyDiagnose = async (): Promise<NotifyDiagnose> =>
  json(await fetch('/api/notifications/diagnose', { headers: headers() }));

export const sendTestNotification = async (): Promise<{
  savedToInbox: boolean; pushEnabled: boolean; sent: number; failed: number; devices: number;
}> => json(await fetch('/api/notifications/test', { method: 'POST', headers: headers() }));
