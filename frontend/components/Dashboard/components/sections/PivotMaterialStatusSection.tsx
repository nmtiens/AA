import React from 'react';
import { ListFilter, Hash, Calculator, CheckSquare, Square, XCircle as CloseIcon } from 'lucide-react';
import { MaterialStatusPivotData } from '../../types';
import { formatNumber, formatDecimal } from '../../utils/numberParsers';
import { useRowLimit, ShowMoreRows } from '../shared/ShowMoreRows';
import { khung, soO, table, tdB, tfoot, thB, thead, trong0 } from '../../../shared/bangBaoCao';

interface PivotMaterialStatusSectionProps {
  sectionRef: React.Ref<HTMLDivElement>;
  pivotMaterialStatusData: MaterialStatusPivotData | null;
  matStatusMetric: 'COUNT_PR' | 'SUM_QTY';
  setMatStatusMetric: (m: 'COUNT_PR' | 'SUM_QTY') => void;
  // Mới: dùng chung với bảng Tổng hợp Vật tư
  selectedMaterialGroups: string[];
  setSelectedMaterialGroups: (groups: string[]) => void;
  toggleMaterialGroup: (group: string) => void;
}

export const PivotMaterialStatusSection = ({
  sectionRef,
  pivotMaterialStatusData,
  matStatusMetric,
  setMatStatusMetric,
  selectedMaterialGroups,
  setSelectedMaterialGroups,
  toggleMaterialGroup,
}: PivotMaterialStatusSectionProps) => {
  // Chỉ vẽ 50 nhóm đầu; dòng Tổng cộng vẫn lấy colTotals/grandTotal của TOÀN BỘ
  const { limit, showMore, showAll } = useRowLimit();
  const totalRows = pivotMaterialStatusData?.sortedGroups.length ?? 0;
  const visibleGroups = pivotMaterialStatusData ? pivotMaterialStatusData.sortedGroups.slice(0, limit) : [];
  const so = (v: number) => trong0(v, matStatusMetric === 'SUM_QTY' ? formatDecimal : x => formatNumber(x));

  return (
  <div ref={sectionRef} className="scroll-mt-24 w-full bg-white p-5 rounded-xl shadow-sm border border-emerald-100 flex flex-col">
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
      <h3 className="text-base font-semibold text-slate-700 flex items-center gap-2">
        <ListFilter className="w-4 h-4 text-emerald-600" />Vật tư × trạng thái
      </h3>
      <div className="flex items-center gap-2">
        {selectedMaterialGroups.length > 0 && (
          <button
            onClick={() => setSelectedMaterialGroups([])}
            className="text-sm px-2 py-1 text-red-600 hover:bg-red-50 rounded border border-red-200 flex items-center gap-1"
          >
            <CloseIcon size={12} /> Bỏ chọn ({selectedMaterialGroups.length})
          </button>
        )}
        <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            onClick={() => setMatStatusMetric('COUNT_PR')}
            className={`px-2 py-1 text-sm font-bold rounded flex items-center gap-1 transition-all ${matStatusMetric === 'COUNT_PR' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Hash size={12} /> Số dòng PR
          </button>
          <div className="w-px h-3 bg-slate-300 mx-1"></div>
          <button
            onClick={() => setMatStatusMetric('SUM_QTY')}
            className={`px-2 py-1 text-sm font-bold rounded flex items-center gap-1 transition-all ${matStatusMetric === 'SUM_QTY' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Calculator size={12} /> Khối lượng
          </button>
        </div>
      </div>
    </div>
    {pivotMaterialStatusData ? (
      <div className={`${khung} max-h-[500px]`}>
        <table className={`${table} min-w-[800px]`}>
          <thead className={thead}>
            <tr>
              <th className={`${thB} sticky left-0 z-[3] w-10 min-w-10 bg-emerald-300`}></th>
              <th className={`${thB} sticky left-10 z-[3] min-w-[200px] bg-emerald-300 text-center`}>Nhóm vật tư</th>
              {pivotMaterialStatusData.uniqueStatuses.map((s: string) => (
                <th key={s} className={`${thB} whitespace-nowrap text-center`}>{s}</th>
              ))}
              <th className={`${thB} sticky right-0 z-[3] bg-emerald-300 text-center`}>Tổng</th>
            </tr>
          </thead>
          <tbody>
            {visibleGroups.map((group: string) => {
              const isSelected = selectedMaterialGroups.includes(group);
              const stickyBg = isSelected ? 'bg-amber-100' : 'bg-white group-hover:bg-amber-50';
              return (
                <tr
                  key={group}
                  className={`cursor-pointer group ${isSelected ? 'bg-amber-100' : 'hover:bg-amber-50'}`}
                  onClick={() => toggleMaterialGroup(group)}
                >
                  <td className={`${tdB} sticky left-0 z-[1] w-10 min-w-10 text-center ${stickyBg}`}>
                    {isSelected
                      ? <CheckSquare size={14} className="text-emerald-600 inline" />
                      : <Square size={14} className="text-slate-300 inline group-hover:text-emerald-400" />}
                  </td>
                  <td className={`${tdB} sticky left-10 z-[1] whitespace-nowrap font-bold ${stickyBg}`}>{group}</td>
                  {pivotMaterialStatusData.uniqueStatuses.map((s: string) => (
                    <td key={s} className={`${tdB} ${soO}`}>{so(pivotMaterialStatusData.matrix?.[group]?.[s] || 0)}</td>
                  ))}
                  <td className={`${tdB} ${soO} sticky right-0 z-[1] font-bold ${stickyBg}`}>{so(pivotMaterialStatusData.rowTotals[group])}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className={tfoot}>
            <tr>
              <td colSpan={2} className={`${tdB} left-0 !z-[3] text-center`}>TỔNG</td>
              {pivotMaterialStatusData.uniqueStatuses.map((s: string) => (
                <td key={s} className={`${tdB} ${soO}`}>{so(pivotMaterialStatusData.colTotals[s])}</td>
              ))}
              <td className={`${tdB} ${soO} right-0 !z-[3]`}>{so(pivotMaterialStatusData.grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    ) : (
      <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg">Không có dữ liệu để tạo bảng trạng thái vật tư.</div>
    )}
    {pivotMaterialStatusData && (
      <ShowMoreRows shown={visibleGroups.length} total={totalRows} onMore={showMore} onAll={showAll} />
    )}
  </div>
  );
};
