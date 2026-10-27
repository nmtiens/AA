import { getToken } from '../../services/userService';

// ============================================================================
// HỎI SỐ LIỆU — TỰ TRA: kiểu dữ liệu + gọi API /api/hoi-dap/* (backend/src/routes/hoiDap.ts).
// Danh mục bảng / cột do máy chủ trả (đã lọc theo quyền người dùng) — giao diện không tự khai báo cột.
// ============================================================================

export type KieuCot = 'so' | 'chu' | 'ngay' | 'ma' | 'xuong' | 'ct';
export interface CotDM {
  id: string; ten: string; dn: string[]; kieu: KieuCot; tien: boolean;
  /** Giá trị cố định (gõ đúng chữ này = lọc theo nó) */
  gt?: string[];
  /** Cột lấy từ bảng sản xuất qua HEX (id dạng "sx:<cột>") — chỉ có ở cotMoRong */
  sx?: boolean;
}
export interface BangDM {
  id: string; ten: string; dn: string[];
  /** Cột ngày của kỳ */
  ngay: string;
  /** Bảng chụp theo ngày (tồn kho) */
  chot: boolean;
  /** Có bỏ hạng mục HỦY mặc định */
  huy: boolean;
  /** Tên 1 dòng khi đếm */
  dong: string;
  soChinh?: string;
  /** Phép tính mặc định khi câu không nói tính gì */
  mac: Array<{ ham: Ham; cot?: string }>;
  /** Nối được sang bảng sản xuất qua HEX (lọc / chia theo khách hàng, nhóm sản phẩm, công đoạn…) */
  noiSx?: boolean;
  cot: CotDM[];
}

export type Ham = 'tong' | 'dem' | 'dem_khac' | 'tb' | 'max' | 'min';
export type Op = 'bang' | 'khac' | 'chua' | 'khong_chua' | 'lon_hon' | 'lon_hon_bang' | 'nho_hon' | 'nho_hon_bang' | 'trong_khoang' | 'rong' | 'co';
export type Moc = 'ngay' | 'tuan' | 'thang' | 'quy' | 'nam';
export interface Loc { cot: string; op: Op; gt?: string | number | Array<string | number> }
export interface TruyVan {
  bang: string;
  kieu: 'tong' | 'dong';
  do: Array<{ ham: Ham; cot?: string }>;
  /** id cột hoặc "cotNgay@moc" */
  nhom: string[];
  loc: Loc[];
  tu?: string;
  den?: string;
  sap?: { cot: number; giam: boolean };
  gioiHan?: number;
  gomHuy?: boolean;
  cotXem?: string[];
  /** (chỉ ở giao diện) So với kỳ khác: chạy 2 lần rồi ghép */
  soSanh?: { tu: string; den: string; ten?: string };
  /** (chỉ ở giao diện) Khi so sánh: xếp theo mức chênh — 'giam' = giảm nhiều nhất trước, 'tang' = tăng nhiều nhất trước */
  sapChenh?: 'giam' | 'tang';
  /** (chỉ ở giao diện) Xếp mức chênh theo % thay vì theo số (mặc định theo số) */
  sapChenhTheo?: 'pt';
  /** (chỉ ở giao diện) Bình quân mỗi ngày / tuần / tháng: chia theo mốc rồi lấy trung bình */
  binhQuan?: Moc;
}

/** Từ điển giá trị (GET /api/hoi-dap/tu-dien): giá trị hay gặp của cột ít giá trị + tên công trình chuẩn */
export interface TuDien { gt: Record<string, Record<string, string[]>>; ct: string[] }

const SX = 'production_status_app';
/** Cột của bảng + cột chữ / ngày của bảng sản xuất (id "sx:<cột>") khi bảng nối được qua HEX.
 *  Không lấy cột số của bảng sản xuất: cộng qua phép nối sẽ lặp theo số dòng nhập / xuất của 1 HEX. */
export const cotMoRong = (b: BangDM, dm: BangDM[]): CotDM[] => {
  const sx = b.noiSx ? dm.find(x => x.id === SX) : undefined;
  if (!sx) return b.cot;
  const co = new Set(b.cot.map(c => c.id));
  return [...b.cot, ...sx.cot.filter(c => !co.has(c.id) && c.kieu !== 'so' && c.kieu !== 'ct' && c.kieu !== 'xuong' && c.id !== 'hex' && c.id !== 'ten_hang_muc')
    .map(c => ({ ...c, id: `sx:${c.id}`, sx: true }))];
};
export interface CotKQ { ten: string; kieu: 'chu' | 'so' | 'ngay'; tien?: boolean; nhom?: boolean }
export interface KetQua {
  cot: CotKQ[];
  dong: Array<Array<string | number | null>>;
  tong: Array<number | null> | null;
  soDong: number;
  ngayChot?: string;
  /** Ngày có số liệu mới nhất của bảng dòng chảy (máy chủ tính) — ghi chú khi kỳ hỏi vượt quá ngày này */
  maxNgay?: string;
  /** Bảng kế hoạch: loại KH máy chủ đã chọn theo kỳ hỏi (THÁNG cho tháng / quý / năm, TUẦN cho kỳ ngắn) */
  loaiKh?: 'THÁNG' | 'TUẦN';
  boHuy: boolean;
}

