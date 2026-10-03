import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { parseBotEnd } from '../../services/vuongMacMobileApi';
import type { VuongMacRow } from '../../services/vuongMacService';

// ============================================================================
// Phần dùng chung của app mobile (/m/): bảng màu, khung sheet, đăng nhập, cài app,
// định dạng thời gian, trạng thái + hạn BOT của 1 vướng mắc.
// ============================================================================

export const BG = 'bg-[#f4f6fa]';
export const NO_SCROLLBAR = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden';
export const CARD = 'rounded-2xl border border-slate-200/70 bg-white';

// text-base (16px) để iOS không tự phóng to khi bấm vào ô nhập
export const inputCls =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-slate-400';
export const btnPrimary =
  'w-full rounded-full bg-slate-900 py-3 text-base font-medium text-white active:opacity-80 disabled:opacity-40';
export const btnSecondary =
  'rounded-full border border-slate-300 bg-white px-4 py-2.5 text-base text-slate-700 active:bg-slate-100 disabled:opacity-40';

export const chipCls = (on: boolean) =>
  `shrink-0 rounded-full px-4 py-2 text-sm ${on ? 'bg-slate-900 font-medium text-white' : 'border border-slate-300 bg-white text-slate-600 active:bg-slate-100'}`;

// ---------------- Thời gian ----------------
export const pad = (n: number) => String(n).padStart(2, '0');

export const fmtTime = (s?: string | null) => (s ? new Date(s).toLocaleString('vi-VN', { hour12: false }) : '');

