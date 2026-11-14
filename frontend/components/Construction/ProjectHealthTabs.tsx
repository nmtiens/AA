import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { ModalShell } from '../shared/ModalShell';
import { useBotHangMuc } from '../../services/botHangMuc';
import type { RemainBucket } from '../Dashboard/hooks/usePivotTables';
import type { VuongMacItem } from '../../services/vuongMacService';
import {
  materialLineState, isMaterialPending, materialDueDate, parsePlanDate, dwellBucket, DWELL_STUCK, DWELL_NONE, type DwellKey,
  type DeadlineSource, type MaterialLineState, type MaterialLineFields, stageRank,
} from '../../utils/productionMetrics';
import * as bang from '../shared/bangBaoCao';
import { fmtInt, fmtTy, fmtDate, fmtPt, fmtQty } from '../../utils/format';
import { parseNvlStatus, nvlLinePending, type NvlRaw } from '../../utils/nvlParse';
import { STEPS, qcStateOf, QC_STATE_META, QC_STATUS_VI, gcnPending, type HexExtra, type StepKey } from '../../services/productionExtraService';
import { tongHangMuc } from './core/tongChiTiet';
import { mauLuong, soSanhThuTu } from './core/thuTuNhom';
import { useThuTuLuongDo } from './useThuTuLuongDo';
import {
  BOP_GROUP, KHO_COT, khoCua, laKho as laKhoBop, tinhCayBop, mucCongDoan, fmtGiaTriBop, stageOfBop, tenCotCongDoan,
  type BopMetric, type Kho, type KhoCot,
} from './core/bopPivot';

// ============================================================================
// Tầng 2 của "Tổng quan công trình": 3 tab chi tiết BOT · BOP · BOM.
// Nhận dữ liệu đã chuẩn hoá từ ProjectHealthModal (cùng 1 định nghĩa "còn lại").
// ============================================================================

export interface HexInfo {
  hex: string;
  /** Tên công trình — chỉ gán ở view tất cả công trình (bảng hạng mục có thêm cột Công trình) */
  congTrinh?: string;
  hangMuc: string;
  stage: string | null;
  status: string;              // cột Tình trạng (tinh_trang)
  area: string;                // khu vực sản xuất (xuong_chinh)
  nhomSp?: string;             // nhóm phân loại sản phẩm (phan_loai_nhom_san_pham)
  ipo?: string;                // tình trạng IPO (tinh_trang_ipo) — ô lọc của bảng KHNK tab BOT
  dwell: string | null;        // thời gian ở công đoạn hiện tại (so_ngay_cd_hien_tai)
  bucket: RemainBucket | null; // nhóm của phần GIÁ TRỊ còn lại (null = không còn giá trị chưa nhập)
  /** Còn phải theo dõi (đếm / tính hạn): chưa nhập đủ giá trị và chưa nhập đủ số lượng, hoặc trị giá 0 */
  open: boolean;
  total: number;               // triệu đồng
  inv: number;                 // đã nhập kho (triệu, đã chặn không vượt trị giá)
  xuat?: number;               // đã xuất kho lũy kế (triệu)
  tonKho?: number;             // tồn kho hiện tại (triệu); undefined = dữ liệu không có cột
  remain: number;              // triệu đồng
  deadline: Date | null;       // hạn = KH nhập kho tuần → KH nhập kho tháng (utils/productionMetrics)
  deadlineSource: DeadlineSource | null;
  khnkTuan: Date | null;       // ngay_khnk_tuan (để hiển thị riêng)
  khnkThang: Date | null;      // ngay_khnk_thang (để hiển thị riêng)
  canGiao: Date | null;        // ngay_can_giao (chỉ tham khảo, không tính hạn)
  /** KH tuần / tháng của kỳ đã nhập đủ SL kế hoạch (không tính trễ theo KH đó) */
  khnkTuanMet?: boolean;
  khnkThangMet?: boolean;
  /** KH nhập kho đang dùng muộn hơn ngày cần giao — biết trước sẽ giao trễ */
  planAfterDue?: boolean;
  overdue: boolean;
  dueSoon: boolean;
  /** Ngày cần (PM) / BOT dự án — chỉ tham khảo, không tính hạn */
  canPm?: Date | null;
  botDuAn?: Date | null;
  /** Ngày nhận đơn từ PM (tuổi đơn) */
  receivedPm?: Date | null;
  /** Tình trạng triển khai bản vẽ / phiếu (null = dữ liệu chưa có cột) */
  bvDone?: boolean | null;
  phieuDone?: boolean | null;
}

export interface MaterialLine extends MaterialLineFields {
  hexes: string[];
}

// Tỷ đồng: luôn 2 chữ số thập phân — thống nhất với Báo cáo tiến độ
const { tdB, thB, trong0 } = bang;

export const Chip = ({ active, onClick, children, tone = 'slate' }: {
  active: boolean; onClick: () => void; children: React.ReactNode; tone?: 'slate' | 'red' | 'amber' | 'emerald';
}) => {
  const on = { slate: 'bg-slate-800 text-white', red: 'bg-red-600 text-white', amber: 'bg-amber-500 text-white', emerald: 'bg-emerald-600 text-white' }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${active ? on : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
    >
      {children}
    </button>
  );
};

const SearchBox = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
  <div className="relative w-full max-w-xs">
    <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs focus:border-slate-400 focus:outline-none"
    />
  </div>
);

// Mốc thời gian để sắp: không có ngày xếp cuối
const timeOf = (d: Date | null | undefined) => d?.getTime() ?? Number.POSITIVE_INFINITY;

