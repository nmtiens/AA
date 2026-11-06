import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, Download, Loader2, Search, X } from 'lucide-react';
import { fetchStockHealthDetail, type StockHealthDetail, type StockHealthDetailQuery } from '../../../../services/dataService';
import { formatTrieuAsTy } from '../../../../utils/money';
import { downloadCsvFile, rowsToCsvString } from '../../utils/csvExport';

// Bấm 1 số của báo cáo Tồn kho v5 => cửa sổ liệt kê các dòng tạo nên số đó (/api/stock/health/chi-tiet).
// Trạng thái cửa sổ nằm riêng trong CuaSoChiTiet: mở/đóng không vẽ lại báo cáo, biểu đồ không nháy.

export type YcChiTiet = StockHealthDetailQuery;
export interface PhamViChiTiet { date: string; congTrinh: string[]; xuong: string[] }
/** ghi: số suy ra vừa bấm (%, tỷ/tháng), hiện cạnh tổng; sapDau: thứ tự sắp lúc mở */
export interface Bam { yc: YcChiTiet; nhan: string; ghi?: string; sapDau?: { k: string; giam: boolean } }
export type MoChiTiet = (b: Bam) => void;
type YeuCau = Bam & PhamViChiTiet;

const NguCanh = createContext<MoChiTiet>(() => {});
export const useMoChiTiet = () => useContext(NguCanh);

/** Số bằng 0 ở 2 số lẻ (tỷ): không cho bấm */
export const bangKhong = (gt: number | null | undefined) => gt === null || gt === undefined || !Number.isFinite(gt) || Number(gt.toFixed(2)) === 0;

const CLS_SO = 'cursor-pointer rounded-sm decoration-1 underline-offset-2 hover:bg-slate-200/70 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500';

/** Con số bấm được; không có bam thì là chữ thường */
export const So: React.FC<{ bam?: Bam | null; className?: string; children: React.ReactNode }> = ({ bam, className = '', children }) => {
  const mo = useMoChiTiet();
  if (!bam) return <span className={className}>{children}</span>;
  return <button type="button" title={bam.nhan} onClick={() => mo(bam)} className={`${CLS_SO} ${className}`}>{children}</button>;
};

/** Thanh ngang bấm được. tab = false khi đã có con số bấm được cạnh nó */
export const ThanhBam: React.FC<{ bam?: Bam | null; mau: string; className?: string; style?: React.CSSProperties; tab?: boolean; children?: React.ReactNode }> = ({ bam, mau, className = '', style, tab = true, children }) => {
  const mo = useMoChiTiet();
  if (!bam) return <i className={className} style={{ ...style, background: mau }}>{children}</i>;
  return (
    <button type="button" title={bam.nhan} aria-label={bam.nhan} tabIndex={tab ? 0 : -1} onClick={() => mo(bam)}
      className={`cursor-pointer text-left hover:brightness-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${className}`} style={{ ...style, background: mau }}>{children}</button>
  );
};

/** Thuộc tính bấm + phím cho phần tử SVG */
export const bamSvg = (mo: MoChiTiet, b: Bam) => ({
  role: 'button', tabIndex: 0, 'aria-label': b.nhan, style: { cursor: 'pointer' },
  onClick: () => mo(b),
  onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); mo(b); } },
});

/** shape cho Bar: payload là dòng dữ liệu của biểu đồ */
export const hinhCot = (mo: MoChiTiet, lay: (dong: any) => Bam | null) => (p: any) => {
  const h = Math.abs(p.height ?? 0), w = p.width ?? 0;
  if (!h || !w) return <g />;
  const b = lay(p.payload);
  return (
    <rect x={p.x} y={Math.min(p.y, p.y + p.height)} width={w} height={h} fill={p.fill} strokeWidth={2}
      className="outline-none hover:brightness-90 focus-visible:stroke-slate-900" {...(b ? bamSvg(mo, b) : {})} />
  );
};

