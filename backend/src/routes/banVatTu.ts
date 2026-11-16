import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { app } from '../server/app.js';
import { createCache, cachedByVersions } from '../server/cache.js';
import { userHasPermission, MATERIAL_PRICE_PERMISSION } from '../server/permissions.js';

// ============================================================================
// BÁN VẬT TƯ TỒN KHO — bán TẤT CẢ hàng đang tồn trong kho vật tư (kể cả hàng gán công trình, mã đầu 800 giá 0,
// CCDC đầu 400; hàng gán công trình chỉ gắn nhãn ở giao diện)
//   GET /api/ban-vat-tu/danh-sach      từng dòng tồn (mã + kho) kèm thuộc tính master và thông tin bán
//   PUT /api/ban-vat-tu/:ma            sửa thông tin bán của 1 mã (giá bán, ảnh, trạng thái, liên hệ, ghi chú)
//   GET /api/ban-vat-tu/:ma/mua-hang   lý lịch mua (PR/PO trong bảng vat_tu) của 1 mã — NCC / giá chỉ khi có quyền giá
//   GET /api/ban-vat-tu/anh/:id        bytes 1 ảnh nội bộ (ban_vt_anh — ảnh mẫu sheet 03_MATERIALS, nạp bằng nap_anh_vat_tu.py)
//   PUT /api/ban-vat-tu/anh/:id        duyệt / ẩn ảnh nội bộ { trangThai?: 'da_duyet' | 'an' | 'tu_dong', congKhai?: boolean }
//   PUT /api/ban-vat-tu/cong-khai-hang-loat  đăng / gỡ hàng loạt mã lên trang khách { mas, bat }
//   GET /api/ban-vat-tu/yeu-cau        yêu cầu báo giá khách gửi từ trang công khai (+ số yêu cầu 'moi')
//   PUT /api/ban-vat-tu/yeu-cau/:id    đổi trạng thái / ghi chú nội bộ của 1 yêu cầu
//
// Trang khách 15/11 (backend/sql/2026-11-15_ban_vat_tu_cong_khai.sql; API công khai ở routes/banVatTuCongKhai.ts):
// ban_vt_thong_tin.dang_cong_khai / ten_hien_thi / mo_ta_cong_khai / dang_cong_khai_luc, ban_vt_anh.cong_khai, bảng
// ban_vt_yeu_cau. Chưa chạy SQL (42703) => danh sách / PUT cũ vẫn chạy (cột mới coi như mặc định: chưa đăng, ảnh không
// công khai); sửa trường mới / đăng hàng loạt / yêu cầu => 503 kèm tên file SQL.
//
// Bổ sung 15/11 (backend/sql/2026-11-15_ban_vat_tu_bo_sung.sql): ban_vt_master.suy_tu_ten (thuộc tính tách từ tên, chỉ
// trường master đang trống) + bảng ban_vt_anh. Chưa chạy SQL (42P01 / 42703) => danh sách vẫn trả như cũ (suyTuTen {},
// anh []), không 500.
//
// - Bảng (backend/sql/2026-11-14_ban_vat_tu_ton.sql, nạp bằng backend/scripts/nap_ban_vat_tu.py):
//     ban_vt_ton        ảnh chụp tồn kho (mỗi lần nạp xoá hết rồi ghi lại), nhiều dòng / mã (khác kho)
//     ban_vt_master     thuộc tính vật tư (ZMM60 + DEMO), PK ma_vat_tu
//     ban_vt_thong_tin  thông tin bán người dùng nhập trên web, PK ma_vat_tu
// - Ghép theo MÃ SAP dạng chuỗi, giữ nguyên (không zfill, không HEX).
// - gia_tri là TRIỆU ĐỒNG; giá bán gia_ban_vnd là ĐỒNG / 1 đơn vị; gia_binh_quan trong DB là đồng / price_unit đơn vị
//   như file SAP (price_unit có thể = 1000, vd gỗ CD3) => API trả master.giaBinhQuan đã chia price_unit (đồng / 1 đvt).
// - Ngày trả chuỗi 'YYYY-MM-DD' bằng to_char (Date của JS lúc nửa đêm giờ +7 qua toISOString() lùi 1 ngày).
// - Quyền: xem 'ban_vat_tu', sửa 'ban_vat_tu_sua' (ADMIN có mọi quyền — quyền là chuỗi trong users.permissions, không
//   có danh sách đăng ký ở máy chủ). Giá vốn (giaTri, donGiaVon, master.giaBinhQuan) chỉ trả cho người có quyền xem giá
//   vật tư (MATERIAL_PRICE_PERMISSION), bỏ ở máy chủ chứ không gửi xuống. Quyền đó che cả nhà cung cấp
//   (MATERIAL_PRICE_COLUMNS có nha_cung_cap) => thuộc tính MP37 NHÀ CUNG CẤP / MP18 MÃ SẢN PHẨM NCC cũng bỏ khi không có quyền.
// - Cache theo phiên bản RIÊNG table_versions 'ban_vt' (CHỈ loader bump => nhật ký cập nhật dữ liệu phản ánh đúng lần nạp
//   tồn kho) ghép MAX(updated_at) của ban_vt_thong_tin (PUT đổi). Không thêm vào TABLE_TO_VERSION_KEY của server/data.ts
//   (map đó cho phép tải nguyên bảng qua /api/all-data).
// - Chưa chạy SQL tạo bảng (lỗi 42P01) => GET trả danh sách rỗng + canhBao, không 500.
// ============================================================================

const TEN_PHIEN_BAN = 'ban_vt';
export const QUYEN_XEM = 'ban_vat_tu';
export const QUYEN_SUA = 'ban_vat_tu_sua';
const LOI_QUYEN_XEM = { error: 'Bạn chưa có quyền xem trang bán vật tư tồn kho' };
const LOI_QUYEN_SUA = { error: 'Bạn chưa có quyền sửa thông tin bán vật tư' };
export const CANH_BAO_THIEU_BANG = 'Chưa tạo bảng — chạy backend/sql/2026-11-14_ban_vat_tu_ton.sql';
// ~5.100 dòng nối 3 bảng: nhẹ, nhưng để rộng hơn trần mặc định phòng lúc DB bận
const TIMEOUT_MS = 15000;

export const TRANG_THAI_BAN = ['dang_ban', 'da_giu', 'da_ban', 'ngung_ban'] as const;
export type TrangThaiBan = typeof TRANG_THAI_BAN[number];
export const GIA_BAN_TOI_DA = 1e13;
export const SO_ANH_TOI_DA = 10;
export const URL_TOI_DA_KY_TU = 1000;
export const CHUOI_TOI_DA_KY_TU = 2000;
export const MA_TOI_DA_KY_TU = 100;
export const TEN_HIEN_THI_TOI_DA_KY_TU = 200;
export const SO_MA_HANG_LOAT_TOI_DA = 6000;
export const SQL_CONG_KHAI = 'backend/sql/2026-11-15_ban_vat_tu_cong_khai.sql';
const LOI_THIEU_COT_CONG_KHAI = { error: `Chưa tạo cột / bảng trang khách — chạy ${SQL_CONG_KHAI}` };

// ---------------------------------------------------------------------------
// KIỂU DỮ LIỆU (đúng hợp đồng với frontend/services/banVatTuApi.ts)
// ---------------------------------------------------------------------------
export interface ThongTinBan {
  giaBanVnd: number | null;
  anhUrls: string[];
  trangThai: TrangThaiBan;
  lienHe: string | null;
  ghiChu: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  /** đã duyệt đăng lên trang khách (trang khách chỉ hiện khi đồng thời trangThai = 'dang_ban') */
  dangCongKhai: boolean;
  /** tên cho khách (null => tên vật tư) */
  tenHienThi: string | null;
  /** mô tả cho khách (văn bản thuần) */
  moTaCongKhai: string | null;
}

export interface MasterVatTu {
  ten: string | null;
  nhomSap: string | null;
  tenNhomSap: string | null;
  loai: string | null;
  chungLoai: string | null;
  chatLieu: string | null;
  quyCach: string | null;
  mau: string | null;
  thuongHieu: string | null;
  xuatXu: string | null;
  thuocTinh: Record<string, string>;
  /** đồng / 1 đơn vị tính (= gia_binh_quan / price_unit của SAP); null nếu không có quyền xem giá */
  giaBinhQuan: number | null;
  /** thuộc tính tách từ tên (chỉ trường master đang trống): khoá chungLoai, quyCach, mau, maMau, thuongHieu, chatLieu */
  suyTuTen: Record<string, string>;
  /** thương hiệu suy từ NCC chính hãng của PR gần nhất (chỉ tên hãng trong THUONG_HIEU_NCC, không lộ NCC) */
  thuongHieuNcc: string | null;
  /** nguồn dòng master: 'MASTER' | 'DEMO_ZMM60' | 'DEMO_MP' | 'SUY_TEN' (= mã chưa có trong MASTER DATA, loader chỉ
   *  tạo dòng để mang thuộc tính suy từ tên) */
  nguon: string | null;
}

/** Ảnh nội bộ của 1 mã (bảng ban_vt_anh, bỏ ảnh đã ẩn) — tải bytes qua GET /api/ban-vat-tu/anh/:id */
export interface AnhVatTu {
  id: number;
  /** true = dòng sheet 03 chỉ có 1 mã SAP; false = dòng nhiều mã chung 1 ảnh => cần duyệt */
  chacChan: boolean;
  trangThai: 'tu_dong' | 'da_duyet';
  congTrinh: string | null;
  codeVatLieu: string | null;
  /** admin đã bật "hiện cho khách" (mặc định false: ảnh sheet 03 hay có chữ viết tay / dấu duyệt / tên CT) */
  congKhai: boolean;
}

export const TRANG_THAI_ANH = ['tu_dong', 'da_duyet', 'an'] as const;
export type TrangThaiAnh = typeof TRANG_THAI_ANH[number];
/** Số ảnh nội bộ tối đa trả cho 1 mã trong danh sách (loader giới hạn 6 ảnh sheet 03 / mã; chừa chỗ ảnh duyệt / chụp) */
export const SO_ANH_NOI_BO_TOI_DA = 12;

