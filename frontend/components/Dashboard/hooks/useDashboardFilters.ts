import { useMemo, useState } from 'react';
import { DataRow } from '../../../types';
import { toFilterSet, matchesFilter, matchesCategory } from '../utils/filterMatch';

export interface DashboardFiltersState {
  congTrinh: string[];
  xuong: string[];
  tinhTrang: string[];
  tinhTrangIpo: string[];
  khachHang: string[];
  khuVucDuAn: string[];
  /** Nhóm sản phẩm — lọc theo từng dòng (không quy về công trình), chỉ áp cho dữ liệu sản xuất */
  phanLoai: string[];
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
  phanLoaiKey?: string | undefined;
  /**
   * Nguồn cho biểu đồ "Cơ cấu đơn hàng" khi khác productionData — vd. trang công trình truyền
   * dữ liệu CHƯA lọc Khách hàng/Khu vực (vì productionData của trang đó đã lọc sẵn 2 tiêu chí này).
   */
  crossFilterSourceData?: DataRow[];

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
  phanLoai: [],
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
  phanLoaiKey,
  crossFilterSourceData,
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
    filters.khuVucDuAn.length > 0 ||
    filters.phanLoai.length > 0;

  // Tập công trình thuộc các Khách hàng + Khu vực dự án đã chọn (null = không lọc theo 2 tiêu chí này)
  const scopedProjects = useMemo<Set<string> | null>(() => {
    if (!congTrinhKey) return null;
    if (filters.khachHang.length === 0 && filters.khuVucDuAn.length === 0) return null;

    const khachHangSet = toFilterSet(filters.khachHang);
    const khuVucDuAnSet = toFilterSet(filters.khuVucDuAn);
    const set = new Set<string>();
    for (const row of productionData) {
      const ct = String(row[congTrinhKey] || '').trim();
      if (!ct) continue;
      if (!matchesCategory(khachHangSet, row, khachHangKey)) continue;
      if (!matchesCategory(khuVucDuAnSet, row, khuVucDuAnKey)) continue;
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

  // Tập giá trị lọc (Set) tạo 1 lần cho mỗi lần đổi bộ lọc, thay vì Array.includes cho
  // từng dòng (~51k dòng sản xuất × số giá trị đã chọn). null = không lọc theo tiêu chí đó.
  const congTrinhSet = useMemo(() => toFilterSet(effectiveCongTrinh), [effectiveCongTrinh]);
  const xuongSet = useMemo(() => toFilterSet(filters.xuong), [filters.xuong]);
  const tinhTrangSet = useMemo(() => toFilterSet(filters.tinhTrang), [filters.tinhTrang]);
  const tinhTrangIpoSet = useMemo(() => toFilterSet(filters.tinhTrangIpo), [filters.tinhTrangIpo]);
  const phanLoaiSet = useMemo(() => toFilterSet(filters.phanLoai), [filters.phanLoai]);

  const filteredProductionData = useMemo(() => {
    return productionData.filter(row =>
      matchesFilter(congTrinhSet, row, congTrinhKey) &&
      matchesFilter(xuongSet, row, xuongKey) &&
      matchesFilter(tinhTrangSet, row, tinhTrangKey) &&
      matchesFilter(tinhTrangIpoSet, row, tinhTrangIpoKey) &&
      matchesCategory(phanLoaiSet, row, phanLoaiKey)
    );
  }, [productionData, congTrinhSet, xuongSet, tinhTrangSet, tinhTrangIpoSet, phanLoaiSet, congTrinhKey, xuongKey, tinhTrangKey, tinhTrangIpoKey, phanLoaiKey]);

  // Dữ liệu cho biểu đồ "Cơ cấu đơn hàng": áp mọi bộ lọc tổng TRỪ Khách hàng / Khu vực dự án /
  // Nhóm sản phẩm — 3 tiêu chí này do chính biểu đồ lọc chéo (mỗi vòng tròn bỏ qua lựa chọn của
  // chính nó để vẫn thấy và đổi được các lát khác).
  const explicitCongTrinhSet = useMemo(() => toFilterSet(filters.congTrinh), [filters.congTrinh]);
  const crossFilterBaseData = useMemo(() => {
    return (crossFilterSourceData ?? productionData).filter(row =>
      matchesFilter(explicitCongTrinhSet, row, congTrinhKey) &&
      matchesFilter(xuongSet, row, xuongKey) &&
      matchesFilter(tinhTrangSet, row, tinhTrangKey) &&
      matchesFilter(tinhTrangIpoSet, row, tinhTrangIpoKey)
    );
  }, [crossFilterSourceData, productionData, explicitCongTrinhSet, xuongSet, tinhTrangSet, tinhTrangIpoSet, congTrinhKey, xuongKey, tinhTrangKey, tinhTrangIpoKey]);

  // Dataset riêng cho biểu đồ "TÌNH TRẠNG ĐƠN HÀNG AATN" (funnel) — LUÔN cố định
  // Tình Trạng IPO = "01. ĐANG SẢN XUẤT", chỉ ăn Công trình (+ Khách hàng/Khu vực dự án) + Khu vực SX + Nhóm SP.
  const funnelProductionData = useMemo(() => {
    return productionData.filter(row =>
      matchesFilter(congTrinhSet, row, congTrinhKey) &&
      matchesFilter(xuongSet, row, xuongKey) &&
      matchesCategory(phanLoaiSet, row, phanLoaiKey) &&
      !!tinhTrangIpoKey && String(row[tinhTrangIpoKey] || '').trim() === FUNNEL_FIXED_TINH_TRANG_IPO
    );
  }, [productionData, congTrinhSet, xuongSet, phanLoaiSet, congTrinhKey, xuongKey, phanLoaiKey, tinhTrangIpoKey]);

  // Dataset riêng cho bảng "Tình trạng đơn hàng theo Công trình" (v2) — CHỈ ăn Công trình
  // (+ Khách hàng/Khu vực dự án) + Khu vực SX + Nhóm SP, KHÔNG áp dụng Tình Trạng / Tình Trạng IPO.
  const projectSummaryProductionData = useMemo(() => {
    return productionData.filter(row =>
      matchesFilter(congTrinhSet, row, congTrinhKey) &&
      matchesFilter(xuongSet, row, xuongKey) &&
      matchesCategory(phanLoaiSet, row, phanLoaiKey)
    );
  }, [productionData, congTrinhSet, xuongSet, phanLoaiSet, congTrinhKey, xuongKey, phanLoaiKey]);

  const filteredMaterialData = useMemo(() => {
    return materialData.filter(row => matchesFilter(congTrinhSet, row, matCongTrinhKey));
  }, [materialData, congTrinhSet, matCongTrinhKey]);

  const displayedMaterialData = useMemo(() => {
    if (selectedMaterialGroups.length === 0) return filteredMaterialData;
    const groupSet = new Set(selectedMaterialGroups);
    return filteredMaterialData.filter(row => {
      const group = String(row[matNhomVtKey!] || 'Chưa phân nhóm').trim();
      return groupSet.has(group);
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
    crossFilterBaseData,
    filteredMaterialData,
    displayedMaterialData,

    selectedMaterialGroups,
    setSelectedMaterialGroups,
    toggleMaterialGroup,
  };
}

export type UseDashboardFiltersResult = ReturnType<typeof useDashboardFilters>;