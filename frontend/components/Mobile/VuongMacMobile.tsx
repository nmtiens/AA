import { useEffect, useState, useCallback, useRef, type ReactNode, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  FIVE_M_LABELS, FIVE_M_CATEGORIES, fetchVuongMacAllStrict, UNAUTHORIZED, updateVuongMac, extendVuongMac,
  deleteVuongMac, fetchVuongMacLog,
  type VuongMacRow, type VuongMacLogEntry, type FiveMCategory,
} from '../../services/vuongMacService';
import { getToken } from '../../services/userService';
import { useAuth } from '../../context/AuthContext';
import {
  parseBotEnd, botStart, nowFmt, fmtLocalInput, pushSupported, isPushOn, enablePush, disablePush,
} from '../../services/vuongMacMobileApi';
import HexLookup from './HexLookup';

type VMItem = VuongMacRow;
type VMLog = VuongMacLogEntry;
type Sheet = { type: 'resolve' | 'extend' | 'delete' | 'log'; row: VMItem } | null;

// Bảng màu dùng chung (nền xám xanh nhạt, khối nội dung trắng bo góc lớn)
const BG = 'bg-[#f1f4f9]';
const NAV_BG = 'bg-[#e9eef6]';
const NAV_ACTIVE = 'bg-[#d3e3fd]';
const NO_SCROLLBAR = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

const fmtTime = (s?: string | null) => (s ? new Date(s).toLocaleString('vi-VN', { hour12: false }) : '');

// Các hàm trong service trả null/false khi lỗi -> đổi thành exception để sheet hiện lỗi
const must = <T,>(r: T | null | false, msg: string): T => {
  if (!r) throw new Error(msg);
  return r as T;
};

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

// Render ra document.body để không bị thanh menu dưới (z-20) hay khung cuộn cha che mất
function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end bg-black/40" onClick={onClose}>
      <div
        className="max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+20px)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" />
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

