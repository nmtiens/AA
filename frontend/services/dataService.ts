import Papa from 'papaparse';
import { expandProjectNames } from '../utils/productionMetrics';
import { DataRow, ColumnDefinition, COMMON_DATE_HEADERS } from '../types';
import type { DashboardFiltersState, TuyChonTongQuan, TongQuanSanXuat } from '../components/Dashboard/core/tongQuanSanXuat';
import type { BanGhiNen } from '../components/Construction/core/banGhiCongTrinh';
import { getToken } from './userService';

// Bảng ánh xạ tên cột kỹ thuật (snake_case từ DB) sang tên hiển thị tiếng Việt.
// Bổ sung thêm khi phát hiện cột nào chưa có label đẹp.
const COLUMN_LABEL_MAP: Record<string, string> = {
  id: 'ID',
  hex: 'HEX',
  ngay_nhan_tu_pm: 'NGÀY NHẬN TỪ PM',
  ngay_nhan: 'NGÀY NHẬN',
  ngay_hoan_thanh: 'NGÀY HOÀN THÀNH',
  tri_gia_don_hang_tong: 'TRỊ GIÁ ĐƠN HÀNG TỔNG',
  xuong_chinh: 'XƯỞNG CHÍNH',
  ten_cong_trinh: 'TÊN CÔNG TRÌNH',
  ma_cong_trinh: 'MÃ CÔNG TRÌNH',
  ma_nha_may: 'MÃ NHÀ MÁY',
  updated_at: 'CẬP NHẬT LÚC',
  created_at: 'TẠO LÚC',
  date: 'NGÀY',
  nam: 'NĂM',
  thang: 'THÁNG',
  ngay: 'NGÀY',
  tuan: 'TUẦN',
  thanh_tien_nhap_kho: 'THÀNH TIỀN NHẬP KHO',
  thanh_tien_nhap_kho_luy_ke: 'THÀNH TIỀN NHẬP KHO LŨY KẾ',
  so_luong_xuat_kho: 'SỐ LƯỢNG XUẤT KHO',
  thanh_tien_xuat_kho: 'THÀNH TIỀN XUẤT KHO',  
  gia_tri: 'GIÁ TRỊ',
  gia_tri_ton_kho: 'GIÁ TRỊ TỒN KHO',
  ma_id_sap: 'MÃ ID SAP',
  tinh_trang: 'TÌNH TRẠNG',
  tinh_trang_ipo: 'TÌNH TRẠNG IPO',
  gia_tri_don_hang_con_lai: 'GIÁ TRỊ ĐƠN HÀNG CÒN LẠI',
  gia_tri_con_lai: 'GIÁ TRỊ CÒN LẠI',
  ten_hang_muc: 'TÊN HẠNG MỤC',
  so_ngay_cd_hien_tai: 'SỐ NGÀY CĐ HIỆN TẠI',
  bop: 'BOP',
  thanh_tien_tinh_phieu: 'THÀNH TIỀN TÍNH PHIẾU',
  nhom_vt: 'NHÓM VẬT TƯ',
  so_luong_yeu_cau: 'SỐ LƯỢNG YÊU CẦU',
  so_luong_da_nhan_sap: 'SỐ LƯỢNG ĐÃ NHẬN (SAP)',
  trang_thai: 'TRẠNG THÁI',
  trang_thai_sap: 'TRẠNG THÁI SAP',
  ngay_du_kien_giao_hang_pmh_nhap: 'NGÀY DỰ KIẾN GIAO HÀNG PMH NHẬP',
  bot_du_an: 'BOT DỰ ÁN',
  khach_hang: 'KHÁCH HÀNG',
  khu_vuc_du_an: 'KHU VỰC DỰ ÁN',
  // Bảng nhập / xuất / tồn kho, đơn hàng, triển khai, tính phiếu (cửa sổ "Xem chi tiết" của biểu đồ)
  so_luong_nhap_kho: 'SỐ LƯỢNG NHẬP KHO',
  ghi_chu: 'GHI CHÚ',
  ten_chi_tiet: 'TÊN CHI TIẾT',
  so_phieu: 'SỐ PHIẾU',
  tinh_doi_voi_hang_tp: 'TÍNH ĐỐI VỚI HÀNG TP',
  ten_san_pham: 'TÊN SẢN PHẨM',
  so_luong: 'SỐ LƯỢNG',
  dvt: 'ĐVT',
  nhom_ct: 'NHÓM CÔNG TRÌNH',
  tinh_trang_ke_hoach_giao_hang: 'KẾ HOẠCH GIAO HÀNG',
  so_thang_ton_kho: 'SỐ THÁNG TỒN KHO',
  ngay_nhap_kho: 'NGÀY NHẬP KHO',
  nguoi_trien_khai: 'NGƯỜI TRIỂN KHAI',
  so_luong_trien_khai: 'SỐ LƯỢNG TRIỂN KHAI',
  so_luong_tinh: 'SỐ LƯỢNG TÍNH',
  so_luong_da_tinh: 'SỐ LƯỢNG ĐÃ TÍNH',
  tinh_trang_phieu: 'TÌNH TRẠNG PHIẾU',
  ngay_duyet: 'NGÀY DUYỆT',
  ten_pm: 'PM',
  ten_pc: 'PC',
  khu_vuc: 'KHU VỰC',
  ngay_can: 'NGÀY CẦN',
  so_ipo: 'SỐ IPO',
  so_luong_don_hang_tong: 'SỐ LƯỢNG ĐƠN HÀNG TỔNG',
  don_gia_co_oh: 'ĐƠN GIÁ CÓ OH',
  phan_loai_nhom_san_pham: 'NHÓM SẢN PHẨM',
};

export const resolveColumnLabel = (header: string): string => {
  const normalized = header.trim();
  if (COLUMN_LABEL_MAP[normalized]) return COLUMN_LABEL_MAP[normalized];
  // Nếu header đã có sẵn khoảng trắng/hoa (không phải snake_case kỹ thuật), giữ nguyên
  if (/[A-ZÀ-Ỹ ]/.test(normalized) && !normalized.includes('_')) return normalized;
  // Fallback: chuyển snake_case -> "TỪ VIẾT HOA CÁCH NHAU"
  return normalized.toUpperCase().replace(/_/g, ' ');
};

