// Phần thuần của setup gộp xưởng (dùng chung trình duyệt + máy chủ tính sẵn Tổng quan). Nạp từ API: workshopGroups.ts
// Setup gộp xưởng (khu vực sản xuất): mã xưởng gốc -> xưởng gộp, do ADMIN setup ở trang
// "Setup gộp xưởng" (backend: bảng workshop_group_mapping, API /api/workshop-groups).
// Backend đã gộp sẵn ở mọi API chia / lọc theo xưởng; ở frontend, App.tsx đổi cột xưởng
// của các bảng dữ liệu tải về sang tên xưởng đã gộp (canonicalizeWorkshops) để biểu đồ,
// bộ lọc, bảng tính ở client gom giống backend.

import { DataRow, ColumnDefinition } from '../types';
import { findColumnKey } from '../components/Dashboard/utils/columnKeyResolver';

export const normWorkshop = (v: unknown): string => String(v ?? '').trim().toUpperCase();

let rawToGroup = new Map<string, string>();

export const setMapping = (mapping: Record<string, string>) => {
  const m = new Map<string, string>();
  Object.entries(mapping || {}).forEach(([raw, g]) => {
    const r = normWorkshop(raw), gg = normWorkshop(g);
    if (r && gg && r !== gg) m.set(r, gg);
  });
  rawToGroup = m;
};

/** Cập nhật cache ngay sau khi ADMIN lưu. */
export const applyWorkshopMapping = (mapping: Record<string, string>) => setMapping(mapping);

/** Tên xưởng đã gộp của 1 mã gốc. Mã không có trong setup: viết hoa, bỏ khoảng trắng thừa — như server
 *  (UPPER(TRIM())), trước giữ nguyên chữ thường => "8ab" và "8AB" thành 2 xưởng ở máy, 1 xưởng trên server. */
export const workshopGroupOf = (raw: unknown): string => {
  const n = normWorkshop(raw);
  return rawToGroup.get(n) ?? n;
};

/** Đổi cột xưởng của mọi dòng sang tên xưởng đã gộp. Dòng không đổi giữ nguyên object. */
export function canonicalizeWorkshops(rows: DataRow[], columns: ColumnDefinition[]): DataRow[] {
  if (rows.length === 0) return rows;
  const key = findColumnKey(columns, 'xuong_chinh');
  if (!key) return rows;
  let changed = false;
  const groupOf = new Map<unknown, string>(); // vài chục mã xưởng / hàng trăm nghìn dòng
  const out = rows.map(row => {
    const v = row[key];
    if (v == null || v === '') return row;
    let g = groupOf.get(v);
    if (g === undefined) {
      const n = normWorkshop(v);
      // Mã không có trong setup vẫn viết hoa / bỏ khoảng trắng thừa như server
      g = rawToGroup.get(n) ?? n;
      groupOf.set(v, g);
    }
    if (!g || v === g) return row;
    changed = true;
    return { ...row, [key]: g };
  });
  return changed ? out : rows;
}
