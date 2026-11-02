import React, { useMemo, useState } from 'react';
import { pivotM2, giaTriLoc, TRONG_M2 } from './core/bopM2';
import { Pivot, ChiTiet, Loc, khopO, tenO, TAT_CA, type ChonO } from './PivotExcel';
import type { HexInfo } from './ProjectHealthTabs';
import { fmtInt } from '../../utils/format';
import { formatTrieuAsTy } from '../../utils/money';
import { ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, LabelList, Cell } from 'recharts';

// ============================================================================
// Tab BOT — ĐÚNG 2 pivot "V. BOT - KẾ HOẠCH NHẬP KHO" của sheet 01_REPORT trong file mẫu PC:
//   1/ Kế hoạch nhập kho THÁNG: PHÂN LOẠI NHÓM SẢN PHẨM × NGÀY KHNK THÁNG, Count of HEX
//   2/ Kế hoạch nhập kho TUẦN:  PHÂN LOẠI NHÓM SẢN PHẨM × NGÀY KHNK TUẦN,  Count of HEX
//   cùng ô lọc TÌNH TRẠNG IPO (mặc định 01. ĐANG SẢN XUẤT như file).
// Nguồn: bảng sản xuất của app (hạng mục của công trình, không hủy) — ngày KH lấy nguyên cột ngay_khnk_thang /
// ngay_khnk_tuan, không bỏ KH kỳ đã đạt (khác cách tính hạn của các trang khác). Bấm số => danh sách HEX.
// ============================================================================

const MAC_DINH_IPO = '01. ĐANG SẢN XUẤT';
/** Khoá cột ngày 'YYYY-MM-DD' (để xếp đúng thứ tự thời gian) */
const khoaNgay = (d: Date | null | undefined) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';
const nhanNgay = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(k) ? `${k.slice(8)}/${k.slice(5, 7)}/${k.slice(0, 4)}` : k);
const COT_HEX: [string, (h: HexInfo) => string][] = [
  ['HEX', h => h.hex], ['TÊN HẠNG MỤC', h => h.hangMuc], ['PHÂN LOẠI NHÓM SẢN PHẨM', h => h.nhomSp ?? ''],
  ['XƯỞNG CHÍNH', h => h.area], ['BOP', h => h.stage ?? ''], ['NGÀY KHNK THÁNG', h => nhanNgay(khoaNgay(h.khnkThang))],
  ['NGÀY KHNK TUẦN', h => nhanNgay(khoaNgay(h.khnkTuan))], ['TÌNH TRẠNG IPO', h => h.ipo ?? ''],
];

