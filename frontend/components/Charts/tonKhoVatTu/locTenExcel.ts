// ============================================================================
// BỘ LỌC TÊN VẬT TƯ THEO ĐÚNG CÁCH CỦA EXCEL (AutoFilter) — phần tính thuần (không React), có test.
// Đã đối chiếu từng quy tắc với Excel thật (Microsoft 365, AutoFilter qua COM) trên tên thật của bảng:
//   - Tên là chuỗi THÔ đúng như ô Excel (máy chủ không gộp khoảng trắng: NBSP / 2 dấu cách cuối tên Excel vẫn tính).
//   - Không phân biệt hoa / thường, CÓ phân biệt dấu ("vải" không khớp "VAI …" gõ không dấu).
//   - Excel dựng tiêu chí rồi so theo 2 cách:
//       * tiêu chí có * hoặc ? (chứa / bắt đầu / kết thúc luôn có; ô Tìm kiếm = chứa): so theo mẫu, ký tự đại diện
//         * = chuỗi bất kỳ, ? = 1 ký tự; ~ = lấy nguyên ký tự ngay sau nó (~1 là "1", ~* là "*"); ~ cuối cùng bị bỏ.
//         So từng mã ký tự: chữ có dấu gõ kiểu tổ hợp (NFD, 8 tên Phụ kiện) KHÔNG khớp chữ gõ dựng sẵn.
//       * tiêu chí không có * ?  (bằng / không bằng): so nguyên văn, giữ mọi ~; dạng NFD = NFC.
//   - Dấu cách thường (U+0020) ở 2 đầu Ô bị bỏ qua (" M", "M " = "M"); dấu cách cuối TIÊU CHÍ bị bỏ ("kết thúc với ' '"
//     = "=*" = mọi dòng), dấu cách đầu tiêu chí giữ nguyên; NBSP không bao giờ bị cắt.
//   - Lớn / nhỏ hơn: thứ tự chữ của Excel (Windows en-US): ký hiệu < chữ số < chữ cái; ký hiệu theo bảng của Excel
//     (cách, NBSP, tab, ! " # $ % & ( ) * , . / : ; ? @ [ \ ] ^ _ ` { | } ~ + < = > °); ă â đ ê ô ơ ư = chữ gốc + dấu;
//     bỏ qua "-", "–" và "'" (hoà thì chuỗi có các dấu này đứng sau).
//   - Bộ lọc văn bản: 12 phép so như hộp "Tự Lọc Tùy chỉnh", 2 điều kiện Và/Hoặc; danh sách giá trị gộp tên chỉ khác
//     hoa / thường thành 1 mục, xếp như Excel, tên trống = "(Trống)" cuối.
// ============================================================================

/** Tên trống trong bảng (máy chủ thay bằng chuỗi này — routes/tonKhoVt.ts TEN_TRONG) */
export const TEN_TRONG = '(Không có tên)';
/** Excel ghi mục tên trống là "(Trống)" */
export const NHAN_TRONG = '(Trống)';

export type ToanTu =
  | 'bang' | 'khongBang' | 'lonHon' | 'lonHonBang' | 'nhoHon' | 'nhoHonBang'
  | 'batDau' | 'khongBatDau' | 'ketThuc' | 'khongKetThuc' | 'chua' | 'khongChua';

/** Đúng thứ tự & chữ của hộp "Tự Lọc Tùy chỉnh" (Excel tiếng Việt) */
export const DS_TOAN_TU: Array<[ToanTu, string]> = [
  ['bang', 'bằng'], ['khongBang', 'không bằng'],
  ['lonHon', 'lớn hơn'], ['lonHonBang', 'lớn hơn hoặc bằng'], ['nhoHon', 'nhỏ hơn'], ['nhoHonBang', 'nhỏ hơn hoặc bằng'],
  ['batDau', 'bắt đầu với'], ['khongBatDau', 'không bắt đầu với'], ['ketThuc', 'kết thúc với'], ['khongKetThuc', 'không kết thúc với'],
  ['chua', 'chứa'], ['khongChua', 'không chứa'],
];
const NHAN_TOAN_TU = new Map(DS_TOAN_TU);

/** Mục "Bộ lọc Văn bản ▸" của Excel (mở hộp tùy chỉnh với phép so đặt sẵn) */
export const MENU_BO_LOC_VAN_BAN: Array<[ToanTu, string]> = [
  ['bang', 'Bằng…'], ['khongBang', 'Không bằng…'], ['batDau', 'Bắt đầu với…'], ['ketThuc', 'Kết thúc với…'],
  ['chua', 'Chứa…'], ['khongChua', 'Không chứa…'],
];

