import { describe, expect, it } from 'vitest';
import type { StockHealthDetail } from '../../../../services/dataService';
import { cotTong, dongTong, hienO, type Cot } from './tonKhoChiTietBang';

const cot: Cot[] = [{ k: 'ct', nhan: 'Mã', kieu: 'chu' }, { k: 'sl', nhan: 'SL', kieu: 'so' }, { k: 'dau', nhan: 'Đầu', kieu: 'ty' }, { k: 'v', nhan: 'Giá trị', kieu: 'ty' }];
const kq = (rows: StockHealthDetail['rows'], tong: number, truncated = false): StockHealthDetail =>
  ({ tieuDe: 'x', tong, soDong: rows.length, cot, rows, truncated });
const yc = { loai: 'ton' } as const;

describe('hienO', () => {
  it('số 1,234.56, ngày dd/mm/yyyy, ô 0 trống', () => {
    expect(hienO(cot[3], 1234560)).toBe('1,234.56');
    expect(hienO(cot[1], 1234.5)).toBe('1,234.5');
    expect(hienO({ k: 'd', nhan: 'Ngày', kieu: 'ngay' }, '2026-11-07')).toBe('07/11/2026');
    expect(hienO(cot[3], 0)).toBe('');
    expect(hienO(cot[1], 0)).toBe('');
    expect(hienO(cot[3], null)).toBe('');
  });
});

describe('cotTong', () => {
  it('cột tiền cuối, riêng đơn đã nhập là nhapCap', () => {
    expect(cotTong(yc, cot)).toBe('v');
    expect(cotTong({ loai: 'da_nhap' }, cot)).toBe('nhapCap');
  });
});

describe('dongTong', () => {
  const rows = [{ ct: 'A', sl: 2, dau: 100, v: 1000 }, { ct: 'B', sl: 3, dau: 200, v: 2000 }];

  it('cột chính bằng tong của máy chủ, số lượng không cộng', () => {
    expect(dongTong(yc, kq(rows, 3000), rows, false)).toEqual({ dau: '0.30', v: '3.00' });
  });

  it('cắt dòng: cột chính vẫn đủ, cột khác bỏ trống vì thiếu dòng', () => {
    expect(dongTong(yc, kq(rows, 9000, true), rows, false)).toEqual({ v: '9.00' });
  });

  it('đang lọc: cộng các dòng khớp', () => {
    expect(dongTong(yc, kq(rows, 3000), rows.slice(0, 1), true)).toEqual({ dau: '0.10', v: '1.00' });
  });
});
