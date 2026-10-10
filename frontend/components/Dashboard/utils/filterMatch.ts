import type { DataRow } from '../../../types';
import { projectMatchKey } from '../../../utils/productionMetrics';

// Dùng cho các bộ lọc nhiều lựa chọn chạy trên bảng lớn (vd ~51k dòng sản xuất):
// tạo Set 1 lần mỗi khi bộ lọc đổi, thay vì Array.includes cho từng dòng.

/** Mảng giá trị đã chọn -> Set để tra cứu O(1). Mảng rỗng = không lọc => null. */
export const toFilterSet = (values: string[]): Set<string> | null => (values.length ? new Set(values) : null);

/**
 * Dòng có khớp bộ lọc không. Giữ đúng hành vi cũ của `arr.length === 0 || (key && arr.includes(v))`:
 * không lọc (null) => khớp; đang lọc mà không tìm được cột (key rỗng) => không khớp.
 */
export const matchesFilter = (set: Set<string> | null, row: DataRow, key: string | undefined): boolean =>
  set === null || (!!key && set.has(String(row[key] || '').trim()));

// Lọc theo CÔNG TRÌNH giữa các bảng: so theo tên chuẩn (không phân biệt hoa/thường, khoảng trắng,
// tên phụ của cùng mã) — bảng nhập/xuất kho, vật tư… có thể ghi tên công trình khác cách viết.
export const toProjectSet = (values: string[]): Set<string> | null =>
  (values.length ? new Set(values.map(projectMatchKey)) : null);
export const matchesProject = (set: Set<string> | null, row: DataRow, key: string | undefined): boolean =>
  set === null || (!!key && set.has(projectMatchKey(row[key])));

// ---------------------------------------------------------------------------
// Bộ lọc dạng "nhóm" (Khách hàng / Khu vực dự án / Nhóm sản phẩm): ô trống hoặc lỗi Excel (#N/A...)
// được gom vào nhãn "(Chưa có)" — giống cách biểu đồ tròn "Cơ cấu đơn hàng" hiển thị, để bấm vào
// lát "(Chưa có)" trên biểu đồ cũng lọc được cả trang.
// ---------------------------------------------------------------------------
export const NO_DATA_LABEL = '(Chưa có)';

export const categoryValue = (v: unknown): string => {
  const t = String(v ?? '').trim();
  return !t || t.startsWith('#') ? NO_DATA_LABEL : t;
};

/** Như matchesFilter nhưng so theo categoryValue (ô trống khớp "(Chưa có)"). */
export const matchesCategory = (set: Set<string> | null, row: DataRow, key: string | undefined): boolean =>
  set === null || (!!key && set.has(categoryValue(row[key])));

/** Danh sách lựa chọn cho bộ lọc nhóm: sắp theo ABC, "(Chưa có)" (nếu có) đứng cuối. */
export const categoryOptions = (data: DataRow[], key: string | undefined): string[] => {
  if (!key) return [];
  // Gom giá trị thô trước rồi mới chuẩn hoá (vài trăm nghìn dòng chỉ vài trăm giá trị khác nhau)
  const raw = new Set<unknown>();
  for (const row of data) raw.add(row[key]);
  const set = new Set<string>();
  for (const v of raw) set.add(categoryValue(v));
  const hasNoData = set.delete(NO_DATA_LABEL);
  const list = Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  return hasNoData ? [...list, NO_DATA_LABEL] : list;
};