export const BotKhnk = ({ items, dieuPhoiItems, onHexClick }: {
  items: HexInfo[];
  /** Nguồn của báo cáo điều phối (mọi tình trạng IPO). Thiếu => dùng items (cửa sổ 1 công trình: items đã đủ IPO) */
  dieuPhoiItems?: HexInfo[];
  onHexClick?: (hex: string) => void;
}) => {
  // Count of HEX của Excel = đếm DÒNG có HEX (1 HEX tách nhiều dòng thì đếm từng dòng) — không gộp trùng
  const hex = useMemo(() => items.filter(i => i.hex), [items]);
  // View tất cả công trình: chi tiết có thêm cột CÔNG TRÌNH
  const cot = useMemo(() => (hex.some(h => h.congTrinh) ? [['CÔNG TRÌNH', (h: HexInfo) => h.congTrinh ?? ''] as [string, (h: HexInfo) => string], ...COT_HEX] : COT_HEX), [hex]);
  const dsIpo = useMemo(() => giaTriLoc(hex, h => h.ipo ?? ''), [hex]);
  const [ipo, setIpo] = useState<string | null>(null);
  const ipoChon = ipo ?? (dsIpo.includes(MAC_DINH_IPO) ? MAC_DINH_IPO : TAT_CA);
  const loc = useMemo(() => hex.filter(h => ipoChon === TAT_CA || (h.ipo || TRONG_M2) === ipoChon), [hex, ipoChon]);

  const thangOf = (h: HexInfo) => khoaNgay(h.khnkThang);
  const tuanOf = (h: HexInfo) => khoaNgay(h.khnkTuan);
  const nspOf = (h: HexInfo) => h.nhomSp ?? '';
  const bangThang = useMemo(() => pivotM2(loc, nspOf, thangOf), [loc]);
  const bangTuan = useMemo(() => pivotM2(loc, nspOf, tuanOf), [loc]);
  const [oThang, setOThang] = useState<ChonO>(null);
  const [oTuan, setOTuan] = useState<ChonO>(null);
  const doiIpo = (v: string) => { setIpo(v); setOThang(null); setOTuan(null); };
  const tenOCot = (o: ChonO) => tenO(o && { ...o, m: o.m && nhanNgay(o.m) });
  // Điều phối: tính MỌI tình trạng IPO trừ Hủy — hạng mục làm xong chuyển "02. HOÀN THÀNH", lọc IPO sẽ mất phần đạt
  const nguonDp = useMemo(() => (dieuPhoiItems ?? items).filter(h => h.hex && !/HỦY/i.test(h.ipo ?? '')), [dieuPhoiItems, items]);

  return (
    <div className="space-y-5">
      <h3 className="text-lg font-bold text-red-600">V. BOT - KẾ HOẠCH NHẬP KHO</h3>
      <Loc nhan="TÌNH TRẠNG IPO" gia={ipoChon} ds={dsIpo} onDoi={doiIpo} />

      <section className="space-y-2">
        <h4 className="text-base font-bold text-slate-900">1/ KẾ HOẠCH NHẬP KHO <span className="text-red-600">THÁNG</span></h4>
        <Pivot cotDong="PHÂN LOẠI NHÓM SẢN PHẨM" p={bangThang} chon={oThang} onChon={setOThang} nhanCot={nhanNgay} />
        {oThang ? (
          <ChiTiet tieuDe={`Chi tiết HEX: ${tenOCot(oThang)}`} cot={cot} onDong={() => setOThang(null)} onHex={onHexClick}
            ds={loc.filter(khopO(oThang, nspOf, thangOf))} />
        ) : <p className="text-[0.6875rem] text-slate-400">Bấm vào một số trong bảng để xem danh sách HEX.</p>}
      </section>

      <section className="space-y-2">
        <h4 className="text-base font-bold text-slate-900">2/ KẾ HOẠCH NHẬP KHO <span className="text-red-600">TUẦN</span></h4>
        <Pivot cotDong="PHÂN LOẠI NHÓM SẢN PHẨM" p={bangTuan} chon={oTuan} onChon={setOTuan} nhanCot={nhanNgay} />
        {oTuan ? (
          <ChiTiet tieuDe={`Chi tiết HEX: ${tenOCot(oTuan)}`} cot={cot} onDong={() => setOTuan(null)} onHex={onHexClick}
            ds={loc.filter(khopO(oTuan, nspOf, tuanOf))} />
        ) : <p className="text-[0.6875rem] text-slate-400">Bấm vào một số trong bảng để xem danh sách HEX.</p>}
      </section>

      <DieuPhoiKeHoach loc={nguonDp} cot={cot} onHexClick={onHexClick} />
    </div>
  );
};

// ============================================================================
// 3/ Theo dõi & phân tích điều phối KH tháng → KH tuần (cùng nguồn + lọc IPO của 2 pivot trên):
//   - Thẻ: KH tháng của tháng chọn, đã chia xuống tuần, hoàn thành, trễ, dời sang tháng sau, KH tuần ngoài KH tháng
//   - a) Đối chiếu ngày KH tuần với ngày KH tháng theo nhóm sản phẩm (sớm / trễ trong tháng / dời tháng sau / chưa có tuần)
//   - b) Theo dõi từng tuần (T2–CN) của tháng: KH tuần, từ / ngoài KH tháng, đạt, trễ, chưa đến hạn, tỷ lệ đạt
// "Hoàn thành / Đạt" = đạt SL KH trong kỳ (plan-met của máy chủ) hoặc hạng mục đã nhập kho đủ.
// ============================================================================

