import { createContext, useContext, useMemo, useState, useEffect, ReactNode } from 'react';
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

const toISODate = (d: Date) => toISODateLocal(d);
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return toISODate(d); };

// Hôm qua (today - 1) — dùng làm mốc "ngày kết thúc" mặc định vì dữ liệu hôm nay có thể chưa đầy đủ
const yesterday = () => daysAgo(1);

// Số ngày mặc định khi mở trang lần đầu ở chế độ "uncontrolled" (không có
// nguồn overviewDateFilters ngoài truyền vào — ví dụ trang ChartOverview)
const DEFAULT_RANGE_DAYS = 7;

interface TrendFilterProviderProps {
  children: ReactNode;
  /**
   * (Tùy chọn) Nguồn ngày dùng CHUNG với dropdown "NGÀY BÁO CÁO" + card xuất
   * CSV ở Dashboard/OrderOverviewSection.
   *
   * - TRUYỀN ĐỦ 3 PROP (chế độ "controlled", dùng ở OrderOverviewSection):
   *   dateFrom/dateTo không tự giữ state riêng nữa mà chỉ là min/max ĐƯỢC
   *   TÍNH từ overviewDateFilters. Mọi thao tác đổi range ở "Bộ lọc chung"
   *   (gõ tay, bấm preset, đổi granularity, xóa lọc) đều ghi NGƯỢC lại vào
   *   overviewDateFilters qua setOverviewDateFilters — nhờ vậy "Bộ lọc
   *   chung", "NGÀY BÁO CÁO" và nút "Xuất CSV" luôn đồng bộ 2 chiều.
   *
   * - KHÔNG TRUYỀN (chế độ "uncontrolled", dùng ở ChartOverview — trang biểu
   *   đồ độc lập, không có "NGÀY BÁO CÁO"/xuất CSV đi kèm): component tự
   *   quản lý dateFrom/dateTo bằng state riêng, giữ nguyên hành vi gốc trước
   *   đây (mặc định 7 ngày gần nhất). Không cần sửa gì ở nơi gọi.
   */
  overviewDateFilters?: string[];
  setOverviewDateFilters?: (values: string[]) => void;
  unifiedDateOptions?: string[];
}

export function TrendFilterProvider({
  children,
  overviewDateFilters,
  setOverviewDateFilters,
  unifiedDateOptions = [],
}: TrendFilterProviderProps) {
  const isControlled = overviewDateFilters !== undefined && setOverviewDateFilters !== undefined;

  const [granularity, setGranularity] = useState<Granularity>('day');

  // --- State riêng, CHỈ dùng ở chế độ uncontrolled (giữ nguyên hành vi gốc) ---
  const [uncontrolledFrom, setUncontrolledFrom] = useState(daysAgo(DEFAULT_RANGE_DAYS));
  const [uncontrolledTo, setUncontrolledTo] = useState(yesterday());

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

  // dateFrom/dateTo (ISO yyyy-mm-dd) khi controlled = min/max của
  // overviewDateFilters (dd/mm/yyyy). Rỗng nếu chưa chọn ngày nào.
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

  // Ghi 1 khoảng [fromISO, toISO] xuống đúng nơi tùy theo chế độ đang chạy.
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

  /**
   * QUAN TRỌNG: Không cho phép trạng thái "chỉ có 1 trong 2 mốc ngày".
   * Nếu người dùng xóa tay 1 ô (dateFrom hoặc dateTo) trong khi ô còn lại
   * vẫn có giá trị, coi như xóa cả khoảng.
   */
  const setDateFrom = (d: string) => {
    if (!d && dateTo) { applyRange('', ''); return; }
    applyRange(d, dateTo);
  };

  const setDateTo = (d: string) => {
    if (!d && dateFrom) { applyRange('', ''); return; }
    applyRange(dateFrom, d);
  };

  const applyGranularity = (g: Granularity) => {
    setGranularity(g);
    const rangeDays = g === 'day' ? 30 : g === 'week' ? 90 : 365;
    applyRange(daysAgo(rangeDays), yesterday());
  };

  const applyPreset = (days: number) => {
    applyRange(daysAgo(days), yesterday());
    if (days <= 30) setGranularity('day');
    else if (days <= 180) setGranularity('week');
    else setGranularity('month');
  };

  const clearRange = () => applyRange('', '');
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
