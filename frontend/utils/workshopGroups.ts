// Setup gộp xưởng (khu vực sản xuất): mã xưởng gốc -> xưởng gộp, do ADMIN setup ở trang
// "Setup gộp xưởng" (backend: bảng workshop_group_mapping, API /api/workshop-groups).
// Backend đã gộp sẵn ở mọi API chia / lọc theo xưởng; ở frontend, App.tsx đổi cột xưởng
// của các bảng dữ liệu tải về sang tên xưởng đã gộp (canonicalizeWorkshops) để biểu đồ,
// bộ lọc, bảng tính ở client gom giống backend.

import { DataRow, ColumnDefinition } from '../types';
import { findColumnKey } from '../components/Dashboard/utils/columnKeyResolver';
import { fetchWorkshopGroups } from '../services/dataService';

export const normWorkshop = (v: unknown): string => String(v ?? '').trim().toUpperCase();

let rawToGroup = new Map<string, string>();
let inFlight: Promise<Record<string, string>> | null = null;

const setMapping = (mapping: Record<string, string>) => {
  const m = new Map<string, string>();
  Object.entries(mapping || {}).forEach(([raw, g]) => {
    const r = normWorkshop(raw), gg = normWorkshop(g);
    if (r && gg && r !== gg) m.set(r, gg);
  });
  rawToGroup = m;
};

/** Nạp setup mới nhất (dùng chung 1 request nếu đang nạp). */
export async function loadWorkshopGroups(): Promise<Record<string, string>> {
  if (inFlight) return inFlight;
  inFlight = fetchWorkshopGroups(false)
    .then(d => { setMapping(d.mapping); return d.mapping; })
    .finally(() => { inFlight = null; });
  return inFlight;
}

/** Cập nhật cache ngay sau khi ADMIN lưu. */
export const applyWorkshopMapping = (mapping: Record<string, string>) => setMapping(mapping);

/** Tên xưởng đã gộp của 1 mã gốc (mã không có trong setup giữ nguyên). */
export const workshopGroupOf = (raw: unknown): string => {
  const s = String(raw ?? '').trim();
  return rawToGroup.get(normWorkshop(s)) ?? s;
};

/** Đổi cột xưởng của mọi dòng sang tên xưởng đã gộp. Dòng không đổi giữ nguyên object. */
export function canonicalizeWorkshops(rows: DataRow[], columns: ColumnDefinition[]): DataRow[] {
  if (rawToGroup.size === 0 || rows.length === 0) return rows;
  const key = findColumnKey(columns, 'xuong_chinh');
  if (!key) return rows;
  let changed = false;
  const out = rows.map(row => {
    const g = rawToGroup.get(normWorkshop(row[key]));
    if (!g || row[key] === g) return row;
    changed = true;
    return { ...row, [key]: g };
  });
  return changed ? out : rows;
}
