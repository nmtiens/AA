import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, ComposedChart, BarChart, Bar, Line, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, ReferenceLine, ReferenceArea, LabelList, Tooltip,
} from 'recharts';
import { Loader2 } from 'lucide-react';
import { fetchStockHealth, type StockHealth, type StockNhom } from '../../../../services/dataService';
import { formatTrieuAsTy } from '../../../../utils/money';
import { toISODateLocal } from '../../utils/dateHelpers';

// Tab "Tổng quan sức khoẻ tồn kho" của cửa sổ Tồn kho (card 6) — thiết kế Figma "Tồn kho thành phẩm v4".
// Số do /api/stock/health tính (triệu đồng), hiển thị tỷ. Tuổi tính từ ngày nhập kho; "hàng cũ" = trên 6 tháng.
// Mỗi khối trả lời 1 câu hỏi: xu hướng (vùng chồng), dòng hàng cũ vào/ra (cột phân kỳ), phân bố tuổi (histogram),
// tồn đang ở trạng thái nào (treemap), công trình nào xử lý trước (ma trận bong bóng), theo thời gian (bản đồ nhiệt).

const ty = formatTrieuAsTy;
const pt = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
const ngay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const thang = (iso: string) => `T${Number(iso.slice(5, 7))}`;
const dau = (x: number) => (x >= 0 ? '+' : '−');
const so1 = (x: number) => x.toFixed(1);
/** Tên công trình gọn: bỏ hậu tố "_CTxx-xxx", tiền tố chung, viết hoa chữ đầu mỗi từ */
const tenNgan = (s: string) => {
  const g = s.replace(/[_\s]*CT\d{2}-\d{3}.*$/i, '').replace(/^(DỰ ÁN|KHU|KHỐI|KDL)\s+/i, '').replace(/_/g, ' · ').trim() || s;
  return g.toLowerCase().replace(/(^|[\s(.\-–])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
};
const MAU = { sun: '#ea580c', khac: '#cbd5e1', kpsa: '#e2e8f0', cu: '#dc2626', moi: '#93c5fd', xanh: '#059669', cam: '#d97706' };
/** Màu theo tỷ lệ hàng cũ 0–1: nhạt → đỏ đậm */
const mauCu = (p: number) => {
  if (p <= 0) return '#f8fafc';
  const tron = (a: number[], b: number[], t: number) => `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(',')})`;
  return p < 0.5 ? tron([254, 226, 226], [248, 113, 113], p / 0.5) : tron([248, 113, 113], [153, 27, 27], (p - 0.5) / 0.5);
};

const NHOM: Record<StockNhom, { ten: string; ai: string }> = {
  chuaDongBo: { ten: 'HEX chưa nhập kho đồng bộ', ai: 'PC · Xưởng: làm nốt phần còn thiếu' },
  motPhan: { ten: 'HEX đồng bộ, đã xuất một phần', ai: 'Kinh doanh theo dõi tiến độ giao' },
  khongXuat: { ten: 'Mã công trình không xuất kho ≥ 60 ngày', ai: 'GĐ vận hành · Kinh doanh' },
  chuaXuat: { ten: 'HEX đồng bộ, chưa xuất lần nào', ai: 'Kinh doanh · Kho' },
  khongPsa: { ten: 'Không có HEX / PSA', ai: 'Kinh doanh' },
  huy: { ten: 'Đơn HUỶ', ai: 'Kinh doanh' },
  daXuat: { ten: 'Ghi "ĐÃ XUẤT" nhưng còn trong tồn', ai: 'Kho · Kế toán' },
};
const BIN: { b: number | null; nhan: string }[] = [
  ...Array.from({ length: 13 }, (_, i) => ({ b: i, nhan: String(i) })),
  { b: 13, nhan: '≤18' }, { b: 19, nhan: '≤24' }, { b: 25, nhan: '>24' }, { b: null, nhan: '?' },
];

interface Props {
  date: Date | null;
  congTrinh: string[];
  xuong: string[];
  /** Bấm tên công trình => danh sách mã tồn của công trình */
  onOpenProject?: (name: string) => void;
  /** Chuyển sang tab "Theo công trình" */
  onXemTheoCongTrinh?: () => void;
}

const Card: React.FC<{ title: string; right?: React.ReactNode; children: React.ReactNode }> = ({ title, right, children }) => (
  <section className="rounded-xl border border-slate-200 bg-white p-4 sm:px-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-lg font-bold text-slate-900">{title}</h4>
      {right}
    </div>
    <div className="mt-3">{children}</div>
  </section>
);

/** Chú giải màu: [nhãn, màu, kiểu ô / chấm tròn / đường] */
const Chu: React.FC<{ items: [string, string, ('o' | 'l')?][] }> = ({ items }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-slate-700">
    {items.map(([nhan, mau, kieu]) => (
      <span key={nhan} className="flex items-center gap-1.5">
        <i className={kieu === 'l' ? 'block h-0 w-5 border-t-2 border-dashed' : `block h-3 w-3 ${kieu === 'o' ? 'rounded-full' : 'rounded-sm'}`} style={kieu === 'l' ? { borderColor: mau } : { background: mau }} />
        {nhan}
      </span>
    ))}
  </div>
);

const Kpi: React.FC<{ nhan: string; so: string; dv: string; mau: string; vien?: string; spark?: React.ReactNode; phu?: React.ReactNode }> = ({ nhan, so, dv, mau, vien, spark, phu }) => (
  <div className={`rounded-xl border border-slate-200 bg-white p-4 ${vien ? `border-l-4 ${vien}` : ''}`}>
    <p className="text-sm font-bold text-slate-600">{nhan}</p>
    <div className="mt-1 flex items-end justify-between gap-2">
      <p className={`whitespace-nowrap text-4xl font-extrabold tabular-nums ${mau}`}>{so} <span className="text-lg font-semibold text-slate-500">{dv}</span></p>
      {spark}
    </div>
    {phu && <p className="mt-1.5 text-sm font-bold">{phu}</p>}
  </div>
);

const Spark: React.FC<{ vals: number[]; mau: string }> = ({ vals, mau }) => {
  if (vals.length < 2) return null;
  const lo = Math.min(...vals), hi = Math.max(...vals), W = 88, H = 30;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * W, H - ((v - lo) / ((hi - lo) || 1)) * H]);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={W + 4} height={H + 4} viewBox={`-2 -2 ${W + 4} ${H + 4}`} className="shrink-0">
      <polyline points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke={mau} strokeWidth={1.75} strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={3} fill={mau} />
    </svg>
  );
};

