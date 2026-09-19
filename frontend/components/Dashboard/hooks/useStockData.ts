import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataRow } from '../../../types';
import { parseVNDate, toISODateLocal, computeMtdRows } from '../utils/dateHelpers';
import {
  fetchStockDates,
  fetchStockByProject,
  fetchStockTotalCount,
  type StockDateEntry,
  type StockByProjectRow,
} from '../../../services/dataService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StockStatsResult {
  count: number;
  value: number;
  date: Date | null;
}

interface UseStockDataParams {
  stockData: DataRow[];
  stockDateKey: string;
  latestUnifiedDate: Date | null;
  overviewMetric: 'COUNT' | 'SUM';
  // SỬA: giữ nguyên type để không phải đổi chỗ gọi ở Dashboard.tsx, nhưng bên
  // trong hook này CHỈ dùng congTrinh/xuong — tinhTrang/tinhTrangIpo KHÔNG áp
  // dụng cho Tồn kho (P022 & Card 6), theo yêu cầu: 2 bộ lọc tình trạng không
  // ăn cho tồn kho, luôn hiển thị toàn bộ kho theo Công trình/Xưởng.
  filters: { congTrinh: string[]; xuong: string[]; tinhTrang: string[]; tinhTrangIpo: string[] };
  // ✅ FIX: danh sách công trình đã setup cho view hiện tại (giống hệt tham số
  // cùng tên trong useOverviewSummary). Optional — Dashboard tổng không truyền,
  // các trang theo view (ConstructionRedFlow/ConstructionSampleUnit) truyền vào.
  //
  // TRƯỚC ĐÂY: hook này gọi fetchStockDates/fetchStockByProject/fetchStockTotalCount
  // bằng filters.congTrinh THÔ, không hề biết tới whitelist của view. Khi user chưa
  // chọn gì ở dropdown "Tên Công Trình" (filters.congTrinh = []), server hiểu là
  // "không lọc" và trả về tồn kho của TOÀN NHÀ MÁY — sai hoàn toàn với view đang xem.
  // Đây chính là lỗi "Tồn kho chưa ăn theo view/id".
  viewProjectWhitelist?: string[];
}


