import type { DongTonKhoVt, TongHopTonKhoVt } from '../../../services/tonKhoVtApi';

// ============================================================================
// XỬ LÝ SỐ LIỆU TRANG "7. TỒN KHO VẬT TƯ" — hàm thuần (không React), test ở xuLy.test.ts
// Tồn kho là ẢNH CHỤP từng lần chốt (thứ Năm hằng tuần): KHÔNG bao giờ cộng nhiều lần chốt với nhau.
// Xem theo tháng = lấy lần chốt CUỐI CÙNG trong tháng. Ngày là chuỗi 'YYYY-MM-DD' (so sánh chuỗi = so sánh ngày).
// Tiền (giaTri) là TRIỆU ĐỒNG; giao diện đổi sang tỷ khi hiện.
// ============================================================================

export type MocXem = 'tuan' | 'thang';
export type ChiSo = 'giaTri' | 'soMa';
/** '3t' / '6t' gần nhất, 'tat_ca', hoặc 1 năm ('nam2026'): năm chưa có tồn (năm tới) => chỉ lần chốt mới nhất làm điểm nối
 *  cho dự báo của năm đó */
export type KhoangXem = '3t' | '6t' | 'tat_ca' | `nam${number}`;

/** Năm của lựa chọn khoảng 'namYYYY'; khác => null */
export const namCuaKhoang = (k: KhoangXem): number | null => (/^nam\d{4}$/.test(k) ? Number(k.slice(3)) : null);

/** Số gốc của 1 nhóm tại 1 lần chốt (cả 2 chỉ số — để tooltip / Excel hiện thêm chỉ số còn lại) */
export interface SoGoc { giaTri: number; giaTriCham: number; soMa: number; soMaCham: number }

export interface DiemChuoi {
  /** Khoá điểm: 'YYYY-MM-DD' (tuần) hoặc 'YYYY-MM' (tháng) */
  khoa: string;
  /** Nhãn trục X: '22/10' (tuần) hoặc 'T10/26' (tháng) */
  nhan: string;
  /** Ngày chốt dùng cho điểm này (tháng: lần chốt cuối trong tháng) */
  ngayChot: string;
  /** Theo chỉ số đang xem: giá trị (triệu đồng) hoặc số mã */
  tong: number;
  /** Phần chậm luân chuyển > 3 tháng */
  cham: number;
  /** tong − cham (phần còn luân chuyển) */
  binhThuong: number;
  /** So với điểm liền trước trong dãy; null ở điểm đầu */
  chenh: number | null;
  /** chenh / tong trước × 100; null ở điểm đầu hoặc khi điểm trước bằng 0 */
  chenhPt: number | null;
  /** Lần chốt này file nguồn không có cờ chậm luân chuyển (cả bảng 0 mã có cờ — xem ngayThieuCham): cham = 0 là
   *  THIẾU SỐ chứ không phải 0 thật => biểu đồ để trống, ô số ghi "—" */
  thieuCham: boolean;
  goc: SoGoc;
}

export interface ChuoiNhom { nhom: string; diem: DiemChuoi[] }

export const NHOM_TRONG = 'Chưa phân nhóm';

/**
 * Chuỗi khoảng trắng khi chuẩn hoá tên nhóm (ASCII + NBSP U+00A0, U+202F, U+2007, U+FEFF… — đúng tập \s của JS),
 * dùng NGUYÊN chuỗi này cho cả RegExp của JS lẫn REGEXP_REPLACE của Postgres. PHẢI giống hệt KHOANG_TRANG ở
 * backend/src/routes/tonKhoVt.ts: tên nhóm ở đây được gửi lại làm tham số `nhom` của /chi-tiet, lệch tập ký tự
 * (vd máy chủ không gộp NBSP mà giao diện gộp) => cửa sổ chi tiết ra 0 mã.
 */
export const KHOANG_TRANG_NHOM = String.raw`[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+`;
const RE_KHOANG_TRANG_NHOM = new RegExp(KHOANG_TRANG_NHOM, 'g');

/** Chuẩn hoá tên nhóm GIỐNG máy chủ (sqlNhom): gộp khoảng trắng thành 1 dấu cách, bỏ dấu cách 2 đầu; trống =>
 *  'Chưa phân nhóm'. Tên máy chủ đã chuẩn hoá thì giữ nguyên. */
export const chuanHoaNhom = (s: string | null | undefined): string => {
  const t = String(s ?? '').replace(RE_KHOANG_TRANG_NHOM, ' ').replace(/^ | $/g, '');
  return t || NHOM_TRONG;
};

/** Tên nhóm gọn để hiện trên thẻ: bỏ tiền tố 'KVT ' ('KVT Gỗ' => 'Gỗ') */
export const tenNhomGon = (nhom: string): string => nhom.replace(/^KVT\s+/i, '') || nhom;

const RE_NGAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const laNgay = (s: string): boolean => RE_NGAY.test(s);
const hai = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' => 'dd/mm/yyyy' */
export const nhanNgay = (s: string | null | undefined): string => {
  const m = RE_NGAY.exec(String(s ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(s ?? '');
};
/** 'YYYY-MM-DD' => 'dd/mm' */
export const nhanNgayNgan = (s: string): string => {
  const m = RE_NGAY.exec(s);
  return m ? `${m[3]}/${m[2]}` : s;
};
/** 'YYYY-MM' hoặc 'YYYY-MM-DD' => 'T10/26' */
export const nhanThang = (s: string): string => {
  const m = /^(\d{4})-(\d{2})/.exec(s);
  return m ? `T${Number(m[2])}/${m[1].slice(2)}` : s;
};

/** Ngày cách 'ngay' n tháng (âm = lùi), kẹp ngày cuối tháng; tính theo UTC nên không lệch múi giờ */
const congThang = (ngay: string, n: number): string => {
  const m = RE_NGAY.exec(ngay);
  if (!m) return ngay;
  const y = Number(m[1]), th = Number(m[2]) - 1, d = Number(m[3]);
  const cuoiThang = new Date(Date.UTC(y, th + n + 1, 0)).getUTCDate();
  const kq = new Date(Date.UTC(y, th + n, Math.min(d, cuoiThang)));
  return `${kq.getUTCFullYear()}-${hai(kq.getUTCMonth() + 1)}-${hai(kq.getUTCDate())}`;
};
const congNgay = (ngay: string, n: number): string => {
  const m = RE_NGAY.exec(ngay);
  if (!m) return ngay;
  const kq = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n));
  return `${kq.getUTCFullYear()}-${hai(kq.getUTCMonth() + 1)}-${hai(kq.getUTCDate())}`;
};

