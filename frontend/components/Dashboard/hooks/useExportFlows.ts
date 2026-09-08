import { useMemo, useState } from 'react';
import JSZip from 'jszip';
import { DataRow, ColumnDefinition } from '../../../types';
import { ExportFlowType, BottleneckItem } from '../types';
import { rowsToCsvString, mapRowsToLabeledCsvRows } from '../utils/csvExport';
import { toISODateLocal } from '../utils/dateHelpers';
import {
  exportToCSV,
  type GroupAnalysisRow,
  type OverviewSummary,
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
  // Raw source data + column definitions
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

  // Overview summary context
  overviewSummary: OverviewSummary | null;
  overviewDateFilters: string[];
  groupAnalysisCache: Record<string, GroupAnalysisRow[]>;
  latestUnifiedDate: Date | null;

  // Filtered / MTD variants (from useOverviewSummary + useStockData)
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

  // Stock detail export
  stockByProjectData: StockByProjectRowLike[];
  stockMetric: 'COUNT' | 'SUM';
  closestStockDate: Date | null;

  // Bottleneck export
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
}

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
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Effective columns (fallback to inferring from data when no column defs)
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

  // -------------------------------------------------------------------------
  // Helper: khóa cache phải khớp CHÍNH XÁC với cách component
  // (OrderOverviewSection) tính filterKey, nếu không 2 bên sẽ ghi/đọc lệch key.
  // Nhân bản lại công thức ở đây để các hàm export trong hook này luôn tự
  // tính đúng, thay vì phụ thuộc caller phải nhớ truyền đúng chuỗi.
  // -------------------------------------------------------------------------
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
    exportToCSV(summaryData, `Tong_Hop_Bao_Cao_${dateStr}`);
  };

  const handleOpenOverviewExport = () => {
    setOverviewExportScope('FILTERED');
    setIsOverviewExportScopeModalOpen(true);
  };

  const handleOverviewExportConfirm = async () => {
    let orderSrc: DataRow[], tkbvSrc: DataRow[], pthspSrc: DataRow[], invSrc: DataRow[], expSrc: DataRow[], stockSrc: DataRow[];
    let suffix = 'Theo_Bo_Loc_Ngay';

    if (overviewExportScope === 'ALL') {
      orderSrc = orderData; tkbvSrc = tkbvData; pthspSrc = pthspData; invSrc = inventoryData; expSrc = exportData; stockSrc = stockData;
      suffix = 'Toan_Bo';
    } else if (overviewExportScope === 'MTD') {
      orderSrc = mtdOrderData; tkbvSrc = mtdTkbvData; pthspSrc = mtdPthspData; invSrc = mtdInventoryData; expSrc = mtdExportKhoData; stockSrc = mtdStockData;
      suffix = `Luy_Ke_Thang_T${latestUnifiedDate ? latestUnifiedDate.getMonth() + 1 : ''}`;
    } else {
      orderSrc = filteredOrderData; tkbvSrc = filteredTkbvData; pthspSrc = filteredPthspData; invSrc = filteredInventoryOverviewData; expSrc = filteredExportOverviewData; stockSrc = filteredStockDataForExport;
      suffix = 'Theo_Bo_Loc_Ngay';
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
    addFile('6_Ton_Kho.csv', stockSrc, effectiveStockColumns);

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
  // FIX: Group analysis export (theo Xưởng / Công trình từ groupAnalysisCache)
  // TRƯỚC: tự tính `dateISO = overviewSummary?.date` (luôn chỉ 1 ngày) để tra
  // cache — sai lệch với `filterKey` mà OrderOverviewSection.tsx dùng để GHI
  // vào cache (có thể là nhiều ngày nối chuỗi, hoặc "all-<date>"). Khi người
  // dùng chọn lọc nhiều ngày, tra nhầm key -> luôn rỗng -> báo "Không có dữ
  // liệu để xuất!" dù cache thực sự có dữ liệu.
  // SAU: dùng đúng computeFilterKey() — cùng công thức với component, nên
  // luôn khớp key bất kể chọn 1 ngày, nhiều ngày, hay không chọn ngày nào.
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
    exportToCSV(data, `${fileLabel}_${dateStr}`);
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
    exportToCSV(data, `Ton_Kho_Theo_Cong_Trinh_${dateStr}`);
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

  // Lưu ý: bước "Tiếp tục" (mở modal chọn cột) và bước "Xác nhận xuất" cho
  // luồng P001 KHÔNG nằm trong hook này. Chúng đã được xử lý đầy đủ ở nơi
  // khác:
  //   - Bước tiếp tục: `handleContinueToOrderColumnStep` định nghĩa trực
  //     tiếp trong Dashboard.tsx, truyền vào `OrderExportScopeModal` qua
  //     prop `onContinue`.
  //   - Bước xác nhận xuất: logic `handleConfirmExport` nằm ngay bên trong
  //     `OrderExportColumnModal.tsx`, tự nhận orderData/filteredOrderData/
  //     mtdOrderData qua props và tự gọi exportToCSV.
  // Không thêm hàm trùng lặp ở đây để tránh 2 nơi cùng giữ 1 logic.

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
        return { title: 'Tồn kho', rawData: stockData, filteredData: filteredStockDataForExport, mtdData: mtdStockData, columns: effectiveStockColumns, filePrefix: 'Ton_Kho', color: 'slate' };
      default:
        // TypeScript exhaustiveness check — nếu sau này thêm giá trị mới vào ExportFlowType mà quên xử lý ở đây, dòng dưới sẽ báo lỗi compile ngay
        const _exhaustiveCheck: never = type;
        throw new Error(`Unhandled export flow type: ${_exhaustiveCheck}`);
    }
  };

  const handleOpenGenericExport = (type: ExportFlowType) => {
    setGenericExportFlow(type);
    setGenericExportScope('FILTERED');
    setIsGenericExportScopeModalOpen(true);
  };

  const handleGenericExportContinue = () => {
    if (!genericExportFlow) return;
    const config = getExportFlowConfig(genericExportFlow);
    setGenericExportSelectedColumns(config.columns.map(c => c.key));
    setIsGenericExportScopeModalOpen(false);
    setIsGenericExportColumnModalOpen(true);
  };

  const handleGenericExportConfirm = () => {
    if (!genericExportFlow) return;
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
    exportToCSV(flatBottleneckData, `Bao_Cao_Diem_Nghen_${new Date().toISOString().split('T')[0]}`);
  };

  return {
    // state + setters
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

    // effective columns
    effectiveOrderColumns,
    effectiveTkbvColumns,
    effectivePthspColumns,
    effectiveInventoryColumns,
    effectiveExportDataColumns,
    effectiveStockColumns,

    // handlers
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