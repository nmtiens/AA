import React, { useState, useEffect, useRef } from 'react';
import {
  ShoppingCart, FileText, ClipboardList, Package, Box, Eye, Download, X,
  Layers, Building2, Briefcase, XCircle as CloseIcon,
  TrendingUp,
  Table2,
} from 'lucide-react';
import { DashboardFilter } from '../shared/DashboardFilter';
import { DisplayModeToggle } from '../shared/DisplayModeToggle';
import { DetailModalTable } from '../shared/DetailModalTable';
import YearPlanTable from '../Dashboards/YearPlanTable';
import TrendChart from '../Dashboards/TrendChart';
import ByXuongChart from '../Dashboards/ByXuongChart';
import ByCongTrinhChart from '../Dashboards/ByCongTrinhChart';
import TrendByCategoryChart from '../Dashboards/TrendByCategoryChart';
import { TrendFilterProvider, useTrendFilter } from '../Dashboards/TrendFilterContext';
import SharedDateFilterBar from '../Dashboards/SharedDateFilterBar';
import { useMoDanhSachHex, layHexChiTiet } from '../Dashboards/DanhSachHex';
import { getYesterdayDateOption, parseVNDate, toISODateLocal } from '../../utils/dateHelpers';
import { formatTrieuAsTy } from '../../../../utils/money';
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

// MỚI: giá trị congTrinh/xuong ĐANG ACTIVE trong TrendFilterContext của modal đang mở.
// '' nghĩa là "chưa chọn cụ thể" -> dùng nguyên bộ lọc tổng của Dashboard (hành vi cũ).
interface GroupAnalysisOverride {
  congTrinh: string;
  xuong: string;
}

interface OrderOverviewSectionProps {
  sectionRef: React.Ref<HTMLDivElement>;
  isSidebarCollapsed: boolean;
  hasAnyData: boolean;

  filters: { congTrinh: string[]; xuong: string[]; tinhTrang: string[]; tinhTrangIpo: string[] };
  // Danh sách công trình đã setup cho nhóm (hiện không trang nào truyền — nhóm Luồng đỏ / Căn mẫu
  // nằm trong Tổng quan công trình; Dashboard tổng KHÔNG truyền -> undefined).
  // Dùng để tính effectiveCongTrinh bên dưới, PHẢI GIỐNG HỆT công thức
  // getEffectiveCongTrinh() trong useOverviewSummary.ts, nếu không filterKey ở đây
  // sẽ lệch với key mà loadGroupAnalysis dùng để GHI cache, khiến
  // toAnalysisItems(groupAnalysisCache[...]) luôn đọc phải mảng rỗng.
  viewProjectWhitelist?: string[];

  // Không còn dùng: mọi giá trị tiền đều hiển thị Tỷ, 2 chữ số thập phân
  useDetailedNumbers?: boolean;

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
  // ✅ SỬA: nhận thêm override (congTrinh/xuong đang active trong modal) để fetch/khoá
  // cache ĐÚNG với dữ liệu đang hiển thị ở tab "Biểu đồ xu hướng".
  loadGroupAnalysis: (
    key: 'order' | 'tkbv' | 'pthsp' | 'inventory' | 'export',
    override?: GroupAnalysisOverride
  ) => void;
  // ✅ MỚI: tính filterKey THEO ĐÚNG công thức mà loadGroupAnalysis dùng để ghi cache —
  // dùng ở đây để ĐỌC cache, tránh lệch key giữa ghi và đọc.
  getGroupAnalysisFilterKey: (override?: GroupAnalysisOverride) => string;
  /** Bấm 1 số ở bảng chi tiết Tồn kho theo Công trình => Dashboard mở StockItemsModal của công trình */
  onOpenStockItems?: (projectName: string) => void;
  handleOpenOrderExport: () => void;
  handleOpenGenericExport: (flow: 'tkbv' | 'pthsp' | 'inventory' | 'export' | 'stock') => void;
  loadStockByProject: () => void;
    openInventoryRequest?: { nonce: number; year: number; withPlan?: boolean } | null;
  /** Bấm thẻ đầu trang (Đơn hàng mới / Tính phiếu / Nhập kho) => mở cửa sổ chi tiết của kỳ đang xem */
  moChiTietRequest?: { nonce: number; k: 'order' | 'tkbv' | 'pthsp' | 'inventory' | 'export' | 'stock' } | null;
  /** Ẩn dải "Dòng chảy" (đầu trang đã có 6 thẻ) — vẫn giữ các cửa sổ chi tiết */
  anDai?: boolean;
}