/** dot cho Line: vùng bấm rộng hơn chấm, rê chuột hiện quầng; ban = 0 thì chỉ có vùng bấm; tab = false khi nhãn số cạnh nó đã nhận phím */
export const chamBam = (mo: MoChiTiet, lay: (dong: any, i: number) => Bam | null, o: { mau: string; ban: number; vung: number; tab?: boolean }) => (p: any) => {
  if (p.cx === null || p.cx === undefined || p.cy === null || p.cy === undefined || p.value === null || p.value === undefined) return <g key={p.key} />;
  const b = lay(p.payload, p.index);
  return (
    <g key={p.key}>
      {o.ban > 0 && <circle cx={p.cx} cy={p.cy} r={o.ban} fill={o.mau} stroke={o.mau} />}
      {b && <circle cx={p.cx} cy={p.cy} r={o.vung} fill={o.mau} className="opacity-0 outline-none hover:opacity-30 focus-visible:opacity-30" {...bamSvg(mo, b)} tabIndex={o.tab === false ? -1 : 0}><title>{b.nhan}</title></circle>}
    </g>
  );
};

// ---- Cửa sổ ----
const SO_DONG_MOT_LUOT = 300;
const ty = formatTrieuAsTy;
const dem = (n: number) => n.toLocaleString('en-US');
const thuong = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase();
const ngayVn = (s: unknown) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(s ?? '');
};
type Cot = StockHealthDetail['cot'][number];
const trong = (v: unknown) => v === null || v === undefined || v === '';
const hienO = (c: Cot, v: unknown): string => {
  if (trong(v)) return '';
  if (c.kieu === 'ty') return ty(Number(v));
  if (c.kieu === 'ngay') return ngayVn(v);
  if (c.kieu === 'so') return Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return String(v);
};
/** Cột số tiền cộng lên tong; đơn đã nhập có thêm cột giá trị đơn và phần chưa nhập */
const cotTong = (yc: YcChiTiet, cot: Cot[]) => (yc.loai === 'da_nhap' ? 'nhapCap' : [...cot].reverse().find(c => c.kieu === 'ty')?.k);
const soSanh = (c: Cot, a: unknown, b: unknown) => {
  if (c.kieu === 'ty' || c.kieu === 'so') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), 'vi');
};
const tenFile = (s: string) => thuong(s).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'chi_tiet';

