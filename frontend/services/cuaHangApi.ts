// ============================================================================
// API TRANG KHÁCH "CỬA HÀNG VẬT TƯ" (công khai, KHÔNG đăng nhập) — /api/cong-khai/*
//   GET  /api/cong-khai/vat-tu      danh sách mã admin đã đăng (đang bán, còn tồn) — không có giá vốn / kho / NCC
//   GET  /api/cong-khai/anh/:id     ảnh đã bật "hiện cho khách" (dùng thẳng trong <img>)
//   POST /api/cong-khai/yeu-cau     gửi yêu cầu báo giá => { maYeuCau }
// File này KHÔNG import dataService / userService (bundle nặng của app nội bộ) và không tự gắn token. Dữ liệu máy chủ
// trả được đọc lại phòng thủ: chỉ giữ đúng các trường trang khách dùng, kiểu sai thì bỏ.
// ============================================================================

const API = '/api/cong-khai';

export type KhoaThuocTinhKhach = 'chungLoai' | 'quyCach' | 'mau' | 'maMau' | 'thuongHieu' | 'chatLieu' | 'xuatXu';
export const DS_THUOC_TINH_KHACH: KhoaThuocTinhKhach[] = ['chungLoai', 'quyCach', 'mau', 'maMau', 'thuongHieu', 'chatLieu', 'xuatXu'];
export const NHAN_THUOC_TINH_KHACH: Record<KhoaThuocTinhKhach, string> = {
  chungLoai: 'Chủng loại', quyCach: 'Quy cách', mau: 'Màu', maMau: 'Mã màu', thuongHieu: 'Thương hiệu', chatLieu: 'Chất liệu', xuatXu: 'Xuất xứ',
};

/** 1 mã vật tư đang chào bán (đã gộp các kho) */
export interface HangKhach {
  /** Mã SAP — mã tham chiếu cho khách */
  ma: string;
  ten: string;
  /** 1 trong 10 loại chính (tên theo DS_LOAI_CHINH) */
  loai: string;
  thuocTinh: Partial<Record<KhoaThuocTinhKhach, string>>;
  soLuong: number;
  dvt: string | null;
  /** Đồng / 1 đơn vị; null = "Liên hệ" */
  giaBanVnd: number | null;
  moTa: string | null;
  /** id ảnh công khai => /api/cong-khai/anh/:id */
  anh: number[];
  /** Link ảnh ngoài (http/https) */
  anhNgoai: string[];
  /** Bảng thông số đầy đủ (máy chủ đã lọc trường cấm). Máy chủ cũ chưa có => undefined, dùng thuocTinh */
  thuocTinhDayDu?: ThongSoKhach[];
  /** Nhóm vật tư (mô tả nhóm hàng) — máy chủ cũ chưa có => undefined */
  nhomVatTu?: string | null;
}

/**
 * Loại riêng của trang khách: vật liệu dán bề mặt (giấy dán tường, laminate, ván lạng). SAP để giấy dán tường trong
 * kho Vải (nhóm 'Vải') và laminate trong Tấm-Ván => khách tìm vải thấy sai loại. Gom lại 1 loại khi đọc danh sách.
 */
export const LOAI_DAN_BE_MAT = 'Vật liệu dán bề mặt';
const boDauThuong = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().trim();
/** Mã thuộc "Vật liệu dán bề mặt": nhóm SAP đã ghi vậy, hoặc giấy dán tường (theo tên / chủng loại) */
export const laVatLieuDanBeMat = (ten: string, nhomVatTu: string | null | undefined, chungLoai: string | undefined): boolean =>
  boDauThuong(nhomVatTu ?? '') === 'vat lieu dan be mat'
  || /^giay dan tuong/.test(boDauThuong(ten).replace(/_/g, ' ')) || /^giay dan tuong/.test(boDauThuong(chungLoai ?? ''));

