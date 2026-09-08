import React from 'react';
import { Download, X } from 'lucide-react';
import { ExportScope } from './OrderExportScopeModal';
import { ExportFlowType } from '../../types';
import { DataRow, ColumnDefinition } from '../../../../types';

interface ExportFlowConfig {
  title: string;
  rawData: DataRow[];
  filteredData: DataRow[];
  mtdData: DataRow[];
  columns: ColumnDefinition[];
  filePrefix: string;
  color: string;
}

interface GenericExportColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
  genericExportFlow: ExportFlowType | null;
  genericExportScope: ExportScope;
  getExportFlowConfig: (type: ExportFlowType) => ExportFlowConfig;
  genericExportSelectedColumns: string[];
  setGenericExportSelectedColumns: React.Dispatch<React.SetStateAction<string[]>>;
  onConfirmExport: () => void;
}

export const GenericExportColumnModal = ({
  isOpen,
  onClose,
  onBack,
  genericExportFlow,
  genericExportScope,
  getExportFlowConfig,
  genericExportSelectedColumns,
  setGenericExportSelectedColumns,
  onConfirmExport,
}: GenericExportColumnModalProps) => {
  if (!isOpen || !genericExportFlow) return null;

  const config = getExportFlowConfig(genericExportFlow);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-indigo-600 to-violet-600">
          <div className="flex items-center gap-3 text-white">
            <div className="p-2 bg-white/20 rounded-lg"><Download size={24} className="text-white" /></div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-white uppercase tracking-wider">Chọn Cột Xuất Dữ Liệu</h3>
                <span className="text-[10px] bg-white/20 text-white font-bold px-2 py-0.5 rounded-full border border-white/30">
                  {genericExportScope === 'FILTERED' ? 'Theo bộ lọc ngày' : genericExportScope === 'MTD' ? 'Lũy kế tháng' : 'Toàn bộ'}
                </span>
              </div>
              <p className="text-[10px] text-indigo-100 font-medium">Bước 2/2: {config.title} — chọn cột xuất ra file CSV</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-all text-white/90 hover:text-white cursor-pointer">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 custom-scrollbar">
          <div className="mb-4 flex gap-2 justify-between items-center">
            <div className="flex gap-2">
              <button onClick={() => setGenericExportSelectedColumns(config.columns.map(c => c.key))} className="px-3 py-1.5 text-xs font-semibold bg-slate-200 text-slate-700 hover:bg-slate-300 rounded transition-colors cursor-pointer">
                Chọn Tất Cả
              </button>
              <button onClick={() => setGenericExportSelectedColumns([])} className="px-3 py-1.5 text-xs font-semibold bg-slate-200 text-slate-700 hover:bg-slate-300 rounded transition-colors cursor-pointer">
                Bỏ Chọn Tất Cả
              </button>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Đã chọn: <b className="text-indigo-600">{genericExportSelectedColumns.length}</b>/{config.columns.length} cột
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {config.columns.map(col => {
              const isSelected = genericExportSelectedColumns.includes(col.key);
              return (
                <label
                  key={col.key}
                  className={`flex items-center gap-2 p-2 border rounded cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50 border-indigo-300 text-indigo-800 font-medium' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    checked={isSelected}
                    onChange={(e) => {
                      if (e.target.checked) setGenericExportSelectedColumns(prev => [...prev, col.key]);
                      else setGenericExportSelectedColumns(prev => prev.filter(k => k !== col.key));
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
              onClick={onConfirmExport}
              disabled={genericExportSelectedColumns.length === 0}
              className="px-8 py-2.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm cursor-pointer"
            >
              <Download size={18} /> Xác Nhận Xuất (.CSV)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};