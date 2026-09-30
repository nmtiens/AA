import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import {
  FIVE_M_LABELS, FIVE_M_CATEGORIES, fetchVuongMacAllStrict, updateVuongMac, extendVuongMac,
  deleteVuongMac, fetchVuongMacLog,
  type VuongMacRow, type VuongMacLogEntry, type FiveMCategory,
} from '../../services/vuongMacService';
import {
  parseBotEnd, botStart, nowFmt, fmtLocalInput, pushSupported, isPushOn, enablePush, disablePush,
} from '../../services/vuongMacMobileApi';
type VMItem = VuongMacRow;
type VMLog = VuongMacLogEntry;
type Sheet = { type: 'resolve' | 'extend' | 'delete' | 'log'; row: VMItem } | null;

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

const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm';
const btnPrimary = 'w-full rounded-lg bg-slate-800 py-2.5 text-sm font-medium text-white disabled:opacity-50';

function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/40" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="px-2 text-slate-400">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function VuongMacMobile() {
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
      setError(e.message || 'Không tải được dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [status, cat, q]);

  const reload = useCallback(() => loadPage(1, true), [loadPage]);

  useEffect(() => { const t = setTimeout(reload, 300); return () => clearTimeout(t); }, [reload]);

  // Tự làm mới khi mở lại app
  useEffect(() => {
    const on = () => document.visibilityState === 'visible' && reload();
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
        reload();
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
    `shrink-0 rounded-full border px-3 py-1 text-xs ${on ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`;

  return (
    <div className="min-h-screen bg-slate-50 pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-10 space-y-2 bg-white px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-red-800">Vướng mắc</h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">{loading ? 'Đang tải...' : `${total} mục`}</span>
            {pushSupported() && (
              <button onClick={togglePush} title="Thông báo" className={`text-lg ${pushOn ? '' : 'opacity-40'}`}>🔔</button>
            )}
            <button onClick={reload} className="text-lg" title="Làm mới">⟳</button>
          </div>
        </div>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Tìm nội dung, công trình, hex, người xử lý..."
          className={inputCls}
        />
        <div className="flex gap-2 overflow-x-auto">
          {(['open', 'resolved', 'all'] as const).map(s => (
            <button key={s} onClick={() => setStatus(s)} className={chip(status === s)}>
              {{ open: 'Tồn đọng', resolved: 'Đã xử lý', all: 'Tất cả' }[s]}
            </button>
          ))}
          <span className="w-px bg-slate-200" />
          <button onClick={() => setCat('')} className={chip(cat === '')}>Mọi loại</button>
          {FIVE_M_CATEGORIES.map(c => (
            <button key={c} onClick={() => setCat(c)} className={chip(cat === c)}>
              {FIVE_M_LABELS[c].split(' ')[0]}
            </button>
          ))}
        </div>
      </header>

      <main className="space-y-3 p-4">
        {error && <p className="rounded-lg bg-red-100 p-3 text-sm text-red-700">{error}</p>}

        {rows.map(v => {
          const bs = botState(v);
          const open = openId === v.id;
          return (
            <article
              id={`vm-${v.id}`}
              key={v.id}
              className={`rounded-xl border p-3 shadow-sm ${v.isResolved ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'} ${open ? 'ring-2 ring-slate-400' : ''}`}
            >
              <button className="w-full text-left" onClick={() => setOpenId(open ? null : v.id)}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] text-slate-500">
                    {v.congTrinh || v.hex}{v.hangMuc ? ` · ${v.hangMuc}` : ''} · {FIVE_M_LABELS[v.category]}
                  </p>
                  {bs && (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${bs.cls}`}>{bs.label}</span>
                  )}
                </div>
                <p className={`mt-1 text-sm text-slate-900 ${open ? '' : 'line-clamp-3'}`}>{v.content}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-600">
                  {v.handler && <span className="rounded-full bg-white px-2 py-0.5">Xử lý: {v.handler}</span>}
                  {v.bot && <span className="rounded-full bg-white px-2 py-0.5">BOT: {v.bot}</span>}
                  {!!v.extensions?.length && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">Gia hạn ×{v.extensions.length}</span>
                  )}
                </div>
              </button>

              {open && (
                <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 text-xs text-slate-700">
                  <p className="text-slate-500">
                    HEX {v.hex}{v.xuong ? ` · Xưởng ${v.xuong}` : ''} · Tạo bởi {v.createdBy} · {fmtTime(v.createdAt)}
                  </p>
                  {v.solution && <p><b>Giải pháp:</b> {v.solution}</p>}
                  {v.note && <p><b>Ghi chú:</b> {v.note}</p>}
                  {v.isResolved && (
                    <p className="rounded-lg bg-white p-2">
                      <b>Đã xử lý</b> ({v.resolvedBy}, {fmtTime(v.resolvedAt)}): {v.resolvedNote}
                    </p>
                  )}
                  {!!v.extensions?.length && (
                    <div className="space-y-1">
                      <p className="font-semibold">Lịch sử gia hạn</p>
                      {v.extensions.map(e => (
                        <div key={e.id} className="rounded-lg bg-white p-2">
                          <p>{e.content}</p>
                          <p className="text-slate-500">BOT: {e.oldBot || '—'} → {e.bot}</p>
                          {e.note && <p className="text-slate-500">Ghi chú: {e.note}</p>}
                          <p className="text-[10px] text-slate-400">{e.createdBy} · {fmtTime(e.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button onClick={() => setSheet({ type: 'log', row: v })} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5">
                      Nhật ký
                    </button>
                    {v.canModify && !v.isResolved && (
                      <>
                        <button onClick={() => setSheet({ type: 'resolve', row: v })} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-white">
                          Đã xử lý
                        </button>
                        <button onClick={() => setSheet({ type: 'extend', row: v })} className="rounded-lg bg-amber-500 px-3 py-1.5 text-white">
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
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5"
                      >
                        Mở lại
                      </button>
                    )}
                    {v.canModify && (
                      <button onClick={() => setSheet({ type: 'delete', row: v })} className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-red-600">
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
          <p className="py-16 text-center text-sm text-slate-400">Không có vướng mắc nào.</p>
        )}
        {rows.length < total && (
          <button
            disabled={loading}
            onClick={() => loadPage(page + 1, false)}
            className="w-full rounded-lg border border-slate-300 bg-white py-2 text-sm text-slate-600 disabled:opacity-50"
          >
            {loading ? 'Đang tải...' : `Tải thêm (${rows.length}/${total})`}
          </button>
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
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+16px)] left-1/2 z-40 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-xs text-white shadow-lg">
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
      <p className="mb-2 line-clamp-2 text-xs text-slate-500">{row.content}</p>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder="Nội dung đã xử lý (bắt buộc)"
        className={inputCls}
      />
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      <button disabled={busy || !note.trim()} onClick={submit} className={`${btnPrimary} mt-3`}>
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
      <p className="mb-2 text-xs text-slate-500">BOT hiện tại: {row.bot || '—'}</p>
      <div className="space-y-2">
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Lý do / nội dung cần thêm thời gian (bắt buộc)"
          className={inputCls}
        />
        <label className="block text-xs text-slate-500">
          Hạn BOT mới (kết thúc)
          <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
        {newBot && <p className="text-xs text-slate-500">BOT mới: {newBot}</p>}
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Ghi chú (tuỳ chọn)" className={inputCls} />
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      <button disabled={busy || !content.trim() || !end} onClick={submit} className={`${btnPrimary} mt-3`}>
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
      <p className="text-sm text-slate-700">{row.content}</p>
      <p className="mt-2 text-xs text-slate-500">Lịch sử gia hạn cũng sẽ bị xóa. Thao tác này không hoàn tác được.</p>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      <div className="mt-3 flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm">Hủy</button>
        <button disabled={busy} onClick={submit} className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white disabled:opacity-50">
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
      {!logs && <p className="text-xs text-slate-400">Đang tải...</p>}
      <div className="space-y-2">
        {logs?.map(l => (
          <div key={l.id} className="rounded-lg border border-slate-200 p-2 text-xs">
            <p className="font-medium text-slate-800">
              {{ CREATE: 'Tạo mới', UPDATE: 'Cập nhật', DELETE: 'Xóa' }[l.action] ?? l.action} · {l.actor}
            </p>
            {l.contentAfter && <p className="text-slate-600">{l.contentAfter}</p>}
            {l.detail && <p className="whitespace-pre-line text-slate-500">{l.detail}</p>}
            <p className="text-[10px] text-slate-400">{fmtTime(l.actedAt)}</p>
          </div>
        ))}
        {logs && logs.length === 0 && <p className="text-xs text-slate-400">Chưa có nhật ký.</p>}
      </div>
    </BottomSheet>
  );
}