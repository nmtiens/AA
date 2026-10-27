import { docKy, moVietTat, type CauHoi, type Ky } from './hieuCauHoi';
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
  /** Câu nói rõ phép tính (tổng / số / trung bình…) — không phải phép tính mặc định của bảng */
  doRo: boolean;
  /** Cột số được nhắc không kèm phép tính ("TĂNG CA bao nhiêu giờ") => cộng cột đó; câu nối tiếp thay phép tính câu trước */
  doNgam?: boolean;
  /** Tên bảng chỉ xuất hiện trong tên 1 cột của chính bảng ("nhóm VẬT TƯ") => không hẳn là gọi tên bảng (câu nối tiếp vẫn nối) */
  bangTrongCot?: boolean;
  /** Câu có khái niệm nghiệp vụ (quá hạn giao, chưa nhập kho…) — là câu hỏi đủ ý, không phải câu nối tiếp */
  khaiNiem?: boolean;
  /** Chữ đã tự sửa vì gõ sai ("phếu" -> "phieu") */
  suaChu?: string[];
  /**
   * Chữ hai nghĩa chưa dám đoán: gõ không dấu / sai dấu trùng 1 giá trị ("tu" = TỦ hay "từ", "da" = Da hay "đã").
   * Cửa sổ hỏi lại người dùng: mỗi lựa chọn là câu đã viết lại cho rõ (bấm để hỏi).
   */
  moHo?: Array<{ chu: string; lua: Array<{ nhan: string; cau: string }> }>;
  /** Nội bộ (bỏ đi trước khi trả): phần câu chưa hiểu, cùng độ dài câu đã gọn, chỗ đã hiểu thay bằng khoảng trắng */
  conChuaHieu?: string;
}

// Từ đệm / từ hỏi: còn sót cũng không làm đổi nghĩa câu
const TU_DEM = new Set(('ai co bao nhieu la cua cho toi tui minh em anh chi xem hay giup nao the gi duoc khong voi va cac nhung mot da dang roi '
  // khẩu ngữ: "theo xưởng ĐI", "GIỜ sao rồi", "RIÊNG 4A", "liệt kê RA", "còn NỮA", "ÔM nhiều hàng", "đơn mới VỀ"
  + 'di gio rieng ra nua om ve bay '
  + 'o tai trong tu den theo nhat it lon nho hon bang so tong tat ca hien nay luc cai con lai bi dc a ah nhe vay sao nhu oi ok thi ma de can muon '
  + 'biet hoi xin lam on vs hang muc don gia tri tien ty trieu thong tin so lieu bao gom hien tai luon tinh nhom nam o '
  // lời đệm đầu / cuối câu, từ nối của kỳ ("7 ngày qua"), từ chỉ mức độ ("cao / thấp nhất" đã đọc ở phần xếp hạng)
  + 'ad oi chut muon vay nhe nha ne ha qua do dat mo nhan cao thap nhieu it nhat toan sanh duoc roi ban cau nay giup tra cuu dau may '
  // khẩu ngữ: "top 3 THÔI", "chỉ LẤY mộc", "bao nhiêu NHỈ", "BÊN 4A", "về HẾT chưa", "kho đang GIỮ", "bao nhiêu NGƯỜI",
  // "xuất cho KHÁCH" (khách lẻ không phải cột khách hàng, cũng không phải tên PC).
  // Không vào đây: "khi" ("KHI NÀO" là cụm hỏi, đọc ở docCau; "nhắc tôi KHI … xong" phải còn là chữ chưa hiểu),
  // "no" ("của NÓ" đọc ở docCau; "khách hàng NỢ tiền" phải còn là chữ chưa hiểu)
  + 'thoi lay nhi ben het giu nguoi khach').split(' '));

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
const DUNG = /^(dau|nhe|nha|vay|giup|ha|nhi|con|chua nhan|da nhan|con thieu|chua ve|da ve|qua han|tre han|theo|va|voi|trong|tu|den|toi|thang|tuan|quy|nam|hom|ngay|cua|loc|nhung|khi|bao nhieu|tong|dem|nhieu nhat|it nhat|top|liet ke|danh sach|tat ca|toan bo|ke ca|gom|co bao|o xuong|xuong|cong trinh|hex|la bao|the nao|ra sao|nhu nao|nhieu|nao)\b/;
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
/** Kỳ cùng loại đang chạy của 1 kỳ ("tháng trước" -> tháng này, "năm 2025" -> năm nay) */
function kyDangChay(ten: string, homNay: Date): Ky | null {
  const t = boDau(ten.toLowerCase());
  const cau = /^tuan/.test(t) ? 'tuan nay' : /^thang/.test(t) ? 'thang nay' : /^quy/.test(t) ? 'quy nay' : /^nam/.test(t) ? 'nam nay' : /^(hom qua|ngay)/.test(t) ? 'hom nay' : null;
  return cau ? docKy(cau, homNay) : null;
}

function docKyRong(c: Cau, homNay: Date, tuongLai: boolean): { ky: Ky | null; tatCa: boolean; viTri: number } {
  const h = new Date(homNay.getFullYear(), homNay.getMonth(), homNay.getDate());
  const q = c.conLai();
  let viTri = -1;
  const danhRe = (re: RegExp) => { const m = re.exec(q); if (m) { c.danh(m.index, m.index + m[0].length); viTri = m.index; } return m; };
  if (danhRe(/(?<![a-z0-9])(tat ca|toan bo|tu truoc (toi|den) nay|moi luc|tu dau(?! (thang|tuan|nam|quy)))(?![a-z0-9])/)) return { ky: null, tatCa: true, viTri };
  const cat0 = (tu: Date, den: Date, ten: string): Ky => ({ tu, den: den > h && !tuongLai ? h : den, ten });
  const cat = cat0;
  let m = danhRe(/(?<![a-z0-9])thang (\d{1,2})(?:\s*[/-]\s*| nam )(20\d{2})(?![0-9])/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return { ky: cat(new Date(+m[2], +m[1] - 1, 1), new Date(+m[2], +m[1], 0), `tháng ${+m[1]}/${m[2]}`), tatCa: false, viTri };
  m = danhRe(/(?<![a-z0-9])quy ([1-4])(?: nam (20\d{2}))?(?![0-9])/);
  if (m) { const y = m[2] ? +m[2] : h.getFullYear(); const t = (+m[1] - 1) * 3; return { ky: cat(new Date(y, t, 1), new Date(y, t + 3, 0), `quý ${m[1]}/${y}`), tatCa: false, viTri }; }
  m = danhRe(/(?<![a-z0-9])quy (nay|hien tai)(?![a-z0-9])/);
  if (m) { const t = Math.floor(h.getMonth() / 3) * 3; return { ky: cat(new Date(h.getFullYear(), t, 1), h, `quý ${t / 3 + 1}/${h.getFullYear()}`), tatCa: false, viTri }; }
  m = danhRe(/(?<![a-z0-9])nam (20\d{2})(?![0-9])/);
  if (m) return { ky: cat(new Date(+m[1], 0, 1), new Date(+m[1], 11, 31), `năm ${m[1]}`), tatCa: false, viTri };
  m = danhRe(/(?<![a-z0-9])nam (truoc|ngoai|roi)(?![a-z0-9])/);
  if (m) { const y = h.getFullYear() - 1; return { ky: cat(new Date(y, 0, 1), new Date(y, 11, 31), `năm ${y}`), tatCa: false, viTri }; }
  const ky = docKy(q, homNay);
  if (ky && tuongLai) {
    // docKy cắt "tuần / tháng / năm này" tới hôm nay — kế hoạch thì lấy trọn kỳ
    if (/(?<![a-z0-9])tuan (nay|hien tai)/.test(q)) ky.den = new Date(ky.tu.getFullYear(), ky.tu.getMonth(), ky.tu.getDate() + 6);
    else if (/(?<![a-z0-9])thang (nay|hien tai)/.test(q)) ky.den = new Date(h.getFullYear(), h.getMonth() + 1, 0);
    else if (/(?<![a-z0-9])thang \d{1,2}(?![0-9])/.test(q)) ky.den = new Date(ky.tu.getFullYear(), ky.tu.getMonth() + 1, 0);
    else if (/(?<![a-z0-9])nam (nay|hien tai)/.test(q)) ky.den = new Date(h.getFullYear(), 11, 31);
  }
  if (ky) {
    [/(?:tu|từ)\s*\d{1,2}\/\d{1,2}\s*(?:den|-|toi)\s*\d{1,2}\/\d{1,2}/, /tu dau (thang|tuan|nam|quy)( nay)?( (toi|den) (gio|nay|hom nay|bay gio))?/, /hom (nay|qua)/, /tuan (nay|hien tai|truoc|roi|sau|toi|ke tiep|ke|\d{1,2})/, /thang (nay|hien tai|truoc|roi|sau|toi|ke tiep|ke|\d{1,2})/,
      /nam (nay|hien tai)/, /\d{1,3} ngay( qua| gan day| gan nhat)?/, /(?:ngay )?\d{1,2}\/\d{1,2}/]
      .some(re => {
        // Câu có 2 kỳ ("tháng 8 so với tháng này"): đánh dấu đúng chỗ của kỳ đã chọn, không phải chỗ khớp đầu tiên
        const r = new RegExp(`(?<![a-z0-9])(?:${re.source})(?![a-z0-9])`, 'g');
        const ds = [...c.conLai().matchAll(r)];
        const tuChon = +ky.tu;
        const cungNgay = (x: RegExpMatchArray) => { const k = docKy(x[0], homNay); return !!k && +k.tu === tuChon; };
        const x = ds.find(cungNgay) ?? ds[0];
        if (x && x.index !== undefined) { c.danh(x.index, x.index + x[0].length); viTri = x.index; }
        return !!x;
      });
  }
  return { ky, tatCa: false, viTri };
}

// ---- Khái niệm nghiệp vụ: cụm từ => điều kiện lọc của 1 bảng ("quá hạn giao", "chưa nhập kho", "trễ hẹn"…) ----
interface KhaiNiem {
  bang: string;
  re: RegExp;
  ap: (tv: TruyVan, homNay: Date, m: RegExpExecArray) => void;
  /** Câu gọi tên 1 trong các bảng này mà có khái niệm => vẫn là bảng của khái niệm ("NHẬP KHO so với kế hoạch" = KH-TH) */
  deBang?: string[];
  /** Không áp khi câu có kỳ ("có kế hoạch tuần này" = bảng kế hoạch tuần này, không phải hạng mục "có kế hoạch") */
  khongKhiCoKy?: boolean;
}
const SX = 'production_status_app';
/** Bảng phân tích KH-TH (kế hoạch – thực hiện theo tuần) */
const KT = 'phan_tich_kh_th';
/** Phép tính của câu hỏi KH-TH: kế hoạch + thực hiện (nhập kho tuần) để thấy đạt bao nhiêu */
const DO_KT = (): TruyVan['do'] => [{ ham: 'tong', cot: 'thanh_tien_ke_hoach' }, { ham: 'tong', cot: 'nhap_kho_tuan' }];
/**
 * Thời gian ở công đoạn (cột chữ theo bậc "2 TUẦN" … "7 TUẦN", "TỪ 8 TUẦN TRỞ LÊN"): "hơn N tuần" = các bậc ≥ N+1,
 * "từ N tuần" = các bậc ≥ N
 */
const bacTuan = (op: string, n: number): string[] => {
  const tu = op === 'tu' || op === 'it nhat' ? n : n + 1;
  const ds: string[] = [];
  for (let k = Math.max(tu, 2); k <= 7; k++) ds.push(`${k} TUẦN`);
  ds.push('TỪ 8 TUẦN TRỞ LÊN');
  return ds;
};
/** Vướng mắc "đang mở" = Mới + Đang xử lý (chưa xong) — câu trả lời mẫu vướng mắc (traLoi.ts) cũng đếm đúng tập này */
const VM_DANG_MO_GT = ['Mới', 'Đang xử lý'];
const VM_DANG_MO: Loc = { cot: 'status', op: 'bang', gt: VM_DANG_MO_GT };
const laLocVmDangMo = (l: Loc) => l.cot === 'status' && l.op === 'bang' && JSON.stringify(l.gt) === JSON.stringify(VM_DANG_MO_GT);
const KHAI_NIEM: KhaiNiem[] = [
  // BOT (thời hạn KH nhập kho tuần → tháng, cột tính sẵn nhom_bot — cùng quy tắc thẻ BOT trên web).
  // Đặt TRƯỚC "quá hạn giao" / "sắp đến hạn giao": "quá hạn KẾ HOẠCH" / "quá hạn BOT" khác "quá hạn GIAO"
  { bang: SX, re: /(qua han|tre han|tre|cham|tre hen) (kh|ke hoach|bot)( nhap kho| nk)?|qua han khnk/, ap: tv => { tv.loc.push({ cot: 'nhom_bot', op: 'bang', gt: ['1. Quá hạn KH'] }); } },
  // "phải nhập trong 2 tuần tới" = nhóm BOT ≤ 14 ngày
  { bang: SX, re: /sap (den|toi) han (kh|ke hoach)( nhap kho)?|con (duoi |it hon )?14 ngay (toi|den) (han )?(kh|ke hoach)|(phai|can) nhap( kho)? (trong )?(2 tuan|hai tuan|14 ngay) (toi|nua|tiep|sau)/, ap: tv => { tv.loc.push({ cot: 'nhom_bot', op: 'bang', gt: ['2. ≤ 14 ngày'] }); } },
  { bang: SX, re: /dat (kh|ke hoach) ky|cho (kh|ke hoach) (ky )?(tiep|sau)/, ap: tv => { tv.loc.push({ cot: 'nhom_bot', op: 'bang', gt: ['5. Đạt KH kỳ, chờ KH tiếp'] }); } },
  // Quá hạn giao: qua ngày cần giao mà chưa nhập đủ
  { bang: SX, re: /(?<!sap )(dang |bi )?tre(?! (ke hoach|kh|hen|han)(?![a-z]))( hang| han)?|(dang )?cham nhat|(?<!sap )(qua han|tre han|tre hen)(?! (kh|ke hoach))( giao( hang)?)?|(giao|nhap kho) (tre|cham)|cham giao|tre giao/, ap: (tv, h) => { tv.loc.push({ cot: 'ngay_can_giao', op: 'nho_hon', gt: iso(h) }, { cot: 'gia_tri_con_lai', op: 'lon_hon', gt: 0 }); } },
  // Sắp đến hạn giao: ngày cần giao trong 2 tuần tới mà chưa nhập đủ
  { bang: SX, re: /sap tre( han)?|sap (den|toi) (han|ngay) giao( hang)?|sap (phai )?giao( hang)?|sap (den|toi) han|sap het han/, ap: (tv, h) => { const t = new Date(h); t.setDate(t.getDate() + 14); tv.loc.push({ cot: 'ngay_can_giao', op: 'trong_khoang', gt: [iso(h), iso(t)] }, { cot: 'gia_tri_con_lai', op: 'lon_hon', gt: 0 }); } },
  // ("nk" = viết tắt nhập kho — moVietTat đã mở trước, giữ thêm ở đây cho chắc)
  { bang: SX, re: /(con )?chua (nhap kho|nhap du|nhap|nk|xong|hoan thanh)|con thieu/, ap: tv => { tv.loc.push({ cot: 'gia_tri_con_lai', op: 'lon_hon', gt: 0 }); } },
  // Không có kế hoạch: chưa nhập đủ mà không có KH nhập kho tháng lẫn tuần ("kế hoạc" = gõ thiếu chữ h)
  { bang: SX, re: /(khong|chua) (co )?(ke hoach?|kh)( nhap kho)?|ngoai ke hoach?|thieu ke hoach?/, ap: tv => { tv.loc.push({ cot: 'ngay_khnk_thang', op: 'rong' }, { cot: 'ngay_khnk_tuan', op: 'rong' }, { cot: 'gia_tri_con_lai', op: 'lon_hon', gt: 0 }); } },
  // ("tháng 11 CÓ KẾ HOẠCH nhập kho những công trình nào" = bảng kế hoạch của tháng 11, không phải hạng mục "có kế hoạch")
  { bang: SX, khongKhiCoKy: true, re: /(?!(da )?co (ke hoach?|kh)( nhap kho)? (thang|tuan|quy|nam nay|hom|tu \d|\d))(da )?co (ke hoach?|kh)( nhap kho)?/, ap: tv => { tv.loc.push({ cot: 'gia_tri_con_lai', op: 'lon_hon', gt: 0 }); tv.loc.push({ cot: 'ngay_khnk_thang', op: 'co' }); } },
  { bang: SX, re: /chua (co )?phieu|chua tinh phieu/, ap: tv => { tv.loc.push({ cot: 'tinh_trang_phieu', op: 'bang', gt: 'CHƯA PHIẾU' }); } },
  { bang: SX, re: /(da )?(nhap du|nhap kho du|nhap xong)/, ap: tv => { tv.loc.push({ cot: 'gia_tri_con_lai', op: 'nho_hon_bang', gt: 0 }); } },
  // "chưa triển khai BẢN VẼ" / "bản vẽ chưa triển khai": cột tình trạng bản vẽ (khác công đoạn "15. CHƯA TRIỂN KHAI" khi chỉ nói
  // "chưa triển khai"); khái niệm phủ trọn tên bảng "triển khai bản vẽ" nên bảng là Sản xuất
  { bang: SX, re: /(con )?chua (duoc )?trien khai ban ve|ban ve (con )?chua (duoc )?trien khai/, ap: tv => { tv.loc.push({ cot: 'tinh_trang_trien_khai_ban_ve', op: 'bang', gt: ['CHƯA TRIỂN KHAI'] }); } },
  // "còn bao nhiêu hạng mục ĐANG SẢN XUẤT / đang làm" = còn lại chưa nhập đủ
  { bang: SX, re: /con (bao nhieu |may |nhieu |nhung |cac |it )?(hang muc |cai |don |hex |mon |san pham )?(dang |chua )?(san xuat|lam|chay)(?! (toi|den) dau)/, ap: tv => { tv.loc.push({ cot: 'gia_tri_con_lai', op: 'lon_hon', gt: 0 }); } },
  // "nằm ở công đoạn HƠN 4 TUẦN rồi": thời gian ở công đoạn là chữ theo bậc => tập các bậc ≥ N+1 ("tuần rồi" ở đây không phải kỳ)
  // (cotKhaiNiem gọi `ap` với match giả không có groups => mặc định "hơn 0 tuần")
  { bang: SX, re: /((nam|dung|ket|ton|o|tai) )*(o |tai )?(cong doan |buoc |khau )?(?<op>hon|tren|qua|lau hon|tu|it nhat) (?<n>\d{1,2}) tuan( roi| nay| tro len)?/, ap: (tv, _h, m) => { tv.loc.push({ cot: 'so_ngay_cd_hien_tai', op: 'bang', gt: bacTuan(m.groups?.op ?? 'hon', +(m.groups?.n ?? 0)) }); } },
  // ---- KH-TH (kế hoạch – thực hiện theo tuần): "đạt bao nhiêu % kế hoạch", "so với kế hoạch", "vượt / ngoài kế hoạch",
  // "đúng kế hoạch hay rớt". Câu gọi "nhập kho" kèm các ý này là hỏi KH-TH, không phải bảng nhập kho.
  // (Không bắt "đạt kế hoạch chưa" — câu trả lời mẫu kế hoạch tuần / tiến độ tháng đã có sẵn %; "tỷ lệ … đúng kế hoạch" để nhờ AI)
  { bang: KT, deBang: ['nhap_kho'], re: /(dat|duoc|hoan thanh) (bao nhieu|may)( %| phan tram| pt)?( so voi| cua)? (ke hoach|kh)|(dat|duoc|hoan thanh) (%|phan tram) (ke hoach|kh)|(dat|hoan thanh) (ke hoach|kh) (bao nhieu|may) (%|phan tram)/, ap: tv => { tv.do = DO_KT(); } },
  // "tỷ lệ đạt kế hoạch": kế hoạch, thực hiện và phần đúng kế hoạch (tỷ lệ tính được theo cả 2 cách)
  { bang: KT, deBang: ['nhap_kho'], re: /(ti|ty) le (dat|hoan thanh) (ke hoach|kh)/, ap: tv => { tv.do = [...DO_KT(), { ham: 'tong', cot: 'dung_ke_hoach' }]; } },
  { bang: KT, deBang: ['nhap_kho'], re: /(thuc te |nhap kho |nhap |nk )?so (sanh )?voi (ke hoach|kh)(?! (giao|nam|san xuat))/, ap: tv => { tv.do = DO_KT(); } },
  { bang: KT, re: /vuot (ke hoach|kh)(?! (ky|nam))/, ap: tv => { tv.do = [{ ham: 'tong', cot: 'vuot_ke_hoach' }]; } },
  { bang: KT, re: /(nhap kho|nhap|nk) ngoai (ke hoach|kh)/, ap: tv => { tv.do = [{ ham: 'tong', cot: 'nhap_kho_ngoai_ke_hoach' }]; } },
  { bang: KT, re: /(dung|dat|theo) (ke hoach|kh) hay (rot|khong|chua|truot|tre|khong dat)|rot hay (dung|dat)( (ke hoach|kh))?/, ap: tv => { tv.nhom.push('tinh_trang_thuc_hien_ke_hoach'); } },
  { bang: 'vat_tu', re: /tre hen|qua hen|tre han|qua han|giao tre|giao cham|cham giao/, ap: (tv, h) => { tv.loc.push({ cot: 'ngay_du_kien_giao_hang_pmh_nhap', op: 'nho_hon', gt: iso(h) }, { cot: 'so_luong_con_lai', op: 'lon_hon', gt: 0 }); } },
  { bang: 'vat_tu', re: /chua ve|chua nhan( du)?|con thieu|chua giao/, ap: tv => { tv.loc.push({ cot: 'so_luong_con_lai', op: 'lon_hon', gt: 0 }); } },
  { bang: 'vat_tu', re: /(da )?(ve du|nhan du)/, ap: tv => { tv.loc.push({ cot: 'so_luong_con_lai', op: 'nho_hon_bang', gt: 0 }); } },
  // "PR chưa mua QUÁ 30 NGÀY rồi": số ngày sau trạng thái PR là tuổi PR (ngày PR trước hôm nay − N), không phải kỳ "30 ngày qua"
  { bang: 'vat_tu', re: /(?<=(?:chua mua|dang mua|chua ve|chua nhan|chua giao|tre hen|qua han|da mua) )(?:da |duoc |roi )?(?:qua|hon|tren|lau hon) (\d{1,3}) ngay(?: roi| nay)?/, ap: (tv, h, m) => { const d = new Date(h); d.setDate(d.getDate() - +m[1]); tv.loc.push({ cot: 'ngay_pr', op: 'nho_hon', gt: iso(d) }); } },
  // Tồn trên N tháng / N năm ("tồn lâu trên 1 năm" = > 12 tháng, không phải liệt kê tồn lâu nhất)
  { bang: 'ton_kho', re: /(?:ton )?(?:lau )?(tren|hon|qua|lau hon|tu|it nhat) (\d{1,2}) (thang|nam)/, ap: (tv, _h, m) => { tv.loc.push({ cot: 'so_thang_ton_kho', op: m[1] === 'tu' || m[1] === 'it nhat' ? 'lon_hon_bang' : 'lon_hon', gt: +m[2] * (m[3] === 'nam' ? 12 : 1) }); } },
  { bang: 'ton_kho', re: /(ton )?lau nhat|ton lau(?! (tren|hon|qua|tu|it nhat) \d)|ton dong/, ap: tv => { tv.kieu = 'dong'; tv.cotXem = ['date', 'ma_id_sap', 'ten_cong_trinh', 'ten_san_pham', 'gia_tri', 'so_thang_ton_kho']; tv.sap = { cot: 5, giam: true }; } },
  // ---- Vướng mắc: "đang mở / còn mở / chưa xong / chưa đóng" = chưa xử lý xong (Mới + Đang xử lý) — cùng cách đếm "đang mở" của
  // trang Vướng mắc (routes/vuongMac.ts stats.open = open + doing). Không có khái niệm này thì "vướng mắc đang mở theo xưởng"
  // đi tự tra đếm cả đã đóng (9 thay cho 2). "chưa xử lý" / "đang xử lý" / "quá hạn" đã là giá trị cố định của cột (is_resolved /
  // status / qua_han) nên không đưa vào đây.
  { bang: 'vuong_mac', re: /(dang|con|van con|hien dang|hien con) mo|chua (xong|dong|duoc dong|xu ly xong|giai quyet xong)|(con|dang) (treo|do dang|ton dong)/, ap: tv => { tv.loc.push({ ...VM_DANG_MO, gt: [...VM_DANG_MO_GT] }); } },
];
/** Câu có nói kỳ tháng / tuần / quý ("tháng 11", "tuần này", "tháng sau", "quý 4") */
const RE_CO_KY = /(?<![a-z0-9])(?:(?:thang|tuan) (?:nay|sau|toi|ke|truoc|roi|hien tai|\d{1,2})|quy (?:[1-4]|nay|sau|toi|truoc))(?![a-z0-9])/;
/** Câu nói kỳ NĂM / kế hoạch năm ("doanh thu năm nay đạt bao nhiêu kế hoạch"): là tiến độ năm, không phải KH-TH theo tuần */
const RE_KY_NAM = /(?<![a-z0-9])(?:nam (?:nay|20\d\d|truoc|ngoai|roi|sau|toi)|(?:ke hoach|kh|muc tieu|tien do) nam)(?![a-z0-9])/;
/** Cột ngày là HẠN trong tương lai: "gần nhất" = sớm nhất sắp tới (min), và chỉ tính phần còn phải làm */
const HAN_TUONG_LAI = new Set(['ngay_can_giao', 'han_khnk', 'bot_du_an', 'ngay_khnk_thang', 'ngay_khnk_tuan', 'ngay_du_kien_giao_hang_pmh_nhap', 'ngay_can_vat_tu']);
const CON_LAI_CUA: Record<string, Loc> = { [SX]: { cot: 'gia_tri_con_lai', op: 'lon_hon', gt: 0 }, vat_tu: { cot: 'so_luong_con_lai', op: 'lon_hon', gt: 0 } };
const reRanh = (re: RegExp) => new RegExp(`(?<![a-z0-9])(?:${re.source})(?![a-z0-9])`, 'g');

/** Lõi so khớp của 1 giá trị: bỏ dấu, bỏ số thứ tự đầu ("15. CHƯA TRIỂN KHAI" -> "chua trien khai", "806 - Gia công" -> "gia cong") */
const BO_SO_DAU = /^\d+(\.\d+)*(\.\s*|\s+-\s*|\s*-\s+)/;
const loiGt = (v: string) => boDau(v).replace(BO_SO_DAU, '').trim();
// Từ quá chung không coi là giá trị
const CHUNG = new Set(['khac', 'may', 'nao', 'bao', 'con', 'da', 'chua', 'co', 'khong', 'moi', 'cac', 'tong', 'so', 'lon', 'nho', 'han', 'ngay', 'tuan', 'thang', 'nam', 'huy', 'hang', 'mau', 'kho', 'nhap', 'xuat', 'ton', 'dang', 'xong']);
interface KhopGt extends Khop { bang: string; cot: string; v: string[] }
/** Giá trị trùng từ chỉ kỳ / tên bảng ("TUẦN", "THÁNG" của loại kế hoạch, "TỒN", "HỦY"): không lấy dù gõ đúng dấu */
const CAM_NGAN = new Set(['tuan', 'thang', 'nam', 'ngay', 'quy', 'ton', 'huy', 'kho', 'nhap', 'xuat', 'dang', 'mau', 'hang', 'con']);
/** Cột tên người: tên 1 chữ ("TIẾN", "YẾN") chỉ nhận khi có tên cột đứng trước ("PM Tiến") — "tiến độ", "tiến bộ plaza" */
const MO_HO = new Set(['tu', 'san', 'cua', 'han', 'may', 'ban', 'nguoi', 'da', 'go', 'ke', 'tran', 'hang', 'bao', 'hoan']);
const COT_NGUOI = new Set(['ten_pm', 'ten_pc', 'handler', 'created_by', 'nguoi_yeu_cau', 'nguoi_trien_khai']);
/** Giá trị viết thường còn dấu, bỏ số thứ tự đầu ("06. MÁY" -> "máy") */
const giaTriCoDau = (v: string) => v.toLowerCase().normalize('NFC').replace(BO_SO_DAU, '').trim();
/** Từ đếm dòng hay đứng sau "bao nhiêu" mà bỏ dấu trùng 1 giá trị ("dòng" / "ĐÓNG") */
const TU_DEM_DONG = new Set(['dong', 'don', 'lan', 'muc']);
/** Mọi chỗ câu nói tới 1 giá trị trong từ điển (nguyên cụm, hoặc phần đầu trước dấu "-") */
function timGiaTri(c: Cau, td: TuDien, cumCam: string[], cumBang: string[], moHo: KhopGt[] = []): KhopGt[] {
  // Chỗ trong câu là tên bảng / tên cột: giá trị chỉ được lấy khi phủ trọn và dài hơn ("nhập kho ĐB" > "nhập kho")
  const cam: Khop[] = cumCam.flatMap(k => c.tim(k));
  const ds = new Map<string, Array<{ bang: string; cot: string; v: string; ngan: boolean }>>();
  const them = (k: string, x0: { bang: string; cot: string; v: string }) => {
    if (k.length < 2 || /^[\d\s.,-]+$/.test(k)) return;
    // Lõi ngắn / trùng từ thường ("tủ", "đá", "hàn", "máy"): chỉ nhận khi gõ đúng cả dấu ("hạn" ≠ "hàn", "mấy" ≠ "máy")
    const x = { ...x0, ngan: k.length < 3 || CHUNG.has(k) };
    if (x.ngan && CAM_NGAN.has(k)) return;
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
  // Cả câu gõ không dấu: không phân biệt được "tủ / từ", "hàn / hạn"… — chỉ nhận giá trị ngắn không mơ hồ ("moc", "phoi")
  const khongDau = !/[\u0080-\uffff]/.test(c.goc.join(''));
  // Cụm thường chứa giá trị ngắn: "nhà MÁY" (không phải công đoạn MÁY)
  const camThem: Khop[] = ['nha may'].flatMap(k => c.tim(k));
  const nuotBang = (o: Khop) => cumBang.some(k => c.tim(k).some(t => o.tu <= t.tu && o.den >= t.den));
  [...ds.keys()].sort((a, z) => z.length - a.length).forEach(k => c.tim(k).forEach(h => {
    if (camThem.some(o => h.tu < o.den && o.tu < h.den)) return;
    // "trễ hẹn bao nhiêu DÒNG": chữ đếm sau "bao nhiêu / mấy / số" là từ đếm, không phải giá trị ("ĐÓNG")
    if (TU_DEM_DONG.has(k) && /(?<![a-z0-9])(bao nhieu|may|so|tong so|dem)\s*$/.test(c.q.slice(0, h.tu))) return;
    const chong = out.filter(o => h.tu < o.den && o.tu < h.den);
    if (chong.length && !(chong.every(nuotBang) && !nuotBang(h))) return;
    chong.forEach(o => out.splice(out.indexOf(o), 1));
    // Lõi ngắn (≤ 4 chữ: "máy", "mộc", "kính"): phải gõ đúng dấu — "mấy" không phải công đoạn "MÁY"
    const goc = c.gocTu(h.tu, h.den).toLowerCase().normalize('NFC');
    const xs = ds.get(k)!.filter(x => (x.ngan
      // Giá trị vốn không dấu ("Da") gõ trong câu có dấu ("vật tư da chưa về") cũng là gõ đúng dấu
      ? (goc === giaTriCoDau(x.v) && (!khongDau || /[\u0080-\uffff]/.test(goc))) || (khongDau && !MO_HO.has(k) && boDau(giaTriCoDau(x.v)) === k)
      : k.length > 4 || giaTriCoDau(x.v).startsWith(goc) || (khongDau && !MO_HO.has(k))));
    if (!xs.length) {
      // Lõi ngắn gõ không đúng dấu nhưng bỏ dấu thì trùng giá trị: chưa đoán, để hỏi lại ("tu" = TỦ hay "từ"?)
      const gan = ds.get(k)!.filter(x => k.length <= 4 && boDau(giaTriCoDau(x.v)) === k && !/[\u0080-\uffff]/.test(goc));
      const nhomMh = new Map<string, KhopGt>();
      gan.forEach(x => {
        const key = `${x.bang}|${x.cot}`;
        const g = nhomMh.get(key) ?? { ...h, bang: x.bang, cot: x.cot, v: [] };
        g.v.push(x.v);
        nhomMh.set(key, g);
      });
      moHo.push(...nhomMh.values());
      return;
    }
    // Chồng lên tên bảng / tên cột: chỉ nhận khi giá trị dài hơn hẳn ("tính PHIẾU SX ĐẠI TRÀ") hoặc đã khớp đúng dấu
    const chiNgan = xs.every(x => x.ngan);
    if (!chiNgan && cam.some(o => h.tu < o.den && o.tu < h.den && !(h.tu <= o.tu && h.den >= o.den && h.den - h.tu > o.den - o.tu) && !(h.den - h.tu > o.den - o.tu + 3))) return;
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

// ---- Tên công trình nói không kèm chữ "công trình" ("tồn kho của tây hồ view", "dự án Nam Phương") ----
const DEM_TEN_CT = new Set(['cua', 'cho', 'la', 'va', 'theo', 'o', 'tai', 'cong', 'trinh', 'du', 'an', 'con', 'bao', 'nhieu', 'lai', 'nhung', 'cac', 'co', 'khong', 'nao', 'tong', 'gia', 'tri', 'so', 'ty', 'tien']);
/**
 * Cụm 1–6 chữ liền nhau trong `con` (câu đã bỏ dấu, chỗ đã hiểu thay bằng khoảng trắng) nằm trong tên 1 công trình của từ điển
 * => vị trí cụm đó (cụm dài nhất trước). Không lấy cụm là tên bảng / cột (`cumCam`), từ đệm, "nhà máy", "công ty".
 */
function timTenCongTrinh(con: string, td: TuDien, cumCam: string[]): Khop | null {
  const tenCt = td.ct.map(t => ` ${boDau(t).replace(/[^a-z0-9]+/g, ' ')} `);
  const tu: Array<{ w: string; tu: number; den: number }> = [];
  const re = /[a-z0-9]+/g;
  let w: RegExpExecArray | null;
  while ((w = re.exec(con))) tu.push({ w: w[0], tu: w.index, den: w.index + w[0].length });
  for (let dai = Math.min(6, tu.length); dai >= 1; dai--) {
    for (let i = 0; i + dai <= tu.length; i++) {
      const ds = tu.slice(i, i + dai);
      // Các chữ phải liền nhau trong câu (không cách bởi phần đã hiểu)
      if (ds.some((x, j) => j > 0 && x.tu - ds[j - 1].den > 1)) continue;
      if (dai < 3 && (DEM_TEN_CT.has(ds[0].w) || DEM_TEN_CT.has(ds[ds.length - 1].w))) continue;
      const cum = ds.map(x => x.w).join(' ');
      if (cum.length < 6) continue;
      if (!tenCt.some(t => t.includes(` ${cum} `)) || cumCam.some(k => k.includes(cum)) || ['nha may', 'cong ty'].includes(cum)) continue;
      return { tu: ds[0].tu, den: ds[ds.length - 1].den };
    }
  }
  return null;
}

// ---- Sửa chữ gõ sai: chữ ≥ 4 ký tự không có trong từ vựng, cách 1 chữ cái so với 1 từ trong từ vựng => thay ----
const TU_THEM = ('hom nay qua tuan thang nam quy ngay truoc sau tu den toi so sanh voi va theo tung moi chia top liet ke danh sach chi tiet '
  + 'tong trung binh quan lon nho nhat cao thap nhieu it dem bao chua nhap xuat ton kho han tre hen giao phieu tinh ke hoach khong co '
  + 'lau ve nhan du con lai thieu hoan thanh dang da ai nao la cua the gi trien khai ban hang muc don cong trinh xuong cong doan').split(' ');
let tuVungNho: { dm: BangDM[]; td?: TuDien; s: Set<string> } | null = null;
function tuVung(dm: BangDM[], td?: TuDien): Set<string> {
  if (tuVungNho && tuVungNho.dm === dm && tuVungNho.td === td) return tuVungNho.s;
  const s = new Set<string>(TU_THEM);
  const them = (cum: string) => boDau(cum).split(/[^a-z0-9]+/).forEach(w => { if (w.length >= 2) s.add(w); });
  dm.forEach(b => { cumCua(b.ten, b.dn).forEach(them); b.cot.forEach(x => cumCua(x.ten, x.dn, x.id).forEach(them)); });
  if (td) { Object.values(td.gt).forEach(o => Object.values(o).forEach(vs => vs.forEach(them))); td.ct.forEach(them); }
  TU_DEM.forEach(w => s.delete(w));
  tuVungNho = { dm, td, s };
  return s;
}
/**
 * Chữ trong tên người (PM, PC, người xử lý…) mà không phải từ thường của danh mục: sửa chính tả không được biến chữ
 * thật thành tên người ("khách" ≠ PC "KHÁNH", "chênh" ≠ PM "chinh")
 */
let tenNguoiNho: { dm: BangDM[]; td?: TuDien; s: Set<string> } | null = null;
function tenNguoi(dm: BangDM[], td?: TuDien): Set<string> {
  if (tenNguoiNho && tenNguoiNho.dm === dm && tenNguoiNho.td === td) return tenNguoiNho.s;
  const thuong = new Set<string>(TU_THEM);
  const tach = (cum: string) => boDau(cum).split(/[^a-z0-9]+/).filter(w => w.length >= 2);
  dm.forEach(b => { cumCua(b.ten, b.dn).forEach(x => tach(x).forEach(w => thuong.add(w))); b.cot.forEach(x => cumCua(x.ten, x.dn, x.id).forEach(y => tach(y).forEach(w => thuong.add(w)))); });
  const s = new Set<string>();
  // (chữ vừa là tên vừa là từ thường — "Nhung", "Linh" — không cấm, để "nững" vẫn sửa được thành "những")
  if (td) Object.values(td.gt).forEach(cots => Object.entries(cots).forEach(([cot, vs]) => { if (COT_NGUOI.has(cot)) vs.forEach(v => tach(v).forEach(w => { if (w.length >= 3 && !thuong.has(w) && !TU_DEM.has(w)) s.add(w); })); }));
  tenNguoiNho = { dm, td, s };
  return s;
}
const cach1 = (a: string, b: string): boolean => {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
};
/**
 * @param con  phần câu chưa hiểu (HieuTV.conChuaHieu, cùng vị trí ký tự với `cau`): chỉ sửa chữ ở chỗ chưa hiểu —
 *             "khách" lẻ trong "xuất cho khách" có thể sửa, "khách" trong "theo khách hàng" đã hiểu thì giữ
 * @param camDich  chữ không được dùng làm kết quả sửa (tên người)
 */
function suaChinhTa(cau: string, tv: Set<string>, thua: Set<string> = new Set(), con?: string, camDich?: Set<string>, cho3 = true): { cau: string; suaChu: string[]; co3: boolean } {
  const suaChu: string[] = [];
  let co3 = false;
  const tu = cau.split(/(\s+)/);
  const conKy = con ? [...con] : null;
  let viTri = 0;
  const ra = tu.map(t => {
    const dau = viTri;
    viTri += [...t].length;
    const m = /^([^\p{L}\d]*)([\p{L}]+)([^\p{L}\d]*)$/u.exec(t);
    if (!m) return t;
    const w = boDau(m[2]);
    // Chữ có thật nhưng bộ đọc câu vẫn không hiểu ("xởng" -> "xong") cũng thử sửa
    if (w.length < (cho3 ? 3 : 4) || ((tv.has(w) || TU_DEM.has(w)) && !thua.has(w))) return t;
    // Chữ nằm trọn trong phần đã hiểu => không phải chữ cần sửa
    if (conKy) { const o = dau + [...m[1]].length; if (conKy.slice(o, o + [...m[2]].length).join('').trim() === '') return t; }
    // Ưu tiên: cùng chữ cái đầu, rồi gõ sót chữ ("nhiu" -> "nhiều", không phải "như")
    const diem = (x: string) => (x[0] === w[0] ? 2 : 0) + (x.length > w.length ? 1 : 0);
    let tot: string | null = null;
    for (const ds of [tv, TU_DEM]) for (const x of ds) {
      // Chữ 3 ký tự: chỉ nhận trường hợp gõ sót 1 chữ cái, cùng chữ đầu ("hag" -> "hang"; "khp" mơ hồ => để nguyên)
      if (w.length === 3 && (x.length !== 4 || x[0] !== w[0])) continue;
      if (camDich?.has(x)) continue;
      if (x.length >= 3 && cach1(w, x) && (!tot || diem(x) > diem(tot))) tot = x;
    }
    if (!tot) return t;
    if (w.length === 3) co3 = true;
    suaChu.push(`${m[2]} → ${tot}`);
    return m[1] + tot + m[3];
  });
  return { cau: ra.join(''), suaChu, co3 };
}

export function hieuTruyVan(cau0: string, dm: BangDM[], homNay: Date = new Date(), td?: TuDien): HieuTV | null {
  if (!dm.length || !cau0.trim()) return null;
  // Mở viết tắt ("bn" -> bao nhiêu, "hm" -> hạng mục) + gọn khoảng trắng TRƯỚC khi đọc: vị trí ký tự của Cau = vị trí
  // trong câu này (sửa chính tả lượt 2 dựa vào đó để chỉ sửa đúng chữ chưa hiểu)
  const cau = moVietTat(cau0).replace(/\s+/g, ' ').trim();
  const xong = (h: HieuTV | null) => { if (h) delete h.conChuaHieu; return h; };
  const h0 = docCau(cau, dm, homNay, td);
  if (h0 && !h0.thua.length) return xong(h0);
  // Còn chữ chưa hiểu: thử sửa chữ gõ sai ("phếu" -> "phieu", "sun goup" -> "sun group"); chỉ nhận bản sửa khi hiểu được
  // nhiều hơn — chữ thật mà danh mục không có ("giảm", "dự báo") phải còn là chữ chưa hiểu để nhờ AI / báo chưa hiểu
  // Lượt 1: chỉ sửa chữ không có trong từ vựng ("tước" -> "trước"); lượt 2: còn chữ có thật mà vẫn không hiểu ("xởng" -> "xong")
  // — lượt 2 không đổi chữ thật thành tên người ("khách" ≠ PC KHÁNH) và chỉ sửa đúng chỗ chưa hiểu (không thay mọi chỗ
  // trong câu); lượt 1 vẫn được sửa thành tên người ("PC LÊ ANH QUAG" -> QUANG)
  const tv = tuVung(dm, td);
  const camDich = tenNguoi(dm, td);
  let tot = h0, suaTot: string[] = [];
  let cauDaSua = cau;
  for (const luot2 of [false, true]) {
    // Từ thường dùng ("kế hoạch", "công") là chữ luật của câu trả lời mẫu — không đổi sang chữ khác
    const thua = new Set(luot2 ? (tot?.thua ?? []).filter(w => !TU_THEM.includes(w)) : []);
    if (luot2 && !thua.size) break;
    const con = luot2 ? tot?.conChuaHieu : undefined;
    const cam = luot2 ? camDich : undefined;
    let { cau: cauSua, suaChu, co3 } = suaChinhTa(cauDaSua, tv, thua, con, cam);
    if (!suaChu.length) continue;
    let h1 = docCau(cauSua, dm, homNay, td);
    // Sửa chữ 3 ký tự ("hàg" -> "hàng") chỉ nhận khi nhờ đó hiểu trọn câu; không thì sửa lại mà bỏ qua chữ 3 ký tự
    // ("lợi" trong "lợi nhuận" không được thành "loại")
    if (co3 && h1 && h1.thua.length) {
      ({ cau: cauSua, suaChu } = suaChinhTa(cauDaSua, tv, thua, con, cam, false));
      h1 = suaChu.length ? docCau(cauSua, dm, homNay, td) : null;
    }
    if (h1 && (!tot || h1.thua.length < tot.thua.length)) { tot = h1; suaTot = [...suaTot, ...suaChu]; cauDaSua = cauSua; }
  }
  return xong(tot && suaTot.length ? { ...tot, suaChu: suaTot } : h0);
}

function docCau(cau: string, dm: BangDM[], homNay: Date, td?: TuDien): HieuTV | null {
  const suaChu: string[] = [];
  const c = new Cau(cau);
  const boQua: string[] = [];
  const coBang = new Set(dm.map(x => x.id));

  // ---- 0. Khái niệm nghiệp vụ + giá trị trong câu (để chọn bảng: "chưa NHẬP KHO" không phải bảng nhập kho) ----
  const kn: Array<Khop & { k: KhaiNiem; m: RegExpExecArray }> = [];
  const coKy = RE_CO_KY.test(c.q);
  const coNam = RE_KY_NAM.test(c.q);
  KHAI_NIEM.filter(k => coBang.has(k.bang) && !(k.khongKhiCoKy && coKy) && !(k.bang === KT && coNam)).forEach(k => {
    const re = reRanh(k.re);
    const cotSo = dm.find(b => b.id === k.bang)?.cot.filter(x => x.kieu === 'so') ?? [];
    let x: RegExpExecArray | null;
    while ((x = re.exec(c.q))) {
      const tu = x.index, den = x.index + x[0].length;
      // "SỐ LƯỢNG còn thiếu", "TỔNG còn lại": phép tính + tên cột số (cùng chữ với khái niệm) => là cột để cộng, không phải lọc
      if (/(?<![a-z0-9])(so luong|tong|gia tri|tri gia)\s*$/.test(c.q.slice(0, tu)) && cotSo.some(y => cumCua(y.ten, y.dn, y.id).includes(x![0]))) continue;
      if (!kn.some(o => o.k.bang === k.bang && tu < o.den && o.tu < den)) kn.push({ tu, den, k, m: x });
    }
  });
  const cumCam = [...new Set(dm.flatMap(b => [...cumCua(b.ten, b.dn), ...b.cot.flatMap(x => cumCua(x.ten, x.dn))]))];
  const cumBang = [...new Set(dm.flatMap(b => cumCua(b.ten, b.dn)))];
  const moHoGt: KhopGt[] = [];
  const gtKhop = td ? timGiaTri(c, td, cumCam, cumBang, moHoGt).filter(g => coBang.has(g.bang) && !kn.some(o => g.tu < o.den && o.tu < g.den)) : [];
  const biChe = (k: Khop) => [...kn, ...gtKhop].some(o => o.tu <= k.tu && o.den >= k.den);

  // ---- 1. Bảng: cụm dài nhất được gọi tên; không có thì đoán theo cột chỉ bảng đó có ----
  let bang: BangDM | null = null;
  let roBang = false;
  let bangTrongCot = false;
  let tot: Khop | null = null;
  // Tên bảng nằm trong tên cột dài hơn của 1 bảng KHÁC cũng được gọi tên ("HẠNG MỤC theo tình trạng TRIỂN KHAI BẢN VẼ")
  // => đó là tên cột, không phải tên bảng
  // ("hạng mục" chỉ tính là gọi tên bảng khi tên cột dài hơn hẳn: "tình trạng triển khai bản vẽ", không phải "đã xuất kho")
  const trongCotBangKhac = (b: BangDM, cum: string, k: Khop) => dm.some(y => y.id !== b.id
    && y.cot.some(x => cumCua(x.ten, x.dn).some(cc => cc.length > cum.length && c.tim(cc).some(o => o.tu <= k.tu && o.den >= k.den)
      && cumCua(y.ten, y.dn).some(t => (t !== 'hang muc' || cc.length >= cum.length + 6) && c.tim(t).some(o => o.den <= k.tu || o.tu >= k.den)))));
  // `gia`: tên gọi suy ra ("kế hoạch" + kỳ, "phải nhập" + kỳ = bảng kế hoạch) — không phải cách gọi trong danh mục
  const ungVien: Array<{ b: BangDM; cum: string; k: Khop; gia?: boolean }> = [];
  dm.forEach(b => cumCua(b.ten, b.dn).forEach(cum => c.tim(cum).forEach(k => {
    if (biChe(k)) return;
    if (trongCotBangKhac(b, cum, k)) return;
    // "mới" và "mỗi" bỏ dấu đều là "moi": "đơn hàng MỖI ngày" không phải bảng "đơn hàng mới"
    if (/(?<![a-z])moi(?![a-z])/.test(cum) && /mỗi/i.test(c.gocTu(k.tu, k.den))) return;
    ungVien.push({ b, cum, k });
  })));
  // "KẾ HOẠCH tháng 11 bao nhiêu", "công trình nào có KẾ HOẠCH tuần này", "tuần 43 xưởng 8AB PHẢI NHẬP bao nhiêu": kế hoạch
  // (nhập kho) của 1 kỳ tháng / tuần = bảng kế hoạch sản xuất. Không tính "kế hoạch giao hàng" (cột tồn kho), "kế hoạch năm",
  // "hạn kế hoạch" (cột BOT), "còn phải nhập" (= còn lại); các cụm "không có / quá hạn / đạt … kế hoạch" đã là khái niệm (biChe)
  const khsx = dm.find(x => x.id === 'khsx');
  if (khsx && coKy) {
    c.tim('ke hoach').forEach(k => {
      if (biChe(k) || /^ (giao hang|nam|san xuat|nhap kho)(?![a-z])/.test(c.q.slice(k.den)) || /(?<![a-z0-9])(han|hoan thanh|dat|dung|rot|vuot|theo)\s*$/.test(c.q.slice(0, k.tu))) return;
      ungVien.push({ b: khsx, cum: 'ke hoach', k, gia: true });
    });
    // ("CHỈ TIÊU nhập kho tuần 43" = kế hoạch tuần đó; "chỉ tiêu" không kèm kỳ tháng / tuần vẫn là tiến độ năm)
    [...c.q.matchAll(/(?<![a-z0-9])(?:(?:phai|can) nhap(?: kho)?|chi tieu(?: nhap(?: kho)?)?)(?![a-z0-9])/g)].forEach(x => {
      const k = { tu: x.index!, den: x.index! + x[0].length };
      if (biChe(k) || /(?<![a-z0-9])con\s*$/.test(c.q.slice(0, k.tu))) return;
      ungVien.push({ b: khsx, cum: x[0], k, gia: true });
    });
  }
  // "CHỈ TIÊU năm nay còn thiếu bao nhiêu" (không kèm kỳ tháng / tuần / quý): chỉ tiêu = kế hoạch năm (câu trả lời mẫu tiến độ năm
  // làm được; không đọc thế thì "tiêu" thành chữ chưa hiểu và bảng đoán theo "còn thiếu")
  const khsxNam = dm.find(x => x.id === 'khsx_nam');
  if (khsxNam && !coKy) {
    [...c.q.matchAll(/(?<![a-z0-9])chi tieu(?: nhap(?: kho)?)?(?![a-z0-9])/g)].forEach(x => {
      const k = { tu: x.index!, den: x.index! + x[0].length };
      if (!biChe(k)) ungVien.push({ b: khsxNam, cum: x[0], k, gia: true });
    });
  }
  // "tuần 41 XUẤT bao nhiêu PHIẾU": "phiếu" sau "bao nhiêu / số / mấy" là từ đếm phiếu xuất / nhập, không phải bảng tính phiếu
  const demPhieu = (u: (typeof ungVien)[number]) => u.b.id === 'pthsp_full' && u.cum === 'phieu'
    && /(?<![a-z0-9])(bao nhieu|so|may|tong so)\s*$/.test(c.q.slice(0, u.k.tu)) && ungVien.some(v => v.b.id === 'nhap_kho' || v.b.id === 'xuat_kho');
  // "top 5 HẠNG MỤC nhập kho", "hạng mục nào của CT26-041 đã XUẤT KHO": câu gọi tên bảng khác thì "hạng mục" là cột
  // tên hạng mục của bảng đó, không phải bảng Sản xuất (hạng mục)
  const coBangKhac = ungVien.some(u => u.b.id !== SX);
  let tenGia = false;
  ungVien.filter(u => !(coBangKhac && u.b.id === SX && u.cum === 'hang muc') && !demPhieu(u)).forEach(({ b, k, gia }) => {
    if (!tot || k.den - k.tu > tot.den - tot.tu || (k.den - k.tu === tot.den - tot.tu && k.tu < tot.tu)) { tot = k; bang = b; tenGia = !!gia; }
  });
  const sx = dm.find(x => x.id === SX);
  if (bang && tot) {
    roBang = true;
    const t: Khop = tot;
    const tenCum = c.q.slice(t.tu, t.den);
    // Khái niệm đè tên bảng: "NHẬP KHO thực tế so với kế hoạch" là KH-TH (tên bảng cũ thành cột "nhập kho" của bảng mới)
    const de = kn.find(x => x.k.deBang?.includes((bang as BangDM).id));
    // Bảng dòng chảy (nhập / xuất / đơn hàng / bản vẽ / phiếu) gọi bằng tên mà câu lại nói khái niệm của hạng mục ("ĐƠN nào SẮP ĐẾN HẠN
    // GIAO mà CHƯA NHẬP KHO", "đơn hàng chưa có phiếu") và bảng đó không có khái niệm riêng => hỏi về hạng mục (bảng Sản xuất)
    const knSx = (bang as BangDM).id !== SX && (bang as BangDM).noiSx && kn.some(x => x.k.bang === SX) && !kn.some(x => x.k.bang === (bang as BangDM).id);
    // Tên bảng ngắn ("trị giá ĐƠN còn lại") mà câu nhắc cột SỐ chỉ bảng Sản xuất có ("còn lại", "đã nhập kho") => hạng mục
    // (cột chữ như khách hàng / PM nối được qua HEX nên không tính; "giá trị" là cách gọi chung nên cũng không tính)
    const cumBangTen = new Set((bang as BangDM).cot.flatMap(y => cumCua(y.ten, y.dn)));
    const cotRiengSx = sx && (bang as BangDM).id !== SX && (bang as BangDM).noiSx && tenCum.length <= 4
      && sx.cot.some(x => x.kieu === 'so' && cumCua(x.ten, x.dn).some(cum => cum.length >= 6 && !cumBangTen.has(cum) && c.tim(cum).length));
    // "capella XUẤT KHO LŨY KẾ bao nhiêu": lũy kế của 1 công trình = trọn lịch sử => cột đã xuất / đã nhập (lũy kế) của bảng Sản xuất
    const luyKeCt = sx && ['nhap_kho', 'xuat_kho'].includes((bang as BangDM).id) && new RegExp(`(?<![a-z0-9])${tenCum} luy ke(?![a-z0-9])`).test(c.q)
      && (/(?<![a-z0-9])ct\s?\d{2,3}/.test(c.q) || (!!td && !!timTenCongTrinh(c.q, td, cumCam)));
    if (de) bang = dm.find(x => x.id === de.k.bang) ?? bang;
    else if (sx && (knSx || cotRiengSx || luyKeCt)) bang = sx;
    else {
      // Cụm tên bảng nằm trong tên 1 cột của chính bảng ("ngày NHẬP KHO", "SỐ CÔNG NHÂN") => để dành cho cột
      const trongCot = !tenGia && (bang as BangDM).cot.some(x => cumCua(x.ten, x.dn).some(cum => c.tim(cum).some(k => k.tu <= t.tu && k.den >= t.den)));
      if (!trongCot) c.danh(t.tu, t.den);
      bangTrongCot = trongCot;
    }
  }
  // Không gọi tên bảng: khái niệm dài nhất quyết định bảng (giá trị trong câu cùng bảng thì cộng điểm)
  else if (kn.length) {
    // Cột riêng của bảng được nhắc ("nhà cung cấp" chỉ bảng vật tư có) => ưu tiên bảng đó
    const nhacCot = (id: string) => (dm.find(x => x.id === id)?.cot ?? []).some(x => cumCua(x.ten, x.dn).some(k => k.length >= 6 && c.tim(k).length && dm.filter(y => y.cot.some(z => cumCua(z.ten, z.dn).includes(k))).length === 1));
    const diem = (x: (typeof kn)[number]) => (x.den - x.tu) + (gtKhop.some(g => g.bang === x.k.bang) ? 100 : 0) + (nhacCot(x.k.bang) ? 50 : 0);
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
  const knBang = kn.filter(x => x.k.bang === b.id);
  knBang.forEach(x => { x.k.ap(tv, homNay, x.m); c.danh(x.tu, x.den); phuc = true; });
  // Giá trị trong câu => lọc đúng cột (cột của bảng; không có thì cột bảng sản xuất qua HEX)
  const locGt = new Map<string, string[]>();
  // Tên cột đứng ngay trước giá trị ("PC Lê Anh Quang"): ưu tiên cột đó + đánh dấu luôn tên cột (không đem đi chia nhóm)
  const truocCot = (g: KhopGt): number => {
    const x = cotDu.find(y => y.id === g.cot || y.id === `sx:${g.cot}`);
    if (!x) return -1;
    const truoc = c.q.slice(Math.max(0, g.tu - 30), g.tu).replace(/\s+(la|cua|ten)\s*$/, ' ').trimEnd();
    const p = cumCua(x.ten, x.dn, x.sx ? x.id.slice(3) : x.id).find(k => truoc.endsWith(k) && /(^|[^a-z0-9])$/.test(truoc.slice(0, truoc.length - k.length)));
    return p ? Math.max(0, g.tu - 30) + truoc.length - p.length : -1;
  };
  const gtXep = [...gtKhop].sort((a, z) => a.tu - z.tu || Number(truocCot(z) >= 0) - Number(truocCot(a) >= 0));
  const tenBang = roBang ? (tot as Khop | null) : null;
  gtXep.forEach(g => {
    // Giá trị gối lên đuôi tên bảng ("tính PHIẾU SX ĐẠI TRÀ"): chỉ xét phần sau tên bảng
    const tuXet = tenBang && g.tu < tenBang.den && g.den > tenBang.den ? tenBang.den : g.tu;
    if (!c.conTrong(tuXet, g.den)) return;
    // Tên 1 chữ có dấu / ngắn ("Tiến", "Yến") dễ trùng chữ thường; tên đăng nhập ("saudn") thì không
    const tenGoc = c.gocTu(g.tu, g.den);
    if (COT_NGUOI.has(g.cot) && !tenGoc.includes(' ') && (/[\u0080-\uffff]/.test(tenGoc) || tenGoc.length <= 4) && truocCot(g) < 0) return;
    let cot: string | null = null;
    if (g.bang === b.id || b.cot.some(x => x.id === g.cot)) cot = g.cot;
    else if (g.bang === SX && coCot(`sx:${g.cot}`)) cot = `sx:${g.cot}`;
    if (!cot) return;
    c.danh(g.tu, g.den);
    const tc = truocCot(g);
    if (tc >= 0) c.danh(tc, g.tu);
    // Bỏ trùng (cùng tên khác hoa thường / khoảng trắng)
    const da = new Set<string>();
    locGt.set(cot, [...(locGt.get(cot) ?? []), ...g.v].filter(v => { const k = boDau(v); if (da.has(k)) return false; da.add(k); return true; }));
  });
  locGt.forEach((v, cot) => { tv.loc.push({ cot, op: 'bang', gt: v }); phuc = true; });

  // "những HEX nào", "các hạng mục nào", "đơn mới nào", "cái nào", "dòng tồn kho nào" => liệt kê dòng
  const DS_RE = [
    /(nhung|cac) (ma )?(hex|hang muc|pr|po|don( hang)?( moi)?|vat tu|phieu|dong|vuong mac)( nao)?/,
    /(hex|hang muc|(?<!(khach|don|mat|ban) )hang|pr|po|vat tu|phieu|vuong mac|don( hang)?( moi)?|cai|ma) nao/,
    // "dòng … nào" ở đầu câu (chữ "dong" giữa câu có thể là "đóng")
    /^dong( [a-z]+){0,3} nao/,
  ];
  for (const re of DS_RE) {
    const ds1 = reRanh(re).exec(c.q);
    if (!ds1) continue;
    // "tồn kho theo công trình, CÁI NÀO nhiều nhất": xếp hạng nhóm, không phải liệt kê
    if (/^cai nao$/.test(ds1[0]) && /(?<![a-z0-9])(nhieu|it|lon|nho|cao|thap|yeu|kem) nhat(?![a-z0-9])/.test(c.q)) continue;
    tv.kieu = 'dong'; c.danh(ds1.index, ds1.index + ds1[0].length); phuc = true; break;
  }
  // "hôm qua CT25-070 có nhập kho GÌ KHÔNG": "có … gì (không)" cuối câu = hỏi xem có dòng nào => liệt kê dòng
  if (tv.kieu !== 'dong') {
    const gi = /(?<![a-z0-9])gi( khong| chua)?\s*[?.!]*\s*$/.exec(c.q);
    if (gi && /(?<![a-z0-9])co(?![a-z0-9])/.test(c.q.slice(0, gi.index))) { tv.kieu = 'dong'; c.danh(gi.index, gi.index + gi[0].length); phuc = true; }
  }
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
  co(/(dang )?(o|nam o) dau|thi the nao|the nao|ra sao|nhu the nao|tinh hinh|thi sao|tong cong|(duoc )?bao nhieu phan tram|phan tram|phu trach|dang phu trach/); // hỏi vị trí / tình hình: không phải tên cột "đang ở"
  // Khẩu ngữ không đổi nghĩa truy vấn: "xu hướng / diễn biến nhập kho theo tháng" (= theo tháng), "PM ĐƯA XUỐNG bao nhiêu
  // đơn" ("xuống" không phải xưởng) — đánh dấu mọi chỗ gặp
  // ("THỰC TẾ nhập được bao nhiêu" = nhập kho thật — chỉ là khẩu ngữ khi bảng không có cột gọi là "thực tế": vật tư có "về thực tế")
  { const r = cumCot.some(x => x.cum.includes('thuc te')) ? /(?<![a-z0-9])(?:dua xuong|xu huong|dien bien)(?![a-z0-9])/g : /(?<![a-z0-9])(?:dua xuong|xu huong|dien bien|thuc te)(?![a-z0-9])/g;
    let m2: RegExpExecArray | null; const s = c.conLai(); while ((m2 = r.exec(s))) c.danh(m2.index, m2.index + m2[0].length); }
  // "làm tới đâu rồi": hỏi tiến độ — có lọc hạng mục cụ thể thì liệt kê dòng (xem cuối docCau)
  const toiDau = co(/(lam |chay )?(toi|den) dau( roi)?/);
  co(/khi nao|luc nao|bao gio/); // "hạn giao gần nhất là KHI NÀO": cụm hỏi thời điểm
  co(/cua no|no thi sao/); // "nhập kho CỦA NÓ theo tháng": đại từ chỉ đối tượng câu trước
  // "lũy kế (từ đầu năm)": không nói kỳ thì là từ đầu năm tới nay — trừ "NHẬP / XUẤT KHO LŨY KẾ" ở bảng Sản xuất (là tên cột đã nhập / đã xuất)
  const luyKe = b.id === SX && /(?<![a-z0-9])(nhap|xuat) kho luy ke(?![a-z0-9])/.test(c.q) ? null : co(/luy ke( tu dau nam)?|tu dau nam (den nay|toi nay)?/);
  // "công trình nào đang KẸT Ở mộc": kẹt / tắc ở 1 công đoạn = đang ở công đoạn đó (giá trị đã đọc), không phải vướng mắc
  co(/(dang |bi )?(ket|tac|ket lai) (o|tai)(?=\s|$)/);
  // "trung bình MỖI ĐƠN HÀNG bao nhiêu tiền" => trung bình cột tiền của bảng (không phải bình quân theo ngày)
  // (tên bảng "đơn hàng" có thể đã được đánh dấu => chỉ còn khoảng trắng)
  const tbDong = co(/(trung binh|binh quan) (moi|1|mot)(\s+(don hang|don|hang muc|hex|phieu|ban ve|dong))?(\s+(la )?bao nhieu)?(\s+tien)?(?=\s|$)/);
  if (tbDong) {
    const tien = cotDu.find(x => x.tien && !x.sx);
    if (tien) { tv.do = [{ ham: 'tb', cot: tien.id }]; phuc = true; }
  }
  // "sun group CHI TIẾT THEO công trình": chia theo công trình (tổng từng nhóm), không phải liệt kê dòng
  co(/chi tiet(?= (theo|tung|moi)(?![a-z0-9]))/);
  if (co(/(liet ke|danh sach)( chi tiet| danh sach)?|(cho )?xem (chi tiet|danh sach)|chi tiet|cac dong|xem dong|nhung dong|list/)) { tv.kieu = 'dong'; phuc = true; }
  if (co(/(ke ca|tinh ca|gom ca|bao gom|gom) (cac )?(don |hang muc )?huy/)) { tv.gomHuy = true; phuc = true; }
  const top = co(/top\s*(\d{1,3})/);
  if (top) {
    tv.gioiHan = Math.min(500, +top[1]);
    phuc = true;
    // "top 10 công trình …" => chia theo công trình
    const k = cotTai(top.index + top[0].length);
    if (k && k.cot.kieu !== 'so' && tv.nhom.length < 2) { tv.nhom.push(k.cot.kieu === 'ngay' ? `${k.cot.id}@ngay` : k.cot.id); c.danh(k.tu, k.den); }
  }
  // "xưởng nào GIẢM nhập kho NHIỀU NHẤT so với tháng trước" => so 2 kỳ, xếp theo mức chênh (không phải theo số kỳ này)
  const chenh = co(/(sut giam|giam|sut|tut|tang truong|tang) (nhieu|manh) nhat|(sut giam|giam|sut|tang) (nhieu|manh)/)
    ?? (/(?<![a-z0-9])(nhieu nhat|manh nhat)(?![a-z0-9])/.test(c.q) ? co(/sut giam|giam|sut|tut|tang truong|tang/) : null);
  if (chenh) { tv.sapChenh = /^tang/.test(chenh[0]) ? 'tang' : 'giam'; phuc = true; }
  // "xưởng nào nhập kho YẾU NHẤT" = ít nhất (đánh dấu để không thành chữ chưa hiểu; "ít / thấp / nhỏ nhất" để nguyên vì
  // "giá trị thấp nhất" còn là phép tính min ở bước 6)
  const yeuNhat = co(/(yeu|kem|te) nhat/);
  const itNhat = (!!yeuNhat || /(?<![a-z0-9])(it nhat|thap nhat|nho nhat)(?![a-z0-9])/.test(c.q)) && !/\b(it nhat|toi thieu) \d/.test(c.q);

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
        // Không đánh dấu chữ đó: còn là chữ chưa hiểu => thử sửa gõ sai ("theo xưởg") / nhờ AI
        c.danh(m.index, m.index + m[0].length);
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
  // "tháng nào nhập kho cao nhất" => chia theo tháng
  { const mn = reRanh(/(ngay|tuan|thang|quy|nam) nao/).exec(c.conLai());
    if (mn && tv.nhom.length < 2) { tv.nhom.push(`${b.ngay}@${mn[1]}`); c.danh(mn.index, mn.index + mn[0].length); } }
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
    // "AI đang xử lý" là hỏi người xử lý (chia theo cột người, xem dưới), không phải lọc tình trạng "Đang xử lý"
    c.tim(k).filter(h => !/(?<![a-z0-9])ai\s*$/.test(c.q.slice(0, h.tu)))
      .forEach(h => { c.danh(h.tu, h.den); if (!tv.loc.some(l => l.cot === x.id)) tv.loc.push({ cot: x.id, op: 'bang', gt: v }); });
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
  // "số PR 1000234567", "PO 4500012345": số đứng sau PR / PO là mã PR / PO (không phải HEX); hỏi 1 mã => liệt kê dòng
  const rePrPo = /(?<![a-z0-9])(?:so |ma )?(pr|po)\s*[:#]?\s*(\d{6,12})(?![0-9])/g;
  while ((m = rePrPo.exec(c.q))) {
    const cotMa = coCot(`so_${m[1]}`);
    if (!cotMa) continue;
    hc(cotMa.id, 'bang', [m[2]]);
    c.danh(m.index, m.index + m[0].length);
    tv.kieu = 'dong';
    phuc = true;
  }
  const hexes: string[] = [];
  const reHex = /(?<![0-9])\d{9,13}(?![0-9])/g;
  while ((m = reHex.exec(c.q))) { if (c.conTrong(m.index, m.index + m[0].length)) { hexes.push(m[0]); c.danh(m.index, m.index + m[0].length); } }
  // "hex 26081625, ..." đã dùng chữ "hex" làm tên cột => bỏ chữ đứng trước
  if (hexes.length) { c.tim('hex').forEach(k => c.danh(k.tu, k.den)); if (coCot('hex')) hc('hex', 'bang', [...new Set(hexes)]); else boQua.push(`bảng ${b.ten} không có cột HEX`); }
  // Bảng không có cột xưởng nhưng nối được sang bảng sản xuất qua HEX (tồn kho): lọc theo xưởng của hạng mục (sx:xuong_chinh)
  const cotXuong = b.cot.find(x => x.kieu === 'xuong')
    ?? (b.noiSx && dm.find(x => x.id === SX)?.cot.some(x => x.id === 'xuong_chinh') ? { id: 'sx:xuong_chinh' } : undefined);
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
  if (tv.loc.some(l => ['xuong_chinh', 'xuong', 'ten_cong_trinh', 'hex'].includes(goc(l.cot))) && !DONG_CHAY.has(b.id)) phuc = true;
  if (boQua.length) phuc = true;

  // ---- 5. Kỳ (đọc trước phép lọc chữ để "tháng này" không lẫn vào giá trị) — trừ khi có ngày đi sau tên cột ngày ----
  const coLocNgay = cumCot.some(({ cum, cot }) => cot.kieu === 'ngay' && c.tim(cum).some(k => /^\s*(truoc|sau|tu|den|toi|<|>|<=|>=|=|la|trong)?\s*\d{1,2}[/-]\d{1,2}/.test(c.q.slice(k.den))));
  // "… so với cùng kỳ (năm ngoái / năm trước)": đánh dấu trước để "năm ngoái" không bị đọc thành kỳ
  const cungKy = reRanh(/(so (sanh )?voi )?cung ky( (nam ngoai|nam truoc|nam roi|nam))?/).exec(c.conLai());
  if (cungKy) c.danh(cungKy.index, cungKy.index + cungKy[0].length);
  const kq1 = coLocNgay ? { ky: null, tatCa: false, viTri: -1 } : docKyRong(c, homNay, KE_HOACH.has(b.id));
  let ky = kq1.ky;
  const tatCa = kq1.tatCa;
  // "so sánh tháng 9 và tháng 8", "tháng này so với tháng trước" => kỳ thứ 2 (kỳ nói trước trong câu là kỳ chính)
  let ky2: Ky | null = null;
  // Cùng kỳ năm trước = cùng ngày lùi 1 năm
  if (ky && cungKy) {
    const lui = (d: Date) => new Date(d.getFullYear() - 1, d.getMonth(), d.getDate());
    ky2 = { tu: lui(ky.tu), den: lui(ky.den), ten: 'cùng kỳ năm trước' };
    phuc = true;
  }
  if (ky && !ky2 && /(?<![a-z0-9])(so sanh|so voi|voi|va|vs|sv)(?![a-z0-9])/.test(c.q)) {
    const kq2 = docKyRong(c, homNay, KE_HOACH.has(b.id));
    ky2 = kq2.ky;
    if (ky2 && kq2.viTri >= 0 && kq2.viTri < kq1.viTri) { const x = ky; ky = ky2; ky2 = x; }
    if (ky2) { co(/so sanh|so voi|vs|sv/); phuc = true; }
  }
  // "… so với tháng trước" (chỉ nói kỳ đem so) => kỳ chính là kỳ cùng loại đang chạy (tháng này, tuần này, năm nay…)
  if (ky && !ky2 && kq1.viTri > 0 && /(?<![a-z0-9])so (sanh )?voi\s*$/.test(c.q.slice(0, kq1.viTri))) {
    const nay = kyDangChay(ky.ten, homNay);
    if (nay) { ky2 = ky; ky = nay; co(/so sanh|so voi/); phuc = true; }
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
  const sauLaGtKhac = (k: Khop, cot: CotDM) => gtKhop.some(g => g.tu >= k.den && g.tu - k.den <= 1 && g.cot !== cot.id && `sx:${g.cot}` !== cot.id);
  cumCot.forEach(({ cum, cot }) => c.tim(cum).forEach(k => { if (!nhac.some(n => k.tu < n.den && n.tu < k.den) && !sauLaGtKhac(k, cot)) nhac.push({ ...k, cot }); }));
  // "đang ở BƯỚC nào": "đang ở" chỉ là chữ nối khi ngay sau là tên 1 cột khác
  for (let i = nhac.length - 1; i >= 0; i--) {
    const n = nhac[i];
    if (c.q.slice(n.tu, n.den) === 'dang o' && cumCot.some(({ cot: x, cum }) => x.id !== n.cot.id && c.q.startsWith(cum, n.den + 1))) nhac.splice(i, 1);
  }
  nhac.sort((a, z) => a.tu - z.tu);
  // "SỐ LƯỢNG còn thiếu": "số lượng" đứng ngay trước 1 cột số khác là phép tính (cộng cột đó), không phải cột "số lượng"
  for (let i = nhac.length - 2; i >= 0; i--) {
    const n = nhac[i], sau = nhac[i + 1];
    if (sau.tu === n.den + 1 && sau.cot.kieu === 'so' && sau.cot.id !== n.cot.id && HAM_TRUOC.some(([w]) => w === c.q.slice(n.tu, n.den))) nhac.splice(i, 1);
  }
  nhac.forEach(n => c.danh(n.tu, n.den));

  // Phép tính đứng trước cột
  const hamTruoc = (n: Khop): { ham: Ham | 'dem?'; tu: number } | null => {
    const truoc = c.q.slice(0, n.tu).replace(/\s+(cac|cua|nhung|gia tri)\s*$/, ' ').trimEnd();
    for (const [w, h] of HAM_TRUOC) if (truoc.endsWith(w) && /(^|[^a-z0-9])$/.test(truoc.slice(0, truoc.length - w.length))) return { ham: h, tu: truoc.length - w.length };
    return null;
  };
  const hamSau = (n: Khop): { ham: Ham; den: number; chu: string } | null => {
    for (const [w, h] of HAM_SAU) { const k = c.batDau(w, n.den); if (k) return { ham: h, den: k.den, chu: w }; }
    return null;
  };
  /** Phép tính khi cột số được nhắc không kèm gì: theo phép tính mặc định của bảng (điểm danh: số công nhân / định biên = trung bình) */
  const hamMacDinh = (cot: CotDM): Ham => b.mac.find(d => d.cot === cot.id)?.ham
    ?? (b.id === 'diem_danh' && (cot.id === 'dinh_bien' || cot.id === 'so_luong_cong_nhan') ? 'tb' : 'tong');

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
      if (x.kieu !== 'ngay' && /^\s*(ngay|tuan|thang|nam|quy)(?![a-z])/.test(s.slice(a.dai))) return false;
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
    // "hạng mục TRÊN 2 TỶ đang ở xưởng 4A": ngưỡng tiền sau tên cột chữ là lọc theo cột tiền (đọc ở dưới), không phải tên hạng mục
    if (!op && /^(tren|lon hon|nhieu hon|vuot|hon|duoi|nho hon|it hon|khong qua|toi da|tu) \d/.test(boDau(gt))) return false;
    // "công trình CAPELLA ĐÃ xuất kho": bỏ bớt chữ cuối cho tới khi khớp 1 tên công trình có thật
    if (!op && goc(x.id) === 'ten_cong_trinh' && td?.ct.length) {
      const ten = td.ct.map(t => ` ${boDau(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `);
      const khop = (g: string) => ten.some(t => t.includes(` ${boDau(g).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `));
      let g2 = gt;
      while (!khop(g2) && g2.includes(' ')) g2 = g2.slice(0, g2.lastIndexOf(' ')).trim();
      if (khop(g2) && g2 !== gt) {
        const dai = c.q.slice(i + dau).indexOf(boDau(g2).toLowerCase()) >= 0 ? boDau(g2).length : cuoi - dau;
        c.danh(n.tu, i + dau + dai);
        hc(x.id, 'chua', g2);
        return true;
      }
    }
    // Cột mã (HEX, số PR…): giá trị phải có chữ số ("danh sách hex CÓ kế hoạch…" không phải HEX = "có")
    if (!op && x.kieu === 'ma' && !/\d/.test(gt)) return false;
    // "hạng mục TIẾN BỘ PLAZA chia theo…": chữ sau tên cột là tên công trình, không phải tên hạng mục
    if (!op && goc(x.id) === 'ten_hang_muc' && td?.ct.some(t => boDau(t).toLowerCase().includes(boDau(gt).toLowerCase()) && gt.length >= 4)) return false;
    c.danh(n.tu, i + cuoi);
    hc(x.id, op ?? (x.kieu === 'xuong' || x.kieu === 'ma' ? 'bang' : 'chua'), gt);
    return true;
  };

  // Vị trí cột đã dùng vào phép tính / lọc / đếm (không đem đi chia nhóm nữa)
  const dungLam = new Set<number>();
  let doNgam = false;
  // Có phép tính nói rõ ("SỐ LƯỢNG công nhân") — cột đó nhắc lại lần 2 không kèm gì ("đi làm") không làm mất tính "nói rõ"
  let doNoiRo = false;
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
      doNoiRo = true;
      if (!(h === 'tong' && n.cot.id === b.soChinh)) phuc = true;
      return;
    }
    if (sau) {
      doNoiRo = true;
      c.danh(n.tu, sau.den);
      // "khách hàng nào có giá trị còn lại lớn nhất" = xếp hạng theo tổng, không phải giá trị lớn nhất 1 dòng
      if (tv.nhom.length && n.cot.kieu === 'so' && (sau.ham === 'max' || sau.ham === 'min')) {
        themDo('tong', n.cot);
        if (sau.ham === 'min') tv.sap = { cot: tv.nhom.length, giam: false };
      } else if (sau.chu === 'gan nhat' && n.cot.kieu === 'ngay' && HAN_TUONG_LAI.has(goc(n.cot.id))) {
        // "HẠN GIAO GẦN NHẤT là khi nào": hạn sắp tới gần nhất = sớm nhất trong phần còn phải làm (chưa nhập đủ / chưa về đủ)
        themDo('min', n.cot);
        const cl = CON_LAI_CUA[b.id];
        if (cl && !tv.loc.some(l => l.cot === cl.cot)) tv.loc.push({ ...cl });
      } else themDo(sau.ham, n.cot);
      phuc = true;
      return;
    }
    if (docLoc(n, ketThuc)) { if (!['ten_cong_trinh', 'xuong_chinh'].includes(n.cot.id) || !DONG_CHAY.has(b.id)) phuc = true; return; }
    // Cột số được nhắc không kèm gì: hiểu là cộng (hoặc phép tính mặc định của bảng cho cột đó) — không tính là "nói rõ phép tính"
    if (n.cot.kieu === 'so') { themDo(hamMacDinh(n.cot), n.cot); if (!tv.do.some(d => d.cot !== n.cot.id)) doNgam = true; if (n.cot.id !== b.soChinh) phuc = true; }
  }

  // Ngưỡng tiền không nói cột ("đơn hàng trên 1 tỷ"): lọc theo cột tiền chính của bảng
  const nguong = /(?<![a-z0-9])(tren|lon hon|nhieu hon|vuot|hon|duoi|nho hon|it hon|khong qua|toi da|tu) (\d+(?:[.,]\d+)?) ?(ty|trieu|tr)(?![a-z0-9])/.exec(c.conLai());
  const cotTien = coCot(b.soChinh ?? '') ?? b.cot.find(x => x.tien);
  if (nguong && cotTien?.tien) {
    const OPN: Record<string, Op> = { tren: 'lon_hon', 'lon hon': 'lon_hon', 'nhieu hon': 'lon_hon', vuot: 'lon_hon', hon: 'lon_hon', duoi: 'nho_hon', 'nho hon': 'nho_hon', 'it hon': 'nho_hon', 'khong qua': 'nho_hon_bang', 'toi da': 'nho_hon_bang', tu: 'lon_hon_bang' };
    const so = Number(nguong[2].replace(',', '.'));
    hc(cotTien.id, OPN[nguong[1]], nguong[3] === 'ty' ? so * 1000 : so);
    c.danh(nguong.index, nguong.index + nguong[0].length);
    phuc = true;
  }
  // "ai triển khai nhiều bản vẽ nhất", "ai có nhiều vướng mắc quá hạn nhất" => chia theo cột người của bảng
  const NGUOI: Record<string, string> = { tkbv_full: 'nguoi_trien_khai', vuong_mac: 'handler', dht: 'ten_pm', [SX]: 'ten_pm', vat_tu: 'nguoi_yeu_cau' };
  if (!tv.nhom.length && /(?<![a-z0-9])ai(?![a-z0-9])/.test(c.q) && /(?<![a-z0-9])(nhieu|it|lon|cao)(?![a-z0-9]).*(?<![a-z0-9])nhat(?![a-z0-9])/.test(c.q) && NGUOI[b.id] && coCot(NGUOI[b.id])) {
    tv.nhom.push(NGUOI[b.id]);
    phuc = true;
  }
  // "AI ĐANG XỬ LÝ", "ai vẽ", "ai phụ trách": ai + động từ của bảng => chia theo cột người của bảng
  if (!tv.nhom.length && NGUOI[b.id] && coCot(NGUOI[b.id])) {
    const aiLam = reRanh(/ai (dang |da |se |la nguoi )?(xu ly|giai quyet|phu trach|theo doi|trien khai|ve|mua|lam|lo|tao|duyet)/).exec(c.conLai());
    if (aiLam) { tv.nhom.push(NGUOI[b.id]); c.danh(aiLam.index, aiLam.index + aiLam[0].length); phuc = true; }
  }

  // Tên công trình nói không kèm chữ "công trình" ("tồn kho của tây hồ view", "dự án Nam Phương"):
  // cụm từ 1–6 chữ còn lại nằm trong tên 1 công trình (từ điển tên chuẩn)
  const cotCt = cotDu.find(x => x.kieu === 'ct');
  if (td?.ct.length && cotCt && !tv.loc.some(l => l.cot === cotCt.id || l.cot === 'ma_cong_trinh')) {
    const k = timTenCongTrinh(c.conLai(), td, cumCam);
    if (k) {
      hc(cotCt.id, 'chua', c.gocTu(k.tu, k.den));
      c.danh(k.tu, k.den);
      // Bỏ chữ "dự án / của" đứng ngay trước
      const truoc = /(?:du an|cong trinh|cua|o)\s*$/.exec(c.q.slice(0, k.tu));
      if (truoc) c.danh(truoc.index, k.tu);
      phuc = true;
    }
  }
  // "công trình nhập kho nhiều nhất" (không có "theo" / "nào") => chia theo cột chữ được nhắc mà chưa dùng
  if (!tv.nhom.length && tv.kieu === 'tong' && /(?<![a-z0-9])(nhieu nhat|lon nhat|cao nhat|it nhat|thap nhat|yeu nhat|kem nhat|te nhat|xep hang)(?![a-z0-9])/.test(c.q)) {
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

  // "bao nhiêu hạng mục / số dòng / mấy đơn" => đếm dòng (đánh dấu chữ đếm "dòng / đơn" để không thành chữ chưa hiểu)
  const conLai = c.conLai();
  const demDong = /(?<![a-z0-9])(dem|bao nhieu|so|may|tong so|so luong)\s+([a-z ]+)/.exec(conLai);
  if (demDong) {
    const sauDem = demDong[2].trim();
    const tuDem = [...DEM_DONG].sort((a, z) => z.length - a.length).find(w => new RegExp(`^${esc(w)}(?![a-z0-9])`).test(sauDem));
    if (tuDem) {
      // "xuất BAO NHIÊU PHIẾU" ở bảng có cột số phiếu: đếm số phiếu khác nhau, không phải đếm dòng
      const soPhieu = tuDem === 'phieu' ? coCot('so_phieu') : undefined;
      if (soPhieu) themDo('dem_khac', soPhieu); else themDo('dem');
      const viTri = demDong.index + demDong[0].length - demDong[2].length;
      c.danh(viTri, viTri + tuDem.length);
    }
  }
  if (tv.do.some(d => d.ham !== 'tong' && d.ham !== 'dem')) phuc = true;
  const doRo = tv.do.length > 0 && (doNoiRo || !doNgam);
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

  // "tủ áo của tây hồ view bên 4A LÀM TỚI ĐÂU rồi": hỏi tiến độ một nhóm hạng mục cụ thể (công trình + lọc khác, hoặc lọc
  // không phải xưởng) => liệt kê dòng. Chỉ nói công trình / HEX ("CT25-070 làm tới đâu rồi", "hex … tới đâu rồi") hoặc
  // chỉ xưởng thì để câu trả lời mẫu
  if (toiDau && b.id === SX && tv.kieu === 'tong' && !tv.nhom.length) {
    const locKhac = tv.loc.filter(l => !['ten_cong_trinh', 'ma_cong_trinh', 'hex'].includes(goc(l.cot)));
    if (locKhac.length && (locKhac.length < tv.loc.length || locKhac.some(l => !/^xuong/.test(goc(l.cot))))) { tv.kieu = 'dong'; phuc = true; }
  }

  // Liệt kê: thêm cột đang lọc vào bảng hiện
  if (tv.kieu === 'dong') {
    tv.do = [];
    tv.nhom = [];
  }

  // Kỳ
  let tenKy: string | undefined;
  // Vướng mắc lọc theo tình trạng ("chưa xử lý", "đang xử lý", "quá hạn") là câu hỏi trạng thái hiện tại => không kỳ
  const vmTrangThai = b.id === 'vuong_mac' && tv.loc.some(l => ['is_resolved', 'status', 'qua_han'].includes(l.cot));
  if (ky) { tv.tu = iso(ky.tu); tv.den = iso(ky.den); tenKy = ky.ten; }
  // Không nói kỳ: bảng sự kiện lấy năm nay — trừ khi hỏi 1 HEX / công trình (xem trọn lịch sử)
  else if (!tatCa && !coLocNgay && !KHONG_KY_MAC_DINH.has(b.id) && !vmTrangThai && !tv.nhom.some(n => n.includes('@nam'))
    && !tv.loc.some(l => l.cot === 'hex' || l.cot === 'ten_cong_trinh' || l.cot === 'ma_cong_trinh')) {
    const t = new Date(homNay.getFullYear(), 0, 1);
    tv.tu = iso(t); tv.den = iso(KE_HOACH.has(b.id) ? new Date(homNay.getFullYear(), 11, 31) : homNay);
    tenKy = `năm ${homNay.getFullYear()} (mặc định — thêm "tất cả" để bỏ kỳ)`;
  }
  if (tv.tu && tv.den && tv.tu > tv.den) { const x = tv.tu; tv.tu = tv.den; tv.den = x; }
  if (ky && !tenKy) tenKy = `${dd(ky.tu)} – ${dd(ky.den)}`;
  // "lũy kế" không nói kỳ => từ đầu năm tới nay
  if (luyKe && !ky && !KE_HOACH.has(b.id)) { tv.tu = iso(new Date(homNay.getFullYear(), 0, 1)); tv.den = iso(homNay); tenKy = `lũy kế từ đầu năm ${homNay.getFullYear()}`; }
  if (ky2) tv.soSanh = { tu: iso(ky2.tu < ky2.den ? ky2.tu : ky2.den), den: iso(ky2.tu < ky2.den ? ky2.den : ky2.tu), ten: ky2.ten };
  // "giảm nhiều nhất" mà không nói so với kỳ nào => so với kỳ liền trước (kỳ bắt đầu ngày 1 => trọn tháng trước)
  if (tv.sapChenh && !tv.soSanh && tv.tu && tv.den) {
    const t = new Date(`${tv.tu}T00:00:00`), d = new Date(`${tv.den}T00:00:00`);
    const truoc = t.getDate() === 1
      ? { tu: new Date(t.getFullYear(), t.getMonth() - 1, 1), den: new Date(t.getFullYear(), t.getMonth(), 0) }
      : { tu: new Date(t.getTime() - (d.getTime() - t.getTime()) - 86400000), den: new Date(t.getTime() - 86400000) };
    tv.soSanh = { tu: iso(truoc.tu), den: iso(truoc.den), ten: 'kỳ trước' };
  }

  // Chữ của tên bảng (có thể chưa đánh dấu khi nằm trong tên cột) + "chưa" cuối câu (câu hỏi "…nhập kho chưa?") không tính
  const chuBang = new Set(cumCua(b.ten, b.dn).flatMap(x => x.split(' ')));
  const tuThua = c.conLai().replace(/(?<![a-z0-9])chua\s*[?.!]*\s*$/, '').match(/[a-z0-9]+/g) ?? [];
  const thua = tuThua.filter(w => w.length >= 2 && !TU_DEM.has(w) && !chuBang.has(w) && !/^\d+$/.test(w));
  // "SAO tháng này nhập ít vậy", "tại sao…": hỏi lý do — số liệu không trả lời được
  if (/(?<![a-z0-9])(tai sao|vi sao|sao lai)(?![a-z0-9])|^\s*sao /.test(c.q)) thua.push('tai sao');
  // "DỰ BÁO tháng 11 có đạt kế hoạch không", "có KỊP không", "LIỆU có đạt": hỏi tương lai — số liệu không dự báo được
  if (RE_DU_BAO.test(c.q)) thua.push('du bao');
  tv.loc = tv.loc.filter((l, i) => tv.loc.findIndex(o => JSON.stringify(o) === JSON.stringify(l)) === i);
  // Chữ hai nghĩa: chỉ hỏi lại khi chữ đó chưa được hiểu thành gì khác (kỳ, tên cột…) và là giá trị của bảng đang hỏi
  const moHo: NonNullable<HieuTV['moHo']> = [];
  const daHoi = new Set<string>();
  moHoGt.forEach(g => {
    const x = cotDu.find(y => y.id === g.cot || y.id === `sx:${g.cot}`);
    if (!x || (g.bang !== b.id && !x.sx) || tv.loc.some(l => l.cot === x.id)) return;
    const chu = c.gocTu(g.tu, g.den);
    // Chữ đó đã bị đọc thành lọc "chứa chữ …" ("hạng mục SAN của…", "công đoạn MAY") cũng là đoán — vẫn hỏi lại
    const chiLaChua = tv.loc.some(l => l.op === 'chua' && typeof l.gt === 'string' && boDau(l.gt.toLowerCase()) === boDau(chu.toLowerCase()));
    if (!c.conTrong(g.tu, g.den) && !chiLaChua) return;
    // Chỉ hỏi khi chữ đứng ở chỗ của 1 giá trị: đầu câu, hoặc sau "nhóm / loại / hạng mục / vật tư / công đoạn / ở / bao nhiêu…"
    // ("hex nào CUA ct25…", "quá hạn giao CUA pc…" là "của"; "BAN vẽ" là bản vẽ)
    const truocDo = c.q.slice(0, g.tu);
    const viTriGt = !truocDo.trim() || /(?<![a-z0-9])(nhom|loai|muc|vat tu|san pham|doan|o|nhieu|cac|nhung)\s*$/.test(truocDo);
    // … và không đứng trước tên người / công trình / xưởng ("hạng mục CUA pm …" là "của")
    if (!viTriGt || /^\s*(ve|pm|pc|cong trinh|du an|xuong|khach|nguoi|ct\s?\d)(?![a-z])/.test(c.q.slice(g.den))) return;
    const vietLai = (thay: string) => `${c.goc.slice(0, g.tu).join('')}${thay}${c.goc.slice(g.den).join('')}`;
    const lua = g.v.slice(0, 3).map(v => ({ nhan: `${x.ten}: ${v}`, cau: vietLai(`${x.ten.toLowerCase()} ${giaTriCoDau(v)}`) }));
    const truoc = moHo.find(m => m.chu === chu);
    if (truoc) { truoc.lua.push(...lua.filter(l => !truoc.lua.some(o => o.cau === l.cau))); return; }
    if (daHoi.has(chu)) return;
    daHoi.add(chu);
    moHo.push({ chu, lua });
  });
  // Câu hai nghĩa thật (không phải lỗi dấu): hỏi lại với 2 cách hiểu, không đoán
  const vietLaiCau = (tu: number, den: number, thay: string) => `${c.goc.slice(0, tu).join('')}${thay}${c.goc.slice(den).join('')}`;
  // "khách hàng / công trình nào LỚN NHẤT" không nói chỉ số: theo doanh thu nhập kho hay theo trị giá đơn hàng?
  if (!roBang && !knBang.length && tv.nhom.length === 1 && !nhac.some(n => n.cot.kieu === 'so') && !tv.loc.length) {
    const ln = /(?<![a-z0-9])(lon|to|bu) nhat(?![a-z0-9])/.exec(c.q);
    if (ln && /(?<![a-z0-9])(khach hang|cong trinh|pm|pc|chu dau tu|du an) nao(?![a-z0-9])/.test(c.q)) {
      moHo.push({ chu: c.gocTu(ln.index, ln.index + ln[0].length), lua: [
        { nhan: 'Nhập kho (doanh thu) nhiều nhất', cau: vietLaiCau(ln.index, ln.index + ln[0].length, 'nhập kho nhiều nhất') },
        { nhan: 'Trị giá đơn hàng lớn nhất', cau: vietLaiCau(ln.index, ln.index + ln[0].length, 'có trị giá đơn hàng lớn nhất') },
      ] });
    }
  }
  // "xưởng 4A đang KẸT gì": vướng mắc chưa xử lý hay hàng nghẽn ở công đoạn? ("kẹt Ở mộc" = đang ở công đoạn, không hỏi)
  { const ket = /(?<![a-z0-9])(dang |bi )?(ket|tac)(?! (o|tai|cho|khau|cong doan|buoc)(?![a-z0-9]))(?![a-z0-9])/.exec(c.q);
    if (ket && c.conTrong(ket.index, ket.index + ket[0].length) && !/(?<![a-z0-9])(vuong mac|nghen)(?![a-z0-9])/.test(c.q)) {
      const x = tv.loc.find(l => /^(sx:)?xuong/.test(l.cot));
      const xg = x ? (Array.isArray(x.gt) ? x.gt : [x.gt]).join(', ') : '';
      const duoi = xg ? ` xưởng ${xg}` : '';
      c.danh(ket.index, ket.index + ket[0].length);
      const i = thua.indexOf('ket'); if (i >= 0) thua.splice(i, 1);
      moHo.push({ chu: c.gocTu(ket.index, ket.index + ket[0].length), lua: [
        { nhan: `Vướng mắc chưa xử lý${duoi}`, cau: `vướng mắc chưa xử lý${duoi}` },
        { nhan: `Điểm nghẽn (hàng nằm lâu ở công đoạn)${duoi}`, cau: `điểm nghẽn${duoi}` },
      ] });
    } }
  return {
    tv, phuc, roBang, boQua, ky: tenKy, thua, doRo, conChuaHieu: c.conLai(),
    ...(doNgam && !doNoiRo ? { doNgam: true } : {}), ...(bangTrongCot ? { bangTrongCot: true } : {}),
    ...(knBang.length ? { khaiNiem: true } : {}), ...(suaChu.length ? { suaChu } : {}), ...(moHo.length ? { moHo } : {}),
  };
}

/** Trả lời bằng tự tra hay câu trả lời mẫu (traLoi.ts): mẫu làm tốt câu quen thuộc; câu có phép tính / chia / lọc mà mẫu
 *  không làm được, câu không khớp mẫu nào, hoặc người hỏi không có quyền của mẫu => tự tra */
// Câu trả lời mẫu nào làm được phần lọc / chia nào (traLoi.ts): dòng chảy lọc + chia theo xưởng / công trình,
// công trình / HEX tra theo mã, các mẫu tiến độ / công đoạn / MRA lọc theo xưởng
const LOC_DONG_CHAY = ['xuong_chinh', 'ten_cong_trinh'];
const MAU_LAM: Partial<Record<CauHoi['y'], { loc: string[]; nhom: string[]; bang?: string; chiKhiRo?: boolean; tu?: string }>> = {
  // chiKhiRo: câu không gọi tên bảng ('4A tháng này sao rồi') mà bộ đọc câu đoán bảng khác => vẫn dùng mẫu
  nhap_kho: { loc: LOC_DONG_CHAY, nhom: LOC_DONG_CHAY, bang: 'nhap_kho', chiKhiRo: true }, xuat_kho: { loc: LOC_DONG_CHAY, nhom: LOC_DONG_CHAY, bang: 'xuat_kho', chiKhiRo: true },
  don_hang: { loc: LOC_DONG_CHAY, nhom: LOC_DONG_CHAY, bang: 'dht' }, trien_khai: { loc: LOC_DONG_CHAY, nhom: LOC_DONG_CHAY, bang: 'tkbv_full' },
  tinh_phieu: { loc: LOC_DONG_CHAY, nhom: LOC_DONG_CHAY, bang: 'pthsp_full' }, ton_kho: { loc: [], nhom: [], bang: 'ton_kho' },
  tien_do_nam: { loc: [], nhom: [], tu: 'ke hoach tien do dat muc tieu chi doanh thu so con thieu bao nhieu nua thi voi' },
  tien_do_thang: { loc: ['xuong_chinh'], nhom: [], tu: 'ke hoach tien do dat muc tieu kh' }, ke_hoach_tuan: { loc: ['xuong_chinh'], nhom: [], tu: 'ke hoach kh tuan' },
  cong_doan: { loc: ['xuong_chinh'], nhom: [], tu: 'cong doan bop tren chuyen pheu' }, co_the_sx: { loc: ['xuong_chinh'], nhom: [], tu: 'chua the san xuat' },
  diem_nghen: { loc: ['xuong_chinh'], nhom: [], tu: 'diem nghen ket' },
  vuong_mac: { loc: ['ten_cong_trinh'], nhom: [], bang: 'vuong_mac', chiKhiRo: true, tu: 'vuong mac dang mo qua han' },
  mra: { loc: ['xuong_chinh', 'xuong'], nhom: [], tu: 'gio cong ty le co viec cho' },
  cong_trinh: { loc: ['ten_cong_trinh', 'ma_cong_trinh'], nhom: [], bang: 'production_status_app', chiKhiRo: true, tu: 'tinh hinh the nao ra sao phan tram tam tram hoan thanh duoc bao nhieu nhap kho' },
  // Tra 1 HEX: "đang ở công đoạn nào" => chia theo công đoạn cũng là ý của mẫu (mẫu đã hiện công đoạn)
  tra_hex: { loc: ['hex'], nhom: ['tinh_trang'], bang: 'production_status_app', chiKhiRo: true, tu: 'tra dang o dau' },
};
/** Chữ luật của hieuCauHoi cho câu hỏi tóm tắt 1 công trình bằng mẫu dù câu nói chỉ số ("bao nhiêu %", "tổng đơn + nhập kho") */
const TOM_TAT_CT = new Set(['phan tram', 'tom tat']);
/** Câu trả lời mẫu làm được trọn câu này (không có phép tính / chia / lọc / kỳ mà mẫu không đọc được) */
export function mauLamDuoc(c: CauHoi, h: HieuTV): boolean {
  const m = MAU_LAM[c.y];
  if (!m) return false;
  if (c.y === 'cong_trinh' && TOM_TAT_CT.has(c.tuKhop)) return true;
  // Có phần câu áp không được ("tồn kho theo người duyệt"): mẫu sẽ lờ đi mà không nói — tự tra ghi rõ "Bỏ qua: …"
  if (h.boQua.length) return false;
  // "số lượng công nhân đi làm hôm nay" (chỉ bắt chữ "công nhân", không nói xưởng / giờ công / MRA): mẫu MRA sẽ hỏi lại xưởng —
  // bảng điểm danh tự tra trả lời thẳng
  if (c.y === 'mra' && !c.xuong && c.tuKhop === 'cong nhan' && h.tv.bang === 'diem_danh') return false;
  // "năm nay còn thiếu bao nhiêu (so với kế hoạch)", "mục tiêu năm": câu trả lời tiến độ năm có sẵn phần còn thiếu
  if (c.y === 'tien_do_nam' && /con thieu/.test(c.tuKhop ?? '')) return true;
  // Chữ bộ đọc câu chưa hiểu phải là chữ luật của mẫu đã nhận ("kế hoạch tháng"); còn chữ khác ("dự báo", "giảm",
  // "xuất kho" trong câu về nhập kho) => mẫu trả lời thiếu ý
  const tuMau = new Set([...(c.tuKhop ?? '').split(' '), ...(m.tu ?? '').split(' ')]);
  if (h.thua.some(w => !tuMau.has(w))) return false;
  // "kế hoạch tháng 11": tháng chưa tới — tiến độ tháng (nhập kho so kế hoạch) chưa có gì để so => tự tra bảng kế hoạch
  if (kyThangTuongLai(c, h)) return false;
  const tv = h.tv;
  // Câu trả lời mẫu là của 1 bảng: câu hỏi về bảng khác ("kế hoạch sản XUẤT" ≠ mẫu xuất kho) => không phải mẫu
  if (m.bang && tv.bang !== m.bang && (!m.chiKhiRo || h.roBang)) return false;
  if (tv.kieu !== 'tong' || h.doRo || tv.soSanh || tv.sapChenh || tv.binhQuan || tv.gioiHan || tv.sap || tv.gomHuy) return false;
  // "vướng mắc đang mở": lọc đang mở (Mới + Đang xử lý) là chính cách đếm của câu trả lời mẫu vướng mắc => không tính là lọc riêng
  const locRieng = c.y === 'vuong_mac' ? tv.loc.filter(l => !laLocVmDangMo(l)) : tv.loc;
  if (!tv.nhom.every(n => m.nhom.includes(n)) || !locRieng.every(l => m.loc.includes(l.cot))) return false;
  // Câu trả lời mẫu chỉ lọc 1 giá trị (1 xưởng, 1 công trình): "xưởng 4A và 2A" => tự tra
  if (locRieng.some(l => Array.isArray(l.gt) && l.gt.length > 1)) return false;
  // Kỳ: mẫu phải đọc ra cùng ngày bắt đầu
  if (h.ky && !h.ky.includes('mặc định')) {
    if (!c.ky) return false;
    const i = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (i(c.ky.tu) !== tv.tu) return false;
  }
  return true;
}

/** Câu hỏi tiến độ tháng của 1 tháng chưa tới ("kế hoạch tháng 11" khi đang tháng 10): docKy cắt "đến" về hôm nay nên tu > den */
const kyThangTuongLai = (c: CauHoi, h: HieuTV) => c.y === 'tien_do_thang' && !!c.ky && c.ky.tu > c.ky.den && KE_HOACH.has(h.tv.bang);
/** Câu trả lời mẫu của 1 bảng dòng chảy (nhập / xuất / đơn hàng / bản vẽ / phiếu) */
const Y_DONG_CHAY = new Set<CauHoi['y']>(['nhap_kho', 'xuat_kho', 'don_hang', 'trien_khai', 'tinh_phieu']);

/** Nhờ AI đọc lại câu: còn chữ chưa hiểu, trừ khi câu trả lời mẫu làm được trọn câu */
export function canNhoAI(c: CauHoi, h: HieuTV | null): boolean {
  return !!h && h.thua.length > 0 && !mauLamDuoc(c, h);
}

export function nenTuTra(c: CauHoi, h: HieuTV | null, coMau: boolean): boolean {
  if (!h) return false;
  // "doanh thu tháng này": mẫu "doanh thu" là tiến độ cả năm — hỏi kỳ ngắn hơn thì là nhập kho của kỳ đó
  const doanhThuKy = c.y === 'tien_do_nam' && h.tv.bang === 'nhap_kho' && !!c.ky && !/^năm/.test(c.ky.ten);
  if (doanhThuKy) return true;
  // "chỉ tiêu nhập kho tuần này": chữ "chỉ tiêu" là của mẫu tiến độ năm, nhưng kỳ tuần / tháng + bộ đọc ra bảng kế hoạch => kế hoạch kỳ đó
  if (c.y === 'tien_do_nam' && h.tv.bang === 'khsx' && !!c.ky && !/^năm/.test(c.ky.ten)) return true;
  // Tiến độ của tháng chưa tới => tự tra bảng kế hoạch
  if (kyThangTuongLai(c, h)) return true;
  // "KẾ HOẠCH NHẬP KHO tháng này", "tuần 43 xưởng 8AB PHẢI NHẬP bao nhiêu": câu gọi rõ bảng khác (kế hoạch) — mẫu nhập kho trả lời sai bảng
  const mauBang = MAU_LAM[c.y]?.bang;
  if (Y_DONG_CHAY.has(c.y) && mauBang && h.roBang && !h.bangTrongCot && h.tv.bang !== mauBang) return true;
  // "đơn hàng mới THEO CÔNG TRÌNH", "nhập kho công trình X theo xưởng": không phải câu hỏi tóm tắt 1 công trình
  if (c.y === 'cong_trinh' && !TOM_TAT_CT.has(c.tuKhop) && (h.tv.nhom.includes('ten_cong_trinh') || (h.roBang && (h.tv.nhom.length > 0 || h.tv.bang !== 'production_status_app')))) return true;
  // Câu về 1 công trình không nói kỳ = trọn lịch sử; câu trả lời mẫu dòng chảy lại lấy kỳ mặc định => tự tra
  if (!c.ky && !h.tv.tu && ['nhap_kho', 'xuat_kho', 'don_hang', 'trien_khai', 'tinh_phieu'].includes(c.y) && h.tv.bang !== 'production_status_app') return true;
  if (coMau && mauLamDuoc(c, h)) return false;
  // Câu có kỳ mà mẫu không đọc được ("năm 2025", "quý 3", "tháng 9/2025") => mẫu sẽ lấy kỳ mặc định, sai kỳ
  const kyMauBoQua = !!h.ky && !c.ky && !h.ky.includes('mặc định');
  const nhieuGt = h.tv.loc.some(l => Array.isArray(l.gt) && l.gt.length > 1);
  return h.phuc || kyMauBoQua || nhieuGt || c.y === 'tim_kiem' || c.y === 'tro_giup' || !coMau;
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
  // Không nói phép tính => phép tính mặc định của bảng (máy chủ cũng dùng mặc định này)
  else phan.push((tv.do.length ? tv.do : b.mac).map(d => tenPhepTinh(b, d.ham, d.cot)).join(', '));
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
  if (tv.soSanh && tv.sapChenh) phan.push(`xếp ${tv.sapChenh === 'giam' ? 'giảm' : 'tăng'} nhiều nhất trước (theo ${tv.sapChenhTheo === 'pt' ? '%' : 'số'})`);
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
export function noiNguCanh(h: HieuTV, ngu: Loc[], dm: BangDM[], cau: string, bangTruoc?: string): string[] | null {
  if (!ngu.length || thucTheCua(h.tv).length) return null;
  if (/(?<![a-z0-9])(tat ca|toan bo|moi cong trinh|cac cong trinh|toan nha may|tong the|toan cong ty)(?![a-z0-9])/.test(boDau(cau))) return null;
  // "tháng này sao rồi" (chỉ kỳ, không chủ ngữ) = hỏi chung tình hình kỳ đó (tiến độ tháng / tuần / năm), không phải về đối tượng câu trước
  if (laCauHoiKyChung(cau)) return null;
  const b = dm.find(x => x.id === h.tv.bang);
  if (!b) return null;
  const cots = cotMoRong(b, dm);
  const them: Loc[] = [];
  const moTa: string[] = [];
  ngu.forEach(l => {
    const id = goc(l.cot);
    const c = cots.find(x => x.id === id) ?? cots.find(x => x.id === `sx:${id}`)
      ?? (id === 'xuong' || id === 'xuong_chinh' ? cots.find(x => x.kieu === 'xuong') : undefined);
    // Câu mới chia theo đúng cột đó ("XƯỞNG NÀO giảm nhiều nhất") là hỏi mọi giá trị — không lọc theo câu trước
    if (!c || h.tv.nhom.some(n => goc(n.split('@')[0]) === goc(c.id))) return;
    // Xưởng / PM / PC là bộ lọc của câu trước, không phải "đối tượng": chỉ giữ khi vẫn hỏi cùng bảng
    if (bangTruoc && bangTruoc !== h.tv.bang && /^(xuong|xuong_chinh|ten_pm|ten_pc)$/.test(id)) return;
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

// ============================================================================
// NGỮ CẢNH CUỘC HỎI — dùng chung cho cửa sổ (HoiDapPopup) và chấm điểm bộ câu (boCau/chamDiem.ts)
// ============================================================================

/** Điều nhớ lại từ câu trước: đối tượng (công trình, xưởng, HEX…) + cả truy vấn đã hiểu */
export interface NguCanh { cau: string; loc: Loc[]; tv?: TruyVan }

/** Chữ đánh dấu câu nối tiếp ("… thì sao", "còn tháng trước?", "vậy còn xưởng 3A") */
const NOI_TIEP = /(?<![a-z0-9])(thi sao|the nao|thi the nao|nhu vay|tuong tu|cung vay)\s*\??\s*$|^\s*(the con|vay con|con voi|con)(?![a-z0-9])(?!\s+(bao nhieu|lai|lai bao|bn|nhieu|it))/;
/** Bỏ lời đệm đầu / cuối câu ("ad ơi …", "cho tui xem …", "… giúp mình", "… nhé") để nhận ra câu nối tiếp */
const boLoiDem = (q: string): string => {
  let x = q.replace(/[?.!,]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) {
    x = x.replace(/^(cho (minh|tui|toi|em|anh|chi) (hoi|xem|biet)|xem giup|ad oi|admin oi|hoi chut|em muon biet|cho hoi|oi)\s+/, '')
      .replace(/\s+(vay|nhe|nha|giup( minh| toi| em| voi)?|a|ha|nhi|di|voi)$/, '').trim();
  }
  return x;
};
const CHU_NOI_TIEP = new Set(['thi', 'sao', 'the', 'nao', 'vay', 'con', 'nhu', 'tuong', 'tu', 'cung', 'voi']);
/** Chữ nối kiểu "thu hẹp câu trước": "CHỈ LẤY tồn trên 3 tháng", "RIÊNG 4A", "CỦA tây hồ view THÔI", "top 3 THÔI" */
const THU_HEP = /^(cua|rieng|chi|chi lay|chi tinh|chi xem|chi can|lay)(?![a-z0-9])|(?<![a-z0-9])(thoi|la du)$/;
/** "tháng này sao rồi", "tuần trước thế nào": chỉ kỳ + hỏi tình hình, không chủ ngữ => câu hỏi chung về kỳ (tiến độ), không nối câu trước */
const RE_KY_CHUNG = /^(thang|tuan|nam|quy) (nay|truoc|roi|hien tai|\d{1,2})( thi)? (sao roi|the nao|ra sao|tinh hinh( sao| the nao| ra sao)?|on khong|ok khong)$/;
export const laCauHoiKyChung = (cau: string): boolean => RE_KY_CHUNG.test(boLoiDem(boDau(cau)));
/** Số chữ mang nghĩa của câu nối (bỏ từ đệm / chữ nối): "nhập kho ĐƯỢC BAO NHIÊU RỒI" = 2 */
const soChuY = (q: string) => q.split(/\s+/).filter(w => w && !TU_DEM.has(w) && !CHU_NOI_TIEP.has(w)).length;
/** Cột mà các khái niệm nghiệp vụ của bảng dùng để lọc (quá hạn giao => ngay_can_giao + gia_tri_con_lai…) */
const cotKhaiNiem = (bangId: string, homNay: Date): Set<string> => {
  const s = new Set<string>();
  KHAI_NIEM.filter(k => k.bang === bangId).forEach(k => {
    const t: TruyVan = { bang: bangId, kieu: 'tong', do: [], nhom: [], loc: [] };
    k.ap(t, homNay, /x/.exec('x')!);
    t.loc.forEach(l => s.add(l.cot));
  });
  return s;
};
const laLocDoiTuong = (l: Loc) => ['ten_cong_trinh', 'ma_cong_trinh', 'hex'].includes(goc(l.cot));

/**
 * Câu nối tiếp thiếu ý ("còn tháng trước?", "xuất kho thì sao", "theo xưởng", "còn xưởng 3A") => lấy cả truy vấn câu trước
 * rồi thay phần câu mới nói (kỳ, lọc cùng cột, cách chia, bảng). Sửa thẳng h. Trả lời ghi chú, hoặc null nếu không nối.
 * Câu có khái niệm nghiệp vụ ("quá hạn giao", "tồn trên 3 tháng") là câu đủ ý => chỉ nối khi có chữ nối ("còn … thì sao",
 * "chỉ lấy …", "… thôi"); khi đó khái niệm mới THAY khái niệm cũ của câu trước, giữ đối tượng / nhóm / lọc giá trị.
 */
export function noiCauTruoc(h: HieuTV, truoc: TruyVan, dm: BangDM[], cau: string, homNay: Date = new Date()): string[] | null {
  const q = boLoiDem(boDau(cau));
  if (/(?<![a-z0-9])(tat ca|toan bo|toan nha may)(?![a-z0-9])/.test(q)) return null;
  const danhDau = NOI_TIEP.test(q) || THU_HEP.test(q);
  if (h.khaiNiem && !danhDau) return null;
  // "tháng này sao rồi" sau 1 danh sách: hỏi chung kỳ đó, không thêm kỳ vào câu trước
  if (!danhDau && RE_KY_CHUNG.test(q)) return null;
  const bTruoc = dm.find(x => x.id === truoc.bang);
  const bMoi = dm.find(x => x.id === h.tv.bang);
  if (!bTruoc || !bMoi) return null;
  // Tên bảng chỉ nằm trong tên cột ("theo NHÓM VẬT TƯ" sau câu về PR) => không tính là gọi tên bảng
  const roBang = h.roBang && !h.bangTrongCot;
  // "(chia) theo hạng mục (thì sao)" sau câu về nhập / xuất…: chia theo cột tên hạng mục của bảng câu trước
  if (roBang && h.tv.bang === SX && truoc.bang !== SX && /(?<![a-z0-9])(theo|tung|top \d+) (tung )?hang muc(?![a-z0-9])/.test(q)
    && bTruoc.cot.some(x => x.id === 'ten_hang_muc')) {
    h.roBang = false;
    h.tv = { ...truoc, nhom: ['ten_hang_muc'], loc: [], do: [], ...(h.tv.gioiHan ? { gioiHan: h.tv.gioiHan } : {}) };
  }
  const doiBang = h.roBang && !h.bangTrongCot && h.tv.bang !== truoc.bang;
  // Lọc câu mới nêu lại đúng đối tượng câu trước ("THỰC TẾ NHẬP của emerald raiya" sau "kế hoạch … của emerald raiya") không tính là điều kiện mới
  const cungDoiTuong = (l: Loc) => truoc.loc.some(o => goc(o.cot) === goc(l.cot) && JSON.stringify(o.gt) === JSON.stringify(l.gt));
  const chiDoiBang = doiBang && soChuY(q) <= 5 && h.tv.loc.every(cungDoiTuong) && !h.tv.nhom.length && !(h.ky && !h.ky.includes('mặc định'));
  if (h.roBang && !h.bangTrongCot && !danhDau && !chiDoiBang) return null;
  // Không có chữ nối mà tự nêu 1 công trình / HEX mới ("CT25-070 tới đâu rồi"), hoặc tự nêu kỳ kèm điều kiện mới
  // ("4A tháng này sao rồi") => câu hỏi mới, không lấy cả câu trước
  const kyRo = !!h.ky && !h.ky.includes('mặc định');
  if (!danhDau && !chiDoiBang && (h.tv.loc.some(laLocDoiTuong) || (kyRo && h.tv.loc.length > 0))) return null;
  // Không nói bảng: chỉ nối khi câu ngắn và mọi cột câu mới dùng đều có ở bảng câu trước
  const cotTruoc = cotMoRong(bTruoc, dm);
  const coCot = (id: string) => cotTruoc.some(x => x.id === id || goc(x.id) === goc(id)) || cotTruoc.some(x => x.kieu === 'xuong') && /^xuong/.test(goc(id));
  if (!roBang && !danhDau) {
    if (soChuY(q) > 6) return null;
    if (![...h.tv.loc.map(l => l.cot), ...h.tv.nhom.map(n => n.split('@')[0])].every(coCot)) return null;
  }

  const bang = doiBang ? bMoi : bTruoc;
  const cots = cotMoRong(bang, dm);
  const timCotMoi = (id: string) => cots.find(x => x.id === id) ?? cots.find(x => goc(x.id) === goc(id))
    ?? (/^xuong/.test(goc(id)) ? cots.find(x => x.kieu === 'xuong') : undefined);
  const tv: TruyVan = JSON.parse(JSON.stringify(truoc));
  if (doiBang) {
    tv.bang = bMoi.id;
    tv.do = h.tv.do;
    delete tv.sap;
    tv.loc = truoc.loc.flatMap(l => { const c = timCotMoi(l.cot); return c ? [{ ...l, cot: c.id }] : []; });
    tv.nhom = truoc.nhom.flatMap(n => {
      const [id, moc] = n.split('@');
      if (moc) return bMoi.ngay ? [`${bMoi.ngay}@${moc}`] : [];
      const c = timCotMoi(id);
      return c ? [c.id] : [];
    });
    // Kỳ câu mới chỉ là kỳ mặc định (năm nay) mà đang hỏi về 1 công trình / HEX => trọn lịch sử (như câu hỏi 1 công trình)
    const kyMacDinhCt = !!h.ky?.includes('mặc định') && tv.loc.some(laLocDoiTuong);
    if (!tv.tu && h.tv.tu && !kyMacDinhCt) { tv.tu = h.tv.tu; tv.den = h.tv.den; }
    // Từ bảng kế hoạch (trọn kỳ, cả ngày tương lai) sang bảng dòng chảy: cắt kỳ tới hôm nay
    const nay = iso(homNay);
    if (KE_HOACH.has(truoc.bang) && !KE_HOACH.has(bMoi.id) && tv.den && tv.den > nay) tv.den = nay;
  }
  // Câu mới có khái niệm ("còn quá hạn giao thì sao" sau "quá hạn kế hoạch theo PM"): bỏ lọc của khái niệm cũ, lát nữa cộng khái niệm mới
  if (h.khaiNiem) {
    const cu = cotKhaiNiem(bang.id, homNay);
    tv.loc = tv.loc.filter(l => !cu.has(goc(l.cot)));
  }
  // "so với tháng 8 (thì sao)": kỳ câu trước vẫn là kỳ chính, kỳ vừa nói là kỳ đem so
  // "so với cùng kỳ năm ngoái (thì sao)": kỳ so = kỳ câu trước lùi 1 năm
  if (/(?<![a-z0-9])cung ky(?![a-z0-9])/.test(q) && tv.tu && tv.den) {
    const lui = (x: string) => `${+x.slice(0, 4) - 1}${x.slice(4)}`;
    tv.soSanh = { tu: lui(tv.tu), den: lui(tv.den), ten: 'cùng kỳ năm trước' };
  } else if (/^so (sanh )?voi /.test(q) && tv.tu && (h.tv.soSanh || (h.ky && !h.ky.includes('mặc định') && h.tv.tu))) {
    tv.soSanh = h.tv.soSanh ?? { tu: h.tv.tu!, den: h.tv.den! };
  } else if (h.ky && !h.ky.includes('mặc định') && h.tv.tu) {
    // Kỳ câu mới nói rõ => thay (cả kỳ so sánh)
    tv.tu = h.tv.tu; tv.den = h.tv.den;
    if (h.tv.soSanh) tv.soSanh = h.tv.soSanh; else delete tv.soSanh;
  }
  // Lọc câu mới: thay lọc cùng cột của câu trước
  h.tv.loc.forEach(l => {
    const c = timCotMoi(l.cot);
    const id = c?.id ?? l.cot;
    tv.loc = tv.loc.filter(o => goc(o.cot) !== goc(id) && !(c?.kieu === 'xuong' && /^xuong/.test(goc(o.cot))));
    tv.loc.push({ ...l, cot: id });
  });
  if (h.tv.nhom.length) {
    tv.nhom = h.tv.nhom; delete tv.sap;
    // "theo công trình đi" / "xưởng nào nhiều nhất" sau 1 danh sách: chia nhóm là xem tổng từng nhóm, không còn liệt kê dòng
    if (h.tv.kieu !== 'dong') tv.kieu = 'tong';
  }
  // Phép tính câu mới nói rõ, hoặc nhắc cột số khác câu trước ("TĂNG CA bao nhiêu giờ" sau "bao nhiêu người đi làm") => thay
  if (h.doRo || (h.doNgam && h.tv.do.some(d => d.cot && !truoc.do.some(o => o.cot === d.cot)))) tv.do = h.tv.do;
  if (h.tv.kieu === 'dong') tv.kieu = 'dong';
  if (h.tv.gioiHan) tv.gioiHan = h.tv.gioiHan;
  if (h.tv.sapChenh) tv.sapChenh = h.tv.sapChenh;
  if (h.tv.binhQuan) tv.binhQuan = h.tv.binhQuan;

  h.tv = tv;
  h.phuc = true;
  h.thua = h.thua.filter(w => !CHU_NOI_TIEP.has(w));
  if (tv.tu && tv.den) h.ky = h.ky && !h.ky.includes('mặc định') ? h.ky : `${tv.tu.split('-').reverse().join('/')} – ${tv.den.split('-').reverse().join('/')} (theo câu trước)`;
  return [`Nối tiếp câu trước — muốn hỏi riêng thì gõ đủ câu (có tên bảng: nhập kho, đơn hàng, hạng mục…)`];
}

/**
 * Áp ngữ cảnh câu trước cho câu mới (sửa h): câu nối tiếp thiếu ý => lấy cả truy vấn; không thì chỉ lấy đối tượng
 * (công trình / xưởng / HEX…) khi câu mới không nói đối tượng. `noiCau` = đã lấy cả truy vấn (phải tự tra, không dùng mẫu).
 */
export function apNguCanh(
  h0: HieuTV | null, ngu: NguCanh | null, dm: BangDM[], cau: string, homNay: Date = new Date(), td?: TuDien,
): { h: HieuTV | null; ghi: string[]; noiCau: boolean } {
  let h = h0;
  if (!ngu) return { h, ghi: [], noiCau: false };
  // Câu cụt không nhận ra bảng ("theo xưởng", "còn 3A?"): đọc lại câu theo bảng của câu trước
  if (!h && ngu.tv) {
    const b = dm.find(x => x.id === ngu.tv!.bang);
    const h2 = b ? hieuTruyVan(`${b.ten} ${cau}`, dm, homNay, td) : null;
    if (h2 && h2.tv.bang === b!.id) h = { ...h2, roBang: false };
  }
  if (!h) return { h, ghi: [], noiCau: false };
  // Câu không gọi tên bảng mà bộ đọc câu đoán bảng khác ("còn tháng 8?" => kế hoạch): thử đọc theo bảng câu trước.
  // Câu có khái niệm chung ("cái nào QUÁ HẠN", "cái nào TRỄ HẸN") mặc định về bảng sản xuất: nếu bảng câu trước cũng hiểu
  // được chữ đó (khái niệm của bảng ấy, hoặc giá trị cố định cùng tên — vướng mắc "Quá hạn") thì theo bảng câu trước
  if (ngu.tv && !h.roBang && h.tv.bang !== ngu.tv.bang) {
    const b = dm.find(x => x.id === ngu.tv!.bang);
    const h2 = b ? hieuTruyVan(`${b.ten} ${cau}`, dm, homNay, td) : null;
    // Đọc lại mà hiểu ít hơn (thêm chữ chưa hiểu) => giữ cách đọc cũ
    if (h2 && h2.tv.bang === b!.id && h2.thua.length <= h.thua.length) {
      const h3: HieuTV = { ...h2, roBang: false };
      if (!h.khaiNiem) {
        const noi2 = noiCauTruoc(h3, ngu.tv, dm, cau, homNay);
        if (noi2) return { h: h3, ghi: noi2, noiCau: true };
      } else if (h2.khaiNiem || h2.tv.loc.some(l => l.op === 'bang' && !!b!.cot.find(x => x.id === l.cot)?.gt?.length)) {
        h = h3;
      }
    }
  }
  const noi = ngu.tv ? noiCauTruoc(h, ngu.tv, dm, cau, homNay) : null;
  if (noi) return { h, ghi: noi, noiCau: true };
  const keThua = noiNguCanh(h, ngu.loc, dm, cau, ngu.tv?.bang);
  return { h, ghi: keThua ? [`Theo câu trước: ${keThua.join('; ')} — muốn hỏi chung thì thêm "tất cả"`] : [], noiCau: !!keThua };
}

/** Ngữ cảnh sau khi trả lời 1 câu: truy vấn đã chạy (hoặc đã hiểu) + đối tượng. null = giữ ngữ cảnh cũ (câu chào / trợ giúp) */
export function nguCanhSau(cau: string, c: CauHoi, h: HieuTV | null, tvChay?: TruyVan): NguCanh | null {
  let tv = tvChay ?? (h && c.y !== 'tro_giup' ? h.tv : undefined);
  // Trả lời bằng câu mẫu dòng chảy ("4A tháng này sao rồi" => nhập kho) mà bộ đọc câu đoán bảng khác: nhớ bảng của câu mẫu
  // — chỉ khi câu mẫu thật sự làm được câu đó; câu đi tự tra ("còn bao nhiêu chưa nhập" = hạng mục còn lại) giữ bảng đã hiểu
  const BANG_MAU: Partial<Record<string, string>> = { nhap_kho: 'nhap_kho', xuat_kho: 'xuat_kho', don_hang: 'dht', trien_khai: 'tkbv_full', tinh_phieu: 'pthsp_full' };
  const bangMau = BANG_MAU[c.y];
  if (!tvChay && tv && h && !h.roBang && bangMau && tv.bang !== bangMau && mauLamDuoc(c, h)) tv = { ...tv, bang: bangMau, do: [], ...(c.ky ? { tu: iso(c.ky.tu), den: iso(c.ky.den) } : {}) };
  if (tv) return { cau, loc: thucTheCua(tv), tv };
  const loc: Loc[] = c.congTrinh ? [{ cot: 'ten_cong_trinh', op: 'chua', gt: c.congTrinh }] : c.hexList.length ? [{ cot: 'hex', op: 'bang', gt: c.hexList }] : [];
  return loc.length || c.y !== 'tro_giup' ? { cau, loc } : null;
}

// ============================================================================
// CÂU HỎI "TẠI SAO" — số liệu không trả lời được nguyên nhân: cửa sổ nói rõ + đưa số liệu liên quan để tự xem
// ============================================================================
const RE_TAI_SAO = /(?<![a-z0-9])(tai sao|vi sao|sao lai|ly do|nguyen nhan|do dau)(?![a-z0-9])|^\s*sao (?!roi\b)/;
/** Câu hỏi tương lai: "dự báo…", "có kịp không", "liệu có đạt…" — số liệu đã có không dự báo được */
// ("liệu" không phải "dữ LIỆU kế hoạch năm" — tên bảng)
const RE_DU_BAO = /(?<![a-z0-9])(du bao|du doan|du kien (dat|hoan thanh|xong)|(?<!du )lieu( co| rang)?|co kip( khong| ko| k)?|kip (tien do|ke hoach|kh|han)|se dat|co the dat|kha nang dat|co dat (duoc )?(khong|ko)|co xong (khong|ko|kip))(?![a-z0-9])/;
export const laCauTaiSao = (cau: string): boolean => { const q = boDau(cau.toLowerCase()); return RE_TAI_SAO.test(q) || RE_DU_BAO.test(q); };
export const laCauDuBao = (cau: string): boolean => RE_DU_BAO.test(boDau(cau.toLowerCase()));
/**
 * Bỏ phần hỏi lý do + chữ nhận xét ("ít / nhiều / giảm / tăng / chậm…") => câu hỏi số liệu liên quan.
 * "sao tháng này nhập ít vậy" -> "tháng này nhập"; "tại sao xuất kho giảm" -> "xuất kho"
 */
export function cauSoLieuCua(cau: string): string {
  return cau
    .replace(/(?<![\p{L}\d])(tại sao|vì sao|sao lại|lý do|nguyên nhân|do đâu|tai sao|vi sao|sao lai|ly do|nguyen nhan|do dau)(?![\p{L}\d])/giu, ' ')
    // chữ hỏi tương lai: "DỰ BÁO tháng 11 CÓ đạt kế hoạch KHÔNG" -> "tháng 11 đạt kế hoạch"
    .replace(/(?<![\p{L}\d])(dự báo|du bao|dự đoán|du doan|liệu|lieu|có kịp|co kip|sẽ|se|khả năng|kha nang|có thể|co the)(?![\p{L}\d])/giu, ' ')
    .replace(/^\s*sao\s+/iu, ' ')
    .replace(/(?<![\p{L}\d])(ít|nhiều|giảm|tăng|chậm|thấp|cao|kém|tụt|sụt|it|nhieu|giam|tang|cham|thap|kem|tut|sut|thế|vậy|the|vay|hả|ha|nhỉ|nhi|quá|qua|lắm|lam|mạnh|manh)(?![\p{L}\d])/giu, ' ')
    .replace(/[?!.]+/g, ' ').replace(/\s+/g, ' ').trim();
}
