// Hàm thuần của đầu trang Tổng quan: màu tỷ lệ KH, trạng thái số liệu theo ngày nguồn, cộng KH / TH theo xưởng.

export type MucTyLe = 'dat' | 'gan' | 'vua' | 'thap';
export const mucTyLe = (pt: number): MucTyLe => (pt >= 100 ? 'dat' : pt >= 80 ? 'gan' : pt >= 50 ? 'vua' : 'thap');

/** Một bảng màu cho mọi tỷ lệ đạt KH */
export const MAU_TY_LE: Record<MucTyLe, { chu: string; thanh: string; o: string; hex: string }> = {
  dat: { chu: 'text-emerald-700', thanh: 'bg-emerald-600', o: 'bg-green-100 text-green-700', hex: '#059669' },
  gan: { chu: 'text-teal-700', thanh: 'bg-teal-500', o: 'bg-green-100 text-green-700', hex: '#059669' },
  vua: { chu: 'text-amber-700', thanh: 'bg-amber-500', o: 'bg-yellow-100 text-yellow-700', hex: '#d97706' },
  thap: { chu: 'text-red-600', thanh: 'bg-red-500', o: 'bg-red-100 text-red-700', hex: '#dc2626' },
};
export const mauTyLe = (pt: number) => MAU_TY_LE[mucTyLe(pt)];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export interface TrangThaiSo {
  /** Cả kỳ nằm sau ngày mới nhất của nguồn */
  chuaCo: boolean;
  /** Kỳ có ngày chưa có số (gồm chuaCo): không so với kỳ trước */
  thieu: boolean;
  /** Ngày mới nhất của nguồn, dd/mm */
  toi: string;
}

/** maxNgay 'YYYY-MM-DD'; không có (máy chủ chưa trả) thì coi như đủ số */
export const trangThaiSo = (tu: Date | null | undefined, den: Date | null | undefined, maxNgay: string | null | undefined): TrangThaiSo => {
  if (!tu || !den || !maxNgay) return { chuaCo: false, thieu: false, toi: '' };
  return { chuaCo: iso(tu) > maxNgay, thieu: iso(den) > maxNgay, toi: `${maxNgay.slice(8, 10)}/${maxNgay.slice(5, 7)}` };
};

interface DongKhTh { thang: number; xuong: string; value: number }
export interface KhThNam { plan?: DongKhTh[]; actual?: DongKhTh[] }

const cong = (ds: DongKhTh[] | undefined, xuong: string[], loc: (thang: number) => boolean) =>
  (ds ?? []).filter(r => loc(r.thang) && (xuong.length === 0 || xuong.includes(r.xuong))).reduce((a, r) => a + r.value, 0);

/** KH / TH của các xưởng đã chọn (rỗng = mọi xưởng); thang bỏ trống = cả năm */
export const khThTheoLoc = (d: KhThNam | null | undefined, xuong: string[], thang?: number) => {
  const loc = (t: number) => thang === undefined || t === thang;
  return { kh: cong(d?.plan, xuong, loc), th: cong(d?.actual, xuong, loc) };
};

/** Mốc KH lũy kế cuối mỗi quý */
export const mocQuy = (d: KhThNam | null | undefined, xuong: string[]) => {
  const toi = (t: number) => cong(d?.plan, xuong, x => x <= t);
  return { q1: toi(3), q2: toi(6), q3: toi(9), q4: toi(12) };
};

/** Lọc mặc định của cửa sổ chi tiết: 1 lựa chọn thì dùng luôn; nhiều lựa chọn để trống (giữ cả danh sách) */
export const macDinhCuaSo = (ds: string[]) => (ds.length === 1 ? ds[0] : '');
