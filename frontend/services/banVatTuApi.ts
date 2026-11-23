import { API_BASE_URL } from './dataService';

// ============================================================================
// API DANH MỤC VẬT TƯ — tra cứu tồn kho vật tư nội bộ (bảng ban_vt_ton + ban_vt_master + ban_vt_anh; đọc thêm link
// ảnh đã dán trước đây ở ban_vt_thong_tin). Đường dẫn API giữ chữ "ban-vat-tu" cho khớp quyền đã cấp.
// Cần đăng nhập (token tự gắn qua authFetch) + quyền 'ban_vat_tu'; duyệt / ẩn ảnh cần 'ban_vat_tu_sua'.
// Giá vốn (giaTri triệu đồng, donGiaVon đồng/đvt, giaBinhQuan) chỉ có khi người xem có quyền xem giá vật tư —
// không có thì máy chủ trả null (coGiaVon = false).
// Ngày luôn là chuỗi 'YYYY-MM-DD' (máy chủ đổi bằng SQL) => giao diện đọc thẳng chuỗi, KHÔNG new Date(chuỗi).
// ============================================================================

/** Thuộc tính vật tư từ MASTER DATA (ZMM60) / DEMO — null khi mã chưa có trong master */
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
  /** Mọi thuộc tính MPxx khác rỗng: { "MP01 tên cột": "giá trị" } */
  thuocTinh: Record<string, string>;
  /** Đồng / 1 đơn vị tính (máy chủ đã chia gia_binh_quan cho price_unit); null khi không có quyền xem giá */
  giaBinhQuan: number | null;
  /**
   * Thuộc tính SUY TỪ TÊN vật tư (script nạp tách ra) — chỉ có cho trường master đang trống, không đè ZMM60 / MD.
   * Giao diện dùng khi trường master trống, luôn ghi rõ "suy từ tên".
   */
  suyTuTen: ThuocTinhSuy;
  /** Thương hiệu suy từ NCC chính hãng của PR gần nhất (HAFELE, BLUM…); null khi NCC không thuộc danh sách hãng */
  thuongHieuNcc: string | null;
  /** Nguồn dòng master: 'MASTER' | 'DEMO_ZMM60' | 'DEMO_MP' | 'SUY_TEN' ('SUY_TEN' = mã CHƯA có trong MASTER DATA, dòng chỉ
   *  mang thuộc tính suy từ tên); null khi máy chủ cũ chưa trả */
  nguon: string | null;
}

/** Khoá thuộc tính suy từ tên (camelCase như máy chủ trả) */
export type KhoaSuy = 'chungLoai' | 'quyCach' | 'mau' | 'maMau' | 'thuongHieu' | 'chatLieu';
export const DS_KHOA_SUY: KhoaSuy[] = ['chungLoai', 'quyCach', 'mau', 'maMau', 'thuongHieu', 'chatLieu'];
export type ThuocTinhSuy = Partial<Record<KhoaSuy, string>>;

/** Trạng thái ảnh nội bộ: tu_dong = máy tự ghép từ sheet 03; da_duyet = người đã xác nhận đúng ảnh ('an' máy chủ không trả) */
export type TrangThaiAnh = 'tu_dong' | 'da_duyet' | 'an';

/** Ảnh nội bộ (ảnh mẫu duyệt ở sheet 03_MATERIALS của file PRODUCTION STATUS công trình) — tải bằng muonAnhNoiBo(id) */
export interface AnhNoiBo {
  id: number;
  /** true = dòng 03 chỉ có 1 mã SAP (chắc đúng); false = dòng nhiều mã => cần người duyệt */
  chacChan: boolean;
  trangThai: 'tu_dong' | 'da_duyet';
  congTrinh: string | null;
  codeVatLieu: string | null;
}

/** 1 dòng tồn (1 mã có thể nhiều dòng — khác kho; khoá hiển thị = ma + kho) */
export interface ItemBanVatTu {
  ma: string;
  ten: string;
  dvt: string | null;
  soLuong: number;
  kho: string | null;
  ngayNhap: string | null;
  chamLuanChuyen: boolean;
  tenCongTrinh: string | null;
  maCongTrinh: string | null;
  /** Triệu đồng; null khi không có quyền xem giá */
  giaTri: number | null;
  /** Đồng / đơn vị tính; null khi không có quyền hoặc số lượng ≤ 0 */
  donGiaVon: number | null;
  master: MasterVatTu | null;
  /** Link ảnh người dùng đã dán trước đây (chỉ đọc, không còn sửa trên web) */
  anhLink: string[];
  /** Ảnh nội bộ (sheet 03), đã bỏ ảnh bị ẩn; thứ tự máy chủ: đã duyệt, chắc chắn, mới nhất */
  anh: AnhNoiBo[];
}

