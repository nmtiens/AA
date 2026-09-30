import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  FIVE_M_CATEGORIES, FIVE_M_LABELS, UNAUTHORIZED, fetchVuongMacList,
  type FiveMCategory, type VuongMacItem,
} from '../../services/vuongMacService';
import { getToken } from '../../services/userService';
import {
  fetchXuongList, searchHex, fetchHexNotes, createVuongMacStrict, fmtLocalInput,
  type HexHit,
} from '../../services/vuongMacMobileApi';
// TODO: thêm `export` cho NoteContent trong HexDetailModal.tsx rồi chỉnh lại đường dẫn import này
import { NoteContent } from '../Dashboard/components/modals/HexDetailModal';

// Các ô ghi chú giống bảng "Chi tiết theo Hex" trên desktop
const NOTE_LABELS: [string, string][] = [
  ['ghi_chu_don_hang_tong', 'Ghi chú đơn hàng tổng'],
  ['ghi_chu_phieu', 'Ghi chú phiếu'],
  ['tong_hop_ghi_chu_nhap_kho', 'Tổng hợp ghi chú nhập kho'],
  ['tong_hop_thong_tin_qc', 'Tổng hợp thông tin QC'],
  ['tong_hop_ghi_chu_xuat_kho', 'Tổng hợp ghi chú xuất kho'],
];

const VM_TEXT: Record<FiveMCategory, string> = {
  man: 'text-blue-700',
  machine: 'text-purple-700',
  material: 'text-amber-700',
  method: 'text-teal-700',
  measurement: 'text-pink-700',
};

type Detail = { notes: Record<string, string | null>; items: VuongMacItem[] };
type Counts = Record<string, { open: number; done: number }>;

const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm';
const btnPrimary = 'w-full rounded-lg bg-slate-800 py-2.5 text-sm font-medium text-white disabled:opacity-50';
const fmtTime = (s?: string | null) => (s ? new Date(s).toLocaleString('vi-VN', { hour12: false }) : '');

// Đơn vị: 1,000 VNĐ (giống desktop)
const toNum = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const money = (v: unknown) =>
  (toNum(v) / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 2 });

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  // Render ra document.body để không bị thanh menu dưới (z-20) hay khung cuộn cha che mất
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end bg-black/40" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="px-2 text-slate-400">✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

function Field({ label, value, className = '' }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[11px] font-semibold text-slate-400">{label}</p>
      <p className="break-words text-xs text-slate-800">{value || '—'}</p>
    </div>
  );
}

