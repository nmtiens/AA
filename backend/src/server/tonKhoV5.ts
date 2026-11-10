// Báo cáo "Tồn kho thành phẩm" bản v5 (tab Tổng quan sức khoẻ, /api/stock/health). File này không đụng DB:
// sqlTonKhoV5 dựng câu truy vấn, tinhTonKhoV5 tính payload từ dòng đã đọc. Giá trị: triệu đồng.
// Chi tiết sau từng con số: tonKhoV5ChiTiet.ts, đọc cùng kết quả phanTichV5.
// Định nghĩa dùng chung:
// - Tuổi = (ngày chốt − ngày nhập kho) / 30,4 làm tròn tháng; "cũ" = tuổi > 6 (từ 198 ngày); không có ngày nhập = không rõ tuổi.
// - HUỶ / xuất TÍNH chuẩn hoá trong JS: lower/ILIKE của DB không đổi hoa thường tiếng Việt.
// - Không dùng production_status_app.tinh_trang (cột đã đổi nội dung).
// - nhập/xuất/tồn cắt theo ngày xem; PSA không có lịch sử nên số lũy kế PSA luôn là bản mới nhất.

// ---- Dòng đầu vào ----
export interface DongTon { sap: string | null; hex: string | null; ct: string | null; ten: string | null; nk: string | null; sl: number; v: number; tkh: string | null; gc: string | null }
/** Tồn các lần chốt: sap chỉ có ở mốc cuối tháng (đo theo lô), lần chốt khác gom theo công trình + ngày nhập */
export interface DongMoc { d: string; sap: string | null; ct: string | null; ten: string | null; nk: string | null; v: number; sl: number }
export interface DongPsa { hex: string; ct: string | null; ten: string | null; pm: string | null; ipo: string | null; tn: string | null; nsp: string | null; dg: number; sld: number; sln: number }
/** PSA gom theo công trình + trạng thái (mọi HEX, kể cả công trình không còn tồn): số đơn của từng dự án */
export interface DongPsaNhom { ct: string | null; ten: string | null; pm: string | null; ipo: string | null; ttda: string | null; tn: string | null; gtd: number; nhapCap: number; con: number }
/** hex chỉ có ở HEX đang có dòng tồn; ct/ten lấy từ PSA theo HEX (null = không có PSA) */
export interface DongNhap { d: string; hex: string | null; ct: string | null; ten: string | null; sl: number | null; tt: number; gc: string | null }
export interface DongXuat { d: string; hex: string | null; ct: string | null; ten: string | null; tn: string | null; ipo: string | null; co: string; sl: number; tt: number; gc: string | null }

export interface InputTonKhoV5 {
  date: string;
  /** Mọi ngày có chốt từ cuối năm trước tới ngày xem */
  ngayChot: string[];
  ton: DongTon[];
  tonMoc: DongMoc[];
  psa: DongPsa[];
  psaNhom: DongPsaNhom[];
  nhap: DongNhap[];
  xuat: DongXuat[];
  /** Tên công trình chuẩn, cùng khoá gộp với /api/stock/by-project; không truyền thì chỉ chuẩn hoá khoảng trắng */
  tenChuan?: (ten: string | null) => string;
}

// ---- Payload ----
export type TheoDuAn = Record<string, number>;
export interface MocCuoiThang { d: string; v: number; cu: number; cuGoi: number; tonGoi: number; cu12: number; vuotMoc: number | null; ra: number | null }
export interface GoiDung { ct: string; ten: string; pm: string | null; ton: number; cu: number; nhap: number; xuat: number; xuatCuoi: string | null; ngayKhongXuat: number | null }
export interface GoiSoSanh { ct: string; ten: string; thang: string[]; nhapLuyKe: (number | null)[]; xuatLuyKe: (number | null)[]; ton: number; xuat60: number; xuatCuoi: string | null }
export interface GoiDongSo { ct: string; ten: string; ton: number; xuat60: number; xuatCuoi: string | null }
export interface DongDuAn {
  duAn: string; pm: string[]; hang: { ten: string; v: number }[]; ton: number; moi: number; cu: number; khongNgay: number; cu12: number;
  soMa: number; pctNhap: number | null; pctXuat: number | null; xuatCuoi: string | null; donChuaNhap: number;
}
export interface DongPhanChia { k: string; nhom: string; gt: number; cu: number; hex: number }
export interface DongChuaXuat { duAn: string; t01: number; t23: number; t46: number; t6: number; khong: number; thieuBo: number; tong: number }
export interface DongGoiCu { ct: string; ten: string; duAn: string; pm: string | null; cu: number; ra93: number; xuat60: number | null; xuatCuoi: string | null; huy?: boolean }
export interface DongKy { den: string; ngay: number; nhap: number; xuatTinh: number; chuaDoiSoat: number; ton: number; thangTon: number | null; kyDo: boolean }
export interface TonKhoV5 {
  date: string;
  /** ma = số mã SAP giá trị ≠ 0; ma0 = số mã chỉ có dòng giá trị 0 (không tính vào ma) */
  tong: { v: number; cu: number; cu12: number; khongNgay: number; ma: number; ma0: number; congTrinh: number; chuaXuat: number; chuaXuat4: number; du: number; duPhanLoai: number };
  moc: { d: string; v: number; cu: number }[];
  cuoiThang: MocCuoiThang[];
  duAnMoc: { d: string; da: Record<string, { v: number; cu: number }> }[];
  goiDung: GoiDung | null;
  soSanhGoi: GoiSoSanh[];
  /** Gói cùng PM còn lại, chỉ ghi dòng số */
  goiCungPm: GoiDongSo[];
  duAn: DongDuAn[];
  phanChia: DongPhanChia[];
  chuaXuatDuAn: DongChuaXuat[];
  goiCu: {
    dong: DongGoiCu[]; conLai: { soGoi: number; cu: number; ra93: number }; tong: { cu: number; ra93: number };
    /** Cửa sổ đo = 3 cặp mốc cuối tháng gần nhất: vào = lô vừa vượt mốc 6 tháng, ra = phần giảm của lô đã cũ */
    ngay: number; vao: number; ra: number; vaoThang: number; raThang: number;
  };
  loNhap: {
    seri: string[];
    /** thang: 'truoc' = trước cửa sổ 13 tháng, 'YYYY-MM', 'khong' = không có ngày nhập */
    cot: { thang: string; tong: number; cu: number; theoDuAn: TheoDuAn }[];
    /** Ngày nhập ứng với mốc "cũ" tại ngày xem (trái vạch = cũ) */
    vachCu: string;
    /** Mức trần khi tồn không đổi, không phải dự báo */
    moc6: { moc: string; gt: number; theoDuAn: TheoDuAn }[];
  };
  ky: { dong: DongKy[]; tong: { nhap: number; xuatTinh: number; chuaDoiSoat: number }; thangTheoLo: number | null };
  soSach: {
    tu: string | null; du: number; choVeKho: number; lapCongTrinh: number; daRoiKho: number; chuaRo: number; hexChuaVaoSo: number;
    theoMa: { ct: string | null; ten: string; duAn: string | null; du: number }[];
    kiemKe: { ten: string; gt: number; ghiChu: string | null }[];
  };
  doiChieu: {
    sapVuot: { den: string; gt: number; theoDuAn: { duAn: string; gt: number }[] };
    khongPsa: { gt: number; cu: number; lonNhat: { ct: string; ten: string; v: number }[] };
    huy: { gt: number; cu: number; ct: string[]; soGhi: string | null };
  };
}

// ---- Danh mục dự án: thứ tự là ưu tiên khớp, theo tên công trình viết hoa ----
export const DA_KHAC = 'Khác';
export const DANH_MUC_DU_AN: { ten: string; khop: RegExp }[] = [
  { ten: 'Nam Phương', khop: /NAM PHƯƠNG/ },
  { ten: 'Mini Hotel', khop: /MINI HOTEL/ },
  { ten: 'Holiday Inn Bà Nà', khop: /HOLIDAY IN(N)? BÀ NÀ/ },
  { ten: 'Tây Hồ View', khop: /T(Â|A)Y H(Ồ|Ô|O) VIEW/ },
  { ten: 'Trục Đông Tây 2C', khop: /TRỤC ĐÔNG TÂY/ },
  { ten: 'St.Regis + Marriott 43 ĐTM', khop: /ST\.REGIS|43 ĐẶNG THAI MAI|^MARRIOTT_ĐẠI TRÀ/ },
  { ten: 'Chateau de Saigon', khop: /CHATEAU/ },
  { ten: 'Cát Bà HH3', khop: /CÁT BÀ TÒA HH3/ },
  { ten: 'Tiến Bộ Plaza', khop: /TIẾN BỘ/ },
];
/** Dự án của 1 công trình: theo tên, sau đó theo mã (EM = xuất khẩu, TỒN = hàng lẻ) */
export const nhomDuAn = (ma: string | null | undefined, ten: string | null | undefined): string => {
  const t = (ten ?? '').normalize('NFC').toUpperCase();
  const m = (ma ?? '').trim();
  for (const d of DANH_MUC_DU_AN) if (d.khop.test(t)) return d.ten;
  if (/^EM\d/.test(m)) return 'Xuất khẩu (EM)';
  if (/^TỒN/.test(m)) return 'Hàng lẻ (mã TỒN)';
  return DA_KHAC;
};

