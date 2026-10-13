// ============================================================================
// CỔNG CHO MÁY CHỦ: những gì backend cần để tính sẵn màn đầu "Tổng quan" bằng ĐÚNG code của trình duyệt.
// Backend import qua bí danh '@tong-quan/core' (esbuild --alias trong backend/package.json; kiểu khai báo ở
// backend/src/types/tong-quan-core.d.ts). Chỉ được kéo theo file thuần — không React, không window / localStorage.
// ============================================================================
import type { DataRow, ColumnDefinition } from '../../../types';

export {
  tinhTongQuanSanXuat, DEFAULT_FILTERS, TUY_CHON_MAC_DINH,
  type DashboardFiltersState, type TuyChonTongQuan, type TongQuanSanXuat,
} from './tongQuanSanXuat';
export { canonicalizeProjectNames, setServerProjectAliases } from '../../../utils/productionMetrics';
export { canonicalizeWorkshops, applyWorkshopMapping } from '../../../utils/workshopGroupsCore';

/** Cột như trình duyệt dựng từ dữ liệu tải về (khoá = tên trường; lõi chỉ tìm cột theo khoá) */
export const cotTuDuLieu = (rows: DataRow[]): ColumnDefinition[] => {
  const keys = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) if (k && k.trim() !== '') keys.add(k);
  return [...keys].map(key => ({ key, label: key }) as ColumnDefinition);
};
