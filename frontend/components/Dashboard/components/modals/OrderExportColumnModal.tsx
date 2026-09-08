import React from 'react';
import { Download, X } from 'lucide-react';
import { DataRow, ColumnDefinition } from '../../../../types';
import { exportToCSV } from '../../../../services/dataService';
import { ExportScope } from './OrderExportScopeModal';

interface OrderExportColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
  orderExportScope: ExportScope;
  effectiveOrderColumns: ColumnDefinition[];
  selectedOrderExportColumns: string[];
  setSelectedOrderExportColumns: React.Dispatch<React.SetStateAction<string[]>>;
  orderData: DataRow[];
  filteredOrderData: DataRow[];
  mtdOrderData: DataRow[];
  latestUnifiedDate: Date | null;
}

export const OrderExportColumnModal = ({
  isOpen,
  onClose,
  onBack,
  orderExportScope,
  effectiveOrderColumns,
  selectedOrderExportColumns,
  setSelectedOrderExportColumns,
  orderData,
  filteredOrderData,
  mtdOrderData,
  latestUnifiedDate,
}: OrderExportColumnModalProps) => {
  if (!isOpen) return null;

  const handleConfirmExport = () => {
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

    exportToCSV(exportDataMapped, `Don_Hang_Moi_P001_${suffix}_${new Date().toISOString().split('T')[0]}.csv`);
    onClose();
  };

  return (
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
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-all text-white/90 hover:text-white cursor-pointer">
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
                <label
                  key={col.key}
                  className={`flex items-center gap-2 p-2 border rounded cursor-pointer transition-colors ${isSelected ? 'bg-pink-50 border-pink-300 text-pink-800 font-medium' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
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
          <button onClick={onBack} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-all text-sm flex items-center gap-1 cursor-pointer">
            &larr; Quay lại
          </button>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-5 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-all text-sm cursor-pointer">
              Hủy
            </button>
            <button
              onClick={handleConfirmExport}
              disabled={selectedOrderExportColumns.length === 0}
              className="px-8 py-2.5 bg-pink-600 text-white font-bold rounded-lg hover:bg-pink-700 transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm cursor-pointer"
            >
              <Download size={18} /> Xác Nhận Xuất (.CSV)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};