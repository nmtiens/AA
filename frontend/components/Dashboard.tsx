

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { DataRow, ColumnDefinition, TARGET_COLUMN_NAMES } from '../types';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, BarChart, Bar, LabelList, ReferenceLine, Label
} from 'recharts';
import { CheckCircle, Filter, ChevronDown, XCircle as CloseIcon, Table as TableIcon, Layers, LayoutList, Calculator, Hash, Activity, Package, MinusCircle, Box, ChevronLeft, ChevronRight, CheckSquare, Square, Calendar, DollarSign, ListFilter, Import, BarChart2, TrendingUp, AlertCircle, ShoppingCart, FileText, ClipboardList, Clock, AlertTriangle, Download, Eye, X, Building2, ArrowUp, ArrowDown, ArrowUpDown, Search, Target, Briefcase, PlusSquare, MinusSquare } from 'lucide-react';
import {
  exportToCSV, exportToExcel,
  fetchOverviewSummary, fetchOverviewByGroup, fetchStockDates, fetchStockByProject, fetchRevenue2026,
  fetchKhsxNhapKhoSummary,
  type OverviewSummary, type GroupAnalysisRow, type StockDateEntry, type StockByProjectRow, type Revenue2026Data,
  type KhsxNhapKhoSummary
} from '../services/dataService';
import ProductivityCharts from './ProductivityCharts';
import { getWeekRange2026 } from '../utils/dateUtils';

interface DashboardProps {
  productionData: DataRow[];
  productionColumns: ColumnDefinition[];
  materialData: DataRow[];
  materialColumns: ColumnDefinition[];
  khsxData: DataRow[];
  khsxColumns: ColumnDefinition[];
  inventoryData: DataRow[];
  inventoryColumns: ColumnDefinition[];
  orderData: DataRow[];
  orderColumns: ColumnDefinition[];
  tkbvData: DataRow[];
  tkbvColumns: ColumnDefinition[];
  pthspData: DataRow[];
  pthspColumns: ColumnDefinition[];
  yearlyPlanData: DataRow[];
  yearlyPlanColumns: ColumnDefinition[];
  analysisData: DataRow[];
  analysisColumns: ColumnDefinition[];
  exportData: DataRow[];
  exportColumns: ColumnDefinition[];
  stockData: DataRow[];
  stockColumns: ColumnDefinition[];
  attendanceData: DataRow[];
  attendanceColumns: ColumnDefinition[];
  isSidebarCollapsed: boolean;
}

interface BottleneckItem {
  name: string;
  [key: string]: string | number;
}

const STATUS_GROUPS = {
  CO_THE_SX: [
    '01. NHẬP KHO KĐB', '02. BAO BÌ', '02.1. ĐÓNG KIỆN',
    '03. FITTING', '03.3. FITTING KL',
    '04. VECNI', '04.1. BỌC NỆM', '04.2. PVD',
    '05. MỘC', '05.1. TỔ ĐÁ', '05.2. NGUỘI',
    '06. MÁY', '06.1. HÀN',
    '07. CTS', '07.1. CTS ĐÁ', '07.2. PHÔI', '07.ĐÃ GIAO GCNB',
    '11. CHƯA SX',
    '16. GIA CÔNG VỆ TINH-BTP', '16.1. GIA CÔNG VỆ TINH-NGUYÊN CON',
    '16.2. GIA CÔNG VỆ TINH-ĐÁ', '16.3. GIA CÔNG VỆ TINH-KHÁC'
  ],
  VECNI_FITTING: [
    '01. NHẬP KHO KĐB', '02. BAO BÌ', '02.1. ĐÓNG KIỆN'
  ],
  CHUYEN_KHAC: [
    '03. FITTING', '03.3. FITTING KL',
    '04. VECNI', '04.1. BỌC NỆM', '04.2. PVD',
    '05. MỘC', '05.1. TỔ ĐÁ', '05.2. NGUỘI',
    '06. MÁY', '06.1. HÀN',
    '07. CTS', '07.1. CTS ĐÁ', '07.2. PHÔI', '07.ĐÃ GIAO GCNB',
    '16. GIA CÔNG VỆ TINH-BTP', '16.1. GIA CÔNG VỆ TINH-NGUYÊN CON',
    '16.2. GIA CÔNG VỆ TINH-ĐÁ', '16.3. GIA CÔNG VỆ TINH-KHÁC'
  ],
  CO_PHIEU_CHUA_SX: [
    '11. CHƯA SX'
  ],
  CHUA_THE_SX: [
    '12. CHƯA SX PHẦN CÒN LẠI', '13. CHƯA PHIẾU PHẦN CÒN LẠI',
    '14. CHƯA PHIẾU', '14.1. CHƯA PHIẾU KL', '15. CHƯA TRIỂN KHAI'
  ],
  VUONG_SL: [
    '12. CHƯA SX PHẦN CÒN LẠI', '13. CHƯA PHIẾU PHẦN CÒN LẠI'
  ],
  CHUA_TRIEN_KHAI: [
    '14. CHƯA PHIẾU', '14.1. CHƯA PHIẾU KL', '15. CHƯA TRIỂN KHAI'
  ]
};

type MetricType = 'COUNT_HEX' | 'SUM_GT_CON_LAI' | 'SUM_GT_DON_HANG';

// Types for Pivot Data
interface WorkshopPivotData {
  uniqueWorkshops: string[];
  rows: { bop: string; status: string; key: string }[];
  uniqueBops: string[];
  bopTotals: Record<string, Record<string, number>>;
  bopRowTotals: Record<string, number>;
  matrix: Record<string, Record<string, number>>;
  rowTotals: Record<string, number>;
  colTotals: Record<string, number>;
  grandTotal: number;
}

interface ProjectPivotData {
  uniqueProjects: string[];
  uniqueStatuses: string[];
  matrix: Record<string, Record<string, number>>;
  rowTotals: Record<string, number>;
  colTotals: Record<string, number>;
  grandTotal: number;
}

interface MaterialSummaryPivotData {
  summary: Record<string, { req: number; rec: number }>;
  sortedGroups: string[];
  totalReq: number;
  totalRec: number;
}

interface MaterialStatusPivotData {
  sortedGroups: string[];
  uniqueStatuses: string[];
  matrix: Record<string, Record<string, number>>;
  rowTotals: Record<string, number>;
  colTotals: Record<string, number>;
  grandTotal: number;
}

function formatDecimal(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(value));
}

const WeeklyVennDiagram = ({
  totalPlan,
  totalActual,
  intersection,
  leftOnly,
  rightOnly
}: {
  totalPlan: number;
  totalActual: number;
  intersection: number;
  leftOnly: number;
  rightOnly: number;
}) => {
  // Config dimensions
  const width = 600;
  const height = 350;
  const cx1 = 220; // Center of Plan circle
  const cx2 = 380; // Center of Actual circle
  const cy = 180;
  const r = 130;

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg border border-slate-200 shadow-sm h-full w-full">
      <div className="text-center mb-4">
        <h3 className="text-lg font-bold text-slate-800">Mô phỏng Venn Diagram</h3>
        <p className="text-sm font-medium text-slate-600">
          (Tổng KH: {formatDecimal(totalPlan)} - Tổng TH: {formatDecimal(totalActual)})
        </p>
      </div>

      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="max-w-full h-auto">
        {/* Plan Circle (Red/Pink) - Left */}
        <circle cx={cx1} cy={cy} r={r} fill="#fca5a5" fillOpacity="0.5" stroke="#ef4444" strokeWidth="2" />

        {/* Actual Circle (Blue/Cyan) - Right */}
        <circle cx={cx2} cy={cy} r={r} fill="#bae6fd" fillOpacity="0.5" stroke="#0ea5e9" strokeWidth="2" />

        {/* Labels */}
        {/* Left Only: Rớt Kế Hoạch */}
        <text x={cx1 - 60} y={cy} textAnchor="middle" dominantBaseline="middle" className="text-sm font-bold fill-red-900 pointer-events-none">
          <tspan x={cx1 - 60} dy="-0.6em" fontSize="16" fontWeight="bold">Rớt Kế Hoạch</tspan>
          <tspan x={cx1 - 60} dy="1.4em" fontSize="18" fontWeight="bold">{formatDecimal(leftOnly)}</tspan>
        </text>

        {/* Intersection: Đúng Kế Hoạch */}
        <text x={(cx1 + cx2) / 2} y={cy} textAnchor="middle" dominantBaseline="middle" className="text-sm font-bold fill-white pointer-events-none drop-shadow-md">
          <tspan x={(cx1 + cx2) / 2} dy="-0.6em" fontSize="16" fontWeight="bold">Đúng Kế Hoạch</tspan>
          <tspan x={(cx1 + cx2) / 2} dy="1.4em" fontSize="18" fontWeight="bold">{formatDecimal(intersection)}</tspan>
        </text>

        {/* Right Only: Ngoài/Vượt */}
        <text x={cx2 + 60} y={cy} textAnchor="middle" dominantBaseline="middle" className="text-sm font-bold fill-blue-900 pointer-events-none">
          <tspan x={cx2 + 60} dy="-0.6em" fontSize="16" fontWeight="bold">Ngoài/Vượt</tspan>
          <tspan x={cx2 + 60} dy="1.4em" fontSize="18" fontWeight="bold">{formatDecimal(rightOnly)}</tspan>
        </text>
      </svg>

      <div className="flex gap-8 mt-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-4 bg-red-300/50 border border-red-500 rounded"></div>
          <span className="text-sm font-medium text-slate-700">Kế hoạch</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-4 bg-sky-200/50 border border-sky-500 rounded"></div>
          <span className="text-sm font-medium text-slate-700">Thực hiện</span>
        </div>
      </div>
    </div>
  );
};

// Interface for Analysis Item (used in modals)
interface AnalysisItem {
  name: string;
  daily: number;
  mtd: number;
}

const MATERIAL_LIST_COLUMNS = [
  TARGET_COLUMN_NAMES.STATUS,
  TARGET_COLUMN_NAMES.CONG_TRINH,
  TARGET_COLUMN_NAMES.SO_PR,
  TARGET_COLUMN_NAMES.TEN_VAT_TU,
  TARGET_COLUMN_NAMES.SL_YEU_CAU,
  TARGET_COLUMN_NAMES.BASE_UNIT,
  TARGET_COLUMN_NAMES.REQUEST_DATE,
  TARGET_COLUMN_NAMES.EST_DELIVERY,
  TARGET_COLUMN_NAMES.SL_DA_NHAN,
  TARGET_COLUMN_NAMES.REMAINING_QTY,
  TARGET_COLUMN_NAMES.TEAM_PR_NOTE,
  TARGET_COLUMN_NAMES.STATUS_PO,
  TARGET_COLUMN_NAMES.NOTE_PO,
  TARGET_COLUMN_NAMES.PR_ITEM,
  TARGET_COLUMN_NAMES.ACTUAL_DATE,
  TARGET_COLUMN_NAMES.ACTUAL_QTY,
  TARGET_COLUMN_NAMES.MATERIAL_CODE,
  TARGET_COLUMN_NAMES.REQUISITIONER,

];


// MỚI — CHỈ DÙNG ĐỂ HIỂN THỊ TIÊU ĐỀ, KHÔNG DÙNG ĐỂ TRA DỮ LIỆU
const MATERIAL_LIST_COLUMN_LABELS: Record<string, string> = {
  [TARGET_COLUMN_NAMES.STATUS]: 'TRẠNG THÁI',
  [TARGET_COLUMN_NAMES.CONG_TRINH]: 'TÊN CÔNG TRÌNH',
  [TARGET_COLUMN_NAMES.SO_PR]: 'SỐ PR',
  [TARGET_COLUMN_NAMES.TEN_VAT_TU]: 'TÊN VẬT TƯ',
  [TARGET_COLUMN_NAMES.SL_YEU_CAU]: 'SỐ LƯỢNG YÊU CẦU',
  [TARGET_COLUMN_NAMES.BASE_UNIT]: 'ĐVT',
  [TARGET_COLUMN_NAMES.REQUEST_DATE]: 'NGÀY PR',
  [TARGET_COLUMN_NAMES.EST_DELIVERY]: 'NGÀY DỰ KIẾN GIAO HÀNG PMH NHẬP',
  [TARGET_COLUMN_NAMES.SL_DA_NHAN]: 'SỐ LƯỢNG ĐÃ NHẬN (SAP)',
  [TARGET_COLUMN_NAMES.REMAINING_QTY]: 'SỐ LƯỢNG CÒN LẠI',
  [TARGET_COLUMN_NAMES.TEAM_PR_NOTE]: 'TEAM PR NOTE',
  [TARGET_COLUMN_NAMES.STATUS_PO]: 'TÌNH TRẠNG PO',
  [TARGET_COLUMN_NAMES.NOTE_PO]: 'GHI CHÚ TÌNH TRẠNG PO',
  [TARGET_COLUMN_NAMES.PR_ITEM]: 'PR LINE',
  [TARGET_COLUMN_NAMES.ACTUAL_DATE]: 'NGÀY VỀ - KHO BÁO',
  [TARGET_COLUMN_NAMES.ACTUAL_QTY]: 'SL HÀNG VỀ THỰC TẾ - KHO BÁO',
  [TARGET_COLUMN_NAMES.MATERIAL_CODE]: 'MÃ VẬT TƯ (SAP)',
  [TARGET_COLUMN_NAMES.REQUISITIONER]: 'NGƯỜI YÊU CẦU',
};
// --- REUSABLE COMPONENTS ---

const CheckpointTriangle = (props: any) => {
  const { viewBox } = props;
  const { x, y } = viewBox;
  // Right-pointing triangle: |> (Larger, Moved up 10px)
  // Vertical side on the dashed line (x)
  return (
    <polygon points={`${x},${y - 10} ${x},${y + 6} ${x + 12},${y - 2}`} fill="#ef4444" />
  );
};

const CompactStatCard = ({
  title,
  value,
  icon,
  bg,
  borderColor,
  textColor,
  isParent = false
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  bg: string;
  borderColor: string;
  textColor: string;
  isParent?: boolean;
}) => (
  <div className={`${bg} rounded-lg p-3 border ${borderColor} flex flex-col justify-between h-full ${isParent ? 'shadow-sm' : ''}`}>
    <div className="flex justify-between items-start mb-2">
      <span className={`text-[10px] font-bold ${textColor} uppercase tracking-wider`}>{title}</span>
      {icon}
    </div>
    <div className={`font-bold ${isParent ? 'text-xl' : 'text-lg'} ${textColor}`}>
      {value}
    </div>
  </div>
);

