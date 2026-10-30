import React, { Fragment, useMemo, useState } from 'react';
import { Search, Package, AlertTriangle, Download } from 'lucide-react';
import type { RemainBucket } from '../Dashboard/hooks/usePivotTables';
import type { VuongMacItem } from '../../services/vuongMacService';
import {
  materialLineState, isMaterialPending, materialDueDate, parsePlanDate, dwellBucket, DWELL_STUCK, DWELL_NONE, type DwellKey,
  type DeadlineSource, type MaterialLineState, type MaterialLineFields, type MaterialBase, stageRank,
} from '../../utils/productionMetrics';
import { formatTrieuAsTy } from '../../utils/money';
import { fmtInt, fmtDate, fmtQty, DAY_MS as DAY } from '../../utils/format';
import { parseNvlNeeds, parseNvlStatus, nvlLinePending, NVL_GROUP_LABEL, type NvlRaw } from '../../utils/nvlParse';
import { STEPS, qcStateOf, QC_STATE_META, QC_STATUS_VI, gcnPending, type HexExtra, type StepKey } from '../../services/productionExtraService';
import {
  BOP_GROUP, laKho as laKhoBop, tinhPivotBop, mucCongDoan, fmtGiaTriBop, stageOfBop, tenCotCongDoan,
  type BopMetric, type Kho, type KhoCot,
} from './core/bopPivot';

// ============================================================================
// Tầng 2 của "Tổng quan công trình": 3 tab chi tiết BOT · BOP · BOM.
// Nhận dữ liệu đã chuẩn hoá từ ProjectHealthModal (cùng 1 định nghĩa "còn lại").
// ============================================================================