// ---- Quy tắc nghiệp vụ ----
const NGUONG_GOI_DUNG = 0.02; // tồn ≥ 2% tổng mới xét "gói đứng yên"
const SO_NGAY_XUAT_GAN = 60;
const SO_THANG_LO_NHAP = 13; // cột tháng nhập riêng: 13 tháng trước tháng xem + tháng xem
const SO_GOI_SO_SANH = 2; // số gói vẽ cạnh gói đứng yên
const SO_GOI_CU = 8;
const SO_MA_DU = 4;
const SO_SERI_LO = 7;
const chuanHoa = (s: string | null | undefined) => (s ?? '').normalize('NFC').trim();
/** Dòng tồn có trạng thái giao hàng ĐÃ XUẤT */
export const laDaXuat = (tkh: string | null | undefined) => chuanHoa(tkh).toUpperCase() === 'ĐÃ XUẤT';
export const laHuy = (tn: string | null | undefined, ipo: string | null | undefined) =>
  /^h[uúủ]y$/i.test(chuanHoa(tn)) || chuanHoa(ipo).toUpperCase().includes('HỦY');
export const laXuatTinh = (r: { co: string; tt: number }) => chuanHoa(r.co).toUpperCase() === 'TÍNH' && r.tt > 0;

const MOT_NGAY = 864e5;
const soNgay = (den: string, tu: string) => Math.round((Date.parse(den) - Date.parse(tu)) / MOT_NGAY);
const luiNgay = (d: string, n: number) => new Date(Date.parse(d) - n * MOT_NGAY).toISOString().slice(0, 10);
/** ROUND(ngày / 30,4) tính bằng số nguyên: ngày đúng x,5 tháng (vd. 380) không lệch vì sai số dấu phẩy động */
export const tinhTuoi = (d: string, nk: string | null | undefined): number | null =>
  nk ? Math.floor((10 * soNgay(d, nk) + 152) / 304) : null;
export const laCu = (d: string, nk: string | null | undefined) => (tinhTuoi(d, nk) ?? 0) > 6;

/** Mốc cuối tháng: lần chốt cuối mỗi tháng, mốc cuối là ngày xem */
export const chonCuoiThang = (ngay: string[]): string[] => {
  const ds = [...new Set(ngay)].sort();
  const theoThang = new Map<string, string>();
  for (const d of ds) theoThang.set(d.slice(0, 7), d);
  return [...theoThang.values()];
};

const dauThangSau = (d: string, n: number) => {
  const t = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1 + n, 1));
  return t.toISOString().slice(0, 10);
};
/** Kỳ dở: mốc cuối còn hơn 7 ngày mới hết tháng (cột "Đến nay") */
export const laKyDo = (den: string) => soNgay(dauThangSau(den, 1), den) > 7;
const kieuGhiChu = (gc: string | null) => {
  const g = gc ?? '';
  if (/NHÀ CUNG CẤP|\bNCC\b|GIA CÔNG|\bGC\b|C\s*TIỆN|CTIỆN|PHÔI|SƠN ĐEN|TRỤ CHÂN|QUY CÁCH/i.test(g)) return 'GC';
  if (/BỔ SUNG|SỬA|\bBS\b/i.test(g)) return 'BS';
  if (/PHÒNG|BLOCK|TẦNG|CĂN|GIAO SAU|GIAO TRƯỚC|\bQR\b|CCBV|NCBV|CĐB|PHIẾU/i.test(g)) return 'GIAO';
  return g.trim() ? 'KHAC' : 'TRONG';
};
const LAP_TAI_CT = /LẮP TẠI CÔNG TRÌNH|CÔNG TRÌNH LẮP|KÍNH CÔNG TRÌNH|ĐÁ CÔNG TRÌNH|KÍNH \+ ĐÁ CÔNG TRÌNH|ĐÁ\+KÍNH CÔNG TRÌNH|NHÀ THẦU PHỤ|\bNTP\b|TẠI CÔNG TRÌNH/;

export const lam = (x: number) => Math.round(x * 1000) / 1000;
const cong = <K>(m: Map<K, number>, k: K, x: number) => m.set(k, (m.get(k) ?? 0) + x);
const lamMap = (m: Map<string, number>): TheoDuAn => Object.fromEntries([...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, lam(v)]));
const dauBang = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]);
export const tong = <T>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + f(x), 0);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);

export interface TongCt { ten: string | null; v: number; cu: number; cu12: number }
interface XuatCt { tt: number; sl: number; d: string; tt60: number }

/** Tên nhóm sản phẩm bỏ số thứ tự đầu: "03. TỦ" -> "TỦ" */
export const tenNhomSp = (nsp: string | null | undefined) => (nsp || '?').replace(/^\d+\.\s*/, '');
/** Dòng đơn PSA có vào "đơn chưa nhập" */
export const laDonCon = (p: { ipo: string | null; ttda: string | null }) => /ĐANG SẢN XUẤT|CẦN XỬ LÝ|TẠM/.test(p.ipo ?? '') && p.ttda !== 'ĐÓNG DỰ ÁN';

// ---- Phần phân tích dùng chung: payload và chi tiết (tonKhoV5ChiTiet.ts) đọc cùng 1 kết quả phân loại, không tính lại công thức ----
export type NhomTuoiCx = 't01' | 't23' | 't46' | 't6' | 'khong' | 'thieuBo';
/** Lô (mã SAP + công trình + ngày nhập) đổi giữa 2 mốc cuối tháng S[i-1] -> S[i]; gt = phần vượt mốc hoặc phần ra */
export interface DongLo { i: number; d: string; A: string; sap: string | null; ct: string; ten: string | null; nk: string; dau: number; cuoi: number; gt: number }
/** HEX có lô chưa vào sổ */
export interface HexChuaVaoSo { hex: string; ct: string | null; ten: string | null; nhap: number; sl: number; ton: number; gt: number; lap: boolean; gc: string }
/** HEX đã rời kho (ước) */
export interface HexRoiKho { hex: string; ct: string | null; ten: string | null; sl: number; giao: number; xuatSl: number; ton: number; gt: number }
/** Dư 1 mã công trình trên 1 khoảng; ct '' = dòng không gán được mã */
export interface DuMa { ct: string; dau: number; nhap: number; xuat: number; cuoi: number; du: number }
export interface PhanTichV5 {
  kq: TonKhoV5;
  O: DongTon[]; P: Map<string, DongPsa>; nhap: DongNhap[]; xuat: DongXuat[]; S: string[]; d60: string;
  daOf: (ct: string | null, ten: string | null) => string; daTon: (t: DongTon) => string; daSeri: (t: DongTon) => string;
  theoNgay: Map<string, { v: number; cu: number; cu12: number; ct: Map<string, TongCt> }>;
  /** Nhóm phân chia của từng dòng tồn; cx có ở nhóm chuaXuat */
  nhomTon: Map<DongTon, { nhom: string; cx?: { duAn: string; k: NhomTuoiCx } }>;
  dongHuy: Set<DongTon>; khongPsa: DongTon[];
  loVao: DongLo[]; loRa: DongLo[]; iRa: number;
  goiCt: string | null;
  goiDau: DongGoiCu[]; goiSau: DongGoiCu[];
  moc6Dong: { moc: string; dong: DongTon[] }[];
  thangLo: (t: DongTon) => string;
  chuaVaoSo: HexChuaVaoSo[]; roiKho: HexRoiKho[];
  duGiua: (tu: string, den: string) => DuMa[];
  maDu: string[];
  tenMa: (ct: string) => string | null;
}

export const tinhTonKhoV5 = (input: InputTonKhoV5): TonKhoV5 => phanTichV5(input).kq;

const daPhanTich = new WeakMap<InputTonKhoV5, PhanTichV5>(); // bấm chi tiết liên tiếp trên cùng đầu vào không tính lại
export const phanTichV5 = (input: InputTonKhoV5): PhanTichV5 => {
  const co = daPhanTich.get(input);
  if (co) return co;
  const pt = tinhPhanTich(input);
  daPhanTich.set(input, pt);
  return pt;
};

