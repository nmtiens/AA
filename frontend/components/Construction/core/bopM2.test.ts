import { describe, it, expect } from 'vitest';
import { pivotM2, khopCongTrinh, type DuLieuM2 } from './bopM2';

describe('pivotM2', () => {
  const ds = [
    { d: '03. TỦ', m: 'M008' }, { d: '03. TỦ', m: 'M003' }, { d: '01. BÀN', m: '' },
    { d: '10. CỬA', m: 'HỦY' }, { d: '03. TỦ', m: 'M003' },
  ];
  it('đếm dòng × cột, xếp tăng dần như Excel, (blank) cuối', () => {
    const b = pivotM2(ds, x => x.d, x => x.m);
    expect(b.keys).toEqual(['01. BÀN', '03. TỦ', '10. CỬA']);
    expect(b.cols).toEqual(['HỦY', 'M003', 'M008', '(blank)']);
    expect(b.rows.get('03. TỦ')).toEqual({ cells: { M008: 1, M003: 2 }, total: 3 });
    expect(b.colTot['(blank)']).toBe(1);
    expect(b.tong).toBe(5);
  });
});

describe('khopCongTrinh', () => {
  const d = { nguon: 'VILLA BASON V60_CT26-105.xlsx', maCt: 'CT26-105', docLuc: '', hex: [], vatLieu: [] } as DuLieuM2;
  it('so theo mã công trình', () => {
    expect(khopCongTrinh(d, 'VILLA BASON V60_CT26-105')).toBe(true);
    expect(khopCongTrinh(d, 'ST.REGIS_CT26-061')).toBe(false);
  });
});
