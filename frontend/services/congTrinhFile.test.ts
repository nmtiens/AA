import { describe, it, expect } from 'vitest';
import { ghepDongFile, coSoFile, type DuLieuFileCongTrinh } from './congTrinhFile';

const cols = [
  { key: 'hex', label: 'HEX', type: 'string' as const },
  { key: 'ma_cong_trinh', label: 'MÃ CÔNG TRÌNH', type: 'string' as const },
  { key: 'ten_pm', label: 'TÊN PM', type: 'string' as const },
];
const du = (dong: DuLieuFileCongTrinh['dong']): DuLieuFileCongTrinh => ({ coBang: true, capNhat: null, soFile: 1, cot: [], dong });

describe('ghepDongFile (số theo file công trình)', () => {
  const app = [
    { hex: '1', ma_cong_trinh: 'CT26-001', bop: 'P012', tri_gia_don_hang_tong: 10, so_ngay_cd_hien_tai: '2 TUẦN', ten_pm: 'A' },
    { hex: '2', ma_cong_trinh: 'CT26-001', bop: 'P022', tri_gia_don_hang_tong: 5 },
    { hex: '3', ma_cong_trinh: 'CT26-002', bop: 'P001', tri_gia_don_hang_tong: 7 },
  ];
  it('phạm vi = HEX của file; dòng không khác giữ nguyên object của app', () => {
    const ra = ghepDongFile(app, cols, 'hex', du([['1', 0], ['2', 0]]));
    expect(ra.map(r => r.hex)).toEqual(['1', '2']);
    expect(ra[0]).toBe(app[0]);
  });
  it('đè ô file khác, giữ cột file không có (số ngày ở công đoạn); không sửa dòng gốc', () => {
    const ra = ghepDongFile(app, cols, 'hex', du([['1', { bop: 'P014', tri_gia_don_hang_tong: 12, thanh_tien_ton_kho_hien_tai: null }]]));
    expect(ra[0]).toMatchObject({ bop: 'P014', tri_gia_don_hang_tong: 12, thanh_tien_ton_kho_hien_tai: null, so_ngay_cd_hien_tai: '2 TUẦN' });
    expect(app[0].bop).toBe('P012');
  });
  it('HEX chưa có trong app => dòng chỉ có số file', () => {
    const ra = ghepDongFile(app, cols, 'hex', du([['9', { ma_cong_trinh: 'CT26-009', bop: 'P001', tri_gia_don_hang_tong: 3 }]]));
    expect(ra[0]).toMatchObject({ hex: '9', ma_cong_trinh: 'CT26-009', bop: 'P001', tri_gia_don_hang_tong: 3 });
  });
  it('HEX dạng số ở dữ liệu app vẫn khớp chuỗi HEX của file', () => {
    const ra = ghepDongFile([{ hex: 260000001, bop: 'P001' }], cols, 'hex', du([['260000001', { bop: 'P002' }]]));
    expect(ra[0]).toMatchObject({ hex: 260000001, bop: 'P002' });
  });
  it('coSoFile: chưa có bảng / chưa nạp file => dùng dữ liệu app', () => {
    expect(coSoFile(null)).toBe(false);
    expect(coSoFile({ ...du([]), coBang: true })).toBe(false);
    expect(coSoFile({ ...du([['1', 0]]), coBang: false })).toBe(false);
    expect(coSoFile(du([['1', 0]]))).toBe(true);
  });
});
