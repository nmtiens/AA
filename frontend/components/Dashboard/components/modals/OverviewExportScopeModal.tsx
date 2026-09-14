import React, { useState, useMemo } from 'react';
import { Download, X, Loader2 } from 'lucide-react';
import { ExportScope } from './OrderExportScopeModal';

interface OverviewExportScopeModalProps {
  isOpen: boolean;
  onClose: () => void;
  overviewExportScope: ExportScope;
  setOverviewExportScope: (scope: ExportScope) => void;
  overviewDateFilters: string[];
  latestUnifiedDate: Date | null;
  onConfirm: () => void | Promise<void>;
  // MỚI: chọn tháng cho scope MTD
  selectedExportMonth: string; // "YYYY-MM"
  setSelectedExportMonth: (month: string) => void;
}

const formatDateFilters = (dates: string[], maxShow = 5) => {
  if (dates.length === 0) return 'Xuất theo ngày hiển thị hiện tại';
  if (dates.length <= maxShow) return `Đang áp dụng ngày: ${dates.join(', ')}`;
  const shown = dates.slice(0, maxShow).join(', ');
  return `Đang áp dụng ngày: ${shown} và ${dates.length - maxShow} ngày khác`;
};

// Sinh danh sách 24 tháng gần nhất (tính từ latestUnifiedDate hoặc hôm nay) để chọn.
const buildMonthOptions = (refDate: Date | null, count = 24) => {
  const base = refDate ?? new Date();
  const options: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
    options.push({ value, label });
  }
  return options;
};

export const OverviewExportScopeModal = ({
  isOpen,
  onClose,
  overviewExportScope,
  setOverviewExportScope,
  overviewDateFilters,
  latestUnifiedDate,
  onConfirm,
  selectedExportMonth,
  setSelectedExportMonth,
}: OverviewExportScopeModalProps) => {
  const [isExporting, setIsExporting] = useState(false);

  const monthOptions = useMemo(() => buildMonthOptions(latestUnifiedDate), [latestUnifiedDate]);

  if (!isOpen) return null;

  const handleConfirmClick = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await onConfirm();
    } finally {
      setIsExporting(false);
    }
  };

  const selectedMonthLabel = monthOptions.find(m => m.value === selectedExportMonth)?.label
    ?? selectedExportMonth;

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
          <button
            onClick={onClose}
            disabled={isExporting}
            className="p-1.5 hover:bg-white/20 rounded-full transition-all text-white/90 hover:text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 bg-slate-50/50 flex flex-col gap-4 overflow-y-auto">
          <p className="text-sm font-semibold text-slate-700">Bạn muốn xuất báo cáo tổng hợp theo tùy chọn nào?</p>
          <div className="flex flex-col gap-3">
            <div
              onClick={() => !isExporting && setOverviewExportScope('FILTERED')}
              className={`p-3.5 rounded-xl border-2 transition-all flex items-start gap-3 ${isExporting ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${overviewExportScope === 'FILTERED' ? 'border-emerald-500 bg-emerald-50/70 shadow-sm ring-2 ring-emerald-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <input type="radio" checked={overviewExportScope === 'FILTERED'} disabled={isExporting} onChange={() => setOverviewExportScope('FILTERED')} className="mt-1 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
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
              onClick={() => !isExporting && setOverviewExportScope('MTD')}
              className={`p-3.5 rounded-xl border-2 transition-all flex items-start gap-3 ${isExporting ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${overviewExportScope === 'MTD' ? 'border-emerald-500 bg-emerald-50/70 shadow-sm ring-2 ring-emerald-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <input type="radio" checked={overviewExportScope === 'MTD'} disabled={isExporting} onChange={() => setOverviewExportScope('MTD')} className="mt-1 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-800">Xuất theo bộ lọc lũy kế tháng</span>
                  {overviewExportScope === 'MTD' && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0 ml-2">
                      {selectedMonthLabel}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chọn 1 tháng bất kỳ để xuất lũy kế cả tháng đó.
                </p>

                {overviewExportScope === 'MTD' && (
                  <select
                    value={selectedExportMonth}
                    disabled={isExporting}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setSelectedExportMonth(e.target.value)}
                    className="mt-2 w-full text-sm font-semibold text-slate-700 border border-slate-300 rounded-lg px-3 py-2 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {monthOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div
              onClick={() => !isExporting && setOverviewExportScope('ALL')}
              className={`p-3.5 rounded-xl border-2 transition-all flex items-start gap-3 ${isExporting ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${overviewExportScope === 'ALL' ? 'border-emerald-500 bg-emerald-50/70 shadow-sm ring-2 ring-emerald-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <input type="radio" checked={overviewExportScope === 'ALL'} disabled={isExporting} onChange={() => setOverviewExportScope('ALL')} className="mt-1 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-bold text-slate-800">Xuất đầy đủ dữ liệu (Gốc)</span>
                <p className="text-xs text-slate-500 mt-0.5">Tổng hợp toàn bộ dữ liệu của cả 6 nguồn, không lọc.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            disabled={isExporting}
            className="px-5 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-all text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Hủy
          </button>
          <button
            onClick={handleConfirmClick}
            disabled={isExporting}
            className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-all shadow-md active:scale-95 text-sm flex items-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            {isExporting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Đang xuất...
              </>
            ) : (
              <>
                <Download size={16} /> Xác Nhận Xuất (.ZIP - 6 files)
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};