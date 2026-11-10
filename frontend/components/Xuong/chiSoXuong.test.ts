import { describe, expect, it } from 'vitest';
import { catKhac, congSoSanh, duLyDoCho, oSo, tienXuong, tyLe, tyLeCoViec } from './chiSoXuong';

describe('tyLeCoViec', () => {
  it('bỏ ngày không có giờ công, thẻ và dòng tổng cùng 1 số', () => {
    expect(tyLeCoViec([{ gioNguoi: 100, gioCong: 60 }, { gioNguoi: 0, gioCong: 40 }])).toBe(60);
  });
  it('không có giờ công thì không có tỷ lệ', () => {
    expect(tyLeCoViec([{ gioNguoi: 0, gioCong: 40 }])).toBeNull();
    expect(tyLeCoViec([])).toBeNull();
  });
  it('giữ 1 số lẻ', () => {
    expect(tyLeCoViec([{ gioNguoi: 3, gioCong: 2 }])).toBe(66.7);
  });
});

describe('tyLe', () => {
  it('tử 0 ra 0, mẫu 0 ra null', () => {
    expect(tyLe(0, 5)).toBe(0);
    expect(tyLe(5, 0)).toBeNull();
  });
});

describe('định dạng', () => {
  it('ô 0 trống, có dấu nghìn', () => {
    expect(oSo(0)).toBe('');
    expect(oSo(1234.56)).toBe('1,234.6');
  });
  it('tiền 2 số lẻ khi ra tỷ', () => {
    expect(tienXuong(1234560)).toBe('1,234.56 tỷ');
    expect(tienXuong(1500)).toBe('1.50 tỷ');
    expect(tienXuong(850.4)).toBe('850 tr');
  });
});

describe('tổng bằng số ở view cha', () => {
  it('catKhac: dòng hiện + Khác = tổng', () => {
    const kq = catKhac([5, 4, 3, 2], 2, x => x);
    expect(kq.hien).toEqual([5, 4]);
    expect(kq.soKhac).toBe(2);
    expect(kq.khac).toBe(5);
    expect(kq.tong).toBe(14);
  });
  it('duLyDoCho: phần lẻ vào dòng khac, không có phần lẻ thì giữ nguyên', () => {
    expect(duLyDoCho([['a', 3]], 4)).toEqual([['a', 3], ['khac', 1]]);
    expect(duLyDoCho([['a', 3]], 3.01)).toEqual([['a', 3]]);
  });
  it('congSoSanh: chênh tính lại trên tổng', () => {
    const a = { chinhThuc: 10, tram: 12, chenh: 2, phanTram: 20, lon: true };
    const b = { chinhThuc: 10, tram: 8.5, chenh: -1.5, phanTram: -15, lon: true };
    expect(congSoSanh([a, b])).toEqual({ chinhThuc: 20, tram: 20.5, chenh: 0.5, phanTram: 3, lon: false });
  });
  it('congSoSanh: giờ bấm tay 0 thì không có %, chỉ xét ngưỡng giờ', () => {
    expect(congSoSanh([{ chinhThuc: 0, tram: 1, chenh: 1, phanTram: null, lon: true }]).lon).toBe(true);
  });
});