export interface DieuKienTen { toanTu: ToanTu; giaTri: string }

/** ds = danh sách tên đánh dấu (ô kiểm); dk = bộ lọc văn bản (1–2 điều kiện) */
export type BoLocTen =
  | { kieu: 'ds'; ten: string[] }
  | { kieu: 'dk'; dk1: DieuKienTen; noi: 'va' | 'hoac'; dk2: DieuKienTen | null };

/** Bộ lọc đã áp dụng cho 1 biểu đồ: cách lọc + các tên (chuỗi máy chủ) thoả + câu mô tả */
export interface LocTen { boLoc: BoLocTen; ten: string[]; moTa: string }

/** Khoá so nguyên văn / gộp mục danh sách: dạng dựng sẵn + chữ thường (Excel coi NFD = NFC khi so nguyên văn) */
export const khoaExcel = (s: string): string => s.normalize('NFC').toLowerCase();

// Ký tự đặc biệt của RegExp (cờ 'u' không cho thoát ký tự thường như "-" => chỉ thoát đúng các ký tự cú pháp)
const thoatRegex = (c: string) => c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** Tiêu chí có ký tự đại diện * ? (kể cả đã thoát bằng ~) => Excel so theo mẫu */
const coDaiDien = (tieuChi: string) => /[*?]/.test(tieuChi);

const boNhoMau = new Map<string, RegExp>();
/** Tiêu chí Excel (đã thêm * theo phép so) => RegExp neo 2 đầu, so chữ thường từng mã ký tự (không chuẩn hoá NFC) */
export function mauExcel(tieuChi: string): RegExp {
  let re = boNhoMau.get(tieuChi);
  if (re) return re;
  const kt = Array.from(tieuChi.toLowerCase());
  let nguon = '';
  for (let i = 0; i < kt.length; i++) {
    const c = kt[i];
    if (c === '~') { if (i + 1 < kt.length) nguon += thoatRegex(kt[++i]); continue; }
    nguon += c === '*' ? '[\\s\\S]*' : c === '?' ? '[\\s\\S]' : thoatRegex(c);
  }
  try { re = new RegExp(`^${nguon}$`, 'u'); } catch { re = /(?!)/u; }
  if (boNhoMau.size > 500) boNhoMau.clear();
  boNhoMau.set(tieuChi, re);
  return re;
}

/** Excel bỏ qua dấu cách thường ở 2 đầu ô */
const catO = (s: string) => s.replace(/^ +| +$/g, '');
/** Excel bỏ dấu cách thường ở cuối tiêu chí */
const catTieuChi = (s: string) => s.replace(/ +$/, '');

/** Ô thoả tiêu chí "=tieuChi" của Excel: có * ? => so mẫu; không => so nguyên văn (không phân biệt hoa thường) */
export function khopTieuChi(ten: string, tieuChi: string): boolean {
  const tc = catTieuChi(tieuChi);
  const o = catO(ten);
  if (!coDaiDien(tc)) return khoaExcel(o) === khoaExcel(tc);
  return mauExcel(tc).test(o.toLowerCase());
}

