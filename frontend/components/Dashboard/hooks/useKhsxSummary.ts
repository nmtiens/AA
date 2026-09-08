import { useEffect, useMemo, useRef, useState } from 'react';
import { DataRow } from '../../../types';
import { parseNumber } from '../utils/numberParsers';
import { fetchKhsxNhapKhoSummary, type KhsxNhapKhoSummary } from '../../../services/dataService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ViewMode = 'WEEK' | 'MONTH';

export interface UnifiedTimeFilters {
  nam: string[];
  thang: string[];
  tuan: string[];
  ngay: string[];
}

interface DashboardFiltersSubset {
  congTrinh: string[];
  xuong: string[];
}

export interface WeeklyPlanVsActualRow {
  name: string;
  plan: number;
  actualWeek: number;
  dungKh: number;
  thucHienDungKh1Phan: number;
  rotKh: number;
  thucHienRotKh1Phan: number;
  nhapKhoTruocKh: number;
  vuotKh: number;
  nhapKhoNgoaiKh: number;
}

export interface ProductivityAnalysisRow {
  name: string;
  avgWorkers: number;
  avgDinhBien: number;
  totalHc: number;
  totalTc: number;
  totalHours: number;
  sales: number;
  salesPerHour: number;
  salesPerWorker: number;
  overtimeRate: number;
  hoursPerWorker: number;
}

interface UseKhsxSummaryParams {
  // Shared filters
  unifiedTimeFilters: UnifiedTimeFilters;
  viewMode: ViewMode;
  filters: DashboardFiltersSubset;

  // --- Weekly Plan vs Actual (Analysis data source) ---
  filteredAnalysisData: DataRow[];
  analysisXuongKey: string;
  analysisPlanKey: string;
  analysisActualKey: string;
  analysisWeekKey: string;
  analysisDungKhKey: string;
  analysisThucHienDungKh1PhanKey: string;
  analysisRotKhKey: string;
  analysisThucHienRotKh1PhanKey: string;
  analysisNhapKhoTruocKhKey: string;
  analysisVuotKhKey: string;
  analysisNhapKhoNgoaiKhKey: string;

  // --- Productivity Analysis (Attendance + Inventory) ---
  attendanceData: DataRow[];
  attXuongKey: string;
  attNamKey: string;
  attThangKey: string;
  attTuanKey: string;
  attNgayKey: string;
  attSoLuongCnKey: string;
  attGioCongHcKey: string;
  attGioCongTcKey: string;
  attDinhBienKey: string;

  filteredInventoryData: DataRow[];
  invXuongKey: string;
  invThanhTienKey: string;
}

