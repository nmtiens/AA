import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DataRow, ColumnDefinition, TARGET_COLUMN_NAMES } from '../types';
import { Search, Download, ArrowUpDown, ChevronLeft, ChevronRight, Settings, Check, X, Filter, ChevronDown, XCircle, LayoutTemplate } from 'lucide-react';
import { exportToCSV } from '../services/dataService';

interface DataGridProps {
  data: DataRow[];
  columns: ColumnDefinition[];
  defaultVisibleColumns?: string[];
  filterHeaders?: string[];
  primarySearchColumn?: { header: string; label: string };
  additionalSearchColumns?: { header: string; label: string }[];
  exportFileNamePrefix?: string;
  enableAggregation?: boolean;
}

const ROWS_PER_PAGE = 200;

type AggregationType = 'NONE' | 'SUM' | 'COUNT' | 'DISTINCT_COUNT' | 'AVERAGE';

// --- Helper Functions ---
const parseNumber = (valStr: string | number | null | undefined): number => {
  try {
    if (valStr === null || valStr === undefined) return 0;
    if (typeof valStr === 'number') return isNaN(valStr) ? 0 : valStr;
    let s = String(valStr).trim().replace(/[^\d.,-]/g, '');
    if (!s) return 0;
    if ((s.match(/\./g) || []).length > 1) { s = s.replace(/\./g, '').replace(',', '.'); return parseFloat(s) || 0; }
    if ((s.match(/,/g) || []).length > 1) { s = s.replace(/,/g, ''); return parseFloat(s) || 0; }
    if (s.indexOf('.') !== -1 && s.indexOf(',') !== -1) {
      if (s.lastIndexOf('.') < s.lastIndexOf(',')) { s = s.replace(/\./g, '').replace(',', '.'); } else { s = s.replace(/,/g, ''); }
    } else if (s.indexOf('.') !== -1) {
      const parts = s.split('.');
      if (parts.length === 2 && parts[1].length === 3) { s = s.replace('.', ''); }
    } else if (s.indexOf(',') !== -1) { s = s.replace(',', '.'); }
    const res = parseFloat(s);
    return isNaN(res) ? 0 : res;
  } catch (e) { return 0; }
};

const formatAggregationValue = (value: number, type: AggregationType): string => {
  if (type === 'COUNT' || type === 'DISTINCT_COUNT') return value.toLocaleString('vi-VN');
  // For Sum/Avg, format with 2 decimals strict
  return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
};

// --- Helper Components ---
// ... existing ExcelColumnFilter ...


