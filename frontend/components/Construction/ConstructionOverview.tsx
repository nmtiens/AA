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
import { projectMatchKey, laIpoMacDinh, tyLeHoanThanh } from '../../utils/productionMetrics';
import type { RemainBucket } from '../Dashboard/core/stages';
import { recDaNhapDu } from './core/chiSoCongTrinh';
import { tomTatChiTiet, giaTriTieuDiem, type TieuDiem } from './core/tongChiTiet';
import { khung as khungB, soBam as GACH, table as bangB, tdB, tdSo as soB, tfoot as tfootB, thC as thB, thead as theadB, trong0 } from '../shared/bangBaoCao';
import { taoBanGhi, NO_MONTH, type Rec } from './core/banGhiCongTrinh';
import { useToast } from '../../context/ToastContext';
import { CONFIGURABLE_VIEWS, getProjectsForView, type ProjectGroupId } from './utils/viewDataConfig';
import { useThuTuLuongDo } from './useThuTuLuongDo';
import { mauLuong, soSanhThuTu, sttHienThi } from './core/thuTuNhom';
import { fetchVuongMacByProject, type VmByProjectRow } from '../../services/vuongMacService';
import SearchableSelect from '../Dashboard/components/Dashboards/SearchableSelect';
import { HexDetailModal, type HexDetailColumnKeys } from '../Dashboard/components/modals/HexDetailModal';
import { hexColumnKeysOf } from '../Dashboard/components/Dashboards/DanhSachHex';
import { ProjectHealthModal, dungHangMucCongTrinh, type ProjectHealthKeys } from './ProjectHealthModal';
import { BopTab } from './ProjectHealthTabs';
import { BotKhnk } from './BotKhnk';
import { BomTatCa, taiTruocBomTatCa } from './BopM2Section';
import { BaoCaoBot } from './BaoCaoBot';
import { maIpo } from './core/baoCaoBot';
import { HexTimelineModal } from './HexTimelineModal';
import { OrderMixCard, OTHERS, TOP_CUSTOMERS, groupTopN, aggregateMix, orderMix } from '../Dashboard/components/shared/ProductionDonutPanel';
import { formatTy, formatTrieuAsTy } from '../../utils/money';
import { fmtInt, fmtPt } from '../../utils/format';
import { API_BASE_URL } from '../../services/dataService';
// ============================================================
// Báo cáo tiến độ công trình — dựng hoàn toàn từ productionData (không cần API mới)
// Đơn vị tiền gốc là TRIỆU ĐỒNG (xem utils/money.ts)  =>  Tỷ = giá trị gốc / 1,000
// ============================================================

type FKey = 'ct' | 'pm' | 'pc' | 'kv' | 'kh' | 'pl' | 'month' | 'nct' | 'tda';
type Filters = Partial<Record<FKey, string | undefined>>;

// Mặc định không lọc Tình trạng IPO: các ô KPI hiện tổng toàn bộ công trình, chỉ đổi khi người dùng chọn lọc
// Mặc định chỉ xem hạng mục ĐANG SẢN XUẤT (khớp bộ lọc mặc định ở trang Tổng quan); chọn lại được ở bộ lọc
const isDefaultIpo = laIpoMacDinh;

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
const pctOf = (v: number, total: number) => (total > 0 ? fmtPt((v / total) * 100) : '—');
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

// Cột số của bảng trong cửa sổ chi tiết: cùng tên với các ô phía trên
const COT_CHI_TIET: { k: DetailFocus; t: string }[] = [
  { k: 'items', t: 'Hạng mục' }, { k: 'total', t: 'Tổng giá trị (Tỷ)' }, { k: 'done', t: 'Đã nhập kho (Tỷ)' }, { k: 'remain', t: 'Chưa nhập kho (Tỷ)' },
  { k: 'exported', t: 'Đã xuất / giao (Tỷ)' }, { k: 'stock', t: 'Tồn theo đơn đang xem (Tỷ)' }, { k: 'unmatched', t: 'Chênh (Tỷ)' }, { k: 'xuatVuot', t: 'Xuất vượt nhập (Tỷ)' },
];

