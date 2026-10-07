import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Target } from 'lucide-react';
import { useTrendFilter } from './TrendFilterContext';
import { fetchYearPlan, fetchYearPlanActual, type YearPlanActualData } from '../../../../services/dataService';
import { formatTy, trieuToTy } from '../../../../utils/money';

// ============================================================================
// Bảng Kế hoạch năm (khsx_nam) – Thực hiện (nhập kho) phân cấp:
//   Năm → 6 tháng đầu / cuối năm → Quý → Tháng
// Hiện trong "Chi tiết Nhập Kho" khi mở từ ô "Kế hoạch năm" (thay cho các biểu đồ theo
// công trình / nhóm SP / ĐVT, vì kế hoạch năm chỉ có theo tháng × xưởng).
// 2 chế độ: Tổng hợp (theo bộ lọc Xưởng) · Theo khu vực sản xuất (mỗi xưởng 3 cột KH / TH / % đạt).
// Năm = năm của khoảng ngày đang chọn. Đơn vị Tỷ đồng.
// ============================================================================

type Node = { key: string; label: string; level: number; months: number[]; children?: Node[] };
type MonthMap = Record<number, number>;

const MONTH_NODE = (m: number): Node => ({ key: `m${m}`, label: `Tháng ${m}`, level: 3, months: [m] });
const QUARTER = (q: number): Node => {
  const months = [q * 3 - 2, q * 3 - 1, q * 3];
  return { key: `q${q}`, label: `Quý ${['I', 'II', 'III', 'IV'][q - 1]}`, level: 2, months, children: months.map(MONTH_NODE) };
};
const buildTree = (year: number): Node => ({
  key: 'y', label: `Năm ${year}`, level: 0, months: Array.from({ length: 12 }, (_, i) => i + 1),
  children: [
    { key: 'h1', label: '6 tháng đầu năm', level: 1, months: [1, 2, 3, 4, 5, 6], children: [QUARTER(1), QUARTER(2)] },
    { key: 'h2', label: '6 tháng cuối năm', level: 1, months: [7, 8, 9, 10, 11, 12], children: [QUARTER(3), QUARTER(4)] },
  ],
});
const ALL_KEYS = ['y', 'h1', 'h2', 'q1', 'q2', 'q3', 'q4'];

const LEVEL_STYLE = [
  'bg-emerald-50 font-bold text-slate-900',
  'bg-slate-50 font-semibold text-slate-800',
  'font-semibold text-slate-700',
  'text-slate-600',
];
const LEVEL_BG = ['bg-emerald-50', 'bg-slate-50', 'bg-white', 'bg-white'];
const pctTone = (pct: number) => (pct >= 100 ? 'text-emerald-600' : pct >= 80 ? 'text-amber-600' : 'text-red-600');
const barTone = (pct: number) => (pct >= 100 ? 'bg-emerald-500' : pct >= 80 ? 'bg-amber-400' : 'bg-red-400');

const sumMonths = (src: MonthMap | undefined, months: number[]) =>
  src ? months.reduce((s, m) => s + (src[m] ?? 0), 0) : 0;