export default function HexLookup() {
  const [xuongs, setXuongs] = useState<string[]>([]);
  const [xuong, setXuong] = useState('');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<HexHit[]>([]);
  const [counts, setCounts] = useState<Counts>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openHex, setOpenHex] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, Detail | 'loading'>>({});
  const [addFor, setAddFor] = useState<HexHit | null>(null);
  const [toast, setToast] = useState('');
  const reqId = useRef(0);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  useEffect(() => {
    if (!getToken()) return;
    fetchXuongList().then(setXuongs).catch(() => { /* bỏ qua */ });
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (!getToken()) { setError(UNAUTHORIZED); setLoading(false); return; }
    if (term.length < 2 && !xuong) {
      reqId.current++;
      setHits([]); setCounts({}); setError(''); setLoading(false);
      return;
    }
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const r = await searchHex(term, xuong);
        if (id !== reqId.current) return;
        setHits(r);
        const map = await fetchVuongMacList(r.map(h => h.hex));
        if (id !== reqId.current) return;
        const c: Counts = {};
        r.forEach(h => {
          const l = map[h.hex] || [];
          c[h.hex] = { open: l.filter(v => !v.isResolved).length, done: l.filter(v => v.isResolved).length };
        });
        setCounts(c);
      } catch (e: any) {
        if (id === reqId.current) setError(e.message || 'Không tìm được');
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q, xuong]);

  const loadDetail = useCallback(async (hex: string) => {
    setDetails(d => ({ ...d, [hex]: 'loading' }));
    try {
      const [notes, map] = await Promise.all([fetchHexNotes(hex), fetchVuongMacList([hex])]);
      const items = map[hex] || [];
      setDetails(d => ({ ...d, [hex]: { notes, items } }));
      setCounts(c => ({
        ...c,
        [hex]: { open: items.filter(v => !v.isResolved).length, done: items.filter(v => v.isResolved).length },
      }));
    } catch (e: any) {
      setDetails(d => { const n = { ...d }; delete n[hex]; return n; });
      flash(e.message === UNAUTHORIZED ? 'Phiên đăng nhập đã hết hạn' : (e.message || 'Không tải được chi tiết'));
    }
  }, []);

  const toggle = (hex: string) => {
    const opening = openHex !== hex;
    setOpenHex(opening ? hex : null);
    if (opening && !details[hex]) loadDetail(hex);
  };

  const goLogin = () => {
    sessionStorage.setItem('after_login', '/m?tab=lookup');
    window.location.href = '/';
  };

  const chip = (on: boolean) =>
    `shrink-0 rounded-full border px-3 py-1 text-xs ${on ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`;

  const hint = !error && !loading && hits.length === 0
    ? (q.trim().length < 2 && !xuong
        ? 'Nhập mã hex, công trình hoặc hạng mục (từ 2 ký tự), hoặc chọn xưởng để bắt đầu.'
        : 'Không tìm thấy hex nào phù hợp.')
    : '';

  return (
    <div className="min-h-screen bg-slate-50 pb-[calc(env(safe-area-inset-bottom)+72px)]">
      <header className="sticky top-0 z-10 space-y-2 bg-white px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-red-800">Tra cứu hex</h1>
          <span className="text-xs text-slate-500">{loading ? 'Đang tìm...' : hits.length ? `${hits.length} hex` : ''}</span>
        </div>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Mã hex, công trình, hạng mục..."
          className={inputCls}
          inputMode="search"
        />
        {xuongs.length > 0 && (
          <div className="flex gap-2 overflow-x-auto">
            <button onClick={() => setXuong('')} className={chip(xuong === '')}>Mọi xưởng</button>
            {xuongs.map(x => (
              <button key={x} onClick={() => setXuong(xuong === x ? '' : x)} className={chip(xuong === x)}>{x}</button>
            ))}
          </div>
        )}
      </header>

      <main className="space-y-3 p-4">
        {error === UNAUTHORIZED ? (
          <div className="space-y-2 rounded-lg bg-red-100 p-3 text-sm text-red-700">
            <p>Bạn chưa đăng nhập hoặc phiên đã hết hạn.</p>
            <button onClick={goLogin} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white">Đăng nhập</button>
          </div>
        ) : error ? (
          <p className="rounded-lg bg-red-100 p-3 text-sm text-red-700">{error}</p>
        ) : null}

        {hint && <p className="py-12 text-center text-sm text-slate-400">{hint}</p>}

        {hits.map(h => {
          const open = openHex === h.hex;
          const c = counts[h.hex];
          const d = details[h.hex];
          return (
            <article key={h.hex} className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm ${open ? 'ring-2 ring-slate-300' : ''}`}>
              <button className="w-full text-left" onClick={() => toggle(h.hex)}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{h.hex}</p>
                  <div className="flex shrink-0 gap-1 text-[10px] font-medium">
                    {c && c.open > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-600">{c.open} tồn đọng</span>}
                    {c && c.done > 0 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">{c.done} đã xử lý</span>}
                  </div>
                </div>
                <p className="mt-0.5 text-xs text-slate-600">{h.congTrinh || '—'}{h.hangMuc ? ` · ${h.hangMuc}` : ''}</p>
                {h.xuong && <p className="text-[11px] text-slate-400">Xưởng {h.xuong}</p>}
              </button>

              {open && (
                <div className="mt-3 space-y-4 border-t border-slate-200 pt-3 text-xs text-slate-700">
                  {/* Các cột thông tin — giống bảng desktop */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
                    <Field label="Công trình" value={h.congTrinh} className="col-span-full" />
                    <Field label="Hạng mục" value={h.hangMuc} className="col-span-full" />
                    <Field label="Khu vực SX" value={h.xuong} />
                    <Field label="BOP" value={h.bop} />
                    <Field label="Tình trạng" value={h.tinhTrang} />
                    <Field label="Phân loại nhóm SP" value={h.phanLoai} />
                    <Field label="Trị giá đơn hàng tổng" value={money(h.triGia)} />
                    <Field label="Thành tiền tính phiếu" value={money(h.thanhTienPhieu)} />
                    <Field label="Thành tiền nhập kho" value={<span className="font-medium text-indigo-700">{money(h.thanhTienKho)}</span>} />
                    <p className="col-span-full text-[10px] text-slate-400">Đơn vị tiền: 1,000 VNĐ</p>
                  </div>

                  {d === 'loading' || !d ? (
                    <p className="text-slate-400">Đang tải chi tiết...</p>
                  ) : (
                    <>
                      {/* 5 ô ghi chú — hiển thị theo ngày + ảnh Drive như desktop */}
                      <div className="space-y-3">
                        {NOTE_LABELS.map(([key, label]) => (
                          <div key={key}>
                            <p className="mb-1 font-semibold text-slate-500">{label}</p>
                            {d.notes[key]
                              ? <NoteContent text={d.notes[key] as string} />
                              : <p className="text-slate-300">—</p>}
                          </div>
                        ))}
                      </div>

                      {/* Vướng mắc gom theo 5M */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-slate-500">Vướng mắc 5M ({d.items.length})</p>
                          <button
                            type="button"
                            onClick={() => setAddFor(h)}
                            className="shrink-0 rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm active:scale-95"
                          >
                            + Thêm vướng mắc
                          </button>
                        </div>
                        {FIVE_M_CATEGORIES.map(cat => {
                          const list = d.items.filter(v => v.category === cat);
                          return (
                            <div key={cat} className="rounded-lg border border-slate-200 p-2">
                              <p className={`text-[11px] font-semibold ${VM_TEXT[cat]}`}>
                                {FIVE_M_LABELS[cat]} ({list.length})
                              </p>
                              {list.length === 0 ? (
                                <p className="text-slate-300">—</p>
                              ) : (
                                <div className="mt-1 space-y-1.5">
                                  {list.map(v => (
                                    <div key={v.id} className={`rounded-lg border p-2 ${v.isResolved ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                                      <p className="text-[10px] text-slate-500">{v.isResolved ? 'Đã xử lý' : 'Đang tồn đọng'}</p>
                                      <p className="whitespace-pre-wrap break-words">{v.content}</p>
                                      <p className="mt-1 text-[10px] text-slate-500">
                                        {v.handler ? `Xử lý: ${v.handler} · ` : ''}{v.bot ? `BOT: ${v.bot} · ` : ''}{v.createdBy} · {fmtTime(v.createdAt)}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                </div>
              )}
            </article>
          );
        })}
      </main>

      {addFor && (
        <AddSheet
          hit={addFor}
          onClose={() => setAddFor(null)}
          onDone={() => { const hex = addFor.hex; setAddFor(null); flash('Đã gửi vướng mắc'); loadDetail(hex); }}
        />
      )}

      {toast && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+80px)] left-1/2 z-40 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-xs text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

