import { useEffect, useMemo, useRef, useState } from 'react';
import { DataRow } from '../../../types';
import { parseNumber } from '../utils/numberParsers';
import { fetchKhsxNhapKhoSummary, type KhsxNhapKhoSummary } from '../../../services/dataService';
import { inPlanWeek } from './useUnifiedTimeFilters';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// MỚI: thêm 'YEAR' — chế độ "Xem theo NĂM" chỉ hiển thị biểu đồ Phân bổ Kế
// hoạch theo Xưởng (KhsxPlanActualSection tự ẩn phần còn lại khi viewMode
// === 'YEAR'), nhưng type ở đây vẫn cần bao gồm 'YEAR' để khớp với type
// ViewMode dùng chung trong toàn bộ Dashboard (xem useUnifiedTimeFilters.ts).
export type ViewMode = 'WEEK' | 'MONTH' | 'YEAR';

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

// Tách TH: phần theo KH + phần ngoài KH (thPlan thiếu = server cũ => coi toàn bộ là theo KH)
const splitTh = (r: { th: number; thPlan?: number }) => {
  const plan = r.thPlan ?? r.th;
  return { thValue: plan, thOutValue: Math.max(Number((r.th - plan).toFixed(2)), 0) };
};

interface UseKhsxSummaryResult {
  khsxSummary: KhsxNhapKhoSummary | null;
  totalKhsxAmount: number;
  /** Có giá trị khi xem theo tháng mà kỳ chưa có KH tháng nhưng đã có KH tuần */
  weeklyKhFallback?: number;
  totalInventoryAmount: number;
  /** Nhập kho của hạng mục có trong KH cùng kỳ */
  totalInventoryPlanAmount: number;
  completionRate: number;
  // thValue = nhập kho theo KH, thOutValue = nhập kho ngoài KH (cộng lại = toàn bộ nhập kho kỳ)
  combinedWorkshopData: { name: string; khValue: number; thValue: number; thOutValue: number }[];
  combinedProjectData: { name: string; code: string; khValue: number; thValue: number; thOutValue: number }[];
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
    // Ở chế độ NĂM, bảng KH/TH theo tháng-tuần này không hiển thị (xem
    // KhsxPlanActualSection: viewMode === 'YEAR' chỉ render biểu đồ theo xưởng
    // lấy từ /api/revenue/:year, không dùng khsxSummary) — bỏ qua fetch để
    // tránh gọi API thừa mỗi khi người dùng đổi năm ở chế độ NĂM.
    if (viewMode === 'YEAR') {
      setKhsxSummary(null);
      return;
    }

    const requestId = ++khsxFetchIdRef.current;
    const controller = new AbortController();

    const timer = setTimeout(() => {
      const nam = unifiedTimeFilters.nam[0] ?? new Date().getFullYear().toString();
      // Gửi MỌI giá trị đã chọn (API nhận danh sách) — trước chỉ lấy giá trị đầu nên lệch bảng năng suất
      const join = (v: string[]) => (v.length ? v.join(',') : undefined);
      const thang = join(unifiedTimeFilters.thang);
      const mode = viewMode === 'WEEK' ? 'week' : 'month';
      const tuan = viewMode === 'WEEK' ? join(unifiedTimeFilters.tuan) : undefined;
      const ngay = viewMode === 'WEEK' ? join(unifiedTimeFilters.ngay) : undefined;

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
  const weeklyKhFallback = khsxSummary?.weeklyKhFallback;
  const totalInventoryAmount = khsxSummary?.totalTh ?? 0;
  const totalInventoryPlanAmount = khsxSummary?.totalThPlan ?? 0;
  const completionRate = khsxSummary?.completionRate ?? 0;

  const combinedWorkshopData = useMemo(() =>
    (khsxSummary?.byXuong ?? []).map(r => ({ name: r.xuong, khValue: r.kh, ...splitTh(r) })),
    [khsxSummary]
  );

  const combinedProjectData = useMemo(() =>
    (khsxSummary?.byCongTrinh ?? []).map(r => ({ name: r.name, code: r.code, khValue: r.kh, ...splitTh(r) })),
    [khsxSummary]
  );

  // -------------------------------------------------------------------------
  // Weekly Plan vs Actual (Analysis data source)
  // -------------------------------------------------------------------------
  const weeklyPlanVsActualData = useMemo<WeeklyPlanVsActualRow[]>(() => {
    // SỬA: trước đây chỉ loại trừ 'MONTH' — với 'YEAR' điều kiện này là false
    // nên code bên dưới vẫn chạy nhầm như đang ở chế độ WEEK. Giờ chỉ tính khi
    // viewMode thực sự là 'WEEK'.
    if (viewMode !== 'WEEK') return [];
    if (!analysisXuongKey || !analysisPlanKey || !analysisActualKey) return [];

    const map = new Map<string, WeeklyPlanVsActualRow>();

    // Chỉ năm đang chọn (cột nam) — số tuần lặp lại mỗi năm
    const namSel = unifiedTimeFilters.nam[0];
    filteredAnalysisData.forEach(row => {
      if (namSel && row['nam'] !== undefined && row['nam'] !== null && String(row['nam']).trim() !== '' && String(row['nam']).trim() !== namSel) return;
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
    filteredAnalysisData, analysisXuongKey, analysisPlanKey, analysisActualKey, analysisWeekKey, unifiedTimeFilters.tuan, unifiedTimeFilters.nam, viewMode,
    analysisDungKhKey, analysisThucHienDungKh1PhanKey, analysisRotKhKey, analysisThucHienRotKh1PhanKey,
    analysisNhapKhoTruocKhKey, analysisVuotKhKey, analysisNhapKhoNgoaiKhKey,
  ]);

  // -------------------------------------------------------------------------
  // Productivity Analysis (Attendance + Inventory)
  // -------------------------------------------------------------------------
  const productivityAnalysisData = useMemo<ProductivityAnalysisRow[]>(() => {
    // SỬA: cùng lý do như trên — chỉ tính khi thực sự ở chế độ WEEK.
    if (viewMode !== 'WEEK') return [];

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

        // Xem theo TUẦN đã chọn tuần: tuần tính theo NGÀY (năm/tháng/ngày của dòng chấm công), không lọc thêm tháng
        // — khớp phần doanh số nhập kho cùng bảng (trước lọc tháng => tuần giáp 2 tháng thiếu giờ công)
        const weekByDate = viewMode === 'WEEK' && unifiedTimeFilters.tuan.length > 0 && !!attNamKey && !!attThangKey && !!attNgayKey;
        if (weekByDate) {
          const y = Number(row[attNamKey!]), m = Number(row[attThangKey!]), dd = Number(row[attNgayKey!]);
          if (!(y > 0 && m > 0 && dd > 0)) return;
          const d = new Date(y, m - 1, dd);
          const years = unifiedTimeFilters.nam.map(Number).filter(n => n > 0);
          const weeks = unifiedTimeFilters.tuan.map(Number).filter(n => n > 0);
          if (!(years.length ? years : [y]).some(yy => weeks.some(w => inPlanWeek(d, yy, w)))) return;
        } else {
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
    weeklyKhFallback,
    totalInventoryAmount,
    totalInventoryPlanAmount,
    completionRate,
    combinedWorkshopData,
    combinedProjectData,
    weeklyPlanVsActualData,
    productivityAnalysisData,
  };
}