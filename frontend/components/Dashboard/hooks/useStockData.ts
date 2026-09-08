import { useEffect, useMemo, useState } from 'react';
import { DataRow } from '../../../types';
import { parseVNDate, toISODateLocal, computeMtdRows } from '../utils/dateHelpers';
import {
  fetchStockDates,
  fetchStockByProject,
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
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useStockData({
  stockData,
  stockDateKey,
  latestUnifiedDate,
  overviewMetric,
}: UseStockDataParams): UseStockDataResult {
  const [stockDates, setStockDates] = useState<StockDateEntry[]>([]);
  const [stockByProjectData, setStockByProjectData] = useState<StockByProjectRow[]>([]);

  useEffect(() => {
    fetchStockDates().then(setStockDates);
  }, []);

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
      return toISODateLocal(sDate) === dateStr; // compare normalized YYYY-MM-DD, not raw strings
    });
    if (!entry) return 0;
    return overviewMetric === 'COUNT' ? entry.count : entry.value;
  }, [stockDates, closestStockDate, overviewMetric]);

  const loadStockByProject = () => {
  if (closestStockDate) {
    fetchStockByProject(toISODateLocal(closestStockDate)).then(setStockByProjectData);
  }
};;

  return {
  stockDates,
  stockByProjectData,
  latestStockDateAvailable,
  closestStockDate,
  mtdStockData,
  filteredStockDataForExport,
  latestStockStats,
  latestStockStatsPrevMonth,
  stockOverviewCardValue,   // ← thêm dòng này
  loadStockByProject,
};
}