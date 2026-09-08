import React from 'react';
import { Download, X } from 'lucide-react';
import { DataRow, ColumnDefinition } from '../../../../types';
import { ExportScope } from './OrderExportScopeModal';
import { ExportFlowType } from '../../types';

interface ExportFlowConfig {
  title: string;
  rawData: DataRow[];
  filteredData: DataRow[];
  mtdData: DataRow[];
  columns: ColumnDefinition[];
  filePrefix: string;
  color: string;
}

interface GenericExportScopeModalProps {
  isOpen: boolean;
  onClose: () => void;
  genericExportFlow: ExportFlowType | null;
  genericExportScope: ExportScope;
  setGenericExportScope: (scope: ExportScope) => void;
  getExportFlowConfig: (type: ExportFlowType) => ExportFlowConfig;
  overviewDateFilters: string[];
  latestUnifiedDate: Date | null;
  onContinue: () => void;
}

export const GenericExportScopeModal = ({
  isOpen,
  onClose,
  genericExportFlow,
  genericExportScope,
  setGenericExportScope,
  getExportFlowConfig,
  overviewDateFilters,
  latestUnifiedDate,
  onContinue,
}: GenericExportScopeModalProps) => {
  if (!isOpen || !genericExportFlow) return null;

  const config = getExportFlowConfig(genericExportFlow);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-indigo-600 to-violet-600">
          <div className="flex items-center gap-3 text-white">
            <div className="p-2 bg-white/20 rounded-lg"><Download size={22} className="text-white" /></div>
            <div>
              <h3 className="text-lg font-bold text-white uppercase tracking-wider">Tùy Chọn Phạm Vi Xuất</h3>
              <p className="text-[10px] text-indigo-100 font-medium">Bước 1/2: {config.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-full transition-all text-white/90 hover:text-white cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 bg-slate-50/50 flex flex-col gap-4">
          <p className="text-sm font-semibold text-slate-700">Bạn muốn xuất dữ liệu theo tùy chọn nào?</p>
          <div className="flex flex-col gap-3">
            <div
              onClick={() => setGenericExportScope('FILTERED')}
              className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${genericExportScope === 'FILTERED' ? 'border-indigo-500 bg-indigo-50/70 shadow-sm ring-2 ring-indigo-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <input type="radio" checked={genericExportScope === 'FILTERED'} onChange={() => setGenericExportScope('FILTERED')} className="mt-1 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-800">Xuất theo bộ lọc ngày</span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{config.filteredData.length.toLocaleString('en-US')} dòng</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {overviewDateFilters.length > 0 ? `Đang áp dụng ngày: ${overviewDateFilters.join(', ')}` : 'Xuất theo ngày hiển thị hiện tại'}
                </p>
              </div>
            </div>

            <div
              onClick={() => setGenericExportScope('MTD')}
              className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${genericExportScope === 'MTD' ? 'border-indigo-500 bg-indigo-50/70 shadow-sm ring-2 ring-indigo-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <input type="radio" checked={genericExportScope === 'MTD'} onChange={() => setGenericExportScope('MTD')} className="mt-1 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-800">Xuất theo bộ lọc lũy kế tháng</span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700">{config.mtdData.length.toLocaleString('en-US')} dòng</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Lũy kế tháng {latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''} (từ đầu tháng đến ngày lọc {latestUnifiedDate ? `${latestUnifiedDate.getDate()}/${latestUnifiedDate.getMonth() + 1}` : ''})
                </p>
              </div>
            </div>

            <div
              onClick={() => setGenericExportScope('ALL')}
              className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${genericExportScope === 'ALL' ? 'border-indigo-500 bg-indigo-50/70 shadow-sm ring-2 ring-indigo-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <input type="radio" checked={genericExportScope === 'ALL'} onChange={() => setGenericExportScope('ALL')} className="mt-1 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-800">Xuất đầy đủ dữ liệu (Gốc)</span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">{config.rawData.length.toLocaleString('en-US')} dòng</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Bao gồm toàn bộ tất cả các dòng dữ liệu trong hệ thống (không lọc).</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-white flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-all text-sm cursor-pointer">
            Hủy
          </button>
          <button onClick={onContinue} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-all shadow-md active:scale-95 text-sm flex items-center gap-2 cursor-pointer">
            Tiếp tục (Chọn cột) &rarr;
          </button>
        </div>
      </div>
    </div>
  );
};