import { useMemo, useState } from 'react';
import { DataRow } from '../../../types';

export interface DashboardFiltersState {
  congTrinh: string[];
  xuong: string[];
  tinhTrang: string[];
  tinhTrangIpo: string[];
  khachHang: string[];
  khuVucDuAn: string[];
}

interface UseDashboardFiltersParams {
  productionData: DataRow[];
  materialData: DataRow[];

  congTrinhKey: string | undefined;
  xuongKey: string | undefined;
  tinhTrangKey: string | undefined;
  tinhTrangIpoKey: string | undefined;
  khachHangKey?: string | undefined;
  khuVucDuAnKey?: string | undefined;

  matCongTrinhKey: string | undefined;
  matNhomVtKey: string | undefined;
}

const DEFAULT_FILTERS: DashboardFiltersState = {
  congTrinh: [],
  xuong: [],
  tinhTrang: [],
  tinhTrangIpo: ['01. ĐANG SẢN XUẤT'],
  khachHang: [],
  khuVucDuAn: [],
};

// Cố định Tình Trạng IPO dùng riêng cho biểu đồ Funnel "TÌNH TRẠNG ĐƠN HÀNG AATN"
// (KHÔNG phụ thuộc vào lựa chọn của người dùng ở ô "Tình Trạng IPO").
const FUNNEL_FIXED_TINH_TRANG_IPO = '01. ĐANG SẢN XUẤT';

// Khi lọc Khách hàng / Khu vực dự án mà không có công trình nào khớp: mảng công trình rỗng
// nghĩa là "không lọc" nên phải dùng 1 giá trị giả để mọi nơi trả về kết quả rỗng.
const NO_MATCH_PROJECT = '__KHONG_CO_CONG_TRINH__';

/**
 * Gom toàn bộ state + logic lọc tổng (Khách hàng / Khu vực dự án / Công trình / Khu vực SX /
 * Tình trạng / Tình trạng IPO) và lọc Vật tư theo Công trình + Nhóm VT.
 *
 * Khách hàng + Khu vực dự án được quy về DANH SÁCH CÔNG TRÌNH (effectiveFilters.congTrinh) để
 * mọi hook/API phía sau (vốn chỉ biết lọc theo công trình) tự áp dụng mà không phải sửa.
 */
