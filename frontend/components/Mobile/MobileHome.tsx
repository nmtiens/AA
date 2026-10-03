import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { RefreshCw, ChevronRight, Plus } from 'lucide-react';
import { fetchVuongMacStats, UNAUTHORIZED, type VuongMacStats, type FiveMCategory } from '../../services/vuongMacService';
import { useAuth } from '../../context/AuthContext';
import { BG, CARD, CAT_CODE, CAT_NAME, catIcon, fmtAgo, InstallBanner } from './mobileUi';
import type { ListFilters } from './listFilters';

// ============================================================================
// Màn "Tổng quan" của app mobile: việc của tôi, số vướng mắc theo hạn BOT, theo loại,
// công trình cần chú ý. Bấm vào ô nào thì mở tab Vướng mắc với bộ lọc tương ứng.
// ============================================================================

const WEEKDAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

export default function MobileHome({ active, onOpenList, onCreate, onUnauthorized, refreshKey, bell }: {
  /** Tab đang hiện — chỉ tải lại khi được xem */
  active: boolean;
  onOpenList: (preset: Partial<ListFilters>) => void;
  onCreate: () => void;
  onUnauthorized: () => void;
  /** Đổi giá trị => tải lại (vd. sau khi thêm/sửa vướng mắc) */
  refreshKey: number;
  /** Nút chuông thông báo */
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

  // Tự làm mới khi mở lại app
  useEffect(() => {
    const on = () => document.visibilityState === 'visible' && active && load();
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [active, load]);

  const now = new Date();
  const name = stats?.fullName || user?.fullName || user?.username || '';
  const openAll = (p: Partial<ListFilters>) => onOpenList({ status: 'open', dateMode: 'all', ...p });

  const catMax = Math.max(1, ...Object.values(stats?.byCategory ?? {}).map(Number));

  return (
    <div className={`min-h-[100dvh] ${BG} px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] pt-[calc(env(safe-area-inset-top)+16px)]`}>
      {/* Lời chào */}
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base text-slate-500">{WEEKDAYS[now.getDay()]}, {now.toLocaleDateString('vi-VN')}</p>
          <h1 className="truncate text-2xl font-semibold text-slate-900">Xin chào{name ? `, ${name}` : ''}</h1>
          {stats && <p className="text-sm text-slate-400">Cập nhật {fmtAgo(stats.generatedAt)}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={load}
            aria-label="Làm mới"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm active:bg-slate-100"
          >
            <RefreshCw size="1.125em" className={loading ? 'animate-spin' : ''} />
          </button>
          {bell}
        </div>
      </header>

      {error && <p className="mb-3 rounded-2xl bg-red-50 p-3 text-base text-red-700">⚠️ {error}</p>}

      {/* Việc của tôi */}
      <button
        onClick={() => openAll({ mine: true })}
        className="mb-3 w-full rounded-3xl bg-slate-900 p-5 text-left text-white active:opacity-90"
      >
        <div className="flex items-center justify-between">
          <p className="text-base text-slate-300">Việc của tôi đang mở</p>
          <ChevronRight size="1.125em" className="text-slate-400" />
        </div>
        <p className="mt-1 text-4xl font-semibold tabular-nums">{stats ? stats.mine.open : '–'}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-base">
          <span className="rounded-full bg-red-500/20 px-3 py-1 text-red-200">⏰ Quá hạn {stats?.mine.overdue ?? 0}</span>
          <span className="rounded-full bg-amber-400/20 px-3 py-1 text-amber-100">⌛ Sắp đến hạn {stats?.mine.soon ?? 0}</span>
        </div>
        <p className="mt-2 text-sm text-slate-400">Vướng mắc tôi tạo hoặc tôi là người xử lý</p>
      </button>

      {/* 4 ô số liệu */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        <StatTile label="Quá hạn BOT" value={stats?.overdue} tone="text-red-600" dot="bg-red-500"
          onClick={() => openAll({ due: 'overdue' })} />
        <StatTile label="Sắp đến hạn" value={stats?.soon} tone="text-amber-600" dot="bg-amber-500"
          onClick={() => openAll({ due: 'soon' })} />
        <StatTile label="Tồn đọng" value={stats?.open} tone="text-blue-700" dot="bg-blue-500"
          onClick={() => openAll({})} />
        <StatTile label="Mới hôm nay" value={stats?.createdToday} tone="text-slate-900" dot="bg-slate-400"
          onClick={() => onOpenList({ status: 'all', dateMode: 'today' })} />
      </div>
      {stats && (
        <p className="mb-4 px-1 text-sm text-slate-500">
          Đã xử lý hôm nay <b className="text-emerald-700">{stats.resolvedToday}</b>
          {' · '}Đã gia hạn <b>{stats.extended}</b>
          {stats.noBot > 0 && <> · Chưa có BOT <b>{stats.noBot}</b></>}
        </p>
      )}

      {/* Thao tác nhanh */}
      {/* (Tra cứu HEX đã có ở thanh menu dưới nên không lặp lại ở đây) */}
      <button onClick={onCreate} className={`${CARD} mb-4 flex w-full items-center gap-3 p-4 text-left active:bg-slate-50`}>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white"><Plus size="1.25em" /></span>
        <span className="text-base font-medium text-slate-800">Thêm vướng mắc mới</span>
      </button>

      {/* Theo loại */}
      <section className={`${CARD} mb-4 p-4`}>
        <h2 className="mb-3 text-base font-semibold text-slate-800">Đang tồn đọng theo loại</h2>
        <div className="space-y-1">
          {(Object.keys(CAT_CODE) as FiveMCategory[]).map(c => {
            const n = stats?.byCategory?.[c] ?? 0;
            return (
              <button key={c} onClick={() => openAll({ cat: c })} className="w-full rounded-xl px-1 py-1.5 text-left active:bg-slate-50">
                <div className="flex items-center justify-between text-base">
                  <span className="text-slate-700">{catIcon(c)} {CAT_CODE[c]} · {CAT_NAME[c]}</span>
                  <span className="font-semibold tabular-nums text-slate-900">{n}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-slate-800" style={{ width: `${(n / catMax) * 100}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Công trình cần chú ý */}
      <section className={`${CARD} mb-4 p-4`}>
        <h2 className="mb-2 text-base font-semibold text-slate-800">Công trình cần chú ý</h2>
        {stats && stats.topProjects.length === 0 && <p className="py-3 text-base text-slate-400">Không có vướng mắc tồn đọng 🎉</p>}
        <ul className="divide-y divide-slate-100">
          {stats?.topProjects.map(p => (
            <li key={p.name}>
              <button onClick={() => openAll({ q: p.name })} className="flex w-full items-center gap-3 py-2.5 text-left active:bg-slate-50">
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-base text-slate-800">{p.name}</span>
                </span>
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

function StatTile({ label, value, tone, dot, onClick }: {
  label: string; value?: number; tone: string; dot: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={`${CARD} p-4 text-left active:bg-slate-50`}>
      <p className="flex items-center gap-1.5 text-sm text-slate-500">
        <span className={`h-2 w-2 rounded-full ${dot}`} />{label}
      </p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${tone}`}>{value ?? '–'}</p>
    </button>
  );
}
