import { describe, expect, it } from 'vitest';
import { thamSoBoLoc, type DongPr } from '../../services/vatTuApi';
import {
  bangExcelDong, chuODong, COT_BANG, cotDongHien, fmtNgay, fmtO, fmtTrieu, khoangThang, nhanThangNgan, soNgayToi,
  tachCongTrinh, tenFileAnToan, NHAN_TRANG_THAI, MAU_TRANG_THAI, cotBangHien, giaoKhoang, trangThaiSoDong,
} from './xuLyDatMua';
import type { SoGop } from '../../services/vatTuApi';

const dong = (p: Partial<DongPr> = {}): DongPr => ({
  id: 1, soPr: '1400017476', prLine: 10, ngayPr: '2026-11-05', trackingno: 'CT25-051', tenCongTrinh: 'MINI HOTEL',
  ma: '100000002821', tenVatTu: 'KÍNH GHÉP', nhomVt: '110 - Kính', dvt: 'TAM', slYeuCau: 4, slDaNhan: 0, slConLai: 4,
  soPo: '4100031157', nhaCungCap: 'NCC A', tinhTrangPo: null, ngayCan: '2026-11-12', han: '2026-11-12', ngayDuKien: '2026-11-12',
  ngayThucTeVe: null, donGia: 294791, thanhTien: 1.179164, trangThai: '2.ĐANG MUA', trangThaiSap: 'Mở', tt: 'tre',
  teamPrNote: null, ghiChuPo: null, nguoiYeuCau: 'MM012', maNhaMay: null, codeVatLieu: 'GL-02', itemNote: null, ...p,
});

describe('định dạng', () => {
  it('tiền triệu: ≥ 10 số nguyên, < 10 một số lẻ, ~0 / null để trống', () => {
    expect(fmtTrieu(52241.3)).toBe('52,241');
    expect(fmtTrieu(1.179)).toBe('1.2');
    expect(fmtTrieu(0.01)).toBe('');
    expect(fmtTrieu(null)).toBe('');
  });
  it('ô bảng: % có "—" khi null, số 0 để trống', () => {
    const pt = COT_BANG.find(c => c.khoa === 'ptDungHen')!;
    const so = COT_BANG.find(c => c.khoa === 'tre')!;
    expect(fmtO(pt, null)).toBe('—');
    expect(fmtO(pt, 44.666)).toBe('44.7%');
    expect(fmtO(so, 0)).toBe('');
    expect(fmtO(so, 1250)).toBe('1,250');
  });
  it('ngày / tháng', () => {
    expect(fmtNgay('2026-11-05')).toBe('05/11/2026');
    expect(fmtNgay(null)).toBe('');
    expect(nhanThangNgan('2026-08')).toBe('T8/26');
    expect(khoangThang('2026-02')).toEqual({ tu: '2026-02-01', den: '2026-02-28' });
    expect(khoangThang('2028-02')).toEqual({ tu: '2028-02-01', den: '2028-02-29' });
    expect(khoangThang('2026-13')).toBeNull();
  });
  it('số ngày tới hạn', () => {
    expect(soNgayToi('2026-11-28', '2026-11-21')).toBe(7);
    expect(soNgayToi('2026-11-20', '2026-11-21')).toBe(-1);
    expect(soNgayToi(null, '2026-11-21')).toBeNull();
  });
});

describe('bộ lọc', () => {
  it('ô công trình: tách, viết hoa, bỏ trùng', () => {
    expect(tachCongTrinh('ct26-001, CT26-001; sdc xkl')).toEqual(['CT26-001', 'SDC', 'XKL']);
  });
  it('tham số URL: chỉ gửi mục có giá trị; công tắc chỉ gửi khi hiện', () => {
    expect(thamSoBoLoc({}).toString()).toBe('');
    const q = thamSoBoLoc({ tu: '2026-01-01', nhom: ['115', '110'], trangThai: ['tre'], an806: false, an401: true, q: ' 123 ' }, { trang: 2, ma: null });
    expect(q.get('tu')).toBe('2026-01-01');
    expect(q.get('nhom')).toBe('115,110');
    expect(q.get('trangThai')).toBe('tre');
    expect(q.get('an806')).toBe('0');
    expect(q.has('an401')).toBe(false);
    expect(q.get('q')).toBe('123');
    expect(q.get('trang')).toBe('2');
    expect(q.has('ma')).toBe(false);
  });
});

