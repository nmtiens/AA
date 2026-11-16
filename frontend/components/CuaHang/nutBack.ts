import { useEffect, useRef } from 'react';

// ============================================================================
// Nút Back (điện thoại / trình duyệt) đóng lớp đang mở (cửa sổ chi tiết, ô xem ảnh lớn) thay vì rời trang /#/cua-hang.
//   Mở lớp => pushState 1 mục cùng URL (không đổi hash => router không đổi trang), đánh dấu bằng `khoa` trong state.
//   Back => popstate, mục của lớp không còn trên đỉnh => gọi onDong.
//   Đóng bằng nút X / Esc / bấm nền (mo chuyển false) => history.back() bỏ mục đã đẩy, để Back lần sau không "trống".
// Lớp lồng nhau dùng khoá khác nhau: Back khỏi ô xem ảnh không đóng cửa sổ chi tiết (state còn khoá của nó).
// Chỉ phụ thuộc mo (boolean) => StrictMode không đẩy 2 lần khi lớp mở sau lúc gắn.
// ============================================================================

type StateCoKhoa = Record<string, unknown> | null;

const docState = (): StateCoKhoa => {
  try { return (window.history.state as StateCoKhoa) ?? null; } catch { return null; }
};

export function useDongBangNutBack(mo: boolean, onDong: () => void, khoa: string): void {
  const dongRef = useRef(onDong);
  dongRef.current = onDong;

  useEffect(() => {
    if (!mo) return;
    let daDay = false;
    try {
      const cu = docState();
      window.history.pushState({ ...(cu && typeof cu === 'object' ? cu : {}), [khoa]: true }, '');
      daDay = true;
    } catch { /* trình duyệt chặn pushState: chỉ đóng bằng X / Esc như cũ */ }
    const pop = () => {
      if (!daDay || docState()?.[khoa]) return;
      daDay = false;
      dongRef.current();
    };
    window.addEventListener('popstate', pop);
    return () => {
      window.removeEventListener('popstate', pop);
      // Đóng không qua Back: bỏ mục đã đẩy (chỉ khi nó còn trên đỉnh — tránh lùi nhầm trang khác)
      if (daDay && docState()?.[khoa]) {
        try { window.history.back(); } catch { /* bỏ qua */ }
      }
    };
  }, [mo, khoa]);
}
