import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, X, ArrowDown, ArrowUp, ArrowUpDown, AlertTriangle } from 'lucide-react';
import { API_BASE_URL } from '../../services/dataService';
import { fmtInt } from '../../utils/format';
import * as bang from '../shared/bangBaoCao';
import { mauLuong, sapXepTheoThuTu, sttHienThi } from './core/thuTuNhom';
import { useThuTuLuongDo } from './useThuTuLuongDo';

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

const fmtSo = (v: number) => fmtInt(Math.round(v) || 0);   // hết giá trị => 0 (file hiện '-'; -0.3 không thành '-0')
const fmtNgay = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v.slice(8)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : v);
const fmtLuc = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
type Sap = { i: number; giam: boolean } | null;

export const KhnkSheet = () => {
  const [du, setDu] = useState<DuLieu | null>(() => boNho?.du ?? null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const [tim, setTim] = useState('');
  const [sap, setSap] = useState<Sap>(null);
  const [moNhom, setMoNhom] = useState<Set<number>>(() => new Set());

  const tai = useCallback((moi: boolean) => {
    setDangTai(true); setLoi(null);
    taiTruocKhnk(moi).then(setDu).catch(e => setLoi(e instanceof Error ? e.message : String(e))).finally(() => setDangTai(false));
  }, []);
  useEffect(() => { tai(false); }, [tai]);

  const td = useMemo(() => du?.tieuDe ?? [], [du]);
  // Nhóm cột ẩn liền nhau: gắn vào cột hiện đứng ngay trước (bấm + ở cột đó để mở)
  const { hien, nutCua } = useMemo(() => {
    const nut = new Map<number, number[]>();   // chỉ số cột hiện -> các cột ẩn ngay sau nó
    let truoc = -1;
    td.forEach((t, i) => {
      if (!t.an) { truoc = i; return; }
      const goc = Math.max(truoc, 0);
      nut.set(goc, [...(nut.get(goc) ?? []), i]);
    });
    const ds: number[] = [];
    td.forEach((t, i) => { if (!t.an) ds.push(i); });
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
  // Danh sách Luồng đỏ (Setup → Nhóm công trình): công trình trong luồng lên đầu theo STT, tô đỏ / vàng như các bảng khác
  const thuTuNhom = useThuTuLuongDo();
  const goc = useMemo(() => {
    // Công trình có ghi chú "BỎ" = đã bỏ khỏi kế hoạch (tool cũng không nạp; lọc thêm cho dữ liệu nạp trước đó)
    const iGc = td.findIndex(t => t.nhan.toUpperCase() === 'GHI CHÚ');
    const ds = (du?.dong ?? []).filter(d => iGc < 0 || !/^\s*BỎ\s*$/i.test(String(d.o[iGc] ?? '')));
    return sapXepTheoThuTu(ds, d => d.o[iTen], thuTuNhom);
  }, [du, td, iTen, thuTuNhom]);
  // STT theo thứ tự mặc định (luồng trước) — không đổi khi bấm sắp xếp / tìm
  const sttCua = useMemo(() => {
    const so = sttHienThi(goc.map(d => thuTuNhom(d.o[iTen])));
    return new Map(goc.map((d, i) => [d, so[i]]));
  }, [goc, thuTuNhom, iTen]);
  const dong = useMemo(() => {
    let ds = goc;
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
  }, [goc, tim, sap, td]);
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
  const coTren = td.some(t => t.tren);
  const giaTri = (v: number | string | null, t: TieuDe) => (v == null ? '' : t.kieu === 'so' && typeof v === 'number' ? fmtSo(v) : t.kieu === 'ngay' && typeof v === 'string' ? fmtNgay(v) : String(v));

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <p className="font-bold text-slate-900">Kế hoạch nhập kho {du.sheet ?? ''}</p>
        <span className="text-xs text-slate-500">· {fmtInt(dong.length)} công trình · đơn vị triệu đồng · theo file PRODUCTION STATUS.xlsx</span>
        {du.loi && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900" title={du.loi}>
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />File đọc lỗi lần gần nhất — đang hiện số lần đọc tốt trước
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex h-9 items-center rounded-lg border border-slate-300 bg-white"
            title={`File lưu lúc ${fmtLuc(du.capNhat)} · app nạp lúc ${fmtLuc(du.napLuc)}`}>
            <span className="px-2.5 text-xs text-slate-500">File lưu <b className="text-slate-700">{fmtLuc(du.capNhat)}</b></span>
            <button type="button" onClick={() => tai(true)} disabled={dangTai} title="Tải lại số mới nhất" aria-label="Tải lại"
              className="flex h-full w-9 items-center justify-center border-l border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${dangTai ? 'animate-spin' : ''}`} aria-hidden />
            </button>
          </div>
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
            <tr>
              <th className={`${bang.thC} w-px`} title="STT theo danh sách Luồng đỏ (Setup → Nhóm công trình); ngoài luồng đánh tiếp">STT</th>
              {hien.map(i => {
                const t = td[i], nhom = nutCua.get(i), mo = moNhom.has(i), laTen = i === iTen;
                return (
                  <th key={t.cot} className={`${bang.thC} whitespace-nowrap ${laTen ? 'sticky left-0 z-20 w-px bg-emerald-300' : ''} ${t.an ? 'bg-emerald-200' : ''}`}
                    title={`Cột ${t.cot}${t.an ? ' (đang ẩn trong file)' : ''}`}>
                    {coTren && <div className="text-xs font-semibold text-slate-700">{t.tren ?? ' '}</div>}
                    {t.nhan}
                    <button type="button" onClick={() => doiSap(i)} title="Sắp xếp (bấm lần 3 về thứ tự file)" aria-label="Sắp xếp"
                      className={`ml-0.5 inline-flex align-middle ${sap?.i === i ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}>
                      {sap?.i === i ? (sap.giam ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5" />}
                    </button>
                    {nhom && (
                      <button type="button" aria-expanded={mo}
                        onClick={() => setMoNhom(s => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                        title={`${mo ? 'Ẩn' : 'Hiện'} cột đang ẩn trong file: ${nhom.map(j => `${td[j].nhan}${td[j].tren ? ` ${td[j].tren}` : ''}`).join(', ')}`}
                        className="ml-1 font-bold text-emerald-800 hover:text-emerald-950">{mo ? '−' : '+'}</button>
                    )}
                  </th>
                );
              })}
            </tr>
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
                    <td key={t.cot}
                      className={`${t.kieu === 'chu' ? `${bang.tdB} ${laTen ? 'whitespace-nowrap font-semibold' : i === iTen - 1 ? 'whitespace-nowrap' : 'min-w-[12rem] max-w-[22rem] text-sm'}` : bang.tdSo} ${laTen ? `sticky left-0 z-[1] ${nen}` : ''} ${typeof v === 'number' && v < 0 ? 'text-red-600' : ''}`}>
                      {giaTri(v, t)}
                    </td>
                  );
                })}
              </tr>
              );
            })}
            {dong.length === 0 && (
              <tr><td colSpan={hien.length + 1} className={`${bang.tdB} py-8 text-center text-slate-500`}>Không có công trình nào khớp ô tìm.</td></tr>
            )}
          </tbody>
          <tfoot className={bang.tfoot}>
            <tr>
              <td className={bang.tdSo} />
              {hien.map((i, k) => (
                <td key={td[i].cot} className={`${bang.tdSo} ${i === iTen ? 'left-0 !z-[3]' : ''}`}>
                  {i === iTen ? `TỔNG${tim ? ' (đang tìm)' : ''}` : tong[i] != null ? fmtSo(tong[i]!) : k === 0 ? '' : ''}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
