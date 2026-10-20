import { docKy, type CauHoi, type Ky } from './hieuCauHoi';
import { cotMoRong, type BangDM, type CotDM, type Ham, type Loc, type Moc, type Op, type TruyVan, type TuDien } from './truyVanApi';

// ============================================================================
// HIỂU CÂU → TRUY VẤN CÓ CẤU TRÚC (không AI). Dò tên bảng / cột theo DANH MỤC máy chủ trả (tên + cách gọi khác),
// rồi đọc: "theo X" (nhóm), "tổng / trung bình / số / lớn nhất … Y" (phép tính), "<cột> là / chứa / > / trước … <giá trị>"
// (lọc), xưởng, mã CT, HEX, kỳ ("tháng này", "quý 3", "năm 2025"…), "liệt kê", "top 10", "kể cả hủy".
// Thuần hàm — test ở hieuTruyVan.test.ts.
// ============================================================================

export interface HieuTV {
  tv: TruyVan;
  /** Có phần mà các câu trả lời mẫu (traLoi.ts) không làm được => nên dùng tự tra */
  phuc: boolean;
  /** Bảng có được gọi tên rõ trong câu không */
  roBang: boolean;
  /** Phần trong câu không áp được (ghi cho người dùng biết) */
  boQua: string[];
  /** Tên kỳ đọc được */
  ky?: string;
  /** Chữ trong câu chưa hiểu (đã bỏ từ đệm) — còn chữ nào thì nhờ AI đọc lại câu (nếu máy chủ bật AI) */
  thua: string[];
}

// Từ đệm / từ hỏi: còn sót cũng không làm đổi nghĩa câu
const TU_DEM = new Set(('ai co bao nhieu la cua cho toi tui minh em anh chi xem hay giup nao the gi duoc khong voi va cac nhung mot da dang roi '
  + 'o tai trong tu den theo nhat it lon nho hon bang so tong tat ca hien nay luc cai con lai bi dc a ah nhe vay sao nhu oi ok thi ma de can muon '
  + 'biet hoi xin lam on vs hang muc don gia tri tien ty trieu thong tin so lieu bao gom hien tai luon tinh nhom nam o').split(' '));

// ---- Bỏ dấu GIỮ ĐỘ DÀI (để cắt lại chữ gốc có dấu khi hiện giá trị lọc) ----------------------------------------
const bo1 = (ch: string) => {
  const c = ch.toLowerCase();
  if (c === 'đ' || c === 'ð') return 'd';
  const b = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return b.length === 1 ? b : b.charAt(0) || ' ';
};
export const boDauGiu = (s: string) => [...s].map(bo1).join('');
const boDau = (s: string) => boDauGiu(s).replace(/\s+/g, ' ').trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ranh = (cum: string) => new RegExp(`(?<![a-z0-9])${esc(cum)}(?![a-z0-9])`, 'g');

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dd = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

/** Bảng "dòng chảy" mà câu trả lời mẫu (traLoi.ts dongChay) đã chia theo xưởng / công trình và lọc xưởng / công trình được */
const DONG_CHAY = new Set(['nhap_kho', 'xuat_kho', 'dht', 'tkbv_full', 'pthsp_full']);
/** Bảng sự kiện theo ngày: không nói kỳ => mặc định năm nay */
const KHONG_KY_MAC_DINH = new Set(['production_status_app', 'vat_tu', 'ton_kho']);
/** Bảng kế hoạch: kỳ gồm cả ngày tương lai ("tháng này" = cả tháng, không cắt tới hôm nay) */
const KE_HOACH = new Set(['khsx', 'khsx_nam', 'phan_tich_kh_th']);

const cumCua = (ten: string, dn: string[], id?: string) => {
  const s = new Set<string>();
  [ten, ten.replace(/\s*\(.*?\)\s*/g, ' '), ...dn, ...(id ? [id.replace(/_/g, ' ')] : [])].forEach(x => { const k = boDau(x); if (k.length >= 2) s.add(k); });
  return [...s].sort((a, b) => b.length - a.length);
};

interface Khop { tu: number; den: number }

class Cau {
  q: string;
  goc: string[];
  dung: boolean[];
  constructor(cau: string) {
    const gon = cau.replace(/\s+/g, ' ').trim();
    this.goc = [...gon];
    this.q = this.goc.map(bo1).join('');
    this.dung = this.goc.map(() => false);
  }
  conTrong(tu: number, den: number) { for (let i = tu; i < den; i++) if (this.dung[i]) return false; return true; }
  danh(tu: number, den: number) { for (let i = tu; i < den; i++) this.dung[i] = true; }
  /** Chữ còn lại (vị trí đã dùng thay bằng dấu cách) */
  conLai() { return this.goc.map((_, i) => (this.dung[i] ? ' ' : this.q[i])).join(''); }
  gocTu(tu: number, den: number) { return this.goc.slice(tu, den).join('').trim(); }
  /** Mọi chỗ khớp cụm (đúng ranh giới từ) ở phần chưa dùng */
  tim(cum: string, tu = 0): Khop[] {
    const re = ranh(cum);
    re.lastIndex = tu;
    const out: Khop[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.q))) { if (this.conTrong(m.index, m.index + cum.length)) out.push({ tu: m.index, den: m.index + cum.length }); }
    return out;
  }
  /** Cụm bắt đầu đúng tại vị trí `i` (bỏ khoảng trắng đầu) */
  batDau(cum: string, i: number): Khop | null {
    while (this.q[i] === ' ') i++;
    if (!this.q.startsWith(cum, i) || /[a-z0-9]/.test(this.q[i + cum.length] ?? '') || !this.conTrong(i, i + cum.length)) return null;
    return { tu: i, den: i + cum.length };
  }
}

// Từ nối / dừng: giá trị lọc chữ kết thúc trước các từ này
const DUNG = /^(chua nhan|da nhan|con thieu|chua ve|da ve|qua han|tre han|theo|va|voi|trong|tu|den|toi|thang|tuan|quy|nam|hom|ngay|cua|loc|nhung|khi|bao nhieu|tong|dem|nhieu nhat|it nhat|top|liet ke|danh sach|tat ca|toan bo|ke ca|gom|co bao|o xuong|xuong|cong trinh|hex|la bao|the nao|ra sao|nhu nao|nhieu|nao)\b/;
const OP_CHU: Array<[string, Op]> = [
  ['khong chua', 'khong_chua'], ['khong phai la', 'khac'], ['khong phai', 'khac'], ['khac', 'khac'], ['khong la', 'khac'],
  ['de trong', 'rong'], ['bi trong', 'rong'], ['chua co', 'rong'], ['khong co', 'rong'], ['da co', 'co'], ['co gia tri', 'co'],
  ['bang', 'bang'], ['=', 'bang'], ['la', 'chua'], [':', 'chua'], ['co chu', 'chua'], ['gom', 'chua'], ['thuoc', 'chua'],
];
const OP_SO: Array<[string, Op]> = [
  ['lon hon hoac bang', 'lon_hon_bang'], ['nho hon hoac bang', 'nho_hon_bang'], ['>=', 'lon_hon_bang'], ['<=', 'nho_hon_bang'],
  ['it nhat', 'lon_hon_bang'], ['toi thieu', 'lon_hon_bang'], ['tu', 'lon_hon_bang'], ['toi da', 'nho_hon_bang'], ['khong qua', 'nho_hon_bang'],
  ['den', 'nho_hon_bang'], ['lon hon', 'lon_hon'], ['nhieu hon', 'lon_hon'], ['cao hon', 'lon_hon'], ['tren', 'lon_hon'], ['hon', 'lon_hon'],
  ['qua', 'lon_hon'], ['vuot', 'lon_hon'], ['sau', 'lon_hon'], ['>', 'lon_hon'], ['nho hon', 'nho_hon'], ['it hon', 'nho_hon'],
  ['thap hon', 'nho_hon'], ['duoi', 'nho_hon'], ['truoc', 'nho_hon'], ['<', 'nho_hon'], ['khac', 'khac'], ['bang', 'bang'], ['=', 'bang'],
  ['la', 'bang'], ['de trong', 'rong'], ['chua co', 'rong'], ['khong co', 'rong'], ['da co', 'co'],
];

const MOC_TU: Array<[string, Moc]> = [['ngay', 'ngay'], ['tuan', 'tuan'], ['thang', 'thang'], ['quy', 'quy'], ['nam', 'nam']];

