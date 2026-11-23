// BẢN LƯU SỐ TỔNG HỢP (màn đầu trang Tổng quan / Tổng quan công trình) — không phụ thuộc React.
// Mở lại trang trong ngày: số lần trước hiện ngay từ RAM (docNho, đồng bộ), request thật vẫn gửi như cũ và thay số
// khi về. Số cũ CHỈ được đọc ở điểm đồng bộ của component (giá trị khởi tạo useState, đầu effect khi tham số đổi);
// module này không có đường nào tự đẩy số cũ vào component.
//
// Nơi lưu: kho ops_cache (cùng IndexedDB với bảng lớn nên clearDataCache xoá luôn), 1 bản ghi khoá so_v1 =
// { ngay, muc, chu, m: { [url]: { t, s } } } — s là chữ JSON nguyên văn máy chủ trả, t là lúc request bắt đầu.
// Chỉ dùng lại khi cùng ngày VN, cùng mức xem dữ liệu (ops_cache_owner) và cùng tài khoản.
import { docKho, ghiKho, xoaKho, getCacheGeneration, luuKhiRanh } from './dataService';

const KHOA = 'so_v1';
const MUC_DAI_NHAT = 200_000;   // mục dài hơn thì không lưu (ký tự)
const SO_MUC_TOI_DA = 40;
const TONG_DAI_TOI_DA = 1_500_000;
const GHI_CACH_NHAU_MS = 2000;
const GIU_GUI_TRUOC_MS = 10_000;
const DOC_TOI_DA_MS = 3000;     // chờ đọc bản lưu từ đĩa lâu nhất chừng này

/**
 * Đường dẫn được lưu: GET, phản hồi không phụ thuộc người gọi (route không đọc req.user). Mục kết thúc bằng '/' =
 * đường dẫn có thêm đúng 1 đoạn NĂM phía sau (/api/revenue/2026). So đúng tên: '/api/trend' không gồm
 * '/api/trend-by-xuong'.
 */
export const DUOC_NHO: string[] = [
  '/api/overview/summary',
  '/api/overview/tuy-chon-thoi-gian',
  '/api/trend',
  '/api/khsx-nam/plan-actual',
  '/api/khsx/ke-hoach-ngay',
  '/api/revenue/',
  '/api/stock/dates',
  '/api/khsx-nhapkho/summary',
  '/api/vuong-mac/by-project',
];

const duongDan = (url: string) => { const i = url.indexOf('?'); return i < 0 ? url : url.slice(0, i); };
/** URL (đường dẫn + tham số như gửi đi) có thuộc danh sách được lưu không */
export const duocNho = (url: string): boolean => {
  const p = duongDan(url);
  return DUOC_NHO.some(d => (d.endsWith('/') ? p.startsWith(d) && /^\d{4}$/.test(p.slice(d.length)) : p === d));
};

/** Ngày theo giờ Việt Nam (UTC+7), dạng YYYY-MM-DD — bản lưu chỉ dùng trong cùng ngày này */
export const ngayVN = (d: Date = new Date()): string => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);

export interface MucNho { t: number; s: string }
export interface BanGhiNho { ngay: string; muc: string; chu: string; m: Record<string, MucNho> }

/** Bản ghi đọc từ đĩa có dùng được cho (ngày, mức xem, tài khoản) này không. Thiếu mức / tài khoản = không dùng. */
export function hopLe(banGhi: unknown, ngay: string, muc: string | null | undefined, chu: string | null | undefined): banGhi is BanGhiNho {
  if (!banGhi || typeof banGhi !== 'object') return false;
  const b = banGhi as Partial<BanGhiNho>;
  if (!ngay || !muc || !chu) return false;
  return b.ngay === ngay && b.muc === muc && b.chu === chu && !!b.m && typeof b.m === 'object';
}

