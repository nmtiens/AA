// src/utils/constructionClassification.ts
//
// Quản lý việc phân loại từng "CÔNG TRÌNH" vào nhóm: Luồng đỏ / Căn mẫu / Khác.
// Dùng chung cho ConstructionRedFlow.tsx và ConstructionSampleUnit.tsx để lọc
// lại đúng dữ liệu gốc (production/material/order/khsx/...) theo nhóm công trình.
//
// GHI CHÚ TÍCH HỢP:
// - Hiện lưu bằng localStorage để chạy được ngay không cần backend mới.
//   Khi có API thật, thay 2 hàm loadClassification / saveClassification bằng
//   fetch tới endpoint của bạn (gợi ý: GET/POST /api/construction-classification).
// - "congTrinh" ở đây là giá trị thô lấy từ cột TARGET_COLUMN_NAMES.CONG_TRINH
//   trong dữ liệu (DataRow), ví dụ tên/mã công trình.

import { DataRow } from '../../../types';

export type ConstructionCategory = 'luong-do' | 'can-mau' | 'khac';

export const CONSTRUCTION_CATEGORY_LABELS: Record<ConstructionCategory, string> = {
  'luong-do': 'Luồng đỏ',
  'can-mau': 'Căn mẫu',
  'khac': 'Khác (không thuộc nhóm)',
};

export interface ClassificationEntry {
  congTrinh: string;
  category: ConstructionCategory;
}

const STORAGE_KEY = 'construction_classification_v1';

/** Đọc toàn bộ bảng phân loại đã lưu: { [congTrinh]: category } */
export function loadClassification(): Record<string, ConstructionCategory> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Lưu toàn bộ bảng phân loại */
export function saveClassification(map: Record<string, ConstructionCategory>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

/** Lấy nhóm của 1 công trình cụ thể (mặc định 'khac' nếu chưa gán) */
export function getCategoryForProject(
  congTrinh: string,
  map?: Record<string, ConstructionCategory>
): ConstructionCategory {
  const m = map || loadClassification();
  return m[congTrinh] || 'khac';
}

/**
 * Lọc một mảng DataRow theo nhóm công trình mong muốn.
 * @param data       mảng dữ liệu gốc (production/material/order/...)
 * @param congTrinhKey tên cột chứa giá trị công trình trong DataRow (vd TARGET_COLUMN_NAMES.CONG_TRINH)
 * @param category   nhóm cần lọc ('luong-do' | 'can-mau' | 'khac')
 */
export function filterByConstructionCategory(
  data: DataRow[],
  congTrinhKey: string,
  category: ConstructionCategory
): DataRow[] {
  if (!congTrinhKey) return [];
  const map = loadClassification();
  return data.filter((row) => {
    const congTrinh = String(row[congTrinhKey] || '');
    return getCategoryForProject(congTrinh, map) === category;
  });
}

/**
 * Lấy danh sách công trình duy nhất (unique) từ nhiều nguồn dữ liệu khác nhau
 * (production, material, order, khsx, ...) — dùng để hiển thị lên trang setup
 * cho admin gán nhóm, tránh bị sót công trình chỉ xuất hiện ở 1 bảng.
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
