import React, { useMemo, useState } from 'react';
import { Search, Package, AlertTriangle } from 'lucide-react';
import type { RemainBucket } from '../Dashboard/hooks/usePivotTables';
import { isMaterialMissing, type DeadlineSource } from '../../utils/productionMetrics';

// ============================================================================
// Tầng 2 của "Tổng quan công trình": 3 tab chi tiết BOT · BOP · BOM.
// Nhận dữ liệu đã chuẩn hoá từ ProjectHealthModal (cùng 1 định nghĩa "còn lại").
// ============================================================================

export interface HexInfo {
  hex: string;
  hangMuc: string;
  stage: string | null;
  bucket: RemainBucket | null; // null = đã nhập kho đủ
  total: number;               // triệu đồng
  inv: number;                 // đã nhập kho (triệu, đã chặn không vượt trị giá)
  remain: number;              // triệu đồng
  deadline: Date | null;       // KH nhập kho tuần → KH nhập kho tháng → ngày cần giao
  deadlineSource: DeadlineSource | null;
  khnkTuan: Date | null;       // ngay_khnk_tuan (để hiển thị riêng)
  khnkThang: Date | null;      // ngay_khnk_thang (để hiển thị riêng)
  canGiao: Date | null;        // ngay_can_giao (để hiển thị riêng)
  overdue: boolean;
  dueSoon: boolean;
}

export interface MaterialLine {
  hexes: string[];
  so_luong_con_lai: number | null;
  trang_thai: string | null;
}

const DAY = 86_400_000;
const fmtInt = (n: number) => n.toLocaleString('vi-VN');
const fmtTy = (trieu: number, digits = 1) => (trieu / 1000).toLocaleString('en-US', { maximumFractionDigits: digits });
const fmtDate = (d: Date | null) =>
  d ? d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

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

const matchQ = (i: HexInfo, q: string) =>
  !q || i.hex.includes(q) || i.hangMuc.toLowerCase().includes(q) || (i.stage ?? '').toLowerCase().includes(q);

// ============================================================================
// BOT — KH nhập kho tuần → KH nhập kho tháng → ngày cần giao
// ============================================================================
type BotGroup = 'overdue' | 'd14' | 'd30' | 'later' | 'none';
const BOT_GROUPS: { key: BotGroup; label: string; tone: 'red' | 'amber' | 'slate' }[] = [
  { key: 'overdue', label: 'Quá hạn', tone: 'red' },
  { key: 'd14', label: '≤ 14 ngày', tone: 'amber' },
  { key: 'd30', label: '15–30 ngày', tone: 'amber' },
  { key: 'later', label: 'Sau 30 ngày', tone: 'slate' },
  { key: 'none', label: 'Chưa có ngày', tone: 'slate' },
];

