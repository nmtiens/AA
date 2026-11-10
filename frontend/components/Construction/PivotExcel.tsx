import React from 'react';
import { pivotM2, TRONG_M2 } from './core/bopM2';
import { fmtInt } from '../../utils/format';
import * as bang from '../shared/bangBaoCao';

// ============================================================================
// Bảng pivot kiểu Excel dùng chung cho tab BOT / BOM của cửa sổ công trình: tiêu đề xanh, kẻ ô, dòng TỔNG vàng
// chữ đỏ, ô lọc (page field), bấm số => danh sách dòng nguồn ("Show Details" của Excel).
// ============================================================================

const { tdB } = bang;
// Bảng Pivot: cùng mẫu bảng tab BOT (BangCayBot)
export const TAT_CA = '(All)';

/** Ô đang xem chi tiết: k = dòng, m = cột (thiếu = tổng của dòng / cột) */
export type ChonO = { k?: string; m?: string } | null;
const cungO = (a: ChonO, b: ChonO) => !!a && !!b && a.k === b.k && a.m === b.m;

/** Pivot giống Excel: tiêu đề cột dòng + các cột giá trị + TỔNG; dòng TỔNG cuối. Bấm số => xem chi tiết */
export function Pivot({ cotDong, p, chon, onChon, nhanCot = m => m }: {
  cotDong: string; p: ReturnType<typeof pivotM2>; chon: ChonO; onChon: (o: ChonO) => void;
  /** Chữ hiện trên tiêu đề cột (vd khoá ngày YYYY-MM-DD => dd/mm/yyyy) */
  nhanCot?: (m: string) => string;
}) {
  if (p.tong === 0) return <p className="text-sm text-slate-500">Không có dữ liệu.</p>;
  const so = (n: number | undefined, o: NonNullable<ChonO>, cls = '') => (
    <td onClick={n ? () => onChon(cungO(chon, o) ? null : o) : undefined} title={n ? 'Bấm để xem chi tiết' : undefined}
      className={`${bang.tdSo} ${n ? 'cursor-pointer hover:bg-amber-50' : ''} ${cungO(chon, o) ? '!bg-amber-100 font-semibold' : ''} ${cls}`}>
      {n ? <span className={bang.soBam}>{fmtInt(n)}</span> : ''}
    </td>
  );
  return (
    <div className={`${bang.khung} max-h-[70vh]`}>
      <table className={bang.table}>
        <thead className={bang.thead}>
          <tr>
            <th className={`${bang.thC} sticky left-0 z-20 w-px whitespace-nowrap bg-emerald-300`}>{cotDong}</th>
            {p.cols.map(m => <th key={m} className={`${bang.thC} whitespace-nowrap`}>{nhanCot(m)}</th>)}
            <th className={bang.thC}>TỔNG</th>
          </tr>
        </thead>
        <tbody>
          {p.keys.map(k => {
            const r = p.rows.get(k)!;
            return (
              <tr key={k}>
                <td className={`${tdB} sticky left-0 z-[1] whitespace-nowrap bg-white font-bold`}>{k}</td>
                {p.cols.map(m => <React.Fragment key={m}>{so(r.cells[m], { k, m })}</React.Fragment>)}
                {so(r.total, { k }, 'font-bold')}
              </tr>
            );
          })}
        </tbody>
        <tfoot className={bang.tfoot}>
          <tr>
            <td className={`${tdB} left-0 !z-[3] text-center`}>TỔNG</td>
            {p.cols.map(m => <React.Fragment key={m}>{so(p.colTot[m], { m })}</React.Fragment>)}
            {so(p.tong, {})}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Bảng chi tiết (dòng nguồn) của ô đang chọn */
export function ChiTiet<T>({ tieuDe, ds, cot, onDong, onHex }: {
  tieuDe: string; ds: T[]; cot: [string, (x: T) => string][]; onDong: () => void;
  /** Có => ô cột "HEX" bấm được, mở cửa sổ chi tiết hạng mục */
  onHex?: (hex: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold text-slate-700">{tieuDe}</span>
        <button type="button" onClick={onDong} className="rounded-full border border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-100">Đóng ✕</button>
      </div>
      <div className={`${bang.khung} max-h-[45vh]`}>
        <table className={bang.table}>
          <thead className={bang.thead}>
            <tr>
              <th className={`${bang.thC} w-14`}>STT</th>
              {cot.map(([t]) => <th key={t} className={`${bang.thC} whitespace-nowrap`}>{t}</th>)}
            </tr>
          </thead>
          <tbody>
            {ds.map((x, i) => (
              <tr key={i} className="align-top hover:bg-slate-50">
                <td className={bang.tdSo}>{fmtInt(i + 1)}</td>
                {cot.map(([t, f]) => (
                  <td key={t} className={`${tdB} max-w-[22rem] whitespace-pre-line`}>
                    {t === 'HEX' && onHex && f(x)
                      ? <button type="button" onClick={() => onHex(f(x))} title="Xem chi tiết hạng mục" className="font-medium text-blue-700 hover:underline">{f(x)}</button>
                      : f(x)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {ds.length > 0 && (
            <tfoot className={bang.tfoot}>
              <tr>
                <td className={`${tdB} text-center`}>TỔNG</td>
                <td colSpan={cot.length} className={tdB}>{fmtInt(ds.length)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
export const khopO = <T,>(o: ChonO, dong: (x: T) => string, cotF: (x: T) => string) => (x: T) =>
  !!o && (o.k === undefined || (dong(x) || TRONG_M2) === o.k) && (o.m === undefined || (cotF(x) || TRONG_M2) === o.m);
export const tenO = (o: ChonO) => (o ? [o.k ?? 'Tất cả dòng', o.m ?? 'tất cả cột'].join(' × ') : '');

/** Ô lọc (page field) như pivot Excel */
export const Loc = ({ nhan, gia, ds, onDoi }: { nhan: string; gia: string; ds: string[]; onDoi: (v: string) => void }) => (
  <div className="flex items-center text-[0.9375rem] font-medium text-slate-900">
    <span className="border border-slate-300 bg-emerald-300 px-3 py-1.5 font-bold">{nhan}</span>
    <select value={gia} onChange={e => onDoi(e.target.value)} className="border border-l-0 border-slate-300 bg-white px-2 py-1.5">
      <option value={TAT_CA}>{TAT_CA}</option>
      {ds.map(v => <option key={v} value={v}>{v}</option>)}
    </select>
  </div>
);

