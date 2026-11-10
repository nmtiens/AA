import { describe, expect, it } from 'vitest';
import {
  boDongHexHuy, chenCotSoHex, diemNghenDau, dongTonKhac0, gomGiaTriTheoHex, laChoBanVe, ngayChuoi, soHex, tongCungDvt, tongHex, tyLeKh,
} from './chiTietHex';

const k = { triGiaKey: 'tg', phieuKey: 'tp', nhapKhoKey: 'nk', xuatKhoKey: 'xk', tonKhoKey: 'tk' };
const dong = (tg: number, nk: number, xk: number, tk: number, ipo = '01. ĐANG SẢN XUẤT', tp = 0) => ({ tg, nk, xk, tk, tp, tinh_trang_ipo: ipo });

describe('soHex', () => {
  it('đã nhập chặn ≤ trị giá, còn lại không âm', () => {
    const s = soHex(dong(100, 130, 0, 0), k);
    expect([s.nhap, s.conLai]).toEqual([100, 0]);
  });
  it('xuất giữ gốc, phần vượt tách riêng, chênh không âm', () => {
    const s = soHex(dong(100, 50, 80, 10), k);
    expect([s.xuat, s.ton, s.chenh, s.xv]).toEqual([80, 0, 0, 30]);
    const t = soHex(dong(100, 50, 20, 10), k);
    expect([t.xuat, t.ton, t.chenh, t.xv]).toEqual([20, 10, 20, 0]);
  });
  it('HỦY = 0 mọi cột, tồn kho vẫn giữ', () => {
    const s = soHex(dong(100, 60, 20, 30, 'HUỶ'), k);
    expect(s).toMatchObject({ huy: true, triGia: 0, triGiaHuy: 100, phieu: 0, nhap: 0, conLai: 0, xuat: 0, ton: 30 });
  });
});

it('tongHex: cộng dòng bằng TỔNG, HỦY đếm riêng', () => {
  const rows = [dong(100, 40, 10, 5, 'x', 7), dong(50, 90, 0, 0, 'x', 3), dong(30, 10, 0, 10, '04. HỦY', 9)];
  expect(tongHex(rows, k)).toEqual({
    n: 2, huy: { n: 1, triGia: 30 }, triGia: 150, phieu: 10, nhap: 90, conLai: 60, xuat: 10, ton: 15, chenh: 75, xv: 0,
  });
});

describe('chenCotSoHex', () => {
  it('chèn cột kho sau Đã nhập, không lặp cột đã có', () => {
    expect(chenCotSoHex(['hangMuc', 'thanhTienKho', 'tonKho', 'ghi'], false))
      .toEqual(['hangMuc', 'thanhTienKho', 'conLai', 'daXuat', 'chenh', 'xuatVuot', 'tonKho', 'ghi']);
  });
  it('cột giá trị kỳ đứng trước cột số đầu tiên', () => {
    expect(chenCotSoHex(['hangMuc', 'triGia', 'thanhTienKho'], true).slice(0, 3)).toEqual(['hangMuc', 'giaTriKy', 'triGia']);
  });
  it('cấu hình cũ không có cột Đã nhập: thêm vào cuối', () => {
    expect(chenCotSoHex(['hangMuc'], false)[1]).toBe('conLai');
  });
});

it('gomGiaTriTheoHex cộng nhiều dòng cùng HEX, bỏ HEX trống', () => {
  expect(gomGiaTriTheoHex([{ hex: 'A', v: '1000.5' }, { hex: ' A ', v: 2 }, { hex: '', v: 9 }], 'v')).toEqual({ A: 1002.5 });
});

it('điểm nghẽn bỏ chờ bản vẽ, lấy dòng sản xuất đầu tiên', () => {
  expect(laChoBanVe('P001. CHƯA TRIỂN KHAI')).toBe(true);
  expect(laChoBanVe('15. CHƯA TRIỂN KHAI BẢN VẼ')).toBe(true);
  expect(laChoBanVe('P0012')).toBe(false);
  expect(diemNghenDau([{ name: 'P001', count: 9 }, { name: 'P014', count: 5 }])).toEqual({ name: 'P014', count: 5 });
  expect(diemNghenDau([{ name: 'P001' }])).toBeUndefined();
});

it('boDongHexHuy bỏ đúng HEX HỦY', () => {
  const rows = [{ hex: '1' }, { hex: ' 2 ' }, { hex: '3' }];
  expect(boDongHexHuy(rows, 'hex', new Set(['2']))).toEqual([{ hex: '1' }, { hex: '3' }]);
  expect(boDongHexHuy(rows, 'hex', new Set())).toBe(rows);
});

it('dongTonKhac0 bỏ mã giá trị 0', () => {
  expect(dongTonKhac0([{ gia_tri: 0 }, { gia_tri: '0' }, { gia_tri: -2 }, { gia_tri: 5 }])).toEqual([{ gia_tri: -2 }, { gia_tri: 5 }]);
});

it('tongCungDvt chỉ cộng khi cùng ĐVT', () => {
  const r = (dvt: string | null, sl: number) => ({ dvt, sl });
  expect(tongCungDvt([r('kg', 2), r('KG ', 3)], x => x.dvt, x => x.sl)).toBe(5);
  expect(tongCungDvt([r('kg', 2), r('m3', 3)], x => x.dvt, x => x.sl)).toBeNull();
  expect(tongCungDvt([], (x: { dvt: string }) => x.dvt, () => 0)).toBeNull();
});

it('tyLeKh: chưa có KH khác 0%', () => {
  expect(tyLeKh(0, 100)).toBe(0);
  expect(tyLeKh(50, 200)).toBe(25);
  expect(tyLeKh(50, 0)).toBeNull();
});

it('ngayChuoi ra dd/mm/yyyy, chuỗi lạ giữ nguyên', () => {
  expect(ngayChuoi('2026-03-05T00:00:00')).toBe('05/03/2026');
  expect(ngayChuoi('abc')).toBe('abc');
  expect(ngayChuoi(null)).toBe('');
});
