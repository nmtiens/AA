import { getToken } from './userService';

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

/**
 * Bọc window.fetch một lần khi app khởi động:
 * - Tự gắn "Authorization: Bearer <token>" cho mọi request /api/* cùng domain
 *   (backend bắt buộc đăng nhập cho toàn bộ /api/*, trừ login/quên mật khẩu).
 *   Request nào đã tự đặt header Authorization thì giữ nguyên.
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

    const res = await originalFetch(input, finalInit);
    if (res.status === 401 && token && !apiUrl.pathname.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    return res;
  };
}
