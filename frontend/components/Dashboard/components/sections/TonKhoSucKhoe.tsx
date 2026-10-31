import React, { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, ComposedChart, LineChart, Line, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, LabelList, Tooltip } from 'recharts';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { fetchStockHealth, type StockHealth } from '../../../../services/dataService';
import { formatTrieuAsTy } from '../../../../utils/money';
import { toISODateLocal } from '../../utils/dateHelpers';

// Tab "Tổng quan sức khoẻ tồn kho" của cửa sổ Tồn kho (card 6): đánh giá tồn theo tuổi, KH giao, phân loại sản phẩm,
// công trình và diễn biến từng lần chốt. Số do /api/stock/health tính (triệu đồng), hiển thị tỷ.

const TUOI: { k: 'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'kr'; nhan: string; mau: string; tag?: [string, string] }[] = [
  { k: 'a1', nhan: '≤ 1 tháng', mau: '#059669', tag: ['Mới', 'bg-emerald-100 text-emerald-800'] },
  { k: 'a2', nhan: '1 – 3 tháng', mau: '#34d399' },
  { k: 'a3', nhan: '3 – 6 tháng', mau: '#fbbf24', tag: ['Theo dõi', 'bg-amber-100 text-amber-800'] },
  { k: 'a4', nhan: '6 – 12 tháng', mau: '#f87171', tag: ['Tồn lâu', 'bg-red-100 text-red-700'] },
  { k: 'a5', nhan: '> 12 tháng', mau: '#b91c1c', tag: ['Nguy cơ', 'bg-red-100 text-red-700'] },
  { k: 'kr', nhan: 'Không rõ ngày nhập', mau: '#cbd5e1' },
];
// Tình trạng KH giao coi là "chưa có kế hoạch giao"
const CHUA_KH = new Set(['TỒN', 'TỒN KHO', 'LƯU KHO', 'TỒN LƯU KHO', '(TRỐNG)']);

const ty = formatTrieuAsTy;
const pt = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
const pct = (a: number, b: number, d = 1) => `${pt(a, b).toFixed(d)}%`;
const ngay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const thangCua = (iso: string) => iso.slice(0, 7);
/** Trục tỷ: mốc tròn bước 5, chừa 1 khoảng trên/dưới cho nhãn số */
const trucTron = (vals: (number | null)[]) => {
  const v = vals.filter((x): x is number => x !== null);
  if (!v.length) return { domain: [0, 1] as [number, number], ticks: [0, 1] };
  const lo = Math.floor((Math.min(...v) - 1) / 5) * 5, hi = Math.ceil((Math.max(...v) + 1) / 5) * 5;
  const ticks: number[] = [];
  for (let x = lo; x <= hi; x += 5) ticks.push(x);
  return { domain: [lo, hi] as [number, number], ticks };
};

/** Nhãn đánh giá 1 công trình theo tỷ lệ tồn > 6 tháng và tuổi trung bình */
const danhGia = (c: StockHealth['congTrinh'][number]): [string, string] => {
  const r = pt(c.tren6, c.v);
  if (r >= 99.5) return ['Tồn lâu — đôn đốc giao', 'bg-red-100 text-red-700'];
  if (r >= 50) return ['Tồn lâu', 'bg-red-100 text-red-700'];
  if (r >= 20) return ['Theo dõi', 'bg-amber-100 text-amber-800'];
  if (c.tuoiTb !== null && c.tuoiTb <= 2) return ['Mới nhập', 'bg-emerald-100 text-emerald-800'];
  return ['Bình thường', 'bg-emerald-100 text-emerald-800'];
};

interface Props {
  date: Date | null;
  congTrinh: string[];
  xuong: string[];
  /** Bấm tên công trình => danh sách mã tồn của công trình */
  onOpenProject?: (name: string) => void;
  /** Chuyển sang tab "Theo công trình" */
  onXemTheoCongTrinh?: () => void;
}

