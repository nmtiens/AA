import React from 'react';
import { Package, CheckSquare, Square, XCircle as CloseIcon } from 'lucide-react';
import { MaterialSummaryPivotData } from '../../types';
import { formatNumber } from '../../utils/numberParsers';

interface PivotMaterialSummarySectionProps {
  sectionRef: React.Ref<HTMLDivElement>;   // đổi từ React.RefObject<HTMLDivElement | null>
  pivotMaterialSummary: MaterialSummaryPivotData | null;
  selectedMaterialGroups: string[];
  setSelectedMaterialGroups: (groups: string[]) => void;
  toggleMaterialGroup: (group: string) => void;
  activeCongTrinhFilter: string[];
}

export const PivotMaterialSummarySection = ({
  sectionRef,
  pivotMaterialSummary,
  selectedMaterialGroups,
  setSelectedMaterialGroups,
  toggleMaterialGroup,
  activeCongTrinhFilter,
}: PivotMaterialSummarySectionProps) => (
  <div ref={sectionRef} className="scroll-mt-24 w-full bg-white p-5 rounded-xl shadow-sm border border-emerald-100 flex flex-col">
    <div className="flex justify-between items-center mb-4">
      <h3 className="text-base font-semibold text-slate-700 flex items-center gap-2">
        <Package className="w-4 h-4 text-emerald-600" />Tổng hợp Vật tư theo Nhóm (Dữ liệu Vật tư)
      </h3>
      <div className="flex items-center gap-2">
        {selectedMaterialGroups.length > 0 && (
          <button
            onClick={() => setSelectedMaterialGroups([])}
            className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded border border-red-200 flex items-center gap-1"
          >
            <CloseIcon size={12} /> Bỏ chọn ({selectedMaterialGroups.length})
          </button>
        )}
        {activeCongTrinhFilter.length > 0 && (
          <span className="text-xs font-medium px-2 py-1 bg-emerald-50 text-emerald-700 rounded border border-emerald-200">
            Đang lọc theo: {activeCongTrinhFilter.join(', ')}
          </span>
        )}
      </div>
    </div>
    {pivotMaterialSummary ? (
      <div className="overflow-auto custom-scrollbar border border-slate-200 rounded-lg max-h-[500px]">
        <table className="w-full text-xs text-right min-w-[500px] border-separate border-spacing-0">
          <thead className="bg-emerald-50 text-slate-700 font-semibold uppercase">
            <tr>
              <th className="px-3 py-2 border-b border-emerald-200 w-8 sticky top-0 bg-emerald-50 z-10"></th>
              <th className="px-3 py-2 text-left border-b border-emerald-200 text-emerald-900 sticky top-0 bg-emerald-50 z-10">Nhóm Vật Tư</th>
              <th className="px-3 py-2 border-b border-emerald-200 text-emerald-900 sticky top-0 bg-emerald-50 z-10">SL Yêu Cầu</th>
              <th className="px-3 py-2 border-b border-emerald-200 text-emerald-900 sticky top-0 bg-emerald-50 z-10">SL Đã Nhận (SAP)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-50">
            {pivotMaterialSummary.sortedGroups.map(group => {
              const isSelected = selectedMaterialGroups.includes(group);
              return (
                <tr
                  key={group}
                  className={`transition-colors cursor-pointer group ${isSelected ? 'bg-emerald-100/70 hover:bg-emerald-100' : 'hover:bg-slate-50'}`}
                  onClick={() => toggleMaterialGroup(group)}
                >
                  <td className="px-3 py-2 text-center">
                    {isSelected
                      ? <CheckSquare size={14} className="text-emerald-600 inline" />
                      : <Square size={14} className="text-slate-300 inline group-hover:text-emerald-400" />}
                  </td>
                  <td className={`px-3 py-2 text-left font-medium ${isSelected ? 'text-emerald-900' : 'text-slate-700'}`}>{group}</td>
                  <td className="px-3 py-2 text-slate-600">{formatNumber(pivotMaterialSummary.summary[group].req)}</td>
                  <td className="px-3 py-2 text-slate-600">{formatNumber(pivotMaterialSummary.summary[group].rec)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-emerald-100 font-bold text-slate-800 border-t border-emerald-300 sticky bottom-0 z-10">
            <tr>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2 text-left">Tổng Cộng</td>
              <td className="px-3 py-2">{formatNumber(pivotMaterialSummary.totalReq)}</td>
              <td className="px-3 py-2">{formatNumber(pivotMaterialSummary.totalRec)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    ) : (
      <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg">Không có dữ liệu vật tư phù hợp.</div>
    )}
  </div>
);