import React, { useMemo, useState, useEffect, useRef } from 'react';
import { DataRow, ColumnDefinition } from '../../types';
import { parseVNDate, diffDays } from './../Dashboard/utils/dateHelpers';
import { parseNumber } from './../Dashboard/utils/numberParsers';
import { CheckCircle, Filter, XCircle as CloseIcon, ShoppingCart, BarChart2, AlertTriangle, Target } from 'lucide-react';
import { fetchRevenue2026, type Revenue2026Data } from '../../services/dataService';
import { DashboardFilter } from './../Dashboard/components/shared/DashboardFilter';
import { useColumnKeys } from './../Dashboard/hooks/useColumnKeys';
import { useDashboardOptions } from './../Dashboard/hooks/useDashboardOptions';
import { useDashboardFilters } from './../Dashboard/hooks/useDashboardFilters';
import { useUnifiedTimeFilters } from './../Dashboard/hooks/useUnifiedTimeFilters';
import { useOverviewSummary } from './../Dashboard/hooks/useOverviewSummary';
import { useKhsxSummary } from './../Dashboard/hooks/useKhsxSummary';
import { useStockData } from './../Dashboard/hooks/useStockData';
import { usePivotTables } from './../Dashboard/hooks/usePivotTables';
import { useExportFlows } from './../Dashboard/hooks/useExportFlows';
import { PivotMaterialSummarySection } from './../Dashboard/components/sections/PivotMaterialSummarySection';
import { PivotMaterialStatusSection } from './../Dashboard/components/sections/PivotMaterialStatusSection';
import { MaterialListSection } from './../Dashboard/components/sections/MaterialListSection';
import { ProjectSummarySection } from './../Dashboard/components/sections/ProjectSummarySection';
import { ProjectSummarySection_v2 } from './../Dashboard/components/sections/ProjectSummarySection_v2';
import { PivotProjectSection } from './../Dashboard/components/sections/PivotProjectSection';
import { ContructionRevenueSection, type CustomFunnelItem } from './../Dashboard/components/sections/ContructionRevenueSection';
import { BottleneckSection } from './../Dashboard/components/sections/BottleneckSection';
import { ProductionStatusSection } from './../Dashboard/components/sections/ProductionStatusSection';
import { KhsxPlanActualSection } from './../Dashboard/components/sections/KhsxPlanActualSection';
import { OrderOverviewSection } from './../Dashboard/components/sections/OrderOverviewSection';
import { OrderExportScopeModal } from './../Dashboard/components/modals/OrderExportScopeModal';
import { OrderExportColumnModal } from './../Dashboard/components/modals/OrderExportColumnModal';
import { OverviewExportScopeModal } from './../Dashboard/components/modals/OverviewExportScopeModal';
import { GenericExportScopeModal } from './../Dashboard/components/modals/GenericExportScopeModal';
import { GenericExportColumnModal } from './../Dashboard/components/modals/GenericExportColumnModal';
import { ProductionExportModal } from './../Dashboard/components/modals/ProductionExportModal';
import {
  OnLineStageDetailModal,
  ON_LINE_STAGES,
  TOTAL_STAGE,          // ✅ thêm
  extractStage,
  type StageDetailRow,
} from './../Dashboard/components/modals/OnLineStageDetailModal';
import { HexDetailModal, type HexDetailColumnKeys } from './../Dashboard/components/modals/HexDetailModal';
// File này nằm ở src/components/Construction/ConstructionSampleUnit.tsx,
// util nằm ở src/utils/viewDataConfig.ts -> phải đi lên 2 cấp: ../../utils/...
import { filterByView, getProjectsForView } from './utils/viewDataConfig';

interface ConstructionSampleUnitProps {
  productionData: DataRow[];
  productionColumns: ColumnDefinition[];
  materialData: DataRow[];
  materialColumns: ColumnDefinition[];
  khsxData: DataRow[];
  khsxColumns: ColumnDefinition[];
  inventoryData: DataRow[];
  inventoryColumns: ColumnDefinition[];
  orderData: DataRow[];
  orderColumns: ColumnDefinition[];
  tkbvData: DataRow[];
  tkbvColumns: ColumnDefinition[];
  pthspData: DataRow[];
  pthspColumns: ColumnDefinition[];
  yearlyPlanData: DataRow[];
  yearlyPlanColumns: ColumnDefinition[];
  analysisData: DataRow[];
  analysisColumns: ColumnDefinition[];
  exportData: DataRow[];
  exportColumns: ColumnDefinition[];
  stockData: DataRow[];
  stockColumns: ColumnDefinition[];
  attendanceData: DataRow[];
  attendanceColumns: ColumnDefinition[];
  isSidebarCollapsed: boolean;
}

// Id của view này trong bảng setup (xem CONFIGURABLE_VIEWS trong viewDataConfig.ts).
// Đây là bản "Căn mẫu" — chỉ khác ConstructionRedFlow.tsx ở VIEW_ID này và tiêu đề hiển thị.
const VIEW_ID = 'can-mau' as const;

// ---------------------------------------------------------------------------
// Chi tiết theo Hex cho bảng "Tình trạng đơn hàng theo Công trình" (v2).
// Chỉ khai báo type + label ở module scope (không dùng hook) — an toàn.
// ---------------------------------------------------------------------------
type HexDetailColumn = 'totalOrder' | 'afterCancel' | 'inventory' | 'notDeployed' | 'onLine' | 'remaining';

const HEX_COLUMN_LABELS: Record<HexDetailColumn, string> = {
  totalOrder: 'Tổng Giá Trị Đơn Hàng',
  afterCancel: 'Tổng Giá Trị Đơn Hàng Sau Khi Hủy',
  inventory: 'Tổng Giá Trị Đã Nhập Kho',
  notDeployed: 'Chưa Triển Khai (P001)',
  onLine: 'Đang Trên Chuyền (P002->P021)',
  remaining: 'Tổng Giá Trị Đơn Hàng Còn Lại',
};

const isHexDetailColumn = (column: string): column is HexDetailColumn =>
  column in HEX_COLUMN_LABELS;

