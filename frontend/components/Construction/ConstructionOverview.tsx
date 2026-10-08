import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts';
import { Search, X, Filter, ChevronRight } from 'lucide-react';
import { ModalShell } from '../shared/ModalShell';
import { DashboardFilter } from '../Dashboard/components/shared/DashboardFilter';
import { exportOrderMixExcel } from '../Dashboard/utils/orderMixExport';
import { DataRow, ColumnDefinition, TARGET_COLUMN_NAMES } from '../../types';
import { findColumnKey } from '../Dashboard/utils/columnKeyResolver';
import { parseNumber } from '../Dashboard/utils/numberParsers';
import { deadlineOf, resolveDeadlineKeys } from '../../utils/productionMetrics';
import { STATUS_GROUPS } from '../Dashboard/constants';
import SearchableSelect from '../Dashboard/components/Dashboards/SearchableSelect';
import { HexDetailModal, type HexDetailColumnKeys } from '../Dashboard/components/modals/HexDetailModal';
import { ProjectHealthModal, type ProjectHealthKeys } from './ProjectHealthModal';
import { OrderMixCard, OTHERS, TOP_CUSTOMERS, groupTopN, aggregateMix, orderMix, projectKeyResolver } from '../Dashboard/components/shared/ProductionDonutPanel';
import { formatTy, formatTrieuAsTy } from '../../utils/money';
// ============================================================
// Báo cáo tiến độ công trình — dựng hoàn toàn từ productionData (không cần API mới)
// Đơn vị tiền gốc là TRIỆU ĐỒNG (xem utils/money.ts)  =>  Tỷ = giá trị gốc / 1,000
// ============================================================

type Status = 'HOÀN THÀNH' | 'CÓ PHIẾU SX' | 'CHƯA TKSX' | 'CẦN XỬ LÝ' | 'TẠM NGƯNG' | 'HỦY';
type FKey = 'ct' | 'pm' | 'pc' | 'kv' | 'kh' | 'pl' | 'month';
type Filters = Partial<Record<FKey, string | undefined>>;

interface Rec {
  ct: string; pm: string; pc: string; kv: string; kh: string; pl: string;
  ctKey: string;      // khoá ĐẾM công trình: mã công trình -> tên chuẩn (xem projectKeyResolver)
  month: string;      // 'YYYY-MM' hoặc 'none'
  status: Status;
  total: number;      // trị giá đơn hàng (0 nếu hủy)
  done: number;       // giá trị đã nhập kho, tối đa = total
  row: DataRow;       // dòng gốc — để mở cửa sổ danh sách HEX
  ipo: string;        // Tình trạng IPO gốc (đã trim) — cho bộ lọc Tình trạng IPO
}

// Mặc định không lọc Tình trạng IPO: các ô KPI hiện tổng toàn bộ công trình, chỉ đổi khi người dùng chọn lọc
const DEFAULT_IPO: string[] = [];

const NO_DATA = '(Chưa có)';
const NO_MONTH = 'none';

const FILTER_LABEL: Record<FKey, string> = {
  ct: 'Công trình', pm: 'PM', pc: 'PC', kv: 'Khu vực', kh: 'Khách hàng', pl: 'Nhóm SP', month: 'Tháng hạn',
};

const COLOR_DONE = '#16a34a';
const COLOR_REMAIN = '#f59e0b';
// Giá trị gốc tính theo triệu đồng (khớp backend TRIEU_TO_TY) => Tỷ = giá trị gốc / 1,000
const UNIT = 1000;
const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
const fmtTy = formatTrieuAsTy;
const monthLabel = (key: string) => {
  if (key === NO_MONTH) return 'Chưa có hạn';
  const [y, m] = key.split('-');
  return `T${m}/${y}`;
};

// Ô số liệu trong cửa sổ chi tiết PC
const PcStat = ({ label, value, unit, sub, tone = 'text-slate-900', active = false }: {
  label: string; value: string; unit?: string; sub?: string; tone?: string; active?: boolean;
}) => (
  <div className={`rounded-lg border px-3 py-2 ${active ? 'border-slate-900 bg-white ring-1 ring-slate-900' : 'border-slate-200 bg-slate-50'}`}>
    <p className="text-[0.6875rem] text-slate-500">{label}</p>
    <p className={`text-xl font-semibold tabular-nums ${tone}`}>
      {value}{unit && <span className="ml-1 text-xs font-medium text-slate-400">{unit}</span>}
    </p>
    {sub && <p className="text-[0.625rem] tabular-nums text-slate-400">{sub}</p>}
  </div>
);

// Mô tả 1 cửa sổ chi tiết (cấp 1)
type DetailFocus = 'items' | 'total' | 'done' | 'remain';
interface DetailSpec {
  eyebrow: string;          // dòng nhỏ phía trên tiêu đề, vd. "Chỉ số", "Tháng hạn giao", "Người phụ trách (PC)"
  title: string;
  /** Bộ lọc của trang được BỎ QUA khi lấy dòng (giống cách ô/cột/bảng đó được tính) */
  exclude?: FKey;
  /** Điều kiện dòng thuộc con số đã bấm */
  pred: (r: Rec) => boolean;
  /** Chỉ số đang xem — được tô đậm và dùng để sắp xếp danh sách công trình */
  focus: DetailFocus;
  /** Có giá trị => hiện nút "Lọc cả trang theo …" */
  filter?: { key: FKey; value: string };
  /** Giải thích cách tính, hiện dưới tiêu đề */
  note?: string;
}

/** Tối đa số HEX cho nút "Xem tất cả HEX" (cửa sổ HEX hiển thị toàn bộ dòng, không phân trang) */
const MAX_HEX_ALL = 3000;

const isNotStarted = (status: string) => STATUS_GROUPS.CHUA_THE_SX.some(s => status.includes(s));

interface Props {
  data: DataRow[];
  columns: ColumnDefinition[];
  /** Tài khoản đang đăng nhập (ghi chú / vướng mắc trong cửa sổ HEX) */
  currentUser?: string;
}

