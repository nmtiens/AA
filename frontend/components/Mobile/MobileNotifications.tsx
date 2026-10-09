import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import {
  fetchNotifications, markNotificationsRead, type AppNotification, type NotifyKind,
} from '../../services/notificationService';
import { BottomSheet, fmtAgo, dayKey } from './mobileUi';

const KIND_ICON: Record<NotifyKind, string> = {
  mention: '💬', assigned: '👤', resolved: '✅', reopened: '↩️', extend: '⏳',
  due60: '⌛', due15: '⌛', overdue: '⏰', new_in_dept: '🆕',
  accepted: '🔧', closed: '🔒', comment: '💬', escalated: '🚨',
};
const KIND_BG: Record<NotifyKind, string> = {
  mention: 'bg-blue-100', assigned: 'bg-indigo-100', resolved: 'bg-emerald-100', reopened: 'bg-slate-100',
  extend: 'bg-amber-100', due60: 'bg-amber-100', due15: 'bg-amber-100', overdue: 'bg-red-100', new_in_dept: 'bg-slate-100',
  accepted: 'bg-indigo-100', closed: 'bg-emerald-100', comment: 'bg-blue-100', escalated: 'bg-red-100',
};

/** Nút chuông có số chưa đọc */
export function BellButton({ unread, onClick }: { unread: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={unread ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}
      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm active:bg-slate-100"
    >
      <Bell size="1.125em" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-semibold text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}

/**
 * Hộp thông báo: danh sách (mới nhất trước), chia "Hôm nay" / "Trước đó", bấm 1 thông báo
 * => đánh dấu đã đọc + mở vướng mắc đó.
 */
export default function MobileNotifications({ onClose, onOpenItem, onUnreadChange }: {
  onClose: () => void;
  onOpenItem: (vuongMacId: number, hex?: string | null) => void;
  onUnreadChange: (n: number) => void;
}) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (before?: number) => {
    setLoading(true); setError('');
    try {
      const r = await fetchNotifications(before);
      setItems(prev => (before ? [...prev, ...r.items] : r.items));
      setHasMore(r.hasMore);
      setAvailable(r.available);
      onUnreadChange(r.unread);
    } catch (e: any) {
      setError(e.message || 'Không tải được thông báo');
    } finally {
      setLoading(false);
    }
  }, [onUnreadChange]);

  useEffect(() => { load(); }, [load]);

  const readAll = async () => {
    try {
      await markNotificationsRead();
      setItems(list => list.map(n => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
      onUnreadChange(0);
    } catch (e: any) { setError(e.message); }
  };

  const open = async (n: AppNotification) => {
    if (!n.readAt) {
      markNotificationsRead([n.id]).catch(() => {});
      setItems(list => list.map(x => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      onUnreadChange(Math.max(0, items.filter(x => !x.readAt).length - 1));
    }
    if (n.vuongMacId) onOpenItem(n.vuongMacId, n.hex);
  };

  const today = dayKey(new Date());
  const groups = [
    { title: 'Hôm nay', list: items.filter(n => dayKey(new Date(n.createdAt)) === today) },
    { title: 'Trước đó', list: items.filter(n => dayKey(new Date(n.createdAt)) !== today) },
  ].filter(g => g.list.length > 0);
  const unread = items.filter(n => !n.readAt).length;

  return (
    <BottomSheet
      title="Thông báo"
      onClose={onClose}
      headerExtra={unread > 0 && (
        <button onClick={readAll} className="mr-1 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-base text-slate-600 active:bg-slate-100">
          <CheckCheck size="1em" /> Đọc hết
        </button>
      )}
    >
      {!available && (
        <p className="rounded-2xl bg-amber-50 p-3 text-base text-amber-800">
          Hộp thông báo chưa được bật trên máy chủ (cần chạy file SQL tạo bảng thông báo). Thông báo đẩy trên điện thoại vẫn hoạt động nếu đã bật.
        </p>
      )}
      {error && <p className="mb-2 rounded-2xl bg-red-50 p-3 text-base text-red-700">⚠️ {error}</p>}

      {available && !loading && items.length === 0 && !error && (
        <div className="py-14 text-center text-base text-slate-400">
          <p className="mb-2 text-4xl">🔔</p>
          Chưa có thông báo nào.
        </div>
      )}

      <div className="space-y-4">
        {groups.map(g => (
          <section key={g.title}>
            <p className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-slate-400">{g.title}</p>
            <ul className="space-y-1.5">
              {g.list.map(n => (
                <li key={n.id}>
                  <button
                    onClick={() => open(n)}
                    className={`flex w-full items-start gap-3 rounded-2xl p-3 text-left active:bg-slate-100 ${n.readAt ? '' : 'bg-blue-50/70'}`}
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${KIND_BG[n.kind] ?? 'bg-slate-100'}`}>
                      {KIND_ICON[n.kind] ?? '🔔'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-base leading-snug ${n.readAt ? 'text-slate-700' : 'font-semibold text-slate-900'}`}>{n.title}</span>
                      {n.body && <span className="mt-0.5 line-clamp-2 block text-base text-slate-500">{n.body}</span>}
                      <span className="mt-0.5 block text-sm text-slate-400">{fmtAgo(n.createdAt)}</span>
                    </span>
                    {!n.readAt && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600" />}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {loading && <p className="py-4 text-center text-base text-slate-400">Đang tải...</p>}
      {hasMore && !loading && (
        <button
          onClick={() => load(items[items.length - 1]?.id)}
          className="mt-3 w-full rounded-full border border-slate-300 bg-white py-3 text-base text-slate-700 active:bg-slate-100"
        >
          Xem thông báo cũ hơn
        </button>
      )}
    </BottomSheet>
  );
}
