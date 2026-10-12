import { describe, it, expect } from 'vitest';
import {
  gioVN, caCanChot, caHienTai, apDung, nhomDangLam, soNguoiRanh, chiaDeu, trichHex, thoiLuong, hhmm, mocTrongNgay,
  type DongViec, type LichCa,
} from './xuongModel';

const LICH: LichCa[] = [
  { loaiCa: 'chinh', gioBatDau: '07:30', gioKetThuc: '15:45' },
  { loaiCa: 'ca1', gioBatDau: '16:15', gioKetThuc: '18:15' },
  { loaiCa: 'ca4', gioBatDau: '16:15', gioKetThuc: '02:00' },
  { loaiCa: 'chu_nhat', gioBatDau: '07:30', gioKetThuc: '15:45' },
];
// 2026-10-12 là thứ Hai; 2026-10-11 là Chủ nhật
const luc = (ngay: string, gio: string) => mocTrongNgay(ngay, gio);

const dong = (p: Partial<DongViec>): DongViec => ({
  hex: '250301895', congDoanId: 'CD1', trangThai: 'dang_lam', slGiaoDen: 0, slNhan: 10, slHoanThanh: 0, slGiao: 0,
  soNguoi: null, dangChayTu: null, suKienCuoi: null, co: [], tenHangMuc: null, maCongTrinh: null, tenCongTrinh: null,
  dvt: null, goiYKe: [], ...p,
});

describe('giờ Việt Nam', () => {
  it('gioVN / hhmm theo UTC+7', () => {
    expect(gioVN(Date.parse('2026-10-11T17:30:00Z'))).toEqual({ ngay: '2026-10-12', phut: 30, thu: 1 });
    expect(hhmm(luc('2026-10-12', '15:45'))).toBe('15:45');
  });
});

describe('caCanChot (3A)', () => {
  const cv = { quanSo: {}, tangCa: [] as const, lichCa: LICH };
  it('ngày thường trước khi hết ca chính, chưa chốt → ca chính (kể cả trước 7h30)', () => {
    expect(caCanChot({ ...cv, tangCa: [] }, luc('2026-10-12', '07:10'))).toBe('chinh');
    expect(caCanChot({ ...cv, tangCa: [] }, luc('2026-10-12', '15:00'))).toBe('chinh');
  });
  it('đã chốt ca chính → null', () => {
    expect(caCanChot({ quanSo: { chinh: 12 }, tangCa: [], lichCa: LICH }, luc('2026-10-12', '09:00'))).toBeNull();
  });
  it('sau ca chính: ca tăng ca đã khai mà chưa chốt; ca 4 qua đêm vẫn tính tới 02:00 (phút 16h15 trở đi)', () => {
    expect(caCanChot({ quanSo: { chinh: 12 }, tangCa: ['ca4'], lichCa: LICH }, luc('2026-10-12', '20:00'))).toBe('ca4');
    expect(caCanChot({ quanSo: { chinh: 12, ca4: 5 }, tangCa: ['ca4'], lichCa: LICH }, luc('2026-10-12', '20:00'))).toBeNull();
  });
  it('Chủ nhật: không có ca chính; chỉ khi khai tăng ca chủ nhật', () => {
    expect(caCanChot({ quanSo: {}, tangCa: [], lichCa: LICH }, luc('2026-10-11', '08:00'))).toBeNull();
    expect(caCanChot({ quanSo: {}, tangCa: ['chu_nhat'], lichCa: LICH }, luc('2026-10-11', '08:00'))).toBe('chu_nhat');
  });
  it('caHienTai: đã chốt hết → ca gần nhất đã bắt đầu', () => {
    expect(caHienTai({ quanSo: { chinh: 12, ca1: 4 }, tangCa: ['ca1'], lichCa: LICH }, luc('2026-10-12', '17:00'))).toBe('ca1');
    expect(caHienTai({ quanSo: { chinh: 12 }, tangCa: [], lichCa: LICH }, luc('2026-10-12', '17:00'))).toBe('chinh');
  });
});

