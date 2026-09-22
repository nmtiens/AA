import React from 'react';
import { Activity, Hash, DollarSign } from 'lucide-react';
import { formatNumber, formatDecimal } from '../../utils/numberParsers';

export interface ProjectStatusRow {
  name: string;
  totalOrder: number;      // B: Tổng giá trị đơn hàng
  cancelled: number;       // C: Tổng giá trị đã hủy
  afterCancel: number;     // D: Tổng giá trị đơn hàng sau khi hủy
  inventory: number;       // E: Tổng giá trị đã nhập kho
  exported: number;        // F: Tổng giá trị đã xuất kho
  notDeployed: number;     // G: Còn lại - Chưa triển khai P001
  onLine: number;          // H: Còn lại - Đang trên chuyền P002->P021
  remaining: number;       // I: Còn lại - Tổng (G + H)
}

export type ProjectSummaryColumn =
  | 'totalOrder'
  | 'cancelled'
  | 'afterCancel'
  | 'inventory'
  | 'exported'
  | 'notDeployed'
  | 'onLine'
  | 'remaining';

export interface ProjectSummaryCellClick {
  /** Tên công trình của dòng được bấm; null nghĩa là dòng TỔNG CỘNG */
  projectName: string | null;
  column: ProjectSummaryColumn;
}

interface ProjectSummarySectionProps {
  sectionRef: React.Ref<HTMLDivElement>;
  projectStatusSummary: ProjectStatusRow[];
  projectSummaryMetric: 'COUNT' | 'VALUE';
  setProjectSummaryMetric: (m: 'COUNT' | 'VALUE') => void;
  /** Gọi khi người dùng bấm vào một con số. Không truyền thì bảng chỉ để xem. */
  onCellClick?: (info: ProjectSummaryCellClick) => void;
  /** Những cột cho phép bấm. Mặc định: tất cả các cột số. */
  clickableColumns?: ProjectSummaryColumn[];
}

const NUMERIC_KEYS: ProjectSummaryColumn[] = [
  'totalOrder',
  'cancelled',
  'afterCancel',
  'inventory',
  'exported',
  'notDeployed',
  'onLine',
  'remaining',
];

