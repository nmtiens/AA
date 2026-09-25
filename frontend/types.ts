export const TARGET_COLUMN_NAMES = {

  HEX: 'hex',

  CONG_TRINH: 'ten_cong_trinh',

  XUONG: 'xuong_chinh',

  TINH_TRANG: 'tinh_trang',

  TINH_TRANG_IPO: 'tinh_trang_ipo', // New Column

  BOP: 'bop',

  GIA_TRI_CON_LAI: 'gia_tri_don_hang_con_lai',

  GIA_TRI_THUC_TE: 'gia_tri_con_lai',

  // New columns for Project Summary Section
  TRI_GIA_DON_HANG_TONG: 'tri_gia_don_hang_tong',
  THANH_TIEN_TINH_PHIEU: 'thanh_tien_tinh_phieu',

  THANH_TIEN_NHAP_KHO: 'thanh_tien_nhap_kho_luy_ke', // Cột cũ của Production View
  INVENTORY_AMOUNT: 'thanh_tien_nhap_kho', // Cột mới chính xác cho Inventory View
  EXPORT_AMOUNT: 'thanh_tien_xuat_kho', // Correct column for Export View
  EXPORT_QUANTITY: 'so_luong_xuat_kho', // ✅ MỚI: cột số lượng (khác với EXPORT_AMOUNT là cột tiền)
  GIA_TRI_TON_KHO: 'gia_tri', // For Stock View // Correct column for Export View
  MA_ID_SAP: 'ma_id_sap', // For counting unique items in Stock
  NHAP_KHO_TUAN: 'nhap_kho_tuan', // Cột mới theo yêu cầu

  // Inventory Specific Date Columns
  NAM: 'nam',
  THANG: 'thang',
  NGAY: 'ngay',
  DATE: 'date', // New Column for Inventory Overview
  TUAN: 'tuan', // New Column for Weekly Analysis

  TEN_HANG_MUC: 'ten_hang_muc',
  PHAN_LOAI_NHOM_SAN_PHAM: 'phan_loai_nhom_san_pham', // ✅ MỚI

  // Production Days Columns
  SO_NGAY_CD_HIEN_TAI: 'so_ngay_cd_hien_tai',

  // KHSX Specific Columns
  THANH_TIEN_KE_HOACH: 'thanh_tien_ke_hoach',
  PHAN_LOAI_KH: 'phan_loai_kh',
  NGAY_KHNK: 'ngay_khnk',
  MA_CONG_TRINH: 'ma_cong_trinh',

  // Order Data Specific Columns
  NGAY_NHAN_TU_PM: 'ngay_nhan_tu_pm',

  // TKBV Specific Columns
  NGAY_NHAN: 'ngay_nhan',

  // PTHSP Specific Columns
  NGAY_HOAN_THANH: 'ngay_hoan_thanh',
  THANH_TIEN_PTHSP: 'thanh_tien',

  // Material View Columns
  SO_PR: 'so_pr',
  SO_PO: 'so_po',
  TRACKING_NO: 'trackingno',
  TEN_VAT_TU: 'ten_vat_tu',
  NHOM_VT: 'nhom_vt',

  // Material Dashboard Columns
  SL_YEU_CAU: 'so_luong_yeu_cau',
  SL_DA_NHAN: 'so_luong_da_nhan_sap',
  STATUS: 'trang_thai',
  STATUS_SAP: 'trang_thai_sap',
  PR_ITEM: 'pr_line',
  MATERIAL_CODE: 'ma_vat_tu_sap',
  BASE_UNIT: 'dvt',
  REQUEST_DATE: 'ngay_pr',
  EST_DELIVERY: 'ngay_du_kien_giao_hang_pmh_nhap',
  REMAINING_QTY: 'so_luong_con_lai',
  STATUS_PO: 'tinh_trang_po',
  NOTE_PO: 'ghi_chu_tinh_trang_po',
  PR_LINE_COMBINED: 'pr_line_1',
  ACTUAL_DATE: 'ngay_ve',
  ACTUAL_QTY: 'sl_hang_ve_thuc_te',
  TEAM_PR_NOTE: 'team_pr_note',
  REQUISITIONER: 'nguoi_yeu_cau',

  // Weekly Analysis New Columns
  DUNG_KE_HOACH: 'dung_ke_hoach',
  THUC_HIEN_DUNG_KE_HOACH_1_PHAN: 'thuc_hien_dung_ke_hoach_1_phan',
  ROT_KE_HOACH: 'rot_ke_hoach',
  THUC_HIEN_ROT_KE_HOACH_1_PHAN: 'thuc_hien_rot_ke_hoach_1_phan',
  NHAP_KHO_TRUOC_KE_HOACH: 'nhap_kho_truoc_ke_hoach',
  VUOT_KE_HOACH: 'vuot_ke_hoach',
  NHAP_KHO_NGOAI_KE_HOACH: 'nhap_kho_ngoai_ke_hoach',

  // Attendance Columns
  SO_LUONG_CONG_NHAN: 'so_luong_cong_nhan',
  GIO_CONG_HC: 'gio_cong_hanh_chinh',
  GIO_CONG_TC: 'gio_cong_tang_ca',
  DINH_BIEN: 'dinh_bien'
};

