import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
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
  `shrink-0 rounded-full px-4 py-2 text-base ${on ? 'bg-slate-900 font-medium text-white' : 'border border-slate-300 bg-white text-slate-600 active:bg-slate-100'}`;

// ---------------- Thời gian / loại 5M / trạng thái: dùng chung với web (components/VuongMac/model.ts) ----------------
export {
  pad, fmtTime, fmtShort, fmtSpan, fmtAgo, dayKey, catIcon, CAT_CODE, CAT_NAME, catLabel, botCountdown, initials,
} from '../VuongMac/model';
import { displayState, DISPLAY_META, type DisplayState } from '../VuongMac/model';

/** Tên cũ: trạng thái hiển thị của 1 dòng (quy trình + hạn BOT) */
export type RowStatus = DisplayState;
export const STATUS_STYLE = DISPLAY_META;
export const rowStatus = (v: VuongMacRow): RowStatus => displayState(v);

// ---------------- Khung nhập liệu ----------------
// Nhãn nằm NGOÀI ô nhập; bên trong ô chỉ để gợi ý nhập
export function LabeledField({ label, required, children, className = '' }: {
  label: string; required?: boolean; children: ReactNode; className?: string;
}) {
  return (
    <label className={`block text-base font-medium text-slate-700 ${className}`}>
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
          <p className="mt-1 text-base text-slate-500">Đăng nhập bằng tài khoản Operations Hub</p>
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
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-1.5 text-base text-slate-500 active:bg-slate-100"
              >
                {showPw ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
          </LabeledField>
          {err && <p className="rounded-xl bg-red-50 px-3 py-2 text-base text-red-700">{err}</p>}
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
    return force ? <p className="text-base text-emerald-700">✓ Đang dùng bản đã cài trên điện thoại</p> : null;
  }
  // Android: chỉ hiện khi trình duyệt cho phép cài. iPhone: luôn hiện kèm hướng dẫn.
  if ((!force && dismissed) || (!evt && !isIOS())) {
    return force ? <p className="text-base text-slate-500">Mở trang này bằng Chrome (Android) hoặc Safari (iPhone) để cài.</p> : null;
  }

  return (
    <div className="rounded-2xl bg-[#e3ecfd] p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-xl">📲</div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium text-slate-900">Cài ứng dụng lên điện thoại</p>
          <p className="text-sm text-slate-600">Mở nhanh từ màn hình chính, nhận thông báo nhắc hạn BOT</p>
        </div>
        <button onClick={install} className="shrink-0 rounded-full bg-slate-900 px-4 py-2 text-base font-medium text-white active:opacity-80">
          Cài đặt
        </button>
        {!force && <button onClick={dismiss} aria-label="Ẩn" className="shrink-0 px-1 text-slate-500">✕</button>}
      </div>
      {showIOS && (
        <p className="mt-3 rounded-xl bg-white/70 p-3 text-sm text-slate-700">
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
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] left-1/2 z-[90] max-w-[90vw] -translate-x-1/2 rounded-full bg-slate-900 px-5 py-2.5 text-base text-white shadow-lg">
      {text}
    </div>,
    document.body
  );
}