export interface DanhSachBanVatTu {
  ngayChot: string | null;
  nguonFile: string | null;
  coGiaVon: boolean;
  coQuyenSua: boolean;
  /** Máy chủ báo chưa tạo bảng / thiếu dữ liệu — hiện nguyên câu cho người dùng */
  canhBao: string | null;
  items: ItemBanVatTu[];
}

/** Lỗi gọi API Danh mục vật tư; chuaCoQuyen = true khi máy chủ trả 403 */
export class LoiBanVatTu extends Error {
  readonly maLoi: number;
  readonly chuaCoQuyen: boolean;
  constructor(thongBao: string, maLoi: number) {
    super(thongBao);
    this.name = 'LoiBanVatTu';
    this.maLoi = maLoi;
    this.chuaCoQuyen = maLoi === 403;
  }
}

export const laLoiChuaCoQuyenBan = (e: unknown): boolean => e instanceof LoiBanVatTu && e.chuaCoQuyen;

// ---- chuẩn hoá dữ liệu nhận về (cột numeric của Postgres có thể về dạng chuỗi) ----
const so = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const soHoacNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const chuoiHoacNull = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
/** Lấy phần 'YYYY-MM-DD' (phòng máy chủ trả kèm giờ); sai dạng => null */
const ngayHoacNull = (v: unknown): string | null => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v ?? ''));
  return m ? m[1] : null;
};
const laKhoaSuy = (k: string): k is KhoaSuy => (DS_KHOA_SUY as string[]).includes(k);
const docSuyTuTen = (v: unknown): ThuocTinhSuy => {
  const kq: ThuocTinhSuy = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return kq;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const s = chuoiHoacNull(x);
    if (s !== null && laKhoaSuy(k)) kq[k] = s;
  }
  return kq;
};

/** Danh sách ảnh nội bộ: bỏ phần tử hỏng / ảnh đã ẩn / id trùng (chịu được máy chủ cũ chưa có trường anh) */
export const docDsAnh = (v: unknown): AnhNoiBo[] => {
  if (!Array.isArray(v)) return [];
  const daCo = new Set<number>();
  const kq: AnhNoiBo[] = [];
  for (const x of v) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const id = Number(o.id);
    if (!Number.isInteger(id) || id <= 0 || daCo.has(id) || o.trangThai === 'an') continue;
    daCo.add(id);
    kq.push({
      id,
      chacChan: o.chacChan === true,
      trangThai: o.trangThai === 'da_duyet' ? 'da_duyet' : 'tu_dong',
      congTrinh: chuoiHoacNull(o.congTrinh),
      codeVatLieu: chuoiHoacNull(o.codeVatLieu),
    });
  }
  return kq;
};

/** Link ảnh đã dán (mảng chuỗi): bỏ phần tử rỗng / trùng */
export const docAnhLink = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.map(u => String(u ?? '').trim()).filter(u => u !== ''))] : [];

const docMaster = (m: unknown, coGiaVon: boolean): MasterVatTu | null => {
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  const thuocTinh: Record<string, string> = {};
  if (o.thuocTinh && typeof o.thuocTinh === 'object') {
    for (const [k, v] of Object.entries(o.thuocTinh as Record<string, unknown>)) {
      const s = chuoiHoacNull(v);
      if (s !== null) thuocTinh[k] = s;
    }
  }
  return {
    ten: chuoiHoacNull(o.ten), nhomSap: chuoiHoacNull(o.nhomSap), tenNhomSap: chuoiHoacNull(o.tenNhomSap),
    loai: chuoiHoacNull(o.loai), chungLoai: chuoiHoacNull(o.chungLoai), chatLieu: chuoiHoacNull(o.chatLieu),
    quyCach: chuoiHoacNull(o.quyCach), mau: chuoiHoacNull(o.mau), thuongHieu: chuoiHoacNull(o.thuongHieu),
    xuatXu: chuoiHoacNull(o.xuatXu), thuocTinh, giaBinhQuan: coGiaVon ? soHoacNull(o.giaBinhQuan) : null,
    suyTuTen: docSuyTuTen(o.suyTuTen), thuongHieuNcc: chuoiHoacNull(o.thuongHieuNcc),
    nguon: chuoiHoacNull(o.nguon),
  };
};

