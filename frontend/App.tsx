import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Link, useLocation, Navigate, Outlet, useOutletContext } from 'react-router-dom';
import { LayoutDashboard, Table, Menu, RefreshCw, X, Box, Package, LogOut, Shield, User as UserIcon, Key, Loader, Check, AlertTriangle, Calendar, ShoppingCart, Import, FileText, ClipboardList, TrendingUp, CalendarRange, Upload, Clock } from 'lucide-react';
import { getCachedData, getCachedVersion, saveToCache, fetchFromServer, fetchAllDataFromServer } from './services/dataService';
import { DataRow, ColumnDefinition, PRODUCTION_DEFAULT_VIEW_COLUMNS, TARGET_COLUMN_NAMES, APP_VIEWS } from './types';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { userService } from './services/userService';

// Áp dụng Lazy Loading: Tách các component ra khỏi bundle ban đầu
const Dashboard = lazy(() => import('./components/Dashboard'));
const DataGrid = lazy(() => import('./components/DataGrid'));
const Login = lazy(() => import('./components/Login'));
const UserManagement = lazy(() => import('./components/UserManagement'));

// Loading hiển thị trong lúc tải file JS của component
const FullScreenLoader = () => (
  <div className="h-screen flex items-center justify-center bg-wood-50">
    <div className="w-8 h-8 border-4 border-wood-600 border-t-transparent rounded-full animate-spin"></div>
  </div>
);

const App: React.FC = () => {
  return (
    <ToastProvider>
      <AuthProvider>
        <HashRouter>
          {/* Suspense bao bọc Routes để hiển thị Loader trong lúc tải Lazy Component */}
          <Suspense fallback={<FullScreenLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<MainLayout />}>
                <Route path="/" element={<RequirePermission viewId="dashboard"><DashboardWrapper /></RequirePermission>} />
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
                <Route path="/users" element={<RequirePermission viewId="users"><UserManagement /></RequirePermission>} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </HashRouter>
      </AuthProvider>
    </ToastProvider>
  );
};

const RequirePermission: React.FC<{ children: React.ReactElement, viewId: string }> = ({ children, viewId }) => {
  const { user, isLoading, hasPermission } = useAuth();
  if (isLoading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!hasPermission(viewId)) {
    return <div className="h-full flex flex-col items-center justify-center text-slate-500"><Shield className="w-16 h-16 text-slate-300 mb-4" /><h2 className="text-xl font-bold">Truy cập bị từ chối</h2></div>;
  }
  return children;
};

