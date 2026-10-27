// ============================================================================
// HỎI – ĐÁP SỐ LIỆU (không dùng AI): hiểu câu hỏi tiếng Việt bằng từ khoá.
//   cauHoi -> { y (loại câu hỏi), ky (khoảng ngày), xuong, hex, tuan, nhom (theo xưởng / công trình) }
// Thuần hàm, không gọi mạng — có test (hieuCauHoi.test.ts). Phần lấy số + dựng câu trả lời ở traLoi.ts.
// ============================================================================

export type Y =
  | 'don_hang' | 'trien_khai' | 'tinh_phieu' | 'nhap_kho' | 'xuat_kho' | 'ton_kho'
  | 'tien_do_nam' | 'tien_do_thang' | 'ke_hoach_tuan'
  | 'cong_doan' | 'co_the_sx' | 'diem_nghen'
  | 'vuong_mac' | 'tra_hex' | 'mra' | 'cong_trinh' | 'tim_kiem' | 'tro_giup';

/** Khoảng ngày [tu, den] (giờ máy, 0h) + tên đọc được */
export interface Ky { tu: Date; den: Date; ten: string; macDinh?: boolean }

export interface CauHoi {
  y: Y;
  ky: Ky | null;
  xuong: string | null;
  hex: string | null;
  /** Số tuần ISO (câu "kế hoạch tuần 41") */
  tuan: number | null;
  /** Số tháng (câu "tháng 9") */
  thang: number | null;
  nhom: 'xuong' | 'congtrinh' | null;
  /** Mọi mã HEX trong câu (dán nhiều mã) */
  hexList: string[];
  /** Công trình nói tới: mã "CT26-110" hoặc tên sau chữ "công trình" (giữ dấu để tìm trong dữ liệu) */
  congTrinh: string | null;
  /** Chữ để tìm tự do (câu không thuộc loại nào) — giữ nguyên dấu */
  tuKhoa: string | null;
  /** Chữ (bỏ dấu) mà luật nhận loại câu đã khớp ("nhap kho", "ke hoach thang") — chữ khác trong câu mẫu không hiểu */
  tuKhop: string;
}

/** Mã công trình dạng CT26-110 / ct26 110 / CT26_110 -> "CT26-110" */
export const docMaCongTrinh = (cau: string) => {
  const m = cau.match(/(?<![a-z0-9])ct\s?(\d{2})[-_ ]?(\d{3})(?!\d)/i);
  return m ? `CT${m[1]}-${m[2]}` : null;
};
// Từ chỉ thời gian / câu hỏi hay đứng sau tên công trình — cắt bỏ khi lấy tên
const DUOI_TEN = /\s+(?:hôm nay|hôm qua|tuần|tháng|năm|\d+ ngày|từ \d|theo |xưởng |nhập|xuất|tồn|vướng|đơn hàng|tiến độ|có bao|bao nhiêu|thế nào|ra sao|như nào|\?).*$/i;
/** Tên công trình sau chữ "công trình …" (bỏ các câu "công trình nào", "theo công trình") */
export const docTenCongTrinh = (cau: string) => {
  const m = cau.match(/c[oô]ng\s*tr[iì]nh\s+(.+)$/i);
  if (!m) return null;
  const ten = m[1].replace(DUOI_TEN, '').trim().replace(/[?.!,]+$/, '');
  if (ten.length < 2 || /^(nào|nao|nhiều|nhieu|top|đang|dang|của|cua)(\s|$)/i.test(ten)) return null;
  return ten;
};

/** Bỏ dấu, chữ thường, gọn khoảng trắng: "Nhập KHO tuần này" -> "nhap kho tuan nay" */
export const boDau = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();

