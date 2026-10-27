import type { Bang, TraLoi } from '../traLoi';
import { boDauGiu } from '../hieuTruyVan';

// ============================================================================
// BÁO CÁO TỪ CUỘC HỎI — mô hình dùng chung cho xuất Excel (xuatXlsx.ts) và PDF (xuatPdf.ts).
// Người dùng hỏi nhiều câu, tick những câu muốn đưa vào, gõ "xuất báo cáo" (hoặc bấm nút) => 1 file:
//   trang "Tóm tắt" (tiêu đề, ngày lập, người lập, từng câu hỏi + con số chính + điều kiện "Hiểu là")
//   + mỗi câu có bảng số liệu là 1 bảng riêng.
// Chỉ số liệu đã hỏi, không có nhận xét AI (người dùng chốt 23/10/2026).
// ============================================================================

export interface MucBaoCao {
  stt: number;
  /** Câu người dùng gõ (hoặc mô tả truy vấn khi dùng khung Tự tra) */
  cauHoi: string;
  /** Con số / câu trả lời chính, đã bỏ **đậm** và các dòng ghi chú */
  ketQua: string;
  /** Dòng "Hiểu là: …" — điều kiện lấy số, để người đọc báo cáo biết số tính theo gì */
  hieuLa?: string;
  /** Ghi chú khác đáng giữ ("Tồn kho chốt ngày …", "Bỏ qua: …") — bỏ các dòng chỉ dẫn thao tác */
  ghiChu: string[];
  /** Bảng số liệu (nếu câu trả lời có bảng) */
  bang?: Bang;
  /** Tên sheet Excel: ≤ 31 ký tự, không có [ ] : * ? / \, không trùng */
  tenSheet: string;
}

export interface BaoCao {
  tieuDe: string;
  /** dd/mm/yyyy hh:mm */
  ngayLap: string;
  nguoiLap: string;
  muc: MucBaoCao[];
}

/** Câu trả lời có đưa vào báo cáo được không (có bảng, có truy vấn, hoặc là câu trả lời mẫu có số) */
/** Câu trả lời mẫu có số liệu thì in đậm con số ("**84.64 tỷ**", "**1,263 mục**"); câu trợ giúp / chào chỉ đậm chữ */
const coSoDam = (chu: string) => /\*\*[^*]*\d[^*]*\*\*/.test(chu);
export const coTheXuat = (tra: TraLoi | undefined): boolean =>
  !!tra && !tra.chon && !tra.baoCao && !tra.rong && (!!tra.bang || !!tra.tv || (tra.nk?.duong === 'mau' && coSoDam(tra.chu)));

const boDam = (s: string) => s.replace(/\*\*/g, '').trim();
/** Dòng ghi chú chỉ để hướng dẫn thao tác trên cửa sổ — không đưa vào báo cáo */
const LA_CHI_DAN = /muốn hỏi (chung|riêng)|bấm Sửa điều kiện|Thử bấm|AI hiểu câu hỏi|kiểm tra điều kiện bên dưới|Cửa sổ chỉ tra/;

/** Tách câu trả lời (chu) thành: kết quả chính · "Hiểu là" · ghi chú */
export function tachTraLoi(chu: string): { ketQua: string; hieuLa?: string; ghiChu: string[] } {
  const ketQua: string[] = [];
  const ghiChu: string[] = [];
  let hieuLa: string | undefined;
  chu.split('\n').map(d => d.trim()).filter(Boolean).forEach(d => {
    const ghi = /^_.*_$/.test(d);
    const noi = boDam(ghi ? d.slice(1, -1) : d);
    if (!ghi) { ketQua.push(noi); return; }
    if (/^Hiểu là:/.test(noi)) { hieuLa = noi.replace(/^Hiểu là:\s*/, ''); return; }
    if (LA_CHI_DAN.test(noi)) return;
    ghiChu.push(noi);
  });
  return { ketQua: ketQua.join(' · '), hieuLa, ghiChu };
}

/** Tên sheet Excel hợp lệ, duy nhất trong tập đã có */
export function tenSheetHopLe(goc: string, daCo: Set<string>): string {
  const ten = goc.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31).trim() || 'Bang';
  if (!daCo.has(ten)) { daCo.add(ten); return ten; }
  for (let i = 2; ; i++) {
    const thu = `${ten.slice(0, 31 - ` (${i})`.length).trim()} (${i})`;
    if (!daCo.has(thu)) { daCo.add(thu); return thu; }
  }
}

