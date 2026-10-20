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
export function docKy(q: string, homNay: Date): Ky | null {
  const h = ngay0(homNay);
  const m2 = q.match(/(?:tu|từ)\s*(\d{1,2})\/(\d{1,2})\s*(?:den|-|toi)\s*(\d{1,2})\/(\d{1,2})/);
  if (m2) {
    const tu = new Date(h.getFullYear(), +m2[2] - 1, +m2[1]), den = new Date(h.getFullYear(), +m2[4] - 1, +m2[3]);
    return { tu, den, ten: `${dd(tu)} – ${dd(den)}` };
  }
  if (/\bhom nay\b/.test(q)) return { tu: h, den: h, ten: `hôm nay (${dd(h)})` };
  if (/\bhom qua\b/.test(q)) { const d = cong(h, -1); return { tu: d, den: d, ten: `hôm qua (${dd(d)})` }; }
  if (/\btuan (nay|hien tai)\b/.test(q)) return { tu: thu2(h), den: h, ten: `tuần này (${dd(thu2(h))} – ${dd(h)})` };
  if (/\btuan (truoc|roi)\b/.test(q)) { const t = cong(thu2(h), -7); return { tu: t, den: cong(t, 6), ten: `tuần trước (${dd(t)} – ${dd(cong(t, 6))})` }; }
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
  ['tro_giup', /\b(giup|huong dan|hoi duoc gi|hoi gi|lam duoc gi|help)\b/],
  ['vuong_mac', /\bvuong mac\b|\bvuong\b(?! sl)/],
  ['mra', /\bgio cong\b|\bty le co viec\b|\bgio cho\b|\bcham cong\b|\bcong nhan\b|\bmra\b|\bto truong\b|\bnang suat\b/],
  ['ke_hoach_tuan', /\b(ke hoach|kh) tuan\b/],
  ['tien_do_thang', /\b(ke hoach|kh|tien do) thang\b/],
  ['tien_do_nam', /\b(ke hoach|kh|tien do) nam\b|\bdoanh (so|thu)\b|\bchi tieu\b|\bmoc quy\b/],
  ['co_the_sx', /\b(chua )?the san xuat\b|\bvuong sl\b|\bchua trien khai san xuat\b/],
  ['diem_nghen', /\bdiem nghen\b|\bnghen\b|\bket o\b|\bdung lau\b/],
  ['cong_doan', /\bcong doan\b|\bbop\b|\btren chuyen\b|\bpheu\b|\bdang san xuat\b|\btinh trang don hang\b/],
  ['ton_kho', /\bton kho\b|\bcon ton\b|\bhang ton\b/],
  ['nhap_kho', /\bnhap kho\b|\bp022\b|\bnhap\b/],
  ['xuat_kho', /\bxuat kho\b|\bp025\b|\bxuat\b|\bgiao hang\b/],
  ['tinh_phieu', /\btinh phieu\b|\bpthsp\b|\bp012\b|\bphieu\b/],
  ['trien_khai', /\btrien khai\b|\bban ve\b|\btkbv\b|\bp002\b/],
  ['don_hang', /\bdon hang\b|\bdon moi\b|\bp001\b|\bdon\b/],
];

export function hieuCauHoi(cau: string, homNay: Date = new Date()): CauHoi {
  const q = boDau(cau);
  const hexList = [...new Set(q.match(/\b\d{9,13}\b/g) ?? [])];
  const hex = hexList[0] ?? null;
  const congTrinh = docMaCongTrinh(cau) ?? docTenCongTrinh(cau);
  const xuongRaw = q.match(/\b(?:xuong |x\.?)?(\d{1,2}[a-z]{1,2})\b/)?.[1] ?? null;
  // "7 ngay", "30 ngay"… không phải xưởng; xưởng là số + chữ dính liền (4a, 8ab, 8c)
  const xuong = xuongRaw && !/^\d+(ngay|n)$/.test(xuongRaw) ? xuongRaw.toUpperCase() : null;
  let y: Y = 'tro_giup';
  if (hex && !/\bvuong\b/.test(q)) y = 'tra_hex';
  else {
    const hit = LUAT.find(([, re]) => re.test(q));
    if (hit) y = hit[0];
  }
  const hoiTroGiup = /\b(giup|huong dan|hoi duoc gi|hoi gi|lam duoc gi|help)\b/.test(q);
  // Nói tới 1 công trình mà không hỏi số liệu cụ thể => tóm tắt công trình đó
  if (congTrinh && !hoiTroGiup && (y === 'tro_giup' || y === 'cong_doan' || y === 'don_hang')) y = 'cong_trinh';
  // Không thuộc loại nào => tìm tự do như ô Tra cứu (mã nhà máy, tên hạng mục, tên công trình…)
  let tuKhoa: string | null = null;
  if (y === 'tro_giup' && !hoiTroGiup && q.replace(/[^a-z0-9]/g, '').length >= 2) {
    y = 'tim_kiem';
    tuKhoa = cau.trim().replace(/^(tìm|tim|tra cứu|tra cuu|tra|cho (tôi|tui|mình) (xem|biết))\s+/i, '').replace(/[?.!]+$/, '');
  }
  const tuanM = q.match(/\btuan (\d{1,2})\b/);
  const thangM = q.match(/\bthang (\d{1,2})\b/);
  const nhom: CauHoi['nhom'] =
    /\b(theo|tung|moi|cac) xuong\b|\bxuong nao\b/.test(q) ? 'xuong'
      : /\b(theo|tung|moi|cac) cong trinh\b|\bcong trinh nao\b|\btop\b|\bnhieu nhat\b/.test(q) ? 'congtrinh' : null;
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
  };
}
