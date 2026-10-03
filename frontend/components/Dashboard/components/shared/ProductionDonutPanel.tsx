import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { DataRow, ColumnDefinition, TARGET_COLUMN_NAMES } from '../../../../types';
import { findColumnKey } from '../../utils/columnKeyResolver';
import { parseNumber } from '../../utils/numberParsers';
import { categoryValue, NO_DATA_LABEL } from '../../utils/filterMatch';
import { exportOrderMixExcel, type MixExportRec } from '../../utils/orderMixExport';
import { Download, Loader2 } from 'lucide-react';

// Giá trị gốc tính theo triệu đồng  =>  Tỷ = giá trị gốc / 1,000
const UNIT = 1000;
export const OTHERS = 'Khác';          // gộp các khách hàng nhỏ
export const TOP_CUSTOMERS = 6;        // số khách hàng hiển thị riêng, phần còn lại gộp vào "Khác"

type DKey = 'kv' | 'kh' | 'pl';
type Metric = 'count' | 'value';

interface Rec {
  /** Khoá đếm công trình (mã -> tên chuẩn), xem projectKeyResolver */
  ct: string;
  kv: string; kh: string; pl: string; total: number;
  row: DataRow;  // dòng gốc — cho file xuất Excel
}

const PALETTE = ['#1f2a44', '#2563eb', '#60a5fa', '#94a3b8', '#d97706', '#16a34a', '#a78bfa', '#cbd5e1'];
const OTHERS_COLOR = '#64748b';
export const pickMixColor = (name: string, i: number) => (name === OTHERS ? OTHERS_COLOR : PALETTE[i % PALETTE.length]);

const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
const fmtTy = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) < 10 ? 2 : 1 });
const fmtMetric = (v: number, metric: Metric) => (metric === 'count' ? fmtInt(v) : `${fmtTy(v)} Tỷ`);

// ============================================================================
// Gom dữ liệu cho 1 biểu đồ tròn
// ============================================================================
export interface MixItem {
  name: string;
  /** Giá trị vẽ lát: số mục hoặc Tỷ, tuỳ chế độ */
  value: number;
  items: number;      // số hạng mục
  totalTy: number;    // tổng giá trị (Tỷ)
  cts: Set<string>;   // các công trình
}

export interface MixSummary { cts: number; items: number; totalTy: number }

/** Gom các dòng theo `dimOf`, trả về danh sách lát (đã bỏ lát = 0), sắp giảm dần theo value. */
export function aggregateMix<R>(
  rows: R[],
  dimOf: (r: R) => string,
  ctOf: (r: R) => string,
  totalTrieuOf: (r: R) => number,
  metric: Metric,
): MixItem[] {
  const m = new Map<string, MixItem>();
  for (const r of rows) {
    const name = dimOf(r);
    let e = m.get(name);
    if (!e) { e = { name, value: 0, items: 0, totalTy: 0, cts: new Set() }; m.set(name, e); }
    const ty = totalTrieuOf(r) / UNIT;
    e.items++;
    e.totalTy += ty;
    e.cts.add(ctOf(r));
    e.value += metric === 'count' ? 1 : ty;
  }
  return [...m.values()].filter(d => d.value > 0).sort((a, b) => b.value - a.value);
}

/**
 * Khoá dùng để ĐẾM công trình: theo mã công trình, xoá trùng, rồi map về 1 tên chuẩn.
 * - 1 mã có thể có nhiều cách viết tên (vd. "MARRIOT…" / "MARRIOTT…") => lấy tên xuất hiện nhiều nhất.
 * - Hàng xuất khẩu mỗi đơn 1 mã (ARHAUS có hàng trăm mã EM…) nhưng cùng 1 tên => vẫn chỉ tính 1 công trình.
 * Dòng không có mã thì dùng chính tên. Kết quả viết HOA để không đếm trùng do khác hoa/thường, khoảng trắng.
 */
