import { doLech } from './xuongClock';
import { taoHangDoi } from './xuongQueue';
import type { BangTram, LichCaTram } from '../utils/xuongTheNv';

// ============================================================================
// API MÁY TRẠM QUÉT (backend/src/routes/xuongTram.ts — docs/designs/xuong-tram-quet.md)
// Token trạm (phạm vi 'tram') + mã thiết bị trạm lưu riêng, không dùng chung token người dùng: máy trạm để ở xưởng
// cho mọi người quét, không mở được màn tổ trưởng / quản lý. Thao tác ghi đi qua hàng đợi IndexedDB riêng của trạm.
// ============================================================================

export const TRAM_TOKEN_KEY = 'xuong_tram_token';
export const TRAM_DEVICE_KEY = 'xuong_tram_device';

export const authTram = (): Record<string, string> => {
  let tok: string | null = null;
  try { tok = localStorage.getItem(TRAM_TOKEN_KEY); } catch { /* bỏ qua */ }
  return tok ? { Authorization: `Bearer ${tok}` } : {};
};
const luuToken = (tok: unknown) => {
  if (typeof tok !== 'string' || !tok) return;
  try { localStorage.setItem(TRAM_TOKEN_KEY, tok); } catch { /* bỏ qua */ }
};

export const coTram = () => { try { return !!localStorage.getItem(TRAM_TOKEN_KEY) && !!localStorage.getItem(TRAM_DEVICE_KEY); } catch { return false; } };
export const xoaTram = () => { try { localStorage.removeItem(TRAM_TOKEN_KEY); localStorage.removeItem(TRAM_DEVICE_KEY); } catch { /* bỏ qua */ } };

/** Hàng đợi riêng của trạm: mỗi lô máy chủ nhận kèm token gia hạn (trạm dùng hằng ngày nên không hết hạn) */
export const hangDoiTram = taoHangDoi({
  dbName: 'xuong-tram-hang-doi', duongDan: '/api/xuong/tram/may/events', khoaThietBi: TRAM_DEVICE_KEY, auth: authTram,
  sauLo: b => luuToken(b.token),
});

export const doLechTram = () => doLech(fetch, '/api/xuong/tram/may/time', authTram);

export interface BangTramMayChu extends BangTram {
  serverNow: number; ngay: string; cheDo: 'cu' | 'song_song' | 'tram';
  tram: { ten: string | null; congDoan: string[] };
  to: { id: number; xuong: string; ten: string | null };
  congDoan: Array<{ id: string; ten: string }>;
  lichCa: LichCaTram[]; tangCa: string[];
  /** conLam = đã nhận − đã xong (vào hàng được); conNhan = còn chờ nhận (vào hàng thì trạm Nhận đủ trước) */
  hangMuc: HangMucTram[];
}
export interface HangMucTram {
  hex: string; congDoanId: string; trangThai: string; tenHangMuc: string | null; conLam: number; conNhan: number; dvt: string | null;
  /** Mã NV nhóm làm hàng này lần gần nhất (máy chủ, sổ trạm 36 giờ) */
  nhomTruoc?: string[];
}
export interface CongNhanTram { mnv: string; hoTen: string; toId: number | null; tenTo: string | null }

type KetQua<T> = { ok: true; data: T } | { ok: false; status: number; message: string; dangKyLai?: boolean };

async function goi<T>(path: string, init?: RequestInit, auth: () => Record<string, string> = authTram): Promise<KetQua<T>> {
  try {
    const r = await fetch(path, { ...init, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...auth(), ...(init?.headers ?? {}) } });
    const b = await r.json().catch(() => ({ success: false, message: 'Phản hồi không hợp lệ' }));
    if (!r.ok || !b.success) return { ok: false, status: r.status, message: b.message || 'Lỗi máy chủ', dangKyLai: !!b.dangKyLai };
    if (b.available === false) return { ok: false, status: 200, message: b.message || 'Máy chủ chưa bật trạm quét' };
    return { ok: true, data: b as T };
  } catch {
    return { ok: false, status: 0, message: 'Mất mạng' };
  }
}

