import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ClipboardList, LayoutDashboard, Search as SearchIcon, UserRound, SlidersHorizontal, RefreshCw, Plus,
  Share2, History, Pencil, Trash2, RotateCcw, CheckCircle2, Hourglass, X as XIcon,
} from 'lucide-react';
import {
  FIVE_M_LABELS, fetchVuongMacAllStrict, UNAUTHORIZED, updateVuongMac, extendVuongMac,
  deleteVuongMac, fetchVuongMacLog, createVuongMacStrict, uploadVuongMacPhoto, deleteVuongMacPhoto,
  fetchVuongMacPhotoUrl, fetchHexSearch,
  type VuongMacRow, type VuongMacLogEntry, type FiveMCategory, type HexHit,
} from '../../services/vuongMacService';
import { getToken } from '../../services/userService';
import { parseBotEnd, botStart, nowFmt, fmtLocalInput } from '../../services/vuongMacMobileApi';
import HexLookup from './HexLookup';
import PhotoPicker, { type PhotoItem } from './PhotoPicker';
import HandlerPicker from './HandlerPicker';
import MobileHome from './MobileHome';
import MobileAccount from './MobileAccount';
import MobileNotifications, { BellButton } from './MobileNotifications';
import MentionTextarea from './MentionTextarea';
import { fetchUnreadCount } from '../../services/notificationService';
import { formCategoriesFor } from './formCategories';
import {
  BG, CARD, NO_SCROLLBAR, inputCls, btnPrimary, chipCls, pad, fmtTime, fmtShort, fmtAgo,
  catIcon, catLabel, CAT_CODE, STATUS_STYLE, rowStatus, botCountdown, initials,
  LabeledField, BottomSheet, MobileLogin, Toast,
} from './mobileUi';
import {
  DEFAULT_FILTERS, DATE_LABELS, toQuery, activeChips, type ListFilters, type DateMode,
} from './listFilters';

type VMItem = VuongMacRow;
type VMLog = VuongMacLogEntry;
type Sheet =
  | { type: 'resolve' | 'extend' | 'delete' | 'log' | 'edit'; row: VMItem }
  | { type: 'create' }
  | null;

const TEXT_SIZES = [16, 18, 20, 22];
const SIZE_LABELS = ['Nhỏ', 'Vừa', 'Lớn', 'Rất lớn'];
const DEFAULT_SIZE_IDX = 1;
const MAX_PHOTOS = 5;

// Các hàm trong service trả null/false khi lỗi -> đổi thành exception để sheet hiện lỗi
const must = <T,>(r: T | null | false, msg: string): T => {
  if (!r) throw new Error(msg);
  return r as T;
};

// Date -> giá trị cho <input type="datetime-local">
const dateToLocalInput = (d: Date | null) =>
  d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` : '';

// "HH:mm dd/MM/yyyy" (dạng lưu trong bot) -> giá trị cho <input type="datetime-local">
const botTextToLocalInput = (s?: string | null) => {
  const m = (s ?? '').trim().match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[5]}-${pad(+m[4])}-${pad(+m[3])}T${pad(+m[1])}:${m[2]}` : '';
};

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

// ---------------- Thẻ 1 vướng mắc trong danh sách ----------------
function VMCard({ v, onOpen }: { v: VMItem; onOpen: () => void }) {
  const st = STATUS_STYLE[rowStatus(v)];
  const cd = botCountdown(v);
  const photos = v.photos?.length ?? 0;
  const ext = v.extensions?.length ?? 0;
  return (
    <button
      id={`vm-${v.id}`}
      onClick={onOpen}
      className={`${CARD} relative block w-full overflow-hidden p-4 pl-5 text-left active:bg-slate-50`}
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${st.bar}`} />
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${st.pill}`}>
          {st.icon} {st.label}
        </span>
        {cd && <span className={`shrink-0 text-xs font-medium ${cd.cls}`}>{cd.text}</span>}
      </div>
      <p className="line-clamp-2 text-base font-semibold leading-snug text-slate-900">{v.congTrinh || `HEX ${v.hex}`}</p>
      <p className="mt-0.5 truncate text-sm text-slate-500">
        HEX {v.hex}{v.hangMuc ? ` · ${v.hangMuc}` : ''}
      </p>
      <p className="mt-1.5 line-clamp-2 text-base text-slate-700">{v.content}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>{catIcon(v.category)} {CAT_CODE[v.category] ?? FIVE_M_LABELS[v.category]}</span>
        {v.handler && (
          <span className="inline-flex items-center gap-1">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-700">{initials(v.handler)}</span>
            {v.handler}
          </span>
        )}
        {photos > 0 && <span>📷 {photos}</span>}
        {ext > 0 && <span>🔁 {ext}</span>}
        <span className="ml-auto">{fmtAgo(v.createdAt)}</span>
      </div>
    </button>
  );
}