export function projectKeyResolver(rows: DataRow[], maKey: string, tenKey: string): (row: DataRow) => string {
  const norm = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  const counts = new Map<string, Map<string, number>>(); // mã -> (tên -> số dòng)
  for (const row of rows) {
    const ma = norm(row[maKey]);
    const ten = norm(row[tenKey]);
    if (!ma || !ten) continue;
    let m = counts.get(ma);
    if (!m) { m = new Map(); counts.set(ma, m); }
    m.set(ten, (m.get(ten) ?? 0) + 1);
  }
  const canonical = new Map<string, string>();
  counts.forEach((m, ma) => {
    let best = '', bestN = -1;
    m.forEach((n, ten) => { if (n > bestN || (n === bestN && ten < best)) { best = ten; bestN = n; } });
    canonical.set(ma, best);
  });
  return (row: DataRow) => canonical.get(norm(row[maKey])) ?? norm(row[tenKey]);
}

/** Tóm tắt (số công trình / hạng mục / giá trị) của 1 tập dòng. */
export function summarizeMix<R>(rows: R[], ctOf: (r: R) => string, totalTrieuOf: (r: R) => number): MixSummary {
  const cts = new Set<string>();
  let total = 0;
  for (const r of rows) { cts.add(ctOf(r)); total += totalTrieuOf(r); }
  return { cts: cts.size, items: rows.length, totalTy: total / UNIT };
}

/** Giữ top N (và luôn giữ mục đang chọn), phần còn lại gộp thành "Khác". `list` đã sắp giảm dần. */
export const groupTopN = (list: MixItem[], topN: number, selected: string[] = []): MixItem[] => {
  if (list.length <= topN) return list;
  const head = list.filter((d, i) => i < topN || selected.includes(d.name));
  const rest = list.filter(d => !head.includes(d));
  if (rest.length === 0) return head;
  const others: MixItem = { name: OTHERS, value: 0, items: 0, totalTy: 0, cts: new Set() };
  for (const d of rest) {
    others.value += d.value; others.items += d.items; others.totalTy += d.totalTy;
    d.cts.forEach(c => others.cts.add(c));
  }
  return [...head, others];
};

// Mã đầu tên kiểu "01. BÀN", "10. CỬA"
const CODE_PREFIX = /^(\d+)\s*[.\-)]/;

/**
 * Thứ tự hiển thị: nếu mọi nhóm đều có mã số đầu tên (nhóm sản phẩm) => xếp theo mã 01, 02, 03...
 * (màu mỗi nhóm cố định dù đổi bộ lọc); ngược lại giữ giảm dần theo giá trị.
 * "(Chưa có)" và "Khác" luôn đứng cuối.
 */
export const orderMix = (list: MixItem[]): MixItem[] => {
  const isTail = (n: string) => n === NO_DATA_LABEL || n === OTHERS;
  const head = list.filter(d => !isTail(d.name));
  const tail = list.filter(d => isTail(d.name)).sort((a, b) => (a.name === OTHERS ? 1 : b.name === OTHERS ? -1 : 0));
  if (head.length > 0 && head.every(d => CODE_PREFIX.test(d.name))) {
    const code = (n: string) => Number(CODE_PREFIX.exec(n)![1]);
    head.sort((a, b) => code(a.name) - code(b.name) || a.name.localeCompare(b.name, 'vi'));
  }
  return [...head, ...tail];
};