export const tramApi = {
  bang: async () => {
    const r = await goi<BangTramMayChu & { token?: string }>('/api/xuong/tram/may/bang');
    if (r.ok) luuToken(r.data.token);
    return r;
  },
  congNhan: () => goi<{ congNhan: CongNhanTram[] }>('/api/xuong/tram/may/cong-nhan'),
  /** Đăng ký máy đang dùng làm trạm (bằng đăng nhập của quản lý / tổ trưởng) */
  dangKy: async (authNguoiDung: () => Record<string, string>, toId: number, congDoan: string[], ten: string) => {
    const r = await goi<{ token: string; deviceToken: string; deviceId: string }>('/api/xuong/tram/dang-ky',
      { method: 'POST', body: JSON.stringify({ toId, congDoan, ten }) }, authNguoiDung);
    if (r.ok) {
      try {
        localStorage.setItem(TRAM_TOKEN_KEY, r.data.token);
        localStorage.setItem(TRAM_DEVICE_KEY, r.data.deviceToken);
      } catch { /* bỏ qua */ }
    }
    return r;
  },
};

// ---------------------------------------------------------------------------
// Tổ trưởng / quản lý (token người dùng): Sửa ngày, danh sách / thu hồi trạm, chế độ tổ
// ---------------------------------------------------------------------------
export interface DoanNguoiSua {
  mnv: string; key: string; hex: string; congDoanId: string; start: number; end: number | null;
  ketThuc: 'ra' | 'doi_hang' | 'xong' | 'tu_dong' | 'ngoai_ca' | null; suKienVao: string; suKienRa: string | null;
  tenHangMuc: string | null;
  /** quét ở trạm / tổ trưởng phân công / hệ thống tự gán / ghi hộ */
  nguon: NguonDoan;
}
export type NguonDoan = 'quet' | 'phan_cong' | 'tu_gan' | 'ghi_ho';
export interface HangCuaNguoi { key: string; hex: string; congDoanId: string; nguon?: NguonDoan }
export interface PhanCongData {
  ngay: string; serverNow: number; suaDuoc: boolean; cheDo: 'cu' | 'song_song' | 'tram';
  nguoi: Array<{ mnv: string; hoTen: string; coMat: boolean; dangO: HangCuaNguoi | null; homQua: HangCuaNguoi | null;
    /** Hàng gần nhất đã rời (kể cả hôm nay) */
    lanCuoi?: HangCuaNguoi | null }>;
  hangMuc: Array<{ key: string; hex: string; congDoanId: string; tenHangMuc: string | null; tenCongDoan: string | null; trangThai: string }>;
}
export interface SuaNgayData {
  ngay: string; serverNow: number; cheDo: 'cu' | 'song_song' | 'tram'; suaDuoc: boolean;
  /** Giờ ở hàng theo nguồn — đo mức tự động */
  gioTheoNguon?: Record<NguonDoan, number>;
  nguoi: Array<{ mnv: string; hoTen: string; coMat: Array<{ start: number; end: number | null }>; doan: DoanNguoiSua[]; co: string[] }>;
  suKien: Array<{ id: string; loai: string; mnv: string | null; hex: string | null; congDoanId: string | null; ts: number }>;
}
export interface TramDs { deviceId: string; ten: string | null; congDoan: string[]; lanDau: string; lanCuoi: string; thuHoi: boolean; nguoiDangKy: string | null }

export const tramQuanLyApi = (auth: () => Record<string, string>) => ({
  phanCong: (toId: number) => goi<PhanCongData>(`/api/xuong/to/${toId}/phan-cong`, undefined, auth),
  suaNgay: (toId: number, ngay?: string) => goi<SuaNgayData>(`/api/xuong/to/${toId}/sua-ngay${ngay ? `?ngay=${ngay}` : ''}`, undefined, auth),
  ds: (toId: number) => goi<{ tram: TramDs[] }>(`/api/xuong/tram/ds?toId=${toId}`, undefined, auth),
  thuHoi: (deviceId: string) => goi<Record<string, never>>('/api/xuong/tram/thu-hoi', { method: 'POST', body: JSON.stringify({ deviceId }) }, auth),
  doiCheDo: (toId: number, cheDo: 'cu' | 'song_song' | 'tram', homNay = false) =>
    goi<{ cheDo: string; tuNgay: string; dangLamBamTay: Array<{ hex: string; congDoanId: string }> }>(`/api/xuong/to/${toId}/che-do`,
      { method: 'POST', body: JSON.stringify({ cheDo, homNay }) }, auth),
});
