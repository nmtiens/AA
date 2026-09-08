import React, { useState } from 'react';
import {
  ShoppingCart, FileText, ClipboardList, Package, Box, Eye, Download, X,
  Layers, Building2, Briefcase, XCircle as CloseIcon,
  TrendingUp,
  Table2,
} from 'lucide-react';
import { DashboardFilter } from '../shared/DashboardFilter';
import { DisplayModeToggle } from '../shared/DisplayModeToggle';
import { DetailModalTable } from '../shared/DetailModalTable';
import { getYesterdayDateOption } from '../../utils/dateHelpers';
import TrendChart from '../Dashboards/TrendChart';
import ByXuongChart from '../Dashboards/ByXuongChart';
import ByCongTrinhChart from '../Dashboards/ByCongTrinhChart';
import { TrendFilterProvider } from '../Dashboards/TrendFilterContext';
import SharedDateFilterBar from '../Dashboards/SharedDateFilterBar';
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DisplayMetric = 'COUNT' | 'SUM';

interface MetricBucket {
  count: number;
  value: number;
}

interface OverviewMetricGroup {
  daily: MetricBucket;
  mtd: MetricBucket;
  lastMonth?: MetricBucket;
}

export interface OverviewSummaryData {
  date?: string;
  order: OverviewMetricGroup;
  tkbv: OverviewMetricGroup;
  pthsp: OverviewMetricGroup;
  inventory: OverviewMetricGroup;
  export: OverviewMetricGroup;
}

export interface StockStatsRow {
  date: Date | null;
  count: number;
  value: number;
}

export interface StockByProjectRow {
  name: string;
  count: number;
  value: number;
}

interface OrderOverviewSectionProps {
  sectionRef: React.Ref<HTMLDivElement>;
 isSidebarCollapsed: boolean;   // ← THÊM DÒNG NÀY
  hasAnyData: boolean;

  overviewMetric: DisplayMetric;
  setOverviewMetric: React.Dispatch<React.SetStateAction<DisplayMetric>>;
  getContextLabel: () => string;
  overviewDateRangeDisplay?: string;
  unifiedDateOptions: string[];
  overviewDateFilters: string[];
  setOverviewDateFilters: (values: string[]) => void;
  setShowDateWarning: React.Dispatch<React.SetStateAction<boolean>>;
  handleOpenOverviewExport: () => void;

  overviewSummary: OverviewSummaryData | null;
  latestUnifiedDate: Date | null;
  closestStockDate: Date | null;
  stockOverviewCardValue: number;
  latestStockStats: StockStatsRow;
  latestStockStatsPrevMonth: StockStatsRow;
  stockByProjectData: StockByProjectRow[];

