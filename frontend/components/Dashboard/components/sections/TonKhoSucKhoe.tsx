import React, { useEffect, useRef, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, LineChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, ReferenceLine, ReferenceArea, LabelList, Tooltip,
} from 'recharts';
import { Loader2 } from 'lucide-react';
import { fetchStockHealth, type StockHealth } from '../../../../services/dataService';
import { formatTrieuAsTy } from '../../../../utils/money';
import { fmtInt } from '../../../../utils/format';
import { khung, soBam as GACH, table, tdB as TD_B, tdSo as SO_B, tfoot as TFOOT_B, thC as TH_B, thead as THEAD_B } from '../../../shared/bangBaoCao';
import { toISODateLocal } from '../../utils/dateHelpers';
import { bamSvg, bangKhong, chamBam, ChiTietProvider, hinhCot, So, ThanhBam, useMoChiTiet, type Bam, type MoChiTiet, type PhamViChiTiet, type YcChiTiet } from './TonKhoChiTiet';

// Tab "Tổng quan sức khoẻ" của cửa sổ Tồn kho: báo cáo Tồn kho thành phẩm v5 (docs/thiet-ke-ton-kho-v5-day-du.png).
// Số do /api/stock/health tính (triệu đồng), hiển thị tỷ. Tiêu đề từng khối là câu kết luận sinh từ số;
// thiếu số (lọc công trình, không có gói đứng yên) thì dùng tiêu đề trung tính.
// Bấm số/cột/điểm mở danh sách dòng: TonKhoChiTiet.tsx; tham số từng loại ở đầu backend/src/server/tonKhoV5ChiTiet.ts.