/** 1 dòng thông số: nhãn / giá trị */
export interface ThongSoKhach { nhan: string; giaTri: string }

/** Nhãn thông số không bao giờ hiện cho khách (chặn thêm phía client, phòng máy chủ lọt) */
const NHAN_CAM = /(ncc|nh[aà] cung c[aấ]p|gi[aá] v[oố]n|gi[aá] mua|gi[aá] tr[iị] t[oồ]n|b[iì]nh qu[aâ]n|hex|c[oô]ng tr[iì]nh|ghi ch[uú] n[oộ]i b[oộ]|ng[aà]y nh[aậ]p|tu[oổ]i t[oồ]n|ng[uư][oờ]i (c[aậ]p nh[aậ]t|li[eê]n h[eệ])|file|đường dẫn)/i;

/** Đọc bảng thông số đầy đủ (phòng thủ): bỏ dòng thiếu nhãn / giá trị, nhãn cấm, trùng nhãn; tối đa 60 dòng */
export const docThongSo = (v: unknown): ThongSoKhach[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const kq: ThongSoKhach[] = [];
  const daCo = new Set<string>();
  for (const d of v) {
    if (!d || typeof d !== 'object') continue;
    const o = d as Record<string, unknown>;
    const nhan = chuoi(o.nhan);
    const giaTri = typeof o.giaTri === 'number' && Number.isFinite(o.giaTri) ? String(o.giaTri) : chuoi(o.giaTri);
    if (!nhan || !giaTri || nhan.length > 80 || giaTri.length > 500 || NHAN_CAM.test(nhan)) continue;
    const khoa = nhan.toLowerCase();
    if (daCo.has(khoa)) continue;
    daCo.add(khoa);
    kq.push({ nhan, giaTri });
    if (kq.length >= 60) break;
  }
  return kq;
};

export interface DanhSachKhach {
  capNhat: string | null;
  items: HangKhach[];
}

export class LoiCuaHang extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'LoiCuaHang';
  }
}

const chuoi = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const chuoiHoacNull = (v: unknown): string | null => chuoi(v) || null;
const soHuuHan = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Đọc 1 dòng máy chủ trả (phòng thủ; dòng không có mã => null) — export để test */
export const docHangKhach = (d: unknown): HangKhach | null => {
  if (!d || typeof d !== 'object') return null;
  const o = d as Record<string, unknown>;
  const ma = chuoi(o.ma);
  if (!ma) return null;
  const tt: HangKhach['thuocTinh'] = {};
  const nguonTt = o.thuocTinh && typeof o.thuocTinh === 'object' ? o.thuocTinh as Record<string, unknown> : {};
  for (const k of DS_THUOC_TINH_KHACH) {
    const v = chuoi(nguonTt[k]);
    if (v) tt[k] = v;
  }
  const gia = soHuuHan(o.giaBanVnd);
  const thongSo = docThongSo(o.thuocTinhDayDu);
  const kq: HangKhach = {
    ma,
    ten: chuoi(o.ten) || ma,
    loai: chuoi(o.loai) || 'Khác',
    thuocTinh: tt,
    soLuong: Math.max(0, soHuuHan(o.soLuong) ?? 0),
    dvt: chuoiHoacNull(o.dvt),
    giaBanVnd: gia !== null && gia > 0 ? gia : null,
    moTa: chuoiHoacNull(o.moTa),
    anh: (Array.isArray(o.anh) ? o.anh : [])
      .map(soHuuHan).filter((n): n is number => n !== null && Number.isInteger(n) && n > 0),
    anhNgoai: (Array.isArray(o.anhNgoai) ? o.anhNgoai : [])
      .map(chuoi).filter(u => /^https?:\/\/\S+$/i.test(u)),
  };
  // Trường mới chỉ gắn khi máy chủ có trả (máy chủ cũ => giữ đúng hình dạng cũ)
  if (thongSo) kq.thuocTinhDayDu = thongSo;
  if ('nhomVatTu' in o) kq.nhomVatTu = chuoiHoacNull(o.nhomVatTu);
  if (laVatLieuDanBeMat(kq.ten, kq.nhomVatTu, tt.chungLoai)) {
    kq.loai = LOAI_DAN_BE_MAT;
    // Giấy dán tường SAP ghi nhóm 'Vải' => nhóm theo đúng chủng loại
    if (boDauThuong(kq.nhomVatTu ?? '') === 'vai' || !kq.nhomVatTu) kq.nhomVatTu = 'Giấy dán tường';
  }
  return kq;
};

