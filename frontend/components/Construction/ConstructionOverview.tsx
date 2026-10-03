import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts';
import { Search, X } from 'lucide-react';
import { DataRow, ColumnDefinition, TARGET_COLUMN_NAMES } from '../../types';
import { findColumnKey } from '../Dashboard/utils/columnKeyResolver';
import { parseNumber } from '../Dashboard/utils/numberParsers';
import { parseVNDate } from '../Dashboard/utils/dateHelpers';
import { STATUS_GROUPS } from '../Dashboard/constants';
import SearchableSelect from '../Dashboard/components/Dashboards/SearchableSelect';
import { OrderMixCard, OTHERS, TOP_CUSTOMERS, groupTopN, aggregateMix, orderMix, projectKeyResolver } from '../Dashboard/components/shared/ProductionDonutPanel';
// ============================================================
// Báo cáo tiến độ công trình — dựng hoàn toàn từ productionData (không cần API mới)
// Đơn vị tiền gốc là TRIỆU ĐỒNG (xem utils/money.ts)  =>  Tỷ = giá trị gốc / 1,000
// ============================================================

type Status = 'HOÀN THÀNH' | 'CÓ PHIẾU SX' | 'CHƯA TKSX' | 'CẦN XỬ LÝ' | 'TẠM NGƯNG' | 'HỦY';
type FKey = 'ct' | 'pm' | 'pc' | 'kv' | 'kh' | 'pl' | 'month';
type Filters = Partial<Record<FKey, string | undefined>>;

interface Rec {
  ct: string; pm: string; pc: string; kv: string; kh: string; pl: string;
  ctKey: string;      // khoá ĐẾM công trình: mã công trình -> tên chuẩn (xem projectKeyResolver)
  month: string;      // 'YYYY-MM' hoặc 'none'
  status: Status;
  total: number;      // trị giá đơn hàng (0 nếu hủy)
  done: number;       // giá trị đã nhập kho, tối đa = total
}

const NO_DATA = '(Chưa có)';
const NO_MONTH = 'none';

const FILTER_LABEL: Record<FKey, string> = {
  ct: 'Công trình', pm: 'PM', pc: 'PC', kv: 'Khu vực', kh: 'Khách hàng', pl: 'Nhóm SP', month: 'Hạn giao',
};

const COLOR_DONE = '#16a34a';
const COLOR_REMAIN = '#f59e0b';
// Giá trị gốc tính theo triệu đồng (khớp backend TRIEU_TO_TY) => Tỷ = giá trị gốc / 1,000
const UNIT = 1000;
const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
const fmtTy = (raw: number) => {
  const t = raw / UNIT ;
  return t.toLocaleString('en-US', { maximumFractionDigits: Math.abs(t) < 10 ? 2 : 1 });
};
const monthLabel = (key: string) => {
  if (key === NO_MONTH) return 'Chưa có hạn';
  const [y, m] = key.split('-');
  return `T${m}/${y}`;
};

const isNotStarted = (status: string) => STATUS_GROUPS.CHUA_THE_SX.some(s => status.includes(s));

interface Props {
  data: DataRow[];
  columns: ColumnDefinition[];
}

