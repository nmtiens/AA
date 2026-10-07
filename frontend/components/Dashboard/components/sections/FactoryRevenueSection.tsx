import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FunnelCard } from '../shared/FunnelCard';
import {
  XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, LabelList, ReferenceLine, Label,
} from 'recharts';
import { Target, CheckCircle, Activity, Eye, X } from 'lucide-react';
import { CheckpointTriangle } from '../shared/CheckpointTriangle';
import { ModalShell } from '../../../shared/ModalShell';
import { formatDecimal, formatNumber } from '../../utils/numberParsers';
import { formatTy, formatTrieuAsTy } from '../../../../utils/money';
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
  /** Nội dung bên phải phễu (3 biểu đồ tròn cơ cấu đơn hàng) */
  sideContent?: React.ReactNode;
  /** Bấm vào ô "Thực hiện lũy kế" -> mở chi tiết Nhập kho theo năm */
  onActualClick?: () => void;
  /** Bấm ô "Kế hoạch năm": mở biểu đồ nhập kho kèm cột kế hoạch năm (khsx_nam) */
  onPlanClick?: () => void;
  /**
   * Bấm 1 thanh phễu (giống Luồng đỏ / Căn mẫu): cha đổi pivotFunnelData sang bảng THEO CÔNG TRÌNH
   * của bước đó; đóng cửa sổ thì cha trả về tổng theo BOP. Không truyền => thanh không bấm được.
   */
  onFunnelItemClick?: (item: CustomFunnelItem) => void;
  onFunnelModalClose?: () => void;
  /** Bấm 1 con số trong bảng chi tiết (name = công trình / mã BOP, null = dòng Tổng cộng) */
  onPivotValueClick?: (name: string | null, item: CustomFunnelItem | null) => void;
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
  sideContent,
  onActualClick,
  onPlanClick,
  onFunnelItemClick,
  onFunnelModalClose,
  onPivotValueClick,
}: FactoryRevenueSectionProps) => {
  const [isFunnelPivotModalOpen, setIsFunnelPivotModalOpen] = useState(false);
  // Bước phễu đang xem chi tiết (null = bảng tổng theo BOP)
  const [selectedFunnelItem, setSelectedFunnelItem] = useState<CustomFunnelItem | null>(null);

  const openOverallDetail = () => { setSelectedFunnelItem(null); setIsFunnelPivotModalOpen(true); };
  const handleBarClick = (item: CustomFunnelItem) => {
    setSelectedFunnelItem(item);
    onFunnelItemClick?.(item);
    setIsFunnelPivotModalOpen(true);
  };
  const closeFunnelModal = () => {
    setIsFunnelPivotModalOpen(false);
    setSelectedFunnelItem(null);
    onFunnelModalClose?.();
  };
  // Ô số trong bảng: bấm được (mở danh sách HEX) khi cha có truyền onPivotValueClick
  const renderPivotValue = (value: number, name: string | null) => {
    const text = formatNumber(value, workshopMetric);
    if (!onPivotValueClick || value === 0) return <span className={value === 0 ? 'text-slate-300' : ''}>{text}</span>;
    return (
      <button
        type="button"
        onClick={() => onPivotValueClick(name, selectedFunnelItem)}
        className="text-slate-800 hover:text-emerald-700 hover:underline font-semibold"
        title="Bấm để xem danh sách HEX"
      >
        {text}
      </button>
    );
  };

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
      { key: 'q1', value: quarterlyTargets.q1, label: `Quí I: ${formatTy(quarterlyTargets.q1)}` },
      { key: 'q2', value: quarterlyTargets.q2, label: `Quí II: ${formatTy(quarterlyTargets.q2)}` },
      { key: 'q3', value: quarterlyTargets.q3, label: `Quí III: ${formatTy(quarterlyTargets.q3)}` },
      { key: 'q4', value: quarterlyTargets.q4, label: `Quí IV: ${formatTy(quarterlyTargets.q4)}` },
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
      <div ref={sectionRef} className="scroll-mt-24 w-full bg-white px-5 py-4 rounded-xl shadow-sm border border-slate-200 flex flex-col">
        <div className="flex items-center gap-3 mb-3 pb-3 border-b border-slate-100">
          <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
            <Target size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-slate-900 leading-tight">
              Tổng quan doanh số nhà máy · Năm 2026
            </h3>
            <p className="text-xs text-slate-500 leading-tight mt-0.5">Tiến độ thực hiện (Nhập kho) so với chỉ tiêu kế hoạch năm</p>
          </div>
        </div>

        {/* ===== HÀNG TRÊN: TIẾN ĐỘ TỔNG THỂ + 3 CARD ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          {/* Cột trái: thanh tiến độ (nhãn nằm trong khung) */}
          <div className="lg:col-span-1 relative">
            <p className="absolute top-2.5 left-3 z-10 text-[0.6875rem] font-medium tracking-wide text-slate-500">
              Tiến độ tổng thể (Tỷ)
            </p>
            <div ref={chartWrapperRef} className="h-[104px] w-full bg-slate-50 rounded-xl border border-slate-200 px-2">
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
                      if (name === 'thucHien') return [formatTy(value) + ' Tỷ', 'Thực hiện (Lũy kế)'];
                      if (name === 'conLai') return [formatTy(value) + ' Tỷ', 'Còn lại'];
                      return [value, name];
                    }}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}
                  />
                  <Bar dataKey="thucHien" stackId="a" fill="#3b82f6" radius={[4, 0, 0, 4]}>
                    <LabelList dataKey="thucHien" position="center" fill="white" fontSize={10} fontWeight="bold" formatter={(val: number) => val > 0 ? formatTy(val) : ''} />
                  </Bar>
                  <Bar dataKey="conLai" stackId="a" fill="#e2e8f0" radius={[0, 4, 4, 0]} />

                  <ReferenceLine x={quarterlyTargets.q1} stroke="none" label={(props: any) => <CheckpointTriangle {...props} />} />
                  <ReferenceLine x={quarterlyTargets.q2} stroke="none" label={(props: any) => <CheckpointTriangle {...props} />} />
                  <ReferenceLine x={quarterlyTargets.q3} stroke="none" label={(props: any) => <CheckpointTriangle {...props} />} />
                  <ReferenceLine x={quarterlyTargets.q4} stroke="none" label={(props: any) => <CheckpointTriangle {...props} />} />

                  {quarterlyTargets.q1 > 0 && (
                    <ReferenceLine x={quarterlyTargets.q1} stroke={QUARTER_COLOR} strokeDasharray="3 3" ifOverflow="visible">
                      <Label content={(props: any) => <CheckpointTriangle {...props} fill={QUARTER_COLOR} />} position="top" />
                      <Label value={`Quý I: ${formatTy(quarterlyTargets.q1)}`} position="insideBottom" fill={QUARTER_COLOR} fontSize={12} fontWeight="bold" dy={getQuarterDy('q1')} />
                    </ReferenceLine>
                  )}
                  {quarterlyTargets.q2 > 0 && (
                    <ReferenceLine x={quarterlyTargets.q2} stroke={QUARTER_COLOR} strokeDasharray="3 3" ifOverflow="visible">
                      <Label content={(props: any) => <CheckpointTriangle {...props} fill={QUARTER_COLOR} />} position="top" />
                      <Label value={`Quý II: ${formatTy(quarterlyTargets.q2)}`} position="insideBottom" fill={QUARTER_COLOR} fontSize={12} fontWeight="bold" dy={getQuarterDy('q2')} />
                    </ReferenceLine>
                  )}
                  {quarterlyTargets.q3 > 0 && (
                    <ReferenceLine x={quarterlyTargets.q3} stroke={QUARTER_COLOR} strokeDasharray="3 3" ifOverflow="visible">
                      <Label content={(props: any) => <CheckpointTriangle {...props} fill={QUARTER_COLOR} />} position="top" />
                      <Label value={`Quý III: ${formatTy(quarterlyTargets.q3)}`} position="insideBottom" fill={QUARTER_COLOR} fontSize={12} fontWeight="bold" dy={getQuarterDy('q3')} />
                    </ReferenceLine>
                  )}
                  {quarterlyTargets.q4 > 0 && (
                    <ReferenceLine x={quarterlyTargets.q4} stroke={QUARTER_COLOR} strokeDasharray="3 3" ifOverflow="visible">
                      <Label content={(props: any) => <CheckpointTriangle {...props} fill={QUARTER_COLOR} />} position="top" />
                      <Label value={`Quý IV: ${formatTy(quarterlyTargets.q4)}`} position="insideBottom" fill={QUARTER_COLOR} fontSize={12} fontWeight="bold" dy={getQuarterDy('q4')} />
                    </ReferenceLine>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

            {/* Cột phải: 3 card — tự cao bằng khung biểu đồ bên trái */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Kế hoạch năm — bấm được: mở biểu đồ nhập kho theo năm KÈM cột kế hoạch năm (khsx_nam) */}
            <button
              type="button"
              onClick={onPlanClick}
              disabled={!onPlanClick}
              title="Bấm để xem nhập kho so với kế hoạch năm theo tháng / xưởng"
              className="px-4 py-3 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-100 flex flex-col justify-center relative overflow-hidden group text-left w-full transition-all enabled:cursor-pointer enabled:hover:shadow-md enabled:hover:border-emerald-300 enabled:active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <span className="flex items-center gap-2 mb-1">
                <span className="p-1.5 bg-emerald-100 rounded-lg text-emerald-600"><Target size={15} /></span>
                <span className="text-xs font-medium text-emerald-800 tracking-wide">Kế hoạch năm</span>
              </span>
              <span className="flex items-baseline gap-1.5 pl-0.5">
                <span className="text-3xl font-semibold tabular-nums tracking-tight text-emerald-600 leading-none">{formatTy(targetRevenue2026)}</span>
                <span className="text-xs font-medium text-emerald-500">Tỷ</span>
              </span>
              {onPlanClick && (
                <span className="absolute top-2 right-3 inline-flex items-center gap-1 text-[0.625rem] font-medium text-emerald-600 opacity-70 group-hover:opacity-100">
                  <Eye size={12} /> Chi tiết
                </span>
              )}
            </button>

            {/* Thực hiện lũy kế — bấm được: mở chi tiết Nhập kho theo năm */}
            <button
              type="button"
              onClick={onActualClick}
              disabled={!onActualClick}
              title="Bấm để xem chi tiết nhập kho theo năm"
              className="px-4 py-3 bg-gradient-to-br from-blue-50 to-sky-50 rounded-xl border border-blue-100 flex flex-col justify-center relative overflow-hidden group text-left w-full transition-all enabled:cursor-pointer enabled:hover:shadow-md enabled:hover:border-blue-300 enabled:active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <span className="flex items-center gap-2 mb-1">
                <span className="p-1.5 bg-blue-100 rounded-lg text-blue-600"><CheckCircle size={15} /></span>
                <span className="text-xs font-medium text-blue-800 tracking-wide">Thực hiện lũy kế</span>
              </span>
              <span className="flex items-baseline gap-1.5 pl-0.5">
                <span className="text-3xl font-semibold tabular-nums tracking-tight text-blue-600 leading-none">{formatTy(factoryRevenueStats.actual)}</span>
                <span className="text-xs font-medium text-blue-500">Tỷ</span>
              </span>
              {onActualClick && (
                <span className="absolute top-2 right-3 inline-flex items-center gap-1 text-[0.625rem] font-medium text-blue-500 opacity-70 group-hover:opacity-100">
                  <Eye size={12} /> Chi tiết
                </span>
              )}
            </button>

            {/* Tỷ lệ đạt */}
            <div className="px-4 py-3 bg-gradient-to-br from-violet-50 to-fuchsia-50 rounded-xl border border-violet-100 flex flex-col justify-center relative overflow-hidden">
              <div className="flex items-center gap-2 mb-1">
                <div className="p-1.5 bg-violet-100 rounded-lg text-violet-600"><Activity size={15} /></div>
                <p className="text-xs font-medium text-violet-800 tracking-wide">Tỷ lệ đạt</p>
              </div>
              <div className="flex items-baseline gap-1 pl-0.5">
                <h4 className={`text-3xl font-semibold tabular-nums tracking-tight leading-none ${factoryRevenueStats.percent >= 100 ? 'text-emerald-600' : factoryRevenueStats.percent >= 80 ? 'text-violet-600' : 'text-amber-600'}`}>
                  {formatDecimal(factoryRevenueStats.percent)}%
                </h4>
              </div>
            </div>
          </div>
        </div>

        {/* ===== HÀNG DƯỚI: PHỄU TÌNH TRẠNG ĐƠN HÀNG AATN (trái) + CƠ CẤU (phải) ===== */}
        <div className="mt-6 grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
          {/* Phễu (thẻ dùng chung với Luồng đỏ / Căn mẫu): cao bằng cột bên phải, hàng tự giãn đều */}
          <FunnelCard
            className={sideContent ? 'xl:col-span-8' : 'xl:col-span-12'}
            subtitle="Phân bổ theo công đoạn (BOP)"
            unit={workshopMetric === 'COUNT_HEX' ? 'Hạng mục' : 'Tỷ đồng'}
            items={customFunnelData}
            // Giá trị gốc là triệu đồng -> Tỷ (2 số lẻ); chế độ đếm HEX thì giữ nguyên số lượng
            barLabel={item => (workshopMetric === 'COUNT_HEX' ? item.value.toLocaleString('en-US') : formatTrieuAsTy(item.value))}
            barTitle={item => `${item.name}: ${formatNumber(item.value, workshopMetric)}${workshopMetric === 'COUNT_HEX' ? '' : ' Tỷ'}`}
            onBarClick={onFunnelItemClick ? handleBarClick : undefined}
            onDetail={openOverallDetail}
          />

          {/* Nội dung bên phải (3 biểu đồ tròn) — cùng chiều cao với phễu */}
          {sideContent && <div className="xl:col-span-4 min-w-0 flex flex-col">{sideContent}</div>}
        </div>
      </div>

      {/* Funnel Pivot Detail Modal */}
      {/* closeOnEsc={false}: bấm 1 con số sẽ mở danh sách HEX ĐÈ LÊN cửa sổ này; cửa sổ HEX tự xử lý Esc */}
      <ModalShell
        open={isFunnelPivotModalOpen}
        onClose={closeFunnelModal}
        closeOnEsc={!onPivotValueClick}
        labelledBy="factory-funnel-detail-title"
        overlayClassName="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
        panelClassName="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col focus:outline-none"
      >
            <div className="flex justify-between items-center p-4 sm:p-6 border-b border-slate-100 bg-slate-50/50">
              <div>
                <h2 id="factory-funnel-detail-title" className="text-lg font-bold text-slate-800">
                  Chi tiết dữ liệu Phễu{selectedFunnelItem ? ` — ${selectedFunnelItem.name}` : ''}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {selectedFunnelItem ? 'Phân tích giá trị theo Công trình' : 'Phân tích giá trị theo BOP'}
                  {onPivotValueClick && ' · bấm con số để xem danh sách HEX'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeFunnelModal}
                aria-label="Đóng"
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
                        <th className="px-4 py-3 border-b border-slate-200 text-left font-bold text-slate-700 w-1/2">
                          {selectedFunnelItem ? 'Công trình' : 'BOP'}
                        </th>
                        <th className="px-4 py-3 border-b border-slate-200 text-right font-bold text-slate-700 w-1/2">
                          {workshopMetric === 'COUNT_HEX' ? 'Số hạng mục' : 'Giá trị (tỷ)'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {pivotFunnelData.data.map((item, index) => (
                        <tr key={item.name} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-left font-medium text-slate-700 flex items-center gap-2">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold">
                              {index + 1}
                            </span>
                            <span className="break-words" title={item.name}>{item.name}</span>
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
                  Không có dữ liệu để hiển thị.
                </div>
              )}
            </div>
      </ModalShell>
    </>
  );
};