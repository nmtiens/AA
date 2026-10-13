// ============================================================================
// ĐIỆN THOẠI BẬT "TRANG WEB CHO MÁY TÍNH" (Chrome Android: menu ⋮ → Trang web cho máy tính)
// Chế độ này bỏ qua <meta name="viewport"> và ép trang rộng 980px rồi thu nhỏ cho vừa màn → app Xưởng hiện bố cục máy
// tính, chữ / nút bé. Không đổi được viewport từ trang, nên app tự nhận ra rồi:
//   1. gắn <html class="dien-thoai">: các biến thể rsm: / rmd: … (tailwind.config.js) thôi áp → bố cục điện thoại;
//   2. đặt <body> rộng đúng bề rộng màn thật, phóng to (transform) cho đầy 980px — các phần position: fixed (thanh menu
//      dưới, cửa sổ thao tác gắn vào body) lấy body làm khung nên vẫn nằm gọn trong màn.
// Thử trên máy tính: localStorage.xuong_ep_dien_thoai = '1' (ép bật, bề rộng 412) / '0' (ép tắt).
// ============================================================================

const KHOA_EP = 'xuong_ep_dien_thoai';

/** Bề rộng màn thật (CSS px) khi đang ở chế độ máy tính trên điện thoại; null = không phải trường hợp này */
export function rongManThat(): number | null {
  let ep: string | null = null;
  try { ep = localStorage.getItem(KHOA_EP); } catch { /* bỏ qua */ }
  if (ep === '0') return null;
  if (ep === '1') return Math.min(412, window.innerWidth);
  // Chỉ điện thoại thật: chạm là chính (không chuột: hover: none), có điểm chạm, màn nhỏ (cạnh dài < 1100).
  // Laptop / máy tính màn cảm ứng có chuột (hover: hover) hoặc màn lớn => không bao giờ bật.
  const cam = window.matchMedia?.('(pointer: coarse)').matches && window.matchMedia?.('(hover: none)').matches
    && navigator.maxTouchPoints > 0;
  const manNho = screen.width > 0 && Math.max(screen.width, screen.height) < 1100;
  if (!cam || !manNho || window.innerWidth < 768) return null;
  // screen.width vẫn là bề rộng màn thật; trang rộng hơn hẳn => viewport bị ép
  if (screen.width > 0 && screen.width < 768 && window.innerWidth > screen.width * 1.25) return screen.width;
  // Dự phòng: trình duyệt thu nhỏ trang để vừa màn (tỉ lệ < 0,8)
  const tiLe = window.visualViewport?.scale ?? 1;
  if (tiLe < 0.8 && window.innerWidth * tiLe < 768) return Math.round(window.innerWidth * tiLe);
  return null;
}

/** Bật chế độ điện thoại nếu cần; theo dõi xoay màn. Trả hàm gỡ. */
export function apDungCheDoDienThoai(): () => void {
  const html = document.documentElement;
  const body = document.body;
  const goStyle = () => {
    html.classList.remove('dien-thoai');
    for (const k of ['position', 'top', 'left', 'width', 'height', 'transform', 'transformOrigin', 'overflow'] as const) body.style[k] = '';
    html.style.overflow = '';
  };
  let rongTruoc: number | null = null;
  const cap = () => {
    // Đo lại khi đã gỡ, để innerWidth / screen.width không bị ảnh hưởng bởi lần áp trước
    const rong = rongManThat();
    if (rong === null) { if (rongTruoc !== null) goStyle(); rongTruoc = null; return; }
    rongTruoc = rong;
    const s = window.innerWidth / rong;
    html.classList.add('dien-thoai');
    html.style.overflow = 'hidden';
    Object.assign(body.style, {
      position: 'fixed', top: '0', left: '0', width: `${rong}px`, height: `${window.innerHeight / s}px`,
      transform: `scale(${s})`, transformOrigin: '0 0', overflow: 'hidden',
    });
  };
  cap();
  window.addEventListener('resize', cap);
  window.addEventListener('orientationchange', cap);
  return () => {
    window.removeEventListener('resize', cap);
    window.removeEventListener('orientationchange', cap);
    goStyle();
  };
}