export const API_BASE_URL = '/api';

// KHỞI TẠO INDEXED-DB TỐI ƯU
// Cache chỉ tải lại khi "phiên bản dữ liệu" trên server đổi; thêm/bớt CỘT ở backend
// (REPORT_COLUMNS) thì phiên bản không đổi -> phải tăng số tên DB để mọi máy tải lại 1 lần.
// V8: thêm ngay_khnk_tuan / ngay_khnk_thang (BOT theo kế hoạch nhập kho).
// V9: thêm ngay_can (ngày cần PM — hạn tham khảo khi chưa có KH / ngày cần giao).
// V10: thêm thanh_tien_xuat_kho_luy_ke / thanh_tien_ton_kho_hien_tai (Tổng quan công trình).
// V11: thêm so_luong_don_hang_tong / so_luong_nhap_kho_luy_ke (nhập đủ số lượng = đã nhập kho khi đếm).
// V12: thêm phan_tich_kh_th.nam.
// V13 (2026-10-10): thêm cột nhom_ct / tinh_trang_du_an / ngay_nhan_tu_pm / tinh_trang_trien_khai_ban_ve / tinh_trang_phieu vào bảng sản xuất
const CACHE_DB_NAME = 'OpsHub_Database_V13';
const OLD_CACHE_DB_NAMES = ['OpsHub_Database_V7', 'OpsHub_Database_V8', 'OpsHub_Database_V9', 'OpsHub_Database_V10', 'OpsHub_Database_V11', 'OpsHub_Database_V12'];
let oldCachesCleared = false;

