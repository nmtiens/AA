import React from 'react';
import {
  XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, LabelList, CartesianGrid, Legend,
} from 'recharts';
import {
  Activity, Download, Layers, CheckCircle, XCircle as CloseIcon,
  Table as TableIcon, PlusSquare, MinusSquare, BarChart2,
} from 'lucide-react';
import { CompactStatCard } from '../shared/CompactStatCard';
import { MetricSwitcher } from '../shared/MetricSwitcher';
import { YearlyPlanWorkshopTooltip } from '../shared/tooltips/YearlyPlanWorkshopTooltip';
import { formatNumber, formatDecimal } from '../../utils/numberParsers';
import type { MetricType, WorkshopPivotData } from '../../types';

export interface CardMetrics {
  coTheSX: number;
  vecniFitting: number;
  chuyenKhac: number;
  coPhieuChuaSX: number;
  chuaTheSX: number;
  vuongSL: number;
  chuaTrienKhai: number;
}

interface WorkshopRevenueRow {
  name: string;
  plan: number;
  actual: number;
}

interface ProductionStatusSectionProps {
  sectionRef: React.Ref<HTMLDivElement>;
  pivotWorkshopRef: React.Ref<HTMLDivElement>;
  cardMetrics: CardMetrics;
  pivotWorkshopData: WorkshopPivotData | null;
  workshopMetric: MetricType;
  setWorkshopMetric: React.Dispatch<React.SetStateAction<MetricType>>;
  expandedBops: Set<string>;
  setExpandedBops: React.Dispatch<React.SetStateAction<Set<string>>>;
  handleExportProductionStatus: () => void;
  yearlyPlan2026WorkshopChartData: WorkshopRevenueRow[];
}

