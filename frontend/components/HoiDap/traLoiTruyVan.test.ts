import { describe, expect, it } from 'vitest';
import { chonQuaHan } from './traLoiTruyVan';
import type { TruyVan } from './truyVanApi';

const tv = (bang: string, loc: TruyVan['loc']) => ({ bang, kieu: 'tong', do: [], nhom: [], loc } as unknown as TruyVan);

describe('chonQuaHan', () => {
  it('trễ theo ngày cần giao thì cho chọn hạn KH nhập kho, giữ các điều kiện khác', () => {
    const kq = chonQuaHan(tv('production_status_app', [
      { cot: 'ngay_can_giao', op: 'nho_hon', gt: '2026-11-07' },
      { cot: 'gia_tri_con_lai', op: 'lon_hon', gt: 0 },
      { cot: 'xuong_chinh', op: 'bang', gt: ['4A'] },
    ]));
    expect(kq?.[0].tv?.loc).toEqual([
      { cot: 'xuong_chinh', op: 'bang', gt: ['4A'] },
      { cot: 'nhom_bot', op: 'bang', gt: ['1. Quá hạn KH'] },
    ]);
  });

  it('câu khác không có lựa chọn', () => {
    expect(chonQuaHan(tv('production_status_app', [{ cot: 'nhom_bot', op: 'bang', gt: ['1. Quá hạn KH'] }]))).toBeNull();
    expect(chonQuaHan(tv('vat_tu', [{ cot: 'ngay_can_giao', op: 'nho_hon', gt: '2026-11-07' }]))).toBeNull();
  });
});
