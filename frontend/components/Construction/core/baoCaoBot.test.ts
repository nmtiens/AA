import { describe, it, expect } from 'vitest';
import { dungBaoCaoBot, CHUA_BOT, type OBot } from './baoCaoBot';

const o: OBot[] = [
  { ten: 'A', ipo: '01. ĐANG SẢN XUẤT', thang: '', ct: true, tt: 10, so: 1 },
  { ten: 'A', ipo: '01. ĐANG SẢN XUẤT', thang: '2026-03', ct: true, tt: 5, so: 2 },
  { ten: 'A', ipo: '01. ĐANG SẢN XUẤT', thang: '2026-11', ct: true, tt: 7, so: 1 },
  { ten: 'B', ipo: '01. ĐANG SẢN XUẤT', thang: '2027-01', ct: true, tt: 100, so: 3 },
  { ten: 'B', ipo: '04. HỦY', thang: '2025-01', ct: true, tt: 999, so: 1 },
  { ten: 'C', ipo: '01. ĐANG SẢN XUẤT', thang: '2026-05', ct: true, tt: null, so: 1 },
  { ten: 'OEM', ipo: '01. ĐANG SẢN XUẤT', thang: '2024-02', ct: false, tt: 50, so: 1 },
];
const dsx = new Set(['01. ĐANG SẢN XUẤT']);

describe('dungBaoCaoBot', () => {
  it('lọc IPO, cột CHƯA BOT + năm, xếp hàng giảm dần theo tổng', () => {
    const b = dungBaoCaoBot(o, dsx, new Set(), true);
    expect(b.cot.map(c => c.khoa)).toEqual([CHUA_BOT, '2026', '2027']);   // 2025 chỉ có dòng HỦY => không có cột
    expect(b.dong.map(d => d.ten)).toEqual(['B', 'A', 'C']);
    expect(b.dong[1].o).toEqual({ [CHUA_BOT]: 10, '2026': 12 });
    expect(b.tong).toBe(122);
    expect(b.tongCot).toEqual({ [CHUA_BOT]: 10, '2026': 12, '2027': 100 });
    expect(b.so).toBe(8);
  });

  it('ô có dòng nhưng TT trống = 0 (Excel hiện 0), không có dòng = không có khoá (ô trống)', () => {
    const b = dungBaoCaoBot(o, dsx);
    const c = b.dong.find(d => d.ten === 'C')!;
    expect(c.o).toEqual({ '2026': 0 });
    expect(c.o['2027']).toBeUndefined();
  });

  it('bung năm: cột tháng có dữ liệu + cột tổng năm, tổng năm vẫn đúng', () => {
    const b = dungBaoCaoBot(o, dsx, new Set(['2026']), true);
    expect(b.cot.map(c => c.khoa)).toEqual([CHUA_BOT, '2026-03', '2026-05', '2026-11', '2026', '2027']);
    expect(b.cot.find(c => c.khoa === '2026')).toMatchObject({ nhan: 'Tổng 2026', dangMo: true });
    const a = b.dong.find(d => d.ten === 'A')!;
    expect(a.o).toEqual({ [CHUA_BOT]: 10, '2026-03': 5, '2026-11': 7, '2026': 12 });
    expect(b.tong).toBe(122);
  });

  it('không lọc IPO = lấy hết', () => {
    const b = dungBaoCaoBot(o, null);
    expect(b.tong).toBe(1171);
    expect(b.cot.map(c => c.khoa)).toEqual([CHUA_BOT, '2024', '2025', '2026', '2027']);
  });

  it('chỉ mã CT: bỏ OEM / hàng lẻ như lọc MÃ CÔNG TRÌNH của file', () => {
    expect(dungBaoCaoBot(o, dsx).dong.map(d => d.ten)).toContain('OEM');
    expect(dungBaoCaoBot(o, dsx, new Set(), true).dong.map(d => d.ten)).not.toContain('OEM');
  });
});
