import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X, AlertTriangle, ArrowRight, ChevronRight, HelpCircle } from 'lucide-react';
import { ModalShell } from '../shared/ModalShell';
import { DataRow } from '../../types';
import { parseNumber } from '../Dashboard/utils/numberParsers';
import { deadlineOf, doneValue, remainValue, isCancelledIpo, planAfterDue, isQtyComplete, parsePlanDate, stageRank } from '../../utils/productionMetrics';
import { fetchHexExtra, gcnPending as isGcnPending, type HexExtra } from '../../services/productionExtraService';
import { extractStage } from '../Dashboard/components/modals/OnLineStageDetailModal';
import { remainBucketOf, type RemainBucket } from '../Dashboard/hooks/usePivotTables';
import { fetchVuongMacList, FIVE_M_CATEGORIES, type FiveMCategory, type VuongMacItem } from '../../services/vuongMacService';
import { getToken } from '../../services/userService';
import type { NvlRaw } from '../../utils/nvlParse';
import { BotTab, BopTab, BomTab, analyzeBom, summarizeProjectMaterial, PlanDateCell, nhomBotHex, type HexInfo, type MaterialLine, type ProjectMaterialLine } from './ProjectHealthTabs';
import { NHOM_BOT, type NhomBot } from './core/chiSoCongTrinh';
import { HexMaterialModal, type MaterialViewMode } from '../Dashboard/components/modals/HexMaterialModal';
import { HexTimelineModal } from './HexTimelineModal';
import { formatTrieuAsTy } from '../../utils/money';
import { fmtInt, fmtDate, DAY_MS as DAY } from '../../utils/format';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, ReferenceLine } from 'recharts';

// ============================================================================
// Tổng quan 1 công trình (tầng 1): 3 thẻ BOT (thời hạn) · BOP (công đoạn) · BOM (vật tư)
// + danh sách "Cần xử lý ngay" = hạng mục quá hạn / sắp hạn MÀ còn vướng thêm vấn đề khác,
//   và "Chú ý" = hạng mục chưa nhập kho đủ mà không có BOT (không có KH nhập kho tuần / tháng).
// Cùng định nghĩa "còn lại" với bảng Tình trạng đơn hàng theo công trình:
// còn lại = trị giá - đã nhập kho (không âm), phân cột theo công đoạn BOP; đơn HỦY không tính.
// ============================================================================

export interface ProjectHealthKeys {
  hexKey: string;
  hangMucKey: string;
  bopKey: string;
  tinhTrangKey: string;
  ipoKey: string;
  triGiaKey: string;
  nhapKhoKey: string;
  /** Khu vực sản xuất (xuong_chinh) */
  xuongKey: string;
  /** Thời gian ở công đoạn hiện tại (so_ngay_cd_hien_tai) */
  dwellKey: string;
  /** Kế hoạch nhập kho theo tuần (text "yyyy-mm-dd hh:mm:ss") — ưu tiên */
  khnkTuanKey: string;
  /** Kế hoạch nhập kho theo tháng (date) — dùng khi không có KH tuần */
  khnkThangKey: string;
  /** Ngày cần giao — chỉ tham khảo (cờ "KH nhập kho sau ngày cần giao"), không tính hạn */
  ngayCanGiaoKey: string;
  /** Ngày cần (PM) / BOT dự án: chỉ tham khảo, không tính hạn */
  ngayCanKey?: string;
  botDuAnKey?: string;
  /** Ngày nhận đơn từ PM (tuổi đơn), tình trạng triển khai bản vẽ / phiếu (luồng tiến độ) — cột có từ 10/2026 */
  nhanPmKey?: string;
  bvStKey?: string;
  phieuStKey?: string;
  /** Nhóm công trình / tình trạng dự án (hiện ở tiêu đề) */
  nhomCtKey?: string;
  tinhTrangDaKey?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  /** Dòng sản xuất của công trình (đã qua bộ lọc trang) */
  rows: DataRow[];
  keys: ProjectHealthKeys;
  pmText?: string;
  /** Mở danh sách HEX đầy đủ (cửa sổ Chi tiết theo Hex — có Vật tư / Vướng mắc) */
  onOpenHexList: () => void;
  /** Bảng nhập kho (toàn bộ) — để vẽ nhịp nhập kho theo tuần + dự báo của công trình */
  inventory?: DataRow[];
  /** HEX không hủy của công trình, KHÔNG qua bộ lọc IPO — để tính nhịp nhập kho (sản lượng đã ra) */
  paceHexes?: string[];
}

const DUE_SOON_DAYS = 14;
const WEEKS_SHOWN = 12;   // số tuần vẽ nhịp nhập kho
const PACE_WEEKS = 8;     // số tuần đã qua dùng tính nhịp trung bình
// Đầu tuần (thứ 2) theo giờ địa phương
const weekStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
// Giá trị xuất hiện nhiều nhất (bỏ rỗng)
const modeOf = (vals: string[]): string => {
  const m = new Map<string, number>();
  vals.forEach(v => { if (v) m.set(v, (m.get(v) ?? 0) + 1); });
  let best = '', n = -1;
  m.forEach((c, v) => { if (c > n) { best = v; n = c; } });
  return best;
};
// Tên ngắn 5M — giống form "Thêm vướng mắc"
const FIVE_M_VI: Record<FiveMCategory, string> = {
  man: 'Con người', machine: 'Máy móc', material: 'Vật tư', method: 'Phương pháp', measurement: 'Đo lường',
};

const BUCKET_LABEL: Record<RemainBucket, string> = {
  notDeployed: 'Chưa triển khai',
  p002: 'Chưa tính phiếu',
  onLine: 'Đang trên chuyền',
  shortfall: 'Nhập kho chưa đủ',
};
/** Dấu "?" giải thích (rê chuột) — thay cho câu chú thích dài dưới khung */
const GiaiThich = ({ text }: { text: string }) => (
  <span title={text} aria-label={text} className="inline-flex shrink-0 cursor-help text-slate-400 hover:text-slate-700"><HelpCircle size={14} aria-hidden /></span>
);
const thangNam = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
type Tab = 'overview' | 'bot' | 'bop' | 'bom';
const TABS: Tab[] = ['overview', 'bot', 'bop', 'bom'];

// Tỷ đồng: luôn 2 chữ số thập phân — thống nhất với Báo cáo tiến độ
const fmtTy = formatTrieuAsTy;


