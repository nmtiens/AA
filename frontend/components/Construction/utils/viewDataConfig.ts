// src/utils/viewDataConfig.ts
//
// Quản lý việc setup dữ liệu riêng cho từng "view" (Công trình luồng đỏ, Căn mẫu,
// hoặc các view khác thêm sau này). Mỗi view có 1 danh sách công trình được admin
// tick chọn ở trang Setup — view đó CHỈ hiển thị đúng dữ liệu của các công trình
// nằm trong danh sách này (giống 1 bộ lọc cố định gắn theo view).
//
// Một công trình có thể thuộc nhiều view khác nhau (không bắt buộc 1-1).
// Mapping được lưu lại và giữ nguyên cho tới khi admin vào Setup sửa lại.
//
// GHI CHÚ TÍCH HỢP:
// - Hiện lưu bằng localStorage để chạy được ngay không cần backend mới.
//   Khi có API thật, thay 2 hàm loadViewMapping / saveViewMapping bằng
//   fetch tới endpoint của bạn (gợi ý: GET/POST /api/view-data-config).

import { DataRow } from '../../../types';

export interface ViewDefinition {
  id: string;
  label: string;
}

// Đăng ký các view có thể setup dữ liệu riêng ở đây.
// Muốn thêm view mới (vd "Công trình VIP") chỉ cần thêm 1 dòng vào đây,
// không cần sửa gì thêm ở util này.
export const CONFIGURABLE_VIEWS: ViewDefinition[] = [
  { id: 'luong-do', label: 'Công trình luồng đỏ' },
  { id: 'can-mau', label: 'Căn mẫu' },
];

const STORAGE_KEY = 'view_project_mapping_v1';

// Cấu trúc lưu: { [viewId]: string[] danh sách công trình được chọn cho view đó }
type ViewMapping = Record<string, string[]>;

/** Đọc toàn bộ mapping view -> danh sách công trình đã setup */
export function loadViewMapping(): ViewMapping {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Lưu toàn bộ mapping (ghi đè) */
export function saveViewMapping(map: ViewMapping) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

/** Lấy danh sách công trình đã setup cho 1 view cụ thể */
export function getProjectsForView(viewId: string, map?: ViewMapping): string[] {
  const m = map || loadViewMapping();
  return m[viewId] || [];
}

/** Lưu danh sách công trình cho 1 view cụ thể (ghi đè riêng view đó, giữ nguyên các view khác) */
export function setProjectsForView(viewId: string, projects: string[]) {
  const current = loadViewMapping();
  saveViewMapping({ ...current, [viewId]: projects });
}

/** Kiểm tra 1 công trình có thuộc view hay không */
export function isProjectInView(congTrinh: string, viewId: string, map?: ViewMapping): boolean {
  const list = getProjectsForView(viewId, map);
  return list.includes(congTrinh);
}

/**
 * Lọc một mảng DataRow: CHỈ giữ lại các dòng có công trình nằm trong danh sách
 * đã setup cho view. Nếu view chưa setup gì (danh sách rỗng), trả về mảng rỗng
 * — đúng tinh thần "bộ lọc": chưa chọn gì thì chưa hiển thị gì.
 *
 * @param data         mảng dữ liệu gốc (production/material/order/...)
 * @param congTrinhKey tên cột chứa giá trị công trình trong DataRow
 * @param viewId       id của view cần lọc (vd 'luong-do')
 */
export function filterByView(
  data: DataRow[],
  congTrinhKey: string,
  viewId: string
): DataRow[] {
  if (!congTrinhKey) return [];
  const allowed = new Set(getProjectsForView(viewId));
  if (allowed.size === 0) return [];
  return data.filter((row) => allowed.has(String(row[congTrinhKey] || '')));
}

/**
 * Lấy danh sách công trình duy nhất (unique) từ nhiều nguồn dữ liệu khác nhau
 * (production, material, order, khsx, ...) — dùng để hiển thị lên trang Setup
 * cho admin tick chọn, tránh bị sót công trình chỉ xuất hiện ở 1 bảng.
 */
export function collectUniqueProjects(
  dataSources: DataRow[][],
  congTrinhKey: string
): string[] {
  if (!congTrinhKey) return [];
  const set = new Set<string>();
  dataSources.forEach((rows) => {
    rows.forEach((row) => {
      const val = String(row[congTrinhKey] || '').trim();
      if (val) set.add(val);
    });
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
}
