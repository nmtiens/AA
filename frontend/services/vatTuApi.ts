import { API_BASE_URL } from './dataService';

// ============================================================================
// API VẬT TƯ — ĐẶT / MUA THEO NHÓM SAP (backend/src/routes/vatTu.ts, bảng vat_tu: 1 dòng = 1 PR line)
// Cần đăng nhập (token tự gắn qua authFetch) + quyền 'materials'; thiếu quyền => 403.
// Tiền đã đổi ra TRIỆU ĐỒNG ở máy chủ (riêng đơn giá dòng PR là đồng / 1 đvt); không có quyền 'materials_view_price'
// => mọi số tiền (và NCC) là null. Ngày là chuỗi 'YYYY-MM-DD' — đọc thẳng chuỗi, KHÔNG new Date(chuỗi).
// ============================================================================

export const TRANG_THAI_PR = [
  'chuaMua', 'dungHen', 'tre', 'motPhan', 'theoNhuCau', 'giaCong', 'du', 'dongThieu', 'dongKhongPo', 'tamDung', 'huy',
] as const;
export type TrangThaiPr = typeof TRANG_THAI_PR[number];
/** Ô bấm đặc biệt của bảng (ngoài cột trạng thái) */
export type LoaiO = 'prChuaPoQua14' | 'canTrong14' | 've7Ngay' | 'conCho' | 'dangVe';

export interface SoGop {
  soDong: number;
  chuaMua: number; dungHen: number; tre: number; motPhan: number; theoNhuCau: number; giaCong: number;
  du: number; dongThieu: number; dongKhongPo: number; tamDung: number; huy: number;
  ptDungHen: number | null;
  giaTriPr: number | null;
  giaTriCho: number | null;
  prChuaPoQua14: number;
  canTrong14: number;
  ve7Ngay: number;
}
/** Tiêu hao TB 3 tháng đủ (triệu) — null / không có = chưa có bảng xuất tiêu hao hoặc không có quyền giá */
export interface DongNhom extends SoGop { ma: string; ten: string; soMa: number; tieuHaoTb3?: number | null }
/** Có khi đã có bảng xuất tiêu hao: 3 tháng đủ dùng tính TB */
export interface KemTieuHao { thangTb3: string[] }
export interface TheoNhom {
  capNhat: string | null; homNay: string; coGia: boolean; nhom: DongNhom[]; tong: SoGop & { soMa: number; tieuHaoTb3?: number | null };
  tieuHao?: KemTieuHao | null;
}
export interface DongMa extends SoGop {
  ma: string | null; ten: string | null; dvt: string | null; nhom: string; slCho: number; veGanNhat: string | null;
  /** Tiêu hao TB 3 tháng theo mã: giá trị (triệu), SL + ĐVT xuất; tồn hiện tại + ĐVT tồn; số tháng đủ dùng = tồn / SL TB */
  tieuHaoTb3?: number | null; slTieuHaoTb3?: number | null; dvtTieuHao?: string | null;
  tonHienTai?: number | null; dvtTon?: string | null; soThangDuDung?: number | null;
}
export interface TheoMa { capNhat: string | null; homNay: string; coGia: boolean; ma: DongMa[]; catBot: boolean; tieuHao?: KemTieuHao | null }
export interface DongPr {
  id: number; soPr: string | null; prLine: number | null; ngayPr: string | null; trackingno: string | null; tenCongTrinh: string | null;
  ma: string | null; tenVatTu: string | null; nhomVt: string | null; dvt: string | null;
  slYeuCau: number | null; slDaNhan: number | null; slConLai: number | null;
  soPo: string | null; nhaCungCap: string | null; tinhTrangPo: string | null;
  ngayCan: string | null; han: string | null; ngayDuKien: string | null; ngayThucTeVe: string | null;
  donGia: number | null; thanhTien: number | null;
  trangThai: string | null; trangThaiSap: string | null; tt: TrangThaiPr;
  teamPrNote: string | null; ghiChuPo: string | null; nguoiYeuCau: string | null; maNhaMay: string | null; codeVatLieu: string | null; itemNote: string | null;
}
export interface DanhSachDong { capNhat: string | null; homNay: string; coGia: boolean; tong: number; trang: number; co: number; dong: DongPr[] }
export interface DiemThang { thang: string; prDong: number; prGiaTri: number | null; veDong: number; veGiaTri: number | null }
export interface TheoThang { capNhat: string | null; homNay: string; coGia: boolean; thang: DiemThang[] }

