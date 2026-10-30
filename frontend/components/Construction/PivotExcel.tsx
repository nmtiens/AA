import React from 'react';
import { pivotM2, TRONG_M2 } from './core/bopM2';
import { fmtInt } from '../../utils/format';

// ============================================================================
// Bảng pivot kiểu Excel dùng chung cho tab BOT / BOM của cửa sổ công trình: tiêu đề xanh, kẻ ô, dòng TỔNG vàng
// chữ đỏ, ô lọc (page field), bấm số => danh sách dòng nguồn ("Show Details" của Excel).
// ============================================================================

const thP = 'border border-slate-300 px-4 py-2.5 font-bold';
const tdP = 'border border-slate-300 px-4 py-2.5';
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
  if (p.tong === 0) return <p className="text-xs text-slate-400">Không có dữ liệu.</p>;
  const so = (n: number | undefined, o: NonNullable<ChonO>, cls = '') => (
    <td onClick={n ? () => onChon(cungO(chon, o) ? null : o) : undefined} title={n ? 'Bấm để xem chi tiết' : undefined}
      className={`${tdP} text-right tabular-nums ${n ? 'cursor-pointer hover:bg-sky-100 hover:underline' : ''} ${cungO(chon, o) ? '!bg-sky-200 font-bold' : ''} ${cls}`}>
      {n ? fmtInt(n) : ''}
    </td>
  );
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-emerald-400/80 text-slate-900">
          <tr>
            <th className={`${thP} w-px whitespace-nowrap text-center`}>{cotDong}</th>
            {p.cols.map(m => <th key={m} className={`${thP} whitespace-nowrap text-center`}>{nhanCot(m)}</th>)}
            <th className={`${thP} text-center`}>TỔNG</th>
          </tr>
        </thead>
        <tbody>
          {p.keys.map(k => {
            const r = p.rows.get(k)!;
            return (
              <tr key={k}>
                <td className={`${tdP} whitespace-nowrap`}>{k}</td>
                {p.cols.map(m => <React.Fragment key={m}>{so(r.cells[m], { k, m })}</React.Fragment>)}
                {so(r.total, { k })}
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-yellow-300 font-bold text-red-600">
          <tr>
            <td className={`${tdP} text-center`}>TỔNG</td>
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
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold text-slate-700">{tieuDe} · {fmtInt(ds.length)} dòng</span>
        <button type="button" onClick={onDong} className="rounded-full border border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-100">Đóng ✕</button>
      </div>
      <div className="max-h-[45vh] overflow-auto">
        <table className="text-xs">
          <thead className="sticky top-0 bg-slate-100 text-slate-700">
            <tr>{cot.map(([t]) => <th key={t} className={`${thP} whitespace-nowrap text-left`}>{t}</th>)}</tr>
          </thead>
          <tbody>
            {ds.map((x, i) => (
              <tr key={i} className="align-top hover:bg-slate-50">
                {cot.map(([t, f]) => (
                  <td key={t} className={`${tdP} max-w-[22rem] whitespace-pre-line`}>
                    {t === 'HEX' && onHex && f(x)
                      ? <button type="button" onClick={() => onHex(f(x))} title="Xem chi tiết hạng mục" className="font-medium text-blue-700 hover:underline">{f(x)}</button>
                      : f(x)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
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
  <div className="flex items-center text-sm">
    <span className="border border-slate-300 bg-emerald-400/80 px-4 py-2 font-bold text-slate-900">{nhan}</span>
    <select value={gia} onChange={e => onDoi(e.target.value)} className="border border-l-0 border-slate-300 bg-sky-50 px-3 py-2 text-slate-800">
      <option value={TAT_CA}>{TAT_CA}</option>
      {ds.map(v => <option key={v} value={v}>{v}</option>)}
    </select>
  </div>
);