// ---- Viết tắt hay gặp khi chat ("bn" = bao nhiêu, "hm" = hạng mục, "nk" = nhập kho…) — mở thành chữ đầy đủ TRƯỚC khi đọc câu.
// Dùng chung cho hieuCauHoi (câu trả lời mẫu) và hieuTruyVan (tự tra). Khoá = chữ đã bỏ dấu ("đc" tra bằng "dc").
// "kh" = kế hoạch — trừ "kh-th / khth / kh th" (bảng KH-TH) và khi đứng sau "khách"; "sl" sau "vướng" giữ nguyên
// (mẫu "vướng SL" = chưa thể sản xuất); "k" sau số là nghìn ("500 k"), không phải "không".
const VIET_TAT: Record<string, string> = {
  bn: 'bao nhiêu', hm: 'hạng mục', ntn: 'như thế nào', ko: 'không', hok: 'không', k: 'không', sl: 'số lượng', sp: 'sản phẩm',
  tg: 'tháng', trc: 'trước', ncc: 'nhà cung cấp', ds: 'danh sách', dc: 'được', hnay: 'hôm nay', kh: 'kế hoạch',
  nk: 'nhập kho', xk: 'xuất kho', vm: 'vướng mắc', tb: 'trung bình', 'cung ki': 'cùng kỳ',
};
// Dạng gõ có dấu của vài khoá (regex phải bắt được đúng chữ người dùng gõ)
const VIET_TAT_CO_DAU = ['đc', 'cùng kì', 'cùng ki', 'cung kì'];
const RE_VIET_TAT = new RegExp(
  `(?<![\\p{L}\\d\\-/])(${[...Object.keys(VIET_TAT), ...VIET_TAT_CO_DAU].sort((a, b) => b.length - a.length).join('|')})(?![\\p{L}\\d\\-/])`, 'giu');
/**
 * Mở viết tắt trong câu gõ tay, giữ nguyên chữ còn lại. Câu gõ không dấu thì mở cũng không dấu ("bn" -> "bao nhieu")
 * để bộ đọc vẫn biết đó là câu không dấu (chữ hai nghĩa "da / tu" vẫn được hỏi lại).
 */
export const moVietTat = (cau: string): string => {
  const khongDau = !/[\u0080-￿]/.test(cau);
  return cau.replace(RE_VIET_TAT, (m: string, w: string, viTri: number, ca: string) => {
    const k = boDau(w);
    const thay = VIET_TAT[k];
    if (!thay) return m;
    // boDau đã gọn + cắt khoảng trắng 2 đầu: chữ liền trước / liền sau nằm ở cuối `truoc` / đầu `sau`
    const truoc = boDau(ca.slice(Math.max(0, viTri - 12), viTri));
    const sau = boDau(ca.slice(viTri + w.length, viTri + w.length + 6));
    if (k === 'kh' && (/(^|\s)khach$/.test(truoc) || /^th(?![a-z])/.test(sau))) return m;
    if (k === 'sl' && /(^|\s)vuong$/.test(truoc)) return m;
    if (k === 'k' && /\d$/.test(truoc)) return m;
    return khongDau ? boDau(thay) : thay;
  });
};

const ngay0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const cong = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dd = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
/** Thứ Hai của tuần chứa d */
const thu2 = (d: Date) => cong(d, -((d.getDay() + 6) % 7));
/** Thứ Hai của tuần ISO `tuan` năm `nam` */
export const thu2TuanIso = (nam: number, tuan: number) => {
  const j4 = new Date(nam, 0, 4);
  return cong(thu2(j4), (tuan - 1) * 7);
};
export const tuanIso = (d: Date) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const dau = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - dau.getTime()) / 86400000 + 1) / 7);
};

