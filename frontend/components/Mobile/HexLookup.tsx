import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  FIVE_M_CATEGORIES, FIVE_M_LABELS, UNAUTHORIZED, fetchVuongMacList,
  type FiveMCategory, type VuongMacItem,
} from '../../services/vuongMacService';
import { getToken } from '../../services/userService';
import {
  searchHex, fetchHexNotes, createVuongMacStrict, fmtLocalInput,
  type HexHit,
} from '../../services/vuongMacMobileApi';
import { NoteContent } from '../Dashboard/components/modals/HexDetailModal';
import { FORM_CATEGORIES } from './formCategories';
import { searchHexBulk } from './hexBulkApi';

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
// Kết quả tìm hàng loạt: số mã đã tìm, số mã tìm thấy, số mã bị bỏ qua do quá giới hạn
type BulkInfo = {
  total: number; found: number; skipped: number;
  duplicates: { code: string; count: number }[];   // mã bị nhập lặp trong chuỗi dán vào
  sameHex: { hex: string; codes: string[] }[];     // nhiều mã khác nhau cùng trỏ về 1 hex
  entered: number;                                  // tổng số mã đã dán (tính cả trùng)
};

const BULK_LIMIT = 200;

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

// Tách nhiều mã theo dấu phẩy, chấm phẩy hoặc khoảng trắng
const splitCodes = (s: string) =>
  Array.from(new Set(s.split(/[,;\s]+/).map(t => t.trim()).filter(Boolean)));

// Tìm các mã bị nhập lặp trong chuỗi dán vào (mã -> số lần xuất hiện, theo thứ tự xuất hiện đầu tiên)
const findDuplicates = (s: string) => {
  const count = new Map<string, number>();
  s.split(/[,;\s]+/).map(t => t.trim()).filter(Boolean)
    .forEach(t => count.set(t, (count.get(t) ?? 0) + 1));
  return Array.from(count.entries())
    .filter(([, n]) => n > 1)
    .map(([code, n]) => ({ code, count: n }));
};

// Tìm hàng loạt khi: có dấu phẩy, hoặc đa số các phần là dãy số >= 6 chữ số (và có ít nhất 2 dãy)
// (mã hex 9 số, mã nhà máy 12 số). Một mã gõ sai/thừa dấu cách (vd "25 0301646") không làm hỏng cả lượt tìm.
// Tên công trình có dấu cách vẫn tìm bình thường vì hầu hết các phần không phải số dài.
const isBulk = (s: string) => {
  const t = splitCodes(s);
  if (t.length < 2) return false;
  if (/[,;]/.test(s)) return true;
  const longNums = t.filter(x => /^\d{6,}$/.test(x)).length;
  return longNums >= 2 && longNums >= t.length / 2;
};

// Sắp kết quả theo đúng thứ tự mã người dùng nhập (khớp hex hoặc mã nhà máy).
// Ưu tiên khớp chính xác, sau đó khớp một phần; hex không khớp mã nào xếp cuối, giữ nguyên thứ tự gốc.
const orderByCodes = (hits: HexHit[], codes: string[]) => {
  const rank = (h: HexHit) => {
    const hex = String(h.hex ?? '');
    const nm = String(h.maNhaMay ?? '');
    let i = codes.findIndex(c => c === hex || c === nm);
    if (i < 0) i = codes.findIndex(c => c.length >= 6 && (hex.includes(c) || nm.includes(c)));
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return hits
    .map((h, idx) => ({ h, idx, r: rank(h) }))
    .sort((a, b) => a.r - b.r || a.idx - b.idx)
    .map(x => x.h);
};

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  // Render ra document.body để không bị thanh menu dưới (z-20) hay khung cuộn cha che mất
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] md:max-w-4xl md:rounded-2xl"
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

// Ô ghi chú: mặc định chỉ hiện phần đầu (khoảng 1 mục), dài hơn thì có nút "Xem thêm"
function NoteCell({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    const inner = box?.firstElementChild;
    if (!box || !inner) return;
    const check = () => { if (!expanded) setOverflow(box.scrollHeight > box.clientHeight + 4); };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(inner); // theo dõi nội dung bên trong (ảnh tải xong sẽ đổi chiều cao)
    return () => ro.disconnect();
  }, [text, expanded]);

  return (
    <div>
      <div ref={boxRef} className={`relative ${expanded ? '' : 'max-h-[13rem] overflow-hidden'}`}>
        <div><NoteContent text={text} /></div>
        {!expanded && overflow && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent" />
        )}
      </div>
      {overflow && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="mt-1 w-full rounded-lg bg-slate-100 py-1.5 text-[11px] font-medium text-slate-600 active:bg-slate-200"
        >
          {expanded ? 'Thu gọn ▴' : 'Xem thêm ▾'}
        </button>
      )}
    </div>
  );
}