const DashboardFilter = ({
  label,
  options,
  selectedValues,
  onChange,
  singleSelect
}: {
  label: string;
  options: string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  singleSelect?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleValue = (val: string) => {
    let newSelected: string[];
    if (singleSelect) {
      // Single select mode: toggle on/off, but only one active
      newSelected = selectedValues.includes(val) ? [] : [val];
    } else {
      newSelected = selectedValues.includes(val)
        ? selectedValues.filter(v => v !== val)
        : [...selectedValues, val];
    }
    onChange(newSelected);
  };

  const activeCount = selectedValues.length;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between w-full min-w-[150px] px-3 py-1.5 text-xs border rounded-lg bg-white hover:bg-slate-50 transition-colors shadow-sm ${activeCount > 0 ? 'border-wood-500 ring-1 ring-wood-200' : 'border-slate-200'}`}
      >
        <div className="flex flex-col items-start truncate mr-2">
          <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">{label}</span>
          <span className="truncate font-medium text-slate-700 w-full text-left">
            {activeCount === 0 ? 'Tất cả' : `${activeCount} đã chọn`}
          </span>
        </div>
        <ChevronDown size={14} className="text-slate-400 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl z-50 flex flex-col max-h-[300px]">
          <div className="p-2 border-b border-slate-100">
            <input
              type="text"
              placeholder="Tìm kiếm..."
              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:border-wood-400 bg-white"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
            {filteredOptions.length === 0 ? (
              <div className="p-2 text-xs text-slate-400 text-center">Không tìm thấy</div>
            ) : (
              filteredOptions.map(opt => (
                <label key={opt} className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-wood-50 rounded text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedValues.includes(opt)}
                    onChange={() => toggleValue(opt)}
                    className="rounded border-slate-300 text-wood-600 focus:ring-wood-500 w-3.5 h-3.5"
                  />
                  <span className="truncate">{opt}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const MetricSwitcher = ({ current, onChange }: { current: MetricType, onChange: (m: MetricType) => void }) => (
  <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
    <button
      onClick={() => onChange('COUNT_HEX')}
      className={`px-2 py-1 text-[10px] font-bold rounded flex items-center gap-1 transition-all ${current === 'COUNT_HEX' ? 'bg-white text-wood-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
      title="Đếm số lượng HEX"
    >
      <Hash size={12} /> Số lượng hạng mục
    </button>
    <div className="w-px h-3 bg-slate-300 mx-1"></div>
    <button
      onClick={() => onChange('SUM_GT_CON_LAI')}
      className={`px-2 py-1 text-[10px] font-bold rounded flex items-center gap-1 transition-all ${current === 'SUM_GT_CON_LAI' ? 'bg-white text-wood-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
      title="Tổng Giá Trị Còn Lại"
    >
      <Calculator size={12} /> Tổng GT còn lại (theo PTHSP)
    </button>
    <div className="w-px h-3 bg-slate-300 mx-1"></div>
    <button
      onClick={() => onChange('SUM_GT_DON_HANG')}
      className={`px-2 py-1 text-[10px] font-bold rounded flex items-center gap-1 transition-all ${current === 'SUM_GT_DON_HANG' ? 'bg-white text-wood-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
      title="Tổng Giá Trị Đơn Hàng Còn Lại"
    >
      <Calculator size={12} /> Tổng GT Đơn hàng còn lại
    </button>
  </div>
);

// ... (DetailModalTable component remains the same) ...
const DetailModalTable = ({
  data,
  title,
  icon: Icon,
  dateLabel,
  mtdLabel,
  unitLabel,
  primaryColorClass,
  secondaryColorClass,
  defaultExcludedKeys = []
}: {
  data: AnalysisItem[];
  title: string;
  icon: React.ElementType;
  dateLabel: string;
  mtdLabel: string;
  unitLabel: string;
  primaryColorClass: string;
  secondaryColorClass: string;
  defaultExcludedKeys?: string[];
}) => {
  const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'daily' | 'mtd'; direction: 'asc' | 'desc' }>({ key: 'mtd', direction: 'desc' });
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (data.length > 0) {
      const initialSelection = new Set(
        data.map(item => item.name).filter(name => !defaultExcludedKeys.includes(name))
      );
      setSelectedKeys(initialSelection);
    }
  }, [data, defaultExcludedKeys]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleKey = (key: string) => {
    const newSet = new Set(selectedKeys);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setSelectedKeys(newSet);
  };

  const toggleSelectAll = (filteredOptions: string[]) => {
    const allSelected = filteredOptions.every(k => selectedKeys.has(k));
    const newSet = new Set(selectedKeys);
    if (allSelected) {
      filteredOptions.forEach(k => newSet.delete(k));
    } else {
      filteredOptions.forEach(k => newSet.add(k));
    }
    setSelectedKeys(newSet);
  };

  const filteredData = useMemo(() => {
    return data.filter(item => selectedKeys.has(item.name));
  }, [data, selectedKeys]);

  const sortedData = useMemo(() => {
    let sortableItems = [...filteredData];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [filteredData, sortConfig]);

  const allOptions = useMemo(() => data.map(i => i.name).sort(), [data]);
  const visibleOptions = allOptions.filter(opt => opt.toLowerCase().includes(filterSearch.toLowerCase()));

  const requestSort = (key: 'name' | 'daily' | 'mtd') => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortConfig.key !== columnKey) return <ArrowUpDown size={12} className="text-slate-300 ml-1 inline opacity-50" />;
    return sortConfig.direction === 'asc'
      ? <ArrowUp size={12} className="text-slate-600 ml-1 inline" />
      : <ArrowDown size={12} className="text-slate-600 ml-1 inline" />;
  };

  if (data.length === 0) {
    return (
      <div className="mb-8">
        <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
          <Icon size={16} className="text-wood-600" /> {title}
        </h4>
        <div className="flex flex-col items-center justify-center text-slate-400 p-8 bg-white rounded-lg border border-slate-200 border-dashed">
          <AlertCircle size={32} className="mb-2 opacity-50" />
          <p>Không có dữ liệu phân tích.</p>
        </div>
      </div>
    );
  }

  const totalDaily = filteredData.reduce((a, b) => a + b.daily, 0);
  const totalMtd = filteredData.reduce((a, b) => a + b.mtd, 0);

  return (
    <div className="mb-8">
      <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
        <Icon size={16} className="text-wood-600" /> {title}
      </h4>
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden flex flex-col max-h-[500px]">
        <div className="overflow-y-auto custom-scrollbar flex-1 relative">
          <table className="w-full text-sm text-right relative border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-xs sticky top-0 z-20 shadow-sm">
              <tr>
                <th className="px-4 py-3 text-left border-b border-slate-200 bg-slate-100 min-w-[200px] z-30">
                  <div className="flex items-center justify-between">
                    <span
                      className="cursor-pointer hover:text-slate-900 flex items-center"
                      onClick={() => requestSort('name')}
                    >
                      Tên (Name) <SortIcon columnKey="name" />
                    </span>
                    <div className="relative" ref={filterRef}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setIsFilterOpen(!isFilterOpen); }}
                        className={`p-1 rounded hover:bg-slate-200 transition-colors ${selectedKeys.size !== data.length ? 'text-wood-600 bg-wood-50' : 'text-slate-400'}`}
                        title="Lọc dữ liệu"
                      >
                        <Filter size={14} fill={selectedKeys.size !== data.length ? "currentColor" : "none"} />
                      </button>
                      {isFilterOpen && (
                        <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl w-64 z-50 text-left normal-case font-normal flex flex-col animate-in fade-in zoom-in-95 duration-200">
                          <div className="p-2 border-b border-slate-100 bg-slate-50 rounded-t-lg">
                            <div className="relative">
                              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                type="text"
                                className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-300 rounded focus:border-wood-500 focus:outline-none"
                                placeholder="Tìm kiếm..."
                                value={filterSearch}
                                onChange={(e) => setFilterSearch(e.target.value)}
                                autoFocus
                              />
                            </div>
                          </div>
                          <div className="p-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={visibleOptions.every(k => selectedKeys.has(k)) && visibleOptions.length > 0}
                              onChange={() => toggleSelectAll(visibleOptions)}
                              className="rounded border-slate-300 text-wood-600 w-3.5 h-3.5 cursor-pointer"
                            />
                            <span className="text-xs text-slate-700 font-medium">(Chọn tất cả)</span>
                          </div>
                          <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-1">
                            {visibleOptions.length > 0 ? visibleOptions.map(opt => (
                              <label key={opt} className="flex items-center gap-2 px-2 py-1.5 hover:bg-wood-50 cursor-pointer rounded">
                                <input
                                  type="checkbox"
                                  checked={selectedKeys.has(opt)}
                                  onChange={() => toggleKey(opt)}
                                  className="rounded border-slate-300 text-wood-600 w-3.5 h-3.5"
                                />
                                <span className="text-xs text-slate-700 truncate">{opt}</span>
                              </label>
                            )) : <div className="p-2 text-xs text-slate-400 text-center">Không tìm thấy</div>}
                          </div>
                          <div className="p-2 border-t border-slate-100 bg-slate-50 rounded-b-lg flex justify-between items-center text-[10px] text-slate-500">
                            <span>{selectedKeys.size} đã chọn</span>
                            <button onClick={() => setIsFilterOpen(false)} className="text-wood-600 font-bold hover:underline">Đóng</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </th>
                <th
                  className={`px-4 py-3 border-b border-slate-200 bg-slate-100 cursor-pointer hover:bg-slate-200 transition-colors ${primaryColorClass.replace('text-', 'text-opacity-70 text-')}`}
                  onClick={() => requestSort('daily')}
                >
                  {dateLabel} <br /> {unitLabel} <SortIcon columnKey="daily" />
                </th>
                <th
                  className={`px-4 py-3 border-b border-slate-200 bg-slate-100 cursor-pointer hover:bg-slate-200 transition-colors ${secondaryColorClass.replace('text-', 'text-opacity-70 text-')}`}
                  onClick={() => requestSort('mtd')}
                >
                  {mtdLabel} <br /> {unitLabel} <SortIcon columnKey="mtd" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedData.length > 0 ? sortedData.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-left font-medium text-slate-700">{item.name}</td>
                  <td className={`px-4 py-3 ${item.daily > 0 ? `${primaryColorClass} font-bold` : 'text-slate-300'}`}>
                    {item.daily > 0 ? item.daily.toLocaleString('en-US') : '-'}
                  </td>
                  <td className={`px-4 py-3 ${item.mtd > 0 ? `${secondaryColorClass} font-bold` : 'text-slate-300'}`}>
                    {item.mtd > 0 ? item.mtd.toLocaleString('en-US') : '-'}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={3} className="p-8 text-center text-slate-400">Đã lọc hết dữ liệu.</td></tr>
              )}
            </tbody>
            <tfoot className="bg-slate-100 font-bold text-slate-800 border-t border-slate-300 sticky bottom-0 z-20 shadow-[0_-2px_4px_rgba(0,0,0,0.05)]">
              <tr>
                <td className="px-4 py-3 text-left bg-slate-100">TỔNG CỘNG</td>
                <td className={`px-4 py-3 bg-slate-100 ${primaryColorClass}`}>
                  {totalDaily.toLocaleString('en-US')}
                </td>
                <td className={`px-4 py-3 bg-slate-100 ${secondaryColorClass}`}>
                  {totalMtd.toLocaleString('en-US')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

// ... (Helper functions remain the same) ...

const parseNumber = (valStr: string | number | null | undefined): number => {
  if (valStr === null || valStr === undefined) return 0;
  if (typeof valStr === 'number') return isNaN(valStr) ? 0 : valStr;
  let s = String(valStr).trim();
  const directParse = Number(s);
  if (!isNaN(directParse) && s !== '') return directParse; 

  s = s.replace(/[^\d.,-]/g, '');
  if (!s) return 0;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  // Có cả dấu phẩy và chấm (vd: 1.000.000,50 hoặc 1,000,000.50)
  if (lastComma > -1 && lastDot > -1) {
    if (lastDot > lastComma) { s = s.replace(/,/g, ''); } 
    else { s = s.replace(/\./g, '').replace(',', '.'); }
  } 
  // Chỉ có dấu phẩy
  else if (lastComma > -1) {
    // Nếu dấu phẩy cách đuôi đúng 3 số -> Là phân cách ngàn (123,456)
    if (s.length - lastComma - 1 === 3) s = s.replace(/,/g, '');
    else s = s.replace(',', '.'); // Nếu không, là số thập phân (12,5)
  } 
  // Chỉ có dấu chấm
  else if (lastDot > -1) {
    // Nếu dấu chấm cách đuôi đúng 3 số -> Là phân cách ngàn chuẩn VN (123.456)
    if (s.length - lastDot - 1 === 3) s = s.replace(/\./g, '');
  }

  return parseFloat(s) || 0;
};
const parseVNDate = (dateStr: string | null | undefined): Date | null => {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  if (str.includes('T') || str.match(/^\d{4}-\d{2}-\d{2}/)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
  }
  const parts = str.split(/[\/\-\.]/);
  if (parts.length >= 3) {
    let year = parseInt(parts[2], 10);
    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      return new Date(year, parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    // Xử lý thông minh năm 2 số (vd: 26 sẽ tự cộng thành 2026)
    if (year < 100) year += 2000;
    return new Date(year, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  }
  return null;
};

// Format 1 Date object thành "YYYY-MM-DD" theo giờ LOCAL (không quy đổi UTC)
// Dùng thay cho .toISOString().slice(0,10) vì hàm đó bị lệch ngày khi múi giờ dương (VD: UTC+7)
const toISODateLocal = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};


const formatDateToVN = (dateInput: any): string => {
  if (!dateInput) return '';
  const d = parseVNDate(String(dateInput));
  if (!d) return String(dateInput).trim();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const diffDays = (date1: Date, date2: Date): number => {
  const d1 = new Date(date1); d1.setHours(0, 0, 0, 0);
  const d2 = new Date(date2); d2.setHours(0, 0, 0, 0);
  const diffTime = d1.getTime() - d2.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const getDateRangeDisplay = (filters: string[], options: string[]) => {
  const datesToUse = filters.length > 0 ? filters : options;
  if (datesToUse.length === 0) return '';
  const validDates = datesToUse.map(d => parseVNDate(d)).filter((d): d is Date => d !== null);
  if (validDates.length === 0) return '';
  const minDate = new Date(Math.min(...validDates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...validDates.map(d => d.getTime())));
  const fmt = (d: Date) => `0${d.getDate()}`.slice(-2) + '/' + `0${d.getMonth() + 1}`.slice(-2) + '/' + d.getFullYear();
  if (minDate.getTime() === maxDate.getTime()) return `(${fmt(minDate)})`;
  return `(${fmt(minDate)} - ${fmt(maxDate)})`;
};

// Helper function to get week number (ISO 8601-like)
function getWeekNumber(d: Date = new Date()): number {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return weekNo;
}



// ... (Dashboard Component) ...

const Dashboard: React.FC<DashboardProps> = ({
  productionData,
  productionColumns,
  materialData,
  materialColumns,
  khsxData,
  khsxColumns,
  inventoryData,
  inventoryColumns,
  orderData,
  orderColumns,
  tkbvData,
  tkbvColumns,
  pthspData,
  pthspColumns,
  yearlyPlanData,
  yearlyPlanColumns,
  analysisData,
  analysisColumns,
  exportData,
  exportColumns,
  stockData,
  stockColumns,
  attendanceData,
  attendanceColumns,
  isSidebarCollapsed
}) => {
  // ... (Same state and refs) ...
  const factoryRevenueRef = useRef<HTMLDivElement>(null);
  const productionStatusRef = useRef<HTMLDivElement>(null);
  const pivotWorkshopRef = useRef<HTMLDivElement>(null);
  const pivotProjectRef = useRef<HTMLDivElement>(null);
  const pivotMaterialRef = useRef<HTMLDivElement>(null);
  const pivotMaterialStatusRef = useRef<HTMLDivElement>(null);
  const materialListRef = useRef<HTMLDivElement>(null);
  const khsxSectionRef = useRef<HTMLDivElement>(null);
  const inventorySectionRef = useRef<HTMLDivElement>(null);
  const projectSummaryRef = useRef<HTMLDivElement>(null);
  const orderOverviewRef = useRef<HTMLDivElement>(null);
  const bottleneckSectionRef = useRef<HTMLDivElement>(null);

  const hasInitializedOverviewDate = useRef(false);

  const [isIpoDetailModalOpen, setIsIpoDetailModalOpen] = useState(false);
  const [isTkbvDetailModalOpen, setIsTkbvDetailModalOpen] = useState(false);
  const [isWeeklyDetailModalOpen, setIsWeeklyDetailModalOpen] = useState(false);
  const [isPthspDetailModalOpen, setIsPthspDetailModalOpen] = useState(false);
  const [isInventoryDetailModalOpen, setIsInventoryDetailModalOpen] = useState(false);
  const [isExportDetailModalOpen, setIsExportDetailModalOpen] = useState(false);
  const [isStockDetailModalOpen, setIsStockDetailModalOpen] = useState(false);
  const [isFunnelPivotModalOpen, setIsFunnelPivotModalOpen] = useState(false);
  const [bottleneckViewMode, setBottleneckViewMode] = useState<'BOP' | 'TÌNH TRẠNG'>('BOP');

const normalizeString = (str: string) => {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, ""); // Dành cho việc tìm key/cột trong DB
};

 const findColumnKey = (cols: ColumnDefinition[], target: string) => {
    if (!cols || cols.length === 0) return '';
    const normalizedTarget = normalizeString(target);

    // 1. Ưu tiên tìm khớp chính xác (Exact match) để tránh lỗi substring
    let match = cols.find(c => {
      const k = normalizeString(c.key);
      const l = normalizeString(c.label);
      return k === normalizedTarget || l === normalizedTarget;
    });

    // 2. Nếu không khớp chính xác, mới dùng phương án tìm chuỗi con (Substring match)
    if (!match) {
      match = cols.find(c => {
        const k = normalizeString(c.key);
        const l = normalizeString(c.label);
        return k.includes(normalizedTarget) || normalizedTarget.includes(k);
      });
    }

    return match ? match.key : '';
  };

  const hexKey = findColumnKey(productionColumns, TARGET_COLUMN_NAMES.HEX) || 'hex';
  const tinhTrangKey = findColumnKey(productionColumns, TARGET_COLUMN_NAMES.TINH_TRANG) || 'tinh_trang';
  const tinhTrangIpoKey = findColumnKey(productionColumns, TARGET_COLUMN_NAMES.TINH_TRANG_IPO) || 'tinh_trang_ipo';
  const valueKey = findColumnKey(productionColumns, TARGET_COLUMN_NAMES.GIA_TRI_CON_LAI) || 'gia_tri_don_hang_con_lai';
  const realValueKey = findColumnKey(productionColumns, TARGET_COLUMN_NAMES.GIA_TRI_THUC_TE) || 'gia_tri_con_lai';
  const congTrinhKey = findColumnKey(productionColumns, TARGET_COLUMN_NAMES.CONG_TRINH) || 'ten_cong_trinh';
  const xuongKey = findColumnKey(productionColumns, TARGET_COLUMN_NAMES.XUONG) || 'xuong_chinh';
  const hangMucKey = findColumnKey(productionColumns, TARGET_COLUMN_NAMES.TEN_HANG_MUC) || 'ten_hang_muc';
  const daysAtCurrentStageKey = findColumnKey(productionColumns, TARGET_COLUMN_NAMES.SO_NGAY_CD_HIEN_TAI) || 'so_ngay_cd_hien_tai';
  const bopKey = findColumnKey(productionColumns, TARGET_COLUMN_NAMES.BOP) || 'bop';
  const triGiaDonHangTongKey = findColumnKey(productionColumns, TARGET_COLUMN_NAMES.TRI_GIA_DON_HANG_TONG) || 'tri_gia_don_hang_tong';
  const thanhTienTinhPhieuKey = findColumnKey(productionColumns, TARGET_COLUMN_NAMES.THANH_TIEN_TINH_PHIEU) || 'thanh_tien_tinh_phieu';
  const thanhTienNhapKhoKey = findColumnKey(productionColumns, TARGET_COLUMN_NAMES.THANH_TIEN_NHAP_KHO) || 'thanh_tien_nhap_kho_luy_ke';

  // 2. Material Keys
  const matCongTrinhKey = findColumnKey(materialColumns, TARGET_COLUMN_NAMES.CONG_TRINH) || 'ten_cong_trinh';
  const matNhomVtKey = findColumnKey(materialColumns, TARGET_COLUMN_NAMES.NHOM_VT) || 'nhom_vt';
  const matSlYeuCauKey = findColumnKey(materialColumns, TARGET_COLUMN_NAMES.SL_YEU_CAU) || 'so_luong_yeu_cau';
  const matSlDaNhanKey = findColumnKey(materialColumns, TARGET_COLUMN_NAMES.SL_DA_NHAN) || 'so_luong_da_nhan_sap';
  const matStatusKey = findColumnKey(materialColumns, TARGET_COLUMN_NAMES.STATUS) || 'trang_thai';
  const matStatusSapKey = findColumnKey(materialColumns, TARGET_COLUMN_NAMES.STATUS_SAP)|| 'trang_thai_sap';
  const matEstDateKey = findColumnKey(materialColumns, TARGET_COLUMN_NAMES.EST_DELIVERY)||'ngay_du_kien_giao_hang_pmh_nhap';

  const khsxXuongKey = findColumnKey(khsxColumns, TARGET_COLUMN_NAMES.XUONG) || 'xuong_chinh';
  const khsxCongTrinhKey = findColumnKey(khsxColumns, TARGET_COLUMN_NAMES.CONG_TRINH) || 'ten_cong_trinh';
  const khsxNamKey = findColumnKey(khsxColumns, TARGET_COLUMN_NAMES.NAM)|| 'nam';
  const khsxThangKey = findColumnKey(khsxColumns, TARGET_COLUMN_NAMES.THANG)|| 'thang';
  const khsxNgayKey = findColumnKey(khsxColumns, TARGET_COLUMN_NAMES.NGAY)|| 'ngay';
  const khsxTuanKey = findColumnKey(khsxColumns, TARGET_COLUMN_NAMES.TUAN)|| 'tuan';

  const invThanhTienKey = findColumnKey(inventoryColumns, TARGET_COLUMN_NAMES.INVENTORY_AMOUNT) ||  'thanh_tien_nhap_kho';
  const invXuongKey = findColumnKey(inventoryColumns, TARGET_COLUMN_NAMES.XUONG)|| 'xuong_chinh';
  const invCongTrinhKey = findColumnKey(inventoryColumns, TARGET_COLUMN_NAMES.CONG_TRINH)|| 'ten_cong_trinh';
  const invNamKey = findColumnKey(inventoryColumns, TARGET_COLUMN_NAMES.NAM)|| 'nam';
  const invThangKey = findColumnKey(inventoryColumns, TARGET_COLUMN_NAMES.THANG)|| 'thang';
  const invNgayKey = findColumnKey(inventoryColumns, TARGET_COLUMN_NAMES.NGAY)|| 'ngay';
  const invDateKey = findColumnKey(inventoryColumns, TARGET_COLUMN_NAMES.DATE)|| 'date';
  const invTuanKey = findColumnKey(inventoryColumns, TARGET_COLUMN_NAMES.TUAN)|| 'tuan';

  const expThanhTienKey = findColumnKey(exportColumns, TARGET_COLUMN_NAMES.EXPORT_AMOUNT)|| 'so_luong_xuat_kho';
  const expDateKey = findColumnKey(exportColumns, TARGET_COLUMN_NAMES.DATE)|| 'date';
  const expXuongKey = findColumnKey(exportColumns, TARGET_COLUMN_NAMES.XUONG)|| 'xuong_chinh';
  const expCongTrinhKey = findColumnKey(exportColumns, TARGET_COLUMN_NAMES.CONG_TRINH)|| 'ten_cong_trinh';

  // 3. Stock Keys
  const stockDateKey = findColumnKey(stockColumns, TARGET_COLUMN_NAMES.DATE) || 'date';
  const stockValueKey = findColumnKey(stockColumns, TARGET_COLUMN_NAMES.GIA_TRI_TON_KHO) || 'gia_tri';
  const stockSapIdKey = findColumnKey(stockColumns, TARGET_COLUMN_NAMES.MA_ID_SAP) || 'ma_id_sap';

  const orderDateKey = findColumnKey(orderColumns, TARGET_COLUMN_NAMES.NGAY_NHAN_TU_PM)|| 'ngay_nhan_tu_pm';
  const orderValueKey = findColumnKey(orderColumns, TARGET_COLUMN_NAMES.TRI_GIA_DON_HANG_TONG)|| 'tri_gia_don_hang_tong';
  const orderXuongKey = findColumnKey(orderColumns, TARGET_COLUMN_NAMES.XUONG)|| 'xuong_chinh';
  const orderCongTrinhKey = findColumnKey(orderColumns, TARGET_COLUMN_NAMES.CONG_TRINH)|| 'ten_cong_trinh';

  const tkbvDateKey = findColumnKey(tkbvColumns, TARGET_COLUMN_NAMES.NGAY_NHAN)|| 'ngay_nhan';
  const tkbvValueKey = findColumnKey(tkbvColumns, TARGET_COLUMN_NAMES.TRI_GIA_DON_HANG_TONG)|| 'tri_gia_don_hang_tong';
  const tkbvXuongKey = findColumnKey(tkbvColumns, TARGET_COLUMN_NAMES.XUONG)|| 'xuong_chinh';
  const tkbvCongTrinhKey = findColumnKey(tkbvColumns, TARGET_COLUMN_NAMES.CONG_TRINH)|| 'ten_cong_trinh';

  const pthspDateKey = findColumnKey(pthspColumns, TARGET_COLUMN_NAMES.NGAY_HOAN_THANH)|| 'ngay_hoan_thanh';
  const pthspValueKey = findColumnKey(pthspColumns, TARGET_COLUMN_NAMES.TRI_GIA_DON_HANG_TONG)|| 'tri_gia_don_hang_tong';
  const pthspXuongKey = findColumnKey(pthspColumns, TARGET_COLUMN_NAMES.XUONG)|| 'xuong_chinh';
  const pthspCongTrinhKey = findColumnKey(pthspColumns, TARGET_COLUMN_NAMES.CONG_TRINH)|| 'ten_cong_trinh';


  // New keys for Analysis Data
  const analysisXuongKey = findColumnKey(analysisColumns, TARGET_COLUMN_NAMES.XUONG)|| 'xuong_chinh';
  const analysisCongTrinhKey = findColumnKey(analysisColumns, TARGET_COLUMN_NAMES.CONG_TRINH)|| 'ten_cong_trinh';
  const analysisPlanKey = findColumnKey(analysisColumns, TARGET_COLUMN_NAMES.THANH_TIEN_KE_HOACH)|| 'thanh_tien_ke_hoach';
  const analysisActualKey = findColumnKey(analysisColumns, TARGET_COLUMN_NAMES.NHAP_KHO_TUAN)|| 'nhap_kho_tuan';
  const analysisWeekKey = findColumnKey(analysisColumns, TARGET_COLUMN_NAMES.TUAN)|| 'tuan';
  const analysisDungKhKey = findColumnKey(analysisColumns, TARGET_COLUMN_NAMES.DUNG_KE_HOACH)|| 'dung_ke_hoach';
  const analysisThucHienDungKh1PhanKey = findColumnKey(analysisColumns, TARGET_COLUMN_NAMES.THUC_HIEN_DUNG_KE_HOACH_1_PHAN)|| 'thuc_hien_dung_ke_hoach_1_phan';
  const analysisRotKhKey = findColumnKey(analysisColumns, TARGET_COLUMN_NAMES.ROT_KE_HOACH)|| 'rot_ke_hoach';
  const analysisThucHienRotKh1PhanKey = findColumnKey(analysisColumns, TARGET_COLUMN_NAMES.THUC_HIEN_ROT_KE_HOACH_1_PHAN)|| 'thuc_hien_rot_ke_hoach_1_phan';
  const analysisNhapKhoTruocKhKey = findColumnKey(analysisColumns, TARGET_COLUMN_NAMES.NHAP_KHO_TRUOC_KE_HOACH)|| 'nhap_kho_truoc_ke_hoach';
  const analysisVuotKhKey = findColumnKey(analysisColumns, TARGET_COLUMN_NAMES.VUOT_KE_HOACH)|| 'vuot_ke_hoach';
  const analysisNhapKhoNgoaiKhKey = findColumnKey(analysisColumns, TARGET_COLUMN_NAMES.NHAP_KHO_NGOAI_KE_HOACH)|| 'nhap_kho_ngoai_ke_hoach';

  // Attendance Keys
  const attXuongKey = findColumnKey(attendanceColumns, TARGET_COLUMN_NAMES.XUONG)|| 'xuong_chinh';
  const attSoLuongCnKey = findColumnKey(attendanceColumns, TARGET_COLUMN_NAMES.SO_LUONG_CONG_NHAN)|| 'so_luong_cong_nhan';
  const attGioCongHcKey = findColumnKey(attendanceColumns, TARGET_COLUMN_NAMES.GIO_CONG_HC)|| 'gio_cong_hanh_chinh';
  const attGioCongTcKey = findColumnKey(attendanceColumns, TARGET_COLUMN_NAMES.GIO_CONG_TC)|| 'gio_cong_tang_ca';
  // Try to find a Week column, otherwise we might rely on implied date/week structure, but user asked for Week Filter logic.
  // Assuming Attendance Data has a 'TUẦN' column or similar compatible with the filter.
  const attTuanKey = findColumnKey(attendanceColumns, TARGET_COLUMN_NAMES.TUAN)|| 'tuan';
  const attNamKey = findColumnKey(attendanceColumns, TARGET_COLUMN_NAMES.NAM)|| 'nam';
  const attThangKey = findColumnKey(attendanceColumns, TARGET_COLUMN_NAMES.THANG)|| 'thang';
  const attNgayKey = findColumnKey(attendanceColumns, TARGET_COLUMN_NAMES.NGAY)|| 'ngay';
  const attDinhBienKey = findColumnKey(attendanceColumns, TARGET_COLUMN_NAMES.DINH_BIEN)|| 'dinh_bien';

  const [filters, setFilters] = useState<{
    congTrinh: string[];
    xuong: string[];
    tinhTrang: string[];
    tinhTrangIpo: string[];
  }>({
    congTrinh: [],
    xuong: [],
    tinhTrang: [],
    tinhTrangIpo: ['01. ĐANG SẢN XUẤT']
  });

  const [unifiedTimeFilters, setUnifiedTimeFilters] = useState<{
    nam: string[];
    thang: string[];
    ngay: string[];
    tuan: string[];
  }>({
    nam: [new Date().getFullYear().toString()],
    thang: [(new Date().getMonth() + 1).toString()],
    ngay: [],
    tuan: []
  });

  const [viewMode, setViewMode] = useState<'MONTH' | 'WEEK'>('MONTH');


  // const [khsxPhanLoaiFilter, setKhsxPhanLoaiFilter] = useState<string[]>(['THÁNG 02/2026']); // Removed in favor of viewMode logic
  const [overviewDateFilters, setOverviewDateFilters] = useState<string[]>([]);
  const [overviewMetric, setOverviewMetric] = useState<'COUNT' | 'SUM'>('COUNT');
  const [selectedMaterialGroups, setSelectedMaterialGroups] = useState<string[]>([]);
  const [workshopMetric, setWorkshopMetric] = useState<MetricType>('SUM_GT_DON_HANG');
  const [projectMetric, setProjectMetric] = useState<MetricType>('SUM_GT_DON_HANG');
  const [chartMetric, setChartMetric] = useState<MetricType>('SUM_GT_DON_HANG');
  const [projectSummaryMetric, setProjectSummaryMetric] = useState<'VALUE' | 'COUNT'>('VALUE');
  const [matStatusMetric, setMatStatusMetric] = useState<'COUNT_PR' | 'SUM_QTY'>('COUNT_PR');
  const [excludeFabrics, setExcludeFabrics] = useState(false);
  const [expandedBops, setExpandedBops] = useState<Set<string>>(new Set());
  const [materialListPage, setMaterialListPage] = useState(1);
  const [isProductionExportModalOpen, setIsProductionExportModalOpen] = useState(false);
  const [selectedExportColumns, setSelectedExportColumns] = useState<string[]>([]);
  const [isOrderExportScopeModalOpen, setIsOrderExportScopeModalOpen] = useState(false);
  const [orderExportScope, setOrderExportScope] = useState<'FILTERED' | 'MTD' | 'ALL'>('FILTERED');
  const [isOrderExportModalOpen, setIsOrderExportModalOpen] = useState(false);
  const [selectedOrderExportColumns, setSelectedOrderExportColumns] = useState<string[]>([]);
  const MATERIAL_ITEMS_PER_PAGE = 15;


const [overviewSummary, setOverviewSummary] = useState<OverviewSummary | null>(null);
const [revenue2026, setRevenue2026] = useState<Revenue2026Data | null>(null);
const [stockDates, setStockDates] = useState<StockDateEntry[]>([]);
const [groupAnalysisCache, setGroupAnalysisCache] = useState<Record<string, GroupAnalysisRow[]>>({});
const [stockByProjectData, setStockByProjectData] = useState<StockByProjectRow[]>([]);
const overviewFetchIdRef = useRef(0);

// THÊM MỚI — dữ liệu tổng hợp KH vs TH đã tính sẵn ở backend (đã dedup theo hex)
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

// Các biến thay thế cho useMemo cũ — JSX phía dưới dùng nguyên tên này, không cần sửa gì thêm
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

useEffect(() => { fetchRevenue2026().then(data => { if (data) setRevenue2026(data); }); }, []);
useEffect(() => { fetchStockDates().then(setStockDates); }, []);
  const effectiveOrderColumns = useMemo(() => {
    if (orderColumns && orderColumns.length > 0) return orderColumns;
    if (orderData && orderData.length > 0) {
      return Object.keys(orderData[0]).filter(k => k && k.trim() !== '').map(k => ({ key: k, label: k, type: 'string' as const }));
    }
    return [];
  }, [orderColumns, orderData]);

  // Default week filter to current week
  useEffect(() => {
    const currentWeek = getWeekNumber();
    setUnifiedTimeFilters(prev => ({ ...prev, tuan: [String(currentWeek)] }));
  }, []);

  // ... (useMemo options blocks) ...

  const getUniqueOptions = (data: DataRow[], key: string | undefined) => {
    if (!key) return [];
    const set = new Set(data.map(d => String(d[key] || '').trim()).filter(Boolean));
    return Array.from(set).sort();
  };

  const congTrinhOptions = useMemo(() => getUniqueOptions(productionData, congTrinhKey), [productionData, congTrinhKey]);
  const xuongOptions = useMemo(() => getUniqueOptions(productionData, xuongKey), [productionData, xuongKey]);
  const tinhTrangOptions = useMemo(() => getUniqueOptions(productionData, tinhTrangKey), [productionData, tinhTrangKey]);
  const tinhTrangIpoOptions = useMemo(() => getUniqueOptions(productionData, tinhTrangIpoKey), [productionData, tinhTrangIpoKey]);

  const khsxNamOptions = useMemo(() => getUniqueOptions(khsxData, khsxNamKey), [khsxData, khsxNamKey]);
  const khsxThangOptions = useMemo(() => getUniqueOptions(khsxData, khsxThangKey), [khsxData, khsxThangKey]);
  const khsxNgayOptions = useMemo(() => getUniqueOptions(khsxData, khsxNgayKey), [khsxData, khsxNgayKey]);
  const khsxTuanOptions = useMemo(() => getUniqueOptions(khsxData, khsxTuanKey), [khsxData, khsxTuanKey]);

  const invNamOptions = useMemo(() => getUniqueOptions(inventoryData, invNamKey), [inventoryData, invNamKey]);
  const invThangOptions = useMemo(() => getUniqueOptions(inventoryData, invThangKey), [inventoryData, invThangKey]);
  const invNgayOptions = useMemo(() => getUniqueOptions(inventoryData, invNgayKey), [inventoryData, invNgayKey]);
  const invTuanOptions = useMemo(() => getUniqueOptions(inventoryData, invTuanKey), [inventoryData, invTuanKey]);

  const unifiedNamOptions = useMemo(() => {
    const s = new Set([...khsxNamOptions, ...invNamOptions]);
    return Array.from(s).sort().reverse();
  }, [khsxNamOptions, invNamOptions]);

  const unifiedThangOptions = useMemo(() => {
    const s = new Set([...khsxThangOptions, ...invThangOptions]);
    return Array.from(s).sort((a, b) => parseInt(a) - parseInt(b));
  }, [khsxThangOptions, invThangOptions]);

  const unifiedNgayOptions = useMemo(() => {
    const s = new Set([...khsxNgayOptions, ...invNgayOptions]);
    return Array.from(s).sort((a, b) => {
      const valA = parseInt(a);
      const valB = parseInt(b);
      if (!isNaN(valA) && !isNaN(valB)) {
        return valA - valB;
      }
      return a.localeCompare(b);
    });
  }, [khsxNgayOptions, invNgayOptions]);

  const unifiedTuanOptions = useMemo(() => {
    const s = new Set([...khsxTuanOptions, ...invTuanOptions]);
    return Array.from(s).sort((a, b) => {
      const valA = parseInt(a);
      const valB = parseInt(b);
      if (!isNaN(valA) && !isNaN(valB)) {
        return valA - valB;
      }
      return a.localeCompare(b);
    });
  }, [khsxTuanOptions, invTuanOptions]);


const unifiedDateOptions = useMemo(() => {
    const dates = new Set<string>();
    const addDates = (data: DataRow[], key: string | undefined) => {
      if (!key) return;
      data.forEach(row => {
        const val = row[key];
        if (val) {
          const formatted = formatDateToVN(val);
          if (formatted) dates.add(formatted);
        }
      });
    };

    addDates(orderData, orderDateKey);
    addDates(tkbvData, tkbvDateKey);
    addDates(pthspData, pthspDateKey);
    addDates(inventoryData, invDateKey);

    return Array.from(dates).sort((a, b) => {
      const dateA = parseVNDate(a);
      const dateB = parseVNDate(b);
      if (dateA && dateB) return dateB.getTime() - dateA.getTime();
      return b.localeCompare(a);
    });
  }, [orderData, tkbvData, pthspData, inventoryData, orderDateKey, tkbvDateKey, pthspDateKey, invDateKey]);

  const overviewDateRangeDisplay = useMemo(() => getDateRangeDisplay(overviewDateFilters, unifiedDateOptions), [overviewDateFilters, unifiedDateOptions]);

   const getContextLabel = () => {
    if (overviewDateFilters.length === 0) return "Thống kê toàn bộ thời gian";
    if (overviewDateFilters.length === 1) return `Thống kê số liệu trong ngày: ${overviewDateFilters[0]}`;
    return `Thống kê số liệu các ngày: ${overviewDateFilters.join(', ')}`;
  };

  useEffect(() => {
    if (!hasInitializedOverviewDate.current && unifiedDateOptions.length > 0) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const dd = String(yesterday.getDate()).padStart(2, '0');
      const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
      const yyyy = yesterday.getFullYear();

      const yesterdayStrSlash = `${dd}/${mm}/${yyyy}`;
      const yesterdayStrDash = `${dd}-${mm}-${yyyy}`;

      const targetDate = unifiedDateOptions.find(opt =>
        opt === yesterdayStrSlash || opt === yesterdayStrDash
      );

      if (targetDate) {
        setOverviewDateFilters([targetDate]);
      } else {
        setOverviewDateFilters([unifiedDateOptions[0]]);
      }

      hasInitializedOverviewDate.current = true;
    }
  }, [unifiedDateOptions]);

  // ... (Filtered data logic) ...

  const filteredProductionData = useMemo(() => {
    return productionData.filter(row => {
      const matchCongTrinh = filters.congTrinh.length === 0 || (congTrinhKey && filters.congTrinh.includes(String(row[congTrinhKey] || '').trim()));
      const matchXuong = filters.xuong.length === 0 || (xuongKey && filters.xuong.includes(String(row[xuongKey] || '').trim()));
      const matchTinhTrang = filters.tinhTrang.length === 0 || (tinhTrangKey && filters.tinhTrang.includes(String(row[tinhTrangKey] || '').trim()));
      const matchTinhTrangIpo = filters.tinhTrangIpo.length === 0 || (tinhTrangIpoKey && filters.tinhTrangIpo.includes(String(row[tinhTrangIpoKey] || '').trim()));

      return matchCongTrinh && matchXuong && matchTinhTrang && matchTinhTrangIpo;
    });
  }, [productionData, filters, congTrinhKey, xuongKey, tinhTrangKey, tinhTrangIpoKey]);

  const filteredMaterialData = useMemo(() => {
    return materialData.filter(row => {
      const matchCongTrinh = filters.congTrinh.length === 0 || (matCongTrinhKey && filters.congTrinh.includes(String(row[matCongTrinhKey] || '').trim()));
      return matchCongTrinh;
    });
  }, [materialData, filters.congTrinh, matCongTrinhKey]);

  const displayedMaterialData = useMemo(() => {
    if (selectedMaterialGroups.length === 0) return filteredMaterialData;
    return filteredMaterialData.filter(row => {
      const group = String(row[matNhomVtKey] || 'Chưa phân nhóm').trim();
      return selectedMaterialGroups.includes(group);
    });
  }, [filteredMaterialData, selectedMaterialGroups, matNhomVtKey]);

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

  // Filter for Analysis Data (Applied global filters)
  const filteredAnalysisData = useMemo(() => {
    return analysisData.filter(row => {
      const matchCongTrinh = filters.congTrinh.length === 0 || (analysisCongTrinhKey && filters.congTrinh.includes(String(row[analysisCongTrinhKey] || '').trim()));
      const matchXuong = filters.xuong.length === 0 || (analysisXuongKey && filters.xuong.includes(String(row[analysisXuongKey] || '').trim()));
      return matchCongTrinh && matchXuong;
    });
  }, [analysisData, filters.congTrinh, filters.xuong, analysisCongTrinhKey, analysisXuongKey]);

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


  const formatNumber = (value: number, metric?: MetricType) => {
    if (metric === 'COUNT_HEX') return value.toLocaleString('en-US');
    if (value >= 1_000_000_000) return (value / 1_000_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' Tỷ';
    if (value >= 1_000_000) return (value / 1).toLocaleString('en-US', { maximumFractionDigits: 0 }) + '';
    return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
  };

  const formatDecimal = (value: number) => !isFinite(value) ? '0' : value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const scrollToRef = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (ref.current) ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

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

  const handleExportProductionStatus = () => {
    setSelectedExportColumns(productionColumns.map(col => col.key));
    setIsProductionExportModalOpen(true);
  };

  const handleOpenOrderExport = () => {
    setOrderExportScope('FILTERED');
    setIsOrderExportScopeModalOpen(true);
  };

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


useEffect(() => {
  const requestId = ++overviewFetchIdRef.current;
  const controller = new AbortController();

  // Debounce 300ms — gộp các lần đổi filter liên tiếp thành 1 request
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

  // Cleanup: nếu effect chạy lại trước khi debounce/timeout xong,
  // hủy timer VÀ hủy request HTTP đang bay (nếu đã gửi đi)
  return () => {
    clearTimeout(timer);
    controller.abort();
  };
}, [overviewDateFilters]);


// --- 2. useEffect cho khsx summary (thay bản cũ) ---



const latestUnifiedDate = useMemo<Date | null>(() => {
  if (overviewSummary?.date) return parseVNDate(overviewSummary.date) || new Date(overviewSummary.date);
  return null;
}, [overviewSummary]);

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


  const loadGroupAnalysis = async (key: 'order' | 'tkbv' | 'pthsp' | 'inventory' | 'export') => {
    const dateISO = overviewSummary?.date;
    const kW = `${key}-xuong-${dateISO}`;
    const kP = `${key}-congtrinh-${dateISO}`;
    if (groupAnalysisCache[kW] && groupAnalysisCache[kP]) return;
    const [byXuong, byCongTrinh] = await Promise.all([
      fetchOverviewByGroup(key, 'xuong', dateISO),
      fetchOverviewByGroup(key, 'congtrinh', dateISO),
    ]);
    setGroupAnalysisCache(prev => ({ ...prev, [kW]: byXuong, [kP]: byCongTrinh }));
  };

  const toAnalysisItems = (rows: GroupAnalysisRow[]): AnalysisItem[] =>
    rows.map(r => ({
      name: r.name,
      daily: overviewMetric === 'COUNT' ? r.dailyCount : r.dailyValue,
      mtd: overviewMetric === 'COUNT' ? r.mtdCount : r.mtdValue,
    }));

  useEffect(() => { if (isIpoDetailModalOpen) loadGroupAnalysis('order'); }, [isIpoDetailModalOpen, overviewSummary?.date]);
  useEffect(() => { if (isTkbvDetailModalOpen) loadGroupAnalysis('tkbv'); }, [isTkbvDetailModalOpen, overviewSummary?.date]);
  useEffect(() => { if (isPthspDetailModalOpen) loadGroupAnalysis('pthsp'); }, [isPthspDetailModalOpen, overviewSummary?.date]);
  useEffect(() => { if (isInventoryDetailModalOpen) loadGroupAnalysis('inventory'); }, [isInventoryDetailModalOpen, overviewSummary?.date]);
  useEffect(() => { if (isExportDetailModalOpen) loadGroupAnalysis('export'); }, [isExportDetailModalOpen, overviewSummary?.date]);

const filteredExportOverviewData = useMemo(() => {
    return exportData.filter(row => {
      const dateMatch = overviewDateFilters.length === 0 || (expDateKey && overviewDateFilters.includes(formatDateToVN(row[expDateKey])));
      const congTrinhMatch = filters.congTrinh.length === 0 || (expCongTrinhKey && filters.congTrinh.includes(String(row[expCongTrinhKey!] || '').trim()));
      const xuongMatch = filters.xuong.length === 0 || (expXuongKey && filters.xuong.includes(String(row[expXuongKey!] || '').trim()));
      return dateMatch && congTrinhMatch && xuongMatch;
    });
  }, [exportData, overviewDateFilters, filters.congTrinh, filters.xuong, expDateKey, expCongTrinhKey, expXuongKey]);


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

  const latestStockStats = useMemo(() => {
    const entry = stockDates[0];
    return { count: entry?.count ?? 0, value: entry?.value ?? 0, date: latestStockDateAvailable };
  }, [stockDates, latestStockDateAvailable]);

    const stockOverviewCardValue = useMemo(() => {
  if (!closestStockDate) return 0;
  const dateStr = toISODateLocal(closestStockDate);
  const entry = stockDates.find(s => {
    const sDate = parseVNDate(s.date) || new Date(s.date);
    return toISODateLocal(sDate) === dateStr;   // compare normalized YYYY-MM-DD, not raw strings
  });
  if (!entry) return 0;
  return overviewMetric === 'COUNT' ? entry.count : entry.value;
}, [stockDates, closestStockDate, overviewMetric]);

    useEffect(() => {
    if (isStockDetailModalOpen && closestStockDate) {
      fetchStockByProject(toISODateLocal(closestStockDate)).then(setStockByProjectData);
    }
  }, [isStockDetailModalOpen, closestStockDate]);


  const filteredInventoryData = useMemo(() => {
    return inventoryData.filter(row => {
      const matchGeneralCongTrinh = filters.congTrinh.length === 0 || (invCongTrinhKey && filters.congTrinh.includes(String(row[invCongTrinhKey] || '').trim()));
      const matchGeneralXuong = filters.xuong.length === 0 || (invXuongKey && filters.xuong.includes(String(row[invXuongKey] || '').trim()));
      const matchNam = unifiedTimeFilters.nam.length === 0 || (invNamKey && unifiedTimeFilters.nam.includes(String(row[invNamKey] || '').trim()));
      const matchThang = unifiedTimeFilters.thang.length === 0 || (invThangKey && unifiedTimeFilters.thang.includes(String(row[invThangKey] || '').trim()));

      let matchTuan = true;
      let matchNgay = true;
      if (viewMode === 'WEEK') {
        matchTuan = unifiedTimeFilters.tuan.length === 0 || (!!invTuanKey && unifiedTimeFilters.tuan.includes(String(row[invTuanKey] || '').trim()));
        matchNgay = unifiedTimeFilters.ngay.length === 0 || (!!invNgayKey && unifiedTimeFilters.ngay.includes(String(row[invNgayKey] || '').trim()));
      }

      return matchGeneralCongTrinh && matchGeneralXuong && matchNam && matchThang && matchTuan && matchNgay;
    });
  }, [inventoryData, filters.congTrinh, filters.xuong, unifiedTimeFilters, viewMode, invCongTrinhKey, invXuongKey, invNamKey, invThangKey, invNgayKey, invTuanKey]);




  // New logic for Weekly Plan vs Actual Data using Analysis Data Source
  const weeklyPlanVsActualData = useMemo(() => {
    if (viewMode === 'MONTH') return [];
    if (!analysisXuongKey || !analysisPlanKey || !analysisActualKey) return [];

    const map = new Map<string, {
      name: string,
      plan: number,
      actualWeek: number,
      dungKh: number,
      thucHienDungKh1Phan: number,
      rotKh: number,
      thucHienRotKh1Phan: number,
      nhapKhoTruocKh: number,
      vuotKh: number,
      nhapKhoNgoaiKh: number
    }>();

    filteredAnalysisData.forEach(row => {
      // Use Unified Time Filter (tuan)
      if (unifiedTimeFilters.tuan.length > 0 && analysisWeekKey) {
        const rowWeek = String(row[analysisWeekKey] || '').trim();
        if (!unifiedTimeFilters.tuan.includes(rowWeek)) return;
      }
      const xuong = String(row[analysisXuongKey] || 'Chưa phân xưởng').trim();

      const plan = parseNumber(row[analysisPlanKey]) / 1000;
      const actual = parseNumber(row[analysisActualKey]) / 1000;

      // Parse new columns
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
          nhapKhoNgoaiKh: 0
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
    analysisNhapKhoTruocKhKey, analysisVuotKhKey, analysisNhapKhoNgoaiKhKey
  ]);

  const productivityAnalysisData = useMemo(() => {
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
    const result: any[] = [];

    allKeys.forEach(xuong => {
      const att = attendanceMap.get(xuong) || { name: xuong, totalSoLuongCn: 0, totalDinhBien: 0, entryCount: 0, gioCongHc: 0, gioCongTc: 0 };
      const sales = inventoryMap.get(xuong) || 0;

      // 1. Worker Count as Average
      const avgWorkers = att.entryCount > 0 ? att.totalSoLuongCn / att.entryCount : 0;
      const avgDinhBien = att.entryCount > 0 ? att.totalDinhBien / att.entryCount : 0;
      const totalHours = att.gioCongHc + att.gioCongTc;

      // 3. Derived Metrics
      // BQ DS / 1 Giờ công
      const salesPerHour = totalHours > 0 ? sales / totalHours : 0;
      // BQ DS / 1 Công nhân
      const salesPerWorker = avgWorkers > 0 ? sales / avgWorkers : 0;
      // Tỉ lệ Giờ tăng ca / Tổng giờ công
      const overtimeRate = totalHours > 0 ? (att.gioCongTc / totalHours) * 100 : 0;
      // BQ Giờ công / 1 Công nhân
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
        hoursPerWorker
      });
    });

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [
    attendanceData, filteredInventoryData, viewMode, unifiedTimeFilters.tuan, unifiedTimeFilters.nam, unifiedTimeFilters.thang, unifiedTimeFilters.ngay,
    attXuongKey, attTuanKey, attNamKey, attThangKey, attNgayKey, attSoLuongCnKey, attGioCongHcKey, attGioCongTcKey, attDinhBienKey,
    invXuongKey, invThanhTienKey
  ]);

  const calculateMetricValue = (row: DataRow, metric: MetricType): number => {
    if (metric === 'COUNT_HEX') return 1;
    if (metric === 'SUM_GT_CON_LAI') return parseNumber(row[realValueKey]);
    if (metric === 'SUM_GT_DON_HANG') return parseNumber(row[valueKey]);
    return 0;
  };

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

      if (!status.includes('15. CHƯA TRIỂN KHAI') && !status.includes('14. CHƯA PHIẾU') && !status.includes('11. CHƯA SX')) {
        agg[ctName].inProduction += valToAddTicket;
      }

      const valToAddInventory = isCount ? (inventoryValRaw > 0 ? 1 : 0) : (inventoryValRaw / 1000);
      agg[ctName].inventory += valToAddInventory;
    });
    return Object.entries(agg).map(([name, data]) => ({ name, ...data, remaining: data.totalOrder - data.inventory, notDeployed: data.totalOrder - data.deployed, percentComplete: data.totalOrder > 0 ? (data.inventory / data.totalOrder) * 100 : 0 })).sort((a, b) => b.totalOrder - a.totalOrder);
  }, [filteredProductionData, congTrinhKey, tinhTrangKey, triGiaDonHangTongKey, thanhTienTinhPhieuKey, thanhTienNhapKhoKey, projectSummaryMetric]);

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
      total
    };
  }, [filteredProductionData, bopKey, workshopMetric, valueKey, realValueKey, tinhTrangKey, xuongKey]);

