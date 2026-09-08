import { useMemo, useState } from 'react';
import { DataRow } from '../../../types';

export interface DashboardFiltersState {
  congTrinh: string[];
  xuong: string[];
  tinhTrang: string[];
  tinhTrangIpo: string[];
}

interface UseDashboardFiltersParams {
  productionData: DataRow[];
  materialData: DataRow[];

  congTrinhKey: string | undefined;
  xuongKey: string | undefined;
  tinhTrangKey: string | undefined;
  tinhTrangIpoKey: string | undefined;

  matCongTrinhKey: string | undefined;
  matNhomVtKey: string | undefined;
}

const DEFAULT_FILTERS: DashboardFiltersState = {
  congTrinh: [],
  xuong: [],
  tinhTrang: [],
  tinhTrangIpo: ['01. ĐANG SẢN XUẤT'],
};

/**
 * Gom toàn bộ state + logic lọc tổng (Công trình / Khu vực SX / Tình trạng / Tình trạng IPO)
 * và lọc Vật tư theo Công trình + Nhóm VT.
 */
export function useDashboardFilters({
  productionData,
  materialData,
  congTrinhKey,
  xuongKey,
  tinhTrangKey,
  tinhTrangIpoKey,
  matCongTrinhKey,
  matNhomVtKey,
}: UseDashboardFiltersParams) {

  const [filters, setFilters] = useState<DashboardFiltersState>(DEFAULT_FILTERS);
  const [selectedMaterialGroups, setSelectedMaterialGroups] = useState<string[]>([]);

  const clearFilters = () => {
    setFilters({ congTrinh: [], xuong: [], tinhTrang: [], tinhTrangIpo: [] });
  };

  const hasActiveFilters =
    filters.congTrinh.length > 0 ||
    filters.xuong.length > 0 ||
    filters.tinhTrang.length > 0 ||
    filters.tinhTrangIpo.length > 0;

  const filteredProductionData = useMemo(() => {
    return productionData.filter(row => {
      const matchCongTrinh = filters.congTrinh.length === 0 || (congTrinhKey && filters.congTrinh.includes(String(row[congTrinhKey] || '').trim()));
      const matchXuong = filters.xuong.length === 0 || (xuongKey && filters.xuong.includes(String(row[xuongKey] || '').trim()));
      const matchTinhTrang = filters.tinhTrang.length === 0 || (tinhTrangKey && filters.tinhTrang.includes(String(row[tinhTrangKey] || '').trim()));
      const matchTinhTrangIpo = filters.tinhTrangIpo.length === 0 || (tinhTrangIpoKey && filters.tinhTrangIpo.includes(String(row[tinhTrangIpoKey] || '').trim()));

      return matchCongTrinh && matchXuong && matchTinhTrang && matchTinhTrangIpo;
    });
  }, [productionData, filters, congTrinhKey, xuongKey, tinhTrangKey, tinhTrangIpoKey]);

  const filteredMaterialData = useMemo(() => {
    return materialData.filter(row => {
      const matchCongTrinh = filters.congTrinh.length === 0 || (matCongTrinhKey && filters.congTrinh.includes(String(row[matCongTrinhKey] || '').trim()));
      return matchCongTrinh;
    });
  }, [materialData, filters.congTrinh, matCongTrinhKey]);

  const displayedMaterialData = useMemo(() => {
    if (selectedMaterialGroups.length === 0) return filteredMaterialData;
    return filteredMaterialData.filter(row => {
      const group = String(row[matNhomVtKey!] || 'Chưa phân nhóm').trim();
      return selectedMaterialGroups.includes(group);
    });
  }, [filteredMaterialData, selectedMaterialGroups, matNhomVtKey]);

  const toggleMaterialGroup = (group: string) => {
    setSelectedMaterialGroups(prev => {
      if (prev.includes(group)) return prev.filter(g => g !== group);
      return [...prev, group];
    });
  };

  return {
    filters,
    setFilters,
    hasActiveFilters,
    clearFilters,

    filteredProductionData,
    filteredMaterialData,
    displayedMaterialData,

    selectedMaterialGroups,
    setSelectedMaterialGroups,
    toggleMaterialGroup,
  };
}

export type UseDashboardFiltersResult = ReturnType<typeof useDashboardFilters>;