// ---------------- Form thêm vướng mắc (giữ nguyên) ----------------
function AddSheet({ hit, onClose, onDone }: { hit: HexHit; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({
    category: 'man' as FiveMCategory, content: '', handler: '', botStart: '', botEnd: '', solution: '', note: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const upd = (patch: Partial<typeof f>) => setF(p => ({ ...p, ...patch }));

  const botInvalid = !!(f.botStart && f.botEnd && f.botEnd < f.botStart);
  const valid = !!(f.content.trim() && f.handler.trim() && f.botStart && f.botEnd && !botInvalid && f.solution.trim());

  const submit = async () => {
    if (!valid) return;
    setBusy(true); setErr('');
    try {
      await createVuongMacStrict(hit.hex, f.category, f.content.trim(), {
        handler: f.handler.trim(),
        bot: `${fmtLocalInput(f.botStart)} - ${fmtLocalInput(f.botEnd)}`,
        solution: f.solution.trim(),
        note: f.note.trim(),
      });
      onDone();
    } catch (e: any) {
      setErr(e.message === UNAUTHORIZED ? 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại' : (e.message || 'Có lỗi xảy ra'));
    } finally {
      setBusy(false);
    }
  };

  const chip = (on: boolean) =>
    `shrink-0 rounded-full border px-3 py-1 text-xs ${on ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-200'}`;

  return (
    <Sheet title={`Thêm vướng mắc · ${hit.hex}`} onClose={onClose}>
      <p className="mb-3 text-xs text-slate-500">{hit.congTrinh || '—'}{hit.hangMuc ? ` · ${hit.hangMuc}` : ''}</p>
      <div className="space-y-3">
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">Loại (5M)</p>
          <div className="flex flex-wrap gap-2">
            {FIVE_M_CATEGORIES.map(c => (
              <button key={c} type="button" onClick={() => upd({ category: c })} className={chip(f.category === c)}>
                {FIVE_M_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        <label className="block text-xs font-medium text-slate-600">
          Nội dung vướng mắc <span className="text-red-500">*</span>
          <textarea rows={3} maxLength={2000} value={f.content} onChange={e => upd({ content: e.target.value })}
            placeholder="Mô tả vướng mắc đang gặp" className={`${inputCls} mt-1`} />
        </label>

        <label className="block text-xs font-medium text-slate-600">
          Người xử lý <span className="text-red-500">*</span>
          <input value={f.handler} maxLength={200} onChange={e => upd({ handler: e.target.value })}
            placeholder="Ai sẽ xử lý?" className={`${inputCls} mt-1`} />
        </label>

        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-600">BOT <span className="text-red-500">*</span></p>
          <label className="block text-[11px] text-slate-500">
            Bắt đầu
            <input type="datetime-local" value={f.botStart} onChange={e => upd({ botStart: e.target.value })} className={`${inputCls} mt-1`} />
          </label>
          <label className="block text-[11px] text-slate-500">
            Kết thúc
            <input type="datetime-local" min={f.botStart || undefined} value={f.botEnd}
              onChange={e => upd({ botEnd: e.target.value })} className={`${inputCls} mt-1`} />
          </label>
          {botInvalid && <p className="text-[11px] text-red-600">Thời gian kết thúc phải sau thời gian bắt đầu.</p>}
        </div>

        <label className="block text-xs font-medium text-slate-600">
          Giải pháp <span className="text-red-500">*</span>
          <textarea rows={2} maxLength={2000} value={f.solution} onChange={e => upd({ solution: e.target.value })}
            placeholder="Giải pháp dự kiến" className={`${inputCls} mt-1`} />
        </label>

        <label className="block text-xs font-medium text-slate-600">
          Ghi chú
          <input value={f.note} maxLength={2000} onChange={e => upd({ note: e.target.value })}
            placeholder="Không bắt buộc" className={`${inputCls} mt-1`} />
        </label>
      </div>

      {err && <p className="mt-3 text-xs text-red-600">{err}</p>}
      <div className="sticky bottom-0 -mx-4 mt-3 bg-white px-4 pb-1 pt-2">
        <button disabled={!valid || busy} onClick={submit} className={btnPrimary}>
          {busy ? 'Đang gửi...' : 'Gửi vướng mắc'}
        </button>
      </div>
    </Sheet>
  );
}