/** Đọc 1 dòng máy chủ trả về (export để test) */
export const docItem = (d: Record<string, unknown>, coGiaVon: boolean): ItemBanVatTu => ({
  // Mã SAP giữ nguyên chuỗi (KHÔNG bỏ / thêm số 0 — mã 11 số là mã thật)
  ma: String(d.ma ?? '').trim(),
  ten: String(d.ten ?? '').trim(),
  dvt: chuoiHoacNull(d.dvt),
  soLuong: so(d.soLuong),
  kho: chuoiHoacNull(d.kho),
  ngayNhap: ngayHoacNull(d.ngayNhap),
  chamLuanChuyen: d.chamLuanChuyen === true,
  tenCongTrinh: chuoiHoacNull(d.tenCongTrinh),
  maCongTrinh: chuoiHoacNull(d.maCongTrinh),
  giaTri: coGiaVon ? soHoacNull(d.giaTri) : null,
  donGiaVon: coGiaVon ? soHoacNull(d.donGiaVon) : null,
  master: docMaster(d.master, coGiaVon),
  anhLink: docAnhLink(d.anhLink),
  anh: docDsAnh(d.anh),
});

// Câu báo lỗi luôn tiếng Việt: lỗi 5xx máy chủ / lỗi mạng của trình duyệt không lấy chữ gốc
const LOI_MANG = 'Không kết nối được máy chủ, kiểm tra mạng rồi thử lại';
const loiMayChu = (ma: number) => `Máy chủ đang bận hoặc gặp lỗi (${ma}), hãy thử lại sau ít phút`;

const docLoi = async (r: Response, viecLam: string): Promise<LoiBanVatTu> => {
  if (r.status >= 500) return new LoiBanVatTu(loiMayChu(r.status), r.status);
  let thongBao = '';
  try {
    const j = await r.json();
    if (j && typeof j.error === 'string') thongBao = j.error;
    else if (j && typeof j.message === 'string') thongBao = j.message;
  } catch { /* thân trả về không phải JSON */ }
  if (r.status === 403) return new LoiBanVatTu(thongBao || `Bạn chưa có quyền ${viecLam}`, 403);
  if (r.status === 401) return new LoiBanVatTu(thongBao || 'Phiên đăng nhập đã hết hạn, hãy đăng nhập lại', 401);
  if (r.status === 404) return new LoiBanVatTu(thongBao || 'Mã vật tư không còn trong tồn kho', 404);
  return new LoiBanVatTu(thongBao || `Máy chủ báo lỗi (${r.status})`, r.status);
};

const laBiHuy = (e: unknown, signal?: AbortSignal): boolean =>
  signal?.aborted === true || (e as { name?: unknown } | null)?.name === 'AbortError';

const goiJson = async (url: string, init: RequestInit, viecLam: string) => {
  let r: Response;
  try {
    r = await fetch(url, init);
  } catch (e) {
    if (laBiHuy(e, init.signal ?? undefined)) throw e;
    throw new LoiBanVatTu(LOI_MANG, 0);
  }
  if (!r.ok) throw await docLoi(r, viecLam);
  try {
    return await r.json();
  } catch (e) {
    if (laBiHuy(e, init.signal ?? undefined)) throw e;
    throw new LoiBanVatTu('Máy chủ trả số liệu không đọc được, hãy thử lại', r.status);
  }
};

/** Toàn bộ dòng tồn kho vật tư (≈5.100 dòng) + quyền của người xem */
export async function layDanhSachBanVatTu(signal?: AbortSignal): Promise<DanhSachBanVatTu> {
  const j = await goiJson(`${API_BASE_URL}/ban-vat-tu/danh-sach`, { signal }, 'xem Danh mục vật tư');
  const coGiaVon = j?.coGiaVon === true;
  return {
    ngayChot: ngayHoacNull(j?.ngayChot),
    nguonFile: chuoiHoacNull(j?.nguonFile),
    coGiaVon,
    coQuyenSua: j?.coQuyenSua === true,
    canhBao: chuoiHoacNull(j?.canhBao),
    items: (Array.isArray(j?.items) ? j.items : [])
      .map((d: Record<string, unknown>) => docItem(d, coGiaVon))
      .filter((d: ItemBanVatTu) => d.ma !== ''),
  };
}

