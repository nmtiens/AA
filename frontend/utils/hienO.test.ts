import { describe, it, expect } from 'vitest';
import { hienNgay, laCotSoLuongTien } from './hienO';

describe('hienNgay', () => {
  it('ngày DB => dd/mm/yyyy', () => {
    expect(hienNgay('2026-11-21')).toBe('21/11/2026');
    expect(hienNgay('2026-11-21T00:00:00')).toBe('21/11/2026');
    expect(hienNgay('2026-11-21 08:30:00')).toBe('21/11/2026 08:30');
  });
  it('có múi giờ => giờ máy', () => {
    const d = new Date('2026-11-21T11:12:25.000Z');
    expect(hienNgay('2026-11-21T11:12:25.000Z')).toContain(`${String(d.getMinutes()).padStart(2, '0')}`);
  });
  it('không phải ngày', () => {
    expect(hienNgay('1400000058')).toBeNull();
    expect(hienNgay('CT22-028')).toBeNull();
    expect(hienNgay('21/11/2026')).toBeNull();
  });
});

describe('laCotSoLuongTien', () => {
  it('cột số lượng / tiền', () => {
    for (const k of ['thanh_tien', 'sl_hang_ve_thuc_te', 'so_luong_yeu_cau', 'so_luong_con_lai', 'gia_tri_ton_kho', 'don_gia']) expect(laCotSoLuongTien(k)).toBe(true);
    expect(laCotSoLuongTien('x', 'TRỊ GIÁ ĐƠN HÀNG TỔNG')).toBe(true);
  });
  it('cột mã dạng số giữ nguyên', () => {
    for (const k of ['so_pr', 'so_po', 'pr_line', 'ma_vat_tu_sap', 'hex', 'nam', 'thang', 'so_ngay_cd_hien_tai', 'so_ipo']) expect(laCotSoLuongTien(k)).toBe(false);
  });
});
