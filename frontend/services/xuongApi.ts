import { authXuong, doLech, XUONG_TOKEN_KEY, XUONG_DEVICE_KEY } from './xuongClock';
import type { CongViec } from './xuongModel';

// ============================================================================
// API MỤC XƯỞNG (backend/src/routes/xuong.ts). Token Xưởng 30 ngày + mã thiết bị do server ký (R4, R5).
// Ghi thao tác KHÔNG gọi thẳng API: luôn qua hàng đợi (services/xuongQueue.ts).
// ============================================================================

export interface ToCuaToi { id: number; xuong: string; ten: string }
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
export async function dangKyThietBi(): Promise<DangKyKetQua> {
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

export interface DongLichSu {
  id: string; loai: string; hex: string | null; congDoanId: string | null; tenCongDoan: string | null;
  tenCongDoanDen: string | null; soLuong: number | null; soNguoi: number | null; lyDo: string | null;
  duLieu: Record<string, unknown> | null; luc: string; nguoi: string | null; tenHangMuc: string | null;
  daHuy: boolean; huyDuoc: boolean;
}
export interface GoiYHex { hex: string; cuaTo: boolean; tenHangMuc: string | null; tenCongTrinh: string | null }
export interface DanhMucXuong {
  congDoan: Array<{ id: string; xuong: string; ten: string; thuTu: number; laBaoBi: boolean }>;
  to: Array<{ id: number; xuong: string; ten: string; congDoan: string[] }>;
}

export const xuongApi = {
  congViec: (toId: number) => get<CongViec & { available?: boolean }>(`/api/xuong/cong-viec?toId=${toId}`),
  lichSu: (toId: number) => get<{ suKien: DongLichSu[]; available?: boolean }>(`/api/xuong/lich-su?toId=${toId}`),
  timHex: (q: string, toId: number) => get<{ ketQua: GoiYHex[] }>(`/api/xuong/tim-hex?q=${encodeURIComponent(q)}&toId=${toId}`),
  gioCong: (toId: number, ngay?: string) => get<Record<string, unknown>>(`/api/xuong/to/${toId}/gio-cong${ngay ? `?ngay=${ngay}` : ''}`),
  hex: (hex: string) => get<Record<string, unknown>>(`/api/xuong/hex/${encodeURIComponent(hex)}`),
  danhMuc: (xuong?: string) => get<DanhMucXuong & { available?: boolean }>(`/api/xuong/danh-muc${xuong ? `?xuong=${encodeURIComponent(xuong)}` : ''}`),
  canXem: (xuong: string) => get<Record<string, unknown>>(`/api/xuong/can-xem?xuong=${encodeURIComponent(xuong)}`),
};
