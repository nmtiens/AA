import React, { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import type { MaterialRow } from './HexMaterialModal';
import { isMaterialMissing } from '../../../../utils/productionMetrics';
import { fmtInt } from '../../../../utils/format';
import * as bang from '../../../shared/bangBaoCao';
import { ngayChuoi } from '../../core/chiTietHex';

// Gom các dòng vật tư theo số PR: 1 PR mua cho bao nhiêu hex / hạng mục.
export interface PrGroup {
  prKey: string;          // số PR dạng chuỗi ('' = chưa có số PR)
  ngayPr: string | null;  // ngày PR sớm nhất trong nhóm
  nguoiYeuCau: string[];
  lines: number;          // số dòng vật tư (trong bộ lọc)
  missingLines: number;   // số dòng còn thiếu (SL còn lại > 0)
  hexes: string[];        // hex trong bộ lọc mà PR này mua cho
  hangMuc: string[];
  nhomVt: string[];
  maNhaMay: string[];     // mã nhà máy khớp các hex trong bộ lọc
  itemNotes: string[];    // Item note PR (không trùng)
  statusCounts: [string, number][];
  prTotalHexes: number | null; // tổng số hex của PR trên toàn bộ vật tư
  prTotalLines: number | null;
}

const prKeyOf = (v: number | null) => (v === null || v === undefined ? '' : String(Math.round(Number(v))));

export const buildPrGroups = (rows: MaterialRow[], hangMucByHex: Record<string, string>): PrGroup[] => {
  const map = new Map<string, {
    rows: MaterialRow[]; hexes: Set<string>; status: Map<string, number>;
  }>();
  rows.forEach(r => {
    const key = prKeyOf(r.so_pr);
    let g = map.get(key);
    if (!g) { g = { rows: [], hexes: new Set(), status: new Map() }; map.set(key, g); }
    g.rows.push(r);
    r.hexes.forEach(h => g!.hexes.add(h));
    const st = r.trang_thai || '(Trống)';
    g.status.set(st, (g.status.get(st) || 0) + 1);
  });
  const uniq = (list: (string | null | undefined)[]) =>
    Array.from(new Set(list.filter((x): x is string => !!x))).sort((a, b) => a.localeCompare(b, 'vi'));
  return [...map.entries()].map(([prKey, g]) => {
    const hexes = [...g.hexes].sort();
    const dates = g.rows.map(r => r.ngay_pr).filter((d): d is string => !!d).sort();
    return {
      prKey,
      ngayPr: dates[0] ?? null,
      nguoiYeuCau: uniq(g.rows.map(r => r.nguoi_yeu_cau)),
      lines: g.rows.length,
      missingLines: g.rows.filter(isMaterialMissing).length,
      hexes,
      hangMuc: uniq(hexes.map(h => hangMucByHex[h])),
      nhomVt: uniq(g.rows.map(r => r.nhom_vt)),
      maNhaMay: uniq(g.rows.flatMap(r => r.matched_codes)),
      itemNotes: uniq(g.rows.map(r => r.item_note_pr?.trim())),
      statusCounts: [...g.status.entries()].sort((a, b) => a[0].localeCompare(b[0], 'vi')),
      prTotalHexes: g.rows[0]?.pr_total_hexes ?? null,
      prTotalLines: g.rows[0]?.pr_total_lines ?? null,
    };
  });
};

type PrSortKey = 'prKey' | 'ngayPr' | 'hexCount' | 'prTotalHexes' | 'lines' | 'missingLines' | 'hangMucCount';

const COLS: { key: PrSortKey | 'status' | 'nhomVt' | 'hangMuc' | 'hexList' | 'maNhaMay' | 'itemNotes'; label: string; width: number; num?: boolean }[] = [
  { key: 'prKey', label: 'Số PR', width: 115 },
  { key: 'ngayPr', label: 'Ngày PR', width: 90 },
  { key: 'hexCount', label: 'Số hex (trong bộ lọc)', width: 100, num: true },
  { key: 'prTotalHexes', label: 'Tổng hex của PR', width: 90, num: true },
  { key: 'hangMucCount', label: 'Số hạng mục', width: 85, num: true },
  { key: 'lines', label: 'Dòng VT', width: 80, num: true },
  { key: 'missingLines', label: 'Dòng còn thiếu', width: 85, num: true },
  { key: 'status', label: 'Trạng thái', width: 170 },
  { key: 'nhomVt', label: 'Nhóm VT', width: 160 },
  { key: 'hangMuc', label: 'Hạng mục', width: 260 },
  { key: 'hexList', label: 'Mã Hex', width: 110 },
  { key: 'maNhaMay', label: 'Mã nhà máy', width: 125 },
  { key: 'itemNotes', label: 'Item note PR', width: 280 },
];

const COLLAPSE_LIMIT = 3;

export const MaterialPrTable = ({
  rows, hangMucByHex, onOpenPr, onOpenPrHexes,
}: {
  rows: MaterialRow[];
  hangMucByHex: Record<string, string>;
  /** Bấm số PR -> xem các dòng vật tư của PR đó */
  onOpenPr: (prKey: string) => void;
  /** Bấm "Tổng hex của PR" -> xem PR mua cho những hex nào (toàn bộ dữ liệu) */
  onOpenPrHexes: (prKey: string) => void;
}) => {
  const groups = useMemo(() => buildPrGroups(rows, hangMucByHex), [rows, hangMucByHex]);
  const [sort, setSort] = useState<{ key: PrSortKey; dir: 'asc' | 'desc' }>({ key: 'hexCount', dir: 'desc' });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const sorted = useMemo(() => {
    const val = (g: PrGroup): number | string => {
      switch (sort.key) {
        case 'prKey': return g.prKey;
        case 'ngayPr': return g.ngayPr ? new Date(g.ngayPr).getTime() : 0;
        case 'hexCount': return g.hexes.length;
        case 'prTotalHexes': return g.prTotalHexes ?? 0;
        case 'hangMucCount': return g.hangMuc.length;
        case 'lines': return g.lines;
        case 'missingLines': return g.missingLines;
      }
    };
    const mul = sort.dir === 'asc' ? 1 : -1;
    return [...groups].sort((a, b) => {
      const va = val(a); const vb = val(b);
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * mul;
    });
  }, [groups, sort]);

  const toggleSort = (key: PrSortKey) =>
    setSort(prev => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));

  const toggleExpanded = (k: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  const collapsible = (g: PrGroup, list: string[]) => {
    if (list.length === 0) return null;
    if (list.length <= COLLAPSE_LIMIT) return list.join('\n');
    const open = expanded.has(g.prKey);
    return (
      <>
        {(open ? list : list.slice(0, COLLAPSE_LIMIT)).join('\n')}
        <button
          type="button"
          onClick={() => toggleExpanded(g.prKey)}
          className="mt-0.5 block text-[0.6875rem] font-semibold text-amber-700 hover:underline"
        >
          {open ? 'Thu gọn ▴' : `+${list.length - COLLAPSE_LIMIT} nữa ▾`}
        </button>
      </>
    );
  };

  const tableWidth = 48 + COLS.reduce((s, c) => s + c.width, 0);

  return (
    <div className={`${bang.khung} mt-3 h-full`}>
    <table className={bang.table} style={{ width: tableWidth, tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: 48 }} />
        {COLS.map(c => <col key={c.key} style={{ width: c.width }} />)}
      </colgroup>
      <thead className={bang.thead}>
        <tr>
          <th className={bang.thC}>STT</th>
          {COLS.map(c => {
            const sortable = !['status', 'nhomVt', 'hangMuc', 'hexList', 'maNhaMay', 'itemNotes'].includes(c.key);
            return (
              <th
                key={c.key}
                onClick={sortable ? () => toggleSort(c.key as PrSortKey) : undefined}
                className={`${bang.thB} ${c.num ? 'text-center' : 'text-left'} ${sortable ? 'cursor-pointer select-none hover:bg-emerald-400' : ''}`}
              >
                <span className="inline-flex items-center gap-1">
                  {c.label}
                  {sortable && (sort.key === c.key
                    ? (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
                    : <ChevronsUpDown size={12} className="text-slate-600" />)}
                </span>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {sorted.map((g, i) => (
          <tr key={g.prKey || 'none'} className="hover:bg-slate-50">
            <td className={`${bang.tdSo} text-slate-500`}>{i + 1}</td>
            <td className={bang.tdB}>
              {g.prKey ? (
                <button
                  type="button"
                  onClick={() => onOpenPr(g.prKey)}
                  title="Xem các dòng vật tư của PR này"
                  className="font-semibold text-amber-700 hover:underline"
                >
                  {g.prKey}
                </button>
              ) : <span className="italic text-slate-400">(Chưa có số PR)</span>}
              {g.nguoiYeuCau.length > 0 && (
                <div className="mt-0.5 text-[0.625rem] text-slate-400">{g.nguoiYeuCau.join(', ')}</div>
              )}
            </td>
            <td className={bang.tdB}>{ngayChuoi(g.ngayPr)}</td>
            <td className={`${bang.tdSo} font-bold`}>{bang.trong0(g.hexes.length, fmtInt)}</td>
            <td className={bang.tdSo} title="Tổng số hex PR này mua cho, trên toàn bộ vật tư. Bấm để xem">
              {g.prKey && g.prTotalHexes !== null ? (
                <button
                  type="button"
                  onClick={() => onOpenPrHexes(g.prKey)}
                  className={`${bang.soBam} font-semibold text-amber-700 hover:text-amber-900`}
                >
                  {fmtInt(g.prTotalHexes)}
                  {g.prTotalHexes > g.hexes.length && (
                    <div className="text-[0.625rem] font-normal">+{fmtInt(g.prTotalHexes - g.hexes.length)} ngoài bộ lọc</div>
                  )}
                </button>
              ) : bang.trong0(g.prTotalHexes ?? 0, fmtInt)}
            </td>
            <td className={bang.tdSo}>{bang.trong0(g.hangMuc.length, fmtInt)}</td>
            <td className={bang.tdSo}>
              {fmtInt(g.lines)}
              {g.prTotalLines !== null && g.prTotalLines > g.lines && (
                <span className="text-slate-400"> / {fmtInt(g.prTotalLines)}</span>
              )}
            </td>
            <td className={`${bang.tdSo} ${g.missingLines > 0 ? 'font-semibold text-amber-600' : ''}`}>
              {bang.trong0(g.missingLines, fmtInt)}
            </td>
            <td className={`${bang.tdB} whitespace-pre-line`}>
              {g.statusCounts.map(([s, n]) => `${s}: ${fmtInt(n)}`).join('\n')}
            </td>
            <td className={`${bang.tdB} whitespace-pre-line break-words`}>{g.nhomVt.join('\n')}</td>
            <td className={`${bang.tdB} whitespace-pre-line break-words`}>{collapsible(g, g.hangMuc)}</td>
            <td className={`${bang.tdB} whitespace-pre-line`}>{collapsible(g, g.hexes)}</td>
            <td className={`${bang.tdB} whitespace-pre-line`}>{collapsible(g, g.maNhaMay)}</td>
            <td className={`${bang.tdB} whitespace-pre-line break-words`}>{collapsible(g, g.itemNotes)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot className={bang.tfoot}>
        <tr>
          <td className={bang.tdSo}>TỔNG</td>
          <td className={bang.tdB} colSpan={2}>{fmtInt(groups.length)} PR</td>
          <td className={bang.tdSo}>{bang.trong0(new Set(groups.flatMap(g => g.hexes)).size, fmtInt)}</td>
          <td className={bang.tdB} />
          <td className={bang.tdSo}>{bang.trong0(new Set(groups.flatMap(g => g.hangMuc)).size, fmtInt)}</td>
          <td className={bang.tdSo}>{bang.trong0(groups.reduce((a, g) => a + g.lines, 0), fmtInt)}</td>
          <td className={bang.tdSo}>{bang.trong0(groups.reduce((a, g) => a + g.missingLines, 0), fmtInt)}</td>
          <td className={bang.tdB} colSpan={6} />
        </tr>
      </tfoot>
    </table>
    </div>
  );
};

/** Dữ liệu CSV cho chế độ xem theo PR */
export const prGroupsToCsvRows = (groups: PrGroup[]) =>
  groups.map((g, i) => ({
    STT: i + 1,
    'Số PR': g.prKey || '(Chưa có số PR)',
    'Ngày PR': ngayChuoi(g.ngayPr),
    'Người yêu cầu': g.nguoiYeuCau.join(', '),
    'Số hex (trong bộ lọc)': g.hexes.length,
    'Tổng hex của PR': g.prTotalHexes ?? '',
    'Số hạng mục': g.hangMuc.length,
    'Dòng VT (trong bộ lọc)': g.lines,
    'Tổng dòng VT của PR': g.prTotalLines ?? '',
    'Dòng còn thiếu': g.missingLines,
    'Trạng thái': g.statusCounts.map(([s, n]) => `${s}: ${n}`).join('; '),
    'Nhóm VT': g.nhomVt.join('; '),
    'Hạng mục': g.hangMuc.join('; '),
    'Mã Hex': g.hexes.join(', '),
    'Mã nhà máy': g.maNhaMay.join(', '),
    'Item note PR': g.itemNotes.join('; '),
  }));
