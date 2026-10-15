import { authXuong, doLech, XUONG_TOKEN_KEY, XUONG_DEVICE_KEY } from './xuongClock';
import type { CongViec } from './xuongModel';

// ============================================================================
// API MỤC XƯỞNG (backend/src/routes/xuong.ts). Token Xưởng 30 ngày + mã thiết bị do server ký (R4, R5).
// Ghi thao tác KHÔNG gọi thẳng API: luôn qua hàng đợi (services/xuongQueue.ts).
// ============================================================================

export interface ToCuaToi { id: number; xuong: string; ten: string; /** Tài khoản là tổ trưởng tổ này (không phải chỉ thành viên) */ toTruong?: boolean }
export interface DangKyKetQua {
  ok: boolean;
  available?: boolean;
  message?: string;
  user?: { id: number; username: string; fullName: string | null; msnv: string | null };
  to?: ToCuaToi[];
}

const docJson = async (r: Response) => r.json().catch(() => ({ success: false, message: 'Phản hồi không hợp lệ' }));

/**
 * Đăng ký máy với server (lần đầu bằng JWT thường của app; về sau gia hạn bằng chính token Xưởng).
 * Lưu token Xưởng + mã thiết bị vào localStorage và đo lệch đồng hồ ngay.
 */
/** Lượt đăng ký đang chạy — gọi trùng (2 màn cùng mở, bấm "Thử lại" liên tục, React dev chạy hiệu ứng 2 lần) dùng chung,
 *  khỏi cấp 2 mã máy cho cùng một máy */
let dangDangKy: Promise<DangKyKetQua> | null = null;
export function dangKyThietBi(): Promise<DangKyKetQua> {
  if (!dangDangKy) dangDangKy = dangKyMot().finally(() => { dangDangKy = null; });
  return dangDangKy;
}

async function dangKyMot(): Promise<DangKyKetQua> {
  let deviceToken: string | null = null;
  try { deviceToken = localStorage.getItem(XUONG_DEVICE_KEY); } catch { /* bỏ qua */ }
  try {
    const r = await fetch('/api/xuong/thiet-bi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authXuong() },
      body: JSON.stringify(deviceToken ? { deviceToken } : {}),
    });
    const b = await docJson(r);
    if (!r.ok || !b.success) return { ok: false, message: b.message || 'Không đăng ký được máy' };
    if (b.available === false) return { ok: false, available: false, message: 'Máy chủ chưa bật mục Xưởng (chưa chạy SQL)' };
    try {
      localStorage.setItem(XUONG_TOKEN_KEY, b.token);
      localStorage.setItem(XUONG_DEVICE_KEY, b.deviceToken);
    } catch { /* bỏ qua */ }
    await doLech();
    return { ok: true, available: true, user: b.user, to: b.to };
  } catch {
    return { ok: false, message: 'Mất mạng — chưa đăng ký được máy' };
  }
}

/** Xoá token Xưởng trên máy (đăng xuất mục Xưởng); hàng đợi giữ nguyên */
export function xoaTokenXuong() {
  try { localStorage.removeItem(XUONG_TOKEN_KEY); } catch { /* bỏ qua */ }
}

async function get<T>(path: string): Promise<{ ok: boolean; status: number; data?: T; message?: string }> {
  try {
    const r = await fetch(path, { headers: authXuong(), cache: 'no-store' });
    const b = await docJson(r);
    if (!r.ok || !b.success) return { ok: false, status: r.status, message: b.message };
    return { ok: true, status: r.status, data: b as T };
  } catch {
    return { ok: false, status: 0, message: 'Mất mạng' };
  }
}

async function gui<T>(path: string, body: unknown): Promise<{ ok: boolean; status: number; data?: T; message?: string }> {
  try {
    const r = await fetch(path, { method: 'POST', headers: { ...authXuong(), 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    const b = await docJson(r);
    if (!r.ok || !b.success) return { ok: false, status: r.status, message: b.message };
    return { ok: true, status: r.status, data: b as T };
  } catch {
    return { ok: false, status: 0, message: 'Mất mạng' };
  }
}

export interface DongLichSu {
  id: string; loai: string; hex: string | null; congDoanId: string | null; tenCongDoan: string | null;
  tenCongDoanDen: string | null; soLuong: number | null; soNguoi: number | null; lyDo: string | null;
  duLieu: Record<string, unknown> | null; luc: string; nguoi: string | null; tenHangMuc: string | null;
  /** Đơn vị của hạng mục */
  dvt?: string | null;
  daHuy: boolean; huyDuoc: boolean;
}
export interface CongNhanTim {
  mnv: string; hoTen: string; xuong: string | null; toId: number | null; tenTo: string | null; chucVu: string | null; active: boolean; nguon: string | null;
}
export interface GoiYHex { hex: string; cuaTo: boolean; tenHangMuc: string | null; tenCongTrinh: string | null }
export interface DanhMucXuong {
  congDoan: Array<{ id: string; xuong: string; ten: string; thuTu: number; laBaoBi: boolean }>;
  to: Array<{ id: number; xuong: string; ten: string; congDoan: string[] }>;
}

export const xuongApi = {
  congViec: (toId: number) => get<CongViec & { available?: boolean }>(`/api/xuong/cong-viec?toId=${toId}`),
  lichSu: (toId: number) => get<{ suKien: DongLichSu[]; available?: boolean }>(`/api/xuong/lich-su?toId=${toId}`),
  /** Số tối đa nhận được ở từng công đoạn của tổ: moc = đã triển khai cho xưởng (chưa có: SL đơn hàng), daNhan = đã nhận */
  gioiHanNhan: (hex: string, toId: number) => get<{ congDoan: Array<{ congDoanId: string; moc: number | null; loai: 'trien_khai' | 'don_hang' | null; daNhan: number; dvt: string | null }> }>(`/api/xuong/gioi-han-nhan?hex=${encodeURIComponent(hex)}&toId=${toId}`),
  timCongNhan: (q: string, xuong: string | null) =>
    get<{ ketQua: CongNhanTim[] }>(`/api/xuong/cong-nhan/tim?q=${encodeURIComponent(q)}${xuong ? `&xuong=${encodeURIComponent(xuong)}` : ''}`),
  themCongNhan: (toId: number, mnv: string, hoTen: string) => gui<{ congNhan: CongNhanTim }>('/api/xuong/cong-nhan', { toId, mnv, hoTen }),
  roiTo: (toId: number, mnv: string) => gui<Record<string, never>>('/api/xuong/cong-nhan/roi-to', { toId, mnv }),
  timHex: (q: string, toId: number) => get<{ ketQua: GoiYHex[] }>(`/api/xuong/tim-hex?q=${encodeURIComponent(q)}&toId=${toId}`),
  gioCong: (toId: number, ngay?: string) => get<Record<string, unknown>>(`/api/xuong/to/${toId}/gio-cong${ngay ? `?ngay=${ngay}` : ''}`),
  hex: (hex: string) => get<Record<string, unknown>>(`/api/xuong/hex/${encodeURIComponent(hex)}`),
  danhMuc: (xuong?: string) => get<DanhMucXuong & { available?: boolean }>(`/api/xuong/danh-muc${xuong ? `?xuong=${encodeURIComponent(xuong)}` : ''}`),
  canXem: (xuong: string) => get<Record<string, unknown>>(`/api/xuong/can-xem?xuong=${encodeURIComponent(xuong)}`),
};