const DAY_MS = 86_400_000;
const thangOfNgay = (d: Date | null | undefined) => (d ? khoaNgay(d).slice(0, 7) : '');
const nhanThang = (m: string) => `Tháng ${m.slice(5)}/${m.slice(0, 4)}`;
/** Thứ Hai của tuần chứa ngày d */
const thuHai = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
/** Tháng của TUẦN KH (T2–CN) = tháng chứa Thứ Năm của tuần (như tuần ISO): tuần 26/10–01/11 thuộc tháng 10 */
const thangTuanOf = (d: Date | null | undefined) => {
  if (!d) return '';
  const t2 = thuHai(d);
  return thangOfNgay(new Date(t2.getFullYear(), t2.getMonth(), t2.getDate() + 3));
};
const ddmm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
const xongThang = (h: HexInfo) => !!h.khnkThangMet || !h.open;
const xongTuan = (h: HexInfo) => !!h.khnkTuanMet || !h.open;
const giaTri = (ds: HexInfo[]) => ds.reduce((a, h) => a + (h.total || 0), 0);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Lệch ngày KH tuần so với KH tháng (cột của bảng đối chiếu; số đầu để xếp thứ tự) */
const LECH = ['1. Tuần sớm / đúng KH tháng', '2. Tuần trễ, vẫn trong tháng', '3. Tuần dời sang tháng sau', '4. Chưa có KH tuần'] as const;
const lechOf = (h: HexInfo) => {
  if (!h.khnkTuan || !h.khnkThang) return LECH[3];
  if (h.khnkTuan.getTime() <= h.khnkThang.getTime()) return LECH[0];
  return thangTuanOf(h.khnkTuan) === thangOfNgay(h.khnkThang) ? LECH[1] : LECH[2];
};
const MAU_LECH: Record<string, string> = { [LECH[0]]: 'text-emerald-700', [LECH[1]]: 'text-amber-600', [LECH[2]]: 'text-red-600', [LECH[3]]: 'text-slate-500' };

const MAU = { dat: '#10b981', tre: '#ef4444', chua: '#cbd5e1', duong: '#1e293b' };
const MAU_LECH_BD = ['#10b981', '#f59e0b', '#ef4444', '#cbd5e1'];
const truc = { fontSize: 12, fill: '#475569' };
const goiYSo = (v: unknown, ten: unknown) => [fmtInt(Number(v)), String(ten)] as [string, string];
const KhungBd = ({ tieuDe, phu, cao = 260, children }: { tieuDe: string; phu?: string; cao?: number; children: React.ReactElement }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-3">
    <div className="text-sm font-semibold text-slate-800">{tieuDe}</div>
    {phu && <div className="text-xs text-slate-500">{phu}</div>}
    <div style={{ height: cao }} className="mt-2"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
  </div>
);

const thD = 'border border-slate-300 px-3 py-2 font-bold';
const tdD = 'border border-slate-300 px-3 py-2';

