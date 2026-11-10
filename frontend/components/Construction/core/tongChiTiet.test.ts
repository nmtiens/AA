import { describe, expect, it } from 'vitest';
import { docLichSuNhap, ghiChuKho, giaTriTieuDiem, khoSoLuong, tomTatChiTiet, tongHangMuc, tongLichSuNhap, tongQc } from './tongChiTiet';
import type { Rec } from './banGhiCongTrinh';

const rec = (o: Partial<Rec>): Rec => ({
  ct: 'A', ctKey: 'A', pm: 'PM', status: 'CÓ PHIẾU SX', total: 0, totalHuy: 0, done: 0, exported: 0, xuatVuot: 0, stock: 0, unmatched: 0, stockCut: 0, ...o,
} as Rec);

describe('lịch sử nhập kho', () => {
  it('đọc số kiểu EN, tổng khớp từng dòng', () => {
    const ds = docLichSuNhap('11/06/2026 # Đơn giá: 26.24 # SL NK: 20 # TT NK: 524.8 # đợt 1\n12/06/2026 # SL NK: 1,000 # TT NK: 334.644');
    expect(ds).toHaveLength(2);
    expect(ds[0]).toEqual({ date: '11/06/2026', sl: 20, tien: 524.8, note: 'đợt 1' });
    expect(ds[1].sl).toBe(1000);
    expect(tongLichSuNhap(ds).sl).toBe(1020);
    expect(tongLichSuNhap(ds).tien).toBeCloseTo(859.444);
  });
  it('dòng thiếu số tính 0, chữ rác không ra NaN', () => {
    expect(docLichSuNhap('11/06/2026 # SL NK: abc')[0]).toMatchObject({ sl: 0, tien: 0 });
    expect(docLichSuNhap(null)).toEqual([]);
  });
});

describe('tongQc', () => {
  it('cộng từng lần kiểm', () => {
    expect(tongQc([{ checked: 5, pass: 4, fail: 1 }, { checked: 2, pass: 2, fail: 0 }])).toEqual({ checked: 7, pass: 6, fail: 1 });
  });
});

describe('kho theo số lượng', () => {
  it('đã xuất giữ gốc, tách xuất vượt nhập', () => {
    const k = khoSoLuong(10, 12, 3);
    expect(k).toEqual({ nk: 10, xk: 12, ton: 0, chenh: 0, xv: 2 });
    expect(ghiChuKho(k, 'BỘ')).toBe('đã xuất 12 · xuất vượt nhập 2 BỘ');
  });
  it('chênh không âm, ô 0 không ghi', () => {
    const k = khoSoLuong(10, 4, 1);
    expect(k.chenh).toBe(5);
    expect(ghiChuKho(k)).toBe('đã xuất 4 · tồn kho 1 · chênh 5');
    expect(ghiChuKho(khoSoLuong(0, 0, 0))).toBe('');
  });
  it('nhập + xuất vượt = xuất + tồn + chênh', () => {
    const k = khoSoLuong('7', null, undefined);
    expect(k.nk + k.xv).toBe(k.xk + k.ton + k.chenh);
  });
});

describe('tongHangMuc', () => {
  it('tổng bằng số ô của bảng BOP (khoCua)', () => {
    const t = tongHangMuc([
      { total: 100, remain: 40, inv: 60, xuat: 70, tonKho: 0 },
      { total: 50, remain: 0, inv: 50, xuat: 10, tonKho: 30 },
    ]);
    expect(t).toEqual({ n: 2, total: 150, remain: 40, nk: 110, xk: 80, ton: 30, chenh: 10, xv: 10 });
    expect(t.nk + t.xv).toBe(t.xk + t.ton + t.chenh);
  });
});

describe('tomTatChiTiet', () => {
  const rows = [
    rec({ ct: 'A', ctKey: 'A', total: 100, done: 60, exported: 70, xuatVuot: 10, stock: 0 }),
    rec({ ct: 'A', ctKey: 'A', status: 'HỦY', totalHuy: 30, stock: 5 }),
    rec({ ct: 'B', ctKey: 'B', pm: 'PM2', total: 200, done: 200, stock: 150, exported: 30, unmatched: 20, stockCut: 7 }),
  ];
  it('HỦY = 0 trong tổng, hiện riêng, tồn vẫn gồm HỦY', () => {
    const t = tomTatChiTiet(rows, 'total');
    expect(t).toMatchObject({ cts: 2, rows: 3, items: 2, huyN: 1, totalHuy: 30, total: 300, done: 260, stock: 155, exported: 100, xuatVuot: 10, unmatched: 20, stockCut: 7 });
    expect(t.projects.find(p => p.name === 'A')).toMatchObject({ items: 1, huyN: 1, total: 100, stock: 5 });
  });
  it('tổng các dòng = tổng cửa sổ ở mọi chỉ số', () => {
    const t = tomTatChiTiet(rows, 'remain');
    for (const f of ['items', 'total', 'done', 'remain', 'exported', 'stock', 'unmatched', 'xuatVuot', 'stockCut'] as const) {
      expect(t.projects.reduce((s, p) => s + giaTriTieuDiem(p, f), 0)).toBe(giaTriTieuDiem(t, f));
    }
  });
  it('sắp theo chỉ số đang xem', () => {
    expect(tomTatChiTiet(rows, 'remain').projects[0].name).toBe('A');
    expect(tomTatChiTiet(rows, 'unmatched').projects[0].name).toBe('B');
  });
});
