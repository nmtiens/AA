import { getToken } from './userService';

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