// ---------------------------------------------------------------------------
// MỚI: TrendFilterBridge
// ---------------------------------------------------------------------------
// Component "cầu nối" phải render BÊN TRONG <TrendFilterProvider> (vì chỉ ở đó
// useTrendFilter() mới có context để đọc). Nhiệm vụ duy nhất: mỗi khi congTrinh/xuong
// đang active trong TrendFilterContext (bộ lọc mà người dùng chỉnh trực tiếp ở tab
// "Biểu đồ xu hướng" qua SharedDateFilterBar) thay đổi, báo giá trị đó ra ngoài cho
// OrderOverviewSection biết, để:
//   1. Tính lại filterKey dùng để ĐỌC groupAnalysisCache cho tab "Chi tiết dữ liệu".
//   2. Tự động gọi lại loadGroupAnalysis() để NẠP cache theo đúng bộ lọc mới.
// Không render gì ra DOM (return null).
const TrendFilterBridge: React.FC<{
  onChange: (v: GroupAnalysisOverride) => void;
}> = ({ onChange }) => {
  const { congTrinh, xuong } = useTrendFilter();
  useEffect(() => {
    onChange({ congTrinh, xuong });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [congTrinh, xuong]);
  return null;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const OrderOverviewSection: React.FC<OrderOverviewSectionProps> = ({
  sectionRef,
  isSidebarCollapsed,
  hasAnyData,
  filters,
  viewProjectWhitelist, // ✅ FIX
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
  getGroupAnalysisFilterKey, // MỚI
  onOpenStockItems,
  handleOpenOrderExport,
  handleOpenGenericExport,
  loadStockByProject,
    openInventoryRequest,
    moChiTietRequest,
    anDai,
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

  // MỚI: đếm số lần MỞ bất kỳ modal nào trong section này (dùng chung 1 counter).
  // Mỗi lần tăng -> TrendFilterProvider tự đồng bộ lại xuong/congTrinh theo bộ lọc tổng.
  const [trendResetKey, setTrendResetKey] = useState(0);
  const openModalWithTrendReset = (opener: () => void) => {
    setTrendResetKey(k => k + 1);
    opener();
  };

    // ✅ MỚI: mở modal Nhập Kho theo cả năm khi có yêu cầu từ ngoài (ô "Thực hiện lũy kế").
  // Bộ lọc ngày của modal đang dùng chung với "ngày báo cáo" của Tổng quan, nên lưu lại giá trị
  // cũ và khôi phục khi đóng modal để các thẻ Tổng quan không bị đổi.
  const [granularityRequest, setGranularityRequest] =
    useState<{ nonce: number; value: 'day' | 'week' | 'month'; presetDays?: number } | null>(null);
  const prevOverviewDatesRef = useRef<string[] | null>(null);
  const [inventoryPlanOverlay, setInventoryPlanOverlay] = useState(false);

  useEffect(() => {
    if (!openInventoryRequest) return;
    const start = new Date(openInventoryRequest.year, 0, 1).getTime();
    const end = new Date(openInventoryRequest.year, 11, 31).getTime();
    const datesInYear = unifiedDateOptions.filter(opt => {
      const d = parseVNDate(opt);
      return !!d && d.getTime() >= start && d.getTime() <= end;
    });

    if (prevOverviewDatesRef.current === null) prevOverviewDatesRef.current = overviewDateFilters;
    setOverviewDateFilters(datesInYear);
    setInventoryTab('chart');
    setInventoryMetric('SUM');
    setGranularityRequest({ nonce: openInventoryRequest.nonce, value: 'month', presetDays: 365 });
    // Cột kế hoạch năm chỉ hiện khi mở từ ô "Kế hoạch năm"
    setInventoryPlanOverlay(!!openInventoryRequest.withPlan);
    openModalWithTrendReset(() => setIsInventoryDetailModalOpen(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openInventoryRequest?.nonce]);

  const closeInventoryModal = () => {
    setIsInventoryDetailModalOpen(false);
    setInventoryPlanOverlay(false);
    if (prevOverviewDatesRef.current !== null) {
      setOverviewDateFilters(prevOverviewDatesRef.current);
      prevOverviewDatesRef.current = null;
    }
  };

  // ✅ MỚI: giá trị congTrinh/xuong ĐANG ACTIVE trong TrendFilterContext, đổ ra từ
  // TrendFilterBridge (render bên trong <TrendFilterProvider> ở cuối file). Đây là
  // NGUỒN SỰ THẬT DUY NHẤT dùng để tính filterKey cho CẢ 2 TAB, thay vì tab "Chi tiết
  // dữ liệu" tự tính theo filters.congTrinh/xuong (Dashboard) như trước đây.
  const [activeTrendFilter, setActiveTrendFilter] = useState<GroupAnalysisOverride>({
    congTrinh: filters.congTrinh[0] || '',
    xuong: filters.xuong[0] || '',
  });

  // ✅ SỬA: reset activeTrendFilter mỗi khi 1 modal được mở lại (đồng bộ với
  // trendResetKey/TrendFilterProvider), tránh dùng sót giá trị của lần mở modal trước.
  useEffect(() => {
    setActiveTrendFilter({
      congTrinh: filters.congTrinh[0] || '',
      xuong: filters.xuong[0] || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendResetKey]);

  // ✅ MỚI: mỗi khi bộ lọc ĐANG ACTIVE trong modal (activeTrendFilter) hoặc bộ lọc ngày
  // chung (overviewDateFilters) đổi, NẠP LẠI cache cho ĐÚNG modal đang mở. Đây là phần
  // còn thiếu trước đây khiến tab "Chi tiết dữ liệu" không bao giờ tự refetch khi người
  // dùng đổi công trình/ngày ở tab "Biểu đồ xu hướng".
  useEffect(() => {
    if (isIpoDetailModalOpen) loadGroupAnalysis('order', activeTrendFilter);
    else if (isTkbvDetailModalOpen) loadGroupAnalysis('tkbv', activeTrendFilter);
    else if (isPthspDetailModalOpen) loadGroupAnalysis('pthsp', activeTrendFilter);
    else if (isInventoryDetailModalOpen) loadGroupAnalysis('inventory', activeTrendFilter);
    else if (isExportDetailModalOpen) loadGroupAnalysis('export', activeTrendFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeTrendFilter,
    overviewDateFilters,
    isIpoDetailModalOpen,
    isTkbvDetailModalOpen,
    isPthspDetailModalOpen,
    isInventoryDetailModalOpen,
    isExportDetailModalOpen,
  ]);

  // ---------- Bấm 1 ô số ở bảng "Chi tiết theo Xưởng / Công trình" => danh sách hạng mục (view có sẵn của Dashboard) ----------
  // Như phễu (OnLineStageDetailModal.onValueClick -> HexDetailModal): lấy các HEX tạo nên số đó rồi Dashboard mở
  // HexDetailModal từ bảng sản xuất; Tồn kho -> StockItemsModal (danh sách mã tồn của công trình, ngày tồn đang lọc).
  // HEX lấy qua /api/detail?chiHex=1 (chỉ danh sách HEX, không giới hạn dòng) cùng phạm vi với số trên bảng (/api/overview/by-group): cột "trong ngày" = các ngày đang
  // chọn (không chọn ngày => toàn bộ thời gian), cột "lũy kế" = đầu tháng -> ngày đang xem; cùng bộ lọc xưởng / công
  // trình đang áp trong cửa sổ.
  const moDanhSachHex = useMoDanhSachHex();
  const dsReq = useRef(0);
  const moDanhSach = (source: string, dimension: 'xuong' | 'congtrinh', ten: string) => (name: string, kind: 'daily' | 'mtd') => {
    if (source === 'stock') { onOpenStockItems?.(name); return; }
    if (!moDanhSachHex) return;
    const params = new URLSearchParams({ source, dimension, value: name, granularity: 'day' });
    const ngay = overviewDateFilters.map(d => parseVNDate(d)).filter((d): d is Date => d !== null).map(toISODateLocal).sort();
    const moc = ngay.length ? ngay[ngay.length - 1] : (overviewSummary?.date ?? '');
    let nhan = '';
    if (kind === 'daily') {
      if (ngay.length) { params.set('dates', ngay.join(',')); nhan = ngay.length === 1 ? `ngày ${ngay[0].split('-').reverse().join('/')}` : `${ngay.length} ngày đang chọn`; }
      else nhan = 'toàn bộ thời gian';
    } else if (moc) {
      params.set('dateFrom', `${moc.slice(0, 7)}-01`);
      params.set('dateTo', moc);
      nhan = `lũy kế tháng ${moc.slice(5, 7)}/${moc.slice(0, 4)}`;
    }
    if (activeTrendFilter.xuong && dimension !== 'xuong') params.set('xuong', activeTrendFilter.xuong);
    if (activeTrendFilter.congTrinh && dimension !== 'congtrinh') params.set('congTrinh', activeTrendFilter.congTrinh);
    if (viewProjectWhitelist !== undefined) params.set('ctWhitelist', viewProjectWhitelist.map(x => x.trim().toUpperCase()).join('|') + '|');
    const id = ++dsReq.current;
    layHexChiTiet(params)
      .then(d => { if (id === dsReq.current) moDanhSachHex(`${ten} — ${name} · ${nhan}`, d); })
      .catch(() => { /* lỗi mạng: không mở */ });
  };

  // value (triệu đồng) -> Tỷ, 2 chữ số thập phân (dùng chung toàn app)
  const formatValueNumber = formatTrieuAsTy;

  const valueUnitLabel = 'Tỷ';

  useEffect(() => {
    if (!moChiTietRequest) return;
    const k = moChiTietRequest.k;
    if (k === 'stock') { openModalWithTrendReset(() => { setIsStockDetailModalOpen(true); loadStockByProject(); }); return; }
    const mo = { order: setIsIpoDetailModalOpen, tkbv: setIsTkbvDetailModalOpen, pthsp: setIsPthspDetailModalOpen,
      inventory: setIsInventoryDetailModalOpen, export: setIsExportDetailModalOpen }[k];
    openModalWithTrendReset(() => { mo(true); loadGroupAnalysis(k, activeTrendFilter); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moChiTietRequest?.nonce]);

  if (!hasAnyData) return null;

  // ✅ SỬA: filterKey giờ tính qua getGroupAnalysisFilterKey(activeTrendFilter) — dùng
  // CHÍNH XÁC công thức mà loadGroupAnalysis (useOverviewSummary.ts) dùng để GHI cache,
  // và luôn phản ánh đúng công trình/xưởng NGƯỜI DÙNG ĐANG THẤY trong modal (kể cả khi
  // họ vừa đổi ở tab "Biểu đồ xu hướng"), thay vì filters.congTrinh/xuong tĩnh của
  // Dashboard như code cũ.
  const filterKey = getGroupAnalysisFilterKey(activeTrendFilter);

  // --- MỚI: Nhãn cột "ngày" trong modal chi tiết — phản ánh đúng khi chọn nhiều ngày.
const periodLabel = overviewDateFilters.length > 1
  ? `${overviewDateFilters.length} NGÀY CÓ DỮ LIỆU`
  : `NGÀY ${latestUnifiedDate ? `${latestUnifiedDate.getDate()}/${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`;
  // Số tháng trước của ngày dữ liệu (getMonth() là 0–11: tháng 1 trước hiện "T0" => phải là T12)
  const prevMonthNo = latestUnifiedDate ? (latestUnifiedDate.getMonth() === 0 ? 12 : latestUnifiedDate.getMonth()) : '';

 
  return (
    <TrendFilterProvider
      overviewDateFilters={overviewDateFilters}
      setOverviewDateFilters={setOverviewDateFilters}
      unifiedDateOptions={unifiedDateOptions}
      defaultXuong={filters.xuong[0] || ''}          // MỚI
      defaultCongTrinh={filters.congTrinh[0] || ''}  // MỚI
      resetKey={trendResetKey}    
      viewProjectWhitelist={viewProjectWhitelist} 
        granularityRequest={granularityRequest}                    // MỚI
    >
    {/* ✅ MỚI: cầu nối đọc congTrinh/xuong đang active trong context ra ngoài, để tab
        "Chi tiết dữ liệu" (bên ngoài phạm vi hook context) biết và tự refetch/tính key */}
    <TrendFilterBridge onChange={setActiveTrendFilter} />
    <>
      {/* DÒNG CHẢY THÁNG (thay 6 thẻ to "Báo cáo tổng quan"): 6 ô 1 hàng — lũy kế tháng (số chính), tháng trước +
          trong ngày (dòng phụ); 1 nút Số lượng / Giá trị + 1 bộ lọc ngày chung; bấm ô mở chi tiết & xu hướng như cũ */}
      <div ref={sectionRef} className={anDai ? 'hidden' : 'scroll-mt-24 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white'}>
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 lg:px-6">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-slate-900">
              Dòng chảy {overviewDateFilters.length > 1
                ? `${overviewDateFilters.length} ngày đã chọn`
                : latestUnifiedDate ? `ngày ${String(latestUnifiedDate.getDate()).padStart(2, '0')}/${String(latestUnifiedDate.getMonth() + 1).padStart(2, '0')}` : 'trong ngày'}
            </h3>
            <p className="mt-0.5 text-sm text-slate-500">
              {getContextLabel()} · số lớn = trong ngày, dòng dưới = lũy kế tháng và T{prevMonthNo} · bấm 1 ô để xem chi tiết & xu hướng
            </p>
          </div>
          <div className="flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Chế độ hiển thị">
            {([['COUNT', 'Số lượng'], ['SUM', 'Giá trị']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setOverviewMetric(k)}
                className={`rounded-md px-3 py-1 text-sm ${overviewMetric === k ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {overviewDateRangeDisplay && <span className="text-sm text-slate-500">{overviewDateRangeDisplay}</span>}
            <DashboardFilter
              label="Ngày báo cáo"
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
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              title="Xuất Excel tổng hợp"
            >
              <Download size={15} aria-hidden /> Xuất Excel
            </button>
            {overviewDateFilters.length > 0 && (
              <button
                onClick={() => {
                  const target = getYesterdayDateOption(unifiedDateOptions);
                  setOverviewDateFilters(target ? [target] : []);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                title="Về mặc định (Hôm qua)"
                aria-label="Về mặc định (Hôm qua)"
              >
                <CloseIcon size={16} />
              </button>
            )}
          </div>
        </div>

        {(() => {
          const dem = overviewMetric === 'COUNT';
          const so = (c: number | undefined, v: number | undefined) => (dem ? (c ?? 0).toLocaleString('en-US') : formatValueNumber(v ?? 0));
          const ngay = (d: Date | null | undefined) => (d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` : 'N/A');
          const luong = [
            { k: 'order', ten: 'Đơn hàng mới', ma: 'P001', dv: 'đơn', s: overviewSummary?.order,
              hint: 'Đơn hàng có ngày nhận từ PM trong ngày / tháng đang xem (bảng Đơn hàng tổng, không tính đơn HỦY). Khác thẻ "Nhóm đơn hàng": thẻ đó tính mọi hạng mục đang theo dõi, không theo ngày.',
              mo: () => openModalWithTrendReset(() => { setIsIpoDetailModalOpen(true); loadGroupAnalysis('order', activeTrendFilter); }) },
            { k: 'tkbv', ten: 'Triển khai BV', ma: 'P002', dv: 'bản vẽ', s: overviewSummary?.tkbv, hint: 'Bản vẽ đã triển khai (TKBV)',
              mo: () => openModalWithTrendReset(() => { setIsTkbvDetailModalOpen(true); loadGroupAnalysis('tkbv', activeTrendFilter); }) },
            { k: 'pthsp', ten: 'Tính phiếu', ma: 'P012', dv: 'phiếu', s: overviewSummary?.pthsp, hint: 'Phiếu đã tính (PTHSP)',
              mo: () => openModalWithTrendReset(() => { setIsPthspDetailModalOpen(true); loadGroupAnalysis('pthsp', activeTrendFilter); }) },
            { k: 'inventory', ten: 'Nhập kho', ma: 'P022', dv: 'mục', s: overviewSummary?.inventory, hint: 'Hạng mục nhập kho',
              mo: () => openModalWithTrendReset(() => { setIsInventoryDetailModalOpen(true); loadGroupAnalysis('inventory', activeTrendFilter); }) },
            { k: 'export', ten: 'Xuất kho', ma: 'P025', dv: 'mục', s: overviewSummary?.export, hint: 'Hạng mục xuất kho',
              mo: () => openModalWithTrendReset(() => { setIsExportDetailModalOpen(true); loadGroupAnalysis('export', activeTrendFilter); }) },
          ];
          const o = 'group flex flex-col bg-white p-4 text-left transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 lg:p-5';
          return (
            <div className="grid grid-cols-2 gap-px border-t border-slate-200 bg-slate-200 md:grid-cols-3 xl:grid-cols-6">
              {luong.map((x, idx) => (
                <button key={x.k} type="button" onClick={x.mo} className={o} title={`${x.hint}\nBấm để xem chi tiết & xu hướng`}>
                  <span className="flex items-center gap-1.5 text-sm text-slate-600">
                    {idx + 1}. {x.ten} <span className="text-xs text-slate-400">{x.ma}</span>
                    <Eye size={14} className="ml-auto text-slate-300 group-hover:text-slate-600" aria-hidden />
                  </span>
                  <span className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                    {so(x.s?.daily.count, x.s?.daily.value)}
                    <span className="ml-1 text-sm font-medium text-slate-400">{dem ? x.dv : valueUnitLabel.toLowerCase()}</span>
                  </span>
                  <span className="mt-0.5 text-sm text-slate-500">
                    Lũy kế tháng {so(x.s?.mtd.count, x.s?.mtd.value)} · T{prevMonthNo}: {so(x.s?.lastMonth?.count, x.s?.lastMonth?.value)}
                  </span>
                </button>
              ))}
              <button type="button" className={o}
                onClick={() => openModalWithTrendReset(() => { setIsStockDetailModalOpen(true); loadStockByProject(); })}
                title={`Tồn kho ngày ${ngay(closestStockDate)} · mới nhất ${ngay(latestStockStats.date)}: ${so(latestStockStats.count, latestStockStats.value)}\nBấm để xem chi tiết`}>
                <span className="flex items-center gap-1.5 text-sm text-slate-600">
                  6. Tồn kho <span className="text-xs text-slate-400">{ngay(closestStockDate)}</span>
                  <Eye size={14} className="ml-auto text-slate-300 group-hover:text-slate-600" aria-hidden />
                </span>
                <span className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                  {dem ? stockOverviewCardValue.toLocaleString('en-US') : formatValueNumber(stockOverviewCardValue)}
                  <span className="ml-1 text-sm font-medium text-slate-400">{dem ? 'mục' : valueUnitLabel.toLowerCase()}</span>
                </span>
                <span className="mt-0.5 text-sm text-slate-500">
                  cuối T{prevMonthNo}: {so(latestStockStatsPrevMonth.count, latestStockStatsPrevMonth.value)}
                </span>
              </button>
            </div>
          );
        })()}
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
      <p className="text-xs text-slate-500 mt-1">Đơn hàng nhận từ PM trong khoảng ngày đang chọn · nguồn Đơn hàng tổng (khác thẻ "Nhóm đơn hàng": hạng mục đang theo dõi, không theo ngày)</p>
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
                  <TrendByCategoryChart kind="phanloai" source="order" displayMode={ipoMetric} embedded />
<TrendByCategoryChart kind="dvt" source="order" displayMode={ipoMetric} embedded />
                  </div>
                </>
              ) : (
                <div className="p-6">
                  <DetailModalTable
                    onValueClick={moDanhSach('order', 'xuong', 'Đơn hàng mới')}
                    data={toAnalysisItems(groupAnalysisCache[`order-xuong-${filterKey}`] ?? [], ipoMetric)}
                    title="Chi tiết theo Xưởng"
                    icon={Layers}
                    dateLabel={periodLabel}
                    mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                    unitLabel={ipoMetric === 'COUNT' ? '(SL HEX)' : '(Tỷ đồng)'}
                    formatValue={ipoMetric === 'COUNT' ? undefined : formatTrieuAsTy}
                    primaryColorClass="text-pink-600"
                    secondaryColorClass="text-indigo-600"
                    defaultExcludedKeys={[]}
                  />

                  <div className="border-t border-slate-200 pt-6">
                    <DetailModalTable
                      onValueClick={moDanhSach('order', 'congtrinh', 'Đơn hàng mới')}
                      data={toAnalysisItems(groupAnalysisCache[`order-congtrinh-${filterKey}`] ?? [], ipoMetric)}
                      unitLabel={ipoMetric === 'COUNT' ? '(SL HEX)' : '(Tỷ đồng)'}
                      formatValue={ipoMetric === 'COUNT' ? undefined : formatTrieuAsTy}
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
  <ByXuongChart source="tkbv" displayMode={tkbvMetric} />
  <ByCongTrinhChart source="tkbv" displayMode={tkbvMetric} />
  <TrendByCategoryChart kind="phanloai" source="tkbv" displayMode={tkbvMetric} embedded />
  <TrendByCategoryChart kind="dvt" source="tkbv" displayMode={tkbvMetric} embedded />
</div>
                </>
              ) : (
                <div className="p-6">
                  <DetailModalTable
                    onValueClick={moDanhSach('tkbv', 'xuong', 'Triển khai BV')}
                    data={toAnalysisItems(groupAnalysisCache[`tkbv-xuong-${filterKey}`] ?? [], tkbvMetric)}
                    title="Chi tiết theo Xưởng"
                    icon={Layers}
                    dateLabel={periodLabel}
                    mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                    unitLabel={tkbvMetric === 'COUNT' ? '(SL Bản vẽ)' : '(Tỷ đồng)'}
                    formatValue={tkbvMetric === 'COUNT' ? undefined : formatTrieuAsTy}
                    primaryColorClass="text-blue-600"
                    secondaryColorClass="text-indigo-600"
                  />

                  <div className="border-t border-slate-200 pt-6">
                    <DetailModalTable
                      onValueClick={moDanhSach('tkbv', 'congtrinh', 'Triển khai BV')}
                      data={toAnalysisItems(groupAnalysisCache[`tkbv-congtrinh-${filterKey}`] ?? [], tkbvMetric)}
                      title="Chi tiết theo Công trình"
                      icon={Building2}
                      dateLabel={periodLabel}
                      mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                      unitLabel={tkbvMetric === 'COUNT' ? '(SL Bản vẽ)' : '(Tỷ đồng)'}
                      formatValue={tkbvMetric === 'COUNT' ? undefined : formatTrieuAsTy}
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
  <ByXuongChart source="pthsp" displayMode={pthspMetric} />
  <ByCongTrinhChart source="pthsp" displayMode={pthspMetric} />
  <TrendByCategoryChart kind="phanloai" source="pthsp" displayMode={pthspMetric} embedded />
  <TrendByCategoryChart kind="dvt" source="pthsp" displayMode={pthspMetric} embedded />
</div>
                </>
              ) : (
                <div className="p-6">
                  <DetailModalTable
                    onValueClick={moDanhSach('pthsp', 'xuong', 'Tính phiếu')}
                    data={toAnalysisItems(groupAnalysisCache[`pthsp-xuong-${filterKey}`] ?? [], pthspMetric)}
                    title="Chi tiết theo Xưởng"
                    icon={Layers}
                    dateLabel={periodLabel}
                    mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                    unitLabel={pthspMetric === 'COUNT' ? '(SL Phiếu)' : '(Tỷ đồng)'}
                    formatValue={pthspMetric === 'COUNT' ? undefined : formatTrieuAsTy}
                    primaryColorClass="text-purple-600"
                    secondaryColorClass="text-fuchsia-600"
                  />

                  <div className="border-t border-slate-200 pt-6">
                    <DetailModalTable
                      onValueClick={moDanhSach('pthsp', 'congtrinh', 'Tính phiếu')}
                      data={toAnalysisItems(groupAnalysisCache[`pthsp-congtrinh-${filterKey}`] ?? [], pthspMetric)}
                      title="Chi tiết theo Công trình"
                      icon={Building2}
                      dateLabel={periodLabel}
                      mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                      unitLabel={pthspMetric === 'COUNT' ? '(SL Phiếu)' : '(Tỷ đồng)'}
                      formatValue={pthspMetric === 'COUNT' ? undefined : formatTrieuAsTy}
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
          <div className="bg-white rounded-2xl shadow-2xl w-[97%] max-w-none h-[94vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300">
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
      onClick={closeInventoryModal}
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
  <TrendChart source="inventory" embedded displayMode={inventoryMetric} planOverlay={inventoryPlanOverlay} />
  <ByXuongChart source="inventory" displayMode={inventoryMetric} planOverlay={inventoryPlanOverlay} />
  {inventoryPlanOverlay ? (
    // Mở từ ô "Kế hoạch năm": kế hoạch năm không chia theo công trình / nhóm SP / ĐVT
    // -> thay 3 biểu đồ đó bằng bảng KH – TH phân cấp Năm / 6 tháng / Quý / Tháng
    <YearPlanTable />
  ) : (
    <>
      <ByCongTrinhChart source="inventory" displayMode={inventoryMetric} />
      <TrendByCategoryChart kind="phanloai" source="inventory" displayMode={inventoryMetric} embedded />
      <TrendByCategoryChart kind="dvt" source="inventory" displayMode={inventoryMetric} embedded />
    </>
  )}
</div>
                </>
              ) : (
                <div className="p-6">
                  <DetailModalTable
                    onValueClick={moDanhSach('inventory', 'xuong', 'Nhập kho')}
                    data={toAnalysisItems(groupAnalysisCache[`inventory-xuong-${filterKey}`] ?? [], inventoryMetric)}
                    title="Chi tiết theo Xưởng"
                    icon={Layers}
                    dateLabel={periodLabel}
                    mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                    unitLabel={inventoryMetric === 'COUNT' ? '(SL Items)' : '(Tỷ đồng)'}
                    formatValue={inventoryMetric === 'COUNT' ? undefined : formatTrieuAsTy}
                    primaryColorClass="text-teal-600"
                    secondaryColorClass="text-emerald-600"
                  />

                  <div className="border-t border-slate-200 pt-6">
                    <DetailModalTable
                      onValueClick={moDanhSach('inventory', 'congtrinh', 'Nhập kho')}
                      data={toAnalysisItems(groupAnalysisCache[`inventory-congtrinh-${filterKey}`] ?? [], inventoryMetric)}
                      title="Chi tiết theo Công trình"
                      icon={Building2}
                      dateLabel={periodLabel}
                      mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                      unitLabel={inventoryMetric === 'COUNT' ? '(SL Items)' : '(Tỷ đồng)'}
                      formatValue={inventoryMetric === 'COUNT' ? undefined : formatTrieuAsTy}
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
  <div className={`fixed inset-y-0 right-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-all duration-300 left-0 ${isSidebarCollapsed ? 'md:left-20' : 'md:left-64'}`}>
    <div className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300">
      <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
        <div className="flex items-center gap-6">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Package className="text-amber-600" size={20} />
              Chi tiết Xuất Kho
            </h3>
            <p className="text-xs text-slate-500 mt-1">Dữ liệu được tổng hợp từ nguồn Xuất Kho</p>
          </div>
          <div className="inline-flex items-center gap-1 bg-white border border-amber-200 rounded-lg p-1 shadow-sm">
            <button
              onClick={() => setExportTab('detail')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${
                exportTab === 'detail' ? 'bg-amber-600 text-white shadow-sm' : 'text-amber-600 hover:bg-amber-50'
              }`}
            >
              <Table2 size={14} />
              <span>Chi tiết dữ liệu</span>
            </button>
            <button
              onClick={() => setExportTab('chart')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${
                exportTab === 'chart' ? 'bg-amber-600 text-white shadow-sm' : 'text-amber-600 hover:bg-amber-50'
              }`}
            >
              <TrendingUp size={14} />
              <span>Biểu đồ xu hướng</span>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <DisplayModeToggle current={exportMetric} onChange={setExportMetric} />
          <button
            onClick={() => handleOpenGenericExport('export')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg text-xs font-bold border border-amber-200 transition-all shadow-sm active:scale-95 cursor-pointer"
            title="Xuất dữ liệu Xuất kho ra file .CSV"
          >
            <Download size={15} />
            <span>Xuất CSV</span>
          </button>
          <button
            onClick={() => setIsExportDetailModalOpen(false)}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* ...giữ nguyên <div className="flex-1 overflow-y-auto ..."> phần body... */}
            <div className="flex-1 overflow-y-auto bg-slate-50/50 custom-scrollbar">
              {exportTab === 'chart' ? (
                <>
                  <SharedDateFilterBar showProductFilters /> 
                 <div className="p-6">
  <TrendChart source="export" embedded displayMode={exportMetric} />
  <ByXuongChart source="export" displayMode={exportMetric} />
  <ByCongTrinhChart source="export" displayMode={exportMetric} />
  <TrendByCategoryChart kind="phanloai" source="export" displayMode={exportMetric} embedded />
  <TrendByCategoryChart kind="dvt" source="export" displayMode={exportMetric} embedded />
</div>
                </>
              ) : (
                <div className="p-6">
                  <DetailModalTable
                    onValueClick={moDanhSach('export', 'xuong', 'Xuất kho')}
                    data={toAnalysisItems(groupAnalysisCache[`export-xuong-${filterKey}`] ?? [], exportMetric)}
                    title="Chi tiết theo Xưởng"
                    icon={Layers}
                    dateLabel={periodLabel}
                    mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                    unitLabel={exportMetric === 'COUNT' ? '(SL HEX)' : '(Tỷ đồng)'}
                    primaryColorClass="text-amber-600"
                    secondaryColorClass="text-orange-600"
                  />

                  <div className="mt-8 pt-8 border-t border-slate-200">
                    <DetailModalTable
                      onValueClick={moDanhSach('export', 'congtrinh', 'Xuất kho')}
                      data={toAnalysisItems(groupAnalysisCache[`export-congtrinh-${filterKey}`] ?? [], exportMetric)}
                      title="Chi tiết theo Công trình"
                      icon={Briefcase}
                      dateLabel={periodLabel}
                      mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                      unitLabel={exportMetric === 'COUNT' ? '(SL HEX)' : '(Tỷ đồng)'}
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
  <div className={`fixed inset-y-0 right-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-all duration-300 left-0 ${isSidebarCollapsed ? 'md:left-20' : 'md:left-64'}`}>
    <div className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300">
      <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
        <div className="flex items-center gap-6">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Box className="text-slate-600" size={20} />
              Chi tiết Tồn Kho
            </h3>
            <p className="text-xs text-slate-500 mt-1">Dữ liệu được tổng hợp từ nguồn Tồn Kho</p>
          </div>
          <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
            <button
              onClick={() => setStockTab('detail')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${
                stockTab === 'detail' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Table2 size={14} />
              <span>Chi tiết dữ liệu</span>
            </button>
            <button
              onClick={() => setStockTab('chart')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${
                stockTab === 'chart' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <TrendingUp size={14} />
              <span>Biểu đồ xu hướng</span>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <DisplayModeToggle current={stockMetric} onChange={setStockMetric} />
          <button
            onClick={() => handleOpenGenericExport('stock')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-xs font-bold border border-slate-200 transition-all shadow-sm active:scale-95 cursor-pointer"
            title="Xuất dữ liệu Tồn kho ra file .CSV"
          >
            <Download size={15} />
            <span>Xuất CSV</span>
          </button>
          <button
            onClick={() => setIsStockDetailModalOpen(false)}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* ...giữ nguyên phần body... */}

            <div className="flex-1 overflow-y-auto bg-slate-50/50 custom-scrollbar">
              {stockTab === 'chart' ? (
                <>
                   <SharedDateFilterBar showProductFilters /> 
                <div className="p-6">
  <TrendChart source="stock" embedded displayMode={stockMetric} />
  <ByXuongChart source="stock" displayMode={stockMetric} />
  <ByCongTrinhChart source="stock" displayMode={stockMetric} />
  <TrendByCategoryChart kind="phanloai" source="stock" displayMode={stockMetric} embedded />
  <TrendByCategoryChart kind="dvt" source="stock" displayMode={stockMetric} embedded />
</div>
                </>
              ) : (
                <div className="p-6">
                  <DetailModalTable
                    onValueClick={moDanhSach('stock', 'congtrinh', 'Tồn kho')}
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
                    unitLabel={stockMetric === 'COUNT' ? '(SL Mã SAP)' : '(Tỷ đồng)'}
                    formatValue={stockMetric === 'COUNT' ? undefined : formatTrieuAsTy}
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
