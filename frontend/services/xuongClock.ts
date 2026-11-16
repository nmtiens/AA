// ============================================================================
// LỆCH ĐỒNG HỒ MÁY (quyết định R8 — docs/designs/xuong-checkin.md)
// Mỗi lần đồng bộ: gọi GET /api/xuong/time, tự đo thời gian đi về, lệch = giờ server − điểm giữa (t0, t1).
// Mỗi sự kiện mang lệch gần nhất đo TRƯỚC lúc bấm. Trong một phiên trang, nếu Date.now() trôi khỏi
// performance.now() quá 60 giây (người dùng chỉnh giờ / máy đồng bộ lại giờ) thì các lần bấm sau đó gắn
// sauDoiGio = true cho tới lần đo lệch mới. Lệch lưu localStorage, quá 12 giờ coi như chưa đo.
// ============================================================================

const KHOA = 'xuong_lech_dong_ho';
const HET_HAN_MS = 12 * 3_600_000;
const NGUONG_DOI_GIO_MS = 60_000;

interface LechDaLuu { lechMs: number; doLuc: number }

/** Mốc gốc của phiên trang: Date.now() − performance.now() lúc đo lệch gần nhất */
let mocPhien: number | null = null;

const docLech = (): LechDaLuu | null => {
  try {
    const raw = localStorage.getItem(KHOA);
    if (!raw) return null;
    const v = JSON.parse(raw) as LechDaLuu;
    return typeof v.lechMs === 'number' && typeof v.doLuc === 'number' ? v : null;
  } catch { return null; }
};

const mocHienTai = () => Date.now() - performance.now();

/** Lệch tính từ một lần gọi: t0/t1 là giờ máy lúc gửi / nhận, serverNow là giờ server */
export const tinhLech = (t0: number, t1: number, serverNow: number): number => Math.round(serverNow - (t0 + t1) / 2);

/** Đo lệch bằng /api/xuong/time (máy trạm: /api/xuong/tram/may/time) và lưu lại. Lỗi mạng thì giữ lệch cũ. */
export async function doLech(fetchImpl: typeof fetch = fetch, duongDan = '/api/xuong/time', auth: () => Record<string, string> = authXuong): Promise<number | null> {
  try {
    const t0 = Date.now();
    const r = await fetchImpl(duongDan, { cache: 'no-store', headers: auth() });
    const t1 = Date.now();
    if (!r.ok) return docLech()?.lechMs ?? null;
    const { serverNow } = await r.json() as { serverNow: number };
    const lechMs = tinhLech(t0, t1, serverNow);
    try { localStorage.setItem(KHOA, JSON.stringify({ lechMs, doLuc: t1 } satisfies LechDaLuu)); } catch { /* bỏ qua */ }
    mocPhien = mocHienTai();
    return lechMs;
  } catch {
    return docLech()?.lechMs ?? null;
  }
}

/** Lệch dùng cho một lần bấm ngay bây giờ */
export function lechLucBam(): { lechMs: number | null; sauDoiGio: boolean } {
  const v = docLech();
  const conHan = !!v && Date.now() - v.doLuc >= -NGUONG_DOI_GIO_MS && Date.now() - v.doLuc <= HET_HAN_MS;
  const sauDoiGio = mocPhien !== null && Math.abs(mocHienTai() - mocPhien) > NGUONG_DOI_GIO_MS;
  return { lechMs: conHan ? v!.lechMs : null, sauDoiGio };
}

/** Lúc đo lệch gần nhất (ms, giờ máy) — null nếu chưa đo; dùng để đo lại khi đã lâu (vd quá 1 giờ) */
export function docLanDoLech(): number | null {
  return docLech()?.doLuc ?? null;
}

// Header đăng nhập mục Xưởng (dùng chung với xuongApi.ts — tránh import vòng)
export const XUONG_TOKEN_KEY = 'xuong_token';
export const XUONG_DEVICE_KEY = 'xuong_device_token';

