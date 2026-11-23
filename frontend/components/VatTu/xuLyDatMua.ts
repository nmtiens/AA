// ============================================================================
// HÀM THUẦN trang Đặt – Mua (/vat-tu/dat-mua) — test: xuLyDatMua.test.ts
// Trạng thái dòng PR do máy chủ tính (CASE ở backend/src/routes/vatTu.ts) — ở đây chỉ nhãn / màu / định dạng / Excel.
// ============================================================================
import { TRANG_THAI_PR, type BoLocDatMua, type DongPr, type LoaiO, type SoGop, type TrangThaiPr } from '../../services/vatTuApi';
import { fmtInt, fmtQty } from '../../utils/format';

export const NHAN_TRANG_THAI: Record<TrangThaiPr, string> = {
  chuaMua: 'Chưa mua',
  dungHen: 'Đang về đúng hẹn',
  tre: 'Trễ hẹn',
  motPhan: 'Về một phần',
  theoNhuCau: 'Về theo nhu cầu SX',
  giaCong: 'Gia công ngoài',
  du: 'Đã về đủ',
  dongThieu: 'Đóng thiếu',
  dongKhongPo: 'Đóng không PO',
  tamDung: 'Tạm dừng / CCLD',
  huy: 'Hủy',
};

/** Nhãn ô trạng thái (chữ + nền) — trễ / đóng thiếu đỏ, chờ cam, về xanh */
export const MAU_TRANG_THAI: Record<TrangThaiPr, string> = {
  chuaMua: 'bg-amber-100 text-amber-800',
  dungHen: 'bg-sky-100 text-sky-800',
  tre: 'bg-red-100 text-red-700',
  motPhan: 'bg-indigo-100 text-indigo-800',
  theoNhuCau: 'bg-cyan-100 text-cyan-800',
  giaCong: 'bg-violet-100 text-violet-800',
  du: 'bg-emerald-100 text-emerald-800',
  dongThieu: 'bg-rose-100 text-rose-800',
  dongKhongPo: 'bg-slate-200 text-slate-700',
  tamDung: 'bg-stone-200 text-stone-700',
  huy: 'bg-slate-100 text-slate-500',
};

/** Thẻ "Đang về": có PO, chưa về đủ, CHƯA trễ (trễ có thẻ riêng) — TT_DANG_VE ở máy chủ trừ 'tre' */
export const TT_VE_CHUA_TRE: TrangThaiPr[] = ['dungHen', 'motPhan', 'theoNhuCau', 'giaCong'];

/**
 * Trạng thái gửi khi bấm ô "Số dòng PR": ô đó không bao giờ đếm dòng HỦY (kể cả khi bật "Hiện dòng HỦY") => danh sách
 * cũng bỏ HỦY; đang lọc tình trạng thì giữ đúng các tình trạng đó.
 */
export const trangThaiSoDong = (loc: BoLocDatMua): TrangThaiPr[] =>
  (loc.trangThai?.length ? loc.trangThai : [...TRANG_THAI_PR]).filter(t => t !== 'huy');

/** Khoảng ngày PR của bảng khi chọn 1 tháng trên biểu đồ: GIAO của khoảng đang lọc và tháng đó (không nới rộng bộ lọc) */
export const giaoKhoang = (loc: BoLocDatMua, k: { tu: string; den: string }): { tu: string; den: string } => ({
  tu: loc.tu && loc.tu > k.tu ? loc.tu : k.tu,
  den: loc.den && loc.den < k.den ? loc.den : k.den,
});

export const NHAN_LOAI_O: Record<LoaiO, string> = {
  prChuaPoQua14: 'PR chưa có PO quá 14 ngày',
  canTrong14: 'Còn chờ, cần trong 14 ngày tới (kể cả đã quá ngày cần)',
  ve7Ngay: 'Hẹn về trong 7 ngày tới',
  conCho: 'Còn chờ (chưa mua + đang về)',
  dangVe: 'Đang về (có PO, chưa về đủ)',
};

