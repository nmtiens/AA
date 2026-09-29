import { useEffect, useState, useCallback } from 'react';
import { fetchVuongMacAll, FIVE_M_LABELS, FIVE_M_CATEGORIES, type VuongMacRow, type FiveMCategory } from '../../services/vuongMacService';

export default function VuongMacMobile() {
  const [rows, setRows] = useState<VuongMacRow[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<'open' | 'resolved' | 'all'>('open');
  const [cat, setCat] = useState<FiveMCategory | ''>('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetchVuongMacAll({ status, category: cat, q });
    setRows(r.data); setTotal(r.total);
    setLoading(false);
  }, [status, cat, q]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);
  useEffect(() => { // tự làm mới khi mở lại app
    const on = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [load]);

  const chip = (on: boolean) =>
    `shrink-0 rounded-full border px-3 py-1 text-xs ${on ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`;

  return (
    <div className="min-h-screen bg-slate-50 pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-10 space-y-2 bg-white px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-red-800">Vướng mắc</h1>
          <span className="text-xs text-slate-500">{loading ? 'Đang tải...' : `${total} mục`}</span>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm nội dung, công trình, hex, người xử lý..."
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        <div className="flex gap-2 overflow-x-auto">
          {(['open', 'resolved', 'all'] as const).map(s => (
            <button key={s} onClick={() => setStatus(s)} className={chip(status === s)}>
              {{ open: 'Tồn đọng', resolved: 'Đã xử lý', all: 'Tất cả' }[s]}
            </button>
          ))}
          <span className="w-px bg-slate-200" />
          <button onClick={() => setCat('')} className={chip(cat === '')}>Mọi loại</button>
          {FIVE_M_CATEGORIES.map(c => (
            <button key={c} onClick={() => setCat(c)} className={chip(cat === c)}>{FIVE_M_LABELS[c].split(' ')[0]}</button>
          ))}
        </div>
      </header>

      <main className="space-y-3 p-4">
        {rows.map(v => (
          <article key={v.id} className={`rounded-xl border p-3 shadow-sm ${v.isResolved ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
            <p className="text-[11px] text-slate-500">{v.congTrinh || v.hex} · {FIVE_M_LABELS[v.category]}</p>
            <p className="mt-1 text-sm text-slate-900">{v.content}</p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-600">
              {v.handler && <span className="rounded-full bg-white px-2 py-0.5">Xử lý: {v.handler}</span>}
              {v.bot && <span className="rounded-full bg-white px-2 py-0.5">BOT: {v.bot}</span>}
              {!!v.extensions?.length && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">Gia hạn ×{v.extensions.length}</span>}
            </div>
          </article>
        ))}
        {!loading && rows.length === 0 && <p className="py-16 text-center text-sm text-slate-400">Không có vướng mắc nào.</p>}
      </main>
    </div>
  );
}