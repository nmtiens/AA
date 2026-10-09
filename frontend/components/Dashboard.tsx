import React, { useMemo, useState, useEffect, useRef } from 'react';
import { materialRowClass } from './Dashboard/utils/materialRowClass';
import { DataRow, ColumnDefinition } from '../types';
import { parseVNDate, diffDays } from './Dashboard/utils/dateHelpers';
import { CheckCircle, Filter, XCircle as CloseIcon, ShoppingCart, BarChart2, AlertTriangle, Target } from 'lucide-react';
import { fetchRevenue2026, type Revenue2026Data } from '../services/dataService';
import { DashboardFilter } from './Dashboard/components/shared/DashboardFilter';
import { ProductionDonutPanel, type OrderMixSelection } from './Dashboard/components/shared/ProductionDonutPanel';
import { categoryOptions } from './Dashboard/utils/filterMatch';
import { useColumnKeys } from './Dashboard/hooks/useColumnKeys';
import { useDashboardOptions } from './Dashboard/hooks/useDashboardOptions';
import { useDashboardFilters } from './Dashboard/hooks/useDashboardFilters';
import { useUnifiedTimeFilters } from './Dashboard/hooks/useUnifiedTimeFilters';
import { useOverviewSummary } from './Dashboard/hooks/useOverviewSummary';
import { useKhsxSummary } from './Dashboard/hooks/useKhsxSummary';
import { useStockData } from './Dashboard/hooks/useStockData';
import { usePivotTables } from './Dashboard/hooks/usePivotTables';
import { useExportFlows } from './Dashboard/hooks/useExportFlows';
import { PivotMaterialSummarySection } from './Dashboard/components/sections/PivotMaterialSummarySection';
import { PivotMaterialStatusSection } from './Dashboard/components/sections/PivotMaterialStatusSection';
import { MaterialListSection } from './Dashboard/components/sections/MaterialListSection';
import { ProjectSummarySection } from './Dashboard/components/sections/ProjectSummarySection';
import { PivotProjectSection } from './Dashboard/components/sections/PivotProjectSection';
import { FactoryRevenueSection, type CustomFunnelItem } from './Dashboard/components/sections/FactoryRevenueSection';
import { HexDetailModal, type HexDetailColumnKeys } from './Dashboard/components/modals/HexDetailModal';
import { TOTAL_STAGE, extractStage } from './Dashboard/components/modals/OnLineStageDetailModal';
import { resolveFunnelHexTarget, FUNNEL_HEX_COLUMN_LABELS, type FunnelHexColumn } from './Dashboard/utils/funnelHexTarget';
import { useAuth } from '../context/AuthContext';
import { StockItemsModal } from './Dashboard/components/modals/StockItemsModal';
import { BottleneckSection } from './Dashboard/components/sections/BottleneckSection';
import { ProductionStatusSection } from './Dashboard/components/sections/ProductionStatusSection';
import { KhsxPlanActualSection } from './Dashboard/components/sections/KhsxPlanActualSection';
import { OrderOverviewSection } from './Dashboard/components/sections/OrderOverviewSection';
import { OrderExportScopeModal } from './Dashboard/components/modals/OrderExportScopeModal';
import { OrderExportColumnModal } from './Dashboard/components/modals/OrderExportColumnModal';
import { OverviewExportScopeModal } from './Dashboard/components/modals/OverviewExportScopeModal';
import { GenericExportScopeModal } from './Dashboard/components/modals/GenericExportScopeModal';
import { GenericExportColumnModal } from './Dashboard/components/modals/GenericExportColumnModal';
import { ProductionExportModal } from './Dashboard/components/modals/ProductionExportModal';
interface DashboardProps {
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

const Dashboard: React.FC<DashboardProps> = ({
  productionData,
  productionColumns,
  materialData,
  materialColumns,
  khsxData,
  khsxColumns,
  inventoryData,
  inventoryColumns,
  orderData,
  orderColumns,
  tkbvData,
  tkbvColumns,
  pthspData,
  pthspColumns,
  yearlyPlanData,
  yearlyPlanColumns,
  analysisData,
  analysisColumns,
  exportData,
  exportColumns,
  stockData,
  stockColumns,
  attendanceData,
  attendanceColumns,
  isSidebarCollapsed
}) => {
  // ... (Same state and refs) ...
  const factoryRevenueRef = useRef<HTMLDivElement>(null);
  const productionStatusRef = useRef<HTMLDivElement>(null);
  const pivotWorkshopRef = useRef<HTMLDivElement>(null);
  const pivotProjectRef = useRef<HTMLDivElement>(null);
  const pivotMaterialRef = useRef<HTMLDivElement>(null);
  const pivotMaterialStatusRef = useRef<HTMLDivElement>(null);
  const materialListRef = useRef<HTMLDivElement>(null);
  const khsxSectionRef = useRef<HTMLDivElement>(null);
  const inventorySectionRef = useRef<HTMLDivElement>(null);
  const projectSummaryRef = useRef<HTMLDivElement>(null);
  const orderOverviewRef = useRef<HTMLDivElement>(null);
  const bottleneckSectionRef = useRef<HTMLDivElement>(null);


  const {
   hexKey, tinhTrangKey, tinhTrangIpoKey, valueKey, realValueKey, congTrinhKey,
  khachHangKey, khuVucDuAnKey, phanLoaiNhomSanPhamKey,
  xuongKey, hangMucKey, daysAtCurrentStageKey, bopKey, triGiaDonHangTongKey,
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


const {
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
} = useDashboardFilters({
  productionData,
  materialData,
  congTrinhKey,
  xuongKey,
  tinhTrangKey,
  tinhTrangIpoKey,
  khachHangKey,
  khuVucDuAnKey,
  phanLoaiKey: phanLoaiNhomSanPhamKey,
  matCongTrinhKey,
  matNhomVtKey,
});

// Biểu đồ "Cơ cấu đơn hàng" đọc/ghi thẳng vào bộ lọc tổng: bấm 1 lát => cả trang lọc theo
const orderMixSelection = useMemo<OrderMixSelection>(
  () => ({ kv: filters.khuVucDuAn, kh: filters.khachHang, pl: filters.phanLoai }),
  [filters.khuVucDuAn, filters.khachHang, filters.phanLoai]
);
const setOrderMixSelection = (next: OrderMixSelection) =>
  setFilters(prev => ({ ...prev, khuVucDuAn: next.kv, khachHang: next.kh, phanLoai: next.pl }));
const phanLoaiOptions = useMemo(
  () => categoryOptions(productionData, phanLoaiNhomSanPhamKey),
  [productionData, phanLoaiNhomSanPhamKey]
);

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
 filters: effectiveFilters,
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

// Năm đang được chọn ở "LỌC NĂM" trong bộ lọc thống nhất (unifiedTimeFilters.nam).
// Biểu đồ "Phân bổ Kế hoạch theo Xưởng" CHỈ phụ thuộc vào năm này — không phụ thuộc
// thang/tuan/ngay — nên effect chỉ re-run khi giá trị năm thay đổi.
const selectedRevenueYear = unifiedTimeFilters.nam[0] || String(new Date().getFullYear());
// Yêu cầu mở modal "Chi tiết Nhập Kho" theo cả năm (khi bấm ô "Thực hiện lũy kế").
// nonce tăng mỗi lần bấm để OrderOverviewSection biết có yêu cầu mới.
const [inventoryOpenRequest, setInventoryOpenRequest] = useState<{ nonce: number; year: number; withPlan?: boolean } | null>(null);
useEffect(() => {
  fetchRevenue2026(selectedRevenueYear).then(data => { if (data) setRevenue2026(data); });
}, [selectedRevenueYear]);
 
const {
  congTrinhOptions,
  xuongOptions,
  tinhTrangOptions,
   tinhTrangIpoOptions,
  khachHangOptions,
  khuVucDuAnOptions,
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
  khachHangKey,
  khuVucDuAnKey,
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
  getGroupAnalysisFilterKey,
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
 filters: effectiveFilters,
  unifiedDateOptions,
});

const {
  khsxSummary,
  totalKhsxAmount,
  weeklyKhFallback,
  totalInventoryAmount,
  totalInventoryPlanAmount,
  completionRate,
  combinedWorkshopData,
  combinedProjectData,
  weeklyPlanVsActualData,
  productivityAnalysisData,
} = useKhsxSummary({
  unifiedTimeFilters,
  viewMode,
 filters: effectiveFilters,
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
  stockScopeCongTrinh,
  loadStockByProject, 
  latestStockDateAvailable,
  closestStockDate,
  mtdStockData,
  filteredStockDataForExport,
  latestStockStats,
  latestStockStatsPrevMonth,
  stockOverviewCardValue,
  stockTotalCount, // MỚI
} = useStockData({
  stockData,
  stockDateKey,
  latestUnifiedDate,
  overviewMetric,
filters: effectiveFilters,
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
  pivotWorkshopData,
  pivotFunnelData,
  customFunnelData,
  funnelBreakdownByBop,
  hexRowsByColumnV2,
  pivotProjectData,
  pivotMaterialSummary,
  pivotMaterialStatusData,
  lineChartData,
  bottleneckData,
  topBottlenecks,
} = usePivotTables({
  filteredProductionData,
  filteredMaterialData,
  funnelProductionData, // THÊM
  // Danh sách HEX khi bấm phễu / bảng công trình dùng cùng nguồn với phễu (không ăn ô Tình trạng)
  projectSummaryProductionData,
  displayedMaterialData,
  stockDates,        // MỚI: thay cho stockData/stockDateKey/stockValueKey/stockSapIdKey
  closestStockDate,
  tinhTrangKey, tinhTrangIpoKey, xuongKey, bopKey, valueKey, realValueKey, hexKey,
  congTrinhKey, hangMucKey, daysAtCurrentStageKey,
  triGiaDonHangTongKey, thanhTienTinhPhieuKey, thanhTienNhapKhoKey,
  matNhomVtKey, matSlYeuCauKey, matSlDaNhanKey, matStatusKey,
  // XÓA: stockDateKey, stockValueKey, stockSapIdKey, selectedCongTrinh: filters.congTrinh
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

  // --- MỚI: checklist mốc thời gian tồn kho dùng cho GenericExportScopeModal ---
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
    stockScope: { congTrinh: stockScopeCongTrinh, xuong: filters.xuong },
  orderColumns, orderData,
  tkbvColumns, tkbvData,
  pthspColumns, pthspData,
  inventoryColumns, inventoryData,
  exportColumns, exportData,
  stockColumns, stockData,
  productionColumns,
  productionData,

  // MỚI: date keys để lọc theo tháng bất kỳ
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
  }
const handleContinueToOrderColumnStep = () => {
    setIsOrderExportScopeModalOpen(false);
    setSelectedOrderExportColumns(effectiveOrderColumns.map(c => c.key));
    setIsOrderExportModalOpen(true);
  };

  // Màu dòng vật tư theo trạng thái dòng PR (cùng quy tắc với tab BOM)
  const getMaterialRowClassName = (row: DataRow): string => materialRowClass(row);

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

  // ---------------------------------------------------------------------------
  // Phễu "Tình trạng đơn hàng AATN" bấm được (giống Luồng đỏ / Căn mẫu):
  // bấm 1 thanh -> bảng chi tiết THEO CÔNG TRÌNH của bước đó (P022 lấy tồn kho theo công trình);
  // bấm 1 con số -> danh sách HEX đúng cột / công đoạn.
  // ---------------------------------------------------------------------------
  const { user } = useAuth();
  const [activeFunnelItem, setActiveFunnelItem] = useState<CustomFunnelItem | null>(null);

  useEffect(() => {
    if (activeFunnelItem?.id === 'P022') loadStockByProject();
  }, [activeFunnelItem, loadStockByProject]);

  const activeFunnelPivotData = useMemo(() => {
    if (!activeFunnelItem) return pivotFunnelData; // chưa chọn bước nào -> tổng theo BOP
    if (activeFunnelItem.id === 'P022') {
      return { data: stockByProjectData, total: stockByProjectData.reduce((sum, r) => sum + r.value, 0) };
    }
    return funnelBreakdownByBop[activeFunnelItem.id] ?? { data: [], total: 0 };
  }, [activeFunnelItem, pivotFunnelData, funnelBreakdownByBop, stockByProjectData]);

  const [stockItems, setStockItems] = useState<{ open: boolean; projectName: string | null }>({ open: false, projectName: null });
  const [funnelHex, setFunnelHex] = useState<{
    open: boolean; column: FunnelHexColumn | null; projectName: string | null; stage: string | null;
  }>({ open: false, column: null, projectName: null, stage: null });

  const handleFunnelPivotValueClick = (name: string | null, item: CustomFunnelItem | null) => {
    // Tồn kho (P022): mở danh sách từng mã tồn kho (của 1 công trình, hoặc tất cả ở dòng Tổng cộng / dòng P022)
    if (item?.id === 'P022' || (!item && name === 'P022')) {
      setStockItems({ open: true, projectName: item ? name : null });
      return;
    }
    const target = resolveFunnelHexTarget(name, item?.id ?? null);
    if (!target) return; // vd. bước P022 (Tồn kho) không có dữ liệu hex gốc
    setFunnelHex({ open: true, ...target });
  };

  const funnelHexRows = useMemo(() => {
    if (!funnelHex.open || !funnelHex.column) return [];
    let source = hexRowsByColumnV2[funnelHex.column] ?? [];
    if (funnelHex.projectName && congTrinhKey) {
      source = source.filter(row => String(row[congTrinhKey] || '').trim() === funnelHex.projectName);
    }
    if (funnelHex.stage && funnelHex.stage !== TOTAL_STAGE && bopKey) {
      source = source.filter(row => extractStage(row[bopKey]) === funnelHex.stage);
    }
    return source;
  }, [funnelHex, hexRowsByColumnV2, congTrinhKey, bopKey]);

  const funnelHexColumnKeys: HexDetailColumnKeys = useMemo(() => ({
    hexKey, congTrinhKey, hangMucKey, xuongKey, bopKey, tinhTrangKey,
    phanLoaiNhomSanPhamKey, triGiaDonHangTongKey, thanhTienTinhPhieuKey, thanhTienNhapKhoKey,
  }), [
    hexKey, congTrinhKey, hangMucKey, xuongKey, bopKey, tinhTrangKey,
    phanLoaiNhomSanPhamKey, triGiaDonHangTongKey, thanhTienTinhPhieuKey, thanhTienNhapKhoKey,
  ]);

  if (productionData.length === 0 && materialData.length === 0 && khsxData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        Không có dữ liệu để hiển thị.
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
      {/* Sticky Header & Filters */}
      <div className="sticky top-0 z-40 bg-wood-50/90 backdrop-blur border-b border-slate-200 px-4 py-3">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4 w-full min-w-0 md:w-auto">
            <div className="shrink-0">
              <h2 className="page-title">Tổng quan</h2>
            </div>
            {/* Anchor Buttons — màn hẹp: 1 hàng, vuốt ngang (không đẩy trang rộng ra) */}
            <div className="flex min-w-0 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>button]:shrink-0 [&>button]:whitespace-nowrap">
              <button onClick={() => scrollToRef(factoryRevenueRef)} className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md hover:bg-slate-50 text-slate-600 flex items-center gap-1.5" title="Đến Doanh số nhà máy">
                <Target size={14} className="text-slate-400" /> Doanh số
              </button>
              <button onClick={() => scrollToRef(orderOverviewRef)} className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md hover:bg-slate-50 text-slate-600 flex items-center gap-1.5" title="Đến Tổng quan Đơn hàng">
                <ShoppingCart size={14} className="text-slate-400" /> Tổng quan
              </button>
              <button onClick={() => scrollToRef(productionStatusRef)} className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md hover:bg-slate-50 text-slate-600 flex items-center gap-1.5" title="Đến Tình trạng sản xuất">
                <CheckCircle size={14} className="text-slate-400" /> Tình trạng sản xuất
              </button>
              <button onClick={() => scrollToRef(bottleneckSectionRef)} className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md hover:bg-slate-50 text-slate-600 flex items-center gap-1.5" title="Đến Báo cáo Điểm nghẽn">
                <AlertTriangle size={14} className="text-slate-400" /> Điểm nghẽn
              </button>
              <button onClick={() => scrollToRef(khsxSectionRef)} className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md hover:bg-slate-50 text-slate-600 flex items-center gap-1.5" title="Đến Kế hoạch & Nhập kho">
                <BarChart2 size={14} className="text-slate-400" /> Kế hoạch-Thực hiện
              </button>
            </div>
          </div>

          {/* Dashboard Filters */}
          <div className="flex flex-wrap gap-2 items-center w-full md:w-auto justify-end">
            <div className="flex items-center gap-2 mr-1 text-slate-500">
              <Filter size={14} /> <span className="text-[0.625rem] uppercase font-bold">Bộ lọc tổng:</span>
            </div>
                        {khachHangKey && (
              <DashboardFilter
                label="Khách Hàng"
                options={khachHangOptions}
                selectedValues={filters.khachHang}
                onChange={(vals) => setFilters(prev => ({ ...prev, khachHang: vals }))}
              />
            )}
            {khuVucDuAnKey && (
              <DashboardFilter
                label="Khu Vực Dự Án"
                options={khuVucDuAnOptions}
                selectedValues={filters.khuVucDuAn}
                onChange={(vals) => setFilters(prev => ({ ...prev, khuVucDuAn: vals }))}
              />
            )}
            {phanLoaiOptions.length > 0 && (
              <DashboardFilter
                label="Nhóm Sản Phẩm"
                options={phanLoaiOptions}
                selectedValues={filters.phanLoai}
                onChange={(vals) => setFilters(prev => ({ ...prev, phanLoai: vals }))}
              />
            )}
            {congTrinhKey && (
              <DashboardFilter
                label="Tên Công Trình"
                options={scopedProjects ? congTrinhOptions.filter(c => scopedProjects.has(c)) : congTrinhOptions}
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

                     <FactoryRevenueSection
  sectionRef={factoryRevenueRef}
  factoryRevenueChartData={factoryRevenueChartData}
  quarterlyTargets={quarterlyTargets}
  targetRevenue2026={targetRevenue2026}
  factoryRevenueStats={factoryRevenueStats}
  customFunnelData={customFunnelData}
  pivotFunnelData={activeFunnelPivotData}
  workshopMetric={workshopMetric}
  onFunnelItemClick={setActiveFunnelItem}
  onFunnelModalClose={() => setActiveFunnelItem(null)}
  onPivotValueClick={handleFunnelPivotValueClick}
  sideContent={
    <ProductionDonutPanel
      data={crossFilterBaseData}
      columns={productionColumns}
      selection={orderMixSelection}
      onSelectionChange={setOrderMixSelection}
      // Nút Hạng mục / Giá trị dùng chung với phễu bên cạnh
      metric={workshopMetric === 'COUNT_HEX' ? 'count' : 'value'}
      onMetricChange={m => setWorkshopMetric(m === 'count' ? 'COUNT_HEX' : 'SUM_GT_DON_HANG')}
      scopeNote={filters.tinhTrangIpo.length ? `Tình trạng IPO: ${filters.tinhTrangIpo.join(', ')}` : 'Tình trạng IPO: tất cả'}
    />
  }
  onActualClick={() =>
    setInventoryOpenRequest(r => ({
      nonce: (r?.nonce ?? 0) + 1,
      year: Number(selectedRevenueYear) || new Date().getFullYear(),
    }))
  }
  // Ô "Kế hoạch năm": cùng biểu đồ nhập kho theo năm, kèm cột kế hoạch năm
  onPlanClick={() =>
    setInventoryOpenRequest(r => ({
      nonce: (r?.nonce ?? 0) + 1,
      year: Number(selectedRevenueYear) || new Date().getFullYear(),
      withPlan: true,
    }))
  }
/>

        {/* --- MOVED SECTION: ORDER OVERVIEW (RENAMED TO BÁO CÁO TỔNG QUAN) --- */}
        {/* ... (Order Overview content unchanged) ... */}
    <OrderOverviewSection
  sectionRef={orderOverviewRef}
  isSidebarCollapsed={isSidebarCollapsed}
  hasAnyData={orderData.length > 0 || tkbvData.length > 0 || pthspData.length > 0}
   filters={filters}   // MỚI — filters đã tồn tại sẵn ở Dashboard.tsx (từ useDashboardFilters)
  openInventoryRequest={inventoryOpenRequest}  // MỚI — filters đã tồn tại sẵn ở Dashboard.tsx (từ useDashboardFilters)
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
  weeklyKhFallback={weeklyKhFallback}
  completionRate={completionRate}
  totalInventoryAmount={totalInventoryAmount}
  totalInventoryPlanAmount={totalInventoryPlanAmount}
  combinedWorkshopData={combinedWorkshopData}
  combinedProjectData={combinedProjectData}
  weeklyPlanVsActualData={weeklyPlanVsActualData}
  productivityAnalysisData={productivityAnalysisData}
yearlyPlan2026WorkshopChartData={yearlyPlan2026WorkshopChartData}
  selectedRevenueYearLabel={revenue2026?.year ? String(revenue2026.year) : selectedRevenueYear}
/>

          <ProjectSummarySection
     sectionRef={projectSummaryRef}
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

      {/* Danh sách HEX khi bấm 1 con số trong bảng chi tiết của phễu */}
      <HexDetailModal
        isOpen={funnelHex.open}
        onClose={() => setFunnelHex(prev => ({ ...prev, open: false }))}
        title={funnelHex.column
          ? FUNNEL_HEX_COLUMN_LABELS[funnelHex.column] + (funnelHex.stage && funnelHex.stage !== TOTAL_STAGE ? ` – ${funnelHex.stage}` : '')
          : ''}
        projectName={funnelHex.projectName}
        rows={funnelHexRows}
        columnKeys={funnelHexColumnKeys}
        currentUser={user?.username ?? ''}
      />

      {/* Danh sách mã tồn kho khi bấm số của bước "P022. TỒN KHO" */}
      <StockItemsModal
        open={stockItems.open}
        onClose={() => setStockItems(s => ({ ...s, open: false }))}
        date={closestStockDate ?? null}
        projectName={stockItems.projectName}
        congTrinh={stockScopeCongTrinh}
        xuong={filters.xuong}
      />
    </div>
  );
};

export default Dashboard;
