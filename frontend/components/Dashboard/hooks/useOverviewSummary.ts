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

  filters: Pick<DashboardFiltersState, 'congTrinh' | 'xuong'>;
  unifiedDateOptions: string[];


}

/**
 * Gom toàn bộ state + effect của khối "BÁO CÁO TỔNG QUAN": bộ lọc ngày, fetch overview
 * summary (debounce + abort), dữ liệu lọc theo ngày / lũy kế tháng (MTD) cho 5 nguồn
 * (Order, TKBV, PTHSP, Inventory, Export), và cache phân tích theo nhóm (Xưởng/Công trình)
 * dùng cho các modal chi tiết.
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
}: UseOverviewSummaryParams) {

  const [overviewSummary, setOverviewSummary] = useState<OverviewSummary | null>(null);
  const [overviewDateFilters, setOverviewDateFilters] = useState<string[]>([]);
  const [overviewMetric, setOverviewMetric] = useState<OverviewMetric>('COUNT');
  const [showDateWarning, setShowDateWarning] = useState(false);
  const [groupAnalysisCache, setGroupAnalysisCache] = useState<Record<string, GroupAnalysisRow[]>>({});

  const overviewFetchIdRef = useRef(0);
  const hasInitializedOverviewDate = useRef(false);

  // Số ngày tối đa liệt kê trực tiếp trong nhãn trước khi rút gọn thành "và N ngày khác"
  const MAX_DATES_IN_LABEL = 6;

  const getContextLabel = () => {
    if (overviewDateFilters.length === 0) return "Thống kê toàn bộ thời gian";
    if (overviewDateFilters.length === 1) return `Thống kê số liệu trong ngày: ${overviewDateFilters[0]}`;
    if (overviewDateFilters.length <= MAX_DATES_IN_LABEL) {
      return `Thống kê số liệu các ngày: ${overviewDateFilters.join(', ')}`;
    }
    // Sắp xếp giảm dần theo thời gian thực tế (không dựa vào thứ tự chọn) rồi chỉ hiện N ngày gần nhất
    const sorted = [...overviewDateFilters].sort((a, b) => {
      const da = parseVNDate(a)?.getTime() ?? 0;
      const db = parseVNDate(b)?.getTime() ?? 0;
      return db - da;
    });
    const shown = sorted.slice(0, MAX_DATES_IN_LABEL).join(', ');
    const remaining = overviewDateFilters.length - MAX_DATES_IN_LABEL;
    return `Thống kê số liệu ${overviewDateFilters.length} ngày: ${shown} và ${remaining} ngày khác`;
  };

  // Nhãn đầy đủ (không rút gọn) — dùng cho tooltip/title khi cần xem hết danh sách ngày
  const getContextLabelFull = () => {
    if (overviewDateFilters.length === 0) return "Thống kê toàn bộ thời gian";
    if (overviewDateFilters.length === 1) return `Thống kê số liệu trong ngày: ${overviewDateFilters[0]}`;
    return `Thống kê số liệu các ngày: ${overviewDateFilters.join(', ')}`;
  };

  const overviewDateRangeDisplay = useMemo(
    () => getDateRangeDisplay(overviewDateFilters, unifiedDateOptions),
    [overviewDateFilters, unifiedDateOptions]
  );

  // Khởi tạo mặc định overviewDateFilters = ngày hôm qua (chỉ 1 lần, khi unifiedDateOptions đã có dữ liệu)
  useEffect(() => {
    if (!hasInitializedOverviewDate.current && unifiedDateOptions.length > 0) {
      const target = getYesterdayDateOption(unifiedDateOptions);
      if (target) setOverviewDateFilters([target]);
      hasInitializedOverviewDate.current = true;
    }
  }, [unifiedDateOptions]);

  // Tự động ẩn cảnh báo "chưa chọn ngày" sau 2.5s
  useEffect(() => {
    if (showDateWarning) {
      const timer = setTimeout(() => setShowDateWarning(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [showDateWarning]);

  // Fetch overview summary — debounce 300ms + hủy request cũ khi filter đổi liên tục
  useEffect(() => {
    const requestId = ++overviewFetchIdRef.current;
    const controller = new AbortController();

    const timer = setTimeout(() => {
      if (overviewDateFilters.length === 0) {
        fetchOverviewSummary(undefined, undefined, undefined, { signal: controller.signal }).then(data => {
          if (data && requestId === overviewFetchIdRef.current) {
            setOverviewSummary(data);
          }
        }).catch(err => {
          if (err.name !== 'AbortError') console.error('Lỗi fetch overview:', err);
        });
        return;
      }

      const parsedDates = overviewDateFilters
        .map(d => parseVNDate(d))
        .filter((d): d is Date => d !== null);

      if (parsedDates.length === 0) return;

      const minDate = new Date(Math.min(...parsedDates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...parsedDates.map(d => d.getTime())));
      const dateFromISO = toISODateLocal(minDate);
      const dateToISO = toISODateLocal(maxDate);
      const explicitDatesISO = Array.from(new Set(parsedDates.map(d => toISODateLocal(d))));

      fetchOverviewSummary(dateFromISO, dateToISO, explicitDatesISO, { signal: controller.signal }).then(data => {
        if (data && requestId === overviewFetchIdRef.current) {
          setOverviewSummary(data);
        }
      }).catch(err => {
        if (err.name !== 'AbortError') console.error('Lỗi fetch overview:', err);
      });
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [overviewDateFilters]);

  const latestUnifiedDate = useMemo<Date | null>(() => {
    if (overviewSummary?.date) return parseVNDate(overviewSummary.date) || new Date(overviewSummary.date);
    return null;
  }, [overviewSummary]);

  // --- Dữ liệu lọc theo overviewDateFilters ---
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
    return exportData.filter(row => {
      const dateMatch = overviewDateFilters.length === 0 || (expDateKey && overviewDateFilters.includes(formatDateToVN(row[expDateKey])));
      const congTrinhMatch = filters.congTrinh.length === 0 || (expCongTrinhKey && filters.congTrinh.includes(String(row[expCongTrinhKey!] || '').trim()));
      const xuongMatch = filters.xuong.length === 0 || (expXuongKey && filters.xuong.includes(String(row[expXuongKey!] || '').trim()));
      return dateMatch && congTrinhMatch && xuongMatch;
    });
  }, [exportData, overviewDateFilters, filters.congTrinh, filters.xuong, expDateKey, expCongTrinhKey, expXuongKey]);

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
  // Khóa cache phải phản ánh đúng TẬP NGÀY đang lọc (không chỉ ngày mới nhất) —
  // để khi người dùng đổi bộ lọc ngoài, modal chi tiết tự load lại đúng dữ liệu.
  const filterKey = overviewDateFilters.length > 0
    ? [...overviewDateFilters].sort().join('_')
    : `all-${overviewSummary?.date ?? ''}`;
  const kW = `${key}-xuong-${filterKey}`;
  const kP = `${key}-congtrinh-${filterKey}`;
  if (groupAnalysisCache[kW] && groupAnalysisCache[kP]) return;

  let datesISO: string[] | undefined;
  let dateToISO: string | undefined;

  if (overviewDateFilters.length > 0) {
    datesISO = overviewDateFilters
      .map(d => parseVNDate(d))
      .filter((d): d is Date => d !== null)
      .map(d => toISODateLocal(d));
  } else if (overviewSummary?.date) {
    // Không chọn ngày cụ thể (toàn bộ thời gian) — dùng ngày mới nhất làm mốc
    dateToISO = overviewSummary.date;
  }

  const [byXuong, byCongTrinh] = await Promise.all([
    fetchOverviewByGroup(key, 'xuong', { datesISO, dateToISO }),
    fetchOverviewByGroup(key, 'congtrinh', { datesISO, dateToISO }),
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