const initDB = (): Promise<IDBDatabase> => {
  if (!oldCachesCleared) {
    oldCachesCleared = true;
    OLD_CACHE_DB_NAMES.forEach(name => { try { indexedDB.deleteDatabase(name); } catch { /* bỏ qua */ } });
  }
  return new Promise((resolve, reject) => {
 const request = indexedDB.open(CACHE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('ops_cache')) {
        db.createObjectStore('ops_cache');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};
export const fetchStockTotalCount = async (opts?: OverviewFilterOpts): Promise<number> => {
  try {
    const params = new URLSearchParams();
    appendFilterParams(params, opts);
    const qs = params.toString();
    const url = qs ? `${API_BASE_URL}/stock/total-count?${qs}` : `${API_BASE_URL}/stock/total-count`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('fetch failed');
    const data = await r.json();
    return Number(data.total) || 0;
  } catch (e) {
    console.error('fetchStockTotalCount error:', e);
    return 0;
  }
};

// ĐỌC DỮ LIỆU TỪ CACHE
export const getCachedData = async (endpoint: string): Promise<any> => {
  try {
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction('ops_cache', 'readonly');
      const store = tx.objectStore('ops_cache');
      const req = store.get(`data_${endpoint}`);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
};

// ĐỌC VERSION TỪ CACHE
export const getCachedVersion = async (endpoint: string): Promise<string> => {
  try {
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction('ops_cache', 'readonly');
      const store = tx.objectStore('ops_cache');
      const req = store.get(`version_${endpoint}`);
      req.onsuccess = () => resolve(String(req.result || '0'));
      req.onerror = () => resolve('0');
    });
  } catch {
    return '0';
  }
};

// LƯU DỮ LIỆU VÀO CACHE
// Tăng mỗi lần xoá cache (đăng xuất / đổi người dùng): lượt tải bắt đầu trước đó không được ghi đè vào cache mới
let cacheGeneration = 0;
export const getCacheGeneration = () => cacheGeneration;

export const saveToCache = async (endpoint: string, version: string, result: any, generation?: number): Promise<void> => {
  if (generation !== undefined && generation !== cacheGeneration) return;
  try {
    const db = await initDB();
    if (generation !== undefined && generation !== cacheGeneration) return;
    return new Promise((resolve) => {
      const tx = db.transaction('ops_cache', 'readwrite');
      const store = tx.objectStore('ops_cache');
      store.put(result, `data_${endpoint}`);
      store.put(String(version), `version_${endpoint}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) {
    console.error(`Lỗi lưu Cache [${endpoint}]:`, e);
  }
};

// XOÁ TOÀN BỘ CACHE DỮ LIỆU khi đổi sang người có quyền xem dữ liệu khác: /api/all-data trả CÙNG một bộ bảng cho
// mọi người, chỉ khác cột giá / NCC vật tư (quyền materials_view_price, admin luôn có). Nên cache gắn với "mức xem
// dữ liệu" chứ không gắn với từng người: đăng nhập lại / người khác cùng mức / cấp thêm quyền không liên quan dữ
// liệu (Xưởng, Vướng mắc…) đều dùng lại cache, khỏi tải lại ~440 nghìn dòng. Cache có cột giá thì xoá khi đăng xuất
// để người sau trên cùng máy không đọc được giá.
// Xoá nội dung kho thay vì xoá cả DB vì các kết nối IndexedDB đang mở sẽ chặn deleteDatabase.
const CACHE_OWNER_KEY = 'ops_cache_owner';

/** Mức xem dữ liệu của tài khoản — cache dùng chung giữa các tài khoản cùng mức */
export const mucXemDuLieu = (u: { role?: string; permissions?: string[] } | null | undefined): 'gia' | 'thuong' =>
  u?.role === 'ADMIN' || (u?.permissions ?? []).includes('materials_view_price') ? 'gia' : 'thuong';

/** Cache hiện có chứa cột giá / NCC vật tư (hoặc chưa rõ) → đăng xuất thì phải xoá */
export const cacheCoGia = (): boolean => {
  try { return localStorage.getItem(CACHE_OWNER_KEY) !== 'thuong'; } catch { return true; }
};

export const clearDataCache = async (): Promise<void> => {
  cacheGeneration++;
  try { localStorage.removeItem(CACHE_OWNER_KEY); } catch { /* bỏ qua */ }
  try {
    const db = await initDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction('ops_cache', 'readwrite');
      tx.objectStore('ops_cache').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) {
    console.error('Lỗi xoá Cache:', e);
  }
};

/** Gọi khi đăng nhập / xác thực lại: cache của mức xem dữ liệu khác thì xoá trước khi dùng. */
export const claimDataCache = async (u: { role?: string; permissions?: string[] }): Promise<void> => {
  const muc = mucXemDuLieu(u);
  let owner: string | null = null;
  try { owner = localStorage.getItem(CACHE_OWNER_KEY); } catch { /* bỏ qua */ }
  if (owner !== muc) await clearDataCache();
  try { localStorage.setItem(CACHE_OWNER_KEY, muc); } catch { /* bỏ qua */ }
};

// TẢI TRỰC TIẾP TỪ SERVER
export const fetchFromServer = async (
  endpoint: string,
  updatedAfter?: string
): Promise<{ data: DataRow[]; columns: ColumnDefinition[] } | null> => {
  try {
    const url = updatedAfter && updatedAfter !== '0'
      ? `${API_BASE_URL}/${endpoint}?updated_after=${updatedAfter}`
      : `${API_BASE_URL}/${endpoint}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch data: ${response.statusText}`);

    const rawData = (await response.json()) as DataRow[];
    if (!rawData || rawData.length === 0) return { data: [], columns: [] };

    const headers = Object.keys(rawData[0]).filter(k => k && k.trim() !== '');
    const columns: ColumnDefinition[] = headers.map(header => ({
      key: header,
      label: resolveColumnLabel(header),
      type: detectColumnType(header, rawData)
    }));

    return { data: rawData, columns };
  } catch (error) {
    console.error(`Error fetching API [${endpoint}]:`, error);
    return null;
  }
};

const detectColumnType = (header: string, data: DataRow[]): 'string' | 'number' | 'date' => {
  const lowerHeader = header.toLowerCase();
  if (COMMON_DATE_HEADERS.some(h => lowerHeader.includes(h))) return 'date';
  for (let i = 0; i < Math.min(data.length, 5); i++) {
    const value = data[i][header];
    if (value !== null && value !== undefined) {
      if (typeof value === 'number') return 'number';
      if (typeof value === 'string' && !isNaN(Number(value)) && value.trim() !== '') return 'number';
    }
  }
  return 'string';
};

export const exportToCSV = (data: DataRow[], filename: string) => {
  const csv = Papa.unparse(data, { delimiter: ',' });
  const content = '\uFEFF' + csv;   // bỏ 'sep=,\r\n', chỉ giữ BOM
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

// Danh sách endpoint tương ứng với key trả về từ /api/all-data
const ALL_DATA_ENDPOINT_MAP: Record<string, string> = {
  production: 'production',
  material: 'material',
  khsx: 'khsx',
  order: 'order',
  inventory: 'inventory',
  tkbv: 'tkbv',
  pthsp: 'pthsp',
  analysis: 'analysis',
  yearlyPlan: 'yearly-plan',
  export: 'export',
  attendance: 'attendance',
  stock: 'stock',
};

const buildColumnsFromData = (rawData: DataRow[]): ColumnDefinition[] => {
  if (!rawData || rawData.length === 0) return [];

  // Lấy UNION toàn bộ key từ tất cả các dòng, tránh trường hợp dòng đầu
  // thiếu field (do giá trị null/undefined bị lược khỏi JSON) làm mất cột.
  const headerSet = new Set<string>();
  rawData.forEach(row => {
    Object.keys(row).forEach(k => {
      if (k && k.trim() !== '') headerSet.add(k);
    });
  });
  const headers = Array.from(headerSet);

  return headers.map(header => ({
    key: header,
    label: resolveColumnLabel(header),
    type: detectColumnType(header, rawData)
  }));
};

/** Bảng định dạng cột của /api/all-data?fmt=cot ({c: tên cột, r: mảng giá trị}) -> mảng dòng như cũ. Máy chủ
 *  bản cũ / nhánh dự phòng vẫn trả mảng dòng => giữ nguyên. Gửi tên cột 1 lần thay vì lặp ở mọi dòng: JSON nhỏ hơn
 *  nhiều (sản xuất ~59 MB -> phần lớn là tên cột), tải + phân tích nhanh hơn. */
export const giaiCot = (v: unknown): DataRow[] => {
  if (Array.isArray(v)) return v as DataRow[];
  const o = v as { c?: string[]; r?: unknown[][] } | null;
  if (!o || !Array.isArray(o.c) || !Array.isArray(o.r)) return [];
  const c = o.c;
  const n = c.length;
  const out: DataRow[] = new Array(o.r.length);
  for (let j = 0; j < o.r.length; j++) {
    const a = o.r[j];
    const row: Record<string, unknown> = {};
    for (let i = 0; i < n; i++) row[c[i]] = a[i];
    out[j] = row as DataRow;
  }
  return out;
};

const ALL_DATA_CONCURRENCY = 2;
const ALL_DATA_GROUP_MB = 3.5;
// Dung lượng gzip ước lượng của từng bảng (đo 10/2026) — chỉ để chia nhóm request; bảng lạ coi 1 MB
const ALL_DATA_EST_MB: Record<string, number> = {
  production: 3.1, inventory: 3.4, material: 1.35, order: 1.3, export: 1.3,
  pthsp: 0.5, tkbv: 0.4, khsx: 0.3, analysis: 0.1, stock: 0.05, attendance: 0.01, yearlyPlan: 0.01,
};

// Tải nhiều bảng qua /api/all-data (mỗi bảng 1 request, chạy song song).
// endpoints: danh sách bảng cần tải (theo tên endpoint, vd 'production', 'yearly-plan');
// không truyền => tải đủ 12 bảng. Kết quả chỉ chứa các bảng đã yêu cầu.
export const fetchAllDataFromServer = async (
  endpoints?: string[]
): Promise<Record<string, { data: DataRow[]; columns: ColumnDefinition[] }> | null> => {
  try {
    const keys = endpoints
      ? Object.entries(ALL_DATA_ENDPOINT_MAP).filter(([, ep]) => endpoints.includes(ep)).map(([key]) => key)
      : null;
    if (keys && keys.length === 0) return {};

    // Chia các bảng thành vài nhóm, mỗi nhóm ≤ ALL_DATA_GROUP_MB (ước lượng theo dung lượng gzip đo được), mỗi
    // nhóm 1 request, tối đa ALL_DATA_CONCURRENCY request song song:
    //  - gộp cả 10–12 bảng vào 1 request => ~10 MB gzip, vượt giới hạn ~4,5 MB của serverless function Vercel => 500;
    //  - mỗi bảng 1 request (12 request) => Vercel dựng nhiều instance, mỗi instance mở kết nối DB riêng => vượt
    //    trần pooler ("no more connections allowed (max_client_conn)") => mọi API 500.
    const wanted = keys ?? Object.keys(ALL_DATA_ENDPOINT_MAP);
    const groups: string[][] = [];
    const groupMb: number[] = [];
    [...wanted].sort((a, b) => (ALL_DATA_EST_MB[b] ?? 1) - (ALL_DATA_EST_MB[a] ?? 1)).forEach(key => {
      const mb = ALL_DATA_EST_MB[key] ?? 1;
      const i = groupMb.findIndex(g => g + mb <= ALL_DATA_GROUP_MB);
      if (i === -1) { groups.push([key]); groupMb.push(mb); } else { groups[i].push(key); groupMb[i] += mb; }
    });
    const raw: Record<string, DataRow[]> = {};
    let next = 0;
    const worker = async () => {
      while (next < groups.length) {
        const g = groups[next++];
        // Nhóm lỗi thì bỏ qua (ghi log) — các nhóm khác vẫn trả về để lưu cache; trước 1 nhóm lỗi là bỏ cả kết quả,
        // lần mở sau lại tải lại từ đầu ~10 MB
        try {
          const response = await fetch(`${API_BASE_URL}/all-data?tables=${encodeURIComponent(g.join(','))}&fmt=cot`, { cache: 'no-store' });
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
          const part = await response.json();
          g.forEach(key => { raw[key] = giaiCot(part[key]); });
        } catch (e) {
          console.error(`Error fetching /api/all-data (${g.join(',')}):`, e);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(ALL_DATA_CONCURRENCY, groups.length) }, worker));

    if (Object.keys(raw).length === 0) return null; // không nhóm nào tải được
    const result: Record<string, { data: DataRow[]; columns: ColumnDefinition[] }> = {};
    Object.entries(ALL_DATA_ENDPOINT_MAP).forEach(([key, endpoint]) => {
      if (keys && !keys.includes(key)) return;
      // Bảng thuộc nhóm lỗi: không trả => App không lưu phiên bản mới, lần đồng bộ sau tự tải lại riêng bảng đó
      if (!Object.prototype.hasOwnProperty.call(raw, key)) return;
      const rows: DataRow[] = raw[key] || [];
      result[endpoint] = { data: rows, columns: buildColumnsFromData(rows) };
    });
    return result;
  } catch (error) {
    console.error('Error fetching /api/all-data:', error);
    return null;
  }
};

export const exportToExcel = async (data: any[], filename: string) => {
  if (data.length === 0) return;
  if (!(window as any).XLSX) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  const XLSX = (window as any).XLSX;
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
};

// ==================== CÁC HÀM GỌI API TÍNH TOÁN Ở BACKEND ====================

export interface OverviewSummaryEntry {
  daily: { count: number; value: number };
  mtd: { count: number; value: number };
  lastMonth: { count: number; value: number };
}
export interface OverviewSummary {
  date: string;
  dateFrom?: string;
  order: OverviewSummaryEntry;
  tkbv: OverviewSummaryEntry;
  pthsp: OverviewSummaryEntry;
  inventory: OverviewSummaryEntry;
  export: OverviewSummaryEntry;
}

export interface GroupAnalysisRow {
  name: string;
  dailyCount: number;
  dailyValue: number;
  mtdCount: number;
  mtdValue: number;
}

/** count = số mã SAP giá trị ≠ 0; count0 = số mã chỉ có dòng giá trị 0 */
export interface StockDateEntry { date: string; count: number; count0?: number; value: number; }
export interface StockByProjectRow { name: string; count: number; value: number; }

export interface Revenue2026Data {
  year: number;
  targetRevenue2026: number;
  quarterlyTargets: { q1: number; q2: number; q3: number; q4: number };
  actual: { value: number; percent: number };
  byWorkshop: { name: string; plan: number; actual: number }[];
}

interface OverviewFilterOpts {
  signal?: AbortSignal;
  congTrinh?: string[];
  xuong?: string[];
  tinhTrang?: string[];
  tinhTrangIpo?: string[];
}

const appendFilterParams = (params: URLSearchParams, opts?: OverviewFilterOpts) => {
  // Mở rộng thành mọi cách viết của cùng công trình (các bảng nhập/xuất/tồn kho có thể ghi tên khác)
  // Ngăn bằng "|" vì tên công trình có thể chứa dấu phẩy (server đọc được cả 2 kiểu)
  if (opts?.congTrinh?.length) params.set('congTrinh', expandProjectNames(opts.congTrinh).join('|') + '|');
  if (opts?.xuong?.length) params.set('xuong', opts.xuong.join(','));
  if (opts?.tinhTrang?.length) params.set('tinhTrang', opts.tinhTrang.join(','));
  if (opts?.tinhTrangIpo?.length) params.set('tinhTrangIpo', opts.tinhTrangIpo.join(','));
};

export const fetchOverviewSummary = async (
  dateFromISO?: string,
  dateToISO?: string,
  datesISO?: string[],
  opts?: OverviewFilterOpts
): Promise<OverviewSummary | null> => {
  try {
    const params = new URLSearchParams();
    if (dateFromISO) params.set('dateFrom', dateFromISO);
    if (dateToISO) params.set('dateTo', dateToISO);
    if (datesISO?.length) params.set('dates', datesISO.join(','));
    appendFilterParams(params, opts);
    const qs = params.toString();
    const url = qs ? `${API_BASE_URL}/overview/summary?${qs}` : `${API_BASE_URL}/overview/summary`;
    const r = await fetch(url, { signal: opts?.signal });
    if (!r.ok) throw new Error('fetch failed');
    return await r.json();
  } catch (e: any) {
    if (e.name === 'AbortError') return null;
    console.error('fetchOverviewSummary error:', e);
    return null;
  }
};

export const fetchOverviewByGroup = async (
  key: 'order' | 'tkbv' | 'pthsp' | 'inventory' | 'export',
  groupBy: 'xuong' | 'congtrinh',
  dateParams: { datesISO?: string[]; dateFromISO?: string; dateToISO?: string; allTime?: boolean } & OverviewFilterOpts
): Promise<GroupAnalysisRow[]> => {
  try {
    const q = new URLSearchParams({ key, groupBy });
    if (dateParams.datesISO?.length) q.set('dates', dateParams.datesISO.join(','));
    else {
      if (dateParams.dateFromISO) q.set('dateFrom', dateParams.dateFromISO);
      if (dateParams.dateToISO) q.set('dateTo', dateParams.dateToISO);
      if (dateParams.allTime) q.set('allTime', '1');
    }
    appendFilterParams(q, dateParams);
    const url = `${API_BASE_URL}/overview/by-group?${q.toString()}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('fetch failed');
    return await r.json();
  } catch (e) {
    console.error('fetchOverviewByGroup error:', e);
    return [];
  }
};

export const fetchStockDates = async (opts?: OverviewFilterOpts): Promise<StockDateEntry[] | null> => {
  try {
    const params = new URLSearchParams();
    appendFilterParams(params, opts);
    const qs = params.toString();
    const url = qs ? `${API_BASE_URL}/stock/dates?${qs}` : `${API_BASE_URL}/stock/dates`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('fetch failed');
    return await r.json();
  } catch (e) {
    console.error('fetchStockDates error:', e);
    return null; // null thay vì [] để phân biệt "lỗi" với "thực sự rỗng"
  }
};

export const fetchStockByProject = async (
  dateISO: string,
  opts?: OverviewFilterOpts
): Promise<StockByProjectRow[]> => {
  try {
    const params = new URLSearchParams({ date: dateISO });
    appendFilterParams(params, opts);
    const r = await fetch(`${API_BASE_URL}/stock/by-project?${params.toString()}`);
    if (!r.ok) throw new Error('fetch failed');
    return await r.json();
  } catch (e) {
    console.error('fetchStockByProject error:', e);
    return [];
  }
};

/** Báo cáo Tồn kho thành phẩm v5 (/api/stock/health), triệu đồng; backend: server/tonKhoV5.ts.
 *  Tuổi tính từ ngày nhập; "cũ" = tuổi > 6 tháng (từ 198 ngày); chỉ xuất TÍNH vào % xuất, xuất cuối, xuất 60 ngày. */
export interface StockHealth {
  date: string;
  /** chuaXuat = HEX xuất TÍNH < 5% số nhập; chuaXuat4 = phần từ 4 tháng trở lên; du = nhập chưa khớp xuất + tồn */
  tong: { v: number; cu: number; cu12: number; khongNgay: number; ma: number; ma0?: number; congTrinh: number; chuaXuat: number; chuaXuat4: number; du: number; duPhanLoai: number };
  /** Mọi lần chốt từ cuối năm trước tới ngày xem */
  moc: { d: string; v: number; cu: number }[];
  /** Mốc cuối tháng (mốc cuối = ngày xem). cuGoi/tonGoi của gói đứng yên; vuotMoc/ra đo theo lô, null ở mốc đầu */
  cuoiThang: { d: string; v: number; cu: number; cuGoi: number; tonGoi: number; cu12: number; vuotMoc: number | null; ra: number | null }[];
  duAnMoc: { d: string; da: Record<string, { v: number; cu: number }> }[];
  /** Gói CT.. tồn ≥ 2% tổng, không xuất TÍNH 60 ngày, lớn nhất */
  goiDung: { ct: string; ten: string; pm: string | null; ton: number; cu: number; nhap: number; xuat: number; xuatCuoi: string | null; ngayKhongXuat: number | null } | null;
  /** Gói đứng yên + tối đa 2 gói cùng PM có xuất 60 ngày, ưu tiên cùng dự án rồi xuất lớn nhất; lũy kế null trước tháng đầu của gói */
  soSanhGoi: { ct: string; ten: string; thang: string[]; nhapLuyKe: (number | null)[]; xuatLuyKe: (number | null)[]; ton: number; xuat60: number; xuatCuoi: string | null }[];
  /** Gói cùng PM còn lại, chỉ ghi dòng số */
  goiCungPm: { ct: string; ten: string; ton: number; xuat60: number; xuatCuoi: string | null }[];
  /** Sắp giảm dần theo tồn; pctNhap theo tiền đơn (bỏ huỷ), pctXuat = xuất TÍNH tiền / nhập tiền */
  duAn: {
    duAn: string; pm: string[]; hang: { ten: string; v: number }[]; ton: number; moi: number; cu: number; khongNgay: number; cu12: number;
    soMa: number; pctNhap: number | null; pctXuat: number | null; xuatCuoi: string | null; donChuaNhap: number;
  }[];
  /** k: chuaXuat, giaoDo, ganXong, theoNhip, huy, khongPsa */
  phanChia: { k: string; nhom: string; gt: number; cu: number; hex: number }[];
  /** Mọi dự án có hàng chưa xuất TÍNH, sắp theo phần từ 4 tháng; thieuBo là suy luận từ ghi chú */
  chuaXuatDuAn: { duAn: string; t01: number; t23: number; t46: number; t6: number; khong: number; thieuBo: number; tong: number }[];
  /** Cửa sổ ngay = 3 cặp mốc cuối tháng gần nhất; huy = phần đơn huỷ tách dòng riêng */
  goiCu: {
    dong: { ct: string; ten: string; duAn: string; pm: string | null; cu: number; ra93: number; xuat60: number | null; xuatCuoi: string | null; huy?: boolean }[];
    conLai: { soGoi: number; cu: number; ra93: number };
    tong: { cu: number; ra93: number };
    ngay: number; vao: number; ra: number; vaoThang: number; raThang: number;
  };
  /** thang: 'truoc', 'YYYY-MM', 'khong'; moc6 là mức trần khi tồn không đổi; vachCu = ngày nhập ứng với mốc cũ */
  loNhap: {
    seri: string[];
    cot: { thang: string; tong: number; cu: number; theoDuAn: Record<string, number> }[];
    vachCu: string;
    moc6: { moc: string; gt: number; theoDuAn: Record<string, number> }[];
  };
  /** thangTon = tồn / xuất TÍNH 3 kỳ; thangTheoLo = tồn / mức giảm theo mã + công trình 3 kỳ (2 cách đo) */
  ky: {
    /** kyDo = kỳ cuối chưa hết tháng */
    dong: { den: string; ngay: number; nhap: number; xuatTinh: number; chuaDoiSoat: number; ton: number; thangTon: number | null; kyDo?: boolean }[];
    tong: { nhap: number; xuatTinh: number; chuaDoiSoat: number };
    thangTheoLo: number | null;
  };
  /** du = choVeKho + lapCongTrinh + daRoiKho + chuaRo; theoMa: 4 mã lớn nhất + dòng ct null "các mã còn lại" */
  soSach: {
    tu: string | null; du: number; choVeKho: number; lapCongTrinh: number; daRoiKho: number; chuaRo: number; hexChuaVaoSo: number;
    theoMa: { ct: string | null; ten: string; duAn: string | null; du: number }[];
    kiemKe: { ten: string; gt: number; ghiChu: string | null }[];
  };
  /** Số cho khối "Vấn đề cần trả lời" */
  doiChieu: {
    sapVuot: { den: string; gt: number; theoDuAn: { duAn: string; gt: number }[] };
    khongPsa: { gt: number; cu: number; lonNhat: { ct: string; ten: string; v: number }[] };
    huy: { gt: number; cu: number; ct: string[]; soGhi: string | null };
  };
}

/** Sức khoẻ tồn kho tại 1 ngày chốt (cửa sổ Tồn kho, tab Tổng quan) */
export const fetchStockHealth = async (dateISO: string, opts?: OverviewFilterOpts): Promise<StockHealth> => {
  const params = new URLSearchParams({ date: dateISO });
  appendFilterParams(params, opts);
  const r = await fetch(`${API_BASE_URL}/stock/health?${params.toString()}`, { signal: opts?.signal });
  if (!r.ok) throw new Error(`Lỗi ${r.status}`);
  return r.json();
};

/** Yêu cầu chi tiết của 1 con số báo cáo v5. Ý nghĩa từng loai + tham số: đầu file backend/src/server/tonKhoV5ChiTiet.ts */
export type StockHealthDetailLoai =
  | 'ton' | 'phan_chia' | 'chua_xuat' | 'huy' | 'khong_psa' | 'sap_vuot' | 'moc6' | 'lo_nhap' | 'goi_cu' | 'goi_ra' | 'goi_vao' | 'kiem_ke'
  | 'moc' | 'vuot_moc' | 'ra' | 'so_moc' | 'nhap' | 'xuat_tinh' | 'chua_doi_soat' | 'du' | 'so_sach' | 'da_nhap' | 'don_chua_nhap';
export interface StockHealthDetailQuery {
  loai: StockHealthDetailLoai;
  ct?: string; duAn?: string[]; tuoi?: 'moi' | 'cu' | 'cu12' | 'khong'; nsp?: string; nhom?: string; nhomTuoi?: string[];
  thang?: string[]; seri?: string; moc?: string; d?: string; tu?: string; den?: string; denThang?: string;
  f?: 'v' | 'cu'; phan?: 'goi' | 'con'; muc?: string;
  cu?: boolean; huy?: boolean; conLai?: boolean; lon?: boolean; xuat60?: boolean;
}
/** Danh sách dòng tạo nên 1 con số. tong: triệu đồng, đủ kể cả khi cắt dòng (tối đa 5000); cột kieu 'ty' có giá trị triệu đồng; phu: số phụ để đọc % */
export interface StockHealthDetail {
  tieuDe: string;
  tong: number;
  soDong: number;
  cot: { k: string; nhan: string; kieu: 'chu' | 'ty' | 'ngay' | 'so' }[];
  rows: Record<string, any>[];
  truncated: boolean;
  phu?: { nhan: string; gt: number }[];
}
export const fetchStockHealthDetail = async (dateISO: string, yc: StockHealthDetailQuery, opts?: OverviewFilterOpts): Promise<StockHealthDetail> => {
  const params = new URLSearchParams({ date: dateISO });
  appendFilterParams(params, opts);
  for (const [k, v] of Object.entries(yc)) {
    if (v === undefined || v === false) continue;
    if (Array.isArray(v)) v.forEach(x => params.append(k, x));
    else params.set(k, v === true ? '1' : v);
  }
  const r = await fetch(`${API_BASE_URL}/stock/health/chi-tiet?${params.toString()}`, { signal: opts?.signal });
  if (!r.ok) {
    const loi = await r.json().catch(() => null);
    throw new Error(loi?.error || `Lỗi ${r.status}`);
  }
  return r.json();
};

/** Chi tiết từng mã tồn kho tại 1 ngày; project = 1 công trình (bỏ trống = mọi công trình trong phạm vi lọc) */
export const fetchStockItems = async (
  dateISO: string,
  project: string | null,
  opts?: OverviewFilterOpts
): Promise<{ rows: Record<string, any>[]; truncated: boolean }> => {
  const params = new URLSearchParams({ date: dateISO });
  if (project) params.set('project', project);
  appendFilterParams(params, opts);
  const r = await fetch(`${API_BASE_URL}/stock/items?${params.toString()}`, { signal: opts?.signal });
  if (!r.ok) throw new Error(`Lỗi ${r.status}`);
  return r.json();
};

export const fetchRevenue2026 = async (year?: string | number): Promise<Revenue2026Data | null> => {
  try {
    const url = year
      ? `${API_BASE_URL}/revenue/${year}`
      : `${API_BASE_URL}/revenue`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('fetch failed');
    return await r.json();
  } catch (e) {
    console.error('fetchRevenue2026 error:', e);
    return null;
  }
};

/**
 * Màn đầu "Tổng quan" do máy chủ tính sẵn (cùng code core/tongQuanSanXuat.ts) — dùng khi trình duyệt chưa có bảng
 * sản xuất (người mới / máy mới). null = lỗi / bị huỷ.
 */
export const fetchTongQuanSanXuat = async (
  body: { filters: DashboardFiltersState; tuyChon: TuyChonTongQuan }, signal?: AbortSignal,
): Promise<TongQuanSanXuat | null> => {
  try {
    const r = await fetch(`${API_BASE_URL}/tong-quan/san-xuat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.success ? d as TongQuanSanXuat : null;
  } catch (e: any) {
    if (e?.name !== 'AbortError') console.error('fetchTongQuanSanXuat error:', e);
    return null;
  }
};

/** Nguồn số của bản ghi dựng sẵn: theo file công trình (máy chủ đã ghép như ghepFileCongTrinh) hay dữ liệu app */
export interface NguonBanGhiCongTrinh { theoFile: boolean; capNhat?: string | null; soFile?: number }
/** Bản ghi gọn "Tổng quan công trình" máy chủ dựng sẵn (nén cột) + nguồn số — dùng khi chưa có bảng sản xuất. null = lỗi. */
export const fetchTongQuanCongTrinhDu = async (): Promise<{ banGhi: BanGhiNen; nguon: NguonBanGhiCongTrinh } | null> => {
  try {
    const r = await fetch(`${API_BASE_URL}/tong-quan/cong-trinh`);
    if (!r.ok) return null;
    const d = await r.json();
    return d?.success ? { banGhi: d.banGhi as BanGhiNen, nguon: (d.nguon as NguonBanGhiCongTrinh) ?? { theoFile: false } } : null;
  } catch (e) {
    console.error('fetchTongQuanCongTrinh error:', e);
    return null;
  }
};
export const fetchTongQuanCongTrinh = async (): Promise<BanGhiNen | null> => (await fetchTongQuanCongTrinhDu())?.banGhi ?? null;

export interface KhsxNhapKhoSummary {
  totalKh: number;
  totalTh: number;
  /** Phần nhập kho của hạng mục CÓ trong KH cùng kỳ (tỷ lệ hoàn thành = totalThPlan / totalKh) */
  totalThPlan: number;
  completionRate: number;
  /** Xem theo tháng mà kỳ chưa có KH tháng: tổng KH tuần cùng kỳ (để chú thích, không cộng vào KH) */
  weeklyKhFallback?: number;
  byXuong: { xuong: string; kh: number; th: number; thPlan: number }[];
  byCongTrinh: { name: string; code: string; kh: number; th: number; thPlan: number }[];
}

export async function fetchKhsxNhapKhoSummary(params: {
  nam: string; thang?: string; mode?: 'month' | 'week'; tuan?: string; ngay?: string;
  congTrinh?: string[]; xuong?: string[];
  signal?: AbortSignal;
}): Promise<KhsxNhapKhoSummary | null> {
  const q = new URLSearchParams({ nam: params.nam, mode: params.mode ?? 'month' });
  if (params.thang) q.set('thang', params.thang);
  if (params.tuan) q.set('tuan', params.tuan);
  if (params.ngay) q.set('ngay', params.ngay);
  if (params.congTrinh?.length) q.set('congTrinh', expandProjectNames(params.congTrinh).join('|') + '|');
  if (params.xuong?.length) q.set('xuong', params.xuong.join(','));

  try {
    const res = await fetch(`${API_BASE_URL}/khsx-nhapkho/summary?${q.toString()}`, {
      signal: params.signal,
    });
    if (!res.ok) return null;
    return res.json();
  } catch (e: any) {
    if (e.name === 'AbortError') return null;
    console.error('fetchKhsxNhapKhoSummary error:', e);
    return null;
  }
}

export const fetchStockForExport = async (dates?: string[]): Promise<DataRow[]> => {
  try {
    const qs = dates && dates.length > 0 ? `?dates=${dates.join(',')}` : '';
    const r = await fetch(`${API_BASE_URL}/stock/export${qs}`);
    if (!r.ok) throw new Error('fetch failed');
    return await r.json();
  } catch (e) {
    console.error('fetchStockForExport error:', e);
    return [];
  }
};

// ==================== VIEW PROJECT MAPPING (Setup theo View) ====================
// Danh sách công trình được admin setup cho từng view (Luồng đỏ, Căn mẫu...).
// Lưu tập trung ở backend (bảng view_project_mapping) thay vì localStorage,
// để mọi người dùng ở bất kỳ máy nào cũng thấy cùng 1 cấu hình do admin setup.

/** GET /view-project-mapping: khoá nhóm ('luong-do') -> string[]; khoá '<nhóm>:thu-tu' -> {ten, stt, luong}[]
 *  (xem viewDataConfig.loadViewMapping — tách 2 loại, không đọc thẳng). */
export type ViewProjectMapping = Record<string, unknown[]>;

// Cấu hình đọc lúc mở app: lỗi (thường 500 do DB tạm hết kết nối khi cả trang bắn nhiều request lúc đăng nhập)
// thì thử lại 1 lần sau 1 giây — trả {} sớm khiến trang dùng cấu hình rỗng tới lần tải sau.
const fetchJsonRetry = async (url: string) => {
  let r = await fetch(url);
  if (!r.ok && r.status >= 500) { await new Promise(res => setTimeout(res, 1000)); r = await fetch(url); }
  if (!r.ok) throw new Error(`fetch failed (${r.status})`);
  return r.json();
};

export const fetchViewProjectMapping = async (): Promise<ViewProjectMapping> => {
  try {
    return await fetchJsonRetry(`${API_BASE_URL}/view-project-mapping`);
  } catch (e) {
    console.error('fetchViewProjectMapping error:', e);
    return {};
  }
};

// SỬA: dùng chung getToken() từ userService.ts (đọc đúng key 'app_token' ở
// localStorage/sessionStorage) thay vì tự đọc sai key 'token' như bản cũ —
// đây là lý do POST luôn 401 trước đây dù đã đăng nhập ADMIN.
export const saveViewProjectMapping = async (
  viewId: string,
  projects: string[],
  /** Kèm STT + luồng đỏ/vàng (lưu ở '<viewId>:thu-tu' cùng giao dịch); bỏ trống = giữ thứ tự đã lưu */
  thuTu?: { ten: string; stt: number; luong: 'do' | 'vang' }[]
): Promise<boolean> => {
  try {
    const token = getToken();
    const r = await fetch(`${API_BASE_URL}/view-project-mapping/${encodeURIComponent(viewId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(thuTu ? { projects, thuTu } : { projects }),
    });
    if (!r.ok) throw new Error('save failed');
    return true;
  } catch (e) {
    console.error('saveViewProjectMapping error:', e);
    return false;
  }
};


// ==================== KH NHẬP KHO ĐÃ ĐẠT TRONG KỲ ====================

/** HEX đã nhập đủ SL KH tuần / tháng trong kỳ (không tính trễ theo KH đó) — xem productionMetrics.deadlineOf. */
/** Bảng tên phụ -> tên chuẩn công trình của server (xem productionMetrics.setServerProjectAliases). */
// Gọi trùng lúc đang chạy (StrictMode bản dev, Làm mới) dùng chung 1 request
const dangChay = new Map<string, Promise<unknown>>();
const chanTrung = <T>(khoa: string, f: () => Promise<T>): Promise<T> => {
  const p = dangChay.get(khoa) as Promise<T> | undefined;
  if (p) return p;
  const moi = f().finally(() => { dangChay.delete(khoa); });
  dangChay.set(khoa, moi);
  return moi;
};

export const fetchProjectAliases = (): Promise<{ k: string; c: string }[]> => chanTrung('project-aliases', async () => {
  try {
    const token = getToken();
    const r = await fetch(`${API_BASE_URL}/project-aliases`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!r.ok) throw new Error('fetch failed');
    const d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch (e) {
    console.error('fetchProjectAliases error:', e);
    return [];
  }
});

export const fetchPlanMet = (): Promise<{ tuan: string[]; thang: string[] }> => chanTrung('plan-met', async () => {
  try {
    const token = getToken();
    const r = await fetch(`${API_BASE_URL}/production/plan-met`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!r.ok) throw new Error('fetch failed');
    return await r.json();
  } catch (e) {
    console.error('fetchPlanMet error:', e);
    return { tuan: [], thang: [] };
  }
});

export interface TuyChonThoiGian {
  ngay: string[];
  khsx: { nam: string[]; thang: string[]; ngay: string[]; tuan: string[] };
}
/** Danh sách ngày, năm-tháng-tuần cho bộ lọc Tổng quan. Lỗi trả null: nơi gọi tải bảng như cũ. */
export const fetchTuyChonThoiGian = (): Promise<TuyChonThoiGian | null> => chanTrung('tuy-chon-thoi-gian', async () => {
  try {
    const r = await fetch(`${API_BASE_URL}/overview/tuy-chon-thoi-gian`);
    if (!r.ok) throw new Error('fetch failed');
    return await r.json();
  } catch (e) {
    console.error('fetchTuyChonThoiGian error:', e);
    return null;
  }
});

// ==================== SETUP GỘP XƯỞNG ====================

export interface WorkshopCodeInfo { code: string; counts: Record<string, number>; total: number }
export interface WorkshopGroupsDTO { mapping: Record<string, string>; codes?: WorkshopCodeInfo[] }

/** Setup gộp xưởng (mã gốc -> xưởng gộp). withCodes: kèm các mã xưởng đang có trong dữ liệu. */
export const fetchWorkshopGroups = async (withCodes: boolean): Promise<WorkshopGroupsDTO> => {
  try {
    const token = getToken();
    const r = await fetch(`${API_BASE_URL}/workshop-groups${withCodes ? '?codes=1' : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) throw new Error('fetch failed');
    return await r.json();
  } catch (e) {
    console.error('fetchWorkshopGroups error:', e);
    return { mapping: {} };
  }
};

/** Lưu toàn bộ setup gộp xưởng (chỉ ADMIN). */
export const saveWorkshopGroups = async (
  mapping: Record<string, string>
): Promise<{ success: boolean; message?: string; mapping?: Record<string, string> }> => {
  try {
    const token = getToken();
    const r = await fetch(`${API_BASE_URL}/workshop-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ mapping }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { success: false, message: body?.message || 'Lưu thất bại' };
    return body;
  } catch (e) {
    console.error('saveWorkshopGroups error:', e);
    return { success: false, message: 'Không kết nối được máy chủ' };
  }
};

// ==================== TABLE COLUMN CONFIG (Setup cột cho từng bảng) ====================

export interface TableColumnConfigDTO {
  allowedColumns: string[];
  defaultVisibleColumns: string[];
}
export type TableColumnConfigMap = Record<string, TableColumnConfigDTO>;

export const fetchTableColumnConfig = async (): Promise<TableColumnConfigMap> => {
  try {
    return await fetchJsonRetry(`${API_BASE_URL}/table-column-config`);
  } catch (e) {
    console.error('fetchTableColumnConfig error:', e);
    return {};
  }
};

export const saveTableColumnConfig = async (
  tableId: string,
  config: TableColumnConfigDTO
): Promise<boolean> => {
  try {
    const token = getToken();
    const r = await fetch(`${API_BASE_URL}/table-column-config/${encodeURIComponent(tableId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(config),
    });
    if (!r.ok) throw new Error('save failed');
    return true;
  } catch (e) {
    console.error('saveTableColumnConfig error:', e);
    return false;
  }
};
// Kế hoạch năm (khsx_nam, TỶ ĐỒNG) theo tháng / xưởng trong khoảng tháng [from, to] (YYYY-MM)
export interface YearPlanData {
  byMonth: { period: string; value: number }[];
  byXuong: { xuong: string; value: number }[];
}
export const fetchYearPlan = async (from: string, to: string, xuong?: string): Promise<YearPlanData | null> => {
  try {
    const q = new URLSearchParams({ from, to });
    if (xuong) q.set('xuong', xuong);
    const r = await fetch(`${API_BASE_URL}/khsx-nam/plan?${q.toString()}`);
    if (!r.ok) throw new Error('fetch failed');
    return await r.json();
  } catch (e) {
    console.error('fetchYearPlan error:', e);
    return null;
  }
};

// Kế hoạch năm (khsx_nam) & thực hiện nhập kho theo tháng × xưởng của 1 năm (TỶ ĐỒNG)
export interface YearPlanActualData {
  year: number;
  workshops: string[];
  plan: { thang: number; xuong: string; value: number }[];
  actual: { thang: number; xuong: string; value: number }[];
}
export const fetchYearPlanActual = async (year: number): Promise<YearPlanActualData | null> => {
  try {
    const r = await fetch(`${API_BASE_URL}/khsx-nam/plan-actual?year=${year}`);
    if (!r.ok) throw new Error('fetch failed');
    return await r.json();
  } catch (e) {
    console.error('fetchYearPlanActual error:', e);
    return null;
  }
};
