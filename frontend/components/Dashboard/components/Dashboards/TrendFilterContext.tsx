import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Granularity = 'day' | 'week' | 'month';
export interface FilterOption { code: string; name: string; }

interface TrendFilterState {
  granularity: Granularity;
  dateFrom: string;
  dateTo: string;
  setDateFrom: (d: string) => void;
  setDateTo: (d: string) => void;
  applyGranularity: (g: Granularity) => void;
  applyPreset: (days: number) => void;
  clearRange: () => void;

  xuong: string;
  setXuong: (v: string) => void;
  congTrinh: string;
  setCongTrinh: (v: string) => void;
  dvt: string;
  setDvt: (v: string) => void;
  phanLoai: string;
  setPhanLoai: (v: string) => void;
  clearExtraFilters: () => void;

  xuongList: FilterOption[];
  congTrinhList: FilterOption[];
  dvtList: FilterOption[];
  phanLoaiList: FilterOption[];
}

const TrendFilterContext = createContext<TrendFilterState | null>(null);

const toISODate = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return toISODate(d); };

export function TrendFilterProvider({ children }: { children: ReactNode }) {
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [xuong, setXuong] = useState('');
  const [congTrinh, setCongTrinh] = useState('');
  const [dvt, setDvt] = useState('');
  const [phanLoai, setPhanLoai] = useState('');

  const [xuongList, setXuongList] = useState<FilterOption[]>([]);
  const [congTrinhList, setCongTrinhList] = useState<FilterOption[]>([]);
  const [dvtList, setDvtList] = useState<FilterOption[]>([]);
  const [phanLoaiList, setPhanLoaiList] = useState<FilterOption[]>([]);

  // Tải toàn bộ danh sách filter DUY NHẤT 1 LẦN ở đây, không tải lặp lại ở từng biểu đồ nữa
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/filters/xuong').then(r => r.json()).catch(() => []),
      fetch('/api/filters/cong-trinh').then(r => r.json()).catch(() => []),
      fetch('/api/filters/dvt').then(r => r.json()).catch(() => []),
      fetch('/api/filters/phan-loai-nhom-san-pham').then(r => r.json()).catch(() => []),
    ]).then(([xuongData, ctData, dvtData, plData]) => {
      if (cancelled) return;
      setXuongList(xuongData);
      setCongTrinhList(ctData);
      setDvtList(dvtData);
      setPhanLoaiList(plData);
    });
    return () => { cancelled = true; };
  }, []);

  const applyGranularity = (g: Granularity) => {
    setGranularity(g);
    const rangeDays = g === 'day' ? 30 : g === 'week' ? 90 : 365;
    setDateFrom(daysAgo(rangeDays));
    setDateTo(toISODate(new Date()));
  };

  const applyPreset = (days: number) => {
    setDateFrom(daysAgo(days));
    setDateTo(toISODate(new Date()));
    if (days <= 30) setGranularity('day');
    else if (days <= 180) setGranularity('week');
    else setGranularity('month');
  };

  const clearRange = () => { setDateFrom(''); setDateTo(''); };
  const clearExtraFilters = () => { setXuong(''); setCongTrinh(''); setDvt(''); setPhanLoai(''); };

  return (
    <TrendFilterContext.Provider
      value={{
        granularity, dateFrom, dateTo, setDateFrom, setDateTo, applyGranularity, applyPreset, clearRange,
        xuong, setXuong, congTrinh, setCongTrinh, dvt, setDvt, phanLoai, setPhanLoai, clearExtraFilters,
        xuongList, congTrinhList, dvtList, phanLoaiList,
      }}
    >
      {children}
    </TrendFilterContext.Provider>
  );
}

export function useTrendFilter() {
  const ctx = useContext(TrendFilterContext);
  if (!ctx) throw new Error('useTrendFilter phải được dùng bên trong <TrendFilterProvider>');
  return ctx;
}