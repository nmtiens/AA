import React from 'react';
import { Download, X, CalendarDays, Database, CheckSquare, Square } from 'lucide-react';
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
  displayCount?: number; // MỚI
}

// Mốc thời gian tồn kho (1 dòng = 1 ngày chụp tồn kho), dùng cho checklist.
export interface StockDateOption {
  date: string;   // giá trị gốc từ BE (dùng làm value khi lọc)
  count: number;
  value: number;
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

  // --- MỚI: dành riêng cho flow 'stock' ---
  // Danh sách các mốc thời gian tồn kho (ngày chụp) để người dùng chọn checklist.
  stockDates?: StockDateOption[];
  // Các mốc đang được chọn (giá trị = StockDateOption.date)
  selectedStockDates: string[];
  setSelectedStockDates: (dates: string[]) => void;
}

const formatDateFilters = (dates: string[], maxShow = 5) => {
  if (dates.length === 0) return 'Xuất theo ngày hiển thị hiện tại';
  if (dates.length <= maxShow) return `Đang áp dụng ngày: ${dates.join(', ')}`;
  const shown = dates.slice(0, maxShow).join(', ');
  return `Đang áp dụng ngày: ${shown} và ${dates.length - maxShow} ngày khác`;
};

// Format 1 giá trị ngày thô (ISO hoặc chuỗi từ BE) thành dd/mm/yyyy để hiển thị.
const formatDisplayDate = (raw: string): string => {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1)
    .toString()
    .padStart(2, '0')}/${d.getFullYear()}`;
};

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
  stockDates = [],
  selectedStockDates,
  setSelectedStockDates,
}: GenericExportScopeModalProps) => {
  if (!isOpen || !genericExportFlow) return null;

  const config = getExportFlowConfig(genericExportFlow);
  const isStockFlow = genericExportFlow === 'stock';

  // Với tồn kho: 'FILTERED' được tái dùng với ý nghĩa "theo mốc thời gian đã chọn",
  // 'ALL' giữ nguyên ý nghĩa "toàn bộ dữ liệu tồn kho, không lọc".
  const isStockByDatesMode = genericExportScope === 'FILTERED';
  const isStockAllMode = genericExportScope === 'ALL';

  const toggleStockDate = (dateVal: string) => {
    if (selectedStockDates.includes(dateVal)) {
      setSelectedStockDates(selectedStockDates.filter(d => d !== dateVal));
    } else {
      setSelectedStockDates([...selectedStockDates, dateVal]);
    }
  };

  const allStockDatesSelected = stockDates.length > 0 && selectedStockDates.length === stockDates.length;
  const toggleSelectAllStockDates = () => {
    setSelectedStockDates(allStockDatesSelected ? [] : stockDates.map(d => d.date));
  };

  const canContinue = isStockFlow
    ? (isStockAllMode || (isStockByDatesMode && selectedStockDates.length > 0))
    : true;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200 max-h-[90vh]">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-indigo-600 to-violet-600 shrink-0">
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

        <div className="p-6 bg-slate-50/50 flex flex-col gap-4 overflow-y-auto">
          <p className="text-sm font-semibold text-slate-700">Bạn muốn xuất dữ liệu theo tùy chọn nào?</p>

          {isStockFlow ? (
            // -----------------------------------------------------------------
            // GIAO DIỆN RIÊNG CHO TỒN KHO: 2 lựa chọn (theo mốc / toàn bộ)
            // Tồn kho là dữ liệu snapshot theo ngày chụp, không phải dòng phát
            // sinh theo ngày như các nguồn khác, nên không dùng "bộ lọc ngày"
            // hay "lũy kế tháng" của các nguồn kia.
            // -----------------------------------------------------------------
            <div className="flex flex-col gap-3">
              <div
                onClick={() => setGenericExportScope('FILTERED')}
                className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${isStockByDatesMode ? 'border-indigo-500 bg-indigo-50/70 shadow-sm ring-2 ring-indigo-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
              >
                <input type="radio" checked={isStockByDatesMode} onChange={() => setGenericExportScope('FILTERED')} className="mt-1 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      <CalendarDays size={14} className="text-indigo-500" />
                      Xuất theo mốc thời gian
                    </span>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 shrink-0 ml-2">
                      {selectedStockDates.length} mốc đã chọn
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Chọn 1 hoặc nhiều ngày chụp tồn kho bên dưới để xuất.
                  </p>

                  {isStockByDatesMode && (
                    <div className="mt-3 border border-slate-200 rounded-lg bg-white overflow-hidden">
                      <div className="flex justify-between items-center px-3 py-2 bg-slate-50 border-b border-slate-200">
                        <span className="text-[11px] font-bold text-slate-500 uppercase">
                          {stockDates.length} mốc khả dụng
                        </span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleSelectAllStockDates(); }}
                          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                        >
                          {allStockDatesSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                          {allStockDatesSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                        </button>
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                        {stockDates.length === 0 ? (
                          <div className="px-3 py-4 text-center text-xs text-slate-400">
                            Không có dữ liệu mốc thời gian tồn kho.
                          </div>
                        ) : (
                          stockDates.map((sd) => {
                            const checked = selectedStockDates.includes(sd.date);
                            return (
                              <label
                                key={sd.date}
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 cursor-pointer"
                              >
                                <span className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleStockDate(sd.date)}
                                    className="text-indigo-600 focus:ring-indigo-500 rounded cursor-pointer"
                                  />
                                  <span className="text-xs font-semibold text-slate-700">
                                    {formatDisplayDate(sd.date)}
                                  </span>
                                </span>
                                <span className="text-[11px] text-slate-400">
                                  {sd.count.toLocaleString('en-US')} mã
                                </span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div
                onClick={() => setGenericExportScope('ALL')}
                className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${isStockAllMode ? 'border-indigo-500 bg-indigo-50/70 shadow-sm ring-2 ring-indigo-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
              >
                <input type="radio" checked={isStockAllMode} onChange={() => setGenericExportScope('ALL')} className="mt-1 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      <Database size={14} className="text-slate-500" />
                      Xuất toàn bộ tồn kho
                    </span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 shrink-0 ml-2">
  {(config.displayCount ?? config.rawData.length).toLocaleString('en-US')} dòng
</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Bao gồm toàn bộ tất cả các mốc thời gian tồn kho trong hệ thống (không lọc).
                  </p>
                </div>
              </div>
            </div>
          ) : (
            // -----------------------------------------------------------------
            // GIAO DIỆN MẶC ĐỊNH (dùng cho tkbv / pthsp / inventory / export)
            // -----------------------------------------------------------------
            <div className="flex flex-col gap-3">
              <div
                onClick={() => setGenericExportScope('FILTERED')}
                className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${genericExportScope === 'FILTERED' ? 'border-indigo-500 bg-indigo-50/70 shadow-sm ring-2 ring-indigo-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
              >
                <input type="radio" checked={genericExportScope === 'FILTERED'} onChange={() => setGenericExportScope('FILTERED')} className="mt-1 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-800">Xuất theo bộ lọc ngày</span>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 shrink-0 ml-2">{config.filteredData.length.toLocaleString('en-US')} dòng</span>
                  </div>
                  <p
                    className="text-xs text-slate-500 mt-0.5 line-clamp-2 break-words"
                    title={overviewDateFilters.length > 0 ? overviewDateFilters.join(', ') : undefined}
                  >
                    {formatDateFilters(overviewDateFilters)}
                  </p>
                </div>
              </div>

              <div
                onClick={() => setGenericExportScope('MTD')}
                className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${genericExportScope === 'MTD' ? 'border-indigo-500 bg-indigo-50/70 shadow-sm ring-2 ring-indigo-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
              >
                <input type="radio" checked={genericExportScope === 'MTD'} onChange={() => setGenericExportScope('MTD')} className="mt-1 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-800">Xuất theo bộ lọc lũy kế tháng</span>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700 shrink-0 ml-2">{config.mtdData.length.toLocaleString('en-US')} dòng</span>
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
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-800">Xuất đầy đủ dữ liệu (Gốc)</span>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 shrink-0 ml-2">{config.rawData.length.toLocaleString('en-US')} dòng</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">Bao gồm toàn bộ tất cả các dòng dữ liệu trong hệ thống (không lọc).</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-5 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-all text-sm cursor-pointer">
            Hủy
          </button>
          <button
            onClick={onContinue}
            disabled={!canContinue}
            className={`px-6 py-2 font-bold rounded-lg transition-all shadow-md text-sm flex items-center gap-2 ${
              canContinue
                ? 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 cursor-pointer'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            Tiếp tục (Chọn cột) &rarr;
          </button>
        </div>
      </div>
    </div>
  );
};
