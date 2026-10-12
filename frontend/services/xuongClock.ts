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

/** Đo lệch bằng /api/xuong/time và lưu lại. Lỗi mạng thì giữ lệch cũ. */
export async function doLech(fetchImpl: typeof fetch = fetch): Promise<number | null> {
  try {
    const t0 = Date.now();
    const r = await fetchImpl('/api/xuong/time', { cache: 'no-store', headers: authXuong() });
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

// Header đăng nhập mục Xưởng (dùng chung với xuongApi.ts — tránh import vòng)
export const XUONG_TOKEN_KEY = 'xuong_token';
export const XUONG_DEVICE_KEY = 'xuong_device_token';
export function authXuong(): Record<string, string> {
  let tok: string | null = null;
  try { tok = localStorage.getItem(XUONG_TOKEN_KEY) || localStorage.getItem('app_token') || sessionStorage.getItem('app_token'); } catch { /* bỏ qua */ }
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}
