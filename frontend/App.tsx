// src/App.tsx
import React, { useState, useEffect, useRef, useMemo, Suspense, lazy } from 'react';
import DesktopModeHint from './components/shared/DesktopModeHint';
import { HashRouter, Routes, Route, Link, useLocation, Navigate, Outlet, useOutletContext } from 'react-router-dom';
import { LayoutDashboard, Table, Menu, RefreshCw, X, Box, Package, LogOut, Shield, BarChart3, Key, Loader, Check, AlertTriangle, Calendar, ShoppingCart, Import, FileText, ClipboardList, TrendingUp, CalendarRange, Upload, Clock, ChevronDown, Database, Settings, Columns, Smartphone, Search, Factory } from 'lucide-react';
import { getCachedData, getCachedVersion, saveToCache, fetchAllDataFromServer, fetchPlanMet, fetchProjectAliases } from './services/dataService';
import { DataRow, ColumnDefinition, PRODUCTION_DEFAULT_VIEW_COLUMNS, TARGET_COLUMN_NAMES, APP_VIEWS } from './types';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { userService } from './services/userService';
import { useColumnKeys } from './components/Dashboard/hooks/useColumnKeys';
import { canonicalizeProjectNames, canonicalizePersonNames, setPlanMet, setServerProjectAliases } from './utils/productionMetrics';
import { loadWorkshopGroups, canonicalizeWorkshops } from './utils/workshopGroups';
// Prefetch + gate cho mapping "view -> danh sách công trình"
import { loadViewMapping, isViewMappingLoaded } from './components/Construction/utils/viewDataConfig';
// Prefetch cho cấu hình "bảng -> danh sách cột được phép / mặc định hiện"
import { loadTableColumnConfig, applyTableColumnConfig } from './components/Construction/utils/tableColumnConfig';
import './index.css';
import { InstallMobileAppModal } from './components/Dashboard/components/modals/InstallMobileAppModal';
import { disablePush } from './services/vuongMacMobileApi';
import { DataUpdateLogModal } from './components/Dashboard/components/modals/DataUpdateLogModal';
import { ModalShell } from './components/shared/ModalShell';
// Áp dụng Lazy Loading: Tách các component ra khỏi bundle ban đầu
const ChartOverview = lazy(() => import('./components/Charts/ChartOverview'));
const loadDashboardPage = () => import('./components/Dashboard');
const Dashboard = lazy(loadDashboardPage);
const DataGrid = lazy(() => import('./components/DataGrid'));
const Login = lazy(() => import('./components/Login'));
const UserManagement = lazy(() => import('./components/UserManagement'));
const ConstructionSetup = lazy(() => import('./components/Construction/ConstructionSetup'));
const loadConstructionPage = () => import('./components/Construction/ConstructionOverview');
const ConstructionOverview = lazy(loadConstructionPage);
const TableColumnSetup = lazy(() => import('./components/Construction/TableColumnSetup'));
const WorkshopGroupSetup = lazy(() => import('./components/Construction/WorkshopGroupSetup'));
import type { SetupTab } from './components/Setup/DataSetupPage';
const DataSetupPage = lazy(() => import('./components/Setup/DataSetupPage'));
// Bản mobile (PWA) chạy tại /m/ — file này phải có `export default`
const MobileApp = lazy(() => import('./components/Mobile/VuongMacMobile'));
// Tra cứu hex: dùng chung component với bản mobile (đã có bố cục riêng cho desktop)
const HexLookup = lazy(() => import('./components/Mobile/HexLookup'));
// Màn quản lý vướng mắc sản xuất (desktop) — dùng chung sheet chi tiết với app điện thoại
const VuongMacManager = lazy(() => import('./components/VuongMac/VuongMacManager'));

// Vòng chờ trong vùng nội dung (giữ menu); label = đang làm bước nào (đọc dữ liệu đã lưu / tính số liệu...)
const ContentLoader: React.FC<{ label?: string }> = ({ label }) => (
  <div className="h-full flex flex-col items-center justify-center gap-3">
    <div className="w-7 h-7 border-[3px] border-slate-200 border-t-wood-600 rounded-full animate-spin"></div>
    {label && <p className="text-sm text-slate-500">{label}</p>}
  </div>
);

// Loading hiển thị trong lúc tải file JS của component
const FullScreenLoader = () => (
  <div className="h-screen flex items-center justify-center bg-wood-50">
    <div className="w-7 h-7 border-[3px] border-slate-200 border-t-wood-600 rounded-full animate-spin"></div>
  </div>
);

// ============================================================
// MỤC CON CỦA CÁC NHÓM MENU (permId = id quyền trong user.permissions)
// Phải khớp với PERMISSION_GROUPS trong types.ts
// ============================================================
const CHART_SUB_ITEMS: { key: string; label: string; path: string; permId: string }[] = [
  { key: 'order', label: '1. ĐƠN HÀNG MỚI (P001)', path: '/charts/order', permId: 'chart_order' },
  { key: 'tkbv', label: '2. TRIỂN KHAI BV (P002)', path: '/charts/tkbv', permId: 'chart_tkbv' },
  { key: 'pthsp', label: '3. ĐÃ TÍNH PHIẾU (P012)', path: '/charts/pthsp', permId: 'chart_pthsp' },
  { key: 'inventory', label: '4. NHẬP KHO (P022)', path: '/charts/inventory', permId: 'chart_inventory' },
  { key: 'export', label: '5. XUẤT KHO (P025)', path: '/charts/export', permId: 'chart_export' },
  { key: 'stock', label: '6. TỒN KHO', path: '/charts/stock', permId: 'chart_stock' },
];

const CONSTRUCTION_PATH = '/cong-trinh/tong-quan';
// Lúc mở app chờ tối đa bấy nhiêu cho setup gộp xưởng / KH đã đạt / bảng tên công trình trước khi áp dữ liệu
const META_WAIT_MS = 1500;