/**
 * Khoảng xem tính từ ngày chốt mới nhất. Theo tuần: 6 tháng = (22/04, 22/10] (ngày cách đúng 6 tháng không tính).
 * Theo tháng: 6 tháng = 6 tháng gần nhất kể cả tháng mới nhất (T5 … T10). 'tat_ca' => không giới hạn.
 */
export const khoangTheoLuaChon = (
  ngayMoiNhat: string | null | undefined, khoang: KhoangXem, moc: MocXem,
): { tu: string | null; den: string | null } => {
  if (!ngayMoiNhat || !laNgay(ngayMoiNhat) || khoang === 'tat_ca') return { tu: null, den: null };
  const nam = namCuaKhoang(khoang);
  if (nam !== null) {
    // Năm chưa có lần chốt nào (năm tới): giữ lần chốt mới nhất làm điểm nối cho đường dự báo
    if (ngayMoiNhat < `${nam}-01-01`) return { tu: moc === 'thang' ? `${ngayMoiNhat.slice(0, 7)}-01` : ngayMoiNhat, den: ngayMoiNhat };
    return { tu: `${nam}-01-01`, den: `${nam}-12-31` };
  }
  const soThang = khoang === '3t' ? 3 : 6;
  if (moc === 'thang') return { tu: `${congThang(ngayMoiNhat, -(soThang - 1)).slice(0, 7)}-01`, den: ngayMoiNhat };
  return { tu: congNgay(congThang(ngayMoiNhat, -soThang), 1), den: ngayMoiNhat };
};

interface MocDiem { khoa: string; nhan: string; ngayChot: string }

/** Các mốc của dãy: tuần = mọi ngày chốt; tháng = lần chốt CUỐI mỗi tháng (không cộng các lần chốt trong tháng) */
export const chonMoc = (dsNgayTang: string[], moc: MocXem): MocDiem[] => {
  if (moc === 'tuan') return dsNgayTang.map(n => ({ khoa: n, nhan: nhanNgayNgan(n), ngayChot: n }));
  const cuoi = new Map<string, string>();
  for (const n of dsNgayTang) {
    const t = n.slice(0, 7);
    const cu = cuoi.get(t);
    if (!cu || n > cu) cuoi.set(t, n);
  }
  return [...cuoi.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([t, n]) => ({ khoa: t, nhan: nhanThang(t), ngayChot: n }));
};

const SO_RONG: SoGoc = { giaTri: 0, giaTriCham: 0, soMa: 0, soMaCham: 0 };
const soHuuHan = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

/** Gộp điểm theo (ngày, nhóm đã chuẩn hoá) — phòng nhóm viết khác nhau (' KVT Vải Da Mouss') bị tách 2 điểm */
const gopDiem = (th: TongHopTonKhoVt): Map<string, SoGoc> => {
  const gop = new Map<string, SoGoc>();
  for (const d of th.diem) {
    if (!laNgay(d.ngay)) continue;
    const k = `${d.ngay}|${chuanHoaNhom(d.nhom)}`;
    const cu = gop.get(k) ?? { ...SO_RONG };
    cu.giaTri += soHuuHan(d.giaTri);
    cu.giaTriCham += soHuuHan(d.giaTriCham);
    cu.soMa += soHuuHan(d.soMa);
    cu.soMaCham += soHuuHan(d.soMaCham);
    gop.set(k, cu);
  }
  return gop;
};

/** Mọi ngày chốt (ngay ∪ ngày có điểm), tăng dần, không trùng */
export const dsNgayChot = (th: TongHopTonKhoVt): string[] => {
  const s = new Set<string>();
  for (const n of th.ngay) if (laNgay(n)) s.add(n);
  for (const d of th.diem) if (laNgay(d.ngay)) s.add(d.ngay);
  return [...s].sort();
};

/**
 * Thứ tự nhóm: theo `nhom` của máy chủ (đã chuẩn hoá, bỏ trùng); nhóm chỉ có trong `diem` thêm vào cuối,
 * xếp theo giá trị ở ngày chốt mới nhất giảm dần rồi theo tên.
 */