// ---------------------------------------------------------------------------
// MỚI: Ánh xạ từ mã bước trong Phễu (BOP: P001, P002... đến P021/GCVT) sang
// cột/giai đoạn tương ứng trong dữ liệu hex gốc (hexRowsByColumn), để bấm vào
// 1 con số trong bảng pivot của "Chi tiết dữ liệu Phễu" mở tiếp được modal
// "Chi tiết theo Hex" — giống hệt cách modal "Đang trên chuyền theo giai đoạn"
// đang làm.
//
// - P001 (Tổng đơn hàng nhà máy còn lại) ứng với cột "notDeployed" (các dòng
//   có Tình Trạng = "15. CHƯA TRIỂN KHAI").
// - P002 -> P021, GCVT ứng với cột "onLine", lọc thêm theo đúng mã BOP đó
//   (dùng field `stage` sẵn có trong state hexDetail).
// - P022 (TỒN KHO) lấy dữ liệu từ nguồn khác (tồn kho theo công trình, không
//   nằm trong filteredProductionData) nên KHÔNG có dữ liệu hex gốc để xem chi
//   tiết -> bỏ qua, không mở modal khi bấm vào số của bước này.
// ---------------------------------------------------------------------------
const FUNNEL_TO_HEX_TARGET: Partial<Record<string, { column: HexDetailColumn; stage: string | null }>> = {
  P001: { column: 'notDeployed', stage: null },
  P002: { column: 'onLine', stage: 'P002' },
  P012: { column: 'onLine', stage: 'P012' },
  P013: { column: 'onLine', stage: 'P013' },
  GCVT: { column: 'onLine', stage: 'GCVT' },
  P014: { column: 'onLine', stage: 'P014' },
  P016: { column: 'onLine', stage: 'P016' },
  P018: { column: 'onLine', stage: 'P018' },
  P020: { column: 'onLine', stage: 'P020' },
  P021: { column: 'onLine', stage: 'P021' },
};

/**
 * Xác định (column, stage, projectName) cần dùng cho HexDetailModal khi bấm
 * vào 1 con số trong bảng pivot của Phễu.
 * - Nếu đã chọn 1 bước funnel cụ thể (item != null): bảng đang hiển thị theo
 *   CÔNG TRÌNH -> `name` = tên công trình (hoặc null = dòng TỔNG CỘNG, nghĩa
 *   là xem tất cả công trình của đúng bước đó).
 * - Nếu chưa chọn bước nào (item == null): bảng đang hiển thị TỔNG theo BOP
 *   -> `name` CHÍNH LÀ mã BOP (hoặc null = dòng TỔNG CỘNG, xem tất cả).
 */
function resolveFunnelHexTarget(
  name: string | null,
  item: CustomFunnelItem | null
): { column: HexDetailColumn; stage: string | null; projectName: string | null } | null {
  if (item) {
    if (item.id === 'P022') return null; // Tồn kho: không có dữ liệu hex gốc
    const mapping = FUNNEL_TO_HEX_TARGET[item.id];
    if (!mapping) return null;
    return { column: mapping.column, stage: mapping.stage, projectName: name };
  }
  if (name === null) {
    // Dòng TỔNG CỘNG của bảng theo BOP -> xem tất cả, không lọc thêm.
    return { column: 'totalOrder', stage: null, projectName: null };
  }
  if (name === 'P022') return null;
  const mapping = FUNNEL_TO_HEX_TARGET[name];
  if (!mapping) return null;
  return { column: mapping.column, stage: mapping.stage, projectName: null };
}