function VuongMacList() {
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
    `shrink-0 rounded-full px-4 py-1.5 text-sm ${on ? 'bg-[#d3e3fd] font-medium text-slate-900' : 'border border-slate-300 text-slate-600'}`;

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
          return (
            <article
              id={`vm-${v.id}`}
              key={v.id}
              className={`border-b border-slate-100 px-4 py-3 last:border-b-0 ${open ? 'bg-slate-50' : ''}`}
            >
              <button className="flex w-full items-start gap-3 text-left" onClick={() => setOpenId(open ? null : v.id)}>
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-medium text-white ${avatarCls(v, bs)}`}>
                  {v.isResolved ? '✓' : (title || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-base font-medium text-slate-900 ${open ? '' : 'truncate'}`}>{title}</p>
                    {bs && (
                      <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${bs.cls}`}>{bs.label}</span>
                    )}
                  </div>
                  <p className={`text-sm text-slate-500 ${open ? '' : 'truncate'}`}>
                    {v.hangMuc ? `${v.hangMuc} · ` : ''}{FIVE_M_LABELS[v.category]}
                  </p>
                  <p className={`mt-0.5 text-sm text-slate-700 ${open ? '' : 'line-clamp-2'}`}>{v.content}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-600">
                    {v.handler && <span className="rounded-full bg-slate-100 px-2.5 py-1">Xử lý: {v.handler}</span>}
                    {v.bot && <span className="rounded-full bg-slate-100 px-2.5 py-1">BOT: {v.bot}</span>}
                    {!!v.extensions?.length && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">Gia hạn ×{v.extensions.length}</span>
                    )}
                  </div>
                </div>
              </button>

              {open && (
                <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 text-sm text-slate-700">
                  <p className="text-xs text-slate-500">
                    HEX {v.hex}{v.xuong ? ` · Xưởng ${v.xuong}` : ''} · Tạo bởi {v.createdBy} · {fmtTime(v.createdAt)}
                  </p>
                  {v.solution && <p><b>Giải pháp:</b> {v.solution}</p>}
                  {v.note && <p><b>Ghi chú:</b> {v.note}</p>}
                  {v.isResolved && (
                    <p className="rounded-2xl bg-emerald-50 p-3">
                      <b>Đã xử lý</b> ({v.resolvedBy}, {fmtTime(v.resolvedAt)}): {v.resolvedNote}
                    </p>
                  )}
                  {!!v.extensions?.length && (
                    <div className="space-y-2">
                      <p className="font-semibold">Lịch sử gia hạn</p>
                      {v.extensions.map(e => (
                        <div key={e.id} className="rounded-2xl bg-slate-100 p-3">
                          <p>{e.content}</p>
                          <p className="text-xs text-slate-500">BOT: {e.oldBot || '—'} → {e.bot}</p>
                          {e.note && <p className="text-xs text-slate-500">Ghi chú: {e.note}</p>}
                          <p className="text-[11px] text-slate-400">{e.createdBy} · {fmtTime(e.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button onClick={() => setSheet({ type: 'log', row: v })} className="rounded-full border border-slate-300 bg-white px-4 py-2 active:bg-slate-100">
                      Nhật ký
                    </button>
                    {v.canModify && !v.isResolved && (
                      <>
                        <button onClick={() => setSheet({ type: 'resolve', row: v })} className="rounded-full bg-emerald-600 px-4 py-2 text-white active:opacity-80">
                          Đã xử lý
                        </button>
                        <button onClick={() => setSheet({ type: 'extend', row: v })} className="rounded-full bg-amber-500 px-4 py-2 text-white active:opacity-80">
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
                        className="rounded-full border border-slate-300 bg-white px-4 py-2 active:bg-slate-100"
                      >
                        Mở lại
                      </button>
                    )}
                    {v.canModify && (
                      <button onClick={() => setSheet({ type: 'delete', row: v })} className="rounded-full border border-red-300 bg-white px-4 py-2 text-red-600 active:bg-red-50">
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

      {toast && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+88px)] left-1/2 z-[70] max-w-[90vw] -translate-x-1/2 rounded-full bg-slate-900 px-5 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
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
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder="Nội dung đã xử lý (bắt buộc)"
        className={inputCls}
      />
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <button disabled={busy || !note.trim()} onClick={submit} className={`${btnPrimary} mt-4`}>
        {busy ? 'Đang lưu...' : 'Xác nhận đã xử lý'}
      </button>
    </BottomSheet>
  );
}

function ExtendSheet({ row, onClose, onDone }: { row: VMItem; onClose: () => void; onDone: () => void }) {
  const [content, setContent] = useState('');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');
  const start = botStart(row.bot) || nowFmt();
  const newBot = end ? `${start} - ${fmtLocalInput(end)}` : '';
  const { busy, err, submit } = useSubmit(
    async () => must(
      await extendVuongMac(row.id, { content: content.trim(), bot: newBot, note: note.trim() || undefined }),
      'Không gửi được (vướng mắc đã xử lý hoặc không có quyền)'),
    onDone);
  return (
    <BottomSheet title="Cần thêm thời gian" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-500">BOT hiện tại: {row.bot || '—'}</p>
      <div className="space-y-3">
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Lý do / nội dung cần thêm thời gian (bắt buộc)"
          className={inputCls}
        />
        <label className="block text-sm text-slate-500">
          Hạn BOT mới (kết thúc)
          <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
        {newBot && <p className="text-sm text-slate-500">BOT mới: {newBot}</p>}
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Ghi chú (tuỳ chọn)" className={inputCls} />
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <button disabled={busy || !content.trim() || !end} onClick={submit} className={`${btnPrimary} mt-4`}>
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
      <p className="mt-2 text-sm text-slate-500">Lịch sử gia hạn cũng sẽ bị xóa. Thao tác này không hoàn tác được.</p>
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
      <div className="space-y-2">
        {logs?.map(l => (
          <div key={l.id} className="rounded-2xl bg-slate-100 p-3 text-sm">
            <p className="font-medium text-slate-800">
              {{ CREATE: 'Tạo mới', UPDATE: 'Cập nhật', DELETE: 'Xóa' }[l.action] ?? l.action} · {l.actor}
            </p>
            {l.contentAfter && <p className="text-slate-600">{l.contentAfter}</p>}
            {l.detail && <p className="whitespace-pre-line text-slate-500">{l.detail}</p>}
            <p className="text-[11px] text-slate-400">{fmtTime(l.actedAt)}</p>
          </div>
        ))}
        {logs && logs.length === 0 && <p className="text-sm text-slate-400">Chưa có nhật ký.</p>}
      </div>
    </BottomSheet>
  );
}

// ---------------- Trang chính: 2 tab (Vướng mắc | Tra cứu hex) ----------------
export default function VuongMacMobile() {
  const params = new URLSearchParams(location.search);
  const [tab, setTab] = useState<'list' | 'lookup'>(
    params.get('tab') === 'lookup' && !params.get('id') ? 'lookup' : 'list'
  );
  const tabBtn = (on: boolean) =>
    `flex flex-1 flex-col items-center gap-1 pt-2 pb-2.5 text-xs ${on ? 'font-medium text-slate-900' : 'text-slate-500'}`;
  const pill = (on: boolean) => `rounded-full px-6 py-1 text-xl transition-colors ${on ? NAV_ACTIVE : ''}`;

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
        <div className={tab === 'list' ? '' : 'hidden'}><VuongMacList /></div>
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