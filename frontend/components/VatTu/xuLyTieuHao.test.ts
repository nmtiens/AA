import { describe, expect, it } from 'vitest';
import { thamSoTieuHao, type DongChungTu, type DongTieuHao, type OTieuHao } from '../../services/vatTuApi';
import {
  bangExcelChungTu, chuOChungTu, COT_CHUNG_TU, cotChungTuHien, duLieuBieuDo, fmtPt, fmtSoO, fmtThangDuDung, ghiChu262, giaoThang,
  KHOA_KHAC, locCuaDong, mucThangDuDung, mvtCuaO, nhanKhoangTb3, phanTramDoi, soCuaO, thangCuoi,
} from './xuLyTieuHao';

const o = (th: number, sd = 1, sl = 0): OTieuHao => ({ th, hh: 0, sl, slHh: 0, sd, sdTh: sd, sdHh: 0 });
const dongTh = (khoa: string, thang: Record<string, OTieuHao>): DongTieuHao => ({
  khoa, ten: `${khoa} - Nhóm`, phu: null, thang, tong: o(Object.values(thang).reduce((a, x) => a + (x.th ?? 0), 0)), soMa: 1, gtTb3: null, slTb3: null,
});

describe('tháng + định dạng', () => {
  it('thangCuoi lấy n tháng cuối', () => {
    expect(thangCuoi(['2026-01', '2026-02', '2026-03'], 2)).toEqual(['2026-02', '2026-03']);
    expect(thangCuoi(['2026-01'], 6)).toEqual(['2026-01']);
  });
  it('ô theo chế độ: giá trị / số dòng / SL', () => {
    const x: OTieuHao = { th: 2.5, hh: 1, sl: 10, slHh: 4, sd: 3, sdTh: 2, sdHh: 1 };
    expect(soCuaO(x, 'giaTri')).toBe(2.5);
    // số dòng = chỉ dòng tiêu hao (khớp danh sách khi bấm ô với mvt tieuHao)
    expect(soCuaO(x, 'soDong')).toBe(2);
    expect(soCuaO(x, 'soLuong')).toBe(10);
    // lọc Z14 => phần hao hụt
    expect(soCuaO(x, 'giaTri', true)).toBe(1);
    expect(soCuaO(x, 'soDong', true)).toBe(1);
    expect(soCuaO(x, 'soLuong', true)).toBe(4);
    expect(mvtCuaO(false)).toBe('tieuHao');
    expect(mvtCuaO(true)).toBe('z14');
    expect(soCuaO(undefined, 'giaTri')).toBeNull();
    expect(fmtSoO(0, 'soDong')).toBe('');
    expect(fmtSoO(1234.5678, 'soLuong')).toBe('1,234.568');
    expect(fmtSoO(-2, 'soLuong')).toBe('-2');
    expect(fmtSoO(12345.6, 'giaTri')).toBe('12,346');
    expect(fmtSoO(null, 'giaTri')).toBe('');
  });
  it('số tháng đủ dùng + mức cảnh báo', () => {
    expect(fmtThangDuDung(0.4)).toBe('< 1');
    expect(fmtThangDuDung(0)).toBe('0');
    expect(fmtThangDuDung(3.26)).toBe('3.3');
    expect(fmtThangDuDung(250)).toBe('≥ 100');
    expect(fmtThangDuDung(null)).toBe('');
    expect(mucThangDuDung(0.5)).toBe('do');
    expect(mucThangDuDung(1.5)).toBe('cam');
    expect(mucThangDuDung(5)).toBeNull();
    expect(mucThangDuDung(null)).toBeNull();
  });
  it('% và % đổi', () => {
    expect(fmtPt(8.333)).toBe('8.3%');
    expect(fmtPt(null)).toBe('—');
    expect(phanTramDoi(12, 10)).toBeCloseTo(20);
    expect(phanTramDoi(12, 0)).toBeNull();
  });
  it('nhãn khoảng TB 3 tháng', () => {
    expect(nhanKhoangTb3(['2026-08', '2026-09', '2026-10'])).toBe('T8–T10/26');
    expect(nhanKhoangTb3(['2026-11', '2026-12', '2027-01'])).toBe('T11/26–T1/27');
    expect(nhanKhoangTb3([])).toBe('');
  });
});

