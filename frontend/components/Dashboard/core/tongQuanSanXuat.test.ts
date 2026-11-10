import { describe, it, expect } from 'vitest';
import type { DataRow, ColumnDefinition } from '../../../types';
import { tinhTongQuanSanXuat, tinhCardMetrics, tinhBottleneck, khopNhomTinhTrang, khoaSanXuat, DEFAULT_FILTERS, TUY_CHON_MAC_DINH, NO_MATCH_PROJECT, mixTuJson } from './tongQuanSanXuat';
import { laChuaTheSX, maTinhTrang, nhomCuaMa } from '../constants';

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
// Mọi tình trạng có trong DB ở IPO 01 (07/11/2026)
const TINH_TRANG_DB = ['01. NHẬP KHO KĐB', '02. BAO BÌ', '02.1. ĐÓNG KIỆN', '03. FITTING', '03.3. FITTING KL', '04. VECNI', '04.1. BỌC NỆM', '04.2. PVD',
  '04.3. SƠN TĨNH ĐIỆN', '04.4. GCVT SƠN', '04.5. GCVT MỸ NGHỆ', '05. MỘC', '05.1. TỔ ĐÁ', '05.2. NGUỘI', '05.3. GCVT MỘC', '06. MÁY', '06.1. HÀN',
  '06.2. GCVT MÁY', '06.3. GCVT HÀN', '07. CTS', '07.1. CTS ĐÁ', '07.2. PHÔI', '07.ĐÃ GIAO GCNB', '11. CHƯA SX', '12. CHƯA SX PHẦN CÒN LẠI',
  '13. CHƯA PHIẾU PHẦN CÒN LẠI', '14. CHƯA PHIẾU', '14.1. CHƯA PHIẾU KL', '15. CHƯA TRIỂN KHAI', '16.1. GCVT TAY NẮM', '16.2. GCVT KHUNG KIM LOẠI',
  '16.3. GCVT KHUNG GỖ', '16.4. GCVT KÍNH', '16.5. GCVT ĐÁ', '16.6. GCVT COMPOSITE', '16.8. GCVT NGUYÊN CON', '16.9. GCVT KHÁC'];
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
  it('đếm còn lại: pivot xưởng cùng số với phễu', () => {
    const r = [...ROWS, dong({ tri_gia_don_hang_tong: 100, thanh_tien_nhap_kho_luy_ke: 100 })];
    const kq = tinhTongQuanSanXuat(r, COLS, DEFAULT_FILTERS, { ...TUY_CHON_MAC_DINH, workshopMetric: 'COUNT_HEX' });
    expect(kq.pivotWorkshopData?.grandTotal).toBe(kq.pivotFunnelData?.total);
    expect(kq.pivotFunnelData?.total).toBe(3);
  });
  it('điểm nghẽn bỏ HỦY và hạng mục đã nhập đủ', () => {
    const r = [dong({}), dong({ tinh_trang_ipo: '04. HỦY' }), dong({ thanh_tien_nhap_kho_luy_ke: 100 })];
    const t = tinhBottleneck(r, khoaSanXuat(COLS), 'BOP');
    expect(t).toHaveLength(1);
    expect(Object.entries(t[0]).filter(([k]) => k !== 'name' && !k.startsWith('gt:')).reduce((a, [, v]) => a + Number(v), 0)).toBe(1);
  });
  it('lựa chọn bộ lọc lấy từ toàn bảng (kể cả dòng bị lọc)', () => {
    expect(tinh().luaChon.tinhTrangIpoOptions).toEqual(['01. ĐANG SẢN XUẤT', '04. HỦY ĐƠN']);
  });
});

describe('nhóm tình trạng theo tiền tố mã', () => {
  it('đọc mã đầu', () => {
    expect(maTinhTrang('06.3. GCVT HÀN')).toBe('06.3');
    expect(maTinhTrang('07.ĐÃ GIAO GCNB')).toBe('07');
    expect(maTinhTrang('TẠM NGƯNG')).toBe('');
  });
  it('mọi tình trạng trong DB đều có nhóm; GCVT vào Có thể SX; đã nhập, HỦY không có nhóm', () => {
    TINH_TRANG_DB.forEach(s => expect(nhomCuaMa(maTinhTrang(s)), s).not.toBeNull());
    ['06.2. GCVT MÁY', '06.3. GCVT HÀN', '16.9. GCVT KHÁC', '04.4. GCVT SƠN'].forEach(s => expect(nhomCuaMa(maTinhTrang(s))).toBe('CHUYEN_KHAC'));
    ['00. ĐÃ XUẤT HÀNG', '01.1. NHẬP KHO ĐB', 'HỦY', 'TẠM NGƯNG'].forEach(s => expect(nhomCuaMa(maTinhTrang(s))).toBeNull());
  });
  it('chỉ 12-15 là Chưa thể SX', () => {
    expect(TINH_TRANG_DB.filter(laChuaTheSX)).toEqual(['12. CHƯA SX PHẦN CÒN LẠI', '13. CHƯA PHIẾU PHẦN CÒN LẠI', '14. CHƯA PHIẾU', '14.1. CHƯA PHIẾU KL', '15. CHƯA TRIỂN KHAI']);
  });
  it('phép kiểm: cộng nhóm = tổng còn lại, không còn phần rơi', () => {
    const r = TINH_TRANG_DB.map(tinh_trang => dong({ tinh_trang }));
    const m = tinhCardMetrics(r, khoaSanXuat(COLS));
    expect(m.tongConLai).toBe(100 * TINH_TRANG_DB.length);
    expect(m.chuaXepNhom).toBe(0);
    expect(m.coTheSX + m.chuaTheSX).toBe(m.tongConLai);
    expect(m.coTheSX).toBe(m.vecniFitting + m.chuyenKhac + m.coPhieuChuaSX);
    expect(m.chuaTheSX).toBe(m.vuongSL + m.chuaTrienKhai);
    expect(khopNhomTinhTrang(m)).toBe(true);
  });
  it('tình trạng lạ vào Chưa xếp nhóm, phép kiểm vẫn khớp, HỦY = 0', () => {
    const m = tinhCardMetrics([dong({ tinh_trang: '99. MỚI' }), dong({ tinh_trang: '05. MỘC', tinh_trang_ipo: '04. HỦY' })], khoaSanXuat(COLS));
    expect(m).toMatchObject({ chuaXepNhom: 100, tongConLai: 100, coTheSX: 0 });
    expect(khopNhomTinhTrang(m)).toBe(true);
  });
});
