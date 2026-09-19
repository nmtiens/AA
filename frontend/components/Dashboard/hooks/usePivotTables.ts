import { useMemo, useState } from 'react';
import { DataRow } from '../../../types';
import { STATUS_GROUPS } from '../constants';
import { parseNumber } from '../utils/numberParsers';
import { parseVNDate, toISODateLocal } from '../utils/dateHelpers';
import { ON_LINE_STAGES, extractStage } from '../components/modals/OnLineStageDetailModal';
import {
  MetricType,
  BottleneckItem,
  WorkshopPivotData,
  ProjectPivotData,
  MaterialSummaryPivotData,
  MaterialStatusPivotData,
} from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BottleneckViewMode = 'BOP' | 'TÌNH TRẠNG';
export type ProjectSummaryMetric = 'VALUE' | 'COUNT';
export type MatStatusMetric = 'COUNT_PR' | 'SUM_QTY';

interface UsePivotTablesParams {
  filteredProductionData: DataRow[];
  filteredMaterialData: DataRow[];
  displayedMaterialData: DataRow[];

  // SỬA: thay cho stockData thô (nặng, tới từ /api/all-data) — dùng bảng đã
  // tổng hợp sẵn phía server (/api/stock/dates, qua useStockData), rất nhẹ và
  // đã TỰ ĐỘNG ăn theo bộ lọc tổng (congTrinh/xuong/tinhTrang/tinhTrangIpo).
  stockDates: { date: string; count: number; value: number }[];
  closestStockDate: Date | null;

  tinhTrangKey: string;
  xuongKey: string;
  bopKey: string;
  valueKey: string;
  realValueKey: string;
  hexKey: string;
  congTrinhKey: string;
  hangMucKey: string;
  daysAtCurrentStageKey: string;
  triGiaDonHangTongKey: string;
  thanhTienTinhPhieuKey: string;
  thanhTienNhapKhoKey: string;
  matNhomVtKey: string;
  matSlYeuCauKey: string;
  matSlDaNhanKey: string;
  matStatusKey: string;
  // XÓA: stockDateKey, stockValueKey, stockSapIdKey, selectedCongTrinh
  // (không còn cần vì stockDates đã tổng hợp + lọc sẵn phía server)
}

interface UsePivotTablesResult {
  // state + setters
  workshopMetric: MetricType;
  setWorkshopMetric: React.Dispatch<React.SetStateAction<MetricType>>;
  projectMetric: MetricType;
  setProjectMetric: React.Dispatch<React.SetStateAction<MetricType>>;
  chartMetric: MetricType;
  setChartMetric: React.Dispatch<React.SetStateAction<MetricType>>;
  projectSummaryMetric: ProjectSummaryMetric;
  setProjectSummaryMetric: React.Dispatch<React.SetStateAction<ProjectSummaryMetric>>;
  matStatusMetric: MatStatusMetric;
  setMatStatusMetric: React.Dispatch<React.SetStateAction<MatStatusMetric>>;
  excludeFabrics: boolean;
  setExcludeFabrics: React.Dispatch<React.SetStateAction<boolean>>;
  expandedBops: Set<string>;
  setExpandedBops: React.Dispatch<React.SetStateAction<Set<string>>>;
  bottleneckViewMode: BottleneckViewMode;
  setBottleneckViewMode: React.Dispatch<React.SetStateAction<BottleneckViewMode>>;
  funnelBreakdownByBop: Record<string, { data: { name: string; value: number }[]; total: number }>;
  // computed
  calculateMetricValue: (row: DataRow, metric: MetricType) => number;
  cardMetrics: {
    coTheSX: number; vecniFitting: number; chuyenKhac: number; coPhieuChuaSX: number;
    chuaTheSX: number; vuongSL: number; chuaTrienKhai: number;
  };
  projectStatusSummary: {
    name: string; totalOrder: number; deployed: number; ticketed: number; inProduction: number;
    inventory: number; remaining: number; notDeployed: number; percentComplete: number;
  }[];
  /**
   * Breakdown "Đang trên chuyền" theo từng mã BOP (P002->P021), theo từng công trình.
   * Key ngoài = tên công trình (đã trim), key trong = mã BOP (P002, P012, ...).
   * Dùng CHUNG điều kiện lọc & cách tính giá trị với
   * `projectStatusSummary[i].inProduction`, nên tổng các giá trị trong
   * `onLineStageBreakdown[project]` LUÔN khớp với `inProduction` của công trình đó.
   */
  onLineStageBreakdown: Record<string, Record<string, number>>;
    hexRowsByColumn: {
    totalOrder: DataRow[];
    afterCancel: DataRow[];
    notDeployed: DataRow[];
    onLine: DataRow[];
    remaining: DataRow[];
    inventory: DataRow[];
  };
  pivotWorkshopData: WorkshopPivotData | null;
  pivotFunnelData: { data: { name: string; value: number }[]; total: number } | null;
  customFunnelData: { id: string; name: string; value: number; color: string; percentage: number }[];
  pivotProjectData: ProjectPivotData | null;
  pivotMaterialSummary: MaterialSummaryPivotData | null;
  pivotMaterialStatusData: MaterialStatusPivotData | null;
  lineChartData: { name: string; value: number }[];
  bottleneckData: BottleneckItem[];
  topBottlenecks: { name: string; count: number }[];
}