/** Câu trả lời dạng bảng chỉ nói "7 nhóm." / "Có 82 nhóm — hiện 5 nhóm đầu." => ghi thêm dòng tổng làm kết quả chính */
export function ketQuaTuTong(ketQua: string, bang?: Bang): string {
  if (!bang?.cuoi || !/^(Có )?\d[\d,]* (nhóm|dòng)/.test(ketQua)) return ketQua;
  const tong = bang.cot.map((c, i) => (i > 0 && bang.cuoi![i] !== undefined && bang.cuoi![i] !== '' ? `${c}: ${bang.cuoi![i]}` : '')).filter(Boolean);
  return tong.length ? `${ketQua} ${tong.join(' · ')}`.trim() : ketQua;
}

const hai = (n: number) => String(n).padStart(2, '0');

/** Dựng mô hình báo cáo từ các câu đã tick (theo thứ tự hỏi) */
export function dungBaoCao(
  dong: Array<{ cauHoi: string; tra: TraLoi }>, nguoiLap: string, luc: Date = new Date(), tieuDe?: string,
): BaoCao {
  const daCo = new Set<string>(['Tóm tắt']);
  const muc: MucBaoCao[] = dong.map(({ cauHoi, tra }, i) => {
    const stt = i + 1;
    const cau = cauHoi.replace(/^🔎\s*/, '').trim();
    const tach = tachTraLoi(tra.chu);
    return { stt, cauHoi: cau, ketQua: ketQuaTuTong(tach.ketQua, tra.bang), hieuLa: tach.hieuLa, ghiChu: tach.ghiChu, bang: tra.bang, tenSheet: tenSheetHopLe(`${stt}. ${cau}`, daCo) };
  });
  const ngayLap = `${hai(luc.getDate())}/${hai(luc.getMonth() + 1)}/${luc.getFullYear()} ${hai(luc.getHours())}:${hai(luc.getMinutes())}`;
  return { tieuDe: tieuDe?.trim() || 'Báo cáo số liệu', ngayLap, nguoiLap, muc };
}

/** Ô bảng đã định dạng ("1,263", "41.87") -> số để Excel tính được; chữ khác giữ nguyên */
export function oSangSo(v: string | number): string | number {
  if (typeof v === 'number') return v;
  const s = v.trim();
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) || /^-?\d+(\.\d+)?$/.test(s)) return Number(s.replace(/,/g, ''));
  return v;
}

/** Tên file không dấu: bao-cao-so-lieu-2026-10-23-1430.xlsx */
export function tenFile(bc: BaoCao, duoi: 'xlsx' | 'pdf'): string {
  const m = bc.ngayLap.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
  const nhan = m ? `${m[3]}-${m[2]}-${m[1]}-${m[4]}${m[5]}` : 'bao-cao';
  const ten = boDauGiu(bc.tieuDe).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bao-cao';
  return `${ten}-${nhan}.${duoi}`;
}

// ---- Lệnh "xuất báo cáo" gõ trong ô hỏi ----------------------------------------------------------------
export interface LenhXuat {
  /** null = chưa nói rõ => cửa sổ hiện cả 2 nút Excel / PDF */
  dinhDang: 'xlsx' | 'pdf' | null;
  /** Phần còn lại sau lệnh ("xuất báo cáo NHẬP KHO THÁNG 10 THEO XƯỞNG") — câu hỏi cần hỏi trước rồi mới xuất; rỗng = xuất các câu đã tick */
  conLai: string;
}

const RE_LENH = /^(?:(?:cho (?:minh|tui|toi|em) )?(?:xuat|lam|tao|gui|in|xuat ra|tai|tai ve|lay)\s+)?(?:bao cao|file bao cao|file|excel|pdf|bang excel)(?:\s+(?:excel|pdf|xlsx))?(?!\s*(?:la gi|nao|gi\b))/;
const RE_DUOI = /^\s*(?:ve|cho|cua|:|-|,|gom|co|voi)\s+/;
/** Lời đệm ĐẦU câu ("ad ơi", "cho mình hỏi", "cho tui xem", "xem giúp", "hỏi chút", "em muốn biết"…) — bỏ trước khi nhận lệnh */
const RE_DEM_DAU = /^(?:ad oi|(?:cho|de) (?:minh|tui|toi|em|anh|chi) (?:hoi|xem|biet)|cho hoi|cho xem|xem giup(?: (?:minh|em|tui|toi))?|hoi chut|(?:em|minh|tui|toi|anh|chi) muon (?:biet|xem|hoi))\s*[,:]?\s*/;
/** Lời đệm CUỐI câu ("đi", "nhé", "ạ", "vậy", "giúp mình"…) — phải là chữ riêng (có khoảng trắng trước): "xưởng 4A" không bị cắt "a";
 *  không có "nay" vì "tháng này" / "tuần này" bỏ dấu cũng là "nay" */