/**
 * Cắt bớt cho vừa giới hạn: bỏ mục hỏng / dài hơn 200 nghìn ký tự, rồi bỏ dần mục `t` cũ nhất tới khi còn ≤ toiDa mục
 * và tổng ≤ tongToiDa ký tự. Trả object mới, không sửa `m`.
 */
export function catBot(m: Record<string, MucNho>, toiDa = SO_MUC_TOI_DA, tongToiDa = TONG_DAI_TOI_DA): Record<string, MucNho> {
  const ds = Object.entries(m)
    .filter(([, e]) => e && typeof e.s === 'string' && typeof e.t === 'number' && e.s.length <= MUC_DAI_NHAT)
    .sort((a, b) => b[1].t - a[1].t); // mới nhất trước
  const ra: Record<string, MucNho> = {};
  let tong = 0, n = 0;
  for (const [url, e] of ds) {
    // Mục mới hơn được giữ trước; tới mục làm vượt trần thì dừng hẳn (mọi mục sau đều cũ hơn)
    if (n >= toiDa || tong + e.s.length > tongToiDa) break;
    ra[url] = { t: e.t, s: e.s };
    tong += e.s.length;
    n++;
  }
  return ra;
}

/** Phản hồi của request bắt đầu lúc tBatDau có được thay mục đang có không: request bắt đầu SỚM hơn thì không. */
export const nenGhi = (cu: { t: number } | null | undefined, tBatDau: number): boolean => !cu || tBatDau >= cu.t;

// ---------------------------------------------------------------------------------------------------------------
// Phần lưu tách sau 1 giao diện nhỏ để test không cần IndexedDB / localStorage thật
// ---------------------------------------------------------------------------------------------------------------
export interface KhoNho {
  doc(): Promise<unknown>;
  /** Ghi trong 1 transaction: đọc bản đang có -> gop(cu) -> put; gop trả null thì không ghi. Bỏ nếu thế hệ cache đã khác `theHe`. */
  ghi(theHe: number, gop: (cu: unknown) => BanGhiNho | null): Promise<void>;
  xoa(): Promise<void>;
  /** Thế hệ cache của dataService (tăng mỗi lần clearDataCache) */
  theHe(): number;
  /** Mức xem dữ liệu đang giữ cache ('gia' | 'thuong'), null = chưa xác nhận */
  muc(): string | null;
  /** Tài khoản đang đăng nhập (đọc từ storage), null = không rõ */
  chu(): string | null;
  khiRanh(f: () => void): void;
}
/** Tên tài khoản đang đăng nhập, đọc từ storage như AuthContext (app_user_persist trước, app_user_session sau) */
export const docChuDangNhap = (): string | null => {
  try {
    const chu = localStorage.getItem('app_user_persist') || sessionStorage.getItem('app_user_session');
    const u = chu ? JSON.parse(chu) : null;
    return u && typeof u.username === 'string' && u.username ? u.username : null;
  } catch { return null; }
};
const khoThat: KhoNho = {
  doc: () => docKho(KHOA),
  ghi: (theHe, gop) => ghiKho<BanGhiNho | null>(KHOA, null, theHe, cu => gop(cu)),
  xoa: () => xoaKho(KHOA),
  theHe: () => getCacheGeneration(),
  muc: () => { try { return localStorage.getItem('ops_cache_owner'); } catch { return null; } },
  chu: docChuDangNhap,
  khiRanh: f => luuKhiRanh(f),
};
let kho: KhoNho = khoThat;

// ---------------------------------------------------------------------------------------------------------------
// Trạng thái trong RAM
// ---------------------------------------------------------------------------------------------------------------
interface MucRam extends MucNho { o?: unknown; daDoc?: boolean }
const ram = new Map<string, MucRam>();
let ngayRam = '';           // ngày VN của các mục trong RAM
let theHeRam = -1;          // thế hệ cache lúc RAM được dùng lần gần nhất
let theHeRieng = 0;         // tăng mỗi lần boNho()
let chuNap = '';            // tài khoản có bản lưu đã nạp từ đĩa vào RAM ('' = chưa nạp của ai)
// Tài khoản đang đăng nhập (đọc từ storage) ở lần dùng RAM gần nhất; undefined = chưa dùng lần nào
let chuRam: string | null | undefined;
let napP: Promise<void> | null = null;
let canGhi = false;
let henGhi: ReturnType<typeof setTimeout> | null = null;
let lanGhiCuoi = 0;

