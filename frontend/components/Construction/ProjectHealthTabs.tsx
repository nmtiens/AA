import React, { useMemo, useState } from 'react';
import { Search, Package, AlertTriangle, Download } from 'lucide-react';
import type { RemainBucket } from '../Dashboard/hooks/usePivotTables';
import type { VuongMacItem } from '../../services/vuongMacService';
import {
  materialLineState, isMaterialPending, parsePlanDate, dwellBucket, DWELL_STUCK, DWELL_NONE, type DwellKey,
  type DeadlineSource, type MaterialLineState, type MaterialLineFields, stageRank,
} from '../../utils/productionMetrics';
import { formatTrieuAsTy } from '../../utils/money';
import { fmtInt, fmtDate, DAY_MS as DAY } from '../../utils/format';
import { parseNvlNeeds, parseNvlStatus, nvlLinePending, summarizeNeeds, NVL_GROUP_LABEL, type NvlRaw } from '../../utils/nvlParse';
import { STEPS, qcStateOf, QC_STATE_META, QC_STATUS_VI, gcnPending, type HexExtra, type StepKey } from '../../services/productionExtraService';

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
  dwell: string | null;        // thời gian ở công đoạn hiện tại (so_ngay_cd_hien_tai)
  bucket: RemainBucket | null; // nhóm của phần GIÁ TRỊ còn lại (null = không còn giá trị chưa nhập)
  /** Còn phải theo dõi (đếm / tính hạn): chưa nhập đủ giá trị và chưa nhập đủ số lượng, hoặc trị giá 0 */
  open: boolean;
  total: number;               // triệu đồng
  inv: number;                 // đã nhập kho (triệu, đã chặn không vượt trị giá)
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
const SOURCE_SHORT: Record<DeadlineSource, string> = { 'tuần': 'KH tuần', 'tháng': 'KH tháng' };

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
  // Lọc thêm theo mốc tham khảo / tuổi đơn (cộng thêm vào lọc nhóm hạn)
  const [ref, setRef] = useState<RefKey | null>(null);
  const [age, setAge] = useState<AgeBucket | null>(null);

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
    i.deadline ? `${i.deadline.getFullYear()}-${String(i.deadline.getMonth() + 1).padStart(2, '0')}` : '~';
  const monthLabel = (k: string) => (k === '~' ? 'Chưa có KH nhập kho' : `${k.slice(5)}/${k.slice(0, 4)}`);
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

  // Tổng theo tháng kế hoạch (trị giá / đã nhập / còn lại) — mọi hạng mục, kể cả đã nhập đủ
  const byMonth = useMemo(() => {
    const m = new Map<string, { key: string; n: number; total: number; inv: number; remain: number; overdue: number }>();
    items.forEach(i => {
      const key = monthOf(i);
      const e = m.get(key) ?? { key, n: 0, total: 0, inv: 0, remain: 0, overdue: 0 };
      e.n++; e.total += i.total; e.inv += i.inv; e.remain += i.remain; if (i.overdue) e.overdue++;
      m.set(key, e);
    });
    return [...m.values()].sort((a, b) => (a.key === '~' ? 1 : b.key === '~' ? -1 : a.key.localeCompare(b.key)));
     
  }, [items]);

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return open
      .filter(i => inGroup(i) && (month === null || monthOf(i) === month) && matchQ(i, ql))
      .filter(i => ref === null || pastRef(i, ref))
      .filter(i => age === null || ageBucketOf(i, today) === age)
      .sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity) || b.remain - a.remain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group, month, q, today, ref, age]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {BOT_GROUPS.map(g => (
          <button
            key={g.key}
            type="button"
            title={g.hint}
            onClick={() => setGroup(group === g.key ? 'all' : g.key)}
            className={`rounded-lg border px-3 py-2 text-left transition ${group === g.key ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200 hover:border-slate-400'}`}
          >
            <p className="text-[0.6875rem] text-slate-500">{g.label}</p>
            <p className={`text-xl font-semibold tabular-nums ${g.tone === 'red' && counts[g.key].n ? 'text-red-600' : g.tone === 'amber' && counts[g.key].n ? 'text-amber-600' : 'text-slate-900'}`}>
              {fmtInt(counts[g.key].n)}
            </p>
            <p className="text-[0.625rem] text-slate-400">{fmtTy(counts[g.key].remain)} tỷ chưa nhập kho</p>
          </button>
        ))}
      </div>
      {extra.planAfterDue > 0 && (
        <div className="-mt-2 flex flex-wrap items-center gap-2">
          <span title="KH nhập kho tuần / tháng đang dùng muộn hơn ngày cần giao — biết trước sẽ giao trễ, cần xem lại KH hoặc báo PM">
            <Chip active={group === 'planAfterDue'} tone="amber" onClick={() => setGroup(group === 'planAfterDue' ? 'all' : 'planAfterDue')}>
              <AlertTriangle size={11} className="-mt-0.5 mr-1 inline" />KH NK sau ngày cần giao ({fmtInt(extra.planAfterDue)})
            </Chip>
          </span>
        </div>
      )}

      {/* Mốc tham khảo + tuổi đơn: 85% hạng mục đang sản xuất KHÔNG có KH nhập kho tuần / tháng nên chỉ nhìn BOT thì
          không thấy gì — các mốc này giúp thấy hạng mục đã lố ngày cần giao / BOT dự án hoặc nằm quá lâu từ khi nhận PM */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-1.5 text-xs font-semibold text-slate-700">
            Mốc tham khảo <span className="font-normal text-slate-500">· không tính hạn, chỉ để rà hạng mục chưa có KH nhập kho</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {REF_DEADLINES.map(r => (
              <span key={r.key} title={r.hint}>
                <Chip active={ref === r.key} tone={refCounts[r.key] ? 'red' : 'slate'} onClick={() => setRef(ref === r.key ? null : r.key)}>
                  {r.label} ({fmtInt(refCounts[r.key])})
                </Chip>
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-1.5 text-xs font-semibold text-slate-700">
            Tuổi đơn <span className="font-normal text-slate-500">· số ngày từ ngày nhận PM tới nay, hạng mục chưa nhập kho đủ</span>
          </p>
          {hasAge ? (
            <div className="flex flex-wrap gap-1.5">
              {AGE_BUCKETS.map(b => (
                <span key={b.key} title={`${fmtTy(ageCounts[b.key].remain)} tỷ chưa nhập kho`}>
                  <Chip active={age === b.key} tone={ageCounts[b.key].n ? b.tone : 'slate'} onClick={() => setAge(age === b.key ? null : b.key)}>
                    {b.label} ({fmtInt(ageCounts[b.key].n)})
                  </Chip>
                </span>
              ))}
              {ageCounts.none.n > 0 && <span className="self-center text-[0.6875rem] text-slate-400">· {fmtInt(ageCounts.none.n)} chưa có ngày nhận PM</span>}
            </div>
          ) : <p className="text-xs text-slate-400">Dữ liệu chưa có ngày nhận PM (sẽ có sau lần tải dữ liệu kế tiếp).</p>}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-700">
          Theo tháng kế hoạch <span className="font-normal text-slate-500">· KH nhập kho tuần → tháng · bấm 1 tháng (hoặc số quá hạn) để lọc danh sách</span>
        </p>
        <div className="overflow-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className={`${th} text-left`}>Tháng</th>
                <th className={`${th} text-right`}>Hạng mục</th>
                <th className={`${th} text-right`}>Trị giá (tỷ)</th>
                <th className={`${th} text-right`}>Đã nhập kho (tỷ)</th>
                <th className={`${th} text-right`}>Còn lại (tỷ)</th>
                <th className={`${th} text-right`}>Quá hạn</th>
                <th className={`${th} text-left w-40`}>% nhập kho</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {byMonth.map(m => {
                const pct = m.total > 0 ? (m.inv / m.total) * 100 : 0;
                return (
                  <tr
                    key={m.key}
                    onClick={() => { setMonth(month === m.key && group === 'all' ? null : m.key); setGroup('all'); }}
                    title="Lọc danh sách hạng mục theo tháng này"
                    className={`cursor-pointer ${month === m.key ? 'bg-amber-50' : 'hover:bg-slate-50'}`}
                  >
                    <td className={`${td} ${month === m.key ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{monthLabel(m.key)}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtInt(m.n)}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtTy(m.total)}</td>
                    <td className={`${td} text-right tabular-nums text-emerald-700`}>{fmtTy(m.inv)}</td>
                    <td className={`${td} text-right tabular-nums text-amber-700`}>{fmtTy(m.remain)}</td>
                    <td className={`${td} text-right tabular-nums ${m.overdue ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
                      {m.overdue ? (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            const on = month === m.key && group === 'overdue';
                            setMonth(on ? null : m.key); setGroup(on ? 'all' : 'overdue');
                          }}
                          title="Lọc hạng mục quá hạn của tháng này"
                          className={`rounded px-1 hover:bg-red-50 hover:underline ${month === m.key && group === 'overdue' ? 'bg-red-100' : ''}`}
                        >
                          {fmtInt(m.overdue)}
                        </button>
                      ) : '0'}
                    </td>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                          <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <span className="w-10 text-right tabular-nums text-slate-500">{pct.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold text-slate-700">Hạng mục chưa nhập kho đủ</p>
          <span className="text-[0.6875rem] text-slate-500">
            {group === 'all' ? 'tất cả nhóm' : group === 'planAfterDue' ? 'KH NK sau ngày cần giao' : BOT_GROUPS.find(g => g.key === group)?.label} · {fmtInt(list.length)} hạng mục · sắp theo ngày kế hoạch
          </span>
          {month !== null && <Chip active onClick={() => setMonth(null)}>Tháng {monthLabel(month)} ✕</Chip>}
          {ref !== null && <Chip active tone="red" onClick={() => setRef(null)}>{REF_DEADLINES.find(r => r.key === ref)?.label} ✕</Chip>}
          {age !== null && <Chip active onClick={() => setAge(null)}>Tuổi {AGE_BUCKETS.find(b => b.key === age)?.label} ✕</Chip>}
          <div className="ml-auto"><SearchBox value={q} onChange={setQ} placeholder="Tìm hex, hạng mục, công đoạn..." /></div>
        </div>
        <HexTable
          rows={list}
          onHexClick={onHexClick}
          hexClickTitle="Xem chi tiết hạng mục (BOP × BOT)"
          extraHead={<>
            <th className={`${th} text-left`} title="Nguồn của hạn đang dùng">Nguồn hạn</th>
            <th className={`${th} text-right`}>Số ngày</th>
            <th className={`${th} text-left`} title="BOT dự án — hạn chung của công trình (tham khảo)">BOT dự án</th>
            <th className={`${th} text-right`} title="Số ngày từ ngày nhận PM tới nay">Tuổi</th>
            <th className={`${th} text-right`}>Vướng mắc</th>
          </>}
          extraCells={i => {
            const days = i.deadline ? Math.floor((i.deadline.getTime() - today) / DAY) : null;
            const vm = openIssues?.[i.hex] ?? 0;
            const a = ageDays(i, today);
            const pastDa = !!i.botDuAn && i.botDuAn.getTime() < today;
            return (
              <>
                <td className={`${td} whitespace-nowrap text-slate-600`}>
                  {i.deadlineSource ? SOURCE_SHORT[i.deadlineSource] : '—'}
                  {i.planAfterDue && <span className="ml-1 rounded bg-amber-100 px-1 text-[0.625rem] font-semibold text-amber-800" title="KH nhập kho muộn hơn ngày cần giao">sau cần giao</span>}
                </td>
                <td className={`${td} text-right tabular-nums ${days !== null && days < 0 ? 'font-semibold text-red-600' : days !== null && days <= 14 ? 'text-amber-600' : 'text-slate-500'}`}>
                  {days === null ? '—' : days}
                </td>
                <td className={`${td} whitespace-nowrap tabular-nums ${!i.botDuAn ? 'text-slate-300' : pastDa ? 'text-red-600' : 'text-slate-500'}`}>{fmtDate(i.botDuAn ?? null)}</td>
                <td className={`${td} text-right tabular-nums ${a === null ? 'text-slate-300' : a > 90 ? 'font-semibold text-red-600' : a > 30 ? 'text-amber-600' : 'text-slate-500'}`} title={i.receivedPm ? `Nhận PM ${fmtDate(i.receivedPm)}` : undefined}>
                  {a === null ? '—' : a}
                </td>
                <td className={`${td} text-right tabular-nums ${vm ? 'font-semibold text-red-600' : 'text-slate-300'}`}>{openIssues === null ? '…' : vm || '—'}</td>
              </>
            );
          }}
        />
      </div>
    </div>
  );
};

// ============================================================================
// BOP — công đoạn
// ============================================================================

// BOP — giống khối "Tình trạng sản xuất" (Công đoạn × Khu vực SX, mở rộng theo Tình trạng) và
// "Báo cáo tỷ trọng điểm nghẽn" (thời gian ở công đoạn hiện tại) của trang Tổng quan, nhưng chỉ cho
// các hạng mục CÒN SẢN XUẤT (chưa nhập kho đủ) của công trình.
type BopMetric = 'count' | 'remain' | 'total';
const BOP_METRICS: { key: BopMetric; label: string; hint: string }[] = [
  { key: 'count', label: 'Số hạng mục', hint: 'Số hạng mục chưa nhập kho đủ' },
  { key: 'remain', label: 'Còn lại (tỷ)', hint: 'Giá trị CHƯA nhập kho (trị giá − đã nhập) — khớp thẻ BOP' },
  { key: 'total', label: 'Trị giá (tỷ)', hint: 'Trị giá đơn hàng ĐẦY ĐỦ của hạng mục, kể cả phần đã nhập kho (vd P021 thường đã nhập phần lớn)' },
];
// Nhóm công đoạn — cùng tên / màu với thẻ BOP ở trang tổng quan công trình
const BOP_GROUP: Record<RemainBucket, { label: string; dot: string }> = {
  notDeployed: { label: 'Chưa triển khai', dot: 'bg-slate-400' },
  p002: { label: 'Chưa tính phiếu', dot: 'bg-sky-400' },
  onLine: { label: 'Đang trên chuyền', dot: 'bg-amber-400' },
  shortfall: { label: 'Nhập kho chưa đủ', dot: 'bg-violet-400' },
};

// Thời gian ở công đoạn hiện tại — cùng nhóm với biểu đồ điểm nghẽn (utils/productionMetrics.dwellBucket)
export const DWELL: { key: DwellKey; label: string; bar: string }[] = [
  { key: '<3 NGÀY', label: '<3 ngày', bar: 'bg-green-500' },
  { key: '4-7 NGÀY', label: '4-7 ngày', bar: 'bg-blue-500' },
  { key: '2 tuần', label: '2 tuần', bar: 'bg-yellow-500' },
  { key: '3 tuần', label: '3 tuần', bar: 'bg-orange-500' },
  { key: DWELL_STUCK, label: '≥ 4 tuần', bar: 'bg-red-500' },
  { key: DWELL_NONE, label: 'Chưa có số ngày', bar: 'bg-slate-300' },
];
const dwellOf = (v: string | null): DwellKey => dwellBucket(v);

const NO_AREA = 'Chưa xác định';
type BopSel = { stage: string; area?: string; status?: string } | null;
// Lọc từ biểu đồ thời gian ở công đoạn (cộng thêm vào lọc của bảng)
type DwellSel = { stage: string; dwell: string } | null;

// Lọc thêm từ 3 khối sản lượng công đoạn / QC / gia công ngoài
type ExtraSel = { kind: 'step'; key: StepKey } | { kind: 'qc'; st: 'bad' | 'wait' | 'ok' | 'none' } | { kind: 'gcn'; st: string | 'pending' } | null;
const GCN_DONE = (st: string | null) => !gcnPending(st);

export const BopTab = ({ items, onHexClick, extra }: {
  items: HexInfo[]; onHexClick?: (hex: string) => void;
  /** Thông tin thêm theo HEX (số lượng theo công đoạn SX, QC, gia công ngoài); null = đang tải */
  extra?: Record<string, HexExtra> | null;
  today?: number;
}) => {
  const [metric, setMetric] = useState<BopMetric>('remain');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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
  // Bảng Công đoạn × Khu vực: đếm = hạng mục còn theo dõi; giá trị = mọi hạng mục còn giá trị chưa nhập (kể cả
  // đã nhập đủ SL mà lệch tiền) — để tổng tiền khớp thẻ BOP
  const pivotItems = useMemo(() => (metric === 'count' ? open : items.filter(i => i.open || i.remain > 0)), [items, open, metric]);
  const val = (i: HexInfo) => (metric === 'count' ? 1 : metric === 'remain' ? i.remain : i.total);
  const fmtV = (v: number) => (metric === 'count' ? fmtInt(v) : v ? fmtTy(v) : '-');
  const areaOf = (i: HexInfo) => i.area || NO_AREA;
  const stageOf = (i: HexInfo) => i.stage ?? '(Không rõ)';

  const pivot = useMemo(() => {
    const areas = [...new Set(pivotItems.map(areaOf))].sort((a, b) => (a === NO_AREA ? 1 : b === NO_AREA ? -1 : a.localeCompare(b)));
    type Row = { cells: Record<string, number>; total: number; n: number };
    const stages = new Map<string, Row & { statuses: Map<string, Row>; bucket: RemainBucket | null }>();
    // Nhóm giống thẻ BOP (Chưa triển khai / Chưa tính phiếu / Đang trên chuyền / Nhập kho chưa đủ) — dòng tổng nhóm
    const groups = new Map<RemainBucket, Row>();
    const colTot: Record<string, number> = {};
    let grand = 0;
    for (const i of pivotItems) {
      const v = val(i);
      const s = stageOf(i);
      if (i.bucket) {
        const g: Row = groups.get(i.bucket) ?? { cells: {}, total: 0, n: 0 };
        g.cells[areaOf(i)] = (g.cells[areaOf(i)] ?? 0) + v; g.total += v; g.n++;
        groups.set(i.bucket, g);
      }
      const st = i.status || '(Trống)';
      const a = areaOf(i);
      const r: Row & { statuses: Map<string, Row>; bucket: RemainBucket | null } = stages.get(s) ?? { cells: {}, total: 0, n: 0, statuses: new Map(), bucket: i.bucket };
      r.cells[a] = (r.cells[a] ?? 0) + v; r.total += v; r.n++;
      const sr: Row = r.statuses.get(st) ?? { cells: {}, total: 0, n: 0 };
      sr.cells[a] = (sr.cells[a] ?? 0) + v; sr.total += v; sr.n++;
      r.statuses.set(st, sr);
      stages.set(s, r);
      colTot[a] = (colTot[a] ?? 0) + v;
      grand += v;
    }
    const rows = [...stages.entries()]
      .sort((x, y) => stageRank(x[0]) - stageRank(y[0]) || x[0].localeCompare(y[0]))
      .map(([stage, r]) => ({ stage, ...r, statuses: [...r.statuses.entries()].sort((x, y) => x[0].localeCompare(y[0], 'vi')) }));
    return { areas, rows, colTot, grand, groups };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pivotItems, metric]);

  // Ô đang chọn ở bảng Công đoạn × Khu vực (công đoạn / tình trạng / khu vực)
  const matchSel = (i: HexInfo) => !sel || (
    stageOf(i) === sel.stage
    && (sel.area === undefined || areaOf(i) === sel.area)
    && (sel.status === undefined || (i.status || '(Trống)') === sel.status)
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
    return (extraSel ? open : pivotItems)
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
  }, [pivotItems, open, sel, dwellSel, extraSel, q, sortBy, extra]);

  const toggle = (s: string) => setExpanded(prev => {
    const n = new Set(prev);
    if (n.has(s)) n.delete(s); else n.add(s);
    return n;
  });
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
    ...(sel ? [sel.stage, sel.status, sel.area] : []),
    ...(dwellSel ? [...(sel ? [] : [dwellSel.stage]), DWELL.find(d => d.key === dwellSel.dwell)?.label] : []),
    extraText,
  ].filter(Boolean).join(' · ');
  const toggleExtra = (next: NonNullable<ExtraSel>) =>
    setExtraSel(cur => (cur && JSON.stringify(cur) === JSON.stringify(next) ? null : next));
  const isExtra = (next: NonNullable<ExtraSel>) => !!extraSel && JSON.stringify(extraSel) === JSON.stringify(next);

  const cell = (v: number | undefined, next: NonNullable<BopSel>, cls = '') => (
    <td
      onClick={v ? () => pick(next) : undefined}
      className={`${td} text-right tabular-nums ${v ? 'cursor-pointer hover:bg-amber-50' : 'text-slate-300'} ${isSel(next) ? 'bg-amber-100 font-semibold' : ''} ${cls}`}
    >
      {v ? fmtV(v) : '-'}
    </td>
  );

  return (
    <div className="space-y-4">
      {/* 1. Công đoạn × Khu vực sản xuất */}
      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold text-slate-700">
            Công đoạn × Khu vực sản xuất{' '}
            <span className="font-normal text-slate-500">
              · {fmtInt(open.length)} hạng mục chưa nhập kho đủ · bấm ▸ để xem theo Tình trạng, bấm tình trạng hoặc số để lọc danh sách
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
        <div className="max-h-[50vh] overflow-auto rounded-lg border border-slate-200 custom-scrollbar">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
              <tr>
                <th className={`${th} text-left`}>
                  <span className="inline-flex items-center gap-1.5">
                    BOP
                    <button type="button" title="Mở tất cả" onClick={() => setExpanded(new Set(pivot.rows.map(r => r.stage)))} className="rounded border border-slate-300 px-1 leading-4 hover:bg-white">+</button>
                    <button type="button" title="Thu gọn tất cả" onClick={() => setExpanded(new Set())} className="rounded border border-slate-300 px-1 leading-4 hover:bg-white">−</button>
                  </span>
                </th>
                <th className={`${th} text-left`}>Tình trạng</th>
                {pivot.areas.map(a => <th key={a} className={`${th} text-right`}>{a}</th>)}
                <th className={`${th} bg-slate-100 text-right`}>Tổng cộng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pivot.rows.map((r, idx) => {
                const isOpen = expanded.has(r.stage);
                // Dòng tổng nhóm (khớp thẻ BOP) trước công đoạn đầu tiên của mỗi nhóm
                const g = r.bucket && (idx === 0 || pivot.rows[idx - 1].bucket !== r.bucket) ? pivot.groups.get(r.bucket) : undefined;
                return (
                  <React.Fragment key={r.stage}>
                    {g && r.bucket && (
                      <tr className="border-t-2 border-slate-200 bg-white">
                        <td className={`${td} text-[0.6875rem] font-semibold uppercase tracking-wide text-slate-500`} colSpan={2}>
                          <span className={`mr-1.5 inline-block h-2 w-2 rounded-sm ${BOP_GROUP[r.bucket].dot}`} />
                          {BOP_GROUP[r.bucket].label} <span className="font-normal normal-case text-slate-400">· {fmtInt(g.n)} hạng mục</span>
                        </td>
                        {pivot.areas.map(a => (
                          <td key={a} className={`${td} text-right tabular-nums text-[0.6875rem] font-semibold text-slate-500`}>{g.cells[a] ? fmtV(g.cells[a]) : '-'}</td>
                        ))}
                        <td className={`${td} bg-slate-100 text-right tabular-nums text-[0.6875rem] font-semibold text-slate-600`}>{fmtV(g.total)}</td>
                      </tr>
                    )}
                    <tr className="bg-slate-50/60">
                      <td className={`${td} font-semibold text-slate-800`}>
                        <button type="button" onClick={() => toggle(r.stage)} className="inline-flex items-center gap-1.5 hover:text-slate-950">
                          <span className="inline-block w-3 text-slate-400">{isOpen ? '▾' : '▸'}</span>{r.stage}
                        </button>
                      </td>
                      <td className={td}>
                        <button
                          type="button"
                          onClick={() => pick({ stage: r.stage })}
                          title={`Lọc danh sách: mọi hạng mục ở ${r.stage}`}
                          className={`rounded px-1 font-medium hover:bg-amber-50 hover:text-slate-900 hover:underline ${isSel({ stage: r.stage }) ? 'bg-amber-100 text-slate-900' : 'text-slate-600'}`}
                        >
                          Tất cả · {r.statuses.length} tình trạng
                        </button>
                      </td>
                      {pivot.areas.map(a => <React.Fragment key={a}>{cell(r.cells[a], { stage: r.stage, area: a })}</React.Fragment>)}
                      {cell(r.total, { stage: r.stage }, 'bg-slate-100 font-semibold text-slate-900')}
                    </tr>
                    {isOpen && r.statuses.map(([st, sr]) => (
                      <tr key={st}>
                        <td className={td} />
                        <td className={`${td} pl-5`}>
                          <button
                            type="button"
                            onClick={() => pick({ stage: r.stage, status: st })}
                            title={`Lọc danh sách: ${r.stage} · ${st}`}
                            className={`rounded px-1 text-left hover:bg-amber-50 hover:text-slate-900 hover:underline ${isSel({ stage: r.stage, status: st }) ? 'bg-amber-100 font-semibold text-slate-900' : 'text-slate-600'}`}
                          >
                            {st}
                          </button>
                        </td>
                        {pivot.areas.map(a => <React.Fragment key={a}>{cell(sr.cells[a], { stage: r.stage, status: st, area: a })}</React.Fragment>)}
                        {cell(sr.total, { stage: r.stage, status: st }, 'bg-slate-50 font-semibold')}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
              {pivot.rows.length === 0 && (
                <tr><td colSpan={pivot.areas.length + 3} className="px-3 py-6 text-center text-slate-400">Không còn hạng mục đang sản xuất.</td></tr>
              )}
            </tbody>
            {pivot.rows.length > 0 && (
              <tfoot className="sticky bottom-0 bg-slate-100 font-semibold text-slate-800">
                <tr>
                  <td className={td} colSpan={2}>Tổng cộng</td>
                  {pivot.areas.map(a => <td key={a} className={`${td} text-right tabular-nums`}>{fmtV(pivot.colTot[a] ?? 0)}</td>)}
                  <td className={`${td} text-right tabular-nums`}>{fmtV(pivot.grand)}</td>
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
              {sel && <span className="ml-1 font-normal text-amber-700">· theo lọc: {[sel.stage, sel.status, sel.area].filter(Boolean).join(' · ')}</span>}
            </p>
            {DWELL.map(d => (
              <span key={d.key} className="inline-flex items-center gap-1 text-[0.6875rem] text-slate-500">
                <span className={`h-2 w-2 rounded-sm ${d.bar}`} />{d.label}
              </span>
            ))}
          </div>
          <div className="space-y-1.5">
            {dwell.rows.map(r => (
              <div key={r.stage} className="flex items-center gap-2 text-xs">
                <span className="w-12 shrink-0 font-semibold text-slate-700">{r.stage}</span>
                <div className="flex h-5 flex-1 overflow-hidden rounded bg-slate-100">
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
                        className={`${d.bar} flex items-center justify-center text-[0.625rem] font-semibold text-white hover:brightness-110 ${isDwellSel(next) ? 'ring-2 ring-inset ring-slate-900' : ''}`}
                        style={{ width: `${(v / r.n) * 100}%` }}
                      >
                        {v / r.n >= 0.06 ? v : ''}
                      </button>
                    );
                  })}
                </div>
                <span className="w-10 shrink-0 text-right tabular-nums text-slate-500">{fmtInt(r.n)}</span>
              </div>
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
      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold text-slate-700">{hasFilter ? 'Hạng mục đang lọc' : 'Tất cả hạng mục chưa nhập kho đủ'}</p>
          {hasFilter && <Chip active onClick={() => { setSel(null); setDwellSel(null); setExtraSel(null); }}>{selText} ✕</Chip>}
          <span className="text-[0.6875rem] text-slate-500">{fmtInt(list.length)} hạng mục</span>
          <SortPicker
            value={sortBy}
            onChange={setSortBy}
            options={[['deadline', 'Hạn gần nhất'], ['stage', 'Công đoạn'], ['remain', 'Giá trị còn lại']]}
          />
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
                <td className={`${td} max-w-[180px] truncate`} title={e?.gcn ? [e.gcn.st, e.gcn.note, e.gcn.due ? `dự kiến về ${e.gcn.due}` : ''].filter(Boolean).join(' · ') : undefined}>
                  {extra === null || extra === undefined ? <span className="text-slate-300">…</span>
                    : !e?.gcn ? <span className="text-slate-300">—</span>
                      : <span className={GCN_DONE(e.gcn.st) ? 'text-slate-500' : 'font-medium text-orange-700'}>{e.gcn.st ?? 'Chưa ghi tình trạng'}</span>}
                </td>
              </>
            );
          }}
        />
      </div>
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
export type BomState = 'noneBeforeSx' | 'noneInSx' | 'noneNotDeployed' | 'notOrdered' | 'late' | 'onTrack' | 'arrived' | 'ok' | 'stocked';
export const BOM_STATES: { key: BomState; label: string; tone: 'red' | 'amber' | 'emerald' | 'slate'; badge: string; hint: string }[] = [
  { key: 'noneBeforeSx', label: 'Đã triển khai, chưa SX – chưa thấy PR', tone: 'red', badge: 'bg-red-50 text-red-600',
    hint: 'P002 / P012 (chưa sản xuất), không có dòng PR nào ghi mã nhà máy của hạng mục và bảng sản xuất không ghi tình trạng mua (hoặc còn dòng chờ) — chưa kiểm chứng được vật tư: kiểm tra PR chung của công trình / định mức NVL' },
  { key: 'noneInSx', label: 'Đang SX / NVL đủ – mua gộp, tồn kho', tone: 'slate', badge: 'bg-slate-100 text-slate-600',
    hint: 'Không có PR ghi mã hạng mục nhưng đã lên chuyền (từ P013) hoặc bảng sản xuất ghi tình trạng mua đã về đủ — vật tư mua gộp theo công trình hoặc lấy từ tồn kho' },
  { key: 'noneNotDeployed', label: 'Chưa triển khai (P001)', tone: 'slate', badge: 'bg-slate-100 text-slate-600',
    hint: 'Hạng mục chưa triển khai bản vẽ (P001 / 15. CHƯA TRIỂN KHAI) nên chưa lên PR — bình thường' },
  { key: 'notOrdered', label: 'Có VT chưa mua', tone: 'red', badge: 'bg-rose-50 text-rose-700',
    hint: 'Ít nhất 1 dòng PR 1.CHƯA MUA (chưa có PO)' },
  { key: 'late', label: 'VT trễ hẹn giao', tone: 'amber', badge: 'bg-orange-50 text-orange-700',
    hint: 'Đang mua, đã quá Ngày dự kiến giao hàng PMH nhập mà chưa về đủ' },
  { key: 'onTrack', label: 'Đang mua, chưa tới hẹn', tone: 'amber', badge: 'bg-amber-50 text-amber-700',
    hint: 'Còn dòng đang mua nhưng chưa tới Ngày dự kiến giao hàng PMH nhập' },
  { key: 'arrived', label: 'Kho đã báo về, chờ nhập SAP', tone: 'slate', badge: 'bg-sky-50 text-sky-700',
    hint: 'Kho báo SL hàng về thực tế ≥ SL yêu cầu, SAP chưa ghi nhận' },
  { key: 'ok', label: 'Đã về đủ (theo PR đã có)', tone: 'emerald', badge: 'bg-emerald-50 text-emerald-700',
    hint: 'Mọi dòng PR đã nối được đều đã về / CCLD / đã đóng / đã hủy — không khẳng định đủ toàn bộ BOM' },
  { key: 'stocked', label: 'Hạng mục đã nhập kho đủ', tone: 'slate', badge: 'bg-slate-100 text-slate-500',
    hint: 'Hạng mục đã nhập kho đủ trị giá hoặc đủ số lượng — vật tư không còn ảnh hưởng' },
];
const BOM_META = Object.fromEntries(BOM_STATES.map(s => [s.key, s])) as Record<BomState, (typeof BOM_STATES)[number]>;

// Nhóm dòng PR — xếp theo cột Trạng thái chung (1.CHƯA MUA / 2.ĐANG MUA / 3.ĐÃ NHẬP KHO / 4.HỦY) + SL còn lại
// trên SAP (utils/productionMetrics.materialLineState). `hint` hiện khi rê chuột vào nhóm.
export const LINE_STATES: { key: MaterialLineState; label: string; bar: string; hint: string }[] = [
  { key: 'notOrdered', label: 'Chưa mua', bar: 'bg-rose-500',
    hint: 'Trạng thái 1.CHƯA MUA — chưa có PO.' },
  { key: 'late', label: 'Đang mua – trễ hẹn', bar: 'bg-orange-500',
    hint: 'Trạng thái 2.ĐANG MUA, đã qua Ngày dự kiến giao hàng (PMH nhập) mà SAP chưa nhận đủ.' },
  { key: 'onTrack', label: 'Đang mua – chưa tới hẹn', bar: 'bg-amber-400',
    hint: 'Trạng thái 2.ĐANG MUA, chưa tới Ngày dự kiến giao hàng (PMH nhập).' },
  { key: 'arrived', label: 'Kho báo về, chờ nhập SAP', bar: 'bg-sky-400',
    hint: 'Trạng thái 2.ĐANG MUA nhưng kho đã báo SL hàng về thực tế ≥ SL yêu cầu — chỉ còn chờ SAP ghi nhập kho.' },
  { key: 'ccld', label: 'CCLD – lắp tại công trình', bar: 'bg-teal-400',
    hint: 'Dòng 1.CHƯA MUA / 2.ĐANG MUA là hàng CCLD (ghi chú Team PR có "CCLD" hoặc tình trạng PO "Cung cấp lắp đặt"): nhà cung cấp giao và lắp thẳng tại công trình, không về kho nhà máy — không chặn sản xuất.' },
  { key: 'closedShort', label: 'PR đã đóng, chưa nhận đủ', bar: 'bg-violet-400',
    hint: 'Trạng thái 3.ĐÃ NHẬP KHO nhưng PR đã ĐÓNG trên SAP khi SL còn lại > 0 (nhận 1 phần hoặc chưa nhận): dùng tồn kho, đóng PR thiếu, hàng CCLD… — không còn chờ hàng về.' },
  { key: 'done', label: 'Đã nhận đủ', bar: 'bg-emerald-500',
    hint: 'Trạng thái 3.ĐÃ NHẬP KHO và SL còn lại trên SAP = 0: SL đã nhận (SAP) ≥ SL yêu cầu (có dòng nhận dư).' },
  { key: 'cancelled', label: 'Hủy', bar: 'bg-slate-300',
    hint: 'Trạng thái 4.HỦY — không tính vào vật tư của hạng mục.' },
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

const LINE_ORDER: MaterialLineState[] = ['notOrdered', 'late', 'onTrack', 'arrived'];

/**
 * Dòng còn chờ sẽ về SAU Ngày cần vật tư:
 *  - chưa mua: đã qua ngày cần vật tư (chưa có PO thì không thể về kịp)
 *  - đang mua: max(ngày dự kiến giao, hôm nay) > ngày cần vật tư (đã trễ hẹn thì sớm nhất cũng là hôm nay)
 */
const lineAfterNeed = (l: MaterialLine, st: MaterialLineState, today: number): boolean => {
  const need = parsePlanDate(l.ngay_can_vat_tu)?.getTime();
  if (need === undefined) return false;
  if (st === 'notOrdered') return need < today;
  if (st === 'late' || st === 'onTrack') {
    const due = parsePlanDate(l.ngay_du_kien_giao_hang_pmh_nhap)?.getTime() ?? today;
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
    const due = st === 'late' || st === 'onTrack' ? parsePlanDate(l.ngay_du_kien_giao_hang_pmh_nhap)?.getTime() : undefined;
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
    else state = (LINE_ORDER.find(k => (e.byLine[k] ?? 0) > 0) as BomState | undefined) ?? 'ok';
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
}

export interface ProjectMaterialSummary {
  lines: number;                                   // dòng không mã (không tính hủy)
  byState: Record<MaterialLineState, number>;
  badCode: number;                                 // dòng ghi sai mã nhà máy
  toFix: number;                                   // dòng cần bổ sung mã (còn chờ không mã + sai mã)
}

const PENDING_STATES: MaterialLineState[] = ['notOrdered', 'late', 'onTrack', 'arrived'];
const lineStateLabel = (s: MaterialLineState) => LINE_STATES.find(x => x.key === s)?.label ?? s;

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
      'SL yêu cầu': Number(r.so_luong_yeu_cau) || 0, 'SL còn lại': Number(r.so_luong_con_lai) || 0,
      'Trạng thái': String(r.trang_thai ?? ''),
      'Tình trạng': st ? lineStateLabel(st) : '',
      'Ngày cần VT': xlsxDate(r.ngay_can_vat_tu), 'Dự kiến giao PMH': xlsxDate(r.ngay_du_kien_giao_hang_pmh_nhap),
      'Mã nhà máy (đang ghi)': r.ma_nha_may ?? '', 'Item note PR': r.item_note_pr ?? '',
      'Cần làm': r.kind === 'badCode' ? `Sửa mã nhà máy: ${r.bad_reason ?? ''}` : 'Bổ sung mã nhà máy (13 số) của hạng mục',
    };
  });
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [6, 14, 34, 12, 8, 12, 18, 14, 40, 22, 8, 10, 10, 14, 24, 12, 16, 24, 40, 44].map(wch => ({ wch }));
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
    const RANK: MaterialLineState[] = ['late', 'notOrdered', 'onTrack', 'arrived', 'ccld', 'closedShort', 'done', 'cancelled'];
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
          <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
            {LINE_STATES.map(s => sum.byState[s.key] > 0 && (
              <div key={s.key} className={s.bar} style={{ width: `${(sum.byState[s.key] / Math.max(total, 1)) * 100}%` }} title={`${s.label}: ${sum.byState[s.key]} — ${s.hint}`} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span title="Dòng chưa có hàng về kho: Chưa mua + Đang mua (trễ / chưa tới hẹn) + Kho báo về chờ nhập SAP — cần bổ sung mã nhà máy để gắn hạng mục"><Chip active={filter === 'pending'} tone="red" onClick={() => setFilter('pending')}>Còn chờ, kể cả kho báo về ({fmtInt(pendingN)})</Chip></span>
            {LINE_STATES.map(s => sum.byState[s.key] > 0 && (
              <span key={s.key} title={s.hint}>
                <Chip active={filter === s.key} onClick={() => setFilter(s.key)}>
                  <span className={`mr-1 inline-block h-2 w-2 rounded-sm ${s.bar}`} />{s.label} ({fmtInt(sum.byState[s.key])})
                </Chip>
              </span>
            ))}
            <Chip active={filter === 'all'} onClick={() => setFilter('all')}>Tất cả ({fmtInt(total)})</Chip>
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
                  const due = parsePlanDate(r.ngay_du_kien_giao_hang_pmh_nhap);
                  const meta = st ? LINE_STATES.find(x => x.key === st) : null;
                  return (
                    <tr key={`${String(r.so_pr)}-${String(r.pr_line)}-${idx}`} className="hover:bg-slate-50">
                      <td className={`${td} text-right tabular-nums text-slate-400`}>{idx + 1}</td>
                      <td className={`${td} whitespace-nowrap text-slate-600`} title={r.ten_cong_trinh}>{r.trackingno}</td>
                      <td className={`${td} whitespace-nowrap tabular-nums text-slate-600`}>{String(r.so_pr ?? '—')} · {String(r.pr_line ?? '')}</td>
                      <td className={`${td} max-w-[320px] truncate text-slate-800`} title={r.ten_vat_tu}>{r.ten_vat_tu}</td>
                      <td className={`${td} whitespace-nowrap text-slate-500`}>{r.nhom_vt}</td>
                      <td className={`${td} text-right tabular-nums`}>{Number(r.so_luong_yeu_cau) || '—'} <span className="text-slate-400">{r.dvt}</span></td>
                      <td className={`${td} text-right tabular-nums font-semibold text-slate-700`}>{Number(r.so_luong_con_lai) || '—'}</td>
                      <td className={`${td} whitespace-nowrap tabular-nums text-slate-500`}>{fmtDate(parsePlanDate(r.ngay_pr))}</td>
                      <td className={`${td} whitespace-nowrap tabular-nums ${need && st && PENDING_STATES.includes(st) && need.getTime() < today ? 'font-semibold text-red-600' : 'text-slate-600'}`}>{fmtDate(need)}</td>
                      <td className={`${td} whitespace-nowrap tabular-nums ${st === 'late' ? 'font-semibold text-orange-600' : 'text-slate-600'}`}>{st === 'late' || st === 'onTrack' ? fmtDate(due) : '—'}</td>
                      <td className={td}>
                        {r.kind === 'badCode' ? (
                          <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[0.625rem] font-semibold text-amber-800" title={r.bad_reason ?? ''}>Sai mã NM: {r.ma_nha_may}</span>
                        ) : meta ? (
                          <span className="inline-flex cursor-help items-center gap-1 whitespace-nowrap text-slate-700" title={meta.hint}><span className={`h-2 w-2 rounded-sm ${meta.bar}`} />{meta.label}</span>
                        ) : null}
                      </td>
                      <td className={`${td} max-w-[260px] truncate text-slate-500`} title={[r.team_pr_note, r.item_note_pr].filter(Boolean).join(' · ')}>
                        {[r.team_pr_note, r.item_note_pr].filter(Boolean).join(' · ') || '—'}
                      </td>
                    </tr>
                  );
                })}
                {list.length === 0 && <tr><td colSpan={12} className="px-3 py-6 text-center text-slate-400">Không có dòng phù hợp.</td></tr>}
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
    const PRIORITY: BomState[] = ['late', 'notOrdered', 'onTrack', 'noneBeforeSx', 'arrived', 'ok', 'noneInSx', 'noneNotDeployed', 'stocked'];
    const rank = (i: HexInfo) => PRIORITY.indexOf(bom.byHex[i.hex]?.state ?? 'noneBeforeSx');
    const pendingFirst = (i: HexInfo) => (rank(i) <= 2 ? 0 : rank(i) >= 5 ? 2 : 1);
    const need = (i: HexInfo) => bom.byHex[i.hex]?.needDate?.getTime() ?? Infinity;
    const seen = new Set<string>();
    return items
      .filter(i => {
        if (seen.has(i.hex)) return false;
        seen.add(i.hex);
        const b = bom.byHex[i.hex];
        if (!b || !matchQ(i, ql)) return false;
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
  }, [items, bom, filter, q, sortBy]);

  const total = useMemo(() => new Set(items.map(i => i.hex)).size, [items]);

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
          <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
            {LINE_STATES.map(s => bom.lineCounts[s.key] > 0 && (
              <div
                key={s.key}
                className={s.bar}
                style={{ width: `${(bom.lineCounts[s.key] / bom.lineTotal) * 100}%` }}
                title={`${s.label}: ${bom.lineCounts[s.key]} — ${s.hint}`}
              />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4 xl:grid-cols-4">
            {LINE_STATES.map(s => (
              <div key={s.key} className="flex cursor-help items-center gap-1.5" title={s.hint}>
                <span className={`h-2 w-2 shrink-0 rounded-sm ${s.bar}`} />
                <span className="truncate text-slate-600 underline decoration-dotted decoration-slate-300 underline-offset-2">{s.label}</span>
                <span className="ml-auto font-semibold tabular-nums text-slate-800">{fmtInt(bom.lineCounts[s.key])}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[0.6875rem] text-slate-400">
            Nhóm theo cột Trạng thái của PR (1.CHƯA MUA / 2.ĐANG MUA / 3.ĐÃ NHẬP KHO / 4.HỦY) và SL còn lại trên SAP.
            "Đã nhận đủ" = 3.ĐÃ NHẬP KHO và SL còn lại = 0; "PR đã đóng, chưa nhận đủ" = 3.ĐÃ NHẬP KHO nhưng PR đóng khi còn
            thiếu (dùng tồn / đóng thiếu / CCLD). Còn chờ = Chưa mua + Đang mua (trễ / chưa tới hẹn). Rê chuột vào từng nhóm để xem chi tiết.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-700">Hạng mục theo tình trạng vật tư:</span>
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>Tất cả ({fmtInt(total)})</Chip>
        {BOM_STATES.map(s => (
          <span key={s.key} title={s.hint}>
            <Chip active={filter === s.key} tone={s.tone} onClick={() => setFilter(s.key)}>
              {s.label} ({bom ? fmtInt(bom.counts[s.key]) : '…'})
            </Chip>
          </span>
        ))}
        <span title="Có dòng PR còn chờ sẽ về sau Ngày cần vật tư (chưa mua mà đã qua ngày cần, hoặc ngày dự kiến giao / hôm nay sau ngày cần)">
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
            <th className={`${th} text-right`} title="Đang mua, quá ngày dự kiến giao">Trễ hẹn</th>
            <th className={`${th} text-right`} title="Đang mua, chưa tới ngày dự kiến giao">Chưa tới hẹn</th>
            <th className={`${th} text-left`} title="Ngày PR sớm nhất">Ngày PR</th>
            <th className={`${th} text-left`} title="Ngày cần vật tư sớm nhất của các dòng còn chờ">Ngày cần VT</th>
            <th className={`${th} text-left`} title="Ngày dự kiến giao hàng PMH nhập muộn nhất của các dòng đang mua">Dự kiến giao PMH</th>
            <th className={`${th} text-left`} title="Posting date — ngày thực tế về muộn nhất">Thực tế về</th>
            <th className={`${th} text-right`} title="Vướng mắc M3 – Vật tư chưa xử lý (bấm để xem)">VM vật tư</th>
            <th className={`${th} text-left`} title="Định mức vật tư của hạng mục và tình trạng mua do kế hoạch ghi ở bảng sản xuất — có cả vật tư mua gộp theo công trình (không cần PR ghi mã). Bấm HEX để xem đủ.">Định mức NVL (bảng SX)</th>
            <th className={`${th} text-left`}>Tình trạng vật tư</th>
          </>}
          extraCells={i => {
            const b = bom.byHex[i.hex];
            const n = (k: MaterialLineState, cls: string) => {
              const v = b?.byLine[k] ?? 0;
              return <td className={`${td} text-right tabular-nums ${v ? cls : 'text-slate-300'}`}>{v || '—'}</td>;
            };
            const meta = BOM_META[b?.state ?? 'noneBeforeSx'];
            const pending = !!b && (b.state === 'notOrdered' || b.state === 'late' || b.state === 'onTrack');
            const needLate = !!b && b.afterNeed > 0;
            const dueLate = pending && !!b?.dueDate && b.dueDate.getTime() < today;
            return (
              <>
                <td className={`${td} text-right tabular-nums`}>{b?.lines || '—'}</td>
                {n('notOrdered', 'font-semibold text-rose-600')}
                {n('late', 'font-semibold text-orange-600')}
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
                  const full = needs.map(n => `${NVL_GROUP_LABEL[n.group]}: ${n.name}${n.qty !== null ? ` ${Number(n.qty.toFixed(3))} ${n.dvt}` : ''}`).join('\n');
                  return (
                    <td className={`${td} max-w-[300px]`} title={full || undefined}>
                      <span className="block truncate text-slate-600">{summarizeNeeds(needs) || '—'}</span>
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
            <td className={`${td} max-w-[240px] truncate text-slate-600`} title={i.hangMuc}>{i.hangMuc}</td>
            <td className={`${td} text-slate-600`}>{i.stage ?? '—'}</td>
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