// ---------------- Bộ lọc nâng cao ----------------
function FilterSheet({ f, set, onClose, onReset }: {
  f: ListFilters; set: (p: Partial<ListFilters>) => void; onClose: () => void; onReset: () => void;
}) {
  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
  return (
    <BottomSheet
      title="Bộ lọc"
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          <button onClick={onReset} className="flex-1 rounded-full border border-slate-300 py-3 text-base text-slate-700 active:bg-slate-100">Đặt lại</button>
          <button onClick={onClose} className="flex-1 rounded-full bg-slate-900 py-3 text-base font-medium text-white active:opacity-80">Xong</button>
        </div>
      }
    >
      <div className="space-y-5">
        <Section title="Người phụ trách">
          <button onClick={() => set({ mine: false })} className={chipCls(!f.mine)}>Tất cả</button>
          <button onClick={() => set({ mine: true })} className={chipCls(f.mine)}>👤 Của tôi</button>
        </Section>
        <Section title="Hạn BOT (vướng mắc chưa xử lý)">
          <button onClick={() => set({ due: '' })} className={chipCls(f.due === '')}>Tất cả</button>
          <button onClick={() => set({ due: 'overdue', status: 'open' })} className={chipCls(f.due === 'overdue')}>⏰ Quá hạn</button>
          <button onClick={() => set({ due: 'soon', status: 'open' })} className={chipCls(f.due === 'soon')}>⌛ Còn ≤ 24 giờ</button>
        </Section>
        <Section title="Loại">
          <button onClick={() => set({ cat: '' })} className={chipCls(f.cat === '')}>Mọi loại</button>
          {(Object.keys(CAT_CODE) as FiveMCategory[]).map(c => (
            <button key={c} onClick={() => set({ cat: c })} className={chipCls(f.cat === c)}>{catIcon(c)} {catLabel(c)}</button>
          ))}
        </Section>
        <Section title="Ngày tạo">
          {(['today', 'yesterday', '7d', '30d', 'all', 'custom'] as DateMode[]).map(m => (
            <button key={m} onClick={() => set({ dateMode: m })} className={chipCls(f.dateMode === m)}>{DATE_LABELS[m]}</button>
          ))}
        </Section>
        {f.dateMode === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-slate-500">
              Từ ngày
              <input type="date" value={f.dateFrom} max={f.dateTo || undefined} onChange={e => set({ dateFrom: e.target.value })} className={`${inputCls} mt-1 !py-2`} />
            </label>
            <label className="block text-xs text-slate-500">
              Đến ngày
              <input type="date" value={f.dateTo} min={f.dateFrom || undefined} onChange={e => set({ dateTo: e.target.value })} className={`${inputCls} mt-1 !py-2`} />
            </label>
          </div>
        )}
        <Section title="Sắp xếp">
          <button onClick={() => set({ sort: '' })} className={chipCls(f.sort === '')}>Mới tạo trước</button>
          <button onClick={() => set({ sort: 'bot' })} className={chipCls(f.sort === 'bot')}>Hạn BOT gần nhất</button>
        </Section>
      </div>
    </BottomSheet>
  );
}

