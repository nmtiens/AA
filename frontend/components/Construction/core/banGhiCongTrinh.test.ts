import { describe, it, expect } from 'vitest';
import type { DataRow, ColumnDefinition } from '../../../types';
import { taoBanGhi, nenBanGhi, giaiNenBanGhi, NO_MONTH, NO_DATA } from './banGhiCongTrinh';
import { setPlanMet } from '../../../utils/productionMetrics';

const dong = (p: Partial<Record<string, unknown>>): DataRow => ({
  hex: '250301895', ten_cong_trinh: 'CT A', ma_cong_trinh: 'ct25-001', ten_pm: 'PM 1', ten_pc: 'PC 1',
  khu_vuc_du_an: 'Miền Nam', khach_hang: 'KH1', phan_loai_nhom_san_pham: '01. BÀN', tinh_trang: '05. ĐANG SX',
  tinh_trang_ipo: '01. ĐANG SẢN XUẤT', tri_gia_don_hang_tong: 100, thanh_tien_nhap_kho_luy_ke: 40,
  thanh_tien_ton_kho_hien_tai: 10, thanh_tien_xuat_kho_luy_ke: 25, bop: 'P013', ngay_khnk_tuan: '2026-10-05', bot_du_an: '2026-12-31',
  ...p,
} as DataRow);
const ROWS = [
  dong({}),
  dong({ hex: '250301896', tinh_trang_ipo: '04. HỦY', ten_pc: '', ngay_khnk_tuan: '' }),
  dong({ hex: '250301897', ten_cong_trinh: '' }), // không tên công trình: bỏ
];
const COLS = Object.keys(ROWS[0]).map(key => ({ key, label: key })) as ColumnDefinition[];
const HOM_NAY = new Date(2026, 9, 13).getTime();

describe('bản ghi Tổng quan công trình (máy chủ dựng sẵn)', () => {
  it('dựng bản ghi: bỏ dòng không tên công trình, HỦY = 0 đã nhập, quá hạn theo KH tuần', () => {
    const r = taoBanGhi(ROWS, COLS, HOM_NAY);
    expect(r).toHaveLength(2);
    // Đã nhập 40 = xuất lũy kế 25 + tồn 10 + 5 không thấy xuất / tồn
    expect(r[0]).toMatchObject({ done: 40, stock: 10, exported: 25, unmatched: 5, open: true, overdue: true, month: '2026-10', ma: 'CT25-001' });
    expect(r[1]).toMatchObject({ status: 'HỦY', done: 0, bucket: 'cancelled', month: NO_MONTH, pc: NO_DATA });
  });
  it('xuất kho lũy kế giữ đúng số file kể cả khi vượt đã nhập; phần vượt trừ vào "chưa thấy xuất / tồn"', () => {
    const r = taoBanGhi([dong({ thanh_tien_xuat_kho_luy_ke: 38 }), dong({ thanh_tien_xuat_kho_luy_ke: 45 })], COLS, HOM_NAY);
    expect(r[0]).toMatchObject({ done: 40, exported: 38, stock: 2, stockCut: 8, unmatched: 0 });
    expect(r[1]).toMatchObject({ done: 40, exported: 45, stock: 0, stockCut: 10, unmatched: -5 });
  });
  it('KH tuần của kỳ đã đạt (không có KH tháng): không còn hạn, planMet = true — không phải "chưa có KH"', () => {
    setPlanMet({ tuan: ['250301895'], thang: [] });
    try {
      const r = taoBanGhi([dong({})], COLS, HOM_NAY);
      expect(r[0]).toMatchObject({ deadline: null, planMet: true, overdue: false, month: NO_MONTH, open: true });
    } finally { setPlanMet({ tuan: [], thang: [] }); }
  });
  it('nén rồi giải nén qua JSON giữ nguyên mọi trường (dòng gốc còn hex)', () => {
    const goc = taoBanGhi(ROWS, COLS, HOM_NAY);
    const lai = giaiNenBanGhi(JSON.parse(JSON.stringify(nenBanGhi(goc))), HOM_NAY);
    const bo = (r: (typeof goc)[number]) => ({ ...r, row: undefined, deadline: r.deadline?.getTime() ?? null, botDuAn: r.botDuAn?.getTime() ?? null });
    expect(lai.map(bo)).toEqual(goc.map(bo));
    expect(lai[0].row.hex).toBe('250301895');
  });
});
