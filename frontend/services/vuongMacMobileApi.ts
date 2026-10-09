import { getToken } from './userService';
import { UNAUTHORIZED, type FiveMCategory, type VuongMacItem } from './vuongMacService';

// ---------------- BOT helpers (khớp parseBotEnd phía server) ----------------
const RE = /(\d{2}):(\d{2}) (\d{2})\/(\d{2})\/(\d{4})\s*$/;

export const parseBotEnd = (bot?: string | null): Date | null => {
  const m = RE.exec((bot ?? '').trim());
  if (!m) return null;
  const d = new Date(`${m[5]}-${m[4]}-${m[3]}T${m[1]}:${m[2]}:00+07:00`);
  return isNaN(d.getTime()) ? null : d;
};

// "2026-09-30T16:21" (datetime-local) -> "16:21 30/09/2026"
export const fmtLocalInput = (v: string) => {
  const [d, t] = v.split('T');
  const [y, mo, da] = d.split('-');
  return `${t.slice(0, 5)} ${da}/${mo}/${y}`;
};

export const botStart = (bot?: string | null) =>
  /^\s*(\d{2}:\d{2} \d{2}\/\d{2}\/\d{4})\s*-/.exec(bot ?? '')?.[1] ?? null;

export const nowFmt = () => {
  const p = (n: number) => String(n).padStart(2, '0');
  const d = new Date();
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// ---------------- Web Push ----------------
const authJson = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getToken() ?? ''}`,
});

async function post(path: string, body: unknown) {
  const r = await fetch(path, { method: 'POST', headers: authJson(), body: JSON.stringify(body) });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.message || `Lỗi ${r.status}`);
  }
}

const b64 = (s: string) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};

/** Tên đăng nhập của người đang dùng app (đọc từ payload JWT; không xác thực, chỉ để hiển thị). */
export const currentUsername = (): string => {
  try {
    const t = getToken();
    if (!t) return '';
    const bytes = b64(t.split('.')[1]);
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return String(payload.username ?? '').trim();
  } catch {
    return '';
  }
};

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function isPushOn() {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(reg && (await reg.pushManager.getSubscription()) && Notification.permission === 'granted');
}

export async function enablePush() {
  if (!getToken()) throw new Error('Bạn cần đăng nhập trước khi bật thông báo');
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!key) throw new Error('Thiếu VITE_VAPID_PUBLIC_KEY');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Bạn chưa cho phép thông báo');

  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) }));
  await post('/api/push/subscribe', { subscription: sub.toJSON(), userAgent: navigator.userAgent });
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await post('/api/push/unsubscribe', { endpoint: sub.endpoint });
  await sub.unsubscribe();
}

// ---------------- Tra cứu hex (dùng cho tab "Tra cứu" trên mobile) ----------------
export type { HexHit } from './vuongMacService';
import type { HexHit } from './vuongMacService';

async function getJson<T>(path: string): Promise<T> {
  if (!getToken()) throw new Error(UNAUTHORIZED);
  const r = await fetch(path, { headers: authJson() });
  if (r.status === 401) throw new Error(UNAUTHORIZED);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as any).message || (d as any).error || `Lỗi ${r.status}`);
  return d as T;
}

export const fetchXuongList = () => getJson<string[]>('/api/vuong-mac/xuong');

// Backend yêu cầu: từ khóa >= 2 ký tự HOẶC có chọn xưởng
export const searchHex = (q: string, xuong: string) => {
  const qs = new URLSearchParams();
  if (q) qs.set('q', q);
  if (xuong) qs.set('xuong', xuong);
  return getJson<HexHit[]>(`/api/vuong-mac/hex-search?${qs}`);
};

// Ghi chú của 1 hex (khớp các cột ghi chú ở bảng "Chi tiết theo Hex"); full = nguyên văn
export const fetchHexNotes = async (hex: string): Promise<Record<string, string | null>> => {
  if (!getToken()) throw new Error(UNAUTHORIZED);
  const r = await fetch('/api/production/notes', {
    method: 'POST', headers: authJson(), body: JSON.stringify({ hexes: [hex], full: true }),
  });
  if (r.status === 401) throw new Error(UNAUTHORIZED);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as any).message || (d as any).error || `Lỗi ${r.status}`);
  return (d as Record<string, Record<string, string | null>>)[hex] || {};
};

// Tạo vướng mắc nhưng ném lỗi kèm message của server (vd. "Chỉ thành viên cùng phòng ban...")
export async function createVuongMacStrict(
  hex: string, category: FiveMCategory, content: string,
  extra: { handler: string; bot: string; solution: string; note: string },
): Promise<VuongMacItem> {
  if (!getToken()) throw new Error(UNAUTHORIZED);
  const r = await fetch('/api/vuong-mac', {
    method: 'POST', headers: authJson(), body: JSON.stringify({ hex, category, content, ...extra }),
  });
  if (r.status === 401) throw new Error(UNAUTHORIZED);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !(d as any).success) throw new Error((d as any).message || `Không gửi được (lỗi ${r.status})`);
  return (d as any).data;
}