export type DataRow = Record<string, any>;

export interface ColumnDefinition {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date';
}

export const COMMON_DATE_HEADERS = ['ngày', 'date', 'time', 'hạn', 'delivery', 'actual'];

export const COMMON_STATUS_HEADERS = ['trạng thái', 'tình trạng', 'status'];

export const PRODUCTION_DEFAULT_VIEW_COLUMNS = [
  TARGET_COLUMN_NAMES.HEX,
  TARGET_COLUMN_NAMES.CONG_TRINH,
  TARGET_COLUMN_NAMES.XUONG,
  TARGET_COLUMN_NAMES.TEN_HANG_MUC,
  TARGET_COLUMN_NAMES.TINH_TRANG_IPO,
  TARGET_COLUMN_NAMES.TINH_TRANG,
  TARGET_COLUMN_NAMES.SO_NGAY_CD_HIEN_TAI,
  TARGET_COLUMN_NAMES.GIA_TRI_THUC_TE,
  TARGET_COLUMN_NAMES.THANH_TIEN_NHAP_KHO,
  TARGET_COLUMN_NAMES.TRI_GIA_DON_HANG_TONG,
  TARGET_COLUMN_NAMES.THANH_TIEN_TINH_PHIEU
];

export interface AppView {
  id: string;
  path: string;
  label: string;
  iconName?: string;
}

export const APP_VIEWS: AppView[] = [
  { id: 'dashboard', path: '/', label: 'Tổng quan', iconName: 'LayoutDashboard' },
  { id: 'production', path: '/list', label: 'Dữ liệu Sản xuất', iconName: 'Table' },
  { id: 'yearly_plan_data', path: '/yearly-plan', label: 'Dữ liệu kế hoạch năm', iconName: 'CalendarRange' },
  { id: 'orders', path: '/orders', label: 'Dữ liệu Đơn hàng tổng', iconName: 'ShoppingCart' },
  { id: 'inventory', path: '/inventory', label: 'Dữ liệu Nhập kho', iconName: 'Import' },
  { id: 'export', path: '/export', label: 'Dữ liệu Xuất kho', iconName: 'Export' },
  { id: 'stock', path: '/stock', label: 'Dữ liệu Tồn kho', iconName: 'Box' },
  { id: 'attendance', path: '/attendance', label: 'Dữ liệu Điểm danh', iconName: 'Clock' },
  { id: 'khsx', path: '/khsx', label: 'Kế hoạch SX', iconName: 'Calendar' },
  { id: 'analysis', path: '/analysis', label: 'Phân tích KH-TH', iconName: 'TrendingUp' },
  { id: 'tkbv', path: '/tkbv', label: 'Dữ liệu TKBV', iconName: 'FileText' },
  { id: 'pthsp', path: '/pthsp', label: 'Dữ liệu PTHSP', iconName: 'ClipboardList' },
  { id: 'materials', path: '/materials', label: 'Vật tư', iconName: 'Package' },
  { id: 'users', path: '/users', label: 'Quản trị User', iconName: 'Shield' },
];

// ============================================================
// PHÂN QUYỀN: MỤC LỚN (group) -> MỤC NHỎ (item) -> THAO TÁC (action)
// - id của item là giá trị lưu trong user.permissions
// - id cũ (dashboard, production, orders...) được giữ nguyên để
//   user hiện có không bị mất quyền
// ============================================================
export interface PermissionItem {
  id: string;
  label: string;
}