/** Cột số của bảng chính: khoá trong SoGop, nhãn, ô bấm (trạng thái hoặc loại ô) */
export type CotSo = {
  khoa: keyof SoGop;
  nhan: string;
  donVi?: string;
  /** Bấm ô => danh sách dòng PR lọc theo trạng thái / loại ô; không có => không bấm */
  trangThai?: TrangThaiPr[];
  loai?: LoaiO;
  tien?: boolean;
  phanTram?: boolean;
  mau?: string;
  /** Ẩn cả cột khi dòng TỔNG = 0 (trạng thái ít gặp) */
  anKhiRong?: boolean;
};

export const COT_BANG: CotSo[] = [
  { khoa: 'soDong', nhan: 'Số dòng PR', donVi: 'dòng' },
  { khoa: 'chuaMua', nhan: 'Chưa mua', trangThai: ['chuaMua'], mau: 'text-amber-700' },
  { khoa: 'dungHen', nhan: 'Đang về', donVi: 'đúng hẹn', trangThai: ['dungHen'] },
  { khoa: 'tre', nhan: 'Trễ hẹn', trangThai: ['tre'], mau: 'text-red-600' },
  { khoa: 'motPhan', nhan: 'Về một phần', trangThai: ['motPhan'] },
  { khoa: 'theoNhuCau', nhan: 'Theo nhu cầu', donVi: 'SX (quá hạn)', trangThai: ['theoNhuCau'], anKhiRong: true },
  { khoa: 'giaCong', nhan: 'Gia công', donVi: 'ngoài', trangThai: ['giaCong'], mau: 'text-violet-700', anKhiRong: true },
  { khoa: 'du', nhan: 'Đã về đủ', trangThai: ['du'], mau: 'text-emerald-700' },
  { khoa: 'dongThieu', nhan: 'Đóng thiếu', trangThai: ['dongThieu'], mau: 'text-rose-700' },
  { khoa: 'dongKhongPo', nhan: 'Đóng', donVi: 'không PO', trangThai: ['dongKhongPo'], mau: 'text-slate-600' },
  { khoa: 'tamDung', nhan: 'Tạm dừng', donVi: '/ CCLD', trangThai: ['tamDung'], mau: 'text-stone-600', anKhiRong: true },
  { khoa: 'huy', nhan: 'Hủy', trangThai: ['huy'], mau: 'text-slate-500', anKhiRong: true },
  { khoa: 'ptDungHen', nhan: '% đúng hẹn', donVi: 'đang về', phanTram: true },
  { khoa: 'giaTriPr', nhan: 'Giá trị PR', donVi: 'triệu', tien: true },
  { khoa: 'giaTriCho', nhan: 'Giá trị chờ về', donVi: 'triệu', tien: true, loai: 'dangVe' },
  { khoa: 'prChuaPoQua14', nhan: 'PR chưa PO', donVi: '> 14 ngày', loai: 'prChuaPoQua14', mau: 'text-amber-700' },
  { khoa: 'canTrong14', nhan: 'Cần ≤ 14 ngày', donVi: 'còn chờ', loai: 'canTrong14' },
];

/** Cột bảng chính đang hiện: bỏ cột tiền khi không có quyền giá, bỏ cột trạng thái ít gặp khi TỔNG = 0 */
export const cotBangHien = (coGia: boolean, tong: SoGop | null | undefined): CotSo[] =>
  COT_BANG.filter(c => (coGia || !c.tien) && (!c.anKhiRong || !!tong?.[c.khoa]));

