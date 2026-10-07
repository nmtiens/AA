import { useEffect, useMemo, useState } from 'react';
import { toFilterSet, matchesFilter, toProjectSet, matchesProject } from '../utils/filterMatch';
import { DataRow } from '../../../types';
import { getWeekNumber } from '../utils/dateHelpers';
import { DashboardFiltersState } from './useDashboardFilters';

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
  invTuanKey,
  analysisCongTrinhKey,
  analysisXuongKey,
}: UseUnifiedTimeFiltersParams) {

  const [unifiedTimeFilters, setUnifiedTimeFilters] = useState<UnifiedTimeFiltersState>({
    nam: [new Date().getFullYear().toString()],
    thang: [(new Date().getMonth() + 1).toString()],
    ngay: [],
    tuan: [],
  });

  const [viewMode, setViewMode] = useState<ViewMode>('MONTH');

  // Mặc định lọc theo tuần hiện tại khi component mount
  useEffect(() => {
    const currentWeek = getWeekNumber();
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
    const tuanSet = viewMode === 'WEEK' ? toFilterSet(unifiedTimeFilters.tuan) : null;
    const ngaySet = viewMode === 'WEEK' ? toFilterSet(unifiedTimeFilters.ngay) : null;

    return inventoryData.filter(row =>
      matchesProject(congTrinhSet, row, invCongTrinhKey) &&
      matchesFilter(xuongSet, row, invXuongKey) &&
      matchesFilter(namSet, row, invNamKey) &&
      matchesFilter(thangSet, row, invThangKey) &&
      matchesFilter(tuanSet, row, invTuanKey) &&
      matchesFilter(ngaySet, row, invNgayKey)
    );
  }, [inventoryData, congTrinhSet, xuongSet, unifiedTimeFilters, viewMode, invCongTrinhKey, invXuongKey, invNamKey, invThangKey, invNgayKey, invTuanKey]);

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