export interface HexInfo {
  hex: string;
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

/** Số ngày từ ngày nhận PM tới hôm nay (tuổi đơn); null nếu không có ngày */
export const ageDays = (i: HexInfo, today: number): number | null =>
  i.receivedPm ? Math.floor((today - i.receivedPm.getTime()) / DAY) : null;
export type AgeBucket = 'a30' | 'a90' | 'a90p' | 'none';
export const ageBucketOf = (i: HexInfo, today: number): AgeBucket => {
  const d = ageDays(i, today);
  if (d === null) return 'none';
  return d <= 30 ? 'a30' : d <= 90 ? 'a90' : 'a90p';
};
export const AGE_BUCKETS: { key: AgeBucket; label: string; tone: 'slate' | 'amber' | 'red' }[] = [
  { key: 'a30', label: '≤ 30 ngày', tone: 'slate' },
  { key: 'a90', label: '31–90 ngày', tone: 'amber' },
  { key: 'a90p', label: '> 90 ngày', tone: 'red' },
];

export interface MaterialLine extends MaterialLineFields {
  hexes: string[];
}

// Tỷ đồng: luôn 2 chữ số thập phân — thống nhất với Báo cáo tiến độ
const fmtTy = (trieu: number) => formatTrieuAsTy(trieu);

const th = 'px-3 py-2 font-medium';
// Bảng pivot BOT / BOP: kẻ ô, tiêu đề xanh, dòng TỔNG vàng chữ đỏ — đồng bộ với 2 bảng BOP-M2 của tab BOM
const thX = 'border border-slate-300 px-3 py-2 font-bold';
const tdX = 'border border-slate-300 px-3 py-2';
const td = 'px-3 py-2';

const Chip = ({ active, onClick, children, tone = 'slate' }: {
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
// BOT — CHỈ KH nhập kho tuần → KH nhập kho tháng (ngày cần giao / ngày cần PM / BOT dự án chỉ tham khảo)
// ============================================================================
type BotGroup = 'overdue' | 'd14' | 'd30' | 'later' | 'none';
const BOT_GROUPS: { key: BotGroup; label: string; tone: 'red' | 'amber' | 'slate'; hint: string }[] = [
  { key: 'overdue', label: 'Quá hạn KH', tone: 'red', hint: 'Đã qua ngày KH nhập kho tuần / tháng mà chưa nhập kho đủ (KH kỳ đã nhập đủ SL thì không tính)' },
  { key: 'd14', label: '≤ 14 ngày', tone: 'amber', hint: 'Hạn trong 14 ngày tới' },
  { key: 'd30', label: '15–30 ngày', tone: 'amber', hint: 'Hạn trong 15–30 ngày tới' },
  { key: 'later', label: 'Sau 30 ngày', tone: 'slate', hint: 'Hạn sau 30 ngày' },
  { key: 'none', label: 'Chưa có KH nhập kho', tone: 'slate', hint: 'Không có KH nhập kho tuần / tháng (hoặc KH kỳ đã nhập đủ SL mà hạng mục chưa nhập kho đủ)' },
];

// Tab BOT xếp hạn theo NGÀY CẦN (PM): mốc duy nhất có ở gần như mọi hạng mục (KH nhập kho tuần / tháng thường chỉ
// có ở vài % hạng mục). Quy tắc hạn của các trang khác (KH nhập kho tuần → tháng) giữ nguyên.
type PmGroup = 'qua' | 'd14' | 'd30' | 'sau' | 'none';
const PM_GROUPS: { key: PmGroup; label: string; tone: 'red' | 'amber' | 'slate'; hint: string }[] = [
  { key: 'qua', label: 'Đã qua ngày cần', tone: 'red', hint: 'Đã qua Ngày cần (PM) mà chưa nhập kho đủ' },
  { key: 'd14', label: 'Cần trong ≤ 14 ngày', tone: 'amber', hint: 'Ngày cần (PM) trong 14 ngày tới' },
  { key: 'd30', label: 'Cần trong 15–30 ngày', tone: 'amber', hint: 'Ngày cần (PM) trong 15–30 ngày tới' },
  { key: 'sau', label: 'Cần sau 30 ngày', tone: 'slate', hint: 'Ngày cần (PM) sau 30 ngày' },
  { key: 'none', label: 'Chưa có ngày cần', tone: 'slate', hint: 'Hạng mục chưa có Ngày cần (PM)' },
];
// Hạng mục đang ở đâu: chưa triển khai bản vẽ (P001) / chưa tính phiếu (P002) / đã lên chuyền (từ P012, gồm nhập kho chưa đủ)
type GiaiDoan = 'p001' | 'p002' | 'line';
const GIAI_DOAN: { key: GiaiDoan; label: string }[] = [
  { key: 'p001', label: 'chưa triển khai' },
  { key: 'p002', label: 'chưa tính phiếu' },
  { key: 'line', label: 'trên chuyền' },
];
const giaiDoanOf = (i: HexInfo): GiaiDoan => (i.bucket === 'notDeployed' ? 'p001' : i.bucket === 'p002' ? 'p002' : 'line');

// Mốc tham khảo (không tính hạn): hạng mục chưa nhập kho đủ đã qua ngày cần giao / BOT dự án / ngày cần (PM)
type RefKey = 'canGiao' | 'botDuAn' | 'canPm';
const REF_DEADLINES: { key: RefKey; label: string; hint: string; of: (i: HexInfo) => Date | null | undefined }[] = [
  { key: 'canGiao', label: 'Qua ngày cần giao', hint: 'Đã qua Ngày cần giao mà chưa nhập kho đủ (tham khảo — hạn chính thức là KH nhập kho tuần / tháng)', of: i => i.canGiao },
  { key: 'botDuAn', label: 'Qua BOT dự án', hint: 'Đã qua BOT dự án (hạn chung của công trình) mà chưa nhập kho đủ (tham khảo)', of: i => i.botDuAn },
  { key: 'canPm', label: 'Qua ngày cần (PM)', hint: 'Đã qua Ngày cần do PM ghi mà chưa nhập kho đủ (tham khảo)', of: i => i.canPm },
];

export const BotTab = ({ items, today, openIssues, onHexClick }: {
  items: HexInfo[]; today: number; openIssues: Record<string, number> | null; onHexClick?: (hex: string) => void;
}) => {
  // 'planAfterDue' = KH nhập kho sau ngày cần giao
  const [group, setGroup] = useState<BotGroup | 'all' | 'planAfterDue'>('all');
  const [month, setMonth] = useState<string | null>(null); // 'YYYY-MM' hoặc '~' (chưa có ngày)
  const [q, setQ] = useState('');
  // Lọc theo Ngày cần (PM) × giai đoạn (thẻ chính), mốc tham khảo (ngày cần giao), tuổi đơn
  const [pmSel, setPmSel] = useState<{ g: PmGroup; gd?: GiaiDoan } | null>(null);
  const [ref, setRef] = useState<RefKey | null>(null);
  const [age, setAge] = useState<AgeBucket | null>(null);
  // Bảng Nhóm sản phẩm × Ngày cần (PM): số đo + ô đang chọn (ngày 'YYYY-MM-DD' / '~' = chưa có KH; thiếu khoá = mọi giá trị)
  const [botMetric, setBotMetric] = useState<'count' | 'remain'>('remain');
  type OBot = { day?: string; nsp?: string; xuong?: string };
  const [cellSel, setCellSel] = useState<OBot | null>(null);
  const [moNspBot, setMoNspBot] = useState<Set<string>>(new Set());
  // Các tháng trước tháng hiện tại gộp 1 cột "Trước …" — bấm để mở ra từng ngày
  const [moThangCu, setMoThangCu] = useState(false);

  const open = useMemo(() => items.filter(i => i.open), [items]);
  const pastRef = (i: HexInfo, k: RefKey) => { const d = REF_DEADLINES.find(r => r.key === k)!.of(i); return !!d && d.getTime() < today; };
  const refCounts = useMemo(() => {
    const c: Record<RefKey, number> = { canGiao: 0, botDuAn: 0, canPm: 0 };
    open.forEach(i => REF_DEADLINES.forEach(r => { if (pastRef(i, r.key)) c[r.key]++; }));
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, today]);
  const ageCounts = useMemo(() => {
    const c: Record<AgeBucket, { n: number; remain: number }> = { a30: { n: 0, remain: 0 }, a90: { n: 0, remain: 0 }, a90p: { n: 0, remain: 0 }, none: { n: 0, remain: 0 } };
    open.forEach(i => { const b = ageBucketOf(i, today); c[b].n++; c[b].remain += i.remain; });
    return c;
  }, [open, today]);
  const hasAge = ageCounts.none.n < open.length;
  const monthOf = (i: HexInfo) =>
    i.canPm ? `${i.canPm.getFullYear()}-${String(i.canPm.getMonth() + 1).padStart(2, '0')}` : '~';
  const monthLabel = (k: string) => (k === '~' ? 'Chưa có ngày cần' : `${k.slice(5)}/${k.slice(0, 4)}`);
  const pmDays = (i: HexInfo) => (i.canPm ? Math.floor((i.canPm.getTime() - today) / DAY) : null);
  const pmGroupOf = (i: HexInfo): PmGroup => {
    const d = pmDays(i);
    if (d === null) return 'none';
    if (d < 0) return 'qua';
    if (d <= 14) return 'd14';
    if (d <= 30) return 'd30';
    return 'sau';
  };
  // Thẻ chính: số hạng mục / còn lại theo nhóm ngày cần, tách theo giai đoạn
  const pmCounts = useMemo(() => {
    const z = () => ({ n: 0, remain: 0, gd: { p001: 0, p002: 0, line: 0 } as Record<GiaiDoan, number> });
    const c = Object.fromEntries(PM_GROUPS.map(g => [g.key, z()])) as Record<PmGroup, ReturnType<typeof z>>;
    open.forEach(i => { const e = c[pmGroupOf(i)]; e.n++; e.remain += i.remain; e.gd[giaiDoanOf(i)]++; });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, today]);
  // Có ghi KH nhập kho tuần / tháng (kể cả KH kỳ đã nhập đủ SL — những hạng mục đó không còn tính hạn KH)
  const coKh = useMemo(() => open.filter(i => i.khnkTuan || i.khnkThang).length, [open]);
  const groupOf = (i: HexInfo): BotGroup => {
    if (!i.deadline) return 'none';
    const days = Math.floor((i.deadline.getTime() - today) / DAY);
    if (days < 0) return 'overdue';
    if (days <= 14) return 'd14';
    if (days <= 30) return 'd30';
    return 'later';
  };
  const inGroup = (i: HexInfo) =>
    group === 'all' ? true
      : group === 'planAfterDue' ? !!i.planAfterDue
        : groupOf(i) === group;
  const counts = useMemo(() => {
    const c = Object.fromEntries(BOT_GROUPS.map(g => [g.key, { n: 0, remain: 0 }])) as Record<BotGroup, { n: number; remain: number }>;
    open.forEach(i => { const g = groupOf(i); c[g].n++; c[g].remain += i.remain; });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, today]);
  // KH nhập kho sau ngày cần giao
  const extra = useMemo(() => ({
    planAfterDue: open.filter(i => i.planAfterDue).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [open, today]);

  // Nhóm sản phẩm × Ngày cần (PM): hạng mục chưa nhập kho đủ, sản phẩm nào cần ngày nào
  const dayOf = (i: HexInfo) =>
    i.canPm ? `${i.canPm.getFullYear()}-${String(i.canPm.getMonth() + 1).padStart(2, '0')}-${String(i.canPm.getDate()).padStart(2, '0')}` : '~';
  const nspOf = (i: HexInfo) => i.nhomSp || '(Chưa có nhóm)';
  const CU = '<';
  const thangNay = (() => { const t = new Date(today); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`; })();
  const cotOf = (i: HexInfo) => { const d = dayOf(i); return !moThangCu && d !== '~' && d.slice(0, 7) < thangNay ? CU : d; };
  const botVal = (i: HexInfo) => (botMetric === 'count' ? 1 : i.remain);
  const fmtB = (v: number) => (botMetric === 'count' ? fmtInt(v) : fmtTy(v));
  const plan = useMemo(() => {
    const rowsM = new Map<string, DongNsp>();
    const colTot: Record<string, number> = {};
    const colOver: Record<string, boolean> = {};
    let grand = 0;
    for (const i of open) {
      const v = botVal(i), d = cotOf(i);
      congDong(rowsM, nspOf(i), xuongOf(i), d, v);
      colTot[d] = (colTot[d] ?? 0) + v;
      if (pmGroupOf(i) === 'qua') colOver[d] = true;
      grand += v;
    }
    const days = Object.keys(colTot).sort((x, y) => (x === '~' ? 1 : y === '~' ? -1 : x === CU ? -1 : y === CU ? 1 : x.localeCompare(y)));
    // Số tháng cũ đang gộp (để ghi trên nút)
    const soThangCu = new Set(open.map(dayOf).filter(d => d !== '~' && d.slice(0, 7) < thangNay).map(d => d.slice(0, 7))).size;
    // Dải tháng trên đầu cột
    const months: { key: string; days: string[] }[] = [];
    for (const d of days) {
      const m = d === '~' || d === CU ? d : d.slice(0, 7);
      const last = months[months.length - 1];
      if (last && last.key === m) last.days.push(d); else months.push({ key: m, days: [d] });
    }
    const rows = [...rowsM.entries()].map(([nsp, row]) => ({ nsp, ...row, xs: [...row.xs.entries()].sort((a, b) => sapXuong(a[0], b[0])) }))
      .sort((x, y) => (x.nsp === '(Chưa có nhóm)' ? 1 : y.nsp === '(Chưa có nhóm)' ? -1 : x.nsp.localeCompare(y.nsp, 'vi', { numeric: true })));
    return { days, months, rows, colTot, colOver, grand, soThangCu };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, botMetric, today, moThangCu]);
  const dayLabel = (d: string) => (d === '~' ? 'Chưa có ngày cần' : `${d.slice(8)}/${d.slice(5, 7)}`);
  const sameSel = (a: OBot) => !!cellSel && cellSel.day === a.day && cellSel.nsp === a.nsp && cellSel.xuong === a.xuong;
  const pickCell = (a: OBot) => setCellSel(sameSel(a) ? null : a);
  const planCell = (v: number | undefined, a: OBot, cls = '') => (
    <td onClick={v ? () => pickCell(a) : undefined}
      className={`${tdX} whitespace-nowrap text-right tabular-nums ${v ? 'cursor-pointer hover:bg-amber-50' : 'text-slate-300'} ${sameSel(a) ? 'bg-amber-100 font-semibold' : ''} ${cls}`}>
      {v ? fmtB(v) : ''}
    </td>
  );

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return open
      .filter(i => inGroup(i) && (month === null || monthOf(i) === month) && matchQ(i, ql))
      .filter(i => !cellSel || ((cellSel.day === undefined || cotOf(i) === cellSel.day) && (cellSel.nsp === undefined || nspOf(i) === cellSel.nsp) && (cellSel.xuong === undefined || xuongOf(i) === cellSel.xuong)))
      .filter(i => ref === null || pastRef(i, ref))
      .filter(i => age === null || ageBucketOf(i, today) === age)
      .filter(i => !pmSel || (pmGroupOf(i) === pmSel.g && (pmSel.gd === undefined || giaiDoanOf(i) === pmSel.gd)))
      .sort((a, b) => (a.canPm?.getTime() ?? Infinity) - (b.canPm?.getTime() ?? Infinity) || b.remain - a.remain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group, month, q, today, ref, age, cellSel, pmSel]);
  const pickPm = (g: PmGroup, gd?: GiaiDoan) =>
    setPmSel(cur => (cur && cur.g === g && cur.gd === gd ? null : { g, gd }));

  return (
    <div className="space-y-4">
      {/* Thẻ chính: theo Ngày cần (PM), tách sẵn hạng mục đang ở đâu */}
      <div className={`grid gap-2 sm:grid-cols-2 ${pmCounts.none.n ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
        {PM_GROUPS.filter(g => g.key !== 'none' || pmCounts.none.n > 0).map(g => {
          const c = pmCounts[g.key];
          const on = pmSel?.g === g.key;
          const mau = c.n && g.tone === 'red' ? 'text-red-600' : c.n && g.tone === 'amber' ? 'text-amber-600' : 'text-slate-900';
          return (
            <div key={g.key} className={`rounded-lg border px-3 py-2 transition ${on ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200 hover:border-slate-400'}`}>
              <button type="button" title={`${g.hint} — bấm để lọc danh sách`} onClick={() => pickPm(g.key)} className="block w-full text-left">
                <p className="text-[0.6875rem] text-slate-500">{g.label}</p>
                <p className={`text-xl font-semibold tabular-nums ${mau}`}>
                  {fmtInt(c.n)} <span className="text-xs font-normal text-slate-400">hạng mục · {fmtTy(c.remain)} tỷ chưa nhập</span>
                </p>
              </button>
              {c.n > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[0.6875rem]">
                  {GIAI_DOAN.filter(d => c.gd[d.key] > 0).map(d => (
                    <button key={d.key} type="button" onClick={() => pickPm(g.key, d.key)} title={`Lọc: ${g.label} · ${d.label}`}
                      className={`rounded px-1 hover:bg-amber-50 hover:underline ${pmSel?.g === g.key && pmSel.gd === d.key ? 'bg-amber-100 font-semibold text-slate-900' : d.key === 'p001' && g.key === 'qua' ? 'font-semibold text-red-600' : 'text-slate-600'}`}>
                      {fmtInt(c.gd[d.key])} {d.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* KH nhập kho (hạn chính thức của các trang khác) + ngày cần giao + tuổi đơn: 1 dòng gọn */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs">
        <span className="font-semibold text-slate-700" title="KH nhập kho tuần → tháng — hạn chính thức ở các trang khác">KH nhập kho:</span>
        <span className="text-slate-600">{fmtInt(coKh)}/{fmtInt(open.length)} hạng mục có KH ({open.length ? ((coKh / open.length) * 100).toFixed(1) : '0'}%)</span>
        {BOT_GROUPS.filter(g => g.key !== 'none' && counts[g.key].n > 0).map(g => (
          <span key={g.key} title={g.hint}>
            <Chip active={group === g.key} tone={g.tone === 'red' ? 'red' : g.tone === 'amber' ? 'amber' : 'slate'} onClick={() => setGroup(group === g.key ? 'all' : g.key)}>
              {g.label} ({fmtInt(counts[g.key].n)})
            </Chip>
          </span>
        ))}
        {extra.planAfterDue > 0 && (
          <span title="KH nhập kho tuần / tháng đang dùng muộn hơn ngày cần giao — biết trước sẽ giao trễ, cần xem lại KH hoặc báo PM">
            <Chip active={group === 'planAfterDue'} tone="amber" onClick={() => setGroup(group === 'planAfterDue' ? 'all' : 'planAfterDue')}>
              <AlertTriangle size={11} className="-mt-0.5 mr-1 inline" />KH sau ngày cần giao ({fmtInt(extra.planAfterDue)})
            </Chip>
          </span>
        )}
        {refCounts.canGiao > 0 && (
          <span title={REF_DEADLINES.find(x => x.key === 'canGiao')!.hint}>
            <Chip active={ref === 'canGiao'} tone="red" onClick={() => setRef(ref === 'canGiao' ? null : 'canGiao')}>Qua ngày cần giao ({fmtInt(refCounts.canGiao)})</Chip>
          </span>
        )}
        {hasAge && (
          <>
            <span className="ml-2 font-semibold text-slate-700" title="Số ngày từ ngày nhận PM tới nay, hạng mục chưa nhập kho đủ">Tuổi đơn:</span>
            {AGE_BUCKETS.map(b => (
              <span key={b.key} title={`${fmtTy(ageCounts[b.key].remain)} tỷ chưa nhập kho`}>
                <Chip active={age === b.key} tone={ageCounts[b.key].n ? b.tone : 'slate'} onClick={() => setAge(age === b.key ? null : b.key)}>
                  {b.label} ({fmtInt(ageCounts[b.key].n)})
                </Chip>
              </span>
            ))}
          </>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold text-slate-700">
            Nhóm sản phẩm × Ngày cần (PM){' '}
            <span className="font-normal text-slate-500">· hạng mục chưa nhập kho đủ · ngày đỏ = đã qua · bấm số, tên nhóm, ngày hoặc tháng để lọc danh sách</span>
          </p>
          <div className="ml-auto flex gap-1">
            <Chip active={botMetric === 'count'} onClick={() => setBotMetric('count')}>Số hạng mục</Chip>
            <Chip active={botMetric === 'remain'} onClick={() => setBotMetric('remain')}>Còn lại (tỷ)</Chip>
          </div>
        </div>
        <div className="max-h-[60vh] overflow-auto custom-scrollbar">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-emerald-300 text-slate-900">
              <tr>
                <th className={`${thX} sticky left-0 z-20 w-px whitespace-nowrap bg-emerald-300 text-left`} rowSpan={2}>
                  Nhóm sản phẩm / xưởng
                  <NutMoTatCa onMo={() => setMoNspBot(new Set(plan.rows.map(x => x.nsp)))} onThu={() => setMoNspBot(new Set())} />
                </th>
                {plan.months.map(m => (m.key === CU ? (
                  // Cột gộp tháng cũ: 1 ô cao 2 dòng, gọn
                  <th key={m.key} rowSpan={2} className={`${thX} w-px whitespace-nowrap border-l border-slate-200 text-right align-bottom`}>
                    <button type="button" onClick={() => { setMoThangCu(true); setCellSel(null); }}
                      title={`Mở ra từng ngày của ${plan.soThangCu} tháng trước ${monthLabel(thangNay)}`}
                      className="block w-full rounded px-1 text-[0.625rem] font-normal text-slate-400 hover:bg-amber-50 hover:text-slate-700">▸ {plan.soThangCu} tháng</button>
                    <button type="button" onClick={() => pickCell({ day: CU })} title={`Lọc danh sách: ngày cần trước ${monthLabel(thangNay)} (đã qua)`}
                      className={`rounded px-1 font-semibold hover:bg-amber-50 ${sameSel({ day: CU }) ? 'bg-amber-100 text-slate-900' : 'text-red-600'}`}>
                      Trước {thangNay.slice(5)}/{thangNay.slice(2, 4)}
                    </button>
                  </th>
                ) : (
                  <th key={m.key} colSpan={m.days.length} className={`${thX} border-l border-slate-200 text-center`}>
                    {m.key === '~' ? '' : (
                      <button type="button" onClick={() => { setMonth(month === m.key ? null : m.key); setGroup('all'); }} title="Lọc danh sách theo tháng này"
                        className={`rounded px-1 font-semibold hover:bg-amber-50 hover:text-slate-900 ${month === m.key ? 'bg-amber-100 text-slate-900' : 'text-slate-700'}`}>
                        Tháng {monthLabel(m.key)}
                      </button>
                    )}
                    {moThangCu && m.key < thangNay && m.key !== '~' && m === plan.months[0] && (
                      <button type="button" onClick={() => { setMoThangCu(false); setCellSel(null); }} title="Gộp lại các tháng trước tháng hiện tại"
                        className="ml-1 rounded border border-slate-300 px-1 text-[0.625rem] text-slate-500 hover:bg-white">◂ gộp</button>
                    )}
                  </th>
                )))}
                <th className={`${thX} text-center`} rowSpan={2}>TỔNG</th>
              </tr>
              <tr>
                {plan.months.filter(m => m.key !== CU).map(m => m.days.map((d, di) => (
                  <th key={d} className={`${thX} whitespace-nowrap text-right ${di === 0 ? 'border-l border-slate-200' : ''}`}>
                    <button type="button" onClick={() => pickCell({ day: d })} title={d === '~' ? 'Hạng mục chưa có Ngày cần (PM)' : `Lọc danh sách: ngày cần ${dayLabel(d)}${plan.colOver[d] ? ' · đã qua' : ''}`}
                      className={`rounded px-1 font-semibold hover:bg-amber-50 ${sameSel({ day: d }) ? 'bg-amber-100 text-slate-900' : plan.colOver[d] ? 'text-red-600' : 'text-slate-700'}`}>
                      {dayLabel(d)}
                    </button>
                  </th>
                )))}
              </tr>
            </thead>
            <tbody>
              {plan.rows.map(row => (
                <React.Fragment key={row.nsp}>
                <tr className="hover:bg-slate-50/60">
                  <td className={`${tdX} sticky left-0 whitespace-nowrap bg-white`}>
                    <button type="button" onClick={() => setMoNspBot(prev => { const n = new Set(prev); if (n.has(row.nsp)) n.delete(row.nsp); else n.add(row.nsp); return n; })}
                      title="Xem theo xưởng" className="inline-block w-4 text-slate-400 hover:text-slate-900">{moNspBot.has(row.nsp) ? '▾' : '▸'}</button>
                    <button type="button" onClick={() => pickCell({ nsp: row.nsp })} title={`Lọc danh sách: ${row.nsp} (${fmtInt(row.n)} hạng mục)`}
                      className={`max-w-[16rem] truncate whitespace-nowrap rounded px-1 text-left font-medium hover:bg-amber-50 hover:underline ${sameSel({ nsp: row.nsp }) ? 'bg-amber-100 text-slate-900' : 'text-slate-800'}`}>
                      {row.nsp}
                    </button>
                  </td>
                  {plan.months.map(m => m.days.map((d, di) => (
                    <React.Fragment key={d}>{planCell(row.cells[d], { day: d, nsp: row.nsp }, di === 0 ? 'border-l border-slate-100' : '')}</React.Fragment>
                  )))}
                  {planCell(row.total, { nsp: row.nsp }, 'font-bold text-slate-900')}
                </tr>
                {moNspBot.has(row.nsp) && row.xs.map(([x, xr]) => (
                  <tr key={x} className="bg-slate-50/40 text-slate-600">
                    <td className={`${tdX} sticky left-0 whitespace-nowrap bg-slate-50 pl-9`}>
                      <button type="button" onClick={() => pickCell({ nsp: row.nsp, xuong: x })} title={`Lọc danh sách: ${row.nsp} · ${x}`}
                        className={`rounded px-1 hover:bg-amber-50 hover:underline ${sameSel({ nsp: row.nsp, xuong: x }) ? 'bg-amber-100 font-semibold text-slate-900' : ''}`}>{x}</button>
                    </td>
                    {plan.months.map(m => m.days.map((d, di) => (
                      <React.Fragment key={d}>{planCell(xr.cells[d], { day: d, nsp: row.nsp, xuong: x }, di === 0 ? 'border-l border-slate-100' : '')}</React.Fragment>
                    )))}
                    {planCell(xr.total, { nsp: row.nsp, xuong: x }, 'font-semibold')}
                  </tr>
                ))}
                </React.Fragment>
              ))}
              {plan.rows.length === 0 && (
                <tr><td colSpan={plan.days.length + 2} className="px-3 py-6 text-center text-slate-400">Không còn hạng mục chưa nhập kho đủ.</td></tr>
              )}
            </tbody>
            {plan.rows.length > 0 && (
              <tfoot className="sticky bottom-0 bg-yellow-300 font-bold text-red-600">
                <tr>
                  <td className={`${tdX} sticky left-0 bg-yellow-300 text-center`}>TỔNG</td>
                  {plan.months.map(m => m.days.map((d, di) => (
                    <td key={d} className={`${tdX} whitespace-nowrap text-right tabular-nums ${di === 0 ? 'border-l border-slate-200' : ''}`}>{fmtB(plan.colTot[d] ?? 0)}</td>
                  )))}
                  <td className={`${tdX} border-l border-slate-200 text-right tabular-nums`}>{fmtB(plan.grand)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {(pmSel || group !== 'all' || month !== null || cellSel || ref !== null || age !== null) ? (
      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold text-slate-700">Hạng mục chưa nhập kho đủ</p>
          <span className="text-[0.6875rem] text-slate-500">
            {fmtInt(list.length)} hạng mục · sắp theo ngày cần (PM)
          </span>
          {pmSel && <Chip active tone="red" onClick={() => setPmSel(null)}>{[PM_GROUPS.find(g => g.key === pmSel.g)?.label, GIAI_DOAN.find(d => d.key === pmSel.gd)?.label].filter(Boolean).join(' · ')} ✕</Chip>}
          {group !== 'all' && <Chip active tone="amber" onClick={() => setGroup('all')}>KH: {group === 'planAfterDue' ? 'sau ngày cần giao' : BOT_GROUPS.find(g => g.key === group)?.label} ✕</Chip>}
          {month !== null && <Chip active onClick={() => setMonth(null)}>Tháng {monthLabel(month)} ✕</Chip>}
          {cellSel && <Chip active onClick={() => setCellSel(null)}>{[cellSel.nsp, cellSel.xuong, cellSel.day && (cellSel.day === CU ? `Trước ${monthLabel(thangNay)}` : dayLabel(cellSel.day))].filter(Boolean).join(' · ')} ✕</Chip>}
          {ref !== null && <Chip active tone="red" onClick={() => setRef(null)}>{REF_DEADLINES.find(r => r.key === ref)?.label} ✕</Chip>}
          {age !== null && <Chip active onClick={() => setAge(null)}>Tuổi {AGE_BUCKETS.find(b => b.key === age)?.label} ✕</Chip>}
          <button type="button" onClick={() => { setPmSel(null); setGroup('all'); setMonth(null); setCellSel(null); setRef(null); setAge(null); }} className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100">Đóng ✕</button>
          <div className="ml-auto"><SearchBox value={q} onChange={setQ} placeholder="Tìm hex, hạng mục, công đoạn..." /></div>
        </div>
        <HexTable
          rows={list}
          onHexClick={onHexClick}
          hexClickTitle="Xem chi tiết hạng mục (BOP × BOT)"
          extraHead={<>
            <th className={`${th} text-left`} title="Ngày cần do PM ghi">Ngày cần (PM)</th>
            <th className={`${th} text-right`} title="Số ngày tới ngày cần (âm = đã qua)">Số ngày</th>
            <th className={`${th} text-left`} title="BOT dự án — hạn chung của công trình (tham khảo)">BOT dự án</th>
            <th className={`${th} text-right`}>Vướng mắc</th>
          </>}
          extraCells={i => {
            const days = pmDays(i);
            const vm = openIssues?.[i.hex] ?? 0;
            const pastDa = !!i.botDuAn && i.botDuAn.getTime() < today;
            return (
              <>
                <td className={`${td} whitespace-nowrap tabular-nums ${days !== null && days < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                  {fmtDate(i.canPm ?? null)}
                  {i.planAfterDue && <span className="ml-1 rounded bg-amber-100 px-1 text-[0.625rem] font-semibold text-amber-800" title="KH nhập kho muộn hơn ngày cần giao">sau cần giao</span>}
                </td>
                <td className={`${td} text-right tabular-nums ${days !== null && days < 0 ? 'font-semibold text-red-600' : days !== null && days <= 14 ? 'text-amber-600' : 'text-slate-500'}`}>
                  {days === null ? '—' : days}
                </td>
                <td className={`${td} whitespace-nowrap tabular-nums ${!i.botDuAn ? 'text-slate-300' : pastDa ? 'text-red-600' : 'text-slate-500'}`}>{fmtDate(i.botDuAn ?? null)}</td>
                <td className={`${td} text-right tabular-nums ${vm ? 'font-semibold text-red-600' : 'text-slate-300'}`}>{openIssues === null ? '…' : vm || '—'}</td>
              </>
            );
          }}
        />
      </div>
      ) : <p className="text-[0.6875rem] text-slate-400">Bấm vào một số trong bảng (hoặc thẻ / tên nhóm / ngày) để xem danh sách hạng mục.</p>}
    </div>
  );
};

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
type DongGop = { cells: Record<string, number>; total: number; n: number };
/** Dòng nhóm sản phẩm của bảng BOT / BOP: tổng + tách theo xưởng (mở ▸ để xem) */
type DongNsp = DongGop & { xs: Map<string, DongGop> };
const congDong = (m: Map<string, DongNsp>, nsp: string, xuong: string, cot: string, v: number) => {
  const d: DongNsp = m.get(nsp) ?? { cells: {}, total: 0, n: 0, xs: new Map() };
  d.cells[cot] = (d.cells[cot] ?? 0) + v; d.total += v; d.n++;
  const x: DongGop = d.xs.get(xuong) ?? { cells: {}, total: 0, n: 0 };
  x.cells[cot] = (x.cells[cot] ?? 0) + v; x.total += v; x.n++;
  d.xs.set(xuong, x);
  m.set(nsp, d);
};
const NutMoTatCa = ({ onMo, onThu }: { onMo: () => void; onThu: () => void }) => (
  <span className="ml-1.5 inline-flex gap-1 align-middle">
    <button type="button" title="Mở xưởng của mọi nhóm" onClick={onMo} className="rounded border border-slate-300 px-1 leading-4 hover:bg-white">+</button>
    <button type="button" title="Thu gọn tất cả" onClick={onThu} className="rounded border border-slate-300 px-1 leading-4 hover:bg-white">−</button>
  </span>
);
// Ô đang chọn ở bảng Nhóm sản phẩm × Công đoạn (thiếu khoá = mọi giá trị)
type BopSel = { stage?: string; nsp?: string; xuong?: string; kho?: KhoCot } | null;
// Lọc từ biểu đồ thời gian ở công đoạn (cộng thêm vào lọc của bảng)
type DwellSel = { stage: string; dwell: string } | null;

// Lọc thêm từ 3 khối sản lượng công đoạn / QC / gia công ngoài
type ExtraSel = { kind: 'step'; key: StepKey } | { kind: 'qc'; st: 'bad' | 'wait' | 'ok' | 'none' } | { kind: 'gcn'; st: string | 'pending' } | null;
const GCN_DONE = (st: string | null) => !gcnPending(st);

export const BopTab = ({ items, khoItems = items, onHexClick, extra }: {
  items: HexInfo[]; onHexClick?: (hex: string) => void;
  /** Hạng mục tính phần Kho (lũy kế): mọi hạng mục không hủy của công trình, không theo bộ lọc IPO */
  khoItems?: HexInfo[];
  /** Thông tin thêm theo HEX (số lượng theo công đoạn SX, QC, gia công ngoài); null = đang tải */
  extra?: Record<string, HexExtra> | null;
  today?: number;
}) => {
  const [metric, setMetric] = useState<BopMetric>('count');
  const [moNsp, setMoNsp] = useState<Set<string>>(new Set());
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

  const pivot = useMemo(() => {
    // Khoá dòng: nhóm sản phẩm, và nhóm sản phẩm + xưởng (dòng con mở ▸)
    const p = tinhPivotBop(items, khoItems, metric, i => [nspOf(i), `${nspOf(i)}\u0000${xuongOf(i)}`]);
    const rowsM = new Map<string, DongNsp>();
    for (const [k, d] of p.dong) {
      const [nsp, x] = k.split('\u0000');
      const r: DongNsp = rowsM.get(nsp) ?? { cells: {}, total: 0, n: 0, xs: new Map() };
      if (x === undefined) Object.assign(r, d); else r.xs.set(x, d);
      rowsM.set(nsp, r);
    }
    const rows = [...rowsM.entries()]
      .map(([nsp, r]) => ({ nsp, ...r, xs: [...r.xs.entries()].sort((a, b) => sapXuong(a[0], b[0])) }))
      .sort((x, y) => (x.nsp === NO_NSP ? 1 : y.nsp === NO_NSP ? -1 : x.nsp.localeCompare(y.nsp, 'vi', { numeric: true })));
    return { stages: p.stages, groups: p.groups, rows, colTot: p.colTot, colN: p.colN, grand: p.grand, kho: p.kho, khoTot: p.khoTot };
  }, [items, khoItems, metric]);
  // Bấm ô kho => lọc danh sách đúng các hạng mục làm nên số đó
  const khoCells = (k: Kho | undefined, base: { nsp?: string; xuong?: string }, cls = '') => (['nk', 'xk', 'ton', 'chenh'] as const).map((f, idx) => {
    const next = { ...base, kho: f };
    return (
      <td key={f} onClick={k?.[f] ? () => pick(next) : undefined}
        className={`${tdX} whitespace-nowrap text-right tabular-nums ${idx === 0 ? 'border-l-2 border-slate-300' : ''} ${k?.[f] ? `cursor-pointer hover:bg-amber-50 ${f === 'ton' ? 'font-semibold text-slate-900' : f === 'chenh' ? (metric === 'count' || (k?.chenh ?? 0) >= 5 ? 'text-orange-600' : 'text-slate-400') : ''}` : 'text-slate-300'} ${isSel(next) ? 'bg-amber-100 font-semibold' : ''} ${cls}`}>
        {k?.[f] ? fmtV(k[f]) : ''}
      </td>
    );
  });

  // Ô đang chọn ở bảng Nhóm sản phẩm × Công đoạn
  const matchSel = (i: HexInfo) => !sel || (
    (sel.stage === undefined || stageOf(i) === sel.stage)
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
    // Cùng tập hạng mục với bảng Công đoạn × Khu vực (bấm ô nào thì danh sách khớp đúng số của ô đó); lọc theo thẻ
    // QC / gia công ngoài / bước SX thì dùng tập hạng mục còn theo dõi như số đếm trên thẻ
    return (sel?.kho ? khoItems : extraSel ? open : pivotItems)
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
    ...(sel ? [sel.nsp, sel.xuong, sel.stage, sel.kho && ({ nk: 'Đã nhập kho', xk: 'Đã xuất kho', ton: 'Tồn kho', chenh: 'Chênh kho' })[sel.kho]] : []),
    ...(dwellSel ? [...(sel?.stage ? [] : [dwellSel.stage]), DWELL.find(d => d.key === dwellSel.dwell)?.label] : []),
    extraText,
  ].filter(Boolean).join(' · ');
  const toggleExtra = (next: NonNullable<ExtraSel>) =>
    setExtraSel(cur => (cur && JSON.stringify(cur) === JSON.stringify(next) ? null : next));
  const isExtra = (next: NonNullable<ExtraSel>) => !!extraSel && JSON.stringify(extraSel) === JSON.stringify(next);

  const cell = (v: number | undefined, next: NonNullable<BopSel>, cls = '') => (
    <td
      onClick={v ? () => pick(next) : undefined}
      className={`${tdX} text-right tabular-nums ${v ? 'cursor-pointer hover:bg-amber-50' : 'text-slate-300'} ${isSel(next) ? 'bg-amber-100 font-semibold' : ''} ${cls}`}
    >
      {v ? fmtV(v) : ''}
    </td>
  );

  return (
    <div className="space-y-4">
      {/* 1. Nhóm sản phẩm × Công đoạn */}
      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold text-slate-700">
            Nhóm sản phẩm × Công đoạn · Kho{' '}
            <span className="font-normal text-slate-500">
              · {fmtInt(open.length)} hạng mục chưa nhập kho đủ · bấm số, tên nhóm hoặc mã công đoạn để lọc danh sách
            </span>
          </p>
          <div className="ml-auto flex gap-1">
            {BOP_METRICS.map(m => (
              <span key={m.key} title={m.hint}>
                <Chip active={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</Chip>
              </span>
            ))}
          </div>
        </div>
        {metric === 'total' && (
          <p className="mb-1.5 rounded-md bg-amber-50 px-2 py-1 text-[0.6875rem] text-amber-800">
            Đang xem <b>trị giá đầy đủ</b> của hạng mục (kể cả phần đã nhập kho) — vd P021 phần lớn đã nhập. Chọn <b>Còn lại (tỷ)</b> để khớp số trên thẻ BOP.
          </p>
        )}
        <div className="max-h-[60vh] overflow-auto custom-scrollbar">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-emerald-300 text-slate-900">
              <tr>
                <th className={`${thX} sticky left-0 z-20 w-px whitespace-nowrap bg-emerald-300 text-left`} rowSpan={2}>
                  Nhóm sản phẩm / xưởng
                  <NutMoTatCa onMo={() => setMoNsp(new Set(pivot.rows.map(x => x.nsp)))} onThu={() => setMoNsp(new Set())} />
                </th>
                {pivot.groups.map((g, gi) => (
                  <th key={gi} colSpan={g.stages.length} className={`${thX} border-l border-slate-200 text-center text-[0.6875rem] font-semibold uppercase tracking-wide`}>
                    {g.bucket ? (<><span className={`mr-1.5 inline-block h-2 w-2 rounded-sm ${BOP_GROUP[g.bucket].dot}`} />{BOP_GROUP[g.bucket].label}</>) : 'Khác'}
                  </th>
                ))}
                <th rowSpan={2} className={`${thX} whitespace-nowrap text-center`} title="Cộng giá trị còn sản xuất (chưa nhập kho)">TỔNG</th>
                <th colSpan={4} className={`${thX} border-l-2 border-slate-300 bg-emerald-50/60 text-center text-[0.6875rem] font-semibold uppercase tracking-wide text-emerald-800`}
                  title="Lũy kế mọi hạng mục không hủy của công trình, mọi Tình trạng IPO (kể cả hoàn thành), không theo bộ lọc trang">
                  Kho (lũy kế)
                </th>
              </tr>
              <tr>
                {pivot.groups.map(g => g.stages.map((st, si) => (
                  <th key={st} className={`${thX} whitespace-nowrap text-right ${si === 0 ? 'border-l border-slate-200' : ''}`}>
                    <button type="button" onClick={() => pick({ stage: st })}
                      title={`${g.bucket ? BOP_GROUP[g.bucket].label : 'Khác'} · lọc danh sách: mọi hạng mục ở ${st} (${fmtInt(pivot.colN[st] ?? 0)} hạng mục)`}
                      className={`rounded px-1 font-semibold hover:bg-amber-50 hover:text-slate-900 ${isSel({ stage: st }) ? 'bg-amber-100 text-slate-900' : 'text-slate-700'}`}>
                      {tenCotCongDoan(st)}
                    </button>
                  </th>
                )))}
                <th className={`${thX} whitespace-nowrap border-l-2 border-slate-300 bg-emerald-50/60 text-right font-semibold text-slate-700`} title="Thành tiền nhập kho lũy kế">P022 · Đã nhập</th>
                <th className={`${thX} whitespace-nowrap bg-emerald-50/60 text-right font-semibold text-slate-700`} title={metric === 'count' ? 'Số hạng mục hết hàng và đã xuất đủ (Đã nhập = Đã xuất + Tồn kho + Chênh)' : 'Thành tiền xuất kho lũy kế (chặn ≤ đã nhập từng hạng mục)'}>P025 · Đã xuất</th>
                <th className={`${thX} whitespace-nowrap bg-emerald-50/60 text-right font-semibold text-slate-700`} title={metric === 'count' ? 'Số hạng mục còn hàng trong kho' : 'Tồn kho hiện tại (cột dữ liệu), chặn ≤ đã nhập − đã xuất'}>Tồn kho</th>
                <th className={`${thX} whitespace-nowrap bg-emerald-50/60 text-right font-semibold text-slate-700`}
                  title={metric === 'count' ? 'Số hạng mục đã hết hàng trong kho mà chưa ghi xuất đủ' : 'Đã nhập − đã xuất − tồn kho: hàng đã nhập nhưng không thấy xuất cũng không còn trong kho (giao thẳng / chưa ghi phiếu xuất)'}>Chênh</th>
              </tr>
            </thead>
            <tbody>
              {pivot.rows.map(r => (
                <React.Fragment key={r.nsp}>
                <tr className="hover:bg-slate-50/60">
                  <td className={`${tdX} sticky left-0 whitespace-nowrap bg-white`}>
                    <button type="button" onClick={() => setMoNsp(prev => { const n = new Set(prev); if (n.has(r.nsp)) n.delete(r.nsp); else n.add(r.nsp); return n; })}
                      title="Xem theo xưởng" className="inline-block w-4 text-slate-400 hover:text-slate-900">{moNsp.has(r.nsp) ? '▾' : '▸'}</button>
                    <button type="button" onClick={() => pick({ nsp: r.nsp })} title={`Lọc danh sách: ${r.nsp} (${fmtInt(r.n)} hạng mục)`}
                      className={`max-w-[16rem] truncate rounded px-1 text-left font-medium hover:bg-amber-50 hover:text-slate-900 hover:underline ${isSel({ nsp: r.nsp }) ? 'bg-amber-100 text-slate-900' : 'text-slate-800'}`}>
                      {r.nsp}
                    </button>
                  </td>
                  {pivot.groups.map(g => g.stages.map((st, si) => (
                    <React.Fragment key={st}>{cell(r.cells[st], { stage: st, nsp: r.nsp }, si === 0 ? 'border-l border-slate-100' : '')}</React.Fragment>
                  )))}
                  {cell(r.total, { nsp: r.nsp }, 'font-bold text-slate-900')}
                  {khoCells(pivot.kho.get(r.nsp), { nsp: r.nsp })}
                </tr>
                {moNsp.has(r.nsp) && r.xs.map(([x, xr]) => (
                  <tr key={x} className="bg-slate-50/40 text-slate-600">
                    <td className={`${tdX} sticky left-0 whitespace-nowrap bg-slate-50 pl-9`}>
                      <button type="button" onClick={() => pick({ nsp: r.nsp, xuong: x })} title={`Lọc danh sách: ${r.nsp} · ${x}`}
                        className={`rounded px-1 hover:bg-amber-50 hover:underline ${isSel({ nsp: r.nsp, xuong: x }) ? 'bg-amber-100 font-semibold text-slate-900' : ''}`}>{x}</button>
                    </td>
                    {pivot.groups.map(g => g.stages.map((st, si) => (
                      <React.Fragment key={st}>{cell(xr.cells[st], { stage: st, nsp: r.nsp, xuong: x }, si === 0 ? 'border-l border-slate-100' : '')}</React.Fragment>
                    )))}
                    {cell(xr.total, { nsp: r.nsp, xuong: x }, 'font-semibold')}
                    {khoCells(pivot.kho.get(`${r.nsp}\u0000${x}`), { nsp: r.nsp, xuong: x })}
                  </tr>
                ))}
                </React.Fragment>
              ))}
              {pivot.rows.length === 0 && (
                <tr><td colSpan={pivot.stages.length + 6} className="px-3 py-6 text-center text-slate-400">Không còn hạng mục đang sản xuất.</td></tr>
              )}
            </tbody>
            {pivot.rows.length > 0 && (
              <tfoot className="sticky bottom-0 bg-yellow-300 font-bold text-red-600">
                <tr>
                  <td className={`${tdX} sticky left-0 bg-yellow-300 text-center`}>TỔNG</td>
                  {pivot.groups.map(g => g.stages.map((st, si) => (
                    <td key={st} className={`${tdX} text-right tabular-nums ${si === 0 ? 'border-l border-slate-200' : ''}`}>{fmtV(pivot.colTot[st] ?? 0)}</td>
                  )))}
                  <td className={`${tdX} border-l border-slate-200 text-right tabular-nums`}>{fmtV(pivot.grand)}</td>
                  {khoCells(pivot.khoTot, {})}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* 2. Điểm nghẽn: thời gian ở công đoạn hiện tại */}
      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-xs font-semibold text-slate-700">
              Thời gian ở công đoạn hiện tại
              {sel && <span className="ml-1 font-normal text-amber-700">· theo lọc: {[sel.nsp, sel.xuong, sel.stage].filter(Boolean).join(' · ')}</span>}
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
                        title={`${r.stage} · ${d.label}: ${v} hạng mục`}
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
          <p className="mt-2 text-[0.625rem] text-slate-400">
            Số ngày ở công đoạn lấy từ nguồn dữ liệu sản xuất; với các công đoạn trên chuyền (từ P013) nguồn hầu như chỉ ghi
            &lt; 3 ngày / 4–7 ngày nên chưa phản ánh hết thời gian tồn thực tế.
          </p>
        </div>
      </div>

      {/* 3. Sản lượng theo công đoạn SX · QC · Gia công ngoài (dữ liệu thêm theo HEX) */}
      <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr_1fr]">
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-700">
            Sản lượng theo công đoạn sản xuất{' '}
            <span className="font-normal text-slate-500">
              · {steps ? `${fmtInt(steps.onLine)} hạng mục trên chuyền (P012 → P021)` : '…'} · SL đã giao / SL tính phiếu · bấm 1 bước để lọc hạng mục chưa xong bước đó
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
                    <span className="w-12 shrink-0 text-right tabular-nums text-slate-700">{r.pct.toFixed(0)}%</span>
                    <span className="w-24 shrink-0 text-right tabular-nums text-slate-500" title="Hạng mục đã giao đủ bước / hạng mục áp dụng">{fmtInt(r.done)}/{fmtInt(r.items)} HM</span>
                  </button>
                );
              })}
              <p className="pt-1 text-[0.625rem] text-slate-400">
                Bước Kim loại / Vecni / Sofa / Đá / Kính chỉ tính hạng mục có cờ tương ứng. Số giao theo công đoạn do xưởng cập nhật ở bảng sản xuất.
              </p>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-700">
            QC <span className="font-normal text-slate-500">· theo lần kiểm gần nhất của hạng mục chưa nhập kho đủ</span>
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
                {fmtInt(qc.checks)} lần kiểm · {fmtInt(qc.fail)} sản phẩm lỗi ghi nhận. Chỉ hạng mục có QC ghi vào bảng sản xuất mới có số.
              </p>
            </>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-700">
            Gia công ngoài <span className="font-normal text-slate-500">· hạng mục chưa nhập kho đủ có cờ GCN</span>
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

      {/* 4. Danh sách hạng mục */}
      {hasFilter ? (
      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold text-slate-700">Hạng mục đang lọc</p>
          <Chip active onClick={() => { setSel(null); setDwellSel(null); setExtraSel(null); }}>{selText} ✕</Chip>
          <span className="text-[0.6875rem] text-slate-500">{fmtInt(list.length)} hạng mục</span>
          <SortPicker
            value={sortBy}
            onChange={setSortBy}
            options={[['deadline', 'Hạn gần nhất'], ['stage', 'Công đoạn'], ['remain', 'Giá trị còn lại']]}
          />
          <button type="button" onClick={() => { setSel(null); setDwellSel(null); setExtraSel(null); }} className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100">Đóng ✕</button>
          <div className="ml-auto"><SearchBox value={q} onChange={setQ} placeholder="Tìm hex, hạng mục..." /></div>
        </div>
        {/* Bảng BOP: gộp 3 cột KH tuần / KH tháng / Cần giao thành 1 cột "Hạn" (bảng 15 cột rộng 1.760px,
            cột QC / GCN mới thêm rơi ra ngoài màn 1440) — chi tiết từng ngày xem ở tab BOT */}
        <HexTable
          rows={list}
          planDates={false}
          onHexClick={onHexClick}
          hexClickTitle="Xem chi tiết hạng mục (BOP × BOT)"
          extraHead={<>
            <th className={`${th} text-left`} title="Hạn đang dùng: KH nhập kho tuần → tháng (chi tiết ở tab BOT)">Hạn</th>
            <th className={`${th} text-left`}>Khu vực SX</th>
            <th className={`${th} text-left`}>Tình trạng</th>
            <th className={`${th} text-left`}>Ở công đoạn</th>
            <th className={`${th} text-left`} title="Số lượng đã giao theo công đoạn SX / SL tính phiếu (chỉ hạng mục trên chuyền)">Công đoạn SX</th>
            <th className={`${th} text-left`} title="Lần kiểm QC gần nhất: trạng thái · công đoạn · ngày">QC</th>
            <th className={`${th} text-left`} title="Tình trạng gia công ngoài">GCN</th>
          </>}
          extraCells={i => {
            const d = DWELL.find(x => x.key === dwellOf(i.dwell));
            const e = ex(i);
            const stepText = e && i.bucket === 'onLine' && e.qtyTicket > 0
              ? STEPS.filter(s => !s.flag || e.flags[s.flag] || e.steps[s.key] > 0)
                .map(s => `${s.label} ${Number(e.steps[s.key].toFixed(1))}/${Number(e.qtyTicket.toFixed(1))}`)
              : [];
            const stepDone = e && e.qtyTicket > 0 ? STEPS.filter(s => (!s.flag || e.flags[s.flag] || e.steps[s.key] > 0) && e.steps[s.key] >= e.qtyTicket).length : 0;
            const stepAll = e && e.qtyTicket > 0 ? STEPS.filter(s => !s.flag || e.flags[s.flag] || e.steps[s.key] > 0).length : 0;
            const qs = qcStateOf(e?.qc);
            const qm = QC_STATE_META[qs];
            return (
              <>
                <td className={`${td} whitespace-nowrap tabular-nums ${!i.deadline ? 'text-slate-300' : i.overdue ? 'font-semibold text-red-600' : i.dueSoon ? 'font-semibold text-amber-600' : 'text-slate-600'}`}
                    title={i.deadlineSource ? `KH nhập kho ${i.deadlineSource}` : 'Chưa có KH nhập kho tuần / tháng'}>
                  {fmtDate(i.deadline)}
                </td>
                <td className={`${td} whitespace-nowrap text-slate-600`}>{i.area || '—'}</td>
                <td className={`${td} whitespace-nowrap text-slate-600`}>{i.status || '—'}</td>
                <td className={`${td} whitespace-nowrap`}>
                  {d ? (
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      <span className={`h-2 w-2 rounded-sm ${d.bar}`} />{d.label}
                    </span>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className={`${td} whitespace-nowrap`} title={stepText.join(' · ') || undefined}>
                  {extra === null || extra === undefined ? <span className="text-slate-300">…</span>
                    : stepText.length === 0 ? <span className="text-slate-300">—</span> : (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="flex h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                          <span className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${stepAll ? (stepDone / stepAll) * 100 : 0}%` }} />
                        </span>
                        <span className="tabular-nums text-slate-600">{stepDone}/{stepAll} bước</span>
                      </span>
                    )}
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  {extra === null || extra === undefined ? <span className="text-slate-300">…</span>
                    : !e?.qc?.last ? <span className="text-slate-300">—</span> : (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] font-semibold ${qm.badge}`}
                            title={`${e.qc.n} lần kiểm · ${e.qc.fail} lỗi · gần nhất ${e.qc.last.date} ${e.qc.last.stage}`}>
                        {QC_STATUS_VI[e.qc.last.status] ?? e.qc.last.status}{e.qc.last.fail > 0 ? ` · lỗi ${e.qc.last.fail}` : ''}
                        <span className="font-normal text-slate-500">{e.qc.last.stage.split(' ')[0]}</span>
                      </span>
                    )}
                </td>
                <td className={`${td} min-w-[140px] max-w-[220px] break-words`} title={e?.gcn ? [e.gcn.st, e.gcn.note, e.gcn.due ? `dự kiến về ${e.gcn.due}` : ''].filter(Boolean).join(' · ') : undefined}>
                  {extra === null || extra === undefined ? <span className="text-slate-300">…</span>
                    : !e?.gcn ? <span className="text-slate-300">—</span>
                      : <span className={GCN_DONE(e.gcn.st) ? 'text-slate-500' : 'font-medium text-orange-700'}>{e.gcn.st ?? 'Chưa ghi tình trạng'}</span>}
                </td>
              </>
            );
          }}
        />
      </div>
      ) : <p className="text-[0.6875rem] text-slate-400">Bấm vào một số trong bảng (hoặc thẻ / tên nhóm / ngày) để xem danh sách hạng mục.</p>}
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
const BOM_META = Object.fromEntries(BOM_STATES.map(s => [s.key, s])) as Record<BomState, (typeof BOM_STATES)[number]>;
// Thứ tự + màu nút lọc hạng mục — cùng thứ tự / màu với biểu đồ dòng PR (LineStateBreakdown): còn chờ hàng về →
// đã về → chưa có PR. Màu ô vuông = màu đoạn tương ứng trên biểu đồ (BOM_DOT; nhóm chưa có PR không có trên biểu đồ).
const BOM_CHIP_ORDER: BomState[] = ['notOrdered', 'outsourced', 'late', 'deferred', 'onTrack', 'arrived', 'onHold', 'ok', 'stocked', 'noneBeforeSx', 'noneInSx', 'noneNotDeployed'];
// Bảng Nhóm sản phẩm × Tình trạng vật tư: cột gom 3 nhóm, nhãn ngắn
const BOM_COT: { nhom: string; states: BomState[] }[] = [
  { nhom: 'Còn chờ vật tư', states: ['notOrdered', 'outsourced', 'late', 'deferred', 'onTrack', 'arrived'] },
  { nhom: 'Đã về / xong', states: ['onHold', 'ok', 'stocked'] },
  { nhom: 'Chưa thấy PR', states: ['noneBeforeSx', 'noneInSx', 'noneNotDeployed'] },
];
const BOM_NGAN: Record<BomState, string> = {
  notOrdered: 'Chưa mua', outsourced: 'Gia công ngoài', late: 'Trễ hẹn', deferred: 'Về theo SX', onTrack: 'Chưa tới hẹn',
  arrived: 'Chờ nhập SAP', onHold: 'Tạm dừng', ok: 'Đã về đủ', stocked: 'Đã nhập kho đủ',
  noneBeforeSx: 'Đã TK, chưa SX', noneInSx: 'Đang SX / tồn kho', noneNotDeployed: 'Chưa triển khai',
};
const BOM_DOT: Partial<Record<BomState, string>> = {
  notOrdered: 'bg-red-600', outsourced: 'bg-fuchsia-500', onHold: 'bg-stone-400', late: 'bg-orange-500', deferred: 'bg-amber-300', onTrack: 'bg-sky-300', arrived: 'bg-blue-500',
  ok: 'bg-emerald-500', stocked: 'bg-slate-300', noneBeforeSx: 'bg-white ring-1 ring-red-400', noneInSx: 'bg-white ring-1 ring-slate-300', noneNotDeployed: 'bg-white ring-1 ring-slate-300',
};

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

// Nhóm cấp 1 — đúng theo 2 cột TRẠNG THÁI + TRẠNG THÁI SAP (dòng Hủy ghi riêng, không vẽ vào thanh)
const LINE_BASES: { key: MaterialBase; label: string; cols: string; tone: string; states: MaterialLineState[]; hint: string }[] = [
  { key: 'notOrdered', label: 'Chưa mua', cols: '1.CHƯA MUA / Mở', tone: 'text-red-700',
    states: ['notOrdered', 'gcNotOrdered', 'holdNotOrdered'], hint: 'TRẠNG THÁI 1.CHƯA MUA · TRẠNG THÁI SAP Mở — chưa có PO' },
  { key: 'buying', label: 'Đang mua', cols: '2.ĐANG MUA / Mở', tone: 'text-orange-700',
    states: ['late', 'outsourced', 'deferred', 'onTrack', 'arrived', 'ccld', 'onHold'], hint: 'TRẠNG THÁI 2.ĐANG MUA · TRẠNG THÁI SAP Mở — đã có PO, chưa nhận đủ' },
  { key: 'done', label: 'Đã nhập kho – Hoàn thành', cols: '3.ĐÃ NHẬP KHO / Hoàn thành', tone: 'text-emerald-700',
    states: ['done'], hint: 'TRẠNG THÁI 3.ĐÃ NHẬP KHO · TRẠNG THÁI SAP Hoàn thành — đã nhận đủ' },
  { key: 'closed', label: 'Đã nhập kho – Đóng PR', cols: '3.ĐÃ NHẬP KHO / Đóng', tone: 'text-violet-700',
    states: ['closedFull', 'closedPartial', 'closedNoReceipt', 'closedNoPo'], hint: 'TRẠNG THÁI 3.ĐÃ NHẬP KHO · TRẠNG THÁI SAP Đóng — PR đã đóng trên SAP (có thể khi chưa nhận đủ)' },
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
const lineStateLabel = (s: MaterialLineState) => LINE_STATES.find(x => x.key === s)?.full ?? s;

// ---------------------------------------------------------------------------
// Biểu đồ phân bổ dòng PR — dùng chung cho "Vật tư chung của công trình" và "Dòng PR gắn hạng mục".
// Thanh chia theo nhóm CẤP 1 (đúng 2 cột TRẠNG THÁI + TRẠNG THÁI SAP: Chưa mua | Đang mua | Đã nhập kho – Hoàn thành |
// Đã nhập kho – Đóng PR), mỗi nhóm tô theo nhãn CẤP 2; dòng Hủy ghi riêng, không vẽ, % tính trên dòng còn hiệu lực.
// Phía trên ghi tổng "Còn chờ hàng về". Chú thích chia cột theo nhóm cấp 1 (số + %). Có onPick thì bấm để lọc.
// ---------------------------------------------------------------------------
const LINE_META = Object.fromEntries(LINE_STATES.map(s => [s.key, s])) as Record<MaterialLineState, (typeof LINE_STATES)[number]>;
const DARK_TEXT_BARS = new Set<MaterialLineState>(['deferred', 'onTrack', 'closedFull', 'closedNoReceipt']); // nền nhạt => chữ tối

type LinePick = MaterialLineState | 'pending';
const LineStateBreakdown = ({ counts, active, onPick, canPick, isActive }: {
  counts: Record<MaterialLineState, number>;
  active?: string;
  onPick?: (k: LinePick) => void;
  canPick?: (k: LinePick) => boolean; // mặc định: mọi nhãn bấm được khi có onPick
  isActive?: (k: LinePick) => boolean; // mặc định: active === k
}) => {
  const pickable = (k: LinePick) => !!onPick && (canPick ? canPick(k) : true);
  const on = (k: LinePick) => (isActive ? isActive(k) : active === k);
  const n = (k: MaterialLineState) => counts[k] ?? 0;
  const bases = LINE_BASES.map(b => ({ ...b, total: b.states.reduce((t, k) => t + n(k), 0) }));
  const base = bases.reduce((t, b) => t + b.total, 0);
  const cancelled = n('cancelled');
  const wait = PENDING_STATES.reduce((t, k) => t + n(k), 0);
  const pct = (v: number) => (base ? `${Math.round((v / base) * 100)}%` : '0%');
  if (base === 0) {
    return <p className="py-2 text-xs text-slate-500">Không có dòng PR nào (ngoài {fmtInt(cancelled)} dòng hủy).</p>;
  }

  const segments = (keys: MaterialLineState[], groupTotal: number) => keys.filter(k => n(k) > 0).map(k => {
    const w = (n(k) / groupTotal) * 100;
    const wide = (n(k) / base) * 100 >= 5; // đủ rộng để ghi số
    return (
      <div
        key={k}
        onClick={pickable(k) ? () => onPick!(k) : undefined}
        className={`${LINE_META[k].bar} flex items-center justify-center border-r border-white/70 text-[0.625rem] font-bold tabular-nums last:border-r-0 ${DARK_TEXT_BARS.has(k) ? 'text-slate-800' : 'text-white'} ${pickable(k) ? 'cursor-pointer hover:brightness-110' : ''} ${on(k) ? 'ring-2 ring-inset ring-slate-900' : ''}`}
        style={{ width: `${w}%` }}
        title={`${LINE_META[k].full}: ${fmtInt(n(k))} dòng (${pct(n(k))}) — ${LINE_META[k].hint}`}
      >
        {wide ? fmtInt(n(k)) : ''}
      </div>
    );
  });

  const item = (k: MaterialLineState) => {
    const v = n(k);
    const pending = PENDING_STATES.includes(k);
    const body = (
      <>
        <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${LINE_META[k].bar}`} />
        <span className={`truncate ${!v ? 'text-slate-400' : pending ? 'text-slate-800' : 'text-slate-600'}`}>{LINE_META[k].label}</span>
        <span className={`ml-auto font-semibold tabular-nums ${v ? 'text-slate-800' : 'text-slate-300'}`}>{fmtInt(v)}</span>
        <span className="w-9 text-right tabular-nums text-slate-400">{v ? pct(v) : ''}</span>
      </>
    );
    const cls = `flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-xs ${on(k) ? 'bg-slate-800/5 ring-1 ring-slate-400' : ''}`;
    return pickable(k) ? (
      <button key={k} type="button" disabled={!v} onClick={() => onPick!(k)} title={LINE_META[k].hint}
        className={`${cls} enabled:hover:bg-slate-100 disabled:cursor-default`}>{body}</button>
    ) : (
      <div key={k} className={`${cls} cursor-help`} title={LINE_META[k].hint}>{body}</div>
    );
  };

  const waitText = (
    <>
      <span className="font-bold text-red-700">Còn chờ hàng về</span>
      <span className="font-semibold tabular-nums text-slate-800">{fmtInt(wait)} dòng</span>
      <span className="tabular-nums text-slate-500">· {pct(wait)}</span>
    </>
  );
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
        {pickable('pending') ? (
          <button type="button" onClick={() => onPick!('pending')}
            className={`flex items-baseline gap-1.5 rounded px-1.5 py-0.5 hover:bg-slate-100 ${on('pending') ? 'bg-slate-800/5 ring-1 ring-slate-400' : ''}`}
            title="Chưa mua + Gia công ngoài + Đang mua (trễ hẹn / về theo nhu cầu SX / chưa tới hẹn) + Kho báo về chờ nhập SAP — bấm để lọc">{waitText}</button>
        ) : (
          <span className="flex items-baseline gap-1.5 px-1.5 py-0.5" title="Chưa mua + Gia công ngoài + Đang mua (trễ hẹn / về theo nhu cầu SX / chưa tới hẹn) + Kho báo về chờ nhập SAP">{waitText}</span>
        )}
        {cancelled > 0 && (pickable('cancelled') ? (
          <button type="button" onClick={() => onPick!('cancelled')} title={LINE_META.cancelled.hint}
            className={`rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 ${on('cancelled') ? 'ring-1 ring-slate-400' : ''}`}>
            Hủy (không tính): <span className="tabular-nums">{fmtInt(cancelled)}</span>
          </button>
        ) : (
          <span className="px-1.5 text-slate-400" title={LINE_META.cancelled.hint}>Hủy (không tính): <span className="tabular-nums">{fmtInt(cancelled)}</span></span>
        ))}
        <span className="ml-auto text-[0.625rem] text-slate-400">% trên {fmtInt(base)} dòng còn hiệu lực · nhóm theo cột TRẠNG THÁI / TRẠNG THÁI SAP</span>
      </div>
      <div className="flex h-6 w-full gap-1">
        {bases.filter(b => b.total > 0).map((b, i, arr) => (
          <div key={b.key} className={`flex overflow-hidden ${i === 0 ? 'rounded-l-md' : ''} ${i === arr.length - 1 ? 'rounded-r-md' : ''}`}
            style={{ width: `${(b.total / base) * 100}%` }}>
            {segments(b.states, b.total)}
          </div>
        ))}
      </div>
      {/* Chú thích theo nhóm cấp 1 (2 cột trạng thái): tổng nhóm + nhãn cấp 2 */}
      <div className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
        {bases.map(b => (
          <div key={b.key}>
            <div className="mb-0.5 flex flex-wrap items-baseline gap-x-1.5 border-b border-slate-200 px-1.5 pb-0.5 text-xs" title={b.hint}>
              <span className={`font-bold ${b.tone}`}>{b.label}</span>
              <span className="font-semibold tabular-nums text-slate-800">{fmtInt(b.total)}</span>
              <span className="tabular-nums text-slate-500">· {pct(b.total)}</span>
              <span className="ml-auto text-[0.625rem] text-slate-400">{b.cols}</span>
            </div>
            <div className="space-y-0.5">{b.states.map(item)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

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

const xlsxDate = (v: unknown) => { const d = parsePlanDate(v); return d ? fmtDate(d) : ''; };

// Ghi chú Team PR đôi khi là ngày Excel bị lưu thành chuỗi "2026-07-20 00:00:00" => hiện dd/mm/yyyy
const fmtNote = (v: unknown): string => {
  const t = String(v ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]00:00:00(?:\.0+)?)?$/.exec(t);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : t;
};

/** Xuất Excel các dòng cần bổ sung mã nhà máy (gửi team PR). */
async function exportToFixExcel(rows: ProjectMaterialLine[], today: number, fileTag: string) {
  const XLSX = await import('xlsx');
  const data = rows.map((r, i) => {
    const st = r.kind === 'uncoded' ? materialLineState(r, today) : null;
    return {
      STT: i + 1,
      'Mã công trình': r.trackingno ?? '',
      'Tên công trình (vật tư)': r.ten_cong_trinh ?? '',
      'Số PR': r.so_pr ?? '', 'PR line': r.pr_line ?? '',
      'Ngày PR': xlsxDate(r.ngay_pr), 'Người yêu cầu': r.nguoi_yeu_cau ?? '',
      'Mã VT SAP': r.ma_vat_tu_sap ?? '', 'Tên vật tư': r.ten_vat_tu ?? '', 'Nhóm VT': r.nhom_vt ?? '', 'ĐVT': r.dvt ?? '',
      'SL yêu cầu': Number(r.so_luong_yeu_cau) || 0, 'SL đã nhận (SAP)': Number(r.so_luong_da_nhan_sap) || 0, 'SL còn lại': +(Number(r.so_luong_con_lai) || 0).toFixed(3),
      'Số PO': r.so_po ?? '', 'Team PR note': fmtNote(r.team_pr_note),
      'Trạng thái': String(r.trang_thai ?? ''),
      'Tình trạng': st ? lineStateLabel(st) : '',
      'Ngày cần VT': xlsxDate(r.ngay_can_vat_tu), 'Dự kiến giao PMH': xlsxDate(r.ngay_du_kien_giao_hang_pmh_nhap),
      'Mã nhà máy (đang ghi)': r.ma_nha_may ?? '', 'Item note PR': r.item_note_pr ?? '',
      'Cần làm': r.kind === 'badCode' ? `Sửa mã nhà máy: ${r.bad_reason ?? ''}` : 'Bổ sung mã nhà máy (13 số) của hạng mục',
    };
  });
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [6, 14, 34, 12, 8, 12, 18, 14, 40, 22, 8, 10, 12, 10, 12, 24, 14, 24, 12, 16, 24, 40, 44].map(wch => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cần bổ sung mã NM');
  XLSX.writeFile(wb, `vat_tu_can_bo_sung_ma_nha_may_${fileTag}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export const ProjectMaterialSection = ({ rows, today, fileTag }: {
  rows: ProjectMaterialLine[] | null; today: number; fileTag: string;
}) => {
  const [filter, setFilter] = useState<MaterialLineState | 'pending' | 'all' | 'badCode'>('pending');
  const [q, setQ] = useState('');
  const [exporting, setExporting] = useState(false);
  const sum = useMemo(() => summarizeProjectMaterial(rows, today), [rows, today]);

  const enriched = useMemo(() => (rows ?? []).map(r => ({ r, st: r.kind === 'uncoded' ? materialLineState(r, today) : null })), [rows, today]);
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const RANK: MaterialLineState[] = ['late', 'notOrdered', 'gcNotOrdered', 'outsourced', 'onTrack', 'deferred', 'arrived', 'onHold', 'holdNotOrdered', 'ccld', 'closedPartial', 'closedNoReceipt', 'closedNoPo', 'closedFull', 'done', 'cancelled'];
    const need = (r: ProjectMaterialLine) => parsePlanDate(r.ngay_can_vat_tu)?.getTime() ?? Infinity;
    return enriched
      .filter(({ r, st }) => {
        if (filter === 'badCode') { if (r.kind !== 'badCode') return false; }
        else if (r.kind !== 'uncoded' || !st) return false;
        else if (filter === 'pending') { if (!PENDING_STATES.includes(st)) return false; }
        else if (filter !== 'all' && st !== filter) return false;
        if (!ql) return true;
        return [r.ten_vat_tu, r.nhom_vt, r.so_pr, r.trackingno, r.item_note_pr, r.team_pr_note]
          .some(v => String(v ?? '').toLowerCase().includes(ql));
      })
      .sort((a, b) => (a.st ? RANK.indexOf(a.st) : 0) - (b.st ? RANK.indexOf(b.st) : 0) || need(a.r) - need(b.r));
  }, [enriched, filter, q]);

  const toFixRows = useMemo(
    () => enriched.filter(({ r, st }) => (r.kind === 'badCode' ? PENDING_STATES.includes(materialLineState(r, today)) : !!st && PENDING_STATES.includes(st))).map(x => x.r),
    [enriched, today]
  );
  const runExport = async () => {
    if (!toFixRows.length || exporting) return;
    setExporting(true);
    try { await exportToFixExcel(toFixRows, today, fileTag); }
    catch (e) { console.error('Lỗi xuất Excel vật tư cần bổ sung mã:', e); alert('Không xuất được file Excel, vui lòng thử lại.'); }
    finally { setExporting(false); }
  };

  const total = sum ? LINE_STATES.reduce((s, x) => s + sum.byState[x.key], 0) : 0;
  const pendingN = sum ? PENDING_STATES.reduce((s, k) => s + sum.byState[k], 0) : 0;

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/30 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold text-slate-700">
          Vật tư chung của công trình{' '}
          <span className="font-normal text-slate-500">
            · PR không ghi mã nhà máy nên không gắn được hạng mục · {sum ? `${fmtInt(sum.lines)} dòng (không tính hủy)` : '…'}
          </span>
        </p>
        <button
          type="button"
          onClick={runExport}
          disabled={!toFixRows.length || exporting}
          title="Xuất các dòng còn chờ (chưa mua / đang mua / kho báo về) chưa có mã nhà máy + các dòng ghi sai mã — gửi team PR bổ sung"
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-violet-400 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download size={13} />
          {exporting ? 'Đang xuất…' : `Xuất Excel – cần bổ sung mã NM (${sum ? fmtInt(sum.toFix) : '…'})`}
        </button>
      </div>
      {!sum ? (
        <p className="py-4 text-center text-xs text-slate-400">Đang tải vật tư chung của công trình…</p>
      ) : total === 0 && sum.badCode === 0 ? (
        <p className="py-3 text-center text-xs text-slate-500">Mọi dòng PR của công trình đều đã ghi mã nhà máy.</p>
      ) : (
        <>
          <LineStateBreakdown counts={sum.byState} active={filter} onPick={setFilter} />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[0.6875rem] text-slate-500" title="Mỗi số là số DÒNG PR (1 dòng = 1 Số PR · line), không phải số hạng mục hay số PR">
              Số liệu = số dòng PR · bấm từng nhóm để lọc bảng · đang xem:{' '}
              <span className="font-semibold text-slate-700">
                {filter === 'pending' ? `Còn chờ hàng về (${fmtInt(pendingN)})` : filter === 'all' ? `Tất cả (${fmtInt(total)})` : filter === 'badCode' ? 'Ghi sai mã NM' : lineStateLabel(filter)}
              </span>
            </span>
            <span title={`${fmtInt(total)} dòng PR không mã nhà máy, gồm cả dòng hủy`}><Chip active={filter === 'all'} onClick={() => setFilter('all')}>Tất cả ({fmtInt(total)})</Chip></span>
            {sum.badCode > 0 && (
              <Chip active={filter === 'badCode'} tone="amber" onClick={() => setFilter('badCode')}>Ghi sai mã NM ({fmtInt(sum.badCode)})</Chip>
            )}
            <div className="ml-auto"><SearchBox value={q} onChange={setQ} placeholder="Tìm vật tư, PR, nhóm VT..." /></div>
          </div>
          <div className="mt-2 max-h-[45vh] overflow-auto rounded-lg border border-slate-200 bg-white custom-scrollbar">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
                <tr>
                  <th className={`${th} w-10 text-right`}>STT</th>
                  <th className={`${th} text-left`}>Công trình</th>
                  <th className={`${th} text-left`}>Số PR · line</th>
                  <th className={`${th} text-left`}>Tên vật tư</th>
                  <th className={`${th} text-left`}>Nhóm VT</th>
                  <th className={`${th} text-right`}>SL YC</th>
                  <th className={`${th} text-right`} title="SL SAP đã nhận kho (so_luong_da_nhan_sap)">Đã nhận</th>
                  <th className={`${th} text-right`}>SL còn lại</th>
                  <th className={`${th} text-left`}>Ngày PR</th>
                  <th className={`${th} text-left`}>Ngày cần VT</th>
                  <th className={`${th} text-left`}>Dự kiến giao PMH</th>
                  <th className={`${th} text-left`}>Tình trạng</th>
                  <th className={`${th} text-left`}>Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.slice(0, 1000).map(({ r, st }, idx) => {
                  const need = parsePlanDate(r.ngay_can_vat_tu);
                  const due = materialDueDate(r);
                  const meta = st ? LINE_STATES.find(x => x.key === st) : null;
                  // Số ngày trễ so với Ngày dự kiến giao (PMH nhập) — để thấy dòng nào trễ lâu nhất
                  const lateDays = (st === 'late' || st === 'deferred' || st === 'outsourced') && due && due.getTime() < today ? Math.floor((today - due.getTime()) / DAY) : 0;
                  const note = [fmtNote(r.team_pr_note), r.item_note_pr].filter(Boolean).join(' · ');
                  return (
                    <tr key={`${String(r.so_pr)}-${String(r.pr_line)}-${idx}`} className="hover:bg-slate-50">
                      <td className={`${td} text-right tabular-nums text-slate-400`}>{idx + 1}</td>
                      <td className={`${td} whitespace-nowrap text-slate-600`} title={r.ten_cong_trinh}>{r.trackingno}</td>
                      <td className={`${td} whitespace-nowrap tabular-nums text-slate-600`}>{String(r.so_pr ?? '—')} · {String(r.pr_line ?? '')}</td>
                      <td className={`${td} min-w-[220px] max-w-[360px] break-words text-slate-800`} title={r.ten_vat_tu}>{r.ten_vat_tu}</td>
                      <td className={`${td} whitespace-nowrap text-slate-500`}>{r.nhom_vt}</td>
                      <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{fmtQty(r.so_luong_yeu_cau)} <span className="text-slate-400">{r.dvt}</span></td>
                      <td className={`${td} whitespace-nowrap text-right tabular-nums text-slate-500`}>{Number(r.so_luong_da_nhan_sap) > 0 ? fmtQty(r.so_luong_da_nhan_sap) : '—'}</td>
                      <td className={`${td} whitespace-nowrap text-right tabular-nums font-semibold text-slate-700`}>{Number(r.so_luong_con_lai) > 0 ? fmtQty(r.so_luong_con_lai) : '—'} {Number(r.so_luong_con_lai) > 0 && <span className="font-normal text-slate-400">{r.dvt}</span>}</td>
                      <td className={`${td} whitespace-nowrap tabular-nums text-slate-500`}>{fmtDate(parsePlanDate(r.ngay_pr))}</td>
                      <td className={`${td} whitespace-nowrap tabular-nums ${need && st && PENDING_STATES.includes(st) && need.getTime() < today ? 'font-semibold text-red-600' : 'text-slate-600'}`}>{fmtDate(need)}</td>
                      <td className={`${td} whitespace-nowrap tabular-nums ${st === 'late' ? 'font-semibold text-orange-600' : 'text-slate-600'}`}>{st === 'late' || st === 'deferred' || st === 'onTrack' || st === 'outsourced' ? fmtDate(due) : '—'}</td>
                      <td className={td}>
                        {r.kind === 'badCode' ? (
                          <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[0.625rem] font-semibold text-amber-800" title={r.bad_reason ?? ''}>Sai mã NM: {r.ma_nha_may}</span>
                        ) : meta ? (
                          <span className="inline-flex cursor-help items-center gap-1 whitespace-nowrap text-slate-700" title={meta.hint}><span className={`h-2 w-2 rounded-sm ${meta.bar}`} />{meta.full}{lateDays > 0 && <span className={st === 'late' ? 'font-semibold text-orange-600' : 'text-slate-500'}>· {st === 'late' ? '' : 'quá '}{fmtInt(lateDays)} ngày</span>}</span>
                        ) : null}
                      </td>
                      <td className={`${td} min-w-[200px] max-w-[340px] break-words text-slate-500`} title={note}>
                        {note || '—'}
                      </td>
                    </tr>
                  );
                })}
                {list.length === 0 && <tr><td colSpan={13} className="px-3 py-6 text-center text-slate-400">Không có dòng phù hợp.</td></tr>}
              </tbody>
            </table>
          </div>
          {list.length > 1000 && <p className="mt-1 text-[0.6875rem] text-slate-500">Hiện 1.000 / {fmtInt(list.length)} dòng — lọc hoặc tìm để thu hẹp.</p>}
          <p className="mt-1.5 text-[0.6875rem] text-slate-500">
            Gắn theo mã công trình (TrackingNo) của PR. Muốn các dòng này hiện theo từng hạng mục ở bảng dưới, team PR cần ghi mã nhà máy
            (13 số = 4 số đầu + HEX) vào cột Mã nhà máy hoặc Item note PR — dùng nút Xuất Excel để lấy danh sách.
          </p>
        </>
      )}
    </div>
  );
};

export const BomTab = ({ items, matCount, materialLines, projectLines, nvlByHex, projectTag, onOpenMaterial, onOpenHex, today, materialIssues }: {
  items: HexInfo[];
  matCount: Record<string, number> | null;
  materialLines: MaterialLine[] | null;
  /** Vật tư chung của công trình (PR không ghi mã nhà máy / ghi sai mã) */
  projectLines: ProjectMaterialLine[] | null;
  /** Định mức + tình trạng NVL theo hạng mục từ bảng sản xuất (null = đang tải) */
  nvlByHex: Record<string, NvlRaw> | null;
  /** Dùng đặt tên file xuất Excel */
  projectTag: string;
  onOpenMaterial: (mode: 'matched') => void;
  onOpenHex: (hex: string) => void;
  today: number;
  materialIssues: Record<string, VuongMacItem[]> | null;
}) => {
  const [filter, setFilter] = useState<BomState | 'all' | 'afterNeed' | 'issue'>('all');
  const [sortBy, setSortBy] = useState<'priority' | 'deadline' | 'remain'>('priority');
  const [issueHex, setIssueHex] = useState<string | null>(null);
  const [q, setQ] = useState('');
  // Bảng Nhóm sản phẩm × Tình trạng vật tư: số đo, dòng đang mở xưởng, nhóm / xưởng đang lọc (cộng với filter tình trạng)
  const [bomMetric, setBomMetric] = useState<'count' | 'remain'>('count');
  const [moNspBom, setMoNspBom] = useState<Set<string>>(new Set());
  const [bomSel, setBomSel] = useState<{ nsp?: string; xuong?: string } | null>(null);
  const nspOfB = (i: HexInfo) => i.nhomSp || NO_NSP;

  const bom = useMemo(
    () => analyzeBom(items, matCount, materialLines, today, materialIssues, nvlByHex),
    [items, matCount, materialLines, today, materialIssues, nvlByHex]
  );
  const projectSum = useMemo(() => summarizeProjectMaterial(projectLines, today), [projectLines, today]);

  const list = useMemo(() => {
    if (!bom) return [];
    const ql = q.trim().toLowerCase();
    // Ưu tiên xử lý: trễ hẹn giao → chưa mua → đang mua chưa tới hẹn → chưa tìm thấy VT → kho báo về
    // → đã về đủ → hạng mục đã nhập kho đủ (không còn ảnh hưởng, luôn xếp cuối)
    // Chưa triển khai (P001) xếp sau 'đã về đủ' — chưa lên PR là bình thường
    const PRIORITY: BomState[] = ['late', 'notOrdered', 'outsourced', 'onTrack', 'deferred', 'noneBeforeSx', 'arrived', 'onHold', 'ok', 'noneInSx', 'noneNotDeployed', 'stocked'];
    const rank = (i: HexInfo) => PRIORITY.indexOf(bom.byHex[i.hex]?.state ?? 'noneBeforeSx');
    const PENDING_BOM: BomState[] = ['late', 'notOrdered', 'outsourced', 'onTrack', 'deferred'];
    const DONE_BOM: BomState[] = ['ok', 'noneInSx', 'noneNotDeployed', 'stocked'];
    const pendingFirst = (i: HexInfo) => {
      const s = bom.byHex[i.hex]?.state ?? 'noneBeforeSx';
      return PENDING_BOM.includes(s) ? 0 : DONE_BOM.includes(s) ? 2 : 1;
    };
    const need = (i: HexInfo) => bom.byHex[i.hex]?.needDate?.getTime() ?? Infinity;
    const seen = new Set<string>();
    return items
      .filter(i => {
        if (seen.has(i.hex)) return false;
        seen.add(i.hex);
        const b = bom.byHex[i.hex];
        if (!b || !matchQ(i, ql)) return false;
        if (bomSel && ((bomSel.nsp !== undefined && nspOfB(i) !== bomSel.nsp) || (bomSel.xuong !== undefined && xuongOf(i) !== bomSel.xuong))) return false;
        if (filter === 'afterNeed') return b.afterNeed > 0;
        if (filter === 'issue') return b.issues.length > 0;
        return filter === 'all' || b.state === filter;
      })
      .sort((a, b) =>
        sortBy === 'priority'
          ? rank(a) - rank(b) || need(a) - need(b) || timeOf(a.deadline) - timeOf(b.deadline) || b.remain - a.remain
          : sortBy === 'deadline'
            // Ngày cần VT sớm nhất trong nhóm còn chờ vật tư trước; hạng mục đã xong vật tư / đã nhập kho đủ xuống cuối
            ? pendingFirst(a) - pendingFirst(b) || need(a) - need(b) || timeOf(a.deadline) - timeOf(b.deadline) || rank(a) - rank(b)
            : pendingFirst(a) - pendingFirst(b) || b.remain - a.remain);
  }, [items, bom, filter, q, sortBy, bomSel]);

  const total = useMemo(() => new Set(items.map(i => i.hex)).size, [items]);

  // Nhóm sản phẩm × Tình trạng vật tư (mỗi hạng mục 1 lần, theo tình trạng xấu nhất)
  const bang = useMemo(() => {
    if (!bom) return null;
    const rowsM = new Map<string, DongNsp>();
    const colTot: Record<string, number> = {};
    let grand = 0;
    const seen = new Set<string>();
    for (const i of items) {
      if (seen.has(i.hex)) continue;
      seen.add(i.hex);
      const st = bom.byHex[i.hex]?.state;
      if (!st) continue;
      const v = bomMetric === 'count' ? 1 : i.remain;
      congDong(rowsM, nspOfB(i), xuongOf(i), st, v);
      colTot[st] = (colTot[st] ?? 0) + v;
      grand += v;
    }
    // Chỉ hiện cột có hạng mục
    const nhom = BOM_COT.map(g => ({ ...g, states: g.states.filter(k => (colTot[k] ?? 0) > 0) })).filter(g => g.states.length > 0);
    const rows = [...rowsM.entries()].map(([nsp, row]) => ({ nsp, ...row, xs: [...row.xs.entries()].sort((a, b) => sapXuong(a[0], b[0])) }))
      .sort((x, y) => (x.nsp === NO_NSP ? 1 : y.nsp === NO_NSP ? -1 : x.nsp.localeCompare(y.nsp, 'vi', { numeric: true })));
    return { nhom, rows, colTot, grand };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, bom, bomMetric]);
  const fmtBm = (v: number) => (bomMetric === 'count' ? fmtInt(v) : fmtTy(v));
  const laChon = (st: BomState | 'all', sel: { nsp?: string; xuong?: string } | null) =>
    filter === st && (bomSel?.nsp ?? null) === (sel?.nsp ?? null) && (bomSel?.xuong ?? null) === (sel?.xuong ?? null);
  const chon = (st: BomState | 'all', sel: { nsp?: string; xuong?: string } | null) => {
    if (laChon(st, sel)) { setFilter('all'); setBomSel(null); } else { setFilter(st); setBomSel(sel); }
  };
  const oBom = (v: number | undefined, st: BomState | 'all', sel: { nsp?: string; xuong?: string } | null, cls = '') => (
    <td onClick={v ? () => chon(st, sel) : undefined}
      className={`${td} whitespace-nowrap text-right tabular-nums ${v ? 'cursor-pointer hover:bg-amber-50' : 'text-slate-300'} ${laChon(st, sel) ? 'bg-amber-100 font-semibold' : ''} ${cls}`}>
      {v ? fmtBm(v) : '-'}
    </td>
  );

  const dateCell = (d: Date | null, cls = 'text-slate-600') => (
    <td className={`${td} whitespace-nowrap tabular-nums ${d ? cls : 'text-slate-300'}`}>{d ? fmtDate(d) : '—'}</td>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onOpenMaterial('matched')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100"
        >
          <Package size={14} /> Vật tư theo hạng mục / Theo PR
        </button>
      </div>

      {/* Tóm tắt: 2 nhóm dòng PR tách rời nhau — có mã nhà máy (gắn hạng mục) / không mã (chung công trình) */}
      <p className="text-xs text-slate-600">
        <span className="font-semibold text-slate-800">Vật tư công trình:</span>{' '}
        {bom ? fmtInt(bom.lineTotal) : '…'} dòng PR gắn hạng mục (có mã nhà máy, phục vụ hạng mục chưa nhập kho đủ)
        {' + '}{projectSum ? fmtInt(projectSum.lines) : '…'} dòng chung của công trình (không mã, không tính hủy).
        <span className="text-slate-400"> Hai nhóm không trùng nhau: 1 dòng PR hoặc có mã nhà máy, hoặc không.</span>
      </p>

      {/* A + C: vật tư chung của công trình (không gắn được hạng mục) + danh sách cần bổ sung mã nhà máy */}
      <ProjectMaterialSection rows={projectLines} today={today} fileTag={projectTag} />

      {/* Phân bổ dòng PR theo trạng thái (chỉ dòng phục vụ hạng mục chưa nhập kho đủ) */}
      {bom && bom.lineTotal > 0 && (
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-700">
            Dòng PR gắn hạng mục (có mã nhà máy){' '}
            <span className="font-normal text-slate-500">· {fmtInt(bom.lineTotal)} dòng phục vụ hạng mục chưa nhập kho đủ</span>
          </p>
          <LineStateBreakdown
            counts={bom.lineCounts}
            canPick={k => k !== 'pending' && !!BOM_FROM_LINE[k]}
            isActive={k => k !== 'pending' && BOM_FROM_LINE[k] === filter}
            onPick={k => { const bs = k === 'pending' ? undefined : BOM_FROM_LINE[k]; if (bs) setFilter(prev => (prev === bs ? 'all' : bs)); }}
          />
          <p className="mt-1 text-[0.6875rem] text-slate-500">
            Số trên biểu đồ = số <b>dòng PR</b>. Bấm nhãn còn chờ / tạm dừng (trên thanh hoặc chú thích) để lọc danh sách <b>hạng mục</b> bên dưới có nhãn đó là tình trạng xấu nhất (gia công chưa đặt + đang đặt gộp "Gia công ngoài") — số ở nút lọc là số hạng mục.
          </p>
          <p className="mt-2 text-[0.6875rem] text-slate-400">
            Nhóm cấp 1 theo 2 cột TRẠNG THÁI / TRẠNG THÁI SAP: Chưa mua (1.CHƯA MUA / Mở) · Đang mua (2.ĐANG MUA / Mở) ·
            Đã nhập kho – Hoàn thành (3.ĐÃ NHẬP KHO / Hoàn thành, đã nhận đủ) · Đã nhập kho – Đóng PR (3.ĐÃ NHẬP KHO / Đóng: nhận đủ /
            nhận 1 phần / có PO chưa nhận / không PO). Còn chờ hàng về = Chưa mua + Gia công ngoài + Đang mua (trễ / về theo nhu cầu SX /
            chưa tới hẹn) + Kho báo về chờ nhập SAP; % tính trên tổng không gồm dòng hủy. Rê chuột vào từng nhãn để xem chi tiết.
          </p>
        </div>
      )}

      {/* Nhóm sản phẩm × Tình trạng vật tư — giống bảng BOP / BOT */}
      {bang && bang.rows.length > 0 && (
        <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold text-slate-700">
              Nhóm sản phẩm × Tình trạng vật tư{' '}
              <span className="font-normal text-slate-500">· mỗi hạng mục tính 1 lần theo tình trạng xấu nhất · bấm số, tên nhóm / xưởng hoặc tên cột để lọc danh sách</span>
            </p>
            <div className="ml-auto flex gap-1">
              <Chip active={bomMetric === 'count'} onClick={() => setBomMetric('count')}>Số hạng mục</Chip>
              <Chip active={bomMetric === 'remain'} onClick={() => setBomMetric('remain')}>Còn lại (tỷ)</Chip>
            </div>
          </div>
          <div className="max-h-[50vh] overflow-auto rounded-lg border border-slate-200 custom-scrollbar">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
                <tr>
                  <th className={`${th} sticky left-0 z-20 bg-slate-50 text-left`} rowSpan={2}>
                    Nhóm sản phẩm / xưởng
                    <NutMoTatCa onMo={() => setMoNspBom(new Set(bang.rows.map(x => x.nsp)))} onThu={() => setMoNspBom(new Set())} />
                  </th>
                  {bang.nhom.map(g => (
                    <th key={g.nhom} colSpan={g.states.length} className={`${th} border-l border-slate-200 text-center text-[0.6875rem] font-semibold uppercase tracking-wide`}>{g.nhom}</th>
                  ))}
                  <th className={`${th} border-l border-slate-200 bg-slate-100 text-right`} rowSpan={2}>Tổng cộng</th>
                </tr>
                <tr>
                  {bang.nhom.map(g => g.states.map((k, ki) => (
                    <th key={k} className={`${th} whitespace-nowrap text-right ${ki === 0 ? 'border-l border-slate-200' : ''}`}>
                      <button type="button" onClick={() => chon(k, null)} title={`${BOM_META[k].label} — ${BOM_META[k].hint}`}
                        className={`inline-flex items-center gap-1 rounded px-1 font-semibold hover:bg-amber-50 ${laChon(k, null) ? 'bg-amber-100 text-slate-900' : 'text-slate-700'}`}>
                        {BOM_DOT[k] && <span className={`inline-block h-2 w-2 rounded-sm ${BOM_DOT[k]}`} />}{BOM_NGAN[k]}
                      </button>
                    </th>
                  )))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bang.rows.map(row => (
                  <React.Fragment key={row.nsp}>
                    <tr className="hover:bg-slate-50/60">
                      <td className={`${td} sticky left-0 whitespace-nowrap bg-white`}>
                        <button type="button" onClick={() => setMoNspBom(prev => { const n = new Set(prev); if (n.has(row.nsp)) n.delete(row.nsp); else n.add(row.nsp); return n; })}
                          title="Xem theo xưởng" className="inline-block w-4 text-slate-400 hover:text-slate-900">{moNspBom.has(row.nsp) ? '▾' : '▸'}</button>
                        <button type="button" onClick={() => chon('all', { nsp: row.nsp })} title={`Lọc danh sách: ${row.nsp}`}
                          className={`rounded px-1 text-left font-medium hover:bg-amber-50 hover:underline ${laChon('all', { nsp: row.nsp }) ? 'bg-amber-100 text-slate-900' : 'text-slate-800'}`}>{row.nsp}</button>
                      </td>
                      {bang.nhom.map(g => g.states.map((k, ki) => (
                        <React.Fragment key={k}>{oBom(row.cells[k], k, { nsp: row.nsp }, ki === 0 ? 'border-l border-slate-100' : '')}</React.Fragment>
                      )))}
                      {oBom(row.total, 'all', { nsp: row.nsp }, 'border-l border-slate-200 bg-slate-100 font-semibold text-slate-900')}
                    </tr>
                    {moNspBom.has(row.nsp) && row.xs.map(([x, xr]) => (
                      <tr key={x} className="bg-slate-50/40 text-slate-600">
                        <td className={`${td} sticky left-0 whitespace-nowrap bg-slate-50 pl-9`}>
                          <button type="button" onClick={() => chon('all', { nsp: row.nsp, xuong: x })} title={`Lọc danh sách: ${row.nsp} · ${x}`}
                            className={`rounded px-1 hover:bg-amber-50 hover:underline ${laChon('all', { nsp: row.nsp, xuong: x }) ? 'bg-amber-100 font-semibold text-slate-900' : ''}`}>{x}</button>
                        </td>
                        {bang.nhom.map(g => g.states.map((k, ki) => (
                          <React.Fragment key={k}>{oBom(xr.cells[k], k, { nsp: row.nsp, xuong: x }, ki === 0 ? 'border-l border-slate-100' : '')}</React.Fragment>
                        )))}
                        {oBom(xr.total, 'all', { nsp: row.nsp, xuong: x }, 'border-l border-slate-200 bg-slate-100')}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-slate-100 font-semibold text-slate-800">
                <tr>
                  <td className={`${td} sticky left-0 bg-slate-100`}>Tổng cộng</td>
                  {bang.nhom.map(g => g.states.map((k, ki) => (
                    <td key={k} className={`${td} text-right tabular-nums ${ki === 0 ? 'border-l border-slate-200' : ''}`}>{fmtBm(bang.colTot[k] ?? 0)}</td>
                  )))}
                  <td className={`${td} border-l border-slate-200 text-right tabular-nums`}>{fmtBm(bang.grand)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {bomSel && (
            <div className="mt-1.5">
              <Chip active onClick={() => { setBomSel(null); }}>{[bomSel.nsp, bomSel.xuong].filter(Boolean).join(' · ')} ✕</Chip>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-700" title="Mỗi hạng mục lấy tình trạng xấu nhất trong các dòng PR của nó">Số hạng mục theo tình trạng vật tư:</span>
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>Tất cả ({fmtInt(total)})</Chip>
        {BOM_CHIP_ORDER.map(k => BOM_META[k]).map(s => (
          <span key={s.key} title={s.hint}>
            <Chip active={filter === s.key} tone={s.tone} onClick={() => setFilter(s.key)}>
              {BOM_DOT[s.key] && <span className={`mr-1.5 inline-block h-2 w-2 rounded-sm align-middle ${BOM_DOT[s.key]}`} />}
              {s.label} ({bom ? fmtInt(bom.counts[s.key]) : '…'})
            </Chip>
          </span>
        ))}
        <span title="Có dòng PR còn chờ sẽ về sau Ngày cần vật tư (chưa mua mà đã qua ngày cần, hoặc ngày dự kiến giao / hôm nay sau ngày cần) — không tính hàng về theo nhu cầu SX / dùng tồn kho trước">
          <Chip active={filter === 'afterNeed'} tone="red" onClick={() => setFilter('afterNeed')}>
            <AlertTriangle size={11} className="-mt-0.5 mr-1 inline" />VT về sau ngày cần ({bom ? fmtInt(bom.afterNeed) : '…'})
          </Chip>
        </span>
        <span title="Hạng mục có vướng mắc loại M3 – Vật tư chưa xử lý">
          <Chip active={filter === 'issue'} tone="red" onClick={() => setFilter('issue')}>
            Có vướng mắc VT – M3 ({bom && materialIssues !== null ? fmtInt(bom.issueHexes) : '…'})
          </Chip>
        </span>
        <div className="ml-auto flex items-center gap-3">
          <SortPicker
            value={sortBy}
            onChange={setSortBy}
            options={[['priority', 'Ưu tiên (trễ → chưa mua)'], ['deadline', 'Ngày cần VT gần nhất'], ['remain', 'Giá trị còn lại']]}
          />
          <SearchBox value={q} onChange={setQ} placeholder="Tìm hex, hạng mục..." />
        </div>
      </div>
      <p className="-mt-2 text-[0.6875rem] text-slate-500">
        Ngày lấy từ bảng vật tư: Ngày PR (sớm nhất) · Ngày cần vật tư (sớm nhất của dòng còn chờ) · Ngày dự kiến giao hàng PMH nhập (muộn nhất của dòng đang mua) ·
        Ngày thực tế về / posting (muộn nhất). Mỗi hạng mục lấy trạng thái xấu nhất trong các dòng PR của nó.
        "CCLD" = NCC cung cấp + lắp đặt tại công trình (không về kho nhà máy) và "PR đã đóng" = SAP đóng PR khi chưa nhận đủ — đều không tính là thiếu. Một dòng mua gộp tính cho mọi hạng mục nó phục vụ.
      </p>

      {issueHex && bom?.byHex[issueHex] && (
        <div className="rounded-lg border border-red-200 bg-red-50/40 p-3">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-xs font-semibold text-red-700">
              Vướng mắc vật tư (M3) · {issueHex} · {items.find(x => x.hex === issueHex)?.hangMuc}
            </p>
            <button type="button" onClick={() => setIssueHex(null)} className="ml-auto rounded px-2 text-xs text-slate-500 hover:bg-white">Đóng ✕</button>
          </div>
          <ul className="space-y-1.5">
            {bom.byHex[issueHex].issues.map(v => (
              <li key={v.id} className="rounded-md bg-white px-3 py-2 text-xs text-slate-700 shadow-sm">
                <p className="whitespace-pre-line">{v.content}</p>
                <p className="mt-1 text-[0.6875rem] text-slate-500">
                  {v.handler ? `Người xử lý: ${v.handler} · ` : ''}{v.bot ? `BOT: ${new Date(v.bot).toLocaleDateString('vi-VN')} · ` : ''}
                  Tạo bởi {v.createdBy} · {new Date(v.createdAt).toLocaleDateString('vi-VN')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!bom ? (
        <p className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-400">Đang kiểm tra vật tư…</p>
      ) : (
        <HexTable
          rows={list}
          planDates={false}
          onHexClick={onOpenHex}
          hexClickTitle="Xem chi tiết vật tư của hạng mục này"
          extraHead={<>
            <th className={`${th} text-right`} title="Số dòng PR (vật tư) đã nối được với hạng mục qua mã nhà máy / Item note PR — gồm mọi trạng thái còn hiệu lực: chưa mua, đang mua, đã nhận, CCLD, đã đóng (không tính dòng đã hủy)">Số dòng PR</th>
            <th className={`${th} text-right`} title="Dòng 1.CHƯA MUA">Chưa mua</th>
            <th className={`${th} text-right`} title="Dòng PR gia công ngoài (nhóm 806 / ghi chú GC…) chưa đặt hoặc chưa về">Gia công</th>
            <th className={`${th} text-right`} title="Đang mua, quá ngày dự kiến giao">Trễ hẹn</th>
            <th className={`${th} text-right`} title="Đang mua, quá ngày dự kiến giao nhưng ghi chú về theo nhu cầu SX / dùng tồn kho trước">Theo nhu cầu SX</th>
            <th className={`${th} text-right`} title="Đang mua, chưa tới ngày dự kiến giao">Chưa tới hẹn</th>
            <th className={`${th} text-left`} title="Ngày PR sớm nhất">Ngày PR</th>
            <th className={`${th} text-left`} title="Ngày cần vật tư sớm nhất của các dòng còn chờ">Ngày cần VT</th>
            <th className={`${th} text-left`} title="Hạn giao muộn nhất của các dòng đang mua: Ngày dự kiến giao hàng PMH nhập, hoặc ngày hẹn mới Team PR ghi trong ghi chú (nếu muộn hơn)">Dự kiến giao PMH</th>
            <th className={`${th} text-left`} title="Posting date — ngày thực tế về muộn nhất">Thực tế về</th>
            <th className={`${th} text-right`} title="Vướng mắc M3 – Vật tư chưa xử lý (bấm để xem)">VM vật tư</th>
            <th className={`${th} text-left`} title="Định mức vật tư của hạng mục và tình trạng mua do kế hoạch ghi ở bảng sản xuất — có cả vật tư mua gộp theo công trình (không cần PR ghi mã). Bấm HEX để xem đủ.">Định mức NVL (bảng SX)</th>
            <th className={`${th} text-left`}>Tình trạng vật tư</th>
          </>}
          extraCells={i => {
            const b = bom.byHex[i.hex];
            const n = (k: MaterialLineState | MaterialLineState[], cls: string) => {
              const v = ([] as MaterialLineState[]).concat(k).reduce((t, x) => t + (b?.byLine[x] ?? 0), 0);
              return <td className={`${td} text-right tabular-nums ${v ? cls : 'text-slate-300'}`}>{v || '—'}</td>;
            };
            const meta = BOM_META[b?.state ?? 'noneBeforeSx'];
            const pending = !!b && (b.state === 'notOrdered' || b.state === 'late' || b.state === 'outsourced' || b.state === 'deferred' || b.state === 'onTrack');
            const needLate = !!b && b.afterNeed > 0;
            const dueLate = pending && !!b?.dueDate && b.dueDate.getTime() < today;
            return (
              <>
                <td className={`${td} text-right tabular-nums`}>{b?.lines || '—'}</td>
                {n('notOrdered', 'font-semibold text-rose-600')}
                {n(['gcNotOrdered', 'outsourced'], 'text-fuchsia-700')}
                {n('late', 'font-semibold text-orange-600')}
                {n('deferred', 'text-yellow-700')}
                {n('onTrack', 'text-amber-700')}
                {dateCell(b?.prDate ?? null)}
                <td
                  className={`${td} whitespace-nowrap tabular-nums ${!b?.needDate ? 'text-slate-300' : needLate ? 'font-semibold text-red-600' : 'text-slate-600'}`}
                  title={needLate ? `${b!.afterNeed} dòng sẽ về sau ngày cần vật tư` : undefined}
                >
                  {b?.needDate ? fmtDate(b.needDate) : '—'}
                  {needLate && <span className="ml-1 text-[0.625rem] font-normal">({b!.afterNeed} dòng trễ)</span>}
                </td>
                {dateCell(pending ? b!.dueDate : null, dueLate ? 'font-semibold text-orange-600' : 'text-slate-600')}
                {dateCell(b?.arrivedDate ?? null, 'text-emerald-700')}
                <td className={`${td} text-right tabular-nums`}>
                  {materialIssues === null ? '…' : b?.issues.length ? (
                    <button
                      type="button"
                      onClick={() => setIssueHex(i.hex)}
                      className="rounded px-1.5 font-semibold text-red-600 hover:bg-red-50 hover:underline"
                      title="Xem vướng mắc vật tư"
                    >
                      {b.issues.length}
                    </button>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                {(() => {
                  if (nvlByHex === null) return <td className={`${td} text-slate-300`}>…</td>;
                  const raw = nvlByHex[i.hex];
                  const needs = parseNvlNeeds(raw);
                  const status = parseNvlStatus(raw);
                  const pendingN = status.filter(nvlLinePending).length;
                  if (!needs.length && !status.length) return <td className={`${td} text-slate-300`}>—</td>;
                  // Không có định mức (ô định mức trống ở bảng SX — ~1.500 hạng mục, hoặc chỉ có dòng BTP) nhưng có tình
                  // trạng mua: hiện tên vật tư SAP của các dòng tình trạng (ưu tiên dòng còn chờ) thay cho "—"
                  const fmtQ = (v: number | null) => (v === null ? '?' : Number(v.toFixed(3)).toLocaleString('vi-VN'));
                  const statusFull = status.map(l => `${nvlLinePending(l) ? '• còn chờ' : '• xong'}: ${l.name}${l.left !== null ? ` — còn ${fmtQ(l.left)}/${fmtQ(l.req)}` : ''}${l.due ? ` — giao ${l.due}` : ''}`).join('\n');
                  const needsFull = needs.map(n => `${NVL_GROUP_LABEL[n.group]}: ${n.name}${n.qty !== null ? ` ${Number(n.qty.toFixed(3))} ${n.dvt}` : ''}`).join('\n');
                  const full = needs.length
                    ? needsFull + (statusFull ? `\n\nTình trạng mua:\n${statusFull}` : '')
                    : `Bảng SX không ghi định mức — tên vật tư lấy từ tình trạng mua:\n${statusFull}`;
                  // Hiện ĐỦ thông tin, mỗi vật tư 1 dòng, tự xuống dòng (trước cắt "…" chỉ còn 2 vật tư đầu)
                  const statusSorted = [...status.filter(nvlLinePending), ...status.filter(l => !nvlLinePending(l))];
                  return (
                    <td className={`${td} min-w-[300px] max-w-[440px] align-top`} title={full || undefined}>
                      {needs.length > 0 ? (
                        <ul className="space-y-0.5 text-[0.6875rem] leading-snug text-slate-600">
                          {needs.map((n, k) => (
                            <li key={k} className="break-words">
                              {n.name}{n.qty !== null && <span className="whitespace-nowrap font-semibold tabular-nums text-slate-800"> {Number(n.qty.toFixed(3)).toLocaleString('vi-VN')} {n.dvt}</span>}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <ul className="space-y-0.5 text-[0.6875rem] leading-snug">
                          <li className="italic text-slate-400">Bảng SX không ghi định mức — theo PR:</li>
                          {statusSorted.map((l, k) => (
                            <li key={k} className={`break-words ${nvlLinePending(l) ? 'text-slate-700' : 'text-slate-400'}`}>
                              {l.name || '(không tên)'}
                              {l.left !== null && (
                                <span className={`whitespace-nowrap tabular-nums ${nvlLinePending(l) ? 'font-semibold text-amber-700' : 'text-emerald-700'}`}>
                                  {' '}{nvlLinePending(l) ? `còn ${fmtQ(l.left)}/${fmtQ(l.req)}` : 'đã về đủ'}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {status.length > 0 && (
                        <span className={`text-[0.625rem] ${pendingN ? 'font-semibold text-amber-700' : 'text-emerald-700'}`}>
                          {pendingN ? `${pendingN}/${status.length} dòng mua còn chờ` : `${status.length} dòng mua đã xong`}
                        </span>
                      )}
                    </td>
                  );
                })()}
                <td className={td}>
                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[0.625rem] font-semibold ${meta.badge}`} title={meta.hint}>
                    {meta.label}
                  </span>
                  {/* Chưa nối được PR nhưng người dùng đã báo vướng mắc vật tư */}
                  {(b?.state === 'noneBeforeSx' || b?.state === 'noneInSx' || b?.state === 'noneNotDeployed') && b.issues.length > 0 && (
                    <span className="ml-1 whitespace-nowrap rounded-full bg-red-600 px-1.5 py-0.5 text-[0.625rem] font-semibold text-white">có VM vật tư</span>
                  )}
                </td>
              </>
            );
          }}
        />
      )}
    </div>
  );
};

// Ô ngày kế hoạch: ngày đang dùng để tính BOT (KH nhập kho tuần → tháng) in đậm, đỏ nếu quá hạn / cam nếu sắp
// hạn; ngày còn lại hiện mờ. Cột "Cần giao" chỉ để tham khảo (không tính hạn).
export const PlanDateCell = ({ i, which }: { i: HexInfo; which: DeadlineSource | 'cần giao' }) => {
  const d = which === 'tuần' ? i.khnkTuan : which === 'tháng' ? i.khnkThang : i.canGiao;
  const used = which !== 'cần giao' && i.deadlineSource === which;
  const met = (which === 'tuần' && i.khnkTuanMet) || (which === 'tháng' && i.khnkThangMet);
  const cls = !d ? 'text-slate-300'
    : !used ? 'text-slate-400'
      : i.overdue ? 'font-semibold text-red-600' : i.dueSoon ? 'font-semibold text-amber-600' : 'font-semibold text-slate-700';
  return (
    <td
      className={`${td} whitespace-nowrap tabular-nums ${cls}`}
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
const HexTable = ({ rows, extraHead, extraCells, planDates = true, onHexClick, hexClickTitle }: {
  rows: HexInfo[];
  extraHead: React.ReactNode;
  extraCells: (i: HexInfo) => React.ReactNode;
  planDates?: boolean;
  onHexClick?: (hex: string) => void;   // bấm mã HEX (vd. tab BOM mở cửa sổ vật tư)
  hexClickTitle?: string;
}) => (
  <div className="max-h-[78vh] overflow-auto rounded-lg border border-slate-200 custom-scrollbar">
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-slate-50 text-slate-500">
        <tr>
          <th className={`${th} w-10 text-right`}>STT</th>
          <th className={`${th} text-left`}>Mã Hex</th>
          <th className={`${th} text-left`}>Hạng mục</th>
          <th className={`${th} text-left`}>Công đoạn</th>
          <th className={`${th} text-left`}>Xưởng</th>
          {planDates && <>
            <th className={`${th} text-left`}>KH tuần</th>
            <th className={`${th} text-left`}>KH tháng</th>
            <th className={`${th} text-left`}>Cần giao</th>
          </>}
          <th className={`${th} text-right`}>Trị giá (tỷ)</th>
          <th className={`${th} text-right`}>Còn lại (tỷ)</th>
          {extraHead}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((i, idx) => (
          <tr key={i.hex} className="hover:bg-slate-50">
            <td className={`${td} text-right tabular-nums text-slate-400`}>{idx + 1}</td>
            <td className={`${td} font-medium text-slate-800`}>
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
            <td className={`${td} min-w-[200px] max-w-[320px] break-words text-slate-600`} title={i.hangMuc}>{i.hangMuc}</td>
            <td className={`${td} text-slate-600`}>{i.stage ?? '—'}</td>
            <td className={`${td} whitespace-nowrap text-slate-600`}>{i.area || '—'}</td>
            {planDates && <>
              <PlanDateCell i={i} which="tuần" />
              <PlanDateCell i={i} which="tháng" />
              <PlanDateCell i={i} which="cần giao" />
            </>}
            <td className={`${td} text-right tabular-nums text-slate-600`}>{fmtTy(i.total)}</td>
            <td className={`${td} text-right tabular-nums ${i.remain > 0 ? 'text-amber-700' : 'text-emerald-600'}`}>
              {i.remain > 0 ? fmtTy(i.remain) : fmtTy(0)}
            </td>
            {extraCells(i)}
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={22} className="px-3 py-8 text-center text-slate-400">Không có hạng mục phù hợp.</td></tr>
        )}
      </tbody>
    </table>
  </div>
);
