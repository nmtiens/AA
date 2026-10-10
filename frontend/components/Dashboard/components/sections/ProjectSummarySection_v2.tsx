import React, { useMemo } from 'react';
import { Activity, Hash, DollarSign } from 'lucide-react';
import { formatNumber } from '../../utils/numberParsers';
import { formatTy } from '../../../../utils/money';
import { projectMatchKey } from '../../../../utils/productionMetrics';

export interface ProjectStatusRow {
  name: string;
  totalOrder: number;      // Tổng giá trị đơn hàng
  cancelled: number;       // (không còn hiển thị, giữ lại để không lỗi type ở nơi tính dữ liệu)
  afterCancel: number;     // (không còn hiển thị, giữ lại để không lỗi type ở nơi tính dữ liệu)
  inventory: number;       // Tổng giá trị đã nhập kho P022
  exported: number;        // Tổng giá trị đã xuất kho P025
  notDeployed: number;     // Còn lại - Chưa triển khai P001
  /** Còn lại - Chưa tính phiếu P002 (tách riêng khỏi "Đang trên chuyền") */
  p002?: number;
  /** Còn lại - Đang trên chuyền P012 -> P021 (không gồm P002) */
  onLine: number;
  /** Còn lại - đã ở P022 / P025 nhưng nhập kho chưa đủ trị giá đơn hàng */
  shortfall?: number;
  remaining: number;       // Còn lại - Tổng
}

export type ProjectSummaryColumn =
  | 'totalOrder'
  | 'cancelled'
  | 'afterCancel'
  | 'inventory'
  | 'exported'
  | 'inventoryAfterExport' // Tồn kho sau xuất kho = Nhập kho - Xuất kho
  | 'notDeployed'
  | 'p002'
  | 'onLine'
  | 'shortfall'
  | 'remaining';

export interface ProjectSummaryCellClick {
  /** Tên công trình của dòng được bấm; null nghĩa là dòng TỔNG CỘNG */
  projectName: string | null;
  column: ProjectSummaryColumn;
}

/** Thông tin phụ của 1 công trình (key = tên công trình viết HOA, đã trim) */
export interface ProjectMeta {
  bot: string[];
  khachHang: string[];
  khuVuc: string[];
}

interface ProjectSummarySectionProps {
  sectionRef: React.Ref<HTMLDivElement>;
  projectStatusSummary: ProjectStatusRow[];
  projectSummaryMetric: 'COUNT' | 'VALUE';
  setProjectSummaryMetric: (m: 'COUNT' | 'VALUE') => void;
  /** Gọi khi người dùng bấm vào một con số. Không truyền thì bảng chỉ để xem. */
  onCellClick?: (info: ProjectSummaryCellClick) => void;
  /** Những cột cho phép bấm. Mặc định: tất cả các cột số đang hiển thị. */
  clickableColumns?: ProjectSummaryColumn[];
  /**
   * Danh sách công trình theo đúng thứ tự ưu tiên đã setup ở trang
   * "Setup dữ liệu theo View". Có prop này thì bảng sắp xếp lại theo thứ tự đó;
   * công trình không có trong danh sách xếp xuống cuối.
   */
  priorityOrder?: string[];
  /** Thông tin BOT theo công trình (key = tên công trình viết HOA). */
  projectMeta?: Record<string, ProjectMeta>;
}

// Các cột số đang hiển thị (đã bỏ Đã Hủy + Sau Khi Hủy)
const NUMERIC_KEYS: ProjectSummaryColumn[] = [
  'totalOrder',
  'inventory',
  'exported',
  'inventoryAfterExport',
  'notDeployed',
  'p002',
  'onLine',
  'remaining',
];