const SortPicker = <K extends string>({ value, onChange, options }: {
  value: K; onChange: (k: K) => void; options: [K, string][];
}) => (
  <div className="flex items-center gap-1 text-[0.6875rem] text-slate-500">
    Sắp:
    {options.map(([k, label]) => (
      <button
        key={k}
        type="button"
        onClick={() => onChange(k)}
        className={`rounded-md px-2 py-0.5 font-medium ${value === k ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
      >
        {label}
      </button>
    ))}
  </div>
);

const matchQ = (i: HexInfo, q: string) =>
  !q || i.hex.includes(q) || i.hangMuc.toLowerCase().includes(q) || (i.stage ?? '').toLowerCase().includes(q);

// ============================================================================
// BOP — công đoạn
// ============================================================================

// BOP — giống khối "Tình trạng sản xuất" (Công đoạn × Khu vực SX, mở rộng theo Tình trạng) và
// "Báo cáo tỷ trọng điểm nghẽn" (thời gian ở công đoạn hiện tại) của trang Tổng quan, nhưng chỉ cho
// các hạng mục CÒN SẢN XUẤT (chưa nhập kho đủ) của công trình.
const BOP_METRICS: { key: BopMetric; label: string; hint: string }[] = [
  { key: 'count', label: 'Số hạng mục', hint: 'Số hạng mục chưa nhập kho đủ' },
  { key: 'remain', label: 'Còn lại (tỷ)', hint: 'Giá trị CHƯA nhập kho (trị giá − đã nhập) — khớp thẻ BOP' },
  { key: 'total', label: 'Trị giá (tỷ)', hint: 'Trị giá đơn hàng ĐẦY ĐỦ của hạng mục, kể cả phần đã nhập kho (vd P021 thường đã nhập phần lớn)' },
];
// Nhóm công đoạn (BOP_GROUP), Kho, khoCua / laKho, pivot: core/bopPivot.ts (dùng chung với bảng công trình trang Tổng quan)

// Thời gian ở công đoạn hiện tại — cùng nhóm với biểu đồ điểm nghẽn (utils/productionMetrics.dwellBucket)
// Màu theo thứ tự thời gian (càng lâu càng đỏ): xanh đậm → xanh nhạt → vàng → cam → đỏ; trước xen xanh dương và
// vàng / cam gần trùng màu nên khó đọc. `chu`: màu số trong thanh (chữ tối trên nền nhạt).
export const DWELL: { key: DwellKey; label: string; bar: string; chu: string }[] = [
  { key: '<3 NGÀY', label: '< 3 ngày', bar: 'bg-emerald-600', chu: 'text-white' },
  { key: '4-7 NGÀY', label: '4–7 ngày', bar: 'bg-emerald-300', chu: 'text-emerald-950' },
  { key: '2 tuần', label: '2 tuần', bar: 'bg-amber-300', chu: 'text-amber-950' },
  { key: '3 tuần', label: '3 tuần', bar: 'bg-orange-500', chu: 'text-white' },
  { key: DWELL_STUCK, label: '≥ 4 tuần', bar: 'bg-red-600', chu: 'text-white' },
  { key: DWELL_NONE, label: 'Chưa có số ngày', bar: 'bg-slate-200', chu: 'text-slate-700' },
];
const dwellOf = (v: string | null): DwellKey => dwellBucket(v);

const NO_NSP = '(Chưa có nhóm)';
const NO_XUONG = '(Chưa có xưởng)';
const xuongOf = (i: HexInfo) => i.area || NO_XUONG;
const sapXuong = (a: string, b: string) => (a === NO_XUONG ? 1 : b === NO_XUONG ? -1 : a.localeCompare(b, 'vi', { numeric: true }));
export const NutMoTatCa = ({ onMo, onThu }: { onMo: () => void; onThu: () => void }) => (
  <span className="ml-1.5 inline-flex gap-1 align-middle">
    <button type="button" title="Mở xưởng của mọi nhóm" onClick={onMo} className="rounded border border-slate-300 px-1 leading-4 hover:bg-white">+</button>
    <button type="button" title="Thu gọn tất cả" onClick={onThu} className="rounded border border-slate-300 px-1 leading-4 hover:bg-white">−</button>
  </span>
);
// Ô đang chọn ở bảng Nhóm sản phẩm × Công đoạn (thiếu khoá = mọi giá trị)
type BopSel = { stages?: string[]; ct?: string; nsp?: string; xuong?: string; kho?: KhoCot; donHang?: boolean } | null;
// Bảng BOP: dòng gốc theo 1 chiều, mở ra các chiều còn lại
type ChieuBop = 'ct' | 'nsp' | 'xuong';
const TEN_CHIEU: Record<ChieuBop, string> = { ct: 'Công trình', nsp: 'Sản phẩm', xuong: 'Xưởng' };
const BAC_BOP: Record<ChieuBop, ChieuBop[]> = { ct: ['ct', 'nsp', 'xuong'], nsp: ['nsp', 'ct', 'xuong'], xuong: ['xuong', 'ct', 'nsp'] };
const NO_CT = '(Chưa có công trình)';
// Lọc từ biểu đồ thời gian ở công đoạn (cộng thêm vào lọc của bảng)
type DwellSel = { stage: string; dwell: string } | null;

// Lọc thêm từ 3 khối sản lượng công đoạn / QC / gia công ngoài
type ExtraSel = { kind: 'step'; key: StepKey } | { kind: 'qc'; st: 'bad' | 'wait' | 'ok' | 'none' } | { kind: 'gcn'; st: string | 'pending' } | null;
const GCN_DONE = (st: string | null) => !gcnPending(st);

export const BopTab = ({ items, khoItems = items, onHexClick, extra, tatCa = false }: {
  items: HexInfo[]; onHexClick?: (hex: string) => void;
  /** View tất cả công trình: không tải số theo HEX (công đoạn SX / QC / GCN) => ẩn 3 ô đó và 3 cột tương ứng */
  tatCa?: boolean;
  /** Hạng mục tính phần Kho (lũy kế): mọi hạng mục không hủy của công trình, không theo bộ lọc IPO */
  khoItems?: HexInfo[];
  /** Thông tin thêm theo HEX (số lượng theo công đoạn SX, QC, gia công ngoài); null = đang tải */
  extra?: Record<string, HexExtra> | null;
  today?: number;
}) => {
  const [metric, setMetric] = useState<BopMetric>('remain');
  const botHm = useBotHangMuc();
  const [cheDo, setCheDo] = useState<ChieuBop>(tatCa ? 'ct' : 'nsp');
  const [moDong, setMoDong] = useState<Set<string>>(new Set());
  // Dòng gốc đang mở xem theo chiều nào; chưa chọn thì chưa hiện dòng con
  const [chonCon, setChonCon] = useState<Record<string, ChieuBop>>({});
  const [moNhom, setMoNhom] = useState<Set<number>>(new Set());
  const [moPhu, setMoPhu] = useState(false);
  const khungBang = useRef<HTMLDivElement>(null);
  const [rongBang, setRongBang] = useState(0);
  useEffect(() => {
    const el = khungBang.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setRongBang(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [sel, setSel] = useState<BopSel>(null);
  const [dwellSel, setDwellSel] = useState<DwellSel>(null);
  const [extraSel, setExtraSel] = useState<ExtraSel>(null);
  const [q, setQ] = useState('');
  const [sortBy, setSortBy] = useState<'deadline' | 'stage' | 'remain'>('deadline');

  const open = useMemo(() => items.filter(i => i.open), [items]);
  const ex = (i: HexInfo) => extra?.[i.hex];

  // Sản lượng theo công đoạn sản xuất: hạng mục đang trên chuyền (P012 → P021, cùng nhóm "Đang trên chuyền" của BOP) chưa nhập kho đủ.
  // Mỗi bước chỉ tính hạng mục áp dụng bước đó (có cờ Vecni / Sofa / Kim loại / Kính đá, hoặc đã có số giao).
  const steps = useMemo(() => {
    if (!extra) return null;
    const onLine = open.filter(i => i.bucket === 'onLine');
    const rows = STEPS.map(s => {
      let items = 0, done = 0, qtyDone = 0, qtyOrder = 0;
      for (const i of onLine) {
        const e = ex(i);
        if (!e) continue;
        const applies = !s.flag || e.flags[s.flag] || e.steps[s.key] > 0;
        if (!applies) continue;
        // Hạng mục chưa có SL tính phiếu không tính vào % (trước cộng SL đã giao vào tử số nhưng mẫu số 0 => % bị thổi)
        if (!(e.qtyTicket > 0)) continue;
        const order = e.qtyTicket;
        items++;
        qtyOrder += order;
        qtyDone += Math.min(e.steps[s.key], order || e.steps[s.key]);
        if (order > 0 && e.steps[s.key] >= order) done++;
      }
      return { ...s, items, done, qtyDone, qtyOrder, pct: qtyOrder > 0 ? Math.min(100, (qtyDone / qtyOrder) * 100) : 0 };
    }).filter(r => r.items > 0);
    return { onLine: onLine.length, rows };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, extra]);

  // QC: hạng mục chưa nhập kho đủ có lần kiểm, theo trạng thái lần kiểm gần nhất
  const qc = useMemo(() => {
    if (!extra) return null;
    const c = { none: 0, ok: 0, bad: 0, wait: 0, checks: 0, fail: 0 };
    for (const i of open) {
      const e = ex(i);
      const st = qcStateOf(e?.qc);
      c[st]++;
      if (e?.qc) { c.checks += e.qc.n; c.fail += e.qc.fail; }
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, extra]);

  // Gia công ngoài: hạng mục chưa nhập kho đủ có cờ gia công ngoài, theo tình trạng GCN
  const gcn = useMemo(() => {
    if (!extra) return null;
    const by = new Map<string, number>();
    let total = 0, pending = 0;
    for (const i of open) {
      const g = ex(i)?.gcn;
      if (!g) continue;
      total++;
      const st = g.st ?? '(Chưa ghi tình trạng)';
      by.set(st, (by.get(st) ?? 0) + 1);
      if (!GCN_DONE(g.st)) pending++;
    }
    return { total, pending, by: [...by.entries()].sort((a, b) => a[0].localeCompare(b[0], 'vi')) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, extra]);

  const matchExtra = (i: HexInfo): boolean => {
    if (!extraSel) return true;
    const e = ex(i);
    if (extraSel.kind === 'step') {
      if (!e || i.bucket !== 'onLine') return false;
      const s = STEPS.find(x => x.key === extraSel.key)!;
      const applies = !s.flag || e.flags[s.flag] || e.steps[s.key] > 0;
      return applies && !(e.qtyTicket > 0 && e.steps[s.key] >= e.qtyTicket);
    }
    if (extraSel.kind === 'qc') return qcStateOf(e?.qc) === extraSel.st;
    if (!e?.gcn) return false;
    return extraSel.st === 'pending' ? !GCN_DONE(e.gcn.st) : (e.gcn.st ?? '(Chưa ghi tình trạng)') === extraSel.st;
  };
  // Bảng Nhóm sản phẩm × Công đoạn: đếm = hạng mục còn theo dõi; giá trị = mọi hạng mục còn giá trị chưa nhập (kể cả
  // đã nhập đủ SL mà lệch tiền) — để tổng tiền khớp thẻ BOP
  const pivotItems = useMemo(() => mucCongDoan(items, metric), [items, metric]);
  // Dưới 5 triệu làm tròn ra "0.00" tỷ dễ hiểu nhầm là 0 => ghi "<0.01"
  const fmtV = (v: number) => fmtGiaTriBop(v, metric);
  const nspOf = (i: HexInfo) => i.nhomSp || NO_NSP;
  const stageOf = stageOfBop;

  // Hạng mục làm nên số ở cột Kho (core/bopPivot.laKho)
  const laKho = (i: HexInfo, f: KhoCot) => laKhoBop(i, f, metric);

  const ctOf = (i: HexInfo) => i.congTrinh || NO_CT;
  // BOT dự án của công trình (tất cả công trình): ngày xuất hiện nhiều nhất trong các hạng mục không HỦY — như bảng
  // Danh sách công trình ở Tổng quan
  const botCuaCt = useMemo(() => {
    if (!tatCa) return new Map<string, Date>();
    const dem = new Map<string, Map<number, number>>();
    for (const i of items) {
      if (!i.botDuAn || i.status === 'HỦY') continue;
      const ct = ctOf(i), t = i.botDuAn.getTime();
      const m = dem.get(ct) ?? new Map<number, number>();
      m.set(t, (m.get(t) ?? 0) + 1);
      dem.set(ct, m);
    }
    const ra = new Map<string, Date>();
    dem.forEach((m, ct) => { let best = 0, n = -1; m.forEach((c, t) => { if (c > n) { best = t; n = c; } }); ra.set(ct, new Date(best)); });
    return ra;
  }, [items, tatCa]); // eslint-disable-line react-hooks/exhaustive-deps
  const homNayMs = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);
  // Công trình trong danh sách Luồng đỏ lên đầu theo STT, dòng gốc tô đỏ / vàng
  const thuTuNhom = useThuTuLuongDo();
  // 1 công trình (cửa sổ công trình) thì không có bậc công trình
  const bac = useMemo(() => BAC_BOP[cheDo].filter(c => tatCa || c !== 'ct'), [cheDo, tatCa]);
  const nutCheDo: ChieuBop[] = tatCa ? ['ct', 'nsp', 'xuong'] : ['nsp', 'xuong'];
  const tinhCay = (b: ChieuBop[]) => {
    const giaTri: Record<ChieuBop, (i: HexInfo) => string> = { ct: ctOf, nsp: nspOf, xuong: xuongOf };
    return tinhCayBop(items, khoItems, metric, i => b.map(c => giaTri[c](i)), (x, y, bacSo) => {
      const c = b[bacSo];
      if (c === 'nsp') return x.ten === NO_NSP ? 1 : y.ten === NO_NSP ? -1 : x.ten.localeCompare(y.ten, 'vi', { numeric: true });
      if (c === 'xuong') return sapXuong(x.ten, y.ten);
      return Number(x.ten === NO_CT) - Number(y.ten === NO_CT) || soSanhThuTu(thuTuNhom(x.ten), thuTuNhom(y.ten))
        || y.total - x.total || y.kho.nk - x.kho.nk || x.ten.localeCompare(y.ten, 'vi');
    });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pivot = useMemo(() => tinhCay(bac), [items, khoItems, metric, bac, thuTuNhom]);
  // Cây đảo 2 bậc dưới: chỉ tính khi có dòng đang chọn chiều đó
  const bacDao = useMemo<ChieuBop[]>(() => [bac[0], bac[2], bac[1]], [bac]);
  const canCayDao = tatCa && Object.values(chonCon).includes(bacDao[1]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cayDao = useMemo(() => (canCayDao ? new Map(tinhCay(bacDao).goc.map(n => [n.ten, n])) : null), [canCayDao, items, khoItems, metric, bacDao, thuTuNhom]);
  // Mặc định mỗi nhóm công đoạn là 1 cột; bấm tên nhóm mới tách ra từng P
  const cot = pivot.groups.flatMap((g, gi) => (moNhom.has(gi) ? g.stages.map(st => ({ key: st, stages: [st] })) : [{ key: `g${gi}`, stages: g.stages }]));
  const congCot = (o: Record<string, number>, stages: string[]) => stages.reduce((a, st) => a + (o[st] ?? 0), 0);
  const tenNhom = (b: RemainBucket | null) => (b ? BOP_GROUP[b].label : 'Khác');
  const dayP = (st: string[]) => (st.length === 1 ? tenCotCongDoan(st[0]) : `${tenCotCongDoan(st[0])}→${tenCotCongDoan(st[st.length - 1])}`);
  const doiNhom = (gi: number) => setMoNhom(m => { const n = new Set(m); if (n.has(gi)) n.delete(gi); else n.add(gi); return n; });
  const khoaNut = (d: string[], b: ChieuBop[]) => (d.length > 1 ? [b[1], ...d] : d).join('\u0000');
  const doiDong = (k: string) => setMoDong(m => { const n = new Set(m); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const doiCheDo = (c: ChieuBop) => { setCheDo(c); setMoDong(new Set()); setChonCon({}); setSel(null); };
  const doiChon = (ten: string, c: ChieuBop) => setChonCon(m => {
    const n = { ...m };
    if (n[ten] === c) delete n[ten]; else n[ten] = c;
    return n;
  });
  const coSoDong = (n: { duong: string[] }, b: ChieuBop[]) => Object.fromEntries(n.duong.map((v, idx) => [b[idx], v])) as Pick<NonNullable<BopSel>, ChieuBop>;
  // Bấm ô kho => lọc danh sách đúng các hạng mục làm nên số đó
  // Chênh, Xuất vượt nhập ẩn mặc định; bấm + ở cột Tồn kho để hiện
  const [moKho, setMoKho] = useState(false);
  const khoHien = moKho ? KHO_COT : KHO_COT.filter(f => f !== 'chenh' && f !== 'xv');
  const khoCells = (k: Kho, base: NonNullable<BopSel>) => khoHien.map((f, idx) => (
    <React.Fragment key={f}>
      {cell(k[f], { ...base, kho: f }, `${idx === 0 ? 'border-l-2 border-l-slate-300' : ''} ${f === 'ton' ? 'font-bold' : f === 'chenh' || f === 'xv' ? 'font-semibold text-orange-700' : ''}`)}
    </React.Fragment>
  ));

  // Ô đang chọn ở bảng Nhóm sản phẩm × Công đoạn
  const matchSel = (i: HexInfo) => !sel || (
    (sel.stages === undefined || sel.stages.includes(stageOf(i)))
    && (sel.ct === undefined || ctOf(i) === sel.ct)
    && (sel.nsp === undefined || nspOf(i) === sel.nsp)
    && (sel.xuong === undefined || xuongOf(i) === sel.xuong)
    && (sel.kho === undefined || laKho(i, sel.kho))
  );

  // Điểm nghẽn: số hạng mục theo thời gian ở công đoạn hiện tại — ăn theo ô đang chọn ở bảng trên
  const dwell = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const i of open) {
      if (!matchSel(i)) continue;
      const d = dwellOf(i.dwell);
      const s = stageOf(i);
      const e: Record<string, number> = m.get(s) ?? {};
      e[d] = (e[d] ?? 0) + 1;
      m.set(s, e);
    }
    const rows = [...m.entries()]
      .map(([stage, c]) => ({ stage, c, n: DWELL.reduce((s, d) => s + (c[d.key] ?? 0), 0) }))
      .sort((x, y) => stageRank(x.stage) - stageRank(y.stage) || x.stage.localeCompare(y.stage));
    const w4 = (r: { c: Record<string, number> }) => r.c[DWELL_STUCK] ?? 0;
    // P001 (chờ triển khai bản vẽ) tách khỏi top nghẽn SẢN XUẤT: nó thường chiếm gần hết số tồn ≥ 4 tuần
    // và che mất nghẽn thật trong xưởng
    const stuck = rows.filter(r => r.stage !== 'P001' && w4(r) > 0).sort((x, y) => w4(y) - w4(x));
    const p001 = open.filter(i => matchSel(i) && stageOf(i) === 'P001' && dwellOf(i.dwell) === DWELL_STUCK);
    return {
      rows, stuck, stuckTotal: stuck.reduce((s, r) => s + w4(r), 0),
      p001Stuck: p001.length,
      p001Overdue: p001.filter(i => i.overdue).length,
      p001NoDeadline: p001.filter(i => !i.deadline).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sel]);

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    // Cùng tập hạng mục với số vừa bấm: ô bảng BOP theo bảng đó; biểu đồ thời gian và thẻ QC / gia công ngoài / bước SX
    // đếm trên hạng mục còn theo dõi
    return (dwellSel || extraSel ? open : sel?.kho || sel?.donHang ? khoItems : pivotItems)
      .filter(matchSel)
      .filter(i => !dwellSel || (stageOf(i) === dwellSel.stage && dwellOf(i.dwell) === dwellSel.dwell))
      .filter(matchExtra)
      .filter(i => matchQ(i, ql))
      .sort((a, b) =>
        sortBy === 'deadline'
          // Hạn gần nhất lên trước (KH nhập kho tuần → tháng); cùng hạn thì theo công đoạn
          ? timeOf(a.deadline) - timeOf(b.deadline) || stageRank(stageOf(a)) - stageRank(stageOf(b)) || b.remain - a.remain
          : sortBy === 'stage'
            ? stageRank(stageOf(a)) - stageRank(stageOf(b)) || timeOf(a.deadline) - timeOf(b.deadline)
            : b.remain - a.remain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pivotItems, khoItems, open, sel, dwellSel, extraSel, q, sortBy, extra, metric]);

  // Đổi ô ở bảng => bỏ lọc thời gian cũ (biểu đồ thời gian vẽ lại theo ô mới)
  // Có danh sách mới thì cuộn xuống, khỏi phải tự tìm
  const dongDs = () => { setSel(null); setDwellSel(null); setExtraSel(null); };
  const pick = (next: NonNullable<BopSel>) => {
    setSel(cur => (cur && JSON.stringify(cur) === JSON.stringify(next) ? null : next));
    setDwellSel(null);
  };
  const isSel = (next: NonNullable<BopSel>) => !!sel && JSON.stringify(sel) === JSON.stringify(next);
  const pickDwell = (next: NonNullable<DwellSel>) =>
    setDwellSel(cur => (cur && cur.stage === next.stage && cur.dwell === next.dwell ? null : next));
  const isDwellSel = (next: NonNullable<DwellSel>) => !!dwellSel && dwellSel.stage === next.stage && dwellSel.dwell === next.dwell;
  const hasFilter = !!sel || !!dwellSel || !!extraSel;
  const extraText = !extraSel ? ''
    : extraSel.kind === 'step' ? `Chưa xong bước ${STEPS.find(x => x.key === extraSel.key)?.label}`
      : extraSel.kind === 'qc' ? `QC: ${QC_STATE_META[extraSel.st].label}`
        : extraSel.st === 'pending' ? 'GCN còn chờ NCC' : `GCN: ${extraSel.st}`;
  const selText = [
    ...(sel ? [sel.ct, sel.nsp, sel.xuong, sel.stages && dayP(sel.stages), sel.donHang && 'Tổng đơn hàng', sel.kho && ({ nk: 'Đã nhập kho', xk: 'Đã xuất kho', ton: 'Tồn kho', chenh: 'Chênh kho', xv: 'Xuất vượt nhập' })[sel.kho]] : []),
    ...(dwellSel ? [...(sel?.stages ? [] : [dwellSel.stage]), DWELL.find(d => d.key === dwellSel.dwell)?.label] : []),
    extraText,
  ].filter(Boolean).join(' · ');
  const toggleExtra = (next: NonNullable<ExtraSel>) =>
    setExtraSel(cur => (cur && JSON.stringify(cur) === JSON.stringify(next) ? null : next));
  const isExtra = (next: NonNullable<ExtraSel>) => !!extraSel && JSON.stringify(extraSel) === JSON.stringify(next);

  const cell = (v: number | undefined, next: NonNullable<BopSel>, cls = '') => (
    <td
      onClick={v ? () => pick(next) : undefined}
      className={`${tdB} whitespace-nowrap text-center tabular-nums ${v ? 'cursor-pointer hover:bg-amber-50' : ''} ${isSel(next) ? 'bg-amber-100 font-semibold' : ''} ${cls}`}
    >
      {v ? <span className="underline decoration-slate-300 decoration-dotted underline-offset-2">{fmtV(v)}</span> : ''}
    </td>
  );
  // Cột tên vừa khít tên dài nhất của danh sách, chỉ cắt khi không đủ chỗ cho các cột số
  const rongSo = rongBang >= 1300 ? 96 : undefined;
  const rongTen = Math.max(256, rongBang - cot.reduce((a, c) => a + (c.key.startsWith('g') ? 140 : 80), 0) - 6 * (rongSo ?? 83) - 12);
  const tieuDeCot = metric === 'count' ? 'Tổng hạng mục còn lại' : metric === 'remain' ? 'Tổng giá trị đơn hàng còn lại' : 'Trị giá theo công đoạn';
  // Dòng của 1 nút và các dòng con đang mở. Tất cả công trình: mở dòng gốc ra 2 nút chọn chiều, bấm nút mới hiện dòng con
  let soDong = 0;
  const dongCay = (n: (typeof pivot.goc)[number], b: ChieuBop[]): React.ReactNode => {
    soDong += 1;
    const base = coSoDong(n, b), sau = n.duong.length - 1, khoa = khoaNut(n.duong, b), mo = moDong.has(khoa);
    const tt = sau === 0 && b[0] === 'ct' ? thuTuNhom(n.ten) : null, mau = mauLuong(tt);
    const nen = mau ? mau.nen : sau === 0 ? 'bg-white' : sau === 1 ? 'bg-slate-50' : 'bg-slate-100';
    const sttTag = mau && <span className={`mr-1.5 inline-block min-w-[1.5rem] rounded px-1 text-center text-sm tabular-nums ${mau.stt}`}>{tt!.stt}</span>;
    const coChon = tatCa && sau === 0;
    const chon = coChon ? chonCon[n.ten] : undefined;
    const bacCon = chon === bacDao[1] ? bacDao : b;
    const con = !coChon ? n.con : !chon ? [] : chon === bacDao[1] ? cayDao?.get(n.ten)?.con ?? [] : n.con;
    if (mo && coChon) soDong += 1;
    return (
      <React.Fragment key={khoa}>
        <tr className={`${nen} text-slate-900`}>
          <td className={`${tdB} sticky left-0 z-[1] truncate text-[0.9375rem] ${nen} ${sau ? 'font-medium' : 'font-bold'}`} style={{ maxWidth: rongTen, paddingLeft: `${0.5 + sau * 1.25}rem` }} title={`${TEN_CHIEU[b[sau]]}: ${n.ten}${mau ? ` · ${mau.nhan} STT ${tt!.stt}` : ''}`}>
            {n.con.length > 0
              ? <button type="button" onClick={() => doiDong(khoa)} className="text-left hover:underline">
                  <span className="inline-block w-4 text-slate-400">{mo ? '▾' : '▸'}</span>{sttTag}{n.ten}
                </button>
              : <span className="pl-4">{sttTag}{n.ten}</span>}
          </td>
          {cell(n.donHang, { ...base, donHang: true }, 'font-bold')}
          {tatCa && (() => {
            const bot = b[sau] === 'ct' ? botCuaCt.get(n.ten) : undefined;
            const qua = !!bot && bot.getTime() < homNayMs && n.total > 0;
            return (
              <td className={`${tdB} whitespace-nowrap text-center tabular-nums ${qua ? 'font-bold text-red-600' : ''}`}
                title={bot ? `BOT dự án ${fmtDate(bot)}${qua ? ' — đã qua, còn hạng mục chưa xong' : ''}` : undefined}>
                {bot ? fmtDate(bot) : ''}
              </td>
            );
          })()}
          {cot.map(c => <React.Fragment key={c.key}>{cell(congCot(n.cells, c.stages), { ...base, stages: c.stages })}</React.Fragment>)}
          {cell(n.total, base, 'font-bold text-slate-900')}
          {khoCells(n.kho, base)}
        </tr>
        {mo && coChon && (
          <tr className="bg-slate-50">
            <td colSpan={cot.length + 8 + (tatCa ? 1 : 0)} className={tdB}>
              <span className="sticky left-2 inline-flex gap-1 pl-5">
                {[bac[1], bac[2]].map(c => (
                  <Chip key={c} active={chon === c} onClick={() => doiChon(n.ten, c)}>Theo {TEN_CHIEU[c].toLowerCase()}</Chip>
                ))}
              </span>
            </td>
          </tr>
        )}
        {mo && con.map(c => dongCay(c, bacCon))}
      </React.Fragment>
    );
  };

  const dongBang = pivot.goc.map(n => dongCay(n, bac));
  // Ít dòng: bảng giãn cao ra (mỗi dòng tối đa 52px), chữ to hơn; cột Kho không bị ép khi màn đủ rộng
  const it = soDong <= 15 && !!rongSo;

  return (
    <div className="space-y-4">
      {/* 1. Bảng công đoạn × kho: dòng theo công trình / sản phẩm / xưởng */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {nutCheDo.map(c => (
              <Chip key={c} active={cheDo === c} onClick={() => doiCheDo(c)}>Theo {TEN_CHIEU[c].toLowerCase()}</Chip>
            ))}
          </div>
          <div className="ml-auto flex gap-1">
            {BOP_METRICS.map(m => (
              <span key={m.key} title={m.hint}>
                <Chip active={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</Chip>
              </span>
            ))}
          </div>
        </div>
        <div ref={khungBang} style={{ height: `min(70vh, ${soDong * 52 + 160}px)` }} className="overflow-auto border-l border-t border-slate-300 custom-scrollbar">
          <table className={`h-full w-full border-separate border-spacing-0 font-medium ${it ? 'text-base' : 'text-[0.9375rem]'}`}>
            <thead className="sticky top-0 z-20 bg-emerald-300 text-slate-900">
              <tr>
                <th rowSpan={3} className={`${thB} sticky left-0 z-20 w-px min-w-[13rem] whitespace-nowrap bg-emerald-300 text-center`}>
                  {TEN_CHIEU[cheDo]}
                  <NutMoTatCa onMo={() => setMoDong(new Set(pivot.goc.map(n => khoaNut(n.duong, bac))))} onThu={() => setMoDong(new Set())} />
                </th>
                <th rowSpan={3} className={`${thB} whitespace-nowrap text-center`} title="Kể cả hạng mục đã nhập kho đủ">
                  {metric === 'count' ? <>Tổng<br />hạng mục</> : <>Tổng giá trị<br />đơn hàng</>}
                </th>
                {tatCa && (
                  <th rowSpan={3} className={`${thB} whitespace-nowrap text-center`}
                    title="BOT dự án — hạn chung của công trình (ngày nhiều nhất trong các hạng mục không HỦY); đỏ = đã qua mà còn giá trị chưa xong">
                    BOT<br />dự án
                  </th>
                )}
                <th colSpan={cot.length + 1} className={`${thB} text-center`}>{tieuDeCot}</th>
                <th colSpan={khoHien.length} rowSpan={2} className={`${thB} border-l-2 border-l-slate-300 bg-emerald-50/60 text-center text-sm text-emerald-900`}
                  title={tatCa ? 'Lũy kế các hạng mục đang xem, kể cả đã nhập kho đủ' : 'Lũy kế mọi hạng mục không hủy của công trình, mọi Tình trạng IPO'}>
                  Kho (lũy kế)
                </th>
              </tr>
              <tr>
                {pivot.groups.map((g, gi) => {
                  const mo = moNhom.has(gi);
                  // Chưa triển khai (P001) / Chưa tính phiếu (P002): 1 công đoạn => không bung / gộp
                  const coTach = g.bucket !== 'notDeployed' && g.bucket !== 'p002';
                  return (
                    <th key={gi} colSpan={mo ? g.stages.length : 1} rowSpan={mo ? 1 : 2} onClick={coTach ? () => doiNhom(gi) : undefined} style={{ minWidth: rongSo && !mo ? 140 : undefined }}
                      className={`${thB} text-center text-sm leading-tight ${coTach ? 'cursor-pointer select-none hover:bg-emerald-400' : ''}`}
                      title={!coTach ? undefined : mo ? 'Bấm để gộp lại 1 cột' : `Bấm để tách từng công đoạn (${g.stages.map(tenCotCongDoan).join(', ')})`}>
                      {g.bucket && <span className={`mr-1.5 inline-block h-2 w-2 rounded-sm ${BOP_GROUP[g.bucket].dot}`} />}
                      {tenNhom(g.bucket)}
                      {!mo && <><br /><span className="font-semibold normal-case text-slate-800">{dayP(g.stages)}</span></>}
                      {coTach && <span className="ml-1 font-bold text-emerald-700">{mo ? '−' : '+'}</span>}
                    </th>
                  );
                })}
                <th rowSpan={2} style={{ minWidth: rongSo }} className={`${thB} text-center`}>Tổng</th>
              </tr>
              <tr>
                {pivot.groups.map((g, gi) => (moNhom.has(gi) ? g.stages.map(st => (
                  <th key={st} className={`${thB} whitespace-nowrap text-center font-bold text-slate-900`}>{tenCotCongDoan(st)}</th>
                )) : null))}
                {khoHien.map((f, idx) => (
                  <th key={f} style={{ minWidth: rongSo }} className={`${thB} whitespace-nowrap bg-emerald-50/60 text-center font-bold text-slate-900 ${idx === 0 ? 'border-l-2 border-l-slate-300' : ''}`}>
                    {{
                      nk: <>Đã nhập<br /><span className="font-semibold text-slate-800">P022</span></>,
                      xk: <>Đã xuất<br /><span className="font-semibold text-slate-800">P025</span></>,
                      ton: 'Tồn kho', chenh: 'Chênh', xv: <>Xuất vượt<br />nhập</>,
                    }[f]}
                    {f === 'ton' && (
                      <button type="button" onClick={() => setMoKho(v => !v)} aria-expanded={moKho}
                        title={moKho ? 'Ẩn cột Chênh, Xuất vượt nhập' : 'Hiện cột Chênh, Xuất vượt nhập'}
                        className="ml-1 font-bold text-emerald-700 hover:text-emerald-900">{moKho ? '−' : '+'}</button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dongBang}
              {pivot.goc.length === 0 && (
                <tr><td colSpan={cot.length + 8 + (tatCa ? 1 : 0)} className="px-3 py-6 text-center text-slate-400">Không có hạng mục.</td></tr>
              )}
            </tbody>
            {pivot.goc.length > 0 && (
              <tfoot className="font-bold text-red-600 [&_td]:sticky [&_td]:bottom-0 [&_td]:z-[2] [&_td]:bg-yellow-300">
                <tr>
                  <td className={`${tdB} left-0 !z-[3] text-center`}>TỔNG</td>
                  {cell(pivot.donHangTot, { donHang: true })}
                  {tatCa && <td className={tdB} />}
                  {cot.map(c => <React.Fragment key={c.key}>{cell(congCot(pivot.colTot, c.stages), { stages: c.stages })}</React.Fragment>)}
                  {cell(pivot.grand, {})}
                  {khoCells(pivot.khoTot, {})}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <button type="button" onClick={() => setMoPhu(v => !v)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        {moPhu ? '▾' : '▸'} {tatCa ? 'Thời gian ở công đoạn' : 'Thời gian ở công đoạn, sản lượng, QC, gia công ngoài'}
      </button>
      {moPhu && <>
      {/* 2. Điểm nghẽn: thời gian ở công đoạn hiện tại */}
      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-xs font-semibold text-slate-700">
              Thời gian ở công đoạn hiện tại
              {sel && <span className="ml-1 font-normal text-amber-700">· theo lọc: {[sel.ct, sel.nsp, sel.xuong, sel.stages && dayP(sel.stages)].filter(Boolean).join(' · ')}</span>}
            </p>
            {DWELL.map(d => (
              <span key={d.key} className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                <span className={`h-3 w-3 rounded-sm ${d.bar}`} />{d.label}
              </span>
            ))}
          </div>
          <div className="space-y-1.5">
            {dwell.rows.map((r, i) => (
              <Fragment key={r.stage}>
              {/* P001 = chờ triển khai bản vẽ (chưa vào xưởng) — tách khỏi các công đoạn sản xuất */}
              {i > 0 && dwell.rows[i - 1].stage === 'P001' && (
                <p className="border-t border-dashed border-slate-300 pt-1.5 text-xs font-medium text-slate-500">Công đoạn sản xuất</p>
              )}
              <div className="flex items-center gap-2 text-xs">
                <span className="w-12 shrink-0 font-semibold text-slate-800" title={r.stage === 'P001' ? 'Chờ triển khai bản vẽ' : undefined}>{r.stage}</span>
                <div className="flex h-6 flex-1 overflow-hidden rounded bg-slate-100">
                  {DWELL.map(d => {
                    const v = r.c[d.key] ?? 0;
                    if (!v) return null;
                    const next = { stage: r.stage, dwell: d.key as string };
                    return (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => pickDwell(next)}
                        title={`${r.stage} · ${d.label}: ${fmtInt(v)} hạng mục`}
                        className={`${d.bar} ${d.chu} flex items-center justify-center text-xs font-semibold tabular-nums hover:brightness-110 ${isDwellSel(next) ? 'ring-2 ring-inset ring-slate-900' : ''}`}
                        style={{ width: `${(v / r.n) * 100}%` }}
                      >
                        {v / r.n >= 0.05 ? fmtInt(v) : ''}
                      </button>
                    );
                  })}
                </div>
                <span className="w-12 shrink-0 text-right font-semibold tabular-nums text-slate-800" title="Tổng hạng mục ở công đoạn">{fmtInt(r.n)}</span>
              </div>
              </Fragment>
            ))}
            {dwell.rows.length === 0 && <p className="py-4 text-center text-xs text-slate-400">Không có dữ liệu thời gian ở công đoạn.</p>}
          </div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50/40 p-3">
          <p className="mb-2 text-xs font-semibold text-red-700" title="Công đoạn sản xuất có nhiều hạng mục tồn ≥ 4 tuần — không gồm P001 (chờ triển khai bản vẽ, xem ô bên dưới)">Top điểm nghẽn sản xuất (≥ 4 tuần)</p>
          <div className="space-y-1.5">
            {dwell.stuck.slice(0, 6).map((r, idx) => {
              const next = { stage: r.stage, dwell: DWELL_STUCK as string };
              return (
                <button
                  key={r.stage}
                  type="button"
                  onClick={() => pickDwell(next)}
                  className={`flex w-full items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5 text-left text-xs hover:border-red-300 ${isDwellSel(next) ? 'border-red-500' : 'border-red-100'}`}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-[0.625rem] font-bold text-red-600">{idx + 1}</span>
                  <span className="font-semibold text-slate-800">{r.stage}</span>
                  <span className="ml-auto font-bold tabular-nums text-red-600">{fmtInt(r.c[DWELL_STUCK] ?? 0)}</span>
                </button>
              );
            })}
            {dwell.stuck.length === 0 && <p className="py-2 text-center text-xs text-slate-400">Không có hạng mục tồn đọng ≥ 4 tuần.</p>}
          </div>
          {dwell.stuckTotal > 0 && (
            <p className="mt-2 flex justify-between border-t border-red-100 pt-2 text-xs text-slate-600">
              Tổng cảnh báo <span className="font-bold text-red-600">{fmtInt(dwell.stuckTotal)} hạng mục</span>
            </p>
          )}
          {dwell.p001Stuck > 0 && (() => {
            const next = { stage: 'P001', dwell: DWELL_STUCK as string };
            return (
              <button
                type="button"
                onClick={() => pickDwell(next)}
                title="Hạng mục P001 (chưa triển khai bản vẽ) tồn ≥ 4 tuần — chờ thiết kế, không phải nghẽn trong xưởng. Bấm để lọc danh sách."
                className={`mt-2 w-full rounded-lg border bg-white px-2.5 py-1.5 text-left text-xs hover:border-slate-400 ${isDwellSel(next) ? 'border-slate-700' : 'border-slate-200'}`}
              >
                <span className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">P001 · chờ triển khai bản vẽ ≥ 4 tuần</span>
                  <span className="font-bold tabular-nums text-slate-800">{fmtInt(dwell.p001Stuck)}</span>
                </span>
                <span className="mt-0.5 block text-[0.6875rem] text-slate-500">
                  <span className={dwell.p001Overdue ? 'font-semibold text-red-600' : ''}>{fmtInt(dwell.p001Overdue)} đã quá hạn</span>
                  {' · '}{fmtInt(dwell.p001NoDeadline)} chưa có hạn
                </span>
              </button>
            );
          })()}
        </div>
      </div>

      {/* 3. Sản lượng theo công đoạn SX · QC · Gia công ngoài (dữ liệu thêm theo HEX) — không có ở view tất cả công trình */}
      {!tatCa && (<>
      <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr_1fr]">
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-700">
            Sản lượng theo công đoạn sản xuất{' '}
            <span className="font-normal text-slate-500">
              · {steps ? `${fmtInt(steps.onLine)} hạng mục trên chuyền (P012→P021)` : '…'}
            </span>
          </p>
          {!steps ? (
            <p className="py-3 text-center text-xs text-slate-400">Đang tải…</p>
          ) : steps.rows.length === 0 ? (
            <p className="py-3 text-center text-xs text-slate-400">Không có hạng mục trên chuyền.</p>
          ) : (
            <div className="space-y-1.5">
              {steps.rows.map(r => {
                const next = { kind: 'step' as const, key: r.key };
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => toggleExtra(next)}
                    title={`${r.label}: ${fmtInt(r.done)} / ${fmtInt(r.items)} hạng mục đã giao đủ bước này`}
                    className={`flex w-full items-center gap-2 rounded px-1 text-left text-xs hover:bg-slate-50 ${isExtra(next) ? 'bg-amber-50 ring-1 ring-amber-300' : ''}`}
                  >
                    <span className="w-16 shrink-0 font-semibold text-slate-700">{r.label}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-2 rounded-full ${r.pct >= 100 ? 'bg-emerald-500' : r.pct >= 50 ? 'bg-amber-400' : 'bg-orange-400'}`} style={{ width: `${r.pct}%` }} />
                    </div>
                    <span className={`w-12 shrink-0 text-right tabular-nums ${r.pct === 0 ? 'font-bold text-red-600' : 'text-slate-700'}`}>{fmtPt(r.pct)}</span>
                    <span className="w-24 shrink-0 text-right tabular-nums text-slate-500" title="Hạng mục đã giao đủ bước / hạng mục áp dụng">{fmtInt(r.done)}/{fmtInt(r.items)} HM</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-700">
            QC <span className="font-normal text-slate-500">· lần kiểm gần nhất</span>
          </p>
          {!qc ? <p className="py-3 text-center text-xs text-slate-400">Đang tải…</p> : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {(['bad', 'wait', 'ok', 'none'] as const).map(st => {
                  const next = { kind: 'qc' as const, st };
                  const tone = st === 'bad' ? 'text-red-600' : st === 'wait' ? 'text-amber-600' : st === 'ok' ? 'text-emerald-600' : 'text-slate-500';
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => toggleExtra(next)}
                      className={`rounded-lg border px-2.5 py-1.5 text-left transition ${isExtra(next) ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200 hover:border-slate-400'}`}
                    >
                      <p className="text-[0.6875rem] text-slate-500">{QC_STATE_META[st].label}</p>
                      <p className={`text-lg font-semibold tabular-nums ${qc[st] ? tone : 'text-slate-400'}`}>{fmtInt(qc[st])}</p>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[0.625rem] text-slate-400">
                {fmtInt(qc.checks)} lần kiểm · {fmtInt(qc.fail)} sản phẩm lỗi
              </p>
            </>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-700">
            Gia công ngoài
          </p>
          {!gcn ? <p className="py-3 text-center text-xs text-slate-400">Đang tải…</p>
            : gcn.total === 0 ? <p className="py-3 text-center text-xs text-slate-400">Không có hạng mục gia công ngoài.</p> : (
              <>
                <div className="mb-2 flex items-baseline gap-2">
                  <button
                    type="button"
                    onClick={() => toggleExtra({ kind: 'gcn', st: 'pending' })}
                    className={`rounded-lg border px-2.5 py-1 text-left ${isExtra({ kind: 'gcn', st: 'pending' }) ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200 hover:border-slate-400'}`}
                  >
                    <span className={`text-lg font-semibold tabular-nums ${gcn.pending ? 'text-orange-600' : 'text-slate-700'}`}>{fmtInt(gcn.pending)}</span>
                    <span className="ml-1 text-[0.6875rem] text-slate-500">còn chờ NCC / {fmtInt(gcn.total)}</span>
                  </button>
                </div>
                <ul className="max-h-40 space-y-0.5 overflow-auto pr-1 text-xs custom-scrollbar">
                  {gcn.by.map(([st, n]) => {
                    const next = { kind: 'gcn' as const, st };
                    return (
                      <li key={st}>
                        <button
                          type="button"
                          onClick={() => toggleExtra(next)}
                          className={`flex w-full items-center justify-between rounded px-1.5 py-0.5 text-left hover:bg-slate-50 ${isExtra(next) ? 'bg-amber-50 font-semibold' : ''}`}
                        >
                          <span className={GCN_DONE(st) ? 'text-slate-500' : 'text-slate-700'}>{st}</span>
                          <span className="tabular-nums">{fmtInt(n)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
        </div>
      </div>
      </>)}
      </>}

      {/* 4. Danh sách hạng mục: bấm số => cửa sổ HEX (cùng kiểu BOT x BOP / BOM / BOT) */}
      {hasFilter && (
      <ModalShell open onClose={dongDs} labelledBy="bop-ds" closeOnEsc closeOnBackdrop overlayClassName={bang.cuaSoNen} panelClassName={bang.cuaSoKhung}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="bop-ds" className="text-xl font-bold text-slate-900">{selText}</h3>
          <span className="text-base text-slate-600"><b>{fmtInt(list.length)}</b> hạng mục{list.length ? <> · <b>{fmtTy(list.reduce((s2, i) => s2 + i.remain, 0))}</b> tỷ còn lại</> : null}</span>
          <SortPicker
            value={sortBy}
            onChange={setSortBy}
            options={[['deadline', 'Hạn gần nhất'], ['stage', 'Công đoạn'], ['remain', 'Giá trị còn lại']]}
          />
          <div className="ml-auto flex items-center gap-2">
            <SearchBox value={q} onChange={setQ} placeholder="Tìm hex, hạng mục..." />
            <button type="button" onClick={dongDs} aria-label="Đóng" className="rounded p-1 hover:bg-slate-100"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className={`min-h-0 flex-1 overflow-auto ${bang.cuaSoBang}`}>
        {/* Bảng BOP: gộp 3 cột KH tuần / KH tháng / Cần giao thành 1 cột "Hạn" (bảng 15 cột rộng 1.760px,
            cột QC / GCN mới thêm rơi ra ngoài màn 1440) — chi tiết từng ngày xem ở tab BOT */}
        <HexTable
          rows={list}
          planDates={false}
          onHexClick={onHexClick}
          hexClickTitle="Xem chi tiết hạng mục (BOP × BOT)"
          cotKho={!!sel?.kho}
          soCotThem={tatCa ? 5 : 8}
          extraHead={<>
            <th className={`${bang.thC} whitespace-nowrap`} title="BOT hạng mục = NGÀY CẦN GIAO PC ĐỀ XUẤT của HEX trong file công trình (như tab BOT)">BOT hạng mục</th>
            <th className={bang.thC} title="Hạn đang dùng: KH nhập kho tuần → tháng (chi tiết ở tab BOT)">Hạn</th>
            <th className={bang.thC}>Khu vực SX</th>
            <th className={bang.thC}>Tình trạng</th>
            <th className={bang.thC}>Ở công đoạn</th>
            {!tatCa && <>
            <th className={bang.thC} title="Số lượng đã giao theo công đoạn SX / SL tính phiếu (chỉ hạng mục trên chuyền)">Công đoạn SX</th>
            <th className={bang.thC} title="Lần kiểm QC gần nhất: trạng thái · công đoạn · ngày">QC</th>
            <th className={bang.thC} title="Tình trạng gia công ngoài">GCN</th>
            </>}
          </>}
          extraCells={i => {
            const d = DWELL.find(x => x.key === dwellOf(i.dwell));
            const e = ex(i);
            const stepText = e && i.bucket === 'onLine' && e.qtyTicket > 0
              ? STEPS.filter(s => !s.flag || e.flags[s.flag] || e.steps[s.key] > 0)
                .map(s => `${s.label} ${fmtQty(e.steps[s.key])}/${fmtQty(e.qtyTicket)}`)
              : [];
            const stepDone = e && e.qtyTicket > 0 ? STEPS.filter(s => (!s.flag || e.flags[s.flag] || e.steps[s.key] > 0) && e.steps[s.key] >= e.qtyTicket).length : 0;
            const stepAll = e && e.qtyTicket > 0 ? STEPS.filter(s => !s.flag || e.flags[s.flag] || e.steps[s.key] > 0).length : 0;
            const qs = qcStateOf(e?.qc);
            const bh = botHm?.get(i.hex) ?? null, quaBh = !!bh && bh.getTime() < homNayMs && i.remain > 0;
            const qm = QC_STATE_META[qs];
            return (
              <>
                <td className={`${bang.tdSo} ${!bh ? 'text-slate-300' : quaBh ? 'font-semibold text-red-600' : ''}`}
                    title={bh ? `Ngày cần giao PC đề xuất (file công trình)${quaBh ? ' · đã qua mà còn giá trị chưa nhập kho' : ''}` : botHm ? 'CHƯA BOT' : 'Đang tải…'}>
                  {fmtDate(bh)}
                </td>
                <td className={`${bang.tdSo} ${!i.deadline ? 'text-slate-300' : i.overdue ? 'font-semibold text-red-600' : i.dueSoon ? 'font-semibold text-amber-600' : ''}`}
                    title={i.deadlineSource ? `KH nhập kho ${i.deadlineSource}` : 'Chưa có KH nhập kho tuần / tháng'}>
                  {fmtDate(i.deadline)}
                </td>
                <td className={`${tdB} whitespace-nowrap`}>{i.area || '—'}</td>
                <td className={`${tdB} whitespace-nowrap`}>{i.status || '—'}</td>
                <td className={`${tdB} whitespace-nowrap`}>
                  {d ? (
                    <span className="inline-flex items-center gap-1">
                      <span className={`h-2 w-2 rounded-sm ${d.bar}`} />{d.label}
                    </span>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                {!tatCa && <>
                <td className={`${tdB} whitespace-nowrap`} title={stepText.join(' · ') || undefined}>
                  {extra === null || extra === undefined ? <span className="text-slate-300">…</span>
                    : stepText.length === 0 ? <span className="text-slate-300">—</span> : (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="flex h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                          <span className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${stepAll ? (stepDone / stepAll) * 100 : 0}%` }} />
                        </span>
                        <span className="tabular-nums">{fmtInt(stepDone)}/{fmtInt(stepAll)} bước</span>
                      </span>
                    )}
                </td>
                <td className={`${tdB} whitespace-nowrap`}>
                  {extra === null || extra === undefined ? <span className="text-slate-300">…</span>
                    : !e?.qc?.last ? <span className="text-slate-300">—</span> : (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] font-semibold ${qm.badge}`}
                            title={`${fmtInt(e.qc.n)} lần kiểm · ${fmtInt(e.qc.fail)} lỗi · gần nhất ${e.qc.last.date} ${e.qc.last.stage}`}>
                        {QC_STATUS_VI[e.qc.last.status] ?? e.qc.last.status}{e.qc.last.fail > 0 ? ` · lỗi ${fmtInt(e.qc.last.fail)}` : ''}
                        <span className="font-normal text-slate-500">{e.qc.last.stage.split(' ')[0]}</span>
                      </span>
                    )}
                </td>
                <td className={`${tdB} min-w-[140px] max-w-[220px] break-words`} title={e?.gcn ? [e.gcn.st, e.gcn.note, e.gcn.due ? `dự kiến về ${e.gcn.due}` : ''].filter(Boolean).join(' · ') : undefined}>
                  {extra === null || extra === undefined ? <span className="text-slate-300">…</span>
                    : !e?.gcn ? <span className="text-slate-300">—</span>
                      : <span className={GCN_DONE(e.gcn.st) ? 'text-slate-500' : 'font-medium text-orange-700'}>{e.gcn.st ?? 'Chưa ghi tình trạng'}</span>}
                </td>
                </>}
              </>
            );
          }}
        />
        </div>
      </ModalShell>
      )}
    </div>
  );
};

// ============================================================================
// BOM — vật tư: phân tích theo trạng thái TỪNG DÒNG PR rồi gộp lên hạng mục.
// Mọi ngày ở đây lấy từ bảng vật tư (Ngày PR, Ngày cần vật tư, Ngày dự kiến giao PMH nhập,
// Ngày thực tế về) — KHÔNG dùng KH nhập kho / ngày cần giao của hạng mục.
// ============================================================================

// Trạng thái hạng mục = trạng thái "xấu nhất" trong các dòng vật tư của nó (thứ tự dưới đây)
// Không có PR ghi mã hạng mục: tách theo đã / chưa triển khai (cùng quy tắc nhóm 'notDeployed' của BOP:
// công đoạn P001 hoặc tình trạng 15. CHƯA TRIỂN KHAI). Đã triển khai thì tách tiếp:
//  - noneBeforeSx: P002 / P012 (chưa sản xuất) và bảng sản xuất không ghi tình trạng mua hoặc còn dòng chờ
//    => chưa kiểm chứng được vật tư, cần để ý
//  - noneInSx: đã lên chuyền (từ P013), hoặc P002 / P012 mà tình trạng NVL ở bảng sản xuất đã về đủ
//    => vật tư mua gộp theo công trình / tồn kho, không đáng lo
export type BomState = 'noneBeforeSx' | 'noneInSx' | 'noneNotDeployed' | 'notOrdered' | 'late' | 'outsourced' | 'deferred' | 'onTrack' | 'arrived' | 'onHold' | 'ok' | 'stocked';
export const BOM_STATES: { key: BomState; label: string; tone: 'red' | 'amber' | 'emerald' | 'slate'; badge: string; hint: string }[] = [
  { key: 'noneBeforeSx', label: 'Đã triển khai, chưa SX – chưa thấy PR', tone: 'red', badge: 'bg-red-50 text-red-600',
    hint: 'P002 / P012 (chưa sản xuất), không có dòng PR nào ghi mã nhà máy của hạng mục và bảng sản xuất không ghi tình trạng mua (hoặc còn dòng chờ) — chưa kiểm chứng được vật tư: kiểm tra PR chung của công trình / định mức NVL' },
  { key: 'noneInSx', label: 'Đang SX / NVL đủ – mua gộp, tồn kho', tone: 'slate', badge: 'bg-slate-100 text-slate-600',
    hint: 'Không có PR ghi mã hạng mục nhưng đã lên chuyền (từ P013) hoặc bảng sản xuất ghi tình trạng mua đã về đủ — vật tư mua gộp theo công trình hoặc lấy từ tồn kho' },
  { key: 'noneNotDeployed', label: 'Chưa triển khai (P001)', tone: 'slate', badge: 'bg-slate-100 text-slate-600',
    hint: 'Hạng mục chưa triển khai bản vẽ (P001 / 15. CHƯA TRIỂN KHAI) nên chưa lên PR — bình thường' },
  { key: 'notOrdered', label: 'Chưa mua', tone: 'red', badge: 'bg-red-50 text-red-700',
    hint: 'Ít nhất 1 dòng PR 1.CHƯA MUA (chưa có PO)' },
  { key: 'late', label: 'Đang mua – trễ hẹn', tone: 'amber', badge: 'bg-orange-50 text-orange-700',
    hint: 'Đang mua, đã quá Ngày dự kiến giao hàng PMH nhập mà chưa về đủ' },
  { key: 'outsourced', label: 'Gia công ngoài', tone: 'amber', badge: 'bg-fuchsia-50 text-fuchsia-700',
    hint: 'Còn PR gia công ngoài (nhóm 806 / ghi chú GC…) chưa đặt hoặc chưa về — bán thành phẩm / công đoạn thuê ngoài, không phải vật tư' },
  { key: 'deferred', label: 'Đang mua – về theo nhu cầu SX', tone: 'amber', badge: 'bg-amber-50 text-amber-800',
    hint: 'Đang mua, đã qua ngày dự kiến giao nhưng ghi chú là về theo nhu cầu sản xuất / dùng tồn kho trước — cố ý cho về sau, không phải nhà cung cấp trễ' },
  { key: 'onTrack', label: 'Đang mua – chưa tới hẹn', tone: 'slate', badge: 'bg-sky-50 text-sky-700',
    hint: 'Còn dòng đang mua nhưng chưa tới Ngày dự kiến giao hàng PMH nhập' },
  { key: 'arrived', label: 'Kho báo về, chờ nhập SAP', tone: 'slate', badge: 'bg-blue-50 text-blue-700',
    hint: 'Kho báo SL hàng về thực tế ≥ SL yêu cầu (và không quá 1,5 lần — lớn hơn coi là kho ghi khác đơn vị, vd. gỗ M3), SAP chưa ghi nhận' },
  { key: 'onHold', label: 'Tạm dừng / chờ hủy PR', tone: 'slate', badge: 'bg-stone-100 text-stone-600',
    hint: 'Không còn dòng chờ hàng về, nhưng có dòng PR tạm dừng / chờ hủy (PO ghi HỦY / tạm ngưng / chuyển thầu phụ…) — team PR cần đóng / hủy PR' },
  { key: 'ok', label: 'Đã về đủ (theo PR đã có)', tone: 'emerald', badge: 'bg-emerald-50 text-emerald-700',
    hint: 'Mọi dòng PR đã nối được đều đã về / CCLD / đã đóng / đã hủy — không khẳng định đủ toàn bộ BOM' },
  { key: 'stocked', label: 'Hạng mục đã nhập kho đủ', tone: 'slate', badge: 'bg-slate-100 text-slate-500',
    hint: 'Hạng mục đã nhập kho đủ trị giá hoặc đủ số lượng — vật tư không còn ảnh hưởng' },
];
// Nhãn dòng PR — 2 cấp (utils/productionMetrics.materialLineState): cấp 1 theo 2 cột TRẠNG THÁI + TRẠNG THÁI SAP
// (LINE_BASES), cấp 2 chi tiết trong từng nhóm. `label` ngắn (hiện dưới tiêu đề nhóm cấp 1), `full` kèm tên nhóm
// (bảng / bộ lọc). `hint` hiện khi rê chuột.
export const LINE_STATES: { key: MaterialLineState; label: string; full: string; bar: string; hint: string }[] = [
  { key: 'notOrdered', label: 'Chưa mua', full: 'Chưa mua', bar: 'bg-red-600',
    hint: '1.CHƯA MUA / Mở — chưa có PO (kể cả dòng có ghi chú CCLD).' },
  { key: 'gcNotOrdered', label: 'Gia công ngoài – chưa đặt', full: 'Chưa mua – gia công ngoài', bar: 'bg-fuchsia-400',
    hint: '1.CHƯA MUA / Mở, PR gia công ngoài (nhóm VT 806 - Gia công, ghi chú Team PR "GC BTP-…" / "GC CÔNG ĐOẠN-…" / "GC NGUYÊN CON") chưa đặt: bán thành phẩm / công đoạn thuê ngoài, không phải mua vật tư. Vẫn là còn chờ.' },
  { key: 'holdNotOrdered', label: 'Tạm dừng / chờ hủy', full: 'Chưa mua – tạm dừng / chờ hủy', bar: 'bg-stone-400',
    hint: '1.CHƯA MUA / Mở nhưng tình trạng PO ghi HỦY / tạm ngưng / công trình tạm dừng / chuyển thầu phụ, hoặc ghi chú Team PR ghi HỦY / tạm ngưng / BOD pending — không còn chờ; cần team PR hủy PR trên SAP.' },
  { key: 'late', label: 'Trễ hẹn', full: 'Đang mua – trễ hẹn', bar: 'bg-orange-500',
    hint: '2.ĐANG MUA / Mở, đã qua hạn giao mà SAP chưa nhận đủ. Hạn giao = Ngày dự kiến giao hàng (PMH nhập); Team PR ghi ngày hẹn mới vào ghi chú (muộn hơn) thì lấy ngày ghi chú.' },
  { key: 'outsourced', label: 'Gia công ngoài', full: 'Đang mua – gia công ngoài', bar: 'bg-fuchsia-600',
    hint: '2.ĐANG MUA / Mở, PR gia công ngoài (nhóm 806 / ghi chú GC…) đã đặt, chưa về — bán thành phẩm / công đoạn thuê ngoài, không phải vật tư. Vẫn là còn chờ.' },
  { key: 'deferred', label: 'Về theo nhu cầu SX', full: 'Đang mua – về theo nhu cầu SX', bar: 'bg-amber-300',
    hint: '2.ĐANG MUA / Mở, đã qua hạn giao nhưng ghi chú Team PR "VỀ THEO NHU CẦU SX" / "DÙNG TRƯỚC TỒN KHO" hoặc ghi chú PO "ĐIỀU PHỐI HÀNG VỀ THEO NHU CẦU SẢN XUẤT": cố ý cho về theo nhu cầu sản xuất, không phải nhà cung cấp trễ. Vẫn là còn chờ.' },
  { key: 'onTrack', label: 'Chưa tới hẹn', full: 'Đang mua – chưa tới hẹn', bar: 'bg-sky-300',
    hint: '2.ĐANG MUA / Mở, chưa tới hạn giao (Ngày dự kiến giao hàng PMH nhập, hoặc ngày hẹn mới Team PR ghi trong ghi chú).' },
  { key: 'arrived', label: 'Kho báo về, chờ nhập SAP', full: 'Đang mua – kho báo về, chờ nhập SAP', bar: 'bg-blue-500',
    hint: '2.ĐANG MUA / Mở nhưng kho đã báo SL hàng về thực tế ≥ SL yêu cầu, hoặc Team PR ghi chú "HOÀN THÀNH" — chỉ còn chờ SAP ghi nhập kho. Số kho báo lớn hơn 1,5 lần SL yêu cầu bị bỏ qua (kho ghi khác đơn vị, vd. gỗ M3).' },
  { key: 'ccld', label: 'CCLD – lắp tại công trình', full: 'Đang mua – CCLD lắp tại công trình', bar: 'bg-teal-400',
    hint: '2.ĐANG MUA / Mở, hàng CCLD (ghi chú Team PR có "CCLD" hoặc tình trạng PO "Cung cấp lắp đặt"): nhà cung cấp giao và lắp thẳng tại công trình, không về kho nhà máy — không chặn sản xuất.' },
  { key: 'onHold', label: 'Tạm dừng / chờ hủy', full: 'Đang mua – tạm dừng / chờ hủy', bar: 'bg-stone-400',
    hint: '2.ĐANG MUA / Mở nhưng tình trạng PO / ghi chú ghi HỦY / tạm ngưng / công trình tạm dừng / chuyển thầu phụ / BOD pending — không còn chờ hàng về; cần team PR đóng / hủy PR trên SAP.' },
  { key: 'done', label: 'Đã nhận đủ', full: 'Hoàn thành – đã nhận đủ', bar: 'bg-emerald-500',
    hint: '3.ĐÃ NHẬP KHO / Hoàn thành: SAP đã nhận ≥ SL yêu cầu (kể cả dòng nhận dư, SL còn lại âm).' },
  { key: 'closedFull', label: 'Nhận đủ rồi đóng', full: 'Đóng PR – đã nhận đủ', bar: 'bg-emerald-300',
    hint: '3.ĐÃ NHẬP KHO / Đóng, SL còn lại = 0: đã nhận đủ rồi đóng PR.' },
  { key: 'closedPartial', label: 'Nhận 1 phần rồi đóng', full: 'Đóng PR – nhận 1 phần', bar: 'bg-violet-500',
    hint: '3.ĐÃ NHẬP KHO / Đóng, đã nhận 1 phần trên SAP rồi đóng PR khi còn thiếu (dùng tồn kho, đóng PR thiếu, CCLD…) — không còn chờ hàng về.' },
  { key: 'closedNoReceipt', label: 'Có PO, chưa nhận gì', full: 'Đóng PR – có PO, chưa nhận', bar: 'bg-violet-300',
    hint: '3.ĐÃ NHẬP KHO / Đóng, đã có PO nhưng SAP chưa nhận gì đã đóng PR (CCLD, hủy PO, đề xuất đóng PR…) — không còn chờ hàng về.' },
  { key: 'closedNoPo', label: 'Không có PO', full: 'Đóng PR – không có PO', bar: 'bg-slate-400',
    hint: '3.ĐÃ NHẬP KHO / Đóng, không có PO: đóng PR mà không mua (phần lớn CCLD, dùng tồn kho, đề xuất đóng PR…) — không còn chờ hàng về.' },
  { key: 'cancelled', label: 'Hủy', full: 'Hủy', bar: 'bg-slate-300',
    hint: '4.HỦY / Hủy — không tính vào vật tư của hạng mục.' },
];

export interface HexBom {
  state: BomState;
  lines: number;                                   // số dòng PR nối được
  byLine: Partial<Record<MaterialLineState, number>>;
  prDate: Date | null;        // Ngày PR sớm nhất
  needDate: Date | null;      // Ngày cần vật tư sớm nhất của dòng còn chờ (không còn chờ: sớm nhất mọi dòng)
  dueDate: Date | null;       // Ngày dự kiến giao PMH nhập muộn nhất của dòng đang mua
  arrivedDate: Date | null;   // Ngày thực tế về (posting) muộn nhất
  afterNeed: number;          // số dòng còn chờ sẽ về sau Ngày cần vật tư
  issues: VuongMacItem[];     // vướng mắc M3 (Vật tư) chưa xử lý
}

export interface BomAnalysis {
  byHex: Record<string, HexBom>;
  counts: Record<BomState, number>;               // theo HEX duy nhất
  lineCounts: Record<MaterialLineState, number>;  // dòng phục vụ ≥ 1 hạng mục chưa nhập kho đủ
  lineTotal: number;
  afterNeed: number;                              // số hạng mục có VT về sau ngày cần vật tư
  issueHexes: number;                             // số hạng mục có vướng mắc M3 đang mở
  issueTotal: number;                             // số vướng mắc M3 đang mở
}

// Nhãn dòng PR -> tình trạng hạng mục (chưa mua / gia công chưa đặt + đang đặt gộp "Gia công ngoài"; tạm dừng của
// cả chưa mua lẫn đang mua gộp "Tạm dừng"); nhãn không có ở đây (CCLD, đã nhận, đóng PR) => hạng mục "Đã về đủ"
const BOM_FROM_LINE: Partial<Record<MaterialLineState, BomState>> = {
  notOrdered: 'notOrdered', gcNotOrdered: 'outsourced', outsourced: 'outsourced', late: 'late', deferred: 'deferred',
  onTrack: 'onTrack', arrived: 'arrived', onHold: 'onHold', holdNotOrdered: 'onHold',
};
// Thứ tự "xấu nhất" của hạng mục
const BOM_ORDER: BomState[] = ['notOrdered', 'late', 'outsourced', 'onTrack', 'deferred', 'arrived', 'onHold'];

/**
 * Dòng còn chờ sẽ về SAU Ngày cần vật tư:
 *  - chưa mua: đã qua ngày cần vật tư (chưa có PO thì không thể về kịp)
 *  - đang mua: max(ngày dự kiến giao, hôm nay) > ngày cần vật tư (đã trễ hẹn thì sớm nhất cũng là hôm nay)
 *  - KHÔNG tính hàng "về theo nhu cầu SX / dùng tồn kho trước": cố ý cho về theo nhu cầu, ngày cần trên PR
 *    không phải hạn thật (trước 96 hạng mục của CT24-066 bị báo "VT về sau ngày cần" chỉ vì nhóm này)
 */
const lineAfterNeed = (l: MaterialLine, st: MaterialLineState, today: number): boolean => {
  const need = parsePlanDate(l.ngay_can_vat_tu)?.getTime();
  if (need === undefined) return false;
  if (st === 'notOrdered' || st === 'gcNotOrdered') return need < today;
  if (st === 'late' || st === 'onTrack' || st === 'outsourced') {
    const due = materialDueDate(l)?.getTime() ?? today;
    return Math.max(due, today) > need;
  }
  return false;
};

const minT = (a: number | null, b: number | undefined) => (b === undefined ? a : a === null ? b : Math.min(a, b));
const maxT = (a: number | null, b: number | undefined) => (b === undefined ? a : a === null ? b : Math.max(a, b));
const toDate = (t: number | null) => (t === null ? null : new Date(t));

export function analyzeBom(
  items: HexInfo[], matCount: Record<string, number> | null, lines: MaterialLine[] | null, today: number,
  materialIssues: Record<string, VuongMacItem[]> | null = null,
  /** Định mức + tình trạng NVL theo hạng mục (bảng sản xuất): tách hạng mục không có PR ghi mã */
  nvlByHex: Record<string, NvlRaw> | null = null,
): BomAnalysis | null {
  if (!matCount || !lines) return null;
  // Hạng mục không có PR ghi mã nhưng bảng sản xuất ghi tình trạng mua đã về đủ (có dòng, không dòng nào còn chờ)
  const nvlDone = (hex: string) => {
    const st = parseNvlStatus(nvlByHex?.[hex]);
    return st.length > 0 && !st.some(nvlLinePending);
  };
  const openHex = new Set(items.filter(i => i.open).map(i => i.hex));
  type Acc = {
    byLine: Partial<Record<MaterialLineState, number>>; afterNeed: number;
    pr: number | null; needPending: number | null; needAll: number | null; due: number | null; arrived: number | null;
  };
  const perHex: Record<string, Acc> = {};
  const lineCounts = Object.fromEntries(LINE_STATES.map(s => [s.key, 0])) as Record<MaterialLineState, number>;
  let lineTotal = 0;

  for (const l of lines) {
    const st = materialLineState(l, today);
    const pending = isMaterialPending(st);
    const after = lineAfterNeed(l, st, today);
    const pr = parsePlanDate(l.ngay_pr)?.getTime();
    const need = parsePlanDate(l.ngay_can_vat_tu)?.getTime();
    const due = st === 'late' || st === 'deferred' || st === 'onTrack' || st === 'outsourced' ? materialDueDate(l)?.getTime() : undefined;
    const arrived = parsePlanDate(l.ngay_thuc_te_ve)?.getTime();
    if (l.hexes.some(h => openHex.has(h))) { lineCounts[st]++; lineTotal++; }
    for (const h of l.hexes) {
      const e = perHex[h] ?? (perHex[h] = { byLine: {}, afterNeed: 0, pr: null, needPending: null, needAll: null, due: null, arrived: null });
      e.byLine[st] = (e.byLine[st] ?? 0) + 1;
      if (after) e.afterNeed++;
      e.pr = minT(e.pr, pr);
      e.needAll = minT(e.needAll, need);
      if (pending) e.needPending = minT(e.needPending, need);
      e.due = maxT(e.due, due);
      e.arrived = maxT(e.arrived, arrived);
    }
  }

  const byHex: Record<string, HexBom> = {};
  const counts = Object.fromEntries(BOM_STATES.map(s => [s.key, 0])) as Record<BomState, number>;
  let afterNeed = 0, issueHexes = 0, issueTotal = 0;
  const seen = new Set<string>();
  for (const i of items) {
    if (seen.has(i.hex)) continue;
    seen.add(i.hex);
    // Dòng PR đã HỦY không tính là có vật tư: hạng mục chỉ có dòng hủy xếp như chưa có PR (trước rơi vào
    // "Đã về đủ")
    const e0 = perHex[i.hex];
    const nCancelled = e0?.byLine.cancelled ?? 0;
    const e = e0 && Object.values(e0.byLine).reduce((s, n) => s + (n ?? 0), 0) > nCancelled ? e0 : undefined;
    const nLines = e ? (matCount[i.hex] ?? 0) : 0;
    let state: BomState;
    if (!i.open) state = 'stocked';
    else if (!(nLines > 0) || !e) {
      const beforeSx = i.bucket === 'p002' || i.stage === 'P012';
      state = i.bucket === 'notDeployed' ? 'noneNotDeployed'
        : beforeSx && !nvlDone(i.hex) ? 'noneBeforeSx' : 'noneInSx';
    }
    else state = BOM_ORDER.find(bs => (Object.keys(e.byLine) as MaterialLineState[]).some(k => BOM_FROM_LINE[k] === bs && (e.byLine[k] ?? 0) > 0)) ?? 'ok';
    const lateNeed = state !== 'stocked' && (e?.afterNeed ?? 0) > 0 ? e!.afterNeed : 0;
    if (lateNeed > 0) afterNeed++;
    const issues = materialIssues?.[i.hex] ?? [];
    if (issues.length) { issueHexes++; issueTotal += issues.length; }
    counts[state]++;
    byHex[i.hex] = {
      state, lines: nLines, byLine: e?.byLine ?? {}, afterNeed: lateNeed,
      prDate: toDate(e?.pr ?? null),
      needDate: toDate(e ? (e.needPending ?? e.needAll) : null),
      dueDate: toDate(e?.due ?? null),
      arrivedDate: toDate(e?.arrived ?? null),
      issues,
    };
  }
  return { byHex, counts, lineCounts, lineTotal, afterNeed, issueHexes, issueTotal };
}

// ============================================================================
// VẬT TƯ CHUNG CỦA CÔNG TRÌNH: dòng PR thuộc công trình (trackingno = mã công trình) nhưng KHÔNG ghi
// mã nhà máy => không gắn được hạng mục (~một nửa số dòng vật tư). Phân theo cùng trạng thái dòng PR.
// Kèm danh sách "cần bổ sung mã nhà máy" (dòng còn chờ không mã + dòng ghi sai mã) để xuất cho team PR.
// ============================================================================
export interface ProjectMaterialLine extends MaterialLineFields {
  kind: 'uncoded' | 'badCode';
  bad_reason?: string | null;
  trackingno?: string; ten_cong_trinh?: string;
  ma_nha_may?: string; item_note_pr?: string; so_pr?: unknown; pr_line?: unknown;
  ten_vat_tu?: string; nhom_vt?: string; dvt?: string; ma_vat_tu_sap?: unknown; nguoi_yeu_cau?: string;
  so_luong_da_nhan_sap?: unknown; so_po?: unknown;
}

export interface ProjectMaterialSummary {
  lines: number;                                   // dòng không mã (không tính hủy)
  byState: Record<MaterialLineState, number>;
  badCode: number;                                 // dòng ghi sai mã nhà máy
  toFix: number;                                   // dòng cần bổ sung mã (còn chờ không mã + sai mã)
}

// Còn chờ hàng về (kể cả kho đã báo về, chờ SAP nhập)
const PENDING_STATES: MaterialLineState[] = ['notOrdered', 'gcNotOrdered', 'late', 'outsourced', 'deferred', 'onTrack', 'arrived'];

export function summarizeProjectMaterial(rows: ProjectMaterialLine[] | null, today: number): ProjectMaterialSummary | null {
  if (!rows) return null;
  const byState = Object.fromEntries(LINE_STATES.map(s => [s.key, 0])) as Record<MaterialLineState, number>;
  let lines = 0, badCode = 0, toFix = 0;
  for (const r of rows) {
    // Dòng ghi sai mã: chỉ cần sửa khi còn chờ hàng (đã hủy / đã nhận đủ thì sửa mã không còn ý nghĩa)
    if (r.kind === 'badCode') { badCode++; if (PENDING_STATES.includes(materialLineState(r, today))) toFix++; continue; }
    const st = materialLineState(r, today);
    byState[st]++;
    if (st !== 'cancelled') lines++;
    if (PENDING_STATES.includes(st)) toFix++;
  }
  return { lines, byState, badCode, toFix };
}

// Ô ngày kế hoạch: ngày đang dùng để tính BOT (KH nhập kho tuần → tháng) in đậm, đỏ nếu quá hạn / cam nếu sắp
// hạn; ngày còn lại hiện mờ. Cột "Cần giao" chỉ để tham khảo (không tính hạn).
export const PlanDateCell = ({ i, which }: { i: HexInfo; which: DeadlineSource | 'cần giao' }) => {
  const d = which === 'tuần' ? i.khnkTuan : which === 'tháng' ? i.khnkThang : i.canGiao;
  const used = which !== 'cần giao' && i.deadlineSource === which;
  const met = (which === 'tuần' && i.khnkTuanMet) || (which === 'tháng' && i.khnkThangMet);
  const cls = !d ? 'text-slate-300'
    : !used ? 'text-slate-500'
      : i.overdue ? 'font-semibold text-red-600' : i.dueSoon ? 'font-semibold text-amber-600' : 'font-semibold';
  return (
    <td
      className={`${bang.tdSo} ${cls}`}
      title={!d ? undefined
        : met ? 'Đã nhập đủ SL kế hoạch trong kỳ — không tính trễ theo KH này'
          : used ? 'Ngày đang dùng để tính BOT'
            : which === 'cần giao' ? 'Ngày cần giao — chỉ tham khảo, không tính hạn (BOT chỉ theo KH nhập kho tuần / tháng)'
              : 'Chỉ để tham khảo (ưu tiên KH tuần → KH tháng; KH kỳ đã nhập đủ SL thì bỏ qua)'}
    >
      {d ? fmtDate(d) : '—'}
      {met && <span className="ml-1 text-[0.625rem] font-normal text-emerald-600">✓ đạt</span>}
    </td>
  );
};

// ============================================================================
// Bảng hạng mục dùng chung cho 3 tab
// ============================================================================
// planDates = false: ẩn 3 cột KH tuần / KH tháng / Cần giao (vd. tab BOM dùng ngày của vật tư)
const HexTable = ({ rows, extraHead, extraCells, planDates = true, onHexClick, hexClickTitle, cotKho = false, soCotThem }: {
  rows: HexInfo[];
  extraHead: React.ReactNode;
  extraCells: (i: HexInfo) => React.ReactNode;
  planDates?: boolean;
  onHexClick?: (hex: string) => void;   // bấm mã HEX (vd. tab BOM mở cửa sổ vật tư)
  hexClickTitle?: string;
  /** Hiện 5 cột Kho (bấm từ cột Kho của bảng BOP: tổng cột bằng số vừa bấm) */
  cotKho?: boolean;
  /** Số cột extraHead; có => hiện dòng TỔNG */
  soCotThem?: number;
}) => {
  const coCt = rows.some(i => i.congTrinh);
  const tong = useMemo(() => tongHangMuc(rows), [rows]);
  const COT_KHO: [string, KhoCot][] = [['Đã nhập', 'nk'], ['Đã xuất', 'xk'], ['Tồn kho', 'ton'], ['Chênh', 'chenh'], ['Xuất vượt nhập', 'xv']];
  return (
  <div className={`${bang.khung} max-h-[78vh]`}>
    <table className={bang.table}>
      <thead className={bang.thead}>
        <tr>
          <th className={`${bang.thC} w-14`}>STT</th>
          <th className={bang.thC}>Mã Hex</th>
          {coCt && <th className={bang.thC}>Công trình</th>}
          <th className={bang.thC}>Hạng mục</th>
          <th className={bang.thC}>Công đoạn</th>
          <th className={bang.thC}>Xưởng</th>
          {planDates && <>
            <th className={bang.thC}>KH tuần</th>
            <th className={bang.thC}>KH tháng</th>
            <th className={bang.thC}>Cần giao</th>
          </>}
          <th className={`${bang.thC} whitespace-nowrap`}>Trị giá (tỷ)</th>
          <th className={`${bang.thC} whitespace-nowrap`}>Còn lại (tỷ)</th>
          {cotKho && COT_KHO.map(([t]) => <th key={t} className={`${bang.thC} whitespace-nowrap`}>{t} (tỷ)</th>)}
          {extraHead}
        </tr>
      </thead>
      <tbody>
        {rows.map((i, idx) => {
          const kho = cotKho ? khoCua(i) : null;
          return (
          <tr key={i.hex} className="hover:bg-slate-50">
            <td className={bang.tdSo}>{fmtInt(idx + 1)}</td>
            <td className={`${tdB} whitespace-nowrap font-medium`}>
              {onHexClick && i.hex ? (
                <button
                  type="button"
                  onClick={() => onHexClick(i.hex)}
                  title={hexClickTitle}
                  className="font-medium text-blue-700 hover:underline"
                >
                  {i.hex}
                </button>
              ) : i.hex}
            </td>
            {coCt && <td className={`${tdB} min-w-[180px] max-w-[260px] break-words`} title={i.congTrinh}>{i.congTrinh || '—'}</td>}
            <td className={`${tdB} min-w-[200px] max-w-[320px] break-words`} title={i.hangMuc}>{i.hangMuc}</td>
            <td className={bang.tdSo}>{i.stage ?? '—'}</td>
            <td className={`${tdB} whitespace-nowrap`}>{i.area || '—'}</td>
            {planDates && <>
              <PlanDateCell i={i} which="tuần" />
              <PlanDateCell i={i} which="tháng" />
              <PlanDateCell i={i} which="cần giao" />
            </>}
            <td className={bang.tdSo}>{trong0(i.total, fmtTy)}</td>
            <td className={bang.tdSo}>{trong0(i.remain, fmtTy)}</td>
            {kho && COT_KHO.map(([t, f]) => <td key={t} className={bang.tdSo}>{trong0(kho[f], fmtTy)}</td>)}
            {extraCells(i)}
          </tr>
          );
        })}
        {rows.length === 0 && (
          <tr><td colSpan={22} className="px-3 py-8 text-center text-slate-400">Không có hạng mục phù hợp.</td></tr>
        )}
      </tbody>
      {soCotThem !== undefined && rows.length > 0 && (
        <tfoot className={bang.tfoot}>
          <tr>
            <td className={`${tdB} text-center`}>TỔNG</td>
            <td className={tdB}>{fmtInt(tong.n)}</td>
            <td colSpan={(coCt ? 1 : 0) + 3 + (planDates ? 3 : 0)} className={tdB} />
            <td className={bang.tdSo}>{trong0(tong.total, fmtTy)}</td>
            <td className={bang.tdSo}>{trong0(tong.remain, fmtTy)}</td>
            {cotKho && COT_KHO.map(([t, f]) => <td key={t} className={bang.tdSo}>{trong0(tong[f], fmtTy)}</td>)}
            {soCotThem > 0 && <td colSpan={soCotThem} className={tdB} />}
          </tr>
        </tfoot>
      )}
    </table>
  </div>
);
};
