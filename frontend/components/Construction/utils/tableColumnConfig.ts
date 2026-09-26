// src/utils/tableColumnConfig.ts
//
// Cấu hình cột cho từng bảng dữ liệu (Sản xuất, Đơn hàng, Nhập kho...).
// Lưu tập trung ở backend (cùng cơ chế với view_project_mapping) để admin
// setup 1 lần, mọi người dùng đều thấy cùng 1 cấu hình.

import { ColumnDefinition } from '../../../types';
import {
  fetchTableColumnConfig,
  saveTableColumnConfig as apiSaveTableColumnConfig,
} from '../../../services/dataService';

export interface TableColumnConfig {
  allowedColumns: string[];        // thứ tự = thứ tự hiển thị cột trong bảng
  defaultVisibleColumns: string[]; // subset của allowedColumns, hiện mặc định
}

export interface TableDefinition {
  id: string;    // khớp key trong MainLayoutContext (productionColumns -> 'production', ...)
  label: string;
}

// Danh sách bảng cho phép setup — khớp với các trang trong nhóm "Dữ liệu"
export const CONFIGURABLE_TABLES: TableDefinition[] = [
  { id: 'production', label: 'Dữ liệu Sản xuất' },
  { id: 'order', label: 'Dữ liệu Đơn hàng tổng' },
  { id: 'inventory', label: 'Dữ liệu Nhập kho' },
  { id: 'export', label: 'Dữ liệu Xuất kho' },
  { id: 'stock', label: 'Dữ liệu Tồn kho' },
  { id: 'attendance', label: 'Dữ liệu Điểm danh' },
  { id: 'khsx', label: 'Kế hoạch SX' },
  { id: 'analysis', label: 'Phân tích KH-TH' },
  { id: 'tkbv', label: 'Dữ liệu TKBV' },
  { id: 'pthsp', label: 'Dữ liệu PTHSP' },
  { id: 'material', label: 'Vật tư' },
  { id: 'yearlyPlan', label: 'Dữ liệu kế hoạch năm' },
];

type TableColumnMapping = Record<string, TableColumnConfig>;

const EMPTY_CONFIG: TableColumnConfig = { allowedColumns: [], defaultVisibleColumns: [] };

let cachedMapping: TableColumnMapping = {};
let hasLoadedOnce = false;
let inFlightLoad: Promise<TableColumnMapping> | null = null;

/** Nạp cấu hình mới nhất từ backend. Nhiều nơi có thể gọi cùng lúc — dùng
 * chung 1 request nhờ inFlightLoad, không gọi API trùng lặp. */
export async function loadTableColumnConfig(): Promise<TableColumnMapping> {
  if (inFlightLoad) return inFlightLoad;
  inFlightLoad = fetchTableColumnConfig()
    .then((data) => {
      cachedMapping = data || {};
      hasLoadedOnce = true;
      return cachedMapping;
    })
    .finally(() => { inFlightLoad = null; });
  return inFlightLoad;
}

export function isTableColumnConfigLoaded(): boolean {
  return hasLoadedOnce;
}

export function getColumnConfigForTable(tableId: string): TableColumnConfig {
  return cachedMapping[tableId] || EMPTY_CONFIG;
}

/** Lưu cấu hình cho 1 bảng (chỉ ADMIN thành công), cập nhật cache ngay để UI
 * phản ánh tức thì. */
export async function setColumnConfigForTable(
  tableId: string,
  config: TableColumnConfig
): Promise<boolean> {
  const ok = await apiSaveTableColumnConfig(tableId, config);
  if (ok) {
    cachedMapping = { ...cachedMapping, [tableId]: config };
  }
  return ok;
}

/**
 * Áp cấu hình lên danh sách cột gốc (lấy từ dữ liệu thực tế đang có) để
 * truyền cho DataGrid: lọc + sắp xếp theo allowedColumns (giữ nguyên toàn bộ
 * nếu chưa setup), và tính danh sách cột mặc định hiển thị.
 */
export function isTableConfiguredExplicitly(tableId: string): boolean {
  return Object.prototype.hasOwnProperty.call(cachedMapping, tableId);
}

export function applyTableColumnConfig(
  originalColumns: ColumnDefinition[],
  tableId: string,
  fallbackDefaultVisible?: string[]
): { columns: ColumnDefinition[]; defaultVisibleColumns?: string[] } {
  const hasConfig = isTableConfiguredExplicitly(tableId);
  const config = getColumnConfigForTable(tableId);
  const byKey = new Map(originalColumns.map((c) => [c.key, c]));

  const columns = hasConfig
    ? config.allowedColumns
        .map((key) => byKey.get(key))
        .filter((c): c is ColumnDefinition => !!c)
    : originalColumns;

  const defaultVisibleColumns = hasConfig
    ? (config.defaultVisibleColumns.length > 0 ? config.defaultVisibleColumns : undefined)
    : fallbackDefaultVisible;

  return { columns, defaultVisibleColumns };
}

// Thêm cuối file src/components/Construction/utils/tableColumnConfig.ts

export interface ModalColumnDef {
  key: string;
  label: string;
}

/** Trả về danh sách cột PHỤ (không gồm STT/Mã Hex) sẽ hiển thị cho 1 modal,
 * theo đúng thứ tự đã setup. Nếu modal này chưa từng setup -> hiện tất cả. */
export function resolveVisibleModalColumns(
  modalId: string,
  allColumns: ModalColumnDef[]
): ModalColumnDef[] {
  if (!isTableConfiguredExplicitly(modalId)) return allColumns;
  const { allowedColumns } = getColumnConfigForTable(modalId);
  const byKey = new Map(allColumns.map((c) => [c.key, c]));
  return allowedColumns
    .map((k) => byKey.get(k))
    .filter((c): c is ModalColumnDef => !!c);
}