const Card: React.FC<{ title: string; cap?: React.ReactNode; right?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ title, cap, right, className = '', children }) => (
  <section className={`rounded-xl border border-slate-200 bg-white p-4 sm:px-5 ${className}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h4 className="text-base font-bold text-slate-900">{title}</h4>
        {cap && <p className="mt-0.5 text-xs text-slate-500">{cap}</p>}
      </div>
      {right}
    </div>
    <div className="mt-2">{children}</div>
  </section>
);

const TonKhoSucKhoe: React.FC<Props> = ({ date, congTrinh, xuong, onOpenProject, onXemTheoCongTrinh }) => {
  const [data, setData] = useState<StockHealth | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const [cheDo, setCheDo] = useState<'ngay' | 'thang'>('ngay');
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
    const tong = data.tong.v;
    const g = (k: keyof StockHealth['tuoi']) => data.tuoi[k] ?? { v: 0, ma: 0 };
    const tren6 = g('a4').v + g('a5').v;
    // Cuối mỗi tháng = lần chốt cuối cùng trong tháng
    const cuoiThang: StockHealth['chuoi'] = [];
    for (const p of data.chuoi) {
      const last = cuoiThang[cuoiThang.length - 1];
      if (last && thangCua(last.d) === thangCua(p.d)) cuoiThang[cuoiThang.length - 1] = p; else cuoiThang.push(p);
    }
    const thangNay = thangCua(data.date);
    const truoc = [...cuoiThang].reverse().find(p => thangCua(p.d) < thangNay) ?? null;
    const namNay = data.date.slice(0, 4);
    const trongNam = cuoiThang.filter(p => p.d.startsWith(namNay));
    const dinh = trongNam.reduce<StockHealth['chuoi'][number] | null>((m, p) => (!m || p.v > m.v ? p : m), null);
    // Số tháng giảm (tăng) liên tiếp tính tới kỳ đang xem
    let lienTiep = 0;
    const dau = truoc && tong < truoc.v ? -1 : 1;
    for (let i = cuoiThang.length - 1; i > 0; i--) {
      const d = cuoiThang[i].v - cuoiThang[i - 1].v;
      if (Math.sign(d) === dau && d !== 0) lienTiep++; else break;
    }
    // Lần chốt trong tháng đang xem (kèm cuối tháng trước làm đầu kỳ)
    const ngayTrongKy = data.chuoi.filter(p => thangCua(p.d) === thangNay);
    const kyNgay = truoc ? [truoc, ...ngayTrongKy] : ngayTrongKy;
    const cao = kyNgay.reduce((m, p) => (p.v > m.v ? p : m), kyNgay[0]);
    const thap = kyNgay.reduce((m, p) => (p.v < m.v ? p : m), kyNgay[0]);
    const t6 = kyNgay.map(p => p.tren6).filter((x): x is number => x !== null);
    const chuaKh = data.giao.filter(x => CHUA_KH.has(x.k));
    const daXuat = data.giao.find(x => x.k === 'ĐÃ XUẤT')?.v ?? 0;
    const ctTonLau = [...data.congTrinh].sort((a, b) => b.tren6 - a.tren6).filter(c => c.tren6 > 0).slice(0, 3);
    return {
      tong, g, tren6, truoc, dinh, lienTiep, dau, cuoiThang: cuoiThang.filter(p => p.d.startsWith(namNay)), kyNgay, cao, thap,
      t6Min: t6.length ? Math.min(...t6) : null, t6Max: t6.length ? Math.max(...t6) : null,
      chuaKh: chuaKh.reduce((s, x) => s + x.v, 0), chuaKhTen: chuaKh.map(x => x.k).join(' / '), daXuat, ctTonLau,
    };
  }, [data]);

  if (!dateISO) return <p className="p-8 text-center text-sm text-slate-500">Chưa có ngày chốt tồn kho.</p>;
  if (loi && !data) return <p className="p-8 text-center text-sm text-red-600">Không tải được số tồn kho ({loi}).</p>;
  if (!data || !t) return <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 className="animate-spin" size={18} /> Đang tính tồn kho…</div>;

  const { tong, g, tren6 } = t;
  const delta = t.truoc ? tong - t.truoc.v : null;
  const tenTruoc = t.truoc ? `cuối T${Number(t.truoc.d.slice(5, 7))}` : '';
  const tren6TongCt = t.ctTonLau.reduce((s, c) => s + c.tren6, 0);
  // Nhóm chưa xác định phân loại xuống cuối
  const pl = [...data.phanLoai.filter(x => x.k), ...data.phanLoai.filter(x => !x.k)];
  const plMax = Math.max(1, ...pl.map(x => x.v));
  const top = data.congTrinh.slice(0, 8);
  const conLai = data.congTrinh.slice(8);
  const ctMax = Math.max(1, ...top.map(c => c.v));
  const plCao = pl.filter(x => x.k && x.v >= tong * 0.03).sort((a, b) => pt(b.tren6, b.v) - pt(a.tren6, a.v)).slice(0, 2);
  const plMoi = pl.filter(x => x.k && x.v >= tong * 0.03 && pt(x.tren6, x.v) < 10);
  const chuaPl = pl.find(x => !x.k);

  const duLieuNgay = t.kyNgay.map(p => ({ d: ngay(p.d), v: p.v / 1000, t6: p.tren6 === null ? null : p.tren6 / 1000 }));
  const duLieuThang = t.cuoiThang.map(p => ({
    d: p.d === data.date ? ngay(p.d) : `T${Number(p.d.slice(5, 7))}`, v: p.v / 1000, t6: p.tren6 === null ? null : p.tren6 / 1000,
    con: p.tren6 === null ? p.v / 1000 : (p.v - p.tren6) / 1000,
  }));
  const trucTong = trucTron(duLieuNgay.map(p => p.v));
  const trucT6 = trucTron(duLieuNgay.map(p => p.t6));
  const tranThang = Math.ceil(Math.max(1, ...duLieuThang.map(p => p.v)) / 50) * 50;
  const ticksThang = Array.from({ length: tranThang / 50 + 1 }, (_, i) => i * 50);
  const so1 = (v: unknown) => (typeof v === 'number' ? v.toFixed(1) : '');

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {dangTai && <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="animate-spin" size={14} /> Đang cập nhật…</p>}

      {/* ---- 4 thẻ số ---- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tổng tồn kho</p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums text-slate-900">{ty(tong)} <span className="text-base font-semibold text-slate-500">tỷ</span></p>
          <p className="mt-1 text-sm text-slate-600">{data.tong.ma.toLocaleString('en-US')} mã SAP · {data.tong.congTrinh} công trình</p>
        </div>
        <div className={`rounded-xl border border-slate-200 border-l-4 bg-white p-4 ${delta !== null && delta > 0 ? 'border-l-red-500' : 'border-l-emerald-500'}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">So với {tenTruoc || 'tháng trước'}</p>
          {delta === null ? <p className="mt-1 text-3xl font-extrabold text-slate-400">—</p> : (
            <p className={`mt-1 text-3xl font-extrabold tabular-nums ${delta > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {delta > 0 ? '▲' : '▼'} {ty(Math.abs(delta))} <span className="text-base font-semibold text-slate-500">tỷ</span>
            </p>
          )}
          <p className="mt-1 text-sm text-slate-600">
            {delta !== null && t.truoc && <b className={delta > 0 ? 'text-red-600' : 'text-emerald-600'}>{delta > 0 ? '+' : '−'}{Math.abs(pt(delta, t.truoc.v)).toFixed(1)}%</b>}
            {t.dinh && t.dinh.d !== data.date && <> · {tong < t.dinh.v ? `giảm ${ty(t.dinh.v - tong)} tỷ` : ''} từ đỉnh {ty(t.dinh.v)} ({ngay(t.dinh.d)})</>}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 border-l-4 border-l-red-600 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tồn lâu &gt; 6 tháng</p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums text-red-600">{ty(tren6)} <span className="text-base font-semibold text-slate-500">tỷ</span></p>
          <p className="mt-1 text-sm text-slate-600"><b className="text-red-600">{pt(tren6, tong).toFixed(0)}%</b> tổng tồn · trong đó &gt; 12 tháng {ty(g('a5').v)} tỷ ({g('a5').ma.toLocaleString('en-US')} mã)</p>
        </div>
        <div className="rounded-xl border border-slate-200 border-l-4 border-l-amber-500 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chưa có kế hoạch giao</p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums text-amber-700">{ty(t.chuaKh)} <span className="text-base font-semibold text-slate-500">tỷ</span></p>
          <p className="mt-1 text-sm text-slate-600">{t.chuaKhTen || '—'}{t.daXuat > 0 && <> · + {ty(t.daXuat)} tỷ ghi "ĐÃ XUẤT" vẫn còn tồn</>}</p>
        </div>
      </div>

      {/* ---- Đánh giá tự động ---- */}
      <div className="flex gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm leading-relaxed text-slate-800">
        <AlertTriangle className="mt-0.5 shrink-0 text-orange-600" size={18} />
        <p>
          <b className="text-orange-800">Đánh giá:</b>{' '}
          {delta !== null && <>Tồn đang {t.dau < 0 ? 'giảm' : 'tăng'}{t.lienTiep > 1 ? ` ${t.lienTiep} tháng liên tiếp` : ''}{t.dau < 0 && pt(tren6, tong) >= 30 ? ' nhưng ' : '. '}</>}
          {pt(tren6, tong) >= 30 && <><b className="text-orange-800">{pt(tren6, tong).toFixed(0)}% giá trị nằm kho &gt; 6 tháng</b>{data.tong.xuatHangTren6 > 0 && <>, trong đó <b className="text-orange-800">{ty(data.tong.xuatHangTren6)} tỷ đã có kế hoạch "XUẤT HÀNG"</b> — hàng chờ công trình nhận, không phải thiếu đầu ra</>}. </>}
          {t.ctTonLau.length > 0 && tren6 > 0 && <>
            {t.ctTonLau.length} công trình chiếm {pt(tren6TongCt, tren6).toFixed(0)}% phần tồn lâu:{' '}
            {t.ctTonLau.map((c, i) => (
              <React.Fragment key={c.name}>{i > 0 && ', '}<b className={i === 0 ? 'text-orange-800' : ''}>{c.name} ({ty(c.tren6)}{i === 0 ? ` tỷ, ${pt(c.tren6, c.v).toFixed(0)}% > 6 tháng` : ''})</b></React.Fragment>
            ))}.
          </>}
        </p>
      </div>

      {/* ---- Diễn biến ---- */}
      <Card
        title="Diễn biến tồn kho"
        cap={cheDo === 'ngay'
          ? <>Mỗi điểm = 1 lần chốt tồn · tháng {Number(data.date.slice(5, 7))} có {t.kyNgay.length - (t.truoc ? 1 : 0)} lần chốt{t.truoc && <> · đường đứt = mức {tenTruoc}</>}</>
          : <>Cột = tồn cuối tháng · phần đỏ = tồn &gt; 6 tháng · tháng thiếu cột tuổi không tô đỏ</>}
        right={
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm">
            {([['ngay', 'Theo ngày'], ['thang', 'Cuối tháng']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setCheDo(k)} className={`px-3 py-1.5 font-semibold ${cheDo === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{l}</button>
            ))}
          </div>
        }
      >
        {cheDo === 'ngay' ? (<>
          <p className="text-sm font-bold text-slate-800">Tổng tồn (tỷ)</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={duLieuNgay} margin={{ top: 22, right: 24, left: -4, bottom: 0 }}>
              <CartesianGrid stroke="#eef2f6" vertical={false} />
              <XAxis dataKey="d" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} interval={0} />
              <YAxis domain={trucTong.domain} ticks={trucTong.ticks} tickFormatter={v => Number(v).toFixed(0)} tick={{ fontSize: 12, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={44} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(2)} tỷ`, 'Tổng tồn']} />
              {t.truoc && <ReferenceLine y={t.truoc.v / 1000} stroke="#64748b" strokeDasharray="5 4" label={{ value: `${tenTruoc}: ${ty(t.truoc.v)}`, position: 'insideTopRight', fontSize: 12, fill: '#64748b' }} />}
              <Line type="linear" dataKey="v" stroke="#0f172a" strokeWidth={2.5} dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} isAnimationActive={false}>
                <LabelList dataKey="v" position="top" formatter={so1} style={{ fontSize: 13, fontWeight: 700, fill: '#334155' }} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-2 text-sm font-bold text-red-700">Trong đó tồn &gt; 6 tháng (tỷ)</p>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={duLieuNgay} margin={{ top: 20, right: 24, left: -4, bottom: 0 }}>
              <CartesianGrid stroke="#eef2f6" vertical={false} />
              <XAxis dataKey="d" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} interval={0} />
              <YAxis domain={trucT6.domain} ticks={trucT6.ticks} tickFormatter={v => Number(v).toFixed(0)} tick={{ fontSize: 12, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={44} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(2)} tỷ`, 'Tồn > 6 tháng']} />
              <Line type="linear" dataKey="t6" stroke="#dc2626" strokeWidth={2.5} dot={{ r: 3.5, fill: '#fff', strokeWidth: 2 }} connectNulls={false} isAnimationActive={false}>
                <LabelList dataKey="t6" position="top" formatter={so1} style={{ fontSize: 12, fontWeight: 700, fill: '#b91c1c' }} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap gap-x-7 gap-y-1 text-sm text-slate-700">
            {t.truoc && <span>Đầu kỳ {ngay(t.truoc.d)}: <b>{ty(t.truoc.v)}</b></span>}
            <span>Cao nhất: <b>{ty(t.cao.v)}</b> ({ngay(t.cao.d)})</span>
            <span>Thấp nhất: <b>{ty(t.thap.v)}</b> ({ngay(t.thap.d)})</span>
            <span>{ngay(data.date)}: <b>{ty(tong)}</b>{delta !== null && <b className={delta > 0 ? 'text-red-600' : 'text-emerald-600'}> {delta > 0 ? '▲' : '▼'} {ty(Math.abs(delta))} ({delta > 0 ? '+' : '−'}{Math.abs(pt(delta, t.truoc!.v)).toFixed(1)}%)</b>}</span>
            {t.t6Min !== null && t.t6Max !== null && (
              <span>Tồn &gt; 6 tháng trong kỳ: <b className="text-red-600">{ty(t.t6Min)} – {ty(t.t6Max)} tỷ</b>{t.t6Max - t.t6Min < tren6 * 0.05 ? ' (gần như đứng yên)' : ''}</span>
            )}
          </div>
          {t.kyNgay.some(p => p.tren6 === null) && (
            <p className="mt-1 text-xs text-slate-400">Đường đỏ đứt ở {t.kyNgay.filter(p => p.tren6 === null).map(p => ngay(p.d)).join(', ')}: lần chốt đó không có cột số tháng tồn.</p>
          )}
        </>) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={duLieuThang} margin={{ top: 24, right: 16, left: -4, bottom: 0 }}>
              <CartesianGrid stroke="#eef2f6" vertical={false} />
              <XAxis dataKey="d" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
              <YAxis domain={[0, tranThang]} ticks={ticksThang} tick={{ fontSize: 12, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={44} />
              <Tooltip formatter={(v: number, k: string) => [`${v.toFixed(2)} tỷ`, k === 't6' ? 'Tồn > 6 tháng' : 'Tồn ≤ 6 tháng']} />
              <Bar dataKey="t6" stackId="a" fill="#dc2626" isAnimationActive={false}>
                <LabelList dataKey="t6" position="center" formatter={so1} style={{ fontSize: 12, fontWeight: 700, fill: '#fff' }} />
              </Bar>
              <Bar dataKey="con" stackId="a" fill="#cbd5e1" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                <LabelList dataKey="v" position="top" formatter={so1} style={{ fontSize: 13, fontWeight: 700, fill: '#334155' }} />
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* ---- Tuổi tồn + phân loại sản phẩm ---- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Tuổi tồn kho" cap="Theo số tháng nằm kho (cột số tháng tồn kho)">
          <div className="my-2 flex h-8 overflow-hidden rounded-lg">
            {TUOI.map(a => <div key={a.k} style={{ width: `${pt(g(a.k).v, tong)}%`, background: a.mau }} title={`${a.nhan}: ${ty(g(a.k).v)} tỷ`} />)}
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <th className="py-2 font-semibold">Nhóm tuổi</th><th className="py-2 text-right font-semibold">Tỷ</th><th className="py-2 text-right font-semibold">Mã SAP</th><th className="py-2 text-right font-semibold">%</th><th />
            </tr></thead>
            <tbody>
              {TUOI.map(a => {
                const x = g(a.k);
                const dam = a.k === 'a4' || a.k === 'a5';
                return (
                  <tr key={a.k} className="border-b border-slate-100">
                    <td className="py-2"><i className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: a.mau }} />{a.nhan}</td>
                    <td className={`py-2 text-right tabular-nums ${dam ? 'font-bold' : ''}`}>{ty(x.v)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-500">{x.ma.toLocaleString('en-US')}</td>
                    <td className={`py-2 text-right tabular-nums ${dam ? 'font-bold' : ''}`}>{pct(x.v, tong)}</td>
                    <td className="py-2 pl-3">{a.tag && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${a.tag[1]}`}>{a.tag[0]}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-slate-600">
            Tình trạng KH giao: {data.giao.filter(x => x.v > 0).map((x, i) => (
              <React.Fragment key={x.k}>{i > 0 && ' · '}{i === 0 ? <b>{x.k} {ty(x.v)}</b> : <>{x.k} {ty(x.v)}</>}{i === 0 && ` (${pct(x.v, tong)})`}</React.Fragment>
            ))}
            {data.tong.kyGuiMa0 > 0 && <> · Ký gửi {data.tong.kyGuiMa0.toLocaleString('en-US')} mã giá trị 0</>}
          </p>
        </Card>

        <Card title="Tồn theo phân loại sản phẩm" cap="Nhóm sản phẩm theo HEX (bảng sản xuất) · xám = tồn ≤ 6 tháng, đỏ = > 6 tháng">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <th className="py-2 font-semibold">Phân loại</th><th /><th className="py-2 text-right font-semibold">Tỷ</th><th className="py-2 text-right font-semibold">Mã SAP</th><th className="py-2 text-right font-semibold">&gt; 6 tháng</th>
            </tr></thead>
            <tbody>
              {pl.map(x => {
                const r = pt(x.tren6, x.v);
                return (
                  <tr key={x.k ?? '_'} className="border-b border-slate-100">
                    <td className={`py-2 pr-2 font-bold ${x.k ? 'text-slate-800' : 'text-slate-400'}`}>{x.k ?? 'Chưa xác định'}</td>
                    <td className="w-[38%] py-2">
                      <div className="relative h-3.5">
                        <div className="absolute inset-y-0 left-0 rounded-sm bg-slate-400" style={{ width: `${(x.v / plMax) * 100}%` }} />
                        <div className="absolute inset-y-0 left-0 rounded-l-sm bg-red-600" style={{ width: `${(x.tren6 / plMax) * 100}%` }} />
                      </div>
                    </td>
                    <td className="py-2 text-right font-bold tabular-nums">{ty(x.v)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-500">{x.ma.toLocaleString('en-US')}</td>
                    <td className={`py-2 text-right tabular-nums ${r >= 50 ? 'font-bold text-red-600' : r >= 35 ? 'font-bold text-amber-700' : 'text-slate-700'}`}>{ty(x.tren6)} ({r.toFixed(0)}%)</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-slate-600">
            {plCao.length > 0 && <>Trong các nhóm lớn, {plCao.map((x, i) => <React.Fragment key={x.k}>{i > 0 && ' và '}<b className="text-red-600">{x.k}</b> ({pt(x.tren6, x.v).toFixed(0)}%)</React.Fragment>)} tồn lâu nhiều nhất. </>}
            {plMoi.length > 0 && <>{plMoi.map(x => x.k).join(', ')} gần như toàn hàng mới. </>}
            {chuaPl && chuaPl.ma > 0 && <>{chuaPl.ma.toLocaleString('en-US')} mã chưa xác định phân loại (không khớp HEX / mã SAP bên sản xuất).</>}
          </p>
        </Card>
      </div>

      {/* ---- Công trình ---- */}
      <Card title="Công trình tồn nhiều nhất" cap="Sắp theo giá trị · thanh đỏ = phần > 6 tháng · bấm tên → danh sách mã của công trình">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <th className="py-2 font-semibold">#</th><th className="py-2 font-semibold">Công trình</th><th className="py-2 text-right font-semibold">Tồn (tỷ)</th>
              <th className="py-2 pl-4 font-semibold">Cơ cấu tuổi</th><th className="py-2 text-right font-semibold">&gt; 6 tháng</th><th className="py-2 text-right font-semibold">Tuổi TB</th><th className="py-2 pl-4 font-semibold">Đánh giá</th>
            </tr></thead>
            <tbody>
              {top.map((c, i) => {
                const r = pt(c.tren6, c.v);
                const [nhan, cls] = danhGia(c);
                return (
                  <tr key={c.name} className="border-b border-slate-100">
                    <td className="py-2.5 text-slate-500">{i + 1}</td>
                    <td className="py-2.5">
                      {onOpenProject ? <button type="button" onClick={() => onOpenProject(c.name)} className="text-left font-bold text-slate-800 hover:text-blue-700 hover:underline">{c.name}</button> : <b>{c.name}</b>}
                    </td>
                    <td className="py-2.5 text-right font-bold tabular-nums">{ty(c.v)}</td>
                    <td className="py-2.5 pl-4">
                      <div className="relative h-2.5 w-44 overflow-hidden rounded bg-slate-200">
                        <div className="absolute inset-y-0 left-0 bg-slate-700" style={{ width: `${(c.v / ctMax) * 100}%` }} />
                        <div className="absolute inset-y-0 left-0 bg-red-600" style={{ width: `${(c.tren6 / ctMax) * 100}%` }} />
                      </div>
                    </td>
                    <td className={`py-2.5 text-right tabular-nums ${r >= 50 ? 'font-bold text-red-600' : r >= 20 ? 'font-bold text-amber-700' : 'text-slate-600'}`}>
                      {c.tren6 < 0.5 ? '0' : r >= 20 ? `${ty(c.tren6)} (${r.toFixed(0)}%)` : ty(c.tren6)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{c.tuoiTb === null ? '—' : `${c.tuoiTb.toFixed(1)} th`}</td>
                    <td className="py-2.5 pl-4"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${cls}`}>{nhan}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {conLai.length > 0 && (
          <p className="mt-2 text-sm text-slate-500">
            … {conLai.length} công trình khác · {ty(conLai.reduce((s, c) => s + c.v, 0))} tỷ
            {onXemTheoCongTrinh && <> — <button type="button" onClick={onXemTheoCongTrinh} className="font-semibold text-blue-700 hover:underline">xem tab "Theo công trình"</button></>}
          </p>
        )}
      </Card>
    </div>
  );
};

export default TonKhoSucKhoe;
