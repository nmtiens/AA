import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, LabelList, ReferenceLine, Label,
} from 'recharts';
import { Target, CheckCircle, Activity, Eye, X } from 'lucide-react';
import { CheckpointTriangle } from '../shared/CheckpointTriangle';
import { formatDecimal, formatNumber } from '../../utils/numberParsers';
import type { MetricType } from '../../types';

const QUARTER_COLOR = '#ef4444';

interface FactoryRevenueChartRow {
  name: string;
  thucHien: number;
  conLai: number;
  fullTarget: number;
}

interface QuarterlyTargets {
  q1: number;
  q2: number;
  q3: number;
  q4: number;
}

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

interface FactoryRevenueSectionProps {
  sectionRef: React.Ref<HTMLDivElement>;
  factoryRevenueChartData: FactoryRevenueChartRow[];
  quarterlyTargets: QuarterlyTargets;
  targetRevenue2026: number;
  factoryRevenueStats: { actual: number; percent: number };
  customFunnelData: CustomFunnelItem[];
  pivotFunnelData: PivotFunnelData | null;
  workshopMetric: MetricType;
}

// ---- Helpers đo & xếp hàng nhãn quý (giữ nguyên như cũ) ----
let _measureCanvas: HTMLCanvasElement | null = null;
function measureTextWidth(text: string, font: string): number {
  if (typeof document === 'undefined') return text.length * 7;
  if (!_measureCanvas) _measureCanvas = document.createElement('canvas');
  const ctx = _measureCanvas.getContext('2d');
  if (!ctx) return text.length * 7;
  ctx.font = font;
  return ctx.measureText(text).width;
}

const QUARTER_CHART_MARGIN_LEFT = 30;
const QUARTER_CHART_MARGIN_RIGHT = 30;
const QUARTER_LABEL_GAP = 10;
const QUARTER_LABEL_ROW_HEIGHT = 14;
const QUARTER_LABEL_BASE_DY = 20;
const QUARTER_LABEL_FONT = 'bold 12px sans-serif';

interface QuarterDef {
  key: 'q1' | 'q2' | 'q3' | 'q4';
  value: number;
  label: string;
}