/** Đọc khoảng ngày trong câu (đã bỏ dấu). null = câu không nói tới thời gian. */
export function docKy(q0: string, homNay: Date): Ky | null {
  const h = ngay0(homNay);
  // "từ đầu tháng (tới giờ)" = tháng này; "từ đầu năm tới nay" = năm nay
  const q = q0.replace(/(?<![a-z0-9])tu dau (thang|tuan|nam|quy)( nay)?( (toi|den) (gio|nay|hom nay|bay gio))?(?![a-z0-9])/, '$1 nay');
  const m2 = q.match(/(?:tu|từ)\s*(\d{1,2})\/(\d{1,2})\s*(?:den|-|toi)\s*(\d{1,2})\/(\d{1,2})/);
  if (m2) {
    const tu = new Date(h.getFullYear(), +m2[2] - 1, +m2[1]), den = new Date(h.getFullYear(), +m2[4] - 1, +m2[3]);
    return { tu, den, ten: `${dd(tu)} – ${dd(den)}` };
  }
  if (/\bhom nay\b/.test(q)) return { tu: h, den: h, ten: `hôm nay (${dd(h)})` };
  if (/\bhom qua\b/.test(q)) { const d = cong(h, -1); return { tu: d, den: d, ten: `hôm qua (${dd(d)})` }; }
  if (/\btuan (nay|hien tai)\b/.test(q)) return { tu: thu2(h), den: h, ten: `tuần này (${dd(thu2(h))} – ${dd(h)})` };
  if (/\btuan (truoc|roi)\b/.test(q)) { const t = cong(thu2(h), -7); return { tu: t, den: cong(t, 6), ten: `tuần trước (${dd(t)} – ${dd(cong(t, 6))})` }; }
  // "tuần sau / tuần tới", "tháng sau / tháng tới / tháng kế": kỳ kế tiếp, lấy trọn (chưa có số liệu thực tế, chỉ có kế hoạch)
  if (/\btuan (sau|toi|ke tiep|ke)\b/.test(q)) { const t = cong(thu2(h), 7); return { tu: t, den: cong(t, 6), ten: `tuần sau (${dd(t)} – ${dd(cong(t, 6))})` }; }
  if (/\bthang (sau|toi|ke tiep|ke)\b/.test(q)) {
    const t = new Date(h.getFullYear(), h.getMonth() + 1, 1), c = new Date(h.getFullYear(), h.getMonth() + 2, 0);
    return { tu: t, den: c, ten: `tháng ${t.getMonth() + 1}` };
  }
  const mt = q.match(/\btuan (\d{1,2})\b/);
  if (mt) { const t = thu2TuanIso(h.getFullYear(), +mt[1]); return { tu: t, den: cong(t, 6), ten: `tuần ${mt[1]} (${dd(t)} – ${dd(cong(t, 6))})` }; }
  if (/\bthang (nay|hien tai)\b/.test(q)) { const t = new Date(h.getFullYear(), h.getMonth(), 1); return { tu: t, den: h, ten: `tháng ${h.getMonth() + 1} (tới ${dd(h)})` }; }
  if (/\bthang (truoc|roi)\b/.test(q)) {
    const t = new Date(h.getFullYear(), h.getMonth() - 1, 1), c = new Date(h.getFullYear(), h.getMonth(), 0);
    return { tu: t, den: c, ten: `tháng ${t.getMonth() + 1}` };
  }
  const mth = q.match(/\bthang (\d{1,2})\b/);
  if (mth && +mth[1] >= 1 && +mth[1] <= 12) {
    const t = new Date(h.getFullYear(), +mth[1] - 1, 1), c = new Date(h.getFullYear(), +mth[1], 0);
    return { tu: t, den: c > h ? h : c, ten: `tháng ${+mth[1]}` };
  }
  if (/\bnam (nay|hien tai)\b/.test(q)) { const t = new Date(h.getFullYear(), 0, 1); return { tu: t, den: h, ten: `năm ${h.getFullYear()} (tới ${dd(h)})` }; }
  const mn = q.match(/\b(\d{1,3}) ngay\b/);
  if (mn) { const n = Math.max(1, Math.min(366, +mn[1])); const t = cong(h, -(n - 1)); return { tu: t, den: h, ten: `${n} ngày qua (${dd(t)} – ${dd(h)})` }; }
  const md = q.match(/\b(?:ngay )?(\d{1,2})\/(\d{1,2})\b/);
  if (md) { const d = new Date(h.getFullYear(), +md[2] - 1, +md[1]); return { tu: d, den: d, ten: `ngày ${dd(d)}` }; }
  return null;
}

