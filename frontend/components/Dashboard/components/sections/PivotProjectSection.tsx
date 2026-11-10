import React from 'react';
import { LayoutList, CheckCircle, MinusCircle } from 'lucide-react';
import { ProjectPivotData, MetricType } from '../../types';
import { formatNumber } from '../../utils/numberParsers';
import { MetricSwitcher } from '../shared/MetricSwitcher';
import { useRowLimit, ShowMoreRows } from '../shared/ShowMoreRows';
import { khung, soO, table, tdB, tfoot, thB, thead, trong0 } from '../../../shared/bangBaoCao';

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
}: PivotProjectSectionProps) => {
  // Chỉ vẽ 50 dòng đầu (đúng thứ tự sắp xếp sẵn); dòng Tổng cộng vẫn lấy colTotals/grandTotal của TOÀN BỘ
  const { limit, showMore, showAll } = useRowLimit();
  const totalRows = pivotProjectData?.uniqueProjects.length ?? 0;
  const visibleProjects = pivotProjectData ? pivotProjectData.uniqueProjects.slice(0, limit) : [];
  const so = (v: number) => trong0(v, x => formatNumber(x, projectMetric));

  return (
  <div ref={sectionRef} className="scroll-mt-24 w-full bg-white p-5 rounded-xl shadow-sm border border-wood-100 flex flex-col">
    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-4 gap-3">
      <h3 className="text-base font-semibold text-slate-700 flex items-center gap-2">
        <LayoutList className="w-4 h-4 text-blue-500" />Công trình × tình trạng{projectMetric !== 'COUNT_HEX' && ' (tỷ)'}
      </h3>
      <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
        <MetricSwitcher current={projectMetric} onChange={setProjectMetric} />
        <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-100">
          <button
            onClick={() => setExcludeFabrics(false)}
            className={`flex items-center gap-1.5 px-2 py-1 text-xs font-bold uppercase rounded-md transition-all ${!excludeFabrics ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
            title="Hiển thị tất cả hạng mục"
          >
            <CheckCircle size={12} /> Đủ hạng mục
          </button>
          <button
            onClick={() => setExcludeFabrics(true)}
            className={`flex items-center gap-1.5 px-2 py-1 text-xs font-bold uppercase rounded-md transition-all ${excludeFabrics ? 'bg-red-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
            title="Loại bỏ Vải, Gối khỏi thống kê"
          >
            <MinusCircle size={12} /> Trừ Vải/Gối
          </button>
        </div>
      </div>
    </div>
    {pivotProjectData ? (
      <div className={`${khung} max-h-[550px]`}>
        <table className={`${table} min-w-[800px]`}>
          <thead className={thead}>
            <tr>
              <th className={`${thB} sticky left-0 z-[3] min-w-[200px] bg-emerald-300 text-center`}>Công trình</th>
              {pivotProjectData.uniqueStatuses.map((s: string) => (
                <th key={s} className={`${thB} whitespace-nowrap text-center`}>{s}</th>
              ))}
              <th className={`${thB} sticky right-0 z-[3] bg-emerald-300 text-center`}>Tổng</th>
            </tr>
          </thead>
          <tbody>
            {visibleProjects.map((p: string) => (
              <tr key={p}>
                <td className={`${tdB} sticky left-0 z-[1] whitespace-nowrap bg-white font-bold`}>{p}</td>
                {pivotProjectData.uniqueStatuses.map((s: string) => (
                  <td key={s} className={`${tdB} ${soO}`}>{so(pivotProjectData.matrix?.[p]?.[s] || 0)}</td>
                ))}
                <td className={`${tdB} ${soO} sticky right-0 z-[1] bg-white font-bold`}>{so(pivotProjectData.rowTotals[p])}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className={tfoot}>
            <tr>
              <td className={`${tdB} left-0 !z-[3] text-center`}>TỔNG</td>
              {pivotProjectData.uniqueStatuses.map((s: string) => (
                <td key={s} className={`${tdB} ${soO}`}>{so(pivotProjectData.colTotals[s])}</td>
              ))}
              <td className={`${tdB} ${soO} right-0 !z-[3]`}>{so(pivotProjectData.grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    ) : (
      <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg">Không đủ dữ liệu để tạo bảng Pivot Công trình.</div>
    )}
    {pivotProjectData && (
      <ShowMoreRows shown={visibleProjects.length} total={totalRows} onMore={showMore} onAll={showAll} />
    )}
  </div>
  );
};
