import { useState } from 'react';
import JSZip from 'jszip';
import { DataRow, ColumnDefinition } from '../../../types';
import { ExportFlowType, BottleneckItem } from '../types';
import { rowsToCsvString, mapRowsToLabeledCsvRows } from '../utils/csvExport';
import { toISODateLocal, parseVNDate, computeMonthRows } from '../utils/dateHelpers';
import {
  exportToCSV,
  API_BASE_URL,
  type GroupAnalysisRow,
  type OverviewSummary,
  type StockDateEntry,
} from '../../../services/dataService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportScope = 'FILTERED' | 'MTD' | 'ALL';

interface StockByProjectRowLike {
  name: string;
  count: number;
  value: number;
}

interface UseExportFlowsParams {
  orderColumns: ColumnDefinition[];
  orderData: DataRow[];
  tkbvColumns: ColumnDefinition[];
  tkbvData: DataRow[];
  pthspColumns: ColumnDefinition[];
  pthspData: DataRow[];
  inventoryColumns: ColumnDefinition[];
  inventoryData: DataRow[];
  exportColumns: ColumnDefinition[];
  exportData: DataRow[];
  stockColumns: ColumnDefinition[];
  stockData: DataRow[];
  productionColumns: ColumnDefinition[];

  // MỚI: cần để lọc theo tháng bất kỳ khi xuất lũy kế tháng tùy chọn
  orderDateKey: string;
  tkbvDateKey: string;
  pthspDateKey: string;
  invDateKey: string;
  expDateKey: string;

  stockDateKey: string;
  stockDates: StockDateEntry[];
  stockTotalCount: number;

  overviewSummary: OverviewSummary | null;
  overviewDateFilters: string[];
  groupAnalysisCache: Record<string, GroupAnalysisRow[]>;
  latestUnifiedDate: Date | null;

  filteredOrderData: DataRow[];
  filteredTkbvData: DataRow[];
  filteredPthspData: DataRow[];
  filteredInventoryOverviewData: DataRow[];
  filteredExportOverviewData: DataRow[];
  filteredStockDataForExport: DataRow[];
  mtdOrderData: DataRow[];
  mtdTkbvData: DataRow[];
  mtdPthspData: DataRow[];
  mtdInventoryData: DataRow[];
  mtdExportKhoData: DataRow[];
  mtdStockData: DataRow[];

  stockByProjectData: StockByProjectRowLike[];
  stockMetric: 'COUNT' | 'SUM';
  closestStockDate: Date | null;

  bottleneckData: BottleneckItem[];
}

interface ExportFlowConfig {
  title: string;
  rawData: DataRow[];
  filteredData: DataRow[];
  mtdData: DataRow[];
  columns: ColumnDefinition[];
  filePrefix: string;
  color: string;
  displayCount?: number;
}

const normalizeToISODate = (raw: string): string => {
  const parsed = parseVNDate(raw) || new Date(raw);
  return toISODateLocal(parsed);
};

