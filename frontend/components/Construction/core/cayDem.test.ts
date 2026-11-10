import { describe, it, expect } from 'vitest';
import { tinhCayDem } from './cayDem';

describe('tinhCayDem', () => {
  const ds = [{ a: 'X', b: 'p', c: '2026-10-01' }, { a: 'X', b: 'q', c: '2026-10-01' }, { a: 'X', b: 'p', c: '2026-11-02' }, { a: 'Y', b: 'p', c: '' }];
  const c = tinhCayDem(ds, x => [x.a, x.b], x => x.c, (m, n) => m.ten.localeCompare(n.ten));
  it('con cộng bằng cha, cha cộng bằng tổng', () => {
    expect(c.goc.map(n => [n.ten, n.total])).toEqual([['X', 3], ['Y', 1]]);
    expect(c.goc[0].con.map(n => [n.ten, n.total])).toEqual([['p', 2], ['q', 1]]);
    expect(c.goc[0].cells).toEqual({ '2026-10-01': 2, '2026-11-02': 1 });
    expect(c.goc[0].con[0].duong).toEqual(['X', 'p']);
    expect(c.tong).toBe(4);
  });
  it('cột xếp theo khoá, tổng cột đúng', () => {
    expect(c.cols).toEqual(['', '2026-10-01', '2026-11-02']);
    expect(c.colTot['2026-10-01']).toBe(2);
  });
  it('cộng theo giá trị khi truyền hàm giá trị', () => {
    const g = tinhCayDem(ds, x => [x.a], x => x.c, (m, n) => m.ten.localeCompare(n.ten), x => (x.a === 'X' ? 10 : 5));
    expect(g.tong).toBe(35);
    expect(g.goc[0].total).toBe(30);
    expect(g.colTot['2026-10-01']).toBe(20);
  });
});
