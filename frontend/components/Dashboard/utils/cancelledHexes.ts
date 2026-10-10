import { DataRow, ColumnDefinition } from '../../../types';
import { isCancelledIpo } from '../../../utils/productionMetrics';
import { findColumnKey } from './columnKeyResolver';

/**
 * HEX thuộc đơn HỦY (theo cột Tình trạng IPO của dữ liệu sản xuất) — tính 1 lần ở Dashboard, dùng chung cho
 * bộ lọc nhập kho (useUnifiedTimeFilters) và file xuất (useExportFlows).
 * `hexes` không chứa mã rỗng; `hasBlankHex` = có dòng HỦY mà ô HEX trống (bộ lọc nhập kho trước đây đưa ''
 * vào tập nên bỏ cả các dòng nhập kho trống HEX — giữ nguyên hành vi đó, file xuất thì không).
 */
export interface CancelledHexInfo {
  hexes: Set<string>;
  hasBlankHex: boolean;
}

export function collectCancelledHexes(productionData: DataRow[] | undefined, productionColumns: ColumnDefinition[] | undefined): CancelledHexInfo {
  const hexes = new Set<string>();
  let hasBlankHex = false;
  if (!productionData?.length) return { hexes, hasBlankHex };
  const hexKey = (productionColumns && findColumnKey(productionColumns, 'hex')) || 'hex';
  const ipoKey = (productionColumns && findColumnKey(productionColumns, 'tinh_trang_ipo')) || 'tinh_trang_ipo';
  for (const r of productionData) {
    if (!isCancelledIpo(r[ipoKey])) continue;
    const h = String(r[hexKey] ?? '').trim();
    if (h) hexes.add(h);
    else hasBlankHex = true;
  }
  return { hexes, hasBlankHex };
}
