import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, LogOut, Monitor, Type, Smartphone } from 'lucide-react';
import {
  fetchNotifyPrefs, saveNotifyPrefs, PREF_LABELS, type NotifyPrefs, type PrefKey,
} from '../../services/notificationService';
import { useAuth } from '../../context/AuthContext';
import { pushSupported, isPushOn, enablePush, disablePush } from '../../services/vuongMacMobileApi';
import { BG, CARD, InstallBanner, initials } from './mobileUi';

// ============================================================================
// Màn "Tài khoản": thông tin người dùng, cỡ chữ, thông báo nhắc hạn BOT, cài app,
// mở bản máy tính, đăng xuất.
// ============================================================================

export default function MobileAccount({ sizeIdx, sizeLabels, onSizeChange, onLoggedOut, flash }: {
  sizeIdx: number;
  sizeLabels: string[];
  onSizeChange: (i: number) => void;
  onLoggedOut: () => void;
  flash: (msg: string) => void;
}) {
  const { user, logout } = useAuth();
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => { isPushOn().then(setPushOn); }, []);

  // Cài đặt từng loại thông báo (lưu trên máy chủ, áp cho cả hộp thông báo lẫn thông báo đẩy)
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null);
  const [prefsAvailable, setPrefsAvailable] = useState(true);
  useEffect(() => {
    fetchNotifyPrefs()
      .then(r => { setPrefs(r.prefs); setPrefsAvailable(r.available); })
      .catch(() => setPrefsAvailable(false));
  }, []);
  const togglePref = async (k: PrefKey) => {
    if (!prefs) return;
    const before = prefs;
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next); // đổi ngay trên giao diện, lỗi thì trả lại
    try {
      setPrefs((await saveNotifyPrefs({ [k]: next[k] })).prefs);
    } catch (e: any) {
      setPrefs(before);
      flash(e.message || 'Không lưu được cài đặt');
    }
  };

  const togglePush = async () => {
    setPushBusy(true);
    try {
      if (pushOn) { await disablePush(); setPushOn(false); flash('Đã tắt thông báo'); }
      else { await enablePush(); setPushOn(true); flash('Đã bật thông báo'); }
    } catch (e: any) {
      flash(e.message || 'Không bật được thông báo');
    } finally {
      setPushBusy(false);
    }
  };

  const doLogout = () => {
    if (!window.confirm('Đăng xuất khỏi ứng dụng?')) return;
    logout();
    onLoggedOut();
  };

  const name = user?.fullName || user?.username || '';

  return (
    <div className={`min-h-[100dvh] ${BG} space-y-4 px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] pt-[calc(env(safe-area-inset-top)+16px)]`}>
      <h1 className="text-2xl font-semibold text-slate-900">Tài khoản</h1>

      {/* Người dùng */}
      <section className={`${CARD} flex items-center gap-4 p-4`}>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-900 text-lg font-semibold text-white">
          {initials(name)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-slate-900">{name || '—'}</p>
          <p className="truncate text-sm text-slate-500">
            {user?.username}{user?.department ? ` · ${user.department}` : ''}{user?.role === 'ADMIN' ? ' · Quản trị' : ''}
          </p>
        </div>
      </section>

      {/* Cỡ chữ */}
      <section className={`${CARD} p-4`}>
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><Type size={16} /> Cỡ chữ</p>
        <div className="grid grid-cols-4 gap-1 rounded-full bg-slate-100 p-1">
          {sizeLabels.map((l, i) => (
            <button
              key={l}
              onClick={() => onSizeChange(i)}
              className={`rounded-full py-2 text-sm ${sizeIdx === i ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              {l}
            </button>
          ))}
        </div>
      </section>

      {/* Thông báo */}
      <section className={`${CARD} p-4`}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            {pushOn ? <Bell size={18} /> : <BellOff size={18} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800">Thông báo trên điện thoại</p>
            <p className="text-xs text-slate-500">
              {pushSupported() ? 'Hiện thông báo kể cả khi đang không mở app' : 'Thiết bị / trình duyệt này chưa hỗ trợ thông báo'}
            </p>
          </div>
          {pushSupported() && <Switch on={pushOn} disabled={pushBusy} onClick={togglePush} label="Thông báo trên điện thoại" />}
        </div>
      </section>

      {/* Loại thông báo muốn nhận */}
      <section className={`${CARD} p-4`}>
        <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800"><BellRing size={16} /> Nhận thông báo khi</p>
        {!prefsAvailable ? (
          <p className="text-xs text-amber-700">Máy chủ chưa bật cài đặt thông báo (cần chạy file SQL). Hiện đang dùng mặc định.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(Object.keys(PREF_LABELS) as PrefKey[]).map(k => (
              <li key={k} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800">{PREF_LABELS[k].label}</p>
                  <p className="text-xs text-slate-500">{PREF_LABELS[k].hint}</p>
                </div>
                <Switch on={!!prefs?.[k]} disabled={!prefs} onClick={() => togglePref(k)} label={PREF_LABELS[k].label} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Cài app */}
      <section className={`${CARD} p-4`}>
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><Smartphone size={16} /> Ứng dụng</p>
        <InstallBanner force />
      </section>

      {/* Bản máy tính + đăng xuất */}
      <section className={`${CARD} divide-y divide-slate-100`}>
        <a href="/" className="flex items-center gap-3 p-4 text-sm text-slate-800 active:bg-slate-50">
          <Monitor size={18} className="text-slate-500" /> Mở bản đầy đủ (máy tính)
        </a>
        <button onClick={doLogout} className="flex w-full items-center gap-3 p-4 text-left text-sm text-red-600 active:bg-red-50">
          <LogOut size={18} /> Đăng xuất
        </button>
      </section>
    </div>
  );
}

function Switch({ on, disabled, onClick, label }: { on: boolean; disabled?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}
