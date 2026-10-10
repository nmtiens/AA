import { useEffect, useMemo, useState } from 'react';
import { toFilterSet, matchesFilter, toProjectSet, matchesProject } from '../utils/filterMatch';
import { DataRow } from '../../../types';
import { DashboardFiltersState } from './useDashboardFilters';
import { ColumnDefinition } from '../../../types';
import { findColumnKey } from '../utils/columnKeyResolver';
import { parsePlanDate } from '../../../utils/productionMetrics';
import type { CancelledHexInfo } from '../utils/cancelledHexes';
import { isoWeekMonday, planWeekRange } from '../../../utils/dateUtils';

// Ngày d thuộc tuần `week` của năm `year` theo cách đánh số của bảng KHSX: tuần ISO, cắt trong năm dương lịch
// (29–31/12/2025 là tuần 53 của 2025, 01–04/01/2026 là tuần 1 của 2026) — giống /api/khsx-nhapkho/summary
export const inPlanWeek = (d: Date, year: number, week: number): boolean => {
  const { start, end } = planWeekRange(year, week);
  return d >= start && d <= end;
};
// Số tuần của ngày d trong năm dương lịch của nó, cùng cách đánh số với inPlanWeek (tuần mặc định của bộ lọc).
// Khác tuần ISO thuần: 29–31/12/2025 là tuần 53 của 2025 (ISO ra tuần 1); 01–03/01/2027 (trước thứ Hai
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

  /** HEX thuộc đơn HỦY (tính 1 lần ở Dashboard) — để bỏ nhập kho của hạng mục HỦY (cùng quy tắc server) */
  cancelled?: CancelledHexInfo;
  /** Để lọc tuần theo NGÀY nhập kho */
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
  cancelled,
  inventoryColumns,
}: UseUnifiedTimeFiltersParams) {
  // HEX thuộc đơn HỦY — nhập kho của chúng không tính (KHSX / tổng quan phía server đều bỏ).
  // Dòng nhập kho trống HEX luôn giữ — cùng quy tắc server (CANCELLED_HEX_SQL chỉ xét hex khác rỗng); trước bị bỏ
  // khi có dòng HỦY trống HEX => doanh số Năng suất thấp hơn KHSX TH cùng tuần / xưởng
  const cancelledHexes = cancelled?.hexes;
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
      if (cancelledHexes?.size) {
        const h = String(row[invHexKey] ?? '').trim();
        if (h && cancelledHexes.has(h)) return false;
      }
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