const tinhPhanTich = (input: InputTonKhoV5): PhanTichV5 => {
  const { date } = input;
  const ton = input.ton;
  const O = ton.filter(t => t.v);
  const P = new Map(input.psa.map(p => [p.hex, p]));
  const nhap = input.nhap.filter(r => r.d <= date);
  const xuat = input.xuat.filter(r => r.d <= date);
  const tonMoc = input.tonMoc.filter(t => t.d <= date);
  const S = chonCuoiThang(input.ngayChot.filter(d => d <= date));
  const d60 = luiNgay(date, SO_NGAY_XUAT_GAN);
  const daCua = new Map<string, string>();
  const daOf = (ct: string | null, ten: string | null) => {
    const k = `${ct}|${ten}`;
    let v = daCua.get(k);
    if (v === undefined) { v = nhomDuAn(ct, ten); daCua.set(k, v); }
    return v;
  };
  const daTon = (t: DongTon) => { const p = t.hex ? P.get(t.hex) : undefined; return daOf(t.ct, p ? p.ten : t.ten); };

  // Xuất TÍNH theo HEX và theo công trình; dòng xuất theo HEX; dòng cờ trống phân loại theo ghi chú
  const XT = new Map<string, XuatCt>();
  const xtCt = new Map<string, XuatCt>();
  const coDongXuat = new Set<string>();
  const giaoTrong = new Map<string, number>();
  const cuoiXuatDa = new Map<string, string>();
  const xuatDa = new Map<string, number>();
  const themXt = (m: Map<string, XuatCt>, k: string, r: DongXuat) => {
    const a = m.get(k) ?? { tt: 0, sl: 0, d: '', tt60: 0 };
    a.tt += r.tt; a.sl += r.sl || 0;
    if (r.d > a.d) a.d = r.d;
    if (r.d >= d60) a.tt60 += r.tt;
    m.set(k, a);
  };
  for (const r of xuat) {
    if (r.hex) coDongXuat.add(r.hex);
    if (laXuatTinh(r)) {
      if (r.hex) themXt(XT, r.hex, r);
      if (r.ct) {
        themXt(xtCt, r.ct, r);
        const da = daOf(r.ct, r.ten);
        cong(xuatDa, da, r.tt);
        if (!laHuy(r.tn, r.ipo) && r.d > (cuoiXuatDa.get(da) ?? '')) cuoiXuatDa.set(da, r.d);
      }
    }
    if (r.hex && chuanHoa(r.co) === '' && kieuGhiChu(r.gc) === 'GIAO') cong(giaoTrong, r.hex, r.sl || 0);
  }
  // Nhập theo dự án / công trình
  const nhapDa = new Map<string, number>();
  const nhapCt = new Map<string, number>();
  for (const r of nhap) {
    if (!r.ct) continue;
    cong(nhapDa, daOf(r.ct, r.ten), r.tt);
    cong(nhapCt, r.ct, r.tt);
  }

  // ---- Các lần chốt ----
  const theoNgay = new Map<string, { v: number; cu: number; cu12: number; ct: Map<string, TongCt> }>();
  for (const t of tonMoc) {
    const e = theoNgay.get(t.d) ?? { v: 0, cu: 0, cu12: 0, ct: new Map<string, TongCt>() };
    const tuoi = tinhTuoi(t.d, t.nk) ?? 0;
    e.v += t.v;
    if (tuoi > 6) e.cu += t.v;
    if (tuoi > 12) e.cu12 += t.v;
    const k = t.ct ?? '';
    const c = e.ct.get(k) ?? { ten: t.ten, v: 0, cu: 0, cu12: 0 };
    if (t.ten && (!c.ten || t.ten < c.ten)) c.ten = t.ten;
    c.v += t.v;
    if (tuoi > 6) c.cu += t.v;
    e.ct.set(k, c);
    theoNgay.set(t.d, e);
  }
  const ngayCoTon = [...theoNgay.keys()].sort();
  const moc = ngayCoTon.map(d => { const e = theoNgay.get(d)!; return { d, v: lam(e.v), cu: lam(e.cu) }; });
  const duAnMoc = ngayCoTon.map(d => {
    const m = new Map<string, { v: number; cu: number }>();
    for (const [ct, c] of theoNgay.get(d)!.ct) {
      const k = daOf(ct, c.ten), a = m.get(k) ?? { v: 0, cu: 0 };
      a.v += c.v; a.cu += c.cu; m.set(k, a);
    }
    return { d, da: Object.fromEntries([...m].map(([k, a]) => [k, { v: lam(a.v), cu: lam(a.cu) }])) };
  });

  // Lô = mã SAP + công trình + ngày nhập, đo tại mốc cuối tháng
  type Lo = { v: number; nk: string; ct: string; sap: string | null; ten: string | null };
  const lo = new Map<string, Map<string, Lo>>();
  const maCt = new Map<string, Map<string, { q: number; v: number }>>(); // mã SAP + công trình (không theo lô)
  const laMoc = new Set(S);
  for (const t of tonMoc) {
    if (!laMoc.has(t.d) || !t.v) continue;
    const ct = t.ct ?? '';
    if (t.nk) {
      const m = lo.get(t.d) ?? new Map<string, Lo>();
      const k = `${t.sap}|${ct}|${t.nk}`, e = m.get(k) ?? { v: 0, nk: t.nk, ct, sap: t.sap, ten: t.ten };
      e.v += t.v; m.set(k, e); lo.set(t.d, m);
    }
    const m2 = maCt.get(t.d) ?? new Map<string, { q: number; v: number }>();
    const k2 = `${t.sap}|${ct}`, e2 = m2.get(k2) ?? { q: 0, v: 0 };
    e2.q += t.sl || 0; e2.v += t.v; m2.set(k2, e2); maCt.set(t.d, m2);
  }
  const raTheoCt = new Map<string, number>();
  // Cửa sổ "3 tháng gần nhất": 3 cặp mốc; có kỳ dở thì thêm 1 cặp để vẫn đủ 3 tháng
  const iRa = Math.max(1, S.length - (S.length && laKyDo(S[S.length - 1]) ? 4 : 3));
  const loVao: DongLo[] = [], loRa: DongLo[] = [];
  const vaoRa = S.map((d, i) => {
    if (!i) return { vao: null as number | null, ra: null as number | null };
    const A = S[i - 1];
    const truoc = lo.get(A) ?? new Map<string, Lo>();
    const sau = lo.get(d) ?? new Map<string, Lo>();
    let vao = 0, ra = 0;
    for (const [k, e] of truoc) {
      if (!laCu(A, e.nk)) continue;
      const dv = e.v - (sau.get(k)?.v ?? 0);
      if (dv > 0) {
        ra += dv;
        if (i >= iRa) cong(raTheoCt, e.ct, dv);
        loRa.push({ i, d, A, sap: e.sap, ct: e.ct, ten: e.ten, nk: e.nk, dau: e.v, cuoi: e.v - dv, gt: dv });
      }
    }
    for (const [k, e] of sau) {
      if (laCu(d, e.nk) && (!truoc.has(k) || !laCu(A, e.nk))) {
        vao += e.v;
        loVao.push({ i, d, A, sap: e.sap, ct: e.ct, ten: e.ten, nk: e.nk, dau: truoc.get(k)?.v ?? 0, cuoi: e.v, gt: e.v });
      }
    }
    return { vao, ra };
  });

  // ---- Tổng ngày xem ----
  const tongV = tong(O, t => t.v);
  const cuRows = O.filter(t => laCu(date, t.nk));
  const tongCu = tong(cuRows, t => t.v);
  const tonCt = new Map<string, number>();
  const cuCt = new Map<string, number>();
  for (const t of O) { cong(tonCt, t.ct ?? '', t.v); if (laCu(date, t.nk)) cong(cuCt, t.ct ?? '', t.v); }
  const tenCt = new Map<string, string>();
  for (const t of O) if (t.ct && t.ten && !tenCt.has(t.ct)) tenCt.set(t.ct, t.ten.trim());
  const pmCt = (ct: string) => {
    const m = new Map<string, number>();
    for (const t of O) { const p = t.ct === ct && t.hex ? P.get(t.hex) : undefined; if (p?.pm) cong(m, p.pm, t.v); }
    return dauBang(m)[0]?.[0] ?? null;
  };

  // ---- Gói đứng yên ----
  let goiCt: string | null = null;
  for (const [ct, v] of tonCt) {
    if (!/^CT\d/.test(ct) || tongV <= 0 || v < NGUONG_GOI_DUNG * tongV) continue;
    if ((xtCt.get(ct)?.tt60 ?? 0) > 0) continue;
    if (!goiCt || v > (tonCt.get(goiCt) ?? 0)) goiCt = ct;
  }
  const xuatCuoiCt = (ct: string) => xtCt.get(ct)?.d || null;
  let goiDung: GoiDung | null = null;
  if (goiCt) {
    const xc = xuatCuoiCt(goiCt);
    goiDung = {
      ct: goiCt, ten: tenCt.get(goiCt) ?? '', pm: pmCt(goiCt), ton: lam(tonCt.get(goiCt) ?? 0), cu: lam(cuCt.get(goiCt) ?? 0),
      nhap: lam(nhapCt.get(goiCt) ?? 0), xuat: lam(xtCt.get(goiCt)?.tt ?? 0), xuatCuoi: xc, ngayKhongXuat: xc ? soNgay(date, xc) : null,
    };
  }

  // Gói cùng PM có xuất 60 ngày, ưu tiên cùng dự án rồi xuất lớn nhất: 2 gói đầu vẽ chuỗi lũy kế theo tháng dùng chung trục, còn lại ghi dòng số
  const soSanhGoi: GoiSoSanh[] = [];
  const goiCungPm: GoiDongSo[] = [];
  if (goiDung) {
    const pm = goiDung.pm, daGoi = daOf(goiDung.ct, goiDung.ten);
    const pmDon = new Map<string, Map<string, number>>(); // mã → PM → giá trị đơn: 1 mã có thể lẫn vài dòng PM khác, lấy PM chính
    const cungPm = new Map<string, boolean>(); // mã → cùng dự án với gói đứng yên
    for (const p of input.psaNhom) {
      if (!p.ct || !p.pm || p.ct === goiDung.ct || !/^CT\d/.test(p.ct)) continue;
      const m = pmDon.get(p.ct) ?? new Map<string, number>();
      cong(m, p.pm, p.gtd); pmDon.set(p.ct, m);
      cungPm.set(p.ct, !!cungPm.get(p.ct) || daOf(p.ct, p.ten) === daGoi);
    }
    for (const [ct, m] of pmDon) if (dauBang(m)[0][0] !== pm) cungPm.delete(ct);
    const xepHang = [...cungPm].map(([ct, cungDa]) => ({ ct, cungDa, x60: xtCt.get(ct)?.tt60 ?? 0 })).filter(x => x.x60 > 0)
      .sort((a, b) => Number(b.cungDa) - Number(a.cungDa) || b.x60 - a.x60).map(x => x.ct);
    const tenGoi = (ct: string) => tenCt.get(ct) ?? input.psaNhom.find(p => p.ct === ct)?.ten?.trim() ?? '';
    for (const ct of xepHang.slice(SO_GOI_SO_SANH)) {
      goiCungPm.push({ ct, ten: tenGoi(ct), ton: lam(tonCt.get(ct) ?? 0), xuat60: lam(xtCt.get(ct)?.tt60 ?? 0), xuatCuoi: xuatCuoiCt(ct) });
    }
    const cts = [goiDung.ct, ...xepHang.slice(0, SO_GOI_SO_SANH)];
    const thangN = new Map<string, Map<string, number>>(), thangX = new Map<string, Map<string, number>>();
    for (const c of cts) { thangN.set(c, new Map()); thangX.set(c, new Map()); }
    let dau = date.slice(0, 7);
    for (const r of nhap) { const m = r.ct ? thangN.get(r.ct) : undefined; if (m) { const t = r.d.slice(0, 7); cong(m, t, r.tt); if (t < dau) dau = t; } }
    for (const r of xuat) { const m = r.ct ? thangX.get(r.ct) : undefined; if (m && laXuatTinh(r)) { const t = r.d.slice(0, 7); cong(m, t, r.tt); if (t < dau) dau = t; } }
    const thang: string[] = [];
    for (let i = 0; i < 240; i++) { const t = dauThangSau(`${dau}-01`, i).slice(0, 7); thang.push(t); if (t >= date.slice(0, 7)) break; }
    for (const ct of cts) {
      const mN = thangN.get(ct)!, mX = thangX.get(ct)!;
      let a = 0, b = 0, batDau = false;
      const nhapLuyKe: (number | null)[] = [], xuatLuyKe: (number | null)[] = [];
      for (const t of thang) {
        if (mN.has(t) || mX.has(t)) batDau = true;
        a += mN.get(t) ?? 0; b += mX.get(t) ?? 0;
        nhapLuyKe.push(batDau ? lam(a) : null); xuatLuyKe.push(batDau ? lam(b) : null);
      }
      soSanhGoi.push({
        ct, ten: tenGoi(ct), thang, nhapLuyKe, xuatLuyKe,
        ton: lam(tonCt.get(ct) ?? 0), xuat60: lam(xtCt.get(ct)?.tt60 ?? 0), xuatCuoi: xuatCuoiCt(ct),
      });
    }
  }

  // ---- Bảng dự án ----
  const donDa = new Map<string, { gtd: number; nhapCap: number; con: number }>();
  for (const p of input.psaNhom) {
    if (laHuy(p.tn, p.ipo)) continue;
    const k = daOf(p.ct, p.ten), a = donDa.get(k) ?? { gtd: 0, nhapCap: 0, con: 0 };
    a.gtd += p.gtd; a.nhapCap += p.nhapCap;
    if (laDonCon(p)) a.con += p.con;
    donDa.set(k, a);
  }
  const nhomTon = new Map<string, DongTon[]>();
  for (const t of O) { const k = daTon(t); const a = nhomTon.get(k); if (a) a.push(t); else nhomTon.set(k, [t]); }
  const duAn: DongDuAn[] = [...nhomTon].map(([k, a]) => {
    const pm = new Map<string, number>(), ns = new Map<string, number>();
    const ma = new Set<string>();
    let cu = 0, cu12 = 0, moi = 0, khongNgay = 0, v = 0;
    for (const t of a) {
      v += t.v; ma.add(`${t.sap}|${t.ct}`);
      const tuoi = tinhTuoi(date, t.nk);
      if (tuoi === null) khongNgay += t.v;
      else if (tuoi > 6) { cu += t.v; if (tuoi > 12) cu12 += t.v; }
      else moi += t.v;
      const p = t.hex ? P.get(t.hex) : undefined;
      if (p) {
        if (p.pm) cong(pm, p.pm, t.v);
        cong(ns, tenNhomSp(p.nsp), t.v);
      }
    }
    const don = donDa.get(k) ?? { gtd: 0, nhapCap: 0, con: 0 };
    return {
      duAn: k, pm: dauBang(pm).slice(0, 2).map(x => x[0]), hang: dauBang(ns).slice(0, 3).map(([ten, x]) => ({ ten, v: lam(x) })),
      ton: lam(v), moi: lam(moi), cu: lam(cu), khongNgay: lam(khongNgay), cu12: lam(cu12), soMa: ma.size,
      pctNhap: pct(don.nhapCap, don.gtd), pctXuat: pct(xuatDa.get(k) ?? 0, nhapDa.get(k) ?? 0),
      xuatCuoi: cuoiXuatDa.get(k) ?? null, donChuaNhap: lam(don.con),
    };
  }).sort((a, b) => b.ton - a.ton);

  // ---- Phân loại theo HEX (không PSA gom theo mã + công trình) ----
  const H = new Map<string, { hex: string | null; rows: DongTon[] }>();
  for (const t of O) {
    const co = t.hex ? P.has(t.hex) : false;
    const k = co ? t.hex! : `_${t.sap}${t.ct}`;
    const e = H.get(k) ?? { hex: co ? t.hex : null, rows: [] };
    e.rows.push(t); H.set(k, e);
  }
  const NHOM: [string, string][] = [
    ['chuaXuat', 'Chưa xuất TÍNH'], ['giaoDo', 'Giao dở'], ['ganXong', 'Gần xong'], ['theoNhip', 'Theo nhịp nhập'], ['huy', 'Đơn huỷ'], ['khongPsa', 'Không PSA'],
  ];
  const chia = new Map(NHOM.map(([k, nhom]) => [k, { k, nhom, gt: 0, cu: 0, hex: 0 }]));
  const cxDa = new Map<string, DongChuaXuat>();
  const nhomCuaTon: PhanTichV5['nhomTon'] = new Map();
  for (const r of H.values()) {
    const p = r.hex ? P.get(r.hex) : undefined;
    let nhom: string;
    if (!p) nhom = 'khongPsa';
    else if (laHuy(p.tn, p.ipo)) nhom = 'huy';
    else {
      const n = p.sln || 0, x = XT.get(p.hex)?.sl ?? 0;
      const rx = n > 0 ? x / n : 0, rn = p.sld > 0 ? n / p.sld : 0;
      nhom = rx < 0.05 ? 'chuaXuat' : rx >= 0.85 ? (rn >= 0.8 ? 'ganXong' : 'theoNhip') : 'giaoDo';
      if (nhom === 'chuaXuat') {
        const thieu = (giaoTrong.get(p.hex) ?? 0) >= 0.5 * (n || 1); // suy luận từ ghi chú dòng cờ trống
        const da = daOf(p.ct, p.ten);
        const A = cxDa.get(da) ?? { duAn: da, t01: 0, t23: 0, t46: 0, t6: 0, khong: 0, thieuBo: 0, tong: 0 };
        for (const t of r.rows) {
          const tuoi = tinhTuoi(date, t.nk);
          const k: NhomTuoiCx = thieu ? 'thieuBo' : tuoi === null ? 'khong' : tuoi > 6 ? 't6' : tuoi > 3 ? 't46' : tuoi > 1 ? 't23' : 't01';
          A[k] += t.v; A.tong += t.v;
          nhomCuaTon.set(t, { nhom, cx: { duAn: da, k } });
        }
        cxDa.set(da, A);
      }
    }
    const s = chia.get(nhom)!;
    s.hex++;
    for (const t of r.rows) {
      s.gt += t.v;
      if (laCu(date, t.nk)) s.cu += t.v;
      if (!nhomCuaTon.has(t)) nhomCuaTon.set(t, { nhom });
    }
  }
  const phanChia = [...chia.values()].map(s => ({ ...s, gt: lam(s.gt), cu: lam(s.cu) }));
  const chuaXuatTong = tong([...cxDa.values()], a => a.tong);
  const chuaXuat4 = tong([...cxDa.values()], a => a.t46 + a.t6);
  const chuaXuatDuAn = [...cxDa.values()].sort((a, b) => (b.t46 + b.t6) - (a.t46 + a.t6) || b.tong - a.tong)
    .map(a => ({ duAn: a.duAn, t01: lam(a.t01), t23: lam(a.t23), t46: lam(a.t46), t6: lam(a.t6), khong: lam(a.khong), thieuBo: lam(a.thieuBo), tong: lam(a.tong) }));

  // ---- Đơn huỷ, không PSA ----
  const dongHuy = O.filter(t => { const p = t.hex ? P.get(t.hex) : undefined; return !!p && laHuy(p.tn, p.ipo); });
  const huyGt = tong(dongHuy, t => t.v);
  const dongCuHuy = dongHuy.filter(t => laCu(date, t.nk));
  const laCuHuy = new Set(dongCuHuy);
  const huyCu = tong(dongCuHuy, t => t.v);
  const ghiMa = new Map<string, number>();
  for (const t of dongHuy) {
    const m = (t.gc ?? '').match(/CT\d{2}-\d{3}/)?.[0];
    if (m && m !== t.ct) cong(ghiMa, m, t.v);
  }
  const soGhi = dauBang(ghiMa)[0]?.[0] ?? null;
  const khongPsa = O.filter(t => !(t.hex && P.has(t.hex)));
  const kpCt = new Map<string, number>();
  for (const t of khongPsa) cong(kpCt, t.ct ?? '', t.v);

  // ---- Gói hàng cũ ----
  const cuTheoCt = new Map<string, DongTon[]>();
  for (const t of cuRows) { const k = t.ct ?? ''; const a = cuTheoCt.get(k); if (a) a.push(t); else cuTheoCt.set(k, [t]); }
  const dongGoi: DongGoiCu[] = [];
  for (const [ct, a] of cuTheoCt) {
    const huy = tong(a.filter(t => laCuHuy.has(t)), t => t.v);
    const cu = tong(a, t => t.v) - huy;
    const pm = new Map<string, number>();
    for (const t of a) { const p = t.hex ? P.get(t.hex) : undefined; if (p?.pm) cong(pm, p.pm, t.v); }
    const ten = (a[0].ten ?? '').trim(), da = daTon(a[0]), pmChinh = dauBang(pm)[0]?.[0] ?? null;
    const ra93 = raTheoCt.get(ct) ?? 0;
    if (cu > 0.5 || ra93 > 0 || !huy) dongGoi.push({ ct, ten, duAn: da, pm: pmChinh, cu, ra93, xuat60: xtCt.get(ct)?.tt60 ?? 0, xuatCuoi: xuatCuoiCt(ct) });
    if (huy) dongGoi.push({ ct, ten, duAn: da, pm: pmChinh, cu: huy, ra93: 0, xuat60: null, xuatCuoi: null, huy: true });
  }
  dongGoi.sort((a, b) => b.cu - a.cu);
  const goiDau = dongGoi.slice(0, SO_GOI_CU), goiSau = dongGoi.slice(SO_GOI_CU);
  const cuaSoNgay = S.length >= 2 ? soNgay(S[S.length - 1], S[iRa - 1]) : 0;
  const vao93 = tong(vaoRa.slice(iRa), x => x.vao ?? 0), ra93 = tong(vaoRa.slice(iRa), x => x.ra ?? 0);

  // ---- Lô nhập theo tháng ----
  const seri = duAn.map(d => d.duAn).filter(k => k !== DA_KHAC).slice(0, SO_SERI_LO);
  const daSeri = (t: DongTon) => { const k = daTon(t); return seri.includes(k) ? k : DA_KHAC; };
  const moThang = dauThangSau(date, -SO_THANG_LO_NHAP);
  const thangLo = (t: DongTon) => (!t.nk ? 'khong' : t.nk < moThang ? 'truoc' : t.nk.slice(0, 7));
  const cot = new Map<string, { thang: string; tong: number; cu: number; da: Map<string, number> }>();
  for (const t of O) {
    const thang = thangLo(t);
    const c = cot.get(thang) ?? { thang, tong: 0, cu: 0, da: new Map<string, number>() };
    c.tong += t.v;
    if (laCu(date, t.nk)) c.cu += t.v;
    cong(c.da, daSeri(t), t.v);
    cot.set(thang, c);
  }
  const hangCot = (t: string) => (t === 'truoc' ? '0' : t === 'khong' ? '9' : t);
  const moc6: { moc: string; gt: number; theoDuAn: TheoDuAn }[] = [];
  const moc6Dong: PhanTichV5['moc6Dong'] = [];
  const sapVuotDa = new Map<string, number>();
  let mocTruoc = date;
  for (let i = 1; i <= 3; i++) {
    const d = dauThangSau(date, i);
    const dong = O.filter(t => t.nk && !laCu(mocTruoc, t.nk) && laCu(d, t.nk));
    const m = new Map<string, number>();
    for (const t of dong) { cong(m, daSeri(t), t.v); cong(sapVuotDa, daTon(t), t.v); }
    moc6.push({ moc: d, gt: lam(tong(dong, t => t.v)), theoDuAn: lamMap(m) });
    moc6Dong.push({ moc: d, dong });
    mocTruoc = d;
  }

  // ---- Theo kỳ: dư = tồn đầu + nhập − tồn cuối − xuất TÍNH ----
  const tonTai = (d: string) => theoNgay.get(d)?.v ?? 0;
  const kyDong = S.slice(1).map((b, i) => ({ den: b, tu: S[i], ngay: soNgay(b, S[i]), nhap: 0, xuat: 0 }));
  for (const r of nhap) { const k = kyDong.find(x => r.d > x.tu && r.d <= x.den); if (k) k.nhap += r.tt; }
  for (const r of xuat) { if (!laXuatTinh(r)) continue; const k = kyDong.find(x => r.d > x.tu && r.d <= x.den); if (k) k.xuat += r.tt; }
  const ky: DongKy[] = kyDong.map((k, i) => {
    const w = kyDong.slice(Math.max(0, i - 2), i + 1);
    const xw = tong(w, x => x.xuat), nw = tong(w, x => x.ngay);
    return {
      den: k.den, ngay: k.ngay, nhap: lam(k.nhap), xuatTinh: lam(k.xuat), chuaDoiSoat: lam(tonTai(k.tu) + k.nhap - tonTai(k.den) - k.xuat),
      ton: lam(tonTai(k.den)), thangTon: i >= 2 && xw > 0 ? Math.round((tonTai(k.den) / (xw / nw * 30)) * 100) / 100 : null,
      kyDo: i === kyDong.length - 1 && laKyDo(k.den),
    };
  });
  const du = tong(kyDong, k => k.nhap - k.xuat) + (S.length >= 2 ? tonTai(S[0]) - tonTai(S[S.length - 1]) : 0);
  // Cùng cách đo lô cho toàn kho: phần giảm số lượng của mã + công trình qua 3 cặp mốc gần nhất
  let raKho = 0;
  for (let i = iRa; i < S.length; i++) {
    const a = maCt.get(S[i - 1]), b = maCt.get(S[i]);
    if (!a) continue;
    for (const [k, e] of a) {
      const dq = (b?.get(k)?.q ?? 0) - e.q;
      if (dq < 0 && e.q) raKho += -dq * (e.v / e.q);
    }
  }
  const thangTheoLo = raKho > 0 && cuaSoNgay > 0 ? Math.round((tongV / (raKho / cuaSoNgay * 30)) * 100) / 100 : null;

  // ---- Sổ sách: phần dư đã phân loại được ----
  const tvHex = new Map<string, { v: number; sl: number }>();
  const hexSoNgoai = new Set<string>(); // HEX có dòng số lượng > 0, giá trị 0
  const tonHex = new Map<string, { v: number; sl: number }>();
  for (const t of ton) {
    if (!t.hex) continue;
    if (t.v > 0) { const a = tvHex.get(t.hex) ?? { v: 0, sl: 0 }; a.v += t.v; a.sl += t.sl || 0; tvHex.set(t.hex, a); }
    if (!(t.v > 0) && t.sl > 0) hexSoNgoai.add(t.hex);
    if (t.v) { const a = tonHex.get(t.hex) ?? { v: 0, sl: 0 }; a.v += t.v; a.sl += t.sl || 0; tonHex.set(t.hex, a); }
  }
  const nhapHex = new Map<string, DongNhap[]>();
  for (const r of nhap) { if (!r.hex) continue; const a = nhapHex.get(r.hex); if (a) a.push(r); else nhapHex.set(r.hex, [r]); }
  let chuaVaoSo = 0, lapCongTrinh = 0, hexChuaVaoSo = 0;
  const dsChuaVaoSo: HexChuaVaoSo[] = [], dsRoiKho: HexRoiKho[] = [];
  for (const [h, rs] of nhapHex) {
    const p = P.get(h);
    if (!p || laHuy(p.tn, p.ipo) || coDongXuat.has(h) || !hexSoNgoai.has(h)) continue;
    const zz = rs.filter(r => r.sl === 0 && r.tt > 0);
    if (!zz.length || zz.reduce((m, r) => (r.d > m ? r.d : m), '') < `${date.slice(0, 4)}-01-01`) continue;
    const tt = tong(rs, r => r.tt), sl = tong(rs, r => r.sl || 0), tt0 = tong(zz, r => r.tt);
    const t = tvHex.get(h), u = t && t.sl ? t.v / t.sl : (p.dg || 0) / 1e6;
    const pend = Math.max(0, Math.min(tt0, tt - sl * u));
    if (pend <= 0.5) continue;
    chuaVaoSo += pend; hexChuaVaoSo++;
    const gc = zz.map(r => chuanHoa(r.gc).toUpperCase()).join(' || ');
    const lap = LAP_TAI_CT.test(gc);
    if (lap) lapCongTrinh += pend;
    dsChuaVaoSo.push({ hex: h, ct: p.ct, ten: p.ten, nhap: tt, sl, ton: t?.v ?? 0, gt: pend, lap, gc });
  }
  let daRoiKho = 0;
  for (const [h, a] of tonHex) {
    const p = P.get(h), giao = giaoTrong.get(h) ?? 0;
    if (!p || !a.sl || !giao || laHuy(p.tn, p.ipo)) continue;
    const r = Math.min(a.sl, Math.max(giao - (XT.get(h)?.sl ?? 0), 0));
    if (r > 0) {
      daRoiKho += r * a.v / a.sl;
      dsRoiKho.push({ hex: h, ct: p.ct, ten: p.ten, sl: a.sl, giao, xuatSl: XT.get(h)?.sl ?? 0, ton: a.v, gt: r * a.v / a.sl });
    }
  }
  const duPhanLoai = chuaVaoSo + daRoiKho;

  // Dư theo mã trên 1 khoảng mốc: đầu + nhập − cuối − xuất TÍNH; nhập/xuất không có PSA vào dòng ct '' để cộng đủ tổng
  const duGiua = (tu: string, den: string): DuMa[] => {
    const m = new Map<string, DuMa>();
    const lay = (ct: string) => { let e = m.get(ct); if (!e) { e = { ct, dau: 0, nhap: 0, xuat: 0, cuoi: 0, du: 0 }; m.set(ct, e); } return e; };
    for (const [ct, c] of theoNgay.get(tu)?.ct ?? []) lay(ct).dau += c.v;
    for (const [ct, c] of theoNgay.get(den)?.ct ?? []) lay(ct).cuoi += c.v;
    for (const r of nhap) if (r.d > tu && r.d <= den) lay(r.ct ?? '').nhap += r.tt;
    for (const r of xuat) if (r.d > tu && r.d <= den && laXuatTinh(r)) lay(r.ct ?? '').xuat += r.tt;
    for (const e of m.values()) e.du = e.dau + e.nhap - e.cuoi - e.xuat;
    return [...m.values()];
  };
  // Dư theo mã công trình trên cùng khoảng với K7
  const duCt = new Map<string, number>();
  if (S.length >= 2) for (const e of duGiua(S[0], S[S.length - 1])) duCt.set(e.ct, e.du);
  const tenPsa = new Map<string, string | null>();
  for (const p of input.psaNhom) if (p.ct && !tenPsa.has(p.ct)) tenPsa.set(p.ct, p.ten);
  const maDu = dauBang(duCt).filter(x => /^CT\d/.test(x[0])).slice(0, SO_MA_DU);
  const tenMa = (ct: string) => tenPsa.get(ct) ?? tenCt.get(ct) ?? null;
  const theoMa: TonKhoV5['soSach']['theoMa'] = maDu.map(([ct, v]) => {
    const ten = tenMa(ct);
    return { ct, ten: (ten ?? '').trim(), duAn: daOf(ct, ten), du: lam(v) };
  });
  theoMa.push({ ct: null, ten: 'Các mã còn lại', duAn: null, du: lam(du - tong(maDu, x => x[1])) });
  const daXuatSo = tong(O.filter(t => laDaXuat(t.tkh)), t => t.v);

  const cuoiThang: MocCuoiThang[] = S.map((d, i) => {
    const e = theoNgay.get(d), g = goiCt ? e?.ct.get(goiCt) : undefined;
    return {
      d, v: lam(e?.v ?? 0), cu: lam(e?.cu ?? 0), cuGoi: lam(g?.cu ?? 0), tonGoi: lam(g?.v ?? 0), cu12: lam(e?.cu12 ?? 0),
      vuotMoc: vaoRa[i].vao === null ? null : lam(vaoRa[i].vao!), ra: vaoRa[i].ra === null ? null : lam(vaoRa[i].ra!),
    };
  });

  const soMa = new Set(O.map(t => t.sap)).size;
  const tenChuan = input.tenChuan ?? ((t: string | null) => (t ?? '').replace(/\s+/g, ' ').trim().toUpperCase());
  const kq: TonKhoV5 = {
    date,
    tong: {
      v: lam(tongV), cu: lam(tongCu), cu12: lam(tong(O.filter(t => (tinhTuoi(date, t.nk) ?? 0) > 12), t => t.v)),
      khongNgay: lam(tong(O.filter(t => !t.nk), t => t.v)), ma: soMa, ma0: new Set(ton.map(t => t.sap)).size - soMa,
      congTrinh: new Set(O.map(t => tenChuan(t.ten))).size, // cùng khoá gộp: khớp số dòng tab Theo công trình
      chuaXuat: lam(chuaXuatTong), chuaXuat4: lam(chuaXuat4), du: lam(du), duPhanLoai: lam(duPhanLoai),
    },
    moc, cuoiThang, duAnMoc, goiDung, soSanhGoi, goiCungPm, duAn, phanChia, chuaXuatDuAn,
    goiCu: {
      dong: goiDau.map(g => ({ ...g, cu: lam(g.cu), ra93: lam(g.ra93), xuat60: g.xuat60 === null ? null : lam(g.xuat60) })),
      conLai: { soGoi: goiSau.length, cu: lam(tong(goiSau, g => g.cu)), ra93: lam(ra93 - tong(goiDau, g => g.ra93)) },
      tong: { cu: lam(tongCu), ra93: lam(ra93) },
      ngay: cuaSoNgay, vao: lam(vao93), ra: lam(ra93),
      vaoThang: cuaSoNgay ? lam(vao93 / cuaSoNgay * 30) : 0, raThang: cuaSoNgay ? lam(ra93 / cuaSoNgay * 30) : 0,
    },
    loNhap: {
      seri: [...seri, DA_KHAC],
      cot: [...cot.values()].sort((a, b) => hangCot(a.thang).localeCompare(hangCot(b.thang)))
        .map(c => ({ thang: c.thang, tong: lam(c.tong), cu: lam(c.cu), theoDuAn: lamMap(c.da) })),
      vachCu: luiNgay(date, 198),
      moc6,
    },
    ky: {
      dong: ky,
      tong: { nhap: lam(tong(kyDong, k => k.nhap)), xuatTinh: lam(tong(kyDong, k => k.xuat)), chuaDoiSoat: lam(du) },
      thangTheoLo,
    },
    soSach: {
      tu: S.length >= 2 ? S[0] : null, du: lam(du), choVeKho: lam(chuaVaoSo - lapCongTrinh), lapCongTrinh: lam(lapCongTrinh), daRoiKho: lam(daRoiKho),
      chuaRo: lam(du - duPhanLoai), hexChuaVaoSo, theoMa,
      kiemKe: [
        { ten: 'Đơn huỷ còn trong sổ tồn', gt: lam(huyGt), ghiChu: soGhi ? `Sổ ghi ${soGhi}, chờ xác nhận` : null },
        { ten: 'Trạng thái ĐÃ XUẤT, vẫn trong sổ tồn', gt: lam(daXuatSo), ghiChu: null },
        { ten: 'Đã rời kho, ước tính', gt: lam(daRoiKho), ghiChu: 'Suy từ ghi chú dòng xuất cờ trống' },
      ],
    },
    doiChieu: {
      sapVuot: {
        den: moc6[moc6.length - 1].moc, gt: lam(tong(moc6, m => m.gt)),
        theoDuAn: dauBang(sapVuotDa).map(([d, gt]) => ({ duAn: d, gt: lam(gt) })),
      },
      khongPsa: {
        gt: lam(tong(khongPsa, t => t.v)), cu: lam(tong(khongPsa.filter(t => laCu(date, t.nk)), t => t.v)),
        lonNhat: dauBang(kpCt).slice(0, 5).map(([ct, v]) => ({ ct, ten: tenCt.get(ct) ?? '', v: lam(v) })),
      },
      huy: { gt: lam(huyGt), cu: lam(huyCu), ct: [...new Set(dongHuy.map(t => t.ct ?? ''))], soGhi },
    },
  };
  return {
    kq, O, P, nhap, xuat, S, d60, daOf, daTon, daSeri, theoNgay, nhomTon: nhomCuaTon, dongHuy: new Set(dongHuy), khongPsa,
    loVao, loRa, iRa, goiCt, goiDau, goiSau, moc6Dong, thangLo, chuaVaoSo: dsChuaVaoSo, roiKho: dsRoiKho, duGiua,
    maDu: maDu.map(x => x[0]), tenMa,
  };
};