// ---------------- Chi tiết 1 vướng mắc ----------------
function DetailSheet({ v, onClose, onAction, onViewPhotos, onReopen, flash }: {
  v: VMItem;
  onClose: () => void;
  onAction: (type: 'resolve' | 'extend' | 'delete' | 'log' | 'edit') => void;
  onViewPhotos: (idx: number) => void;
  onReopen: () => void;
  flash: (m: string) => void;
}) {
  const st = STATUS_STYLE[rowStatus(v)];
  const cd = botCountdown(v);
  const photoIds = v.photos ?? [];

  // Chia sẻ đường dẫn mở thẳng vướng mắc này (dùng được cho Zalo, Messenger...)
  const share = async () => {
    const url = `${location.origin}/m/?id=${v.id}`;
    const text = `Vướng mắc HEX ${v.hex}${v.congTrinh ? ` · ${v.congTrinh}` : ''}\n${v.content}${v.bot ? `\nBOT: ${v.bot}` : ''}`;
    try {
      if (navigator.share) { await navigator.share({ title: 'Vướng mắc', text, url }); return; }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      flash('Đã sao chép nội dung + đường dẫn');
    } catch { /* người dùng hủy chia sẻ */ }
  };

  // Mốc thời gian: tạo -> các lần gia hạn -> đã xử lý
  const timeline: { at?: string | null; title: string; by?: string | null; body?: ReactNode; dot: string }[] = [
    { at: v.createdAt, title: 'Tạo vướng mắc', by: v.createdBy, dot: 'bg-blue-500' },
    ...(v.extensions ?? []).map(e => ({
      at: e.createdAt, title: 'Cần thêm thời gian', by: e.createdBy, dot: 'bg-amber-500',
      body: (
        <>
          <p>{e.content}</p>
          <p className="text-xs text-slate-500">BOT: {e.oldBot || '—'} → <b>{e.bot}</b></p>
          {e.note && <p className="text-xs text-slate-500">📝 {e.note}</p>}
        </>
      ),
    })),
    ...(v.isResolved ? [{
      at: v.resolvedAt, title: 'Đã xử lý', by: v.resolvedBy, dot: 'bg-emerald-500',
      body: v.resolvedNote ? <p>{v.resolvedNote}</p> : undefined,
    }] : []),
  ];

  const iconBtn = 'flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 text-xs text-slate-600 active:bg-slate-100';

  return (
    <BottomSheet
      title={<span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${st.pill}`}>{st.icon} {st.label}</span>}
      headerExtra={cd && <span className={`mr-2 text-sm font-medium ${cd.cls}`}>{cd.text}</span>}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {v.canModify && !v.isResolved && (
            <div className="flex gap-2">
              <button onClick={() => onAction('resolve')} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-emerald-600 py-3 text-base font-medium text-white active:opacity-80">
                <CheckCircle2 size={18} /> Đã xử lý
              </button>
              <button onClick={() => onAction('extend')} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-amber-500 py-3 text-base font-medium text-white active:opacity-80">
                <Hourglass size={18} /> Thêm thời gian
              </button>
            </div>
          )}
          <div className="flex">
            {v.canModify && <button onClick={() => onAction('edit')} className={iconBtn}><Pencil size={18} />Sửa</button>}
            <button onClick={() => onAction('log')} className={iconBtn}><History size={18} />Nhật ký</button>
            <button onClick={share} className={iconBtn}><Share2 size={18} />Chia sẻ</button>
            {v.canModify && v.isResolved && <button onClick={onReopen} className={iconBtn}><RotateCcw size={18} />Mở lại</button>}
            {v.canModify && <button onClick={() => onAction('delete')} className={`${iconBtn} !text-red-600`}><Trash2 size={18} />Xóa</button>}
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-base text-slate-700">
        <div>
          <p className="text-lg font-semibold leading-snug text-slate-900">{v.congTrinh || `HEX ${v.hex}`}</p>
          <p className="text-sm text-slate-500">
            HEX {v.hex}{v.hangMuc ? ` · ${v.hangMuc}` : ''}{v.xuong ? ` · Xưởng ${v.xuong}` : ''}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <Info label="Loại" value={`${catIcon(v.category)} ${catLabel(v.category)}`} />
          <Info label="Người xử lý" value={v.handler || '—'} />
          <Info label="BOT" value={v.bot || 'Chưa có'} wide />
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Nội dung vướng mắc</p>
          <p className="whitespace-pre-line">{v.content}</p>
        </div>
        {v.solution && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">💡 Giải pháp</p>
            <p className="whitespace-pre-line">{v.solution}</p>
          </div>
        )}
        {v.note && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">📝 Ghi chú</p>
            <p className="whitespace-pre-line">{v.note}</p>
          </div>
        )}

        {photoIds.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">📷 Ảnh ({photoIds.length})</p>
            <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
              {photoIds.map((pid, i) => (
                <AuthImg key={pid} id={pid} onClick={() => onViewPhotos(i)} className="aspect-square w-full rounded-2xl object-cover" />
              ))}
            </div>
          </div>
        )}

        {/* Mốc thời gian */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Diễn biến</p>
          <ol className="relative space-y-4 border-l-2 border-slate-100 pl-5">
            {timeline.map((t, i) => (
              <li key={i} className="relative">
                <span className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ring-4 ring-white ${t.dot}`} />
                <p className="text-sm font-medium text-slate-800">{t.title}</p>
                <p className="text-xs text-slate-400">{fmtShort(t.at)}{t.by ? ` · ${t.by}` : ''}</p>
                {t.body && <div className="mt-1 space-y-0.5 text-sm text-slate-700">{t.body}</div>}
              </li>
            ))}
          </ol>
          {/* Chỉ hiện khi thực sự có sửa sau lúc tạo (lệch hơn 1 phút) */}
          {v.updatedAt && v.updatedBy && v.createdAt &&
            new Date(v.updatedAt).getTime() - new Date(v.createdAt).getTime() > 60_000 && (
            <p className="mt-3 text-xs text-slate-400">Sửa lần cuối {fmtShort(v.updatedAt)} · {v.updatedBy}</p>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

function Info({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={`rounded-2xl bg-slate-50 px-3 py-2 ${wide ? 'col-span-2' : ''}`}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="break-words font-medium text-slate-800">{value}</p>
    </div>
  );
}

// ---------------- Danh sách vướng mắc ----------------
function VuongMacList({ active, filters, setFilters, target, onUnauthorized, onChanged, createNonce, flash, bell }: {
  active: boolean;
  filters: ListFilters;
  setFilters: (p: Partial<ListFilters>) => void;
  /** Mở sẵn chi tiết vướng mắc này (từ thông báo / đường dẫn chia sẻ); n đổi => mở lại */
  target: { id: number; n: number } | null;
  /** Nút chuông thông báo ở đầu trang */
  bell: ReactNode;
  onUnauthorized: () => void;
  /** Báo cho màn cha khi dữ liệu thay đổi (để màn Tổng quan tải lại) */
  onChanged: () => void;
  /** Đổi giá trị => mở form thêm mới (nút + ở màn Tổng quan / thanh dưới) */
  createNonce: number;
  flash: (m: string) => void;
}) {
  const [rows, setRows] = useState<VMItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState<number | null>(target?.id ?? null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [viewer, setViewer] = useState<{ ids: number[]; idx: number } | null>(null);
  const [qInput, setQInput] = useState(filters.q);

  // Ô tìm kiếm: gõ xong 400ms mới lọc; màn khác đổi q (vd. bấm công trình ở Tổng quan) thì cập nhật ô
  useEffect(() => { setQInput(filters.q); }, [filters.q]);
  useEffect(() => {
    if (qInput === filters.q) return;
    const t = setTimeout(() => setFilters({ q: qInput }), 400);
    return () => clearTimeout(t);
  }, [qInput]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPage = useCallback(async (p: number, replace: boolean) => {
    setLoading(true); setError('');
    try {
      const r = await fetchVuongMacAllStrict(toQuery(filters, p));
      setRows(prev => (replace ? r.data : [...prev, ...r.data]));
      setTotal(r.total); setPage(p);
    } catch (e: any) {
      if (e.message === UNAUTHORIZED) onUnauthorized();
      else setError(e.message || 'Không tải được dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [filters, onUnauthorized]);

  const reload = useCallback(() => loadPage(1, true), [loadPage]);

  useEffect(() => {
    if (!getToken()) { onUnauthorized(); return; }
    const t = setTimeout(reload, 150);
    return () => clearTimeout(t);
  }, [reload, onUnauthorized]);

  // Tự làm mới khi mở lại app
  useEffect(() => {
    const on = () => document.visibilityState === 'visible' && active && getToken() && reload();
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [reload, active]);

  // Mở chi tiết từ thông báo / đường dẫn
  useEffect(() => { if (target) setDetailId(target.id); }, [target]);

  // Nút + ở nơi khác
  const firstCreate = useRef(createNonce);
  useEffect(() => {
    if (createNonce !== firstCreate.current) setSheet({ type: 'create' });
  }, [createNonce]);

  const afterChange = (msg: string) => { setSheet(null); flash(msg); reload(); onChanged(); };

  const reopen = async (v: VMItem) => {
    try {
      must(await updateVuongMac(v.id, { isResolved: false }), 'Không mở lại được (kiểm tra quyền)');
      afterChange('Đã mở lại');
    } catch (e: any) {
      flash(e.message);
    }
  };

  const detail = detailId !== null ? rows.find(r => r.id === detailId) ?? null : null;
  const chips = activeChips(filters);

  return (
    <div className={`min-h-[100dvh] ${BG} pb-[calc(env(safe-area-inset-bottom)+6rem)]`}>
      <header className={`sticky top-0 z-10 space-y-3 bg-[#f4f6fa]/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur`}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Vướng mắc</h1>
            <p className="text-xs text-slate-500">{loading ? 'Đang tải...' : `${total} mục${rows.length < total ? ` · đã tải ${rows.length}` : ''}`}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={reload}
              aria-label="Làm mới"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm active:bg-slate-100"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            {bell}
          </div>
        </div>

        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <SearchIcon size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={qInput}
              onChange={e => setQInput(e.target.value)}
              placeholder="Tìm nội dung, công trình, HEX, người xử lý"
              className="w-full rounded-full bg-white py-3 pl-11 pr-10 text-base text-slate-900 shadow-sm outline-none placeholder:text-slate-400"
            />
            {qInput && (
              <button onClick={() => { setQInput(''); setFilters({ q: '' }); }} aria-label="Xóa tìm kiếm"
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 active:bg-slate-100">
                <XIcon size={16} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilter(true)}
            aria-label="Bộ lọc"
            className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm active:bg-slate-100"
          >
            <SlidersHorizontal size={18} />
            {chips.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1 text-[10px] font-semibold text-white">{chips.length}</span>
            )}
          </button>
        </div>

        {/* Trạng thái */}
        <div className="grid grid-cols-3 gap-1 rounded-full bg-slate-200/70 p-1">
          {(['open', 'resolved', 'all'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilters({ status: s, ...(s !== 'open' ? { due: '' as const } : {}) })}
              className={`rounded-full py-2 text-sm ${filters.status === s ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              {{ open: 'Tồn đọng', resolved: 'Đã xử lý', all: 'Tất cả' }[s]}
            </button>
          ))}
        </div>

        {/* Bộ lọc đang bật */}
        {chips.length > 0 && (
          <div className={`-mx-4 flex gap-2 overflow-x-auto px-4 ${NO_SCROLLBAR}`}>
            {chips.map(c => (
              <button key={c.key} onClick={() => setFilters(c.clear)}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-xs text-white active:opacity-80">
                {c.label} <XIcon size={12} />
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="space-y-2.5 px-4">
        {error && (
          <div className="space-y-3 rounded-2xl bg-white p-4">
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">⚠️ {error}</p>
            <button onClick={reload} className={btnPrimary}>Thử lại</button>
          </div>
        )}

        {rows.map(v => <VMCard key={v.id} v={v} onOpen={() => setDetailId(v.id)} />)}

        {loading && rows.length === 0 && [0, 1, 2].map(i => (
          <div key={i} className={`${CARD} h-36 animate-pulse bg-white`} />
        ))}

        {!loading && rows.length === 0 && !error && (
          <div className="px-6 py-16 text-center text-sm text-slate-400">
            <p className="mb-2 text-4xl">📭</p>
            Không có vướng mắc nào khớp bộ lọc.
            {chips.length > 0 && (
              <button onClick={() => setFilters({ mine: false, due: '', cat: '', dateMode: 'all', sort: '' })}
                className="mt-3 block w-full text-sm font-medium text-slate-700 underline">
                Bỏ các bộ lọc phụ
              </button>
            )}
          </div>
        )}

        {rows.length < total && (
          <button
            disabled={loading}
            onClick={() => loadPage(page + 1, false)}
            className="w-full rounded-full border border-slate-300 bg-white py-3 text-sm text-slate-700 active:bg-slate-100 disabled:opacity-50"
          >
            {loading ? 'Đang tải...' : `Tải thêm (${rows.length}/${total})`}
          </button>
        )}
      </main>

      {/* Nút thêm mới */}
      {active && createPortal(
        <button
          onClick={() => setSheet({ type: 'create' })}
          aria-label="Thêm vướng mắc"
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg active:opacity-80"
        >
          <Plus size={26} />
        </button>,
        document.body
      )}

      {showFilter && (
        <FilterSheet
          f={filters}
          set={setFilters}
          onClose={() => setShowFilter(false)}
          onReset={() => setFilters({ ...DEFAULT_FILTERS, q: filters.q, status: filters.status })}
        />
      )}

      {detail && !sheet && (
        <DetailSheet
          v={detail}
          onClose={() => setDetailId(null)}
          onAction={type => setSheet({ type, row: detail })}
          onViewPhotos={idx => setViewer({ ids: detail.photos ?? [], idx })}
          onReopen={() => reopen(detail)}
          flash={flash}
        />
      )}

      {sheet?.type === 'create' && (
        <FormSheet onClose={() => setSheet(null)} onDone={afterChange} />
      )}
      {sheet?.type === 'edit' && (
        <FormSheet row={sheet.row} onClose={() => setSheet(null)} onDone={afterChange} />
      )}
      {sheet?.type === 'resolve' && (
        <ResolveSheet row={sheet.row} onClose={() => setSheet(null)} onDone={() => afterChange('Đã đánh dấu xử lý')} />
      )}
      {sheet?.type === 'extend' && (
        <ExtendSheet row={sheet.row} onClose={() => setSheet(null)} onDone={() => afterChange('Đã gửi yêu cầu thêm thời gian')} />
      )}
      {sheet?.type === 'delete' && (
        <DeleteSheet row={sheet.row} onClose={() => setSheet(null)} onDone={() => { setDetailId(null); afterChange('Đã xóa'); }} />
      )}
      {sheet?.type === 'log' && <LogSheet row={sheet.row} onClose={() => setSheet(null)} />}

      {viewer && <PhotoLightbox ids={viewer.ids} start={viewer.idx} onClose={() => setViewer(null)} />}
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
    <BottomSheet
      title={editing ? '✏️ Sửa vướng mắc' : '➕ Thêm vướng mắc'}
      onClose={onClose}
      footer={
        <>
          {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
          {!canSubmit && !busy && (
            <p className="mb-2 text-center text-xs text-slate-400">
              {!editing && !picked ? 'Chọn HEX' : !content.trim() ? 'Nhập nội dung vướng mắc' : 'Kiểm tra lại thời gian BOT'} để lưu
            </p>
          )}
          <button disabled={!canSubmit} onClick={submit} className={btnPrimary}>
            {busy ? (photos.length ? 'Đang lưu và tải ảnh...' : 'Đang lưu...') : editing ? '💾 Lưu thay đổi' : '➕ Thêm vướng mắc'}
          </button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        {/* HEX */}
        <div className="md:col-span-2">
          {editing ? (
            <p className="rounded-2xl bg-slate-100 p-3 text-sm text-slate-600">
              📍 HEX {row!.hex}{row!.congTrinh ? ` · ${row!.congTrinh}` : ''}
            </p>
          ) : picked ? (
            <div className="flex items-start justify-between gap-2 rounded-2xl bg-[#d3e3fd] p-3">
              <div className="min-w-0 text-sm text-slate-800">
                <p className="font-medium">📍 HEX {picked.hex}</p>
                <p className="truncate">{picked.congTrinh}{picked.hangMuc ? ` · ${picked.hangMuc}` : ''}</p>
                {picked.xuong && <p className="text-xs text-slate-600">Xưởng {picked.xuong}</p>}
              </div>
              <button type="button" onClick={() => { setPicked(null); setHexQ(''); }} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-sm text-slate-700 active:bg-slate-100">
                Đổi
              </button>
            </div>
          ) : (
            <div>
              <LabeledField label="🔎 HEX / mã nhà máy / công trình / hạng mục" required>
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
          <p className="mb-1 text-sm font-medium text-slate-700">🏷️ Loại</p>
          {/* Lưới 2 cột (điện thoại) / 4 cột (màn rộng): bấm dễ, không tràn dòng */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {formCategoriesFor(row?.category).map(c => (
              <button
                type="button"
                key={c.value}
                onClick={() => setCategory(c.value)}
                aria-pressed={category === c.value}
                className={`rounded-2xl px-3 py-2 text-left ${category === c.value ? 'bg-[#d3e3fd] ring-1 ring-[#8ab4f8]' : 'border border-slate-200 active:bg-slate-50'}`}
              >
                <span className={`block text-sm ${category === c.value ? 'font-medium text-slate-900' : 'text-slate-700'}`}>
                  {catIcon(c.value)} {c.label}
                </span>
                {c.hint && <span className="block truncate text-xs text-slate-500">{c.hint}</span>}
              </button>
            ))}
          </div>
        </div>

        <LabeledField label="Nội dung vướng mắc" required className="md:col-span-2">
          <MentionTextarea
            value={content}
            onChange={setContent}
            rows={3}
            maxLength={2000}
            placeholder="Mô tả vướng mắc đang gặp... Gõ @ để tag người liên quan"
            className={inputCls}
          />
        </LabeledField>

        {/* Không bọc trong <label>: bấm vào gợi ý không được làm focus nhảy về ô nhập */}
        <div className="md:col-span-2">
          <p className="mb-1 text-sm font-medium text-slate-700">👤 Người xử lý</p>
          <HandlerPicker value={handler} onChange={setHandler} inputClassName={inputCls} />
        </div>

        {/* BOT: bắt đầu + kết thúc — chiếm cả dòng để ô ngày giờ không bị cắt chữ */}
        <div className="space-y-2 md:col-span-2">
          <p className="text-sm font-medium text-slate-700">
            ⏰ BOT{editing && row!.bot ? <span className="font-normal text-slate-500"> (hiện tại: {row!.bot})</span> : null}
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

        <LabeledField label="💡 Giải pháp">
          <MentionTextarea value={solution} onChange={setSolution} rows={2} maxLength={2000}
            placeholder="Nhập giải pháp dự kiến..." className={inputCls} />
        </LabeledField>
        <LabeledField label="📝 Ghi chú">
          <MentionTextarea value={note} onChange={setNote} rows={2} maxLength={2000}
            placeholder="Nhập ghi chú thêm..." className={inputCls} />
        </LabeledField>

        {/* Ảnh */}
        <div className="space-y-2 md:col-span-2">
          <p className="text-sm font-medium text-slate-700">📷 Ảnh đính kèm</p>
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
    <BottomSheet title="✅ Đánh dấu đã xử lý" onClose={onClose}>
      <p className="mb-3 line-clamp-2 text-sm text-slate-500">{row.content}</p>
      <LabeledField label="Nội dung đã xử lý" required>
        <MentionTextarea
          value={note}
          onChange={setNote}
          rows={4}
          maxLength={2000}
          placeholder="Nhập nội dung đã xử lý... Gõ @ để tag người liên quan"
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
    <BottomSheet title="⏳ Cần thêm thời gian" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-500">⏰ BOT hiện tại: {row.bot || '—'}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <LabeledField label="Lý do cần thêm thời gian" required className="md:col-span-2">
          <MentionTextarea
            value={content}
            onChange={setContent}
            rows={3}
            maxLength={2000}
            placeholder="Nhập lý do / nội dung cần thêm thời gian... Gõ @ để tag"
            className={inputCls}
          />
        </LabeledField>

        <div className="space-y-2 md:col-span-2">
          <p className="text-sm font-medium text-slate-700">⏰ BOT mới <span className="text-red-500">*</span></p>
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

        <LabeledField label="📝 Ghi chú" className="md:col-span-2">
          <MentionTextarea value={note} onChange={setNote} rows={2} maxLength={2000} placeholder="Nhập ghi chú thêm..." className={inputCls} />
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
    <BottomSheet title="🗑️ Xóa vướng mắc?" onClose={onClose}>
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
  const actionIcon: Record<string, string> = { CREATE: '🆕', UPDATE: '✏️', DELETE: '🗑️' };
  return (
    <BottomSheet title={`📜 Nhật ký · HEX ${row.hex}`} onClose={onClose}>
      {!logs && <p className="text-sm text-slate-400">Đang tải...</p>}
      <div className="grid gap-2 md:grid-cols-2">
        {logs?.map(l => (
          <div key={l.id} className="rounded-2xl bg-slate-100 p-3 text-sm">
            <p className="font-medium text-slate-800">
              {actionIcon[l.action] ?? '•'} {{ CREATE: 'Tạo mới', UPDATE: 'Cập nhật', DELETE: 'Xóa' }[l.action] ?? l.action} · {l.actor}
            </p>
            {l.contentAfter && <p className="text-slate-600">{l.contentAfter}</p>}
            {l.detail && <p className="whitespace-pre-line text-slate-500">{l.detail}</p>}
            <p className="text-xs text-slate-400">🕒 {fmtTime(l.actedAt)}</p>
          </div>
        ))}
      </div>
      {logs && logs.length === 0 && <p className="text-sm text-slate-400">Chưa có nhật ký.</p>}
    </BottomSheet>
  );
}

// ---------------- Trang chính: 4 tab (Tổng quan | Vướng mắc | Tra cứu HEX | Tài khoản) ----------------
type Tab = 'home' | 'list' | 'lookup' | 'account';

export default function VuongMacMobile() {
  const params = new URLSearchParams(location.search);
  const initialTarget = Number(params.get('id')) || null;
  const initialHex = params.get('hex') || '';

  const [authed, setAuthed] = useState(() => !!getToken());
  const [tab, setTab] = useState<Tab>(() => {
    if (initialTarget) return 'list';
    const t = params.get('tab');
    return t === 'lookup' ? 'lookup' : t === 'list' ? 'list' : 'home';
  });
  // Mở từ thông báo / đường dẫn chia sẻ: xem mọi trạng thái, mọi ngày để chắc thấy mục đó
  // (lọc theo HEX nếu có để chắc chắn mục đó nằm trong trang kết quả đầu)
  const [filters, setFiltersState] = useState<ListFilters>(() =>
    initialTarget ? { ...DEFAULT_FILTERS, status: 'all', dateMode: 'all', q: initialHex } : DEFAULT_FILTERS);
  const [target, setTarget] = useState<{ id: number; n: number } | null>(
    initialTarget ? { id: initialTarget, n: 0 } : null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [dataVersion, setDataVersion] = useState(0);   // tăng khi có thay đổi => Tổng quan tải lại
  const [createNonce, setCreateNonce] = useState(0);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const flash = useCallback((m: string) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2500);
  }, []);

  const setFilters = useCallback((p: Partial<ListFilters>) => setFiltersState(f => ({ ...f, ...p })), []);
  const onUnauthorized = useCallback(() => setAuthed(false), []);
  const onChanged = useCallback(() => setDataVersion(v => v + 1), []);

  // Mở 1 vướng mắc (từ thông báo đẩy / hộp thông báo)
  const openItem = useCallback((id: number, hex?: string | null) => {
    setFiltersState({ ...DEFAULT_FILTERS, status: 'all', dateMode: 'all', q: hex ?? '' });
    setTarget({ id, n: Date.now() });
    setTab('list');
    setNotifOpen(false);
  }, []);

  // Số thông báo chưa đọc: lúc mở app, mỗi 60 giây khi đang xem, khi có thông báo đẩy mới
  const refreshUnread = useCallback(() => {
    if (!getToken()) return;
    fetchUnreadCount().then(r => setUnread(r.unread)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!authed) return;
    refreshUnread();
    const t = setInterval(() => document.visibilityState === 'visible' && refreshUnread(), 60_000);
    const onVis = () => document.visibilityState === 'visible' && refreshUnread();
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [authed, refreshUnread, dataVersion]);

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

  // Bấm thông báo khi app đang mở -> sang tab Vướng mắc, mở chi tiết mục đó
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const h = (e: MessageEvent) => {
      if (e.data?.type === 'open-vuong-mac') openItem(e.data.id, e.data.hex);
      else if (e.data?.type === 'notif-new') refreshUnread();
    };
    navigator.serviceWorker.addEventListener('message', h);
    return () => navigator.serviceWorker.removeEventListener('message', h);
  }, [openItem, refreshUnread]);

  // Cuộn về đầu khi đổi tab
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [tab]);

  if (!authed) {
    return <MobileLogin onSuccess={() => { setAuthed(true); setDataVersion(v => v + 1); }} />;
  }

  const openList = (preset: Partial<ListFilters>) => {
    setFiltersState({ ...DEFAULT_FILTERS, ...preset });
    setTab('list');
  };
  const openCreate = () => { setTab('list'); setCreateNonce(n => n + 1); };

  const NAV: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: 'home', label: 'Tổng quan', icon: <LayoutDashboard size={22} /> },
    { id: 'list', label: 'Vướng mắc', icon: <ClipboardList size={22} /> },
    { id: 'lookup', label: 'Tra cứu HEX', icon: <SearchIcon size={22} /> },
    { id: 'account', label: 'Tài khoản', icon: <UserRound size={22} /> },
  ];

  return (
    <>
      {/* Khung cuộn riêng: không phụ thuộc overflow của html/body/#root */}
      <div ref={scroller} className={`fixed inset-0 overflow-y-auto overscroll-contain ${BG}`}>
        {/* Giữ các tab luôn được mount (ẩn bằng CSS) để không mất bộ lọc / kết quả khi chuyển tab */}
        <div className={tab === 'home' ? '' : 'hidden'}>
          <MobileHome
            active={tab === 'home'}
            refreshKey={dataVersion}
            onOpenList={openList}
            onCreate={openCreate}
            bell={<BellButton unread={unread} onClick={() => setNotifOpen(true)} />}
            onUnauthorized={onUnauthorized}
          />
        </div>
        <div className={tab === 'list' ? '' : 'hidden'}>
          <VuongMacList
            active={tab === 'list'}
            filters={filters}
            setFilters={setFilters}
            target={target}
            bell={<BellButton unread={unread} onClick={() => setNotifOpen(true)} />}
            onUnauthorized={onUnauthorized}
            onChanged={onChanged}
            createNonce={createNonce}
            flash={flash}
          />
        </div>
        <div className={tab === 'lookup' ? '' : 'hidden'}><HexLookup /></div>
        <div className={tab === 'account' ? '' : 'hidden'}>
          <MobileAccount
            sizeIdx={sizeIdx}
            sizeLabels={SIZE_LABELS}
            onSizeChange={setSizeIdx}
            onLoggedOut={() => setAuthed(false)}
            flash={flash}
          />
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl">
          {NAV.map(n => {
            const on = tab === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                aria-current={on ? 'page' : undefined}
                className={`flex flex-1 flex-col items-center gap-0.5 pb-2 pt-2 text-[11px] ${on ? 'font-semibold text-slate-900' : 'text-slate-500'}`}
              >
                <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${on ? 'bg-slate-900 text-white' : ''}`}>
                  {n.icon}
                </span>
                {n.label}
              </button>
            );
          })}
        </div>
      </nav>

      {notifOpen && (
        <MobileNotifications
          onClose={() => setNotifOpen(false)}
          onOpenItem={openItem}
          onUnreadChange={setUnread}
        />
      )}

      <Toast text={toast} />
    </>
  );
}
