import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, ClipboardList } from 'lucide-react';
import { TrangDangNhap } from '../DangNhapChung';
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
// Chỉ đóng bằng nút ✕ (hoặc nút ở footer) — chạm ra nền không đóng.
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
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 rmd:items-center rmd:p-4">
      <div
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white rmd:max-h-[90dvh] rmd:max-w-3xl rmd:rounded-3xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 pt-3 rmd:pt-5">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-300 rmd:hidden" />
          <div className="flex items-center justify-between gap-2 pb-2">
            <h2 className="min-w-0 text-lg font-semibold text-slate-900">{title}</h2>
            <div className="flex shrink-0 items-center">
              {headerExtra}
              <button onClick={onClose} aria-label="Đóng" className="-mr-3 flex h-12 w-12 items-center justify-center rounded-full text-slate-600 active:bg-slate-100">
                <X size={24} strokeWidth={2.25} />
              </button>
            </div>
          </div>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 ${footer ? 'pb-4' : 'pb-[calc(env(safe-area-inset-bottom)+20px)] rmd:pb-5'}`}>
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-slate-100 bg-white px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] rmd:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ---------------- Đăng nhập ----------------
// Đăng nhập ngay trong /m/ (không phải sang trang desktop nên không ra khỏi scope của app đã cài).
// Luồng và giao diện dùng chung với trang máy tính (components/DangNhapChung.tsx: Đăng nhập · Ghi nhớ · Quên mật khẩu
// qua mã OTP); "Ghi nhớ" bật sẵn để app đã cài giữ được phiên.
export function MobileLogin({ onSuccess, tieuDe = 'Vướng mắc sản xuất', bieuTuong }: { onSuccess: () => void; tieuDe?: string; bieuTuong?: ReactNode }) {
  return (
    <TrangDangNhap bieuTuong={bieuTuong ?? <ClipboardList className="h-7 w-7" strokeWidth={2} aria-hidden />}
      ten={tieuDe} moTa="Báo và theo dõi vướng mắc sản xuất" chan="Tài khoản do quản trị viên cấp · © 2026 Operations Hub"
      macDinhGhiNho baoMatSong sauDangNhap={onSuccess} />
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
export function InstallBanner({ force = false, tieuDe = 'Cài ứng dụng lên điện thoại', moTa = 'Mở nhanh từ màn hình chính, nhận thông báo nhắc hạn BOT', khoaAn = 'install_banner_hidden' }: {
  force?: boolean;
  tieuDe?: string;
  moTa?: string;
  /** Khoá localStorage nhớ "ẩn" — mỗi app (Vướng mắc / Xưởng) một khoá */
  khoaAn?: string;
}) {
  // __installEvt do index.html bắt sớm, phòng khi sự kiện bắn trước lúc component này được tải
  const [evt, setEvt] = useState<InstallEvent | null>((window as any).__installEvt ?? null);
  const [installed, setInstalled] = useState(isStandalone());
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(khoaAn) === '1'; } catch { return false; } });
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

  const dismiss = () => { try { localStorage.setItem(khoaAn, '1'); } catch { /* bỏ qua */ } setDismissed(true); };

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
          <p className="text-base font-medium text-slate-900">{tieuDe}</p>
          <p className="text-sm text-slate-600">{moTa}</p>
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
