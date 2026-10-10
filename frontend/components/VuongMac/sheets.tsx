import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2, Hourglass, Pencil, Trash2, RotateCcw, Share2, History, Wrench, Lock, Send, Camera, ScanLine,
  ChevronDown, ChevronUp, AlertTriangle, CalendarClock, Factory, Search as SearchIcon, X as XIcon,
} from 'lucide-react';
import {
  type VuongMacItem, type VuongMacLogEntry, type FiveMCategory, type VmStatus, type VmPriority, type HexHit,
  UNAUTHORIZED, FIVE_M_CATEGORIES, FIVE_M_LABELS, VM_PRIORITIES,
  changeVuongMacStatus, commentVuongMac, extendVuongMacStrict, deleteVuongMacStrict, fetchVuongMacLog,
  createVuongMacStrict, updateVuongMacStrict, uploadVuongMacPhoto, deleteVuongMacPhoto, fetchHexSearch, fetchPeople,
} from '../../services/vuongMacService';
import { useAuth } from '../../context/AuthContext';
import { AuthImg } from '../shared/VuongMacPhoto';
import { BottomSheet, LabeledField, inputCls, btnPrimary, chipCls } from '../Mobile/mobileUi';
import HandlerPicker from '../Mobile/HandlerPicker';
import MentionTextarea from '../Mobile/MentionTextarea';
import PhotoPicker, { type PhotoItem } from '../Mobile/PhotoPicker';
import { currentUsername } from '../../services/vuongMacMobileApi';
import {
  STATUS_META, PRIORITY_META, DISPLAY_META, displayState, botCountdown, deadlineInfo, isActive, ageText,
  catIcon, catLabel, CAT_CODE, CAT_NAME, CAT_HINT, CAT_DEPT_KEYWORDS,
  fmtShort, fmtDay, fmtAgo, BOT_PRESETS, dateToLocalInput, botTextToLocalInput, localInputToBot,
  loadRecentHex, pushRecentHex, initials,
} from './model';

// ============================================================================
// Các cửa sổ (sheet) dùng chung cho app điện thoại và màn quản lý trên web:
//   VmCard        thẻ 1 vướng mắc trong danh sách
//   DetailSheet   chi tiết + hành động theo quy trình + trao đổi (bình luận)
//   FormSheet     báo vướng mắc mới (2 bước, nhanh) / sửa
//   StatusSheet   nhận xử lý · báo xong · xác nhận đóng · mở lại · đóng trực tiếp
//   ExtendSheet   xin thêm thời gian (đổi BOT)
//   DeleteSheet, LogSheet, PhotoLightbox
// ============================================================================

const MAX_PHOTOS = 5;
const authMsg = (e: any, fallback: string) =>
  e?.message === UNAUTHORIZED ? 'Phiên đăng nhập đã hết hạn — đăng nhập lại rồi thử lại' : (e?.message || fallback);

// ---------------- Ảnh đính kèm: xem phóng to ----------------
export function PhotoLightbox({ ids, start, onClose }: { ids: number[]; start: number; onClose: () => void }) {
  const [idx, setIdx] = useState(start);
  const [zoom, setZoom] = useState(false);
  const go = (d: number) => { setIdx(i => (i + d + ids.length) % ids.length); setZoom(false); };
  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/95">
      <div className="flex items-center justify-between px-4 pb-2 pt-[calc(env(safe-area-inset-top)+8px)] text-white">
        <span className="text-base">{idx + 1}/{ids.length}{zoom ? '' : ' · bấm ảnh để phóng to'}</span>
        <button onClick={onClose} aria-label="Đóng" className="flex h-11 w-11 items-center justify-center rounded-full text-xl active:bg-white/20">✕</button>
      </div>
      <div className={`relative min-h-0 flex-1 ${zoom ? 'overflow-auto' : 'flex items-center justify-center overflow-hidden'}`}>
        <AuthImg id={ids[idx]} onClick={() => setZoom(z => !z)} className={zoom ? 'max-w-none w-[250%]' : 'max-h-full max-w-full object-contain'} />
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

// ---------------- Huy hiệu ----------------
export const StatusPill = ({ v, size = 'sm' }: { v: Pick<VuongMacItem, 'status' | 'bot'>; size?: 'sm' | 'md' }) => {
  const st = DISPLAY_META[displayState(v)];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full font-medium ${st.pill} ${size === 'md' ? 'px-3 py-1 text-base' : 'px-2.5 py-0.5 text-sm'}`}>
      {st.icon} {st.label}
    </span>
  );
};
export const PriorityPill = ({ p }: { p?: VmPriority | null }) => {
  if (!p || p === 'normal') return null;
  const m = PRIORITY_META[p];
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-sm font-medium ${m.pill}`}>{m.icon} {m.label}</span>;
};

// ---------------- Thẻ 1 vướng mắc trong danh sách ----------------
export function VmCard({ v, onOpen, me }: { v: VuongMacItem; onOpen: () => void; me?: { username: string; fullName?: string | null } }) {
  const st = DISPLAY_META[displayState(v)];
  const cd = botCountdown(v);
  const photos = v.photos?.length ?? 0;
  const ext = v.extensions?.length ?? 0;
  const dl = deadlineInfo(v);
  const mineHandler = !!me && !!v.handler && (v.handler.trim().toLowerCase() === (me.fullName ?? '').trim().toLowerCase());
  const waitMe = !!me && v.status === 'done' && v.createdBy === me.username;
  return (
    <button id={`vm-${v.id}`} onClick={onOpen} className="relative block w-full overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-4 pl-5 text-left active:bg-slate-50">
      <span className={`absolute inset-y-0 left-0 w-1.5 ${st.bar}`} />
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusPill v={v} />
        <PriorityPill p={v.priority} />
        {v.escalatedAt && isActive(v) && <span className="rounded-full bg-red-600 px-2 py-0.5 text-sm font-medium text-white">🚨 Đã báo quản lý</span>}
        {cd && <span className={`ml-auto shrink-0 text-sm font-medium ${cd.cls}`}>{cd.text}</span>}
      </div>
      <p className="line-clamp-2 text-base font-semibold leading-snug text-slate-900">{v.congTrinh || `HEX ${v.hex}`}</p>
      <p className="mt-0.5 truncate text-base text-slate-500">
        HEX {v.hex}{v.hangMuc ? ` · ${v.hangMuc}` : ''}
      </p>
      <p className="mt-1.5 line-clamp-2 text-base text-slate-700">{v.content}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
        <span>{catIcon(v.category)} {CAT_CODE[v.category] ?? FIVE_M_LABELS[v.category]}</span>
        {v.stage && <span>🧩 {v.stage}</span>}
        {v.xuong && <span>🏭 {v.xuong}</span>}
        {v.handler && <span className={mineHandler ? 'font-medium text-indigo-700' : ''}>👤 {mineHandler ? 'Tôi xử lý' : v.handler}</span>}
        {waitMe && <span className="font-medium text-teal-700">🕓 Chờ tôi xác nhận</span>}
        {dl.botAfterDeadline && isActive(v) && <span className="text-red-600">⚠ BOT sau hạn nhập kho</span>}
        {photos > 0 && <span>📷 {photos}</span>}
        {ext > 0 && <span>🔁 {ext}</span>}
        <span className="ml-auto">{fmtAgo(v.createdAt)}</span>
      </div>
    </button>
  );
}