type O = { v: number };
type Box = { x: number; y: number; w: number; h: number };
/** Treemap squarified: chia box theo giá trị v (giảm dần) */
function squarify<T extends O>(items: T[], box: Box): (T & Box)[] {
  const out: (T & Box)[] = [];
  const total = items.reduce((s, i) => s + i.v, 0);
  if (total <= 0) return out;
  const k = (box.w * box.h) / total;
  let rest = items.filter(i => i.v > 0).sort((a, b) => b.v - a.v).map(i => ({ i, a: i.v * k }));
  let { x, y, w, h } = box;
  while (rest.length) {
    const ngan = Math.min(w, h);
    const te = (r: { a: number }[]) => {
      const s = r.reduce((m, q) => m + q.a, 0), mx = Math.max(...r.map(q => q.a)), mn = Math.min(...r.map(q => q.a));
      return Math.max((ngan * ngan * mx) / (s * s), (s * s) / (ngan * ngan * mn));
    };
    let n = 1;
    while (n < rest.length && te(rest.slice(0, n + 1)) <= te(rest.slice(0, n))) n++;
    const row = rest.slice(0, n), s = row.reduce((m, q) => m + q.a, 0);
    if (w >= h) {
      const rw = s / h; let yy = y;
      for (const r of row) { const rh = r.a / rw; out.push({ ...r.i, x, y: yy, w: rw, h: rh }); yy += rh; }
      x += rw; w -= rw;
    } else {
      const rh = s / w; let xx = x;
      for (const r of row) { const rw = r.a / rh; out.push({ ...r.i, x: xx, y, w: rw, h: rh }); xx += rw; }
      y += rh; h -= rh;
    }
    rest = rest.slice(n);
  }
  return out;
}