/** "1,5 tỷ" / "500 triệu" / "30" -> số (cột tiền tính theo triệu; không ghi đơn vị thì hiểu là tỷ như trên màn hình) */
function docSo(s: string, tien: boolean): { n: number; dai: number; nhan: string } | null {
  const m = s.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*(ty|trieu|tr|nghin|k)?(?![a-z0-9])/);
  if (!m) return null;
  let n = Number(m[1].replace(',', '.'));
  const dv = m[2];
  if (tien) n = dv === 'trieu' || dv === 'tr' ? n : dv === 'nghin' || dv === 'k' ? n / 1000 : n * 1000;
  const nhan = tien ? (dv === 'trieu' || dv === 'tr' ? `${m[1]} triệu` : `${m[1]} tỷ`) : m[1];
  return { n, dai: m[0].length, nhan };
}
function docNgay(s: string, homNay: Date): { d: string; dai: number } | null {
  const m = s.match(/^\s*(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?!\d)/);
  if (!m) return null;
  const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : homNay.getFullYear();
  const d = new Date(y, +m[2] - 1, +m[1]);
  return Number.isNaN(d.getTime()) ? null : { d: iso(d), dai: m[0].length };
}

/** Kỳ: năm 2025, quý 3, tháng 9/2025, năm trước, tất cả… rồi tới các kỳ của hieuCauHoi.docKy */
function docKyRong(c: Cau, homNay: Date, tuongLai: boolean): { ky: Ky | null; tatCa: boolean } {
  const h = new Date(homNay.getFullYear(), homNay.getMonth(), homNay.getDate());
  const q = c.conLai();
  const danhRe = (re: RegExp) => { const m = re.exec(q); if (m) c.danh(m.index, m.index + m[0].length); return m; };
  if (danhRe(/(?<![a-z0-9])(tat ca|toan bo|tu truoc (toi|den) nay|moi luc|tu dau)(?![a-z0-9])/)) return { ky: null, tatCa: true };
  const cat = (tu: Date, den: Date, ten: string): Ky => ({ tu, den: den > h && !tuongLai ? h : den, ten });
  let m = danhRe(/(?<![a-z0-9])thang (\d{1,2})(?:\s*[/-]\s*| nam )(20\d{2})(?![0-9])/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return { ky: cat(new Date(+m[2], +m[1] - 1, 1), new Date(+m[2], +m[1], 0), `tháng ${+m[1]}/${m[2]}`), tatCa: false };
  m = danhRe(/(?<![a-z0-9])quy ([1-4])(?: nam (20\d{2}))?(?![0-9])/);
  if (m) { const y = m[2] ? +m[2] : h.getFullYear(); const t = (+m[1] - 1) * 3; return { ky: cat(new Date(y, t, 1), new Date(y, t + 3, 0), `quý ${m[1]}/${y}`), tatCa: false }; }
  m = danhRe(/(?<![a-z0-9])quy (nay|hien tai)(?![a-z0-9])/);
  if (m) { const t = Math.floor(h.getMonth() / 3) * 3; return { ky: cat(new Date(h.getFullYear(), t, 1), h, `quý ${t / 3 + 1}/${h.getFullYear()}`), tatCa: false }; }
  m = danhRe(/(?<![a-z0-9])nam (20\d{2})(?![0-9])/);
  if (m) return { ky: cat(new Date(+m[1], 0, 1), new Date(+m[1], 11, 31), `năm ${m[1]}`), tatCa: false };
  m = danhRe(/(?<![a-z0-9])nam (truoc|ngoai|roi)(?![a-z0-9])/);
  if (m) { const y = h.getFullYear() - 1; return { ky: cat(new Date(y, 0, 1), new Date(y, 11, 31), `năm ${y}`), tatCa: false }; }
  const ky = docKy(q, homNay);
  if (ky && tuongLai) {
    // docKy cắt "tuần / tháng / năm này" tới hôm nay — kế hoạch thì lấy trọn kỳ
    if (/(?<![a-z0-9])tuan (nay|hien tai)/.test(q)) ky.den = new Date(ky.tu.getFullYear(), ky.tu.getMonth(), ky.tu.getDate() + 6);
    else if (/(?<![a-z0-9])thang (nay|hien tai)/.test(q)) ky.den = new Date(h.getFullYear(), h.getMonth() + 1, 0);
    else if (/(?<![a-z0-9])thang \d{1,2}(?![0-9])/.test(q)) ky.den = new Date(ky.tu.getFullYear(), ky.tu.getMonth() + 1, 0);
    else if (/(?<![a-z0-9])nam (nay|hien tai)/.test(q)) ky.den = new Date(h.getFullYear(), 11, 31);
  }
  if (ky) {
    [/(?:tu|từ)\s*\d{1,2}\/\d{1,2}\s*(?:den|-|toi)\s*\d{1,2}\/\d{1,2}/, /hom (nay|qua)/, /tuan (nay|hien tai|truoc|roi|\d{1,2})/, /thang (nay|hien tai|truoc|roi|\d{1,2})/,
      /nam (nay|hien tai)/, /\d{1,3} ngay( qua| gan day| gan nhat)?/, /(?:ngay )?\d{1,2}\/\d{1,2}/]
      .forEach(re => { const r = new RegExp(`(?<![a-z0-9])(?:${re.source})(?![a-z0-9])`); const x = r.exec(c.conLai()); if (x) c.danh(x.index, x.index + x[0].length); });
  }
  return { ky, tatCa: false };
}

// ---- Khái niệm nghiệp vụ: cụm từ => điều kiện lọc của 1 bảng ("quá hạn giao", "chưa nhập kho", "trễ hẹn"…) ----
interface KhaiNiem { bang: string; re: RegExp; ap: (tv: TruyVan, homNay: Date, m: RegExpExecArray) => void }
const SX = 'production_status_app';
const KHAI_NIEM: KhaiNiem[] = [
  // Quá hạn giao: qua ngày cần giao mà chưa nhập đủ
  { bang: SX, re: /(qua han|tre han|tre hen)( giao( hang)?)?|(giao|nhap kho) (tre|cham)|cham giao|tre giao/, ap: (tv, h) => { tv.loc.push({ cot: 'ngay_can_giao', op: 'nho_hon', gt: iso(h) }, { cot: 'gia_tri_con_lai', op: 'lon_hon', gt: 0 }); } },
  { bang: SX, re: /(con )?chua (nhap kho|nhap du|nhap|xong|hoan thanh)|con thieu/, ap: tv => { tv.loc.push({ cot: 'gia_tri_con_lai', op: 'lon_hon', gt: 0 }); } },
  // Không có kế hoạch: chưa nhập đủ mà không có KH nhập kho tháng lẫn tuần ("kế hoạc" = gõ thiếu chữ h)
  { bang: SX, re: /(khong|chua) (co )?(ke hoach?|kh)( nhap kho)?|ngoai ke hoach?|thieu ke hoach?/, ap: tv => { tv.loc.push({ cot: 'ngay_khnk_thang', op: 'rong' }, { cot: 'ngay_khnk_tuan', op: 'rong' }, { cot: 'gia_tri_con_lai', op: 'lon_hon', gt: 0 }); } },
  { bang: SX, re: /(da )?co (ke hoach?|kh)( nhap kho)?/, ap: tv => { tv.loc.push({ cot: 'gia_tri_con_lai', op: 'lon_hon', gt: 0 }); tv.loc.push({ cot: 'ngay_khnk_thang', op: 'co' }); } },
  { bang: SX, re: /chua (co )?phieu|chua tinh phieu/, ap: tv => { tv.loc.push({ cot: 'tinh_trang_phieu', op: 'bang', gt: 'CHƯA PHIẾU' }); } },
  { bang: SX, re: /(da )?(nhap du|nhap kho du|nhap xong)/, ap: tv => { tv.loc.push({ cot: 'gia_tri_con_lai', op: 'nho_hon_bang', gt: 0 }); } },
  { bang: 'vat_tu', re: /tre hen|qua hen|tre han|qua han|giao tre|giao cham|cham giao/, ap: (tv, h) => { tv.loc.push({ cot: 'ngay_du_kien_giao_hang_pmh_nhap', op: 'nho_hon', gt: iso(h) }, { cot: 'so_luong_con_lai', op: 'lon_hon', gt: 0 }); } },
  { bang: 'vat_tu', re: /chua ve|chua nhan( du)?|con thieu|chua giao/, ap: tv => { tv.loc.push({ cot: 'so_luong_con_lai', op: 'lon_hon', gt: 0 }); } },
  { bang: 'vat_tu', re: /(da )?(ve du|nhan du)/, ap: tv => { tv.loc.push({ cot: 'so_luong_con_lai', op: 'nho_hon_bang', gt: 0 }); } },
  { bang: 'ton_kho', re: /(?:ton )?(tren|hon|qua|lau hon|tu|it nhat) (\d{1,2}) thang/, ap: (tv, _h, m) => { tv.loc.push({ cot: 'so_thang_ton_kho', op: m[1] === 'tu' || m[1] === 'it nhat' ? 'lon_hon_bang' : 'lon_hon', gt: +m[2] }); } },
  { bang: 'ton_kho', re: /(ton )?lau nhat|ton lau|ton dong/, ap: tv => { tv.kieu = 'dong'; tv.cotXem = ['date', 'ma_id_sap', 'ten_cong_trinh', 'ten_san_pham', 'gia_tri', 'so_thang_ton_kho']; tv.sap = { cot: 5, giam: true }; } },
];
const reRanh = (re: RegExp) => new RegExp(`(?<![a-z0-9])(?:${re.source})(?![a-z0-9])`, 'g');

/** Lõi so khớp của 1 giá trị: bỏ dấu, bỏ số thứ tự đầu ("15. CHƯA TRIỂN KHAI" -> "chua trien khai", "806 - Gia công" -> "gia cong") */
const BO_SO_DAU = /^\d+(\.\d+)*\.?\s*(-\s*)?/;
const loiGt = (v: string) => boDau(v).replace(BO_SO_DAU, '').trim();
// Từ quá chung không coi là giá trị
const CHUNG = new Set(['khac', 'may', 'nao', 'bao', 'con', 'da', 'chua', 'co', 'khong', 'moi', 'cac', 'tong', 'so', 'lon', 'nho', 'han', 'ngay', 'tuan', 'thang', 'nam', 'huy', 'hang', 'mau', 'kho', 'nhap', 'xuat', 'ton', 'dang', 'xong']);
interface KhopGt extends Khop { bang: string; cot: string; v: string[] }
/** Mọi chỗ câu nói tới 1 giá trị trong từ điển (nguyên cụm, hoặc phần đầu trước dấu "-") */
function timGiaTri(c: Cau, td: TuDien, cumCam: string[]): KhopGt[] {
  // Chỗ trong câu là tên bảng / tên cột: giá trị chỉ được lấy khi phủ trọn và dài hơn ("nhập kho ĐB" > "nhập kho")
  const cam: Khop[] = cumCam.flatMap(k => c.tim(k));
  const ds = new Map<string, Array<{ bang: string; cot: string; v: string }>>();
  const them = (k: string, x: { bang: string; cot: string; v: string }) => {
    if (k.length < 3 || CHUNG.has(k) || /^[\d\s.,-]+$/.test(k)) return;
    const a = ds.get(k) ?? [];
    if (!a.some(y => y.bang === x.bang && y.cot === x.cot && y.v === x.v)) a.push(x);
    ds.set(k, a);
  };
  Object.entries(td.gt).forEach(([bang, cots]) => Object.entries(cots).forEach(([cot, vs]) => vs.forEach(v => {
    const k = loiGt(v);
    them(k, { bang, cot, v });
    const dau = k.split(/\s*[-–(/]\s*/)[0];
    if (dau !== k && dau.length >= 5) them(dau, { bang, cot, v });
  })));
  const out: KhopGt[] = [];
  [...ds.keys()].sort((a, z) => z.length - a.length).forEach(k => c.tim(k).forEach(h => {
    if (out.some(o => h.tu < o.den && o.tu < h.den)) return;
    if (cam.some(o => h.tu < o.den && o.tu < h.den && !(h.tu <= o.tu && h.den >= o.den && h.den - h.tu > o.den - o.tu))) return;
    // Lõi ngắn (≤ 4 chữ: "máy", "mộc", "kính"): phải gõ đúng dấu — "mấy" không phải công đoạn "MÁY"
    const goc = c.gocTu(h.tu, h.den).toLowerCase();
    const xs = ds.get(k)!.filter(x => k.length > 4 || x.v.toLowerCase().replace(BO_SO_DAU, '').trim().startsWith(goc));
    if (!xs.length) return;
    const nhom = new Map<string, KhopGt>();
    xs.forEach(x => {
      const key = `${x.bang}|${x.cot}`;
      const g = nhom.get(key) ?? { ...h, bang: x.bang, cot: x.cot, v: [] };
      g.v.push(x.v);
      nhom.set(key, g);
    });
    out.push(...nhom.values());
  }));
  return out;
}

export function hieuTruyVan(cau: string, dm: BangDM[], homNay: Date = new Date(), td?: TuDien): HieuTV | null {
  if (!dm.length || !cau.trim()) return null;
  const c = new Cau(cau);
  const boQua: string[] = [];
  const coBang = new Set(dm.map(x => x.id));

  // ---- 0. Khái niệm nghiệp vụ + giá trị trong câu (để chọn bảng: "chưa NHẬP KHO" không phải bảng nhập kho) ----
  const kn: Array<Khop & { k: KhaiNiem; m: RegExpExecArray }> = [];
  KHAI_NIEM.filter(k => coBang.has(k.bang)).forEach(k => {
    const re = reRanh(k.re);
    let x: RegExpExecArray | null;
    while ((x = re.exec(c.q))) {
      const tu = x.index, den = x.index + x[0].length;
      if (!kn.some(o => o.k.bang === k.bang && tu < o.den && o.tu < den)) kn.push({ tu, den, k, m: x });
    }
  });
  const cumCam = [...new Set(dm.flatMap(b => [...cumCua(b.ten, b.dn), ...b.cot.flatMap(x => cumCua(x.ten, x.dn))]))];
  const gtKhop = td ? timGiaTri(c, td, cumCam).filter(g => coBang.has(g.bang) && !kn.some(o => g.tu < o.den && o.tu < g.den)) : [];
  const biChe = (k: Khop) => [...kn, ...gtKhop].some(o => o.tu <= k.tu && o.den >= k.den);

  // ---- 1. Bảng: cụm dài nhất được gọi tên; không có thì đoán theo cột chỉ bảng đó có ----
  let bang: BangDM | null = null;
  let roBang = false;
  let tot: Khop | null = null;
  dm.forEach(b => cumCua(b.ten, b.dn).forEach(cum => c.tim(cum).forEach(k => {
    if (biChe(k)) return;
    if (!tot || k.den - k.tu > tot.den - tot.tu || (k.den - k.tu === tot.den - tot.tu && k.tu < tot.tu)) { tot = k; bang = b; }
  })));
  if (bang && tot) {
    roBang = true;
    const t: Khop = tot;
    // Cụm tên bảng nằm trong tên 1 cột của chính bảng ("ngày NHẬP KHO", "SỐ CÔNG NHÂN") => để dành cho cột
    const trongCot = (bang as BangDM).cot.some(x => cumCua(x.ten, x.dn).some(cum => c.tim(cum).some(k => k.tu <= t.tu && k.den >= t.den)));
    if (!trongCot) c.danh(t.tu, t.den);
  }
  // Không gọi tên bảng: khái niệm dài nhất quyết định bảng (giá trị trong câu cùng bảng thì cộng điểm)
  else if (kn.length) {
    const diem = (x: (typeof kn)[number]) => (x.den - x.tu) + (gtKhop.some(g => g.bang === x.k.bang) ? 100 : 0);
    bang = dm.find(x => x.id === [...kn].sort((a, z) => diem(z) - diem(a))[0].k.bang) ?? null;
  }
  else if (gtKhop.length) {
    // Giá trị của bảng sản xuất (tình trạng, khách hàng, nhóm sản phẩm…) => hỏi về hạng mục
    const uuTien = (id: string) => (id === SX ? 0 : 1);
    const g = [...gtKhop].sort((a, z) => (z.den - z.tu) - (a.den - a.tu) || uuTien(a.bang) - uuTien(z.bang))[0];
    bang = dm.find(x => x.id === g.bang) ?? null;
  }
  else {
    const dem = new Map<string, number>();
    dm.forEach(b => b.cot.forEach(x => cumCua(x.ten, x.dn).forEach(k => dem.set(k, (dem.get(k) ?? 0) + 1))));
    let diem = 0;
    dm.forEach(b => {
      let d = 0;
      b.cot.forEach(x => { const k = cumCua(x.ten, x.dn).find(p => (dem.get(p) ?? 0) <= 2 && p.length >= 5 && c.tim(p).length); if (k) d += k.length; });
      if (d > diem) { diem = d; bang = b; }
    });
  }
  // Không gọi tên bảng, không đoán được: câu có mã công trình / cột của bảng sản xuất ("CT070 ai là PC") => hỏi về hạng mục
  if (!bang) {
    const sx = dm.find(x => x.id === SX);
    const coMaCt = /(?<![a-z0-9])ct\s?\d{2,3}/.test(c.q);
    if (sx && (coMaCt || sx.cot.some(x => x.kieu !== 'so' && cumCua(x.ten, x.dn).some(k => c.tim(k).length)))) bang = sx;
  }
  if (!bang) return null;
  const b: BangDM = bang;

  const cotDu = cotMoRong(b, dm);
  // Cùng độ dài: cột của bảng trước cột lấy từ bảng sản xuất
  const cumCot = cotDu.flatMap(x => cumCua(x.ten, x.dn, x.sx ? x.id.slice(3) : x.id).map(cum => ({ cum, cot: x })))
    .sort((a, z) => z.cum.length - a.cum.length || Number(!!a.cot.sx) - Number(!!z.cot.sx));
  const cotTai = (i: number) => {
    for (const { cum, cot } of cumCot) { const k = c.batDau(cum, i); if (k) return { ...k, cot }; }
    return null;
  };
  const coCot = (id: string) => cotDu.find(x => x.id === id);
  const tv: TruyVan = { bang: b.id, kieu: 'tong', do: [], nhom: [], loc: [] };
  // Bảng chưa có câu trả lời mẫu (vật tư, điểm danh…) không cần đánh dấu ở đây: câu không khớp mẫu nào => tim_kiem => tự tra
  let phuc = false;

  // Khái niệm của đúng bảng này
  kn.filter(x => x.k.bang === b.id).forEach(x => { x.k.ap(tv, homNay, x.m); c.danh(x.tu, x.den); phuc = true; });
  // Giá trị trong câu => lọc đúng cột (cột của bảng; không có thì cột bảng sản xuất qua HEX)
  const locGt = new Map<string, string[]>();
  gtKhop.forEach(g => {
    if (!c.conTrong(g.tu, g.den)) return;
    let cot: string | null = null;
    if (g.bang === b.id || b.cot.some(x => x.id === g.cot)) cot = g.cot;
    else if (g.bang === SX && coCot(`sx:${g.cot}`)) cot = `sx:${g.cot}`;
    if (!cot) return;
    c.danh(g.tu, g.den);
    locGt.set(cot, [...new Set([...(locGt.get(cot) ?? []), ...g.v])]);
  });
  locGt.forEach((v, cot) => { tv.loc.push({ cot, op: 'bang', gt: v }); phuc = true; });

  // "những HEX nào", "các hạng mục nào" => liệt kê dòng
  const ds1 = reRanh(/(nhung|cac) (ma )?(hex|hang muc|pr|don)( nao)?|(hex|hang muc|pr) nao/).exec(c.conLai());
  if (ds1) { tv.kieu = 'dong'; c.danh(ds1.index, ds1.index + ds1[0].length); phuc = true; }
  // "bình quân mỗi ngày" => chia theo ngày rồi lấy trung bình
  const bq = reRanh(/(trung binh|binh quan) (moi |1 |mot )?(ngay|tuan|thang)|(moi|1|mot) (ngay|tuan|thang) (trung binh|binh quan)/).exec(c.conLai());
  if (bq) {
    const moc = bq[0].match(/ngay|tuan|thang/)![0] as Moc;
    tv.binhQuan = moc;
    tv.nhom.push(`${b.ngay}@${moc}`);
    c.danh(bq.index, bq.index + bq[0].length);
    phuc = true;
  }

  // ---- 2. Liệt kê / top / kể cả hủy ----
  const co = (re: RegExp) => { const m = new RegExp(`(?<![a-z0-9])(?:${re.source})(?![a-z0-9])`).exec(c.conLai()); if (m) c.danh(m.index, m.index + m[0].length); return m; };
  if (co(/liet ke|danh sach|chi tiet|cac dong|xem dong|nhung dong|list/)) { tv.kieu = 'dong'; phuc = true; }
  if (co(/(ke ca|tinh ca|gom ca|bao gom|gom) (cac )?(don |hang muc )?huy/)) { tv.gomHuy = true; phuc = true; }
  const top = co(/top\s*(\d{1,3})/);
  if (top) {
    tv.gioiHan = Math.min(500, +top[1]);
    phuc = true;
    // "top 10 công trình …" => chia theo công trình
    const k = cotTai(top.index + top[0].length);
    if (k && k.cot.kieu !== 'so' && tv.nhom.length < 2) { tv.nhom.push(k.cot.kieu === 'ngay' ? `${k.cot.id}@ngay` : k.cot.id); c.danh(k.tu, k.den); }
  }
  const itNhat = /(?<![a-z0-9])(it nhat|thap nhat|nho nhat)(?![a-z0-9])/.test(c.q) && !/\b(it nhat|toi thieu) \d/.test(c.q);

  // ---- 3. Nhóm: "theo X", "từng X", "X nào" ----
  const nhomMoc = (i: number): { den: number; id: string } | null => {
    const k = cotTai(i);
    if (k) {
      if (k.cot.kieu === 'ngay') {
        const sau = c.q.slice(k.den).match(/^\s*(?:theo\s+)?(ngay|tuan|thang|quy|nam)(?![a-z0-9])(?!\s*(\d|nay|truoc|roi|hien|qua))/);
        if (sau) return { den: k.den + sau[0].length, id: `${k.cot.id}@${sau[1]}` };
        return { den: k.den, id: `${k.cot.id}@ngay` };
      }
      return { den: k.den, id: k.cot.id };
    }
    for (const [tu, moc] of MOC_TU) {
      const m = c.batDau(tu, i);
      // "theo tháng" nhưng không phải "tháng 9 / tháng này"
      if (m && !/^\s*(\d|nay|truoc|roi|hien|qua)/.test(c.q.slice(m.den))) return { den: m.den, id: `${b.ngay}@${moc}` };
    }
    return null;
  };
  const reTheo = /(?<![a-z0-9])(chia theo|phan theo|theo tung|theo|tung|moi)\s+/g;
  let m: RegExpExecArray | null;
  while ((m = reTheo.exec(c.q)) && tv.nhom.length < 2) {
    if (!c.conTrong(m.index, m.index + m[0].length)) continue;
    const g = nhomMoc(m.index + m[0].length);
    if (!g) {
      // "theo người duyệt" mà bảng không có cột đó: báo lại thay vì lờ đi
      const sau = c.q.slice(m.index + m[0].length).match(/^[a-z0-9]+(?: [a-z0-9]+)?/);
      if (m[1] !== 'moi' && sau && !DUNG.test(sau[0]) && !/^\d/.test(sau[0])) {
        const ten = c.gocTu(m.index + m[0].length, m.index + m[0].length + sau[0].length);
        boQua.push(`bảng ${b.ten} không có cột "${ten}" để chia — chia được theo: ${b.cot.filter(x => x.kieu !== 'so').map(x => x.ten.toLowerCase()).slice(0, 8).join(', ')}…`);
        c.danh(m.index, m.index + m[0].length + sau[0].length);
        phuc = true;
      }
      continue;
    }
    c.danh(m.index, g.den);
    if (!tv.nhom.includes(g.id)) tv.nhom.push(g.id);
    // "theo xưởng và tháng"
    const va = c.q.slice(g.den).match(/^\s*(?:va|,|\+)\s*(?:theo\s+)?/);
    if (va && tv.nhom.length < 2) {
      const g2 = nhomMoc(g.den + va[0].length);
      if (g2) { c.danh(g.den, g2.den); if (!tv.nhom.includes(g2.id)) tv.nhom.push(g2.id); }
    }
  }
  // "ai là PC", "PC là ai", "PM của … là ai" => chia theo cột đó (liệt kê người)
  for (const { cum, cot } of cumCot) {
    if (tv.nhom.length >= 2 || cot.kieu === 'so' || cot.kieu === 'ngay') continue;
    [`ai la ${cum}`, `${cum} la ai`, `${cum} la nhung ai`, `nhung ai la ${cum}`].forEach(mau => c.tim(mau).forEach(k => {
      if (tv.nhom.length < 2 && !tv.nhom.includes(cot.id)) { tv.nhom.push(cot.id); c.danh(k.tu, k.den); phuc = true; }
    }));
  }
  // "xưởng nào", "công trình nào nhiều nhất"
  for (const { cum, cot } of cumCot) {
    if (tv.nhom.length >= 2) break;
    c.tim(`${cum} nao`).forEach(k => { if (tv.nhom.length < 2 && !tv.nhom.includes(cot.id) && cot.kieu !== 'so') { c.danh(k.tu, k.den); tv.nhom.push(cot.kieu === 'ngay' ? `${cot.id}@ngay` : cot.id); } });
  }
  if (tv.nhom.some(n => n !== 'xuong_chinh' && n !== 'ten_cong_trinh') || (tv.nhom.length && !DONG_CHAY.has(b.id))) phuc = true;

  // Giá trị cố định của cột ("quá hạn", "đã xử lý", "đang xử lý") => lọc đúng giá trị đó
  b.cot.forEach(x => (x.gt ?? []).forEach(v => {
    const k = boDau(v);
    if (k.length < 4) return;
    c.tim(k).forEach(h => { c.danh(h.tu, h.den); if (!tv.loc.some(l => l.cot === x.id)) tv.loc.push({ cot: x.id, op: 'bang', gt: v }); });
  }));

  // ---- 4. Mã công trình, HEX, xưởng ----
  const hc = (cotId: string, op: Op, gt: Loc['gt']) => { tv.loc.push({ cot: cotId, op, gt }); };
  const reCt = /(?<![a-z0-9])(?:(?:cong trinh|ct|du an|ma)\s+)?ct\s?(\d{2})[-_ ]?(\d{3})(?!\d)/g;
  const maCt: string[] = [];
  while ((m = reCt.exec(c.q))) { if (c.conTrong(m.index, m.index + m[0].length)) { maCt.push(`CT${m[1]}-${m[2]}`); c.danh(m.index, m.index + m[0].length); } }
  const reCtNgan = /(?<![a-z0-9])(?:(?:cong trinh|du an|ma)\s+)?ct\s?(\d{3})(?![\d-])/g;
  let nhieuCt = false;
  while ((m = reCtNgan.exec(c.q))) {
    if (!c.conTrong(m.index, m.index + m[0].length)) continue;
    const so = m[1];
    const ma = [...new Set((td?.ct ?? []).map(t => t.toUpperCase().match(new RegExp(`CT\\d{2}-${so}(?!\\d)`))?.[0]).filter((x): x is string => !!x))];
    // Không có trong từ điển: lọc theo đuôi "-070" (tên công trình luôn kết thúc bằng mã)
    maCt.push(...(ma.length ? ma : [`-${so}`]));
    if (ma.length > 1) nhieuCt = true;
    c.danh(m.index, m.index + m[0].length);
  }
  // Mã tắt trùng nhiều công trình (CT24-070, CT25-070): chia theo công trình để thấy rõ từng cái
  if (nhieuCt && coCot('ten_cong_trinh') && !tv.nhom.includes('ten_cong_trinh') && tv.nhom.length < 2) { tv.nhom.unshift('ten_cong_trinh'); phuc = true; }
  if (maCt.length) { if (coCot('ten_cong_trinh')) hc('ten_cong_trinh', 'chua', maCt); else boQua.push(`bảng ${b.ten} không có cột công trình (${maCt.join(', ')})`); }
  const hexes: string[] = [];
  const reHex = /(?<![0-9])\d{9,13}(?![0-9])/g;
  while ((m = reHex.exec(c.q))) { if (c.conTrong(m.index, m.index + m[0].length)) { hexes.push(m[0]); c.danh(m.index, m.index + m[0].length); } }
  // "hex 26081625, ..." đã dùng chữ "hex" làm tên cột => bỏ chữ đứng trước
  if (hexes.length) { c.tim('hex').forEach(k => c.danh(k.tu, k.den)); if (coCot('hex')) hc('hex', 'bang', [...new Set(hexes)]); else boQua.push(`bảng ${b.ten} không có cột HEX`); }
  const cotXuong = b.cot.find(x => x.kieu === 'xuong');
  const reXuong = /(?<![a-z0-9])(?:xuong|x\.?)\s*(\d{1,2}[a-z]{1,2}|khac)((?:\s*(?:,|va|\+|hoac)\s*(?:xuong\s*)?(?:\d{1,2}[a-z]{1,2}|khac))*)(?![a-z0-9])/g;
  const xuongs: string[] = [];
  while ((m = reXuong.exec(c.q))) {
    if (!c.conTrong(m.index, m.index + m[0].length)) continue;
    xuongs.push(m[1], ...(m[2].match(/\d{1,2}[a-z]{1,2}|khac/g) ?? []));
    c.danh(m.index, m.index + m[0].length);
  }
  // Mã xưởng đứng 1 mình ("nhập kho 4A tháng này")
  const reMaX = /(?<![a-z0-9])(\d{1,2}[a-z]{1,2})(?![a-z0-9])/g;
  while ((m = reMaX.exec(c.q))) {
    if (!c.conTrong(m.index, m.index + m[0].length) || /^\d+(ngay|n|h|k|tr|ty)$/.test(m[1])) continue;
    xuongs.push(m[1]); c.danh(m.index, m.index + m[0].length);
  }
  if (xuongs.length) {
    if (cotXuong) hc(cotXuong.id, 'bang', [...new Set(xuongs.map(x => x.toUpperCase()))]);
    else boQua.push(`bảng ${b.ten} không có cột xưởng`);
  }
  // Mẫu trả lời chỉ lọc xưởng / công trình cho bảng dòng chảy; bảng khác (tồn kho, sản xuất…) hoặc có phần bỏ qua => tự tra
  if (tv.loc.some(l => ['xuong_chinh', 'xuong', 'ten_cong_trinh', 'hex'].includes(l.cot)) && !DONG_CHAY.has(b.id)) phuc = true;
  if (boQua.length) phuc = true;

  // ---- 5. Kỳ (đọc trước phép lọc chữ để "tháng này" không lẫn vào giá trị) — trừ khi có ngày đi sau tên cột ngày ----
  const coLocNgay = cumCot.some(({ cum, cot }) => cot.kieu === 'ngay' && c.tim(cum).some(k => /^\s*(truoc|sau|tu|den|toi|<|>|<=|>=|=|la|trong)?\s*\d{1,2}[/-]\d{1,2}/.test(c.q.slice(k.den))));
  const { ky, tatCa } = coLocNgay ? { ky: null, tatCa: false } : docKyRong(c, homNay, KE_HOACH.has(b.id));
  // "so sánh tháng 9 và tháng 8", "tháng này so với tháng trước" => kỳ thứ 2
  let ky2: Ky | null = null;
  if (ky && /(?<![a-z0-9])(so sanh|so voi|voi|va|vs|sv)(?![a-z0-9])/.test(c.q)) {
    ky2 = docKyRong(c, homNay, KE_HOACH.has(b.id)).ky;
    if (ky2) { co(/so sanh|so voi|vs|sv/); phuc = true; }
  }

  // ---- 6. Phép tính + lọc theo cột ----
  const HAM_TRUOC: Array<[string, Ham | 'dem?']> = [
    ['tong cong', 'tong'], ['tong so', 'dem?'], ['tong', 'tong'], ['trung binh', 'tb'], ['binh quan', 'tb'], ['lon nhat', 'max'], ['cao nhat', 'max'],
    ['max', 'max'], ['nho nhat', 'min'], ['thap nhat', 'min'], ['min', 'min'], ['moi nhat', 'max'], ['gan nhat', 'max'], ['som nhat', 'min'], ['cu nhat', 'min'],
    ['dem so', 'dem?'], ['dem', 'dem?'], ['bao nhieu', 'dem?'], ['so luong', 'dem?'], ['so', 'dem?'], ['may', 'dem?'],
  ];
  const HAM_SAU: Array<[string, Ham]> = [['lon nhat', 'max'], ['cao nhat', 'max'], ['nho nhat', 'min'], ['thap nhat', 'min'], ['moi nhat', 'max'], ['gan nhat', 'max'], ['som nhat', 'min'], ['trung binh', 'tb'], ['binh quan', 'tb']];
  const themDo = (ham: Ham, cot?: CotDM) => {
    if (tv.do.some(d => d.ham === ham && d.cot === cot?.id)) return;
    if (ham === 'dem_khac' && cot && cot.kieu === 'so') ham = 'tong';
    if ((ham === 'tong' || ham === 'tb') && cot && cot.kieu !== 'so') ham = 'dem_khac';
    if ((ham === 'max' || ham === 'min') && cot && cot.kieu !== 'so' && cot.kieu !== 'ngay') ham = 'dem_khac';
    tv.do.push({ ham, ...(cot ? { cot: cot.id } : {}) });
  };
  // Đếm dòng: "bao nhiêu hạng mục / dòng / đơn / mã"
  const tenDong = boDau(b.dong).split(' ').filter(w => w.length > 2);
  const DEM_DONG = new Set(['dong', 'don', 'muc', 'phieu', 'ban ve', 'lan', 'vuong mac', 'van de', ...tenDong]);

  // Duyệt các cột được nhắc (dài trước, không chồng nhau)
  const nhac: Array<Khop & { cot: CotDM }> = [];
  cumCot.forEach(({ cum, cot }) => c.tim(cum).forEach(k => { if (!nhac.some(n => k.tu < n.den && n.tu < k.den)) nhac.push({ ...k, cot }); }));
  nhac.sort((a, z) => a.tu - z.tu);
  nhac.forEach(n => c.danh(n.tu, n.den));

  // Phép tính đứng trước cột
  const hamTruoc = (n: Khop): { ham: Ham | 'dem?'; tu: number } | null => {
    const truoc = c.q.slice(0, n.tu).replace(/\s+(cac|cua|nhung|gia tri)\s*$/, ' ').trimEnd();
    for (const [w, h] of HAM_TRUOC) if (truoc.endsWith(w) && /(^|[^a-z0-9])$/.test(truoc.slice(0, truoc.length - w.length))) return { ham: h, tu: truoc.length - w.length };
    return null;
  };
  const hamSau = (n: Khop): { ham: Ham; den: number } | null => {
    for (const [w, h] of HAM_SAU) { const k = c.batDau(w, n.den); if (k) return { ham: h, den: k.den }; }
    return null;
  };

  // Giá trị lọc đi sau cột
  const docLoc = (n: Khop & { cot: CotDM }, ketThuc: number): boolean => {
    const x = n.cot;
    let i = n.den;
    const sau = () => c.q.slice(i, ketThuc);
    const laSoNgay = x.kieu === 'so' || x.kieu === 'ngay';
    let op: Op | null = null;
    for (const [w, o] of laSoNgay ? OP_SO : OP_CHU) {
      const k = c.batDau(w, i);
      if (k && k.den <= ketThuc) { op = o; i = k.den; break; }
    }
    // "chứa" (có dấu) khác "chưa": bỏ dấu đều là "chua" => xem chữ gốc; "chưa …" để nguyên trong giá trị
    if (!op && !laSoNgay) {
      const k = c.batDau('chua', i);
      if (k && c.gocTu(k.tu, k.den).toLowerCase() === 'chứa') { op = 'chua'; i = k.den; }
    }
    if (op === 'rong' || op === 'co') {
      // "chưa có phiếu" không phải "để trống": chỉ hiểu là trống khi sau đó hết ý
      const sauOp = c.q.slice(i, ketThuc).trim();
      if (sauOp && !DUNG.test(sauOp)) return false;
      c.danh(n.tu, i); hc(x.id, op, undefined); return true;
    }
    if (laSoNgay) {
      const s = sau();
      // "từ A đến B"
      const doc1 = (t: string) => (x.kieu === 'ngay' ? (() => { const r = docNgay(t, homNay); return r ? { v: r.d as string | number, dai: r.dai } : null; })() : (() => { const r = docSo(t, x.tien); return r ? { v: r.n as string | number, dai: r.dai } : null; })());
      const a = doc1(s);
      if (!a) return false;
      let den = i + a.dai;
      const tiep = c.q.slice(den, ketThuc).match(/^\s*(den|toi|-)\s*/);
      if (tiep && (op === 'lon_hon_bang' || op === null)) {
        const b2 = doc1(c.q.slice(den + tiep[0].length, ketThuc));
        if (b2) { den += tiep[0].length + b2.dai; c.danh(n.tu, den); hc(x.id, 'trong_khoang', [a.v, b2.v]); return true; }
      }
      c.danh(n.tu, den);
      hc(x.id, op ?? 'bang', a.v);
      return true;
    }
    // Chữ: lấy tới từ dừng / dấu câu / phần đã hiểu (kỳ, xưởng…) / cột kế tiếp
    let het = ketThuc;
    for (let j = i; j < ketThuc; j++) if (c.dung[j]) { het = j; break; }
    const s = c.q.slice(i, het);
    const reTu = /\S+/g;
    let w: RegExpExecArray | null;
    let dau = -1, cuoi = -1;
    while ((w = reTu.exec(s))) {
      if (dau >= 0 && DUNG.test(s.slice(w.index))) break;
      const cat = w[0].search(/[,;?!]/);
      if (cat === 0) break;
      if (dau < 0) dau = w.index;
      cuoi = w.index + (cat > 0 ? cat : w[0].length);
      if (cat > 0) break;
    }
    if (dau < 0) return false;
    const gt = c.gocTu(i + dau, i + cuoi).replace(/^["'“]|["'”]$/g, '').trim();
    if (gt.length < 1 || (!op && DUNG.test(boDau(gt)))) return false;
    c.danh(n.tu, i + cuoi);
    hc(x.id, op ?? (x.kieu === 'xuong' || x.kieu === 'ma' ? 'bang' : 'chua'), gt);
    return true;
  };

  // Vị trí cột đã dùng vào phép tính / lọc / đếm (không đem đi chia nhóm nữa)
  const dungLam = new Set<number>();
  nhac.forEach((n, idx) => {
    const ketThuc = nhac[idx + 1]?.tu ?? c.q.length;
    const truocLen = tv.do.length + tv.loc.length;
    xuLyNhac(n, ketThuc);
    if (tv.do.length + tv.loc.length !== truocLen) dungLam.add(n.tu);
  });
  function xuLyNhac(n: Khop & { cot: CotDM }, ketThuc: number) {
    const truoc = hamTruoc(n);
    const sau = hamSau(n);
    if (truoc) {
      c.danh(truoc.tu, n.den);
      const cum = c.q.slice(n.tu, n.den);
      if (truoc.ham === 'dem?' && (DEM_DONG.has(cum) || cum === 'hang muc')) {
        // "số hạng mục": bảng sản xuất mỗi dòng 1 hạng mục; bảng khác đếm số HEX
        if (cum === 'hang muc' && b.id !== 'production_status_app' && coCot('hex')) themDo('dem_khac', coCot('hex'));
        else themDo('dem');
        return;
      }
      const h: Ham = truoc.ham === 'dem?' ? (n.cot.kieu === 'so' ? 'tong' : 'dem_khac') : truoc.ham;
      themDo(h, n.cot);
      if (!(h === 'tong' && n.cot.id === b.soChinh)) phuc = true;
      return;
    }
    if (sau) {
      c.danh(n.tu, sau.den);
      // "khách hàng nào có giá trị còn lại lớn nhất" = xếp hạng theo tổng, không phải giá trị lớn nhất 1 dòng
      if (tv.nhom.length && n.cot.kieu === 'so' && (sau.ham === 'max' || sau.ham === 'min')) {
        themDo('tong', n.cot);
        if (sau.ham === 'min') tv.sap = { cot: tv.nhom.length, giam: false };
      } else themDo(sau.ham, n.cot);
      phuc = true;
      return;
    }
    if (docLoc(n, ketThuc)) { if (!['ten_cong_trinh', 'xuong_chinh'].includes(n.cot.id) || !DONG_CHAY.has(b.id)) phuc = true; return; }
    // Cột số được nhắc không kèm gì: hiểu là cộng cột đó
    if (n.cot.kieu === 'so') { themDo('tong', n.cot); if (n.cot.id !== b.soChinh) phuc = true; }
  }

  // Tên công trình nói không kèm chữ "công trình" ("tồn kho của tây hồ view", "dự án Nam Phương"):
  // cụm từ 1–6 chữ còn lại nằm trong tên 1 công trình (từ điển tên chuẩn)
  const cotCt = cotDu.find(x => x.kieu === 'ct');
  if (td?.ct.length && cotCt && !tv.loc.some(l => l.cot === cotCt.id || l.cot === 'ma_cong_trinh')) {
    const tenCt = td.ct.map(t => ` ${boDau(t).replace(/[^a-z0-9]+/g, ' ')} `);
    const tu: Array<{ w: string; tu: number; den: number }> = [];
    const re = /[a-z0-9]+/g;
    let w: RegExpExecArray | null;
    const con = c.conLai();
    while ((w = re.exec(con))) tu.push({ w: w[0], tu: w.index, den: w.index + w[0].length });
    const DEM = new Set(['cua', 'cho', 'la', 'va', 'theo', 'o', 'tai', 'cong', 'trinh', 'du', 'an', 'con', 'bao', 'nhieu', 'lai', 'nhung', 'cac', 'co', 'khong', 'nao', 'tong', 'gia', 'tri', 'so', 'ty', 'tien']);
    let xong = false;
    for (let dai = Math.min(6, tu.length); dai >= 1 && !xong; dai--) {
      for (let i = 0; i + dai <= tu.length && !xong; i++) {
        const ds = tu.slice(i, i + dai);
        // Các chữ phải liền nhau trong câu (không cách bởi phần đã hiểu)
        if (ds.some((x, j) => j > 0 && x.tu - ds[j - 1].den > 1)) continue;
        if (DEM.has(ds[0].w) || DEM.has(ds[ds.length - 1].w)) continue;
        const cum = ds.map(x => x.w).join(' ');
        if (dai === 1 ? cum.length < 5 : cum.length < 6) continue;
        if (!tenCt.some(t => t.includes(` ${cum} `))) continue;
        hc(cotCt.id, 'chua', c.gocTu(ds[0].tu, ds[ds.length - 1].den));
        c.danh(ds[0].tu, ds[ds.length - 1].den);
        // Bỏ chữ "dự án / của" đứng ngay trước
        const truoc = /(?:du an|cong trinh|cua|o)\s*$/.exec(c.q.slice(0, ds[0].tu));
        if (truoc) c.danh(truoc.index, ds[0].tu);
        phuc = true;
        xong = true;
      }
    }
  }
  // "công trình nhập kho nhiều nhất" (không có "theo" / "nào") => chia theo cột chữ được nhắc mà chưa dùng
  if (!tv.nhom.length && tv.kieu === 'tong' && /(?<![a-z0-9])(nhieu nhat|lon nhat|cao nhat|it nhat|thap nhat|xep hang)(?![a-z0-9])/.test(c.q)) {
    const thua = nhac.find(n => n.cot.kieu !== 'so' && n.cot.kieu !== 'ngay' && !tv.loc.some(l => l.cot === n.cot.id) && !tv.do.some(d => d.cot === n.cot.id));
    if (thua) { tv.nhom.push(thua.cot.id); phuc = true; if (!tv.gioiHan) tv.gioiHan = 10; }
  }

  // Cột chữ được nhắc mà không kèm giá trị / phép tính => chia theo cột đó (trừ HEX, hạng mục, mã)
  if (tv.kieu === 'tong') {
    nhac.forEach(n => {
      if (tv.nhom.length >= 2 || !['chu', 'xuong', 'ct'].includes(n.cot.kieu) || n.cot.id === 'ten_hang_muc' || n.cot.id === 'sx:ten_hang_muc') return;
      if (tv.loc.some(l => l.cot === n.cot.id) || tv.do.some(d => d.cot === n.cot.id) || tv.nhom.includes(n.cot.id)) return;
      if (dungLam.has(n.tu)) return;
      tv.nhom.push(n.cot.id);
      phuc = true;
    });
  }

  // "bao nhiêu hạng mục / số dòng / mấy đơn" => đếm dòng
  const conLai = c.conLai();
  const demDong = /(?<![a-z0-9])(dem|bao nhieu|so|may|tong so|so luong)\s+([a-z ]+)/.exec(conLai);
  if (demDong && [...DEM_DONG].some(w => demDong[2].trim().startsWith(w))) themDo('dem');
  if (tv.do.some(d => d.ham !== 'tong' && d.ham !== 'dem')) phuc = true;
  if (!tv.do.length) {
    if (/(?<![a-z0-9])(dem|bao nhieu (dong|cai|lan)|so dong)(?![a-z0-9])/.test(conLai)) themDo('dem');
    else tv.do = b.mac.map(d => ({ ...d }));
  }

  // "giá trị (còn) chưa nhập kho": cộng giá trị còn lại, không phải trị giá đơn hàng
  if (b.id === SX && tv.loc.some(l => l.cot === 'gia_tri_con_lai' && l.op === 'lon_hon')) {
    tv.do = tv.do.map(d => (d.ham === 'tong' && d.cot === 'tri_gia_don_hang_tong' ? { ham: 'tong', cot: 'gia_tri_con_lai' } : d));
    tv.do = tv.do.filter((d, i) => tv.do.findIndex(x => x.ham === d.ham && x.cot === d.cot) === i);
  }

  // Sắp xếp: "ít nhất" => tăng dần theo phép tính đầu
  if (itNhat && tv.nhom.length && !tv.do.some(d => d.ham === 'min')) { tv.sap = { cot: tv.nhom.length, giam: false }; phuc = true; }

  // Liệt kê: thêm cột đang lọc vào bảng hiện
  if (tv.kieu === 'dong') {
    tv.do = [];
    tv.nhom = [];
  }

  // Kỳ
  let tenKy: string | undefined;
  if (ky) { tv.tu = iso(ky.tu); tv.den = iso(ky.den); tenKy = ky.ten; }
  // Không nói kỳ: bảng sự kiện lấy năm nay — trừ khi hỏi 1 HEX / công trình (xem trọn lịch sử)
  else if (!tatCa && !coLocNgay && !KHONG_KY_MAC_DINH.has(b.id) && !tv.nhom.some(n => n.includes('@nam'))
    && !tv.loc.some(l => l.cot === 'hex' || l.cot === 'ten_cong_trinh' || l.cot === 'ma_cong_trinh')) {
    const t = new Date(homNay.getFullYear(), 0, 1);
    tv.tu = iso(t); tv.den = iso(KE_HOACH.has(b.id) ? new Date(homNay.getFullYear(), 11, 31) : homNay);
    tenKy = `năm ${homNay.getFullYear()} (mặc định — thêm "tất cả" để bỏ kỳ)`;
  }
  if (tv.tu && tv.den && tv.tu > tv.den) { const x = tv.tu; tv.tu = tv.den; tv.den = x; }
  if (ky && !tenKy) tenKy = `${dd(ky.tu)} – ${dd(ky.den)}`;
  if (ky2) tv.soSanh = { tu: iso(ky2.tu < ky2.den ? ky2.tu : ky2.den), den: iso(ky2.tu < ky2.den ? ky2.den : ky2.tu), ten: ky2.ten };

  // Chữ của tên bảng (có thể chưa đánh dấu khi nằm trong tên cột) + "chưa" cuối câu (câu hỏi "…nhập kho chưa?") không tính
  const chuBang = new Set(cumCua(b.ten, b.dn).flatMap(x => x.split(' ')));
  const tuThua = c.conLai().replace(/(?<![a-z0-9])chua\s*[?.!]*\s*$/, '').match(/[a-z0-9]+/g) ?? [];
  const thua = tuThua.filter(w => w.length >= 2 && !TU_DEM.has(w) && !chuBang.has(w) && !/^\d+$/.test(w));
  return { tv, phuc, roBang, boQua, ky: tenKy, thua };
}

/** Trả lời bằng tự tra hay câu trả lời mẫu (traLoi.ts): mẫu làm tốt câu quen thuộc; câu có phép tính / chia / lọc mà mẫu
 *  không làm được, câu không khớp mẫu nào, hoặc người hỏi không có quyền của mẫu => tự tra */
export function nenTuTra(c: CauHoi, h: HieuTV | null, coMau: boolean): boolean {
  if (!h) return false;
  // "doanh thu tháng này": mẫu "doanh thu" là tiến độ cả năm — hỏi kỳ ngắn hơn thì là nhập kho của kỳ đó
  const doanhThuKy = c.y === 'tien_do_nam' && h.tv.bang === 'nhap_kho' && !!c.ky && !/^năm/.test(c.ky.ten);
  // Câu có kỳ mà mẫu không đọc được ("năm 2025", "quý 3", "tháng 9/2025") => mẫu sẽ lấy kỳ mặc định, sai kỳ
  const kyMauBoQua = !!h.ky && !c.ky && !h.ky.includes('mặc định');
  return h.phuc || doanhThuKy || kyMauBoQua || c.y === 'tim_kiem' || c.y === 'tro_giup' || !coMau;
}

/** "tổng giá trị nhập kho", "số HEX", "ngày PR mới nhất" — cùng cách đặt tên cột kết quả ở máy chủ (routes/hoiDap.ts tenDo) */
export function tenPhepTinh(b: BangDM, ham: Ham, cotId?: string): string {
  const c = b.cot.find(x => x.id === cotId);
  if (ham === 'dem' || !c) return `số ${b.dong}`;
  const ten = /^\p{Lu}{2}/u.test(c.ten) ? c.ten : c.ten.charAt(0).toLowerCase() + c.ten.slice(1);
  if (c.kieu === 'ngay' && (ham === 'max' || ham === 'min')) return `${ten} ${ham === 'max' ? 'mới nhất' : 'sớm nhất'}`;
  if (ham === 'dem_khac' && /^số /i.test(c.ten)) return ten;
  return `${({ tong: 'tổng', dem_khac: 'số', tb: 'trung bình', max: 'lớn nhất', min: 'nhỏ nhất' } as Record<string, string>)[ham]} ${ten}`;
}

/** Mô tả truy vấn bằng lời ("Nhập kho · tổng giá trị nhập kho · theo xưởng · lọc …") */
export function moTaTruyVan(tv: TruyVan, dm: BangDM[]): string {
  const b = dm.find(x => x.id === tv.bang);
  if (!b) return tv.bang;
  const cotDu = cotMoRong(b, dm);
  const ten = (id: string) => cotDu.find(x => x.id === id)?.ten ?? id;
  // Viết thường khi nối câu — giữ chữ viết tắt (PM, HEX, SL…)
  const thuong = (s: string) => (/^\p{Lu}{2}/u.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
  const phan: string[] = [`**${b.ten}**`];
  if (tv.kieu === 'dong') phan.push('liệt kê dòng');
  else phan.push(tv.do.map(d => tenPhepTinh(b, d.ham, d.cot)).join(', '));
  if (tv.nhom.length) phan.push(`theo ${tv.nhom.map(n => { const [id, moc] = n.split('@'); return moc ? (id === b.ngay ? ({ ngay: 'ngày', tuan: 'tuần', thang: 'tháng', quy: 'quý', nam: 'năm' } as Record<string, string>)[moc] : `${thuong(ten(id))} (${moc})`) : thuong(ten(id)); }).join(' và ')}`);
  const vn = (iso2: string) => iso2.split('-').reverse().join('/');
  const giaTri = (l: Loc) => {
    const ds = Array.isArray(l.gt) ? l.gt : l.gt === undefined ? [] : [l.gt];
    const c = cotDu.find(x => x.id === l.cot);
    return ds.map(v => (c?.kieu === 'ngay' ? vn(String(v)) : c?.tien && typeof v === 'number' ? `${Math.round(v / 10) / 100} tỷ` : `${v}`)).join(l.op === 'trong_khoang' ? ' – ' : ', ');
  };
  const tenLoc = (l: Loc) => {
    // Cột có giá trị cố định ("Quá hạn", "Đã xử lý"): chỉ cần hiện giá trị
    const x = cotDu.find(y => y.id === l.cot);
    if (l.op === 'bang' && x?.gt?.includes(String(l.gt))) return String(l.gt);
    return null;
  };
  if (tv.loc.length) phan.push(`lọc: ${tv.loc.map(l => tenLoc(l) ?? `${ten(l.cot)} ${({ bang: '=', khac: '≠', chua: 'chứa', khong_chua: 'không chứa', lon_hon: '>', lon_hon_bang: '≥', nho_hon: '<', nho_hon_bang: '≤', trong_khoang: 'từ', rong: 'để trống', co: 'có giá trị' } as Record<Op, string>)[l.op]}${l.op === 'rong' || l.op === 'co' ? '' : ` ${giaTri(l)}`}`).join('; ')}`);
  if (tv.tu || tv.den) phan.push(tv.tu === tv.den ? `ngày ${vn(tv.tu!)}` : `${tv.tu ? vn(tv.tu) : '…'} – ${tv.den ? vn(tv.den) : 'nay'}`);
  if (tv.soSanh) phan.push(`so với ${tv.soSanh.tu === tv.soSanh.den ? `ngày ${vn(tv.soSanh.tu)}` : `${vn(tv.soSanh.tu)} – ${vn(tv.soSanh.den)}`}`);
  if (tv.binhQuan) phan.push(`bình quân mỗi ${({ ngay: 'ngày', tuan: 'tuần', thang: 'tháng', quy: 'quý', nam: 'năm' } as Record<string, string>)[tv.binhQuan]}`);
  if (tv.gomHuy) phan.push('kể cả hạng mục hủy');
  if (tv.gioiHan) phan.push(`top ${tv.gioiHan}`);
  return phan.join(' · ');
}

// ---- NGỮ CẢNH: câu hỏi nối tiếp ("còn bao nhiêu hạng mục chưa nhập kho" sau câu về CT25-070) ----
/** Cột "đối tượng" của câu hỏi: công trình, HEX, xưởng, khách hàng, PM / PC */
const THUC_THE = ['ten_cong_trinh', 'ma_cong_trinh', 'hex', 'xuong_chinh', 'xuong', 'khach_hang', 'ten_pm', 'ten_pc'];
const goc = (id: string) => id.replace(/^sx:/, '');
/** Điều kiện lọc theo đối tượng của 1 truy vấn (để câu sau dùng lại) */
export const thucTheCua = (tv: TruyVan): Loc[] => tv.loc.filter(l => THUC_THE.includes(goc(l.cot)));

/**
 * Câu mới không nói đối tượng nào => dùng lại đối tượng câu trước (sửa thẳng h.tv). Trả mô tả phần lấy lại (để ghi
 * "Theo câu trước: …"), hoặc null nếu không lấy. Câu có "tất cả / toàn bộ / toàn nhà máy" = hỏi chung, không lấy.
 */
export function noiNguCanh(h: HieuTV, ngu: Loc[], dm: BangDM[], cau: string): string[] | null {
  if (!ngu.length || thucTheCua(h.tv).length) return null;
  if (/(?<![a-z0-9])(tat ca|toan bo|moi cong trinh|cac cong trinh|toan nha may|tong the|toan cong ty)(?![a-z0-9])/.test(boDau(cau))) return null;
  const b = dm.find(x => x.id === h.tv.bang);
  if (!b) return null;
  const cots = cotMoRong(b, dm);
  const them: Loc[] = [];
  const moTa: string[] = [];
  ngu.forEach(l => {
    const id = goc(l.cot);
    const c = cots.find(x => x.id === id) ?? cots.find(x => x.id === `sx:${id}`)
      ?? (id === 'xuong' || id === 'xuong_chinh' ? cots.find(x => x.kieu === 'xuong') : undefined);
    if (!c) return;
    them.push({ ...l, cot: c.id });
    moTa.push(`${c.ten} ${l.op === 'chua' ? 'chứa' : '='} ${Array.isArray(l.gt) ? l.gt.join(', ') : l.gt}`);
  });
  if (!them.length) return null;
  h.tv.loc.push(...them);
  h.phuc = true;
  // Hỏi về 1 công trình / HEX: xem trọn lịch sử, bỏ kỳ mặc định "năm nay"
  if (h.ky?.includes('mặc định') && them.some(l => ['ten_cong_trinh', 'ma_cong_trinh', 'hex'].includes(goc(l.cot)))) {
    delete h.tv.tu; delete h.tv.den; h.ky = undefined;
  }
  return moTa;
}