// ---- Câu truy vấn: 4 câu đọc song song, dòng trả về khớp kiểu Dong* ở trên (cột số kiểu float8) ----
export interface CauHoi { sql: string; params: unknown[] }
export interface ThamSoSql {
  date: string;
  cuoiThang: string[];
  /** Biểu thức SQL giá trị tồn (alias s), tiền nhập (alias n), số lượng xuất (alias x) */
  giaTriTon: string;
  tienNhap: string;
  soLuongXuat: string;
  /** Điều kiện phạm vi trên ton_kho alias s, đẩy tham số vào mảng truyền vào */
  phamViTon: (params: unknown[]) => string[];
  /** Có lọc: điều kiện trên production_status_app (cột không alias); null = không lọc */
  phamViPsa: ((params: unknown[]) => string[]) | null;
}
/** Ngày đầu chuỗi chốt: cuối năm trước của ngày xem */
export const ngayDauChot = (date: string) => `${Number(date.slice(0, 4)) - 1}-12-31`;
export const sqlNgayChot = (date: string): CauHoi => ({
  sql: `SELECT DISTINCT date_parsed::text AS d FROM ton_kho WHERE date_parsed >= $1::date AND date_parsed <= $2::date ORDER BY 1`,
  params: [ngayDauChot(date), date],
});

