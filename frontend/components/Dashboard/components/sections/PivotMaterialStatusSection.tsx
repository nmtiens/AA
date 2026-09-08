import React from 'react';
import { ListFilter, Hash, Calculator } from 'lucide-react';
import { MaterialStatusPivotData } from '../../types';
import { formatNumber, formatDecimal } from '../../utils/numberParsers';

interface PivotMaterialStatusSectionProps {
  sectionRef: React.Ref<HTMLDivElement>;
  pivotMaterialStatusData: MaterialStatusPivotData | null;
  matStatusMetric: 'COUNT_PR' | 'SUM_QTY';
  setMatStatusMetric: (m: 'COUNT_PR' | 'SUM_QTY') => void;
}

export const PivotMaterialStatusSection = ({
  sectionRef,
  pivotMaterialStatusData,
  matStatusMetric,
  setMatStatusMetric,
}: PivotMaterialStatusSectionProps) => (
  <div ref={sectionRef} className="scroll-mt-24 w-full bg-white p-5 rounded-xl shadow-sm border border-emerald-100 flex flex-col">
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
      <h3 className="text-base font-semibold text-slate-700 flex items-center gap-2">
        <ListFilter className="w-4 h-4 text-emerald-600" />Tình trạng Vật tư (Nhóm x Trạng thái)
      </h3>
      <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
        <button
          onClick={() => setMatStatusMetric('COUNT_PR')}
          className={`px-2 py-1 text-[10px] font-bold rounded flex items-center gap-1 transition-all ${matStatusMetric === 'COUNT_PR' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Hash size={12} /> Số hạng mục PR
        </button>
        <div className="w-px h-3 bg-slate-300 mx-1"></div>
        <button
          onClick={() => setMatStatusMetric('SUM_QTY')}
          className={`px-2 py-1 text-[10px] font-bold rounded flex items-center gap-1 transition-all ${matStatusMetric === 'SUM_QTY' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Calculator size={12} /> Khối lượng Yêu cầu
        </button>
      </div>
    </div>
    {pivotMaterialStatusData ? (
      <div className="overflow-auto custom-scrollbar border border-slate-200 rounded-lg max-h-[500px]">
        <table className="w-full text-xs text-right min-w-[800px] border-separate border-spacing-0">
          <thead className="bg-emerald-50 text-slate-700 font-semibold uppercase">
            <tr>
              <th className="px-3 py-2 text-left sticky left-0 top-0 bg-emerald-100 border-b border-emerald-200 z-30 min-w-[200px] shadow-[1px_1px_2px_rgba(0,0,0,0.05)]">Nhóm Vật Tư</th>
              {pivotMaterialStatusData.uniqueStatuses.map((s: string) => (
                <th key={s} className="px-3 py-2 border-b border-emerald-200 whitespace-nowrap text-emerald-900 sticky top-0 bg-emerald-50 z-20">{s}</th>
              ))}
              <th className="px-3 py-2 bg-emerald-100 border-b border-emerald-200 font-bold text-slate-800 sticky top-0 right-0 z-20">Tổng Cộng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pivotMaterialStatusData.sortedGroups.map((group: string) => (
              <tr key={group} className="hover:bg-slate-50 transition-colors group">
                <td className="px-3 py-2 text-left font-medium text-slate-700 sticky left-0 bg-white group-hover:bg-slate-50 z-10 whitespace-nowrap border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">{group}</td>
                {pivotMaterialStatusData.uniqueStatuses.map((s: string) => {
                  const matrix = pivotMaterialStatusData.matrix || {};
                  const val = matrix[group]?.[s] || 0;
                  return (
                    <td key={s} className={`px-3 py-2 whitespace-nowrap ${val === 0 ? 'text-slate-300' : 'text-slate-600'}`}>
                      {val === 0 ? '-' : (matStatusMetric === 'SUM_QTY' ? formatDecimal(val) : formatNumber(val))}
                    </td>
                  );
                })}
                <td className="px-3 py-2 font-bold text-slate-800 bg-emerald-50/30">
                  {matStatusMetric === 'SUM_QTY' ? formatDecimal(pivotMaterialStatusData.rowTotals[group]) : formatNumber(pivotMaterialStatusData.rowTotals[group])}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-emerald-100 font-bold text-slate-800 border-t border-emerald-300">
            <tr>
              <td className="px-3 py-2 text-left sticky left-0 bottom-0 z-20 bg-emerald-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">Tổng Cộng (Toàn bộ)</td>
              {pivotMaterialStatusData.uniqueStatuses.map((s: string) => (
                <td key={s} className="px-3 py-2 whitespace-nowrap">
                  {matStatusMetric === 'SUM_QTY' ? formatDecimal(pivotMaterialStatusData.colTotals[s]) : formatNumber(pivotMaterialStatusData.colTotals[s])}
                </td>
              ))}
              <td className="px-3 py-2 text-emerald-900 text-sm">
                {matStatusMetric === 'SUM_QTY' ? formatDecimal(pivotMaterialStatusData.grandTotal) : formatNumber(pivotMaterialStatusData.grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    ) : (
      <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg">Không có dữ liệu để tạo bảng trạng thái vật tư.</div>
    )}
  </div>
);