// ac: để huỷ request mạng khi KHÔNG còn ai chờ; soCho = số nơi gọi có signal đang chờ; giuLuon = có nơi gọi không
// signal hoặc là request gửi trước => không bao giờ huỷ
interface DangBay { p: Promise<unknown>; giuDen: number; xong: boolean; ac: AbortController | null; soCho: number; giuLuon: boolean }
const dangBay = new Map<string, DangBay>();

// URL gọi lỗi trong khi trang đang dùng số lưu của nó -> t của số lưu đó
const urlLoi = new Map<string, number>();
let trangThai: { loi: boolean; t: number | null } = { loi: false, t: null };
const ngheTrangThai = new Set<() => void>();
const ngheMoc = new Set<() => void>();
let mocCu: string | null = null;

// Báo ở microtask: docNho có thể chạy giữa lượt vẽ của React, không được gọi setState của component khác lúc đó
const sauLuot = (f: () => void) => { void Promise.resolve().then(f); };

function capNhatTrangThai(): void {
  const loi = urlLoi.size > 0;
  let t: number | null = null;
  urlLoi.forEach(v => { if (t === null || v < t) t = v; });
  if (loi === trangThai.loi && t === trangThai.t) return;
  trangThai = { loi, t };
  sauLuot(() => ngheTrangThai.forEach(f => { try { f(); } catch { /* bỏ qua */ } }));
}

/**
 * Bỏ RAM khi thế hệ cache đổi (đăng xuất / đổi mức xem đã xoá kho), sang ngày VN mới, hoặc tài khoản đăng nhập
 * trong storage khác lần dùng trước. Gọi trước mọi lần đọc / ghi RAM.
 * Kiểm tài khoản ở ĐÂY chứ không trông vào việc mọi đường thoát phiên đều gọi boNho(): /auth/me từ chối lúc mở app,
 * máy trạm tự bỏ phiên người đăng ký, tab khác đăng nhập người khác... đều đổi storage mà không qua boNho.
 */
function dongBo(): void {
  const g = kho.theHe();
  const ngay = ngayVN();
  const chu = kho.chu();
  const doiChu = chuRam !== undefined && chu !== chuRam;
  chuRam = chu;
  if (g === theHeRam && ngay === ngayRam && !doiChu) return;
  if (ram.size > 0 || urlLoi.size > 0) { ram.clear(); urlLoi.clear(); capNhatTrangThai(); }
  // Kết quả gửi trước đang giữ là của phiên người trước: lời gọi sau gửi request mới
  if (doiChu) dangBay.clear();
  canGhi = false;
  theHeRam = g;
  ngayRam = ngay;
}

function giuGioiHanRam(): void {
  let tong = 0;
  ram.forEach(e => { tong += e.s.length; });
  if (ram.size <= SO_MUC_TOI_DA && tong <= TONG_DAI_TOI_DA) return;
  const tam: Record<string, MucNho> = {};
  ram.forEach((e, url) => { tam[url] = e; });
  const giu = catBot(tam);
  [...ram.keys()].forEach(url => { if (!(url in giu)) { ram.delete(url); urlLoi.delete(url); } });
  capNhatTrangThai();
}

/** Object của 1 mục RAM — parse lười 1 lần rồi giữ, để mọi nơi đọc nhận CÙNG một object (so === được) */
function layObject(url: string, e: MucRam): unknown {
  if (!e.daDoc) {
    try { e.o = JSON.parse(e.s); e.daDoc = true; }
    catch { ram.delete(url); return undefined; }
  }
  return e.o;
}