export const FactoryRevenueSection = ({
  sectionRef,
  factoryRevenueChartData,
  quarterlyTargets,
  targetRevenue2026,
  factoryRevenueStats,
  customFunnelData,
  pivotFunnelData,
  workshopMetric,
}: FactoryRevenueSectionProps) => {
  const [isFunnelPivotModalOpen, setIsFunnelPivotModalOpen] = useState(false);

  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);

  useEffect(() => {
    const el = chartWrapperRef.current;
    if (!el) return;
    setChartWidth(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setChartWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const domainMax = useMemo(() => {
    const maxStack = factoryRevenueChartData.reduce(
      (max, row) => Math.max(max, (row.thucHien || 0) + (row.conLai || 0)),
      0
    );
    return maxStack > 0 ? maxStack * 1.05 : 1;
  }, [factoryRevenueChartData]);

  const quarterDefs: QuarterDef[] = useMemo(() => (
    [
      { key: 'q1', value: quarterlyTargets.q1, label: `Quí I: ${formatDecimal(quarterlyTargets.q1)}` },
      { key: 'q2', value: quarterlyTargets.q2, label: `Quí II: ${formatDecimal(quarterlyTargets.q2)}` },
      { key: 'q3', value: quarterlyTargets.q3, label: `Quí III: ${formatDecimal(quarterlyTargets.q3)}` },
      { key: 'q4', value: quarterlyTargets.q4, label: `Quí IV: ${formatDecimal(quarterlyTargets.q4)}` },
    ] as QuarterDef[]
  ).filter((q) => q.value > 0), [quarterlyTargets]);

  const quarterRows = useMemo(() => {
    const rows: Partial<Record<QuarterDef['key'], number>> = {};
    if (!chartWidth || quarterDefs.length === 0) {
      quarterDefs.forEach((q) => { rows[q.key] = 0; });
      return rows;
    }
    const plotWidth = Math.max(chartWidth - QUARTER_CHART_MARGIN_LEFT - QUARTER_CHART_MARGIN_RIGHT, 0);
    const items = quarterDefs
      .map((q) => {
        const x = QUARTER_CHART_MARGIN_LEFT + (q.value / domainMax) * plotWidth;
        const textWidth = measureTextWidth(q.label, QUARTER_LABEL_FONT);
        return { key: q.key, left: x - textWidth / 2, right: x + textWidth / 2 };
      })
      .sort((a, b) => a.left - b.left);
    const rowRightEdge: number[] = [];
    items.forEach((item) => {
      let rowIndex = rowRightEdge.findIndex((edge) => item.left > edge + QUARTER_LABEL_GAP);
      if (rowIndex === -1) {
        rowIndex = rowRightEdge.length;
        rowRightEdge.push(item.right);
      } else {
        rowRightEdge[rowIndex] = item.right;
      }
      rows[item.key] = rowIndex;
    });
    return rows;
  }, [chartWidth, domainMax, quarterDefs]);

  const getQuarterDy = (key: QuarterDef['key']) =>
    QUARTER_LABEL_BASE_DY + (quarterRows[key] ?? 0) * QUARTER_LABEL_ROW_HEIGHT;

  return (
    <>
      <div ref={sectionRef} className="scroll-mt-24 w-full bg-white p-5 rounded-xl shadow-sm border border-emerald-100 flex flex-col">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-emerald-50 pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600">
              <Target size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">TỔNG QUAN DOANH SỐ NHÀ MÁY (Năm 2026)</h3>
              <p className="text-xs text-slate-500">Tiến độ thực hiện (Nhập kho) so với chỉ tiêu kế hoạch năm</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Progress Bar & Cards — giữ nguyên */}
          <div className="lg:col-span-1 flex flex-col gap-6 h-full">
            <div className="w-full">
              <div className="flex justify-between items-end mb-2">
                <p className="text-xs font-bold text-slate-500 uppercase">Tiến độ tổng thể</p>
                <span className="text-[10px] text-slate-400"></span>
              </div>
              <div ref={chartWrapperRef} className="h-[110px] w-full bg-slate-50 rounded-lg border border-slate-100 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={factoryRevenueChartData}
                    margin={{ top: 20, right: 30, left: 30, bottom: 36 }}
                    barSize={24}
                  >
                    <XAxis type="number" hide domain={[0, (dataMax: number) => dataMax * 1.05]} />
                    <YAxis type="category" dataKey="name" hide />
                    <RechartsTooltip
                      cursor={{ fill: 'transparent' }}
                      formatter={(value: number, name: string) => {
                        if (name === 'thucHien') return [formatDecimal(value) + ' Tỷ', 'Thực hiện (Lũy kế)'];
                        if (name === 'conLai') return [formatDecimal(value) + ' Tỷ', 'Còn lại'];
                        return [value, name];
                      }}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}
                    />
                    <Bar dataKey="thucHien" stackId="a" fill="#3b82f6" radius={[4, 0, 0, 4]}>
                      <LabelList dataKey="thucHien" position="center" fill="white" fontSize={10} fontWeight="bold" formatter={(val: number) => val > 0 ? formatDecimal(val) : ''} />
                    </Bar>
                    <Bar dataKey="conLai" stackId="a" fill="#e2e8f0" radius={[0, 4, 4, 0]} />

                    <ReferenceLine x={quarterlyTargets.q1} stroke="none" label={(props: any) => <CheckpointTriangle {...props} />} />
                    <ReferenceLine x={quarterlyTargets.q2} stroke="none" label={(props: any) => <CheckpointTriangle {...props} />} />
                    <ReferenceLine x={quarterlyTargets.q3} stroke="none" label={(props: any) => <CheckpointTriangle {...props} />} />
                    <ReferenceLine x={quarterlyTargets.q4} stroke="none" label={(props: any) => <CheckpointTriangle {...props} />} />

                    {quarterlyTargets.q1 > 0 && (
                      <ReferenceLine x={quarterlyTargets.q1} stroke={QUARTER_COLOR} strokeDasharray="3 3" ifOverflow="visible">
                        <Label content={(props: any) => <CheckpointTriangle {...props} fill={QUARTER_COLOR} />} position="top" />
                        <Label value={`Quý I: ${formatDecimal(quarterlyTargets.q1)}`} position="insideBottom" fill={QUARTER_COLOR} fontSize={12} fontWeight="bold" dy={getQuarterDy('q1')} />
                      </ReferenceLine>
                    )}
                    {quarterlyTargets.q2 > 0 && (
                      <ReferenceLine x={quarterlyTargets.q2} stroke={QUARTER_COLOR} strokeDasharray="3 3" ifOverflow="visible">
                        <Label content={(props: any) => <CheckpointTriangle {...props} fill={QUARTER_COLOR} />} position="top" />
                        <Label value={`Quý II: ${formatDecimal(quarterlyTargets.q2)}`} position="insideBottom" fill={QUARTER_COLOR} fontSize={12} fontWeight="bold" dy={getQuarterDy('q2')} />
                      </ReferenceLine>
                    )}
                    {quarterlyTargets.q3 > 0 && (
                      <ReferenceLine x={quarterlyTargets.q3} stroke={QUARTER_COLOR} strokeDasharray="3 3" ifOverflow="visible">
                        <Label content={(props: any) => <CheckpointTriangle {...props} fill={QUARTER_COLOR} />} position="top" />
                        <Label value={`Quý III: ${formatDecimal(quarterlyTargets.q3)}`} position="insideBottom" fill={QUARTER_COLOR} fontSize={12} fontWeight="bold" dy={getQuarterDy('q3')} />
                      </ReferenceLine>
                    )}
                    {quarterlyTargets.q4 > 0 && (
                      <ReferenceLine x={quarterlyTargets.q4} stroke={QUARTER_COLOR} strokeDasharray="3 3" ifOverflow="visible">
                        <Label content={(props: any) => <CheckpointTriangle {...props} fill={QUARTER_COLOR} />} position="top" />
                        <Label value={`Quý IV: ${formatDecimal(quarterlyTargets.q4)}`} position="insideBottom" fill={QUARTER_COLOR} fontSize={12} fontWeight="bold" dy={getQuarterDy('q4')} />
                      </ReferenceLine>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 flex-1">
              <div className="p-2 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg border border-emerald-100 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-shadow">
                <div className="flex items-center gap-1.5 mb-0.5 z-10">
                  <div className="p-1 bg-emerald-100 rounded text-emerald-600 shadow-sm"><Target size={18} /></div>
                  <p className="text-xs font-bold text-emerald-800 opacity-80 uppercase tracking-wide">Kế hoạch Năm</p>
                </div>
                <div className="z-10 flex items-baseline gap-1 pl-0.5">
                  <h4 className="text-3xl font-extrabold text-emerald-600 tracking-tight">{formatDecimal(targetRevenue2026)}</h4>
                  <span className="text-xs font-medium text-emerald-500">Tỷ</span>
                </div>
              </div>

              <div className="p-2 bg-gradient-to-br from-blue-50 to-sky-50 rounded-lg border border-blue-100 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-shadow">
                <div className="flex items-center gap-1.5 mb-0.5 z-10">
                  <div className="p-1 bg-blue-100 rounded text-blue-600 shadow-sm"><CheckCircle size={18} /></div>
                  <p className="text-xs font-bold text-blue-800 opacity-80 uppercase tracking-wide">Thực hiện Lũy kế</p>
                </div>
                <div className="z-10 flex items-baseline gap-1 pl-0.5">
                  <h4 className="text-3xl font-extrabold text-blue-600 tracking-tight">{formatDecimal(factoryRevenueStats.actual)}</h4>
                  <span className="text-xs font-medium text-blue-500">Tỷ</span>
                </div>
              </div>

              <div className="p-2 bg-gradient-to-br from-violet-50 to-fuchsia-50 rounded-lg border border-violet-100 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-shadow">
                <div className="flex items-center gap-1.5 mb-0.5 z-10">
                  <div className="p-1 bg-violet-100 rounded text-violet-600 shadow-sm"><Activity size={18} /></div>
                  <p className="text-xs font-bold text-violet-800 opacity-80 uppercase tracking-wide">Tỷ lệ Đạt</p>
                </div>
                <div className="z-10 flex items-baseline gap-1 pl-0.5">
                  <h4 className={`text-3xl font-extrabold tracking-tight ${factoryRevenueStats.percent >= 100 ? 'text-emerald-600' : factoryRevenueStats.percent >= 80 ? 'text-violet-600' : 'text-amber-600'}`}>
                    {formatDecimal(factoryRevenueStats.percent)}%
                  </h4>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: giờ hiển thị FUNNEL "TÌNH TRẠNG ĐƠN HÀNG AATN" */}
          <div className="lg:col-span-2 flex flex-col bg-white rounded-xl border border-slate-100 p-4 shadow-sm h-full min-h-[400px]">
            <div className="flex justify-end mb-2">
              <button
                onClick={() => setIsFunnelPivotModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 font-medium text-xs border border-slate-200 transition-colors"
                title="Xem bảng chi tiết"
              >
                <Eye size={14} /> Chi tiết
              </button>
            </div>

            <div className="w-full flex-1 flex flex-col bg-slate-50/50 p-6 rounded-xl border border-slate-200 relative">
              <h3 className="font-serif text-xl md:text-2xl font-bold uppercase text-center mb-8 text-slate-800 tracking-wide">
                TÌNH TRẠNG ĐƠN HÀNG AATN
              </h3>

              <div className="flex flex-row gap-[30px] w-full max-w-5xl mx-auto relative mt-2">
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

                <div className="flex-1 relative flex flex-col gap-3 min-w-0">
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
                    const displayValue = Math.round(item.value / 1000);
                    const widthPercent = displayValue === 0 ? 6 : item.percentage;

                    return (
                      <div key={`bar-${item.id}`} className="h-10 flex justify-center w-full relative z-20">
                        <div
                          className="h-full flex items-center justify-center rounded-sm transition-all duration-500 shadow-sm"
                          style={{ width: `${widthPercent}%`, backgroundColor: item.color }}
                          title={`${item.name}: ${formatNumber(item.value, workshopMetric)}`}
                        >
                          <span className="text-black font-bold text-sm truncate px-1">
                            {displayValue.toLocaleString('en-US')}
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
                            {formatNumber(item.value, workshopMetric)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-wood-100 font-bold text-slate-800 border-t border-wood-300">
                      <tr>
                        <td className="px-4 py-3 text-left uppercase text-slate-700">Tổng Cộng</td>
                        <td className="px-4 py-3 text-right text-slate-800 text-base">
                          {formatNumber(pivotFunnelData.total, workshopMetric)}
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