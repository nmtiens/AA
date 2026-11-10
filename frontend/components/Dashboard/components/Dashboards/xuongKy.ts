// Hàm thuần cho bảng xưởng × kỳ đầu trang Biểu đồ và dòng Khác của Top công trình.
import { fmtThang } from '../../../../utils/format';
import { thuHaiCua, tuanISO } from '../../../../utils/dateUtils';

export type LoaiKy = 'day' | 'week' | 'month';

/** 1 dòng API: xuong null = tổng cột, ky null = tổng dòng, cả 2 null = tổng chung */
export interface DongXuongKy {
  xuong: string | null;
  ky: string | null;
  total: number;
  totalCount: number;
}

export interface BangPivot {
  kys: string[];
  dong: { xuong: string; o: Record<string, number>; tong: number }[];
  tongKy: Record<string, number>;
  tong: number;
}

const ngay = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Khoảng ngắn xem theo ngày, vừa theo tuần, dài theo tháng để bảng không quá rộng */
export const chonKy = (tu: string, den: string): LoaiKy => {
  const soNgay = (ngay(den).getTime() - ngay(tu).getTime()) / 86_400_000 + 1;
  return soNgay <= 14 ? 'day' : soNgay <= 92 ? 'week' : 'month';
};

export const nhanKy = (ky: string, loai: LoaiKy): string => {
  const d = ngay(ky);
  if (loai === 'day') return dm(d);
  if (loai === 'month') return fmtThang(ky);
  const t2 = thuHaiCua(d);
  const cn = new Date(t2.getFullYear(), t2.getMonth(), t2.getDate() + 6);
  const dau = t2.getMonth() === cn.getMonth() ? String(t2.getDate()).padStart(2, '0') : dm(t2);
  return `T${tuanISO(d).tuan} (${dau}-${dm(cn)})`;
};

/** Biên 1 kỳ, cắt theo khoảng đang lọc */
export const bienKy = (ky: string, loai: LoaiKy, tu: string, den: string): { tu: string; den: string } => {
  const d = ngay(ky);
  const cuoi = loai === 'day' ? d
    : loai === 'week' ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6)
    : new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const a = ymd(d), b = ymd(cuoi);
  return { tu: a < tu ? tu : a, den: b > den ? den : b };
};

/** Gom dòng API thành bảng. Tổng lấy đúng dòng tổng của máy chủ, không cộng ô, để số đếm không trùng */
export const pivotXuongKy = (rows: DongXuongKy[], lay: (r: DongXuongKy) => number): BangPivot => {
  const kys = new Set<string>();
  const dong = new Map<string, BangPivot['dong'][number]>();
  const tongKy: Record<string, number> = {};
  let tong = 0;
  const layDong = (x: string) => {
    let d = dong.get(x);
    if (!d) { d = { xuong: x, o: {}, tong: 0 }; dong.set(x, d); }
    return d;
  };
  for (const r of rows) {
    if (r.xuong === null && r.ky === null) tong = lay(r);
    else if (r.xuong === null) { kys.add(r.ky as string); tongKy[r.ky as string] = lay(r); }
    else if (r.ky === null) layDong(r.xuong).tong = lay(r);
    else { kys.add(r.ky); layDong(r.xuong).o[r.ky] = lay(r); }
  }
  return { kys: [...kys].sort(), dong: [...dong.values()].sort((a, b) => b.tong - a.tong), tongKy, tong };
};

export const CONG_TRINH_KHAC = 'Các công trình khác';

/** Top n theo total giảm dần; coKhac thì thêm 1 dòng cộng phần còn lại */
export const topVaKhac = <T extends { congTrinh: string; congTrinhCode: string; total: number }>(rows: T[], n: number, coKhac: boolean): T[] => {
  const xep = [...rows].sort((a, b) => b.total - a.total);
  const top = xep.slice(0, n);
  const conLai = xep.slice(n).reduce((s, r) => s + r.total, 0);
  return coKhac && xep.length > n ? [...top, { ...xep[n], congTrinh: CONG_TRINH_KHAC, congTrinhCode: '', total: conLai }] : top;
};
