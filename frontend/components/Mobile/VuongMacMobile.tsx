import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ClipboardList, LayoutDashboard, Search as SearchIcon, UserRound, SlidersHorizontal, RefreshCw, Plus, X as XIcon,
} from 'lucide-react';
import {
  fetchVuongMacAllStrict, fetchVuongMacItem, UNAUTHORIZED, VM_PRIORITIES,
  type VuongMacItem, type FiveMCategory, type VmStatus,
} from '../../services/vuongMacService';
import { getToken } from '../../services/userService';
import { fetchXuongList } from '../../services/vuongMacMobileApi';
import { useAuth } from '../../context/AuthContext';
import HexLookup from './HexLookup';
import MobileHome from './MobileHome';
import MobileAccount from './MobileAccount';
import MobileNotifications, { BellButton } from './MobileNotifications';
import { fetchUnreadCount } from '../../services/notificationService';
import { BG, NO_SCROLLBAR, inputCls, chipCls, BottomSheet, MobileLogin, Toast } from './mobileUi';
import { STATUS_META, PRIORITY_META, catIcon, catLabel, CAT_CODE } from '../VuongMac/model';
import { VmCard, DetailSheet, FormSheet } from '../VuongMac/sheets';
import {
  DEFAULT_FILTERS, DATE_LABELS, MINE_LABELS, STATUS_TAB_ST, toQuery, activeChips,
  type ListFilters, type DateMode, type StatusTab, type MineMode,
} from './listFilters';

// ============================================================================
// APP VƯỚNG MẮC (điện thoại, PWA tại /m/): 4 tab Tổng quan | Vướng mắc | Tra cứu HEX | Tài khoản.
// Các cửa sổ chi tiết / báo mới / đổi trạng thái dùng chung với web: components/VuongMac/sheets.tsx
// ============================================================================

// Cỡ chữ gốc (px) — mọi kích thước dùng rem/em nên to/nhỏ theo; mặc định "Vừa" = 19px cho dễ đọc trên điện thoại
const TEXT_SIZES = [17, 19, 21, 24];
const SIZE_LABELS = ['Nhỏ', 'Vừa', 'Lớn', 'Rất lớn'];
const DEFAULT_SIZE_IDX = 1;

// ---------------- Bộ lọc nâng cao ----------------
function FilterSheet({ f, set, onClose, onReset, xuongs }: {
  f: ListFilters; set: (p: Partial<ListFilters>) => void; onClose: () => void; onReset: () => void; xuongs: string[];
}) {
  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="space-y-2">
      <p className="text-base font-semibold text-slate-800">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
  const stOptions: VmStatus[] = f.tab === 'active' || f.tab === 'notClosed' ? STATUS_TAB_ST[f.tab] : f.tab === 'all' ? ['open', 'doing', 'done', 'closed'] : [];
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
        <Section title="Liên quan tới tôi">
          {(Object.keys(MINE_LABELS) as MineMode[]).map(m => (
            <button key={m || 'all'} onClick={() => set({ mine: m, ...(m === 'confirm' ? { tab: 'waiting' as StatusTab, st: '' as const } : {}) })} className={chipCls(f.mine === m)}>
              {m ? '👤 ' : ''}{MINE_LABELS[m]}
            </button>
          ))}
        </Section>
        {stOptions.length > 0 && (
          <Section title="Trạng thái">
            <button onClick={() => set({ st: '' })} className={chipCls(f.st === '')}>Tất cả</button>
            {stOptions.map(s => (
              <button key={s} onClick={() => set({ st: s })} className={chipCls(f.st === s)}>{STATUS_META[s].icon} {STATUS_META[s].label}</button>
            ))}
          </Section>
        )}
        <Section title="Hạn BOT (vướng mắc chưa xong)">
          <button onClick={() => set({ due: '' })} className={chipCls(f.due === '')}>Tất cả</button>
          <button onClick={() => set({ due: 'overdue', tab: 'active' })} className={chipCls(f.due === 'overdue')}>⏰ Quá hạn</button>
          <button onClick={() => set({ due: 'soon', tab: 'active' })} className={chipCls(f.due === 'soon')}>⌛ Còn ≤ 24 giờ</button>
        </Section>
        <Section title="Mức ưu tiên">
          <button onClick={() => set({ priority: '' })} className={chipCls(f.priority === '')}>Tất cả</button>
          {VM_PRIORITIES.filter(p => p !== 'normal').map(p => (
            <button key={p} onClick={() => set({ priority: p })} className={chipCls(f.priority === p)}>{PRIORITY_META[p].icon} {PRIORITY_META[p].label}</button>
          ))}
        </Section>
        <Section title="Loại">
          <button onClick={() => set({ cat: '' })} className={chipCls(f.cat === '')}>Mọi loại</button>
          {(Object.keys(CAT_CODE) as FiveMCategory[]).map(c => (
            <button key={c} onClick={() => set({ cat: c })} className={chipCls(f.cat === c)}>{catIcon(c)} {catLabel(c)}</button>
          ))}
        </Section>
        {xuongs.length > 0 && (
          <Section title="Khu vực sản xuất">
            <button onClick={() => set({ xuong: '' })} className={chipCls(f.xuong === '')}>Tất cả</button>
            {xuongs.map(x => <button key={x} onClick={() => set({ xuong: x })} className={chipCls(f.xuong === x)}>{x}</button>)}
          </Section>
        )}
        <Section title="Ngày báo">
          {(['all', 'today', 'yesterday', '7d', '30d', 'custom'] as DateMode[]).map(m => (
            <button key={m} onClick={() => set({ dateMode: m })} className={chipCls(f.dateMode === m)}>{DATE_LABELS[m]}</button>
          ))}
        </Section>
        {f.dateMode === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm text-slate-500">
              Từ ngày
              <input type="date" value={f.dateFrom} max={f.dateTo || undefined} onChange={e => set({ dateFrom: e.target.value })} className={`${inputCls} mt-1 !py-2`} />
            </label>
            <label className="block text-sm text-slate-500">
              Đến ngày
              <input type="date" value={f.dateTo} min={f.dateFrom || undefined} onChange={e => set({ dateTo: e.target.value })} className={`${inputCls} mt-1 !py-2`} />
            </label>
          </div>
        )}
        <Section title="Sắp xếp">
          <button onClick={() => set({ sort: '' })} className={chipCls(f.sort === '')}>Mới báo trước</button>
          <button onClick={() => set({ sort: 'bot' })} className={chipCls(f.sort === 'bot')}>Hạn BOT gần nhất</button>
          <button onClick={() => set({ sort: 'priority' })} className={chipCls(f.sort === 'priority')}>Ưu tiên trước</button>
          <button onClick={() => set({ sort: 'oldest' })} className={chipCls(f.sort === 'oldest')}>Cũ nhất trước</button>
        </Section>
      </div>
    </BottomSheet>
  );
}

