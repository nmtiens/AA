import Papa from 'papaparse';
import { DataRow, ColumnDefinition, COMMON_DATE_HEADERS } from '../types';

const API_BASE_URL = 'http://localhost:5000/api';

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
): Promise<{ data: DataRow[]; columns: ColumnDefinition[] } | null> => { // Cập nhật kiểu trả về thêm | null
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
      label: header,
      type: detectColumnType(header, rawData)
    }));

    return { data: rawData, columns };
  } catch (error) {
    console.error(`Error fetching API [${endpoint}]:`, error);
    // SỬA Ở ĐÂY: Trả về null thay vì mảng rỗng để báo hiệu fetch thất bại
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
  const csv = Papa.unparse(data);
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
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

export const fetchOverviewSummary = async (dateFromISO?: string, dateToISO?: string, datesISO?: string[]): Promise<OverviewSummary | null> => {
  try {
    const params = new URLSearchParams();
    if (dateFromISO) params.set('dateFrom', dateFromISO);
    if (dateToISO) params.set('dateTo', dateToISO);
    if (datesISO && datesISO.length > 0) params.set('dates', datesISO.join(','));
    const qs = params.toString();
    const url = qs ? `${API_BASE_URL}/overview/summary?${qs}` : `${API_BASE_URL}/overview/summary`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('fetch failed');
    return await r.json();
  } catch (e) {
    console.error('fetchOverviewSummary error:', e);
    return null;
  }
};

export const fetchOverviewByGroup = async (
  key: 'order' | 'tkbv' | 'pthsp' | 'inventory' | 'export',
  groupBy: 'xuong' | 'congtrinh',
  dateISO?: string
): Promise<GroupAnalysisRow[]> => {
  try {
    const url = `${API_BASE_URL}/overview/by-group?key=${key}&groupBy=${groupBy}${dateISO ? `&date=${dateISO}` : ''}`;
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