describe('bấm ô / tháng', () => {
  it('ô Số dòng PR: mọi trạng thái trừ HỦY; đang lọc tình trạng thì giữ (bỏ HỦY)', () => {
    expect(trangThaiSoDong({ anHuy: false })).not.toContain('huy');
    expect(trangThaiSoDong({ anHuy: false })).toContain('tamDung');
    expect(trangThaiSoDong({ trangThai: ['tre', 'huy'] })).toEqual(['tre']);
  });
  it('tháng chọn GIAO với khoảng đang lọc', () => {
    const k = { tu: '2026-11-01', den: '2026-11-30' };
    expect(giaoKhoang({}, k)).toEqual(k);
    expect(giaoKhoang({ tu: '2026-11-10' }, k)).toEqual({ tu: '2026-11-10', den: '2026-11-30' });
    expect(giaoKhoang({ tu: '2026-01-01', den: '2026-11-15' }, k)).toEqual({ tu: '2026-11-01', den: '2026-11-15' });
  });
  it('cột bảng: ẩn tiền khi không có quyền giá, ẩn trạng thái ít gặp khi TỔNG = 0', () => {
    const tong = { tamDung: 5, huy: 0, theoNhuCau: 0, giaCong: 2 } as unknown as SoGop;
    const k = cotBangHien(false, tong).map(c => c.khoa);
    expect(k).toContain('tamDung');
    expect(k).toContain('giaCong');
    expect(k).not.toContain('huy');
    expect(k).not.toContain('theoNhuCau');
    expect(k).not.toContain('giaTriPr');
    expect(cotBangHien(true, tong).map(c => c.khoa)).toContain('giaTriPr');
  });
});

describe('danh sách dòng PR', () => {
  it('đủ nhãn / màu cho mọi trạng thái', () => {
    expect(Object.keys(NHAN_TRANG_THAI).sort()).toEqual(Object.keys(MAU_TRANG_THAI).sort());
  });
  it('không có quyền giá => bỏ cột NCC / đơn giá / thành tiền', () => {
    const k = cotDongHien(false).map(c => c.khoa);
    expect(k).not.toContain('nhaCungCap');
    expect(k).not.toContain('donGia');
    expect(k).not.toContain('thanhTien');
    expect(cotDongHien(true).map(c => c.khoa)).toContain('thanhTien');
  });
  it('chữ ô: trạng thái, ngày, số', () => {
    const c = (k: string) => cotDongHien(true).find(x => x.khoa === k)!;
    expect(chuODong(c('tt'), dong())).toBe('Trễ hẹn');
    expect(chuODong(c('ngayPr'), dong())).toBe('05/11/2026');
    expect(chuODong(c('slYeuCau'), dong({ slYeuCau: 12.799999999 }))).toBe('12.8');
    expect(chuODong(c('ngayThucTeVe'), dong())).toBe('');
  });
  it('Excel: tiêu đề + số giữ kiểu số', () => {
    const aoa = bangExcelDong([dong()], false);
    expect(aoa[0][0]).toBe('Tình trạng');
    expect(aoa[0]).not.toContain('Thành tiền (triệu)');
    const iSl = aoa[0].indexOf('SL yêu cầu');
    expect(aoa[1][iSl]).toBe(4);
    expect(aoa[1][0]).toBe('Trễ hẹn');
  });
  it('tên file an toàn', () => {
    expect(tenFileAnToan('115 - Phụ kiện / Trễ hẹn')).toBe('115-Phụ-kiện-Trễ-hẹn');
    expect(tenFileAnToan('***')).toBe('dat-mua');
  });
});
