import { useSyncExternalStore } from 'react';

// ============================================================================
// GIAO DIỆN MÁY TÍNH BẢNG (iPad / Android tablet) cho app chính — app /m và /xuong có giao diện riêng, không áp.
// Nhận ra máy bảng thì gắn <html class="may-tinh-bang">:
//   - index.css (khối "Máy tính bảng"): ô nhập 16px (Safari không tự phóng to khi chạm), nút đủ to để chạm, chữ ≥ 12px…
//   - biến thể Tailwind `mtb:` (tailwind.config.js)
//   - App.tsx: menu trái thu thành dải biểu tượng, mở ra thì đè lên trang (không đẩy nội dung)
// Máy tính (kể cả laptop màn cảm ứng có chuột) không bao giờ bật. Màn hẹp < 768px (chia đôi màn hình) dùng bố cục điện thoại.
// ============================================================================

const LOP = 'may-tinh-bang';

/** Tách riêng để test: có phải máy bảng đang đủ rộng không */
export function laMayTinhBang(x: { duongDan: string; rong: number; manNgan: number; cham: number; chiCham: boolean; ua: string }): boolean {
  if (/^\/(m|xuong)(\/|$)/.test(x.duongDan)) return false;
  if (x.rong < 768 || x.manNgan < 700) return false;            // điện thoại (kể cả bật "trang cho máy tính")
  // iPadOS tự nhận là Macintosh; máy Mac thật không có màn cảm ứng. Gắn bàn phím / chuột vào iPad vẫn là iPad
  if (/iPad|Macintosh/.test(x.ua) && x.cham > 1) return true;
  return x.chiCham && x.cham > 1;
}

const xet = () => laMayTinhBang({
  duongDan: window.location.pathname,
  // cùng mốc với md: của Tailwind (innerWidth co lại khi chụm phóng to trang)
  rong: document.documentElement.clientWidth,
  manNgan: Math.min(window.screen.width, window.screen.height),
  cham: navigator.maxTouchPoints ?? 0,
  chiCham: !!window.matchMedia?.('(pointer: coarse)').matches && !!window.matchMedia?.('(hover: none)').matches,
  ua: navigator.userAgent,
});

let dang = false;
const nghe = new Set<() => void>();

/** Gọi 1 lần trước khi vẽ React: gắn class, theo dõi xoay màn / chia màn */
export function apDungMayTinhBang() {
  const chay = () => {
    const moi = xet();
    document.documentElement.classList.toggle(LOP, moi);
    if (moi !== dang) { dang = moi; nghe.forEach(f => f()); }
  };
  chay();
  window.addEventListener('resize', chay);
}

export const useMayTinhBang = () => useSyncExternalStore(f => { nghe.add(f); return () => { nghe.delete(f); }; }, () => dang);
/** Đọc 1 lần lúc vẽ (không cần vẽ lại khi đổi) */
export const dangMayTinhBang = () => dang;