export default function YearPlanTable() {
  const { dateFrom, dateTo, xuong } = useTrendFilter();
  const year = Number((dateTo || dateFrom || '').slice(0, 4)) || new Date().getFullYear();
  const [mode, setMode] = useState<'total' | 'xuong'>('total');

  // --- Tổng hợp (theo bộ lọc Xưởng) ---
  const [plan, setPlan] = useState<MonthMap | null>(null);
  const [actual, setActual] = useState<MonthMap | null>(null);
  // --- Theo khu vực sản xuất ---
  const [byXuong, setByXuong] = useState<YearPlanActualData | null>(null);
  const [byXuongLoading, setByXuongLoading] = useState(false);

  // Mặc định mở tới cấp Quý; bấm Quý để xem từng tháng
  const [open, setOpen] = useState<Set<string>>(new Set(['y', 'h1', 'h2']));

  useEffect(() => {
    let cancelled = false;
    setPlan(null); setActual(null);
    fetchYearPlan(`${year}-01`, `${year}-12`, xuong || undefined).then(d => {
      if (cancelled) return;
      const m: MonthMap = {};
      (d?.byMonth ?? []).forEach(p => { m[Number(p.period.slice(5, 7))] = p.value; });
      setPlan(m);
    });
    const q = new URLSearchParams({ source: 'inventory', granularity: 'month', dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` });
    if (xuong) q.set('xuong', xuong);
    fetch(`/api/trend?${q.toString()}`)
      .then(r => (r.ok ? r.json() : []))
      .then((rows: { period: string; total: number }[]) => {
        if (cancelled) return;
        const m: MonthMap = {};
        (Array.isArray(rows) ? rows : []).forEach(p => {
          const d = new Date(p.period);
          if (isNaN(d.getTime()) || d.getFullYear() !== year) return;
          const k = d.getMonth() + 1;
          m[k] = (m[k] ?? 0) + trieuToTy(Number(p.total) || 0); // triệu -> tỷ
        });
        setActual(m);
      })
      .catch(() => { if (!cancelled) setActual({}); });
    return () => { cancelled = true; };
  }, [year, xuong]);

  useEffect(() => {
    if (mode !== 'xuong') return;
    let cancelled = false;
    setByXuongLoading(true);
    fetchYearPlanActual(year).then(d => {
      if (!cancelled) { setByXuong(d); setByXuongLoading(false); }
    });
    return () => { cancelled = true; };
  }, [mode, year]);

  // xưởng -> tháng -> giá trị
  const xuongMaps = useMemo(() => {
    const planM: Record<string, MonthMap> = {};
    const actM: Record<string, MonthMap> = {};
    (byXuong?.plan ?? []).forEach(r => { (planM[r.xuong] ??= {})[r.thang] = (planM[r.xuong]?.[r.thang] ?? 0) + r.value; });
    (byXuong?.actual ?? []).forEach(r => { (actM[r.xuong] ??= {})[r.thang] = (actM[r.xuong]?.[r.thang] ?? 0) + r.value; });
    return { planM, actM };
  }, [byXuong]);

  const tree = useMemo(() => buildTree(year), [year]);
  const now = new Date();
  const lastMonthWithData = now.getFullYear() === year ? now.getMonth() + 1 : now.getFullYear() > year ? 12 : 0;

  const rows: Node[] = [];
  const walk = (n: Node) => {
    rows.push(n);
    if (n.children && open.has(n.key)) n.children.forEach(walk);
  };
  walk(tree);

  const toggle = (k: string) => setOpen(prev => {
    const s = new Set(prev);
    if (s.has(k)) s.delete(k); else s.add(k);
    return s;
  });

  const labelCell = (n: Node, sticky: boolean) => (
    <td
      className={`px-4 py-2 whitespace-nowrap ${sticky ? `sticky left-0 z-10 ${LEVEL_BG[n.level]} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]` : ''}`}
      style={{ paddingLeft: 16 + n.level * 20 }}
    >
      {n.children ? (
        <button type="button" onClick={() => toggle(n.key)} className="inline-flex items-center gap-1 hover:text-slate-950">
          {open.has(n.key) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {n.label}
        </button>
      ) : <span className="pl-[18px]">{n.label}</span>}
    </td>
  );

  const workshops = byXuong?.workshops ?? [];
  const loading = mode === 'total' ? plan === null || actual === null : byXuongLoading || !byXuong;

  return (
    <div className="mb-8 bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
        <Target className="h-4 w-4 text-amber-600" />
        <h4 className="text-sm font-bold uppercase tracking-wide text-slate-700">Kế hoạch năm – Thực hiện nhập kho</h4>
        <span className="text-xs text-slate-500">
          · Năm {year}{mode === 'total' ? (xuong ? ` · Xưởng ${xuong}` : ' · Tất cả xưởng') : ' · Theo khu vực sản xuất'} · Đơn vị: Tỷ đồng
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
            {([['total', 'Tổng hợp'], ['xuong', 'Theo khu vực SX']] as const).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setMode(k)}
                className={`rounded-md px-2.5 py-0.5 text-xs font-semibold ${mode === k ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {l}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setOpen(new Set(ALL_KEYS))} className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">Mở hết</button>
          <button type="button" onClick={() => setOpen(new Set(['y']))} className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">Thu gọn</button>
        </div>
      </div>

      {loading ? (
        <p className="p-6 text-center text-sm text-slate-400">Đang tải…</p>
      ) : mode === 'total' ? (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Kỳ</th>
              <th className="px-4 py-2 text-right font-medium text-amber-700">Kế hoạch năm (tỷ)</th>
              <th className="px-4 py-2 text-right font-medium text-teal-700">Thực hiện nhập kho (tỷ)</th>
              <th className="w-56 px-4 py-2 text-left font-medium">% đạt</th>
              <th className="px-4 py-2 text-right font-medium">Chênh lệch (tỷ)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(n => {
              const kh = sumMonths(plan ?? undefined, n.months);
              const th = sumMonths(actual ?? undefined, n.months);
              const started = n.months[0] <= lastMonthWithData; // kỳ chưa tới: chưa đánh giá % đạt
              const pct = kh > 0 ? (th / kh) * 100 : 0;
              const diff = th - kh;
              return (
                <tr key={n.key} className={LEVEL_STYLE[n.level]}>
                  {labelCell(n, false)}
                  <td className="px-4 py-2 text-right tabular-nums text-amber-800">{formatTy(kh)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-teal-800">{started ? formatTy(th) : '—'}</td>
                  <td className="px-4 py-2">
                    {started && kh > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                          <div className={`h-1.5 rounded-full ${barTone(pct)}`} style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <span className="w-14 text-right text-xs tabular-nums">{pct.toFixed(1)}%</span>
                      </div>
                    ) : <span className="text-xs text-slate-300">—</span>}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums ${!started ? 'text-slate-300' : diff >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {started ? `${diff >= 0 ? '+' : ''}${formatTy(diff)}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        // Theo khu vực sản xuất: mỗi xưởng 3 cột KH / TH / % đạt, cuối bảng là Tổng
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th rowSpan={2} className="sticky left-0 z-20 bg-slate-50 px-4 py-2 text-left font-medium">Kỳ</th>
                {[...workshops, 'Tổng'].map(w => (
                  <th key={w} colSpan={3} className={`border-l border-slate-200 px-3 py-1.5 text-center font-semibold ${w === 'Tổng' ? 'bg-slate-100 text-slate-800' : 'text-slate-700'}`}>
                    {w}
                  </th>
                ))}
              </tr>
              <tr>
                {[...workshops, 'Tổng'].map(w => (
                  <React.Fragment key={w}>
                    <th className={`border-l border-slate-200 px-3 py-1 text-right font-medium text-amber-700 ${w === 'Tổng' ? 'bg-slate-100' : ''}`}>KH</th>
                    <th className={`px-3 py-1 text-right font-medium text-teal-700 ${w === 'Tổng' ? 'bg-slate-100' : ''}`}>TH</th>
                    <th className={`px-3 py-1 text-right font-medium text-slate-500 ${w === 'Tổng' ? 'bg-slate-100' : ''}`}>%</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(n => {
                const started = n.months[0] <= lastMonthWithData;
                let totKh = 0, totTh = 0;
                const cells = workshops.map(w => {
                  const kh = sumMonths(xuongMaps.planM[w], n.months);
                  const th = sumMonths(xuongMaps.actM[w], n.months);
                  totKh += kh; totTh += th;
                  return { w, kh, th };
                });
                const pair = (key: string, kh: number, th: number, total = false) => {
                  const pct = kh > 0 ? (th / kh) * 100 : null;
                  return (
                    <React.Fragment key={key}>
                      <td className={`border-l border-slate-100 px-3 py-1.5 text-right tabular-nums text-amber-800 ${total ? 'bg-slate-50 font-semibold' : ''}`}>
                        {kh ? formatTy(kh) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className={`px-3 py-1.5 text-right tabular-nums text-teal-800 ${total ? 'bg-slate-50 font-semibold' : ''}`}>
                        {!started ? <span className="text-slate-300">—</span> : formatTy(th)}
                      </td>
                      <td className={`px-3 py-1.5 text-right text-xs font-semibold tabular-nums ${total ? 'bg-slate-50' : ''} ${started && pct !== null ? pctTone(pct) : 'text-slate-300'}`}>
                        {started && pct !== null ? `${pct.toFixed(1)}%` : '—'}
                      </td>
                    </React.Fragment>
                  );
                };
                return (
                  <tr key={n.key} className={LEVEL_STYLE[n.level]}>
                    {labelCell(n, true)}
                    {cells.map(c => pair(c.w, c.kh, c.th))}
                    {pair('total', totKh, totTh, true)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-slate-100 px-5 py-2 text-[0.6875rem] text-slate-500">
        Kế hoạch: bảng khsx_nam (theo tháng × xưởng). Thực hiện: giá trị nhập kho (không tính hạng mục HỦY). Kỳ chưa tới chỉ hiện kế hoạch.
        {mode === 'total'
          ? ' Chế độ Tổng hợp theo bộ lọc Xưởng; bộ lọc công trình / ĐVT / nhóm SP không áp dụng vì kế hoạch năm không chia theo các tiêu chí đó.'
          : ' Cột xưởng theo "Setup gộp xưởng" (các xưởng nhỏ gộp vào xưởng / nhóm KHÁC do ADMIN setup).'}
      </p>
    </div>
  );
}
