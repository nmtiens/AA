import { getToken } from './userService';
import { taoHangDoi, type MucUuTien } from '../utils/hangDoiApi';

// Phát ra khi một request /api/* (đã gửi kèm token) bị server trả 401
// => token hết hạn / bị thu hồi. AuthContext lắng nghe để đăng xuất.
export const AUTH_EXPIRED_EVENT = 'auth:expired';

const isSameOriginApi = (url: string): URL | null => {
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin && u.pathname.startsWith('/api/') ? u : null;
  } catch {
    return null;
  }
};

// Giới hạn số request /api/* chạy cùng lúc. Lúc đăng nhập / mở trang, giao diện bắn ~20 request một lượt; trên
// Vercel mỗi request đang chạy thường cần 1 instance riêng, mỗi instance mở kết nối DB riêng => vượt trần pooler
// ("no more connections allowed (max_client_conn)") => hàng loạt 500. Request thứ 5 trở đi xếp hàng chờ.
// 8 (12/10/2026) làm pooler Layerbase đầy liên tục (mỗi instance giữ tối đa 2 kết nối) => hạ về 4.
const MAX_API_CONCURRENCY = 4;
// Vẫn 4 suất; suất trống phát theo mức ưu tiên (số màn đầu trước, việc lùi được sau) — xem utils/hangDoiApi.ts
const hangDoi = taoHangDoi(MAX_API_CONCURRENCY);

const DUONG_ME = '/api/auth/me';
// Mức 1: số màn đầu của trang Tổng quan / Tổng quan công trình và cấu hình mà trang phải chờ mới vẽ
const MUC_1 = new Set([
  '/api/overview/summary', '/api/overview/tuy-chon-thoi-gian', '/api/trend', '/api/khsx-nam/plan-actual',
  '/api/khsx/ke-hoach-ngay', '/api/view-project-mapping', '/api/tong-quan/cong-trinh', '/api/cong-trinh/hang-muc',
]);
// Mức 3: không cần cho màn đầu (quyền nhập BOT, cảnh báo file lỗi, danh sách ô lọc, số cho xuất file, tải trước tab khác)
const MUC_3 = new Set([
  '/api/bot-cong-doan/quyen', '/api/bot-tong-hop/loi', '/api/data-update-log', '/api/stock/total-count',
  '/api/trend-by-congtrinh', '/api/trend-by-xuong', '/api/khsx-nhapkho/summary', '/api/bop-m2/nhieu',
  '/api/bot-tong-hop', '/api/khnk-sheet',
]);
/** Mức ưu tiên của 1 đường dẫn /api/* trong hàng đợi (0 cao nhất). So ĐÚNG TÊN: '/api/trend' khác '/api/trend-by-xuong'. */
export const mucUuTien = (pathname: string): MucUuTien => {
  if (pathname === DUONG_ME) return 0;
  if (MUC_1.has(pathname)) return 1;
  if (MUC_3.has(pathname) || pathname.startsWith('/api/filters/')) return 3;
  return 2;
};

// Giữ 1 suất cho /api/auth/me lúc mở app: các request gửi trước khi React vẽ lấp đầy 4 suất thì /auth/me (thứ chặn
// việc gắn trang) rơi sang lượt sau. Tự tắt khi /auth/me lấy được suất, hoặc sau 2 giây (không có /auth/me nào tới).
const GIU_SUAT_TOI_DA_MS = 2000;
let henTatGiu: ReturnType<typeof setTimeout> | null = null;
export const giuSuat = (bat: boolean): void => {
  if (henTatGiu) { clearTimeout(henTatGiu); henTatGiu = null; }
  hangDoi.giuSuat(bat);
  if (bat) henTatGiu = setTimeout(() => { henTatGiu = null; hangDoi.giuSuat(false); }, GIU_SUAT_TOI_DA_MS);
};

/**
 * Bọc window.fetch một lần khi app khởi động:
 * - Tự gắn "Authorization: Bearer <token>" cho mọi request /api/* cùng domain
 *   (backend bắt buộc đăng nhập cho toàn bộ /api/*, trừ login/quên mật khẩu).
 *   Request nào đã tự đặt header Authorization thì giữ nguyên.
 * - Tối đa MAX_API_CONCURRENCY request /api/* chạy cùng lúc (còn lại xếp hàng theo mức ưu tiên của mucUuTien).
 * - Nhận 401 từ route ngoài /api/auth/* trong khi đang có token => báo hết phiên.
 *   (/api/auth/* trả 401 cho lỗi nghiệp vụ như sai mật khẩu, nên bỏ qua.)
 */
export function installAuthFetch(): void {
  const w = window as Window & { __authFetchInstalled?: boolean };
  if (w.__authFetchInstalled) return;
  w.__authFetchInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const apiUrl = isSameOriginApi(url);
    if (!apiUrl) return originalFetch(input, init);

    const token = getToken();
    let finalInit = init;
    if (token) {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
      finalInit = { ...init, headers };
    }

    await hangDoi.xin(mucUuTien(apiUrl.pathname));
    // /auth/me đã có suất => thôi để dành, trả suất thứ 4 cho các request khác
    if (apiUrl.pathname === DUONG_ME) giuSuat(false);
    let res: Response;
    try {
      res = await originalFetch(input, finalInit);
    } finally {
      hangDoi.tra();
    }
    if (res.status === 401 && token && !apiUrl.pathname.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    return res;
  };
}
