import { useDeferredValue, useMemo, useState } from 'react';
import { DataRow } from '../../../types';
import { toFilterSet, toProjectSet, matchesProject } from '../utils/filterMatch';
import {
  DEFAULT_FILTERS, tinhScopedProjects, tinhEffectiveCongTrinh, locFiltered, locCrossFilterBase, locFunnel,
  type DashboardFiltersState, type TapLoc, type TongQuanSanXuat,
} from '../core/tongQuanSanXuat';

// Phần lọc theo bảng sản xuất nằm ở core/tongQuanSanXuat.ts (dùng chung với máy chủ tính sẵn màn đầu)
export type { DashboardFiltersState } from '../core/tongQuanSanXuat';

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
  /**
   * Khách hàng / Khu vực dự án đang chọn khi trang tự giữ 2 bộ lọc này ngoài `filters`
   * (hiện không trang nào truyền). Dùng để lọc dữ liệu sản xuất THEO TỪNG HẠNG MỤC.
   */
  rowKhachHang?: string[];
  rowKhuVucDuAn?: string[];

  matCongTrinhKey: string | undefined;
  matNhomVtKey: string | undefined;

  /**
   * true = mọi phần lọc / tính phía sau dùng bản `filters` hoãn (useDeferredValue): ô chọn bộ lọc đổi ngay,
   * số liệu cập nhật ngay sau ở nền (isFilterPending = true trong lúc chờ). Kết quả cuối không đổi.
   */
  deferCalc?: boolean;
  /**
   * Số máy chủ tính sẵn (khi CHƯA có bảng sản xuất): tập công trình theo Khách hàng / Khu vực dự án lấy từ đây để
   * các API khác (thẻ báo cáo, tồn kho…) vẫn lọc đúng. Có bảng thì tự tính như cũ.
   */
  sanTuMayChu?: TongQuanSanXuat | null;
}

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
  rowKhachHang,
  rowKhuVucDuAn,
  matCongTrinhKey,
  matNhomVtKey,
  deferCalc = false,
  sanTuMayChu = null,
}: UseDashboardFiltersParams) {

  const [filters, setFilters] = useState<DashboardFiltersState>(DEFAULT_FILTERS);
  // Bộ lọc dùng để TÍNH (hoãn khi deferCalc); `filters` vẫn là giá trị mới nhất cho ô chọn trên giao diện
  const deferredFilters = useDeferredValue(filters);
  const appliedFilters = deferCalc ? deferredFilters : filters;
  const isFilterPending = appliedFilters !== filters;
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
  const dungMayChu = productionData.length === 0 && !!sanTuMayChu;
  const scopedProjects = useMemo<Set<string> | null>(
    () => (dungMayChu
      ? (sanTuMayChu!.scopedProjects ? new Set(sanTuMayChu!.scopedProjects) : null)
      : tinhScopedProjects(productionData, appliedFilters.khachHang, appliedFilters.khuVucDuAn, congTrinhKey, khachHangKey, khuVucDuAnKey)),
    [dungMayChu, sanTuMayChu, productionData, appliedFilters.khachHang, appliedFilters.khuVucDuAn, congTrinhKey, khachHangKey, khuVucDuAnKey]);

  // Danh sách công trình thực sự áp dụng = (công trình đã chọn) giao (công trình thuộc khách hàng/khu vực)
  const effectiveCongTrinh = useMemo<string[]>(
    () => tinhEffectiveCongTrinh(scopedProjects, appliedFilters.congTrinh),
    [scopedProjects, appliedFilters.congTrinh]);

  // Bản `filters` dành cho các hook/section phía sau (chỉ khác ở congTrinh)
  const effectiveFilters = useMemo<DashboardFiltersState>(
    () => ({ ...appliedFilters, congTrinh: effectiveCongTrinh }),
    [appliedFilters, effectiveCongTrinh]
  );

  // Tập giá trị lọc (Set) tạo 1 lần cho mỗi lần đổi bộ lọc, thay vì Array.includes cho
  // từng dòng (~51k dòng sản xuất × số giá trị đã chọn). null = không lọc theo tiêu chí đó.
  const congTrinhSet = useMemo(() => toFilterSet(effectiveCongTrinh), [effectiveCongTrinh]);
  const xuongSet = useMemo(() => toFilterSet(appliedFilters.xuong), [appliedFilters.xuong]);
  const tinhTrangSet = useMemo(() => toFilterSet(appliedFilters.tinhTrang), [appliedFilters.tinhTrang]);
  const tinhTrangIpoSet = useMemo(() => toFilterSet(appliedFilters.tinhTrangIpo), [appliedFilters.tinhTrangIpo]);
  const phanLoaiSet = useMemo(() => toFilterSet(appliedFilters.phanLoai), [appliedFilters.phanLoai]);

  // Lọc Khách hàng / Khu vực dự án THEO TỪNG HẠNG MỤC cho dữ liệu sản xuất (phễu, bảng, danh sách HEX
  // khớp đúng số hạng mục của biểu đồ tròn "Nhóm đơn hàng"). Các phần lấy từ API (nhập/xuất/tồn kho...)
  // vẫn lọc theo công trình qua effectiveFilters.congTrinh.
  const rowKhSet = useMemo(() => toFilterSet(rowKhachHang ?? appliedFilters.khachHang), [rowKhachHang, appliedFilters.khachHang]);
  const rowKvSet = useMemo(() => toFilterSet(rowKhuVucDuAn ?? appliedFilters.khuVucDuAn), [rowKhuVucDuAn, appliedFilters.khuVucDuAn]);
  const explicitCongTrinhSet = useMemo(() => toFilterSet(appliedFilters.congTrinh), [appliedFilters.congTrinh]);
  const tap = useMemo<TapLoc>(
    () => ({ congTrinhSet, explicitCongTrinhSet, xuongSet, tinhTrangSet, tinhTrangIpoSet, phanLoaiSet, rowKhSet, rowKvSet }),
    [congTrinhSet, explicitCongTrinhSet, xuongSet, tinhTrangSet, tinhTrangIpoSet, phanLoaiSet, rowKhSet, rowKvSet]);
  const khoaLoc = useMemo(
    () => ({ congTrinhKey, xuongKey, tinhTrangKey, tinhTrangIpoKey, khachHangKey, khuVucDuAnKey, phanLoaiKey }),
    [congTrinhKey, xuongKey, tinhTrangKey, tinhTrangIpoKey, khachHangKey, khuVucDuAnKey, phanLoaiKey]);

  const filteredProductionData = useMemo(() => locFiltered(productionData, tap, khoaLoc), [productionData, tap, khoaLoc]);

  // Dữ liệu cho biểu đồ "Cơ cấu đơn hàng": áp mọi bộ lọc tổng TRỪ Khách hàng / Khu vực dự án /
  // Nhóm sản phẩm — 3 tiêu chí này do chính biểu đồ lọc chéo (mỗi vòng tròn bỏ qua lựa chọn của
  // chính nó để vẫn thấy và đổi được các lát khác).
  const crossFilterBaseData = useMemo(
    () => locCrossFilterBase(crossFilterSourceData ?? productionData, tap, khoaLoc),
    [crossFilterSourceData, productionData, tap, khoaLoc]);

  // Dataset cho phễu "TÌNH TRẠNG ĐƠN HÀNG AATN" — theo bộ lọc Tình trạng IPO của trang (mặc định
  // 01. ĐANG SẢN XUẤT) như mọi khối khác; không áp ô "Tình trạng" vì phễu chính là phân bổ theo tình trạng.
  const funnelProductionData = useMemo(() => locFunnel(productionData, tap, khoaLoc), [productionData, tap, khoaLoc]);

  const filteredMaterialData = useMemo(() => {
    // Vật tư ghi tên công trình riêng -> so theo tên chuẩn
    const set = toProjectSet(effectiveCongTrinh);
    return materialData.filter(row => matchesProject(set, row, matCongTrinhKey));
  }, [materialData, effectiveCongTrinh, matCongTrinhKey]);

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
    appliedFilters,
    isFilterPending,
    effectiveFilters,
    scopedProjects,
    setFilters,
    hasActiveFilters,
    clearFilters,

    filteredProductionData,
    funnelProductionData,
    crossFilterBaseData,
    filteredMaterialData,
    displayedMaterialData,

    selectedMaterialGroups,
    setSelectedMaterialGroups,
    toggleMaterialGroup,
  };
}

export type UseDashboardFiltersResult = ReturnType<typeof useDashboardFilters>;