const TonKhoSucKhoe: React.FC<Props> = ({ date, congTrinh, xuong, onOpenProject, onXemTheoCongTrinh }) => {
  const [data, setData] = useState<StockHealth | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const dateISO = date ? toISODateLocal(date) : '';
  const khoaLoc = `${congTrinh.join('|')}#${xuong.join(',')}`;

  useEffect(() => {
    if (!dateISO) return;
    const ac = new AbortController();
    setDangTai(true); setLoi(null);
    fetchStockHealth(dateISO, { congTrinh, xuong, signal: ac.signal })
      .then(d => { setData(d); setDangTai(false); })
      .catch(e => { if (!ac.signal.aborted) { setLoi(String(e?.message || e)); setDangTai(false); } });
    return () => ac.abort();
    // khoaLoc thay cho 2 mảng (mảng mới mỗi lần vẽ)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateISO, khoaLoc]);

  const t = useMemo(() => {
    if (!data) return null;
    const { tong } = data;
    const byDate = new Map(data.chuoi.map(c => [c.d, c]));
    const ct = data.cuoiThang.map(d => byDate.get(d)!).filter(Boolean);
    const nam = data.date.slice(0, 4);
    const ctNam = ct.filter(c => c.d.startsWith(nam));
    const dinh = ctNam.reduce<typeof ct[number] | null>((m, c) => (!m || c.v > m.v ? c : m), null);
    const dCu = dinh ? tong.tren6 - dinh.tren6 : 0;
    const dMoi = dinh ? (tong.v - tong.tren6) - (dinh.v - dinh.tren6) : 0;
    const kh = (k: string) => data.khach.find(x => x.k === k) ?? { k, v: 0, tren6: 0, t46: 0 };
    const sun = kh('sun');
    const lon = data.congTrinh.filter(c => c.vTruoc !== null);
    const coMa = (c: typeof data.congTrinh[number]) => c.mct.some(m => /^CT\d/i.test(m));
    const moc60 = new Date(new Date(data.date).getTime() - 60 * 864e5).toISOString().slice(0, 10);
    const dungXuat = lon.filter(c => coMa(c) && c.v >= tong.v * 0.02 && (!c.xuatCuoi || c.xuatCuoi < moc60));
    const donHang = lon.filter(c => coMa(c) && c.vTruoc !== null && c.v - c.vTruoc! >= Math.max(5000, c.vTruoc! * 0.5))
      .sort((a, b) => (b.v - b.vTruoc!) - (a.v - a.vTruoc!));
    const cuTruoc = (c: typeof data.congTrinh[number]) => c.thang?.find(x => x.d === data.mocTruoc)?.tren6 ?? null;
    const cuTang = lon.filter(c => coMa(c) && c.vTruoc !== null && c.v < c.vTruoc! && cuTruoc(c) !== null && c.tren6 - cuTruoc(c)! >= 1000);
    const cuGiam = lon.filter(c => coMa(c) && pt(c.tren6, c.v) >= 50 && c.vTruoc !== null && c.v <= c.vTruoc! * 0.8 && !cuTang.includes(c));
    const nhom = (k: StockNhom) => data.nhom.find(x => x.k === k) ?? { k, v: 0, tren6: 0, ma: 0 };
    const dongCuoi = data.dongCu[data.dongCu.length - 1] ?? null;
    return { ct, ctNam, dinh, dCu, dMoi, sun, dungXuat, donHang, cuTang, cuGiam, cuTruoc, nhom, dongCuoi, soCt: data.congTrinh.filter(c => c.v > 0).length };
  }, [data]);

  if (!dateISO) return <p className="p-8 text-center text-sm text-slate-500">Chưa có ngày chốt tồn kho.</p>;
  if (loi && !data) return <p className="p-8 text-center text-sm text-red-600">Không tải được số tồn kho ({loi}).</p>;
  if (!data || !t) return <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 className="animate-spin" size={18} /> Đang tính tồn kho…</div>;

  const { tong } = data;
  const tenCt = (name: string, cls = '') => onOpenProject
    ? <button type="button" onClick={() => onOpenProject(name)} className={`text-left hover:text-blue-700 hover:underline ${cls}`}>{tenNgan(name)}</button>
    : <span className={cls}>{tenNgan(name)}</span>;
  const laDinh = t.dinh && t.dinh.d !== data.date;
  const ctDon = t.donHang[0];

  // ---- dữ liệu biểu đồ ----
  const duLieuA = t.ctNam.map(c => ({ d: c.d === data.date ? ngay(c.d) : thang(c.d), cu: c.tren6 / 1000, moi: (c.v - c.tren6) / 1000, tong: c.v / 1000, dinh: t.dinh?.d === c.d }));
  const tranA = Math.ceil(Math.max(1, ...duLieuA.map(x => x.tong)) * 1.12 / 50) * 50;
  const duLieuB = data.dongCu.slice(-8).map(x => ({ d: thang(x.d1), vao: x.vao / 1000, ra: -x.ra / 1000, rong: (x.vao - x.ra) / 1000 }));
  const duLieuD = BIN.map(b => {
    const r = (kh: string) => (data.hist.find(h => h.b === b.b && h.kh === kh)?.v ?? 0) / 1000;
    const sun = r('sun'), khac = r('khac'), kpsa = r('kpsa');
    return { nhan: b.nhan, sun, khac, kpsa, tong: sun + khac + kpsa };
  });
  const oTree = squarify(data.nhom.map(n => ({ ...n })), { x: 0, y: 0, w: 1000, h: 300 });
  const nguongX = Math.max(5, Math.round(tong.v * 0.05 / 1000));
  const diem = data.congTrinh.filter(c => c.vTruoc !== null && c.v > 0 && c.mct.some(m => /^CT\d/i.test(m))).slice(0, 13).map(c => {
    const ch = c.vTruoc ? (c.v - c.vTruoc) / c.vTruoc : 0;
    const tn = tenNgan(c.name);
    return { ten: tn.length > 18 ? tn.slice(0, 17) + '…' : tn, name: c.name, x: c.v / 1000, y: pt(c.tren6, c.v), r: 4 + Math.sqrt(c.v / 1000) * 1.8, mau: ch > 0.1 ? MAU.cam : ch < -0.1 ? MAU.xanh : '#94a3b8', ch, nhan: 'R' as 'L' | 'R' | 'T' | 'B' | '' };
  });
  // Nhãn bong bóng: điểm sát đáy (≈ 0% cũ) xếp theo tồn, xen kẽ trên / dưới cho đỡ chồng; điểm ở mép phải để nhãn bên trái
  const xMax = Math.max(1, ...diem.map(d => d.x));
  // điểm nhỏ sát đáy: bỏ nhãn (xem khi rê chuột)
  diem.filter(d => d.y < 8).sort((a, b) => a.x - b.x).forEach((d, i) => { d.nhan = d.x < nguongX ? '' : i % 2 ? 'B' : 'T'; });
  diem.filter(d => d.y >= 8 && d.x > xMax * 0.7).forEach(d => { d.nhan = 'L'; });
  const nhiet = data.congTrinh.filter(c => c.thang).slice(0, 10);
  const ngayNhiet = nhiet[0]?.thang?.map(x => x.d) ?? [];

  // ---- việc cần làm (theo quy tắc trên số) ----
  type Viec = { mau: string; ten: React.ReactNode; tyV: number; lam: string; ai: string };
  const viec: Viec[] = [];
  for (const c of t.dungXuat.slice(0, 3)) viec.push({ mau: '#dc2626', ten: tenCt(c.name), tyV: c.v, lam: `Không xuất từ ${c.xuatCuoi ? ngay(c.xuatCuoi) : 'đầu năm'} — chốt lịch nhận hàng`, ai: 'GĐ · KD' });
  for (const c of t.donHang.slice(0, 3)) viec.push({ mau: '#dc2626', ten: tenCt(c.name), tyV: c.v, lam: `Dồn hàng ${ty(c.vTruoc!)} → ${ty(c.v)} — khớp nhịp SX với lịch nhận`, ai: 'GĐ · KD · PC' });
  for (const c of t.cuTang.slice(0, 3)) viec.push({ mau: '#dc2626', ten: tenCt(c.name), tyV: c.v, lam: `Hàng cũ tăng ${ty(t.cuTruoc(c)!)} → ${ty(c.tren6)} — xuất hàng cũ trước`, ai: 'KD · Kho' });
  if (t.nhom('huy').v > 0) viec.push({ mau: '#dc2626', ten: 'Hàng đơn HUỶ', tyV: t.nhom('huy').v, lam: 'Bán lại / thanh lý', ai: 'KD' });
  if (t.nhom('chuaDongBo').v > 0) viec.push({ mau: MAU.cam, ten: 'HEX chưa nhập kho đồng bộ', tyV: t.nhom('chuaDongBo').v, lam: 'Làm nốt phần còn thiếu', ai: 'PC · Xưởng' });
  for (const c of t.cuGiam.slice(0, 2)) viec.push({ mau: MAU.xanh, ten: tenCt(c.name), tyV: c.v, lam: `Hàng cũ đang giảm ${ty(c.vTruoc!)} → ${ty(c.v)} — theo dõi`, ai: 'KD' });
  if (t.nhom('daXuat').v > 0) viec.push({ mau: '#7c3aed', ten: 'Ghi "ĐÃ XUẤT" còn trong tồn', tyV: t.nhom('daXuat').v, lam: 'Đối soát SAP, ghi giảm', ai: 'Kho · Kế toán' });

  const KH: [string, string][] = [['Sun Group', MAU.sun], ['Khách khác', MAU.khac], ['Không PSA', MAU.kpsa]];
  const thangMau = <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">&gt; 6 tháng {[0, 25, 50, 75, 100].map(p => <span key={p} className="flex flex-col items-center"><i className="block h-3 w-7 rounded-sm" style={{ background: mauCu(p / 100 || 0.02) }} />{p}%</span>)}</div>;
  const bar100 = (nhan: string, phan: { v: number; mau: string; chu?: string }[]) => {
    const s = phan.reduce((m, p) => m + p.v, 0) || 1;
    return (
      <div className="flex items-center gap-3">
        <p className="w-36 shrink-0 text-right text-sm font-bold text-slate-800">{nhan}</p>
        <div className="flex h-10 flex-1 overflow-hidden rounded-md">
          {phan.map((p, i) => p.v > 0 && (
            <div key={i} className="flex items-center px-2 text-base font-bold text-white" style={{ width: `${(p.v / s) * 100}%`, background: p.mau }}>{p.chu}</div>
          ))}
        </div>
      </div>
    );
  };
  const truc = { fontSize: 13, fill: '#475569' };
  const cuoi = data.chuoi.find(c => c.d === data.date)?.tuoiBq ?? null;
  const bqDau = t.ctNam.find(c => c.tuoiBq !== null) ?? null;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {dangTai && <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="animate-spin" size={14} /> Đang cập nhật…</p>}

      {/* ---- 4 thẻ số ---- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi nhan="Tổng tồn" so={ty(tong.v)} dv="tỷ" mau="text-slate-900" spark={<Spark vals={t.ctNam.map(c => c.v)} mau="#1d4ed8" />}
          phu={laDinh && t.dinh ? <span className={tong.v < t.dinh.v ? 'text-emerald-700' : 'text-red-600'}>{tong.v < t.dinh.v ? '▼' : '▲'} {ty(Math.abs(tong.v - t.dinh.v))} từ đỉnh {ngay(t.dinh.d)}</span> : null} />
        <Kpi nhan="Trên 6 tháng" so={ty(tong.tren6)} dv="tỷ" mau="text-red-600" vien="border-l-red-600" spark={<Spark vals={t.ctNam.map(c => c.tren6)} mau="#dc2626" />}
          phu={<span className="text-red-700">{pt(tong.tren6, tong.v).toFixed(0)}% tổng{laDinh && t.dinh ? ` · ${dau(t.dCu)}${ty(Math.abs(t.dCu))} từ ${ngay(t.dinh.d)}` : ''}</span>} />
        <Kpi nhan="Tuổi bình quân" so={cuoi === null ? '—' : so1(cuoi)} dv="tháng" mau="text-amber-700" vien="border-l-amber-500"
          spark={<Spark vals={t.ctNam.filter(c => c.tuoiBq !== null).map(c => c.tuoiBq!)} mau="#d97706" />}
          phu={bqDau ? <span className="text-amber-800">{thang(bqDau.d)}: {so1(bqDau.tuoiBq!)} tháng</span> : null} />
        <Kpi nhan="Đang dồn hàng" so={ctDon ? ty(ctDon.v) : '—'} dv={ctDon ? 'tỷ' : ''} mau="text-orange-700" vien="border-l-orange-500"
          spark={ctDon ? <Spark vals={(ctDon.thang ?? []).map(x => x.v)} mau="#ea580c" /> : null}
          phu={ctDon ? <span className="block truncate">{tenCt(ctDon.name, 'text-slate-800')} <span className="text-orange-700">×{so1(ctDon.v / ctDon.vTruoc!)}</span></span> : null} />
      </div>

      {/* ---- A · xu hướng ---- */}
      <Card title="Tồn cuối tháng (tỷ)" right={<Chu items={[['> 6 tháng', MAU.cu], ['≤ 6 tháng', MAU.moi]]} />}>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={duLieuA} margin={{ top: 30, right: 40, left: -4, bottom: 0 }}>
            <CartesianGrid stroke="#eef2f6" vertical={false} />
            <XAxis dataKey="d" tick={{ ...truc, fontWeight: 600 }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
            <YAxis domain={[0, tranA]} tick={truc} tickLine={false} axisLine={false} width={44} />
            <Tooltip formatter={(v: number, k: string) => [`${v.toFixed(2)} tỷ`, k === 'cu' ? '> 6 tháng' : '≤ 6 tháng']} />
            {t.dinh && laDinh && <ReferenceLine x={thang(t.dinh.d)} stroke="#0f172a" strokeDasharray="5 4" label={{ value: `Đỉnh ${ngay(t.dinh.d)}`, position: 'insideTopLeft', fontSize: 13, fontWeight: 700, fill: '#0f172a' }} />}
            <Area type="linear" dataKey="cu" stackId="a" stroke="#b91c1c" strokeWidth={2} fill={MAU.cu} fillOpacity={0.85} isAnimationActive={false}>
              <LabelList dataKey="cu" content={(p: any) => p.value == null ? null : (
                <text x={p.index === duLieuA.length - 1 ? p.x - 4 : p.x} y={p.value > 35 ? p.y + 18 : p.y - 8} textAnchor={p.index === duLieuA.length - 1 ? 'end' : 'middle'} fontSize={13} fontWeight={700} fill={p.value > 35 ? '#fff' : '#b91c1c'}>{so1(p.value)}</text>
              )} />
            </Area>
            <Area type="linear" dataKey="moi" stackId="a" stroke="#1d4ed8" strokeWidth={2} fill={MAU.moi} fillOpacity={0.5} isAnimationActive={false}>
              <LabelList dataKey="tong" position="top" formatter={(v: number) => so1(v)} style={{ fontSize: 13, fontWeight: 700, fill: '#1d4ed8' }} />
            </Area>
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* ---- B · dòng hàng cũ + D · phân bố tuổi ---- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Hàng cũ vào / ra mỗi tháng (tỷ)" right={<Chu items={[['Vượt mốc 6 tháng', MAU.cu], ['Xuất đi', MAU.xanh], ['Ròng', '#0f172a', 'l']]} />}>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={duLieuB} stackOffset="sign" margin={{ top: 24, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="#eef2f6" vertical={false} />
              <XAxis dataKey="d" tick={{ ...truc, fontWeight: 600 }} tickLine={false} axisLine={false} />
              <YAxis tick={truc} tickLine={false} axisLine={false} width={40} />
              <ReferenceLine y={0} stroke="#64748b" />
              <Tooltip formatter={(v: number, k: string) => [`${Math.abs(v).toFixed(2)} tỷ`, k === 'vao' ? 'Vượt mốc 6 tháng' : k === 'ra' ? 'Xuất đi' : 'Ròng']} />
              <Bar dataKey="vao" stackId="x" fill={MAU.cu} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                <LabelList dataKey="vao" position="top" formatter={(v: number) => `+${so1(v)}`} style={{ fontSize: 13, fontWeight: 700, fill: '#dc2626' }} />
              </Bar>
              <Bar dataKey="ra" stackId="x" fill={MAU.xanh} radius={[0, 0, 3, 3]} isAnimationActive={false}>
                <LabelList dataKey="ra" content={(p: any) => (p.value == null || p.value > -0.05 ? null : (
                  <text x={p.x + p.width / 2} y={Math.max(p.y, p.y + p.height) + 15} textAnchor="middle" fontSize={13} fontWeight={700} fill="#059669">−{so1(-p.value)}</text>
                ))} />
              </Bar>
              <Line type="linear" dataKey="rong" stroke="#0f172a" strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 3, fill: '#0f172a' }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Tuổi tồn (tháng) · tỷ" right={<Chu items={KH} />}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={duLieuD} margin={{ top: 24, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="#eef2f6" vertical={false} />
              <ReferenceArea x1="7" x2="?" fill="#fef2f2" fillOpacity={1} label={{ value: '> 6 tháng', position: 'insideTopLeft', fontSize: 13, fontWeight: 700, fill: '#dc2626' }} />
              <XAxis dataKey="nhan" tick={{ ...truc, fontSize: 12, fontWeight: 600 }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} interval={0} />
              <YAxis tick={truc} tickLine={false} axisLine={false} width={40} />
              <Tooltip formatter={(v: number, k: string) => [`${v.toFixed(2)} tỷ`, k === 'sun' ? 'Sun Group' : k === 'khac' ? 'Khách khác' : 'Không PSA']} labelFormatter={l => `${l} tháng`} />
              <Bar dataKey="sun" stackId="h" fill={MAU.sun} isAnimationActive={false} />
              <Bar dataKey="khac" stackId="h" fill={MAU.khac} isAnimationActive={false} />
              <Bar dataKey="kpsa" stackId="h" fill={MAU.kpsa} isAnimationActive={false}>
                <LabelList dataKey="tong" position="top" formatter={(v: number) => (v >= tong.v / 1000 * 0.03 ? so1(v) : '')} style={{ fontSize: 12, fontWeight: 700, fill: '#334155' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* ---- C · treemap trạng thái ---- */}
      <Card title="Trạng thái tồn (tỷ)" right={thangMau}>
        <div className="relative h-[300px] w-full">
          {oTree.map(o => {
            const p = o.v ? o.tren6 / o.v : 0, dam = p >= 0.5, info = NHOM[o.k];
            const lon = o.w >= 150 && o.h >= 100, vua = o.w >= 70 && o.h >= 50;
            return (
              <div key={o.k} title={`${info.ten}: ${ty(o.v)} tỷ · > 6 tháng ${(p * 100).toFixed(0)}% · ${info.ai}`}
                className={`absolute flex flex-col overflow-hidden rounded-md border-2 border-white p-3 ${dam ? 'text-white' : 'text-slate-900'}`}
                style={{ left: `${o.x / 10}%`, top: `${(o.y / 300) * 100}%`, width: `${o.w / 10}%`, height: `${(o.h / 300) * 100}%`, background: mauCu(p) }}>
                {lon ? (<>
                  <p className="text-sm font-bold leading-tight">{info.ten}</p>
                  <p className="mt-1 text-2xl font-extrabold tabular-nums">{ty(o.v)}</p>
                  <p className="text-sm font-semibold">{(p * 100).toFixed(0)}% &gt; 6 tháng</p>
                </>) : vua ? (<>
                  <p className="text-xs font-bold leading-tight">{info.ten}</p>
                  <p className="text-base font-extrabold tabular-nums">{ty(o.v)}</p>
                </>) : <p className="text-xs font-bold tabular-nums">{ty(o.v)}</p>}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ---- E · ma trận + F · bản đồ nhiệt ---- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Ưu tiên công trình" right={<Chu items={[['Tăng', MAU.cam, 'o'], ['Giảm', MAU.xanh, 'o'], ['Ổn định', '#94a3b8', 'o']]} />}>
          <ResponsiveContainer width="100%" height={380}>
            <ScatterChart margin={{ top: 16, right: 20, left: -4, bottom: 8 }}>
              <CartesianGrid stroke="#eef2f6" />
              <ReferenceArea x1={nguongX} y1={50} y2={105} fill="#fef2f2" fillOpacity={1} stroke="none" ifOverflow="extendDomain" label={{ value: 'LỚN & CŨ', position: 'insideBottomRight', fontSize: 13, fontWeight: 800, fill: '#dc2626' }} />
              <ReferenceArea x1={nguongX} y1={0} y2={50} fill="#fff" fillOpacity={0} stroke="none" label={{ value: 'LỚN, CÒN MỚI', position: 'insideTopRight', fontSize: 13, fontWeight: 800, fill: '#d97706' }} />
              <ReferenceLine x={nguongX} stroke="#cbd5e1" strokeDasharray="5 4" />
              <ReferenceLine y={50} stroke="#cbd5e1" strokeDasharray="5 4" />
              <XAxis type="number" dataKey="x" name="Tồn" domain={[0, (max: number) => Math.ceil(max * 1.1 / 5) * 5]} tick={truc} tickLine={false} tickFormatter={v => `${v} tỷ`} />
              <YAxis type="number" dataKey="y" name="> 6 tháng" domain={[0, 105]} ticks={[0, 25, 50, 75, 100]} tick={truc} tickLine={false} width={48} tickFormatter={v => `${v}%`} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
                const d = payload?.[0]?.payload as typeof diem[number] | undefined;
                if (!d) return null;
                return <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow"><b>{tenNgan(d.name)}</b><br />{so1(d.x)} tỷ · {d.y.toFixed(0)}% &gt; 6 tháng</div>;
              }} />
              <Scatter data={diem} isAnimationActive={false} onClick={(d: any) => onOpenProject?.(d?.name)} className={onOpenProject ? 'cursor-pointer' : ''}
                shape={(p: any) => {
                  const d = p.payload as typeof diem[number];
                  return (
                    <g>
                      <circle cx={p.cx} cy={p.cy} r={d.r} fill={d.mau} fillOpacity={0.8} stroke="#fff" strokeWidth={1.5} />
                      {d.nhan && <text x={p.cx + (d.nhan === 'L' ? -d.r - 4 : d.nhan === 'R' ? d.r + 4 : 0)} y={p.cy + (d.nhan === 'T' ? -d.r - 5 : d.nhan === 'B' ? d.r + 14 : 4)}
                        textAnchor={d.nhan === 'L' ? 'end' : d.nhan === 'R' ? 'start' : 'middle'} fontSize={12} fontWeight={700} fill="#0f172a">{d.ten}</text>}
                    </g>
                  );
                }} />
            </ScatterChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Công trình theo tháng (tỷ)" right={thangMau}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-separate border-spacing-0.5 text-sm">
              <thead><tr className="text-sm text-slate-600">
                <th className="py-1 text-left font-bold">Công trình</th>
                {ngayNhiet.map(d => <th key={d} className="py-1 font-bold">{d === data.date ? ngay(d) : thang(d)}</th>)}
                <th />
              </tr></thead>
              <tbody>
                {nhiet.map(c => (
                  <tr key={c.name}>
                    <td className="max-w-[180px] truncate py-0.5 pr-2">{tenCt(c.name, 'font-semibold text-slate-800')}</td>
                    {c.thang!.map(x => {
                      const p = x.v > 0 ? x.tren6 / x.v : 0;
                      return <td key={x.d} className={`rounded px-1 py-1.5 text-center text-sm font-bold tabular-nums ${p >= 0.5 ? 'text-white' : 'text-slate-800'}`} style={{ background: x.co ? mauCu(p) : '#f8fafc' }}>{x.co ? so1(x.v / 1000) : '–'}</td>;
                    })}
                    <td className="px-1"><Spark vals={c.thang!.map(x => x.v)} mau={c.thang![c.thang!.length - 1].v > (c.thang![c.thang!.length - 3]?.v ?? 0) ? MAU.cam : MAU.xanh} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {onXemTheoCongTrinh && <button type="button" onClick={onXemTheoCongTrinh} className="mt-2 text-sm font-semibold text-blue-700 hover:underline">Xem {t.soCt} công trình →</button>}
        </Card>
      </div>

      {/* ---- G · khách hàng + khu vực ---- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Khách hàng" right={<Chu items={KH} />}>
          <div className="space-y-4">
            {data.sunDon !== null && bar100('Đơn chưa nhập kho', [{ v: data.sunDon, mau: MAU.sun, chu: `${(data.sunDon * 100).toFixed(0)}%` }, { v: 1 - data.sunDon, mau: MAU.khac }])}
            {(['v', 'tren6'] as const).map(f => <React.Fragment key={f}>{bar100(f === 'v' ? `Tồn ${ty(tong.v)}` : `> 6 tháng ${ty(tong.tren6)}`,
              (['sun', 'khac', 'kpsa'] as const).map(k => {
                const x = data.khach.find(q => q.k === k)?.[f] ?? 0, s = f === 'v' ? tong.v : tong.tren6;
                return { v: x, mau: MAU[k], chu: k === 'sun' ? `${pt(x, s).toFixed(0)}%` : undefined };
              }))}</React.Fragment>)}
          </div>
        </Card>

        <Card title="Khu vực (tỷ)" right={<Chu items={[['≤ 6 tháng', '#cbd5e1'], ['> 6 tháng', MAU.cu]]} />}>
          {(() => {
            const kv = data.khuVuc.filter(x => x.v >= tong.v * 0.005);
            const max = Math.max(1, ...kv.map(x => x.v));
            const ten = (k: string) => k === '(LẺ)' ? 'Hàng lẻ / Showroom' : k === '(TRỐNG)' ? 'Chưa có khu vực' : k.charAt(0) + k.slice(1).toLowerCase();
            return (
              <table className="w-full text-sm"><tbody>
                {kv.map(x => {
                  const r = pt(x.tren6, x.v);
                  return (
                    <tr key={x.k}>
                      <td className="w-40 py-1.5 pr-2 text-right font-semibold text-slate-800">{ten(x.k)}</td>
                      <td className="py-1.5">
                        <div className="flex items-center gap-2">
                          <div className="flex h-5 overflow-hidden rounded" style={{ width: `${(x.v / max) * 70}%` }}>
                            <div className="h-full bg-slate-300" style={{ width: `${100 - r}%` }} />
                            <div className={`h-full ${r >= 50 ? 'bg-red-700' : 'bg-red-500'}`} style={{ width: `${r}%` }} />
                          </div>
                          <b className="text-base tabular-nums">{ty(x.v)}</b>
                        </div>
                      </td>
                      <td className={`w-16 py-1.5 text-right text-base tabular-nums ${r >= 50 ? 'font-bold text-red-700' : r >= 30 ? 'font-bold text-amber-700' : 'text-slate-500'}`}>{r.toFixed(0)}%</td>
                    </tr>
                  );
                })}
              </tbody></table>
            );
          })()}
        </Card>
      </div>

      {/* ---- việc cần làm ---- */}
      <Card title="Việc cần làm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <th className="w-6 py-2" /><th className="py-2 font-bold">Việc</th><th className="py-2 text-right font-bold">Tỷ</th>
              <th className="py-2 pl-5 font-bold">Cần làm</th><th className="py-2 pl-4 font-bold">Ai</th>
            </tr></thead>
            <tbody>
              {viec.map((x, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2.5"><i className="block h-3 w-3 rounded-full" style={{ background: x.mau }} /></td>
                  <td className="py-2.5 font-bold text-slate-800">{x.ten}</td>
                  <td className="py-2.5 text-right text-base font-extrabold tabular-nums">{ty(x.tyV)}</td>
                  <td className="py-2.5 pl-5 text-slate-700">{x.lam}</td>
                  <td className="whitespace-nowrap py-2.5 pl-4 font-semibold text-slate-600">{x.ai}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default TonKhoSucKhoe;