// "2026-06-30" (hoặc chuỗi ISO có kèm giờ) -> "30/06/2026".
// Giá trị không phải ngày (vd tên BOT dạng chữ) thì giữ nguyên, không ép định dạng.
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/;
const formatBotDate = (value: string): string => {
  const m = ISO_DATE_RE.exec(value.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value.trim();
};

export const ProjectSummarySection_v2 = ({
  sectionRef,
  projectStatusSummary,
  projectSummaryMetric,
  setProjectSummaryMetric,
  onCellClick,
  clickableColumns = NUMERIC_KEYS,
  priorityOrder,
  projectMeta,
}: ProjectSummarySectionProps) => {
  // Giá trị đã ở đơn vị Tỷ -> 2 chữ số thập phân
  const formatter = projectSummaryMetric === 'COUNT' ? formatNumber : formatTy;
  const label = projectSummaryMetric === 'VALUE' ? 'Giá Trị' : 'Số Lượng';

  const hasPriority = !!priorityOrder && priorityOrder.length > 0;

  const metaOf = (name: string): ProjectMeta | undefined =>
    projectMeta?.[projectMatchKey(name)];

  // Sắp xếp lại theo thứ tự ưu tiên (nếu có).
  const orderedRows = useMemo(() => {
    if (!hasPriority) {
      return projectStatusSummary;
    }
    const rankMap = new Map<string, number>();
    priorityOrder!.forEach((name, idx) => { const k = projectMatchKey(name); if (!rankMap.has(k)) rankMap.set(k, idx); });

    const withRank = projectStatusSummary.map((row, originalIndex) => ({
      row,
      originalIndex,
      rank: rankMap.get(projectMatchKey(row.name)) ?? Number.POSITIVE_INFINITY,
    }));
    withRank.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.originalIndex - b.originalIndex;
    });

    return withRank.map((w) => w.row);
  }, [projectStatusSummary, priorityOrder, hasPriority]);

  // Giá trị của một cột (gồm các cột tính toán)
  const getValue = (row: ProjectStatusRow, key: ProjectSummaryColumn): number => {
    if (key === 'inventoryAfterExport') return row.inventory - row.exported;
    if (key === 'p002') return row.p002 ?? 0;
    if (key === 'shortfall') return row.shortfall ?? 0;
    return row[key];
  };

  const total = (key: ProjectSummaryColumn) =>
    projectStatusSummary.reduce((acc, row) => acc + getValue(row, key), 0);

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
  const thBase = 'px-3 text-center border-b border-r border-emerald-200 bg-emerald-50 sticky z-20';
  const tdNumeric = 'px-3 py-2.5 text-center';

  // Độ rộng cột STT (px) — offset sticky cho cột "Tên Công Trình".
  const STT_WIDTH = 48;

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
              className={`px-2 py-1 text-[0.625rem] font-bold rounded flex items-center gap-1 transition-all ${projectSummaryMetric === 'COUNT' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Hash size={12} /> # Số lượng hạng mục
            </button>
            <div className="w-px h-3 bg-slate-300 mx-1"></div>
            <button
              onClick={() => setProjectSummaryMetric('VALUE')}
              className={`px-2 py-1 text-[0.625rem] font-bold rounded flex items-center gap-1 transition-all ${projectSummaryMetric === 'VALUE' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <DollarSign size={12} /> # Giá trị
            </button>
          </div>
          <span className="text-xs text-slate-500 italic hidden sm:block">
            Đơn vị: {projectSummaryMetric === 'COUNT' ? 'Hạng mục (Items)' : 'Tỷ đồng'}
          </span>
        </div>
      </div>

      {projectStatusSummary.length > 0 ? (
        <div className="overflow-auto custom-scrollbar border border-slate-200 rounded-lg max-h-[600px]">
          <table className="w-full text-xs min-w-[1418px] border-separate border-spacing-0">
            <thead className="text-slate-800 font-bold uppercase tracking-tight">
              {/* Hàng 1: các cột đơn (rowSpan=2) + nhóm "Còn lại" (colSpan=4). Cột "Nhập kho chưa đủ P022–P025" đã bỏ
                  (luôn 0 ở các view lọc IPO Đang sản xuất); cột Tổng vẫn là toàn bộ phần còn lại */}
              <tr>
                <th
                  rowSpan={2}
                  style={{ width: STT_WIDTH, minWidth: STT_WIDTH }}
                  className="px-1 py-3 text-center sticky left-0 top-0 bg-emerald-100 border-b border-r border-emerald-200 z-30 shadow-sm"
                >
                  STT
                </th>
                <th
                  rowSpan={2}
                  style={{ left: STT_WIDTH }}
                  className={`px-3 py-3 text-left sticky top-0 bg-emerald-100 border-b border-r border-emerald-200 z-30 min-w-[220px] shadow-sm`}
                >
                  Tên Công Trình
                </th>
                <th rowSpan={2} className={`${thBase} top-0 min-w-[120px]`}>BOT Dự Án</th>
                <th rowSpan={2} className={`${thBase} top-0`}>Tổng {label} <br />Đơn Hàng</th>
                <th rowSpan={2} className={`${thBase} top-0`}>Tổng {label} <br />Đã Nhập Kho <br />P022</th>
                <th rowSpan={2} className={`${thBase} top-0`}>Tổng {label} <br />Đã Xuất Kho <br />P025</th>
                <th rowSpan={2} className={`${thBase} top-0`}>Tổng {label} <br />Tồn Kho Sau <br />Xuất Kho</th>
                <th colSpan={4} className={`${thBase} top-0 h-9 py-0 bg-emerald-100`}>
                  Tổng {label} Đơn Hàng Còn Lại
                </th>
              </tr>
              {/* Hàng 2: 4 cột con của nhóm "Còn lại" */}
              <tr>
                <th className={`${thBase} top-9 py-3`}>Chưa Triển Khai <br />P001</th>
                <th className={`${thBase} top-9 py-3`}>Chưa Tính Phiếu <br />P002</th>
                <th className={`${thBase} top-9 py-3`}>Đang Trên Chuyền <br />{'P012->P021'}</th>
                <th className={`${thBase} top-9 py-3 font-extrabold text-slate-900`}>Tổng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-50">
              {orderedRows.map((row, idx) => {
                return (
                  <tr key={idx} className="hover:brightness-95 transition-colors group">
                    {/* STT liên tục theo thứ tự đang hiển thị (đã xếp theo ưu tiên nếu có) */}
                    <td
                      style={{ width: STT_WIDTH, minWidth: STT_WIDTH }}
                      className={`px-1 py-2.5 text-center tabular-nums sticky left-0 z-10 border-r border-slate-100 bg-white text-slate-400`}
                    >
                      {idx + 1}
                    </td>
                    <td
                      style={{ left: STT_WIDTH }}
                      className={`px-3 py-2.5 text-left font-medium text-slate-700 sticky z-10 border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] bg-white`}
                    >
                      {row.name}
                    </td>
                                       <td className="px-3 py-2.5 text-center text-slate-700">
                      {metaOf(row.name)?.bot.map(formatBotDate).join(', ') || '–'}
                    </td>
                    <td className={`${tdNumeric} text-slate-800`}>{renderValue(row.totalOrder, 'totalOrder', row.name)}</td>
                    <td className={`${tdNumeric} text-indigo-700 font-medium`}>{renderValue(row.inventory, 'inventory', row.name)}</td>
                    <td className={`${tdNumeric} text-emerald-700 font-medium`}>{renderValue(row.exported, 'exported', row.name)}</td>
                    <td className={`${tdNumeric} text-amber-700 font-medium`}>{renderValue(getValue(row, 'inventoryAfterExport'), 'inventoryAfterExport', row.name)}</td>
                    <td className={`${tdNumeric} text-slate-500`}>{renderValue(row.notDeployed, 'notDeployed', row.name)}</td>
                    <td className={`${tdNumeric} text-slate-500`}>{renderValue(getValue(row, 'p002'), 'p002', row.name)}</td>
                    <td className={`${tdNumeric} text-slate-600`}>{renderValue(row.onLine, 'onLine', row.name)}</td>
                    <td className={`${tdNumeric} font-bold text-slate-900`}>{renderValue(row.remaining, 'remaining', row.name)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-emerald-50 font-bold text-slate-800 border-t border-emerald-300 sticky bottom-0 z-20">
              <tr>
                <td style={{ width: STT_WIDTH, minWidth: STT_WIDTH }} className="px-1 py-3 text-center sticky left-0 bg-emerald-50" />
                <td
                  style={{ left: STT_WIDTH }}
                  className={`px-3 py-3 text-left sticky bg-emerald-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]`}
                >
                  TỔNG CỘNG
                </td>
                <td className="px-3 py-3 bg-emerald-50" />
                <td className="px-3 py-3 text-center">{renderValue(total('totalOrder'), 'totalOrder', null)}</td>
                <td className="px-3 py-3 text-center text-indigo-800">{renderValue(total('inventory'), 'inventory', null)}</td>
                <td className="px-3 py-3 text-center text-emerald-800">{renderValue(total('exported'), 'exported', null)}</td>
                <td className="px-3 py-3 text-center text-amber-800">{renderValue(total('inventoryAfterExport'), 'inventoryAfterExport', null)}</td>
                <td className="px-3 py-3 text-center text-slate-500">{renderValue(total('notDeployed'), 'notDeployed', null)}</td>
                <td className="px-3 py-3 text-center text-slate-500">{renderValue(total('p002'), 'p002', null)}</td>
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