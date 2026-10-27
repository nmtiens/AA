import { describe, it, expect } from 'vitest';
import { cauGanGiong } from './ganGiong';

describe('câu gần giống', () => {
  it('gợi ý câu ví dụ cùng chữ, không lặp lại câu đã hỏi', () => {
    const gy = cauGanGiong('nhap kho quy 3 cua xuong abc');
    expect(gy.length).toBeGreaterThan(0);
    expect(gy.length).toBeLessThanOrEqual(3);
    expect(gy.some(c => /nhập kho/i.test(c))).toBe(true);
    const ds = [{ cau: 'nhập kho quý 3', tu: new Set(['nhap', 'kho', 'quy']) }];
    expect(cauGanGiong('Nhập kho quý 3', 3, ds)).toEqual([]);
  });
  it('câu không có chữ chung => không gợi ý', () => {
    expect(cauGanGiong('xyz qwe')).toEqual([]);
  });
});
