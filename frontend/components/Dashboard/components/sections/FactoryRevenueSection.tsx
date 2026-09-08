import React from 'react';
import {
  XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, LabelList, ReferenceLine, Label,
  CartesianGrid, Legend
} from 'recharts';
import { Target, CheckCircle, Activity, BarChart2 } from 'lucide-react';
import { CheckpointTriangle } from '../shared/CheckpointTriangle';
import { YearlyPlanWorkshopTooltip } from '../shared/tooltips/YearlyPlanWorkshopTooltip';
import { formatDecimal } from '../../utils/numberParsers';

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

interface WorkshopRevenueRow {
  name: string;
  plan: number;
  actual: number;
}

interface FactoryRevenueSectionProps {
  sectionRef: React.Ref<HTMLDivElement>;
  factoryRevenueChartData: FactoryRevenueChartRow[];
  quarterlyTargets: QuarterlyTargets;
  targetRevenue2026: number;
  factoryRevenueStats: { actual: number; percent: number };
  yearlyPlan2026WorkshopChartData: WorkshopRevenueRow[];
}

export const FactoryRevenueSection = ({
  sectionRef,
  factoryRevenueChartData,
  quarterlyTargets,
  targetRevenue2026,
  factoryRevenueStats,
  yearlyPlan2026WorkshopChartData,
}: FactoryRevenueSectionProps) => {
  // Tự động tính tổng kế hoạch từ mảng xưởng nếu prop targetRevenue2026 truyền vào bị 0 hoặc falsy
  const displayTargetRevenue = targetRevenue2026 > 0 
    ? targetRevenue2026 
    : yearlyPlan2026WorkshopChartData.reduce((sum, item) => sum + (item.plan || 0), 0);

  return (
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
        {/* Left Column: Progress Bar & Cards */}
        <div className="lg:col-span-1 flex flex-col gap-6 h-full">

          <div className="w-full">
            <div className="flex justify-between items-end mb-2">
              <p className="text-xs font-bold text-slate-500 uppercase">Tiến độ tổng thể</p>
              <span className="text-[10px] text-slate-400"></span>
            </div>
            <div className="h-[110px] w-full bg-slate-50 rounded-lg border border-slate-100 p-2">
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
        <ReferenceLine x={quarterlyTargets.q1} stroke="#ea580c" strokeDasharray="3 3">
          <Label value={`Quý I: ${formatDecimal(quarterlyTargets.q1)}`} position="insideBottom" fill="#c2410c" fontSize={12} fontWeight="bold" dy={20} />
        </ReferenceLine>
      )}
      {quarterlyTargets.q2 > 0 && (
        <ReferenceLine x={quarterlyTargets.q2} stroke="#0891b2" strokeDasharray="3 3">
          <Label value={`Quý II: ${formatDecimal(quarterlyTargets.q2)}`} position="insideBottom" fill="#0e7490" fontSize={12} fontWeight="bold" dy={34} />
        </ReferenceLine>
      )}
      {quarterlyTargets.q3 > 0 && (
        <ReferenceLine x={quarterlyTargets.q3} stroke="#7c3aed" strokeDasharray="3 3">
          <Label value={`Quý III: ${formatDecimal(quarterlyTargets.q3)}`} position="insideBottom" fill="#6d28d9" fontSize={12} fontWeight="bold" dy={20} />
        </ReferenceLine>
      )}
      {quarterlyTargets.q4 > 0 && (
        <ReferenceLine x={quarterlyTargets.q4} stroke="#dc2626" strokeDasharray="3 3">
          <Label value={`Quý IV: ${formatDecimal(quarterlyTargets.q4)}`} position="insideBottom" fill="#b91c1c" fontSize={12} fontWeight="bold" dy={34} />
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
                {/* Đã cập nhật sử dụng displayTargetRevenue thay cho targetRevenue2026 */}
                <h4 className="text-3xl font-extrabold text-emerald-600 tracking-tight">{formatDecimal(displayTargetRevenue)}</h4>
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

        {/* Right Column: Workshop Comparison Chart */}
        <div className="lg:col-span-2 flex flex-col bg-white rounded-xl border border-slate-100 p-4 shadow-sm h-full min-h-[400px]">
          {yearlyPlan2026WorkshopChartData.length > 0 ? (
            <>
              <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2 uppercase tracking-wide">
                <BarChart2 className="w-4 h-4 text-emerald-600" /> Phân bổ Kế hoạch theo Xưởng (2026)
              </h4>
              <div className="flex-1 w-full">
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
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400">Không có dữ liệu xưởng</div>
          )}
        </div>
      </div>
    </div>
  );
};