// ---------------------------------------------------------------------------------------------------------------
// Ghi xuống đĩa: gom 1 lần lúc rảnh, cách nhau ít nhất 2 giây
// ---------------------------------------------------------------------------------------------------------------
function ghiXuong(): void {
  lanGhiCuoi = Date.now();
  dongBo();
  if (!canGhi || ram.size === 0) return;
  const muc = kho.muc();
  const chu = kho.chu();
  // Mức xem chưa xác nhận (chưa qua claimDataCache) hoặc không rõ tài khoản: để lần ghi sau, cờ canGhi còn nguyên
  if (!muc || !chu) return;
  // RAM đang có số nạp từ bản lưu của tài khoản khác với người đang đăng nhập: không ghi dưới tên người này
  if (chuNap && chuNap !== chu) return;
  canGhi = false;
  const theHe = theHeRam, rieng = theHeRieng, ngay = ngayRam;
  const moi: Array<[string, MucNho]> = [];
  ram.forEach((e, url) => { moi.push([url, { t: e.t, s: e.s }]); });
  kho.ghi(theHe, cu => {
    // Chạy bên trong transaction: boNho() / clearDataCache() / sang ngày xảy ra trong lúc chờ mở kho thì bỏ
    if (rieng !== theHeRieng || theHe !== kho.theHe() || ngay !== ngayVN()) return null;
    // Gộp với bản trên đĩa (tab khác vừa ghi) theo t của từng mục — hai tab không đè nguyên bản ghi của nhau
    const m: Record<string, MucNho> = hopLe(cu, ngay, muc, chu) ? { ...cu.m } : {};
    for (const [url, e] of moi) if (nenGhi(m[url], e.t)) m[url] = e;
    return { ngay, muc, chu, m: catBot(m) };
  }).catch(() => { /* lưu không được thì thôi, lần mở sau tải như chưa có bản lưu */ });
}

function henGhiXuong(): void {
  canGhi = true;
  if (henGhi !== null) return;
  const cho = Math.max(0, GHI_CACH_NHAU_MS - (Date.now() - lanGhiCuoi));
  henGhi = setTimeout(() => { henGhi = null; kho.khiRanh(ghiXuong); }, cho);
}

// ---------------------------------------------------------------------------------------------------------------
// API công khai
// ---------------------------------------------------------------------------------------------------------------

/**
 * Nạp bản lưu của tài khoản `chu` từ đĩa vào RAM. Một lần mỗi phiên cho mỗi tài khoản (gọi lại cùng `chu` trả promise
 * cũ); 1 lần mở kho, 1 transaction. Không bao giờ reject. Chưa ai gọi thì docNho chỉ có số của chính phiên này và
 * goiNho vẫn gọi mạng bình thường.
 */
export function napNho(chu: string): Promise<void> {
  if (napP && chu === chuNap) return napP;
  // RAM đang giữ số nạp từ bản lưu của tài khoản khác: bỏ trước khi nạp của người này
  if (chuNap && chu !== chuNap) { ram.clear(); urlLoi.clear(); capNhatTrangThai(); canGhi = false; }
  chuNap = chu;
  if (!chu) { napP = Promise.resolve(); return napP; }
  const theHe = kho.theHe(), rieng = theHeRieng;
  napP = (async () => {
    // Đọc đĩa có hạn chờ: goiNho chờ napNho trước khi trả số mạng, nên IndexedDB treo (mở kho không bao giờ trả lời)
    // không được làm treo theo mọi lời gọi API — quá hạn thì coi như chưa có bản lưu
    const bg = await new Promise<unknown>(resolve => {
      const hen = setTimeout(() => resolve(undefined), DOC_TOI_DA_MS);
      const xong = (v: unknown) => { clearTimeout(hen); resolve(v); };
      try { kho.doc().then(xong, () => xong(undefined)); } catch { xong(undefined); }
    });
    // Trong lúc đọc mà kho bị xoá / đổi tài khoản thì bản vừa đọc là của phiên trước: bỏ
    if (theHe !== kho.theHe() || rieng !== theHeRieng || chu !== chuNap) return;
    // Người đang đăng nhập (storage) không còn là `chu`: không nạp số của `chu` vào RAM của người này
    if (kho.chu() !== chu) return;
    if (!hopLe(bg, ngayVN(), kho.muc(), chu)) return;
    dongBo();
    for (const [url, e] of Object.entries(bg.m)) {
      if (!e || typeof e.s !== 'string' || typeof e.t !== 'number' || e.s.length > MUC_DAI_NHAT || !duocNho(url)) continue;
      // Mạng đã trả lời URL này trước khi đọc xong đĩa: giữ số mới, không cho số cũ đè
      const dangCo = ram.get(url);
      if (dangCo && dangCo.t >= e.t) continue;
      ram.set(url, { t: e.t, s: e.s });
    }
    giuGioiHanRam();
  })();
  return napP;
}