export const TEN_HAM: Record<Ham, string> = { tong: 'Tổng', dem: 'Đếm dòng', dem_khac: 'Đếm số mã khác nhau', tb: 'Trung bình', max: 'Lớn nhất', min: 'Nhỏ nhất' };
export const TEN_MOC: Record<Moc, string> = { ngay: 'ngày', tuan: 'tuần', thang: 'tháng', quy: 'quý', nam: 'năm' };
export const TEN_OP: Record<Op, string> = {
  bang: 'là', khac: 'khác', chua: 'chứa', khong_chua: 'không chứa', lon_hon: '>', lon_hon_bang: '≥', nho_hon: '<', nho_hon_bang: '≤',
  trong_khoang: 'trong khoảng', rong: 'để trống', co: 'có giá trị',
};
/** Phép lọc hợp với từng kiểu cột */
export const OP_THEO_KIEU = (k: KieuCot): Op[] =>
  k === 'so' || k === 'ngay' ? ['bang', 'lon_hon', 'lon_hon_bang', 'nho_hon', 'nho_hon_bang', 'trong_khoang', 'khac', 'rong', 'co']
    : ['chua', 'bang', 'khac', 'khong_chua', 'rong', 'co'];

async function goi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  let r: Response;
  try {
    r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  } catch {
    throw new Error('Không kết nối được máy chủ');
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d?.success === false) throw new Error(d?.message || `Lỗi ${r.status}`);
  return d as T;
}

let danhMuc: Promise<BangDM[]> | null = null;
let aiCo = false;
/** Máy chủ có bật tầng AI (HOI_DAP_AI_KEY) không — biết sau khi tải danh mục */
export const coAI = () => aiCo;
/** Danh mục theo quyền — tải 1 lần mỗi phiên mở app (lỗi thì lần sau tải lại) */
export const taiDanhMuc = (): Promise<BangDM[]> => {
  if (!danhMuc) {
    danhMuc = goi<{ bang: BangDM[]; ai?: boolean }>('/api/hoi-dap/danh-muc').then(d => { aiCo = !!d.ai; return d.bang; });
    danhMuc.catch(() => { danhMuc = null; });
  }
  return danhMuc;
};
let tuDien: Promise<TuDien> | null = null;
export const taiTuDien = (): Promise<TuDien> => {
  if (!tuDien) {
    tuDien = goi<TuDien>('/api/hoi-dap/tu-dien').then(d => ({ gt: d.gt ?? {}, ct: d.ct ?? [] }));
    tuDien.catch(() => { tuDien = null; });
  }
  return tuDien;
};
export const xoaDanhMuc = () => { danhMuc = null; tuDien = null; };

export const layGiaTri = (bang: string, cot: string, q: string) =>
  goi<{ gt: Array<{ v: string; n: number }> }>(`/api/hoi-dap/gia-tri?bang=${encodeURIComponent(bang)}&cot=${encodeURIComponent(cot)}&q=${encodeURIComponent(q)}`)
    .then(d => d.gt);

export const chayTruyVan = (tv: TruyVan) =>
  goi<KetQua & { success: boolean }>('/api/hoi-dap/truy-van', { method: 'POST', body: JSON.stringify(tv) });

/** Nhờ AI dịch câu khó thành truy vấn (máy chủ kiểm bảng / cột / quyền trước khi trả) */
export interface KetQuaAI { loai: 'truy_van' | 'tim_kiem' | 'khong_hieu'; tv?: TruyVan; giaiThich: string }
export const hoiAI = (cau: string, truoc?: string) =>
  goi<KetQuaAI & { success: boolean }>('/api/hoi-dap/ai', { method: 'POST', body: JSON.stringify({ cau, ...(truoc ? { truoc } : {}) }) });

/** Nhật ký câu hỏi (POST /api/hoi-dap/nhat-ky): để biết tỷ lệ đúng thật + đem câu bị 👎 vào bộ câu mẫu. Lỗi => bỏ qua */
export type DuongTraLoi = 'mau' | 'tu_tra' | 'ai' | 'hoi_lai' | 'khong_hieu' | 'bao_cao';
export const ghiNhatKy = (d: { cau: string; truoc?: string; duong: DuongTraLoi; hieu?: string; tv?: TruyVan }): Promise<number | null> =>
  goi<{ id: number | null }>('/api/hoi-dap/nhat-ky', { method: 'POST', body: JSON.stringify(d) }).then(r => r.id).catch(() => null);
export const danhGiaCau = (id: number, tot: boolean, ghiChu?: string): Promise<void> =>
  goi(`/api/hoi-dap/nhat-ky/${id}/danh-gia`, { method: 'POST', body: JSON.stringify({ tot, ...(ghiChu ? { ghiChu } : {}) }) }).then(() => undefined).catch(() => undefined);
/** Quản trị: thống kê + câu bị 👎 (GET /api/hoi-dap/nhat-ky) */
export interface DongNhatKy { id: number; created_at: string; username?: string; cau: string; truoc?: string; duong: DuongTraLoi; hieu?: string; danh_gia?: number; ghi_chu?: string }
export const xemNhatKy = (ngay = 30) =>
  goi<{ thongKe: Array<{ duong: DuongTraLoi; tong: number; tot: number; che: number }>; cau: DongNhatKy[]; chuaCoBang?: boolean }>(`/api/hoi-dap/nhat-ky?ngay=${ngay}`);