// Nhãn % hiển thị ngay trên vòng tròn (bỏ qua lát dưới 5% cho khỏi chật)
const RAD = Math.PI / 180;
const renderPercent = (p: any) => {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent } = p;
  if (!percent || percent < 0.05) return null;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RAD);
  const y = cy + r * Math.sin(-midAngle * RAD);
  return (
    <text x={x} y={y} fill="#ffffff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

// Tooltip: đủ 3 chỉ số của lát đang trỏ
const MixTooltip: React.FC<{ active?: boolean; payload?: any[]; sum: number; metric: Metric }> = ({ active, payload, sum, metric }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as MixItem;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg min-w-[180px]">
      <p className="font-semibold text-slate-900 mb-1">
        {d.name} <span className="font-normal text-slate-500">· {((d.value / (sum || 1)) * 100).toFixed(1)}% {metric === 'count' ? 'số mục' : 'giá trị'}</span>
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 tabular-nums">
        <dt className="text-slate-500">Công trình</dt><dd className="text-right text-slate-800">{fmtInt(d.cts.size)}</dd>
        <dt className="text-slate-500">Hạng mục</dt><dd className="text-right text-slate-800">{fmtInt(d.items)}</dd>
        <dt className="text-slate-500">Giá trị</dt><dd className="text-right text-slate-800">{fmtTy(d.totalTy)} Tỷ</dd>
      </dl>
      {d.name !== OTHERS && <p className="mt-1.5 text-[0.625rem] text-slate-400">Bấm để lọc cả trang</p>}
    </div>
  );
};

interface DonutProps {
  title: string;
  data: MixItem[];
  /** Các lát đang chọn (rỗng = không chọn) */
  selected: string[];
  onSelect: (name: string) => void;
  colorOf: (name: string, index: number) => string;
  metric: Metric;
  /** Bản to hơn (dùng khi thẻ nằm trong cột rộng, không bị giới hạn chiều cao) */
  large?: boolean;
}