const ConstructionSampleUnit: React.FC<ConstructionSampleUnitProps> = ({
  productionData: rawProductionData,
  productionColumns,
  materialData: rawMaterialData,
  materialColumns,
  khsxData: rawKhsxData,
  khsxColumns,
  inventoryData: rawInventoryData,
  inventoryColumns,
  orderData: rawOrderData,
  orderColumns,
  tkbvData: rawTkbvData,
  tkbvColumns,
  pthspData: rawPthspData,
  pthspColumns,
  yearlyPlanData,
  yearlyPlanColumns,
  analysisData: rawAnalysisData,
  analysisColumns,
  exportData: rawExportData,
  exportColumns,
  stockData,
  stockColumns,
  attendanceData,
  attendanceColumns,
  isSidebarCollapsed
}) => {
  // ✅ SỬA: viewProjectWhitelist phải nằm BÊN TRONG component (dùng hook useMemo hợp lệ),
  // và đặt sau khi VIEW_ID đã ở trong scope (VIEW_ID là hằng số module-level ở trên, luôn
  // sẵn sàng tại đây — không còn lỗi "used before declaration" như bản cũ đặt ở top-level).
  const viewProjectWhitelist = useMemo(
    () => getProjectsForView(VIEW_ID),
    []
  );

  const factoryRevenueRef = useRef<HTMLDivElement>(null);
  const productionStatusRef = useRef<HTMLDivElement>(null);
  const pivotWorkshopRef = useRef<HTMLDivElement>(null);
  const pivotProjectRef = useRef<HTMLDivElement>(null);
  const pivotMaterialRef = useRef<HTMLDivElement>(null);
  const pivotMaterialStatusRef = useRef<HTMLDivElement>(null);
  const materialListRef = useRef<HTMLDivElement>(null);
  const khsxSectionRef = useRef<HTMLDivElement>(null);
  const inventorySectionRef = useRef<HTMLDivElement>(null);
  // ✅ 2 bảng "Tình trạng đơn hàng theo Công trình" → mỗi bảng 1 ref riêng
  const projectSummaryRef = useRef<HTMLDivElement>(null);        // bảng mới (v2)
  const projectSummaryLegacyRef = useRef<HTMLDivElement>(null);  // bảng cũ
  const orderOverviewRef = useRef<HTMLDivElement>(null);
  const bottleneckSectionRef = useRef<HTMLDivElement>(null);

const {
  hexKey, tinhTrangKey, tinhTrangIpoKey, valueKey, realValueKey, congTrinhKey,
  xuongKey, hangMucKey, daysAtCurrentStageKey, phanLoaiNhomSanPhamKey, bopKey, triGiaDonHangTongKey, // ✅ thêm phanLoaiNhomSanPhamKey
  thanhTienTinhPhieuKey, thanhTienNhapKhoKey,
    matCongTrinhKey, matNhomVtKey, matSlYeuCauKey, matSlDaNhanKey, matStatusKey,
    matStatusSapKey, matEstDateKey,
    khsxXuongKey, khsxCongTrinhKey, khsxNamKey, khsxThangKey, khsxNgayKey, khsxTuanKey,
    invThanhTienKey, invXuongKey, invCongTrinhKey, invNamKey, invThangKey,
    invNgayKey, invDateKey, invTuanKey,
    expThanhTienKey, expDateKey, expXuongKey, expCongTrinhKey,
    stockDateKey, stockValueKey, stockSapIdKey,
    orderDateKey, orderValueKey, orderXuongKey, orderCongTrinhKey,
    tkbvDateKey, tkbvValueKey, tkbvXuongKey, tkbvCongTrinhKey,
    pthspDateKey, pthspValueKey, pthspXuongKey, pthspCongTrinhKey,
    analysisXuongKey, analysisCongTrinhKey, analysisPlanKey, analysisActualKey,
    analysisWeekKey, analysisDungKhKey, analysisThucHienDungKh1PhanKey,
    analysisRotKhKey, analysisThucHienRotKh1PhanKey, analysisNhapKhoTruocKhKey,
    analysisVuotKhKey, analysisNhapKhoNgoaiKhKey,
    attXuongKey, attSoLuongCnKey, attGioCongHcKey, attGioCongTcKey, attTuanKey,
    attNamKey, attThangKey, attNgayKey, attDinhBienKey,
  } = useColumnKeys({
    productionColumns, materialColumns, khsxColumns, inventoryColumns,
    exportColumns, stockColumns, orderColumns, tkbvColumns, pthspColumns,
    analysisColumns, attendanceColumns,
  });

  // ------------------------------------------------------------------------------
  // LỌC TOÀN BỘ DỮ LIỆU THEO DANH SÁCH CÔNG TRÌNH ĐÃ SETUP CHO VIEW "can-mau"
  // ------------------------------------------------------------------------------
  const productionData = useMemo(
    () => filterByView(rawProductionData, congTrinhKey, VIEW_ID),
    [rawProductionData, congTrinhKey]
  );
  const materialData = useMemo(
    () => filterByView(rawMaterialData, matCongTrinhKey, VIEW_ID),
    [rawMaterialData, matCongTrinhKey]
  );
  const khsxData = useMemo(
    () => filterByView(rawKhsxData, khsxCongTrinhKey, VIEW_ID),
    [rawKhsxData, khsxCongTrinhKey]
  );
  const orderData = useMemo(
    () => filterByView(rawOrderData, orderCongTrinhKey, VIEW_ID),
    [rawOrderData, orderCongTrinhKey]
  );
  const inventoryData = useMemo(
    () => filterByView(rawInventoryData, invCongTrinhKey, VIEW_ID),
    [rawInventoryData, invCongTrinhKey]
  );
  const tkbvData = useMemo(
    () => filterByView(rawTkbvData, tkbvCongTrinhKey, VIEW_ID),
    [rawTkbvData, tkbvCongTrinhKey]
  );
  const pthspData = useMemo(
    () => filterByView(rawPthspData, pthspCongTrinhKey, VIEW_ID),
    [rawPthspData, pthspCongTrinhKey]
  );
  const analysisData = useMemo(
    () => filterByView(rawAnalysisData, analysisCongTrinhKey, VIEW_ID),
    [rawAnalysisData, analysisCongTrinhKey]
  );
  const exportData = useMemo(
    () => filterByView(rawExportData, expCongTrinhKey, VIEW_ID),
    [rawExportData, expCongTrinhKey]
  );

  const {
    filters,
    setFilters,
    hasActiveFilters,
    clearFilters,
    filteredProductionData,
    funnelProductionData,          // THÊM
    projectSummaryProductionData,  // THÊM
    filteredMaterialData,
    displayedMaterialData,
    selectedMaterialGroups,
    setSelectedMaterialGroups,
    toggleMaterialGroup,
  } = useDashboardFilters({
    productionData,
    materialData,
    congTrinhKey,
    xuongKey,
    tinhTrangKey,
    tinhTrangIpoKey,
    matCongTrinhKey,
    matNhomVtKey,
  });

  const {
    unifiedTimeFilters,
    setUnifiedTimeFilters,
    viewMode,
    setViewMode,
    filteredInventoryData,
    filteredAnalysisData,
  } = useUnifiedTimeFilters({
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
  });

  const [revenue2026, setRevenue2026] = useState<Revenue2026Data | null>(null);
  const [stockMetric, setStockMetric] = useState<'COUNT' | 'SUM'>('COUNT');

  const selectedRevenueYear = unifiedTimeFilters.nam[0] || String(new Date().getFullYear());

  useEffect(() => {
    fetchRevenue2026(selectedRevenueYear).then(data => { if (data) setRevenue2026(data); });
  }, [selectedRevenueYear]);

  const {
    congTrinhOptions,
    xuongOptions,
    tinhTrangOptions,
    tinhTrangIpoOptions,
    khsxNamOptions,
    khsxThangOptions,
    khsxNgayOptions,
    khsxTuanOptions,
    invNamOptions,
    invThangOptions,
    invNgayOptions,
    invTuanOptions,
    unifiedNamOptions,
    unifiedThangOptions,
    unifiedNgayOptions,
    unifiedTuanOptions,
    unifiedDateOptions,
  } = useDashboardOptions({
    productionData,
    khsxData,
    inventoryData,
    orderData,
    tkbvData,
    pthspData,
    congTrinhKey,
    xuongKey,
    tinhTrangKey,
    tinhTrangIpoKey,
    khsxNamKey,
    khsxThangKey,
    khsxNgayKey,
    khsxTuanKey,
    invNamKey,
    invThangKey,
    invNgayKey,
    invTuanKey,
    orderDateKey,
    tkbvDateKey,
    pthspDateKey,
    invDateKey,
  });

  const {
    overviewSummary,
    overviewDateFilters,
    setOverviewDateFilters,
    overviewMetric,
    setOverviewMetric,
    showDateWarning,
    setShowDateWarning,
    getContextLabel,
    overviewDateRangeDisplay,
    latestUnifiedDate,
    filteredOrderData,
    filteredTkbvData,
    filteredPthspData,
    filteredInventoryOverviewData,
    filteredExportOverviewData,
    mtdOrderData,
    mtdTkbvData,
    mtdPthspData,
    mtdInventoryData,
    mtdExportKhoData,
    groupAnalysisCache,
    loadGroupAnalysis,
    toAnalysisItems,
    getGroupAnalysisFilterKey
  } = useOverviewSummary({
    orderData,
    tkbvData,
    pthspData,
    inventoryData,
    exportData,
    orderDateKey,
    tkbvDateKey,
    pthspDateKey,
    invDateKey,
    expDateKey,
    expCongTrinhKey,
    expXuongKey,
    filters,
    unifiedDateOptions,
    viewProjectWhitelist,
  });

  const {
    khsxSummary,
    totalKhsxAmount,
    totalInventoryAmount,
    completionRate,
    combinedWorkshopData,
    combinedProjectData,
    weeklyPlanVsActualData,
    productivityAnalysisData,
  } = useKhsxSummary({
    unifiedTimeFilters,
    viewMode,
    filters,
    filteredAnalysisData,
    analysisXuongKey, analysisPlanKey, analysisActualKey, analysisWeekKey,
    analysisDungKhKey, analysisThucHienDungKh1PhanKey, analysisRotKhKey,
    analysisThucHienRotKh1PhanKey, analysisNhapKhoTruocKhKey, analysisVuotKhKey,
    analysisNhapKhoNgoaiKhKey,
    attendanceData,
    attXuongKey, attNamKey, attThangKey, attTuanKey, attNgayKey,
    attSoLuongCnKey, attGioCongHcKey, attGioCongTcKey, attDinhBienKey,
    filteredInventoryData, invXuongKey, invThanhTienKey,
  });

  const {
    stockDates,
    stockByProjectData,
    loadStockByProject,
    latestStockDateAvailable,
    closestStockDate,
    mtdStockData,
    filteredStockDataForExport,
    latestStockStats,
    latestStockStatsPrevMonth,
    stockOverviewCardValue,
    stockTotalCount,
  } = useStockData({
    stockData,
    stockDateKey,
    latestUnifiedDate,
    overviewMetric,
    filters,
    viewProjectWhitelist,
  });

  const {
    workshopMetric, setWorkshopMetric,
    projectMetric, setProjectMetric,
    chartMetric, setChartMetric,
    projectSummaryMetric, setProjectSummaryMetric,
    matStatusMetric, setMatStatusMetric,
    excludeFabrics, setExcludeFabrics,
    expandedBops, setExpandedBops,
    bottleneckViewMode, setBottleneckViewMode,

    calculateMetricValue,
    cardMetrics,
    projectStatusSummary,
    projectStatusSummaryV2,     // THÊM
    onLineStageBreakdown,
    onLineStageBreakdownV2,     // THÊM
    hexRowsByColumn,
    hexRowsByColumnV2,          // THÊM
    pivotWorkshopData,
    pivotFunnelData,
    funnelBreakdownByBop,
    customFunnelData,
    pivotProjectData,
    pivotMaterialSummary,
    pivotMaterialStatusData,
    lineChartData,
    bottleneckData,
    topBottlenecks,
  } = usePivotTables({
    filteredProductionData,
    funnelProductionData,          // THÊM
    projectSummaryProductionData,  // THÊM
    filteredMaterialData,
    displayedMaterialData,
    stockDates,
    closestStockDate,
    tinhTrangKey, xuongKey, bopKey, valueKey, realValueKey, hexKey,
    congTrinhKey, hangMucKey, daysAtCurrentStageKey,
    triGiaDonHangTongKey, thanhTienTinhPhieuKey, thanhTienNhapKhoKey,
    matNhomVtKey, matSlYeuCauKey, matSlDaNhanKey, matStatusKey,
    tinhTrangIpoKey, // ✅ MỚI — đồng bộ với ConstructionRedFlow: đảm bảo phễu AATN tính đúng theo Tình Trạng IPO
  });

  const {
    selectedExportColumns, setSelectedExportColumns,
    isProductionExportModalOpen, setIsProductionExportModalOpen,
    isOrderExportScopeModalOpen, setIsOrderExportScopeModalOpen,
    orderExportScope, setOrderExportScope,
    isOrderExportModalOpen, setIsOrderExportModalOpen,
    selectedOrderExportColumns, setSelectedOrderExportColumns,
    genericExportFlow, setGenericExportFlow,
    genericExportScope, setGenericExportScope,
    isGenericExportScopeModalOpen, setIsGenericExportScopeModalOpen,
    isGenericExportColumnModalOpen, setIsGenericExportColumnModalOpen,
    genericExportSelectedColumns, setGenericExportSelectedColumns,
    isOverviewExportScopeModalOpen, setIsOverviewExportScopeModalOpen,
    overviewExportScope, setOverviewExportScope,

    selectedStockExportDates,
    setSelectedStockExportDates,

    effectiveOrderColumns,
    effectiveTkbvColumns,
    effectivePthspColumns,
    effectiveInventoryColumns,
    effectiveExportDataColumns,
    effectiveStockColumns,

    handleExportOverviewSummary,
    handleOpenOverviewExport,
    handleOverviewExportConfirm,
    handleExportGroupAnalysis,
    handleExportStockDetail,
    handleExportProductionStatus,
    handleOpenOrderExport,
    getExportFlowConfig,
    handleOpenGenericExport,
    handleGenericExportContinue,
    handleGenericExportConfirm,
    handleExportBottlenecks,
    selectedExportMonth, setSelectedExportMonth,
  } = useExportFlows({
    orderColumns, orderData,
    tkbvColumns, tkbvData,
    pthspColumns, pthspData,
    inventoryColumns, inventoryData,
    exportColumns, exportData,
    stockColumns, stockData,
    productionColumns,

    orderDateKey,
    tkbvDateKey,
    pthspDateKey,
    invDateKey,
    expDateKey,

    stockDateKey,
    stockDates,
    stockTotalCount,

    overviewSummary,
    overviewDateFilters,
    groupAnalysisCache,
    latestUnifiedDate,

    filteredOrderData,
    filteredTkbvData,
    filteredPthspData,
    filteredInventoryOverviewData,
    filteredExportOverviewData,
    filteredStockDataForExport,
    mtdOrderData,
    mtdTkbvData,
    mtdPthspData,
    mtdInventoryData,
    mtdExportKhoData,
    mtdStockData,
    stockByProjectData,
    closestStockDate,
    stockMetric,
    bottleneckData,
  });

  const scrollToRef = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (ref.current) ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleContinueToOrderColumnStep = () => {
    setIsOrderExportScopeModalOpen(false);
    setSelectedOrderExportColumns(effectiveOrderColumns.map(c => c.key));
    setIsOrderExportModalOpen(true);
  };

  const getMaterialRowClassName = (row: DataRow): string => {
    const status = String(row[matStatusSapKey] || '').toLowerCase();
    if (status.includes('hủy')) return 'bg-gray-100 text-gray-500 italic';
    if (status.includes('hoàn thành') || status.includes('đóng') || status.includes('xong')) return 'bg-green-100 text-green-800';
    if (status.includes('mở') || status.includes('open') || !status) {
      if (matEstDateKey) {
        const dateStr = String(row[matEstDateKey] || '');
        const date = parseVNDate(dateStr);
        if (date) {
          const diff = diffDays(date, new Date());
          if (diff < 0) return 'bg-red-100 text-yellow-700 font-bold';
          if (diff === 0) return 'bg-orange-200 text-orange-800 animate-pulse font-bold';
          if (diff >= 1 && diff <= 5) return 'bg-yellow-50 text-slate-700';
          if (diff > 5) return 'bg-yellow-200 text-slate-700';
        }
      }
    }
    return 'bg-white hover:bg-slate-50';
  };

  const targetRevenue2026 = revenue2026?.targetRevenue2026 ?? 0;
  const quarterlyTargets = revenue2026?.quarterlyTargets ?? { q1: 0, q2: 0, q3: 0, q4: 0 };
  const factoryRevenueStats = {
    actual: revenue2026?.actual.value ?? 0,
    percent: revenue2026?.actual.percent ?? 0,
  };
  const yearlyPlan2026WorkshopChartData = revenue2026?.byWorkshop ?? [];

  const factoryRevenueChartData = useMemo(() => [{
    name: 'Năm 2026',
    thucHien: factoryRevenueStats.actual,
    conLai: Math.max(0, targetRevenue2026 - factoryRevenueStats.actual),
    fullTarget: targetRevenue2026,
  }], [factoryRevenueStats.actual, targetRevenue2026]);

  // ✅ MỚI (đồng bộ từ ConstructionRedFlow): Gộp "Xuất kho" theo công trình từ
  // exportData (đã filter theo view) để đưa vào cột "exported" của bảng tổng
  // hợp đơn hàng, thay vì hardcode 0.
  // - VALUE: tổng thanh_tien_xuat_kho / 1000 — quy về cùng thang (nghìn -> để
  //   khớp cách totalOrder/inventory đang chia /1000 ở usePivotTables).
  // - COUNT: đếm số dòng có giá trị xuất kho > 0 (số hạng mục đã xuất).
  const exportedByProject = useMemo(() => {
    const map = new Map<string, number>();
    if (!expCongTrinhKey) return map;
    const isCount = projectSummaryMetric === 'COUNT';

    exportData.forEach(row => {
      const name = String(row[expCongTrinhKey] || '').trim().toUpperCase();
      if (!name) return;
      const raw = parseNumber(row[expThanhTienKey]);
      const val = isCount ? (raw > 0 ? 1 : 0) : (raw / 1000);
      map.set(name, (map.get(name) || 0) + val);
    });

    return map;
  }, [exportData, expCongTrinhKey, expThanhTienKey, projectSummaryMetric]);

  // ✅ MỚI: xem chi tiết theo Công trình khi bấm vào 1 bước funnel
  const [activeFunnelItem, setActiveFunnelItem] = useState<CustomFunnelItem | null>(null);

  // P022. TỒN KHO lấy dữ liệu từ stockByProjectData (không nằm trong
  // filteredProductionData/bopKey như các bước khác) -> cần fetch riêng khi
  // user chọn bước này, vì loadStockByProject không tự chạy.
  useEffect(() => {
    if (activeFunnelItem?.id === 'P022') {
      loadStockByProject();
    }
  }, [activeFunnelItem, loadStockByProject]);

  const activeFunnelPivotData = useMemo(() => {
    if (!activeFunnelItem) return pivotFunnelData; // chưa chọn bước nào -> giữ tổng theo BOP như cũ

    if (activeFunnelItem.id === 'P022') {
      return {
        data: stockByProjectData,
        total: stockByProjectData.reduce((sum, r) => sum + r.value, 0),
      };
    }

    return funnelBreakdownByBop[activeFunnelItem.id] ?? { data: [], total: 0 };
  }, [activeFunnelItem, pivotFunnelData, funnelBreakdownByBop, stockByProjectData]);

  // ✅ SỬA (đồng bộ từ ConstructionRedFlow): Adapter chuyển projectStatusSummary
  // (kiểu cũ) sang kiểu của ProjectSummarySection_v2, dùng dữ liệu thật cho
  // "cancelled" (từ projectStatusSummaryV2) và "exported" (từ exportedByProject)
  // thay vì hardcode 0.
  const projectOrderSummary = useMemo(
    () =>
      projectStatusSummaryV2.map(row => {
        const cancelled = row.cancelled;
        const exported = exportedByProject.get(row.name.trim().toUpperCase()) || 0;
        const notDeployed = row.notDeployed;
        const onLine = row.inProduction;
        return {
          name: row.name,
          totalOrder: row.totalOrder,
          cancelled,
          afterCancel: row.totalOrder - cancelled,
          inventory: row.inventory,
          exported,
          notDeployed,
          onLine,
          remaining: notDeployed + onLine,
        };
      }),
    [projectStatusSummaryV2, exportedByProject]
  );

  // ✅ MỚI: Chi tiết "Đang trên chuyền P002->P021": bấm vào số ở cột này để mở modal.
  // projectName = null nghĩa là bấm từ dòng TỔNG CỘNG (xem tất cả công trình).
  const [onLineDetail, setOnLineDetail] = useState<{ open: boolean; projectName: string | null }>({
    open: false,
    projectName: null,
  });

  const onLineStageRows = useMemo<StageDetailRow[]>(() => {
    if (!onLineDetail.open) return [];

    const names = onLineDetail.projectName
      ? [onLineDetail.projectName]
      : projectStatusSummaryV2.map(r => r.name);  // SỬA

    return names.map(name => {
      const stageValues = onLineStageBreakdownV2[name.trim()] ?? {};  // SỬA
      const values: Record<string, number> = {};
      ON_LINE_STAGES.forEach(stage => {
        values[stage] = stageValues[stage] ?? 0;
      });
      return { name, values };
    });
  }, [onLineDetail, onLineStageBreakdownV2, projectStatusSummaryV2]);  // SỬA

  // -------------------------------------------------------------------------
  // Chi tiết theo Hex cho bảng "Tình trạng đơn hàng theo Công trình" (v2).
  // Bấm vào bất kỳ số nào trong 6 cột có dữ liệu thật sẽ mở modal liệt kê
  // từng hex gốc đứng sau con số đó. projectName = null nghĩa là bấm từ dòng
  // TỔNG CỘNG (xem tất cả công trình). Nếu bấm từ 1 ô trong modal "Đang trên
  // chuyền theo giai đoạn" thì stage sẽ được set kèm để lọc thêm.
  // -------------------------------------------------------------------------
  const [hexDetail, setHexDetail] = useState<{
    open: boolean;
    column: HexDetailColumn | null;
    projectName: string | null;
    stage: string | null;
  }>({ open: false, column: null, projectName: null, stage: null });

const hexDetailRows = useMemo(() => {
  if (!hexDetail.open || !hexDetail.column) return [];
  let source = hexRowsByColumnV2[hexDetail.column] ?? [];
  if (hexDetail.projectName && congTrinhKey) {
    source = source.filter(row => String(row[congTrinhKey] || '').trim() === hexDetail.projectName);
  }
  // ✅ TOTAL_STAGE = tất cả công đoạn P002->P021 -> không lọc thêm theo stage
  if (hexDetail.stage && hexDetail.stage !== TOTAL_STAGE && bopKey) {
    source = source.filter(row => extractStage(row[bopKey]) === hexDetail.stage);
  }
  return source;
}, [hexDetail, hexRowsByColumnV2, congTrinhKey, bopKey]);

const hexDetailColumnKeys: HexDetailColumnKeys = useMemo(
  () => ({
    hexKey, congTrinhKey, hangMucKey, xuongKey, bopKey, tinhTrangKey,
    phanLoaiNhomSanPhamKey, triGiaDonHangTongKey, thanhTienTinhPhieuKey, thanhTienNhapKhoKey, // ✅ thay daysAtCurrentStageKey
  }),
  [
    hexKey, congTrinhKey, hangMucKey, xuongKey, bopKey, tinhTrangKey,
    phanLoaiNhomSanPhamKey, triGiaDonHangTongKey, thanhTienTinhPhieuKey, thanhTienNhapKhoKey,
  ]
);

  // ✅ MỚI: bấm vào số trong bảng pivot của "Chi tiết dữ liệu Phễu" -> mở
  // HexDetailModal đúng cột/giai đoạn tương ứng (xem FUNNEL_TO_HEX_TARGET và
  // resolveFunnelHexTarget ở đầu file).
  const handleFunnelPivotValueClick = (name: string | null, item: CustomFunnelItem | null) => {
    const target = resolveFunnelHexTarget(name, item);
    if (!target) return; // vd. bước P022 (Tồn kho) không có dữ liệu hex gốc
    setHexDetail({ open: true, column: target.column, projectName: target.projectName, stage: target.stage });
  };

  if (productionData.length === 0 && materialData.length === 0 && khsxData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        Chưa có công trình nào được setup cho view này. Vào Công trình → Setup phân loại để chọn công trình.
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-y-auto h-full custom-scrollbar pb-24 bg-wood-50">
      {showDateWarning && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[9999] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-4 bg-white border-2 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)] rounded-2xl px-6 py-4 min-w-[340px]">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center animate-pulse">
              <AlertTriangle size={24} className="text-red-600" />
            </div>
            <div className="flex-1">
              <p className="text-base font-bold text-red-600">Vui lòng chọn ít nhất 1 ngày báo cáo</p>
            </div>
            <button
              onClick={() => setShowDateWarning(false)}
              className="flex-shrink-0 p-1 text-gray-400 hover:text-red-600 transition-colors"
            >
              <CloseIcon size={20} />
            </button>
          </div>
        </div>
      )}
      <div className="sticky top-0 z-40 bg-wood-50/95 backdrop-blur-sm border-b border-wood-200 px-4 py-3 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Căn mẫu</h2>
            </div>
            <div className="flex gap-2">
              <button onClick={() => scrollToRef(factoryRevenueRef)} className="p-1.5 text-xs bg-white border border-slate-200 rounded hover:bg-wood-50 text-slate-600 flex items-center gap-1 shadow-sm" title="Đến Doanh số nhà máy">
                <Target size={14} className="text-emerald-600" /> Doanh số
              </button>
              <button onClick={() => scrollToRef(orderOverviewRef)} className="p-1.5 text-xs bg-white border border-slate-200 rounded hover:bg-wood-50 text-slate-600 flex items-center gap-1 shadow-sm" title="Đến Tổng quan Đơn hàng">
                <ShoppingCart size={14} className="text-pink-600" /> Tổng quan
              </button>
              <button onClick={() => scrollToRef(productionStatusRef)} className="p-1.5 text-xs bg-white border border-slate-200 rounded hover:bg-wood-50 text-slate-600 flex items-center gap-1 shadow-sm" title="Đến Tình trạng sản xuất">
                <CheckCircle size={14} className="text-emerald-600" /> Tình trạng sản xuất
              </button>
              <button onClick={() => scrollToRef(bottleneckSectionRef)} className="p-1.5 text-xs bg-white border border-slate-200 rounded hover:bg-wood-50 text-slate-600 flex items-center gap-1 shadow-sm" title="Đến Báo cáo Điểm nghẽn">
                <AlertTriangle size={14} className="text-red-600" /> Điểm nghẽn
              </button>
              <button onClick={() => scrollToRef(khsxSectionRef)} className="p-1.5 text-xs bg-white border border-slate-200 rounded hover:bg-wood-50 text-slate-600 flex items-center gap-1 shadow-sm" title="Đến Kế hoạch & Nhập kho">
                <BarChart2 size={14} className="text-indigo-600" /> Kế hoạch-Thực hiện
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center w-full md:w-auto justify-end">
            <div className="flex items-center gap-2 mr-1 text-slate-500">
              <Filter size={14} /> <span className="text-[10px] uppercase font-bold">Bộ lọc tổng:</span>
            </div>
            {congTrinhKey && (
              <DashboardFilter
                label="Tên Công Trình"
                options={congTrinhOptions}
                selectedValues={filters.congTrinh}
                onChange={(vals) => setFilters(prev => ({ ...prev, congTrinh: vals }))}
              />
            )}
            {xuongKey && (
              <DashboardFilter
                label="Khu Vực Sản Xuất"
                options={xuongOptions}
                selectedValues={filters.xuong}
                onChange={(vals) => setFilters(prev => ({ ...prev, xuong: vals }))}
              />
            )}
            {tinhTrangIpoKey && (
              <DashboardFilter
                label="Tình Trạng IPO"
                options={tinhTrangIpoOptions}
                selectedValues={filters.tinhTrangIpo}
                onChange={(vals) => setFilters(prev => ({ ...prev, tinhTrangIpo: vals }))}
              />
            )}
            {tinhTrangKey && (
              <DashboardFilter
                label="Tình Trạng"
                options={tinhTrangOptions}
                selectedValues={filters.tinhTrang}
                onChange={(vals) => setFilters(prev => ({ ...prev, tinhTrang: vals }))}
              />
            )}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Xóa bộ lọc"
              >
                <CloseIcon size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 space-y-6">

        {/* ✅ BẢNG MỚI (v2): dùng dữ liệu đã qua adapter projectOrderSummary */}
        <ProjectSummarySection_v2
          sectionRef={projectSummaryRef}
          projectStatusSummary={projectOrderSummary}
          priorityOrder={viewProjectWhitelist}   // ✅ thêm dòng này
          clickableColumns={['totalOrder', 'afterCancel', 'inventory', 'notDeployed', 'onLine', 'remaining']}
          onCellClick={({ projectName, column }) => {
            if (column === 'onLine') {
              setOnLineDetail({ open: true, projectName });
              return;
            }
            if (isHexDetailColumn(column)) {
              setHexDetail({ open: true, column, projectName, stage: null });
            }
          }}
          projectSummaryMetric={projectSummaryMetric}
          setProjectSummaryMetric={setProjectSummaryMetric}
        />

        <ContructionRevenueSection
          sectionRef={factoryRevenueRef}
          targetRevenue2026={targetRevenue2026}
          factoryRevenueStats={factoryRevenueStats}
          customFunnelData={customFunnelData}
          pivotFunnelData={activeFunnelPivotData}
          workshopMetric={workshopMetric}
          useDetailedNumbers={true}
          onFunnelItemClick={setActiveFunnelItem}
          onFunnelModalClose={() => setActiveFunnelItem(null)}
          onPivotValueClick={handleFunnelPivotValueClick}
        />

        <OrderOverviewSection
          sectionRef={orderOverviewRef}
          isSidebarCollapsed={isSidebarCollapsed}
          hasAnyData={orderData.length > 0 || tkbvData.length > 0 || pthspData.length > 0}
          filters={filters}
          viewProjectWhitelist={viewProjectWhitelist}
          useDetailedNumbers={true}
          overviewMetric={overviewMetric}
          setOverviewMetric={setOverviewMetric}
          getContextLabel={getContextLabel}
          overviewDateRangeDisplay={overviewDateRangeDisplay}
          unifiedDateOptions={unifiedDateOptions}
          overviewDateFilters={overviewDateFilters}
          setOverviewDateFilters={setOverviewDateFilters}
          setShowDateWarning={setShowDateWarning}
          handleOpenOverviewExport={handleOpenOverviewExport}
          overviewSummary={overviewSummary}
          latestUnifiedDate={latestUnifiedDate}
          closestStockDate={closestStockDate}
          stockOverviewCardValue={stockOverviewCardValue}
          latestStockStats={latestStockStats}
          latestStockStatsPrevMonth={latestStockStatsPrevMonth}
          stockByProjectData={stockByProjectData}
          groupAnalysisCache={groupAnalysisCache}
          toAnalysisItems={toAnalysisItems}
          loadGroupAnalysis={loadGroupAnalysis}
          handleOpenOrderExport={handleOpenOrderExport}
          handleOpenGenericExport={handleOpenGenericExport}
          loadStockByProject={loadStockByProject}
          getGroupAnalysisFilterKey={getGroupAnalysisFilterKey}
        />

        <ProductionStatusSection
          sectionRef={productionStatusRef}
          pivotWorkshopRef={pivotWorkshopRef}
          cardMetrics={cardMetrics}
          pivotWorkshopData={pivotWorkshopData}
          workshopMetric={workshopMetric}
          setWorkshopMetric={setWorkshopMetric}
          expandedBops={expandedBops}
          setExpandedBops={setExpandedBops}
          handleExportProductionStatus={handleExportProductionStatus}
        />
        <BottleneckSection
          sectionRef={bottleneckSectionRef}
          bottleneckData={bottleneckData}
          topBottlenecks={topBottlenecks}
          bottleneckViewMode={bottleneckViewMode}
          setBottleneckViewMode={setBottleneckViewMode}
          handleExportBottlenecks={handleExportBottlenecks}
        />

        <KhsxPlanActualSection
          sectionRef={khsxSectionRef}
          inventorySectionRef={inventorySectionRef}
          khsxDataLength={khsxData.length}
          inventoryDataLength={inventoryData.length}
          unifiedTimeFilters={unifiedTimeFilters}
          setUnifiedTimeFilters={setUnifiedTimeFilters}
          viewMode={viewMode}
          setViewMode={setViewMode}
          unifiedNamOptions={unifiedNamOptions}
          unifiedThangOptions={unifiedThangOptions}
          unifiedTuanOptions={unifiedTuanOptions}
          unifiedNgayOptions={unifiedNgayOptions}
          totalKhsxAmount={totalKhsxAmount}
          completionRate={completionRate}
          totalInventoryAmount={totalInventoryAmount}
          combinedWorkshopData={combinedWorkshopData}
          combinedProjectData={combinedProjectData}
          weeklyPlanVsActualData={weeklyPlanVsActualData}
          productivityAnalysisData={productivityAnalysisData}
          yearlyPlan2026WorkshopChartData={yearlyPlan2026WorkshopChartData}
          selectedRevenueYearLabel={revenue2026?.year ? String(revenue2026.year) : selectedRevenueYear}
        />

        {/* ✅ BẢNG CŨ: giữ dữ liệu cũ (projectStatusSummary), dùng ref riêng */}
        <ProjectSummarySection
          sectionRef={projectSummaryLegacyRef}
          projectStatusSummary={projectStatusSummary}
          projectSummaryMetric={projectSummaryMetric}
          setProjectSummaryMetric={setProjectSummaryMetric}
        />

        <PivotProjectSection
          sectionRef={pivotProjectRef}
          pivotProjectData={pivotProjectData}
          projectMetric={projectMetric}
          setProjectMetric={setProjectMetric}
          excludeFabrics={excludeFabrics}
          setExcludeFabrics={setExcludeFabrics}
        />

  

    <PivotMaterialStatusSection
  sectionRef={pivotMaterialStatusRef}   // ✅ đổi từ materialStatusRef
  pivotMaterialStatusData={pivotMaterialStatusData}
  matStatusMetric={matStatusMetric}
  setMatStatusMetric={setMatStatusMetric}
  selectedMaterialGroups={selectedMaterialGroups}
  setSelectedMaterialGroups={setSelectedMaterialGroups}
  toggleMaterialGroup={toggleMaterialGroup}
