// src/components/Construction/utils/viewDataConfig.ts
//
// Lưu mapping "view -> danh sách công trình" tập trung ở backend (bảng
// view_project_mapping) thay vì localStorage, để admin setup 1 lần thì MỌI
// người truy cập web ở bất kỳ đâu đều thấy cùng 1 cấu hình. Do gọi API là
// bất đồng bộ, dùng 1 cache trong bộ nhớ (module-level) + cơ chế preload để
// các component vẫn đọc được đồng bộ (getProjectsForView) ở chỗ cần.

import { DataRow } from '../../../types';
import { fetchViewProjectMapping, saveViewProjectMapping as apiSaveViewProjectMapping } from '../../../services/dataService';
import { projectMatchKey } from '../../../utils/productionMetrics';
import { docThuTu, ghepThuTu, taoThuTuNhom, type ThuTuCongTrinh, type ThuTuTra } from '../core/thuTuNhom';

export interface ViewDefinition {
  id: string;
  label: string;
}

/** Nhóm công trình chọn ở trang Tổng quan công trình (danh sách công trình setup ở Công trình → Setup) */
export type ProjectGroupId = 'luong-do' | 'can-mau';

export const CONFIGURABLE_VIEWS: (ViewDefinition & { id: ProjectGroupId })[] = [
  { id: 'luong-do', label: 'Công trình luồng đỏ' },
  { id: 'can-mau', label: 'Căn mẫu' },
];

type ViewMapping = Record<string, string[]>;

// Cache trong bộ nhớ (module-level) — nạp khi app khởi động (App.tsx) và khi
// admin lưu setup mới. Các component đọc đồng bộ từ cache này.
let cachedMapping: ViewMapping = {};
// STT + luồng đỏ/vàng từng nhóm (dòng '<viewId>:thu-tu' của API)
let cachedThuTu: Record<string, ThuTuCongTrinh[]> = {};
const HAU_TO_THU_TU = ':thu-tu';
let hasLoadedOnce = false;
// Tăng mỗi lần cache đổi (nạp / lưu) — component dùng làm khoá useMemo để đọc lại thứ tự nhóm
let phienBan = 0;
export const phienBanViewMapping = () => phienBan;
let inFlightLoad: Promise<ViewMapping> | null = null;

/** Nạp mapping mới nhất từ backend, cập nhật cache. Có thể gọi nhiều lần từ
 * nhiều nơi (App.tsx prefetch + wrapper gate) — dùng chung 1 request nhờ
 * inFlightLoad, không gọi API trùng lặp. */
export async function loadViewMapping(): Promise<ViewMapping> {
  if (inFlightLoad) return inFlightLoad;
  inFlightLoad = fetchViewProjectMapping()
    .then((data) => {
      // Tách 2 loại khoá: nhóm -> string[]; '<nhóm>:thu-tu' -> {ten, stt, luong}[]
      const map: ViewMapping = {};
      const thuTu: Record<string, ThuTuCongTrinh[]> = {};
      for (const [k, v] of Object.entries(data || {})) {
        if (k.endsWith(HAU_TO_THU_TU)) thuTu[k.slice(0, -HAU_TO_THU_TU.length)] = docThuTu(v);
        else map[k] = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
      }
      cachedMapping = map;
      cachedThuTu = thuTu;
      hasLoadedOnce = true;
      phienBan++;
      return cachedMapping;
    })
    .finally(() => { inFlightLoad = null; });
  return inFlightLoad;
}

/** Lưu danh sách công trình cho 1 view (gọi API — chỉ ADMIN thành công),
 * đồng thời cập nhật cache cục bộ ngay để UI phản ánh tức thì. */
export async function setProjectsForView(viewId: string, projects: string[], thuTu?: ThuTuCongTrinh[]): Promise<boolean> {
  const ok = await apiSaveViewProjectMapping(viewId, projects, thuTu);
  if (ok) {
    cachedMapping = { ...cachedMapping, [viewId]: projects };
    if (thuTu) cachedThuTu = { ...cachedThuTu, [viewId]: thuTu };
    phienBan++;
  }
  return ok;
}

/** Dòng thứ tự ĐÃ LƯU của nhóm (nguyên bản, chưa ghép với danh sách) — màn Setup dùng để biết STT nào người dùng đã gõ. */
export function getThuTuDaLuu(viewId: string): ThuTuCongTrinh[] {
  return cachedThuTu[viewId] || [];
}

/** STT + luồng của từng công trình trong nhóm, đúng thứ tự danh sách (chưa lưu thì STT theo vị trí, luồng đỏ). */
export function getThuTuForView(viewId: string): ThuTuCongTrinh[] {
  return ghepThuTu(getProjectsForView(viewId), cachedThuTu[viewId] || []);
}

/** Hàm tra thuTuNhom(tenCongTrinh) → { stt, luong, viTri } | null của 1 nhóm (đọc cache hiện tại).
 *  Dùng với sapXepTheoThuTu (core/thuTuNhom) để xếp bảng theo danh sách nhóm. */
export function thuTuNhomCua(viewId: string): (tenCongTrinh: unknown) => ThuTuTra | null {
  return taoThuTuNhom(getProjectsForView(viewId), cachedThuTu[viewId] || []);
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
  // So theo tên chuẩn (mã công trình -> 1 tên), không phân biệt hoa/thường, khoảng trắng: công trình
  // đã chọn bằng 1 cách viết khác vẫn khớp dữ liệu sản xuất / nhập kho / xuất kho.
  const allowed = new Set(getProjectsForView(viewId).map(projectMatchKey));
  if (allowed.size === 0) return [];
  return data.filter((row) => allowed.has(projectMatchKey(row[congTrinhKey])));
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