export const ProductionStatusSection: React.FC<ProductionStatusSectionProps> = ({
  sectionRef,
  pivotWorkshopRef,
  cardMetrics,
  pivotWorkshopData,
  workshopMetric,
  setWorkshopMetric,
  expandedBops,
  setExpandedBops,
  handleExportProductionStatus,
  yearlyPlan2026WorkshopChartData,
}) => {
  return (
    <div
      ref={sectionRef}
      id="production-status-section"
      className="scroll-mt-24 w-full bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-8"
    >
      {/* Chart - PHÂN BỔ KẾ HOẠCH THEO XƯỞNG (2026) */}
      <div className="mb-0">
        {yearlyPlan2026WorkshopChartData.length > 0 ? (
          <div className="bg-slate-50/50 rounded-xl border border-slate-200 p-4">
            <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2 uppercase tracking-wide">
              <BarChart2 className="w-4 h-4 text-emerald-600" /> Phân bổ Kế hoạch theo Xưởng (2026)
            </h4>
            <div className="w-full h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearlyPlan2026WorkshopChartData} margin={{ top: 20, right: 30, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" angle={-25} textAnchor="end" height={60} tick={{ fontSize: 10, fill: '#64748b' }} interval={0} />
                  <YAxis tickFormatter={(val) => formatDecimal(val)} tick={{ fontSize: 10, fill: '#64748b' }} />
                  <RechartsTooltip content={<YearlyPlanWorkshopTooltip />} cursor={{ fill: '#f8fafc' }} />
                  <Legend verticalAlign="top" height={36} />
                  <Bar dataKey="plan" name="Kế hoạch (Tỷ)" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30}>
                    <LabelList dataKey="plan" position="top" formatter={(val: number) => val > 0 ? formatDecimal(val) : ''} fontSize={10} fill="#059669" />
                  </Bar>
                  <Bar dataKey="actual" name="Thực hiện (Tỷ)" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30}>
                    <LabelList
                      dataKey="actual"
                      position="top"
                      content={(props: any) => {
                        const { x, y, width, value, index } = props;
                        const item = yearlyPlan2026WorkshopChartData[index as number];
                        const plan = item?.plan || 0;
                        const actual = Number(value) || 0;
                        if (actual <= 0) return null;
                        const percent = plan > 0 ? (actual / plan) * 100 : 0;
                        return (
                          <text x={x + width / 2} y={y - 15} fill="#2563eb" fontSize={10} textAnchor="middle">
                            <tspan x={x + width / 2} dy="0">{formatDecimal(actual)}</tspan>
                            <tspan x={x + width / 2} dy="12">({Math.round(percent)}%)</tspan>
                          </text>
                        );
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-slate-400">Không có dữ liệu xưởng</div>
        )}
      </div>

      <div className="flex flex-row justify-between items-start border-b border-slate-100 pb-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
            <Activity className="w-5 h-5 text-wood-600" /> TÌNH TRẠNG SẢN XUẤT
          </h3>
          <p className="text-xs text-slate-500">Tổng hợp năng lực sản xuất hiện tại và phân bổ chi tiết theo xưởng</p>
        </div>
        <button
          onClick={handleExportProductionStatus}
          className="p-1.5 text-slate-500 hover:text-wood-600 hover:bg-wood-50 rounded-lg transition-colors border border-slate-200"
          title="Xuất dữ liệu sản xuất"
        >
          <Download size={16} />
        </button>
      </div>

      <div>
        <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2 uppercase tracking-wide">
          <Layers className="w-4 h-4 text-wood-500" /> 1. Phân tích Khả năng & Thành tiền
        </h4>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-green-50/50 rounded-xl p-2 border border-green-100 flex flex-col gap-2">
            <CompactStatCard
              title="CÓ THỂ SẢN XUẤT"
              value={formatNumber(cardMetrics.coTheSX)}
              icon={<CheckCircle className="w-5 h-5 text-green-600" />}
              bg="bg-green-50"
              borderColor="border-green-400"
              textColor="text-green-800"
              isParent={true}
            />
            <div className="grid grid-cols-3 gap-2">
              <CompactStatCard
                title="VECNI + FITTING"
                value={formatNumber(cardMetrics.vecniFitting)}
                icon={<div className="w-2 h-2 rounded-full bg-blue-500"></div>}
                bg="bg-white"
                borderColor="border-blue-200"
                textColor="text-slate-700"
              />
              <CompactStatCard
                title="ĐANG TRÊN CHUYỀN"
                value={formatNumber(cardMetrics.chuyenKhac)}
                icon={<div className="w-2 h-2 rounded-full bg-indigo-500"></div>}
                bg="bg-white"
                borderColor="border-indigo-200"
                textColor="text-slate-700"
              />
              <CompactStatCard
                title="CÓ PHIẾU CHƯA SX"
                value={formatNumber(cardMetrics.coPhieuChuaSX)}
                icon={<div className="w-2 h-2 rounded-full bg-amber-500"></div>}
                bg="bg-white"
                borderColor="border-amber-200"
                textColor="text-slate-700"
              />
            </div>
          </div>
          <div className="bg-red-50/50 rounded-xl p-2 border border-red-100 flex flex-col gap-2">
            <CompactStatCard
              title="CHƯA THỂ SẢN XUẤT"
              value={formatNumber(cardMetrics.chuaTheSX)}
              icon={<CloseIcon className="w-5 h-5 text-red-600" />}
              bg="bg-red-50"
              borderColor="border-red-400"
              textColor="text-red-800"
              isParent={true}
            />
            <div className="grid grid-cols-2 gap-2">
              <CompactStatCard
                title="VƯỚNG SL CHƯA REV"
                value={formatNumber(cardMetrics.vuongSL)}
                icon={<div className="w-2 h-2 rounded-full bg-orange-500"></div>}
                bg="bg-white"
                borderColor="border-orange-200"
                textColor="text-slate-700"
              />
              <CompactStatCard
                title="CHƯA TRIỂN KHAI SX"
                value={formatNumber(cardMetrics.chuaTrienKhai)}
                icon={<div className="w-2 h-2 rounded-full bg-slate-400"></div>}
                bg="bg-white"
                borderColor="border-slate-300"
                textColor="text-slate-700"
              />
            </div>
          </div>
        </div>
      </div>

      <div ref={pivotWorkshopRef}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
          <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
            <TableIcon className="w-4 h-4 text-wood-500" /> 2. Chi tiết Giá trị (Tình Trạng x Khu vực sản xuất)
          </h4>
          <MetricSwitcher current={workshopMetric} onChange={setWorkshopMetric} />
        </div>
        {pivotWorkshopData ? (
          <div className="overflow-x-auto custom-scrollbar border border-slate-200 rounded-lg">
            <table className="w-full text-xs text-right min-w-[900px]">
              <thead className="bg-wood-50 text-slate-700 font-semibold uppercase">
                <tr>
                  <th className="px-3 py-2 text-left bg-wood-50 border-b border-wood-200 min-w-[150px]">
                    <div className="flex items-center justify-between">
                      <span>BOP</span>
                      <div className="flex gap-1 ml-2">
                        <button
                          onClick={() => setExpandedBops(new Set(pivotWorkshopData.uniqueBops))}
                          className="p-1 hover:bg-wood-200 rounded text-wood-600"
                          title="Mở rộng tất cả"
                        >
                          <PlusSquare size={14} />
                        </button>
                        <button
                          onClick={() => setExpandedBops(new Set())}
                          className="p-1 hover:bg-wood-200 rounded text-wood-600"
                          title="Thu gọn tất cả"
                        >
                          <MinusSquare size={14} />
                        </button>
                      </div>
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left sticky left-0 bg-wood-50 border-b border-wood-200 z-10 min-w-[180px]">
                    Tình Trạng
                  </th>
                  {pivotWorkshopData.uniqueWorkshops.map((w: string) => (
                    <th key={w} className="px-3 py-2 border-b border-wood-200 whitespace-nowrap text-wood-800">
                      {w}
                    </th>
                  ))}
                  <th className="px-3 py-2 bg-wood-100 border-b border-wood-200 font-bold text-slate-800">
                    Tổng Cộng
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pivotWorkshopData.uniqueBops.map((bop) => {
                  const isExpanded = expandedBops.has(bop);
                  const toggleExpand = () => {
                    const next = new Set(expandedBops);
                    if (isExpanded) next.delete(bop);
                    else next.add(bop);
                    setExpandedBops(next);
                  };

                  const bopRows = pivotWorkshopData.rows.filter((r) => r.bop === bop);

                  return (
                    <React.Fragment key={bop}>
                      <tr
                        className="bg-slate-100/80 hover:bg-slate-200/50 transition-colors cursor-pointer"
                        onClick={toggleExpand}
                      >
                        <td className="px-3 py-2 text-left font-bold text-slate-700 border-r border-slate-200 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button className="text-slate-500 hover:text-slate-800">
                              {isExpanded ? <MinusSquare size={14} /> : <PlusSquare size={14} />}
                            </button>
                            {bop || '-'}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-left font-bold text-slate-700 sticky left-0 bg-slate-100/80 z-10 whitespace-nowrap border-r border-slate-200">
                          Tổng ({bopRows.length})
                        </td>
                        {pivotWorkshopData.uniqueWorkshops.map((w: string) => {
                          const val = pivotWorkshopData.bopTotals[bop]?.[w] || 0;
                          return (
                            <td
                              key={w}
                              className={`px-3 py-2 whitespace-nowrap font-semibold ${val === 0 ? 'text-slate-400' : 'text-slate-700'}`}
                            >
                              {val === 0 ? '-' : formatNumber(val, workshopMetric)}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 font-bold text-slate-800 bg-wood-50/80">
                          {formatNumber(pivotWorkshopData.bopRowTotals[bop], workshopMetric)}
                        </td>
                      </tr>

                      {isExpanded &&
                        bopRows.map((rowItem) => (
                          <tr key={rowItem.key} className="hover:bg-slate-50 transition-colors">
                            <td className="px-3 py-2 text-left text-slate-400 border-r border-slate-100 whitespace-nowrap"></td>
                            <td className="px-3 py-2 text-left font-medium text-slate-700 sticky left-0 bg-white hover:bg-slate-50 z-10 whitespace-nowrap border-r border-slate-100 pl-6">
                              {rowItem.status}
                            </td>
                            {pivotWorkshopData.uniqueWorkshops.map((w: string) => {
                              const matrix = pivotWorkshopData?.matrix || {};
                              const val = matrix?.[rowItem.key]?.[w] || 0;
                              return (
                                <td
                                  key={w}
                                  className={`px-3 py-2 whitespace-nowrap ${val === 0 ? 'text-slate-300' : 'text-slate-600'}`}
                                >
                                  {val === 0 ? '-' : formatNumber(val, workshopMetric)}
                                </td>
                              );
                            })}
                            <td className="px-3 py-2 font-bold text-slate-800 bg-wood-50/50">
                              {formatNumber(pivotWorkshopData.rowTotals[rowItem.key], workshopMetric)}
                            </td>
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot className="bg-wood-100 font-bold text-slate-800 border-t border-wood-300">
                <tr>
                  <td colSpan={2} className="px-3 py-2 text-left sticky left-0 bg-wood-100 z-10">
                    Tổng Cộng
                  </td>
                  {pivotWorkshopData.uniqueWorkshops.map((w: string) => (
                    <td key={w} className="px-3 py-2 whitespace-nowrap">
                      {formatNumber(pivotWorkshopData.colTotals[w], workshopMetric)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-wood-800 text-sm">
                    {formatNumber(pivotWorkshopData.grandTotal, workshopMetric)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg">
            Không đủ dữ liệu hoặc thiếu cấu hình cột để tạo bảng Pivot.
          </div>
        )}
      </div>
    </div>
  );
};