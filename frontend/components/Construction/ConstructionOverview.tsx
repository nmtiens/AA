import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts';
import { Search, X, Filter, ChevronRight, HelpCircle, SlidersHorizontal } from 'lucide-react';
import { ModalShell } from '../shared/ModalShell';
import { DashboardFilter } from '../Dashboard/components/shared/DashboardFilter';
import { exportOrderMixExcel } from '../Dashboard/utils/orderMixExport';
import { DataRow, ColumnDefinition, TARGET_COLUMN_NAMES } from '../../types';
import { findColumnKey } from '../Dashboard/utils/columnKeyResolver';
import { projectMatchKey } from '../../utils/productionMetrics';
import { taoBanGhi, NO_MONTH, type Rec } from './core/banGhiCongTrinh';
import { tinhChiSo, nhomBot, GIAI_THICH } from './core/chiSoCongTrinh';
import { useToast } from '../../context/ToastContext';
import { CONFIGURABLE_VIEWS, getProjectsForView, type ProjectGroupId } from './utils/viewDataConfig';
import { fetchVuongMacByProject, type VmByProjectRow } from '../../services/vuongMacService';
import SearchableSelect from '../Dashboard/components/Dashboards/SearchableSelect';
import { HexDetailModal, type HexDetailColumnKeys } from '../Dashboard/components/modals/HexDetailModal';
import { hexColumnKeysOf } from '../Dashboard/components/Dashboards/DanhSachHex';
import { ProjectHealthModal, type ProjectHealthKeys } from './ProjectHealthModal';
import { OrderMixCard, OTHERS, TOP_CUSTOMERS, groupTopN, aggregateMix, orderMix } from '../Dashboard/components/shared/ProductionDonutPanel';
import { formatTy, formatTrieuAsTy } from '../../utils/money';
import { fmtInt } from '../../utils/format';
// ============================================================
// Báo cáo tiến độ công trình — dựng hoàn toàn từ productionData (không cần API mới)
// Đơn vị tiền gốc là TRIỆU ĐỒNG (xem utils/money.ts)  =>  Tỷ = giá trị gốc / 1,000
// ============================================================

type FKey = 'ct' | 'pm' | 'pc' | 'kv' | 'kh' | 'pl' | 'month' | 'nct' | 'tda';
const FKEYS: FKey[] = ['ct', 'pm', 'pc', 'kv', 'kh', 'pl', 'month', 'nct', 'tda'];
/** "Chưa triển khai (P001)" → ["Chưa triển khai", "P001"] */
const tachMa = (label: string): [string, string] => {
  const m = label.match(/^(.*?)\s*\((.*)\)$/);
  return m ? [m[1], m[2]] : [label, ''];
};
/** Sắp xếp bảng công trình — mặc định công trình nhiều hạng mục quá hạn lên đầu */
type XepCt = 'quaHan' | 'giaTri' | 'hoanThanh';
type DongXep = { overdue: number; total: number; done: number; items: number };
const tiLe = (r: DongXep) => (r.total > 0 ? r.done / r.total : 0);
const XEP_CT: Array<{ key: XepCt; label: string; cmp: (a: DongXep, b: DongXep) => number }> = [
  { key: 'quaHan', label: 'Quá hạn nhiều nhất', cmp: (a, b) => b.overdue - a.overdue || b.total - a.total },
  { key: 'giaTri', label: 'Giá trị lớn nhất', cmp: (a, b) => b.total - a.total || b.items - a.items },
  { key: 'hoanThanh', label: 'Hoàn thành thấp nhất', cmp: (a, b) => tiLe(a) - tiLe(b) || b.total - a.total },
];
/** Dấu "?" giải thích cách tính (rê chuột) */
const GiaiThich = ({ text }: { text: string }) => (
  <span title={text} aria-label={text} className="inline-flex shrink-0 cursor-help text-slate-400 hover:text-slate-700"><HelpCircle size={14} aria-hidden /></span>
);
type Filters = Partial<Record<FKey, string | undefined>>;

// Mặc định không lọc Tình trạng IPO: các ô KPI hiện tổng toàn bộ công trình, chỉ đổi khi người dùng chọn lọc
// Mặc định chỉ xem hạng mục ĐANG SẢN XUẤT (khớp bộ lọc mặc định ở trang Tổng quan); chọn lại được ở bộ lọc
const isDefaultIpo = (ipo: string) => /ĐANG SẢN XUẤT/i.test(ipo);

const GROUP_SHORT: Record<ProjectGroupId, string> = { 'luong-do': 'Luồng đỏ', 'can-mau': 'Căn mẫu' };

const FILTER_LABEL: Record<FKey, string> = {
  ct: 'Công trình', pm: 'PM', pc: 'PC', kv: 'Khu vực', kh: 'Khách hàng', pl: 'Nhóm SP', month: 'Tháng hạn',
  nct: 'Nhóm CT', tda: 'Tình trạng dự án',
};
const COLOR_DONE = '#16a34a';
const COLOR_REMAIN = '#f59e0b';
// Giá trị gốc tính theo triệu đồng (khớp backend TRIEU_TO_TY) => Tỷ = giá trị gốc / 1,000
const UNIT = 1000;
const fmtTy = formatTrieuAsTy;
// Làm tròn triệu đồng về bội 10 (= 0,01 tỷ, đúng số hiển thị của fmtTy)
const roundTy = (trieu: number) => Math.round(trieu / 10) * 10 + 0; // + 0: bỏ -0
/** Chia `target` (đã làm tròn 0,01 tỷ) cho các phần theo phần dư lớn nhất => các ô con cộng đúng ô cha. */
const apportionTy = (vals: number[], target: number): number[] => {
  const units = vals.map(v => v / 10);
  const base = units.map(Math.floor);
  let diff = Math.round(target / 10) - base.reduce((a, b) => a + b, 0);
  const order = units.map((u, i) => ({ i, frac: u - base[i] })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; diff !== 0 && order.length > 0; k++) {
    // Thiếu: cộng cho phần dư lớn nhất trước; thừa: trừ từ phần dư nhỏ nhất trước
    const o = diff > 0 ? order[k % order.length] : order[order.length - 1 - (k % order.length)];
    base[o.i] += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
  }
  return base.map(u => u * 10);
};
/** Chia số nguyên `target` (vd 100%) theo tỷ lệ `vals` bằng phần dư lớn nhất => các phần nguyên cộng đúng `target`. */
const apportionInt = (vals: number[], target: number): number[] => {
  const sum = vals.reduce((a, v) => a + Math.max(v, 0), 0);
  if (sum <= 0) return vals.map(() => 0);
  const exact = vals.map(v => (Math.max(v, 0) / sum) * target);
  const base = exact.map(Math.floor);
  let diff = target - base.reduce((a, b) => a + b, 0);
  exact.map((u, i) => ({ i, frac: u - base[i] })).sort((a, b) => b.frac - a.frac)
    .forEach(o => { if (diff > 0) { base[o.i]++; diff--; } });
  return base;
};
const monthLabel = (key: string) => {
  if (key === NO_MONTH) return 'Không có hạn (chưa có KH / đạt KH kỳ)';
  // Cột gộp của biểu đồ tháng hạn: "<YYYY-MM" = trước tháng đó, ">YYYY-MM" = sau tháng đó
  if (key.startsWith('<') || key.startsWith('>')) {
    const [y, m] = key.slice(1).split('-');
    return `${key[0] === '<' ? 'Trước' : 'Sau'} T${m}/${y}`;
  }
  const [y, m] = key.split('-');
  return `T${m}/${y}`;
};

// Biểu đồ tháng hạn chỉ hiện từng tháng trong khoảng [hiện tại − 6 tháng, hiện tại + 12 tháng];
// tháng xa hơn gộp thành 1 cột "Trước …" / "Sau …" (dữ liệu có hạn từ 2022 → biểu đồ quá dài)
const MONTHS_BACK = 6, MONTHS_AHEAD = 12;
const monthKeyOffset = (offset: number) => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const chartMonthBucket = (month: string, from: string, to: string) =>
  month === NO_MONTH ? NO_MONTH : month < from ? `<${from}` : month > to ? `>${to}` : month;
const chartMonthOrder = (k: string) => (k === NO_MONTH ? 3 : k.startsWith('<') ? 0 : k.startsWith('>') ? 2 : 1);

