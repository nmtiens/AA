import React from 'react';
import { Activity, Hash, DollarSign } from 'lucide-react';
import { useRowLimit, ShowMoreRows } from '../shared/ShowMoreRows';
import {
  BOP_GROUP, KHO_COT, fmtGiaTriBop, tenCotCongDoan, type BangCongTrinhBop, type Kho, type KhoCot,
} from '../../../Construction/core/bopPivot';

interface ProjectSummarySectionProps {
  sectionRef: React.Ref<HTMLDivElement>;
  /** Cấu trúc bảng BOP của cửa sổ công trình (Construction/core/bopPivot): mỗi dòng 1 công trình */
  bangCongTrinh: BangCongTrinhBop | null;
  projectSummaryMetric: 'COUNT' | 'VALUE';
  setProjectSummaryMetric: (m: 'COUNT' | 'VALUE') => void;
}

// Ô viền như bảng BOP; cột STT / Tên công trình dính trái
const thX = 'border-b border-r border-emerald-200 px-2.5 py-2 font-bold';
const tdX = 'border-b border-r border-slate-100 px-2.5 py-2';
const KHO_TEN: Record<KhoCot, string> = { nk: 'P022 · Đã nhập', xk: 'P025 · Đã xuất', ton: 'Tồn kho', chenh: 'Chênh' };