/** Kỳ mặc định khi câu không nói thời gian */
export const kyMacDinh = (y: Y, homNay: Date): Ky => {
  const h = ngay0(homNay);
  if (y === 'vuong_mac') { const t = cong(h, -29); return { tu: t, den: h, ten: `30 ngày qua (${dd(t)} – ${dd(h)})`, macDinh: true }; }
  if (y === 'mra') { const t = cong(h, -6); return { tu: t, den: h, ten: `7 ngày qua (${dd(t)} – ${dd(h)})`, macDinh: true }; }
  const t = new Date(h.getFullYear(), h.getMonth(), 1);
  return { tu: t, den: h, ten: `tháng ${h.getMonth() + 1} (tới ${dd(h)})`, macDinh: true };
};

// Thứ tự quan trọng: câu cụ thể trước câu chung ("kế hoạch tuần" trước "nhập kho", "tồn kho" trước "kho")
const LUAT: Array<[Y, RegExp]> = [
  ['tro_giup', /\b(giup gi|giup duoc gi|huong dan|hoi duoc gi|hoi gi|lam duoc gi|help)\b/],
  // "chỗ nào có VẤN ĐỀ", "có SỰ CỐ gì" = vướng mắc (cùng cách gọi khác của bảng vướng mắc trong danh mục)
  ['vuong_mac', /\bvuong mac\b|\bvuong\b(?! sl)|\bvan de\b|\bsu co\b/],
  ['mra', /\bgio cong\b|\bty le co viec\b|\bgio cho\b|\bcham cong\b|\bcong nhan\b|\bmra\b|\bto truong\b|\bnang suat\b/],
  // "TUẦN NÀY KẾ HOẠCH nhập kho bao nhiêu" / "THÁNG NÀY KẾ HOẠCH bao nhiêu": kỳ nói trước chữ kế hoạch cũng là hỏi kế hoạch kỳ đó
  // "CHỈ TIÊU tuần 43 / tháng này" = kế hoạch tuần / tháng đó ("chỉ tiêu" không kèm tuần / tháng vẫn là tiến độ năm);
  // "tháng 9 (đã) ĐẠT KẾ HOẠCH chưa" = tiến độ tháng 9 (câu trả lời có sẵn % đạt) — cùng cách với tuần
  ['ke_hoach_tuan', /\b(ke hoach|kh|chi tieu) tuan\b|\btuan (nay|truoc|roi|\d{1,2}) (da )?dat (ke hoach|kh)\b|\btuan (nay|truoc|roi|\d{1,2}) (ke hoach|kh)\b/],
  ['tien_do_thang', /\b(ke hoach|kh|tien do|chi tieu) thang\b|\bthang (nay|truoc|roi|\d{1,2}) ((da )?dat )?(ke hoach|kh)\b/],
  ['tien_do_nam', /\b(ke hoach|kh|tien do|muc tieu) nam\b|\bdoanh (so|thu)\b|\bchi tieu\b|\bmoc quy\b|\bnam nay con thieu\b/],
  ['co_the_sx', /\b(chua )?the san xuat\b|\bvuong sl\b|\bchua trien khai san xuat\b/],
  ['diem_nghen', /\bdiem nghen\b|\bnghen\b|\bket o\b|\bdung lau\b/],
  ['cong_doan', /\bcong doan\b|\bbop\b|\btren chuyen\b|\bpheu\b|\bdang san xuat\b|\btinh trang don hang\b/],
  ['ton_kho', /\bton kho\b|\bcon ton\b|\bhang ton\b|\btrong kho\b|\bkho con\b/],
  ['nhap_kho', /\bnhap kho\b|\bp022\b|\bnhap\b/],
  ['xuat_kho', /\bxuat kho\b|\bp025\b|\bxuat\b|\bgiao hang\b|\bgiao (duoc|het|ra)\b/],
  ['tinh_phieu', /\btinh phieu\b|\bpthsp\b|\bp012\b|\bphieu\b/],
  ['trien_khai', /\btrien khai\b|\bban ve\b|\btkbv\b|\bp002\b/],
  ['don_hang', /\bdon hang\b|\bdon moi\b|\bp001\b|\bdon\b/],
];

