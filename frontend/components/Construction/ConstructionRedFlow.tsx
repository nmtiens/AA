import React, { useMemo, useState, useEffect, useRef } from 'react';
import { DataRow, ColumnDefinition } from '../../types';
import { parseVNDate, diffDays } from './../Dashboard/utils/dateHelpers';
import { parseNumber } from './../Dashboard/utils/numberParsers';
import { Filter, XCircle as CloseIcon, AlertTriangle, Eye, EyeOff } from 'lucide-react';
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
import { PivotMaterialStatusSection } from './../Dashboard/components/sections/PivotMaterialStatusSection';
import { MaterialListSection } from './../Dashboard/components/sections/MaterialListSection';
import { ProjectSummarySection_v2, type ProjectMeta } from './../Dashboard/components/sections/ProjectSummarySection_v2';
import { ProjectSummarySection } from './../Dashboard/components/sections/ProjectSummarySection';
import { PivotProjectSection } from './../Dashboard/components/sections/PivotProjectSection';
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
import { filterByView, getProjectsForView } from './utils/viewDataConfig';
import { HexDetailModal, type HexDetailColumnKeys } from './../Dashboard/components/modals/HexDetailModal';
import { ContructionRevenueSection, type CustomFunnelItem } from './../Dashboard/components/sections/ContructionRevenueSection';
import {
  OnLineStageDetailModal,
  TOTAL_STAGE,
  extractStage,
  type StageDetailRow,
} from './../Dashboard/components/modals/OnLineStageDetailModal';
import { ExportDetailModal, type ExportDetailColumnKeys } from './../Dashboard/components/modals/ExportDetailModal';
import { InventoryDetailModal, type InventoryDetailColumnKeys } from './../Dashboard/components/modals/InventoryDetailModal';
import { ProductionDonutPanel } from './../Dashboard/components/shared/ProductionDonutPanel';
interface ConstructionRedFlowProps {
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
  currentUser: string;
}

// Id của view này trong bảng setup (xem CONFIGURABLE_VIEWS trong viewDataConfig.ts).
// Bản Căn mẫu chỉ cần đổi giá trị này thành 'can-mau'.
const VIEW_ID = 'luong-do' as const;

// ---------------------------------------------------------------------------
// Các khối có thể ẩn/hiện (mặc định ẩn, bấm "Mở" để xem).
// ---------------------------------------------------------------------------
type SectionId =
  | 'productionStatus'
  | 'bottleneck'
  | 'khsxPlanActual'
  | 'projectSummaryLegacy'
  | 'pivotProject';

const SECTION_LABELS: Record<SectionId, string> = {
  productionStatus: 'Tình trạng sản xuất',
  bottleneck: 'Báo cáo tỷ trọng điểm nghẽn',
  khsxPlanActual: 'Thống kê tổng hợp: Kế hoạch & Nhập kho',
  projectSummaryLegacy: 'Tình trạng đơn hàng theo Công trình (bảng cũ)',
  pivotProject: 'Chi tiết Giá trị (Công trình x Tình trạng)',
};

// Mặc định tất cả đang ẩn. Đổi true nếu muốn khối nào mở sẵn.
const DEFAULT_OPEN_SECTIONS: Record<SectionId, boolean> = {
  productionStatus: false,
  bottleneck: false,
  khsxPlanActual: false,
  projectSummaryLegacy: false,
  pivotProject: false,
};

