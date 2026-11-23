import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { app } from '../server/app.js';
import { createCache, cachedByVersions } from '../server/cache.js';
import { userHasPermission, MATERIAL_PRICE_PERMISSION } from '../server/permissions.js';

// ============================================================================
// DANH MỤC VẬT TƯ — tra cứu TẤT CẢ hàng đang tồn trong kho vật tư (công cụ quản trị nội bộ, kể cả hàng gán công trình,
// mã đầu 800 giá 0, CCDC đầu 400; hàng gán công trình chỉ gắn nhãn ở giao diện)
//   GET /api/ban-vat-tu/danh-sach      từng dòng tồn (mã + kho) kèm thuộc tính master, ảnh nội bộ, link ảnh đã dán trước
//   GET /api/ban-vat-tu/:ma/mua-hang   lý lịch mua (PR/PO trong bảng vat_tu) của 1 mã — NCC / giá chỉ khi có quyền giá
//   GET /api/ban-vat-tu/anh/:id        bytes 1 ảnh nội bộ (ban_vt_anh — ảnh mẫu sheet 03_MATERIALS, nạp bằng nap_anh_vat_tu.py)
//   PUT /api/ban-vat-tu/anh/:id        duyệt / ẩn ảnh nội bộ { trangThai: 'da_duyet' | 'an' | 'tu_dong' }
// (Đường dẫn giữ chữ "ban-vat-tu" để không vỡ quyền đã cấp / bookmark; tính năng bán + trang khách đã bỏ 21/11/2026.)
//
// Bổ sung 15/11 (backend/sql/2026-11-15_ban_vat_tu_bo_sung.sql): ban_vt_master.suy_tu_ten (thuộc tính tách từ tên, chỉ
// trường master đang trống) + bảng ban_vt_anh. Chưa chạy SQL (42P01 / 42703) => danh sách vẫn trả như cũ (suyTuTen {},
// anh []), không 500.
//
// - Bảng (backend/sql/2026-11-14_ban_vat_tu_ton.sql, nạp bằng backend/scripts/nap_ban_vat_tu.py):
//     ban_vt_ton        ảnh chụp tồn kho (mỗi lần nạp xoá hết rồi ghi lại), nhiều dòng / mã (khác kho)
//     ban_vt_master     thuộc tính vật tư (ZMM60 + DEMO), PK ma_vat_tu
//     ban_vt_thong_tin  CHỈ ĐỌC cột anh_urls (link ảnh người dùng đã dán trước đây); các cột khác không dùng nữa
// - Ghép theo MÃ SAP dạng chuỗi, giữ nguyên (không zfill, không HEX).
// - gia_tri là TRIỆU ĐỒNG; gia_binh_quan trong DB là đồng / price_unit đơn vị như file SAP (price_unit có thể = 1000,
//   vd gỗ CD3) => API trả master.giaBinhQuan đã chia price_unit (đồng / 1 đvt).
// - Ngày trả chuỗi 'YYYY-MM-DD' bằng to_char (Date của JS lúc nửa đêm giờ +7 qua toISOString() lùi 1 ngày).
// - Quyền: xem 'ban_vat_tu', duyệt / ẩn ảnh 'ban_vat_tu_sua' (ADMIN có mọi quyền — quyền là chuỗi trong
//   users.permissions, không có danh sách đăng ký ở máy chủ). Giá vốn (giaTri, donGiaVon, master.giaBinhQuan) chỉ trả
//   cho người có quyền xem giá vật tư (MATERIAL_PRICE_PERMISSION), bỏ ở máy chủ chứ không gửi xuống. Quyền đó che cả
//   nhà cung cấp (MATERIAL_PRICE_COLUMNS có nha_cung_cap) => thuộc tính MP37 NHÀ CUNG CẤP / MP18 MÃ SẢN PHẨM NCC cũng
//   bỏ khi không có quyền.
// - Cache theo phiên bản RIÊNG table_versions 'ban_vt' (CHỈ loader bump => nhật ký cập nhật dữ liệu phản ánh đúng lần nạp
//   tồn kho) ghép mốc duyệt ảnh. Không thêm vào TABLE_TO_VERSION_KEY của server/data.ts (map đó cho phép tải nguyên
//   bảng qua /api/all-data).
// - Chưa chạy SQL tạo bảng (lỗi 42P01) => GET trả danh sách rỗng + canhBao, không 500.
// ============================================================================

