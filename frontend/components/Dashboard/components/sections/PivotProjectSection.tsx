import React from 'react';
import { LayoutList, CheckCircle, MinusCircle } from 'lucide-react';
import { ProjectPivotData, MetricType } from '../../types';
import { formatNumber } from '../../utils/numberParsers';
import { MetricSwitcher } from '../shared/MetricSwitcher';

interface PivotProjectSectionProps {
  sectionRef: React.Ref<HTMLDivElement>;
  pivotProjectData: ProjectPivotData | null;
  projectMetric: MetricType;
  setProjectMetric: (m: MetricType) => void;
  excludeFabrics: boolean;
  setExcludeFabrics: (v: boolean) => void;
}

export const PivotProjectSection = ({
  sectionRef,
  pivotProjectData,
  projectMetric,
  setProjectMetric,
  excludeFabrics,
  setExcludeFabrics,
}: PivotProjectSectionProps) => (
  <div ref={sectionRef} className="scroll-mt-24 w-full bg-white p-5 rounded-xl shadow-sm border border-wood-100 flex flex-col">
    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-4 gap-3">
      <h3 className="text-base font-semibold text-slate-700 flex items-center gap-2">
        <LayoutList className="w-4 h-4 text-blue-500" />Chi tiết Giá trị (Công trình x Tình trạng)
      </h3>
      <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
        <MetricSwitcher current={projectMetric} onChange={setProjectMetric} />
        <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-100">
          <button
            onClick={() => setExcludeFabrics(false)}
            className={`flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${!excludeFabrics ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
            title="Hiển thị tất cả hạng mục"
          >
            <CheckCircle size={12} /> Đủ hạng mục
          </button>
          <button
            onClick={() => setExcludeFabrics(true)}
            className={`flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${excludeFabrics ? 'bg-red-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
            title="Loại bỏ Vải, Gối khỏi thống kê"
          >
            <MinusCircle size={12} /> Trừ Vải/Gối
          </button>
        </div>
      </div>
    </div>
    {pivotProjectData ? (
      <div className="overflow-auto custom-scrollbar border border-slate-200 rounded-lg max-h-[550px]">
        <table className="w-full text-xs text-right min-w-[800px] border-separate border-spacing-0">
          <thead className="bg-blue-50/50 text-slate-700 font-semibold uppercase">
            <tr>
              <th className="px-3 py-2 text-left sticky left-0 top-0 bg-blue-100 border-b border-blue-200 z-30 min-w-[200px] shadow-[1px_1px_2px_rgba(0,0,0,0.05)]">Tên Công Trình</th>
              {pivotProjectData.uniqueStatuses.map((s: string) => (
                <th key={s} className="px-3 py-2 border-b border-blue-200 whitespace-nowrap text-blue-900 sticky top-0 bg-blue-50 z-20">{s}</th>
              ))}
              <th className="px-3 py-2 bg-blue-100 border-b border-blue-200 font-bold text-slate-800 sticky top-0 right-0 z-20">Tổng Cộng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pivotProjectData.uniqueProjects.map((p: string) => (
              <tr key={p} className="hover:bg-slate-50 transition-colors group">
                <td className="px-3 py-2 text-left font-medium text-slate-700 sticky left-0 bg-white group-hover:bg-slate-50 z-10 whitespace-nowrap border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">{p}</td>
                {pivotProjectData.uniqueStatuses.map((s: string) => {
                  const matrix = pivotProjectData.matrix || {};
                  const val = matrix[p]?.[s] || 0;
                  return (
                    <td key={s} className={`px-3 py-2 whitespace-nowrap ${val === 0 ? 'text-slate-300' : 'text-slate-600'}`}>
                      {val === 0 ? '-' : formatNumber(val, projectMetric)}
                    </td>
                  );
                })}
                <td className="px-3 py-2 font-bold text-slate-800 bg-blue-50/30">{formatNumber(pivotProjectData.rowTotals[p], projectMetric)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-blue-100 font-bold text-slate-800 border-t border-blue-300">
            <tr>
              <td className="px-3 py-2 text-left sticky left-0 bottom-0 z-20 bg-blue-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">Tổng Cộng</td>
              {pivotProjectData.uniqueStatuses.map((s: string) => (
                <td key={s} className="px-3 py-2 whitespace-nowrap">{formatNumber(pivotProjectData.colTotals[s], projectMetric)}</td>
              ))}
              <td className="px-3 py-2 text-blue-900 text-sm">{formatNumber(pivotProjectData.grandTotal, projectMetric)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    ) : (
      <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg">Không đủ dữ liệu để tạo bảng Pivot Công trình.</div>
    )}
  </div>
);