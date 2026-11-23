import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, X, ArrowDown, ArrowUp, ArrowUpDown, AlertTriangle } from 'lucide-react';
import { API_BASE_URL } from '../../services/dataService';
import { fmtInt } from '../../utils/format';
import * as bang from '../shared/bangBaoCao';
import { mauLuong, sapXepTheoThuTu, sttHienThi } from './core/thuTuNhom';
import { useThuTuLuongDo } from './useThuTuLuongDo';
import { DashboardFilter } from '../Dashboard/components/shared/DashboardFilter';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
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
/** soApp: GT đơn hàng / đã nhập (hạng mục) / tính phiếu theo mã CT do trang tính từ dòng hạng mục, toàn công trình trừ HỦY
 *  (ưu tiên hơn số file) */
export const KhnkSheet = ({ khuVuc, soApp, onXemCt, onXemHangMuc, onXemKho }: {
  khuVuc?: string; soApp?: Record<string, { dh: number; nk: number; tk?: number; n?: number }>;
  onXemCt?: (ma: string, ten: string) => void; onXemHangMuc?: (ma: string, ten: string) => void;
  /** Bấm số NHẬP / XUẤT / TỒN => các dòng của bảng nhập kho / xuất kho / tồn kho của mã CT */
  onXemKho?: (loai: 'nhap' | 'xuat' | 'ton', ma: string, ten: string) => void;
} = {}) => {
  const [du, setDu] = useState<DuLieu | null>(() => boNho?.du ?? null);
  const [loi, setLoi] = useState<string | null>(null);
  const [tim, setTim] = useState('');
  const [sap, setSap] = useState<Sap>(null);
  const [moNhom, setMoNhom] = useState<Set<number>>(() => new Set());
  // Cột con của NHẬP KHO (P022): Xuất (P025) từ bảng xuất kho, Tồn (P023) từ bảng tồn kho ngày mới nhất, theo mã CT
  const [moKho, setMoKho] = useState(false);
  // Cửa sổ riêng cột CHÊNH (nhập − xuất − tồn tách theo HEX, người dùng 20/11/2026)
  const [xemChenh, setXemChenh] = useState<{ ma: string; ten: string } | null>(null);
  // NHẬP KHO (P022) cũng lấy từ bảng nhập kho (người dùng 19/11/2026: nhập / xuất / tồn theo 3 bảng nhập, xuất, tồn) => tải ngay
  const [kho, setKho] = useState<Record<string, { nhap: number; xuat: number; ton: number }> | null>(null);
  const [ngayTon, setNgayTon] = useState<string | null>(null);
  // Bộ lọc Khu vực / Khách hàng (người dùng 19/11/2026): file KHNK không có => lấy theo mã CT từ bảng sản xuất
  const [ttCt, setTtCt] = useState<Record<string, { kv: string | null; kh: string | null; tksx?: number; nk?: number; dh?: number; n?: number }>>({});
  const [locKh, setLocKh] = useState<string[]>([]);
  // Lọc Khu vực ngay trên bảng (người dùng 19/11/2026) — vẫn theo thêm bộ lọc Khu vực của trang nếu có
  const [locKv, setLocKv] = useState<string[]>([]);
  useEffect(() => {
    fetch(`${API_BASE_URL}/khnk-sheet/thong-tin`).then(r => (r.ok ? r.json() : Promise.reject(new Error(`Lỗi ${r.status}`))))
      .then((d: { ct: Record<string, { kv: string | null; kh: string | null; tksx?: number; nk?: number; dh?: number; n?: number }> }) => setTtCt(d.ct ?? {}))
      .catch(() => setTtCt({}));
  }, []);
  useEffect(() => {
    if (kho) return;
    fetch(`${API_BASE_URL}/khnk-sheet/kho`).then(r => (r.ok ? r.json() : Promise.reject(new Error(`Lỗi ${r.status}`))))
      .then((d: { kho: Record<string, { nhap: number; xuat: number; ton: number }>; ngayTon?: string | null }) => { setKho(d.kho ?? {}); setNgayTon(d.ngayTon ?? null); })
      .catch(() => setKho({}));
  }, [kho]);

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
    // Cột ẩn trùng tên 1 cột đang hiện (file có GT ĐƠN HÀNG / P022 bản cũ ẩn ngay sau BOT DỰ ÁN) => không cho mở: bấm + ở
    // BOT DỰ ÁN ra 2 cột P022 gây rối (người dùng 20/11/2026); số đúng đã ở cột đang hiện
    const tenHien = new Set(td.filter(t => !t.an).map(t => t.nhan.trim().toUpperCase()));
    td.forEach((t, i) => {
      if (!t.an) { truoc = i; return; }
      if (tenHien.has(t.nhan.trim().toUpperCase())) return;
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
  // + chenh = nhập − xuất − tồn: hàng đã nhập mà không thấy trong bảng xuất lẫn tồn (người dùng 20/11/2026: nhập ≠ xuất + tồn)
  const khoCua = (d: Dong) => {
    const k = kho && iMa >= 0 ? kho[String(d.o[iMa] ?? '').trim().toUpperCase()] : undefined;
    return k ? { ...k, chenh: k.nhap - k.xuat - k.ton } : undefined;
  };
  const COT_CON = [['xuat', 'XUẤT KHO', 'P025'], ['ton', 'TỒN KHO', 'P023'], ['chenh', 'CHÊNH', 'NHẬP − XUẤT − TỒN']] as const;
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
    // NHẬP KHO (P022) = Σ bảng nhập kho theo mã CT (/kho); GT CÒN LẠI = GT ĐƠN HÀNG − nhập kho đó.
    const iP = timCot('P022'), iCl = timCot('GT CÒN LẠI');
    // Có soApp (trang Tổng quan công trình): GT ĐƠN HÀNG theo dòng hạng mục của trang, toàn công trình trừ HỦY (19/11/2026)
    const coApp = !!soApp && Object.keys(soApp).length > 0;
    if (iMa >= 0 && iGtDh >= 0 && (coApp || Object.keys(ttCt).length)) {
      ds = ds.map(d => {
        const ma = String(d.o[iMa] ?? '').trim().toUpperCase();
        const tt = ttCt[ma];
        // Trang thiếu dòng hạng mục của mã (chưa tới nửa số dòng máy chủ — vd. CT24-021 đã đóng, trang chỉ có 1 / 137 HEX)
        // => dùng số máy chủ. Lệch ít (file công trình HỦY thêm vài HEX) vẫn theo trang để khớp cửa sổ hạng mục.
        const sa0 = coApp ? soApp![ma] : undefined;
        const thieu = !!sa0 && laThieu(sa0.n, tt?.n);
        const sa = sa0 && !thieu ? sa0 : tt?.dh != null && (thieu || !sa0) && coApp ? { dh: tt.dh, nk: tt.nk ?? 0, tk: tt.tksx, n: tt.n } : sa0;
        const o = [...d.o];
        if (sa) o[iGtDh] = sa.dh;
        const dh = typeof o[iGtDh] === 'number' ? o[iGtDh] as number : 0;
        // Nhập kho theo bảng nhập kho (mã không có dòng nhập => 0); bảng chưa tải xong thì tạm số hạng mục / máy chủ
        const nk = kho ? (kho[ma]?.nhap ?? 0) : sa ? sa.nk : tt?.nk;
        // Đã TKSX cùng phạm vi với đơn hàng (soApp.tk); chưa có thì số máy chủ (mọi IPO trừ HỦY)
        const coTk = sa?.tk != null || !!tt;
        const tk = sa?.tk ?? tt?.tksx ?? 0;
        if (coTk && iDa >= 0) o[iDa] = tk;
        if (coTk && iChua >= 0) o[iChua] = dh - tk;
        if (nk != null && iP >= 0) {
          o[iP] = nk;
          if (iCl >= 0) o[iCl] = Math.max(dh - nk, 0);
        }
        return { ...d, o };
      });
    }
    return sapXepTheoThuTu(ds, d => d.o[iTen], thuTuNhom);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [du, td, iTen, thuTuNhom, ttCt, iMa, iGtDh, soApp, kho]);
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
  // Cột tháng: mặc định chỉ hiện tháng hiện tại, bấm + ở cột đó để hiện các tháng còn lại (người dùng 19/11/2026)
  const [moThang, setMoThang] = useState(false);
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
  // Công trình đã nhập xong chưa: theo hạng mục (soApp: GT đơn hàng − đã nhập của từng hạng mục) — KHÔNG theo % hoàn thành
  // của bảng vì NHẬP KHO lấy từ bảng nhập kho (cả phần nhập của hạng mục HỦY, nhập vượt) nên có thể ≥ 100% khi còn hạng mục
  // chưa nhập => vẫn phải báo "Trễ BOT" (19/11/2026).
  // Không có soApp => theo % của bảng.
  const conLaiHm = (d: Dong): number | null => {
    const ma = String(iMa >= 0 ? d.o[iMa] ?? '' : '').trim().toUpperCase();
    const sa = soApp?.[ma], tt = ttCt[ma];
    if (sa && !laThieu(sa.n, tt?.n)) return Math.max(sa.dh - sa.nk, 0);
    if (soApp && tt?.dh != null) return Math.max(tt.dh - (tt.nk ?? 0), 0);
    return null;
  };
  const xongCua = (d: Dong) => {
    const cl = conLaiHm(d);
    if (cl != null) return cl < 5;   // < 0.005 tỷ
    const dh = so(d.o[iGtDh]);
    return dh > 0 && so(d.o[iP022]) / dh >= 0.9995;
  };
  const canChuY = useMemo(() => {
    const hn = new Date(); hn.setHours(0, 0, 0, 0);
    const ra: ChuY[] = [];
    for (const d of loc) {
      const dh = so(d.o[iGtDh]), nk = so(d.o[iP022]), p = dh > 0 ? (nk / dh) * 100 : 0;
      if (xongCua(d)) continue;
      const ma = iMa >= 0 ? String(d.o[iMa] ?? '').trim() : '';
      const chung = { ma, ten: tenGon(d.o[iTen], ma), con: conLaiHm(d) ?? (iCon >= 0 ? so(d.o[iCon]) : dh - nk), luong: thuTuNhom(d.o[iTen])?.luong ?? null };
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc, iGtDh, iP022, iMa, iTen, iCon, iBot, thang, thuTuNhom, soApp]);
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
  const dangLoc = !!(tim || khuVuc || locKv.length || locKh.length);
  // Cột Mã CT gộp vào ô công trình (mã nhỏ ở trên, tên ở dưới — mẫu A)
  const anThang = !moThang && iThangNay != null;
  const cotHien = hien.filter(i => i !== iMa && !(anThang && laCotThang.has(i) && i !== iThangNay && i !== chonThang));

  return (
    <div className="space-y-3">
      {xemChenh && <CuaSoChenh ma={xemChenh.ma} ten={xemChenh.ten} onClose={() => setXemChenh(null)} />}
      {/* Thẻ số (mẫu A) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {/* Dòng phụ dễ hiểu (người dùng 20/11/2026): bỏ thanh mảnh, ghi % đậm + "của …" bằng lời */}
        <TheSo cham="bg-slate-900" nhan="Tổng GT đơn hàng" so={kpi.dh} phu={<>{fmtInt(loc.length)} công trình{dangLoc ? ' (đang lọc)' : ''}</>} />
        <TheSo cham="bg-emerald-600" nhan="Đã nhập kho (P022)" so={kpi.nk}
          phu={<>Đạt <b className="text-emerald-700">{pt(kpi.nk, kpi.dh).toFixed(1)}%</b> tổng đơn hàng</>} />
        <TheSo cham="bg-amber-500" nhan="Còn lại phải nhập" so={kpi.con}
          phu={<>Còn <b className="text-amber-700">{pt(kpi.con, kpi.dh).toFixed(1)}%</b> tổng đơn hàng</>} />
        {thang0 && <TheSo cham="bg-blue-600" nhan={`KH nhập kho ${thang0.ten}`} so={thang0.tong}
          phu={<>Bằng <b className="text-blue-700">{pt(thang0.tong, kpi.con).toFixed(1)}%</b> phần còn phải nhập</>} />}
        {thang1 && <TheSo cham="bg-blue-600" nhan={`KH nhập kho ${thang1.ten}`} so={thang1.tong}
          phu={<>Bằng <b className="text-blue-700">{pt(thang1.tong, kpi.con).toFixed(1)}%</b> phần còn phải nhập</>} />}
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
          {/* Bỏ mọi lọc của bảng 1 lần (người dùng 19/11/2026): khu vực, khách hàng, ô tìm, cột tháng đang chọn */}
          {(locKv.length > 0 || locKh.length > 0 || tim || chonThang != null) && (
            <button type="button" onClick={() => { setLocKv([]); setLocKh([]); setTim(''); setChonThang(null); }}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 hover:bg-red-100">
              <X className="h-4 w-4" aria-hidden />Xóa lọc
            </button>
          )}
        </div>
      </div>

      <div className={`${bang.khung} max-h-[calc(100vh-14rem)] min-h-[20rem] rounded-lg`}>
        <table className={bang.table}>
          <thead className={`${bang.thead} text-xs uppercase`}>
            {/* Xuất / tồn nằm TRONG nhập (người dùng 19/11/2026): thu => 1 cột NHẬP KHO (P022); mở => ô NHẬP KHO (P022) trải
                2 cột con Xuất (P025) / Tồn (P023), không còn cột số nhập riêng */}
            <tr>
              <th rowSpan={coHang2 ? 2 : 1} className={`${bang.thC} sticky left-0 z-30 w-16 min-w-[4rem] max-w-[4rem] bg-emerald-300 align-middle`} title="STT theo danh sách Luồng đỏ (Setup → Nhóm công trình); ngoài luồng đánh tiếp">
                <Nhan2Dong ten="STT" />
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
                  <th rowSpan={coHang2 && !moGop ? 2 : 1} colSpan={moP022 ? COT_CON.length : moGtDh ? conDh.length : 1}
                    className={`${bang.thC} whitespace-nowrap align-middle ${laTen ? 'sticky left-16 z-20 bg-emerald-300 text-left' : ''} ${t.an ? 'bg-emerald-300' : ''} ${i === chonThang ? 'bg-blue-200' : ''}`}
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
                        {i === iThangNay && thang.length > 1 && (
                          <button type="button" aria-expanded={moThang}
                            onClick={e => { e.stopPropagation(); setMoThang(m => !m); }}
                            title={moThang ? 'Chỉ hiện tháng hiện tại' : `Hiện các tháng còn lại (${thang.filter(x => x.i !== iThangNay).map(x => x.ngan).join(', ')})`}
                            className="ml-1 font-bold text-emerald-800 hover:text-emerald-950">{moThang ? '−' : '+'}</button>
                        )}
                      </span>
                      {/* Mọi cột cùng 2 dòng (dòng mã ẩn nếu không có) => tên các cột thẳng 1 hàng (19/11/2026) */}
                      <span className={`text-[0.6875rem] font-semibold text-slate-600 ${i === iP022 ? '' : 'invisible'}`} aria-hidden={i !== iP022}>{i === iP022 ? 'P022' : '·'}</span>
                    </span>
                  </th>
                  {coPt && i === iP022 && (
                    <th rowSpan={coHang2 ? 2 : 1} className={`${bang.thC} whitespace-nowrap align-middle`} title="% hoàn thành = P022 ÷ GT ĐƠN HÀNG">
                      <Nhan2Dong ten="% HOÀN THÀNH" />
                    </th>
                  )}
                  </React.Fragment>
                );
              })}
            </tr>
            {coHang2 && (
              <tr>
                {conDh.map(j => (
                  <th key={td[j].cot} className={`${bang.thC} whitespace-nowrap align-middle bg-emerald-300`}
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
                  <th key={k} className={`${bang.thC} whitespace-nowrap align-middle bg-emerald-300`}
                    title={k === 'xuat' ? 'Xuất kho lũy kế: tổng thành tiền bảng xuất kho theo mã công trình (triệu đồng)'
                      : k === 'chenh' ? 'Đã nhập mà không thấy trong xuất kho lẫn tồn kho: xuất trước 01/2025 (bảng xuất kho chỉ có từ 01/2025), giao không qua phiếu xuất, dòng mang mã khác… Bấm số để xem hạng mục'
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
              const ptD = pt(nk, dh), xong = xongCua(d);
              const ma = iMa >= 0 ? String(d.o[iMa] ?? '').trim() : '';
              return (
              <tr key={`${d.o[iTen] ?? ''}-${r}`} className="group bg-white hover:bg-slate-50" title={mau?.nhan}>
                <td className={`${bang.tdSo} sticky left-0 z-[1] w-16 min-w-[4rem] max-w-[4rem] bg-white group-hover:bg-slate-50 border-l-4 ${luong === 'do' ? 'border-l-red-600' : luong === 'vang' ? 'border-l-yellow-400' : 'border-l-emerald-400'} text-slate-600`}>
                  <span className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${luong === 'do' ? 'bg-red-600' : luong === 'vang' ? 'bg-yellow-400' : 'bg-emerald-400'}`} aria-hidden />
                  {sttCua.get(d)}
                </td>
                {cotHien.map(i => {
                  const t = td[i], v = d.o[i], laTen = i === iTen;
                  if (i === iP022 && moKho) {
                    return COT_CON.map(([k]) => {
                      const x = khoCua(d)?.[k];
                      const so = kho ? (x != null ? fmtSo(x) : '') : '…';
                      if (k === 'chenh') {
                        // Chênh bấm => danh sách hạng mục (cột Chênh của cửa sổ chỉ ra HEX lệch); âm = xuất + tồn vượt nhập
                        const lech = x != null && Math.abs(x) >= 5; // ≥ 0.005 tỷ
                        return <td key={k} className={`${bang.tdSo} bg-emerald-50/60 ${x != null && x < 0 && lech ? 'text-red-600' : lech ? 'font-semibold text-amber-700' : 'text-slate-400'}`}>
                          {lech && ma ? <NutSo tieuDe="Bấm xem chênh theo từng HEX (nhập − xuất − tồn)" onClick={() => setXemChenh({ ma, ten: tenGon(d.o[iTen], ma) })}>{so}</NutSo> : so}</td>;
                      }
                      return <td key={k} className={`${bang.tdSo} bg-emerald-50/60`}>{x != null && onXemKho && ma ? <NutSo tieuDe={`Bấm xem các dòng ${k === 'xuat' ? 'xuất kho' : 'tồn kho'}`} onClick={() => onXemKho(k, ma, tenGon(d.o[iTen], ma))}>{so}</NutSo> : so}</td>;
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
                  const bamDuoc = !!onXemHangMuc && !!ma && (i === iGtDh || i === iCon || laConDh.has(i)) && typeof v === 'number';
                  if (bamDuoc) o = <NutSo onClick={() => onXemHangMuc!(ma, tenGon(d.o[iTen], ma))}>{o}</NutSo>;
                  else if (i === iP022 && onXemKho && ma && typeof v === 'number')
                    o = <NutSo tieuDe="Bấm xem các dòng nhập kho" onClick={() => onXemKho('nhap', ma, tenGon(d.o[iTen], ma))}>{o}</NutSo>;
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
              <tr><td colSpan={cotHien.length + 1 + (coPt && cotHien.includes(iP022) ? 1 : 0) + (moKho ? COT_CON.length - 1 : 0) - (moDh ? 1 : 0)} className={`${bang.tdB} py-8 text-center text-slate-500`}>Không có công trình nào khớp bộ lọc.</td></tr>
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
/** Trang có chưa tới nửa số dòng (bỏ HỦY) máy chủ của 1 mã CT => coi như thiếu dữ liệu */
const laThieu = (nTrang: number | undefined, nMayChu: number | undefined) => nMayChu != null && (nTrang ?? 0) * 2 < nMayChu;
const laNhanThang = (n: string) => /^(KHNK\s*T\s*\d{1,2}|\d{2}-\d{2})$/i.test(n.trim());
/** Tên bỏ đuôi mã ("…_CT26-061") vì mã đã hiện dòng trên */
const tenGon = (v: unknown, ma: string) => {
  const s = String(v ?? '');
  if (!ma) return s;
  const bo = s.replace(new RegExp(`[\\s_-]*${ma.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '');
  return bo || s;
};

/** Nhãn tiêu đề 2 dòng, dòng dưới ẩn — thẳng hàng với cột có mã (NHẬP KHO / P022) */
const Nhan2Dong = ({ ten }: { ten: string }) => (
  <span className="inline-flex flex-col items-center leading-tight align-middle">
    <span>{ten}</span>
    <span className="invisible text-[0.6875rem] font-semibold" aria-hidden>·</span>
  </span>
);

/** Cửa sổ cột CHÊNH: nhập − xuất − tồn của 1 công trình tách theo HEX, cùng 3 bảng kho với cột (tổng = số trên bảng) */
type DongChenh = { hex: string; hangMuc: string | null; ipo: string | null; nhap: number; xuat: number; ton: number; chenh: number };
const tr1 = (v: number) => (Math.abs(v) < 0.05 ? '' : v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const CuaSoChenh = ({ ma, ten, onClose }: { ma: string; ten: string; onClose: () => void }) => {
  const [du, setDu] = useState<{ rows: DongChenh[]; ngayTon: string | null } | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [chiLech, setChiLech] = useState(true);
  useEffect(() => {
    fetch(`${API_BASE_URL}/khnk-sheet/kho-chenh?ma=${encodeURIComponent(ma)}`)
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Lỗi ${r.status}`); return j; })
      .then(setDu).catch(e => setLoi(e instanceof Error ? e.message : String(e)));
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [ma, onClose]);
  const tat = du?.rows ?? [];
  const ds = chiLech ? tat.filter(x => Math.abs(x.chenh) >= 0.05) : tat;   // ≥ 0.05 triệu
  const tong = (k: 'nhap' | 'xuat' | 'ton' | 'chenh') => tat.reduce((s0, x) => s0 + x[k], 0);
  const duong = tat.filter(x => x.chenh >= 0.05), am = tat.filter(x => x.chenh <= -0.05);
  return (
    <div className={bang.cuaSoNen} onClick={onClose}>
      <div className={bang.cuaSoKhung} onClick={e => e.stopPropagation()}>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-slate-900">Chênh nhập − xuất − tồn · {ma}</p>
            <p className="truncate text-sm text-slate-500">{ten}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100" aria-label="Đóng">×</button>
        </div>
        {loi ? <p className="text-sm text-red-600">{loi}</p> : !du ? <p className="text-sm text-slate-500">Đang tính…</p> : (<>
          <div className="grid gap-3 sm:grid-cols-4">
            {([['Nhập kho (P022)', tong('nhap'), 'text-emerald-700'], ['Xuất kho (P025)', tong('xuat'), 'text-slate-900'],
              [`Tồn kho (P023) ${du.ngayTon ? du.ngayTon.split('-').reverse().join('/') : ''}`, tong('ton'), 'text-slate-900'], ['Chênh', tong('chenh'), 'text-amber-700']] as const).map(([n, v, m]) => (
              <div key={n} className="rounded-xl border border-slate-200 px-4 py-2">
                <p className="text-xs font-bold uppercase text-slate-500">{n}</p>
                <p className={`text-2xl font-extrabold tabular-nums ${m}`}>{fmtSo(v)} <span className="text-sm font-semibold text-slate-500">tỷ</span></p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <span><b className="text-amber-700">{duong.length}</b> HEX đã nhập mà không thấy trong xuất / tồn ({fmtSo(duong.reduce((s0, x) => s0 + x.chenh, 0))} tỷ)</span>
            {am.length > 0 && <span>· <b className="text-red-600">{am.length}</b> HEX xuất + tồn vượt nhập ({fmtSo(am.reduce((s0, x) => s0 + x.chenh, 0))} tỷ)</span>}
            <label className="ml-auto inline-flex items-center gap-1.5"><input type="checkbox" checked={chiLech} onChange={e => setChiLech(e.target.checked)} className="h-3.5 w-3.5" />Chỉ HEX có chênh</label>
          </div>
          <div className={`${bang.khung} min-h-0 flex-1`}>
            <table className={`${bang.table} ${bang.cuaSoBang}`}>
              <thead className={bang.thead}><tr>
                {['STT', 'HEX', 'Hạng mục', 'Tình trạng IPO', 'Nhập (triệu)', 'Xuất (triệu)', 'Tồn (triệu)', 'Chênh (triệu)'].map(h => <th key={h} className={`${bang.thC} whitespace-nowrap`}>{h}</th>)}
              </tr></thead>
              <tbody>{ds.map((x, i) => (
                <tr key={x.hex} className="hover:bg-slate-50">
                  <td className={bang.tdSo}>{i + 1}</td>
                  <td className={bang.tdSo}>{x.hex}</td>
                  <td className={`${bang.tdB} min-w-[16rem]`}>{x.hangMuc ?? ''}</td>
                  <td className={`${bang.tdB} whitespace-nowrap text-sm`}>{x.ipo ?? <span className="text-slate-400">không có trong bảng sản xuất</span>}</td>
                  <td className={bang.tdSo}>{tr1(x.nhap)}</td>
                  <td className={bang.tdSo}>{tr1(x.xuat)}</td>
                  <td className={bang.tdSo}>{tr1(x.ton)}</td>
                  <td className={`${bang.tdSo} font-semibold ${x.chenh < 0 ? 'text-red-600' : 'text-amber-700'}`}>{tr1(x.chenh)}</td>
                </tr>))}
                {!ds.length && <tr><td colSpan={8} className={`${bang.tdB} py-6 text-center text-slate-500`}>Không có HEX nào chênh.</td></tr>}
              </tbody>
              <tfoot className={bang.tfoot}><tr>
                <td colSpan={4} className={`${bang.tdB} text-center`}>TỔNG ({ds.length} HEX)</td>
                {(['nhap', 'xuat', 'ton', 'chenh'] as const).map(k => <td key={k} className={bang.tdSo}>{tr1(ds.reduce((s0, x) => s0 + x[k], 0))}</td>)}
              </tr></tfoot>
            </table>
          </div>
          <p className="text-xs text-slate-500">Chênh dương = đã nhập kho mà không thấy dòng xuất lẫn tồn (xuất trước 01/2025, giao không qua phiếu xuất, dòng xuất / tồn mang mã khác…). Chênh âm = xuất + tồn vượt nhập.</p>
        </>)}
      </div>
    </div>
  );
};

/** Ô số bấm được: mở chi tiết theo hạng mục */
const NutSo = ({ onClick, children, tieuDe = 'Bấm xem chi tiết theo hạng mục' }: { onClick: () => void; children: React.ReactNode; tieuDe?: string }) => (
  <button type="button" onClick={onClick} title={tieuDe}
    className={`${bang.soBam} rounded px-1 hover:bg-blue-50 hover:text-blue-700`}>{children}</button>
);

const TheSo = ({ cham, nhan, so, phu }: { cham: string; nhan: string; so: number; phu: React.ReactNode }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
    <p className="flex items-center gap-2 text-sm font-semibold text-slate-700"><span className={`h-2.5 w-2.5 rounded-full ${cham}`} aria-hidden />{nhan}</p>
    <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{fmtSo(so)} <span className="text-sm font-medium text-slate-500">tỷ</span></p>
    <p className="mt-1 text-sm text-slate-600">{phu}</p>
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
    {/* Chú thích luồng đã có ở biểu đồ tháng ngay trên — không lặp (người dùng 20/11/2026) */}
    <span className="font-semibold">KH tháng</span>
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
/** Biểu đồ kế hoạch nhập kho theo tháng: cột chồng theo luồng (đỏ / vàng / thường) + 3 đường diễn biến giá trị từng luồng qua
 *  các tháng (người dùng 20/11/2026). Bấm cột để lọc bảng theo tháng. */
const MAU_BD = {
  do: { cot: '#ef4444', duong: '#b91c1c', ten: 'Luồng đỏ' },
  vang: { cot: '#fde047', duong: '#ca8a04', ten: 'Luồng vàng' },
  thuong: { cot: '#34d399', duong: '#047857', ten: 'Luồng thường' },
} as const;
const KHOA_BD = ['do', 'vang', 'thuong'] as const;
const BieuDoThang = ({ cot, iThangNay, chon, onChon }: { cot: CotBd[]; iThangNay: number | null; chon: number | null; onChon: (i: number) => void }) => {
  const tongKh = cot.reduce((s, c) => s + c.tong, 0);
  // Rối khi chồng cột + đường (người dùng 20/11/2026) => chọn 1 trong 2 kiểu xem: cột chồng (mặc định) / đường diễn biến
  const [kieu, setKieu] = useState<'cot' | 'duong'>('cot');
  const du = cot.map(c => ({ ...c, nay: c.i === iThangNay, dangChon: c.i === chon }));
  const mo = (c: CotBd) => (chon != null && c.i !== chon ? 0.35 : 1);
  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-bold text-slate-900">Kế hoạch nhập kho theo tháng</p>
        <p className="text-xs text-slate-500">tỷ · tổng <span className="font-bold text-blue-700">{fmtSo(tongKh)}</span> · bấm cột để lọc bảng</p>
        <span className="ml-auto inline-flex flex-wrap items-center gap-3 text-xs text-slate-600">
          {KHOA_BD.map(k => (
            <span key={k} className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm" style={{ background: kieu === 'duong' ? MAU_BD[k].duong : MAU_BD[k].cot }} />{MAU_BD[k].ten}</span>
          ))}
          <span className="inline-flex overflow-hidden rounded-md border border-slate-300" role="group" aria-label="Kiểu biểu đồ">
            {([['cot', 'Cột'], ['duong', 'Đường diễn biến']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setKieu(k)} aria-pressed={kieu === k}
                className={`px-2 py-0.5 font-semibold ${kieu === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{l}</button>
            ))}
          </span>
        </span>
      </div>
      <div className="mt-1 min-h-[9rem] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={du} margin={{ top: 18, right: 8, left: 8, bottom: 4 }} barCategoryGap="28%"
            onClick={(e: { activeTooltipIndex?: number } | null) => { const x = e?.activeTooltipIndex; if (x != null && du[x]) onChon(du[x].i); }}>
            <XAxis dataKey="ngan" axisLine={{ stroke: '#e2e8f0' }} tickLine={false} interval={0} height={kieu === 'duong' ? 54 : 40}
              padding={kieu === 'duong' ? { left: 36, right: 36 } : undefined}
              tick={(t: { x?: number | string; y?: number | string; payload?: { value?: string; index?: number } }) => {
                const c = du[t.payload?.index ?? -1];
                return (
                  <g transform={`translate(${Number(t.x)},${Number(t.y)})`}>
                    <text y={10} textAnchor="middle" fontSize={12} fontWeight={c?.nay || c?.dangChon ? 700 : 600} fill={c?.nay ? '#1d4ed8' : '#475569'}>{t.payload?.value}</text>
                    {/* Kiểu đường: tổng tháng ghi ngay dưới tên tháng (thay cột tổng — rối, người dùng 20/11/2026) */}
                    {kieu === 'duong' && <text y={25} textAnchor="middle" fontSize={12} fontWeight={700} fill="#0f172a">{c && c.tong ? `Σ ${fmtSo(c.tong)}` : 'Σ 0'}</text>}
                    {c?.nay && <text y={kieu === 'duong' ? 39 : 24} textAnchor="middle" fontSize={10} fill="#2563eb">tháng này</text>}
                  </g>
                );
              }} />
            <YAxis hide domain={[0, (m: number) => (m > 0 ? m * 1.08 : 1)]} />
            <Tooltip cursor={{ fill: '#f1f5f9' }} content={({ active, payload }) => {
              const c = active ? (payload?.[0]?.payload as (typeof du)[number] | undefined) : undefined;
              if (!c) return null;
              return (
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                  <p className="font-bold text-slate-900">{c.ten}: {fmtSo(c.tong)} tỷ</p>
                  {KHOA_BD.map(k => (
                    <p key={k} className="flex items-center gap-1.5 tabular-nums text-slate-700">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: MAU_BD[k].cot }} />{MAU_BD[k].ten}: <b>{fmtSo(c[k])}</b>
                      {c.tong > 0 && <span className="text-slate-500">({((c[k] / c.tong) * 100).toFixed(0)}%)</span>}
                    </p>
                  ))}
                  <p className="mt-1 text-slate-400">Bấm để lọc bảng theo tháng này</p>
                </div>
              );
            }} />
            {kieu === 'cot' && KHOA_BD.map((k, j) => (
              <Bar key={k} dataKey={k} stackId="l" fill={MAU_BD[k].cot} maxBarSize={48} isAnimationActive={false} className="cursor-pointer"
                radius={j === 2 ? [6, 6, 0, 0] : 0}>
                {du.map(c => <Cell key={c.i} fillOpacity={mo(c)} />)}
                {j === 2 && (
                  <LabelList dataKey="tong" content={(lp: { x?: number | string; y?: number | string; width?: number | string; index?: number }) => {
                    const c = du[lp.index ?? -1];
                    if (!c) return null;
                    return <text x={Number(lp.x) + Number(lp.width) / 2} y={Number(lp.y) - 6} textAnchor="middle" fontSize={12} fontWeight={700}
                      fill={c.tong ? '#1e293b' : '#94a3b8'}>{c.tong ? fmtSo(c.tong) : '0'}</text>;
                  }} />
                )}
              </Bar>
            ))}
            {kieu === 'duong' && KHOA_BD.map(k => (
              <Line key={`d-${k}`} dataKey={k} type="linear" stroke={MAU_BD[k].duong} strokeWidth={2.5} isAnimationActive={false}
                dot={{ r: 4, fill: MAU_BD[k].duong, stroke: '#fff', strokeWidth: 1.5 }} activeDot={{ r: 5 }} legendType="none">
                <LabelList dataKey={k} position="top" offset={8} fontSize={11} fontWeight={600} fill={MAU_BD[k].duong}
                  formatter={(v: number) => (v > 0 ? fmtSo(v) : '')} />
              </Line>
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
