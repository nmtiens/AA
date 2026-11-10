// Dòng TỔNG của bảng dữ liệu thô: đơn HỦY = 0 trong tổng tiền, hiện riêng. Tồn kho vẫn gồm HỦY.
import type { DataRow } from '../types';
import { laHuy } from './productionMetrics';

/** Cột tiền bỏ HỦY khỏi tổng. Cột tồn kho giữ nguyên */
export const laCotTienBoHuy = (key: string, label = ''): boolean => {
  const s = `${key} ${label}`.toLowerCase();
  return !/ton_kho|tồn kho/.test(s) && /tri_gia|gia_tri|thanh_tien|trị giá|giá trị|thành tiền/.test(s);
};

/** Tách dòng HỦY của 1 cột; bảng không có cột IPO hoặc cột không phải tiền thì không tách */
export const tachHuy = (rows: DataRow[], ipoKey: string, key: string, label = '') => {
  if (!ipoKey || !laCotTienBoHuy(key, label)) return { tinh: rows, huy: [] as DataRow[] };
  const tinh: DataRow[] = [], huy: DataRow[] = [];
  for (const r of rows) (laHuy(r[ipoKey]) ? huy : tinh).push(r);
  return { tinh, huy };
};
