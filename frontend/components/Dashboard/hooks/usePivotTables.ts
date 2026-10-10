import { useMemo, useState } from 'react';
import { DataRow } from '../../../types';
import { STATUS_GROUPS } from '../constants';
import { parseNumber } from '../utils/numberParsers';
import { doneValue, isCancelledIpo, isStocked, isQtyComplete, remainValue, dwellBucket, DWELL_KEYS, DWELL_STUCK } from '../../../utils/productionMetrics';
import { parseVNDate, toISODateLocal } from '../utils/dateHelpers';
import { ON_LINE_STAGES, P002_STAGE, extractStage } from '../components/modals/OnLineStageDetailModal';
import { BOP_STAGE_ORDER } from '../../../utils/productionMetrics';
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

  // Dataset cho phễu "TÌNH TRẠNG ĐƠN HÀNG AATN" — theo Tình trạng IPO của trang, không ăn filters.tinhTrang.
  funnelProductionData: DataRow[];

  // Dataset cho bảng "Tình trạng đơn hàng theo Công trình" (v2) —
  // theo Công trình + Khu vực SX + Tình trạng IPO của trang, không ăn ô Tình trạng.
  // Optional để không phá vỡ các nơi gọi cũ (vd. Dashboard.tsx không dùng bảng v2)
  // — nếu không truyền, mặc định fallback về filteredProductionData như hành vi cũ.
  projectSummaryProductionData?: DataRow[];

  filteredMaterialData: DataRow[];
  displayedMaterialData: DataRow[];

  // SỬA: thay cho stockData thô (nặng, tới từ /api/all-data) — dùng bảng đã
  // tổng hợp sẵn phía server (/api/stock/dates, qua useStockData), rất nhẹ và
  // đã TỰ ĐỘNG ăn theo bộ lọc tổng (congTrinh/xuong/tinhTrang/tinhTrangIpo).
  stockDates: { date: string; count: number; value: number }[];
  closestStockDate: Date | null;

  tinhTrangKey: string;
  tinhTrangIpoKey: string; 
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
  // MỚI: bản "v2" của projectStatusSummary — dùng cho ProjectSummarySection_v2,
  // nguồn từ projectSummaryProductionData (theo Tình trạng IPO của trang, không ăn ô Tình trạng).
  // ✅ MỚI: p002 = giá trị công đoạn P002 (cột "Chưa tính phiếu P002");
  //         onLine = giá trị đang trên chuyền CHỈ từ ON_LINE_STAGES (P012 -> P021).
  projectStatusSummaryV2: {
    name: string; totalOrder: number; deployed: number; ticketed: number; inProduction: number;
    inventory: number; cancelled: number; p002: number; onLine: number; shortfall: number;
    remaining: number; notDeployed: number; percentComplete: number;
  }[];
  onLineStageBreakdown: Record<string, Record<string, number>>;
  // MỚI: bản "v2" của onLineStageBreakdown, cùng nguồn với projectStatusSummaryV2.
  // Dạng: công trình -> công đoạn -> giá trị (chỉ các công đoạn trong ON_LINE_STAGES).
  onLineStageBreakdownV2: Record<string, Record<string, number>>;
  // ✅ MỚI: breakdown cho modal "Đang trên chuyền" theo KHU VỰC SẢN XUẤT.
  // Dạng: công trình -> khu vực sản xuất -> công đoạn -> giá trị.
  onLineAreaBreakdownV2: Record<string, Record<string, Record<string, number>>>;
  hexRowsByColumn: {
    totalOrder: DataRow[];
    afterCancel: DataRow[];
    notDeployed: DataRow[];
    onLine: DataRow[];
    remaining: DataRow[];
    inventory: DataRow[];
  };
  // MỚI: bản "v2" của hexRowsByColumn, cùng nguồn với projectStatusSummaryV2.
  hexRowsByColumnV2: {
    totalOrder: DataRow[];
    afterCancel: DataRow[];
    notDeployed: DataRow[];
    p002: DataRow[]; // ✅ MỚI: các dòng thuộc công đoạn P002 (đang sản xuất)
    onLine: DataRow[]; // ✅ ĐỔI: P012 -> P021 (ON_LINE_STAGES)
    shortfall: DataRow[]; // P022 / P025 nhưng nhập kho chưa đủ trị giá
    remaining: DataRow[];
    inventory: DataRow[];
    cancelled: DataRow[];
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

function isInProductionRow(statusUpper: string): boolean {
  return (
    !statusUpper.includes('15. CHƯA TRIỂN KHAI') &&
    !statusUpper.includes('14. CHƯA PHIẾU') &&
    !statusUpper.includes('11. CHƯA SX')
  );
}

// ✅ MỚI: tập công đoạn "đang trên chuyền" (P012 -> P021), dùng chung cho mọi nơi.
const ON_LINE_STAGE_SET = new Set<string>(ON_LINE_STAGES);

// ---------------------------------------------------------------------------
// Bảng "Tình trạng đơn hàng theo Công trình" (v2): phần CÒN LẠI của 1 hạng mục =
// trị giá đơn hàng - đã nhập kho (không âm), xếp vào đúng 1 cột theo công đoạn BOP:
//   P001 (hoặc tình trạng 15. CHƯA TRIỂN KHAI)  -> Chưa triển khai
//   P002                                         -> Chưa tính phiếu
//   GCVT, P012 -> P021                           -> Đang trên chuyền
//   còn lại (P022 / P025 nhưng nhập kho chưa đủ) -> Nhập kho chưa đủ
// => Tổng còn lại = tổng 4 cột = Tổng đơn hàng - Đã nhập kho (đơn HỦY không tính).
// ---------------------------------------------------------------------------
export type RemainBucket = 'notDeployed' | 'p002' | 'onLine' | 'shortfall';

export function remainBucketOf(statusUpper: string, stage: string | null): RemainBucket {
  if (statusUpper.includes('15. CHƯA TRIỂN KHAI') || stage === 'P001') return 'notDeployed';
  if (stage === P002_STAGE) return 'p002';
  if (stage && ON_LINE_STAGE_SET.has(stage)) return 'onLine';
  return 'shortfall';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePivotTables({
  filteredProductionData,
  funnelProductionData,
  projectSummaryProductionData,
  filteredMaterialData,
  stockDates,
  closestStockDate,

  tinhTrangKey,
  tinhTrangIpoKey,
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
}: UsePivotTablesParams): UsePivotTablesResult {
  // Fallback: nếu không truyền projectSummaryProductionData (vd. Dashboard.tsx
  // gốc không dùng bảng v2), dùng lại filteredProductionData như hành vi cũ.
  const projectSummaryData = projectSummaryProductionData ?? filteredProductionData;

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
  // Giá trị còn lại = gia_tri_don_hang_con_lai (đã = trị giá − đã nhập kho theo từng hạng mục),
  // riêng đơn HỦY tính 0 — cùng quy tắc với utils/productionMetrics.
  const isCancelledRow = (row: DataRow) => !!tinhTrangIpoKey && isCancelledIpo(row[tinhTrangIpoKey]);
  const calculateMetricValue = (row: DataRow, metric: MetricType): number => {
    // Đơn HỦY không tính cả khi ĐẾM (trước COUNT_HEX trả 1 trước khi xét HỦY => bỏ lọc IPO thì đếm cả HỦY)
    if (isCancelledRow(row)) return 0;
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

    // Nhóm thời gian dùng chung (utils/productionMetrics.dwellBucket): 4–7 tuần và "từ 8 tuần"
    // đều vào "Từ 4 tuần trở lên"; "0"/trống vào "Chưa có số ngày" để công đoạn không bị mất cột.
    const agg: Record<string, BottleneckItem> = {};
    filteredProductionData.forEach(row => {
      let status = '';
      if (bottleneckViewMode === 'BOP') {
        status = bopKey ? String(row[bopKey] || 'Chưa xác định').trim() : 'Chưa xác định';
        if (!status) status = 'Chưa xác định';
      } else {
        status = String(row[tinhTrangKey] || '').trim();
      }
      if (!status) return;
      if (!agg[status]) {
        agg[status] = { name: status } as BottleneckItem;
        DWELL_KEYS.forEach(k => { agg[status][k] = 0; });
      }
      const k = dwellBucket(row[daysAtCurrentStageKey]);
      agg[status][k] = ((agg[status][k] as number) || 0) + 1;
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
      if (status && dwellBucket(row[daysAtCurrentStageKey]) === DWELL_STUCK) {
        counts[status] = (counts[status] || 0) + 1;
      }
    });

    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      // Lấy 6: P001 (chờ triển khai bản vẽ) được tách ra ô riêng ở BottleneckSection, còn lại top 5 sản xuất
      .slice(0, 6);
  }, [filteredProductionData, tinhTrangKey, daysAtCurrentStageKey, bottleneckViewMode, bopKey]);

  // -------------------------------------------------------------------------
  // Card metrics (Khả năng & Thành tiền)
  // -------------------------------------------------------------------------
  const cardMetrics = useMemo(() => {
    const metrics = { coTheSX: 0, vecniFitting: 0, chuyenKhac: 0, coPhieuChuaSX: 0, chuaTheSX: 0, vuongSL: 0, chuaTrienKhai: 0 };
    if (!tinhTrangKey) return metrics;
    filteredProductionData.forEach(row => {
      const status = String(row[tinhTrangKey] || '').trim().toUpperCase();
      const val = isCancelledRow(row) ? 0 : parseNumber(row[valueKey]);
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
  }, [filteredProductionData, tinhTrangKey, tinhTrangIpoKey, valueKey]);

  // -------------------------------------------------------------------------
  // Project status summary (bản gốc — dùng cho bảng LEGACY, ăn đầy đủ 4 filter)
  // -------------------------------------------------------------------------
  const projectStatusSummary = useMemo(() => {
    if (!congTrinhKey || !triGiaDonHangTongKey) return [];
    const agg: Record<string, { totalOrder: number; deployed: number; ticketed: number; inProduction: number; inventory: number; remainingRaw: number; notDeployedRaw: number; }> = {};

    const isCount = projectSummaryMetric === 'COUNT';

    filteredProductionData.forEach(row => {
      const ctName = String(row[congTrinhKey] || '').trim();
      if (!ctName) return;
      // Bỏ HỦY TRƯỚC khi tạo dòng (trước công trình chỉ toàn đơn HỦY vẫn hiện thành dòng 0)
      if (isCancelledRow(row)) return;
      if (!agg[ctName]) agg[ctName] = { totalOrder: 0, deployed: 0, ticketed: 0, inProduction: 0, inventory: 0, remainingRaw: 0, notDeployedRaw: 0 };
      const status = String(row[tinhTrangKey] || '').toUpperCase();

      const totalOrderValRaw = parseNumber(row[triGiaDonHangTongKey]);
      const ticketValRaw = parseNumber(row[thanhTienTinhPhieuKey]);
      const inventoryValRaw = doneValue(totalOrderValRaw, parseNumber(row[thanhTienNhapKhoKey]));

      const totalOrderVal = isCount ? 1 : (totalOrderValRaw / 1000);

      agg[ctName].totalOrder += totalOrderVal;

      if (!status.includes('15. CHƯA TRIỂN KHAI')) {
        agg[ctName].deployed += totalOrderVal;
      }

      const valToAddTicket = isCount ? (ticketValRaw > 0 ? 1 : 0) : (ticketValRaw / 1000);

      if (!status.includes('15. CHƯA TRIỂN KHAI') && !status.includes('14. CHƯA PHIẾU')) {
        agg[ctName].ticketed += valToAddTicket;
      }

      // Đếm: "đã nhập kho" = nhập ĐỦ (cùng quy tắc isStocked với mọi view); giá trị: phần đã nhập
      // (đếm: nhập đủ số lượng cũng coi là đã nhập — isQtyComplete)
      const stockedItem = isStocked(totalOrderValRaw, parseNumber(row[thanhTienNhapKhoKey]), false, isQtyComplete(row));
      const rowRemainRaw = remainValue(totalOrderValRaw, parseNumber(row[thanhTienNhapKhoKey]));

      // Đang sản xuất = phần CÒN LẠI (trị giá − đã nhập) của hạng mục đã có phiếu — cùng cách tính cột
      // "Đang SX" của bảng v2. Trước cộng thành tiền tính phiếu nên tính cả phần đã nhập kho (vd 1.009 tỷ
      // trong khi phần còn lại đúng chỉ ~677 tỷ, lớn hơn cả cột Còn lại trừ Chưa triển khai)
      if (isInProductionRow(status)) {
        agg[ctName].inProduction += isCount
          ? (!stockedItem && rowRemainRaw > 0 ? 1 : 0)
          : rowRemainRaw / 1000;
      }
      // Chưa triển khai = phần CÒN LẠI của hạng mục P001 / "15. CHƯA TRIỂN KHAI" — cùng cách tính thanh P001 của
      // phễu (trước = trị giá đầy đủ, lệch phần đã nhập kho của hạng mục tình trạng 15)
      if (remainBucketOf(status, bopKey ? extractStage(row[bopKey]) : null) === 'notDeployed') {
        agg[ctName].notDeployedRaw += isCount
          ? (!stockedItem && rowRemainRaw > 0 ? 1 : 0)
          : rowRemainRaw / 1000;
      }
      const valToAddInventory = isCount
        ? (stockedItem ? 1 : 0)
        : (inventoryValRaw / 1000);
      agg[ctName].inventory += valToAddInventory;
      agg[ctName].remainingRaw += isCount
        ? (!stockedItem && remainValue(totalOrderValRaw, parseNumber(row[thanhTienNhapKhoKey])) > 0 ? 1 : 0)
        : remainValue(totalOrderValRaw, parseNumber(row[thanhTienNhapKhoKey])) / 1000;
    });
    return Object.entries(agg).map(([name, data]) => ({
      name, ...data,
      remaining: data.remainingRaw,
      notDeployed: data.notDeployedRaw,
      percentComplete: data.totalOrder > 0 ? (data.inventory / data.totalOrder) * 100 : 0,
    })).sort((a, b) => b.totalOrder - a.totalOrder);
  }, [filteredProductionData, congTrinhKey, tinhTrangKey, tinhTrangIpoKey, bopKey, triGiaDonHangTongKey, thanhTienTinhPhieuKey, thanhTienNhapKhoKey, projectSummaryMetric]);

  // -------------------------------------------------------------------------
  // MỚI: Project status summary — bản "v2" dùng cho ProjectSummarySection_v2.
  // Nguồn: projectSummaryData (Công trình + Khu vực SX + Tình trạng IPO, KHÔNG ăn
  // ô Tình trạng). Còn lại = trị giá − đã nhập kho từng hạng mục (utils/productionMetrics).
  // ✅ MỚI: tách p002 và onLine (P012 -> P021) — cùng điều kiện với
  // onLineStageBreakdownV2 (dòng "đang sản xuất" + công đoạn lấy từ bopKey,
  // giá trị = thành tiền tính phiếu) nên hai nơi luôn khớp nhau.
  // -------------------------------------------------------------------------
  const projectStatusSummaryV2 = useMemo(() => {
    if (!congTrinhKey || !triGiaDonHangTongKey) return [];
    const agg: Record<string, {
      totalOrder: number; deployed: number; ticketed: number; inProduction: number; inventory: number;
      cancelled: number; notDeployed: number; p002: number; onLine: number; shortfall: number;
    }> = {};

    const isCount = projectSummaryMetric === 'COUNT';

    projectSummaryData.forEach(row => {
      const ctName = String(row[congTrinhKey] || '').trim();
      if (!ctName) return;
      if (!agg[ctName]) {
        agg[ctName] = {
          totalOrder: 0, deployed: 0, ticketed: 0, inProduction: 0, inventory: 0,
          cancelled: 0, notDeployed: 0, p002: 0, onLine: 0, shortfall: 0,
        };
      }
      const a = agg[ctName];
      const status = String(row[tinhTrangKey] || '').toUpperCase();
      const statusIpo = String(row[tinhTrangIpoKey] || '').toUpperCase();

      const totalOrderValRaw = parseNumber(row[triGiaDonHangTongKey]);
      const inventoryValRaw = thanhTienNhapKhoKey ? doneValue(totalOrderValRaw, parseNumber(row[thanhTienNhapKhoKey])) : 0;
      const totalOrderVal = isCount ? 1 : (totalOrderValRaw / 1000);

      // Đơn HỦY: chỉ ghi nhận riêng, không tính vào tổng đơn hàng / còn lại
      if (statusIpo.includes('HỦY')) {
        a.cancelled += totalOrderVal;
        return;
      }

      a.totalOrder += totalOrderVal;
      if (!status.includes('15. CHƯA TRIỂN KHAI')) a.deployed += totalOrderVal;
      // Đếm: "đã nhập kho" = nhập ĐỦ (isStocked) — hạng mục nhập 1 phần nằm ở "còn lại"
      const qtyDone = isQtyComplete(row);
      a.inventory += isCount ? (isStocked(totalOrderValRaw, inventoryValRaw, false, qtyDone) ? 1 : 0) : (inventoryValRaw / 1000);

      const remainRaw = totalOrderValRaw - inventoryValRaw;
      if (remainRaw <= 0) return;
      // Đếm: hạng mục đã nhập đủ số lượng không tính là còn lại (giá trị vẫn tính phần lệch)
      if (isCount && qtyDone) return;
      const remainVal = isCount ? 1 : remainRaw / 1000;
      const stage = bopKey ? extractStage(row[bopKey]) : null;
      a[remainBucketOf(status, stage)] += remainVal;
      if (isInProductionRow(status)) a.inProduction += remainVal;
    });

    return Object.entries(agg).map(([name, data]) => ({
      name, ...data,
      remaining: data.notDeployed + data.p002 + data.onLine + data.shortfall,
      percentComplete: data.totalOrder > 0 ? (data.inventory / data.totalOrder) * 100 : 0,
    })).sort((x, y) => y.totalOrder - x.totalOrder);
  }, [projectSummaryData, congTrinhKey, tinhTrangKey, tinhTrangIpoKey, bopKey, triGiaDonHangTongKey, thanhTienNhapKhoKey, projectSummaryMetric]);

  // -------------------------------------------------------------------------
  // Breakdown "Đang trên chuyền" theo từng mã BOP — bản gốc (legacy)
  // (dùng ON_LINE_STAGES mới: P012 -> P021)
  // -------------------------------------------------------------------------
  const onLineStageBreakdown = useMemo<Record<string, Record<string, number>>>(() => {
    const breakdown: Record<string, Record<string, number>> = {};
    if (!congTrinhKey || !tinhTrangKey || !bopKey || !thanhTienTinhPhieuKey) return breakdown;

    const isCount = projectSummaryMetric === 'COUNT';

    filteredProductionData.forEach(row => {
      const ctName = String(row[congTrinhKey] || '').trim();
      if (!ctName) return;

      const status = String(row[tinhTrangKey] || '').toUpperCase();
      if (!isInProductionRow(status)) return;

      const stage = extractStage(row[bopKey]);
      if (!stage || !ON_LINE_STAGE_SET.has(stage)) return;

      const ticketValRaw = parseNumber(row[thanhTienTinhPhieuKey]);
      const valToAdd = isCount ? (ticketValRaw > 0 ? 1 : 0) : (ticketValRaw / 1000);

      if (!breakdown[ctName]) breakdown[ctName] = {};
      breakdown[ctName][stage] = (breakdown[ctName][stage] || 0) + valToAdd;
    });

    return breakdown;
  }, [filteredProductionData, congTrinhKey, tinhTrangKey, bopKey, thanhTienTinhPhieuKey, projectSummaryMetric]);

  // -------------------------------------------------------------------------
  // MỚI: Breakdown "Đang trên chuyền" — bản "v2", cùng nguồn với
  // projectStatusSummaryV2. Dạng: công trình -> công đoạn -> giá trị.
  // -------------------------------------------------------------------------
  const onLineStageBreakdownV2 = useMemo<Record<string, Record<string, number>>>(() => {
    const breakdown: Record<string, Record<string, number>> = {};
    if (!congTrinhKey || !tinhTrangKey || !bopKey || !triGiaDonHangTongKey) return breakdown;

    const isCount = projectSummaryMetric === 'COUNT';

    projectSummaryData.forEach(row => {
      const ctName = String(row[congTrinhKey] || '').trim();
      if (!ctName) return;

      const status = String(row[tinhTrangKey] || '').toUpperCase();
      if (String(row[tinhTrangIpoKey] || '').toUpperCase().includes('HỦY')) return;

      const stage = extractStage(row[bopKey]);
      if (!stage || remainBucketOf(status, stage) !== 'onLine') return;

      // Cùng cách tính với cột "Đang trên chuyền": phần chưa nhập kho của hạng mục
      const remainRaw = remainValue(
        parseNumber(row[triGiaDonHangTongKey]), thanhTienNhapKhoKey ? parseNumber(row[thanhTienNhapKhoKey]) : 0);
      if (remainRaw <= 0) return;
      if (isCount && isQtyComplete(row)) return; // đếm: đủ số lượng = đã nhập kho
      const valToAdd = isCount ? 1 : remainRaw / 1000;

      if (!breakdown[ctName]) breakdown[ctName] = {};
      breakdown[ctName][stage] = (breakdown[ctName][stage] || 0) + valToAdd;
    });

    return breakdown;
  }, [projectSummaryData, congTrinhKey, tinhTrangKey, tinhTrangIpoKey, bopKey, triGiaDonHangTongKey, thanhTienNhapKhoKey, projectSummaryMetric]);

  // -------------------------------------------------------------------------
  // ✅ MỚI: Breakdown "Đang trên chuyền" theo KHU VỰC SẢN XUẤT cho modal.
  // Công trình -> Khu vực sản xuất -> Công đoạn -> giá trị.
  // Cách dùng ở component cha (rows cho OnLineStageDetailModal):
  //   - Bấm 1 công trình: areas = onLineAreaBreakdownV2[projectName]
  //   - Bấm TỔNG CỘNG (null): gộp tất cả công trình theo khu vực.
  // -------------------------------------------------------------------------
  const onLineAreaBreakdownV2 = useMemo<Record<string, Record<string, Record<string, number>>>>(() => {
    const breakdown: Record<string, Record<string, Record<string, number>>> = {};
    if (!congTrinhKey || !tinhTrangKey || !bopKey || !triGiaDonHangTongKey) return breakdown;

    const isCount = projectSummaryMetric === 'COUNT';

    projectSummaryData.forEach(row => {
      const ctName = String(row[congTrinhKey] || '').trim();
      if (!ctName) return;

      const status = String(row[tinhTrangKey] || '').toUpperCase();
      if (String(row[tinhTrangIpoKey] || '').toUpperCase().includes('HỦY')) return;

      const stage = extractStage(row[bopKey]);
      if (!stage || remainBucketOf(status, stage) !== 'onLine') return;

      const area = (xuongKey ? String(row[xuongKey] || '').trim() : '') || 'Chưa xác định';

      // Cùng cách tính với cột "Đang trên chuyền": phần chưa nhập kho của hạng mục
      const remainRaw = remainValue(
        parseNumber(row[triGiaDonHangTongKey]), thanhTienNhapKhoKey ? parseNumber(row[thanhTienNhapKhoKey]) : 0);
      if (remainRaw <= 0) return;
      if (isCount && isQtyComplete(row)) return; // đếm: đủ số lượng = đã nhập kho
      const valToAdd = isCount ? 1 : remainRaw / 1000;

      if (!breakdown[ctName]) breakdown[ctName] = {};
      if (!breakdown[ctName][area]) breakdown[ctName][area] = {};
      breakdown[ctName][area][stage] = (breakdown[ctName][area][stage] || 0) + valToAdd;
    });

    return breakdown;
  }, [projectSummaryData, congTrinhKey, tinhTrangKey, tinhTrangIpoKey, bopKey, xuongKey, triGiaDonHangTongKey, thanhTienNhapKhoKey, projectSummaryMetric]);

  // -------------------------------------------------------------------------
  // Chi tiết theo Hex — bản gốc (legacy)
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
      afterCancel: totalOrder,
      notDeployed,
      onLine,
      remaining: [...notDeployed, ...onLine],
      inventory,
    };
  }, [filteredProductionData, congTrinhKey, tinhTrangKey, thanhTienNhapKhoKey]);

  // -------------------------------------------------------------------------
  // MỚI: Chi tiết theo Hex — bản "v2", cùng nguồn với projectStatusSummaryV2
  // (dùng cho HexDetailModal mở từ bảng ProjectSummarySection_v2).
  // ✅ MỚI: p002 (công đoạn P002) và onLine (P012 -> P021). "remaining"
  // giữ nguyên = chưa triển khai + toàn bộ dòng đang sản xuất, để không sót
  // dòng nào (vd. P012) khi tách cột.
  // -------------------------------------------------------------------------
  const hexRowsByColumnV2 = useMemo(() => {
    const totalOrder: DataRow[] = [];
    const afterCancel: DataRow[] = [];
    const notDeployed: DataRow[] = [];
    const p002: DataRow[] = [];
    const onLine: DataRow[] = [];
    const shortfall: DataRow[] = [];
    const inventory: DataRow[] = [];
    const cancelled: DataRow[] = [];
    const buckets: Record<RemainBucket, DataRow[]> = { notDeployed, p002, onLine, shortfall };

    const isCountList = projectSummaryMetric === 'COUNT';
    if (congTrinhKey && tinhTrangKey) {
      projectSummaryData.forEach(row => {
        const ctName = String(row[congTrinhKey] || '').trim();
        if (!ctName) return;
        const status = String(row[tinhTrangKey] || '').toUpperCase();
        const statusIpo = String(row[tinhTrangIpoKey] || '').toUpperCase();

        // Đơn HỦY không nằm trong tổng đơn hàng / còn lại (khớp số trên bảng)
        if (statusIpo.includes('HỦY')) {
          cancelled.push(row);
          return;
        }
        totalOrder.push(row);
        afterCancel.push(row);

        const invVal = thanhTienNhapKhoKey ? parseNumber(row[thanhTienNhapKhoKey]) : 0;
        const totalVal = triGiaDonHangTongKey ? parseNumber(row[triGiaDonHangTongKey]) : 0;
        // Chế độ ĐẾM: danh sách khớp đúng số trong ô — "nhập kho" = hạng mục nhập đủ (giá trị hoặc số lượng),
        // "còn lại" bỏ hạng mục đã nhập đủ số lượng. Chế độ giá trị: hạng mục có phần đã nhập / còn lại.
        const stockedItem = isStocked(totalVal, invVal, false, isQtyComplete(row));
        if (isCountList ? stockedItem : doneValue(totalVal, invVal) > 0) inventory.push(row);
        if (remainValue(totalVal, invVal) <= 0) return; // đã nhập kho đủ -> không còn lại
        if (isCountList && stockedItem) return;
        const stage = bopKey ? extractStage(row[bopKey]) : null;
        buckets[remainBucketOf(status, stage)].push(row);
      });
    }

    return {
      totalOrder,
      afterCancel,
      notDeployed,
      p002,
      onLine,
      shortfall,
      // Khớp cột "Tổng" còn lại = 4 cột con
      remaining: [...notDeployed, ...p002, ...onLine, ...shortfall],
      inventory,
      cancelled,
    };
  }, [projectSummaryData, congTrinhKey, tinhTrangKey, tinhTrangIpoKey, bopKey, triGiaDonHangTongKey, thanhTienNhapKhoKey, projectSummaryMetric]);

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
  // Pivot: Funnel (BOP) — dùng funnelProductionData (theo Tình trạng IPO của trang,
  // KHÔNG ăn filters.tinhTrang) thay vì filteredProductionData.
  // -------------------------------------------------------------------------
  // Phễu = phần CÒN LẠI theo công đoạn: khi ĐẾM chỉ đếm hạng mục chưa nhập kho đủ (đủ giá trị hoặc đủ số
  // lượng thì bỏ) — khớp chế độ giá trị (hạng mục đã nhập đủ có giá trị còn lại 0)
  const funnelValue = (row: DataRow): number => {
    // Giá trị còn lại theo quy tắc chung (trị giá − đã nhập, chặn [0, trị giá]) — không đọc thẳng cột
    // gia_tri_don_hang_con_lai (sai khi nhập kho âm)
    if (workshopMetric === 'SUM_GT_CON_LAI') {
      if (isCancelledRow(row)) return 0;
      return remainValue(parseNumber(row[triGiaDonHangTongKey]), thanhTienNhapKhoKey ? parseNumber(row[thanhTienNhapKhoKey]) : 0);
    }
    if (workshopMetric !== 'COUNT_HEX') return calculateMetricValue(row, workshopMetric);
    if (isCancelledRow(row)) return 0;
    const total = parseNumber(row[triGiaDonHangTongKey]);
    const nk = thanhTienNhapKhoKey ? parseNumber(row[thanhTienNhapKhoKey]) : 0;
    return isStocked(total, nk, false, isQtyComplete(row)) ? 0 : 1;
  };

  const pivotFunnelData = useMemo(() => {
    if (!bopKey) return null;

    const agg: Record<string, number> = {};
    let total = 0;

    funnelProductionData.forEach(row => {
      const bop = String(row[bopKey] || 'Chưa xác định').trim();
      const s = String(row[tinhTrangKey] || '').trim();
      const w = String(row[xuongKey] || '').trim();

      if (s && w) {
        const val = funnelValue(row);
        agg[bop] = (agg[bop] || 0) + val;
        total += val;
      }
    });


    const bopOrder: readonly string[] = BOP_STAGE_ORDER;

    return {
      data: Object.entries(agg)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => {
          const indexA = bopOrder.indexOf(a.name);
          const indexB = bopOrder.indexOf(b.name);

          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;

          return b.value - a.value;
        }),
      total,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnelProductionData, bopKey, workshopMetric, valueKey, realValueKey, tinhTrangKey, xuongKey, triGiaDonHangTongKey, thanhTienNhapKhoKey]);

  // -------------------------------------------------------------------------
  // Breakdown theo Công trình cho TỪNG bước BOP — SỬA: dùng funnelProductionData
  // để khớp với pivotFunnelData ở trên (cùng nguồn).
  // -------------------------------------------------------------------------
  const funnelBreakdownByBop = useMemo <
    Record<string, { data: { name: string; value: number }[]; total: number }>
  >(() => {
    const result: Record<string, { data: { name: string; value: number }[]; total: number }> = {};
    if (!bopKey || !congTrinhKey) return result;

    const agg: Record<string, Record<string, number>> = {}; // bop -> công trình -> value
    const totals: Record<string, number> = {};

    funnelProductionData.forEach(row => {
      const bop = String(row[bopKey] || 'Chưa xác định').trim();
      const s = String(row[tinhTrangKey] || '').trim();
      const w = String(row[xuongKey] || '').trim();
      if (!s || !w) return;

      const project = String(row[congTrinhKey] || 'Chưa xác định').trim();
      const val = funnelValue(row);

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
    // Thanh gộp "P022/P025. Nhập kho chưa đủ" của phễu: chi tiết = cộng 2 công đoạn
    const short: Record<string, number> = {};
    ['P022', 'P025'].forEach(bop => Object.entries(agg[bop] ?? {}).forEach(([name, v]) => { short[name] = (short[name] || 0) + v; }));
    if (Object.keys(short).length) {
      result.P022_SHORT = {
        data: Object.entries(short).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
        total: (totals.P022 || 0) + (totals.P025 || 0),
      };
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnelProductionData, bopKey, congTrinhKey, tinhTrangKey, xuongKey, workshopMetric, triGiaDonHangTongKey, thanhTienNhapKhoKey]);

  // -------------------------------------------------------------------------
  // Custom funnel data (bao gồm P022. TỒN KHO)
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
      // Cùng đơn vị với các bước khác: đếm hạng mục thì lấy số mã tồn kho, không thì giá trị
      p022Val = (workshopMetric === 'COUNT_HEX' ? entry?.count : entry?.value) ?? 0;
    }

    const funnelItems = [
      // Thanh P001 chỉ là phần chưa triển khai (công đoạn P001) — tổng còn lại = cộng các thanh P001…P021
      { id: 'P001', name: 'P001. Chưa triển khai', value: getVal('P001'), color: '#3b82f6' },
      { id: 'P002', name: 'P002. Bản vẽ kỹ thuật', value: getVal('P002'), color: '#fdba74' },
      { id: 'P012', name: 'P012. Có phiếu chưa sản xuất', value: getVal('P012'), color: '#a3e635' },
      { id: 'P013', name: 'P013. Ra phôi sơ chế', value: getVal('P013'), color: '#a3e635' },
      { id: 'GCVT', name: 'P013. GCVT', value: getVal('GCVT'), color: '#a3e635' },
      { id: 'P014', name: 'P014. Tinh chỉnh định hình', value: getVal('P014'), color: '#a3e635' },
      { id: 'P016', name: 'P016. Lắp ráp tinh chỉnh', value: getVal('P016'), color: '#a3e635' },
      { id: 'P018', name: 'P018. Sơn - làm màu', value: getVal('P018'), color: '#a3e635' },
      { id: 'P020', name: 'P020. Lắp ráp hoàn thiện', value: getVal('P020'), color: '#a3e635' },
      { id: 'P021', name: 'P021. Đóng gói hoàn thành', value: getVal('P021'), color: '#a3e635' },
      // Hạng mục đã ở P022 / P025 mà chưa nhập kho đủ (chỉ có khi bộ lọc IPO gồm HOÀN THÀNH…) — trước không có
      // thanh nên tổng các thanh nhỏ hơn tổng phễu
      ...(getVal('P022') + getVal('P025') > 0
        ? [{ id: 'P022_SHORT', name: 'P022/P025. Nhập kho chưa đủ', value: getVal('P022') + getVal('P025'), color: '#c4b5fd' }]
        : []),
      { id: 'P022', name: 'P022. TỒN KHO', value: p022Val, color: '#eab308' },
    ];

    const maxVal = Math.max(...funnelItems.map(item => item.value), 1);

    return funnelItems.map(item => ({
      ...item,
      percentage: Math.max((item.value / maxVal) * 100, 2),
    }));
  }, [pivotFunnelData, stockDates, closestStockDate, workshopMetric]);

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
  const uniqueStatuses = Array.from(new Set(filteredMaterialData.map(r => String(r[matStatusKey] || '').trim()).filter(Boolean))).sort();
  const uniqueGroups = Array.from(new Set(filteredMaterialData.map(r => String(r[matNhomVtKey] || 'Chưa phân nhóm').trim()))).sort();
  const matrix: Record<string, Record<string, number>> = {};
  const rowTotals: Record<string, number> = {};
  const colTotals: Record<string, number> = {};
  let grandTotal = 0;
  uniqueGroups.forEach(g => { matrix[g] = {}; rowTotals[g] = 0; uniqueStatuses.forEach(s => { matrix[g][s] = 0; colTotals[s] = (colTotals[s] || 0); }); });
  filteredMaterialData.forEach(row => {
    const g = String(row[matNhomVtKey] || 'Chưa phân nhóm').trim();
    const s = String(row[matStatusKey] || '').trim();
    if (s) {
      const val = matStatusMetric === 'COUNT_PR' ? 1 : parseNumber(row[matSlYeuCauKey]);
      if (matrix[g] && matrix[g][s] !== undefined) { matrix[g][s] += val; rowTotals[g] += val; colTotals[s] += val; grandTotal += val; }
    }
  });
  return { sortedGroups: uniqueGroups, uniqueStatuses, matrix, rowTotals, colTotals, grandTotal };
}, [filteredMaterialData, matNhomVtKey, matStatusKey, matStatusMetric, matSlYeuCauKey]);

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
    projectStatusSummaryV2,
    onLineStageBreakdown,
    onLineStageBreakdownV2,
    onLineAreaBreakdownV2,
    hexRowsByColumn,
    hexRowsByColumnV2,
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