// Các chỉ số của tóm tắt công trình (traLoi.tomTatCongTrinh): câu hỏi ≥ 2 chỉ số của 1 công trình thì dùng tóm tắt
// ("chưa nhập kho" thuộc nhóm còn lại, không tính là nhóm nhập kho)
const CHI_SO_CT: RegExp[] = [
  /\btong don\b|\bdon hang\b|\btri gia( don)?\b/, /(?<!chua )\bnhap kho\b|\bda nhap\b/, /\bxuat kho\b|\bda xuat\b/,
  /\bcon lai\b|\bchua nhap\b/, /\btinh phieu\b/, /\btrien khai\b/,
];

export function hieuCauHoi(cau0: string, homNay: Date = new Date()): CauHoi {
  // Mở viết tắt trước ("vm qua han" -> vướng mắc, "kh tuần 42" -> kế hoạch tuần, "tg 9" -> tháng 9)
  const cau = moVietTat(cau0);
  const q = boDau(cau);
  // Số đứng sau "PR / PO" là số PR / PO (bảng vật tư), không phải HEX
  const qHex = q.replace(/(?<![a-z0-9])(?:so |ma )?(?:pr|po)\s*[:#]?\s*\d{6,12}(?![0-9])/g, ' ');
  const hexList = [...new Set(qHex.match(/\b\d{9,13}\b/g) ?? [])];
  const hex = hexList[0] ?? null;
  let congTrinh = docMaCongTrinh(cau) ?? docTenCongTrinh(cau);
  const xuongRaw = q.match(/\b(?:xuong |x\.?)?(\d{1,2}[a-z]{1,2})\b/)?.[1] ?? null;
  // "7 ngay", "30 ngay"… không phải xưởng; xưởng là số + chữ dính liền (4a, 8ab, 8c)
  const xuong = xuongRaw && !/^\d+(ngay|n)$/.test(xuongRaw) ? xuongRaw.toUpperCase() : null;
  let y: Y = 'tro_giup';
  let tuKhop = '';
  if (hex && !/\bvuong\b/.test(q)) y = 'tra_hex';
  else {
    const hit = LUAT.find(([, re]) => re.test(q));
    if (hit) { y = hit[0]; tuKhop = hit[1].exec(q)?.[0] ?? ''; }
  }
  const hoiTroGiup = /\b(giup gi|giup duoc gi|huong dan|hoi duoc gi|hoi gi|lam duoc gi|help)\b/.test(q);
  // "tháng này sao rồi", "tuần trước thế nào": chỉ kỳ + hỏi tình hình, không chủ ngữ => tiến độ tháng / kế hoạch tuần / tiến độ năm
  const kyChung = y === 'tro_giup' && !xuong && !congTrinh && !hex
    ? /^\s*(thang|tuan|nam|quy) (nay|truoc|roi|hien tai|\d{1,2})( thi)? (sao roi|the nao|ra sao|tinh hinh( sao| the nao| ra sao)?|on khong|ok khong)\s*[?.!]*\s*$/.exec(q) : null;
  if (kyChung) { y = kyChung[1] === 'tuan' ? 'ke_hoach_tuan' : kyChung[1] === 'thang' ? 'tien_do_thang' : 'tien_do_nam'; tuKhop = 'sao roi the nao ra sao tinh hinh'; }
  // Nói tới 1 công trình mà không hỏi số liệu cụ thể => tóm tắt công trình đó
  if (congTrinh && !hoiTroGiup && (y === 'tro_giup' || y === 'cong_doan' || y === 'don_hang')) y = 'cong_trinh';
  // "CT25-070 nhập kho được bao nhiêu phần trăm": tỷ lệ hoàn thành của 1 công trình => tóm tắt công trình (có % nhập kho)
  if (congTrinh && /\b(phan tram|ty le|bao nhieu %)/.test(q)) { y = 'cong_trinh'; tuKhop = 'phan tram'; }
  // "CT25-070 tổng đơn bao nhiêu, nhập kho được bao nhiêu rồi": hỏi 2 chỉ số trở lên của 1 công trình = tóm tắt công trình
  if (congTrinh && !tuKhop.includes('phan tram') && /[,;]|\bva\b|\bvoi\b/.test(q) && CHI_SO_CT.filter(re => re.test(q)).length >= 2) { y = 'cong_trinh'; tuKhop = 'tom tat'; }
  // Không thuộc loại nào => tìm tự do như ô Tra cứu (mã nhà máy, tên hạng mục, tên công trình…)
  let tuKhoa: string | null = null;
  if (y === 'tro_giup' && !hoiTroGiup && q.replace(/[^a-z0-9]/g, '').length >= 2) {
    y = 'tim_kiem';
    tuKhoa = cau.trim().replace(/^(tìm|tim|tra cứu|tra cuu|tra|cho (tôi|tui|mình) (xem|biết))\s+/i, '').replace(/[?.!]+$/, '');
  }
  // "nam phương LÀM TỚI ĐÂU rồi", "tây hồ view SAO RỒI": tên công trình nói trống + hỏi tình hình => tóm tắt công trình
  // (tên không phải công trình — "tủ áo làm tới đâu" — thì bộ đọc tự tra đọc lại theo nhóm sản phẩm / xưởng)
  if (y === 'tim_kiem' && !xuong && !hex && !congTrinh && !docKy(q, homNay)) {
    const m = /^(.{2,}?)\s+(?:(?:đang|dang)\s+)?(?:(?:làm|lam|chạy|chay)\s+)?(?:(?:tới|toi|đến|den)\s+(?:đâu|dau)(?:\s+(?:rồi|roi))?|sao\s+(?:rồi|roi)|(?:thế|the)\s+(?:nào|nao)|ra\s+sao)\s*[?.!]*$/iu.exec(cau.trim());
    const ten = m?.[1].replace(/^(?:công trình|cong trinh|ct|dự án|du an)\s+/i, '').trim();
    if (ten && /\p{L}/u.test(ten)) { congTrinh = ten; y = 'cong_trinh'; tuKhop = 'toi dau sao roi the nao'; }
  }
  const tuanM = q.match(/\btuan (\d{1,2})\b/);
  const thangM = q.match(/\bthang (\d{1,2})\b/);
  const nhom: CauHoi['nhom'] =
    /\b(theo|tung|moi|cac) xuong\b|\bxuong nao\b/.test(q) ? 'xuong'
      : /\b(theo|tung|moi|cac) cong trinh\b|\bcong trinh nao\b|\btop\b|\bnhieu nhat\b/.test(q) ? 'congtrinh' : null;
  // "4A tháng này sao rồi": hỏi chung 1 xưởng trong 1 kỳ => nhập kho của xưởng (chỉ số chính)
  if (xuong && (y === 'tim_kiem' || y === 'tro_giup') && /\b(sao roi|the nao|ra sao|tinh hinh|toi dau roi|duoc bao nhieu|duoc nhieu)\b/.test(q)) { y = 'nhap_kho'; tuKhop = 'sao roi the nao ra sao tinh hinh toi dau'; }
  return {
    y,
    ky: docKy(q, homNay),
    // "4A" nằm trong tên công trình ("Tháp 4A") thì không phải xưởng
    xuong: xuong && congTrinh && boDau(congTrinh).includes(xuong.toLowerCase()) ? null : xuong,
    hex,
    tuan: tuanM ? +tuanM[1] : null,
    thang: thangM && +thangM[1] >= 1 && +thangM[1] <= 12 ? +thangM[1] : null,
    nhom,
    hexList,
    congTrinh,
    tuKhoa,
    tuKhop,
  };
}
