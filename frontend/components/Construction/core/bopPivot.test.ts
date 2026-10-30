import { describe, it, expect } from 'vitest';
import {
  khoCua, laKho, khoMuc, mucCongDoan, fmtGiaTriBop, tinhPivotBop, tinhBangCongTrinhBop, mucBopTuDong, type MucBop,
} from './bopPivot';

type M = MucBop & { ct: string; nsp: string };
const muc = (p: Partial<M>): M => ({
  ct: 'CT A', nsp: 'TỦ', stage: 'P012', bucket: 'onLine', open: true, total: 100, inv: 0, xuat: 0, tonKho: 0, remain: 100, ...p,
});

describe('khoCua / laKho', () => {
  it('xuất chặn ≤ nhập, tồn chặn ≤ nhập − xuất, chênh = phần còn lại', () => {
    expect(khoCua(muc({ inv: 50, xuat: 80, tonKho: 10 }))).toEqual({ nk: 50, xk: 50, ton: 0, chenh: 0 });
    expect(khoCua(muc({ inv: 50, xuat: 20, tonKho: 10 }))).toEqual({ nk: 50, xk: 20, ton: 10, chenh: 20 });
    // Không có cột tồn kho => tồn = nhập − xuất
    expect(khoCua(muc({ inv: 50, xuat: 20, tonKho: undefined }))).toEqual({ nk: 50, xk: 20, ton: 30, chenh: 0 });
  });
  it('đếm: mỗi hạng mục có nhập rơi vào đúng 1 cột Đã xuất / Tồn kho / Chênh', () => {
    const conTon = muc({ inv: 50, xuat: 20, tonKho: 10 });
    const xuatDu = muc({ inv: 50, xuat: 50, tonKho: 0 });
    const chenh = muc({ inv: 50, xuat: 20, tonKho: 0 });
    expect(khoMuc(conTon, 'count')).toEqual({ nk: 1, xk: 0, ton: 1, chenh: 0 });
    expect(khoMuc(xuatDu, 'count')).toEqual({ nk: 1, xk: 1, ton: 0, chenh: 0 });
    expect(khoMuc(chenh, 'count')).toEqual({ nk: 1, xk: 0, ton: 0, chenh: 1 });
    // Giá trị: có số > 0 là thuộc cột
    expect(laKho(conTon, 'xk', 'remain')).toBe(true);
    expect(laKho(muc({ inv: 0 }), 'nk', 'count')).toBe(false);
  });
});

describe('mucCongDoan / fmtGiaTriBop', () => {
  it('đếm = còn theo dõi; giá trị = còn theo dõi hoặc còn tiền chưa nhập', () => {
    const a = muc({ open: true }), b = muc({ open: false, remain: 3 }), c = muc({ open: false, remain: 0 });
    expect(mucCongDoan([a, b, c], 'count')).toEqual([a]);
    expect(mucCongDoan([a, b, c], 'remain')).toEqual([a, b]);
  });
  it('dưới 5 triệu ghi <0.01, 0 ghi -', () => {
    expect(fmtGiaTriBop(3, 'remain')).toBe('<0.01');
    expect(fmtGiaTriBop(0, 'remain')).toBe('-');
    expect(fmtGiaTriBop(1500, 'remain')).toBe('1.50');
    expect(fmtGiaTriBop(1234, 'count')).toBe('1,234');
  });
});

