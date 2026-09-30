import { useEffect, useState, useCallback, useRef, type ReactNode, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  FIVE_M_LABELS, FIVE_M_CATEGORIES, fetchVuongMacAllStrict, UNAUTHORIZED, updateVuongMac, extendVuongMac,
  deleteVuongMac, fetchVuongMacLog, createVuongMacStrict, uploadVuongMacPhoto, deleteVuongMacPhoto,
  fetchVuongMacPhotoUrl, fetchHexSearch,
  type VuongMacRow, type VuongMacLogEntry, type FiveMCategory, type HexHit,
} from '../../services/vuongMacService';
import { getToken } from '../../services/userService';
import { useAuth } from '../../context/AuthContext';
import {
  parseBotEnd, botStart, nowFmt, fmtLocalInput, pushSupported, isPushOn, enablePush, disablePush,
} from '../../services/vuongMacMobileApi';
import HexLookup from './HexLookup';
import PhotoPicker, { type PhotoItem } from './PhotoPicker';
import { formCategoriesFor } from './formCategories';

type VMItem = VuongMacRow;
type VMLog = VuongMacLogEntry;
type Sheet =
  | { type: 'resolve' | 'extend' | 'delete' | 'log' | 'edit'; row: VMItem }
  | { type: 'create' }
  | null;

// Bảng màu dùng chung (nền xám xanh nhạt, khối nội dung trắng bo góc lớn)
const BG = 'bg-[#f1f4f9]';
const NAV_BG = 'bg-[#e9eef6]';
const NAV_ACTIVE = 'bg-[#d3e3fd]';
const TEXT_SIZES = [16, 18, 20, 22];
const SIZE_LABELS = ['Nhỏ', 'Vừa', 'Lớn', 'Rất lớn'];
const DEFAULT_SIZE_IDX = 1;
const NO_SCROLLBAR = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden';
const MAX_PHOTOS = 5;

const fmtTime = (s?: string | null) => (s ? new Date(s).toLocaleString('vi-VN', { hour12: false }) : '');

// Các hàm trong service trả null/false khi lỗi -> đổi thành exception để sheet hiện lỗi
const must = <T,>(r: T | null | false, msg: string): T => {
  if (!r) throw new Error(msg);
  return r as T;
};

const pad = (n: number) => String(n).padStart(2, '0');

// Date -> giá trị cho <input type="datetime-local">
const dateToLocalInput = (d: Date | null) =>
  d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` : '';

// "HH:mm dd/MM/yyyy" (dạng lưu trong bot) -> giá trị cho <input type="datetime-local">
const botTextToLocalInput = (s?: string | null) => {
  const m = (s ?? '').trim().match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[5]}-${pad(+m[4])}-${pad(+m[3])}T${pad(+m[1])}:${m[2]}` : '';
};

// Nhãn nằm NGOÀI ô nhập; bên trong ô chỉ để gợi ý nhập
function LabeledField({ label, required, children, className = '' }: {
  label: string; required?: boolean; children: ReactNode; className?: string;
}) {
  return (
    <label className={`block text-sm font-medium text-slate-700 ${className}`}>
      {label}{required && <span className="text-red-500"> *</span>}
      <div className="mt-1 font-normal">{children}</div>
    </label>
  );
}

function botState(v: VMItem): { label: string; cls: string } | null {
  if (v.isResolved) return null;
  const end = parseBotEnd(v.bot);
  if (!end) return null;
  const mins = (end.getTime() - Date.now()) / 60000;
  if (mins <= 0) return { label: 'Quá hạn BOT', cls: 'bg-red-600 text-white' };
  if (mins <= 60) return { label: `Còn ${Math.ceil(mins)} phút`, cls: 'bg-amber-500 text-white' };
  return null;
}

// text-base (16px) để iOS không tự phóng to khi bấm vào ô nhập
const inputCls =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-slate-400';
const btnPrimary =
  'w-full rounded-full bg-slate-800 py-3 text-base font-medium text-white active:opacity-80 disabled:opacity-50';

// Render ra document.body để không bị thanh menu dưới (z-20) hay khung cuộn cha che mất.
// Màn hẹp: trượt từ dưới lên. Màn rộng (md+): hộp thoại giữa màn hình, rộng tối đa 4xl.
function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div
        className="max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] md:max-w-4xl md:rounded-3xl md:pb-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 md:hidden" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">{title}</h2>
          <button onClick={onClose} aria-label="Đóng" className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-slate-500 active:bg-slate-100">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

// Đăng nhập ngay trong /m/ (không phải sang trang desktop nên không ra khỏi scope của app đã cài)
function MobileLogin({ onSuccess }: { onSuccess: () => void }) {
  const { login } = useAuth();
  const [username, setUsername] = useState(localStorage.getItem('saved_username') || '');
  const [password, setPassword] = useState('');
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
    <form onSubmit={submit} className="space-y-3 p-5">
      <p className="text-lg font-medium text-slate-900">Đăng nhập để xem vướng mắc</p>
      <input
        value={username}
        onChange={e => setUsername(e.target.value)}
        placeholder="Tài khoản"
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="username"
        className={inputCls}
      />
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="Mật khẩu"
        autoComplete="current-password"
        className={inputCls}
      />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button type="submit" disabled={busy} className={btnPrimary}>
        {busy ? 'Đang đăng nhập...' : 'Đăng nhập'}
      </button>
    </form>
  );
}

