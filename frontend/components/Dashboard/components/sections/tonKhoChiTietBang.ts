import type { StockHealthDetail, StockHealthDetailQuery } from '../../../../services/dataService';
import { fmtQty, fmtTy } from '../../../../utils/format';

// Hàm thuần của bảng trong cửa sổ chi tiết Tồn kho (TonKhoChiTiet.tsx).

export type Cot = StockHealthDetail['cot'][number];
export type Dong = StockHealthDetail['rows'][number];

export const trong = (v: unknown) => v === null || v === undefined || v === '';
export const ngayVn = (s: unknown) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(s ?? '');
};

/** Chữ của 1 ô; số 0 để trống */
export const hienO = (c: Cot, v: unknown): string => {
  if (trong(v)) return '';
  if (c.kieu === 'ty') return Number(v) ? fmtTy(Number(v)) : '';
  if (c.kieu === 'so') return Number(v) ? fmtQty(v) : '';
  if (c.kieu === 'ngay') return ngayVn(v);
  return String(v);
};

/** Cột số tiền cộng lên tong; đơn đã nhập có thêm cột giá trị đơn và phần chưa nhập */
export const cotTong = (yc: StockHealthDetailQuery, cot: Cot[]) => (yc.loai === 'da_nhap' ? 'nhapCap' : [...cot].reverse().find(c => c.kieu === 'ty')?.k);

const cong = (ds: Dong[], k: string) => ds.reduce((s, r) => s + (Number(r[k]) || 0), 0);

/** Dòng TỔNG theo cột tiền. Không lọc: cột chính là tong của máy chủ (đúng số vừa bấm, kể cả khi cắt dòng), cột khác chỉ có khi đủ dòng.
 *  Đang lọc: cộng các dòng khớp. Cột số lượng không cộng vì khác đơn vị */
export const dongTong = (yc: StockHealthDetailQuery, kq: StockHealthDetail, loc: Dong[], dangLoc: boolean): Record<string, string> => {
  const chinh = cotTong(yc, kq.cot);
  const chan: Record<string, string> = {};
  for (const c of kq.cot) {
    if (c.kieu !== 'ty') continue;
    if (dangLoc) chan[c.k] = hienO(c, cong(loc, c.k));
    else if (c.k === chinh) chan[c.k] = hienO(c, kq.tong);
    else if (!kq.truncated) chan[c.k] = hienO(c, cong(kq.rows, c.k));
  }
  return chan;
};
