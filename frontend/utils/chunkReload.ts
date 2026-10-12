import { lazy, type ComponentType } from 'react';

// Tab mở từ trước khi deploy bản mới: file JS tách trang (lazy) của bản cũ không còn trên Vercel (404) => chuyển
// trang bị lỗi / trắng. Tải lại cả trang 1 lần để lấy bản mới; chặn tải lại liên tục (≤ 1 lần / phút) khi lỗi do
// nguyên nhân khác (mất mạng...).
const KEY = 'opsHub_chunkReloadAt';

export const reloadForNewVersion = (): boolean => {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
};

/** lazy() có tự tải lại trang khi file JS của trang không tải được (vừa deploy bản mới). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const lazyPage = <T extends ComponentType<any>>(load: () => Promise<{ default: T }>) =>
  lazy(() => load().catch((err: unknown) => {
    if (reloadForNewVersion()) return new Promise<never>(() => { /* chờ trang tải lại */ });
    throw err;
  }));