const TEN_PHIEN_BAN = 'ban_vt';
export const QUYEN_XEM = 'ban_vat_tu';
export const QUYEN_SUA = 'ban_vat_tu_sua';
const LOI_QUYEN_XEM = { error: 'Bạn chưa có quyền xem Danh mục vật tư' };
const LOI_QUYEN_SUA = { error: 'Bạn chưa có quyền duyệt / ẩn ảnh vật tư' };
export const CANH_BAO_THIEU_BANG = 'Chưa tạo bảng — chạy backend/sql/2026-11-14_ban_vat_tu_ton.sql';
// ~5.100 dòng nối 3 bảng: nhẹ, nhưng để rộng hơn trần mặc định phòng lúc DB bận
const TIMEOUT_MS = 15000;

export const MA_TOI_DA_KY_TU = 100;

// ---------------------------------------------------------------------------
// KIỂU DỮ LIỆU (đúng hợp đồng với frontend/services/banVatTuApi.ts)
// ---------------------------------------------------------------------------
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
  /** link ảnh người dùng đã dán trước đây (ban_vt_thong_tin.anh_urls) — chỉ đọc */
  anhLink: string[];
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

/** Mã vật tư trên URL: chuỗi khác rỗng (sau khi bỏ khoảng trắng 2 đầu), ≤ MA_TOI_DA_KY_TU ký tự. Giữ nguyên chuỗi
 *  (không zfill: mã 11 số là mã thật). Sai => null. */
export const docMaVatTu = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const ma = v.trim();
  return ma && ma.length <= MA_TOI_DA_KY_TU ? ma : null;
};

/** Mảng link ảnh (text[]) từ DB => chỉ giữ chuỗi khác rỗng. */
export const docAnhLink = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : [];

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

/** Kiểm tra thân PUT /api/ban-vat-tu/anh/:id: { trangThai: 'da_duyet' | 'an' | 'tu_dong' }. */
export const kiemTraThanPutAnh = (body: unknown): { hopLe: true; trangThai: TrangThaiAnh } | { hopLe: false; loi: string } => {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { hopLe: false, loi: 'Dữ liệu gửi lên không hợp lệ' };
  const b = body as Record<string, unknown>;
  if (!laTrangThaiAnh(b.trangThai)) return { hopLe: false, loi: 'Trạng thái ảnh phải là da_duyet, an hoặc tu_dong' };
  return { hopLe: true, trangThai: b.trangThai };
};

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
    anhLink: docAnhLink(row.anh_link),
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
// + mốc duyệt ảnh (phienBanAnh — PUT ảnh không bump table_versions để nhật ký cập nhật dữ liệu không báo "đã cập nhật"
// khi chỉ duyệt ảnh). Giữ 3 giây + dùng chung 1 truy vấn cho các lần gọi đồng thời (như routes/tonKhoVt.ts).
// theHe: PUT tăng => truy vấn bắt đầu trước PUT không được nhớ lại khoá cũ vào phienBanNho.
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
      `SELECT to_char(MAX(last_updated) AT TIME ZONE 'UTC', ${DINH_DANG_GIO}) AS tv
       FROM table_versions WHERE table_name = $1`,
      [TEN_PHIEN_BAN]);
    const tv = r.rows[0]?.tv as string | null | undefined;
    if (tv) return `tv:${tv}`;
    const r2 = await timedQuery(
      `SELECT to_char(MAX(updated_at) AT TIME ZONE 'UTC', ${DINH_DANG_GIO}) AS v FROM ban_vt_ton`);
    return `ua:${r2.rows[0]?.v ?? 'rong'}`;
  } catch (e) {
    if (!laThieuBang(e)) throw e;
    return 'thieu-bang';
  }
};

const tinhPhienBan = async (): Promise<string> => {
  const [chinh, anh] = await Promise.all([tinhPhienBanChinh(), phienBanAnh()]);
  return `${chinh}|anh:${anh}`;
};