/>
        <MaterialListSection
          sectionRef={materialListRef}
          displayedMaterialData={displayedMaterialData}
          getMaterialRowClassName={getMaterialRowClassName}
        />

      </div>

      <OnLineStageDetailModal
        isOpen={onLineDetail.open}
        onClose={() => setOnLineDetail(prev => ({ ...prev, open: false }))}
        projectName={onLineDetail.projectName}
        metric={projectSummaryMetric === 'VALUE' ? 'VALUE' : 'COUNT'}
        rows={onLineStageRows}
        onValueClick={(projectName, stage) =>
          setHexDetail({ open: true, column: 'onLine', projectName, stage })
        }
      />

      <HexDetailModal
        isOpen={hexDetail.open}
        onClose={() => setHexDetail(prev => ({ ...prev, open: false }))}
        title={
  hexDetail.column
    ? HEX_COLUMN_LABELS[hexDetail.column] +
      (hexDetail.stage && hexDetail.stage !== TOTAL_STAGE ? ` – ${hexDetail.stage}` : '')
    : ''
}
        projectName={hexDetail.projectName}
        rows={hexDetailRows}
        columnKeys={hexDetailColumnKeys}
      />

      <ProductionExportModal
        isOpen={isProductionExportModalOpen}
        onClose={() => setIsProductionExportModalOpen(false)}
        productionColumns={productionColumns}
        selectedExportColumns={selectedExportColumns}
        setSelectedExportColumns={setSelectedExportColumns}
        filteredProductionData={filteredProductionData}
      />

      <OrderExportScopeModal
        isOpen={isOrderExportScopeModalOpen}
        onClose={() => setIsOrderExportScopeModalOpen(false)}
        orderExportScope={orderExportScope}
        setOrderExportScope={setOrderExportScope}
        filteredOrderData={filteredOrderData}
        mtdOrderData={mtdOrderData}
        orderData={orderData}
        latestUnifiedDate={latestUnifiedDate}
        overviewDateFilters={overviewDateFilters}
        onContinue={handleContinueToOrderColumnStep}
      />

      <OrderExportColumnModal
        isOpen={isOrderExportModalOpen}
        onClose={() => setIsOrderExportModalOpen(false)}
        onBack={() => { setIsOrderExportModalOpen(false); setIsOrderExportScopeModalOpen(true); }}
        orderExportScope={orderExportScope}
        effectiveOrderColumns={effectiveOrderColumns}
        selectedOrderExportColumns={selectedOrderExportColumns}
        setSelectedOrderExportColumns={setSelectedOrderExportColumns}
        orderData={orderData}
        filteredOrderData={filteredOrderData}
        mtdOrderData={mtdOrderData}
        latestUnifiedDate={latestUnifiedDate}
      />
      <OverviewExportScopeModal
        isOpen={isOverviewExportScopeModalOpen}
        onClose={() => setIsOverviewExportScopeModalOpen(false)}
        overviewExportScope={overviewExportScope}
        setOverviewExportScope={setOverviewExportScope}
        overviewDateFilters={overviewDateFilters}
        latestUnifiedDate={latestUnifiedDate}
        onConfirm={handleOverviewExportConfirm}
        selectedExportMonth={selectedExportMonth}
        setSelectedExportMonth={setSelectedExportMonth}
      />

      <GenericExportScopeModal
        isOpen={isGenericExportScopeModalOpen}
        onClose={() => setIsGenericExportScopeModalOpen(false)}
        genericExportFlow={genericExportFlow}
        genericExportScope={genericExportScope}
        setGenericExportScope={setGenericExportScope}
        getExportFlowConfig={getExportFlowConfig}
        overviewDateFilters={overviewDateFilters}
        latestUnifiedDate={latestUnifiedDate}
        onContinue={handleGenericExportContinue}
        stockDates={stockDates}
        selectedStockDates={selectedStockExportDates}
        setSelectedStockDates={setSelectedStockExportDates}
      />

      <GenericExportColumnModal
        isOpen={isGenericExportColumnModalOpen}
        onClose={() => setIsGenericExportColumnModalOpen(false)}
        onBack={() => { setIsGenericExportColumnModalOpen(false); setIsGenericExportScopeModalOpen(true); }}
        genericExportFlow={genericExportFlow}
        genericExportScope={genericExportScope}
        getExportFlowConfig={getExportFlowConfig}
        genericExportSelectedColumns={genericExportSelectedColumns}
        setGenericExportSelectedColumns={setGenericExportSelectedColumns}
        onConfirmExport={handleGenericExportConfirm}
      />
    </div>
  );
};

export default ConstructionSampleUnit;