const customFunnelData = useMemo(() => {
    if (!pivotFunnelData || !pivotFunnelData.data) return [];

    const getVal = (bop: string) => pivotFunnelData.data.find(d => d.name === bop)?.value || 0;

    let p022Val = 0;
    if (closestStockDate && stockDateKey && stockValueKey) {
      const filteredStockRows = stockData.filter(r => {
        const rowDate = parseVNDate(String(r[stockDateKey] || '').trim());
        return rowDate && rowDate.getTime() === closestStockDate.getTime();
      });

      // Kiểm tra xem đang chọn xem theo Số lượng (COUNT) hay Giá trị (SUM)
      if (workshopMetric === 'COUNT_HEX') {
        const uniqueSapIds = new Set(filteredStockRows.map(r => String(r[stockSapIdKey] || '').trim()).filter(Boolean));
        p022Val = uniqueSapIds.size > 0 ? uniqueSapIds.size : filteredStockRows.length;
      } else {
        p022Val = filteredStockRows.reduce((sum, row) => sum + parseNumber(row[stockValueKey]), 0);
      }
    }

    const funnelItems = [
      { id: 'P001', name: 'P001. TỔNG ĐƠN HÀNG NHÀ MÁY CÒN LẠI', value: getVal('P001'), color: '#3b82f6' }, // blue-500
      { id: 'P002', name: 'P002. Bản vẽ kỹ thuật', value: getVal('P002'), color: '#fdba74' }, // orange-300 (peach)
      { id: 'P012', name: 'P012. Có phiếu chưa sản xuất', value: getVal('P012'), color: '#a3e635' }, // lime-400
      { id: 'P013', name: 'P013. Ra phôi sơ chế', value: getVal('P013'), color: '#a3e635' },
      { id: 'GCVT', name: 'P013. GCVT', value: getVal('GCVT'), color: '#a3e635' },
      { id: 'P014', name: 'P014. Tinh chỉnh định hình', value: getVal('P014'), color: '#a3e635' },
      { id: 'P016', name: 'P016. Lắp ráp tinh chỉnh', value: getVal('P016'), color: '#a3e635' },
      { id: 'P018', name: 'P018. Sơn - làm màu', value: getVal('P018'), color: '#a3e635' },
      { id: 'P020', name: 'P020. Lắp ráp hoàn thiện', value: getVal('P020'), color: '#a3e635' },
      { id: 'P021', name: 'P021. Đóng gói hoàn thành', value: getVal('P021'), color: '#a3e635' },
      { id: 'P022', name: 'P022. TỒN KHO', value: p022Val, color: '#eab308' } // yellow-500
    ];

    const maxVal = Math.max(...funnelItems.map(item => item.value), 1);

    return funnelItems.map(item => ({
      ...item,
      percentage: Math.max((item.value / maxVal) * 100, 2) // min 2% width so it's visible
    }));
  }, [pivotFunnelData, stockData, closestStockDate, stockDateKey, stockValueKey, workshopMetric, stockSapIdKey]);

  const pivotProjectData = useMemo<ProjectPivotData | null>(() => {
    if (!congTrinhKey || !tinhTrangKey) return null;
    const dataToUse = excludeFabrics ? filteredProductionData.filter(r => { const hm = String(r[hangMucKey] || '').toLowerCase(); return !hm.includes('vải') && !hm.includes('gối'); }) : filteredProductionData;
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

  const getMaterialRowClassName = (row: DataRow): string => {
    const status = String(row[matStatusSapKey] || '').toLowerCase();
    if (status.includes('hủy')) return 'bg-gray-100 text-gray-500 italic';
    if (status.includes('hoàn thành') || status.includes('đóng') || status.includes('xong')) return 'bg-green-100 text-green-800';
    if (status.includes('mở') || status.includes('open') || !status) {
      if (matEstDateKey) {
        const dateStr = String(row[matEstDateKey] || '');
        const date = parseVNDate(dateStr);
        if (date) {
          const diff = diffDays(date, new Date());
          if (diff < 0) return 'bg-red-100 text-yellow-700 font-bold';
          if (diff === 0) return 'bg-orange-200 text-orange-800 animate-pulse font-bold';
          if (diff >= 1 && diff <= 5) return 'bg-yellow-50 text-slate-700';
          if (diff > 5) return 'bg-yellow-200 text-slate-700';
        }
      }
    }
    return 'bg-white hover:bg-slate-50';
  };

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

  const clearFilters = () => {
    setFilters({ congTrinh: [], xuong: [], tinhTrang: [], tinhTrangIpo: [] });
  };

  const toggleMaterialGroup = (group: string) => {
    setSelectedMaterialGroups(prev => {
      if (prev.includes(group)) return prev.filter(g => g !== group);
      return [...prev, group];
    });
  };

  const hasActiveFilters = filters.congTrinh.length > 0 || filters.xuong.length > 0 || filters.tinhTrang.length > 0 || filters.tinhTrangIpo.length > 0;

  const totalMaterialPages = Math.ceil(displayedMaterialData.length / MATERIAL_ITEMS_PER_PAGE);
  const paginatedMaterialList = displayedMaterialData.slice(
    (materialListPage - 1) * MATERIAL_ITEMS_PER_PAGE,
    materialListPage * MATERIAL_ITEMS_PER_PAGE
  );

  const ProjectChartTooltip = ({ active, payload, label }: any) => {
    const formatValue = (value: any) => {
      if (value === null || value === undefined) return '0';
      return Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
    };

    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const plan = data.khValue || 0;
      const actual = data.thValue || 0;
      const percent = plan > 0 ? (actual / plan) * 100 : 0;

      return (
        <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg">
          <p className="text-xs font-bold text-slate-700 mb-2">{data.name}</p>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-emerald-600 font-medium">Kế hoạch:</span>
              <span className="text-sm font-bold text-emerald-700">
                {formatValue(plan)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-blue-600 font-medium">Thực hiện:</span>
              <span className="text-sm font-bold text-blue-700">
                {formatValue(actual)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-1 mt-1">
              <span className="text-xs text-slate-500 font-medium">% Đạt:</span>
              <span className={`text-sm font-bold ${percent >= 80 ? 'text-emerald-600' : percent >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                {percent.toLocaleString('en-US', { maximumFractionDigits: 1 })}%
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const WorkshopChartTooltip = ({ active, payload, label }: any) => {
    const formatValue = (value: any) => {
      if (value === null || value === undefined) return '0';
      return Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    };

    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const plan = data.khValue || 0;
      const actual = data.thValue || 0;
      const percent = plan > 0 ? (actual / plan) * 100 : 0;

      return (
        <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg">
          <p className="text-xs font-bold text-slate-700 mb-2">{data.name}</p>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-emerald-600 font-medium">Kế hoạch:</span>
              <span className="text-sm font-bold text-emerald-700">
                {formatValue(plan)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-blue-600 font-medium">Thực hiện:</span>
              <span className="text-sm font-bold text-blue-700">
                {formatValue(actual)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-1 mt-1">
              <span className="text-xs text-slate-500 font-medium">% Đạt:</span>
              <span className={`text-sm font-bold ${percent >= 80 ? 'text-emerald-600' : percent >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                {percent.toLocaleString('en-US', { maximumFractionDigits: 1 })}%
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const YearlyPlanWorkshopTooltip = ({ active, payload, label }: any) => {
    const formatValue = (value: any) => {
      if (value === null || value === undefined) return '0';
      return Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    };

    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const plan = data.plan || 0;
      const actual = data.actual || 0;
      const percent = plan > 0 ? (actual / plan) * 100 : 0;

      return (
        <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg">
          <p className="text-xs font-bold text-slate-700 mb-2">{data.name}</p>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-emerald-600 font-medium">Kế hoạch:</span>
              <span className="text-sm font-bold text-emerald-700">
                {formatValue(plan)} Tỷ
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-blue-600 font-medium">Thực hiện:</span>
              <span className="text-sm font-bold text-blue-700">
                {formatValue(actual)} Tỷ
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-1 mt-1">
              <span className="text-xs text-slate-500 font-medium">% Đạt:</span>
              <span className={`text-sm font-bold ${percent >= 80 ? 'text-emerald-600' : percent >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                {percent.toLocaleString('en-US', { maximumFractionDigits: 1 })}%
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const targetRevenue2026 = revenue2026?.targetRevenue2026 ?? 0;
  const quarterlyTargets = revenue2026?.quarterlyTargets ?? { q1: 0, q2: 0, q3: 0, q4: 0 };
  const factoryRevenueStats = {
    actual: revenue2026?.actual.value ?? 0,
    percent: revenue2026?.actual.percent ?? 0,
  };
  const yearlyPlan2026WorkshopChartData = revenue2026?.byWorkshop ?? [];

  const factoryRevenueChartData = useMemo(() => [{
    name: 'Năm 2026',
    thucHien: factoryRevenueStats.actual,
    conLai: Math.max(0, targetRevenue2026 - factoryRevenueStats.actual),
    fullTarget: targetRevenue2026,
  }], [factoryRevenueStats.actual, targetRevenue2026]);

  if (productionData.length === 0 && materialData.length === 0 && khsxData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        Không có dữ liệu để hiển thị.
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-y-auto h-full custom-scrollbar pb-24 bg-wood-50">

      {/* Sticky Header & Filters */}
      <div className="sticky top-0 z-40 bg-wood-50/95 backdrop-blur-sm border-b border-wood-200 px-4 py-3 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Tổng quan</h2>
            </div>
            {/* Anchor Buttons */}
            <div className="flex gap-2">
              <button onClick={() => scrollToRef(factoryRevenueRef)} className="p-1.5 text-xs bg-white border border-slate-200 rounded hover:bg-wood-50 text-slate-600 flex items-center gap-1 shadow-sm" title="Đến Doanh số nhà máy">
                <Target size={14} className="text-emerald-600" /> Doanh số
              </button>
              <button onClick={() => scrollToRef(orderOverviewRef)} className="p-1.5 text-xs bg-white border border-slate-200 rounded hover:bg-wood-50 text-slate-600 flex items-center gap-1 shadow-sm" title="Đến Tổng quan Đơn hàng">
                <ShoppingCart size={14} className="text-pink-600" /> Tổng quan
              </button>
              <button onClick={() => scrollToRef(productionStatusRef)} className="p-1.5 text-xs bg-white border border-slate-200 rounded hover:bg-wood-50 text-slate-600 flex items-center gap-1 shadow-sm" title="Đến Tình trạng sản xuất">
                <CheckCircle size={14} className="text-emerald-600" /> Tình trạng sản xuất
              </button>
              <button onClick={() => scrollToRef(bottleneckSectionRef)} className="p-1.5 text-xs bg-white border border-slate-200 rounded hover:bg-wood-50 text-slate-600 flex items-center gap-1 shadow-sm" title="Đến Báo cáo Điểm nghẽn">
                <AlertTriangle size={14} className="text-red-600" /> Điểm nghẽn
              </button>
              <button onClick={() => scrollToRef(khsxSectionRef)} className="p-1.5 text-xs bg-white border border-slate-200 rounded hover:bg-wood-50 text-slate-600 flex items-center gap-1 shadow-sm" title="Đến Kế hoạch & Nhập kho">
                <BarChart2 size={14} className="text-indigo-600" /> Kế hoạch-Thực hiện
              </button>
            </div>
          </div>

          {/* Dashboard Filters */}
          <div className="flex flex-wrap gap-2 items-center w-full md:w-auto justify-end">
            <div className="flex items-center gap-2 mr-1 text-slate-500">
              <Filter size={14} /> <span className="text-[10px] uppercase font-bold">Bộ lọc tổng:</span>
            </div>
            {congTrinhKey && (
              <DashboardFilter
                label="Tên Công Trình"
                options={congTrinhOptions}
                selectedValues={filters.congTrinh}
                onChange={(vals) => setFilters(prev => ({ ...prev, congTrinh: vals }))}
              />
            )}
            {xuongKey && (
              <DashboardFilter
                label="Khu Vực Sản Xuất"
                options={xuongOptions}
                selectedValues={filters.xuong}
                onChange={(vals) => setFilters(prev => ({ ...prev, xuong: vals }))}
              />
            )}
            {tinhTrangIpoKey && (
              <DashboardFilter
                label="Tình Trạng IPO"
                options={tinhTrangIpoOptions}
                selectedValues={filters.tinhTrangIpo}
                onChange={(vals) => setFilters(prev => ({ ...prev, tinhTrangIpo: vals }))}
              />
            )}
            {tinhTrangKey && (
              <DashboardFilter
                label="Tình Trạng"
                options={tinhTrangOptions}
                selectedValues={filters.tinhTrang}
                onChange={(vals) => setFilters(prev => ({ ...prev, tinhTrang: vals }))}
              />
            )}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Xóa bộ lọc"
              >
                <CloseIcon size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 space-y-6">

        {/* --- SECTION: FACTORY REVENUE OVERVIEW (2026) --- */}
        <div ref={factoryRevenueRef} className="scroll-mt-24 w-full bg-white p-5 rounded-xl shadow-sm border border-emerald-100 flex flex-col">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-emerald-50 pb-4">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600">
                <Target size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">TỔNG QUAN DOANH SỐ NHÀ MÁY (Năm 2026)</h3>
                <p className="text-xs text-slate-500">Tiến độ thực hiện (Nhập kho) so với chỉ tiêu kế hoạch năm</p>
              </div>
            </div>

          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Left Column: Progress Bar & Cards */}
            {/* Left Column: Progress Bar & Cards */}
            <div className="lg:col-span-1 flex flex-col gap-6 h-full">

              {/* 1. Progress Bar (Moved Here) */}
              <div className="w-full">
                <div className="flex justify-between items-end mb-2">
                  <p className="text-xs font-bold text-slate-500 uppercase">Tiến độ tổng thể</p>
                  <span className="text-[10px] text-slate-400"></span>
                </div>
                <div className="h-[110px] w-full bg-slate-50 rounded-lg border border-slate-100 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={factoryRevenueChartData}
                      margin={{ top: 20, right: 30, left: 30, bottom: 20 }}
                      barSize={24}
                    >
					  <XAxis type="number" hide domain={[0, (dataMax: number) => dataMax * 1.05]} />
                      <YAxis type="category" dataKey="name" hide />
                      <RechartsTooltip
                        cursor={{ fill: 'transparent' }}
                        formatter={(value: number, name: string) => {
                          if (name === 'thucHien') return [formatDecimal(value) + ' Tỷ', 'Thực hiện (Lũy kế)'];
                          if (name === 'conLai') return [formatDecimal(value) + ' Tỷ', 'Còn lại'];
                          return [value, name];
                        }}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}
                      />
                      <Bar dataKey="thucHien" stackId="a" fill="#3b82f6" radius={[4, 0, 0, 4]}>
                        <LabelList dataKey="thucHien" position="center" fill="white" fontSize={10} fontWeight="bold" formatter={(val: number) => val > 0 ? formatDecimal(val) : ''} />
                      </Bar>
                      <Bar dataKey="conLai" stackId="a" fill="#e2e8f0" radius={[0, 4, 4, 0]} />

                      {/* Checkpoint Flags (Triangles) */}
                      <ReferenceLine x={quarterlyTargets.q1} stroke="none" label={(props: any) => <CheckpointTriangle {...props} />} />
                      <ReferenceLine x={quarterlyTargets.q2} stroke="none" label={(props: any) => <CheckpointTriangle {...props} />} />
                      <ReferenceLine x={quarterlyTargets.q3} stroke="none" label={(props: any) => <CheckpointTriangle {...props} />} />
                      <ReferenceLine x={quarterlyTargets.q4} stroke="none" label={(props: any) => <CheckpointTriangle {...props} />} />

                      {/* Quarter Reference Lines & Labels */}
                      {quarterlyTargets.q1 > 0 && (
                        <ReferenceLine x={quarterlyTargets.q1} stroke="#ea580c" strokeDasharray="3 3">
                          <Label value={`Quý I: ${formatDecimal(quarterlyTargets.q1)}`} position="insideBottom" fill="#c2410c" fontSize={12} fontWeight="bold" dy={20} />
                        </ReferenceLine>
                      )}
                      {quarterlyTargets.q2 > 0 && (
                        <ReferenceLine x={quarterlyTargets.q2} stroke="#0891b2" strokeDasharray="3 3">
                          <Label value={`Quý II: ${formatDecimal(quarterlyTargets.q2)}`} position="insideBottom" fill="#0e7490" fontSize={12} fontWeight="bold" dy={20} />
                        </ReferenceLine>
                      )}
                      {quarterlyTargets.q3 > 0 && (
                        <ReferenceLine x={quarterlyTargets.q3} stroke="#7c3aed" strokeDasharray="3 3">
                          <Label value={`Quý III: ${formatDecimal(quarterlyTargets.q3)}`} position="insideBottom" fill="#6d28d9" fontSize={12} fontWeight="bold" dy={20} />
                        </ReferenceLine>
                      )}
                      {quarterlyTargets.q4 > 0 && (
                        <ReferenceLine x={quarterlyTargets.q4} stroke="#dc2626" strokeDasharray="3 3">
                          <Label value={`Quý IV: ${formatDecimal(quarterlyTargets.q4)}`} position="insideBottom" fill="#b91c1c" fontSize={12} fontWeight="bold" dy={20} />
                        </ReferenceLine>
                      )}

                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 2. Metric Cards - Refactored to Horizontal Row with "Overview Report" Styles */}
              <div className="grid grid-cols-3 gap-4 flex-1">
                {/* Card 1: Kế hoạch Năm - Green Theme */}
                <div className="p-2 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg border border-emerald-100 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-1.5 mb-0.5 z-10">
                    <div className="p-1 bg-emerald-100 rounded text-emerald-600 shadow-sm"><Target size={18} /></div>
                    <p className="text-xs font-bold text-emerald-800 opacity-80 uppercase tracking-wide">Kế hoạch Năm</p>
                  </div>
                  <div className="z-10 flex items-baseline gap-1 pl-0.5">
                    <h4 className="text-3xl font-extrabold text-emerald-600 tracking-tight">{formatDecimal(targetRevenue2026)}</h4>
                    <span className="text-xs font-medium text-emerald-500">Tỷ</span>
                  </div>
                </div>

                {/* Card 2: Thực hiện Lũy kế - Blue Theme */}
                <div className="p-2 bg-gradient-to-br from-blue-50 to-sky-50 rounded-lg border border-blue-100 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-1.5 mb-0.5 z-10">
                    <div className="p-1 bg-blue-100 rounded text-blue-600 shadow-sm"><CheckCircle size={18} /></div>
                    <p className="text-xs font-bold text-blue-800 opacity-80 uppercase tracking-wide">Thực hiện Lũy kế</p>
                  </div>
                  <div className="z-10 flex items-baseline gap-1 pl-0.5">
                    <h4 className="text-3xl font-extrabold text-blue-600 tracking-tight">{formatDecimal(factoryRevenueStats.actual)}</h4>
                    <span className="text-xs font-medium text-blue-500">Tỷ</span>
                  </div>
                </div>

                {/* Card 3: Tỷ lệ Đạt - Violet Theme */}
                <div className="p-2 bg-gradient-to-br from-violet-50 to-fuchsia-50 rounded-lg border border-violet-100 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-1.5 mb-0.5 z-10">
                    <div className="p-1 bg-violet-100 rounded text-violet-600 shadow-sm"><Activity size={18} /></div>
                    <p className="text-xs font-bold text-violet-800 opacity-80 uppercase tracking-wide">Tỷ lệ Đạt</p>
                  </div>
                  <div className="z-10 flex items-baseline gap-1 pl-0.5">
                    <h4 className={`text-3xl font-extrabold tracking-tight ${factoryRevenueStats.percent >= 100 ? 'text-emerald-600' : factoryRevenueStats.percent >= 80 ? 'text-violet-600' : 'text-amber-600'}`}>
                      {formatDecimal(factoryRevenueStats.percent)}%
                    </h4>
                  </div>
                </div>
              </div>


            </div>

            {/* Right Column: Workshop Comparison Chart */}
            <div className="lg:col-span-2 flex flex-col bg-white rounded-xl border border-slate-100 p-4 shadow-sm h-full min-h-[400px]">
              {yearlyPlan2026WorkshopChartData.length > 0 ? (
                <>
                  <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2 uppercase tracking-wide">
                    <BarChart2 className="w-4 h-4 text-emerald-600" /> Phân bổ Kế hoạch theo Xưởng (2026)
                  </h4>
                  <div className="flex-1 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={yearlyPlan2026WorkshopChartData} margin={{ top: 20, right: 30, left: 0, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="name" angle={-25} textAnchor="end" height={60} tick={{ fontSize: 10, fill: '#64748b' }} interval={0} />
                        <YAxis tickFormatter={(val) => formatDecimal(val)} tick={{ fontSize: 10, fill: '#64748b' }} />
                        <RechartsTooltip content={<YearlyPlanWorkshopTooltip />} cursor={{ fill: '#f8fafc' }} />
                        <Legend verticalAlign="top" height={36} />
                        <Bar dataKey="plan" name="Kế hoạch (Tỷ)" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30}>
                          <LabelList dataKey="plan" position="top" formatter={(val: number) => val > 0 ? formatDecimal(val) : ''} fontSize={10} fill="#059669" />
                        </Bar>
                        <Bar dataKey="actual" name="Thực hiện (Tỷ)" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30}>
                          <LabelList
                            dataKey="actual"
                            position="top"
                            content={(props: any) => {
                              const { x, y, width, value, index } = props;
                              const item = yearlyPlan2026WorkshopChartData[index as number];
                              const plan = item?.plan || 0;
                              const actual = Number(value) || 0;

                              if (actual <= 0) return null;

                              const percent = plan > 0 ? (actual / plan) * 100 : 0;

                              return (
                                <text x={x + width / 2} y={y - 15} fill="#2563eb" fontSize={10} textAnchor="middle">
                                  <tspan x={x + width / 2} dy="0">{formatDecimal(actual)}</tspan>
                                  <tspan x={x + width / 2} dy="12">({Math.round(percent)}%)</tspan>
                                </text>
                              );
                            }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400">Không có dữ liệu xưởng</div>
              )}
            </div>
          </div>
        </div>

        {/* --- MOVED SECTION: ORDER OVERVIEW (RENAMED TO BÁO CÁO TỔNG QUAN) --- */}
        {/* ... (Order Overview content unchanged) ... */}
        {(orderData.length > 0 || tkbvData.length > 0 || pthspData.length > 0) && (
          <div ref={orderOverviewRef} className="scroll-mt-24 w-full bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-700 flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-pink-600" />BÁO CÁO TỔNG QUAN</h3>
                <p className="text-xs font-medium text-slate-500 mt-1">{getContextLabel()}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-slate-400">Dữ liệu từ nguồn Đơn hàng tổng & TKBV & PTHSP & Nhập Kho</span>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">CHẾ ĐỘ HIỂN THỊ:</span>
                  <div className="flex items-center bg-white p-0.5 rounded border border-slate-200 shadow-sm mt-0.5">
                    <button onClick={() => setOverviewMetric('COUNT')} className={`px-2 py-0.5 text-[10px] font-bold rounded-sm transition-all ${overviewMetric === 'COUNT' ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Số lượng</button>
                    <div className="w-px h-2.5 bg-slate-200 mx-0.5"></div>
                    <button onClick={() => setOverviewMetric('SUM')} className={`px-2 py-0.5 text-[10px] font-bold rounded-sm transition-all ${overviewMetric === 'SUM' ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Giá trị</button>
                  </div>
                </div>
                <div className="w-px h-8 bg-slate-200 mx-1"></div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">BỘ LỌC NGÀY CHUNG (ALL):</span>
                  {overviewDateRangeDisplay && <span className="text-[10px] text-indigo-600 font-semibold">{overviewDateRangeDisplay}</span>}
                </div>
                <DashboardFilter
                  label="NGÀY BÁO CÁO"
                  options={unifiedDateOptions}
                  selectedValues={overviewDateFilters}
                  onChange={setOverviewDateFilters}
                />
                <button onClick={handleExportOverviewSummary} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg border border-emerald-100 bg-white ml-2" title="Xuất Excel tổng hợp"><Download size={16} /></button>
                {overviewDateFilters.length > 0 && (<button onClick={() => setOverviewDateFilters([])} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg border border-red-100 bg-white" title="Xóa lọc ngày"><CloseIcon size={16} /></button>)}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="flex flex-col gap-4">
                <div className="p-5 bg-gradient-to-br from-pink-50 to-rose-50 rounded-xl border border-pink-100 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-shadow h-full min-h-[160px]">
                  <button onClick={() => setIsIpoDetailModalOpen(true)} className="absolute top-4 right-4 text-pink-400 hover:text-pink-700 transition-colors z-20" title="Xem chi tiết">
                    <Eye size={18} />
                  </button>
                  <div className="flex items-center gap-2 mb-3 z-10">
                    <div className="p-2 bg-pink-100 rounded-lg text-pink-600 shadow-sm group-hover:scale-110 transition-transform"><ShoppingCart size={20} /></div>
                    <p className="text-sm font-bold text-pink-800 opacity-80 uppercase tracking-wide">1. Đơn hàng mới (P001)</p>
                  </div>
                  <div className="z-10 flex flex-col items-start">
                    <span className="text-[10px] font-bold text-pink-500 uppercase tracking-wider opacity-70 mb-1 block">Trong ngày</span>
                    <div className="flex items-baseline gap-2">
                                           <h4 className="text-4xl font-extrabold text-pink-600 tracking-tight">
                        {overviewMetric === 'COUNT'
                          ? (overviewSummary?.order.daily.count ?? 0).toLocaleString('en-US')
                          : ((overviewSummary?.order.daily.value ?? 0) / 1000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                      </h4>
                      <span className="text-sm font-medium text-pink-400">
                        {overviewMetric === 'COUNT' ? 'đơn hàng (HEX)' : 'Tỷ'}
                      </span>
                    </div>
                  </div>
                  <div className="z-10 mt-3 pt-3 border-t border-pink-200/60 w-full">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold text-pink-800 uppercase">Lũy kế T{latestUnifiedDate?.getMonth()! + 1}:</span>
                                            <span className="text-3xl font-extrabold text-pink-700">
                        {overviewMetric === 'COUNT'
                          ? `${(overviewSummary?.order.mtd.count ?? 0).toLocaleString('en-US')} đơn`
                          : ((overviewSummary?.order.mtd.value ?? 0) / 1000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' Tỷ'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="p-5 bg-gradient-to-br from-blue-50 to-sky-50 rounded-xl border border-blue-100 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-shadow h-full min-h-[160px]">
                  <button onClick={() => setIsTkbvDetailModalOpen(true)} className="absolute top-4 right-4 text-blue-400 hover:text-blue-700 transition-colors z-20" title="Xem chi tiết">
                    <Eye size={18} />
                  </button>
                  <div className="flex items-center gap-2 mb-3 z-10">
                    <div className="p-2 bg-blue-100 rounded-lg text-blue-600 shadow-sm group-hover:scale-110 transition-transform"><FileText size={20} /></div>
                    <p className="text-sm font-bold text-blue-800 opacity-80 uppercase tracking-wide">2. Đã Triển khai BV (P002)</p>
                  </div>
                  <div className="z-10 flex flex-col items-start">
                    <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider opacity-70 mb-1 block">Trong ngày</span>
                    <div className="flex items-baseline gap-2">
                                            <h4 className="text-4xl font-extrabold text-blue-600 tracking-tight">
                        {overviewMetric === 'COUNT'
                          ? (overviewSummary?.tkbv.daily.count ?? 0).toLocaleString('en-US')
                          : ((overviewSummary?.tkbv.daily.value ?? 0) / 1000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                      </h4>
                      <span className="text-sm font-medium text-blue-400">
                        {overviewMetric === 'COUNT' ? 'bản vẽ (Items)' : 'Tỷ'}
                      </span>
                    </div>
                  </div>
                  <div className="z-10 mt-3 pt-3 border-t border-blue-200/60 w-full">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold text-blue-800 uppercase">Lũy kế T{latestUnifiedDate?.getMonth()! + 1}:</span>
                                            <span className="text-3xl font-extrabold text-blue-700">
                        {overviewMetric === 'COUNT'
                          ? `${(overviewSummary?.tkbv.mtd.count ?? 0).toLocaleString('en-US')} bản vẽ`
                          : ((overviewSummary?.tkbv.mtd.value ?? 0) / 1000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' Tỷ'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="p-5 bg-gradient-to-br from-purple-50 to-fuchsia-50 rounded-xl border border-purple-100 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-shadow h-full min-h-[160px]">
                  <button onClick={() => setIsPthspDetailModalOpen(true)} className="absolute top-4 right-4 text-purple-400 hover:text-purple-700 transition-colors z-20" title="Xem chi tiết">
                    <Eye size={18} />
                  </button>
                  <div className="flex items-center gap-2 mb-3 z-10">
                    <div className="p-2 bg-purple-100 rounded-lg text-purple-600 shadow-sm group-hover:scale-110 transition-transform"><ClipboardList size={20} /></div>
                    <p className="text-sm font-bold text-purple-800 opacity-80 uppercase tracking-wide">3. Đã Tính phiếu (P012)</p>
                  </div>
                  <div className="z-10 flex flex-col items-start">
                    <span className="text-[10px] font-bold text-purple-500 uppercase tracking-wider opacity-70 mb-1 block">Trong ngày</span>
                    <div className="flex items-baseline gap-2">
                                            <h4 className="text-4xl font-extrabold text-purple-600 tracking-tight">
                        {overviewMetric === 'COUNT'
                          ? (overviewSummary?.pthsp.daily.count ?? 0).toLocaleString('en-US')
                          : ((overviewSummary?.pthsp.daily.value ?? 0) / 1000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                      </h4>
                      <span className="text-sm font-medium text-purple-400">
                        {overviewMetric === 'COUNT' ? 'phiếu (Items)' : 'Tỷ'}
                      </span>
                    </div>
                  </div>
                  <div className="z-10 mt-3 pt-3 border-t border-purple-200/60 w-full">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold text-purple-800 uppercase">Lũy kế T{latestUnifiedDate?.getMonth()! + 1}:</span>
                                            <span className="text-3xl font-extrabold text-purple-700">
                        {overviewMetric === 'COUNT'
                          ? `${(overviewSummary?.pthsp.mtd.count ?? 0).toLocaleString('en-US')} phiếu`
                          : ((overviewSummary?.pthsp.mtd.value ?? 0) / 1000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' Tỷ'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="p-5 bg-gradient-to-br from-teal-50 to-emerald-50 rounded-xl border border-teal-100 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-shadow h-full min-h-[160px]">
                  <button onClick={() => setIsInventoryDetailModalOpen(true)} className="absolute top-4 right-4 text-teal-400 hover:text-teal-700 transition-colors z-20" title="Xem chi tiết">
                    <Eye size={18} />
                  </button>
                  <div className="flex items-center gap-2 mb-3 z-10">
                    <div className="p-2 bg-teal-100 rounded-lg text-teal-600 shadow-sm group-hover:scale-110 transition-transform"><Package size={20} /></div>
                    <p className="text-sm font-bold text-teal-800 opacity-80 uppercase tracking-wide">4. Nhập kho (P022)</p>
                  </div>
                  <div className="z-10 flex flex-col items-start">
                    <span className="text-[10px] font-bold text-teal-500 uppercase tracking-wider opacity-70 mb-1 block">Trong ngày</span>
                    <div className="flex items-baseline gap-2">
                                            <h4 className="text-4xl font-extrabold text-teal-600 tracking-tight">
                        {overviewMetric === 'COUNT'
                          ? (overviewSummary?.inventory.daily.count ?? 0).toLocaleString('en-US')
                          : ((overviewSummary?.inventory.daily.value ?? 0) / 1000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                      </h4>
                      <span className="text-sm font-medium text-teal-400">
                        {overviewMetric === 'COUNT' ? 'items' : 'Tỷ'}
                      </span>
                    </div>
                  </div>
                                    {(overviewSummary?.inventory.mtd.count ?? 0) > 0 && (
                    <div className="z-10 mt-3 pt-3 border-t border-teal-200/60 w-full">
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-bold text-teal-800 uppercase">Lũy kế T{latestUnifiedDate?.getMonth()! + 1}:</span>
                        <span className="text-3xl font-extrabold text-teal-700">
                          {overviewMetric === 'COUNT'
                            ? `${(overviewSummary?.inventory.mtd.count ?? 0).toLocaleString('en-US')} items`
                            : ((overviewSummary?.inventory.mtd.value ?? 0) / 1000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' Tỷ'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 5: Xuất kho */}
              <div className="flex flex-col gap-4">
                <div className="p-5 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-100 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-shadow h-full min-h-[160px]">
                  <button onClick={() => setIsExportDetailModalOpen(true)} className="absolute top-4 right-4 text-amber-400 hover:text-amber-700 transition-colors z-20" title="Xem chi tiết">
                    <Eye size={18} />
                  </button>
                  <div className="flex items-center gap-2 mb-3 z-10">
                    <div className="p-2 bg-amber-100 rounded-lg text-amber-600 shadow-sm group-hover:scale-110 transition-transform"><Package size={20} /></div>
                    <p className="text-sm font-bold text-amber-800 opacity-80 uppercase tracking-wide">5. Xuất kho (P025)</p>
                  </div>
                  <div className="z-10 flex flex-col items-start">
                    <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider opacity-70 mb-1 block">Trong ngày</span>
                    <div className="flex items-baseline gap-2">
                                           <h4 className="text-4xl font-extrabold text-amber-600 tracking-tight">
                        {overviewMetric === 'COUNT'
                          ? (overviewSummary?.export.daily.count ?? 0).toLocaleString('en-US')
                          : ((overviewSummary?.export.daily.value ?? 0) / 1000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                      </h4>
                      <span className="text-sm font-medium text-amber-400">
                        {overviewMetric === 'COUNT' ? 'items' : 'Tỷ'}
                      </span>
                    </div>
                  </div>
                  <div className="z-10 mt-3 pt-3 border-t border-amber-200/60 w-full">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold text-amber-800 uppercase">Lũy kế T{latestUnifiedDate?.getMonth()! + 1}:</span>
                                            <span className="text-3xl font-extrabold text-amber-700">
                        {overviewMetric === 'COUNT'
                          ? `${(overviewSummary?.export.mtd.count ?? 0).toLocaleString('en-US')} items`
                          : ((overviewSummary?.export.mtd.value ?? 0) / 1000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' Tỷ'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 6: Tồn kho */}
              <div className="flex flex-col gap-4">
                <div className="p-5 bg-gradient-to-br from-gray-50 to-slate-100 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-shadow h-full min-h-[160px]">
                  <button onClick={() => setIsStockDetailModalOpen(true)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 transition-colors z-20" title="Xem chi tiết">
                    <Eye size={18} />
                  </button>
                  <div className="flex items-center gap-2 mb-3 z-10">
                    <div className="p-2 bg-slate-200 rounded-lg text-slate-600 shadow-sm group-hover:scale-110 transition-transform"><Box size={20} /></div>
                    <p className="text-sm font-bold text-slate-800 opacity-80 uppercase tracking-wide">6. Tồn kho</p>
                  </div>
                  <div className="z-10 flex flex-col items-start">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider opacity-70 mb-1 block">
                      Dữ liệu ngày: {closestStockDate ? `${closestStockDate.getDate().toString().padStart(2, '0')}/${(closestStockDate.getMonth() + 1).toString().padStart(2, '0')}/${closestStockDate.getFullYear()}` : 'N/A'}
                    </span>
                    <div className="flex items-baseline gap-2">
                      <h4 className="text-4xl font-extrabold text-slate-700 tracking-tight">
                        {overviewMetric === 'COUNT'
                          ? stockOverviewCardValue.toLocaleString('en-US')
                          : (stockOverviewCardValue / 1000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                      </h4>
                      <span className="text-sm font-medium text-slate-500">
                        {overviewMetric === 'COUNT' ? 'items' : 'Tỷ'}
                      </span>
                    </div>
                  </div>
                  <div className="z-10 mt-3 pt-3 border-t border-slate-200/60 w-full">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-slate-600 uppercase">
                        Giá trị tồn mới nhất ({latestStockStats.date ? `${latestStockStats.date.getDate().toString().padStart(2, '0')}/${(latestStockStats.date.getMonth() + 1).toString().padStart(2, '0')}/${latestStockStats.date.getFullYear()}` : 'N/A'})
                      </span>
                      <div className="flex justify-end mt-1">
                        <span className="text-3xl font-extrabold text-slate-700">
                          {overviewMetric === 'COUNT'
                            ? `${latestStockStats.count.toLocaleString('en-US')} items`
                            : (latestStockStats.value / 1000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' Tỷ'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}



        <div ref={productionStatusRef} id="production-status-section" className="scroll-mt-24 w-full bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-8">

          {/* Funnel Chart - TÌNH TRẠNG ĐƠN HÀNG AATN */}
          <div className="mb-0">
            <div className="flex justify-end mb-3">
              <button
                onClick={() => setIsFunnelPivotModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 font-medium text-xs border border-slate-200 transition-colors"
                title="Xem bảng chi tiết"
              >
                <Eye size={14} /> Chi tiết
              </button>
            </div>

            <div className="w-full flex flex-col bg-slate-50/50 p-6 rounded-xl border border-slate-200 relative">
              <h3 className="font-serif text-2xl md:text-3xl font-bold uppercase text-center mb-8 text-slate-800 tracking-wide">
                TÌNH TRẠNG ĐƠN HÀNG AATN
              </h3>

              <div className="flex flex-row gap-[30px] w-full max-w-5xl mx-auto relative mt-2">
                <div className="w-auto shrink-0 flex flex-col gap-3">
                  {customFunnelData.map((item) => (
                    <div key={`lbl-${item.id}`} className="h-10 text-right font-semibold text-slate-700 text-sm flex items-center justify-end whitespace-nowrap">
                      {item.name}
                    </div>
                  ))}
                </div>

                <div className="flex-1 relative flex flex-col gap-3 min-w-0">
                  <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-30">
                    <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100" className="overflow-visible">
                      <polygon
                        points="-2,0 102,0 50,100"
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="2px"
                        strokeDasharray="6 4"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  </div>

                  {customFunnelData.map((item) => (
                    <div key={`bar-${item.id}`} className="h-10 flex justify-center w-full relative z-20">
                      <div
                        className="h-full flex items-center justify-center rounded-sm transition-all duration-500 shadow-sm"
                        style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                        title={`${item.name}: ${formatNumber(item.value, workshopMetric)}`}
                      >
                        <span className="text-black font-bold text-sm truncate px-1">
                          {Math.round(item.value / 1000).toLocaleString('en-US')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-row justify-between items-start border-b border-slate-100 pb-4">
            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
                <Activity className="w-5 h-5 text-wood-600" /> TÌNH TRẠNG SẢN XUẤT
              </h3>
              <p className="text-xs text-slate-500">Tổng hợp năng lực sản xuất hiện tại và phân bổ chi tiết theo xưởng</p>
            </div>
            <button onClick={handleExportProductionStatus} className="p-1.5 text-slate-500 hover:text-wood-600 hover:bg-wood-50 rounded-lg transition-colors border border-slate-200" title="Xuất dữ liệu sản xuất"><Download size={16} /></button>
          </div>

          <div>
            <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2 uppercase tracking-wide">
              <Layers className="w-4 h-4 text-wood-500" /> 1. Phân tích Khả năng & Thành tiền
            </h4>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-green-50/50 rounded-xl p-2 border border-green-100 flex flex-col gap-2">
                <CompactStatCard title="CÓ THỂ SẢN XUẤT" value={formatNumber(cardMetrics.coTheSX)} icon={<CheckCircle className="w-5 h-5 text-green-600" />} bg="bg-green-50" borderColor="border-green-400" textColor="text-green-800" isParent={true} />
                <div className="grid grid-cols-3 gap-2">
                  <CompactStatCard title="VECNI + FITTING" value={formatNumber(cardMetrics.vecniFitting)} icon={<div className="w-2 h-2 rounded-full bg-blue-500"></div>} bg="bg-white" borderColor="border-blue-200" textColor="text-slate-700" />
                  <CompactStatCard title="ĐANG TRÊN CHUYỀN" value={formatNumber(cardMetrics.chuyenKhac)} icon={<div className="w-2 h-2 rounded-full bg-indigo-500"></div>} bg="bg-white" borderColor="border-indigo-200" textColor="text-slate-700" />
                  <CompactStatCard title="CÓ PHIẾU CHƯA SX" value={formatNumber(cardMetrics.coPhieuChuaSX)} icon={<div className="w-2 h-2 rounded-full bg-amber-500"></div>} bg="bg-white" borderColor="border-amber-200" textColor="text-slate-700" />
                </div>
              </div>
              <div className="bg-red-50/50 rounded-xl p-2 border border-red-100 flex flex-col gap-2">
                <CompactStatCard title="CHƯA THỂ SẢN XUẤT" value={formatNumber(cardMetrics.chuaTheSX)} icon={<CloseIcon className="w-5 h-5 text-red-600" />} bg="bg-red-50" borderColor="border-red-400" textColor="text-red-800" isParent={true} />
                <div className="grid grid-cols-2 gap-2">
                  <CompactStatCard title="VƯỚNG SL CHƯA REV" value={formatNumber(cardMetrics.vuongSL)} icon={<div className="w-2 h-2 rounded-full bg-orange-500"></div>} bg="bg-white" borderColor="border-orange-200" textColor="text-slate-700" />
                  <CompactStatCard title="CHƯA TRIỂN KHAI SX" value={formatNumber(cardMetrics.chuaTrienKhai)} icon={<div className="w-2 h-2 rounded-full bg-slate-400"></div>} bg="bg-white" borderColor="border-slate-300" textColor="text-slate-700" />
                </div>
              </div>
            </div>
          </div>

          <div ref={pivotWorkshopRef}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
              <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
                <TableIcon className="w-4 h-4 text-wood-500" /> 2. Chi tiết Giá trị (Tình Trạng x Khu vực sản xuất)
              </h4>
              <MetricSwitcher current={workshopMetric} onChange={setWorkshopMetric} />
            </div>
            {pivotWorkshopData ? (
              <div className="overflow-x-auto custom-scrollbar border border-slate-200 rounded-lg">
                <table className="w-full text-xs text-right min-w-[900px]">
                  <thead className="bg-wood-50 text-slate-700 font-semibold uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left bg-wood-50 border-b border-wood-200 min-w-[150px]">
                        <div className="flex items-center justify-between">
                          <span>BOP</span>
                          <div className="flex gap-1 ml-2">
                            <button onClick={() => setExpandedBops(new Set(pivotWorkshopData.uniqueBops))} className="p-1 hover:bg-wood-200 rounded text-wood-600" title="Mở rộng tất cả"><PlusSquare size={14} /></button>
                            <button onClick={() => setExpandedBops(new Set())} className="p-1 hover:bg-wood-200 rounded text-wood-600" title="Thu gọn tất cả"><MinusSquare size={14} /></button>
                          </div>
                        </div>
                      </th>
                      <th className="px-3 py-2 text-left sticky left-0 bg-wood-50 border-b border-wood-200 z-10 min-w-[180px]">Tình Trạng</th>
                      {pivotWorkshopData.uniqueWorkshops.map((w: string) => (<th key={w} className="px-3 py-2 border-b border-wood-200 whitespace-nowrap text-wood-800">{w}</th>))}
                      <th className="px-3 py-2 bg-wood-100 border-b border-wood-200 font-bold text-slate-800">Tổng Cộng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pivotWorkshopData.uniqueBops.map((bop) => {
                      const isExpanded = expandedBops.has(bop);
                      const toggleExpand = () => {
                        const next = new Set(expandedBops);
                        if (isExpanded) next.delete(bop);
                        else next.add(bop);
                        setExpandedBops(next);
                      };

                      const bopRows = pivotWorkshopData.rows.filter(r => r.bop === bop);

                      return (
                        <React.Fragment key={bop}>
                          <tr className="bg-slate-100/80 hover:bg-slate-200/50 transition-colors cursor-pointer" onClick={toggleExpand}>
                            <td className="px-3 py-2 text-left font-bold text-slate-700 border-r border-slate-200 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <button className="text-slate-500 hover:text-slate-800">
                                  {isExpanded ? <MinusSquare size={14} /> : <PlusSquare size={14} />}
                                </button>
                                {bop || '-'}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-left font-bold text-slate-700 sticky left-0 bg-slate-100/80 z-10 whitespace-nowrap border-r border-slate-200">
                              Tổng ({bopRows.length})
                            </td>
                            {pivotWorkshopData.uniqueWorkshops.map((w: string) => {
                              const val = pivotWorkshopData.bopTotals[bop]?.[w] || 0;
                              return (<td key={w} className={`px-3 py-2 whitespace-nowrap font-semibold ${val === 0 ? 'text-slate-400' : 'text-slate-700'}`}>{val === 0 ? '-' : formatNumber(val, workshopMetric)}</td>);
                            })}
                            <td className="px-3 py-2 font-bold text-slate-800 bg-wood-50/80">{formatNumber(pivotWorkshopData.bopRowTotals[bop], workshopMetric)}</td>
                          </tr>

                          {isExpanded && bopRows.map((rowItem) => (
                            <tr key={rowItem.key} className="hover:bg-slate-50 transition-colors">
                              <td className="px-3 py-2 text-left text-slate-400 border-r border-slate-100 whitespace-nowrap"></td>
                              <td className="px-3 py-2 text-left font-medium text-slate-700 sticky left-0 bg-white hover:bg-slate-50 z-10 whitespace-nowrap border-r border-slate-100 pl-6">
                                {rowItem.status}
                              </td>
                              {pivotWorkshopData.uniqueWorkshops.map((w: string) => {
                                const matrix = pivotWorkshopData?.matrix || {};
                                const val = matrix?.[rowItem.key]?.[w] || 0;
                                return (<td key={w} className={`px-3 py-2 whitespace-nowrap ${val === 0 ? 'text-slate-300' : 'text-slate-600'}`}>{val === 0 ? '-' : formatNumber(val, workshopMetric)}</td>);
                              })}
                              <td className="px-3 py-2 font-bold text-slate-800 bg-wood-50/50">{formatNumber(pivotWorkshopData.rowTotals[rowItem.key], workshopMetric)}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-wood-100 font-bold text-slate-800 border-t border-wood-300">
                    <tr>
                      <td colSpan={2} className="px-3 py-2 text-left sticky left-0 bg-wood-100 z-10">Tổng Cộng</td>
                      {pivotWorkshopData.uniqueWorkshops.map((w: string) => (<td key={w} className="px-3 py-2 whitespace-nowrap">{formatNumber(pivotWorkshopData.colTotals[w], workshopMetric)}</td>))}
                      <td className="px-3 py-2 text-wood-800 text-sm">{formatNumber(pivotWorkshopData.grandTotal, workshopMetric)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg">Không đủ dữ liệu hoặc thiếu cấu hình cột để tạo bảng Pivot.</div>}
          </div>
        </div>

        {bottleneckData.length > 0 && (
          <div ref={bottleneckSectionRef} className="scroll-mt-24 w-full bg-white p-6 rounded-xl shadow-sm border border-red-100 flex flex-col gap-6">
            <div className="flex flex-row justify-between items-start border-b border-red-50 pb-4">
              <div className="flex items-center gap-3">
                <div className="bg-red-50 p-2 rounded-lg text-red-600">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">BÁO CÁO TỶ TRỌNG ĐIỂM NGHẼN</h3>
                  <p className="text-xs text-slate-500">Phân tích thời gian tồn tại của các hạng mục (HEX) tại từng công đoạn</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200 shadow-inner">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 hidden sm:inline-block">CHẾ ĐỘ XEM:</span>
                  <button
                    onClick={() => setBottleneckViewMode('BOP')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all duration-200 ${bottleneckViewMode === 'BOP' ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                  >
                    BOP
                  </button>
                  <button
                    onClick={() => setBottleneckViewMode('TÌNH TRẠNG')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all duration-200 ${bottleneckViewMode === 'TÌNH TRẠNG' ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                  >
                    TÌNH TRẠNG
                  </button>
                </div>
                <button onClick={handleExportBottlenecks} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg border border-red-100" title="Xuất báo cáo điểm nghẽn"><Download size={16} /></button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={bottleneckData}
                    stackOffset="expand"
                    margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="name"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      interval={0}
                    />
                    <YAxis
                      tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                      tick={{ fontSize: 10, fill: '#64748b' }}
                    />
                    <RechartsTooltip
                      formatter={(value: number, name: string) => [value, name]}
                      labelStyle={{ fontWeight: 'bold', color: '#1e293b' }}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
                    />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      iconType="circle"
                      wrapperStyle={{ fontSize: '11px', fontWeight: 500 }}
                    />

                    <Bar dataKey="Từ 4 tuần trở lên" stackId="a" fill="#ef4444" barSize={30}>
                      <LabelList dataKey="Từ 4 tuần trở lên" position="center" fill="#ffffff" fontSize={10} fontWeight="bold" formatter={(v: any) => v > 0 ? v : ''} />
                    </Bar>
                    <Bar dataKey="3 tuần" stackId="a" fill="#f97316" barSize={30}>
                      <LabelList dataKey="3 tuần" position="center" fill="#ffffff" fontSize={10} fontWeight="bold" formatter={(v: any) => v > 0 ? v : ''} />
                    </Bar>
                    <Bar dataKey="2 tuần" stackId="a" fill="#eab308" barSize={30}>
                      <LabelList dataKey="2 tuần" position="center" fill="#ffffff" fontSize={10} fontWeight="bold" formatter={(v: any) => v > 0 ? v : ''} />
                    </Bar>
                    <Bar dataKey="4-7 NGÀY" stackId="a" fill="#3b82f6" barSize={30}>
                      <LabelList dataKey="4-7 NGÀY" position="center" fill="#ffffff" fontSize={10} fontWeight="bold" formatter={(v: any) => v > 0 ? v : ''} />
                    </Bar>
                    <Bar dataKey="<3 NGÀY" stackId="a" fill="#22c55e" barSize={30}>
                      <LabelList dataKey="<3 NGÀY" position="center" fill="#ffffff" fontSize={10} fontWeight="bold" formatter={(v: any) => v > 0 ? v : ''} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-red-50/50 rounded-xl p-5 border border-red-100 flex flex-col">
                <div className="flex items-center gap-2 mb-4 text-red-700">
                  <Clock className="w-5 h-5" />
                  <h4 className="font-bold uppercase text-sm">Top Điểm Nghẽn (Trên 4 Tuần)</h4>
                </div>

                {topBottlenecks.length > 0 ? (
                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                    {topBottlenecks.map((item, index) => (
                      <div key={index} className="bg-white p-3 rounded-lg border border-red-200 shadow-sm flex items-center justify-between group hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-700 font-bold text-xs">{index + 1}</span>
                          <div>
                            <p className="text-xs font-bold text-slate-700">{item.name}</p>
                            <p className="text-[10px] text-red-500 font-medium">Tồn đọng lâu</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-bold text-red-600 block leading-none">{item.count}</span>
                          <span className="text-[9px] text-slate-400 uppercase">items</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-center p-4">
                    <CheckCircle className="w-10 h-10 text-green-400 mb-2 opacity-50" />
                    <p className="text-xs">Không có công đoạn nào tồn đọng trên 4 tuần.</p>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-red-200">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Tổng cảnh báo:</span>
                    <span className="font-bold text-red-700">{topBottlenecks.reduce((a, b) => a + b.count, 0)} items</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {(khsxData.length > 0 || inventoryData.length > 0) && (
          <div ref={khsxSectionRef} className="scroll-mt-24 bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-6">
            <div className="flex flex-col gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-orange-500 to-indigo-600 p-2 rounded-lg text-white">
                  <BarChart2 size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Thống kê Tổng hợp: Kế hoạch & Nhập kho</h3>
                  <p className="text-xs text-slate-500">So sánh trực quan giữa Kế hoạch (KH) và Thực tế (TH) với bộ lọc thời gian thống nhất</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
                <div className="flex items-center gap-2 mr-2">
                  <Filter size={14} className="text-slate-500" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase">BỘ LỌC THỜI GIAN CHUNG:</span>
                </div>

                <div className="flex bg-white rounded-lg border border-slate-200 p-0.5 shadow-sm">
                  <button
                    onClick={() => { setViewMode('MONTH'); setUnifiedTimeFilters(prev => ({ ...prev, tuan: [], ngay: [] })); }}
                    className={`px-3 py-1 text-[10px] font-bold rounded ${viewMode === 'MONTH' ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    Xem theo THÁNG
                  </button>
                  <button
                    onClick={() => {
                      setViewMode('WEEK');
                      setUnifiedTimeFilters(prev => {
                        if (prev.tuan.length === 0) {
                          return { ...prev, tuan: [String(getWeekNumber())] };
                        }
                        return prev;
                      });
                    }}
                    className={`px-3 py-1 text-[10px] font-bold rounded ${viewMode === 'WEEK' ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    Xem theo TUẦN
                  </button>
                </div>

                <div className="w-px h-6 bg-slate-300 mx-1"></div>

                <DashboardFilter
                  label="LỌC NĂM"
                  options={unifiedNamOptions}
                  selectedValues={unifiedTimeFilters.nam}
                  onChange={(vals) => setUnifiedTimeFilters(prev => ({ ...prev, nam: vals }))}
                />
                <DashboardFilter
                  label="LỌC THÁNG"
                  options={unifiedThangOptions}
                  selectedValues={unifiedTimeFilters.thang}
                  onChange={(vals) => setUnifiedTimeFilters(prev => ({ ...prev, thang: vals }))}
                />

                {viewMode === 'WEEK' && (
                  <>
                    <DashboardFilter
                      label="LỌC TUẦN"
                      options={unifiedTuanOptions}
                      selectedValues={unifiedTimeFilters.tuan}
                      onChange={(vals) => setUnifiedTimeFilters(prev => ({ ...prev, tuan: vals }))}
                    />
                    <DashboardFilter
                      label="LỌC NGÀY"
                      options={unifiedNgayOptions}
                      selectedValues={unifiedTimeFilters.ngay}
                      onChange={(vals) => setUnifiedTimeFilters(prev => ({ ...prev, ngay: vals }))}
                    />
                  </>
                )}

                {(unifiedTimeFilters.nam.length > 0 || unifiedTimeFilters.thang.length > 0 || unifiedTimeFilters.tuan.length > 0 || unifiedTimeFilters.ngay.length > 0) && (
                  <button onClick={() => setUnifiedTimeFilters({ nam: [], thang: [], ngay: [], tuan: [] })} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg border border-red-100 bg-white" title="Xóa lọc thời gian">
                    <CloseIcon size={16} />
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-4 bg-orange-50 rounded-xl border border-orange-100 shadow-sm flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-orange-100 rounded text-orange-600"><Calendar size={18} /></div>
                  <p className="text-xs font-bold text-orange-800 opacity-70 uppercase">Tổng KH Sản Xuất</p>
                </div>
                <h4 className="text-2xl lg:text-3xl font-bold text-orange-600 tracking-tight">{formatDecimal(totalKhsxAmount)}</h4>
                <div className="mt-1 text-[10px] text-orange-800/60 italic">
                  {`Chế độ xem: ${viewMode === 'MONTH' ? 'Theo Tháng' : 'Theo Tuần'}`}
                </div>
              </div>
              <div className="p-4 bg-gradient-to-br from-teal-50 to-emerald-50 rounded-xl border border-teal-100 shadow-sm flex flex-col justify-center relative overflow-hidden">
                <div className="flex items-center gap-2 mb-2 z-10">
                  <div className="p-1.5 bg-teal-100 rounded text-teal-600"><TrendingUp size={18} /></div>
                  <p className="text-xs font-bold text-teal-800 opacity-70 uppercase">Tỷ lệ Thực hiện / KH</p>
                </div>
                <div className="flex items-baseline gap-2 z-10">
                  <h4 className={`text-3xl font-bold tracking-tight ${completionRate >= 80 ? 'text-emerald-600' : completionRate >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                    {formatDecimal(completionRate)}%
                  </h4>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full mt-3 z-10">
                  <div className={`h-1.5 rounded-full transition-all duration-500 ${completionRate >= 100 ? 'bg-emerald-500' : completionRate >= 80 ? 'bg-teal-500' : completionRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(completionRate, 100)}%` }}></div>
                </div>
                <div className="absolute right-0 top-0 opacity-10 transform translate-x-2 -translate-y-2">
                  <TrendingUp size={80} className="text-teal-600" />
                </div>
              </div>
              <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 shadow-sm flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-indigo-100 rounded text-indigo-600"><Import size={18} /></div>
                  <p className="text-xs font-bold text-indigo-800 opacity-70 uppercase">Tổng Thực Hiện (NK)</p>
                </div>
                <h4 className="text-2xl lg:text-3xl font-bold text-indigo-600 tracking-tight">{formatDecimal(totalInventoryAmount)}</h4>
              </div>
            </div>
            <div className="border-t border-slate-100 pt-2"></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" ref={inventorySectionRef}>
              <div className="h-[350px] w-full bg-slate-50 rounded-lg border border-slate-100 p-3 relative group hover:shadow-md transition-shadow">
                <div className="absolute top-3 left-4 text-xs font-bold text-slate-600 uppercase z-10 bg-white/80 px-2 py-1 rounded backdrop-blur-sm shadow-sm">SO SÁNH: KH vs TH (Theo Xưởng)</div>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={combinedWorkshopData} margin={{ top: 35, right: 30, left: 10, bottom: 50 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" angle={-25} textAnchor="end" height={60} tick={{ fontSize: 10 }} interval={0} />
                    <YAxis tickFormatter={formatDecimal} tick={{ fontSize: 10 }} width={45} domain={['auto', 'auto']} />
                    <RechartsTooltip content={<WorkshopChartTooltip />} cursor={{ fill: '#f8fafc' }} />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Bar dataKey="khValue" name="Kế hoạch (KH)" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20}><LabelList position="top" formatter={formatDecimal} fontSize={10} fill="#059669" /></Bar>
                    <Bar dataKey="thValue" name="Thực hiện (TH)" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20}>
                      <LabelList
                        dataKey="thValue"
                        position="top"
                        content={(props: any) => {
                          const { x, y, width, value, index } = props;
                          // Use index to find the corresponding plan value from data
                          const item = combinedWorkshopData[index as number];
                          const plan = item?.khValue || 0;
                          const actual = Number(value) || 0;

                          if (actual <= 0) return null;

                          const percent = plan > 0 ? (actual / plan) * 100 : 0;

                          return (
                            <text x={x + width / 2} y={y - 15} fill="#2563eb" fontSize={10} textAnchor="middle">
                              <tspan x={x + width / 2} dy="0">{formatDecimal(actual)}</tspan>
                              <tspan x={x + width / 2} dy="12">({Math.round(percent)}%)</tspan>
                            </text>
                          );
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="h-[350px] w-full bg-slate-50 rounded-lg border border-slate-100 p-3 relative group hover:shadow-md transition-shadow">
                <div className="absolute top-3 left-4 text-xs font-bold text-slate-600 uppercase z-10 bg-white/80 px-2 py-1 rounded backdrop-blur-sm shadow-sm">SO SÁNH: KH vs TH (Theo Công Trình - Top 10)</div>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={combinedProjectData} margin={{ top: 35, right: 30, left: 10, bottom: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                   <XAxis 
  dataKey="code" 
  angle={-50} 
  textAnchor="end" 
  height={80} 
  tick={{ fontSize: 10 }} 
  interval={0} 
  // THÊM DÒNG NÀY: Cắt chuỗi lấy phần sau dấu "_" nếu có
  tickFormatter={(value) => value.includes('_') ? value.split('_').pop() : value}
/>
                    <YAxis tickFormatter={formatDecimal} tick={{ fontSize: 10 }} width={45} domain={['auto', 'auto']} />
                    <RechartsTooltip content={<ProjectChartTooltip />} cursor={{ fill: '#f8fafc' }} />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Bar dataKey="khValue" name="Kế hoạch (KH)" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20}><LabelList position="top" formatter={formatDecimal} fontSize={10} fill="#059669" /></Bar>
                    <Bar dataKey="thValue" name="Thực hiện (TH)" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20}>
                      <LabelList
                        dataKey="thValue"
                        position="top"
                        content={(props: any) => {
                          const { x, y, width, value, index } = props;
                          // Use index to find the corresponding plan value from data
                          const item = combinedProjectData[index as number];
                          const plan = item?.khValue || 0;
                          const actual = Number(value) || 0;

                          if (actual <= 0) return null;

                          const percent = plan > 0 ? (actual / plan) * 100 : 0;

                          return (
                            <text x={x + width / 2} y={y - 15} fill="#2563eb" fontSize={10} textAnchor="middle">
                              <tspan x={x + width / 2} dy="0">{formatDecimal(actual)}</tspan>
                              <tspan x={x + width / 2} dy="12">({Math.round(percent)}%)</tspan>
                            </text>
                          );
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {viewMode === 'WEEK' && (
              <div className="w-full mt-4">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
                    <TableIcon className="w-4 h-4 text-orange-600" /> Phân tích Kế hoạch-Thực hiện Tuần
                  </h4>
                </div>

                {weeklyPlanVsActualData.length > 0 ? (
                  <div className="flex flex-col xl:flex-row gap-6 items-start">
                    {/* Bảng Tổng quan */}
                    <div className="overflow-x-auto custom-scrollbar border border-slate-200 rounded-lg flex-1 min-w-0">
                      <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                        <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
                          <TableIcon className="w-4 h-4 text-wood-500" />
                          {(() => {
                            const w = parseInt(unifiedTimeFilters.tuan[0] || '0');
                            if (!w) return 'KẾ HOẠCH-THỰC HIỆN TUẦN';
                            const { start, end } = getWeekRange2026(w);
                            const fmt = (d: Date) => `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
                            return `KẾ HOẠCH-THỰC HIỆN TUẦN ${w} (từ ${fmt(start)} đến ${fmt(end)})`;
                          })()}
                        </h4>
                        <button
                          onClick={() => setIsWeeklyDetailModalOpen(true)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-slate-200"
                          title="Xem chi tiết"
                        >
                          <Eye size={16} />
                        </button>
                      </div>
                      <table className="w-full text-xs text-right min-w-[800px]">
                        <thead className="bg-wood-50 text-slate-700 font-semibold uppercase">
                          <tr>
                            <th className="px-4 py-3 text-left sticky left-0 bg-wood-50 border-b border-wood-200 z-10 w-32">Xưởng Chính</th>
                            <th className="px-4 py-3 border-b border-wood-200 text-orange-900">Thành tiền Kế hoạch</th>
                            <th className="px-4 py-3 border-b border-wood-200 text-orange-900">Nhập kho Tuần</th>
                            <th className="px-4 py-3 border-b border-wood-200 text-orange-900">Tỷ lệ (Tuần/KH)</th>
                            <th className="px-4 py-3 border-b border-wood-200 text-green-700 bg-green-50">ĐÚNG TIẾN ĐỘ</th>
                            <th className="px-4 py-3 border-b border-wood-200 text-red-700 bg-red-50">CHẬM TIẾN ĐỘ</th>
                            <th className="px-4 py-3 border-b border-wood-200 text-teal-700 bg-teal-50">NGOÀI KẾ HOẠCH</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {weeklyPlanVsActualData.map((item, idx) => {
                            const dungTienDo = item.dungKh + item.thucHienDungKh1Phan + item.nhapKhoTruocKh;
                            const chamTienDo = item.rotKh + item.thucHienRotKh1Phan;
                            const ngoaiKeHoach = item.vuotKh + item.nhapKhoNgoaiKh;
                            const percent = item.plan > 0 ? (item.actualWeek / item.plan) * 100 : 0;

                            return (
                              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-3 text-left font-medium text-slate-700 sticky left-0 bg-white hover:bg-slate-50 z-10 border-r border-slate-100">{item.name}</td>
                                <td className="px-4 py-3 text-slate-600 font-bold">{formatDecimal(item.plan)}</td>
                                <td className="px-4 py-3 font-bold text-slate-800">{formatDecimal(item.actualWeek)}</td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-1 rounded font-bold text-[10px] inline-block w-16 text-center ${percent >= 80 ? 'bg-green-100 text-green-700' : percent >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                    {formatDecimal(percent)}%
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-green-700 bg-green-50/30 font-bold">{formatDecimal(dungTienDo)}</td>
                                <td className="px-4 py-3 text-red-700 bg-red-50/30 font-bold">{formatDecimal(chamTienDo)}</td>
                                <td className="px-4 py-3 text-teal-700 bg-teal-50/30 font-bold">{formatDecimal(ngoaiKeHoach)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-wood-100 font-bold text-slate-800 border-t border-wood-300">
                          <tr>
                            <td className="px-4 py-3 text-left sticky left-0 bg-wood-100 z-10">TỔNG CỘNG</td>
                            <td className="px-4 py-3">{formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.plan, 0))}</td>
                            <td className="px-4 py-3">{formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.actualWeek, 0))}</td>
                            <td className="px-4 py-3">
                              {(() => {
                                const totalPlan = weeklyPlanVsActualData.reduce((a, b) => a + b.plan, 0);
                                const totalActual = weeklyPlanVsActualData.reduce((a, b) => a + b.actualWeek, 0);
                                const totalPercent = totalPlan > 0 ? (totalActual / totalPlan) * 100 : 0;
                                return `${formatDecimal(totalPercent)}%`;
                              })()}
                            </td>
                            <td className="px-4 py-3 text-green-800 bg-green-100/50">
                              {formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.dungKh + b.thucHienDungKh1Phan + b.nhapKhoTruocKh, 0))}
                            </td>
                            <td className="px-4 py-3 text-red-800 bg-red-100/50">
                              {formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.rotKh + b.thucHienRotKh1Phan, 0))}
                            </td>
                            <td className="px-4 py-3 text-teal-800 bg-teal-100/50">
                              {formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.vuotKh + b.nhapKhoNgoaiKh, 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>


                    {/* Venn Diagram */}
                    <div className="w-full xl:w-auto xl:max-w-[40%] shrink-0">
                      {(() => {
                        // Calculate Data for Venn Diagram
                        const totalPlan = weeklyPlanVsActualData.reduce((a, b) => a + b.plan, 0);
                        const totalActual = weeklyPlanVsActualData.reduce((a, b) => a + b.actualWeek, 0);

                        // Intersection (Đúng tiến độ)
                        const intersection = weeklyPlanVsActualData.reduce((a, b) => a + b.dungKh + b.thucHienDungKh1Phan + b.nhapKhoTruocKh, 0);

                        // Left Only (Chậm tiến độ - Rớt KH)
                        const leftOnly = weeklyPlanVsActualData.reduce((a, b) => a + b.rotKh + b.thucHienRotKh1Phan, 0);

                        // Right Only (Ngoài kế hoạch - Vượt KH)
                        const rightOnly = weeklyPlanVsActualData.reduce((a, b) => a + b.vuotKh + b.nhapKhoNgoaiKh, 0);

                        return (
                          <WeeklyVennDiagram
                            totalPlan={totalPlan}
                            totalActual={totalActual}
                            intersection={intersection}
                            leftOnly={leftOnly}
                            rightOnly={rightOnly}
                          />
                        );
                      })()}
                    </div>

                    {/* The Detailed Table logic is moved to the modal section at the end of the file */}
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg">Không có dữ liệu phân tích tuần (Kiểm tra lại bộ lọc hoặc dữ liệu nguồn).</div>
                )}
              </div>
            )}

            {/* Phân tích Năng suất */}
            {viewMode === 'WEEK' && (
              <div className="w-full mt-6">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
                    <Activity className="w-4 h-4 text-purple-600" /> Phân tích Năng suất (Dữ liệu Điểm danh)
                  </h4>
                </div>

                {productivityAnalysisData.length > 0 ? (
                  <div className="overflow-x-auto custom-scrollbar border border-slate-200 rounded-lg">
                    <table className="w-full text-xs text-right min-w-[1200px]">
                      <thead className="bg-purple-50 text-slate-700 font-semibold uppercase">
                        <tr>
                          <th className="px-4 py-3 text-left border-b border-purple-200 sticky left-0 bg-purple-50 z-10 w-[200px]">Xưởng Chính</th>
                          <th className="px-2 py-3 border-b border-purple-200 text-slate-600" title="Định biên">ĐỊNH BIÊN</th>
                          <th className="px-2 py-3 border-b border-purple-200 text-slate-600" title="Trung bình cộng">TRUNG BÌNH SỐ LƯỢNG CÔNG NHÂN</th>
                          <th className="px-2 py-3 border-b border-purple-200 text-slate-600">TỔNG GIỜ CÔNG HÀNH CHÍNH</th>
                          <th className="px-2 py-3 border-b border-purple-200 text-slate-600">TỔNG GIỜ TĂNG CA</th>
                          <th className="px-2 py-3 border-b border-purple-200 text-orange-700">TỶ LỆ GIỜ TĂNG CA (%)</th>
                          <th className="px-2 py-3 border-b border-purple-200 text-purple-800 bg-purple-100/30">DOANH SỐ NHẬP KHO</th>
                          <th className="px-2 py-3 border-b border-purple-200 text-blue-700">BÌNH QUÂN DOANH SỐ / 1 GIỜ</th>
                          <th className="px-2 py-3 border-b border-purple-200 text-blue-700">BÌNH QUÂN DOANH SỐ / 1 CÔNG NHÂN</th>
                          <th className="px-2 py-3 border-b border-purple-200 text-orange-700">BÌNH QUÂN GIỜ CÔNG / 1 CÔNG NHÂN</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {productivityAnalysisData.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 text-left font-medium text-slate-700 sticky left-0 bg-white z-10 border-r border-slate-100 drop-shadow-sm">{item.name}</td>
                            <td className="px-2 py-3 text-slate-700">{formatInteger(item.avgDinhBien)}</td>
                            <td className="px-2 py-3 text-slate-700">{formatInteger(item.avgWorkers)}</td>
                            <td className="px-2 py-3 text-slate-600">{formatDecimal(item.totalHc)}</td>
                            <td className="px-2 py-3 text-slate-600">{formatDecimal(item.totalTc)}</td>
                            <td className="px-2 py-3 text-orange-600">{formatDecimal(item.overtimeRate)}%</td>
                            <td className="px-2 py-3 text-purple-700 font-bold bg-purple-50/20">{formatDecimal(item.sales)}</td>
                            <td className="px-2 py-3 text-blue-600 font-medium">{formatDecimal(item.salesPerHour)}</td>
                            <td className="px-2 py-3 text-blue-600 font-medium">{formatDecimal(item.salesPerWorker)}</td>
                            <td className="px-2 py-3 text-orange-600">{formatDecimal(item.hoursPerWorker)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-purple-100 font-bold text-slate-800 border-t border-purple-300">
                        <tr>
                          <td className="px-4 py-3 text-left sticky left-0 bg-purple-100 z-10 w-[200px]">TỔNG CỘNG / BÌNH QUÂN</td>
                          <td className="px-2 py-3">
                            {formatInteger(productivityAnalysisData.reduce((sum, item) => sum + item.avgDinhBien, 0))}
                          </td>
                          <td className="px-2 py-3">
                            {formatInteger(productivityAnalysisData.reduce((sum, item) => sum + item.avgWorkers, 0))}
                          </td>
                          <td className="px-2 py-3">{formatDecimal(productivityAnalysisData.reduce((sum, item) => sum + item.totalHc, 0))}</td>
                          <td className="px-2 py-3">{formatDecimal(productivityAnalysisData.reduce((sum, item) => sum + item.totalTc, 0))}</td>
                          {(() => {
                            const totalSales = productivityAnalysisData.reduce((sum, item) => sum + item.sales, 0);
                            const totalAvgWorkers = productivityAnalysisData.reduce((sum, item) => sum + item.avgWorkers, 0);
                            const totalHc = productivityAnalysisData.reduce((sum, item) => sum + item.totalHc, 0);
                            const totalTc = productivityAnalysisData.reduce((sum, item) => sum + item.totalTc, 0);
                            const totalHours = totalHc + totalTc;

                            const avgSalesPerHour = totalHours > 0 ? totalSales / totalHours : 0;
                            const avgSalesPerWorker = totalAvgWorkers > 0 ? totalSales / totalAvgWorkers : 0;
                            const avgOvertimeRate = totalHours > 0 ? (totalTc / totalHours) * 100 : 0;
                            const avgHoursPerWorker = totalAvgWorkers > 0 ? totalHours / totalAvgWorkers : 0;

                            return (
                              <>
                                <td className="px-2 py-3 text-orange-800">{formatDecimal(avgOvertimeRate)}%</td>
                                <td className="px-2 py-3 text-purple-900">{formatDecimal(totalSales)}</td>
                                <td className="px-2 py-3 text-blue-800">{formatDecimal(avgSalesPerHour)}</td>
                                <td className="px-2 py-3 text-blue-800">{formatDecimal(avgSalesPerWorker)}</td>
                                <td className="px-2 py-3 text-orange-800">{formatDecimal(avgHoursPerWorker)}</td>
                              </>
                            );
                          })()}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg">Không có dữ liệu năng suất cho tuần này.</div>
                )}

                {/* Performance Charts Section */}
                {productivityAnalysisData.length > 0 && (
                  <ProductivityCharts
                    data={productivityAnalysisData}
                    viewMode={viewMode}
                    filters={unifiedTimeFilters}
                  />
                )}
              </div>
            )}

          </div>
        )}

        <div ref={projectSummaryRef} className="scroll-mt-24 w-full bg-white p-5 rounded-xl shadow-sm border border-emerald-100 flex flex-col">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
            <h3 className="text-base font-semibold text-slate-700 flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-600" />Tình trạng đơn hàng theo Công trình</h3>
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
                <button onClick={() => setProjectSummaryMetric('COUNT')} className={`px-2 py-1 text-[10px] font-bold rounded flex items-center gap-1 transition-all ${projectSummaryMetric === 'COUNT' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Hash size={12} /> # Số lượng hạng mục</button>
                <div className="w-px h-3 bg-slate-300 mx-1"></div>
                <button onClick={() => setProjectSummaryMetric('VALUE')} className={`px-2 py-1 text-[10px] font-bold rounded flex items-center gap-1 transition-all ${projectSummaryMetric === 'VALUE' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><DollarSign size={12} /> # Giá trị</button>
              </div>
              <span className="text-xs text-slate-500 italic hidden sm:block">Đơn vị: {projectSummaryMetric === 'COUNT' ? 'Hạng mục (Items)' : '1,000 VNĐ'}</span>
            </div>
          </div>
          {projectStatusSummary.length > 0 ? (
            <div className="overflow-auto custom-scrollbar border border-slate-200 rounded-lg max-h-[600px]">
              <table className="w-full text-xs text-right min-w-[1200px] border-separate border-spacing-0">
                <thead className="bg-emerald-100/50 text-slate-800 font-bold uppercase tracking-tight">
                  <tr>
                    <th className="px-3 py-3 text-left sticky left-0 top-0 bg-emerald-100 border-b border-emerald-200 z-30 min-w-[220px] shadow-sm">Tên Công Trình</th>
                    <th className="px-3 py-3 border-b border-emerald-200 sticky top-0 bg-emerald-50 z-20">Tổng {projectSummaryMetric === 'VALUE' ? 'Giá Trị' : 'Số Lượng'} <br />Đơn Hàng</th>
                    <th className="px-3 py-3 border-b border-emerald-200 sticky top-0 bg-emerald-50 z-20">Đã Triển Khai <br />Sản Xuất</th>
                    <th className="px-3 py-3 border-b border-emerald-200 sticky top-0 bg-emerald-50 z-20">Đã Tính Phiếu</th>
                    <th className="px-3 py-3 border-b border-emerald-200 sticky top-0 bg-emerald-50 z-20">Đang Sản Xuất</th>
                    <th className="px-3 py-3 border-b border-emerald-200 sticky top-0 bg-emerald-50 z-20">{projectSummaryMetric === 'VALUE' ? 'Giá Trị' : 'SL'} <br />Đã Nhập Kho</th>
                    <th className="px-3 py-3 border-b border-emerald-200 sticky top-0 bg-emerald-50 z-20 font-extrabold text-slate-900">{projectSummaryMetric === 'VALUE' ? 'Giá Trị' : 'SL'} Còn Lại</th>
                    <th className="px-3 py-3 border-b border-emerald-200 sticky top-0 bg-emerald-50 z-20 text-slate-500">Chưa Triển Khai <br />Sản Xuất</th>
                    <th className="px-3 py-3 border-b border-emerald-200 sticky top-0 bg-emerald-50 z-20 text-center min-w-[100px]">% Hoàn Thành</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-50">
                  {projectStatusSummary.map((row, idx) => {
                    const formatter = projectSummaryMetric === 'COUNT' ? formatNumber : formatDecimal;
                    return (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-3 py-2.5 text-left font-medium text-slate-700 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">{row.name}</td>
                        <td className="px-3 py-2.5 text-slate-800">{formatter(row.totalOrder)}</td>
                        <td className="px-3 py-2.5 text-slate-600">{formatter(row.deployed)}</td>
                        <td className="px-3 py-2.5 text-slate-600">{formatter(row.ticketed)}</td>
                        <td className="px-3 py-2.5 text-slate-600">{formatter(row.inProduction)}</td>
                        <td className="px-3 py-2.5 text-indigo-700 font-medium">{formatter(row.inventory)}</td>
                        <td className="px-3 py-2.5 font-bold text-slate-900 bg-slate-50/50">{formatter(row.remaining)}</td>
                        <td className="px-3 py-2.5 text-slate-400 italic">{formatter(row.notDeployed)}</td>
                        <td className="px-2 py-2.5 text-center">
                          <div className={`px-2 py-1 rounded font-bold text-[10px] inline-block w-full text-center ${row.percentComplete >= 95 ? 'bg-green-50 text-white' : row.percentComplete >= 70 ? 'bg-green-100 text-green-700' : row.percentComplete >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{formatDecimal(row.percentComplete)}%</div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-emerald-50 font-bold text-slate-800 border-t border-emerald-300 sticky bottom-0 z-20">
                  <tr>
                    <td className="px-3 py-3 text-left sticky left-0 bg-emerald-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">TỔNG CỘNG</td>
                    <td className="px-3 py-3">{projectSummaryMetric === 'COUNT' ? formatNumber(projectStatusSummary.reduce((a, b) => a + b.totalOrder, 0)) : formatDecimal(projectStatusSummary.reduce((a, b) => a + b.totalOrder, 0))}</td>
                    <td className="px-3 py-3">{projectSummaryMetric === 'COUNT' ? formatNumber(projectStatusSummary.reduce((a, b) => a + b.deployed, 0)) : formatDecimal(projectStatusSummary.reduce((a, b) => a + b.deployed, 0))}</td>
                    <td className="px-3 py-3">{projectSummaryMetric === 'COUNT' ? formatNumber(projectStatusSummary.reduce((a, b) => a + b.ticketed, 0)) : formatDecimal(projectStatusSummary.reduce((a, b) => a + b.ticketed, 0))}</td>
                    <td className="px-3 py-3">{projectSummaryMetric === 'COUNT' ? formatNumber(projectStatusSummary.reduce((a, b) => a + b.inProduction, 0)) : formatDecimal(projectStatusSummary.reduce((a, b) => a + b.inProduction, 0))}</td>
                    <td className="px-3 py-3 text-indigo-800">{projectSummaryMetric === 'COUNT' ? formatNumber(projectStatusSummary.reduce((a, b) => a + b.inventory, 0)) : formatDecimal(projectStatusSummary.reduce((a, b) => a + b.inventory, 0))}</td>
                    <td className="px-3 py-3 text-slate-900">{projectSummaryMetric === 'COUNT' ? formatNumber(projectStatusSummary.reduce((a, b) => a + b.remaining, 0)) : formatDecimal(projectStatusSummary.reduce((a, b) => a + b.remaining, 0))}</td>
                    <td className="px-3 py-3 text-slate-500">{projectSummaryMetric === 'COUNT' ? formatNumber(projectStatusSummary.reduce((a, b) => a + b.notDeployed, 0)) : formatDecimal(projectStatusSummary.reduce((a, b) => a + b.notDeployed, 0))}</td>
                    <td className="px-3 py-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg">Không có dữ liệu phù hợp để tính toán tổng quan đơn hàng.</div>}
        </div>

        <div ref={pivotProjectRef} className="scroll-mt-24 w-full bg-white p-5 rounded-xl shadow-sm border border-wood-100 flex flex-col">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-4 gap-3">
            <h3 className="text-base font-semibold text-slate-700 flex items-center gap-2"><LayoutList className="w-4 h-4 text-blue-500" />Chi tiết Giá trị (Công trình x Tình trạng)</h3>
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
              <MetricSwitcher current={projectMetric} onChange={setProjectMetric} />
              <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-100">
                <button onClick={() => setExcludeFabrics(false)} className={`flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${!excludeFabrics ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`} title="Hiển thị tất cả hạng mục"><CheckCircle size={12} /> Đủ hạng mục</button>
                <button onClick={() => setExcludeFabrics(true)} className={`flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${excludeFabrics ? 'bg-red-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`} title="Loại bỏ Vải, Gối khỏi thống kê"><MinusCircle size={12} /> Trừ Vải/Gối</button>
              </div>
            </div>
          </div>
          {pivotProjectData ? (
            <div className="overflow-auto custom-scrollbar border border-slate-200 rounded-lg max-h-[550px]">
              <table className="w-full text-xs text-right min-w-[800px] border-separate border-spacing-0">
                <thead className="bg-blue-50/50 text-slate-700 font-semibold uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left sticky left-0 top-0 bg-blue-100 border-b border-blue-200 z-30 min-w-[200px] shadow-[1px_1px_2px_rgba(0,0,0,0.05)]">Tên Công Trình</th>
                    {(pivotProjectData.uniqueStatuses).map((s: string) => (<th key={s} className="px-3 py-2 border-b border-blue-200 whitespace-nowrap text-blue-900 sticky top-0 bg-blue-50 z-20">{s}</th>))}
                    <th className="px-3 py-2 bg-blue-100 border-b border-blue-200 font-bold text-slate-800 sticky top-0 right-0 z-20">Tổng Cộng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(pivotProjectData.uniqueProjects).map((p: string) => (
                    <tr key={p} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-3 py-2 text-left font-medium text-slate-700 sticky left-0 bg-white group-hover:bg-slate-50 z-10 whitespace-nowrap border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">{p}</td>
                      {(pivotProjectData.uniqueStatuses).map((s: string) => {
                        // Safe access using local reference to matrix
                        const matrix = pivotProjectData.matrix || {};
                        const val = matrix[p]?.[s] || 0;
                        return (<td key={s} className={`px-3 py-2 whitespace-nowrap ${val === 0 ? 'text-slate-300' : 'text-slate-600'}`}>{val === 0 ? '-' : formatNumber(val, projectMetric)}</td>);
                      })}
                      <td className="px-3 py-2 font-bold text-slate-800 bg-blue-50/30">{formatNumber(pivotProjectData.rowTotals[p], projectMetric)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-blue-100 font-bold text-slate-800 border-t border-blue-300">
                  <tr>
                    <td className="px-3 py-2 text-left sticky left-0 bottom-0 z-20 bg-blue-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">Tổng Cộng</td>
                    {pivotProjectData.uniqueStatuses.map((s: string) => (<td key={s} className="px-3 py-2 whitespace-nowrap">{formatNumber(pivotProjectData.colTotals[s], projectMetric)}</td>))}
                    <td className="px-3 py-2 text-blue-900 text-sm">{formatNumber(pivotProjectData.grandTotal, projectMetric)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg">Không đủ dữ liệu để tạo bảng Pivot Công trình.</div>}
        </div>

        <div ref={pivotMaterialRef} className="scroll-mt-24 w-full bg-white p-5 rounded-xl shadow-sm border border-emerald-100 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-semibold text-slate-700 flex items-center gap-2"><Package className="w-4 h-4 text-emerald-600" />Tổng hợp Vật tư theo Nhóm (Dữ liệu Vật tư)</h3>
            <div className="flex items-center gap-2">
              {selectedMaterialGroups.length > 0 && (
                <button onClick={() => setSelectedMaterialGroups([])} className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded border border-red-200 flex items-center gap-1"><CloseIcon size={12} /> Bỏ chọn ({selectedMaterialGroups.length})</button>
              )}
              {filters.congTrinh.length > 0 && (<span className="text-xs font-medium px-2 py-1 bg-emerald-50 text-emerald-700 rounded border border-emerald-200">Đang lọc theo: {filters.congTrinh.join(', ')}</span>)}
            </div>
          </div>
          {pivotMaterialSummary ? (
            <div className="overflow-auto custom-scrollbar border border-slate-200 rounded-lg max-h-[500px]">
              <table className="w-full text-xs text-right min-w-[500px] border-separate border-spacing-0">
                <thead className="bg-emerald-50 text-slate-700 font-semibold uppercase">
                  <tr>
                    <th className="px-3 py-2 border-b border-emerald-200 w-8 sticky top-0 bg-emerald-50 z-10"></th>
                    <th className="px-3 py-2 text-left border-b border-emerald-200 text-emerald-900 sticky top-0 bg-emerald-50 z-10">Nhóm Vật Tư</th>
                    <th className="px-3 py-2 border-b border-emerald-200 text-emerald-900 sticky top-0 bg-emerald-50 z-10">SL Yêu Cầu</th>
                    <th className="px-3 py-2 border-b border-emerald-200 text-emerald-900 sticky top-0 bg-emerald-50 z-10">SL Đã Nhận (SAP)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-50">
                  {pivotMaterialSummary.sortedGroups.map(group => {
                    const isSelected = selectedMaterialGroups.includes(group);
                    return (
                      <tr key={group} className={`transition-colors cursor-pointer group ${isSelected ? 'bg-emerald-100/70 hover:bg-emerald-100' : 'hover:bg-slate-50'}`} onClick={() => toggleMaterialGroup(group)}>
                        <td className="px-3 py-2 text-center">{isSelected ? <CheckSquare size={14} className="text-emerald-600 inline" /> : <Square size={14} className="text-slate-300 inline group-hover:text-emerald-400" />}</td>
                        <td className={`px-3 py-2 text-left font-medium ${isSelected ? 'text-emerald-900' : 'text-slate-700'}`}>{group}</td>
                        <td className="px-3 py-2 text-slate-600">{formatNumber(pivotMaterialSummary.summary[group].req)}</td>
                        <td className="px-3 py-2 text-slate-600">{formatNumber(pivotMaterialSummary.summary[group].rec)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-emerald-100 font-bold text-slate-800 border-t border-emerald-300 sticky bottom-0 z-10">
                  <tr><td className="px-3 py-2"></td><td className="px-3 py-2 text-left">Tổng Cộng</td><td className="px-3 py-2">{formatNumber(pivotMaterialSummary.totalReq)}</td><td className="px-3 py-2">{formatNumber(pivotMaterialSummary.totalRec)}</td></tr>
                </tfoot>
              </table>
            </div>
          ) : <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg">Không có dữ liệu vật tư phù hợp.</div>}
        </div>

        <div ref={pivotMaterialStatusRef} className="scroll-mt-24 w-full bg-white p-5 rounded-xl shadow-sm border border-emerald-100 flex flex-col">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
            <h3 className="text-base font-semibold text-slate-700 flex items-center gap-2"><ListFilter className="w-4 h-4 text-emerald-600" />Tình trạng Vật tư (Nhóm x Trạng thái)</h3>
            <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button onClick={() => setMatStatusMetric('COUNT_PR')} className={`px-2 py-1 text-[10px] font-bold rounded flex items-center gap-1 transition-all ${matStatusMetric === 'COUNT_PR' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Hash size={12} /> Số hạng mục PR</button>
              <div className="w-px h-3 bg-slate-300 mx-1"></div>
              <button onClick={() => setMatStatusMetric('SUM_QTY')} className={`px-2 py-1 text-[10px] font-bold rounded flex items-center gap-1 transition-all ${matStatusMetric === 'SUM_QTY' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Calculator size={12} /> Khối lượng Yêu cầu</button>
            </div>
          </div>
          {pivotMaterialStatusData ? (
            <div className="overflow-auto custom-scrollbar border border-slate-200 rounded-lg max-h-[500px]">
              <table className="w-full text-xs text-right min-w-[800px] border-separate border-spacing-0">
                <thead className="bg-emerald-50 text-slate-700 font-semibold uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left sticky left-0 top-0 bg-emerald-100 border-b border-emerald-200 z-30 min-w-[200px] shadow-[1px_1px_2px_rgba(0,0,0,0.05)]">Nhóm Vật Tư</th>
                    {(pivotMaterialStatusData.uniqueStatuses).map((s: string) => (<th key={s} className="px-3 py-2 border-b border-emerald-200 whitespace-nowrap text-emerald-900 sticky top-0 bg-emerald-50 z-20">{s}</th>))}
                    <th className="px-3 py-2 bg-emerald-100 border-b border-emerald-200 font-bold text-slate-800 sticky top-0 right-0 z-20">Tổng Cộng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(pivotMaterialStatusData.sortedGroups).map((group: string) => (
                    <tr key={group} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-3 py-2 text-left font-medium text-slate-700 sticky left-0 bg-white group-hover:bg-slate-50 z-10 whitespace-nowrap border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">{group}</td>
                      {(pivotMaterialStatusData.uniqueStatuses).map((s: string) => {
                        // Safe access using local reference to matrix
                        const matrix = pivotMaterialStatusData.matrix || {};
                        const val = matrix[group]?.[s] || 0;
                        return (<td key={s} className={`px-3 py-2 whitespace-nowrap ${val === 0 ? 'text-slate-300' : 'text-slate-600'}`}>{val === 0 ? '-' : (matStatusMetric === 'SUM_QTY' ? formatDecimal(val) : formatNumber(val))}</td>);
                      })}
                      <td className="px-3 py-2 font-bold text-slate-800 bg-emerald-50/30">{matStatusMetric === 'SUM_QTY' ? formatDecimal(pivotMaterialStatusData.rowTotals[group]) : formatNumber(pivotMaterialStatusData.rowTotals[group])}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-emerald-100 font-bold text-slate-800 border-t border-emerald-300">
                  <tr>
                    <td className="px-3 py-2 text-left sticky left-0 bottom-0 z-20 bg-emerald-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">Tổng Cộng (Toàn bộ)</td>
                    {pivotMaterialStatusData.uniqueStatuses.map((s: string) => (<td key={s} className="px-3 py-2 whitespace-nowrap">{matStatusMetric === 'SUM_QTY' ? formatDecimal(pivotMaterialStatusData.colTotals[s]) : formatNumber(pivotMaterialStatusData.colTotals[s])}</td>))}
                    <td className="px-3 py-2 text-emerald-900 text-sm">{matStatusMetric === 'SUM_QTY' ? formatDecimal(pivotMaterialStatusData.grandTotal) : formatNumber(pivotMaterialStatusData.grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg">Không có dữ liệu để tạo bảng trạng thái vật tư.</div>}
        </div>

        <div ref={materialListRef} className="w-full bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-semibold text-slate-700 flex items-center gap-2"><Box className="w-4 h-4 text-slate-600" />Chi tiết Dữ liệu Vật tư (Lọc theo Công trình)</h3>
            <span className="text-xs text-slate-500">Hiển thị {displayedMaterialData.length} dòng</span>
          </div>
          <div className="overflow-auto custom-scrollbar border border-slate-200 rounded-lg">
            <table className="w-full text-xs text-left whitespace-nowrap">
              <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 border-b border-slate-200 text-center w-10">#</th>
                 {MATERIAL_LIST_COLUMNS.map((col, idx) => (
  <th key={idx} className="px-3 py-2 border-b border-slate-200">
    {MATERIAL_LIST_COLUMN_LABELS[col] || col}
  </th>
))} 
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedMaterialList.length > 0 ? (
                  paginatedMaterialList.map((row, index) => (
                    <tr key={index} className={`transition-colors border-b border-slate-100 ${getMaterialRowClassName(row)}`}>
                      <td className="px-3 py-2 text-center opacity-70 font-mono text-xs">{(materialListPage - 1) * MATERIAL_ITEMS_PER_PAGE + index + 1}</td>
                      {MATERIAL_LIST_COLUMNS.map((col, colIdx) => (<td key={colIdx} className="px-3 py-2">{row[col] || ''}</td>))}
                    </tr>
                  ))
                ) : <tr><td colSpan={MATERIAL_LIST_COLUMNS.length + 1} className="p-8 text-center text-slate-500">Không có dữ liệu hiển thị.</td></tr>}
              </tbody>
            </table>
          </div>
          {totalMaterialPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-xs text-slate-600">
              <div>Trang {materialListPage} / {totalMaterialPages}</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setMaterialListPage(prev => Math.max(prev - 1, 1))} disabled={materialListPage === 1} className="p-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"><ChevronLeft size={16} /></button>
                <button onClick={() => setMaterialListPage(prev => Math.min(prev + 1, totalMaterialPages))} disabled={materialListPage === totalMaterialPages} className="p-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
        </div>

        <div className="w-full bg-white p-6 rounded-xl shadow-sm border border-wood-100 flex flex-col">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
            <h3 className="text-base font-semibold text-slate-700 flex items-center gap-2"><Activity className="w-4 h-4 text-purple-600" />Biểu đồ Phân tích Tình trạng (Sản xuất)</h3>
            <MetricSwitcher current={chartMetric} onChange={setChartMetric} />
          </div>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineChartData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 10, fill: '#64748b' }} interval={0} />
                <YAxis tickFormatter={(val) => { if (val >= 1000000000) return (val / 1000000000).toFixed(1) + 'B'; if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M'; if (val >= 1000) return (val / 1000).toFixed(0) + 'K'; return val; }} tick={{ fontSize: 10, fill: '#64748b' }} width={60} />
                <RechartsTooltip formatter={(value: number) => [formatNumber(value, chartMetric), 'Giá trị']} labelStyle={{ color: '#334155', fontWeight: 600 }} contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} />
                <Legend verticalAlign="top" height={36} />
                <Line type="monotone" dataKey="value" name="Giá trị theo Tình trạng" stroke="#ba6a42" strokeWidth={2} activeDot={{ r: 6, strokeWidth: 0 }} dot={{ r: 3, fill: '#ba6a42', strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {isIpoDetailModalOpen && (
        <div className={`fixed inset-y-0 right-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-all duration-300
         left-0 ${isSidebarCollapsed ? 'md:left-20' : 'md:left-64'}`}>
          <div className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <ShoppingCart className="text-pink-600" size={20} />
                  Chi tiết Đơn hàng mới (IPO)
                </h3>
                <p className="text-xs text-slate-500 mt-1">Dữ liệu được tổng hợp từ nguồn Đơn hàng tổng</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleOpenOrderExport}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-pink-50 text-pink-700 hover:bg-pink-100 rounded-lg text-xs font-bold border border-pink-200 transition-all shadow-sm active:scale-95 cursor-pointer"
                  title="Xuất dữ liệu Đơn hàng mới (P001) ra file .CSV"
                >
                  <Download size={15} />
                  <span>Xuất CSV</span>
                </button>
                <button onClick={() => setIsIpoDetailModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors cursor-pointer">
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 custom-scrollbar">
                           <DetailModalTable
                data={toAnalysisItems(groupAnalysisCache[`order-xuong-${overviewSummary?.date}`] ?? [])}
                title="Chi tiết theo Xưởng"
                icon={Layers}
                dateLabel={`NGÀY ${latestUnifiedDate ? `${latestUnifiedDate.getDate()}/${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                unitLabel={overviewMetric === 'COUNT' ? '(SL HEX)' : '(Giá trị VND)'}
                primaryColorClass="text-pink-600"
                secondaryColorClass="text-indigo-600"
                defaultExcludedKeys={['ABC', 'OTHERS', 'X.ĐB']}
              />

              <div className="border-t border-slate-200 pt-6">
                               <DetailModalTable
                  data={toAnalysisItems(groupAnalysisCache[`order-congtrinh-${overviewSummary?.date}`] ?? [])}
                  title="Chi tiết theo Công trình"
                  icon={Building2}
                  dateLabel={`NGÀY ${latestUnifiedDate ? `${latestUnifiedDate.getDate()}/${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                  mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                  unitLabel={overviewMetric === 'COUNT' ? '(SL HEX)' : '(Giá trị VND)'}
                  primaryColorClass="text-pink-600"
                  secondaryColorClass="text-indigo-600"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {isTkbvDetailModalOpen && (
        <div className={`fixed inset-y-0 right-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-all duration-300
         left-0 ${isSidebarCollapsed ? 'md:left-20' : 'md:left-64'}`}>
          <div className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <FileText className="text-blue-600" size={20} />
                  Chi tiết Triển khai Bản vẽ (TKBV)
                </h3>
                <p className="text-xs text-slate-500 mt-1">Dữ liệu được tổng hợp từ nguồn TKBV</p>
              </div>
              <button onClick={() => setIsTkbvDetailModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 custom-scrollbar">
             <DetailModalTable
    data={toAnalysisItems(groupAnalysisCache[`tkbv-xuong-${overviewSummary?.date}`] ?? [])}
    title="Chi tiết theo Xưởng"
                icon={Layers}
                dateLabel={`NGÀY ${latestUnifiedDate ? `${latestUnifiedDate.getDate()}/${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                unitLabel={overviewMetric === 'COUNT' ? '(SL Bản vẽ)' : '(Giá trị VND)'}
                primaryColorClass="text-blue-600"
                secondaryColorClass="text-indigo-600"
              />

              <div className="border-t border-slate-200 pt-6">
             <DetailModalTable
    data={toAnalysisItems(groupAnalysisCache[`tkbv-congtrinh-${overviewSummary?.date}`] ?? [])}
    title="Chi tiết theo Công trình"
                  icon={Building2}
                  dateLabel={`NGÀY ${latestUnifiedDate ? `${latestUnifiedDate.getDate()}/${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                  mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                  unitLabel={overviewMetric === 'COUNT' ? '(SL Bản vẽ)' : '(Giá trị VND)'}
                  primaryColorClass="text-blue-600"
                  secondaryColorClass="text-indigo-600"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {isPthspDetailModalOpen && (
        <div className={`fixed inset-y-0 right-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-all duration-300
         left-0 ${isSidebarCollapsed ? 'md:left-20' : 'md:left-64'}`}>
          <div className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <ClipboardList className="text-purple-600" size={20} />
                  Chi tiết Đã Tính Phiếu (PTHSP)
                </h3>
                <p className="text-xs text-slate-500 mt-1">Dữ liệu được tổng hợp từ nguồn PTHSP</p>
              </div>
              <button onClick={() => setIsPthspDetailModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 custom-scrollbar">
              <DetailModalTable
    data={toAnalysisItems(groupAnalysisCache[`pthsp-xuong-${overviewSummary?.date}`] ?? [])}
    title="Chi tiết theo Xưởng"
                icon={Layers}
                dateLabel={`NGÀY ${latestUnifiedDate ? `${latestUnifiedDate.getDate()}/${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                unitLabel={overviewMetric === 'COUNT' ? '(SL Phiếu)' : '(Giá trị VND)'}
                primaryColorClass="text-purple-600"
                secondaryColorClass="text-fuchsia-600"
              />

              <div className="border-t border-slate-200 pt-6">
               <DetailModalTable
    data={toAnalysisItems(groupAnalysisCache[`pthsp-congtrinh-${overviewSummary?.date}`] ?? [])}
    title="Chi tiết theo Công trình"
                  icon={Building2}
                  dateLabel={`NGÀY ${latestUnifiedDate ? `${latestUnifiedDate.getDate()}/${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                  mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                  unitLabel={overviewMetric === 'COUNT' ? '(SL Phiếu)' : '(Giá trị VND)'}
                  primaryColorClass="text-purple-600"
                  secondaryColorClass="text-fuchsia-600"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {isInventoryDetailModalOpen && (
        <div className={`fixed inset-y-0 right-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-all duration-300
         left-0 ${isSidebarCollapsed ? 'md:left-20' : 'md:left-64'}`}>
          <div className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Package className="text-teal-600" size={20} />
                  Chi tiết Nhập Kho
                </h3>
                <p className="text-xs text-slate-500 mt-1">Dữ liệu được tổng hợp từ nguồn Nhập Kho</p>
              </div>
              <button onClick={() => setIsInventoryDetailModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 custom-scrollbar">
             <DetailModalTable
    data={toAnalysisItems(groupAnalysisCache[`inventory-xuong-${overviewSummary?.date}`] ?? [])}
    title="Chi tiết theo Xưởng"
                icon={Layers}
                dateLabel={`NGÀY ${latestUnifiedDate ? `${latestUnifiedDate.getDate()}/${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                unitLabel={overviewMetric === 'COUNT' ? '(SL Items)' : '(Giá trị VND)'}
                primaryColorClass="text-teal-600"
                secondaryColorClass="text-emerald-600"
              />

              <div className="border-t border-slate-200 pt-6">
               <DetailModalTable
    data={toAnalysisItems(groupAnalysisCache[`inventory-congtrinh-${overviewSummary?.date}`] ?? [])}
    title="Chi tiết theo Công trình"
                  icon={Building2}
                  dateLabel={`NGÀY ${latestUnifiedDate ? `${latestUnifiedDate.getDate()}/${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                  mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                  unitLabel={overviewMetric === 'COUNT' ? '(SL Items)' : '(Giá trị VND)'}
                  primaryColorClass="text-teal-600"
                  secondaryColorClass="text-emerald-600"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {isWeeklyDetailModalOpen && (
        <div className={`fixed inset-y-0 right-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-all duration-300
         left-0 ${isSidebarCollapsed ? 'md:left-20' : 'md:left-64'}`}>
          <div className="bg-white rounded-2xl shadow-2xl w-[95%] max-w-7xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <TableIcon className="text-orange-600" size={20} />
                  Chi tiết Phân tích Kế hoạch-Thực hiện Tuần
                </h3>
                <p className="text-xs text-slate-500 mt-1">Dữ liệu chi tiết từng loại hình kế hoạch và thực hiện</p>
              </div>
              <button onClick={() => setIsWeeklyDetailModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 bg-slate-50/50 custom-scrollbar">
              <div className="overflow-x-auto custom-scrollbar border border-slate-200 rounded-lg bg-white shadow-sm">
                <table className="w-full text-xs text-right min-w-[1500px]">
                  <thead className="bg-orange-50 text-slate-700 font-semibold uppercase sticky top-0 z-20">
                    <tr>
                      <th className="px-4 py-3 text-left sticky left-0 bg-orange-50 border-b border-orange-200 z-30 w-32 shadow-[1px_0_3px_rgba(0,0,0,0.1)]">Xưởng Chính</th>
                      <th className="px-4 py-3 border-b border-orange-200 text-orange-900">Thành tiền Kế hoạch</th>
                      <th className="px-4 py-3 border-b border-orange-200 text-orange-900">Nhập kho Tuần</th>
                      <th className="px-4 py-3 border-b border-orange-200 text-orange-900">Tỷ lệ (Tuần/KH)</th>

                      <th className="px-4 py-3 border-b border-orange-200 text-green-700 bg-green-50">ĐÚNG KẾ HOẠCH</th>
                      <th className="px-4 py-3 border-b border-orange-200 text-blue-700 bg-blue-50">THỰC HIỆN ĐÚNG KH 1 PHẦN</th>
                      <th className="px-4 py-3 border-b border-orange-200 text-red-700 bg-red-50">RỚT KẾ HOẠCH</th>
                      <th className="px-4 py-3 border-b border-orange-200 text-orange-700 bg-orange-50">THỰC HIỆN RỚT KH 1 PHẦN</th>
                      <th className="px-4 py-3 border-b border-orange-200 text-purple-700 bg-purple-50">NHẬP KHO TRƯỚC KH</th>
                      <th className="px-4 py-3 border-b border-orange-200 text-teal-700 bg-teal-50">VƯỢT KẾ HOẠCH</th>
                      <th className="px-4 py-3 border-b border-orange-200 text-gray-700 bg-gray-100">NHẬP KHO NGOÀI KH</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {weeklyPlanVsActualData.map((item, idx) => {
                      const percent = item.plan > 0 ? (item.actualWeek / item.plan) * 100 : 0;
                      return (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-4 py-3 text-left font-medium text-slate-700 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-100 shadow-[1px_0_3px_rgba(0,0,0,0.05)]">{item.name}</td>
                          <td className="px-4 py-3 text-slate-600 font-bold">{formatDecimal(item.plan)}</td>
                          <td className="px-4 py-3 font-bold text-slate-800">{formatDecimal(item.actualWeek)}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded font-bold text-[10px] inline-block w-16 text-center ${percent >= 80 ? 'bg-green-100 text-green-700' : percent >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                              {formatDecimal(percent)}%
                            </span>
                          </td>

                          <td className="px-4 py-3 text-green-700 bg-green-50/30">{formatDecimal(item.dungKh)}</td>
                          <td className="px-4 py-3 text-blue-700 bg-blue-50/30">{formatDecimal(item.thucHienDungKh1Phan)}</td>
                          <td className="px-4 py-3 text-red-700 bg-red-50/30">{formatDecimal(item.rotKh)}</td>
                          <td className="px-4 py-3 text-orange-700 bg-orange-50/30">{formatDecimal(item.thucHienRotKh1Phan)}</td>
                          <td className="px-4 py-3 text-purple-700 bg-purple-50/30">{formatDecimal(item.nhapKhoTruocKh)}</td>
                          <td className="px-4 py-3 text-teal-700 bg-teal-50/30">{formatDecimal(item.vuotKh)}</td>
                          <td className="px-4 py-3 text-gray-700 bg-gray-50/30">{formatDecimal(item.nhapKhoNgoaiKh)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-orange-100 font-bold text-slate-800 border-t border-orange-300 sticky bottom-0 z-20 shadow-[0_-2px_5px_rgba(0,0,0,0.1)]">
                    <tr>
                      <td className="px-4 py-3 text-left sticky left-0 bg-orange-100 z-30 shadow-[1px_0_3px_rgba(0,0,0,0.1)]">TỔNG CỘNG</td>
                      <td className="px-4 py-3">{formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.plan, 0))}</td>
                      <td className="px-4 py-3">{formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.actualWeek, 0))}</td>
                      <td className="px-4 py-3">
                        {(() => {
                          const totalPlan = weeklyPlanVsActualData.reduce((a, b) => a + b.plan, 0);
                          const totalActual = weeklyPlanVsActualData.reduce((a, b) => a + b.actualWeek, 0);
                          const totalPercent = totalPlan > 0 ? (totalActual / totalPlan) * 100 : 0;
                          return `${formatDecimal(totalPercent)}%`;
                        })()}
                      </td>
                      <td className="px-4 py-3 text-green-800 bg-green-100/50">{formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.dungKh, 0))}</td>
                      <td className="px-4 py-3 text-blue-800 bg-blue-100/50">{formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.thucHienDungKh1Phan, 0))}</td>
                      <td className="px-4 py-3 text-red-800 bg-red-100/50">{formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.rotKh, 0))}</td>
                      <td className="px-4 py-3 text-orange-800 bg-orange-100/50">{formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.thucHienRotKh1Phan, 0))}</td>
                      <td className="px-4 py-3 text-purple-800 bg-purple-100/50">{formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.nhapKhoTruocKh, 0))}</td>
                      <td className="px-4 py-3 text-teal-800 bg-teal-100/50">{formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.vuotKh, 0))}</td>
                      <td className="px-4 py-3 text-gray-800 bg-gray-200/50">{formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.nhapKhoNgoaiKh, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CHI TIẾT XUẤT KHO */}
      {isExportDetailModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-amber-500 to-orange-600">
              <div className="flex items-center gap-3 text-white">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Package size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white uppercase tracking-wider">Chi tiết Xuất kho</h3>
                  <p className="text-[10px] text-amber-50 font-medium">{getContextLabel()}</p>
                </div>
              </div>
              <button
                onClick={() => setIsExportDetailModalOpen(false)}
                className="p-2 hover:bg-white/20 rounded-full transition-all text-white/90 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 custom-scrollbar">
              <DetailModalTable
    data={toAnalysisItems(groupAnalysisCache[`export-xuong-${overviewSummary?.date}`] ?? [])}
    title="Chi tiết theo Xưởng"
                icon={Layers}
                //@ts-ignore - latestUnifiedDate property access
                dateLabel={`NGÀY ${latestUnifiedDate ? `${latestUnifiedDate.getDate()}/${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                //@ts-ignore - latestUnifiedDate property access
                mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                unitLabel={overviewMetric === 'COUNT' ? '(SL HEX)' : '(Giá trị VND)'}
                primaryColorClass="text-amber-600"
                secondaryColorClass="text-orange-600"
              />

              <div className="mt-8 pt-8 border-t border-slate-200">
              <DetailModalTable
    data={toAnalysisItems(groupAnalysisCache[`export-congtrinh-${overviewSummary?.date}`] ?? [])}
    title="Chi tiết theo Công trình"
                  icon={Briefcase}
                  //@ts-ignore - latestUnifiedDate property access
                  dateLabel={`NGÀY ${latestUnifiedDate ? `${latestUnifiedDate.getDate()}/${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                  //@ts-ignore - latestUnifiedDate property access
                  mtdLabel={`LŨY KẾ THÁNG ${latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}`}
                  unitLabel={overviewMetric === 'COUNT' ? '(SL HEX)' : '(Giá trị VND)'}
                  primaryColorClass="text-amber-700"
                  secondaryColorClass="text-orange-700"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-white flex justify-end">
              <button
                onClick={() => setIsExportDetailModalOpen(false)}
                className="px-8 py-2.5 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-700 transition-all shadow-md active:scale-95"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CHI TIẾT TỒN KHO */}
      {isStockDetailModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-slate-600 to-slate-800">
              <div className="flex items-center gap-3 text-white">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Box size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white uppercase tracking-wider">Chi tiết Tồn kho</h3>
                  <p className="text-[10px] text-slate-50 font-medium">{getContextLabel()}</p>
                </div>
              </div>
              <button
                onClick={() => setIsStockDetailModalOpen(false)}
                className="p-2 hover:bg-white/20 rounded-full transition-all text-white/90 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 custom-scrollbar">
                           <DetailModalTable
                data={stockByProjectData.map(r => ({
                  name: r.name,
                  daily: overviewMetric === 'COUNT' ? r.count : r.value,
                  mtd: overviewMetric === 'COUNT' ? r.count : r.value,
                }))}
                title="Chi tiết theo Công trình"
                icon={Briefcase}
                dateLabel={`NGÀY TỒN LỌC ${closestStockDate ? `(${closestStockDate.getDate().toString().padStart(2, '0')}/${(closestStockDate.getMonth() + 1).toString().padStart(2, '0')}/${closestStockDate.getFullYear()})` : ''}`}
                mtdLabel={`GIÁ TRỊ TỒN MỚI NHẤT ${latestStockStats.date ? `(${latestStockStats.date.getDate().toString().padStart(2, '0')}/${(latestStockStats.date.getMonth() + 1).toString().padStart(2, '0')}/${latestStockStats.date.getFullYear()})` : ''}`}
                unitLabel={overviewMetric === 'COUNT' ? '(SL Mã SAP)' : '(Giá trị VND)'}
                primaryColorClass="text-slate-700"
                secondaryColorClass="text-slate-900"
              />
            </div>

            <div className="p-4 border-t border-slate-200 bg-white flex justify-end">
              <button
                onClick={() => setIsStockDetailModalOpen(false)}
                className="px-8 py-2.5 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-700 transition-all shadow-md active:scale-95"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL: EXPORT TÌNH TRẠNG SẢN XUẤT */}
      {isProductionExportModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-wood-600 to-wood-800">
              <div className="flex items-center gap-3 text-white">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Download size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white uppercase tracking-wider">Xuất Dữ Liệu Sản Xuất</h3>
                  <p className="text-[10px] text-wood-100 font-medium">Chọn các cột cần xuất ra file Excel (.xlsx)</p>
                </div>
              </div>
              <button
                onClick={() => setIsProductionExportModalOpen(false)}
                className="p-2 hover:bg-white/20 rounded-full transition-all text-white/90 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 custom-scrollbar">
              <div className="mb-4 flex gap-2">
                <button
                  onClick={() => setSelectedExportColumns(productionColumns.map(c => c.key))}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-200 text-slate-700 hover:bg-slate-300 rounded transition-colors"
                >
                  Chọn Tất Cả
                </button>
                <button
                  onClick={() => setSelectedExportColumns([])}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-200 text-slate-700 hover:bg-slate-300 rounded transition-colors"
                >
                  Bỏ Chọn Tất Cả
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {productionColumns.map(col => {
                  const isSelected = selectedExportColumns.includes(col.key);
                  return (
                    <label key={col.key} className={`flex items-center gap-2 p-2 border rounded cursor-pointer transition-colors ${isSelected ? 'bg-wood-50 border-wood-300 text-wood-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-wood-600 focus:ring-wood-500"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedExportColumns(prev => [...prev, col.key]);
                          } else {
                            setSelectedExportColumns(prev => prev.filter(k => k !== col.key));
                          }
                        }}
                      />
                      <span className="text-sm font-medium truncate" title={col.label}>{col.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-white flex justify-end gap-3">
              <button
                onClick={() => setIsProductionExportModalOpen(false)}
                className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-all"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  const exportDataMapped = filteredProductionData.map(row => {
                    const newRow: any = {};
                    selectedExportColumns.forEach(colKey => {
                      const colDef = productionColumns.find(c => c.key === colKey);
                      if (colDef) {
                        newRow[colDef.label] = row[colKey];
                      }
                    });
                    return newRow;
                  });
                  exportToExcel(exportDataMapped, `Tinh_Trang_San_Xuat_${new Date().toISOString().split('T')[0]}`);
                  setIsProductionExportModalOpen(false);
                }}
                disabled={selectedExportColumns.length === 0}
                className="px-8 py-2.5 bg-wood-600 text-white font-bold rounded-lg hover:bg-wood-700 transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Download size={18} /> Xác Nhận Xuất
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP 1: CHỌN PHẠM VI XUẤT DỮ LIỆU ĐƠN HÀNG (P001) */}
      {isOrderExportScopeModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-pink-600 to-rose-600">
              <div className="flex items-center gap-3 text-white">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Download size={22} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white uppercase tracking-wider">Tùy Chọn Phạm Vi Xuất</h3>
                  <p className="text-[10px] text-pink-100 font-medium">Bước 1/2: Chọn phạm vi dữ liệu xuất</p>
                </div>
              </div>
              <button
                onClick={() => setIsOrderExportScopeModalOpen(false)}
                className="p-1.5 hover:bg-white/20 rounded-full transition-all text-white/90 hover:text-white cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 bg-slate-50/50 flex flex-col gap-4">
              <p className="text-sm font-semibold text-slate-700">Bạn muốn xuất dữ liệu theo tùy chọn nào?</p>

              <div className="flex flex-col gap-3">
                {/* Option 1: Theo bộ lọc ngày */}
                <div
                  onClick={() => setOrderExportScope('FILTERED')}
                  className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${orderExportScope === 'FILTERED' ? 'border-pink-500 bg-pink-50/70 shadow-sm ring-2 ring-pink-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                >
                  <input
                    type="radio"
                    name="orderExportScope"
                    checked={orderExportScope === 'FILTERED'}
                    onChange={() => setOrderExportScope('FILTERED')}
                    className="mt-1 text-pink-600 focus:ring-pink-500 cursor-pointer"
                  />
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-slate-800">Xuất theo bộ lọc ngày</span>
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-pink-100 text-pink-700">
                        {filteredOrderData.length.toLocaleString('en-US')} dòng
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {overviewDateFilters.length > 0
                        ? `Đang áp dụng ngày: ${overviewDateFilters.join(', ')}`
                        : 'Xuất theo ngày hiển thị hiện tại'}
                    </p>
                  </div>
                </div>

                {/* Option 2: Theo bộ lọc lũy kế tháng (MTD) */}
                <div
                  onClick={() => setOrderExportScope('MTD')}
                  className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${orderExportScope === 'MTD' ? 'border-pink-500 bg-pink-50/70 shadow-sm ring-2 ring-pink-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                >
                  <input
                    type="radio"
                    name="orderExportScope"
                    checked={orderExportScope === 'MTD'}
                    onChange={() => setOrderExportScope('MTD')}
                    className="mt-1 text-pink-600 focus:ring-pink-500 cursor-pointer"
                  />
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-slate-800">Xuất theo bộ lọc lũy kế tháng</span>
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                        {mtdOrderData.length.toLocaleString('en-US')} dòng
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Lũy kế tháng {latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''} (từ đầu tháng đến ngày lọc {latestUnifiedDate ? `${latestUnifiedDate.getDate()}/${latestUnifiedDate.getMonth() + 1}` : ''})
                    </p>
                  </div>
                </div>

                {/* Option 3: Đầy đủ toàn bộ dữ liệu */}
                <div
                  onClick={() => setOrderExportScope('ALL')}
                  className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${orderExportScope === 'ALL' ? 'border-pink-500 bg-pink-50/70 shadow-sm ring-2 ring-pink-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                >
                  <input
                    type="radio"
                    name="orderExportScope"
                    checked={orderExportScope === 'ALL'}
                    onChange={() => setOrderExportScope('ALL')}
                    className="mt-1 text-pink-600 focus:ring-pink-500 cursor-pointer"
                  />
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-slate-800">Xuất đầy đủ dữ liệu (Gốc)</span>
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {orderData.length.toLocaleString('en-US')} dòng
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Bao gồm toàn bộ tất cả các dòng dữ liệu đơn hàng trong hệ thống (không lọc).
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-white flex justify-end gap-3">
              <button
                onClick={() => setIsOrderExportScopeModalOpen(false)}
                className="px-5 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-all text-sm cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  setIsOrderExportScopeModalOpen(false);
                  setSelectedOrderExportColumns(effectiveOrderColumns.map(c => c.key));
                  setIsOrderExportModalOpen(true);
                }}
                className="px-6 py-2 bg-pink-600 text-white font-bold rounded-lg hover:bg-pink-700 transition-all shadow-md active:scale-95 text-sm flex items-center gap-2 cursor-pointer"
              >
                Tiếp tục (Chọn cột) &rarr;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP 2: CHỌN CỘT XUẤT DỮ LIỆU ĐƠN HÀNG (P001) */}
      {isOrderExportModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-pink-600 to-rose-600">
              <div className="flex items-center gap-3 text-white">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Download size={24} className="text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-white uppercase tracking-wider">Chọn Cột Xuất Dữ Liệu</h3>
                    <span className="text-[10px] bg-white/20 text-white font-bold px-2 py-0.5 rounded-full border border-white/30">
                      {orderExportScope === 'FILTERED' ? 'Theo bộ lọc ngày' : orderExportScope === 'MTD' ? 'Lũy kế tháng' : 'Toàn bộ'}
                    </span>
                  </div>
                  <p className="text-[10px] text-pink-100 font-medium">Bước 2/2: Chọn các cột cần xuất ra file CSV (.csv)</p>
                </div>
              </div>
              <button
                onClick={() => setIsOrderExportModalOpen(false)}
                className="p-2 hover:bg-white/20 rounded-full transition-all text-white/90 hover:text-white cursor-pointer"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 custom-scrollbar">
              <div className="mb-4 flex gap-2 justify-between items-center">
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedOrderExportColumns(effectiveOrderColumns.map(c => c.key))}
                    className="px-3 py-1.5 text-xs font-semibold bg-slate-200 text-slate-700 hover:bg-slate-300 rounded transition-colors cursor-pointer"
                  >
                    Chọn Tất Cả
                  </button>
                  <button
                    onClick={() => setSelectedOrderExportColumns([])}
                    className="px-3 py-1.5 text-xs font-semibold bg-slate-200 text-slate-700 hover:bg-slate-300 rounded transition-colors cursor-pointer"
                  >
                    Bỏ Chọn Tất Cả
                  </button>
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  Đã chọn: <b className="text-pink-600">{selectedOrderExportColumns.length}</b>/{effectiveOrderColumns.length} cột
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {effectiveOrderColumns.map(col => {
                  const isSelected = selectedOrderExportColumns.includes(col.key);
                  return (
                    <label key={col.key} className={`flex items-center gap-2 p-2 border rounded cursor-pointer transition-colors ${isSelected ? 'bg-pink-50 border-pink-300 text-pink-800 font-medium' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedOrderExportColumns(prev => [...prev, col.key]);
                          } else {
                            setSelectedOrderExportColumns(prev => prev.filter(k => k !== col.key));
                          }
                        }}
                      />
                      <span className="text-sm truncate" title={col.label}>{col.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-white flex justify-between items-center gap-3">
              <button
                onClick={() => {
                  setIsOrderExportModalOpen(false);
                  setIsOrderExportScopeModalOpen(true);
                }}
                className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-all text-sm flex items-center gap-1 cursor-pointer"
              >
                &larr; Quay lại
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsOrderExportModalOpen(false)}
                  className="px-5 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-all text-sm cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  onClick={() => {
                    let sourceData: DataRow[] = [];
                    let suffix = 'Theo_Bo_Loc_Ngay';
                    if (orderExportScope === 'ALL') {
                      sourceData = orderData;
                      suffix = 'Toan_Bo';
                    } else if (orderExportScope === 'MTD') {
                      sourceData = (mtdOrderData && mtdOrderData.length > 0) ? mtdOrderData : orderData;
                      suffix = `Luy_Ke_Thang_T${latestUnifiedDate ? latestUnifiedDate.getMonth() + 1 : ''}`;
                    } else {
                      sourceData = (filteredOrderData && filteredOrderData.length > 0) ? filteredOrderData : orderData;
                      suffix = 'Theo_Bo_Loc_Ngay';
                    }

                    if (!sourceData || sourceData.length === 0) {
                      alert("Không có dữ liệu đơn hàng nào để xuất!");
                      return;
                    }

                    const exportDataMapped = sourceData.map(row => {
                      const newRow: any = {};
                      selectedOrderExportColumns.forEach(colKey => {
                        const colDef = effectiveOrderColumns.find(c => c.key === colKey);
                        const headerLabel = colDef ? colDef.label : colKey;
                        newRow[headerLabel] = row[colKey] !== undefined && row[colKey] !== null ? row[colKey] : '';
                      });
                      return newRow;
                    });

                    console.log("Exporting Order Data (P001):", {
                      scope: orderExportScope,
                      totalSourceRows: sourceData.length,
                      selectedColumnsCount: selectedOrderExportColumns.length,
                      sampleRow: exportDataMapped[0]
                    });

                    exportToCSV(exportDataMapped, `Don_Hang_Moi_P001_${suffix}_${new Date().toISOString().split('T')[0]}.csv`);
                    setIsOrderExportModalOpen(false);
                  }}
                  disabled={selectedOrderExportColumns.length === 0}
                  className="px-8 py-2.5 bg-pink-600 text-white font-bold rounded-lg hover:bg-pink-700 transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Download size={18} /> Xác Nhận Xuất (.CSV)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Funnel Pivot Detail Modal */}
      {isFunnelPivotModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6" onClick={() => setIsFunnelPivotModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 sm:p-6 border-b border-slate-100 bg-slate-50/50">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Chi tiết dữ liệu Phễu</h2>
                <p className="text-xs text-slate-500 mt-1">Phân tích giá trị theo BOP</p>
              </div>
              <button onClick={() => setIsFunnelPivotModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto">
              {pivotFunnelData && pivotFunnelData.data && pivotFunnelData.data.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 border-b border-slate-200 text-left font-bold text-slate-700 w-1/2">BOP</th>
                        <th className="px-4 py-3 border-b border-slate-200 text-right font-bold text-slate-700 w-1/2">Giá Trị</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {pivotFunnelData.data.map((item, index) => (
                        <tr key={item.name} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-left font-medium text-slate-700 flex items-center gap-2">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold">{index + 1}</span>
                            <span className="truncate max-w-[200px]" title={item.name}>{item.name}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-800">
                            {formatNumber(item.value, workshopMetric)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-wood-100 font-bold text-slate-800 border-t border-wood-300">
                      <tr>
                        <td className="px-4 py-3 text-left uppercase text-slate-700">Tổng Cộng</td>
                        <td className="px-4 py-3 text-right text-slate-800 text-base">{formatNumber(pivotFunnelData.total, workshopMetric)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg border border-slate-200">Không có dữ liệu để hiển thị.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