// ---------------- Thông tin hạng mục (từ bảng sản xuất) ----------------
function HexInfoCard({ v, onOpenHex }: {
  v: { hex: string; congTrinh?: string | null; hangMuc?: string | null; xuong?: string | null; stage?: string | null;
       bop?: string | null; tinhTrang?: string | null; deadline?: string | null; ngayCanGiao?: string | null;
       pc?: string | null; pm?: string | null; bot?: string | null; status?: VmStatus };
  onOpenHex?: (hex: string) => void;
}) {
  const dl = deadlineInfo(v);
  const dlCls = dl.daysLeft === null ? 'text-slate-500' : dl.daysLeft < 0 ? 'font-semibold text-red-600' : dl.daysLeft <= 7 ? 'font-semibold text-amber-700' : 'text-slate-700';
  const active = !v.status || v.status === 'open' || v.status === 'doing';
  return (
    <div className="rounded-2xl bg-slate-50 p-3 text-base">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">📍 HEX {v.hex}</p>
          <p className="truncate text-slate-700">{v.congTrinh || '—'}</p>
          {v.hangMuc && <p className="truncate text-slate-500">{v.hangMuc}</p>}
        </div>
        {onOpenHex && (
          <button type="button" onClick={() => onOpenHex(v.hex)} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm active:bg-slate-100">
            Tra cứu
          </button>
        )}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-slate-500">Khu vực SX</dt><dd className="text-right text-slate-700">{v.xuong || '—'}</dd>
        <dt className="text-slate-500">Công đoạn hiện tại</dt>
        <dd className="truncate text-right text-slate-700" title={v.bop ?? undefined}>{v.bop || v.stage || '—'}</dd>
        {v.tinhTrang && <><dt className="text-slate-500">Tình trạng</dt><dd className="truncate text-right text-slate-700">{v.tinhTrang}</dd></>}
        <dt className="text-slate-500">Hạn nhập kho hạng mục</dt>
        <dd className={`text-right ${dlCls}`}>
          {dl.date ? `${fmtDay(v.deadline)}${dl.daysLeft !== null ? (dl.daysLeft < 0 ? ` · trễ ${-dl.daysLeft} ngày` : ` · còn ${dl.daysLeft} ngày`) : ''}` : 'Chưa có KH'}
        </dd>
        {(v.pc || v.pm) && <><dt className="text-slate-500">PC / PM</dt><dd className="truncate text-right text-slate-700">{[v.pc, v.pm].filter(Boolean).join(' / ')}</dd></>}
      </dl>
      {dl.botAfterDeadline && active && (
        <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle size="1em" className="mt-0.5 shrink-0" />
          BOT xử lý vướng mắc kết thúc SAU hạn nhập kho của hạng mục — hạng mục sẽ trễ nếu không rút ngắn.
        </p>
      )}
    </div>
  );
}

function Info({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={`rounded-2xl bg-slate-50 px-3 py-2 ${wide ? 'col-span-2' : ''}`}>
      <p className="text-sm text-slate-400">{label}</p>
      <p className="break-words font-medium text-slate-800">{value}</p>
    </div>
  );
}

// ---------------- Trao đổi (bình luận + mốc trạng thái) trong 1 vướng mắc ----------------
const LOG_LABEL: Record<string, { icon: string; label: string }> = {
  CREATE: { icon: '🆕', label: 'Báo vướng mắc' },
  UPDATE: { icon: '✏️', label: 'Cập nhật' },
  STATUS: { icon: '🔁', label: 'Trạng thái' },
  COMMENT: { icon: '💬', label: '' },
  DELETE: { icon: '🗑️', label: 'Xóa' },
};
const logDayLabel = (iso: string) => {
  const d = new Date(iso);
  const key = (x: Date) => x.toDateString();
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (key(d) === key(today)) return 'Hôm nay';
  if (key(d) === key(yest)) return 'Hôm qua';
  return d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
};
const logTime = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

