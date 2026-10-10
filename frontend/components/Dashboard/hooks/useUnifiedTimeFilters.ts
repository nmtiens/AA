import { useEffect, useMemo, useState } from 'react';
import { toFilterSet, matchesFilter, toProjectSet, matchesProject } from '../utils/filterMatch';
import { DataRow } from '../../../types';
import { DashboardFiltersState } from './useDashboardFilters';
import { ColumnDefinition } from '../../../types';
import { findColumnKey } from '../utils/columnKeyResolver';
import { isCancelledIpo, parsePlanDate } from '../../../utils/productionMetrics';

// Thứ Hai của tuần ISO `week` thuộc năm ISO `year` (giờ địa phương)
const isoWeekMonday = (year: number, week: number): Date => {
  const jan4 = new Date(year, 0, 4);
  const dow = (jan4.getDay() + 6) % 7; // 0 = Thứ Hai
  return new Date(year, 0, 4 - dow + (week - 1) * 7);
};
// Ngày d thuộc tuần `week` của năm `year` theo cách đánh số của bảng KHSX: tuần ISO, cắt trong năm dương lịch
// (29–31/12/2025 là tuần 53 của 2025, 01–04/01/2026 là tuần 1 của 2026) — giống /api/khsx-nhapkho/summary
export const inPlanWeek = (d: Date, year: number, week: number): boolean => {
  const mon = isoWeekMonday(year, week);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  const lo = mon < new Date(year, 0, 1) ? new Date(year, 0, 1) : mon;
  const hi = sun > new Date(year, 11, 31) ? new Date(year, 11, 31) : sun;
  return d >= lo && d <= hi;
};
// Số tuần của ngày d trong năm dương lịch của nó, cùng cách đánh số với inPlanWeek (tuần mặc định của bộ lọc).
// Khác getWeekNumber (ISO thuần): 29–31/12/2025 là tuần 53 của 2025 (ISO ra tuần 1); 01–03/01/2027 (trước thứ Hai
// tuần ISO 1) ISO ra tuần 53 — ở đây chặn về tuần 1 của 2027 vì năm lọc mặc định là năm hiện tại.
export const planWeekOf = (d: Date): number => {
  const year = d.getFullYear();
  const day = new Date(year, d.getMonth(), d.getDate());
  const days = Math.round((day.getTime() - isoWeekMonday(year, 1).getTime()) / 86_400_000);
  return Math.max(1, Math.floor(days / 7) + 1);
};

export interface UnifiedTimeFiltersState {
  nam: string[];
  thang: string[];
  ngay: string[];
  tuan: string[];
}

export type ViewMode = 'MONTH' | 'WEEK' | 'YEAR';

interface UseUnifiedTimeFiltersParams {
  inventoryData: DataRow[];
  analysisData: DataRow[];

  // Bộ lọc tổng (Công trình / Khu vực SX) — chỉ cần 2 field này
  filters: Pick<DashboardFiltersState, 'congTrinh' | 'xuong'>;

  invCongTrinhKey: string | undefined;
  invXuongKey: string | undefined;
  invNamKey: string | undefined;
  invThangKey: string | undefined;
  invNgayKey: string | undefined;
  invTuanKey: string | undefined;

  analysisCongTrinhKey: string | undefined;
  analysisXuongKey: string | undefined;

  /** Để bỏ nhập kho của hạng mục HỦY (cùng quy tắc server) và lọc tuần theo NGÀY nhập kho */
  productionData?: DataRow[];
  productionColumns?: ColumnDefinition[];
  inventoryColumns?: ColumnDefinition[];
}

/**
 * Gom state bộ lọc thời gian thống nhất (Năm/Tháng/Ngày/Tuần + chế độ xem MONTH/WEEK)
 * và các tập dữ liệu Inventory / Analysis đã lọc theo bộ lọc tổng + bộ lọc thời gian này.
 */