describe('tinhPivotBop', () => {
  const items = [
    muc({ stage: 'P001', bucket: 'notDeployed', remain: 100 }),
    muc({ stage: 'P012', remain: 40, inv: 60 }),
    muc({ stage: 'P022', bucket: 'shortfall', remain: 5, inv: 95, open: false }),
    muc({ stage: 'XYZ', bucket: 'shortfall', remain: 10 }),
    muc({ nsp: 'BÀN', stage: 'P025', bucket: null, open: false, remain: 0, inv: 100, xuat: 100 }),
  ];
  it('đủ cột cố định P001 → P021, P022 chỉ khi còn hạng mục, công đoạn lạ cuối', () => {
    const p = tinhPivotBop(items, items, 'remain', i => [i.nsp]);
    expect(p.stages).toEqual(['P001', 'P002', 'P012', 'P013', 'GCVT', 'P014', 'P016', 'P018', 'P020', 'P021', 'P022', 'XYZ']);
    expect(p.groups.map(g => [g.bucket, g.stages.length])).toEqual([['notDeployed', 1], ['p002', 1], ['onLine', 8], ['shortfall', 2]]);
    expect(p.dong.get('TỦ')).toEqual({ cells: { P001: 100, P012: 40, P022: 5, XYZ: 10 }, total: 155, n: 4 });
    expect(p.grand).toBe(155);
    // Dòng chỉ có hàng đã xong vẫn hiện (cột công đoạn trống), có số kho
    expect(p.dong.get('BÀN')).toEqual({ cells: {}, total: 0, n: 0 });
    expect(p.kho.get('BÀN')).toEqual({ nk: 100, xk: 100, ton: 0, chenh: 0 });
    expect(p.khoTot.nk).toBe(255);
  });
  it('đếm: bỏ hạng mục không còn theo dõi', () => {
    const p = tinhPivotBop(items, items, 'count', i => [i.nsp]);
    expect(p.dong.get('TỦ')?.total).toBe(3);
    expect(p.colN.P022).toBeUndefined();
    expect(p.khoTot).toEqual({ nk: 3, xk: 1, ton: 0, chenh: 2 });
  });
  it('nhóm theo mã công đoạn: không lấy nhóm của hạng mục gặp đầu tiên', () => {
    const lech = [muc({ stage: 'P012', bucket: 'notDeployed' })];
    // Mặc định (tab BOP): P012 nằm dưới nhóm của hạng mục gặp đầu tiên
    expect(tinhPivotBop(lech, lech, 'count', () => ['x']).groups[2]).toEqual({ bucket: 'notDeployed', stages: ['P012'] });
    const g = tinhPivotBop(lech, lech, 'count', () => ['x'], true).groups;
    expect(g.find(x => x.bucket === 'onLine')?.stages[0]).toBe('P012');
  });
  it('1 hạng mục góp vào nhiều khoá dòng', () => {
    const p = tinhPivotBop(items, items, 'count', i => [i.nsp, `${i.nsp}/X`]);
    expect(p.dong.get('TỦ/X')).toEqual(p.dong.get('TỦ'));
  });
});

describe('tinhBangCongTrinhBop', () => {
  it('mỗi dòng 1 công trình, TỔNG giảm dần, "Chưa xác định" cuối', () => {
    const items = [
      muc({ ct: 'Chưa xác định', remain: 900 }),
      muc({ ct: 'CT A', remain: 10 }),
      muc({ ct: 'CT B', remain: 50 }),
      muc({ ct: 'CT B', stage: 'P002', bucket: 'p002', remain: 20, inv: 30, tonKho: 30 }),
    ];
    const b = tinhBangCongTrinhBop(items, 'remain', 'Chưa xác định');
    expect(b.rows.map(r => r.name)).toEqual(['CT B', 'CT A', 'Chưa xác định']);
    expect(b.rows[0]).toEqual({ name: 'CT B', cells: { P012: 50, P002: 20 }, total: 70, kho: { nk: 30, xk: 0, ton: 30, chenh: 0 }, donHang: b.rows[0].donHang });
    // Tổng đơn hàng = trị giá mọi hạng mục của công trình; theo số = số hạng mục
    expect(b.donHangTot).toBe(b.rows.reduce((a, r) => a + r.donHang, 0));
    expect(tinhBangCongTrinhBop(items, 'count', 'Chưa xác định').rows.find(r => r.name === 'CT B')!.donHang).toBe(2);
    expect(b.grand).toBe(980);
    expect(b.metric).toBe('remain');
  });
});

describe('mucBopTuDong', () => {
  const k = { bopKey: 'bop', tinhTrangKey: 'tt', triGiaKey: 'tg', nhapKhoKey: 'nk', xuatKhoKey: 'xk', tonKhoKey: 'tk' };
  it('còn lại / đã nhập / nhóm / kho từ 1 dòng', () => {
    const m = mucBopTuDong({ bop: 'P013 - Lắp ráp', tt: '05. ĐANG SX', tg: '200', nk: '50', xk: '20', tk: '-5' }, k);
    expect(m).toEqual({ stage: 'P013', bucket: 'onLine', open: true, total: 200, inv: 50, xuat: 20, tonKho: 0, remain: 150 });
  });
  it('tình trạng 15. CHƯA TRIỂN KHAI => nhóm Chưa triển khai; nhập đủ => không nhóm', () => {
    expect(mucBopTuDong({ bop: 'P012', tt: '15. Chưa triển khai', tg: 10, nk: 0 }, k).bucket).toBe('notDeployed');
    const xong = mucBopTuDong({ bop: 'P022', tt: '', tg: 10, nk: 10 }, k);
    expect(xong.open).toBe(false);
    expect(xong.bucket).toBeNull();
  });
});
