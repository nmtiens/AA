import React, { useEffect, useRef, useState } from 'react';
import { Target, CheckCircle, Activity, XCircle, Eye, X } from 'lucide-react';
import { formatDecimal, formatNumber } from '../../utils/numberParsers';
import type { MetricType } from '../../types';

export interface CustomFunnelItem {
  id: string;
  name: string;
  value: number;
  color: string;
  percentage: number;
}

export interface PivotFunnelData {
  data: { name: string; value: number }[];
  total: number;
}

interface ContructionRevenueSectionProps {
  sectionRef: React.Ref<HTMLDivElement>;
  targetRevenue2026: number;
  factoryRevenueStats: { actual: number; percent: number; cancelled?: number };
  customFunnelData: CustomFunnelItem[];
  pivotFunnelData: PivotFunnelData | null;
  workshopMetric: MetricType;
  // Khi true (view Luồng đỏ / Căn mẫu), hiển thị giá trị funnel dưới dạng
  // "Triệu đồng" (số ngắn gọn) thay vì rút gọn "Tỷ". Dashboard tổng không
  // truyền prop này -> mặc định false -> giữ nguyên hành vi "Tỷ" như cũ.
  useDetailedNumbers?: boolean;
}

let _measureCanvas: HTMLCanvasElement | null = null;
function measureTextWidth(text: string, font: string): number {
  if (typeof document === 'undefined') return text.length * 7;
  if (!_measureCanvas) _measureCanvas = document.createElement('canvas');
  const ctx = _measureCanvas.getContext('2d');
  if (!ctx) return text.length * 7;
  ctx.font = font;
  return ctx.measureText(text).width;
}

const BAR_LABEL_FONT = 'bold 14px sans-serif';
const BAR_LABEL_HORIZONTAL_PADDING = 16;