export interface LanMua {
  ngayPr: string | null;
  soPr: string | null;
  congTrinh: string | null;
  soLuong: number | null;
  dvt: string | null;
  /** đồng / dvt; null khi không có quyền giá hoặc dòng không có giá */
  donGia: number | null;
  /** tên NCC (bỏ mã số đầu); null khi không có quyền giá */
  ncc: string | null;
}

export interface MuaHangVatTu {
  soDongPr: number;
  ngayPrCuoi: string | null;
  /** mã / tên công trình, mới nhất trước, tối đa 10 */
  congTrinh: string[];
  codeVatLieu: string[];
  nhomVt: string | null;
  /** tên vật tư trên PR gần nhất có tên, chỉ khi khác tên tồn kho */
  tenPr: string | null;
  /** null khi không có quyền giá */
  nhaCungCap: string[] | null;
  donGiaGanNhat: { gia: number; dvt: string | null; ngay: string | null } | null;
  /** tối đa 20 dòng, mới nhất trước */
  lanMua: LanMua[];
}

export interface DongBanVatTu {
  ma: string;
  ten: string;
  dvt: string | null;
  soLuong: number;
  kho: string | null;
  ngayNhap: string | null;
  chamLuanChuyen: boolean;
  tenCongTrinh: string | null;
  maCongTrinh: string | null;
  /** triệu đồng; null nếu không có quyền xem giá */
  giaTri: number | null;
  /** đồng / đvt = giaTri * 1e6 / soLuong; null nếu không có quyền hoặc soLuong <= 0 */
  donGiaVon: number | null;
  master: MasterVatTu | null;
  ban: ThongTinBan;
  /** ảnh nội bộ: đã duyệt trước, rồi chắc chắn, rồi mới nhất */
  anh: AnhVatTu[];
}

export interface DanhSachBanVatTu {
  ngayChot: string | null;
  nguonFile: string | null;
  coGiaVon: boolean;
  coQuyenSua: boolean;
  items: DongBanVatTu[];
  canhBao?: string;
}

// ---------------------------------------------------------------------------
// HÀM THUẦN (test: backend/test/banVatTu.test.ts)
// ---------------------------------------------------------------------------
const so = (v: unknown): number => {
  const n = Number(v);
  return v === null || v === undefined || v === '' ? 0 : Number.isFinite(n) ? n : 0;
};
const soHoacNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const chuoiHoacNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export const laTrangThaiBan = (v: unknown): v is TrangThaiBan =>
  typeof v === 'string' && (TRANG_THAI_BAN as readonly string[]).includes(v);

/** URL ảnh hợp lệ: http(s)://…, ≤ URL_TOI_DA_KY_TU ký tự, không khoảng trắng / ký tự điều khiển. */
export const laUrlAnhHopLe = (v: unknown): v is string => {
  if (typeof v !== 'string' || v.length === 0 || v.length > URL_TOI_DA_KY_TU) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(v)) return false;
  try {
    const u = new URL(v);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname;
  } catch {
    return false;
  }
};

/** Mã vật tư trên URL: chuỗi khác rỗng (sau khi bỏ khoảng trắng 2 đầu), ≤ MA_TOI_DA_KY_TU ký tự. Giữ nguyên chuỗi
 *  (không zfill: mã 11 số là mã thật). Sai => null. */
export const docMaVatTu = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const ma = v.trim();
  return ma && ma.length <= MA_TOI_DA_KY_TU ? ma : null;
};

/** Trường người dùng gửi lên trong PUT; trường không gửi = giữ nguyên giá trị cũ. */
export interface ThayDoiBan {
  giaBanVnd?: number | null;
  anhUrls?: string[];
  trangThai?: TrangThaiBan;
  lienHe?: string | null;
  ghiChu?: string | null;
  dangCongKhai?: boolean;
  tenHienThi?: string | null;
  moTaCongKhai?: string | null;
}

/** Chuỗi tuỳ chọn: null / '' / chỉ khoảng trắng => null; bỏ khoảng trắng 2 đầu; > toiDa ký tự => sai. */
const docChuoiTuyChon = (v: unknown, toiDa = CHUOI_TOI_DA_KY_TU): { hopLe: true; giaTri: string | null } | { hopLe: false } => {
  if (v === null) return { hopLe: true, giaTri: null };
  if (typeof v !== 'string' || v.length > toiDa) return { hopLe: false };
  const s = v.trim();
  return { hopLe: true, giaTri: s === '' ? null : s };
};

/**
 * Kiểm tra thân PUT /api/ban-vat-tu/:ma. Hợp lệ khi:
 * - giaBanVnd: null hoặc số hữu hạn 0 … 1e13 (đồng / 1 đơn vị)
 * - anhUrls: mảng ≤ 10 URL http(s), mỗi URL ≤ 1000 ký tự (bỏ trùng, giữ thứ tự)
 * - trangThai: 'dang_ban' | 'da_giu' | 'da_ban' | 'ngung_ban'
 * - lienHe, ghiChu, moTaCongKhai: null hoặc chuỗi ≤ 2000 ký tự ('' => null); tenHienThi: ≤ 200 ký tự
 * - dangCongKhai: boolean (bật khi trạng thái khác 'dang_ban' vẫn lưu — trang khách chỉ hiện khi đang bán)
 * - có ít nhất 1 trường; trường lạ bị bỏ qua.
 */
export const kiemTraThanPut = (body: unknown): { hopLe: true; thayDoi: ThayDoiBan } | { hopLe: false; loi: string } => {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { hopLe: false, loi: 'Dữ liệu gửi lên không hợp lệ' };
  const b = body as Record<string, unknown>;
  const thayDoi: ThayDoiBan = {};

  if (b.giaBanVnd !== undefined) {
    if (b.giaBanVnd === null) thayDoi.giaBanVnd = null;
    else if (typeof b.giaBanVnd !== 'number' || !Number.isFinite(b.giaBanVnd) || b.giaBanVnd < 0 || b.giaBanVnd > GIA_BAN_TOI_DA) {
      return { hopLe: false, loi: 'Giá bán phải là số từ 0 đến 10.000 tỷ đồng' };
    } else thayDoi.giaBanVnd = b.giaBanVnd;
  }

  if (b.anhUrls !== undefined) {
    if (!Array.isArray(b.anhUrls)) return { hopLe: false, loi: 'Danh sách ảnh không hợp lệ' };
    const urls: string[] = [];
    for (const x of b.anhUrls) {
      const u = typeof x === 'string' ? x.trim() : x;
      if (!laUrlAnhHopLe(u)) return { hopLe: false, loi: `Link ảnh phải bắt đầu bằng http:// hoặc https:// và dài tối đa ${URL_TOI_DA_KY_TU} ký tự` };
      if (!urls.includes(u)) urls.push(u);
    }
    if (urls.length > SO_ANH_TOI_DA) return { hopLe: false, loi: `Tối đa ${SO_ANH_TOI_DA} ảnh cho 1 mã vật tư` };
    thayDoi.anhUrls = urls;
  }

  if (b.trangThai !== undefined) {
    if (!laTrangThaiBan(b.trangThai)) return { hopLe: false, loi: 'Trạng thái bán không hợp lệ' };
    thayDoi.trangThai = b.trangThai;
  }

  for (const truong of ['lienHe', 'ghiChu'] as const) {
    if (b[truong] === undefined) continue;
    const r = docChuoiTuyChon(b[truong]);
    if (!r.hopLe) return { hopLe: false, loi: `${truong === 'lienHe' ? 'Liên hệ' : 'Ghi chú'} tối đa ${CHUOI_TOI_DA_KY_TU} ký tự` };
    thayDoi[truong] = r.giaTri;
  }

  if (b.dangCongKhai !== undefined) {
    if (typeof b.dangCongKhai !== 'boolean') return { hopLe: false, loi: 'Đăng lên trang khách phải là true / false' };
    thayDoi.dangCongKhai = b.dangCongKhai;
  }
  if (b.tenHienThi !== undefined) {
    const r = docChuoiTuyChon(b.tenHienThi, TEN_HIEN_THI_TOI_DA_KY_TU);
    if (!r.hopLe) return { hopLe: false, loi: `Tên hiển thị cho khách tối đa ${TEN_HIEN_THI_TOI_DA_KY_TU} ký tự` };
    thayDoi.tenHienThi = r.giaTri;
  }
  if (b.moTaCongKhai !== undefined) {
    const r = docChuoiTuyChon(b.moTaCongKhai);
    if (!r.hopLe) return { hopLe: false, loi: `Mô tả cho khách tối đa ${CHUOI_TOI_DA_KY_TU} ký tự` };
    thayDoi.moTaCongKhai = r.giaTri;
  }

  if (Object.keys(thayDoi).length === 0) return { hopLe: false, loi: 'Không có thông tin nào để lưu' };
  return { hopLe: true, thayDoi };
};

/** Các cột thông tin bán (alias ban_*), dùng chung cho GET và RETURNING của PUT. coCongKhai = false: DB chưa chạy
 *  SQL trang khách (thiếu cột, 42703) => không đọc cột mới (dungThongTinBan coi như mặc định: chưa đăng). */
const SQL_COT_BAN = (b: string, coCongKhai = true) => `
  ${b}.gia_ban_vnd AS ban_gia, ${b}.anh_urls AS ban_anh, ${b}.trang_thai AS ban_trang_thai,
  ${b}.lien_he AS ban_lien_he, ${b}.ghi_chu AS ban_ghi_chu, ${b}.updated_by AS ban_updated_by,
  to_char(${b}.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ban_updated_at${coCongKhai ? `,
  ${b}.dang_cong_khai AS ban_dang_cong_khai, ${b}.ten_hien_thi AS ban_ten_hien_thi, ${b}.mo_ta_cong_khai AS ban_mo_ta_cong_khai` : ''}`;

