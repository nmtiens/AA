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
  it('dựng bản ghi: bỏ dòng không tên công trình, HỦY = 0 trong tổng và số hủy riêng, quá hạn theo KH tuần', () => {
    const r = taoBanGhi(ROWS, COLS, HOM_NAY);
    expect(r).toHaveLength(2);
    // Đã nhập 40 = xuất lũy kế 25 + tồn 10 + chênh 5
    expect(r[0]).toMatchObject({ total: 100, totalHuy: 0, done: 40, stock: 10, exported: 25, unmatched: 5, xuatVuot: 0, open: true, overdue: true, month: '2026-10', ma: 'CT25-001' });
    // HỦY: tổng, đã nhập, đã xuất = 0; số hủy riêng; tồn vẫn gồm hàng hủy (nhập 40 − xuất ghi nhận 25 = 15 ≥ 10)
    expect(r[1]).toMatchObject({ status: 'HỦY', total: 0, totalHuy: 100, done: 0, stock: 10, exported: 0, unmatched: 0, xuatVuot: 0, bucket: 'cancelled', month: NO_MONTH, pc: NO_DATA });
  });
  it('tồn kho lấy mọi tình trạng: đơn HỦY còn hàng trong kho tính tồn, không tính nhập, xuất', () => {
    const r = taoBanGhi([dong({ tinh_trang_ipo: '05. HỦY', thanh_tien_xuat_kho_luy_ke: 15, thanh_tien_ton_kho_hien_tai: 30 })], COLS, HOM_NAY);
    // nhập 40 − xuất ghi nhận 15 = 25 => tồn 30 chặn còn 25
    expect(r[0]).toMatchObject({ status: 'HỦY', total: 0, done: 0, stock: 25, exported: 0, unmatched: 0, open: false, bucket: 'cancelled' });
  });
  it('xuất kho lũy kế giữ đúng số file kể cả khi vượt đã nhập; phần vượt tách riêng, chênh không âm', () => {
    const r = taoBanGhi([dong({ thanh_tien_xuat_kho_luy_ke: 38 }), dong({ thanh_tien_xuat_kho_luy_ke: 45 })], COLS, HOM_NAY);
    expect(r[0]).toMatchObject({ done: 40, exported: 38, stock: 2, stockCut: 8, unmatched: 0, xuatVuot: 0 });
    expect(r[1]).toMatchObject({ done: 40, exported: 45, stock: 0, stockCut: 10, unmatched: 0, xuatVuot: 5 });
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
