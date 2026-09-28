import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, History, Plus, Pencil, Trash2, Check, ChevronLeft, ChevronUp, ChevronDown,
  Inbox, AlertTriangle, Search, Lock,
} from 'lucide-react';
import {
  fetchVuongMacList,
  createVuongMac,
  updateVuongMac,
  deleteVuongMac,
  fetchVuongMacLog,
  type VuongMacItem,
  type VuongMacLogEntry,
  type FiveMCategory,
} from '../../../../services/vuongMacService';
import { getToken } from '../../../../services/userService';

// VuongMacItem có thêm handler?, bot?, note?, createdDepartment?, canModify? (xem vuongMacService)
type ChatItem = VuongMacItem;

const LOG_STYLE: Record<VuongMacLogEntry['action'], { label: string; dot: string; badge: string }> = {
  CREATE: { label: 'Thêm', dot: 'bg-emerald-500', badge: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  UPDATE: { label: 'Sửa', dot: 'bg-amber-500', badge: 'border-amber-200 bg-amber-50 text-amber-700' },
  DELETE: { label: 'Xóa', dot: 'bg-red-500', badge: 'border-red-200 bg-red-50 text-red-700' },
};
type LogFilter = 'ALL' | VuongMacLogEntry['action'];

// Vướng mắc đã xóa — dựng lại từ log để hiển thị bản thu gọn trong khung chat
// Thông tin chi tiết của vướng mắc lưu lại ở trình duyệt để còn xem được sau khi bị xóa
interface ItemSnap {
  handler?: string | null;
  bot?: string | null;
  note?: string | null;
  department?: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
}
interface DeletedEntry {
  id: number;
  content: string;
  createdBy: string;
  createdAt: string;
  deletedBy: string;
  deletedAt: string;
  snap?: ItemSnap;
}
type TimelineEntry =
  | { kind: 'item'; item: ChatItem; at: string }
  | { kind: 'deleted'; del: DeletedEntry; at: string };

const pad2 = (n: number) => String(n).padStart(2, '0');
const fmtHM = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const fmtFull = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${fmtHM(iso)} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const dayLabel = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Hôm qua';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// So khớp người dùng: bỏ khoảng trắng đầu/cuối, không phân biệt hoa/thường
const norm = (x?: string | null) => (x ?? '').trim().toLowerCase();
const initialOf = (name?: string | null) => (name ?? '?').trim().charAt(0).toUpperCase() || '?';

// ===== Tìm kiếm: không phân biệt hoa/thường và dấu tiếng Việt ("tồn đọng" khớp "ton dong") =====
// Mỗi ký tự gốc luôn ánh xạ đúng 1 ký tự sau khi "gấp" -> chỉ số khớp dùng lại để cắt chuỗi gốc khi tô sáng.
const foldChar = (c: string) => {
  const f = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
  return f.length === 1 ? f : c;
};
const fold = (s: string) => s.split('').map(foldChar).join('');

const highlight = (text: string, q: string, active: boolean): React.ReactNode => {
  if (!q) return text;
  const ft = fold(text);
  const fq = fold(q);
  if (!fq) return text;
  const parts: React.ReactNode[] = [];
  let from = 0;
  let idx = ft.indexOf(fq, from);
  while (idx !== -1) {
    if (idx > from) parts.push(text.slice(from, idx));
    parts.push(
      <mark key={idx} className={`rounded px-0.5 text-slate-900 ${active ? 'bg-amber-400' : 'bg-yellow-200'}`}>
        {text.slice(idx, idx + fq.length)}
      </mark>
    );
    from = idx + fq.length;
    idx = ft.indexOf(fq, from);
  }
  if (from === 0) return text;
  if (from < text.length) parts.push(text.slice(from));
  return parts;
};

// Các định danh của user đang đăng nhập lấy từ JWT — phương án dự phòng khi
// prop currentUser không khớp với createdBy lưu ở backend.
const tokenIdentities = (): string[] => {
  try {
    const t = getToken();
    if (!t) return [];
    const b64 = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(b64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    const payload = JSON.parse(json);
    const vals: unknown[] = [
      ...Object.values(payload),
      ...(payload.user && typeof payload.user === 'object' ? Object.values(payload.user) : []),
    ];
    return vals
      .filter(v => typeof v === 'string' || typeof v === 'number')
      .map(v => norm(String(v)));
  } catch { return []; }
};

// Lưu/đọc bản chụp thông tin vướng mắc (theo hex + hạng mục) trong localStorage
const snapKey = (hex: string, category: string) => `vuongmac-snap:${hex}:${category}`;
const loadSnaps = (hex: string, category: string): Record<number, ItemSnap> => {
  try { return JSON.parse(localStorage.getItem(snapKey(hex, category)) || '{}'); } catch { return {}; }
};
const saveSnaps = (hex: string, category: string, snaps: Record<number, ItemSnap>) => {
  try { localStorage.setItem(snapKey(hex, category), JSON.stringify(snaps)); } catch { /* bỏ qua */ }
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  hex: string;
  hexLabel: string;
  category: FiveMCategory;
  categoryLabel: string;
  currentUser: string; // tên/username của user đang đăng nhập — so khớp với createdBy
}

const STEPS = ['Nội dung', 'Người xử lý', 'BOT', 'Ghi chú'] as const;
const STEP_HINT = [
  'Mô tả vướng mắc đang gặp',
  'Ai sẽ xử lý vướng mắc này?',
  'Nhập BOT',
  'Có cần ghi chú thêm không? (không bắt buộc)',
];

const emptyDraft = { content: '', handler: '', bot: '', note: '' };

const clampStyle: React.CSSProperties = {
  display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
};

const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 ' +
  'focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100';
const primaryBtn =
  'rounded-lg bg-red-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm transition-colors ' +
  'hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-red-600';

export const VuongMacDetailModal = ({
  isOpen, onClose, hex, hexLabel, category, categoryLabel, currentUser,
}: Props) => {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [deleted, setDeleted] = useState<DeletedEntry[]>([]);
  const [deletedDetailId, setDeletedDetailId] = useState<number | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [logs, setLogs] = useState<VuongMacLogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<LogFilter>('ALL');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const q = query.trim();

  const reload = useCallback(async () => {
    const [map, allLogs] = await Promise.all([
      fetchVuongMacList([hex]),
      fetchVuongMacLog(hex).catch(() => [] as VuongMacLogEntry[]),
    ]);
    const list = ((map[hex] || []) as ChatItem[]).filter(v => v.category === category);
    list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    setItems(list);

    // Chụp lại thông tin các vướng mắc còn tồn tại để xem chi tiết được khi chúng bị xóa
    const snaps = loadSnaps(hex, category);
    list.forEach(v => {
      snaps[v.id] = {
        handler: v.handler, bot: v.bot, note: v.note, department: v.createdDepartment,
        updatedBy: v.updatedBy, updatedAt: v.updatedAt,
      };
    });

    // Dựng lại các vướng mắc đã xóa từ log (backend xóa hẳn nên danh sách không còn trả về)
    const alive = new Set(list.map(v => v.id));
    const catLogs = allLogs.filter(l => l.category === category);
    const seen = new Set<number>();
    const tomb: DeletedEntry[] = [];
    catLogs.forEach(l => {
      const vid = l.vuongMacId;
      if (l.action !== 'DELETE' || vid == null || alive.has(vid) || seen.has(vid)) return;
      seen.add(vid);
      const created = catLogs.find(c => c.vuongMacId === vid && c.action === 'CREATE');
      tomb.push({
        id: vid,
        content: l.contentBefore || '',
        createdBy: created?.actor || '',
        createdAt: created?.actedAt || l.actedAt,
        deletedBy: l.actor,
        deletedAt: l.actedAt,
        snap: snaps[vid],
      });
    });
    setDeleted(tomb);

    // Chỉ giữ bản chụp của vướng mắc còn tồn tại hoặc đã xóa (còn trong log)
    if (allLogs.length > 0) {
      Object.keys(snaps).forEach(k => {
        const id = Number(k);
        if (!alive.has(id) && !seen.has(id)) delete snaps[id];
      });
    }
    saveSnaps(hex, category, snaps);
  }, [hex, category]);

  // Các vướng mắc khớp từ khóa (theo thứ tự cũ -> mới): tìm trong nội dung, người gửi, người xử lý, BOT, ghi chú
  const matchIds = useMemo(() => {
    if (!q) return [] as number[];
    const fq = fold(q);
    return items
      .filter(v => fold([v.content, v.createdBy, v.handler, v.bot, v.note].filter(Boolean).join('\n')).includes(fq))
      .map(v => v.id);
  }, [items, q]);
  const matchKey = matchIds.join(',');

  useEffect(() => {
    if (!isOpen) return;
    setShowLog(false); setWizardOpen(false); setStep(0); setDraft(emptyDraft);
    setEditingId(null); setConfirmId(null); setDeleteId(null); setDetailId(null); setLogFilter('ALL');
    setSearchOpen(false); setQuery(''); setDeletedDetailId(null);
    reload();
  }, [isOpen, reload]);

  useEffect(() => {
    if (isOpen && showLog) fetchVuongMacLog(hex).then(all => setLogs(all.filter(l => l.category === category)));
  }, [isOpen, showLog, hex, category]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [items.length, deleted.length, wizardOpen]);

  // Gõ từ khóa mới -> nhảy tới kết quả mới nhất (cuối đoạn chat)
  useEffect(() => {
    setActiveIdx(matchIds.length ? matchIds.length - 1 : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, matchIds.length]);

  // Cuộn tới kết quả đang chọn
  useEffect(() => {
    if (!q || matchIds.length === 0) return;
    const id = matchIds[Math.min(activeIdx, matchIds.length - 1)];
    itemRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, matchKey, q]);

  if (!isOpen) return null;

  // Dòng thời gian chat: vướng mắc còn tồn tại + vướng mắc đã xóa (thu gọn), xếp theo thời gian gửi
  const timeline: TimelineEntry[] = [
    ...items.map(item => ({ kind: 'item' as const, item, at: item.createdAt })),
    ...deleted.map(del => ({ kind: 'deleted' as const, del, at: del.createdAt })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  // Điều kiện qua từng bước: bước 1-3 bắt buộc, bước 4 (ghi chú) không bắt buộc
  const canNext = !!(
    (step === 0 && draft.content.trim()) ||
    (step === 1 && draft.handler.trim()) ||
    (step === 2 && draft.bot.trim()) ||
    step === 3
  );

  const submit = async () => {
    setSaving(true);
    try {
      const created = await createVuongMac(hex, category, draft.content.trim(), {
        handler: draft.handler.trim(),
        bot: draft.bot.trim(),
        note: draft.note.trim(),
      });
      if (!created) { window.alert('Không gửi được vướng mắc. Vui lòng thử lại (chỉ thành viên cùng phòng ban mới được thêm).'); return; }
      setDraft(emptyDraft); setStep(0); setWizardOpen(false);
      await reload();
    } finally { setSaving(false); }
  };

  const goNext = () => {
    if (!canNext) return;
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else submit();
  };

  const doResolve = async (id: number) => {
    const ok = await updateVuongMac(id, { isResolved: true });
    if (!ok) window.alert('Không cập nhật được trạng thái (chỉ thành viên cùng phòng ban mới thao tác được).');
    setConfirmId(null);
    await reload();
  };
  const doSaveEdit = async (id: number) => {
    if (!editText.trim()) return;
    const ok = await updateVuongMac(id, { content: editText.trim() });
    if (!ok) window.alert('Không sửa được vướng mắc (chỉ thành viên cùng phòng ban mới thao tác được).');
    setEditingId(null);
    await reload();
  };
  const doDelete = async (id: number) => {
    setDeleting(true);
    try {
      const ok = await deleteVuongMac(id);
      if (!ok) window.alert('Không xóa được vướng mắc (chỉ thành viên cùng phòng ban mới thao tác được).');
      setDeleteId(null);
      await reload();
    } finally { setDeleting(false); }
  };

  // ===== Tìm kiếm trong đoạn chat =====
  const matchSet = new Set(matchIds);
  const safeActive = matchIds.length ? Math.min(activeIdx, matchIds.length - 1) : -1;
  const activeId = safeActive >= 0 ? matchIds[safeActive] : null;
  const goMatch = (dir: 1 | -1) => {
    if (matchIds.length === 0) return;
    setActiveIdx(i => (Math.min(i, matchIds.length - 1) + dir + matchIds.length) % matchIds.length);
  };
  const closeSearch = () => { setSearchOpen(false); setQuery(''); };

  // ===== Phân quyền theo phòng ban (server tính sẵn canModify cho từng vướng mắc) =====
  // Thiếu trường canModify (server cũ) thì không chặn ở UI — server vẫn là nơi quyết định cuối cùng.
  const canOperate = (v: ChatItem) => v.canModify !== false;
  // Đoạn chat trống: ai cũng được bắt đầu. Đã có người: phải cùng phòng ban với ít nhất 1 người trong đoạn chat.
  const canAdd = items.length === 0 || items.some(canOperate);
  const deptNames = Array.from(new Set(items.map(v => v.createdDepartment).filter(Boolean))).join(', ');
  const lockMsg = deptNames
    ? `Chỉ phòng ban ${deptNames} mới được thêm, sửa, xóa vướng mắc ở mục này`
    : 'Bạn không thuộc phòng ban được thao tác ở mục này';
  const lockedHint = (
    <span title="Chỉ thành viên cùng phòng ban mới thao tác được" className="flex items-center gap-1 text-[11px] text-slate-400">
      <Lock size={12} /> Chỉ xem
    </span>
  );

  const myIds = [norm(currentUser), ...tokenIdentities()].filter(Boolean);
  const shortCode = (categoryLabel.match(/M\d+/g) ?? [categoryLabel]).join(' + '); // "Con Người (M1)" -> "M1"
const badgeLabel = /M5\b/.test(shortCode) ? shortCode : `${shortCode} + M5`; // "M2" -> "M2 + M5" "M1" -> "M1 + M5"
  const openCount = items.filter(v => !v.isResolved).length;
  const doneCount = items.length - openCount;

  // Nút "Đã xử lý" + bước xác nhận — dùng chung cho bong bóng và cửa sổ chi tiết
  const renderResolve = (v: ChatItem) =>
    confirmId === v.id ? (
      <span className="flex items-center gap-1.5 text-xs">
        <span className="text-slate-500">Xác nhận đã xử lý?</span>
        <button type="button" onClick={() => doResolve(v.id)} className="rounded-full bg-emerald-600 px-3 py-1 font-semibold text-white hover:bg-emerald-700">Xác nhận</button>
        <button type="button" onClick={() => setConfirmId(null)} className="rounded-full px-2 py-1 text-slate-500 hover:bg-white/80">Hủy</button>
      </span>
    ) : (
      <button type="button" onClick={() => setConfirmId(v.id)}
        className="flex items-center gap-1 rounded-full border border-emerald-500 bg-white px-3 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50">
        <Check size={13} /> Đã xử lý
      </button>
    );

  const statusPill = (done: boolean) => (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${done ? 'bg-emerald-500' : 'bg-red-500'}`} />
      {done ? 'Đã xử lý' : 'Đang tồn đọng'}
    </span>
  );

  // ===== Giao diện log: dòng thời gian, nhóm theo ngày, lọc theo loại thao tác =====
  const renderLog = () => {
    const counts = {
      ALL: logs.length,
      CREATE: logs.filter(l => l.action === 'CREATE').length,
      UPDATE: logs.filter(l => l.action === 'UPDATE').length,
      DELETE: logs.filter(l => l.action === 'DELETE').length,
    };
    const list = logFilter === 'ALL' ? logs : logs.filter(l => l.action === logFilter);
    const groups: { day: string; entries: VuongMacLogEntry[] }[] = [];
    list.forEach(l => {
      const day = dayLabel(l.actedAt);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.entries.push(l);
      else groups.push({ day, entries: [l] });
    });

    const filters: { key: LogFilter; label: string }[] = [
      { key: 'ALL', label: 'Tất cả' },
      { key: 'CREATE', label: 'Thêm' },
      { key: 'UPDATE', label: 'Sửa' },
      { key: 'DELETE', label: 'Xóa' },
    ];

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {filters.map(f => (
            <button key={f.key} type="button" onClick={() => setLogFilter(f.key)}
              className={`rounded-full border px-3 py-1 transition-colors ${logFilter === f.key ? 'border-slate-700 bg-slate-800 font-semibold text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}>
              {f.label} <span className="opacity-70">{counts[f.key]}</span>
            </button>
          ))}
        </div>

        {list.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">Không có thao tác nào.</p>
        ) : groups.map(g => (
          <section key={g.day}>
            <h5 className="mb-2 text-xs font-semibold text-slate-500">{g.day}</h5>
            <ol className="relative ml-1.5 space-y-3 border-l border-slate-200 pl-5">
              {g.entries.map(l => {
                const st = LOG_STYLE[l.action];
                const who = myIds.includes(norm(l.actor)) ? 'Bạn' : l.actor;
                const item = items.find(v => v.id === l.vuongMacId);
                const statusOnly = l.action === 'UPDATE' && l.contentBefore === l.contentAfter;
                return (
                  <li key={l.id} className="relative">
                    <span className={`absolute -left-[26px] top-3 h-2.5 w-2.5 rounded-full ring-4 ring-slate-50 ${st.dot}`} />
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="flex items-center gap-2">
                          <span className={`rounded border px-1.5 py-0.5 font-medium ${st.badge}`}>{st.label}</span>
                          <span className="font-medium text-slate-800">{who}</span>
                        </span>
                        <span className="text-slate-400">{fmtHM(l.actedAt)}</span>
                      </div>

                      <div className="mt-1.5 whitespace-pre-wrap break-words text-sm text-slate-700">
                        {l.action === 'CREATE' && (l.contentAfter || '—')}
                        {l.action === 'DELETE' && <span className="text-slate-400 line-through">{l.contentBefore || '—'}</span>}
                        {l.action === 'UPDATE' && (statusOnly ? (
                          <>
                            <span className="font-medium text-emerald-700">Đánh dấu đã xử lý</span>
                            <span className="block text-xs text-slate-400">{l.contentAfter}</span>
                          </>
                        ) : (
                          <>
                            <span className="block text-slate-400 line-through">{l.contentBefore}</span>
                            <span className="block">{l.contentAfter}</span>
                          </>
                        ))}
                      </div>

                      {l.action === 'CREATE' && item && (item.handler || item.bot || item.note) && (
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                          {item.handler && <span>Người xử lý: <span className="text-slate-700">{item.handler}</span></span>}
                          {item.bot && <span>BOT: <span className="text-slate-700">{item.bot}</span></span>}
                          {item.note && <span>Ghi chú: <span className="text-slate-700">{item.note}</span></span>}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    );
  };

  const detail = items.find(v => v.id === detailId) ?? null;
  const toDelete = items.find(v => v.id === deleteId) ?? null;
  const deletedDetail = deleted.find(d => d.id === deletedDetailId) ?? null;
  const whoLabel = (name?: string | null) => (name && myIds.includes(norm(name)) ? 'Bạn' : name);

  return createPortal(
    <div className="fixed inset-0 z-[10003] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]" role="dialog" aria-modal="true">
      <div className="flex h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5" onClick={(e) => e.stopPropagation()}>
        {/* ===== Header ===== */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-red-800">Vướng Mắc — Hex {hex}</h3>
              <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{badgeLabel}</span>
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500">{hexLabel}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium">
              <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-red-600 ring-1 ring-red-100">{openCount} tồn đọng</span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-emerald-700 ring-1 ring-emerald-100">{doneCount} đã xử lý</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!showLog && (
              <button type="button" title="Tìm trong đoạn chat" aria-label="Tìm trong đoạn chat"
                onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
                className={`rounded-lg border p-1.5 transition-colors ${searchOpen ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                <Search size={14} />
              </button>
            )}
            <button type="button" onClick={() => setShowLog(s => !s)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${showLog ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              <History size={14} /> {showLog ? 'Quay lại chat' : 'Xem log'}
            </button>
            <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ===== Thanh tìm kiếm ===== */}
        {!showLog && searchOpen && (
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-6 py-2">
            <Search size={14} className="shrink-0 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); goMatch(e.shiftKey ? 1 : -1); }
                else if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
              }}
              placeholder="Tìm trong đoạn chat (nội dung, người gửi, xử lý, BOT, ghi chú)..."
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
            />
            {q && (
              <span className="shrink-0 text-xs tabular-nums text-slate-500">
                {matchIds.length ? `${safeActive + 1}/${matchIds.length}` : 'Không có kết quả'}
              </span>
            )}
            <button type="button" title="Kết quả cũ hơn (Enter)" disabled={matchIds.length === 0} onClick={() => goMatch(-1)}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent">
              <ChevronUp size={16} />
            </button>
            <button type="button" title="Kết quả mới hơn (Shift+Enter)" disabled={matchIds.length === 0} onClick={() => goMatch(1)}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent">
              <ChevronDown size={16} />
            </button>
            <button type="button" title="Đóng tìm kiếm (Esc)" onClick={closeSearch}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X size={15} />
            </button>
          </div>
        )}

        {/* ===== Thân: log hoặc khung chat ===== */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-5 py-4 custom-scrollbar">
          {showLog ? (
            renderLog()
          ) : (
            <div className="space-y-3">
              {items.length === 0 && deleted.length === 0 && !wizardOpen && (
                <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
                  <Inbox size={36} strokeWidth={1.5} />
                  <p className="text-sm">Chưa có vướng mắc nào.</p>
                  <p className="text-xs">Bấm “Thêm vướng mắc” bên dưới để bắt đầu.</p>
                </div>
              )}

              {timeline.map((entry, idx) => {
                const showDay = idx === 0 || dayLabel(timeline[idx - 1].at) !== dayLabel(entry.at);
                const dayDivider = showDay && (
                  <div className="flex items-center gap-3 py-1 text-[11px] font-medium text-slate-400">
                    <span className="h-px flex-1 bg-slate-200" />
                    {dayLabel(entry.at)}
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>
                );

                // ===== Vướng mắc đã xóa: bản thu gọn =====
                if (entry.kind === 'deleted') {
                  const d = entry.del;
                  const mineDel = !!d.createdBy && myIds.includes(norm(d.createdBy));
                  const whoDeleted = myIds.includes(norm(d.deletedBy)) ? 'Bạn' : d.deletedBy;
                  return (
                    <React.Fragment key={`del-${d.id}`}>
                      {dayDivider}
                      <div className={`flex flex-col ${mineDel ? 'items-end' : 'items-start'}`}>
                        <button
                          type="button"
                          onClick={() => setDeletedDetailId(d.id)}
                          title="Bấm để xem chi tiết"
                          className="max-w-[78%] rounded-xl border border-dashed border-slate-300 bg-slate-100/70 px-3 py-1.5 text-left text-xs text-slate-500 transition-colors hover:bg-slate-100"
                        >
                          <span className="flex items-center gap-1.5">
                            <Trash2 size={12} className="shrink-0 text-slate-400" />
                            <span className="italic">
                              Vướng mắc đã bị xóa bởi <span className="font-medium not-italic text-slate-600">{whoDeleted}</span> · {fmtHM(d.deletedAt)}
                            </span>
                          </span>
                        </button>
                      </div>
                    </React.Fragment>
                  );
                }

                const v = entry.item;
                const mine = !!v.createdBy && myIds.includes(norm(v.createdBy));
                const done = v.isResolved;
                const operable = canOperate(v);
                const isMatch = matchSet.has(v.id);
                const isActive = v.id === activeId;
                const dim = matchIds.length > 0 && !isMatch;
                const noteMatched = !!(q && v.note && fold(v.note).includes(fold(q)));
                const tone = done ? 'border-emerald-300 bg-emerald-50' : 'border-red-200 bg-red-50';
                return (
                  <React.Fragment key={v.id}>
                    {dayDivider}
                    <div
                      ref={el => { itemRefs.current[v.id] = el; }}
                      className={`flex flex-col transition-opacity ${mine ? 'items-end' : 'items-start'} ${dim ? 'opacity-40' : ''}`}
                    >
                      {/* Người gửi + thời gian: nằm NGOÀI, phía trên bong bóng */}
                      <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] text-slate-500">
                        {!mine && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
                            {initialOf(v.createdBy)}
                          </span>
                        )}
                        <span className="font-medium text-slate-700">{mine ? 'Bạn' : highlight(v.createdBy || 'Không rõ', q, isActive)}</span>
                        <span className="text-slate-400">· {fmtHM(v.createdAt)}</span>

                        {operable && editingId !== v.id && (
                          <span className="ml-1 flex gap-1 text-slate-400">
                            <button type="button" title="Sửa" onClick={() => { setEditingId(v.id); setEditText(v.content); }} className="rounded p-1 transition-colors hover:bg-slate-200 hover:text-slate-700"><Pencil size={13} /></button>
                            <button type="button" title="Xóa" onClick={() => setDeleteId(v.id)} className="rounded p-1 transition-colors hover:bg-red-100 hover:text-red-600"><Trash2 size={13} /></button>
                          </span>
                        )}
                      </div>

                      <div className={`min-w-[250px] max-w-[78%] rounded-2xl border px-4 py-3 shadow-sm ${tone} ${mine ? 'rounded-tr-md' : 'rounded-tl-md'} ${isActive ? 'ring-2 ring-amber-400' : ''}`}>
                        {editingId === v.id ? (
                          <div className="space-y-2">
                            <textarea autoFocus className={inputCls} rows={3} value={editText} onChange={e => setEditText(e.target.value)} />
                            <div className="flex justify-end gap-2 text-xs">
                              <button type="button" onClick={() => setEditingId(null)} className="rounded-lg px-3 py-1 text-slate-500 hover:bg-white">Hủy</button>
                              <button type="button" onClick={() => doSaveEdit(v.id)} className="rounded-lg bg-red-600 px-3 py-1 font-semibold text-white hover:bg-red-700">Lưu</button>
                            </div>
                          </div>
                        ) : (
                          <p
                            onClick={() => setDetailId(v.id)}
                            title="Bấm để xem chi tiết"
                            // Tin nhắn khớp từ khóa hiển thị đầy đủ để không bị cắt mất chỗ được tô sáng
                            style={isMatch ? undefined : clampStyle}
                            className={`cursor-pointer whitespace-pre-wrap break-words text-sm leading-relaxed hover:underline ${done ? 'text-emerald-900' : 'text-red-900'}`}
                          >
                            {highlight(v.content, q, isActive)}
                          </p>
                        )}

                        {(v.handler || v.bot || v.note) && (
                          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                            {v.handler && (
                              <span className="rounded-full bg-white/80 px-2 py-0.5 text-slate-500 ring-1 ring-black/5">
                                Xử lý: <span className="font-medium text-slate-800">{highlight(v.handler, q, isActive)}</span>
                              </span>
                            )}
                            {v.bot && (
                              <span className="rounded-full bg-white/80 px-2 py-0.5 text-slate-500 ring-1 ring-black/5">
                                BOT: <span className="font-medium text-slate-800">{highlight(v.bot, q, isActive)}</span>
                              </span>
                            )}
                            {v.note && (
                              <span title={v.note} className="rounded-full bg-white/80 px-2 py-0.5 font-medium text-slate-600 ring-1 ring-black/5">
                                Có ghi chú
                              </span>
                            )}
                          </div>
                        )}
                        {noteMatched && (
                          <p className="mt-1.5 whitespace-pre-wrap break-words text-[11px] text-slate-600">
                            Ghi chú: {highlight(v.note!, q, isActive)}
                          </p>
                        )}

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-black/5 pt-2.5">
                          {statusPill(done)}
                          {!done && (operable ? renderResolve(v) : lockedHint)}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* ===== Chân: nút thêm hoặc wizard 4 bước ===== */}
        {!showLog && (
          <div className="shrink-0 border-t border-slate-200 bg-white p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
            {!wizardOpen ? (
              canAdd ? (
                <button type="button" onClick={() => setWizardOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-red-200 bg-red-50/40 py-3 text-sm font-medium text-red-700 transition-colors hover:border-red-300 hover:bg-red-50">
                  <Plus size={16} /> Thêm vướng mắc — {shortCode} + M5
                </button>
              ) : (
                <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-center text-xs text-slate-500">
                  <Lock size={14} className="shrink-0" /> {lockMsg}
                </div>
              )
            ) : (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <ol className="flex items-center">
                  {STEPS.map((s, i) => (
                    <React.Fragment key={s}>
                      <li className={`flex items-center gap-1.5 text-xs ${i === step ? 'font-bold text-red-700' : i < step ? 'text-emerald-700' : 'text-slate-400'}`}>
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${i === step ? 'border-red-500 bg-red-50' : i < step ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-white'}`}>
                          {i < step ? '✓' : i + 1}
                        </span>
                        <span className="hidden sm:inline">{s}</span>
                      </li>
                      {i < STEPS.length - 1 && <span className={`mx-2 h-px flex-1 ${i < step ? 'bg-emerald-400' : 'bg-slate-300'}`} />}
                    </React.Fragment>
                  ))}
                </ol>

                <p className="text-xs font-medium text-slate-600">{STEP_HINT[step]}</p>

                {step === 0 && (
                  <textarea autoFocus className={inputCls} rows={3} placeholder="Nhập nội dung vướng mắc..."
                    value={draft.content} onChange={e => setDraft(d => ({ ...d, content: e.target.value }))} />
                )}
                {step === 1 && (
                  <input autoFocus className={inputCls} placeholder="Người xử lý"
                    value={draft.handler} onChange={e => setDraft(d => ({ ...d, handler: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') goNext(); }} />
                )}
                {step === 2 && (
                  <input autoFocus className={inputCls} placeholder="BOT"
                    value={draft.bot} onChange={e => setDraft(d => ({ ...d, bot: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') goNext(); }} />
                )}
                {step === 3 && (
                  <textarea autoFocus className={inputCls} rows={2} placeholder="Nhập ghi chú (không bắt buộc)..."
                    value={draft.note} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} />
                )}

                <div className="flex items-center justify-between">
                  <button type="button"
                    onClick={() => (step === 0 ? (setWizardOpen(false), setDraft(emptyDraft)) : setStep(s => s - 1))}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800">
                    <ChevronLeft size={14} /> {step === 0 ? 'Hủy' : 'Quay lại'}
                  </button>
                  {step < STEPS.length - 1 ? (
                    <button type="button" disabled={!canNext} onClick={goNext} className={primaryBtn}>Tiếp tục</button>
                  ) : (
                    <button type="button" disabled={!canNext || saving} onClick={submit} className={primaryBtn}>
                      {saving ? 'Đang gửi...' : 'Gửi vướng mắc'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===== Cửa sổ xem chi tiết 1 vướng mắc ===== */}
      {detail && (
        <div className="fixed inset-0 z-[10004] flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setDetailId(null)}>
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-slate-800">Chi tiết vướng mắc</h4>
                {statusPill(detail.isResolved)}
              </div>
              <button type="button" onClick={() => setDetailId(null)} aria-label="Đóng" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 custom-scrollbar">
              <div className={`whitespace-pre-wrap break-words rounded-xl border p-4 text-sm leading-relaxed ${detail.isResolved ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'}`}>
                {highlight(detail.content, q, false)}
              </div>
              <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2.5 text-sm">
                {([
                  ['Người gửi', detail.createdBy],
                  ['Phòng ban', detail.createdDepartment],
                  ['Thời gian gửi', fmtFull(detail.createdAt)],
                  ['Người xử lý', detail.handler],
                  ['BOT', detail.bot],
                  ['Ghi chú', detail.note],
                  ['Cập nhật cuối', detail.updatedBy ? `${detail.updatedBy} · ${fmtFull(detail.updatedAt)}` : ''],
                ] as [string, string | null | undefined][]).map(([label, value]) => (
                  <React.Fragment key={label}>
                    <dt className="text-slate-400">{label}</dt>
                    <dd className="whitespace-pre-wrap break-words text-slate-700">{value || '—'}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </div>
            {!detail.isResolved && (
              <div className="flex shrink-0 justify-end border-t border-slate-200 px-5 py-3">
                {canOperate(detail) ? renderResolve(detail) : lockedHint}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== Cửa sổ xem chi tiết vướng mắc đã xóa ===== */}
      {deletedDetail && (
        <div className="fixed inset-0 z-[10004] flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setDeletedDetailId(null)}>
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-slate-800">Chi tiết vướng mắc</h4>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
                  <Trash2 size={11} /> Đã xóa
                </span>
              </div>
              <button type="button" onClick={() => setDeletedDetailId(null)} aria-label="Đóng" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 custom-scrollbar">
              <div className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-400 line-through">
                {deletedDetail.content || '—'}
              </div>
              <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2.5 text-sm">
                {([
                  ['Người gửi', whoLabel(deletedDetail.createdBy)],
                  ['Phòng ban', deletedDetail.snap?.department],
                  ['Thời gian gửi', fmtFull(deletedDetail.createdAt)],
                  ['Người xử lý', deletedDetail.snap?.handler],
                  ['BOT', deletedDetail.snap?.bot],
                  ['Ghi chú', deletedDetail.snap?.note],
                  ['Cập nhật cuối', deletedDetail.snap?.updatedBy ? `${deletedDetail.snap.updatedBy} · ${fmtFull(deletedDetail.snap.updatedAt ?? undefined)}` : ''],
                  ['Người xóa', whoLabel(deletedDetail.deletedBy)],
                  ['Thời gian xóa', fmtFull(deletedDetail.deletedAt)],
                ] as [string, string | null | undefined][]).map(([label, value]) => (
                  <React.Fragment key={label}>
                    <dt className="text-slate-400">{label}</dt>
                    <dd className="whitespace-pre-wrap break-words text-slate-700">{value || '—'}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </div>
          </div>
        </div>
      )}

      {/* ===== Hộp thoại cảnh báo xóa ===== */}
      {toDelete && (
        <div className="fixed inset-0 z-[10005] flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => !deleting && setDeleteId(null)}>
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5"
            role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-3 px-5 pt-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                <AlertTriangle size={20} />
              </span>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-slate-800">Xóa vướng mắc này?</h4>
                <p className="mt-1 text-xs text-slate-500">
                  Vướng mắc sẽ được thu gọn và đánh dấu "đã xóa" trong đoạn chat. Thao tác này được ghi lại trong log.
                </p>
              </div>
            </div>

            <div className="mx-5 mt-3 max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-900">
              {toDelete.content}
            </div>

            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
              <button type="button" disabled={deleting} onClick={() => setDeleteId(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                Hủy
              </button>
              <button type="button" disabled={deleting} onClick={() => doDelete(toDelete.id)}
                className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-red-700 disabled:opacity-50">
                <Trash2 size={13} /> {deleting ? 'Đang xóa...' : 'Xóa vướng mắc'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};