const ConstructionOverview: React.FC<Props> = ({ data, columns, currentUser = '' }) => {
  // Cửa sổ chi tiết (cấp 1): ô KPI / cột tháng / PC — liệt kê công trình; bấm công trình mở HEX (cấp 2)
  const [detail, setDetail] = useState<DetailSpec | null>(null);
  const [detailSearch, setDetailSearch] = useState('');
  // Cửa sổ danh sách HEX: ct = công trình (null = mọi công trình trong cửa sổ chi tiết);
  // inDetail = lấy trong phạm vi cửa sổ chi tiết đang mở, ngược lại theo dòng bảng công trình
  const [hexScope, setHexScope] = useState<{ ct: string | null; inDetail: boolean } | null>(null);
  // Tổng quan 1 công trình (BOT / BOP / BOM) — mở khi bấm 1 dòng trong bảng công trình
  // inDetail = mở từ cửa sổ chi tiết (vd PC): chỉ tính các dòng trong phạm vi cửa sổ đó
  const [health, setHealth] = useState<{ ct: string; inDetail: boolean } | null>(null);
  const healthCt = health?.ct ?? null;
  const [f, setF] = useState<Filters>({});
  const [ipoSel, setIpoSel] = useState<string[]>(DEFAULT_IPO);
  const [metric, setMetric] = useState<'count' | 'value'>('count'); // cho 3 biểu đồ tròn
  const [ctSearch, setCtSearch] = useState('');

  const toggle = (k: FKey, v: string) => setF(p => ({ ...p, [k]: p[k] === v ? undefined : v }));
  const setKey = (k: FKey, v: string) => setF(p => ({ ...p, [k]: v || undefined }));
  const activeKeys = (Object.keys(f) as FKey[]).filter(k => f[k]);

  // Đã nhập kho đủ trị giá đơn hàng (dùng chung cho ô KPI và popup chi tiết)
  const isStocked = (r: Rec) => r.status !== 'HỦY' && r.total > 0 && r.done >= r.total;

  // ---------- 1. Chuẩn hoá từng dòng 1 lần ----------
  const allRecords = useMemo<Rec[]>(() => {
    const key = (target: string, fallback: string) => findColumnKey(columns, target) || fallback;
    const ctK = key(TARGET_COLUMN_NAMES.CONG_TRINH, 'ten_cong_trinh');
    const pmK = key('ten_pm', 'ten_pm');
    const pcK = key('ten_pc', 'ten_pc');
    const kvK = key('khu_vuc_du_an', 'khu_vuc_du_an');
    const khK = key('khach_hang', 'khach_hang');
    const plK = key(TARGET_COLUMN_NAMES.PHAN_LOAI_NHOM_SAN_PHAM, 'phan_loai_nhom_san_pham');
    const dlKeys = resolveDeadlineKeys(columns);
    const stK = key(TARGET_COLUMN_NAMES.TINH_TRANG, 'tinh_trang');
    const ipoK = key(TARGET_COLUMN_NAMES.TINH_TRANG_IPO, 'tinh_trang_ipo');
    const totK = key(TARGET_COLUMN_NAMES.TRI_GIA_DON_HANG_TONG, 'tri_gia_don_hang_tong');
    const invK = key(TARGET_COLUMN_NAMES.THANH_TIEN_NHAP_KHO, 'thanh_tien_nhap_kho_luy_ke');
    const maK = key(TARGET_COLUMN_NAMES.MA_CONG_TRINH, 'ma_cong_trinh');
    const projectKey = projectKeyResolver(data, maK, ctK);

      const txt = (v: unknown) => {
      const t = String(v ?? '').trim();
      return !t || t.startsWith('#') ? NO_DATA : t;
    };

    const out: Rec[] = [];
    for (const row of data) {
      const ct = String(row[ctK] ?? '').trim();
      if (!ct) continue;

      const ipo = String(row[ipoK] ?? '').toUpperCase();
      const st = String(row[stK] ?? '').toUpperCase();
      const totalRaw = parseNumber(row[totK]);
      const invRaw = parseNumber(row[invK]);

      // Ưu tiên cột Tình trạng IPO (nguồn chính thức); riêng "01. ĐANG SẢN XUẤT" thì chia tiếp
      // thành CHƯA TKSX / CÓ PHIẾU SX theo cột Tình trạng (công đoạn).
      let status: Status;
      if (ipo.includes('HỦY')) status = 'HỦY';
      else if (ipo.includes('HOÀN THÀNH')) status = 'HOÀN THÀNH';
      else if (ipo.includes('TẠM NGƯNG')) status = 'TẠM NGƯNG';
      else if (ipo.includes('CẦN XỬ LÝ')) status = 'CẦN XỬ LÝ';
      else if (STATUS_GROUPS.CHUA_THE_SX.some(s => st.includes(s))) status = 'CHƯA TKSX';
      else status = 'CÓ PHIẾU SX';

      // Tháng hạn = KH nhập kho tuần → KH nhập kho tháng → ngày cần giao (quy tắc chung)
      const d = deadlineOf(row, dlKeys).date;
      const month = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : NO_MONTH;

      const cancelled = status === 'HỦY';
      out.push({
        ct, ctKey: projectKey(row), pm: txt(row[pmK]), pc: txt(row[pcK]), kv: txt(row[kvK]), kh: txt(row[khK]), pl: txt(row[plK]),
        ipo: String(row[ipoK] ?? '').trim(),
        month, status,
        total: cancelled ? 0 : totalRaw,
        done: cancelled ? 0 : Math.min(Math.max(invRaw, 0), totalRaw),
        row,
      });
    }

    // Tên hiển thị của 1 công trình = cách viết xuất hiện nhiều nhất trong các dòng cùng khoá
    // (mã công trình -> tên chuẩn). Gán lại `ct` để MỌI danh sách / bộ lọc / số đếm trên trang
    // cùng gom theo 1 khoá — tránh cảnh ô "Công trình" ra 387 mà danh sách lại 402 dòng.
    const nameCount = new Map<string, Map<string, number>>();
    for (const r of out) {
      let m = nameCount.get(r.ctKey);
      if (!m) { m = new Map(); nameCount.set(r.ctKey, m); }
      m.set(r.ct, (m.get(r.ct) ?? 0) + 1);
    }
    const displayName = new Map<string, string>();
    nameCount.forEach((m, k) => {
      let best = '', bestN = -1;
      m.forEach((n, name) => { if (n > bestN || (n === bestN && name < best)) { best = name; bestN = n; } });
      displayName.set(k, best);
    });
    for (const r of out) r.ct = displayName.get(r.ctKey) ?? r.ct;
    return out;
  }, [data, columns]);

  // Bộ lọc Tình trạng IPO (mặc định: tất cả — hiện tổng toàn bộ công trình),
  // áp cho TOÀN BỘ trang trước mọi bộ lọc khác.
  const ipoOptions = useMemo(
    () => [...new Set(allRecords.map(r => r.ipo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')),
    [allRecords]
  );
  const records = useMemo(() => {
    if (ipoSel.length === 0) return allRecords;
    const set = new Set(ipoSel);
    return allRecords.filter(r => set.has(r.ipo));
  }, [allRecords, ipoSel]);

  // Lọc chéo: mỗi biểu đồ bỏ qua bộ lọc của chính nó để vẫn đổi được lựa chọn
  const apply = (exclude?: FKey) =>
    records.filter(r => activeKeys.every(k => k === exclude || r[k] === f[k]));

  const rowsAll = useMemo(() => apply(), [records, f]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- 2. KPI ----------
  // Hạng mục "đã nhập kho" = đã nhập kho ĐỦ trị giá đơn hàng (cùng nguồn với giá trị đã nhập kho);
  // còn lại (chưa nhập hoặc mới nhập 1 phần) là "chưa nhập kho". Đơn HỦY tính riêng.
  const kpi = useMemo(() => {
    const cts = new Set<string>();
    let cancelled = 0, stocked = 0, notStocked = 0, partial = 0, total = 0, done = 0;
    for (const r of rowsAll) {
      cts.add(r.ctKey);
      if (r.status === 'HỦY') cancelled++;
      else if (isStocked(r)) stocked++;
      else { notStocked++; if (r.done > 0) partial++; }
      total += r.total; done += r.done;
    }
    return { cts: cts.size, items: rowsAll.length, cancelled, stocked, notStocked, partial, total, done, remain: total - done };
  }, [rowsAll]);

  // ---------- 3. Cột chồng theo tháng hạn giao ----------
  const monthData = useMemo(() => {
    const m = new Map<string, { key: string; done: number; remain: number }>();
    for (const r of apply('month')) {
      const e = m.get(r.month) ?? { key: r.month, done: 0, remain: 0 };
      e.done += r.done; e.remain += r.total - r.done;
      m.set(r.month, e);
    }
    return [...m.values()]
      .sort((a, b) => (a.key === NO_MONTH ? 1 : b.key === NO_MONTH ? -1 : a.key.localeCompare(b.key)))
      .map(e => ({ ...e, label: monthLabel(e.key), done: e.done / UNIT, remain: e.remain / UNIT }));
  }, [records, f]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- 4. Biểu đồ tròn ----------
  const donut = (k: 'kv' | 'kh' | 'pl') => aggregateMix(apply(k), r => r[k], r => r.ctKey, r => r.total, metric);
  const kvData = useMemo(() => orderMix(donut('kv')), [records, f, metric]);       // eslint-disable-line react-hooks/exhaustive-deps
  const khData = useMemo(() => orderMix(groupTopN(donut('kh'), TOP_CUSTOMERS, f.kh ? [f.kh] : [])), [records, f, metric]); // eslint-disable-line react-hooks/exhaustive-deps
  const plData = useMemo(() => orderMix(donut('pl')), [records, f, metric]);       // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- 5. Bảng theo PC và theo công trình ----------
  const pcTable = useMemo(() => {
    const m = new Map<string, { name: string; cts: Set<string>; items: number; total: number }>();
    for (const r of apply('pc')) {
      const e = m.get(r.pc) ?? { name: r.pc, cts: new Set<string>(), items: 0, total: 0 };
      e.cts.add(r.ctKey); e.items++; e.total += r.total;
      m.set(r.pc, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total || b.items - a.items);
  }, [records, f]); // eslint-disable-line react-hooks/exhaustive-deps

  const ctTable = useMemo(() => {
    const q = ctSearch.trim().toLowerCase();
    const m = new Map<string, { name: string; pms: Set<string>; items: number; total: number; done: number }>();
    for (const r of apply('ct')) {
      if (q && !r.ct.toLowerCase().includes(q)) continue;
      const e = m.get(r.ct) ?? { name: r.ct, pms: new Set<string>(), items: 0, total: 0, done: 0 };
      e.pms.add(r.pm); e.items++; e.total += r.total; e.done += r.done;
      m.set(r.ct, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total || b.items - a.items);
  }, [records, f, ctSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- 6. Cửa sổ HEX của 1 công trình ----------
  // Cùng phạm vi với dòng bảng đã bấm: áp mọi bộ lọc đang chọn (trừ lọc công trình) — số HEX = cột "Mục"
  // ---------- 7. Cửa sổ chi tiết (KPI / tháng hạn giao / PC) ----------
  // Dòng thuộc cửa sổ = đúng tập dòng đã tạo ra con số vừa bấm: apply(exclude) rồi lọc theo pred.
  // Nhờ vậy tổng trong cửa sổ luôn bằng đúng số trên ô/cột đã bấm.
  const detailRows = useMemo(
    () => (detail ? apply(detail.exclude).filter(detail.pred) : []),
    [detail, records, f] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const detailData = useMemo(() => {
    if (!detail) return null;
    const cts = new Set<string>();
    let total = 0, done = 0;
    const m = new Map<string, { name: string; pms: Set<string>; items: number; total: number; done: number }>();
    for (const r of detailRows) {
      cts.add(r.ctKey); total += r.total; done += r.done;
      const e = m.get(r.ct) ?? { name: r.ct, pms: new Set<string>(), items: 0, total: 0, done: 0 };
      e.pms.add(r.pm); e.items++; e.total += r.total; e.done += r.done;
      m.set(r.ct, e);
    }
    // Sắp theo đúng chỉ số đang xem
    const metricOf = (p: { items: number; total: number; done: number }) =>
      detail.focus === 'items' ? p.items : detail.focus === 'done' ? p.done : detail.focus === 'remain' ? p.total - p.done : p.total;
    const projects = [...m.values()].sort((a, b) => metricOf(b) - metricOf(a) || b.items - a.items);
    return { cts: cts.size, items: detailRows.length, total, done, remain: total - done, projects };
  }, [detail, detailRows]);

  const detailProjects = useMemo(() => {
    const q = detailSearch.trim().toLowerCase();
    const list = detailData?.projects ?? [];
    return q ? list.filter(p => p.name.toLowerCase().includes(q)) : list;
  }, [detailData, detailSearch]);

  const openDetail = (spec: DetailSpec) => { setDetailSearch(''); setDetail(spec); };

  // Cột tháng hạn giao: đúng tập dòng của cột (mọi bộ lọc trừ "Tháng hạn", tháng = cột đã bấm)
  const openMonthDetail = (key?: string) => {
    if (!key) return;
    openDetail({
      eyebrow: 'Tháng hạn (KH nhập kho → cần giao)', title: monthLabel(key), exclude: 'month',
      pred: r => r.month === key, focus: 'remain', filter: { key: 'month', value: key },
      note: 'Cột xanh = đã nhập kho, cột cam = chưa nhập kho (tháng hạn: KH nhập kho tuần → tháng → ngày cần giao).',
    });
  };

  // Mở từ cửa sổ chi tiết: lấy trong phạm vi cửa sổ đó; mở từ bảng công trình: mọi bộ lọc (trừ lọc công trình)
  const hexRows = useMemo(() => {
    if (!hexScope) return [];
    const { ct, inDetail } = hexScope;
    const base = inDetail ? detailRows : apply('ct');
    return (ct === null ? base : base.filter(r => r.ct === ct)).map(r => r.row);
  }, [hexScope, detailRows, records, f]); // eslint-disable-line react-hooks/exhaustive-deps

  const healthScopeRecs = () =>
    !health ? [] : (health.inDetail ? detailRows : apply('ct')).filter(r => r.ct === health.ct);

  // Dòng của công trình đang xem tổng quan: cùng phạm vi với dòng bảng công trình (mọi bộ lọc trừ lọc công trình)
  const healthRows = useMemo(
    () => (health ? healthScopeRecs().map(r => r.row) : []),
    [health, detailRows, records, f] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const healthPm = useMemo(() => {
    if (!health) return '';
    const pms = [...new Set(healthScopeRecs().map(r => r.pm))];
    return pms.slice(0, 3).join(', ') + (pms.length > 3 ? ` +${pms.length - 3}` : '');
  }, [health, detailRows, records, f]); // eslint-disable-line react-hooks/exhaustive-deps
  const healthKeys = useMemo<ProjectHealthKeys>(() => {
    const key = (target: string, fallback: string) => findColumnKey(columns, target) || fallback;
    return {
      hexKey: key(TARGET_COLUMN_NAMES.HEX, 'hex'),
      hangMucKey: key(TARGET_COLUMN_NAMES.TEN_HANG_MUC, 'ten_hang_muc'),
      bopKey: key(TARGET_COLUMN_NAMES.BOP, 'bop'),
      tinhTrangKey: key(TARGET_COLUMN_NAMES.TINH_TRANG, 'tinh_trang'),
      ipoKey: key(TARGET_COLUMN_NAMES.TINH_TRANG_IPO, 'tinh_trang_ipo'),
      triGiaKey: key(TARGET_COLUMN_NAMES.TRI_GIA_DON_HANG_TONG, 'tri_gia_don_hang_tong'),
      nhapKhoKey: key(TARGET_COLUMN_NAMES.THANH_TIEN_NHAP_KHO, 'thanh_tien_nhap_kho_luy_ke'),
      khnkTuanKey: findColumnKey(columns, 'ngay_khnk_tuan') || 'ngay_khnk_tuan',
      khnkThangKey: findColumnKey(columns, 'ngay_khnk_thang') || 'ngay_khnk_thang',
      ngayCanGiaoKey: findColumnKey(columns, 'ngay_can_giao') || 'ngay_can_giao',
      xuongKey: key(TARGET_COLUMN_NAMES.XUONG, 'xuong_chinh'),
      dwellKey: key(TARGET_COLUMN_NAMES.SO_NGAY_CD_HIEN_TAI, 'so_ngay_cd_hien_tai'),
    };
  }, [columns]);

  // Esc: cửa sổ HEX (cấp 2) tự đóng trước; chỉ khi không có nó mới đóng cửa sổ chi tiết
  useEffect(() => {
    if (!detail || hexScope || health) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDetail(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [detail, hexScope, health]);
  const hexColumnKeys = useMemo<HexDetailColumnKeys>(() => {
    const key = (target: string) => findColumnKey(columns, target) || target;
    return {
      hexKey: key(TARGET_COLUMN_NAMES.HEX),
      congTrinhKey: key(TARGET_COLUMN_NAMES.CONG_TRINH),
      hangMucKey: key(TARGET_COLUMN_NAMES.TEN_HANG_MUC),
      xuongKey: key(TARGET_COLUMN_NAMES.XUONG),
      bopKey: key(TARGET_COLUMN_NAMES.BOP),
      tinhTrangKey: key(TARGET_COLUMN_NAMES.TINH_TRANG),
      phanLoaiNhomSanPhamKey: key(TARGET_COLUMN_NAMES.PHAN_LOAI_NHOM_SAN_PHAM),
      triGiaDonHangTongKey: key(TARGET_COLUMN_NAMES.TRI_GIA_DON_HANG_TONG),
      thanhTienTinhPhieuKey: key(TARGET_COLUMN_NAMES.THANH_TIEN_TINH_PHIEU),
      thanhTienNhapKhoKey: key(TARGET_COLUMN_NAMES.THANH_TIEN_NHAP_KHO),
      ngayCanGiaoKey: findColumnKey(columns, 'ngay_can_giao') || findColumnKey(columns, 'ngay_can') || 'ngay_can_giao',
    };
  }, [columns]);

  // Danh sách cho các ô chọn (lấy từ toàn bộ dữ liệu, không phụ thuộc bộ lọc IPO)
  const options = useMemo(() => {
    const uniq = (pick: (r: Rec) => string) => [...new Set(allRecords.map(pick))].sort((a, b) => a.localeCompare(b, 'vi'));
    return {
      ct: uniq(r => r.ct), pm: uniq(r => r.pm), kv: uniq(r => r.kv),
      month: [...new Set(allRecords.map(r => r.month))].sort((a, b) => (a === NO_MONTH ? 1 : b === NO_MONTH ? -1 : a.localeCompare(b))),
    };
  }, [allRecords]);

  const display = (k: FKey, v: string) => (k === 'month' ? monthLabel(v) : v);
  // Mô tả bộ lọc đang áp dụng (cho cửa sổ chi tiết / file Excel); `skip` = bộ lọc được bỏ qua
  const filterSummary = (skip?: FKey) => [
    ...(ipoSel.length ? [`Tình trạng IPO: ${ipoSel.join(', ')}`] : []),
    ...activeKeys.filter(k => k !== skip).map(k => `${FILTER_LABEL[k]}: ${display(k, f[k]!)}`),
  ].join(' · ');

  if (allRecords.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-slate-500">
        Chưa có dữ liệu sản xuất để lập báo cáo.
      </div>
    );
  }

  // ---------- UI ----------
  const selectCls =
    'h-9 min-w-[150px] max-w-[220px] rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-700 ' +
    'focus:outline-none focus:ring-2 focus:ring-wood-600/15 focus:border-wood-600';
  const cardCls = 'bg-white border border-slate-200 rounded-xl shadow-sm';

  // Ô KPI bấm được: mở cửa sổ chi tiết đúng tập dòng tạo ra con số đó
  const Kpi = ({ label, value, unit, tone = 'text-slate-900', sub, spec }: {
    label: string; value: string; unit?: string; tone?: string; sub?: string; spec: Omit<DetailSpec, 'eyebrow' | 'title'>;
  }) => (
    <button
      type="button"
      onClick={() => openDetail({ eyebrow: 'Chỉ số', title: label, ...spec })}
      title="Bấm để xem chi tiết"
      className={`${cardCls} group px-4 py-3 text-left transition hover:border-slate-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400`}
    >
      <p className="flex items-center justify-between text-[0.6875rem] font-medium tracking-wide text-slate-500">
        {label}
        <ChevronRight size={13} className="text-slate-300 group-hover:text-slate-600" />
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>
        {value}{unit && <span className="ml-1 text-sm font-medium text-slate-400">{unit}</span>}
      </p>
      {sub && <p className="mt-0.5 text-[0.6875rem] text-slate-400">{sub}</p>}
    </button>
  );

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-wood-50">
      {/* Thanh tiêu đề + bộ lọc */}
      <div className="sticky top-0 z-30 bg-wood-50/90 backdrop-blur border-b border-slate-200 px-4 md:px-6 py-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Báo cáo tiến độ công trình</h2>
            <p className="text-xs text-slate-500">Giá trị tính bằng Tỷ đồng · Bấm biểu đồ tròn để lọc chéo · Bấm ô số liệu, cột tháng, tên PC / công trình để xem chi tiết</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Giống "Tình Trạng IPO" ở Bộ lọc tổng trang Tổng quan: chọn nhiều, mặc định tất cả */}
            <DashboardFilter
              label="Tình Trạng IPO"
              options={ipoOptions}
              selectedValues={ipoSel}
              onChange={setIpoSel}
            />
            <SearchableSelect
              value={f.ct ?? ''}
              onChange={v => setKey('ct', v)}
              options={options.ct.map(o => ({ code: o, name: o }))}
              allLabel="Công trình: Tất cả"
              widthClass="w-56"
              className="text-sm [&>button]:h-9 [&>button]:rounded-lg [&>button]:px-2.5"
            />
            <SearchableSelect
              value={f.pm ?? ''}
              onChange={v => setKey('pm', v)}
              options={options.pm.map(o => ({ code: o, name: o }))}
              allLabel="PM: Tất cả"
              widthClass="w-40"
              className="text-sm [&>button]:h-9 [&>button]:rounded-lg [&>button]:px-2.5"
            />
            <SearchableSelect
              value={f.kv ?? ''}
              onChange={v => setKey('kv', v)}
              options={options.kv.map(o => ({ code: o, name: o }))}
              allLabel="Khu vực: Tất cả"
              widthClass="w-44"
              className="text-sm [&>button]:h-9 [&>button]:rounded-lg [&>button]:px-2.5"
            />
            <SearchableSelect
              value={f.month ?? ''}
              onChange={v => setKey('month', v)}
              options={options.month.map(o => ({ code: o, name: monthLabel(o) }))}
              allLabel="Tháng hạn: Tất cả"
              widthClass="w-40"
              className="text-sm [&>button]:h-9 [&>button]:rounded-lg [&>button]:px-2.5"
            />
          </div>
        </div>

        {activeKeys.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {activeKeys.map(k => (
              <button
                key={k}
                onClick={() => setKey(k, '')}
                className="inline-flex items-center gap-1 rounded-full bg-slate-900 text-white text-[0.6875rem] px-2.5 py-1 hover:bg-slate-700"
              >
                {FILTER_LABEL[k]}: {display(k, f[k]!)} <X size={11} />
              </button>
            ))}
            <button onClick={() => setF({})} className="text-[0.6875rem] text-slate-500 hover:text-slate-900 underline ml-1">
              Xóa tất cả bộ lọc
            </button>
          </div>
        )}
      </div>

      <div className="p-4 md:p-6 space-y-4">
        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          {/* Mỗi ô: pred = đúng điều kiện đã dùng để tính con số trong khối KPI ở trên */}
          <Kpi label="Công trình" value={fmtInt(kpi.cts)}
               spec={{ pred: () => true, focus: 'total', note: 'Mọi hạng mục của các công trình (đếm theo mã công trình).' }} />
          <Kpi label="Tổng số mục" value={fmtInt(kpi.items)}
               spec={{ pred: () => true, focus: 'items', note: 'Mọi hạng mục, kể cả đơn hủy.' }} />
          <Kpi label="Hủy" value={fmtInt(kpi.cancelled)} tone="text-red-600"
               spec={{ pred: r => r.status === 'HỦY', focus: 'items', note: 'Hạng mục có Tình trạng IPO = HỦY (không tính giá trị).' }} />
          <Kpi label="Hạng mục đã nhập kho" value={fmtInt(kpi.stocked)} tone="text-emerald-600"
               spec={{ pred: r => isStocked(r), focus: 'items', note: 'Hạng mục đã nhập kho đủ trị giá đơn hàng (không tính đơn hủy).' }} />
          <Kpi label="Hạng mục chưa nhập kho" value={fmtInt(kpi.notStocked)} tone="text-amber-600"
               sub={kpi.partial > 0 ? `trong đó ${fmtInt(kpi.partial)} nhập một phần` : undefined}
               spec={{ pred: r => r.status !== 'HỦY' && !isStocked(r), focus: 'items', note: 'Hạng mục chưa nhập kho hoặc mới nhập một phần (không tính đơn hủy).' }} />
          <Kpi label="Tổng giá trị" value={fmtTy(kpi.total)} unit="Tỷ"
               spec={{ pred: r => r.status !== 'HỦY', focus: 'total', note: 'Tổng trị giá đơn hàng, không tính đơn hủy.' }} />
          <Kpi label="Giá trị đã nhập kho" value={fmtTy(kpi.done)} unit="Tỷ" tone="text-emerald-600"
               spec={{ pred: r => r.done > 0, focus: 'done', note: 'Giá trị đã nhập kho lũy kế (tối đa bằng trị giá đơn hàng).' }} />
          <Kpi label="Giá trị chưa nhập kho" value={fmtTy(kpi.remain)} unit="Tỷ" tone="text-amber-600"
               spec={{ pred: r => r.total - r.done > 0, focus: 'remain', note: 'Trị giá đơn hàng trừ giá trị đã nhập kho.' }} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Cột trái: biểu đồ theo tháng + bảng theo PC */}
          <div className="xl:col-span-3 space-y-4">
            <div className={`${cardCls} p-4`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-700">Giá trị theo tháng hạn (Tỷ) <span className="font-normal text-slate-400">· KH nhập kho tuần → tháng → ngày cần giao</span></p>
                <div className="flex items-center gap-3 text-[0.6875rem] text-slate-500">
                  <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-sm" style={{ background: COLOR_DONE }} />Đã nhập kho</span>
                  <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-sm" style={{ background: COLOR_REMAIN }} />Chưa nhập kho</span>
                </div>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthData} margin={{ top: 8, right: 4, left: -14, bottom: 0 }}>
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatTy(v)} />
                    <Tooltip
                      cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                      formatter={(v: number, name: string) => [`${formatTy(v)} Tỷ`, name === 'done' ? 'Đã nhập kho' : 'Chưa nhập kho']}
                    />
                    <Bar dataKey="done" stackId="a" fill={COLOR_DONE} cursor="pointer" onClick={(d: any) => openMonthDetail(d.key ?? d.payload?.key)}>
                      {monthData.map(d => <Cell key={d.key} opacity={f.month && f.month !== d.key ? 0.25 : 1} />)}
                    </Bar>
                    <Bar dataKey="remain" stackId="a" fill={COLOR_REMAIN} radius={[3, 3, 0, 0]} cursor="pointer" onClick={(d: any) => openMonthDetail(d.key ?? d.payload?.key)}>
                      {monthData.map(d => <Cell key={d.key} opacity={f.month && f.month !== d.key ? 0.25 : 1} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={`${cardCls} overflow-hidden`}>
              <p className="text-xs font-semibold text-slate-700 px-4 pt-3 pb-2">Theo người phụ trách (PC)</p>
              <div className="max-h-[340px] overflow-auto custom-scrollbar">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-right font-medium pl-4 pr-2 py-2 w-10">STT</th>
                      <th className="text-left font-medium px-2 py-2">Tên PC</th>
                      <th className="text-right font-medium px-2 py-2">CT</th>
                      <th className="text-right font-medium px-2 py-2">Mục</th>
                      <th className="text-right font-medium px-4 py-2">Tổng GT (Tỷ)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pcTable.map((r, idx) => (
                      <tr key={r.name} onClick={() => openDetail({
                            eyebrow: 'Người phụ trách (PC)', title: r.name, exclude: 'pc',
                            pred: rec => rec.pc === r.name, focus: 'total', filter: { key: 'pc', value: r.name },
                          })}
                          title="Bấm để xem các công trình PC đang quản lý"
                          className={`group cursor-pointer hover:bg-slate-50 ${f.pc === r.name ? 'bg-slate-100 font-semibold' : ''}`}>
                        <td className="pl-4 pr-2 py-1.5 text-right tabular-nums text-slate-400">{idx + 1}</td>
                        <td className="px-2 py-1.5 text-slate-800">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate group-hover:text-blue-700 group-hover:underline">{r.name}</span>
                            {/* Lọc chéo theo PC (tách riêng để bấm dòng là mở chi tiết PC) */}
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); toggle('pc', r.name); }}
                              title={f.pc === r.name ? 'Bỏ lọc PC này' : 'Lọc cả trang theo PC này'}
                              aria-label="Lọc theo PC"
                              className={`shrink-0 rounded p-0.5 hover:bg-slate-200 ${f.pc === r.name ? 'text-blue-600' : 'text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
                            >
                              <Filter size={12} />
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.cts.size}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(r.items)}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums">{fmtTy(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-slate-50 font-semibold text-slate-800">
                    <tr>
                      <td />
                      <td className="px-2 py-2">Tổng cộng</td>
                      <td className="px-2 py-2 text-right tabular-nums">{new Set(pcTable.flatMap(r => [...r.cts])).size}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmtInt(pcTable.reduce((s, r) => s + r.items, 0))}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtTy(pcTable.reduce((s, r) => s + r.total, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          {/* Cột giữa: danh sách công trình (rộng 6/12 cột, tên công trình hiện đầy đủ) */}
          <div className={`xl:col-span-6 ${cardCls} overflow-hidden flex flex-col`}>
            <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
              <p className="text-xs font-semibold text-slate-700">Danh sách công trình ({fmtInt(ctTable.length)})</p>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={ctSearch} onChange={e => setCtSearch(e.target.value)} placeholder="Tìm công trình..."
                  className="h-8 w-48 rounded-lg border border-slate-300 pl-8 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-wood-600/15 focus:border-wood-600"
                />
              </div>
            </div>
            <div className="flex-1 max-h-[720px] overflow-auto custom-scrollbar">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-right font-medium pl-4 pr-2 py-2 w-10">STT</th>
                    <th className="text-left font-medium px-2 py-2">Tên công trình</th>
                    <th className="text-left font-medium px-2 py-2">PM</th>
                    <th className="text-right font-medium px-2 py-2">Mục</th>
                    <th className="text-right font-medium px-2 py-2">Tổng GT (Tỷ)</th>
                    <th className="text-left font-medium px-4 py-2 w-32">Hoàn thành</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ctTable.map((r, idx) => {
                    const pct = r.total > 0 ? Math.min(100, (r.done / r.total) * 100) : 0;
                    const pms = [...r.pms];
                    return (
                      <tr key={r.name} onClick={() => setHealth({ ct: r.name, inDetail: false })}
                          title="Bấm để xem tổng quan công trình (BOT · BOP · BOM)"
                          className={`group cursor-pointer hover:bg-slate-50 ${f.ct === r.name ? 'bg-slate-100 font-semibold' : ''}`}>
                        <td className="pl-4 pr-2 py-1.5 text-right tabular-nums text-slate-400">{idx + 1}</td>
                        <td className="px-2 py-1.5 text-slate-800 min-w-[220px]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="break-words group-hover:text-blue-700 group-hover:underline" title={r.name}>{r.name}</span>
                            {/* Lọc chéo theo công trình (tách riêng để bấm dòng là mở HEX) */}
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); toggle('ct', r.name); }}
                              title={f.ct === r.name ? 'Bỏ lọc công trình này' : 'Lọc cả trang theo công trình này'}
                              aria-label="Lọc theo công trình"
                              className={`shrink-0 rounded p-0.5 hover:bg-slate-200 ${f.ct === r.name ? 'text-blue-600' : 'text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
                            >
                              <Filter size={12} />
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap" title={pms.join(', ')}>
                          {pms[0]}{pms.length > 1 ? ` +${pms.length - 1}` : ''}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(r.items)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtTy(r.total)}</td>
                        <td className="px-4 py-1.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-9 text-right tabular-nums text-slate-500">{pct.toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {ctTable.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Không có công trình phù hợp</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cột phải: thẻ "Cơ cấu đơn hàng" dùng chung với Tổng quan / Luồng đỏ / Căn mẫu */}
          <div className="xl:col-span-3 flex flex-col">
            <OrderMixCard
              metric={metric}
              onMetricChange={setMetric}
              summary={{ cts: kpi.cts, items: kpi.items, totalTy: kpi.total / UNIT }}
              scopeNote={ipoSel.length ? `Tình trạng IPO: ${ipoSel.join(', ')}` : 'Tình trạng IPO: tất cả'}
              onExport={() => exportOrderMixExcel({
                fileName: `co_cau_don_hang_cong_trinh_${new Date().toISOString().slice(0, 10)}`,
                scopeLabel: filterSummary() || 'Tất cả',
                byDim: { kv: apply('kv'), kh: apply('kh'), pl: apply('pl') },
                scopeRows: rowsAll,
                columns,
              })}
              charts={[
                { title: 'Theo khu vực', data: kvData, selected: f.kv ? [f.kv] : [], onSelect: n => toggle('kv', n) },
                // "Khác" là nhóm gộp các khách hàng nhỏ, không lọc được
                { title: 'Theo khách hàng', data: khData, selected: f.kh ? [f.kh] : [], onSelect: n => n !== OTHERS && toggle('kh', n) },
                { title: 'Theo nhóm sản phẩm', data: plData, selected: f.pl ? [f.pl] : [], onSelect: n => toggle('pl', n) },
              ]}
            />
          </div>
        </div>
      </div>
      {/* Cấp 1: cửa sổ chi tiết (ô KPI / cột tháng / PC) — bấm 1 công trình mở cửa sổ HEX (cấp 2) */}
      <ModalShell
        open={detail !== null && detailData !== null}
        onClose={() => setDetail(null)}
        closeOnEsc={false}
        labelledBy="detail-title"
        overlayClassName="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-900/50 p-4"
        panelClassName="w-full max-w-6xl max-h-[90vh] flex flex-col rounded-xl bg-white shadow-2xl outline-none"
      >
        {detail && detailData && (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-slate-500">{detail.eyebrow}</p>
                <h3 id="detail-title" className="text-lg font-semibold text-slate-900 truncate">{detail.title}</h3>
                {detail.note && <p className="text-[0.6875rem] text-slate-500 mt-0.5">{detail.note}</p>}
                {filterSummary(detail.exclude) && (
                  <p className="text-[0.6875rem] text-slate-500 mt-0.5">Theo bộ lọc: {filterSummary(detail.exclude)}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {detail.filter && (
                  <button
                    onClick={() => { setKey(detail.filter!.key, detail.filter!.value); setDetail(null); }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  >
                    <Filter size={13} /> Lọc cả trang theo mục này
                  </button>
                )}
                <button
                  onClick={() => setHexScope({ ct: null, inDetail: true })}
                  disabled={detailData.items === 0 || detailData.items > MAX_HEX_ALL}
                  title={detailData.items > MAX_HEX_ALL
                    ? `Quá nhiều (${fmtInt(detailData.items)} HEX) — chọn 1 công trình bên dưới để xem HEX`
                    : 'Xem toàn bộ HEX trong cửa sổ này'}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400"
                >
                  Xem tất cả HEX ({fmtInt(detailData.items)})
                </button>
                <button onClick={() => setDetail(null)} aria-label="Đóng"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Số liệu tổng — ô đang xem được tô viền */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 px-5 py-4">
              <PcStat label="Công trình" value={fmtInt(detailData.cts)} />
              <PcStat label="Hạng mục" value={fmtInt(detailData.items)} active={detail.focus === 'items'} />
              <PcStat label="Tổng giá trị" value={fmtTy(detailData.total)} unit="Tỷ" active={detail.focus === 'total'} />
              <PcStat
                label="Đã nhập kho" value={fmtTy(detailData.done)} unit="Tỷ" tone="text-emerald-600"
                active={detail.focus === 'done'}
                sub={`${(detailData.total > 0 ? (detailData.done / detailData.total) * 100 : 0).toFixed(1)}% tổng giá trị`}
              />
              <PcStat label="Chưa nhập kho" value={fmtTy(detailData.remain)} unit="Tỷ" tone="text-amber-600" active={detail.focus === 'remain'} />
            </div>

            <div className="flex items-center justify-between gap-3 px-5 pb-2">
              <p className="text-xs font-semibold text-slate-700">
                Danh sách công trình ({fmtInt(detailProjects.length)})
                <span className="font-normal text-slate-400"> · bấm 1 dòng để xem tổng quan BOT · BOP · BOM</span>
              </p>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  data-autofocus
                  value={detailSearch} onChange={e => setDetailSearch(e.target.value)} placeholder="Tìm công trình..."
                  className="h-8 w-52 rounded-lg border border-slate-300 pl-8 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-wood-600/15 focus:border-wood-600"
                />
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar px-5 pb-5">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-right font-medium px-2 py-2 w-10">STT</th>
                    <th className="text-left font-medium px-2 py-2">Tên công trình</th>
                    <th className="text-left font-medium px-2 py-2">PM</th>
                    <th className={`text-right font-medium px-2 py-2 ${detail.focus === 'items' ? 'text-slate-900' : ''}`}>Hạng mục</th>
                    <th className={`text-right font-medium px-2 py-2 ${detail.focus === 'total' ? 'text-slate-900' : ''}`}>Tổng GT (Tỷ)</th>
                    <th className={`text-right font-medium px-2 py-2 ${detail.focus === 'done' ? 'text-slate-900' : ''}`}>Đã nhập kho (Tỷ)</th>
                    <th className={`text-right font-medium px-2 py-2 ${detail.focus === 'remain' ? 'text-slate-900' : ''}`}>Chưa nhập kho (Tỷ)</th>
                    <th className="text-left font-medium px-2 py-2 w-32">% hoàn thành</th>
                    <th className="w-6" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detailProjects.map((p, i) => {
                    const pct = p.total > 0 ? Math.min(100, (p.done / p.total) * 100) : 0;
                    const pms = [...p.pms];
                    const strong = (k: DetailFocus) => (detail.focus === k ? 'font-semibold text-slate-900' : '');
                    return (
                      <tr key={p.name} onClick={() => setHealth({ ct: p.name, inDetail: true })}
                          className="group cursor-pointer hover:bg-blue-50/60">
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">{i + 1}</td>
                        <td className="px-2 py-1.5 text-slate-800 max-w-[320px] truncate group-hover:text-blue-700" title={p.name}>{p.name}</td>
                        <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap" title={pms.join(', ')}>
                          {pms[0]}{pms.length > 1 ? ` +${pms.length - 1}` : ''}
                        </td>
                        <td className={`px-2 py-1.5 text-right tabular-nums ${strong('items')}`}>{fmtInt(p.items)}</td>
                        <td className={`px-2 py-1.5 text-right tabular-nums ${strong('total')}`}>{fmtTy(p.total)}</td>
                        <td className={`px-2 py-1.5 text-right tabular-nums ${strong('done')}`}>{fmtTy(p.done)}</td>
                        <td className={`px-2 py-1.5 text-right tabular-nums ${strong('remain')}`}>{fmtTy(p.total - p.done)}</td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-9 text-right tabular-nums text-slate-500">{pct.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className="px-1 text-slate-300 group-hover:text-blue-600"><ChevronRight size={14} /></td>
                      </tr>
                    );
                  })}
                  {detailProjects.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Không có công trình phù hợp</td></tr>
                  )}
                </tbody>
                {detailProjects.length > 0 && (
                  <tfoot className="sticky bottom-0 bg-slate-50 font-semibold text-slate-800">
                    <tr>
                      <td />
                      <td className="px-2 py-2">Tổng cộng</td>
                      <td />
                      <td className="px-2 py-2 text-right tabular-nums">{fmtInt(detailProjects.reduce((s, p) => s + p.items, 0))}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmtTy(detailProjects.reduce((s, p) => s + p.total, 0))}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmtTy(detailProjects.reduce((s, p) => s + p.done, 0))}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmtTy(detailProjects.reduce((s, p) => s + p.total - p.done, 0))}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </ModalShell>

      <ProjectHealthModal
        isOpen={health !== null}
        onClose={() => setHealth(null)}
        projectName={healthCt ?? ''}
        rows={healthRows}
        keys={healthKeys}
        pmText={healthPm}
        escEnabled={hexScope === null}
        onOpenHexList={() => health && setHexScope({ ct: health.ct, inDetail: health.inDetail })}
      />

      <HexDetailModal
        isOpen={hexScope !== null}
        onClose={() => setHexScope(null)}
        title={hexScope?.inDetail && detail ? `Danh sách HEX · ${detail.title}` : 'Danh sách HEX'}
        projectName={hexScope?.ct ?? null}
        rows={hexRows}
        columnKeys={hexColumnKeys}
        currentUser={currentUser}
      />
    </div>
  );
};

export default ConstructionOverview;