export const ProjectHealthModal: React.FC<Props> = ({
  isOpen, onClose, projectName, rows, keys, pmText, onOpenHexList, inventory, paceHexes,
}) => {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);
  // Tab đang xem nằm trên địa chỉ (…&mo=<công trình>&tab=bom) — copy link mở đúng tab
  const [sp, setSp] = useSearchParams();
  const [tab, setTab] = useState<Tab>('overview');
  const [bieuDo, setBieuDo] = useState<'luong' | 'nhip'>('luong');
  const [materialMode, setMaterialMode] = useState<MaterialViewMode | null>(null);
  // Bấm 1 HEX ở tab BOM: mở thẳng cửa sổ vật tư của riêng hạng mục đó
  const [materialHex, setMaterialHex] = useState<string | null>(null);
  // Bấm 1 HEX ở BOT / BOP / BOP×BOT / Cần xử lý ngay: mở cửa sổ chi tiết hạng mục (BOP × BOT)
  const [timelineHex, setTimelineHex] = useState<string | null>(null);
  // Tên công trình / PM / PC lấy từ dữ liệu trang (đã gom tên chuẩn), để khớp các view khác
  const timelineNames = useMemo(() => {
    if (!timelineHex) return undefined;
    const r = rows.find(x => String(x[keys.hexKey] ?? '') === timelineHex);
    return { project: projectName, pm: r ? String(r['ten_pm'] ?? '') : undefined, pc: r ? String(r['ten_pc'] ?? '') : undefined };
  }, [timelineHex, rows, keys.hexKey, projectName]);
  const openMaterial = (mode: MaterialViewMode, hex: string | null = null) => { setMaterialHex(hex); setMaterialMode(mode); };
  useEffect(() => {
    if (!isOpen) return;
    const t = sp.get('tab') as Tab | null;
    setTab(t && TABS.includes(t) ? t : 'overview'); setBieuDo('luong');
    setMaterialMode(null); setMaterialHex(null); setTimelineHex(sp.get('hex'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, projectName]);
  useEffect(() => {
    setSp(prev => {
      const p = new URLSearchParams(prev);
      if (isOpen && tab !== 'overview') p.set('tab', tab); else p.delete('tab');
      if (isOpen && timelineHex) p.set('hex', timelineHex); else p.delete('hex');
      return p.toString() === prev.toString() ? prev : p;
    }, { replace: true });
  }, [isOpen, tab, timelineHex, setSp]);

  // ---------- Chuẩn hoá từng hạng mục ----------
  const items = useMemo<HexInfo[]>(() => {
    const out: HexInfo[] = [];
    for (const row of rows) {
      if (isCancelledIpo(row[keys.ipoKey])) continue;
      const total = parseNumber(row[keys.triGiaKey]);
      const nk = parseNumber(row[keys.nhapKhoKey]);
      const remain = remainValue(total, nk);
      const stage = extractStage(row[keys.bopKey]);
      const status = String(row[keys.tinhTrangKey] ?? '').toUpperCase();
      // BOT: CHỈ KH nhập kho tuần → KH nhập kho tháng (quy tắc chung toàn app)
      const dl = deadlineOf(row, keys);
      const { date: deadline, source: deadlineSource, khnkTuan, khnkThang, canGiao } = dl;
      // Chưa xong (đếm / tính hạn) = còn giá trị chưa nhập HOẶC trị giá 0 (chưa có giá), TRỪ hạng mục đã nhập
      // đủ SỐ LƯỢNG (thành tiền NK lệch đơn giá / = 0). Khớp ô "Hạng mục chưa nhập kho" ở Báo cáo tiến độ.
      const open = !isQtyComplete(row) && (remain > 0 || total <= 0);
      const t = deadline?.getTime();
      const bvSt = keys.bvStKey ? String(row[keys.bvStKey] ?? '').trim().toUpperCase() : '';
      const phSt = keys.phieuStKey ? String(row[keys.phieuStKey] ?? '').trim().toUpperCase() : '';
      out.push({
        canPm: dl.canPm,
        botDuAn: dl.botDuAn,
        receivedPm: keys.nhanPmKey ? parsePlanDate(row[keys.nhanPmKey]) : null,
        // "ĐÃ TRIỂN KHAI" / "CHƯA TRIỂN KHAI"; phiếu: "CHƯA PHIẾU" / "CÓ PHIẾU HÀNG LOẠT" / "PHIẾU MẪU"…
        bvDone: bvSt ? bvSt.startsWith('ĐÃ') : null,
        phieuDone: phSt ? !phSt.startsWith('CHƯA') : null,
        hex: String(row[keys.hexKey] ?? ''),
        hangMuc: String(row[keys.hangMucKey] ?? ''),
        stage,
        status: String(row[keys.tinhTrangKey] ?? '').trim(),
        area: String(row[keys.xuongKey] ?? '').trim(),
        dwell: String(row[keys.dwellKey] ?? '').trim() || null,
        // Nhóm phần giá trị còn lại (cả hạng mục đủ SL mà còn lệch tiền — để tổng tiền BOP khớp)
        bucket: open || remain > 0 ? remainBucketOf(status, stage) : null,
        open,
        total,
        inv: doneValue(total, nk),
        remain,
        deadline,
        deadlineSource,
        khnkTuan,
        khnkThang,
        canGiao,
        khnkTuanMet: dl.tuanMet,
        khnkThangMet: dl.thangMet,
        planAfterDue: open && planAfterDue(dl),
        overdue: open && t !== undefined && t < today,
        dueSoon: open && t !== undefined && t >= today && t - today <= DUE_SOON_DAYS * DAY,
      });
    }
    return out;
  }, [rows, keys, today]);

  const hexList = useMemo(() => [...new Set(items.map(i => i.hex).filter(Boolean))], [items]);
  const hangMucByHex = useMemo(() => {
    const m: Record<string, string> = {};
    items.forEach(i => { if (i.hex && !m[i.hex]) m[i.hex] = i.hangMuc; });
    return m;
  }, [items]);

  // Thông tin cấp công trình: BOT dự án (1 ngày chung cho cả công trình), tình trạng dự án, nhóm CT, PC
  const meta = useMemo(() => {
    const str = (k?: string) => (k ? rows.map(r => String(r[k] ?? '').trim()) : []);
    const botDates = items.map(i => i.botDuAn).filter((d): d is Date => !!d);
    // Khoá ngày theo giờ ĐỊA PHƯƠNG (toISOString đổi sang UTC => ở +7 lùi 1 ngày: BOT 30/10 hiện 29/10)
    const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const bot = botDates.length ? parsePlanDate(modeOf(botDates.map(dayKey))) : null;
    const pcs = [...new Set(str('ten_pc').filter(Boolean))];
    return {
      botDuAn: bot,
      tinhTrangDuAn: modeOf(str(keys.tinhTrangDaKey)),
      nhomCt: modeOf(str(keys.nhomCtKey)),
      pc: pcs.slice(0, 3).join(', ') + (pcs.length > 3 ? ` +${pcs.length - 3}` : ''),
    };
  }, [rows, items, keys.tinhTrangDaKey, keys.nhomCtKey]);

  // Thông tin thêm theo HEX (SL theo công đoạn SX, QC, gia công ngoài) — tải khi mở
  const [extra, setExtra] = useState<Record<string, HexExtra> | null>(null);
  useEffect(() => {
    setExtra(null);
    if (!isOpen || hexList.length === 0) return;
    const ctrl = new AbortController();
    fetchHexExtra(hexList, ctrl.signal).then(setExtra).catch(() => { if (!ctrl.signal.aborted) setExtra({}); });
    return () => ctrl.abort();
  }, [isOpen, hexList]);

  // Nhịp nhập kho theo tuần (bảng nhập kho, các HEX của công trình) + dự báo theo nhịp PACE_WEEKS tuần gần nhất
  const weekly = useMemo(() => {
    if (!inventory || !isOpen || hexList.length === 0) return null;
    // Nhịp tính trên MỌI hạng mục không hủy của công trình (paceHexes), không theo bộ lọc IPO của trang: hạng mục
    // vừa nhập đủ đã sang "02. HOÀN THÀNH" — chính là sản lượng đã ra (trước bị loại => nhịp thấp 40–60%)
    const hexSet = new Set(paceHexes?.length ? paceHexes : hexList);
    const curWeek = weekStart(today);
    const firstWeek = curWeek - (WEEKS_SHOWN - 1) * 7 * DAY;
    const sums = new Map<number, { value: number; hexes: Set<string> }>();
    for (let w = firstWeek; w <= curWeek; w += 7 * DAY) sums.set(w, { value: 0, hexes: new Set() });
    for (const r of inventory) {
      const h = String(r['hex'] ?? '').trim();
      if (!hexSet.has(h)) continue;
      const d = parsePlanDate(r['date']);
      if (!d) continue;
      const w = weekStart(d.getTime());
      const e = sums.get(w);
      if (!e) continue;
      e.value += Math.max(parseNumber(r['thanh_tien_nhap_kho']), 0);
      e.hexes.add(h);
    }
    const weeks = [...sums.entries()].map(([start, e]) => ({ start, value: e.value, hexes: e.hexes.size }));
    // Nhịp = trung bình PACE_WEEKS tuần ĐÃ QUA (không tính tuần hiện tại đang dở)
    const past = weeks.filter(w => w.start < curWeek).slice(-PACE_WEEKS);
    const pace = past.length ? past.reduce((s, w) => s + w.value, 0) / past.length : 0;
    const chart = weeks.map(w => {
      const d = new Date(w.start);
      return { ...w, cur: w.start === curWeek, label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, full: fmtDate(d) };
    });
    return { weeks, chart, pace, paceWeeks: past.length };
  }, [inventory, isOpen, hexList, paceHexes, today]);

  // ---------- Dữ liệu BOM + vướng mắc (gọi API khi mở) ----------
  const [matCount, setMatCount] = useState<Record<string, number> | null>(null);
  const [materialLines, setMaterialLines] = useState<MaterialLine[] | null>(null);
  // Vật tư chung của công trình: PR không ghi mã nhà máy (không gắn được hạng mục) + dòng ghi sai mã
  const [projectLines, setProjectLines] = useState<ProjectMaterialLine[] | null>(null);
  // Định mức + tình trạng NVL theo hạng mục (bảng sản xuất)
  const [nvlByHex, setNvlByHex] = useState<Record<string, NvlRaw> | null>(null);
  const [openIssues, setOpenIssues] = useState<Record<string, number> | null>(null);
  // Vướng mắc M3 (Vật tư) chưa xử lý theo hex — dùng cho BOM
  const [materialIssues, setMaterialIssues] = useState<Record<string, VuongMacItem[]> | null>(null);
  // Loại vướng mắc đang mở theo hex (M1..M5) — hiện trong cột "Vấn đề"
  const [issueCats, setIssueCats] = useState<Record<string, Partial<Record<FiveMCategory, number>>>>({});
  const [openIssueList, setOpenIssueList] = useState<Record<string, VuongMacItem[]>>({});

  useEffect(() => {
    setMatCount(null); setMaterialLines(null); setProjectLines(null); setNvlByHex(null); setOpenIssues(null); setMaterialIssues(null);
    if (!isOpen || hexList.length === 0) return;
    const ctrl = new AbortController();
    const token = getToken() ?? '';
    const post = (mode: string) => fetch('/api/material/by-hex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ hexes: hexList, mode }),
      signal: ctrl.signal,
    }).then(r => (r.ok ? r.json() : null));

    post('hex-counts').then(d => setMatCount(d ?? {})).catch(() => {});
    post('matched').then(d => {
      const list: MaterialLine[] = (d?.rows ?? []).map((r: MaterialLine) => ({
        hexes: Array.isArray(r.hexes) ? r.hexes : [],
        so_luong_con_lai: r.so_luong_con_lai, so_luong_yeu_cau: r.so_luong_yeu_cau,
        trang_thai: r.trang_thai, trang_thai_sap: r.trang_thai_sap, sl_hang_ve_thuc_te: r.sl_hang_ve_thuc_te,
        ngay_du_kien_giao_hang_pmh_nhap: r.ngay_du_kien_giao_hang_pmh_nhap, ngay_can_vat_tu: r.ngay_can_vat_tu,
        ngay_pr: r.ngay_pr, ngay_thuc_te_ve: r.ngay_thuc_te_ve,
        team_pr_note: r.team_pr_note, tinh_trang_po: r.tinh_trang_po, ghi_chu_tinh_trang_po: r.ghi_chu_tinh_trang_po,
        // Cần cho phân loại 2 cấp: gia công ngoài (nhóm 806), Đóng PR (đã nhận 1 phần / có PO chưa nhận / không PO)
        nhom_vt: r.nhom_vt, so_luong_da_nhan_sap: r.so_luong_da_nhan_sap, so_po: r.so_po,
      }));
      setMaterialLines(list);
    }).catch(() => {});
    post('project-uncoded').then(d => setProjectLines(d?.rows ?? [])).catch(() => {});
    post('nvl').then(d => setNvlByHex(d ?? {})).catch(() => {});
    fetchVuongMacList(hexList).then(map => {
      const o: Record<string, number> = {};
      const m3: Record<string, VuongMacItem[]> = {};
      const catMap: Record<string, Partial<Record<FiveMCategory, number>>> = {};
      const openMap: Record<string, VuongMacItem[]> = {};
      Object.entries(map).forEach(([h, list]) => {
        const open = list.filter(v => !v.isResolved);
        o[h] = open.length;
        if (open.length) openMap[h] = open;
        const cats: Partial<Record<FiveMCategory, number>> = {};
        open.forEach(v => { cats[v.category] = (cats[v.category] ?? 0) + 1; });
        catMap[h] = cats;
        const mat = open.filter(v => v.category === 'material');
        if (mat.length) m3[h] = mat;
      });
      setOpenIssues(o);
      setMaterialIssues(m3);
      setIssueCats(catMap);
      setOpenIssueList(openMap);
    }).catch(() => { setOpenIssues({}); setMaterialIssues({}); setIssueCats({}); });
    return () => ctrl.abort();
  }, [isOpen, hexList]);

  // ---------- Tổng hợp ----------
  // Thời hạn: 6 nhóm chung (core/chiSoCongTrinh.ts) — cùng số với tab BOT và trang Báo cáo tiến độ
  const bot = useMemo(() => {
    const c = Object.fromEntries(NHOM_BOT.map(g => [g.key, { n: 0, remain: 0 }])) as Record<NhomBot, { n: number; remain: number }>;
    let open = 0, planAfterDue = 0;
    for (const i of items) {
      const g = nhomBotHex(i, today);
      if (!g) continue;
      open++; c[g].n++; c[g].remain += i.remain;
      if (i.planAfterDue) planAfterDue++;
    }
    return { ...c, open, planAfterDue };
  }, [items, today]);

  const bop = useMemo(() => {
    const total = items.reduce((s, i) => s + i.total, 0);
    const remain: Record<RemainBucket, number> = { notDeployed: 0, p002: 0, onLine: 0, shortfall: 0 };
    items.forEach(i => { if (i.bucket) remain[i.bucket] += i.remain; });
    const remainSum = Object.values(remain).reduce((s, v) => s + v, 0);
    return { total, remain, remainSum, done: Math.max(total - remainSum, 0), stockedItems: items.filter(i => !i.open).length };
  }, [items]);

  // Dự báo: còn lại / nhịp => số tuần cần; so với BOT dự án; nhịp cần có để kịp BOT dự án
  const forecast = useMemo(() => {
    if (!weekly) return null;
    const remain = bop.remainSum;
    const weeksNeeded = weekly.pace > 0 ? remain / weekly.pace : null;
    const finish = weeksNeeded !== null ? new Date(today + Math.ceil(weeksNeeded) * 7 * DAY) : null;
    const bot = meta.botDuAn;
    const weeksLeft = bot ? Math.max((bot.getTime() - today) / (7 * DAY), 0) : null;
    const needPace = weeksLeft !== null && weeksLeft > 0 ? remain / weeksLeft : null;
    const lateWeeks = finish && bot ? Math.ceil((finish.getTime() - bot.getTime()) / (7 * DAY)) : null;
    return { remain, weeksNeeded, finish, weeksLeft, needPace, lateWeeks };
  }, [weekly, bop.remainSum, meta.botDuAn, today]);

  // Luồng tiến độ: Nhận PM → Đã triển khai BV → Có phiếu → Lên chuyền → Nhập kho đủ (số hạng mục · trị giá)
  const funnel = useMemo(() => {
    const p013 = stageRank('P013');
    // Công đoạn trống / lạ (rank 999) không tính là đã vào sản xuất
    const onLine = (i: HexInfo) => !i.open || (!!i.stage && stageRank(i.stage) !== 999 && stageRank(i.stage) >= p013);
    const hasBv = items.some(i => i.bvDone !== null && i.bvDone !== undefined);
    const hasPh = items.some(i => i.phieuDone !== null && i.phieuDone !== undefined);
    const step = (label: string, pred: (i: HexInfo) => boolean, has = true, hint = '') => {
      const list = has ? items.filter(pred) : [];
      return { label, n: has ? list.length : null, value: list.reduce((s, i) => s + i.total, 0), hint };
    };
    return [
      step('Nhận từ PM', () => true, true, 'Mọi hạng mục của công trình (không tính đơn hủy)'),
      step('Đã triển khai BV', i => !!i.bvDone || onLine(i), hasBv, 'Tình trạng triển khai bản vẽ = ĐÃ TRIỂN KHAI (hoặc đã lên chuyền / nhập kho)'),
      step('Có phiếu SX', i => !!i.phieuDone || onLine(i), hasPh, 'Tình trạng phiếu ≠ CHƯA PHIẾU (hoặc đã lên chuyền / nhập kho)'),
      step('Vào sản xuất', onLine, true, 'Công đoạn từ P013 trở đi (đã bắt đầu gia công), hoặc đã nhập kho đủ — khác nhóm "Đang trên chuyền" của thẻ BOP (tính từ P012 có phiếu chưa SX)'),
      step('Nhập kho đủ', i => !i.open, true, 'Đã nhập đủ trị giá hoặc đủ số lượng đơn hàng'),
    ];
  }, [items]);

  // Phân tích vật tư theo trạng thái dòng PR (dùng chung với tab BOM)
  const bomDetail = useMemo(
    () => analyzeBom(items, matCount, materialLines, today, materialIssues, nvlByHex),
    [items, matCount, materialLines, today, materialIssues, nvlByHex]
  );
  // Số hạng mục chưa nhập kho đủ có ≥ 1 dòng PR ở nhóm đó — đếm theo TỪNG DÒNG (byLine), không theo trạng thái
  // xấu nhất: hạng mục vừa có VT chưa mua vừa có VT trễ hẹn trước bị bỏ khỏi số "trễ hẹn" (CT24-066: 213 thay vì 225)
  const bomLineHexes = useMemo(() => {
    const out = { late: 0, deferred: 0, outsourced: 0 };
    if (!bomDetail) return out;
    const seen = new Set<string>();
    for (const i of items) {
      if (!i.open || seen.has(i.hex)) continue;
      seen.add(i.hex);
      const b = bomDetail.byHex[i.hex]?.byLine;
      if ((b?.late ?? 0) > 0) out.late++;
      if ((b?.deferred ?? 0) > 0) out.deferred++;
      if ((b?.outsourced ?? 0) + (b?.gcNotOrdered ?? 0) > 0) out.outsourced++;
    }
    return out;
  }, [bomDetail, items]);

  const projectMat = useMemo(() => summarizeProjectMaterial(projectLines, today), [projectLines, today]);

  const bom = useMemo(() => {
    if (!matCount) return null;
    // Có PR ghi mã (không tính hạng mục chỉ có dòng PR đã hủy) — cùng cách tính với tab BOM
    const withMat = hexList.filter(h => (bomDetail?.byHex[h]?.lines ?? matCount[h] ?? 0) > 0).length;
    return { withMat, without: hexList.length - withMat };
  }, [matCount, hexList, bomDetail]);

  const openIssueTotal = useMemo(
    () => (openIssues ? Object.values(openIssues).reduce((s, n) => s + n, 0) : null),
    [openIssues]
  );
  // Gia công ngoài còn chờ NCC (hạng mục chưa nhập kho đủ)
  const gcnPending = useMemo(
    () => (extra ? items.filter(i => i.open && extra[i.hex]?.gcn && isGcnPending(extra[i.hex]!.gcn!.st)).length : 0),
    [extra, items]
  );

  // ---------- Vấn đề của 1 hạng mục (dùng chung cho "Cần xử lý ngay" và "Chú ý") ----------
  const flagsOf = (i: HexInfo): string[] => {
    const flags: string[] = [];
    if (i.bucket === 'notDeployed' || i.bucket === 'p002') flags.push(BUCKET_LABEL[i.bucket]);
    // Cùng nhóm đỏ của tab BOM: đã triển khai nhưng chưa sản xuất (P002 / P012), không có PR ghi mã và
    // bảng sản xuất không ghi tình trạng mua đã về đủ. P001 (đã có cờ "Chưa triển khai") và hạng mục đã
    // lên chuyền (vật tư mua gộp / tồn kho) không gắn cờ này.
    const b = bomDetail?.byHex[i.hex];
    const mat = b?.state;
    if (mat === 'noneBeforeSx') flags.push('Đã triển khai, chưa SX – chưa thấy PR');
    // KH nhập kho đang dùng muộn hơn ngày cần giao: biết trước sẽ giao trễ
    if (i.planAfterDue) flags.push('KH NK sau ngày cần giao');
    // Xét theo TỪNG DÒNG PR (byLine) chứ không chỉ trạng thái "xấu nhất" của hạng mục: hạng mục vừa có dòng
    // chưa mua vừa có dòng trễ hẹn thì hiện cả 2 cờ (trước chỉ hiện "Có VT chưa mua", cờ trễ hẹn bị che)
    if (mat && mat !== 'stocked') {
      if ((b?.byLine.notOrdered ?? 0) > 0) flags.push('VT chưa mua');
      if ((b?.byLine.late ?? 0) > 0) flags.push('VT đang mua – trễ hẹn');
      if ((b?.byLine.outsourced ?? 0) + (b?.byLine.gcNotOrdered ?? 0) > 0) flags.push('Gia công ngoài chưa về');
    }
    // Vướng mắc đang mở, ghi rõ loại (vd. "Vướng mắc M3 Vật tư ×2")
    if (openIssues && (openIssues[i.hex] || 0) > 0) {
      const cats = issueCats[i.hex] ?? {};
      FIVE_M_CATEGORIES.forEach((c, idx) => {
        const n = cats[c] ?? 0;
        if (n > 0) flags.push(`Vướng mắc M${idx + 1} ${FIVE_M_VI[c]}${n > 1 ? ` ×${n}` : ''}`);
      });
    }
    return flags;
  };

  // Cần xử lý ngay: quá hạn / sắp hạn VÀ có thêm ít nhất 1 vấn đề
  const urgent = useMemo(() => {
    const res: (HexInfo & { flags: string[] })[] = [];
    for (const i of items) {
      if (!i.open || !(i.overdue || i.dueSoon)) continue;
      const flags = flagsOf(i);
      if (flags.length === 0) continue;
      res.push({ ...i, flags });
    }
    return res.sort((a, b) =>
      Number(b.overdue) - Number(a.overdue)
      || b.flags.length - a.flags.length
      || (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, matCount, openIssues, issueCats, bomDetail]);

  // Chú ý: hạng mục chưa nhập kho đủ mà KHÔNG có BOT (không có KH nhập kho tuần / tháng)
  const noBot = useMemo(() => {
    const res: (HexInfo & { flags: string[] })[] = [];
    for (const i of items) {
      if (!i.open || i.deadline) continue;
      res.push({ ...i, flags: flagsOf(i) });
    }
    return res.sort((a, b) =>
      stageRank(a.stage) - stageRank(b.stage) || b.remain - a.remain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, matCount, openIssues, issueCats, bomDetail]);
  // Còn lại: hạng mục chưa nhập kho đủ, CÓ BOT nhưng không thuộc "Cần xử lý ngay"
  // (còn xa hạn, hoặc quá hạn / sắp hạn mà không vướng vấn đề nào). Sắp theo hạn gần nhất.
  const rest = useMemo(() => {
    const inUrgent = new Set(urgent.map(i => i.hex));
    const res: (HexInfo & { flags: string[] })[] = [];
    for (const i of items) {
      if (!i.open || !i.deadline || inUrgent.has(i.hex)) continue;
      res.push({ ...i, flags: flagsOf(i) });
    }
    return res.sort((a, b) => (a.deadline!.getTime() - b.deadline!.getTime()) || b.remain - a.remain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, urgent, matCount, openIssues, issueCats, bomDetail]);
  const [listTab, setListTab] = useState<'urgent' | 'noBot' | 'rest'>('urgent');
  useEffect(() => { if (isOpen) setListTab('urgent'); }, [isOpen, projectName]);
  const shownList = listTab === 'urgent' ? urgent : listTab === 'noBot' ? noBot : rest;

  const donePct = bop.total > 0 ? (bop.done / bop.total) * 100 : 0;
  const coverPct = bom && hexList.length ? (bom.withMat / hexList.length) * 100 : 0;
  const card = 'rounded-2xl border border-slate-200 bg-white';
  const veTab = (t: Tab) => () => setTab(t);

  // Thẻ số liệu: bấm chuyển sang tab / khung chi tiết của con số
  const The = ({ label, hint, value, unit, sub, tone = 'text-slate-900', onClick, children }: {
    label: string; hint: string; value: string; unit?: string; sub?: string; tone?: string; onClick: () => void; children?: React.ReactNode;
  }) => (
    <button type="button" onClick={onClick}
      className={`${card} group p-4 text-left transition hover:border-slate-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400`}>
      <p className="flex items-center gap-1.5 text-sm text-slate-600">
        {label}<GiaiThich text={hint} />
        <ChevronRight size={15} className="ml-auto text-slate-300 group-hover:text-slate-600" aria-hidden />
      </p>
      <p className={`mt-1 text-[1.625rem] font-bold leading-tight tabular-nums ${tone}`}>
        {value}{unit && <span className="ml-1.5 text-sm font-medium text-slate-400">{unit}</span>}
      </p>
      {children}
      {sub && <p className="mt-1.5 text-base text-slate-700">{sub}</p>}
    </button>
  );

  // "Cần chú ý": CHỈ việc cần làm (không có dòng "ổn" / số 0); bấm chuyển tới chỗ xem chi tiết
  const kipBot = !!(weekly && forecast && forecast.remain > 0 && forecast.needPace !== null && forecast.needPace > weekly.pace);
  const chuY = ([
    bot.quaHan.n > 0 && { k: 'qh', t: `${fmtInt(bot.quaHan.n)} hạng mục quá hạn KH nhập kho`, p: `${fmtTy(bot.quaHan.remain)} tỷ chưa nhập kho`, b: 'Trễ', c: 'bg-red-50 text-red-700', go: veTab('bot') },
    kipBot && { k: 'kip', t: `Cần ${fmtTy(forecast!.needPace!)} tỷ/tuần để kịp BOT dự án`, p: `đang nhập ${fmtTy(weekly!.pace)} tỷ/tuần · còn ${forecast!.weeksLeft!.toFixed(0)} tuần`, b: 'Không kịp', c: 'bg-red-50 text-red-700', go: () => setBieuDo('nhip') },
    bot.chuaCoKh.n > 0 && { k: 'kh', t: `${fmtInt(bot.chuaCoKh.n)} hạng mục chưa có KH nhập kho`, p: `${bot.open ? Math.round((bot.chuaCoKh.n / bot.open) * 100) : 0}% hạng mục chưa nhập kho đủ · không theo dõi được trễ hạn`, b: 'Thiếu KH', c: 'bg-amber-50 text-amber-800', go: veTab('bot') },
    !!bomDetail && bomDetail.counts.notOrdered > 0 && { k: 'vt', t: `${fmtInt(bomDetail!.counts.notOrdered)} hạng mục có vật tư chưa mua`, p: `${fmtInt(bomLineHexes.late)} hạng mục có dòng đang mua trễ hẹn`, b: 'Vật tư', c: 'bg-amber-50 text-amber-800', go: veTab('bom') },
    !!bomDetail && bomDetail.afterNeed > 0 && { k: 'vtSau', t: `${fmtInt(bomDetail!.afterNeed)} hạng mục vật tư về sau ngày cần`, p: 'ảnh hưởng hạn nhập kho', b: 'Lệch hạn', c: 'bg-amber-50 text-amber-800', go: veTab('bom') },
    bot.planAfterDue > 0 && { k: 'sauGiao', t: `${fmtInt(bot.planAfterDue)} hạng mục KH nhập kho sau ngày cần giao`, p: 'biết trước sẽ giao trễ — xem lại KH hoặc báo PM', b: 'Lệch hạn', c: 'bg-amber-50 text-amber-800', go: veTab('bot') },
    !!openIssueTotal && { k: 'vm', t: `${fmtInt(openIssueTotal!)} vướng mắc đang mở`, p: bomDetail?.issueTotal ? `${fmtInt(bomDetail.issueTotal)} vướng mắc vật tư (M3)` : 'xem cột Vấn đề trong danh sách', b: 'Vướng mắc', c: 'bg-red-50 text-red-700', go: () => setListTab('urgent') },
    gcnPending > 0 && { k: 'gcn', t: `${fmtInt(gcnPending)} hạng mục gia công ngoài còn chờ NCC`, p: 'theo tình trạng GCN ở bảng sản xuất', b: 'GCN', c: 'bg-fuchsia-50 text-fuchsia-700', go: veTab('bop') },
    !!projectMat && projectMat.byState.notOrdered + projectMat.byState.late > 0 && { k: 'vtChung', t: `Vật tư chung công trình: ${[projectMat!.byState.notOrdered > 0 && `${fmtInt(projectMat!.byState.notOrdered)} dòng chưa mua`, projectMat!.byState.late > 0 && `${fmtInt(projectMat!.byState.late)} dòng trễ hẹn`].filter(Boolean).join(' · ')}`, p: 'PR không ghi mã nhà máy — cần bổ sung mã để gắn hạng mục', b: 'Thiếu mã', c: 'bg-amber-50 text-amber-800', go: veTab('bom') },
  ].filter(Boolean)) as Array<{ k: string; t: string; p: string; b: string; c: string; go: () => void }>;
  const dangTai = bomDetail === null || openIssues === null;

  // Khoảng rơi lớn nhất giữa 2 bước liên tiếp của luồng tiến độ
  const roiNhat = funnel.reduce<{ tu: string; den: string; n: number } | null>((m, f, idx) => {
    const truoc = funnel[idx - 1];
    if (!truoc || truoc.n === null || f.n === null) return m;
    const n = truoc.n - f.n;
    return n > (m?.n ?? 0) ? { tu: truoc.label, den: f.label, n } : m;
  }, null);
  const MAU_BUOC = ['bg-slate-500', 'bg-sky-400', 'bg-blue-500', 'bg-amber-500', 'bg-emerald-600'];

  return (
    <ModalShell
      open={isOpen}
      // Chỉ đóng bằng nút X (không đóng khi bấm nền / Esc)
      onClose={onClose}
      labelledBy="health-title"
      overlayClassName="fixed inset-0 z-[9992] flex items-center justify-center bg-slate-900/50 p-4"
      panelClassName="w-[97vw] h-[95vh] flex flex-col overflow-hidden rounded-2xl bg-wood-50 shadow-2xl outline-none"
    >
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Tổng quan công trình</p>
            <h3 id="health-title" className="truncate text-xl font-semibold text-slate-900">{projectName}</h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-slate-500">
              <span>{pmText ? `PM ${pmText} · ` : ''}{meta.pc ? `PC ${meta.pc} · ` : ''}{fmtInt(hexList.length)} hạng mục · {fmtTy(bop.total)} tỷ</span>
              <GiaiThich text="Không tính đơn hủy, theo bộ lọc của trang Báo cáo tiến độ" />
              {meta.nhomCt && <span>· Nhóm: {meta.nhomCt}</span>}
              {meta.tinhTrangDuAn && <span>· Dự án: {meta.tinhTrangDuAn}</span>}
              {meta.botDuAn && (() => {
                const left = Math.floor((meta.botDuAn.getTime() - today) / DAY);
                const c = bot.open === 0 ? 'bg-emerald-50 text-emerald-700' : left < 0 ? 'bg-red-50 text-red-700' : left <= 30 ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700';
                return (
                  <span className={`ml-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${c}`}
                    title="BOT dự án: hạn chung của công trình (tham khảo, không tính hạn từng hạng mục)">
                    <i className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                    BOT dự án {fmtDate(meta.botDuAn)}{bot.open === 0 ? ' · đã nhập kho đủ' : left < 0 ? ` · đã quá ${-left} ngày, còn ${fmtInt(bot.open)} mục` : ` · còn ${left} ngày`}
                  </span>
                );
              })()}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={onOpenHexList}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800">
              Danh sách HEX <ArrowRight size={15} aria-hidden />
            </button>
            <button type="button" onClick={onClose} aria-label="Đóng" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
              <X size={18} />
            </button>
          </div>
        </div>
        {/* Thanh tab luôn hiện (trước phải bấm thẻ mới vào được tab) — số cảnh báo ngay trên tab */}
        <div className="mt-3 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
          {([
            ['overview', 'Tổng quan', null],
            ['bot', 'BOT · Thời hạn', bot.quaHan.n > 0 ? { n: `${fmtInt(bot.quaHan.n)} quá hạn`, c: 'bg-red-50 text-red-700' } : null],
            ['bop', 'BOP · Công đoạn', null],
            ['bom', 'BOM · Vật tư', bomDetail && bomDetail.counts.notOrdered > 0 ? { n: `${fmtInt(bomDetail.counts.notOrdered)} chưa mua`, c: 'bg-amber-50 text-amber-800' } : null],
          ] as const).map(([k, label, badge]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition ${tab === k ? 'border-slate-900 font-semibold text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>
              {label}
              {badge && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.c}`}>{badge.n}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6 custom-scrollbar">
        {tab === 'bot' && <BotTab items={items} today={today} openIssues={openIssues} onHexClick={setTimelineHex} />}
        {tab === 'bop' && <BopTab items={items} onHexClick={setTimelineHex} extra={extra} today={today} />}
        {tab === 'bom' && (
          <BomTab
            items={items}
            matCount={matCount}
            materialLines={materialLines}
            projectLines={projectLines}
            nvlByHex={nvlByHex}
            projectTag={projectName.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40)}
            onOpenMaterial={mode => openMaterial(mode)}
            onOpenHex={hex => openMaterial('matched', hex)}
            today={today}
            materialIssues={materialIssues}
          />
        )}
        {tab === 'overview' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <The label="Đã nhập kho" hint="Giá trị đã nhập kho / tổng trị giá đơn hàng của công trình (không tính đơn hủy)."
                value={`${donePct.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`} unit={`${fmtTy(bop.done)} / ${fmtTy(bop.total)} tỷ`} tone="text-emerald-700"
                sub={`${fmtInt(bop.stockedItems)} hạng mục nhập đủ · còn ${fmtTy(bop.remainSum)} tỷ`} onClick={veTab('bop')}>
                <span className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-amber-400" aria-hidden><i className="bg-emerald-600" style={{ width: `${donePct}%` }} /></span>
              </The>
              <The label="Quá hạn KH nhập kho" hint={NHOM_BOT[0].giaiThich} value={fmtInt(bot.quaHan.n)} unit="mục"
                tone={bot.quaHan.n ? 'text-red-600' : 'text-slate-900'}
                sub={`${fmtTy(bot.quaHan.remain)} tỷ chưa nhập · ${fmtInt(bot.den14.n)} mục đến hạn ≤ 14 ngày`} onClick={veTab('bot')} />
              <The label="Ước xong theo nhịp" hint="Phần còn chưa nhập kho ÷ nhịp nhập kho trung bình các tuần gần nhất — ước tính thô, giả định nhịp không đổi."
                value={!weekly || !forecast ? '…' : forecast.remain <= 0 ? 'Đã xong' : forecast.finish ? thangNam(forecast.finish) : 'Không ước được'}
                tone={forecast?.lateWeeks && forecast.lateWeeks > 0 ? 'text-red-600' : 'text-slate-900'}
                sub={!weekly ? (inventory && inventory.length > 0 ? 'chưa có bảng nhập kho' : 'đang tải bảng nhập kho…')
                  : `nhịp ${fmtTy(weekly.pace)} tỷ/tuần (${weekly.paceWeeks} tuần)${forecast?.lateWeeks && forecast.lateWeeks > 0 ? ` · trễ ~${forecast.lateWeeks} tuần so với BOT dự án` : ''}`}
                onClick={() => setBieuDo('nhip')} />
              <The label="Vật tư" hint="Hạng mục có ít nhất 1 dòng PR ghi mã nhà máy của nó. Hạng mục còn lại: vật tư có thể ở PR chung công trình (không mã), lấy từ tồn kho, hoặc chưa lên PR."
                value={bom ? `${coverPct.toFixed(0)}%` : '…'} unit="hạng mục có PR ghi mã"
                tone={!bom ? 'text-slate-900' : coverPct >= 80 ? 'text-emerald-700' : coverPct >= 40 ? 'text-amber-600' : 'text-red-600'}
                sub={bomDetail ? `${fmtInt(bomDetail.counts.notOrdered)} HM có dòng chưa mua · ${fmtInt(bomLineHexes.late)} HM có dòng trễ hẹn` : 'đang kiểm tra vật tư…'}
                onClick={veTab('bom')} />
            </div>

            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="min-w-0 space-y-4">
              <div className={`${card} p-5`}>
                <div className="flex flex-wrap items-center gap-3">
                  <h4 className="flex items-center gap-1.5 text-lg font-semibold text-slate-900">
                    {bieuDo === 'luong' ? 'Luồng tiến độ' : `Nhịp nhập kho ${WEEKS_SHOWN} tuần`}
                    <GiaiThich text={bieuDo === 'luong'
                      ? 'Số hạng mục đã qua từng bước (theo cột tình trạng triển khai bản vẽ / phiếu ở bảng sản xuất; hạng mục đã vào sản xuất tính là đã qua). % so với tổng hạng mục.'
                      : 'Giá trị nhập kho theo tuần (bảng nhập kho, mọi hạng mục không hủy của công trình). Tuần hiện tại đang dở (nhạt); vạch đứt = nhịp trung bình.'} />
                  </h4>
                  <div className="ml-auto flex rounded-lg bg-slate-100 p-1" role="tablist">
                    {([['luong', 'Luồng tiến độ'], ['nhip', `Nhịp nhập kho ${WEEKS_SHOWN} tuần`]] as const).map(([k, l]) => (
                      <button key={k} type="button" role="tab" aria-selected={bieuDo === k} onClick={() => setBieuDo(k)}
                        className={`rounded-md px-3 py-1 text-sm ${bieuDo === k ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{l}</button>
                    ))}
                  </div>
                </div>
                {bieuDo === 'luong' ? (
                  <>
                    <div className="mt-5 space-y-3">
                      {funnel.map((f, idx) => {
                        const base = funnel[0].n || 1;
                        const pct = f.n === null ? 0 : (f.n / base) * 100;
                        return (
                          <div key={f.label} className="grid grid-cols-[9.5rem_minmax(0,1fr)_11rem] items-center gap-3 text-sm" title={f.hint}>
                            <span className="truncate text-slate-700">{f.label}</span>
                            <div className="h-6 overflow-hidden rounded-md bg-slate-100">
                              {f.n !== null && <div className={`h-full rounded-md ${MAU_BUOC[idx] ?? 'bg-slate-400'}`} style={{ width: `${Math.max(pct, f.n > 0 ? 1.5 : 0)}%` }} />}
                            </div>
                            <span className="whitespace-nowrap text-right tabular-nums">
                              {f.n === null ? <span className="text-slate-400">chưa có cột</span> : <>
                                <b className="font-semibold text-slate-900">{fmtInt(f.n)}</b>
                                <span className="ml-1.5 text-xs text-slate-500">{pct.toFixed(0)}% · {fmtTy(f.value)} tỷ</span>
                              </>}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {roiNhat && (
                      <p className="mt-4 text-sm text-slate-600">
                        Khoảng rơi lớn nhất: <b className="font-semibold text-slate-900">{roiNhat.tu} → {roiNhat.den}</b> ({fmtInt(roiNhat.n)} hạng mục).
                      </p>
                    )}
                  </>
                ) : !weekly ? (
                  <p className="py-10 text-center text-sm text-slate-400">
                    {inventory && inventory.length > 0 ? 'Chưa có bảng nhập kho để tính nhịp.' : 'Đang tải bảng nhập kho để tính nhịp…'}
                  </p>
                ) : (
                  <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={weekly.chart} margin={{ top: 14, right: 6, left: -18, bottom: 0 }} barCategoryGap="22%">
                          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={0} />
                          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatTrieuAsTy(v)} width={48} />
                          <Tooltip
                            cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                            labelFormatter={(_l: unknown, p: any[]) => (p?.[0]?.payload ? `Tuần từ ${p[0].payload.full}${p[0].payload.cur ? ' (đang dở)' : ''}` : '')}
                            formatter={(v: number, _n: string, p: any) => [`${formatTrieuAsTy(v)} tỷ · ${p.payload.hexes} hạng mục`, 'Nhập kho']}
                          />
                          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                            {weekly.chart.map(w => <Cell key={w.start} fill={w.cur ? '#a7f3d0' : '#12805c'} />)}
                          </Bar>
                          {weekly.pace > 0 && (
                            <ReferenceLine y={weekly.pace} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 3" ifOverflow="extendDomain" />
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    {forecast && (
                      <dl className="divide-y divide-slate-100 text-sm">
                        <div className="flex justify-between py-2"><dt className="text-slate-500">Nhịp TB {weekly.paceWeeks} tuần qua</dt><dd className="font-semibold tabular-nums text-slate-900">{fmtTy(weekly.pace)} tỷ/tuần</dd></div>
                        <div className="flex justify-between py-2"><dt className="text-slate-500">Còn chưa nhập kho</dt><dd className="tabular-nums text-amber-700">{fmtTy(forecast.remain)} tỷ</dd></div>
                        {forecast.remain > 0 && (
                          <div className="flex justify-between py-2"><dt className="text-slate-500">Ước xong theo nhịp</dt>
                            <dd className={`text-right font-semibold tabular-nums ${forecast.lateWeeks !== null && forecast.lateWeeks > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                              {forecast.finish ? <>{fmtDate(forecast.finish)}<span className="block text-xs font-normal text-slate-400">~{Math.ceil(forecast.weeksNeeded!)} tuần</span></> : 'không ước được'}
                            </dd></div>
                        )}
                        {forecast.remain > 0 && forecast.weeksLeft !== null && (
                          <div className="flex justify-between py-2"><dt className="text-slate-500">Cần để kịp BOT dự án<span className="block text-xs text-slate-400">còn {forecast.weeksLeft.toFixed(0)} tuần</span></dt>
                            <dd className={`text-right tabular-nums ${forecast.needPace !== null && forecast.needPace > weekly.pace ? 'font-semibold text-red-600' : 'text-emerald-700'}`}>
                              {forecast.needPace === null ? 'đã qua BOT' : `${fmtTy(forecast.needPace)} tỷ/tuần`}
                            </dd></div>
                        )}
                      </dl>
                    )}
                  </div>
                )}
              </div>

              {/* Hạng mục cần xử lý: Cần xử lý ngay · Chưa có KH · Còn lại */}
              <div className={`${card} overflow-hidden`}>
                <div className="flex flex-wrap items-center gap-2 px-5 py-4">
                  <h4 className="mr-2 text-lg font-semibold text-slate-900">Hạng mục cần xử lý</h4>
                  {([
                    ['urgent', 'Cần xử lý ngay', urgent.length, `Quá hạn hoặc đến hạn ≤ ${DUE_SOON_DAYS} ngày (KH nhập kho tuần / tháng) mà còn vướng: chưa triển khai / chưa tính phiếu, đã triển khai chưa thấy PR, vật tư chưa mua / trễ hẹn, KH nhập kho sau ngày cần giao, hoặc có vướng mắc.`],
                    ['noBot', 'Chưa có KH', noBot.length, 'Chưa nhập kho đủ mà không có KH nhập kho tuần / tháng (hoặc KH kỳ đã nhập đủ SL) — không theo dõi được quá hạn. Sắp theo công đoạn, giá trị còn lại.'],
                    ['rest', 'Còn lại', rest.length, `Đã có KH, không thuộc "Cần xử lý ngay": còn xa hạn (> ${DUE_SOON_DAYS} ngày) hoặc gấp nhưng không vướng gì. Sắp theo hạn gần nhất.`],
                  ] as const).map(([k, label, n, hint]) => (
                    <button key={k} type="button" onClick={() => setListTab(k)} title={hint}
                      className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition ${listTab === k ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
                      {label}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${listTab === k ? 'bg-white/20 text-white' : k === 'urgent' && n > 0 ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                        {k !== 'noBot' && dangTai ? '…' : fmtInt(n)}
                      </span>
                    </button>
                  ))}
                  <GiaiThich text={listTab === 'urgent' ? 'Cần xử lý ngay: quá hạn / sắp hạn VÀ có thêm ít nhất 1 vấn đề.' : listTab === 'noBot' ? 'Chưa có KH nhập kho tuần / tháng.' : 'Các hạng mục đã có KH còn lại.'} />
                </div>
                {dangTai && listTab !== 'noBot' ? (
                  <p className="border-t border-slate-100 p-8 text-center text-sm text-slate-400">Đang tổng hợp…</p>
                ) : shownList.length === 0 ? (
                  <p className="border-t border-slate-100 p-8 text-center text-sm text-slate-500">
                    {listTab === 'urgent' ? 'Không có hạng mục nào vừa gấp vừa đang vướng vấn đề.' : listTab === 'noBot' ? 'Mọi hạng mục đang sản xuất đều đã có KH nhập kho.' : 'Không còn hạng mục nào khác.'}
                  </p>
                ) : (
                  <div className="max-h-[60vh] overflow-auto custom-scrollbar">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="w-10 py-2.5 pl-5 pr-2 text-right font-medium">#</th>
                          <th className="px-3 py-2.5 text-left font-medium">Mã HEX</th>
                          <th className="px-3 py-2.5 text-left font-medium">Hạng mục</th>
                          <th className="px-3 py-2.5 text-left font-medium">Công đoạn</th>
                          <th className="px-3 py-2.5 text-left font-medium">KH tuần</th>
                          <th className="px-3 py-2.5 text-left font-medium">KH tháng</th>
                          <th className="px-3 py-2.5 text-left font-medium">Cần giao</th>
                          <th className="px-3 py-2.5 text-right font-medium">Còn lại (tỷ)</th>
                          <th className="py-2.5 pl-3 pr-5 text-left font-medium">Vấn đề</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {shownList.map((i, idx) => (
                          <tr key={i.hex} className="hover:bg-slate-50">
                            <td className="py-2.5 pl-5 pr-2 text-right tabular-nums text-slate-400">{idx + 1}</td>
                            <td className="px-3 py-2.5 font-medium">
                              <button type="button" onClick={() => setTimelineHex(i.hex)} title="Xem chi tiết hạng mục" className="text-blue-700 hover:underline">{i.hex}</button>
                            </td>
                            <td className="max-w-[320px] truncate px-3 py-2.5 text-slate-700" title={i.hangMuc}>{i.hangMuc}</td>
                            <td className="px-3 py-2.5 text-slate-600">{i.stage ?? '—'}</td>
                            <PlanDateCell i={i} which="tuần" />
                            <PlanDateCell i={i} which="tháng" />
                            <PlanDateCell i={i} which="cần giao" />
                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{fmtTy(i.remain)}</td>
                            <td className="py-2.5 pl-3 pr-5">
                              <div className="flex flex-wrap gap-1">
                                {i.flags.length === 0 && <span className="text-slate-300">—</span>}
                                {i.flags.map(fl => (
                                  <span key={fl}
                                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${fl.startsWith('Vướng mắc') || fl.startsWith('VT chưa mua') ? 'bg-red-50 text-red-700' : fl.startsWith('Gia công') ? 'bg-fuchsia-50 text-fuchsia-700' : fl.includes('trễ') || fl.startsWith('KH NK') ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                                    {fl.startsWith('Vướng mắc') && <AlertTriangle size={11} aria-hidden />}
                                    {fl}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              </div>

              <div className={`${card} p-5 xl:sticky xl:top-0`}>
                <h4 className="text-lg font-semibold text-slate-900">Cần chú ý</h4>
                {chuY.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">{dangTai ? 'Đang tổng hợp…' : 'Không có gì cần xử lý.'}</p>
                ) : (
                  <ul className="mt-1 divide-y divide-slate-100">
                    {chuY.map(x => (
                      <li key={x.k}>
                        <button type="button" onClick={x.go} className="group flex w-full items-start gap-3 py-3 text-left">
                          <span className="min-w-0 flex-1">
                            <span className="block text-[0.9375rem] text-slate-900 group-hover:underline">{x.t}</span>
                            <span className="mt-0.5 block text-sm text-slate-500">{x.p}</span>
                          </span>
                          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${x.c}`}>
                            <i className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />{x.b}
                          </span>
                        </button>
                      </li>
                    ))}
                    {dangTai && <li className="py-3 text-sm text-slate-400">Đang kiểm tra vật tư, vướng mắc…</li>}
                  </ul>
                )}
              </div>
            </div>

          </div>
        )}
      </div>

      <HexTimelineModal
        hex={timelineHex}
        onClose={() => setTimelineHex(null)}
        bom={timelineHex ? bomDetail?.byHex[timelineHex] ?? null : null}
        issues={timelineHex ? openIssueList[timelineHex] ?? [] : []}
        onOpenMaterial={hex => openMaterial('matched', hex)}
        names={timelineNames}
      />

      <HexMaterialModal
        isOpen={materialMode !== null}
        onClose={() => { setMaterialMode(null); setMaterialHex(null); }}
        title={materialHex ? `${materialHex} · ${hangMucByHex[materialHex] ?? ''}` : projectName}
        hexes={materialHex ? [materialHex] : hexList}
        hangMucByHex={hangMucByHex}
        mode={materialMode ?? 'matched'}
      />
    </ModalShell>
  );
};