// Wrapper components
const DashboardWrapper = () => { const context = useOutletContext<MainLayoutContext>(); return <Dashboard {...context} />; };
const YearlyPlanDataWrapper = () => { const context = useOutletContext<MainLayoutContext>(); const primarySearchCol = context.yearlyPlanColumns.length > 0 ? { header: context.yearlyPlanColumns[0].key, label: 'Tìm kiếm' } : { header: 'ID', label: 'Tìm kiếm' }; return <DataGrid data={context.yearlyPlanData} columns={context.yearlyPlanColumns} primarySearchColumn={primarySearchCol} exportFileNamePrefix="du_lieu_ke_hoach_nam" enableAggregation={true} />; };
const OrderDataWrapper = () => { const context = useOutletContext<MainLayoutContext>(); return <DataGrid data={context.orderData} columns={context.orderColumns} primarySearchColumn={{ header: TARGET_COLUMN_NAMES.HEX, label: 'Tìm kiếm (HEX/Mã)' }} filterHeaders={[TARGET_COLUMN_NAMES.CONG_TRINH, TARGET_COLUMN_NAMES.TINH_TRANG]} exportFileNamePrefix="du_lieu_don_hang_tong" enableAggregation={true} />; };
const InventoryDataWrapper = () => { const context = useOutletContext<MainLayoutContext>(); return <DataGrid data={context.inventoryData} columns={context.inventoryColumns} primarySearchColumn={{ header: TARGET_COLUMN_NAMES.HEX, label: 'Tìm kiếm (HEX/Mã)' }} filterHeaders={[TARGET_COLUMN_NAMES.CONG_TRINH, TARGET_COLUMN_NAMES.XUONG]} exportFileNamePrefix="du_lieu_nhap_kho" enableAggregation={true} />; };
const ExportDataWrapper = () => { const context = useOutletContext<MainLayoutContext>(); return <DataGrid data={context.exportData} columns={context.exportColumns} primarySearchColumn={{ header: TARGET_COLUMN_NAMES.HEX, label: 'Tìm kiếm (HEX/Mã)' }} filterHeaders={[TARGET_COLUMN_NAMES.CONG_TRINH, TARGET_COLUMN_NAMES.XUONG]} exportFileNamePrefix="du_lieu_xuat_kho" enableAggregation={true} />; };
const StockDataWrapper = () => { const context = useOutletContext<MainLayoutContext>(); return <DataGrid data={context.stockData} columns={context.stockColumns} primarySearchColumn={{ header: 'MÃ CÔNG TRÌNH', label: 'Tìm kiếm (Mã CT)' }} filterHeaders={['MÃ CÔNG TRÌNH', 'TÌNH TRẠNG KẾ HOẠCH GIAO HÀNG', 'TÊN SẢN PHẨM']} exportFileNamePrefix="du_lieu_ton_kho" enableAggregation={true} />; };
const AttendanceDataWrapper = () => { const context = useOutletContext<MainLayoutContext>(); return <DataGrid data={context.attendanceData} columns={context.attendanceColumns} primarySearchColumn={{ header: 'DATE', label: 'Ngày (Tìm kiếm)' }} filterHeaders={['XƯỞNG CHÍNH']} exportFileNamePrefix="du_lieu_diem_danh" enableAggregation={true} />; };
const TkbvDataWrapper = () => { const context = useOutletContext<MainLayoutContext>(); return <DataGrid data={context.tkbvData} columns={context.tkbvColumns} primarySearchColumn={{ header: 'MÃ', label: 'Tìm kiếm' }} exportFileNamePrefix="du_lieu_tkbv" enableAggregation={true} />; };
const PthspDataWrapper = () => { const context = useOutletContext<MainLayoutContext>(); return <DataGrid data={context.pthspData} columns={context.pthspColumns} primarySearchColumn={{ header: 'MÃ', label: 'Tìm kiếm' }} exportFileNamePrefix="du_lieu_pthsp" enableAggregation={true} />; };
const AnalysisDataWrapper = () => { const context = useOutletContext<MainLayoutContext>(); return <DataGrid data={context.analysisData} columns={context.analysisColumns} primarySearchColumn={{ header: TARGET_COLUMN_NAMES.HEX, label: 'Tìm kiếm (HEX/Mã)' }} filterHeaders={[TARGET_COLUMN_NAMES.CONG_TRINH, TARGET_COLUMN_NAMES.XUONG]} exportFileNamePrefix="du_lieu_phan_tich_kh_th" enableAggregation={true} />; };

