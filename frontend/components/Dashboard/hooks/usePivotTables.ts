import { useMemo, useState } from 'react';
import { DataRow } from '../../../types';
import { parseNumber } from '../utils/numberParsers';
import { doneValue, isStocked, isQtyComplete, remainValue, materialLineState } from '../../../utils/productionMetrics';
import { parseVNDate, toISODateLocal } from '../utils/dateHelpers';
import { extractStage } from '../core/stages';
import {
  hamGiaTri, remainBucketOf, tinhBottleneck, tinhTopBottlenecks, tinhCardMetrics, tinhProjectStatusSummary,
  tinhPivotWorkshop, tinhPivotFunnel, tinhFunnelBreakdownByBop, tinhPivotProject,
  type BottleneckViewMode, type ProjectSummaryMetric, type RemainBucket, type TongQuanSanXuat,
} from '../core/tongQuanSanXuat';
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

// Phần tính số theo bảng sản xuất nằm ở core/tongQuanSanXuat.ts (dùng chung với máy chủ tính sẵn màn đầu)
export type { BottleneckViewMode, ProjectSummaryMetric, RemainBucket } from '../core/tongQuanSanXuat';
export { remainBucketOf, projectNameOf, UNKNOWN_PROJECT } from '../core/tongQuanSanXuat';
export type MatStatusMetric = 'COUNT_PR' | 'SUM_QTY';

interface UsePivotTablesParams {
  filteredProductionData: DataRow[];