/** Tiền (triệu đồng): ≥ 10 số nguyên có phân cách; < 10 một số lẻ; 0 / null => '' */
export const fmtTrieu = (v: number | null | undefined): string => {
  if (v === null || v === undefined || !Number.isFinite(v) || Math.abs(v) < 0.05) return '';
  return Math.abs(v) >= 10 ? fmtInt(v) : v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

/** Ô số của bảng: 0 để trống; % một số lẻ; tiền theo fmtTrieu */
export const fmtO = (cot: CotSo, v: number | null | undefined): string => {
  if (v === null || v === undefined) return cot.phanTram ? '—' : '';
  if (cot.phanTram) return `${v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  if (cot.tien) return fmtTrieu(v);
  return v ? fmtInt(v) : '';
};

/** 'YYYY-MM' => khoảng ngày đủ tháng */
export const khoangThang = (thang: string): { tu: string; den: string } | null => {
  const m = /^(\d{4})-(\d{2})$/.exec(thang);
  if (!m) return null;
  const nam = Number(m[1]), t = Number(m[2]);
  if (t < 1 || t > 12) return null;
  const cuoi = new Date(Date.UTC(nam, t, 0)).getUTCDate();
  return { tu: `${m[1]}-${m[2]}-01`, den: `${m[1]}-${m[2]}-${String(cuoi).padStart(2, '0')}` };
};

/** 'YYYY-MM' => 'T8/26' (nhãn trục biểu đồ) */
export const nhanThangNgan = (thang: string): string => {
  const m = /^(\d{4})-(\d{2})$/.exec(thang);
  return m ? `T${Number(m[2])}/${m[1].slice(2)}` : thang;
};

/** 'YYYY-MM-DD' => 'dd/mm/yyyy'; trống => '' */
export const fmtNgay = (s: string | null | undefined): string =>
  s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '';

/** Ô công trình: tách dấu phẩy / chấm phẩy / khoảng trắng, viết hoa, bỏ trùng */
export const tachCongTrinh = (s: string): string[] =>
  [...new Set(s.split(/[\s,;]+/).map(x => x.trim().toUpperCase()).filter(Boolean))];

/** Số ngày từ hôm nay tới `ngay` (âm = đã qua); thiếu => null */
export const soNgayToi = (ngay: string | null | undefined, homNay: string): number | null => {
  if (!ngay || !/^\d{4}-\d{2}-\d{2}/.test(ngay) || !/^\d{4}-\d{2}-\d{2}/.test(homNay)) return null;
  const a = Date.UTC(+ngay.slice(0, 4), +ngay.slice(5, 7) - 1, +ngay.slice(8, 10));
  const b = Date.UTC(+homNay.slice(0, 4), +homNay.slice(5, 7) - 1, +homNay.slice(8, 10));
  return Math.round((a - b) / 86_400_000);
};

/** Cột danh sách dòng PR (như BASE_COLUMNS của HexMaterialModal, thêm hạn + trạng thái tính) */
export type CotDong = { khoa: keyof DongPr; nhan: string; kieu: 'chu' | 'so' | 'ma' | 'ngay' | 'tien' | 'tt'; gia?: boolean; rong?: string };
export const COT_DONG: CotDong[] = [
  { khoa: 'tt', nhan: 'Tình trạng', kieu: 'tt' },
  { khoa: 'soPr', nhan: 'Số PR', kieu: 'ma' },
  { khoa: 'prLine', nhan: 'PR line', kieu: 'ma' },
  { khoa: 'ngayPr', nhan: 'Ngày PR', kieu: 'ngay' },
  { khoa: 'trackingno', nhan: 'Mã CT', kieu: 'chu' },
  { khoa: 'tenCongTrinh', nhan: 'Công trình', kieu: 'chu', rong: 'min-w-[14rem]' },
  { khoa: 'ma', nhan: 'Mã VT (SAP)', kieu: 'ma' },
  { khoa: 'tenVatTu', nhan: 'Tên vật tư', kieu: 'chu', rong: 'min-w-[16rem]' },
  { khoa: 'nhomVt', nhan: 'Nhóm VT', kieu: 'chu' },
  { khoa: 'dvt', nhan: 'ĐVT', kieu: 'chu' },
  { khoa: 'slYeuCau', nhan: 'SL yêu cầu', kieu: 'so' },
  { khoa: 'slDaNhan', nhan: 'SL đã nhận (SAP)', kieu: 'so' },
  { khoa: 'slConLai', nhan: 'SL còn lại', kieu: 'so' },
  { khoa: 'soPo', nhan: 'Số PO', kieu: 'ma' },
  { khoa: 'nhaCungCap', nhan: 'Nhà cung cấp', kieu: 'chu', gia: true, rong: 'min-w-[12rem]' },
  { khoa: 'ngayCan', nhan: 'Ngày cần VT', kieu: 'ngay' },
  { khoa: 'han', nhan: 'Hạn về', kieu: 'ngay' },
  { khoa: 'ngayThucTeVe', nhan: 'Ngày thực tế về', kieu: 'ngay' },
  { khoa: 'donGia', nhan: 'Đơn giá (đồng)', kieu: 'so', gia: true },
  { khoa: 'thanhTien', nhan: 'Thành tiền (triệu)', kieu: 'tien', gia: true },
  { khoa: 'tinhTrangPo', nhan: 'Tình trạng PO', kieu: 'chu' },
  { khoa: 'teamPrNote', nhan: 'Team PR note', kieu: 'chu', rong: 'min-w-[10rem]' },
  { khoa: 'ghiChuPo', nhan: 'Ghi chú tình trạng PO', kieu: 'chu', rong: 'min-w-[12rem]' },
  { khoa: 'trangThai', nhan: 'Trạng thái', kieu: 'chu' },
  { khoa: 'trangThaiSap', nhan: 'Trạng thái SAP', kieu: 'chu' },
  { khoa: 'nguoiYeuCau', nhan: 'Người yêu cầu', kieu: 'chu' },
  { khoa: 'maNhaMay', nhan: 'Mã nhà máy', kieu: 'chu' },
  { khoa: 'codeVatLieu', nhan: 'Code VL', kieu: 'chu' },
];

export const cotDongHien = (coGia: boolean): CotDong[] => COT_DONG.filter(c => coGia || !c.gia);

/** Chữ hiển thị 1 ô dòng PR */
export const chuODong = (c: CotDong, d: DongPr): string => {
  const v = d[c.khoa];
  if (v === null || v === undefined || v === '') return '';
  if (c.kieu === 'tt') return NHAN_TRANG_THAI[v as TrangThaiPr] ?? String(v);
  if (c.kieu === 'ngay') return fmtNgay(String(v));
  if (c.kieu === 'tien') return fmtTrieu(Number(v));
  if (c.kieu === 'so') return fmtQty(v);
  return String(v);
};

/** Bảng Excel (mảng 2 chiều): dòng tiêu đề + mỗi dòng PR; số giữ kiểu số, ngày giữ chuỗi dd/mm/yyyy */
export const bangExcelDong = (dong: DongPr[], coGia: boolean): (string | number | null)[][] => {
  const cot = cotDongHien(coGia);
  const dau = cot.map(c => c.nhan);
  const than = dong.map(d => cot.map(c => {
    const v = d[c.khoa];
    if (v === null || v === undefined || v === '') return null;
    if (c.kieu === 'tt') return NHAN_TRANG_THAI[v as TrangThaiPr] ?? String(v);
    if (c.kieu === 'ngay') return fmtNgay(String(v));
    if (c.kieu === 'so' || c.kieu === 'tien') { const n = Number(v); return Number.isFinite(n) ? n : null; }
    return String(v);
  }));
  return [dau, ...than];
};

/** Tên file Excel an toàn: bỏ ký tự cấm, khoảng trắng => '-' */
export const tenFileAnToan = (s: string): string =>
  s.normalize('NFC').replace(/[\\/:*?"<>|]+/g, ' ').trim().replace(/[\s-]+/g, '-').slice(0, 80) || 'dat-mua';