const DieuPhoiKeHoach = ({ loc, cot, onHexClick }: {
  loc: HexInfo[]; cot: [string, (h: HexInfo) => string][]; onHexClick?: (hex: string) => void;
}) => {
  const homNay = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }, []);
  const dsThang = useMemo(() => [...new Set(loc.flatMap(h => [thangOfNgay(h.khnkThang), thangTuanOf(h.khnkTuan)]).filter(Boolean))].sort(), [loc]);
  // Mặc định: tháng hiện tại nếu đã có KH tháng, không thì tháng gần nhất (≤ hiện tại) có KH tháng
  const coKhThang = useMemo(() => [...new Set(loc.map(h => thangOfNgay(h.khnkThang)).filter(Boolean))].sort(), [loc]);
  const thangNay = khoaNgay(new Date(homNay)).slice(0, 7);
  const [thang, setThang] = useState<string | null>(null);
  const thangChon = thang && dsThang.includes(thang) ? thang
    : [...coKhThang].reverse().find(m => m <= thangNay) ?? coKhThang[0] ?? dsThang[dsThang.length - 1] ?? '';
  const [xem, setXem] = useState<{ ten: string; ds: HexInfo[] } | null>(null);
  const [oLech, setOLech] = useState<ChonO>(null);
  // Xu hướng: mỗi tháng có KH tháng (tối đa 12 tháng gần nhất) — hoàn thành / trễ / chưa đến hạn + % hoàn thành
  const xuHuong = useMemo(() => coKhThang.slice(-12).map(m => {
    const ds = loc.filter(h => thangOfNgay(h.khnkThang) === m);
    const dat = ds.filter(xongThang);
    const tre = ds.filter(h => !xongThang(h) && h.khnkThang!.getTime() < homNay);
    const chua = ds.filter(h => !xongThang(h) && h.khnkThang!.getTime() >= homNay);
    return { m, nhan: `T${m.slice(5)}/${m.slice(2, 4)}`, ds, datL: dat, treL: tre, chuaL: chua, dat: dat.length, tre: tre.length, chua: chua.length, pct: pct(dat.length, ds.length) };
  }), [coKhThang, loc, homNay]);
  const mo = (ten: string, ds: HexInfo[]) => { setOLech(null); setXem(x => (x?.ten === ten ? null : { ten, ds })); };
  const doiThang = (v: string) => { setThang(v); setXem(null); setOLech(null); };

  const s = useMemo(() => {
    const khThang = loc.filter(h => thangOfNgay(h.khnkThang) === thangChon);
    const khTuan = loc.filter(h => thangTuanOf(h.khnkTuan) === thangChon);
    // Tuần (T2–CN) thuộc tháng chọn
    const theoTuan = new Map<number, HexInfo[]>();
    for (const h of khTuan) {
      const k = thuHai(h.khnkTuan!).getTime();
      theoTuan.set(k, [...(theoTuan.get(k) ?? []), h]);
    }
    const dongTuan = [...theoTuan.entries()].sort((a, b) => a[0] - b[0]).map(([k, ds], i) => {
      const cuoi = k + 6 * DAY_MS;
      const chua = ds.filter(h => !xongTuan(h));
      return {
        k, ten: `Tuần ${i + 1} · ${ddmm(new Date(k))}–${ddmm(new Date(cuoi))}`, ds, daQua: cuoi < homNay, dangChay: k <= homNay && cuoi >= homNay,
        tuThang: ds.filter(h => thangOfNgay(h.khnkThang) === thangChon), ngoai: ds.filter(h => thangOfNgay(h.khnkThang) !== thangChon),
        dat: ds.filter(xongTuan), tre: chua.filter(h => h.khnkTuan!.getTime() < homNay), chuaDen: chua.filter(h => h.khnkTuan!.getTime() >= homNay),
      };
    });
    return {
      khThang, khTuan, dongTuan,
      coTuan: khThang.filter(h => h.khnkTuan),
      xong: khThang.filter(xongThang),
      tre: khThang.filter(h => !xongThang(h) && h.khnkThang!.getTime() < homNay),
      truot: khThang.filter(h => lechOf(h) === LECH[2]),
      ngoai: khTuan.filter(h => thangOfNgay(h.khnkThang) !== thangChon),
      lech: pivotM2(khThang, (h: HexInfo) => h.nhomSp ?? '', lechOf),
      theoNsp: giaTriLoc(khThang, (h: HexInfo) => h.nhomSp ?? '').map(nsp => {
        const ds = khThang.filter(h => (h.nhomSp || TRONG_M2) === nsp);
        const datL = ds.filter(xongThang);
        const treL = ds.filter(h => !xongThang(h) && h.khnkThang!.getTime() < homNay);
        const chuaL = ds.filter(h => !xongThang(h) && h.khnkThang!.getTime() >= homNay);
        return { nsp, datL, treL, chuaL, dat: datL.length, tre: treL.length, chua: chuaL.length, pct: pct(datL.length, ds.length) };
      }),
    };
  }, [loc, thangChon, homNay]);

  if (!dsThang.length) return null;
  const n = s.khThang.length;
  const tenThang = nhanThang(thangChon);
  const the: { ten: string; ds: HexInfo[]; phu: string; mau: string; goiY: string }[] = [
    { ten: `KH tháng ${thangChon.slice(5)}`, ds: s.khThang, phu: `${formatTrieuAsTy(giaTri(s.khThang))} tỷ`, mau: 'text-slate-900', goiY: 'Hạng mục có ngày KHNK tháng trong tháng chọn' },
    { ten: 'Đã chia xuống tuần', ds: s.coTuan, phu: `${pct(s.coTuan.length, n)}% KH tháng`, mau: 'text-sky-700', goiY: 'KH tháng đã có ngày KHNK tuần' },
    { ten: 'Hoàn thành KH tháng', ds: s.xong, phu: `${pct(s.xong.length, n)}% · ${formatTrieuAsTy(giaTri(s.xong))} tỷ`, mau: 'text-emerald-700', goiY: 'Đạt SL KH tháng trong kỳ hoặc đã nhập kho đủ' },
    { ten: 'Trễ KH tháng', ds: s.tre, phu: `${pct(s.tre.length, n)}% · ${formatTrieuAsTy(giaTri(s.tre))} tỷ`, mau: 'text-red-600', goiY: 'Đã qua ngày KHNK tháng mà chưa hoàn thành' },
    { ten: 'Dời sang tháng sau', ds: s.truot, phu: `${pct(s.truot.length, n)}% KH tháng`, mau: 'text-orange-600', goiY: 'KH tuần nằm ở tháng sau KH tháng: kế hoạch tháng bị trượt' },
    { ten: 'KH tuần ngoài KH tháng', ds: s.ngoai, phu: `${pct(s.ngoai.length, s.khTuan.length)}% KH tuần trong tháng`, mau: 'text-violet-700', goiY: 'Có KH tuần trong tháng nhưng KH tháng ở tháng khác hoặc trống (phát sinh / kéo từ tháng khác)' },
  ];
  const so = (v: HexInfo[], ten: string, cls = '') => (
    <td className={`${tdD} text-right tabular-nums ${cls}`}>
      {v.length ? (
        <button type="button" onClick={() => mo(ten, v)} title="Bấm để xem danh sách HEX"
          className={`underline decoration-dotted underline-offset-2 hover:text-blue-700 ${xem?.ten === ten ? 'font-bold text-blue-700' : ''}`}>{fmtInt(v.length)}</button>
      ) : ''}
    </td>
  );
  const gom = (f: (d: (typeof s.dongTuan)[number]) => HexInfo[]) => s.dongTuan.flatMap(f);
  const duLieuLech = s.lech.keys.map(k => ({ nsp: k, ...Object.fromEntries(LECH.map((l, i) => [`l${i}`, s.lech.rows.get(k)!.cells[l] ?? 0])) }));
  const duLieuTuan = s.dongTuan.map(d => ({
    d, nhan: `${ddmm(new Date(d.k))}–${ddmm(new Date(d.k + 6 * DAY_MS))}`,
    dat: d.dat.length, tre: d.tre.length, chua: d.chuaDen.length, pct: pct(d.dat.length, d.ds.length),
  }));
  const tongDs = gom(d => d.ds), tongDat = gom(d => d.dat);

  return (
    <section className="space-y-4 border-t border-slate-200 pt-5">
      <div className="flex flex-wrap items-center gap-3">
        <h4 className="text-base font-bold text-slate-900">3/ THEO DÕI &amp; PHÂN TÍCH <span className="text-red-600">ĐIỀU PHỐI KẾ HOẠCH THÁNG – TUẦN</span></h4>
        <div className="flex items-center text-sm">
          <span className="border border-slate-300 bg-emerald-400/80 px-4 py-2 font-bold text-slate-900">THÁNG</span>
          <select value={thangChon} onChange={e => doiThang(e.target.value)} className="border border-l-0 border-slate-300 bg-sky-50 px-3 py-2 text-slate-800">
            {dsThang.map(m => <option key={m} value={m}>{nhanThang(m)}{coKhThang.includes(m) ? '' : ' (chưa có KH tháng)'}</option>)}
          </select>
        </div>
        <span className="text-xs text-slate-500">Hôm nay {nhanNgay(khoaNgay(new Date(homNay)))} · tính mọi tình trạng IPO trừ Hủy (không theo ô lọc IPO) · tuần T2–CN tính vào tháng chứa Thứ Năm</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {the.map(t => (
          <button key={t.ten} type="button" onClick={() => t.ds.length && mo(t.ten, t.ds)} title={t.goiY}
            className={`rounded-lg border bg-white p-3 text-left transition hover:border-sky-400 hover:shadow-sm ${xem?.ten === t.ten ? 'border-sky-500 ring-1 ring-sky-300' : 'border-slate-200'}`}>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.ten}</div>
            <div className={`mt-1 text-2xl font-bold tabular-nums ${t.mau}`}>{fmtInt(t.ds.length)} <span className="text-xs font-medium text-slate-400">HEX</span></div>
            <div className="text-xs text-slate-600">{t.phu}</div>
          </button>
        ))}
      </div>

      {s.theoNsp.length > 0 && (
        <KhungBd tieuDe={`Thực hiện KH tháng theo nhóm sản phẩm · ${tenThang}`} phu="Cột: số HEX của KH tháng (hoàn thành / trễ / chưa đến hạn) · đường: % hoàn thành · bấm cột để xem danh sách" cao={280}>
          <ComposedChart data={s.theoNsp} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="nsp" tick={{ ...truc, fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} interval={0}
              angle={-30} textAnchor="end" height={56} tickFormatter={(v: string) => v.replace(/^\d+\.\s*/, '')} />
            <YAxis yAxisId="so" tick={truc} tickLine={false} axisLine={false} width={44} tickFormatter={v => fmtInt(v)} />
            <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={truc} tickLine={false} axisLine={false} width={36} tickFormatter={v => `${v}%`} />
            <Tooltip isAnimationActive={false} cursor={{ fill: '#f1f5f9' }} formatter={(v, ten) => (ten === '% hoàn thành' ? [`${v}%`, String(ten)] : goiYSo(v, ten))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {([['dat', 'Hoàn thành', MAU.dat, 'datL', 'hoàn thành'], ['tre', 'Trễ', MAU.tre, 'treL', 'trễ'], ['chua', 'Chưa đến hạn', MAU.chua, 'chuaL', 'chưa đến hạn']] as const).map(([k, ten, mau, ds, nhan]) => (
              <Bar key={k} yAxisId="so" dataKey={k} name={ten} stackId="a" fill={mau} maxBarSize={56} isAnimationActive={false} cursor="pointer"
                onClick={(_, i) => mo(`${tenThang} · ${s.theoNsp[i].nsp} · ${nhan}`, s.theoNsp[i][ds])} />
            ))}
            <Line yAxisId="pct" type="linear" dataKey="pct" name="% hoàn thành" stroke={MAU.duong} strokeWidth={2} dot={{ r: 3, fill: MAU.duong }} isAnimationActive={false}>
              <LabelList dataKey="pct" position="top" formatter={(v: unknown) => `${v}%`} style={{ fontSize: 11, fontWeight: 600, fill: MAU.duong }} />
            </Line>
          </ComposedChart>
        </KhungBd>
      )}

      {xuHuong.length > 1 && (
        <KhungBd tieuDe="Xu hướng thực hiện KH tháng qua các tháng" phu="Cột: số HEX của KH tháng (hoàn thành / trễ / chưa đến hạn) · đường: % hoàn thành · bấm cột để chọn tháng">
          <ComposedChart data={xuHuong} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="nhan" tick={truc} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
            <YAxis yAxisId="so" tick={truc} tickLine={false} axisLine={false} width={44} tickFormatter={v => fmtInt(v)} />
            <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={truc} tickLine={false} axisLine={false} width={36} tickFormatter={v => `${v}%`} />
            <Tooltip isAnimationActive={false} cursor={{ fill: '#f1f5f9' }} formatter={(v, ten) => (ten === '% hoàn thành' ? [`${v}%`, String(ten)] : goiYSo(v, ten))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {([['dat', 'Hoàn thành', MAU.dat], ['tre', 'Trễ', MAU.tre], ['chua', 'Chưa đến hạn', MAU.chua]] as const).map(([k, ten, mau]) => (
              <Bar key={k} yAxisId="so" dataKey={k} name={ten} stackId="a" fill={mau} maxBarSize={56} isAnimationActive={false} cursor="pointer"
                onClick={(_, i) => doiThang(xuHuong[i].m)}>
                {xuHuong.map(d => <Cell key={d.m} fillOpacity={d.m === thangChon ? 1 : 0.55} />)}
              </Bar>
            ))}
            <Line yAxisId="pct" type="linear" dataKey="pct" name="% hoàn thành" stroke={MAU.duong} strokeWidth={2} dot={{ r: 3, fill: MAU.duong }} isAnimationActive={false}>
              <LabelList dataKey="pct" position="top" formatter={(v: unknown) => `${v}%`} style={{ fontSize: 11, fontWeight: 600, fill: MAU.duong }} />
            </Line>
          </ComposedChart>
        </KhungBd>
      )}

      {n === 0 && <p className="text-xs text-amber-700">{tenThang} chưa có KH nhập kho tháng trong dữ liệu (chưa nạp KH tháng) — chỉ theo dõi được KH tuần.</p>}
      {n > 0 && (
        <div className="space-y-1.5">
          <div className="text-sm font-semibold text-slate-800">a) Đối chiếu ngày KH tuần với KH tháng · {tenThang}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {LECH.map(l => {
              const v = s.lech.colTot[l] ?? 0;
              return <span key={l} className={MAU_LECH[l]}>● {l.slice(3)}: <b className="tabular-nums">{fmtInt(v)}</b> ({pct(v, n)}%)</span>;
            })}
          </div>
          <KhungBd tieuDe="Cơ cấu lệch KH tuần so với KH tháng theo nhóm sản phẩm" phu="Tỷ lệ % số HEX của KH tháng · bấm đoạn màu để xem danh sách" cao={Math.max(180, s.lech.keys.length * 30 + 50)}>
            <BarChart data={duLieuLech} layout="vertical" stackOffset="expand" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
              <XAxis type="number" tick={truc} tickFormatter={v => `${Math.round(v * 100)}%`} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
              <YAxis type="category" dataKey="nsp" tick={truc} tickLine={false} axisLine={false} width={136} />
              <Tooltip isAnimationActive={false} cursor={{ fill: '#f1f5f9' }} formatter={goiYSo} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {LECH.map((l, i) => (
                <Bar key={l} dataKey={`l${i}`} name={l.slice(3)} stackId="a" fill={MAU_LECH_BD[i]} isAnimationActive={false} cursor="pointer"
                  onClick={(_, j) => { setXem(null); setOLech({ k: duLieuLech[j].nsp, m: l }); }} />
              ))}
            </BarChart>
          </KhungBd>
          <Pivot cotDong="PHÂN LOẠI NHÓM SẢN PHẨM" p={s.lech} chon={oLech} onChon={o => { setOLech(o); setXem(null); }} />
          {oLech && (
            <ChiTiet tieuDe={`Chi tiết HEX: ${tenO(oLech)}`} cot={cot} onDong={() => setOLech(null)} onHex={onHexClick}
              ds={s.khThang.filter(khopO(oLech, (h: HexInfo) => h.nhomSp ?? '', lechOf))} />
          )}
        </div>
      )}

      {s.dongTuan.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-sm font-semibold text-slate-800">b) Theo dõi thực hiện KH tuần · {tenThang}</div>
          <KhungBd tieuDe={`Tiến độ KH tuần · ${tenThang}`} phu="Cột: số HEX KH tuần (đạt / trễ / chưa đến hạn) · đường: tỷ lệ đạt · bấm cột để xem danh sách">
            <ComposedChart data={duLieuTuan} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="nhan" tick={truc} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
              <YAxis yAxisId="so" tick={truc} tickLine={false} axisLine={false} width={44} tickFormatter={v => fmtInt(v)} />
              <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={truc} tickLine={false} axisLine={false} width={36} tickFormatter={v => `${v}%`} />
              <Tooltip isAnimationActive={false} cursor={{ fill: '#f1f5f9' }} formatter={(v, ten) => (ten === 'Tỷ lệ đạt' ? [`${v}%`, String(ten)] : goiYSo(v, ten))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {([['dat', 'Đạt', MAU.dat, 'đạt'], ['tre', 'Trễ', MAU.tre, 'trễ'], ['chua', 'Chưa đến hạn', MAU.chua, 'chưa đến hạn']] as const).map(([k, ten, mau, nhan]) => (
                <Bar key={k} yAxisId="so" dataKey={k} name={ten} stackId="a" fill={mau} maxBarSize={56} isAnimationActive={false} cursor="pointer"
                  onClick={(_, i) => { const d = duLieuTuan[i].d; mo(`${d.ten} · ${nhan}`, k === 'dat' ? d.dat : k === 'tre' ? d.tre : d.chuaDen); }} />
              ))}
              <Line yAxisId="pct" type="linear" dataKey="pct" name="Tỷ lệ đạt" stroke={MAU.duong} strokeWidth={2} dot={{ r: 3, fill: MAU.duong }} isAnimationActive={false}>
                <LabelList dataKey="pct" position="top" formatter={(v: unknown) => `${v}%`} style={{ fontSize: 11, fontWeight: 600, fill: MAU.duong }} />
              </Line>
            </ComposedChart>
          </KhungBd>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-emerald-400/80 text-slate-900">
                <tr>
                  <th className={`${thD} text-left`}>TUẦN</th>
                  <th className={`${thD} text-center`}>KH TUẦN</th>
                  <th className={`${thD} text-center`} title="KH tuần của hạng mục có KH tháng thuộc tháng này">TỪ KH THÁNG</th>
                  <th className={`${thD} text-center`} title="KH tuần của hạng mục có KH tháng ở tháng khác hoặc trống">NGOÀI KH THÁNG</th>
                  <th className={`${thD} text-center`}>ĐẠT</th>
                  <th className={`${thD} text-center`}>TRỄ</th>
                  <th className={`${thD} text-center`}>CHƯA ĐẾN HẠN</th>
                  <th className={`${thD} w-48 text-center`}>TỶ LỆ ĐẠT</th>
                  <th className={`${thD} text-center`}>GIÁ TRỊ KH (TỶ)</th>
                </tr>
              </thead>
              <tbody>
                {s.dongTuan.map(d => {
                  const p = pct(d.dat.length, d.ds.length);
                  return (
                    <tr key={d.k} className={d.dangChay ? 'bg-sky-50' : ''}>
                      <td className={`${tdD} whitespace-nowrap`}>
                        {d.ten}{d.dangChay && <span className="ml-2 rounded bg-sky-600 px-1.5 py-0.5 text-[0.625rem] font-bold text-white">TUẦN NÀY</span>}
                      </td>
                      {so(d.ds, `${d.ten} · KH tuần`, 'font-semibold')}
                      {so(d.tuThang, `${d.ten} · từ KH tháng`)}
                      {so(d.ngoai, `${d.ten} · ngoài KH tháng`, 'text-violet-700')}
                      {so(d.dat, `${d.ten} · đạt`, 'text-emerald-700')}
                      {so(d.tre, `${d.ten} · trễ`, 'font-semibold text-red-600')}
                      {so(d.chuaDen, `${d.ten} · chưa đến hạn`, 'text-slate-500')}
                      <td className={tdD}>
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                            <div className={`h-full ${p >= 90 ? 'bg-emerald-500' : !d.daQua && !d.dangChay ? 'bg-sky-400' : p >= 60 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${p}%` }} />
                          </div>
                          <span className="w-10 text-right text-xs font-semibold tabular-nums">{p}%</span>
                        </div>
                      </td>
                      <td className={`${tdD} text-right tabular-nums`}>{formatTrieuAsTy(giaTri(d.ds))}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-yellow-300 font-bold text-red-600">
                <tr>
                  <td className={`${tdD} text-center`}>TỔNG</td>
                  {so(tongDs, `${tenThang} · KH tuần`)}
                  {so(gom(d => d.tuThang), `${tenThang} · từ KH tháng`)}
                  {so(gom(d => d.ngoai), `${tenThang} · ngoài KH tháng`)}
                  {so(tongDat, `${tenThang} · đạt`)}
                  {so(gom(d => d.tre), `${tenThang} · trễ`)}
                  {so(gom(d => d.chuaDen), `${tenThang} · chưa đến hạn`)}
                  <td className={`${tdD} text-right tabular-nums`}>{pct(tongDat.length, tongDs.length)}%</td>
                  <td className={`${tdD} text-right tabular-nums`}>{formatTrieuAsTy(giaTri(tongDs))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-[0.6875rem] text-slate-400">Đạt = đạt SL KH tuần trong tuần hoặc hạng mục đã nhập kho đủ · Trễ = đã qua ngày KH tuần mà chưa đạt · Bấm số để xem danh sách HEX.</p>
        </div>
      )}

      {xem && <ChiTiet tieuDe={xem.ten} cot={cot} onDong={() => setXem(null)} onHex={onHexClick} ds={xem.ds} />}
    </section>
  );
};