interface UseStockDataResult {
  stockDates: StockDateEntry[];
  stockByProjectData: StockByProjectRow[];
  latestStockDateAvailable: Date | null;
  closestStockDate: Date | null;
  mtdStockData: DataRow[];
  filteredStockDataForExport: DataRow[];
  latestStockStats: StockStatsResult;
  latestStockStatsPrevMonth: StockStatsResult;
  stockOverviewCardValue: number;
  loadStockByProject: () => void;
  stockTotalCount: number; // tổng số dòng thật (COUNT(*)) — ĐÃ scope theo view nếu có
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useStockData({
  stockData,
  stockDateKey,
  latestUnifiedDate,
  overviewMetric,
  filters,
  viewProjectWhitelist, // ✅ FIX
}: UseStockDataParams): UseStockDataResult {
  const [stockDates, setStockDates] = useState<StockDateEntry[]>([]);
  const [stockByProjectData, setStockByProjectData] = useState<StockByProjectRow[]>([]);
  const [stockTotalCount, setStockTotalCount] = useState<number>(0);

  // ✅ FIX: công thức giao whitelist — PHẢI GIỐNG HỆT getEffectiveCongTrinh() trong
  // useOverviewSummary.ts, nếu không 2 nơi sẽ lọc lệch nhau.
  // - viewProjectWhitelist === undefined -> không scope theo view (Dashboard tổng) ->
  //   dùng nguyên filters.congTrinh, giữ đúng hành vi cũ.
  // - viewProjectWhitelist là mảng (kể cả []) -> đang ở trang theo view -> áp whitelist:
  //   chưa chọn gì ở dropdown thì mặc định dùng ĐÚNG whitelist của view (không phải
  //   "tất cả"); đã chọn thì giao với whitelist.
  const effectiveCongTrinh = useMemo((): string[] => {
    if (viewProjectWhitelist === undefined) {
      return filters.congTrinh;
    }
    if (filters.congTrinh.length > 0) {
      return filters.congTrinh.filter(ct => viewProjectWhitelist.includes(ct));
    }
    return viewProjectWhitelist;
  }, [filters.congTrinh, viewProjectWhitelist]);

  // Đang ở 1 view (whitelist tồn tại) nhưng giao ra rỗng (0 công trình khớp) ->
  // không được gọi API với congTrinh=[] (server sẽ hiểu là "không lọc" = toàn bộ),
  // phải set thẳng kết quả = rỗng.
  const isScopedWithNoProjects = viewProjectWhitelist !== undefined && effectiveCongTrinh.length === 0;

  useEffect(() => {
    // SỬA: KHÔNG truyền tinhTrang/tinhTrangIpo — Tồn kho chỉ lọc theo
    // congTrinh/xuong, bất kể bộ lọc tổng có chọn Tình Trạng/Tình Trạng IPO hay không.
    if (isScopedWithNoProjects) {
      setStockDates([]);
      setStockTotalCount(0);
      return;
    }

    // ✅ FIX: dùng effectiveCongTrinh (đã giao với whitelist nếu có) thay vì
    // filters.congTrinh trần — đây là chỗ gây lỗi tồn kho không lọc theo view.
    fetchStockDates({
      congTrinh: effectiveCongTrinh,
      xuong: filters.xuong,
    }).then(result => { if (result !== null) setStockDates(result); });

    // ✅ FIX: fetchStockTotalCount() trước đây KHÔNG nhận tham số filter nào —
    // luôn trả COUNT(*) của toàn bộ bảng ton_kho bất kể đang ở view nào.
    // Cần áp dụng PATCH tương ứng ở dataService.ts (xem dataService_patch.ts)
    // để hàm này nhận opts và backend đọc được congTrinh/xuong query param.
    fetchStockTotalCount({
      congTrinh: effectiveCongTrinh,
      xuong: filters.xuong,
    }).then(setStockTotalCount);
  }, [effectiveCongTrinh, filters.xuong, isScopedWithNoProjects]);

  const latestStockDateAvailable = useMemo<Date | null>(() => {
    if (stockDates.length === 0) return null;
    return parseVNDate(stockDates[0].date) || new Date(stockDates[0].date);
  }, [stockDates]);

  const closestStockDate = useMemo<Date | null>(() => {
    if (!latestUnifiedDate || stockDates.length === 0) return null;
    const match = stockDates.find(s => {
      const d = parseVNDate(s.date) || new Date(s.date);
      return d.getTime() <= latestUnifiedDate.getTime();
    });
    return match ? (parseVNDate(match.date) || new Date(match.date)) : null;
  }, [stockDates, latestUnifiedDate]);

  const mtdStockData = useMemo(
    () => computeMtdRows(stockData, stockDateKey, latestUnifiedDate),
    [stockData, stockDateKey, latestUnifiedDate]
  );

  // Tồn kho: phạm vi "Theo bộ lọc ngày" = đúng ngày tồn kho gần nhất (closestStockDate)
  const filteredStockDataForExport = useMemo(() => {
    if (!closestStockDate || !stockDateKey) return stockData;
    return stockData.filter(row => {
      const d = parseVNDate(String(row[stockDateKey] || '').trim());
      return d && toISODateLocal(d) === toISODateLocal(closestStockDate);
    });
  }, [stockData, stockDateKey, closestStockDate]);

  const latestStockStats = useMemo<StockStatsResult>(() => {
    if (!latestUnifiedDate) return { count: 0, value: 0, date: null };
    const currentMonthRef = new Date(latestUnifiedDate.getFullYear(), latestUnifiedDate.getMonth(), 1);
    const entry = stockDates.find(s => {
      const d = parseVNDate(s.date) || new Date(s.date);
      return d.getFullYear() === currentMonthRef.getFullYear() && d.getMonth() === currentMonthRef.getMonth();
    });
    if (!entry) return { count: 0, value: 0, date: null };
    const d = parseVNDate(entry.date) || new Date(entry.date);
    return { count: entry.count, value: entry.value, date: d };
  }, [stockDates, latestUnifiedDate]);

  const latestStockStatsPrevMonth = useMemo<StockStatsResult>(() => {
    if (!latestUnifiedDate) return { count: 0, value: 0, date: null };
    const prevMonthRef = new Date(latestUnifiedDate.getFullYear(), latestUnifiedDate.getMonth() - 1, 1);
    const entry = stockDates.find(s => {
      const d = parseVNDate(s.date) || new Date(s.date);
      return d.getFullYear() === prevMonthRef.getFullYear() && d.getMonth() === prevMonthRef.getMonth();
    });
    if (!entry) return { count: 0, value: 0, date: null };
    const d = parseVNDate(entry.date) || new Date(entry.date);
    return { count: entry.count, value: entry.value, date: d };
  }, [stockDates, latestUnifiedDate]);

  const stockOverviewCardValue = useMemo(() => {
    if (!closestStockDate) return 0;
    const dateStr = toISODateLocal(closestStockDate);
    const entry = stockDates.find(s => {
      const sDate = parseVNDate(s.date) || new Date(s.date);
      return toISODateLocal(sDate) === dateStr;
    });
    if (!entry) return 0;
    return overviewMetric === 'COUNT' ? entry.count : entry.value;
  }, [stockDates, closestStockDate, overviewMetric]);

const loadStockByProject = useCallback(() => {
    if (isScopedWithNoProjects) {
      setStockByProjectData([]);
      return;
    }
    if (closestStockDate) {
      fetchStockByProject(toISODateLocal(closestStockDate), {
        congTrinh: effectiveCongTrinh,
        xuong: filters.xuong,
      }).then(setStockByProjectData);
    }
  }, [isScopedWithNoProjects, closestStockDate, effectiveCongTrinh, filters.xuong]);

 return {
    stockDates,
    stockByProjectData,
    latestStockDateAvailable,
    closestStockDate,
    mtdStockData,
    filteredStockDataForExport,
    latestStockStats,
    latestStockStatsPrevMonth,
    stockOverviewCardValue,
    loadStockByProject,
    stockTotalCount,
  };
}