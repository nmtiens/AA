import { createContext, useContext, useMemo, useState, useEffect, useRef, ReactNode } from 'react';
import { parseVNDate, toISODateLocal } from '../../utils/dateHelpers';

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

  activePresetDays: number | null;

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

  hasCtWhitelist: boolean;
  ctWhitelistCsv: string;

  // MỚI [DATES FIX]: danh sách CHÍNH XÁC các ngày (yyyy-mm-dd) đang được chọn ở
  // "Bộ lọc ngày chung" bên ngoài modal (overviewDateFilters), khi ở chế độ controlled.
  // '' nếu: không ở chế độ controlled, hoặc chưa chọn ngày nào (nghĩa là "toàn bộ
  // thời gian" — không phải là danh sách ngày rời rạc, nên không gửi tham số 'dates').
  // Mọi chart con (TrendChart, ByXuongChart, ByCongTrinhChart, TrendByDvtChart,
  // TrendByPhanLoaiChart) và mọi lời gọi /api/detail PHẢI gửi kèm tham số này
  // (khi khác rỗng) để tôn trọng ĐÚNG các ngày đã chọn, thay vì suy diễn thành
  // khoảng liên tục [min, max] như dateFrom/dateTo vẫn làm.
  selectedDatesCsv: string;
}

const TrendFilterContext = createContext<TrendFilterState | null>(null);

const toISODate = (d: Date) => toISODateLocal(d);
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return toISODate(d); };

const yesterday = () => daysAgo(1);

const DEFAULT_RANGE_DAYS = 7;

const normalizeCT = (s: string) => s.trim().toUpperCase();

interface TrendFilterProviderProps {
  children: ReactNode;
  overviewDateFilters?: string[];
  setOverviewDateFilters?: (values: string[]) => void;
  unifiedDateOptions?: string[];

  defaultXuong?: string;
  defaultCongTrinh?: string;
  resetKey?: number;

  viewProjectWhitelist?: string[];
}