export interface PermissionGroup {
  id: string;
  label: string;
  items: PermissionItem[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'g_dashboard',
    label: 'Tổng quan',
    items: [
      { id: 'dashboard', label: 'Tổng quan' },
    ],
  },
  {
    id: 'g_construction',
    label: 'Công trình',
    items: [
      { id: 'construction_redflow', label: 'Công trình luồng đỏ' },
      { id: 'construction_sample', label: 'Căn mẫu' },
      { id: 'construction_setup', label: 'Setup dữ liệu (phân loại công trình)' },
    ],
  },
  {
    id: 'g_charts',
    label: 'Quản trị (Biểu đồ)',
    items: [
      { id: 'chart_order', label: '1. Đơn hàng mới (P001)' },
      { id: 'chart_tkbv', label: '2. Triển khai BV (P002)' },
      { id: 'chart_pthsp', label: '3. Đã tính phiếu (P012)' },
      { id: 'chart_inventory', label: '4. Nhập kho (P022)' },
      { id: 'chart_export', label: '5. Xuất kho (P025)' },
      { id: 'chart_stock', label: '6. Tồn kho' },
    ],
  },
  {
    id: 'g_data',
    label: 'Dữ liệu',
   items: [
  { id: 'production', label: 'Dữ liệu Sản xuất' },
  { id: 'yearly_plan_data', label: 'Dữ liệu kế hoạch năm' },
  { id: 'orders', label: 'Dữ liệu Đơn hàng tổng' },
  { id: 'inventory', label: 'Dữ liệu Nhập kho' },
  { id: 'export', label: 'Dữ liệu Xuất kho' },
  { id: 'stock', label: 'Dữ liệu Tồn kho' },
  { id: 'attendance', label: 'Dữ liệu Điểm danh' },
  { id: 'khsx', label: 'Kế hoạch SX' },
  { id: 'analysis', label: 'Phân tích KH-TH' },
  { id: 'tkbv', label: 'Dữ liệu TKBV' },
  { id: 'pthsp', label: 'Dữ liệu PTHSP' },
  { id: 'materials', label: 'Vật tư' },
  { id: 'data_log', label: 'Nhật ký cập nhật' },
],
  },
  {
    id: 'g_system',
    label: 'Hệ thống',
    items: [
      { id: 'users', label: 'Quản trị User' },
    ],
  },
];

// Thao tác chi tiết bên trong từng mục nhỏ (key = id của item cha).
// Chỉ hiện trong form khi item cha được tick.
export const ITEM_ACTIONS: Record<string, { id: string; label: string }[]> = {
  dashboard: [
    { id: 'dashboard_overview', label: 'Báo cáo Tổng quan' },
    { id: 'dashboard_financial', label: 'Số liệu Tài chính' },
    { id: 'dashboard_bottleneck', label: 'Báo cáo Điểm nghẽn' },
  ],
  production: [
    { id: 'production_edit', label: 'Chỉnh sửa dữ liệu' },
    { id: 'production_export', label: 'Xuất Excel' },
  ],
  yearly_plan_data: [
    { id: 'yearly_plan_data_export', label: 'Xuất Excel' },
  ],
  orders: [
    { id: 'orders_import', label: 'Import Dữ liệu' },
    { id: 'orders_view_price', label: 'Xem Giá trị Đơn hàng' },
  ],
  materials: [
    { id: 'materials_view_price', label: 'Xem Giá/NCC' },
    { id: 'materials_edit', label: 'Cập nhật trạng thái' },
  ],
  inventory: [
    { id: 'inventory_edit', label: 'Điều chỉnh kho' },
  ],
  analysis: [
    { id: 'analysis_export', label: 'Xuất báo cáo KH-TH' },
  ],
};

// Tiện ích dùng chung
export const ALL_ITEM_IDS: string[] = PERMISSION_GROUPS.flatMap(g => g.items.map(i => i.id));
export const ALL_ACTION_IDS: string[] = Object.values(ITEM_ACTIONS).flatMap(a => a.map(x => x.id));

export interface User {
  id: string;
  username: string;
  password?: string;
  fullName: string;
  role: 'ADMIN' | 'USER';
  permissions: string[];
  msnv?: string;
  department?: string;
  note?: string;
  email?: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  token?: string;   // 👈 thêm nếu thiếu
  data?: T;
  user?: User;
  pagination?: { page: number; pageSize: number; total: number };
}