/** Bộ lọc gửi máy chủ (tham số rỗng thì không gửi) */
export interface BoLocDatMua {
  tu?: string;
  den?: string;
  ct?: string[];
  nhom?: string[];
  trangThai?: TrangThaiPr[];
  q?: string;
  /** false = hiện (mặc định máy chủ ẩn) */
  an806?: boolean;
  an401?: boolean;
  an800?: boolean;
  anHuy?: boolean;
}

/** Lỗi gọi API Đặt – Mua; chuaCoQuyen = true khi máy chủ trả 403 */
export class LoiVatTu extends Error {
  readonly maLoi: number;
  readonly chuaCoQuyen: boolean;
  constructor(thongBao: string, maLoi: number) {
    super(thongBao);
    this.name = 'LoiVatTu';
    this.maLoi = maLoi;
    this.chuaCoQuyen = maLoi === 403;
  }
}

const LOI_MANG = 'Không kết nối được máy chủ, kiểm tra mạng rồi thử lại';
const loiMayChu = (ma: number) => `Máy chủ đang bận hoặc gặp lỗi (${ma}), hãy thử lại sau ít phút`;

const docLoi = async (r: Response): Promise<LoiVatTu> => {
  if (r.status >= 500) return new LoiVatTu(loiMayChu(r.status), r.status);
  let thongBao = '';
  try {
    const j = await r.json();
    if (j && typeof j.error === 'string') thongBao = j.error;
    else if (j && typeof j.message === 'string') thongBao = j.message;
  } catch { /* thân trả về không phải JSON */ }
  if (r.status === 403) return new LoiVatTu(thongBao || 'Bạn chưa có quyền xem vật tư (Đặt – Mua)', 403);
  if (r.status === 401) return new LoiVatTu(thongBao || 'Phiên đăng nhập đã hết hạn, hãy đăng nhập lại', 401);
  return new LoiVatTu(thongBao || `Máy chủ báo lỗi (${r.status})`, r.status);
};

const laBiHuy = (e: unknown, signal?: AbortSignal): boolean =>
  signal?.aborted === true || (e as { name?: unknown } | null)?.name === 'AbortError';

const layJson = async (url: string, signal?: AbortSignal) => {
  let r: Response;
  try {
    r = await fetch(url, { signal });
  } catch (e) {
    if (laBiHuy(e, signal)) throw e;
    throw new LoiVatTu(LOI_MANG, 0);
  }
  if (!r.ok) throw await docLoi(r);
  try {
    return await r.json();
  } catch (e) {
    if (laBiHuy(e, signal)) throw e;
    throw new LoiVatTu('Máy chủ trả số liệu không đọc được, hãy thử lại', r.status);
  }
};

