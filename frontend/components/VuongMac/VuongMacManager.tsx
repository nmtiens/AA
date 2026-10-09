import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RefreshCw, Plus, Download, Search as SearchIcon, AlertTriangle, Clock, CheckCircle2, Lock, Hourglass, Flame, Siren } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import {
  fetchVuongMacDashboard, fetchVuongMacAllStrict, fetchHandlerNames, UNAUTHORIZED,
  type VuongMacDashboard, type VuongMacItem, type VmGroupStat, type FiveMCategory, type VmStatus, type VuongMacQuery,
} from '../../services/vuongMacService';
import { fetchXuongList } from '../../services/vuongMacMobileApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { STATUS_META, PRIORITY_META, CAT_CODE, CAT_NAME, catIcon, fmtHours, fmtShort, fmtDay, dayKey, displayState, DISPLAY_META, botCountdown } from './model';
import { DetailSheet, FormSheet, StatusPill, PriorityPill } from './sheets';

// ============================================================================
// MÀN QUẢN LÝ VƯỚNG MẮC (desktop, /vuong-mac — quyền "vuong_mac"):
//  1. Số liệu kỳ: tồn đọng, quá hạn, chờ xác nhận, báo quản lý, thời gian nhận / xử lý / đóng trung bình
//  2. Xu hướng 12 tuần (báo mới / xử lý xong / đóng), tuổi vướng mắc chưa xong, theo loại 5M
//  3. Theo khu vực SX · công đoạn · người xử lý · công trình (bấm 1 dòng để lọc danh sách)
//  4. Cần xử lý ngay (quá hạn lâu nhất) + danh sách đầy đủ có lọc, xuất Excel, mở chi tiết (cùng sheet với app điện thoại)
// ============================================================================

const fmtInt = (n: number | null | undefined) => (n === null || n === undefined ? '–' : n.toLocaleString('vi-VN'));
const todayISO = () => dayKey(new Date());
const daysAgoISO = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return dayKey(d); };

type ListTab = 'active' | 'waiting' | 'closed' | 'all';
const LIST_TABS: { key: ListTab; label: string; st: VmStatus[] }[] = [
  { key: 'active', label: 'Chưa xong', st: ['open', 'doing'] },
  { key: 'waiting', label: 'Chờ xác nhận', st: ['done'] },
  { key: 'closed', label: 'Đã đóng', st: ['closed'] },
  { key: 'all', label: 'Tất cả', st: [] },
];

interface ListFilter {
  tab: ListTab; q: string; cat: FiveMCategory | ''; handler: string; xuong: string; stage: string; due: '' | 'overdue' | 'soon';
  sort: '' | 'bot' | 'oldest' | 'priority'; from: string; to: string; mine: '' | 'assignee' | 'reporter';
}
const DEFAULT_LIST: ListFilter = { tab: 'active', q: '', cat: '', handler: '', xuong: '', stage: '', due: '', sort: 'bot', from: '', to: '', mine: '' };
const PAGE = 50;

