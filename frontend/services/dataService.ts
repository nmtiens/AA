import Papa from 'papaparse';
import { DataRow, ColumnDefinition, COMMON_DATE_HEADERS } from '../types';

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
};

const resolveColumnLabel = (header: string): string => {
  const normalized = header.trim();
  if (COLUMN_LABEL_MAP[normalized]) return COLUMN_LABEL_MAP[normalized];
  // Nếu header đã có sẵn khoảng trắng/hoa (không phải snake_case kỹ thuật), giữ nguyên
  if (/[A-ZÀ-Ỹ ]/.test(normalized) && !normalized.includes('_')) return normalized;
  // Fallback: chuyển snake_case -> "TỪ VIẾT HOA CÁCH NHAU"
  return normalized.toUpperCase().replace(/_/g, ' ');
};

const API_BASE_URL = '/api';

// KHỞI TẠO INDEXED-DB TỐI ƯU
const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('OpsHub_Database_V6', 1);
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
  } catch (err) {
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
  } catch (err) {
    return '0';
  }
};

// LƯU DỮ LIỆU VÀO CACHE
export const saveToCache = async (endpoint: string, version: string, result: any): Promise<void> => {
  try {
    const db = await initDB();
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
  const csv = Papa.unparse(data, { delimiter: ';' }); // dùng ; thay vì ,
  const content = '\uFEFF' + csv; // chỉ cần BOM, bỏ sep=,
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

// TẢI TOÀN BỘ 12 BẢNG TRONG 1 REQUEST DUY NHẤT — thay cho việc gọi 12 endpoint riêng lẻ
export const fetchAllDataFromServer = async (): Promise<Record<string, { data: DataRow[]; columns: ColumnDefinition[] }> | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/all-data`);
    if (!response.ok) throw new Error(`Failed to fetch all-data: ${response.statusText}`);
    const raw = await response.json();

    const result: Record<string, { data: DataRow[]; columns: ColumnDefinition[] }> = {};
    Object.entries(ALL_DATA_ENDPOINT_MAP).forEach(([key, endpoint]) => {
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

// ==================== CÁC HÀM GỌI API TÍNH TOÁN Ở BACKEND ====================

export interface OverviewSummaryEntry {
  daily: { count: number; value: number };
  mtd: { count: number; value: number };
  lastMonth: { count: number; value: number }; // THÊM DÒNG NÀY
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

export interface StockDateEntry { date: string; count: number; value: number; }
export interface StockByProjectRow { name: string; count: number; value: number; }

export interface Revenue2026Data {
  targetRevenue2026: number;
  quarterlyTargets: { q1: number; q2: number; q3: number; q4: number };
  actual: { value: number; percent: number };
  byWorkshop: { name: string; plan: number; actual: number }[];
}

export const fetchOverviewSummary = async (
  dateFromISO?: string,
  dateToISO?: string,
  datesISO?: string[],
  opts?: { signal?: AbortSignal }   // <-- MỚI
): Promise<OverviewSummary | null> => {
  try {
    const params = new URLSearchParams();
    if (dateFromISO) params.set('dateFrom', dateFromISO);
    if (dateToISO) params.set('dateTo', dateToISO);
    if (datesISO && datesISO.length > 0) params.set('dates', datesISO.join(','));
    const qs = params.toString();
    const url = qs ? `${API_BASE_URL}/overview/summary?${qs}` : `${API_BASE_URL}/overview/summary`;
    const r = await fetch(url, { signal: opts?.signal });   // <-- MỚI: truyền signal
    if (!r.ok) throw new Error('fetch failed');
    return await r.json();
  } catch (e: any) {
    if (e.name === 'AbortError') return null;   // <-- MỚI: request bị hủy chủ động, không phải lỗi thật
    console.error('fetchOverviewSummary error:', e);
    return null;
  }
};

export const fetchOverviewByGroup = async (
  key: 'order' | 'tkbv' | 'pthsp' | 'inventory' | 'export',
  groupBy: 'xuong' | 'congtrinh',
  dateParams: { datesISO?: string[]; dateFromISO?: string; dateToISO?: string }
): Promise<GroupAnalysisRow[]> => {
  try {
    const q = new URLSearchParams({ key, groupBy });
    if (dateParams.datesISO && dateParams.datesISO.length > 0) {
      q.set('dates', dateParams.datesISO.join(','));
    } else {
      if (dateParams.dateFromISO) q.set('dateFrom', dateParams.dateFromISO);
      if (dateParams.dateToISO) q.set('dateTo', dateParams.dateToISO);
    }
    const url = `${API_BASE_URL}/overview/by-group?${q.toString()}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('fetch failed');
    return await r.json();
  } catch (e) {
    console.error('fetchOverviewByGroup error:', e);
    return [];
  }
};

export const fetchStockDates = async (): Promise<StockDateEntry[]> => {
  try {
    const r = await fetch(`${API_BASE_URL}/stock/dates`);
    if (!r.ok) throw new Error('fetch failed');
    return await r.json();
  } catch (e) {
    console.error('fetchStockDates error:', e);
    return [];
  }
};

export const fetchStockByProject = async (dateISO: string): Promise<StockByProjectRow[]> => {
  try {
    const r = await fetch(`${API_BASE_URL}/stock/by-project?date=${dateISO}`);
    if (!r.ok) throw new Error('fetch failed');
    return await r.json();
  } catch (e) {
    console.error('fetchStockByProject error:', e);
    return [];
  }
};

export const fetchRevenue2026 = async (): Promise<Revenue2026Data | null> => {
  try {
    const r = await fetch(`${API_BASE_URL}/revenue/2026`);
    if (!r.ok) throw new Error('fetch failed');
    return await r.json();
  } catch (e) {
    console.error('fetchRevenue2026 error:', e);
    return null;
  }
};

export interface KhsxNhapKhoSummary {
  totalKh: number;
  totalTh: number;
  completionRate: number;
  byXuong: { xuong: string; kh: number; th: number }[];
  byCongTrinh: { name: string; code: string; kh: number; th: number }[];
}

export async function fetchKhsxNhapKhoSummary(params: {
  nam: string; thang?: string; mode?: 'month' | 'week'; tuan?: string; ngay?: string;
  congTrinh?: string[]; xuong?: string[];
  signal?: AbortSignal;   // <-- MỚI
}): Promise<KhsxNhapKhoSummary | null> {
  const q = new URLSearchParams({ nam: params.nam, mode: params.mode ?? 'month' });
  if (params.thang) q.set('thang', params.thang);
  if (params.tuan) q.set('tuan', params.tuan);
  if (params.ngay) q.set('ngay', params.ngay);
  if (params.congTrinh?.length) q.set('congTrinh', params.congTrinh.join(','));
  if (params.xuong?.length) q.set('xuong', params.xuong.join(','));
 
  try {
    const res = await fetch(`${API_BASE_URL}/khsx-nhapkho/summary?${q.toString()}`, {
      signal: params.signal,   // <-- MỚI: truyền signal
    });
    if (!res.ok) return null;
    return res.json();
  } catch (e: any) {
    if (e.name === 'AbortError') return null;   // <-- MỚI
    console.error('fetchKhsxNhapKhoSummary error:', e);
    return null;
  }
}