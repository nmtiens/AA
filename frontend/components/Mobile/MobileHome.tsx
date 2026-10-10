import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { RefreshCw, ChevronRight, Plus, Wrench, ClipboardCheck } from 'lucide-react';
import { fetchVuongMacStats, UNAUTHORIZED, type VuongMacStats, type FiveMCategory } from '../../services/vuongMacService';
import { useAuth } from '../../context/AuthContext';
import { BG, CARD, CAT_CODE, CAT_NAME, catIcon, fmtAgo, InstallBanner } from './mobileUi';
import type { ListFilters } from './listFilters';

// ============================================================================
// Màn "Tổng quan" của app điện thoại.
//  - Tổ trưởng / công nhân: nút báo vướng mắc to, việc tôi đã báo đang ở đâu, chờ tôi xác nhận.
//  - PC / kỹ thuật: việc tôi phải xử lý (quá hạn, sắp hạn, đang làm).
//  - Quản lý: tồn đọng theo hạn / loại / khu vực SX / công trình.
// Bấm vào ô nào thì mở tab Vướng mắc với bộ lọc tương ứng.
// ============================================================================

const WEEKDAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

export default function MobileHome({ active, onOpenList, onCreate, onUnauthorized, refreshKey, bell }: {
  active: boolean;
  onOpenList: (preset: Partial<ListFilters>) => void;
  onCreate: () => void;
  onUnauthorized: () => void;
  refreshKey: number;
  bell: ReactNode;
}) {
  const { user } = useAuth();
  const [stats, setStats] = useState<VuongMacStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      setStats(await fetchVuongMacStats());
    } catch (e: any) {
      if (e.message === UNAUTHORIZED) onUnauthorized();
      else setError(e.message || 'Không tải được số liệu');
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized]);

  useEffect(() => { if (active) load(); }, [active, refreshKey, load]);
  useEffect(() => {
    const on = () => document.visibilityState === 'visible' && active && load();
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [active, load]);

  const now = new Date();
  const name = stats?.fullName || user?.fullName || user?.username || '';
  const openActive = (p: Partial<ListFilters>) => onOpenList({ tab: 'active', ...p });
  const catMax = Math.max(1, ...Object.values(stats?.byCategory ?? {}).map(Number));
  const xMax = Math.max(1, ...(stats?.byXuong ?? []).map(x => x.open));
  const n = (v?: number) => (v === undefined ? '–' : v);

  return (
    <div className={`min-h-[100dvh] ${BG} px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] pt-[calc(env(safe-area-inset-top)+16px)]`}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base text-slate-500">{WEEKDAYS[now.getDay()]}, {now.toLocaleDateString('vi-VN')}</p>
          <h1 className="truncate text-2xl font-semibold text-slate-900">Xin chào{name ? `, ${name}` : ''}</h1>
          {stats && <p className="text-sm text-slate-400">Cập nhật {fmtAgo(stats.generatedAt)}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={load} aria-label="Làm mới" className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm active:bg-slate-100">
            <RefreshCw size="1.125em" className={loading ? 'animate-spin' : ''} />
          </button>
          {bell}
        </div>
      </header>

      {error && <p className="mb-3 rounded-2xl bg-red-50 p-3 text-base text-red-700">⚠️ {error}</p>}
      {stats && !stats.workflow && (
        <p className="mb-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">Máy chủ chưa chạy file SQL quy trình (2026-10-10) — số liệu chờ xác nhận / đang xử lý tạm là 0.</p>
      )}

      {/* Báo vướng mắc — thao tác chính của người ở xưởng */}
      <button onClick={onCreate} className="mb-3 flex w-full items-center gap-3 rounded-3xl bg-slate-900 p-4 text-left text-white active:opacity-90">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15"><Plus size="1.5em" /></span>
        <span className="min-w-0">
          <span className="block text-lg font-semibold">Báo vướng mắc</span>
          <span className="block text-sm text-slate-300">Chọn hạng mục → mô tả, chụp ảnh → giao người xử lý</span>
        </span>
        <ChevronRight size="1.125em" className="ml-auto shrink-0 text-slate-400" />
      </button>

      {/* Việc của tôi: tôi xử lý / tôi báo */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        <button onClick={() => openActive({ mine: 'assignee' })} className={`${CARD} p-4 text-left active:bg-slate-50`}>
          <p className="flex items-center gap-1.5 text-sm text-slate-500"><Wrench size="1em" /> Tôi phải xử lý</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums text-slate-900">{n(stats?.mine.open)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-sm">
            {!!stats?.mine.overdue && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">⏰ Quá hạn {stats.mine.overdue}</span>}
            {!!stats?.mine.soon && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">⌛ Sắp hạn {stats.mine.soon}</span>}
            {!!stats?.mine.doing && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-800">🔧 Đang làm {stats.mine.doing}</span>}
            {stats && !stats.mine.open && <span className="text-slate-400">Không có việc chờ 🎉</span>}
          </div>
        </button>
        <div className={`${CARD} flex flex-col p-4 text-left`}>
          <button onClick={() => onOpenList({ tab: 'waiting', mine: 'confirm' })} className="text-left active:opacity-70">
            <p className="flex items-center gap-1.5 text-sm text-slate-500"><ClipboardCheck size="1em" /> Chờ tôi xác nhận</p>
            <p className={`mt-1 text-4xl font-semibold tabular-nums ${stats?.mine.waiting ? 'text-teal-700' : 'text-slate-900'}`}>{n(stats?.mine.waiting)}</p>
          </button>
          <button onClick={() => onOpenList({ tab: 'notClosed', mine: 'reporter' })} className="mt-2 text-left text-sm text-slate-500 active:opacity-70">
            Việc tôi đã báo: <b className="text-slate-800">{n(stats?.mine.reported)}</b> <span className="underline">xem</span>
          </button>
        </div>
      </div>

      {/* Toàn bộ tồn đọng */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        <StatTile label="Quá hạn BOT" value={stats?.overdue} tone="text-red-600" dot="bg-red-500" onClick={() => openActive({ due: 'overdue' })} />
        <StatTile label="Sắp đến hạn" value={stats?.soon} tone="text-amber-600" dot="bg-amber-500" onClick={() => openActive({ due: 'soon' })} />
        <StatTile label="Chưa xong" value={stats?.open} tone="text-blue-700" dot="bg-blue-500" sub={stats ? `${stats.byStatus.open ?? 0} mới · ${stats.doing} đang xử lý` : undefined} onClick={() => openActive({})} />
        <StatTile label="Chờ xác nhận" value={stats?.waiting} tone="text-teal-700" dot="bg-teal-500" onClick={() => onOpenList({ tab: 'waiting' })} />
      </div>
      {stats && (
        <p className="mb-4 px-1 text-sm text-slate-500">
          Hôm nay: mới <b className="text-slate-800">{stats.createdToday}</b> · xử lý xong <b className="text-emerald-700">{stats.resolvedToday}</b>
          {stats.workflow && <> · đã đóng <b className="text-emerald-700">{stats.closedToday}</b></>}
          {stats.urgent > 0 && <> · <button onClick={() => openActive({ priority: 'urgent' })} className="font-semibold text-red-600 underline">🔥 {stats.urgent} khẩn</button></>}
          {stats.escalated > 0 && <> · <span className="font-semibold text-red-600">🚨 {stats.escalated} đã báo quản lý</span></>}
          {stats.noBot > 0 && <> · chưa có BOT <b>{stats.noBot}</b></>}
        </p>
      )}

      {/* Theo loại */}
      <section className={`${CARD} mb-4 p-4`}>
        <h2 className="mb-3 text-base font-semibold text-slate-800">Chưa xong theo loại</h2>
        <div className="space-y-1">
          {(Object.keys(CAT_CODE) as FiveMCategory[]).map(c => {
            const v = stats?.byCategory?.[c] ?? 0;
            return (
              <button key={c} onClick={() => openActive({ cat: c })} className="w-full rounded-xl px-1 py-1.5 text-left active:bg-slate-50">
                <div className="flex items-center justify-between text-base">
                  <span className="text-slate-700">{catIcon(c)} {CAT_CODE[c]} · {CAT_NAME[c]}</span>
                  <span className="font-semibold tabular-nums text-slate-900">{v}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-slate-800" style={{ width: `${(v / catMax) * 100}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Theo khu vực sản xuất */}
      {!!stats?.byXuong.length && (
        <section className={`${CARD} mb-4 p-4`}>
          <h2 className="mb-3 text-base font-semibold text-slate-800">Chưa xong theo khu vực SX</h2>
          <div className="space-y-1">
            {stats.byXuong.map(x => (
              <button key={x.name} onClick={() => openActive({ xuong: x.name })} className="w-full rounded-xl px-1 py-1.5 text-left active:bg-slate-50">
                <div className="flex items-center justify-between text-base">
                  <span className="text-slate-700">🏭 {x.name}</span>
                  <span className="tabular-nums">
                    {x.overdue > 0 && <span className="mr-2 text-sm font-medium text-red-600">{x.overdue} quá hạn</span>}
                    <span className="font-semibold text-slate-900">{x.open}</span>
                  </span>
                </div>
                <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-red-500" style={{ width: `${(x.overdue / xMax) * 100}%` }} />
                  <div className="h-full bg-slate-800" style={{ width: `${((x.open - x.overdue) / xMax) * 100}%` }} />
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Công trình cần chú ý */}
      <section className={`${CARD} mb-4 p-4`}>
        <h2 className="mb-2 text-base font-semibold text-slate-800">Công trình cần chú ý</h2>
        {stats && stats.topProjects.length === 0 && <p className="py-3 text-base text-slate-400">Không có vướng mắc tồn đọng 🎉</p>}
        <ul className="divide-y divide-slate-100">
          {stats?.topProjects.map(p => (
            <li key={p.name}>
              <button onClick={() => openActive({ congTrinh: p.name })} className="flex w-full items-center gap-3 py-2.5 text-left active:bg-slate-50">
                <span className="min-w-0 flex-1"><span className="line-clamp-2 text-base text-slate-800">{p.name}</span></span>
                <span className="shrink-0 text-right text-sm">
                  <span className="block font-semibold text-slate-900">{p.open} mở</span>
                  {p.overdue > 0 && <span className="block text-red-600">{p.overdue} quá hạn</span>}
                </span>
                <ChevronRight size="1em" className="shrink-0 text-slate-300" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <InstallBanner />
    </div>
  );
}

function StatTile({ label, value, tone, dot, sub, onClick }: {
  label: string; value?: number; tone: string; dot: string; sub?: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={`${CARD} p-4 text-left active:bg-slate-50`}>
      <p className="flex items-center gap-1.5 text-sm text-slate-500"><span className={`h-2 w-2 rounded-full ${dot}`} />{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${tone}`}>{value ?? '–'}</p>
      {sub && <p className="text-sm text-slate-400">{sub}</p>}
    </button>
  );
}