// ============================================================================
// LÝ LỊCH MUA (GET /api/ban-vat-tu/:ma/mua-hang) — gọi khi mở cửa sổ chi tiết, không tải trước cho cả danh sách.
// NCC + giá mua là dữ liệu nhạy cảm: máy chủ chỉ trả khi có quyền xem giá vật tư (không có => null).
// ============================================================================
export interface LanMua {
  ngayPr: string | null;
  soPr: string | null;
  congTrinh: string | null;
  soLuong: number | null;
  dvt: string | null;
  /** Đồng / đvt; null khi không có quyền giá hoặc dòng PR không có giá */
  donGia: number | null;
  ncc: string | null;
}
export interface LyLichMua {
  soDongPr: number;
  ngayPrCuoi: string | null;
  /** Mã công trình đã mua (mới nhất trước, tối đa 10) */
  congTrinh: string[];
  codeVatLieu: string[];
  nhomVt: string | null;
  /** Tên trên PR khi khác tên tồn */
  tenPr: string | null;
  /** null = người xem không có quyền giá (máy chủ không trả) */
  nhaCungCap: string[] | null;
  donGiaGanNhat: { gia: number; dvt: string | null; ngay: string | null } | null;
  lanMua: LanMua[];
}

const dsChuoi = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.map(chuoiHoacNull).filter((x): x is string => x !== null))] : [];

/** Đọc kết quả lý lịch mua (export để test) */
export const docLyLichMua = (j: unknown): LyLichMua => {
  const o = (j && typeof j === 'object' ? j : {}) as Record<string, unknown>;
  const dg = o.donGiaGanNhat && typeof o.donGiaGanNhat === 'object' ? o.donGiaGanNhat as Record<string, unknown> : null;
  const gia = dg ? soHoacNull(dg.gia) : null;
  return {
    soDongPr: Math.max(0, Math.round(so(o.soDongPr))),
    ngayPrCuoi: ngayHoacNull(o.ngayPrCuoi),
    congTrinh: dsChuoi(o.congTrinh),
    codeVatLieu: dsChuoi(o.codeVatLieu),
    nhomVt: chuoiHoacNull(o.nhomVt),
    tenPr: chuoiHoacNull(o.tenPr),
    nhaCungCap: Array.isArray(o.nhaCungCap) ? dsChuoi(o.nhaCungCap) : null,
    donGiaGanNhat: dg && gia !== null ? { gia, dvt: chuoiHoacNull(dg.dvt), ngay: ngayHoacNull(dg.ngay) } : null,
    lanMua: (Array.isArray(o.lanMua) ? o.lanMua : [])
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .map(l => ({
        ngayPr: ngayHoacNull(l.ngayPr), soPr: chuoiHoacNull(l.soPr), congTrinh: chuoiHoacNull(l.congTrinh),
        soLuong: soHoacNull(l.soLuong), dvt: chuoiHoacNull(l.dvt), donGia: soHoacNull(l.donGia), ncc: chuoiHoacNull(l.ncc),
      })),
  };
};

export async function layLyLichMua(ma: string, signal?: AbortSignal): Promise<LyLichMua> {
  const j = await goiJson(`${API_BASE_URL}/ban-vat-tu/${encodeURIComponent(ma)}/mua-hang`, { signal }, 'xem lý lịch mua vật tư');
  return docLyLichMua(j);
}

// ============================================================================
// ẢNH NỘI BỘ (GET /api/ban-vat-tu/anh/:id cần token => không gắn thẳng URL vào <img>): fetch -> blob -> objectURL.
// - Đếm số chỗ đang dùng mỗi ảnh; thôi dùng thì giữ lại trong hàng chờ nhỏ (cuộn qua lại không tải lại), vượt
//   GIU_TOI_DA ảnh không ai dùng thì thu hồi objectURL cũ nhất để không giữ blob trong RAM mãi.
// - Tối đa TAI_SONG_SONG lượt tải cùng lúc của riêng trang này. authFetch đã giới hạn 4 request /api/* cả app; để
//   3 cho ảnh => luôn còn chỗ cho request khác (duyệt ảnh, lý lịch mua) không phải đợi cả loạt ảnh.
// ============================================================================
const TAI_SONG_SONG = 3;
const GIU_TOI_DA = 150;

interface MucAnh { hua: Promise<string>; url: string | null; dung: number; huy: AbortController }
const boNhoAnh = new Map<number, MucAnh>();
/** Ảnh tải xong mà không còn chỗ nào dùng (thứ tự thêm = cũ trước) */
const khongDung = new Set<number>();

