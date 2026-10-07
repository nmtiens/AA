import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Target } from 'lucide-react';
import { useTrendFilter } from './TrendFilterContext';
import { fetchYearPlan } from '../../../../services/dataService';
import { formatTy, trieuToTy } from '../../../../utils/money';

// ============================================================================
// Bảng Kế hoạch năm (khsx_nam) – Thực hiện (nhập kho) phân cấp:
//   Năm → 6 tháng đầu / cuối năm → Quý → Tháng
// Hiện trong "Chi tiết Nhập Kho" khi mở từ ô "Kế hoạch năm" (thay cho các biểu đồ theo
// công trình / nhóm SP / ĐVT, vì kế hoạch năm chỉ có theo tháng × xưởng).
// Theo bộ lọc Xưởng của trang; năm = năm của khoảng ngày đang chọn. Đơn vị Tỷ đồng.
// ============================================================================

type Node = { key: string; label: string; level: number; months: number[]; children?: Node[] };

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

export default function YearPlanTable() {
  const { dateFrom, dateTo, xuong } = useTrendFilter();
  const year = Number((dateTo || dateFrom || '').slice(0, 4)) || new Date().getFullYear();

  const [plan, setPlan] = useState<Record<number, number> | null>(null);
  const [actual, setActual] = useState<Record<number, number> | null>(null);
  // Mặc định mở tới cấp Quý; bấm Quý để xem từng tháng
  const [open, setOpen] = useState<Set<string>>(new Set(['y', 'h1', 'h2']));

  useEffect(() => {
    let cancelled = false;
    setPlan(null); setActual(null);
    fetchYearPlan(`${year}-01`, `${year}-12`, xuong || undefined).then(d => {
      if (cancelled) return;
      const m: Record<number, number> = {};
      (d?.byMonth ?? []).forEach(p => { m[Number(p.period.slice(5, 7))] = p.value; });
      setPlan(m);
    });
    const q = new URLSearchParams({ source: 'inventory', granularity: 'month', dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` });
    if (xuong) q.set('xuong', xuong);
    fetch(`/api/trend?${q.toString()}`)
      .then(r => (r.ok ? r.json() : []))
      .then((rows: { period: string; total: number }[]) => {
        if (cancelled) return;
        const m: Record<number, number> = {};
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

  const tree = useMemo(() => buildTree(year), [year]);
  const now = new Date();
  const lastMonthWithData = now.getFullYear() === year ? now.getMonth() + 1 : now.getFullYear() > year ? 12 : 0;

  const sum = (src: Record<number, number> | null, months: number[]) =>
    src ? months.reduce((s, m) => s + (src[m] ?? 0), 0) : null;

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
  const allKeys = ['y', 'h1', 'h2', 'q1', 'q2', 'q3', 'q4'];
  const loading = plan === null || actual === null;

  const LEVEL_STYLE = [
    'bg-emerald-50 font-bold text-slate-900',
    'bg-slate-50 font-semibold text-slate-800',
    'font-semibold text-slate-700',
    'text-slate-600',
  ];

  return (
    <div className="mb-8 bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
        <Target className="h-4 w-4 text-amber-600" />
        <h4 className="text-sm font-bold uppercase tracking-wide text-slate-700">Kế hoạch năm – Thực hiện nhập kho</h4>
        <span className="text-xs text-slate-500">
          · Năm {year}{xuong ? ` · Xưởng ${xuong}` : ' · Tất cả xưởng'} · Đơn vị: Tỷ đồng
        </span>
        <div className="ml-auto flex gap-1">
          <button type="button" onClick={() => setOpen(new Set(allKeys))} className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">Mở hết</button>
          <button type="button" onClick={() => setOpen(new Set(['y']))} className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">Thu gọn</button>
        </div>
      </div>
      {loading ? (
        <p className="p-6 text-center text-sm text-slate-400">Đang tải…</p>
      ) : (
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
              const kh = sum(plan, n.months) ?? 0;
              const th = sum(actual, n.months) ?? 0;
              const started = n.months[0] <= lastMonthWithData; // kỳ chưa tới: chưa đánh giá % đạt
              const pct = kh > 0 ? (th / kh) * 100 : 0;
              const diff = th - kh;
              const hasChildren = !!n.children;
              const isOpen = open.has(n.key);
              return (
                <tr key={n.key} className={LEVEL_STYLE[n.level]}>
                  <td className="px-4 py-2" style={{ paddingLeft: 16 + n.level * 20 }}>
                    {hasChildren ? (
                      <button type="button" onClick={() => toggle(n.key)} className="inline-flex items-center gap-1 hover:text-slate-950">
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {n.label}
                      </button>
                    ) : <span className="pl-[18px]">{n.label}</span>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-amber-800">{formatTy(kh)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-teal-800">{started ? formatTy(th) : '—'}</td>
                  <td className="px-4 py-2">
                    {started && kh > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                          <div
                            className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-emerald-500' : pct >= 80 ? 'bg-amber-400' : 'bg-red-400'}`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
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
      )}
      <p className="border-t border-slate-100 px-5 py-2 text-[0.6875rem] text-slate-500">
        Kế hoạch: bảng khsx_nam (theo tháng × xưởng). Thực hiện: giá trị nhập kho (không tính hạng mục HỦY), theo bộ lọc Xưởng.
        Kỳ chưa tới chỉ hiện kế hoạch. Bộ lọc công trình / ĐVT / nhóm SP không áp dụng cho bảng này vì kế hoạch năm không chia theo các tiêu chí đó.
      </p>
    </div>
  );
}