/** Số đã lưu của URL (đồng bộ, từ RAM); undefined = không có / khác ngày / kho vừa bị xoá. Cùng URL trả cùng 1 object. */
export function docNho<T>(url: string): T | undefined {
  dongBo();
  const e = ram.get(url);
  return e ? (layObject(url, e) as T | undefined) : undefined;
}

const loiHuy = (): Error => {
  try { return new DOMException('Aborted', 'AbortError'); }
  catch { const e = new Error('Aborted'); e.name = 'AbortError'; return e; }
};

/** Tải thật 1 URL (không bao giờ reject): object, hoặc null khi lỗi mạng / !ok / chữ không phải JSON */
async function tai(url: string, luu: boolean, signal?: AbortSignal): Promise<unknown> {
  const theHe = kho.theHe(), rieng = theHeRieng, chu0 = kho.chu();
  const t0 = Date.now();
  let s: string;
  try {
    const r = await (signal ? fetch(url, { signal }) : fetch(url));
    if (!r.ok) throw new Error(`Lỗi ${r.status}`);
    s = await r.text();
  } catch {
    // Tự huỷ vì không còn ai chờ (xem boNeuKhongAiCho): không phải lỗi mạng, không bật nhãn "chưa cập nhật được"
    if (signal?.aborted) return null;
    return taiLoi(url);
  }
  // Chờ bản lưu đọc xong rồi mới so chữ (request đã gửi từ trước, không chờ đĩa mới gửi)
  if (napP) await napP;
  // chu0: request gửi dưới phiên người khác (đổi tài khoản giữa chừng) không được vào bản lưu của người đang đăng nhập
  const conHieuLuc = luu && s.length <= MUC_DAI_NHAT && theHe === kho.theHe() && rieng === theHeRieng && chu0 === kho.chu();
  if (conHieuLuc) {
    dongBo();
    const cu = ram.get(url);
    if (cu && cu.s === s) {
      // Chữ giống hệt bản lưu: trả đúng object đang hiện để nơi gọi so === và bỏ setState
      const o = layObject(url, cu);
      if (o !== undefined || cu.daDoc) {
        if (t0 > cu.t) { cu.t = t0; henGhiXuong(); }
        xoaLoi(url);
        return o;
      }
    }
  }
  let o: unknown;
  try { o = JSON.parse(s); } catch { return taiLoi(url); }
  if (conHieuLuc && nenGhi(ram.get(url), t0)) {
    ram.set(url, { t: t0, s, o, daDoc: true });
    giuGioiHanRam();
    henGhiXuong();
  }
  xoaLoi(url);
  return o;
}

function taiLoi(url: string): null {
  // Chỉ báo "chưa cập nhật được" khi trang đang có số lưu của đúng URL này để hiện; bản lưu giữ nguyên
  dongBo();
  const e = ram.get(url);
  if (e) { urlLoi.set(url, e.t); capNhatTrangThai(); }
  return null;
}