export const ContructionRevenueSection = ({
  sectionRef,
  targetRevenue2026,
  factoryRevenueStats,
  customFunnelData,
  pivotFunnelData,
  workshopMetric,
  useDetailedNumbers = false,
}: ContructionRevenueSectionProps) => {
  const [isFunnelPivotModalOpen, setIsFunnelPivotModalOpen] = useState(false);

  const funnelBarsRef = useRef<HTMLDivElement>(null);
  const [funnelBarsWidth, setFunnelBarsWidth] = useState(0);

  useEffect(() => {
    const el = funnelBarsRef.current;
    if (!el) return;
    setFunnelBarsWidth(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setFunnelBarsWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cancelledValue = factoryRevenueStats.cancelled ?? 0;

  // ✅ SỬA: nhánh useDetailedNumbers giờ hiển thị "Triệu" thay vì "VNĐ" đầy
  // đủ. `value` từ pivotFunnelData/customFunnelData đã ở đơn vị TRIỆU ĐỒNG
  // sẵn (từ usePivotTables/calculateMetricValue lấy thẳng valueKey/realValueKey
  // không qua quy đổi nào) -> hiển thị thẳng value, KHÔNG nhân 1_000_000 nữa.
  const formatFunnelValue = (value: number): string => {
    if (workshopMetric === 'COUNT_HEX') {
      return formatNumber(value, workshopMetric);
    }
    if (useDetailedNumbers) {
      return `${value.toLocaleString('en-US', { maximumFractionDigits: 6 })} Triệu`;
    }
    return `${(value / 1000).toLocaleString('en-US', { maximumFractionDigits: 6 })} Tỷ`;
  };

const formatBarLabel = (value: number): string => {
    if (workshopMetric === 'COUNT_HEX') {
      return formatNumber(value, workshopMetric);
    }
    if (useDetailedNumbers) {
      return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
    }
    return `${(value / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} Tỷ`;
  };

  const getMinWidthPercentForText = (text: string): number => {
    if (!funnelBarsWidth) return 0;
    const textPx = measureTextWidth(text, BAR_LABEL_FONT) + BAR_LABEL_HORIZONTAL_PADDING;
    return (textPx / funnelBarsWidth) * 100;
  };

  return (
    <>
      <div ref={sectionRef} className="scroll-mt-24 w-full bg-white p-5 rounded-xl shadow-sm border border-emerald-100 flex flex-col">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-emerald-50 pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600">
              <Target size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">TỔNG QUAN DOANH SỐ CÔNG TRÌNH LUỒNG ĐỎ (Năm 2026)</h3>
              <p className="text-xs text-slate-500">Tiến độ thực hiện (Nhập kho) so với chỉ tiêu kế hoạch</p>
            </div>
          </div>
        </div>

        {/* ===== HÀNG TRÊN: 4 CARD (Kế hoạch, Nhập kho, Tỷ lệ đạt, Hủy) ===== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-3 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg border border-emerald-100 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-shadow min-h-[110px]">
            <div className="flex items-center gap-1.5 mb-0.5 z-10">
              <div className="p-1 bg-emerald-100 rounded text-emerald-600 shadow-sm"><Target size={18} /></div>
              <p className="text-xs font-bold text-emerald-800 opacity-80 uppercase tracking-wide">Kế hoạch</p>
            </div>
            <div className="z-10 flex items-baseline gap-1 pl-0.5">
              <h4 className="text-3xl font-extrabold text-emerald-600 tracking-tight">{formatDecimal(cancelledValue)}</h4>
              <span className="text-xs font-medium text-emerald-500">Tỷ</span>
            </div>
          </div>

          <div className="p-3 bg-gradient-to-br from-blue-50 to-sky-50 rounded-lg border border-blue-100 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-shadow min-h-[110px]">
            <div className="flex items-center gap-1.5 mb-0.5 z-10">
              <div className="p-1 bg-blue-100 rounded text-blue-600 shadow-sm"><CheckCircle size={18} /></div>
              <p className="text-xs font-bold text-blue-800 opacity-80 uppercase tracking-wide">Nhập kho</p>
            </div>
            <div className="z-10 flex items-baseline gap-1 pl-0.5">
              <h4 className="text-3xl font-extrabold text-blue-600 tracking-tight">{formatDecimal(cancelledValue)}</h4>
              <span className="text-xs font-medium text-blue-500">Tỷ</span>
            </div>
          </div>

          <div className="p-3 bg-gradient-to-br from-violet-50 to-fuchsia-50 rounded-lg border border-violet-100 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-shadow min-h-[110px]">
            <div className="flex items-center gap-1.5 mb-0.5 z-10">
              <div className="p-1 bg-violet-100 rounded text-violet-600 shadow-sm"><Activity size={18} /></div>
              <p className="text-xs font-bold text-violet-800 opacity-80 uppercase tracking-wide">Tỷ lệ Đạt</p>
            </div>
            <div className="z-10 flex items-baseline gap-1 pl-0.5">
              <h4 className={`text-3xl font-extrabold tracking-tight ${factoryRevenueStats.percent >= 100 ? 'text-emerald-600' : factoryRevenueStats.percent >= 80 ? 'text-violet-600' : 'text-amber-600'}`}>
              {formatDecimal(cancelledValue)}%
              </h4>
            </div>
          </div>

          <div className="p-3 bg-gradient-to-br from-rose-50 to-red-50 rounded-lg border border-rose-100 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-shadow min-h-[110px]">
            <div className="flex items-center gap-1.5 mb-0.5 z-10">
              <div className="p-1 bg-rose-100 rounded text-rose-600 shadow-sm"><XCircle size={18} /></div>
              <p className="text-xs font-bold text-rose-800 opacity-80 uppercase tracking-wide">Hủy</p>
            </div>
            <div className="z-10 flex items-baseline gap-1 pl-0.5">
              <h4 className="text-3xl font-extrabold text-rose-600 tracking-tight">{formatDecimal(cancelledValue)}</h4>
              <span className="text-xs font-medium text-rose-500">Tỷ</span>
            </div>
          </div>
        </div>

        {/* ===== HÀNG DƯỚI: FUNNEL TÌNH TRẠNG ĐƠN HÀNG AATN (full width) ===== */}
                  {/* ===== HÀNG DƯỚI: FUNNEL TÌNH TRẠNG ĐƠN HÀNG AATN (full width) ===== */}
        <div className="mt-6 w-full flex flex-col bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
          <div className="flex justify-end mb-2">
            <button
              onClick={() => setIsFunnelPivotModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 font-medium text-xs border border-slate-200 transition-colors"
              title="Xem bảng chi tiết"
            >
              <Eye size={14} /> Chi tiết
            </button>
          </div>

          {/* ✅ SỬA: thêm relative để label định vị absolute bên trong khung này */}
          <div className="w-full flex-1 flex flex-col bg-slate-50/50 p-6 rounded-xl border border-slate-200 relative">
            {/* ✅ MỚI: label ghi chú đơn vị, nằm TRONG khung viền, góc trên bên
                phải — chỉ hiện ở view Luồng đỏ/Căn mẫu (useDetailedNumbers=true) */}
            {useDetailedNumbers && workshopMetric !== 'COUNT_HEX' && (
              <span className="absolute top-3 right-4 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                Đơn vị: Triệu đồng
              </span>
            )}

            <h3 className="font-serif text-xl md:text-2xl font-bold uppercase text-center mb-8 text-slate-800 tracking-wide">
              TÌNH TRẠNG ĐƠN HÀNG AATN
            </h3>
            {/* ... phần còn lại (flex flex-row gap-[30px] w-full max-w-6xl...) giữ nguyên như trước ... */}

            <div className="flex flex-row gap-[30px] w-full max-w-6xl mx-auto relative mt-2">
              <div className="w-auto shrink-0 flex flex-col gap-3">
                {customFunnelData.map((item) => (
                  <div
                    key={`lbl-${item.id}`}
                    className="h-10 text-right font-semibold text-slate-700 text-sm flex items-center justify-end whitespace-nowrap"
                  >
                    {item.name}
                  </div>
                ))}
              </div>

              <div ref={funnelBarsRef} className="flex-1 relative flex flex-col gap-3 min-w-0">
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

             {customFunnelData.map((item) => {
  const barLabel = formatBarLabel(item.value);
  const tooltipValue = formatFunnelValue(item.value);
  const baseWidthPercent = item.value === 0 ? 6 : item.percentage;
  const minWidthPercent = getMinWidthPercentForText(barLabel);
  const widthPercent = Math.min(100, Math.max(baseWidthPercent, minWidthPercent));

  return (
    <div key={`bar-${item.id}`} className="h-10 flex justify-center w-full relative z-20">
      <div
        className="h-full flex items-center justify-center rounded-sm transition-all duration-500 shadow-sm"
        style={{ width: `${widthPercent}%`, backgroundColor: item.color }}
        title={`${item.name}: ${tooltipValue}`}
      >
        <span className="text-black font-bold text-sm whitespace-nowrap px-1">
          {barLabel}
        </span>
      </div>
    </div>
  );
})}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Funnel Pivot Detail Modal */}
      {isFunnelPivotModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
          onClick={() => setIsFunnelPivotModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 sm:p-6 border-b border-slate-100 bg-slate-50/50">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Chi tiết dữ liệu Phễu</h2>
                <p className="text-xs text-slate-500 mt-1">Phân tích giá trị theo BOP</p>
              </div>
              <button
                onClick={() => setIsFunnelPivotModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
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
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold">
                              {index + 1}
                            </span>
                            <span className="truncate max-w-[200px]" title={item.name}>{item.name}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-800">
                            {formatFunnelValue(item.value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-wood-100 font-bold text-slate-800 border-t border-wood-300">
                      <tr>
                        <td className="px-4 py-3 text-left uppercase text-slate-700">Tổng Cộng</td>
                        <td className="px-4 py-3 text-right text-slate-800 text-base">
                          {formatFunnelValue(pivotFunnelData.total)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
                  Không có dữ liệu để hiển thị.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};