const cotTon = (t: ThamSoSql) => `s.ma_id_sap::text AS sap, s.hex::bigint::text AS hex, TRIM(s.ma_cong_trinh) AS ct, s.ten_cong_trinh AS ten, s.ngay_nhap_kho::text AS nk,
        s.so_luong::float8 AS sl, (${t.giaTriTon})::float8 AS v, s.tinh_trang_ke_hoach_giao_hang AS tkh, s.ghi_chu AS gc`;
const dieuKienPham = (t: ThamSoSql) => {
  const dk = (c: string[]) => (c.length ? `AND ${c.join(' AND ')}` : '');
  // Có lọc: PSA giới hạn theo công trình có tồn trong phạm vi
  const dkPsa = (ps: unknown[]) => {
    if (!t.phamViPsa) return '';
    const c = [`TRIM(ma_cong_trinh) IN (SELECT TRIM(s.ma_cong_trinh) FROM ton_kho s WHERE s.date_parsed = $1::date ${dk(t.phamViTon(ps))})`, ...t.phamViPsa(ps)];
    return `WHERE ${c.join(' AND ')}`;
  };
  return { dk, dkPsa };
};
const NGAY_N = `COALESCE(n.date_parsed, n.date)`, NGAY_X = `COALESCE(x.date_parsed, x.date)`;
const coXuatSql = `TRIM(COALESCE(x.tinh_doi_voi_hang_tp, ''))`;
// Tiền đã nhập trần theo giá trị đơn, phần đơn còn lại: bản gom psaNhom và dòng đơn từng HEX phải cùng công thức
const NHAP_CAP_SQL = `LEAST(COALESCE(thanh_tien_nhap_kho_luy_ke, 0), COALESCE(tri_gia_don_hang_tong, 0))`;
const DON_CON_SQL = `GREATEST(COALESCE(gia_tri_don_hang_con_lai, 0), 0)`;