const DataGridWrapper = ({ type }: { type: 'production' | 'material' | 'khsx' }) => {
  const context = useOutletContext<MainLayoutContext>();
  if (type === 'production') return <DataGrid data={context.productionData} columns={context.productionColumns} defaultVisibleColumns={PRODUCTION_DEFAULT_VIEW_COLUMNS} filterHeaders={[TARGET_COLUMN_NAMES.CONG_TRINH, TARGET_COLUMN_NAMES.XUONG, TARGET_COLUMN_NAMES.TINH_TRANG]} primarySearchColumn={{ header: TARGET_COLUMN_NAMES.HEX, label: 'Mã HEX (Tìm nhiều)' }} exportFileNamePrefix="production_data" enableAggregation={true} />;
  else if (type === 'khsx') return <DataGrid data={context.khsxData} columns={context.khsxColumns} defaultVisibleColumns={PRODUCTION_DEFAULT_VIEW_COLUMNS} filterHeaders={[TARGET_COLUMN_NAMES.CONG_TRINH, TARGET_COLUMN_NAMES.XUONG, TARGET_COLUMN_NAMES.TINH_TRANG]} primarySearchColumn={{ header: TARGET_COLUMN_NAMES.HEX, label: 'Mã HEX (Tìm nhiều)' }} exportFileNamePrefix="khsx_data" enableAggregation={true} />;
  else return <DataGrid data={context.materialData} columns={context.materialColumns} primarySearchColumn={{ header: TARGET_COLUMN_NAMES.SO_PR, label: 'Số PR (Tìm nhiều)' }} additionalSearchColumns={[{ header: TARGET_COLUMN_NAMES.SO_PO, label: 'Số PO (Tìm nhiều)' }]} filterHeaders={[TARGET_COLUMN_NAMES.TRACKING_NO, TARGET_COLUMN_NAMES.CONG_TRINH, TARGET_COLUMN_NAMES.TEN_VAT_TU, TARGET_COLUMN_NAMES.NHOM_VT]} exportFileNamePrefix="material_data" enableAggregation={true} />;
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
  'LayoutDashboard': <LayoutDashboard size={20} />, 'Table': <Table size={20} />, 'Package': <Package size={20} />,
  'Shield': <Shield size={20} />, 'Calendar': <Calendar size={20} />, 'ShoppingCart': <ShoppingCart size={20} />,
  'Import': <Import size={20} />, 'FileText': <FileText size={20} />, 'ClipboardList': <ClipboardList size={20} />,
  'TrendingUp': <TrendingUp size={20} />, 'CalendarRange': <CalendarRange size={20} />, 'Export': <Upload size={20} />,
  'Clock': <Clock size={20} />
};

const AppLogo = () => (
  <div className="w-8 h-8 rounded bg-wood-600 flex items-center justify-center text-white shrink-0 shadow-sm"><TrendingUp size={18} strokeWidth={2.5} /></div>
);

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
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  const location = useLocation();
  const tableVersions = useRef<Record<string, string>>({});
  const dataLoadedRef = useRef<Record<string, boolean>>({});