const LOI_MANG = 'Không kết nối được máy chủ, kiểm tra mạng rồi thử lại';

const laBiHuy = (e: unknown, signal?: AbortSignal | null): boolean =>
  signal?.aborted === true || (e as { name?: unknown } | null)?.name === 'AbortError';

const docLoi = async (r: Response): Promise<LoiCuaHang> => {
  if (r.status === 429) return new LoiCuaHang('Bạn đã gửi quá nhiều yêu cầu trong thời gian ngắn, vui lòng thử lại sau ít phút', 429);
  if (r.status >= 500) return new LoiCuaHang(`Máy chủ đang bận (${r.status}), vui lòng thử lại sau ít phút`, r.status);
  let thongBao = '';
  try {
    const j = await r.json();
    if (j && typeof j.error === 'string') thongBao = j.error;
    else if (j && typeof j.message === 'string') thongBao = j.message;
  } catch { /* không phải JSON */ }
  if (r.status === 404) return new LoiCuaHang('Trang vật tư đang được cập nhật, vui lòng thử lại sau ít phút', 404);
  if (r.status === 413) return new LoiCuaHang('Nội dung gửi quá dài, hãy rút gọn ghi chú', 413);
  return new LoiCuaHang(thongBao || `Không gửi được (${r.status}), vui lòng thử lại`, r.status);
};

const goi = async (url: string, init: RequestInit) => {
  let r: Response;
  try {
    r = await fetch(url, init);
  } catch (e) {
    if (laBiHuy(e, init.signal)) throw e;
    throw new LoiCuaHang(LOI_MANG, 0);
  }
  if (!r.ok) throw await docLoi(r);
  try {
    return await r.json();
  } catch (e) {
    if (laBiHuy(e, init.signal)) throw e;
    throw new LoiCuaHang('Máy chủ trả dữ liệu không đọc được, vui lòng thử lại', r.status);
  }
};

/** Danh sách mã đang chào bán */
export async function layDanhSachKhach(signal?: AbortSignal): Promise<DanhSachKhach> {
  const j = await goi(`${API}/vat-tu`, { signal, credentials: 'omit' });
  const items = (Array.isArray(j?.items) ? j.items : []).map(docHangKhach).filter((d: HangKhach | null): d is HangKhach => d !== null);
  const capNhat = typeof j?.capNhat === 'string' && /^\d{4}-\d{2}-\d{2}/.test(j.capNhat) ? j.capNhat.slice(0, 10) : null;
  return { capNhat, items };
}

/** Đường dẫn ảnh công khai (dùng thẳng trong <img>) */
export const urlAnhKhach = (id: number): string => `${API}/anh/${id}`;

export interface BodyYeuCau {
  items: Array<{ ma: string; soLuong: number }>;
  ten: string;
  sdt: string;
  email?: string;
  congTy?: string;
  ghiChu?: string;
  /** Ô bẫy (ẩn) — người thật để trống */
  web: string;
}

/** Gửi yêu cầu báo giá => mã yêu cầu */
export async function guiYeuCau(body: BodyYeuCau): Promise<string> {
  const j = await goi(`${API}/yeu-cau`, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const ma = typeof j?.maYeuCau === 'string' ? j.maYeuCau : '';
  return ma;
}
