import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts';
import { Search, X, Filter, ChevronRight, AlertTriangle } from 'lucide-react';
import { ModalShell } from '../shared/ModalShell';
import { DashboardFilter } from '../Dashboard/components/shared/DashboardFilter';
import { exportOrderMixExcel } from '../Dashboard/utils/orderMixExport';
import { DataRow, ColumnDefinition, TARGET_COLUMN_NAMES } from '../../types';
import { findColumnKey } from '../Dashboard/utils/columnKeyResolver';
import { parseNumber } from '../Dashboard/utils/numberParsers';
import { deadlineOf, resolveDeadlineKeys, isQtyComplete, projectMatchKey } from '../../utils/productionMetrics';
import { fetchVuongMacByProject, type VmByProjectRow } from '../../services/vuongMacService';
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
type FKey = 'ct' | 'pm' | 'pc' | 'kv' | 'kh' | 'pl' | 'month' | 'nct' | 'tda';
type Filters = Partial<Record<FKey, string | undefined>>;

interface Rec {
  ct: string; pm: string; pc: string; kv: string; kh: string; pl: string;
  nct: string;        // nhóm công trình (nhom_ct) — vd. "CỤM TÂY HỒ VIEW", "OUT TOP 33 CT"
  tda: string;        // tình trạng dự án (tinh_trang_du_an) — SẢN XUẤT / ĐÓNG DỰ ÁN / CẦN XỬ LÝ
  ma: string;         // mã công trình (khớp vướng mắc theo mã)
  deadline: Date | null; // hạn = KH nhập kho tuần → tháng
  open: boolean;      // còn phải theo dõi (chưa nhập đủ giá trị / số lượng, không hủy)
  overdue: boolean;   // open và đã qua hạn
  botDuAn: Date | null;  // BOT dự án (tham khảo)
  ctKey: string;      // khoá ĐẾM công trình: tên chuẩn (projectMatchKey, xem projectKeyResolver)
  month: string;      // 'YYYY-MM' hoặc 'none'
  status: Status;
  total: number;      // trị giá đơn hàng — GỒM cả đơn HỦY (khớp file gốc); muốn bỏ thì lọc Tình trạng IPO
  done: number;       // giá trị đã nhập kho, tối đa = total (đơn HỦY = 0)
  // Đã xuất / giao = đã nhập kho − tồn kho (không âm). Không lấy cột xuất kho lũy kế vì bảng xuất kho chỉ có
  // dữ liệu từ 01/2025: hạng mục giao trước đó có xuất = 0 nhưng tồn = 0 => nhập − xuất ≠ tồn (lệch hàng trăm tỷ).
  exported: number;
  exportedRecorded: number; // xuất kho lũy kế ghi trong bảng xuất kho (thanh_tien_xuat_kho_luy_ke) — để tham khảo
  stock: number;      // giá trị tồn kho hiện tại (thanh_tien_ton_kho_hien_tai) — khớp bảng tồn kho
  qtyDone: boolean;   // đã nhập đủ số lượng đơn hàng (đếm là đã nhập kho dù thành tiền NK thấp hơn trị giá)
  row: DataRow;       // dòng gốc — để mở cửa sổ danh sách HEX
  ipo: string;        // Tình trạng IPO gốc (đã trim) — cho bộ lọc Tình trạng IPO
}

// Mặc định không lọc Tình trạng IPO: các ô KPI hiện tổng toàn bộ công trình, chỉ đổi khi người dùng chọn lọc
// Mặc định chỉ xem hạng mục ĐANG SẢN XUẤT (khớp bộ lọc mặc định ở trang Tổng quan); chọn lại được ở bộ lọc
const isDefaultIpo = (ipo: string) => /ĐANG SẢN XUẤT/i.test(ipo);

const NO_DATA = '(Chưa có)';
const NO_MONTH = 'none';

const FILTER_LABEL: Record<FKey, string> = {
  ct: 'Công trình', pm: 'PM', pc: 'PC', kv: 'Khu vực', kh: 'Khách hàng', pl: 'Nhóm SP', month: 'Tháng hạn',
  nct: 'Nhóm CT', tda: 'Tình trạng dự án',
};

