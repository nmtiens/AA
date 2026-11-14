import { describe, it, expect } from 'vitest';
import { dungBaoCaoBot, cayBaoCaoBot, luuHomNay, tenFile, loiTheoTen, CHUA_BOT, type OBot } from './baoCaoBot';

describe('luuHomNay (giờ Việt Nam)', () => {
  const bayGio = new Date('2026-11-09T10:00:00Z');   // 17:00 ngày 09/11 giờ VN
  it('cùng ngày VN', () => {
    expect(luuHomNay('2026-11-09T01:30:00Z', bayGio)).toBe(true);    // 08:30 09/11 VN
    expect(luuHomNay('2026-11-08T17:05:00Z', bayGio)).toBe(true);    // 00:05 09/11 VN (UTC còn ngày 08)
  });
  it('khác ngày / trống', () => {
    expect(luuHomNay('2026-11-08T16:55:00Z', bayGio)).toBe(false);   // 23:55 08/11 VN
    expect(luuHomNay(undefined, bayGio)).toBe(false);
    expect(luuHomNay('sai', bayGio)).toBe(false);
  });
});

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
    expect(b.cot.find(c => c.khoa === '2026')).toMatchObject({ nhan: 'Tổng', dangMo: true });
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

  const on: OBot[] = [
    { ten: 'A', ipo: 'x', thang: '2026-03', ngay: '2026-03-05', ct: true, tt: 2, so: 1 },
    { ten: 'A', ipo: 'x', thang: '2026-03', ngay: '2026-03-20', ct: true, tt: 3, so: 1 },
    { ten: 'B', ipo: 'x', thang: '2026-04', ngay: '2026-04-01', ct: true, tt: 4, so: 1 },
    { ten: 'B', ipo: 'x', thang: '2027-01', ngay: '2027-01-02', ct: true, tt: 9, so: 1 },
    { ten: 'B', ipo: 'x', thang: '', ngay: '', ct: true, tt: 1, so: 1 },
  ];

  it('tiêu đề 1 tầng khi chưa bung', () => {
    const b = dungBaoCaoBot(on, null);
    expect(b.tieuDe.length).toBe(1);
    expect(b.tieuDe[0].map(h => [h.khoa, h.colSpan, h.rowSpan])).toEqual([[CHUA_BOT, 1, 1], ['2026', 1, 1], ['2027', 1, 1]]);
  });

  it('bung năm: tầng 1 năm gộp ngang trên các tháng + Tổng, ô đóng rowSpan hết các tầng', () => {
    const b = dungBaoCaoBot(on, null, new Set(['2026']));
    expect(b.tieuDe.map(t => t.map(h => [h.nhan, h.colSpan, h.rowSpan]))).toEqual([
      [['CHƯA BOT', 1, 2], ['2026', 3, 1], ['2027', 1, 2]],
      [['T3', 1, 1], ['T4', 1, 1], ['Tổng', 1, 1]],
    ]);
    expect(b.cot.map(c => c.khoa)).toEqual([CHUA_BOT, '2026-03', '2026-04', '2026', '2027']);
    expect(b.cot.find(c => c.khoa === '2026-03')).toMatchObject({ moDuoc: true, dangMo: false });
  });

  it('bung tháng: tầng 3 ngày (dd/mm) + Tổng tháng, cộng đúng ngày / tháng / năm', () => {
    const b = dungBaoCaoBot(on, null, new Set(['2026']), false, new Set(['2026-03']));
    expect(b.tieuDe.map(t => t.map(h => [h.nhan, h.colSpan, h.rowSpan]))).toEqual([
      [['CHƯA BOT', 1, 3], ['2026', 5, 1], ['2027', 1, 3]],
      [['T3', 3, 1], ['T4', 1, 2], ['Tổng', 1, 2]],
      [['05/03', 1, 1], ['20/03', 1, 1], ['Tổng', 1, 1]],
    ]);
    expect(b.cot.map(c => c.khoa)).toEqual([CHUA_BOT, '2026-03-05', '2026-03-20', '2026-03', '2026-04', '2026', '2027']);
    expect(b.dong.find(d => d.ten === 'A')!.o).toEqual({ '2026-03-05': 2, '2026-03-20': 3, '2026-03': 5, '2026': 5 });
    expect(b.tongCot).toMatchObject({ '2026-03': 5, '2026-04': 4, '2026': 9, '2027': 9, [CHUA_BOT]: 1 });
    expect(b.tong).toBe(19);
  });

  it('tháng mở nhưng năm đóng: không bung; dữ liệu máy chủ cũ (không có ngày): tháng không bung được', () => {
    expect(dungBaoCaoBot(on, null, new Set(), false, new Set(['2026-03'])).tieuDe.length).toBe(1);
    const cu = on.map(({ ngay: _n, ...x }) => x);
    const b = dungBaoCaoBot(cu, null, new Set(['2026']), false, new Set(['2026-03']));
    expect(b.tieuDe.length).toBe(2);
    expect(b.cot.find(c => c.khoa === '2026-03')).toMatchObject({ moDuoc: false });
    expect(b.dong.find(d => d.ten === 'A')!.o).toEqual({ '2026-03': 5, '2026': 5 });
  });
});

