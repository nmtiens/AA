import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { DataRow, ColumnDefinition, TARGET_COLUMN_NAMES } from '../../../../types';
import { findColumnKey } from '../../utils/columnKeyResolver';
import { parseNumber } from '../../utils/numberParsers';

// Giá trị gốc tính theo triệu đồng  =>  Tỷ = giá trị gốc / 1,000
const UNIT = 1000;
const NO_DATA = '(Chưa có)';
const OTHERS = 'Khác';          // gộp các khách hàng nhỏ
const TOP_CUSTOMERS = 6;        // số khách hàng hiển thị riêng, phần còn lại gộp vào "Khác"

type DKey = 'kv' | 'kh' | 'pl';

interface Rec { kv: string; kh: string; pl: string; total: number }

const PALETTE = ['#1f2a44', '#2563eb', '#60a5fa', '#94a3b8', '#d97706', '#16a34a', '#a78bfa', '#cbd5e1'];
const OTHERS_COLOR = '#64748b';

const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');

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

interface DonutProps {
  title: string;
  data: { name: string; value: number }[];
  selected?: string;
  onSelect: (name: string) => void;
  colorOf: (name: string, index: number) => string;
  metric: 'count' | 'value';
}

// Khai báo ở module scope (không đặt trong component cha) để không bị mount lại mỗi lần render
const Donut: React.FC<DonutProps> = ({ title, data, selected, onSelect, colorOf, metric }) => (
  <div className="flex-1 flex flex-col min-h-0 py-3 first:pt-0 last:pb-0">
    <p className="text-xs font-semibold text-slate-700 mb-2">{title}</p>
    {data.length === 0 ? (
      <p className="flex-1 flex items-center justify-center text-xs text-slate-400">Không có dữ liệu</p>
    ) : (
      <div className="flex-1 flex items-center justify-between gap-4">
        {/* Biểu đồ tròn (có % ngay trên vòng) */}
        <div className="w-36 h-36 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={38}
                outerRadius={68}
                paddingAngle={1}
                stroke="none"
                label={renderPercent}
                labelLine={false}
                onClick={(d: any) => onSelect(d.name)}
              >
                {data.map((d, i) => (
                  <Cell
                    key={d.name}
                    fill={colorOf(d.name, i)}
                    cursor={d.name === OTHERS ? 'default' : 'pointer'}
                    opacity={selected && selected !== d.name ? 0.25 : 1}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number) =>
                  metric === 'count' ? fmtInt(v) : `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })} Tỷ`}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Chú thích nằm sát mép phải */}
        <ul className="w-44 shrink-0 space-y-0.5">
          {data.slice(0, 8).map((d, i) => (
            <li key={d.name}>
              <button
                type="button"
                onClick={() => onSelect(d.name)}
                className={`w-full flex items-center gap-2 rounded px-1.5 py-0.5 text-left text-[11px] hover:bg-slate-50 ${selected === d.name ? 'bg-slate-100 font-semibold' : ''}`}
              >
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colorOf(d.name, i) }} />
                <span className="truncate flex-1 text-slate-700" title={d.name}>{d.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )}
  </div>
);

interface Props {
  data: DataRow[];
  columns: ColumnDefinition[];
  /** Bộ lọc Công trình / Khu vực sản xuất đang chọn ở thanh "Bộ lọc tổng" của Dashboard (rỗng = tất cả) */
  congTrinh: string[];
  xuong: string[];
}

export const ProductionDonutPanel: React.FC<Props> = ({ data, columns, congTrinh, xuong }) => {
  const [metric, setMetric] = useState<'count' | 'value'>('count');
  const [sel, setSel] = useState<Partial<Record<DKey, string>>>({});

  const records = useMemo<Rec[]>(() => {
    const key = (target: string, fallback: string) => findColumnKey(columns, target) || fallback;
    const ctK = key(TARGET_COLUMN_NAMES.CONG_TRINH, 'ten_cong_trinh');
    const xK = key(TARGET_COLUMN_NAMES.XUONG, 'xuong_chinh');
    const kvK = key('khu_vuc', 'khu_vuc');
    const khK = key('khach_hang', 'khach_hang');
    const plK = key(TARGET_COLUMN_NAMES.PHAN_LOAI_NHOM_SAN_PHAM, 'phan_loai_nhom_san_pham');
    const ipoK = key(TARGET_COLUMN_NAMES.TINH_TRANG_IPO, 'tinh_trang_ipo');
    const totK = key(TARGET_COLUMN_NAMES.TRI_GIA_DON_HANG_TONG, 'tri_gia_don_hang_tong');

    const txt = (v: unknown) => {
      const t = String(v ?? '').trim();
      return !t || t.startsWith('#') ? NO_DATA : t;
    };
    const out: Rec[] = [];

    for (const row of data) {
      const ct = String(row[ctK] ?? '').trim();
      if (!ct) continue;
      if (congTrinh.length > 0 && !congTrinh.includes(ct)) continue;
      if (xuong.length > 0 && !xuong.includes(String(row[xK] ?? '').trim())) continue;

      // Đơn hủy không tính giá trị (vẫn được đếm ở chế độ "Số mục")
      const cancelled = String(row[ipoK] ?? '').toUpperCase().includes('HỦY');
      const totalRaw = parseNumber(row[totK]);

      out.push({ kv: txt(row[kvK]), kh: txt(row[khK]), pl: txt(row[plK]), total: cancelled ? 0 : totalRaw });
    }
    return out;
  }, [data, columns, congTrinh, xuong]);

  const toggle = (k: DKey, v: string) => {
    if (v === OTHERS) return; // "Khác" là nhóm gộp, không lọc được
    setSel(p => ({ ...p, [k]: p[k] === v ? undefined : v }));
  };

  // Lọc chéo giữa 3 biểu đồ: mỗi biểu đồ bỏ qua lựa chọn của chính nó
  const build = (k: DKey, topN?: number) => {
    const others = (Object.keys(sel) as DKey[]).filter(x => x !== k && sel[x]);
    const m = new Map<string, number>();
    for (const r of records) {
      if (!others.every(o => r[o] === sel[o])) continue;
      m.set(r[k], (m.get(r[k]) ?? 0) + (metric === 'count' ? 1 : r.total / UNIT));
    }
    const list = [...m.entries()]
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    if (!topN || list.length <= topN) return list;

    // Giữ top N (và luôn giữ mục đang được chọn), phần còn lại gộp thành "Khác"
    const head = list.filter((d, i) => i < topN || d.name === sel[k]);
    const rest = list.filter(d => !head.includes(d)).reduce((s, d) => s + d.value, 0);
    return rest > 0 ? [...head, { name: OTHERS, value: rest }] : head;
  };

  const kvData = useMemo(() => build('kv'), [records, sel, metric]);                  // eslint-disable-line react-hooks/exhaustive-deps
  const khData = useMemo(() => build('kh', TOP_CUSTOMERS), [records, sel, metric]);   // eslint-disable-line react-hooks/exhaustive-deps
  const plData = useMemo(() => build('pl'), [records, sel, metric]);                  // eslint-disable-line react-hooks/exhaustive-deps

  const hasSel = Object.values(sel).some(Boolean);
  const pickColor = (name: string, i: number) => (name === OTHERS ? OTHERS_COLOR : PALETTE[i % PALETTE.length]);

  return (
    <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 p-5 shadow-sm min-h-0">
      {/* Tiêu đề: cùng kiểu với thẻ phễu bên trái */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-800">
            Cơ cấu đơn hàng
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Theo khu vực, khách hàng, nhóm sản phẩm</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasSel && (
            <button onClick={() => setSel({})} className="text-xs text-slate-500 hover:text-slate-900 underline">
              Bỏ lọc
            </button>
          )}
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
            {(['count', 'value'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMetric(m)}
                className={`px-3 py-1 rounded-md font-medium ${metric === m ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
              >
                {m === 'count' ? 'Số mục' : 'Giá trị'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3 biểu đồ chia đều chiều cao, ngăn cách bằng đường kẻ mảnh */}
      <div className="flex-1 flex flex-col divide-y divide-slate-100 min-h-0">
        <Donut title="Theo khu vực" data={kvData} selected={sel.kv} onSelect={n => toggle('kv', n)}
               colorOf={pickColor} metric={metric} />
        <Donut title="Theo khách hàng" data={khData} selected={sel.kh} onSelect={n => toggle('kh', n)}
               colorOf={pickColor} metric={metric} />
        <Donut title="Theo nhóm sản phẩm" data={plData} selected={sel.pl} onSelect={n => toggle('pl', n)}
               colorOf={pickColor} metric={metric} />
      </div>
    </div>
  );
};