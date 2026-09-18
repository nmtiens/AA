import React, { useState, useEffect, useMemo } from 'react';
import { Settings, Save, RefreshCw, Check, ChevronDown, Database } from 'lucide-react';
import { DataRow, ColumnDefinition } from '../types';
import { useToast } from '../context/ToastContext';

// ----------------------------------------------------------------------------------
// GHI CHÚ TÍCH HỢP:
// - Component này giả định ColumnDefinition có ít nhất trường `header: string`
//   (tên cột gốc lấy từ dữ liệu nguồn, ví dụ Excel/Google Sheet).
//   Nếu ColumnDefinition của bạn khác (vd dùng `key` thay vì `header`), đổi lại
//   biến COLUMN_ID_FIELD bên dưới cho khớp.
// - Mapping (tên hiển thị + loại dữ liệu) hiện được lưu vào localStorage theo
//   từng bảng, để trang có thể chạy được ngay không cần backend mới.
//   Khi có API thật, thay 2 hàm loadMappingFromServer / saveMappingToServer
//   bằng lệnh gọi fetch tới endpoint của bạn (gợi ý: GET/POST /api/column-mapping/:table).
// ----------------------------------------------------------------------------------

type DataType = 'text' | 'number' | 'date' | 'currency' | 'percent';

interface ColumnMapping {
  header: string;      // tên cột gốc trong dữ liệu nguồn
  label: string;       // tên hiển thị (có thể chỉnh sửa)
  dataType: DataType;  // loại dữ liệu
}

interface TableOption {
  key: string;         // key nội bộ (khớp với context props bên dưới)
  label: string;       // tên hiển thị trong dropdown
  columns: ColumnDefinition[];
}

const DATA_TYPE_OPTIONS: { value: DataType; label: string }[] = [
  { value: 'text', label: 'Văn bản' },
  { value: 'number', label: 'Số' },
  { value: 'date', label: 'Ngày tháng' },
  { value: 'currency', label: 'Tiền tệ' },
  { value: 'percent', label: 'Phần trăm' },
];

const STORAGE_PREFIX = 'column_mapping_';

function loadMappingFromStorage(tableKey: string): Record<string, ColumnMapping> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + tableKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveMappingToStorage(tableKey: string, mapping: Record<string, ColumnMapping>) {
  localStorage.setItem(STORAGE_PREFIX + tableKey, JSON.stringify(mapping));
}

// Props: truyền toàn bộ context của MainLayout vào (giống các Wrapper khác trong App.tsx)
interface SetupDataProps {
  productionColumns: ColumnDefinition[];
  materialColumns: ColumnDefinition[];
  khsxColumns: ColumnDefinition[];
  orderColumns: ColumnDefinition[];
  inventoryColumns: ColumnDefinition[];
  tkbvColumns: ColumnDefinition[];
  pthspColumns: ColumnDefinition[];
  analysisColumns: ColumnDefinition[];
  yearlyPlanColumns: ColumnDefinition[];
  exportColumns: ColumnDefinition[];
  stockColumns: ColumnDefinition[];
  attendanceColumns: ColumnDefinition[];
  [key: string]: any; // cho phép nhận thêm các props khác từ context mà không lỗi type
}

