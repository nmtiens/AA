import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, X, ArrowDown, ArrowUp, ArrowUpDown, AlertTriangle } from 'lucide-react';
import { API_BASE_URL } from '../../services/dataService';
import { fmtInt } from '../../utils/format';
import * as bang from '../shared/bangBaoCao';
import { mauLuong, sapXepTheoThuTu, sttHienThi } from './core/thuTuNhom';
import { useThuTuLuongDo } from './useThuTuLuongDo';
import { DashboardFilter } from '../Dashboard/components/shared/DashboardFilter';
import { soSanhKhuVuc } from '../Dashboard/utils/khuVuc';

// ============================================================================
// KẾ HOẠCH NHẬP KHO THEO THÁNG — nguyên sheet năm (2027...) của PRODUCTION STATUS.xlsx (002_REPORTS\01_PRODUCTION_STATUS),
// tool trên PC01 nạp mỗi khi file lưu (GET /api/khnk-sheet). Cột, cột ẩn theo đúng sheet: sheet thêm / bớt cột thì bảng tự theo.
// Cột ẩn trong file mở bằng nút + ở cột đứng trước. File lưu triệu đồng, hiện tỷ.
// Trình bày theo mẫu A (docs/designs/khnk/pa-a-bang-truc-quan.png, người dùng 19/11/2026): thẻ số, biểu đồ tháng chồng theo luồng
// (thay dòng TỔNG), luồng = vạch màu trái, % hoàn thành / GT đơn hàng có thanh, ô tháng tô xanh theo độ lớn, BOT trễ tô đỏ.
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
/** onXemCt: bấm tên công trình => trang mở cửa sổ chi tiết theo hạng mục (khớp theo mã CT) */
export const KhnkSheet = ({ khuVuc, onXemCt, onXemHangMuc }: { khuVuc?: string; onXemCt?: (ma: string, ten: string) => void; onXemHangMuc?: (ma: string, ten: string) => void } = {}) => {
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
  const [ttCt, setTtCt] = useState<Record<string, { kv: string | null; kh: string | null; tksx?: number; nk?: number }>>({});
  const [locKh, setLocKh] = useState<string[]>([]);
  // Lọc Khu vực ngay trên bảng (người dùng 19/11/2026) — vẫn theo thêm bộ lọc Khu vực của trang nếu có
  const [locKv, setLocKv] = useState<string[]>([]);
  useEffect(() => {
    fetch(`${API_BASE_URL}/khnk-sheet/thong-tin`).then(r => (r.ok ? r.json() : Promise.reject(new Error(`Lỗi ${r.status}`))))
      .then((d: { ct: Record<string, { kv: string | null; kh: string | null; tksx?: number; nk?: number }> }) => setTtCt(d.ct ?? {}))
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
    // NHẬP KHO (P022) bỏ hạng mục HỦY (người dùng 19/11/2026): file cộng cả phần đã nhập của hạng mục HỦY => lấy Σ đã nhập
    // (bảng sản xuất, bỏ HỦY) theo mã CT; GT CÒN LẠI = GT ĐƠN HÀNG − nhập kho đó. Mã chưa có trong bảng sản xuất giữ số file.
    const iP = timCot('P022'), iCl = timCot('GT CÒN LẠI');
    if (iMa >= 0 && iGtDh >= 0 && Object.keys(ttCt).length) {
      ds = ds.map(d => {
        const tt = ttCt[String(d.o[iMa] ?? '').trim().toUpperCase()];
        const dh = typeof d.o[iGtDh] === 'number' ? d.o[iGtDh] as number : 0;
        const o = [...d.o];
        const tk = tt?.tksx ?? 0;
        if (iDa >= 0) o[iDa] = tk;
        if (iChua >= 0) o[iChua] = dh - tk;
        if (tt?.nk != null && iP >= 0) {
          o[iP] = tt.nk;
          if (iCl >= 0) o[iCl] = Math.max(dh - tt.nk, 0);
        }
        return { ...d, o };
      });
    }
    return sapXepTheoThuTu(ds, d => d.o[iTen], thuTuNhom);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const dsKv = useMemo(() => [...new Set(goc.map(d => ttCua(d)?.kv || CHUA_CO))].sort((a, b) => soSanhKhuVuc(a, b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goc, ttCt, iMa]);
  // Lọc theo khu vực / khách hàng / ô tìm — thẻ số + biểu đồ tính trên tập này (không theo cột tháng đang chọn)
  const loc = useMemo(() => {
    let ds = goc;
    if (khuVuc) ds = ds.filter(d => (ttCua(d)?.kv || CHUA_CO) === khuVuc);
    if (locKv.length) ds = ds.filter(d => locKv.includes(ttCua(d)?.kv || CHUA_CO));
    if (locKh.length) ds = ds.filter(d => locKh.includes(ttCua(d)?.kh || CHUA_CO));
    const t = tim.trim().toUpperCase();
    if (t) ds = ds.filter(d => d.o.some((v, i) => td[i]?.kieu === 'chu' && typeof v === 'string' && v.toUpperCase().includes(t)));
    return ds;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goc, tim, td, khuVuc, locKv, locKh, ttCt]);
  // Bấm 1 cột tháng của biểu đồ => bảng chỉ còn công trình có kế hoạch tháng đó
  const [chonThang, setChonThang] = useState<number | null>(null);
  const dong = useMemo(() => {
    let ds = loc;
    if (chonThang != null) ds = ds.filter(d => typeof d.o[chonThang] === 'number' && (d.o[chonThang] as number) > 0);
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
  }, [loc, chonThang, sap]);
  // ---------- Số liệu cho thẻ + biểu đồ (mẫu A, người dùng 19/11/2026: bỏ dòng TỔNG, thay bằng biểu đồ nhập kho) ----------
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const iCon = useMemo(() => timCot('GT CÒN LẠI'), [td]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const iBot = useMemo(() => timCot('BOT DỰ ÁN'), [td]);
  const iGhiChu = useMemo(() => td.findIndex(t => t.nhan.trim().toUpperCase() === 'GHI CHÚ'), [td]);
  // Cột tháng: "KHNK T11" / "01-27" (cột đang hiện, kiểu số) — kèm năm/tháng để biết tháng này
  const thang = useMemo(() => {
    const ds = td.map((t, i) => ({ t, i })).filter(({ t }) => !t.an && t.kieu === 'so' && laNhanThang(t.nhan));
    const dauMmYy = ds.map(({ t }) => /^(\d{2})-(\d{2})$/.exec(t.nhan.trim())).find(Boolean);
    const namDau = dauMmYy ? 2000 + Number(dauMmYy[2]) : new Date().getFullYear() + 1;
    const thangDau = dauMmYy ? Number(dauMmYy[1]) : 1;
    return ds.map(({ t, i }) => {
      const nhan = t.nhan.trim();
      const a = /^(\d{2})-(\d{2})$/.exec(nhan);
      const b = /T\s*(\d{1,2})$/i.exec(nhan);
      const m = a ? Number(a[1]) : b ? Number(b[1]) : 0;
      const y = a ? 2000 + Number(a[2]) : m > thangDau ? namDau - 1 : namDau;
      return { i, m, y, ngan: a ? nhan : `T${m}`, ten: `T${m}/${y}` };
    });
  }, [td]);
  const laCotThang = useMemo(() => new Set(thang.map(x => x.i)), [thang]);
  const homNay = new Date();
  const iThangNay = thang.find(x => x.m === homNay.getMonth() + 1 && x.y === homNay.getFullYear())?.i ?? null;
  const so = (v: unknown) => (typeof v === 'number' ? v : 0);
  const tongCot = (ds: Dong[], i: number) => (i >= 0 ? ds.reduce((s, d) => s + so(d.o[i]), 0) : 0);
  const kpi = useMemo(() => {
    const dh = tongCot(loc, iGtDh), nk = tongCot(loc, iP022);
    const con = iCon >= 0 ? tongCot(loc, iCon) : dh - nk;
    return { dh, nk, con };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc, iGtDh, iP022, iCon]);
  const cotBd = useMemo(() => thang.map(x => {
    const c = { do: 0, vang: 0, thuong: 0 };
    for (const d of loc) {
      const v = so(d.o[x.i]);
      if (!v) continue;
      const l = thuTuNhom(d.o[iTen])?.luong;
      c[l === 'do' ? 'do' : l === 'vang' ? 'vang' : 'thuong'] += v;
    }
    return { ...x, ...c, tong: c.do + c.vang + c.thuong };
  }), [thang, loc, thuTuNhom, iTen]);
  // Cần chú ý (người dùng 19/11/2026): quá BOT mà chưa nhập xong; BOT còn ≤ 30 ngày mà %HT < 50%;
  // chưa nhập kho mà kế hoạch còn lớn (≥ 100 tỷ). Tính trên tập đang lọc.
  const canChuY = useMemo(() => {
    const hn = new Date(); hn.setHours(0, 0, 0, 0);
    const ra: ChuY[] = [];
    for (const d of loc) {
      const dh = so(d.o[iGtDh]), nk = so(d.o[iP022]), p = dh > 0 ? (nk / dh) * 100 : 0;
      if (dh > 0 && p >= 99.95) continue;
      const ma = iMa >= 0 ? String(d.o[iMa] ?? '').trim() : '';
      const chung = { ma, ten: tenGon(d.o[iTen], ma), con: iCon >= 0 ? so(d.o[iCon]) : dh - nk, luong: thuTuNhom(d.o[iTen])?.luong ?? null };
      const bot = iBot >= 0 ? d.o[iBot] : null;
      const ngay = typeof bot === 'string' && /^\d{4}-\d{2}-\d{2}/.test(bot) ? new Date(`${bot.slice(0, 10)}T00:00:00`) : null;
      const conNgay = ngay ? Math.round((ngay.getTime() - hn.getTime()) / 86_400_000) : null;
      const ddmm = ngay ? `${bot!.toString().slice(8, 10)}/${bot!.toString().slice(5, 7)}` : '';
      if (conNgay != null && conNgay < 0) {
        ra.push({ ...chung, muc: 0, xep: conNgay, nhan: `Quá BOT ${-conNgay} ngày (${ddmm}) · HT ${p.toFixed(1)}%` });
      } else if (conNgay != null && conNgay <= 30 && p < 50) {
        ra.push({ ...chung, muc: 1, xep: conNgay, nhan: `BOT ${ddmm} còn ${conNgay} ngày · HT ${p.toFixed(1)}%` });
      } else if (nk <= 0) {
        const kh = thang.reduce((s, x) => s + so(d.o[x.i]), 0);
        const dau = thang.find(x => so(d.o[x.i]) > 0);
        if (kh >= 100_000) ra.push({ ...chung, muc: 2, xep: -kh, nhan: `Chưa nhập kho (0%) · KH ${fmtSo(kh)} tỷ${dau ? ` từ ${dau.ngan}` : ''}` });
      }
    }
    return ra.sort((a, b) => a.muc - b.muc || a.xep - b.xep);
  }, [loc, iGtDh, iP022, iMa, iTen, iCon, iBot, thang, thuTuNhom]);
  // Thang màu ô tháng: theo ô lớn nhất của tập đang lọc
  const maxO = useMemo(() => Math.max(1, ...loc.flatMap(d => thang.map(x => so(d.o[x.i])))), [loc, thang]);

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
  const pt = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
  const thang0 = cotBd[0], thang1 = cotBd[1];
  const dinh = cotBd.reduce<(typeof cotBd)[number] | null>((m, x) => (!m || x.tong > m.tong ? x : m), null);
  const dangLoc = !!(tim || khuVuc || locKv.length || locKh.length);
  // Cột Mã CT gộp vào ô công trình (mã nhỏ ở trên, tên ở dưới — mẫu A)
  const cotHien = hien.filter(i => i !== iMa);

  return (
    <div className="space-y-3">
      {/* Thẻ số (mẫu A) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <TheSo cham="bg-slate-900" nhan="Tổng GT đơn hàng" so={kpi.dh} phu={`${fmtInt(loc.length)} công trình${dangLoc ? ' (đang lọc)' : ' đang theo dõi'}`} />
        <TheSo cham="bg-emerald-600" nhan="Đã nhập kho (P022)" so={kpi.nk} thanh={pt(kpi.nk, kpi.dh)} mauThanh="bg-emerald-600"
          phu={`${pt(kpi.nk, kpi.dh).toFixed(1)}% GT đơn hàng`} />
        <TheSo cham="bg-amber-500" nhan="Còn lại phải nhập" so={kpi.con} thanh={pt(kpi.con, kpi.dh)} mauThanh="bg-amber-500"
          phu={`${pt(kpi.con, kpi.dh).toFixed(1)}% GT đơn hàng`} />
        {thang0 && <TheSo cham="bg-blue-600" nhan={`KH nhập kho ${thang0.ten}`} so={thang0.tong} thanh={pt(thang0.tong, kpi.con)} mauThanh="bg-blue-600"
          phu={`${pt(thang0.tong, kpi.con).toFixed(1)}% GT còn lại`} />}
        {thang1 && <TheSo cham="bg-blue-600" nhan={`KH nhập kho ${thang1.ten}`} so={thang1.tong} thanh={pt(thang1.tong, kpi.con)} mauThanh="bg-blue-600"
          phu={`${pt(thang1.tong, kpi.con).toFixed(1)}% GT còn lại${dinh && dinh.tong > 0 ? ` · đỉnh ${dinh.ngan}: ${fmtSo(dinh.tong)}` : ''}`} />}
      </div>

      {/* Biểu đồ nhập kho theo tháng, chồng theo luồng — thay dòng TỔNG */}
      {(cotBd.length > 0 || canChuY.length > 0) && (
        <div className="grid gap-3 xl:h-[15rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
          {cotBd.length > 0 && <BieuDoThang cot={cotBd} iThangNay={iThangNay} chon={chonThang} onChon={i => setChonThang(c => (c === i ? null : i))} />}
          <CanChuY ds={canChuY} onChon={ma => setTim(t => (t === ma ? '' : ma))} dangTim={tim} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <p className="font-bold text-slate-900"
          title={`${fmtInt(dong.length)} công trình · đơn vị tỷ đồng · file PRODUCTION STATUS.xlsx lưu lúc ${fmtLuc(du.capNhat)} · app nạp lúc ${fmtLuc(du.napLuc)}`}>
          Kế hoạch nhập kho {du.sheet ?? ''} <span className="font-medium text-slate-500">(tỷ)</span>
        </p>
        {du.loi && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900" title={du.loi}>
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />File đọc lỗi lần gần nhất — đang hiện số lần đọc tốt trước
          </span>
        )}
        {chonThang != null && (
          <button type="button" onClick={() => setChonThang(null)}
            className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-200">
            Có kế hoạch {thang.find(x => x.i === chonThang)?.ngan}: {fmtInt(dong.length)} công trình <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
          <ChuGiai />
          <DashboardFilter label="Khu vực" options={dsKv} selectedValues={locKv} onChange={setLocKv} onClearAll={() => setLocKv([])} canhPhai />
          <DashboardFilter label="Khách hàng" options={dsKh} selectedValues={locKh} onChange={setLocKh} onClearAll={() => setLocKh([])} canhPhai />
          <label className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5">
            <Search className="h-4 w-4 text-slate-400" aria-hidden />
            <input value={tim} onChange={e => setTim(e.target.value)} placeholder="Tìm công trình / ghi chú" className="w-44 outline-none" />
            {tim && <button type="button" onClick={() => setTim('')} aria-label="Xoá tìm"><X className="h-4 w-4 text-slate-400" /></button>}
          </label>
        </div>
      </div>

      <div className={`${bang.khung} max-h-[calc(100vh-14rem)] min-h-[20rem] rounded-lg`}>
        <table className={bang.table}>
          <thead className={`${bang.thead} text-xs uppercase`}>
            {/* Xuất / tồn nằm TRONG nhập (người dùng 19/11/2026): thu => 1 cột NHẬP KHO (P022); mở => ô NHẬP KHO (P022) trải
                2 cột con Xuất (P025) / Tồn (P023), không còn cột số nhập riêng */}
            <tr>
              <th rowSpan={coHang2 ? 2 : 1} className={`${bang.thC} sticky left-0 z-30 w-16 min-w-[4rem] max-w-[4rem] bg-emerald-300 align-middle`} title="STT theo danh sách Luồng đỏ (Setup → Nhóm công trình); ngoài luồng đánh tiếp">
                STT
              </th>
              {cotHien.map(i => {
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
                const nhan = i === iP022 ? 'NHẬP KHO' : laTen ? 'CÔNG TRÌNH' : laCotThang.has(i) ? (thang.find(x => x.i === i)?.ngan ?? t.nhan) : t.nhan;
                return (
                  <React.Fragment key={t.cot}>
                  <th rowSpan={coHang2 && !moGop ? 2 : 1} colSpan={moP022 ? 2 : moGtDh ? conDh.length : 1}
                    className={`${bang.thC} whitespace-nowrap align-middle ${laTen ? 'sticky left-16 z-20 bg-emerald-300 text-left' : ''} ${t.an ? 'bg-emerald-200' : ''} ${i === chonThang ? 'bg-blue-200' : ''}`}
                    title={`${t.nhan}${t.tren ? ` (${t.tren})` : ''} · cột ${t.cot}${t.an ? ' (đang ẩn trong file)' : ''}`}>
                    {/* Nhãn ngay ngắn: tên + nút cùng 1 dòng; mã (P022) dòng dưới */}
                    <span className={`inline-flex flex-col leading-tight align-middle ${laTen ? 'items-start' : 'items-center'}`}>
                      <span className="inline-flex items-center">
                        {nhan}
                        {!moGop && nutSap}
                        {nhom && (
                          <button type="button" aria-expanded={mo}
                            onClick={() => setMoNhom(s => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                            title={`${mo ? 'Ẩn' : 'Hiện'} cột đang ẩn trong file: ${nhom.map(j => `${td[j].nhan}${td[j].tren ? ` ${td[j].tren}` : ''}`).join(', ')}`}
                            className="ml-1 font-bold text-emerald-800 hover:text-emerald-950">{mo ? '−' : '+'}</button>
                        )}
                        {nutKho}
                      </span>
                      {i === iP022 && <span className="text-[0.6875rem] font-semibold text-slate-600">P022</span>}
                    </span>
                  </th>
                  {coPt && i === iP022 && (
                    <th rowSpan={coHang2 ? 2 : 1} className={`${bang.thC} whitespace-nowrap align-middle`} title="% hoàn thành = P022 ÷ GT ĐƠN HÀNG">
                      % HOÀN THÀNH
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
              const luong = thuTuNhom(d.o[iTen])?.luong;
              const mau = mauLuong(thuTuNhom(d.o[iTen]));
              const dh = so(d.o[iGtDh]), nk = so(d.o[iP022]);
              const ptD = pt(nk, dh), xong = dh > 0 && ptD >= 99.95;
              const ma = iMa >= 0 ? String(d.o[iMa] ?? '').trim() : '';
              return (
              <tr key={`${d.o[iTen] ?? ''}-${r}`} className="group bg-white hover:bg-slate-50" title={mau?.nhan}>
                <td className={`${bang.tdSo} sticky left-0 z-[1] w-16 min-w-[4rem] max-w-[4rem] bg-white group-hover:bg-slate-50 border-l-4 ${luong === 'do' ? 'border-l-red-600' : luong === 'vang' ? 'border-l-amber-500' : 'border-l-transparent'} text-slate-600`}>
                  <span className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${luong === 'do' ? 'bg-red-600' : luong === 'vang' ? 'bg-amber-500' : 'bg-slate-300'}`} aria-hidden />
                  {sttCua.get(d)}
                </td>
                {cotHien.map(i => {
                  const t = td[i], v = d.o[i], laTen = i === iTen;
                  if (i === iP022 && moKho) {
                    return COT_CON.map(([k]) => {
                      const x = khoCua(d)?.[k];
                      return <td key={k} className={`${bang.tdSo} bg-emerald-50/60`}>{kho ? (x != null ? fmtSo(x) : '') : '…'}</td>;
                    }).concat(coPt ? [<td key="pt" className={bang.tdSo}><OPhanTram p={ptD} /></td>] : []);
                  }
                  if (i === iGtDh && moDh) return null;
                  let o: React.ReactNode;
                  let cls = `${bang.tdSo}`;
                  if (laTen) {
                    cls = `${bang.tdB} sticky left-16 z-[1] min-w-[17rem] max-w-[22rem] bg-white group-hover:bg-slate-50`;
                    o = (
                      onXemCt && ma ? (
                        <button type="button" onClick={() => onXemCt(ma, tenGon(v, ma))} title={`${String(v ?? '')} · bấm xem chi tiết theo hạng mục`}
                          className="flex flex-col text-left leading-tight hover:text-blue-700">
                          <span className="text-xs font-medium text-slate-500">{ma}</span>
                          <span className="font-semibold underline decoration-slate-300 decoration-dotted underline-offset-2">{tenGon(v, ma)}</span>
                        </button>
                      ) : (
                        <span className="flex flex-col leading-tight" title={String(v ?? '')}>
                          {ma && <span className="text-xs font-medium text-slate-500">{ma}</span>}
                          <span className="font-semibold">{tenGon(v, ma)}</span>
                        </span>
                      )
                    );
                  } else if (i === iBot) {
                    o = <OBot v={v} xong={xong} />;
                  } else if (i === iGtDh) {
                    o = giaTri(v, t);
                    cls += ' font-semibold';
                  } else if (i === iP022) {
                    o = giaTri(v, t);
                    if (!nk) cls += ' text-slate-400';
                  } else if (i === iCon) {
                    o = giaTri(v, t);
                    cls += ' font-bold';
                  } else if (laCotThang.has(i)) {
                    o = <OThang v={v} max={maxO} />;
                    cls = `${bang.tdB} p-1 text-center tabular-nums ${i === chonThang ? 'bg-blue-50' : ''}`;
                  } else if (i === iGhiChu) {
                    o = v != null && String(v).trim() ? <span className="inline-block rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-semibold uppercase text-slate-700">{String(v)}</span> : '';
                    cls = `${bang.tdB} min-w-[12rem] max-w-[22rem]`;
                  } else {
                    o = giaTri(v, t);
                    cls = t.kieu === 'chu' ? `${bang.tdB} min-w-[12rem] max-w-[22rem] text-sm` : bang.tdSo;
                  }
                  if (typeof v === 'number' && v < 0) cls += ' text-red-600';
                  // Bấm số => chi tiết theo hạng mục của công trình (người dùng 19/11/2026)
                  const bamDuoc = !!onXemHangMuc && !!ma && (i === iGtDh || i === iP022 || i === iCon) && typeof v === 'number';
                  if (bamDuoc) o = <NutSo onClick={() => onXemHangMuc!(ma, tenGon(d.o[iTen], ma))}>{o}</NutSo>;
                  const oPt = <OPhanTram p={ptD} />;
                  return (
                    <React.Fragment key={t.cot}>
                      <td className={cls}>{o}</td>
                      {coPt && i === iP022 && <td className={bang.tdSo}>{onXemHangMuc && ma ? <NutSo onClick={() => onXemHangMuc(ma, tenGon(d.o[iTen], ma))}>{oPt}</NutSo> : oPt}</td>}
                    </React.Fragment>
                  );
                })}
              </tr>
              );
            })}
            {dong.length === 0 && (
              <tr><td colSpan={cotHien.length + 1 + (coPt && cotHien.includes(iP022) ? 1 : 0) + (moKho ? 1 : 0) - (moDh ? 1 : 0)} className={`${bang.tdB} py-8 text-center text-slate-500`}>Không có công trình nào khớp bộ lọc.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============================================================================
// Thành phần hiển thị (mẫu A)
// ============================================================================
const laNhanThang = (n: string) => /^(KHNK\s*T\s*\d{1,2}|\d{2}-\d{2})$/i.test(n.trim());
/** Tên bỏ đuôi mã ("…_CT26-061") vì mã đã hiện dòng trên */
const tenGon = (v: unknown, ma: string) => {
  const s = String(v ?? '');
  if (!ma) return s;
  const bo = s.replace(new RegExp(`[\\s_-]*${ma.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '');
  return bo || s;
};

/** Ô số bấm được: mở chi tiết theo hạng mục */
const NutSo = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} title="Bấm xem chi tiết theo hạng mục"
    className={`${bang.soBam} rounded px-1 hover:bg-blue-50 hover:text-blue-700`}>{children}</button>
);

const TheSo = ({ cham, nhan, so, phu, thanh, mauThanh }: { cham: string; nhan: string; so: number; phu: string; thanh?: number; mauThanh?: string }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
    <p className="flex items-center gap-2 text-sm font-medium text-slate-600"><span className={`h-2 w-2 rounded-full ${cham}`} aria-hidden />{nhan}</p>
    <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{fmtSo(so)} <span className="text-sm font-medium text-slate-500">tỷ</span></p>
    {thanh != null && (
      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-slate-200">
        <span className={`block h-full rounded-full ${mauThanh}`} style={{ width: `${Math.min(100, Math.max(0, thanh))}%` }} />
      </span>
    )}
    <p className="mt-1.5 text-xs text-slate-500">{phu}</p>
  </div>
);

/** % hoàn thành: thanh nhỏ + số; < 30% đỏ, < 70% cam, còn lại xanh */
const OPhanTram = ({ p }: { p: number }) => {
  const mau = p >= 70 ? ['bg-emerald-600', 'text-emerald-700'] : p >= 30 ? ['bg-amber-500', 'text-amber-700'] : ['bg-red-600', 'text-red-600'];
  return (
    <span className="inline-flex items-center gap-2">
      <span className="block h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
        <span className={`block h-full rounded-full ${mau[0]}`} style={{ width: `${Math.min(100, Math.max(0, p))}%` }} />
      </span>
      <span className={`w-12 text-right text-sm font-semibold ${mau[1]}`}>{p.toFixed(1)}%</span>
    </span>
  );
};

/** BOT dự án: đã qua mà chưa nhập xong => nhãn đỏ + "Trễ N ngày"; còn ≤ 30 ngày => "Còn N ngày" cam */
const OBot = ({ v, xong }: { v: unknown; xong: boolean }) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return <span className="text-slate-400">{v ? String(v) : '—'}</span>;
  const ngay = new Date(`${v.slice(0, 10)}T00:00:00`);
  const hn = new Date(); hn.setHours(0, 0, 0, 0);
  const con = Math.round((ngay.getTime() - hn.getTime()) / 86_400_000);
  const tre = !xong && con < 0;
  return (
    <span className="inline-flex flex-col items-start leading-tight">
      <span className={tre ? 'rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-700' : ''}>{fmtNgay(v.slice(0, 10))}</span>
      {tre && <span className="mt-0.5 text-xs font-semibold text-red-600">Trễ {-con} ngày</span>}
      {!xong && con >= 0 && con <= 30 && <span className="mt-0.5 text-xs font-semibold text-amber-600">Còn {con} ngày</span>}
    </span>
  );
};

/** Ô tháng: ô màu xanh đậm dần theo số (so với ô lớn nhất); 0 chữ xám; trống không có kế hoạch */
const MAU_THANG = ['bg-blue-50 text-blue-950', 'bg-blue-100 text-blue-950', 'bg-blue-300 text-blue-950', 'bg-blue-600 text-white'];
const bacThang = (v: number, max: number) => { const p = v / max; return p < 0.1 ? 0 : p < 0.25 ? 1 : p < 0.5 ? 2 : 3; };
const OThang = ({ v, max }: { v: unknown; max: number }) => {
  if (typeof v !== 'number') return null;
  if (Math.abs(v) < 5) return <span className="text-sm text-slate-400">{fmtSo(v)}</span>; // < 0.005 tỷ
  if (v < 0) return <span className="text-red-600">{fmtSo(v)}</span>;
  return <span className={`block rounded-md px-2 py-2 text-sm font-semibold ${MAU_THANG[bacThang(v, max)]}`}>{fmtSo(v)}</span>;
};

const ChuGiai = () => (
  <span className="hidden items-center gap-3 text-xs text-slate-600 2xl:inline-flex">
    <span className="font-semibold">Luồng</span>
    <span className="inline-flex items-center gap-1"><span className="h-3 w-1 rounded bg-red-600" />Đỏ</span>
    <span className="inline-flex items-center gap-1"><span className="h-3 w-1 rounded bg-amber-500" />Vàng</span>
    <span className="inline-flex items-center gap-1"><span className="h-3 w-1 rounded bg-slate-300" />Thường</span>
    <span className="ml-1 font-semibold">KH tháng</span>
    <span className="inline-flex items-center gap-0.5">thấp{MAU_THANG.map(m => <span key={m} className={`h-3 w-4 rounded-sm ${m.split(' ')[0]}`} />)}cao</span>
  </span>
);

type ChuY = { ma: string; ten: string; con: number; luong: 'do' | 'vang' | null; muc: number; xep: number; nhan: string };
/** Khung "Cần chú ý" cạnh biểu đồ: mỗi việc 1 dòng, vạch trái theo mức (đỏ = quá BOT, cam = sắp tới / chưa nhập). Bấm => tìm mã CT trong bảng. */
const CanChuY = ({ ds, onChon, dangTim }: { ds: ChuY[]; onChon: (ma: string) => void; dangTim: string }) => (
  <div className="flex max-h-[19rem] min-h-0 flex-col overflow-hidden rounded-xl xl:h-full xl:max-h-none border border-slate-200 bg-white px-4 py-3 shadow-sm">
    <p className="flex items-center gap-2 font-bold text-slate-900">Cần chú ý
      <span className="rounded-full bg-red-100 px-2 text-xs font-bold text-red-700">{ds.length}</span>
    </p>
    <p className="mt-0.5 truncate text-xs text-slate-500" title="Quá / sắp tới BOT mà %HT thấp, hoặc chưa nhập kho mà KH lớn · bấm để tìm trong bảng">Quá / sắp tới BOT mà %HT thấp, chưa nhập kho mà KH lớn</p>
    {ds.length === 0
      ? <p className="py-6 text-center text-sm text-slate-500">Không có công trình cần chú ý.</p>
      : (
        <ul className="custom-scrollbar mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {ds.map(x => (
            <li key={`${x.ma}-${x.ten}`}>
              <button type="button" onClick={() => x.ma && onChon(x.ma)} title={x.ma ? `Tìm ${x.ma} trong bảng` : undefined}
                className={`flex w-full items-center gap-3 rounded-lg border border-slate-200 border-l-4 px-3 py-1.5 text-left hover:bg-slate-50 ${x.muc === 0 ? 'border-l-red-600' : 'border-l-amber-500'} ${dangTim && dangTim === x.ma ? 'bg-blue-50 ring-1 ring-blue-300' : ''}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{x.ma ? `${x.ma} · ` : ''}{x.ten}</span>
                  <span className={`block text-xs font-semibold ${x.muc === 0 ? 'text-red-600' : 'text-amber-700'}`}>{x.nhan}</span>
                </span>
                <span className="shrink-0 text-right leading-tight">
                  <span className="block font-bold tabular-nums text-slate-900">{fmtSo(x.con)}</span>
                  <span className="block text-[0.6875rem] text-slate-500">tỷ còn lại</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
  </div>
);

type CotBd = { i: number; ngan: string; ten: string; do: number; vang: number; thuong: number; tong: number };
/** Biểu đồ kế hoạch nhập kho theo tháng, cột chồng theo luồng (đỏ / vàng / thường). Bấm cột để lọc bảng theo tháng. */
const BieuDoThang = ({ cot, iThangNay, chon, onChon }: { cot: CotBd[]; iThangNay: number | null; chon: number | null; onChon: (i: number) => void }) => {
  const max = Math.max(1, ...cot.map(c => c.tong));
  const CAO = 96; // px — chiều cao cột lớn nhất (gọn, người dùng 19/11/2026)
  const tongKh = cot.reduce((s, c) => s + c.tong, 0);
  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-bold text-slate-900">Kế hoạch nhập kho theo tháng</p>
        <p className="text-xs text-slate-500">tỷ · tổng <span className="font-bold text-blue-700">{fmtSo(tongKh)}</span> · bấm cột để lọc bảng</p>
        <span className="ml-auto inline-flex items-center gap-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-red-600" />Đỏ</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-amber-500" />Vàng</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-slate-400" />Thường</span>
        </span>
      </div>
      <div className="mt-auto flex items-stretch pt-2">
        <div className="flex flex-1 items-end gap-1 sm:gap-2">
          {cot.map(c => {
            const nay = c.i === iThangNay, dangChon = c.i === chon;
            const h = (c.tong / max) * CAO;
            const phan = (v: number) => (c.tong > 0 ? (v / c.tong) * h : 0);
            return (
              <button key={c.i} type="button" onClick={() => onChon(c.i)}
                title={`${c.ten}: ${fmtSo(c.tong)} tỷ · Đỏ ${fmtSo(c.do)} · Vàng ${fmtSo(c.vang)} · Thường ${fmtSo(c.thuong)}`}
                className={`group flex min-w-0 flex-1 flex-col items-center rounded-lg px-1 pt-1 ${dangChon ? 'bg-blue-50 ring-1 ring-blue-300' : 'hover:bg-slate-50'}`}>
                <span className={`text-xs font-bold tabular-nums ${c.tong ? 'text-slate-800' : 'text-slate-400'}`}>{c.tong ? fmtSo(c.tong) : '0'}</span>
                <span className="mt-1 flex w-full max-w-[2.75rem] flex-col-reverse overflow-hidden rounded-t-md" style={{ height: Math.max(2, h) }}>
                  {c.tong > 0 ? (
                    <>
                      <span className="block w-full bg-red-600" style={{ height: phan(c.do) }} />
                      <span className="block w-full bg-amber-500" style={{ height: phan(c.vang) }} />
                      <span className="block w-full bg-slate-400 group-hover:bg-slate-500" style={{ height: phan(c.thuong) }} />
                    </>
                  ) : <span className="block h-full w-full bg-slate-200" />}
                </span>
                <span className={`mt-1 border-t border-slate-200 pt-1 text-xs ${nay ? 'font-bold text-blue-700' : 'font-semibold text-slate-600'} w-full text-center`}>{c.ngan}</span>
                {/* luôn giữ dòng này (ẩn ở cột khác) để mọi cột chung 1 đường đáy */}
                <span className={`text-[0.6875rem] font-medium text-blue-600 ${nay ? '' : 'invisible'}`} aria-hidden={!nay}>tháng này</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
