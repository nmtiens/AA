import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, X, ArrowDown, ArrowUp, ArrowUpDown, AlertTriangle } from 'lucide-react';
import { API_BASE_URL } from '../../services/dataService';
import { fmtInt } from '../../utils/format';
import * as bang from '../shared/bangBaoCao';
import { mauLuong, sapXepTheoThuTu, sttHienThi } from './core/thuTuNhom';
import { useThuTuLuongDo } from './useThuTuLuongDo';
import { DashboardFilter } from '../Dashboard/components/shared/DashboardFilter';

// ============================================================================
// KẾ HOẠCH NHẬP KHO THEO THÁNG — nguyên sheet năm (2027...) của PRODUCTION STATUS.xlsx (002_REPORTS\01_PRODUCTION_STATUS),
// tool trên PC01 nạp mỗi khi file lưu (GET /api/khnk-sheet). Cột, cột ẩn theo đúng sheet (không tô màu ô như file): sheet thêm / bớt cột thì
// bảng tự theo. Cột ẩn trong file mở bằng nút + ở cột đứng trước. Số đơn vị như file (triệu đồng).
// Không theo bộ lọc của trang (bảng kế hoạch riêng của file).
// ============================================================================

interface TieuDe { cot: string; nhan: string; tren?: string | null; an: boolean; kieu: 'so' | 'ngay' | 'chu' }
interface Dong { o: (number | string | null)[]; mau?: Record<string, string> }
interface DuLieu { coBang: boolean; sheet?: string | null; capNhat?: string | null; napLuc?: string | null; loi?: string | null; tieuDe: TieuDe[]; dong: Dong[] }

// Dùng chung cả phiên (tải ngầm khi mở trang — taiTruocKhnk)
let boNho: { du: DuLieu; luc: number } | null = null;
let dangGoi: Promise<DuLieu> | null = null;
export const taiTruocKhnk = (moi = false): Promise<DuLieu> => {
  if (!moi && boNho && Date.now() - boNho.luc < 60_000) return Promise.resolve(boNho.du);
  if (!dangGoi) {
    dangGoi = fetch(`${API_BASE_URL}/khnk-sheet`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`Lỗi ${r.status}`))))
      .then((d: DuLieu) => { boNho = { du: d, luc: Date.now() }; return d; })
      .finally(() => { dangGoi = null; });
  }
  return dangGoi;
};

// Số trong file là TRIỆU ĐỒNG => hiện TỶ, 2 số lẻ (người dùng 19/11/2026); -0.00 không hiện dấu trừ
const fmtSo = (v: number) => {
  const ty = Math.round(((v || 0) / 1000) * 100) / 100;
  return (ty === 0 ? 0 : ty).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const fmtNgay = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v.slice(8)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : v);
const COT_BO = new Set(['CÒN LẠI']);
/** Nhãn 2 dòng như thẻ công đoạn: tên ở trên, mã nhỏ ở dưới ("Chưa triển khai / P001") */
const NhanMa = ({ ten, ma }: { ten: string; ma: string }) => (
  <span className="inline-flex flex-col items-center leading-tight align-middle">
    <span>{ten}</span>
    <span className="text-xs font-medium text-slate-600">{ma}</span>
  </span>
);
const fmtLuc = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
type Sap = { i: number; giam: boolean } | null;