  // Dataset cho phễu "TÌNH TRẠNG ĐƠN HÀNG AATN" — theo Tình trạng IPO của trang, không ăn filters.tinhTrang.
  funnelProductionData: DataRow[];

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
  /**
   * Số máy chủ tính sẵn (/api/tong-quan/san-xuat) — dùng khi trình duyệt CHƯA có bảng sản xuất (người mới / máy
   * mới): màn đầu hiện ngay, bảng tải xong thì tự tính như cũ. null = luôn tự tính.
   */
  sanTuMayChu?: TongQuanSanXuat | null;
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
  /** Danh sách HEX cho phễu (cùng nguồn + nút Giá trị / Hạng mục của phễu), theo cột */
  funnelHexRowsByColumn: {
    totalOrder: DataRow[];
    afterCancel: DataRow[];
    notDeployed: DataRow[];
    p002: DataRow[]; // công đoạn P002
    onLine: DataRow[]; // P012 -> P021 (ON_LINE_STAGES)
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
// Hook
// ---------------------------------------------------------------------------

export function usePivotTables({
  filteredProductionData,
  funnelProductionData,
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
  sanTuMayChu = null,
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
  // Giá trị theo dòng (đơn HỦY = 0) — lõi dùng chung
  const khoa = {
    tinhTrangKey, tinhTrangIpoKey, xuongKey, bopKey, congTrinhKey, hangMucKey, daysAtCurrentStageKey,
    triGiaDonHangTongKey, thanhTienTinhPhieuKey, thanhTienNhapKhoKey,
  };
  const { calculateMetricValue } = hamGiaTri(khoa);
  // Chưa có bảng sản xuất mà có số máy chủ tính sẵn => dùng số máy chủ (cùng bộ lọc / nút đang chọn)
  const san = sanTuMayChu;

  // -------------------------------------------------------------------------
  // Bottleneck
  // -------------------------------------------------------------------------
  const bottleneckData = useMemo<BottleneckItem[]>(
    () => san?.bottleneckData ?? tinhBottleneck(filteredProductionData, khoa, bottleneckViewMode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [san, filteredProductionData, tinhTrangKey, daysAtCurrentStageKey, bottleneckViewMode, bopKey]);

  const topBottlenecks = useMemo<{ name: string; count: number }[]>(
    () => san?.topBottlenecks ?? tinhTopBottlenecks(filteredProductionData, khoa, bottleneckViewMode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [san, filteredProductionData, tinhTrangKey, daysAtCurrentStageKey, bottleneckViewMode, bopKey]);

  // -------------------------------------------------------------------------
  // Card metrics (Khả năng & Thành tiền)
  // -------------------------------------------------------------------------
  const cardMetrics = useMemo(
    () => san?.cardMetrics ?? tinhCardMetrics(filteredProductionData, khoa),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [san, filteredProductionData, tinhTrangKey, tinhTrangIpoKey, triGiaDonHangTongKey, thanhTienNhapKhoKey]);

  // -------------------------------------------------------------------------
  // Project status summary (bản gốc — dùng cho bảng LEGACY, ăn đầy đủ 4 filter)
  // -------------------------------------------------------------------------
  const projectStatusSummary = useMemo(
    () => san?.projectStatusSummary ?? tinhProjectStatusSummary(filteredProductionData, khoa, projectSummaryMetric),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [san, filteredProductionData, congTrinhKey, tinhTrangKey, tinhTrangIpoKey, bopKey, triGiaDonHangTongKey, thanhTienTinhPhieuKey, thanhTienNhapKhoKey, projectSummaryMetric]);

  // -------------------------------------------------------------------------
  // Danh sách HEX theo cột phễu (tổng / chưa triển khai / P002 / trên chuyền / nhập chưa đủ / đã nhập / hủy)
  // -------------------------------------------------------------------------
  // requireStatusArea: chỉ dòng có Tình trạng + Khu vực SX (đúng tập dòng phễu đếm)
  const buildHexRows = (sourceRows: DataRow[], isCountList: boolean, requireStatusArea = false) => {
    const totalOrder: DataRow[] = [];
    const afterCancel: DataRow[] = [];
    const notDeployed: DataRow[] = [];
    const p002: DataRow[] = [];
    const onLine: DataRow[] = [];
    const shortfall: DataRow[] = [];
    const inventory: DataRow[] = [];
    const cancelled: DataRow[] = [];
    const buckets: Record<RemainBucket, DataRow[]> = { notDeployed, p002, onLine, shortfall };

    if (congTrinhKey && tinhTrangKey) {
      // Giữ cả hạng mục không có tên công trình (dòng 'Chưa xác định' của phễu) — trước bỏ nên danh sách rỗng
      sourceRows.forEach(row => {
        if (requireStatusArea && !(String(row[tinhTrangKey] || '').trim() && xuongKey && String(row[xuongKey] || '').trim())) return;
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
  };
  // Danh sách HEX khi bấm số của PHỄU: cùng nguồn (funnelProductionData) và cùng nút Giá trị / Hạng mục của phễu
  // (workshopMetric) — trước dùng bản của bảng công trình (nút khác) nên số dòng lệch số trong ô
  const funnelHexRowsByColumn = useMemo(
    () => buildHexRows(funnelProductionData, workshopMetric === 'COUNT_HEX', true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [funnelProductionData, congTrinhKey, tinhTrangKey, tinhTrangIpoKey, bopKey, xuongKey, triGiaDonHangTongKey, thanhTienNhapKhoKey, workshopMetric]
  );

  // -------------------------------------------------------------------------
  // Pivot: Workshop (Tình Trạng x Khu vực sản xuất)
  // -------------------------------------------------------------------------
  const pivotWorkshopData = useMemo<WorkshopPivotData | null>(
    () => (san ? san.pivotWorkshopData : tinhPivotWorkshop(filteredProductionData, khoa, workshopMetric)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [san, filteredProductionData, tinhTrangKey, tinhTrangIpoKey, xuongKey, bopKey, workshopMetric, realValueKey, triGiaDonHangTongKey, thanhTienNhapKhoKey]);

  // -------------------------------------------------------------------------
  // Pivot: Funnel (BOP) — dùng funnelProductionData (theo Tình trạng IPO của trang,
  // KHÔNG ăn filters.tinhTrang) thay vì filteredProductionData.
  // -------------------------------------------------------------------------
  const pivotFunnelData = useMemo(
    () => (san ? san.pivotFunnelData : tinhPivotFunnel(funnelProductionData, khoa, workshopMetric)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [san, funnelProductionData, bopKey, workshopMetric, valueKey, realValueKey, tinhTrangKey, xuongKey, triGiaDonHangTongKey, thanhTienNhapKhoKey]);

  // -------------------------------------------------------------------------
  // Breakdown theo Công trình cho TỪNG bước BOP — SỬA: dùng funnelProductionData
  // để khớp với pivotFunnelData ở trên (cùng nguồn).
  // -------------------------------------------------------------------------
  const funnelBreakdownByBop = useMemo<Record<string, { data: { name: string; value: number }[]; total: number }>>(
    () => san?.funnelBreakdownByBop ?? tinhFunnelBreakdownByBop(funnelProductionData, khoa, workshopMetric),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [san, funnelProductionData, bopKey, congTrinhKey, tinhTrangKey, xuongKey, workshopMetric, triGiaDonHangTongKey, thanhTienNhapKhoKey]);

  // -------------------------------------------------------------------------
  // Custom funnel data (bao gồm P022. TỒN KHO)
  // -------------------------------------------------------------------------
  const customFunnelData = useMemo(() => {
    if (!pivotFunnelData || !pivotFunnelData.data) return [];

    const getVal = (bop: string) => pivotFunnelData.data.find(d => d.name === bop)?.value || 0;

    let p022Val = 0;
    // Tồn kho THỰC TẾ theo bảng tồn kho tại ngày gần nhất — khác cột "Tồn kho sau xuất kho" của bảng công trình
    // (= nhập kho − xuất kho lũy kế theo bảng sản xuất), nên ghi rõ ngày trên nhãn để không bị hiểu là cùng 1 số
    const p022Label = closestStockDate
      ? `P022. Tồn kho thực tế (${String(closestStockDate.getDate()).padStart(2, '0')}/${String(closestStockDate.getMonth() + 1).padStart(2, '0')})`
      : 'P022. Tồn kho thực tế';
    if (closestStockDate) {
      const targetISO = toISODateLocal(closestStockDate);
      const entry = stockDates.find(s => {
        const d = parseVNDate(s.date) || new Date(s.date);
        return toISODateLocal(d) === targetISO;
      });
      // Cùng đơn vị với các bước khác: đếm hạng mục thì lấy số hạng mục tồn kho (HEX), không thì giá trị
      p022Val = (workshopMetric === 'COUNT_HEX' ? entry?.count : entry?.value) ?? 0;
    }

    const funnelItems = [
      // Thanh P001 chỉ là phần chưa triển khai (công đoạn P001) — tổng còn lại = cộng các thanh P001…P021
      { id: 'P001', name: 'P001. Chưa triển khai', value: getVal('P001'), color: '#3b82f6' },
      { id: 'P002', name: 'P002. Bản vẽ kỹ thuật', value: getVal('P002'), color: '#fdba74' },
      { id: 'P012', name: 'P012. Có phiếu chưa sản xuất', value: getVal('P012'), color: '#a3e635' },
      { id: 'P013', name: 'P013. Ra phôi sơ chế', value: getVal('P013'), color: '#a3e635' },
      { id: 'GCVT', name: 'GCVT (sau P013)', value: getVal('GCVT'), color: '#a3e635' },
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
      { id: 'P022', name: p022Label, value: p022Val, color: '#eab308' },
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
  const pivotProjectData = useMemo<ProjectPivotData | null>(
    () => (san ? san.pivotProjectData : tinhPivotProject(filteredProductionData, khoa, projectMetric, excludeFabrics)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [san, filteredProductionData, excludeFabrics, congTrinhKey, tinhTrangKey, hangMucKey, projectMetric, tinhTrangIpoKey, realValueKey, triGiaDonHangTongKey, thanhTienNhapKhoKey]);

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
  // Dòng 3.ĐÃ NHẬP KHO nhưng PR đã ĐÓNG khi chưa nhận đủ (nhóm "Đã nhập kho – Đóng PR" ở tab BOM: nhận 1 phần / có PO chưa nhận / không PO)
  let closedShort = 0;
  uniqueGroups.forEach(g => { matrix[g] = {}; rowTotals[g] = 0; uniqueStatuses.forEach(s => { matrix[g][s] = 0; colTotals[s] = (colTotals[s] || 0); }); });
  filteredMaterialData.forEach(row => {
    const g = String(row[matNhomVtKey] || 'Chưa phân nhóm').trim();
    const s = String(row[matStatusKey] || '').trim();
    if (s) {
      const val = matStatusMetric === 'COUNT_PR' ? 1 : parseNumber(row[matSlYeuCauKey]);
      if (matrix[g] && matrix[g][s] !== undefined) { matrix[g][s] += val; rowTotals[g] += val; colTotals[s] += val; grandTotal += val; }
      { const st = materialLineState(row); if (st === 'closedPartial' || st === 'closedNoReceipt' || st === 'closedNoPo') closedShort++; }
    }
  });
  return { sortedGroups: uniqueGroups, uniqueStatuses, matrix, rowTotals, colTotals, grandTotal, closedShort };
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
  }, [filteredProductionData, tinhTrangKey, tinhTrangIpoKey, chartMetric, realValueKey, hexKey, triGiaDonHangTongKey, thanhTienNhapKhoKey]);

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
    funnelHexRowsByColumn,
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