describe('biểu đồ chồng', () => {
  it('8 nhóm lớn nhất + Khác; tổng cột đúng', () => {
    const dong = Array.from({ length: 10 }, (_, i) => dongTh(String(100 + i), { '2026-10': o(i + 1) }));
    const { nhom, cot } = duLieuBieuDo(dong, ['2026-10'], 'giaTri');
    expect(nhom).toHaveLength(9);
    expect(nhom[0].khoa).toBe('109');
    expect(nhom[8].khoa).toBe(KHOA_KHAC);
    expect(cot[0].tong).toBe(55);
    expect(cot[0][KHOA_KHAC]).toBe(1 + 2);
  });
  it('nhóm chỉ hoàn trả (tổng ≤ 0) không vẽ riêng; không có Khác khi đủ ít nhóm', () => {
    const dong = [dongTh('115', { '2026-10': o(5) }), dongTh('110', { '2026-10': o(-1) })];
    const { nhom, cot } = duLieuBieuDo(dong, ['2026-10'], 'giaTri');
    expect(nhom.map(n => n.khoa)).toEqual(['115', KHOA_KHAC]);
    expect(cot[0][KHOA_KHAC]).toBe(-1);
  });
  it('lọc Z14 => biểu đồ vẽ hao hụt', () => {
    const x: OTieuHao = { th: 5, hh: 2, sl: 0, slHh: 0, sd: 2, sdTh: 1, sdHh: 1 };
    const d: DongTieuHao = { ...dongTh('115', {}), thang: { '2026-10': x } };
    expect(duLieuBieuDo([d], ['2026-10'], 'giaTri', 8, true).cot[0].tong).toBe(2);
    expect(duLieuBieuDo([d], ['2026-10'], 'giaTri').cot[0].tong).toBe(5);
  });
  it('chỉ vẽ 18 tháng cuối', () => {
    const thang = Array.from({ length: 24 }, (_, i) => `20${25 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);
    const { cot } = duLieuBieuDo([dongTh('115', { '2026-12': o(1) })], thang, 'soDong');
    expect(cot).toHaveLength(18);
    expect(cot[17].thang).toBe('2026-12');
    expect(cot[17].nhan).toBe('T12/26');
  });
});

describe('bấm ô → bộ lọc chứng từ', () => {
  it('theo nhóm / CT / HEX / xưởng / tháng', () => {
    expect(locCuaDong({ mvt: 'z14' }, 'nhom', '115').loc).toEqual({ mvt: 'z14', nhom: ['115'] });
    expect(locCuaDong({}, 'ct', '-').loc).toEqual({ ct: ['-'] });
    expect(locCuaDong({}, 'hex', 'H001').loc).toEqual({ hex: ['H001'] });
    expect(locCuaDong({}, 'xuong', 'Xưởng 1').loc).toEqual({ xuong: ['Xưởng 1'] });
    expect(locCuaDong({}, 'thang', '2026-10').loc).toEqual({ tu: '2026-10', den: '2026-10' });
  });
  it('theo mã: tách mã + ĐVT; trống => "-"', () => {
    expect(locCuaDong({}, 'ma', '100000000440|KG')).toEqual({ loc: {}, ma: '100000000440', dvt: 'KG' });
    expect(locCuaDong({}, 'ma', '-|')).toEqual({ loc: {}, ma: '-', dvt: '-' });
  });
  it('chọn tháng ngoài khoảng lọc => null', () => {
    expect(giaoThang({ tu: '2026-05' }, '2026-04')).toBeNull();
    expect(giaoThang({ tu: '2026-05', den: '2026-10' }, '2026-07')).toEqual({ tu: '2026-07', den: '2026-07' });
  });
  it('tham số URL: chỉ gửi mục có giá trị; công tắc chỉ gửi khi hiện', () => {
    const q = thamSoTieuHao({ tu: '2026-08', nhom: ['115', '110'], ct: [], mvt: 'z14', an806: false, an401: true, chuaGhep: true }, { theo: 'nhom' });
    expect(q.toString()).toBe('tu=2026-08&nhom=115%2C110&mvt=z14&an806=0&chuaGhep=1&theo=nhom');
    expect(thamSoTieuHao({ anBtp: false }).toString()).toBe('anBtp=0');
  });
  it('HEX ghép "H1, H2" gửi nguyên 1 tham số (không nối dấu phẩy)', () => {
    const q = thamSoTieuHao({ hex: ['H1, H2', 'H3'], xuong: ['Xưởng 1'] });
    expect(q.getAll('hex')).toEqual(['H1, H2', 'H3']);
    expect(q.getAll('xuong')).toEqual(['Xưởng 1']);
  });
  it('ghi chú tháng chưa có 262', () => {
    expect(ghiChu262('2026-11', ['2026-10', '2026-11'])).toMatch(/^T10\/26: /);
    expect(ghiChu262('2026-09', ['2026-10', '2026-11'])).toBe('');
    expect(ghiChu262(null, ['2026-08', '2026-10'])).toMatch(/^T8\/26–T10\/26: /);
    expect(ghiChu262(null, [])).toBe('');
  });
});

describe('chứng từ', () => {
  const d: DongChungTu = {
    nam: 2026, soCt: '4900000001', dong: 2, ngay: '2026-09-05', thang: '2026-09', mvt: '262', ma: '100000000440', tenVatTu: 'Keo A',
    nhom: '115', dvt: 'KG', sl: -2, giaTri: -0.5, orderSx: '1000012345', salesOrder: null, wbs: null, hex: 'H001', maCt: 'CT26-055',
    phanLoai: 'LOOSE', xuong: 'Xưởng 1', plant: '1000', sloc: '1010', nguoi: 'u1', nguonNhom: 'ban_vt_master', nguonFile: 'T09.2026.xlsx',
  };
  it('không có quyền giá => bỏ cột giá trị', () => {
    expect(cotChungTuHien(false).some(c => c.khoa === 'giaTri')).toBe(false);
    expect(cotChungTuHien(true)).toHaveLength(COT_CHUNG_TU.length);
  });
  it('chữ ô: ngày dd/mm/yyyy, loại xuất có nhãn, SL âm giữ dấu', () => {
    const cot = (k: keyof DongChungTu) => COT_CHUNG_TU.find(c => c.khoa === k)!;
    expect(chuOChungTu(cot('ngay'), d)).toBe('05/09/2026');
    expect(chuOChungTu(cot('mvt'), d)).toBe('262 Hoàn trả');
    expect(chuOChungTu(cot('sl'), d)).toBe('-2');
    expect(chuOChungTu(cot('salesOrder'), d)).toBe('');
  });
  it('Excel: số giữ kiểu số, ô trống null', () => {
    const aoa = bangExcelChungTu([d], true);
    const iSl = aoa[0].indexOf('SL xuất'), iGt = aoa[0].indexOf('Giá trị (triệu)'), iSo = aoa[0].indexOf('Sales order');
    expect(aoa[1][iSl]).toBe(-2);
    expect(aoa[1][iGt]).toBe(-0.5);
    expect(aoa[1][iSo]).toBeNull();
    expect(bangExcelChungTu([d], false)[0]).not.toContain('Giá trị (triệu)');
  });
});