// Ô số liệu trong cửa sổ chi tiết PC
// Ô số trong cửa sổ chi tiết: có onClick => bấm để xếp bảng công trình theo cột đó (ô đang chọn tô viền đen)
const PcStat = ({ label, value, unit, sub, tone = 'text-slate-900', active = false, onClick }: {
  label: string; value: string; unit?: string; sub?: string; tone?: string; active?: boolean; onClick?: () => void;
}) => {
  const noi = (
    <>
      <p className="text-[0.6875rem] text-slate-500">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${tone}`}>
        {value}{unit && <span className="ml-1 text-xs font-medium text-slate-400">{unit}</span>}
      </p>
      {sub && <p className="text-[0.625rem] tabular-nums text-slate-400">{sub}</p>}
    </>
  );
  const cls = `rounded-lg border px-3 py-2 text-left ${active ? 'border-slate-900 bg-white ring-1 ring-slate-900' : 'border-slate-200 bg-slate-50'}`;
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={active} title={`Xếp danh sách công trình theo ${label.toLowerCase()}`}
      className={`${cls} transition hover:border-slate-400 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400`}>
      {noi}
    </button>
  ) : <div className={cls}>{noi}</div>;
};

// Mô tả 1 cửa sổ chi tiết (cấp 1)
type DetailFocus = 'items' | 'total' | 'done' | 'remain' | 'exported' | 'stock';
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


interface Props {
  data: DataRow[];
  columns: ColumnDefinition[];
  /** Tài khoản đang đăng nhập (ghi chú / vướng mắc trong cửa sổ HEX) */
  currentUser?: string;
  /** Bảng nhập kho — nhịp nhập kho theo tuần + dự báo trong cửa sổ tổng quan công trình */
  inventory?: DataRow[];
  /**
   * Bản ghi máy chủ dựng sẵn (/api/tong-quan/cong-trinh) — dùng khi CHƯA có bảng sản xuất (người mới / máy mới):
   * trang hiện và lọc được ngay; danh sách HEX / cửa sổ công trình / xuất Excel chờ bảng tải xong.
   */
  banGhiSan?: Rec[] | null;
}

const ConstructionOverview: React.FC<Props> = ({ data, columns, currentUser = '', inventory, banGhiSan = null }) => {
  // Trạng thái trang nằm trên địa chỉ (#/…?nhom=&ct=&mo=…): copy link gửi người khác, mở ra đúng màn đó
  const [sp, setSp] = useSearchParams();
  // Nhóm công trình (Luồng đỏ / Căn mẫu = danh sách setup ở Công trình → Setup); null = mọi công trình
  const [group, setGroup] = useState<ProjectGroupId | null>(() => {
    const g = sp.get('nhom');
    return CONFIGURABLE_VIEWS.some(v => v.id === g) ? g as ProjectGroupId : null;
  });
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);
  // Vướng mắc đang mở theo công trình (API nhẹ, 1 lần khi mở trang)
  const [vmRows, setVmRows] = useState<VmByProjectRow[] | null>(null);
  useEffect(() => { let on = true; fetchVuongMacByProject().then(r => { if (on) setVmRows(r); }); return () => { on = false; }; }, []);
  const vmIndex = useMemo(() => {
    const byMa = new Map<string, { open: number; overdue: number }>();
    const byName = new Map<string, { open: number; overdue: number }>();
    const add = (m: Map<string, { open: number; overdue: number }>, k: string, r: VmByProjectRow) => {
      if (!k) return;
      const e = m.get(k) ?? { open: 0, overdue: 0 };
      e.open += r.open; e.overdue += r.overdue; m.set(k, e);
    };
    (vmRows ?? []).forEach(r => { add(byMa, r.ma.toUpperCase(), r); add(byName, projectMatchKey(r.ten), r); });
    return { byMa, byName };
  }, [vmRows]);
  // Vướng mắc của 1 công trình: cộng theo các mã công trình của nó; không có mã khớp thì theo tên chuẩn
  const vmOf = (mas: Set<string>, ctKey: string) => {
    let open = 0, overdue = 0, hit = false;
    mas.forEach(ma => { const e = vmIndex.byMa.get(ma); if (e) { hit = true; open += e.open; overdue += e.overdue; } });
    if (!hit) { const e = vmIndex.byName.get(ctKey); if (e) { open = e.open; overdue = e.overdue; } }
    return { open, overdue };
  };
  // Cửa sổ chi tiết (cấp 1): ô KPI / cột tháng / PC — liệt kê công trình; bấm công trình mở HEX (cấp 2)
  const [detail, setDetail] = useState<DetailSpec | null>(null);
  const [detailSearch, setDetailSearch] = useState('');
  // Cửa sổ danh sách HEX: ct = công trình (null = mọi công trình trong cửa sổ chi tiết);
  // inDetail = lấy trong phạm vi cửa sổ chi tiết đang mở, ngược lại theo dòng bảng công trình
  const [hexScope, setHexScope] = useState<{ ct: string | null; inDetail: boolean } | null>(null);
  // Tổng quan 1 công trình (BOT / BOP / BOM) — mở khi bấm 1 dòng trong bảng công trình
  // inDetail = mở từ cửa sổ chi tiết (vd PC): chỉ tính các dòng trong phạm vi cửa sổ đó
  const [health, setHealth] = useState<{ ct: string; inDetail: boolean } | null>(() => {
    const ct = sp.get('mo');
    return ct ? { ct, inDetail: false } : null;
  });
  const healthCt = health?.ct ?? null;
  const [f, setF] = useState<Filters>(() => Object.fromEntries(FKEYS.flatMap(k => (sp.get(k) ? [[k, sp.get(k)!]] : []))));
  // null = chưa chọn gì => dùng mặc định (Đang sản xuất) khi đã có dữ liệu; [] = tất cả (trên địa chỉ: ipo=*)
  const [ipoPicked, setIpoSel] = useState<string[] | null>(() => {
    const v = sp.get('ipo');
    return v === null ? null : v === '*' ? [] : v.split('|');
  });
  const [ctSearch, setCtSearch] = useState(() => sp.get('q') ?? '');
  const [xep, setXep] = useState<XepCt>(() => XEP_CT.find(x => x.key === sp.get('xep'))?.key ?? 'quaHan');
  const [metric, setMetric] = useState<'count' | 'value'>('count'); // cho 2 biểu đồ tròn
  const [moLoc, setMoLoc] = useState(false);
  // Ghi trạng thái lên địa chỉ (thay, không thêm lịch sử). Chỉ đụng các khoá của trang này.
  useEffect(() => {
    setSp(prev => {
      const p = new URLSearchParams(prev);
      const dat = (k: string, v?: string | null) => { if (v) p.set(k, v); else p.delete(k); };
      FKEYS.forEach(k => dat(k, f[k]));
      dat('nhom', group);
      dat('ipo', ipoPicked === null ? null : ipoPicked.length ? ipoPicked.join('|') : '*');
      dat('q', ctSearch.trim());
      dat('xep', xep === 'quaHan' ? null : xep);
      dat('mo', health && !health.inDetail ? health.ct : null);
      return p.toString() === prev.toString() ? prev : p;
    }, { replace: true });
  }, [f, group, ipoPicked, ctSearch, xep, health, setSp]);

  const toggle = (k: FKey, v: string) => setF(p => ({ ...p, [k]: p[k] === v ? undefined : v }));
  const setKey = (k: FKey, v: string) => setF(p => ({ ...p, [k]: v || undefined }));
  const activeKeys = (Object.keys(f) as FKey[]).filter(k => f[k]);


  // ---------- 1. Chuẩn hoá từng dòng 1 lần (lõi dùng chung với máy chủ: core/banGhiCongTrinh.ts) ----------
  // Chưa có bảng sản xuất mà máy chủ đã gửi bản ghi => dùng bản ghi máy chủ (dòng gốc chỉ có hex)
  const coBang = data.length > 0;
  const allRecords = useMemo<Rec[]>(
    () => (coBang ? taoBanGhi(data, columns, today) : banGhiSan ?? []),
    [coBang, data, columns, today, banGhiSan]);
  const { showToast } = useToast();
  /** Danh sách HEX / cửa sổ công trình / xuất Excel cần dòng gốc đầy đủ — chưa có bảng thì báo chờ */
  const canBang = () => {
    if (coBang) return true;
    showToast('Đang tải chi tiết hạng mục, bấm lại sau ít giây', 'info');
    return false;
  };

  // Bộ lọc Tình trạng IPO (mặc định: Đang sản xuất — bỏ chọn hết = tất cả),
  // áp cho TOÀN BỘ trang trước mọi bộ lọc khác.
  // Lọc theo nhóm công trình trước mọi bộ lọc khác (so theo tên chuẩn — gộp các cách viết)
  const groupRecords = useMemo(() => {
    if (!group) return allRecords;
    const allowed = new Set(getProjectsForView(group).map(projectMatchKey));
    return allRecords.filter(r => allowed.has(r.mk));
  }, [allRecords, group]);
  const groupSize = useMemo(() => (group ? getProjectsForView(group).length : 0), [group]);

  const ipoOptions = useMemo(
    () => [...new Set(groupRecords.map(r => r.ipo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')),
    [groupRecords]
  );
  const ipoSel = useMemo(() => ipoPicked ?? ipoOptions.filter(isDefaultIpo), [ipoPicked, ipoOptions]);
  const records = useMemo(() => {
    if (ipoSel.length === 0) return groupRecords;
    const set = new Set(ipoSel);
    return groupRecords.filter(r => set.has(r.ipo));
  }, [groupRecords, ipoSel]);

  // Lọc chéo: mỗi biểu đồ bỏ qua bộ lọc của chính nó để vẫn đổi được lựa chọn
  const apply = (exclude?: FKey) =>
    records.filter(r => activeKeys.every(k => k === exclude || r[k] === f[k]));

  const rowsAll = useMemo(() => apply(), [records, f]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- 2. KPI — một nơi định nghĩa: core/chiSoCongTrinh.ts ----------
  const kpi = useMemo(() => tinhChiSo(rowsAll, today), [rowsAll, today]);

  // ---------- 3. Cột chồng theo tháng hạn giao ----------
  const monthRange = useMemo(() => ({ from: monthKeyOffset(-MONTHS_BACK), to: monthKeyOffset(MONTHS_AHEAD) }), []);
  const monthData = useMemo(() => {
    const m = new Map<string, { key: string; done: number; remain: number }>();
    for (const r of apply('month')) {
      const key = chartMonthBucket(r.month, monthRange.from, monthRange.to);
      const e = m.get(key) ?? { key, done: 0, remain: 0 };
      e.done += r.done; e.remain += r.total - r.done;
      m.set(key, e);
    }
    return [...m.values()]
      .sort((a, b) => chartMonthOrder(a.key) - chartMonthOrder(b.key) || a.key.localeCompare(b.key))
      .map(e => ({ ...e, label: monthLabel(e.key), done: e.done / UNIT, remain: e.remain / UNIT }));
  }, [records, f, monthRange]); // eslint-disable-line react-hooks/exhaustive-deps
  // Cột gộp "Trước …" / "Sau …" không vẽ trên biểu đồ (cột "Trước" gồm hạng mục cũ đã hoàn thành,
  // lớn gấp nhiều lần các tháng gần đây => ép biểu đồ) — bỏ qua, chỉ vẽ trong khoảng.
  // Nhóm "Chưa có KH nhập kho" cũng không vẽ: KH chỉ có cho kỳ hiện tại nên nhóm này lớn gấp
  // nhiều lần các tháng và ép biểu đồ — hiện thành 1 dòng bấm được phía trên biểu đồ.
  const monthChartData = useMemo(() => monthData.filter(d => d.key !== NO_MONTH && chartMonthOrder(d.key) % 2 === 1), [monthData]);
  const noMonthBucket = useMemo(() => monthData.find(d => d.key === NO_MONTH) ?? null, [monthData]);
  // Cột gộp "Trước …" / "Sau …" (không vẽ) — hiện thành dòng bấm được khi có số
  const outBuckets = useMemo(() => monthData.filter(d => d.key !== NO_MONTH && chartMonthOrder(d.key) % 2 === 0 && d.done + d.remain > 0.0005), [monthData]);

  // ---------- 4. Biểu đồ tròn ----------
  const donut = (k: 'kv' | 'kh' | 'pl') => aggregateMix(apply(k), r => r[k], r => r.ctKey, r => r.total, metric);
  const kvData = useMemo(() => orderMix(donut('kv')), [records, f, metric]);       // eslint-disable-line react-hooks/exhaustive-deps
  const khData = useMemo(() => orderMix(groupTopN(donut('kh'), TOP_CUSTOMERS, f.kh ? [f.kh] : [])), [records, f, metric]); // eslint-disable-line react-hooks/exhaustive-deps
  const plData = useMemo(() => orderMix(donut('pl')), [records, f, metric]);       // eslint-disable-line react-hooks/exhaustive-deps

  const pcTable = useMemo(() => {
    const m = new Map<string, { name: string; cts: Set<string>; items: number; total: number; done: number; overdue: number }>();
    for (const r of apply('pc')) {
      const e = m.get(r.pc) ?? { name: r.pc, cts: new Set<string>(), items: 0, total: 0, done: 0, overdue: 0 };
      e.cts.add(r.ctKey); e.items++; e.total += r.total; e.done += r.done;
      if (r.open && r.overdue) e.overdue++;
      m.set(r.pc, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total || b.items - a.items);
  }, [records, f]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- 4. Bảng công trình ----------
  const ctRows = useMemo(() => {
    type Row = { name: string; ctKey: string; pms: Set<string>; mas: Set<string>; items: number; total: number; cancelled: number; done: number; open: number; overdue: number; botDates: string[] };
    const m = new Map<string, Row>();
    for (const r of apply('ct')) {
      const e = m.get(r.ct) ?? { name: r.ct, ctKey: r.ctKey, pms: new Set<string>(), mas: new Set<string>(), items: 0, total: 0, cancelled: 0, done: 0, open: 0, overdue: 0, botDates: [] };
      e.pms.add(r.pm); if (r.ma) e.mas.add(r.ma); e.items++; e.total += r.total; e.done += r.done;
      // Trị giá đơn hủy nằm trong Tổng GT (cửa sổ công trình thì bỏ hủy) — tách riêng để ghi chú trên bảng
      if (r.status === 'HỦY') e.cancelled += r.total;
      if (r.open) e.open++;
      if (r.open && r.overdue) e.overdue++;
      // Khoá ngày giờ địa phương (toISOString lùi 1 ngày ở +7); bỏ đơn HỦY khi gom BOT dự án (khớp ProjectHealthModal)
      if (r.botDuAn && r.status !== 'HỦY') e.botDates.push(`${r.botDuAn.getFullYear()}-${String(r.botDuAn.getMonth() + 1).padStart(2, '0')}-${String(r.botDuAn.getDate()).padStart(2, '0')}`);
      m.set(r.ct, e);
    }
    return [...m.values()].map(e => {
      // BOT dự án: 1 ngày chung cho cả công trình (lấy ngày xuất hiện nhiều nhất)
      const cnt = new Map<string, number>();
      e.botDates.forEach(d => cnt.set(d, (cnt.get(d) ?? 0) + 1));
      let best = '', n = -1; cnt.forEach((c, d) => { if (c > n) { best = d; n = c; } });
      const botDuAn = best ? new Date(Number(best.slice(0, 4)), Number(best.slice(5, 7)) - 1, Number(best.slice(8, 10))) : null;
      return { ...e, botDuAn, vm: vmOf(e.mas, e.ctKey) };
    });
  }, [records, f, vmIndex]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctTable = useMemo(() => {
    const q = ctSearch.trim().toLowerCase();
    const list = q ? ctRows.filter(r => r.name.toLowerCase().includes(q) || [...r.pms].some(p => p.toLowerCase().includes(q))) : ctRows;
    return [...list].sort(XEP_CT.find(x => x.key === xep)!.cmp);
  }, [ctRows, ctSearch, xep]);
  // Công trình nhiều hạng mục quá hạn nhất (theo bộ lọc trang, không theo ô tìm) — cho khung "Cần chú ý"
  const ctTreNhat = useMemo(() => ctRows.reduce<typeof ctRows[number] | null>((m, r) => (r.overdue > (m?.overdue ?? 0) ? r : m), null), [ctRows]);
  // Phạm vi bảng có đơn hủy => cột Tổng GT ghi chú "gồm cả đơn hủy"
  const ctHasCancel = ctTable.some(r => r.cancelled > 0);
  // Ô "Vướng mắc đang mở": theo MỌI bộ lọc trang (rowsAll, không theo ô tìm của bảng);
  // mỗi mã công trình chỉ cộng 1 lần (1 mã có thể nằm ở nhiều công trình / nhiều tên)
  const vmSum = useMemo(() => {
    const byCt = new Map<string, { ctKey: string; mas: Set<string> }>();
    for (const r of rowsAll) {
      const e = byCt.get(r.ct) ?? { ctKey: r.ctKey, mas: new Set<string>() };
      if (r.ma) e.mas.add(r.ma);
      byCt.set(r.ct, e);
    }
    const seenMa = new Set<string>(), seenName = new Set<string>();
    let open = 0, overdue = 0, cts = 0;
    byCt.forEach(e => {
      if (vmOf(e.mas, e.ctKey).open > 0) cts++;
      let hit = false;
      e.mas.forEach(ma => {
        const v = vmIndex.byMa.get(ma);
        if (!v) return;
        hit = true;
        if (seenMa.has(ma)) return;
        seenMa.add(ma); open += v.open; overdue += v.overdue;
      });
      if (!hit && !seenName.has(e.ctKey)) {
        seenName.add(e.ctKey);
        const v = vmIndex.byName.get(e.ctKey);
        if (v) { open += v.open; overdue += v.overdue; }
      }
    });
    return { open, overdue, cts };
  }, [rowsAll, vmIndex]); // eslint-disable-line react-hooks/exhaustive-deps
  const vmTotal = vmSum.open;

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
    let total = 0, done = 0, exported = 0, stock = 0;
    const m = new Map<string, { name: string; pms: Set<string>; items: number; total: number; done: number; exported: number; stock: number }>();
    for (const r of detailRows) {
      cts.add(r.ctKey); total += r.total; done += r.done; exported += r.exported; stock += r.stock;
      const e = m.get(r.ct) ?? { name: r.ct, pms: new Set<string>(), items: 0, total: 0, done: 0, exported: 0, stock: 0 };
      e.pms.add(r.pm); e.items++; e.total += r.total; e.done += r.done; e.exported += r.exported; e.stock += r.stock;
      m.set(r.ct, e);
    }
    // Sắp theo đúng chỉ số đang xem
    const metricOf = (p: { items: number; total: number; done: number; exported: number; stock: number }) =>
      detail.focus === 'items' ? p.items : detail.focus === 'done' ? p.done : detail.focus === 'remain' ? p.total - p.done
        : detail.focus === 'exported' ? p.exported : detail.focus === 'stock' ? p.stock : p.total;
    const projects = [...m.values()].sort((a, b) => metricOf(b) - metricOf(a) || b.items - a.items);
    return { cts: cts.size, items: detailRows.length, total, done, remain: total - done, exported, stock, projects };
  }, [detail, detailRows]);

  const detailProjects = useMemo(() => {
    const q = detailSearch.trim().toLowerCase();
    const list = detailData?.projects ?? [];
    return q ? list.filter(p => p.name.toLowerCase().includes(q)) : list;
  }, [detailData, detailSearch]);

  const openDetail = (spec: DetailSpec) => { setDetailSearch(''); setDetail(spec); };
  // Bấm ô số trong cửa sổ chi tiết: đổi cột đang xem => bảng xếp lại theo cột đó + tô đậm tiêu đề cột
  const doiFocus = (focus: DetailFocus) => setDetail(d => (d ? { ...d, focus } : d));

  // Cột tháng hạn giao: đúng tập dòng của cột (mọi bộ lọc trừ "Tháng hạn", tháng = cột đã bấm)
  const openMonthDetail = (key?: string) => {
    if (!key) return;
    // Cột gộp ("Trước …" / "Sau …"): gồm nhiều tháng nên không có nút lọc cả trang theo 1 tháng
    const isBucket = key.startsWith('<') || key.startsWith('>');
    openDetail({
      eyebrow: 'Tháng hạn (KH nhập kho tuần → tháng)', title: monthLabel(key), exclude: 'month',
      pred: r => chartMonthBucket(r.month, monthRange.from, monthRange.to) === key, focus: 'remain',
      ...(isBucket ? {} : { filter: { key: 'month' as FKey, value: key } }),
      note: 'Cột xanh = đã nhập kho, cột cam = chưa nhập kho (tháng hạn: KH nhập kho tuần → tháng; không có KH hoặc KH kỳ đã đạt => Không có hạn).',
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
  // HEX không hủy của công trình, mọi Tình trạng IPO (không qua bộ lọc trang) — nhịp nhập kho trong cửa sổ
  const healthPaceHexes = useMemo(() => {
    if (!health) return [];
    return allRecords
      .filter(r => r.ct === health.ct && r.status !== 'HỦY')
      .map(r => String(r.row['hex'] ?? '').trim())
      .filter(Boolean);
  }, [health, allRecords]);
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
      ngayCanKey: columns.find(c => c.key === 'ngay_can')?.key ?? 'ngay_can',
      botDuAnKey: findColumnKey(columns, 'bot_du_an') || 'bot_du_an',
      xuongKey: key(TARGET_COLUMN_NAMES.XUONG, 'xuong_chinh'),
      dwellKey: key(TARGET_COLUMN_NAMES.SO_NGAY_CD_HIEN_TAI, 'so_ngay_cd_hien_tai'),
      // So khớp ĐÚNG tên cột (findColumnKey dò chuỗi con có thể nhận nhầm)
      nhanPmKey: columns.find(c => c.key === 'ngay_nhan_tu_pm')?.key ?? 'ngay_nhan_tu_pm',
      bvStKey: columns.find(c => c.key === 'tinh_trang_trien_khai_ban_ve')?.key ?? 'tinh_trang_trien_khai_ban_ve',
      phieuStKey: columns.find(c => c.key === 'tinh_trang_phieu')?.key ?? 'tinh_trang_phieu',
      nhomCtKey: columns.find(c => c.key === 'nhom_ct')?.key ?? 'nhom_ct',
      tinhTrangDaKey: columns.find(c => c.key === 'tinh_trang_du_an')?.key ?? 'tinh_trang_du_an',
    };
  }, [columns]);

  const hexColumnKeys = useMemo<HexDetailColumnKeys>(() => hexColumnKeysOf(columns), [columns]);

  // Danh sách cho các ô chọn (lấy từ toàn bộ dữ liệu, không phụ thuộc bộ lọc IPO)
  const options = useMemo(() => {
    const uniq = (pick: (r: Rec) => string) => [...new Set(groupRecords.map(pick))].sort((a, b) => a.localeCompare(b, 'vi'));
    return {
      ct: uniq(r => r.ct), pm: uniq(r => r.pm), kv: uniq(r => r.kv), nct: uniq(r => r.nct), tda: uniq(r => r.tda),
      month: [...new Set(groupRecords.map(r => r.month))].sort((a, b) => (a === NO_MONTH ? 1 : b === NO_MONTH ? -1 : b.localeCompare(a))), // mới nhất trước
    };
  }, [groupRecords]);

  // Ô lọc Nhóm CT / Dự án: hiện theo TOÀN BỘ dữ liệu (cột có dữ liệu hay không), không theo nhóm đang chọn —
  // trước Căn mẫu chỉ có 1 giá trị nên 2 ô biến mất, thanh lọc lệch so với Tất cả CT / Luồng đỏ
  const showCol = useMemo(() => ({
    nct: new Set(allRecords.map(r => r.nct)).size > 1,
    tda: new Set(allRecords.map(r => r.tda)).size > 1,
  }), [allRecords]);

  const display = (k: FKey, v: string) => (k === 'month' ? monthLabel(v) : v);
  // Mô tả bộ lọc đang áp dụng (cho cửa sổ chi tiết / file Excel); `skip` = bộ lọc được bỏ qua
  const filterSummary = (skip?: FKey) => [
    ...(group ? [`Nhóm: ${CONFIGURABLE_VIEWS.find(v => v.id === group)?.label ?? group}`] : []),
    ...(ipoSel.length ? [`Tình trạng IPO: ${ipoSel.join(', ')}`] : []),
    ...activeKeys.filter(k => k !== skip).map(k => `${FILTER_LABEL[k]}: ${display(k, f[k]!)}`),
  ].join(' · ');

  if (allRecords.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-slate-500">
        {coBang || banGhiSan ? 'Chưa có dữ liệu sản xuất để lập báo cáo.' : 'Đang tải số liệu công trình…'}
      </div>
    );
  }

  const cardCls = 'rounded-2xl border border-slate-200 bg-white';

  // Phần chưa nhập kho theo công đoạn, theo dòng chảy sản xuất: P001 -> P002 -> Trên chuyền [-> P022–P025 nhập chưa đủ]
  // [-> đơn hủy]; màu xám -> cam đậm dần theo độ "gần xong". P022–P025 nhập chưa đủ / đơn hủy chỉ hiện khi có số.
  const remainTiles = ([
    { key: 'notDeployed', label: 'Chưa triển khai (P001)', bar: 'bg-slate-300',
      hint: 'Phần chưa nhập kho của hạng mục ở P001 / 15. CHƯA TRIỂN KHAI.' },
    { key: 'p002', label: 'Chưa tính phiếu (P002)', bar: 'bg-amber-300',
      hint: 'Phần chưa nhập kho của hạng mục ở P002 (bản vẽ kỹ thuật, chưa tính phiếu).' },
    { key: 'onLine', label: 'Đang trên chuyền (P012 → P021)', bar: 'bg-amber-500',
      hint: 'Phần chưa nhập kho của hạng mục ở P012 → P021 (gồm GCVT).' },
    { key: 'shortfall', label: 'Nhập chưa đủ (P022–P025)', bar: 'bg-orange-600',
      hint: 'Hạng mục đã ở P022 / P025 nhưng giá trị nhập kho chưa đủ trị giá đơn hàng (lệch đơn giá / nhập thiếu).' },
    { key: 'cancelled', label: 'Đơn hủy', bar: 'bg-rose-200',
      hint: 'Trị giá đơn hàng của hạng mục có Tình trạng IPO = HỦY (tính trong tổng để khớp file gốc — lọc Tình trạng IPO để bỏ).' },
  ] as const).filter(t => t.key === 'notDeployed' || t.key === 'p002' || t.key === 'onLine' || kpi.remainBy[t.key] > 0.0005);
  // Số HIỂN THỊ (làm tròn 0,01 tỷ) cộng khớp tuyệt đối trên màn hình:
  // Đã nhập = Tồn + Chưa thấy xuất / tồn + Đã xuất; Tổng = Đã nhập + Chưa nhập; các phần Chưa nhập chia theo phần dư lớn nhất.
  const shownExported = roundTy(kpi.exported);
  const shownUnmatched = roundTy(kpi.done) - shownExported - roundTy(kpi.stock);
  const shownRemain = roundTy(kpi.total) - roundTy(kpi.done);
  const shownRemainBy = apportionTy(remainTiles.map(t => kpi.remainBy[t.key]), shownRemain);

  type Seg = { key: string; label: string; v: number; bar: string; hint: string; spec: Omit<DetailSpec, 'eyebrow' | 'title'> };
  const EXPORT_HINT = 'TT xuất kho lũy kế của hạng mục, đúng cột TT XK LŨY KẾ ở file gốc (có hạng mục ghi xuất cao hơn nhập do lệch đơn giá); đơn hủy không tính.';
  const UNMATCHED_HINT = 'Đã nhập − Đã xuất − Tồn kho, theo từng hạng mục: phần đã nhập kho nhưng không thấy trong TT xuất kho lũy kế lẫn tồn kho hiện tại (bảng xuất kho chỉ có dữ liệu từ 01/2025, giao không qua phiếu xuất, SAP chưa cập nhật…), đã trừ phần xuất ghi vượt nhập.';
  const STOCK_HINT = kpi.stockOverItems > 0
    ? `Tồn kho hiện tại (mọi tình trạng, kể cả đơn hủy), mỗi hạng mục tối đa bằng đã nhập − đã xuất. ${fmtInt(kpi.stockOverItems)} mục tồn kho vượt giá trị đã nhập — phần vượt ${fmtTy(kpi.stockOver)} tỷ không tính, nên số này có thể thấp hơn bảng tồn kho đúng phần đó.`
    : 'Tồn kho hiện tại (mọi tình trạng, kể cả đơn hủy), mỗi hạng mục tối đa bằng giá trị đã nhập kho − đã xuất.';
  // Thứ tự đã nhập theo dòng chảy: còn trong kho -> chưa khớp -> đã xuất / giao (cuối dòng chảy)
  const doneSegs: Seg[] = [
    { key: 'stock', label: 'Tồn kho', v: roundTy(kpi.stock), bar: 'bg-emerald-300', hint: STOCK_HINT,
      spec: { pred: r => r.stock > 0, focus: 'stock', note: 'Giá trị tồn kho hiện tại của các hạng mục (thành tiền tồn kho hiện tại theo bảng sản xuất), mỗi hạng mục tối đa bằng giá trị đã nhập kho − đã xuất; gồm cả đơn hủy còn tồn.' } },
    ...(shownUnmatched > 0.0005 ? [{ key: 'unmatched', label: 'Chưa thấy xuất / tồn', v: shownUnmatched, bar: 'bg-lime-200', hint: UNMATCHED_HINT,
      spec: { pred: (r: Rec) => r.unmatched > 0.0005, focus: 'done' as DetailFocus, note: UNMATCHED_HINT } }] : []),
    { key: 'exported', label: 'Đã xuất / giao (P025)', v: shownExported, bar: 'bg-emerald-600', hint: EXPORT_HINT,
      spec: { pred: r => r.exported > 0, focus: 'exported', note: EXPORT_HINT } },
  ];
  const remainSegs: Seg[] = remainTiles.map((t, i) => ({
    key: t.key, label: t.label, v: shownRemainBy[i], bar: t.bar, hint: t.hint,
    spec: { pred: (r: Rec) => r.bucket === t.key && r.total - r.done > 0, focus: 'remain' as DetailFocus, note: t.hint },
  }));
  const segTotal = [...doneSegs, ...remainSegs].reduce((a, x) => a + Math.max(x.v, 0), 0);
  // % IN RA (số nguyên) theo phần dư lớn nhất: chia 100% cho 2 nhóm trước, rồi chia % nhóm cho các cột
  const sumV = (segs: Seg[]) => segs.reduce((a, x) => a + Math.max(x.v, 0), 0);
  const [donePctInt, remainPctInt] = apportionInt([sumV(doneSegs), sumV(remainSegs)], 100);
  const segPctInt = new Map<string, number>();
  ([[doneSegs, donePctInt], [remainSegs, remainPctInt]] as const).forEach(([segs, p]) => {
    const parts = apportionInt(segs.map(x => x.v), p);
    segs.forEach((x, i) => segPctInt.set(x.key, parts[i]));
  });
  const groupPctLabel = (p: number, v: number) => (segTotal <= 0 ? '—' : p === 0 && v > 0 ? '<1%' : `${p}%`);
  const donePctLabel = groupPctLabel(donePctInt, sumV(doneSegs));
  const remainPctLabel = groupPctLabel(remainPctInt, sumV(remainSegs));
  const cotCd = [...remainSegs, ...doneSegs];
  const maxCd = Math.max(...cotCd.map(x => x.v), 0);

  // Khung "Cần chú ý": CHỈ hiện việc cần làm (không có dòng "ổn" / số 0)
  const nOpen = kpi.openItems;
  const chuY = ([
    kpi.bot.quaHan.n > 0 && {
      key: 'quaHan', tieuDe: `${fmtInt(kpi.bot.quaHan.n)} hạng mục quá hạn KH nhập kho`, phu: `${fmtTy(kpi.bot.quaHan.remain)} tỷ chưa nhập kho`,
      nhan: 'Trễ', mau: 'bg-red-50 text-red-700',
      mo: () => openDetail({ eyebrow: 'Cần chú ý', title: 'Quá hạn KH nhập kho', pred: r => nhomBot(r, today) === 'quaHan', focus: 'remain', note: GIAI_THICH.quaHan }),
    },
    kpi.bot.chuaCoKh.n > 0 && {
      key: 'chuaCoKh', tieuDe: `${fmtInt(kpi.bot.chuaCoKh.n)} hạng mục chưa có KH nhập kho`,
      phu: `${nOpen > 0 ? Math.round((kpi.bot.chuaCoKh.n / nOpen) * 100) : 0}% hạng mục chưa nhập kho đủ · không theo dõi được trễ hạn`,
      nhan: 'Thiếu KH', mau: 'bg-amber-50 text-amber-800',
      mo: () => openDetail({ eyebrow: 'Cần chú ý', title: 'Chưa có KH nhập kho', pred: r => nhomBot(r, today) === 'chuaCoKh', focus: 'remain', note: 'Hạng mục chưa nhập kho đủ, không có KH nhập kho tuần / tháng — không theo dõi được trễ hạn.' }),
    },
    ctTreNhat && {
      key: 'ctTre', tieuDe: ctTreNhat.name, phu: `${fmtInt(ctTreNhat.overdue)} hạng mục quá hạn KH — nhiều nhất · ${[...ctTreNhat.pms].slice(0, 2).join(', ')}`,
      nhan: 'Trễ nhiều nhất', mau: 'bg-red-50 text-red-700',
      mo: () => { if (canBang()) setHealth({ ct: ctTreNhat.name, inDetail: false }); },
    },
    vmTotal > 0 && {
      key: 'vm', tieuDe: `${fmtInt(vmTotal)} vướng mắc đang mở`, phu: `${fmtInt(vmSum.cts)} công trình · ${fmtInt(vmSum.overdue)} quá hạn BOT`,
      nhan: 'Vướng mắc', mau: 'bg-amber-50 text-amber-800', href: '#/vuong-mac',
    },
    kpi.bot.datKy.n > 0 && {
      key: 'datKy', tieuDe: `${fmtInt(kpi.bot.datKy.n)} hạng mục đạt KH kỳ, chờ KH tiếp`, phu: `${fmtTy(kpi.bot.datKy.remain)} tỷ · cần lập KH kỳ sau`,
      nhan: 'Chờ KH', mau: 'bg-blue-50 text-blue-700',
      mo: () => openDetail({ eyebrow: 'Cần chú ý', title: 'Đạt KH kỳ, chờ KH tiếp', pred: r => nhomBot(r, today) === 'datKy', focus: 'remain', note: 'Hạng mục đã đạt KH nhập kho tuần / tháng của kỳ nhưng đơn hàng còn chưa nhập kho đủ — chờ KH kỳ sau.' }),
    },
  ].filter(Boolean)) as Array<{ key: string; tieuDe: string; phu: string; nhan: string; mau: string; mo?: () => void; href?: string }>;

  // Thẻ số liệu (bấm mở cửa sổ chi tiết đúng tập dòng tạo ra con số)
  const The = ({ label, hint, value, unit, sub, tone = 'text-slate-900', onClick, children }: {
    label: string; hint: string; value: string; unit?: string; sub?: string; tone?: string; onClick: () => void; children?: React.ReactNode;
  }) => (
    <button type="button" onClick={onClick}
      className={`${cardCls} group p-5 text-left transition hover:border-slate-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400`}>
      <p className="flex items-center gap-1.5 text-base text-slate-700">
        {label}<GiaiThich text={hint} />
        <ChevronRight size={15} className="ml-auto text-slate-300 group-hover:text-slate-600" aria-hidden />
      </p>
      <p className={`mt-1.5 text-[2rem] font-bold leading-tight tabular-nums ${tone}`}>
        {value}{unit && <span className="ml-1.5 text-lg font-medium text-slate-400">{unit}</span>}
      </p>
      {children}
      {sub && <p className="mt-2 text-base text-slate-700">{sub}</p>}
    </button>
  );
  // Nút / nhãn trên trang số liệu: đang chọn = đen; đỏ chỉ dành cho rủi ro (trễ, quá hạn)
  const chip = (on: boolean) => `inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`;
  const selectCls = 'text-sm [&>button]:h-9 [&>button]:rounded-lg [&>button]:px-2.5';

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-wood-50">
      {/* Thanh tiêu đề + lọc */}
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Báo cáo tiến độ công trình</h2>
            <p className="text-sm text-slate-500">Giá trị tính bằng tỷ đồng · bấm thẻ, cột hoặc dòng để xem chi tiết · địa chỉ trang giữ bộ lọc, copy để gửi người khác</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* Nhóm công trình: thay cho 2 trang riêng Luồng đỏ / Căn mẫu trước đây */}
          {([null, ...CONFIGURABLE_VIEWS.map(v => v.id)] as (ProjectGroupId | null)[]).map(g => (
            <button key={g ?? 'all'} type="button" onClick={() => { setGroup(g); setF({}); }} className={g !== 'luong-do' ? chip(group === g) : group === g ? chip(true).replace('border-slate-900 bg-slate-900', 'border-red-600 bg-red-600') : chip(false).replace('border-slate-300 bg-white text-slate-700 hover:bg-slate-50', 'border-red-300 bg-white font-semibold text-red-600 hover:bg-red-50')}
              title={g ? `Chỉ các công trình đã setup cho nhóm ${GROUP_SHORT[g]} (Công trình → Setup phân loại)` : 'Mọi công trình'}>
              {g === 'luong-do' && <i className={`h-2 w-2 rounded-full ${group === g ? 'bg-white' : 'bg-red-600'}`} aria-hidden />}
              {g ? GROUP_SHORT[g] : 'Tất cả công trình'}
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-slate-300" aria-hidden />
          {/* Giống "Tình Trạng IPO" ở Bộ lọc tổng trang Tổng quan: chọn nhiều, mặc định Đang sản xuất */}
          <DashboardFilter label="Tình Trạng IPO" options={ipoOptions} selectedValues={ipoSel} onChange={setIpoSel} />
          {activeKeys.map(k => (
            <button key={k} type="button" onClick={() => setKey(k, '')} className={chip(true)} title="Bỏ lọc này">
              {FILTER_LABEL[k]}: {display(k, f[k]!)} <X size={14} aria-hidden />
            </button>
          ))}
          <button type="button" onClick={() => setMoLoc(v => !v)} className={chip(false)} aria-expanded={moLoc}>
            <SlidersHorizontal size={15} aria-hidden /> Bộ lọc{activeKeys.length ? ` (${activeKeys.length})` : ''}
          </button>
          {activeKeys.length > 0 && (
            <button type="button" onClick={() => setF({})} className="text-sm text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline">Xóa lọc</button>
          )}
        </div>
        {moLoc && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3">
            <SearchableSelect value={f.ct ?? ''} onChange={v => setKey('ct', v)} options={options.ct.map(o => ({ code: o, name: o }))}
              allLabel="Công trình: Tất cả" widthClass="w-56" className={selectCls} />
            <SearchableSelect value={f.pm ?? ''} onChange={v => setKey('pm', v)} options={options.pm.map(o => ({ code: o, name: o }))}
              allLabel="PM: Tất cả" widthClass="w-40" className={selectCls} />
            <SearchableSelect value={f.kv ?? ''} onChange={v => setKey('kv', v)} options={options.kv.map(o => ({ code: o, name: o }))}
              allLabel="Khu vực: Tất cả" widthClass="w-44" className={selectCls} />
            <SearchableSelect value={f.month ?? ''} onChange={v => setKey('month', v)} options={options.month.map(o => ({ code: o, name: monthLabel(o) }))}
              allLabel="Tháng hạn: Tất cả" widthClass="w-40" className={selectCls} />
            {/* Nhóm CT (vd. "CỤM TÂY HỒ VIEW", "OUT TOP 33 CT") và tình trạng dự án — cột có từ 10/2026 */}
            {showCol.nct && (
              <SearchableSelect value={f.nct ?? ''} onChange={v => setKey('nct', v)} options={options.nct.map(o => ({ code: o, name: o }))}
                allLabel="Nhóm CT: Tất cả" widthClass="w-44" className={selectCls} />
            )}
            {showCol.tda && (
              <SearchableSelect value={f.tda ?? ''} onChange={v => setKey('tda', v)} options={options.tda.map(o => ({ code: o, name: o }))}
                allLabel="Dự án: Tất cả" widthClass="w-40" className={selectCls} />
            )}
          </div>
        )}
      </div>

      <div className="space-y-5 p-4 md:p-8">
        {group && groupSize === 0 && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            Chưa có công trình nào được setup cho nhóm {GROUP_SHORT[group]}. Vào Công trình → Setup phân loại để chọn công trình.
          </p>
        )}

        {/* 4 thẻ */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <The label="Tổng giá trị đơn hàng" hint={GIAI_THICH.tongGiaTri} value={fmtTy(kpi.total)} unit="tỷ"
            sub={`${fmtInt(kpi.cts)} công trình · ${fmtInt(kpi.items)} hạng mục${kpi.cancelled ? ` · ${fmtInt(kpi.cancelled)} hủy` : ''}`}
            onClick={() => openDetail({ eyebrow: 'Chỉ số', title: 'Tổng giá trị đơn hàng', pred: () => true, focus: 'total', note: GIAI_THICH.tongGiaTri })} />
          <The label="Đã nhập kho (P022)" hint={GIAI_THICH.daNhapKho} value={fmtTy(roundTy(kpi.done))} unit={`tỷ · ${donePctLabel}`} tone="text-emerald-700"
            sub={`Chưa nhập ${fmtTy(shownRemain)} tỷ · ${remainPctLabel} · ${fmtInt(kpi.stocked)} mục nhập đủ`}
            onClick={() => openDetail({ eyebrow: 'Chỉ số', title: 'Đã nhập kho (P022)', pred: r => r.done > 0, focus: 'done', note: GIAI_THICH.daNhapKho })}>
            <span className="mt-3 flex h-2 overflow-hidden rounded-full bg-amber-400" aria-hidden>
              <i className="bg-emerald-600" style={{ width: `${donePctInt}%` }} />
            </span>
          </The>
          <The label="Quá hạn KH nhập kho" hint={GIAI_THICH.quaHan} value={fmtInt(kpi.bot.quaHan.n)} unit="mục"
            tone={kpi.bot.quaHan.n ? 'text-red-600' : 'text-slate-900'} sub={`${fmtTy(kpi.bot.quaHan.remain)} tỷ chưa nhập kho`}
            onClick={() => openDetail({ eyebrow: 'Chỉ số', title: 'Quá hạn KH nhập kho', pred: r => nhomBot(r, today) === 'quaHan', focus: 'remain', note: GIAI_THICH.quaHan })} />
          <The label="Quá BOT dự án, chưa xong" hint={GIAI_THICH.quaBot} value={fmtInt(kpi.pastBot)} unit="mục"
            tone={kpi.pastBot ? 'text-red-600' : 'text-slate-900'} sub={`${fmtTy(kpi.pastBotRemain)} tỷ chưa nhập kho`}
            onClick={() => openDetail({ eyebrow: 'Chỉ số', title: 'Quá BOT dự án, chưa xong', pred: r => r.open && !!r.botDuAn && r.botDuAn.getTime() < today, focus: 'remain', note: GIAI_THICH.quaBot })} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* Biểu đồ: giá trị theo công đoạn (dòng chảy sản xuất). Theo PC xem bảng PC; theo khu vực / khách hàng xem
              khung Nhóm đơn hàng phía dưới — không lặp lại ở đây */}
          <div className={`${cardCls} p-5`}>
            <h3 className="flex items-center gap-1.5 text-lg font-semibold text-slate-900">
              Giá trị theo công đoạn <span className="text-sm font-normal text-slate-400">(tỷ)</span>
              <GiaiThich text={GIAI_THICH.congDoan} />
            </h3>
            <>
                <div className="mt-6 flex h-72 items-end gap-3 border-b border-slate-200 px-1">
                  {cotCd.map(x => (
                    <button key={x.key} type="button" onClick={() => openDetail({ eyebrow: 'Công đoạn', title: x.label, ...x.spec })}
                      title={`${x.label}: ${fmtTy(x.v)} tỷ\n${x.hint}\nBấm để xem chi tiết`}
                      className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end focus:outline-none">
                      <span className="mb-1 whitespace-nowrap text-sm font-semibold tabular-nums text-slate-900">
                        {fmtTy(x.v)} <span className="text-xs font-normal text-slate-400">{segPctInt.get(x.key) ?? 0}%</span>
                      </span>
                      <span className={`w-3/5 max-w-[5.5rem] rounded-t-md ${x.bar} transition group-hover:brightness-95 group-focus-visible:ring-2 group-focus-visible:ring-slate-900`}
                        style={{ height: maxCd > 0 ? Math.max(2, (Math.max(x.v, 0) / maxCd) * 244) : 0 }} />
                    </button>
                  ))}
                </div>
                <div className="flex gap-3 px-1 pt-2">
                  {cotCd.map(x => {
                    const [ten, ma] = tachMa(x.label);
                    return (
                      <div key={x.key} className="min-w-0 flex-1 text-center leading-tight">
                        <p className="text-xs font-medium text-slate-800">{ten}</p>
                        {ma && <p className="text-[0.6875rem] text-slate-400">{ma}</p>}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex gap-3 px-1 text-xs font-semibold">
                  <div className="border-t-[3px] border-amber-500 pt-1.5 text-center text-amber-700" style={{ flex: remainSegs.length }}>
                    Chưa nhập kho · {fmtTy(shownRemain)} tỷ · {remainPctLabel}
                  </div>
                  <div className="border-t-[3px] border-emerald-600 pt-1.5 text-center text-emerald-700" style={{ flex: doneSegs.length }}>
                    Đã nhập kho · {fmtTy(roundTy(kpi.done))} tỷ · {donePctLabel}
                  </div>
                </div>
            </>
          </div>

          {/* Cần chú ý — chỉ việc cần làm */}
          <div className={`${cardCls} p-5`}>
            <h3 className="text-lg font-semibold text-slate-900">Cần chú ý</h3>
            {chuY.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Không có gì cần xử lý theo bộ lọc hiện tại.</p>
            ) : (
              <ul className="mt-1 divide-y divide-slate-100">
                {chuY.map(x => {
                  const noiDung = (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.9375rem] text-slate-900 group-hover:underline">{x.tieuDe}</span>
                        <span className="mt-0.5 block text-sm text-slate-500">{x.phu}</span>
                      </span>
                      <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${x.mau}`}>
                        <i className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />{x.nhan}
                      </span>
                    </>
                  );
                  return (
                    <li key={x.key}>
                      {x.href
                        ? <a href={x.href} className="group flex items-start gap-3 py-3">{noiDung}</a>
                        : <button type="button" onClick={x.mo} className="group flex w-full items-start gap-3 py-3 text-left">{noiDung}</button>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Bố cục cũ: trái (tháng hạn + PC) · giữa (danh sách công trình) · phải (cơ cấu đơn hàng) */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,3.3fr)_minmax(0,1.25fr)]">
          {/* Cột trái: biểu đồ theo tháng + bảng theo PC */}
          <div className="xl:col-span-4 2xl:col-span-1 flex flex-col gap-4">
            <div className={`${cardCls} p-5`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-semibold text-slate-800">Giá trị theo tháng hạn (Tỷ) <span className="font-normal text-slate-500">· KH nhập kho tuần → tháng</span></p>
                <div className="flex items-center gap-3 whitespace-nowrap text-[0.6875rem] text-slate-500">
                  <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-sm" style={{ background: COLOR_DONE }} />Đã nhập kho</span>
                  <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-sm" style={{ background: COLOR_REMAIN }} />Chưa nhập kho</span>
                </div>
              </div>
              {noMonthBucket && (
                <button
                  type="button"
                  onClick={() => openMonthDetail(NO_MONTH)}
                  title="Hạng mục chưa có KH nhập kho tuần / tháng — bấm để xem chi tiết"
                  className="mb-1 text-left text-[0.6875rem] text-slate-500 hover:text-slate-800 hover:underline"
                >
                  Không có hạn — chưa có KH / đạt KH kỳ (không vẽ):{' '}
                  <span className="tabular-nums" style={{ color: COLOR_DONE }}>{formatTy(noMonthBucket.done)}</span>
                  {' · '}
                  <span className="tabular-nums" style={{ color: COLOR_REMAIN }}>{formatTy(noMonthBucket.remain)}</span> tỷ
                </button>
              )}
              {outBuckets.length > 0 && (
                <p className="mb-1 flex flex-wrap gap-x-3 text-[0.6875rem] text-slate-500">
                  {outBuckets.map(b => (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => openMonthDetail(b.key)}
                      title="Tháng hạn ngoài khoảng biểu đồ (không vẽ) — bấm để xem chi tiết"
                      className="text-left hover:text-slate-800 hover:underline"
                    >
                      {b.label}:{' '}
                      <span className="tabular-nums" style={{ color: COLOR_DONE }}>{formatTy(b.done)}</span>
                      {' · '}
                      <span className="tabular-nums" style={{ color: COLOR_REMAIN }}>{formatTy(b.remain)}</span> tỷ
                    </button>
                  ))}
                </p>
              )}
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthChartData} margin={{ top: 8, right: 4, left: -14, bottom: 0 }}>
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatTy(v)} />
                    <Tooltip
                      cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                      formatter={(v: number, name: string) => [`${formatTy(v)} Tỷ`, name === 'done' ? 'Đã nhập kho' : 'Chưa nhập kho']}
                    />
                    <Bar dataKey="done" stackId="a" fill={COLOR_DONE} cursor="pointer" onClick={(d: any) => openMonthDetail(d.key ?? d.payload?.key)}>
                      {monthChartData.map(d => <Cell key={d.key} opacity={f.month && f.month !== d.key ? 0.25 : 1} />)}
                    </Bar>
                    <Bar dataKey="remain" stackId="a" fill={COLOR_REMAIN} radius={[3, 3, 0, 0]} cursor="pointer" onClick={(d: any) => openMonthDetail(d.key ?? d.payload?.key)}>
                      {monthChartData.map(d => <Cell key={d.key} opacity={f.month && f.month !== d.key ? 0.25 : 1} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Bảng PC giãn hết phần còn lại của cột (cao bằng bảng công trình bên cạnh), cuộn bên trong */}
            <div className={`${cardCls} flex min-h-[22rem] flex-1 flex-col overflow-hidden`}>
              <p className="text-sm font-semibold text-slate-800 px-4 pt-3 pb-2">Theo người phụ trách (PC) <span className="font-normal text-slate-400">· {pcTable.length} PC</span></p>
              <div className="relative min-h-0 flex-1">
              <div className="absolute inset-0 overflow-auto custom-scrollbar">
                <table className="w-full table-fixed text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-left font-medium pl-3 pr-1.5 py-2">Tên PC</th>
                      <th className="text-right font-medium px-1.5 py-2 w-12" title="Số hạng mục">Mục</th>
                      <th className="text-right font-medium px-1.5 py-2 w-[3.75rem]" title="Tổng giá trị (tỷ)">GT (Tỷ)</th>
                      <th className="text-right font-medium px-1.5 py-2 w-12 whitespace-nowrap" title="Giá trị đã nhập kho / tổng giá trị">% NK</th>
                      <th className="text-right font-medium pl-1.5 pr-3 py-2 w-[4.25rem] whitespace-nowrap" title={GIAI_THICH.quaHan}>Quá hạn</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pcTable.map(r => (
                      <tr key={r.name} onClick={() => openDetail({
                            eyebrow: 'Người phụ trách (PC)', title: r.name, exclude: 'pc',
                            pred: rec => rec.pc === r.name, focus: 'total', filter: { key: 'pc', value: r.name },
                          })}
                          title="Bấm để xem các công trình PC đang quản lý"
                          className={`group cursor-pointer hover:bg-slate-50 ${f.pc === r.name ? 'bg-slate-100 font-semibold' : ''}`}>
                        <td className="pl-3 pr-1.5 py-1.5 text-slate-800">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="min-w-0 break-words group-hover:text-blue-700 group-hover:underline">{r.name}</span>
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
                        <td className="px-1.5 py-1.5 text-right tabular-nums" title={`${r.cts.size} công trình`}>{fmtInt(r.items)}</td>
                        <td className="px-1.5 py-1.5 text-right tabular-nums">{fmtTy(r.total)}</td>
                        <td className="px-1.5 py-1.5">
                          {(() => {
                            const p = r.total > 0 ? Math.min(100, (r.done / r.total) * 100) : 0;
                            return (
                              <span className="flex justify-end" title={`Đã nhập kho ${fmtTy(r.done)} / ${fmtTy(r.total)} tỷ`}>
                                <span className={`tabular-nums ${p >= 70 ? 'text-emerald-700' : 'text-slate-600'}`}>{p.toFixed(0)}%</span>
                              </span>
                            );
                          })()}
                        </td>
                        <td className="pl-1.5 pr-3 py-1.5 text-right tabular-nums">
                          {r.overdue ? <span className="rounded-full bg-red-50 px-1.5 py-0.5 font-semibold text-red-600">{fmtInt(r.overdue)}</span> : <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-slate-50 font-semibold text-slate-800">
                    <tr>
                      <td className="pl-3 pr-1.5 py-2">Tổng cộng</td>
                      <td className="px-1.5 py-2 text-right tabular-nums">{fmtInt(pcTable.reduce((s, r) => s + r.items, 0))}</td>
                      <td className="px-1.5 py-2 text-right tabular-nums">{fmtTy(pcTable.reduce((s, r) => s + r.total, 0))}</td>
                      <td className="px-1.5 py-2 text-right tabular-nums text-slate-600">
                        {(() => { const t = pcTable.reduce((s, r) => s + r.total, 0); return t > 0 ? `${((pcTable.reduce((s, r) => s + r.done, 0) / t) * 100).toFixed(0)}%` : '—'; })()}
                      </td>
                      <td className="pl-1.5 pr-3 py-2 text-right tabular-nums text-red-600">{fmtInt(pcTable.reduce((s, r) => s + r.overdue, 0)) || ''}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              </div>
            </div>
          </div>

          {/* Bảng công trình */}
            <div className={`xl:col-span-8 2xl:col-span-1 ${cardCls} flex flex-col overflow-hidden`}>
            <div className="flex flex-wrap items-center gap-3 px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-900">Công trình</h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{fmtInt(ctTable.length)}</span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <label className="text-sm text-slate-500" htmlFor="ct-xep">Sắp xếp</label>
                <select id="ct-xep" value={xep} onChange={e => setXep(e.target.value as XepCt)}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none">
                  {XEP_CT.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
                <div className="relative">
                  <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
                  <input value={ctSearch} onChange={e => setCtSearch(e.target.value)} placeholder="Tìm công trình, PM…" aria-label="Tìm công trình"
                    className="h-9 w-56 rounded-lg bg-slate-100 pl-8 pr-2 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300" />
                </div>
              </div>
            </div>
            <div className="max-h-[760px] overflow-auto custom-scrollbar">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 text-[0.6875rem] uppercase text-slate-500">
                  <tr>
                    <th className="w-10 py-2.5 pl-5 pr-2 text-right font-medium">#</th>
                    <th className="px-2 py-2 text-left font-medium">Công trình · PM</th>
                    <th className="px-2 py-2 text-right font-medium">Hạng mục</th>
                    <th className="px-2 py-2 text-right font-medium"
                        title={ctHasCancel ? 'Tổng trị giá đơn hàng, gồm cả đơn hủy (dòng phụ "hủy …" = phần trị giá đơn hủy). Cửa sổ công trình không tính đơn hủy — lọc Tình trạng IPO để bỏ.' : undefined}>
                      Giá trị (tỷ){ctHasCancel && <span className="text-rose-500">*</span>}
                    </th>
                    <th className="px-2 py-2 text-left font-medium" title={GIAI_THICH.hoanThanh}>Hoàn thành</th>
                    <th className="px-2 py-2 text-left font-medium" title="BOT dự án — hạn chung của công trình (tham khảo); đỏ = đã qua mà còn hạng mục chưa xong">BOT dự án</th>
                    <th className="px-2 py-2 text-right font-medium" title={GIAI_THICH.quaHan}>Quá hạn</th>
                    <th className="whitespace-nowrap py-2.5 pl-2 pr-5 text-right font-medium" title="Vướng mắc chưa xử lý xong (theo mã công trình)">Vướng mắc</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ctTable.map((r, idx) => {
                    const pct = r.total > 0 ? Math.min(100, (r.done / r.total) * 100) : 0;
                    const pms = [...r.pms];
                    const botLeft = r.botDuAn ? Math.floor((r.botDuAn.getTime() - today) / 86_400_000) : null;
                    return (
                      <tr key={r.name} onClick={() => { if (canBang()) setHealth({ ct: r.name, inDetail: false }); }}
                          title="Bấm để xem tổng quan công trình (BOT · BOP · BOM)"
                          className={`group cursor-pointer hover:bg-slate-50 ${f.ct === r.name ? 'bg-slate-100' : ''}`}>
                        <td className="py-2.5 pl-5 pr-2 text-right tabular-nums text-slate-400">{idx + 1}</td>
                        <td className="min-w-[200px] px-2 py-2">
                          <div className="flex items-start gap-1.5">
                            <span className="min-w-0 break-words text-slate-900 group-hover:underline">{r.name}</span>
                            {/* Lọc chéo theo công trình (tách riêng để bấm dòng là mở tổng quan công trình) */}
                            <button type="button" onClick={e => { e.stopPropagation(); toggle('ct', r.name); }}
                              title={f.ct === r.name ? 'Bỏ lọc công trình này' : 'Lọc cả trang theo công trình này'} aria-label="Lọc theo công trình"
                              className={`mt-0.5 shrink-0 rounded p-0.5 hover:bg-slate-200 ${f.ct === r.name ? 'text-slate-900' : 'text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100'}`}>
                              <Filter size={13} />
                            </button>
                          </div>
                          <div className="text-xs text-slate-500" title={pms.join(', ')}>{pms.slice(0, 2).join(' · ')}{pms.length > 2 ? ` +${pms.length - 2}` : ''}</div>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-600">{fmtInt(r.items)}</td>
                        <td className="px-2 py-2 text-right font-medium tabular-nums text-slate-900">
                          {fmtTy(r.total)}
                          {r.cancelled > 0 && (
                            <div className="text-[0.6875rem] font-normal leading-tight text-rose-500" title="Trị giá đơn hủy (đã tính trong Tổng GT)">hủy {fmtTy(r.cancelled)}</div>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-9 text-right text-xs tabular-nums text-slate-500">{pct.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className={`whitespace-nowrap px-2 py-2 tabular-nums ${!r.botDuAn ? 'text-slate-300' : r.open === 0 ? 'text-emerald-600' : botLeft! < 0 ? 'font-semibold text-red-600' : botLeft! <= 30 ? 'text-amber-600' : 'text-slate-500'}`}
                            title={r.botDuAn ? (r.open === 0 ? 'Đã nhập kho đủ' : botLeft! < 0 ? `Quá BOT dự án ${-botLeft!} ngày · còn ${fmtInt(r.open)} hạng mục` : `Còn ${botLeft} ngày · ${fmtInt(r.open)} hạng mục chưa xong`) : 'Chưa có BOT dự án'}>
                          {r.botDuAn ? r.botDuAn.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {r.overdue
                            ? <span className="inline-block min-w-[2.25rem] rounded-full bg-red-50 px-2 py-0.5 text-center text-xs font-semibold text-red-600">{fmtInt(r.overdue)}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className={`py-2.5 pl-2 pr-5 text-right tabular-nums ${r.vm.open ? 'font-semibold text-red-600' : 'text-slate-300'}`}
                            title={r.vm.open ? `${r.vm.open} vướng mắc đang mở · ${r.vm.overdue} quá hạn BOT` : undefined}>
                          {vmRows === null ? '…' : r.vm.open || '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {ctTable.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Không có công trình phù hợp</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {/* Cột phải: thẻ "Cơ cấu đơn hàng" dùng chung với Tổng quan / Luồng đỏ / Căn mẫu */}
          <div className="xl:col-span-12 2xl:col-span-1 flex flex-col">
            <OrderMixCard
              metric={metric}
              onMetricChange={setMetric}
              summary={{ cts: kpi.cts, items: kpi.items, totalTy: kpi.total / UNIT }}
              scopeNote={ipoSel.length ? `Tình trạng IPO: ${ipoSel.join(', ')}` : 'Tình trạng IPO: tất cả'}
              onExport={() => (canBang() ? exportOrderMixExcel({
                fileName: `co_cau_don_hang_cong_trinh_${new Date().toISOString().slice(0, 10)}`,
                scopeLabel: filterSummary() || 'Tất cả',
                byDim: { kv: apply('kv'), kh: apply('kh'), pl: apply('pl') },
                scopeRows: rowsAll,
                columns,
              }) : undefined)}
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
                  onClick={() => { if (canBang()) setHexScope({ ct: null, inDetail: true }); }}
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
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 px-5 py-4">
              <PcStat label="Công trình" value={fmtInt(detailData.cts)} />
              <PcStat label="Hạng mục" value={fmtInt(detailData.items)} active={detail.focus === 'items'} onClick={() => doiFocus('items')} />
              <PcStat label="Tổng giá trị" value={fmtTy(detailData.total)} unit="Tỷ" active={detail.focus === 'total'} onClick={() => doiFocus('total')} />
              <PcStat
                label="Đã nhập kho" value={fmtTy(detailData.done)} unit="Tỷ" tone="text-emerald-600"
                active={detail.focus === 'done'} onClick={() => doiFocus('done')}
                sub={`${(detailData.total > 0 ? (detailData.done / detailData.total) * 100 : 0).toFixed(1)}% tổng giá trị`}
              />
              <PcStat label="Chưa nhập kho" value={fmtTy(detailData.remain)} unit="Tỷ" tone="text-amber-600" active={detail.focus === 'remain'} onClick={() => doiFocus('remain')} />
              <PcStat label="Đã xuất / giao" value={fmtTy(detailData.exported)} unit="Tỷ" tone="text-sky-700" active={detail.focus === 'exported'} onClick={() => doiFocus('exported')} />
              <PcStat label="Tồn kho" value={fmtTy(detailData.stock)} unit="Tỷ" tone="text-violet-700" active={detail.focus === 'stock'} onClick={() => doiFocus('stock')} />
            </div>

            <div className="flex items-center justify-between gap-3 px-5 pb-2">
              <p className="text-xs font-semibold text-slate-700">
                Danh sách công trình ({fmtInt(detailProjects.length)})
                <span className="font-normal text-slate-400"> · bấm 1 ô số phía trên để xếp theo cột đó · bấm 1 dòng để xem tổng quan BOT · BOP · BOM</span>
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
                    <th className={`text-right font-medium px-2 py-2 ${detail.focus === 'exported' ? 'text-slate-900' : ''}`}>Đã xuất / giao (Tỷ)</th>
                    <th className={`text-right font-medium px-2 py-2 ${detail.focus === 'stock' ? 'text-slate-900' : ''}`}>Tồn kho (Tỷ)</th>
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
                      <tr key={p.name} onClick={() => { if (canBang()) setHealth({ ct: p.name, inDetail: true }); }}
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
                        <td className={`px-2 py-1.5 text-right tabular-nums ${strong('exported')}`}>{fmtTy(p.exported)}</td>
                        <td className={`px-2 py-1.5 text-right tabular-nums ${strong('stock')}`}>{fmtTy(p.stock)}</td>
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
                    <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-400">Không có công trình phù hợp</td></tr>
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
                      <td className="px-2 py-2 text-right tabular-nums">{fmtTy(detailProjects.reduce((s, p) => s + p.exported, 0))}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmtTy(detailProjects.reduce((s, p) => s + p.stock, 0))}</td>
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
        onOpenHexList={() => health && setHexScope({ ct: health.ct, inDetail: health.inDetail })}
        inventory={inventory}
        paceHexes={healthPaceHexes}
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