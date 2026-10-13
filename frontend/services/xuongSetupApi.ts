import { getToken } from './userService';
import { authXuong } from './xuongClock';
import type { LoaiCa, TrangThai } from './xuongModel';

// ============================================================================
// API MỤC XƯỞNG — PHẦN MÁY TÍNH (backend/src/routes/xuongSetup.ts + GET /api/xuong/hex/:hex).
// Gọi trực tiếp (không qua hàng đợi) — xác thực xem dauXacThuc().
// ============================================================================

export interface CongDoanSetup { id: string; tenCd: string; cdTachMa: string | null; ten: string; thuTu: number; laBaoBi: boolean; active: boolean }
export interface NguoiDung { id: number; ten: string; msnv: string | null; coQuyenXuong: boolean; username?: string }
export interface ToSetup {
  id: number; ten: string; active: boolean; toTruong: NguoiDung | null; congDoan: string[]; thanhVien: string[];
}
export interface LichCaSetup { xuong: string; loaiCa: LoaiCa; gioBatDau: string; gioKetThuc: string; nghi: Array<[string, string]> }
export interface SetupXuong {
  admin: boolean; dsXuong: string[]; xuong: string | null;
  congDoan: CongDoanSetup[]; to: ToSetup[]; lichCa: LichCaSetup[]; quanLy: Array<{ userId: number; ten: string }>;
}
export interface CongDoanHex {
  hex: string; congDoanId: string; ten: string | null; xuong: string | null; thuTu: number | null; trangThai: TrangThai;
  slGiaoDen: number; slNhan: number; slHoanThanh: number; slGiao: number; soNguoi: number | null;
  dangChayTu: string | null; suKienCuoi: string | null; co: string[]; gioChay: number; gioCong: number;
  /** 'mra' = lịch sử nạp từ MRA (không phân bổ giờ công; nhanCongMra = số nhân công gốc, có thể đếm trùng) */
  nguon: 'app' | 'mra'; nhanCongMra: number | null;
}
/** Thời gian trong xưởng theo lô (backend/src/server/xuong/metrics.ts — thoiGianTheoLo) */
export interface ThoiGianXuong {
  xuong: string;
  lo: Array<{ nhanLuc: number; soLuong: number; raHetLuc: number | null; thoiGian: number; daRa: number }>;
  moc: number; loaiMoc: 'trien_khai' | 'don_hang' | 'khong_co'; tongDaRa: number; phanTram: number;
  batDau: number | null; ketThuc: number | null; thoiGian: number | null; tamTinh: boolean;
}
export interface SuKienHex {
  id: string; loai: string; congDoanId: string | null; congDoanDenId: string | null; soLuong: number | null; soNguoi: number | null;
  lyDo: string | null; tienDo: number | null; ghiChu: string | null; luc: string; nguon: string; co: string[]; conHieuLuc: boolean; suaCho: string | null;
  nguoiGoc: string | null; duLieu: Record<string, unknown> | null;
  /** Id ảnh tiến độ (xem qua GET /api/xuong/anh/:id) */
  anh?: string[];
}
export interface ChiTietHex {
  hex: string; gioCongTamTinh: boolean;
  hangMuc: { ten: string | null; maCongTrinh: string | null; tenCongTrinh: string | null; dvt: string | null; soLuongDonHang: number | null; xuongChinh: string | null } | null;
  congDoan: CongDoanHex[]; thoiGianXuong: ThoiGianXuong[]; suKien: SuKienHex[];
  /** Lịch sử MRA theo xưởng: thao tác đầu → hoàn thành / giao cuối (null = MRA dừng khi chưa xong) */
  thoiGianMra: Array<{ xuong: string; tu: string; den: string | null }>;
}
export interface TomTatHex { soCongDoan: number; dangO: Array<{ xuong: string | null; ten: string | null; trangThai: TrangThai }> }
export interface HangMucTrienKhai {
  hex: string; ten: string | null; maCongTrinh: string | null; tenCongTrinh: string | null; dvt: string | null;
  soLuongDonHang: number | null; nhom: string | null; daTrienKhai: number; goiYTuyen: string[] | null;
}
export interface DanhSachTrienKhai {
  xuong: string; hangMuc: HangMucTrienKhai[];
  congDoan: Array<{ id: string; xuong: string; ten: string; cdTachMa: string | null; thuTu: number }>;
}

export interface GioTach { thuong: number; tangCa: number }
export interface BaoCaoTo {
  toId: number; ten: string; active: boolean;
  gioNguoi: GioTach; gioCong: GioTach; gioCho: GioTach;
  ngayCoChay: number; ngayChot: number; khaiVuot: number;
  dangChay: number; tamNgung: number; choNhan: number;
  /** Mới nhất trước */
  theoNgay: BaoCaoToNgay[];
  theoHangMuc: Array<{
    hex: string; congDoanId: string; tenCongDoan: string; tenHangMuc: string | null; tenCongTrinh: string | null;
    gioChay: number; gioCongThuong: number; gioCongTangCa: number;
  }>;
}
export interface BaoCaoToNgay {
  ngay: string; gioNguoi: number; gioCong: number; gioCongTangCa: number; gioCho: number; co: string[];
  /** Quân số chốt theo loại ca (chinh, ca1…) */
  quanSo: Record<string, number>;
  /** Hạng mục có chạy trong ngày, nhiều giờ công trước; dangChay = đang chạy lúc này (chỉ hôm nay) */
  hangMuc: Array<{
    hex: string; congDoanId: string; tenCongDoan: string; tenHangMuc: string | null;
    gioChay: number; gioCongThuong: number; gioCongTangCa: number; dangChay: boolean;
  }>;
  nhan: Array<{ hex: string; congDoanId: string; tenCongDoan: string; tenHangMuc: string | null; soLuong: number; dvt: string | null }>;
}
export interface BaoCaoXuong {
  xuong: string; tu: string; den: string; banLuu: boolean; conThieu: number;
  /** Đối chiếu Dữ liệu Điểm danh (theo xưởng × ngày); null = chưa có bảng diem_danh */
  chamCong: {
    moiNhat: string | null;
    theoNgay: Array<{ ngay: string; congNhan: number; gioHc: number; gioTc: number; quanSoApp: number; gioThuongApp: number; gioTangCaApp: number }>;
  } | null;
  chiSo: {
    nhatKy: { tong: number; du: number }; guiTrong1Gio: { tong: number; nhanh: number };
    chotQuanSo: { ngayCoChay: number; ngayChot: number }; khaiVuotQuanSo: number;
  };
  theoTo: BaoCaoTo[];
}