// ---------------------------------------------------------------------------
// Helpers (module scope) — dùng chung cho projectStatusSummary.inProduction
// VÀ onLineStageBreakdown, để 2 nơi này KHÔNG BAO GIỜ lệch nhau.
// ---------------------------------------------------------------------------

/**
 * Một dòng sản xuất được tính là "Đang trên chuyền" (inProduction) khi KHÔNG
 * thuộc 1 trong 3 trạng thái loại trừ dưới đây. `statusUpper` phải là giá trị
 * cột Tình Trạng đã upper-case sẵn.
 */
function isInProductionRow(statusUpper: string): boolean {
  return (
    !statusUpper.includes('15. CHƯA TRIỂN KHAI') &&
    !statusUpper.includes('14. CHƯA PHIẾU') &&
    !statusUpper.includes('11. CHƯA SX')
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePivotTables({
  filteredProductionData,
  filteredMaterialData,
  displayedMaterialData,
  stockDates,          // MỚI
  closestStockDate,

  tinhTrangKey,
  xuongKey,
  bopKey,
  valueKey,
  realValueKey,
  hexKey,
  congTrinhKey,
  hangMucKey,
  daysAtCurrentStageKey,
  triGiaDonHangTongKey,
  thanhTienTinhPhieuKey,
  thanhTienNhapKhoKey,
  matNhomVtKey,
  matSlYeuCauKey,
  matSlDaNhanKey,
  matStatusKey,
  // XÓA: stockDateKey, stockValueKey, stockSapIdKey, selectedCongTrinh = [],
}: UsePivotTablesParams): UsePivotTablesResult {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const [workshopMetric, setWorkshopMetric] = useState<MetricType>('SUM_GT_DON_HANG');
  const [projectMetric, setProjectMetric] = useState<MetricType>('SUM_GT_DON_HANG');
  const [chartMetric, setChartMetric] = useState<MetricType>('SUM_GT_DON_HANG');
  const [projectSummaryMetric, setProjectSummaryMetric] = useState<ProjectSummaryMetric>('VALUE');
  const [matStatusMetric, setMatStatusMetric] = useState<MatStatusMetric>('COUNT_PR');
  const [excludeFabrics, setExcludeFabrics] = useState(false);
  const [expandedBops, setExpandedBops] = useState<Set<string>>(new Set());
  const [bottleneckViewMode, setBottleneckViewMode] = useState<BottleneckViewMode>('BOP');

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  const calculateMetricValue = (row: DataRow, metric: MetricType): number => {
    if (metric === 'COUNT_HEX') return 1;
    if (metric === 'SUM_GT_CON_LAI') return parseNumber(row[realValueKey]);
    if (metric === 'SUM_GT_DON_HANG') return parseNumber(row[valueKey]);
    return 0;
  };

  // -------------------------------------------------------------------------
  // Bottleneck
  // -------------------------------------------------------------------------
  const bottleneckData = useMemo<BottleneckItem[]>(() => {
    if (!tinhTrangKey || !daysAtCurrentStageKey) return [];

    const agg: Record<string, BottleneckItem> = {};
    const durationKeys = ['<3 NGÀY', '4-7 NGÀY', '2 tuần', '3 tuần', 'Từ 4 tuần trở lên'];

    filteredProductionData.forEach(row => {
      let status = '';
      if (bottleneckViewMode === 'BOP') {
        status = bopKey ? String(row[bopKey] || 'Chưa xác định').trim() : 'Chưa xác định';
        if (!status) status = 'Chưa xác định';
      } else {
        status = String(row[tinhTrangKey] || '').trim();
      }

      const duration = String(row[daysAtCurrentStageKey] || '').trim();

      if (status && duration) {
        if (!agg[status]) agg[status] = { name: status } as BottleneckItem;
        durationKeys.forEach(k => {
          if (agg[status][k] === undefined) agg[status][k] = 0;
        });

        let matchedKey = duration;
        if (duration.toLowerCase().includes('<3 ngày')) matchedKey = '<3 NGÀY';
        else if (duration.toLowerCase().includes('4-7 ngày')) matchedKey = '4-7 NGÀY';
        else if (duration.toLowerCase().includes('2 tuần')) matchedKey = '2 tuần';
        else if (duration.toLowerCase().includes('3 tuần')) matchedKey = '3 tuần';
        else if (duration.toLowerCase().includes('4 tuần')) matchedKey = 'Từ 4 tuần trở lên';

        const currentValue = agg[status][matchedKey] as number;
        agg[status][matchedKey] = (currentValue || 0) + 1;
      }
    });

    return Object.values(agg).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredProductionData, tinhTrangKey, daysAtCurrentStageKey, bottleneckViewMode, bopKey]);

  const topBottlenecks = useMemo<{ name: string; count: number }[]>(() => {
    if (!tinhTrangKey || !daysAtCurrentStageKey) return [];

    const counts: Record<string, number> = {};
    filteredProductionData.forEach(row => {
      let status = '';
      if (bottleneckViewMode === 'BOP') {
        status = bopKey ? String(row[bopKey] || 'Chưa xác định').trim() : 'Chưa xác định';
        if (!status) status = 'Chưa xác định';
      } else {
        status = String(row[tinhTrangKey] || '').trim();
      }

      const duration = String(row[daysAtCurrentStageKey] || '').trim();

      if (status && duration.toLowerCase().includes('4 tuần')) {
        counts[status] = (counts[status] || 0) + 1;
      }
    });

    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [filteredProductionData, tinhTrangKey, daysAtCurrentStageKey, bottleneckViewMode, bopKey]);

  // -------------------------------------------------------------------------
  // Card metrics (Khả năng & Thành tiền)
  // -------------------------------------------------------------------------
  const cardMetrics = useMemo(() => {
    const metrics = { coTheSX: 0, vecniFitting: 0, chuyenKhac: 0, coPhieuChuaSX: 0, chuaTheSX: 0, vuongSL: 0, chuaTrienKhai: 0 };
    if (!tinhTrangKey) return metrics;
    filteredProductionData.forEach(row => {
      const status = String(row[tinhTrangKey] || '').trim().toUpperCase();
      const val = parseNumber(row[valueKey]);
      const isIn = (group: string[]) => group.some(s => status.includes(s));
      if (isIn(STATUS_GROUPS.CO_THE_SX)) metrics.coTheSX += val;
      if (isIn(STATUS_GROUPS.VECNI_FITTING)) metrics.vecniFitting += val;
      else if (isIn(STATUS_GROUPS.CHUYEN_KHAC)) metrics.chuyenKhac += val;
      else if (isIn(STATUS_GROUPS.CO_PHIEU_CHUA_SX)) metrics.coPhieuChuaSX += val;
      if (isIn(STATUS_GROUPS.CHUA_THE_SX)) metrics.chuaTheSX += val;
      if (isIn(STATUS_GROUPS.VUONG_SL)) metrics.vuongSL += val;
      else if (isIn(STATUS_GROUPS.CHUA_TRIEN_KHAI)) metrics.chuaTrienKhai += val;
    });
    return metrics;
  }, [filteredProductionData, tinhTrangKey, valueKey]);

  // -------------------------------------------------------------------------
  // Project status summary
  // -------------------------------------------------------------------------
  const projectStatusSummary = useMemo(() => {
    if (!congTrinhKey || !triGiaDonHangTongKey) return [];
    const agg: Record<string, { totalOrder: number; deployed: number; ticketed: number; inProduction: number; inventory: number; }> = {};

    const isCount = projectSummaryMetric === 'COUNT';

    filteredProductionData.forEach(row => {
      const ctName = String(row[congTrinhKey] || '').trim();
      if (!ctName) return;
      if (!agg[ctName]) agg[ctName] = { totalOrder: 0, deployed: 0, ticketed: 0, inProduction: 0, inventory: 0 };
      const status = String(row[tinhTrangKey] || '').toUpperCase();

      const totalOrderValRaw = parseNumber(row[triGiaDonHangTongKey]);
      const ticketValRaw = parseNumber(row[thanhTienTinhPhieuKey]);
      const inventoryValRaw = parseNumber(row[thanhTienNhapKhoKey]);

      const totalOrderVal = isCount ? 1 : (totalOrderValRaw / 1000);

      agg[ctName].totalOrder += totalOrderVal;

      if (!status.includes('15. CHƯA TRIỂN KHAI')) {
        agg[ctName].deployed += totalOrderVal;
      }

      const valToAddTicket = isCount ? (ticketValRaw > 0 ? 1 : 0) : (ticketValRaw / 1000);

      if (!status.includes('15. CHƯA TRIỂN KHAI') && !status.includes('14. CHƯA PHIẾU')) {
        agg[ctName].ticketed += valToAddTicket;
      }

      // ✅ Dùng chung điều kiện isInProductionRow() — cùng logic với onLineStageBreakdown bên dưới.
      if (isInProductionRow(status)) {
        agg[ctName].inProduction += valToAddTicket;
      }

      const valToAddInventory = isCount ? (inventoryValRaw > 0 ? 1 : 0) : (inventoryValRaw / 1000);
      agg[ctName].inventory += valToAddInventory;
    });
    return Object.entries(agg).map(([name, data]) => ({
      name, ...data,
      remaining: data.totalOrder - data.inventory,
      notDeployed: data.totalOrder - data.deployed,
      percentComplete: data.totalOrder > 0 ? (data.inventory / data.totalOrder) * 100 : 0,
    })).sort((a, b) => b.totalOrder - a.totalOrder);
  }, [filteredProductionData, congTrinhKey, tinhTrangKey, triGiaDonHangTongKey, thanhTienTinhPhieuKey, thanhTienNhapKhoKey, projectSummaryMetric]);

  // -------------------------------------------------------------------------
  // Breakdown "Đang trên chuyền" theo từng mã BOP (P002->P021), cho từng công
  // trình. Dùng CHUNG điều kiện lọc (isInProductionRow) và cách tính giá trị
  // (thanhTienTinhPhieuKey, quy tắc isCount) với projectStatusSummary.inProduction
  // ở trên, để tổng breakdown theo BOP LUÔN khớp với con số "Đang trên chuyền"
  // trong bảng tổng hợp — không còn 2 nơi tính khác nhau dẫn tới lệch số liệu.
  // -------------------------------------------------------------------------
  const onLineStageBreakdown = useMemo<Record<string, Record<string, number>>>(() => {
    const breakdown: Record<string, Record<string, number>> = {};
    if (!congTrinhKey || !tinhTrangKey || !bopKey || !thanhTienTinhPhieuKey) return breakdown;

    const stageSet = new Set<string>(ON_LINE_STAGES);
    const isCount = projectSummaryMetric === 'COUNT';

    filteredProductionData.forEach(row => {
      const ctName = String(row[congTrinhKey] || '').trim();
      if (!ctName) return;

      const status = String(row[tinhTrangKey] || '').toUpperCase();
      if (!isInProductionRow(status)) return;

      const stage = extractStage(row[bopKey]);
      if (!stage || !stageSet.has(stage)) return;

      const ticketValRaw = parseNumber(row[thanhTienTinhPhieuKey]);
      const valToAdd = isCount ? (ticketValRaw > 0 ? 1 : 0) : (ticketValRaw / 1000);

      if (!breakdown[ctName]) breakdown[ctName] = {};
      breakdown[ctName][stage] = (breakdown[ctName][stage] || 0) + valToAdd;
    });

    return breakdown;
  }, [filteredProductionData, congTrinhKey, tinhTrangKey, bopKey, thanhTienTinhPhieuKey, projectSummaryMetric]);

    // -------------------------------------------------------------------------
  // Chi tiết theo Hex: danh sách các dòng dữ liệu sản xuất gốc (mỗi dòng = 1
  // hex) đứng sau từng con số trong bảng "Tình trạng đơn hàng theo Công
  // trình". Dùng CHUNG điều kiện lọc với projectStatusSummary ở trên, nên khi
  // bấm vào 1 số, tổng giá trị các dòng hex hiện ra LUÔN khớp con số đó.
  // -------------------------------------------------------------------------
  const hexRowsByColumn = useMemo(() => {
    const totalOrder: DataRow[] = [];
    const notDeployed: DataRow[] = [];
    const onLine: DataRow[] = [];
    const inventory: DataRow[] = [];

    if (congTrinhKey && tinhTrangKey) {
      filteredProductionData.forEach(row => {
        const ctName = String(row[congTrinhKey] || '').trim();
        if (!ctName) return;
        const status = String(row[tinhTrangKey] || '').toUpperCase();

        totalOrder.push(row);

        if (status.includes('15. CHƯA TRIỂN KHAI')) {
          notDeployed.push(row);
        } else if (isInProductionRow(status)) {
          onLine.push(row);
        }

        if (thanhTienNhapKhoKey) {
          const invVal = parseNumber(row[thanhTienNhapKhoKey]);
          if (invVal !== 0) inventory.push(row);
        }
      });
    }

    return {
      totalOrder,
      // TODO: chưa có nguồn dữ liệu "đã hủy" -> tạm giống Tổng đơn hàng
      afterCancel: totalOrder,
      notDeployed,
      onLine,
      remaining: [...notDeployed, ...onLine],
      inventory,
    };
  }, [filteredProductionData, congTrinhKey, tinhTrangKey, thanhTienNhapKhoKey]);
  // -------------------------------------------------------------------------
  // Pivot: Workshop (Tình Trạng x Khu vực sản xuất)
  // -------------------------------------------------------------------------
  const pivotWorkshopData = useMemo<WorkshopPivotData | null>(() => {
    if (!tinhTrangKey || !xuongKey) return null;
    const uniqueWorkshops = Array.from(new Set(filteredProductionData.map(r => String(r[xuongKey] || '').trim()).filter(Boolean))).sort();

    const rows: { bop: string; status: string; key: string }[] = [];
    const seen = new Set<string>();
    filteredProductionData.forEach(r => {
      const bop = String(r[bopKey] || '').trim();
      const status = String(r[tinhTrangKey] || '').trim();
      if (status) {
        const combinedKey = `${bop} ||| ${status}`;
        if (!seen.has(combinedKey)) {
          seen.add(combinedKey);
          rows.push({ bop, status, key: combinedKey });
        }
      }
    });

    rows.sort((a, b) => {
      const bopComp = a.bop.localeCompare(b.bop);
      if (bopComp !== 0) return bopComp;
      return a.status.localeCompare(b.status);
    });

    if (uniqueWorkshops.length === 0 || rows.length === 0) return null;

    const uniqueBops = Array.from(new Set(rows.map(r => r.bop)));

    const matrix: Record<string, Record<string, number>> = {};
    const rowTotals: Record<string, number> = {};
    const colTotals: Record<string, number> = {};
    const bopTotals: Record<string, Record<string, number>> = {};
    const bopRowTotals: Record<string, number> = {};
    let grandTotal = 0;

    uniqueBops.forEach(b => {
      bopTotals[b] = {};
      bopRowTotals[b] = 0;
      uniqueWorkshops.forEach(w => {
        bopTotals[b][w] = 0;
      });
    });

    rows.forEach(r => {
      matrix[r.key] = {};
      rowTotals[r.key] = 0;
      uniqueWorkshops.forEach(w => {
        matrix[r.key][w] = 0;
        colTotals[w] = (colTotals[w] || 0);
      });
    });

    filteredProductionData.forEach(row => {
      const bop = String(row[bopKey] || '').trim();
      const s = String(row[tinhTrangKey] || '').trim();
      const w = String(row[xuongKey] || '').trim();
      if (s && w) {
        const combinedKey = `${bop} ||| ${s}`;
        const val = calculateMetricValue(row, workshopMetric);
        if (matrix[combinedKey] && matrix[combinedKey][w] !== undefined) {
          matrix[combinedKey][w] += val;
          rowTotals[combinedKey] += val;
          colTotals[w] += val;
          grandTotal += val;

          if (bopTotals[bop] && bopTotals[bop][w] !== undefined) {
            bopTotals[bop][w] += val;
            bopRowTotals[bop] += val;
          }
        }
      }
    });
    return { uniqueWorkshops, rows, uniqueBops, bopTotals, bopRowTotals, matrix, rowTotals, colTotals, grandTotal };
  }, [filteredProductionData, tinhTrangKey, xuongKey, bopKey, workshopMetric, valueKey, realValueKey]);

  // -------------------------------------------------------------------------
  // Pivot: Funnel (BOP)
  // -------------------------------------------------------------------------
  const pivotFunnelData = useMemo(() => {
    if (!bopKey) return null;

    const agg: Record<string, number> = {};
    let total = 0;

    filteredProductionData.forEach(row => {
      const bop = String(row[bopKey] || 'Chưa xác định').trim();
      const s = String(row[tinhTrangKey] || '').trim();
      const w = String(row[xuongKey] || '').trim();

      if (s && w) {
        const val = calculateMetricValue(row, workshopMetric);
        agg[bop] = (agg[bop] || 0) + val;
        total += val;
      }
    });
    

    const bopOrder = ['P001', 'P002', 'P012', 'P013', 'GCVT', 'P014', 'P016', 'P018', 'P020', 'P021'];

    return {
      data: Object.entries(agg)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => {
          const indexA = bopOrder.indexOf(a.name);
          const indexB = bopOrder.indexOf(b.name);

          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;

          // Các BOP không có trong danh sách được xếp phía dưới, theo giá trị giảm dần
          return b.value - a.value;
        }),
      total,
    };
  }, [filteredProductionData, bopKey, workshopMetric, valueKey, realValueKey, tinhTrangKey, xuongKey]);

    // -------------------------------------------------------------------------
  // Breakdown theo Công trình cho TỪNG bước BOP (dùng khi user bấm vào 1 thanh
  // funnel để xem "P002 này nằm ở công trình nào, bao nhiêu"). Dùng CHUNG điều
  // kiện lọc (s && w) và cách tính giá trị (calculateMetricValue) với
  // pivotFunnelData ở trên, nên tổng theo công trình của 1 bước LUÔN khớp với
  // giá trị hiển thị trên thanh funnel của bước đó.
  // -------------------------------------------------------------------------
  const funnelBreakdownByBop = useMemo <
    Record<string, { data: { name: string; value: number }[]; total: number }>
  >(() => {
    const result: Record<string, { data: { name: string; value: number }[]; total: number }> = {};
    if (!bopKey || !congTrinhKey) return result;

    const agg: Record<string, Record<string, number>> = {}; // bop -> công trình -> value
    const totals: Record<string, number> = {};

    filteredProductionData.forEach(row => {
      const bop = String(row[bopKey] || 'Chưa xác định').trim();
      const s = String(row[tinhTrangKey] || '').trim();
      const w = String(row[xuongKey] || '').trim();
      if (!s || !w) return;

      const project = String(row[congTrinhKey] || 'Chưa xác định').trim();
      const val = calculateMetricValue(row, workshopMetric);

      if (!agg[bop]) agg[bop] = {};
      agg[bop][project] = (agg[bop][project] || 0) + val;
      totals[bop] = (totals[bop] || 0) + val;
    });

    Object.keys(agg).forEach(bop => {
      result[bop] = {
        data: Object.entries(agg[bop])
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value),
        total: totals[bop] || 0,
      };
    });

    return result;
  }, [filteredProductionData, bopKey, congTrinhKey, tinhTrangKey, xuongKey, workshopMetric]);

  // -------------------------------------------------------------------------
  // Custom funnel data (bao gồm P022. TỒN KHO)
  //
  // SỬA: P022 giờ lấy từ `stockDates` (kết quả /api/stock/dates — đã SUM sẵn ở
  // Postgres và đã lọc theo bộ lọc tổng hiện tại) thay vì quét `stockData` thô
  // (payload nặng từ /api/all-data). Nhờ vậy P022 hiển thị nhanh gần như Card 6
  // (cả hai giờ dùng chung 1 nguồn), không còn hiện "0" chờ payload nặng load.
  // -------------------------------------------------------------------------
  const customFunnelData = useMemo(() => {
    if (!pivotFunnelData || !pivotFunnelData.data) return [];

    const getVal = (bop: string) => pivotFunnelData.data.find(d => d.name === bop)?.value || 0;

    let p022Val = 0;
    if (closestStockDate) {
      const targetISO = toISODateLocal(closestStockDate);
      const entry = stockDates.find(s => {
        const d = parseVNDate(s.date) || new Date(s.date);
        return toISODateLocal(d) === targetISO;
      });
      p022Val = entry?.value ?? 0;
    }

    const funnelItems = [
      { id: 'P001', name: 'P001. TỔNG ĐƠN HÀNG NHÀ MÁY CÒN LẠI', value: getVal('P001'), color: '#3b82f6' },
      { id: 'P002', name: 'P002. Bản vẽ kỹ thuật', value: getVal('P002'), color: '#fdba74' },
      { id: 'P012', name: 'P012. Có phiếu chưa sản xuất', value: getVal('P012'), color: '#a3e635' },
      { id: 'P013', name: 'P013. Ra phôi sơ chế', value: getVal('P013'), color: '#a3e635' },
      { id: 'GCVT', name: 'P013. GCVT', value: getVal('GCVT'), color: '#a3e635' },
      { id: 'P014', name: 'P014. Tinh chỉnh định hình', value: getVal('P014'), color: '#a3e635' },
      { id: 'P016', name: 'P016. Lắp ráp tinh chỉnh', value: getVal('P016'), color: '#a3e635' },
      { id: 'P018', name: 'P018. Sơn - làm màu', value: getVal('P018'), color: '#a3e635' },
      { id: 'P020', name: 'P020. Lắp ráp hoàn thiện', value: getVal('P020'), color: '#a3e635' },
      { id: 'P021', name: 'P021. Đóng gói hoàn thành', value: getVal('P021'), color: '#a3e635' },
      { id: 'P022', name: 'P022. TỒN KHO', value: p022Val, color: '#eab308' },
    ];

    const maxVal = Math.max(...funnelItems.map(item => item.value), 1);

    return funnelItems.map(item => ({
      ...item,
      percentage: Math.max((item.value / maxVal) * 100, 2),
    }));
  }, [pivotFunnelData, stockDates, closestStockDate]);

  // -------------------------------------------------------------------------
  // Pivot: Project (Công trình x Tình trạng)
  // -------------------------------------------------------------------------
  const pivotProjectData = useMemo<ProjectPivotData | null>(() => {
    if (!congTrinhKey || !tinhTrangKey) return null;
    const dataToUse = excludeFabrics
      ? filteredProductionData.filter(r => {
          const hm = String(r[hangMucKey] || '').toLowerCase();
          return !hm.includes('vải') && !hm.includes('gối');
        })
      : filteredProductionData;
    const uniqueStatuses = Array.from(new Set(dataToUse.map(r => String(r[tinhTrangKey] || '').trim()).filter(Boolean))).sort();
    const uniqueProjects = Array.from(new Set(dataToUse.map(r => String(r[congTrinhKey] || '').trim()).filter(Boolean))).sort();
    const matrix: Record<string, Record<string, number>> = {};
    const rowTotals: Record<string, number> = {};
    const colTotals: Record<string, number> = {};
    let grandTotal = 0;
    uniqueProjects.forEach(p => { matrix[p] = {}; rowTotals[p] = 0; uniqueStatuses.forEach(s => { matrix[p][s] = 0; colTotals[s] = (colTotals[s] || 0); }); });
    dataToUse.forEach(row => {
      const p = String(row[congTrinhKey] || '').trim();
      const s = String(row[tinhTrangKey] || '').trim();
      if (p && s) {
        const val = calculateMetricValue(row, projectMetric);
        if (matrix[p] && matrix[p][s] !== undefined) { matrix[p][s] += val; rowTotals[p] += val; colTotals[s] += val; grandTotal += val; }
      }
    });
    return { uniqueProjects, uniqueStatuses, matrix, rowTotals, colTotals, grandTotal };
  }, [filteredProductionData, excludeFabrics, congTrinhKey, tinhTrangKey, hangMucKey, projectMetric, valueKey, realValueKey]);

  // -------------------------------------------------------------------------
  // Pivot: Material summary / status
  // -------------------------------------------------------------------------
  const pivotMaterialSummary = useMemo<MaterialSummaryPivotData | null>(() => {
    if (!matNhomVtKey) return null;
    const summary: Record<string, { req: number, rec: number }> = {};
    filteredMaterialData.forEach(row => {
      const group = String(row[matNhomVtKey] || 'Chưa phân nhóm').trim();
      if (!summary[group]) summary[group] = { req: 0, rec: 0 };
      summary[group].req += parseNumber(row[matSlYeuCauKey]);
      summary[group].rec += parseNumber(row[matSlDaNhanKey]);
    });
    const sortedGroups = Object.keys(summary).sort();
    const totalReq = Object.values(summary).reduce((a, b) => a + b.req, 0);
    const totalRec = Object.values(summary).reduce((a, b) => a + b.rec, 0);
    return { summary, sortedGroups, totalReq, totalRec };
  }, [filteredMaterialData, matNhomVtKey, matSlYeuCauKey, matSlDaNhanKey]);

  const pivotMaterialStatusData = useMemo<MaterialStatusPivotData | null>(() => {
    if (!matNhomVtKey || !matStatusKey) return null;
    const uniqueStatuses = Array.from(new Set(displayedMaterialData.map(r => String(r[matStatusKey] || '').trim()).filter(Boolean))).sort();
    const uniqueGroups = Array.from(new Set(displayedMaterialData.map(r => String(r[matNhomVtKey] || 'Chưa phân nhóm').trim()))).sort();
    const matrix: Record<string, Record<string, number>> = {};
    const rowTotals: Record<string, number> = {};
    const colTotals: Record<string, number> = {};
    let grandTotal = 0;
    uniqueGroups.forEach(g => { matrix[g] = {}; rowTotals[g] = 0; uniqueStatuses.forEach(s => { matrix[g][s] = 0; colTotals[s] = (colTotals[s] || 0); }); });
    displayedMaterialData.forEach(row => {
      const g = String(row[matNhomVtKey] || 'Chưa phân nhóm').trim();
      const s = String(row[matStatusKey] || '').trim();
      if (s) {
        const val = matStatusMetric === 'COUNT_PR' ? 1 : parseNumber(row[matSlYeuCauKey]);
        if (matrix[g] && matrix[g][s] !== undefined) { matrix[g][s] += val; rowTotals[g] += val; colTotals[s] += val; grandTotal += val; }
      }
    });
    return { sortedGroups: uniqueGroups, uniqueStatuses, matrix, rowTotals, colTotals, grandTotal };
  }, [displayedMaterialData, matNhomVtKey, matStatusKey, matStatusMetric, matSlYeuCauKey]);

  // -------------------------------------------------------------------------
  // Line chart (Biểu đồ Phân tích Tình trạng)
  // -------------------------------------------------------------------------
  const lineChartData = useMemo(() => {
    if (!tinhTrangKey) return [];
    const aggregated: Record<string, number> = {};
    filteredProductionData.forEach(row => {
      const status = String(row[tinhTrangKey] || '').trim();
      if (!status) return;
      const calculateVal = calculateMetricValue(row, chartMetric);
      aggregated[status] = (aggregated[status] || 0) + calculateVal;
    });
    return Object.entries(aggregated).map(([name, value]) => ({ name, value })).sort((a, b) => b.name.localeCompare(a.name));
  }, [filteredProductionData, tinhTrangKey, chartMetric, valueKey, realValueKey, hexKey]);

   return {
    workshopMetric, setWorkshopMetric,
    projectMetric, setProjectMetric,
    chartMetric, setChartMetric,
    projectSummaryMetric, setProjectSummaryMetric,
    matStatusMetric, setMatStatusMetric,
    excludeFabrics, setExcludeFabrics,
    expandedBops, setExpandedBops,
    bottleneckViewMode, setBottleneckViewMode,

    calculateMetricValue,
    cardMetrics,
    projectStatusSummary,
    onLineStageBreakdown,
    hexRowsByColumn,        // ← THÊM DÒNG NÀY
    pivotWorkshopData,
    pivotFunnelData,
    customFunnelData,
    pivotProjectData,
    pivotMaterialSummary,
    pivotMaterialStatusData,
    lineChartData,
    bottleneckData,
    topBottlenecks,
    funnelBreakdownByBop,
  };

}