// Sự kiện cài PWA (chỉ Chrome/Edge Android & desktop có)
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

function InstallBanner() {
  // __installEvt do index.html bắt sớm, phòng khi sự kiện bắn trước lúc component này được tải
  const [evt, setEvt] = useState<InstallEvent | null>((window as any).__installEvt ?? null);
  const [hidden, setHidden] = useState(
    isStandalone() || localStorage.getItem('install_banner_hidden') === '1'
  );
  const [showIOS, setShowIOS] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); };
    const onInstalled = () => setHidden(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => { localStorage.setItem('install_banner_hidden', '1'); setHidden(true); };

  const install = async () => {
    if (evt) {
      await evt.prompt();
      const { outcome } = await evt.userChoice;
      setEvt(null);
      (window as any).__installEvt = null;
      if (outcome === 'accepted') setHidden(true);
    } else if (isIOS()) {
      setShowIOS(v => !v);
    }
  };

  // Android: chỉ hiện khi trình duyệt cho phép cài. iPhone: luôn hiện kèm hướng dẫn.
  if (hidden || (!evt && !isIOS())) return null;

  return (
    <div className="mx-2 mb-2 rounded-3xl bg-[#d3e3fd] p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-xl">📲</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">Cài ứng dụng lên điện thoại</p>
          <p className="text-xs text-slate-600">Mở nhanh từ màn hình chính, nhận thông báo nhắc hạn BOT</p>
        </div>
        <button onClick={install} className="shrink-0 rounded-full bg-slate-800 px-4 py-2 text-sm font-medium text-white active:opacity-80">
          Cài đặt
        </button>
        <button onClick={dismiss} aria-label="Ẩn" className="shrink-0 px-1 text-slate-500">✕</button>
      </div>
      {showIOS && (
        <p className="mt-3 rounded-2xl bg-white/70 p-3 text-xs text-slate-700">
          Bấm nút <b>Chia sẻ</b> (hình vuông có mũi tên lên) ở thanh dưới của Safari, rồi chọn <b>Thêm vào Màn hình chính</b>.
          Lưu ý: phải mở bằng Safari, không mở trong Zalo hay Messenger.
        </p>
      )}
    </div>
  );
}

// ---------------- Ảnh đính kèm: hiển thị + xem phóng to ----------------
// Ảnh cần token nên tải bằng fetch -> objectURL (xem fetchVuongMacPhotoUrl)
function AuthImg({ id, className, onClick }: { id: number; className?: string; onClick?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setUrl(null); setFailed(false);
    fetchVuongMacPhotoUrl(id).then(u => alive && setUrl(u)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [id]);

  if (failed) {
    return <div className={`flex items-center justify-center bg-slate-100 text-xs text-slate-400 ${className ?? ''}`}>Lỗi ảnh</div>;
  }
  if (!url) return <div className={`animate-pulse bg-slate-200 ${className ?? ''}`} />;
  return <img src={url} alt="" onClick={onClick} className={className} />;
}

function PhotoLightbox({ ids, start, onClose }: { ids: number[]; start: number; onClose: () => void }) {
  const [idx, setIdx] = useState(start);
  const [zoom, setZoom] = useState(false);
  const go = (d: number) => { setIdx(i => (i + d + ids.length) % ids.length); setZoom(false); };
  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/95">
      <div className="flex items-center justify-between px-4 pb-2 pt-[calc(env(safe-area-inset-top)+8px)] text-white">
        <span className="text-sm">{idx + 1}/{ids.length}{zoom ? '' : ' · bấm ảnh để phóng to'}</span>
        <button onClick={onClose} aria-label="Đóng" className="flex h-11 w-11 items-center justify-center rounded-full text-xl active:bg-white/20">✕</button>
      </div>
      <div className={`relative min-h-0 flex-1 ${zoom ? 'overflow-auto' : 'flex items-center justify-center overflow-hidden'}`}>
        <AuthImg
          id={ids[idx]}
          onClick={() => setZoom(z => !z)}
          className={zoom ? 'max-w-none w-[250%]' : 'max-h-full max-w-full object-contain'}
        />
      </div>
      {ids.length > 1 && (
        <div className="flex justify-between px-6 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
          <button onClick={() => go(-1)} className="h-12 w-16 rounded-full bg-white/15 text-2xl text-white active:bg-white/30">‹</button>
          <button onClick={() => go(1)} className="h-12 w-16 rounded-full bg-white/15 text-2xl text-white active:bg-white/30">›</button>
        </div>
      )}
    </div>,
    document.body
  );
}

