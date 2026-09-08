import React, { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, BarChart, Bar, LabelList,
} from 'recharts';
import {
  Filter, BarChart2, TableIcon as _TableIcon, Table as TableIcon,
  Calendar, TrendingUp, Import, Activity, X, XCircle as CloseIcon, Eye,
} from 'lucide-react';
import { DataRow } from '../../../../types';
import { formatDecimal, formatInteger } from '../../utils/numberParsers';
import { getWeekNumber } from '../../utils/dateHelpers';
import { getWeekRange2026 } from '../../../../utils/dateUtils';
import { DashboardFilter } from '../shared/DashboardFilter';
import { WeeklyVennDiagram } from '../shared/WeeklyVennDiagram';
import { ProjectChartTooltip } from '../shared/tooltips/ProjectChartTooltip';
import { WorkshopChartTooltip } from '../shared/tooltips/WorkshopChartTooltip';
import ProductivityCharts from '../../../ProductivityCharts';

// ---------------------------------------------------------------------------
// Types (mirror the fields actually consumed below — verify against
// useKhsxSummary's real return type and replace this block with an import
// from there if it exports these shapes).
// ---------------------------------------------------------------------------

export interface UnifiedTimeFilters {
  nam: string[];
  thang: string[];
  ngay: string[];
  tuan: string[];
}

export type ViewMode = 'MONTH' | 'WEEK';

export interface CombinedChartRow {
  name: string;
  khValue: number;
  thValue: number;
  [key: string]: string | number;
}

export interface CombinedProjectChartRow {
  code: string;
  khValue: number;
  thValue: number;
  [key: string]: string | number;
}

export interface WeeklyPlanVsActualRow {
  name: string;
  plan: number;
  actualWeek: number;
  dungKh: number;
  thucHienDungKh1Phan: number;
  rotKh: number;
  thucHienRotKh1Phan: number;
  nhapKhoTruocKh: number;
  vuotKh: number;
  nhapKhoNgoaiKh: number;
}

export interface ProductivityAnalysisRow {
  name: string;
  avgDinhBien: number;
  avgWorkers: number;
  totalHc: number;
  totalTc: number;
  totalHours: number;   // ← thêm dòng này
  overtimeRate: number;
  sales: number;
  salesPerHour: number;
  salesPerWorker: number;
  hoursPerWorker: number;
}

interface KhsxPlanActualSectionProps {
  sectionRef: React.Ref<HTMLDivElement>;
  inventorySectionRef: React.Ref<HTMLDivElement>;

  khsxDataLength: number;
  inventoryDataLength: number;

  unifiedTimeFilters: UnifiedTimeFilters;
  setUnifiedTimeFilters: React.Dispatch<React.SetStateAction<UnifiedTimeFilters>>;
  viewMode: ViewMode;
  setViewMode: React.Dispatch<React.SetStateAction<ViewMode>>;

  unifiedNamOptions: string[];
  unifiedThangOptions: string[];
  unifiedTuanOptions: string[];
  unifiedNgayOptions: string[];

  totalKhsxAmount: number;
  completionRate: number;
  totalInventoryAmount: number;

