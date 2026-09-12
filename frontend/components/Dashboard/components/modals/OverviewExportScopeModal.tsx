import React from 'react';
import { Download, X } from 'lucide-react';
import { ExportScope } from './OrderExportScopeModal';

interface OverviewExportScopeModalProps {
  isOpen: boolean;
  onClose: () => void;
  overviewExportScope: ExportScope;
  setOverviewExportScope: (scope: ExportScope) => void;
  overviewDateFilters: string[];
  latestUnifiedDate: Date | null;
  onConfirm: () => void;
}

const formatDateFilters = (dates: string[], maxShow = 5) => {
  if (dates.length === 0) return 'Xuất theo ngày hiển thị hiện tại';
  if (dates.length <= maxShow) return `Đang áp dụng ngày: ${dates.join(', ')}`;
  const shown = dates.slice(0, maxShow).join(', ');
  return `Đang áp dụng ngày: ${shown} và ${dates.length - maxShow} ngày khác`;
};

export const OverviewExportScopeModal = ({
  isOpen,
  onClose,
  overviewExportScope,
  setOverviewExportScope,
  overviewDateFilters,
  latestUnifiedDate,
  onConfirm,
}: OverviewExportScopeModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200 max-h-[90vh]">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-emerald-600 to-teal-600 shrink-0">
          <div className="flex items-center gap-3 text-white">
            <div className="p-2 bg-white/20 rounded-lg"><Download size={22} className="text-white" /></div>
            <div>
              <h3 className="text-lg font-bold text-white uppercase tracking-wider">Tùy Chọn Phạm Vi Xuất</h3>
              <p className="text-[10px] text-emerald-100 font-medium">Báo cáo tổng hợp 6 chỉ số</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-full transition-all text-white/90 hover:text-white cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 bg-slate-50/50 flex flex-col gap-4 overflow-y-auto">
          <p className="text-sm font-semibold text-slate-700">Bạn muốn xuất báo cáo tổng hợp theo tùy chọn nào?</p>
          <div className="flex flex-col gap-3">
            <div
              onClick={() => setOverviewExportScope('FILTERED')}
              className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${overviewExportScope === 'FILTERED' ? 'border-emerald-500 bg-emerald-50/70 shadow-sm ring-2 ring-emerald-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <input type="radio" checked={overviewExportScope === 'FILTERED'} onChange={() => setOverviewExportScope('FILTERED')} className="mt-1 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-bold text-slate-800">Xuất theo bộ lọc ngày</span>
                <p
                  className="text-xs text-slate-500 mt-0.5 line-clamp-2 break-words"
                  title={overviewDateFilters.length > 0 ? overviewDateFilters.join(', ') : undefined}
                >
                  {formatDateFilters(overviewDateFilters)}
                </p>
              </div>
            </div>

            <div
              onClick={() => setOverviewExportScope('MTD')}
              className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${overviewExportScope === 'MTD' ? 'border-emerald-500 bg-emerald-50/70 shadow-sm ring-2 ring-emerald-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <input type="radio" checked={overviewExportScope === 'MTD'} onChange={() => setOverviewExportScope('MTD')} className="mt-1 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-bold text-slate-800">Xuất theo bộ lọc lũy kế tháng</span>
                <p className="text-xs text-slate-500 mt-0.5">
                  Lũy kế tháng {latestUnifiedDate ? `${latestUnifiedDate.getMonth() + 1}/${latestUnifiedDate.getFullYear()}` : ''}
                </p>
              </div>
            </div>

            <div
              onClick={() => setOverviewExportScope('ALL')}
              className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${overviewExportScope === 'ALL' ? 'border-emerald-500 bg-emerald-50/70 shadow-sm ring-2 ring-emerald-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <input type="radio" checked={overviewExportScope === 'ALL'} onChange={() => setOverviewExportScope('ALL')} className="mt-1 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-bold text-slate-800">Xuất đầy đủ dữ liệu (Gốc)</span>
                <p className="text-xs text-slate-500 mt-0.5">Tổng hợp toàn bộ dữ liệu của cả 6 nguồn, không lọc.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-5 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-all text-sm cursor-pointer">
            Hủy
          </button>
          <button
            onClick={onConfirm}
            className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-all shadow-md active:scale-95 text-sm flex items-center gap-2 cursor-pointer"
          >
            <Download size={16} /> Xác Nhận Xuất (.ZIP - 6 files)
          </button>
        </div>
      </div>
    </div>
  );
};
