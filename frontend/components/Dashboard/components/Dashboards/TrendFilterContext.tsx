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

  // MỚI: preset (số ngày) đang được áp dụng, dùng để tô màu nút đúng —
  // không suy ra ngược từ dateFrom/dateTo vì ở chế độ controlled, dateFrom/dateTo
  // là min/max của các ngày THỰC SỰ có dữ liệu, có thể không trùng biên đã tính.
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

  // ✅ FIX: cờ + danh sách whitelist công trình của view hiện tại (đã chuẩn hóa
  // UPPER/TRIM), dùng để mọi chart con gửi kèm lên các endpoint /api/trend*,
  // /api/detail dưới dạng query "ctWhitelist" — GIỮ NGUYÊN Ý NGHĨA:
  // - hasCtWhitelist === false: không scope theo view (Dashboard tổng) -> các chart
  //   KHÔNG gửi tham số ctWhitelist -> server không lọc theo whitelist.
  // - hasCtWhitelist === true: có scope theo view -> các chart LUÔN gửi tham số
  //   ctWhitelist (kể cả khi ctWhitelistCsv === '', nghĩa là view chưa có công trình
  //   nào -> server phải trả về 0 dòng, không phải "không lọc").
  hasCtWhitelist: boolean;
  ctWhitelistCsv: string;
}

const TrendFilterContext = createContext<TrendFilterState | null>(null);

const toISODate = (d: Date) => toISODateLocal(d);
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return toISODate(d); };

// Hôm qua (today - 1) — dùng làm mốc "ngày kết thúc" mặc định vì dữ liệu hôm nay có thể chưa đầy đủ
const yesterday = () => daysAgo(1);

// Số ngày mặc định khi mở trang lần đầu ở chế độ "uncontrolled" (không có
// nguồn overviewDateFilters ngoài truyền vào — ví dụ trang ChartOverview)
const DEFAULT_RANGE_DAYS = 7;

// ✅ FIX: chuẩn hóa tên công trình để so khớp whitelist không phân biệt hoa/thường/khoảng trắng
const normalizeCT = (s: string) => s.trim().toUpperCase();

interface TrendFilterProviderProps {
  children: ReactNode;
  overviewDateFilters?: string[];
  setOverviewDateFilters?: (values: string[]) => void;
  unifiedDateOptions?: string[];

  // MỚI: giá trị hiện tại của "Bộ lọc tổng" (Tên Công Trình / Khu Vực Sản Xuất) ở Dashboard.
  // Chỉ lấy phần tử đầu tiên vì bộ lọc tổng cho multi-select, còn ở đây modal chỉ nhận 1 giá trị.
  defaultXuong?: string;
  defaultCongTrinh?: string;
  // MỚI: đổi giá trị này (vd: tăng dần) mỗi khi 1 modal được MỞ -> Provider sẽ
  // tự đồng bộ lại xuong/congTrinh về đúng defaultXuong/defaultCongTrinh tại thời điểm đó.
  resetKey?: number;

  // ✅ FIX: danh sách công trình đã setup cho view hiện tại (ConstructionRedFlow /
  // ConstructionSampleUnit truyền vào; Dashboard tổng KHÔNG truyền -> undefined).
  // undefined = không scope theo view (giữ nguyên hành vi cũ, không lọc gì thêm).
  // mảng (kể cả []) = có scope theo view -> mọi chart con + dropdown công trình đều
  // phải giới hạn theo đúng whitelist này.
  viewProjectWhitelist?: string[];
}