/** Tham số URL của bộ lọc (+ tham số riêng) — chỉ gửi mục có giá trị; công tắc chỉ gửi khi HIỆN (=0) */
export const thamSoBoLoc = (loc: BoLocDatMua, them: Record<string, string | number | undefined | null> = {}): URLSearchParams => {
  const q = new URLSearchParams();
  if (loc.tu) q.set('tu', loc.tu);
  if (loc.den) q.set('den', loc.den);
  if (loc.ct?.length) q.set('ct', loc.ct.join(','));
  if (loc.nhom?.length) q.set('nhom', loc.nhom.join(','));
  if (loc.trangThai?.length) q.set('trangThai', loc.trangThai.join(','));
  if (loc.q?.trim()) q.set('q', loc.q.trim());
  if (loc.an806 === false) q.set('an806', '0');
  if (loc.an401 === false) q.set('an401', '0');
  if (loc.an800 === false) q.set('an800', '0');
  if (loc.anHuy === false) q.set('anHuy', '0');
  for (const [k, v] of Object.entries(them)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  return q;
};

const url = (duong: string, q: URLSearchParams) => {
  const s = q.toString();
  return `${API_BASE_URL}/vat-tu/dat-mua/${duong}${s ? `?${s}` : ''}`;
};

export const layTheoNhom = (loc: BoLocDatMua, signal?: AbortSignal): Promise<TheoNhom> =>
  layJson(url('theo-nhom', thamSoBoLoc(loc)), signal);

export const layTheoMa = (loc: BoLocDatMua, signal?: AbortSignal): Promise<TheoMa> =>
  layJson(url('theo-ma', thamSoBoLoc(loc)), signal);

/** Dòng PR (phân trang). ma: mã SAP ('-' = dòng không có mã); dvt: ĐVT ('-' = không ghi ĐVT; bỏ trống = mọi ĐVT);
 *  loai: ô bấm đặc biệt */
export const layDong = (
  loc: BoLocDatMua, opt: { ma?: string | null; dvt?: string | null; loai?: LoaiO | null; trang?: number; co?: number } = {},
  signal?: AbortSignal,
): Promise<DanhSachDong> =>
  layJson(url('dong', thamSoBoLoc(loc, { ma: opt.ma, dvt: opt.dvt, loai: opt.loai, trang: opt.trang, co: opt.co })), signal);

export const layTheoThang = (loc: BoLocDatMua, signal?: AbortSignal): Promise<TheoThang> =>
  layJson(url('theo-thang', thamSoBoLoc(loc)), signal);

// ============================================================================
// API XUẤT TIÊU HAO VẬT TƯ (/api/vat-tu/tieu-hao/*, bảng xuat_tieu_hao_vt) — quyền 'vt_tieu_hao'
// Tiêu hao = xuất 261 trừ hoàn trả 262 (số dương), hao hụt = Z14 (riêng). Giá trị triệu đồng; không có quyền xem giá
// => th / hh / giá trị = null (vẫn có số dòng, SL). Chưa có bảng => { chuaCo: true }.
// ============================================================================
export const THEO_TIEU_HAO = ['thang', 'nhom', 'ct', 'hex', 'ma', 'xuong'] as const;
export type TheoTieuHao = typeof THEO_TIEU_HAO[number];
/** '' = mọi loại xuất; 'tieuHao' = 261 / 262; 'z14' = hao hụt (Z14, trừ Z15 hoàn nếu có) */
export type MvtTieuHao = '' | 'tieuHao' | 'z14';
/** 1 ô: giá trị tiêu hao / hao hụt (triệu), SL tiêu hao / hao hụt (chỉ có nghĩa trong 1 mã + ĐVT), số dòng chứng từ */
export interface OTieuHao {
  th: number | null; hh: number | null; sl: number; slHh: number; sd: number;
  /** Số dòng chứng từ tiêu hao (261 / 262) / hao hụt (Z14 / Z15) */
  sdTh: number; sdHh: number;
}
export interface DongTieuHao {
  khoa: string; ten: string; phu: string | null;
  thang: Record<string, OTieuHao>;
  tong: OTieuHao;
  soMa: number;
  gtTb3: number | null;
  slTb3: number | null;
  ma?: string | null; dvt?: string | null; nhom?: string;
  ton?: number | null; dvtTon?: string | null; soThangDuDung?: number | null;
}
export interface TheSoTieuHao {
  thangMoi: string | null;
  thMoi: number | null; thTruoc: number | null; thTb3: number | null;
  th: number | null; hh: number | null; ptHaoHut: number | null;
  soMa: number; soDong: number; soDongChuaGhep: number; ptChuaGhep: number | null;
}
export interface TongHopTieuHao {
  chuaCo: false;
  capNhat: string | null; homNay: string; coGia: boolean; theo: TheoTieuHao;
  duLieuToi: string | null;
  /** Tháng đầu có dòng hoàn trả 262 (null = chưa có): các tháng trước đó chưa trừ hoàn trả (file MB51 cũ) */
  thang262Tu: string | null;
  thangTb3: string[];
  thang: string[];
  dong: DongTieuHao[];
  catBot: boolean;
  soKhoa: number;
  tong: { thang: Record<string, OTieuHao>; tong: OTieuHao; soMa: number };
  the: TheSoTieuHao;
}
export interface DongChungTu {
  nam: number | null; soCt: string | null; dong: number | null; ngay: string | null; thang: string | null; mvt: string | null;
  ma: string | null; tenVatTu: string | null; nhom: string; dvt: string | null;
  sl: number | null; giaTri: number | null;
  orderSx: string | null; salesOrder: string | null; wbs: string | null; hex: string | null; maCt: string | null;
  phanLoai: string | null; xuong: string | null; plant: string | null; sloc: string | null; nguoi: string | null;
  nguonNhom: string | null; nguonFile: string | null;
}
export interface ChiTietTieuHao {
  chuaCo: false; capNhat: string | null; homNay: string; coGia: boolean; tong: number; trang: number; co: number; dong: DongChungTu[];
}
export interface ChuaCoTieuHao { chuaCo: true; homNay: string }

export interface BoLocTieuHao {
  /** Tháng 'YYYY-MM' */
  tu?: string;
  den?: string;
  nhom?: string[];
  ct?: string[];
  hex?: string[];
  xuong?: string[];
  mvt?: MvtTieuHao;
  q?: string;
  an806?: boolean;
  an401?: boolean;
  /** false = hiện nhóm BTP / TP (mã 200* / 300* xuất lại vào lệnh — mặc định ẩn vì trùng vật tư đã xuất cho lệnh BTP) */
  anBtp?: boolean;
  chuaGhep?: boolean;
}

export const thamSoTieuHao = (loc: BoLocTieuHao, them: Record<string, string | number | undefined | null> = {}): URLSearchParams => {
  const q = new URLSearchParams();
  if (loc.tu) q.set('tu', loc.tu);
  if (loc.den) q.set('den', loc.den);
  if (loc.nhom?.length) q.set('nhom', loc.nhom.join(','));
  if (loc.ct?.length) q.set('ct', loc.ct.join(','));
  // HEX / xưởng: lặp tham số, KHÔNG nối dấu phẩy (HEX ghép 'H1, H2' là 1 khoá — máy chủ không tách)
  for (const h of loc.hex ?? []) q.append('hex', h);
  for (const x of loc.xuong ?? []) q.append('xuong', x);
  if (loc.mvt) q.set('mvt', loc.mvt);
  if (loc.q?.trim()) q.set('q', loc.q.trim());
  if (loc.an806 === false) q.set('an806', '0');
  if (loc.an401 === false) q.set('an401', '0');
  if (loc.anBtp === false) q.set('anBtp', '0');
  if (loc.chuaGhep) q.set('chuaGhep', '1');
  for (const [k, v] of Object.entries(them)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  return q;
};

const urlTh = (duong: string, q: URLSearchParams) => {
  const s = q.toString();
  return `${API_BASE_URL}/vat-tu/tieu-hao/${duong}${s ? `?${s}` : ''}`;
};

export const layTongHopTieuHao = (loc: BoLocTieuHao, theo: TheoTieuHao, signal?: AbortSignal): Promise<TongHopTieuHao | ChuaCoTieuHao> =>
  layJson(urlTh('tong-hop', thamSoTieuHao(loc, { theo })), signal);

/** Dòng chứng từ (phân trang). ma: mã VT ('-' = không mã); dvt: ĐVT ('-' = không ghi; bỏ trống = mọi ĐVT) */
export const layChiTietTieuHao = (
  loc: BoLocTieuHao, opt: { ma?: string | null; dvt?: string | null; trang?: number; co?: number } = {}, signal?: AbortSignal,
): Promise<ChiTietTieuHao | ChuaCoTieuHao> =>
  layJson(urlTh('chi-tiet', thamSoTieuHao(loc, { ma: opt.ma, dvt: opt.dvt, trang: opt.trang, co: opt.co })), signal);