function Conversation({ v, flash, refreshKey }: { v: VuongMacItem; flash: (m: string) => void; refreshKey: number }) {
  const [logs, setLogs] = useState<VuongMacLogEntry[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const me = currentUsername().toLowerCase();

  const load = useCallback(() => fetchVuongMacLog(v.hex, v.id).then(setLogs), [v.hex, v.id]);
  useEffect(() => { load(); }, [load, refreshKey]);

  // Cũ -> mới (giống khung chat); bỏ "Cập nhật" không có chi tiết (sửa chữ) cho gọn
  const items = (logs ?? [])
    .filter(l => l.action !== 'DELETE' && !(l.action === 'UPDATE' && !l.detail))
    .sort((x, y) => new Date(x.actedAt).getTime() - new Date(y.actedAt).getTime() || x.id - y.id);
  useEffect(() => { if (items.length) endRef.current?.scrollIntoView({ block: 'nearest' }); }, [logs]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await commentVuongMac(v.id, t);
      setText('');
      await load();
    } catch (e: any) {
      flash(authMsg(e, 'Không gửi được bình luận'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Trao đổi · diễn biến</p>
      {!logs && <p className="text-base text-slate-400">Đang tải...</p>}
      {logs && items.length === 0 && <p className="text-base text-slate-400">Chưa có trao đổi.</p>}
      <div className="space-y-3">
        {items.map((l, i) => {
          const mine = !!me && (l.actor ?? '').trim().toLowerCase() === me;
          const meta = LOG_LABEL[l.action] ?? { icon: '•', label: l.action };
          const isComment = l.action === 'COMMENT';
          const body = isComment ? l.contentAfter : (l.detail || (l.action === 'CREATE' ? l.contentAfter : ''));
          const showDay = i === 0 || logDayLabel(items[i - 1].actedAt) !== logDayLabel(l.actedAt);
          return (
            <div key={l.id}>
              {showDay && (
                <div className="my-2 flex items-center gap-3 text-sm text-slate-400">
                  <span className="h-px flex-1 bg-slate-200" />{logDayLabel(l.actedAt)}<span className="h-px flex-1 bg-slate-200" />
                </div>
              )}
              {!isComment ? (
                <div className="flex items-start gap-2 text-sm text-slate-500">
                  <span className="mt-0.5">{meta.icon}</span>
                  <p className="min-w-0 flex-1 whitespace-pre-line break-words">
                    <b className="text-slate-700">{l.actor}</b> · {meta.label}{body ? `: ${body}` : ''}
                    <span className="ml-1 text-slate-400">{logTime(l.actedAt)}</span>
                  </p>
                </div>
              ) : (
                <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  {!mine && (
                    <div className="mb-1 flex items-center gap-1.5 px-1 text-sm text-slate-500">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">{initials(l.actor)}</span>
                      <span className="font-medium text-slate-700">{l.actor || 'Không rõ'}</span>
                    </div>
                  )}
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-base ${mine ? 'rounded-br-md bg-wood-600 text-white' : 'rounded-bl-md bg-slate-100 text-slate-800'}`}>
                    <p className="whitespace-pre-line break-words">{body}</p>
                  </div>
                  <span className="mt-0.5 px-1 text-xs text-slate-400">{logTime(l.actedAt)}</span>
                </div>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="mt-3 flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <MentionTextarea value={text} onChange={setText} rows={2} maxLength={2000} placeholder="Viết trao đổi... Gõ @ để tag" className={inputCls} />
        </div>
        <button type="button" disabled={!text.trim() || busy} onClick={send} aria-label="Gửi"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white active:opacity-80 disabled:opacity-40">
          <Send size="1.125em" />
        </button>
      </div>
    </div>
  );
}

// ---------------- Chi tiết 1 vướng mắc ----------------
type Action =
  | { type: 'edit' | 'extend' | 'delete' | 'log' }
  | { type: 'status'; kind: StatusKind };

export function DetailSheet({ v, onClose, onChanged, onOpenHex, flash }: {
  v: VuongMacItem;
  onClose: () => void;
  /** next = null: đã xoá */
  onChanged: (next: VuongMacItem | null, msg: string) => void;
  onOpenHex?: (hex: string) => void;
  flash: (m: string) => void;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const [viewer, setViewer] = useState<{ ids: number[]; idx: number } | null>(null);
  const [convKey, setConvKey] = useState(0);
  const perms = v.perms ?? { edit: !!v.canModify, work: !!v.canModify, close: !!v.canModify, delete: !!v.canModify };
  const cd = botCountdown(v);
  const photoIds = v.photos ?? [];
  const dl = deadlineInfo(v);

  const share = async () => {
    const url = `${location.origin}/m/?id=${v.id}`;
    const text = `Vướng mắc HEX ${v.hex}${v.congTrinh ? ` · ${v.congTrinh}` : ''}\n${v.content}${v.bot ? `\nBOT: ${v.bot}` : ''}`;
    try {
      if (navigator.share) { await navigator.share({ title: 'Vướng mắc', text, url }); return; }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      flash('Đã sao chép nội dung + đường dẫn');
    } catch { /* người dùng hủy chia sẻ */ }
  };
  const done = (next: VuongMacItem | null, msg: string) => { setAction(null); setConvKey(k => k + 1); onChanged(next, msg); };

  if (action?.type === 'edit') return <FormSheet row={v} onClose={() => setAction(null)} onDone={(it, msg) => done(it, msg)} />;
  if (action?.type === 'extend') return <ExtendSheet row={v} onClose={() => setAction(null)} onDone={it => done(it, 'Đã gửi yêu cầu thêm thời gian')} />;
  if (action?.type === 'status') return <StatusSheet row={v} kind={action.kind} onClose={() => setAction(null)} onDone={(it, msg) => done(it, msg)} />;
  if (action?.type === 'delete') return <DeleteSheet row={v} onClose={() => setAction(null)} onDone={() => done(null, 'Đã xóa')} />;
  if (action?.type === 'log') return <LogSheet row={v} onClose={() => setAction(null)} />;

  // Mốc thời gian theo quy trình
  const timeline: { at?: string | null; title: string; by?: string | null; body?: ReactNode; dot: string }[] = [
    { at: v.createdAt, title: 'Báo vướng mắc', by: v.createdBy, dot: 'bg-blue-500' },
    ...(v.acceptedAt ? [{ at: v.acceptedAt, title: 'Nhận xử lý', by: v.acceptedBy, dot: 'bg-indigo-500' }] : []),
    ...(v.extensions ?? []).map(e => ({
      at: e.createdAt, title: 'Cần thêm thời gian', by: e.createdBy, dot: 'bg-amber-500',
      body: (<><p>{e.content}</p><p className="text-sm text-slate-500">BOT: {e.oldBot || '—'} → <b>{e.bot}</b></p>{e.note && <p className="text-sm text-slate-500">📝 {e.note}</p>}</>),
    })),
    ...(v.escalatedAt ? [{ at: v.escalatedAt, title: 'Quá hạn lâu — đã báo quản lý', by: null, dot: 'bg-red-600' }] : []),
    ...(v.isResolved && v.resolvedAt ? [{ at: v.resolvedAt, title: 'Đã xử lý xong', by: v.resolvedBy, dot: 'bg-teal-500', body: v.resolvedNote ? <p>{v.resolvedNote}</p> : undefined }] : []),
    ...(v.status === 'closed' ? [{ at: v.closedAt ?? v.resolvedAt, title: 'Xác nhận đóng', by: v.closedBy ?? v.resolvedBy, dot: 'bg-emerald-500' }] : []),
  ];

  const iconBtn = 'flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 text-sm text-slate-600 active:bg-slate-100';
  const primary = (cls: string) => `flex flex-1 items-center justify-center gap-2 rounded-full py-3 text-base font-medium text-white active:opacity-80 ${cls}`;
  const st = v.status;

  return (
    <>
      <BottomSheet
        title={<span className="inline-flex flex-wrap items-center gap-1.5"><StatusPill v={v} size="md" /><PriorityPill p={v.priority} /></span>}
        headerExtra={cd && <span className={`mr-2 text-base font-medium ${cd.cls}`}>{cd.text}</span>}
        onClose={onClose}
        footer={
          <div className="space-y-2">
            {/* Hành động chính theo bước của quy trình */}
            {st === 'open' && perms.work && (
              <div className="flex gap-2">
                <button onClick={() => setAction({ type: 'status', kind: 'accept' })} className={primary('bg-indigo-600')}><Wrench size="1.125em" /> Nhận xử lý</button>
                <button onClick={() => setAction({ type: 'status', kind: 'done' })} className={primary('bg-emerald-600')}><CheckCircle2 size="1.125em" /> Đã xử lý xong</button>
              </div>
            )}
            {st === 'doing' && perms.work && (
              <div className="flex gap-2">
                <button onClick={() => setAction({ type: 'status', kind: 'done' })} className={primary('bg-emerald-600')}><CheckCircle2 size="1.125em" /> Đã xử lý xong</button>
                <button onClick={() => setAction({ type: 'extend' })} className={primary('bg-amber-500')}><Hourglass size="1.125em" /> Thêm thời gian</button>
              </div>
            )}
            {st === 'done' && perms.close && (
              <div className="flex gap-2">
                <button onClick={() => setAction({ type: 'status', kind: 'close' })} className={primary('bg-emerald-700')}><Lock size="1.125em" /> Xác nhận đóng</button>
                <button onClick={() => setAction({ type: 'status', kind: 'reopen' })} className={primary('bg-orange-500')}><RotateCcw size="1.125em" /> Chưa đạt, mở lại</button>
              </div>
            )}
            {st === 'done' && !perms.close && <p className="text-center text-sm text-slate-500">Đang chờ {v.createdBy} (người báo) xác nhận đóng.</p>}
            <div className="flex">
              {perms.edit && <button onClick={() => setAction({ type: 'edit' })} className={iconBtn}><Pencil size="1.125em" />Sửa</button>}
              {st === 'open' && perms.work && <button onClick={() => setAction({ type: 'extend' })} className={iconBtn}><Hourglass size="1.125em" />Thêm giờ</button>}
              {isActive(v) && perms.close && <button onClick={() => setAction({ type: 'status', kind: 'closeDirect' })} className={iconBtn}><Lock size="1.125em" />Đóng</button>}
              {st === 'closed' && perms.close && <button onClick={() => setAction({ type: 'status', kind: 'reopen' })} className={iconBtn}><RotateCcw size="1.125em" />Mở lại</button>}
              <button onClick={() => setAction({ type: 'log' })} className={iconBtn}><History size="1.125em" />Nhật ký</button>
              <button onClick={share} className={iconBtn}><Share2 size="1.125em" />Chia sẻ</button>
              {perms.delete && <button onClick={() => setAction({ type: 'delete' })} className={`${iconBtn} !text-red-600`}><Trash2 size="1.125em" />Xóa</button>}
            </div>
          </div>
        }
      >
        <div className="space-y-4 text-base text-slate-700">
          <HexInfoCard v={v} onOpenHex={onOpenHex} />

          <div className="grid grid-cols-2 gap-2 text-base">
            <Info label="Loại" value={`${catIcon(v.category)} ${catLabel(v.category)}`} />
            <Info label="Người xử lý" value={v.handler || <span className="text-amber-700">Chưa giao</span>} />
            <Info label="BOT xử lý" value={v.bot || 'Chưa có'} wide />
            <Info label="Người báo" value={`${v.createdBy}${v.createdDepartment ? ` · ${v.createdDepartment}` : ''}`} />
            <Info label="Đã báo" value={`${ageText(v)} trước`} />
          </div>

          <div>
            <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">Nội dung vướng mắc</p>
            <p className="whitespace-pre-line">{v.content}</p>
          </div>
          {v.solution && (
            <div>
              <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">💡 Giải pháp</p>
              <p className="whitespace-pre-line">{v.solution}</p>
            </div>
          )}
          {v.note && (
            <div>
              <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">📝 Ghi chú</p>
              <p className="whitespace-pre-line">{v.note}</p>
            </div>
          )}
          {v.resolvedNote && (
            <div className="rounded-2xl bg-teal-50 p-3">
              <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-teal-700">✅ Đã xử lý</p>
              <p className="whitespace-pre-line">{v.resolvedNote}</p>
            </div>
          )}

          {photoIds.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">📷 Ảnh ({photoIds.length})</p>
              <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
                {photoIds.map((pid, i) => (
                  <AuthImg key={pid} id={pid} onClick={() => setViewer({ ids: photoIds, idx: i })} className="aspect-square w-full rounded-2xl object-cover" />
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Mốc quy trình</p>
            <ol className="relative space-y-3 border-l-2 border-slate-100 pl-5">
              {timeline.map((t, i) => (
                <li key={i} className="relative">
                  <span className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ring-4 ring-white ${t.dot}`} />
                  <p className="text-base font-medium text-slate-800">{t.title}</p>
                  <p className="text-sm text-slate-400">{fmtShort(t.at)}{t.by ? ` · ${t.by}` : ''}</p>
                  {t.body && <div className="mt-1 space-y-0.5 text-base text-slate-700">{t.body}</div>}
                </li>
              ))}
              {isActive(v) && (
                <li className="relative">
                  <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full bg-slate-200 ring-4 ring-white" />
                  <p className="text-base text-slate-400">{st === 'open' ? 'Chờ nhận xử lý' : 'Đang xử lý…'}{dl.date ? ` · hạn nhập kho hạng mục ${fmtDay(v.deadline)}` : ''}</p>
                </li>
              )}
            </ol>
          </div>

          <Conversation v={v} flash={flash} refreshKey={convKey} />
        </div>
      </BottomSheet>
      {viewer && <PhotoLightbox ids={viewer.ids} start={viewer.idx} onClose={() => setViewer(null)} />}
    </>
  );
}

// ---------------- Chọn BOT (chọn nhanh + tuỳ chỉnh) ----------------
function BotPicker({ start, end, setStart, setEnd, required, current }: {
  start: string; end: string; setStart: (v: string) => void; setEnd: (v: string) => void; required?: boolean; current?: string | null;
}) {
  const [custom, setCustom] = useState(false);
  const botInvalid = !!(start && end && end < start);
  const pick = (key: string) => {
    const now = new Date();
    const p = BOT_PRESETS.find(x => x.key === key)!;
    setStart(dateToLocalInput(now));
    setEnd(dateToLocalInput(p.end(now)));
  };
  const picked = BOT_PRESETS.find(p => end && Math.abs(new Date(end).getTime() - p.end(new Date()).getTime()) < 90_000)?.key;
  return (
    <div className="space-y-2">
      <p className="text-base font-medium text-slate-700">
        ⏰ Hạn xử lý (BOT){required && <span className="text-red-500"> *</span>}
        {current ? <span className="font-normal text-slate-500"> · hiện tại: {current}</span> : null}
      </p>
      <div className="flex flex-wrap gap-2">
        {BOT_PRESETS.map(p => (
          <button key={p.key} type="button" onClick={() => pick(p.key)} className={chipCls(picked === p.key)}>{p.label}</button>
        ))}
        <button type="button" onClick={() => setCustom(c => !c)} className={chipCls(custom)}>Tuỳ chọn…</button>
        {end && <button type="button" onClick={() => setEnd('')} className="rounded-full px-3 py-2 text-base text-slate-500 active:bg-slate-100">✕ Bỏ</button>}
      </div>
      {custom && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block text-sm text-slate-500">
            Bắt đầu
            <input type="datetime-local" style={{ minWidth: 0 }} value={start} onChange={e => setStart(e.target.value)} className={`${inputCls} mt-1`} />
          </label>
          <label className="block text-sm text-slate-500">
            Kết thúc
            <input type="datetime-local" style={{ minWidth: 0 }} min={start || undefined} value={end} onChange={e => setEnd(e.target.value)} className={`${inputCls} mt-1`} />
          </label>
        </div>
      )}
      {botInvalid && <p className="text-base text-red-600">Thời gian kết thúc phải sau thời gian bắt đầu.</p>}
      {end && !botInvalid && <p className="text-base text-slate-500">BOT: {localInputToBot(start || dateToLocalInput(new Date()))} - {localInputToBot(end)}</p>}
    </div>
  );
}

// ---------------- Quét mã (hex / mã nhà máy) bằng camera — chỉ trình duyệt có BarcodeDetector ----------------
const canScan = () => typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
function ScanOverlay({ onResult, onClose }: { onResult: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        const Detector = (window as any).BarcodeDetector;
        const detector = new Detector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'data_matrix'] });
        const tick = async () => {
          if (stop) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const raw = codes?.[0]?.rawValue;
            const m = raw && String(raw).match(/\d{9,13}/);
            if (m) { onResult(m[0]); return; }
          } catch { /* khung hình chưa sẵn sàng */ }
          timer = setTimeout(tick, 300);
        };
        tick();
      } catch (e: any) {
        setErr(e?.message || 'Không mở được camera');
      }
    })();
    return () => { stop = true; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); };
  }, [onResult]);
  return createPortal(
    <div className="fixed inset-0 z-[85] flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 pb-2 pt-[calc(env(safe-area-inset-top)+8px)] text-white">
        <span className="text-base">Đưa mã vạch / QR trên tem hạng mục vào khung</span>
        <button onClick={onClose} aria-label="Đóng" className="flex h-11 w-11 items-center justify-center rounded-full text-xl active:bg-white/20">✕</button>
      </div>
      <video ref={videoRef} muted playsInline className="min-h-0 flex-1 object-cover" />
      {err && <p className="bg-red-600 p-3 text-center text-base text-white">{err}</p>}
    </div>,
    document.body
  );
}