const ty = formatTrieuAsTy;
const pt = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
const ngay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const ngayDu = (iso: string) => `${ngay(iso)}/${iso.slice(0, 4)}`;
const so1 = (x: number) => x.toFixed(1);
const tyS = (trieu: number) => trieu / 1000;
const thangSo = (iso: string) => Number(iso.slice(5, 7));
/** Số có dấu theo giá trị đã làm tròn: không ra "−0.0" */
const coDau = (x: number, le = 1) => {
  const r = Number(x.toFixed(le));
  return `${r < 0 ? '−' : '+'}${Math.abs(r).toFixed(le)}`;
};
const soNgayGiua = (den: string, tu: string) => Math.round((Date.parse(den) - Date.parse(tu)) / 864e5);
const hoaDau = (s: string) => s.toLowerCase().replace(/(^|[\s(.\-–])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
/** Tên công trình gọn: bỏ hậu tố "_CTxx-xxx", tiền tố chung, viết hoa chữ đầu mỗi từ */
const tenNgan = (s: string) => hoaDau(s.replace(/[_\s]*CT\d{2}-\d{3}.*$/i, '').replace(/^(DỰ ÁN|KHU|KHỐI|KDL)\s+/i, '').replace(/_/g, ' · ').trim() || s);

const DA_KHAC = 'Khác';
const TEN_GON: Record<string, string> = {
  'Trục Đông Tây 2C': 'Trục Đông Tây', 'Holiday Inn Bà Nà': 'Holiday Inn', 'Tiến Bộ Plaza': 'Tiến Bộ',
  'Chateau de Saigon': 'Chateau', 'St.Regis + Marriott 43 ĐTM': 'St.Regis', 'Xuất khẩu (EM)': 'Xuất khẩu', 'Hàng lẻ (mã TỒN)': 'Hàng lẻ',
};
const tenGon = (da: string) => TEN_GON[da] ?? da;
const hoaDauCau = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const tenNho = (da: string) => tenGon(da).replace(/ View$/, '');
const tenDong = (da: string) => (da === DA_KHAC ? 'Các dự án khác' : da);
const tatTen = (pm: string) => {
  const p = hoaDau(pm).split(/\s+/).filter(Boolean);
  return p.length < 2 ? hoaDau(pm) : `${p.slice(0, -1).map(x => `${x[0]}.`).join('')} ${p[p.length - 1]}`;
};
/** PM của dự án: bỏ biến thể tên (TRẦN GIANG NAM / GIANG NAM); 2 người thì viết tắt */
const tenPm = (pm: string[], da: string) => {
  if (!pm.length) return '—';
  if (da === DA_KHAC) return 'Nhiều PM';
  const ds = pm.filter(p => !pm.some(q => q.length > p.length && q.endsWith(` ${p}`)));
  return ds.length === 1 ? hoaDau(ds[0]) : ds.map(tatTen).join(', ');
};

const MAU = {
  cu: '#b91c1c', con: '#fb923c', moi: '#93c5fd', xam: '#cbd5e1', xanh: '#059669', cam: '#d97706', tim: '#7c3aed',
  timNhat: '#ddd6fe', vang: '#fde68a', lam: '#bfdbfe', xanhNhat: '#6ee7b7', duong: '#1d4ed8', do: '#dc2626', giaoThieu: '#94a3b8',
};
const MAU_DU_AN: Record<string, string> = {
  'Nam Phương': '#b91c1c', 'Holiday Inn Bà Nà': '#ea580c', 'Mini Hotel': '#d97706', 'Tây Hồ View': '#0e7490',
  'Trục Đông Tây 2C': '#1d4ed8', 'St.Regis + Marriott 43 ĐTM': '#7c3aed', 'Chateau de Saigon': '#059669', [DA_KHAC]: '#cbd5e1',
};
const MAU_DU_PHONG = ['#be185d', '#4d7c0f', '#0369a1', '#a16207', '#6d28d9', '#475569'];
const MAU_PHAN_CHIA: Record<string, string> = { chuaXuat: MAU.cam, giaoDo: MAU.moi, ganXong: MAU.xanhNhat, theoNhip: '#a7f3d0', huy: MAU.tim, khongPsa: MAU.xam };
const CHU_TRUC = { fontSize: 13, fill: '#475569' };
// Bảng trong báo cáo: cùng mẫu bảng tab BOT (BangCayBot)
const KHUNG_B = `max-h-[70vh] ${khung}`;
const BANG_B = `min-w-[960px] ${table}`;

type ThemBam = Pick<Bam, 'ghi' | 'sapDau'>;
/** Bam của 1 số; bằng 0 thì không bấm. v theo tỷ */
const neu = (v: number | null | undefined, yc: YcChiTiet, nhan: string, them?: ThemBam): Bam | null => (bangKhong(v) ? null : { yc, nhan, ...them });
/** Như neu, v là triệu đồng */
const neuTr = (trieu: number | null | undefined, yc: YcChiTiet, nhan: string, them?: ThemBam) => neu(trieu === null || trieu === undefined ? null : tyS(trieu), yc, nhan, them);
/** % suy ra: mở danh sách tử số, cửa sổ ghi lại % và mẫu số */
const ghiPt = (a: number, b: number, ten: string): ThemBam => ({ ghi: `${so1(pt(a, b))}% của ${ten} ${ty(b)}` });
/** Ngày xuất cuối: mở các dòng xuất TÍNH, mới nhất lên đầu */
const bamCuoi = (yc: YcChiTiet, nhan: string): Bam => ({ yc, nhan, sapDau: { k: 'd', giam: true } });
const thangVn = (t: string) => `${t.slice(5, 7)}/${t.slice(0, 4)}`;

/** Trục từ 0: vạch tròn số, chừa khoảng trên đầu cho nhãn */
const trucTu0 = (max: number) => {
  const top = (max || 1) * 1.14, tho = (max || 1) / 3, mu = 10 ** Math.floor(Math.log10(tho));
  const buoc = [1, 2, 2.5, 5, 10].find(s => s * mu >= tho)! * mu;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += buoc) ticks.push(v);
  return { domain: [0, top] as [number, number], ticks };
};
/** Trục không từ 0: bao min–max, vạch tròn số */
const trucGon = (vals: number[]) => {
  const lo = Math.min(...vals), hi = Math.max(...vals), r = (hi - lo) || 1, tho = r * 1.5 / 2, mu = 10 ** Math.floor(Math.log10(tho));
  const buoc = [1, 2, 5, 10].find(s => s * mu >= tho)! * mu;
  const a = Math.floor((lo - r * 0.2) / buoc) * buoc, b = Math.ceil((hi + r * 0.2) / buoc) * buoc;
  const ticks: number[] = [];
  for (let v = a; v <= b + buoc / 2; v += buoc) ticks.push(Number(v.toFixed(6)));
  return { domain: [a, b] as [number, number], ticks };
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
type MoCt = (name: string) => void;

const Card: React.FC<{ title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, right, children, className = '' }) => (
  <section className={`min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:px-5 ${className}`}>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h4 className="text-lg font-bold text-slate-900">{title}</h4>
      {right}
    </div>
    <div className="mt-3">{children}</div>
  </section>
);

/** Số trong bảng: bấm được thì gạch chấm */
const SoB: React.FC<{ bam?: Bam | null; className?: string; children: React.ReactNode }> = ({ bam, className = '', children }) => (
  <So bam={bam} className={`${bam ? GACH : ''} ${className}`}>{children}</So>
);

/** Chú giải màu */
type ChuMuc = [string, string, (Bam | null)?];
const Chu: React.FC<{ items: ChuMuc[] }> = ({ items }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-slate-700">
    {items.map(([nhan, mau, bam]) => (
      <span key={nhan} className="flex items-center gap-1.5"><i className="block h-3 w-3 rounded-sm" style={{ background: mau }} /><So bam={bam}>{nhan}</So></span>
    ))}
  </div>
);

const Kpi: React.FC<{ nhan: string; so: string; mau: string; phu?: React.ReactNode; duoi?: React.ReactNode; bam?: Bam | null }> = ({ nhan, so, mau, phu, duoi, bam }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <p className="text-sm font-bold text-slate-600">{nhan}</p>
    <p className={`mt-1 whitespace-nowrap text-4xl font-extrabold tabular-nums ${mau}`}><So bam={bam}>{so}</So> {so !== '—' && <span className="text-lg font-semibold text-slate-500">tỷ</span>}</p>
    {phu && <p className="mt-1.5 text-sm font-bold">{phu}</p>}
    {duoi && <p className="mt-0.5 text-sm font-semibold text-slate-600">{duoi}</p>}
  </div>
);

/** Hàng số đặt thẳng cột biểu đồ: cột đầu = bề rộng trục Y */
const HangCot: React.FC<{ nhan: React.ReactNode; rong: number; cot: React.ReactNode[]; cls?: string; o?: string }> = ({ nhan, rong, cot, cls = '', o }) => (
  <div className={`grid tabular-nums ${o ? '' : 'items-center py-0.5 text-sm'} ${cls}`} style={{ gridTemplateColumns: `${rong}px repeat(${cot.length}, minmax(0, 1fr))` }}>
    <div className={`font-bold ${o ?? ''}`}>{nhan}</div>
    {cot.map((c, i) => <div key={i} className={`text-center ${o ?? ''}`}>{c}</div>)}
  </div>
);

/** Tên bấm được khi có công trình tương ứng */
const TenCt: React.FC<{ name?: string | null; onOpen?: MoCt; children: React.ReactNode; className?: string }> = ({ name, onOpen, children, className = '' }) => (
  name && onOpen
    ? <button type="button" title={tenNgan(name)} onClick={() => onOpen(name)} className={`text-left hover:text-blue-700 hover:underline ${className}`}>{children}</button>
    : <span className={className}>{children}</span>
);

const ChonMoc: React.FC<{ nhan: string; value: string; ds: string[]; onChange: (v: string) => void }> = ({ nhan, value, ds, onChange }) => (
  <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
    {nhan}
    <select value={value} onChange={e => onChange(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-bold text-slate-900">
      {ds.map(d => <option key={d} value={d}>{ngay(d)}</option>)}
    </select>
  </label>
);

/** Thanh chia theo tỷ lệ; chữ chỉ hiện ở phần đủ rộng */
const ThanhChia: React.FC<{ phan: { v: number; mau: string; chu?: string; goi: string; sang?: boolean; yc: YcChiTiet }[] }> = ({ phan }) => {
  const s = phan.reduce((m, p) => m + Math.max(0, p.v), 0) || 1;
  return (
    <div className="flex h-11 gap-0.5 overflow-hidden rounded-md">
      {phan.filter(p => p.v > 0).map(p => (
        <ThanhBam key={p.goi} bam={neuTr(p.v, p.yc, p.goi)} mau={p.mau} className={`flex items-center overflow-hidden whitespace-nowrap px-2 text-base font-bold not-italic ${p.sang ? 'text-white' : 'text-slate-900'}`} style={{ width: `${(p.v / s) * 100}%` }}>{p.chu}</ThanhBam>
      ))}
    </div>
  );
};

/** Chú thích biểu đồ: bỏ dòng tổng và phần bằng 0 */
const TipTy: React.FC<any> = ({ active, payload, label, nhan }) => {
  const ds = (payload ?? []).filter((p: any) => p.dataKey !== 'tong' && p.value);
  if (!active || !ds.length) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow">
      <b>{nhan ? nhan(label) : label}</b>
      {ds.map((p: any) => <div key={String(p.name)} className="flex justify-between gap-4"><span>{p.name}</span><b className="tabular-nums">{Math.abs(p.value).toFixed(2)}</b></div>)}
    </div>
  );
};
const nhanTrong = (nguong: number, mau: string) => (p: any) => (p.value == null || Math.abs(p.value) < nguong ? null : (
  <text x={p.x + p.width / 2} y={p.y + p.height / 2 + 5} textAnchor="middle" fontSize={13} fontWeight={700} fill={mau} pointerEvents="none">{so1(Math.abs(p.value))}</text>
));
/** Số tổng trên cột chồng: đường ẩn theo dataKey tong, bấm mở chi tiết cả cột */
const dongTong = (dinhDang: (v: number) => string, mo: MoChiTiet, lay: (i: number) => Bam | null) => (
  <Line dataKey="tong" stroke="none" dot={false} activeDot={false} legendType="none" isAnimationActive={false}>
    <LabelList dataKey="tong" content={(p: any) => {
      const b = lay(p.index);
      return <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize={14} fontWeight={700} fill="#0f172a" className="outline-none hover:underline focus-visible:underline" {...(b ? bamSvg(mo, b) : {})}>{dinhDang(p.value)}</text>;
    }} />
  </Line>
);

// ---- Vấn đề cần trả lời ----
const VanDe: React.FC<{ d: StockHealth; onOpen?: MoCt; coLoc: boolean }> = ({ d, onOpen, coLoc }) => {
  const { goiDung: g, doiChieu: dc } = d;
  const dong: { mau: string; ten: string; moCt?: string; so: number; yc: YcChiTiet; chung: React.ReactNode; ai: React.ReactNode }[] = [];
  if (g) {
    const da = d.goiCu.dong.find(x => x.ct === g.ct)?.duAn;
    dong.push({
      mau: MAU.do, ten: `${g.ct} ${da ? tenNho(da) : tenNgan(g.ten)} đứng yên`, moCt: g.ten, so: g.ton, yc: { loai: 'ton', ct: g.ct },
      chung: <><So bam={neuTr(g.cu, { loai: 'ton', ct: g.ct, tuoi: 'cu' }, `Hàng cũ ${g.ct}`, ghiPt(g.cu, g.ton, 'tồn'))}>{pt(g.cu, g.ton).toFixed(0)}%</So> cũ · nhập <So bam={neuTr(g.nhap, { loai: 'nhap', ct: g.ct }, `Nhập ${g.ct}`)}>{ty(g.nhap)}</So>, xuất TÍNH <So bam={neuTr(g.xuat, { loai: 'xuat_tinh', ct: g.ct }, `Xuất TÍNH ${g.ct}`)}>{ty(g.xuat)}</So> · xuất cuối <So bam={g.xuatCuoi ? bamCuoi({ loai: 'xuat_tinh', ct: g.ct }, `Xuất TÍNH ${g.ct}`) : null}>{g.xuatCuoi ? ngay(g.xuatCuoi) : '—'}</So></>,
      ai: `${g.pm ? hoaDau(g.pm) : 'PM'}: lịch nhận, lý do`,
    });
  }
  const maDu = coLoc ? [] : d.soSach.theoMa.filter(m => m.ct && m.du > 0);
  if (maDu.length) {
    const theoDa = new Map<string, { v: number; da: string | null }>();
    for (const m of maDu) { const k = tenNho(m.duAn ?? m.ten); theoDa.set(k, { v: (theoDa.get(k)?.v ?? 0) + m.du, da: m.duAn }); }
    dong.push({
      mau: MAU.do, ten: 'Nhập lớn, chưa khớp xuất + tồn', so: maDu.reduce((s, m) => s + m.du, 0), yc: { loai: 'du', lon: true },
      chung: [...theoDa].map(([k, x], i) => <React.Fragment key={k}>{i > 0 && ' · '}{k} <So bam={x.da ? neuTr(x.v, { loai: 'du', lon: true, duAn: [x.da] }, `Nhập chưa khớp ${k}`) : null}>{ty(x.v)}</So></React.Fragment>),
      ai: <>Kế hoạch + Kho: đối soát <So bam={{ yc: { loai: 'du', lon: true }, nhan: 'Nhập lớn, chưa khớp xuất + tồn' }}>{maDu.length} mã</So></>,
    });
  }
  const sap = dc.sapVuot.theoDuAn.filter(x => x.duAn !== DA_KHAC && x.gt > 0).slice(0, 2);
  if (sap.length) {
    dong.push({
      mau: MAU.cam, ten: `Sắp vượt 6 tháng, tới ${ngay(dc.sapVuot.den)}`, so: sap.reduce((s, x) => s + x.gt, 0), yc: { loai: 'sap_vuot', duAn: sap.map(x => x.duAn) },
      chung: <>{sap.map((x, i) => <React.Fragment key={x.duAn}>{i > 0 && ' · '}{tenNho(x.duAn)} <So bam={neuTr(x.gt, { loai: 'sap_vuot', duAn: [x.duAn] }, `Sắp vượt ${tenNho(x.duAn)}`)}>{ty(x.gt)}</So></React.Fragment>)} (mức trần nếu chưa xuất)</>,
      ai: `PM ${sap.map(x => tenNho(x.duAn)).join(', ')}: lịch giao`,
    });
  }
  if (dc.huy.gt > 0) {
    const dongHuy = d.goiCu.dong.find(x => x.huy);
    dong.push({
      mau: MAU.cam, ten: `Đơn huỷ${dc.huy.soGhi ? `, sổ ghi ${dc.huy.soGhi}` : ''}`, so: dc.huy.gt, yc: { loai: 'huy' },
      chung: <>{dc.huy.ct.length === 1 ? `Toàn bộ ở ${dc.huy.ct[0]}` : <So bam={{ yc: { loai: 'huy' }, nhan: 'Đơn huỷ' }}>{dc.huy.ct.length} mã</So>} · <So bam={neuTr(dc.huy.cu, { loai: 'huy', cu: true }, 'Đơn huỷ trên 6 tháng')}>{ty(dc.huy.cu)}</So> trên 6 tháng</>,
      ai: `PM ${dongHuy ? tenNho(dongHuy.duAn) : ''}: ${dc.huy.soGhi ? 'xác nhận chuyển HEX' : 'xác nhận xử lý'}`.replace('PM :', 'PM:'),
    });
  }
  if (dc.khongPsa.gt > 0) {
    const lon = dc.khongPsa.lonNhat.find(x => /^CT\d/.test(x.ct));
    dong.push({
      mau: MAU.giaoThieu, ten: 'Tồn không có đơn trong PSA', so: dc.khongPsa.gt, yc: { loai: 'khong_psa' },
      chung: <>Không gán được PM{lon && <> · {lon.ct} <So bam={neuTr(lon.v, { loai: 'khong_psa', ct: lon.ct }, `Không PSA ${lon.ct}`)}>{ty(lon.v)}</So></>}</>,
      ai: 'Cần gán người phụ trách',
    });
  }
  if (!dong.length) return null;
  return (
    <Card title="Vấn đề cần trả lời">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-sm text-slate-500">
            <th className="w-6 py-2" /><th className="py-2 font-bold">Vấn đề</th><th className="py-2 text-right font-bold">Tỷ</th>
            <th className="py-2 pl-6 font-bold">Bằng chứng</th><th className="py-2 pl-4 font-bold">Ai trả lời</th>
          </tr></thead>
          <tbody>
            {dong.map((x, i) => (
              <tr key={x.ten} className={i % 2 ? 'bg-slate-50' : ''}>
                <td className="py-2.5 pl-1"><i className="block h-3 w-3 rounded-full" style={{ background: x.mau }} /></td>
                <td className="py-2.5 font-bold text-slate-900">{x.moCt && onOpen ? <TenCt name={x.moCt} onOpen={onOpen}>{x.ten}</TenCt> : <So bam={neuTr(x.so, x.yc, x.ten)} className="text-left">{x.ten}</So>}</td>
                <td className="py-2.5 text-right text-base font-extrabold tabular-nums text-slate-900"><So bam={neuTr(x.so, x.yc, x.ten)}>{ty(x.so)}</So></td>
                <td className="py-2.5 pl-6 text-slate-600">{x.chung}</td>
                <td className="py-2.5 pl-4 font-semibold text-slate-900">{x.ai}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

// ---- Hàng cũ theo cuối tháng ----
const HangCu: React.FC<{ d: StockHealth }> = ({ d }) => {
  const mo = useMoChiTiet();
  const g = d.goiDung, RONG = 136;
  const ds = d.cuoiThang.map(c => ({ d: c.d, nhan: ngay(c.d), goi: tyS(c.cuGoi), con: tyS(c.cu - c.cuGoi), tong: tyS(c.cu) }));
  const truc = trucTu0(Math.max(...ds.map(x => x.tong), 0));
  const bo = (c: StockHealth['cuoiThang'][number]) => pt(c.cu - c.cuGoi, c.v - c.tonGoi);
  const cuoi = d.cuoiThang[d.cuoiThang.length - 1];
  const nguong = truc.domain[1] * 0.07;
  const tenGoi = g?.ct ?? '';
  // Câu so sánh chỉ có nghĩa khi gói đã có hàng cũ và ngoài gói còn tồn
  const soCu = <So bam={neuTr(d.tong.cu, { loai: 'ton', tuoi: 'cu' }, 'Trên 6 tháng')}>{ty(d.tong.cu)}</So>;
  const bamBoGoi = (c: typeof cuoi) => neuTr(c.cu - c.cuGoi, { loai: 'moc', d: c.d, cu: true, phan: 'con' }, `Hàng cũ phần còn lại ${ngay(c.d)}`, ghiPt(c.cu - c.cuGoi, c.v - c.tonGoi, 'tồn phần còn lại'));
  const tieuDe = g && g.cu > 0 && cuoi && cuoi.v > cuoi.tonGoi
    ? <>Hàng cũ {soCu} tỷ: {g.ct} đã cũ <So bam={neuTr(g.cu, { loai: 'ton', ct: g.ct, tuoi: 'cu' }, `Hàng cũ ${g.ct}`, ghiPt(g.cu, g.ton, 'tồn'))}>{pt(g.cu, g.ton).toFixed(0)}%</So>, phần còn lại vẫn <So bam={bamBoGoi(cuoi)}>{so1(bo(cuoi))}%</So></>
    : <>Hàng cũ {soCu} tỷ</>;
  return (
    <Card title={tieuDe} right={g ? <Chu items={[[tenGoi, MAU.cu], ['Phần còn lại', MAU.con]]} /> : undefined}>
      <div className="overflow-x-auto">
        <div className="min-w-[860px]">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={ds} margin={{ top: 26, right: 0, left: 0, bottom: 0 }} barCategoryGap="20%">
              <CartesianGrid stroke="#eef2f6" vertical={false} />
              <XAxis dataKey="nhan" tick={{ ...CHU_TRUC, fontWeight: 600 }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} interval={0} />
              <YAxis width={RONG} domain={truc.domain} ticks={truc.ticks} tick={CHU_TRUC} tickLine={false} axisLine={false} />
              <Tooltip content={<TipTy />} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="goi" name={tenGoi || 'Gói'} stackId="a" fill={MAU.cu} isAnimationActive={false}
                shape={hinhCot(mo, r => neu(r.goi, { loai: 'moc', d: r.d, cu: true, phan: 'goi' }, `Hàng cũ ${tenGoi} ${r.nhan}`))}>
                <LabelList dataKey="goi" content={nhanTrong(nguong, '#fff')} />
              </Bar>
              <Bar dataKey="con" name="Phần còn lại" stackId="a" fill={MAU.con} isAnimationActive={false}
                shape={hinhCot(mo, r => neu(r.con, { loai: 'moc', d: r.d, cu: true, phan: 'con' }, `Hàng cũ phần còn lại ${r.nhan}`))}>
                <LabelList content={(p: any) => (ds[p.index]?.goi > 0 ? nhanTrong(nguong, '#0f172a')(p) : null)} dataKey="con" />
              </Bar>
              {dongTong(v => v.toFixed(2), mo, i => neu(ds[i]?.tong, { loai: 'moc', d: ds[i]?.d, cu: true }, `Hàng cũ ${ds[i]?.nhan}`))}
            </ComposedChart>
          </ResponsiveContainer>
          <div className="mt-2 space-y-0.5">
            <HangCot rong={RONG} nhan={<span className="text-slate-800">% cũ</span>} cls="font-bold text-slate-900" cot={d.cuoiThang.map(c => <So bam={neuTr(c.cu, { loai: 'moc', d: c.d, cu: true }, `Hàng cũ ${ngay(c.d)}`, ghiPt(c.cu, c.v, 'tồn'))}>{so1(pt(c.cu, c.v))}%</So>)} />
            {g && <HangCot rong={RONG} nhan={`% cũ bỏ ${g.ct}`} cls="font-bold text-red-700" cot={d.cuoiThang.map(c => <So bam={bamBoGoi(c)}>{so1(bo(c))}%</So>)} />}
            <HangCot rong={RONG} nhan="Vượt mốc" cls="font-bold text-red-600" cot={d.cuoiThang.map(c => (c.vuotMoc === null ? '–' : <So bam={neuTr(c.vuotMoc, { loai: 'vuot_moc', d: c.d }, `Vượt mốc ${ngay(c.d)}`)}>{coDau(tyS(c.vuotMoc))}</So>))} />
            <HangCot rong={RONG} nhan="Ra" cls="font-bold text-emerald-700" cot={d.cuoiThang.map(c => (c.ra === null ? '–' : <So bam={neuTr(c.ra, { loai: 'ra', d: c.d }, `Hàng cũ ra ${ngay(c.d)}`)}>{coDau(-tyS(c.ra))}</So>))} />
          </div>
        </div>
      </div>
    </Card>
  );
};

// ---- Diễn biến từng lần cập nhật ----
type DiemMoc = { d: string; nhan: string; gt: number; tren: boolean };
const DuongMoc: React.FC<{ ds: DiemMoc[]; mau: string; nhan: string; rong: number; cao: number; cu?: boolean }> = ({ ds, mau, nhan, rong, cao, cu }) => {
  const mo = useMoChiTiet();
  const truc = trucGon(ds.map(x => x.gt));
  const bamDiem = (x?: DiemMoc) => (x ? neu(x.gt, { loai: 'moc', d: x.d, ...(cu ? { cu } : {}) }, `${nhan} ${x.nhan}`) : null);
  return (
    <div className="relative">
      <p className="absolute left-0 top-3 text-sm font-bold" style={{ color: mau }}>{nhan}</p>
      <ResponsiveContainer width="100%" height={cao}>
        <LineChart data={ds} margin={{ top: 8, right: 0, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="#eef2f6" vertical={false} />
          <XAxis dataKey="nhan" scale="band" hide />
          <YAxis width={rong} domain={truc.domain} ticks={truc.ticks} tick={CHU_TRUC} tickLine={false} axisLine={false} />
          <Line dataKey="gt" stroke={mau} strokeWidth={2.5} dot={chamBam(mo, x => bamDiem(x), { mau, ban: 4, vung: 11, tab: false })} activeDot={false} isAnimationActive={false}>
            <LabelList dataKey="gt" content={(p: any) => {
              const b = bamDiem(ds[p.index]);
              return <text x={p.x} y={ds[p.index]?.tren ? p.y - 10 : p.y + 20} textAnchor="middle" fontSize={13} fontWeight={700} fill={mau} className="outline-none hover:underline focus-visible:underline" {...(b ? bamSvg(mo, b) : {})}>{so1(p.value)}</text>;
            }} />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

const DienBien: React.FC<{ d: StockHealth }> = ({ d }) => {
  const [cheDo, setCheDo] = useState<'thang' | 'lan' | 'khoang'>('lan');
  const [tu, setTu] = useState('');
  const [den, setDen] = useState('');
  const RONG = 96;
  // Nhiều mốc hơn bề rộng thì cuộn ngang: luôn mở ở đầu mới nhất, không để mốc cuối bị che
  const khungCuon = useRef<HTMLDivElement>(null);
  const n = d.cuoiThang.length;
  const dauKy = n >= 2 ? d.cuoiThang[n - 2].d : d.moc[0]?.d ?? '';
  const co = (x: string) => d.moc.some(m => m.d === x);
  // Có lọc: mốc đầu kỳ có thể không có tồn, lấy lần chốt kế tiếp có tồn
  const ngayTu = co(tu) ? tu : d.moc.find(m => m.d >= dauKy)?.d ?? '';
  const ngayDen = co(den) ? den : d.date;
  const ds = cheDo === 'thang' ? d.cuoiThang.map(c => ({ d: c.d, v: c.v, cu: c.cu }))
    : cheDo === 'lan' ? d.moc.filter(m => m.d >= dauKy)
      : d.moc.filter(m => m.d >= ngayTu && m.d <= ngayDen);
  const a = ds[0], b = ds[ds.length - 1];
  useEffect(() => { const k = khungCuon.current; if (k) k.scrollLeft = k.scrollWidth; }, [ds.length, cheDo]);
  let tieuDe: React.ReactNode = 'Diễn biến tồn';
  if (a && b && ds.length >= 2) {
    const dv = tyS(b.v - a.v), dc = tyS(b.cu - a.cu);
    const ve = <>tồn {dv < 0 ? 'giảm' : 'tăng'} <So bam={neu(dv, { loai: 'so_moc', tu: a.d, den: b.d }, `Tổng tồn ± ${ngay(a.d)} → ${ngay(b.d)}`)}>{Math.abs(dv).toFixed(2)}</So> tỷ</>;
    const cu = Math.abs(dc) <= tyS(a.cu) * 0.03 ? 'hàng cũ gần như đứng yên' : <>hàng cũ {dc < 0 ? 'giảm' : 'tăng'} <So bam={neu(dc, { loai: 'so_moc', tu: a.d, den: b.d, f: 'cu' }, `Hàng cũ ± ${ngay(a.d)} → ${ngay(b.d)}`)}>{Math.abs(dc).toFixed(2)}</So></>;
    const giua = new Date((Date.parse(a.d) + Date.parse(b.d)) / 2).getUTCMonth() + 1;
    tieuDe = cheDo === 'lan' ? <>Tháng {giua}: {ve} qua {ds.length - 1} lần cập nhật, {cu}</> : <>Từ {ngay(a.d)} đến {ngay(b.d)}: {ve}, {cu}</>;
  }
  const lech = (f: 'v' | 'cu') => ds.map((m, i) => {
    if (!i) return <span className="text-slate-400">–</span>;
    const x = tyS(m[f] - ds[i - 1][f]);
    const yc: YcChiTiet = { loai: 'so_moc', tu: ds[i - 1].d, den: m.d, ...(f === 'cu' ? { f } : {}) };
    return <So bam={neu(x, yc, `${f === 'cu' ? 'Hàng cũ' : 'Tổng tồn'} ± ${ngay(ds[i - 1].d)} → ${ngay(m.d)}`)} className={Math.abs(x) >= 3 ? `font-bold ${x > 0 ? 'text-red-600' : 'text-emerald-700'}` : 'text-slate-600'}>{coDau(x)}</So>;
  });
  const diem = (f: 'v' | 'cu'): DiemMoc[] => ds.map((m, i) => {
    const truoc = ds[i - 1]?.[f], sau = ds[i + 1]?.[f];
    const tb = truoc === undefined ? sau : sau === undefined ? truoc : (truoc + sau) / 2;
    return { d: m.d, nhan: ngay(m.d), gt: tyS(m[f]), tren: tb === undefined || m[f] >= tb };
  });
  const NUT: ['thang' | 'lan' | 'khoang', string][] = [['thang', 'Cuối tháng'], ['lan', 'Từng lần chốt'], ['khoang', 'Chọn khoảng']];
  return (
    <Card title={tieuDe} right={
      <div className="flex flex-wrap items-center gap-2">
        {cheDo === 'khoang' && <>
          <ChonMoc nhan="Từ" value={ngayTu} ds={d.moc.map(m => m.d).filter(x => x <= ngayDen)} onChange={setTu} />
          <ChonMoc nhan="Đến" value={ngayDen} ds={d.moc.map(m => m.d).filter(x => x >= ngayTu)} onChange={setDen} />
        </>}
        {NUT.map(([k, nhan]) => (
          <button key={k} type="button" onClick={() => setCheDo(k)} className={`rounded-lg border px-3 py-1.5 text-sm font-bold ${cheDo === k ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{nhan}</button>
        ))}
      </div>
    }>
      {ds.length > 0 && (
        <div ref={khungCuon} className="overflow-x-auto">
          <div style={{ minWidth: RONG + ds.length * 50 }}>
            <DuongMoc ds={diem('v')} mau={MAU.duong} nhan="Tổng tồn" rong={RONG} cao={170} />
            <DuongMoc ds={diem('cu')} mau={MAU.cu} nhan="Trên 6 tháng" rong={RONG} cao={170} cu />
            <div className="mt-1">
              <HangCot rong={RONG} nhan="" cls="font-semibold text-slate-600" cot={ds.map(m => ngay(m.d))} />
              <HangCot rong={RONG} nhan={<span className="text-slate-700">Tổng tồn ±</span>} cot={lech('v')} />
              <HangCot rong={RONG} nhan={<span className="text-slate-700">Hàng cũ ±</span>} cot={lech('cu')} />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

// ---- So 2 mốc theo dự án ----
const SoHaiMoc: React.FC<{ d: StockHealth }> = ({ d }) => {
  const [chonDau, setChonDau] = useState('');
  const [chonCuoi, setChonCuoi] = useState('');
  const moc = d.duAnMoc.map(x => x.d);
  const n = d.cuoiThang.length;
  const macDinh = n >= 2 && moc.includes(d.cuoiThang[n - 2].d) ? d.cuoiThang[n - 2].d : moc[0] ?? '';
  const dau = moc.includes(chonDau) ? chonDau : macDinh;
  const cuoi = moc.includes(chonCuoi) ? chonCuoi : moc[moc.length - 1] ?? '';
  const A = d.duAnMoc.find(x => x.d === dau)?.da ?? {};
  const B = d.duAnMoc.find(x => x.d === cuoi)?.da ?? {};
  const dong = [...new Set([...Object.keys(A), ...Object.keys(B)])].map(ten => {
    const a = A[ten] ?? { v: 0, cu: 0 }, b = B[ten] ?? { v: 0, cu: 0 };
    return { ten, a: a.v, b: b.v, dv: b.v - a.v, dc: b.cu - a.cu };
  }).sort((x, y) => y.dv - x.dv);
  const max = Math.max(1, ...dong.map(x => Math.abs(x.dv)));
  const rieng = dong.filter(x => x.ten !== DA_KHAC);
  const len = rieng[0]?.dv > 0 ? rieng[0] : null;
  const xuong = rieng[rieng.length - 1]?.dv < 0 ? rieng[rieng.length - 1] : null;
  const canh = [len, xuong].flatMap(x => (x ? [x] : []));
  const tieuDe = canh.length && dau !== cuoi
    ? <>Từ {ngay(dau)} đến {ngay(cuoi)}: {canh.map((x, i) => <React.Fragment key={x.ten}>{i > 0 && ', '}{tenNho(x.ten)} <So bam={neuTr(x.dv, { loai: 'so_moc', tu: dau, den: cuoi, duAn: [x.ten] }, `${tenDong(x.ten)} thay đổi tồn`)}>{coDau(tyS(x.dv), 2)}</So> tỷ</React.Fragment>)}</>
    : 'So 2 mốc theo dự án';
  return (
    <Card title={tieuDe}>
      <div className="mb-2 flex flex-wrap items-center gap-4">
        <ChonMoc nhan="Mốc đầu" value={dau} ds={moc.filter(x => x <= cuoi)} onChange={setChonDau} />
        <ChonMoc nhan="Mốc cuối" value={cuoi} ds={moc.filter(x => x >= dau)} onChange={setChonCuoi} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead><tr className="border-b border-slate-200 text-sm text-slate-500">
            <th className="py-2 text-left font-bold">Dự án</th>
            <th className="py-2 text-right font-bold">{dau ? ngay(dau) : ''}</th>
            <th className="py-2 pl-5 text-right font-bold">{cuoi ? ngay(cuoi) : ''}</th>
            <th className="w-1/2 py-2 text-center font-bold">Thay đổi tồn</th>
            <th className="py-2 text-right font-bold">Hàng cũ ±</th>
          </tr></thead>
          <tbody>
            {dong.map(x => {
              const rong = `${(Math.abs(x.dv) / max) * 78}%`, nhan = coDau(tyS(x.dv), 2);
              const duAn = [x.ten], tenDa = tenDong(x.ten);
              const bamDoi = neuTr(x.dv, { loai: 'so_moc', tu: dau, den: cuoi, duAn }, `${tenDa} thay đổi tồn`);
              return (
                <tr key={x.ten}>
                  <td className="py-1.5 font-bold text-slate-900"><So bam={bamDoi ?? neuTr(x.b, { loai: 'moc', d: cuoi, duAn }, `${tenDa} ${ngay(cuoi)}`)} className="text-left">{tenDong(x.ten)}</So></td>
                  <td className="py-1.5 text-right tabular-nums text-slate-500"><So bam={neuTr(x.a, { loai: 'moc', d: dau, duAn }, `${tenDa} ${ngay(dau)}`)}>{ty(x.a)}</So></td>
                  <td className="py-1.5 pl-5 text-right font-bold tabular-nums text-slate-900"><So bam={neuTr(x.b, { loai: 'moc', d: cuoi, duAn }, `${tenDa} ${ngay(cuoi)}`)}>{ty(x.b)}</So></td>
                  <td className="py-1.5 pl-4">
                    <div className="grid grid-cols-2">
                      <div className="flex items-center justify-end gap-2">
                        {x.dv < 0 && <><So bam={bamDoi} className="whitespace-nowrap font-bold tabular-nums text-emerald-700">{nhan}</So><ThanhBam bam={bamDoi} tab={false} mau={MAU.xanh} className="block h-6 rounded-sm" style={{ width: rong }} /></>}
                      </div>
                      <div className="flex items-center gap-2 border-l border-slate-300">
                        {x.dv >= 0 && <><ThanhBam bam={bamDoi} tab={false} mau={MAU.do} className="block h-6 rounded-sm" style={{ width: rong }} /><So bam={bamDoi} className="whitespace-nowrap font-bold tabular-nums text-red-600">{nhan}</So></>}
                      </div>
                    </div>
                  </td>
                  <td className={`py-1.5 text-right tabular-nums ${Math.abs(x.dc) >= 2000 ? `font-bold ${x.dc > 0 ? 'text-red-600' : 'text-emerald-700'}` : 'font-semibold text-slate-600'}`}>
                    {Math.abs(x.dc) < 5 ? '0' : <So bam={neuTr(x.dc, { loai: 'so_moc', tu: dau, den: cuoi, duAn, f: 'cu' }, `${tenDa} hàng cũ ±`)}>{coDau(tyS(x.dc), 2)}</So>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

// ---- Lũy kế nhập / xuất 3 gói ----
const LuyKeGoi: React.FC<{ d: StockHealth; onOpen?: MoCt }> = ({ d, onOpen }) => {
  const mo = useMoChiTiet();
  const g = d.goiDung, ds = d.soSanhGoi;
  const moc = ds[0]?.thang ?? [];
  const buoc = Math.max(2, Math.ceil(moc.length / 7));
  const ticks = moc.filter((_, i) => i % buoc === 0 || i === moc.length - 1);
  const truc = trucTu0(Math.max(1, ...ds.flatMap(x => [...x.nhapLuyKe, ...x.xuatLuyKe].map(v => tyS(v ?? 0)))));
  const CAO = 200, phanTy = (CAO - 44) / truc.domain[1];
  const cuoiGoi = `${Number(d.date.slice(8, 10))}/${thangSo(d.date)}`;
  const nhanTruc = (t: string) => (t === moc[moc.length - 1] ? cuoiGoi : `T${Number(t.slice(5, 7))}`);
  const tieuDe = g
    ? <>{g.ct}: nhập <So bam={neuTr(g.nhap, { loai: 'nhap', ct: g.ct }, `Nhập ${g.ct}`)}>{ty(g.nhap)}</So>, xuất TÍNH <So bam={neuTr(g.xuat, { loai: 'xuat_tinh', ct: g.ct }, `Xuất TÍNH ${g.ct}`)}>{ty(g.xuat)}</So>{g.ngayKhongXuat !== null && <>, <So bam={bamCuoi({ loai: 'xuat_tinh', ct: g.ct }, `Xuất TÍNH ${g.ct}`)}>{g.ngayKhongXuat} ngày</So> không xuất</>}{ds.length > 1 ? '; gói cùng PM vẫn đi' : ''}</>
    : 'Lũy kế nhập / xuất theo gói';
  return (
    <Card title={tieuDe} right={ds.length ? <Chu items={[['Nhập lũy kế', MAU.duong], ['Xuất TÍNH lũy kế', MAU.do]]} /> : undefined}>
      {!ds.length ? <p className="py-3 text-sm font-semibold text-slate-500">Không có gói đứng yên.</p> : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {ds.map((x, i) => {
            const dong = x.thang.map((t, j) => ({ t, nhap: x.nhapLuyKe[j] === null ? null : tyS(x.nhapLuyKe[j]!), xuat: x.xuatLuyKe[j] === null ? null : tyS(x.xuatLuyKe[j]!) }));
            const cuoi = dong[dong.length - 1];
            const gan = cuoi && cuoi.nhap !== null && cuoi.xuat !== null && Math.abs(cuoi.nhap - cuoi.xuat) * phanTy < 16;
            const bamNhap = (r?: typeof dong[number]) => (r ? neu(r.nhap, { loai: 'nhap', ct: x.ct, denThang: r.t }, `Nhập lũy kế ${x.ct} tới ${thangVn(r.t)}`) : null);
            const bamXuat = (r?: typeof dong[number]) => (r ? neu(r.xuat, { loai: 'xuat_tinh', ct: x.ct, denThang: r.t }, `Xuất TÍNH lũy kế ${x.ct} tới ${thangVn(r.t)}`) : null);
            const nhanCuoi = (mau: string, tren: boolean, bam: typeof bamNhap) => (p: any) => {
              if (p.index !== dong.length - 1 || p.value == null) return null;
              const b = bam(dong[p.index]);
              return <text x={p.x + 8} y={p.y + (gan ? (tren ? -3 : 13) : 5)} fontSize={14} fontWeight={700} fill={mau} className="outline-none hover:underline focus-visible:underline" {...(b ? bamSvg(mo, b) : {})}>{so1(p.value)}</text>;
            };
            const treXuat = x.xuatCuoi ? soNgayGiua(d.date, x.xuatCuoi) : null;
            return (
              <div key={x.ct} className="min-w-0">
                <p className={`mb-1 text-base font-bold ${i === 0 ? 'text-red-700' : 'text-slate-900'}`}><TenCt name={x.ten} onOpen={onOpen}>{x.ct}</TenCt></p>
                <ResponsiveContainer width="100%" height={CAO}>
                  <LineChart data={dong} margin={{ top: 8, right: 46, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#eef2f6" vertical={false} />
                    <XAxis dataKey="t" ticks={ticks} interval={0} tickFormatter={nhanTruc} tick={{ fontSize: 12, fill: '#475569' }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
                    <YAxis width={30} domain={truc.domain} ticks={truc.ticks} tick={{ fontSize: 12, fill: '#475569' }} tickLine={false} axisLine={false} />
                    <Line dataKey="nhap" stroke={MAU.duong} strokeWidth={2.5} dot={chamBam(mo, r => bamNhap(r), { mau: MAU.duong, ban: 0, vung: 7 })} activeDot={false} isAnimationActive={false}><LabelList dataKey="nhap" content={nhanCuoi(MAU.duong, true, bamNhap)} /></Line>
                    <Line dataKey="xuat" stroke={MAU.do} strokeWidth={2.5} dot={chamBam(mo, r => bamXuat(r), { mau: MAU.do, ban: 0, vung: 7 })} activeDot={false} isAnimationActive={false}><LabelList dataKey="xuat" content={nhanCuoi(MAU.do, false, bamXuat)} /></Line>
                  </LineChart>
                </ResponsiveContainer>
                <div className="mt-2 grid grid-cols-3 gap-2 pl-2 text-sm text-slate-500">
                  <p>Tồn<So bam={neuTr(x.ton, { loai: 'ton', ct: x.ct }, `Tồn ${x.ct}`)} className="block text-lg font-bold tabular-nums text-slate-900">{ty(x.ton)}</So></p>
                  <p>Xuất 60 ngày<So bam={neuTr(x.xuat60, { loai: 'xuat_tinh', ct: x.ct, xuat60: true }, `Xuất 60 ngày ${x.ct}`)} className="block text-lg font-bold tabular-nums text-slate-900">{ty(x.xuat60)}</So></p>
                  <p>Xuất cuối<So bam={x.xuatCuoi ? bamCuoi({ loai: 'xuat_tinh', ct: x.ct }, `Xuất TÍNH ${x.ct}`) : null} className={`block text-lg font-bold tabular-nums ${treXuat !== null && treXuat > 60 ? 'text-red-700' : 'text-slate-900'}`}>{x.xuatCuoi ? ngay(x.xuatCuoi) : '—'}</So></p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {d.goiCungPm.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-100 pt-2 text-sm text-slate-600">
          {d.goiCungPm.map(x => (
            <span key={x.ct}>
              <TenCt name={x.ten} onOpen={onOpen} className="font-bold text-slate-900">{x.ct}</TenCt>
              {' tồn '}<So bam={neuTr(x.ton, { loai: 'ton', ct: x.ct }, `Tồn ${x.ct}`)}>{ty(x.ton)}</So>
              {' · xuất 60 ngày '}<So bam={neuTr(x.xuat60, { loai: 'xuat_tinh', ct: x.ct, xuat60: true }, `Xuất 60 ngày ${x.ct}`)}>{ty(x.xuat60)}</So>
              {x.xuatCuoi && <> · <So bam={bamCuoi({ loai: 'xuat_tinh', ct: x.ct }, `Xuất TÍNH ${x.ct}`)}>{ngay(x.xuatCuoi)}</So></>}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
};

// ---- Bảng dự án ----
const BangDuAn: React.FC<{ d: StockHealth; onXemTheoCongTrinh?: () => void }> = ({ d, onXemTheoCongTrinh }) => {
  const dong = [...d.duAn.filter(x => x.duAn !== DA_KHAC), ...d.duAn.filter(x => x.duAn === DA_KHAC)];
  const rieng = d.duAn.filter(x => x.duAn !== DA_KHAC);
  const max = Math.max(1, ...d.duAn.map(x => x.ton));
  const soTon = Math.min(7, rieng.length), soCu = Math.min(3, rieng.length);
  const cong = (a: typeof rieng, f: 'ton' | 'cu') => a.reduce((s, x) => s + x[f], 0);
  const dauTon = rieng.slice(0, soTon), dauCu = [...rieng].sort((a, b) => b.cu - a.cu).slice(0, soCu);
  const tieuDe = rieng.length > 3
    ? <><So bam={neuTr(cong(dauTon, 'ton'), { loai: 'ton', duAn: dauTon.map(x => x.duAn) }, `${soTon} dự án tồn lớn nhất`, ghiPt(cong(dauTon, 'ton'), d.tong.v, 'tổng tồn'))}>{soTon} dự án giữ {so1(pt(cong(dauTon, 'ton'), d.tong.v))}% tồn</So>; <So bam={neuTr(cong(dauCu, 'cu'), { loai: 'ton', tuoi: 'cu', duAn: dauCu.map(x => x.duAn) }, `${soCu} dự án giữ nhiều hàng cũ nhất`, ghiPt(cong(dauCu, 'cu'), d.tong.cu, 'hàng cũ'))}>{soCu} dự án giữ {so1(pt(cong(dauCu, 'cu'), d.tong.cu))}% hàng cũ</So></>
    : 'Theo dự án';
  return (
    <Card title={tieuDe} right={<Chu items={[['≤ 6 tháng', MAU.moi], ['> 6 tháng', MAU.cu], ['Không rõ ngày', MAU.xam]]} />}>
      <div className={KHUNG_B}>
        <table className={BANG_B}>
          <thead className={THEAD_B}><tr>
            <th className={TH_B}>Dự án</th><th className={TH_B}>PM</th><th className={`${TH_B} w-[24%]`}>Tồn (tỷ)</th>
            <th className={`${TH_B} whitespace-nowrap`}>&gt; 6 tháng</th><th className={`${TH_B} whitespace-nowrap`}>Đã nhập</th>
            <th className={`${TH_B} whitespace-nowrap`}>Đã xuất</th><th className={`${TH_B} whitespace-nowrap`}>Xuất cuối</th>
            <th className={`${TH_B} whitespace-nowrap`}>Đơn chưa nhập</th>
          </tr></thead>
          <tbody>
            {dong.map(x => {
              const tre = x.xuatCuoi ? soNgayGiua(d.date, x.xuatCuoi) : null;
              const duAn = [x.duAn], tenDa = tenDong(x.duAn);
              const phan: [number, string, 'cu' | 'moi' | 'khong', string][] = [[x.cu, MAU.cu, 'cu', '> 6 tháng'], [x.moi, MAU.moi, 'moi', '≤ 6 tháng'], [x.khongNgay, MAU.xam, 'khong', 'không rõ ngày']];
              return (
                <tr key={x.duAn}>
                  <td className={TD_B}>
                    <So bam={neuTr(x.ton, { loai: 'ton', duAn }, `Tồn ${tenDa}`)} className="block text-left text-base font-bold leading-tight text-slate-900">{tenDong(x.duAn)}</So>
                    <span className="text-sm text-slate-600">{x.hang.length
                      ? x.hang.map((h, j) => <React.Fragment key={h.ten}>{j > 0 && ' · '}{j ? h.ten.toLowerCase() : hoaDauCau(h.ten.toLowerCase())} <So bam={neuTr(h.v, { loai: 'ton', duAn, nsp: h.ten }, `${tenDa} ${h.ten.toLowerCase()}`)}>{ty(h.v)}</So></React.Fragment>)
                      : <So bam={neuTr(x.ton, { loai: 'ton', duAn }, `Tồn ${tenDa}`)}>{x.soMa} mã</So>}</span>
                  </td>
                  <td className={TD_B}>{tenPm(x.pm, x.duAn)}</td>
                  <td className={TD_B}>
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 gap-px overflow-hidden" style={{ width: `${pt(x.ton, max) * 0.8}%` }}>
                        {phan.map(([v, mau, tuoi, ten]) => v > 0 && <ThanhBam key={mau} bam={neuTr(v, { loai: 'ton', duAn, tuoi }, `${tenDa} ${ten}`)} mau={mau} className="block h-full" style={{ width: `${pt(v, x.ton)}%` }} />)}
                      </div>
                      <SoB bam={neuTr(x.ton, { loai: 'ton', duAn }, `Tồn ${tenDa}`)} className="font-bold tabular-nums">{ty(x.ton)}</SoB>
                    </div>
                  </td>
                  <td className={`${SO_B} ${x.cu >= d.tong.cu * 0.1 ? 'font-bold text-red-700' : ''}`}>{x.cu ? <SoB bam={neuTr(x.cu, { loai: 'ton', duAn, tuoi: 'cu' }, `${tenDa} > 6 tháng`)}>{ty(x.cu)}</SoB> : ''}</td>
                  <td className={`${SO_B} ${x.pctNhap === 0 ? 'font-bold text-red-700' : ''}`}>{x.pctNhap ? <SoB bam={{ yc: { loai: 'da_nhap', duAn }, nhan: `${tenDa} đã nhập` }}>{x.pctNhap}%</SoB> : x.pctNhap === 0 ? '0%' : ''}</td>
                  <td className={`${SO_B} ${x.pctXuat !== null && x.pctXuat < 30 ? 'font-bold text-red-700' : ''}`}>{x.pctXuat ? <SoB bam={{ yc: { loai: 'xuat_tinh', duAn }, nhan: `${tenDa} đã xuất` }}>{x.pctXuat}%</SoB> : x.pctXuat === 0 ? '0%' : ''}</td>
                  <td className={`${SO_B} ${tre === null ? '' : tre > 60 ? 'font-bold text-red-700' : tre > 14 ? 'font-bold text-amber-600' : ''}`}>{x.xuatCuoi ? <SoB bam={bamCuoi({ loai: 'xuat_tinh', duAn }, `${tenDa} đã xuất`)}>{ngay(x.xuatCuoi)}</SoB> : ''}</td>
                  <td className={SO_B}>{x.donChuaNhap ? <SoB bam={neuTr(x.donChuaNhap, { loai: 'don_chua_nhap', duAn }, `${tenDa} đơn chưa nhập`)}>{ty(x.donChuaNhap)}</SoB> : ''}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className={TFOOT_B}>
            <tr>
              <td colSpan={2} className={`${TD_B} text-center`}>TỔNG</td>
              <td className={SO_B}><SoB bam={neuTr(d.tong.v, { loai: 'ton' }, 'Tổng tồn')}>{ty(d.tong.v)}</SoB></td>
              <td className={SO_B}>{d.tong.cu ? <SoB bam={neuTr(d.tong.cu, { loai: 'ton', tuoi: 'cu' }, 'Trên 6 tháng')}>{ty(d.tong.cu)}</SoB> : ''}</td>
              <td className={TD_B} /><td className={TD_B} /><td className={TD_B} /><td className={TD_B} />
            </tr>
          </tfoot>
        </table>
      </div>
      {onXemTheoCongTrinh && <button type="button" onClick={onXemTheoCongTrinh} className="mt-2 text-sm font-semibold text-blue-700 hover:underline">Xem {d.tong.congTrinh} công trình →</button>}
    </Card>
  );
};

// ---- Chưa xuất theo tuổi ----
const NHOM_TUOI: { k: 't6' | 't46' | 't23' | 't01' | 'thieuBo' | 'khong'; ten: string; mau: string; chu: string }[] = [
  { k: 't6', ten: '> 6 tháng', mau: MAU.cu, chu: '#fff' },
  { k: 't46', ten: '4–6 tháng', mau: MAU.con, chu: '#0f172a' },
  { k: 't23', ten: '2–3 tháng', mau: MAU.vang, chu: '#0f172a' },
  { k: 't01', ten: '0–1 tháng', mau: MAU.lam, chu: '#0f172a' },
  { k: 'thieuBo', ten: 'Giao thiếu bộ', mau: MAU.giaoThieu, chu: '#0f172a' },
  { k: 'khong', ten: 'Không rõ ngày', mau: '#e2e8f0', chu: '#0f172a' },
];
const ChuaXuat: React.FC<{ d: StockHealth }> = ({ d }) => {
  const mo = useMoChiTiet();
  const RONG = 40, SO_COT = 8;
  const chia = d.phanChia.filter(p => p.gt > 0);
  const ds = d.chuaXuatDuAn;
  // Cột riêng: dự án ≥ 3% phần chưa xuất; còn lại và "Khác" gộp 1 cột
  const giu = ds.filter(x => x.duAn !== DA_KHAC && x.tong >= d.tong.chuaXuat * 0.03).slice(0, SO_COT - 1);
  const gop = ds.filter(x => !giu.includes(x));
  const cong = (a: typeof ds, k: typeof NHOM_TUOI[number]['k']) => tyS(a.reduce((s, x) => s + x[k], 0));
  const moDong = (ten: string, a: typeof ds) => {
    const o = Object.fromEntries(NHOM_TUOI.map(n => [n.k, cong(a, n.k)])) as Record<typeof NHOM_TUOI[number]['k'], number>;
    return { ten, duAn: a.map(x => x.duAn), ...o, tong: tyS(a.reduce((s, x) => s + x.tong, 0)), tu4: o.t6 + o.t46 };
  };
  const tenGop = gop.length === 1 ? tenDong(gop[0].duAn) : gop.some(x => x.duAn === 'Mini Hotel') ? 'Mini Hotel + khác' : 'Các dự án khác';
  const cot = [...giu.map(x => moDong(tenGon(x.duAn), [x])), ...(gop.length ? [moDong(tenGop, gop)] : [])].sort((a, b) => b.tu4 - a.tu4 || b.tong - a.tong);
  const truc = trucTu0(Math.max(0, ...cot.map(x => x.tong)));
  const nguong = truc.domain[1] * 0.07;
  const nho = chia.filter(p => p.gt < d.tong.v * 0.12);
  const lon = chia.filter(p => !nho.includes(p));
  const tieuDe = d.tong.chuaXuat > 0
    ? <>Chưa xuất TÍNH <So bam={neuTr(d.tong.chuaXuat, { loai: 'chua_xuat' }, 'Chưa xuất TÍNH')}>{ty(d.tong.chuaXuat)}</So> tỷ{d.tong.chuaXuat4 > 0 && <>: <So bam={neuTr(d.tong.chuaXuat4, { loai: 'chua_xuat', nhomTuoi: ['t46', 't6'] }, 'Chưa xuất từ 4 tháng')}>{ty(d.tong.chuaXuat4)}</So> đã nằm từ 4 tháng</>}</>
    : 'Chưa xuất theo tuổi';
  return (
    <Card title={tieuDe}>
      <ThanhChia phan={chia.map(p => ({ v: p.gt, mau: MAU_PHAN_CHIA[p.k] ?? MAU.xam, goi: `${p.nhom} ${ty(p.gt)} · ${p.hex} HEX`, chu: lon.includes(p) ? `${p.nhom} ${ty(p.gt)}` : undefined, sang: p.k === 'huy', yc: { loai: 'phan_chia', nhom: p.k } }))} />
      {nho.length > 0 && (
        <div className="mt-1.5 flex flex-wrap justify-end gap-x-3 text-sm font-semibold text-slate-600">
          {nho.map(p => <span key={p.k} className="flex items-center gap-1.5"><i className="block h-3 w-3 rounded-sm" style={{ background: MAU_PHAN_CHIA[p.k] ?? MAU.xam }} />{p.nhom} <So bam={neuTr(p.gt, { loai: 'phan_chia', nhom: p.k }, p.nhom)}>{ty(p.gt)}</So></span>)}
        </div>
      )}
      {cot.length > 0 && (
        <>
          <div className="mt-3 flex justify-end"><Chu items={NHOM_TUOI.filter(n => n.k !== 'khong' || cong(ds, 'khong') >= 0.01).map(n => [n.ten, n.mau, neu(cong(ds, n.k), { loai: 'chua_xuat', nhomTuoi: [n.k] }, `Chưa xuất ${n.ten}`)])} /></div>
          <div className="overflow-x-auto">
            <div className="min-w-[820px]">
              <ResponsiveContainer width="100%" height={270}>
                <ComposedChart data={cot} margin={{ top: 24, right: 0, left: 0, bottom: 0 }} barCategoryGap="20%">
                  <CartesianGrid stroke="#eef2f6" vertical={false} />
                  <XAxis dataKey="ten" hide />
                  <YAxis width={RONG} domain={truc.domain} ticks={truc.ticks} tick={CHU_TRUC} tickLine={false} axisLine={false} />
                  <Tooltip content={<TipTy />} cursor={{ fill: '#f8fafc' }} />
                  {NHOM_TUOI.map(n => (
                    <Bar key={n.k} dataKey={n.k} name={n.ten} stackId="a" fill={n.mau} isAnimationActive={false}
                      shape={hinhCot(mo, r => neu(r[n.k], { loai: 'chua_xuat', duAn: r.duAn, nhomTuoi: [n.k] }, `Chưa xuất ${r.ten} ${n.ten}`))}>
                      <LabelList dataKey={n.k} content={nhanTrong(nguong, n.chu)} />
                    </Bar>
                  ))}
                  {dongTong(v => v.toFixed(2), mo, i => neu(cot[i]?.tong, { loai: 'chua_xuat', duAn: cot[i]?.duAn }, `Chưa xuất ${cot[i]?.ten}`))}
                </ComposedChart>
              </ResponsiveContainer>
              <HangCot rong={RONG} nhan="" cot={cot.map(x => <So key={x.ten} bam={neu(x.tong, { loai: 'chua_xuat', duAn: x.duAn }, `Chưa xuất ${x.ten}`)} className="px-1 font-bold leading-tight text-slate-800">{x.ten}</So>)} />
              <HangCot rong={RONG} nhan="" cot={cot.map(x => <So key={x.ten} bam={neu(x.tu4, { loai: 'chua_xuat', duAn: x.duAn, nhomTuoi: ['t46', 't6'] }, `Chưa xuất ${x.ten} ≥ 4 tháng`)} className={x.tu4 >= 5 ? 'font-bold text-red-700' : 'font-semibold text-slate-500'}>≥ 4 tháng {x.tu4.toFixed(2)}</So>)} />
            </div>
          </div>
        </>
      )}
    </Card>
  );
};

// ---- Hàng cũ theo gói ----
const GoiCu: React.FC<{ d: StockHealth; onOpen?: MoCt }> = ({ d, onOpen }) => {
  const { goiCu: g } = d;
  const tieuDe = g.ngay > 0 && (g.vao > 0 || g.ra > 0)
    ? <>Hàng cũ vào <So bam={neuTr(g.vao, { loai: 'goi_vao' }, `Hàng cũ vào ${g.ngay} ngày`, { ghi: `${so1(tyS(g.vaoThang))} tỷ/tháng` })}>{so1(tyS(g.vaoThang))}</So> tỷ/tháng, ra <So bam={neuTr(g.ra, { loai: 'goi_ra' }, `Hàng cũ ra ${g.ngay} ngày`, { ghi: `${so1(tyS(g.raThang))} tỷ/tháng` })}>{so1(tyS(g.raThang))}</So> tỷ/tháng</>
    : 'Hàng cũ theo gói';
  const max = Math.max(1, ...g.dong.flatMap(x => [x.cu, x.ra93]), g.conLai.cu, g.conLai.ra93);
  // chan = dòng TỔNG: không thanh, chữ theo tfoot
  const doi = (cu: number, ra: number, bamCu: Bam | null, bamRa: Bam | null, chan = false) => (
    <div className="space-y-0.5">
      {([[cu, MAU.cu, 'text-red-700', bamCu], [Math.max(0, ra), MAU.xanh, 'text-emerald-700', bamRa]] as [number, string, string, Bam | null][]).map(([v, mau, chu, bam]) => (
        <div key={mau} className={`flex h-[17px] items-center gap-1.5 ${chan ? 'justify-center' : ''}`}>
          {!chan && v > 0 && <ThanhBam bam={bam} tab={false} mau={mau} className="block h-3 rounded-sm" style={{ width: `${(v / max) * 82}%` }} />}
          {!bangKhong(tyS(v)) && <SoB bam={bam} className={`text-sm font-bold tabular-nums ${chan ? '' : chu}`}>{ty(v)}</SoB>}
        </div>
      ))}
    </div>
  );
  const tenDongGoi = (x: typeof g.dong[number]) => {
    if (x.huy) return `${x.ct} đơn huỷ${d.doiChieu.huy.soGhi ? `, sổ ghi ${d.doiChieu.huy.soGhi}` : ''}`;
    if (!/^CT\d/.test(x.ct)) return `${tenNho(x.duAn)} (${tenNgan(x.ten)}…)`;
    return `${x.ct} ${tenNgan(x.ten)}`;
  };
  return (
    <Card title={tieuDe} right={<Chu items={[['Hàng cũ còn', MAU.cu], [`Đã ra ${g.ngay} ngày`, MAU.xanh]]} />}>
      <div className={KHUNG_B}>
        <table className={BANG_B}>
          <thead className={THEAD_B}><tr>
            <th className={TH_B}>Gói</th><th className={TH_B}>PM</th><th className={`${TH_B} w-[46%]`}>Tỷ</th>
            <th className={`${TH_B} whitespace-nowrap`}>Xuất 60 ngày</th><th className={`${TH_B} whitespace-nowrap`}>Xuất cuối</th>
          </tr></thead>
          <tbody>
            {g.dong.map(x => {
              const tre = x.xuatCuoi ? soNgayGiua(d.date, x.xuatCuoi) : null;
              return (
                <tr key={`${x.ct}${x.huy ? 'h' : ''}${x.ten}`}>
                  <td className={`${TD_B} font-bold`}><TenCt name={x.ten} onOpen={onOpen}>{tenDongGoi(x)}</TenCt></td>
                  <td className={TD_B}>{x.pm ? hoaDau(x.pm) : ''}</td>
                  <td className={TD_B}>{doi(x.cu, x.ra93,
                    x.ct ? neuTr(x.cu, { loai: 'goi_cu', ct: x.ct, huy: x.huy }, `Hàng cũ ${x.ct}`) : null,
                    x.ct && !x.huy ? neuTr(x.ra93, { loai: 'goi_ra', ct: x.ct }, `Đã ra ${g.ngay} ngày ${x.ct}`) : null)}</td>
                  <td className={SO_B}>{bangKhong(x.xuat60 === null ? null : tyS(x.xuat60)) ? '' : <SoB bam={x.ct ? neuTr(x.xuat60, { loai: 'xuat_tinh', ct: x.ct, xuat60: true }, `Xuất 60 ngày ${x.ct}`) : null}>{ty(x.xuat60!)}</SoB>}</td>
                  <td className={`${SO_B} ${tre !== null && tre > 60 ? 'font-bold text-red-700' : ''}`}>{x.xuatCuoi ? <SoB bam={x.ct ? bamCuoi({ loai: 'xuat_tinh', ct: x.ct }, `Xuất TÍNH ${x.ct}`) : null}>{ngay(x.xuatCuoi)}</SoB> : ''}</td>
                </tr>
              );
            })}
            {g.conLai.soGoi > 0 && (
              <tr>
                <td className={`${TD_B} font-bold`}><So bam={neuTr(g.conLai.cu, { loai: 'goi_cu', conLai: true }, `Hàng cũ ${g.conLai.soGoi} gói còn lại`)} className="text-left">{g.conLai.soGoi} gói còn lại</So></td>
                <td className={TD_B}>Nhiều PM</td>
                <td className={TD_B}>{doi(g.conLai.cu, g.conLai.ra93,
                  neuTr(g.conLai.cu, { loai: 'goi_cu', conLai: true }, `Hàng cũ ${g.conLai.soGoi} gói còn lại`),
                  neuTr(g.conLai.ra93, { loai: 'goi_ra', conLai: true }, `Đã ra ${g.ngay} ngày, gói còn lại`))}</td>
                <td className={TD_B} />
                <td className={TD_B} />
              </tr>
            )}
          </tbody>
          <tfoot className={TFOOT_B}>
            <tr>
              <td colSpan={2} className={`${TD_B} text-center`}>TỔNG</td>
              <td className={TD_B}>{doi(g.tong.cu, g.tong.ra93,
                neuTr(g.tong.cu, { loai: 'ton', tuoi: 'cu' }, 'Trên 6 tháng'),
                neuTr(g.tong.ra93, { loai: 'goi_ra' }, `Đã ra ${g.ngay} ngày`), true)}</td>
              <td className={TD_B} /><td className={TD_B} />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
};

// ---- Tồn theo tháng nhập ----
const LoNhap: React.FC<{ d: StockHealth }> = ({ d }) => {
  const mo = useMoChiTiet();
  const { cot, seri, vachCu, moc6 } = d.loNhap;
  const thangThat = cot.filter(c => /^\d{4}-\d{2}$/.test(c.thang));
  const namXem = d.date.slice(0, 4);
  const moThang = (() => { const t = new Date(Date.UTC(Number(namXem), thangSo(d.date) - 1 - 13, 1)); return `T${t.getUTCMonth() + 1}/${String(t.getUTCFullYear()).slice(2)}`; })();
  const nhanLo = (t: string) => {
    if (t === 'truoc') return `< ${moThang}`;
    if (t === 'khong') return 'Không rõ';
    const m = Number(t.slice(5, 7)), trung = thangThat.filter(c => Number(c.thang.slice(5, 7)) === m).length > 1;
    return trung || m === 1 || t.slice(0, 4) !== namXem ? `T${m}/${t.slice(2, 4)}` : `T${m}`;
  };
  const dong = cot.map(c => ({ thang: c.thang, tong: tyS(c.tong), ...Object.fromEntries(seri.map((s, i) => [`s${i}`, tyS(c.theoDuAn[s] ?? 0)])) }));
  const truc = trucTu0(Math.max(0, ...dong.map(x => x.tong)));
  const mauSeri = (s: string, i: number) => MAU_DU_AN[s] ?? MAU_DU_PHONG[i % MAU_DU_PHONG.length];
  // Cột chứa vạch cũ: tháng của vachCu, không có thì tháng liền sau
  const thangVach = thangThat.find(c => c.thang >= vachCu.slice(0, 7))?.thang;
  const iVach = thangVach ? cot.findIndex(c => c.thang === thangVach) : -1;
  // Cặp tháng liền nhau đã cũ, tồn lớn nhất
  let cap: [string, string] | null = null, tongCap = 0;
  for (let i = 0; i + 1 < thangThat.length; i++) {
    const a = thangThat[i], b = thangThat[i + 1];
    const cach = (Number(b.thang.slice(0, 4)) - Number(a.thang.slice(0, 4))) * 12 + Number(b.thang.slice(5, 7)) - Number(a.thang.slice(5, 7));
    if (cach === 1 && a.cu > 0 && b.cu > 0 && a.tong + b.tong > tongCap) { cap = [a.thang, b.thang]; tongCap = a.tong + b.tong; }
  }
  const phan = [
    ...(cap ? [<>lô T{Number(cap[0].slice(5, 7))}–T{Number(cap[1].slice(5, 7))} còn <So bam={neuTr(tongCap, { loai: 'lo_nhap', thang: cap }, `Lô ${nhanLo(cap[0])}–${nhanLo(cap[1])}`)}>{tyS(tongCap).toFixed(0)}</So> tỷ</>] : []),
    ...(d.doiChieu.sapVuot.gt > 0 ? [<>tới {ngay(d.doiChieu.sapVuot.den)} có thể thêm <So bam={neuTr(d.doiChieu.sapVuot.gt, { loai: 'sap_vuot' }, `Sắp vượt 6 tháng tới ${ngay(d.doiChieu.sapVuot.den)}`)}>{ty(d.doiChieu.sapVuot.gt)}</So> tỷ cũ</>] : []),
  ];
  const sapCham = moc6.filter(m => m.gt > 0);
  return (
    <Card title={<>Tồn theo tháng nhập{phan.map((p, i) => <React.Fragment key={i}>{i ? '; ' : ': '}{p}</React.Fragment>)}</>}>
      <Chu items={seri.map((s, i) => [tenGon(s), mauSeri(s, i)])} />
      <div className={`mt-3 grid grid-cols-1 gap-4 ${sapCham.length ? 'xl:grid-cols-[minmax(0,1fr)_236px]' : ''}`}>
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <ResponsiveContainer width="100%" height={330}>
              <ComposedChart data={dong} margin={{ top: 24, right: 0, left: 0, bottom: 0 }} barCategoryGap="12%">
                <CartesianGrid stroke="#eef2f6" vertical={false} />
                {iVach >= 0 && (
                  <ReferenceArea x1={cot[0].thang} x2={thangVach} ifOverflow="hidden" fill="#fef2f2" fillOpacity={1}
                    shape={(p: any) => <rect x={p.x} y={p.y} height={p.height} fill="#fef2f2" width={Math.max(0, p.width - p.width / (iVach + 1) / 2)} />} />
                )}
                <XAxis dataKey="thang" tickFormatter={nhanLo} tick={{ fontSize: 12, fontWeight: 600, fill: '#475569' }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} interval={0} />
                <YAxis width={40} domain={truc.domain} ticks={truc.ticks} tick={CHU_TRUC} tickLine={false} axisLine={false} />
                <Tooltip content={<TipTy nhan={nhanLo} />} cursor={{ fill: '#f8fafc', fillOpacity: 0.5 }} />
                {seri.map((s, i) => (
                  <Bar key={s} dataKey={`s${i}`} name={tenGon(s)} stackId="a" fill={mauSeri(s, i)} isAnimationActive={false}
                    shape={hinhCot(mo, r => neu(r[`s${i}`], { loai: 'lo_nhap', thang: [r.thang], seri: s }, `Lô ${nhanLo(r.thang)} ${tenGon(s)}`))} />
                ))}
                {dongTong(v => so1(v), mo, i => neu(dong[i]?.tong, { loai: 'lo_nhap', thang: [dong[i]?.thang] }, `Lô ${nhanLo(dong[i]?.thang ?? '')}`))}
                {iVach >= 0 && d.tong.cu > 0 && (
                  <ReferenceLine x={thangVach} stroke={MAU.do} strokeDasharray="5 4" strokeWidth={1.5} pointerEvents="none"
                    label={(p: any) => (
                      <text x={p.viewBox.x - 5} y={p.viewBox.y + 18} textAnchor="end" fontSize={14} fontWeight={700} fill={MAU.cu} className="outline-none hover:underline focus-visible:underline"
                        {...bamSvg(mo, { yc: { loai: 'ton', tuoi: 'cu' }, nhan: 'Trên 6 tháng' })}>{`← ${ty(d.tong.cu)} tỷ trên 6 tháng`}</text>
                    )} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        {sapCham.length > 0 && <div>
          <p className="mb-2 text-sm font-bold text-slate-800">Sắp chạm mốc (mức trần)</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-1">
            {sapCham.map(m => (
              <div key={m.moc} className="rounded-lg bg-orange-50 p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-bold text-slate-600">{ngay(m.moc)}</span>
                  <So bam={neuTr(m.gt, { loai: 'moc6', moc: m.moc }, `Sắp vượt tại ${ngay(m.moc)}`)} className="text-2xl font-extrabold tabular-nums text-orange-700">{coDau(tyS(m.gt), 2)}</So>
                </div>
                <p className="mt-1 text-sm text-slate-600">{Object.keys(m.theoDuAn).length
                  ? Object.entries(m.theoDuAn).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v], i) => <React.Fragment key={k}>{i > 0 && ' · '}{tenNho(k)} <So bam={neuTr(v, { loai: 'moc6', moc: m.moc, seri: k }, `Sắp vượt tại ${ngay(m.moc)}, ${tenNho(k)}`)}>{ty(v)}</So></React.Fragment>)
                  : '—'}</p>
              </div>
            ))}
          </div>
        </div>}
      </div>
    </Card>
  );
};

// ---- Nhập và xuất theo kỳ ----
const O_KY = 'whitespace-nowrap border-b border-r border-slate-300 py-1.5 px-1';
const TH_KY = `${O_KY} text-center`;
const TheoKy: React.FC<{ d: StockHealth }> = ({ d }) => {
  const mo = useMoChiTiet();
  const RONG = 104;
  const k = d.ky.dong;
  // Kỳ i đi từ mốc cuối tháng i tới mốc i + 1
  const dong = k.map((x, i) => ({ tu: d.cuoiThang[i]?.d, den: x.den, nhan: ngay(x.den), cot: x.kyDo ? 'Đến nay' : ngay(x.den), nhap: tyS(x.nhap), xuat: -tyS(x.xuatTinh), cds: -Math.max(0, tyS(x.chuaDoiSoat)) }));
  const bamNhap = (r?: typeof dong[number]) => (r?.tu ? neu(r.nhap, { loai: 'nhap', tu: r.tu, den: r.den }, `Nhập kỳ tới ${r.nhan}`) : null);
  const tren = Math.max(1, ...dong.map(x => x.nhap)), duoi = Math.max(1, ...dong.map(x => -x.xuat - x.cds));
  const coThang = k.filter(x => x.thangTon !== null);
  const cuoi = coThang[coThang.length - 1], dau = coThang[0];
  const lo = d.ky.thangTheoLo;
  const phan = [
    ...(cuoi?.thangTon != null && lo !== null ? [so1(cuoi.thangTon) === so1(lo) ? `Tồn còn ${so1(lo)} tháng` : `Tồn còn ${so1(Math.min(cuoi.thangTon, lo))}–${so1(Math.max(cuoi.thangTon, lo))} tháng tuỳ cách đo`] : []),
    ...(cuoi && dau && cuoi !== dau && cuoi.thangTon! < dau.thangTon! ? [`xuất nhanh hơn từ ${ngay(dau.den)}`] : []),
  ];
  return (
    <Card title={phan[0] ? hoaDauCau(phan.join('; ')) : 'Nhập và xuất theo kỳ'}>
      <Chu items={[['Nhập', MAU.moi], ['Xuất TÍNH', MAU.xanh], ['Chưa đối soát', MAU.timNhat]]} />
      {dong.length > 0 && (
        <div className="overflow-x-auto">
          <div className="min-w-[460px]">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={dong} stackOffset="sign" margin={{ top: 22, right: 0, left: RONG, bottom: 6 }} barCategoryGap="10%">
                <XAxis dataKey="nhan" hide />
                <YAxis hide domain={[-duoi * 1.05, tren * 1.05]} />
                <Tooltip content={<TipTy />} cursor={{ fill: '#f8fafc' }} />
                <ReferenceLine y={0} stroke="#64748b" />
                <Bar dataKey="nhap" name="Nhập" stackId="a" fill={MAU.moi} isAnimationActive={false} shape={hinhCot(mo, bamNhap)}>
                  <LabelList dataKey="nhap" content={(p: any) => {
                    const b = bamNhap(dong[p.index]);
                    return <text x={p.x + p.width / 2} y={p.y - 6} textAnchor="middle" fontSize={14} fontWeight={700} fill={MAU.duong} className="outline-none hover:underline focus-visible:underline" {...(b ? bamSvg(mo, b) : {})}>{Number(p.value).toFixed(0)}</text>;
                  }} />
                </Bar>
                <Bar dataKey="xuat" name="Xuất TÍNH" stackId="a" fill={MAU.xanh} isAnimationActive={false}
                  shape={hinhCot(mo, r => (r.tu ? neu(r.xuat, { loai: 'xuat_tinh', tu: r.tu, den: r.den }, `Xuất TÍNH kỳ tới ${r.nhan}`) : null))}>
                  <LabelList dataKey="xuat" content={(p: any) => <text x={p.x + p.width / 2} y={p.y + p.height / 2 + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill="#fff" pointerEvents="none">{Math.abs(p.value).toFixed(0)}</text>} />
                </Bar>
                <Bar dataKey="cds" name="Chưa đối soát" stackId="a" fill={MAU.timNhat} isAnimationActive={false}
                  shape={hinhCot(mo, r => neu(r.cds, { loai: 'chua_doi_soat', den: r.den }, `Chưa đối soát kỳ tới ${r.nhan}`))}>
                  <LabelList dataKey="cds" content={(p: any) => (Math.abs(p.value) < 20 ? null : <text x={p.x + p.width / 2} y={p.y + p.height / 2 + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill={MAU.tim} pointerEvents="none">{Math.abs(p.value).toFixed(0)}</text>)} />
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
            <div className="border-l border-t border-slate-300 text-[0.9375rem] font-medium text-slate-900">
              <HangCot rong={RONG} o={TH_KY} nhan="Kỳ" cls="bg-emerald-300 font-bold" cot={dong.map(x => x.cot)} />
              <HangCot rong={RONG} o={O_KY} nhan="Tồn cuối kỳ" cot={k.map(x => <SoB bam={neuTr(x.ton, { loai: 'moc', d: x.den }, `Tồn ${ngay(x.den)}`)}>{tyS(x.ton).toFixed(0)}</SoB>)} />
              <HangCot rong={RONG} o={O_KY} nhan="Tháng tồn" cot={k.map((x, i) => (x.thangTon === null ? '' : <SoB bam={{ yc: { loai: 'xuat_tinh', tu: d.cuoiThang[Math.max(0, i - 2)]?.d, den: x.den }, nhan: `Xuất TÍNH 3 kỳ tới ${ngay(x.den)}`, ghi: `Tháng tồn ${so1(x.thangTon)} = tồn ${tyS(x.ton).toFixed(0)} ÷ ${so1(tyS(x.ton) / x.thangTon)} tỷ/tháng` }}>{so1(x.thangTon)}</SoB>))} />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

// ---- Nhập chưa khớp ----
/** Thứ tự của soSach.kiemKe */
const MUC_KIEM_KE = ['huy', 'da_xuat', 'roi_kho'];
const NhapChuaKhop: React.FC<{ d: StockHealth; onOpen?: MoCt }> = ({ d, onOpen }) => {
  const { soSach: s } = d;
  const NHOM: [string, number, string, string][] = [['Chờ về kho', s.choVeKho, MAU.moi, 'cho_ve'], ['Lắp tại công trình', s.lapCongTrinh, MAU.xanhNhat, 'lap_ct'], ['Đã rời kho (ước)', s.daRoiKho, MAU.vang, 'roi_kho'], ['Chưa rõ', s.chuaRo, MAU.timNhat, 'chua_ro']];
  const tongChia = NHOM.reduce((m, x) => m + Math.max(0, x[1]), 0) || 1;
  const max = Math.max(1, ...s.theoMa.map(x => x.du));
  const tieuDe = s.du > 0
    ? <><So bam={neuTr(s.du, { loai: 'du' }, 'Nhập chưa khớp')}>{ty(s.du)}</So> tỷ nhập chưa khớp xuất + tồn; mới phân loại được <So bam={neuTr(d.tong.duPhanLoai, { loai: 'so_sach', muc: 'phan_loai' }, 'Đã phân loại')}>{ty(d.tong.duPhanLoai)}</So></>
    : 'Nhập chưa khớp';
  return (
    <Card title={tieuDe}>
      <ThanhChia phan={NHOM.map(([ten, v, mau, muc]) => ({ v, mau, goi: `${ten} ${ty(v)}`, chu: v / tongChia >= 0.07 ? so1(tyS(v)) : undefined, yc: { loai: 'so_sach', muc } }))} />
      <div className="mt-2"><Chu items={NHOM.map(([ten, v, mau, muc]) => [ten, mau, neuTr(v, { loai: 'so_sach', muc }, ten)])} /></div>
      <p className="mb-1 mt-4 text-sm font-bold text-slate-800">Theo mã (tỷ)</p>
      <div className="space-y-1.5">
        {s.theoMa.map(x => {
          const bam = neuTr(x.du, x.ct ? { loai: 'du', ct: x.ct } : { loai: 'du', conLai: true }, `Nhập chưa khớp ${x.ct ?? 'các mã còn lại'}`);
          return (
          <div key={x.ct ?? 'con'} className="grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)] items-center gap-3 text-sm">
            {x.ct
              ? <TenCt name={x.ten} onOpen={onOpen} className="font-bold leading-tight text-slate-900">{`${x.ct} ${tenNgan(x.ten)}`}</TenCt>
              : <So bam={bam} className="text-left font-bold leading-tight text-slate-900">{x.ten}</So>}
            <div className="flex items-center gap-2">
              <ThanhBam bam={bam} tab={false} mau={x.ct ? MAU.tim : MAU.xam} className="block h-5 rounded-sm" style={{ width: `${(Math.max(0, x.du) / max) * 74}%` }} />
              <So bam={bam} className="text-base font-bold tabular-nums text-slate-900">{ty(x.du)}</So>
            </div>
          </div>
          );
        })}
      </div>
      <p className="mb-1 mt-4 border-t border-slate-100 pt-3 text-sm font-bold text-slate-800">Cần kiểm kê</p>
      <div className="space-y-1">
        {s.kiemKe.map((x, i) => (
          <div key={x.ten} className="flex items-baseline justify-between gap-3 text-sm text-slate-600">
            <span>{x.ten}{x.ghiChu ? ` · ${x.ghiChu}` : ''}</span>
            <So bam={neuTr(x.gt, { loai: 'kiem_ke', muc: MUC_KIEM_KE[i] }, x.ten)} className="text-base font-bold tabular-nums text-slate-900">{ty(x.gt)}</So>
          </div>
        ))}
      </div>
    </Card>
  );
};

const TonKhoSucKhoe: React.FC<Props> = ({ date, congTrinh, xuong, onOpenProject, onXemTheoCongTrinh }) => {
  const [data, setData] = useState<StockHealth | null>(null);
  // Ngày + bộ lọc của đúng bản số đang hiện: lúc tải bản mới, số cũ vẫn mở đúng chi tiết của nó
  const [phamVi, setPhamVi] = useState<PhamViChiTiet | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const coLoc = Boolean(phamVi?.congTrinh.length || phamVi?.xuong.length);
  const [dangTai, setDangTai] = useState(false);
  const dateISO = date ? toISODateLocal(date) : '';
  const khoaLoc = `${congTrinh.join('|')}#${xuong.join(',')}`;

  useEffect(() => {
    if (!dateISO) return;
    const ac = new AbortController();
    setDangTai(true); setLoi(null);
    fetchStockHealth(dateISO, { congTrinh, xuong, signal: ac.signal })
      .then(d => { setData(d); setPhamVi({ date: d.date, congTrinh, xuong }); setDangTai(false); })
      .catch(e => { if (!ac.signal.aborted) { setLoi(String(e?.message || e)); setDangTai(false); } });
    return () => ac.abort();
    // khoaLoc thay cho 2 mảng (mảng mới mỗi lần vẽ)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateISO, khoaLoc]);

  if (!dateISO) return <p className="p-8 text-center text-sm text-slate-500">Chưa có ngày chốt tồn kho.</p>;
  if (loi && !data) return <p className="p-8 text-center text-sm text-red-600">Không tải được số tồn kho ({loi}).</p>;
  if (!data || !phamVi) return <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 className="animate-spin" size={18} /> Đang tính tồn kho…</div>;

  const { tong, cuoiThang } = data;
  const tangTin = (
    <div className="flex items-center justify-end gap-3 text-sm font-semibold text-slate-600">
      {dangTai && <span className="flex items-center gap-1.5 text-slate-500"><Loader2 className="animate-spin" size={14} /> Đang cập nhật…</span>}
      {loi && !dangTai && <span className="text-red-600">Không cập nhật được ({loi}), đang hiện số cũ</span>}
      <span>Chốt {ngayDu(data.date)} · tỷ đồng</span>
    </div>
  );
  if (!tong.v) return <div className="space-y-4 p-4 sm:p-6">{tangTin}<p className="p-8 text-center text-sm text-slate-500">Không có tồn trong phạm vi lọc.</p></div>;

  const dinh = cuoiThang.reduce<StockHealth['cuoiThang'][number] | null>((m, c) => (!m || c.v > m.v ? c : m), null);
  const cuoi = cuoiThang[cuoiThang.length - 1];
  const goi = data.goiDung;
  const boGoi = goi && goi.cu > 0 && cuoi && cuoi.v > cuoi.tonGoi ? pt(cuoi.cu - cuoi.cuGoi, cuoi.v - cuoi.tonGoi) : null;

  return (
    <ChiTietProvider phamVi={phamVi}>
    <div className="space-y-4 p-4 sm:p-6">
      {tangTin}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi nhan="Tổng tồn" so={ty(tong.v)} mau="text-slate-900" bam={neuTr(tong.v, { loai: 'ton' }, 'Tổng tồn')}
          phu={dinh && dinh.d !== data.date ? <span className={tong.v < dinh.v ? 'text-emerald-700' : 'text-red-600'}>{tong.v < dinh.v ? '▼' : '▲'} <So bam={neuTr(tong.v - dinh.v, { loai: 'so_moc', tu: dinh.d, den: data.date }, `Chênh so với đỉnh ${ngay(dinh.d)}`)}>{ty(Math.abs(tong.v - dinh.v))}</So> từ đỉnh <So bam={neuTr(dinh.v, { loai: 'moc', d: dinh.d }, `Tồn đỉnh ${ngay(dinh.d)}`)}>{ngay(dinh.d)}</So></span> : null}
          duoi={<>{fmtInt(tong.ma)} mã SAP{tong.ma0 ? ` · ${fmtInt(tong.ma0)} mã giá trị 0` : ''}</>} />
        <Kpi nhan="Trên 6 tháng" so={ty(tong.cu)} mau="text-red-700" bam={neuTr(tong.cu, { loai: 'ton', tuoi: 'cu' }, 'Trên 6 tháng')}
          phu={<span className="text-red-700"><So bam={neuTr(tong.cu, { loai: 'ton', tuoi: 'cu' }, 'Trên 6 tháng', ghiPt(tong.cu, tong.v, 'tổng tồn'))}>{so1(pt(tong.cu, tong.v))}%</So>{goi && boGoi !== null && <> · bỏ {goi.ct} vẫn <So bam={neuTr(cuoi.cu - cuoi.cuGoi, { loai: 'moc', d: cuoi.d, cu: true, phan: 'con' }, `Hàng cũ bỏ ${goi.ct}`, ghiPt(cuoi.cu - cuoi.cuGoi, cuoi.v - cuoi.tonGoi, 'tồn bỏ gói'))}>{so1(boGoi)}%</So></>}</span>} />
        <Kpi nhan="Chưa xuất TÍNH" so={ty(tong.chuaXuat)} mau="text-amber-600" bam={neuTr(tong.chuaXuat, { loai: 'chua_xuat' }, 'Chưa xuất TÍNH')}
          phu={<span className="text-amber-700"><So bam={neuTr(tong.chuaXuat, { loai: 'chua_xuat' }, 'Chưa xuất TÍNH', ghiPt(tong.chuaXuat, tong.v, 'tổng tồn'))}>{so1(pt(tong.chuaXuat, tong.v))}%</So> · <So bam={neuTr(tong.chuaXuat4, { loai: 'chua_xuat', nhomTuoi: ['t46', 't6'] }, 'Chưa xuất từ 4 tháng')}>{ty(tong.chuaXuat4)}</So> đã từ 4 tháng</span>} />
        <Kpi nhan="Nhập chưa khớp xuất + tồn" so={!coLoc && tong.du > 0 ? ty(tong.du) : '—'} mau="text-violet-600" bam={!coLoc ? neuTr(tong.du, { loai: 'du' }, 'Nhập chưa khớp') : null}
          phu={coLoc ? <span className="text-slate-500">Chỉ tính khi xem toàn kho</span> : <span className="text-violet-600">{data.soSach.tu ? `từ ${ngay(data.soSach.tu)} · ` : ''}mới phân loại <So bam={neuTr(tong.duPhanLoai, { loai: 'so_sach', muc: 'phan_loai' }, 'Đã phân loại')}>{ty(tong.duPhanLoai)}</So></span>} />
      </div>

      <VanDe d={data} onOpen={onOpenProject} coLoc={coLoc} />
      <HangCu d={data} />
      <DienBien d={data} />
      <SoHaiMoc d={data} />
      <LuyKeGoi d={data} onOpen={onOpenProject} />
      <BangDuAn d={data} onXemTheoCongTrinh={onXemTheoCongTrinh} />
      <ChuaXuat d={data} />
      <GoiCu d={data} onOpen={onOpenProject} />
      <LoNhap d={data} />

      {/* Khi lọc, tồn theo tên công trình còn nhập/xuất theo PSA nên phần dư không còn đúng: chỉ hiện ở toàn kho */}
      <div className={`grid grid-cols-1 gap-4 ${coLoc ? '' : 'xl:grid-cols-2'}`}>
        <TheoKy d={data} />
        {!coLoc && <NhapChuaKhop d={data} onOpen={onOpenProject} />}
      </div>

    </div>
    </ChiTietProvider>
  );
};

export default TonKhoSucKhoe;