export const sqlTonKhoV5 = (t: ThamSoSql): { ton: CauHoi; tonMoc: CauHoi; psa: CauHoi; luong: CauHoi } => {
  const { dk, dkPsa } = dieuKienPham(t);
  // CTE ht: HEX có dòng tồn ngày xem (kể cả dòng giá trị 0); dùng $1 = ngày xem
  const cteHex = (ps: unknown[]) => `ht AS MATERIALIZED (SELECT DISTINCT s.hex::bigint AS h FROM ton_kho s
    WHERE s.date_parsed = $1::date AND s.hex IS NOT NULL ${dk(t.phamViTon(ps))})`;
  const pTon: unknown[] = [t.date];
  const ton: CauHoi = {
    sql: `SELECT ${cotTon(t)}
      FROM ton_kho s WHERE s.date_parsed = $1::date ${dk(t.phamViTon(pTon))}`,
    params: pTon,
  };

  const pMoc: unknown[] = [t.date, t.cuoiThang, ngayDauChot(t.date)];
  const tonMoc: CauHoi = {
    sql: `SELECT s.date_parsed::text AS d, CASE WHEN s.date_parsed = ANY($2::date[]) THEN s.ma_id_sap::text END AS sap, TRIM(s.ma_cong_trinh) AS ct,
        s.ngay_nhap_kho::text AS nk, MIN(s.ten_cong_trinh) AS ten, SUM(${t.giaTriTon})::float8 AS v, SUM(s.so_luong)::float8 AS sl
      FROM ton_kho s WHERE s.date_parsed >= $3::date AND s.date_parsed <= $1::date AND ${t.giaTriTon} <> 0 ${dk(t.phamViTon(pMoc))}
      GROUP BY 1, 2, 3, 4`,
    params: pMoc,
  };

  // Từng HEX có tồn + bản gom mọi HEX theo công trình (hex NULL)
  const pPsa: unknown[] = [t.date];
  const whereGom = dkPsa(pPsa);
  const psa: CauHoi = {
    sql: `WITH ${cteHex(pPsa)}
      SELECT hex::text AS hex, TRIM(ma_cong_trinh) AS ct, ten_cong_trinh AS ten, ten_pm AS pm, tinh_trang_ipo AS ipo, NULL::text AS ttda,
          tam_ngung_huy_don_hang_tong AS tn, phan_loai_nhom_san_pham AS nsp, don_gia_co_oh::float8 AS dg, so_luong_don_hang_tong::float8 AS sld,
          so_luong_nhap_kho_luy_ke::float8 AS sln, NULL::float8 AS gtd, NULL::float8 AS nhap_cap, NULL::float8 AS con
        FROM production_status_app WHERE hex IN (SELECT h FROM ht)
      UNION ALL
      SELECT NULL, TRIM(ma_cong_trinh), ten_cong_trinh, ten_pm, tinh_trang_ipo, tinh_trang_du_an, tam_ngung_huy_don_hang_tong, NULL, NULL, NULL, NULL,
          SUM(tri_gia_don_hang_tong)::float8, SUM(${NHAP_CAP_SQL})::float8, SUM(${DON_CON_SQL})::float8
        FROM production_status_app ${whereGom}
        GROUP BY 2, 3, 4, 5, 6, 7`,
    params: pPsa,
  };

  // Nhập: gom theo tháng ∩ kỳ (ngày đại diện = cuối tháng hoặc mốc kế tiếp); chỉ giữ HEX + ghi chú cho HEX có tồn.
  // SIGN / tt > 0 giữ riêng để gom không làm mất dòng "số lượng 0, có tiền" và điều kiện tiền > 0 của từng dòng.
  const pL: unknown[] = [t.date, t.cuoiThang];
  const hexTon = cteHex(pL);
  const whereP = dkPsa(pL);
  const coLoc = t.phamViPsa ? 'WHERE p.hex IS NOT NULL' : '';
  const luong: CauHoi = {
    sql: `WITH ${hexTon},
      p AS MATERIALIZED (SELECT hex, TRIM(ma_cong_trinh) AS ct, ten_cong_trinh AS ten, tinh_trang_ipo AS ipo, tam_ngung_huy_don_hang_tong AS tn
        FROM production_status_app ${whereP}),
      n AS (SELECT n.*, ${NGAY_N} AS d, ${t.tienNhap} AS tt, n.hex::bigint AS h FROM nhap_kho n WHERE ${NGAY_N} <= $1::date),
      x AS (SELECT ${NGAY_X} AS d, x.hex::bigint AS h, ${coXuatSql} AS co, ${t.soLuongXuat} AS sl, x.thanh_tien_xuat_kho AS tt, x.ghi_chu
        FROM xuat_kho x WHERE ${NGAY_X} <= $1::date)
      SELECT 'n' AS loai,
          LEAST((date_trunc('month', n.d) + INTERVAL '1 month - 1 day')::date, ($2::date[])[width_bucket(n.d - 1, $2::date[]) + 1])::text AS d,
          CASE WHEN ht.h IS NOT NULL THEN n.h::text END AS hex, p.ct, p.ten, NULL::text AS tn, NULL::text AS ipo, '' AS co,
          SUM(n.so_luong_nhap_kho)::float8 AS sl, SUM(n.tt)::float8 AS tt,
          CASE WHEN ht.h IS NOT NULL AND n.so_luong_nhap_kho = 0 AND n.tt > 0 THEN n.ghi_chu END AS gc
        FROM n LEFT JOIN p ON p.hex = n.h LEFT JOIN ht ON ht.h = n.h ${coLoc}
        GROUP BY 2, 3, 4, 5, 11, CASE WHEN ht.h IS NOT NULL THEN SIGN(n.so_luong_nhap_kho) END, CASE WHEN ht.h IS NOT NULL THEN n.tt > 0 END
      UNION ALL
      SELECT 'x', x.d::text, CASE WHEN ht.h IS NOT NULL THEN x.h::text END, p.ct, p.ten, p.tn, p.ipo, x.co,
          SUM(x.sl)::float8, SUM(x.tt)::float8, CASE WHEN ht.h IS NOT NULL AND x.co = '' THEN x.ghi_chu END
        FROM x LEFT JOIN p ON p.hex = x.h LEFT JOIN ht ON ht.h = x.h ${coLoc}
        GROUP BY 2, 3, 4, 5, 6, 7, 8, 11, x.tt > 0`,
    params: pL,
  };
  return { ton, tonMoc, psa, luong };
};