export function useUnifiedTimeFilters({
  inventoryData,
  analysisData,
  filters,
  invCongTrinhKey,
  invXuongKey,
  invNamKey,
  invThangKey,
  invNgayKey,
  analysisCongTrinhKey,
  analysisXuongKey,
  productionData,
  productionColumns,
  inventoryColumns,
}: UseUnifiedTimeFiltersParams) {
  // HEX thuộc đơn HỦY — nhập kho của chúng không tính (KHSX / tổng quan phía server đều bỏ)
  const cancelledHexes = useMemo(() => {
    const set = new Set<string>();
    if (!productionData?.length) return set;
    const hexK = (productionColumns && findColumnKey(productionColumns, 'hex')) || 'hex';
    const ipoK = (productionColumns && findColumnKey(productionColumns, 'tinh_trang_ipo')) || 'tinh_trang_ipo';
    for (const r of productionData) if (isCancelledIpo(r[ipoK])) set.add(String(r[hexK] ?? '').trim());
    return set;
  }, [productionData, productionColumns]);
  const invHexKey = (inventoryColumns && findColumnKey(inventoryColumns, 'hex')) || 'hex';
  const invDateKey = (inventoryColumns && inventoryColumns.find(c => c.key === 'date')?.key) || 'date';

  const [unifiedTimeFilters, setUnifiedTimeFilters] = useState<UnifiedTimeFiltersState>({
    nam: [new Date().getFullYear().toString()],
    thang: [(new Date().getMonth() + 1).toString()],
    ngay: [],
    tuan: [],
  });

  const [viewMode, setViewMode] = useState<ViewMode>('MONTH');

  // Mặc định lọc theo tuần hiện tại khi component mount
  useEffect(() => {
    const currentWeek = planWeekOf(new Date());
    setUnifiedTimeFilters(prev => ({ ...prev, tuan: [String(currentWeek)] }));
  }, []);

  // Set tạo 1 lần mỗi khi bộ lọc đổi (danh sách công trình có thể dài hàng trăm phần tử khi
  // lọc theo khách hàng / khu vực dự án), thay cho Array.includes trên từng dòng.
  // Bảng nhập kho / phân tích KH-TH ghi tên công trình riêng -> so theo tên chuẩn
  const congTrinhSet = useMemo(() => toProjectSet(filters.congTrinh), [filters.congTrinh]);
  const xuongSet = useMemo(() => toFilterSet(filters.xuong), [filters.xuong]);

  const filteredInventoryData = useMemo(() => {
    const namSet = toFilterSet(unifiedTimeFilters.nam);
    const thangSet = toFilterSet(unifiedTimeFilters.thang);
    const ngaySet = viewMode === 'WEEK' ? toFilterSet(unifiedTimeFilters.ngay) : null;
    // Xem theo TUẦN đã chọn tuần: tuần tính theo NGÀY nhập kho (tuần ISO cắt trong năm, như bảng KHSX) và không
    // lọc thêm tháng — khớp /api/khsx-nhapkho/summary (trước dùng cột tuần ISO thuần + lọc tháng: tuần giáp 2
    // tháng chỉ ra 1 nửa, tuần 53/2025 ra 0)
    const weeks = viewMode === 'WEEK' ? unifiedTimeFilters.tuan.map(Number).filter(n => n > 0) : [];
    const years = unifiedTimeFilters.nam.map(Number).filter(n => n > 0);
    const byDateWeek = weeks.length > 0 && years.length > 0;
    const useThang = !byDateWeek;

    return inventoryData.filter(row => {
      if (cancelledHexes.size && cancelledHexes.has(String(row[invHexKey] ?? '').trim())) return false;
      if (!(matchesProject(congTrinhSet, row, invCongTrinhKey) &&
        matchesFilter(xuongSet, row, invXuongKey) &&
        matchesFilter(namSet, row, invNamKey) &&
        (!useThang || matchesFilter(thangSet, row, invThangKey)) &&
        matchesFilter(ngaySet, row, invNgayKey))) return false;
      if (!byDateWeek) return true;
      const d = parsePlanDate(row[invDateKey]);
      return !!d && years.some(y => weeks.some(w => inPlanWeek(d, y, w)));
    });
  }, [inventoryData, congTrinhSet, xuongSet, unifiedTimeFilters, viewMode, invCongTrinhKey, invXuongKey, invNamKey, invThangKey, invNgayKey, cancelledHexes, invHexKey, invDateKey]);

  const filteredAnalysisData = useMemo(() => {
    return analysisData.filter(row =>
      matchesProject(congTrinhSet, row, analysisCongTrinhKey) &&
      matchesFilter(xuongSet, row, analysisXuongKey)
    );
  }, [analysisData, congTrinhSet, xuongSet, analysisCongTrinhKey, analysisXuongKey]);

  return {
    unifiedTimeFilters,
    setUnifiedTimeFilters,
    viewMode,
    setViewMode,
    filteredInventoryData,
    filteredAnalysisData,
  };
}

export type UseUnifiedTimeFiltersResult = ReturnType<typeof useUnifiedTimeFilters>;