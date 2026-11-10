import { describe, expect, it } from 'vitest';
import { laCotTienBoHuy, tachHuy } from './tachHuyTong';

describe('laCotTienBoHuy', () => {
  it('cột tiền bỏ HỦY, tồn kho và số lượng giữ nguyên', () => {
    expect(laCotTienBoHuy('tri_gia_don_hang_tong')).toBe(true);
    expect(laCotTienBoHuy('thanh_tien_nhap_kho_luy_ke')).toBe(true);
    expect(laCotTienBoHuy('x', 'GIÁ TRỊ CÒN LẠI')).toBe(true);
    expect(laCotTienBoHuy('thanh_tien_ton_kho_hien_tai')).toBe(false);
    expect(laCotTienBoHuy('so_luong_don_hang_tong')).toBe(false);
  });
});

describe('tachHuy', () => {
  const rows = [
    { tinh_trang_ipo: '01. ĐANG SẢN XUẤT', tri_gia_don_hang_tong: 10 },
    { tinh_trang_ipo: '09. HỦY', tri_gia_don_hang_tong: 5 },
    { tinh_trang_ipo: 'huỷ', tri_gia_don_hang_tong: 2 },
  ];
  it('tách dòng HỦY cột tiền', () => {
    const { tinh, huy } = tachHuy(rows, 'tinh_trang_ipo', 'tri_gia_don_hang_tong');
    expect(tinh).toHaveLength(1);
    expect(huy).toHaveLength(2);
  });
  it('bảng không có cột IPO thì không tách', () => {
    expect(tachHuy(rows, '', 'tri_gia_don_hang_tong').huy).toHaveLength(0);
  });
  it('cột số lượng không tách', () => {
    expect(tachHuy(rows, 'tinh_trang_ipo', 'so_luong_don_hang_tong').tinh).toHaveLength(3);
  });
});