function xoaLoi(url: string): void {
  if (urlLoi.size === 0) return;
  // API này vừa trả lời được: bỏ lỗi của mọi URL cùng đường dẫn (bộ lọc cũ đã lỗi không còn là số đang hiện)
  const p = duongDan(url);
  [...urlLoi.keys()].forEach(u => { if (duongDan(u) === p) urlLoi.delete(u); });
  capNhatTrangThai();
}

/** Request chung của 1 URL: lời gọi trùng lúc đang bay dùng lại; `giuMs` > 0 thì kết quả được giữ thêm tới hết hạn đó */
function chung(url: string, luu: boolean, giuMs: number): DangBay {
  dongBo(); // đổi tài khoản thì bỏ kết quả đang giữ của phiên trước, trước khi tra
  const luc = Date.now();
  const co = dangBay.get(url);
  if (co && (!co.xong || luc < co.giuDen)) return co;
  const ac = typeof AbortController === 'undefined' ? null : new AbortController();
  const e: DangBay = { p: Promise.resolve(null), giuDen: giuMs > 0 ? luc + giuMs : 0, xong: false, ac, soCho: 0, giuLuon: false };
  e.p = tai(url, luu, ac?.signal).then(v => {
    e.xong = true;
    if (dangBay.get(url) !== e) return v;
    const con = e.giuDen - Date.now();
    if (v !== null && con > 0) setTimeout(() => { if (dangBay.get(url) === e) dangBay.delete(url); }, con);
    else dangBay.delete(url);
    return v;
  }, () => {
    // tai() không reject; nếu có lỗi lạ thì vẫn phải gỡ mục này — không thì mọi lời gọi sau của URL nhận mãi promise hỏng
    e.xong = true;
    if (dangBay.get(url) === e) dangBay.delete(url);
    return null;
  });
  dangBay.set(url, e);
  return e;
}

/**
 * Nơi gọi cuối cùng của 1 request đang bay vừa huỷ: huỷ luôn request mạng để trả suất hàng đợi (4 suất). Không làm
 * vậy thì đổi bộ lọc liên tục để lại hàng loạt request của bộ lọc cũ chạy hết lượt, số của bộ lọc cuối phải chờ sau.
 * Còn nơi khác chờ (soCho > 0), có nơi gọi không signal hoặc là request gửi trước (giuLuon) thì không đụng.
 */
function boNeuKhongAiCho(url: string, e: DangBay): void {
  if (e.xong || e.giuLuon || e.soCho > 0 || !e.ac) return;
  // Gỡ trước khi huỷ: lời gọi sau của URL này phải gửi request mới, không nhận kết quả của request đã huỷ
  if (dangBay.get(url) === e) dangBay.delete(url);
  e.ac.abort();
}

/**
 * GET 1 URL /api (đường dẫn + tham số). Trả object; null khi lỗi mạng / máy chủ báo lỗi (bản lưu không bị đụng).
 * - Lời gọi trùng URL đang bay dùng chung 1 request. Request chung KHÔNG gắn signal của nơi gọi: nơi gọi huỷ thì
 *   riêng nơi đó nhận AbortError, request vẫn chạy cho nơi khác. Chỉ khi MỌI nơi gọi đều có signal và đều đã huỷ
 *   (và không phải request gửi trước) thì request mạng mới bị huỷ theo, để trả suất hàng đợi.
 * - URL thuộc DUOC_NHO (và không khongLuu) thì phản hồi được lưu; chữ giống bản lưu thì trả đúng object docNho đang trả.
 */