/** Thay đổi có đụng cột trang khách (cần SQL 2026-11-15_ban_vat_tu_cong_khai.sql) */
export const coTruongCongKhai = (t: ThayDoiBan): boolean =>
  t.dangCongKhai !== undefined || t.tenHienThi !== undefined || t.moTaCongKhai !== undefined;

/** Cột DB của từng trường sửa được (thứ tự cố định => SQL ổn định). */
// Kiểu ép tường minh: tham số trong INSERT … SELECT không được suy kiểu theo cột đích như INSERT … VALUES
export const COT_THAY_DOI: Array<[keyof ThayDoiBan, string, string]> = [
  ['giaBanVnd', 'gia_ban_vnd', 'numeric'],
  ['anhUrls', 'anh_urls', 'text[]'],
  ['trangThai', 'trang_thai', 'text'],
  ['lienHe', 'lien_he', 'text'],
  ['ghiChu', 'ghi_chu', 'text'],
  ['dangCongKhai', 'dang_cong_khai', 'boolean'],
  ['tenHienThi', 'ten_hien_thi', 'text'],
  ['moTaCongKhai', 'mo_ta_cong_khai', 'text'],
];

/** Mốc "mới đăng" khi UPSERT trùng mã: bật từ tắt => now(); còn lại giữ mốc cũ (trang khách chỉ đọc mốc khi đang bật). */
const SQL_CAP_NHAT_MOC_DANG =
  'dang_cong_khai_luc = CASE WHEN EXCLUDED.dang_cong_khai AND NOT ban_vt_thong_tin.dang_cong_khai THEN now() '
  + 'ELSE ban_vt_thong_tin.dang_cong_khai_luc END';

/**
 * SQL UPSERT ban_vt_thong_tin CHỈ với các trường có gửi (trường không gửi: giữ giá trị cũ, dòng mới lấy mặc định của
 * bảng). Chỉ ghi khi mã có trong ban_vt_ton — không có dòng trả về => 404. $1 = mã, $2 = người sửa, $3… = giá trị.
 * docCotCongKhai = false: RETURNING không đọc cột trang khách (DB chưa chạy SQL trang khách, thay đổi không đụng cột đó).
 */
export const dungSqlUpsert = (ma: string, nguoiSua: string | null, thayDoi: ThayDoiBan, docCotCongKhai = true): { sql: string; thamSo: unknown[] } => {
  const cot: string[] = [];
  const giuCho: string[] = [];
  const giaTri: unknown[] = [];
  for (const [truong, tenCot, kieu] of COT_THAY_DOI) {
    if (thayDoi[truong] === undefined) continue;
    cot.push(tenCot);
    giaTri.push(thayDoi[truong]);
    giuCho.push(`$${giaTri.length + 2}::${kieu}`);
  }
  const capNhat = [...cot.map(c => `${c} = EXCLUDED.${c}`), 'updated_by = EXCLUDED.updated_by', 'updated_at = now()'];
  if (thayDoi.dangCongKhai !== undefined) {
    // Dòng mới: bật => mốc now(). Dòng đã có: xem SQL_CAP_NHAT_MOC_DANG
    const giuChoDang = giuCho[cot.indexOf('dang_cong_khai')];
    cot.push('dang_cong_khai_luc');
    giuCho.push(`CASE WHEN ${giuChoDang} THEN now() END`);
    capNhat.push(SQL_CAP_NHAT_MOC_DANG);
  }
  const sql = `
    INSERT INTO ban_vt_thong_tin (ma_vat_tu, ${[...cot, 'updated_by', 'updated_at'].join(', ')})
    SELECT $1::text, ${[...giuCho, '$2::text', 'now()'].join(', ')}
    WHERE EXISTS (SELECT 1 FROM ban_vt_ton WHERE ma_vat_tu = $1::text)
    ON CONFLICT (ma_vat_tu) DO UPDATE SET ${capNhat.join(', ')}
    RETURNING ${SQL_COT_BAN('ban_vt_thong_tin', docCotCongKhai || coTruongCongKhai(thayDoi))}`;
  return { sql, thamSo: [ma, nguoiSua, ...giaTri] };
};

/** Thông tin bán từ dòng DB (alias ban_*). Chưa có dòng (LEFT JOIN rỗng) => mặc định: đang bán, chưa giá, chưa ảnh. */
export const dungThongTinBan = (row: Record<string, unknown>): ThongTinBan => ({
  giaBanVnd: soHoacNull(row.ban_gia),
  anhUrls: Array.isArray(row.ban_anh) ? row.ban_anh.filter((x): x is string => typeof x === 'string' && x !== '') : [],
  trangThai: laTrangThaiBan(row.ban_trang_thai) ? row.ban_trang_thai : 'dang_ban',
  lienHe: chuoiHoacNull(row.ban_lien_he),
  ghiChu: chuoiHoacNull(row.ban_ghi_chu),
  updatedBy: chuoiHoacNull(row.ban_updated_by),
  updatedAt: chuoiHoacNull(row.ban_updated_at),
  dangCongKhai: row.ban_dang_cong_khai === true,
  tenHienThi: chuoiHoacNull(row.ban_ten_hien_thi),
  moTaCongKhai: chuoiHoacNull(row.ban_mo_ta_cong_khai),
});

/** JSONB thuộc tính MPxx => { tên: giá trị } chỉ giữ giá trị khác rỗng, mọi giá trị đổi ra chuỗi. */
export const chuanHoaThuocTinh = (v: unknown): Record<string, string> => {
  let o = v;
  if (typeof o === 'string') {
    try { o = JSON.parse(o); } catch { return {}; }
  }
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return {};
  const kq: Record<string, string> = {};
  for (const [k, x] of Object.entries(o as Record<string, unknown>)) {
    if (x === null || x === undefined || typeof x === 'object') continue;
    const s = String(x).trim();
    if (s !== '') kq[k] = s;
  }
  return kq;
};

/** Thuộc tính MPxx lộ nhà cung cấp — chỉ trả cho người có quyền xem giá / NCC (như nha_cung_cap của vật tư). */
export const THUOC_TINH_CAN_QUYEN_GIA = ['MP37', 'MP18'];
export const laThuocTinhNcc = (khoa: string): boolean => {
  const ma = /^(MP\d{2})\b/i.exec(khoa.trim())?.[1]?.toUpperCase();
  return (ma !== undefined && THUOC_TINH_CAN_QUYEN_GIA.includes(ma)) || /NH[ÀA] CUNG C[ẤA]P|\bNCC\b/i.test(khoa);
};

/** Giá bình quân SAP (đồng / price_unit) => đồng / 1 đvt. price_unit trống / ≤ 0 => coi là 1. */
export const giaBinhQuanMotDvt = (gia: unknown, priceUnit: unknown): number | null => {
  const g = soHoacNull(gia);
  if (g === null) return null;
  const pu = soHoacNull(priceUnit);
  return pu !== null && pu > 0 ? g / pu : g;
};

// ---------------------------------------------------------------------------
// BỔ SUNG 15/11: thuộc tính suy từ tên, thương hiệu theo NCC, ảnh nội bộ, lý lịch mua
// ---------------------------------------------------------------------------

/** Khoá suy_tu_ten (loader ghi snake_case) => khoá API camelCase. Khoá khác bị bỏ. */
export const KHOA_SUY_TU_TEN: Record<string, string> = {
  chung_loai: 'chungLoai', quy_cach: 'quyCach', mau: 'mau', ma_mau: 'maMau', thuong_hieu: 'thuongHieu', chat_lieu: 'chatLieu',
};

/** JSONB suy_tu_ten => { chungLoai: '…', … } chỉ khoá trong KHOA_SUY_TU_TEN, giá trị chuỗi / số khác rỗng. */
export const chuanHoaSuyTuTen = (v: unknown): Record<string, string> => {
  const tho = chuanHoaThuocTinh(v);
  const kq: Record<string, string> = {};
  for (const [k, x] of Object.entries(tho)) {
    const khoa = KHOA_SUY_TU_TEN[k.trim().toLowerCase()];
    if (khoa) kq[khoa] = x;
  }
  return kq;
};

/** Bỏ dấu tiếng Việt + in hoa (Đ => D, ä => A) để so tên hãng. */
export const boDauHoa = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'D').toUpperCase();

/**
 * NCC chính hãng => tên hãng. So trên chuỗi đã bỏ dấu + in hoa. Chỉ hãng có NCC thật trong vat_tu (đo 15/11:
 * HAFELE VIỆT NAM, BLUM VIỆT NAM, CP GỖ AN CƯỜNG / AN CƯỜNG, JOWAT VIỆT NAM, KNAUF, BOSCH, FORMICA (THAILAND),
 * SHERWIN-WILLIAMS, CN VIGLACERA GLASSKOTE) + vài hãng phụ kiện / sơn hay gặp. NCC phân phối / thương mại không có ở đây
 * => null (không đoán).
 */
export const THUONG_HIEU_NCC: Array<[RegExp, string]> = [
  [/\bHAFELE\b/, 'HAFELE'],
  [/\bBLUM\b/, 'BLUM'],
  [/\bHETTICH\b/, 'HETTICH'],
  [/\bAN CUONG\b/, 'AN CƯỜNG'],
  [/\bJOWAT\b/, 'JOWAT'],
  [/\bKNAUF\b/, 'KNAUF'],
  [/\bBOSCH\b/, 'BOSCH'],
  [/\bFORMICA\b/, 'FORMICA'],
  [/\bSHERWIN\b/, 'SHERWIN-WILLIAMS'],
  [/\bVIGLACERA\b/, 'VIGLACERA'],
  [/\bEGGER\b/, 'EGGER'],
  [/\bGRASS\b/, 'GRASS'],
  [/\bDULUX\b/, 'DULUX'],
  [/\bJOTUN\b/, 'JOTUN'],
  [/\bGROHE\b/, 'GROHE'],
  [/\bKOHLER\b/, 'KOHLER'],
];

const timHang = (s: string): string[] => {
  const t = boDauHoa(s);
  return THUONG_HIEU_NCC.filter(([re]) => re.test(t)).map(([, ten]) => ten);
};

