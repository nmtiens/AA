import { describe, expect, it } from 'vitest';
import { bienKy, chonKy, CONG_TRINH_KHAC, nhanKy, pivotXuongKy, topVaKhac } from './xuongKy';

describe('kỳ của bảng', () => {
  it('chọn kỳ theo độ dài khoảng', () => {
    expect(chonKy('2026-11-01', '2026-11-14')).toBe('day');
    expect(chonKy('2026-11-01', '2026-11-15')).toBe('week');
    expect(chonKy('2026-01-01', '2026-11-07')).toBe('month');
  });

  it('nhãn kỳ', () => {
    expect(nhanKy('2026-11-05', 'day')).toBe('05/11');
    expect(nhanKy('2026-11-01', 'month')).toBe('T11/2026');
    expect(nhanKy('2026-11-02', 'week')).toBe('T45 (02-08/11)');
    expect(nhanKy('2026-10-26', 'week')).toBe('T44 (26/10-01/11)');
  });

  it('biên kỳ cắt theo khoảng lọc', () => {
    expect(bienKy('2026-10-26', 'week', '2026-11-01', '2026-11-30')).toEqual({ tu: '2026-11-01', den: '2026-11-01' });
    expect(bienKy('2026-02-01', 'month', '2026-01-01', '2026-12-31')).toEqual({ tu: '2026-02-01', den: '2026-02-28' });
    expect(bienKy('2026-11-05', 'day', '2026-11-01', '2026-11-30')).toEqual({ tu: '2026-11-05', den: '2026-11-05' });
  });
});

describe('pivotXuongKy', () => {
  const rows = [
    { xuong: 'A', ky: '2026-10-01', total: 1, totalCount: 2 },
    { xuong: 'A', ky: '2026-11-01', total: 2, totalCount: 2 },
    { xuong: 'A', ky: null, total: 3, totalCount: 3 },
    { xuong: 'B', ky: '2026-11-01', total: 5, totalCount: 1 },
    { xuong: 'B', ky: null, total: 5, totalCount: 1 },
    { xuong: null, ky: '2026-10-01', total: 1, totalCount: 2 },
    { xuong: null, ky: '2026-11-01', total: 7, totalCount: 2 },
    { xuong: null, ky: null, total: 8, totalCount: 3 },
  ];

  it('tiền: dòng lớn lên trước, tổng khớp', () => {
    const b = pivotXuongKy(rows, r => r.total);
    expect(b.kys).toEqual(['2026-10-01', '2026-11-01']);
    expect(b.dong.map(d => d.xuong)).toEqual(['B', 'A']);
    expect(b.dong[1].o['2026-11-01']).toBe(2);
    expect(b.tongKy['2026-11-01']).toBe(7);
    expect(b.tong).toBe(8);
  });

  it('số đếm: tổng lấy từ máy chủ, không cộng ô', () => {
    const b = pivotXuongKy(rows, r => r.totalCount);
    expect(b.tong).toBe(3);
    expect(b.tongKy['2026-11-01']).toBe(2);
  });
});

describe('topVaKhac', () => {
  const rows = [3, 1, 5, 2].map((total, i) => ({ congTrinh: `C${i}`, congTrinhCode: `${i}`, total }));

  it('lớn nhất đầu tiên, dòng Khác cộng phần còn lại', () => {
    const kq = topVaKhac(rows, 2, true);
    expect(kq.map(r => r.total)).toEqual([5, 3, 3]);
    expect(kq[2].congTrinh).toBe(CONG_TRINH_KHAC);
    expect(kq[2].congTrinhCode).toBe('');
    expect(kq.reduce((s, r) => s + r.total, 0)).toBe(11);
  });

  it('không có dòng Khác khi đủ hoặc chế độ đếm', () => {
    expect(topVaKhac(rows, 4, true)).toHaveLength(4);
    expect(topVaKhac(rows, 2, false)).toHaveLength(2);
  });
});
