import type { DataRow } from '../../../types';

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
