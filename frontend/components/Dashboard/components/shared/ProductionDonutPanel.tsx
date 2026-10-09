import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import { DataRow, ColumnDefinition, TARGET_COLUMN_NAMES } from '../../../../types';
import { findColumnKey } from '../../utils/columnKeyResolver';
import { parseNumber } from '../../utils/numberParsers';
import { categoryValue, NO_DATA_LABEL } from '../../utils/filterMatch';
import { exportOrderMixExcel, type MixExportRec } from '../../utils/orderMixExport';
import { Download, Info, Loader2, XCircle } from 'lucide-react';
import { formatTy } from '../../../../utils/money';
import { projectMatchKey } from '../../../../utils/productionMetrics';

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
const fmtTy = formatTy;

// ============================================================================
// Gom dữ liệu cho 1 biểu đồ tròn
// ============================================================================
export interface MixItem {
  name: string;
  /** Giá trị vẽ lát: số hạng mục hoặc Tỷ, tuỳ chế độ */
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
 * Khoá dùng để ĐẾM / gom công trình: tên chuẩn theo quy tắc chung (utils/productionMetrics.projectMatchKey —
 * gộp các cách viết của cùng mã, tên dùng cho nhiều mã thì "chốt theo tên", vd. ARHAUS nhiều mã EM… vẫn là
 * 1 công trình). Trước tự gom theo mã => gộp nhầm các tên khác nhau dùng chung 1 mã (STAR GRAND / START
 * GRAND…, AKA / NHÀ XINH) và lệch với Luồng đỏ / tồn kho / server. maKey giữ để không đổi chỗ gọi.
 */
export function projectKeyResolver(_rows: DataRow[], _maKey: string, tenKey: string): (row: DataRow) => string {
  return (row: DataRow) => projectMatchKey(row[tenKey]);
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

// ---------------------------------------------------------------------------
// Nhãn % cho MỌI lát: lát đủ lớn => chữ trắng nằm trong lát; lát nhỏ => chữ ngoài vòng có đường nối.
// Chống chồng chéo:
//   - nhãn ở vùng TRÊN / DƯỚI vòng xếp thành 1 hàng ngang (giãn theo chiều ngang),
//   - nhãn ở 2 BÊN xếp thành cột dọc (giãn theo chiều dọc),
//   giữ đúng thứ tự các lát => các đường nối không cắt nhau.
// ---------------------------------------------------------------------------
const RAD = Math.PI / 180;
const INSIDE_MIN = 0.06;      // lát từ 6% trở lên ghi bên trong
// Vòng bắt đầu ở 3 giờ: lát nhỏ (cuối danh sách) nằm ngay trên 3 giờ => nhãn xếp cột dọc bên phải,
// nằm ngang đúng lát. Bắt đầu 12 giờ thì lát nhỏ dồn ở đỉnh, hàng nhãn ngang phải giãn lệch khỏi lát.
const START_ANGLE = 0;

type LabelZone = 'inside' | 'top' | 'bottom' | 'side';
interface SliceLabel { zone: LabelZone; text: string; mid: number; x: number; y: number; side: 1 | -1 }

/**
 * Giãn các vị trí (đã sắp tăng dần) để cách nhau tối thiểu `gap`, mỗi cụm nhãn sát nhau được
 * CĂN GIỮA vào trung bình vị trí lý tưởng của nó (không đẩy lệch về 1 phía), rồi kẹp trong [lo, hi].
 */
function spreadCentered(ideal: number[], gap: number, lo: number, hi: number): number[] {
  type Cluster = { start: number; ids: number[]; sum: number };
  const clusters: Cluster[] = [];
  const place = (c: Cluster) => {
    const k = c.ids.length;
    c.start = c.sum / k - ((k - 1) * gap) / 2;
    c.start = Math.min(Math.max(c.start, lo), hi - (k - 1) * gap);
  };
  ideal.forEach((v, i) => {
    let c: Cluster = { start: v, ids: [i], sum: v };
    place(c);
    // Gộp với cụm trước khi chồng lên nhau, lặp tới khi hết chồng
    while (clusters.length) {
      const prev = clusters[clusters.length - 1];
      if (prev.start + prev.ids.length * gap <= c.start) break;
      clusters.pop();
      c = { start: 0, ids: [...prev.ids, ...c.ids], sum: prev.sum + c.sum };
      place(c);
    }
    clusters.push(c);
  });
  const out = new Array<number>(ideal.length);
  clusters.forEach(c => c.ids.forEach((id, j) => { out[id] = c.start + j * gap; }));
  return out;
}

/** Tính vị trí nhãn cho từng lát — khớp cách Recharts chia góc (bắt đầu 3 giờ, theo chiều kim đồng hồ). */
function layoutSliceLabels(
  values: number[], cx: number, cy: number, inner: number, outer: number, width: number, height: number, padAngle: number,
): SliceLabel[] {
  const sum = values.reduce((a, b) => a + b, 0) || 1;
  const n = values.filter(v => v > 0).length;
  const usable = 360 - (n > 1 ? n * padAngle : 0);
  let start = START_ANGLE;
  const ROW = 0.8;    // |sin| lớn hơn => thuộc vùng trên / dưới (gần đỉnh / đáy), còn lại xếp cột 2 bên
  const out: SliceLabel[] = values.map(v => {
    const ang = (usable * v) / sum;
    const mid = start - ang / 2;
    start -= ang + (n > 1 ? padAngle : 0);
    const pct = (v / sum) * 100;
    const text = pct > 0 && pct < 1 ? '<1%' : `${pct.toFixed(0)}%`;
    const cos = Math.cos(mid * RAD), sin = -Math.sin(mid * RAD);
    const side: 1 | -1 = cos >= 0 ? 1 : -1;
    if (pct / 100 >= INSIDE_MIN) {
      const r = inner + (outer - inner) / 2;
      return { zone: 'inside', text, mid, x: cx + r * cos, y: cy + r * sin, side };
    }
    const r = outer + 14;
    const zone: LabelZone = sin < -ROW ? 'top' : sin > ROW ? 'bottom' : 'side';
    return { zone, text, mid, x: cx + r * cos, y: cy + r * sin, side };
  });

  // Hàng ngang trên / dưới: cùng 1 độ cao, giãn ngang tối thiểu HGAP, không ra khỏi khung
  const HGAP = 24, EDGE = 14;
  for (const zone of ['top', 'bottom'] as const) {
    const row = out.filter(l => l.zone === zone).sort((a, b) => a.x - b.x);
    if (!row.length) continue;
    const y = zone === 'top' ? Math.max(8, cy - outer - 16) : Math.min(height - 8, cy + outer + 16);
    const xs = spreadCentered(row.map(l => l.x), HGAP, EDGE, width - EDGE);
    row.forEach((l, i) => { l.x = xs[i]; l.y = y; });
  }

  // Cột 2 bên: giãn dọc tối thiểu VGAP, không ra khỏi khung
  const VGAP = 13;   // > chiều cao chữ để không đè
  for (const side of [1, -1] as const) {
    const list = out.filter(l => l.zone === 'side' && l.side === side).sort((a, b) => a.y - b.y);
    const ys = spreadCentered(list.map(l => l.y), VGAP, 6, height - 6);
    // Nhãn bám theo vòng tròn (ngay ngoài mép vòng ở đúng độ cao của nhãn), không kéo ra 1 cột thẳng
    const R = outer + 10;
    list.forEach((l, i) => {
      l.y = ys[i];
      const dy = l.y - cy;
      l.x = cx + side * (Math.sqrt(Math.max(R * R - dy * dy, 0)) + 4);
    });
  }
  return out;
}

// Tooltip: đủ 3 chỉ số của lát đang trỏ
const MixTooltip: React.FC<{ active?: boolean; payload?: any[]; sum: number; metric: Metric }> = ({ active, payload, sum, metric }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as MixItem;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg min-w-[180px]">
      <p className="font-semibold text-slate-900 mb-1">
        {d.name} <span className="font-normal text-slate-500">· {((d.value / (sum || 1)) * 100).toFixed(1)}% {metric === 'count' ? 'hạng mục' : 'giá trị'}</span>
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
  // Khung vẽ rộng hơn vòng tròn để có chỗ cho nhãn ngoài
  const W = large ? 272 : 200, H = large ? 224 : 168;
  const OUTER = large ? 86 : 62, INNER = large ? 50 : 36, PAD = 1;
  const labels = useMemo(
    () => layoutSliceLabels(data.map(d => d.value), W / 2, H / 2, INNER, OUTER, W, H, PAD),
    [data, W, H, INNER, OUTER],
  );
  const renderLabel = (p: any) => {
    const l = labels[p.index];
    if (!l) return null;
    const dim = selected.length > 0 && !selected.includes(data[p.index]?.name);
    if (l.zone === 'inside') {
      return (
        <text x={l.x} y={l.y} fill="#ffffff" textAnchor="middle" dominantBaseline="central"
              fontSize={large ? 11 : 10} fontWeight={600} opacity={dim ? 0.5 : 1} pointerEvents="none">
          {l.text}
        </text>
      );
    }
    // Đường nối: mép lát -> ra ngoài -> tới nhãn (hàng trên/dưới: tới mép chữ; 2 bên: ngang tới chữ)
    // Góc giữa lát lấy đúng từ Recharts (p.midAngle) => chấm luôn nằm TRÊN lát thật, kể cả lát rất mỏng
    const cx = p.cx ?? W / 2, cy = p.cy ?? H / 2;
    const midA = typeof p.midAngle === 'number' ? p.midAngle : l.mid;
    const cos = Math.cos(midA * RAD), sin = -Math.sin(midA * RAD);
    const p1 = [cx + (OUTER - 4) * cos, cy + (OUTER - 4) * sin];   // chấm nằm trong lát, sát mép ngoài
    // 2 bên: nối thẳng mép lát -> chữ; trên / dưới: mép lát -> ra ngoài -> chân chữ
    const p2 = [cx + (OUTER + 4) * cos, cy + (OUTER + 4) * sin];
    const p3 = l.zone === 'side' ? [l.x - l.side * 2, l.y] : [l.x, l.y + (l.zone === 'top' ? 6 : -6)];
    const anchor = l.zone === 'side' ? (l.side === 1 ? 'start' : 'end') : 'middle';
    return (
      <g opacity={dim ? 0.4 : 1} pointerEvents="none">
        <polyline points={`${p1.join(',')} ${p2.join(',')} ${p3.join(',')}`} fill="none" stroke={p.fill} strokeWidth={1} />
        <circle cx={p1[0]} cy={p1[1]} r={2} fill={p.fill} stroke="#ffffff" strokeWidth={0.75} />
        <text x={l.x} y={l.y} textAnchor={anchor} dominantBaseline="central"
              fontSize={large ? 10.5 : 9.5} fontWeight={600} fill="#334155">
          {l.text}
        </text>
      </g>
    );
  };
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
          {/* Biểu đồ tròn: chạy theo chiều kim đồng hồ từ 3 giờ (các lát nhỏ cuối danh sách dồn về bên phải, nhãn xếp cột dọc ngang đúng lát), cùng thứ tự với chú thích */}
          {/* [&_*]:outline-none: bỏ khung đen trình duyệt vẽ quanh lát vừa bấm */}
          <div className="relative shrink-0 [&_*]:outline-none" style={{ width: W, height: H }}>
              <PieChart width={W} height={H}>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx={W / 2}
                  cy={H / 2}
                  startAngle={START_ANGLE}
                  endAngle={START_ANGLE - 360}
                  innerRadius={INNER}
                  outerRadius={OUTER}
                  paddingAngle={PAD}
                  stroke="none"
                  label={renderLabel}
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

            {/* Giữa vòng: tổng, hoặc phần đang chọn + tỷ lệ. Đơn vị "Tỷ" xuống dòng dưới và cỡ chữ giảm theo
                độ dài số — trước "1,959.19 Tỷ" rộng hơn lỗ giữa nên bị các lát che */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center text-center" style={{ maxWidth: INNER * 2 - 6 }}>
                {(() => {
                  const v = picked.length ? pickedSum : sum;
                  const txt = metric === 'count' ? fmtInt(v) : fmtTy(v);
                  const size = txt.length <= 6 ? (large ? 16 : 12) : txt.length <= 8 ? (large ? 14 : 11) : (large ? 12 : 10);
                  return (
                    <span className="font-semibold tabular-nums text-slate-900 leading-tight" style={{ fontSize: size }}>
                      {txt}
                    </span>
                  );
                })()}
                <span className="text-[0.625rem] text-slate-500 leading-tight">
                  {picked.length
                    ? `${metric === 'count' ? '' : 'Tỷ · '}đã chọn ${((pickedSum / (sum || 1)) * 100).toFixed(1)}%`
                    : metric === 'count' ? 'hạng mục' : 'Tỷ'}
                </span>
              </div>
            </div>
          </div>

          {/* Chú thích: đủ mọi lát, cùng thứ tự với vòng tròn, kèm số hạng mục / giá trị (Tỷ) theo chế độ đang xem */}
          <ul className={`flex-1 min-w-0 max-w-[16rem] space-y-0.5 overflow-y-auto custom-scrollbar ${large ? 'max-h-56' : 'max-h-40'}`}>
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
                  <span className="tabular-nums text-slate-600">{metric === 'count' ? fmtInt(d.value) : fmtTy(d.value)}</span>
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
  /**
   * Chế độ Hạng mục / Giá trị do trang giữ (để phễu "Tình trạng đơn hàng AATN" đổi cùng lúc).
   * Không truyền => thẻ tự giữ trạng thái riêng.
   */
  metric?: Metric;
  onMetricChange?: (m: Metric) => void;
  /** Bộ lọc phạm vi đang áp (vd. "Tình trạng IPO: 01. ĐANG SẢN XUẤT") — hiện ở dải tóm tắt */
  scopeNote?: string;
}

const recCt = (r: Rec) => r.ct;
const recTotal = (r: Rec) => r.total;

export const ProductionDonutPanel: React.FC<Props> = ({
  data, columns, selection, onSelectionChange, metric: metricProp, onMetricChange, scopeNote,
}) => {
  const [metricState, setMetricState] = useState<Metric>('count');
  const metric = metricProp ?? metricState;
  const setMetric = (m: Metric) => { setMetricState(m); onMetricChange?.(m); };

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
      // Đơn HỦY không tính (cả số hạng mục lẫn giá trị) — quy tắc chung
      if (String(row[ipoK] ?? '').toUpperCase().includes('HỦY')) continue;
      const ct = projectKey(row);
      out.push({
        ct,
        kv: categoryValue(row[kvK]), kh: categoryValue(row[khK]), pl: categoryValue(row[plK]),
        total: parseNumber(row[totK]),
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
      scopeNote={scopeNote}
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
// tiêu đề + nút Hạng mục/Giá trị + dải tóm tắt + 3 biểu đồ tròn xếp dọc. Dữ liệu và lọc do nơi dùng tự tính.
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
  /** Có giá trị => hiện nút X "Bỏ lọc" */
  onClear?: () => void;
  charts: OrderMixChart[];
  /** Số công trình / hạng mục / giá trị của phạm vi đang chọn (khớp mọi lát đã chọn) */
  summary?: MixSummary;
  /** Có giá trị => hiện nút "Xuất Excel" (có thể trả Promise để hiện trạng thái đang xuất) */
  onExport?: () => void | Promise<void>;
  className?: string;
  /** Biểu đồ tròn cỡ lớn (mặc định). false = bản gọn cho chỗ hẹp */
  large?: boolean;
  /** Bộ lọc phạm vi đang áp (vd. "Tình trạng IPO: 01. ĐANG SẢN XUẤT") — hiện ở dải tóm tắt */
  scopeNote?: string;
}

// Giải thích phạm vi số liệu: KHÁC "Đơn hàng mới" (đơn nhận từ PM trong kỳ, bảng Đơn hàng tổng)
const MIX_SCOPE_HELP =
  'Tính trên các hạng mục đang theo dõi trong bảng sản xuất, theo bộ lọc tổng của trang '
  + '(Tình trạng IPO, công trình, xưởng…) — KHÔNG lọc theo ngày.\n'
  + 'Khác với "Đơn hàng mới (P001)": đó là đơn nhận từ PM trong khoảng ngày đang chọn (bảng Đơn hàng tổng), '
  + 'nên hai con số không cần bằng nhau.';

export const OrderMixCard: React.FC<OrderMixCardProps> = ({
  metric, onMetricChange, onClear, charts, summary, onExport, className = 'flex-1', large = true, scopeNote,
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
            Nhóm đơn hàng
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
            Hạng mục đang theo dõi · không theo ngày
            <span title={MIX_SCOPE_HELP} aria-label={MIX_SCOPE_HELP} className="inline-flex cursor-help text-slate-400 hover:text-slate-600">
              <Info size={13} />
            </span>
          </p>
          <p className="text-[0.6875rem] text-slate-400">Theo khu vực, khách hàng, nhóm sản phẩm</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onClear && (
            <button
              onClick={onClear}
              title="Bỏ lọc"
              aria-label="Bỏ lọc"
              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              <XCircle size={18} />
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
                {m === 'count' ? 'Hạng mục' : 'Giá trị'}
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
          {scopeNote && (
            <p className="text-[0.6875rem] text-slate-500 truncate" title={scopeNote}>{scopeNote}</p>
          )}
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