export function goiNho<T>(url: string, o?: { signal?: AbortSignal; khongLuu?: boolean }): Promise<T | null> {
  const signal = o?.signal;
  if (signal?.aborted) return Promise.reject(loiHuy());
  const e = chung(url, !o?.khongLuu && duocNho(url), 0);
  const p = e.p as Promise<T | null>;
  if (!signal) { e.giuLuon = true; return p; }
  e.soCho++;
  return new Promise<T | null>((resolve, reject) => {
    const khiHuy = () => { e.soCho--; boNeuKhongAiCho(url, e); reject(loiHuy()); };
    signal.addEventListener('abort', khiHuy, { once: true });
    p.then(v => { signal.removeEventListener('abort', khiHuy); resolve(v); },
      loi => { signal.removeEventListener('abort', khiHuy); reject(loi); });
  });
}

/** Gửi trước các URL (lúc mở app, trước khi React vẽ); component gọi goiNho cùng URL trong 10 giây nhận lại kết quả này */
export function goiTruoc(urls: string[]): void {
  // giuLuon: request gửi trước không thuộc về component nào, component huỷ (gắn lại, đổi lọc) không được huỷ theo
  for (const url of urls) chung(url, duocNho(url), GIU_GUI_TRUOC_MS).giuLuon = true;
}

/**
 * Bỏ bản lưu: xoá RAM + xoá khoá so_v1 trên đĩa. Request đang bay bắt đầu trước đó không được ghi lại (thế hệ riêng).
 * Gọi khi đăng xuất, hết phiên, bấm Làm mới, đổi setup gộp xưởng.
 */
export function boNho(): void {
  theHeRieng++;
  ram.clear();
  dangBay.clear(); // nơi đang chờ vẫn nhận kết quả của mình; lời gọi sau gửi request mới
  urlLoi.clear();
  capNhatTrangThai();
  canGhi = false;
  // RAM đã trống nên không còn số nạp của ai; lần ghi sau lấy tên người đang đăng nhập
  chuNap = '';
  napP = null;
  if (henGhi !== null) { clearTimeout(henGhi); henGhi = null; }
  kho.xoa().catch(() => { /* bỏ qua */ });
}

/** loi = có URL gọi lỗi mà trang đang dùng số lưu của nó; t = lúc lưu (ms) của số cũ nhất trong các URL đó */
export function trangThaiNho(): { loi: boolean; t: number | null } {
  return trangThai;
}
/** Nghe trangThaiNho đổi (dùng với useSyncExternalStore); trả hàm thôi nghe */
export function theoDoiNho(fn: () => void): () => void {
  ngheTrangThai.add(fn);
  return () => { ngheTrangThai.delete(fn); };
}

/**
 * Báo "chữ ký" dữ liệu máy chủ (phiên bản các bảng + ngày). Lần đầu chỉ ghi mốc; chữ ký ĐỔI mới báo cho nơi nghe để
 * gọi lại API (số đang hiện giữ nguyên tới khi số mới về).
 */
export function baoMocDoi(chuKy: string): void {
  if (mocCu === null) { mocCu = chuKy; return; }
  if (mocCu === chuKy) return;
  mocCu = chuKy;
  dangBay.clear(); // kết quả gửi trước / đang bay tính theo dữ liệu cũ: lời gọi sau phải gửi request mới
  ngheMoc.forEach(f => { try { f(); } catch { /* bỏ qua */ } });
}
export function theoDoiMoc(fn: () => void): () => void {
  ngheMoc.add(fn);
  return () => { ngheMoc.delete(fn); };
}

/** CHỈ DÙNG TRONG TEST: thay phần lưu và đưa module về trạng thái ban đầu */
export function datLaiDeThu(khoThu?: KhoNho): void {
  kho = khoThu ?? khoThat;
  ram.clear(); dangBay.clear(); urlLoi.clear();
  trangThai = { loi: false, t: null };
  ngheTrangThai.clear(); ngheMoc.clear();
  ngayRam = ''; theHeRam = -1; theHeRieng = 0; chuNap = ''; chuRam = undefined; napP = null; canGhi = false; lanGhiCuoi = 0; mocCu = null;
  if (henGhi !== null) { clearTimeout(henGhi); henGhi = null; }
}
