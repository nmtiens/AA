import { describe, expect, it } from 'vitest';
import { gomBangNhom } from './model';

const dong = (name: string, open: number) => ({ name, open, waiting: 0, overdue: 1, created: 0, done: 0 });

describe('gomBangNhom', () => {
  it('phần bị cắt vào dòng Khác, tổng khớp mọi dòng', () => {
    const kq = gomBangNhom([dong('A', 5), dong('B', 3), dong('C', 2), dong('Khác', 4)], 2);
    expect(kq.hien.map(r => r.name)).toEqual(['A', 'B']);
    expect(kq.khac?.open).toBe(6);
    expect(kq.khac?.overdue).toBe(2);
    expect(kq.tong.open).toBe(14);
  });

  it('bỏ dòng toàn 0, không có Khác khi đủ dòng', () => {
    const kq = gomBangNhom([dong('A', 5), dong('B', 0)].map((d, i) => (i ? { ...d, overdue: 0 } : d)), 2);
    expect(kq.hien).toHaveLength(1);
    expect(kq.khac).toBeNull();
  });
});