function VmItemCard({ v }: { v: VuongMacItem }) {
  return (
    <div className={`rounded-lg border p-2 ${v.isResolved ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
      <p className="text-[10px] text-slate-500">{v.isResolved ? 'Đã xử lý' : 'Đang tồn đọng'}</p>
      <p className="whitespace-pre-wrap break-words">{v.content}</p>
      <p className="mt-1 text-[10px] text-slate-500">
        {v.handler ? `Xử lý: ${v.handler} · ` : ''}{v.bot ? `BOT: ${v.bot} · ` : ''}{v.createdBy} · {fmtTime(v.createdAt)}
      </p>
    </div>
  );
}

export default function HexLookup() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<HexHit[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [bulkInfo, setBulkInfo] = useState<BulkInfo | null>(null);
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
    const raw = q.trim();
    const bulk = isBulk(raw);

    if (!getToken()) { setError(UNAUTHORIZED); setLoading(false); return; }
    if (!bulk && raw.length < 2) {
      reqId.current++;
      setHits([]); setCounts({}); setMissing([]); setBulkInfo(null); setError(''); setLoading(false);
      return;
    }

    const id = ++reqId.current;
    const t = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        let r: HexHit[];
        let miss: string[] = [];
        let info: BulkInfo | null = null;
        if (bulk) {
          const all = splitCodes(raw);
          const used = all.slice(0, BULK_LIMIT);
          // Mã quá ngắn (vd "25" do gõ cách nhầm) không thể là hex/mã nhà máy: báo "không tìm thấy", không gửi lên API
          const valid = used.filter(c => c.length >= 4);
          const b = await searchHexBulk(valid, []);
          r = orderByCodes(b.hits, used);
          miss = [...used.filter(c => c.length < 4), ...b.missing]
            .sort((x, y) => used.indexOf(x) - used.indexOf(y));
                    const sameHex = r
            .map(h => ({
              hex: String(h.hex ?? ''),
              codes: used.filter(c => c === String(h.hex ?? '') || c === String(h.maNhaMay ?? '')),
            }))
            .filter(x => x.codes.length > 1);
          info = {
            total: used.length,
            found: Math.max(0, used.length - miss.length),
            skipped: all.length - used.length,
            duplicates: findDuplicates(raw),
            sameHex,
            entered: raw.split(/[,;\s]+/).map(t => t.trim()).filter(Boolean).length,
          };
        } else {
          r = await searchHex(raw, '');
        }
        if (id !== reqId.current) return;
        setHits(r); setMissing(miss); setBulkInfo(info);

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
  }, [q]);

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

  // Cửa sổ chi tiết: openHex = hex đang xem, idx = vị trí trong danh sách kết quả
  const modalBodyRef = useRef<HTMLDivElement>(null);
  const idx = openHex ? hits.findIndex(h => h.hex === openHex) : -1;

  const openDetail = (hex: string) => {
    setOpenHex(hex);
    if (!details[hex]) loadDetail(hex);
  };

  const go = (delta: number) => {
    const n = idx + delta;
    if (idx < 0 || n < 0 || n >= hits.length) return;
    openDetail(hits[n].hex);
  };

  // Phím tắt: ← trước, → sau, Esc đóng (bỏ qua khi đang gõ chữ hoặc đang mở form thêm vướng mắc)
  useEffect(() => {
    if (!openHex) return;
    const onKey = (e: KeyboardEvent) => {
      if (addFor) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'Escape') setOpenHex(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openHex, addFor, idx, hits]); // eslint-disable-line react-hooks/exhaustive-deps

  // Chuyển hex thì cuộn nội dung về đầu; tìm kiếm mới làm hex đang xem biến mất thì đóng cửa sổ
  useEffect(() => { modalBodyRef.current?.scrollTo({ top: 0 }); }, [openHex]);
  useEffect(() => { if (openHex && idx === -1) setOpenHex(null); }, [openHex, idx]);

  const goLogin = () => {
    sessionStorage.setItem('after_login', '/m?tab=lookup');
    window.location.href = '/';
  };

  const hint = !error && !loading && hits.length === 0
    ? (q.trim().length < 2
        ? 'Nhập mã hex, mã nhà máy, công trình hoặc hạng mục (từ 2 ký tự). Dán nhiều mã cách nhau bằng dấu phẩy hoặc dấu cách để tìm hàng loạt.'
        : 'Không tìm thấy hex nào phù hợp.')
    : '';

  // Badge tồn đọng / đã xử lý, dùng chung cho thẻ (mobile) và bảng (desktop)
  const badges = (hex: string) => {
    const c = counts[hex];
    if (!c || (!c.open && !c.done)) return null;
    return (
      <div className="flex shrink-0 flex-wrap gap-1 text-[10px] font-medium">
        {c.open > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-600">{c.open} tồn đọng</span>}
        {c.done > 0 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">{c.done} đã xử lý</span>}
      </div>
    );
  };

  // Phần chi tiết khi mở một hex (dùng chung 2 kiểu hiển thị)
  const renderDetail = (h: HexHit) => {
    const d = details[h.hex];
    return (
      <div className="space-y-4 pt-3 text-xs text-slate-700">
        {/* Các cột thông tin, xếp ngang */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
          <Field label="Công trình" value={h.congTrinh} className="col-span-full" />
          <Field label="Hạng mục" value={h.hangMuc} className="col-span-full" />
          <Field label="Mã nhà máy" value={h.maNhaMay} />
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
            {/* Ghi chú: mỗi ô chỉ hiện phần đầu, bấm "Xem thêm" để mở đủ; máy tính là bảng 5 cột */}
            <div className="space-y-3 md:hidden">
              {NOTE_LABELS.map(([key, label]) => (
                <div key={key} className="min-w-0">
                  <p className="mb-1 font-semibold text-slate-500">{label}</p>
                  {d.notes[key]
                    ? <NoteCell text={d.notes[key] as string} />
                    : <p className="text-slate-300">—</p>}
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
              <table className="w-full min-w-[1000px] table-fixed border-collapse text-left">
                <thead className="bg-slate-100 text-[11px] font-semibold text-slate-500">
                  <tr>
                    {NOTE_LABELS.map(([key, label]) => (
                      <th key={key} className="border-l border-slate-200 px-3 py-2 first:border-l-0">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {NOTE_LABELS.map(([key]) => (
                      <td key={key} className="min-w-0 border-l border-slate-200 p-2 align-top first:border-l-0">
                        {d.notes[key]
                          ? <NoteCell text={d.notes[key] as string} />
                          : <span className="text-slate-300">—</span>}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Vướng mắc 5M */}
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

              {/* Điện thoại: xếp dọc theo từng loại */}
              <div className="space-y-2 md:hidden">
                {FIVE_M_CATEGORIES.map(cat => {
                  const list = d.items.filter(v => v.category === cat);
                  return (
                    <div key={cat} className="min-w-0 rounded-lg border border-slate-200 p-2">
                      <p className={`text-[11px] font-semibold ${VM_TEXT[cat]}`}>{FIVE_M_LABELS[cat]} ({list.length})</p>
                      {list.length === 0 ? (
                        <p className="text-slate-300">—</p>
                      ) : (
                        <div className="mt-1 space-y-1.5">{list.map(v => <VmItemCard key={v.id} v={v} />)}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Máy tính: bảng 5 cột (mỗi loại 5M một cột) */}
              <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
                <table className="w-full min-w-[1000px] table-fixed border-collapse text-left">
                  <thead className="bg-slate-100 text-[11px] font-semibold">
                    <tr>
                      {FIVE_M_CATEGORIES.map(cat => (
                        <th key={cat} className={`border-l border-slate-200 px-3 py-2 first:border-l-0 ${VM_TEXT[cat]}`}>
                          {FIVE_M_LABELS[cat]} ({d.items.filter(v => v.category === cat).length})
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {FIVE_M_CATEGORIES.map(cat => {
                        const list = d.items.filter(v => v.category === cat);
                        return (
                          <td key={cat} className="min-w-0 border-l border-slate-200 p-2 align-top first:border-l-0">
                            {list.length === 0
                              ? <span className="text-slate-300">—</span>
                              : <div className="space-y-1.5">{list.map(v => <VmItemCard key={v.id} v={v} />)}</div>}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

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
          placeholder="Mã hex / mã nhà máy (nhiều mã cách nhau bằng , hoặc dấu cách), công trình..."
          className={inputCls}
          inputMode="search"
        />
      </header>

      <main className="mx-auto max-w-[1800px] space-y-3 p-4">
        {error === UNAUTHORIZED ? (
          <div className="space-y-2 rounded-lg bg-red-100 p-3 text-sm text-red-700">
            <p>Bạn chưa đăng nhập hoặc phiên đã hết hạn.</p>
            <button onClick={goLogin} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white">Đăng nhập</button>
          </div>
        ) : error ? (
          <p className="rounded-lg bg-red-100 p-3 text-sm text-red-700">{error}</p>
        ) : null}

        {/* Kết quả tìm hàng loạt: tìm thấy bao nhiêu mã, không tìm thấy bao nhiêu mã */}
        {bulkInfo && !loading && !error && (
          <div className="space-y-2">
            <p
              className={`rounded-lg p-3 text-sm ${
                bulkInfo.found === 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {bulkInfo.found === 0 ? '❌' : '✅'} Tìm thấy <b>{bulkInfo.found}</b>/{bulkInfo.total} mã
              {missing.length > 0 && <> · không tìm thấy <b>{missing.length}</b> mã</>}
            </p>

            {missing.length > 0 && (
              <div className="rounded-lg bg-amber-100 p-3 text-sm text-amber-800">
                <p className="font-medium">⚠️ {missing.length} mã không tìm thấy:</p>
                <p className="mt-1 max-h-32 overflow-y-auto break-words text-xs">{missing.join(', ')}</p>
              </div>
            )}

            {bulkInfo.skipped > 0 && (
              <p className="rounded-lg bg-slate-200 p-3 text-xs text-slate-700">
                ℹ️ Mỗi lần chỉ tìm tối đa {BULK_LIMIT} mã, đã bỏ qua {bulkInfo.skipped} mã cuối.
              </p>
            )}
                        {bulkInfo.duplicates.length > 0 && (
              <div className="rounded-lg bg-amber-100 p-3 text-sm text-amber-800">
                <p className="font-medium">
                  ⚠️ Có {bulkInfo.duplicates.length} mã bị nhập trùng, đã gộp thành 1 kết quả
                  (đã dán {bulkInfo.entered} mã, còn {bulkInfo.total} mã khác nhau):
                </p>
                <p className="mt-1 max-h-24 overflow-y-auto break-words text-xs">
                  {bulkInfo.duplicates.map(d => `${d.code} (×${d.count})`).join(', ')}
                </p>
              </div>
            )}

            {bulkInfo.sameHex.length > 0 && (
              <div className="rounded-lg bg-amber-100 p-3 text-sm text-amber-800">
                <p className="font-medium">
                  ⚠️ {bulkInfo.sameHex.length} hex được nhập bằng nhiều mã khác nhau (hex và mã nhà máy cùng một dòng):
                </p>
                <ul className="mt-1 max-h-24 overflow-y-auto space-y-0.5 text-xs">
                  {bulkInfo.sameHex.map(x => (
                    <li key={x.hex}>Hex {x.hex}: {x.codes.join(' = ')}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {hint && <p className="py-12 text-center text-sm text-slate-400">{hint}</p>}

        {/* ===== ĐIỆN THOẠI: thẻ xếp dọc ===== */}
             {/* ===== ĐIỆN THOẠI: thẻ xếp dọc, bấm để mở cửa sổ chi tiết ===== */}
        <div className="space-y-3 md:hidden">
          {hits.map((h, i) => (
            <article key={h.hex} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <button className="w-full text-left" onClick={() => openDetail(h.hex)}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    <span className="mr-2 text-xs font-medium tabular-nums text-slate-400">{i + 1}.</span>{h.hex}
                  </p>
                  {badges(h.hex)}
                </div>
                <p className="mt-0.5 text-xs text-slate-600">{h.congTrinh || '—'}{h.hangMuc ? ` · ${h.hangMuc}` : ''}</p>
                <div className="flex flex-wrap gap-x-3 text-[11px] text-slate-400">
                  {h.maNhaMay && <span>Mã NM {h.maNhaMay}</span>}
                  {h.xuong && <span>Xưởng {h.xuong}</span>}
                </div>
              </button>
            </article>
          ))}
        </div>

        {/* ===== MÁY TÍNH: bảng ngang, bấm dòng để mở cửa sổ chi tiết ===== */}
        {hits.length > 0 && (
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  {['STT', 'Hex', 'Mã nhà máy', 'Công trình', 'Hạng mục', 'Xưởng', 'Tình trạng', 'Vướng mắc'].map(t => (
                    <th key={t} className="whitespace-nowrap px-4 py-2.5">{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hits.map((h, i) => (
                  <tr
                    key={h.hex}
                    onClick={() => openDetail(h.hex)}
                    className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${openHex === h.hex ? 'bg-slate-100' : ''}`}
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-400">{i + 1}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-slate-900">{h.hex}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{h.maNhaMay || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-800">{h.congTrinh || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{h.hangMuc || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{h.xuong || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{h.tinhTrang || '—'}</td>
                    <td className="px-4 py-2.5">{badges(h.hex) ?? <span className="text-slate-300">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

    
      </main>

           {openHex && idx >= 0 && (() => {
        const h = hits[idx];
        const arrowCls =
          'absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full ' +
          'border border-slate-200 bg-white text-lg text-slate-700 shadow-lg transition ' +
          'hover:bg-slate-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white';

        return createPortal(
          <div
            className="fixed inset-0 z-[55] flex items-end justify-center bg-black/40 md:items-center md:px-20 md:py-6"
            onClick={() => setOpenHex(null)}
          >
            {/* Khung ngoài (relative) để đặt 2 nút tới/lui nằm ngoài hai mép cửa sổ */}
            <div
              className="relative w-full md:max-w-[1600px]"
              onClick={e => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => go(-1)}
                disabled={idx <= 0}
                title="Hex trước (←)"
                aria-label="Hex trước"
                className={`${arrowCls} left-2 md:-left-16`}
              >
                ◀
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                disabled={idx >= hits.length - 1}
                title="Hex sau (→)"
                aria-label="Hex sau"
                className={`${arrowCls} right-2 md:-right-16`}
              >
                ▶
              </button>

              {/* Cửa sổ */}
              <div className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl md:h-[90vh] md:max-h-none md:rounded-2xl">
                {/* Thanh tiêu đề: số thứ tự, hex, đóng */}
                <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-slate-900">
                      <span className="mr-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600">
                        {idx + 1}/{hits.length}
                      </span>
                      Hex {h.hex}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {h.congTrinh || '—'}{h.hangMuc ? ` · ${h.hangMuc}` : ''}
                    </p>
                  </div>

                  {badges(h.hex)}
                  <button
                    type="button"
                    onClick={() => setOpenHex(null)}
                    aria-label="Đóng"
                    title="Đóng (Esc)"
                    className="px-2 text-xl leading-none text-slate-400 hover:text-slate-700"
                  >
                    ✕
                  </button>
                </div>

                {/* Nội dung chi tiết */}
                <div ref={modalBodyRef} className="flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+16px)]">
                  {renderDetail(h)}
                </div>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {addFor && (
        <AddSheet
          hit={addFor}
          onClose={() => setAddFor(null)}
          onDone={() => { const hex = addFor.hex; setAddFor(null); flash('Đã gửi vướng mắc'); loadDetail(hex); }}
        />
      )}

      {toast && createPortal(
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+6rem)] left-1/2 z-[90] max-w-[90vw] -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-xs text-white shadow-lg">
          {toast}
        </div>,
        document.body
      )}
    </div>
  );
}

// ---------------- Form thêm vướng mắc ----------------
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
      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <p className="mb-1 text-xs font-medium text-slate-600">Loại</p>
          <div className="flex flex-wrap gap-2">
            {FORM_CATEGORIES.map(c => (
              <button key={c.value} type="button" title={c.hint} onClick={() => upd({ category: c.value })} className={chip(f.category === c.value)}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <label className="block text-xs font-medium text-slate-600 md:col-span-2">
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
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-[11px] text-slate-500">
              Bắt đầu
              <input type="datetime-local" value={f.botStart} onChange={e => upd({ botStart: e.target.value })} className={`${inputCls} mt-1`} />
            </label>
            <label className="block text-[11px] text-slate-500">
              Kết thúc
              <input type="datetime-local" min={f.botStart || undefined} value={f.botEnd}
                onChange={e => upd({ botEnd: e.target.value })} className={`${inputCls} mt-1`} />
            </label>
          </div>
          {botInvalid && <p className="text-[11px] text-red-600">Thời gian kết thúc phải sau thời gian bắt đầu.</p>}
        </div>

        <label className="block text-xs font-medium text-slate-600">
          Giải pháp <span className="text-red-500">*</span>
          <textarea rows={2} maxLength={2000} value={f.solution} onChange={e => upd({ solution: e.target.value })}
            placeholder="Giải pháp dự kiến" className={`${inputCls} mt-1`} />
        </label>

        <label className="block text-xs font-medium text-slate-600">
          Ghi chú
          <textarea rows={2} maxLength={2000} value={f.note} onChange={e => upd({ note: e.target.value })}
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