const loiHuy = () => new DOMException('Đã huỷ', 'AbortError');

let dangTaiAnh = 0;
const hangCho: Array<() => void> = [];
const xinLuot = (signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) { reject(loiHuy()); return; }
  if (dangTaiAnh < TAI_SONG_SONG) { dangTaiAnh++; resolve(); return; }
  const bo = () => {
    const i = hangCho.indexOf(chay);
    if (i >= 0) hangCho.splice(i, 1);
    reject(loiHuy());
  };
  const chay = () => { signal.removeEventListener('abort', bo); dangTaiAnh++; resolve(); };
  hangCho.push(chay);
  signal.addEventListener('abort', bo, { once: true });
});
const traLuot = () => {
  dangTaiAnh--;
  const tiep = hangCho.shift();
  if (tiep) tiep();
};

const xoaMucAnh = (id: number) => {
  const m = boNhoAnh.get(id);
  if (!m) return;
  boNhoAnh.delete(id);
  khongDung.delete(id);
  m.huy.abort();
  if (m.url) URL.revokeObjectURL(m.url);
};

const donBot = () => {
  for (const cu of khongDung) {
    if (khongDung.size <= GIU_TOI_DA) break;
    xoaMucAnh(cu);
  }
};

const taiAnh = async (id: number, muc: MucAnh): Promise<string> => {
  await xinLuot(muc.huy.signal);
  try {
    let r: Response;
    try {
      r = await fetch(`${API_BASE_URL}/ban-vat-tu/anh/${id}`, { signal: muc.huy.signal });
    } catch (e) {
      if (laBiHuy(e, muc.huy.signal)) throw e;
      throw new LoiBanVatTu(LOI_MANG, 0);
    }
    if (!r.ok) throw await docLoi(r, 'xem ảnh vật tư');
    const blob = await r.blob();
    // Đã bị thu hồi trong lúc tải => không tạo objectURL mồ côi
    if (boNhoAnh.get(id) !== muc) throw loiHuy();
    muc.url = URL.createObjectURL(blob);
    if (muc.dung <= 0) { khongDung.add(id); donBot(); }
    return muc.url;
  } finally {
    traLuot();
  }
};

/**
 * Mượn objectURL của 1 ảnh nội bộ. Gọi `tra()` khi thôi hiện (component bỏ đi) — bắt buộc, để còn thu hồi.
 * Lỗi tải (403/404/mạng) => promise bị từ chối, lần mượn sau thử tải lại.
 */
export function muonAnhNoiBo(id: number): { hua: Promise<string>; tra: () => void } {
  let muc = boNhoAnh.get(id);
  if (!muc) {
    const moi: MucAnh = { hua: Promise.resolve(''), url: null, dung: 0, huy: new AbortController() };
    boNhoAnh.set(id, moi);
    moi.hua = taiAnh(id, moi);
    // Lỗi => bỏ khỏi bộ nhớ để lần sau tải lại
    moi.hua.catch(() => { if (boNhoAnh.get(id) === moi) { boNhoAnh.delete(id); khongDung.delete(id); } });
    muc = moi;
  }
  const m = muc;
  m.dung++;
  khongDung.delete(id);
  let daTra = false;
  return {
    hua: m.hua,
    tra: () => {
      if (daTra) return;
      daTra = true;
      m.dung--;
      if (m.dung > 0 || boNhoAnh.get(id) !== m) return;
      if (m.url) { khongDung.add(id); donBot(); }
      // Chưa tải xong mà không ai cần nữa (cuộn nhanh qua) => huỷ lượt tải, nhường chỗ cho ảnh đang hiện
      else xoaMucAnh(id);
    },
  };
}

/** Đổi trạng thái 1 ảnh nội bộ (quyền 'ban_vat_tu_sua'): da_duyet = đúng ảnh, an = ẩn, tu_dong = bỏ duyệt */
export async function doiTrangThaiAnh(id: number, trangThai: TrangThaiAnh): Promise<TrangThaiAnh> {
  const j = await goiJson(`${API_BASE_URL}/ban-vat-tu/anh/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trangThai }),
  }, 'duyệt ảnh vật tư');
  // Máy chủ có thể trả { anh: { trangThai } } / { trangThai } / { ok: true } — không rõ thì coi như đã đổi đúng ý
  const tt = j?.anh?.trangThai ?? j?.trangThai;
  return tt === 'da_duyet' || tt === 'an' || tt === 'tu_dong' ? tt : trangThai;
}
