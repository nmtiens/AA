import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Download, ShoppingCart, FileText, ClipboardList, Package, PackageOpen, Boxes } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, Cell, CartesianGrid, LabelList } from 'recharts';
import { fetchOverviewSummary, fetchYearPlanActual, fetchKhsxNhapKhoSummary, type OverviewSummary, type YearPlanActualData } from '../../../../services/dataService';
import { formatTrieuAsTy, formatTy } from '../../../../utils/money';
import { parseVNDate, toISODateLocal } from '../../utils/dateHelpers';
import { DashboardFilter } from '../shared/DashboardFilter';

// ============================================================================
// Đầu trang Tổng quan theo ảnh mẫu 2 (docs/designs/figma-thiet-ke-lai/2): chọn kỳ Hôm nay / 7 ngày / Tháng này;
// 4 thẻ (Đơn hàng mới, Đã tính phiếu, Nhập kho, Vướng mắc) có so với kỳ trước; biểu đồ nhập kho theo ngày
// với mức cần mỗi ngày để đạt KH năm; "Cần chú ý hôm nay". Chọn kỳ cũng đặt "Ngày báo cáo" chung của trang
// (dải Dòng chảy + cửa sổ chi tiết xem cùng kỳ).
// ============================================================================

export type KyXem = 'ngay' | 'tuan' | 'thang' | 'tuy';
export type KhoaChiTiet = 'order' | 'tkbv' | 'pthsp' | 'inventory' | 'export' | 'stock';

interface Props {
  unifiedDateOptions: string[];
  setOverviewDateFilters: (v: string[]) => void;
  /** Bộ lọc công trình / xưởng đang áp (giống dải Dòng chảy) */
  congTrinh: string[];
  xuong: string[];
  vm: { open: number; overdue: number };
  /** Doanh số năm (tỷ) */
  namLabel: string;
  thucHienNam: number;
  keHoachNam: number;
  phanTramNam: number;
  chuaTheSX: number; // triệu
  vuongSL: number;
  chuaTrienKhai: number;
  /** Giá trị (triệu đồng) đơn hàng đang ở P001 — thanh "P001. Chưa triển khai" của phễu; null = phễu đang đếm hạng mục */
  giaTriP001?: number | null;
  diemNghen?: { name: string; count: number };
  onMoChiTiet: (k: KhoaChiTiet) => void;
  onMoTab: (t: 'sx' | 'nghen' | 'kh') => void;
  onThucHienNam?: () => void;
  /** Bấm "Kế hoạch": biểu đồ nhập kho theo năm kèm cột kế hoạch năm */
  onKeHoachNam?: () => void;
  /** Số lượng / Giá trị (dùng chung với cửa sổ chi tiết) */
  metric: 'COUNT' | 'SUM';
  setMetric: (m: 'COUNT' | 'SUM') => void;
  onXuatExcel: () => void;
  /** Mốc lũy kế từng quý (tỷ) cho thanh tiến độ năm */
  quy: { q1: number; q2: number; q3: number; q4: number };
  /** Tồn kho (ảnh chụp gần ngày xem nhất) theo metric đang chọn + cuối tháng trước */
  tonKho: number;
  tonNgay: Date | null;
  tonCuoiThangTruoc: { count: number; value: number; date?: unknown };
}

const ngayNgan = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
const themNgay = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// Mẫu thẻ theo trang Tổng quan cũ: nền nhạt riêng từng bước, số trong kỳ to, lũy kế tháng này / tháng trước
const MAU_THE = {
  order: { Icon: ShoppingCart, nen: 'border-rose-100 bg-rose-50/70', o: 'bg-rose-100 text-rose-600', chu: 'text-rose-700', nhat: 'text-rose-500', dv: 'đơn hàng (HEX)' },
  tkbv: { Icon: FileText, nen: 'border-sky-100 bg-sky-50/70', o: 'bg-sky-100 text-sky-600', chu: 'text-sky-700', nhat: 'text-sky-500', dv: 'bản vẽ (items)' },
  pthsp: { Icon: ClipboardList, nen: 'border-violet-100 bg-violet-50/70', o: 'bg-violet-100 text-violet-600', chu: 'text-violet-700', nhat: 'text-violet-500', dv: 'phiếu (items)' },
  inventory: { Icon: Package, nen: 'border-emerald-100 bg-emerald-50/70', o: 'bg-emerald-100 text-emerald-600', chu: 'text-emerald-700', nhat: 'text-emerald-600', dv: 'items' },
  export: { Icon: PackageOpen, nen: 'border-amber-100 bg-amber-50/70', o: 'bg-amber-100 text-amber-600', chu: 'text-amber-700', nhat: 'text-amber-600', dv: 'items' },
  stock: { Icon: Boxes, nen: 'border-slate-200 bg-white', o: 'bg-slate-100 text-slate-600', chu: 'text-slate-900', nhat: 'text-slate-500', dv: 'items' },
} as const;

const LUONG: Array<{ k: 'order' | 'tkbv' | 'pthsp' | 'inventory' | 'export'; ten: string; ma: string; dv: string; hint: string }> = [
  { k: 'order', ten: 'Đơn hàng mới', ma: 'P001', dv: 'đơn', hint: 'Đơn hàng có ngày nhận từ PM trong kỳ (không tính đơn HỦY)' },
  { k: 'tkbv', ten: 'Triển khai BV', ma: 'P002', dv: 'bản vẽ', hint: 'Bản vẽ đã triển khai (TKBV) trong kỳ' },
  { k: 'pthsp', ten: 'Tính phiếu', ma: 'P012', dv: 'phiếu', hint: 'Phiếu đã tính (PTHSP) trong kỳ' },
  { k: 'inventory', ten: 'Nhập kho', ma: 'P022', dv: 'mục', hint: 'Hạng mục nhập kho trong kỳ' },
  { k: 'export', ten: 'Xuất kho', ma: 'P025', dv: 'mục', hint: 'Hạng mục xuất kho trong kỳ' },
];

// Xưởng làm cả Chủ nhật (nhập kho có số mọi ngày, kể cả CN) => ngày làm việc = mọi ngày. Trước tính T2–T7 nên mức
// cần mỗi ngày cao hơn thực (vd KH T9 xưởng 4A 47,52 tỷ / 26 ngày = 1,83 trong khi nhập kho có 30 ngày)
const LAM_CHU_NHAT = true;
const laNgayLam = (d: Date) => LAM_CHU_NHAT || d.getDay() !== 0;
const NGAY_TUAN = LAM_CHU_NHAT ? 7 : 6;
/** Số ngày làm việc trong tháng của `d`: [đã qua tới hết `d`, cả tháng] */
const ngayLamThang = (d: Date) => {
  let qua = 0, tong = 0;
  const cuoi = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  for (let i = 1; i <= cuoi; i++) {
    if (!laNgayLam(new Date(d.getFullYear(), d.getMonth(), i))) continue;
    tong++; if (i <= d.getDate()) qua++;
  }
  return [qua, tong] as const;
};
/** Số tuần ISO của ngày (năm theo thứ Năm của tuần) */
const tuanISO = (d: Date) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const dauNam = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { nam: t.getUTCFullYear(), tuan: Math.ceil(((t.getTime() - dauNam.getTime()) / 86400000 + 1) / 7) };
};
/** Các tuần thuộc tháng của `d` (tuần có thứ Năm nằm trong tháng — cách đánh số tuần ISO) */
const tuanTrongThang = (d: Date) => {
  const ds: Array<{ nam: number; tuan: number; tu: Date; den: Date }> = [];
  const dau = new Date(d.getFullYear(), d.getMonth(), 1);
  let thu2 = themNgay(dau, -((dau.getDay() + 6) % 7));
  for (; ; thu2 = themNgay(thu2, 7)) {
    const thu5 = themNgay(thu2, 3);
    if (thu5.getMonth() !== d.getMonth() && thu5 > dau) break;
    if (thu5.getMonth() === d.getMonth()) ds.push({ ...tuanISO(thu5), tu: thu2, den: themNgay(thu2, 6) });
  }
  return ds;
};
/** Số ngày làm việc từ ngày sau `tu` tới hết năm */
const ngayLamConLai = (tu: Date) => {
  let n = 0;
  for (let d = themNgay(tu, 1); d.getFullYear() === tu.getFullYear(); d = themNgay(d, 1)) if (laNgayLam(d)) n++;
  return n;
};

interface KhoangKy { tu: Date; den: Date; truocTu: Date; truocDen: Date; ten: string; tenTruoc: string; dates?: string[] }

