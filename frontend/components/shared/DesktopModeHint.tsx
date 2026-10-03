import { useEffect, useState } from 'react';

// ============================================================================
// Phát hiện: điện thoại đang mở trang ở chế độ "Trang web cho máy tính" (Desktop site).
// Khi đó trình duyệt dựng trang rộng ~980px rồi thu nhỏ cả trang cho vừa màn hình => chữ rất nhỏ,
// và trang KHÔNG thể tự đổi lại được (trình duyệt bỏ qua cài đặt viewport của trang).
// => Hiện 1 dòng nhắc cách tắt chế độ đó, kèm nút mở app điện thoại (/m/).
// ============================================================================

const HIDE_KEY = 'desktop_mode_hint_hidden';

/** Tỉ lệ "trang rộng hơn màn hình thật" (> 1 nghĩa là đang bị thu nhỏ); 0 = không phải trường hợp này */
const zoomOutRatio = () => {
  const touch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const shortSide = Math.min(window.screen.width, window.screen.height);   // bề ngang thật của điện thoại (CSS px)
  const layoutWidth = document.documentElement.clientWidth;               // bề ngang trang đang được dựng
  if (!touch || shortSide >= 600 || layoutWidth < 768) return 0;          // máy tính / máy tính bảng / đã hiển thị đúng
  const ratio = layoutWidth / window.screen.width;
  return ratio > 1.3 ? ratio : 0;
};

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export default function DesktopModeHint() {
  const [ratio, setRatio] = useState(0);
  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem(HIDE_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    const check = () => setRatio(zoomOutRatio());
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  if (!ratio || hidden) return null;

  const hide = () => {
    try { sessionStorage.setItem(HIDE_KEY, '1'); } catch { /* ignore */ }
    setHidden(true);
  };

  // Trang đang bị thu nhỏ theo `ratio` nên phóng chữ dòng nhắc lên tương ứng để vẫn đọc được
  const fs = Math.round(15 * Math.min(ratio, 3));

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[200] border-b border-amber-300 bg-amber-50 text-amber-950 shadow-md"
      style={{ fontSize: fs, padding: `${fs * 0.6}px ${fs * 0.8}px`, lineHeight: 1.35 }}
    >
      <p style={{ fontWeight: 600 }}>Điện thoại đang mở trang ở chế độ máy tính nên chữ rất nhỏ.</p>
      <p style={{ marginTop: fs * 0.3 }}>
        {isIOS()
          ? <>Cách sửa: bấm <b>aA</b> trên thanh địa chỉ Safari → chọn <b>“Yêu cầu trang web cho thiết bị di động”</b>.</>
          : <>Cách sửa: bấm <b>⋮</b> ở góc trên Chrome → bỏ chọn <b>“Trang web cho máy tính”</b>.</>}
      </p>
      <div style={{ display: 'flex', gap: fs * 0.6, marginTop: fs * 0.6, flexWrap: 'wrap' }}>
        <a
          href="/m/"
          className="rounded-full bg-slate-900 font-medium text-white"
          style={{ padding: `${fs * 0.45}px ${fs * 1}px` }}
        >
          Mở app điện thoại
        </a>
        <button
          onClick={hide}
          className="rounded-full border border-amber-400 bg-white"
          style={{ padding: `${fs * 0.45}px ${fs * 1}px` }}
        >
          Để sau
        </button>
      </div>
    </div>
  );
}