const NoiDung: React.FC<{ yeuCau: YeuCau; onClose: () => void }> = ({ yeuCau, onClose }) => {
  const { yc, nhan, ghi, sapDau, date, congTrinh, xuong } = yeuCau;
  const [kq, setKq] = useState<StockHealthDetail | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [lanThu, setLanThu] = useState(0);
  const [tim, setTim] = useState('');
  const [sap, setSap] = useState<{ k: string; giam: boolean } | null>(sapDau ?? null);
  const [gioiHan, setGioiHan] = useState(SO_DONG_MOT_LUOT);
  const khung = useRef<HTMLDivElement>(null);
  const nutDong = useRef<HTMLButtonElement>(null);
  const hop = useRef<HTMLDivElement>(null);
  const moLuc = useRef(0);
  const bamNen = useRef(false);

  useEffect(() => {
    const ac = new AbortController();
    setKq(null); setLoi(null);
    fetchStockHealthDetail(date, yc, { congTrinh, xuong, signal: ac.signal })
      .then(setKq)
      .catch(e => { if (!ac.signal.aborted) setLoi(String(e?.message || e)); });
    return () => ac.abort();
  }, [date, yc, congTrinh, xuong, lanThu]);

  // Đóng thì trả focus về phần tử vừa bấm, không cuộn trang
  useEffect(() => {
    const truoc = document.activeElement as HTMLElement | SVGElement | null;
    moLuc.current = performance.now();
    nutDong.current?.focus({ preventScroll: true });
    return () => { truoc?.focus?.({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const phim = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', phim, true);
    return () => window.removeEventListener('keydown', phim, true);
  }, [onClose]);

  const giuTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !hop.current) return;
    const ds = hop.current.querySelectorAll<HTMLElement>('button:not([disabled]), input');
    if (!ds.length) return;
    const dau = ds[0], cuoi = ds[ds.length - 1];
    if (e.shiftKey && document.activeElement === dau) { e.preventDefault(); cuoi.focus(); }
    else if (!e.shiftKey && document.activeElement === cuoi) { e.preventDefault(); dau.focus(); }
  };

  const cot = useMemo(() => kq?.cot ?? [], [kq]);
  const chu = useMemo(() => (kq?.rows ?? []).map(r => thuong(cot.map(c => hienO(c, r[c.k])).join(' '))), [kq, cot]);
  const tu = thuong(tim.trim());
  const loc = useMemo(() => (kq?.rows ?? []).filter((_, i) => !tu || chu[i].includes(tu)), [kq, chu, tu]);
  const dong = useMemo(() => {
    const c = sap ? cot.find(x => x.k === sap.k) : undefined;
    if (!c || !sap) return loc;
    // Ô trống luôn nằm cuối, dù sắp chiều nào
    return [...loc].sort((a, b) => (trong(a[c.k]) ? 1 : 0) - (trong(b[c.k]) ? 1 : 0) || (trong(a[c.k]) ? 0 : soSanh(c, a[c.k], b[c.k]) * (sap.giam ? -1 : 1)));
  }, [loc, sap, cot]);
  useEffect(() => { setGioiHan(SO_DONG_MOT_LUOT); if (khung.current) khung.current.scrollTop = 0; }, [tu, sap]);

  const kChinh = kq ? cotTong(yc, kq.cot) : undefined;
  const tongLoc = kChinh ? loc.reduce((s, r) => s + (Number(r[kChinh]) || 0), 0) : 0;
  const boSap = (c: Cot) => setSap(s => {
    if (s?.k !== c.k) return { k: c.k, giam: c.kieu === 'ty' || c.kieu === 'so' };
    return { k: c.k, giam: !s.giam };
  });
  const cuonTiep = (e: React.UIEvent<HTMLDivElement>) => {
    const k = e.currentTarget;
    if (k.scrollTop + k.clientHeight >= k.scrollHeight - 300) setGioiHan(n => (n < dong.length ? n + SO_DONG_MOT_LUOT : n));
  };
  const xuat = () => {
    if (!kq) return;
    const ten = (c: Cot) => (c.kieu === 'ty' ? `${c.nhan} (tỷ)` : c.nhan);
    const hang = dong.map(r => Object.fromEntries(cot.map(c => {
      const v = r[c.k];
      if (trong(v)) return [ten(c), ''];
      return [ten(c), c.kieu === 'ty' ? Number((Number(v) / 1000).toFixed(6)) : c.kieu === 'ngay' ? ngayVn(v) : v];
    })));
    downloadCsvFile(`${tenFile(kq.tieuDe)}_${date}.csv`, rowsToCsvString(hang));
  };
  const phu = kq?.phu?.[0];

  return (
    // Chỉ đóng khi nhấn và nhả đều trên nền: kéo chọn chữ ra ngoài, hay nhấp đúp vào số lúc mở, không đóng cửa sổ
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 p-4"
      onMouseDown={e => { bamNen.current = e.target === e.currentTarget && performance.now() - moLuc.current > 400; }}
      onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget && bamNen.current) onClose(); }}>
      <div ref={hop} role="dialog" aria-modal="true" aria-label={kq?.tieuDe ?? nhan} onKeyDown={giuTab}
        className="flex h-[88vh] w-full max-w-[1280px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-slate-900" title={kq?.tieuDe ?? nhan}>{kq?.tieuDe ?? nhan}</h3>
            <p className="mt-0.5 flex flex-wrap items-baseline gap-x-3 text-sm font-semibold text-slate-600">
              {kq ? <>
                <span><b className="text-2xl font-extrabold tabular-nums text-slate-900">{ty(kq.tong)}</b> tỷ</span>
                <span className="tabular-nums">{dem(kq.soDong)} dòng</span>
                {phu && <span className="tabular-nums">{phu.nhan} {ty(phu.gt)}{phu.gt ? ` · ${Math.round((kq.tong / phu.gt) * 100)}%` : ''}</span>}
                {ghi && <span className="tabular-nums">{ghi}</span>}
                {tu && <span className="tabular-nums text-blue-700">Đang lọc {dem(loc.length)} dòng · {ty(tongLoc)} tỷ</span>}
              </> : <span>&nbsp;</span>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <label className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5">
              <Search size={15} className="text-slate-400" />
              <input value={tim} onChange={e => setTim(e.target.value)} placeholder="Tìm nhanh" aria-label="Tìm nhanh" className="w-44 bg-transparent text-sm outline-none" />
            </label>
            <button type="button" onClick={xuat} disabled={!dong.length} title="Xuất CSV"
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40">
              <Download size={15} /> CSV
            </button>
            <button ref={nutDong} type="button" onClick={onClose} title="Đóng" aria-label="Đóng" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"><X size={22} /></button>
          </div>
        </div>
        {kq?.truncated && <p className="border-b border-amber-200 bg-amber-50 px-5 py-1.5 text-sm font-semibold text-amber-800">Chỉ hiện {dem(kq.rows.length)} / {dem(kq.soDong)} dòng lớn nhất. Tổng vẫn đủ.</p>}
        <div ref={khung} onScroll={cuonTiep} className="min-h-0 flex-1 overflow-auto">
          {loi ? (
            <div className="p-10 text-center">
              <p className="text-sm font-semibold text-red-600">Không tải được ({loi})</p>
              <button type="button" onClick={() => setLanThu(n => n + 1)} className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-100">Thử lại</button>
            </div>
          ) : !kq ? (
            <div className="flex items-center justify-center gap-2 p-12 text-sm font-semibold text-slate-500"><Loader2 className="animate-spin" size={18} /> Đang tải…</div>
          ) : !dong.length ? (
            <p className="p-10 text-center text-sm font-semibold text-slate-500">Không có dòng nào.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-white shadow-[inset_0_-1px_0_#e2e8f0]">
                <tr>
                  {cot.map(c => {
                    const so = c.kieu === 'ty' || c.kieu === 'so';
                    return (
                      <th key={c.k} aria-sort={sap?.k === c.k ? (sap.giam ? 'descending' : 'ascending') : undefined} className="whitespace-nowrap p-0">
                        <button type="button" onClick={() => boSap(c)} className={`flex w-full items-center gap-1 px-3 py-2 font-bold text-slate-600 hover:bg-slate-100 ${so ? 'justify-end' : ''}`}>
                          {c.nhan}{sap?.k === c.k && (sap.giam ? <ChevronDown size={14} /> : <ChevronUp size={14} />)}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {dong.slice(0, gioiHan).map((r, i) => (
                  <tr key={i} className={i % 2 ? 'bg-slate-50' : ''}>
                    {cot.map(c => {
                      const v = hienO(c, r[c.k]);
                      if (c.kieu === 'chu') return <td key={c.k} title={v} className="max-w-[190px] truncate px-3 py-1.5 text-slate-800">{v}</td>;
                      return <td key={c.k} className={`whitespace-nowrap px-3 py-1.5 tabular-nums ${c.k === kChinh ? 'font-bold text-slate-900' : 'text-slate-700'} ${c.kieu === 'ngay' ? '' : 'text-right'}`}>{v}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

const CuaSoChiTiet: React.FC<{ dieuKhien: React.MutableRefObject<((y: YeuCau) => void) | null> }> = ({ dieuKhien }) => {
  const [yeuCau, setYeuCau] = useState<YeuCau | null>(null);
  useEffect(() => {
    dieuKhien.current = setYeuCau;
    return () => { dieuKhien.current = null; };
  }, [dieuKhien]);
  const dong = useMemo(() => () => setYeuCau(null), []);
  return yeuCau ? createPortal(<NoiDung yeuCau={yeuCau} onClose={dong} />, document.body) : null;
};

/** Bọc báo cáo; phamVi là ngày + bộ lọc của đúng bản số đang hiện */
export const ChiTietProvider: React.FC<{ phamVi: PhamViChiTiet; children: React.ReactNode }> = ({ phamVi, children }) => {
  const dat = useRef<((y: YeuCau) => void) | null>(null);
  const mo = useMemo<MoChiTiet>(() => b => dat.current?.({ ...b, ...phamVi }), [phamVi]);
  return (
    <NguCanh.Provider value={mo}>
      {children}
      <CuaSoChiTiet dieuKhien={dat} />
    </NguCanh.Provider>
  );
};