/**
 * Thương hiệu suy từ NCC ("10000040 - HAFELE VIỆT NAM" => 'HAFELE'). NCC không thuộc THUONG_HIEU_NCC => null.
 * Tên vật tư ghi hãng KHÁC trong map (vd mã Blum mua qua Häfele) => null: NCC chỉ là nơi bán, tên vật tư mới đúng hãng
 * (phần đó đã có ở suyTuTen).
 */
export const thuongHieuTuNcc = (ncc: unknown, tenVatTu?: unknown): string | null => {
  if (typeof ncc !== 'string' || !ncc.trim()) return null;
  const hang = timHang(ncc.replace(/^\s*\d+\s*-\s*/, ''))[0];
  if (!hang) return null;
  if (typeof tenVatTu === 'string' && timHang(tenVatTu).some(h => h !== hang)) return null;
  return hang;
};

/** "10001388 - LEPLUS VIỆT NAM" => "LEPLUS VIỆT NAM" (bỏ mã NCC SAP đầu chuỗi). */
export const tenNcc = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/^\s*\d+\s*-\s*/, '').trim();
  return s || null;
};

const laTrangThaiAnh = (v: unknown): v is TrangThaiAnh =>
  typeof v === 'string' && (TRANG_THAI_ANH as readonly string[]).includes(v);

/** Id ảnh trên URL: số nguyên dương (BIGSERIAL, ≤ 15 chữ số để an toàn với Number). Sai => null. */
export const docIdAnh = (v: unknown): number | null => {
  if (typeof v !== 'string' || !/^\d{1,15}$/.test(v)) return null;
  const n = Number(v);
  return n > 0 ? n : null;
};

/**
 * Kiểm tra thân PUT /api/ban-vat-tu/anh/:id: { trangThai?: 'da_duyet' | 'an' | 'tu_dong', congKhai?: boolean } — ít
 * nhất 1 trường. Kết quả chỉ có khoá của trường đã gửi.
 */
export const kiemTraThanPutAnh = (body: unknown):
  { hopLe: true; trangThai?: TrangThaiAnh; congKhai?: boolean } | { hopLe: false; loi: string } => {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { hopLe: false, loi: 'Dữ liệu gửi lên không hợp lệ' };
  const b = body as Record<string, unknown>;
  const kq: { hopLe: true; trangThai?: TrangThaiAnh; congKhai?: boolean } = { hopLe: true };
  if (b.trangThai !== undefined) {
    if (!laTrangThaiAnh(b.trangThai)) return { hopLe: false, loi: 'Trạng thái ảnh phải là da_duyet, an hoặc tu_dong' };
    kq.trangThai = b.trangThai;
  }
  if (b.congKhai !== undefined) {
    if (typeof b.congKhai !== 'boolean') return { hopLe: false, loi: 'Hiện cho khách phải là true / false' };
    kq.congKhai = b.congKhai;
  }
  if (kq.trangThai === undefined && kq.congKhai === undefined) {
    return { hopLe: false, loi: 'Trạng thái ảnh phải là da_duyet, an hoặc tu_dong' };
  }
  return kq;
};

/** Kiểm tra thân PUT /api/ban-vat-tu/cong-khai-hang-loat: { mas: string[] (1…6000, bỏ trùng), bat: boolean }. */
export const kiemTraThanHangLoat = (body: unknown): { hopLe: true; mas: string[]; bat: boolean } | { hopLe: false; loi: string } => {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { hopLe: false, loi: 'Dữ liệu gửi lên không hợp lệ' };
  const b = body as Record<string, unknown>;
  if (typeof b.bat !== 'boolean') return { hopLe: false, loi: 'Thiếu bat (true = đăng, false = gỡ)' };
  if (!Array.isArray(b.mas) || b.mas.length === 0) return { hopLe: false, loi: 'Chưa chọn mã nào' };
  if (b.mas.length > SO_MA_HANG_LOAT_TOI_DA) return { hopLe: false, loi: `Tối đa ${SO_MA_HANG_LOAT_TOI_DA} mã mỗi lần` };
  const mas = new Set<string>();
  for (const x of b.mas) {
    const ma = docMaVatTu(x);
    if (!ma) return { hopLe: false, loi: 'Có mã vật tư không hợp lệ' };
    mas.add(ma);
  }
  return { hopLe: true, mas: [...mas], bat: b.bat };
};

export const TRANG_THAI_YEU_CAU = ['moi', 'dang_xu_ly', 'da_xong', 'huy'] as const;
export type TrangThaiYeuCau = typeof TRANG_THAI_YEU_CAU[number];
export const laTrangThaiYeuCau = (v: unknown): v is TrangThaiYeuCau =>
  typeof v === 'string' && (TRANG_THAI_YEU_CAU as readonly string[]).includes(v);

/** Kiểm tra thân PUT /api/ban-vat-tu/yeu-cau/:id: { trangThai?, ghiChuNoiBo? (≤ 2000, '' => null) } — ít nhất 1 trường. */
export const kiemTraThanPutYeuCau = (body: unknown):
  { hopLe: true; trangThai?: TrangThaiYeuCau; ghiChuNoiBo?: string | null } | { hopLe: false; loi: string } => {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { hopLe: false, loi: 'Dữ liệu gửi lên không hợp lệ' };
  const b = body as Record<string, unknown>;
  const kq: { hopLe: true; trangThai?: TrangThaiYeuCau; ghiChuNoiBo?: string | null } = { hopLe: true };
  if (b.trangThai !== undefined) {
    if (!laTrangThaiYeuCau(b.trangThai)) return { hopLe: false, loi: 'Trạng thái yêu cầu không hợp lệ' };
    kq.trangThai = b.trangThai;
  }
  if (b.ghiChuNoiBo !== undefined) {
    const r = docChuoiTuyChon(b.ghiChuNoiBo);
    if (!r.hopLe) return { hopLe: false, loi: `Ghi chú nội bộ tối đa ${CHUOI_TOI_DA_KY_TU} ký tự` };
    kq.ghiChuNoiBo = r.giaTri;
  }
  if (kq.trangThai === undefined && kq.ghiChuNoiBo === undefined) return { hopLe: false, loi: 'Không có thông tin nào để lưu' };
  return kq;
};

export interface DongYeuCauMua {
  ma: string;
  ten: string;
  soLuong: number;
  dvt: string | null;
}

export interface YeuCauMua {
  id: number;
  maYeuCau: string | null;
  items: DongYeuCauMua[];
  tenKhach: string;
  sdt: string;
  email: string | null;
  congTy: string | null;
  ghiChu: string | null;
  trangThai: TrangThaiYeuCau;
  ghiChuNoiBo: string | null;
  xuLyBoi: string | null;
  xuLyLuc: string | null;
  createdAt: string | null;
}