export const ProjectSummarySection = ({
  sectionRef,
  bangCongTrinh,
  projectSummaryMetric,
  setProjectSummaryMetric,
}: ProjectSummarySectionProps) => {
  const bang = bangCongTrinh;
  // Số theo kiểu của bảng đang có (máy chủ có thể trả bảng của nút cũ trong lúc chờ tính lại)
  const metric = bang?.metric ?? (projectSummaryMetric === 'COUNT' ? 'count' : 'remain');
  const isCount = metric === 'count';
  const fmtV = (v: number) => fmtGiaTriBop(v, metric);
  // Chỉ vẽ 50 dòng đầu; dòng TỔNG CỘNG vẫn cộng trên toàn bộ công trình
  const { limit, showMore, showAll } = useRowLimit();
  const rows = bang?.rows ?? [];
  const visibleRows = rows.slice(0, limit);

  const khoTitle: Record<KhoCot, string> = isCount
    ? {
        nk: 'Số hạng mục đã có nhập kho (Đã nhập = Đã xuất + Tồn kho + Chênh)',
        xk: 'Số hạng mục hết hàng và đã xuất đủ',
        ton: 'Số hạng mục còn hàng trong kho',
        chenh: 'Số hạng mục đã hết hàng trong kho mà chưa ghi xuất đủ',
      }
    : {
        nk: 'Thành tiền nhập kho lũy kế (chặn ≤ trị giá từng hạng mục)',
        xk: 'Thành tiền xuất kho lũy kế (chặn ≤ đã nhập từng hạng mục)',
        ton: 'Tồn kho hiện tại (cột dữ liệu), chặn ≤ đã nhập − đã xuất',
        chenh: 'Đã nhập − đã xuất − tồn kho: hàng đã nhập nhưng không thấy xuất cũng không còn trong kho (giao thẳng / chưa ghi phiếu xuất)',
      };
  const stageTitle = (st: string, nhom: string) => (isCount
    ? `${nhom} · ${st}: số hạng mục chưa nhập kho đủ đang ở công đoạn này`
    : `${nhom} · ${st}: giá trị CÒN LẠI chưa nhập kho (trị giá − đã nhập) của hạng mục đang ở công đoạn này`);

  const khoCells = (k: Kho | undefined, nen: string) => KHO_COT.map((f, idx) => {
    const v = k?.[f] ?? 0;
    const mau = f === 'ton' ? 'font-semibold text-slate-900' : f === 'chenh' ? (isCount || v >= 5 ? 'text-orange-600' : 'text-slate-400') : '';
    return (
      <td key={f} className={`${tdX} whitespace-nowrap tabular-nums ${nen} ${idx === 0 ? 'border-l-2 border-l-slate-300' : ''} ${v ? mau : ''}`}>
        {v ? fmtV(v) : ''}
      </td>
    );
  });

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
              title="Số hạng mục: công đoạn = hạng mục chưa nhập kho đủ; Kho = hạng mục theo cột kho"
              className={`px-2 py-1 text-[0.625rem] font-bold rounded flex items-center gap-1 transition-all ${projectSummaryMetric === 'COUNT' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Hash size={12} /> # Số lượng hạng mục
            </button>
            <div className="w-px h-3 bg-slate-300 mx-1"></div>
            <button
              onClick={() => setProjectSummaryMetric('VALUE')}
              title="Giá trị (tỷ): công đoạn = phần CÒN LẠI chưa nhập kho; Kho = thành tiền lũy kế"
              className={`px-2 py-1 text-[0.625rem] font-bold rounded flex items-center gap-1 transition-all ${projectSummaryMetric === 'VALUE' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <DollarSign size={12} /> # Giá trị
            </button>
          </div>
          <span className="text-xs text-slate-500 italic hidden sm:block">
            Đơn vị: {isCount ? 'Hạng mục (Items)' : 'Tỷ đồng (công đoạn: còn lại chưa nhập kho)'}
          </span>
        </div>
      </div>
      {bang && rows.length > 0 ? (
        <div className="overflow-auto custom-scrollbar border border-slate-200 rounded-lg max-h-[600px]">
          <table className="w-full text-xs text-right min-w-[1200px] border-separate border-spacing-0">
            <thead className="sticky top-0 z-30 bg-emerald-100 text-slate-800">
              <tr>
                <th rowSpan={2} className={`${thX} w-12 min-w-[48px] px-1 text-center sticky left-0 z-10 bg-emerald-100`}>STT</th>
                <th rowSpan={2} className={`${thX} text-left sticky left-12 z-10 bg-emerald-100 min-w-[220px] shadow-sm uppercase tracking-tight`}>Tên Công Trình</th>
                <th rowSpan={2} className={`${thX} text-center font-extrabold text-slate-900 bg-emerald-50`}
                  title={isCount ? 'Tổng số hạng mục của công trình (không hủy), kể cả đã nhập kho đủ' : 'Tổng trị giá đơn hàng của công trình (không hủy), kể cả phần đã nhập kho'}>
                  {isCount ? <>Tổng<br />hạng mục</> : <>Tổng giá trị<br />đơn hàng</>}
                </th>
                {bang.groups.map((g, gi) => (
                  <th key={gi} colSpan={g.stages.length} className={`${thX} text-center text-[0.6875rem] font-semibold uppercase tracking-wide`}>
                    {g.bucket ? (<><span className={`mr-1.5 inline-block h-2 w-2 rounded-sm ${BOP_GROUP[g.bucket].dot}`} />{BOP_GROUP[g.bucket].label}</>) : 'Khác'}
                  </th>
                ))}
                <th rowSpan={2} className={`${thX} text-center font-extrabold text-slate-900`}
                  title={isCount ? 'Cộng số hạng mục chưa nhập kho đủ (các cột công đoạn)' : 'Tổng giá trị đơn hàng còn lại chưa nhập kho (trị giá − đã nhập) = cộng các cột công đoạn'}>
                  {isCount ? <>Tổng hạng mục<br />còn lại</> : <>Tổng giá trị<br />còn lại</>}
                </th>
                <th colSpan={4} className={`${thX} border-l-2 border-l-slate-300 bg-emerald-50 text-center text-[0.6875rem] font-semibold uppercase tracking-wide text-emerald-800`}
                  title="Lũy kế các hạng mục không hủy của công trình theo bộ lọc trang, kể cả hạng mục đã nhập kho đủ">
                  Kho (lũy kế)
                </th>
              </tr>
              <tr>
                {bang.groups.map(g => g.stages.map(st => (
                  <th key={st} className={`${thX} whitespace-nowrap font-semibold text-slate-700`} title={stageTitle(st, g.bucket ? BOP_GROUP[g.bucket].label : 'Khác')}>
                    {tenCotCongDoan(st)}
                  </th>
                )))}
                {KHO_COT.map((f, idx) => (
                  <th key={f} className={`${thX} whitespace-nowrap bg-emerald-50 font-semibold text-slate-700 ${idx === 0 ? 'border-l-2 border-l-slate-300' : ''}`} title={khoTitle[f]}>
                    {KHO_TEN[f]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, idx) => (
                <tr key={row.name} className="hover:bg-slate-50 transition-colors group">
                  <td className={`${tdX} w-12 min-w-[48px] px-1 text-center tabular-nums text-slate-400 sticky left-0 bg-white group-hover:bg-slate-50 z-10`}>{idx + 1}</td>
                  <td className={`${tdX} text-left font-medium text-slate-700 sticky left-12 bg-white group-hover:bg-slate-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]`}>{row.name}</td>
                  <td className={`${tdX} tabular-nums font-semibold text-slate-800 bg-emerald-50/40`}>{row.donHang ? fmtV(row.donHang) : ''}</td>
                  {bang.stages.map(st => {
                    const v = row.cells[st];
                    return <td key={st} className={`${tdX} tabular-nums text-slate-700`}>{v ? fmtV(v) : ''}</td>;
                  })}
                  <td className={`${tdX} tabular-nums font-bold text-slate-900 bg-slate-50/50`}>{row.total ? fmtV(row.total) : ''}</td>
                  {khoCells(row.kho, 'bg-emerald-50/30')}
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-20 bg-yellow-300 font-bold text-red-600">
              <tr>
                <td className={`${tdX} w-12 min-w-[48px] px-1 sticky left-0 bg-yellow-300`} />
                <td className={`${tdX} text-left sticky left-12 bg-yellow-300 text-slate-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]`}>TỔNG CỘNG</td>
                <td className={`${tdX} tabular-nums`}>{fmtV(bang.donHangTot)}</td>
                {bang.stages.map(st => (
                  <td key={st} className={`${tdX} tabular-nums`}>{fmtV(bang.colTot[st] ?? 0)}</td>
                ))}
                <td className={`${tdX} tabular-nums`}>{fmtV(bang.grand)}</td>
                {khoCells(bang.khoTot, '')}
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg">Không có dữ liệu phù hợp để tính toán tổng quan đơn hàng.</div>
      )}
      <ShowMoreRows shown={visibleRows.length} total={rows.length} onMore={showMore} onAll={showAll} />
    </div>
  );
};