/** "HH:mm dd/MM/yyyy" — cùng định dạng với BOT */
export const fmtShort = (s?: string | null) => {
  if (!s) return '';
  const d = new Date(s);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/** Khoảng thời gian dạng ngắn: "5 phút", "3 giờ", "2 ngày" */
export const fmtSpan = (ms: number) => {
  const m = Math.max(1, Math.round(Math.abs(ms) / 60000));
  if (m < 60) return `${m} phút`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} giờ`;
  return `${Math.round(h / 24)} ngày`;
};

/** "vừa xong", "5 phút trước", "2 ngày trước" */
export const fmtAgo = (s?: string | null) => {
  if (!s) return '';
  const ms = Date.now() - new Date(s).getTime();
  return ms < 60000 ? 'vừa xong' : `${fmtSpan(ms)} trước`;
};

export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ---------------- Loại vướng mắc (5M) ----------------
const CAT_ICON: Record<string, string> = {
  man: '👷', machine: '⚙️', material: '🪵', method: '📋', measurement: '📏',
};
export const catIcon = (c: string) => CAT_ICON[c] ?? '🏷️';
// 5 loại riêng, mỗi loại 1 mã M1..M5
export const CAT_CODE: Record<string, string> = { man: 'M1', machine: 'M2', material: 'M3', method: 'M4', measurement: 'M5' };
export const CAT_NAME: Record<string, string> = {
  man: 'Con người', machine: 'Máy móc', material: 'Vật tư', method: 'Phương pháp', measurement: 'Đo lường',
};
/** "M1 · Con người" */
export const catLabel = (c: string) => (CAT_CODE[c] ? `${CAT_CODE[c]} · ${CAT_NAME[c]}` : c);

// ---------------- Trạng thái + hạn BOT ----------------
export type RowStatus = 'resolved' | 'overdue' | 'soon' | 'extended' | 'open';

export const STATUS_STYLE: Record<RowStatus, { label: string; icon: string; pill: string; bar: string; dot: string }> = {
  overdue:  { label: 'Quá hạn BOT',  icon: '⏰', pill: 'bg-red-100 text-red-700',         bar: 'bg-red-500',     dot: 'bg-red-500' },
  soon:     { label: 'Sắp đến hạn',  icon: '⌛', pill: 'bg-amber-100 text-amber-800',     bar: 'bg-amber-500',   dot: 'bg-amber-500' },
  extended: { label: 'Đã gia hạn',   icon: '🔁', pill: 'bg-yellow-100 text-yellow-800',   bar: 'bg-yellow-400',  dot: 'bg-yellow-400' },
  open:     { label: 'Tồn đọng',     icon: '🚧', pill: 'bg-blue-100 text-blue-800',       bar: 'bg-blue-500',    dot: 'bg-blue-500' },
  resolved: { label: 'Đã xử lý',     icon: '✓',  pill: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
};

const SOON_MS = 24 * 60 * 60 * 1000; // khớp backend: còn ≤ 24 giờ là "sắp đến hạn"

// Ưu tiên: đã xử lý > quá hạn > sắp đến hạn > đã gia hạn > tồn đọng
export const rowStatus = (v: VuongMacRow): RowStatus => {
  if (v.isResolved) return 'resolved';
  const end = parseBotEnd(v.bot);
  const left = end ? end.getTime() - Date.now() : null;
  if (left !== null && left < 0) return 'overdue';
  if (left !== null && left <= SOON_MS) return 'soon';
  if (v.extensions?.length) return 'extended';
  return 'open';
};

/** "Quá hạn 2 ngày" / "Còn 3 giờ" — null nếu đã xử lý hoặc không có BOT */
export const botCountdown = (v: VuongMacRow): { text: string; cls: string } | null => {
  if (v.isResolved) return null;
  const end = parseBotEnd(v.bot);
  if (!end) return null;
  const left = end.getTime() - Date.now();
  if (left < 0) return { text: `Quá hạn ${fmtSpan(left)}`, cls: 'text-red-600' };
  return { text: `Còn ${fmtSpan(left)}`, cls: left <= SOON_MS ? 'text-amber-700' : 'text-slate-500' };
};

/** Chữ cái đầu của tên (avatar) */
export const initials = (name?: string | null) => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts.length === 1 ? parts[0][0] : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// ---------------- Khung nhập liệu ----------------
// Nhãn nằm NGOÀI ô nhập; bên trong ô chỉ để gợi ý nhập
export function LabeledField({ label, required, children, className = '' }: {
  label: string; required?: boolean; children: ReactNode; className?: string;
}) {
  return (
    <label className={`block text-sm font-medium text-slate-700 ${className}`}>
      {label}{required && <span className="text-red-500"> *</span>}
      <div className="mt-1 font-normal">{children}</div>
    </label>
  );
}

// Render ra document.body để không bị thanh menu dưới hay khung cuộn cha che mất.
// Màn hẹp: trượt từ dưới lên. Màn rộng (md+): hộp thoại giữa màn hình.
// Tiêu đề và `footer` luôn đứng yên, chỉ phần giữa cuộn.
export function BottomSheet({ title, onClose, children, footer, headerExtra }: {
  title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; headerExtra?: ReactNode;
}) {
  // Khoá cuộn trang phía sau khi sheet mở
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 md:items-center md:p-4" onClick={onClose}>
      <div
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white md:max-h-[90dvh] md:max-w-3xl md:rounded-3xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 pt-3 md:pt-5">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-300 md:hidden" />
          <div className="flex items-center justify-between gap-2 pb-2">
            <h2 className="min-w-0 text-lg font-semibold text-slate-900">{title}</h2>
            <div className="flex shrink-0 items-center">
              {headerExtra}
              <button onClick={onClose} aria-label="Đóng" className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-slate-500 active:bg-slate-100">
                ✕
              </button>
            </div>
          </div>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 ${footer ? 'pb-4' : 'pb-[calc(env(safe-area-inset-bottom)+20px)] md:pb-5'}`}>
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-slate-100 bg-white px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] md:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ---------------- Đăng nhập ----------------
// Đăng nhập ngay trong /m/ (không phải sang trang desktop nên không ra khỏi scope của app đã cài)
export function MobileLogin({ onSuccess }: { onSuccess: () => void }) {
  const { login } = useAuth();
  const [username, setUsername] = useState(localStorage.getItem('saved_username') || '');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) { setErr('Vui lòng nhập đầy đủ thông tin'); return; }
    setBusy(true); setErr('');
    // rememberMe = true: token vào localStorage để app đã cài giữ được phiên
    const r = await login(username.trim(), password, true);
    setBusy(false);
    if (r.success) {
      localStorage.setItem('saved_username', username.trim());
      onSuccess();
    } else {
      setErr(r.message || 'Đăng nhập thất bại');
    }
  };

  return (
    <div className={`flex min-h-[100dvh] flex-col justify-center ${BG} px-5 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]`}>
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-3xl text-white">📋</div>
          <h1 className="text-2xl font-semibold text-slate-900">Vướng mắc sản xuất</h1>
          <p className="mt-1 text-sm text-slate-500">Đăng nhập bằng tài khoản Operations Hub</p>
        </div>
        <form onSubmit={submit} className={`${CARD} space-y-3 p-5`}>
          <LabeledField label="Tài khoản">
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Nhập tài khoản"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              className={inputCls}
            />
          </LabeledField>
          <LabeledField label="Mật khẩu">
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu"
                autoComplete="current-password"
                className={`${inputCls} pr-16`}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-1.5 text-sm text-slate-500 active:bg-slate-100"
              >
                {showPw ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
          </LabeledField>
          {err && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------------- Cài ứng dụng (PWA) ----------------
// Sự kiện cài PWA (chỉ Chrome/Edge Android & desktop có)
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * Thẻ mời cài app. `force` = luôn hiện (màn Tài khoản), bỏ qua lựa chọn "ẩn" trước đó.
 */
export function InstallBanner({ force = false }: { force?: boolean }) {
  // __installEvt do index.html bắt sớm, phòng khi sự kiện bắn trước lúc component này được tải
  const [evt, setEvt] = useState<InstallEvent | null>((window as any).__installEvt ?? null);
  const [installed, setInstalled] = useState(isStandalone());
  const [dismissed, setDismissed] = useState(localStorage.getItem('install_banner_hidden') === '1');
  const [showIOS, setShowIOS] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => { localStorage.setItem('install_banner_hidden', '1'); setDismissed(true); };

  const install = async () => {
    if (evt) {
      await evt.prompt();
      const { outcome } = await evt.userChoice;
      setEvt(null);
      (window as any).__installEvt = null;
      if (outcome === 'accepted') setInstalled(true);
    } else if (isIOS()) {
      setShowIOS(v => !v);
    }
  };

  if (installed) {
    return force ? <p className="text-sm text-emerald-700">✓ Đang dùng bản đã cài trên điện thoại</p> : null;
  }
  // Android: chỉ hiện khi trình duyệt cho phép cài. iPhone: luôn hiện kèm hướng dẫn.
  if ((!force && dismissed) || (!evt && !isIOS())) {
    return force ? <p className="text-sm text-slate-500">Mở trang này bằng Chrome (Android) hoặc Safari (iPhone) để cài.</p> : null;
  }

  return (
    <div className="rounded-2xl bg-[#e3ecfd] p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-xl">📲</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">Cài ứng dụng lên điện thoại</p>
          <p className="text-xs text-slate-600">Mở nhanh từ màn hình chính, nhận thông báo nhắc hạn BOT</p>
        </div>
        <button onClick={install} className="shrink-0 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white active:opacity-80">
          Cài đặt
        </button>
        {!force && <button onClick={dismiss} aria-label="Ẩn" className="shrink-0 px-1 text-slate-500">✕</button>}
      </div>
      {showIOS && (
        <p className="mt-3 rounded-xl bg-white/70 p-3 text-xs text-slate-700">
          Bấm nút <b>Chia sẻ</b> (hình vuông có mũi tên lên) ở thanh dưới của Safari, rồi chọn <b>Thêm vào Màn hình chính</b>.
          Lưu ý: phải mở bằng Safari, không mở trong Zalo hay Messenger.
        </p>
      )}
    </div>
  );
}

/** Toast nhỏ phía trên thanh menu dưới */
export function Toast({ text }: { text: string }) {
  if (!text) return null;
  return createPortal(
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] left-1/2 z-[90] max-w-[90vw] -translate-x-1/2 rounded-full bg-slate-900 px-5 py-2.5 text-sm text-white shadow-lg">
      {text}
    </div>,
    document.body
  );
}