/** Sau khi duyệt / ẩn ảnh: instance này thấy phiên bản mới ngay (instance khác chậm tối đa PHIEN_BAN_TTL_MS); truy
 *  vấn phiên bản đang chạy dở (bắt đầu trước khi ghi) không được nhớ lại khoá cũ. */
const boPhienBanNho = () => {
  theHe++;
  phienBanNho = null;
  phienBanDangDoc = null;
};

/** Khoá phiên bản dữ liệu Danh mục vật tư (danh sách + lý lịch mua). */
const docPhienBan = async (): Promise<string> => {
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

const SQL_DANH_SACH = `
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
         b.anh_urls AS anh_link
  FROM ban_vt_ton t
  LEFT JOIN ban_vt_master m ON m.ma_vat_tu = t.ma_vat_tu
  -- chỉ đọc link ảnh đã dán trước (bảng thông tin cũ, không còn ghi)
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

/** Ảnh nội bộ theo mã (bỏ ảnh đã ẩn); chưa có bảng => không ảnh. */
const docAnhTheoMa = async (): Promise<Map<string, AnhVatTu[]>> => gomAnhTheoMa(await docBoSung(`
  SELECT a.id, a.ma_vat_tu, a.chac_chan, a.trang_thai, a.cong_trinh, a.code_vat_lieu,
         to_char(a.created_at AT TIME ZONE 'UTC', ${DINH_DANG_GIO}) AS tao_luc
  FROM ban_vt_anh a
  WHERE a.trang_thai <> 'an' AND a.ma_vat_tu IN (SELECT ma_vat_tu FROM ban_vt_ton)`));

/** Truy vấn danh sách. Lỗi (kể cả 42P01 thiếu bảng) ném ra. */
const docDongDanhSach = async (): Promise<Array<Record<string, unknown>>> =>
  (await timedQuery(SQL_DANH_SACH, [], { timeoutMs: TIMEOUT_MS, workMemMb: 16 })).rows;

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
// GET /api/ban-vat-tu/anh/:id — bytes 1 ảnh nội bộ (giao diện fetch có token -> blob -> objectURL, như ảnh vướng mắc).
// Đăng ký TRƯỚC '/:ma/mua-hang' (không trùng mẫu vì khác đoạn cuối, nhưng để rõ thứ tự). Ảnh đã ẩn chỉ người có quyền
// duyệt ảnh xem được (để bỏ ẩn).
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
// PUT /api/ban-vat-tu/anh/:id { trangThai } — duyệt / ẩn / trả về tự động. Ghi duyet_boi / duyet_luc: khoá cache danh
// sách đổi qua MAX(duyet_luc) (phienBanAnh) — không bump table_versions 'ban_vt' (dòng đó chỉ phản ánh lần nạp).
// ---------------------------------------------------------------------------
const SQL_PUT_ANH = `
  UPDATE ban_vt_anh SET trang_thai = $2::text, duyet_boi = $3, duyet_luc = now()
  WHERE id = $1
  RETURNING id, ma_vat_tu, chac_chan, trang_thai, cong_trinh, code_vat_lieu`;

app.put('/api/ban-vat-tu/anh/:id', async (req: Request, res: Response) => {
  try {
    if (!(await userHasPermission(req, QUYEN_SUA))) return res.status(403).json(LOI_QUYEN_SUA);
    const id = docIdAnh(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Mã ảnh không hợp lệ' });
    const kt = kiemTraThanPutAnh(req.body);
    if (!kt.hopLe) return res.status(400).json({ error: kt.loi });
    let dong: Record<string, unknown> | undefined;
    try {
      dong = (await timedQuery(SQL_PUT_ANH, [id, kt.trangThai, req.user?.username ?? null])).rows[0] as
        Record<string, unknown> | undefined;
    } catch (e) {
      if (laThieuBangHoacCot(e)) return res.status(503).json({ error: 'Chưa tạo bảng ảnh — chạy backend/sql/2026-11-15_ban_vat_tu_bo_sung.sql' });
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
      },
    });
  } catch (error) {
    console.error('Lỗi ban-vat-tu PUT ảnh:', error);
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
