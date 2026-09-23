import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, Activity, XCircle, Eye, X } from 'lucide-react';
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
  useDetailedNumbers?: boolean;
  // MỚI: báo lên cha khi user bấm vào 1 thanh funnel, để cha đổi
  // pivotFunnelData sang breakdown theo công trình của đúng bước đó.
  onFunnelItemClick?: (item: CustomFunnelItem) => void;
  // MỚI: báo lên cha khi đóng modal, để cha reset lại pivotFunnelData
  // về dữ liệu tổng (theo BOP) cho lần mở "Chi tiết" chung kế tiếp.
  onFunnelModalClose?: () => void;
  // MỚI: báo lên cha khi user bấm vào 1 con SỐ trong bảng pivot (Công trình/BOP),
  // để cha mở tiếp modal chi tiết lớp sau (vd. theo Hex). name=null khi bấm ở
  // dòng TỔNG CỘNG (xem tất cả các dòng trong bảng pivot hiện tại).
  onPivotValueClick?: (name: string | null, item: CustomFunnelItem | null) => void;
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
  onFunnelItemClick,
  onFunnelModalClose,
  onPivotValueClick,
}: ContructionRevenueSectionProps) => {
  const [isFunnelPivotModalOpen, setIsFunnelPivotModalOpen] = useState(false);
  const [selectedFunnelItem, setSelectedFunnelItem] = useState<CustomFunnelItem | null>(null);

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

  

  const formatRoundedNumber = (value: number): string => {
    const absValue = Math.abs(value);
    if (absValue > 0 && absValue < 1) {
      return value.toLocaleString('en-US', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
    }
    return Math.round(value).toLocaleString('en-US');
  };

  const formatFunnelValue = (value: number): string => {
    if (workshopMetric === 'COUNT_HEX') {
      return formatNumber(value, workshopMetric);
    }
    if (useDetailedNumbers) {
      return formatRoundedNumber(value);
    }
    return `${formatRoundedNumber(value / 1000)} Tỷ`;
  };

const formatBarLabel = (value: number): string => {
  if (workshopMetric === 'COUNT_HEX') {
    return formatNumber(value, workshopMetric);
  }
  const displayValue = useDetailedNumbers ? value : value / 1000;
  const rounded = formatRoundedNumber(displayValue);
  return useDetailedNumbers ? rounded : `${rounded} Tỷ`;
};

  const handleOpenOverallDetail = () => {
    setSelectedFunnelItem(null); // null = xem tổng theo BOP, giữ hành vi cũ
    setIsFunnelPivotModalOpen(true);
  };

  const handleBarClick = (item: CustomFunnelItem) => {
    setSelectedFunnelItem(item);
    onFunnelItemClick?.(item); // báo cha đổi pivotFunnelData sang breakdown theo công trình của bước này
    setIsFunnelPivotModalOpen(true);
  };

  const closeModal = () => {
    setIsFunnelPivotModalOpen(false);
    setSelectedFunnelItem(null);
    onFunnelModalClose?.(); // báo cha reset về dữ liệu tổng
  };

  const getMinWidthPercentForText = (text: string): number => {
    if (!funnelBarsWidth) return 0;
    const textPx = measureTextWidth(text, BAR_LABEL_FONT) + BAR_LABEL_HORIZONTAL_PADDING;
    return (textPx / funnelBarsWidth) * 100;
  };

  // Ô số trong bảng pivot: nếu cha có truyền onPivotValueClick thì hiển thị
  // dạng nút bấm được (giống style ở OnLineStageDetailModal / HexDetailModal),
  // ngược lại giữ nguyên text tĩnh như cũ.
  const renderPivotValue = (value: number, name: string | null) => {
    const text = formatFunnelValue(value);
    if (!onPivotValueClick) return text;
    if (value === 0) return <span className="text-slate-300">{text}</span>;
    return (
      <button
        type="button"
        onClick={() => onPivotValueClick(name, selectedFunnelItem)}
        className="text-slate-800 hover:text-emerald-700 hover:underline font-semibold"
        title="Bấm để xem chi tiết"
      >
        {text}
      </button>
    );
  };

  return (
    <>
      <div ref={sectionRef} className="scroll-mt-24 w-full bg-white p-5 rounded-xl shadow-sm border border-emerald-100 flex flex-col">
        <div className="relative w-full flex-1 flex flex-col bg-slate-50/50 p-6 rounded-xl border border-slate-200">
          <button
            onClick={handleOpenOverallDetail}
            className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-600 rounded-lg hover:bg-slate-100 font-medium text-xs border border-slate-200 transition-colors"
            title="Xem bảng chi tiết"
          >
            <Eye size={14} /> Chi tiết
          </button>

          {useDetailedNumbers && workshopMetric !== 'COUNT_HEX' && (
            <span className="absolute top-4 left-6 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              Đơn vị: Triệu đồng
            </span>
          )}

          <h3 className="font-serif text-xl md:text-2xl font-bold uppercase text-center mb-8 text-slate-800 tracking-wide">
            TÌNH TRẠNG ĐƠN HÀNG AATN
          </h3>

          <div className="flex flex-row gap-[30px] w-full max-w-6xl mx-auto relative">
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
                        onClick={() => handleBarClick(item)}
                        className="h-full flex items-center justify-center rounded-sm transition-all duration-500 shadow-sm cursor-pointer hover:brightness-95 hover:ring-2 hover:ring-offset-1 hover:ring-slate-300"
                        style={{ width: `${widthPercent}%`, backgroundColor: item.color }}
                        title={`${item.name}: ${tooltipValue} (bấm để xem chi tiết theo công trình)`}
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

      {/* Funnel Pivot Detail Modal */}
      {isFunnelPivotModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start gap-4 p-4 sm:p-6 border-b border-slate-100 bg-slate-50/50">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-800 truncate">
                  Chi tiết dữ liệu Phễu{selectedFunnelItem ? ` — ${selectedFunnelItem.name}` : ''}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {selectedFunnelItem ? 'Phân tích giá trị theo Công trình' : 'Phân tích giá trị theo BOP'}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {useDetailedNumbers && workshopMetric !== 'COUNT_HEX' && (
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                    Đơn vị: Triệu đồng
                  </span>
                )}
                <button
                  onClick={closeModal}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto">
              {pivotFunnelData && pivotFunnelData.data && pivotFunnelData.data.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 border-b border-slate-200 text-left font-bold text-slate-700 w-1/2">
                          {selectedFunnelItem ? 'Công trình' : 'BOP'}
                        </th>
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
                         <span className="break-words">{item.name}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-800">
                            {renderPivotValue(item.value, item.name)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-wood-100 font-bold text-slate-800 border-t border-wood-300">
                      <tr>
                        <td className="px-4 py-3 text-left uppercase text-slate-700">Tổng Cộng</td>
                        <td className="px-4 py-3 text-right text-slate-800 text-base">
                          {renderPivotValue(pivotFunnelData.total, null)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
                  {selectedFunnelItem
                    ? `Không có dữ liệu chi tiết theo công trình cho ${selectedFunnelItem.name}.`
                    : 'Không có dữ liệu để hiển thị.'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};