const SetupData: React.FC<SetupDataProps> = (props) => {
  const { showToast } = useToast();

  const tableOptions: TableOption[] = useMemo(() => [
    { key: 'production', label: 'Sản xuất', columns: props.productionColumns || [] },
    { key: 'material', label: 'Vật tư', columns: props.materialColumns || [] },
    { key: 'khsx', label: 'KHSX', columns: props.khsxColumns || [] },
    { key: 'order', label: 'Đơn hàng', columns: props.orderColumns || [] },
    { key: 'inventory', label: 'Nhập kho', columns: props.inventoryColumns || [] },
    { key: 'tkbv', label: 'TKBV', columns: props.tkbvColumns || [] },
    { key: 'pthsp', label: 'PTHSP', columns: props.pthspColumns || [] },
    { key: 'analysis', label: 'Phân tích KH/TH', columns: props.analysisColumns || [] },
    { key: 'yearly-plan', label: 'Kế hoạch năm', columns: props.yearlyPlanColumns || [] },
    { key: 'export', label: 'Xuất kho', columns: props.exportColumns || [] },
    { key: 'stock', label: 'Tồn kho', columns: props.stockColumns || [] },
    { key: 'attendance', label: 'Điểm danh', columns: props.attendanceColumns || [] },
  ], [props]);

  const [selectedTableKey, setSelectedTableKey] = useState<string>(tableOptions[0]?.key || '');
  const [mapping, setMapping] = useState<Record<string, ColumnMapping>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const selectedTable = tableOptions.find(t => t.key === selectedTableKey);

  // Nạp mapping hiện có mỗi khi đổi bảng
  useEffect(() => {
    if (!selectedTable) return;
    const stored = loadMappingFromStorage(selectedTable.key);

    const initial: Record<string, ColumnMapping> = {};
    selectedTable.columns.forEach((col) => {
      const header = (col as any).header ?? (col as any).key ?? '';
      if (!header) return;
      initial[header] = stored[header] || {
        header,
        label: header,
        dataType: 'text',
      };
    });
    setMapping(initial);
  }, [selectedTableKey, selectedTable]);

  const handleLabelChange = (header: string, newLabel: string) => {
    setMapping(prev => ({
      ...prev,
      [header]: { ...prev[header], label: newLabel },
    }));
  };

  const handleTypeChange = (header: string, newType: DataType) => {
    setMapping(prev => ({
      ...prev,
      [header]: { ...prev[header], dataType: newType },
    }));
  };

  const handleSave = async () => {
    if (!selectedTable) return;
    setIsSaving(true);
    try {
      // TODO: thay bằng gọi API thật khi có backend, ví dụ:
      // await fetch(`/api/column-mapping/${selectedTable.key}`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(mapping),
      // });
      saveMappingToStorage(selectedTable.key, mapping);
      showToast('Đã lưu mapping cột thành công', 'success');
    } catch (err) {
      showToast('Lưu mapping thất bại', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetLabels = () => {
    if (!selectedTable) return;
    setMapping(prev => {
      const reset: Record<string, ColumnMapping> = {};
      Object.keys(prev).forEach((header) => {
        reset[header] = { ...prev[header], label: header };
      });
      return reset;
    });
  };

  const columnCount = selectedTable?.columns.length || 0;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-wood-50">
      {/* Header */}
      <div className="px-6 py-5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-wood-600 flex items-center justify-center text-white shadow-sm">
            <Settings size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Setup dữ liệu</h1>
            <p className="text-xs text-slate-500">Quản lý mapping tên cột và loại dữ liệu cho từng bảng</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-5">

          {/* Chọn bảng dữ liệu */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <label className="text-xs font-bold text-slate-500 block mb-2">Chọn bảng dữ liệu</label>
            <div className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full flex items-center justify-between px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:border-wood-400 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Database size={16} className="text-wood-600" />
                  {selectedTable?.label || 'Chọn bảng'}
                  <span className="text-slate-400 font-normal">({columnCount} cột)</span>
                </span>
                <ChevronDown size={16} className={`transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isDropdownOpen && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {tableOptions.map((table) => (
                    <button
                      key={table.key}
                      onClick={() => { setSelectedTableKey(table.key); setIsDropdownOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-wood-50 transition-colors flex items-center justify-between
                        ${table.key === selectedTableKey ? 'bg-wood-50 text-wood-700 font-semibold' : 'text-slate-700'}`}
                    >
                      {table.label}
                      <span className="text-xs text-slate-400">{table.columns.length} cột</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bảng mapping */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-700">Mapping cột — {selectedTable?.label}</h2>
              <button
                onClick={handleResetLabels}
                className="text-xs text-slate-500 hover:text-wood-600 font-medium"
              >
                Đặt lại tên hiển thị
              </button>
            </div>

            {columnCount === 0 ? (
              <div className="p-10 text-center text-slate-400 text-sm">
                Chưa có dữ liệu cột cho bảng này. Hãy làm mới dữ liệu trước.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                      <th className="text-left px-5 py-2.5 font-semibold w-1/3">Tên cột gốc</th>
                      <th className="text-left px-5 py-2.5 font-semibold w-1/3">Tên hiển thị</th>
                      <th className="text-left px-5 py-2.5 font-semibold w-1/3">Loại dữ liệu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Object.values(mapping).map((row) => (
                      <tr key={row.header} className="hover:bg-wood-50/40">
                        <td className="px-5 py-2.5 text-slate-600 font-mono text-xs">{row.header}</td>
                        <td className="px-5 py-2.5">
                          <input
                            type="text"
                            value={row.label}
                            onChange={(e) => handleLabelChange(row.header, e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500 outline-none"
                          />
                        </td>
                        <td className="px-5 py-2.5">
                          <select
                            value={row.dataType}
                            onChange={(e) => handleTypeChange(row.header, e.target.value as DataType)}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500 outline-none bg-white"
                          >
                            {DATA_TYPE_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Nút lưu */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={isSaving || columnCount === 0}
              className={`flex items-center gap-2 px-5 py-2.5 bg-wood-600 text-white rounded-lg font-medium hover:bg-wood-700 transition-colors
                ${(isSaving || columnCount === 0) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
              {isSaving ? 'Đang lưu...' : 'Lưu mapping'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SetupData;