// So lớn / nhỏ như Excel (Windows en-US): không phân biệt hoa thường, có phân biệt dấu, ă/â/đ/ê/ô/ơ/ư = chữ gốc + dấu.
// Ký hiệu xếp theo bảng của Excel (đo trên Excel thật; trùng thứ tự sắp xếp Microsoft công bố) — ICU xếp ký hiệu khác
// => đổi mỗi ký hiệu sang 1 ký tự kẻ khung U+2500+thứ tự (ICU xếp các ký tự này tăng dần, trước chữ số và chữ cái).
// "-", "–" và "'" bị bỏ qua (hoà thì chuỗi có các dấu này đứng sau).
const boSoChu = new Intl.Collator('en', { sensitivity: 'accent' });
const KY_HIEU_EXCEL = ' \u00a0\t!"#$%&()*,./:;?@[\\]^_`{|}~+<=>°';
const MA_KY_HIEU = new Map(Array.from(KY_HIEU_EXCEL, (c, i) => [c, String.fromCharCode(0x2500 + i)]));
const doiKyHieu = (s: string) => Array.from(s, c => MA_KY_HIEU.get(c) ?? c).join('');
const GACH_NHAY = /[-'\u2013]/g;
const boGachNhay = (s: string) => s.replace(GACH_NHAY, '');
const demGachNhay = (s: string) => (s.match(GACH_NHAY) ?? []).length;
// Hoà: ' < - < – (đo trên Excel: A'B < A-B < A–B) — đổi sang ký tự khối U+2580.. (ICU xếp tăng dần)
const doiGachNhay = (s: string) => s.replace(/'/g, '\u2580').replace(/-/g, '\u2581').replace(/\u2013/g, '\u2582');
export function soSanhExcel(a: string, b: string): number {
  const x = a.normalize('NFC'), y = b.normalize('NFC');
  const s = boSoChu.compare(doiKyHieu(boGachNhay(x)), doiKyHieu(boGachNhay(y)));
  if (s !== 0) return s;
  return Math.sign(demGachNhay(x) - demGachNhay(y)) || boSoChu.compare(doiGachNhay(doiKyHieu(x)), doiGachNhay(doiKyHieu(y)));
}

/** 1 điều kiện của bộ lọc văn bản (giá trị trống: "bằng" = tên trống, "không bằng" = tên không trống, phép khác = bỏ qua) */
export function thoaDieuKien(ten: string, dk: DieuKienTen): boolean {
  const laTrong = ten === TEN_TRONG;
  const chu = laTrong ? '' : ten;
  if (dk.giaTri === '') {
    if (dk.toanTu === 'bang') return laTrong;
    if (dk.toanTu === 'khongBang') return !laTrong;
    return true;
  }
  const v = dk.giaTri;
  switch (dk.toanTu) {
    case 'bang': return khopTieuChi(chu, v);
    case 'khongBang': return !khopTieuChi(chu, v);
    case 'batDau': return khopTieuChi(chu, `${v}*`);
    case 'khongBatDau': return !khopTieuChi(chu, `${v}*`);
    case 'ketThuc': return khopTieuChi(chu, `*${v}`);
    case 'khongKetThuc': return !khopTieuChi(chu, `*${v}`);
    case 'chua': return khopTieuChi(chu, `*${v}*`);
    case 'khongChua': return !khopTieuChi(chu, `*${v}*`);
    default: {
      // Ô trống không lớn / nhỏ hơn chữ nào (Excel bỏ qua ô trống khi so lớn nhỏ)
      if (laTrong) return false;
      const tc = catTieuChi(v);
      // Giá trị có * ? => Excel không so lớn nhỏ mà so mẫu: ">" = không khớp, ">=" = mọi dòng, "<" = không dòng nào,
      // "<=" = khớp (đo trên Excel thật)
      if (coDaiDien(tc)) {
        const khop = khopTieuChi(chu, tc);
        return dk.toanTu === 'lonHon' ? !khop : dk.toanTu === 'lonHonBang' ? true : dk.toanTu === 'nhoHon' ? false : khop;
      }
      const s = soSanhExcel(catO(chu), tc);
      return dk.toanTu === 'lonHon' ? s > 0 : dk.toanTu === 'lonHonBang' ? s >= 0 : dk.toanTu === 'nhoHon' ? s < 0 : s <= 0;
    }
  }
}

/** Điều kiện có hiệu lực (Excel bỏ điều kiện 2 khi để trống giá trị) */
const coGiaTri = (dk: DieuKienTen | null): dk is DieuKienTen => !!dk && dk.giaTri !== '';

export function thoaBoLoc(ten: string, b: BoLocTen, dsChon?: Set<string>): boolean {
  if (b.kieu === 'ds') return (dsChon ?? new Set(b.ten)).has(ten);
  const a = thoaDieuKien(ten, b.dk1);
  if (!coGiaTri(b.dk2)) return a;
  const c = thoaDieuKien(ten, b.dk2);
  return b.noi === 'va' ? a && c : a || c;
}

/** Các tên (trong danh sách đầy đủ của nhóm) thoả bộ lọc — giữ thứ tự danh sách */
export function tenThoa(tatCa: string[], b: BoLocTen): string[] {
  const ds = b.kieu === 'ds' ? new Set(b.ten) : undefined;
  return tatCa.filter(t => thoaBoLoc(t, b, ds));
}

/** Ô Tìm kiếm của Excel: "chứa" mẫu (có ký tự đại diện); trống => mọi mục. Đang tìm thì Excel ẩn mục "(Trống)". */
export function khopTimKiem(ten: string, tim: string): boolean {
  if (tim === '') return true;
  if (ten === TEN_TRONG) return false;
  return khopTieuChi(ten, `*${tim}*`);
}

const chuDk = (dk: DieuKienTen) => `${NHAN_TOAN_TU.get(dk.toanTu) ?? dk.toanTu} “${dk.giaTri}”`;

/** Câu mô tả bộ lọc: "tên chứa “vải”", "tên bắt đầu với “VẢI” hoặc chứa “DA”", "3 tên đã chọn" */
export function moTaBoLoc(b: BoLocTen, soTen: number): string {
  if (b.kieu === 'ds') return `${soTen.toLocaleString('en-US')} tên đã chọn`;
  const a = `tên ${chuDk(b.dk1)}`;
  return coGiaTri(b.dk2) ? `${a} ${b.noi === 'va' ? 'và' : 'hoặc'} ${chuDk(b.dk2)}` : a;
}

/** 1 mục trong danh sách giá trị của bộ lọc */
export interface MucTen {
  /** Khoá so sánh (gộp tên chỉ khác hoa / thường) */
  khoa: string;
  /** Chữ hiện (tên đầu tiên của nhóm; tên trống => "(Trống)") */
  hien: string;
  /** Mọi tên (chuỗi máy chủ) thuộc mục này */
  ten: string[];
  soMa: number;
  conTon: boolean;
}

/** Danh sách giá trị như Excel: gộp tên chỉ khác hoa / thường, xếp A→Z theo thứ tự chữ của Excel, "(Trống)" cuối */
export function dungDanhSachMuc(ds: Array<{ ten: string; soMa: number; conTon: boolean }>): MucTen[] {
  const theoKhoa = new Map<string, MucTen>();
  let trong: MucTen | null = null;
  for (const t of ds) {
    if (t.ten === TEN_TRONG) {
      trong = trong ?? { khoa: '', hien: NHAN_TRONG, ten: [], soMa: 0, conTon: false };
      trong.ten.push(t.ten); trong.soMa += t.soMa; trong.conTon = trong.conTon || t.conTon;
      continue;
    }
    const k = khoaExcel(t.ten);
    const m = theoKhoa.get(k);
    if (m) { m.ten.push(t.ten); m.soMa += t.soMa; m.conTon = m.conTon || t.conTon; }
    else theoKhoa.set(k, { khoa: k, hien: t.ten, ten: [t.ten], soMa: t.soMa, conTon: t.conTon });
  }
  const kq = [...theoKhoa.values()].sort((a, b) => soSanhExcel(a.hien, b.hien));
  if (trong) kq.push(trong);
  return kq;
}

/** Khoá các mục đang được bộ lọc giữ lại (để đánh dấu lại ô kiểm khi mở bộ lọc); không lọc => mọi mục */
export function khoaDangChon(muc: MucTen[], b: BoLocTen | null): Set<string> {
  if (!b) return new Set(muc.map(m => m.khoa));
  const ds = b.kieu === 'ds' ? new Set(b.ten) : undefined;
  return new Set(muc.filter(m => m.ten.some(t => thoaBoLoc(t, b, ds))).map(m => m.khoa));
}

/** Đổi tập khoá mục đã đánh dấu => bộ lọc (null = chọn hết = không lọc) */
export function boLocTuKhoa(muc: MucTen[], khoa: Set<string>): LocTen | null {
  const chon = muc.filter(m => khoa.has(m.khoa));
  if (chon.length === 0 || chon.length === muc.length) return null;
  const ten = chon.flatMap(m => m.ten);
  const boLoc: BoLocTen = { kieu: 'ds', ten };
  return { boLoc, ten, moTa: moTaBoLoc(boLoc, chon.length) };
}

/** Bộ lọc văn bản => LocTen (ten = mọi tên của nhóm thoả điều kiện, có thể rỗng) */
export function boLocTuDieuKien(tatCa: string[], dk1: DieuKienTen, noi: 'va' | 'hoac', dk2: DieuKienTen | null): LocTen {
  const boLoc: BoLocTen = { kieu: 'dk', dk1, noi, dk2: coGiaTri(dk2) ? dk2 : null };
  const ten = tenThoa(tatCa, boLoc);
  return { boLoc, ten, moTa: moTaBoLoc(boLoc, ten.length) };
}
