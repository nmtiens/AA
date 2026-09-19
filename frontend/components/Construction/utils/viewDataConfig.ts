// src/components/Construction/utils/viewDataConfig.ts
//
// Lưu mapping "view -> danh sách công trình" tập trung ở backend (bảng
// view_project_mapping) thay vì localStorage, để admin setup 1 lần thì MỌI
// người truy cập web ở bất kỳ đâu đều thấy cùng 1 cấu hình. Do gọi API là
// bất đồng bộ, dùng 1 cache trong bộ nhớ (module-level) + cơ chế preload để
// các component vẫn đọc được đồng bộ (getProjectsForView) ở chỗ cần.

import { DataRow } from '../../../types';
import { fetchViewProjectMapping, saveViewProjectMapping as apiSaveViewProjectMapping } from '../../../services/dataService';

export interface ViewDefinition {
  id: string;
  label: string;
}

export const CONFIGURABLE_VIEWS: ViewDefinition[] = [
  { id: 'luong-do', label: 'Công trình luồng đỏ' },
  { id: 'can-mau', label: 'Căn mẫu' },
];

type ViewMapping = Record<string, string[]>;

// Cache trong bộ nhớ (module-level) — nạp khi app khởi động (App.tsx) và khi
// admin lưu setup mới. Các component đọc đồng bộ từ cache này.
let cachedMapping: ViewMapping = {};
let hasLoadedOnce = false;
let inFlightLoad: Promise<ViewMapping> | null = null;

/** Nạp mapping mới nhất từ backend, cập nhật cache. Có thể gọi nhiều lần từ
 * nhiều nơi (App.tsx prefetch + wrapper gate) — dùng chung 1 request nhờ
 * inFlightLoad, không gọi API trùng lặp. */
export async function loadViewMapping(): Promise<ViewMapping> {
  if (inFlightLoad) return inFlightLoad;
  inFlightLoad = fetchViewProjectMapping()
    .then((data) => {
      cachedMapping = data || {};
      hasLoadedOnce = true;
      return cachedMapping;
    })
    .finally(() => { inFlightLoad = null; });
  return inFlightLoad;
}

/** Lưu danh sách công trình cho 1 view (gọi API — chỉ ADMIN thành công),
 * đồng thời cập nhật cache cục bộ ngay để UI phản ánh tức thì. */
export async function setProjectsForView(viewId: string, projects: string[]): Promise<boolean> {
  const ok = await apiSaveViewProjectMapping(viewId, projects);
  if (ok) {
    cachedMapping = { ...cachedMapping, [viewId]: projects };
  }
  return ok;
}

/** Đọc đồng bộ từ cache — dùng ở những nơi cần giá trị ngay lập tức (component
 * render). Trước khi cache có dữ liệu thật (hasLoadedOnce = false), trả về
 * mảng rỗng — các wrapper trong App.tsx đảm bảo không render trang phụ thuộc
 * vào hàm này cho tới khi loadViewMapping() xong (xem isViewMappingLoaded). */
export function getProjectsForView(viewId: string): string[] {
  return cachedMapping[viewId] || [];
}

/** Cho component/wrapper biết cache đã có dữ liệu thật hay chưa — dùng để
 * quyết định có cần chờ (hiện loader) trước khi render hay không. */
export function isViewMappingLoaded(): boolean {
  return hasLoadedOnce;
}

export function isProjectInView(congTrinh: string, viewId: string): boolean {
  return getProjectsForView(viewId).includes(congTrinh);
}

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

export function collectUniqueProjects(
  sources: { data: DataRow[]; key: string }[]
): string[] {
  const set = new Set<string>();
  sources.forEach(({ data, key }) => {
    if (!key) return;
    data.forEach((row) => {
      const val = String(row[key] || '').trim();
      if (val) set.add(val);
    });
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
} 