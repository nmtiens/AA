import { useEffect, useMemo, useState } from 'react';
import { DataRow } from '../../../types';
import { getWeekNumber } from '../utils/dateHelpers';
import { DashboardFiltersState } from './useDashboardFilters';

export interface UnifiedTimeFiltersState {
  nam: string[];
  thang: string[];
  ngay: string[];
  tuan: string[];
}

export type ViewMode = 'MONTH' | 'WEEK';

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

  const filteredInventoryData = useMemo(() => {
    return inventoryData.filter(row => {
      const matchGeneralCongTrinh = filters.congTrinh.length === 0 || (invCongTrinhKey && filters.congTrinh.includes(String(row[invCongTrinhKey] || '').trim()));
      const matchGeneralXuong = filters.xuong.length === 0 || (invXuongKey && filters.xuong.includes(String(row[invXuongKey] || '').trim()));
      const matchNam = unifiedTimeFilters.nam.length === 0 || (invNamKey && unifiedTimeFilters.nam.includes(String(row[invNamKey] || '').trim()));
      const matchThang = unifiedTimeFilters.thang.length === 0 || (invThangKey && unifiedTimeFilters.thang.includes(String(row[invThangKey] || '').trim()));

      let matchTuan = true;
      let matchNgay = true;
      if (viewMode === 'WEEK') {
        matchTuan = unifiedTimeFilters.tuan.length === 0 || (!!invTuanKey && unifiedTimeFilters.tuan.includes(String(row[invTuanKey] || '').trim()));
        matchNgay = unifiedTimeFilters.ngay.length === 0 || (!!invNgayKey && unifiedTimeFilters.ngay.includes(String(row[invNgayKey] || '').trim()));
      }

      return matchGeneralCongTrinh && matchGeneralXuong && matchNam && matchThang && matchTuan && matchNgay;
    });
  }, [inventoryData, filters.congTrinh, filters.xuong, unifiedTimeFilters, viewMode, invCongTrinhKey, invXuongKey, invNamKey, invThangKey, invNgayKey, invTuanKey]);

  const filteredAnalysisData = useMemo(() => {
    return analysisData.filter(row => {
      const matchCongTrinh = filters.congTrinh.length === 0 || (analysisCongTrinhKey && filters.congTrinh.includes(String(row[analysisCongTrinhKey] || '').trim()));
      const matchXuong = filters.xuong.length === 0 || (analysisXuongKey && filters.xuong.includes(String(row[analysisXuongKey] || '').trim()));
      return matchCongTrinh && matchXuong;
    });
  }, [analysisData, filters.congTrinh, filters.xuong, analysisCongTrinhKey, analysisXuongKey]);

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