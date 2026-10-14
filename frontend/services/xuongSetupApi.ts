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
  gioChoLyDo: Record<string, number>;
  dangChay: number; tamNgung: number; choNhan: number;
  /** Mới nhất trước */
  theoNgay: BaoCaoToNgay[];
  theoHangMuc: Array<{
    hex: string; congDoanId: string; tenCongDoan: string; tenHangMuc: string | null; tenCongTrinh: string | null;
    gioChay: number; gioCongThuong: number; gioCongTangCa: number;
    /** Giờ người theo số người khai; số người bình quân = gioNguoiKhai / gioChay */
    gioNguoiKhai: number; soNguoiMax: number; soNguoiMin: number;
  }>;
}
export interface BaoCaoToNgay {
  ngay: string; gioNguoi: number; gioCong: number; gioCongTangCa: number; gioCho: number; co: string[];
  /** Khoảng > 2 tháng (rutGon): hangMuc / nhan để trống, chỉ có số đếm */
  soHangMuc?: number; soNhan?: number;
  /** 'mra' = ngày lấy từ lịch sử MRA cũ (giờ công từ điểm danh xưởng chia theo tỷ lệ, giờ công SP = nhân công MRA × giờ trong ca) */
  nguon?: 'mra';
  /** Quân số chốt theo loại ca (chinh, ca1…) */
  quanSo: Record<string, number>;
  /** Hạng mục có chạy trong ngày, nhiều giờ công trước; dangChay = đang chạy lúc này (chỉ hôm nay) */
  hangMuc: Array<{
    hex: string; congDoanId: string; tenCongDoan: string; tenHangMuc: string | null;
    gioChay: number; gioCongThuong: number; gioCongTangCa: number; dangChay: boolean;
    gioNguoiKhai: number; soNguoiMax: number; soNguoiMin: number;
  }>;
  nhan: Array<{ hex: string; congDoanId: string; tenCongDoan: string; tenHangMuc: string | null; soLuong: number; dvt: string | null }>;
  xong: Array<{ hex: string; congDoanId: string; tenCongDoan: string; tenHangMuc: string | null; soLuong: number; dvt: string | null }>;
  /** Giờ chờ theo lý do: nguoi_ranh, khong_viec, mã lý do tạm ngưng */
  gioChoLyDo: Record<string, number>;
}
/** Một hạng mục trong kỳ (mọi tổ của xưởng): giờ công + số lượng xong theo công đoạn */
export interface BaoCaoHangMuc {
  hex: string; tenHangMuc: string | null; tenCongTrinh: string | null; dvt: string | null; soLuongDonHang: number | null;
  gioCong: number; slXong: number;
  congDoan: Array<{
    congDoanId: string; tenCongDoan: string; to: string[]; gioChay: number; gioCong: number; gioCongTangCa: number; slXong: number;
    /** Số công nhân bình quân lúc chạy (theo số người khai) / nhiều nhất */
    soNguoiTb: number; soNguoiMax: number; soNguoiMin: number;
    trangThai: string | null; slNhan: number; slHoanThanh: number;
  }>;
  /** Kế hoạch đã triển khai trên MRA cho xưởng: tổng số lượng + tuyến công đoạn (lần triển khai mới nhất); null = chưa triển khai */
  trienKhai?: { sl: number; luc: string; tuyen: Array<{ congDoanId: string; ten: string }>; mra?: boolean } | null;
  /** Kế hoạch tuần KHSX gần nhất (đã tới hạn trước): tuần, ngày KHNK, giá trị (triệu); nhập kho luỹ kế để biết đã xong chưa */
  keHoach?: { nam: number; tuan: number; kh: number; ngayKhnk: string | null; giaTriDon: number | null; nhapKhoLuyKe: number } | null;
}
/** Phân tích lịch sử MRA cũ của xưởng (giờ trong ca = phần đoạn chạy nằm trong ca chính, bỏ Chủ nhật) */
export interface LichSuMra {
  xuong: string; coDuLieu: boolean;
  tong?: { soHm: number; soHmXong: number; soCap: number; tu: string; den: string; gioCa: number; soNgung: number; gioNgung: number; ngayTv: number; ngayP75: number; khongKhopCd: number };
  congDoan?: Array<{ congDoanId: string; ten: string; thuTu: number; soHm: number; slXong: number; gioCaTv: number; gioCaP75: number; gioCa: number;
    ngayChayTv: number; gioTrenDvTv: number; ncTb: number | null; ncGio: number; soNgung: number; gioNgung: number; hmNgung: number }>;
  nhom?: Array<{ ten: string; soHm: number; soXong: number; ngayTv: number; ngayP75: number; gioCaTv: number }>;
  theoThang?: Array<{ thang: string; soXong: number; soBatDau: number; gioCa: number }>;
  lauNhat?: Array<{ hex: string; ten: string | null; congTrinh: string | null; nhom: string; ngay: number; gioCa: number; soCd: number }>;
}
/** Kế hoạch tuần của xưởng (khsx, tiền triệu đồng) đối chiếu nhập kho + trạng thái MRA */
export interface KeHoachTuanCongDoan {
  congDoanId: string; ten: string; xuong: string | null; thuTu: number | null; trangThai: string;
  slGiaoDen: number; slNhan: number; slHoanThanh: number; slGiao: number;
  ngung: { lyDo: string | null; luc: string } | null;
}
export interface KeHoachTuanDong {
  hex: string; tenHangMuc: string | null; tenCongTrinh: string | null; dvt: string | null;
  slKh: number | null; kh: number; ngayKhnk: string | null; nhapKho: number; slNhapKho: number;
  /** Nhập kho luỹ kế tới hết tuần (mọi lần) và giá trị đơn hàng — để nhận ra hạng mục đã nhập đủ từ trước tuần */
  nhapKhoLuyKe: number; giaTriDon: number | null;
  trienKhai: { sl: number; luc: string } | null; congDoan: KeHoachTuanCongDoan[];
}
export interface KeHoachTuan {
  xuong: string; nam: number; tuan: number; tu: string; den: string; nhapKhoMoiNhat: string | null;
  nhapKhoTheoNgay: Array<{ ngay: string; theoKh: number; ngoaiKh: number }>;
  keHoach: KeHoachTuanDong[];
  ngoaiKeHoach: Array<{ hex: string; tenHangMuc: string | null; nhapKho: number; slNhapKho: number }>;
}
export interface BaoCaoXuong {
  xuong: string; tu: string; den: string; banLuu: boolean; conThieu: number;
  /** Khoảng > 2 tháng: không có chi tiết hạng mục từng ngày */
  rutGon?: boolean;
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
  hangMuc: BaoCaoHangMuc[];
  /** Chấm công theo người (chỉ khi tổ đã điểm danh / khai tên) */
  theoNguoi?: BaoCaoNguoi[];
}
export interface BaoCaoNguoiNgay {
  ngay: string; toId: number; tenTo: string;
  /** ms; null = chưa điểm danh (chỉ được gắn tên vào hạng mục) */
  vao: number | null; ra: number | null; treP: number; veSomP: number;
  coMatThuong: number; coMatTangCa: number; congThuong: number; congTangCa: number; cho: number;
  hangMuc: Array<{ hex: string; congDoanId: string; gio: number; tenHangMuc: string | null; tenCongDoan: string }>;
  /** Có trong danh sách tổ mà không có mặt ngày tổ điểm danh */
  vang?: boolean;
}
export interface BaoCaoNguoi {
  mnv: string; hoTen: string | null; tenTo: string | null; chucVu: string | null;
  soNgay: number; soNgayVang?: number; lanTre: number; lanVeSom: number;
  coMatThuong: number; coMatTangCa: number; congThuong: number; congTangCa: number; cho: number;
  ngay: BaoCaoNguoiNgay[];
}
export interface CongNhanXuong {
  mnv: string; hoTen: string; xuong: string | null; toId: number | null; tenTo: string | null; chucVu: string | null;
  active: boolean; nguon: string | null;
}
export interface DongNapNhanSu { mnv: string; hoTen: string; xuong?: string | null; tenTo?: string | null; chucVu?: string | null }

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
  /** Chấm công hôm nay (null = máy chủ chưa bật chấm công theo người) */
  diemDanh?: {
    daDiemDanh: boolean; coMat: number; tong: number;
    vang: Array<{ mnv: string; hoTen: string }>;
    tre: Array<{ mnv: string; hoTen: string; phut: number }>;
    veSom: Array<{ mnv: string; hoTen: string; luc: number }>;
  } | null;
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
  dsCongNhan: (xuong: string) => goi<{ congNhan: CongNhanXuong[] }>('GET', `/api/xuong/cong-nhan?${q({ xuong })}`),
  suaCongNhan: (d: { mnv: string; toId?: number | null; active?: boolean; hoTen?: string }) =>
    goi<{ congNhan: CongNhanXuong }>('POST', '/api/xuong/cong-nhan/sua', d),
  napCongNhan: (rows: DongNapNhanSu[], nghiNguoiVang: boolean) =>
    goi<{ daNap: number; boQua: number; nghi: number; loi: string[]; toKhongKhop: string[] }>('POST', '/api/xuong/cong-nhan/nap', { rows, nghiNguoiVang }),
  baoCao: (xuong: string, tu: string, den: string) => goi<BaoCaoXuong>('GET', `/api/xuong/bao-cao?${q({ xuong, tu, den })}`),
  lichSuMra: (xuong: string) => goi<LichSuMra>('GET', `/api/xuong/lich-su-mra?${q({ xuong })}`),
  keHoachTuan: (xuong: string, nam: number, tuan: number) =>
    goi<KeHoachTuan>('GET', `/api/xuong/ke-hoach-tuan?${q({ xuong, nam: String(nam), tuan: String(tuan) })}`),
  trienKhai: (xuong: string, items: Array<{ hex: string; soLuong: number; tuyen: string[] }>) =>
    goi<{ soHangMuc: number }>('POST', '/api/xuong/trien-khai', { xuong, items }),
};