// Mô tả 1 cửa sổ chi tiết (cấp 1)
type DetailFocus = TieuDiem;
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
  // Nhóm công trình (Luồng đỏ / Căn mẫu = danh sách setup ở Công trình → Setup); null = mọi công trình
  const [group, setGroup] = useState<ProjectGroupId | null>(null);
  // Nút "KHSX tháng này": chỉ công trình có trong kế hoạch sản xuất của tháng hiện tại (KH tháng; chưa có thì KH tuần)
  const [locKhsx, setLocKhsx] = useState(false);
  const [khsxCt, setKhsxCt] = useState<{ thang: number; nam: number; loai: string | null; capNhat: string | null; hex: string[]; congTrinh: { name: string; codes: string[] }[] } | null>(null);
  const [khsxLoi, setKhsxLoi] = useState(false);
  useEffect(() => {
    if (!locKhsx || khsxCt) return;
    const d = new Date();
    const ac = new AbortController();
    setKhsxLoi(false);
    fetch(`${API_BASE_URL}/khsx/cong-trinh?nam=${d.getFullYear()}&thang=${d.getMonth() + 1}`, { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setKhsxCt)
      .catch(() => { if (!ac.signal.aborted) setKhsxLoi(true); });
    return () => ac.abort();
  }, [locKhsx, khsxCt]);
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
  // View cho TẤT CẢ công trình đang xem (cùng bộ lọc trang): tổng quan / BOP / BOT / BOM (như tab trong cửa sổ 1 công trình)
  const [viewCT, setViewCT] = useState<'tong' | 'bop' | 'bot' | 'bom' | 'bcbot'>('tong');
  const [hexXem, setHexXem] = useState<string | null>(null);
  const healthCt = health?.ct ?? null;
  const [f, setF] = useState<Filters>({});
  // null = chưa chọn gì => dùng mặc định (Đang sản xuất) khi đã có dữ liệu
  const [ipoPicked, setIpoSel] = useState<string[] | null>(null);
  const [metric, setMetric] = useState<'count' | 'value'>('value'); // cho 3 biểu đồ tròn
  const [ctSearch, setCtSearch] = useState('');

  const toggle = (k: FKey, v: string) => setF(p => ({ ...p, [k]: p[k] === v ? undefined : v }));
  const setKey = (k: FKey, v: string) => setF(p => ({ ...p, [k]: v || undefined }));
  const activeKeys = (Object.keys(f) as FKey[]).filter(k => f[k]);

  // Đã nhập kho đủ trị giá đơn hàng HOẶC đủ số lượng (dùng chung cho ô KPI và popup chi tiết)

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
    if (locKhsx) {
      if (!khsxCt) return [];
      // Đúng các HEX có trong KH của tháng (không lấy cả công trình — công trình còn nhiều hạng mục ngoài KH)
      const hex = new Set(khsxCt.hex);
      return allRecords.filter(r => hex.has(String(r.row?.['hex'] ?? '').trim()));
    }
    if (!group) return allRecords;
    const allowed = new Set(getProjectsForView(group).map(projectMatchKey));
    return allRecords.filter(r => allowed.has(r.mk));
  }, [allRecords, group, locKhsx, khsxCt]);
  const groupSize = useMemo(() => (group ? getProjectsForView(group).length : 0), [group]);

  const ipoOptions = useMemo(
    () => [...new Set(groupRecords.map(r => r.ipo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')),
    [groupRecords]
  );
  const ipoSel = useMemo(() => ipoPicked ?? ipoOptions.filter(isDefaultIpo), [ipoPicked, ipoOptions]);
  // Tab BÁO CÁO BOT lấy số từ file công trình: ô "Tình Trạng IPO" có thêm các IPO chỉ có trong file (vd. 03. TẠM NGƯNG)
  const [ipoBot, setIpoBot] = useState<string[]>([]);
  const ipoOptionsHien = useMemo(() => {
    if (viewCT !== 'bcbot') return ipoOptions;
    const ma = new Set(ipoOptions.map(maIpo));
    return [...ipoOptions, ...ipoBot.filter(x => !ma.has(maIpo(x)))].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [viewCT, ipoOptions, ipoBot]);
  const laBcBot = viewCT === 'bcbot';   // BÁO CÁO BOT không theo các bộ lọc khác của trang => ẩn cho gọn
  const records = useMemo(() => {
    if (ipoSel.length === 0) return groupRecords;
    const set = new Set(ipoSel);
    return groupRecords.filter(r => set.has(r.ipo));
  }, [groupRecords, ipoSel]);

  // Lọc chéo: mỗi biểu đồ bỏ qua bộ lọc của chính nó để vẫn đổi được lựa chọn
  const apply = (exclude?: FKey) =>
    records.filter(r => activeKeys.every(k => k === exclude || r[k] === f[k]));

  const rowsAll = useMemo(() => apply(), [records, f]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- 2. KPI ----------
  // Hạng mục "đã nhập kho" = đã nhập kho ĐỦ trị giá đơn hàng (cùng nguồn với giá trị đã nhập kho);
  // còn lại (chưa nhập hoặc mới nhập 1 phần) là "chưa nhập kho". Đơn HỦY tính riêng.
  const kpi = useMemo(() => {
    const cts = new Set<string>();
    let cancelled = 0, stocked = 0, notStocked = 0, partial = 0, total = 0, totalHuy = 0, done = 0, exported = 0, xuatVuot = 0, stock = 0, exportedRecorded = 0, unmatched = 0;
    // Giá trị đã nhập kho tách theo hạng mục nhập đủ / nhập một phần (cộng lại = done, trừ phần của đơn hủy)
    let stockedDone = 0, partialDone = 0;
    let stockOver = 0, stockOverItems = 0; // hạng mục tồn kho vượt giá trị đã nhập (tồn bị chặn ≤ đã nhập)
    let stockHuy = 0; // tồn kho của đơn HỦY: tồn kho vẫn gồm hàng HỦY còn trong kho
    // Phần chưa nhập kho theo công đoạn — cộng lại đúng bằng Giá trị chưa nhập kho
    const remainBy: Record<RemainBucket | 'cancelled', number> = { notDeployed: 0, p002: 0, onLine: 0, shortfall: 0, cancelled: 0 };
    for (const r of rowsAll) {
      cts.add(r.ctKey);
      remainBy[r.bucket] += Math.max(r.total - r.done, 0);
      if (r.status === 'HỦY') { cancelled++; stockHuy += r.stock; totalHuy += r.totalHuy; }
      else if (recDaNhapDu(r)) { stocked++; stockedDone += r.done; }
      else { notStocked++; if (r.done > 0) { partial++; partialDone += r.done; } }
      total += r.total; done += r.done; exported += r.exported; xuatVuot += r.xuatVuot; stock += r.stock; exportedRecorded += r.exportedRecorded; unmatched += r.unmatched;
      if (r.stockCut > 0.001) { stockOver += r.stockCut; stockOverItems++; }
    }
    // Cảnh báo: quá hạn KH nhập kho / chưa có KH / qua BOT dự án (hạng mục còn theo dõi)
    let overdue = 0, overdueRemain = 0, noPlan = 0, noPlanRemain = 0, metWait = 0, metWaitRemain = 0, pastBot = 0, pastBotRemain = 0;
    for (const r of rowsAll) {
      if (!r.open) continue;
      const rem = r.total - r.done;
      if (r.overdue) { overdue++; overdueRemain += rem; }
      if (r.planMet) { metWait++; metWaitRemain += rem; }
      else if (!r.deadline) { noPlan++; noPlanRemain += rem; }
      if (r.botDuAn && r.botDuAn.getTime() < today) { pastBot++; pastBotRemain += rem; }
    }
    return {
      cts: cts.size, items: rowsAll.length - cancelled, cancelled, stocked, notStocked, partial, stockedDone, partialDone, total, totalHuy, done, remain: total - done,
      exported, xuatVuot, stock, stockHuy, exportedRecorded, unmatched, stockOver, stockOverItems, remainBy,
      overdue, overdueRemain, noPlan, noPlanRemain, metWait, metWaitRemain, pastBot, pastBotRemain,
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
  // Cột gộp "Trước …" / "Sau …" (không vẽ) — hiện thành dòng bấm được khi có số
  const outBuckets = useMemo(() => monthData.filter(d => d.key !== NO_MONTH && chartMonthOrder(d.key) % 2 === 0 && d.done + d.remain > 0.0005), [monthData]);

  // ---------- 4. Biểu đồ tròn ----------
  const donut = (k: 'kv' | 'kh' | 'pl') => aggregateMix(apply(k).filter(r => r.status !== 'HỦY'), r => r[k], r => r.ctKey, r => r.total, metric);
  const kvData = useMemo(() => orderMix(donut('kv')), [records, f, metric]);       // eslint-disable-line react-hooks/exhaustive-deps
  const khData = useMemo(() => orderMix(groupTopN(donut('kh'), TOP_CUSTOMERS, f.kh ? [f.kh] : [])), [records, f, metric]); // eslint-disable-line react-hooks/exhaustive-deps
  const plData = useMemo(() => orderMix(donut('pl')), [records, f, metric]);       // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- 5. Bảng theo PC và theo công trình ----------
  const pcTable = useMemo(() => {
    const m = new Map<string, { name: string; cts: Set<string>; items: number; total: number }>();
    for (const r of apply('pc')) {
      const e = m.get(r.pc) ?? { name: r.pc, cts: new Set<string>(), items: 0, total: 0 };
      e.cts.add(r.ctKey); if (r.status !== 'HỦY') e.items++; e.total += r.total;
      m.set(r.pc, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total || b.items - a.items);
  }, [records, f]); // eslint-disable-line react-hooks/exhaustive-deps

  // % Hoàn thành của 1 công trình: mọi Tình trạng IPO trừ HỦY, không theo bộ lọc IPO (bản ghi HỦY có total = done = 0)
  const hoanThanhCt = useMemo(() => {
    const m = new Map<string, { total: number; done: number }>();
    for (const r of groupRecords) {
      if (!activeKeys.every(k => k === 'ct' || r[k] === f[k])) continue;
      const e = m.get(r.ct) ?? { total: 0, done: 0 };
      e.total += r.total; e.done += r.done;
      m.set(r.ct, e);
    }
    return m;
  }, [groupRecords, f]); // eslint-disable-line react-hooks/exhaustive-deps
  const pctHoanThanh = (ct: string) => { const e = hoanThanhCt.get(ct); return e ? tyLeHoanThanh(e.total, e.done) : 0; };

  // Danh sách Luồng đỏ (Setup → Nhóm công trình): công trình trong luồng lên đầu theo STT, tô đỏ / vàng
  const thuTuNhom = useThuTuLuongDo();
  const ctTable = useMemo(() => {
    const q = ctSearch.trim().toLowerCase();
    type Row = { name: string; ctKey: string; pms: Set<string>; mas: Set<string>; items: number; total: number; cancelled: number; done: number; open: number; overdue: number; botDates: string[] };
    const m = new Map<string, Row>();
    for (const r of apply('ct')) {
      if (q && !r.ct.toLowerCase().includes(q)) continue;
      const e = m.get(r.ct) ?? { name: r.ct, ctKey: r.ctKey, pms: new Set<string>(), mas: new Set<string>(), items: 0, total: 0, cancelled: 0, done: 0, open: 0, overdue: 0, botDates: [] };
      e.pms.add(r.pm); if (r.ma) e.mas.add(r.ma); e.total += r.total; e.done += r.done;
      // Đơn hủy = 0 trong Tổng GT, số hủy ghi riêng trên bảng
      if (r.status === 'HỦY') e.cancelled += r.totalHuy; else e.items++;
      if (r.open) e.open++; if (r.overdue) e.overdue++;
      // Khoá ngày giờ địa phương (toISOString lùi 1 ngày ở +7)
      // Bỏ đơn HỦY khi gom BOT dự án (khớp ProjectHealthModal)
      if (r.botDuAn && r.status !== 'HỦY') e.botDates.push(`${r.botDuAn.getFullYear()}-${String(r.botDuAn.getMonth() + 1).padStart(2, '0')}-${String(r.botDuAn.getDate()).padStart(2, '0')}`);
      m.set(r.ct, e);
    }
    return [...m.values()].map(e => {
      // BOT dự án: 1 ngày chung cho cả công trình (lấy ngày xuất hiện nhiều nhất)
      const cnt = new Map<string, number>();
      e.botDates.forEach(d => cnt.set(d, (cnt.get(d) ?? 0) + 1));
      let best = '', n = -1; cnt.forEach((c, d) => { if (c > n) { best = d; n = c; } });
      const botDuAn = best ? new Date(Number(best.slice(0, 4)), Number(best.slice(5, 7)) - 1, Number(best.slice(8, 10))) : null;
      return { ...e, botDuAn, vm: vmOf(e.mas, e.ctKey), thuTu: thuTuNhom(e.name) };
    }).sort((a, b) => soSanhThuTu(a.thuTu, b.thuTu) || b.total - a.total || b.items - a.items);
  }, [records, f, ctSearch, vmIndex, thuTuNhom]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctStt = useMemo(() => sttHienThi(ctTable.map(r => r.thuTu)), [ctTable]);
  // Dòng TỔNG bảng công trình: cộng các dòng đang hiện; % hoàn thành mọi IPO trừ HỦY như từng dòng;
  // vướng mắc mỗi mã chỉ cộng 1 lần như ô "Vướng mắc đang mở"
  const ctTong = useMemo(() => {
    const s = { items: 0, total: 0, cancelled: 0, done: 0, overdue: 0, vm: 0 };
    let htTotal = 0, htDone = 0;
    const seenMa = new Set<string>(), seenName = new Set<string>();
    for (const r of ctTable) {
      s.items += r.items; s.total += r.total; s.cancelled += r.cancelled; s.done += r.done; s.overdue += r.overdue;
      htTotal += hoanThanhCt.get(r.name)?.total ?? 0; htDone += hoanThanhCt.get(r.name)?.done ?? 0;
      let hit = false;
      r.mas.forEach(ma => {
        const v = vmIndex.byMa.get(ma);
        if (!v) return;
        hit = true;
        if (seenMa.has(ma)) return;
        seenMa.add(ma); s.vm += v.open;
      });
      if (!hit && !seenName.has(r.ctKey)) {
        seenName.add(r.ctKey);
        s.vm += vmIndex.byName.get(r.ctKey)?.open ?? 0;
      }
    }
    return { ...s, pct: tyLeHoanThanh(htTotal, htDone) };
  }, [ctTable, vmIndex, hoanThanhCt]);
  // Phạm vi bảng có đơn hủy => cột Tổng GT ghi riêng số hủy
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
    const t = tomTatChiTiet(detailRows, detail.focus);
    return { ...t, remain: t.total - t.done };
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
  // Dòng không hủy của công trình, mọi Tình trạng IPO — phần Kho (lũy kế) của bảng BOP
  const healthKhoRows = useMemo(
    () => (health ? allRecords.filter(r => r.ct === health.ct && r.status !== 'HỦY').map(r => r.row) : []),
    [health, allRecords]
  );
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
      xuatKhoKey: key('thanh_tien_xuat_kho_luy_ke', 'thanh_tien_xuat_kho_luy_ke'),
      tonKhoKey: key('thanh_tien_ton_kho_hien_tai', 'thanh_tien_ton_kho_hien_tai'),
      khnkTuanKey: findColumnKey(columns, 'ngay_khnk_tuan') || 'ngay_khnk_tuan',
      khnkThangKey: findColumnKey(columns, 'ngay_khnk_thang') || 'ngay_khnk_thang',
      ngayCanGiaoKey: findColumnKey(columns, 'ngay_can_giao') || 'ngay_can_giao',
      ngayCanKey: columns.find(c => c.key === 'ngay_can')?.key ?? 'ngay_can',
      botDuAnKey: findColumnKey(columns, 'bot_du_an') || 'bot_du_an',
      xuongKey: key(TARGET_COLUMN_NAMES.XUONG, 'xuong_chinh'),
      nhomSpKey: key(TARGET_COLUMN_NAMES.PHAN_LOAI_NHOM_SAN_PHAM, 'phan_loai_nhom_san_pham'),
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

  // View BOP / BOT / BOM cho tất cả công trình: hạng mục theo mọi bộ lọc trang (như bảng công trình);
  // bảng BOP lấy cả phần Kho từ chính các hạng mục này, cùng số với bảng công trình ở trang Tổng quan
  const homNay = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);
  // Gắn tên công trình (tên chuẩn của trang) vào từng hạng mục => bảng chi tiết có cột Công trình
  const ganCt = (recs: Rec[]) => {
    const ctTheoHex = new Map(recs.map(r => [String(r.row[healthKeys.hexKey] ?? ''), r.ct]));
    return dungHangMucCongTrinh(recs.map(r => r.row), healthKeys, homNay).map(i => ({ ...i, congTrinh: ctTheoHex.get(i.hex) ?? '' }));
  };
  const hangMucTatCa = useMemo(
    () => (viewCT === 'bop' || viewCT === 'bot' ? ganCt(rowsAll) : []),
    [viewCT, rowsAll, healthKeys, homNay] // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Báo cáo điều phối KH tháng – tuần (tab BOT): mọi bộ lọc trang TRỪ Tình trạng IPO (cần cả hạng mục đã hoàn thành)
  const dieuPhoiTatCa = useMemo(
    () => (viewCT === 'bot' ? ganCt(groupRecords.filter(r => r.status !== 'HỦY' && activeKeys.every(k => r[k] === f[k]))) : []),
    [viewCT, groupRecords, f, healthKeys, homNay] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const tenCtTatCa = useMemo(() => [...new Set(rowsAll.map(r => r.ct))], [rowsAll]);
  // Tải sẵn BOM (BOP-M2) của các công trình đang xem khi trang rảnh => bấm tab BOM có số ngay
  useEffect(() => {
    if (!tenCtTatCa.length) return;
    const t = setTimeout(() => { taiTruocBomTatCa(tenCtTatCa)?.catch(() => { /* lỗi: tab BOM tự tải lại và báo */ }); }, 1500);
    return () => clearTimeout(t);
  }, [tenCtTatCa]);
  const tenHexXem = useMemo(() => {
    if (!hexXem) return undefined;
    const r = allRecords.find(x => String(x.row[healthKeys.hexKey] ?? '') === hexXem);
    return r ? { project: r.ct, pm: r.pm, pc: String(r.row['ten_pc'] ?? '') } : undefined;
  }, [hexXem, allRecords, healthKeys.hexKey]);

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

  // Ô giá trị trong thanh "Giá trị": bấm mở cửa sổ chi tiết đúng tập dòng tạo ra con số
  const Mini = ({ label, value, tone, bar, hint, spec, strong = false }: {
    label: string; value: number; tone: string; bar?: string; hint?: string; strong?: boolean;
    spec: Omit<DetailSpec, 'eyebrow' | 'title'>;
  }) => (
    <button
      type="button"
      onClick={() => openDetail({ eyebrow: 'Chỉ số', title: label, ...spec })}
      title={hint ? `${hint}\nBấm để xem chi tiết` : 'Bấm để xem chi tiết'}
      className={`group w-full rounded-md px-2 py-1.5 text-left transition hover:bg-white hover:shadow-sm ${strong ? '' : 'border border-slate-200 bg-white/70'}`}
    >
      <p className="flex items-center gap-1.5 text-[0.6875rem] font-medium text-slate-500">
        {bar && <i className={`h-2.5 w-2.5 shrink-0 rounded-sm ${bar}`} />}
        <span className="truncate">{label}</span>
        <ChevronRight size={12} className="ml-auto shrink-0 text-slate-300 group-hover:text-slate-600" />
      </p>
      <p className={`${strong ? 'text-2xl' : 'text-lg'} font-semibold tabular-nums ${strong ? tone : 'text-slate-900'}`}>
        {fmtTy(value)}<span className="ml-1 text-xs font-medium text-slate-400">Tỷ</span>
        <span className="ml-1.5 text-[0.6875rem] font-normal text-slate-400">{pctOf(value, kpi.total)}</span>
      </p>
    </button>
  );

  // Phần chưa nhập kho theo công đoạn, giữ thứ tự cột của bảng công trình: P001 -> P002 -> Trên chuyền
  // (cùng thứ tự với thanh tỷ trọng). Màu cùng 1 họ xám / cam theo độ "gần xong": xám = chưa triển khai,
  // càng đậm càng gần nhập kho. P022–P025 nhập chưa đủ chỉ hiện khi có số.
  const remainTiles = ([
    { key: 'notDeployed', label: 'Chưa triển khai (P001)', bar: 'bg-slate-300', ink: 'text-slate-800',
      hint: 'Phần chưa nhập kho của hạng mục ở P001 / 15. CHƯA TRIỂN KHAI.' },
    { key: 'p002', label: 'Chưa tính phiếu (P002)', bar: 'bg-amber-300', ink: 'text-amber-950',
      hint: 'Phần chưa nhập kho của hạng mục ở P002 (bản vẽ kỹ thuật, chưa tính phiếu).' },
    { key: 'onLine', label: 'Đang trên chuyền (P012→P021)', bar: 'bg-amber-500', ink: 'text-white',
      hint: 'Phần chưa nhập kho của hạng mục ở P012 → P021 (gồm GCVT).' },
    { key: 'shortfall', label: 'P022–P025 nhập chưa đủ', bar: 'bg-orange-600', ink: 'text-white',
      hint: 'Hạng mục đã ở P022 / P025 nhưng giá trị nhập kho chưa đủ trị giá đơn hàng (lệch đơn giá / nhập thiếu).' },
  ] as const).filter(t => t.key === 'notDeployed' || t.key === 'p002' || t.key === 'onLine' || kpi.remainBy[t.key] > 0.0005);
  // Số HIỂN THỊ (làm tròn 0,01 tỷ) của các ô giá trị, cộng khớp tuyệt đối trên màn hình:
  // Đã nhập + Xuất vượt nhập = Đã xuất + Tồn (không hủy) + Chênh; Tổng = Đã nhập + Chưa nhập; các ô con Chưa nhập chia theo phần dư lớn nhất.
  const shownExported = roundTy(kpi.exported);
  const shownXuatVuot = roundTy(kpi.xuatVuot);
  const shownStockKhongHuy = roundTy(kpi.stock - kpi.stockHuy);
  const shownUnmatched = Math.max(roundTy(kpi.done) + shownXuatVuot - shownExported - shownStockKhongHuy, 0);
  const shownRemain = roundTy(kpi.total) - roundTy(kpi.done);
  const shownRemainBy = apportionTy(remainTiles.map(t => kpi.remainBy[t.key]), shownRemain);

  // Đoạn của thanh tỷ trọng = đúng các ô bên dưới (cùng màu, cùng số hiển thị, bấm mở cùng cửa sổ chi tiết)
  // v = số in trên ô; w = phần vẽ trên thanh khi khác v (Đã xuất trừ phần vượt nhập, Tồn trừ hàng hủy)
  type Seg = { key: string; label: string; v: number; w?: number; bar: string; ink: string; hint: string; spec: Omit<DetailSpec, 'eyebrow' | 'title'> };
  const EXPORT_HINT = 'TT xuất kho lũy kế, số gốc; đơn hủy không tính.';
  const XUAT_VUOT_HINT = 'Phần xuất kho lũy kế vượt đã nhập, theo từng hạng mục.';
  const UNMATCHED_HINT = 'Đã nhập − Đã xuất − Tồn, không âm: đã nhập mà không thấy xuất lẫn tồn.';
  const STOCK_HINT = 'Cột tồn kho của bảng sản xuất, chỉ các hạng mục đang xem, mỗi hạng mục tối đa bằng đã nhập − đã xuất. Khác thẻ Tồn kho (toàn kho, bảng tồn kho).';
  const doneSegs: Seg[] = [
    { key: 'exported', label: 'Đã xuất / giao (P025)', v: shownExported, w: shownExported - shownXuatVuot, bar: 'bg-emerald-600', ink: 'text-white', hint: EXPORT_HINT,
      spec: { pred: r => r.exported > 0, focus: 'exported', note: EXPORT_HINT } },
    { key: 'stock', label: 'Tồn theo đơn đang xem', v: roundTy(kpi.stock), w: shownStockKhongHuy, bar: 'bg-emerald-300', ink: 'text-emerald-950', hint: STOCK_HINT,
      spec: { pred: r => r.stock > 0, focus: 'stock', note: STOCK_HINT } },
    ...(shownUnmatched > 0.0005 ? [{ key: 'unmatched', label: 'Chênh', v: shownUnmatched, bar: 'bg-lime-200', ink: 'text-lime-950', hint: UNMATCHED_HINT,
      spec: { pred: (r: Rec) => r.unmatched > 0.0005, focus: 'unmatched' as DetailFocus, note: UNMATCHED_HINT } }] : []),
    ...(shownXuatVuot > 0.0005 ? [{ key: 'xuatVuot', label: 'Xuất vượt nhập', v: shownXuatVuot, w: 0, bar: 'bg-rose-300', ink: 'text-rose-950', hint: XUAT_VUOT_HINT,
      spec: { pred: (r: Rec) => r.xuatVuot > 0.0005, focus: 'xuatVuot' as DetailFocus, note: XUAT_VUOT_HINT } }] : []),
  ];
  const remainSegs: Seg[] = remainTiles.map((t, i) => ({
    key: t.key, label: t.label, v: shownRemainBy[i], bar: t.bar, ink: t.ink, hint: t.hint,
    spec: { pred: (r: Rec) => r.bucket === t.key && r.total - r.done > 0, focus: 'remain' as DetailFocus, note: t.hint },
  }));
  const rongSeg = (x: Seg) => Math.max(x.w ?? x.v, 0);
  const segTotal = [...doneSegs, ...remainSegs].reduce((a, x) => a + rongSeg(x), 0);
  const segPct = (v: number) => (segTotal > 0 ? (Math.max(v, 0) / segTotal) * 100 : 0);
  const doneW = doneSegs.reduce((a, x) => a + segPct(rongSeg(x)), 0);
  // % IN RA (số nguyên) theo phần dư lớn nhất: chia 100% cho 2 nhóm trước, rồi chia % nhóm cho các đoạn
  // => % ngoặc nhóm = tổng % các đoạn trong nhóm, Đã nhập + Chưa nhập = 100%
  const sumV = (segs: Seg[]) => segs.reduce((a, x) => a + rongSeg(x), 0);
  const [donePctInt, remainPctInt] = apportionInt([sumV(doneSegs), sumV(remainSegs)], 100);
  const segPctInt = new Map<string, number>();
  ([[doneSegs, donePctInt], [remainSegs, remainPctInt]] as const).forEach(([segs, p]) => {
    const parts = apportionInt(segs.map(rongSeg), p);
    segs.forEach((x, i) => segPctInt.set(x.key, parts[i]));
  });
  // Nhóm có giá trị nhưng làm tròn ra 0% thì ghi "<1%" (thay vì 0%)
  const groupPctLabel = (p: number, v: number) => (segTotal <= 0 ? '—' : p === 0 && v > 0 ? '<1%' : `${p}%`);
  const donePctLabel = groupPctLabel(donePctInt, sumV(doneSegs));
  const remainPctLabel = groupPctLabel(remainPctInt, sumV(remainSegs));

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-wood-50">
      {/* Thanh tiêu đề + bộ lọc */}
      <div className="sticky top-0 z-30 bg-wood-50/90 backdrop-blur border-b border-slate-200 px-4 md:px-6 py-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              Báo cáo tiến độ công trình{group && <span className="text-red-700"> · {GROUP_SHORT[group]}</span>}
            </h2>
            <p className="text-xs text-slate-500" title="Bấm biểu đồ tròn để lọc chéo · Bấm ô số liệu, cột tháng, tên PC / công trình để xem chi tiết">Đơn vị: tỷ đồng · bấm số để xem chi tiết</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Giống "Tình Trạng IPO" ở Bộ lọc tổng trang Tổng quan: chọn nhiều, mặc định tất cả */}
            <DashboardFilter
              label="Tình Trạng IPO"
              canhPhai={laBcBot}
              options={ipoOptionsHien}
              selectedValues={ipoSel}
              onChange={setIpoSel}
            />
            {!laBcBot && (<>
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
            {showCol.nct && (
              <SearchableSelect
                value={f.nct ?? ''}
                onChange={v => setKey('nct', v)}
                options={options.nct.map(o => ({ code: o, name: o }))}
                allLabel="Nhóm CT: Tất cả"
                widthClass="w-44"
                className="text-sm [&>button]:h-9 [&>button]:rounded-lg [&>button]:px-2.5"
              />
            )}
            {showCol.tda && (
              <SearchableSelect
                value={f.tda ?? ''}
                onChange={v => setKey('tda', v)}
                options={options.tda.map(o => ({ code: o, name: o }))}
                allLabel="Dự án: Tất cả"
                widthClass="w-40"
                className="text-sm [&>button]:h-9 [&>button]:rounded-lg [&>button]:px-2.5"
              />
            )}
            </>)}
          </div>
        </div>

        {activeKeys.length > 0 && !laBcBot && (
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
        {/* Nhóm công trình: thay cho 2 trang riêng Luồng đỏ / Căn mẫu trước đây */}
        <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-9 w-fit items-center rounded-lg border border-slate-300 bg-white p-0.5 text-xs" role="group" aria-label="Nhóm công trình">
          {([null, ...CONFIGURABLE_VIEWS.map(v => v.id)] as (ProjectGroupId | null)[]).map(g => (
            <button
              key={g ?? 'all'}
              type="button"
              onClick={() => { setGroup(g); setLocKhsx(false); setF({}); }}
              title={g ? `Chỉ các công trình đã setup cho nhóm ${GROUP_SHORT[g]} (Công trình → Setup phân loại)` : 'Mọi công trình'}
              className={`h-full rounded-md px-2.5 font-medium transition ${group === g && !locKhsx ? (g ? 'bg-red-600 text-white' : 'bg-slate-900 text-white') : g === 'luong-do' ? 'font-semibold text-red-600 hover:bg-red-50' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {g ? GROUP_SHORT[g] : 'Tất cả CT'}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setLocKhsx(true); setGroup(null); setF({}); }}
            title="Chỉ các công trình có trong kế hoạch sản xuất tháng hiện tại (KH tháng; tháng chưa có KH tháng thì theo KH tuần)"
            className={`h-full rounded-md px-2.5 font-medium transition ${locKhsx ? 'bg-blue-700 text-white' : 'font-semibold text-blue-700 hover:bg-blue-50'}`}
          >
            KHSX tháng {new Date().getMonth() + 1}
          </button>
        </div>
        <div className="flex h-9 w-fit items-center rounded-lg border border-slate-300 bg-white p-0.5 text-sm" role="group" aria-label="Xem theo">
          {([['tong', 'Tổng quan'], ['bop', 'BOP · Công đoạn'], ['bot', 'BOT · Kế hoạch nhập kho'], ['bom', 'BOM · Vật tư'], ['bcbot', 'BÁO CÁO BOT']] as const).map(([k, nhan]) => (
            <button key={k} type="button" onClick={() => setViewCT(k)} aria-pressed={viewCT === k}
              title={k === 'tong' ? 'Báo cáo tổng quan'
                : k === 'bcbot' ? 'Giá trị đơn hàng còn lại theo dự án (như sheet BÁO CÁO BOT của file MASTER_PROJECT_COORDINATION) — cập nhật khi file công trình được lưu'
                  : `${nhan} của tất cả công trình đang xem (theo bộ lọc trang)`}
              className={`h-full rounded-md px-3 font-semibold transition ${viewCT === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {nhan}
            </button>
          ))}
        </div>
        </div>
        {locKhsx && (
          <p className={`rounded-lg border px-4 py-2 text-xs ${khsxLoi || khsxCt?.loai === null ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
            {khsxLoi ? 'Không tải được danh sách công trình trong KHSX — thử tải lại trang.'
              : !khsxCt ? 'Đang tải danh sách công trình trong KHSX…'
                : khsxCt.loai === null ? `Tháng ${khsxCt.thang}/${khsxCt.nam} chưa có kế hoạch sản xuất (KH tháng / tuần).`
                  : `Đang xem ${fmtInt(groupRecords.length)} hạng mục / ${fmtInt(new Set(groupRecords.map(r => r.mk)).size)} công trình có trong KH ${khsxCt.loai === 'THÁNG' ? 'tháng' : 'tuần (KHSX chưa có KH tháng)'} ${khsxCt.thang}/${khsxCt.nam} — KHSX có ${fmtInt(khsxCt.hex.length)} HEX${khsxCt.capNhat ? `, bảng KHSX cập nhật lần cuối ${new Date(khsxCt.capNhat).toLocaleDateString('vi-VN')}` : ''}.`}
          </p>
        )}
        {group && groupSize === 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            Chưa có công trình nào được setup cho nhóm {GROUP_SHORT[group]}. Vào Công trình → Setup phân loại để chọn công trình.
          </p>
        )}

        {viewCT !== 'tong' && (
          <div className={`${cardCls} p-4 sm:p-5`}>
            {viewCT !== 'bcbot' && (
              <p className="mb-4 text-sm text-slate-500">
                Tất cả công trình đang xem: <b className="text-slate-800">{fmtInt(tenCtTatCa.length)}</b> công trình · <b className="text-slate-800">{fmtInt(rowsAll.length)}</b> hạng mục (theo nhóm / bộ lọc phía trên). Bấm HEX để xem chi tiết hạng mục.
              </p>
            )}
            {viewCT === 'bcbot' && <BaoCaoBot onHexClick={setHexXem} ipoChon={ipoSel} onIpos={setIpoBot} />}
            {viewCT === 'bop' && (coBang
              ? <BopTab items={hangMucTatCa} onHexClick={setHexXem} extra={null} today={homNay} tatCa />
              : <p className="py-10 text-center text-sm font-semibold text-slate-500">Đang tải chi tiết hạng mục…</p>)}
            {viewCT === 'bot' && <BotKhnk items={hangMucTatCa} dieuPhoiItems={dieuPhoiTatCa} onHexClick={setHexXem} />}
            {viewCT === 'bom' && <BomTatCa tenCongTrinh={tenCtTatCa} onHexClick={setHexXem} />}
          </div>
        )}
        <div className={viewCT === 'tong' ? 'space-y-4' : 'hidden'}>
        {/* GIÁ TRỊ — đi theo luồng dữ liệu (cùng logic bảng "Tình trạng đơn hàng theo công trình"):
            Tổng giá trị = Đã nhập kho (P022) + Chưa nhập kho
            Đã nhập kho ≈ Đã xuất / giao (P025) + Tồn theo đơn đang xem
            Chưa nhập kho = Chưa triển khai (P001) + Chưa tính phiếu (P002) + Đang trên chuyền (P012→P021)
                            [+ P022–P025 nhập chưa đủ] */}
        <div className={`${cardCls} p-4`}>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <button
              type="button"
              onClick={() => openDetail({ eyebrow: 'Chỉ số', title: 'Tổng giá trị đơn hàng', pred: () => true, focus: 'total', note: 'Tổng trị giá đơn hàng, không tính đơn hủy.' })}
              title="Bấm để xem chi tiết"
              className="group text-left"
            >
              <p className="flex items-center gap-1 text-[0.6875rem] font-medium tracking-wide text-slate-500">
                Tổng giá trị đơn hàng <ChevronRight size={13} className="text-slate-300 group-hover:text-slate-600" />
              </p>
              <p className="text-3xl font-semibold tabular-nums text-slate-900">
                {fmtTy(kpi.total)}<span className="ml-1 text-sm font-medium text-slate-400">Tỷ</span>
              </p>
            </button>
            <p className="text-[0.6875rem] text-slate-500">
              {fmtInt(kpi.cts)} công trình · {fmtInt(kpi.items)} hạng mục · đã nhập kho <b className="text-emerald-700">{donePctLabel}</b> giá trị
              {kpi.cancelled > 0 && <span className="text-rose-600"> · hủy {fmtTy(kpi.totalHuy)} tỷ, {fmtInt(kpi.cancelled)} mục (ngoài tổng)</span>}
            </p>
          </div>
          {/* Thanh tỷ trọng: 2 nhóm (xanh = đã nhập kho, cam / xám = chưa nhập kho), mỗi đoạn = 1 ô bên dưới.
              Ngoặc nhóm phía trên; % in trên đoạn đủ rộng; rê chuột xem số, bấm mở chi tiết. */}
          <div className="mt-4" role="img" aria-label={`Tổng ${fmtTy(kpi.total)} tỷ: ${[...doneSegs, ...remainSegs].map(x => `${x.label} ${fmtTy(x.v)} tỷ`).join(', ')}`}>
            <div className="mb-1 flex text-[0.6875rem] font-medium">
              {doneW > 0 && (
                <div className="min-w-0 pr-1" style={{ width: `${doneW}%` }}>
                  <div className="truncate border-b-2 border-emerald-500 pb-0.5 text-emerald-800" title={`Đã nhập kho: ${fmtTy(roundTy(kpi.done))} tỷ`}>
                    Đã nhập kho · {donePctLabel}
                  </div>
                </div>
              )}
              <div className="min-w-0 flex-1 pl-1">
                <div className="truncate border-b-2 border-amber-400 pb-0.5 text-right text-amber-800" title={`Chưa nhập kho: ${fmtTy(shownRemain)} tỷ`}>
                  Chưa nhập kho · {remainPctLabel}
                </div>
              </div>
            </div>
            <div className="flex h-8 gap-[2px] overflow-hidden rounded-md bg-white">
              {[...doneSegs, ...remainSegs].filter(x => rongSeg(x) > 0).map(x => {
                const w = segPct(rongSeg(x));
                return (
                  <button
                    key={x.key}
                    type="button"
                    onClick={() => openDetail({ eyebrow: 'Chỉ số', title: x.label, ...x.spec })}
                    title={`${x.label}: ${fmtTy(x.v)} tỷ (${pctOf(rongSeg(x), segTotal)})\n${x.hint}\nBấm để xem chi tiết`}
                    className={`${x.bar} ${x.ink} flex min-w-[3px] items-center justify-center overflow-hidden text-[0.6875rem] font-semibold tabular-nums transition hover:brightness-95 hover:ring-2 hover:ring-inset hover:ring-slate-900/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900`}
                    style={{ width: `${w}%` }}
                  >
                    {w >= 4 && <span className="truncate px-1">{w >= 14 ? `${x.label.replace(/ \(.*\)$/, '')} · ` : ''}{segPctInt.get(x.key) ?? 0}%</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[2fr_3fr]">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5">
              <Mini label="Đã nhập kho (P022)" value={roundTy(kpi.done)} tone="text-emerald-700" strong
                    hint={`Giá trị đã nhập kho lũy kế (tối đa bằng trị giá đơn hàng) = ${fmtTy(kpi.stockedDone)} tỷ của ${fmtInt(kpi.stocked)} mục nhập đủ + ${fmtTy(kpi.partialDone)} tỷ của ${fmtInt(kpi.partial)} mục mới nhập một phần.`}
                    spec={{ pred: r => r.done > 0, focus: 'done', note: 'Giá trị đã nhập kho lũy kế (tối đa bằng trị giá đơn hàng).' }} />
              <div className={`mt-2 grid gap-2 ${doneSegs.length > 3 ? 'grid-cols-2' : doneSegs.length > 2 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {doneSegs.map(x => (
                  <Mini key={x.key} label={x.label} value={x.v} tone="text-slate-900" bar={x.bar} hint={x.hint} spec={x.spec} />
                ))}
              </div>
              {kpi.stockOverItems > 0 && (
                <button type="button" title="Phần tồn kho vượt đã nhập − đã xuất, không tính vào ô Tồn. Bấm để xem chi tiết"
                  onClick={() => openDetail({ eyebrow: 'Chỉ số', title: 'Tồn vượt nhập − xuất', pred: r => r.stockCut > 0.001, focus: 'stockCut', note: 'Hạng mục có tồn kho lớn hơn đã nhập − đã xuất.' })}
                  className="mt-1.5 text-sm font-semibold text-slate-700 hover:underline">
                  Tồn vượt nhập − xuất: <span className="tabular-nums">{fmtTy(kpi.stockOver)}</span> tỷ · {fmtInt(kpi.stockOverItems)} mục
                </button>
              )}
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-2.5">
              <Mini label="Chưa nhập kho" value={shownRemain} tone="text-amber-700" strong
                    hint="Trị giá đơn hàng − giá trị đã nhập kho, chia theo công đoạn BOP hiện tại của hạng mục."
                    spec={{ pred: r => r.total - r.done > 0, focus: 'remain', note: 'Trị giá đơn hàng trừ giá trị đã nhập kho, không tính đơn hủy.' }} />
              <div className={`mt-2 grid gap-2 ${remainSegs.length > 3 ? 'grid-cols-2 xl:grid-cols-4' : 'grid-cols-3'}`}>
                {remainSegs.map(x => (
                  <Mini key={x.key} label={x.label} value={x.v} tone="text-slate-900" bar={x.bar} hint={x.hint} spec={x.spec} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* HẠNG MỤC + CẢNH BÁO (cảnh báo đếm hạng mục còn theo dõi: chưa nhập đủ, không hủy) */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-9">
          <Kpi label="Công trình" value={fmtInt(kpi.cts)}
               spec={{ pred: () => true, focus: 'total', note: 'Mọi hạng mục của các công trình (đếm công trình theo tên chuẩn — gộp các cách viết của cùng công trình).' }} />
          <Kpi label="Tổng số mục" value={fmtInt(kpi.items)}
               sub={kpi.cancelled > 0 ? `ngoài tổng ${fmtInt(kpi.cancelled)} hủy` : undefined}
               spec={{ pred: r => r.status !== 'HỦY', focus: 'items', note: 'Mọi hạng mục, không tính đơn hủy.' }} />
          <Kpi label="Đã nhập kho đủ" value={fmtInt(kpi.stocked)} unit="mục" tone="text-emerald-600"
               sub={`${fmtTy(kpi.stockedDone)} tỷ`}
               hint={`Đã nhập kho đủ trị giá hoặc đủ số lượng đơn hàng — ${fmtTy(kpi.stockedDone)} tỷ. Ô "Đã nhập kho (P022)" ${fmtTy(roundTy(kpi.done))} tỷ còn gồm ${fmtTy(kpi.partialDone)} tỷ của ${fmtInt(kpi.partial)} mục mới nhập một phần.`}
               spec={{ pred: recDaNhapDu, focus: 'items', note: 'Hạng mục đã nhập kho đủ trị giá hoặc đủ số lượng đơn hàng (không tính đơn hủy).' }} />
          <Kpi label="Chưa nhập kho đủ" value={fmtInt(kpi.notStocked)} unit="mục" tone="text-amber-600"
               sub={kpi.partial > 0 ? `trong đó ${fmtInt(kpi.partial)} nhập một phần (${fmtTy(kpi.partialDone)} tỷ)` : undefined}
               spec={{ pred: r => r.status !== 'HỦY' && !recDaNhapDu(r), focus: 'items', note: 'Hạng mục chưa nhập kho hoặc mới nhập một phần (không tính đơn hủy).' }} />
          <Kpi label="Quá hạn KH nhập kho" value={fmtInt(kpi.overdue)} unit="mục" tone={kpi.overdue ? 'text-red-600' : 'text-slate-900'}
               sub={`${fmtTy(kpi.overdueRemain)} tỷ chưa nhập kho`}
               hint="Hạng mục chưa nhập kho đủ đã qua KH nhập kho tuần / tháng (KH kỳ đã nhập đủ SL thì không tính)"
               spec={{ pred: r => r.open && r.overdue, focus: 'remain', note: 'Hạng mục chưa nhập kho đủ (giá trị / số lượng), đã qua KH nhập kho tuần → tháng.' }} />
          <Kpi label="Chưa có KH nhập kho" value={fmtInt(kpi.noPlan)} unit="mục" tone={kpi.noPlan ? 'text-amber-600' : 'text-slate-900'}
               sub={`${fmtTy(kpi.noPlanRemain)} tỷ chưa nhập kho`}
               hint="Hạng mục chưa nhập kho đủ mà không có KH nhập kho tuần / tháng — không theo dõi được quá hạn"
               spec={{ pred: r => r.open && !r.deadline && !r.planMet, focus: 'remain', note: 'Hạng mục chưa nhập kho đủ, không có KH nhập kho tuần / tháng (chưa lập BOT).' }} />
          <Kpi label="Đạt KH kỳ, chờ KH tiếp" value={fmtInt(kpi.metWait)} unit="mục" tone="text-sky-700"
               sub={`${fmtTy(kpi.metWaitRemain)} tỷ chưa nhập kho`}
               hint="Hạng mục đã nhập đủ số lượng KH nhập kho tuần / tháng của kỳ nhưng đơn hàng còn chưa nhập kho đủ — không trễ, chờ KH kỳ sau"
               spec={{ pred: r => r.open && r.planMet, focus: 'remain', note: 'Hạng mục đã đạt KH nhập kho tuần / tháng của kỳ (nhập trong kỳ ≥ SL KH) nhưng đơn hàng còn chưa nhập kho đủ — chờ KH kỳ sau.' }} />
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
              {vmRows === null ? 'Đang tải' : `${fmtInt(vmSum.cts)} công trình · ${fmtInt(vmSum.overdue)} quá hạn BOT`}
            </p>
          </a>
        </div>

        {/* 1280–1535px: trái 4 / giữa 8, thẻ Nhóm đơn hàng xuống hàng dưới (bảng công trình 9 cột cần ≥ 800px);
            từ 1536px: 3 / 6 / 3 */}
        {/* Màn hình rộng: cột trái hẹp (biểu đồ + PC), cột giữa rộng để danh sách công trình hiện đủ, không viết tắt */}
        <div className="grid grid-cols-1 xl:grid-cols-12 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,3.4fr)_minmax(0,1.5fr)] gap-4">
          {/* Cột trái: biểu đồ theo tháng + bảng theo PC */}
          <div className="xl:col-span-4 2xl:col-span-1 space-y-4">
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

            <div className={`${cardCls} overflow-hidden`}>
              <p className="text-sm font-bold text-slate-900 px-4 pt-3 pb-2">Theo người phụ trách (PC)</p>
              <div className="max-h-[340px] overflow-auto border-t border-slate-300 custom-scrollbar">
                <table className={bangB}>
                  <thead className={theadB}>
                    <tr>
                      <th className={`${thB} w-px`}>STT</th>
                      <th className={thB}>Tên PC</th>
                      <th className={`${thB} w-px`} title="Số công trình">CT</th>
                      <th className={`${thB} w-px`} title="Số hạng mục">Mục</th>
                      <th className={`${thB} w-px whitespace-nowrap`} title="Tổng giá trị (tỷ)">GT (Tỷ)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pcTable.map((r, idx) => (
                      <tr key={r.name} onClick={() => openDetail({
                            eyebrow: 'Người phụ trách (PC)', title: r.name, exclude: 'pc',
                            pred: rec => rec.pc === r.name, focus: 'total', filter: { key: 'pc', value: r.name },
                          })}
                          title="Bấm để xem các công trình PC đang quản lý"
                          className={`group cursor-pointer hover:bg-amber-50 ${f.pc === r.name ? 'bg-amber-100 font-semibold' : ''}`}>
                        <td className={soB}>{idx + 1}</td>
                        <td className={`${tdB} font-bold`}>
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
                        <td className={soB}><span className={GACH}>{r.cts.size}</span></td>
                        <td className={soB}><span className={GACH}>{fmtInt(r.items)}</span></td>
                        <td className={soB}><span className={GACH}>{fmtTy(r.total)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className={tfootB}>
                    <tr>
                      <td colSpan={2} className={`${tdB} text-center`}>TỔNG</td>
                      <td className={soB}>{new Set(pcTable.flatMap(r => [...r.cts])).size}</td>
                      <td className={soB}>{fmtInt(pcTable.reduce((s, r) => s + r.items, 0))}</td>
                      <td className={soB}>{fmtTy(pcTable.reduce((s, r) => s + r.total, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          {/* Cột giữa: danh sách công trình (rộng 6/12 cột, tên công trình hiện đầy đủ) */}
          <div className={`xl:col-span-8 2xl:col-span-1 ${cardCls} overflow-hidden flex flex-col`}>
            <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
              <p className="text-sm font-bold text-slate-900">Danh sách công trình ({fmtInt(ctTable.length)})</p>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={ctSearch} onChange={e => setCtSearch(e.target.value)} placeholder="Tìm công trình..."
                  className="h-8 w-48 rounded-lg border border-slate-300 pl-8 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-wood-600/15 focus:border-wood-600"
                />
              </div>
            </div>
            <div className="flex-1 max-h-[720px] overflow-auto border-t border-slate-300 custom-scrollbar">
              <table className={bangB}>
                <thead className={theadB}>
                  <tr>
                    <th className={`${thB} w-px`}>STT</th>
                    <th className={thB}>Tên công trình</th>
                    <th className={thB}>PM</th>
                    <th className={thB}>Hạng mục</th>
                    <th className={thB}
                        title={ctHasCancel ? 'Tổng trị giá đơn hàng, không tính đơn hủy (dòng phụ "hủy …" = trị giá đơn hủy)' : undefined}>
                      Tổng giá trị (Tỷ){ctHasCancel && <span className="text-rose-500">*</span>}
                    </th>
                    <th className={`${thB} min-w-[5.5rem]`}>Hoàn thành</th>
                    <th className={thB} title="BOT dự án — hạn chung của công trình (tham khảo); đỏ = đã qua mà còn hạng mục chưa xong">BOT dự án</th>
                    <th className={thB} title="Hạng mục chưa nhập kho đủ đã qua KH nhập kho tuần / tháng">Quá hạn</th>
                    <th className={thB} title="Vướng mắc chưa xử lý xong (theo mã công trình)">Vướng mắc</th>
                  </tr>
                </thead>
                <tbody>
                  {ctTable.map((r, idx) => {
                    const pct = pctHoanThanh(r.name);
                    const pms = [...r.pms];
                    const botLeft = r.botDuAn ? Math.floor((r.botDuAn.getTime() - today) / 86_400_000) : null;
                    const mau = mauLuong(r.thuTu);
                    const dangChon = f.ct === r.name;
                    return (
                      <tr key={r.name} onClick={() => { if (canBang()) setHealth({ ct: r.name, inDetail: false }); }}
                          title={`${mau ? `${mau.nhan} · ` : ''}Bấm để xem tổng quan công trình (BOT · BOP · BOM)`}
                          className={`group cursor-pointer ${mau ? `${dangChon ? 'bg-amber-200 font-semibold' : mau.nen} ${mau.hover}` : `hover:bg-amber-50 ${dangChon ? 'bg-amber-100 font-semibold' : ''}`}`}>
                        <td className={`${soB} ${mau?.stt ?? ''}`}>{ctStt[idx]}</td>
                        <td className={`${tdB} min-w-[140px] font-bold`}>
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
                        <td className={tdB} title={pms.join(', ')}>
                          {pms.map(pm => <div key={pm}>{pm}</div>)}
                        </td>
                        <td className={soB}><span className={GACH}>{fmtInt(r.items)}</span></td>
                        <td className={soB}>
                          <span className={GACH}>{fmtTy(r.total)}</span>
                          {r.cancelled > 0 && (
                            <div className="text-xs font-medium leading-tight text-rose-600" title="Trị giá đơn hủy (ngoài Tổng GT)">hủy {fmtTy(r.cancelled)}</div>
                          )}
                        </td>
                        <td className={tdB}>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                            </div>
                            <span className={`w-12 shrink-0 text-center tabular-nums ${pct === 0 ? 'font-bold text-red-600' : ''}`}>{fmtPt(pct)}</span>
                          </div>
                        </td>
                        <td className={`${soB} ${!r.botDuAn ? '' : r.open === 0 ? 'text-emerald-700' : botLeft! < 0 ? 'font-bold text-red-600' : botLeft! <= 30 ? 'text-amber-600' : ''}`}
                            title={r.botDuAn ? (r.open === 0 ? 'Đã nhập kho đủ' : botLeft! < 0 ? `Quá BOT dự án ${-botLeft!} ngày · còn ${fmtInt(r.open)} hạng mục` : `Còn ${botLeft} ngày · ${fmtInt(r.open)} hạng mục chưa xong`) : 'Chưa có BOT dự án'}>
                          {r.botDuAn ? r.botDuAn.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' }) : ''}
                        </td>
                        <td className={`${soB} ${r.overdue ? 'font-bold text-red-600' : ''}`}>{r.overdue || ''}</td>
                        <td className={`${soB} ${r.vm.open ? 'font-bold text-red-600' : ''}`}
                            title={r.vm.open ? `${r.vm.open} vướng mắc đang mở · ${r.vm.overdue} quá hạn BOT` : undefined}>
                          {vmRows === null ? '…' : r.vm.open || ''}
                        </td>
                      </tr>
                    );
                  })}
                  {ctTable.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Không có công trình phù hợp</td></tr>
                  )}
                </tbody>
                {ctTable.length > 0 && (
                  <tfoot className={tfootB}>
                    <tr>
                      <td colSpan={3} className={`${tdB} text-center`}>TỔNG</td>
                      <td className={soB}>{fmtInt(ctTong.items)}</td>
                      <td className={soB}>
                        {fmtTy(ctTong.total)}
                        {ctTong.cancelled > 0 && <div className="text-xs font-medium leading-tight">hủy {fmtTy(ctTong.cancelled)}</div>}
                      </td>
                      <td className={soB}>{fmtPt(ctTong.pct)}</td>
                      <td className={tdB} />
                      <td className={soB}>{ctTong.overdue ? fmtInt(ctTong.overdue) : ''}</td>
                      <td className={soB}>{vmRows === null ? '…' : ctTong.vm ? fmtInt(ctTong.vm) : ''}</td>
                    </tr>
                  </tfoot>
                )}
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
      </div>

      <HexTimelineModal hex={hexXem} onClose={() => setHexXem(null)} names={tenHexXem} />
      {/* Cấp 1: cửa sổ chi tiết (ô KPI / cột tháng / PC) — bấm 1 công trình mở cửa sổ HEX (cấp 2) */}
      <ModalShell
        open={detail !== null && detailData !== null}
        onClose={() => setDetail(null)}
        labelledBy="detail-title"
        overlayClassName="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-900/50 p-4"
        panelClassName="w-full max-w-[1500px] max-h-[90vh] flex flex-col rounded-xl bg-white shadow-2xl outline-none"
      >
        {detail && detailData && (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-slate-500">{detail.eyebrow}</p>
                <h3 id="detail-title" className="text-lg font-semibold text-slate-900 truncate" title={detail.note}>{detail.title}</h3>
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
                  disabled={detailData.rows === 0 || detailData.rows > MAX_HEX_ALL}
                  title={detailData.rows > MAX_HEX_ALL
                    ? `Quá nhiều (${fmtInt(detailData.rows)} HEX) — chọn 1 công trình bên dưới để xem HEX`
                    : 'Xem toàn bộ HEX trong cửa sổ này'}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400"
                >
                  Xem tất cả HEX ({fmtInt(detailData.rows)})
                </button>
                <button onClick={() => setDetail(null)} aria-label="Đóng"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Số liệu tổng — ô đang xem được tô viền */}
            <div className="grid grid-cols-2 gap-3 px-5 py-4 md:grid-cols-4 xl:grid-cols-none xl:auto-cols-fr xl:grid-flow-col">
              <PcStat label="Công trình" value={fmtInt(detailData.cts)} />
              <PcStat label="Hạng mục" value={fmtInt(detailData.items)} active={detail.focus === 'items'} sub={detailData.huyN ? `hủy ${fmtInt(detailData.huyN)} mục` : undefined} />
              <PcStat label="Tổng giá trị" value={fmtTy(detailData.total)} unit="Tỷ" active={detail.focus === 'total'} sub={detailData.huyN ? `hủy ${fmtTy(detailData.totalHuy)} tỷ` : undefined} />
              <PcStat
                label="Đã nhập kho" value={fmtTy(detailData.done)} unit="Tỷ" tone="text-emerald-600"
                active={detail.focus === 'done'}
                sub={fmtPt(tyLeHoanThanh(detailData.total, detailData.done))}
              />
              <PcStat label="Chưa nhập kho" value={fmtTy(detailData.remain)} unit="Tỷ" tone="text-amber-600" active={detail.focus === 'remain'} />
              <PcStat label="Đã xuất / giao" value={fmtTy(detailData.exported)} unit="Tỷ" tone="text-sky-700" active={detail.focus === 'exported'} />
              <PcStat label="Tồn theo đơn đang xem" value={fmtTy(detailData.stock)} unit="Tỷ" tone="text-violet-700" active={detail.focus === 'stock'} />
              <PcStat label="Chênh" value={fmtTy(detailData.unmatched)} unit="Tỷ" active={detail.focus === 'unmatched'} />
              <PcStat label="Xuất vượt nhập" value={fmtTy(detailData.xuatVuot)} unit="Tỷ" tone="text-rose-700" active={detail.focus === 'xuatVuot'} />
              {detail.focus === 'stockCut' && <PcStat label="Tồn vượt nhập − xuất" value={fmtTy(detailData.stockCut)} unit="Tỷ" tone="text-rose-700" active />}
            </div>

            <div className="flex items-center justify-between gap-3 px-5 pb-2">
              <p className="text-xs font-semibold text-slate-700">
                Danh sách công trình ({fmtInt(detailProjects.length)})
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

            <div className="flex-1 min-h-0 px-5 pb-5 overflow-hidden flex flex-col">
              <div className={`${khungB} min-h-0 flex-1`}>
                <table className={bangB}>
                  <thead className={theadB}>
                    <tr>
                      <th className={`${thB} w-14`}>STT</th>
                      <th className={thB}>Tên công trình</th>
                      <th className={thB}>PM</th>
                      {COT_CHI_TIET.map(c => <th key={c.k} className={`${thB} ${detail.focus === c.k ? 'bg-emerald-400' : ''}`}>{c.t}</th>)}
                      {detail.focus === 'stockCut' && <th className={`${thB} bg-emerald-400`}>Tồn vượt nhập − xuất (Tỷ)</th>}
                      <th className={`${thB} w-40`}>% Hoàn thành</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailProjects.map((p, i) => {
                      const pct = pctHoanThanh(p.name);
                      const pms = [...p.pms];
                      const dam = (k: DetailFocus) => (detail.focus === k ? 'font-bold' : '');
                      return (
                        <tr key={p.name} onClick={() => { if (canBang()) setHealth({ ct: p.name, inDetail: true }); }}
                            className="group cursor-pointer hover:bg-blue-50/60">
                          <td className={soB}>{fmtInt(i + 1)}</td>
                          <td className={`${tdB} max-w-[320px] truncate group-hover:text-blue-700`} title={p.name}>{p.name}</td>
                          <td className={`${tdB} whitespace-nowrap`} title={pms.join(', ')}>
                            {pms[0]}{pms.length > 1 ? ` +${pms.length - 1}` : ''}
                          </td>
                          <td className={`${soB} ${dam('items')}`}>{trong0(p.items, fmtInt)}</td>
                          <td className={`${soB} ${dam('total')}`}>
                            {trong0(p.total, fmtTy)}
                            {p.huyN > 0 && <div className="text-xs font-medium leading-tight text-rose-600" title="Trị giá đơn hủy (ngoài Tổng GT)">hủy {fmtTy(p.totalHuy)}</div>}
                          </td>
                          {COT_CHI_TIET.slice(2).map(c => <td key={c.k} className={`${soB} ${dam(c.k)}`}>{trong0(giaTriTieuDiem(p, c.k), fmtTy)}</td>)}
                          {detail.focus === 'stockCut' && <td className={`${soB} font-bold`}>{trong0(p.stockCut, fmtTy)}</td>}
                          <td className={tdB}>
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                              </div>
                              <span className={`w-12 shrink-0 text-center tabular-nums ${pct === 0 ? 'font-bold text-red-600' : ''}`}>{fmtPt(pct)}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {detailProjects.length === 0 && (
                      <tr><td colSpan={13} className="px-4 py-8 text-center text-slate-400">Không có công trình phù hợp</td></tr>
                    )}
                  </tbody>
                  {detailProjects.length > 0 && (() => {
                    const cong = (k: DetailFocus) => detailProjects.reduce((s, p) => s + giaTriTieuDiem(p, k), 0);
                    const huyTong = detailProjects.reduce((s, p) => s + p.totalHuy, 0);
                    const ht = detailProjects.reduce((a, p) => { const e = hoanThanhCt.get(p.name); return e ? { total: a.total + e.total, done: a.done + e.done } : a; }, { total: 0, done: 0 });
                    const pct = tyLeHoanThanh(ht.total, ht.done);
                    return (
                      <tfoot className={tfootB}>
                        <tr>
                          <td colSpan={3} className={`${tdB} text-center`}>TỔNG</td>
                          <td className={soB}>{trong0(cong('items'), fmtInt)}</td>
                          <td className={soB}>
                            {trong0(cong('total'), fmtTy)}
                            {huyTong > 0 && <div className="text-xs font-medium leading-tight">hủy {fmtTy(huyTong)}</div>}
                          </td>
                          {COT_CHI_TIET.slice(2).map(c => <td key={c.k} className={soB}>{trong0(cong(c.k), fmtTy)}</td>)}
                          {detail.focus === 'stockCut' && <td className={soB}>{trong0(cong('stockCut'), fmtTy)}</td>}
                          <td className={soB}>{fmtPt(pct)}</td>
                        </tr>
                      </tfoot>
                    );
                  })()}
                </table>
              </div>
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
        khoRows={healthKhoRows}
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