export const TongQuanDauTrang: React.FC<Props> = p => {
  const [ky, setKy] = useState<KyXem>('ngay');
  // Ngày tự chọn (ô "Chọn ngày"): nhãn ngày như trong unifiedDateOptions
  const [tuyChon, setTuyChon] = useState<string[]>([]);
  // Bấm 1 ô tuần (chế độ Tháng của thanh tiến độ) => biểu đồ ngày vẽ đúng 7 ngày tuần đó, vạch "Cần" = KH tuần / ngày làm việc
  const [tuanChon, setTuanChon] = useState<{ tuan: number; tu: Date; den: Date; kh: number; th: number; muc?: number; ngayTrong?: number; thTrong?: number } | null>(null);

  // Mốc của các kỳ = HÔM QUA (ngày làm việc đã xong; hôm nay số còn đang nạp)
  const ngayMoi = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1); }, []);
  // Ngày có số liệu (ô "Chọn ngày" ghi "(chưa có số)" cho ngày khác)
  const coSo = useMemo(() => new Set(p.unifiedDateOptions.map(o => { const x = parseVNDate(o); return x ? toISODateLocal(x) : ''; })), [p.unifiedDateOptions]);

  const khoang = useMemo<KhoangKy | null>(() => {
    if (ky === 'tuy') {
      const ds = tuyChon.map(o => parseVNDate(o)).filter((x): x is Date => !!x).sort((x, y) => x.getTime() - y.getTime());
      if (!ds.length) return null;
      const tu = ds[0], den = ds[ds.length - 1];
      const soNgay = Math.round((den.getTime() - tu.getTime()) / 86400000) + 1;
      const truocDen = themNgay(tu, -1), truocTu = themNgay(tu, -soNgay);
      return {
        tu, den, truocTu, truocDen, dates: ds.map(toISODateLocal),
        ten: ds.length === 1 ? `ngày ${ngayNgan(tu)}` : `${ds.length} ngày`,
        tenTruoc: soNgay === 1 ? `ngày ${ngayNgan(truocTu)}` : `${soNgay} ngày liền trước`,
      };
    }
    if (!ngayMoi) return null;
    const d = ngayMoi;
    if (ky === 'ngay') {
      const truoc = themNgay(d, -1);
      return { tu: d, den: d, truocTu: truoc, truocDen: truoc, ten: 'hôm qua', tenTruoc: `ngày ${ngayNgan(truoc)}` };
    }
    if (ky === 'tuan') return { tu: themNgay(d, -6), den: d, truocTu: themNgay(d, -13), truocDen: themNgay(d, -7), ten: '7 ngày', tenTruoc: '7 ngày trước' };
    const dauThang = new Date(d.getFullYear(), d.getMonth(), 1);
    const dauTruoc = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const cuoiTruoc = new Date(d.getFullYear(), d.getMonth(), 0);
    const denTruoc = new Date(dauTruoc.getFullYear(), dauTruoc.getMonth(), Math.min(d.getDate(), cuoiTruoc.getDate()));
    return { tu: dauThang, den: d, truocTu: dauTruoc, truocDen: denTruoc, ten: `tháng ${d.getMonth() + 1}`, tenTruoc: `cùng kỳ T${dauTruoc.getMonth() + 1}` };
  }, [ky, ngayMoi, tuyChon]);

  // Kỳ chọn => "Ngày báo cáo" chung của trang
  const { setOverviewDateFilters, unifiedDateOptions } = p;
  useEffect(() => {
    if (!khoang) return;
    if (khoang.dates) {
      // Chỉ đưa vào "Ngày báo cáo" các ngày có số liệu, đúng chuỗi ngày của danh sách gốc
      const can = new Set(khoang.dates);
      const chon = unifiedDateOptions.filter(o => { const x = parseVNDate(o); return !!x && can.has(toISODateLocal(x)); });
      if (chon.length) setOverviewDateFilters(chon);
      return;
    }
    const a = toISODateLocal(khoang.tu), b = toISODateLocal(khoang.den);
    const chon = unifiedDateOptions.filter(o => { const x = parseVNDate(o); if (!x) return false; const s = toISODateLocal(x); return s >= a && s <= b; });
    if (chon.length) setOverviewDateFilters(chon);
  }, [khoang, unifiedDateOptions, setOverviewDateFilters]);

  // Số của kỳ này + kỳ trước (cùng bộ lọc công trình / xưởng với dải Dòng chảy)
  const [so, setSo] = useState<{ nay: OverviewSummary | null; truoc: OverviewSummary | null }>({ nay: null, truoc: null });
  const locKey = `${p.congTrinh.join('|')}#${p.xuong.join('|')}`;
  useEffect(() => {
    if (!khoang) return;
    const ac = new AbortController();
    const opts = { signal: ac.signal, congTrinh: p.congTrinh, xuong: p.xuong };
    const iso = toISODateLocal;
    Promise.all([
      fetchOverviewSummary(iso(khoang.tu), iso(khoang.den), khoang.dates, opts),
      fetchOverviewSummary(iso(khoang.truocTu), iso(khoang.truocDen), undefined, opts),
    ]).then(([nay, truoc]) => { if (!ac.signal.aborted) setSo({ nay, truoc }); });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [khoang, locKey]);

  // Tiến độ theo Năm (doanh số năm + mốc quý) hoặc Tháng (KH tháng trong khsx_nam vs nhập kho tháng + mốc nhịp tới hôm qua)
  const [tienDo, setTienDo] = useState<'nam' | 'thang'>('nam');
  // Biểu đồ nhập kho theo ngày là biểu đồ chính: khung "Cần chú ý" và so sánh KH vs TH theo xưởng / công trình ẩn,
  // người dùng bấm mới mở
  const [moChuY, setMoChuY] = useState(false);
  // Lọc biểu đồ nhập kho theo ngày: xưởng / công trình (rỗng = tất cả). 'KHÁC' = xưởng trống / lạ (= tổng − các xưởng)
  const [locXuong, setLocXuong] = useState<string[]>([]);
  const [locCt, setLocCt] = useState<string[]>([]);
  // Danh sách để chọn — LỌC CHÉO: công trình có nhập kho ở các xưởng đã chọn; xưởng có nhập kho của các công trình đã
  // chọn (trong khoảng ngày đang xem, xếp theo giá trị)
  const [dsCt, setDsCt] = useState<string[]>([]);
  const [dsXuong, setDsXuong] = useState<string[]>([]);
  // Tháng đang xem ở chế độ Tháng (1–12, cùng năm với hôm qua); mặc định tháng của hôm qua
  const [thangTD, setThangTD] = useState(() => ngayMoi.getMonth() + 1);
  // Chế độ Tháng: biểu đồ vẽ CẢ tháng đang xem — ngày đã qua = nhập kho thật, ngày còn lại = cột đề xuất để đạt KH
  const xemThang = tienDo === 'thang';
  const dauThangTD = new Date(ngayMoi.getFullYear(), thangTD - 1, 1);
  const cuoiThangTD = new Date(ngayMoi.getFullYear(), thangTD, 0);
  // Khoảng ngày HIỂN THỊ trên biểu đồ (có thể vượt quá hôm qua => phần sau là đề xuất)
  const hienTu = tuanChon ? tuanChon.tu : xemThang ? dauThangTD : null;
  const hienDen = tuanChon ? tuanChon.den : xemThang ? cuoiThangTD : null;
  // Nhập kho theo ngày (tỷ): 7 ngày gần nhất, hoặc từ đầu tháng khi xem "Tháng này"
  const [nk, setNk] = useState<Array<{ ngay: string; ten: string; v: number; cuoi: boolean }>>([]);
  const [nkKhoang, setNkKhoang] = useState<{ tu: Date; den: Date } | null>(null);
  useEffect(() => {
    if (!ngayMoi) return;
    // Tự chọn ngày: vẽ từ ngày đầu tới ngày cuối đã chọn (ngày cuối tô đậm)
    // Số thật chỉ tới hôm qua; khoảng hoàn toàn ở tương lai => không tải
    if (hienTu && hienTu > ngayMoi) { setNk([]); return; }
    const den = hienDen ? (hienDen > ngayMoi ? ngayMoi : hienDen) : ky === 'tuy' && khoang ? khoang.den : ngayMoi;
    const tu = hienTu ? hienTu : ky === 'tuy' && khoang ? (khoang.tu < den ? khoang.tu : themNgay(den, -6))
      : ky === 'thang' ? new Date(ngayMoi.getFullYear(), ngayMoi.getMonth(), 1) : themNgay(ngayMoi, -6);
    const q = new URLSearchParams({ source: 'inventory', granularity: 'day', dateFrom: toISODateLocal(tu), dateTo: toISODateLocal(den) });
    if (p.congTrinh.length) q.set('ctWhitelist', p.congTrinh.join(','));
    if (p.xuong.length === 1) q.set('xuong', p.xuong[0]);
    setNkKhoang({ tu, den });
    let on = true;
    fetch(`/api/trend?${q.toString()}`)
      .then(r => (r.ok ? r.json() : []))
      .then((rows: Array<{ period: string; total?: number | string; total_value?: number | string }>) => {
        if (!on || !Array.isArray(rows)) return;
        const theoNgay = new Map(rows.map(r => [String(r.period).slice(0, 10), Number(r.total ?? r.total_value) || 0]));
        const ds: Array<{ ngay: string; ten: string; v: number; cuoi: boolean }> = [];
        for (let d = tu; d <= den; d = themNgay(d, 1)) {
          if (d.getDay() === 0 && !theoNgay.get(toISODateLocal(d))) continue; // bỏ Chủ nhật không có số
          const k = toISODateLocal(d);
          ds.push({ ngay: k, ten: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, v: (theoNgay.get(k) ?? 0) / 1000, cuoi: k === toISODateLocal(den) });
        }
        setNk(ds);
      })
      .catch(() => { if (on) setNk([]); });
    return () => { on = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ky, ngayMoi, locKey, khoang, tuanChon, xemThang, thangTD]);

  const [khTh, setKhTh] = useState<YearPlanActualData | null>(null);
  // Danh sách công trình / xưởng để chọn (lọc chéo theo lựa chọn bên kia)
  useEffect(() => {
    if (!nkKhoang) return;
    const ac = new AbortController();
    const goc = () => new URLSearchParams({ source: 'inventory', dateFrom: toISODateLocal(nkKhoang.tu), dateTo: toISODateLocal(nkKhoang.den) });
    const lay = (url: string) => fetch(url, { signal: ac.signal }).then(r => (r.ok ? r.json() : [])).then(d => (Array.isArray(d) ? d : []));
    // Công trình: theo từng xưởng đã chọn (gộp, cộng giá trị); có chọn 'KHÁC' (không lọc được theo tên) => không thu hẹp
    const xuongLoc = locXuong.includes('KHÁC') ? [] : locXuong;
    const ctPromise = Promise.all((xuongLoc.length ? xuongLoc : [p.xuong.length === 1 ? p.xuong[0] : null]).map(x => {
      const q = goc();
      if (p.congTrinh.length) q.set('ctWhitelist', p.congTrinh.join(','));
      if (x) q.set('xuong', x);
      return lay(`/api/trend-by-congtrinh?${q.toString()}`) as Promise<Array<{ congTrinhName: string; total: number }>>;
    })).then(ds => {
      const m = new Map<string, number>();
      ds.flat().forEach(x => { if (x.congTrinhName && x.congTrinhName !== 'Chưa xác định') m.set(x.congTrinhName, (m.get(x.congTrinhName) ?? 0) + (Number(x.total) || 0)); });
      return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
    });
    // Xưởng: theo công trình đã chọn; xưởng trống => 'KHÁC'
    const qx = goc();
    const ctLoc = locCt.length ? locCt : p.congTrinh;
    if (ctLoc.length) qx.set('ctWhitelist', ctLoc.join(','));
    const xPromise = (lay(`/api/trend-by-xuong?${qx.toString()}`) as Promise<Array<{ xuongName: string; total: number }>>)
      .then(ds => [...new Set(ds.filter(x => (Number(x.total) || 0) > 0).map(x => (!x.xuongName || x.xuongName === 'Chưa xác định' ? 'KHÁC' : x.xuongName)))]);
    Promise.all([ctPromise, xPromise]).then(([ct, x]) => {
      if (ac.signal.aborted) return;
      // Giữ cả mục đang chọn (dù không còn số) để bỏ chọn được
      setDsCt([...ct, ...locCt.filter(t => !ct.includes(t))]);
      setDsXuong([...x, ...locXuong.filter(t => !x.includes(t))]);
    }).catch(() => { /* bỏ qua: huỷ hoặc lỗi mạng */ });
    return () => ac.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nkKhoang?.tu.getTime(), nkKhoang?.den.getTime(), locKey, locXuong.join('|'), locCt.join('|')]);
  // Nhập kho theo ngày của phần đã chọn: mỗi xưởng chọn 1 lần gọi (công trình chọn lọc chung bằng ctWhitelist), cộng lại
  const [nkLoc, setNkLoc] = useState<Map<string, number> | null>(null);
  const locDangBat = locXuong.length > 0 || locCt.length > 0;
  useEffect(() => {
    if (!locDangBat || !nkKhoang) { setNkLoc(null); return; }
    setNkLoc(null);
    const ac = new AbortController();
    const goi = (xuong: string | null) => {
      const q = new URLSearchParams({ source: 'inventory', granularity: 'day', dateFrom: toISODateLocal(nkKhoang.tu), dateTo: toISODateLocal(nkKhoang.den) });
      const ct = locCt.length ? locCt : p.congTrinh;
      if (ct.length) q.set('ctWhitelist', ct.join(','));
      const x = xuong ?? (p.xuong.length === 1 ? p.xuong[0] : null);
      if (x) q.set('xuong', x);
      return fetch(`/api/trend?${q.toString()}`, { signal: ac.signal }).then(r => (r.ok ? r.json() : []))
        .then((rows: Array<{ period: string; total?: number | string; total_value?: number | string }>) =>
          new Map((Array.isArray(rows) ? rows : []).map(r => [String(r.period).slice(0, 10), (Number(r.total ?? r.total_value) || 0) / 1000])));
    };
    (async () => {
      const ten = locXuong.filter(x => x !== 'KHÁC');
      const coKhac = locXuong.includes('KHÁC');
      const tatCaXuong = (khTh?.workshops ?? []).filter(x => x !== 'KHÁC');
      // Không chọn xưởng => 1 lần gọi (theo công trình đã chọn); chọn 'KHÁC' => cần tổng và mọi xưởng có tên để lấy phần dư
      const [chon, tong, moiXuong] = await Promise.all([
        locXuong.length === 0 ? Promise.all([goi(null)]) : Promise.all(ten.map(goi)),
        coKhac ? goi(null) : Promise.resolve(null),
        coKhac ? Promise.all(tatCaXuong.map(goi)) : Promise.resolve(null),
      ]);
      const kq = new Map<string, number>();
      const cong = (m: Map<string, number>, he = 1) => m.forEach((v, k) => kq.set(k, (kq.get(k) ?? 0) + v * he));
      chon.forEach(m => cong(m));
      if (tong && moiXuong) { cong(tong); moiXuong.forEach(m => cong(m, -1)); kq.forEach((v, k) => kq.set(k, Math.max(v, 0))); }
      if (!ac.signal.aborted) setNkLoc(kq);
    })().catch(() => { if (!ac.signal.aborted) setNkLoc(new Map()); });
    return () => ac.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locXuong.join('|'), locCt.join('|'), nkKhoang?.tu.getTime(), nkKhoang?.den.getTime(), locKey, khTh]);
  useEffect(() => { let on = true; fetchYearPlanActual(ngayMoi.getFullYear()).then(d => { if (on) setKhTh(d); }); return () => { on = false; }; }, [ngayMoi]);
  const td = useMemo(() => {
    if (tienDo === 'nam') {
      return {
        ten: `năm ${p.namLabel}`, th: p.thucHienNam, kh: p.keHoachNam,
        moc: ([['q1', 'Quý I'], ['q2', 'Quý II'], ['q3', 'Quý III'], ['q4', 'Quý IV']] as const).map(([k, ten], i) => {
          const tu = new Date(ngayMoi.getFullYear(), i * 3, 1), den = new Date(ngayMoi.getFullYear(), i * 3 + 3, 0);
          return { ten, v: p.quy[k], chuaToi: ngayMoi < tu, dangChay: ngayMoi >= tu && ngayMoi <= den };
        }).filter(m => m.v > 0),
        conNgay: ngayLamConLai(ngayMoi),
        // Ngày làm việc đã qua trong năm = cả năm (1/1 + các ngày sau 1/1) − còn lại
        daQua: (laNgayLam(new Date(ngayMoi.getFullYear(), 0, 1)) ? 1 : 0) + ngayLamConLai(new Date(ngayMoi.getFullYear(), 0, 1)) - ngayLamConLai(ngayMoi),
        cuoiKy: new Date(ngayMoi.getFullYear(), 11, 31),
        ghiChu: 'nhập kho mọi đơn trong năm, không theo bộ lọc',
      };
    }
    const t = thangTD;
    const cong = (ds?: Array<{ thang: number; value: number }>) => (ds ?? []).filter(r => r.thang === t).reduce((a, r) => a + r.value, 0);
    const kh = cong(khTh?.plan), th = cong(khTh?.actual);
    const homNayTrongThang = t === ngayMoi.getMonth() + 1;
    const [qua, tong] = homNayTrongThang ? ngayLamThang(ngayMoi) : t < ngayMoi.getMonth() + 1 ? [1, 1] : [0, ngayLamThang(new Date(ngayMoi.getFullYear(), t - 1, 1))[1]];
    return {
      ten: `tháng ${t}/${ngayMoi.getFullYear()}`, th, kh,
      // Nhịp đều theo ngày làm việc: tới hôm qua lẽ ra phải đạt bao nhiêu (chỉ tháng đang chạy)
      moc: homNayTrongThang && kh > 0 && tong > 0 ? [{ ten: `Nhịp tới ${ngayNgan(ngayMoi)}`, v: (kh * qua) / tong }] : [],
      conNgay: tong - qua,
      daQua: homNayTrongThang ? qua : t < ngayMoi.getMonth() + 1 ? tong : 0,
      cuoiKy: new Date(ngayMoi.getFullYear(), t, 0),
      ghiChu: 'KH tháng (kế hoạch năm chia tháng) · nhập kho mọi đơn trong tháng',
    };
  }, [tienDo, khTh, ngayMoi, thangTD, p.namLabel, p.thucHienNam, p.keHoachNam, p.quy]);
  // KH tuần trong tháng: KH / nhập kho từng tuần (API KHSX theo tuần) — chỉ tải khi xem Tháng
  const [tuanKh, setTuanKh] = useState<Array<{ tuan: number; tu: Date; den: Date; kh: number; th: number }>>([]);
  useEffect(() => {
    if (tienDo !== 'thang') return;
    const ac = new AbortController();
    const ds = tuanTrongThang(new Date(ngayMoi.getFullYear(), thangTD - 1, 1));
    Promise.all(ds.map(w => fetchKhsxNhapKhoSummary({ nam: String(w.nam), mode: 'week', tuan: String(w.tuan), signal: ac.signal })))
      .then(kq => { if (!ac.signal.aborted) setTuanKh(ds.map((w, i) => ({ tuan: w.tuan, tu: w.tu, den: w.den, kh: kq[i]?.totalKh ?? 0, th: kq[i]?.totalTh ?? 0 }))); });
    const y = ngayMoi.getFullYear();
    const q = new URLSearchParams({ source: 'inventory', granularity: 'day', dateFrom: toISODateLocal(new Date(y, thangTD - 1, 1)), dateTo: toISODateLocal(new Date(y, thangTD, 0)) });
    fetch(`/api/trend?${q.toString()}`, { signal: ac.signal })
      .then(r => (r.ok ? r.json() : []))
      .then((rows: Array<{ period: string; total?: number | string; total_value?: number | string }>) => {
        if (!ac.signal.aborted && Array.isArray(rows)) setNkThang(new Map(rows.map(r => [String(r.period).slice(0, 10), (Number(r.total ?? r.total_value) || 0) / 1000])));
      })
      .catch(() => { /* bỏ qua: huỷ hoặc lỗi mạng */ });
    return () => ac.abort();
  }, [tienDo, ngayMoi, thangTD]);
  const [nkThang, setNkThang] = useState<Map<string, number>>(new Map());
  // Mục tiêu từng tuần — CHỈ phần ngày nằm trong tháng, để cờ / ô tuần / thanh tháng khớp nhau:
  //  - tuần có KH tuần: KH tuần × (ngày làm việc trong tháng / ngày làm việc của tuần)
  //  - tuần chưa có KH tuần: phần KH tháng còn lại chia đều theo ngày làm việc
  //  => cộng các tuần = đúng KH tháng. TH tuần = nhập kho các ngày của tuần trong tháng.
  const tuanMT = useMemo(() => {
    const ds = tuanKh.map(w => {
      let ngayTrong = 0, th = 0;
      for (let d = w.tu; d <= w.den; d = themNgay(d, 1)) {
        if (d.getMonth() !== thangTD - 1) continue;
        if (laNgayLam(d)) ngayTrong++;
        th += nkThang.get(toISODateLocal(d)) ?? 0;
      }
      return { ...w, ngayTrong, thTrong: th, khTrong: w.kh > 0 ? (w.kh * ngayTrong) / NGAY_TUAN : null as number | null };
    });
    const daBiet = ds.reduce((a, w) => a + (w.khTrong ?? 0), 0);
    const ngayChia = ds.reduce((a, w) => a + (w.khTrong === null ? w.ngayTrong : 0), 0);
    const moiNgay = ngayChia > 0 ? Math.max(0, td.kh - daBiet) / ngayChia : 0;
    return ds.map(w => ({ ...w, muc: w.khTrong ?? moiNgay * w.ngayTrong, tuKh: w.khTrong !== null }));
  }, [tuanKh, nkThang, thangTD, td.kh]);
  // Chế độ Tháng: 1 cờ cho mỗi tuần = KH tháng lũy kế tới cuối tuần đó (chia đều theo ngày làm việc trong tháng);
  // tuần chưa tới => cờ xám
  const mocTuan = useMemo(() => {
    if (tienDo !== 'thang' || td.kh <= 0 || !tuanMT.length) return [];
    let luyKe = 0;
    return tuanMT.map(w => {
      luyKe += w.muc;
      return { ten: `Tuần ${w.tuan}`, v: luyKe, chuaToi: ngayMoi < w.tu, dangChay: ngayMoi >= w.tu && ngayMoi <= w.den };
    });
  }, [tienDo, td.kh, tuanMT, ngayMoi]);
  useEffect(() => { setTuanChon(null); }, [tienDo, thangTD, ky, tuyChon]);
  // Có lọc xưởng (không lọc công trình): KH / TH của kỳ chỉ tính các xưởng đã chọn (bảng KH năm theo tháng × xưởng)
  const khLoc = useMemo(() => {
    if (!locDangBat) return null;
    if (locCt.length > 0) return { kh: 0, th: 0, coKh: false };
    const trong = (t: number) => (tienDo === 'thang' ? t === thangTD : true);
    const thuoc = (x: string) => locXuong.includes(x);
    const cong = (ds?: Array<{ thang: number; xuong: string; value: number }>) => (ds ?? []).filter(r => trong(r.thang) && thuoc(r.xuong)).reduce((a, r) => a + r.value, 0);
    return { kh: cong(khTh?.plan), th: cong(khTh?.actual), coKh: true };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locDangBat, locXuong.join('|'), locCt.length, khTh, tienDo, thangTD]);
  const conLaiNam = khLoc ? Math.max(0, khLoc.kh - khLoc.th) : Math.max(0, td.kh - td.th);
  const soNgayCon = td.conNgay;
  const canMoiNgayKy = soNgayCon > 0 ? conLaiNam / soNgayCon : 0;
  // Mức đạt KH tháng mỗi ngày = KH tháng (bảng KH năm theo tháng) / số ngày làm việc của tháng — nhập đều mức này thì
  // đạt KH tháng; khác "Cần" (mức phải đuổi để bù phần đang thiếu tới cuối kỳ)
  const thangKh = tienDo === 'thang' ? thangTD : ngayMoi.getMonth() + 1;
  const khThang = khLoc && !khLoc.coKh ? 0
    : (khTh?.plan ?? []).filter(x => x.thang === thangKh && (!khLoc || locXuong.includes(x.xuong))).reduce((a, x) => a + x.value, 0);
  const mucKhThang = khThang > 0 ? khThang / ngayLamThang(new Date(ngayMoi.getFullYear(), thangKh - 1, 1))[1] : 0;
  // Đang xem 1 tuần: mức cần mỗi ngày = KH tuần chia đều ngày làm việc
  // Tuần đang chọn: mục tiêu = đúng số trên ô tuần (KH tuần nếu có, không thì phần chia từ KH tháng), chỉ phần ngày
  // trong tháng; mức mỗi ngày = mục tiêu / số ngày làm việc của tuần trong tháng. Trước chỉ đọc KH tuần => tuần chưa có
  // KH tuần mất đường "Cần" và cột đổi màu, tuần có KH thì có (lúc này lúc kia)
  const mucTuan = tuanChon ? (tuanChon.muc ?? tuanChon.kh) : 0;
  const ngayTuan = tuanChon ? (tuanChon.ngayTrong && tuanChon.ngayTrong > 0 ? tuanChon.ngayTrong : NGAY_TUAN) : NGAY_TUAN;
  const thTuan = tuanChon ? (tuanChon.thTrong ?? tuanChon.th) : 0;
  const canMoiNgay = tuanChon ? (mucTuan > 0 ? mucTuan / ngayTuan : 0) : canMoiNgayKy;
  // Ngưỡng tô màu cột ngày: đạt KH tháng mỗi ngày => xanh (đang chọn tuần thì theo mức cần của tuần)
  const nguongDat = tuanChon ? canMoiNgay : mucKhThang > 0 ? mucKhThang : canMoiNgay;
  const tenNguong = tuanChon ? `mục tiêu tuần ${tuanChon.tuan} (${formatTy(canMoiNgay)}/ngày)` : mucKhThang > 0 ? `KH tháng ${thangKh} (${formatTy(mucKhThang)}/ngày)` : 'mức cần';
  const tenKh = tienDo === 'nam' ? 'KH năm' : `KH tháng ${thangTD}`;
  // Kế hoạch nhập kho từng ngày (KH tuần của khsx theo ngày KHNK) — cột "Kế hoạch" cạnh cột nhập kho; theo bộ lọc
  // xưởng / công trình của biểu đồ (không lọc thì theo bộ lọc chung của trang)
  const [khNgay, setKhNgay] = useState<Map<string, number> | null>(null);
  const khTu = nkKhoang ? toISODateLocal(nkKhoang.tu) : '';
  const khDen = (() => { const d = hienDen && nkKhoang && hienDen > nkKhoang.den ? hienDen : nkKhoang?.den; return d ? toISODateLocal(d) : ''; })();
  useEffect(() => {
    if (!khTu || !khDen) { setKhNgay(null); return; }
    const ac = new AbortController();
    const q = new URLSearchParams({ tu: khTu, den: khDen });
    const xs = locXuong.length ? locXuong : p.xuong;
    const ct = locCt.length ? locCt : p.congTrinh;
    if (xs.length) q.set('xuong', xs.join(','));
    if (ct.length) q.set('congTrinh', ct.join(','));
    fetch(`/api/khsx/ke-hoach-ngay?${q.toString()}`, { signal: ac.signal }).then(r => (r.ok ? r.json() : []))
      .then((rows: Array<{ ngay: string; kh: number }>) => { if (!ac.signal.aborted) setKhNgay(new Map((Array.isArray(rows) ? rows : []).map(r => [r.ngay, Number(r.kh) || 0]))); })
      .catch(() => { if (!ac.signal.aborted) setKhNgay(new Map()); });
    return () => ac.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [khTu, khDen, locXuong.join('|'), locCt.join('|'), locKey]);
  // Ngày gần nhất CÓ nhập kho (ngày mới nhất có thể chưa nạp số => không báo 'chậm' oan)
  const nkCuoi = [...nk].reverse().find(d => d.v > 0) ?? null;
  // Biểu đồ vẽ phần đã chọn (lọc xưởng / công trình); khung "Cần chú ý" vẫn theo toàn bộ (nkCuoi)
  const nkHien = useMemo(() => (locDangBat ? nk.map(d => ({ ...d, v: nkLoc?.get(d.ngay) ?? 0 })) : nk), [locDangBat, nk, nkLoc]);
  const nkCoSo = nkHien.filter(d => d.v > 0);
  const binhQuan = nkCoSo.length ? nkCoSo.reduce((a, d) => a + d.v, 0) / nkCoSo.length : 0;
  // Cột đề xuất cho các ngày làm việc SAU hôm qua trong khoảng hiển thị: phần KH còn thiếu chia đều số ngày còn lại
  const duLieu = useMemo(() => {
    const ds: Array<{ ngay: string; ten: string; v: number; de: number; cuoi: boolean }> = nkHien.map(d => ({ ...d, de: 0 }));
    if (!hienDen || hienDen <= ngayMoi) return ds;
    const batDau = hienTu && hienTu > ngayMoi ? hienTu : themNgay(ngayMoi, 1);
    const ngayCon: Date[] = [];
    for (let d = batDau; d <= hienDen; d = themNgay(d, 1)) if (laNgayLam(d)) ngayCon.push(d);
    if (!ngayCon.length) return ds;
    let deMoiNgay = canMoiNgayKy;
    if (tuanChon && mucTuan > 0) deMoiNgay = Math.max(0, mucTuan - (ngayMoi >= tuanChon.tu ? thTuan : 0)) / ngayCon.length;
    for (const d of ngayCon) ds.push({ ngay: toISODateLocal(d), ten: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, v: 0, de: deMoiNgay, cuoi: false });
    return ds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nkHien, hienTu?.getTime(), hienDen?.getTime(), ngayMoi, canMoiNgayKy, tuanChon, mucTuan, thTuan]);
  const duLieuVe = useMemo(() => duLieu.map(d => ({ ...d, kh: khNgay?.get(d.ngay) ?? 0 })), [duLieu, khNgay]);
  // Xem Tháng: không vẽ cột kế hoạch ngày (KH tuần) — đã có thẻ từng tuần + đường KH tháng
  const coKhNgay = tienDo !== 'thang' && duLieuVe.some(d => d.kh > 0);
  const coDeXuat = duLieu.some(d => d.de > 0);
  // Vùng hồng giữa KH tháng / ngày và mức cần / ngày (cần cao hơn KH tháng = đang phải bù phần thiếu)
  const vungHong = !tuanChon && mucKhThang > 0 && canMoiNgay > mucKhThang;


  const tenKy = khoang?.tenTruoc ?? 'kỳ trước';

  // Ô "Chọn ngày" luôn khớp kỳ đang xem: danh sách = mọi ngày từ đầu năm trước tới hôm qua (mới nhất trước),
  // ngày chưa có số liệu ghi chú bên cạnh; ô tick = các ngày thuộc kỳ đang xem
  const nhan = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}${coSo.has(toISODateLocal(d)) ? '' : ' (chưa có số)'}`;
  const dsNgay = useMemo(() => {
    const ds: string[] = [];
    const dau = new Date(ngayMoi.getFullYear() - 1, 0, 1);
    // Bắt đầu từ ngày MỚI NHẤT có số liệu (vd TKBV đã có số hôm nay) — trước luôn dừng ở hôm qua nên không chọn được
    let tuNgay = ngayMoi;
    coSo.forEach(k => { const x = k ? new Date(`${k}T00:00:00`) : null; if (x && x > tuNgay) tuNgay = x; });
    for (let d = tuNgay; d >= dau; d = themNgay(d, -1)) ds.push(nhan(d));
    return ds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ngayMoi, coSo]);
  const ngayDangXem = useMemo(() => {
    if (!khoang) return [];
    if (ky === 'tuy') return tuyChon.map(o => { const x = parseVNDate(o); return x ? nhan(x) : o; });
    const ds: string[] = [];
    for (let d = khoang.den; d >= khoang.tu; d = themNgay(d, -1)) ds.push(nhan(d));
    return ds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [khoang, ky, tuyChon, coSo]);
  const chuaCoSo = !!khoang && khoang.tu.getTime() === khoang.den.getTime() && !coSo.has(toISODateLocal(khoang.den));
  // So với kỳ trước: luôn theo % (số chênh lệch để trong ngoặc: số lượng, hoặc tỷ khi xem giá trị)
  const chenh = (a?: number, b?: number, kieu: 'so' | 'pt' = 'so', moc?: string, dao = false) => {
    if (a == null || b == null) return null;
    const d = a - b;
    const tot = dao ? d <= 0 : d >= 0;
    const ptTho = b > 0 ? (d / b) * 100 : null;
    // Dưới 1% vẫn có chênh lệch => 1 số lẻ (tránh "▼ 0%")
    const pt = ptTho === null ? null : Math.abs(ptTho) < 1 ? ptTho.toFixed(1) : String(Math.round(ptTho));
    const chinh = d === 0 ? '0%' : pt === null ? 'mới có'
      : ptTho !== null && ptTho >= 300 ? `gấp ${(a / b).toLocaleString('en-US', { maximumFractionDigits: 1 })} lần` : `${d > 0 ? '+' : ''}${pt}%`;
    const tuyet = kieu === 'pt' ? `${d >= 0 ? '+' : '−'}${formatTrieuAsTy(Math.abs(d))} tỷ` : `${d >= 0 ? '+' : '−'}${Math.abs(d).toLocaleString('en-US')}`;
    return (
      <span className={d === 0 ? 'text-slate-500' : tot ? 'text-emerald-700' : 'text-red-600'}>
        <b className="font-semibold">{d > 0 ? '▲' : d < 0 ? '▼' : ''} {chinh}</b>
        {d !== 0 && <span className="opacity-80"> ({tuyet})</span>} so với {moc ?? tenKy}
      </span>
    );
  };

  const n = so.nay, t = so.truoc;
  const nhanKy = !khoang ? '' : khoang.tu.getTime() === khoang.den.getTime() ? `Trong ngày ${ngayNgan(khoang.den)}` : `Từ ${ngayNgan(khoang.tu)} đến ${ngayNgan(khoang.den)}`;
  const dem = p.metric === 'COUNT';
  const thangXem = (khoang?.den ?? new Date()).getMonth() + 1;
  const thangTruoc = thangXem === 1 ? 12 : thangXem - 1;

  // Cần chú ý hôm nay: theo TOÀN BỘ (không theo bộ lọc xưởng / công trình của biểu đồ)
  const conLaiTong = Math.max(0, td.kh - td.th);
  const canTong = soNgayCon > 0 ? conLaiTong / soNgayCon : 0;
  // Cần chú ý hôm nay: chỉ những việc cần làm, có số thật
  type Muc = { ten: React.ReactNode; phu: string; nhan: string; mau: string; bam?: () => void; to?: string };
  const canChuY: Muc[] = [];
  if (p.vm.overdue > 0) canChuY.push({ ten: `${p.vm.overdue} vướng mắc quá hạn xử lý`, phu: `${p.vm.open} vướng mắc đang mở`, nhan: 'Trễ', mau: 'bg-red-50 text-red-700', to: '/vuong-mac' });
  else if (p.vm.open > 0) canChuY.push({ ten: `${p.vm.open} vướng mắc đang mở`, phu: 'chưa có vướng mắc quá hạn', nhan: 'Vướng mắc', mau: 'bg-slate-100 text-slate-700', to: '/vuong-mac' });
  if (nkCuoi && canTong > 0 && nkCuoi.v < canTong) {
    canChuY.push({ ten: `Nhập kho ${ngayNgan(parseVNDate(nkCuoi.ngay) ?? new Date())}: ${formatTy(nkCuoi.v)} tỷ`, phu: `thấp hơn mức cần ${formatTy(canTong)} tỷ/ngày để đạt ${tenKh}`, nhan: 'Chậm', mau: 'bg-amber-50 text-amber-800', bam: () => p.onMoTab('kh') });
  }
  if (conLaiTong > 0 && soNgayCon > 0) canChuY.push({ ten: `Còn ${formatTy(conLaiTong)} tỷ để đạt ${tienDo === 'nam' ? `KH năm ${p.namLabel}` : tenKh}`, phu: `≈ ${formatTy(canTong)} tỷ/ngày trong ${soNgayCon} ngày làm việc còn lại`, nhan: 'Kế hoạch', mau: 'bg-slate-100 text-slate-700', bam: p.onThucHienNam });
  if (p.chuaTheSX > 0) canChuY.push({ ten: `Chưa thể sản xuất ${formatTrieuAsTy(p.chuaTheSX)} tỷ`, phu: `vướng SL chưa REV ${formatTrieuAsTy(p.vuongSL)} · chưa triển khai SX ${formatTrieuAsTy(p.chuaTrienKhai)}`, nhan: 'Vướng', mau: 'bg-red-50 text-red-700', bam: () => p.onMoTab('sx') });
  if (p.diemNghen && p.diemNghen.count > 0) canChuY.push({ ten: `Điểm nghẽn: ${p.diemNghen.name}`, phu: `${p.diemNghen.count.toLocaleString('en-US')} hạng mục đang dừng ở đây`, nhan: 'Nghẽn', mau: 'bg-amber-50 text-amber-800', bam: () => p.onMoTab('nghen') });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {([['ngay', 'Hôm qua'], ['tuan', '7 ngày'], ['thang', 'Tháng này']] as Array<[KyXem, string]>).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setKy(k)} aria-pressed={ky === k}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${ky === k ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
            {l}
          </button>
        ))}
        <DashboardFilter
          label="Chọn ngày"
          options={dsNgay}
          selectedValues={ngayDangXem}
          onChange={(v: string[]) => { if (!v.length) { setKy('ngay'); setTuyChon([]); return; } setTuyChon(v.map(o => o.replace(/ \(chưa có số\)$/, ''))); setKy('tuy'); }}
        />
        {khoang && (
          <span className="text-sm text-slate-500">
            {khoang.tu.getTime() === khoang.den.getTime() ? `số liệu ${ngayNgan(khoang.den)}` : `${ngayNgan(khoang.tu)} – ${ngayNgan(khoang.den)}`}
            {chuaCoSo && <b className="font-semibold text-amber-700"> (chưa có số liệu ngày này)</b>}
            {khoang.dates && khoang.dates.length > 1 && khoang.dates.length < Math.round((khoang.den.getTime() - khoang.tu.getTime()) / 86400000) + 1 ? ` (${khoang.dates.length} ngày đã chọn)` : ''} · so với {khoang.tenTruoc}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg bg-white p-1 ring-1 ring-slate-200" role="group" aria-label="Chế độ hiển thị">
            {([['COUNT', 'Số lượng'], ['SUM', 'Giá trị']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => p.setMetric(k)} aria-pressed={p.metric === k}
                className={`rounded-md px-3 py-1 text-sm ${p.metric === k ? 'bg-slate-900 font-medium text-white' : 'text-slate-500 hover:text-slate-800'}`}>
                {l}
              </button>
            ))}
          </div>
          <button type="button" onClick={p.onXuatExcel} title="Xuất Excel tổng hợp các bước theo kỳ đang xem"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Download size={15} aria-hidden /> Xuất Excel
          </button>
        </div>
      </div>

      {/* 6 thẻ dòng chảy (mẫu thẻ trang cũ): số của kỳ đang chọn + so với kỳ trước, lũy kế tháng này / tháng trước;
          bấm => chi tiết & xu hướng */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {LUONG.map((x, i) => {
          const a = n?.[x.k].daily, b = t?.[x.k].daily;
          const m = MAU_THE[x.k];
          const f = (c: number, v: number) => (dem ? c.toLocaleString('en-US') : formatTrieuAsTy(v));
          const dv = dem ? m.dv : 'tỷ';
          return (
            <button key={x.k} type="button" onClick={() => p.onMoChiTiet(x.k)} title={`${x.hint}\nBấm để xem chi tiết & xu hướng`}
              className={`group flex flex-col rounded-2xl border p-5 text-left transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${m.nen}`}>
              <span className="flex items-start gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${m.o}`}><m.Icon size={20} aria-hidden /></span>
                <span className={`min-w-0 flex-1 self-center text-lg font-bold uppercase tracking-wide ${m.chu}`}>{i + 1}. {x.ten} ({x.ma})</span>
                <Eye size={17} className={`shrink-0 opacity-60 group-hover:opacity-100 ${m.nhat}`} aria-hidden />
              </span>
              <span className={`mt-4 text-sm font-semibold uppercase tracking-wider ${m.nhat}`}>{nhanKy}</span>
              <span className={`whitespace-nowrap text-[3.25rem] font-bold leading-tight tabular-nums ${m.chu}`}>
                {a ? f(a.count, a.value) : '…'}<span className={`ml-2 text-xl font-medium ${m.nhat}`}>{dv}</span>
              </span>
              <span className="text-base text-slate-600">
                {a && <>{dem ? `${formatTrieuAsTy(a.value)} tỷ` : `${a.count.toLocaleString('en-US')} hạng mục`} · </>}
                {dem ? chenh(a?.count, b?.count) : chenh(a?.value, b?.value, 'pt')}
              </span>
              {n && (
                <span className="mt-4 flex flex-col gap-1 border-t border-black/5 pt-3">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 text-base font-bold uppercase leading-tight text-slate-800">{x.k === 'order' ? `Đơn hàng mới tháng ${thangXem}:` : x.k === 'tkbv' ? `Bản vẽ mới tháng ${thangXem}:` : x.k === 'pthsp' ? `Phiếu mới tháng ${thangXem}:` : `Lũy kế T${thangXem}:`}</span>
                    <b className={`shrink-0 whitespace-nowrap text-[2.25rem] font-bold tabular-nums ${m.chu}`}>{f(n[x.k].mtd.count, n[x.k].mtd.value)} <span className="text-xl font-semibold">{dem ? x.dv : 'tỷ'}</span></b>
                  </span>
                  <span className="flex items-baseline justify-between gap-2">
                    {/* Thẻ 1: dòng dưới = giá trị đơn hàng đang ở P001 (chưa triển khai) — cùng số thanh P001 của phễu */}
                    <span className="min-w-0 text-sm font-semibold uppercase leading-tight text-slate-500">{x.k === 'order' ? 'Giá trị P001 (chưa triển khai):' : `Lũy kế T${thangTruoc} (cả tháng):`}</span>
                    <span className={`shrink-0 whitespace-nowrap text-2xl font-semibold tabular-nums ${m.nhat}`}>
                      {x.k === 'order'
                        ? (p.giaTriP001 == null ? '—' : `${formatTrieuAsTy(p.giaTriP001)} tỷ`)
                        : <>{f(n[x.k].lastMonth.count, n[x.k].lastMonth.value)} {dem ? x.dv : 'tỷ'}</>}
                    </span>
                  </span>
                </span>
              )}
            </button>
          );
        })}
        {(() => {
          const m = MAU_THE.stock;
          const cuoi = p.tonCuoiThangTruoc.date instanceof Date ? p.tonCuoiThangTruoc.date : parseVNDate(String(p.tonCuoiThangTruoc.date ?? ''));
          const ngayDu = (d: Date | null | undefined) => (d ? `${ngayNgan(d)}/${d.getFullYear()}` : '—');
          const giaTri = (c: number, v: number) => (dem ? c.toLocaleString('en-US') : formatTrieuAsTy(v));
          return (
            <button type="button" onClick={() => p.onMoChiTiet('stock')} title="Tồn kho theo ảnh chụp gần ngày xem nhất. Bấm để xem theo công trình"
              className={`group flex flex-col rounded-2xl border p-5 text-left transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${m.nen}`}>
              <span className="flex items-start gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${m.o}`}><m.Icon size={20} aria-hidden /></span>
                <span className={`min-w-0 flex-1 self-center text-lg font-bold uppercase tracking-wide ${m.chu}`}>6. Tồn kho</span>
                <Eye size={17} className="shrink-0 text-slate-400 group-hover:text-slate-700" aria-hidden />
              </span>
              <span className="mt-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Dữ liệu ngày: {ngayDu(p.tonNgay)}</span>
              <span className="whitespace-nowrap text-[3.25rem] font-bold leading-tight tabular-nums text-slate-900">
                {giaTri(p.tonKho, p.tonKho)}<span className="ml-2 text-xl font-medium text-slate-500">{dem ? 'items' : 'tỷ'}</span>
              </span>
              <span className="text-base text-slate-600">
                {dem ? chenh(p.tonKho, p.tonCuoiThangTruoc.count, 'so', `cuối T${thangTruoc}`, true) : chenh(p.tonKho, p.tonCuoiThangTruoc.value, 'pt', `cuối T${thangTruoc}`, true)}
              </span>
              <span className="mt-4 flex flex-col gap-1 border-t border-black/5 pt-3">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 text-base font-bold uppercase leading-tight text-slate-800">Tồn mới nhất ({ngayDu(p.tonNgay)})</span>
                  <b className="shrink-0 whitespace-nowrap text-[2.25rem] font-bold tabular-nums text-slate-900">{giaTri(p.tonKho, p.tonKho)} <span className="text-xl font-semibold">{dem ? 'items' : 'tỷ'}</span></b>
                </span>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 text-sm font-semibold uppercase leading-tight text-slate-500">Tồn mới nhất của tháng {thangTruoc} ({ngayDu(cuoi)})</span>
                  <span className="shrink-0 whitespace-nowrap text-2xl font-semibold tabular-nums text-slate-500">{giaTri(p.tonCuoiThangTruoc.count, p.tonCuoiThangTruoc.value)} {dem ? 'items' : 'tỷ'}</span>
                </span>
              </span>
            </button>
          );
        })()}
      </div>

      <div className={`grid grid-cols-1 gap-4 ${moChuY ? 'xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : ''}`}>
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 lg:p-6">
          {/* Tiến độ kỳ (năm / tháng): 4 thẻ số (mỗi số 1 chỗ) + thanh đã nhập / dự kiến theo nhịp / phần thiếu + cờ mốc */}
          {(() => {
            const con = Math.max(0, td.kh - td.th);
            const bq = td.daQua > 0 ? td.th / td.daQua : 0;
            const can = td.conNgay > 0 ? con / td.conNgay : 0;
            const duKien = td.th + bq * td.conNgay;
            const ptDuKien = td.kh > 0 ? (duKien / td.kh) * 100 : 0;
            // Giữ nhịp hiện tại thì cần bao nhiêu ngày làm việc nữa để đủ KH => ngày đạt
            const ngayCanThem = bq > 0 ? Math.ceil(con / bq) : null;
            let ngayDat: Date | null = null;
            if (ngayCanThem !== null && con > 0) {
              let d = ngayMoi, k = 0;
              while (k < ngayCanThem && k < 2000) { d = themNgay(d, 1); if (laNgayLam(d)) k++; }
              ngayDat = d;
            }
            const kip = con <= 0 || (ngayDat !== null && ngayDat <= td.cuoiKy);
            const laNam = tienDo === 'nam';
            const tenKy = laNam ? `năm ${p.namLabel}` : `tháng ${thangTD}`;
            const pt = (v: number) => (td.kh > 0 ? Math.min(100, Math.max(0, (v / td.kh) * 100)) : 0);
            const moc: Array<{ ten: string; v: number; chuaToi?: boolean; dangChay?: boolean }> = tienDo === 'thang' && mocTuan.length ? mocTuan : td.moc;
            const phanTram = td.kh > 0 ? (td.th / td.kh) * 100 : 0;
            const xTh = pt(td.th), xDk = pt(duKien);
            const dangChayKy = td.daQua > 0 && td.conNgay > 0;
            const coDuKien = td.kh > 0 && bq > 0 && dangChayKy && con > 0;
            const the = 'flex flex-col rounded-xl border border-slate-200 border-t-4 bg-white px-4 py-3 text-left';
            const nhanThe = 'flex items-baseline justify-between gap-2 text-xs font-bold uppercase tracking-wide text-slate-500';
            return (<>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl font-bold text-slate-900">Nhập kho thành phẩm {laNam ? p.namLabel : `tháng ${thangTD}/${ngayMoi.getFullYear()}`}</h3>
                  <p className="mt-0.5 text-sm text-slate-500" title="Nhập kho có ngày nhập trong kỳ của MỌI đơn (kể cả đơn đã xong), không tính hạng mục HỦY, không theo bộ lọc trang — khác số 'Đã nhập kho' ở trang Tổng quan công trình (chỉ đơn đang theo dõi, cộng mọi năm)">
                    {td.ghiChu} · tính tới {ngayNgan(ngayMoi)} · đơn vị tỷ đồng
                  </p>
                </div>
                <span className="flex items-center gap-1.5">
                  {tienDo === 'thang' && (
                    <span className="flex items-center gap-0.5">
                      <button type="button" onClick={() => setThangTD(m => Math.max(1, m - 1))} disabled={thangTD <= 1} aria-label="Tháng trước"
                        className="rounded px-1.5 text-slate-500 enabled:hover:bg-slate-100 enabled:hover:text-slate-900 disabled:opacity-30">‹</button>
                      <select value={thangTD} onChange={e => setThangTD(Number(e.target.value))} aria-label="Chọn tháng"
                        className="h-9 rounded-md border border-slate-300 bg-white px-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300">
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                          <option key={m} value={m}>Tháng {m}{m === ngayMoi.getMonth() + 1 ? ' (đang chạy)' : ''}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => setThangTD(m => Math.min(12, m + 1))} disabled={thangTD >= 12} aria-label="Tháng sau"
                        className="rounded px-1.5 text-slate-500 enabled:hover:bg-slate-100 enabled:hover:text-slate-900 disabled:opacity-30">›</button>
                    </span>
                  )}
                  <span className="flex overflow-hidden rounded-lg border border-slate-300" role="group" aria-label="Xem tiến độ theo">
                    {([['nam', 'Năm'], ['thang', 'Tháng']] as const).map(([k, l]) => (
                      <button key={k} type="button" onClick={() => setTienDo(k)} aria-pressed={tienDo === k}
                        className={`px-4 py-1.5 text-sm font-semibold ${tienDo === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{l}</button>
                    ))}
                  </span>
                  {!moChuY && (
                    <button type="button" onClick={() => setMoChuY(true)} title="Mở danh sách việc cần chú ý hôm nay"
                      className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3.5 text-sm font-semibold text-red-700 hover:bg-red-100">
                      Cần chú ý hôm nay
                      <span className={`rounded-full px-2 text-xs font-semibold ${canChuY.some(m => m.nhan === 'Trễ' || m.nhan === 'Vướng') ? 'bg-red-600 text-white' : 'bg-white text-slate-700'}`}>{canChuY.length}</span>
                    </button>
                  )}
                </span>
              </div>

              {/* 4 thẻ số */}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <button type="button" onClick={p.onThucHienNam} disabled={!p.onThucHienNam} title="Bấm để xem chi tiết nhập kho theo tháng / xưởng"
                  className={`${the} border-t-emerald-600 transition enabled:hover:shadow-md`}>
                  <span className={nhanThe}>Đã nhập kho {p.onThucHienNam && <span className="normal-case tracking-normal text-blue-600">Chi tiết ›</span>}</span>
                  <span className="mt-1 text-[2rem] font-extrabold leading-tight tabular-nums text-emerald-700">{formatTy(td.th)} <span className="text-base font-semibold text-slate-500">tỷ</span></span>
                  <span className="mt-0.5 text-sm text-slate-600">{td.kh > 0 && <><b className="text-emerald-700">{Math.round(phanTram)}%</b> kế hoạch {laNam ? 'năm' : 'tháng'} · </>}{td.daQua} ngày</span>
                </button>
                <button type="button" onClick={p.onKeHoachNam} disabled={!p.onKeHoachNam} title="Bấm để xem nhập kho so với kế hoạch theo tháng / xưởng"
                  className={`${the} border-t-slate-700 transition enabled:hover:shadow-md`}>
                  <span className={nhanThe}>Kế hoạch {laNam ? 'năm' : `tháng ${thangTD}`} {p.onKeHoachNam && <span className="normal-case tracking-normal text-blue-600">So KH ›</span>}</span>
                  <span className="mt-1 text-[2rem] font-extrabold leading-tight tabular-nums text-slate-900">{td.kh > 0 ? formatTy(td.kh) : '—'} <span className="text-base font-semibold text-slate-500">tỷ</span></span>
                  <span className="mt-0.5 text-sm text-slate-600">
                    {td.kh <= 0 ? 'Chưa có kế hoạch' : con > 0 ? <>Còn thiếu <b>{formatTy(con)} tỷ</b> · {td.conNgay} ngày ({LAM_CHU_NHAT ? 'tính cả CN' : 'T2–T7'}, tới {ngayNgan(td.cuoiKy)})</> : <b className="text-emerald-700">Đã đạt kế hoạch</b>}
                  </span>
                </button>
                <div className={`${the} border-t-red-600`}>
                  <span className={nhanThe}>Cần mỗi ngày</span>
                  <span className="mt-1 text-[2rem] font-extrabold leading-tight tabular-nums text-red-600">{can > 0 ? formatTy(can) : '—'} <span className="text-base font-semibold text-slate-500">tỷ/ngày</span></span>
                  <span className="mt-0.5 text-sm text-slate-600">
                    {can > 0 && bq > 0 ? <>gấp <b className="text-red-600">{(can / bq).toFixed(1)} lần</b> nhịp từ đầu {laNam ? 'năm' : 'tháng'} ({formatTy(bq)})</> : con <= 0 ? 'Đã đủ kế hoạch' : 'Chưa có nhịp để so'}
                  </span>
                </div>
                <div className={`${the} ${kip ? 'border-t-emerald-600' : 'border-t-amber-500 bg-amber-50/60'}`}>
                  <span className={nhanThe}>Dự kiến cuối {laNam ? 'năm' : 'tháng'}{bq > 0 && ` (giữ nhịp ${formatTy(bq)}/ngày)`}</span>
                  <span className={`mt-1 text-[2rem] font-extrabold leading-tight tabular-nums ${kip ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {coDuKien || con <= 0 ? formatTy(con <= 0 ? td.th : duKien) : '—'} {td.kh > 0 && (coDuKien || con <= 0) && <span className="text-base font-semibold text-slate-500">tỷ · {Math.round(con <= 0 ? phanTram : ptDuKien)}% KH</span>}
                  </span>
                  <span className="mt-0.5 text-sm text-slate-600">
                    {con <= 0 ? 'Đã đạt kế hoạch kỳ này'
                      : !coDuKien ? 'Chưa đủ số để dự kiến'
                      : kip ? <>Đủ kế hoạch vào khoảng <b className="text-emerald-700">{ngayDat ? ngayNgan(ngayDat) : ''}</b></>
                      : <>Thiếu <b className="text-red-600">{formatTy(td.kh - duKien)} tỷ</b>{ngayDat && <> · tới khoảng <b>{ngayNgan(ngayDat)}/{ngayDat.getFullYear()}</b> mới đủ KH</>}</>}
                  </span>
                </div>
              </div>

              {/* Thanh tiến độ */}
              {td.kh > 0 && (
                <div className="mt-4 rounded-xl border border-slate-200 px-4 pb-2 pt-3 sm:px-5">
                  <p className="text-base font-semibold text-slate-900">Tiến độ {tenKy} theo mốc {laNam ? 'quý' : mocTuan.length ? 'tuần' : 'ngày'}</p>
                  <p className="text-xs text-slate-500">
                    Xanh đậm = đã nhập{coDuKien && ' · sọc xanh = sẽ nhập thêm nếu giữ nhịp hiện tại'}{coDuKien && !kip && ' · khung đỏ = phần thiếu so với KH'} · cờ = KH cộng dồn {laNam ? 'từng quý' : 'tới mốc'}
                  </p>
                  <button type="button" onClick={p.onThucHienNam} disabled={!p.onThucHienNam} title="Bấm để xem nhập kho theo tháng / xưởng"
                    className="relative mt-[4.5rem] block h-11 w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                    <span className="absolute inset-0 rounded-lg bg-slate-100 ring-1 ring-inset ring-slate-200" />
                    {coDuKien && xDk > xTh && (
                      <span className="absolute inset-y-0" style={{ left: `${xTh}%`, width: `${xDk - xTh}%`, background: 'repeating-linear-gradient(135deg,#a7f3d0 0 8px,#d1fae5 8px 16px)' }} />
                    )}
                    {coDuKien && !kip && xDk < 100 && (
                      <span className="absolute inset-y-0 right-0 flex items-center justify-center rounded-r-lg border-2 border-l-0 border-dashed border-red-300 bg-red-50 text-base font-extrabold tabular-nums text-red-700"
                        style={{ left: `${xDk}%` }}>
                        {100 - xDk > 9 ? `thiếu ${formatTy(td.kh - duKien)}` : ''}
                      </span>
                    )}
                    <span className={`absolute inset-y-0 left-0 flex items-center justify-end bg-emerald-600 pr-3 text-xl font-extrabold tabular-nums text-white ${xTh >= 99.5 ? 'rounded-lg' : 'rounded-l-lg'}`}
                      style={{ width: `${xTh}%` }}>
                      {xTh > 8 ? `${Math.round(phanTram)}%` : ''}
                    </span>
                    {/* Nhãn "Hôm nay" / "Dự kiến": 2 vạch gần nhau (cuối kỳ còn ít ngày) => gộp 1 nhãn khỏi đè chữ */}
                    {coDuKien && <span className="absolute inset-y-0 border-l-2 border-dashed border-teal-700" style={{ left: `${xDk}%` }} />}
                    {dangChayKy && coDuKien && xDk - xTh < 30 ? (
                      <span className="absolute -top-[4.25rem] right-0 whitespace-nowrap text-sm font-bold">
                        <span className="text-emerald-700">▼ Hôm nay {ngayNgan(ngayMoi)}</span>
                        <span className="text-teal-700"> · Dự kiến {ngayNgan(td.cuoiKy)}: {formatTy(duKien)} ({Math.round(ptDuKien)}%)</span>
                      </span>
                    ) : (<>
                      {dangChayKy && (
                        <span className={`absolute -top-[4.25rem] whitespace-nowrap text-sm font-bold text-emerald-700 ${xTh > 15 ? '-translate-x-full' : ''}`} style={{ left: `${xTh}%` }}>
                          ▼ Hôm nay {ngayNgan(ngayMoi)}
                        </span>
                      )}
                      {coDuKien && (
                        <span className="absolute -top-[4.25rem] whitespace-nowrap pl-3 text-sm font-bold text-teal-700"
                          style={xDk > 72 ? { right: 0 } : { left: `${xDk}%` }}>
                          Dự kiến {ngayNgan(td.cuoiKy)}: {formatTy(duKien)} ({Math.round(ptDuKien)}%)
                        </span>
                      )}
                    </>)}
                    {moc.map(m => {
                      const x = pt(m.v);
                      const datMoc = td.th >= m.v;
                      // Mốc đang chạy chưa tới cuối => cam (chưa thể kết luận trễ); chưa tới => xám
                      const mau = datMoc ? '#047857' : m.chuaToi ? '#94a3b8' : m.dangChay ? '#d97706' : '#dc2626';
                      const trangThai = datMoc ? '✓ đạt' : m.chuaToi ? 'chưa tới' : m.dangChay ? 'đang chạy' : '✗ trễ';
                      const sat = x > 95;
                      return (
                        <span key={m.ten}>
                          {/* cờ: mốc sát mép phải vẽ quay sang trái (cán bên phải) để không tràn khung */}
                          <svg className="absolute -top-[2.1rem] h-[1.9rem] w-[1.4rem]" style={sat ? { left: `calc(${x}% - 1.33rem)` } : { left: `calc(${x}% - 1px)` }} viewBox="0 0 12 16" aria-hidden>
                            {sat
                              ? <><path d="M11 0v16" stroke={mau} strokeWidth="1.5" /><path d="M11 1H1l3 4-3 4h10z" fill={mau} /></>
                              : <><path d="M1 0v16" stroke={mau} strokeWidth="1.5" /><path d="M1 1h10l-3 4 3 4H1z" fill={mau} /></>}
                          </svg>
                          <span className="absolute -bottom-1.5 -top-1.5 border-l-2" style={{ left: x >= 99.9 ? 'calc(100% - 2px)' : `${x}%`, borderColor: mau }} />
                          <span className={`absolute top-[3.4rem] flex flex-col whitespace-nowrap text-sm leading-snug tabular-nums ${sat ? '-translate-x-full items-end' : x < 5 ? 'items-start' : '-translate-x-1/2 items-center'}`}
                            style={{ left: `${x}%`, color: mau }}>
                            <span><b>{m.ten}</b> · {trangThai}</span>
                            <b className="text-base">{formatTy(m.v)}</b>
                          </span>
                        </span>
                      );
                    })}
                  </button>
                  <span className="block h-[4.25rem]" />

                  {tienDo === 'thang' && tuanMT.length > 0 && (<>
                  <p className="mb-2 text-sm text-slate-500">Từng tuần: <b className="font-semibold text-slate-700">TH / mục tiêu</b> — chỉ tính các ngày nằm trong tháng {thangTD}; cộng các tuần = KH tháng</p>
                  <div className="mt-1 grid gap-3" style={{ gridTemplateColumns: `repeat(${tuanMT.length}, minmax(0, 1fr))` }}>
                    {tuanMT.map(w => {
                      // Tuần chưa tới: đề xuất = mức cần mỗi ngày (để bù phần còn thiếu của tháng) × số ngày làm việc trong tháng
                      const deXuat = canMoiNgayKy * w.ngayTrong;
                      const dangChay = ngayMoi >= w.tu && ngayMoi <= w.den;
                      const chuaToi = ngayMoi < w.tu;
                      const catThang = w.ngayTrong < 6 && w.kh > 0; // tuần giáp tháng: KH tuần chỉ tính phần ngày trong tháng
                      const thangKia = w.tu.getMonth() !== thangTD - 1 ? w.tu.getMonth() + 1 : w.den.getMonth() + 1;
                      const pt = w.muc > 0 ? Math.round((w.thTrong / w.muc) * 100) : null;
                      const mau = chuaToi ? 'text-slate-400' : pt === null ? 'text-slate-500' : pt >= 100 ? 'text-emerald-700' : dangChay ? 'text-amber-700' : 'text-red-600';
                      const nen = chuaToi ? 'bg-slate-300' : pt !== null && pt >= 100 ? 'bg-emerald-600' : dangChay ? 'bg-amber-500' : 'bg-red-500';
                      // Nguồn mục tiêu — ghi rõ phần KH tuần thuộc tháng nào (tuần giáp 2 tháng)
                      const nguon = !w.tuKh ? 'Chưa có KH tuần · chia từ KH tháng'
                        : catThang ? `KH tuần ${formatTy(w.kh)}: ${formatTy(w.muc)} thuộc T${thangTD} · ${formatTy(w.kh - w.muc)} thuộc T${thangKia}`
                        : `Theo KH tuần ${formatTy(w.kh)}`;
                      const chon = tuanChon?.tuan === w.tuan;
                      return (
                        <button type="button" key={w.tuan} onClick={() => setTuanChon(c => (c?.tuan === w.tuan ? null : w))} aria-pressed={chon}
                          title={`${nguon}${catThang ? `
TH cả tuần (kể cả T${thangKia}): ${formatTy(w.th)}` : ''}
${chon ? 'Bấm lần nữa để bỏ chọn tuần' : 'Bấm để xem nhập kho từng ngày của tuần này'}`}
                          className={`flex min-w-0 flex-col rounded-xl px-4 py-3 text-left transition ${chon ? 'bg-slate-900 text-white ring-1 ring-slate-900 [&_*]:!text-white' : `bg-white hover:ring-slate-400 ring-1 ${dangChay ? 'ring-slate-900' : 'ring-slate-200'}`}`}>
                          <span className="flex items-baseline justify-between gap-1 text-sm text-slate-500">
                            <span className="text-base font-semibold text-slate-800">Tuần {w.tuan}</span>
                            <span className="truncate">{ngayNgan(w.tu)}–{ngayNgan(w.den)}</span>
                          </span>
                          {/* TH / mục tiêu + % trên 1 hàng; thanh nhỏ = % đạt */}
                          <span className="mt-2 flex items-baseline gap-1.5 tabular-nums">
                            <b className="text-2xl font-bold text-slate-900">{chuaToi ? '—' : formatTy(w.thTrong)}</b>
                            <span className="text-sm text-slate-500">/ {formatTy(w.muc)}</span>
                            <span className={`ml-auto text-lg font-bold ${mau}`}>{chuaToi ? 'chưa tới' : pt === null ? '—' : `${pt}%`}</span>
                          </span>
                          <span className="mt-2 block h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                            <span className={`block h-full rounded-full ${nen}`} style={{ width: `${chuaToi || pt === null ? 0 : Math.min(100, pt)}%` }} />
                          </span>
                          <span className="mt-1.5 line-clamp-2 text-xs leading-snug text-slate-500">
                            {nguon}{chuaToi && deXuat > 0 && Math.abs(deXuat - w.muc) > 0.01 ? ` · cần ≈ ${formatTy(deXuat)} để bù` : ''}{dangChay ? ' · đang chạy' : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  </>)}
                </div>
              )}
            </>);
          })()}

          {/* Nhập kho mỗi ngày */}
          <div className="mt-4 rounded-xl border border-slate-200 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-slate-900">Nhập kho mỗi ngày</p>
                {tuanChon ? (
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-sm text-slate-500">
                    <b className="font-semibold text-slate-900">Tuần {tuanChon.tuan}</b> ({ngayNgan(tuanChon.tu)}–{ngayNgan(tuanChon.den)}) ·
                    Mục tiêu <b className="font-semibold text-slate-900">{formatTy(mucTuan)}</b> · TH <b className="font-semibold text-slate-900">{formatTy(thTuan)}</b>
                    {mucTuan > 0 && <> · <b className={`font-semibold ${thTuan >= mucTuan ? 'text-emerald-700' : 'text-red-600'}`}>{Math.round((thTuan / mucTuan) * 100)}%</b></>}
                    <button type="button" onClick={() => setTuanChon(null)} className="ml-1 rounded-full border border-slate-300 px-2 text-xs text-slate-600 hover:bg-slate-50">✕ bỏ chọn tuần</button>
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {LAM_CHU_NHAT ? 'Tính cả Chủ nhật' : 'T2–T7'}{nguongDat > 0 && ` · cột xanh = đạt ${tenNguong}, đỏ = dưới`}
                    {vungHong && ` · vùng hồng = khoảng từ KH tháng tới mức cần để kịp ${tenKh}`}
                  </p>
                )}
              </div>
              <span className="flex flex-wrap items-center gap-2">
                <DashboardFilter label="Xưởng" options={dsXuong} selectedValues={locXuong} onChange={setLocXuong}
                  emptyLabel="Tất cả" onClearAll={() => setLocXuong([])} />
                <DashboardFilter label="Công trình" options={dsCt} selectedValues={locCt} onChange={setLocCt}
                  emptyLabel="Tất cả" onClearAll={() => setLocCt([])} />
                {locDangBat && <button type="button" onClick={() => { setLocXuong([]); setLocCt([]); }} className="text-xs text-slate-500 underline hover:text-slate-900">Bỏ lọc</button>}
                {locDangBat && !nkLoc && <span className="text-xs text-slate-400">đang tải…</span>}
              </span>
            </div>
            {locDangBat && (
              <p className="mt-1 text-xs text-slate-500">
                Đang xem: <b className="font-semibold text-slate-800">{[locXuong.length ? `xưởng ${locXuong.join(', ')}` : '', locCt.length ? `${locCt.length} công trình` : ''].filter(Boolean).join(' · ')}</b>
                {khLoc && !khLoc.coKh ? ' · KH chỉ lập theo xưởng nên không có đường kế hoạch / mức cần' : ' · đường kế hoạch & mức cần tính theo KH của xưởng đã chọn'}
              </p>
            )}
            <div className="mt-3 flex flex-col gap-4 lg:flex-row">
              <div className="h-[26rem] min-w-0 flex-1">
              {duLieu.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">Chưa có số liệu nhập kho trong kỳ</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={duLieuVe} margin={{ top: 32, right: 12, left: -8, bottom: 0 }} barCategoryGap="22%" barGap={2}>
                    <CartesianGrid vertical={false} stroke="#eef0f3" />
                    <XAxis dataKey="ten" tickLine={false} axisLine={{ stroke: '#d5d9e0' }} interval={duLieu.length > 16 ? 1 : 0} height={42}
                      tick={({ x, y, payload, index }: { x: number; y: number; payload: { value: string }; index: number }) => {
                        // Ngày + thứ trong tuần (CN tô đỏ nhạt)
                        const d = parseVNDate(duLieuVe[index]?.ngay ?? '');
                        const thu = d ? (d.getDay() === 0 ? 'CN' : `T${d.getDay() + 1}`) : '';
                        return (
                          <g transform={`translate(${x},${y})`}>
                            <text dy={14} textAnchor="middle" fontSize={14} fontWeight={600} fill="#334155">{payload.value}</text>
                            <text dy={30} textAnchor="middle" fontSize={11} fill={thu === 'CN' ? '#f87171' : '#94a3b8'}>{thu}</text>
                          </g>
                        );
                      }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 13, fill: '#64748b' }} width={44}
                      domain={[0, (m: number) => Math.ceil(Math.max(m, canMoiNgay, mucKhThang) * 1.18)]} allowDecimals={false} />
                    <Tooltip cursor={{ fill: '#f5f6f8' }}
                      formatter={(v: number, k: string) => (v > 0 ? [`${formatTy(v)} tỷ`, k === 'de' ? 'Đề xuất (để đạt KH)' : k === 'kh' ? 'Kế hoạch ngày (KH tuần)' : 'Nhập kho'] : [null, null]) as [string, string]}
                      labelFormatter={(_, pl) => (pl?.[0]?.payload?.ngay ? ngayNgan(parseVNDate(pl[0].payload.ngay) ?? new Date()) : '')}
                      contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    {vungHong && <ReferenceArea y1={mucKhThang} y2={canMoiNgay} fill="#fef2f2" fillOpacity={0.9} ifOverflow="extendDomain" />}
                    {canMoiNgay > 0 && <ReferenceLine y={canMoiNgay} stroke="#dc2626" strokeWidth={2} strokeDasharray="7 4" />}
                    {!tuanChon && mucKhThang > 0 && <ReferenceLine y={mucKhThang} stroke="#059669" strokeWidth={2} strokeDasharray="10 4" />}
                    {binhQuan > 0 && <ReferenceLine y={binhQuan} stroke="#2563eb" strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="2 3" />}
                    {/* Kế hoạch ngày: cột xanh dương nhạt, bên trái cột nhập kho cùng ngày */}
                    {coKhNgay && (
                      <Bar dataKey="kh" radius={[6, 6, 0, 0]} maxBarSize={40} isAnimationActive={false} fill="#dbeafe" stroke="#2563eb" strokeWidth={1.2}>
                        <LabelList dataKey="kh" content={(lp: { x?: number | string; y?: number | string; width?: number | string; value?: number | string }) => {
                          const v = Number(lp.value);
                          if (!(v > 0)) return null;
                          return <text x={Number(lp.x) + Number(lp.width) / 2} y={Number(lp.y) - 6} textAnchor="middle" fontSize={14} fontWeight={600} fill="#1d4ed8">{formatTy(v)}</text>;
                        }} />
                      </Bar>
                    )}
                    <Bar dataKey="v" stackId="nk" radius={[6, 6, 0, 0]} maxBarSize={56} isAnimationActive={false}>
                      {duLieu.map(d => <Cell key={d.ngay} fill={!(nguongDat > 0) ? '#3b82f6' : d.v >= nguongDat ? '#12805c' : '#e8484d'} />)}
                      <LabelList dataKey="v" content={(lp: { x?: number | string; y?: number | string; width?: number | string; value?: number | string; index?: number }) => {
                        if (duLieu[lp.index ?? -1]?.de > 0) return null; // ngày đề xuất: nhãn nằm trên cột đề xuất
                        const x = Number(lp.x) + Number(lp.width) / 2, y = Number(lp.y), v = Number(lp.value);
                        return v > 0
                          ? <text x={x} y={y - 7} textAnchor="middle" fontSize={16} fontWeight={700} fill="#16181d">{formatTy(v)}</text>
                          : <text x={x} y={y - 6} textAnchor="middle" fontSize={13} fill="#8a90a0">chưa có số</text>;
                      }} />
                    </Bar>
                    {/* Đề xuất: ngày chưa tới — cần nhập bao nhiêu mỗi ngày để đạt KH (khung nét đứt, nền nhạt) */}
                    <Bar dataKey="de" stackId="nk" radius={[6, 6, 0, 0]} maxBarSize={56} isAnimationActive={false}
                      fill="#f1f5f9" stroke="#94a3b8" strokeDasharray="4 3" strokeWidth={1.2}>
                      <LabelList dataKey="de" content={(lp: { x?: number | string; y?: number | string; width?: number | string; value?: number | string; index?: number }) => {
                        const v = Number(lp.value);
                        // Các ngày đề xuất cùng 1 mức => chỉ ghi số ở cột đầu (đỡ rối)
                        if (!(v > 0) || (lp.index ?? 0) !== duLieu.findIndex(d => d.de > 0)) return null;
                        return <text x={Number(lp.x) + Number(lp.width) / 2} y={Number(lp.y) - 6} textAnchor="middle" fontSize={14} fontWeight={600} fill="#64748b">{formatTy(v)}</text>;
                      }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              </div>
              {/* Tóm tắt các đường ngang (thay nhãn dính mép phải + chú thích dưới biểu đồ) */}
              <div className="flex shrink-0 flex-wrap gap-x-6 gap-y-3 lg:w-60 lg:flex-col lg:justify-center">
                {canMoiNgay > 0 && (
                  <div className="border-l-4 border-red-600 pl-3">
                    <b className="text-xl tabular-nums text-red-600">{formatTy(canMoiNgay)}</b>
                    <p className="text-sm text-slate-600">Cần / ngày để đạt {tuanChon ? `mục tiêu tuần ${tuanChon.tuan}` : tenKh}</p>
                  </div>
                )}
                {binhQuan > 0 && (
                  <div className="border-l-4 border-blue-600 pl-3">
                    <b className="text-xl tabular-nums text-blue-600">{formatTy(binhQuan)}</b>
                    <p className="text-sm text-slate-600">Bình quân {nkCoSo.length} ngày có số</p>
                  </div>
                )}
                {!tuanChon && mucKhThang > 0 && (
                  <div className="border-l-4 border-emerald-600 pl-3" title={`KH tháng ${thangKh} ${formatTy(khThang)} tỷ chia đều ${LAM_CHU_NHAT ? 'mọi ngày (cả Chủ nhật)' : 'ngày làm việc (T2–T7)'}`}>
                    <b className="text-xl tabular-nums text-emerald-700">{formatTy(mucKhThang)}</b>
                    <p className="text-sm text-slate-600">KH tháng {thangKh} / ngày</p>
                  </div>
                )}
              </div>
            </div>
            {(coKhNgay || coDeXuat) && (
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-600">
                {coKhNgay && <span className="inline-flex items-center gap-1.5" title="Kế hoạch tuần (bảng KHSX) theo ngày kế hoạch nhập kho, theo xưởng / công trình đang lọc"><i className="h-3 w-3 rounded-sm border border-blue-600 bg-blue-100" />Kế hoạch ngày (KH tuần)</span>}
                {coDeXuat && <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm border border-dashed border-slate-400 bg-slate-100" />Đề xuất mỗi ngày để đạt {tuanChon ? `KH tuần ${tuanChon.tuan}` : tenKh}</span>}
              </div>
            )}
          </div>
        </div>

        {moChuY && (
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 lg:p-6">
          <div className="flex items-center gap-2">
            <h3 className="flex-1 text-lg font-semibold text-slate-900">Cần chú ý hôm nay</h3>
            <button type="button" onClick={() => setMoChuY(false)} aria-label="Ẩn khung cần chú ý" title="Ẩn — biểu đồ mở rộng hết chiều ngang"
              className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900">Ẩn ✕</button>
          </div>
          {canChuY.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Không có việc cần xử lý.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {canChuY.map((m, i) => {
                const noi = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.9375rem] font-medium text-slate-900">{m.ten}</span>
                      <span className="block text-sm text-slate-500">{m.phu}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${m.mau}`}>{m.nhan}</span>
                  </>
                );
                const cls = 'flex w-full items-start gap-3 rounded-lg px-1 py-3 text-left hover:bg-slate-50';
                return (
                  <li key={i}>
                    {m.to ? <Link to={m.to} className={cls}>{noi}</Link>
                      : m.bam ? <button type="button" onClick={m.bam} className={cls}>{noi}</button>
                      : <div className={cls}>{noi}</div>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        )}
      </div>
    </div>
  );
};
