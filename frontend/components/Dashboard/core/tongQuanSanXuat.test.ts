import { describe, it, expect } from 'vitest';
import type { DataRow, ColumnDefinition } from '../../../types';
import { tinhTongQuanSanXuat, DEFAULT_FILTERS, TUY_CHON_MAC_DINH, NO_MATCH_PROJECT, mixTuJson } from './tongQuanSanXuat';

const dong = (p: Partial<Record<string, unknown>>): DataRow => ({
  ten_cong_trinh: 'CT A', xuong_chinh: '3A', tinh_trang: '05. ĐANG SX', tinh_trang_ipo: '01. ĐANG SẢN XUẤT',
  bop: 'P013', tri_gia_don_hang_tong: 100, thanh_tien_nhap_kho_luy_ke: 0, thanh_tien_tinh_phieu: 100,
  khach_hang: 'KH1', khu_vuc_du_an: 'Miền Nam', phan_loai_nhom_san_pham: '01. BÀN', so_ngay_cd_hien_tai: 3,
  ...p,
} as DataRow);
const ROWS: DataRow[] = [
  dong({}),
  dong({ ten_cong_trinh: 'CT B', khach_hang: 'KH2', tinh_trang: '15. CHƯA TRIỂN KHAI', bop: 'P001', tri_gia_don_hang_tong: 50 }),
  dong({ ten_cong_trinh: 'CT A', thanh_tien_nhap_kho_luy_ke: 30 }),                       // còn lại 70
  dong({ ten_cong_trinh: 'CT C', tinh_trang_ipo: '04. HỦY ĐƠN', tri_gia_don_hang_tong: 999 }), // HỦY: ngoài bộ lọc IPO mặc định
];
const COLS = Object.keys(ROWS[0]).map(key => ({ key, label: key })) as ColumnDefinition[];
const tinh = (f = {}, t = {}) => tinhTongQuanSanXuat(ROWS, COLS, { ...DEFAULT_FILTERS, ...f }, { ...TUY_CHON_MAC_DINH, ...t });

describe('tinhTongQuanSanXuat (máy chủ tính sẵn màn đầu)', () => {
  it('phễu = phần còn lại theo BOP, lọc IPO mặc định bỏ đơn HỦY', () => {
    const kq = tinh();
    expect(kq.pivotFunnelData?.total).toBe(100 + 50 + 70);
    expect(kq.pivotFunnelData?.data.map(d => d.name)).toEqual(['P001', 'P013']);
  });
  it('phễu không ăn ô "Tình trạng"; thẻ / pivot thì có', () => {
    const kq = tinh({ tinhTrang: ['05. ĐANG SX'] });
    expect(kq.pivotFunnelData?.total).toBe(220);
    expect(kq.pivotWorkshopData?.grandTotal).toBe(170);
  });
  it('đếm hạng mục: hạng mục đã nhập đủ không tính ở phễu', () => {
    const kq = tinh({}, { workshopMetric: 'COUNT_HEX' });
    expect(kq.pivotFunnelData?.total).toBe(3);
  });
  it('khách hàng quy về danh sách công trình; không khớp thì dùng giá trị giả', () => {
    expect(tinh({ khachHang: ['KH2'] }).effectiveCongTrinh).toEqual(['CT B']);
    expect(tinh({ khachHang: ['KHÔNG CÓ'] }).effectiveCongTrinh).toEqual([NO_MATCH_PROJECT]);
  });
  it('cơ cấu đơn hàng qua JSON vẫn dựng lại được Set công trình', () => {
    const kq = JSON.parse(JSON.stringify(tinh()));
    const kh = mixTuJson(kq.coCau.kh);
    expect(kh.find(d => d.name === 'KH1')?.cts.size).toBe(1);
    expect(kq.coCau.summary.items).toBe(3);
  });
  it('lựa chọn bộ lọc lấy từ toàn bảng (kể cả dòng bị lọc)', () => {
    expect(tinh().luaChon.tinhTrangIpoOptions).toEqual(['01. ĐANG SẢN XUẤT', '04. HỦY ĐƠN']);
  });
});
