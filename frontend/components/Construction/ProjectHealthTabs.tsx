import React, { useMemo, useState } from 'react';
import { Search, Package, AlertTriangle } from 'lucide-react';
import type { RemainBucket } from '../Dashboard/hooks/usePivotTables';
import type { VuongMacItem } from '../../services/vuongMacService';
import {
  materialLineState, isMaterialPending, parsePlanDate, dwellBucket, DWELL_STUCK, DWELL_NONE, type DwellKey,
  type DeadlineSource, type MaterialLineState, type MaterialLineFields,
} from '../../utils/productionMetrics';
import { formatTrieuAsTy } from '../../utils/money';

// ============================================================================
// Tầng 2 của "Tổng quan công trình": 3 tab chi tiết BOT · BOP · BOM.
// Nhận dữ liệu đã chuẩn hoá từ ProjectHealthModal (cùng 1 định nghĩa "còn lại").
// ============================================================================

export interface HexInfo {
  hex: string;
  hangMuc: string;
  stage: string | null;
  status: string;              // cột Tình trạng (tinh_trang)
  area: string;                // khu vực sản xuất (xuong_chinh)
  dwell: string | null;        // thời gian ở công đoạn hiện tại (so_ngay_cd_hien_tai)
  bucket: RemainBucket | null; // null = đã nhập kho đủ
  total: number;               // triệu đồng
  inv: number;                 // đã nhập kho (triệu, đã chặn không vượt trị giá)
  remain: number;              // triệu đồng
  deadline: Date | null;       // KH nhập kho tuần → KH nhập kho tháng → ngày cần giao
  deadlineSource: DeadlineSource | null;
  khnkTuan: Date | null;       // ngay_khnk_tuan (để hiển thị riêng)
  khnkThang: Date | null;      // ngay_khnk_thang (để hiển thị riêng)
  canGiao: Date | null;        // ngay_can_giao (để hiển thị riêng)
  overdue: boolean;
  dueSoon: boolean;
}

export interface MaterialLine extends MaterialLineFields {
  hexes: string[];
}

const DAY = 86_400_000;
const fmtInt = (n: number) => n.toLocaleString('vi-VN');
// Tỷ đồng: luôn 2 chữ số thập phân — thống nhất với Báo cáo tiến độ
const fmtTy = (trieu: number) => formatTrieuAsTy(trieu);
const fmtDate = (d: Date | null) =>
  d ? d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const th = 'px-3 py-2 font-medium';
const td = 'px-3 py-2';

const Chip = ({ active, onClick, children, tone = 'slate' }: {
  active: boolean; onClick: () => void; children: React.ReactNode; tone?: 'slate' | 'red' | 'amber' | 'emerald';
}) => {
  const on = { slate: 'bg-slate-800 text-white', red: 'bg-red-600 text-white', amber: 'bg-amber-500 text-white', emerald: 'bg-emerald-600 text-white' }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${active ? on : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
    >
      {children}
    </button>
  );
};

const SearchBox = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
  <div className="relative w-full max-w-xs">
    <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs focus:border-slate-400 focus:outline-none"
    />
  </div>
);

// Mốc thời gian để sắp: không có ngày xếp cuối
const timeOf = (d: Date | null | undefined) => d?.getTime() ?? Number.POSITIVE_INFINITY;