// Bảng dữ liệu (tải đủ dòng về trình duyệt) mà từng trang cần — trang không có trong danh sách lấy số qua API
// (Tra cứu HEX, Vướng mắc, Biểu đồ, Quản trị user) nên không phải chờ đọc / tải ~440 nghìn dòng. Trang lạ /
// Tổng quan / Setup dữ liệu cần đủ 12 bảng. Bảng đã nạp thì giữ, chuyển trang chỉ nạp thêm bảng còn thiếu.
const ALL_TABLE_ENDPOINTS = ['production', 'material', 'khsx', 'order', 'inventory', 'tkbv', 'pthsp', 'analysis', 'yearly-plan', 'export', 'stock', 'attendance'];
const tablesForPath = (path: string): string[] => {
  const one: Record<string, string> = {
    '/list': 'production', '/yearly-plan': 'yearly-plan', '/orders': 'order', '/inventory': 'inventory', '/export': 'export',
    '/stock': 'stock', '/attendance': 'attendance', '/khsx': 'khsx', '/analysis': 'analysis', '/tkbv': 'tkbv', '/pthsp': 'pthsp',
    '/materials': 'material',
  };
  if (one[path]) return [one[path]];
  if (path === '/cong-trinh/tong-quan') return ['production', 'inventory'];
  if (path === '/tra-cuu-hex' || path === '/vuong-mac' || path === '/users' || path.startsWith('/charts/')) return [];
  return ALL_TABLE_ENDPOINTS;
};
// File JS (lazy) của trang nặng: tải song song lúc đọc dữ liệu, không đợi dữ liệu xong mới tải
const preloadPageChunk = (path: string) => {
  if (path === '/') loadDashboardPage();
  else if (path === CONSTRUCTION_PATH) loadConstructionPage();
};
const App: React.FC = () => {
  // Vào qua /m hoặc /m/... -> chạy giao diện mobile (PWA), ngược lại chạy app desktop
  const isMobileEntry = window.location.pathname.startsWith('/m');

  // Lưu ý: view-project-mapping + table-column-config giờ được tải trong MainLayout
  // (chỉ chạy sau khi đã đăng nhập), vì backend bắt buộc token cho mọi /api/*.
  // Tải ở đây khi chưa đăng nhập sẽ bị 401 và cache lại cấu hình rỗng.

  return (
    <ToastProvider>
      <AuthProvider>
        {/* Suspense bao bọc để hiển thị Loader trong lúc tải Lazy Component */}
        <Suspense fallback={<FullScreenLoader />}>
          {isMobileEntry ? (
            <MobileApp />
          ) : (
            <>
            {/* Điện thoại mở ở chế độ "Trang web cho máy tính" => nhắc cách sửa */}
            <DesktopModeHint />
            <HashRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route element={<MainLayout />}>
                  {/* --- Tổng quan --- */}
                  <Route path="/" element={<RequirePermission viewId="dashboard"><DashboardWrapper /></RequirePermission>} />
                  <Route path="/tra-cuu-hex" element={<RequirePermission viewId="hex_lookup"><HexLookupWrapper /></RequirePermission>} />
                  <Route path="/vuong-mac" element={<RequirePermission viewId="vuong_mac"><VuongMacManager /></RequirePermission>} />

                  {/* --- Nhóm Dữ liệu --- */}
                  <Route path="/list" element={<RequirePermission viewId="production"><DataGridWrapper type="production" /></RequirePermission>} />
                  <Route path="/yearly-plan" element={<RequirePermission viewId="yearly_plan_data"><YearlyPlanDataWrapper /></RequirePermission>} />
                  <Route path="/orders" element={<RequirePermission viewId="orders"><OrderDataWrapper /></RequirePermission>} />
                  <Route path="/inventory" element={<RequirePermission viewId="inventory"><InventoryDataWrapper /></RequirePermission>} />
                  <Route path="/export" element={<RequirePermission viewId="export"><ExportDataWrapper /></RequirePermission>} />
                  <Route path="/stock" element={<RequirePermission viewId="stock"><StockDataWrapper /></RequirePermission>} />
                  <Route path="/attendance" element={<RequirePermission viewId="attendance"><AttendanceDataWrapper /></RequirePermission>} />
                  <Route path="/khsx" element={<RequirePermission viewId="khsx"><DataGridWrapper type="khsx" /></RequirePermission>} />
                  <Route path="/analysis" element={<RequirePermission viewId="analysis"><AnalysisDataWrapper /></RequirePermission>} />
                  <Route path="/tkbv" element={<RequirePermission viewId="tkbv"><TkbvDataWrapper /></RequirePermission>} />
                  <Route path="/pthsp" element={<RequirePermission viewId="pthsp"><PthspDataWrapper /></RequirePermission>} />
                  <Route path="/materials" element={<RequirePermission viewId="materials"><DataGridWrapper type="material" /></RequirePermission>} />

                  {/* --- Nhóm Công trình --- */}
                  <Route path="/cong-trinh/tong-quan" element={<RequirePermission viewId="construction_overview"><ConstructionOverviewWrapper /></RequirePermission>} />
                  {/* Luồng đỏ / Căn mẫu không còn là trang riêng: chọn nhóm ngay trong Tổng quan công trình (link cũ chuyển về đó) */}
                  <Route path="/cong-trinh/luong-do" element={<Navigate to="/cong-trinh/tong-quan" replace />} />
                  <Route path="/cong-trinh/can-mau" element={<Navigate to="/cong-trinh/tong-quan" replace />} />
                  {/* Setup dữ liệu: 1 trang chung, chọn mục bằng thẻ (?tab=). Đường dẫn cũ của 3 trang setup chuyển về đúng thẻ */}
                  <Route path="/setup" element={<DataSetupWrapper />} />
                  <Route path="/cong-trinh/setup" element={<Navigate to="/setup?tab=nhom-cong-trinh" replace />} />

                  {/* --- Nhóm Quản trị (Biểu đồ): mỗi biểu đồ 1 quyền riêng --- */}
                  {CHART_SUB_ITEMS.map(item => (
                    <Route
                      key={item.key}
                      path={item.path}
                      element={
                        <RequirePermission viewId={item.permId}>
                          <ChartOverview source={item.key as any} title={item.label} />
                        </RequirePermission>
                      }
                    />
                  ))}

                  {/* --- Hệ thống --- */}
                  <Route path="/users" element={<RequirePermission viewId="users"><UserManagement /></RequirePermission>} />
                  <Route path="/setup/cot-du-lieu" element={<Navigate to="/setup?tab=cot-du-lieu" replace />} />
                  <Route path="/setup/gop-xuong" element={<Navigate to="/setup?tab=gop-xuong" replace />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </HashRouter>
            </>
          )}
        </Suspense>
      </AuthProvider>
    </ToastProvider>
  );
};

const RequirePermission: React.FC<{ children: React.ReactElement, viewId: string }> = ({ children, viewId }) => {
  const { user, isLoading, hasPermission } = useAuth();
  if (isLoading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!hasPermission(viewId)) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500">
        <Shield className="w-12 h-12 text-slate-300 mb-4" strokeWidth={1.5} />
        <h2 className="text-base font-semibold text-slate-700">Truy cập bị từ chối</h2>
        <p className="text-sm text-slate-400 mt-1">Bạn chưa được cấp quyền xem mục này.</p>
      </div>
    );
  }
  return children;
};

// ------------------------------------------------------------
// Wrapper components
// ------------------------------------------------------------
const DashboardWrapper = () => { const context = useOutletContext<MainLayoutContext>(); return <Dashboard {...context} />; };

// HexLookup vốn viết cho mobile (root dùng min-h-screen) nên cần khung cuộn riêng
// khi đặt vào vùng main của desktop (main đang overflow-hidden).
const HexLookupWrapper = () => (
  <div className="h-full overflow-y-auto">
    <HexLookup />
  </div>
);

// Gate cho tới khi view-project-mapping đã load xong (dùng chung cho 2 trang Công trình)
const useViewMappingReady = () => {
  const [mappingReady, setMappingReady] = useState(isViewMappingLoaded());

  useEffect(() => {
    if (mappingReady) return;
    let cancelled = false;
    loadViewMapping().then(() => {
      if (!cancelled) setMappingReady(true);
    });
    return () => { cancelled = true; };
  }, [mappingReady]);

  return mappingReady;
};

const ConstructionOverviewWrapper = () => {
  const context = useOutletContext<MainLayoutContext>();
  const { user } = useAuth();
  const mappingReady = useViewMappingReady();
  if (!mappingReady) return <FullScreenLoader />;
  // Chờ danh sách công trình của nhóm Luồng đỏ / Căn mẫu (Công trình → Setup) để lọc theo nhóm
  return <ConstructionOverview data={context.productionData} columns={context.productionColumns} currentUser={user?.username ?? ''} inventory={context.inventoryData} />;
};

const ConstructionSetupWrapper = () => {
  const context = useOutletContext<MainLayoutContext>();

  const { congTrinhKey } = useColumnKeys({
    productionColumns: context.productionColumns,
    materialColumns: context.materialColumns,
    khsxColumns: context.khsxColumns,
    inventoryColumns: context.inventoryColumns,
    exportColumns: context.exportColumns,
    stockColumns: context.stockColumns,
    orderColumns: context.orderColumns,
    tkbvColumns: context.tkbvColumns,
    pthspColumns: context.pthspColumns,
    analysisColumns: context.analysisColumns,
    attendanceColumns: context.attendanceColumns,
  });

  return (
    <ConstructionSetup
      productionData={context.productionData}
      congTrinhKey={congTrinhKey}
      embedded
    />
  );
};

// Setup cột dữ liệu cho toàn bộ các bảng — lấy danh sách cột hiện có của mỗi
// bảng từ context (đã tải sẵn) để đưa vào màn hình chọn cột.
const TableColumnSetupWrapper = () => {
  const context = useOutletContext<MainLayoutContext>();
  const columnsByTable: Record<string, ColumnDefinition[]> = {
    production: context.productionColumns,
    order: context.orderColumns,
    inventory: context.inventoryColumns,
    export: context.exportColumns,
    stock: context.stockColumns,
    attendance: context.attendanceColumns,
    khsx: context.khsxColumns,
    analysis: context.analysisColumns,
    tkbv: context.tkbvColumns,
    pthsp: context.pthspColumns,
    material: context.materialColumns,
    yearlyPlan: context.yearlyPlanColumns,
  };
  return <TableColumnSetup columnsByTable={columnsByTable} embedded />;
};

