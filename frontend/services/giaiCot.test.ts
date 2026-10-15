import { describe, it, expect } from 'vitest';
import { giaiCot } from './dataService';

describe('giaiCot (/api/all-data?fmt=cot)', () => {
  it('đổi {c, r} về mảng dòng, giữ null', () => {
    expect(giaiCot({ c: ['hex', 'gia', 'ngay'], r: [['1', 10, null], ['2', null, '2026-10-01']] })).toEqual([
      { hex: '1', gia: 10, ngay: null },
      { hex: '2', gia: null, ngay: '2026-10-01' },
    ]);
  });
  it('máy chủ cũ trả mảng dòng => giữ nguyên; dữ liệu hỏng / thiếu => mảng rỗng', () => {
    const rows = [{ hex: '1' }];
    expect(giaiCot(rows)).toBe(rows);
    expect(giaiCot(null)).toEqual([]);
    expect(giaiCot({ c: ['a'] })).toEqual([]);
    expect(giaiCot({ c: ['a'], r: [] })).toEqual([]);
  });
});