const SortPicker = <K extends string>({ value, onChange, options }: {
  value: K; onChange: (k: K) => void; options: [K, string][];
}) => (
  <div className="flex items-center gap-1 text-[0.6875rem] text-slate-500">
    Sắp:
    {options.map(([k, label]) => (
      <button
        key={k}
        type="button"
        onClick={() => onChange(k)}
        className={`rounded-md px-2 py-0.5 font-medium ${value === k ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
      >
        {label}
      </button>
    ))}
  </div>
);

const matchQ = (i: HexInfo, q: string) =>
  !q || i.hex.includes(q) || i.hangMuc.toLowerCase().includes(q) || (i.stage ?? '').toLowerCase().includes(q);

// ============================================================================
// BOT — KH nhập kho tuần → KH nhập kho tháng → ngày cần giao
// ============================================================================
type BotGroup = 'overdue' | 'd14' | 'd30' | 'later' | 'none';
const BOT_GROUPS: { key: BotGroup; label: string; tone: 'red' | 'amber' | 'slate' }[] = [
  { key: 'overdue', label: 'Quá hạn', tone: 'red' },
  { key: 'd14', label: '≤ 14 ngày', tone: 'amber' },
  { key: 'd30', label: '15–30 ngày', tone: 'amber' },
  { key: 'later', label: 'Sau 30 ngày', tone: 'slate' },
  { key: 'none', label: 'Chưa có ngày', tone: 'slate' },
];

export const BotTab = ({ items, today, openIssues, onHexClick }: {
  items: HexInfo[]; today: number; openIssues: Record<string, number> | null; onHexClick?: (hex: string) => void;
}) => {
  const [group, setGroup] = useState<BotGroup | 'all'>('all');
  const [month, setMonth] = useState<string | null>(null); // 'YYYY-MM' hoặc '~' (chưa có ngày)
  const [q, setQ] = useState('');

  const open = useMemo(() => items.filter(i => i.bucket), [items]);
  const monthOf = (i: HexInfo) =>
    i.deadline ? `${i.deadline.getFullYear()}-${String(i.deadline.getMonth() + 1).padStart(2, '0')}` : '~';
  const monthLabel = (k: string) => (k === '~' ? 'Chưa có ngày' : `${k.slice(5)}/${k.slice(0, 4)}`);
  const groupOf = (i: HexInfo): BotGroup => {
    if (!i.deadline) return 'none';
    const days = Math.floor((i.deadline.getTime() - today) / DAY);
    if (days < 0) return 'overdue';
    if (days <= 14) return 'd14';
    if (days <= 30) return 'd30';
    return 'later';
  };
  const counts = useMemo(() => {
    const c: Record<BotGroup, { n: number; remain: number }> = {
      overdue: { n: 0, remain: 0 }, d14: { n: 0, remain: 0 }, d30: { n: 0, remain: 0 }, later: { n: 0, remain: 0 }, none: { n: 0, remain: 0 },
    };
    open.forEach(i => { const g = groupOf(i); c[g].n++; c[g].remain += i.remain; });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, today]);

  // Tổng theo tháng kế hoạch (trị giá / đã nhập / còn lại) — mọi hạng mục, kể cả đã nhập đủ
  const byMonth = useMemo(() => {
    const m = new Map<string, { key: string; n: number; total: number; inv: number; remain: number; overdue: number }>();
    items.forEach(i => {
      const key = monthOf(i);
      const e = m.get(key) ?? { key, n: 0, total: 0, inv: 0, remain: 0, overdue: 0 };
      e.n++; e.total += i.total; e.inv += i.inv; e.remain += i.remain; if (i.overdue) e.overdue++;
      m.set(key, e);
    });
    return [...m.values()].sort((a, b) => (a.key === '~' ? 1 : b.key === '~' ? -1 : a.key.localeCompare(b.key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return open
      .filter(i => (group === 'all' || groupOf(i) === group) && (month === null || monthOf(i) === month) && matchQ(i, ql))
      .sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity) || b.remain - a.remain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group, month, q, today]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {BOT_GROUPS.map(g => (
          <button
            key={g.key}
            type="button"
            onClick={() => setGroup(group === g.key ? 'all' : g.key)}
            className={`rounded-lg border px-3 py-2 text-left transition ${group === g.key ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200 hover:border-slate-400'}`}
          >
            <p className="text-[0.6875rem] text-slate-500">{g.label}</p>
            <p className={`text-xl font-semibold tabular-nums ${g.tone === 'red' && counts[g.key].n ? 'text-red-600' : g.tone === 'amber' && counts[g.key].n ? 'text-amber-600' : 'text-slate-900'}`}>
              {fmtInt(counts[g.key].n)}
            </p>
            <p className="text-[0.625rem] text-slate-400">{fmtTy(counts[g.key].remain)} tỷ chưa nhập kho</p>
          </button>
        ))}
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-700">
          Theo tháng kế hoạch <span className="font-normal text-slate-500">· KH nhập kho tuần → tháng → ngày cần giao · bấm 1 tháng (hoặc số quá hạn) để lọc danh sách</span>
        </p>
        <div className="overflow-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className={`${th} text-left`}>Tháng</th>
                <th className={`${th} text-right`}>Hạng mục</th>
                <th className={`${th} text-right`}>Trị giá (tỷ)</th>
                <th className={`${th} text-right`}>Đã nhập kho (tỷ)</th>
                <th className={`${th} text-right`}>Còn lại (tỷ)</th>
                <th className={`${th} text-right`}>Quá hạn</th>
                <th className={`${th} text-left w-40`}>% nhập kho</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {byMonth.map(m => {
                const pct = m.total > 0 ? (m.inv / m.total) * 100 : 0;
                return (
                  <tr
                    key={m.key}
                    onClick={() => { setMonth(month === m.key && group === 'all' ? null : m.key); setGroup('all'); }}
                    title="Lọc danh sách hạng mục theo tháng này"
                    className={`cursor-pointer ${month === m.key ? 'bg-amber-50' : 'hover:bg-slate-50'}`}
                  >
                    <td className={`${td} ${month === m.key ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{monthLabel(m.key)}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtInt(m.n)}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtTy(m.total)}</td>
                    <td className={`${td} text-right tabular-nums text-emerald-700`}>{fmtTy(m.inv)}</td>
                    <td className={`${td} text-right tabular-nums text-amber-700`}>{fmtTy(m.remain)}</td>
                    <td className={`${td} text-right tabular-nums ${m.overdue ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
                      {m.overdue ? (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            const on = month === m.key && group === 'overdue';
                            setMonth(on ? null : m.key); setGroup(on ? 'all' : 'overdue');
                          }}
                          title="Lọc hạng mục quá hạn của tháng này"
                          className={`rounded px-1 hover:bg-red-50 hover:underline ${month === m.key && group === 'overdue' ? 'bg-red-100' : ''}`}
                        >
                          {fmtInt(m.overdue)}
                        </button>
                      ) : '0'}
                    </td>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                          <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <span className="w-10 text-right tabular-nums text-slate-500">{pct.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold text-slate-700">Hạng mục chưa nhập kho đủ</p>
          <span className="text-[0.6875rem] text-slate-500">
            {group === 'all' ? 'tất cả nhóm' : BOT_GROUPS.find(g => g.key === group)?.label} · {fmtInt(list.length)} hạng mục · sắp theo ngày kế hoạch
          </span>
          {month !== null && <Chip active onClick={() => setMonth(null)}>Tháng {monthLabel(month)} ✕</Chip>}
          <div className="ml-auto"><SearchBox value={q} onChange={setQ} placeholder="Tìm hex, hạng mục, công đoạn..." /></div>
        </div>
        <HexTable
          rows={list}
          onHexClick={onHexClick}
          hexClickTitle="Xem chi tiết hạng mục (BOP × BOT)"
          extraHead={<><th className={`${th} text-right`}>Số ngày</th><th className={`${th} text-right`}>Vướng mắc</th></>}
          extraCells={i => {
            const days = i.deadline ? Math.floor((i.deadline.getTime() - today) / DAY) : null;
            const vm = openIssues?.[i.hex] ?? 0;
            return (
              <>
                <td className={`${td} text-right tabular-nums ${days !== null && days < 0 ? 'font-semibold text-red-600' : days !== null && days <= 14 ? 'text-amber-600' : 'text-slate-500'}`}>
                  {days === null ? '—' : days}
                </td>
                <td className={`${td} text-right tabular-nums ${vm ? 'font-semibold text-red-600' : 'text-slate-300'}`}>{openIssues === null ? '…' : vm || '—'}</td>
              </>
            );
          }}
        />
      </div>
    </div>
  );
};

// ============================================================================
// BOP — công đoạn
// ============================================================================
const STAGE_ORDER = ['P001', 'P002', 'P012', 'P013', 'GCVT', 'P014', 'P016', 'P018', 'P020', 'P021', 'P022', 'P025'];
const stageRank = (s: string) => { const i = STAGE_ORDER.indexOf(s); return i === -1 ? 999 : i; };

// BOP — giống khối "Tình trạng sản xuất" (Công đoạn × Khu vực SX, mở rộng theo Tình trạng) và
// "Báo cáo tỷ trọng điểm nghẽn" (thời gian ở công đoạn hiện tại) của trang Tổng quan, nhưng chỉ cho
// các hạng mục CÒN SẢN XUẤT (chưa nhập kho đủ) của công trình.
type BopMetric = 'count' | 'remain' | 'total';
const BOP_METRICS: { key: BopMetric; label: string }[] = [
  { key: 'count', label: 'Số hạng mục' },
  { key: 'remain', label: 'Còn lại (tỷ)' },
  { key: 'total', label: 'Trị giá (tỷ)' },
];

// Thời gian ở công đoạn hiện tại — cùng nhóm với biểu đồ điểm nghẽn (utils/productionMetrics.dwellBucket)
export const DWELL: { key: DwellKey; label: string; bar: string }[] = [
  { key: '<3 NGÀY', label: '<3 ngày', bar: 'bg-green-500' },
  { key: '4-7 NGÀY', label: '4-7 ngày', bar: 'bg-blue-500' },
  { key: '2 tuần', label: '2 tuần', bar: 'bg-yellow-500' },
  { key: '3 tuần', label: '3 tuần', bar: 'bg-orange-500' },
  { key: DWELL_STUCK, label: '≥ 4 tuần', bar: 'bg-red-500' },
  { key: DWELL_NONE, label: 'Chưa có số ngày', bar: 'bg-slate-300' },
];
const dwellOf = (v: string | null): DwellKey => dwellBucket(v);

const NO_AREA = 'Chưa xác định';
type BopSel = { stage: string; area?: string; status?: string; dwell?: string } | null;

export const BopTab = ({ items, onHexClick }: { items: HexInfo[]; onHexClick?: (hex: string) => void }) => {
  const [metric, setMetric] = useState<BopMetric>('remain');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<BopSel>(null);
  const [q, setQ] = useState('');
  const [sortBy, setSortBy] = useState<'deadline' | 'stage' | 'remain'>('deadline');

  const open = useMemo(() => items.filter(i => i.bucket), [items]);
  const val = (i: HexInfo) => (metric === 'count' ? 1 : metric === 'remain' ? i.remain : i.total);
  const fmtV = (v: number) => (metric === 'count' ? fmtInt(v) : v ? fmtTy(v) : '-');
  const areaOf = (i: HexInfo) => i.area || NO_AREA;
  const stageOf = (i: HexInfo) => i.stage ?? '(Không rõ)';

  const pivot = useMemo(() => {
    const areas = [...new Set(open.map(areaOf))].sort((a, b) => (a === NO_AREA ? 1 : b === NO_AREA ? -1 : a.localeCompare(b)));
    type Row = { cells: Record<string, number>; total: number; n: number };
    const stages = new Map<string, Row & { statuses: Map<string, Row> }>();
    const colTot: Record<string, number> = {};
    let grand = 0;
    for (const i of open) {
      const v = val(i);
      const s = stageOf(i);
      const st = i.status || '(Trống)';
      const a = areaOf(i);
      const r: Row & { statuses: Map<string, Row> } = stages.get(s) ?? { cells: {}, total: 0, n: 0, statuses: new Map() };
      r.cells[a] = (r.cells[a] ?? 0) + v; r.total += v; r.n++;
      const sr: Row = r.statuses.get(st) ?? { cells: {}, total: 0, n: 0 };
      sr.cells[a] = (sr.cells[a] ?? 0) + v; sr.total += v; sr.n++;
      r.statuses.set(st, sr);
      stages.set(s, r);
      colTot[a] = (colTot[a] ?? 0) + v;
      grand += v;
    }
    const rows = [...stages.entries()]
      .sort((x, y) => stageRank(x[0]) - stageRank(y[0]) || x[0].localeCompare(y[0]))
      .map(([stage, r]) => ({ stage, ...r, statuses: [...r.statuses.entries()].sort((x, y) => x[0].localeCompare(y[0], 'vi')) }));
    return { areas, rows, colTot, grand };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, metric]);

  // Điểm nghẽn: số hạng mục theo thời gian ở công đoạn hiện tại
  const dwell = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const i of open) {
      const d = dwellOf(i.dwell);
      const s = stageOf(i);
      const e: Record<string, number> = m.get(s) ?? {};
      e[d] = (e[d] ?? 0) + 1;
      m.set(s, e);
    }
    const rows = [...m.entries()]
      .map(([stage, c]) => ({ stage, c, n: DWELL.reduce((s, d) => s + (c[d.key] ?? 0), 0) }))
      .sort((x, y) => stageRank(x.stage) - stageRank(y.stage) || x.stage.localeCompare(y.stage));
    const w4 = (r: { c: Record<string, number> }) => r.c[DWELL_STUCK] ?? 0;
    const stuck = rows.filter(r => w4(r) > 0).sort((x, y) => w4(y) - w4(x));
    return { rows, stuck, stuckTotal: stuck.reduce((s, r) => s + w4(r), 0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return open
      .filter(i => !sel || (
        stageOf(i) === sel.stage
        && (sel.area === undefined || areaOf(i) === sel.area)
        && (sel.status === undefined || (i.status || '(Trống)') === sel.status)
        && (sel.dwell === undefined || dwellOf(i.dwell) === sel.dwell)
      ))
      .filter(i => matchQ(i, ql))
      .sort((a, b) =>
        sortBy === 'deadline'
          // Hạn gần nhất lên trước (KH tuần → KH tháng → cần giao); cùng hạn thì theo công đoạn
          ? timeOf(a.deadline) - timeOf(b.deadline) || stageRank(stageOf(a)) - stageRank(stageOf(b)) || b.remain - a.remain
          : sortBy === 'stage'
            ? stageRank(stageOf(a)) - stageRank(stageOf(b)) || timeOf(a.deadline) - timeOf(b.deadline)
            : b.remain - a.remain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sel, q, sortBy]);

  const toggle = (s: string) => setExpanded(prev => {
    const n = new Set(prev);
    if (n.has(s)) n.delete(s); else n.add(s);
    return n;
  });
  const pick = (next: NonNullable<BopSel>) =>
    setSel(cur => (cur && JSON.stringify(cur) === JSON.stringify(next) ? null : next));
  const isSel = (next: NonNullable<BopSel>) => !!sel && JSON.stringify(sel) === JSON.stringify(next);
  const selText = sel
    ? [sel.stage, sel.status, sel.area, sel.dwell && DWELL.find(d => d.key === sel.dwell)?.label].filter(Boolean).join(' · ')
    : '';

  const cell = (v: number | undefined, next: NonNullable<BopSel>, cls = '') => (
    <td
      onClick={v ? () => pick(next) : undefined}
      className={`${td} text-right tabular-nums ${v ? 'cursor-pointer hover:bg-amber-50' : 'text-slate-300'} ${isSel(next) ? 'bg-amber-100 font-semibold' : ''} ${cls}`}
    >
      {v ? fmtV(v) : '-'}
    </td>
  );

  return (
    <div className="space-y-4">
      {/* 1. Công đoạn × Khu vực sản xuất */}
      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold text-slate-700">
            Công đoạn × Khu vực sản xuất{' '}
            <span className="font-normal text-slate-500">
              · {fmtInt(open.length)} hạng mục chưa nhập kho đủ · bấm ▸ để xem theo Tình trạng, bấm tình trạng hoặc số để lọc danh sách
            </span>
          </p>
          <div className="ml-auto flex gap-1">
            {BOP_METRICS.map(m => (
              <Chip key={m.key} active={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</Chip>
            ))}
          </div>
        </div>
        <div className="max-h-[50vh] overflow-auto rounded-lg border border-slate-200 custom-scrollbar">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
              <tr>
                <th className={`${th} text-left`}>
                  <span className="inline-flex items-center gap-1.5">
                    BOP
                    <button type="button" title="Mở tất cả" onClick={() => setExpanded(new Set(pivot.rows.map(r => r.stage)))} className="rounded border border-slate-300 px-1 leading-4 hover:bg-white">+</button>
                    <button type="button" title="Thu gọn tất cả" onClick={() => setExpanded(new Set())} className="rounded border border-slate-300 px-1 leading-4 hover:bg-white">−</button>
                  </span>
                </th>
                <th className={`${th} text-left`}>Tình trạng</th>
                {pivot.areas.map(a => <th key={a} className={`${th} text-right`}>{a}</th>)}
                <th className={`${th} bg-slate-100 text-right`}>Tổng cộng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pivot.rows.map(r => {
                const isOpen = expanded.has(r.stage);
                return (
                  <React.Fragment key={r.stage}>
                    <tr className="bg-slate-50/60">
                      <td className={`${td} font-semibold text-slate-800`}>
                        <button type="button" onClick={() => toggle(r.stage)} className="inline-flex items-center gap-1.5 hover:text-slate-950">
                          <span className="inline-block w-3 text-slate-400">{isOpen ? '▾' : '▸'}</span>{r.stage}
                        </button>
                      </td>
                      <td className={td}>
                        <button
                          type="button"
                          onClick={() => pick({ stage: r.stage })}
                          title={`Lọc danh sách: mọi hạng mục ở ${r.stage}`}
                          className={`rounded px-1 font-medium hover:bg-amber-50 hover:text-slate-900 hover:underline ${isSel({ stage: r.stage }) ? 'bg-amber-100 text-slate-900' : 'text-slate-600'}`}
                        >
                          Tổng ({r.statuses.length})
                        </button>
                      </td>
                      {pivot.areas.map(a => <React.Fragment key={a}>{cell(r.cells[a], { stage: r.stage, area: a })}</React.Fragment>)}
                      {cell(r.total, { stage: r.stage }, 'bg-slate-100 font-semibold text-slate-900')}
                    </tr>
                    {isOpen && r.statuses.map(([st, sr]) => (
                      <tr key={st}>
                        <td className={td} />
                        <td className={`${td} pl-5`}>
                          <button
                            type="button"
                            onClick={() => pick({ stage: r.stage, status: st })}
                            title={`Lọc danh sách: ${r.stage} · ${st}`}
                            className={`rounded px-1 text-left hover:bg-amber-50 hover:text-slate-900 hover:underline ${isSel({ stage: r.stage, status: st }) ? 'bg-amber-100 font-semibold text-slate-900' : 'text-slate-600'}`}
                          >
                            {st}
                          </button>
                        </td>
                        {pivot.areas.map(a => <React.Fragment key={a}>{cell(sr.cells[a], { stage: r.stage, status: st, area: a })}</React.Fragment>)}
                        {cell(sr.total, { stage: r.stage, status: st }, 'bg-slate-50 font-semibold')}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
              {pivot.rows.length === 0 && (
                <tr><td colSpan={pivot.areas.length + 3} className="px-3 py-6 text-center text-slate-400">Không còn hạng mục đang sản xuất.</td></tr>
              )}
            </tbody>
            {pivot.rows.length > 0 && (
              <tfoot className="sticky bottom-0 bg-slate-100 font-semibold text-slate-800">
                <tr>
                  <td className={td} colSpan={2}>Tổng cộng</td>
                  {pivot.areas.map(a => <td key={a} className={`${td} text-right tabular-nums`}>{fmtV(pivot.colTot[a] ?? 0)}</td>)}
                  <td className={`${td} text-right tabular-nums`}>{fmtV(pivot.grand)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* 2. Điểm nghẽn: thời gian ở công đoạn hiện tại */}
      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-xs font-semibold text-slate-700">Thời gian ở công đoạn hiện tại</p>
            {DWELL.map(d => (
              <span key={d.key} className="inline-flex items-center gap-1 text-[0.6875rem] text-slate-500">
                <span className={`h-2 w-2 rounded-sm ${d.bar}`} />{d.label}
              </span>
            ))}
          </div>
          <div className="space-y-1.5">
            {dwell.rows.map(r => (
              <div key={r.stage} className="flex items-center gap-2 text-xs">
                <span className="w-12 shrink-0 font-semibold text-slate-700">{r.stage}</span>
                <div className="flex h-5 flex-1 overflow-hidden rounded bg-slate-100">
                  {DWELL.map(d => {
                    const v = r.c[d.key] ?? 0;
                    if (!v) return null;
                    const next = { stage: r.stage, dwell: d.key };
                    return (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => pick(next)}
                        title={`${r.stage} · ${d.label}: ${v} hạng mục`}
                        className={`${d.bar} flex items-center justify-center text-[0.625rem] font-semibold text-white hover:brightness-110 ${isSel(next) ? 'ring-2 ring-inset ring-slate-900' : ''}`}
                        style={{ width: `${(v / r.n) * 100}%` }}
                      >
                        {v / r.n >= 0.06 ? v : ''}
                      </button>
                    );
                  })}
                </div>
                <span className="w-10 shrink-0 text-right tabular-nums text-slate-500">{fmtInt(r.n)}</span>
              </div>
            ))}
            {dwell.rows.length === 0 && <p className="py-4 text-center text-xs text-slate-400">Không có dữ liệu thời gian ở công đoạn.</p>}
          </div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50/40 p-3">
          <p className="mb-2 text-xs font-semibold text-red-700">Top điểm nghẽn (≥ 4 tuần)</p>
          <div className="space-y-1.5">
            {dwell.stuck.slice(0, 6).map((r, idx) => {
              const next = { stage: r.stage, dwell: DWELL_STUCK as string };
              return (
                <button
                  key={r.stage}
                  type="button"
                  onClick={() => pick(next)}
                  className={`flex w-full items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5 text-left text-xs hover:border-red-300 ${isSel(next) ? 'border-red-500' : 'border-red-100'}`}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-[0.625rem] font-bold text-red-600">{idx + 1}</span>
                  <span className="font-semibold text-slate-800">{r.stage}</span>
                  <span className="ml-auto font-bold tabular-nums text-red-600">{fmtInt(r.c[DWELL_STUCK] ?? 0)}</span>
                </button>
              );
            })}
            {dwell.stuck.length === 0 && <p className="py-2 text-center text-xs text-slate-400">Không có hạng mục tồn đọng ≥ 4 tuần.</p>}
          </div>
          {dwell.stuckTotal > 0 && (
            <p className="mt-2 flex justify-between border-t border-red-100 pt-2 text-xs text-slate-600">
              Tổng cảnh báo <span className="font-bold text-red-600">{fmtInt(dwell.stuckTotal)} hạng mục</span>
            </p>
          )}
        </div>
      </div>

      {/* 3. Danh sách hạng mục */}
      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold text-slate-700">{sel ? 'Hạng mục đang lọc' : 'Tất cả hạng mục chưa nhập kho đủ'}</p>
          {sel && <Chip active onClick={() => setSel(null)}>{selText} ✕</Chip>}
          <span className="text-[0.6875rem] text-slate-500">{fmtInt(list.length)} hạng mục</span>
          <SortPicker
            value={sortBy}
            onChange={setSortBy}
            options={[['deadline', 'Hạn gần nhất'], ['stage', 'Công đoạn'], ['remain', 'Giá trị còn lại']]}
          />
          <div className="ml-auto"><SearchBox value={q} onChange={setQ} placeholder="Tìm hex, hạng mục..." /></div>
        </div>
        <HexTable
          rows={list}
          onHexClick={onHexClick}
          hexClickTitle="Xem chi tiết hạng mục (BOP × BOT)"
          extraHead={<>
            <th className={`${th} text-left`}>Khu vực SX</th>
            <th className={`${th} text-left`}>Tình trạng</th>
            <th className={`${th} text-left`}>Ở công đoạn</th>
          </>}
          extraCells={i => {
            const d = DWELL.find(x => x.key === dwellOf(i.dwell));
            return (
              <>
                <td className={`${td} whitespace-nowrap text-slate-600`}>{i.area || '—'}</td>
                <td className={`${td} whitespace-nowrap text-slate-600`}>{i.status || '—'}</td>
                <td className={`${td} whitespace-nowrap`}>
                  {d ? (
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      <span className={`h-2 w-2 rounded-sm ${d.bar}`} />{d.label}
                    </span>
                  ) : <span className="text-slate-300">—</span>}
                </td>
              </>
            );
          }}
        />
      </div>
    </div>
  );
};

// ============================================================================
// BOM — vật tư: phân tích theo trạng thái TỪNG DÒNG PR rồi gộp lên hạng mục.
// Mọi ngày ở đây lấy từ bảng vật tư (Ngày PR, Ngày cần vật tư, Ngày dự kiến giao PMH nhập,
// Ngày thực tế về) — KHÔNG dùng KH nhập kho / ngày cần giao của hạng mục.
// ============================================================================

// Trạng thái hạng mục = trạng thái "xấu nhất" trong các dòng vật tư của nó (thứ tự dưới đây)
export type BomState = 'none' | 'notOrdered' | 'late' | 'onTrack' | 'arrived' | 'ok' | 'stocked';
export const BOM_STATES: { key: BomState; label: string; tone: 'red' | 'amber' | 'emerald' | 'slate'; badge: string; hint: string }[] = [
  { key: 'none', label: 'Chưa tìm thấy vật tư', tone: 'red', badge: 'bg-red-50 text-red-600',
    hint: 'Không có dòng PR nào ghi mã nhà máy của hạng mục (xem nút "Chưa có mã nhà máy chỉ định")' },
  { key: 'notOrdered', label: 'Có VT chưa mua', tone: 'red', badge: 'bg-rose-50 text-rose-700',
    hint: 'Ít nhất 1 dòng PR 1.CHƯA MUA (chưa có PO)' },
  { key: 'late', label: 'VT trễ hẹn giao', tone: 'amber', badge: 'bg-orange-50 text-orange-700',
    hint: 'Đang mua, đã quá Ngày dự kiến giao hàng PMH nhập mà chưa về đủ' },
  { key: 'onTrack', label: 'Đang mua, chưa tới hẹn', tone: 'amber', badge: 'bg-amber-50 text-amber-700',
    hint: 'Còn dòng đang mua nhưng chưa tới Ngày dự kiến giao hàng PMH nhập' },
  { key: 'arrived', label: 'Kho đã báo về, chờ nhập SAP', tone: 'slate', badge: 'bg-sky-50 text-sky-700',
    hint: 'Kho báo SL hàng về thực tế ≥ SL yêu cầu, SAP chưa ghi nhận' },
  { key: 'ok', label: 'Đã về đủ (theo PR đã có)', tone: 'emerald', badge: 'bg-emerald-50 text-emerald-700',
    hint: 'Mọi dòng PR đã nối được đều đã về / CCLD / đã đóng / đã hủy — không khẳng định đủ toàn bộ BOM' },
  { key: 'stocked', label: 'Hạng mục đã nhập kho đủ', tone: 'slate', badge: 'bg-slate-100 text-slate-500',
    hint: 'Hạng mục đã nhập kho đủ trị giá — vật tư không còn ảnh hưởng' },
];
const BOM_META = Object.fromEntries(BOM_STATES.map(s => [s.key, s])) as Record<BomState, (typeof BOM_STATES)[number]>;

export const LINE_STATES: { key: MaterialLineState; label: string; bar: string }[] = [
  { key: 'notOrdered', label: 'Chưa mua', bar: 'bg-rose-500' },
  { key: 'late', label: 'Đang mua – trễ hẹn', bar: 'bg-orange-500' },
  { key: 'onTrack', label: 'Đang mua – chưa tới hẹn', bar: 'bg-amber-400' },
  { key: 'arrived', label: 'Kho báo về, chờ nhập SAP', bar: 'bg-sky-400' },
  { key: 'ccld', label: 'CCLD – lắp tại công trình', bar: 'bg-teal-400' },
  { key: 'closedShort', label: 'PR đã đóng, chưa nhận đủ', bar: 'bg-violet-400' },
  { key: 'done', label: 'Đã nhận đủ', bar: 'bg-emerald-500' },
  { key: 'cancelled', label: 'Hủy', bar: 'bg-slate-300' },
];

export interface HexBom {
  state: BomState;
  lines: number;                                   // số dòng PR nối được
  byLine: Partial<Record<MaterialLineState, number>>;
  prDate: Date | null;        // Ngày PR sớm nhất
  needDate: Date | null;      // Ngày cần vật tư sớm nhất của dòng còn chờ (không còn chờ: sớm nhất mọi dòng)
  dueDate: Date | null;       // Ngày dự kiến giao PMH nhập muộn nhất của dòng đang mua
  arrivedDate: Date | null;   // Ngày thực tế về (posting) muộn nhất
  afterNeed: number;          // số dòng còn chờ sẽ về sau Ngày cần vật tư
  issues: VuongMacItem[];     // vướng mắc M3 (Vật tư) chưa xử lý
}

export interface BomAnalysis {
  byHex: Record<string, HexBom>;
  counts: Record<BomState, number>;               // theo HEX duy nhất
  lineCounts: Record<MaterialLineState, number>;  // dòng phục vụ ≥ 1 hạng mục chưa nhập kho đủ
  lineTotal: number;
  afterNeed: number;                              // số hạng mục có VT về sau ngày cần vật tư
  issueHexes: number;                             // số hạng mục có vướng mắc M3 đang mở
  issueTotal: number;                             // số vướng mắc M3 đang mở
}

const LINE_ORDER: MaterialLineState[] = ['notOrdered', 'late', 'onTrack', 'arrived'];

/**
 * Dòng còn chờ sẽ về SAU Ngày cần vật tư:
 *  - chưa mua: đã qua ngày cần vật tư (chưa có PO thì không thể về kịp)
 *  - đang mua: max(ngày dự kiến giao, hôm nay) > ngày cần vật tư (đã trễ hẹn thì sớm nhất cũng là hôm nay)
 */
const lineAfterNeed = (l: MaterialLine, st: MaterialLineState, today: number): boolean => {
  const need = parsePlanDate(l.ngay_can_vat_tu)?.getTime();
  if (need === undefined) return false;
  if (st === 'notOrdered') return need < today;
  if (st === 'late' || st === 'onTrack') {
    const due = parsePlanDate(l.ngay_du_kien_giao_hang_pmh_nhap)?.getTime() ?? today;
    return Math.max(due, today) > need;
  }
  return false;
};

const minT = (a: number | null, b: number | undefined) => (b === undefined ? a : a === null ? b : Math.min(a, b));
const maxT = (a: number | null, b: number | undefined) => (b === undefined ? a : a === null ? b : Math.max(a, b));
const toDate = (t: number | null) => (t === null ? null : new Date(t));

export function analyzeBom(
  items: HexInfo[], matCount: Record<string, number> | null, lines: MaterialLine[] | null, today: number,
  materialIssues: Record<string, VuongMacItem[]> | null = null,
): BomAnalysis | null {
  if (!matCount || !lines) return null;
  const openHex = new Set(items.filter(i => i.bucket).map(i => i.hex));
  type Acc = {
    byLine: Partial<Record<MaterialLineState, number>>; afterNeed: number;
    pr: number | null; needPending: number | null; needAll: number | null; due: number | null; arrived: number | null;
  };
  const perHex: Record<string, Acc> = {};
  const lineCounts = Object.fromEntries(LINE_STATES.map(s => [s.key, 0])) as Record<MaterialLineState, number>;
  let lineTotal = 0;

  for (const l of lines) {
    const st = materialLineState(l, today);
    const pending = isMaterialPending(st);
    const after = lineAfterNeed(l, st, today);
    const pr = parsePlanDate(l.ngay_pr)?.getTime();
    const need = parsePlanDate(l.ngay_can_vat_tu)?.getTime();
    const due = st === 'late' || st === 'onTrack' ? parsePlanDate(l.ngay_du_kien_giao_hang_pmh_nhap)?.getTime() : undefined;
    const arrived = parsePlanDate(l.ngay_thuc_te_ve)?.getTime();
    if (l.hexes.some(h => openHex.has(h))) { lineCounts[st]++; lineTotal++; }
    for (const h of l.hexes) {
      const e = perHex[h] ?? (perHex[h] = { byLine: {}, afterNeed: 0, pr: null, needPending: null, needAll: null, due: null, arrived: null });
      e.byLine[st] = (e.byLine[st] ?? 0) + 1;
      if (after) e.afterNeed++;
      e.pr = minT(e.pr, pr);
      e.needAll = minT(e.needAll, need);
      if (pending) e.needPending = minT(e.needPending, need);
      e.due = maxT(e.due, due);
      e.arrived = maxT(e.arrived, arrived);
    }
  }

  const byHex: Record<string, HexBom> = {};
  const counts = Object.fromEntries(BOM_STATES.map(s => [s.key, 0])) as Record<BomState, number>;
  let afterNeed = 0, issueHexes = 0, issueTotal = 0;
  const seen = new Set<string>();
  for (const i of items) {
    if (seen.has(i.hex)) continue;
    seen.add(i.hex);
    const e = perHex[i.hex];
    const nLines = matCount[i.hex] ?? 0;
    let state: BomState;
    if (!i.bucket) state = 'stocked';
    else if (!(nLines > 0) || !e) state = 'none';
    else state = (LINE_ORDER.find(k => (e.byLine[k] ?? 0) > 0) as BomState | undefined) ?? 'ok';
    const lateNeed = state !== 'stocked' && (e?.afterNeed ?? 0) > 0 ? e!.afterNeed : 0;
    if (lateNeed > 0) afterNeed++;
    const issues = materialIssues?.[i.hex] ?? [];
    if (issues.length) { issueHexes++; issueTotal += issues.length; }
    counts[state]++;
    byHex[i.hex] = {
      state, lines: nLines, byLine: e?.byLine ?? {}, afterNeed: lateNeed,
      prDate: toDate(e?.pr ?? null),
      needDate: toDate(e ? (e.needPending ?? e.needAll) : null),
      dueDate: toDate(e?.due ?? null),
      arrivedDate: toDate(e?.arrived ?? null),
      issues,
    };
  }
  return { byHex, counts, lineCounts, lineTotal, afterNeed, issueHexes, issueTotal };
}

export const BomTab = ({ items, matCount, materialLines, unassigned, onOpenMaterial, onOpenHex, today, materialIssues }: {
  items: HexInfo[];
  matCount: Record<string, number> | null;
  materialLines: MaterialLine[] | null;
  unassigned: { lines: number; prs: number } | null;
  onOpenMaterial: (mode: 'matched' | 'unassigned') => void;
  onOpenHex: (hex: string) => void;
  today: number;
  materialIssues: Record<string, VuongMacItem[]> | null;
}) => {
  const [filter, setFilter] = useState<BomState | 'all' | 'afterNeed' | 'issue'>('all');
  const [sortBy, setSortBy] = useState<'priority' | 'deadline' | 'remain'>('priority');
  const [issueHex, setIssueHex] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const bom = useMemo(
    () => analyzeBom(items, matCount, materialLines, today, materialIssues),
    [items, matCount, materialLines, today, materialIssues]
  );

  const list = useMemo(() => {
    if (!bom) return [];
    const ql = q.trim().toLowerCase();
    // Ưu tiên xử lý: trễ hẹn giao → chưa mua → đang mua chưa tới hẹn → chưa tìm thấy VT → kho báo về
    // → đã về đủ → hạng mục đã nhập kho đủ (không còn ảnh hưởng, luôn xếp cuối)
    const PRIORITY: BomState[] = ['late', 'notOrdered', 'onTrack', 'none', 'arrived', 'ok', 'stocked'];
    const rank = (i: HexInfo) => PRIORITY.indexOf(bom.byHex[i.hex]?.state ?? 'none');
    const pendingFirst = (i: HexInfo) => (rank(i) <= 2 ? 0 : rank(i) >= 5 ? 2 : 1);
    const need = (i: HexInfo) => bom.byHex[i.hex]?.needDate?.getTime() ?? Infinity;
    const seen = new Set<string>();
    return items
      .filter(i => {
        if (seen.has(i.hex)) return false;
        seen.add(i.hex);
        const b = bom.byHex[i.hex];
        if (!b || !matchQ(i, ql)) return false;
        if (filter === 'afterNeed') return b.afterNeed > 0;
        if (filter === 'issue') return b.issues.length > 0;
        return filter === 'all' || b.state === filter;
      })
      .sort((a, b) =>
        sortBy === 'priority'
          ? rank(a) - rank(b) || need(a) - need(b) || timeOf(a.deadline) - timeOf(b.deadline) || b.remain - a.remain
          : sortBy === 'deadline'
            // Ngày cần VT sớm nhất trong nhóm còn chờ vật tư trước; hạng mục đã xong vật tư / đã nhập kho đủ xuống cuối
            ? pendingFirst(a) - pendingFirst(b) || need(a) - need(b) || timeOf(a.deadline) - timeOf(b.deadline) || rank(a) - rank(b)
            : pendingFirst(a) - pendingFirst(b) || b.remain - a.remain);
  }, [items, bom, filter, q, sortBy]);

  const total = useMemo(() => new Set(items.map(i => i.hex)).size, [items]);

  const dateCell = (d: Date | null, cls = 'text-slate-600') => (
    <td className={`${td} whitespace-nowrap tabular-nums ${d ? cls : 'text-slate-300'}`}>{d ? fmtDate(d) : '—'}</td>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onOpenMaterial('matched')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100"
        >
          <Package size={14} /> Vật tư theo hạng mục / Theo PR
        </button>
        <button
          type="button"
          onClick={() => onOpenMaterial('unassigned')}
          disabled={!unassigned || unassigned.lines === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Chưa có mã nhà máy chỉ định
          <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[0.6875rem] text-white">
            {unassigned === null ? '…' : `${fmtInt(unassigned.lines)} dòng · ${unassigned.prs} PR`}
          </span>
        </button>
      </div>

      {/* Phân bổ dòng PR theo trạng thái (chỉ dòng phục vụ hạng mục chưa nhập kho đủ) */}
      {bom && bom.lineTotal > 0 && (
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-700">
            Dòng PR theo trạng thái{' '}
            <span className="font-normal text-slate-500">· {fmtInt(bom.lineTotal)} dòng phục vụ hạng mục chưa nhập kho đủ</span>
          </p>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
            {LINE_STATES.map(s => bom.lineCounts[s.key] > 0 && (
              <div
                key={s.key}
                className={s.bar}
                style={{ width: `${(bom.lineCounts[s.key] / bom.lineTotal) * 100}%` }}
                title={`${s.label}: ${bom.lineCounts[s.key]}`}
              />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4 xl:grid-cols-4">
            {LINE_STATES.map(s => (
              <div key={s.key} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-sm ${s.bar}`} />
                <span className="truncate text-slate-600">{s.label}</span>
                <span className="ml-auto font-semibold tabular-nums text-slate-800">{fmtInt(bom.lineCounts[s.key])}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>Tất cả ({fmtInt(total)})</Chip>
        {BOM_STATES.map(s => (
          <span key={s.key} title={s.hint}>
            <Chip active={filter === s.key} tone={s.tone} onClick={() => setFilter(s.key)}>
              {s.label} ({bom ? fmtInt(bom.counts[s.key]) : '…'})
            </Chip>
          </span>
        ))}
        <span title="Có dòng PR còn chờ sẽ về sau Ngày cần vật tư (chưa mua mà đã qua ngày cần, hoặc ngày dự kiến giao / hôm nay sau ngày cần)">
          <Chip active={filter === 'afterNeed'} tone="red" onClick={() => setFilter('afterNeed')}>
            <AlertTriangle size={11} className="-mt-0.5 mr-1 inline" />VT về sau ngày cần ({bom ? fmtInt(bom.afterNeed) : '…'})
          </Chip>
        </span>
        <span title="Hạng mục có vướng mắc loại M3 – Vật tư chưa xử lý">
          <Chip active={filter === 'issue'} tone="red" onClick={() => setFilter('issue')}>
            Có vướng mắc VT – M3 ({bom && materialIssues !== null ? fmtInt(bom.issueHexes) : '…'})
          </Chip>
        </span>
        <div className="ml-auto flex items-center gap-3">
          <SortPicker
            value={sortBy}
            onChange={setSortBy}
            options={[['priority', 'Ưu tiên (trễ → chưa mua)'], ['deadline', 'Ngày cần VT gần nhất'], ['remain', 'Giá trị còn lại']]}
          />
          <SearchBox value={q} onChange={setQ} placeholder="Tìm hex, hạng mục..." />
        </div>
      </div>
      <p className="-mt-2 text-[0.6875rem] text-slate-500">
        Ngày lấy từ bảng vật tư: Ngày PR (sớm nhất) · Ngày cần vật tư (sớm nhất của dòng còn chờ) · Ngày dự kiến giao hàng PMH nhập (muộn nhất của dòng đang mua) ·
        Ngày thực tế về / posting (muộn nhất). Mỗi hạng mục lấy trạng thái xấu nhất trong các dòng PR của nó.
        "CCLD" = NCC cung cấp + lắp đặt tại công trình (không về kho nhà máy) và "PR đã đóng" = SAP đóng PR khi chưa nhận đủ — đều không tính là thiếu. Một dòng mua gộp tính cho mọi hạng mục nó phục vụ.
      </p>

      {issueHex && bom?.byHex[issueHex] && (
        <div className="rounded-lg border border-red-200 bg-red-50/40 p-3">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-xs font-semibold text-red-700">
              Vướng mắc vật tư (M3) · {issueHex} · {items.find(x => x.hex === issueHex)?.hangMuc}
            </p>
            <button type="button" onClick={() => setIssueHex(null)} className="ml-auto rounded px-2 text-xs text-slate-500 hover:bg-white">Đóng ✕</button>
          </div>
          <ul className="space-y-1.5">
            {bom.byHex[issueHex].issues.map(v => (
              <li key={v.id} className="rounded-md bg-white px-3 py-2 text-xs text-slate-700 shadow-sm">
                <p className="whitespace-pre-line">{v.content}</p>
                <p className="mt-1 text-[0.6875rem] text-slate-500">
                  {v.handler ? `Người xử lý: ${v.handler} · ` : ''}{v.bot ? `BOT: ${new Date(v.bot).toLocaleDateString('vi-VN')} · ` : ''}
                  Tạo bởi {v.createdBy} · {new Date(v.createdAt).toLocaleDateString('vi-VN')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!bom ? (
        <p className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-400">Đang kiểm tra vật tư…</p>
      ) : (
        <HexTable
          rows={list}
          planDates={false}
          onHexClick={onOpenHex}
          hexClickTitle="Xem chi tiết vật tư của hạng mục này"
          extraHead={<>
            <th className={`${th} text-right`} title="Số dòng PR (vật tư) đã nối được với hạng mục qua mã nhà máy / Item note PR — gồm mọi trạng thái: chưa mua, đang mua, đã nhận, CCLD, đã đóng, hủy">Số dòng PR</th>
            <th className={`${th} text-right`} title="Dòng 1.CHƯA MUA">Chưa mua</th>
            <th className={`${th} text-right`} title="Đang mua, quá ngày dự kiến giao">Trễ hẹn</th>
            <th className={`${th} text-right`} title="Đang mua, chưa tới ngày dự kiến giao">Chưa tới hẹn</th>
            <th className={`${th} text-left`} title="Ngày PR sớm nhất">Ngày PR</th>
            <th className={`${th} text-left`} title="Ngày cần vật tư sớm nhất của các dòng còn chờ">Ngày cần VT</th>
            <th className={`${th} text-left`} title="Ngày dự kiến giao hàng PMH nhập muộn nhất của các dòng đang mua">Dự kiến giao PMH</th>
            <th className={`${th} text-left`} title="Posting date — ngày thực tế về muộn nhất">Thực tế về</th>
            <th className={`${th} text-right`} title="Vướng mắc M3 – Vật tư chưa xử lý (bấm để xem)">VM vật tư</th>
            <th className={`${th} text-left`}>Tình trạng vật tư</th>
          </>}
          extraCells={i => {
            const b = bom.byHex[i.hex];
            const n = (k: MaterialLineState, cls: string) => {
              const v = b?.byLine[k] ?? 0;
              return <td className={`${td} text-right tabular-nums ${v ? cls : 'text-slate-300'}`}>{v || '—'}</td>;
            };
            const meta = BOM_META[b?.state ?? 'none'];
            const pending = !!b && (b.state === 'notOrdered' || b.state === 'late' || b.state === 'onTrack');
            const needLate = !!b && b.afterNeed > 0;
            const dueLate = pending && !!b?.dueDate && b.dueDate.getTime() < today;
            return (
              <>
                <td className={`${td} text-right tabular-nums`}>{b?.lines || '—'}</td>
                {n('notOrdered', 'font-semibold text-rose-600')}
                {n('late', 'font-semibold text-orange-600')}
                {n('onTrack', 'text-amber-700')}
                {dateCell(b?.prDate ?? null)}
                <td
                  className={`${td} whitespace-nowrap tabular-nums ${!b?.needDate ? 'text-slate-300' : needLate ? 'font-semibold text-red-600' : 'text-slate-600'}`}
                  title={needLate ? `${b!.afterNeed} dòng sẽ về sau ngày cần vật tư` : undefined}
                >
                  {b?.needDate ? fmtDate(b.needDate) : '—'}
                  {needLate && <span className="ml-1 text-[0.625rem] font-normal">({b!.afterNeed} dòng trễ)</span>}
                </td>
                {dateCell(pending ? b!.dueDate : null, dueLate ? 'font-semibold text-orange-600' : 'text-slate-600')}
                {dateCell(b?.arrivedDate ?? null, 'text-emerald-700')}
                <td className={`${td} text-right tabular-nums`}>
                  {materialIssues === null ? '…' : b?.issues.length ? (
                    <button
                      type="button"
                      onClick={() => setIssueHex(i.hex)}
                      className="rounded px-1.5 font-semibold text-red-600 hover:bg-red-50 hover:underline"
                      title="Xem vướng mắc vật tư"
                    >
                      {b.issues.length}
                    </button>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className={td}>
                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[0.625rem] font-semibold ${meta.badge}`} title={meta.hint}>
                    {meta.label}
                  </span>
                  {/* Chưa nối được PR nhưng người dùng đã báo vướng mắc vật tư */}
                  {b?.state === 'none' && b.issues.length > 0 && (
                    <span className="ml-1 whitespace-nowrap rounded-full bg-red-600 px-1.5 py-0.5 text-[0.625rem] font-semibold text-white">có VM vật tư</span>
                  )}
                </td>
              </>
            );
          }}
        />
      )}
    </div>
  );
};

// Ô ngày kế hoạch: ngày đang dùng để tính BOT (KH tuần → KH tháng → cần giao) in đậm,
// đỏ nếu quá hạn / cam nếu sắp hạn; các ngày còn lại hiện mờ để tham khảo.
export const PlanDateCell = ({ i, which }: { i: HexInfo; which: DeadlineSource }) => {
  const d = which === 'tuần' ? i.khnkTuan : which === 'tháng' ? i.khnkThang : i.canGiao;
  const used = i.deadlineSource === which;
  const cls = !d ? 'text-slate-300'
    : !used ? 'text-slate-400'
      : i.overdue ? 'font-semibold text-red-600' : i.dueSoon ? 'font-semibold text-amber-600' : 'font-semibold text-slate-700';
  return (
    <td
      className={`${td} whitespace-nowrap tabular-nums ${cls}`}
      title={d ? (used ? 'Ngày đang dùng để tính BOT' : 'Chỉ để tham khảo (ưu tiên KH tuần → KH tháng → cần giao)') : undefined}
    >
      {d ? fmtDate(d) : '—'}
    </td>
  );
};

// ============================================================================
// Bảng hạng mục dùng chung cho 3 tab
// ============================================================================
// planDates = false: ẩn 3 cột KH tuần / KH tháng / Cần giao (vd. tab BOM dùng ngày của vật tư)
const HexTable = ({ rows, extraHead, extraCells, planDates = true, onHexClick, hexClickTitle }: {
  rows: HexInfo[];
  extraHead: React.ReactNode;
  extraCells: (i: HexInfo) => React.ReactNode;
  planDates?: boolean;
  onHexClick?: (hex: string) => void;   // bấm mã HEX (vd. tab BOM mở cửa sổ vật tư)
  hexClickTitle?: string;
}) => (
  <div className="max-h-[78vh] overflow-auto rounded-lg border border-slate-200 custom-scrollbar">
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-slate-50 text-slate-500">
        <tr>
          <th className={`${th} w-10 text-right`}>STT</th>
          <th className={`${th} text-left`}>Mã Hex</th>
          <th className={`${th} text-left`}>Hạng mục</th>
          <th className={`${th} text-left`}>Công đoạn</th>
          {planDates && <>
            <th className={`${th} text-left`}>KH tuần</th>
            <th className={`${th} text-left`}>KH tháng</th>
            <th className={`${th} text-left`}>Cần giao</th>
          </>}
          <th className={`${th} text-right`}>Trị giá (tỷ)</th>
          <th className={`${th} text-right`}>Còn lại (tỷ)</th>
          {extraHead}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((i, idx) => (
          <tr key={i.hex} className="hover:bg-slate-50">
            <td className={`${td} text-right tabular-nums text-slate-400`}>{idx + 1}</td>
            <td className={`${td} font-medium text-slate-800`}>
              {onHexClick && i.hex ? (
                <button
                  type="button"
                  onClick={() => onHexClick(i.hex)}
                  title={hexClickTitle}
                  className="font-medium text-blue-700 hover:underline"
                >
                  {i.hex}
                </button>
              ) : i.hex}
            </td>
            <td className={`${td} max-w-[300px] truncate text-slate-600`} title={i.hangMuc}>{i.hangMuc}</td>
            <td className={`${td} text-slate-600`}>{i.stage ?? '—'}</td>
            {planDates && <>
              <PlanDateCell i={i} which="tuần" />
              <PlanDateCell i={i} which="tháng" />
              <PlanDateCell i={i} which="cần giao" />
            </>}
            <td className={`${td} text-right tabular-nums text-slate-600`}>{fmtTy(i.total)}</td>
            <td className={`${td} text-right tabular-nums ${i.remain > 0 ? 'text-amber-700' : 'text-emerald-600'}`}>
              {i.remain > 0 ? fmtTy(i.remain) : fmtTy(0)}
            </td>
            {extraCells(i)}
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={22} className="px-3 py-8 text-center text-slate-400">Không có hạng mục phù hợp.</td></tr>
        )}
      </tbody>
    </table>
  </div>
);
