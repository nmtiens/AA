import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, BarChart, Bar, LabelList,
} from 'recharts';
import {
  Filter, BarChart2, Table as TableIcon,
  Activity, X, XCircle as CloseIcon, Eye,
} from 'lucide-react';
import { formatDecimal, formatInteger } from '../../utils/numberParsers';
import { formatTy, formatTrieuAsTy } from '../../../../utils/money';
import { planWeekRange } from '../../../../utils/dateUtils';
import { DashboardFilter } from '../shared/DashboardFilter';
import { WeeklyVennDiagram } from '../shared/WeeklyVennDiagram';
import { ProjectChartTooltip } from '../shared/tooltips/ProjectChartTooltip';
import { WorkshopChartTooltip } from '../shared/tooltips/WorkshopChartTooltip';
import ProductivityCharts from '../../../ProductivityCharts';
import { mauTyLe } from '../../core/dauTrang';
import { tyLeKh } from '../../core/chiTietHex';
import { planWeekOf, type ViewMode } from '../../hooks/useUnifiedTimeFilters';
import { khung, soO, table, tdB, tfoot, thB, thead, trong0 } from '../../../shared/bangBaoCao';
import { fmtPt } from '../../../../utils/format';

// Cột tỷ lệ: 0% hiện đỏ, chưa có KH thì "—"
const mauNkKh = (pt: number | null) => (pt === null ? '' : mauTyLe(pt).o);
const soTy = (v: number) => trong0(v, formatTy);
const soLe = (v: number) => trong0(v, formatDecimal);
const soNguyen = (v: number) => trong0(v, formatInteger);
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


// Thẻ số đầu tab: cùng kiểu thẻ đầu trang Tổng quan
const THE_KH = 'flex flex-col rounded-2xl border border-slate-200 bg-white px-5 py-4';
const THE_TEN = 'mb-1.5 text-sm font-semibold text-slate-600';
const THE_SO = 'text-3xl font-semibold tabular-nums tracking-tight';

const TH_PLAN_COLOR = '#3b82f6';
const TH_OUT_COLOR = '#bfdbfe';

// Nhãn trên đỉnh cột TH (theo KH + ngoài KH chồng nhau): chỉ % NK theo KH / KH — số tiền xem ở tooltip
// (trước ghi cả số KH, tổng NK và % trên từng cột => chồng chéo khi cột sát nhau)
const ThStackLabel = ({ x, y, width, item }: { x?: number; y?: number; width?: number; item?: { khValue: number; thValue: number; thOutValue: number } }) => {
  if (!item || x === undefined || y === undefined || width === undefined) return null;
  if (!(item.khValue > 0)) return null;
  const percent = (item.thValue / item.khValue) * 100;
  const color = mauTyLe(percent).hex;
  return (
    <text x={x + width / 2} y={y - 5} fill={color} fontSize={12} fontWeight={700} textAnchor="middle">
      {fmtPt(percent)}
    </text>
  );
};

// thValue = nhập kho theo KH (hạng mục có trong KH cùng kỳ), thOutValue = nhập kho ngoài KH
export interface CombinedChartRow {
  name: string;
  khValue: number;
  thValue: number;
  thOutValue: number;
  [key: string]: string | number;
}

export interface CombinedProjectChartRow {
  code: string;
  khValue: number;
  thValue: number;
  thOutValue: number;
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

// MỚI: dữ liệu Kế hoạch theo Xưởng — chỉ phụ thuộc vào Năm được chọn
export interface YearlyWorkshopRow {
  name: string;
  plan: number;
  actual: number;
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
  /** Xem theo tháng mà kỳ chưa có KH tháng: tổng KH tuần cùng kỳ (chỉ để chú thích) */
  weeklyKhFallback?: number;
  completionRate: number;
  totalInventoryAmount: number;
  /** Nhập kho của hạng mục có trong KH cùng kỳ */
  totalInventoryPlanAmount: number;

  combinedWorkshopData: CombinedChartRow[];
  combinedProjectData: CombinedProjectChartRow[];
  weeklyPlanVsActualData: WeeklyPlanVsActualRow[];
  productivityAnalysisData: ProductivityAnalysisRow[];