/** khuVuc: bộ lọc Khu vực của trang (Tổng quan công trình) — bảng không có ô Khu vực riêng nữa (trùng, người dùng 19/11/2026) */
export const KhnkSheet = ({ khuVuc }: { khuVuc?: string } = {}) => {
  const [du, setDu] = useState<DuLieu | null>(() => boNho?.du ?? null);
  const [loi, setLoi] = useState<string | null>(null);
  const [tim, setTim] = useState('');
  const [sap, setSap] = useState<Sap>(null);
  const [moNhom, setMoNhom] = useState<Set<number>>(() => new Set());
  // Cột con của NHẬP KHO (P022): Xuất (P025) từ bảng xuất kho, Tồn (P023) từ bảng tồn kho ngày mới nhất, theo mã CT
  const [moKho, setMoKho] = useState(false);
  const [kho, setKho] = useState<Record<string, { xuat: number; ton: number }> | null>(null);
  const [ngayTon, setNgayTon] = useState<string | null>(null);
  // Bộ lọc Khu vực / Khách hàng (người dùng 19/11/2026): file KHNK không có => lấy theo mã CT từ bảng sản xuất
  const [ttCt, setTtCt] = useState<Record<string, { kv: string | null; kh: string | null; tksx?: number }>>({});
  const [locKh, setLocKh] = useState<string[]>([]);
  useEffect(() => {
    fetch(`${API_BASE_URL}/khnk-sheet/thong-tin`).then(r => (r.ok ? r.json() : Promise.reject(new Error(`Lỗi ${r.status}`))))
      .then((d: { ct: Record<string, { kv: string | null; kh: string | null; tksx?: number }> }) => setTtCt(d.ct ?? {}))
      .catch(() => setTtCt({}));
  }, []);
  useEffect(() => {
    if (!moKho || kho) return;
    fetch(`${API_BASE_URL}/khnk-sheet/kho`).then(r => (r.ok ? r.json() : Promise.reject(new Error(`Lỗi ${r.status}`))))
      .then((d: { kho: Record<string, { xuat: number; ton: number }>; ngayTon?: string | null }) => { setKho(d.kho ?? {}); setNgayTon(d.ngayTon ?? null); })
      .catch(() => setKho({}));
  }, [moKho, kho]);

  const tai = useCallback((moi: boolean) => {
    setLoi(null);
    taiTruocKhnk(moi).then(setDu).catch(e => setLoi(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => { tai(false); }, [tai]);

  const td = useMemo(() => du?.tieuDe ?? [], [du]);
  // Nhóm cột ẩn liền nhau: gắn vào cột hiện đứng ngay trước (bấm + ở cột đó để mở)
  const { hien, nutCua } = useMemo(() => {
    const nut = new Map<number, number[]>();   // chỉ số cột hiện -> các cột ẩn ngay sau nó
    let truoc = -1;
    // GT ĐÃ TKSX + CHƯA TKSX = GT ĐƠN HÀNG => gắn vào GT ĐƠN HÀNG (đang hiện), không gắn cột hiện đứng trước trong file
    // (GT CÒN LẠI) — trước đây mở ra dưới GT CÒN LẠI nên tổng con lớn hơn cột cha (người dùng 19/11/2026)
    const iDh = td.findIndex(t => !t.an && t.nhan.trim().toUpperCase() === 'GT ĐƠN HÀNG');
    const CON_DH = new Set(['GT ĐÃ TKSX', 'CHƯA TKSX']);
    td.forEach((t, i) => {
      if (!t.an) { truoc = i; return; }
      const goc = iDh >= 0 && CON_DH.has(t.nhan.trim().toUpperCase()) ? iDh : Math.max(truoc, 0);
      nut.set(goc, [...(nut.get(goc) ?? []), i]);
    });
    const ds: number[] = [];
    // Bỏ cột CÒN LẠI (người dùng 19/11/2026)
    td.forEach((t, i) => { if (!t.an && !COT_BO.has(t.nhan.trim().toUpperCase())) ds.push(i); });
    const ra: number[] = [];
    for (const i of ds) {
      ra.push(i);
      if (moNhom.has(i)) ra.push(...(nut.get(i) ?? []));
    }
    // cột ẩn đứng đầu bảng (không có cột hiện trước) => gắn vào cột 0
    return { hien: ra, nutCua: nut };
  }, [td, moNhom]);

  const iTen = useMemo(() => {
    const i = td.findIndex(t => t.nhan.toUpperCase() === 'TÊN CÔNG TRÌNH');
    return i >= 0 ? i : 1;
  }, [td]);
  // Cột tính thêm "% HOÀN THÀNH" = P022 ÷ GT ĐƠN HÀNG, đặt ngay sau cột P022 (người dùng 19/11/2026)
  // File có cột trùng tên (bản ẩn đứng trước) => ưu tiên cột đang hiện
  const timCot = (ten: string) => {
    const ok = (t: TieuDe) => t.nhan.trim().toUpperCase() === ten;
    const i = td.findIndex(t => ok(t) && !t.an);
    return i >= 0 ? i : td.findIndex(ok);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const iP022 = useMemo(() => timCot('P022'), [td]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const iGtDh = useMemo(() => timCot('GT ĐƠN HÀNG'), [td]);
  const coPt = iP022 >= 0 && iGtDh >= 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const iMa = useMemo(() => timCot('MÃ CT'), [td]);
  const khoCua = (d: Dong) => (kho && iMa >= 0 ? kho[String(d.o[iMa] ?? '').trim().toUpperCase()] : undefined);
  const COT_CON = [['xuat', 'XUẤT KHO', 'P025'], ['ton', 'TỒN KHO', 'P023']] as const;
  // GT ĐƠN HÀNG gộp như NHẬP KHO (người dùng 19/11/2026): mở => ô GT ĐƠN HÀNG trải các cột con (GT ĐÃ TKSX / CHƯA TKSX),
  // không còn cột số đơn hàng riêng (đã + chưa = đơn hàng)
  const conDh = iGtDh >= 0 && moNhom.has(iGtDh) ? (nutCua.get(iGtDh) ?? []) : [];
  const moDh = conDh.length > 0;
  const laConDh = new Set(conDh);
  const coHang2 = moKho || moDh;
  const ptHt = (nk: unknown, dh: unknown) =>
    (typeof nk === 'number' && typeof dh === 'number' && dh > 0 ? `${((nk / dh) * 100).toFixed(1)}%` : '');
  // Danh sách Luồng đỏ (Setup → Nhóm công trình): công trình trong luồng lên đầu theo STT, tô đỏ / vàng như các bảng khác
  const thuTuNhom = useThuTuLuongDo();
  const goc = useMemo(() => {
    // Công trình có ghi chú "BỎ" = đã bỏ khỏi kế hoạch (tool cũng không nạp; lọc thêm cho dữ liệu nạp trước đó)
    const iGc = td.findIndex(t => t.nhan.toUpperCase() === 'GHI CHÚ');
    let ds = (du?.dong ?? []).filter(d => iGc < 0 || !/^\s*BỎ\s*$/i.test(String(d.o[iGc] ?? '')));
    // GT ĐÃ TKSX / CHƯA TKSX tính lại trên app (người dùng 19/11/2026): đã TKSX = Σ tính phiếu (bảng sản xuất, bỏ HỦY)
    // theo mã CT; chưa TKSX = GT ĐƠN HÀNG − đã TKSX. Số file có chỗ đã TKSX vượt đơn hàng (CT26-116: 4.60 > 3.67).
    const iDa = td.findIndex(t => t.nhan.trim().toUpperCase() === 'GT ĐÃ TKSX');
    const iChua = td.findIndex(t => t.nhan.trim().toUpperCase() === 'CHƯA TKSX');
    if ((iDa >= 0 || iChua >= 0) && iMa >= 0 && iGtDh >= 0 && Object.keys(ttCt).length) {
      ds = ds.map(d => {
        const tk = ttCt[String(d.o[iMa] ?? '').trim().toUpperCase()]?.tksx ?? 0;
        const dh = typeof d.o[iGtDh] === 'number' ? d.o[iGtDh] as number : 0;
        const o = [...d.o];
        if (iDa >= 0) o[iDa] = tk;
        if (iChua >= 0) o[iChua] = dh - tk;
        return { ...d, o };
      });
    }
    return sapXepTheoThuTu(ds, d => d.o[iTen], thuTuNhom);
  }, [du, td, iTen, thuTuNhom, ttCt, iMa, iGtDh]);
  // STT theo thứ tự mặc định (luồng trước) — không đổi khi bấm sắp xếp / tìm
  const sttCua = useMemo(() => {
    const so = sttHienThi(goc.map(d => thuTuNhom(d.o[iTen])));
    return new Map(goc.map((d, i) => [d, so[i]]));
  }, [goc, thuTuNhom, iTen]);
  const CHUA_CO = '(Chưa có)';
  const ttCua = (d: Dong) => ttCt[String(iMa >= 0 ? d.o[iMa] ?? '' : '').trim().toUpperCase()];
  const dsKh = useMemo(() => [...new Set(goc.map(d => ttCua(d)?.kh || CHUA_CO))].sort((a, b) => a.localeCompare(b, 'vi')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goc, ttCt, iMa]);
  const dong = useMemo(() => {
    let ds = goc;
    if (khuVuc) ds = ds.filter(d => (ttCua(d)?.kv || CHUA_CO) === khuVuc);
    if (locKh.length) ds = ds.filter(d => locKh.includes(ttCua(d)?.kh || CHUA_CO));
    const t = tim.trim().toUpperCase();
    if (t) ds = ds.filter(d => d.o.some((v, i) => td[i]?.kieu === 'chu' && typeof v === 'string' && v.toUpperCase().includes(t)));
    if (sap) {
      const so = (a: unknown, b: unknown) => {
        if (a == null && b == null) return 0;
        if (a == null) return 1;   // trống luôn cuối
        if (b == null) return -1;
        return typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'vi', { numeric: true });
      };
      ds = [...ds].sort((x, y) => {
        const a = x.o[sap.i], b = y.o[sap.i];
        if (a == null || b == null) return so(a, b);
        return sap.giam ? so(b, a) : so(a, b);
      });
    }
    return ds;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goc, tim, sap, td, khuVuc, locKh, ttCt]);
  const tong = useMemo(() => td.map((t, i) => (t.kieu === 'so' ? dong.reduce((s, d) => s + (typeof d.o[i] === 'number' ? d.o[i] as number : 0), 0) : null)), [td, dong]);

  if (loi && !du) return <p className="py-10 text-center text-sm text-slate-600">Không tải được kế hoạch nhập kho ({loi}). <button type="button" onClick={() => tai(true)} className="font-semibold text-blue-700 underline">Thử lại</button></p>;
  if (!du) return <p className="py-10 text-center text-sm font-semibold text-slate-500">Đang tải kế hoạch nhập kho…</p>;
  if (!du.coBang || !td.length) {
    return <p className="py-10 text-center text-sm text-slate-600">Chưa có kế hoạch nhập kho: cần tạo bảng (backend/sql/2026-11-12_khnk_sheet.sql) và tool trên máy PC nạp file PRODUCTION STATUS.xlsx.</p>;
  }

  const doiSap = (i: number) => setSap(s => {
    const chuGiam = td[i].kieu === 'so';
    if (!s || s.i !== i) return { i, giam: chuGiam };
    return s.giam === chuGiam ? { i, giam: !chuGiam } : null;
  });
  const giaTri = (v: number | string | null, t: TieuDe) => (v == null ? '' : t.kieu === 'so' && typeof v === 'number' ? fmtSo(v) : t.kieu === 'ngay' && typeof v === 'string' ? fmtNgay(v) : String(v));

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <p className="font-bold text-slate-900"
          title={`${fmtInt(dong.length)} công trình · đơn vị triệu đồng · file PRODUCTION STATUS.xlsx lưu lúc ${fmtLuc(du.capNhat)} · app nạp lúc ${fmtLuc(du.napLuc)}`}>
          Kế hoạch nhập kho {du.sheet ?? ''}
        </p>
        {du.loi && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900" title={du.loi}>
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />File đọc lỗi lần gần nhất — đang hiện số lần đọc tốt trước
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <DashboardFilter label="Khách hàng" options={dsKh} selectedValues={locKh} onChange={setLocKh} onClearAll={() => setLocKh([])} canhPhai />
          <label className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5">
            <Search className="h-4 w-4 text-slate-400" aria-hidden />
            <input value={tim} onChange={e => setTim(e.target.value)} placeholder="Tìm công trình / ghi chú" className="w-44 outline-none" />
            {tim && <button type="button" onClick={() => setTim('')} aria-label="Xoá tìm"><X className="h-4 w-4 text-slate-400" /></button>}
          </label>
        </div>
      </div>

      <div className={`${bang.khung} max-h-[calc(100vh-14rem)] min-h-[20rem]`}>
        <table className={bang.table}>
          <thead className={bang.thead}>
            {/* Dòng TỔNG ở đầu bảng, thẳng cột (người dùng 19/11/2026) — tỷ đồng */}
            <tr className="bg-yellow-300 font-bold text-red-600">
              <td className={`${bang.tdSo} bg-yellow-300`} />
              {hien.map(i => (
                <React.Fragment key={td[i].cot}>
                  {i === iGtDh && moDh ? null : i === iP022 && moKho
                    ? COT_CON.map(([k]) => (
                      <td key={k} className={`${bang.tdSo} bg-yellow-300`}>{kho ? fmtSo(dong.reduce((s, d) => s + (khoCua(d)?.[k] ?? 0), 0)) : ''}</td>
                    ))
                    : <td className={`${bang.tdSo} bg-yellow-300 ${i === iTen ? 'sticky left-0 z-20' : ''}`}
                        title={i === iTen ? 'Đơn vị: tỷ đồng' : undefined}>
                        {i === iTen ? `TỔNG (tỷ)${tim || khuVuc || locKh.length ? ' · đang lọc' : ''}` : tong[i] != null ? fmtSo(tong[i]!) : ''}
                      </td>}
                  {coPt && i === iP022 && <td className={`${bang.tdSo} bg-yellow-300`}>{ptHt(tong[iP022], tong[iGtDh])}</td>}
                </React.Fragment>
              ))}
            </tr>
            {/* Xuất / tồn nằm TRONG nhập (người dùng 19/11/2026): thu => 1 cột NHẬP KHO (P022); mở => ô NHẬP KHO (P022) trải
                2 cột con Xuất (P025) / Tồn (P023), không còn cột số nhập riêng */}
            <tr>
              <th rowSpan={coHang2 ? 2 : 1} className={`${bang.thC} w-px align-middle`} title="STT theo danh sách Luồng đỏ (Setup → Nhóm công trình); ngoài luồng đánh tiếp">
                <span className="inline-flex flex-col items-center leading-tight align-middle"><span>STT</span><span className="text-xs">{' '}</span></span>
              </th>
              {hien.map(i => {
                if (laConDh.has(i)) return null; // cột con của GT ĐƠN HÀNG: tiêu đề ở hàng 2
                const t = td[i], nhom = nutCua.get(i), mo = moNhom.has(i), laTen = i === iTen;
                const nutSap = (
                  <button type="button" onClick={() => doiSap(i)} title="Sắp xếp (bấm lần 3 về thứ tự file)" aria-label="Sắp xếp"
                    className={`ml-0.5 inline-flex align-middle ${sap?.i === i ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}>
                    {sap?.i === i ? (sap.giam ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5" />}
                  </button>
                );
                const nutKho = i === iP022 && iMa >= 0 && (
                  <button type="button" aria-expanded={moKho} onClick={() => setMoKho(m => !m)}
                    title={moKho ? 'Thu cột xuất kho / tồn kho' : 'Mở cột xuất kho (P025) / tồn kho (P023)'}
                    className="ml-1 font-bold text-emerald-800 hover:text-emerald-950">{moKho ? '−' : '+'}</button>
                );
                const moP022 = i === iP022 && moKho;
                const moGtDh = i === iGtDh && moDh;
                const moGop = moP022 || moGtDh;
                return (
                  <React.Fragment key={t.cot}>
                  <th rowSpan={coHang2 && !moGop ? 2 : 1} colSpan={moP022 ? 2 : moGtDh ? conDh.length : 1}
                    className={`${bang.thC} whitespace-nowrap align-middle ${laTen ? 'sticky left-0 z-20 w-px bg-emerald-300' : ''} ${t.an ? 'bg-emerald-200' : ''}`}
                    title={`${t.nhan}${t.tren ? ` (${t.tren})` : ''} · cột ${t.cot}${t.an ? ' (đang ẩn trong file)' : ''}`}>
                    {/* Nhãn ngay ngắn (19/11/2026): tên + nút cùng 1 dòng; mã (P022) dòng dưới, canh giữa */}
                    <span className="inline-flex flex-col items-center leading-tight align-middle">
                      <span className="inline-flex items-center">
                        {i === iP022 ? 'NHẬP KHO' : t.nhan}
                        {!moGop && nutSap}
                        {nhom && (
                          <button type="button" aria-expanded={mo}
                            onClick={() => setMoNhom(s => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                            title={`${mo ? 'Ẩn' : 'Hiện'} cột đang ẩn trong file: ${nhom.map(j => `${td[j].nhan}${td[j].tren ? ` ${td[j].tren}` : ''}`).join(', ')}`}
                            className="ml-1 font-bold text-emerald-800 hover:text-emerald-950">{mo ? '−' : '+'}</button>
                        )}
                        {nutKho}
                      </span>
                      {/* Mọi cột cùng 2 dòng (dòng mã trống nếu không có) => tên các cột thẳng 1 hàng */}
                      <span className="text-xs font-medium text-slate-600">{i === iP022 ? 'P022' : ' '}</span>
                    </span>
                  </th>
                  {coPt && i === iP022 && (
                    <th rowSpan={coHang2 ? 2 : 1} className={`${bang.thC} whitespace-nowrap align-middle`} title="% hoàn thành = P022 ÷ GT ĐƠN HÀNG">
                      <span className="inline-flex flex-col items-center leading-tight align-middle"><span>% HOÀN THÀNH</span><span className="text-xs">{' '}</span></span>
                    </th>
                  )}
                  </React.Fragment>
                );
              })}
            </tr>
            {coHang2 && (
              <tr>
                {conDh.map(j => (
                  <th key={td[j].cot} className={`${bang.thC} whitespace-nowrap align-middle bg-emerald-200`}
                    title={td[j].nhan.toUpperCase().includes('CHƯA') ? 'GT ĐƠN HÀNG − GT ĐÃ TKSX' : 'Tổng tiền đã tính phiếu theo bảng sản xuất (bỏ hạng mục HỦY)'}>
                    <span className="inline-flex items-center">{td[j].nhan}
                      <button type="button" onClick={() => doiSap(j)} title="Sắp xếp" aria-label="Sắp xếp"
                        className={`ml-0.5 inline-flex align-middle ${sap?.i === j ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}>
                        {sap?.i === j ? (sap.giam ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5" />}
                      </button>
                    </span>
                  </th>
                ))}
                {moKho && COT_CON.map(([k, nhan, ma]) => (
                  <th key={k} className={`${bang.thC} whitespace-nowrap align-middle bg-emerald-200`}
                    title={k === 'xuat' ? 'Xuất kho lũy kế: tổng thành tiền bảng xuất kho theo mã công trình (triệu đồng)'
                      : `Tồn kho ngày ${ngayTon ? ngayTon.split('-').reverse().join('/') : 'mới nhất'}: tổng giá trị bảng tồn kho theo mã công trình (triệu đồng)`}><NhanMa ten={nhan} ma={ma} /></th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {dong.map((d, r) => {
              const mau = mauLuong(thuTuNhom(d.o[iTen]));
              const nen = mau ? mau.nen : 'bg-white';
              return (
              <tr key={`${d.o[iTen] ?? ''}-${r}`} className={`${nen} ${mau ? mau.hover : 'hover:bg-blue-50'}`} title={mau?.nhan}>
                <td className={`${bang.tdSo} ${mau?.stt ?? ''}`}>{sttCua.get(d)}</td>
                {hien.map(i => {
                  const t = td[i], v = d.o[i], laTen = i === iTen;
                  return (
                    <React.Fragment key={t.cot}>
                    {!(i === iP022 && moKho) && !(i === iGtDh && moDh) && <td
                      className={`${t.kieu === 'chu' ? `${bang.tdB} ${laTen ? 'whitespace-nowrap font-semibold' : i === iTen - 1 ? 'whitespace-nowrap' : 'min-w-[12rem] max-w-[22rem] text-sm'}` : bang.tdSo} ${laTen ? `sticky left-0 z-[1] ${nen}` : ''} ${typeof v === 'number' && v < 0 ? 'text-red-600' : ''}`}>
                      {giaTri(v, t)}
                    </td>}
                    {i === iP022 && moKho && COT_CON.map(([k]) => {
                      const v = khoCua(d)?.[k];
                      return <td key={k} className={`${bang.tdSo} bg-emerald-50/60`}>{kho ? (v != null ? fmtSo(v) : '') : '…'}</td>;
                    })}
                    {coPt && i === iP022 && <td className={`${bang.tdSo} font-semibold`}>{ptHt(d.o[iP022], d.o[iGtDh])}</td>}
                    </React.Fragment>
                  );
                })}
              </tr>
              );
            })}
            {dong.length === 0 && (
              <tr><td colSpan={hien.length + 1 + (coPt && hien.includes(iP022) ? 1 : 0) + (moKho ? 1 : 0) - (moDh ? 1 : 0)} className={`${bang.tdB} py-8 text-center text-slate-500`}>Không có công trình nào khớp ô tìm.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