export function TrendFilterProvider({
  children,
  overviewDateFilters,
  setOverviewDateFilters,
  unifiedDateOptions = [],
  defaultXuong = '',     // MỚI
  defaultCongTrinh = '', // MỚI
  resetKey = 0,          // MỚI
  viewProjectWhitelist,  // ✅ FIX
}: TrendFilterProviderProps) {
  const isControlled = overviewDateFilters !== undefined && setOverviewDateFilters !== undefined;

  const [granularity, setGranularity] = useState<Granularity>('day');

  const [uncontrolledFrom, setUncontrolledFrom] = useState(daysAgo(DEFAULT_RANGE_DAYS));
  const [uncontrolledTo, setUncontrolledTo] = useState(yesterday());

  // MỚI: preset đang active — set khi bấm nút preset, xoá khi người dùng tự đổi ngày
  const [activePresetDays, setActivePresetDays] = useState<number | null>(null);

  // MỚI: khởi tạo lần đầu bằng giá trị mặc định (áp dụng cho lần mount đầu tiên)
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
  // ✅ FIX: đổi tên thành rawCongTrinhList — đây là danh sách TOÀN BỘ công trình của
  // hệ thống lấy từ /api/filters/cong-trinh, chưa lọc theo view. congTrinhList thực sự
  // trả ra context (bên dưới) sẽ là bản đã lọc theo viewProjectWhitelist.
  const [rawCongTrinhList, setRawCongTrinhList] = useState<FilterOption[]>([]);
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
      setRawCongTrinhList(ctData);
      setDvtList(dvtData);
      setPhanLoaiList(plData);
    });
    return () => { cancelled = true; };
  }, []);

  // ✅ FIX: danh sách công trình hiển thị trong dropdown — nếu có scope theo view thì
  // CHỈ giữ lại những công trình nằm trong viewProjectWhitelist, tránh người dùng chọn
  // nhầm 1 công trình ngoài view (điều này cũng là nguồn gốc gây lệch dữ liệu như đã
  // thấy: dropdown liệt kê toàn bộ công trình hệ thống dù đang ở view đã scope).
  const congTrinhList = useMemo(() => {
    if (viewProjectWhitelist === undefined) return rawCongTrinhList;
    const wl = new Set(viewProjectWhitelist.map(normalizeCT));
    return rawCongTrinhList.filter(o => wl.has(normalizeCT(o.name)) || wl.has(normalizeCT(o.code)));
  }, [rawCongTrinhList, viewProjectWhitelist]);

  // ✅ FIX: cờ + chuỗi whitelist (đã chuẩn hóa, join bằng dấu phẩy) để các chart con gửi
  // kèm lên mọi endpoint /api/trend*, /api/detail. Xem giải thích ở TrendFilterState.
  const hasCtWhitelist = viewProjectWhitelist !== undefined;
  const ctWhitelistCsv = useMemo(
    () => (viewProjectWhitelist ?? []).map(normalizeCT).join(','),
    [viewProjectWhitelist]
  );

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

  // MỚI: ngày CÓ DỮ LIỆU gần nhất trong unifiedDateOptions — dùng làm mốc "hôm nay ảo"
  // để tính các preset (7/30/90/365 ngày) khi ở chế độ controlled. Không dùng đồng hồ
  // hệ thống thật, vì dữ liệu thực tế (báo cáo) có thể "cũ" hơn ngày hiện tại rất nhiều,
  // khiến preset hẹp (vd: 7 ngày) không khớp được bất kỳ ngày báo cáo nào -> lọc ra rỗng.
  const latestAvailableDate = useMemo(() => {
    if (!unifiedDateOptions || unifiedDateOptions.length === 0) return null;
    const parsed = unifiedDateOptions.map(d => parseVNDate(d)).filter((d): d is Date => d !== null);
    if (parsed.length === 0) return null;
    return new Date(Math.max(...parsed.map(d => d.getTime())));
  }, [unifiedDateOptions]);

  // Mốc "ngày kết thúc" dùng để tính preset: ưu tiên ngày dữ liệu mới nhất (controlled),
  // fallback về "hôm qua" theo đồng hồ hệ thống nếu chưa có danh sách ngày (uncontrolled).
  const presetAnchorISO = (): string => {
    if (isControlled && latestAvailableDate) return toISODate(latestAvailableDate);
    return yesterday();
  };

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
    setActivePresetDays(null); // người dùng tự sửa ngày -> không còn khớp preset nào nữa
    if (!d && dateTo) { applyRange('', ''); return; }
    applyRange(d, dateTo);
  };

  const setDateTo = (d: string) => {
    setActivePresetDays(null); // người dùng tự sửa ngày -> không còn khớp preset nào nữa
    if (!d && dateFrom) { applyRange('', ''); return; }
    applyRange(dateFrom, d);
  };

  const applyGranularity = (g: Granularity) => {
    setGranularity(g);
    setActivePresetDays(null); // đổi granularity không phải là bấm preset ngày cụ thể
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
        hasCtWhitelist, ctWhitelistCsv, // ✅ FIX
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
