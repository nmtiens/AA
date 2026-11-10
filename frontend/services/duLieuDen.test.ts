import { describe, expect, it } from 'vitest';
import { homNayVN, tomTatDuLieuDen } from './duLieuDen';

const dong = (table: string, dataAsOfDate: string | null, isManual = false) => ({ table, label: table, dataAsOfDate, isManual });

describe('tomTatDuLieuDen', () => {
  it('lấy ngày cũ nhất của nguồn chính, bỏ nguồn phụ và nhập tay', () => {
    const kq = tomTatDuLieuDen([dong('nhap_kho', '2026-11-05'), dong('xuat_kho', '2026-11-04'), dong('khsx', '2026-10-14'), dong('dht', '2026-01-01', true)], '2026-11-06');
    expect(kq?.nhan).toBe('04/11');
    expect(kq?.cu).toBe(false);
    expect(kq?.chiTiet).toBe('xuat_kho: 04/11\nnhap_kho: 05/11');
  });

  it('cũ hơn 2 ngày thì tô đỏ, đúng 2 ngày thì chưa', () => {
    expect(tomTatDuLieuDen([dong('nhap_kho', '2026-11-05')], '2026-11-07')?.cu).toBe(false);
    expect(tomTatDuLieuDen([dong('nhap_kho', '2026-11-04')], '2026-11-07')?.cu).toBe(true);
    expect(tomTatDuLieuDen([dong('nhap_kho', '2026-12-30')], '2027-01-02')?.cu).toBe(true);
  });

  it('không có ngày thì không hiện', () => {
    expect(tomTatDuLieuDen([dong('nhap_kho', null)], '2026-11-07')).toBeNull();
    expect(tomTatDuLieuDen([], '2026-11-07')).toBeNull();
  });

  it('hôm nay theo giờ VN', () => {
    expect(homNayVN(new Date('2026-11-06T18:00:00Z'))).toBe('2026-11-07');
  });
});