interface UseKhsxSummaryResult {
  khsxSummary: KhsxNhapKhoSummary | null;
  totalKhsxAmount: number;
  totalInventoryAmount: number;
  completionRate: number;
  combinedWorkshopData: { name: string; khValue: number; thValue: number }[];
  combinedProjectData: { name: string; code: string; khValue: number; thValue: number }[];
  weeklyPlanVsActualData: WeeklyPlanVsActualRow[];
  productivityAnalysisData: ProductivityAnalysisRow[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useKhsxSummary({
  unifiedTimeFilters,
  viewMode,
  filters,

  filteredAnalysisData,
  analysisXuongKey,
  analysisPlanKey,
  analysisActualKey,
  analysisWeekKey,
  analysisDungKhKey,
  analysisThucHienDungKh1PhanKey,
  analysisRotKhKey,
  analysisThucHienRotKh1PhanKey,
  analysisNhapKhoTruocKhKey,
  analysisVuotKhKey,
  analysisNhapKhoNgoaiKhKey,

  attendanceData,
  attXuongKey,
  attNamKey,
  attThangKey,
  attTuanKey,
  attNgayKey,
  attSoLuongCnKey,
  attGioCongHcKey,
  attGioCongTcKey,
  attDinhBienKey,

  filteredInventoryData,
  invXuongKey,
  invThanhTienKey,
}: UseKhsxSummaryParams): UseKhsxSummaryResult {
  // -------------------------------------------------------------------------
  // KHSX summary (KH vs TH) — debounced + abortable fetch
  // -------------------------------------------------------------------------
  const [khsxSummary, setKhsxSummary] = useState<KhsxNhapKhoSummary | null>(null);
  const khsxFetchIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++khsxFetchIdRef.current;
    const controller = new AbortController();

    const timer = setTimeout(() => {
      const nam = unifiedTimeFilters.nam[0] ?? new Date().getFullYear().toString();
      const thang = unifiedTimeFilters.thang[0];
      const mode = viewMode === 'WEEK' ? 'week' : 'month';
      const tuan = viewMode === 'WEEK' ? unifiedTimeFilters.tuan[0] : undefined;
      const ngay = viewMode === 'WEEK' ? unifiedTimeFilters.ngay[0] : undefined;

      fetchKhsxNhapKhoSummary({
        nam, thang, mode, tuan, ngay,
        congTrinh: filters.congTrinh,
        xuong: filters.xuong,
        signal: controller.signal,
      }).then(data => {
        if (data && requestId === khsxFetchIdRef.current) {
          setKhsxSummary(data);
        }
      }).catch(err => {
        if (err.name !== 'AbortError') console.error('Lỗi fetch khsx summary:', err);
      });
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [unifiedTimeFilters, viewMode, filters.congTrinh, filters.xuong]);

  const totalKhsxAmount = khsxSummary?.totalKh ?? 0;
  const totalInventoryAmount = khsxSummary?.totalTh ?? 0;
  const completionRate = khsxSummary?.completionRate ?? 0;

  const combinedWorkshopData = useMemo(() =>
    (khsxSummary?.byXuong ?? []).map(r => ({ name: r.xuong, khValue: r.kh, thValue: r.th })),
    [khsxSummary]
  );

  const combinedProjectData = useMemo(() =>
    (khsxSummary?.byCongTrinh ?? []).map(r => ({ name: r.name, code: r.code, khValue: r.kh, thValue: r.th })),
    [khsxSummary]
  );

  // -------------------------------------------------------------------------
  // Weekly Plan vs Actual (Analysis data source)
  // -------------------------------------------------------------------------
  const weeklyPlanVsActualData = useMemo<WeeklyPlanVsActualRow[]>(() => {
    if (viewMode === 'MONTH') return [];
    if (!analysisXuongKey || !analysisPlanKey || !analysisActualKey) return [];

    const map = new Map<string, WeeklyPlanVsActualRow>();

    filteredAnalysisData.forEach(row => {
      // Use Unified Time Filter (tuan)
      if (unifiedTimeFilters.tuan.length > 0 && analysisWeekKey) {
        const rowWeek = String(row[analysisWeekKey] || '').trim();
        if (!unifiedTimeFilters.tuan.includes(rowWeek)) return;
      }
      const xuong = String(row[analysisXuongKey] || 'Chưa phân xưởng').trim();

      const plan = parseNumber(row[analysisPlanKey]) / 1000;
      const actual = parseNumber(row[analysisActualKey]) / 1000;

      const dungKh = analysisDungKhKey ? parseNumber(row[analysisDungKhKey]) / 1000 : 0;
      const thucHienDungKh1Phan = analysisThucHienDungKh1PhanKey ? parseNumber(row[analysisThucHienDungKh1PhanKey]) / 1000 : 0;
      const rotKh = analysisRotKhKey ? parseNumber(row[analysisRotKhKey]) / 1000 : 0;
      const thucHienRotKh1Phan = analysisThucHienRotKh1PhanKey ? parseNumber(row[analysisThucHienRotKh1PhanKey]) / 1000 : 0;
      const nhapKhoTruocKh = analysisNhapKhoTruocKhKey ? parseNumber(row[analysisNhapKhoTruocKhKey]) / 1000 : 0;
      const vuotKh = analysisVuotKhKey ? parseNumber(row[analysisVuotKhKey]) / 1000 : 0;
      const nhapKhoNgoaiKh = analysisNhapKhoNgoaiKhKey ? parseNumber(row[analysisNhapKhoNgoaiKhKey]) / 1000 : 0;

      if (!map.has(xuong)) {
        map.set(xuong, {
          name: xuong,
          plan: 0,
          actualWeek: 0,
          dungKh: 0,
          thucHienDungKh1Phan: 0,
          rotKh: 0,
          thucHienRotKh1Phan: 0,
          nhapKhoTruocKh: 0,
          vuotKh: 0,
          nhapKhoNgoaiKh: 0,
        });
      }
      const entry = map.get(xuong)!;
      entry.plan += plan;
      entry.actualWeek += actual;

      entry.dungKh += dungKh;
      entry.thucHienDungKh1Phan += thucHienDungKh1Phan;
      entry.rotKh += rotKh;
      entry.thucHienRotKh1Phan += thucHienRotKh1Phan;
      entry.nhapKhoTruocKh += nhapKhoTruocKh;
      entry.vuotKh += vuotKh;
      entry.nhapKhoNgoaiKh += nhapKhoNgoaiKh;
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [
    filteredAnalysisData, analysisXuongKey, analysisPlanKey, analysisActualKey, analysisWeekKey, unifiedTimeFilters.tuan, viewMode,
    analysisDungKhKey, analysisThucHienDungKh1PhanKey, analysisRotKhKey, analysisThucHienRotKh1PhanKey,
    analysisNhapKhoTruocKhKey, analysisVuotKhKey, analysisNhapKhoNgoaiKhKey,
  ]);

  // -------------------------------------------------------------------------
  // Productivity Analysis (Attendance + Inventory)
  // -------------------------------------------------------------------------
  const productivityAnalysisData = useMemo<ProductivityAnalysisRow[]>(() => {
    if (viewMode === 'MONTH') return [];

    // 1. Aggregate Attendance Data
    const attendanceMap = new Map<string, {
      name: string;
      totalSoLuongCn: number;
      totalDinhBien: number;
      entryCount: number;
      gioCongHc: number;
      gioCongTc: number;
    }>();

    if (attXuongKey) {
      attendanceData.forEach(row => {
        // Filter by Year (Unified Filter)
        if (unifiedTimeFilters.nam.length > 0 && attNamKey) {
          const rowNam = String(row[attNamKey] || '').trim();
          if (!unifiedTimeFilters.nam.includes(rowNam)) return;
        }

        // Filter by Month (Unified Filter)
        if (unifiedTimeFilters.thang.length > 0 && attThangKey) {
          const rowThang = String(row[attThangKey] || '').trim();
          if (!unifiedTimeFilters.thang.includes(rowThang)) return;
        }

        // Filter by Week (Unified Filter)
        if (unifiedTimeFilters.tuan.length > 0 && attTuanKey) {
          const rowWeek = String(row[attTuanKey] || '').trim();
          if (!unifiedTimeFilters.tuan.includes(rowWeek)) return;
        }

        // Filter by Day (Unified Filter)
        if (unifiedTimeFilters.ngay.length > 0 && attNgayKey) {
          const rowNgay = String(row[attNgayKey] || '').trim();
          if (!unifiedTimeFilters.ngay.includes(rowNgay)) return;
        }

        const xuong = String(row[attXuongKey] || 'Chưa phân xưởng').trim();

        const slCn = attSoLuongCnKey ? parseNumber(row[attSoLuongCnKey]) : 0;
        const gioHc = attGioCongHcKey ? parseNumber(row[attGioCongHcKey]) : 0;
        const gioTc = attGioCongTcKey ? parseNumber(row[attGioCongTcKey]) : 0;

        if (!attendanceMap.has(xuong)) {
          attendanceMap.set(xuong, { name: xuong, totalSoLuongCn: 0, totalDinhBien: 0, entryCount: 0, gioCongHc: 0, gioCongTc: 0 });
        }
        const entry = attendanceMap.get(xuong)!;
        entry.totalSoLuongCn += slCn;
        if (attDinhBienKey) {
          entry.totalDinhBien += parseNumber(row[attDinhBienKey]);
        }
        entry.entryCount += 1;
        entry.gioCongHc += gioHc;
        entry.gioCongTc += gioTc;
      });
    }

    // 2. Aggregate Inventory Data (Sales)
    // filteredInventoryData is already filtered by Unified Time Filters (Year, Month, Week)
    const inventoryMap = new Map<string, number>();
    if (invXuongKey && invThanhTienKey) {
      filteredInventoryData.forEach(row => {
        const xuong = String(row[invXuongKey] || 'Chưa phân xưởng').trim();
        const val = parseNumber(row[invThanhTienKey]);
        inventoryMap.set(xuong, (inventoryMap.get(xuong) || 0) + val);
      });
    }

    // 3. Combine and Calculate Metrics
    const allKeys = new Set([...attendanceMap.keys(), ...inventoryMap.keys()]);
    const result: ProductivityAnalysisRow[] = [];

    allKeys.forEach(xuong => {
      const att = attendanceMap.get(xuong) || { name: xuong, totalSoLuongCn: 0, totalDinhBien: 0, entryCount: 0, gioCongHc: 0, gioCongTc: 0 };
      const sales = inventoryMap.get(xuong) || 0;

      // Worker Count as Average
      const avgWorkers = att.entryCount > 0 ? att.totalSoLuongCn / att.entryCount : 0;
      const avgDinhBien = att.entryCount > 0 ? att.totalDinhBien / att.entryCount : 0;
      const totalHours = att.gioCongHc + att.gioCongTc;

      // Derived Metrics
      const salesPerHour = totalHours > 0 ? sales / totalHours : 0;
      const salesPerWorker = avgWorkers > 0 ? sales / avgWorkers : 0;
      const overtimeRate = totalHours > 0 ? (att.gioCongTc / totalHours) * 100 : 0;
      const hoursPerWorker = avgWorkers > 0 ? totalHours / avgWorkers : 0;

      if (att.entryCount === 0 && sales === 0) return;

      result.push({
        name: xuong,
        avgWorkers,
        avgDinhBien,
        totalHc: att.gioCongHc,
        totalTc: att.gioCongTc,
        totalHours,
        sales,
        salesPerHour,
        salesPerWorker,
        overtimeRate,
        hoursPerWorker,
      });
    });

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [
    attendanceData, filteredInventoryData, viewMode, unifiedTimeFilters.tuan, unifiedTimeFilters.nam, unifiedTimeFilters.thang, unifiedTimeFilters.ngay,
    attXuongKey, attTuanKey, attNamKey, attThangKey, attNgayKey, attSoLuongCnKey, attGioCongHcKey, attGioCongTcKey, attDinhBienKey,
    invXuongKey, invThanhTienKey,
  ]);

  return {
    khsxSummary,
    totalKhsxAmount,
    totalInventoryAmount,
    completionRate,
    combinedWorkshopData,
    combinedProjectData,
    weeklyPlanVsActualData,
    productivityAnalysisData,
  };
}