const ExcelColumnFilter = ({
  label,
  options,
  selectedValues,
  onChange
}: {
  label: string;
  options: string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
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
    const newSelected = selectedValues.includes(val)
      ? selectedValues.filter(v => v !== val)
      : [...selectedValues, val];
    onChange(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedValues.length === filteredOptions.length && filteredOptions.length > 0) {
      // Deselect all visible
      const visibleSet = new Set(filteredOptions);
      onChange(selectedValues.filter(v => !visibleSet.has(v)));
    } else {
      // Select all visible
      const currentSet = new Set(selectedValues);
      filteredOptions.forEach(opt => currentSet.add(opt));
      onChange(Array.from(currentSet));
    }
  };

  const isAllSelected = filteredOptions.length > 0 && filteredOptions.every(opt => selectedValues.includes(opt));
  const activeCount = selectedValues.length;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between w-full min-w-[160px] max-w-[200px] px-3 py-2 text-sm border rounded-lg bg-white hover:bg-slate-50 transition-colors ${activeCount > 0 ? 'border-wood-500 ring-1 ring-wood-200' : 'border-slate-200'}`}
      >
        <div className="flex flex-col items-start truncate mr-2">
          <span className="text-[9px] text-black font-bold uppercase tracking-wider">{label}</span>
          <span className="truncate font-medium text-slate-700 w-full text-left">
            {activeCount === 0 ? 'Tất cả' : `${activeCount} đã chọn`}
          </span>
        </div>
        <ChevronDown size={14} className="text-slate-400 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl z-50 flex flex-col max-h-[400px]">
          <div className="p-2 border-b border-slate-100">
            <input
              type="text"
              placeholder="Tìm kiếm..."
              className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:border-wood-400 bg-white"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>
          <div className="p-2 border-b border-slate-100 bg-slate-50">
            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700 hover:text-wood-600">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={handleSelectAll}
                className="rounded border-slate-300 text-wood-600 focus:ring-wood-500"
              />
              (Chọn tất cả)
            </label>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
            {filteredOptions.length === 0 ? (
              <div className="p-2 text-xs text-slate-400 text-center">Không tìm thấy dữ liệu</div>
            ) : (
              filteredOptions.map(opt => (
                <label key={opt} className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-wood-50 rounded text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedValues.includes(opt)}
                    onChange={() => toggleValue(opt)}
                    className="rounded border-slate-300 text-wood-600 focus:ring-wood-500"
                  />
                  <span className="truncate">{opt}</span>
                </label>
              ))
            )}
          </div>
          <div className="p-2 border-t border-slate-100 flex justify-end">
            <button
              onClick={() => setIsOpen(false)}
              className="px-3 py-1 bg-wood-600 text-white text-xs rounded hover:bg-wood-700 transition-colors"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Main Component ---

const DataGrid: React.FC<DataGridProps> = ({
  data,
  columns,
  defaultVisibleColumns = [],
  filterHeaders = [],
  primarySearchColumn = { header: TARGET_COLUMN_NAMES.HEX, label: 'Mã HEX (Tìm nhiều)' },
  additionalSearchColumns = [],
  exportFileNamePrefix = 'data',
  enableAggregation = false
}) => {
  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // View Mode State
  const [isDefaultView, setIsDefaultView] = useState(true);

  // Show/Hide Columns State
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);

  // Advanced Filters State
  const [primaryFilterValue, setPrimaryFilterValue] = useState('');
  // State for additional search columns (e.g. SỐ PO)
  const [additionalSearchValues, setAdditionalSearchValues] = useState<Record<string, string>>({});
  const [advancedFilters, setAdvancedFilters] = useState<Record<string, string[]>>({});
  // Aggregation State
  const [aggregationSettings, setAggregationSettings] = useState<Record<string, AggregationType>>({});

  // Auto-set Default Aggregations
  useEffect(() => {
    if (columns.length > 0 && enableAggregation) {
      setAggregationSettings(prev => {
        // Only set defaults if state is empty to avoid overwriting user choices
        if (Object.keys(prev).length > 0) return prev;

        const defaults: Record<string, AggregationType> = {};
        columns.forEach(col => {
          const key = col.key;
          const label = col.label?.toUpperCase() || '';
          const keyUpper = key.toUpperCase();

          if (key === TARGET_COLUMN_NAMES.HEX) {
            defaults[key] = 'COUNT';
          } else if (key === TARGET_COLUMN_NAMES.CONG_TRINH) {
            defaults[key] = 'DISTINCT_COUNT';
          } else if (
            label.includes('GIÁ TRỊ') ||
            label.includes('TRỊ GIÁ') ||
            label.includes('THÀNH TIỀN') ||
            label.includes('SỐ LƯỢNG') ||
            keyUpper.includes('AMOUNT') ||
            keyUpper.includes('VALUE') ||
            keyUpper.includes('QTY') ||
            keyUpper.includes('QUANTITY')
          ) {
            defaults[key] = 'SUM';
          }
        });
        return defaults;
      });
    }
  }, [columns, enableAggregation]);

  // Generate a stable hash/string for defaultVisibleColumns to avoid infinite loop
  const defaultColsHash = defaultVisibleColumns ? defaultVisibleColumns.join(',') : '';

  // Apply default columns on initial load if columns exist
  useEffect(() => {
    if (columns.length > 0 && isDefaultView) {
      applyDefaultView();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns.length, defaultColsHash, isDefaultView]);

  const applyDefaultView = () => {
    setIsDefaultView(true);

    // If no default columns provided, show all
    if (!defaultVisibleColumns || defaultVisibleColumns.length === 0) {
      setHiddenColumns([]);
      return;
    }

    // Find all columns that are NOT in the default list
    const allColumnKeys = columns.map(c => c.key);

    const columnsToHide = allColumnKeys.filter(key => {
      const normalizedKey = key.replace(/\n/g, ' ').trim();
      // Check loosely against the default list
      return !defaultVisibleColumns.some(def => def === key || def.replace(/\n/g, ' ').trim() === normalizedKey);
    });
    setHiddenColumns(columnsToHide);
  };

  // Manual toggle switches off default view mode
  const toggleColumnVisibility = (key: string) => {
    if (isDefaultView) {
      setIsDefaultView(false);
    }
    const newHidden = hiddenColumns.includes(key)
      ? hiddenColumns.filter(k => k !== key)
      : [...hiddenColumns, key];
    setHiddenColumns(newHidden);
  };

  // Close Column Menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(event.target as Node)) {
        setIsColumnMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- Identify Key Columns ---
  const getColumnKey = (exactName: string) => {
    return columns.find(c => c.key === exactName)?.key || '';
  };

  const primaryKey = useMemo(() => getColumnKey(primarySearchColumn.header), [columns, primarySearchColumn.header]);

  // --- Extract Unique Options for Excel Filters ---
  const getUniqueOptions = (key: string) => {
    if (!key) return [];
    const set = new Set(data.map(d => String(d[key] || '').trim()).filter(Boolean));
    return Array.from(set).sort();
  };

  // --- Data Processing ---
  const visibleColumns = useMemo(() => {
    if (isDefaultView && defaultVisibleColumns.length > 0) {
      // In default view, we enforce the specific order and visibility
      const orderedCols: ColumnDefinition[] = [];
      defaultVisibleColumns.forEach(defKey => {
        const match = columns.find(c => c.key === defKey || c.key.replace(/\n/g, ' ').trim() === defKey.replace(/\n/g, ' ').trim());
        if (match) orderedCols.push(match);
      });
      return orderedCols;
    }
    // In custom view or empty default, we use CSV order but respect hidden columns
    return columns.filter(c => !hiddenColumns.includes(c.key));
  }, [columns, hiddenColumns, isDefaultView, defaultVisibleColumns]);

  const processedData = useMemo(() => {
    let result = [...data];

    // 1. Global Search
    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter(row =>
        visibleColumns.some(col =>
          String(row[col.key] || '').toLowerCase().includes(lowerTerm)
        )
      );
    }

    // 2. Primary Filter (Multi-search)
    if (primaryFilterValue && primaryKey) {
      const tokens = primaryFilterValue.toLowerCase().split(/[\s,]+/).filter(t => t.trim().length > 0);
      if (tokens.length > 0) {
        result = result.filter(row => {
          const val = String(row[primaryKey] || '').toLowerCase();
          return tokens.some(token => val.includes(token));
        });
      }
    }

    // 3. Additional Search Columns (Multi-search)
    additionalSearchColumns.forEach(colConfig => {
      const term = String(additionalSearchValues[colConfig.header] || '');
      const colKey = getColumnKey(colConfig.header);
      if (term && colKey) {
        const tokens = term.toLowerCase().split(/[\s,]+/).filter(t => t.trim().length > 0);
        if (tokens.length > 0) {
          result = result.filter(row => {
            const val = String(row[colKey] || '').toLowerCase();
            return tokens.some(token => val.includes(token));
          });
        }
      }
    });

    // 4. Dynamic Excel Filters
    Object.entries(advancedFilters).forEach(([header, selectedValues]) => {
      // Safe access to array property
      const safeSelectedValues = selectedValues as unknown as string[];
      if (Array.isArray(safeSelectedValues) && safeSelectedValues.length > 0) {
        const key = getColumnKey(header);
        if (key) {
          result = result.filter(row => safeSelectedValues.includes(String(row[key] || '').trim()));
        }
      }
    });

    // 5. Sort
    if (sortConfig) {
      result.sort((a, b) => {
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        const comparison = valA < valB ? -1 : 1;
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [data, visibleColumns, searchTerm, primaryFilterValue, additionalSearchValues, advancedFilters, sortConfig, primaryKey, additionalSearchColumns]);

  // Calculate Aggregation
  const getAggregationResult = (colKey: string, type: AggregationType) => {
    if (type === 'NONE') return null;

    const values = processedData.map(row => row[colKey]);

    if (type === 'COUNT') {
      return values.length;
    }

    if (type === 'DISTINCT_COUNT') {
      return new Set(values.map(v => String(v))).size;
    }

    // For Sum and Average, we need numbers
    if (type === 'SUM' || type === 'AVERAGE') {
      const numbers = values.map(v => parseNumber(v));
      const sum = numbers.reduce((a, b) => a + b, 0);

      if (type === 'SUM') return sum;
      if (type === 'AVERAGE') return values.length > 0 ? sum / values.length : 0;
    }

    return 0;
  };

  // --- Pagination ---
  const totalPages = Math.ceil(processedData.length / ROWS_PER_PAGE);
  const paginatedData = processedData.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleExport = () => {
    const fileName = `${exportFileNamePrefix}_${new Date().toISOString().split('T')[0]}.csv`;
    // Export only visible columns
    const exportData = processedData.map(row => {
      const newRow: Record<string, any> = {};
      visibleColumns.forEach(col => {
        newRow[col.label] = row[col.key];
      });
      return newRow;
    });
    exportToCSV(exportData, fileName);
  };

  const clearAllFilters = () => {
    setSearchTerm('');
    setPrimaryFilterValue('');
    setAdditionalSearchValues({});
    setAdvancedFilters({});
  };

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, primaryFilterValue, additionalSearchValues, advancedFilters]);

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-slate-200">
      {/* Toolbar */}
      <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-50/50">

        {/* Left: Search & Filters */}
        <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto items-center">
          {/* Primary Search */}
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder={primarySearchColumn.label}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wood-400"
              value={primaryFilterValue}
              onChange={e => setPrimaryFilterValue(e.target.value)}
            />
          </div>

          {/* Additional Search Columns */}
          {additionalSearchColumns.map((colConfig, idx) => (
            <div key={idx} className="relative w-full md:w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder={colConfig.label}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wood-400"
                value={additionalSearchValues[colConfig.header] || ''}
                onChange={e => setAdditionalSearchValues(prev => ({ ...prev, [colConfig.header]: e.target.value }))}
              />
            </div>
          ))}

          {/* Global Search */}
          <div className="relative w-full md:w-64">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Lọc trong bảng..."
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-wood-400"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Clear Filters Button */}
          {(searchTerm || primaryFilterValue || Object.keys(additionalSearchValues).some(k => additionalSearchValues[k]) || Object.keys(advancedFilters).some(k => advancedFilters[k]?.length > 0)) && (
            <button
              onClick={clearAllFilters}
              className="p-2 text-red-500 hover:bg-red-50 rounded-lg border border-red-100 transition-colors"
              title="Xóa tất cả bộ lọc"
            >
              <XCircle size={18} />
            </button>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex gap-2">
          {/* Dynamic Column Filters (Excel-style) */}
          {filterHeaders.map(header => {
            // Ensure unique key for dropdown, fallback to header name
            const key = header;
            // Only render if column exists in data
            const colKey = getColumnKey(header);
            if (!colKey) return null;

            return (
              <ExcelColumnFilter
                key={key}
                label={header}
                options={getUniqueOptions(colKey)}
                selectedValues={advancedFilters[header] || []}
                onChange={(vals) => setAdvancedFilters(prev => ({ ...prev, [header]: vals }))}
              />
            );
          })}

          {/* Column Visibility Menu */}
          <div className="relative" ref={colMenuRef}>
            <button
              onClick={() => setIsColumnMenuOpen(!isColumnMenuOpen)}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
            >
              <LayoutTemplate size={16} />
              <span className="hidden sm:inline text-sm font-medium">Cột</span>
            </button>

            {isColumnMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 flex flex-col max-h-[400px]">
                <div className="p-3 border-b border-slate-100 bg-slate-50 rounded-t-xl flex justify-between items-center">
                  <h4 className="font-bold text-sm text-slate-700">Hiển thị cột</h4>
                  <button
                    onClick={applyDefaultView}
                    className="text-[10px] text-blue-600 hover:underline font-medium"
                  >
                    Mặc định
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                  {columns.map(col => (
                    <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${!hiddenColumns.includes(col.key) ? 'bg-wood-600 border-wood-600 text-white' : 'border-slate-300'}`}>
                        {!hiddenColumns.includes(col.key) && <Check size={12} />}
                      </div>
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={!hiddenColumns.includes(col.key)}
                        onChange={() => toggleColumnVisibility(col.key)}
                      />
                      <span className="text-sm text-slate-700 truncate">{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 bg-wood-600 text-white rounded-lg hover:bg-wood-700 transition-colors shadow-sm"
          >
            <Download size={16} />
            <span className="hidden sm:inline text-sm font-medium">Xuất CSV</span>
          </button>
        </div>
      </div>

      {/* Table Area */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-4 py-3 text-center border-b border-slate-200 text-xs font-bold text-slate-500 uppercase w-12">#</th>
              {visibleColumns.map(col => (
                <th
                  key={col.key}
                  className="px-4 py-3 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-slate-100 transition-colors group"
                  onClick={() => handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    <ArrowUpDown size={12} className={`text-slate-300 transition-colors ${sortConfig?.key === col.key ? 'text-wood-600' : 'group-hover:text-slate-400'}`} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {paginatedData.length > 0 ? (
              paginatedData.map((row, index) => (
                <tr key={index} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 text-center text-xs text-slate-400 font-mono">
                    {(currentPage - 1) * ROWS_PER_PAGE + index + 1}
                  </td>
                  {visibleColumns.map(col => (
                    <td key={col.key} className="px-4 py-2.5 text-sm text-slate-700 whitespace-nowrap">
                      {row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="px-6 py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Search size={32} className="opacity-20" />
                    <p>Không tìm thấy dữ liệu phù hợp.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>

          {/* Aggregation Footer */}
          {enableAggregation && (
            <tfoot className="bg-wood-50 sticky bottom-0 z-20 font-bold border-t-2 border-wood-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
              <tr>
                <td className="px-4 py-3 text-center text-xs text-wood-700 bg-wood-100/50">
                  TỔNG
                </td>
                {visibleColumns.map(col => {
                  const type = aggregationSettings[col.key] || 'NONE';
                  const result = getAggregationResult(col.key, type);

                  return (
                    <td key={col.key} className="px-4 py-2 min-w-[120px]">
                      <div className="flex flex-col gap-1 w-full">
                        <select
                          className="text-[10px] uppercase font-bold text-slate-500 bg-transparent border-none focus:ring-0 cursor-pointer p-0 w-full hover:text-wood-600 transition-colors"
                          value={type}
                          onChange={(e) => setAggregationSettings(prev => ({ ...prev, [col.key]: e.target.value as AggregationType }))}
                        >
                          <option value="NONE">-- Chọn --</option>
                          <option value="SUM">Tổng (Sum)</option>
                          <option value="COUNT">Đếm (Count)</option>
                          <option value="DISTINCT_COUNT">Đếm khác nhau</option>
                          <option value="AVERAGE">Trung bình</option>
                        </select>

                        {type !== 'NONE' && result !== null && (
                          <div className="text-right font-bold text-wood-700 text-sm animate-in fade-in slide-in-from-bottom-1 border-t border-wood-200/50 pt-1">
                            {formatAggregationValue(result, type)}
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Footer / Pagination */}
      <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="text-xs text-slate-500">
          Hiển thị <span className="font-bold text-slate-700">{processedData.length > 0 ? (currentPage - 1) * ROWS_PER_PAGE + 1 : 0}</span> đến <span className="font-bold text-slate-700">{Math.min(currentPage * ROWS_PER_PAGE, processedData.length)}</span> trong tổng số <span className="font-bold text-slate-700">{processedData.length}</span> dòng
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-slate-600"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="text-xs font-medium text-slate-700 bg-white border border-slate-200 px-3 py-2 rounded-lg">
              Trang {currentPage} / {totalPages}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-slate-600"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataGrid;