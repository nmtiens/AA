import React from 'react';
import { Activity, Hash, DollarSign } from 'lucide-react';
import { formatNumber, formatDecimal } from '../../utils/numberParsers';

interface ProjectStatusRow {
  name: string;
  totalOrder: number;
  deployed: number;
  ticketed: number;
  inProduction: number;
  inventory: number;
  remaining: number;
  notDeployed: number;
  percentComplete: number;
}

interface ProjectSummarySectionProps {
  sectionRef: React.Ref<HTMLDivElement>;
  projectStatusSummary: ProjectStatusRow[];
  projectSummaryMetric: 'COUNT' | 'VALUE';
  setProjectSummaryMetric: (m: 'COUNT' | 'VALUE') => void;
}

export const ProjectSummarySection = ({
  sectionRef,
  projectStatusSummary,
  projectSummaryMetric,
  setProjectSummaryMetric,
}: ProjectSummarySectionProps) => {
  const formatter = projectSummaryMetric === 'COUNT' ? formatNumber : formatDecimal;

  return (
    <div ref={sectionRef} className="scroll-mt-24 w-full bg-white p-5 rounded-xl shadow-sm border border-emerald-100 flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
        <h3 className="text-base font-semibold text-slate-700 flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-600" />Tình trạng đơn hàng theo Công trình
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setProjectSummaryMetric('COUNT')}
              className={`px-2 py-1 text-[10px] font-bold rounded flex items-center gap-1 transition-all ${projectSummaryMetric === 'COUNT' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Hash size={12} /> # Số lượng hạng mục
            </button>
            <div className="w-px h-3 bg-slate-300 mx-1"></div>
            <button
              onClick={() => setProjectSummaryMetric('VALUE')}
              className={`px-2 py-1 text-[10px] font-bold rounded flex items-center gap-1 transition-all ${projectSummaryMetric === 'VALUE' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <DollarSign size={12} /> # Giá trị
            </button>
          </div>
          <span className="text-xs text-slate-500 italic hidden sm:block">
            Đơn vị: {projectSummaryMetric === 'COUNT' ? 'Hạng mục (Items)' : '1,000 VNĐ'}
          </span>
        </div>
      </div>
      {projectStatusSummary.length > 0 ? (
        <div className="overflow-auto custom-scrollbar border border-slate-200 rounded-lg max-h-[600px]">
          <table className="w-full text-xs text-right min-w-[1200px] border-separate border-spacing-0">
            <thead className="bg-emerald-100/50 text-slate-800 font-bold uppercase tracking-tight">
              <tr>
                <th className="px-3 py-3 text-left sticky left-0 top-0 bg-emerald-100 border-b border-emerald-200 z-30 min-w-[220px] shadow-sm">Tên Công Trình</th>
                <th className="px-3 py-3 border-b border-emerald-200 sticky top-0 bg-emerald-50 z-20">Tổng {projectSummaryMetric === 'VALUE' ? 'Giá Trị' : 'Số Lượng'} <br />Đơn Hàng</th>
                <th className="px-3 py-3 border-b border-emerald-200 sticky top-0 bg-emerald-50 z-20">Đã Triển Khai <br />Sản Xuất</th>
                <th className="px-3 py-3 border-b border-emerald-200 sticky top-0 bg-emerald-50 z-20">Đã Tính Phiếu</th>
                <th className="px-3 py-3 border-b border-emerald-200 sticky top-0 bg-emerald-50 z-20">Đang Sản Xuất</th>
                <th className="px-3 py-3 border-b border-emerald-200 sticky top-0 bg-emerald-50 z-20">{projectSummaryMetric === 'VALUE' ? 'Giá Trị' : 'SL'} <br />Đã Nhập Kho</th>
                <th className="px-3 py-3 border-b border-emerald-200 sticky top-0 bg-emerald-50 z-20 font-extrabold text-slate-900">{projectSummaryMetric === 'VALUE' ? 'Giá Trị' : 'SL'} Còn Lại</th>
                <th className="px-3 py-3 border-b border-emerald-200 sticky top-0 bg-emerald-50 z-20 text-slate-500">Chưa Triển Khai <br />Sản Xuất</th>
                <th className="px-3 py-3 border-b border-emerald-200 sticky top-0 bg-emerald-50 z-20 text-center min-w-[100px]">% Hoàn Thành</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-50">
              {projectStatusSummary.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-3 py-2.5 text-left font-medium text-slate-700 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">{row.name}</td>
                  <td className="px-3 py-2.5 text-slate-800">{formatter(row.totalOrder)}</td>
                  <td className="px-3 py-2.5 text-slate-600">{formatter(row.deployed)}</td>
                  <td className="px-3 py-2.5 text-slate-600">{formatter(row.ticketed)}</td>
                  <td className="px-3 py-2.5 text-slate-600">{formatter(row.inProduction)}</td>
                  <td className="px-3 py-2.5 text-indigo-700 font-medium">{formatter(row.inventory)}</td>
                  <td className="px-3 py-2.5 font-bold text-slate-900 bg-slate-50/50">{formatter(row.remaining)}</td>
                  <td className="px-3 py-2.5 text-slate-400 italic">{formatter(row.notDeployed)}</td>
                  <td className="px-2 py-2.5 text-center">
                    <div className={`px-2 py-1 rounded font-bold text-[10px] inline-block w-full text-center ${row.percentComplete >= 95 ? 'bg-green-50 text-white' : row.percentComplete >= 70 ? 'bg-green-100 text-green-700' : row.percentComplete >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                      {formatDecimal(row.percentComplete)}%
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-emerald-50 font-bold text-slate-800 border-t border-emerald-300 sticky bottom-0 z-20">
              <tr>
                <td className="px-3 py-3 text-left sticky left-0 bg-emerald-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">TỔNG CỘNG</td>
                <td className="px-3 py-3">{formatter(projectStatusSummary.reduce((a, b) => a + b.totalOrder, 0))}</td>
                <td className="px-3 py-3">{formatter(projectStatusSummary.reduce((a, b) => a + b.deployed, 0))}</td>
                <td className="px-3 py-3">{formatter(projectStatusSummary.reduce((a, b) => a + b.ticketed, 0))}</td>
                <td className="px-3 py-3">{formatter(projectStatusSummary.reduce((a, b) => a + b.inProduction, 0))}</td>
                <td className="px-3 py-3 text-indigo-800">{formatter(projectStatusSummary.reduce((a, b) => a + b.inventory, 0))}</td>
                <td className="px-3 py-3 text-slate-900">{formatter(projectStatusSummary.reduce((a, b) => a + b.remaining, 0))}</td>
                <td className="px-3 py-3 text-slate-500">{formatter(projectStatusSummary.reduce((a, b) => a + b.notDeployed, 0))}</td>
                <td className="px-3 py-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg">Không có dữ liệu phù hợp để tính toán tổng quan đơn hàng.</div>
      )}
    </div>
  );
};