/** items JSONB của yêu cầu => mảng dòng (bỏ phần tử sai dạng). */
export const docDongYeuCau = (v: unknown): DongYeuCauMua[] => {
  let o = v;
  if (typeof o === 'string') {
    try { o = JSON.parse(o); } catch { return []; }
  }
  if (!Array.isArray(o)) return [];
  const kq: DongYeuCauMua[] = [];
  for (const x of o) {
    if (x === null || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    const ma = chuoiHoacNull(r.ma);
    const soLuong = soHoacNull(r.soLuong);
    if (!ma || soLuong === null) continue;
    kq.push({ ma, ten: chuoiHoacNull(r.ten) ?? ma, soLuong, dvt: chuoiHoacNull(r.dvt) });
  }
  return kq;
};

/** 1 dòng ban_vt_yeu_cau => yêu cầu API (admin). Không trả ip_hash / user_agent. */
export const dungYeuCau = (row: Record<string, unknown>): YeuCauMua => ({
  id: Number(row.id),
  maYeuCau: chuoiHoacNull(row.ma_yeu_cau),
  items: docDongYeuCau(row.items),
  tenKhach: String(row.ten_khach ?? ''),
  sdt: String(row.sdt ?? ''),
  email: chuoiHoacNull(row.email),
  congTy: chuoiHoacNull(row.cong_ty),
  ghiChu: chuoiHoacNull(row.ghi_chu),
  trangThai: laTrangThaiYeuCau(row.trang_thai) ? row.trang_thai : 'moi',
  ghiChuNoiBo: chuoiHoacNull(row.ghi_chu_noi_bo),
  xuLyBoi: chuoiHoacNull(row.xu_ly_boi),
  xuLyLuc: chuoiHoacNull(row.xu_ly_luc),
  createdAt: chuoiHoacNull(row.created_at),
});

/** Content-Type trả cho ảnh: chỉ kiểu ảnh raster quen thuộc (không SVG — có thể chứa script); lạ => image/jpeg. */
export const mimeAnhAnToan = (v: unknown): string => {
  const m = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(m) ? m : 'image/jpeg';
};

/** 1 dòng ban_vt_anh => ảnh API; dòng đã ẩn / trạng thái lạ / id sai => null. */
export const dungAnh = (row: Record<string, unknown>): AnhVatTu | null => {
  const id = Number(row.id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  if (row.trang_thai !== 'tu_dong' && row.trang_thai !== 'da_duyet') return null;
  return {
    id,
    chacChan: row.chac_chan === true,
    trangThai: row.trang_thai,
    congTrinh: chuoiHoacNull(row.cong_trinh)?.trim() || null,
    codeVatLieu: chuoiHoacNull(row.code_vat_lieu)?.trim() || null,
    congKhai: row.cong_khai === true,
  };
};

/**
 * Gom dòng ban_vt_anh theo mã, giữ thứ tự: đã duyệt trước, rồi chắc chắn, rồi mới nhất (created_at giảm dần; cùng lần
 * nạp thì theo thứ tự loader chèn = id tăng dần — loader đã xếp ưu tiên). Tối đa SO_ANH_NOI_BO_TOI_DA ảnh / mã.
 */
export const gomAnhTheoMa = (rows: Array<Record<string, unknown>>): Map<string, AnhVatTu[]> => {
  const tam = new Map<string, Array<{ a: AnhVatTu; tao: string }>>();
  for (const r of rows) {
    const a = dungAnh(r);
    const ma = chuoiHoacNull(r.ma_vat_tu);
    if (!a || !ma) continue;
    const ds = tam.get(ma) ?? [];
    ds.push({ a, tao: chuoiHoacNull(r.tao_luc) ?? '' });
    tam.set(ma, ds);
  }
  const kq = new Map<string, AnhVatTu[]>();
  for (const [ma, ds] of tam) {
    ds.sort((x, y) =>
      Number(y.a.trangThai === 'da_duyet') - Number(x.a.trangThai === 'da_duyet')
      || Number(y.a.chacChan) - Number(x.a.chacChan)
      || (x.tao < y.tao ? 1 : x.tao > y.tao ? -1 : 0)
      || x.a.id - y.a.id);
    kq.set(ma, ds.slice(0, SO_ANH_NOI_BO_TOI_DA).map(d => d.a));
  }
  return kq;
};

/** Dòng PR đã huỷ ("4.HỦY") không tính là lần mua. */
export const laDongPrHuy = (trangThai: unknown): boolean =>
  typeof trangThai === 'string' && /\bHUY\b/.test(boDauHoa(trangThai));

const chuoiGon = (v: unknown): string | null => {
  const s = chuoiHoacNull(v)?.trim();
  return s ? s : null;
};

/** Công trình của 1 dòng PR: trackingno (mã CTxx-xxx) nếu có, không thì tên công trình. */
const congTrinhDongPr = (r: Record<string, unknown>): string | null => chuoiGon(r.trackingno) ?? chuoiGon(r.ten_cong_trinh);

export const SO_CONG_TRINH_TOI_DA = 10;
export const SO_LAN_MUA_TOI_DA = 20;

/**
 * Dòng vat_tu của 1 mã (đã xếp MỚI NHẤT TRƯỚC) => lý lịch mua. Bỏ dòng PR huỷ. Giá trị "gần nhất" (nhóm VT, tên PR,
 * đơn giá) lấy dòng gần nhất CÓ giá trị đó, không phải dòng mới nhất nếu dòng đó trống. Đơn giá 0 = chưa có giá.
 * Không có quyền giá (coGiaVon = false): nhaCungCap / donGiaGanNhat = null, lanMua[].donGia / ncc = null.
 */
export const dungMuaHang = (rowsMoiTruoc: Array<Record<string, unknown>>, coGiaVon: boolean, tenTon: string | null): MuaHangVatTu => {
  const rows = rowsMoiTruoc.filter(r => !laDongPrHuy(r.trang_thai));
  const khacRong = (k: string) => rows.find(r => chuoiGon(r[k]) !== null);
  const duyNhat = (gt: Array<string | null>, toiDa = Infinity) => {
    const kq: string[] = [];
    for (const x of gt) if (x && !kq.includes(x) && kq.length < toiDa) kq.push(x);
    return kq;
  };
  const giaDong = (r: Record<string, unknown>) => {
    const g = soHoacNull(r.don_gia);
    return g !== null && g > 0 ? g : null;
  };
  const dongTen = khacRong('ten_vat_tu');
  const tenPrTho = dongTen ? chuoiGon(dongTen.ten_vat_tu) : null;
  const giong = (a: string, b: string) => a.replace(/\s+/g, ' ').toUpperCase() === b.replace(/\s+/g, ' ').toUpperCase();
  const dongGia = coGiaVon ? rows.find(r => giaDong(r) !== null) : undefined;
  return {
    soDongPr: rows.length,
    ngayPrCuoi: chuoiGon(khacRong('ngay_pr')?.ngay_pr),
    congTrinh: duyNhat(rows.map(congTrinhDongPr), SO_CONG_TRINH_TOI_DA),
    codeVatLieu: duyNhat(rows.map(r => chuoiGon(r.code_vat_lieu))),
    nhomVt: chuoiGon(khacRong('nhom_vt')?.nhom_vt),
    tenPr: tenPrTho && !(tenTon && giong(tenPrTho, tenTon.trim())) ? tenPrTho : null,
    nhaCungCap: coGiaVon ? duyNhat(rows.map(r => tenNcc(r.nha_cung_cap))) : null,
    donGiaGanNhat: dongGia ? { gia: giaDong(dongGia) as number, dvt: chuoiGon(dongGia.dvt), ngay: chuoiGon(dongGia.ngay_pr) } : null,
    lanMua: rows.slice(0, SO_LAN_MUA_TOI_DA).map(r => ({
      ngayPr: chuoiGon(r.ngay_pr),
      soPr: chuoiGon(r.so_pr),
      congTrinh: congTrinhDongPr(r),
      soLuong: soHoacNull(r.so_luong),
      dvt: chuoiGon(r.dvt),
      donGia: coGiaVon ? giaDong(r) : null,
      ncc: coGiaVon ? tenNcc(r.nha_cung_cap) : null,
    })),
  };
};

/** Dữ liệu bổ sung của 1 mã (đọc bằng truy vấn riêng để bảng / cột chưa tạo không làm hỏng danh sách). */
export interface PhuDong {
  suyTuTen?: unknown;
  /** NCC (nguyên chuỗi) của PR gần nhất có NCC */
  nccGanNhat?: unknown;
  anh?: AnhVatTu[];
}

/**
 * 1 dòng kết quả truy vấn danh sách => 1 item. Có master khi dòng master tồn tại (m_ma khác null). Không có quyền giá
 * (coGiaVon = false): giaTri / donGiaVon / giaBinhQuan = null, thuộc tính nhà cung cấp (MP37, MP18) bị bỏ.
 * suyTuTen / thuongHieuNcc gắn vào master (loader tạo dòng master nguon='SUY_TEN' cho mã chưa có master).
 */
export const dungDong = (row: Record<string, unknown>, coGiaVon: boolean, phu: PhuDong = {}): DongBanVatTu => {
  const ma = String(row.ma ?? '');
  const soLuong = so(row.so_luong);
  const giaTri = coGiaVon ? soHoacNull(row.gia_tri) : null;
  const donGiaVon = giaTri !== null && soLuong > 0 ? (giaTri * 1e6) / soLuong : null;
  const coMaster = row.m_ma !== null && row.m_ma !== undefined;
  const thuocTinh = chuanHoaThuocTinh(row.m_thuoc_tinh);
  if (!coGiaVon) for (const k of Object.keys(thuocTinh)) if (laThuocTinhNcc(k)) delete thuocTinh[k];
  const master: MasterVatTu | null = coMaster ? {
    ten: chuoiHoacNull(row.m_ten),
    nhomSap: chuoiHoacNull(row.m_nhom_sap),
    tenNhomSap: chuoiHoacNull(row.m_ten_nhom_sap),
    loai: chuoiHoacNull(row.m_loai),
    chungLoai: chuoiHoacNull(row.m_chung_loai),
    chatLieu: chuoiHoacNull(row.m_chat_lieu),
    quyCach: chuoiHoacNull(row.m_quy_cach),
    mau: chuoiHoacNull(row.m_mau),
    thuongHieu: chuoiHoacNull(row.m_thuong_hieu),
    xuatXu: chuoiHoacNull(row.m_xuat_xu),
    thuocTinh,
    giaBinhQuan: coGiaVon ? giaBinhQuanMotDvt(row.m_gia_binh_quan, row.m_price_unit) : null,
    suyTuTen: chuanHoaSuyTuTen(phu.suyTuTen),
    thuongHieuNcc: thuongHieuTuNcc(phu.nccGanNhat, row.ten ?? row.m_ten),
    nguon: chuoiHoacNull(row.m_nguon),
  } : null;
  // Tên: theo file tồn; trống thì lấy tên master; vẫn trống thì hiện mã
  const ten = (typeof row.ten === 'string' && row.ten.trim()) || master?.ten?.trim() || ma;
  return {
    ma,
    ten,
    // ĐVT theo file tồn; trống thì lấy của master
    dvt: chuoiHoacNull(row.dvt) || (coMaster ? chuoiHoacNull(row.m_dvt) : null),
    soLuong,
    kho: chuoiHoacNull(row.kho),
    ngayNhap: chuoiHoacNull(row.ngay_nhap),
    chamLuanChuyen: row.cham === true,
    tenCongTrinh: chuoiHoacNull(row.ten_cong_trinh),
    maCongTrinh: chuoiHoacNull(row.ma_cong_trinh),
    giaTri,
    donGiaVon,
    master,
    ban: dungThongTinBan(row),
    anh: phu.anh ?? [],
  };
};

/** Thứ tự: có giá => giá trị giảm dần rồi mã, kho; không có giá => theo mã, kho (thứ tự không lộ giá trị). */
export const xepDong = (items: DongBanVatTu[], coGiaVon: boolean): DongBanVatTu[] => {
  const soChuoi = (a: string | null, b: string | null) => ((a ?? '') < (b ?? '') ? -1 : (a ?? '') > (b ?? '') ? 1 : 0);
  return items.sort((a, b) =>
    (coGiaVon ? (b.giaTri ?? 0) - (a.giaTri ?? 0) : 0) || soChuoi(a.ma, b.ma) || soChuoi(a.kho, b.kho));
};

// ---------------------------------------------------------------------------
// PHIÊN BẢN (khoá cache) = table_versions 'ban_vt' (loader bump; chưa có dòng => MAX(updated_at) của bảng tồn)
// + MAX(updated_at) của ban_vt_thong_tin (PUT đổi — không bump table_versions để nhật ký cập nhật dữ liệu không báo
// "đã cập nhật" khi chỉ sửa giá / ảnh). Giữ 3 giây + dùng chung 1 truy vấn cho các lần gọi đồng thời (như
// routes/tonKhoVt.ts). theHe: PUT tăng => truy vấn bắt đầu trước PUT không được nhớ lại khoá cũ vào phienBanNho.
// ---------------------------------------------------------------------------
const PHIEN_BAN_TTL_MS = 3000;
let phienBanNho: { luc: number; khoa: string } | null = null;
let phienBanDangDoc: Promise<string> | null = null;
let theHe = 0;

const laThieuBang = (e: unknown) => (e as { code?: string })?.code === '42P01';
/** Bảng (42P01) hoặc cột (42703) bổ sung chưa tạo — chưa chạy backend/sql/2026-11-15_ban_vat_tu_bo_sung.sql */
const laThieuBangHoacCot = (e: unknown) => laThieuBang(e) || (e as { code?: string })?.code === '42703';

const DINH_DANG_GIO = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;

/** Mốc thay đổi ảnh nội bộ (PUT duyệt / ẩn ghi duyet_luc; loader nạp lại bump 'ban_vt'). Chưa có bảng => ''. */
const phienBanAnh = async (): Promise<string> => {
  try {
    const r = await timedQuery(
      `SELECT to_char(MAX(GREATEST(created_at, duyet_luc)) AT TIME ZONE 'UTC', ${DINH_DANG_GIO}) AS v, COUNT(*)::text AS n
       FROM ban_vt_anh`);
    return `${r.rows[0]?.v ?? ''}#${r.rows[0]?.n ?? 0}`;
  } catch (e) {
    if (!laThieuBangHoacCot(e)) throw e;
    return '';
  }
};

const tinhPhienBanChinh = async (): Promise<string> => {
  try {
    const r = await timedQuery(
      `SELECT (SELECT to_char(MAX(last_updated) AT TIME ZONE 'UTC', ${DINH_DANG_GIO})
                 FROM table_versions WHERE table_name = $1) AS tv,
              (SELECT to_char(MAX(updated_at) AT TIME ZONE 'UTC', ${DINH_DANG_GIO}) FROM ban_vt_thong_tin) AS tt`,
      [TEN_PHIEN_BAN]);
    const tv = r.rows[0]?.tv as string | null | undefined;
    const tt = (r.rows[0]?.tt as string | null | undefined) ?? '';
    if (tv) return `tv:${tv}|tt:${tt}`;
    const r2 = await timedQuery(
      `SELECT to_char(MAX(updated_at) AT TIME ZONE 'UTC', ${DINH_DANG_GIO}) AS v FROM ban_vt_ton`);
    return `ua:${r2.rows[0]?.v ?? 'rong'}|tt:${tt}`;
  } catch (e) {
    if (!laThieuBang(e)) throw e;
    return 'thieu-bang';
  }
};

const tinhPhienBan = async (): Promise<string> => {
  const [chinh, anh] = await Promise.all([tinhPhienBanChinh(), phienBanAnh()]);
  return `${chinh}|anh:${anh}`;
};

/** Sau khi ghi (PUT / đăng hàng loạt / duyệt ảnh): instance này thấy phiên bản mới ngay (instance khác chậm tối đa
 *  PHIEN_BAN_TTL_MS); truy vấn phiên bản đang chạy dở (bắt đầu trước khi ghi) không được nhớ lại khoá cũ. */
const boPhienBanNho = () => {
  theHe++;
  phienBanNho = null;
  phienBanDangDoc = null;
};

/** Khoá phiên bản dữ liệu bán vật tư — dùng chung cho trang khách (routes/banVatTuCongKhai.ts). */
export const docPhienBan = async (): Promise<string> => {
  if (phienBanNho && Date.now() - phienBanNho.luc < PHIEN_BAN_TTL_MS) return phienBanNho.khoa;
  if (phienBanDangDoc) return phienBanDangDoc;
  const theHeLucDau = theHe;
  phienBanDangDoc = (async () => {
    try {
      const khoa = await tinhPhienBan();
      // Có PUT xen giữa => khoá này có thể cũ: trả cho lượt gọi này nhưng không nhớ lại
      if (theHe === theHeLucDau) phienBanNho = { luc: Date.now(), khoa };
      return khoa;
    } finally {
      // PUT xen giữa đã bỏ promise này (phienBanDangDoc = null) => không xoá promise mới hơn
      if (theHe === theHeLucDau) phienBanDangDoc = null;
    }
  })();
  return phienBanDangDoc;
};

// 2 khoá: có / không có quyền giá vốn
const cacheDanhSach = createCache<Omit<DanhSachBanVatTu, 'coQuyenSua'>>(2);

const sqlDanhSach = (coCongKhai: boolean) => `
  WITH moc AS (
    SELECT t.ngay_chot, t.nguon_file FROM ban_vt_ton t
    ORDER BY t.ngay_chot DESC NULLS LAST, t.updated_at DESC NULLS LAST LIMIT 1
  )
  SELECT t.ma_vat_tu AS ma, t.ten_vat_tu AS ten, t.dvt, t.so_luong, t.gia_tri, t.kho,
         to_char(t.ngay_nhap_kho_gan_nhat, 'YYYY-MM-DD') AS ngay_nhap,
         COALESCE(t.cham_luan_chuyen, FALSE) AS cham,
         t.ten_cong_trinh, t.ma_cong_trinh,
         to_char((SELECT ngay_chot FROM moc), 'YYYY-MM-DD') AS ngay_chot,
         (SELECT nguon_file FROM moc) AS nguon_file,
         m.ma_vat_tu AS m_ma, m.ten_master AS m_ten, m.dvt AS m_dvt, m.nhom_sap AS m_nhom_sap,
         m.ten_nhom_sap AS m_ten_nhom_sap, m.loai_vat_tu AS m_loai, m.gia_binh_quan AS m_gia_binh_quan,
         m.price_unit AS m_price_unit,
         m.chung_loai AS m_chung_loai, m.chat_lieu AS m_chat_lieu, m.quy_cach AS m_quy_cach, m.mau AS m_mau,
         m.thuong_hieu AS m_thuong_hieu, m.xuat_xu AS m_xuat_xu, m.thuoc_tinh AS m_thuoc_tinh,
         m.nguon AS m_nguon,
         ${SQL_COT_BAN('b', coCongKhai)}
  FROM ban_vt_ton t
  LEFT JOIN ban_vt_master m ON m.ma_vat_tu = t.ma_vat_tu
  LEFT JOIN ban_vt_thong_tin b ON b.ma_vat_tu = t.ma_vat_tu
  -- Bảng nạp lại nguyên ảnh chụp mỗi lần; phòng còn sót lần chốt cũ thì chỉ lấy lần chốt mới nhất
  WHERE t.ngay_chot IS NOT DISTINCT FROM (SELECT ngay_chot FROM moc)`;

/** Chạy truy vấn bổ sung; bảng / cột chưa tạo => [] (danh sách vẫn trả như cũ). */
const docBoSung = async (sql: string): Promise<Array<Record<string, unknown>>> => {
  try {
    return (await timedQuery(sql, [], { timeoutMs: TIMEOUT_MS, workMemMb: 16 })).rows;
  } catch (e) {
    if (!laThieuBangHoacCot(e)) throw e;
    return [];
  }
};

const docSuyTuTen = async (): Promise<Map<string, unknown>> => new Map((await docBoSung(
  `SELECT ma_vat_tu, suy_tu_ten FROM ban_vt_master WHERE suy_tu_ten IS NOT NULL AND suy_tu_ten <> '{}'::jsonb`,
)).map(r => [String(r.ma_vat_tu), r.suy_tu_ten]));

// NCC của PR gần nhất CÓ NCC (bỏ PR huỷ) cho các mã đang tồn. Ghép theo mã SAP chuỗi: vat_tu.ma_vat_tu_sap là double
// => (::bigint)::text. Chỉ dùng để suy tên hãng — chuỗi NCC không gửi xuống giao diện.
const docNccGanNhat = async (): Promise<Map<string, unknown>> => new Map((await docBoSung(`
  SELECT DISTINCT ON (v.ma_vat_tu_sap) (v.ma_vat_tu_sap::bigint)::text AS ma, v.nha_cung_cap
  FROM vat_tu v
  WHERE v.ma_vat_tu_sap IS NOT NULL AND NULLIF(btrim(v.nha_cung_cap), '') IS NOT NULL
    AND COALESCE(v.trang_thai, '') NOT ILIKE '%HỦY%'
    AND (v.ma_vat_tu_sap::bigint)::text IN (SELECT ma_vat_tu FROM ban_vt_ton)
  ORDER BY v.ma_vat_tu_sap, v.ngay_pr DESC NULLS LAST, v.id DESC`,
)).map(r => [String(r.ma), r.nha_cung_cap]));

const sqlAnhTheoMa = (coCongKhai: boolean) => `
  SELECT a.id, a.ma_vat_tu, a.chac_chan, a.trang_thai, a.cong_trinh, a.code_vat_lieu,
         ${coCongKhai ? 'a.cong_khai' : 'FALSE AS cong_khai'},
         to_char(a.created_at AT TIME ZONE 'UTC', ${DINH_DANG_GIO}) AS tao_luc
  FROM ban_vt_anh a
  WHERE a.trang_thai <> 'an' AND a.ma_vat_tu IN (SELECT ma_vat_tu FROM ban_vt_ton)`;

/** Ảnh nội bộ theo mã; chưa có cột cong_khai (chưa chạy SQL trang khách) => đọc như cũ, congKhai = false. */
const docAnhTheoMa = async (): Promise<Map<string, AnhVatTu[]>> => {
  try {
    return gomAnhTheoMa((await timedQuery(sqlAnhTheoMa(true), [], { timeoutMs: TIMEOUT_MS, workMemMb: 16 })).rows);
  } catch (e) {
    if (!laThieuBangHoacCot(e)) throw e;
    return gomAnhTheoMa(await docBoSung(sqlAnhTheoMa(false)));
  }
};

/** Truy vấn danh sách; thiếu cột trang khách (42703) => đọc lại không có cột đó. Lỗi khác (kể cả 42P01) ném ra. */
const docDongDanhSach = async (): Promise<Array<Record<string, unknown>>> => {
  try {
    return (await timedQuery(sqlDanhSach(true), [], { timeoutMs: TIMEOUT_MS, workMemMb: 16 })).rows;
  } catch (e) {
    if ((e as { code?: string })?.code !== '42703') throw e;
    return (await timedQuery(sqlDanhSach(false), [], { timeoutMs: TIMEOUT_MS, workMemMb: 16 })).rows;
  }
};

export const tinhDanhSach = async (coGiaVon: boolean): Promise<Omit<DanhSachBanVatTu, 'coQuyenSua'>> => {
  let rows: Array<Record<string, unknown>>;
  try {
    rows = await docDongDanhSach();
  } catch (e) {
    if (!laThieuBang(e)) throw e;
    return { ngayChot: null, nguonFile: null, coGiaVon, items: [], canhBao: CANH_BAO_THIEU_BANG };
  }
  const [suyTuTen, nccGanNhat, anh] = await Promise.all([docSuyTuTen(), docNccGanNhat(), docAnhTheoMa()]);
  const items = xepDong(rows.map(r => {
    const ma = String(r.ma ?? '');
    return dungDong(r, coGiaVon, { suyTuTen: suyTuTen.get(ma), nccGanNhat: nccGanNhat.get(ma), anh: anh.get(ma) });
  }), coGiaVon);
  return {
    ngayChot: chuoiHoacNull(rows[0]?.ngay_chot),
    nguonFile: chuoiHoacNull(rows[0]?.nguon_file),
    coGiaVon,
    items,
  };
};

// ---------------------------------------------------------------------------
// GET /api/ban-vat-tu/danh-sach
// ---------------------------------------------------------------------------
app.get('/api/ban-vat-tu/danh-sach', async (req: Request, res: Response) => {
  try {
    if (!(await userHasPermission(req, QUYEN_XEM))) return res.status(403).json(LOI_QUYEN_XEM);
    const [coGiaVon, coQuyenSua] = await Promise.all([
      userHasPermission(req, MATERIAL_PRICE_PERMISSION),
      userHasPermission(req, QUYEN_SUA),
    ]);
    const khoa = await docPhienBan();
    // 'material' = phiên bản vat_tu (thương hiệu theo NCC đọc từ PR)
    const payload = await cachedByVersions(cacheDanhSach, `danh-sach|${coGiaVon ? 1 : 0}`, ['material'],
      () => tinhDanhSach(coGiaVon), khoa);
    // coQuyenSua theo từng người => gắn sau cache (không lưu vào cache dùng chung)
    const ketQua: DanhSachBanVatTu = { ...payload, coQuyenSua };
    res.json(ketQua);
  } catch (error) {
    console.error('Lỗi ban-vat-tu/danh-sach:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ---------------------------------------------------------------------------
// CÁC ĐƯỜNG CỐ ĐỊNH (/cong-khai-hang-loat, /yeu-cau, /anh/:id) — đăng ký TRƯỚC PUT '/api/ban-vat-tu/:ma' (không thì
// PUT /cong-khai-hang-loat bị /:ma bắt với ma = 'cong-khai-hang-loat').
// ---------------------------------------------------------------------------

// PUT /api/ban-vat-tu/cong-khai-hang-loat { mas, bat } — đăng / gỡ nhiều mã lên trang khách trong 1 câu lệnh.
// bat = true: UPSERT (mã chưa có dòng thông tin => tạo dòng, mặc định đang bán); chỉ mã có trong ban_vt_ton.
// bat = false: chỉ UPDATE dòng đang bật (không tạo dòng thừa). Trả số mã thực sự đổi.
const SQL_DANG_HANG_LOAT = `
  INSERT INTO ban_vt_thong_tin (ma_vat_tu, dang_cong_khai, dang_cong_khai_luc, updated_by, updated_at)
  SELECT DISTINCT t.ma_vat_tu, TRUE, now(), $2::text, now()
  FROM ban_vt_ton t WHERE t.ma_vat_tu = ANY($1::text[])
  ON CONFLICT (ma_vat_tu) DO UPDATE SET dang_cong_khai = TRUE, dang_cong_khai_luc = now(),
    updated_by = EXCLUDED.updated_by, updated_at = now()
  WHERE NOT ban_vt_thong_tin.dang_cong_khai
  RETURNING ma_vat_tu`;
const SQL_GO_HANG_LOAT = `
  UPDATE ban_vt_thong_tin SET dang_cong_khai = FALSE, updated_by = $2::text, updated_at = now()
  WHERE ma_vat_tu = ANY($1::text[]) AND dang_cong_khai
  RETURNING ma_vat_tu`;

app.put('/api/ban-vat-tu/cong-khai-hang-loat', async (req: Request, res: Response) => {
  try {
    if (!(await userHasPermission(req, QUYEN_SUA))) return res.status(403).json(LOI_QUYEN_SUA);
    const kt = kiemTraThanHangLoat(req.body);
    if (!kt.hopLe) return res.status(400).json({ error: kt.loi });
    let soDoi: number;
    try {
      soDoi = (await timedQuery(kt.bat ? SQL_DANG_HANG_LOAT : SQL_GO_HANG_LOAT, [kt.mas, req.user?.username ?? null],
        { timeoutMs: TIMEOUT_MS })).rows.length;
    } catch (e) {
      if (laThieuBangHoacCot(e)) return res.status(503).json(LOI_THIEU_COT_CONG_KHAI);
      throw e;
    }
    if (soDoi > 0) boPhienBanNho();
    res.json({ soDoi });
  } catch (error) {
    console.error('Lỗi ban-vat-tu cong-khai-hang-loat:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/ban-vat-tu/yeu-cau?trangThai=moi|dang_xu_ly|da_xong|huy — yêu cầu báo giá của khách, mới nhất trước, tối đa
// 500; soMoi = số yêu cầu 'moi' (huy hiệu, không phụ thuộc bộ lọc). Không cache (ít dòng, cần thấy ngay).
export const SO_YEU_CAU_TOI_DA = 500;
const DINH_DANG_GIO_GIAY = `'YYYY-MM-DD"T"HH24:MI:SS"Z"'`;
const SQL_COT_YEU_CAU = `id, ma_yeu_cau, items, ten_khach, sdt, email, cong_ty, ghi_chu, trang_thai, ghi_chu_noi_bo, xu_ly_boi,
  to_char(xu_ly_luc AT TIME ZONE 'UTC', ${DINH_DANG_GIO_GIAY}) AS xu_ly_luc,
  to_char(created_at AT TIME ZONE 'UTC', ${DINH_DANG_GIO_GIAY}) AS created_at`;

app.get('/api/ban-vat-tu/yeu-cau', async (req: Request, res: Response) => {
  try {
    if (!(await userHasPermission(req, QUYEN_XEM))) return res.status(403).json(LOI_QUYEN_XEM);
    const loc = req.query.trangThai;
    if (loc !== undefined && loc !== '' && !laTrangThaiYeuCau(loc)) return res.status(400).json({ error: 'Trạng thái lọc không hợp lệ' });
    const trangThai = laTrangThaiYeuCau(loc) ? loc : null;
    let rows: Array<Record<string, unknown>>;
    let soMoi: number;
    try {
      const [ds, dem] = await Promise.all([
        timedQuery(
          `SELECT ${SQL_COT_YEU_CAU} FROM ban_vt_yeu_cau
           WHERE ($1::text IS NULL OR trang_thai = $1::text)
           ORDER BY created_at DESC NULLS LAST, id DESC LIMIT ${SO_YEU_CAU_TOI_DA}`, [trangThai]),
        timedQuery(`SELECT COUNT(*)::int AS n FROM ban_vt_yeu_cau WHERE trang_thai = 'moi'`),
      ]);
      rows = ds.rows;
      soMoi = Number(dem.rows[0]?.n ?? 0);
    } catch (e) {
      if (!laThieuBangHoacCot(e)) throw e;
      return res.json({ items: [], soMoi: 0, canhBao: LOI_THIEU_COT_CONG_KHAI.error });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ items: rows.map(dungYeuCau), soMoi });
  } catch (error) {
    console.error('Lỗi ban-vat-tu yeu-cau:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PUT /api/ban-vat-tu/yeu-cau/:id { trangThai?, ghiChuNoiBo? } — ghi xu_ly_boi / xu_ly_luc
app.put('/api/ban-vat-tu/yeu-cau/:id', async (req: Request, res: Response) => {
  try {
    if (!(await userHasPermission(req, QUYEN_SUA))) return res.status(403).json(LOI_QUYEN_SUA);
    const id = docIdAnh(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Mã yêu cầu không hợp lệ' });
    const kt = kiemTraThanPutYeuCau(req.body);
    if (!kt.hopLe) return res.status(400).json({ error: kt.loi });
    const sets = ['xu_ly_boi = $2::text', 'xu_ly_luc = now()'];
    const thamSo: unknown[] = [id, req.user?.username ?? null];
    if (kt.trangThai !== undefined) { thamSo.push(kt.trangThai); sets.push(`trang_thai = $${thamSo.length}::text`); }
    if (kt.ghiChuNoiBo !== undefined) { thamSo.push(kt.ghiChuNoiBo); sets.push(`ghi_chu_noi_bo = $${thamSo.length}::text`); }
    let dong: Record<string, unknown> | undefined;
    try {
      dong = (await timedQuery(`UPDATE ban_vt_yeu_cau SET ${sets.join(', ')} WHERE id = $1 RETURNING ${SQL_COT_YEU_CAU}`, thamSo))
        .rows[0] as Record<string, unknown> | undefined;
    } catch (e) {
      if (laThieuBangHoacCot(e)) return res.status(503).json(LOI_THIEU_COT_CONG_KHAI);
      throw e;
    }
    if (!dong) return res.status(404).json({ error: 'Không tìm thấy yêu cầu' });
    res.json({ yeuCau: dungYeuCau(dong) });
  } catch (error) {
    console.error('Lỗi ban-vat-tu PUT yeu-cau:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/ban-vat-tu/anh/:id — bytes 1 ảnh nội bộ (giao diện fetch có token -> blob -> objectURL, như ảnh vướng mắc).
// Đăng ký TRƯỚC '/:ma/mua-hang' (không trùng mẫu vì khác đoạn cuối, nhưng để rõ thứ tự). Ảnh đã ẩn chỉ người có quyền
// sửa xem được (để bỏ ẩn).
// ---------------------------------------------------------------------------
app.get('/api/ban-vat-tu/anh/:id', async (req: Request, res: Response) => {
  try {
    if (!(await userHasPermission(req, QUYEN_XEM))) return res.status(403).json(LOI_QUYEN_XEM);
    const id = docIdAnh(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Mã ảnh không hợp lệ' });
    let dong: Record<string, unknown> | undefined;
    try {
      dong = (await timedQuery(`SELECT data, mime, trang_thai FROM ban_vt_anh WHERE id = $1`, [id])).rows[0] as
        Record<string, unknown> | undefined;
    } catch (e) {
      if (laThieuBangHoacCot(e)) return res.status(404).json({ error: 'Không tìm thấy ảnh' });
      throw e;
    }
    if (!dong || !Buffer.isBuffer(dong.data)) return res.status(404).json({ error: 'Không tìm thấy ảnh' });
    if (dong.trang_thai === 'an' && !(await userHasPermission(req, QUYEN_SUA))) {
      return res.status(404).json({ error: 'Không tìm thấy ảnh' });
    }
    res.setHeader('Content-Type', mimeAnhAnToan(dong.mime));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Bytes của 1 id không đổi (loader nạp lại => id mới) => giữ lâu ở trình duyệt; private: cần đăng nhập
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(dong.data);
  } catch (error) {
    console.error('Lỗi ban-vat-tu ảnh:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/ban-vat-tu/anh/:id { trangThai?, congKhai? } — duyệt / ẩn / trả về tự động / hiện cho khách. Ghi
// duyet_boi / duyet_luc ở MỌI thay đổi (kể cả chỉ bật / tắt congKhai): khoá cache danh sách + trang khách đổi qua
// MAX(duyet_luc) (phienBanAnh) — không bump table_versions 'ban_vt' (dòng đó chỉ phản ánh lần nạp, như PUT thông tin).
// ---------------------------------------------------------------------------
const sqlPutAnh = (coCongKhai: boolean) => `
  UPDATE ban_vt_anh SET trang_thai = COALESCE($2::text, trang_thai), duyet_boi = $3, duyet_luc = now()
    ${coCongKhai ? ', cong_khai = COALESCE($4::boolean, cong_khai)' : ''}
  WHERE id = $1
  RETURNING id, ma_vat_tu, chac_chan, trang_thai, cong_trinh, code_vat_lieu, ${coCongKhai ? 'cong_khai' : 'FALSE AS cong_khai'}`;

app.put('/api/ban-vat-tu/anh/:id', async (req: Request, res: Response) => {
  try {
    if (!(await userHasPermission(req, QUYEN_SUA))) return res.status(403).json(LOI_QUYEN_SUA);
    const id = docIdAnh(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Mã ảnh không hợp lệ' });
    const kt = kiemTraThanPutAnh(req.body);
    if (!kt.hopLe) return res.status(400).json({ error: kt.loi });
    const nguoi = req.user?.username ?? null;
    let dong: Record<string, unknown> | undefined;
    try {
      try {
        dong = (await timedQuery(sqlPutAnh(true), [id, kt.trangThai ?? null, nguoi, kt.congKhai ?? null])).rows[0] as
          Record<string, unknown> | undefined;
      } catch (e) {
        // Chưa có cột cong_khai: chỉ đổi trạng thái thì vẫn làm được như cũ
        if ((e as { code?: string })?.code !== '42703' || kt.congKhai !== undefined) throw e;
        dong = (await timedQuery(sqlPutAnh(false), [id, kt.trangThai ?? null, nguoi])).rows[0] as
          Record<string, unknown> | undefined;
      }
    } catch (e) {
      if (laThieuBangHoacCot(e)) {
        return res.status(503).json({ error: kt.congKhai !== undefined ? LOI_THIEU_COT_CONG_KHAI.error
          : 'Chưa tạo bảng ảnh — chạy backend/sql/2026-11-15_ban_vat_tu_bo_sung.sql' });
      }
      throw e;
    }
    if (!dong) return res.status(404).json({ error: 'Không tìm thấy ảnh' });
    boPhienBanNho();
    res.json({
      anh: {
        id: Number(dong.id),
        ma: chuoiHoacNull(dong.ma_vat_tu),
        chacChan: dong.chac_chan === true,
        trangThai: laTrangThaiAnh(dong.trang_thai) ? dong.trang_thai : 'tu_dong',
        congTrinh: chuoiGon(dong.cong_trinh),
        codeVatLieu: chuoiGon(dong.code_vat_lieu),
        congKhai: dong.cong_khai === true,
      },
    });
  } catch (error) {
    console.error('Lỗi ban-vat-tu PUT ảnh:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/ban-vat-tu/:ma — UPSERT ban_vt_thong_tin (updated_at = now() => khoá cache đổi qua MAX(updated_at);
// không bump table_versions 'ban_vt', dòng đó chỉ phản ánh lần nạp tồn kho). ĐĂNG KÝ SAU các đường cố định ở trên.
// ---------------------------------------------------------------------------
app.put('/api/ban-vat-tu/:ma', async (req: Request, res: Response) => {
  try {
    if (!(await userHasPermission(req, QUYEN_SUA))) return res.status(403).json(LOI_QUYEN_SUA);
    const ma = docMaVatTu(req.params.ma);
    if (!ma) return res.status(400).json({ error: 'Mã vật tư không hợp lệ' });
    const kt = kiemTraThanPut(req.body);
    if (!kt.hopLe) return res.status(400).json({ error: kt.loi });
    const nguoiSua = req.user?.username ?? null;

    let dong: Record<string, unknown> | undefined;
    try {
      // 1 câu lệnh (tự nguyên tử); mã không có trong ban_vt_ton => không ghi, không có dòng trả về
      const chay = async (docCotCongKhai: boolean) => {
        const { sql, thamSo } = dungSqlUpsert(ma, nguoiSua, kt.thayDoi, docCotCongKhai);
        return (await timedQuery(sql, thamSo)).rows[0] as Record<string, unknown> | undefined;
      };
      try {
        dong = await chay(true);
      } catch (e) {
        // Chưa chạy SQL trang khách: thay đổi không đụng cột mới thì vẫn lưu như cũ (RETURNING bỏ cột mới)
        if ((e as { code?: string })?.code !== '42703' || coTruongCongKhai(kt.thayDoi)) throw e;
        dong = await chay(false);
      }
    } catch (e) {
      if (laThieuBang(e)) return res.status(503).json({ error: CANH_BAO_THIEU_BANG });
      if ((e as { code?: string })?.code === '42703') return res.status(503).json(LOI_THIEU_COT_CONG_KHAI);
      throw e;
    }
    if (!dong) return res.status(404).json({ error: `Không có mã ${ma} trong tồn kho vật tư đang bán` });
    boPhienBanNho();
    res.json({ ban: dungThongTinBan(dong) });
  } catch (error) {
    console.error('Lỗi ban-vat-tu PUT:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/ban-vat-tu/:ma/mua-hang — lý lịch mua từ vat_tu (PR/PO). Cache dòng thô theo mã + phiên bản vat_tu
// ('material') + phiên bản 'ban_vt' (tên tồn để so tenPr); quyền giá áp SAU cache (dòng thô dùng chung).
// ---------------------------------------------------------------------------
const SO_DONG_PR_TOI_DA = 1000;
const cacheMuaHang = createCache<{ rows: Array<Record<string, unknown>>; tenTon: string | null }>(300);

const SQL_MUA_HANG = `
  SELECT (so_pr::bigint)::text AS so_pr, to_char(ngay_pr, 'YYYY-MM-DD') AS ngay_pr, trackingno, ten_cong_trinh,
         so_luong_yeu_cau AS so_luong, dvt, don_gia, nha_cung_cap, nhom_vt, code_vat_lieu, ten_vat_tu, trang_thai
  FROM vat_tu
  -- ma_vat_tu_sap là double: so bằng giá trị số (mã ≤ 15 chữ số biểu diễn chính xác) = so (::bigint)::text
  WHERE ma_vat_tu_sap = $1::double precision
  ORDER BY ngay_pr DESC NULLS LAST, so_pr DESC NULLS LAST, pr_line DESC NULLS LAST, id DESC
  LIMIT ${SO_DONG_PR_TOI_DA}`;

const docTenTon = async (ma: string): Promise<string | null> => {
  try {
    const r = await timedQuery(`SELECT ten_vat_tu FROM ban_vt_ton WHERE ma_vat_tu = $1 AND NULLIF(btrim(ten_vat_tu), '') IS NOT NULL LIMIT 1`, [ma]);
    return chuoiGon(r.rows[0]?.ten_vat_tu);
  } catch (e) {
    if (!laThieuBang(e)) throw e;
    return null;
  }
};

app.get('/api/ban-vat-tu/:ma/mua-hang', async (req: Request, res: Response) => {
  try {
    if (!(await userHasPermission(req, QUYEN_XEM))) return res.status(403).json(LOI_QUYEN_XEM);
    const ma = docMaVatTu(req.params.ma);
    if (!ma) return res.status(400).json({ error: 'Mã vật tư không hợp lệ' });
    const coGiaVon = await userHasPermission(req, MATERIAL_PRICE_PERMISSION);
    // Mã SAP trong vat_tu là số: mã có chữ / số 0 đầu (không bao giờ là (::bigint)::text) => không có dòng PR nào
    const laMaSo = /^[1-9]\d{0,14}$/.test(ma);
    const khoa = await docPhienBan();
    const tho = await cachedByVersions(cacheMuaHang, `mua|${ma}`, ['material'], async () => {
      const [rows, tenTon] = await Promise.all([
        laMaSo ? timedQuery(SQL_MUA_HANG, [ma], { timeoutMs: TIMEOUT_MS }).then(r => r.rows as Array<Record<string, unknown>>) : Promise.resolve([]),
        docTenTon(ma),
      ]);
      return { rows, tenTon };
    }, khoa);
    const ketQua: MuaHangVatTu = dungMuaHang(tho.rows, coGiaVon, tho.tenTon);
    res.json(ketQua);
  } catch (error) {
    console.error('Lỗi ban-vat-tu mua-hang:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
