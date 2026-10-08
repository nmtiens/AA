import React, { useEffect, useMemo, useState } from 'react';
import { X, ArrowLeft, CalendarClock, Factory, Package, AlertTriangle, ListChecks, ArrowRight } from 'lucide-react';
import { ModalShell } from '../shared/ModalShell';
import { DataRow } from '../../types';
import { parseNumber } from '../Dashboard/utils/numberParsers';
import { deadlineOf, doneValue, remainValue, isCancelledIpo, isPlanDeadline, planAfterDue, isQtyComplete } from '../../utils/productionMetrics';
import { extractStage } from '../Dashboard/components/modals/OnLineStageDetailModal';
import { remainBucketOf, type RemainBucket } from '../Dashboard/hooks/usePivotTables';
import { fetchVuongMacList, FIVE_M_CATEGORIES, type FiveMCategory, type VuongMacItem } from '../../services/vuongMacService';
import { getToken } from '../../services/userService';
import type { NvlRaw } from '../../utils/nvlParse';
import { BotTab, BopTab, BomTab, analyzeBom, summarizeProjectMaterial, PlanDateCell, type HexInfo, type MaterialLine, type ProjectMaterialLine } from './ProjectHealthTabs';
import { HexMaterialModal, type MaterialViewMode } from '../Dashboard/components/modals/HexMaterialModal';
import { HexTimelineModal } from './HexTimelineModal';
import { formatTrieuAsTy } from '../../utils/money';

// ============================================================================
// Tổng quan 1 công trình (tầng 1): 3 thẻ BOT (thời hạn) · BOP (công đoạn) · BOM (vật tư)
// + danh sách "Cần xử lý ngay" = hạng mục quá hạn / sắp hạn MÀ còn vướng thêm vấn đề khác,
//   và "Chú ý" = hạng mục chưa nhập kho đủ mà không có BOT (không có KH, ngày cần giao, ngày cần PM lẫn BOT dự án).
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
  /** Ngày cần giao — dùng khi không có cả KH tuần lẫn KH tháng */
  ngayCanGiaoKey: string;
  /** Ngày cần (PM) → BOT dự án: hạn cam kết tham khảo khi chưa có 3 nguồn trên */
  ngayCanKey?: string;
  botDuAnKey?: string;
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
  /** Tắt Esc khi đang mở cửa sổ khác đè lên (để Esc chỉ đóng cửa sổ trên cùng) */
  escEnabled?: boolean;
}

const DUE_SOON_DAYS = 14;
const STAGE_ORDER = ['P001', 'P002', 'P012', 'P013', 'GCVT', 'P014', 'P016', 'P018', 'P020', 'P021', 'P022', 'P025'];
const stageOrder = (s: string | null) => { const i = s ? STAGE_ORDER.indexOf(s) : -1; return i === -1 ? 999 : i; };
// Tên ngắn 5M — giống form "Thêm vướng mắc"
const FIVE_M_VI: Record<FiveMCategory, string> = {
  man: 'Con người', machine: 'Máy móc', material: 'Vật tư', method: 'Phương pháp', measurement: 'Đo lường',
};
const DAY = 86_400_000;
// Nguồn hạn được xét cho "Cần xử lý ngay" (hạn theo KH + ngày cần giao; không gồm ngày cần PM / BOT dự án)
const URGENT_SOURCES = new Set<string>(['tuần', 'tháng', 'cần giao']);

const BUCKET_LABEL: Record<RemainBucket, string> = {
  notDeployed: 'Chưa triển khai',
  p002: 'Chưa tính phiếu',
  onLine: 'Đang trên chuyền',
  shortfall: 'Nhập kho chưa đủ',
};
const BUCKET_COLOR: Record<RemainBucket, string> = {
  notDeployed: 'bg-slate-400',
  p002: 'bg-sky-400',
  onLine: 'bg-amber-400',
  shortfall: 'bg-violet-400',
};