const COLOR_DONE = '#16a34a';
const COLOR_REMAIN = '#f59e0b';
// Giá trị gốc tính theo triệu đồng (khớp backend TRIEU_TO_TY) => Tỷ = giá trị gốc / 1,000
const UNIT = 1000;
const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
const fmtTy = formatTrieuAsTy;
const monthLabel = (key: string) => {
  if (key === NO_MONTH) return 'Chưa có KH nhập kho';
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

const isNotStarted = (status: string) => STATUS_GROUPS.CHUA_THE_SX.some(s => status.includes(s));

interface Props {
  data: DataRow[];
  columns: ColumnDefinition[];
  /** Tài khoản đang đăng nhập (ghi chú / vướng mắc trong cửa sổ HEX) */
  currentUser?: string;
  /** Bảng nhập kho — nhịp nhập kho theo tuần + dự báo trong cửa sổ tổng quan công trình */
  inventory?: DataRow[];
}

const ConstructionOverview: React.FC<Props> = ({ data, columns, currentUser = '', inventory }) => {
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
  const [health, setHealth] = useState<{ ct: string; inDetail: boolean } | null>(null);
  const healthCt = health?.ct ?? null;
  const [f, setF] = useState<Filters>({});
  // null = chưa chọn gì => dùng mặc định (Đang sản xuất) khi đã có dữ liệu
  const [ipoPicked, setIpoSel] = useState<string[] | null>(null);
  const [metric, setMetric] = useState<'count' | 'value'>('count'); // cho 3 biểu đồ tròn
  const [ctSearch, setCtSearch] = useState('');

  const toggle = (k: FKey, v: string) => setF(p => ({ ...p, [k]: p[k] === v ? undefined : v }));
  const setKey = (k: FKey, v: string) => setF(p => ({ ...p, [k]: v || undefined }));
  const activeKeys = (Object.keys(f) as FKey[]).filter(k => f[k]);

  // Đã nhập kho đủ trị giá đơn hàng HOẶC đủ số lượng (dùng chung cho ô KPI và popup chi tiết)
  const isStocked = (r: Rec) => r.status !== 'HỦY' && ((r.total > 0 && r.done >= r.total) || r.qtyDone);

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
    const xkK = key('thanh_tien_xuat_kho_luy_ke', 'thanh_tien_xuat_kho_luy_ke');
    const tkK = key('thanh_tien_ton_kho_hien_tai', 'thanh_tien_ton_kho_hien_tai');
    const nctK = columns.find(c => c.key === 'nhom_ct')?.key ?? 'nhom_ct';
    const tdaK = columns.find(c => c.key === 'tinh_trang_du_an')?.key ?? 'tinh_trang_du_an';
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

      // Tháng hạn = KH nhập kho tuần → KH nhập kho tháng (quy tắc chung; không có KH => "Chưa có KH nhập kho")
      const dl = deadlineOf(row, dlKeys);
      const d = dl.date;
      const month = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : NO_MONTH;

      const cancelled = status === 'HỦY';
      const done = cancelled ? 0 : Math.min(Math.max(invRaw, 0), totalRaw);
      const stock = Math.max(parseNumber(row[tkK]), 0);
      const qtyDone = isQtyComplete(row);
      // Cùng định nghĩa "còn theo dõi" với cửa sổ tổng quan công trình (ProjectHealthModal)
      const open = !cancelled && !qtyDone && (totalRaw - done > 0 || totalRaw <= 0);
      out.push({
        ct, ctKey: projectKey(row), pm: txt(row[pmK]), pc: txt(row[pcK]), kv: txt(row[kvK]), kh: txt(row[khK]), pl: txt(row[plK]),
        nct: txt(row[nctK]), tda: txt(row[tdaK]), ma: String(row[maK] ?? '').trim().toUpperCase(),
        deadline: d, open, overdue: open && !!d && d.getTime() < today, botDuAn: dl.botDuAn,
        ipo: String(row[ipoK] ?? '').trim(),
        month, status,
        // Trang có bộ lọc Tình trạng IPO => trị giá gồm cả HỦY (khớp tổng cột trị giá ở file gốc);
        // người xem lọc IPO để bỏ HỦY khi cần
        total: totalRaw,
        done,
        exported: Math.max(done - stock, 0),
        exportedRecorded: Math.max(parseNumber(row[xkK]), 0),
        stock,
        qtyDone,
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
  }, [data, columns, today]);

  // Bộ lọc Tình trạng IPO (mặc định: Đang sản xuất — bỏ chọn hết = tất cả),
  // áp cho TOÀN BỘ trang trước mọi bộ lọc khác.
  const ipoOptions = useMemo(
    () => [...new Set(allRecords.map(r => r.ipo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')),
    [allRecords]
  );
  const ipoSel = useMemo(() => ipoPicked ?? ipoOptions.filter(isDefaultIpo), [ipoPicked, ipoOptions]);
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
    let cancelled = 0, stocked = 0, notStocked = 0, partial = 0, total = 0, done = 0, exported = 0, stock = 0, exportedRecorded = 0;
    let stockOver = 0, stockOverItems = 0; // hạng mục tồn kho (theo đơn giá tồn) lớn hơn giá trị đã nhập
    for (const r of rowsAll) {
      cts.add(r.ctKey);
      if (r.status === 'HỦY') cancelled++;
      else if (isStocked(r)) stocked++;
      else { notStocked++; if (r.done > 0) partial++; }
      total += r.total; done += r.done; exported += r.exported; stock += r.stock; exportedRecorded += r.exportedRecorded;
      if (r.stock > r.done + 0.001) { stockOver += r.stock - r.done; stockOverItems++; }
    }
    // Cảnh báo: quá hạn KH nhập kho / chưa có KH / qua BOT dự án (hạng mục còn theo dõi)
    let overdue = 0, overdueRemain = 0, noPlan = 0, noPlanRemain = 0, pastBot = 0, pastBotRemain = 0;
    for (const r of rowsAll) {
      if (!r.open) continue;
      const rem = r.total - r.done;
      if (r.overdue) { overdue++; overdueRemain += rem; }
      if (!r.deadline) { noPlan++; noPlanRemain += rem; }
      if (r.botDuAn && r.botDuAn.getTime() < today) { pastBot++; pastBotRemain += rem; }
    }
    return {
      cts: cts.size, items: rowsAll.length, cancelled, stocked, notStocked, partial, total, done, remain: total - done,
      exported, stock, exportedRecorded, stockOver, stockOverItems,
      overdue, overdueRemain, noPlan, noPlanRemain, pastBot, pastBotRemain,
    };
  }, [rowsAll, today]);

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
    type Row = { name: string; ctKey: string; pms: Set<string>; mas: Set<string>; items: number; total: number; done: number; open: number; overdue: number; botDates: string[] };
    const m = new Map<string, Row>();
    for (const r of apply('ct')) {
      if (q && !r.ct.toLowerCase().includes(q)) continue;
      const e = m.get(r.ct) ?? { name: r.ct, ctKey: r.ctKey, pms: new Set<string>(), mas: new Set<string>(), items: 0, total: 0, done: 0, open: 0, overdue: 0, botDates: [] };
      e.pms.add(r.pm); if (r.ma) e.mas.add(r.ma); e.items++; e.total += r.total; e.done += r.done;
      if (r.open) e.open++; if (r.overdue) e.overdue++;
      if (r.botDuAn) e.botDates.push(r.botDuAn.toISOString().slice(0, 10));
      m.set(r.ct, e);
    }
    return [...m.values()].map(e => {
      // BOT dự án: 1 ngày chung cho cả công trình (lấy ngày xuất hiện nhiều nhất)
      const cnt = new Map<string, number>();
      e.botDates.forEach(d => cnt.set(d, (cnt.get(d) ?? 0) + 1));
      let best = '', n = -1; cnt.forEach((c, d) => { if (c > n) { best = d; n = c; } });
      const botDuAn = best ? new Date(Number(best.slice(0, 4)), Number(best.slice(5, 7)) - 1, Number(best.slice(8, 10))) : null;
      return { ...e, botDuAn, vm: vmOf(e.mas, e.ctKey) };
    }).sort((a, b) => b.total - a.total || b.items - a.items);
  }, [records, f, ctSearch, vmIndex]); // eslint-disable-line react-hooks/exhaustive-deps
  const vmTotal = useMemo(() => ctTable.reduce((s, r) => s + r.vm.open, 0), [ctTable]);

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

  // Cột tháng hạn giao: đúng tập dòng của cột (mọi bộ lọc trừ "Tháng hạn", tháng = cột đã bấm)
  const openMonthDetail = (key?: string) => {
    if (!key) return;
    // Cột gộp ("Trước …" / "Sau …"): gồm nhiều tháng nên không có nút lọc cả trang theo 1 tháng
    const isBucket = key.startsWith('<') || key.startsWith('>');
    openDetail({
      eyebrow: 'Tháng hạn (KH nhập kho tuần → tháng)', title: monthLabel(key), exclude: 'month',
      pred: r => chartMonthBucket(r.month, monthRange.from, monthRange.to) === key, focus: 'remain',
      ...(isBucket ? {} : { filter: { key: 'month' as FKey, value: key } }),
      note: 'Cột xanh = đã nhập kho, cột cam = chưa nhập kho (tháng hạn: KH nhập kho tuần → tháng; không có KH => Chưa có KH nhập kho).',
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
      ct: uniq(r => r.ct), pm: uniq(r => r.pm), kv: uniq(r => r.kv), nct: uniq(r => r.nct), tda: uniq(r => r.tda),
      month: [...new Set(allRecords.map(r => r.month))].sort((a, b) => (a === NO_MONTH ? 1 : b === NO_MONTH ? -1 : b.localeCompare(a))), // mới nhất trước
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
  const Kpi = ({ label, value, unit, tone = 'text-slate-900', sub, spec, hint }: {
    label: string; value: string; unit?: string; tone?: string; sub?: string; spec: Omit<DetailSpec, 'eyebrow' | 'title'>;
    /** Giải thích cách tính (rê chuột) */
    hint?: string;
  }) => (
    <button
      type="button"
      onClick={() => openDetail({ eyebrow: 'Chỉ số', title: label, ...spec })}
      title={hint ? `${hint}\nBấm để xem chi tiết` : 'Bấm để xem chi tiết'}
      className={`${cardCls} group px-4 py-3 text-left transition hover:border-slate-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400`}
    >
      <p className="flex items-center justify-between text-[0.6875rem] font-medium tracking-wide text-slate-500">
        {label}
        <ChevronRight size={13} className="text-slate-300 group-hover:text-slate-600" />
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>
        {value}{unit && <span className="ml-1 text-sm font-medium text-slate-400">{unit}</span>}
      </p>
      {sub && <p className="mt-0.5 text-[0.6875rem] text-slate-500">{sub}</p>}
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
            {/* Nhóm CT (vd. "CỤM TÂY HỒ VIEW", "OUT TOP 33 CT") và tình trạng dự án — cột có từ 10/2026 */}
            {options.nct.length > 1 && (
              <SearchableSelect
                value={f.nct ?? ''}
                onChange={v => setKey('nct', v)}
                options={options.nct.map(o => ({ code: o, name: o }))}
                allLabel="Nhóm CT: Tất cả"
                widthClass="w-44"
                className="text-sm [&>button]:h-9 [&>button]:rounded-lg [&>button]:px-2.5"
              />
            )}
            {options.tda.length > 1 && (
              <SearchableSelect
                value={f.tda ?? ''}
                onChange={v => setKey('tda', v)}
                options={options.tda.map(o => ({ code: o, name: o }))}
                allLabel="Dự án: Tất cả"
                widthClass="w-40"
                className="text-sm [&>button]:h-9 [&>button]:rounded-lg [&>button]:px-2.5"
              />
            )}
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
        {/* 1280–1535px: 2 hàng × 5 ô (10 ô một hàng chỉ rộng ~100px, số bị cắt) */}
        <div className="grid grid-cols-2 md:grid-cols-5 2xl:grid-cols-10 gap-3">
          {/* Mỗi ô: pred = đúng điều kiện đã dùng để tính con số trong khối KPI ở trên */}
          <Kpi label="Công trình" value={fmtInt(kpi.cts)}
               spec={{ pred: () => true, focus: 'total', note: 'Mọi hạng mục của các công trình (đếm công trình theo tên chuẩn — gộp các cách viết của cùng công trình).' }} />
          <Kpi label="Tổng số mục" value={fmtInt(kpi.items)}
               spec={{ pred: () => true, focus: 'items', note: 'Mọi hạng mục, kể cả đơn hủy.' }} />
          <Kpi label="Hủy" value={fmtInt(kpi.cancelled)} tone="text-red-600"
               spec={{ pred: r => r.status === 'HỦY', focus: 'items', note: 'Hạng mục có Tình trạng IPO = HỦY (trị giá vẫn tính vào Tổng giá trị — lọc Tình trạng IPO để bỏ).' }} />
          <Kpi label="Hạng mục đã nhập kho" value={fmtInt(kpi.stocked)} tone="text-emerald-600"
               spec={{ pred: r => isStocked(r), focus: 'items', note: 'Hạng mục đã nhập kho đủ trị giá hoặc đủ số lượng đơn hàng (không tính đơn hủy).' }} />
          <Kpi label="Hạng mục chưa nhập kho" value={fmtInt(kpi.notStocked)} tone="text-amber-600"
               sub={kpi.partial > 0 ? `trong đó ${fmtInt(kpi.partial)} nhập một phần` : undefined}
               spec={{ pred: r => r.status !== 'HỦY' && !isStocked(r), focus: 'items', note: 'Hạng mục chưa nhập kho hoặc mới nhập một phần (không tính đơn hủy).' }} />
          <Kpi label="Tổng giá trị" value={fmtTy(kpi.total)} unit="Tỷ"
               spec={{ pred: () => true, focus: 'total', note: 'Tổng trị giá đơn hàng, gồm cả đơn hủy (khớp file gốc) — lọc Tình trạng IPO để bỏ hủy.' }} />
          <Kpi label="Giá trị đã nhập kho" value={fmtTy(kpi.done)} unit="Tỷ" tone="text-emerald-600"
               spec={{ pred: r => r.done > 0, focus: 'done', note: 'Giá trị đã nhập kho lũy kế (tối đa bằng trị giá đơn hàng).' }} />
          <Kpi label="Giá trị chưa nhập kho" value={fmtTy(kpi.remain)} unit="Tỷ" tone="text-amber-600"
               spec={{ pred: r => r.total - r.done > 0, focus: 'remain', note: 'Trị giá đơn hàng trừ giá trị đã nhập kho (gồm cả trị giá đơn hủy — lọc Tình trạng IPO để bỏ).' }} />
          <Kpi label="Đã xuất / giao" value={fmtTy(kpi.exported)} unit="Tỷ" tone="text-sky-700"
               hint={`= Đã nhập kho − Tồn kho (theo từng hạng mục). Bảng xuất kho ghi ${fmtTy(kpi.exportedRecorded)} tỷ nhưng chỉ có dữ liệu từ 01/2025 — hạng mục giao trước đó không có số xuất.`}
               spec={{ pred: r => r.exported > 0, focus: 'exported', note: 'Đã xuất / giao = giá trị đã nhập kho − tồn kho hiện tại, theo từng hạng mục (không lấy bảng xuất kho vì bảng chỉ có từ 01/2025).' }} />
          <Kpi label="Tồn kho" value={fmtTy(kpi.stock)} unit="Tỷ" tone="text-violet-700"
               hint={kpi.stockOverItems > 0
                 ? `Tồn kho hiện tại (khớp bảng tồn kho). ${fmtInt(kpi.stockOverItems)} hạng mục có tồn kho tính theo đơn giá cao hơn giá trị đã nhập (lệch ${fmtTy(kpi.stockOver)} tỷ) nên Đã nhập ≈ Đã xuất / giao + Tồn kho.`
                 : 'Tồn kho hiện tại (khớp bảng tồn kho). Đã nhập = Đã xuất / giao + Tồn kho.'}
               spec={{ pred: r => r.stock > 0, focus: 'stock', note: 'Giá trị tồn kho hiện tại của các hạng mục (thành tiền tồn kho hiện tại theo bảng sản xuất — khớp bảng tồn kho).' }} />
        </div>

        {/* Cảnh báo: hạng mục còn theo dõi (chưa nhập đủ, không hủy) theo hạn / KH / BOT dự án + vướng mắc đang mở */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Quá hạn KH nhập kho" value={fmtInt(kpi.overdue)} unit="mục" tone={kpi.overdue ? 'text-red-600' : 'text-slate-900'}
               sub={`${fmtTy(kpi.overdueRemain)} tỷ chưa nhập kho`}
               hint="Hạng mục chưa nhập kho đủ đã qua KH nhập kho tuần / tháng (KH kỳ đã nhập đủ SL thì không tính)"
               spec={{ pred: r => r.open && r.overdue, focus: 'remain', note: 'Hạng mục chưa nhập kho đủ (giá trị / số lượng), đã qua KH nhập kho tuần → tháng.' }} />
          <Kpi label="Chưa có KH nhập kho" value={fmtInt(kpi.noPlan)} unit="mục" tone={kpi.noPlan ? 'text-amber-600' : 'text-slate-900'}
               sub={`${fmtTy(kpi.noPlanRemain)} tỷ chưa nhập kho`}
               hint="Hạng mục chưa nhập kho đủ mà không có KH nhập kho tuần / tháng — không theo dõi được quá hạn"
               spec={{ pred: r => r.open && !r.deadline, focus: 'remain', note: 'Hạng mục chưa nhập kho đủ, không có KH nhập kho tuần / tháng (chưa lập BOT).' }} />
          <Kpi label="Qua BOT dự án chưa xong" value={fmtInt(kpi.pastBot)} unit="mục" tone={kpi.pastBot ? 'text-red-600' : 'text-slate-900'}
               sub={`${fmtTy(kpi.pastBotRemain)} tỷ chưa nhập kho`}
               hint="Hạng mục chưa nhập kho đủ đã qua BOT dự án (hạn chung của công trình — tham khảo, không tính hạn từng hạng mục)"
               spec={{ pred: r => r.open && !!r.botDuAn && r.botDuAn.getTime() < today, focus: 'remain', note: 'Hạng mục chưa nhập kho đủ đã qua BOT dự án (tham khảo).' }} />
          <a
            href="#/vuong-mac"
            title="Vướng mắc chưa xử lý xong của các công trình trong danh sách — bấm để mở màn quản lý vướng mắc"
            className={`${cardCls} group px-4 py-3 text-left transition hover:border-slate-400 hover:shadow-md`}
          >
            <p className="flex items-center justify-between text-[0.6875rem] font-medium tracking-wide text-slate-500">
              Vướng mắc đang mở <AlertTriangle size={13} className={vmTotal ? 'text-red-500' : 'text-slate-300'} />
            </p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${vmTotal ? 'text-red-600' : 'text-slate-900'}`}>
              {vmRows === null ? '…' : fmtInt(vmTotal)}<span className="ml-1 text-sm font-medium text-slate-400">vướng mắc</span>
            </p>
            <p className="mt-0.5 text-[0.6875rem] text-slate-400">
              {vmRows === null ? 'Đang tải' : `${fmtInt(ctTable.filter(r => r.vm.open > 0).length)} công trình · ${fmtInt(ctTable.reduce((s, r) => s + r.vm.overdue, 0))} quá hạn BOT`}
            </p>
          </a>
        </div>

        {/* 1280–1535px: trái 4 / giữa 8, thẻ Nhóm đơn hàng xuống hàng dưới (bảng công trình 9 cột cần ≥ 800px);
            từ 1536px: 3 / 6 / 3 */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Cột trái: biểu đồ theo tháng + bảng theo PC */}
          <div className="xl:col-span-4 2xl:col-span-3 space-y-4">
            <div className={`${cardCls} p-4`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="text-xs font-semibold text-slate-700">Giá trị theo tháng hạn (Tỷ) <span className="font-normal text-slate-500">· KH nhập kho tuần → tháng</span></p>
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
                  Chưa có KH nhập kho (không vẽ):{' '}
                  <span className="tabular-nums" style={{ color: COLOR_DONE }}>{formatTy(noMonthBucket.done)}</span>
                  {' · '}
                  <span className="tabular-nums" style={{ color: COLOR_REMAIN }}>{formatTy(noMonthBucket.remain)}</span> tỷ
                </button>
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

            <div className={`${cardCls} overflow-hidden`}>
              <p className="text-xs font-semibold text-slate-700 px-4 pt-3 pb-2">Theo người phụ trách (PC)</p>
              <div className="max-h-[340px] overflow-auto custom-scrollbar">
                <table className="w-full table-fixed text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-right font-medium pl-4 pr-2 py-2 w-10">STT</th>
                      <th className="text-left font-medium px-2 py-2">Tên PC</th>
                      <th className="text-right font-medium px-2 py-2 w-10">CT</th>
                      <th className="text-right font-medium px-2 py-2 w-14">Mục</th>
                      <th className="text-right font-medium px-3 py-2 w-[4.5rem]" title="Tổng giá trị (tỷ)">GT (Tỷ)</th>
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
          <div className={`xl:col-span-8 2xl:col-span-6 ${cardCls} overflow-hidden flex flex-col`}>
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
                    <th className="text-left font-medium px-2 py-2 w-24">Hoàn thành</th>
                    <th className="text-left font-medium px-2 py-2" title="BOT dự án — hạn chung của công trình (tham khảo); đỏ = đã qua mà còn hạng mục chưa xong">BOT DA</th>
                    <th className="text-right font-medium px-2 py-2" title="Hạng mục chưa nhập kho đủ đã qua KH nhập kho tuần / tháng">Quá hạn</th>
                    <th className="text-right font-medium pl-2 pr-4 py-2" title="Vướng mắc chưa xử lý xong (theo mã công trình)">VM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ctTable.map((r, idx) => {
                    const pct = r.total > 0 ? Math.min(100, (r.done / r.total) * 100) : 0;
                    const pms = [...r.pms];
                    const botLeft = r.botDuAn ? Math.floor((r.botDuAn.getTime() - today) / 86_400_000) : null;
                    return (
                      <tr key={r.name} onClick={() => setHealth({ ct: r.name, inDetail: false })}
                          title="Bấm để xem tổng quan công trình (BOT · BOP · BOM)"
                          className={`group cursor-pointer hover:bg-slate-50 ${f.ct === r.name ? 'bg-slate-100 font-semibold' : ''}`}>
                        <td className="pl-4 pr-2 py-1.5 text-right tabular-nums text-slate-400">{idx + 1}</td>
                        <td className="px-2 py-1.5 text-slate-800 min-w-[200px]">
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
                        <td className="max-w-[120px] truncate px-2 py-1.5 text-slate-600 whitespace-nowrap" title={pms.join(', ')}>
                          {pms[0]}{pms.length > 1 ? ` +${pms.length - 1}` : ''}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(r.items)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtTy(r.total)}</td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-9 text-right tabular-nums text-slate-500">{pct.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className={`px-2 py-1.5 whitespace-nowrap tabular-nums ${!r.botDuAn ? 'text-slate-300' : r.open === 0 ? 'text-emerald-600' : botLeft! < 0 ? 'font-semibold text-red-600' : botLeft! <= 30 ? 'text-amber-600' : 'text-slate-500'}`}
                            title={r.botDuAn ? (r.open === 0 ? 'Đã nhập kho đủ' : botLeft! < 0 ? `Quá BOT dự án ${-botLeft!} ngày · còn ${fmtInt(r.open)} hạng mục` : `Còn ${botLeft} ngày · ${fmtInt(r.open)} hạng mục chưa xong`) : 'Chưa có BOT dự án'}>
                          {r.botDuAn ? r.botDuAn.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                        </td>
                        <td className={`px-2 py-1.5 text-right tabular-nums ${r.overdue ? 'font-semibold text-red-600' : 'text-slate-300'}`}>{r.overdue || '—'}</td>
                        <td className={`pl-2 pr-4 py-1.5 text-right tabular-nums ${r.vm.open ? 'font-semibold text-red-600' : 'text-slate-300'}`}
                            title={r.vm.open ? `${r.vm.open} vướng mắc đang mở · ${r.vm.overdue} quá hạn BOT` : undefined}>
                          {vmRows === null ? '…' : r.vm.open || '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {ctTable.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Không có công trình phù hợp</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cột phải: thẻ "Cơ cấu đơn hàng" dùng chung với Tổng quan / Luồng đỏ / Căn mẫu */}
          <div className="xl:col-span-12 2xl:col-span-3 flex flex-col">
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
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 px-5 py-4">
              <PcStat label="Công trình" value={fmtInt(detailData.cts)} />
              <PcStat label="Hạng mục" value={fmtInt(detailData.items)} active={detail.focus === 'items'} />
              <PcStat label="Tổng giá trị" value={fmtTy(detailData.total)} unit="Tỷ" active={detail.focus === 'total'} />
              <PcStat
                label="Đã nhập kho" value={fmtTy(detailData.done)} unit="Tỷ" tone="text-emerald-600"
                active={detail.focus === 'done'}
                sub={`${(detailData.total > 0 ? (detailData.done / detailData.total) * 100 : 0).toFixed(1)}% tổng giá trị`}
              />
              <PcStat label="Chưa nhập kho" value={fmtTy(detailData.remain)} unit="Tỷ" tone="text-amber-600" active={detail.focus === 'remain'} />
              <PcStat label="Đã xuất / giao" value={fmtTy(detailData.exported)} unit="Tỷ" tone="text-sky-700" active={detail.focus === 'exported'} />
              <PcStat label="Tồn kho" value={fmtTy(detailData.stock)} unit="Tỷ" tone="text-violet-700" active={detail.focus === 'stock'} />
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
        escEnabled={hexScope === null}
        onOpenHexList={() => health && setHexScope({ ct: health.ct, inDetail: health.inDetail })}
        inventory={inventory}
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