export function TrendFilterProvider({
  children,
  overviewDateFilters,
  setOverviewDateFilters,
  unifiedDateOptions = [],
  defaultXuong = '',
  defaultCongTrinh = '',
  resetKey = 0,
  viewProjectWhitelist,
}: TrendFilterProviderProps) {
  const isControlled = overviewDateFilters !== undefined && setOverviewDateFilters !== undefined;

  const [granularity, setGranularity] = useState<Granularity>('day');

  const [uncontrolledFrom, setUncontrolledFrom] = useState(daysAgo(DEFAULT_RANGE_DAYS));
  const [uncontrolledTo, setUncontrolledTo] = useState(yesterday());

  const [activePresetDays, setActivePresetDays] = useState<number | null>(null);

  const [xuong, setXuong] = useState(defaultXuong);
  const [congTrinh, setCongTrinh] = useState(defaultCongTrinh);
  const [dvt, setDvt] = useState('');
  const [phanLoai, setPhanLoai] = useState('');

  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) { isFirstRun.current = false; return; }
    setXuong(defaultXuong);
    setCongTrinh(defaultCongTrinh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const [xuongList, setXuongList] = useState<FilterOption[]>([]);
  const [rawCongTrinhList, setRawCongTrinhList] = useState<FilterOption[]>([]);
  const [dvtList, setDvtList] = useState<FilterOption[]>([]);
  const [phanLoaiList, setPhanLoaiList] = useState<FilterOption[]>([]);

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
      setRawCongTrinhList(ctData);
      setDvtList(dvtData);
      setPhanLoaiList(plData);
    });
    return () => { cancelled = true; };
  }, []);

  const congTrinhList = useMemo(() => {
    if (viewProjectWhitelist === undefined) return rawCongTrinhList;
    const wl = new Set(viewProjectWhitelist.map(normalizeCT));
    return rawCongTrinhList.filter(o => wl.has(normalizeCT(o.name)) || wl.has(normalizeCT(o.code)));
  }, [rawCongTrinhList, viewProjectWhitelist]);

  const hasCtWhitelist = viewProjectWhitelist !== undefined;
  const ctWhitelistCsv = useMemo(
    () => (viewProjectWhitelist ?? []).map(normalizeCT).join(','),
    [viewProjectWhitelist]
  );

  const controlledRange = useMemo(() => {
    if (!isControlled || !overviewDateFilters || overviewDateFilters.length === 0) {
      return { dateFrom: '', dateTo: '' };
    }
    const parsed = overviewDateFilters
      .map(d => parseVNDate(d))
      .filter((d): d is Date => d !== null);
    if (parsed.length === 0) return { dateFrom: '', dateTo: '' };
    const min = new Date(Math.min(...parsed.map(d => d.getTime())));
    const max = new Date(Math.max(...parsed.map(d => d.getTime())));
    return { dateFrom: toISODate(min), dateTo: toISODate(max) };
  }, [isControlled, overviewDateFilters]);

  const dateFrom = isControlled ? controlledRange.dateFrom : uncontrolledFrom;
  const dateTo = isControlled ? controlledRange.dateTo : uncontrolledTo;

  // MỚI [DATES FIX]: danh sách ngày CHÍNH XÁC (yyyy-mm-dd, đã dedupe + sort) khi
  // controlled và người dùng đã chọn ít nhất 1 ngày. Đây khác controlledRange ở chỗ:
  // controlledRange chỉ giữ lại MIN/MAX (mất thông tin "ngày nào ở giữa KHÔNG được
  // chọn"), còn selectedDatesCsv giữ NGUYÊN VẸN tập ngày người dùng đã tick.
  const selectedDatesCsv = useMemo(() => {
    if (!isControlled || !overviewDateFilters || overviewDateFilters.length === 0) return '';
    const parsed = overviewDateFilters
      .map(d => parseVNDate(d))
      .filter((d): d is Date => d !== null);
    if (parsed.length === 0) return '';
    return Array.from(new Set(parsed.map(toISODate))).sort().join(',');
  }, [isControlled, overviewDateFilters]);

  const latestAvailableDate = useMemo(() => {
    if (!unifiedDateOptions || unifiedDateOptions.length === 0) return null;
    const parsed = unifiedDateOptions.map(d => parseVNDate(d)).filter((d): d is Date => d !== null);
    if (parsed.length === 0) return null;
    return new Date(Math.max(...parsed.map(d => d.getTime())));
  }, [unifiedDateOptions]);

  const presetAnchorISO = (): string => {
    if (isControlled && latestAvailableDate) return toISODate(latestAvailableDate);
    return yesterday();
  };

  const applyRange = (fromISO: string, toISO: string) => {
    if (isControlled) {
      if (!fromISO || !toISO) { setOverviewDateFilters!([]); return; }
      const fromD = new Date(fromISO); fromD.setHours(0, 0, 0, 0);
      const toD = new Date(toISO); toD.setHours(0, 0, 0, 0);
      const matched = unifiedDateOptions.filter(opt => {
        const d = parseVNDate(opt);
        return d && d.getTime() >= fromD.getTime() && d.getTime() <= toD.getTime();
      });
      setOverviewDateFilters!(matched);
    } else {
      setUncontrolledFrom(fromISO);
      setUncontrolledTo(toISO);
    }
  };

  const setDateFrom = (d: string) => {
    setActivePresetDays(null);
    if (!d && dateTo) { applyRange('', ''); return; }
    applyRange(d, dateTo);
  };

  const setDateTo = (d: string) => {
    setActivePresetDays(null);
    if (!d && dateFrom) { applyRange('', ''); return; }
    applyRange(dateFrom, d);
  };

  const applyGranularity = (g: Granularity) => {
    setGranularity(g);
    setActivePresetDays(null);
    const rangeDays = g === 'day' ? 30 : g === 'week' ? 90 : 365;
    const anchorISO = presetAnchorISO();
    const anchor = new Date(anchorISO);
    const from = new Date(anchor);
    from.setDate(from.getDate() - (rangeDays - 1));
    applyRange(toISODate(from), anchorISO);
  };

  const applyPreset = (days: number) => {
    const anchorISO = presetAnchorISO();
    const anchor = new Date(anchorISO);
    const from = new Date(anchor);
    from.setDate(from.getDate() - (days - 1));
    applyRange(toISODate(from), anchorISO);

    setActivePresetDays(days);

    if (days <= 30) setGranularity('day');
    else if (days <= 180) setGranularity('week');
    else setGranularity('month');
  };

  const clearRange = () => {
    setActivePresetDays(null);
    const anchorISO = presetAnchorISO();
    applyRange(anchorISO, anchorISO);
  };

  const clearExtraFilters = () => { setXuong(''); setCongTrinh(''); setDvt(''); setPhanLoai(''); };

  return (
    <TrendFilterContext.Provider
      value={{
        granularity, dateFrom, dateTo, setDateFrom, setDateTo, applyGranularity, applyPreset, clearRange,
        activePresetDays,
        xuong, setXuong, congTrinh, setCongTrinh, dvt, setDvt, phanLoai, setPhanLoai, clearExtraFilters,
        xuongList, congTrinhList, dvtList, phanLoaiList,
        hasCtWhitelist, ctWhitelistCsv,
        selectedDatesCsv, // ✅ MỚI
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