/** Token đăng nhập thường còn hạn (JWT 8 giờ) thì dùng (đúng người đang đăng nhập); hết hạn / không có thì dùng
 *  token Xưởng 30 ngày — điện thoại tổ trưởng / quản lý thường chỉ còn token Xưởng sau một ca */
function dauXacThuc(): Record<string, string> {
  const t = getToken();
  if (t) {
    try {
      const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
      if (!p.exp || p.exp * 1000 > Date.now() + 60_000) return { Authorization: `Bearer ${t}` };
    } catch { return { Authorization: `Bearer ${t}` }; }
  }
  return authXuong();
}

export interface TongQuanTo {
  id: number; ten: string; toTruong: string | null; quanSo: number | null;
  dangChay: number; tamNgung: number; choNhan: number; choGiao: number; canXem: number; thaoTacCuoi: string | null;
}

type KetQua<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

async function goi<T>(method: string, path: string, body?: unknown): Promise<KetQua<T>> {
  try {
    const r = await fetch(path, {
      method,
      headers: { ...dauXacThuc(), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const b = await r.json().catch(() => null);
    if (!r.ok || !b?.success) return { ok: false, status: r.status, message: b?.message || `Lỗi ${r.status}` };
    if (b.available === false) return { ok: false, status: 503, message: 'Máy chủ chưa bật mục Xưởng (chưa chạy file SQL 2026-10-12_xuong.sql)' };
    return { ok: true, data: b as T };
  } catch {
    return { ok: false, status: 0, message: 'Mất mạng' };
  }
}

const q = (o: Record<string, string | undefined>) =>
  Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&');

/** Tải một ảnh tiến độ (cần đăng nhập) → object URL; nhớ URL.revokeObjectURL khi bỏ */
export async function taiAnhXuong(id: string): Promise<string> {
  const r = await fetch(`/api/xuong/anh/${encodeURIComponent(id)}`, {
    headers: dauXacThuc(),
  });
  if (!r.ok) throw new Error(`Không tải được ảnh (${r.status})`);
  return URL.createObjectURL(await r.blob());
}

export const xuongSetupApi = {
  setup: (xuong?: string) => goi<SetupXuong>('GET', `/api/xuong/setup?${q({ xuong })}`),
  luuCongDoan: (d: Omit<CongDoanSetup, 'id'> & { id?: string; xuong: string }) => goi<{ id: string }>('POST', '/api/xuong/setup/cong-doan', d),
  luuTo: (d: { id?: number; xuong: string; ten: string; toTruongUserId: number | null; congDoan: string[]; thanhVien: string[]; active: boolean; capQuyen?: boolean }) =>
    goi<{ id: number }>('POST', '/api/xuong/setup/to', d),
  luuLichCa: (d: LichCaSetup) => goi<unknown>('PUT', '/api/xuong/setup/lich-ca', d),
  boLichCa: (xuong: string, loaiCa: LoaiCa) => goi<unknown>('DELETE', '/api/xuong/setup/lich-ca', { xuong, loaiCa }),
  quanLy: (userId: number, xuong: string, bo = false) => goi<unknown>('POST', '/api/xuong/setup/quan-ly', { userId, xuong, bo }),
  timNguoi: (s: string) => goi<{ ketQua: NguoiDung[] }>('GET', `/api/xuong/setup/nguoi-dung?${q({ q: s })}`),
  tongQuan: (xuong?: string) => goi<{ dsXuong: string[]; xuong: string | null; to: TongQuanTo[] }>('GET', `/api/xuong/tong-quan?${q({ xuong })}`),
  canXem: (xuong: string) => goi<{ suKien: Array<Record<string, unknown>>; trangThai: Array<Record<string, unknown>> }>('GET', `/api/xuong/can-xem?${q({ xuong })}`),
  huy: (suKienId: string, lyDo?: string) => goi<unknown>('POST', '/api/xuong/huy', { suKienId, lyDo }),
  hex: (hex: string) => goi<ChiTietHex>('GET', `/api/xuong/hex/${encodeURIComponent(hex)}`),
  tomTat: (hexes: string[]) => goi<{ tomTat: Record<string, TomTatHex> }>('POST', '/api/xuong/hex-tom-tat', { hexes }),
  dsTrienKhai: (xuong: string, opt: { q?: string; chua?: boolean; hex?: string } = {}) =>
    goi<DanhSachTrienKhai>('GET', `/api/xuong/trien-khai?${q({ xuong, q: opt.q, chua: opt.chua ? '1' : undefined, hex: opt.hex })}`),
  baoCao: (xuong: string, tu: string, den: string) => goi<BaoCaoXuong>('GET', `/api/xuong/bao-cao?${q({ xuong, tu, den })}`),
  trienKhai: (xuong: string, items: Array<{ hex: string; soLuong: number; tuyen: string[] }>) =>
    goi<{ soHangMuc: number }>('POST', '/api/xuong/trien-khai', { xuong, items }),
};