export const ProjectSummarySection_v2 = ({
  sectionRef,
  projectStatusSummary,
  projectSummaryMetric,
  setProjectSummaryMetric,
  onCellClick,
  clickableColumns = NUMERIC_KEYS,
}: ProjectSummarySectionProps) => {
  const formatter = projectSummaryMetric === 'COUNT' ? formatNumber : formatDecimal;
  const label = projectSummaryMetric === 'VALUE' ? 'Giá Trị' : 'Số Lượng';

  const total = (key: ProjectSummaryColumn) =>
    projectStatusSummary.reduce((acc, row) => acc + row[key], 0);

  // Hiển thị số; nếu cột được phép bấm thì bọc thành nút để mở chi tiết
  const renderValue = (value: number, column: ProjectSummaryColumn, projectName: string | null) => {
    if (!onCellClick || !clickableColumns.includes(column)) return formatter(value);
    return (
      <button
        type="button"
        onClick={() => onCellClick({ projectName, column })}
        title="Bấm để xem chi tiết"
        className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-emerald-700 hover:decoration-solid focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-sm"
      >
        {formatter(value)}
      </button>
    );
  };

  // Header cell dùng chung: hàng 1 sticky top-0, hàng 2 sticky top-9 (36px = chiều cao hàng 1).
  // Canh giữa (text-center) để khớp với các cột số bên dưới đã canh giữa.
  const thBase = 'px-3 text-center border-b border-r border-emerald-200 bg-emerald-50 sticky z-20';
  // Ô số liệu dùng chung: canh giữa, khớp với tiêu đề cột.
  const tdNumeric = 'px-3 py-2.5 text-center';

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
          <table className="w-full text-xs min-w-[1300px] border-separate border-spacing-0">
            <thead className="text-slate-800 font-bold uppercase tracking-tight">
              {/* Hàng 1: các cột đơn (rowSpan=2) + tiêu đề nhóm "Còn lại" (colSpan=3) */}
              <tr>
                <th
                  rowSpan={2}
                  className="px-3 py-3 text-left sticky left-0 top-0 bg-emerald-100 border-b border-r border-emerald-200 z-30 min-w-[220px] shadow-sm"
                >
                  Tên Công Trình
                </th>
                <th rowSpan={2} className={`${thBase} top-0`}>Tổng {label} <br />Đơn Hàng</th>
                <th rowSpan={2} className={`${thBase} top-0`}>Tổng {label} <br />Đã Hủy</th>
                <th rowSpan={2} className={`${thBase} top-0`}>Tổng {label} Đơn Hàng <br />Sau Khi Hủy</th>
                <th rowSpan={2} className={`${thBase} top-0`}>Tổng {label} <br />Đã Nhập Kho <br />P022</th>
                <th rowSpan={2} className={`${thBase} top-0`}>Tổng {label} <br />Đã Xuất Kho <br />P025</th>
                <th colSpan={3} className={`${thBase} top-0 h-9 py-0 bg-emerald-100`}>
                  Tổng {label} Đơn Hàng Còn Lại
                </th>
              </tr>
              {/* Hàng 2: 3 cột con của nhóm "Còn lại" */}
              <tr>
                <th className={`${thBase} top-9 py-3`}>Chưa Triển Khai <br />P001</th>
                <th className={`${thBase} top-9 py-3`}>Đang Trên Chuyền <br />{'P002->P021'}</th>
                <th className={`${thBase} top-9 py-3 font-extrabold text-slate-900`}>Tổng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-50">
              {projectStatusSummary.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-3 py-2.5 text-left font-medium text-slate-700 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">{row.name}</td>
                  <td className={`${tdNumeric} text-slate-800`}>{renderValue(row.totalOrder, 'totalOrder', row.name)}</td>
                  <td className={`${tdNumeric} text-red-600`}>{renderValue(row.cancelled, 'cancelled', row.name)}</td>
                  <td className={`${tdNumeric} text-slate-800 font-medium`}>{renderValue(row.afterCancel, 'afterCancel', row.name)}</td>
                  <td className={`${tdNumeric} text-indigo-700 font-medium`}>{renderValue(row.inventory, 'inventory', row.name)}</td>
                  <td className={`${tdNumeric} text-emerald-700 font-medium`}>{renderValue(row.exported, 'exported', row.name)}</td>
                  <td className={`${tdNumeric} text-slate-500`}>{renderValue(row.notDeployed, 'notDeployed', row.name)}</td>
                  <td className={`${tdNumeric} text-slate-600`}>{renderValue(row.onLine, 'onLine', row.name)}</td>
                  <td className={`${tdNumeric} font-bold text-slate-900 bg-slate-50/50`}>{renderValue(row.remaining, 'remaining', row.name)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-emerald-50 font-bold text-slate-800 border-t border-emerald-300 sticky bottom-0 z-20">
              <tr>
                <td className="px-3 py-3 text-left sticky left-0 bg-emerald-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">TỔNG CỘNG</td>
                <td className="px-3 py-3 text-center">{renderValue(total('totalOrder'), 'totalOrder', null)}</td>
                <td className="px-3 py-3 text-center text-red-700">{renderValue(total('cancelled'), 'cancelled', null)}</td>
                <td className="px-3 py-3 text-center">{renderValue(total('afterCancel'), 'afterCancel', null)}</td>
                <td className="px-3 py-3 text-center text-indigo-800">{renderValue(total('inventory'), 'inventory', null)}</td>
                <td className="px-3 py-3 text-center text-emerald-800">{renderValue(total('exported'), 'exported', null)}</td>
                <td className="px-3 py-3 text-center text-slate-500">{renderValue(total('notDeployed'), 'notDeployed', null)}</td>
                <td className="px-3 py-3 text-center">{renderValue(total('onLine'), 'onLine', null)}</td>
                <td className="px-3 py-3 text-center text-slate-900">{renderValue(total('remaining'), 'remaining', null)}</td>
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