describe('danh sách & người', () => {
  it('nhomDangLam: 3 nhóm, đang chạy lâu nhất trước', () => {
    const a = dong({ hex: '111111111', dangChayTu: '2026-10-12T02:00:00Z' });
    const b = dong({ hex: '222222222', dangChayTu: '2026-10-12T01:00:00Z' });
    const c = dong({ hex: '333333333', trangThai: 'tam_ngung' });
    const d = dong({ hex: '444444444', trangThai: 'da_nhan' });
    const g = nhomDangLam([a, b, c, d]);
    expect(g.dangChay.map(x => x.hex)).toEqual(['222222222', '111111111']);
    expect(g.tamNgung).toEqual([c]);
    expect(g.chuaBatDau).toEqual([d]);
  });
  it('soNguoiRanh: quân số − người đang khai; chưa chốt → null; không âm', () => {
    expect(soNguoiRanh(12, [dong({ soNguoi: 5 }), dong({ soNguoi: 4 })])).toBe(3);
    expect(soNguoiRanh(undefined, [])).toBeNull();
    expect(soNguoiRanh(3, [dong({ soNguoi: 5 })])).toBe(0);
  });
  it('chiaDeu: phần dư cho khoá đầu, tổng giữ nguyên', () => {
    expect(chiaDeu(10, ['a', 'b', 'c'])).toEqual({ a: 4, b: 3, c: 3 });
    expect(chiaDeu(0, ['a'])).toEqual({ a: 0 });
    expect(chiaDeu(5, [])).toEqual({});
  });
});

describe('apDung (đổi ngay trên máy)', () => {
  const cv = {
    ngay: '2026-10-12', serverNow: 0, to: { id: 1, xuong: '3A', ten: 'T' }, congDoan: [],
    choNhan: [] as DongViec[], dangLam: [] as DongViec[], choGiao: [] as DongViec[],
    quanSo: {}, tangCa: [], quanSoTruoc: {}, soNguoiTangCaTruoc: null, daXacNhanHomNay: false, lichCa: LICH,
  };
  const k = 'X|CD1';
  it('nhận hàng chờ nhận → sang Chưa bắt đầu; nhận một phần thì vẫn còn ở Chờ nhận', () => {
    const r = dong({ hex: 'X', trangThai: 'cho_nhan', slGiaoDen: 10, slNhan: 0 });
    const a = apDung({ ...cv, choNhan: [r] }, k, x => ({ ...x, slNhan: x.slNhan + 4 }));
    expect(a.choNhan).toHaveLength(1);
    expect(a.dangLam[0].trangThai).toBe('da_nhan');
  });
  it('bắt đầu → đang chạy; tạm ngưng giữ tam_ngung; xong một phần → chờ giao', () => {
    const r = dong({ hex: 'X', trangThai: 'da_nhan', slNhan: 10 });
    const chay = apDung({ ...cv, dangLam: [r] }, k, x => ({ ...x, dangChayTu: '2026-10-12T01:00:00Z' }));
    expect(chay.dangLam[0].trangThai).toBe('dang_lam');
    const ngung = apDung(chay, k, x => ({ ...x, dangChayTu: null, trangThai: 'tam_ngung' }));
    expect(ngung.dangLam[0].trangThai).toBe('tam_ngung');
    const xong = apDung(chay, k, x => ({ ...x, dangChayTu: null, slHoanThanh: 5 }));
    expect(xong.choGiao.map(x => x.hex)).toEqual(['X']);
    expect(xong.dangLam).toHaveLength(0);
    const giao = apDung(xong, k, x => ({ ...x, slGiao: 5 }));
    expect(giao.choGiao).toHaveLength(0);
    expect(giao.dangLam[0].trangThai).toBe('da_nhan');
  });
  it('xong một phần nhưng vẫn chạy (giao sau): vừa ở Đang chạy vừa ở Chờ giao', () => {
    const r = dong({ hex: 'X', trangThai: 'dang_lam', slNhan: 10, dangChayTu: '2026-10-12T01:00:00Z' });
    const a = apDung({ ...cv, dangLam: [r] }, k, x => ({ ...x, slHoanThanh: 4 }));
    expect(a.dangLam[0].trangThai).toBe('dang_lam');
    expect(a.choGiao.map(x => x.slHoanThanh - x.slGiao)).toEqual([4]);
  });
  it('dòng chưa có thì tạo từ `moi`', () => {
    const a = apDung(cv, k, x => ({ ...x, slNhan: 3 }), dong({ hex: 'X', slNhan: 0, trangThai: 'cho_nhan' }));
    expect(a.dangLam.map(x => x.slNhan)).toEqual([3]);
  });
});

describe('tiện ích', () => {
  it('trichHex: mã trần, đường dẫn, không nhận chuỗi 10 số', () => {
    expect(trichHex('250301895')).toBe('250301895');
    expect(trichHex('https://x.vn/m/?hex=250301895&a=1')).toBe('250301895');
    expect(trichHex('PTHSP 250301895 GHE AN')).toBe('250301895');
    expect(trichHex('2503018951')).toBeNull();
    expect(trichHex('abc')).toBeNull();
  });
  it('thoiLuong', () => {
    expect(thoiLuong(40 * 60_000)).toBe('40 phút');
    expect(thoiLuong(135 * 60_000)).toBe('2 giờ 15 phút');
    expect(thoiLuong(120 * 60_000)).toBe('2 giờ');
  });
});