type Tone = 'red' | 'amber' | 'green' | 'slate';
const TONE: Record<Tone, { ring: string; text: string; dot: string }> = {
  red: { ring: 'border-red-200 bg-red-50/40', text: 'text-red-600', dot: 'bg-red-500' },
  amber: { ring: 'border-amber-200 bg-amber-50/40', text: 'text-amber-600', dot: 'bg-amber-500' },
  green: { ring: 'border-emerald-200 bg-emerald-50/40', text: 'text-emerald-600', dot: 'bg-emerald-500' },
  slate: { ring: 'border-slate-200 bg-white', text: 'text-slate-900', dot: 'bg-slate-300' },
};

// Tỷ đồng: luôn 2 chữ số thập phân — thống nhất với Báo cáo tiến độ
const fmtTy = formatTrieuAsTy;
const fmtInt = (n: number) => n.toLocaleString('vi-VN');
const fmtDate = (d: Date | null) =>
  d ? d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';


export const ProjectHealthModal: React.FC<Props> = ({
  isOpen, onClose, projectName, rows, keys, pmText, onOpenHexList, escEnabled = true,
}) => {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);
  type Tab = 'overview' | 'bot' | 'bop' | 'bom';
  const TAB_TITLE: Record<Exclude<Tab, 'overview'>, string> = {
    bot: 'BOT · Thời hạn', bop: 'BOP · Công đoạn', bom: 'BOM · Vật tư',
  };
  const [tab, setTab] = useState<Tab>('overview');
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
  useEffect(() => { if (isOpen) { setTab('overview'); setMaterialMode(null); setMaterialHex(null); setTimelineHex(null); } }, [isOpen, projectName]);

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
      // BOT: KH nhập kho tuần → KH nhập kho tháng → ngày cần giao (quy tắc chung toàn app)
      const dl = deadlineOf(row, keys);
      const { date: deadline, source: deadlineSource, khnkTuan, khnkThang, canGiao } = dl;
      // Chưa xong (đếm / tính hạn) = còn giá trị chưa nhập HOẶC trị giá 0 (chưa có giá), TRỪ hạng mục đã nhập
      // đủ SỐ LƯỢNG (thành tiền NK lệch đơn giá / = 0). Khớp ô "Hạng mục chưa nhập kho" ở Báo cáo tiến độ.
      const open = !isQtyComplete(row) && (remain > 0 || total <= 0);
      const t = deadline?.getTime();
      out.push({
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
        team_pr_note: r.team_pr_note, tinh_trang_po: r.tinh_trang_po,
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

  // ---------- Tổng hợp 3 thẻ ----------
  const bot = useMemo(() => {
    const open = items.filter(i => i.open);
    const overdue = open.filter(i => i.overdue);
    const dueSoon = open.filter(i => i.dueSoon);
    const dates = open.map(i => i.deadline).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
    const noDate = open.filter(i => !i.deadline).length;
    // Quá hạn THEO KẾ HOẠCH (KH tuần / tháng đang chạy) vs CAM KẾT (cần giao / ngày cần PM / BOT dự án);
    // cam kết quá > 90 ngày là hạn cũ chưa ai cập nhật KH
    const overduePlan = overdue.filter(i => isPlanDeadline(i.deadlineSource)).length;
    const overdueCommitOld = overdue.filter(i => !isPlanDeadline(i.deadlineSource) && i.deadline && (today - i.deadline.getTime()) / DAY > 90).length;
    return {
      overdue: overdue.length, overdueRemain: overdue.reduce((s, i) => s + i.remain, 0),
      overduePlan, overdueCommit: overdue.length - overduePlan, overdueCommitOld,
      planAfterDue: open.filter(i => i.planAfterDue).length,
      dueSoon: dueSoon.length, nearest: dates[0] ?? null, last: dates[dates.length - 1] ?? null, noDate,
    };
  }, [items, today]);

  const bop = useMemo(() => {
    const total = items.reduce((s, i) => s + i.total, 0);
    const remain: Record<RemainBucket, number> = { notDeployed: 0, p002: 0, onLine: 0, shortfall: 0 };
    items.forEach(i => { if (i.bucket) remain[i.bucket] += i.remain; });
    const remainSum = Object.values(remain).reduce((s, v) => s + v, 0);
    return { total, remain, remainSum, done: Math.max(total - remainSum, 0), stockedItems: items.filter(i => !i.open).length };
  }, [items]);

  // Phân tích vật tư theo trạng thái dòng PR (dùng chung với tab BOM)
  const bomDetail = useMemo(
    () => analyzeBom(items, matCount, materialLines, today, materialIssues, nvlByHex),
    [items, matCount, materialLines, today, materialIssues, nvlByHex]
  );

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

  // ---------- Vấn đề của 1 hạng mục (dùng chung cho "Cần xử lý ngay" và "Chú ý") ----------
  const flagsOf = (i: HexInfo): string[] => {
    const flags: string[] = [];
    if (i.bucket === 'notDeployed' || i.bucket === 'p002') flags.push(BUCKET_LABEL[i.bucket]);
    // Cùng nhóm đỏ của tab BOM: đã triển khai nhưng chưa sản xuất (P002 / P012), không có PR ghi mã và
    // bảng sản xuất không ghi tình trạng mua đã về đủ. P001 (đã có cờ "Chưa triển khai") và hạng mục đã
    // lên chuyền (vật tư mua gộp / tồn kho) không gắn cờ này.
    const mat = bomDetail?.byHex[i.hex]?.state;
    if (mat === 'noneBeforeSx') flags.push('Đã triển khai, chưa SX – chưa thấy PR');
    // KH nhập kho đang dùng muộn hơn ngày cần giao: biết trước sẽ giao trễ
    if (i.planAfterDue) flags.push('KH NK sau ngày cần giao');
    if (mat === 'notOrdered') flags.push('Có VT chưa mua');
    else if (mat === 'late') flags.push('VT trễ hẹn giao');
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
      // Chỉ xét hạn theo KH (tuần / tháng) và ngày cần giao. Hạn tham khảo (ngày cần PM / BOT dự án) vẫn hiện
      // ở tab BOT nhưng không đẩy vào danh sách cần xử lý — tránh ngập hạng mục P001 quá hạn cam kết cũ.
      if (!URGENT_SOURCES.has(i.deadlineSource ?? '')) continue;
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

  // Chú ý: hạng mục chưa nhập kho đủ mà KHÔNG có BOT (không có KH tuần, KH tháng lẫn ngày cần giao)
  const noBot = useMemo(() => {
    const res: (HexInfo & { flags: string[] })[] = [];
    for (const i of items) {
      if (!i.open || i.deadline) continue;
      res.push({ ...i, flags: flagsOf(i) });
    }
    return res.sort((a, b) =>
      stageOrder(a.stage) - stageOrder(b.stage) || b.remain - a.remain);
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

  const botTone: Tone = bot.overdue > 0 ? 'red' : bot.dueSoon > 0 ? 'amber' : 'green';
  const donePct = bop.total > 0 ? (bop.done / bop.total) * 100 : 0;
  const coverPct = bom && hexList.length ? (bom.withMat / hexList.length) * 100 : 0;
  const bomTone: Tone = !bom ? 'slate' : coverPct >= 80 ? 'green' : coverPct >= 40 ? 'amber' : 'red';

  const Card = ({ icon: Icon, title, sub, tone, to, children }: {
    icon: typeof Package; title: string; sub: string; tone: Tone; to: Tab; children: React.ReactNode;
  }) => (
    // Bấm vào bất kỳ đâu trên thẻ để mở tab chi tiết
    <button
      type="button"
      onClick={() => setTab(to)}
      title="Xem chi tiết"
      className={`group block w-full cursor-pointer rounded-xl border p-4 text-left transition hover:shadow-md hover:brightness-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${TONE[tone].ring}`}
    >
      <div className="flex w-full items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${TONE[tone].dot}`} />
        <Icon size={15} className="text-slate-500" />
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 group-hover:underline">{title}</p>
        <span className="text-[0.6875rem] text-slate-400">{sub}</span>
        <span className="ml-auto text-[0.6875rem] text-slate-400 group-hover:text-slate-700">Chi tiết ›</span>
      </div>
      <div className="mt-3">{children}</div>
    </button>
  );

  return (
    <ModalShell
      open={isOpen}
      // Đang ở tab chi tiết: Esc / bấm nền thì quay về Tổng quan; nút X vẫn đóng hẳn
      onClose={() => (tab !== 'overview' ? setTab('overview') : onClose())}
      closeOnEsc={escEnabled && materialMode === null && timelineHex === null}
      labelledBy="health-title"
      overlayClassName="fixed inset-0 z-[9992] flex items-center justify-center bg-slate-900/50 p-4"
      panelClassName="w-[97vw] h-[95vh] flex flex-col rounded-xl bg-white shadow-2xl outline-none"
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-slate-500">Tổng quan công trình</p>
          <h3 id="health-title" className="truncate text-lg font-semibold text-slate-900">{projectName}</h3>
          <p className="mt-0.5 text-[0.6875rem] text-slate-500">
            {pmText ? `PM: ${pmText} · ` : ''}{fmtInt(hexList.length)} hạng mục · Tổng {fmtTy(bop.total)} tỷ (không tính đơn hủy, theo bộ lọc trang)
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenHexList}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Xem danh sách HEX <ArrowRight size={13} />
          </button>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Tab chi tiết chỉ mở khi bấm vào thẻ ở Tổng quan; có nút quay lại */}
      {tab !== 'overview' && (
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-5 py-2">
          <button
            type="button"
            onClick={() => setTab('overview')}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft size={14} /> Tổng quan
          </button>
          <span className="text-slate-300">/</span>
          {(Object.keys(TAB_TITLE) as Exclude<Tab, 'overview'>[]).map(k => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                tab === k ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {TAB_TITLE[k]}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-5 custom-scrollbar">
        {tab === 'bot' && <BotTab items={items} today={today} openIssues={openIssues} onHexClick={setTimelineHex} />}
        {tab === 'bop' && <BopTab items={items} onHexClick={setTimelineHex} />}
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
        {tab === 'overview' && <>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {/* BOT — thời hạn */}
          <Card icon={CalendarClock} title="BOT" sub="KH nhập kho → cần giao → ngày cần PM → BOT dự án" tone={botTone} to="bot">
            <p className={`text-3xl font-semibold tabular-nums ${bot.overdue > 0 ? 'text-red-600' : 'text-slate-900'}`}>
              {fmtInt(bot.overdue)} <span className="text-sm font-medium text-slate-500">hạng mục quá hạn</span>
            </p>
            {bot.overdue > 0 && <p className="text-xs text-red-600">còn {fmtTy(bot.overdueRemain)} tỷ chưa nhập kho</p>}
            {bot.overdue > 0 && (
              <p className="mt-0.5 text-[0.6875rem] text-slate-600">
                <span title="Quá ngày KH nhập kho tuần / tháng đang chạy" className="font-semibold text-red-600">{fmtInt(bot.overduePlan)} theo KH</span>
                {' · '}
                <span title="Không có KH đang chạy, quá ngày cần giao / ngày cần PM / BOT dự án">{fmtInt(bot.overdueCommit)} theo cam kết</span>
                {bot.overdueCommitOld > 0 && <span className="text-slate-400" title="Hạn cũ chưa cập nhật KH"> ({fmtInt(bot.overdueCommitOld)} quá &gt; 90 ngày)</span>}
              </p>
            )}
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1 text-xs">
              <dt className="text-slate-500">Sắp hạn (≤ {DUE_SOON_DAYS} ngày)</dt>
              <dd className={`text-right font-semibold tabular-nums ${bot.dueSoon ? 'text-amber-600' : 'text-slate-700'}`}>{fmtInt(bot.dueSoon)}</dd>
              <dt className="text-slate-500">Hạn gần nhất chưa xong</dt>
              <dd className="text-right tabular-nums text-slate-700">{fmtDate(bot.nearest)}</dd>
              <dt className="text-slate-500">Hạn cuối</dt>
              <dd className="text-right tabular-nums text-slate-700">{fmtDate(bot.last)}</dd>
              {bot.planAfterDue > 0 && <>
                <dt className="text-slate-500" title="KH nhập kho tuần / tháng đang dùng muộn hơn ngày cần giao — biết trước sẽ giao trễ">KH nhập kho sau ngày cần giao</dt>
                <dd className="text-right font-semibold tabular-nums text-amber-600">{fmtInt(bot.planAfterDue)}</dd>
              </>}
              {bot.noDate > 0 && <>
                <dt className="text-slate-500">Chưa có ngày (KH / cần giao / PM / BOT DA)</dt>
                <dd className="text-right tabular-nums text-slate-700">{fmtInt(bot.noDate)}</dd>
              </>}
            </dl>
          </Card>

          {/* BOP — công đoạn */}
          <Card icon={Factory} title="BOP" sub="Tiến độ công đoạn" tone="slate" to="bop">
            <p className="text-3xl font-semibold tabular-nums text-emerald-600">
              {donePct.toLocaleString('en-US', { maximumFractionDigits: 1 })}%
              <span className="ml-1 text-sm font-medium text-slate-500">đã nhập kho</span>
            </p>
            <p className="text-xs text-slate-500">{fmtTy(bop.done)} / {fmtTy(bop.total)} tỷ · {fmtInt(bop.stockedItems)} hạng mục nhập đủ</p>
            {/* Thanh phân bổ phần còn lại */}
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-emerald-400">
              {bop.total > 0 && (Object.keys(BUCKET_LABEL) as RemainBucket[]).map(b => (
                <div key={b} className={BUCKET_COLOR[b]} style={{ width: `${(bop.remain[b] / bop.total) * 100}%` }} />
              ))}
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 text-xs">
              {(Object.keys(BUCKET_LABEL) as RemainBucket[]).map(b => (
                <React.Fragment key={b}>
                  <span className={`h-2 w-2 rounded-sm ${BUCKET_COLOR[b]}`} />
                  <dt className="text-slate-500">{BUCKET_LABEL[b]}</dt>
                  <dd className="text-right tabular-nums text-slate-700">{fmtTy(bop.remain[b])} tỷ</dd>
                </React.Fragment>
              ))}
            </dl>
          </Card>

          {/* BOM — vật tư */}
          <Card icon={Package} title="BOM" sub="Vật tư" tone={bomTone} to="bom">
            {bom ? (
              <>
                <p className="text-3xl font-semibold tabular-nums text-slate-900">
                  {fmtInt(bom.withMat)}<span className="text-lg text-slate-400">/{fmtInt(hexList.length)}</span>
                  <span className="ml-1 text-sm font-medium text-slate-500" title="Hạng mục có ít nhất 1 dòng PR ghi mã nhà máy của nó. Hạng mục còn lại: vật tư có thể ở PR chung của công trình (không mã), lấy từ tồn kho, hoặc chưa lên PR">hạng mục có PR ghi mã</span>
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className={`h-2 ${TONE[bomTone].dot}`} style={{ width: `${coverPct}%` }} />
                </div>
              </>
            ) : <p className="text-sm text-slate-400">Đang kiểm tra vật tư…</p>}
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1 text-xs">
              <dt className="text-slate-500" title="Hạng mục chưa nhập kho đủ có ít nhất 1 dòng PR 1.CHƯA MUA">Hạng mục có VT chưa mua</dt>
              <dd className="text-right font-semibold tabular-nums text-rose-600">{bomDetail ? fmtInt(bomDetail.counts.notOrdered) : '…'}</dd>
              <dt className="text-slate-500" title="Đang mua, đã quá ngày dự kiến giao mà chưa về đủ">Hạng mục có VT trễ hẹn giao</dt>
              <dd className="text-right font-semibold tabular-nums text-orange-600">{bomDetail ? fmtInt(bomDetail.counts.late) : '…'}</dd>
              <dt className="text-slate-500" title="Có dòng PR còn chờ sẽ về sau Ngày cần vật tư">Hạng mục có VT về sau ngày cần</dt>
              <dd className="text-right font-semibold tabular-nums text-red-600">{bomDetail ? fmtInt(bomDetail.afterNeed) : '…'}</dd>
              <dt className="text-slate-500" title="PR thuộc công trình nhưng không ghi mã nhà máy => không gắn được hạng mục (xem tab BOM)">VT chung công trình (không mã)</dt>
              <dd className={`text-right tabular-nums ${projectMat && (projectMat.byState.notOrdered + projectMat.byState.late) > 0 ? 'font-semibold text-rose-600' : 'text-slate-700'}`}>
                {!projectMat ? '…' : `${fmtInt(projectMat.lines)} dòng · ${fmtInt(projectMat.byState.notOrdered)} chưa mua · ${fmtInt(projectMat.byState.late)} trễ`}
              </dd>
              <dt className="text-slate-500" title="Vướng mắc loại M3 – Vật tư chưa xử lý (số vướng mắc · số hạng mục)">Vướng mắc vật tư (M3) đang mở</dt>
              <dd className={`text-right tabular-nums ${bomDetail?.issueTotal ? 'font-semibold text-red-600' : 'text-slate-700'}`}>
                {!bomDetail || materialIssues === null ? '…' : `${fmtInt(bomDetail.issueTotal)} · ${fmtInt(bomDetail.issueHexes)} HM`}
              </dd>
              <dt className="text-slate-500" title="Mọi loại M1–M5 chưa xử lý">Vướng mắc tồn đọng (mọi loại)</dt>
              <dd className={`text-right tabular-nums ${openIssueTotal ? 'font-semibold text-red-600' : 'text-slate-700'}`}>
                {openIssueTotal === null ? '…' : fmtInt(openIssueTotal)}
              </dd>
            </dl>
            {bom && hexList.length > 0 && coverPct < 50 && (
              <p className="mt-2 text-[0.6875rem] text-slate-500">
                Tỷ lệ nối vật tư thấp — nhiều PR chưa ghi mã nhà máy, số liệu BOM chỉ mang tính tham khảo.
              </p>
            )}
          </Card>
        </div>

        {/* Cần xử lý ngay · Chú ý (không có BOT) · Còn lại */}
        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {([
              ['urgent', 'Cần xử lý ngay', urgent.length, ListChecks, 'red'],
              ['noBot', 'Chú ý: không có BOT', noBot.length, AlertTriangle, 'amber'],
              ['rest', 'Còn lại', rest.length, CalendarClock, 'slate'],
            ] as const).map(([k, label, n, Icon, tone]) => (
              <button
                key={k}
                type="button"
                onClick={() => setListTab(k)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  tone === 'red'
                    ? (listTab === k ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100')
                    : tone === 'amber'
                      ? (listTab === k ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100')
                      : (listTab === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')
                }`}
              >
                <Icon size={15} className={listTab === k ? 'text-white' : tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-500' : 'text-slate-500'} />
                {label}
                <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${
                  listTab === k ? 'bg-white/20 text-white' : tone === 'red' ? 'bg-red-100 text-red-700' : tone === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                }`}>
                  {k !== 'noBot' && (matCount === null || openIssues === null) ? '…' : fmtInt(n)}
                </span>
              </button>
            ))}
            <span className="text-[0.6875rem] text-slate-500">
              {listTab === 'urgent'
                ? <>Hạng mục quá hạn hoặc sắp hạn (≤ {DUE_SOON_DAYS} ngày) theo KH nhập kho tuần / tháng hoặc ngày cần giao — không xét hạn tham khảo ngày cần (PM) / BOT dự án — mà còn vướng: chưa triển khai / chưa tính phiếu, đã triển khai chưa thấy PR, có VT chưa mua / trễ hẹn giao, KH nhập kho sau ngày cần giao, hoặc có vướng mắc tồn đọng.</>
                : listTab === 'noBot'
                  ? <>Hạng mục chưa nhập kho đủ mà chưa có BOT: không có KH nhập kho tuần, KH nhập kho tháng, ngày cần giao, ngày cần (PM) lẫn BOT dự án — không theo dõi được quá hạn. Sắp theo công đoạn, giá trị còn lại.</>
                  : <>Hạng mục chưa nhập kho đủ, đã có BOT, không thuộc "Cần xử lý ngay": còn xa hạn (&gt; {DUE_SOON_DAYS} ngày), quá hạn / sắp hạn nhưng không vướng vấn đề nào, hoặc chỉ có hạn tham khảo (ngày cần PM / BOT dự án — chưa có KH, ngày cần giao). Sắp theo hạn gần nhất.</>}
            </span>
          </div>
          {matCount === null || openIssues === null ? (
            <p className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-400">Đang tổng hợp…</p>
          ) : shownList.length === 0 ? (
            <p className="rounded-lg bg-emerald-50 p-6 text-center text-sm text-emerald-700">
              {listTab === 'urgent' ? 'Không có hạng mục nào vừa gấp vừa đang vướng vấn đề.' : listTab === 'noBot' ? 'Mọi hạng mục đang sản xuất đều đã có BOT.' : 'Không còn hạng mục nào khác.'}
            </p>
          ) : (
            <div className="max-h-[55vh] overflow-auto rounded-lg border border-slate-200 custom-scrollbar">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="w-10 px-2 py-2 text-right font-medium">STT</th>
                    <th className="px-3 py-2 text-left font-medium">Mã Hex</th>
                    <th className="px-3 py-2 text-left font-medium">Hạng mục</th>
                    <th className="px-3 py-2 text-left font-medium">Công đoạn</th>
                    <th className="px-3 py-2 text-left font-medium">KH tuần</th>
                    <th className="px-3 py-2 text-left font-medium">KH tháng</th>
                    <th className="px-3 py-2 text-left font-medium">Cần giao</th>
                    <th className="px-3 py-2 text-right font-medium">Còn lại (tỷ)</th>
                    <th className="px-3 py-2 text-left font-medium">Vấn đề</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shownList.map((i, idx) => (
                    <tr key={i.hex} className="hover:bg-slate-50">
                      <td className="px-2 py-2 text-right tabular-nums text-slate-400">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium">
                        <button type="button" onClick={() => setTimelineHex(i.hex)} title="Xem chi tiết hạng mục (BOP × BOT)" className="text-blue-700 hover:underline">
                          {i.hex}
                        </button>
                      </td>
                      <td className="max-w-[320px] truncate px-3 py-2 text-slate-600" title={i.hangMuc}>{i.hangMuc}</td>
                      <td className="px-3 py-2 text-slate-600">{i.stage ?? '—'}</td>
                      <PlanDateCell i={i} which="tuần" />
                      <PlanDateCell i={i} which="tháng" />
                      <PlanDateCell i={i} which="cần giao" />
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {fmtTy(i.remain)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {i.flags.length === 0 && <span className="text-slate-300">—</span>}
                          {i.flags.map(fl => (
                            <span
                              key={fl}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] font-medium ${
                                fl.startsWith('Vướng mắc') ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {fl.startsWith('Vướng mắc') && <AlertTriangle size={10} className="text-red-500" />}
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
        </>}
      </div>

      <HexTimelineModal
        hex={timelineHex}
        onClose={() => setTimelineHex(null)}
        bom={timelineHex ? bomDetail?.byHex[timelineHex] ?? null : null}
        issues={timelineHex ? openIssueList[timelineHex] ?? [] : []}
        onOpenMaterial={hex => openMaterial('matched', hex)}
        escEnabled={materialMode === null}
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