// MỚI: tìm mốc tồn kho gần nhất tính đến hết 1 tháng chỉ định (dùng khi xuất
// lũy kế tháng tùy chọn — tồn kho là snapshot nên không "lũy kế" như 5 nguồn
// còn lại, phải quy về đúng 1 ngày chụp gần nhất trong/trước tháng đó).
const findClosestStockDateInMonth = (
  stockDates: StockDateEntry[],
  year: number,
  month: number
): string | null => {
  const monthEnd = new Date(year, month, 0); // ngày cuối cùng của tháng
  const match = stockDates.find(s => {
    const d = parseVNDate(s.date) || new Date(s.date);
    return d.getTime() <= monthEnd.getTime();
  });
  return match ? normalizeToISODate(match.date) : null;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useExportFlows({
  orderColumns, orderData,
  tkbvColumns, tkbvData,
  pthspColumns, pthspData,
  inventoryColumns, inventoryData,
  exportColumns, exportData,
  stockColumns, stockData,
  productionColumns,

  orderDateKey,
  tkbvDateKey,
  pthspDateKey,
  invDateKey,
  expDateKey,

  stockDateKey,
  stockDates,
  stockTotalCount,

  overviewSummary,
  overviewDateFilters,
  groupAnalysisCache,
  latestUnifiedDate,

  filteredOrderData,
  filteredTkbvData,
  filteredPthspData,
  filteredInventoryOverviewData,
  filteredExportOverviewData,
  filteredStockDataForExport,
  mtdOrderData,
  mtdTkbvData,
  mtdPthspData,
  mtdInventoryData,
  mtdExportKhoData,
  mtdStockData,

  stockByProjectData,
  stockMetric,
  closestStockDate,

  bottleneckData,
}: UseExportFlowsParams) {
  const [selectedExportColumns, setSelectedExportColumns] = useState<string[]>([]);
  const [isProductionExportModalOpen, setIsProductionExportModalOpen] = useState(false);
  const [isOrderExportScopeModalOpen, setIsOrderExportScopeModalOpen] = useState(false);
  const [orderExportScope, setOrderExportScope] = useState<ExportScope>('FILTERED');
  const [isOrderExportModalOpen, setIsOrderExportModalOpen] = useState(false);
  const [selectedOrderExportColumns, setSelectedOrderExportColumns] = useState<string[]>([]);
  const [genericExportFlow, setGenericExportFlow] = useState<ExportFlowType | null>(null);
  const [genericExportScope, setGenericExportScope] = useState<ExportScope>('FILTERED');
  const [isGenericExportScopeModalOpen, setIsGenericExportScopeModalOpen] = useState(false);
  const [isGenericExportColumnModalOpen, setIsGenericExportColumnModalOpen] = useState(false);
  const [genericExportSelectedColumns, setGenericExportSelectedColumns] = useState<string[]>([]);
  const [isOverviewExportScopeModalOpen, setIsOverviewExportScopeModalOpen] = useState(false);
  const [overviewExportScope, setOverviewExportScope] = useState<ExportScope>('FILTERED');

  // MỚI: tháng được chọn khi xuất "lũy kế tháng" trong báo cáo tổng hợp 6 chỉ số.
  // Định dạng "YYYY-MM". Mặc định là tháng của latestUnifiedDate.
  const [selectedExportMonth, setSelectedExportMonth] = useState<string>(() => {
    const d = latestUnifiedDate ?? new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [selectedStockExportDates, setSelectedStockExportDates] = useState<string[]>([]);

  // -------------------------------------------------------------------------
  // Effective columns
  // -------------------------------------------------------------------------
  const effectiveOrderColumns = (orderColumns && orderColumns.length > 0)
    ? orderColumns
    : (orderData && orderData.length > 0
        ? Object.keys(orderData[0]).filter(k => k && k.trim() !== '').map(k => ({ key: k, label: k, type: 'string' as const }))
        : []);

  const effectiveTkbvColumns = (tkbvColumns && tkbvColumns.length > 0)
    ? tkbvColumns
    : (tkbvData && tkbvData.length > 0
        ? Object.keys(tkbvData[0]).filter(k => k && k.trim() !== '').map(k => ({ key: k, label: k, type: 'string' as const }))
        : []);

  const effectivePthspColumns = (pthspColumns && pthspColumns.length > 0)
    ? pthspColumns
    : (pthspData && pthspData.length > 0
        ? Object.keys(pthspData[0]).filter(k => k && k.trim() !== '').map(k => ({ key: k, label: k, type: 'string' as const }))
        : []);

  const effectiveInventoryColumns = (inventoryColumns && inventoryColumns.length > 0)
    ? inventoryColumns
    : (inventoryData && inventoryData.length > 0
        ? Object.keys(inventoryData[0]).filter(k => k && k.trim() !== '').map(k => ({ key: k, label: k, type: 'string' as const }))
        : []);

  const effectiveExportDataColumns = (exportColumns && exportColumns.length > 0)
    ? exportColumns
    : (exportData && exportData.length > 0
        ? Object.keys(exportData[0]).filter(k => k && k.trim() !== '').map(k => ({ key: k, label: k, type: 'string' as const }))
        : []);

  const effectiveStockColumns = (stockColumns && stockColumns.length > 0)
    ? stockColumns
    : (stockData && stockData.length > 0
        ? Object.keys(stockData[0]).filter(k => k && k.trim() !== '').map(k => ({ key: k, label: k, type: 'string' as const }))
        : []);

  const computeFilterKey = () =>
    overviewDateFilters.length > 0
      ? [...overviewDateFilters].sort().join('_')
      : `all-${overviewSummary?.date ?? ''}`;

  // -------------------------------------------------------------------------
  // Overview summary export
  // -------------------------------------------------------------------------
  const handleExportOverviewSummary = () => {
    const summaryData = [
      {
        "Chỉ số": "Đơn hàng mới (IPO)",
        "Số lượng (HEX)": overviewSummary?.order.mtd.count ?? 0,
        "Giá trị (VND)": overviewSummary?.order.mtd.value ?? 0,
        "Ghi chú": "Dựa trên dữ liệu Đơn hàng tổng"
      },
      {
        "Chỉ số": "Đã triển khai BV",
        "Số lượng (HEX)": overviewSummary?.tkbv.mtd.count ?? 0,
        "Giá trị (VND)": overviewSummary?.tkbv.mtd.value ?? 0,
        "Ghi chú": "Dựa trên dữ liệu TKBV"
      },
      {
        "Chỉ số": "Đã tính phiếu",
        "Số lượng (HEX)": overviewSummary?.pthsp.mtd.count ?? 0,
        "Giá trị (VND)": overviewSummary?.pthsp.mtd.value ?? 0,
        "Ghi chú": "Dựa trên dữ liệu PTHSP"
      },
      {
        "Chỉ số": "Đã nhập kho",
        "Số lượng (Items)": overviewSummary?.inventory.mtd.count ?? 0,
        "Giá trị (VND)": overviewSummary?.inventory.mtd.value ?? 0,
        "Ghi chú": "Dựa trên dữ liệu Nhập kho"
      }
    ];

    const dateStr = overviewDateFilters.length > 0 ? overviewDateFilters.join('_') : 'Toan_bo';
    exportToCSV(summaryData, `Tong_Hop_Bao_Cao_${dateStr}.csv`);
  };

  const handleOpenOverviewExport = () => {
    setOverviewExportScope('FILTERED');
    // Reset về tháng hiện tại mỗi lần mở lại modal
    const d = latestUnifiedDate ?? new Date();
    setSelectedExportMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setIsOverviewExportScopeModalOpen(true);
  };

 // SỬA: tải CSV tồn kho dưới dạng ArrayBuffer (bytes thô) thay vì string.
// Lý do: fetch().text() rồi nhét chuỗi vào JSZip phải qua 1 lượt decode UTF-8
// (byte -> string) rồi JSZip lại encode UTF-8 lần nữa (string -> byte) khi
// build file trong zip. Nếu bất kỳ khâu nào trong chuỗi này (fetch, gzip qua
// compression middleware, môi trường serverless...) hiểu sai encoding, dữ
// liệu sẽ bị double-encode gây lỗi font (VD: "GIÁ TRỊ" -> "GIÃ TRá»Š T").
// Dùng ArrayBuffer giữ nguyên byte gốc từ server, JSZip ghi thẳng vào file
// trong zip không qua bước encode/decode nào -> loại bỏ hoàn toàn nguy cơ này.
const fetchStockCsvContent = async (dates?: string[]): Promise<ArrayBuffer | string> => {
  try {
    const params = new URLSearchParams();
    if (dates && dates.length > 0) {
      params.set('dates', dates.join(','));
    }
    if (effectiveStockColumns.length > 0) {
      params.set('cols', effectiveStockColumns.map(c => c.key).join(','));
    }
    const res = await fetch(`${API_BASE_URL}/stock/export/csv?${params.toString()}`);
    if (!res.ok) return '\uFEFFLỗi khi lấy dữ liệu tồn kho';
    return await res.arrayBuffer(); // giữ nguyên bytes gốc, không qua string trung gian
  } catch (e) {
    console.error('fetchStockCsvContent error:', e);
    return '\uFEFFLỗi khi lấy dữ liệu tồn kho';
  }
};

  const handleOverviewExportConfirm = async () => {
    let orderSrc: DataRow[], tkbvSrc: DataRow[], pthspSrc: DataRow[], invSrc: DataRow[], expSrc: DataRow[];
    let suffix = 'Theo_Bo_Loc_Ngay';
    let stockDatesToFetch: string[] | undefined;

    if (overviewExportScope === 'ALL') {
      orderSrc = orderData; tkbvSrc = tkbvData; pthspSrc = pthspData; invSrc = inventoryData; expSrc = exportData;
      suffix = 'Toan_Bo';
      stockDatesToFetch = undefined;
    } else if (overviewExportScope === 'MTD') {
      // MỚI: dùng tháng người dùng CHỌN (selectedExportMonth), không cố định
      // theo latestUnifiedDate như trước — tính lại từ dữ liệu gốc cho đúng tháng đó.
      const [yearStr, monthStr] = selectedExportMonth.split('-');
      const year = Number(yearStr);
      const month = Number(monthStr);

      orderSrc = computeMonthRows(orderData, orderDateKey, year, month);
      tkbvSrc = computeMonthRows(tkbvData, tkbvDateKey, year, month);
      pthspSrc = computeMonthRows(pthspData, pthspDateKey, year, month);
      invSrc = computeMonthRows(inventoryData, invDateKey, year, month);
      expSrc = computeMonthRows(exportData, expDateKey, year, month);
      suffix = `Luy_Ke_Thang_T${month}_${year}`;

      const closestDateStr = findClosestStockDateInMonth(stockDates, year, month);
      stockDatesToFetch = closestDateStr ? [closestDateStr] : [];
    } else {
      orderSrc = filteredOrderData; tkbvSrc = filteredTkbvData; pthspSrc = filteredPthspData; invSrc = filteredInventoryOverviewData; expSrc = filteredExportOverviewData;
      suffix = 'Theo_Bo_Loc_Ngay';
      stockDatesToFetch = closestStockDate ? [toISODateLocal(closestStockDate)] : [];
    }

    const zip = new JSZip();

    const addFile = (fileName: string, data: DataRow[], columns: ColumnDefinition[]) => {
      const labeledRows = mapRowsToLabeledCsvRows(data, columns);
      const csvContent = rowsToCsvString(labeledRows);
      zip.file(fileName, csvContent || '\uFEFFKhông có dữ liệu');
    };

    addFile('1_Don_Hang_Moi_P001.csv', orderSrc, effectiveOrderColumns);
    addFile('2_Trien_Khai_BV_P002.csv', tkbvSrc, effectiveTkbvColumns);
    addFile('3_Da_Tinh_Phieu_PTHSP_P012.csv', pthspSrc, effectivePthspColumns);
    addFile('4_Nhap_Kho_P022.csv', invSrc, effectiveInventoryColumns);
    addFile('5_Xuat_Kho_P025.csv', expSrc, effectiveExportDataColumns);

        // SỬA: dùng fetchStockCsvContent (trả ArrayBuffer) thay vì fetchStockCsvText (trả string)
    const stockCsvContent = stockDatesToFetch === undefined || stockDatesToFetch.length > 0
      ? await fetchStockCsvContent(stockDatesToFetch)
      : '\uFEFFKhông tìm thấy mốc tồn kho phù hợp với phạm vi đã chọn';
    zip.file('6_Ton_Kho.csv', stockCsvContent);

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Tong_Hop_6_Card_${suffix}_${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setIsOverviewExportScopeModalOpen(false);
  };

  // -------------------------------------------------------------------------
  // Group analysis export
  // -------------------------------------------------------------------------
  const handleExportGroupAnalysis = (
    key: 'order' | 'tkbv' | 'pthsp' | 'inventory' | 'export',
    metric: 'COUNT' | 'SUM',
    fileLabel: string
  ) => {
    const filterKey = computeFilterKey();
    const byXuong = groupAnalysisCache[`${key}-xuong-${filterKey}`] ?? [];
    const byCongTrinh = groupAnalysisCache[`${key}-congtrinh-${filterKey}`] ?? [];

    const unitLabel = metric === 'COUNT' ? 'Số lượng' : 'Giá trị (VND)';

    const mapRows = (rows: GroupAnalysisRow[], groupLabel: string) =>
      rows.map(r => ({
        "Phân loại": groupLabel,
        "Tên": r.name,
        [`Trong ngày (${unitLabel})`]: metric === 'COUNT' ? r.dailyCount : r.dailyValue,
        [`Lũy kế tháng (${unitLabel})`]: metric === 'COUNT' ? r.mtdCount : r.mtdValue,
      }));

    const data = [...mapRows(byXuong, 'Theo Xưởng'), ...mapRows(byCongTrinh, 'Theo Công trình')];

    if (data.length === 0) {
      alert("Không có dữ liệu để xuất!");
      return;
    }

    const dateStr = filterKey || new Date().toISOString().split('T')[0];
    exportToCSV(data, `${fileLabel}_${dateStr}.csv`);
  };

  // -------------------------------------------------------------------------
  // Stock detail export
  // -------------------------------------------------------------------------
  const handleExportStockDetail = () => {
    if (stockByProjectData.length === 0) {
      alert("Không có dữ liệu tồn kho để xuất!");
      return;
    }
    const unitLabel = stockMetric === 'COUNT' ? 'Số lượng' : 'Giá trị (VND)';
    const data = stockByProjectData.map(r => ({
      "Tên Công trình": r.name,
      [unitLabel]: stockMetric === 'COUNT' ? r.count : r.value,
    }));
    const dateStr = closestStockDate ? toISODateLocal(closestStockDate) : new Date().toISOString().split('T')[0];
    exportToCSV(data, `Ton_Kho_Theo_Cong_Trinh_${dateStr}.csv`);
  };

  // -------------------------------------------------------------------------
  // Production status export
  // -------------------------------------------------------------------------
  const handleExportProductionStatus = () => {
    setSelectedExportColumns(productionColumns.map(col => col.key));
    setIsProductionExportModalOpen(true);
  };

  // -------------------------------------------------------------------------
  // Order export (P001)
  // -------------------------------------------------------------------------
  const handleOpenOrderExport = () => {
    setOrderExportScope('FILTERED');
    setIsOrderExportScopeModalOpen(true);
  };

  // -------------------------------------------------------------------------
  // Generic export flow (tkbv / pthsp / inventory / export / stock)
  // -------------------------------------------------------------------------
  const getExportFlowConfig = (type: ExportFlowType): ExportFlowConfig => {
    switch (type) {
      case 'tkbv':
        return { title: 'Đã Triển khai BV (TKBV)', rawData: tkbvData, filteredData: filteredTkbvData, mtdData: mtdTkbvData, columns: effectiveTkbvColumns, filePrefix: 'Trien_Khai_Ban_Ve_TKBV', color: 'blue' };
      case 'pthsp':
        return { title: 'Đã Tính phiếu (PTHSP)', rawData: pthspData, filteredData: filteredPthspData, mtdData: mtdPthspData, columns: effectivePthspColumns, filePrefix: 'Da_Tinh_Phieu_PTHSP', color: 'purple' };
      case 'inventory':
        return { title: 'Nhập kho', rawData: inventoryData, filteredData: filteredInventoryOverviewData, mtdData: mtdInventoryData, columns: effectiveInventoryColumns, filePrefix: 'Nhap_Kho', color: 'teal' };
      case 'export':
        return { title: 'Xuất kho', rawData: exportData, filteredData: filteredExportOverviewData, mtdData: mtdExportKhoData, columns: effectiveExportDataColumns, filePrefix: 'Xuat_Kho', color: 'amber' };
      case 'stock':
        return {
          title: 'Tồn kho',
          rawData: stockData,
          filteredData: filteredStockDataForExport,
          mtdData: mtdStockData,
          columns: effectiveStockColumns,
          filePrefix: 'Ton_Kho',
          color: 'slate',
          displayCount: stockTotalCount,
        };
      default:
        const _exhaustiveCheck: never = type;
        throw new Error(`Unhandled export flow type: ${_exhaustiveCheck}`);
    }
  };

  const handleOpenGenericExport = (type: ExportFlowType) => {
    setGenericExportFlow(type);
    setGenericExportScope('FILTERED');
    if (type === 'stock') {
      setSelectedStockExportDates(stockDates.length > 0 ? [stockDates[0].date] : []);
    }
    setIsGenericExportScopeModalOpen(true);
  };

  const handleGenericExportContinue = () => {
    if (!genericExportFlow) return;

    if (genericExportFlow === 'stock' && genericExportScope === 'FILTERED' && selectedStockExportDates.length === 0) {
      alert('Vui lòng chọn ít nhất 1 mốc thời gian tồn kho để xuất.');
      return;
    }

    const config = getExportFlowConfig(genericExportFlow);
    setGenericExportSelectedColumns(config.columns.map(c => c.key));
    setIsGenericExportScopeModalOpen(false);
    setIsGenericExportColumnModalOpen(true);
  };

  const handleGenericExportConfirm = () => {
    if (!genericExportFlow) return;

    if (genericExportFlow === 'stock') {
      const isAll = genericExportScope === 'ALL';

      if (!isAll && selectedStockExportDates.length === 0) {
        alert('Vui lòng chọn ít nhất 1 mốc thời gian tồn kho để xuất.');
        return;
      }

      const params = new URLSearchParams();
      if (!isAll) {
        const isoDates = selectedStockExportDates.map(normalizeToISODate);
        params.set('dates', isoDates.join(','));
      }
      if (genericExportSelectedColumns.length > 0) {
        params.set('cols', genericExportSelectedColumns.join(','));
      }

      const url = `${API_BASE_URL}/stock/export/csv?${params.toString()}`;

      const a = document.createElement('a');
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setIsGenericExportColumnModalOpen(false);
      setGenericExportFlow(null);
      return;
    }

    const config = getExportFlowConfig(genericExportFlow);
    let sourceData: DataRow[] = [];
    let suffix = 'Theo_Bo_Loc_Ngay';

    if (genericExportScope === 'ALL') {
      sourceData = config.rawData;
      suffix = 'Toan_Bo';
    } else if (genericExportScope === 'MTD') {
      sourceData = (config.mtdData && config.mtdData.length > 0) ? config.mtdData : config.rawData;
      suffix = `Luy_Ke_Thang_T${latestUnifiedDate ? latestUnifiedDate.getMonth() + 1 : ''}`;
    } else {
      sourceData = (config.filteredData && config.filteredData.length > 0) ? config.filteredData : config.rawData;
      suffix = 'Theo_Bo_Loc_Ngay';
    }

    if (!sourceData || sourceData.length === 0) {
      alert('Không có dữ liệu nào để xuất!');
      return;
    }

    const exportDataMapped = sourceData.map(row => {
      const newRow: any = {};
      genericExportSelectedColumns.forEach(colKey => {
        const colDef = config.columns.find(c => c.key === colKey);
        const headerLabel = colDef ? colDef.label : colKey;
        newRow[headerLabel] = row[colKey] !== undefined && row[colKey] !== null ? row[colKey] : '';
      });
      return newRow;
    });

    exportToCSV(exportDataMapped, `${config.filePrefix}_${suffix}_${new Date().toISOString().split('T')[0]}.csv`);
    setIsGenericExportColumnModalOpen(false);
    setGenericExportFlow(null);
  };

  // -------------------------------------------------------------------------
  // Bottleneck export
  // -------------------------------------------------------------------------
  const handleExportBottlenecks = () => {
    const flatBottleneckData = bottleneckData.map(item => ({
      "Công đoạn": item.name,
      "< 3 Ngày": item['<3 NGÀY'] || 0,
      "4-7 Ngày": item['4-7 NGÀY'] || 0,
      "2 Tuần": item['2 tuần'] || 0,
      "3 Tuần": item['3 tuần'] || 0,
      "Trên 4 Tuần": item['Từ 4 tuần trở lên'] || 0
    }));
    exportToCSV(flatBottleneckData, `Bao_Cao_Diem_Nghen_${new Date().toISOString().split('T')[0]}.csv`);
  };

  return {
    selectedExportColumns, setSelectedExportColumns,
    isProductionExportModalOpen, setIsProductionExportModalOpen,
    isOrderExportScopeModalOpen, setIsOrderExportScopeModalOpen,
    orderExportScope, setOrderExportScope,
    isOrderExportModalOpen, setIsOrderExportModalOpen,
    selectedOrderExportColumns, setSelectedOrderExportColumns,
    genericExportFlow, setGenericExportFlow,
    genericExportScope, setGenericExportScope,
    isGenericExportScopeModalOpen, setIsGenericExportScopeModalOpen,
    isGenericExportColumnModalOpen, setIsGenericExportColumnModalOpen,
    genericExportSelectedColumns, setGenericExportSelectedColumns,
    isOverviewExportScopeModalOpen, setIsOverviewExportScopeModalOpen,
    overviewExportScope, setOverviewExportScope,

    // MỚI
    selectedExportMonth, setSelectedExportMonth,

    selectedStockExportDates, setSelectedStockExportDates,
    stockDates,

    effectiveOrderColumns,
    effectiveTkbvColumns,
    effectivePthspColumns,
    effectiveInventoryColumns,
    effectiveExportDataColumns,
    effectiveStockColumns,

    handleExportOverviewSummary,
    handleOpenOverviewExport,
    handleOverviewExportConfirm,
    handleExportGroupAnalysis,
    handleExportStockDetail,
    handleExportProductionStatus,
    handleOpenOrderExport,
    getExportFlowConfig,
    handleOpenGenericExport,
    handleGenericExportContinue,
    handleGenericExportConfirm,
    handleExportBottlenecks,
  };
}