export const thuTuNhom = (th: TongHopTonKhoVt): string[] => {
  const kq: string[] = [];
  const da = new Set<string>();
  for (const n of th.nhom) {
    const c = chuanHoaNhom(n);
    if (!da.has(c)) { da.add(c); kq.push(c); }
  }
  const ngayCuoi = dsNgayChot(th).slice(-1)[0];
  const them = new Map<string, number>();
  for (const d of th.diem) {
    const c = chuanHoaNhom(d.nhom);
    if (da.has(c)) continue;
    them.set(c, (them.get(c) ?? 0) + (d.ngay === ngayCuoi ? soHuuHan(d.giaTri) : 0));
  }
  [...them.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'))
    .forEach(([c]) => kq.push(c));
  return kq;
};

/**
 * Ngày chốt mà file nguồn THIẾU cờ chậm luân chuyển: cả bảng (mọi nhóm) không mã nào có cờ trong khi có tồn, và
 * có lần chốt khác vẫn có cờ (vd 03/09/2026: 0 / 4.332 dòng có cờ, các tuần khác ~3.600). Hàng nghìn mã cùng hết
 * chậm luân chuyển trong 1 tuần rồi quay lại là không thể => coi là thiếu số, không vẽ thành 0.
 */
export const ngayThieuCham = (th: TongHopTonKhoVt): Set<string> => {
  const theoNgay = new Map<string, { ma: number; cham: number }>();
  for (const d of th.diem) {
    if (!laNgay(d.ngay)) continue;
    const t = theoNgay.get(d.ngay) ?? { ma: 0, cham: 0 };
    t.ma += soHuuHan(d.soMa);
    t.cham += soHuuHan(d.soMaCham);
    theoNgay.set(d.ngay, t);
  }
  const coCoNgayKhac = [...theoNgay.values()].some(t => t.cham > 0);
  const kq = new Set<string>();
  if (!coCoNgayKhac) return kq;
  for (const [n, t] of theoNgay) if (t.ma > 0 && t.cham === 0) kq.add(n);
  return kq;
};

export interface TuyChonChuoi {
  tu?: string | null; den?: string | null; moc: MocXem; chiSo: ChiSo;
  /** Lần chốt thiếu cờ chậm luân chuyển tính từ TOÀN bảng (biểu đồ đã lọc tên: vài mã có thể thật sự 0 chậm luân chuyển,
   *  không được suy "thiếu cờ" từ chính dữ liệu đã lọc). Bỏ trống => tính từ `th`. */
  thieu?: Set<string>;
}

/**
 * Mỗi nhóm 1 dãy điểm theo mốc tuần / tháng trong khoảng [tu, den] (bỏ trống = không giới hạn).
 * Ngày chốt là chung cho cả bảng: nhóm không có dòng ở 1 ngày chốt => tong 0 (nhóm đã hết hàng ở lần chốt đó).
 */
export function dungChuoi(th: TongHopTonKhoVt, tc: TuyChonChuoi): ChuoiNhom[] {
  const gop = gopDiem(th);
  const dsNgay = dsNgayChot(th).filter(n => (!tc.tu || n >= tc.tu) && (!tc.den || n <= tc.den));
  const moc = chonMoc(dsNgay, tc.moc);
  const theoGiaTri = tc.chiSo === 'giaTri';
  const thieu = tc.thieu ?? ngayThieuCham(th);
  return thuTuNhom(th).map(nhom => {
    let truoc: number | null = null;
    const diem = moc.map((m): DiemChuoi => {
      const goc = gop.get(`${m.ngayChot}|${nhom}`) ?? { ...SO_RONG };
      const tong = theoGiaTri ? goc.giaTri : goc.soMa;
      const cham = Math.min(tong, theoGiaTri ? goc.giaTriCham : goc.soMaCham);
      const chenh = truoc === null ? null : tong - truoc;
      const chenhPt = truoc === null || chenh === null || truoc === 0 ? null : (chenh / truoc) * 100;
      truoc = tong;
      return { ...m, tong, cham, binhThuong: Math.max(0, tong - cham), chenh, chenhPt, thieuCham: thieu.has(m.ngayChot), goc: { ...goc } };
    });
    return { nhom, diem };
  });
}

export interface MocTong { nhan: string; ngayChot: string; tong: number; chenh: number; chenhPt: number | null }

export interface TongCacNhom {
  /** Điểm cuối của khoảng (lần chốt mới nhất trong khoảng) */
  nhan: string;
  ngayChot: string;
  tong: number;
  cham: number;
  /** cham / tong × 100 (null khi tổng 0 hoặc lần chốt cuối thiếu cờ chậm luân chuyển) */
  ptCham: number | null;
  /** Lần chốt cuối của khoảng thiếu cờ chậm luân chuyển (cham không dùng được) */
  thieuCham: boolean;
  /** So với điểm liền trước (tuần: lần chốt trước; tháng: cuối tháng trước); null khi khoảng chỉ có 1 điểm */
  truoc: MocTong | null;
  /** So với điểm đầu khoảng; null khi khoảng chỉ có 1 điểm */
  dau: MocTong | null;
  soNhom: number;
  soDiem: number;
}

const ptChenh = (nay: number, cu: number): number | null => (cu === 0 ? null : ((nay - cu) / cu) * 100);

/** Dải số tổng đầu trang: cộng các nhóm tại CÙNG 1 điểm (không cộng các điểm với nhau) */
export function tongCacNhom(chuoi: ChuoiNhom[]): TongCacNhom | null {
  const soDiem = chuoi[0]?.diem.length ?? 0;
  if (!chuoi.length || soDiem === 0) return null;
  const tongTai = (i: number) => chuoi.reduce((s, c) => s + (c.diem[i]?.tong ?? 0), 0);
  const cuoi = soDiem - 1;
  const mau = chuoi[0].diem;
  const tong = tongTai(cuoi);
  const cham = chuoi.reduce((s, c) => s + (c.diem[cuoi]?.cham ?? 0), 0);
  const moc = (i: number): MocTong => {
    const t = tongTai(i);
    return { nhan: mau[i].nhan, ngayChot: mau[i].ngayChot, tong: t, chenh: tong - t, chenhPt: ptChenh(tong, t) };
  };
  const thieuCham = mau[cuoi].thieuCham;
  return {
    nhan: mau[cuoi].nhan,
    ngayChot: mau[cuoi].ngayChot,
    tong,
    cham,
    ptCham: tong > 0 && !thieuCham ? (cham / tong) * 100 : null,
    thieuCham,
    truoc: soDiem > 1 ? moc(cuoi - 1) : null,
    dau: soDiem > 1 ? moc(0) : null,
    soNhom: chuoi.length,
    soDiem,
  };
}

// ---------------------------------------------------------------------------
// Trục biểu đồ
// ---------------------------------------------------------------------------

/** Chọn nhãn trục X cho thưa khi nhiều điểm: tối đa `toiDa` nhãn, LUÔN có điểm mới nhất (đếm lùi từ cuối) */
export const chonNhanTruc = (khoa: string[], toiDa = 8): string[] => {
  if (khoa.length <= toiDa) return [...khoa];
  const buoc = Math.ceil(khoa.length / Math.max(1, toiDa));
  const kq: string[] = [];
  for (let i = khoa.length - 1; i >= 0; i -= buoc) kq.push(khoa[i]);
  return kq.reverse();
};

/**
 * Vạch trục Y "đẹp" (bước 1 / 2 / 2,5 / 5 × 10ⁿ) từ 0 tới ≥ max. kieu 'ty': số gốc là triệu, vạch tính theo tỷ;
 * 'so': số nguyên (số mã). Trả vạch theo đơn vị GỐC (để làm domain biểu đồ) + số chữ số lẻ khi hiện.
 */
export const vachTrucY = (max: number, kieu: 'ty' | 'so', soVach = 4): { vach: number[]; soLe: number } => {
  const heSo = kieu === 'ty' ? 1000 : 1;
  const dv = Number.isFinite(max) && max > 0 ? max / heSo : 0;
  if (dv <= 0) return { vach: [0, heSo], soLe: 0 };
  // Bước nhỏ nhất (trong dãy "đẹp") mà số khoảng ≤ soVach + 1 => đỉnh trục sát số lớn nhất, không thừa cả khúc
  const bac = Math.pow(10, Math.floor(Math.log10(dv / Math.max(1, soVach + 1))));
  const mau = kieu === 'so' ? [1, 2, 5, 10, 20, 50] : [1, 2, 2.5, 5, 10, 20, 25, 50];
  let buoc = mau[mau.length - 1] * bac;
  for (const x of mau) {
    const b = kieu === 'so' ? Math.max(1, Math.round(x * bac)) : x * bac;
    if (Math.ceil(dv / b - 1e-9) <= soVach + 1) { buoc = b; break; }
  }
  const soBuoc = Math.max(1, Math.ceil(dv / buoc - 1e-9));
  let soLe = 0;
  while (soLe < 6 && Math.abs(Math.round(buoc * 10 ** soLe) - buoc * 10 ** soLe) > 1e-6) soLe++;
  const vach: number[] = [];
  for (let i = 0; i <= soBuoc; i++) vach.push(Math.round(i * buoc * 1e6) / 1e6 * heSo);
  return { vach, soLe };
};

/**
 * Vạch trục PHỤ (bên phải, vd doanh thu) cùng SỐ KHOẢNG với trục chính => đường lưới chung khớp cả 2 trục.
 * Bước "đẹp" nhỏ nhất (1 / 1,2 / 1,5 / 2 / 2,5 / 3 / 4 / 5 / 6 / 8 × 10ⁿ) mà soKhoang × bước ≥ max; đơn vị như max.
 */
export const vachTheoSoKhoang = (max: number, soKhoang: number): { vach: number[]; soLe: number } => {
  const n = Math.max(1, Math.round(soKhoang));
  const tho = (Number.isFinite(max) && max > 0 ? max : 1) / n;
  const bac = Math.pow(10, Math.floor(Math.log10(tho)));
  let buoc = 10 * bac;
  for (const x of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (x * bac >= tho - 1e-9) { buoc = x * bac; break; }
  let soLe = 0;
  while (soLe < 6 && Math.abs(Math.round(buoc * 10 ** soLe) - buoc * 10 ** soLe) > 1e-6) soLe++;
  return { vach: Array.from({ length: n + 1 }, (_, i) => Math.round(i * buoc * 1e6) / 1e6), soLe };
};

/** 'YYYY-MM' cộng k tháng (k âm = lùi) */
export const congThangKhoa = (t: string, k: number): string => {
  const [y, m] = t.split('-').map(Number);
  const tong = y * 12 + (m - 1) + k;
  return `${Math.floor(tong / 12)}-${String((tong % 12) + 1).padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------
// DỰ BÁO TỒN KHO THEO KẾ HOẠCH DOANH THU (người dùng yêu cầu 28/10/2026)
//   Doanh thu tháng = doanh số cần đạt (doanhSoCanDat.ts, TỶ) — người dùng chốt 29/10/2026; trang truyền thucTe = keHoach
//   nên tỷ lệ đạt = 1 (các hàm vẫn nhận được thực tế khác kế hoạch nếu sau này cần).
//   Tồn tháng tới = tồn hiện tại × (DT bình quân 3 tháng của tháng tới ÷ của tháng hiện tại) ^ HE_SO_CO_GIAN.
//   Sai số = kiểm lại trên các tháng đã qua (đứng ở mỗi tháng, chỉ dùng số có trước đó) — hiện thành dải ± quanh dự báo.
// ---------------------------------------------------------------------------

/**
 * Tồn đổi bằng bấy nhiêu phần mức đổi (%) của doanh thu bình quân 3 tháng. Kiểm lại 2–10/2026 ở mức toàn kho: 0,5 sát
 * nhất (trước 2 tháng sai ±3,7 tỷ; giữ nguyên tồn ±8,8 tỷ); giữ tỷ lệ 1:1 sai gấp đôi — tồn tăng chậm hơn doanh thu.
 */
export const HE_SO_CO_GIAN = 0.5;

/** Tỷ lệ rộng : cao của ảnh chụp biểu đồ tồn / biểu đồ doanh thu lúc xuất PDF (cùng bề rộng chụp => đặt cùng bề rộng
 *  trong PDF là các tháng thẳng hàng) */
export const TY_LE_ANH_TON = 2.7;
export const TY_LE_ANH_DT = 8;

/** Doanh thu thực tế + kế hoạch theo tháng (TỶ, khoá 'YYYY-MM') */
export interface DoanhThuKeHoach { thucTe: Record<string, number>; keHoach: Record<string, number> }

/** Tỷ lệ đạt kế hoạch = Σ thực tế ÷ Σ kế hoạch của 3 tháng đã hết gần nhất trước `thangHienTai`; thiếu số => null */
export function tyLeDatKeHoach(dt: DoanhThuKeHoach, thangHienTai: string): number | null {
  const ds = [-3, -2, -1].map(k => congThangKhoa(thangHienTai, k));
  if (ds.some(t => dt.thucTe[t] === undefined || !(dt.keHoach[t] > 0))) return null;
  return ds.reduce((s, t) => s + dt.thucTe[t], 0) / ds.reduce((s, t) => s + dt.keHoach[t], 0);
}

/** Doanh thu tháng t nhìn từ `thangHienTai`: tháng đã hết = thực tế; tháng đang chạy / sau đó = kế hoạch × tỷ lệ đạt */
export function doanhThuDung(t: string, dt: DoanhThuKeHoach, thangHienTai: string, tyLe: number): number | undefined {
  if (t < thangHienTai) return dt.thucTe[t];
  return dt.keHoach[t] !== undefined ? dt.keHoach[t] * tyLe : undefined;
}

const dtBq3 = (t: string, dt: DoanhThuKeHoach, thangHienTai: string, tyLe: number): number | null => {
  const v = [-2, -1, 0].map(k => doanhThuDung(congThangKhoa(t, k), dt, thangHienTai, tyLe));
  return v.some(x => x === undefined) ? null : v.reduce((s: number, x) => s + (x ?? 0), 0) / 3;
};

/** Dự báo tồn tháng (ds[i] + h tháng), đứng ở `thangHienTai`; ds theo THÁNG (khoá 'YYYY-MM'), tong theo giá trị */
function duBaoMot(ds: DiemChuoi[], i: number, h: number, dt: DoanhThuKeHoach, thangHienTai: string): number | null {
  const tyLe = tyLeDatKeHoach(dt, thangHienTai);
  if (tyLe === null) return null;
  const r0 = dtBq3(ds[i].khoa, dt, thangHienTai, tyLe), r1 = dtBq3(congThangKhoa(ds[i].khoa, h), dt, thangHienTai, tyLe);
  if (!r0 || !r1) return null;
  return ds[i].tong * (r1 / r0) ** HE_SO_CO_GIAN;
}

export interface DiemDuBao {
  khoa: string;
  nhan: string;
  /** Tháng tới thứ h (1 = tháng sau tháng có tồn mới nhất) */
  h: number;
  ton: number;
  /** Dải sai số thường gặp (tồn ± sai số kiểm lại tầm h); null khi chưa có lần kiểm nào */
  thap: number | null;
  cao: number | null;
  keHoach: number;
  dtDuKien: number;
}

/** Số lần kiểm lại tối thiểu của 1 tầm dự báo (h tháng) để còn vẽ tháng đó — ít hơn thì dải sai số không đáng tin */
export const SO_LAN_KIEM_TOI_THIEU = 3;

/** Dự báo tối đa bấy nhiêu tháng (dừng ở tháng chưa có doanh số) — đủ tới hết năm 2027 của doanh số cần đạt */
export const SO_THANG_DU_BAO_TOI_DA = 26;

/** Các tháng dự báo đáng ghi số: 2 tháng đầu, tháng 6 / tháng 12 và tháng cuối (ghi hết 14+ tháng thì rối) */
export const diemTieuBieu = (d: DuBaoTon): DiemDuBao[] =>
  d.diem.filter((x, i) => x.h <= 2 || x.khoa.endsWith('-06') || x.khoa.endsWith('-12') || i === d.diem.length - 1);

/** Dự báo chỉ giữ các tháng trong [tuThang, denThang] ('YYYY-MM'; null = không chặn đầu đó) */
export const catDuBao = (d: DuBaoTon | null, denThang: string | null, tuThang: string | null = null): DuBaoTon | null =>
  (d && (denThang || tuThang) ? { ...d, diem: d.diem.filter(x => (!denThang || x.khoa <= denThang) && (!tuThang || x.khoa >= tuThang)) } : d);

export interface DuBaoTon {
  /** Tỷ lệ đạt kế hoạch dùng cho tháng đang chạy / tháng tới, và 3 tháng tính tỷ lệ đó */
  tyLeDat: number;
  tyLeTu: string;
  tyLeDen: string;
  diem: DiemDuBao[];
  /** Kiểm lại theo tầm h = 1, 2…: sai trung bình của cách này và của "giữ nguyên tồn" (cùng đơn vị tồn), số lần kiểm */
  saiSo: Array<number | null>;
  saiSoGiuNguyen: Array<number | null>;
  soLanKiem: number[];
}

/**
 * Dự báo tồn cho tối đa `soThang` tháng sau tháng có tồn mới nhất (dừng ở tháng chưa có kế hoạch).
 * ds: chuỗi THEO THÁNG, chỉ số GIÁ TRỊ (tong = triệu đồng), đủ các tháng (không lọc khoảng) để kiểm lại được nhiều lần.
 */
export function duBaoTonTheoDoanhThu(ds: DiemChuoi[], dt: DoanhThuKeHoach, thangHienTai: string, soThang = 2): DuBaoTon | null {
  const n = ds.length;
  if (!n) return null;
  const tyLe = tyLeDatKeHoach(dt, thangHienTai);
  if (tyLe === null) return null;
  const saiSo: Array<number | null> = [], saiSoGiuNguyen: Array<number | null> = [], soLanKiem: number[] = [];
  for (let h = 1; h <= soThang; h++) {
    let tong = 0, tong0 = 0, dem = 0;
    // Đứng ở tháng ds[i] (coi tháng đó đã hết: tháng hiện tại lúc đó = tháng sau nó), dự báo h tháng sau
    for (let i = 0; i + h < n; i++) {
      const p = duBaoMot(ds, i, h, dt, congThangKhoa(ds[i].khoa, 1));
      if (p === null || congThangKhoa(ds[i].khoa, h) !== ds[i + h].khoa) continue;
      tong += Math.abs(p - ds[i + h].tong);
      tong0 += Math.abs(ds[i].tong - ds[i + h].tong);
      dem++;
    }
    saiSo.push(dem ? tong / dem : null);
    saiSoGiuNguyen.push(dem ? tong0 / dem : null);
    soLanKiem.push(dem);
  }
  const goc = ds[n - 1];
  const diem: DiemDuBao[] = [];
  let sTruoc = 0;
  for (let h = 1; h <= soThang; h++) {
    const khoa = congThangKhoa(goc.khoa, h);
    if (dt.keHoach[khoa] === undefined) break;
    // Chỉ dự báo tới tầm còn kiểm lại được ≥ SO_LAN_KIEM_TOI_THIEU lần: xa hơn thì không biết sai bao nhiêu
    // (trước vẽ tiếp đường dự báo không có dải tới 14+ tháng, dải tự hẹp lại do chỉ còn 1–2 lần kiểm)
    if (h > 1 && soLanKiem[h - 1] < SO_LAN_KIEM_TOI_THIEU) break;
    const ton = duBaoMot(ds, n - 1, h, dt, thangHienTai);
    if (ton === null) break;
    // Dải không hẹp lại khi dự báo xa hơn (xa hơn thì chỉ có thể sai nhiều hơn)
    const s0 = saiSo[h - 1];
    const s = s0 === null ? null : Math.max(s0, sTruoc);
    if (s !== null) sTruoc = s;
    diem.push({
      khoa, nhan: nhanThang(khoa), h, ton, thap: s === null ? null : Math.max(0, ton - s), cao: s === null ? null : ton + s,
      keHoach: dt.keHoach[khoa], dtDuKien: dt.keHoach[khoa] * tyLe,
    });
  }
  return {
    tyLeDat: tyLe, tyLeTu: congThangKhoa(thangHienTai, -3), tyLeDen: congThangKhoa(thangHienTai, -1), diem,
    saiSo, saiSoGiuNguyen, soLanKiem,
  };
}

// ---------------------------------------------------------------------------
// Định dạng số (kiểu số của app: 1,234.56 — giống formatTy ở utils/money.ts)
// ---------------------------------------------------------------------------

export const dinhDangSo = (v: number, soLe = 0): string =>
  (Number.isFinite(v) ? v : 0).toLocaleString('en-US', { minimumFractionDigits: soLe, maximumFractionDigits: soLe });

/** Số lượng: tối đa 2 số lẻ, bỏ số 0 thừa */
export const dinhDangSoLuong = (v: number | null): string =>
  v === null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Phần trăm gọn: < 10% thì 1 số lẻ, còn lại làm tròn */
export const dinhDangPt = (v: number | null, coDau = false): string => {
  if (v === null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const s = a < 10 ? a.toFixed(1).replace(/\.0$/, '') : String(Math.round(a));
  return `${coDau ? (v > 0 ? '+' : v < 0 ? '−' : '') : v < 0 ? '−' : ''}${s}%`;
};

/** Tiền 1 mã (triệu đồng) theo đơn vị dễ đọc: ≥ 1.000 triệu => tỷ (2 số lẻ), còn lại triệu (1 số lẻ) */
export const dinhDangTienDong = (trieu: number | null, coDau = false): string => {
  if (trieu === null || !Number.isFinite(trieu)) return '—';
  const dau = coDau ? (trieu > 0 ? '+' : trieu < 0 ? '−' : '') : trieu < 0 ? '−' : '';
  const a = Math.abs(trieu);
  if (a >= 1000) return `${dau}${dinhDangSo(a / 1000, 2)} tỷ`;
  if (a > 0 && a < 0.05) return `${dau}${dinhDangSo(a, 2)} tr`;
  return `${dau}${dinhDangSo(a, 1)} tr`;
};

/** Số theo chỉ số đang xem: giá trị (triệu => 'x.xx tỷ') hoặc số mã ('1,234 mã') */
export const dinhDangChiSo = (v: number, chiSo: ChiSo, coDau = false): string => {
  const dau = coDau ? (v > 0 ? '+' : v < 0 ? '−' : '') : v < 0 ? '−' : '';
  const a = Math.abs(v);
  return chiSo === 'giaTri' ? `${dau}${dinhDangSo(a / 1000, 2)} tỷ` : `${dau}${dinhDangSo(a, 0)} mã`;
};

/** Chênh lệch có dấu: giá trị ≥ 10 triệu => tỷ (2 số lẻ), nhỏ hơn => triệu (1 số lẻ, để không thành '+0.00 tỷ') */
export const dinhDangChenh = (v: number, chiSo: ChiSo): string => {
  const dau = v > 0 ? '+' : v < 0 ? '−' : '';
  const a = Math.abs(v);
  if (chiSo === 'soMa') return `${dau}${dinhDangSo(a, 0)} mã`;
  if (a >= 10 || a === 0) return `${dau}${dinhDangSo(a / 1000, 2)} tỷ`;
  return `${dau}${dinhDangSo(a, 1)} tr`;
};

// ---------------------------------------------------------------------------
// Câu tóm tắt & nhãn số trên biểu đồ
// ---------------------------------------------------------------------------

/**
 * Câu tóm tắt đầu mỗi biểu đồ, tự tính từ dãy điểm đang xem:
 * '39.73 tỷ — tăng 13.17 tỷ (+50%) so với T2/26; đỉnh 51.04 tỷ (T8/26), đã giảm 11.31 tỷ; 73% là hàng chậm luân chuyển > 3 tháng'.
 * Chênh < 2% so với điểm đầu => 'gần như không đổi'. Đỉnh / đáy chỉ nêu khi ở giữa khoảng và cách số cuối ≥ 5% số lớn nhất.
 */
export function tomTatNhom(ds: DiemChuoi[], chiSo: ChiSo): string {
  if (!ds.length) return '';
  const cuoi = ds[ds.length - 1];
  const y: string[] = [];
  if (ds.length > 1) {
    const dau = ds[0];
    const ch = cuoi.tong - dau.tong;
    const pt = dau.tong > 0 ? (ch / dau.tong) * 100 : null;
    const phang = Math.abs(ch) < 1e-9 || (pt !== null && Math.abs(pt) < 2);
    if (phang) y.push(`gần như không đổi so với ${dau.nhan}`);
    else y.push(`${ch > 0 ? 'tăng' : 'giảm'} ${dinhDangChiSo(Math.abs(ch), chiSo)}${pt !== null ? ` (${dinhDangPt(pt, true)})` : ''} so với ${dau.nhan}`);
    let iMax = 0, iMin = 0;
    ds.forEach((d, i) => { if (d.tong > ds[iMax].tong) iMax = i; if (d.tong < ds[iMin].tong) iMin = i; });
    const max = ds[iMax].tong, last = ds.length - 1, nguong = max * 0.05;
    if (iMax !== last && iMax !== 0 && max - cuoi.tong >= nguong) {
      y.push(`đỉnh ${dinhDangChiSo(max, chiSo)} (${ds[iMax].nhan}), đã giảm ${dinhDangChiSo(max - cuoi.tong, chiSo)}`);
    } else if (iMin !== last && iMin !== 0 && cuoi.tong - ds[iMin].tong >= nguong) {
      y.push(`thấp nhất ${dinhDangChiSo(ds[iMin].tong, chiSo)} (${ds[iMin].nhan}), đã tăng lại ${dinhDangChiSo(cuoi.tong - ds[iMin].tong, chiSo)}`);
    } else if (!phang && ds.length > 2 && iMax === last && cuoi.tong > ds[0].tong) {
      y.push('cao nhất từ đầu khoảng');
    } else if (!phang && ds.length > 2 && iMin === last && cuoi.tong < ds[0].tong) {
      y.push('thấp nhất từ đầu khoảng');
    }
  }
  if (!cuoi.thieuCham && cuoi.tong > 0) y.push(`${dinhDangPt((cuoi.cham / cuoi.tong) * 100)} là hàng chậm luân chuyển > 3 tháng`);
  return [dinhDangChiSo(cuoi.tong, chiSo), y.join('; ')].filter(Boolean).join(' — ');
}

/**
 * Điểm được ghi số trên biểu đồ: ≤ 13 điểm (theo tháng) => mọi điểm; nhiều hơn (theo tuần) => chỉ điểm đầu, cuối,
 * cao nhất, thấp nhất của dãy `giaTri` (giá trị null bỏ qua) — ghi hết 25+ số thì chồng lên nhau, không đọc được.
 */
export const chiSoNhan = (giaTri: Array<number | null>, toiDa = 13): Set<number> => {
  const co = giaTri.map((v, i) => [v, i] as const).filter((x): x is readonly [number, number] => x[0] !== null);
  if (co.length <= toiDa) return new Set(co.map(x => x[1]));
  let lon = co[0], nho = co[0];
  for (const x of co) { if (x[0] > lon[0]) lon = x; if (x[0] < nho[0]) nho = x; }
  return new Set([co[0][1], co[co.length - 1][1], lon[1], nho[1]]);
};

/**
 * Đường trung bình: trung bình tổng tồn của các điểm ĐANG XEM (mỗi điểm là 1 lần chốt — tuần, hoặc chốt cuối tháng),
 * nên đổi theo mốc và khoảng chọn. Không có điểm => null.
 */
export const trungBinhTong = (ds: DiemChuoi[]): number | null =>
  ds.length ? ds.reduce((s, d) => s + d.tong, 0) / ds.length : null;

export interface XuHuong {
  /** Giá trị đường xu hướng tại từng điểm (cùng thứ tự ds) */
  giaTri: number[];
  /** Độ dốc: thay đổi trung bình mỗi điểm (mỗi tháng hoặc mỗi lần chốt tuần), cùng đơn vị tổng tồn */
  moiDiem: number;
  /** % thay đổi cả khoảng theo đường xu hướng (điểm cuối so điểm đầu của đường); null khi điểm đầu ≤ 0 */
  ptCaKhoang: number | null;
  /** Phần dao động của tổng tồn mà đường thẳng giải thích được (R², 0–1) */
  r2: number;
  /**
   * 'tang' / 'giam' khi có xu hướng rõ; 'ngang' khi cả khoảng đổi dưới 2% so với mức trung bình; 'khongRo' khi đường
   * thẳng giải thích dưới NGUONG_R2_XU_HUONG dao động (tồn lên xuống thất thường — vd Tấm – Ván R² 0,19: không nói
   * "tăng" chỉ vì độ dốc hơi dương)
   */
  huong: 'tang' | 'giam' | 'ngang' | 'khongRo';
}

/** Xu hướng chỉ coi là rõ khi đường thẳng giải thích được ít nhất bấy nhiêu phần dao động (người dùng chốt 50%) */
export const NGUONG_R2_XU_HUONG = 0.5;

/**
 * Đường xu hướng tăng / giảm: đường thẳng hồi quy tuyến tính (bình phương nhỏ nhất) của tổng tồn theo thứ tự điểm —
 * mỗi điểm cách đều (1 tháng hoặc 1 lần chốt tuần). Cần ≥ 3 điểm (2 điểm thì chính là đoạn nối 2 điểm, không nói thêm gì).
 */
export const xuHuongTong = (ds: DiemChuoi[]): XuHuong | null => {
  const n = ds.length;
  if (n < 3) return null;
  const tbX = (n - 1) / 2;
  const tbY = ds.reduce((s, d) => s + d.tong, 0) / n;
  let tu = 0, mau = 0;
  ds.forEach((d, i) => { tu += (i - tbX) * (d.tong - tbY); mau += (i - tbX) ** 2; });
  const b = mau > 0 ? tu / mau : 0;
  const giaTri = ds.map((_, i) => tbY + b * (i - tbX));
  const dau = giaTri[0], cuoi = giaTri[n - 1];
  const doiCaKhoang = cuoi - dau;
  let sst = 0, ssr = 0;
  ds.forEach((d, i) => { sst += (d.tong - tbY) ** 2; ssr += (d.tong - giaTri[i]) ** 2; });
  const r2 = sst > 0 ? Math.max(0, 1 - ssr / sst) : 1;
  const huong: XuHuong['huong'] = (tbY > 0 && Math.abs(doiCaKhoang) / tbY < 0.02) || doiCaKhoang === 0 ? 'ngang'
    : r2 < NGUONG_R2_XU_HUONG ? 'khongRo' : doiCaKhoang > 0 ? 'tang' : 'giam';
  return { giaTri, moiDiem: b, ptCaKhoang: dau > 0 ? (doiCaKhoang / dau) * 100 : null, r2, huong };
};

// ---------------------------------------------------------------------------
// Cửa sổ chi tiết từng mã
// ---------------------------------------------------------------------------

export type LoaiDong = 'moi' | 'het' | 'tang' | 'giam' | 'khong_doi';

export interface DongDaPhanLoai extends DongTonKhoVt {
  loai: LoaiDong;
  /** giá trị lần này − lần trước (triệu đồng); null khi không có quyền xem giá */
  chenhGiaTri: number | null;
  /** số lượng lần này − lần trước (mã mới / đã hết coi phần thiếu là 0) */
  chenhSoLuong: number;
}

const SAI_SO = 1e-9;

/**
 * Phân loại 1 mã so với lần chốt trước: 'moi' (lần trước chưa có), 'het' (lần này không còn), còn lại
 * 'tang' / 'giam' / 'khong_doi' — so theo giá trị nếu có quyền xem giá, không thì theo số lượng.
 */
export function phanLoaiDong(dong: DongTonKhoVt, coGia = dong.giaTri !== null || dong.giaTriTruoc !== null): DongDaPhanLoai {
  const chenhSoLuong = (dong.soLuong ?? 0) - (dong.soLuongTruoc ?? 0);
  const chenhGiaTri = coGia ? (dong.giaTri ?? 0) - (dong.giaTriTruoc ?? 0) : null;
  let loai: LoaiDong;
  if (dong.soLuong === null) loai = 'het';
  else if (dong.soLuongTruoc === null) loai = 'moi';
  else {
    const d = chenhGiaTri ?? chenhSoLuong;
    loai = d > SAI_SO ? 'tang' : d < -SAI_SO ? 'giam' : 'khong_doi';
  }
  return { ...dong, loai, chenhGiaTri, chenhSoLuong };
}

export type LocDong = 'tat_ca' | 'tang' | 'giam' | 'moi' | 'het' | 'cham';

export const NHAN_LOC: Array<[LocDong, string]> = [
  ['tat_ca', 'Tất cả'], ['tang', 'Tăng'], ['giam', 'Giảm'], ['moi', 'Mới'], ['het', 'Đã hết'], ['cham', 'Chậm luân chuyển'],
];

const hopLoc = (d: DongDaPhanLoai, loc: LocDong): boolean =>
  loc === 'tat_ca' ? true : loc === 'cham' ? d.cham : d.loai === loc;

export const demTheoLoc = (ds: DongDaPhanLoai[]): Record<LocDong, number> => {
  const kq: Record<LocDong, number> = { tat_ca: 0, tang: 0, giam: 0, moi: 0, het: 0, cham: 0 };
  for (const d of ds) for (const [l] of NHAN_LOC) if (hopLoc(d, l)) kq[l]++;
  return kq;
};

/** Bỏ dấu tiếng Việt + chữ thường (so khớp ô tìm) */
export const boDau = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/** Tách danh sách công trình (nhiều công trình cách nhau xuống dòng) */
export const tachCongTrinh = (s: string | null): string[] =>
  (s ?? '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);

/** Lọc theo thẻ + ô tìm (mã / tên / công trình, không phân biệt dấu, nhiều từ = phải khớp đủ) */
export const locDong = (ds: DongDaPhanLoai[], loc: LocDong, tim: string): DongDaPhanLoai[] => {
  const tu = boDau(tim).split(/\s+/).filter(Boolean);
  return ds.filter(d => {
    if (!hopLoc(d, loc)) return false;
    if (!tu.length) return true;
    const chu = boDau(`${d.ma} ${d.ten ?? ''} ${d.congTrinh ?? ''}`);
    return tu.every(t => chu.includes(t));
  });
};

/** Cột xếp: 'doLon' = |chênh| (mặc định), 'chenh' = chênh có dấu */
export type CotXep = 'ma' | 'ten' | 'dvt' | 'soLuong' | 'soLuongTruoc' | 'giaTri' | 'doLon' | 'chenh' | 'soThang' | 'cham' | 'congTrinh';
export interface CachXep { cot: CotXep; giam: boolean }
export const XEP_MAC_DINH: CachXep = { cot: 'doLon', giam: true };

const chenhCuaDong = (d: DongDaPhanLoai): number => d.chenhGiaTri ?? d.chenhSoLuong;

const giaTriXep = (d: DongDaPhanLoai, cot: CotXep): string | number | null => {
  switch (cot) {
    case 'ma': return d.ma;
    case 'ten': return d.ten;
    case 'dvt': return d.dvt;
    case 'soLuong': return d.soLuong;
    case 'soLuongTruoc': return d.soLuongTruoc;
    case 'giaTri': return d.giaTri ?? d.giaTriTruoc;
    case 'doLon': return Math.abs(chenhCuaDong(d));
    case 'chenh': return chenhCuaDong(d);
    case 'soThang': return d.soThang;
    case 'cham': return d.cham ? 1 : 0;
    case 'congTrinh': return tachCongTrinh(d.congTrinh)[0] ?? null;
  }
};

/** Xếp danh sách (không đổi mảng gốc); ô trống luôn xuống cuối; bằng nhau thì theo mã */
export const xepDong = (ds: DongDaPhanLoai[], xep: CachXep): DongDaPhanLoai[] =>
  [...ds].sort((a, b) => {
    const x = giaTriXep(a, xep.cot), y = giaTriXep(b, xep.cot);
    if (x === null && y === null) return a.ma.localeCompare(b.ma);
    if (x === null) return 1;
    if (y === null) return -1;
    const ss = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'vi', { numeric: true });
    return (xep.giam ? -ss : ss) || a.ma.localeCompare(b.ma);
  });

// ---------------------------------------------------------------------------
// Bảng xuất Excel (mảng 2 chiều — nơi gọi đưa vào SheetJS)
// ---------------------------------------------------------------------------

export type O = string | number;

/** Bảng ngày × nhóm: mỗi nhóm 3 cột (giá trị tỷ, chậm LC tỷ, số mã) + 3 cột tổng */
export const bangTongHopExcel = (chuoi: ChuoiNhom[]): O[][] => {
  const dau: O[] = ['Ngày chốt', 'Kỳ'];
  for (const c of chuoi) dau.push(`${c.nhom} - Giá trị (tỷ)`, `${c.nhom} - Chậm LC > 3 tháng (tỷ)`, `${c.nhom} - Số mã`);
  dau.push('Tổng - Giá trị (tỷ)', 'Tổng - Chậm LC > 3 tháng (tỷ)', 'Tổng - Số mã');
  const soDiem = chuoi[0]?.diem.length ?? 0;
  const dong: O[][] = [dau];
  for (let i = 0; i < soDiem; i++) {
    const p = chuoi[0].diem[i];
    const hang: O[] = [nhanNgay(p.ngayChot), p.nhan];
    let gt = 0, ch = 0, ma = 0;
    // Lần chốt thiếu cờ chậm luân chuyển: để ô trống (không phải 0)
    const thieu = p.thieuCham;
    for (const c of chuoi) {
      const g = c.diem[i].goc;
      hang.push(g.giaTri / 1000, thieu ? '' : g.giaTriCham / 1000, g.soMa);
      gt += g.giaTri; ch += g.giaTriCham; ma += g.soMa;
    }
    hang.push(gt / 1000, thieu ? '' : ch / 1000, ma);
    dong.push(hang);
  }
  return dong;
};

/** Bảng dạng dọc (1 dòng / ngày chốt × nhóm) — tiện lọc / pivot trong Excel */
export const bangDocExcel = (chuoi: ChuoiNhom[]): O[][] => {
  const dong: O[][] = [['Ngày chốt', 'Kỳ', 'Nhóm vật tư', 'Giá trị (tỷ)', 'Chậm LC > 3 tháng (tỷ)', '% chậm (giá trị)', 'Số mã', 'Số mã chậm LC']];
  const soDiem = chuoi[0]?.diem.length ?? 0;
  for (let i = 0; i < soDiem; i++) {
    for (const c of chuoi) {
      const p = c.diem[i];
      const g = p.goc;
      dong.push(p.thieuCham
        ? [nhanNgay(p.ngayChot), p.nhan, c.nhom, g.giaTri / 1000, '', '', g.soMa, '']
        : [nhanNgay(p.ngayChot), p.nhan, c.nhom, g.giaTri / 1000, g.giaTriCham / 1000,
          g.giaTri > 0 ? Math.round((g.giaTriCham / g.giaTri) * 1000) / 10 : 0, g.soMa, g.soMaCham]);
    }
  }
  return dong;
};

const NHAN_LOAI: Record<LoaiDong, string> = { moi: 'Mới', het: 'Đã hết', tang: 'Tăng', giam: 'Giảm', khong_doi: 'Không đổi' };

/** Danh sách mã đang lọc trong cửa sổ chi tiết; tiền để triệu đồng (đúng số gốc) */
export const bangChiTietExcel = (ds: DongDaPhanLoai[], coGia: boolean): O[][] => {
  const dau: O[] = ['Mã vật tư', 'Tên vật tư', 'Nhóm vật tư', 'ĐVT', 'SL lần này', 'SL lần trước', 'Chênh SL'];
  if (coGia) dau.push('Giá trị lần này (triệu)', 'Giá trị lần trước (triệu)', 'Chênh giá trị (triệu)');
  dau.push('Biến động', 'Số tháng nhập kho', 'Chậm LC > 3 tháng', 'Công trình', 'Ghi chú');
  const o = (v: number | null): O => (v === null ? '' : v);
  return [dau, ...ds.map(d => {
    const hang: O[] = [d.ma, d.ten ?? '', d.nhom, d.dvt ?? '', o(d.soLuong), o(d.soLuongTruoc), d.chenhSoLuong];
    if (coGia) hang.push(o(d.giaTri), o(d.giaTriTruoc), o(d.chenhGiaTri));
    hang.push(NHAN_LOAI[d.loai], o(d.soThang), d.cham ? 'X' : '', tachCongTrinh(d.congTrinh).join('; '), d.ghiChu ?? '');
    return hang;
  })];
};

/** Tên file an toàn: bỏ dấu, ký tự lạ => '-' */
export const tenFileAnToan = (s: string): string =>
  boDau(s).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'ton-kho-vat-tu';

/**
 * Bộ lọc tên của 1 biểu đồ: tên khớp ô tìm (bỏ dấu, không phân biệt hoa thường; nhiều chữ cách nhau = phải có đủ
 * các chữ, như "vai 1.4" khớp "VẢI NAVY BLUE-1.4M"). Ô tìm trống => mọi tên.
 */
export const locTenTheoTim = <T extends { ten: string }>(ds: T[], tim: string): T[] => {
  const chu = boDau(tim).split(/\s+/).filter(Boolean);
  if (!chu.length) return ds;
  return ds.filter(t => { const k = boDau(t.ten); return chu.every(c => k.includes(c)); });
};
