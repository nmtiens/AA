import React, { useState } from 'react';
import { Activity, Hash, DollarSign } from 'lucide-react';
import { useRowLimit, ShowMoreRows } from '../shared/ShowMoreRows';
import {
  BOP_GROUP, KHO_COT, fmtGiaTriBop, tenCotCongDoan, type BangCongTrinhBop, type Kho, type KhoCot,
} from '../../../Construction/core/bopPivot';
import { hexOBangCongTrinh, type KhoaBangCongTrinh, type OBangCongTrinh } from '../../core/tongQuanSanXuat';
import { useMoDanhSachHex } from '../Dashboards/DanhSachHex';
import type { DataRow } from '../../../../types';
import { khung, soBam, soO, table, tdB, tfoot, thB, thead } from '../../../shared/bangBaoCao';

interface ProjectSummarySectionProps {
  sectionRef: React.Ref<HTMLDivElement>;
  /** Cấu trúc bảng BOP của cửa sổ công trình (Construction/core/bopPivot): mỗi dòng 1 công trình */
  bangCongTrinh: BangCongTrinhBop | null;
  projectSummaryMetric: 'COUNT' | 'VALUE';
  setProjectSummaryMetric: (m: 'COUNT' | 'VALUE') => void;
  /** Bảng sản xuất đã lọc (cùng nguồn của bảng) + khoá cột: có thì bấm số mở danh sách hạng mục */
  nguon?: { rows: DataRow[]; khoa: KhoaBangCongTrinh & { hexKey?: string } };
}