  groupAnalysisCache: Record<string, any[]>;
  toAnalysisItems: (rows: any[], metric: DisplayMetric) => any[];
  loadGroupAnalysis: (key: 'order' | 'tkbv' | 'pthsp' | 'inventory' | 'export') => void;
  handleOpenOrderExport: () => void;
  handleOpenGenericExport: (flow: 'tkbv' | 'pthsp' | 'inventory' | 'export' | 'stock') => void;
  loadStockByProject: () => void; 
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const OrderOverviewSection: React.FC<OrderOverviewSectionProps> = ({
  sectionRef,
  isSidebarCollapsed, 
  hasAnyData,
  overviewMetric,
  setOverviewMetric,
  getContextLabel,
  overviewDateRangeDisplay,
  unifiedDateOptions,
  overviewDateFilters,
  setOverviewDateFilters,
  setShowDateWarning,
  handleOpenOverviewExport,
  overviewSummary,
  latestUnifiedDate,
  closestStockDate,
  stockOverviewCardValue,
  latestStockStats,
  latestStockStatsPrevMonth,
  stockByProjectData,
  groupAnalysisCache,
  toAnalysisItems,
  loadGroupAnalysis,
  handleOpenOrderExport,
  handleOpenGenericExport,
  loadStockByProject,
}) => {
  const [ipoMetric, setIpoMetric] = useState<DisplayMetric>('COUNT');
  const [tkbvMetric, setTkbvMetric] = useState<DisplayMetric>('COUNT');
  const [pthspMetric, setPthspMetric] = useState<DisplayMetric>('COUNT');
  const [inventoryMetric, setInventoryMetric] = useState<DisplayMetric>('COUNT');
  const [exportMetric, setExportMetric] = useState<DisplayMetric>('COUNT');
  const [stockMetric, setStockMetric] = useState<DisplayMetric>('COUNT');

  // 👇 Tab hiển thị trong modal chi tiết: 'chart' = biểu đồ xu hướng, 'detail' = bảng chi tiết
  type DetailTab = 'chart' | 'detail';
  const [ipoTab, setIpoTab] = useState<DetailTab>('detail');
  const [tkbvTab, setTkbvTab] = useState<DetailTab>('detail');
  const [pthspTab, setPthspTab] = useState<DetailTab>('detail');
  const [inventoryTab, setInventoryTab] = useState<DetailTab>('detail');
  const [exportTab, setExportTab] = useState<DetailTab>('detail');
  const [stockTab, setStockTab] = useState<DetailTab>('detail');

  const [isIpoDetailModalOpen, setIsIpoDetailModalOpen] = useState(false);
  const [isTkbvDetailModalOpen, setIsTkbvDetailModalOpen] = useState(false);
  const [isPthspDetailModalOpen, setIsPthspDetailModalOpen] = useState(false);
  const [isInventoryDetailModalOpen, setIsInventoryDetailModalOpen] = useState(false);
  const [isExportDetailModalOpen, setIsExportDetailModalOpen] = useState(false);
  const [isStockDetailModalOpen, setIsStockDetailModalOpen] = useState(false);

  if (!hasAnyData) return null;

  // --- MỚI: Khóa cache phải phản ánh đúng TẬP NGÀY đang lọc ngoài dashboard.
  // Phải khớp CHÍNH XÁC với cách useOverviewSummary.loadGroupAnalysis tính filterKey,
  // nếu không 2 bên sẽ ghi/đọc lệch key nhau.
  const filterKey = overviewDateFilters.length > 0
    ? [...overviewDateFilters].sort().join('_')
    : `all-${overviewSummary?.date ?? ''}`;

  // --- MỚI: Nhãn cột "ngày" trong modal chi tiết — phản ánh đúng khi chọn nhiều ngày.
  const periodLabel = overviewDateFilters.length > 1
    ? `${overviewDateFilters.length} NGÀY ĐÃ CHỌN`
    : `NGÀY ${latestUnifiedDate ? `${latestUnifiedDate.getDate()}/${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`;

  return (
    // Bọc TrendFilterProvider ở đây để TẤT CẢ các biểu đồ xu hướng
    // (ở mọi modal: order/tkbv/pthsp/inventory/export/stock) dùng chung
    // đúng 1 bộ lọc ngày/granularity, không bị tách rời từng biểu đồ nữa.
    <TrendFilterProvider>
    <>
      <div
        ref={sectionRef}
        className="scroll-mt-24 w-full bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col"
      >
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-pink-600" />
              BÁO CÁO TỔNG QUAN
            </h3>
            <p className="text-xs font-medium text-slate-500 mt-1">{getContextLabel()}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-slate-400">
                Dữ liệu từ nguồn Đơn hàng tổng & TKBV & PTHSP & Nhập Kho
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-slate-500 uppercase">CHẾ ĐỘ HIỂN THỊ:</span>
              <div className="flex items-center bg-white p-0.5 rounded border border-slate-200 shadow-sm mt-0.5">
                <button
                  onClick={() => setOverviewMetric('COUNT')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-sm transition-all ${
                    overviewMetric === 'COUNT' ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Số lượng
                </button>
                <div className="w-px h-2.5 bg-slate-200 mx-0.5"></div>
                <button
                  onClick={() => setOverviewMetric('SUM')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-sm transition-all ${
                    overviewMetric === 'SUM' ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Giá trị
                </button>
              </div>
            </div>
            <div className="w-px h-8 bg-slate-200 mx-1"></div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-slate-500 uppercase">BỘ LỌC NGÀY CHUNG (ALL):</span>
              {overviewDateRangeDisplay && (
                <span className="text-[10px] text-indigo-600 font-semibold">{overviewDateRangeDisplay}</span>
              )}
            </div>
            <DashboardFilter
              label="NGÀY BÁO CÁO"
              options={unifiedDateOptions}
              selectedValues={overviewDateFilters}
              onChange={(values: string[]) => {
                if (values.length === 0) {
                  setShowDateWarning(true);
                  return;
                }
                setOverviewDateFilters(values);
              }}
            />
            <button
              onClick={handleOpenOverviewExport}
              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg border border-emerald-100 bg-white ml-2"
              title="Xuất Excel tổng hợp"
            >
              <Download size={16} />
            </button>
            {overviewDateFilters.length > 0 && (
              <button
                onClick={() => {
                  const target = getYesterdayDateOption(unifiedDateOptions);
                  setOverviewDateFilters(target ? [target] : []);
                }}
                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg border border-red-100 bg-white"
                title="Về mặc định (Hôm qua)"
              >
                <CloseIcon size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Card 1: Đơn hàng mới */}
          <div className="flex flex-col gap-4">
            <div className="p-5 bg-gradient-to-br from-pink-50 to-rose-50 rounded-xl border border-pink-100 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-shadow h-full min-h-[160px]">
              <button
                onClick={() => {
                  setIsIpoDetailModalOpen(true);
                  loadGroupAnalysis('order');
                }}
                className="absolute top-4 right-4 text-pink-400 hover:text-pink-700 transition-colors z-20"
                title="Xem chi tiết"
              >
                <Eye size={18} />
              </button>
              <div className="flex items-center gap-2 mb-3 z-10">
                <div className="p-2 bg-pink-100 rounded-lg text-pink-600 shadow-sm group-hover:scale-110 transition-transform">
                  <ShoppingCart size={20} />
                </div>
                <p className="text-sm font-bold text-pink-800 opacity-80 uppercase tracking-wide">1. Đơn hàng mới (P001)</p>
              </div>
              <div className="z-10 flex flex-col items-start">
                <span className="text-[10px] font-bold text-pink-500 uppercase tracking-wider opacity-70 mb-1 block">
                  Trong ngày
                </span>
                <div className="flex items-baseline gap-2">
                  <h4 className="text-4xl font-extrabold text-pink-600 tracking-tight">
                    {overviewMetric === 'COUNT'
                      ? (overviewSummary?.order.daily.count ?? 0).toLocaleString('en-US')
                      : ((overviewSummary?.order.daily.value ?? 0) / 1000).toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 1,
                        })}
                  </h4>
                  <span className="text-sm font-medium text-pink-400">
                    {overviewMetric === 'COUNT' ? 'đơn hàng (HEX)' : 'Tỷ'}
                  </span>
                </div>
              </div>
              <div className="z-10 mt-3 pt-3 border-t border-pink-200/60 w-full">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold text-pink-800 uppercase">
                    Lũy kế T{latestUnifiedDate?.getMonth()! + 1}:
                  </span>
                  <span className="text-3xl font-extrabold text-pink-700">
                    {overviewMetric === 'COUNT'
                      ? `${(overviewSummary?.order.mtd.count ?? 0).toLocaleString('en-US')} đơn`
                      : ((overviewSummary?.order.mtd.value ?? 0) / 1000).toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 1,
                        }) + ' Tỷ'}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs font-bold text-pink-800/70 uppercase">
                    Lũy kế T{latestUnifiedDate?.getMonth()}:
                  </span>
                  <span className="text-lg font-extrabold text-pink-700/70">
                    {overviewMetric === 'COUNT'
                      ? `${(overviewSummary?.order.lastMonth?.count ?? 0).toLocaleString('en-US')} đơn`
                      : ((overviewSummary?.order.lastMonth?.value ?? 0) / 1000).toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 1,
                        }) + ' Tỷ'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: TKBV */}
          <div className="flex flex-col gap-4">
            <div className="p-5 bg-gradient-to-br from-blue-50 to-sky-50 rounded-xl border border-blue-100 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-shadow h-full min-h-[160px]">
              <button
                onClick={() => {
                  setIsTkbvDetailModalOpen(true);
                  loadGroupAnalysis('tkbv');
                }}
                className="absolute top-4 right-4 text-blue-400 hover:text-blue-700 transition-colors z-20"
                title="Xem chi tiết"
              >
                <Eye size={18} />
              </button>
              <div className="flex items-center gap-2 mb-3 z-10">
                <div className="p-2 bg-blue-100 rounded-lg text-blue-600 shadow-sm group-hover:scale-110 transition-transform">
                  <FileText size={20} />
                </div>
                <p className="text-sm font-bold text-blue-800 opacity-80 uppercase tracking-wide">
                  2. Đã Triển khai BV (P002)
                </p>
              </div>
              <div className="z-10 flex flex-col items-start">
                <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider opacity-70 mb-1 block">
                  Trong ngày
                </span>
                <div className="flex items-baseline gap-2">
                  <h4 className="text-4xl font-extrabold text-blue-600 tracking-tight">
                    {overviewMetric === 'COUNT'
                      ? (overviewSummary?.tkbv.daily.count ?? 0).toLocaleString('en-US')
                      : ((overviewSummary?.tkbv.daily.value ?? 0) / 1000).toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 1,
                        })}
                  </h4>
                  <span className="text-sm font-medium text-blue-400">
                    {overviewMetric === 'COUNT' ? 'bản vẽ (Items)' : 'Tỷ'}
                  </span>
                </div>
              </div>
              <div className="z-10 mt-3 pt-3 border-t border-blue-200/60 w-full">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold text-blue-800 uppercase">
                    Lũy kế T{latestUnifiedDate?.getMonth()! + 1}:
                  </span>
                  <span className="text-3xl font-extrabold text-blue-700">
                    {overviewMetric === 'COUNT'
                      ? `${(overviewSummary?.tkbv.mtd.count ?? 0).toLocaleString('en-US')} bản vẽ`
                      : ((overviewSummary?.tkbv.mtd.value ?? 0) / 1000).toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 1,
                        }) + ' Tỷ'}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs font-bold text-blue-800/70 uppercase">
                    Lũy kế T{latestUnifiedDate?.getMonth()}:
                  </span>
                  <span className="text-lg font-extrabold text-blue-700/70">
                    {overviewMetric === 'COUNT'
                      ? `${(overviewSummary?.tkbv.lastMonth?.count ?? 0).toLocaleString('en-US')} bản vẽ`
                      : ((overviewSummary?.tkbv.lastMonth?.value ?? 0) / 1000).toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 1,
                        }) + ' Tỷ'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: PTHSP */}
          <div className="flex flex-col gap-4">
            <div className="p-5 bg-gradient-to-br from-purple-50 to-fuchsia-50 rounded-xl border border-purple-100 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-shadow h-full min-h-[160px]">
              <button
                onClick={() => {
                  setIsPthspDetailModalOpen(true);
                  loadGroupAnalysis('pthsp');
                }}
                className="absolute top-4 right-4 text-purple-400 hover:text-purple-700 transition-colors z-20"
                title="Xem chi tiết"
              >
                <Eye size={18} />
              </button>
              <div className="flex items-center gap-2 mb-3 z-10">
                <div className="p-2 bg-purple-100 rounded-lg text-purple-600 shadow-sm group-hover:scale-110 transition-transform">
                  <ClipboardList size={20} />
                </div>
                <p className="text-sm font-bold text-purple-800 opacity-80 uppercase tracking-wide">
                  3. Đã Tính phiếu (P012)
                </p>
              </div>
              <div className="z-10 flex flex-col items-start">
                <span className="text-[10px] font-bold text-purple-500 uppercase tracking-wider opacity-70 mb-1 block">
                  Trong ngày
                </span>
                <div className="flex items-baseline gap-2">
                  <h4 className="text-4xl font-extrabold text-purple-600 tracking-tight">
                    {overviewMetric === 'COUNT'
                      ? (overviewSummary?.pthsp.daily.count ?? 0).toLocaleString('en-US')
                      : ((overviewSummary?.pthsp.daily.value ?? 0) / 1000).toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 1,
                        })}
                  </h4>
                  <span className="text-sm font-medium text-purple-400">
                    {overviewMetric === 'COUNT' ? 'phiếu (Items)' : 'Tỷ'}
                  </span>
                </div>
              </div>
              <div className="z-10 mt-3 pt-3 border-t border-purple-200/60 w-full">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold text-purple-800 uppercase">
                    Lũy kế T{latestUnifiedDate?.getMonth()! + 1}:
                  </span>
                  <span className="text-3xl font-extrabold text-purple-700">
                    {overviewMetric === 'COUNT'
                      ? `${(overviewSummary?.pthsp.mtd.count ?? 0).toLocaleString('en-US')} phiếu`
                      : ((overviewSummary?.pthsp.mtd.value ?? 0) / 1000).toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 1,
                        }) + ' Tỷ'}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs font-bold text-purple-800/70 uppercase">
                    Lũy kế T{latestUnifiedDate?.getMonth()}:
                  </span>
                  <span className="text-lg font-extrabold text-purple-700/70">
                    {overviewMetric === 'COUNT'
                      ? `${(overviewSummary?.pthsp.lastMonth?.count ?? 0).toLocaleString('en-US')} phiếu`
                      : ((overviewSummary?.pthsp.lastMonth?.value ?? 0) / 1000).toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 1,
                        }) + ' Tỷ'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Nhập kho */}
          <div className="flex flex-col gap-4">
            <div className="p-5 bg-gradient-to-br from-teal-50 to-emerald-50 rounded-xl border border-teal-100 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-shadow h-full min-h-[160px]">
              <button
                onClick={() => {
                  setIsInventoryDetailModalOpen(true);
                  loadGroupAnalysis('inventory');
                }}
                className="absolute top-4 right-4 text-teal-400 hover:text-teal-700 transition-colors z-20"
                title="Xem chi tiết"
              >
                <Eye size={18} />
              </button>
              <div className="flex items-center gap-2 mb-3 z-10">
                <div className="p-2 bg-teal-100 rounded-lg text-teal-600 shadow-sm group-hover:scale-110 transition-transform">
                  <Package size={20} />
                </div>
                <p className="text-sm font-bold text-teal-800 opacity-80 uppercase tracking-wide">4. Nhập kho (P022)</p>
              </div>
              <div className="z-10 flex flex-col items-start">
                <span className="text-[10px] font-bold text-teal-500 uppercase tracking-wider opacity-70 mb-1 block">
                  Trong ngày
                </span>
                <div className="flex items-baseline gap-2">
                  <h4 className="text-4xl font-extrabold text-teal-600 tracking-tight">
                    {overviewMetric === 'COUNT'
                      ? (overviewSummary?.inventory.daily.count ?? 0).toLocaleString('en-US')
                      : ((overviewSummary?.inventory.daily.value ?? 0) / 1000).toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 1,
                        })}
                  </h4>
                  <span className="text-sm font-medium text-teal-400">
                    {overviewMetric === 'COUNT' ? 'items' : 'Tỷ'}
                  </span>
                </div>
              </div>
              {(overviewSummary?.inventory.mtd.count ?? 0) > 0 && (
                <div className="z-10 mt-3 pt-3 border-t border-teal-200/60 w-full">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-teal-800 uppercase">
                      Lũy kế T{latestUnifiedDate?.getMonth()! + 1}:
                    </span>
                    <span className="text-3xl font-extrabold text-teal-700">
                      {overviewMetric === 'COUNT'
                        ? `${(overviewSummary?.inventory.mtd.count ?? 0).toLocaleString('en-US')} items`
                        : ((overviewSummary?.inventory.mtd.value ?? 0) / 1000).toLocaleString('en-US', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 1,
                          }) + ' Tỷ'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs font-bold text-teal-800/70 uppercase">
                      Lũy kế T{latestUnifiedDate?.getMonth()}:
                    </span>
                    <span className="text-lg font-extrabold text-teal-700/70">
                      {overviewMetric === 'COUNT'
                        ? `${(overviewSummary?.inventory.lastMonth?.count ?? 0).toLocaleString('en-US')} items`
                        : ((overviewSummary?.inventory.lastMonth?.value ?? 0) / 1000).toLocaleString('en-US', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 1,
                          }) + ' Tỷ'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Card 5: Xuất kho */}
          <div className="flex flex-col gap-4">
            <div className="p-5 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-100 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-shadow h-full min-h-[160px]">
              <button
                onClick={() => {
                  setIsExportDetailModalOpen(true);
                  loadGroupAnalysis('export');
                }}
                className="absolute top-4 right-4 text-amber-400 hover:text-amber-700 transition-colors z-20"
                title="Xem chi tiết"
              >
                <Eye size={18} />
              </button>
              <div className="flex items-center gap-2 mb-3 z-10">
                <div className="p-2 bg-amber-100 rounded-lg text-amber-600 shadow-sm group-hover:scale-110 transition-transform">
                  <Package size={20} />
                </div>
                <p className="text-sm font-bold text-amber-800 opacity-80 uppercase tracking-wide">5. Xuất kho (P025)</p>
              </div>
              <div className="z-10 flex flex-col items-start">
                <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider opacity-70 mb-1 block">
                  Trong ngày
                </span>
                <div className="flex items-baseline gap-2">
                  <h4 className="text-4xl font-extrabold text-amber-600 tracking-tight">
                    {overviewMetric === 'COUNT'
                      ? (overviewSummary?.export.daily.count ?? 0).toLocaleString('en-US')
                      : ((overviewSummary?.export.daily.value ?? 0) / 1000).toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 1,
                        })}
                  </h4>
                  <span className="text-sm font-medium text-amber-400">
                    {overviewMetric === 'COUNT' ? 'items' : 'Tỷ'}
                  </span>
                </div>
              </div>
              <div className="z-10 mt-3 pt-3 border-t border-amber-200/60 w-full">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold text-amber-800 uppercase">
                    Lũy kế T{latestUnifiedDate?.getMonth()! + 1}:
                  </span>
                  <span className="text-3xl font-extrabold text-amber-700">
                    {overviewMetric === 'COUNT'
                      ? `${(overviewSummary?.export.mtd.count ?? 0).toLocaleString('en-US')} items`
                      : ((overviewSummary?.export.mtd.value ?? 0) / 1000).toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 1,
                        }) + ' Tỷ'}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs font-bold text-amber-800/70 uppercase">
                    Lũy kế T{latestUnifiedDate?.getMonth()}:
                  </span>
                  <span className="text-lg font-extrabold text-amber-700/70">
                    {overviewMetric === 'COUNT'
                      ? `${(overviewSummary?.export.lastMonth?.count ?? 0).toLocaleString('en-US')} items`
                      : ((overviewSummary?.export.lastMonth?.value ?? 0) / 1000).toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 1,
                        }) + ' Tỷ'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 6: Tồn kho */}
          <div className="flex flex-col gap-4">
            <div className="p-5 bg-gradient-to-br from-gray-50 to-slate-100 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-shadow h-full min-h-[160px]">
              <button
  onClick={() => {
    setIsStockDetailModalOpen(true);
    loadStockByProject();   // 👈 thêm dòng này
  }}
  className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 transition-colors z-20"
  title="Xem chi tiết"
>
  <Eye size={18} />
</button>
              <div className="flex items-center gap-2 mb-3 z-10">
                <div className="p-2 bg-slate-200 rounded-lg text-slate-600 shadow-sm group-hover:scale-110 transition-transform">
                  <Box size={20} />
                </div>
                <p className="text-sm font-bold text-slate-800 opacity-80 uppercase tracking-wide">6. Tồn kho</p>
              </div>
              <div className="z-10 flex flex-col items-start">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider opacity-70 mb-1 block">
                  Dữ liệu ngày:{' '}
                  {closestStockDate
                    ? `${closestStockDate.getDate().toString().padStart(2, '0')}/${(closestStockDate.getMonth() + 1)
                        .toString()
                        .padStart(2, '0')}/${closestStockDate.getFullYear()}`
                    : 'N/A'}
                </span>
                <div className="flex items-baseline gap-2">
                  <h4 className="text-4xl font-extrabold text-slate-700 tracking-tight">
                    {overviewMetric === 'COUNT'
                      ? stockOverviewCardValue.toLocaleString('en-US')
                      : (stockOverviewCardValue / 1000).toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 1,
                        })}
                  </h4>
                  <span className="text-sm font-medium text-slate-500">
                    {overviewMetric === 'COUNT' ? 'items' : 'Tỷ'}
                  </span>
                </div>
              </div>
              <div className="z-10 mt-3 pt-3 border-t border-slate-200/60 w-full">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-600 uppercase leading-tight">
                    Giá trị tồn mới nhất (
                    {latestStockStats.date
                      ? `${latestStockStats.date.getDate().toString().padStart(2, '0')}/${(latestStockStats.date.getMonth() + 1)
                          .toString()
                          .padStart(2, '0')}/${latestStockStats.date.getFullYear()}`
                      : 'N/A'}
                    )
                  </span>
                  <span className="text-3xl font-extrabold text-slate-700 shrink-0">
                    {overviewMetric === 'COUNT'
                      ? `${latestStockStats.count.toLocaleString('en-US')} items`
                      : (latestStockStats.value / 1000).toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 1,
                        }) + ' Tỷ'}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-2 mt-2">
                  <span className="text-[9px] font-bold text-slate-500 uppercase leading-tight">
                    Giá trị tồn mới nhất của tháng {latestUnifiedDate?.getMonth()} (
                    {latestStockStatsPrevMonth.date
                      ? `${latestStockStatsPrevMonth.date.getDate().toString().padStart(2, '0')}/${(
                          latestStockStatsPrevMonth.date.getMonth() + 1
                        )
                          .toString()
                          .padStart(2, '0')}/${latestStockStatsPrevMonth.date.getFullYear()}`
                      : 'N/A'}
                    )
                  </span>
                  <span className="text-lg font-extrabold text-slate-500 shrink-0">
                    {overviewMetric === 'COUNT'
                      ? `${latestStockStatsPrevMonth.count.toLocaleString('en-US')} items`
                      : (latestStockStatsPrevMonth.value / 1000).toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 1,
                        }) + ' Tỷ'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Chi tiết Đơn hàng mới (IPO) */}
      {isIpoDetailModalOpen && (
       <div className={`fixed inset-y-0 right-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-all duration-300 left-0 ${isSidebarCollapsed ? 'md:left-20' : 'md:left-64'}`}>
          <div className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
  <div className="flex items-center gap-6">
    <div>
      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
        <ShoppingCart className="text-pink-600" size={20} />
        Chi tiết Đơn hàng mới (IPO)
      </h3>
      <p className="text-xs text-slate-500 mt-1">Dữ liệu được tổng hợp từ nguồn Đơn hàng tổng</p>
    </div>
    <div className="inline-flex items-center gap-1 bg-white border border-pink-200 rounded-lg p-1 shadow-sm">
      <button
        onClick={() => setIpoTab('detail')}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${
          ipoTab === 'detail' ? 'bg-pink-600 text-white shadow-sm' : 'text-pink-600 hover:bg-pink-50'
        }`}
      >
        <Table2 size={14} />
        <span>Chi tiết dữ liệu</span>
      </button>
      <button
        onClick={() => setIpoTab('chart')}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${
          ipoTab === 'chart' ? 'bg-pink-600 text-white shadow-sm' : 'text-pink-600 hover:bg-pink-50'
        }`}
      >
        <TrendingUp size={14} />
        <span>Biểu đồ xu hướng</span>
      </button>
    </div>
  </div>
  <div className="flex items-center gap-3">
    <DisplayModeToggle current={ipoMetric} onChange={setIpoMetric} />
    <button
      onClick={handleOpenOrderExport}
      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-pink-50 text-pink-700 hover:bg-pink-100 rounded-lg text-xs font-bold border border-pink-200 transition-all shadow-sm active:scale-95 cursor-pointer"
      title="Xuất dữ liệu Đơn hàng mới (P001) ra file .CSV"
    >
      <Download size={15} />
      <span>Xuất CSV</span>
    </button>
    <button
      onClick={() => setIsIpoDetailModalOpen(false)}
      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors cursor-pointer"
    >
      <X size={24} />
    </button>
  </div>
</div>

            <div className="flex-1 overflow-y-auto bg-slate-50/50 custom-scrollbar">
              {ipoTab === 'chart' ? (
                <>
                  <SharedDateFilterBar showProductFilters /> 
                  <div className="p-6">
                    <TrendChart source="order" embedded displayMode={ipoMetric} />
                    <ByXuongChart source="order" displayMode={ipoMetric} />
                    <ByCongTrinhChart source="order" displayMode={ipoMetric} />
                  </div>
                </>
              ) : (
                <div className="p-6">
                  <DetailModalTable
                    data={toAnalysisItems(groupAnalysisCache[`order-xuong-${filterKey}`] ?? [], ipoMetric)}
                    title="Chi tiết theo Xưởng"
                    icon={Layers}
                    dateLabel={periodLabel}
                    mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                    unitLabel={ipoMetric === 'COUNT' ? '(SL HEX)' : '(Giá trị VND)'}
                    primaryColorClass="text-pink-600"
                    secondaryColorClass="text-indigo-600"
                    defaultExcludedKeys={['ABC', 'OTHERS', 'X.ĐB']}
                  />

                  <div className="border-t border-slate-200 pt-6">
                    <DetailModalTable
                      data={toAnalysisItems(groupAnalysisCache[`order-congtrinh-${filterKey}`] ?? [], ipoMetric)}
                      unitLabel={ipoMetric === 'COUNT' ? '(SL HEX)' : '(Giá trị VND)'}
                      title="Chi tiết theo Công trình"
                      icon={Building2}
                      dateLabel={periodLabel}
                      mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                      primaryColorClass="text-pink-600"
                      secondaryColorClass="text-indigo-600"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Chi tiết Triển khai Bản vẽ (TKBV) */}
      {isTkbvDetailModalOpen && (
        <div className={`fixed inset-y-0 right-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-all duration-300 left-0 ${isSidebarCollapsed ? 'md:left-20' : 'md:left-64'}`}>
          <div className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
  <div className="flex items-center gap-6">
    <div>
      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
        <FileText className="text-blue-600" size={20} />
        Chi tiết Triển khai Bản vẽ (TKBV)
      </h3>
      <p className="text-xs text-slate-500 mt-1">Dữ liệu được tổng hợp từ nguồn TKBV</p>
    </div>
    <div className="inline-flex items-center gap-1 bg-white border border-blue-200 rounded-lg p-1 shadow-sm">
      <button
        onClick={() => setTkbvTab('detail')}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${
          tkbvTab === 'detail' ? 'bg-blue-600 text-white shadow-sm' : 'text-blue-600 hover:bg-blue-50'
        }`}
      >
        <Table2 size={14} />
        <span>Chi tiết dữ liệu</span>
      </button>
        <button
        onClick={() => setTkbvTab('chart')}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${
          tkbvTab === 'chart' ? 'bg-blue-600 text-white shadow-sm' : 'text-blue-600 hover:bg-blue-50'
        }`}
      >
        <TrendingUp size={14} />
        <span>Biểu đồ xu hướng</span>
      </button>
    </div>
  </div>
  <div className="flex items-center gap-3">
    <DisplayModeToggle current={tkbvMetric} onChange={setTkbvMetric} />
    <button
      onClick={() => handleOpenGenericExport('tkbv')}
      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold border border-blue-200 transition-all shadow-sm active:scale-95 cursor-pointer"
      title="Xuất dữ liệu TKBV ra file .CSV"
    >
      <Download size={15} />
      <span>Xuất CSV</span>
    </button>
    <button
      onClick={() => setIsTkbvDetailModalOpen(false)}
      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
    >
      <X size={24} />
    </button>
  </div>
</div>
            <div className="flex-1 overflow-y-auto bg-slate-50/50 custom-scrollbar">
              {tkbvTab === 'chart' ? (
                <>
                  <SharedDateFilterBar showProductFilters /> 
                  <div className="p-6">
                    <TrendChart source="tkbv" embedded displayMode={tkbvMetric} />
                  </div>
                </>
              ) : (
                <div className="p-6">
                  <DetailModalTable
                    data={toAnalysisItems(groupAnalysisCache[`tkbv-xuong-${filterKey}`] ?? [], tkbvMetric)}
                    title="Chi tiết theo Xưởng"
                    icon={Layers}
                    dateLabel={periodLabel}
                    mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                    unitLabel={tkbvMetric === 'COUNT' ? '(SL Bản vẽ)' : '(Giá trị VND)'}
                    primaryColorClass="text-blue-600"
                    secondaryColorClass="text-indigo-600"
                  />

                  <div className="border-t border-slate-200 pt-6">
                    <DetailModalTable
                      data={toAnalysisItems(groupAnalysisCache[`tkbv-congtrinh-${filterKey}`] ?? [], tkbvMetric)}
                      title="Chi tiết theo Công trình"
                      icon={Building2}
                      dateLabel={periodLabel}
                      mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                      unitLabel={tkbvMetric === 'COUNT' ? '(SL Bản vẽ)' : '(Giá trị VND)'}
                      primaryColorClass="text-blue-600"
                      secondaryColorClass="text-indigo-600"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Chi tiết Đã Tính Phiếu (PTHSP) */}
      {isPthspDetailModalOpen && (
        <div className={`fixed inset-y-0 right-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-all duration-300 left-0 ${isSidebarCollapsed ? 'md:left-20' : 'md:left-64'}`}>
          <div className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
  <div className="flex items-center gap-6">
    <div>
      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
        <ClipboardList className="text-purple-600" size={20} />
        Chi tiết Đã Tính Phiếu (PTHSP)
      </h3>
      <p className="text-xs text-slate-500 mt-1">Dữ liệu được tổng hợp từ nguồn PTHSP</p>
    </div>
    <div className="inline-flex items-center gap-1 bg-white border border-purple-200 rounded-lg p-1 shadow-sm">
      <button
        onClick={() => setPthspTab('detail')}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${
          pthspTab === 'detail' ? 'bg-purple-600 text-white shadow-sm' : 'text-purple-600 hover:bg-purple-50'
        }`}
      >
        <Table2 size={14} />
        <span>Chi tiết dữ liệu</span>
      </button>
       <button
        onClick={() => setPthspTab('chart')}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${
          pthspTab === 'chart' ? 'bg-purple-600 text-white shadow-sm' : 'text-purple-600 hover:bg-purple-50'
        }`}
      >
        <TrendingUp size={14} />
        <span>Biểu đồ xu hướng</span>
      </button>
    </div>
  </div>
  <div className="flex items-center gap-3">
    <DisplayModeToggle current={pthspMetric} onChange={setPthspMetric} />
    <button
      onClick={() => handleOpenGenericExport('pthsp')}
      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg text-xs font-bold border border-purple-200 transition-all shadow-sm active:scale-95 cursor-pointer"
      title="Xuất dữ liệu PTHSP ra file .CSV"
    >
      <Download size={15} />
      <span>Xuất CSV</span>
    </button>
    <button
      onClick={() => setIsPthspDetailModalOpen(false)}
      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
    >
      <X size={24} />
    </button>
  </div>
</div>

            <div className="flex-1 overflow-y-auto bg-slate-50/50 custom-scrollbar">
              {pthspTab === 'chart' ? (
                <>
                  <SharedDateFilterBar showProductFilters /> 
                  <div className="p-6">
                    <TrendChart source="pthsp" embedded displayMode={pthspMetric} />
                  </div>
                </>
              ) : (
                <div className="p-6">
                  <DetailModalTable
                    data={toAnalysisItems(groupAnalysisCache[`pthsp-xuong-${filterKey}`] ?? [], pthspMetric)}
                    title="Chi tiết theo Xưởng"
                    icon={Layers}
                    dateLabel={periodLabel}
                    mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                    unitLabel={pthspMetric === 'COUNT' ? '(SL Phiếu)' : '(Giá trị VND)'}
                    primaryColorClass="text-purple-600"
                    secondaryColorClass="text-fuchsia-600"
                  />

                  <div className="border-t border-slate-200 pt-6">
                    <DetailModalTable
                      data={toAnalysisItems(groupAnalysisCache[`pthsp-congtrinh-${filterKey}`] ?? [], pthspMetric)}
                      title="Chi tiết theo Công trình"
                      icon={Building2}
                      dateLabel={periodLabel}
                      mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                      unitLabel={pthspMetric === 'COUNT' ? '(SL Phiếu)' : '(Giá trị VND)'}
                      primaryColorClass="text-purple-600"
                      secondaryColorClass="text-fuchsia-600"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Chi tiết Nhập Kho */}
      {isInventoryDetailModalOpen && (
        <div className={`fixed inset-y-0 right-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-all duration-300 left-0 ${isSidebarCollapsed ? 'md:left-20' : 'md:left-64'}`}>
          <div className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300">
           <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
  <div className="flex items-center gap-6">
    <div>
      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
        <Package className="text-teal-600" size={20} />
        Chi tiết Nhập Kho
      </h3>
      <p className="text-xs text-slate-500 mt-1">Dữ liệu được tổng hợp từ nguồn Nhập Kho</p>
    </div>
    <div className="inline-flex items-center gap-1 bg-white border border-teal-200 rounded-lg p-1 shadow-sm">
     
      <button
        onClick={() => setInventoryTab('detail')}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${
          inventoryTab === 'detail' ? 'bg-teal-600 text-white shadow-sm' : 'text-teal-600 hover:bg-teal-50'
        }`}
      >
        <Table2 size={14} />
        <span>Chi tiết dữ liệu</span>
      </button>
       <button
        onClick={() => setInventoryTab('chart')}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${
          inventoryTab === 'chart' ? 'bg-teal-600 text-white shadow-sm' : 'text-teal-600 hover:bg-teal-50'
        }`}
      >
        <TrendingUp size={14} />
        <span>Biểu đồ xu hướng</span>
      </button>
    </div>
  </div>
  <div className="flex items-center gap-3">
    <DisplayModeToggle current={inventoryMetric} onChange={setInventoryMetric} />
    <button
      onClick={() => handleOpenGenericExport('inventory')}
      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-lg text-xs font-bold border border-teal-200 transition-all shadow-sm active:scale-95 cursor-pointer"
      title="Xuất dữ liệu Nhập kho ra file .CSV"
    >
      <Download size={15} />
      <span>Xuất CSV</span>
    </button>
    <button
      onClick={() => setIsInventoryDetailModalOpen(false)}
      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
    >
      <X size={24} />
    </button>
  </div>
</div>

            <div className="flex-1 overflow-y-auto bg-slate-50/50 custom-scrollbar">
              {inventoryTab === 'chart' ? (
                <>
                  <SharedDateFilterBar showProductFilters /> 
                  <div className="p-6">
                    <TrendChart source="inventory" embedded displayMode={inventoryMetric} />
                  </div>
                </>
              ) : (
                <div className="p-6">
                  <DetailModalTable
                    data={toAnalysisItems(groupAnalysisCache[`inventory-xuong-${filterKey}`] ?? [], inventoryMetric)}
                    title="Chi tiết theo Xưởng"
                    icon={Layers}
                    dateLabel={periodLabel}
                    mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                    unitLabel={inventoryMetric === 'COUNT' ? '(SL Items)' : '(Giá trị VND)'}
                    primaryColorClass="text-teal-600"
                    secondaryColorClass="text-emerald-600"
                  />

                  <div className="border-t border-slate-200 pt-6">
                    <DetailModalTable
                      data={toAnalysisItems(groupAnalysisCache[`inventory-congtrinh-${filterKey}`] ?? [], inventoryMetric)}
                      title="Chi tiết theo Công trình"
                      icon={Building2}
                      dateLabel={periodLabel}
                      mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                      unitLabel={inventoryMetric === 'COUNT' ? '(SL Items)' : '(Giá trị VND)'}
                      primaryColorClass="text-teal-600"
                      secondaryColorClass="text-emerald-600"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Chi tiết Xuất kho */}
      {isExportDetailModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
           <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-amber-500 to-orange-600">
  <div className="flex items-center gap-6">
    <div className="flex items-center gap-3 text-white">
      <div className="p-2 bg-white/20 rounded-lg">
        <Package size={24} className="text-white" />
      </div>
      <div>
        <h3 className="text-xl font-bold text-white uppercase tracking-wider">Chi tiết Xuất kho</h3>
        <p className="text-[10px] text-amber-50 font-medium">{getContextLabel()}</p>
      </div>
    </div>
    <div className="inline-flex items-center gap-1 bg-white/20 border border-white/30 rounded-lg p-1 shadow-sm">
  
      <button
        onClick={() => setExportTab('detail')}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${
          exportTab === 'detail' ? 'bg-white text-amber-700 shadow-sm' : 'text-white hover:bg-white/10'
        }`}
      >
        <Table2 size={14} />
        <span>Chi tiết dữ liệu</span>
      </button>
        <button
        onClick={() => setExportTab('chart')}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${
          exportTab === 'chart' ? 'bg-white text-amber-700 shadow-sm' : 'text-white hover:bg-white/10'
        }`}
      >
        <TrendingUp size={14} />
        <span>Biểu đồ xu hướng</span>
      </button>
    </div>
  </div>
  <div className="flex items-center gap-3">
    <DisplayModeToggle current={exportMetric} onChange={setExportMetric} light />
    <button
      onClick={() => handleOpenGenericExport('export')}
      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white/20 text-white hover:bg-white/30 rounded-lg text-xs font-bold border border-white/30 transition-all shadow-sm active:scale-95 cursor-pointer"
      title="Xuất dữ liệu Xuất kho ra file .CSV"
    >
      <Download size={15} />
      <span>Xuất CSV</span>
    </button>
    <button
      onClick={() => setIsExportDetailModalOpen(false)}
      className="p-2 hover:bg-white/20 rounded-full transition-all text-white/90 hover:text-white"
    >
      <X size={24} />
    </button>
  </div>
</div>
            <div className="flex-1 overflow-y-auto bg-slate-50/50 custom-scrollbar">
              {exportTab === 'chart' ? (
                <>
                  <SharedDateFilterBar showProductFilters /> 
                  <div className="p-6">
                    <TrendChart source="export" embedded displayMode={exportMetric} />
                  </div>
                </>
              ) : (
                <div className="p-6">
                  <DetailModalTable
                    data={toAnalysisItems(groupAnalysisCache[`export-xuong-${filterKey}`] ?? [], exportMetric)}
                    title="Chi tiết theo Xưởng"
                    icon={Layers}
                    dateLabel={periodLabel}
                    mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                    unitLabel={exportMetric === 'COUNT' ? '(SL HEX)' : '(Giá trị VND)'}
                    primaryColorClass="text-amber-600"
                    secondaryColorClass="text-orange-600"
                  />

                  <div className="mt-8 pt-8 border-t border-slate-200">
                    <DetailModalTable
                      data={toAnalysisItems(groupAnalysisCache[`export-congtrinh-${filterKey}`] ?? [], exportMetric)}
                      title="Chi tiết theo Công trình"
                      icon={Briefcase}
                      dateLabel={periodLabel}
                      mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                      unitLabel={exportMetric === 'COUNT' ? '(SL HEX)' : '(Giá trị VND)'}
                      primaryColorClass="text-amber-700"
                      secondaryColorClass="text-orange-700"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-white flex justify-end">
              <button
                onClick={() => setIsExportDetailModalOpen(false)}
                className="px-8 py-2.5 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-700 transition-all shadow-md active:scale-95"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Chi tiết Tồn kho */}
      {isStockDetailModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-slate-600 to-slate-800">
  <div className="flex items-center gap-6">
    <div className="flex items-center gap-3 text-white">
      <div className="p-2 bg-white/20 rounded-lg">
        <Box size={24} className="text-white" />
      </div>
      <div>
        <h3 className="text-xl font-bold text-white uppercase tracking-wider">Chi tiết Tồn kho</h3>
        <p className="text-[10px] text-slate-50 font-medium">{getContextLabel()}</p>
      </div>
    </div>
    <div className="inline-flex items-center gap-1 bg-white/20 border border-white/30 rounded-lg p-1 shadow-sm">
      <button
        onClick={() => setStockTab('detail')}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${
          stockTab === 'detail' ? 'bg-white text-slate-800 shadow-sm' : 'text-white hover:bg-white/10'
        }`}
      >
        <Table2 size={14} />
        <span>Chi tiết dữ liệu</span>
      </button>
       <button
        onClick={() => setStockTab('chart')}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${
          stockTab === 'chart' ? 'bg-white text-slate-800 shadow-sm' : 'text-white hover:bg-white/10'
        }`}
      >
        <TrendingUp size={14} />
        <span>Biểu đồ xu hướng</span>
      </button>
    </div>
  </div>
  <div className="flex items-center gap-3">
    <DisplayModeToggle current={stockMetric} onChange={setStockMetric} light />
    <button
      onClick={() => handleOpenGenericExport('stock')}
      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white/20 text-white hover:bg-white/30 rounded-lg text-xs font-bold border border-white/30 transition-all shadow-sm active:scale-95 cursor-pointer"
      title="Xuất dữ liệu Tồn kho ra file .CSV"
    >
      <Download size={15} />
      <span>Xuất CSV</span>
    </button>
    <button
      onClick={() => setIsStockDetailModalOpen(false)}
      className="p-2 hover:bg-white/20 rounded-full transition-all text-white/90 hover:text-white"
    >
      <X size={24} />
    </button>
  </div>
</div>

            <div className="flex-1 overflow-y-auto bg-slate-50/50 custom-scrollbar">
              {stockTab === 'chart' ? (
                <>
                   <SharedDateFilterBar showProductFilters /> 
                  <div className="p-6">
                    <TrendChart source="stock" embedded displayMode={stockMetric} />
                  </div>
                </>
              ) : (
                <div className="p-6">
                  <DetailModalTable
                    data={stockByProjectData.map((r) => ({
                      name: r.name,
                      daily: stockMetric === 'COUNT' ? r.count : r.value,
                      mtd: stockMetric === 'COUNT' ? r.count : r.value,
                    }))}
                    title="Chi tiết theo Công trình"
                    icon={Briefcase}
                    dateLabel={`NGÀY TỒN LỌC ${
                      closestStockDate
                        ? `(${closestStockDate.getDate().toString().padStart(2, '0')}/${(closestStockDate.getMonth() + 1)
                            .toString()
                            .padStart(2, '0')}/${closestStockDate.getFullYear()})`
                        : ''
                    }`}
                    mtdLabel={`GIÁ TRỊ TỒN MỚI NHẤT ${
                      latestStockStats.date
                        ? `(${latestStockStats.date.getDate().toString().padStart(2, '0')}/${(
                            latestStockStats.date.getMonth() + 1
                          )
                            .toString()
                            .padStart(2, '0')}/${latestStockStats.date.getFullYear()})`
                        : ''
                    }`}
                    unitLabel={stockMetric === 'COUNT' ? '(SL Mã SAP)' : '(Giá trị VND)'}
                    primaryColorClass="text-slate-700"
                    secondaryColorClass="text-slate-900"
                  />
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-white flex justify-end">
              <button
                onClick={() => setIsStockDetailModalOpen(false)}
                className="px-8 py-2.5 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-700 transition-all shadow-md active:scale-95"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </>
    </TrendFilterProvider>
  );
};