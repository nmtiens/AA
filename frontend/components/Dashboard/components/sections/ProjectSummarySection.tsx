import React, { useState } from 'react';
import { Activity, Hash, DollarSign } from 'lucide-react';
import { useRowLimit, ShowMoreRows } from '../shared/ShowMoreRows';
import {
  BOP_GROUP, KHO_COT, fmtGiaTriBop, tenCotCongDoan, type BangCongTrinhBop, type Kho, type KhoCot,
} from '../../../Construction/core/bopPivot';
import { hexOBangCongTrinh, type KhoaBangCongTrinh, type OBangCongTrinh } from '../../core/tongQuanSanXuat';
import { useMoDanhSachHex } from '../Dashboards/DanhSachHex';
import type { DataRow } from '../../../../types';

interface ProjectSummarySectionProps {
  sectionRef: React.Ref<HTMLDivElement>;
  /** Cấu trúc bảng BOP của cửa sổ công trình (Construction/core/bopPivot): mỗi dòng 1 công trình */
  bangCongTrinh: BangCongTrinhBop | null;
  projectSummaryMetric: 'COUNT' | 'VALUE';
  setProjectSummaryMetric: (m: 'COUNT' | 'VALUE') => void;
  /** Bảng sản xuất đã lọc (cùng nguồn của bảng) + khoá cột: có thì bấm số mở danh sách hạng mục */
  nguon?: { rows: DataRow[]; khoa: KhoaBangCongTrinh & { hexKey?: string } };
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
  nguon,
}: ProjectSummarySectionProps) => {
  const moDs = useMoDanhSachHex();
  // Bấm 1 số => danh sách hạng mục (HEX) làm nên số đó; chưa có bảng sản xuất thì DanhSachHex báo đang tải
  const moO = (ct: string | null, o: OBangCongTrinh, ten: string) => {
    if (!moDs) return;
    const hexes = nguon ? hexOBangCongTrinh(nguon.rows, nguon.khoa, projectSummaryMetric, ct, o) : [];
    moDs(`${ct ?? 'Tất cả công trình'} · ${ten}`, { hexes, ngoaiSanXuat: [], cotGiaTri: '' });
  };
  const bam = !!moDs;
  // Ô số bấm được (gạch chân chấm như các bảng khác)
  const So = ({ v, ct, o, ten, cls = '' }: { v: number; ct: string | null; o: OBangCongTrinh; ten: string; cls?: string }) =>
    !v ? null : bam
      ? <button type="button" onClick={() => moO(ct, o, ten)} title="Bấm để xem danh sách hạng mục"
          className={`tabular-nums underline decoration-dotted decoration-slate-400 underline-offset-2 hover:text-blue-700 ${cls}`}>{fmtV(v)}</button>
      : <>{fmtV(v)}</>;
  const bang = bangCongTrinh;
  // Số theo kiểu của bảng đang có (máy chủ có thể trả bảng của nút cũ trong lúc chờ tính lại)
  const metric = bang?.metric ?? (projectSummaryMetric === 'COUNT' ? 'count' : 'remain');
  const isCount = metric === 'count';
  const fmtV = (v: number) => fmtGiaTriBop(v, metric);
  // Chỉ vẽ 50 dòng đầu; dòng TỔNG CỘNG vẫn cộng trên toàn bộ công trình
  const { limit, showMore, showAll } = useRowLimit();
  const rows = bang?.rows ?? [];
  const visibleRows = rows.slice(0, limit);
  // Mặc định mỗi nhóm công đoạn (Chưa triển khai P001 · Chưa tính phiếu P002 · Đang trên chuyền P012→P021 …) là 1 cột
  // cộng gộp; bấm tên nhóm mới tách ra từng P
  const [moNhom, setMoNhom] = useState<Set<number>>(new Set());
  const doiNhom = (gi: number) => setMoNhom(m => { const n = new Set(m); if (n.has(gi)) n.delete(gi); else n.add(gi); return n; });
  const groups = bang?.groups ?? [];
  const cot = groups.flatMap((g, gi) => (moNhom.has(gi) ? g.stages.map(st => ({ key: st, stages: [st] })) : [{ key: `g${gi}`, stages: g.stages }]));
  const cong = (o: Record<string, number> | undefined, stages: string[]) => stages.reduce((a, st) => a + (o?.[st] ?? 0), 0);
  const tenNhom = (b: (typeof groups)[number]['bucket']) => (b ? BOP_GROUP[b].label : 'Khác');
  const dayP = (st: string[]) => (st.length === 1 ? tenCotCongDoan(st[0]) : `${tenCotCongDoan(st[0])}→${tenCotCongDoan(st[st.length - 1])}`);

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

  const khoCells = (k: Kho | undefined, nen: string, ct: string | null) => KHO_COT.map((f, idx) => {
    const v = k?.[f] ?? 0;
    const mau = f === 'ton' ? 'font-semibold text-slate-900' : f === 'chenh' ? (isCount || v >= 5 ? 'text-orange-600' : 'text-slate-600') : '';
    return (
      <td key={f} className={`${tdX} whitespace-nowrap tabular-nums ${nen} ${idx === 0 ? 'border-l-2 border-l-slate-300' : ''} ${v ? mau : ''}`}>
        <So v={v} ct={ct} o={{ kho: f }} ten={`Kho · ${KHO_TEN[f]}`} />
      </td>
    );
  });

  return (
    <div ref={sectionRef} className="scroll-mt-24 w-full bg-white p-5 rounded-xl shadow-sm border border-emerald-100 flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
        <h3 className="text-base font-semibold text-slate-700 flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-600" />Đơn hàng theo công trình{!isCount && ' (tỷ)'}
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setProjectSummaryMetric('COUNT')}
              title="Số hạng mục: công đoạn = hạng mục chưa nhập kho đủ; Kho = hạng mục theo cột kho"
              className={`px-2 py-1 text-sm font-bold rounded flex items-center gap-1 transition-all ${projectSummaryMetric === 'COUNT' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Hash size={14} /> Số hạng mục
            </button>
            <div className="w-px h-3 bg-slate-300 mx-1"></div>
            <button
              onClick={() => setProjectSummaryMetric('VALUE')}
              title="Giá trị (tỷ): công đoạn = phần CÒN LẠI chưa nhập kho; Kho = thành tiền lũy kế"
              className={`px-2 py-1 text-sm font-bold rounded flex items-center gap-1 transition-all ${projectSummaryMetric === 'VALUE' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <DollarSign size={14} /> Giá trị
            </button>
          </div>
        </div>
      </div>
      {bang && rows.length > 0 ? (
        <div className="overflow-auto custom-scrollbar border border-slate-200 rounded-lg max-h-[600px]">
          <table className={`w-full text-sm text-right ${cot.length > 6 ? 'min-w-[1200px]' : 'min-w-[900px]'} border-separate border-spacing-0`}>
            <thead className="sticky top-0 z-30 bg-emerald-100 text-slate-800">
              {/* 3 hàng tiêu đề: [Tổng giá trị đơn hàng còn lại] bao các nhóm công đoạn + Tổng; nhóm đang tách thì hàng 3 là từng P */}
              <tr>
                <th rowSpan={3} className={`${thX} w-12 min-w-[48px] px-1 text-center sticky left-0 z-10 bg-emerald-100`}>STT</th>
                <th rowSpan={3} className={`${thX} text-left sticky left-12 z-10 bg-emerald-100 min-w-[220px] shadow-sm uppercase tracking-tight`}>Tên Công Trình</th>
                <th rowSpan={3} className={`${thX} text-center font-extrabold text-slate-900 bg-emerald-50`}
                  title={isCount ? 'Tổng số hạng mục của công trình (không hủy), kể cả đã nhập kho đủ' : 'Tổng trị giá đơn hàng của công trình (không hủy), kể cả phần đã nhập kho'}>
                  {isCount ? <>Tổng<br />hạng mục</> : <>Tổng giá trị<br />đơn hàng</>}
                </th>
                <th colSpan={cot.length + 1} className={`${thX} text-center text-sm font-extrabold uppercase tracking-wide text-slate-900`}
                  title={isCount ? 'Hạng mục chưa nhập kho đủ, theo công đoạn hiện tại' : 'Giá trị còn lại chưa nhập kho (trị giá − đã nhập), theo công đoạn hiện tại'}>
                  {isCount ? 'Tổng hạng mục còn lại' : 'Tổng giá trị đơn hàng còn lại'}
                </th>
                <th colSpan={4} rowSpan={2} className={`${thX} border-l-2 border-l-slate-300 bg-emerald-50 text-center text-xs font-bold uppercase tracking-wide text-emerald-800`}
                  title="Lũy kế các hạng mục không hủy của công trình theo bộ lọc trang, kể cả hạng mục đã nhập kho đủ">
                  Kho (lũy kế)
                </th>
              </tr>
              <tr>
                {groups.map((g, gi) => {
                  const mo = moNhom.has(gi);
                  return (
                    <th key={gi} colSpan={mo ? g.stages.length : 1} rowSpan={mo ? 1 : 2}
                      className={`${thX} cursor-pointer select-none text-center text-xs font-bold uppercase tracking-wide hover:bg-emerald-200`}
                      onClick={() => doiNhom(gi)} title={mo ? 'Bấm để gộp lại 1 cột' : `Bấm để tách từng công đoạn (${g.stages.map(tenCotCongDoan).join(', ')})`}>
                      {g.bucket && <span className={`mr-1.5 inline-block h-2 w-2 rounded-sm ${BOP_GROUP[g.bucket].dot}`} />}
                      {tenNhom(g.bucket)}
                      {!mo && <><br /><span className="font-semibold normal-case text-slate-600">{dayP(g.stages)}</span></>}
                      <span className="ml-1 font-bold text-emerald-700">{mo ? '−' : '+'}</span>
                    </th>
                  );
                })}
                <th rowSpan={2} className={`${thX} text-center font-extrabold text-slate-900`}
                  title={isCount ? 'Cộng số hạng mục chưa nhập kho đủ (các cột công đoạn)' : 'Tổng giá trị đơn hàng còn lại chưa nhập kho (trị giá − đã nhập) = cộng các cột công đoạn'}>
                  Tổng
                </th>
              </tr>
              <tr>
                {groups.map((g, gi) => (moNhom.has(gi) ? g.stages.map(st => (
                  <th key={st} className={`${thX} whitespace-nowrap font-semibold text-slate-700`} title={stageTitle(st, tenNhom(g.bucket))}>
                    {tenCotCongDoan(st)}
                  </th>
                )) : null))}
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
                  <td className={`${tdX} w-12 min-w-[48px] px-1 text-center tabular-nums text-slate-500 sticky left-0 bg-white group-hover:bg-slate-50 z-10`}>{idx + 1}</td>
                  <td className={`${tdX} text-left font-medium text-slate-700 sticky left-12 bg-white group-hover:bg-slate-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]`}>{row.name}</td>
                  <td className={`${tdX} tabular-nums font-semibold text-slate-800 bg-emerald-50/40`}><So v={row.donHang} ct={row.name} o={{ donHang: true }} ten="Tổng đơn hàng" /></td>
                  {cot.map(c => {
                    const v = cong(row.cells, c.stages);
                    return <td key={c.key} className={`${tdX} tabular-nums ${c.stages.length > 1 ? 'font-semibold text-slate-800' : 'text-slate-700'}`}><So v={v} ct={row.name} o={{ stages: c.stages }} ten={`Còn lại · ${dayP(c.stages)}`} /></td>;
                  })}
                  <td className={`${tdX} tabular-nums font-bold text-slate-900 bg-slate-50/50`}><So v={row.total} ct={row.name} o={{ stages: bang.stages }} ten="Còn lại · Tổng" /></td>
                  {khoCells(row.kho, 'bg-emerald-50/30', row.name)}
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-20 bg-yellow-300 font-bold text-red-600">
              <tr>
                <td className={`${tdX} w-12 min-w-[48px] px-1 sticky left-0 bg-yellow-300`} />
                <td className={`${tdX} text-left sticky left-12 bg-yellow-300 text-slate-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]`}>TỔNG CỘNG</td>
                <td className={`${tdX} tabular-nums`}><So v={bang.donHangTot} ct={null} o={{ donHang: true }} ten="Tổng đơn hàng" /></td>
                {cot.map(c => (
                  <td key={c.key} className={`${tdX} tabular-nums`}><So v={cong(bang.colTot, c.stages)} ct={null} o={{ stages: c.stages }} ten={`Còn lại · ${dayP(c.stages)}`} /></td>
                ))}
                <td className={`${tdX} tabular-nums`}><So v={bang.grand} ct={null} o={{ stages: bang.stages }} ten="Còn lại · Tổng" /></td>
                {khoCells(bang.khoTot, '', null)}
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