const KHO_TEN: Record<KhoCot, string> = { nk: 'Đã nhập P022', xk: 'Đã xuất P025', ton: 'Tồn kho', chenh: 'Chênh', xv: 'Xuất vượt nhập' };

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
          className={`${soBam} hover:text-blue-700 ${cls}`}>{fmtV(v)}</button>
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
        nk: 'Số hạng mục đã có nhập kho (Đã nhập + Xuất vượt nhập = Đã xuất + Tồn + Chênh)',
        xk: 'Số hạng mục hết hàng và đã xuất đủ',
        ton: 'Số hạng mục còn hàng trong kho',
        chenh: 'Số hạng mục đã hết hàng trong kho mà chưa ghi xuất đủ',
        xv: 'Số hạng mục có xuất vượt đã nhập',
      }
    : {
        nk: 'Thành tiền nhập kho lũy kế (chặn ≤ trị giá từng hạng mục)',
        xk: 'Thành tiền xuất kho lũy kế, số gốc',
        ton: 'Tồn kho hiện tại (cột dữ liệu), chặn ≤ đã nhập − đã xuất',
        chenh: 'Đã nhập − đã xuất − tồn kho, không âm',
        xv: 'Phần xuất kho vượt đã nhập, theo từng hạng mục',
      };
  const stageTitle = (st: string, nhom: string) => (isCount
    ? `${nhom} · ${st}: số hạng mục chưa nhập kho đủ đang ở công đoạn này`
    : `${nhom} · ${st}: giá trị CÒN LẠI chưa nhập kho (trị giá − đã nhập) của hạng mục đang ở công đoạn này`);

  // Chênh, Xuất vượt nhập ẩn mặc định; bấm + ở cột Tồn kho để hiện
  const [moKho, setMoKho] = useState(false);
  const khoHien = moKho ? KHO_COT : KHO_COT.filter(f => f !== 'chenh' && f !== 'xv');
  const khoCells = (k: Kho | undefined, ct: string | null) => khoHien.map((f, idx) => {
    const v = k?.[f] ?? 0;
    const mau = ct === null ? '' : f === 'chenh' || f === 'xv' ? (isCount || v >= 5 ? 'text-orange-600' : 'text-slate-600') : f === 'ton' ? 'font-semibold' : '';
    return (
      <td key={f} className={`${tdB} ${soO} ${idx === 0 ? 'border-l-2 border-l-slate-400' : ''} ${v ? mau : ''}`}>
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
        <div className={`${khung} max-h-[600px]`}>
          <table className={`${table} ${cot.length > 6 ? 'min-w-[1200px]' : 'min-w-[900px]'}`}>
            <thead className={thead}>
              {/* 3 hàng tiêu đề: [Tổng giá trị đơn hàng còn lại] bao các nhóm công đoạn + Tổng; nhóm đang tách thì hàng 3 là từng P */}
              <tr>
                <th rowSpan={3} className={`${thB} sticky left-0 z-[3] w-12 min-w-[48px] bg-emerald-300 !px-1 text-center`}>STT</th>
                <th rowSpan={3} className={`${thB} sticky left-12 z-[3] min-w-[220px] bg-emerald-300 text-center`}>Công trình</th>
                <th rowSpan={3} className={`${thB} text-center`}
                  title={isCount ? 'Tổng số hạng mục của công trình (không hủy), kể cả đã nhập kho đủ' : 'Tổng trị giá đơn hàng của công trình (không hủy), kể cả phần đã nhập kho'}>
                  {isCount ? <>Tổng<br />hạng mục</> : <>Tổng giá trị<br />đơn hàng</>}
                </th>
                <th colSpan={cot.length + 1} className={`${thB} text-center`}
                  title={isCount ? 'Hạng mục chưa nhập kho đủ, theo công đoạn hiện tại' : 'Giá trị còn lại chưa nhập kho (trị giá − đã nhập), theo công đoạn hiện tại'}>
                  {isCount ? 'Tổng hạng mục còn lại' : 'Tổng giá trị đơn hàng còn lại'}
                </th>
                <th colSpan={khoHien.length} rowSpan={2} className={`${thB} border-l-2 border-l-slate-400 text-center`}
                  title="Lũy kế các hạng mục không hủy của công trình theo bộ lọc trang, kể cả hạng mục đã nhập kho đủ">
                  Kho (lũy kế)
                </th>
              </tr>
              <tr>
                {groups.map((g, gi) => {
                  const mo = moNhom.has(gi);
                  // Chưa triển khai (P001) / Chưa tính phiếu (P002): 1 công đoạn => không bung / gộp
                  const coTach = g.bucket !== 'notDeployed' && g.bucket !== 'p002';
                  return (
                    <th key={gi} colSpan={mo ? g.stages.length : 1} rowSpan={mo ? 1 : 2}
                      className={`${thB} text-center text-sm ${coTach ? 'cursor-pointer select-none hover:bg-emerald-400' : ''}`}
                      onClick={coTach ? () => doiNhom(gi) : undefined} title={!coTach ? undefined : mo ? 'Bấm để gộp lại 1 cột' : `Bấm để tách từng công đoạn (${g.stages.map(tenCotCongDoan).join(', ')})`}>
                      {g.bucket && <span className={`mr-1.5 inline-block h-2 w-2 rounded-sm ${BOP_GROUP[g.bucket].dot}`} />}
                      {tenNhom(g.bucket)}
                      {!mo && <><br /><span className="font-semibold text-slate-700">{dayP(g.stages)}</span></>}
                      {coTach && <span className="ml-1 font-bold text-emerald-800">{mo ? '−' : '+'}</span>}
                    </th>
                  );
                })}
                <th rowSpan={2} className={`${thB} text-center`}
                  title={isCount ? 'Cộng số hạng mục chưa nhập kho đủ (các cột công đoạn)' : 'Tổng giá trị đơn hàng còn lại chưa nhập kho (trị giá − đã nhập) = cộng các cột công đoạn'}>
                  Tổng
                </th>
              </tr>
              <tr>
                {groups.map((g, gi) => (moNhom.has(gi) ? g.stages.map(st => (
                  <th key={st} className={`${thB} whitespace-nowrap text-center`} title={stageTitle(st, tenNhom(g.bucket))}>
                    {tenCotCongDoan(st)}
                  </th>
                )) : null))}
                {khoHien.map((f, idx) => (
                  <th key={f} className={`${thB} text-center leading-tight ${idx === 0 ? 'border-l-2 border-l-slate-400' : ''}`} title={khoTitle[f]}>
                    {KHO_TEN[f]}
                    {f === 'ton' && (
                      <button type="button" onClick={() => setMoKho(v => !v)} aria-expanded={moKho}
                        title={moKho ? 'Ẩn cột Chênh, Xuất vượt nhập' : 'Hiện cột Chênh, Xuất vượt nhập'}
                        className="ml-1 font-bold text-emerald-800 hover:text-emerald-900">{moKho ? '−' : '+'}</button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, idx) => (
                <tr key={row.name}>
                  <td className={`${tdB} sticky left-0 z-[1] w-12 min-w-[48px] bg-white !px-1 text-center tabular-nums text-slate-500`}>{idx + 1}</td>
                  <td className={`${tdB} sticky left-12 z-[1] bg-white font-bold`}>{row.name}</td>
                  <td className={`${tdB} ${soO} font-semibold`}><So v={row.donHang} ct={row.name} o={{ donHang: true }} ten="Tổng đơn hàng" /></td>
                  {cot.map(c => {
                    const v = cong(row.cells, c.stages);
                    return <td key={c.key} className={`${tdB} ${soO}`}><So v={v} ct={row.name} o={{ stages: c.stages }} ten={`Còn lại · ${dayP(c.stages)}`} /></td>;
                  })}
                  <td className={`${tdB} ${soO} font-bold`}><So v={row.total} ct={row.name} o={{ stages: bang.stages }} ten="Còn lại · Tổng" /></td>
                  {khoCells(row.kho, row.name)}
                </tr>
              ))}
            </tbody>
            <tfoot className={tfoot}>
              <tr>
                <td colSpan={2} className={`${tdB} left-0 !z-[3] text-center`}>TỔNG</td>
                <td className={`${tdB} ${soO}`}><So v={bang.donHangTot} ct={null} o={{ donHang: true }} ten="Tổng đơn hàng" /></td>
                {cot.map(c => (
                  <td key={c.key} className={`${tdB} ${soO}`}><So v={cong(bang.colTot, c.stages)} ct={null} o={{ stages: c.stages }} ten={`Còn lại · ${dayP(c.stages)}`} /></td>
                ))}
                <td className={`${tdB} ${soO}`}><So v={bang.grand} ct={null} o={{ stages: bang.stages }} ten="Còn lại · Tổng" /></td>
                {khoCells(bang.khoTot, null)}
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
