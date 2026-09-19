import { useEffect, useMemo, useRef, useState } from 'react';
import { DataRow } from '../../../types';
import {
  fetchOverviewSummary,
  fetchOverviewByGroup,
  type OverviewSummary,
  type GroupAnalysisRow,
} from '../../../services/dataService';
import {
  formatDateToVN,
  parseVNDate,
  toISODateLocal,
  computeMtdRows,
  getDateRangeDisplay,
  getYesterdayDateOption,
} from '../utils/dateHelpers';
import { AnalysisItem } from '../types';
import { DashboardFiltersState } from './useDashboardFilters';

type OverviewMetric = 'COUNT' | 'SUM';
type GroupAnalysisKey = 'order' | 'tkbv' | 'pthsp' | 'inventory' | 'export';

interface UseOverviewSummaryParams {
  orderData: DataRow[];
  tkbvData: DataRow[];
  pthspData: DataRow[];
  inventoryData: DataRow[];
  exportData: DataRow[];

  orderDateKey: string | undefined;
  tkbvDateKey: string | undefined;
  pthspDateKey: string | undefined;
  invDateKey: string | undefined;
  expDateKey: string | undefined;
  expCongTrinhKey: string | undefined;
  expXuongKey: string | undefined;
  filters: Pick<DashboardFiltersState, 'congTrinh' | 'xuong' | 'tinhTrang' | 'tinhTrangIpo'>;
  unifiedDateOptions: string[];
  // ✅ FIX: optional — chỉ các trang theo VIEW (ConstructionRedFlow, ConstructionSampleUnit)
  // mới truyền tham số này. Trang Dashboard tổng KHÔNG truyền -> không được coi là lỗi,
  // và KHÔNG được ép buộc, nếu không sẽ crash "Cannot read properties of undefined
  // (reading 'length')" ngay khi Dashboard tổng gọi hook này.
  viewProjectWhitelist?: string[];
}

/**
 * Gom toàn bộ state + effect của khối "BÁO CÁO TỔNG QUAN": bộ lọc ngày, fetch overview
 * summary (debounce + abort), dữ liệu lọc theo ngày / lũy kế tháng (MTD) cho 5 nguồn
 * (Order, TKBV, PTHSP, Inventory, Export), và cache phân tích theo nhóm (Xưởng/Công trình)
 * dùng cho các modal chi tiết.
 *
 * QUAN TRỌNG: mọi lời gọi API (fetchOverviewSummary / fetchOverviewByGroup) đều phải
 * lọc theo viewProjectWhitelist (danh sách công trình đã setup cho view đang xem ở
 * ConstructionSetup), KHÔNG được dùng thẳng filters.congTrinh (bộ lọc tổng trên UI) —
 * vì khi filters.congTrinh rỗng (chưa chọn gì), server sẽ trả về TOÀN BỘ công trình
 * trong hệ thống, không giới hạn theo view. Dùng getEffectiveCongTrinh() bên dưới ở
 * MỌI nơi cần truyền congTrinh cho fetch.
 *
 * ✅ FIX: viewProjectWhitelist là OPTIONAL. Nếu hook được gọi từ một nơi KHÔNG có khái
 * niệm "view" (ví dụ Dashboard tổng — không truyền tham số này), getEffectiveCongTrinh()
 * sẽ coi như "không giới hạn theo view" và trả nguyên filters.congTrinh — giữ đúng hành
 * vi cũ, không còn crash.
 */