/** Id người dùng ghi trong payload JWT (không kiểm chữ ký — chỉ để so người trên máy). Lỗi / không có: null */
export function idTuToken(tok: string | null | undefined): number | null {
  if (!tok) return null;
  try {
    const phan = tok.split('.')[1];
    if (!phan) return null;
    const b64 = phan.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(phan.length / 4) * 4, '=');
    const id = Number((JSON.parse(atob(b64)) as { id?: unknown }).id);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch { return null; }
}

/**
 * Token dùng cho mục Xưởng: token Xưởng (30 ngày) nếu cùng người với token app; người khác đã đăng nhập app
 * trên máy này thì dùng token app (không gửi dưới tên người trước). Token app hết hạn 8 giờ không xoá token Xưởng.
 */
export function tokenXuong(): string | null {
  let xt: string | null = null;
  let at: string | null = null;
  try { xt = localStorage.getItem(XUONG_TOKEN_KEY); } catch { /* bỏ qua */ }
  try { at = localStorage.getItem('app_token') || sessionStorage.getItem('app_token'); } catch { /* bỏ qua */ }
  if (xt && at) {
    const idX = idTuToken(xt);
    const idA = idTuToken(at);
    if (idX !== null && idA !== null && idX !== idA) return at;
  }
  return xt || at;
}

/** Người đang đăng nhập mục Xưởng trên máy (theo token đang dùng) — null nếu chưa đăng nhập / không đọc được */
export const idNguoiDangDung = (): number | null => idTuToken(tokenXuong());

/** Phiên Xưởng đã lưu (người + tổ, do app tổ ghi sau khi đăng ký máy) và tổ đang chọn */
export const XUONG_PHIEN_KEY = 'xuong_phien';
export const XUONG_TO_KEY = 'xuong_to_cuoi';

/** Người dùng phiên Xưởng lúc đăng xuất — đăng nhập lại cùng người thì giữ tổ đang chọn */
export const XUONG_NGUOI_CUOI_KEY = 'xuong_nguoi_cuoi';

const idTuPhien = (): number | null => {
  try { return Number((JSON.parse(localStorage.getItem(XUONG_PHIEN_KEY) || 'null') as { user?: { id?: unknown } } | null)?.user?.id) || null; } catch { return null; }
};

/** Gọi lúc đăng xuất, TRƯỚC khi xoá phiên Xưởng: nhớ id người để lần đăng nhập sau so */
export function nhoNguoiCuoiXuong(): void {
  try {
    const id = idTuPhien() ?? idNguoiDangDung();
    if (id !== null) localStorage.setItem(XUONG_NGUOI_CUOI_KEY, String(id));
  } catch { /* bỏ qua */ }
}

/**
 * Đăng nhập app xong: phiên Xưởng trên máy của người khác (hoặc không đọc được) thì bỏ token Xưởng, phiên và tổ
 * đang chọn — người mới không dùng nhầm tên / tổ người trước. Giữ mã thiết bị và hàng đợi. Trả true nếu đã bỏ.
 * Đã đăng xuất (không còn phiên): so với người nhớ lúc đăng xuất — cùng người thì giữ tổ đang chọn.
 */
export function donXuongKhiDoiNguoi(userIdMoi: number | string): boolean {
  try {
    const idPhien = idTuPhien();
    if (idPhien !== null && idPhien === Number(userIdMoi)) return false;
    let idCuoi: number | null = null;
    try { idCuoi = Number(localStorage.getItem(XUONG_NGUOI_CUOI_KEY)) || null; } catch { idCuoi = null; }
    localStorage.removeItem(XUONG_NGUOI_CUOI_KEY);
    localStorage.removeItem(XUONG_TOKEN_KEY);
    localStorage.removeItem(XUONG_PHIEN_KEY);
    if (idPhien === null && idCuoi !== null && idCuoi === Number(userIdMoi)) return false;
    localStorage.removeItem(XUONG_TO_KEY);
    return true;
  } catch { return false; }
}

export function authXuong(): Record<string, string> {
  const tok = tokenXuong();
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}
