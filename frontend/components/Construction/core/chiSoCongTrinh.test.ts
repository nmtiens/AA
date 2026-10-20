import { describe, it, expect } from 'vitest';
import { nhomBot, tinhChiSo, NHOM_BOT } from './chiSoCongTrinh';
import type { Rec } from './banGhiCongTrinh';

const TODAY = new Date(2026, 9, 17).getTime();
const ngay = (d: number) => new Date(TODAY + d * 86_400_000);

const rec = (p: Partial<Rec>): Rec => ({
  ct: 'CT A', pm: 'PM', pc: 'PC', kv: 'KV', kh: 'KH', pl: 'PL', nct: '', tda: '', ma: 'A', deadline: null, planMet: false,
  open: true, overdue: false, botDuAn: null, ctKey: 'ct a', month: 'none', status: 'CÓ PHIẾU SX',
  total: 100, done: 0, exported: 0, exportedRecorded: 0, stock: 0, unmatched: 0, stockCut: 0, qtyDone: false,
  row: {}, ipo: '', mk: 'ct a', bucket: 'onLine', ...p,
});

describe('nhomBot', () => {
  it('không còn theo dõi => null', () => {
    expect(nhomBot(rec({ open: false }), TODAY)).toBeNull();
  });
  it('đạt KH kỳ đứng trước "chưa có KH" (cả hai đều không có deadline)', () => {
    expect(nhomBot(rec({ planMet: true }), TODAY)).toBe('datKy');
    expect(nhomBot(rec({}), TODAY)).toBe('chuaCoKh');
  });
  it('chia theo số ngày còn lại', () => {
    expect(nhomBot(rec({ deadline: ngay(-1), overdue: true }), TODAY)).toBe('quaHan');
    expect(nhomBot(rec({ deadline: ngay(0) }), TODAY)).toBe('den14');
    expect(nhomBot(rec({ deadline: ngay(14) }), TODAY)).toBe('den14');
    expect(nhomBot(rec({ deadline: ngay(15) }), TODAY)).toBe('den30');
    expect(nhomBot(rec({ deadline: ngay(30) }), TODAY)).toBe('den30');
    expect(nhomBot(rec({ deadline: ngay(31) }), TODAY)).toBe('sau30');
  });
});

describe('tinhChiSo', () => {
  const rows = [
    rec({ deadline: ngay(-3), overdue: true }),
    rec({ deadline: ngay(5) }),
    rec({ deadline: ngay(20) }),
    rec({ deadline: ngay(60) }),
    rec({ planMet: true }),
    rec({}),
    rec({ open: false, done: 100 }),
    rec({ open: false, status: 'HỦY' as Rec['status'], bucket: 'cancelled' }),
  ];
  const cs = tinhChiSo(rows, TODAY);

  it('6 nhóm thời hạn cộng đúng số hạng mục còn theo dõi', () => {
    const tong = NHOM_BOT.reduce((s, g) => s + cs.bot[g.key].n, 0);
    expect(tong).toBe(cs.openItems);
    expect(cs.openItems).toBe(6);
    expect(cs.bot.quaHan.n).toBe(1);
    expect(cs.bot.chuaCoKh.n).toBe(1);
    expect(cs.bot.datKy.n).toBe(1);
  });
  it('đã nhập + chưa nhập = tổng; phần chưa nhập theo công đoạn cộng đúng', () => {
    expect(cs.done + cs.remain).toBe(cs.total);
    const theoCd = Object.values(cs.remainBy).reduce((s, v) => s + v, 0);
    expect(theoCd).toBe(cs.remain);
  });
  it('đếm đã nhập đủ / chưa nhập đủ / hủy tách bạch', () => {
    expect(cs.stocked).toBe(1);
    expect(cs.cancelled).toBe(1);
    expect(cs.notStocked).toBe(6);
  });
});