// Khung bọc: đóng thì chỉ hiện thanh nhỏ, mở thì hiện nội dung + nút Ẩn.
const CollapsibleSection: React.FC<{
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, open, onToggle, children }) => {
  if (!open) {
    return (
      <div className="flex items-center justify-between bg-white border border-dashed border-slate-300 rounded-xl px-4 py-3">
        <span className="text-sm font-semibold text-slate-500">{title}</span>
        <button
          onClick={onToggle}
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-wood-50 shadow-sm"
        >
          <Eye size={14} /> Mở
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="absolute top-3 right-16 z-10 flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-wood-50 shadow-sm"
      >
        <EyeOff size={14} /> Ẩn
      </button>
      {children}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Chi tiết theo Hex cho bảng "Tình trạng đơn hàng theo Công trình" (v2).
// Chỉ khai báo type + label ở module scope (không dùng hook) — an toàn.
// ---------------------------------------------------------------------------
type HexDetailColumn =
  | 'totalOrder' | 'afterCancel' | 'inventory' | 'notDeployed' | 'onLine'
  | 'remaining' | 'cancelled'
  | 'p002'
  | 'inventoryAfterExport';   // (chỉ để đủ key của Record, không bấm được)

const HEX_COLUMN_LABELS: Record<HexDetailColumn, string> = {
  totalOrder: 'Tổng Giá Trị Đơn Hàng',
  afterCancel: 'Tổng Giá Trị Đơn Hàng Sau Khi Hủy',
  inventory: 'Tổng Giá Trị Đã Nhập Kho',
  notDeployed: 'Chưa Triển Khai (P001)',
  p002: 'Chưa Tính Phiếu (P002)',
  onLine: 'Đang Trên Chuyền (P012->P021)',
  remaining: 'Tổng Giá Trị Đơn Hàng Còn Lại',
  cancelled: 'Tổng Giá Trị Đã Hủy',
  inventoryAfterExport: 'Tồn Kho Sau Xuất Kho',
};

// Cột "inventory" xử lý riêng (mở InventoryDetailModal) nên không nằm ở đây.
const HEX_DETAIL_MODAL_COLUMNS: Exclude<HexDetailColumn, 'inventory'>[] = [
  'totalOrder', 'notDeployed', 'p002', 'onLine', 'remaining',
];

const isHexDetailColumn = (
  column: string
): column is Exclude<HexDetailColumn, 'inventory'> =>
  (HEX_DETAIL_MODAL_COLUMNS as string[]).includes(column);

// ---------------------------------------------------------------------------
// Ánh xạ từ mã bước trong Phễu (BOP: P001, P002... đến P021/GCVT) sang
// cột/giai đoạn tương ứng trong dữ liệu hex gốc, để bấm vào 1 con số trong
// bảng pivot của "Chi tiết dữ liệu Phễu" mở tiếp được modal "Chi tiết theo Hex".
//
// - P001 ứng với cột "notDeployed".
// - P002 ứng với cột "p002".
// - P012 -> P021, GCVT ứng với cột "onLine", lọc thêm theo đúng mã BOP đó.
// - P022 (TỒN KHO) lấy từ nguồn khác nên KHÔNG có hex gốc -> không mở modal.
// ---------------------------------------------------------------------------
const FUNNEL_TO_HEX_TARGET: Partial<Record<string, { column: HexDetailColumn; stage: string | null }>> = {
  P001: { column: 'notDeployed', stage: null },
  P002: { column: 'p002', stage: 'P002' },
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
 *   CÔNG TRÌNH -> `name` = tên công trình (hoặc null = dòng TỔNG CỘNG).
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

const ConstructionRedFlow: React.FC<ConstructionRedFlowProps> = ({
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
  isSidebarCollapsed,
  currentUser,
}) => {
  // viewProjectWhitelist phải nằm BÊN TRONG component (hook useMemo hợp lệ).
  const viewProjectWhitelist = useMemo(
    () => getProjectsForView(VIEW_ID),
    []
  );

  const factoryRevenueRef = useRef<HTMLDivElement>(null);
  const productionStatusRef = useRef<HTMLDivElement>(null);
  const pivotWorkshopRef = useRef<HTMLDivElement>(null);
  const pivotProjectRef = useRef<HTMLDivElement>(null);
  const pivotMaterialStatusRef = useRef<HTMLDivElement>(null);
  const materialListRef = useRef<HTMLDivElement>(null);
  const khsxSectionRef = useRef<HTMLDivElement>(null);
  const inventorySectionRef = useRef<HTMLDivElement>(null);
  // 2 bảng "Tình trạng đơn hàng theo Công trình" → mỗi bảng 1 ref riêng
  const projectSummaryRef = useRef<HTMLDivElement>(null);        // bảng mới (v2)
  const projectSummaryLegacyRef = useRef<HTMLDivElement>(null);  // bảng cũ
  const orderOverviewRef = useRef<HTMLDivElement>(null);
  const bottleneckSectionRef = useRef<HTMLDivElement>(null);

  const {
    hexKey, tinhTrangKey, tinhTrangIpoKey, valueKey, realValueKey, congTrinhKey,
    xuongKey, hangMucKey, daysAtCurrentStageKey, phanLoaiNhomSanPhamKey, bopKey, triGiaDonHangTongKey,
    thanhTienTinhPhieuKey, thanhTienNhapKhoKey,
    matCongTrinhKey, matNhomVtKey, matSlYeuCauKey, matSlDaNhanKey, matStatusKey,
    matStatusSapKey, matEstDateKey,
    khsxXuongKey, khsxCongTrinhKey, khsxNamKey, khsxThangKey, khsxNgayKey, khsxTuanKey,
    invThanhTienKey, invXuongKey, invCongTrinhKey, invNamKey, invThangKey,
    invNgayKey, invDateKey, invTuanKey,
    expThanhTienKey, expDateKey, expXuongKey, expCongTrinhKey, expSoLuongKey,
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
  // 2 FILTER MỚI TRONG "BỘ LỌC TỔNG": Khách hàng + Khu vực dự án
  // ------------------------------------------------------------------------------
  const [selKhachHang, setSelKhachHang] = useState<string[]>([]);
  const [selKhuVuc, setSelKhuVuc] = useState<string[]>([]);

  // Dữ liệu sản xuất đã lọc theo VIEW (chưa lọc Khách hàng / Khu vực)
  // -> dùng để dựng projectMeta và danh sách lựa chọn của 2 filter mới.
  const viewProductionData = useMemo(
    () => filterByView(rawProductionData, congTrinhKey, VIEW_ID),
    [rawProductionData, congTrinhKey]
  );

  // Gom BOT / Khách hàng / Khu vực dự án theo công trình (key = tên công trình viết HOA)
  const projectMeta = useMemo<Record<string, ProjectMeta>>(() => {
    const acc = new Map<string, { bot: Set<string>; khachHang: Set<string>; khuVuc: Set<string> }>();
    if (!congTrinhKey) return {};
    const clean = (v: unknown) => String(v ?? '').trim();

    viewProductionData.forEach(row => {
      const name = clean(row[congTrinhKey]).toUpperCase();
      if (!name) return;
      if (!acc.has(name)) acc.set(name, { bot: new Set(), khachHang: new Set(), khuVuc: new Set() });
      const e = acc.get(name)!;
      const bot = clean(row['bot_du_an']);
      const kh = clean(row['khach_hang']);
      const kv = clean(row['khu_vuc_du_an']);
      if (bot) e.bot.add(bot);
      if (kh) e.khachHang.add(kh);
      if (kv) e.khuVuc.add(kv);
    });

    const out: Record<string, ProjectMeta> = {};
    acc.forEach((v, k) => {
      out[k] = { bot: [...v.bot], khachHang: [...v.khachHang], khuVuc: [...v.khuVuc] };
    });
    return out;
  }, [viewProductionData, congTrinhKey]);

  const khachHangOptions = useMemo(
    () => Array.from(new Set(Object.values(projectMeta).flatMap(m => m.khachHang)))
      .sort((a, b) => a.localeCompare(b, 'vi')),
    [projectMeta]
  );
  const khuVucOptions = useMemo(
    () => Array.from(new Set(Object.values(projectMeta).flatMap(m => m.khuVuc)))
      .sort((a, b) => a.localeCompare(b, 'vi')),
    [projectMeta]
  );

  // Tập công trình thỏa 2 filter mới; null = không lọc
  const allowedProjects = useMemo<Set<string> | null>(() => {
    if (selKhachHang.length === 0 && selKhuVuc.length === 0) return null;
    const s = new Set<string>();
    Object.entries(projectMeta).forEach(([name, m]) => {
      if (selKhachHang.length && !m.khachHang.some(v => selKhachHang.includes(v))) return;
      if (selKhuVuc.length && !m.khuVuc.some(v => selKhuVuc.includes(v))) return;
      s.add(name);
    });
    return s;
  }, [projectMeta, selKhachHang, selKhuVuc]);

  const byMeta = (rows: DataRow[], key?: string): DataRow[] =>
    allowedProjects && key
      ? rows.filter(r => allowedProjects.has(String(r[key] ?? '').trim().toUpperCase()))
      : rows;

  // ------------------------------------------------------------------------------
  // LỌC TOÀN BỘ DỮ LIỆU THEO DANH SÁCH CÔNG TRÌNH ĐÃ SETUP CHO VIEW "luong-do"
  // + 2 filter Khách hàng / Khu vực dự án ở trên.
  //
  // stockData và attendanceData KHÔNG có cột công trình trong useColumnKeys hiện tại
  // nên tạm thời giữ nguyên, chưa lọc theo view.
  // ------------------------------------------------------------------------------
  const productionData = useMemo(
    () => byMeta(viewProductionData, congTrinhKey),
    [viewProductionData, congTrinhKey, allowedProjects]
  );
  const materialData = useMemo(
    () => byMeta(filterByView(rawMaterialData, matCongTrinhKey, VIEW_ID), matCongTrinhKey),
    [rawMaterialData, matCongTrinhKey, allowedProjects]
  );
  const khsxData = useMemo(
    () => byMeta(filterByView(rawKhsxData, khsxCongTrinhKey, VIEW_ID), khsxCongTrinhKey),
    [rawKhsxData, khsxCongTrinhKey, allowedProjects]
  );
  const orderData = useMemo(
    () => byMeta(filterByView(rawOrderData, orderCongTrinhKey, VIEW_ID), orderCongTrinhKey),
    [rawOrderData, orderCongTrinhKey, allowedProjects]
  );
  const inventoryData = useMemo(
    () => byMeta(filterByView(rawInventoryData, invCongTrinhKey, VIEW_ID), invCongTrinhKey),
    [rawInventoryData, invCongTrinhKey, allowedProjects]
  );
  const tkbvData = useMemo(
    () => byMeta(filterByView(rawTkbvData, tkbvCongTrinhKey, VIEW_ID), tkbvCongTrinhKey),
    [rawTkbvData, tkbvCongTrinhKey, allowedProjects]
  );
  const pthspData = useMemo(
    () => byMeta(filterByView(rawPthspData, pthspCongTrinhKey, VIEW_ID), pthspCongTrinhKey),
    [rawPthspData, pthspCongTrinhKey, allowedProjects]
  );
  const analysisData = useMemo(
    () => byMeta(filterByView(rawAnalysisData, analysisCongTrinhKey, VIEW_ID), analysisCongTrinhKey),
    [rawAnalysisData, analysisCongTrinhKey, allowedProjects]
  );
  const exportData = useMemo(
    () => byMeta(filterByView(rawExportData, expCongTrinhKey, VIEW_ID), expCongTrinhKey),
    [rawExportData, expCongTrinhKey, allowedProjects]
  );

  // Whitelist gửi cho các API tổng quan / tồn kho: thu hẹp theo 2 filter mới.
  // (priorityOrder của bảng v2 vẫn dùng viewProjectWhitelist gốc để STT không đổi.)
  const effectiveWhitelist = useMemo(
    () => allowedProjects
      ? viewProjectWhitelist.filter(p => allowedProjects.has(p.trim().toUpperCase()))
      : viewProjectWhitelist,
    [viewProjectWhitelist, allowedProjects]
  );

  const {
    filters,
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

  // Năm đang được chọn ở "LỌC NĂM" trong bộ lọc thống nhất (unifiedTimeFilters.nam).
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
    viewProjectWhitelist: effectiveWhitelist,
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
    viewProjectWhitelist: effectiveWhitelist,
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

    cardMetrics,
    projectStatusSummary,
    projectStatusSummaryV2,
    onLineStageBreakdown,
    onLineStageBreakdownV2,
    onLineAreaBreakdownV2,      // breakdown theo khu vực sản xuất
    hexRowsByColumn,
    hexRowsByColumnV2,
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
    funnelProductionData,
    projectSummaryProductionData,
    filteredMaterialData,
    displayedMaterialData,
    stockDates,
    closestStockDate,
    tinhTrangKey, xuongKey, bopKey, valueKey, realValueKey, hexKey,
    congTrinhKey, hangMucKey, daysAtCurrentStageKey,
    triGiaDonHangTongKey, thanhTienTinhPhieuKey, thanhTienNhapKhoKey,
    matNhomVtKey, matSlYeuCauKey, matSlDaNhanKey, matStatusKey,
    tinhTrangIpoKey,
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

  // Gộp "Xuất kho" theo công trình từ exportData (đã filter theo view):
  // đếm số HEX DUY NHẤT (COUNT) hoặc tổng thành tiền (VALUE), chỉ tính các dòng
  // có tinh_doi_voi_hang_tp = "TÍNH" (đối với hàng thành phẩm).
  const exportedByProject = useMemo(() => {
    const map = new Map<string, number>();
    if (!expCongTrinhKey) return map;
    const isCount = projectSummaryMetric === 'COUNT';

    if (isCount) {
      const hexSetByProject = new Map<string, Set<string>>();
      exportData.forEach(row => {
        const name = String(row[expCongTrinhKey] || '').trim().toUpperCase();
        if (!name) return;
        const tinh = String(row['tinh_doi_voi_hang_tp'] || '').trim().toUpperCase();
        if (tinh !== 'TÍNH') return;
        const hex = String(row['hex'] || '').trim();
        if (!hex) return;
        if (!hexSetByProject.has(name)) hexSetByProject.set(name, new Set());
        hexSetByProject.get(name)!.add(hex);
      });
      hexSetByProject.forEach((set, name) => map.set(name, set.size));
    } else {
      exportData.forEach(row => {
        const name = String(row[expCongTrinhKey] || '').trim().toUpperCase();
        if (!name) return;
        const tinh = String(row['tinh_doi_voi_hang_tp'] || '').trim().toUpperCase();
        if (tinh !== 'TÍNH') return;
        const raw = parseNumber(row[expThanhTienKey]);
        map.set(name, (map.get(name) || 0) + raw / 1000);
      });
    }

    return map;
  }, [exportData, expCongTrinhKey, expThanhTienKey, projectSummaryMetric]);

  // Gộp "Nhập kho" theo công trình từ inventoryData (bảng nhap_kho) để khớp
  // đúng với InventoryDetailModal khi bấm vào xem chi tiết.
  const inventoryByProject = useMemo(() => {
    const map = new Map<string, number>();
    if (!invCongTrinhKey) return map;
    const isCount = projectSummaryMetric === 'COUNT';

    if (isCount) {
      const hexSetByProject = new Map<string, Set<string>>();
      inventoryData.forEach(row => {
        const name = String(row[invCongTrinhKey] || '').trim().toUpperCase();
        if (!name) return;
        const hex = String(row['hex'] || '').trim();
        if (!hex) return;
        if (!hexSetByProject.has(name)) hexSetByProject.set(name, new Set());
        hexSetByProject.get(name)!.add(hex);
      });
      hexSetByProject.forEach((set, name) => map.set(name, set.size));
    } else {
      inventoryData.forEach(row => {
        const name = String(row[invCongTrinhKey] || '').trim().toUpperCase();
        if (!name) return;
        const raw = parseNumber(row[invThanhTienKey]);
        map.set(name, (map.get(name) || 0) + raw / 1000);
      });
    }

    return map;
  }, [inventoryData, invCongTrinhKey, invThanhTienKey, projectSummaryMetric]);

  // Adapter: chuyển projectStatusSummaryV2 sang kiểu của ProjectSummarySection_v2.
  // Phải đặt TRƯỚC early return bên dưới vì đây là hook.
  const projectOrderSummary = useMemo(
    () =>
      projectStatusSummaryV2.map(row => {
        const cancelled = row.cancelled;
        const exported = exportedByProject.get(row.name.trim().toUpperCase()) || 0;
        const inventory = inventoryByProject.get(row.name.trim().toUpperCase()) || 0;
        const notDeployed = row.notDeployed;
        return {
          name: row.name,
          totalOrder: row.totalOrder,
          cancelled,
          afterCancel: row.totalOrder - cancelled,
          inventory,
          exported,
          notDeployed,
          p002: row.p002,          // Chưa tính phiếu P002
          onLine: row.onLine,      // P012 -> P021
          // Giữ nguyên nghĩa cũ: chưa triển khai + toàn bộ đang sản xuất (kể cả P012)
          remaining: notDeployed + row.inProduction,
        };
      }),
    [projectStatusSummaryV2, exportedByProject, inventoryByProject]
  );

  // -------------------------------------------------------------------------
  // Chi tiết theo Hex cho bảng "Tình trạng đơn hàng theo Công trình" (v2).
  // projectName = null nghĩa là bấm từ dòng TỔNG CỘNG (xem tất cả công trình).
  // area (tùy chọn) = khu vực sản xuất, dùng khi bấm từ modal "Đang trên chuyền".
  // -------------------------------------------------------------------------
  const [hexDetail, setHexDetail] = useState<{
    open: boolean;
    column: HexDetailColumn | null;
    projectName: string | null;
    stage: string | null;
    area?: string | null;
  }>({ open: false, column: null, projectName: null, stage: null });

  const [onLineStageDetail, setOnLineStageDetail] = useState<{
    open: boolean;
    projectName: string | null;
  }>({ open: false, projectName: null });

  const [exportDetail, setExportDetail] = useState<{
    open: boolean;
    projectName: string | null;
  }>({ open: false, projectName: null });

  const [inventoryDetail, setInventoryDetail] = useState<{
    open: boolean;
    projectName: string | null;
  }>({ open: false, projectName: null });

  const hexDetailRows = useMemo(() => {
    if (!hexDetail.open || !hexDetail.column) return [];
    let source = hexRowsByColumnV2[hexDetail.column as keyof typeof hexRowsByColumnV2] ?? [];
    if (hexDetail.projectName && congTrinhKey) {
      source = source.filter(row => String(row[congTrinhKey] || '').trim() === hexDetail.projectName);
    }
    // TOTAL_STAGE = tất cả công đoạn đang trên chuyền -> không lọc thêm theo stage
    if (hexDetail.stage && hexDetail.stage !== TOTAL_STAGE && bopKey) {
      source = source.filter(row => extractStage(row[bopKey]) === hexDetail.stage);
    }
    // Lọc theo khu vực sản xuất khi bấm từ modal "Đang trên chuyền"
    if (hexDetail.area && xuongKey) {
      source = source.filter(
        row => (String(row[xuongKey] || '').trim() || 'Chưa xác định') === hexDetail.area
      );
    }
    return source;
  }, [hexDetail, hexRowsByColumnV2, congTrinhKey, bopKey, xuongKey]);

  const hexDetailColumnKeys: HexDetailColumnKeys = useMemo(
    () => ({
      hexKey, congTrinhKey, hangMucKey, xuongKey, bopKey, tinhTrangKey,
      phanLoaiNhomSanPhamKey, triGiaDonHangTongKey, thanhTienTinhPhieuKey, thanhTienNhapKhoKey,
    }),
    [
      hexKey, congTrinhKey, hangMucKey, xuongKey, bopKey, tinhTrangKey,
      phanLoaiNhomSanPhamKey, triGiaDonHangTongKey, thanhTienTinhPhieuKey, thanhTienNhapKhoKey,
    ]
  );

  const exportDetailColumnKeys: ExportDetailColumnKeys = useMemo(
    () => ({
      hexKey: 'hex',
      hangMucKey: 'ten_hang_muc',
      congTrinhKey: expCongTrinhKey,
      xuongKey: expXuongKey,
      dateKey: expDateKey,
      soLuongKey: expSoLuongKey,
      thanhTienKey: expThanhTienKey,
      ghiChuXuatKhoKey: 'ghi_chu',
    }),
    [expCongTrinhKey, expXuongKey, expDateKey, expSoLuongKey, expThanhTienKey]
  );

  const exportDetailRows = useMemo(() => {
    if (!exportDetail.open || !expCongTrinhKey) return [];

    const base = exportDetail.projectName
      ? exportData.filter(
          row => String(row[expCongTrinhKey] || '').trim().toUpperCase() === exportDetail.projectName!.trim().toUpperCase()
        )
      : exportData; // dòng TỔNG CỘNG -> xem tất cả công trình

    // Lọc thêm theo tinh_doi_voi_hang_tp = "TÍNH" để khớp đúng cách card đang đếm
    return base.filter(
      row => String(row['tinh_doi_voi_hang_tp'] || '').trim().toUpperCase() === 'TÍNH'
    );
  }, [exportDetail, exportData, expCongTrinhKey]);

  const inventoryDetailColumnKeys: InventoryDetailColumnKeys = useMemo(
    () => ({
      hexKey: 'hex',
      hangMucKey: 'ten_hang_muc',
      congTrinhKey: invCongTrinhKey,
      xuongKey: invXuongKey,
      dateKey: invDateKey,
      thanhTienKey: invThanhTienKey,
      ghiChuKey: 'ghi_chu',
      soLuongKey: 'so_luong_nhap_kho',
    }),
    [invCongTrinhKey, invXuongKey, invDateKey, invThanhTienKey]
  );

  const inventoryDetailRows = useMemo(() => {
    if (!inventoryDetail.open || !invCongTrinhKey) return [];
    if (!inventoryDetail.projectName) return inventoryData; // TỔNG CỘNG -> xem tất cả
    const target = inventoryDetail.projectName.trim().toUpperCase();
    return inventoryData.filter(
      row => String(row[invCongTrinhKey] || '').trim().toUpperCase() === target
    );
  }, [inventoryDetail, inventoryData, invCongTrinhKey]);

  // Bấm vào số trong bảng pivot của "Chi tiết dữ liệu Phễu" -> mở HexDetailModal
  // đúng cột/giai đoạn tương ứng (xem FUNNEL_TO_HEX_TARGET và resolveFunnelHexTarget).
  const handleFunnelPivotValueClick = (name: string | null, item: CustomFunnelItem | null) => {
    const target = resolveFunnelHexTarget(name, item);
    if (!target) return; // vd. bước P022 (Tồn kho) không có dữ liệu hex gốc
    setHexDetail({ open: true, column: target.column, projectName: target.projectName, stage: target.stage });
  };

  // Rows cho modal "Đang trên chuyền" — mỗi dòng là 1 KHU VỰC SẢN XUẤT.
  // Bấm 1 công trình: chỉ lấy khu vực của công trình đó.
  // Bấm TỔNG CỘNG: cộng dồn tất cả công trình theo khu vực.
  const onLineStageRows = useMemo<StageDetailRow[]>(() => {
    if (!onLineStageDetail.open) return [];

    const projects = onLineStageDetail.projectName
      ? [onLineStageDetail.projectName]
      : Object.keys(onLineAreaBreakdownV2);

    const merged: Record<string, Record<string, number>> = {};
    projects.forEach(p => {
      const areas = onLineAreaBreakdownV2[p.trim()] ?? {};
      Object.entries(areas).forEach(([area, stages]) => {
        if (!merged[area]) merged[area] = {};
        Object.entries(stages).forEach(([stage, v]) => {
          merged[area][stage] = (merged[area][stage] || 0) + v;
        });
      });
    });

    return Object.entries(merged)
      .map(([name, values]) => ({ name, values }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [onLineStageDetail, onLineAreaBreakdownV2]);

  // Trạng thái mở/ẩn của 5 khối có thể thu gọn (phải nằm TRƯỚC early return).
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>(DEFAULT_OPEN_SECTIONS);

  const toggleSection = (id: SectionId) =>
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));

  const [activeFunnelItem, setActiveFunnelItem] = useState<CustomFunnelItem | null>(null);

  useEffect(() => {
    if (activeFunnelItem?.id === 'P022') {
      loadStockByProject();
    }
  }, [activeFunnelItem, loadStockByProject]);

  const activeFunnelPivotData = useMemo(() => {
    if (!activeFunnelItem) return pivotFunnelData; // chưa chọn bước nào -> giữ tổng theo BOP như cũ

    // P022. TỒN KHO không nằm trong filteredProductionData/bopKey như các bước
    // khác -> lấy breakdown riêng từ stockByProjectData.
    if (activeFunnelItem.id === 'P022') {
      return {
        data: stockByProjectData,
        total: stockByProjectData.reduce((sum, r) => sum + r.value, 0),
      };
    }

    return funnelBreakdownByBop[activeFunnelItem.id] ?? { data: [], total: 0 };
  }, [activeFunnelItem, pivotFunnelData, funnelBreakdownByBop, stockByProjectData]);

  // Chỉ hiện thông báo "chưa setup" khi KHÔNG đang lọc Khách hàng / Khu vực;
  // nếu đang lọc mà ra rỗng thì vẫn giữ thanh bộ lọc để người dùng xóa lọc.
  if (!allowedProjects && productionData.length === 0 && materialData.length === 0 && khsxData.length === 0) {
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
      {/* Sticky Header & Filters */}
      <div className="sticky top-0 z-40 bg-wood-50/95 backdrop-blur-sm border-b border-wood-200 px-4 py-3 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Công trình luồng đỏ</h2>
            </div>
          </div>

          {/* Dashboard Filters */}
          <div className="flex flex-wrap gap-2 items-center w-full md:w-auto justify-end">
            <div className="flex items-center gap-2 mr-1 text-slate-500">
              <Filter size={14} /> <span className="text-[10px] uppercase font-bold">Bộ lọc tổng:</span>
            </div>
               {khachHangOptions.length > 0 && (
              <DashboardFilter
                label="Khách Hàng"
                options={khachHangOptions}
                selectedValues={selKhachHang}
                onChange={setSelKhachHang}
              />
            )}
            {khuVucOptions.length > 0 && (
              <DashboardFilter
                label="Khu Vực Dự Án"
                options={khuVucOptions}
                selectedValues={selKhuVuc}
                onChange={setSelKhuVuc}
              />
            )}
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
       
            {(hasActiveFilters || selKhachHang.length > 0 || selKhuVuc.length > 0) && (
              <button
                onClick={() => { clearFilters(); setSelKhachHang([]); setSelKhuVuc([]); }}
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

        {/* BẢNG MỚI (v2): dùng dữ liệu đã qua adapter projectOrderSummary */}
        <ProjectSummarySection_v2
          sectionRef={projectSummaryRef}
          projectStatusSummary={projectOrderSummary}
          priorityOrder={viewProjectWhitelist}
          clickableColumns={['totalOrder', 'inventory', 'exported', 'notDeployed', 'p002', 'onLine', 'remaining']}
          onCellClick={({ projectName, column }) => {
            if (column === 'onLine') {
              setOnLineStageDetail({ open: true, projectName });
              return;
            }
            if (column === 'exported') {
              setExportDetail({ open: true, projectName });
              return;
            }
            // Cột "inventory" (Đã Nhập Kho P022) mở InventoryDetailModal, lấy dữ liệu
            // thật từ bảng nhap_kho (inventoryData) — cùng nguồn với số đang hiển thị.
            if (column === 'inventory') {
              setInventoryDetail({ open: true, projectName });
              return;
            }
            if (isHexDetailColumn(column)) {
              setHexDetail({ open: true, column, projectName, stage: null });
            }
          }}
          projectSummaryMetric={projectSummaryMetric}
          setProjectSummaryMetric={setProjectSummaryMetric}
          projectMeta={projectMeta}
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
          sideContent={
            <ProductionDonutPanel
              data={productionData}
              columns={productionColumns}
              congTrinh={filters.congTrinh}
              xuong={filters.xuong}
            />
          }
        />

        <PivotMaterialStatusSection
          sectionRef={pivotMaterialStatusRef}
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

        {/* --- ORDER OVERVIEW (BÁO CÁO TỔNG QUAN) --- */}
        <OrderOverviewSection
          sectionRef={orderOverviewRef}
          isSidebarCollapsed={isSidebarCollapsed}
          hasAnyData={orderData.length > 0 || tkbvData.length > 0 || pthspData.length > 0}
          filters={filters}
          viewProjectWhitelist={effectiveWhitelist}
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

        {/* 1. TÌNH TRẠNG SẢN XUẤT (thu gọn) */}
        <CollapsibleSection
          title={SECTION_LABELS.productionStatus}
          open={openSections.productionStatus}
          onToggle={() => toggleSection('productionStatus')}
        >
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
        </CollapsibleSection>

        {/* 2. BÁO CÁO ĐIỂM NGHẼN (thu gọn) */}
        <CollapsibleSection
          title={SECTION_LABELS.bottleneck}
          open={openSections.bottleneck}
          onToggle={() => toggleSection('bottleneck')}
        >
          <BottleneckSection
            sectionRef={bottleneckSectionRef}
            bottleneckData={bottleneckData}
            topBottlenecks={topBottlenecks}
            bottleneckViewMode={bottleneckViewMode}
            setBottleneckViewMode={setBottleneckViewMode}
            handleExportBottlenecks={handleExportBottlenecks}
          />
        </CollapsibleSection>

        {/* 3. KẾ HOẠCH & NHẬP KHO (thu gọn) */}
        <CollapsibleSection
          title={SECTION_LABELS.khsxPlanActual}
          open={openSections.khsxPlanActual}
          onToggle={() => toggleSection('khsxPlanActual')}
        >
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
        </CollapsibleSection>

        {/* 4. BẢNG CŨ: giữ dữ liệu cũ (projectStatusSummary), dùng ref riêng (thu gọn) */}
        <CollapsibleSection
          title={SECTION_LABELS.projectSummaryLegacy}
          open={openSections.projectSummaryLegacy}
          onToggle={() => toggleSection('projectSummaryLegacy')}
        >
          <ProjectSummarySection
            sectionRef={projectSummaryLegacyRef}
            projectStatusSummary={projectStatusSummary}
            projectSummaryMetric={projectSummaryMetric}
            setProjectSummaryMetric={setProjectSummaryMetric}
          />
        </CollapsibleSection>

        {/* 5. CHI TIẾT GIÁ TRỊ (CÔNG TRÌNH x TÌNH TRẠNG) (thu gọn) */}
        <CollapsibleSection
          title={SECTION_LABELS.pivotProject}
          open={openSections.pivotProject}
          onToggle={() => toggleSection('pivotProject')}
        >
          <PivotProjectSection
            sectionRef={pivotProjectRef}
            pivotProjectData={pivotProjectData}
            projectMetric={projectMetric}
            setProjectMetric={setProjectMetric}
            excludeFabrics={excludeFabrics}
            setExcludeFabrics={setExcludeFabrics}
          />
        </CollapsibleSection>

      </div>

      <HexDetailModal
        isOpen={hexDetail.open}
        onClose={() => setHexDetail(prev => ({ ...prev, open: false }))}
        title={
          hexDetail.column
            ? HEX_COLUMN_LABELS[hexDetail.column] +
              (hexDetail.stage && hexDetail.stage !== TOTAL_STAGE ? ` – ${hexDetail.stage}` : '') +
              (hexDetail.area ? ` – ${hexDetail.area}` : '')
            : ''
        }
        projectName={hexDetail.projectName}
        rows={hexDetailRows}
        columnKeys={hexDetailColumnKeys}
        currentUser={currentUser}
      />

      <OnLineStageDetailModal
        isOpen={onLineStageDetail.open}
        onClose={() => setOnLineStageDetail(prev => ({ ...prev, open: false }))}
        projectName={onLineStageDetail.projectName}
        metric={projectSummaryMetric === 'VALUE' ? 'VALUE' : 'COUNT'}
        rows={onLineStageRows}
        onValueClick={(areaName, stage) =>
          setHexDetail({
            open: true,
            column: 'onLine',
            projectName: onLineStageDetail.projectName, // tên công trình lấy từ state
            stage,
            area: areaName,
          })
        }
      />

      <ExportDetailModal
        isOpen={exportDetail.open}
        onClose={() => setExportDetail(prev => ({ ...prev, open: false }))}
        projectName={exportDetail.projectName}
        rows={exportDetailRows}
        columnKeys={exportDetailColumnKeys}
      />

      <InventoryDetailModal
        isOpen={inventoryDetail.open}
        onClose={() => setInventoryDetail(prev => ({ ...prev, open: false }))}
        projectName={inventoryDetail.projectName}
        rows={inventoryDetailRows}
        columnKeys={inventoryDetailColumnKeys}
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

export default ConstructionRedFlow;