const RE_DEM_CUOI = /(?:^|\s+)(?:di|nhe|nha|giup|giup (?:minh|em|tui|toi)|a|voi|vay|luon|ok|dc|duoc khong|duoc ko)\s*[?.!…]*$/;
/** "ra excel" / "file pdf" / "dạng xlsx" nhắc lại ở cuối */
const RE_DUOI_DINH_DANG = /\s*(?:ra|dạng|dang|thành|thanh|kieu|kiểu)?\s*(?:file\s+)?(?:excel|pdf|xlsx)\s*$/i;
/** Phần sau lệnh chỉ nói "các câu đã hỏi" / "những câu đã tick ở trên" / "cuộc hỏi này" / "tất cả" => không phải câu hỏi mới
 *  (không đem đi hỏi số liệu), chỉ xuất các câu đã tick */
const RE_CAC_CAU = /^(?:(?:tat ca )?(?:cac|nhung|moi) cau(?: (?:da|vua))?(?: (?:hoi|tick|chon))?(?: (?:o )?tren)?|cuoc hoi(?: nay)?|tat ca(?: cac cau)?|het)$/;

/** Nhận lệnh xuất báo cáo; null = không phải lệnh */
export function laLenhXuat(cau: string): LenhXuat | null {
  let goc = cau.trim();
  // boDauGiu giữ độ dài => chỉ số trên chữ bỏ dấu cắt được chữ gốc có dấu
  let q = boDauGiu(goc).toLowerCase();
  // Bỏ lời đệm đầu câu (tối đa 2 lớp: "ad ơi, cho mình hỏi …")
  for (let i = 0; i < 2; i++) {
    const dau = RE_DEM_DAU.exec(q);
    if (!dau || !dau[0]) break;
    goc = goc.slice(dau[0].length);
    q = q.slice(dau[0].length);
  }
  const m = RE_LENH.exec(q);
  if (!m) return null;
  // Lệnh phải đứng đầu câu và là động từ hoặc "báo cáo": "báo cáo tiến độ công trình" (câu hỏi số liệu) không phải lệnh
  const lenh = m[0];
  const coDongTu = /^(?:cho \w+ )?(?:xuat|lam|tao|gui|in|tai|lay)\b/.test(lenh);
  if (!coDongTu) {
    // "báo cáo …" / "file …" không có động từ: chỉ là lệnh khi phía sau rỗng hoặc là excel / pdf / "các câu đã hỏi" / lời đệm
    // ("báo cáo tiến độ công trình", "file nào chưa về" là câu hỏi số liệu)
    const sau = q.slice(lenh.length).replace(/[\s?.!…]+$/, '').trim();
    if (sau && !/^(?:excel|pdf|xlsx|cac cau|nhung cau|cuoc hoi|ra|di|nhe|nha|giup|a|vay)\b/.test(sau)) return null;
  }
  const dinhDang: LenhXuat['dinhDang'] = /\bpdf\b/.test(lenh) ? 'pdf' : /\b(excel|xlsx)\b/.test(lenh) ? 'xlsx' : null;
  let conLai = goc.slice(lenh.length);
  const d = RE_DUOI.exec(boDauGiu(conLai).toLowerCase());
  if (d) conLai = conLai.slice(d[0].length);
  // Bỏ dần ở cuối: dấu câu, "ra excel" / "file pdf" nhắc lại, lời đệm ("xuất báo cáo nhập kho tháng 9 ra excel đi ạ?")
  for (let i = 0; i < 5; i++) {
    const truoc = conLai;
    conLai = conLai.replace(/[\s?.!…]+$/, '').replace(RE_DUOI_DINH_DANG, '');
    const x = RE_DEM_CUOI.exec(boDauGiu(conLai).toLowerCase());
    if (x && x[0].trim()) conLai = conLai.slice(0, x.index);
    if (conLai === truoc) break;
  }
  // "xuất báo cáo các câu đã hỏi" / "… cuộc hỏi này": chỉ các câu đã tick, không có câu hỏi kèm theo
  if (RE_CAC_CAU.test(boDauGiu(conLai).toLowerCase().replace(/\s+/g, ' ').trim())) conLai = '';
  const dd2 = /\b(pdf)\b/i.test(goc) ? 'pdf' : /\b(excel|xlsx)\b/i.test(goc) ? 'xlsx' : null;
  return { dinhDang: dinhDang ?? dd2, conLai: conLai.replace(/\s+/g, ' ').trim() };
}