export default function VuongMacManager() {
  const { user } = useAuth();
  const { showToast } = useToast();
  // showToast của ToastContext đổi mỗi lần render => không đưa vào deps của useCallback (từng gây vòng lặp
  // tải lại danh sách liên tục); giữ trong ref và flash luôn ổn định
  const toastRef = useRef(showToast);
  toastRef.current = showToast;
  const flash = useCallback((m: string) => toastRef.current(m, 'info'), []);

  // ---- kỳ + xưởng cho số liệu ----
  const [from, setFrom] = useState(daysAgoISO(29));
  const [to, setTo] = useState(todayISO());
  const [xuong, setXuong] = useState('');
  const [xuongs, setXuongs] = useState<string[]>([]);
  const [handlers, setHandlers] = useState<string[]>([]);
  const [dash, setDash] = useState<VuongMacDashboard | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [dashErr, setDashErr] = useState('');

  const loadDash = useCallback(async () => {
    setDashLoading(true); setDashErr('');
    try { setDash(await fetchVuongMacDashboard({ from, to, xuong })); }
    catch (e: any) { setDashErr(e.message === UNAUTHORIZED ? 'Phiên đăng nhập đã hết hạn' : e.message); }
    finally { setDashLoading(false); }
  }, [from, to, xuong]);
  useEffect(() => { loadDash(); }, [loadDash]);
  useEffect(() => {
    fetchXuongList().then(setXuongs).catch(() => {});
    fetchHandlerNames().then(setHandlers).catch(() => {});
  }, []);

  // ---- danh sách ----
  const [f, setF] = useState<ListFilter>(DEFAULT_LIST);
  const set = (p: Partial<ListFilter>) => setF(x => ({ ...x, ...p }));
  // Bấm ô số / dòng ở các bảng nhóm => lọc danh sách rồi cuộn xuống danh sách (trước không có phản hồi gì)
  const listRef = useRef<HTMLDivElement>(null);
  const pick = (p: Partial<ListFilter>, label?: string) => {
    set(p);
    setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    if (label) flash(`Đã lọc danh sách: ${label}`);
  };
  const [rows, setRows] = useState<VuongMacItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(false);
  const [detail, setDetail] = useState<VuongMacItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [qInput, setQInput] = useState('');
  useEffect(() => { const t = setTimeout(() => set({ q: qInput }), 400); return () => clearTimeout(t); }, [qInput]);

  const query = useCallback((p: number, size = PAGE): VuongMacQuery => {
    const tab = LIST_TABS.find(t => t.key === f.tab)!;
    return {
      status: f.tab === 'all' ? 'all' : undefined, st: tab.st.length ? tab.st : '', q: f.q, category: f.cat, handler: f.handler,
      xuong: f.xuong, stage: f.stage, due: f.due, sort: f.sort, from: f.from, to: f.to, mine: f.mine, page: p, pageSize: size,
    };
  }, [f]);
  const loadList = useCallback(async (p = 1) => {
    setListLoading(true);
    try {
      const r = await fetchVuongMacAllStrict(query(p));
      setRows(r.data); setTotal(r.total); setPage(p);
    } catch (e: any) {
      flash(e.message === UNAUTHORIZED ? 'Phiên đăng nhập đã hết hạn' : e.message);
    } finally {
      setListLoading(false);
    }
  }, [query, flash]);
  useEffect(() => { loadList(1); }, [loadList]);

  const refreshAll = () => { loadDash(); loadList(page); };
  const applyChange = (next: VuongMacItem | null, msg: string) => {
    flash(msg);
    if (next === null) { setRows(rs => rs.filter(r => r.id !== detail?.id)); setDetail(null); }
    else { setRows(rs => rs.map(r => (r.id === next.id ? next : r))); setDetail(next); }
    loadDash(); loadList(page);
  };

  // Xuất Excel: tải tối đa 2000 dòng theo bộ lọc hiện tại
  const [exporting, setExporting] = useState(false);
  const exportExcel = async () => {
    setExporting(true);
    try {
      const all: VuongMacItem[] = [];
      for (let p = 1; p <= 10; p++) {
        const r = await fetchVuongMacAllStrict(query(p, 200));
        all.push(...r.data);
        if (all.length >= r.total || r.data.length === 0) break;
      }
      const XLSX = await import('xlsx');
      const data = all.map((v, i) => ({
        STT: i + 1, ID: v.id, HEX: v.hex, 'Công trình': v.congTrinh ?? '', 'Hạng mục': v.hangMuc ?? '', 'Khu vực SX': v.xuong ?? '',
        'Công đoạn lúc báo': v.stage ?? '', 'Công đoạn hiện tại': v.bop ?? '', 'Loại': `${CAT_CODE[v.category]} · ${CAT_NAME[v.category]}`,
        'Trạng thái': STATUS_META[v.status].label, 'Hiển thị': DISPLAY_META[displayState(v)].label, 'Ưu tiên': PRIORITY_META[v.priority].label,
        'Nội dung': v.content, 'Giải pháp': v.solution ?? '', 'Ghi chú': v.note ?? '', 'Người báo': v.createdBy, 'Phòng ban báo': v.createdDepartment ?? '',
        'Ngày báo': fmtShort(v.createdAt), 'Người xử lý': v.handler ?? '', 'Nhận xử lý lúc': fmtShort(v.acceptedAt), 'BOT': v.bot ?? '',
        'Hạn nhập kho hạng mục': fmtDay(v.deadline), 'Xử lý xong lúc': fmtShort(v.resolvedAt), 'Nội dung đã xử lý': v.resolvedNote ?? '',
        'Đóng lúc': fmtShort(v.closedAt), 'Người đóng': v.closedBy ?? '', 'Số lần gia hạn': v.extensions?.length ?? 0,
        'Đã báo quản lý': v.escalatedAt ? 'Có' : '', 'Số ảnh': v.photos?.length ?? 0,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [5, 6, 11, 30, 30, 10, 10, 14, 16, 14, 14, 10, 50, 30, 24, 12, 12, 16, 20, 16, 34, 14, 16, 40, 16, 12, 8, 10, 6].map(wch => ({ wch }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Vuong mac');
      XLSX.writeFile(wb, `vuong_mac_${todayISO()}.xlsx`);
    } catch (e: any) {
      flash(e.message || 'Không xuất được Excel');
    } finally {
      setExporting(false);
    }
  };

  const t = dash?.totals;
  const stages = useMemo(() => {
    const base = ['P001', 'P002', 'P012', 'P013', 'GCVT', 'P014', 'P016', 'P018', 'P020', 'P021', 'P022', 'P025'];
    const extra = (dash?.byStage ?? []).map(x => x.name).filter(n => n !== 'Chưa rõ' && !base.includes(n)).sort();
    return [...base, ...extra];
  }, [dash]);
  const me = user ? { username: user.username, fullName: user.fullName } : undefined;

  return (
    // <main> của bố cục máy tính là overflow-hidden => trang tự có vùng cuộn riêng (giống trang Tra cứu)
    <div className="h-full overflow-y-auto custom-scrollbar">
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-6">
      {/* Tiêu đề + kỳ */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Vướng mắc sản xuất</h1>
          <p className="text-sm text-slate-500">
            Quy trình: Mới → Đang xử lý → Chờ xác nhận → Đã đóng. Số "trong kỳ" tính theo ngày báo / xử lý / đóng trong khoảng đã chọn.
            {dash && !dash.workflow && <span className="ml-1 font-medium text-amber-700">Máy chủ chưa chạy file SQL quy trình (2026-10-10).</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1 text-slate-600">Từ <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5" /></label>
          <label className="flex items-center gap-1 text-slate-600">đến <input type="date" value={to} min={from} max={todayISO()} onChange={e => setTo(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5" /></label>
          {[['7 ngày', 6], ['30 ngày', 29], ['90 ngày', 89]].map(([l, n]) => (
            <button key={String(l)} onClick={() => { setFrom(daysAgoISO(Number(n))); setTo(todayISO()); }} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-600 hover:bg-slate-50">{l}</button>
          ))}
          <select value={xuong} onChange={e => setXuong(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5">
            <option value="">Mọi khu vực SX</option>
            {xuongs.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          <button onClick={refreshAll} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50">
            <RefreshCw size={14} className={dashLoading || listLoading ? 'animate-spin' : ''} /> Làm mới
          </button>
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-800">
            <Plus size={15} /> Báo vướng mắc
          </button>
        </div>
      </div>
      {dashErr && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">⚠️ {dashErr}</p>}

      {/* 1. KPI */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Kpi icon={<Clock size={15} />} label="Chưa xong" value={t?.open} tone="text-blue-700" sub={t ? `${t.open - t.doing} mới · ${t.doing} đang xử lý` : ''} onClick={() => pick({ tab: 'active', due: '' }, 'chưa xong')} />
        <Kpi icon={<AlertTriangle size={15} />} label="Quá hạn BOT" value={t?.overdue} tone="text-red-600" onClick={() => pick({ tab: 'active', due: 'overdue' }, 'quá hạn BOT')} />
        <Kpi icon={<Hourglass size={15} />} label="Sắp đến hạn" value={t?.soon} tone="text-amber-600" sub="≤ 24 giờ" onClick={() => pick({ tab: 'active', due: 'soon' }, 'sắp đến hạn')} />
        <Kpi icon={<CheckCircle2 size={15} />} label="Chờ xác nhận" value={t?.waiting} tone="text-teal-700" onClick={() => pick({ tab: 'waiting', due: '' }, 'chờ xác nhận')} />
        <Kpi icon={<Siren size={15} />} label="Đã báo quản lý" value={t?.escalated} tone="text-red-700" sub="quá hạn > 24 giờ" />
        <Kpi icon={<Flame size={15} />} label="Khẩn" value={t?.urgent} tone="text-orange-600" />
        <Kpi icon={<Plus size={15} />} label="Báo mới trong kỳ" value={t?.created} tone="text-slate-900" sub={t ? `xử lý xong ${t.done} · đóng ${t.closed}` : ''} />
        <Kpi icon={<Lock size={15} />} label="TG xử lý TB" value={null} display={fmtHours(t?.avgDoneHours)} tone="text-slate-900"
          sub={t ? `nhận ${fmtHours(t.avgAcceptHours)} · đóng ${fmtHours(t.avgCloseHours)}` : ''} />
      </div>

      {/* 2. Xu hướng + tuổi + loại */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="12 tuần gần nhất" sub="báo mới · xử lý xong · đóng (theo tuần, thứ Hai)" className="lg:col-span-2">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(dash?.weekly ?? []).map(w => ({ ...w, name: fmtDay(w.start).slice(0, 5) }))} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="created" name="Báo mới" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="done" name="Xử lý xong" fill="#14b8a6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="closed" name="Đã đóng" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Tuổi vướng mắc chưa xong" sub="từ lúc báo đến nay">
          {dash && (
            <Bars rows={[
              ['≤ 1 ngày', dash.aging.d1, 'bg-emerald-500'], ['1–3 ngày', dash.aging.d3, 'bg-lime-500'], ['3–7 ngày', dash.aging.d7, 'bg-amber-500'],
              ['7–14 ngày', dash.aging.d14, 'bg-orange-500'], ['> 14 ngày', dash.aging.more, 'bg-red-500'],
            ]} />
          )}
          <p className="mt-3 text-xs text-slate-500">Chưa có BOT: <b>{fmtInt(t?.noBot)}</b> — nên đặt hạn để theo dõi quá hạn.</p>
        </Panel>
      </div>

      {/* 3. Theo nhóm */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <GroupTable title="Theo loại 5M" rows={dash?.byCategory ?? []} label={n => `${catIcon(n)} ${CAT_CODE[n] ?? ''} ${CAT_NAME[n] ?? n}`}
          onPick={n => pick({ cat: n as FiveMCategory, tab: 'active' }, `${CAT_CODE[n] ?? ''} ${CAT_NAME[n] ?? n}`)} active={f.cat} />
        <GroupTable title="Theo khu vực sản xuất" rows={dash?.byXuong ?? []} onPick={n => pick({ xuong: n === f.xuong ? '' : n, tab: 'active' }, n === f.xuong ? 'bỏ lọc khu vực' : `khu vực ${n}`)} active={f.xuong} />
        <GroupTable title="Theo công đoạn lúc báo" rows={dash?.byStage ?? []} hint="Công đoạn (BOP) của hạng mục lúc báo vướng mắc — biết khâu nào hay vướng"
          onPick={n => pick({ stage: n === f.stage || n === 'Chưa rõ' ? '' : n, tab: 'active' }, n === f.stage ? 'bỏ lọc công đoạn' : `công đoạn ${n}`)} active={f.stage} />
        <GroupTable title="Theo người xử lý" rows={dash?.byHandler ?? []} onPick={n => pick({ handler: n === f.handler || n === 'Chưa giao' ? '' : n, tab: 'active' }, n === f.handler ? 'bỏ lọc người xử lý' : `người xử lý ${n}`)} active={f.handler} showAvg />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <GroupTable title="Theo công trình (nhiều vướng mắc nhất)" rows={dash?.byProject ?? []} onPick={n => { setQInput(n === 'Chưa rõ' ? '' : n); pick({ tab: 'active' }, `công trình ${n}`); }} />
        <Panel title="Cần xử lý ngay" sub="chưa xong, quá hạn lâu nhất / tuổi lớn nhất · bấm 1 dòng để mở chi tiết">
          <ul className="max-h-80 divide-y divide-slate-100 overflow-auto">
            {(dash?.oldest ?? []).map(o => (
              <li key={o.id}>
                <button onClick={() => openById(o.id)} title="Bấm để mở chi tiết" className="group flex w-full items-start gap-3 rounded-lg px-1 py-2 text-left hover:bg-slate-50">
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${o.due === 'overdue' ? 'bg-red-500' : o.due === 'soon' ? 'bg-amber-500' : 'bg-slate-300'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-800"><b>HEX {o.hex}</b> · {o.project}</span>
                    <span className="line-clamp-1 block text-sm text-slate-600">{o.content}</span>
                    <span className="block text-xs text-slate-500">
                      {o.handler ? `👤 ${o.handler}` : <span className="text-amber-700">Chưa giao</span>} · {o.xuong} · {STATUS_META[o.status].label}
                      {o.escalated && <span className="ml-1 text-red-600">🚨 đã báo QL</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs">
                    <span className={`block font-semibold ${o.due === 'overdue' ? 'text-red-600' : 'text-slate-700'}`}>{o.due === 'overdue' ? 'Quá hạn' : o.due === 'none' ? 'Không BOT' : 'Còn hạn'}</span>
                    <span className="block text-slate-500">{Math.round(o.ageHours / 24)} ngày tuổi</span>
                    <span className="block text-blue-600 opacity-0 group-hover:opacity-100">Xem chi tiết ›</span>
                  </span>
                </button>
              </li>
            ))}
            {dash && dash.oldest.length === 0 && <li className="py-6 text-center text-sm text-slate-400">Không còn vướng mắc chưa xong 🎉</li>}
          </ul>
        </Panel>
      </div>

      {/* 4. Danh sách */}
      <div ref={listRef} className="scroll-mt-4" />
      <Panel title="Danh sách vướng mắc" sub={`${fmtInt(total)} mục · bấm 1 dòng để mở chi tiết (nhận xử lý, báo xong, xác nhận đóng, trao đổi)`}
        right={
          <button onClick={exportExcel} disabled={exporting || total === 0} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
            <Download size={14} /> {exporting ? 'Đang xuất…' : 'Xuất Excel'}
          </button>
        }>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            {LIST_TABS.map(tb => (
              <button key={tb.key} onClick={() => set({ tab: tb.key, due: tb.key === 'active' ? f.due : '' })}
                className={`rounded-md px-3 py-1.5 ${f.tab === tb.key ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500'}`}>{tb.label}</button>
            ))}
          </div>
          <div className="relative">
            <SearchIcon size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={qInput} onChange={e => setQInput(e.target.value)} placeholder="Tìm nội dung, HEX, công trình, người…" className="w-64 rounded-lg border border-slate-300 py-1.5 pl-8 pr-2" />
          </div>
          <select value={f.cat} onChange={e => set({ cat: e.target.value as FiveMCategory | '' })} className="rounded-lg border border-slate-300 px-2 py-1.5">
            <option value="">Mọi loại</option>
            {(Object.keys(CAT_CODE) as FiveMCategory[]).map(c => <option key={c} value={c}>{CAT_CODE[c]} · {CAT_NAME[c]}</option>)}
          </select>
          <select value={f.xuong} onChange={e => set({ xuong: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5">
            <option value="">Mọi khu vực SX</option>
            {xuongs.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          <select value={f.stage} onChange={e => set({ stage: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5">
            <option value="">Mọi công đoạn</option>
            {stages.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          <input list="vm-handlers" value={f.handler} onChange={e => set({ handler: e.target.value })} placeholder="Người xử lý" className="w-44 rounded-lg border border-slate-300 px-2 py-1.5" />
          <datalist id="vm-handlers">{handlers.map(h => <option key={h} value={h} />)}</datalist>
          <select value={f.mine} onChange={e => set({ mine: e.target.value as ListFilter['mine'] })} className="rounded-lg border border-slate-300 px-2 py-1.5">
            <option value="">Mọi người</option><option value="assignee">Tôi xử lý</option><option value="reporter">Tôi báo</option>
          </select>
          {f.tab === 'active' && (
            <select value={f.due} onChange={e => set({ due: e.target.value as ListFilter['due'] })} className="rounded-lg border border-slate-300 px-2 py-1.5">
              <option value="">Mọi hạn</option><option value="overdue">Quá hạn BOT</option><option value="soon">Sắp đến hạn</option>
            </select>
          )}
          <select value={f.sort} onChange={e => set({ sort: e.target.value as ListFilter['sort'] })} className="rounded-lg border border-slate-300 px-2 py-1.5">
            <option value="bot">Hạn BOT gần nhất</option><option value="">Mới báo trước</option><option value="oldest">Cũ nhất trước</option><option value="priority">Ưu tiên trước</option>
          </select>
          <label className="flex items-center gap-1 text-slate-600">Báo từ <input type="date" value={f.from} onChange={e => set({ from: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1" /></label>
          <label className="flex items-center gap-1 text-slate-600">đến <input type="date" value={f.to} onChange={e => set({ to: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1" /></label>
          {JSON.stringify({ ...f, q: '' }) !== JSON.stringify({ ...DEFAULT_LIST, q: '' }) && (
            <button onClick={() => { setF(DEFAULT_LIST); setQInput(''); }} className="text-slate-500 underline">Bỏ lọc</button>
          )}
        </div>
        <div className="overflow-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {['Trạng thái', 'HEX · Công trình · Hạng mục', 'Vướng mắc', 'Loại', 'Khu vực · Công đoạn', 'Người xử lý', 'BOT / hạn', 'Người báo'].map(h => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(v => {
                const cd = botCountdown(v);
                const mine = me && v.handler && v.handler.trim().toLowerCase() === (me.fullName ?? '').trim().toLowerCase();
                return (
                  <tr key={v.id} onClick={() => setDetail(v)} title="Bấm để mở chi tiết" className="group cursor-pointer align-top hover:bg-blue-50/40">
                    <td className="px-3 py-2"><div className="flex flex-col items-start gap-1"><StatusPill v={v} /><PriorityPill p={v.priority} />{v.escalatedAt && v.status !== 'closed' && <span className="text-xs text-red-600">🚨 báo QL</span>}</div></td>
                    <td className="max-w-[260px] px-3 py-2">
                      <p className="font-semibold text-blue-700 underline-offset-2 group-hover:underline">HEX {v.hex}</p>
                      <p className="truncate text-slate-700" title={v.congTrinh ?? ''}>{v.congTrinh || '—'}</p>
                      <p className="truncate text-xs text-slate-500" title={v.hangMuc ?? ''}>{v.hangMuc || ''}</p>
                    </td>
                    <td className="max-w-[360px] px-3 py-2"><p className="line-clamp-3 text-slate-800">{v.content}</p>{(v.photos?.length ?? 0) > 0 && <span className="text-xs text-slate-400">📷 {v.photos!.length}</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">{catIcon(v.category)} {CAT_CODE[v.category]}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">{v.xuong || '—'}<br /><span className="text-xs text-slate-500">{v.stage || '—'}{v.bop && v.stage && !String(v.bop).toUpperCase().startsWith(v.stage) ? ` → ${String(v.bop).slice(0, 4)}` : ''}</span></td>
                    <td className="whitespace-nowrap px-3 py-2">{v.handler ? <span className={mine ? 'font-medium text-indigo-700' : 'text-slate-700'}>{v.handler}</span> : <span className="text-amber-700">Chưa giao</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                      {v.bot ? <span className="block text-xs">{v.bot.split(' - ')[1] ?? v.bot}</span> : <span className="text-xs text-slate-400">Chưa có BOT</span>}
                      {cd && <span className={`block text-xs font-medium ${cd.cls}`}>{cd.text}</span>}
                      {v.deadline && <span className="block text-xs text-slate-400">NK hạng mục {fmtDay(v.deadline)}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{v.createdBy}<br />{fmtShort(v.createdAt)}</td>
                  </tr>
                );
              })}
              {!listLoading && rows.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Không có vướng mắc nào khớp bộ lọc.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
          <span>{listLoading ? 'Đang tải…' : `Trang ${page}/${Math.max(1, Math.ceil(total / PAGE))}`}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1 || listLoading} onClick={() => loadList(page - 1)} className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40">‹ Trước</button>
            <button disabled={page * PAGE >= total || listLoading} onClick={() => loadList(page + 1)} className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40">Sau ›</button>
          </div>
        </div>
      </Panel>

      {detail && !creating && <DetailSheet v={detail} onClose={() => setDetail(null)} onChanged={applyChange} flash={flash} />}
      {creating && <FormSheet onClose={() => setCreating(false)} onDone={(item, msg) => { setCreating(false); flash(msg); setDetail(item); loadDash(); loadList(1); }} />}
    </div>
    </div>
  );

  // Mở chi tiết từ danh sách "cần xử lý ngay" (có thể không nằm trong trang danh sách hiện tại)
  async function openById(id: number) {
    const inList = rows.find(r => r.id === id);
    if (inList) { setDetail(inList); return; }
    try {
      const { fetchVuongMacItem } = await import('../../services/vuongMacService');
      setDetail(await fetchVuongMacItem(id));
    } catch (e: any) { flash(e.message); }
  }
}

function Kpi({ icon, label, value, display, tone, sub, onClick }: {
  icon: ReactNode; label: string; value: number | null | undefined; display?: string; tone: string; sub?: string; onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={`rounded-xl border border-slate-200 bg-white p-3 text-left ${onClick ? 'hover:border-slate-400' : ''}`}>
      <p className="flex items-center gap-1.5 text-xs text-slate-500">{icon}{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{display ?? fmtInt(value)}</p>
      {sub && <p className="truncate text-xs text-slate-400" title={sub}>{sub}</p>}
    </Tag>
  );
}

function Panel({ title, sub, right, className = '', children }: { title: string; sub?: string; right?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div><h2 className="text-sm font-semibold text-slate-800">{title}</h2>{sub && <p className="text-xs text-slate-500">{sub}</p>}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Bars({ rows }: { rows: [string, number, string][] }) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  return (
    <div className="space-y-1.5">
      {rows.map(([label, v, cls]) => (
        <div key={label} className="flex items-center gap-2 text-sm">
          <span className="w-20 shrink-0 text-slate-600">{label}</span>
          <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100"><div className={`h-full ${cls}`} style={{ width: `${(v / max) * 100}%` }} /></div>
          <span className="w-8 text-right tabular-nums text-slate-800">{v}</span>
        </div>
      ))}
    </div>
  );
}

function GroupTable({ title, rows, label, onPick, active, hint, showAvg }: {
  title: string; rows: VmGroupStat[]; label?: (name: string) => string; onPick?: (name: string) => void; active?: string; hint?: string; showAvg?: boolean;
}) {
  const shown = useMemo(() => rows.filter(r => r.open || r.waiting || r.created || r.done).slice(0, 12), [rows]);
  return (
    <Panel title={title} sub={hint}>
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-500">
          <tr><th className="pb-1 text-left font-medium">Nhóm</th><th className="pb-1 text-right font-medium">Chưa xong</th><th className="pb-1 text-right font-medium text-red-600">Quá hạn</th><th className="pb-1 text-right font-medium text-teal-700">Chờ XN</th><th className="pb-1 text-right font-medium">Mới / xong kỳ</th>{showAvg && <th className="pb-1 text-right font-medium">TG xử lý</th>}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {shown.map(r => (
            <tr key={r.name} onClick={onPick ? () => onPick(r.name) : undefined} className={`${onPick ? 'cursor-pointer hover:bg-slate-50' : ''} ${active && active === r.name ? 'bg-amber-50' : ''}`}>
              <td className="max-w-[180px] truncate py-1.5 text-slate-800" title={r.name}>{label ? label(r.name) : r.name}</td>
              <td className="py-1.5 text-right font-semibold tabular-nums text-slate-900">{r.open}</td>
              <td className={`py-1.5 text-right tabular-nums ${r.overdue ? 'font-semibold text-red-600' : 'text-slate-300'}`}>{r.overdue || '–'}</td>
              <td className={`py-1.5 text-right tabular-nums ${r.waiting ? 'text-teal-700' : 'text-slate-300'}`}>{r.waiting || '–'}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-600">{r.created} / {r.done}</td>
              {showAvg && <td className="py-1.5 text-right tabular-nums text-slate-600">{fmtHours(r.avgDoneHours)}</td>}
            </tr>
          ))}
          {shown.length === 0 && <tr><td colSpan={showAvg ? 6 : 5} className="py-4 text-center text-slate-400">Không có dữ liệu</td></tr>}
        </tbody>
      </table>
    </Panel>
  );
}
