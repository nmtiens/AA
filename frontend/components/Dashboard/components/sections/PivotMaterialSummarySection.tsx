import React from 'react';
import { Package, CheckSquare, Square, XCircle as CloseIcon } from 'lucide-react';
import { MaterialSummaryPivotData } from '../../types';
import { formatNumber } from '../../utils/numberParsers';
import { khung, soO, table, tdB, tfoot, thB, thead, trong0 } from '../../../shared/bangBaoCao';

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
      <div className={`${khung} max-h-[500px]`}>
        <table className={`${table} min-w-[500px]`}>
          <thead className={thead}>
            <tr>
              <th className={`${thB} w-8`}></th>
              <th className={`${thB} text-center`}>Nhóm vật tư</th>
              <th className={`${thB} text-center`}>SL yêu cầu</th>
              <th className={`${thB} text-center`}>SL đã nhận (SAP)</th>
            </tr>
          </thead>
          <tbody>
            {pivotMaterialSummary.sortedGroups.map(group => {
              const isSelected = selectedMaterialGroups.includes(group);
              return (
                <tr
                  key={group}
                  className={`cursor-pointer group ${isSelected ? 'bg-amber-100' : 'hover:bg-amber-50'}`}
                  onClick={() => toggleMaterialGroup(group)}
                >
                  <td className={`${tdB} text-center`}>
                    {isSelected
                      ? <CheckSquare size={14} className="text-emerald-600 inline" />
                      : <Square size={14} className="text-slate-300 inline group-hover:text-emerald-400" />}
                  </td>
                  <td className={`${tdB} font-bold`}>{group}</td>
                  <td className={`${tdB} ${soO}`}>{trong0(pivotMaterialSummary.summary[group].req, x => formatNumber(x))}</td>
                  <td className={`${tdB} ${soO}`}>{trong0(pivotMaterialSummary.summary[group].rec, x => formatNumber(x))}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className={tfoot}>
            <tr>
              <td colSpan={2} className={`${tdB} text-center`}>TỔNG</td>
              <td className={`${tdB} ${soO}`}>{trong0(pivotMaterialSummary.totalReq, x => formatNumber(x))}</td>
              <td className={`${tdB} ${soO}`}>{trong0(pivotMaterialSummary.totalRec, x => formatNumber(x))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    ) : (
      <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg">Không có dữ liệu vật tư phù hợp.</div>
    )}
  </div>
);