export function useOverviewSummary({
  orderData,
  tkbvData,
  pthspData,
  inventoryData,
  exportData,
  orderDateKey,
  tkbvDateKey,
  pthspDateKey,
  invDateKey,
  expDateKey,
  expCongTrinhKey,
  expXuongKey,
  filters,
  unifiedDateOptions,
  viewProjectWhitelist, // ✅ FIX: có thể là undefined
}: UseOverviewSummaryParams) {

  const [overviewSummary, setOverviewSummary] = useState<OverviewSummary | null>(null);
  const [overviewDateFilters, setOverviewDateFilters] = useState<string[]>([]);
  const [overviewMetric, setOverviewMetric] = useState<OverviewMetric>('COUNT');
  const [showDateWarning, setShowDateWarning] = useState(false);
  const [groupAnalysisCache, setGroupAnalysisCache] = useState<Record<string, GroupAnalysisRow[]>>({});

  const overviewFetchIdRef = useRef(0);
  const hasInitializedOverviewDate = useRef(false);

  // ✅ FIX: hàm dùng chung — giao giữa bộ lọc tổng (filters.congTrinh) và danh sách
  // công trình đã setup cho view (viewProjectWhitelist).
  //
  // - viewProjectWhitelist === undefined  -> hook đang được dùng ở nơi KHÔNG scope theo
  //   view (Dashboard tổng) -> KHÔNG áp whitelist, trả nguyên filters.congTrinh y như cũ.
  // - viewProjectWhitelist là mảng (kể cả []) -> đang ở trang theo view -> áp whitelist:
  //   nếu user CHƯA chọn gì trên dropdown "Tên Công Trình" thì mặc định dùng ĐÚNG
  //   whitelist của view (không phải "tất cả"); nếu đã chọn thì giao với whitelist.
  const getEffectiveCongTrinh = (): string[] => {
    if (viewProjectWhitelist === undefined) {
      return filters.congTrinh;
    }
    if (filters.congTrinh.length > 0) {
      return filters.congTrinh.filter(ct => viewProjectWhitelist.includes(ct));
    }
    return viewProjectWhitelist;
  };

    const isScopedWithNoProjects = viewProjectWhitelist !== undefined
    && getEffectiveCongTrinh().length === 0;

  const buildZeroOverviewSummary = (dateStr: string): OverviewSummary => {
    const zeroGroup = {
      daily: { count: 0, value: 0 },
      mtd: { count: 0, value: 0 },
      lastMonth: { count: 0, value: 0 },
    };
    return {
      date: dateStr,
      order: { ...zeroGroup },
      tkbv: { ...zeroGroup },
      pthsp: { ...zeroGroup },
      inventory: { ...zeroGroup },
      export: { ...zeroGroup },
    } as OverviewSummary;
  };

  // Số ngày tối đa liệt kê trực tiếp trong nhãn trước khi rút gọn thành "và N ngày khác"
  const MAX_DATES_IN_LABEL = 6;

  const getContextLabel = () => {
    if (overviewDateFilters.length === 0) return "Thống kê toàn bộ thời gian";
    if (overviewDateFilters.length === 1) return `Thống kê số liệu trong ngày: ${overviewDateFilters[0]}`;
    if (overviewDateFilters.length <= MAX_DATES_IN_LABEL) {
      return `Thống kê số liệu các ngày: ${overviewDateFilters.join(', ')}`;
    }
    const sorted = [...overviewDateFilters].sort((a, b) => {
      const da = parseVNDate(a)?.getTime() ?? 0;
      const db = parseVNDate(b)?.getTime() ?? 0;
      return db - da;
    });
    const shown = sorted.slice(0, MAX_DATES_IN_LABEL).join(', ');
    const remaining = overviewDateFilters.length - MAX_DATES_IN_LABEL;
    return `Thống kê số liệu ${overviewDateFilters.length} ngày: ${shown} và ${remaining} ngày khác`;
  };

  const getContextLabelFull = () => {
    if (overviewDateFilters.length === 0) return "Thống kê toàn bộ thời gian";
    if (overviewDateFilters.length === 1) return `Thống kê số liệu trong ngày: ${overviewDateFilters[0]}`;
    return `Thống kê số liệu các ngày: ${overviewDateFilters.join(', ')}`;
  };

  const overviewDateRangeDisplay = useMemo(
    () => getDateRangeDisplay(overviewDateFilters, unifiedDateOptions),
    [overviewDateFilters, unifiedDateOptions]
  );

  useEffect(() => {
    if (!hasInitializedOverviewDate.current && unifiedDateOptions.length > 0) {
      const target = getYesterdayDateOption(unifiedDateOptions);
      if (target) setOverviewDateFilters([target]);
      hasInitializedOverviewDate.current = true;
    }
  }, [unifiedDateOptions]);

  useEffect(() => {
    if (showDateWarning) {
      const timer = setTimeout(() => setShowDateWarning(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [showDateWarning]);

  // Fetch overview summary — debounce 300ms + hủy request cũ khi filter đổi liên tục
  useEffect(() => {
    const requestId = ++overviewFetchIdRef.current;

    // ✅ FIX: đừng gọi fetchOverviewSummary với congTrinh=[] — server sẽ không nhận
    // được param congTrinh (vì appendFilterParams check .length trước khi set) và
    // hiểu nhầm thành "không lọc" -> trả về toàn bộ nhà máy.
    if (isScopedWithNoProjects) {
      const fallbackDate = overviewDateFilters[0] || toISODateLocal(new Date());
      setOverviewSummary(buildZeroOverviewSummary(fallbackDate));
      return;
    }

    const controller = new AbortController();
    const filterOpts = {
      signal: controller.signal,
      congTrinh: getEffectiveCongTrinh(), // ✅ dùng whitelist (nếu có) thay vì filters.congTrinh trần
      xuong: filters.xuong,
    };

    const timer = setTimeout(() => {
      if (overviewDateFilters.length === 0) {
        fetchOverviewSummary(undefined, undefined, undefined, filterOpts).then(data => {
          if (data && requestId === overviewFetchIdRef.current) setOverviewSummary(data);
        }).catch(err => { if (err.name !== 'AbortError') console.error('Lỗi fetch overview:', err); });
        return;
      }
      const parsedDates = overviewDateFilters.map(d => parseVNDate(d)).filter((d): d is Date => d !== null);
      if (parsedDates.length === 0) return;
      const minDate = new Date(Math.min(...parsedDates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...parsedDates.map(d => d.getTime())));
      const dateFromISO = toISODateLocal(minDate);
      const dateToISO = toISODateLocal(maxDate);
      const explicitDatesISO = Array.from(new Set(parsedDates.map(d => toISODateLocal(d))));

      fetchOverviewSummary(dateFromISO, dateToISO, explicitDatesISO, filterOpts).then(data => {
        if (data && requestId === overviewFetchIdRef.current) setOverviewSummary(data);
      }).catch(err => { if (err.name !== 'AbortError') console.error('Lỗi fetch overview:', err); });
    }, 300);

    return () => { clearTimeout(timer); controller.abort(); };
  // viewProjectWhitelist ảnh hưởng tới filterOpts nên vẫn cần trong dependency (an toàn
  // kể cả khi nó là undefined giữa các lần render).
  }, [overviewDateFilters, filters.congTrinh, filters.xuong, viewProjectWhitelist]);

  const latestUnifiedDate = useMemo<Date | null>(() => {
    if (overviewSummary?.date) return parseVNDate(overviewSummary.date) || new Date(overviewSummary.date);
    return null;
  }, [overviewSummary]);

  // --- Dữ liệu lọc theo overviewDateFilters ---
  // Các bảng này (orderData, tkbvData, ...) là dữ liệu ĐÃ được filterByView() lọc từ
  // component cha (ConstructionRedFlow/ConstructionSampleUnit) trước khi truyền vào hook,
  // nên các useMemo dưới đây không cần áp lại whitelist. Với Dashboard tổng (không scope
  // theo view), dữ liệu truyền vào vốn không bị filterByView() nên cũng không cần áp gì thêm.
  const filteredOrderData = useMemo(() => {
    if (overviewDateFilters.length === 0) return orderData;
    return orderData.filter(row => {
      if (!orderDateKey || !row[orderDateKey]) return false;
      const formattedRowDate = formatDateToVN(row[orderDateKey]);
      return overviewDateFilters.includes(formattedRowDate);
    });
  }, [orderData, overviewDateFilters, orderDateKey]);

  const filteredTkbvData = useMemo(() => {
    if (overviewDateFilters.length === 0) return tkbvData;
    return tkbvData.filter(row => {
      if (!tkbvDateKey || !row[tkbvDateKey]) return false;
      const formattedRowDate = formatDateToVN(row[tkbvDateKey]);
      return overviewDateFilters.includes(formattedRowDate);
    });
  }, [tkbvData, overviewDateFilters, tkbvDateKey]);

  const filteredPthspData = useMemo(() => {
    if (overviewDateFilters.length === 0) return pthspData;
    return pthspData.filter(row => {
      if (!pthspDateKey || !row[pthspDateKey]) return false;
      const formattedRowDate = formatDateToVN(row[pthspDateKey]);
      return overviewDateFilters.includes(formattedRowDate);
    });
  }, [pthspData, overviewDateFilters, pthspDateKey]);

  const filteredInventoryOverviewData = useMemo(() => {
    if (overviewDateFilters.length === 0) return inventoryData;
    return inventoryData.filter(row => {
      if (!invDateKey || !row[invDateKey]) return false;
      const formattedRowDate = formatDateToVN(row[invDateKey]);
      return overviewDateFilters.includes(formattedRowDate);
    });
  }, [inventoryData, overviewDateFilters, invDateKey]);

  const filteredExportOverviewData = useMemo(() => {
    const effectiveCongTrinh = getEffectiveCongTrinh();

    // ✅ FIX: rỗng chỉ = "khớp tất cả" khi KHÔNG có scope. Có scope mà rỗng = khớp 0.
    if (viewProjectWhitelist !== undefined && effectiveCongTrinh.length === 0) {
      return [];
    }

    return exportData.filter(row => {
      const dateMatch = overviewDateFilters.length === 0 || (expDateKey && overviewDateFilters.includes(formatDateToVN(row[expDateKey])));
      const congTrinhMatch = effectiveCongTrinh.length === 0 || (expCongTrinhKey && effectiveCongTrinh.includes(String(row[expCongTrinhKey!] || '').trim()));
      const xuongMatch = filters.xuong.length === 0 || (expXuongKey && filters.xuong.includes(String(row[expXuongKey!] || '').trim()));
      return dateMatch && congTrinhMatch && xuongMatch;
    });
  }, [exportData, overviewDateFilters, filters.congTrinh, filters.xuong, expDateKey, expCongTrinhKey, expXuongKey, viewProjectWhitelist]);

  // --- Dữ liệu lũy kế tháng (MTD) tính theo latestUnifiedDate ---
  const mtdOrderData = useMemo(() => {
    if (!latestUnifiedDate || !orderDateKey) return orderData;
    const target = latestUnifiedDate as Date;
    const tMonth = target.getMonth();
    const tYear = target.getFullYear();
    return orderData.filter(row => {
      const d = parseVNDate(String(row[orderDateKey] || ''));
      return d && d.getMonth() === tMonth && d.getFullYear() === tYear && d.getTime() <= target.getTime();
    });
  }, [orderData, latestUnifiedDate, orderDateKey]);

  const mtdTkbvData = useMemo(() => computeMtdRows(tkbvData, tkbvDateKey, latestUnifiedDate), [tkbvData, tkbvDateKey, latestUnifiedDate]);
  const mtdPthspData = useMemo(() => computeMtdRows(pthspData, pthspDateKey, latestUnifiedDate), [pthspData, pthspDateKey, latestUnifiedDate]);
  const mtdInventoryData = useMemo(() => computeMtdRows(inventoryData, invDateKey, latestUnifiedDate), [inventoryData, invDateKey, latestUnifiedDate]);
  const mtdExportKhoData = useMemo(() => computeMtdRows(exportData, expDateKey, latestUnifiedDate), [exportData, expDateKey, latestUnifiedDate]);

  // --- Cache phân tích theo nhóm (Xưởng / Công trình) cho từng nguồn, dùng trong modal chi tiết ---
  const loadGroupAnalysis = async (key: GroupAnalysisKey) => {
    const effectiveCongTrinh = getEffectiveCongTrinh(); // ✅ FIX: không còn thể là undefined

    // filterSuffix PHẢI dựa trên effectiveCongTrinh (đã giao với whitelist nếu có),
    // không phải filters.congTrinh thô — nếu không cache key sẽ không phản ánh đúng
    // dữ liệu thực sự được fetch, và OrderOverviewSection.tsx (nơi tính lại filterKey
    // để ĐỌC cache) phải dùng ĐÚNG công thức này để không bị lệch key.
    const filterSuffix = `_ct-${[...effectiveCongTrinh].sort().join('|')}` +
      `_x-${[...filters.xuong].sort().join('|')}`;
    const filterKey = (overviewDateFilters.length > 0
      ? [...overviewDateFilters].sort().join('_')
      : `all-${overviewSummary?.date ?? ''}`) + filterSuffix;
     const kW = `${key}-xuong-${filterKey}`;
    const kP = `${key}-congtrinh-${filterKey}`;
    if (groupAnalysisCache[kW] && groupAnalysisCache[kP]) return;

    // ✅ FIX: cùng lý do — scope rỗng thì không gọi API, set thẳng cache = [].
    if (viewProjectWhitelist !== undefined && effectiveCongTrinh.length === 0) {
      setGroupAnalysisCache(prev => ({ ...prev, [kW]: [], [kP]: [] }));
      return;
    }

    let datesISO: string[] | undefined;
    let dateToISO: string | undefined;
    if (overviewDateFilters.length > 0) {
      datesISO = overviewDateFilters.map(d => parseVNDate(d)).filter((d): d is Date => d !== null).map(d => toISODateLocal(d));
    } else if (overviewSummary?.date) {
      dateToISO = overviewSummary.date;
    }

    const filterOpts = { congTrinh: effectiveCongTrinh, xuong: filters.xuong };
    const [byXuong, byCongTrinh] = await Promise.all([
      fetchOverviewByGroup(key, 'xuong', { datesISO, dateToISO, ...filterOpts }),
      fetchOverviewByGroup(key, 'congtrinh', { datesISO, dateToISO, ...filterOpts }),
    ]);
    setGroupAnalysisCache(prev => ({ ...prev, [kW]: byXuong, [kP]: byCongTrinh }));
  };

  const toAnalysisItems = (
    rows: GroupAnalysisRow[],
    metric: OverviewMetric = overviewMetric
  ): AnalysisItem[] =>
    rows.map(r => ({
      name: r.name,
      daily: metric === 'COUNT' ? r.dailyCount : r.dailyValue,
      mtd: metric === 'COUNT' ? r.mtdCount : r.mtdValue,
    }));

  return {
    overviewSummary,
    overviewDateFilters,
    setOverviewDateFilters,
    overviewMetric,
    setOverviewMetric,
    showDateWarning,
    setShowDateWarning,

    getContextLabel,
    getContextLabelFull,
    overviewDateRangeDisplay,
    latestUnifiedDate,

    filteredOrderData,
    filteredTkbvData,
    filteredPthspData,
    filteredInventoryOverviewData,
    filteredExportOverviewData,

    mtdOrderData,
    mtdTkbvData,
    mtdPthspData,
    mtdInventoryData,
    mtdExportKhoData,

    groupAnalysisCache,
    loadGroupAnalysis,
    toAnalysisItems,
  };
}

export type UseOverviewSummaryResult = ReturnType<typeof useOverviewSummary>;