// Khai báo ở module scope (không đặt trong component cha) để không bị mount lại mỗi lần render
const Donut: React.FC<DonutProps> = ({ title, data, selected, onSelect, colorOf, metric, large = false }) => {
  const sum = data.reduce((s, d) => s + d.value, 0);
  const picked = data.filter(d => selected.includes(d.name));
  const pickedSum = picked.reduce((s, d) => s + d.value, 0);
  const isPicked = (n: string) => selected.length === 0 || selected.includes(n);

  return (
    <div className="flex-1 flex flex-col min-h-0 py-3 first:pt-0 last:pb-0">
      <p className="text-xs font-semibold text-slate-700 mb-2">{title}</p>
      {data.length === 0 ? (
        <p className="flex-1 flex items-center justify-center text-xs text-slate-400">Không có dữ liệu</p>
      ) : (
        <div className="flex-1 flex items-center justify-between gap-4">
          {/* Biểu đồ tròn: chạy theo chiều kim đồng hồ từ 12 giờ, cùng thứ tự với chú thích */}
          <div className={`relative ${large ? 'w-52 h-52' : 'w-36 h-36'} shrink-0`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  startAngle={90}
                  endAngle={-270}
                  innerRadius={large ? 56 : 38}
                  outerRadius={large ? 100 : 68}
                  paddingAngle={1}
                  stroke="none"
                  label={renderPercent}
                  labelLine={false}
                  isAnimationActive={false}
                  onClick={(d: any) => onSelect(d.name)}
                >
                  {data.map((d, i) => (
                    <Cell
                      key={d.name}
                      fill={colorOf(d.name, i)}
                      cursor={d.name === OTHERS ? 'default' : 'pointer'}
                      opacity={isPicked(d.name) ? 1 : 0.25}
                    />
                  ))}
                </Pie>
                <Tooltip content={<MixTooltip sum={sum} metric={metric} />} wrapperStyle={{ zIndex: 20 }} />
              </PieChart>
            </ResponsiveContainer>

            {/* Giữa vòng: tổng, hoặc phần đang chọn + tỷ lệ */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className={`${large ? 'text-base' : 'text-xs'} font-semibold tabular-nums text-slate-900 leading-tight`}>
                {fmtMetric(picked.length ? pickedSum : sum, metric)}
              </span>
              <span className="text-[0.625rem] text-slate-500 leading-tight">
                {picked.length
                  ? `đã chọn · ${((pickedSum / (sum || 1)) * 100).toFixed(1)}%`
                  : metric === 'count' ? 'hạng mục' : 'tổng giá trị'}
              </span>
            </div>
          </div>

          {/* Chú thích: đủ mọi lát, cùng thứ tự với vòng tròn, kèm % */}
          <ul className={`flex-1 min-w-0 max-w-[16rem] space-y-0.5 overflow-y-auto custom-scrollbar ${large ? 'max-h-52' : 'max-h-36'}`}>
            {data.map((d, i) => (
              <li key={d.name}>
                <button
                  type="button"
                  onClick={() => onSelect(d.name)}
                  title={`${d.name}: ${fmtInt(d.cts.size)} công trình · ${fmtInt(d.items)} hạng mục · ${fmtTy(d.totalTy)} Tỷ`}
                  className={`w-full flex items-center gap-2 rounded px-1.5 py-0.5 text-left ${large ? 'text-xs' : 'text-[0.6875rem]'} hover:bg-slate-50 ${selected.includes(d.name) ? 'bg-slate-100 font-semibold' : ''} ${isPicked(d.name) ? '' : 'opacity-50'} ${d.name === OTHERS ? 'cursor-default' : ''}`}
                >
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colorOf(d.name, i) }} />
                  <span className="truncate flex-1 text-slate-700">{d.name}</span>
                  <span className="tabular-nums text-slate-500">{((d.value / (sum || 1)) * 100).toFixed(1)}%</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export interface OrderMixSelection { kv: string[]; kh: string[]; pl: string[] }

interface Props {
  /**
   * Dữ liệu sản xuất đã áp các bộ lọc tổng KHÁC (công trình, xưởng, tình trạng...), nhưng CHƯA lọc
   * Khu vực / Khách hàng / Nhóm sản phẩm — 3 tiêu chí này biểu đồ tự lọc chéo theo `selection`.
   */
  data: DataRow[];
  columns: ColumnDefinition[];
  /** Lựa chọn hiện tại = chính bộ lọc tổng Khu vực dự án / Khách hàng / Nhóm sản phẩm của trang */
  selection: OrderMixSelection;
  /** Bấm lát/chú thích -> trang cập nhật bộ lọc tổng => phễu, bảng, KPI... cùng đổi theo */
  onSelectionChange: (next: OrderMixSelection) => void;
}

const recCt = (r: Rec) => r.ct;
const recTotal = (r: Rec) => r.total;

export const ProductionDonutPanel: React.FC<Props> = ({ data, columns, selection, onSelectionChange }) => {
  const [metric, setMetric] = useState<Metric>('count');

  const records = useMemo<Rec[]>(() => {
    const key = (target: string, fallback: string) => findColumnKey(columns, target) || fallback;
    const kvK = key('khu_vuc_du_an', 'khu_vuc_du_an');
    const khK = key('khach_hang', 'khach_hang');
    const plK = key(TARGET_COLUMN_NAMES.PHAN_LOAI_NHOM_SAN_PHAM, 'phan_loai_nhom_san_pham');
    const ipoK = key(TARGET_COLUMN_NAMES.TINH_TRANG_IPO, 'tinh_trang_ipo');
    const totK = key(TARGET_COLUMN_NAMES.TRI_GIA_DON_HANG_TONG, 'tri_gia_don_hang_tong');
    const ctK = key(TARGET_COLUMN_NAMES.CONG_TRINH, 'ten_cong_trinh');
    const maK = key(TARGET_COLUMN_NAMES.MA_CONG_TRINH, 'ma_cong_trinh');
    const projectKey = projectKeyResolver(data, maK, ctK);

    const out: Rec[] = [];
    for (const row of data) {
      if (!String(row[ctK] ?? '').trim()) continue;
      const ct = projectKey(row);
      // Đơn hủy không tính giá trị (vẫn được đếm ở chế độ "Số mục")
      const cancelled = String(row[ipoK] ?? '').toUpperCase().includes('HỦY');
      out.push({
        ct,
        kv: categoryValue(row[kvK]), kh: categoryValue(row[khK]), pl: categoryValue(row[plK]),
        total: cancelled ? 0 : parseNumber(row[totK]),
        row,
      });
    }
    return out;
  }, [data, columns]);

  // Bấm 1 lát: chọn riêng lát đó; bấm lại đúng lát đang chọn duy nhất => bỏ chọn
  const toggle = (k: DKey, v: string) => {
    if (v === OTHERS) return; // "Khác" là nhóm gộp, không lọc được
    const cur = selection[k];
    onSelectionChange({ ...selection, [k]: cur.length === 1 && cur[0] === v ? [] : [v] });
  };

  // Các dòng khớp lựa chọn của mọi biểu đồ, trừ `exclude` (lọc chéo: mỗi biểu đồ bỏ qua lựa chọn của chính nó)
  const matching = (exclude?: DKey) => {
    const active = (['kv', 'kh', 'pl'] as DKey[])
      .filter(x => x !== exclude && selection[x].length > 0)
      .map(x => [x, new Set(selection[x])] as const);
    return active.length ? records.filter(r => active.every(([o, set]) => set.has(r[o]))) : records;
  };

  const build = (k: DKey, topN?: number) => {
    const list = aggregateMix(matching(k), r => r[k], recCt, recTotal, metric);
    return orderMix(topN ? groupTopN(list, topN, selection[k]) : list);
  };

  const kvData = useMemo(() => build('kv'), [records, selection, metric]);                  // eslint-disable-line react-hooks/exhaustive-deps
  const khData = useMemo(() => build('kh', TOP_CUSTOMERS), [records, selection, metric]);   // eslint-disable-line react-hooks/exhaustive-deps
  const plData = useMemo(() => build('pl'), [records, selection, metric]);                  // eslint-disable-line react-hooks/exhaustive-deps
  const summary = useMemo(() => summarizeMix(matching(), recCt, recTotal), [records, selection]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasSel = selection.kv.length + selection.kh.length + selection.pl.length > 0;

  const handleExport = () => {
    const toExport = (rs: Rec[]): MixExportRec[] =>
      rs.map(r => ({ ctKey: r.ct, kv: r.kv, kh: r.kh, pl: r.pl, total: r.total, row: r.row }));
    const picked = [...selection.kv, ...selection.kh, ...selection.pl];
    return exportOrderMixExcel({
      fileName: `co_cau_don_hang_${new Date().toISOString().slice(0, 10)}`,
      scopeLabel: picked.length ? picked.join(' · ') : 'Tất cả (theo bộ lọc tổng của trang)',
      byDim: { kv: toExport(matching('kv')), kh: toExport(matching('kh')), pl: toExport(matching('pl')) },
      scopeRows: toExport(matching()),
      columns,
    });
  };

  return (
    <OrderMixCard
      metric={metric}
      onMetricChange={setMetric}
      onClear={hasSel ? () => onSelectionChange({ kv: [], kh: [], pl: [] }) : undefined}
      onExport={handleExport}
      summary={summary}
      charts={[
        { title: 'Theo khu vực', data: kvData, selected: selection.kv, onSelect: n => toggle('kv', n) },
        { title: 'Theo khách hàng', data: khData, selected: selection.kh, onSelect: n => toggle('kh', n) },
        { title: 'Theo nhóm sản phẩm', data: plData, selected: selection.pl, onSelect: n => toggle('pl', n) },
      ]}
    />
  );
};

// ============================================================================
// Thẻ "Cơ cấu đơn hàng" dùng chung (Tổng quan, Luồng đỏ, Căn mẫu, Báo cáo tiến độ công trình):
// tiêu đề + nút Số mục/Giá trị + dải tóm tắt + 3 biểu đồ tròn xếp dọc. Dữ liệu và lọc do nơi dùng tự tính.
// ============================================================================
export interface OrderMixChart {
  title: string;
  data: MixItem[];
  selected?: string[];
  onSelect: (name: string) => void;
  colorOf?: (name: string, index: number) => string;
}

interface OrderMixCardProps {
  metric: Metric;
  onMetricChange: (m: Metric) => void;
  /** Có giá trị => hiện nút "Bỏ lọc" */
  onClear?: () => void;
  charts: OrderMixChart[];
  /** Số công trình / hạng mục / giá trị của phạm vi đang chọn (khớp mọi lát đã chọn) */
  summary?: MixSummary;
  /** Có giá trị => hiện nút "Xuất Excel" (có thể trả Promise để hiện trạng thái đang xuất) */
  onExport?: () => void | Promise<void>;
  className?: string;
  /** Biểu đồ tròn cỡ lớn (mặc định). false = bản gọn cho chỗ hẹp */
  large?: boolean;
}

export const OrderMixCard: React.FC<OrderMixCardProps> = ({
  metric, onMetricChange, onClear, charts, summary, onExport, className = 'flex-1', large = true,
}) => {
  const picked = charts.flatMap(c => c.selected ?? []);
  const [exporting, setExporting] = useState(false);
  const runExport = async () => {
    if (!onExport || exporting) return;
    setExporting(true);
    try {
      await onExport();
    } catch (err) {
      console.error('Lỗi xuất Excel cơ cấu đơn hàng:', err);
      alert('Không xuất được file Excel, vui lòng thử lại.');
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className={`${className} flex flex-col bg-white rounded-xl border border-slate-200 p-5 shadow-sm min-h-0`}>
      {/* Tiêu đề: cùng kiểu với thẻ phễu bên trái */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-800">
            Cơ cấu đơn hàng
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Theo khu vực, khách hàng, nhóm sản phẩm</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onClear && (
            <button onClick={onClear} className="text-xs text-slate-500 hover:text-slate-900 underline">
              Bỏ lọc
            </button>
          )}
          {onExport && (
            <button
              type="button"
              onClick={runExport}
              disabled={exporting}
              title="Xuất Excel: tóm tắt, cơ cấu theo khu vực / khách hàng / nhóm SP và danh sách hạng mục của phạm vi đang chọn"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60"
            >
              {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {exporting ? 'Đang xuất...' : 'Xuất Excel'}
            </button>
          )}
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
            {(['count', 'value'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => onMetricChange(m)}
                className={`px-3 py-1 rounded-md font-medium ${metric === m ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
              >
                {m === 'count' ? 'Số mục' : 'Giá trị'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Dải tóm tắt phạm vi đang chọn — đổi ngay khi bấm vào lát */}
      {summary && (
        <div className={`mb-4 rounded-lg border px-3 py-2.5 ${picked.length ? 'border-blue-200 bg-blue-50/60' : 'border-slate-200 bg-slate-50'}`}>
          <p className="text-[0.6875rem] text-slate-500 truncate" title={picked.join(' · ')}>
            {picked.length
              ? <>Đang chọn: <span className="font-semibold text-slate-800">{picked.join(' · ')}</span></>
              : 'Tất cả (bấm vào biểu đồ để lọc)'}
          </p>
          <div className="mt-1.5 grid grid-cols-3 divide-x divide-slate-200 text-center">
            {[
              { label: 'Công trình', value: fmtInt(summary.cts) },
              { label: 'Hạng mục', value: fmtInt(summary.items) },
              { label: 'Giá trị', value: fmtTy(summary.totalTy), unit: 'Tỷ' },
            ].map(s => (
              <div key={s.label} className="px-1">
                <p className="text-[0.625rem] uppercase tracking-wide text-slate-500">{s.label}</p>
                <p className="text-base font-semibold tabular-nums text-slate-900 leading-tight">
                  {s.value}{s.unit && <span className="ml-0.5 text-[0.6875rem] font-medium text-slate-400">{s.unit}</span>}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Các biểu đồ chia đều chiều cao, ngăn cách bằng đường kẻ mảnh */}
      <div className="flex-1 flex flex-col divide-y divide-slate-100 min-h-0">
        {charts.map(c => (
          <Donut key={c.title} title={c.title} data={c.data} selected={c.selected ?? []} onSelect={c.onSelect}
                 colorOf={c.colorOf ?? pickMixColor} metric={metric} large={large} />
        ))}
      </div>
    </div>
  );
};