const ConstructionOverview: React.FC<Props> = ({ data, columns }) => {
  const [f, setF] = useState<Filters>({});
  const [metric, setMetric] = useState<'count' | 'value'>('count'); // cho 3 biểu đồ tròn
  const [ctSearch, setCtSearch] = useState('');

  const toggle = (k: FKey, v: string) => setF(p => ({ ...p, [k]: p[k] === v ? undefined : v }));
  const setKey = (k: FKey, v: string) => setF(p => ({ ...p, [k]: v || undefined }));
  const activeKeys = (Object.keys(f) as FKey[]).filter(k => f[k]);

  // ---------- 1. Chuẩn hoá từng dòng 1 lần ----------
  const records = useMemo<Rec[]>(() => {
    const key = (target: string, fallback: string) => findColumnKey(columns, target) || fallback;
    const ctK = key(TARGET_COLUMN_NAMES.CONG_TRINH, 'ten_cong_trinh');
    const pmK = key('ten_pm', 'ten_pm');
    const pcK = key('ten_pc', 'ten_pc');
    const kvK = key('khu_vuc', 'khu_vuc');
    const khK = key('khach_hang', 'khach_hang');
    const plK = key(TARGET_COLUMN_NAMES.PHAN_LOAI_NHOM_SAN_PHAM, 'phan_loai_nhom_san_pham');
    const dlK = findColumnKey(columns, 'ngay_can_giao') || findColumnKey(columns, 'ngay_can') || 'ngay_can_giao';
    const stK = key(TARGET_COLUMN_NAMES.TINH_TRANG, 'tinh_trang');
    const ipoK = key(TARGET_COLUMN_NAMES.TINH_TRANG_IPO, 'tinh_trang_ipo');
    const totK = key(TARGET_COLUMN_NAMES.TRI_GIA_DON_HANG_TONG, 'tri_gia_don_hang_tong');
    const invK = key(TARGET_COLUMN_NAMES.THANH_TIEN_NHAP_KHO, 'thanh_tien_nhap_kho_luy_ke');
    const maK = key(TARGET_COLUMN_NAMES.MA_CONG_TRINH, 'ma_cong_trinh');
    const projectKey = projectKeyResolver(data, maK, ctK);

      const txt = (v: unknown) => {
      const t = String(v ?? '').trim();
      return !t || t.startsWith('#') ? NO_DATA : t;
    };

    const out: Rec[] = [];
    for (const row of data) {
      const ct = String(row[ctK] ?? '').trim();
      if (!ct) continue;

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

      const d = parseVNDate(row[dlK] as any);
      const month = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : NO_MONTH;

      const cancelled = status === 'HỦY';
      out.push({
        ct, ctKey: projectKey(row), pm: txt(row[pmK]), pc: txt(row[pcK]), kv: txt(row[kvK]), kh: txt(row[khK]), pl: txt(row[plK]),
        month, status,
        total: cancelled ? 0 : totalRaw,
        done: cancelled ? 0 : Math.min(Math.max(invRaw, 0), totalRaw),
      });
    }
    return out;
  }, [data, columns]);

  // Lọc chéo: mỗi biểu đồ bỏ qua bộ lọc của chính nó để vẫn đổi được lựa chọn
  const apply = (exclude?: FKey) =>
    records.filter(r => activeKeys.every(k => k === exclude || r[k] === f[k]));

  const rowsAll = useMemo(() => apply(), [records, f]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- 2. KPI ----------
  const kpi = useMemo(() => {
    const cts = new Set<string>();
    let cancelled = 0, open = 0, total = 0, done = 0;
    for (const r of rowsAll) {
      cts.add(r.ctKey);
      if (r.status === 'HỦY') cancelled++;
      else if (r.status !== 'HOÀN THÀNH') open++;
      total += r.total; done += r.done;
    }
    return { cts: cts.size, items: rowsAll.length, cancelled, open, total, done, remain: total - done };
  }, [rowsAll]);

  // ---------- 3. Cột chồng theo tháng hạn giao ----------
  const monthData = useMemo(() => {
    const m = new Map<string, { key: string; done: number; remain: number }>();
    for (const r of apply('month')) {
      const e = m.get(r.month) ?? { key: r.month, done: 0, remain: 0 };
      e.done += r.done; e.remain += r.total - r.done;
      m.set(r.month, e);
    }
    return [...m.values()]
      .sort((a, b) => (a.key === NO_MONTH ? 1 : b.key === NO_MONTH ? -1 : a.key.localeCompare(b.key)))
      .map(e => ({ ...e, label: monthLabel(e.key), done: e.done / UNIT, remain: e.remain / UNIT }));
  }, [records, f]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- 4. Biểu đồ tròn ----------
  const donut = (k: 'kv' | 'kh' | 'pl') => aggregateMix(apply(k), r => r[k], r => r.ctKey, r => r.total, metric);
  const kvData = useMemo(() => orderMix(donut('kv')), [records, f, metric]);       // eslint-disable-line react-hooks/exhaustive-deps
  const khData = useMemo(() => orderMix(groupTopN(donut('kh'), TOP_CUSTOMERS, f.kh ? [f.kh] : [])), [records, f, metric]); // eslint-disable-line react-hooks/exhaustive-deps
  const plData = useMemo(() => orderMix(donut('pl')), [records, f, metric]);       // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- 5. Bảng theo PC và theo công trình ----------
  const pcTable = useMemo(() => {
    const m = new Map<string, { name: string; cts: Set<string>; items: number; total: number }>();
    for (const r of apply('pc')) {
      const e = m.get(r.pc) ?? { name: r.pc, cts: new Set<string>(), items: 0, total: 0 };
      e.cts.add(r.ctKey); e.items++; e.total += r.total;
      m.set(r.pc, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total || b.items - a.items);
  }, [records, f]); // eslint-disable-line react-hooks/exhaustive-deps

  const ctTable = useMemo(() => {
    const q = ctSearch.trim().toLowerCase();
    const m = new Map<string, { name: string; pms: Set<string>; items: number; total: number; done: number }>();
    for (const r of apply('ct')) {
      if (q && !r.ct.toLowerCase().includes(q)) continue;
      const e = m.get(r.ct) ?? { name: r.ct, pms: new Set<string>(), items: 0, total: 0, done: 0 };
      e.pms.add(r.pm); e.items++; e.total += r.total; e.done += r.done;
      m.set(r.ct, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total || b.items - a.items);
  }, [records, f, ctSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Danh sách cho các ô chọn (lấy từ toàn bộ dữ liệu)
  const options = useMemo(() => {
    const uniq = (pick: (r: Rec) => string) => [...new Set(records.map(pick))].sort((a, b) => a.localeCompare(b, 'vi'));
    return {
      ct: uniq(r => r.ct), pm: uniq(r => r.pm), kv: uniq(r => r.kv),
      month: [...new Set(records.map(r => r.month))].sort((a, b) => (a === NO_MONTH ? 1 : b === NO_MONTH ? -1 : a.localeCompare(b))),
    };
  }, [records]);

  const display = (k: FKey, v: string) => (k === 'month' ? monthLabel(v) : v);

  if (records.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-slate-500">
        Chưa có dữ liệu sản xuất để lập báo cáo.
      </div>
    );
  }

  // ---------- UI ----------
  const selectCls =
    'h-9 min-w-[150px] max-w-[220px] rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-700 ' +
    'focus:outline-none focus:ring-2 focus:ring-wood-600/15 focus:border-wood-600';
  const cardCls = 'bg-white border border-slate-200 rounded-xl shadow-sm';

  const Kpi = ({ label, value, unit, tone = 'text-slate-900' }: { label: string; value: string; unit?: string; tone?: string }) => (
    <div className={`${cardCls} px-4 py-3`}>
      <p className="text-[11px] font-medium tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>
        {value}{unit && <span className="ml-1 text-sm font-medium text-slate-400">{unit}</span>}
      </p>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-wood-50">
      {/* Thanh tiêu đề + bộ lọc */}
      <div className="sticky top-0 z-30 bg-wood-50/90 backdrop-blur border-b border-slate-200 px-4 md:px-6 py-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Báo cáo tiến độ công trình</h2>
            <p className="text-xs text-slate-500">Giá trị tính bằng Tỷ đồng · Bấm vào cột, biểu đồ tròn hoặc dòng bảng để lọc chéo</p>
          </div>
                  <div className="flex flex-wrap items-center gap-2">
            <SearchableSelect
              value={f.ct ?? ''}
              onChange={v => setKey('ct', v)}
              options={options.ct.map(o => ({ code: o, name: o }))}
              allLabel="Công trình: Tất cả"
              widthClass="w-56"
              className="text-sm [&>button]:h-9 [&>button]:rounded-lg [&>button]:px-2.5"
            />
            <SearchableSelect
              value={f.pm ?? ''}
              onChange={v => setKey('pm', v)}
              options={options.pm.map(o => ({ code: o, name: o }))}
              allLabel="PM: Tất cả"
              widthClass="w-40"
              className="text-sm [&>button]:h-9 [&>button]:rounded-lg [&>button]:px-2.5"
            />
            <SearchableSelect
              value={f.kv ?? ''}
              onChange={v => setKey('kv', v)}
              options={options.kv.map(o => ({ code: o, name: o }))}
              allLabel="Khu vực: Tất cả"
              widthClass="w-44"
              className="text-sm [&>button]:h-9 [&>button]:rounded-lg [&>button]:px-2.5"
            />
            <SearchableSelect
              value={f.month ?? ''}
              onChange={v => setKey('month', v)}
              options={options.month.map(o => ({ code: o, name: monthLabel(o) }))}
              allLabel="Hạn giao: Tất cả"
              widthClass="w-40"
              className="text-sm [&>button]:h-9 [&>button]:rounded-lg [&>button]:px-2.5"
            />
          </div>
        </div>

        {activeKeys.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {activeKeys.map(k => (
              <button
                key={k}
                onClick={() => setKey(k, '')}
                className="inline-flex items-center gap-1 rounded-full bg-slate-900 text-white text-[11px] px-2.5 py-1 hover:bg-slate-700"
              >
                {FILTER_LABEL[k]}: {display(k, f[k]!)} <X size={11} />
              </button>
            ))}
            <button onClick={() => setF({})} className="text-[11px] text-slate-500 hover:text-slate-900 underline ml-1">
              Xóa tất cả bộ lọc
            </button>
          </div>
        )}
      </div>

      <div className="p-4 md:p-6 space-y-4">
        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          <Kpi label="Công trình" value={fmtInt(kpi.cts)} />
          <Kpi label="Tổng số mục" value={fmtInt(kpi.items)} />
          <Kpi label="Hủy" value={fmtInt(kpi.cancelled)} tone="text-red-600" />
          <Kpi label="Hạng mục chưa hoàn thành" value={fmtInt(kpi.open)} />
          <Kpi label="Tổng giá trị" value={fmtTy(kpi.total)} unit="Tỷ" />
          <Kpi label="Giá trị hoàn thành" value={fmtTy(kpi.done)} unit="Tỷ" tone="text-emerald-600" />
          <Kpi label="Giá trị còn SX" value={fmtTy(kpi.remain)} unit="Tỷ" tone="text-amber-600" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Cột trái: biểu đồ theo tháng + bảng theo PC */}
          <div className="xl:col-span-4 space-y-4">
            <div className={`${cardCls} p-4`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-700">Giá trị theo tháng hạn giao (Tỷ)</p>
                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-sm" style={{ background: COLOR_DONE }} />Đã hoàn thành</span>
                  <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-sm" style={{ background: COLOR_REMAIN }} />Còn SX</span>
                </div>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthData} margin={{ top: 8, right: 4, left: -14, bottom: 0 }}>
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                      formatter={(v: number, name: string) => [`${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} Tỷ`, name === 'done' ? 'Đã hoàn thành' : 'Còn SX']}
                    />
                    <Bar dataKey="done" stackId="a" fill={COLOR_DONE} cursor="pointer" onClick={(d: any) => toggle('month', d.key ?? d.payload?.key)}>
                      {monthData.map(d => <Cell key={d.key} opacity={f.month && f.month !== d.key ? 0.25 : 1} />)}
                    </Bar>
                    <Bar dataKey="remain" stackId="a" fill={COLOR_REMAIN} radius={[3, 3, 0, 0]} cursor="pointer" onClick={(d: any) => toggle('month', d.key ?? d.payload?.key)}>
                      {monthData.map(d => <Cell key={d.key} opacity={f.month && f.month !== d.key ? 0.25 : 1} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={`${cardCls} overflow-hidden`}>
              <p className="text-xs font-semibold text-slate-700 px-4 pt-3 pb-2">Theo người phụ trách (PC)</p>
              <div className="max-h-[340px] overflow-auto custom-scrollbar">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-left font-medium px-4 py-2">Tên PC</th>
                      <th className="text-right font-medium px-2 py-2">CT</th>
                      <th className="text-right font-medium px-2 py-2">Mục</th>
                      <th className="text-right font-medium px-4 py-2">Tổng GT (Tỷ)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pcTable.map(r => (
                      <tr key={r.name} onClick={() => toggle('pc', r.name)}
                          className={`cursor-pointer hover:bg-slate-50 ${f.pc === r.name ? 'bg-slate-100 font-semibold' : ''}`}>
                        <td className="px-4 py-1.5 text-slate-800">{r.name}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.cts.size}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(r.items)}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums">{fmtTy(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-slate-50 font-semibold text-slate-800">
                    <tr>
                      <td className="px-4 py-2">Tổng cộng</td>
                      <td className="px-2 py-2 text-right tabular-nums">{new Set(pcTable.flatMap(r => [...r.cts])).size}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmtInt(pcTable.reduce((s, r) => s + r.items, 0))}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtTy(pcTable.reduce((s, r) => s + r.total, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          {/* Cột giữa: bảng công trình */}
          <div className={`xl:col-span-5 ${cardCls} overflow-hidden flex flex-col`}>
            <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
              <p className="text-xs font-semibold text-slate-700">Danh sách công trình ({fmtInt(ctTable.length)})</p>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={ctSearch} onChange={e => setCtSearch(e.target.value)} placeholder="Tìm công trình..."
                  className="h-8 w-48 rounded-lg border border-slate-300 pl-8 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-wood-600/15 focus:border-wood-600"
                />
              </div>
            </div>
            <div className="flex-1 max-h-[720px] overflow-auto custom-scrollbar">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left font-medium px-4 py-2">Tên công trình</th>
                    <th className="text-left font-medium px-2 py-2">PM</th>
                    <th className="text-right font-medium px-2 py-2">Mục</th>
                    <th className="text-right font-medium px-2 py-2">Tổng GT (Tỷ)</th>
                    <th className="text-left font-medium px-4 py-2 w-32">Hoàn thành</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ctTable.map(r => {
                    const pct = r.total > 0 ? Math.min(100, (r.done / r.total) * 100) : 0;
                    const pms = [...r.pms];
                    return (
                      <tr key={r.name} onClick={() => toggle('ct', r.name)}
                          className={`cursor-pointer hover:bg-slate-50 ${f.ct === r.name ? 'bg-slate-100 font-semibold' : ''}`}>
                        <td className="px-4 py-1.5 text-slate-800 max-w-[260px] truncate" title={r.name}>{r.name}</td>
                        <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap" title={pms.join(', ')}>
                          {pms[0]}{pms.length > 1 ? ` +${pms.length - 1}` : ''}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(r.items)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtTy(r.total)}</td>
                        <td className="px-4 py-1.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-9 text-right tabular-nums text-slate-500">{pct.toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {ctTable.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Không có công trình phù hợp</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cột phải: thẻ "Cơ cấu đơn hàng" dùng chung với Tổng quan / Luồng đỏ / Căn mẫu */}
          <div className="xl:col-span-3 flex flex-col">
            <OrderMixCard
              metric={metric}
              onMetricChange={setMetric}
              summary={{ cts: kpi.cts, items: kpi.items, totalTy: kpi.total / UNIT }}
              charts={[
                { title: 'Theo khu vực', data: kvData, selected: f.kv ? [f.kv] : [], onSelect: n => toggle('kv', n) },
                // "Khác" là nhóm gộp các khách hàng nhỏ, không lọc được
                { title: 'Theo khách hàng', data: khData, selected: f.kh ? [f.kh] : [], onSelect: n => n !== OTHERS && toggle('kh', n) },
                { title: 'Theo nhóm sản phẩm', data: plData, selected: f.pl ? [f.pl] : [], onSelect: n => toggle('pl', n) },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConstructionOverview;