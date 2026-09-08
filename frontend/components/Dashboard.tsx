import React, { useMemo, useState, useEffect, useRef } from 'react';
import { DataRow, ColumnDefinition } from '../types';
import { parseVNDate, diffDays } from './Dashboard/utils/dateHelpers';
import { CheckCircle, Filter, XCircle as CloseIcon, ShoppingCart, BarChart2, AlertTriangle, Target } from 'lucide-react';
import { fetchRevenue2026, type Revenue2026Data } from '../services/dataService';
import { DashboardFilter } from './Dashboard/components/shared/DashboardFilter';
import { useColumnKeys } from './Dashboard/hooks/useColumnKeys';
import { useDashboardOptions } from './Dashboard/hooks/useDashboardOptions';
import { useDashboardFilters } from './Dashboard/hooks/useDashboardFilters';
import { useUnifiedTimeFilters } from './Dashboard/hooks/useUnifiedTimeFilters';
import { useOverviewSummary } from './Dashboard/hooks/useOverviewSummary';
import { useKhsxSummary } from './Dashboard/hooks/useKhsxSummary';
import { useStockData } from './Dashboard/hooks/useStockData';
import { usePivotTables } from './Dashboard/hooks/usePivotTables';
import { useExportFlows } from './Dashboard/hooks/useExportFlows';
import { StatusLineChartSection } from './Dashboard/components/sections/StatusLineChartSection';
import { PivotMaterialSummarySection } from './Dashboard/components/sections/PivotMaterialSummarySection';
import { PivotMaterialStatusSection } from './Dashboard/components/sections/PivotMaterialStatusSection';
import { MaterialListSection } from './Dashboard/components/sections/MaterialListSection';
import { ProjectSummarySection } from './Dashboard/components/sections/ProjectSummarySection';
import { PivotProjectSection } from './Dashboard/components/sections/PivotProjectSection';
import { FactoryRevenueSection } from './Dashboard/components/sections/FactoryRevenueSection';
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
  setFilters,
  hasActiveFilters,
  clearFilters,
  filteredProductionData,
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
useEffect(() => { fetchRevenue2026().then(data => { if (data) setRevenue2026(data); }); }, []);
 
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
} = useStockData({
  stockData,
  stockDateKey,
  latestUnifiedDate,
  overviewMetric,
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
  pivotProjectData,
  pivotMaterialSummary,
  pivotMaterialStatusData,
  lineChartData,
  bottleneckData,
  topBottlenecks,
} = usePivotTables({
  filteredProductionData,
  filteredMaterialData,
  displayedMaterialData,
  stockData,
  closestStockDate,
  tinhTrangKey, xuongKey, bopKey, valueKey, realValueKey, hexKey,
  congTrinhKey, hangMucKey, daysAtCurrentStageKey,
  triGiaDonHangTongKey, thanhTienTinhPhieuKey, thanhTienNhapKhoKey,
  matNhomVtKey, matSlYeuCauKey, matSlDaNhanKey, matStatusKey,
  stockDateKey, stockValueKey, stockSapIdKey,
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
} = useExportFlows({
  orderColumns, orderData,
  tkbvColumns, tkbvData,
  pthspColumns, pthspData,
  inventoryColumns, inventoryData,
  exportColumns, exportData,
  stockColumns, stockData,
  productionColumns,

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
      <div className="sticky top-0 z-40 bg-wood-50/95 backdrop-blur-sm border-b border-wood-200 px-4 py-3 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Tổng quan</h2>
            </div>
            {/* Anchor Buttons */}
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

          {/* Dashboard Filters */}
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

           <FactoryRevenueSection
     sectionRef={factoryRevenueRef}
     factoryRevenueChartData={factoryRevenueChartData}
     quarterlyTargets={quarterlyTargets}
     targetRevenue2026={targetRevenue2026}
     factoryRevenueStats={factoryRevenueStats}
     yearlyPlan2026WorkshopChartData={yearlyPlan2026WorkshopChartData}
   />

        {/* --- MOVED SECTION: ORDER OVERVIEW (RENAMED TO BÁO CÁO TỔNG QUAN) --- */}
        {/* ... (Order Overview content unchanged) ... */}
    <OrderOverviewSection
    sectionRef={orderOverviewRef}
  isSidebarCollapsed={isSidebarCollapsed}
  hasAnyData={orderData.length > 0 || tkbvData.length > 0 || pthspData.length > 0}
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
/>

        <ProductionStatusSection
  sectionRef={productionStatusRef}
  pivotWorkshopRef={pivotWorkshopRef}
  customFunnelData={customFunnelData}
  cardMetrics={cardMetrics}
  pivotWorkshopData={pivotWorkshopData}
  pivotFunnelData={pivotFunnelData}
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

           <PivotMaterialSummarySection
     sectionRef={pivotMaterialRef}
     pivotMaterialSummary={pivotMaterialSummary}
     selectedMaterialGroups={selectedMaterialGroups}
     setSelectedMaterialGroups={setSelectedMaterialGroups}
     toggleMaterialGroup={toggleMaterialGroup}
     activeCongTrinhFilter={filters.congTrinh}
   />

           <PivotMaterialStatusSection
     sectionRef={pivotMaterialStatusRef}
     pivotMaterialStatusData={pivotMaterialStatusData}
     matStatusMetric={matStatusMetric}
     setMatStatusMetric={setMatStatusMetric}
   />

           <MaterialListSection
     sectionRef={materialListRef}
     displayedMaterialData={displayedMaterialData}
     getMaterialRowClassName={getMaterialRowClassName}
   />

           <StatusLineChartSection
     lineChartData={lineChartData}
     chartMetric={chartMetric}
     setChartMetric={setChartMetric}
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

export default Dashboard;
