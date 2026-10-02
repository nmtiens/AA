import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { DataRow, ColumnDefinition, TARGET_COLUMN_NAMES } from '../../../../types';
import { findColumnKey } from '../../utils/columnKeyResolver';
import { parseNumber } from '../../utils/numberParsers';
import { STATUS_GROUPS } from '../../constants';

// Giá trị gốc tính theo triệu đồng  =>  Tỷ = giá trị gốc / 1,000
const UNIT = 1000;
const NO_DATA = '(Chưa có)';

type Status = 'HOÀN THÀNH' | 'CÓ PHIẾU SX' | 'CHƯA TKSX' | 'CẦN XỬ LÝ' | 'TẠM NGƯNG' | 'HỦY';
type DKey = 'kv' | 'status' | 'pl';

interface Rec { kv: string; pl: string; status: Status; total: number }

const STATUS_COLOR: Record<Status, string> = {
  'HOÀN THÀNH': '#16a34a',
  'CÓ PHIẾU SX': '#2563eb',
  'CHƯA TKSX': '#94a3b8',
  'CẦN XỬ LÝ': '#d97706',
  'TẠM NGƯNG': '#a78bfa',
  'HỦY': '#dc2626',
};
const PALETTE = ['#1f2a44', '#2563eb', '#60a5fa', '#94a3b8', '#d97706', '#16a34a', '#a78bfa', '#cbd5e1'];

const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');

interface DonutProps {
  title: string;
  data: { name: string; value: number }[];
  selected?: string;
  onSelect: (name: string) => void;
  colorOf: (name: string, index: number) => string;
  metric: 'count' | 'value';
}

// Khai báo ở module scope (không đặt trong component cha) để không bị mount lại mỗi lần render
const Donut: React.FC<DonutProps> = ({ title, data, selected, onSelect, colorOf, metric }) => {
  const sum = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
      <p className="text-xs font-semibold text-slate-700 mb-2">{title}</p>
      {data.length === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center">Không có dữ liệu</p>
      ) : (
        <div className="flex items-center gap-3">
          <div className="w-24 h-24 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data} dataKey="value" nameKey="name" innerRadius={26} outerRadius={46}
                  paddingAngle={1} stroke="none" onClick={(d: any) => onSelect(d.name)}
                >
                  {data.map((d, i) => (
                    <Cell key={d.name} fill={colorOf(d.name, i)} cursor="pointer"
                          opacity={selected && selected !== d.name ? 0.25 : 1} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) =>
                    metric === 'count' ? fmtInt(v) : `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })} Tỷ`}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex-1 min-w-0 space-y-0.5">
            {data.slice(0, 6).map((d, i) => (
              <li key={d.name}>
                <button
                  type="button"
                  onClick={() => onSelect(d.name)}
                  className={`w-full flex items-center gap-2 rounded px-1.5 py-0.5 text-left text-[11px] hover:bg-slate-50 ${selected === d.name ? 'bg-slate-100 font-semibold' : ''}`}
                >
                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: colorOf(d.name, i) }} />
                  <span className="truncate flex-1 text-slate-700" title={d.name}>{d.name}</span>
                  <span className="tabular-nums text-slate-500">{((d.value / sum) * 100).toFixed(1)}%</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

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
    const plK = key(TARGET_COLUMN_NAMES.PHAN_LOAI_NHOM_SAN_PHAM, 'phan_loai_nhom_san_pham');
    const stK = key(TARGET_COLUMN_NAMES.TINH_TRANG, 'tinh_trang');
    const ipoK = key(TARGET_COLUMN_NAMES.TINH_TRANG_IPO, 'tinh_trang_ipo');
    const totK = key(TARGET_COLUMN_NAMES.TRI_GIA_DON_HANG_TONG, 'tri_gia_don_hang_tong');
    const invK = key(TARGET_COLUMN_NAMES.THANH_TIEN_NHAP_KHO, 'thanh_tien_nhap_kho_luy_ke');

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

      const ipo = String(row[ipoK] ?? '').toUpperCase();
      const st = String(row[stK] ?? '').toUpperCase();
      const totalRaw = parseNumber(row[totK]);
      const invRaw = parseNumber(row[invK]);

           // Ưu tiên cột Tình trạng IPO (nguồn chính thức); riêng "01. ĐANG SẢN XUẤT" thì chia tiếp
      // thành CHƯA TKSX / CÓ PHIẾU SX theo cột Tình trạng (công đoạn).
      let status: Status;
      if (ipo.includes('HỦY')) status = 'HỦY';
      else if (ipo.includes('HOÀN THÀNH')) status = 'HOÀN THÀNH';
      else if (ipo.includes('TẠM NGƯNG')) status = 'TẠM NGƯNG';
      else if (ipo.includes('CẦN XỬ LÝ')) status = 'CẦN XỬ LÝ';
      else if (STATUS_GROUPS.CHUA_THE_SX.some(s => st.includes(s))) status = 'CHƯA TKSX';
      else status = 'CÓ PHIẾU SX';

      out.push({ kv: txt(row[kvK]), pl: txt(row[plK]), status, total: status === 'HỦY' ? 0 : totalRaw });
    }
    return out;
  }, [data, columns, congTrinh, xuong]);

  const toggle = (k: DKey, v: string) => setSel(p => ({ ...p, [k]: p[k] === v ? undefined : v }));

  // Lọc chéo giữa 3 biểu đồ: mỗi biểu đồ bỏ qua lựa chọn của chính nó
  const build = (k: DKey) => {
    const others = (Object.keys(sel) as DKey[]).filter(x => x !== k && sel[x]);
    const m = new Map<string, number>();
    for (const r of records) {
      if (!others.every(o => r[o] === sel[o])) continue;
      m.set(r[k], (m.get(r[k]) ?? 0) + (metric === 'count' ? 1 : r.total / UNIT));
    }
    return [...m.entries()]
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  };

  const kvData = useMemo(() => build('kv'), [records, sel, metric]);     // eslint-disable-line react-hooks/exhaustive-deps
  const stData = useMemo(() => build('status'), [records, sel, metric]); // eslint-disable-line react-hooks/exhaustive-deps
  const plData = useMemo(() => build('pl'), [records, sel, metric]);     // eslint-disable-line react-hooks/exhaustive-deps

  const hasSel = Object.values(sel).some(Boolean);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">Cơ cấu đơn hàng</p>
        <div className="flex items-center gap-2">
          {hasSel && (
            <button onClick={() => setSel({})} className="text-[11px] text-slate-500 hover:text-slate-900 underline">
              Bỏ lọc
            </button>
          )}
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-[11px]">
            {(['count', 'value'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMetric(m)}
                className={`px-2.5 py-1 rounded-md font-medium ${metric === m ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
              >
                {m === 'count' ? 'Số mục' : 'Giá trị'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Donut title="Theo khu vực" data={kvData} selected={sel.kv} onSelect={n => toggle('kv', n)}
             colorOf={(_, i) => PALETTE[i % PALETTE.length]} metric={metric} />
      <Donut title="Theo tình trạng" data={stData} selected={sel.status} onSelect={n => toggle('status', n)}
             colorOf={(n, i) => STATUS_COLOR[n as Status] ?? PALETTE[i % PALETTE.length]} metric={metric} />
      <Donut title="Theo nhóm sản phẩm" data={plData} selected={sel.pl} onSelect={n => toggle('pl', n)}
             colorOf={(_, i) => PALETTE[i % PALETTE.length]} metric={metric} />
    </div>
  );
};