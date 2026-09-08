import React from 'react';
import { Download, X } from 'lucide-react';
import { DataRow, ColumnDefinition } from '../../../../types';
import { exportToExcel } from '../../../../services/dataService';

interface ProductionExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  productionColumns: ColumnDefinition[];
  selectedExportColumns: string[];
  setSelectedExportColumns: React.Dispatch<React.SetStateAction<string[]>>;
  filteredProductionData: DataRow[];
}

export const ProductionExportModal = ({
  isOpen,
  onClose,
  productionColumns,
  selectedExportColumns,
  setSelectedExportColumns,
  filteredProductionData,
}: ProductionExportModalProps) => {
  if (!isOpen) return null;

  const handleConfirmExport = () => {
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
    onClose();
  };

  return (
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
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-all text-white/90 hover:text-white">
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
                <label
                  key={col.key}
                  className={`flex items-center gap-2 p-2 border rounded cursor-pointer transition-colors ${isSelected ? 'bg-wood-50 border-wood-300 text-wood-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
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
          <button onClick={onClose} className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-all">
            Hủy
          </button>
          <button
            onClick={handleConfirmExport}
            disabled={selectedExportColumns.length === 0}
            className="px-8 py-2.5 bg-wood-600 text-white font-bold rounded-lg hover:bg-wood-700 transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Download size={18} /> Xác Nhận Xuất
          </button>
        </div>
      </div>
    </div>
  );
};