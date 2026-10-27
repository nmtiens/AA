import { API_BASE_URL } from './dataService';

// ============================================================================
// API TỒN KHO VẬT TƯ (bảng ton_kho_vt — ảnh chụp tồn kho chốt hằng tuần, thứ Năm)
// Cần đăng nhập (token tự gắn qua authFetch) + quyền 'chart_stock_vt'; thiếu quyền => 403.
// Tiền trong DB là TRIỆU ĐỒNG (dù cột dvtt ghi 'VND'); ngày luôn là chuỗi 'YYYY-MM-DD' (máy chủ đổi bằng SQL,
// không qua Date của JS) => giao diện đọc thẳng chuỗi, KHÔNG new Date(chuỗi).
// ============================================================================

/** 1 điểm (ngày chốt, nhóm vật tư) — số gộp của nhóm tại lần chốt đó */
export interface DiemTonKhoVt {
  ngay: string;
  /** Tên nhóm đã chuẩn hoá (bỏ dấu cách thừa; trống => 'Chưa phân nhóm') */
  nhom: string;
  /** Tổng giá trị tồn (triệu đồng) */
  giaTri: number;
  /** Phần giá trị của mã chậm luân chuyển > 3 tháng (triệu đồng) */
  giaTriCham: number;
  /** Số mã vật tư khác nhau */
  soMa: number;
  /** Số mã chậm luân chuyển > 3 tháng */
  soMaCham: number;
}

export interface TongHopTonKhoVt {
  /** table_versions.last_updated của 'ton_kho_vt' (ISO) */
  capNhat: string | null;
  /** Mọi ngày chốt 'YYYY-MM-DD', tăng dần */
  ngay: string[];
  /** Tên nhóm, xếp theo giá trị ở ngày chốt mới nhất giảm dần */
  nhom: string[];
  diem: DiemTonKhoVt[];
}

/** 1 mã vật tư trong cửa sổ chi tiết: số tại lần chốt đang xem và lần chốt đem ra so (ngayTruoc) */
export interface DongTonKhoVt {
  ma: string;
  ten: string | null;
  nhom: string;
  dvt: string | null;
  /** Tại 'ngay' (null = mã có ở lần trước nhưng đã HẾT ở lần này) */
  soLuong: number | null;
  /** Tại 'ngayTruoc' (null = mã MỚI xuất hiện) */
  soLuongTruoc: number | null;
  /** Triệu đồng; null hết khi người xem không có quyền xem giá */
  giaTri: number | null;
  giaTriTruoc: number | null;
  /** Số tháng từ lần nhập kho gần nhất */
  soThang: number | null;
  /** Có cờ chậm luân chuyển > 3 tháng */
  cham: boolean;
  /** Tên công trình — có thể nhiều công trình cách nhau xuống dòng */
  congTrinh: string | null;
  ghiChu: string | null;
}

export interface ChiTietTonKhoVt {
  ngay: string;
  /** Lần chốt đem ra so (theo tham số truoc, mặc định lần chốt liền trước 'ngay'); null = không có lần chốt nào trước */
  ngayTruoc: string | null;
  /** Người xem có quyền xem giá vật tư (materials_view_price) */
  coGia: boolean;
  dong: DongTonKhoVt[];
}

/** Lỗi gọi API tồn kho vật tư; chuaCoQuyen = true khi máy chủ trả 403 (trang hiện "Bạn chưa có quyền…") */
export class LoiTonKhoVt extends Error {
  readonly maLoi: number;
  readonly chuaCoQuyen: boolean;
  constructor(thongBao: string, maLoi: number) {
    super(thongBao);
    this.name = 'LoiTonKhoVt';
    this.maLoi = maLoi;
    this.chuaCoQuyen = maLoi === 403;
  }
}

export const laLoiChuaCoQuyen = (e: unknown): boolean => e instanceof LoiTonKhoVt && e.chuaCoQuyen;

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
const chuoiHoacNull = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
/** Lấy phần 'YYYY-MM-DD' (phòng máy chủ trả kèm giờ); sai dạng => '' */
const ngayChuoi = (v: unknown): string => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v ?? ''));
  return m ? m[1] : '';
};

// Câu báo lỗi luôn tiếng Việt: lỗi 5xx máy chủ chỉ ghi 'Internal Server Error' (hoặc trang HTML của Vercel khi
// quá thời gian) => không lấy chữ máy chủ; lỗi mạng của trình duyệt ('Failed to fetch', Safari 'Load failed') cũng vậy
const LOI_MANG = 'Không kết nối được máy chủ, kiểm tra mạng rồi thử lại';
const loiMayChu = (ma: number) => `Máy chủ đang bận hoặc gặp lỗi (${ma}), hãy thử lại sau ít phút`;

const docLoi = async (r: Response): Promise<LoiTonKhoVt> => {
  if (r.status >= 500) return new LoiTonKhoVt(loiMayChu(r.status), r.status);
  let thongBao = '';
  try {
    const j = await r.json();
    // Các route này trả { error } tiếng Việt; lớp xác thực (/api/*) trả { message } tiếng Việt
    if (j && typeof j.error === 'string') thongBao = j.error;
    else if (j && typeof j.message === 'string') thongBao = j.message;
  } catch { /* thân trả về không phải JSON */ }
  if (r.status === 403) return new LoiTonKhoVt(thongBao || 'Bạn chưa có quyền xem tồn kho vật tư', 403);
  if (r.status === 401) return new LoiTonKhoVt(thongBao || 'Phiên đăng nhập đã hết hạn, hãy đăng nhập lại', 401);
  return new LoiTonKhoVt(thongBao || `Máy chủ báo lỗi (${r.status})`, r.status);
};