const checkAndSync = async (forceAll = false) => {
  try {
    const verRes = await fetch('/api/check-versions');
    if (!verRes.ok) return;

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

    // Xác định bảng nào cần cập nhật (version đổi, hoặc forceAll, hoặc chưa từng load)
    const toUpdate: typeof tableConfigs = [];
    const toApplyFromCache: typeof tableConfigs = [];

    for (const cfg of tableConfigs) {
      const serverVer = String(serverVersions[cfg.verKey] || '0');
      const localVer = forceAll ? '0' : String(await getCachedVersion(cfg.endpoint));

      if (serverVer !== localVer || forceAll) {
        toUpdate.push(cfg);
      } else if (!dataLoadedRef.current[cfg.endpoint]) {
        toApplyFromCache.push(cfg);
      }
    }

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
      const allData = await fetchAllDataFromServer();
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

    if (hasAnyUpdate || !lastUpdated) {
      setLastUpdated(new Date());
    }
  } catch (err) {
    console.error("Lỗi đồng bộ ngầm:", err);
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    let isMounted = true;
    const applyCache = (endpoint: string, cachedObj: any, setData: Function, setCols: Function) => {
      if (cachedObj?.data) {
        setData(cachedObj.data);
        setCols(cachedObj.columns);
        dataLoadedRef.current[endpoint] = true; 
      }
    };

    const init = async () => {
      const [prod, mat, khsx, ord, inv, tkb, pth, ana, yrp, exp, stk, att] = await Promise.all([
        getCachedData('production'), getCachedData('material'), getCachedData('khsx'),
        getCachedData('order'), getCachedData('inventory'), getCachedData('tkbv'),
        getCachedData('pthsp'), getCachedData('analysis'), getCachedData('yearly-plan'),
        getCachedData('export'), getCachedData('stock'), getCachedData('attendance')
      ]);

      if (!isMounted) return;

      applyCache('production', prod, setProductionData, setProductionColumns);
      applyCache('material', mat, setMaterialData, setMaterialColumns);
      applyCache('khsx', khsx, setKhsxData, setKhsxColumns);
      applyCache('order', ord, setOrderData, setOrderColumns);
      applyCache('inventory', inv, setInventoryData, setInventoryColumns);
      applyCache('tkbv', tkb, setTkbvData, setTkbvColumns);
      applyCache('pthsp', pth, setPthspData, setPthspColumns);
      applyCache('analysis', ana, setAnalysisData, setAnalysisColumns);
      applyCache('yearly-plan', yrp, setYearlyPlanData, setYearlyPlanColumns);
      applyCache('export', exp, setExportData, setExportColumns);
      applyCache('stock', stk, setStockData, setStockColumns);
      applyCache('attendance', att, setAttendanceData, setAttendanceColumns);

      // Cho phép hiển thị khung trang luôn dù chưa có data
      setLoading(false); 

      await checkAndSync();
    };

    init();

    const POLLING_INTERVAL = 60000;
    const intervalId = setInterval(() => checkAndSync(), POLLING_INTERVAL);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkAndSync();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
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

  const confirmLogout = () => {
    setIsLogoutConfirmOpen(false);
    logout();
  };

  const manualRefresh = async () => {
    setLoading(true);
    tableVersions.current = {}; 
    await checkAndSync(true); 
    closeMobileSidebar();
  };

  const contextValue: MainLayoutContext = {
    productionData, productionColumns, materialData, materialColumns, khsxData, khsxColumns,
    orderData, orderColumns, inventoryData, inventoryColumns, tkbvData, tkbvColumns, pthspData, pthspColumns,
    analysisData, analysisColumns, yearlyPlanData, yearlyPlanColumns, exportData, exportColumns,
    stockData, stockColumns, attendanceData, attendanceColumns, isSidebarCollapsed: isCollapsed,
    isGlobalLoading: loading
  };

  return (
    <div className="flex h-screen bg-wood-50 overflow-hidden relative">
      <div className="md:hidden absolute top-0 left-0 right-0 h-16 bg-white border-b border-wood-200 flex items-center justify-between px-4 z-20">
        <div className="flex items-center gap-2 font-bold text-wood-800">
          <AppLogo />
          <span>OPS. HUB</span>
        </div>
        <button onClick={toggleMobileSidebar} className="p-2 text-slate-600 hover:bg-slate-100 rounded-md">
          {isMobileSidebarOpen ? <X /> : <Menu />}
        </button>
      </div>

      {isMobileSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 md:hidden" onClick={closeMobileSidebar} />
      )}

      <aside className={`
        fixed md:static inset-y-0 left-0 z-[60] bg-slate-900 text-slate-300
        transform transition-all duration-300 ease-in-out flex flex-col shadow-xl md:shadow-none
        ${isMobileSidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'}
        ${isCollapsed ? 'md:w-20' : 'md:w-64'}
      `}>
        <div className={`h-16 flex items-center bg-white border-b border-slate-200 transition-all duration-300 ${isCollapsed ? 'justify-center px-0' : 'justify-between px-4'}`}>
          <div className={`flex items-center gap-3 font-bold text-slate-800 text-base tracking-wide overflow-hidden whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>
            <AppLogo />
            <span>Operations Hub</span>
          </div>
          <button onClick={toggleDesktopSidebar} className={`hidden md:flex p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors ${isCollapsed ? 'mx-auto' : ''}`}>
            <Menu size={20} />
          </button>
          <button onClick={closeMobileSidebar} className="md:hidden p-2 text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {user && (
          <div className={`px-4 py-4 flex items-center gap-3 border-b border-slate-800 ${isCollapsed ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-wood-700 flex items-center justify-center text-white font-bold text-xs shrink-0 cursor-help" title={`Permissions: ${user.permissions.length} views`}>
              {user.fullName.charAt(0).toUpperCase()}
            </div>
            <div className={`overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
              <div className="text-sm text-white font-medium truncate w-40">{user.fullName}</div>
              <div className="text-[10px] text-wood-500 font-bold">{user.department || 'User'}</div>
            </div>
          </div>
        )}

        <nav className="flex-1 py-4 space-y-1 px-3">
          {APP_VIEWS.map((view) => {
            if (!hasPermission(view.id)) return null;
            return (
              <NavLink
                key={view.id}
                to={view.path}
                icon={ICON_MAP[view.iconName || 'Table']}
                label={view.label}
                active={location.pathname === view.path}
                onClick={closeMobileSidebar}
                collapsed={isCollapsed}
              />
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2">
          {user?.role === 'USER' && (
            <button
              onClick={() => { setIsChangePasswordOpen(true); closeMobileSidebar(); }}
              className={`flex items-center gap-3 w-full p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ${isCollapsed ? 'justify-center' : ''}`}
              title="Đổi mật khẩu"
            >
              <Key size={20} />
              <span className={`transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 overflow-hidden' : 'w-auto opacity-100'}`}>Đổi mật khẩu</span>
            </button>
          )}

          <button
            onClick={handleLogoutClick}
            className={`flex items-center gap-3 w-full p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors ${isCollapsed ? 'justify-center' : ''}`}
            title="Đăng xuất"
          >
            <LogOut size={20} />
            <span className={`transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 overflow-hidden' : 'w-auto opacity-100'}`}>Đăng xuất</span>
          </button>

          <div className={`text-[10px] text-slate-500 text-center transition-all duration-300 mt-2 ${isCollapsed ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}>
            Đã kết nối ngầm ({lastUpdated ? lastUpdated.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--'})
          </div>

          <button
            onClick={manualRefresh}
            className={`flex items-center justify-center w-full gap-2 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-all text-sm font-medium text-white
             ${loading ? 'opacity-50 cursor-not-allowed' : ''} ${isCollapsed ? 'px-0' : 'px-4'}`}
            disabled={loading}
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
              {loading ? '...' : 'Làm mới'}
            </span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col pt-16 md:pt-0 h-full overflow-hidden w-full transition-all duration-300 relative">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-xl font-semibold text-slate-800 mb-2">Đã xảy ra lỗi</h3>
            <p className="text-slate-500 max-w-md">{error}</p>
            <button onClick={manualRefresh} className="mt-6 px-6 py-2 bg-wood-600 text-white rounded-lg hover:bg-wood-700 transition-colors">Thử lại</button>
          </div>
        ) : (
          /* HIỂN THỊ LUÔN OUTLET (Giao diện trang con), không chặn chờ data nữa */
          <Outlet context={contextValue} />
        )}
      </main>

      {/* Change Password Modal */}
      {isChangePasswordOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Key className="text-wood-600" size={18} />
                Đổi Mật Khẩu
              </h3>
              <button onClick={() => setIsChangePasswordOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleChangePassword} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Mật khẩu cũ</label>
                <input type="password" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500 outline-none" value={oldPassword} onChange={e => setOldPassword(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Mật khẩu mới</label>
                <input type="password" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500 outline-none" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              </div>
              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setIsChangePasswordOpen(false)} className="flex-1 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium">Hủy</button>
                <button type="submit" disabled={isChangingPassword} className="flex-1 py-2 bg-wood-600 text-white rounded-lg hover:bg-wood-700 font-medium flex items-center justify-center gap-2">
                  {isChangingPassword ? <Loader size={16} className="animate-spin" /> : <Check size={16} />} Xác nhận
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {isLogoutConfirmOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Xác nhận đăng xuất</h3>
              <p className="text-sm text-slate-500 mb-6">Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?</p>

              <div className="flex gap-3">
                <button onClick={() => setIsLogoutConfirmOpen(false)} className="flex-1 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium">Hủy bỏ</button>
                <button onClick={confirmLogout} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">Đăng xuất</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

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
    className={`flex items-center gap-3 py-2.5 rounded-lg transition-all duration-200 group relative
      ${collapsed ? 'justify-center px-2' : 'px-4'}
      ${active ? 'bg-wood-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}
    `}
  >
    <div className="shrink-0 transition-colors duration-200">{icon}</div>
    <span className={`font-medium whitespace-nowrap overflow-hidden transition-all duration-300 ${collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
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