// ---- Câu chỉ dùng khi bấm xem chi tiết: dòng thật, cùng phạm vi lọc với sqlTonKhoV5 ----
/** Dòng tồn từng HEX của các ngày chốt (input chỉ giữ tồn ngày xem; tồn các lần chốt khác đã gom) */
export const sqlTonNgay = (t: ThamSoSql, ngay: string[]): CauHoi => {
  const ps: unknown[] = [ngay];
  return {
    sql: `SELECT s.date_parsed::text AS d, ${cotTon(t)}
      FROM ton_kho s WHERE s.date_parsed = ANY($1::date[]) ${dieuKienPham(t).dk(t.phamViTon(ps))}`,
    params: ps,
  };
};
/** Dòng nhập hoặc xuất từng chứng từ. cts lọc theo mã công trình của PSA (cùng cách gán mã với nhập/xuất của input); tu loại trừ, den gồm */
export const sqlDongLuong = (t: ThamSoSql, o: { loai: 'n' | 'x'; cts: string[] | null; tu: string | null; den: string | null }): CauHoi => {
  const ps: unknown[] = [t.date];
  const whereP = dieuKienPham(t).dkPsa(ps);
  const ngay = o.loai === 'n' ? NGAY_N : NGAY_X;
  const dk = [`${ngay} <= $1::date`];
  if (t.phamViPsa) dk.push('p.hex IS NOT NULL');
  if (o.cts) { ps.push(o.cts); dk.push(`p.ct = ANY($${ps.length}::text[])`); }
  if (o.tu) { ps.push(o.tu); dk.push(`${ngay} > $${ps.length}::date`); }
  if (o.den) { ps.push(o.den); dk.push(`${ngay} <= $${ps.length}::date`); }
  const cte = `WITH p AS MATERIALIZED (SELECT hex, TRIM(ma_cong_trinh) AS ct, ten_cong_trinh AS ten, ten_hang_muc AS hm, tinh_trang_ipo AS ipo, tam_ngung_huy_don_hang_tong AS tn
        FROM production_status_app ${whereP})`;
  return {
    sql: o.loai === 'n'
      ? `${cte}
      SELECT ${ngay}::text AS d, n.hex::bigint::text AS hex, p.ct, p.ten, COALESCE(NULLIF(TRIM(n.ten_hang_muc), ''), p.hm) AS hm, NULLIF(n.lenh_san_xuat, 0)::bigint::text AS ctu,
          n.so_luong_nhap_kho::float8 AS sl, (${t.tienNhap})::float8 AS tt, n.ghi_chu AS gc
        FROM nhap_kho n LEFT JOIN p ON p.hex = n.hex::bigint WHERE ${dk.join(' AND ')}`
      : `${cte}
      SELECT ${ngay}::text AS d, x.hex::bigint::text AS hex, p.ct, p.ten, COALESCE(NULLIF(TRIM(x.ten_hang_muc), ''), p.hm) AS hm, x.so_phieu AS ctu, p.tn, p.ipo, ${coXuatSql} AS co,
          (${t.soLuongXuat})::float8 AS sl, x.thanh_tien_xuat_kho::float8 AS tt, x.ghi_chu AS gc
        FROM xuat_kho x LEFT JOIN p ON p.hex = x.hex::bigint WHERE ${dk.join(' AND ')}`,
    params: ps,
  };
};
/** Dòng đơn PSA từng HEX của các mã công trình (cùng cột với bản gom psaNhom) */
export const sqlDonPsa = (t: ThamSoSql, cts: string[]): CauHoi => {
  const ps: unknown[] = t.phamViPsa ? [t.date] : []; // $1 = ngày xem chỉ dùng khi có lọc
  const w = dieuKienPham(t).dkPsa(ps);
  ps.push(cts);
  return {
    sql: `SELECT hex::text AS hex, TRIM(ma_cong_trinh) AS ct, ten_cong_trinh AS ten, ten_hang_muc AS hm, ten_pm AS pm, tinh_trang_ipo AS ipo, tinh_trang_du_an AS ttda,
        tam_ngung_huy_don_hang_tong AS tn, tri_gia_don_hang_tong::float8 AS gtd, (${NHAP_CAP_SQL})::float8 AS nhap_cap, (${DON_CON_SQL})::float8 AS con
      FROM production_status_app ${w ? `${w} AND` : 'WHERE'} COALESCE(TRIM(ma_cong_trinh), '') = ANY($${ps.length}::text[])`,
    params: ps,
  };
};
/** Hạng mục, xưởng, nhóm SP theo HEX, không có HEX thì theo mã SAP (dòng mới nhất), như /api/stock/items */
export const sqlMoTaPsa = (sapKey: string, xuong: (cot: string) => string): CauHoi => ({
  sql: `SELECT hex::text AS hex, ${sapKey} AS sap, ten_hang_muc AS hm, ${xuong('xuong_chinh')} AS xg, phan_loai_nhom_san_pham AS nsp
    FROM production_status_app ORDER BY updated_at DESC NULLS LAST, id DESC`,
  params: [],
});