// ---------------- Danh sách vướng mắc ----------------
function VuongMacList({ active, filters, setFilters, target, onUnauthorized, onChanged, createNonce, flash, bell, onOpenHex }: {
  active: boolean;
  filters: ListFilters;
  setFilters: (p: Partial<ListFilters>) => void;
  /** Mở sẵn chi tiết vướng mắc này (từ thông báo / đường dẫn chia sẻ); n đổi => mở lại */
  target: { id: number; n: number } | null;
  bell: ReactNode;
  onUnauthorized: () => void;
  onChanged: () => void;
  createNonce: number;
  flash: (m: string) => void;
  onOpenHex: (hex: string) => void;
}) {
  const { user } = useAuth();
  const [rows, setRows] = useState<VuongMacItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [workflow, setWorkflow] = useState(true);
  // Chi tiết đang mở: lấy từ danh sách, hoặc tải riêng (mở từ thông báo mà danh sách không chứa)
  const [detail, setDetail] = useState<VuongMacItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [qInput, setQInput] = useState(filters.q);
  const [xuongs, setXuongs] = useState<string[]>([]);

  useEffect(() => { fetchXuongList().then(setXuongs).catch(() => {}); }, []);

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
      setTotal(r.total); setPage(p); setWorkflow(r.workflow !== false);
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
  useEffect(() => {
    if (!target) return;
    const inList = rows.find(r => r.id === target.id);
    if (inList) { setDetail(inList); return; }
    fetchVuongMacItem(target.id).then(setDetail).catch(e => flash(e.message === UNAUTHORIZED ? 'Phiên đăng nhập đã hết hạn' : e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // Nút + ở nơi khác
  const firstCreate = useRef(createNonce);
  useEffect(() => { if (createNonce !== firstCreate.current) setCreating(true); }, [createNonce]);

  // Sau khi đổi: cập nhật dòng trong danh sách (hoặc bỏ nếu xoá / không còn khớp bộ lọc thì vẫn giữ cho đỡ giật)
  const applyChange = (next: VuongMacItem | null, msg: string) => {
    flash(msg);
    if (next === null) { setRows(rs => rs.filter(r => r.id !== detail?.id)); setDetail(null); }
    else { setRows(rs => rs.map(r => (r.id === next.id ? next : r))); setDetail(next); }
    onChanged();
    reload();
  };

  const chips = activeChips(filters);

  return (
    <div className={`min-h-[100dvh] ${BG} pb-[calc(env(safe-area-inset-bottom)+6rem)]`}>
      <header className={`sticky top-0 z-10 space-y-3 bg-[#f4f6fa]/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur`}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Vướng mắc</h1>
            <p className="text-sm text-slate-500">{loading ? 'Đang tải...' : `${total} mục${rows.length < total ? ` · đã tải ${rows.length}` : ''}`}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={reload} aria-label="Làm mới" className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm active:bg-slate-100">
              <RefreshCw size="1.125em" className={loading ? 'animate-spin' : ''} />
            </button>
            {bell}
          </div>
        </div>

        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <SearchIcon size="1.125em" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={qInput} onChange={e => setQInput(e.target.value)} placeholder="Tìm nội dung, công trình, HEX, người xử lý"
              className="w-full rounded-full bg-white py-3 pl-11 pr-10 text-base text-slate-900 shadow-sm outline-none placeholder:text-slate-400" />
            {qInput && (
              <button onClick={() => { setQInput(''); setFilters({ q: '' }); }} aria-label="Xóa tìm kiếm"
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 active:bg-slate-100">
                <XIcon size="1em" />
              </button>
            )}
          </div>
          <button onClick={() => setShowFilter(true)} aria-label="Bộ lọc"
            className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm active:bg-slate-100">
            <SlidersHorizontal size="1.125em" />
            {chips.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1 text-xs font-semibold text-white">{chips.length}</span>
            )}
          </button>
        </div>

        {/* Nhóm trạng thái (nhãn ngắn để vừa 1 dòng trên điện thoại) */}
        <div className="grid grid-cols-4 gap-1 rounded-full bg-slate-200/70 p-1">
          {([['active', 'Chưa xong'], ['waiting', 'Chờ XN'], ['closed', 'Đã đóng'], ['all', 'Tất cả']] as [StatusTab, string][]).map(([s, label]) => (
            <button key={s} onClick={() => setFilters({ tab: s, st: '', ...(s !== 'active' ? { due: '' as const } : {}) })}
              className={`whitespace-nowrap rounded-full py-2 text-sm ${filters.tab === s ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500'}`}>
              {label}
            </button>
          ))}
        </div>

        {chips.length > 0 && (
          <div className={`-mx-4 flex gap-2 overflow-x-auto px-4 ${NO_SCROLLBAR}`}>
            {chips.map(c => (
              <button key={c.key} onClick={() => setFilters(c.clear)} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-sm text-white active:opacity-80">
                {c.label} <XIcon size="0.75em" />
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="space-y-2.5 px-4">
        {!workflow && (
          <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">
            Máy chủ chưa chạy file SQL quy trình (2026-10-10): đang dùng 2 trạng thái cũ, chưa dùng được "Nhận xử lý" / "Xác nhận đóng".
          </p>
        )}
        {error && (
          <div className="space-y-3 rounded-2xl bg-white p-4">
            <p className="rounded-xl bg-red-50 p-3 text-base text-red-700">⚠️ {error}</p>
            <button onClick={reload} className="w-full rounded-full bg-slate-900 py-3 text-base font-medium text-white">Thử lại</button>
          </div>
        )}

        {rows.map(v => <VmCard key={v.id} v={v} me={user ? { username: user.username, fullName: user.fullName } : undefined} onOpen={() => setDetail(v)} />)}

        {loading && rows.length === 0 && [0, 1, 2].map(i => <div key={i} className="h-36 animate-pulse rounded-2xl bg-white" />)}

        {!loading && rows.length === 0 && !error && (
          <div className="px-6 py-16 text-center text-base text-slate-400">
            <p className="mb-2 text-4xl">📭</p>
            Không có vướng mắc nào khớp bộ lọc.
            {chips.length > 0 && (
              <button onClick={() => setFilters({ ...DEFAULT_FILTERS, tab: filters.tab, q: filters.q })} className="mt-3 block w-full text-base font-medium text-slate-700 underline">
                Bỏ các bộ lọc phụ
              </button>
            )}
          </div>
        )}

        {rows.length < total && (
          <button disabled={loading} onClick={() => loadPage(page + 1, false)}
            className="w-full rounded-full border border-slate-300 bg-white py-3 text-base text-slate-700 active:bg-slate-100 disabled:opacity-50">
            {loading ? 'Đang tải...' : `Tải thêm (${rows.length}/${total})`}
          </button>
        )}
      </main>

      {active && createPortal(
        <button onClick={() => setCreating(true)} aria-label="Báo vướng mắc"
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] right-4 z-30 flex h-14 items-center gap-2 rounded-2xl bg-slate-900 px-4 text-base font-medium text-white shadow-lg active:opacity-80">
          <Plus size="1.375em" /> Báo vướng mắc
        </button>,
        document.body
      )}

      {showFilter && (
        <FilterSheet f={filters} set={setFilters} xuongs={xuongs} onClose={() => setShowFilter(false)}
          onReset={() => setFilters({ ...DEFAULT_FILTERS, q: filters.q, tab: filters.tab })} />
      )}
      {detail && !creating && (
        <DetailSheet v={detail} onClose={() => setDetail(null)} onChanged={applyChange} onOpenHex={onOpenHex} flash={flash} />
      )}
      {creating && (
        <FormSheet onClose={() => setCreating(false)} onDone={(item, msg) => { setCreating(false); flash(msg); setDetail(item); onChanged(); reload(); }} />
      )}
    </div>
  );
}

// ---------------- Trang chính: 4 tab ----------------
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
  // Mở từ thông báo / đường dẫn chia sẻ: xem mọi trạng thái để chắc thấy mục đó
  const [filters, setFiltersState] = useState<ListFilters>(() =>
    initialTarget ? { ...DEFAULT_FILTERS, tab: 'all', q: initialHex } : DEFAULT_FILTERS);
  const [target, setTarget] = useState<{ id: number; n: number } | null>(initialTarget ? { id: initialTarget, n: 0 } : null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [dataVersion, setDataVersion] = useState(0);   // tăng khi có thay đổi => Tổng quan tải lại
  const [createNonce, setCreateNonce] = useState(0);
  const [lookupQ, setLookupQ] = useState(initialHex && !initialTarget ? initialHex : '');
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
  const openItem = useCallback((id: number) => {
    setTarget({ id, n: Date.now() });
    setTab('list');
    setNotifOpen(false);
  }, []);
  const openHex = useCallback((hex: string) => { setLookupQ(hex); setTab('lookup'); }, []);

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

  // Cỡ chữ toàn app
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
      if (e.data?.type === 'open-vuong-mac') openItem(e.data.id);
      else if (e.data?.type === 'notif-new') refreshUnread();
    };
    navigator.serviceWorker.addEventListener('message', h);
    return () => navigator.serviceWorker.removeEventListener('message', h);
  }, [openItem, refreshUnread]);

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
    { id: 'home', label: 'Tổng quan', icon: <LayoutDashboard size="1.375em" /> },
    { id: 'list', label: 'Vướng mắc', icon: <ClipboardList size="1.375em" /> },
    { id: 'lookup', label: 'Tra cứu HEX', icon: <SearchIcon size="1.375em" /> },
    { id: 'account', label: 'Tài khoản', icon: <UserRound size="1.375em" /> },
  ];

  return (
    <>
      <div ref={scroller} className={`fixed inset-0 overflow-y-auto overscroll-contain ${BG}`}>
        {/* Giữ các tab luôn được mount (ẩn bằng CSS) để không mất bộ lọc / kết quả khi chuyển tab */}
        <div className={tab === 'home' ? '' : 'hidden'}>
          <MobileHome active={tab === 'home'} refreshKey={dataVersion} onOpenList={openList} onCreate={openCreate}
            bell={<BellButton unread={unread} onClick={() => setNotifOpen(true)} />} onUnauthorized={onUnauthorized} />
        </div>
        <div className={tab === 'list' ? '' : 'hidden'}>
          <VuongMacList active={tab === 'list'} filters={filters} setFilters={setFilters} target={target}
            bell={<BellButton unread={unread} onClick={() => setNotifOpen(true)} />}
            onUnauthorized={onUnauthorized} onChanged={onChanged} createNonce={createNonce} flash={flash} onOpenHex={openHex} />
        </div>
        <div className={tab === 'lookup' ? '' : 'hidden'}><HexLookup presetQ={lookupQ} /></div>
        <div className={tab === 'account' ? '' : 'hidden'}>
          <MobileAccount sizeIdx={sizeIdx} sizeLabels={SIZE_LABELS} onSizeChange={setSizeIdx} onLoggedOut={() => setAuthed(false)} flash={flash} />
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl">
          {NAV.map(n => {
            const on = tab === n.id;
            return (
              <button key={n.id} onClick={() => setTab(n.id)} aria-current={on ? 'page' : undefined}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 whitespace-nowrap pb-2 pt-2 text-[0.6875rem] ${on ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
                <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${on ? 'bg-slate-900 text-white' : ''}`}>{n.icon}</span>
                {n.label}
              </button>
            );
          })}
        </div>
      </nav>

      {notifOpen && <MobileNotifications onClose={() => setNotifOpen(false)} onOpenItem={openItem} onUnreadChange={setUnread} />}
      <Toast text={toast} />
    </>
  );
}