export const BotTab = ({ items, today, openIssues }: {
  items: HexInfo[]; today: number; openIssues: Record<string, number> | null;
}) => {
  const [group, setGroup] = useState<BotGroup | 'all'>('all');
  const [q, setQ] = useState('');

  const open = useMemo(() => items.filter(i => i.bucket), [items]);
  const groupOf = (i: HexInfo): BotGroup => {
    if (!i.deadline) return 'none';
    const days = Math.floor((i.deadline.getTime() - today) / DAY);
    if (days < 0) return 'overdue';
    if (days <= 14) return 'd14';
    if (days <= 30) return 'd30';
    return 'later';
  };
  const counts = useMemo(() => {
    const c: Record<BotGroup, { n: number; remain: number }> = {
      overdue: { n: 0, remain: 0 }, d14: { n: 0, remain: 0 }, d30: { n: 0, remain: 0 }, later: { n: 0, remain: 0 }, none: { n: 0, remain: 0 },
    };
    open.forEach(i => { const g = groupOf(i); c[g].n++; c[g].remain += i.remain; });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, today]);

  // Tổng theo tháng kế hoạch (trị giá / đã nhập / còn lại) — mọi hạng mục, kể cả đã nhập đủ
  const byMonth = useMemo(() => {
    const m = new Map<string, { key: string; n: number; total: number; inv: number; remain: number; overdue: number }>();
    items.forEach(i => {
      const key = i.deadline ? `${i.deadline.getFullYear()}-${String(i.deadline.getMonth() + 1).padStart(2, '0')}` : '~';
      const e = m.get(key) ?? { key, n: 0, total: 0, inv: 0, remain: 0, overdue: 0 };
      e.n++; e.total += i.total; e.inv += i.inv; e.remain += i.remain; if (i.overdue) e.overdue++;
      m.set(key, e);
    });
    return [...m.values()].sort((a, b) => (a.key === '~' ? 1 : b.key === '~' ? -1 : a.key.localeCompare(b.key)));
  }, [items]);

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return open
      .filter(i => (group === 'all' || groupOf(i) === group) && matchQ(i, ql))
      .sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity) || b.remain - a.remain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group, q, today]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {BOT_GROUPS.map(g => (
          <button
            key={g.key}
            type="button"
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

      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-700">
          Theo tháng kế hoạch <span className="font-normal text-slate-500">· KH nhập kho tuần → tháng → ngày cần giao</span>
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
                  <tr key={m.key}>
                    <td className={`${td} text-slate-700`}>{m.key === '~' ? 'Chưa có ngày' : `${m.key.slice(5)}/${m.key.slice(0, 4)}`}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtInt(m.n)}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtTy(m.total, 2)}</td>
                    <td className={`${td} text-right tabular-nums text-emerald-700`}>{fmtTy(m.inv, 2)}</td>
                    <td className={`${td} text-right tabular-nums text-amber-700`}>{fmtTy(m.remain, 2)}</td>
                    <td className={`${td} text-right tabular-nums ${m.overdue ? 'font-semibold text-red-600' : 'text-slate-400'}`}>{fmtInt(m.overdue)}</td>
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
            {group === 'all' ? 'tất cả nhóm' : BOT_GROUPS.find(g => g.key === group)?.label} · {fmtInt(list.length)} hạng mục · sắp theo ngày kế hoạch
          </span>
          <div className="ml-auto"><SearchBox value={q} onChange={setQ} placeholder="Tìm hex, hạng mục, công đoạn..." /></div>
        </div>
        <HexTable
          rows={list}
          extraHead={<><th className={`${th} text-right`}>Số ngày</th><th className={`${th} text-right`}>Vướng mắc</th></>}
          extraCells={i => {
            const days = i.deadline ? Math.floor((i.deadline.getTime() - today) / DAY) : null;
            const vm = openIssues?.[i.hex] ?? 0;
            return (
              <>
                <td className={`${td} text-right tabular-nums ${days !== null && days < 0 ? 'font-semibold text-red-600' : days !== null && days <= 14 ? 'text-amber-600' : 'text-slate-500'}`}>
                  {days === null ? '—' : days}
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
const STAGE_ORDER = ['P001', 'P002', 'P012', 'P013', 'GCVT', 'P014', 'P016', 'P018', 'P020', 'P021', 'P022', 'P025'];
const stageRank = (s: string) => { const i = STAGE_ORDER.indexOf(s); return i === -1 ? 999 : i; };
const BUCKET_TEXT: Record<RemainBucket, string> = {
  notDeployed: 'Chưa triển khai', p002: 'Chưa tính phiếu', onLine: 'Đang trên chuyền', shortfall: 'Nhập kho chưa đủ',
};

export const BopTab = ({ items }: { items: HexInfo[] }) => {
  const [stage, setStage] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const pivot = useMemo(() => {
    const m = new Map<string, { stage: string; n: number; open: number; total: number; inv: number; remain: number }>();
    items.forEach(i => {
      const s = i.stage ?? '(Không rõ)';
      const e = m.get(s) ?? { stage: s, n: 0, open: 0, total: 0, inv: 0, remain: 0 };
      e.n++; if (i.bucket) e.open++; e.total += i.total; e.inv += i.inv; e.remain += i.remain;
      m.set(s, e);
    });
    return [...m.values()].sort((a, b) => stageRank(a.stage) - stageRank(b.stage) || a.stage.localeCompare(b.stage));
  }, [items]);
  const tot = pivot.reduce((s, p) => ({ n: s.n + p.n, open: s.open + p.open, total: s.total + p.total, inv: s.inv + p.inv, remain: s.remain + p.remain }),
    { n: 0, open: 0, total: 0, inv: 0, remain: 0 });

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return items
      .filter(i => (stage === null || (i.stage ?? '(Không rõ)') === stage) && matchQ(i, ql))
      .sort((a, b) => b.remain - a.remain);
  }, [items, stage, q]);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-700">
          Theo công đoạn (BOP) <span className="font-normal text-slate-500">· bấm 1 dòng để xem hạng mục của công đoạn đó</span>
        </p>
        <div className="overflow-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className={`${th} text-left`}>Công đoạn</th>
                <th className={`${th} text-right`}>Hạng mục</th>
                <th className={`${th} text-right`}>Chưa nhập đủ</th>
                <th className={`${th} text-right`}>Trị giá (tỷ)</th>
                <th className={`${th} text-right`}>Đã nhập kho (tỷ)</th>
                <th className={`${th} text-right`}>Còn lại (tỷ)</th>
                <th className={`${th} text-left w-40`}>Tỷ trọng còn lại</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pivot.map(p => {
                const active = stage === p.stage;
                const share = tot.remain > 0 ? (p.remain / tot.remain) * 100 : 0;
                return (
                  <tr
                    key={p.stage}
                    onClick={() => setStage(active ? null : p.stage)}
                    className={`cursor-pointer ${active ? 'bg-amber-50' : 'hover:bg-slate-50'}`}
                  >
                    <td className={`${td} font-semibold text-slate-800`}>{p.stage}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtInt(p.n)}</td>
                    <td className={`${td} text-right tabular-nums ${p.open ? 'text-amber-700' : 'text-slate-400'}`}>{fmtInt(p.open)}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtTy(p.total, 2)}</td>
                    <td className={`${td} text-right tabular-nums text-emerald-700`}>{fmtTy(p.inv, 2)}</td>
                    <td className={`${td} text-right tabular-nums text-amber-700`}>{fmtTy(p.remain, 2)}</td>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                          <div className="h-1.5 rounded-full bg-amber-400" style={{ width: `${share}%` }} />
                        </div>
                        <span className="w-10 text-right tabular-nums text-slate-500">{share.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 font-semibold text-slate-800">
              <tr>
                <td className={td}>Tổng cộng</td>
                <td className={`${td} text-right tabular-nums`}>{fmtInt(tot.n)}</td>
                <td className={`${td} text-right tabular-nums`}>{fmtInt(tot.open)}</td>
                <td className={`${td} text-right tabular-nums`}>{fmtTy(tot.total, 2)}</td>
                <td className={`${td} text-right tabular-nums`}>{fmtTy(tot.inv, 2)}</td>
                <td className={`${td} text-right tabular-nums`}>{fmtTy(tot.remain, 2)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold text-slate-700">{stage ? `Hạng mục ở công đoạn ${stage}` : 'Tất cả hạng mục'}</p>
          {stage && <Chip active onClick={() => setStage(null)}>{stage} ✕</Chip>}
          <span className="text-[0.6875rem] text-slate-500">{fmtInt(list.length)} hạng mục · sắp theo giá trị còn lại</span>
          <div className="ml-auto"><SearchBox value={q} onChange={setQ} placeholder="Tìm hex, hạng mục..." /></div>
        </div>
        <HexTable
          rows={list}
          extraHead={<th className={`${th} text-left`}>Nhóm còn lại</th>}
          extraCells={i => (
            <td className={`${td} text-slate-600`}>{i.bucket ? BUCKET_TEXT[i.bucket] : <span className="text-emerald-600">Đã nhập đủ</span>}</td>
          )}
        />
      </div>
    </div>
  );
};

// ============================================================================
// BOM — vật tư
// ============================================================================
type BomState = 'none' | 'short' | 'ok';
const BOM_LABEL: Record<BomState, string> = { none: 'Chưa tìm thấy vật tư', short: 'Thiếu vật tư', ok: 'Đủ vật tư' };

export const BomTab = ({ items, matCount, materialLines, unassigned, onOpenMaterial }: {
  items: HexInfo[];
  matCount: Record<string, number> | null;
  materialLines: MaterialLine[] | null;
  unassigned: { lines: number; prs: number } | null;
  onOpenMaterial: (mode: 'matched' | 'unassigned') => void;
}) => {
  const [filter, setFilter] = useState<BomState | 'all'>('all');
  const [q, setQ] = useState('');

  // Số dòng vật tư còn thiếu theo hex (1 dòng mua gộp tính cho mọi hex nó phục vụ)
  const shortByHex = useMemo(() => {
    const m: Record<string, number> = {};
    (materialLines ?? []).forEach(l => {
      if (!isMaterialMissing(l)) return;
      l.hexes.forEach(h => { m[h] = (m[h] || 0) + 1; });
    });
    return m;
  }, [materialLines]);

  const stateOf = (i: HexInfo): BomState =>
    !((matCount?.[i.hex] ?? 0) > 0) ? 'none' : shortByHex[i.hex] ? 'short' : 'ok';

  const counts = useMemo(() => {
    // Đếm theo HEX duy nhất — khớp thẻ BOM ở trang tổng quan (x / tổng số HEX)
    const c: Record<BomState, number> = { none: 0, short: 0, ok: 0 };
    const seen = new Set<string>();
    if (matCount) items.forEach(i => { if (seen.has(i.hex)) return; seen.add(i.hex); c[stateOf(i)]++; });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, matCount, shortByHex]);

  const list = useMemo(() => {
    if (!matCount) return [];
    const ql = q.trim().toLowerCase();
    return items
      .filter(i => (filter === 'all' || stateOf(i) === filter) && matchQ(i, ql))
      // Hạng mục còn sản xuất & gấp lên trước
      .sort((a, b) =>
        Number(!!b.bucket) - Number(!!a.bucket)
        || (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity)
        || b.remain - a.remain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, matCount, shortByHex, filter, q]);

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
        <button
          type="button"
          onClick={() => onOpenMaterial('unassigned')}
          disabled={!unassigned || unassigned.lines === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Chưa có mã nhà máy chỉ định
          <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[0.6875rem] text-white">
            {unassigned === null ? '…' : `${fmtInt(unassigned.lines)} dòng · ${unassigned.prs} PR`}
          </span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>Tất cả ({fmtInt(counts.none + counts.short + counts.ok || new Set(items.map(i => i.hex)).size)})</Chip>
        <Chip active={filter === 'none'} tone="red" onClick={() => setFilter('none')}>{BOM_LABEL.none} ({matCount ? fmtInt(counts.none) : '…'})</Chip>
        <Chip active={filter === 'short'} tone="amber" onClick={() => setFilter('short')}>{BOM_LABEL.short} ({matCount && materialLines ? fmtInt(counts.short) : '…'})</Chip>
        <Chip active={filter === 'ok'} tone="emerald" onClick={() => setFilter('ok')}>{BOM_LABEL.ok} ({matCount && materialLines ? fmtInt(counts.ok) : '…'})</Chip>
        <div className="ml-auto"><SearchBox value={q} onChange={setQ} placeholder="Tìm hex, hạng mục..." /></div>
      </div>
      <p className="-mt-2 text-[0.6875rem] text-slate-500">
        "Thiếu vật tư" = có ít nhất 1 dòng vật tư (PR) còn SL chưa về. Một dòng mua gộp được tính cho mọi hạng mục nó phục vụ. Sắp: hạng mục còn sản xuất &amp; KH nhập kho gần lên trước.
      </p>

      {!matCount ? (
        <p className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-400">Đang kiểm tra vật tư…</p>
      ) : (
        <HexTable
          rows={list}
          extraHead={<>
            <th className={`${th} text-right`}>Dòng VT</th>
            <th className={`${th} text-right`}>Dòng còn thiếu</th>
            <th className={`${th} text-left`}>Tình trạng vật tư</th>
          </>}
          extraCells={i => {
            const st = stateOf(i);
            return (
              <>
                <td className={`${td} text-right tabular-nums`}>{matCount[i.hex] || '—'}</td>
                <td className={`${td} text-right tabular-nums ${shortByHex[i.hex] ? 'font-semibold text-amber-600' : 'text-slate-300'}`}>
                  {materialLines === null ? '…' : shortByHex[i.hex] || '—'}
                </td>
                <td className={td}>
                  <span className={`rounded-full px-2 py-0.5 text-[0.625rem] font-semibold ${
                    st === 'none' ? 'bg-red-50 text-red-600' : st === 'short' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                  }`}>
                    {BOM_LABEL[st]}
                  </span>
                </td>
              </>
            );
          }}
        />
      )}
    </div>
  );
};

// Ô ngày kế hoạch: ngày đang dùng để tính BOT (KH tuần → KH tháng → cần giao) in đậm,
// đỏ nếu quá hạn / cam nếu sắp hạn; các ngày còn lại hiện mờ để tham khảo.
export const PlanDateCell = ({ i, which }: { i: HexInfo; which: DeadlineSource }) => {
  const d = which === 'tuần' ? i.khnkTuan : which === 'tháng' ? i.khnkThang : i.canGiao;
  const used = i.deadlineSource === which;
  const cls = !d ? 'text-slate-300'
    : !used ? 'text-slate-400'
      : i.overdue ? 'font-semibold text-red-600' : i.dueSoon ? 'font-semibold text-amber-600' : 'font-semibold text-slate-700';
  return (
    <td
      className={`${td} whitespace-nowrap tabular-nums ${cls}`}
      title={d ? (used ? 'Ngày đang dùng để tính BOT' : 'Chỉ để tham khảo (ưu tiên KH tuần → KH tháng → cần giao)') : undefined}
    >
      {d ? fmtDate(d) : '—'}
    </td>
  );
};

// ============================================================================
// Bảng hạng mục dùng chung cho 3 tab
// ============================================================================
const MAX_ROWS = 500;

const HexTable = ({ rows, extraHead, extraCells }: {
  rows: HexInfo[];
  extraHead: React.ReactNode;
  extraCells: (i: HexInfo) => React.ReactNode;
}) => (
  <div className="max-h-[460px] overflow-auto rounded-lg border border-slate-200 custom-scrollbar">
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-slate-50 text-slate-500">
        <tr>
          <th className={`${th} text-left`}>Mã Hex</th>
          <th className={`${th} text-left`}>Hạng mục</th>
          <th className={`${th} text-left`}>Công đoạn</th>
          <th className={`${th} text-left`}>KH tuần</th>
          <th className={`${th} text-left`}>KH tháng</th>
          <th className={`${th} text-left`}>Cần giao</th>
          <th className={`${th} text-right`}>Trị giá (tr)</th>
          <th className={`${th} text-right`}>Còn lại (tr)</th>
          {extraHead}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.slice(0, MAX_ROWS).map(i => (
          <tr key={i.hex} className="hover:bg-slate-50">
            <td className={`${td} font-medium text-slate-800`}>{i.hex}</td>
            <td className={`${td} max-w-[300px] truncate text-slate-600`} title={i.hangMuc}>{i.hangMuc}</td>
            <td className={`${td} text-slate-600`}>{i.stage ?? '—'}</td>
            <PlanDateCell i={i} which="tuần" />
            <PlanDateCell i={i} which="tháng" />
            <PlanDateCell i={i} which="cần giao" />
            <td className={`${td} text-right tabular-nums text-slate-600`}>{i.total.toLocaleString('en-US', { maximumFractionDigits: 1 })}</td>
            <td className={`${td} text-right tabular-nums ${i.remain > 0 ? 'text-amber-700' : 'text-emerald-600'}`}>
              {i.remain > 0 ? i.remain.toLocaleString('en-US', { maximumFractionDigits: 1 }) : '0'}
            </td>
            {extraCells(i)}
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={13} className="px-3 py-8 text-center text-slate-400">Không có hạng mục phù hợp.</td></tr>
        )}
      </tbody>
    </table>
    {rows.length > MAX_ROWS && (
      <p className="flex items-center gap-1.5 border-t border-slate-100 px-3 py-2 text-[0.6875rem] text-slate-500">
        <AlertTriangle size={12} /> Đang hiện {MAX_ROWS} / {fmtInt(rows.length)} hạng mục — dùng ô tìm hoặc bộ lọc để thu hẹp.
      </p>
    )}
  </div>
);