describe('file công trình lỗi', () => {
  it('tenFile lấy tên cuối đường dẫn', () => {
    expect(tenFile(String.raw`NĂM 2026\CT26-061 X\02_SẢN XUẤT\a_CT26-061.xlsx`)).toBe('a_CT26-061.xlsx');
    expect(tenFile('NĂM 2026/x/b.xlsx')).toBe('b.xlsx');
    expect(tenFile('a.xlsx')).toBe('a.xlsx');
  });
  it('loiTheoTen gom theo tên công trình; máy chủ cũ (không có ten) => rỗng', () => {
    const f1 = { nguon: 'a', loi: 'x', ten: ['A', 'B'] };
    const f2 = { nguon: 'b', loi: 'y', ten: ['A'] };
    const m = loiTheoTen([f1, f2, { nguon: 'c', loi: 'z' }]);
    expect(m.get('A')).toEqual([f1, f2]);
    expect(m.get('B')).toEqual([f1]);
    expect(m.size).toBe(2);
    expect(loiTheoTen(undefined).size).toBe(0);
  });
});

describe('cayBaoCaoBot (dòng theo công trình / sản phẩm / xưởng)', () => {
  const x: OBot[] = [
    { ten: 'A', ipo: 'I', thang: '2026-03', ngay: '2026-03-05', ct: true, tt: 5, so: 1, nsp: 'TỦ', xuong: 'X1' },
    { ten: 'A', ipo: 'I', thang: '', ct: true, tt: 2, so: 1, nsp: 'BÀN', xuong: 'X1' },
    { ten: 'B', ipo: 'I', thang: '2026-03', ngay: '2026-03-09', ct: true, tt: 7, so: 2, nsp: 'TỦ', xuong: 'X2' },
    { ten: 'B', ipo: 'HỦY', thang: '2026-03', ct: true, tt: 100, so: 1, nsp: 'TỦ', xuong: 'X2' },
    { ten: 'OEM', ipo: 'I', thang: '2026-04', ct: false, tt: 50, so: 1 },
  ];
  const I = new Set(['I']);
  it('gốc theo sản phẩm, con theo công trình rồi xưởng; cộng đúng ô / tổng, cùng lọc IPO + mã CT', () => {
    const c = cayBaoCaoBot(x, I, ['nsp', 'ct', 'xuong'], new Set(), true);
    const tu = c.find(n => n.ten === 'TỦ')!;
    expect(tu.tong).toBe(12);
    expect(tu.o).toEqual({ '2026': 12 });
    expect(tu.con.map(n => [n.ten, n.tong])).toEqual([['A', 5], ['B', 7]]);
    expect(tu.con[1].duong).toEqual(['TỦ', 'B']);
    expect(tu.con[1].con).toEqual([expect.objectContaining({ ten: 'X2', duong: ['TỦ', 'B', 'X2'], tong: 7, so: 2, con: [] })]);
    expect(c.find(n => n.ten === 'BÀN')!.o).toEqual({ [CHUA_BOT]: 2 });
    expect(c.some(n => n.ten === '')).toBe(false);   // OEM bị lọc mã CT
  });
  it('tổng cây = tổng báo cáo; thiếu nhóm => giá trị rỗng; lọc thêm theo tên công trình', () => {
    const c = cayBaoCaoBot(x, I, ['xuong', 'ct', 'nsp'], new Set(['2026']), false);
    expect(c.reduce((a, n) => a + n.tong, 0)).toBe(dungBaoCaoBot(x, I, new Set(['2026'])).tong);
    expect(c.find(n => n.ten === '')!.tong).toBe(50);
    expect(c.find(n => n.ten === 'X1')!.o).toEqual({ '2026-03': 5, '2026': 5, [CHUA_BOT]: 2 });
    const chiB = cayBaoCaoBot(x, I, ['nsp', 'ct', 'xuong'], new Set(), true, new Set(), o => o.ten === 'B');
    expect(chiB.map(n => [n.ten, n.tong])).toEqual([['TỦ', 7]]);
  });
});