/** Bị huỷ (AbortController của nơi gọi) => ném nguyên lỗi để nơi gọi bỏ qua, không đổi thành câu báo lỗi */
const laBiHuy = (e: unknown, signal?: AbortSignal): boolean =>
  signal?.aborted === true || (e as { name?: unknown } | null)?.name === 'AbortError';

/** GET JSON (có `body` => POST JSON): lỗi mạng / mã lỗi / thân không đọc được => LoiTonKhoVt (câu tiếng Việt); huỷ => lỗi gốc */
const layJson = async (url: string, signal?: AbortSignal, body?: unknown) => {
  let r: Response;
  try {
    r = await fetch(url, body === undefined ? { signal }
      : { signal, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch (e) {
    if (laBiHuy(e, signal)) throw e;
    throw new LoiTonKhoVt(LOI_MANG, 0);
  }
  if (!r.ok) throw await docLoi(r);
  try {
    return await r.json();
  } catch (e) {
    if (laBiHuy(e, signal)) throw e;
    throw new LoiTonKhoVt('Máy chủ trả số liệu không đọc được, hãy thử lại', r.status);
  }
};

/**
 * Số gộp theo (ngày chốt, nhóm) của mọi lần chốt — dựng 6 biểu đồ + dải số tổng.
 * `loc` = bộ lọc tên của 1 biểu đồ: chỉ nhóm đó + các tên đã chọn (POST; `ngay` khi lọc chỉ gồm lần chốt có dòng thoả).
 */
export async function layTongHopTonKhoVt(signal?: AbortSignal, loc?: { nhom: string; ten: string[] }): Promise<TongHopTonKhoVt> {
  const j = await layJson(`${API_BASE_URL}/ton-kho-vt/tong-hop`, signal, loc && loc.ten.length ? loc : undefined);
  const diem: DiemTonKhoVt[] = (Array.isArray(j?.diem) ? j.diem : [])
    .map((d: Record<string, unknown>) => ({
      ngay: ngayChuoi(d.ngay),
      nhom: String(d.nhom ?? ''),
      giaTri: so(d.giaTri),
      giaTriCham: so(d.giaTriCham),
      soMa: so(d.soMa),
      soMaCham: so(d.soMaCham),
    }))
    .filter((d: DiemTonKhoVt) => d.ngay !== '');
  return {
    capNhat: chuoiHoacNull(j?.capNhat),
    ngay: (Array.isArray(j?.ngay) ? j.ngay : []).map(ngayChuoi).filter((n: string) => n !== ''),
    nhom: (Array.isArray(j?.nhom) ? j.nhom : []).map((n: unknown) => String(n ?? '')),
    diem,
  };
}

/**
 * Từng mã vật tư tại 1 lần chốt `ngay`, so với lần chốt `truoc` (điểm liền trước trên biểu đồ — theo tháng là lần
 * chốt cuối tháng trước; phải trước `ngay`). truoc bỏ trống = lần chốt liền trước; nhom bỏ trống = mọi nhóm.
 */
export async function layChiTietTonKhoVt(
  ngay: string, nhom?: string | null, truoc?: string | null, signal?: AbortSignal, ten?: string[],
): Promise<ChiTietTonKhoVt> {
  const q = new URLSearchParams({ ngay });
  if (nhom) q.set('nhom', nhom);
  if (truoc && truoc < ngay) q.set('truoc', truoc);
  // Có bộ lọc tên (danh sách có thể dài) => POST thân JSON thay vì tham số trên URL
  const j = ten && ten.length
    ? await layJson(`${API_BASE_URL}/ton-kho-vt/chi-tiet`, signal,
      { ngay, ...(nhom ? { nhom } : {}), ...(truoc && truoc < ngay ? { truoc } : {}), ten })
    : await layJson(`${API_BASE_URL}/ton-kho-vt/chi-tiet?${q.toString()}`, signal);
  const coGia = j?.coGia === true;
  const dong: DongTonKhoVt[] = (Array.isArray(j?.dong) ? j.dong : []).map((d: Record<string, unknown>) => ({
    ma: String(d.ma ?? ''),
    ten: chuoiHoacNull(d.ten),
    nhom: String(d.nhom ?? ''),
    dvt: chuoiHoacNull(d.dvt),
    soLuong: soHoacNull(d.soLuong),
    soLuongTruoc: soHoacNull(d.soLuongTruoc),
    giaTri: coGia ? soHoacNull(d.giaTri) : null,
    giaTriTruoc: coGia ? soHoacNull(d.giaTriTruoc) : null,
    soThang: soHoacNull(d.soThang),
    cham: d.cham === true,
    congTrinh: chuoiHoacNull(d.congTrinh),
    ghiChu: chuoiHoacNull(d.ghiChu),
  }));
  return { ngay: ngayChuoi(j?.ngay) || ngay, ngayTruoc: ngayChuoi(j?.ngayTruoc) || null, coGia, dong };
}

export interface TenVatTu {
  ten: string;
  /** Số mã vật tư mang tên này (mọi lần chốt) */
  soMa: number;
  /** Còn ở lần chốt mới nhất */
  conTon: boolean;
}

/** Tên vật tư (nguyên chuỗi như ô Excel) từng có trong 1 nhóm — danh sách của bộ lọc từng biểu đồ */
export async function layTenVatTu(nhom: string, signal?: AbortSignal): Promise<TenVatTu[]> {
  const j = await layJson(`${API_BASE_URL}/ton-kho-vt/ten-vat-tu?${new URLSearchParams({ nhom }).toString()}`, signal);
  return (Array.isArray(j?.ten) ? j.ten : []).map((t: Record<string, unknown>) => ({
    ten: String(t.ten ?? ''),
    soMa: so(t.soMa),
    conTon: t.conTon === true,
  })).filter((t: TenVatTu) => t.ten !== '');
}