const so = (x: unknown) => Number(x) || 0;
/** Dòng tồn đọc từ DB -> DongTon (cả sqlTonKhoV5.ton và sqlTonNgay) */
export const ghepDongTon = (t: Record<string, any>): DongTon => ({ sap: t.sap, hex: t.hex, ct: t.ct, ten: t.ten, nk: t.nk, sl: so(t.sl), v: so(t.v), tkh: t.tkh, gc: t.gc });

/** Tách dòng đã đọc thành đầu vào hàm thuần */
export const ghepDauVaoV5 = (date: string, ngayChot: string[], r: {
  ton: Record<string, any>[]; tonMoc: Record<string, any>[]; psa: Record<string, any>[]; luong: Record<string, any>[];
}): InputTonKhoV5 => {
  const n = so;
  const input: InputTonKhoV5 = {
    date, ngayChot,
    ton: r.ton.map(ghepDongTon),
    tonMoc: r.tonMoc.map(t => ({ d: t.d, sap: t.sap, ct: t.ct, ten: t.ten, nk: t.nk, v: n(t.v), sl: n(t.sl) })),
    psa: [], psaNhom: [], nhap: [], xuat: [],
  };
  for (const p of r.psa) {
    if (p.hex) input.psa.push({ hex: p.hex, ct: p.ct, ten: p.ten, pm: p.pm, ipo: p.ipo, tn: p.tn, nsp: p.nsp, dg: n(p.dg), sld: n(p.sld), sln: n(p.sln) });
    else input.psaNhom.push({ ct: p.ct, ten: p.ten, pm: p.pm, ipo: p.ipo, ttda: p.ttda, tn: p.tn, gtd: n(p.gtd), nhapCap: n(p.nhap_cap), con: n(p.con) });
  }
  for (const x of r.luong) {
    if (x.loai === 'n') input.nhap.push({ d: x.d, hex: x.hex, ct: x.ct, ten: x.ten, sl: x.sl === null ? null : n(x.sl), tt: n(x.tt), gc: x.gc });
    else input.xuat.push({ d: x.d, hex: x.hex, ct: x.ct, ten: x.ten, tn: x.tn, ipo: x.ipo, co: x.co, sl: n(x.sl), tt: n(x.tt), gc: x.gc });
  }
  return input;
};