function VuongMacList({ onCycleSize, sizeLabel }: { onCycleSize: () => void; sizeLabel: string }) {
  const targetId = Number(new URLSearchParams(location.search).get('id')) || null;

  const [rows, setRows] = useState<VMItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'open' | 'resolved' | 'all'>(targetId ? 'all' : 'open');
  const [cat, setCat] = useState<FiveMCategory | ''>('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<number | null>(targetId);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [viewer, setViewer] = useState<{ ids: number[]; idx: number } | null>(null);
  const [toast, setToast] = useState('');
  const [pushOn, setPushOn] = useState(false);
  const focusId = useRef<number | null>(targetId);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const loadPage = useCallback(async (p: number, replace: boolean) => {
    setLoading(true); setError('');
    try {
      const r = await fetchVuongMacAllStrict({ status, category: cat, q, page: p });
      setRows(prev => (replace ? r.data : [...prev, ...r.data]));
      setTotal(r.total); setPage(p);
    } catch (e: any) {
      setError(e.message || 'Không tải được dữ liệu'); // 'UNAUTHORIZED' nếu chưa đăng nhập
    } finally {
      setLoading(false);
    }
  }, [status, cat, q]);

  const reload = useCallback(() => loadPage(1, true), [loadPage]);

  // Chưa có token thì không gọi API (tránh 401 lặp lại), chỉ hiện form đăng nhập
  useEffect(() => {
    if (!getToken()) { setError(UNAUTHORIZED); return; }
    const t = setTimeout(reload, 300);
    return () => clearTimeout(t);
  }, [reload]);

  // Tự làm mới khi mở lại app
  useEffect(() => {
    const on = () => document.visibilityState === 'visible' && getToken() && reload();
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [reload]);

  // Bấm thông báo khi app đang mở
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const h = (e: MessageEvent) => {
      if (e.data?.type === 'open-vuong-mac') {
        focusId.current = e.data.id;
        setStatus('all');
        setOpenId(e.data.id);
        if (getToken()) reload();
      }
    };
    navigator.serviceWorker.addEventListener('message', h);
    return () => navigator.serviceWorker.removeEventListener('message', h);
  }, [reload]);

  // Cuộn tới thẻ được mở từ thông báo
  useEffect(() => {
    if (focusId.current && rows.some(r => r.id === focusId.current)) {
      document.getElementById(`vm-${focusId.current}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      focusId.current = null;
    }
  }, [rows]);

  useEffect(() => { isPushOn().then(setPushOn); }, []);

  const togglePush = async () => {
    try {
      if (pushOn) { await disablePush(); setPushOn(false); flash('Đã tắt thông báo'); }
      else { await enablePush(); setPushOn(true); flash('Đã bật thông báo'); }
    } catch (e: any) {
      flash(e.message || 'Không bật được thông báo');
    }
  };

  const chip = (on: boolean) =>
    `shrink-0 rounded-full px-5 py-2.5 text-base ${on ? 'bg-[#d3e3fd] font-medium text-slate-900' : 'border border-slate-300 text-slate-600'}`;

  const avatarCls = (v: VMItem, bs: { cls: string } | null) =>
    v.isResolved ? 'bg-emerald-500' : bs?.cls.includes('red') ? 'bg-red-500' : bs ? 'bg-amber-500' : 'bg-orange-400';

  return (
    <div className={`min-h-[100dvh] ${BG} pb-[calc(env(safe-area-inset-bottom)+96px)]`}>
      <header className={`sticky top-0 z-10 space-y-3 ${BG} px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)]`}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-medium text-slate-900">Vướng mắc</h1>
            <p className="text-xs text-slate-500">{loading ? 'Đang tải...' : `${total} mục`}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onCycleSize}
              title="Đổi cỡ chữ"
              aria-label="Đổi cỡ chữ"
              className="flex h-12 min-w-12 items-center justify-center rounded-full px-2 text-base font-semibold text-slate-700 active:bg-slate-200"
            >
              Aa<span className="ml-0.5 text-[10px] font-normal text-slate-500">{sizeLabel}</span>
            </button>
            {pushSupported() && (
              <button
                onClick={togglePush}
                title="Thông báo"
                aria-label="Bật/tắt thông báo"
                className={`flex h-11 w-11 items-center justify-center rounded-full text-xl active:bg-slate-200 ${pushOn ? '' : 'opacity-40'}`}
              >
                🔔
              </button>
            )}
            <button
              onClick={reload}
              title="Làm mới"
              aria-label="Làm mới"
              className={`flex h-11 w-11 items-center justify-center rounded-full text-xl active:bg-slate-200 ${loading ? 'animate-spin' : ''}`}
            >
              ⟳
            </button>
          </div>
        </div>

        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Tìm nội dung, công trình, hex, người xử lý..."
          className="w-full rounded-full bg-white px-5 py-3 text-base text-slate-900 shadow-sm outline-none placeholder:text-slate-400"
        />

        <div className={`-mx-4 flex gap-2 overflow-x-auto px-4 ${NO_SCROLLBAR}`}>
          {(['open', 'resolved', 'all'] as const).map(s => (
            <button key={s} onClick={() => setStatus(s)} className={chip(status === s)}>
              {{ open: 'Tồn đọng', resolved: 'Đã xử lý', all: 'Tất cả' }[s]}
            </button>
          ))}
          <span className="w-px shrink-0 bg-slate-300" />
          <button onClick={() => setCat('')} className={chip(cat === '')}>Mọi loại</button>
          {FIVE_M_CATEGORIES.map(c => (
            <button key={c} onClick={() => setCat(c)} className={chip(cat === c)}>
              {FIVE_M_LABELS[c].split(' ')[0]}
            </button>
          ))}
        </div>
      </header>

      <InstallBanner />

      {/* Khối nội dung trắng bo góc lớn, các dòng ngăn cách bằng đường mảnh */}
      <main className="mx-2 min-h-[60dvh] overflow-hidden rounded-3xl bg-white">
        {error === UNAUTHORIZED ? (
          <MobileLogin onSuccess={() => { setError(''); reload(); }} />
        ) : error ? (
          <div className="space-y-3 p-5">
            <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
            <button onClick={reload} className={btnPrimary}>Thử lại</button>
          </div>
        ) : null}

        {rows.map(v => {
          const bs = botState(v);
          const open = openId === v.id;
          const title = v.congTrinh || v.hex;
          const photoIds = v.photos ?? [];
          return (
            <article
              id={`vm-${v.id}`}
              key={v.id}
              className={`border-b border-slate-100 px-4 py-4 last:border-b-0 ${open ? 'bg-slate-50' : ''}`}
            >
              <button className="flex w-full items-start gap-3 text-left" onClick={() => setOpenId(open ? null : v.id)}>
                <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-medium text-white ${avatarCls(v, bs)}`}>
                  {v.isResolved ? '✓' : (title || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-lg font-medium leading-snug text-slate-900 ${open ? '' : 'truncate'}`}>{title}</p>
                    {bs && (
                      <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${bs.cls}`}>{bs.label}</span>
                    )}
                  </div>
                  <p className={`text-base text-slate-500 ${open ? '' : 'truncate'}`}>
                    {v.hangMuc ? `${v.hangMuc} · ` : ''}{FIVE_M_LABELS[v.category]}
                  </p>
                  <p className={`mt-0.5 text-base text-slate-700 ${open ? '' : 'line-clamp-2'}`}>{v.content}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-600">
                    {v.handler && <span className="rounded-full bg-slate-100 px-3 py-1.5">Xử lý: {v.handler}</span>}
                    {v.bot && <span className="rounded-full bg-slate-100 px-3 py-1.5">BOT: {v.bot}</span>}
                    {photoIds.length > 0 && <span className="rounded-full bg-slate-100 px-3 py-1.5">📷 {photoIds.length}</span>}
                    {!!v.extensions?.length && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">Gia hạn ×{v.extensions.length}</span>
                    )}
                  </div>
                </div>
              </button>

              {open && (
                <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 text-base text-slate-700">
                  <p className="text-xs text-slate-500">
                    HEX {v.hex}{v.xuong ? ` · Xưởng ${v.xuong}` : ''} · Tạo bởi {v.createdBy} · {fmtTime(v.createdAt)}
                  </p>
                  {v.solution && <p><b>Giải pháp:</b> {v.solution}</p>}
                  {v.note && <p><b>Ghi chú:</b> {v.note}</p>}

                  {photoIds.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
                      {photoIds.map((pid, i) => (
                        <AuthImg
                          key={pid}
                          id={pid}
                          onClick={() => setViewer({ ids: photoIds, idx: i })}
                          className="aspect-square w-full rounded-2xl object-cover"
                        />
                      ))}
                    </div>
                  )}

                  {v.isResolved && (
                    <p className="rounded-2xl bg-emerald-50 p-3">
                      <b>Đã xử lý</b> ({v.resolvedBy}, {fmtTime(v.resolvedAt)}): {v.resolvedNote}
                    </p>
                  )}
                  {!!v.extensions?.length && (
                    <div className="space-y-2">
                      <p className="font-semibold">Lịch sử gia hạn</p>
                      <div className="grid gap-2 md:grid-cols-2">
                        {v.extensions.map(e => (
                          <div key={e.id} className="rounded-2xl bg-slate-100 p-3">
                            <p>{e.content}</p>
                            <p className="text-xs text-slate-500">BOT: {e.oldBot || '—'} → {e.bot}</p>
                            {e.note && <p className="text-xs text-slate-500">Ghi chú: {e.note}</p>}
                            <p className="text-xs text-slate-400">{e.createdBy} · {fmtTime(e.createdAt)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button onClick={() => setSheet({ type: 'log', row: v })} className="rounded-full border border-slate-300 bg-white px-5 py-3 active:bg-slate-100">
                      Nhật ký
                    </button>
                    {v.canModify && (
                      <button onClick={() => setSheet({ type: 'edit', row: v })} className="rounded-full border border-slate-300 bg-white px-5 py-3 active:bg-slate-100">
                        Sửa
                      </button>
                    )}
                    {v.canModify && !v.isResolved && (
                      <>
                        <button onClick={() => setSheet({ type: 'resolve', row: v })} className="rounded-full bg-emerald-600 px-5 py-3 text-white active:opacity-80">
                          Đã xử lý
                        </button>
                        <button onClick={() => setSheet({ type: 'extend', row: v })} className="rounded-full bg-amber-500 px-5 py-3 text-white active:opacity-80">
                          Cần thêm thời gian
                        </button>
                      </>
                    )}
                    {v.canModify && v.isResolved && (
                      <button
                        onClick={async () => {
                          try {
                            must(await updateVuongMac(v.id, { isResolved: false }), 'Không mở lại được (kiểm tra quyền)');
                            flash('Đã mở lại');
                            reload();
                          } catch (e: any) {
                            flash(e.message);
                          }
                        }}
                        className="rounded-full border border-slate-300 bg-white px-5 py-3 active:bg-slate-100"
                      >
                        Mở lại
                      </button>
                    )}
                    {v.canModify && (
                      <button onClick={() => setSheet({ type: 'delete', row: v })} className="rounded-full border border-red-300 bg-white px-5 py-3 text-red-600 active:bg-red-50">
                        Xóa
                      </button>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}

        {!loading && rows.length === 0 && !error && (
          <p className="px-6 py-20 text-center text-sm text-slate-400">
            Không có vướng mắc nào. Thử chọn "Tất cả" hoặc bỏ bớt bộ lọc.
          </p>
        )}
        {rows.length < total && (
          <div className="p-3">
            <button
              disabled={loading}
              onClick={() => loadPage(page + 1, false)}
              className="w-full rounded-full border border-slate-300 bg-white py-3 text-sm text-slate-700 active:bg-slate-100 disabled:opacity-50"
            >
              {loading ? 'Đang tải...' : `Tải thêm (${rows.length}/${total})`}
            </button>
          </div>
        )}
      </main>

      {/* Nút thêm mới (nằm trong tab "Vướng mắc" nên tự ẩn khi sang tab Tra cứu hex) */}
      {error !== UNAUTHORIZED && createPortal(
  <button
    onClick={() => setSheet({ type: 'create' })}
    aria-label="Thêm vướng mắc"
    className="fixed bottom-[calc(env(safe-area-inset-bottom)+6rem)] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 text-3xl text-white shadow-lg active:opacity-80"
  >
    +
  </button>,
  document.body
)}

      {sheet?.type === 'create' && (
        <FormSheet onClose={() => setSheet(null)} onDone={m => { setSheet(null); flash(m); reload(); }} />
      )}
      {sheet?.type === 'edit' && (
        <FormSheet row={sheet.row} onClose={() => setSheet(null)} onDone={m => { setSheet(null); flash(m); reload(); }} />
      )}
      {sheet?.type === 'resolve' && (
        <ResolveSheet row={sheet.row} onClose={() => setSheet(null)} onDone={() => { setSheet(null); flash('Đã đánh dấu xử lý'); reload(); }} />
      )}
      {sheet?.type === 'extend' && (
        <ExtendSheet row={sheet.row} onClose={() => setSheet(null)} onDone={() => { setSheet(null); flash('Đã gửi yêu cầu thêm thời gian'); reload(); }} />
      )}
      {sheet?.type === 'delete' && (
        <DeleteSheet row={sheet.row} onClose={() => setSheet(null)} onDone={() => { setSheet(null); flash('Đã xóa'); reload(); }} />
      )}
      {sheet?.type === 'log' && <LogSheet row={sheet.row} onClose={() => setSheet(null)} />}

      {viewer && <PhotoLightbox ids={viewer.ids} start={viewer.idx} onClose={() => setViewer(null)} />}

     {toast && createPortal(
  <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+6rem)] left-1/2 z-[90] max-w-[90vw] -translate-x-1/2 rounded-full bg-slate-900 px-5 py-2.5 text-sm text-white shadow-lg">
    {toast}
  </div>,
  document.body
)}
    </div>
  );
}

// ---------------- Các sheet ----------------
function useSubmit(fn: () => Promise<unknown>, onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setBusy(true); setErr('');
    try { await fn(); onDone(); }
    catch (e: any) { setErr(e.message || 'Có lỗi xảy ra'); }
    finally { setBusy(false); }
  };
  return { busy, err, submit };
}

// Form THÊM (không truyền row) và SỬA (truyền row), có chụp / đính kèm ảnh
function FormSheet({ row, onClose, onDone }: { row?: VMItem; onClose: () => void; onDone: (msg: string) => void }) {
  const editing = !!row;

  // Chọn HEX (chỉ khi thêm)
  const [picked, setPicked] = useState<HexHit | null>(null);
  const [hexQ, setHexQ] = useState('');
  const [hits, setHits] = useState<HexHit[]>([]);
  const [searching, setSearching] = useState(false);

  const [category, setCategory] = useState<FiveMCategory>(row?.category ?? 'man');
  const [content, setContent] = useState(row?.content ?? '');
  const [handler, setHandler] = useState(row?.handler ?? '');
  // BOT: thêm mới -> bắt đầu mặc định là bây giờ; sửa -> lấy sẵn từ BOT hiện tại
  const [start, setStart] = useState(() =>
    row ? botTextToLocalInput(botStart(row.bot)) : dateToLocalInput(new Date()));
  const [end, setEnd] = useState(() => (row ? dateToLocalInput(parseBotEnd(row.bot)) : ''));
  const [solution, setSolution] = useState(row?.solution ?? '');
  const [note, setNote] = useState(row?.note ?? '');

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [keptIds, setKeptIds] = useState<number[]>(row?.photos ?? []);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (editing || picked) return;
    const t = setTimeout(async () => {
      if (hexQ.trim().length < 2) { setHits([]); return; }
      setSearching(true);
      try { setHits(await fetchHexSearch(hexQ.trim())); } finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [hexQ, picked, editing]);

  const botInvalid = !!(start && end && end < start);
  const newBot = end
    ? `${fmtLocalInput(start || dateToLocalInput(new Date()))} - ${fmtLocalInput(end)}`
    : '';
  const canSubmit = !busy && !!content.trim() && (editing || !!picked) && !botInvalid;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true); setErr('');

    // Bước 1: lưu nội dung
    let id: number;
    try {
      if (row) {
        const patch: Parameters<typeof updateVuongMac>[1] = {
          category,
          content: content.trim(),
          handler: handler.trim(),
          solution: solution.trim(),
          note: note.trim(),
        };
        if (newBot && newBot !== row.bot) patch.bot = newBot;
        must(await updateVuongMac(row.id, patch), 'Không lưu được (kiểm tra quyền hoặc kết nối)');
        id = row.id;
      } else {
        const created = await createVuongMacStrict(picked!.hex, category, content.trim(), {
          handler: handler.trim(), bot: newBot, solution: solution.trim(), note: note.trim(),
        });
        id = created.id;
      }
    } catch (e: any) {
      setErr(e.message || 'Có lỗi xảy ra');
      setBusy(false);
      return;
    }

    // Bước 2: ảnh (nội dung đã lưu rồi nên lỗi ảnh chỉ báo, không bắt nhập lại)
    let failed = 0;
    if (row) {
      for (const pid of row.photos ?? []) {
        if (keptIds.includes(pid)) continue;
        try { await deleteVuongMacPhoto(pid); } catch { failed++; }
      }
    }
    for (const p of photos) {
      try { await uploadVuongMacPhoto(id, p.blob); } catch { failed++; }
    }

    setBusy(false);
    onDone(
      failed
        ? `Đã lưu, nhưng ${failed} ảnh bị lỗi. Bấm Sửa để thêm lại ảnh`
        : editing ? 'Đã lưu thay đổi' : 'Đã thêm vướng mắc'
    );
  };

  return (
    <BottomSheet title={editing ? 'Sửa vướng mắc' : 'Thêm vướng mắc'} onClose={onClose}>
      <div className="grid gap-3 md:grid-cols-2">
        {/* HEX */}
        <div className="md:col-span-2">
          {editing ? (
            <p className="rounded-2xl bg-slate-100 p-3 text-sm text-slate-600">
              HEX {row!.hex}{row!.congTrinh ? ` · ${row!.congTrinh}` : ''}
            </p>
          ) : picked ? (
            <div className="flex items-start justify-between gap-2 rounded-2xl bg-[#d3e3fd] p-3">
              <div className="min-w-0 text-sm text-slate-800">
                <p className="font-medium">HEX {picked.hex}</p>
                <p className="truncate">{picked.congTrinh}{picked.hangMuc ? ` · ${picked.hangMuc}` : ''}</p>
                {picked.xuong && <p className="text-xs text-slate-600">Xưởng {picked.xuong}</p>}
              </div>
              <button type="button" onClick={() => { setPicked(null); setHexQ(''); }} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-sm text-slate-700 active:bg-slate-100">
                Đổi
              </button>
            </div>
          ) : (
            <div>
              <LabeledField label="HEX / mã nhà máy / công trình / hạng mục" required>
                <input
                  value={hexQ}
                  onChange={e => setHexQ(e.target.value)}
                  placeholder="Nhập từ 2 ký tự để tìm..."
                  className={inputCls}
                />
              </LabeledField>
              {searching && <p className="mt-2 text-sm text-slate-400">Đang tìm...</p>}
              {hits.length > 0 && (
                <div className="mt-2 max-h-56 overflow-y-auto rounded-2xl border border-slate-200">
                  {hits.map(h => (
                    <button
                      type="button"
                      key={h.hex}
                      onClick={() => setPicked(h)}
                      className="block w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0 active:bg-slate-100"
                    >
                      <p className="text-sm font-medium text-slate-900">HEX {h.hex} · {h.congTrinh}</p>
                      <p className="truncate text-xs text-slate-500">{h.hangMuc}{h.xuong ? ` · Xưởng ${h.xuong}` : ''}</p>
                    </button>
                  ))}
                </div>
              )}
              {!searching && hexQ.trim().length >= 2 && hits.length === 0 && (
                <p className="mt-2 text-sm text-slate-400">Không tìm thấy HEX phù hợp.</p>
              )}
            </div>
          )}
        </div>

        {/* Loại */}
        <div className="md:col-span-2">
          <p className="mb-1 text-sm font-medium text-slate-700">Loại</p>
          <div className="flex flex-wrap gap-2">
            {formCategoriesFor(row?.category).map(c => (
              <button
                type="button"
                key={c.value}
                title={c.hint}
                onClick={() => setCategory(c.value)}
                className={`rounded-full px-4 py-2 text-sm ${category === c.value ? 'bg-[#d3e3fd] font-medium text-slate-900' : 'border border-slate-300 text-slate-600'}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <LabeledField label="Nội dung vướng mắc" required className="md:col-span-2">
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Mô tả vướng mắc đang gặp..."
            className={inputCls}
          />
        </LabeledField>

        <LabeledField label="Người xử lý">
          <input value={handler} onChange={e => setHandler(e.target.value)} maxLength={200}
            placeholder="Nhập tên người xử lý..." className={inputCls} />
        </LabeledField>

        {/* BOT: bắt đầu + kết thúc */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">
            BOT{editing && row!.bot ? <span className="font-normal text-slate-500"> (hiện tại: {row!.bot})</span> : null}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs text-slate-500">
              Bắt đầu
              <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} className={`${inputCls} mt-1`} />
            </label>
            <label className="block text-xs text-slate-500">
              Kết thúc
              <input type="datetime-local" min={start || undefined} value={end} onChange={e => setEnd(e.target.value)} className={`${inputCls} mt-1`} />
            </label>
          </div>
          {botInvalid && <p className="text-sm text-red-600">Thời gian kết thúc phải sau thời gian bắt đầu.</p>}
          {newBot && !botInvalid && <p className="text-sm text-slate-500">BOT: {newBot}</p>}
        </div>

        <LabeledField label="Giải pháp">
          <textarea value={solution} onChange={e => setSolution(e.target.value)} rows={2} maxLength={2000}
            placeholder="Nhập giải pháp dự kiến..." className={inputCls} />
        </LabeledField>
        <LabeledField label="Ghi chú">
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={2000}
            placeholder="Nhập ghi chú thêm..." className={inputCls} />
        </LabeledField>

        {/* Ảnh */}
        <div className="space-y-2 md:col-span-2">
          <p className="text-sm font-medium text-slate-700">Ảnh đính kèm</p>
          {keptIds.length > 0 && (
            <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
              {keptIds.map(pid => (
                <div key={pid} className="relative aspect-square overflow-hidden rounded-2xl bg-slate-100">
                  <AuthImg id={pid} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setKeptIds(ids => ids.filter(x => x !== pid))}
                    aria-label="Xóa ảnh"
                    className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <PhotoPicker value={photos} onChange={setPhotos} max={MAX_PHOTOS - keptIds.length} />
        </div>
      </div>

      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <button disabled={!canSubmit} onClick={submit} className={`${btnPrimary} mt-4`}>
        {busy ? (photos.length ? 'Đang lưu và tải ảnh...' : 'Đang lưu...') : editing ? 'Lưu thay đổi' : 'Thêm vướng mắc'}
      </button>
    </BottomSheet>
  );
}

function ResolveSheet({ row, onClose, onDone }: { row: VMItem; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const { busy, err, submit } = useSubmit(
    async () => must(
      await updateVuongMac(row.id, { isResolved: true, resolvedNote: note.trim() }),
      'Không lưu được (kiểm tra quyền hoặc kết nối)'),
    onDone);
  return (
    <BottomSheet title="Đánh dấu đã xử lý" onClose={onClose}>
      <p className="mb-3 line-clamp-2 text-sm text-slate-500">{row.content}</p>
      <LabeledField label="Nội dung đã xử lý" required>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Nhập nội dung đã xử lý..."
          className={inputCls}
        />
      </LabeledField>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <button disabled={busy || !note.trim()} onClick={submit} className={`${btnPrimary} mt-4`}>
        {busy ? 'Đang lưu...' : 'Xác nhận đã xử lý'}
      </button>
    </BottomSheet>
  );
}

function ExtendSheet({ row, onClose, onDone }: { row: VMItem; onClose: () => void; onDone: () => void }) {
  const [content, setContent] = useState('');
  const [start, setStart] = useState(() => botTextToLocalInput(botStart(row.bot)));
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');

  const botInvalid = !!(start && end && end < start);
  const startText = start ? fmtLocalInput(start) : (botStart(row.bot) || nowFmt());
  const newBot = end ? `${startText} - ${fmtLocalInput(end)}` : '';

  const { busy, err, submit } = useSubmit(
    async () => must(
      await extendVuongMac(row.id, { content: content.trim(), bot: newBot, note: note.trim() || undefined }),
      'Không gửi được (vướng mắc đã xử lý hoặc không có quyền)'),
    onDone);
  return (
    <BottomSheet title="Cần thêm thời gian" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-500">BOT hiện tại: {row.bot || '—'}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <LabeledField label="Lý do cần thêm thời gian" required className="md:col-span-2">
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Nhập lý do / nội dung cần thêm thời gian..."
            className={inputCls}
          />
        </LabeledField>

        <div className="space-y-2 md:col-span-2">
          <p className="text-sm font-medium text-slate-700">BOT mới <span className="text-red-500">*</span></p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs text-slate-500">
              Bắt đầu
              <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} className={`${inputCls} mt-1`} />
            </label>
            <label className="block text-xs text-slate-500">
              Kết thúc
              <input type="datetime-local" min={start || undefined} value={end} onChange={e => setEnd(e.target.value)} className={`${inputCls} mt-1`} />
            </label>
          </div>
          {botInvalid && <p className="text-sm text-red-600">Thời gian kết thúc phải sau thời gian bắt đầu.</p>}
          {newBot && !botInvalid && <p className="text-sm text-slate-500">BOT mới: {newBot}</p>}
        </div>

        <LabeledField label="Ghi chú" className="md:col-span-2">
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Nhập ghi chú thêm..." className={inputCls} />
        </LabeledField>
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <button disabled={busy || !content.trim() || !end || botInvalid} onClick={submit} className={`${btnPrimary} mt-4`}>
        {busy ? 'Đang gửi...' : 'Gửi yêu cầu'}
      </button>
    </BottomSheet>
  );
}

function DeleteSheet({ row, onClose, onDone }: { row: VMItem; onClose: () => void; onDone: () => void }) {
  const { busy, err, submit } = useSubmit(
    async () => must(await deleteVuongMac(row.id), 'Không xóa được (kiểm tra quyền)'),
    onDone);
  return (
    <BottomSheet title="Xóa vướng mắc?" onClose={onClose}>
      <p className="text-base text-slate-800">{row.content}</p>
      <p className="mt-2 text-sm text-slate-500">Lịch sử gia hạn và ảnh đính kèm cũng sẽ bị xóa. Thao tác này không hoàn tác được.</p>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <div className="mt-4 flex gap-3">
        <button onClick={onClose} className="flex-1 rounded-full border border-slate-300 py-3 text-base active:bg-slate-100">Hủy</button>
        <button disabled={busy} onClick={submit} className="flex-1 rounded-full bg-red-600 py-3 text-base font-medium text-white active:opacity-80 disabled:opacity-50">
          {busy ? 'Đang xóa...' : 'Xóa'}
        </button>
      </div>
    </BottomSheet>
  );
}

function LogSheet({ row, onClose }: { row: VMItem; onClose: () => void }) {
  const [logs, setLogs] = useState<VMLog[] | null>(null);
  useEffect(() => { fetchVuongMacLog(row.hex).then(setLogs); }, [row.hex]);
  return (
    <BottomSheet title={`Nhật ký · HEX ${row.hex}`} onClose={onClose}>
      {!logs && <p className="text-sm text-slate-400">Đang tải...</p>}
      <div className="grid gap-2 md:grid-cols-2">
        {logs?.map(l => (
          <div key={l.id} className="rounded-2xl bg-slate-100 p-3 text-sm">
            <p className="font-medium text-slate-800">
              {{ CREATE: 'Tạo mới', UPDATE: 'Cập nhật', DELETE: 'Xóa' }[l.action] ?? l.action} · {l.actor}
            </p>
            {l.contentAfter && <p className="text-slate-600">{l.contentAfter}</p>}
            {l.detail && <p className="whitespace-pre-line text-slate-500">{l.detail}</p>}
            <p className="text-xs text-slate-400">{fmtTime(l.actedAt)}</p>
          </div>
        ))}
      </div>
      {logs && logs.length === 0 && <p className="text-sm text-slate-400">Chưa có nhật ký.</p>}
    </BottomSheet>
  );
}

// ---------------- Trang chính: 2 tab (Vướng mắc | Tra cứu hex) ----------------
export default function VuongMacMobile() {
  const params = new URLSearchParams(location.search);
  const [tab, setTab] = useState<'list' | 'lookup'>(
    params.get('tab') === 'lookup' && !params.get('id') ? 'lookup' : 'list'
  );
  // Cỡ chữ toàn app: đổi font-size gốc nên mọi kích thước dùng rem (chữ, nút, khoảng cách) đều to lên theo
  const [sizeIdx, setSizeIdx] = useState(() => {
    const v = Number(localStorage.getItem('m_size_idx'));
    return Number.isInteger(v) && v >= 0 && v < TEXT_SIZES.length ? v : DEFAULT_SIZE_IDX;
  });
  useEffect(() => {
    document.documentElement.style.fontSize = `${TEXT_SIZES[sizeIdx]}px`;
    localStorage.setItem('m_size_idx', String(sizeIdx));
    return () => { document.documentElement.style.fontSize = ''; };
  }, [sizeIdx]);
  const cycleSize = () => setSizeIdx(i => (i + 1) % TEXT_SIZES.length);

  const tabBtn = (on: boolean) =>
    `flex flex-1 flex-col items-center gap-1 pt-2.5 pb-3 text-sm ${on ? 'font-medium text-slate-900' : 'text-slate-500'}`;
  const pill = (on: boolean) => `rounded-full px-7 py-1.5 text-2xl transition-colors ${on ? NAV_ACTIVE : ''}`;

  // Bấm thông báo khi đang ở tab "Tra cứu hex" -> tự chuyển về tab "Vướng mắc"
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const h = (e: MessageEvent) => {
      if (e.data?.type === 'open-vuong-mac') setTab('list');
    };
    navigator.serviceWorker.addEventListener('message', h);
    return () => navigator.serviceWorker.removeEventListener('message', h);
  }, []);

  return (
    <>
      {/* Khung cuộn riêng: không phụ thuộc overflow của html/body/#root */}
      <div className={`fixed inset-0 overflow-y-auto overscroll-contain ${BG}`}>
        {/* Giữ cả 2 tab luôn được mount (ẩn bằng CSS) để không mất bộ lọc / kết quả khi chuyển tab */}
        <div className={tab === 'list' ? '' : 'hidden'}><VuongMacList onCycleSize={cycleSize} sizeLabel={SIZE_LABELS[sizeIdx]} /></div>
        <div className={tab === 'lookup' ? '' : 'hidden'}><HexLookup /></div>
      </div>

      <nav className={`fixed inset-x-0 bottom-0 z-20 flex ${NAV_BG} pb-[env(safe-area-inset-bottom)]`}>
        <button onClick={() => setTab('list')} className={tabBtn(tab === 'list')}>
          <span className={pill(tab === 'list')}>📋</span>Vướng mắc
        </button>
        <button onClick={() => setTab('lookup')} className={tabBtn(tab === 'lookup')}>
          <span className={pill(tab === 'lookup')}>🔍</span>Tra cứu hex
        </button>
      </nav>
    </>
  );
}