  combinedWorkshopData: CombinedChartRow[];
  combinedProjectData: CombinedProjectChartRow[];
  weeklyPlanVsActualData: WeeklyPlanVsActualRow[];
  productivityAnalysisData: ProductivityAnalysisRow[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const KhsxPlanActualSection: React.FC<KhsxPlanActualSectionProps> = ({
  sectionRef,
  inventorySectionRef,
  khsxDataLength,
  inventoryDataLength,
  unifiedTimeFilters,
  setUnifiedTimeFilters,
  viewMode,
  setViewMode,
  unifiedNamOptions,
  unifiedThangOptions,
  unifiedTuanOptions,
  unifiedNgayOptions,
  totalKhsxAmount,
  completionRate,
  totalInventoryAmount,
  combinedWorkshopData,
  combinedProjectData,
  weeklyPlanVsActualData,
  productivityAnalysisData,
}) => {
  const [isWeeklyDetailModalOpen, setIsWeeklyDetailModalOpen] = useState(false);

  if (khsxDataLength === 0 && inventoryDataLength === 0) return null;

  return (
    <>
      <div
        ref={sectionRef}
        className="scroll-mt-24 bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-6"
      >
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-orange-500 to-indigo-600 p-2 rounded-lg text-white">
              <BarChart2 size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Thống kê Tổng hợp: Kế hoạch & Nhập kho</h3>
              <p className="text-xs text-slate-500">
                So sánh trực quan giữa Kế hoạch (KH) và Thực tế (TH) với bộ lọc thời gian thống nhất
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
            <div className="flex items-center gap-2 mr-2">
              <Filter size={14} className="text-slate-500" />
              <span className="text-[10px] font-bold text-slate-500 uppercase">BỘ LỌC THỜI GIAN CHUNG:</span>
            </div>

            <div className="flex bg-white rounded-lg border border-slate-200 p-0.5 shadow-sm">
              <button
                onClick={() => {
                  setViewMode('MONTH');
                  setUnifiedTimeFilters((prev) => ({ ...prev, tuan: [], ngay: [] }));
                }}
                className={`px-3 py-1 text-[10px] font-bold rounded ${
                  viewMode === 'MONTH' ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                Xem theo THÁNG
              </button>
              <button
                onClick={() => {
                  setViewMode('WEEK');
                  setUnifiedTimeFilters((prev) => {
                    if (prev.tuan.length === 0) {
                      return { ...prev, tuan: [String(getWeekNumber())] };
                    }
                    return prev;
                  });
                }}
                className={`px-3 py-1 text-[10px] font-bold rounded ${
                  viewMode === 'WEEK' ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                Xem theo TUẦN
              </button>
            </div>

            <div className="w-px h-6 bg-slate-300 mx-1"></div>

            <DashboardFilter
              label="LỌC NĂM"
              options={unifiedNamOptions}
              selectedValues={unifiedTimeFilters.nam}
              onChange={(vals) => setUnifiedTimeFilters((prev) => ({ ...prev, nam: vals }))}
            />
            <DashboardFilter
              label="LỌC THÁNG"
              options={unifiedThangOptions}
              selectedValues={unifiedTimeFilters.thang}
              onChange={(vals) => setUnifiedTimeFilters((prev) => ({ ...prev, thang: vals }))}
            />

            {viewMode === 'WEEK' && (
              <>
                <DashboardFilter
                  label="LỌC TUẦN"
                  options={unifiedTuanOptions}
                  selectedValues={unifiedTimeFilters.tuan}
                  onChange={(vals) => setUnifiedTimeFilters((prev) => ({ ...prev, tuan: vals }))}
                />
                <DashboardFilter
                  label="LỌC NGÀY"
                  options={unifiedNgayOptions}
                  selectedValues={unifiedTimeFilters.ngay}
                  onChange={(vals) => setUnifiedTimeFilters((prev) => ({ ...prev, ngay: vals }))}
                />
              </>
            )}

            {(unifiedTimeFilters.nam.length > 0 ||
              unifiedTimeFilters.thang.length > 0 ||
              unifiedTimeFilters.tuan.length > 0 ||
              unifiedTimeFilters.ngay.length > 0) && (
              <button
                onClick={() => setUnifiedTimeFilters({ nam: [], thang: [], ngay: [], tuan: [] })}
                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg border border-red-100 bg-white"
                title="Xóa lọc thời gian"
              >
                <CloseIcon size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-4 bg-orange-50 rounded-xl border border-orange-100 shadow-sm flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-orange-100 rounded text-orange-600">
                <Calendar size={18} />
              </div>
              <p className="text-xs font-bold text-orange-800 opacity-70 uppercase">Tổng KH Sản Xuất</p>
            </div>
            <h4 className="text-2xl lg:text-3xl font-bold text-orange-600 tracking-tight">
              {formatDecimal(totalKhsxAmount)}
            </h4>
            <div className="mt-1 text-[10px] text-orange-800/60 italic">
              {`Chế độ xem: ${viewMode === 'MONTH' ? 'Theo Tháng' : 'Theo Tuần'}`}
            </div>
          </div>
          <div className="p-4 bg-gradient-to-br from-teal-50 to-emerald-50 rounded-xl border border-teal-100 shadow-sm flex flex-col justify-center relative overflow-hidden">
            <div className="flex items-center gap-2 mb-2 z-10">
              <div className="p-1.5 bg-teal-100 rounded text-teal-600">
                <TrendingUp size={18} />
              </div>
              <p className="text-xs font-bold text-teal-800 opacity-70 uppercase">Tỷ lệ Thực hiện / KH</p>
            </div>
            <div className="flex items-baseline gap-2 z-10">
              <h4
                className={`text-3xl font-bold tracking-tight ${
                  completionRate >= 80 ? 'text-emerald-600' : completionRate >= 50 ? 'text-amber-600' : 'text-red-500'
                }`}
              >
                {formatDecimal(completionRate)}%
              </h4>
            </div>
            <div className="w-full bg-slate-200 h-1.5 rounded-full mt-3 z-10">
              <div
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  completionRate >= 100
                    ? 'bg-emerald-500'
                    : completionRate >= 80
                    ? 'bg-teal-500'
                    : completionRate >= 50
                    ? 'bg-amber-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${Math.min(completionRate, 100)}%` }}
              ></div>
            </div>
            <div className="absolute right-0 top-0 opacity-10 transform translate-x-2 -translate-y-2">
              <TrendingUp size={80} className="text-teal-600" />
            </div>
          </div>
          <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 shadow-sm flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-indigo-100 rounded text-indigo-600">
                <Import size={18} />
              </div>
              <p className="text-xs font-bold text-indigo-800 opacity-70 uppercase">Tổng Thực Hiện (NK)</p>
            </div>
            <h4 className="text-2xl lg:text-3xl font-bold text-indigo-600 tracking-tight">
              {formatDecimal(totalInventoryAmount)}
            </h4>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-2"></div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" ref={inventorySectionRef}>
          <div className="h-[350px] w-full bg-slate-50 rounded-lg border border-slate-100 p-3 relative group hover:shadow-md transition-shadow">
            <div className="absolute top-3 left-4 text-xs font-bold text-slate-600 uppercase z-10 bg-white/80 px-2 py-1 rounded backdrop-blur-sm shadow-sm">
              SO SÁNH: KH vs TH (Theo Xưởng)
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={combinedWorkshopData} margin={{ top: 35, right: 30, left: 10, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" angle={-25} textAnchor="end" height={60} tick={{ fontSize: 10 }} interval={0} />
                <YAxis tickFormatter={formatDecimal} tick={{ fontSize: 10 }} width={45} domain={['auto', 'auto']} />
                <RechartsTooltip content={<WorkshopChartTooltip />} cursor={{ fill: '#f8fafc' }} />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Bar dataKey="khValue" name="Kế hoạch (KH)" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20}>
                  <LabelList position="top" formatter={formatDecimal} fontSize={10} fill="#059669" />
                </Bar>
                <Bar dataKey="thValue" name="Thực hiện (TH)" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20}>
                  <LabelList
                    dataKey="thValue"
                    position="top"
                    content={(props: any) => {
                      const { x, y, width, value, index } = props;
                      const item = combinedWorkshopData[index as number];
                      const plan = item?.khValue || 0;
                      const actual = Number(value) || 0;

                      if (actual <= 0) return null;

                      const percent = plan > 0 ? (actual / plan) * 100 : 0;

                      return (
                        <text x={x + width / 2} y={y - 15} fill="#2563eb" fontSize={10} textAnchor="middle">
                          <tspan x={x + width / 2} dy="0">
                            {formatDecimal(actual)}
                          </tspan>
                          <tspan x={x + width / 2} dy="12">
                            ({Math.round(percent)}%)
                          </tspan>
                        </text>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="h-[350px] w-full bg-slate-50 rounded-lg border border-slate-100 p-3 relative group hover:shadow-md transition-shadow">
            <div className="absolute top-3 left-4 text-xs font-bold text-slate-600 uppercase z-10 bg-white/80 px-2 py-1 rounded backdrop-blur-sm shadow-sm">
              SO SÁNH: KH vs TH (Theo Công Trình - Top 10)
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={combinedProjectData} margin={{ top: 35, right: 30, left: 10, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="code"
                  angle={-50}
                  textAnchor="end"
                  height={80}
                  tick={{ fontSize: 10 }}
                  interval={0}
                  tickFormatter={(value) => (value.includes('_') ? value.split('_').pop() : value)}
                />
                <YAxis tickFormatter={formatDecimal} tick={{ fontSize: 10 }} width={45} domain={['auto', 'auto']} />
                <RechartsTooltip content={<ProjectChartTooltip />} cursor={{ fill: '#f8fafc' }} />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Bar dataKey="khValue" name="Kế hoạch (KH)" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20}>
                  <LabelList position="top" formatter={formatDecimal} fontSize={10} fill="#059669" />
                </Bar>
                <Bar dataKey="thValue" name="Thực hiện (TH)" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20}>
                  <LabelList
                    dataKey="thValue"
                    position="top"
                    content={(props: any) => {
                      const { x, y, width, value, index } = props;
                      const item = combinedProjectData[index as number];
                      const plan = item?.khValue || 0;
                      const actual = Number(value) || 0;

                      if (actual <= 0) return null;

                      const percent = plan > 0 ? (actual / plan) * 100 : 0;

                      return (
                        <text x={x + width / 2} y={y - 15} fill="#2563eb" fontSize={10} textAnchor="middle">
                          <tspan x={x + width / 2} dy="0">
                            {formatDecimal(actual)}
                          </tspan>
                          <tspan x={x + width / 2} dy="12">
                            ({Math.round(percent)}%)
                          </tspan>
                        </text>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {viewMode === 'WEEK' && (
          <div className="w-full mt-4">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
                <TableIcon className="w-4 h-4 text-orange-600" /> Phân tích Kế hoạch-Thực hiện Tuần
              </h4>
            </div>

            {weeklyPlanVsActualData.length > 0 ? (
              <div className="flex flex-col xl:flex-row gap-6 items-start">
                <div className="overflow-x-auto custom-scrollbar border border-slate-200 rounded-lg flex-1 min-w-0">
                  <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
                      <TableIcon className="w-4 h-4 text-wood-500" />
                      {(() => {
                        const w = parseInt(unifiedTimeFilters.tuan[0] || '0');
                        if (!w) return 'KẾ HOẠCH-THỰC HIỆN TUẦN';
                        const { start, end } = getWeekRange2026(w);
                        const fmt = (d: Date) =>
                          `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
                        return `KẾ HOẠCH-THỰC HIỆN TUẦN ${w} (từ ${fmt(start)} đến ${fmt(end)})`;
                      })()}
                    </h4>
                    <button
                      onClick={() => setIsWeeklyDetailModalOpen(true)}
                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-slate-200"
                      title="Xem chi tiết"
                    >
                      <Eye size={16} />
                    </button>
                  </div>
                  <table className="w-full text-xs text-right min-w-[800px]">
                    <thead className="bg-wood-50 text-slate-700 font-semibold uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left sticky left-0 bg-wood-50 border-b border-wood-200 z-10 w-32">
                          Xưởng Chính
                        </th>
                        <th className="px-4 py-3 border-b border-wood-200 text-orange-900">Thành tiền Kế hoạch</th>
                        <th className="px-4 py-3 border-b border-wood-200 text-orange-900">Nhập kho Tuần</th>
                        <th className="px-4 py-3 border-b border-wood-200 text-orange-900">Tỷ lệ (Tuần/KH)</th>
                        <th className="px-4 py-3 border-b border-wood-200 text-green-700 bg-green-50">ĐÚNG TIẾN ĐỘ</th>
                        <th className="px-4 py-3 border-b border-wood-200 text-red-700 bg-red-50">CHẬM TIẾN ĐỘ</th>
                        <th className="px-4 py-3 border-b border-wood-200 text-teal-700 bg-teal-50">NGOÀI KẾ HOẠCH</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {weeklyPlanVsActualData.map((item, idx) => {
                        const dungTienDo = item.dungKh + item.thucHienDungKh1Phan + item.nhapKhoTruocKh;
                        const chamTienDo = item.rotKh + item.thucHienRotKh1Phan;
                        const ngoaiKeHoach = item.vuotKh + item.nhapKhoNgoaiKh;
                        const percent = item.plan > 0 ? (item.actualWeek / item.plan) * 100 : 0;

                        return (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 text-left font-medium text-slate-700 sticky left-0 bg-white hover:bg-slate-50 z-10 border-r border-slate-100">
                              {item.name}
                            </td>
                            <td className="px-4 py-3 text-slate-600 font-bold">{formatDecimal(item.plan)}</td>
                            <td className="px-4 py-3 font-bold text-slate-800">{formatDecimal(item.actualWeek)}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`px-2 py-1 rounded font-bold text-[10px] inline-block w-16 text-center ${
                                  percent >= 80
                                    ? 'bg-green-100 text-green-700'
                                    : percent >= 50
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-red-100 text-red-700'
                                }`}
                              >
                                {formatDecimal(percent)}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-green-700 bg-green-50/30 font-bold">{formatDecimal(dungTienDo)}</td>
                            <td className="px-4 py-3 text-red-700 bg-red-50/30 font-bold">{formatDecimal(chamTienDo)}</td>
                            <td className="px-4 py-3 text-teal-700 bg-teal-50/30 font-bold">{formatDecimal(ngoaiKeHoach)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-wood-100 font-bold text-slate-800 border-t border-wood-300">
                      <tr>
                        <td className="px-4 py-3 text-left sticky left-0 bg-wood-100 z-10">TỔNG CỘNG</td>
                        <td className="px-4 py-3">{formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.plan, 0))}</td>
                        <td className="px-4 py-3">
                          {formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.actualWeek, 0))}
                        </td>
                        <td className="px-4 py-3">
                          {(() => {
                            const totalPlan = weeklyPlanVsActualData.reduce((a, b) => a + b.plan, 0);
                            const totalActual = weeklyPlanVsActualData.reduce((a, b) => a + b.actualWeek, 0);
                            const totalPercent = totalPlan > 0 ? (totalActual / totalPlan) * 100 : 0;
                            return `${formatDecimal(totalPercent)}%`;
                          })()}
                        </td>
                        <td className="px-4 py-3 text-green-800 bg-green-100/50">
                          {formatDecimal(
                            weeklyPlanVsActualData.reduce((a, b) => a + b.dungKh + b.thucHienDungKh1Phan + b.nhapKhoTruocKh, 0)
                          )}
                        </td>
                        <td className="px-4 py-3 text-red-800 bg-red-100/50">
                          {formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.rotKh + b.thucHienRotKh1Phan, 0))}
                        </td>
                        <td className="px-4 py-3 text-teal-800 bg-teal-100/50">
                          {formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.vuotKh + b.nhapKhoNgoaiKh, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="w-full xl:w-auto xl:max-w-[40%] shrink-0">
                  {(() => {
                    const totalPlan = weeklyPlanVsActualData.reduce((a, b) => a + b.plan, 0);
                    const totalActual = weeklyPlanVsActualData.reduce((a, b) => a + b.actualWeek, 0);
                    const intersection = weeklyPlanVsActualData.reduce(
                      (a, b) => a + b.dungKh + b.thucHienDungKh1Phan + b.nhapKhoTruocKh,
                      0
                    );
                    const leftOnly = weeklyPlanVsActualData.reduce((a, b) => a + b.rotKh + b.thucHienRotKh1Phan, 0);
                    const rightOnly = weeklyPlanVsActualData.reduce((a, b) => a + b.vuotKh + b.nhapKhoNgoaiKh, 0);

                    return (
                      <WeeklyVennDiagram
                        totalPlan={totalPlan}
                        totalActual={totalActual}
                        intersection={intersection}
                        leftOnly={leftOnly}
                        rightOnly={rightOnly}
                      />
                    );
                  })()}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg">
                Không có dữ liệu phân tích tuần (Kiểm tra lại bộ lọc hoặc dữ liệu nguồn).
              </div>
            )}
          </div>
        )}

        {viewMode === 'WEEK' && (
          <div className="w-full mt-6">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
                <Activity className="w-4 h-4 text-purple-600" /> Phân tích Năng suất (Dữ liệu Điểm danh)
              </h4>
            </div>

            {productivityAnalysisData.length > 0 ? (
              <div className="overflow-x-auto custom-scrollbar border border-slate-200 rounded-lg">
                <table className="w-full text-xs text-right min-w-[1200px]">
                  <thead className="bg-purple-50 text-slate-700 font-semibold uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left border-b border-purple-200 sticky left-0 bg-purple-50 z-10 w-[200px]">
                        Xưởng Chính
                      </th>
                      <th className="px-2 py-3 border-b border-purple-200 text-slate-600" title="Định biên">
                        ĐỊNH BIÊN
                      </th>
                      <th className="px-2 py-3 border-b border-purple-200 text-slate-600" title="Trung bình cộng">
                        TRUNG BÌNH SỐ LƯỢNG CÔNG NHÂN
                      </th>
                      <th className="px-2 py-3 border-b border-purple-200 text-slate-600">TỔNG GIỜ CÔNG HÀNH CHÍNH</th>
                      <th className="px-2 py-3 border-b border-purple-200 text-slate-600">TỔNG GIỜ TĂNG CA</th>
                      <th className="px-2 py-3 border-b border-purple-200 text-orange-700">TỶ LỆ GIỜ TĂNG CA (%)</th>
                      <th className="px-2 py-3 border-b border-purple-200 text-purple-800 bg-purple-100/30">
                        DOANH SỐ NHẬP KHO
                      </th>
                      <th className="px-2 py-3 border-b border-purple-200 text-blue-700">BÌNH QUÂN DOANH SỐ / 1 GIỜ</th>
                      <th className="px-2 py-3 border-b border-purple-200 text-blue-700">BÌNH QUÂN DOANH SỐ / 1 CÔNG NHÂN</th>
                      <th className="px-2 py-3 border-b border-purple-200 text-orange-700">BÌNH QUÂN GIỜ CÔNG / 1 CÔNG NHÂN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {productivityAnalysisData.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-left font-medium text-slate-700 sticky left-0 bg-white z-10 border-r border-slate-100 drop-shadow-sm">
                          {item.name}
                        </td>
                        <td className="px-2 py-3 text-slate-700">{formatInteger(item.avgDinhBien)}</td>
                        <td className="px-2 py-3 text-slate-700">{formatInteger(item.avgWorkers)}</td>
                        <td className="px-2 py-3 text-slate-600">{formatDecimal(item.totalHc)}</td>
                        <td className="px-2 py-3 text-slate-600">{formatDecimal(item.totalTc)}</td>
                        <td className="px-2 py-3 text-orange-600">{formatDecimal(item.overtimeRate)}%</td>
                        <td className="px-2 py-3 text-purple-700 font-bold bg-purple-50/20">{formatDecimal(item.sales)}</td>
                        <td className="px-2 py-3 text-blue-600 font-medium">{formatDecimal(item.salesPerHour)}</td>
                        <td className="px-2 py-3 text-blue-600 font-medium">{formatDecimal(item.salesPerWorker)}</td>
                        <td className="px-2 py-3 text-orange-600">{formatDecimal(item.hoursPerWorker)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-purple-100 font-bold text-slate-800 border-t border-purple-300">
                    <tr>
                      <td className="px-4 py-3 text-left sticky left-0 bg-purple-100 z-10 w-[200px]">
                        TỔNG CỘNG / BÌNH QUÂN
                      </td>
                      <td className="px-2 py-3">
                        {formatInteger(productivityAnalysisData.reduce((sum, item) => sum + item.avgDinhBien, 0))}
                      </td>
                      <td className="px-2 py-3">
                        {formatInteger(productivityAnalysisData.reduce((sum, item) => sum + item.avgWorkers, 0))}
                      </td>
                      <td className="px-2 py-3">
                        {formatDecimal(productivityAnalysisData.reduce((sum, item) => sum + item.totalHc, 0))}
                      </td>
                      <td className="px-2 py-3">
                        {formatDecimal(productivityAnalysisData.reduce((sum, item) => sum + item.totalTc, 0))}
                      </td>
                      {(() => {
                        const totalSales = productivityAnalysisData.reduce((sum, item) => sum + item.sales, 0);
                        const totalAvgWorkers = productivityAnalysisData.reduce((sum, item) => sum + item.avgWorkers, 0);
                        const totalHc = productivityAnalysisData.reduce((sum, item) => sum + item.totalHc, 0);
                        const totalTc = productivityAnalysisData.reduce((sum, item) => sum + item.totalTc, 0);
                        const totalHours = totalHc + totalTc;

                        const avgSalesPerHour = totalHours > 0 ? totalSales / totalHours : 0;
                        const avgSalesPerWorker = totalAvgWorkers > 0 ? totalSales / totalAvgWorkers : 0;
                        const avgOvertimeRate = totalHours > 0 ? (totalTc / totalHours) * 100 : 0;
                        const avgHoursPerWorker = totalAvgWorkers > 0 ? totalHours / totalAvgWorkers : 0;

                        return (
                          <>
                            <td className="px-2 py-3 text-orange-800">{formatDecimal(avgOvertimeRate)}%</td>
                            <td className="px-2 py-3 text-purple-900">{formatDecimal(totalSales)}</td>
                            <td className="px-2 py-3 text-blue-800">{formatDecimal(avgSalesPerHour)}</td>
                            <td className="px-2 py-3 text-blue-800">{formatDecimal(avgSalesPerWorker)}</td>
                            <td className="px-2 py-3 text-orange-800">{formatDecimal(avgHoursPerWorker)}</td>
                          </>
                        );
                      })()}
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg">
                Không có dữ liệu năng suất cho tuần này.
              </div>
            )}

            {productivityAnalysisData.length > 0 && (
              <ProductivityCharts data={productivityAnalysisData} viewMode={viewMode} filters={unifiedTimeFilters} />
            )}
          </div>
        )}
      </div>

      {/* Modal: Chi tiết Phân tích Kế hoạch-Thực hiện Tuần */}
      {isWeeklyDetailModalOpen && (
        <div className="fixed inset-y-0 right-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-all duration-300 left-0">
          <div className="bg-white rounded-2xl shadow-2xl w-[95%] max-w-7xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <TableIcon className="text-orange-600" size={20} />
                  Chi tiết Phân tích Kế hoạch-Thực hiện Tuần
                </h3>
                <p className="text-xs text-slate-500 mt-1">Dữ liệu chi tiết từng loại hình kế hoạch và thực hiện</p>
              </div>
              <button
                onClick={() => setIsWeeklyDetailModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 bg-slate-50/50 custom-scrollbar">
              <div className="overflow-x-auto custom-scrollbar border border-slate-200 rounded-lg bg-white shadow-sm">
                <table className="w-full text-xs text-right min-w-[1500px]">
                  <thead className="bg-orange-50 text-slate-700 font-semibold uppercase sticky top-0 z-20">
                    <tr>
                      <th className="px-4 py-3 text-left sticky left-0 bg-orange-50 border-b border-orange-200 z-30 w-32 shadow-[1px_0_3px_rgba(0,0,0,0.1)]">
                        Xưởng Chính
                      </th>
                      <th className="px-4 py-3 border-b border-orange-200 text-orange-900">Thành tiền Kế hoạch</th>
                      <th className="px-4 py-3 border-b border-orange-200 text-orange-900">Nhập kho Tuần</th>
                      <th className="px-4 py-3 border-b border-orange-200 text-orange-900">Tỷ lệ (Tuần/KH)</th>
                      <th className="px-4 py-3 border-b border-orange-200 text-green-700 bg-green-50">ĐÚNG KẾ HOẠCH</th>
                      <th className="px-4 py-3 border-b border-orange-200 text-blue-700 bg-blue-50">
                        THỰC HIỆN ĐÚNG KH 1 PHẦN
                      </th>
                      <th className="px-4 py-3 border-b border-orange-200 text-red-700 bg-red-50">RỚT KẾ HOẠCH</th>
                      <th className="px-4 py-3 border-b border-orange-200 text-orange-700 bg-orange-50">
                        THỰC HIỆN RỚT KH 1 PHẦN
                      </th>
                      <th className="px-4 py-3 border-b border-orange-200 text-purple-700 bg-purple-50">
                        NHẬP KHO TRƯỚC KH
                      </th>
                      <th className="px-4 py-3 border-b border-orange-200 text-teal-700 bg-teal-50">VƯỢT KẾ HOẠCH</th>
                      <th className="px-4 py-3 border-b border-orange-200 text-gray-700 bg-gray-100">
                        NHẬP KHO NGOÀI KH
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {weeklyPlanVsActualData.map((item, idx) => {
                      const percent = item.plan > 0 ? (item.actualWeek / item.plan) * 100 : 0;
                      return (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-4 py-3 text-left font-medium text-slate-700 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-100 shadow-[1px_0_3px_rgba(0,0,0,0.05)]">
                            {item.name}
                          </td>
                          <td className="px-4 py-3 text-slate-600 font-bold">{formatDecimal(item.plan)}</td>
                          <td className="px-4 py-3 font-bold text-slate-800">{formatDecimal(item.actualWeek)}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-1 rounded font-bold text-[10px] inline-block w-16 text-center ${
                                percent >= 80
                                  ? 'bg-green-100 text-green-700'
                                  : percent >= 50
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {formatDecimal(percent)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-green-700 bg-green-50/30">{formatDecimal(item.dungKh)}</td>
                          <td className="px-4 py-3 text-blue-700 bg-blue-50/30">
                            {formatDecimal(item.thucHienDungKh1Phan)}
                          </td>
                          <td className="px-4 py-3 text-red-700 bg-red-50/30">{formatDecimal(item.rotKh)}</td>
                          <td className="px-4 py-3 text-orange-700 bg-orange-50/30">
                            {formatDecimal(item.thucHienRotKh1Phan)}
                          </td>
                          <td className="px-4 py-3 text-purple-700 bg-purple-50/30">
                            {formatDecimal(item.nhapKhoTruocKh)}
                          </td>
                          <td className="px-4 py-3 text-teal-700 bg-teal-50/30">{formatDecimal(item.vuotKh)}</td>
                          <td className="px-4 py-3 text-gray-700 bg-gray-50/30">
                            {formatDecimal(item.nhapKhoNgoaiKh)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-orange-100 font-bold text-slate-800 border-t border-orange-300 sticky bottom-0 z-20 shadow-[0_-2px_5px_rgba(0,0,0,0.1)]">
                    <tr>
                      <td className="px-4 py-3 text-left sticky left-0 bg-orange-100 z-30 shadow-[1px_0_3px_rgba(0,0,0,0.1)]">
                        TỔNG CỘNG
                      </td>
                      <td className="px-4 py-3">{formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.plan, 0))}</td>
                      <td className="px-4 py-3">
                        {formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.actualWeek, 0))}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const totalPlan = weeklyPlanVsActualData.reduce((a, b) => a + b.plan, 0);
                          const totalActual = weeklyPlanVsActualData.reduce((a, b) => a + b.actualWeek, 0);
                          const totalPercent = totalPlan > 0 ? (totalActual / totalPlan) * 100 : 0;
                          return `${formatDecimal(totalPercent)}%`;
                        })()}
                      </td>
                      <td className="px-4 py-3 text-green-800 bg-green-100/50">
                        {formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.dungKh, 0))}
                      </td>
                      <td className="px-4 py-3 text-blue-800 bg-blue-100/50">
                        {formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.thucHienDungKh1Phan, 0))}
                      </td>
                      <td className="px-4 py-3 text-red-800 bg-red-100/50">
                        {formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.rotKh, 0))}
                      </td>
                      <td className="px-4 py-3 text-orange-800 bg-orange-100/50">
                        {formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.thucHienRotKh1Phan, 0))}
                      </td>
                      <td className="px-4 py-3 text-purple-800 bg-purple-100/50">
                        {formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.nhapKhoTruocKh, 0))}
                      </td>
                      <td className="px-4 py-3 text-teal-800 bg-teal-100/50">
                        {formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.vuotKh, 0))}
                      </td>
                      <td className="px-4 py-3 text-gray-800 bg-gray-200/50">
                        {formatDecimal(weeklyPlanVsActualData.reduce((a, b) => a + b.nhapKhoNgoaiKh, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};