// Trang chung Setup dữ liệu: mỗi thẻ hiện theo đúng quyền của trang setup cũ tương ứng
//   Nhóm công trình (Luồng đỏ / Căn mẫu): quyền construction_setup · Cột dữ liệu: table_column_setup ·
//   Gộp xưởng: chỉ ADMIN (lưu xong báo MainLayout gộp lại dữ liệu đã tải + tải lại trang)
const DataSetupWrapper = () => {
  const { user, isLoading, hasPermission } = useAuth();
  if (isLoading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  const tabs: SetupTab[] = [];
  if (hasPermission('construction_setup')) tabs.push({
    id: 'nhom-cong-trinh', label: 'Nhóm công trình', desc: 'Công trình thuộc nhóm Luồng đỏ / Căn mẫu',
    icon: <Box size={16} />, render: () => <ConstructionSetupWrapper />,
  });
  if (hasPermission('table_column_setup')) tabs.push({
    id: 'cot-du-lieu', label: 'Cột dữ liệu', desc: 'Cột được hiện & thứ tự cột từng bảng',
    icon: <Columns size={16} />, render: () => <TableColumnSetupWrapper />,
  });
  if (user.role === 'ADMIN') tabs.push({
    id: 'gop-xuong', label: 'Gộp xưởng', desc: 'Gộp mã xưởng nhỏ vào 1 xưởng (chỉ Admin)',
    icon: <Factory size={16} />,
    render: () => <WorkshopGroupSetup embedded onSaved={() => window.dispatchEvent(new Event('workshop-groups-changed'))} />,
  });
  return <DataSetupPage tabs={tabs} />;
};

const YearlyPlanDataWrapper = () => {
  const context = useOutletContext<MainLayoutContext>();
  const { columns, defaultVisibleColumns } = applyTableColumnConfig(context.yearlyPlanColumns, 'yearlyPlan');
  const primarySearchCol = columns.length > 0 ? { header: columns[0].key, label: 'Tìm kiếm' } : { header: 'ID', label: 'Tìm kiếm' };
  return <DataGrid data={context.yearlyPlanData} columns={columns} defaultVisibleColumns={defaultVisibleColumns} primarySearchColumn={primarySearchCol} exportFileNamePrefix="du_lieu_ke_hoach_nam" enableAggregation={true} />;
};

const OrderDataWrapper = () => {
  const context = useOutletContext<MainLayoutContext>();
  const { columns, defaultVisibleColumns } = applyTableColumnConfig(context.orderColumns, 'order');
  return <DataGrid data={context.orderData} columns={columns} defaultVisibleColumns={defaultVisibleColumns} primarySearchColumn={{ header: TARGET_COLUMN_NAMES.HEX, label: 'Tìm kiếm (HEX/Mã)' }} filterHeaders={[TARGET_COLUMN_NAMES.CONG_TRINH, TARGET_COLUMN_NAMES.TINH_TRANG]} exportFileNamePrefix="du_lieu_don_hang_tong" enableAggregation={true} />;
};

const InventoryDataWrapper = () => {
  const context = useOutletContext<MainLayoutContext>();
  const { columns, defaultVisibleColumns } = applyTableColumnConfig(context.inventoryColumns, 'inventory');
  return <DataGrid data={context.inventoryData} columns={columns} defaultVisibleColumns={defaultVisibleColumns} primarySearchColumn={{ header: TARGET_COLUMN_NAMES.HEX, label: 'Tìm kiếm (HEX/Mã)' }} filterHeaders={[TARGET_COLUMN_NAMES.CONG_TRINH, TARGET_COLUMN_NAMES.XUONG]} exportFileNamePrefix="du_lieu_nhap_kho" enableAggregation={true} />;
};

const ExportDataWrapper = () => {
  const context = useOutletContext<MainLayoutContext>();
  const { columns, defaultVisibleColumns } = applyTableColumnConfig(context.exportColumns, 'export');
  return <DataGrid data={context.exportData} columns={columns} defaultVisibleColumns={defaultVisibleColumns} primarySearchColumn={{ header: TARGET_COLUMN_NAMES.HEX, label: 'Tìm kiếm (HEX/Mã)' }} filterHeaders={[TARGET_COLUMN_NAMES.CONG_TRINH, TARGET_COLUMN_NAMES.XUONG]} exportFileNamePrefix="du_lieu_xuat_kho" enableAggregation={true} />;
};

const StockDataWrapper = () => {
  const context = useOutletContext<MainLayoutContext>();
  const { columns, defaultVisibleColumns } = applyTableColumnConfig(context.stockColumns, 'stock');
  return <DataGrid data={context.stockData} columns={columns} defaultVisibleColumns={defaultVisibleColumns} primarySearchColumn={{ header: 'MÃ CÔNG TRÌNH', label: 'Tìm kiếm (Mã CT)' }} filterHeaders={['MÃ CÔNG TRÌNH', 'TÌNH TRẠNG KẾ HOẠCH GIAO HÀNG', 'TÊN SẢN PHẨM']} exportFileNamePrefix="du_lieu_ton_kho" enableAggregation={true} />;
};

const AttendanceDataWrapper = () => {
  const context = useOutletContext<MainLayoutContext>();
  const { columns, defaultVisibleColumns } = applyTableColumnConfig(context.attendanceColumns, 'attendance');
  return <DataGrid data={context.attendanceData} columns={columns} defaultVisibleColumns={defaultVisibleColumns} primarySearchColumn={{ header: 'DATE', label: 'Ngày (Tìm kiếm)' }} filterHeaders={['XƯỞNG CHÍNH']} exportFileNamePrefix="du_lieu_diem_danh" enableAggregation={true} />;
};

const TkbvDataWrapper = () => {
  const context = useOutletContext<MainLayoutContext>();
  const { columns, defaultVisibleColumns } = applyTableColumnConfig(context.tkbvColumns, 'tkbv');
  return <DataGrid data={context.tkbvData} columns={columns} defaultVisibleColumns={defaultVisibleColumns} primarySearchColumn={{ header: 'MÃ', label: 'Tìm kiếm' }} exportFileNamePrefix="du_lieu_tkbv" enableAggregation={true} />;
};

const PthspDataWrapper = () => {
  const context = useOutletContext<MainLayoutContext>();
  const { columns, defaultVisibleColumns } = applyTableColumnConfig(context.pthspColumns, 'pthsp');
  return <DataGrid data={context.pthspData} columns={columns} defaultVisibleColumns={defaultVisibleColumns} primarySearchColumn={{ header: 'MÃ', label: 'Tìm kiếm' }} exportFileNamePrefix="du_lieu_pthsp" enableAggregation={true} />;
};

const AnalysisDataWrapper = () => {
  const context = useOutletContext<MainLayoutContext>();
  const { columns, defaultVisibleColumns } = applyTableColumnConfig(context.analysisColumns, 'analysis');
  return <DataGrid data={context.analysisData} columns={columns} defaultVisibleColumns={defaultVisibleColumns} primarySearchColumn={{ header: TARGET_COLUMN_NAMES.HEX, label: 'Tìm kiếm (HEX/Mã)' }} filterHeaders={[TARGET_COLUMN_NAMES.CONG_TRINH, TARGET_COLUMN_NAMES.XUONG]} exportFileNamePrefix="du_lieu_phan_tich_kh_th" enableAggregation={true} />;
};

const DataGridWrapper = ({ type }: { type: 'production' | 'material' | 'khsx' }) => {
  const context = useOutletContext<MainLayoutContext>();
  if (type === 'production') {
    const { columns, defaultVisibleColumns } = applyTableColumnConfig(context.productionColumns, 'production', PRODUCTION_DEFAULT_VIEW_COLUMNS);
    return <DataGrid data={context.productionData} columns={columns} defaultVisibleColumns={defaultVisibleColumns} filterHeaders={[TARGET_COLUMN_NAMES.CONG_TRINH, TARGET_COLUMN_NAMES.XUONG, TARGET_COLUMN_NAMES.TINH_TRANG]} primarySearchColumn={{ header: TARGET_COLUMN_NAMES.HEX, label: 'Mã HEX (Tìm nhiều)' }} exportFileNamePrefix="production_data" enableAggregation={true} />;
  } else if (type === 'khsx') {
    const { columns, defaultVisibleColumns } = applyTableColumnConfig(context.khsxColumns, 'khsx', PRODUCTION_DEFAULT_VIEW_COLUMNS);
    return <DataGrid data={context.khsxData} columns={columns} defaultVisibleColumns={defaultVisibleColumns} filterHeaders={[TARGET_COLUMN_NAMES.CONG_TRINH, TARGET_COLUMN_NAMES.XUONG, TARGET_COLUMN_NAMES.TINH_TRANG]} primarySearchColumn={{ header: TARGET_COLUMN_NAMES.HEX, label: 'Mã HEX (Tìm nhiều)' }} exportFileNamePrefix="khsx_data" enableAggregation={true} />;
  } else {
    const { columns, defaultVisibleColumns } = applyTableColumnConfig(context.materialColumns, 'material');
    return <DataGrid data={context.materialData} columns={columns} defaultVisibleColumns={defaultVisibleColumns} primarySearchColumn={{ header: TARGET_COLUMN_NAMES.SO_PR, label: 'Số PR (Tìm nhiều)' }} additionalSearchColumns={[{ header: TARGET_COLUMN_NAMES.SO_PO, label: 'Số PO (Tìm nhiều)' }]} filterHeaders={[TARGET_COLUMN_NAMES.TRACKING_NO, TARGET_COLUMN_NAMES.CONG_TRINH, TARGET_COLUMN_NAMES.TEN_VAT_TU, TARGET_COLUMN_NAMES.NHOM_VT]} exportFileNamePrefix="material_data" enableAggregation={true} />;
  }
};

interface MainLayoutContext {
  productionData: DataRow[]; productionColumns: ColumnDefinition[];
  materialData: DataRow[]; materialColumns: ColumnDefinition[];
  khsxData: DataRow[]; khsxColumns: ColumnDefinition[];
  orderData: DataRow[]; orderColumns: ColumnDefinition[];
  inventoryData: DataRow[]; inventoryColumns: ColumnDefinition[];
  tkbvData: DataRow[]; tkbvColumns: ColumnDefinition[];
  pthspData: DataRow[]; pthspColumns: ColumnDefinition[];
  analysisData: DataRow[]; analysisColumns: ColumnDefinition[];
  yearlyPlanData: DataRow[]; yearlyPlanColumns: ColumnDefinition[];
  exportData: DataRow[]; exportColumns: ColumnDefinition[];
  stockData: DataRow[]; stockColumns: ColumnDefinition[];
  attendanceData: DataRow[]; attendanceColumns: ColumnDefinition[];
  isSidebarCollapsed: boolean;
  isGlobalLoading: boolean; // Thêm trạng thái loading để truyền cho các component con
}

const ICON_MAP: Record<string, React.ReactNode> = {
  'LayoutDashboard': <LayoutDashboard size={18} />, 'Table': <Table size={18} />, 'Package': <Package size={18} />,
  'Shield': <Shield size={18} />, 'Calendar': <Calendar size={18} />, 'ShoppingCart': <ShoppingCart size={18} />,
  'Import': <Import size={18} />, 'FileText': <FileText size={18} />, 'ClipboardList': <ClipboardList size={18} />,
  'TrendingUp': <TrendingUp size={18} />, 'CalendarRange': <CalendarRange size={18} />, 'Export': <Upload size={18} />,
  'Clock': <Clock size={18} />, 'Search': <Search size={18} />, 'AlertTriangle': <AlertTriangle size={18} />
};

// Icon nhỏ hơn dùng cho các mục con trong nhóm gộp
const ICON_MAP_SM: Record<string, React.ReactNode> = {
  'LayoutDashboard': <LayoutDashboard size={15} />, 'Table': <Table size={15} />, 'Package': <Package size={15} />,
  'Shield': <Shield size={15} />, 'Calendar': <Calendar size={15} />, 'ShoppingCart': <ShoppingCart size={15} />,
  'Import': <Import size={15} />, 'FileText': <FileText size={15} />, 'ClipboardList': <ClipboardList size={15} />,
  'TrendingUp': <TrendingUp size={15} />, 'CalendarRange': <CalendarRange size={15} />, 'Export': <Upload size={15} />,
  'Clock': <Clock size={15} />, 'Search': <Search size={15} />
};

// Các viewId luôn hiển thị riêng lẻ, không gộp vào nhóm "Dữ liệu"
const STANDALONE_VIEW_IDS = ['dashboard', 'hex_lookup', 'vuong_mac', 'users'];

const AppLogo = () => (
  <div className="w-8 h-8 rounded-lg bg-wood-600 flex items-center justify-center text-white shrink-0"><TrendingUp size={16} strokeWidth={2.25} /></div>
);

// ------------------------------------------------------------
// Style dùng chung cho sidebar (sáng, tối giản)
// ------------------------------------------------------------
const NAV_ACTIVE = 'bg-slate-100 text-slate-900 font-semibold';
const NAV_IDLE = 'text-slate-500 hover:bg-slate-50 hover:text-slate-900';
const FOOT_BTN = 'flex items-center gap-3 w-full px-3 py-2 text-sm text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors';

const MainLayout: React.FC = () => {
  const { user, logout, hasPermission } = useAuth();
  const { showToast } = useToast();

  const [productionData, setProductionData] = useState<DataRow[]>([]); const [productionColumns, setProductionColumns] = useState<ColumnDefinition[]>([]);
  const [materialData, setMaterialData] = useState<DataRow[]>([]); const [materialColumns, setMaterialColumns] = useState<ColumnDefinition[]>([]);
  const [khsxData, setKhsxData] = useState<DataRow[]>([]); const [khsxColumns, setKhsxColumns] = useState<ColumnDefinition[]>([]);
  const [orderData, setOrderData] = useState<DataRow[]>([]); const [orderColumns, setOrderColumns] = useState<ColumnDefinition[]>([]);
  const [inventoryData, setInventoryData] = useState<DataRow[]>([]); const [inventoryColumns, setInventoryColumns] = useState<ColumnDefinition[]>([]);
  const [tkbvData, setTkbvData] = useState<DataRow[]>([]); const [tkbvColumns, setTkbvColumns] = useState<ColumnDefinition[]>([]);
  const [pthspData, setPthspData] = useState<DataRow[]>([]); const [pthspColumns, setPthspColumns] = useState<ColumnDefinition[]>([]);
  const [analysisData, setAnalysisData] = useState<DataRow[]>([]); const [analysisColumns, setAnalysisColumns] = useState<ColumnDefinition[]>([]);
  const [yearlyPlanData, setYearlyPlanData] = useState<DataRow[]>([]); const [yearlyPlanColumns, setYearlyPlanColumns] = useState<ColumnDefinition[]>([]);
  const [exportData, setExportData] = useState<DataRow[]>([]); const [exportColumns, setExportColumns] = useState<ColumnDefinition[]>([]);
  const [stockData, setStockData] = useState<DataRow[]>([]); const [stockColumns, setStockColumns] = useState<ColumnDefinition[]>([]);
  const [attendanceData, setAttendanceData] = useState<DataRow[]>([]); const [attendanceColumns, setAttendanceColumns] = useState<ColumnDefinition[]>([]);

  const [loading, setLoading] = useState(true);
  // Lần đầu trang cần bảng chưa nạp: hiện vòng chờ có chữ (đang làm gì) thay cho trang trống / số 0 rồi đứng hình
  // (tables = các bảng đang nạp: chỉ chặn trang cần tới chúng — chuyển sang trang khác giữa chừng vẫn hiện ngay)
  const [loadStage, setLoadStage] = useState<{ label: string; tables: string[] } | null>(null);
  const [error] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Trạng thái đóng/mở của các nhóm menu - mặc định đóng
  const [isDataMenuOpen, setIsDataMenuOpen] = useState(false);
  const [isChartMenuOpen, setIsChartMenuOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isInstallOpen, setIsInstallOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  // Tăng sau mỗi lần "Làm mới" thủ công để trang hiện tại mount lại và gọi lại API
  const [refreshKey, setRefreshKey] = useState(0);
  // Tăng khi setup gộp xưởng nạp xong / đổi -> gộp lại cột xưởng của dữ liệu đã tải
  const [workshopGroupsVersion, setWorkshopGroupsVersion] = useState(0);
  // Tăng khi nạp xong danh sách "KH nhập kho đã đạt trong kỳ" -> các trang tính lại hạn (BOT)
  const [planMetVersion, setPlanMetVersion] = useState(0);
  // Bảng tên công trình của server đã nạp -> đổi tham chiếu dữ liệu các bảng để mọi bộ lọc theo công trình
  // (Luồng đỏ / Căn mẫu…) tính lại (trước chỉ dữ liệu sản xuất tính lại: trang render trước khi bảng tên về thì
  // thiếu dòng cho tới khi Làm mới)
  const [aliasVersion, setAliasVersion] = useState(0);

  const location = useLocation();

  // Tải view-project-mapping + table-column-config sau khi đã đăng nhập (MainLayout chỉ
  // hiển thị nội dung khi có user). Không chặn render; các trang Công trình tự chờ qua
  // useViewMappingReady. Đăng nhập lại (user đổi) thì tải lại cho đúng tài khoản.
  // Lúc mở app: dữ liệu (đọc từ cache trình duyệt) chỉ áp vào trang SAU KHI 3 thứ nhỏ này về (tối đa
  // META_WAIT_MS) — mỗi thứ về sau dữ liệu đều làm mọi trang tính lại toàn bộ 1 lượt (trước 3 lượt / lần mở)
  const metaReadyRef = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    if (!user) return;
    loadViewMapping();
    loadTableColumnConfig();
    metaReadyRef.current = Promise.allSettled([
      loadWorkshopGroups().then(() => setWorkshopGroupsVersion(v => v + 1)),
      fetchPlanMet().then(d => { setPlanMet(d); setPlanMetVersion(v => v + 1); }),
      // Bảng tên công trình của server -> lọc theo công trình phía máy khớp server (đổi version để tính lại)
      fetchProjectAliases().then(d => { setServerProjectAliases(d); setAliasVersion(v => v + 1); }),
    ]);
  }, [user?.username]); // eslint-disable-line react-hooks/exhaustive-deps

  // ADMIN vừa lưu setup gộp xưởng (cache đã cập nhật) -> gộp lại dữ liệu, các trang gọi lại API
  useEffect(() => {
    const onChanged = () => { setWorkshopGroupsVersion(v => v + 1); setRefreshKey(k => k + 1); };
    window.addEventListener('workshop-groups-changed', onChanged);
    return () => window.removeEventListener('workshop-groups-changed', onChanged);
  }, []);

  const tableVersions = useRef<Record<string, string>>({});
  const initStartedRef = useRef(false);
  // Bảng đang dùng (đã có trang cần) — đồng bộ ngầm / Làm mới chỉ tải các bảng này
  const activeTablesRef = useRef<Set<string>>(new Set());
  // Còn gắn trên trang hay không — dùng ref (không dùng biến trong effect) vì init chỉ chạy 1 lần: StrictMode bản dev
  // huỷ + gắn lại effect ngay lúc khởi động, biến cục bộ của lượt đầu sẽ thành false dù component vẫn còn.
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const dataLoadedRef = useRef<Record<string, boolean>>({});

  // Tự mở nhóm menu chứa trang hiện tại
  useEffect(() => {
    const currentView = APP_VIEWS.find(v => v.path === location.pathname);
    if (currentView && !STANDALONE_VIEW_IDS.includes(currentView.id)) {
      setIsDataMenuOpen(true);
    }
    if (CHART_SUB_ITEMS.some(item => item.path === location.pathname)) {
      setIsChartMenuOpen(true);
    }
  }, [location.pathname]);

  // Mở rộng sidebar trước nếu đang thu gọn, rồi mới đóng/mở nhóm
  const makeGroupToggle = (isOpen: boolean, setOpen: (v: boolean) => void) => () => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setOpen(true);
    } else {
      setOpen(!isOpen);
    }
  };

  // Lượt đồng bộ đang chạy (nếu có). Đồng bộ được gọi từ 3 nơi: hẹn giờ 60s, khi quay lại
  // tab, và nút "Làm mới" — không chặn thì có thể cùng lúc tải /api/all-data nhiều lần.
  const syncInFlightRef = useRef<Promise<boolean> | null>(null);

  // Trả về true nếu đồng bộ thành công, false nếu có lỗi (dùng để báo cho người dùng khi bấm Làm mới)
  const checkAndSync = async (forceAll = false): Promise<boolean> => {
    if (syncInFlightRef.current) {
      // Lượt thường: dùng chung kết quả lượt đang chạy. "Làm mới" (forceAll): chờ xong rồi tải lại.
      if (!forceAll) return syncInFlightRef.current;
      await syncInFlightRef.current.catch(() => false);
    }
    const run = runSync(forceAll);
    syncInFlightRef.current = run;
    try {
      return await run;
    } finally {
      if (syncInFlightRef.current === run) syncInFlightRef.current = null;
    }
  };

  // Lưu ý: hàm này được hẹn giờ (setInterval) giữ lại từ lần render đầu, nên KHÔNG được đọc
  // state trực tiếp (sẽ là giá trị cũ) — chỉ dùng setter, ref và cập nhật dạng hàm.
  const runSync = async (forceAll: boolean): Promise<boolean> => {
    try {
      if (activeTablesRef.current.size === 0) return true; // trang hiện tại không dùng bảng nào
      const verRes = await fetch('/api/check-versions', { cache: 'no-store' });
      if (!verRes.ok) return false;

      const serverVersions = await verRes.json();

      // Danh sách endpoint + setter, dùng để biết bảng nào cần cập nhật
      const tableConfigs: { endpoint: string; verKey: string; setData: Function; setCols: Function }[] = [
        { endpoint: 'production', verKey: 'production', setData: setProductionData, setCols: setProductionColumns },
        { endpoint: 'material', verKey: 'material', setData: setMaterialData, setCols: setMaterialColumns },
        { endpoint: 'khsx', verKey: 'khsx', setData: setKhsxData, setCols: setKhsxColumns },
        { endpoint: 'order', verKey: 'order', setData: setOrderData, setCols: setOrderColumns },
        { endpoint: 'inventory', verKey: 'inventory', setData: setInventoryData, setCols: setInventoryColumns },
        { endpoint: 'tkbv', verKey: 'tkbv', setData: setTkbvData, setCols: setTkbvColumns },
        { endpoint: 'pthsp', verKey: 'pthsp', setData: setPthspData, setCols: setPthspColumns },
        { endpoint: 'analysis', verKey: 'analysis', setData: setAnalysisData, setCols: setAnalysisColumns },
        { endpoint: 'yearly-plan', verKey: 'yearlyPlan', setData: setYearlyPlanData, setCols: setYearlyPlanColumns },
        { endpoint: 'export', verKey: 'export', setData: setExportData, setCols: setExportColumns },
        { endpoint: 'stock', verKey: 'stock', setData: setStockData, setCols: setStockColumns },
        { endpoint: 'attendance', verKey: 'attendance', setData: setAttendanceData, setCols: setAttendanceColumns },
      ];

      // Xác định bảng nào cần cập nhật (version đổi, hoặc forceAll, hoặc chưa từng load) — chỉ trong các bảng
      // đang dùng; bảng chưa trang nào cần thì để tới lúc mở trang đó mới đọc / tải
      const toUpdate: typeof tableConfigs = [];
      const toApplyFromCache: typeof tableConfigs = [];

      for (const cfg of tableConfigs.filter(c => activeTablesRef.current.has(c.endpoint))) {
        const serverVer = String(serverVersions[cfg.verKey] || '0');
        const localVer = forceAll ? '0' : String(await getCachedVersion(cfg.endpoint));

        if (serverVer !== localVer || forceAll) {
          toUpdate.push(cfg);
        } else if (!dataLoadedRef.current[cfg.endpoint]) {
          toApplyFromCache.push(cfg);
        }
      }

      let ok = true;
      let hasAnyUpdate = false;

      // Áp dụng cache cho các bảng chưa từng load nhưng không đổi version
      for (const cfg of toApplyFromCache) {
        const cached = await getCachedData(cfg.endpoint);
        if (cached && cached.data && cached.data.length > 0) {
          cfg.setData(cached.data);
          cfg.setCols(cached.columns);
          hasAnyUpdate = true;
        } else {
          toUpdate.push(cfg); // fallback: cache rỗng, gộp vào nhóm cần fetch
        }
        const serverVer = String(serverVersions[cfg.verKey] || '0');
        tableVersions.current[cfg.endpoint] = serverVer;
        dataLoadedRef.current[cfg.endpoint] = true;
      }

      // Nếu có bảng cần cập nhật -> gọi /api/all-data MỘT LẦN thay vì N lần riêng lẻ
      if (toUpdate.length > 0) {
        // Chỉ tải các bảng cần cập nhật (đổi phiên bản / chưa có cache), không tải lại cả 12 bảng
        const allData = await fetchAllDataFromServer(toUpdate.map(cfg => cfg.endpoint));
        if (!allData) ok = false;
        // Bảng thuộc nhóm tải lỗi không có trong kết quả: giữ phiên bản cũ => lần đồng bộ sau tự tải lại riêng bảng đó
        if (allData && toUpdate.some(cfg => !allData[cfg.endpoint])) ok = false;
        if (allData) {
          for (const cfg of toUpdate) {
            const res = allData[cfg.endpoint];
            if (res) {
              cfg.setData(res.data);
              cfg.setCols(res.columns);
              const serverVer = String(serverVersions[cfg.verKey] || '0');
              await saveToCache(cfg.endpoint, serverVer, res);
              tableVersions.current[cfg.endpoint] = serverVer;
              dataLoadedRef.current[cfg.endpoint] = true;
              hasAnyUpdate = true;
            }
          }
        }
      }

      // Trước đây đọc thẳng `lastUpdated` — trong setInterval giá trị này luôn là null (giá trị
      // cũ), nên mỗi phút đều set lại và vẽ lại cả trang. Cập nhật dạng hàm: giữ nguyên object
      // cũ khi không có gì mới => React bỏ qua, không render lại.
      if (hasAnyUpdate) setLastUpdated(new Date());
      else setLastUpdated(prev => prev ?? new Date());
      return ok;
    } catch (err) {
      console.error("Lỗi đồng bộ ngầm:", err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;
  // Setter theo bảng — dùng khi áp cache cho các bảng vừa có trang cần
  const tableSetters: Record<string, [Function, Function]> = {
    production: [setProductionData, setProductionColumns], material: [setMaterialData, setMaterialColumns],
    khsx: [setKhsxData, setKhsxColumns], order: [setOrderData, setOrderColumns], inventory: [setInventoryData, setInventoryColumns],
    tkbv: [setTkbvData, setTkbvColumns], pthsp: [setPthspData, setPthspColumns], analysis: [setAnalysisData, setAnalysisColumns],
    'yearly-plan': [setYearlyPlanData, setYearlyPlanColumns], export: [setExportData, setExportColumns],
    stock: [setStockData, setStockColumns], attendance: [setAttendanceData, setAttendanceColumns],
  };
  // Nạp thêm các bảng trang cần mà chưa nạp: đọc cache trình duyệt (song song) -> áp 1 lần -> đồng bộ với server
  const loadTables = async (endpoints: string[]) => {
    const fresh = endpoints.filter(e => !activeTablesRef.current.has(e));
    fresh.forEach(e => activeTablesRef.current.add(e));
    if (fresh.length === 0) { setLoading(false); return; }
    setLoading(true);
    const stage = (label: string) => setLoadStage({ label, tables: fresh });
    // Chỉ xoá vòng chờ của lượt nạp này (lượt nạp khác của trang mới có thể đang chạy)
    const clearStage = () => setLoadStage(s => (s?.tables === fresh ? null : s));
    stage('Đang đọc dữ liệu đã lưu trên máy…');
    preloadPageChunk(pathnameRef.current);
    const cached = await Promise.all(fresh.map(e => getCachedData(e)));
    // Chờ setup gộp xưởng / KH đã đạt / bảng tên công trình (thường đã về trong lúc đọc cache) để chỉ tính 1 lượt
    await Promise.race([metaReadyRef.current, new Promise(r => setTimeout(r, META_WAIT_MS))]);
    if (!mountedRef.current) return;
    const missing = fresh.some((_, i) => !cached[i]?.data);
    // Áp dữ liệu => trang tính toàn bộ số liệu (vài giây, màn hình đứng yên): vẽ chữ "Đang tính" trước rồi mới áp
    stage(missing ? 'Đang tải dữ liệu từ máy chủ…' : 'Đang tính số liệu…');
    await new Promise(r => setTimeout(r, 30));
    if (!mountedRef.current) return;
    fresh.forEach((e, i) => {
      const c = cached[i];
      if (c?.data) {
        tableSetters[e][0](c.data);
        tableSetters[e][1](c.columns);
        dataLoadedRef.current[e] = true;
      }
    });
    setLoading(false);
    // Thiếu bảng trong cache (lần đầu dùng máy này / vừa xoá cache): giữ vòng chờ tới khi tải xong từ máy chủ
    if (!missing) clearStage();
    try { await checkAndSync(); } finally { if (missing && mountedRef.current) clearStage(); }
  };
  // Chuyển trang: nạp thêm bảng trang mới cần (bảng đã nạp giữ nguyên)
  useEffect(() => {
    if (!initStartedRef.current) return;
    loadTables(tablesForPath(location.pathname));
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const init = async () => {
      // Chạy 1 lần (StrictMode ở bản dev gọi effect 2 lần => đọc cache 2 lần song song)
      if (initStartedRef.current) return;
      initStartedRef.current = true;
      await loadTables(tablesForPath(pathnameRef.current));
    };

    init();

    const POLLING_INTERVAL = 60000;
    const intervalId = setInterval(() => checkAndSync(), POLLING_INTERVAL);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkAndSync();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const toggleMobileSidebar = () => setIsMobileSidebarOpen(!isMobileSidebarOpen);
  const closeMobileSidebar = () => setIsMobileSidebarOpen(false);
  const toggleDesktopSidebar = () => setIsCollapsed(!isCollapsed);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) {
      showToast('Vui lòng nhập đầy đủ thông tin', 'error');
      return;
    }

    setIsChangingPassword(true);
    const result = await userService.changePassword(user?.username || '', oldPassword, newPassword);
    setIsChangingPassword(false);

    if (result.success) {
      showToast(result.message || 'Đổi mật khẩu thành công', 'success');
      setIsChangePasswordOpen(false);
      setOldPassword('');
      setNewPassword('');
    } else {
      showToast(result.message || 'Đổi mật khẩu thất bại', 'error');
    }
  };

  const handleLogoutClick = () => {
    setIsLogoutConfirmOpen(true);
    closeMobileSidebar();
  };

  const confirmLogout = async () => {
    setIsLogoutConfirmOpen(false);
    await disablePush().catch(() => {}); // gỡ đăng ký thông báo của thiết bị này
    logout();
  };

  const manualRefresh = async () => {
    setLoading(true);
    tableVersions.current = {};
    closeMobileSidebar();
    try {
      const [ok] = await Promise.all([
        checkAndSync(true),
        loadViewMapping(),
        loadTableColumnConfig(),
        loadWorkshopGroups().then(() => setWorkshopGroupsVersion(v => v + 1)),
        fetchPlanMet().then(d => { setPlanMet(d); setPlanMetVersion(v => v + 1); }),
        fetchProjectAliases().then(d => { setServerProjectAliases(d); setAliasVersion(v => v + 1); }),
      ]);
      if (ok) {
        // Đổi key -> trang hiện tại mount lại, mọi biểu đồ/bộ lọc tự gọi lại API lấy số mới
        setRefreshKey(k => k + 1);
        showToast('Đã cập nhật dữ liệu mới nhất', 'success');
      } else {
        showToast('Không tải được dữ liệu mới, vui lòng thử lại', 'error');
      }
    } catch {
      showToast('Không tải được dữ liệu mới, vui lòng thử lại', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Giữ nguyên object khi dữ liệu không đổi: các trang con (useOutletContext) chỉ render lại
  // khi dữ liệu / trạng thái thật sự đổi, không phải mỗi lần MainLayout render (vd. gõ phím
  // trong ô đổi mật khẩu, mở menu) — tránh DataGrid lọc/sắp xếp lại toàn bộ bảng.
  // Tên công trình chuẩn theo mã (1 mã có thể có nhiều cách viết tên) — làm 1 lần ở đây để mọi
  // trang (Tổng quan, Luồng đỏ, Báo cáo tiến độ, bảng dữ liệu) gom cùng 1 công trình giống nhau.
  // Tên PM / PC cũng gom các cách viết của cùng 1 người (NGỌC SÁU / saudn -> ĐẶNG NGỌC SÁU).
  // Gộp tên công trình / người / xưởng: nặng (~0,5–1 giây trên ~52k dòng) => chỉ chạy lại khi dữ liệu sản xuất hoặc
  // setup gộp xưởng đổi. KH đã đạt / bảng tên server về chỉ cần đổi tham chiếu mảng để các trang tính lại hạn / lọc
  // (trước gộp lại từ đầu mỗi lần => 3 lượt nặng mỗi lần mở app).
  const canonicalProductionBase = useMemo(
    () => canonicalizeWorkshops(
      canonicalizePersonNames(canonicalizeProjectNames(productionData, productionColumns), productionColumns),
      productionColumns
    ),
    [productionData, productionColumns, workshopGroupsVersion] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const canonicalProductionData = useMemo(
    // Nạp xong "KH đã đạt" / bảng tên thì đổi tham chiếu mảng để mọi trang tính lại hạn (deadlineOf đọc bộ nhớ chung)
    () => (planMetVersion > 0 || aliasVersion > 0 ? canonicalProductionBase.slice() : canonicalProductionBase),
    [canonicalProductionBase, planMetVersion, aliasVersion]
  );
  // Cột xưởng các bảng khác cũng theo setup gộp xưởng (bảng không có cột xưởng giữ nguyên)
  /* eslint-disable react-hooks/exhaustive-deps */
  const withAlias = (rows: DataRow[]) => (aliasVersion > 0 ? rows.slice() : rows);
  const wgMaterialData = useMemo(() => withAlias(canonicalizeWorkshops(materialData, materialColumns)), [materialData, materialColumns, workshopGroupsVersion, aliasVersion]);
  const wgKhsxData = useMemo(() => withAlias(canonicalizeWorkshops(khsxData, khsxColumns)), [khsxData, khsxColumns, workshopGroupsVersion, aliasVersion]);
  const wgOrderData = useMemo(() => withAlias(canonicalizeWorkshops(orderData, orderColumns)), [orderData, orderColumns, workshopGroupsVersion, aliasVersion]);
  const wgInventoryData = useMemo(() => withAlias(canonicalizeWorkshops(inventoryData, inventoryColumns)), [inventoryData, inventoryColumns, workshopGroupsVersion, aliasVersion]);
  const wgTkbvData = useMemo(() => withAlias(canonicalizeWorkshops(tkbvData, tkbvColumns)), [tkbvData, tkbvColumns, workshopGroupsVersion, aliasVersion]);
  const wgPthspData = useMemo(() => withAlias(canonicalizeWorkshops(pthspData, pthspColumns)), [pthspData, pthspColumns, workshopGroupsVersion, aliasVersion]);
  const wgAnalysisData = useMemo(() => withAlias(canonicalizeWorkshops(analysisData, analysisColumns)), [analysisData, analysisColumns, workshopGroupsVersion, aliasVersion]);
  const wgYearlyPlanData = useMemo(() => withAlias(canonicalizeWorkshops(yearlyPlanData, yearlyPlanColumns)), [yearlyPlanData, yearlyPlanColumns, workshopGroupsVersion, aliasVersion]);
  const wgExportData = useMemo(() => withAlias(canonicalizeWorkshops(exportData, exportColumns)), [exportData, exportColumns, workshopGroupsVersion, aliasVersion]);
  const wgStockData = useMemo(() => withAlias(canonicalizeWorkshops(stockData, stockColumns)), [stockData, stockColumns, workshopGroupsVersion, aliasVersion]);
  const wgAttendanceData = useMemo(() => withAlias(canonicalizeWorkshops(attendanceData, attendanceColumns)), [attendanceData, attendanceColumns, workshopGroupsVersion, aliasVersion]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const contextValue = useMemo<MainLayoutContext>(() => ({
    productionData: canonicalProductionData, productionColumns, materialData: wgMaterialData, materialColumns,
    khsxData: wgKhsxData, khsxColumns, orderData: wgOrderData, orderColumns, inventoryData: wgInventoryData, inventoryColumns,
    tkbvData: wgTkbvData, tkbvColumns, pthspData: wgPthspData, pthspColumns, analysisData: wgAnalysisData, analysisColumns,
    yearlyPlanData: wgYearlyPlanData, yearlyPlanColumns, exportData: wgExportData, exportColumns,
    stockData: wgStockData, stockColumns, attendanceData: wgAttendanceData, attendanceColumns, isSidebarCollapsed: isCollapsed,
    isGlobalLoading: loading
  }), [
    canonicalProductionData, productionColumns, wgMaterialData, materialColumns, wgKhsxData, khsxColumns,
    wgOrderData, orderColumns, wgInventoryData, inventoryColumns, wgTkbvData, tkbvColumns, wgPthspData, pthspColumns,
    wgAnalysisData, analysisColumns, wgYearlyPlanData, yearlyPlanColumns, wgExportData, exportColumns,
    wgStockData, stockColumns, wgAttendanceData, attendanceColumns, isCollapsed, loading,
  ]);

  // ------------------------------------------------------------
  // MENU: chỉ hiện những mục người dùng có quyền
  // ------------------------------------------------------------
  const dashboardView = APP_VIEWS.find(v => v.id === 'dashboard' && hasPermission(v.id));
  const hexLookupView = APP_VIEWS.find(v => v.id === 'hex_lookup' && hasPermission(v.id));
  const vuongMacView = APP_VIEWS.find(v => v.id === 'vuong_mac' && hasPermission(v.id));
  const usersView = APP_VIEWS.find(v => v.id === 'users' && hasPermission(v.id));

  const canSeeConstruction = hasPermission('construction_overview');
  const visibleChartItems = CHART_SUB_ITEMS.filter(i => hasPermission(i.permId));
  const groupedViews = APP_VIEWS.filter(v => !STANDALONE_VIEW_IDS.includes(v.id) && hasPermission(v.id));
  const canSeeAnySetup = hasPermission('construction_setup') || hasPermission('table_column_setup') || user?.role === 'ADMIN';

  const isChartGroupActive = visibleChartItems.some(i => i.path === location.pathname);
  const isGroupActive = groupedViews.some(v => v.path === location.pathname);

  const handleChartGroupToggle = makeGroupToggle(isChartMenuOpen, setIsChartMenuOpen);
  const handleGroupToggle = makeGroupToggle(isDataMenuOpen, setIsDataMenuOpen);

  // Render 1 nhóm menu con dạng chỉ có chữ (Công trình, Biểu đồ)
  const renderSubLinks = (items: { key: string; label: string; path: string }[]) =>
    items.map(item => {
      const active = location.pathname === item.path;
      return (
        <Link
          key={item.key}
          to={item.path}
          onClick={closeMobileSidebar}
          className={`flex items-center py-1.5 px-3 rounded-md text-[0.8125rem] transition-colors duration-150 ${active ? NAV_ACTIVE : NAV_IDLE}`}
        >
          <span className="whitespace-nowrap overflow-hidden">{item.label}</span>
        </Link>
      );
    });

  return (
    <div className="flex h-screen bg-wood-50 overflow-hidden relative">
      {/* Thanh trên cùng cho điện thoại */}
      <div className="md:hidden absolute top-0 left-0 right-0 h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 z-20">
        <div className="flex items-center gap-2 font-semibold text-slate-900">
          <AppLogo />
          <span>Operations Hub</span>
        </div>
        <button onClick={toggleMobileSidebar} className="p-2 text-slate-600 hover:bg-slate-100 rounded-md">
          {isMobileSidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {isMobileSidebarOpen && (
        // Nền mờ chỉ để che trang; đóng menu bằng nút X (không đóng khi chạm nền)
        <div className="fixed inset-0 bg-slate-900/40 z-50 md:hidden" />
      )}

      <aside className={`
  fixed md:static inset-y-0 left-0 z-[60] bg-white text-slate-600 border-r border-slate-200
  transform transition-all duration-300 ease-in-out flex flex-col shadow-lg md:shadow-none
  overflow-x-hidden
  ${isMobileSidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'}
  ${isCollapsed ? 'md:w-20' : 'md:w-64'}
`}>
        <div className={`h-14 flex items-center bg-white border-b border-slate-200 transition-all duration-300 ${isCollapsed ? 'justify-center px-0' : 'justify-between px-4'}`}>
          <div className={`flex items-center gap-2.5 font-semibold text-slate-900 text-[0.9375rem] tracking-tight overflow-hidden whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>
            <AppLogo />
            <span>Operations Hub</span>
          </div>
          <button onClick={toggleDesktopSidebar} className={`hidden md:flex p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors ${isCollapsed ? 'mx-auto' : ''}`}>
            <Menu size={18} />
          </button>
          <button onClick={closeMobileSidebar} aria-label="Đóng" className="md:hidden p-2 text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        {user && (
          <div className={`px-4 py-3.5 flex items-center gap-3 border-b border-slate-200 ${isCollapsed ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-semibold text-xs shrink-0 cursor-help" title={`Permissions: ${user.permissions.length} views`}>
              {user.fullName.charAt(0).toUpperCase()}
            </div>
            <div className={`overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
              <div className="text-sm text-slate-900 font-medium truncate w-40">{user.fullName}</div>
              <div className="text-[0.6875rem] text-slate-500">
                {user.role === 'ADMIN' ? 'Admin' : (user.department || 'User')}
              </div>
            </div>
          </div>
        )}

        <nav className="flex-1 py-3 space-y-0.5 px-3 overflow-y-auto overflow-x-hidden custom-scrollbar">
          {/* Tổng quan - luôn hiển thị riêng, ở đầu */}
          {dashboardView && (
            <NavLink
              key={dashboardView.id}
              to={dashboardView.path}
              icon={ICON_MAP[dashboardView.iconName || 'Table']}
              label={dashboardView.label}
              active={location.pathname === dashboardView.path}
              onClick={closeMobileSidebar}
              collapsed={isCollapsed}
            />
          )}

          {/* Tra cứu hex - đặt ngay dưới Tổng quan */}
          {hexLookupView && (
            <NavLink
              key={hexLookupView.id}
              to={hexLookupView.path}
              icon={ICON_MAP[hexLookupView.iconName || 'Table']}
              label={hexLookupView.label}
              active={location.pathname === hexLookupView.path}
              onClick={closeMobileSidebar}
              collapsed={isCollapsed}
            />
          )}

          {/* Tổng quan công trình: 1 mục ngoài cùng (Luồng đỏ / Căn mẫu chọn nhóm ngay trong trang) */}
          {canSeeConstruction && (
            <NavLink
              to={CONSTRUCTION_PATH}
              icon={<Box size={18} className="shrink-0" />}
              label="Tổng quan công trình"
              active={location.pathname === CONSTRUCTION_PATH}
              onClick={closeMobileSidebar}
              collapsed={isCollapsed}
            />
          )}

          {/* Vướng mắc sản xuất (quản lý) */}
          {vuongMacView && (
            <NavLink
              key={vuongMacView.id}
              to={vuongMacView.path}
              icon={ICON_MAP[vuongMacView.iconName || 'Table']}
              label={vuongMacView.label}
              active={location.pathname === vuongMacView.path}
              onClick={closeMobileSidebar}
              collapsed={isCollapsed}
            />
          )}

          {/* Nhóm Quản trị (Biểu đồ) */}
          {visibleChartItems.length > 0 && (
            <NavGroup
              icon={<BarChart3 size={18} className="shrink-0" />}
              label="Quản trị"
              tooltip="Biểu đồ"
              collapsed={isCollapsed}
              open={isChartMenuOpen}
              active={isChartGroupActive}
              onToggle={handleChartGroupToggle}
            >
              {renderSubLinks(visibleChartItems)}
            </NavGroup>
          )}

          {/* Nhóm Dữ liệu */}
          {groupedViews.length > 0 && (
            <NavGroup
              icon={<Database size={18} className="shrink-0" />}
              label="Dữ liệu"
              collapsed={isCollapsed}
              open={isDataMenuOpen}
              active={isGroupActive}
              onToggle={handleGroupToggle}
            >
              {groupedViews.map((view) => {
                const active = location.pathname === view.path;
                return (
                  <Link
                    key={view.id}
                    to={view.path}
                    onClick={closeMobileSidebar}
                    className={`flex items-center gap-2.5 py-1.5 px-3 rounded-md text-[0.8125rem] transition-colors duration-150 ${active ? NAV_ACTIVE : NAV_IDLE}`}
                  >
                    <div className="shrink-0">{ICON_MAP_SM[view.iconName || 'Table']}</div>
                    <span className="whitespace-nowrap overflow-hidden">{view.label}</span>
                  </Link>
                );
              })}
            </NavGroup>
          )}

          {/* Quản trị User - luôn hiển thị riêng, cuối danh sách */}
          {usersView && (
            <NavLink
              key={usersView.id}
              to={usersView.path}
              icon={ICON_MAP[usersView.iconName || 'Table']}
              label={usersView.label}
              active={location.pathname === usersView.path}
              onClick={closeMobileSidebar}
              collapsed={isCollapsed}
            />
          )}

          {/* Setup dữ liệu: 1 mục chung (nhóm công trình / cột dữ liệu / gộp xưởng — thẻ trong trang) */}
          {canSeeAnySetup && (
            <NavLink
              to="/setup"
              icon={<Settings size={18} />}
              label="Setup dữ liệu"
              active={location.pathname === '/setup'}
              onClick={closeMobileSidebar}
              collapsed={isCollapsed}
            />
          )}
        </nav>

        <div className="p-3 border-t border-slate-200 space-y-0.5">
          {user?.role === 'USER' && (
            <button
              onClick={() => { setIsChangePasswordOpen(true); closeMobileSidebar(); }}
              className={`${FOOT_BTN} ${isCollapsed ? 'justify-center' : ''}`}
              title="Đổi mật khẩu"
            >
              <Key size={18} />
              <span className={`transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 overflow-hidden' : 'w-auto opacity-100'}`}>Đổi mật khẩu</span>
            </button>
          )}

          <button
            onClick={handleLogoutClick}
            className={`${FOOT_BTN} hover:!text-red-600 hover:!bg-red-50 ${isCollapsed ? 'justify-center' : ''}`}
            title="Đăng xuất"
          >
            <LogOut size={18} />
            <span className={`transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 overflow-hidden' : 'w-auto opacity-100'}`}>Đăng xuất</span>
          </button>

          <button
            onClick={() => { setIsInstallOpen(true); closeMobileSidebar(); }}
            className={`${FOOT_BTN} ${isCollapsed ? 'justify-center' : ''}`}
            title="Tải ứng dụng điện thoại"
          >
            <Smartphone size={18} />
            <span className={`transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 overflow-hidden' : 'w-auto opacity-100'}`}>Tải app điện thoại</span>
          </button>

          {hasPermission('data_log') && (
            <button
              onClick={() => { setIsLogOpen(true); closeMobileSidebar(); }}
              className={`${FOOT_BTN} ${isCollapsed ? 'justify-center' : ''}`}
              title="Nhật ký cập nhật dữ liệu"
            >
              <Clock size={18} />
              <span className={`transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 overflow-hidden' : 'w-auto opacity-100'}`}>Nhật ký cập nhật</span>
            </button>
          )}

          <div className={`text-[0.625rem] text-slate-400 text-center transition-all duration-300 pt-2 ${isCollapsed ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}>
            Đã kết nối ngầm ({lastUpdated ? lastUpdated.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--'})
          </div>

          <button
            onClick={manualRefresh}
            className={`flex items-center justify-center w-full gap-2 py-2 mt-1 bg-wood-600 hover:bg-wood-700 rounded-lg transition-colors text-sm font-medium text-white
             ${loading ? 'opacity-50 cursor-not-allowed' : ''} ${isCollapsed ? 'px-0' : 'px-4'}`}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
              {loading ? 'Đang tải...' : 'Làm mới'}
            </span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-h-0 pt-14 md:pt-0 h-full overflow-hidden w-full transition-all duration-300 relative">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Đã xảy ra lỗi</h3>
            <p className="text-sm text-slate-500 max-w-md">{error}</p>
            <button onClick={manualRefresh} className="mt-6 px-5 py-2 bg-wood-600 text-white text-sm font-medium rounded-lg hover:bg-wood-700 transition-colors">Thử lại</button>
          </div>
        ) : (
          /* HIỂN THỊ LUÔN OUTLET (Giao diện trang con), không chặn chờ data nữa.
             Tải file JS của trang (lazy): vòng chờ chỉ trong vùng nội dung, menu / khung giữ nguyên
             (trước dùng Suspense ngoài cùng => mỗi lần đổi trang cả màn hình thành vòng xoay) */
          loadStage && tablesForPath(location.pathname).some(t => loadStage.tables.includes(t)) ? <ContentLoader label={loadStage.label} /> : (
            <Suspense fallback={<ContentLoader label="Đang mở trang…" />}>
              <Outlet key={refreshKey} context={contextValue} />
            </Suspense>
          )
        )}
      </main>

      {/* Change Password Modal */}
      <ModalShell
        open={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        labelledBy="change-password-title"
        overlayClassName="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
        panelClassName="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 focus:outline-none"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <h3 id="change-password-title" className="font-semibold text-slate-900 flex items-center gap-2">
            <Key className="text-slate-500" size={16} />
            Đổi mật khẩu
          </h3>
          <button type="button" onClick={() => setIsChangePasswordOpen(false)} aria-label="Đóng" className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleChangePassword} className="p-6 space-y-4">
          <div>
            <label htmlFor="old-password" className="text-xs font-medium text-slate-600 block mb-1.5">Mật khẩu cũ</label>
            <input id="old-password" type="password" autoComplete="current-password" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-wood-600/15 focus:border-wood-600 outline-none" value={oldPassword} onChange={e => setOldPassword(e.target.value)} />
          </div>
          <div>
            <label htmlFor="new-password" className="text-xs font-medium text-slate-600 block mb-1.5">Mật khẩu mới</label>
            <input id="new-password" type="password" autoComplete="new-password" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-wood-600/15 focus:border-wood-600 outline-none" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          </div>
          <div className="pt-2 flex gap-3">
            <button type="button" onClick={() => setIsChangePasswordOpen(false)} className="flex-1 py-2 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium">Hủy</button>
            <button type="submit" disabled={isChangingPassword} className="flex-1 py-2 text-sm bg-wood-600 text-white rounded-lg hover:bg-wood-700 font-medium flex items-center justify-center gap-2 disabled:opacity-70">
              {isChangingPassword ? <Loader size={16} className="animate-spin" /> : <Check size={16} />} Xác nhận
            </button>
          </div>
        </form>
      </ModalShell>

      {/* Logout Confirmation Modal */}
      <ModalShell
        open={isLogoutConfirmOpen}
        onClose={() => setIsLogoutConfirmOpen(false)}
        labelledBy="logout-confirm-title"
        overlayClassName="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
        panelClassName="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200 focus:outline-none"
      >
        <div className="relative p-6 text-center">
          <button type="button" onClick={() => setIsLogoutConfirmOpen(false)} aria-label="Đóng" className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
          <div className="w-11 h-11 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <h3 id="logout-confirm-title" className="text-base font-semibold text-slate-900 mb-1.5">Xác nhận đăng xuất</h3>
          <p className="text-sm text-slate-500 mb-6">Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?</p>

          <div className="flex gap-3">
            {/* Focus mặc định vào "Hủy bỏ" để lỡ bấm Enter không đăng xuất nhầm */}
            <button type="button" data-autofocus onClick={() => setIsLogoutConfirmOpen(false)} className="flex-1 py-2 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium">Hủy bỏ</button>
            <button type="button" onClick={confirmLogout} className="flex-1 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">Đăng xuất</button>
          </div>
        </div>
      </ModalShell>

      <InstallMobileAppModal isOpen={isInstallOpen} onClose={() => setIsInstallOpen(false)} />
      <DataUpdateLogModal isOpen={isLogOpen} onClose={() => setIsLogOpen(false)} />
    </div>
  );
};

// ------------------------------------------------------------
// Nhóm menu có thể đóng/mở (dùng cho Công trình, Quản trị, Dữ liệu)
// ------------------------------------------------------------
interface NavGroupProps {
  icon: React.ReactNode;
  label: string;
  tooltip?: string;
  collapsed: boolean;
  open: boolean;
  active: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const NavGroup: React.FC<NavGroupProps> = ({ icon, label, tooltip, collapsed, open, active, onToggle, children }) => (
  <div>
    <button
      onClick={onToggle}
      title={collapsed ? (tooltip || label) : undefined}
      className={`flex items-center w-full gap-3 py-2 rounded-lg text-sm transition-colors duration-150
        ${collapsed ? 'justify-center px-2' : 'px-3'}
        ${active ? 'text-slate-900 bg-slate-100 font-semibold' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
    >
      {icon}
      <span className={`flex-1 text-left whitespace-nowrap overflow-hidden transition-all duration-300 ${collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
        {label}
      </span>
      {!collapsed && (
        <ChevronDown
          size={15}
          className={`transition-transform duration-200 shrink-0 text-slate-400 ${open ? 'rotate-180' : ''}`}
        />
      )}
    </button>

    {!collapsed && (
      <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-[2000px] opacity-100 mt-1' : 'max-h-0 opacity-0'}`}>
        <div className="pl-3 ml-5 border-l border-slate-200 space-y-0.5">
          {children}
        </div>
      </div>
    )}
  </div>
);

interface NavLinkProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  collapsed: boolean;
}

const NavLink: React.FC<NavLinkProps> = ({ to, icon, label, active, onClick, collapsed }) => (
  <Link
    to={to}
    onClick={onClick}
    title={collapsed ? label : undefined}
    className={`flex items-center gap-3 py-2 rounded-lg text-sm transition-colors duration-150 group relative
      ${collapsed ? 'justify-center px-2' : 'px-3'}
      ${active ? NAV_ACTIVE : NAV_IDLE}
    `}
  >
    <div className="shrink-0">{icon}</div>
    <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
      {label}
    </span>
    {collapsed && (
      <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity shadow-lg">
        {label}
      </div>
    )}
  </Link>
);

export default App;