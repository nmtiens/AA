// ============================================================================
// MODULE XƯỞNG — kiểu dữ liệu dùng chung (thiết kế: docs/designs/xuong-checkin.md)
// Mọi mốc thời gian trong phần tính toán là epoch ms (đã hiệu chỉnh lệch đồng hồ máy, R8).
// ============================================================================

export const LOAI_SU_KIEN = [
  'trien_khai', 'khai_bao_cd', 'nhan', 'bat_dau', 'tam_ngung', 'tiep_tuc', 'hoan_thanh', 'giao',
  'tang_ca', 'chia_nguoi', 'quan_so', 'xac_nhan_cuoi_ngay', 'tien_do', 'huy',
  // Chấm công theo người (backend/sql/2026-10-13_xuong_cham_cong.sql)
  'vao_ca', 'ra_ca',
  // Trạm quét theo tổ (backend/sql/2026-10-16_xuong_tram.sql)
  'nguoi_vao', 'nguoi_ra',
] as const;
export type LoaiSuKien = typeof LOAI_SU_KIEN[number];

export const LY_DO_TAM_NGUNG = [
  'thieu_vat_tu', 'cho_ban_ve_duyet', 'loi_chat_luong', 'chuyen_viec_gap', 'lenh_cap_tren', 'khac',
] as const;
export type LyDoTamNgung = typeof LY_DO_TAM_NGUNG[number];

export const LOAI_CA = ['chinh', 'ca1', 'ca2', 'ca3', 'ca4', 'chu_nhat'] as const;
export type LoaiCa = typeof LOAI_CA[number];
export const LOAI_CA_TANG_CA: readonly LoaiCa[] = ['ca1', 'ca2', 'ca3', 'ca4', 'chu_nhat'];

/** Một sự kiện trong sổ, dạng dùng cho phần tính toán */
export interface SuKien {
  id: string;
  loai: LoaiSuKien;
  hex: string | null;
  congDoanId: string | null;
  toId: number | null;
  soLuong: number | null;
  congDoanDenId: string | null;
  congDoanNguonId: string | null;
  xuongNguon: string | null;
  soNguoi: number | null;
  /** Lý do tạm ngưng (sự kiện tam_ngung) */
  lyDoTamNgung?: string | null;
  duLieu: Record<string, unknown> | null;
  /** device_ts_hieu_chinh (ms) — thứ tự và mọi số đo dùng mốc này */
  ts: number;
  /** server_ts (ms) — phá hoà khi ts trùng */
  serverTs: number;
  suaCho: string | null;
}

/** Khoá một cặp (hạng mục, công đoạn) */
export const pairKey = (hex: string, congDoanId: string) => `${hex}|${congDoanId}`;

export type TrangThai = 'cho_nhan' | 'da_nhan' | 'dang_lam' | 'tam_ngung' | 'cho_giao' | 'xong';

/** Đoạn chạy của một cặp (hex, công đoạn): end = null nghĩa là đang chạy */
export interface DoanChay { start: number; end: number | null }

export interface StageState {
  trangThai: TrangThai;
  slGiaoDen: number;
  slNhan: number;
  slHoanThanh: number;
  slGiao: number;
  soNguoi: number | null;
  dangChayTu: number | null;
  suKienCuoi: number | null;
  doanChay: DoanChay[];
  co: string[];
}

export interface LichCaRow {
  loaiCa: LoaiCa;
  /** 'HH:MM' giờ địa phương Asia/Ho_Chi_Minh */
  gioBatDau: string;
  gioKetThuc: string;
  /** [['11:30','12:30'], …] */
  nghi: Array<[string, string]>;
}

export interface CuaSo { loaiCa: LoaiCa; start: number; end: number }