export function useDashboardFilters({
  productionData,
  materialData,
  congTrinhKey,
  xuongKey,
  tinhTrangKey,
  tinhTrangIpoKey,
  khachHangKey,
  khuVucDuAnKey,
  matCongTrinhKey,
  matNhomVtKey,
}: UseDashboardFiltersParams) {

  const [filters, setFilters] = useState<DashboardFiltersState>(DEFAULT_FILTERS);
  const [selectedMaterialGroups, setSelectedMaterialGroups] = useState<string[]>([]);

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  // Chỉ để hiện lại nút X — kiểm tra length đơn giản.
  const hasActiveFilters =
    filters.congTrinh.length > 0 ||
    filters.xuong.length > 0 ||
    filters.tinhTrang.length > 0 ||
    filters.tinhTrangIpo.length > 0 ||
    filters.khachHang.length > 0 ||
    filters.khuVucDuAn.length > 0;

  // Tập công trình thuộc các Khách hàng + Khu vực dự án đã chọn (null = không lọc theo 2 tiêu chí này)
  const scopedProjects = useMemo<Set<string> | null>(() => {
    if (!congTrinhKey) return null;
    if (filters.khachHang.length === 0 && filters.khuVucDuAn.length === 0) return null;

    const set = new Set<string>();
    for (const row of productionData) {
      const ct = String(row[congTrinhKey] || '').trim();
      if (!ct) continue;
      if (filters.khachHang.length > 0 &&
          !(khachHangKey && filters.khachHang.includes(String(row[khachHangKey] || '').trim()))) continue;
      if (filters.khuVucDuAn.length > 0 &&
          !(khuVucDuAnKey && filters.khuVucDuAn.includes(String(row[khuVucDuAnKey] || '').trim()))) continue;
      set.add(ct);
    }
    return set;
  }, [productionData, filters.khachHang, filters.khuVucDuAn, congTrinhKey, khachHangKey, khuVucDuAnKey]);

  // Danh sách công trình thực sự áp dụng = (công trình đã chọn) giao (công trình thuộc khách hàng/khu vực)
  const effectiveCongTrinh = useMemo<string[]>(() => {
    if (!scopedProjects) return filters.congTrinh;
    const list = filters.congTrinh.length > 0
      ? filters.congTrinh.filter(ct => scopedProjects.has(ct))
      : Array.from(scopedProjects);
    return list.length > 0 ? list : [NO_MATCH_PROJECT];
  }, [scopedProjects, filters.congTrinh]);

  // Bản `filters` dành cho các hook/section phía sau (chỉ khác ở congTrinh)
  const effectiveFilters = useMemo<DashboardFiltersState>(
    () => ({ ...filters, congTrinh: effectiveCongTrinh }),
    [filters, effectiveCongTrinh]
  );

  const filteredProductionData = useMemo(() => {
    return productionData.filter(row => {
      const matchCongTrinh = effectiveCongTrinh.length === 0 || (congTrinhKey && effectiveCongTrinh.includes(String(row[congTrinhKey] || '').trim()));
      const matchXuong = filters.xuong.length === 0 || (xuongKey && filters.xuong.includes(String(row[xuongKey] || '').trim()));
      const matchTinhTrang = filters.tinhTrang.length === 0 || (tinhTrangKey && filters.tinhTrang.includes(String(row[tinhTrangKey] || '').trim()));
      const matchTinhTrangIpo = filters.tinhTrangIpo.length === 0 || (tinhTrangIpoKey && filters.tinhTrangIpo.includes(String(row[tinhTrangIpoKey] || '').trim()));

      return matchCongTrinh && matchXuong && matchTinhTrang && matchTinhTrangIpo;
    });
  }, [productionData, filters, effectiveCongTrinh, congTrinhKey, xuongKey, tinhTrangKey, tinhTrangIpoKey]);

  // Dataset riêng cho biểu đồ "TÌNH TRẠNG ĐƠN HÀNG AATN" (funnel) — LUÔN cố định
  // Tình Trạng IPO = "01. ĐANG SẢN XUẤT", chỉ ăn Công trình (+ Khách hàng/Khu vực dự án) + Khu vực SX.
  const funnelProductionData = useMemo(() => {
    return productionData.filter(row => {
      const matchCongTrinh = effectiveCongTrinh.length === 0 || (congTrinhKey && effectiveCongTrinh.includes(String(row[congTrinhKey] || '').trim()));
      const matchXuong = filters.xuong.length === 0 || (xuongKey && filters.xuong.includes(String(row[xuongKey] || '').trim()));
      const matchFixedIpo = tinhTrangIpoKey && String(row[tinhTrangIpoKey] || '').trim() === FUNNEL_FIXED_TINH_TRANG_IPO;

      return matchCongTrinh && matchXuong && matchFixedIpo;
    });
  }, [productionData, effectiveCongTrinh, filters.xuong, congTrinhKey, xuongKey, tinhTrangIpoKey]);

  // Dataset riêng cho bảng "Tình trạng đơn hàng theo Công trình" (v2) — CHỈ ăn Công trình
  // (+ Khách hàng/Khu vực dự án) + Khu vực SX, KHÔNG áp dụng Tình Trạng / Tình Trạng IPO.
  const projectSummaryProductionData = useMemo(() => {
    return productionData.filter(row => {
      const matchCongTrinh = effectiveCongTrinh.length === 0 || (congTrinhKey && effectiveCongTrinh.includes(String(row[congTrinhKey] || '').trim()));
      const matchXuong = filters.xuong.length === 0 || (xuongKey && filters.xuong.includes(String(row[xuongKey] || '').trim()));
      return matchCongTrinh && matchXuong;
    });
  }, [productionData, effectiveCongTrinh, filters.xuong, congTrinhKey, xuongKey]);

  const filteredMaterialData = useMemo(() => {
    return materialData.filter(row => {
      const matchCongTrinh = effectiveCongTrinh.length === 0 || (matCongTrinhKey && effectiveCongTrinh.includes(String(row[matCongTrinhKey] || '').trim()));
      return matchCongTrinh;
    });
  }, [materialData, effectiveCongTrinh, matCongTrinhKey]);

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
    effectiveFilters,
    scopedProjects,
    setFilters,
    hasActiveFilters,
    clearFilters,

    filteredProductionData,
    funnelProductionData,
    projectSummaryProductionData,
    filteredMaterialData,
    displayedMaterialData,

    selectedMaterialGroups,
    setSelectedMaterialGroups,
    toggleMaterialGroup,
  };
}

export type UseDashboardFiltersResult = ReturnType<typeof useDashboardFilters>;