  // MỚI: dữ liệu "Phân bổ Kế hoạch theo Xưởng" — CHỈ lọc theo unifiedTimeFilters.nam,
  // không bị ảnh hưởng bởi thang/tuan/ngay. Component cha (Dashboard) chịu trách
  // nhiệm tính lại mảng này mỗi khi unifiedTimeFilters.nam thay đổi.
  yearlyPlan2026WorkshopChartData: YearlyWorkshopRow[];
  selectedRevenueYearLabel: string;   // MỚI
  /** Đang lọc công trình: giờ công không chia theo công trình, ẩn các chỉ số chia giờ */
  locCongTrinh?: boolean;
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
  weeklyKhFallback,
  completionRate,
  totalInventoryAmount,
  totalInventoryPlanAmount,
  combinedWorkshopData,
  combinedProjectData,
  weeklyPlanVsActualData,
  productivityAnalysisData,
  yearlyPlan2026WorkshopChartData,
  selectedRevenueYearLabel,
  locCongTrinh = false,
}) => {
  const [isWeeklyDetailModalOpen, setIsWeeklyDetailModalOpen] = useState(false);
  const tongTuan = (f: (b: (typeof weeklyPlanVsActualData)[number]) => number) => weeklyPlanVsActualData.reduce((a, b) => a + f(b), 0);

  if (khsxDataLength === 0 && inventoryDataLength === 0) return null;


  return (
    <>
      <div
        ref={sectionRef}
        className="scroll-mt-24 bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-6"
      >
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <BarChart2 size={22} className="text-slate-600" />
            <h3 className="text-lg font-bold text-slate-800">Kế hoạch & Nhập kho</h3>
          </div>

          <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
            <Filter size={16} className="text-slate-600" />

            <div className="flex bg-white rounded-lg border border-slate-200 p-0.5 shadow-sm">
               {/* MỚI: Xem theo NĂM — bỏ mọi lọc Tháng/Tuần/Ngày, chỉ còn Năm */}
              <button
                onClick={() => {
                  setViewMode('YEAR');
                  setUnifiedTimeFilters((prev) => ({ ...prev, thang: [], tuan: [], ngay: [] }));
                }}
                className={`px-3 py-1 text-sm font-bold rounded ${
                  viewMode === 'YEAR' ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                Năm
              </button>
              <button
                onClick={() => {
                  setViewMode('MONTH');
                  setUnifiedTimeFilters((prev) => ({ ...prev, tuan: [], ngay: [] }));
                }}
                className={`px-3 py-1 text-sm font-bold rounded ${
                  viewMode === 'MONTH' ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                Tháng
              </button>
              <button
                onClick={() => {
                  setViewMode('WEEK');
                  setUnifiedTimeFilters((prev) => {
                    if (prev.tuan.length === 0) {
                      return { ...prev, tuan: [String(planWeekOf(new Date()))] };
                    }
                    return prev;
                  });
                }}
                className={`px-3 py-1 text-sm font-bold rounded ${
                  viewMode === 'WEEK' ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                Tuần
              </button>
            </div>

            <div className="w-px h-6 bg-slate-300 mx-1"></div>

            <DashboardFilter
              label="LỌC NĂM"
              options={unifiedNamOptions}
              selectedValues={unifiedTimeFilters.nam}
              onChange={(vals) => setUnifiedTimeFilters((prev) => ({ ...prev, nam: vals }))}
            />

            {/* Tháng/Tuần/Ngày chỉ có ý nghĩa ở chế độ THÁNG/TUẦN — ẩn hoàn toàn ở chế độ NĂM */}
            {viewMode !== 'YEAR' && (
              <DashboardFilter
                label="LỌC THÁNG"
                options={unifiedThangOptions}
                selectedValues={unifiedTimeFilters.thang}
                onChange={(vals) => setUnifiedTimeFilters((prev) => ({ ...prev, thang: vals }))}
              />
            )}

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

        {/* ================= CHẾ ĐỘ NĂM: chỉ hiện biểu đồ Phân bổ Kế hoạch theo Xưởng ================= */}
        {viewMode === 'YEAR' ? (
  <div className="bg-slate-50/50 rounded-xl border border-slate-200 p-4" ref={inventorySectionRef}>
    <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2 uppercase tracking-wide">
      <BarChart2 className="w-4 h-4 text-emerald-600" /> KH theo xưởng {selectedRevenueYearLabel} <span className="normal-case font-semibold text-slate-600">(tỷ)</span>
    </h4>
    {yearlyPlan2026WorkshopChartData.length > 0 ? (
      <div className="w-full h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={yearlyPlan2026WorkshopChartData} margin={{ top: 20, right: 30, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" angle={-25} textAnchor="end" height={60} tick={{ fontSize: 12, fill: '#475569' }} interval={0} />
                    <YAxis tickFormatter={(val) => formatTy(val)} tick={{ fontSize: 12, fill: '#475569' }} />
                    <RechartsTooltip
                      formatter={(value: number, name: string) => [
                        `${formatTy(value)} Tỷ`,
                        name === 'plan' ? 'Kế hoạch' : 'Thực hiện',
                      ]}
                      cursor={{ fill: '#f8fafc' }}
                    />
                    <Legend verticalAlign="top" height={36} />
                    <Bar dataKey="plan" name="Kế hoạch" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30}>
                      <LabelList dataKey="plan" position="top" formatter={(val: number) => (val > 0 ? formatTy(val) : '')} fontSize={12} fontWeight={700} fill="#059669" />
                    </Bar>
                    <Bar dataKey="actual" name="Thực hiện" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30}>
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
                            <text x={x + width / 2} y={y - 18} fill="#2563eb" fontSize={12} fontWeight={700} textAnchor="middle">
                              <tspan x={x + width / 2} dy="0">{formatTy(actual)}</tspan>
                              <tspan x={x + width / 2} dy="14">({fmtPt(percent)})</tspan>
                            </text>
                          );
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
                <div className="h-[200px] flex items-center justify-center text-slate-500">
        Không có dữ liệu {selectedRevenueYearLabel}
      </div>
            )}
          </div>
        ) : (
          <>
            {/* ================= CHẾ ĐỘ THÁNG/TUẦN: giữ nguyên toàn bộ nội dung cũ ================= */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className={THE_KH}>
                <p className={THE_TEN}>{viewMode === 'WEEK' ? 'KH tuần' : 'KH tháng đã chốt'} (tỷ)</p>
                <h4 className={`${THE_SO} text-slate-900`}>{formatTy(totalKhsxAmount)}</h4>
                {totalKhsxAmount <= 0 && (
                  <p className="mt-1.5 text-sm font-medium text-amber-700">
                    {viewMode === 'WEEK' ? 'Chưa có KH tuần' : 'Chưa có KH tháng'}
                    {viewMode === 'MONTH' && weeklyKhFallback !== undefined && <> · KH tuần: {formatTy(weeklyKhFallback)} tỷ</>}
                  </p>
                )}
              </div>
              <div className={THE_KH}>
                <p className={THE_TEN} title="Nhập kho của hạng mục có trong kế hoạch ÷ tổng kế hoạch">NK theo KH / KH</p>
                <h4 className={`${THE_SO} ${totalKhsxAmount > 0 ? mauTyLe(completionRate).chu : 'text-slate-500'}`}>
                  {totalKhsxAmount > 0 ? fmtPt(completionRate) : 'Chưa có KH'}
                </h4>
                <div className="mt-3 h-1.5 w-full rounded-full bg-slate-200">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${mauTyLe(completionRate).thanh}`}
                    style={{ width: `${Math.min(completionRate, 100)}%` }}
                  />
                </div>
              </div>
              <div className={THE_KH}>
                <p className={THE_TEN}>Nhập kho (tỷ)</p>
                <h4 className={`${THE_SO} text-slate-900`}>{formatTy(totalInventoryAmount)}</h4>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <i className="h-2 w-2 rounded-sm" style={{ background: TH_PLAN_COLOR }} />
                    Theo KH: <b className="tabular-nums">{formatTy(totalInventoryPlanAmount)}</b>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <i className="h-2 w-2 rounded-sm" style={{ background: TH_OUT_COLOR }} />
                    Ngoài KH: <b className="tabular-nums">{formatTy(Math.max(totalInventoryAmount - totalInventoryPlanAmount, 0))}</b>
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-2"></div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" ref={inventorySectionRef}>
              <div className="h-[350px] w-full bg-slate-50 rounded-lg border border-slate-100 p-3 relative group hover:shadow-md transition-shadow">
                <div className="absolute top-3 left-4 text-sm font-bold text-slate-700 uppercase z-10 bg-white/80 px-2 py-1 rounded backdrop-blur-sm shadow-sm">
                  KH vs NK theo xưởng <span className="normal-case">(tỷ)</span>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={combinedWorkshopData} margin={{ top: 20, right: 30, left: 10, bottom: 50 }} barGap={3}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" angle={-25} textAnchor="end" height={60} tick={{ fontSize: 12 }} interval={0} />
                    <YAxis tickFormatter={formatTy} tick={{ fontSize: 12 }} width={45} domain={['auto', 'auto']} />
                    <RechartsTooltip content={<WorkshopChartTooltip />} cursor={{ fill: '#f8fafc' }} />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Bar dataKey="khValue" name="Kế hoạch (KH)" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                    <Bar dataKey="thValue" name="NK theo KH" stackId="th" fill={TH_PLAN_COLOR} barSize={20} />
                    <Bar dataKey="thOutValue" name="NK ngoài KH" stackId="th" fill={TH_OUT_COLOR} radius={[4, 4, 0, 0]} barSize={20}>
                      <LabelList dataKey="thOutValue" position="top" content={(props: any) => <ThStackLabel {...props} item={combinedWorkshopData[props.index as number]} />} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="h-[350px] w-full bg-slate-50 rounded-lg border border-slate-100 p-3 relative group hover:shadow-md transition-shadow">
                <div className="absolute top-3 left-4 text-sm font-bold text-slate-700 uppercase z-10 bg-white/80 px-2 py-1 rounded backdrop-blur-sm shadow-sm">
                  KH vs NK top 10 công trình <span className="normal-case">(tỷ)</span>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={combinedProjectData} margin={{ top: 20, right: 30, left: 10, bottom: 80 }} barGap={3}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="code"
                      angle={-50}
                      textAnchor="end"
                      height={80}
                      tick={{ fontSize: 12 }}
                      interval={0}
                      tickFormatter={(value) => (value.includes('_') ? value.split('_').pop() : value)}
                    />
                    <YAxis tickFormatter={formatTy} tick={{ fontSize: 12 }} width={45} domain={['auto', 'auto']} />
                    <RechartsTooltip content={<ProjectChartTooltip />} cursor={{ fill: '#f8fafc' }} />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Bar dataKey="khValue" name="Kế hoạch (KH)" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                    <Bar dataKey="thValue" name="NK theo KH" stackId="th" fill={TH_PLAN_COLOR} barSize={20} />
                    <Bar dataKey="thOutValue" name="NK ngoài KH" stackId="th" fill={TH_OUT_COLOR} radius={[4, 4, 0, 0]} barSize={20}>
                      <LabelList dataKey="thOutValue" position="top" content={(props: any) => <ThStackLabel {...props} item={combinedProjectData[props.index as number]} />} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {viewMode === 'WEEK' && (
              <div className="w-full mt-4">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
                    <TableIcon className="w-4 h-4 text-orange-600" /> KH – NK tuần
                  </h4>
                </div>

                {weeklyPlanVsActualData.length > 0 ? (
                  <div className="flex flex-col xl:flex-row gap-6 items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between pb-2">
                        <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
                          <TableIcon className="w-4 h-4 text-wood-500" />
                          {(() => {
                            const w = parseInt(unifiedTimeFilters.tuan[0] || '0');
                            if (!w) return 'TUẦN';
                            const { start, end } = planWeekRange(parseInt(unifiedTimeFilters.nam[0] || '') || new Date().getFullYear(), w);
                            const fmt = (d: Date) =>
                              `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
                            return `TUẦN ${w} · ${fmt(start)}–${fmt(end)}`;
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
                      <div className={`${khung} max-h-[70vh]`}>
                      <table className={table}>
                        <thead className={thead}>
                          <tr>
                            <th className={`${thB} sticky left-0 z-[3] w-32 bg-emerald-300 text-center`}>Xưởng</th>
                            <th className={`${thB} text-center`}>KH (tỷ)</th>
                            <th className={`${thB} text-center`}>NK tuần (tỷ)</th>
                            <th className={`${thB} text-center`}>NK / KH</th>
                            <th className={`${thB} text-center`}>Đúng tiến độ</th>
                            <th className={`${thB} text-center`}>Chậm tiến độ</th>
                            <th className={`${thB} text-center`}>Ngoài kế hoạch</th>
                          </tr>
                        </thead>
                        <tbody>
                          {weeklyPlanVsActualData.map((item, idx) => {
                            const dungTienDo = item.dungKh + item.thucHienDungKh1Phan + item.nhapKhoTruocKh;
                            const chamTienDo = item.rotKh + item.thucHienRotKh1Phan;
                            const ngoaiKeHoach = item.vuotKh + item.nhapKhoNgoaiKh;
                            const percent = tyLeKh(item.actualWeek, item.plan);

                            return (
                              <tr key={idx}>
                                <td className={`${tdB} sticky left-0 z-[1] whitespace-nowrap bg-white font-bold`}>{item.name}</td>
                                <td className={`${tdB} ${soO}`}>{soTy(item.plan)}</td>
                                <td className={`${tdB} ${soO}`}>{soTy(item.actualWeek)}</td>
                                <td className={`${tdB} ${soO} font-bold ${mauNkKh(percent)}`}>{fmtPt(percent)}</td>
                                <td className={`${tdB} ${soO}`}>{soTy(dungTienDo)}</td>
                                <td className={`${tdB} ${soO}`}>{soTy(chamTienDo)}</td>
                                <td className={`${tdB} ${soO}`}>{soTy(ngoaiKeHoach)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className={tfoot}>
                          <tr>
                            <td className={`${tdB} left-0 !z-[3] text-center`}>TỔNG</td>
                            <td className={`${tdB} ${soO}`}>{soTy(tongTuan(b => b.plan))}</td>
                            <td className={`${tdB} ${soO}`}>{soTy(tongTuan(b => b.actualWeek))}</td>
                            <td className={`${tdB} ${soO}`}>
                              {fmtPt(tyLeKh(tongTuan(b => b.actualWeek), tongTuan(b => b.plan)))}
                            </td>
                            <td className={`${tdB} ${soO}`}>{soTy(tongTuan(b => b.dungKh + b.thucHienDungKh1Phan + b.nhapKhoTruocKh))}</td>
                            <td className={`${tdB} ${soO}`}>{soTy(tongTuan(b => b.rotKh + b.thucHienRotKh1Phan))}</td>
                            <td className={`${tdB} ${soO}`}>{soTy(tongTuan(b => b.vuotKh + b.nhapKhoNgoaiKh))}</td>
                          </tr>
                        </tfoot>
                      </table>
                      </div>
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
                    Không có dữ liệu tuần
                  </div>
                )}
              </div>
            )}

            {viewMode === 'WEEK' && (
              <div className="w-full mt-6">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
                    <Activity className="w-4 h-4 text-purple-600" /> Năng suất
                    {locCongTrinh && <span className="font-medium normal-case tracking-normal text-slate-500">Giờ công theo xưởng, không theo công trình</span>}
                  </h4>
                </div>

                {productivityAnalysisData.length > 0 ? (
                  <div className={`${khung} max-h-[70vh]`}>
                    <table className={table}>
                      <thead className={thead}>
                        <tr>
                          <th className={`${thB} sticky left-0 z-[3] w-[200px] bg-emerald-300 text-center`}>Xưởng</th>
                          <th className={`${thB} text-center`} title="Định biên">Định biên</th>
                          <th className={`${thB} text-center`} title="Trung bình số lượng công nhân">TB công nhân</th>
                          <th className={`${thB} text-center`} title="Tổng giờ công hành chính">Giờ HC</th>
                          <th className={`${thB} text-center`} title="Tổng giờ tăng ca">Giờ tăng ca</th>
                          <th className={`${thB} text-center`} title="Tỷ lệ giờ tăng ca">% tăng ca</th>
                          <th className={`${thB} text-center`} title="Doanh số nhập kho">Nhập kho (tỷ)</th>
                          <th className={`${thB} text-center`} title="Bình quân doanh số / 1 giờ">DS / giờ (triệu)</th>
                          <th className={`${thB} text-center`} title="Bình quân doanh số / 1 công nhân">DS / CN (triệu)</th>
                          <th className={`${thB} text-center`} title="Bình quân giờ công / 1 công nhân">Giờ / CN</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productivityAnalysisData.map((item, idx) => (
                          <tr key={idx}>
                            <td className={`${tdB} sticky left-0 z-[1] whitespace-nowrap bg-white font-bold`}>{item.name}</td>
                            <td className={`${tdB} ${soO}`}>{soNguyen(item.avgDinhBien)}</td>
                            <td className={`${tdB} ${soO}`}>{soNguyen(item.avgWorkers)}</td>
                            <td className={`${tdB} ${soO}`}>{soLe(item.totalHc)}</td>
                            <td className={`${tdB} ${soO}`}>{soLe(item.totalTc)}</td>
                            <td className={`${tdB} ${soO} ${item.overtimeRate ? '' : 'text-red-600'}`}>{fmtPt(item.overtimeRate)}</td>
                            <td className={`${tdB} ${soO} font-bold`}>{trong0(item.sales, formatTrieuAsTy)}</td>
                            <td className={`${tdB} ${soO}`}>{soLe(item.salesPerHour)}</td>
                            <td className={`${tdB} ${soO}`}>{soLe(item.salesPerWorker)}</td>
                            <td className={`${tdB} ${soO}`}>{soLe(item.hoursPerWorker)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className={tfoot}>
                        <tr>
                          <td className={`${tdB} left-0 !z-[3] w-[200px] text-center`}>TỔNG / BÌNH QUÂN</td>
                          <td className={`${tdB} ${soO}`}>
                            {soNguyen(productivityAnalysisData.reduce((sum, item) => sum + item.avgDinhBien, 0))}
                          </td>
                          <td className={`${tdB} ${soO}`}>
                            {soNguyen(productivityAnalysisData.reduce((sum, item) => sum + item.avgWorkers, 0))}
                          </td>
                          <td className={`${tdB} ${soO}`}>
                            {soLe(productivityAnalysisData.reduce((sum, item) => sum + item.totalHc, 0))}
                          </td>
                          <td className={`${tdB} ${soO}`}>
                            {soLe(productivityAnalysisData.reduce((sum, item) => sum + item.totalTc, 0))}
                          </td>
                          {(() => {
                            const totalSales = productivityAnalysisData.reduce((sum, item) => sum + item.sales, 0);
                            const totalAvgWorkers = productivityAnalysisData.reduce((sum, item) => sum + item.avgWorkers, 0);
                            const totalHc = productivityAnalysisData.reduce((sum, item) => sum + item.totalHc, 0);
                            const totalTc = productivityAnalysisData.reduce((sum, item) => sum + item.totalTc, 0);
                            const totalHours = totalHc + totalTc;

                            const avgSalesPerHour = !locCongTrinh && totalHours > 0 ? totalSales / totalHours : 0;
                            const avgSalesPerWorker = !locCongTrinh && totalAvgWorkers > 0 ? totalSales / totalAvgWorkers : 0;
                            const avgOvertimeRate = totalHours > 0 ? (totalTc / totalHours) * 100 : 0;
                            const avgHoursPerWorker = totalAvgWorkers > 0 ? totalHours / totalAvgWorkers : 0;

                            return (
                              <>
                                <td className={`${tdB} ${soO}`}>{fmtPt(avgOvertimeRate)}</td>
                                <td className={`${tdB} ${soO}`}>{trong0(totalSales, formatTrieuAsTy)}</td>
                                <td className={`${tdB} ${soO}`}>{soLe(avgSalesPerHour)}</td>
                                <td className={`${tdB} ${soO}`}>{soLe(avgSalesPerWorker)}</td>
                                <td className={`${tdB} ${soO}`}>{soLe(avgHoursPerWorker)}</td>
                              </>
                            );
                          })()}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg">
                    Không có dữ liệu năng suất
                  </div>
                )}

                {productivityAnalysisData.length > 0 && (
                  <ProductivityCharts data={productivityAnalysisData} viewMode={viewMode} filters={unifiedTimeFilters} />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal: Chi tiết Phân tích Kế hoạch-Thực hiện Tuần */}
      {isWeeklyDetailModalOpen && createPortal(
        <div className="fixed inset-y-0 right-0 z-[60] flex bg-black/50 transition-all duration-300 left-0">
          <div className="bg-white shadow-2xl w-full h-full overflow-hidden flex flex-col animate-in fade-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <TableIcon className="text-orange-600" size={20} />
                Chi tiết KH – NK tuần
              </h3>
              <button
                onClick={() => setIsWeeklyDetailModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 bg-slate-50/50 custom-scrollbar">
              <div className={`${khung} max-h-full bg-white`}>
                <table className={`${table} min-w-[1100px]`}>
                  <thead className={thead}>
                    <tr>
                      <th className={`${thB} sticky left-0 z-[3] w-32 bg-emerald-300 text-center`}>Xưởng</th>
                      {['KH (tỷ)', 'NK tuần (tỷ)', 'NK / KH', 'Đúng kế hoạch', 'Thực hiện đúng KH 1 phần', 'Rớt kế hoạch', 'Thực hiện rớt KH 1 phần', 'Nhập kho trước KH', 'Vượt kế hoạch', 'Nhập kho ngoài KH'].map(t => (
                        <th key={t} className={`${thB} text-center`}>{t}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyPlanVsActualData.map((item, idx) => {
                      const percent = tyLeKh(item.actualWeek, item.plan);
                      return (
                        <tr key={idx}>
                          <td className={`${tdB} sticky left-0 z-[1] whitespace-nowrap bg-white font-bold`}>{item.name}</td>
                          <td className={`${tdB} ${soO}`}>{soTy(item.plan)}</td>
                          <td className={`${tdB} ${soO}`}>{soTy(item.actualWeek)}</td>
                          <td className={`${tdB} ${soO} font-bold ${mauNkKh(percent)}`}>{fmtPt(percent)}</td>
                          <td className={`${tdB} ${soO}`}>{soTy(item.dungKh)}</td>
                          <td className={`${tdB} ${soO}`}>{soTy(item.thucHienDungKh1Phan)}</td>
                          <td className={`${tdB} ${soO}`}>{soTy(item.rotKh)}</td>
                          <td className={`${tdB} ${soO}`}>{soTy(item.thucHienRotKh1Phan)}</td>
                          <td className={`${tdB} ${soO}`}>{soTy(item.nhapKhoTruocKh)}</td>
                          <td className={`${tdB} ${soO}`}>{soTy(item.vuotKh)}</td>
                          <td className={`${tdB} ${soO}`}>{soTy(item.nhapKhoNgoaiKh)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className={tfoot}>
                    <tr>
                      <td className={`${tdB} left-0 !z-[3] text-center`}>TỔNG</td>
                      <td className={`${tdB} ${soO}`}>{soTy(tongTuan(b => b.plan))}</td>
                      <td className={`${tdB} ${soO}`}>{soTy(tongTuan(b => b.actualWeek))}</td>
                      <td className={`${tdB} ${soO}`}>
                        {fmtPt(tyLeKh(tongTuan(b => b.actualWeek), tongTuan(b => b.plan)))}
                      </td>
                      <td className={`${tdB} ${soO}`}>{soTy(tongTuan(b => b.dungKh))}</td>
                      <td className={`${tdB} ${soO}`}>{soTy(tongTuan(b => b.thucHienDungKh1Phan))}</td>
                      <td className={`${tdB} ${soO}`}>{soTy(tongTuan(b => b.rotKh))}</td>
                      <td className={`${tdB} ${soO}`}>{soTy(tongTuan(b => b.thucHienRotKh1Phan))}</td>
                      <td className={`${tdB} ${soO}`}>{soTy(tongTuan(b => b.nhapKhoTruocKh))}</td>
                      <td className={`${tdB} ${soO}`}>{soTy(tongTuan(b => b.vuotKh))}</td>
                      <td className={`${tdB} ${soO}`}>{soTy(tongTuan(b => b.nhapKhoNgoaiKh))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      , document.body)}
    </>
  );
};