// ---------------- Báo vướng mắc mới (2 bước) / sửa ----------------
export function FormSheet({ row, preset, onClose, onDone }: {
  row?: VuongMacItem;
  /** Hạng mục chọn sẵn (vd. từ tab Tra cứu) */
  preset?: HexHit | null;
  onClose: () => void;
  onDone: (item: VuongMacItem, msg: string) => void;
}) {
  const editing = !!row;
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2>(editing || preset ? 2 : 1);

  // Bước 1: chọn hạng mục
  const [picked, setPicked] = useState<HexHit | null>(preset ?? null);
  const [hexQ, setHexQ] = useState('');
  const [hits, setHits] = useState<HexHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [scanning, setScanning] = useState(false);
  const recent = useMemo(() => loadRecentHex(), []);

  // Bước 2: nội dung
  const [category, setCategory] = useState<FiveMCategory>(row?.category ?? 'man');
  const [content, setContent] = useState(row?.content ?? '');
  const [handler, setHandler] = useState(row?.handler ?? '');
  const [priority, setPriority] = useState<VmPriority>(row?.priority ?? 'normal');
  const [start, setStart] = useState(() => (row ? botTextToLocalInput(row.bot?.split(' - ')[0]) : dateToLocalInput(new Date())));
  const [end, setEnd] = useState(() => (row ? botTextToLocalInput(row.bot?.split(' - ')[1]) : ''));
  const [solution, setSolution] = useState(row?.solution ?? '');
  const [note, setNote] = useState(row?.note ?? '');
  const [more, setMore] = useState(!!(row?.solution || row?.note));
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [keptIds, setKeptIds] = useState<number[]>(row?.photos ?? []);
  const [people, setPeople] = useState<{ name: string; department: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { fetchPeople().then(setPeople).catch(() => {}); }, []);

  useEffect(() => {
    if (editing || picked) return;
    const t = setTimeout(async () => {
      if (hexQ.trim().length < 2) { setHits([]); return; }
      setSearching(true);
      try { setHits(await fetchHexSearch(hexQ.trim())); } finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [hexQ, picked, editing]);

  const onScan = useCallback((code: string) => { setScanning(false); setHexQ(code); }, []);

  // Gợi ý người xử lý theo loại (phòng ban khớp từ khoá), tối đa 6
  const suggested = useMemo(() => {
    const kws = CAT_DEPT_KEYWORDS[category];
    const fold = (s: string) => s.toLowerCase();
    return people.filter(p => p.department && kws.some(k => fold(p.department).includes(k))).slice(0, 6);
  }, [people, category]);
  const myName = user?.fullName || '';

  const botInvalid = !!(start && end && end < start);
  const newBot = end ? `${localInputToBot(start || dateToLocalInput(new Date()))} - ${localInputToBot(end)}` : '';
  const canSubmit = !busy && !!content.trim() && (editing || !!picked) && !botInvalid;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true); setErr('');
    let item: VuongMacItem;
    try {
      if (row) {
        const patch: Parameters<typeof updateVuongMacStrict>[1] = {
          category, content: content.trim(), handler: handler.trim(), solution: solution.trim(), note: note.trim(),
        };
        if (priority !== row.priority) patch.priority = priority;
        if (newBot !== (row.bot ?? '')) patch.bot = newBot;
        item = await updateVuongMacStrict(row.id, patch);
      } else {
        item = await createVuongMacStrict(picked!.hex, category, content.trim(), {
          handler: handler.trim(), bot: newBot, solution: solution.trim(), note: note.trim(), priority,
        });
        pushRecentHex({ hex: picked!.hex, congTrinh: picked!.congTrinh, hangMuc: picked!.hangMuc, xuong: picked!.xuong });
      }
    } catch (e: any) {
      setErr(authMsg(e, 'Có lỗi xảy ra'));
      setBusy(false);
      return;
    }
    // Ảnh (nội dung đã lưu rồi nên lỗi ảnh chỉ báo, không bắt nhập lại)
    let failed = 0;
    if (row) {
      for (const pid of row.photos ?? []) {
        if (keptIds.includes(pid)) continue;
        try { await deleteVuongMacPhoto(pid); } catch { failed++; }
      }
    }
    const uploaded: number[] = [];
    for (const p of photos) {
      try { uploaded.push((await uploadVuongMacPhoto(item.id, p.blob)).id); } catch { failed++; }
    }
    setBusy(false);
    onDone(
      { ...item, photos: [...(row ? keptIds : []), ...uploaded] },
      failed ? `Đã lưu, nhưng ${failed} ảnh bị lỗi. Bấm Sửa để thêm lại ảnh` : editing ? 'Đã lưu thay đổi' : 'Đã báo vướng mắc'
    );
  };

  const title = editing ? '✏️ Sửa vướng mắc' : step === 1 ? '➕ Báo vướng mắc · 1/2 Chọn hạng mục' : '➕ Báo vướng mắc · 2/2 Nội dung';

  // ---- Bước 1 ----
  if (!editing && step === 1) {
    const choose = (h: HexHit) => { setPicked(h); setStep(2); };
    return (
      <BottomSheet title={title} onClose={onClose}>
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <SearchIcon size="1.125em" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={hexQ} onChange={e => setHexQ(e.target.value)} autoFocus inputMode="search"
                placeholder="HEX, mã nhà máy, công trình, hạng mục…" className={`${inputCls} !pl-11`} />
            </div>
            {canScan() && (
              <button type="button" onClick={() => setScanning(true)} aria-label="Quét mã"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white active:opacity-80">
                <ScanLine size="1.25em" />
              </button>
            )}
          </div>
          {searching && <p className="text-base text-slate-400">Đang tìm...</p>}
          {hits.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              {hits.map(h => (
                <button type="button" key={h.hex} onClick={() => choose(h)}
                  className="block w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0 active:bg-slate-100">
                  <p className="text-base font-medium text-slate-900">HEX {h.hex} · {h.congTrinh}</p>
                  <p className="truncate text-sm text-slate-500">{h.hangMuc}{h.xuong ? ` · ${h.xuong}` : ''}{h.stage ? ` · ${h.stage}` : ''}</p>
                </button>
              ))}
            </div>
          )}
          {!searching && hexQ.trim().length >= 2 && hits.length === 0 && <p className="text-base text-slate-400">Không tìm thấy hạng mục phù hợp.</p>}
          {hexQ.trim().length < 2 && recent.length > 0 && (
            <div>
              <p className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-slate-400">Hạng mục báo gần đây</p>
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                {recent.map(h => (
                  <button type="button" key={h.hex} onClick={() => choose(h)}
                    className="block w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0 active:bg-slate-100">
                    <p className="text-base font-medium text-slate-900">HEX {h.hex}{h.congTrinh ? ` · ${h.congTrinh}` : ''}</p>
                    <p className="truncate text-sm text-slate-500">{h.hangMuc}{h.xuong ? ` · ${h.xuong}` : ''}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          {hexQ.trim().length < 2 && recent.length === 0 && (
            <p className="py-6 text-center text-base text-slate-400">Gõ ít nhất 2 ký tự để tìm hạng mục{canScan() ? ', hoặc bấm nút quét mã trên tem' : ''}.</p>
          )}
        </div>
        {scanning && <ScanOverlay onResult={onScan} onClose={() => setScanning(false)} />}
      </BottomSheet>
    );
  }

  // ---- Bước 2 / sửa ----
  const hexInfo = row ?? (picked ? { hex: picked.hex, congTrinh: picked.congTrinh, hangMuc: picked.hangMuc, xuong: picked.xuong,
    stage: picked.stage, bop: picked.bop, tinhTrang: picked.tinhTrang, deadline: picked.deadline, pc: picked.pc, pm: picked.pm } : null);
  return (
    <BottomSheet
      title={title}
      onClose={onClose}
      footer={
        <>
          {err && <p className="mb-2 text-base text-red-600">{err}</p>}
          {!canSubmit && !busy && (
            <p className="mb-2 text-center text-sm text-slate-400">
              {!editing && !picked ? 'Chọn hạng mục' : !content.trim() ? 'Nhập nội dung vướng mắc' : 'Kiểm tra lại thời gian BOT'} để gửi
            </p>
          )}
          <div className="flex gap-2">
            {!editing && (
              <button type="button" onClick={() => setStep(1)} className="shrink-0 whitespace-nowrap rounded-full border border-slate-300 px-4 py-3 text-base text-slate-700 active:bg-slate-100">‹ Đổi</button>
            )}
            <button disabled={!canSubmit} onClick={submit} className={btnPrimary}>
              {busy ? (photos.length ? 'Đang lưu và tải ảnh...' : 'Đang lưu...') : editing ? '💾 Lưu thay đổi' : '📨 Gửi vướng mắc'}
            </button>
          </div>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {hexInfo && <div className="md:col-span-2"><HexInfoCard v={{ ...hexInfo, bot: newBot }} /></div>}

        {/* Loại */}
        <div className="md:col-span-2">
          <p className="mb-1 text-base font-medium text-slate-700">🏷️ Vướng mắc về</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {FIVE_M_CATEGORIES.map(c => (
              <button type="button" key={c} onClick={() => setCategory(c)} aria-pressed={category === c}
                className={`rounded-2xl px-2 py-2 text-center ${category === c ? 'bg-[#d3e3fd] ring-1 ring-[#8ab4f8]' : 'border border-slate-200 active:bg-slate-50'}`}>
                <span className="block text-xl leading-tight">{catIcon(c)}</span>
                <span className={`block text-sm leading-tight ${category === c ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{CAT_CODE[c]}</span>
                <span className="block truncate text-sm leading-tight text-slate-500">{CAT_NAME[c]}</span>
              </button>
            ))}
          </div>
          <p className="mt-1 text-sm text-slate-500">{CAT_HINT[category]}</p>
        </div>

        <LabeledField label="Nội dung vướng mắc" required className="md:col-span-2">
          <MentionTextarea value={content} onChange={setContent} rows={3} maxLength={2000}
            placeholder="Đang vướng gì, ảnh hưởng thế nào… Gõ @ để tag người liên quan" className={inputCls} />
        </LabeledField>

        {/* Ảnh — đưa lên gần nội dung: công nhân chụp ngay hiện trường */}
        <div className="space-y-2 md:col-span-2">
          <p className="flex items-center gap-1.5 text-base font-medium text-slate-700"><Camera size="1em" /> Ảnh hiện trường</p>
          {keptIds.length > 0 && (
            <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
              {keptIds.map(pid => (
                <div key={pid} className="relative aspect-square overflow-hidden rounded-2xl bg-slate-100">
                  <AuthImg id={pid} className="h-full w-full object-cover" />
                  <button type="button" onClick={() => setKeptIds(ids => ids.filter(x => x !== pid))} aria-label="Xóa ảnh"
                    className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white">✕</button>
                </div>
              ))}
            </div>
          )}
          <PhotoPicker value={photos} onChange={setPhotos} max={MAX_PHOTOS - keptIds.length} />
        </div>

        {/* Người xử lý */}
        <div className="md:col-span-2">
          <p className="mb-1 text-base font-medium text-slate-700">👤 Giao cho</p>
          <HandlerPicker value={handler} onChange={setHandler} inputClassName={inputCls} />
          {(suggested.length > 0 || myName) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {myName && <button type="button" onClick={() => setHandler(myName)} className={chipCls(handler === myName)}>Tôi tự xử lý</button>}
              {suggested.filter(p => p.name !== myName).map(p => (
                <button type="button" key={p.name} onClick={() => setHandler(p.name)} className={chipCls(handler === p.name)} title={p.department}>
                  {p.name} <span className="opacity-60">· {p.department}</span>
                </button>
              ))}
            </div>
          )}
          {!handler.trim() && <p className="mt-1 text-sm text-slate-500">Chưa giao thì vướng mắc ở trạng thái "Mới", chờ người xử lý nhận.</p>}
        </div>

        <div className="md:col-span-2">
          <BotPicker start={start} end={end} setStart={setStart} setEnd={setEnd} current={editing ? row!.bot : undefined} />
        </div>

        <div className="md:col-span-2">
          <p className="mb-1 text-base font-medium text-slate-700">Mức ưu tiên</p>
          <div className="flex flex-wrap gap-2">
            {VM_PRIORITIES.map(p => (
              <button type="button" key={p} onClick={() => setPriority(p)} className={chipCls(priority === p)}>
                {PRIORITY_META[p].icon} {PRIORITY_META[p].label}
              </button>
            ))}
          </div>
        </div>

        <div className="md:col-span-2">
          <button type="button" onClick={() => setMore(m => !m)} className="flex items-center gap-1 text-base font-medium text-slate-600">
            {more ? <ChevronUp size="1em" /> : <ChevronDown size="1em" />} Giải pháp dự kiến, ghi chú
          </button>
        </div>
        {more && (
          <>
            <LabeledField label="💡 Giải pháp">
              <MentionTextarea value={solution} onChange={setSolution} rows={2} maxLength={2000} placeholder="Nhập giải pháp dự kiến..." className={inputCls} />
            </LabeledField>
            <LabeledField label="📝 Ghi chú">
              <MentionTextarea value={note} onChange={setNote} rows={2} maxLength={2000} placeholder="Nhập ghi chú thêm..." className={inputCls} />
            </LabeledField>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

// ---------------- Đổi trạng thái theo quy trình ----------------
export type StatusKind = 'accept' | 'done' | 'close' | 'reopen' | 'closeDirect';
const STATUS_SHEET: Record<StatusKind, { title: string; target: VmStatus; noteLabel: string; required: boolean; placeholder: string; btn: string; cls: string; msg: string }> = {
  accept: { title: '🔧 Nhận xử lý', target: 'doing', noteLabel: 'Dự kiến làm gì (không bắt buộc)', required: false, placeholder: 'Vd: đã liên hệ NCC, hẹn giao chiều nay…', btn: 'Nhận xử lý', cls: 'bg-indigo-600', msg: 'Đã nhận xử lý' },
  done: { title: '✅ Báo đã xử lý xong', target: 'done', noteLabel: 'Đã xử lý như thế nào', required: true, placeholder: 'Nhập nội dung đã xử lý... Gõ @ để tag', btn: 'Xác nhận đã xử lý', cls: 'bg-emerald-600', msg: 'Đã báo xử lý xong, chờ người báo xác nhận' },
  close: { title: '🔒 Xác nhận đóng', target: 'closed', noteLabel: 'Nhận xét (không bắt buộc)', required: false, placeholder: 'Vd: đã kiểm tra, sản xuất tiếp bình thường', btn: 'Đóng vướng mắc', cls: 'bg-emerald-700', msg: 'Đã đóng vướng mắc' },
  reopen: { title: '↩️ Mở lại', target: 'doing', noteLabel: 'Lý do mở lại', required: true, placeholder: 'Vd: vật tư về chưa đủ số lượng…', btn: 'Mở lại', cls: 'bg-orange-500', msg: 'Đã mở lại' },
  closeDirect: { title: '🔒 Đóng không cần xử lý', target: 'closed', noteLabel: 'Lý do đóng', required: true, placeholder: 'Vd: báo nhầm, đã tự hết, trùng vướng mắc khác…', btn: 'Đóng', cls: 'bg-slate-700', msg: 'Đã đóng vướng mắc' },
};

export function StatusSheet({ row, kind, onClose, onDone }: { row: VuongMacItem; kind: StatusKind; onClose: () => void; onDone: (item: VuongMacItem, msg: string) => void }) {
  const cfg = STATUS_SHEET[kind];
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const item = await changeVuongMacStatus(row.id, cfg.target, note.trim());
      onDone(item, cfg.msg);
    } catch (e: any) {
      setErr(authMsg(e, 'Có lỗi xảy ra'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <BottomSheet title={cfg.title} onClose={onClose}>
      <p className="mb-3 line-clamp-3 text-base text-slate-500">{row.content}</p>
      {kind === 'accept' && !row.handler && <p className="mb-3 rounded-2xl bg-indigo-50 p-3 text-base text-indigo-800">Bạn sẽ được ghi là người xử lý của vướng mắc này.</p>}
      {kind === 'close' && row.resolvedNote && (
        <div className="mb-3 rounded-2xl bg-teal-50 p-3 text-base"><p className="text-sm font-semibold text-teal-700">Người xử lý báo:</p><p className="whitespace-pre-line text-slate-800">{row.resolvedNote}</p></div>
      )}
      <LabeledField label={cfg.noteLabel} required={cfg.required}>
        <MentionTextarea value={note} onChange={setNote} rows={4} maxLength={2000} placeholder={cfg.placeholder} className={inputCls} />
      </LabeledField>
      {err && <p className="mt-2 text-base text-red-600">{err}</p>}
      <button disabled={busy || (cfg.required && !note.trim())} onClick={submit}
        className={`mt-4 w-full rounded-full py-3 text-base font-medium text-white active:opacity-80 disabled:opacity-40 ${cfg.cls}`}>
        {busy ? 'Đang lưu...' : cfg.btn}
      </button>
    </BottomSheet>
  );
}

// ---------------- Xin thêm thời gian ----------------
export function ExtendSheet({ row, onClose, onDone }: { row: VuongMacItem; onClose: () => void; onDone: (item: VuongMacItem) => void }) {
  const [content, setContent] = useState('');
  const [start, setStart] = useState(() => dateToLocalInput(new Date()));
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const botInvalid = !!(start && end && end < start);
  const newBot = end ? `${localInputToBot(start || dateToLocalInput(new Date()))} - ${localInputToBot(end)}` : '';
  const submit = async () => {
    setBusy(true); setErr('');
    try {
      onDone(await extendVuongMacStrict(row.id, { content: content.trim(), bot: newBot, note: note.trim() || undefined }));
    } catch (e: any) {
      setErr(authMsg(e, 'Không gửi được (vướng mắc đã xử lý hoặc không có quyền)'));
    } finally {
      setBusy(false);
    }
  };
  const dl = deadlineInfo({ deadline: row.deadline, bot: newBot });
  return (
    <BottomSheet title="⏳ Cần thêm thời gian" onClose={onClose}>
      <p className="mb-3 text-base text-slate-500">⏰ BOT hiện tại: {row.bot || '—'}</p>
      <div className="space-y-4">
        <LabeledField label="Lý do cần thêm thời gian" required>
          <MentionTextarea value={content} onChange={setContent} rows={3} maxLength={2000} placeholder="Nhập lý do / nội dung cần thêm thời gian... Gõ @ để tag" className={inputCls} />
        </LabeledField>
        <BotPicker start={start} end={end} setStart={setStart} setEnd={setEnd} required />
        {dl.botAfterDeadline && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">⚠ BOT mới sau hạn nhập kho hạng mục ({fmtDay(row.deadline)}).</p>}
        <LabeledField label="📝 Ghi chú">
          <MentionTextarea value={note} onChange={setNote} rows={2} maxLength={2000} placeholder="Nhập ghi chú thêm..." className={inputCls} />
        </LabeledField>
      </div>
      {err && <p className="mt-2 text-base text-red-600">{err}</p>}
      <button disabled={busy || !content.trim() || !end || botInvalid} onClick={submit} className={`${btnPrimary} mt-4`}>
        {busy ? 'Đang gửi...' : 'Gửi yêu cầu'}
      </button>
    </BottomSheet>
  );
}

export function DeleteSheet({ row, onClose, onDone }: { row: VuongMacItem; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setBusy(true); setErr('');
    try { await deleteVuongMacStrict(row.id); onDone(); }
    catch (e: any) { setErr(authMsg(e, 'Không xóa được (kiểm tra quyền)')); }
    finally { setBusy(false); }
  };
  return (
    <BottomSheet title="🗑️ Xóa vướng mắc?" onClose={onClose}>
      <p className="text-base text-slate-800">{row.content}</p>
      <p className="mt-2 text-base text-slate-500">Lịch sử gia hạn, trao đổi và ảnh đính kèm cũng sẽ bị xóa. Thao tác này không hoàn tác được.</p>
      {err && <p className="mt-2 text-base text-red-600">{err}</p>}
      <div className="mt-4 flex gap-3">
        <button onClick={onClose} className="flex-1 rounded-full border border-slate-300 py-3 text-base active:bg-slate-100">Hủy</button>
        <button disabled={busy} onClick={submit} className="flex-1 rounded-full bg-red-600 py-3 text-base font-medium text-white active:opacity-80 disabled:opacity-50">
          {busy ? 'Đang xóa...' : 'Xóa'}
        </button>
      </div>
    </BottomSheet>
  );
}

// Nhật ký đầy đủ của HEX (mọi vướng mắc cùng HEX, kể cả đã xoá)
export function LogSheet({ row, onClose }: { row: VuongMacItem; onClose: () => void }) {
  const [logs, setLogs] = useState<VuongMacLogEntry[] | null>(null);
  useEffect(() => { fetchVuongMacLog(row.hex).then(setLogs); }, [row.hex]);
  const sorted = (logs ?? []).slice().sort((x, y) => new Date(y.actedAt).getTime() - new Date(x.actedAt).getTime() || y.id - x.id);
  return (
    <BottomSheet title={`📜 Nhật ký · HEX ${row.hex}`} onClose={onClose}>
      {!logs && <p className="text-base text-slate-400">Đang tải...</p>}
      {logs && logs.length === 0 && <p className="text-base text-slate-400">Chưa có nhật ký.</p>}
      <ul className="divide-y divide-slate-100">
        {sorted.map(l => {
          const meta = LOG_LABEL[l.action] ?? { icon: '•', label: l.action };
          const body = l.action === 'COMMENT' ? l.contentAfter : l.action === 'DELETE' ? (l.contentBefore || '') : (l.detail || (l.action === 'CREATE' ? l.contentAfter : ''));
          return (
            <li key={l.id} className="py-2.5 text-base">
              <p className="text-sm text-slate-500">
                {meta.icon} <b className="text-slate-700">{l.actor}</b> · {meta.label || 'Bình luận'}{l.vuongMacId && l.vuongMacId !== row.id ? ` · #${l.vuongMacId}` : ''} · {fmtShort(l.actedAt)}
              </p>
              {body && <p className={`mt-0.5 whitespace-pre-line break-words text-slate-800 ${l.action === 'DELETE' ? 'line-through opacity-70' : ''}`}>{body}</p>}
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
}

// Tiện ích cho nơi khác: nhãn trạng thái ngắn
export const statusLabel = (s: VmStatus) => STATUS_META[s].label;
export const HEX_ICONS = { CalendarClock, Factory, XIcon };
