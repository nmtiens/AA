import React, { useEffect, useMemo, useState } from 'react';
import { X, Package, AlertTriangle, CheckCircle2, Circle, CircleDot, XCircle, CalendarClock, Image as ImageIcon } from 'lucide-react';
import { LinkLightbox } from '../shared/LinkLightbox';
import { ModalShell } from '../shared/ModalShell';
import { getToken } from '../../services/userService';
import { parsePlanDate, deadlineOf, RAW_DEADLINE_KEYS, planAfterDue, dwellBucket, doneValue, remainValue, isCancelledIpo, DWELL_STUCK, DWELL_NONE, stageIndex } from '../../utils/productionMetrics';
import { parseNumber } from '../Dashboard/utils/numberParsers';
import { workshopGroupOf } from '../../utils/workshopGroups';
import { parseNvlNeeds, parseNvlStatus, nvlLinePending, NVL_GROUP_LABEL } from '../../utils/nvlParse';
import { extractStage } from '../Dashboard/components/modals/OnLineStageDetailModal';
import type { VuongMacItem } from '../../services/vuongMacService';
import type { HexBom } from './ProjectHealthTabs';
import { formatTrieuAsTy } from '../../utils/money';
import { fmtDate, DAY_MS as DAY } from '../../utils/format';
import { parseQcEntries } from '../../utils/qcParse';
import { QC_STATUS_VI } from '../../services/productionExtraService';

// ============================================================================
// Chi tiết 1 hạng mục (HEX): BOP (đang ở công đoạn nào, tiến độ từng công đoạn) + BOT (các mốc
// ngày & hạn) trên cùng 1 màn hình, kèm lịch sử nhập kho, QC, ghi chú phiếu, vật tư, vướng mắc.
// Dữ liệu: GET /api/production/hex/:hex (bảng production_status_app).
// ============================================================================

type Row = Record<string, any>;

const fmtNum = (v: unknown, digits = 2) => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || Number.isNaN(n) ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: digits });
};
const fmtTy = (trieu: unknown) => {
  const n = Number(trieu);
  return Number.isFinite(n) ? formatTrieuAsTy(n) : '—';
};
// Sai số số lượng (số thực từ DB) — dưới ngưỡng coi như 0
const QTY_EPS = 1e-6;

// Thứ tự công đoạn BOP để biết mốc nào đã qua / đang ở / chưa tới

// Số lượng đã giao theo công đoạn sản xuất (cột so_luong_cong_doan_*_da_giao)
const WORK_STEPS: { key: string; label: string; flag?: string }[] = [
  { key: 'so_luong_cong_doan_cts_da_giao', label: 'CTS' },
  { key: 'so_luong_cong_doan_may_da_giao', label: 'Máy' },
  { key: 'so_luong_cong_doan_moc_da_giao', label: 'Mộc' },
  { key: 'so_luong_cong_doan_kim_loai_da_giao', label: 'Kim loại', flag: 'co_kim_loai' },
  { key: 'so_luong_cong_doan_vecni_da_giao', label: 'Vecni', flag: 'co_vecni' },
  { key: 'so_luong_cong_doan_sofa_da_giao', label: 'Sofa', flag: 'co_sofa' },
  { key: 'so_luong_cong_doan_da_da_giao', label: 'Đá', flag: 'co_kinh_da' },
  { key: 'so_luong_cong_doan_kinh_da_giao', label: 'Kính', flag: 'co_kinh_da' },
  { key: 'so_luong_cong_doan_fitting_da_giao', label: 'Fitting' },
  { key: 'so_luong_cong_doan_bao_bi_da_giao', label: 'Bao bì' },
];

// "11/06/2026 # Đơn giá: … # SL NK: 20 # TT NK: 524.8 # ghi chú" -> các lần nhập kho
// Số trong ghi chú nhập kho viết kiểu EN: dấu chấm là thập phân ("TT NK: 334.644" = 334,644 triệu),
// không dùng parseNumber (hiểu "334.644" là 334 nghìn) — bỏ dấu phẩy ngăn nghìn nếu có.
const noteNumber = (v: string) => {
  const n = Number(String(v).replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

// Xưởng theo setup gộp xưởng (giống mọi view); mã gốc khác tên gộp thì ghi kèm trong ngoặc
const xuongText = (raw: unknown) => {
  const r = String(raw ?? '').trim();
  if (!r) return '—';
  const g = workshopGroupOf(r);
  return g.toUpperCase() === r.toUpperCase() ? r : `${g} (${r})`;
};

const parseStockIn = (text: unknown) =>
  String(text ?? '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const parts = l.split('#').map(p => p.trim());
    const pick = (label: string) => parts.find(p => p.toUpperCase().startsWith(label))?.split(':').slice(1).join(':').trim() ?? '';
    const note = parts.filter((p, i) => i > 0 && !/^(ĐƠN GIÁ|SL NK|TT NK)\s*:/i.test(p)).join(' · ');
    return { date: parts[0], qty: pick('SL NK'), value: pick('TT NK'), note };
  });

interface Props {
  hex: string | null;
  onClose: () => void;
  /** Phân tích vật tư của hạng mục (từ tab BOM), nếu đã có */
  bom?: HexBom | null;
  /** Vướng mắc đang mở của hạng mục (mọi loại) */
  issues?: VuongMacItem[];
  onOpenMaterial?: (hex: string) => void;
  /** Tên công trình / PM / PC đã chuẩn hoá ở dữ liệu trang (giống các view khác) */
  names?: { project?: string; pm?: string; pc?: string };
}

export const HexTimelineModal: React.FC<Props> = ({ hex, onClose, bom, issues, onOpenMaterial, names }) => {
  const [row, setRow] = useState<Row | null>(null);
  // Xem ảnh QC ngay trong app (link Google Drive) — urls của 1 lần kiểm + ảnh đang xem
  const [photoView, setPhotoView] = useState<{ urls: string[]; idx: number; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);

  useEffect(() => {
    setRow(null); setError(null);
    if (!hex) return;
    const ctrl = new AbortController();
    fetch(`/api/production/hex/${encodeURIComponent(hex)}`, {
      headers: { Authorization: `Bearer ${getToken() ?? ''}` },
      signal: ctrl.signal,
    })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(r.status === 404 ? 'Không tìm thấy hạng mục' : 'Không tải được dữ liệu'))))
      .then(setRow)
      .catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => ctrl.abort();
  }, [hex]);

  const d = useMemo(() => {
    if (!row) return null;
    const stage = extractStage(row.bop);
    const cur = stageIndex(stage);
    const dl = deadlineOf(row, RAW_DEADLINE_KEYS);
    const qtyOrder = Number(row.so_luong_don_hang_tong) || 0;
    const qtyTicket = Number(row.so_luong_tinh_phieu) || 0;
    const qtyIn = Math.max(Number(row.so_luong_nhap_kho_luy_ke) || 0, 0);
    const stockIn = parseStockIn(row.tong_hop_ghi_chu_nhap_kho);
    const firstIn = stockIn.length ? parsePlanDate(stockIn[0].date) : null;
    const lastIn = stockIn.length ? parsePlanDate(stockIn[stockIn.length - 1].date) : null;
    // Giá trị: cùng quy tắc với mọi view (đã nhập = min(nhập kho lũy kế, trị giá); còn lại = trị giá − đã nhập)
    const cancelled = isCancelledIpo(row.tinh_trang_ipo);
    const total = parseNumber(row.tri_gia_don_hang_tong);
    const valDone = doneValue(total, parseNumber(row.thanh_tien_nhap_kho_luy_ke), cancelled);
    const valRemain = remainValue(total, parseNumber(row.thanh_tien_nhap_kho_luy_ke), cancelled);
    const pctValue = total > 0 ? (valDone / total) * 100 : 0;
    // Đã nhập kho đủ: đủ trị giá HOẶC đủ số lượng (thành tiền NK có thể lệch đơn giá) — quy tắc chung.
    // Đơn HỦY không bao giờ "đủ" (valRemain của đơn hủy = 0 nên trước bị coi là đã nhập đủ)
    const full = !cancelled && ((total > 0 && valRemain <= 0) || (qtyOrder > 0 && qtyIn >= qtyOrder));

    // Mốc BOP: trạng thái theo công đoạn hiện tại
    // Đơn HỦY: mốc đã qua giữ 'done', mốc đang làm / chưa tới => 'cancelled' (không đánh xong)
    type St = 'done' | 'current' | 'todo' | 'cancelled';
    const state = (fromIdx: number, toIdx: number, doneOverride?: boolean): St =>
      doneOverride ? 'done' : cur > toIdx ? 'done' : cancelled ? 'cancelled' : cur >= fromIdx && cur <= toIdx ? 'current' : 'todo';
    const pmDate = parsePlanDate(row.ngay_nhan_tu_pm);
    const bvDate = parsePlanDate(row.ngay_trien_khai_ban_ve);
    const phDate = parsePlanDate(row.ngay_tinh_phieu);
    const qtyOut = Math.max(Number(row.so_luong_xuat_kho_luy_ke) || 0, 0);
    // Quy tắc chung: Tồn kho chặn trong [0, đã nhập]; Đã xuất = Đã nhập − Tồn kho (cột xuất ghi nhận thiếu
    // dữ liệu trước 01/2025 / lệch kho => chỉ hiện tham khảo khi khác số suy ra)
    const qtyStockEff = Math.min(Math.max(Number(row.so_luong_ton_kho_hien_tai) || 0, 0), qtyIn);
    const qtyOutEff = Math.max(qtyIn - qtyStockEff, 0);
    const outDiff = Math.abs(qtyOut - qtyOutEff) > QTY_EPS;
    // Số ngày giữa 2 mốc (hiện cạnh mốc sau) — thời gian chờ ở từng khâu
    const gap = (a: Date | null, b: Date | null) => (a && b ? Math.round((b.getTime() - a.getTime()) / DAY) : null);
    const gapText = (a: Date | null, b: Date | null, label: string) => { const g = gap(a, b); return g === null ? '' : `${label} ${g} ngày`; };
    const milestones = [
      { key: 'pm', title: 'Nhận đơn từ PM', stage: 'P001', date: pmDate, note: pmDate ? `${Math.floor((today - pmDate.getTime()) / DAY)} ngày trước` : '', gap: '', st: state(0, 0) },
      { key: 'bv', title: 'Triển khai bản vẽ', stage: 'P002', date: bvDate, note: row.tinh_trang_trien_khai_ban_ve ?? '', gap: gapText(pmDate, bvDate, 'sau nhận PM'), st: state(1, 1) },
      {
        key: 'phieu', title: 'Tính phiếu / duyệt phiếu', stage: 'P012',
        date: phDate, date2: parsePlanDate(row.ngay_duyet_phieu),
        note: [row.tinh_trang_phieu, qtyTicket ? `SL tính phiếu ${fmtNum(qtyTicket, 3)} / ${fmtNum(qtyOrder, 3)}` : ''].filter(Boolean).join(' · '),
        gap: gapText(bvDate, phDate, 'sau triển khai BV'),
        st: state(2, 2),
      },
      { key: 'sx', title: 'Sản xuất (P013 → P021)', stage: 'P013–P021', date: null, note: stage && cur >= 3 && cur <= 9 ? `Đang ở ${stage} · ${row.tinh_trang ?? ''}` : '', gap: '', st: state(3, 9) },
      {
        key: 'nk', title: 'Nhập kho', stage: 'P022', date: firstIn, date2: lastIn,
        // Số lượng + giá trị đã nhập / trị giá đơn hàng (tỷ); đơn HỦY không tính giá trị
        note: `${fmtNum(qtyIn, 3)} / ${fmtNum(qtyOrder, 3)} ${row.dvt ?? ''}`
          + (cancelled ? '' : ` · ${fmtTy(valDone)} / ${fmtTy(total)} tỷ`)
          + (full ? ' · đủ' : '') + (cancelled ? ' · đơn HỦY' : ''),
        gap: [gapText(phDate, firstIn, 'sau tính phiếu'), gapText(pmDate, lastIn, '· tổng từ PM')].filter(Boolean).join(' '),
        st: (cancelled ? 'cancelled' : full ? 'done' : qtyIn > 0 ? 'current' : state(10, 11)) as St,
      },
      {
        key: 'xk', title: 'Xuất kho / giao', stage: 'P025', date: null,
        note: qtyOutEff > QTY_EPS || qtyStockEff > QTY_EPS
          ? `đã xuất ${fmtNum(qtyOutEff, 3)} (nhập − tồn) · tồn kho ${fmtNum(qtyStockEff, 3)} ${row.dvt ?? ''}`
            + (outDiff ? ` · bảng xuất kho ghi ${fmtNum(qtyOut, 3)} (tham khảo)` : '')
          : (qtyIn > 0 ? 'chưa xuất kho' : ''),
        gap: '',
        // Xong khi đã nhập đủ và không còn tồn; còn tồn hoặc chưa nhập đủ mà đã xuất 1 phần => đang xuất
        st: (cancelled ? 'cancelled' : (qtyIn > 0 && full && qtyStockEff <= QTY_EPS) ? 'done' : qtyOutEff > QTY_EPS ? 'current' : 'todo') as St,
      },
    ];

    // Mốc BOT (hạn): CHỈ KH tuần → KH tháng (KH đã đạt SL thì bỏ qua). Ngày cần giao / ngày cần (PM) / BOT dự án
    // chỉ hiện để tham khảo, không tính hạn
    const slText = (v: unknown) => (v ? `SL ${fmtNum(v, 3)}` : '');
    const deadlines = [
      { label: 'KH nhập kho tuần', date: dl.khnkTuan, used: dl.source === 'tuần',
        extra: [slText(row.sl_khnk_tuan), dl.tuanMet ? 'đã nhập đủ SL KH trong tuần' : ''].filter(Boolean).join(' · '), ref: false },
      { label: 'KH nhập kho tháng', date: dl.khnkThang, used: dl.source === 'tháng',
        extra: [slText(row.sl_khnk_thang), dl.thangMet ? 'đã nhập đủ SL KH trong tháng' : ''].filter(Boolean).join(' · '), ref: false },
      { label: 'Ngày cần giao', date: dl.canGiao, used: false, extra: 'tham khảo', ref: true },
      { label: 'Ngày cần (PM)', date: dl.canPm, used: false, extra: 'tham khảo', ref: true },
      { label: 'BOT dự án', date: dl.botDuAn, used: false, extra: 'tham khảo · hạn chung công trình', ref: true },
    ];
    const days = dl.date ? Math.floor((dl.date.getTime() - today) / DAY) : null;
    return { stage, cur, dl, days, qtyOrder, qtyTicket, qtyIn, full, stockIn, milestones, deadlines, valDone, valRemain, pctValue, cancelled };
  }, [row, today]);

  const dwell = row ? dwellBucket(row.so_ngay_cd_hien_tai) : null;
  // Định mức + tình trạng NVL từ bảng sản xuất
  const nvl = useMemo(() => ({ needs: parseNvlNeeds(row), status: parseNvlStatus(row) }), [row]);

  // Kiểm tra mốc ngày bất thường
  const checks = useMemo(() => {
    if (!row || !d) return null;
    const pm = parsePlanDate(row.ngay_nhan_tu_pm);
    const tk = parsePlanDate(row.ngay_trien_khai_ban_ve);
    const ph = parsePlanDate(row.ngay_tinh_phieu);
    const warnings: string[] = [];
    if (pm && tk && tk < pm) warnings.push('Ngày triển khai bản vẽ trước ngày nhận đơn từ PM');
    if (d.cur >= 2 && !tk) warnings.push('Đã qua triển khai bản vẽ nhưng chưa ghi ngày triển khai bản vẽ');
    if (tk && ph && ph < tk) warnings.push('Ngày tính phiếu trước ngày triển khai bản vẽ');
    if (d.dl.date && tk && d.dl.date < tk) warnings.push(`Hạn đang dùng (${fmtDate(d.dl.date)}) trước ngày triển khai bản vẽ — hạn không thực tế`);
    // Chỉ cảnh báo khi hạng mục chưa nhập kho đủ và không HỦY (giống cờ ở cửa sổ tổng quan công trình)
    if (!d.full && !d.cancelled && planAfterDue(d.dl)) warnings.push('KH nhập kho muộn hơn ngày cần giao — biết trước sẽ giao trễ');
    return { warnings };
  }, [row, d]);
  const openIssues = (issues ?? []).filter(v => !v.isResolved);
  const qcEntries = useMemo(() => parseQcEntries(row?.tong_hop_thong_tin_qc), [row]);

  return (
    <ModalShell
      open={hex !== null}
      onClose={onClose}
      labelledBy="hex-timeline-title"
      overlayClassName="fixed inset-0 z-[9994] flex items-center justify-center bg-slate-900/50 p-4"
      panelClassName="w-[92vw] max-w-[1400px] h-[90vh] flex flex-col rounded-xl bg-white shadow-2xl outline-none"
    >
      <div onClick={e => e.stopPropagation()} className="flex min-h-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-slate-500">Chi tiết hạng mục · BOP × BOT</p>
            <h3 id="hex-timeline-title" className="text-lg font-semibold text-slate-900">
              {hex}{row?.ten_hang_muc ? ` · ${row.ten_hang_muc}` : ''}
            </h3>
            {row && (
              <p className="mt-0.5 text-[0.6875rem] text-slate-500">
                {names?.project ?? row.ten_cong_trinh} · Xưởng {xuongText(row.xuong_chinh)} · PM {names?.pm || row.ten_pm || '—'} · PC {names?.pc || row.ten_pc || '—'}
                {row.ma_hang_muc_boq ? ` · BOQ ${row.ma_hang_muc_boq}` : ''}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {hex && onOpenMaterial && (
              <button
                type="button"
                onClick={() => onOpenMaterial(hex)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100"
              >
                <Package size={14} /> Vật tư
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 custom-scrollbar">
          {error ? (
            <p className="rounded-lg bg-red-50 p-6 text-center text-sm text-red-600">{error}</p>
          ) : !row || !d ? (
            <p className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-400">Đang tải…</p>
          ) : (
            <div className="space-y-5">
              {/* Tóm tắt */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {[
                  { label: 'Công đoạn (BOP)', value: d.stage ?? '—', sub: row.tinh_trang ?? '' },
                  {
                    label: 'Hạn (BOT)', value: fmtDate(d.dl.date),
                    sub: d.cancelled ? 'Đơn HỦY — không theo dõi hạn' : d.dl.source ? `KH nhập kho ${d.dl.source}${d.full ? ' · đã nhập kho đủ' : d.days !== null ? ` · ${d.days < 0 ? `quá ${-d.days} ngày` : `còn ${d.days} ngày`}` : ''}` : 'Chưa có KH nhập kho',
                    tone: d.cancelled ? 'text-slate-400' : d.days !== null && d.days < 0 && !d.full ? 'text-red-600' : d.days !== null && d.days <= 14 && !d.full ? 'text-amber-600' : 'text-slate-900',
                  },
                  {
                    label: 'Ở công đoạn hiện tại', value: dwell === DWELL_NONE || !dwell ? 'Chưa có số ngày' : dwell, sub: dwell === DWELL_NONE ? '' : row.so_ngay_cd_hien_tai ?? '',
                    tone: dwell === DWELL_STUCK ? 'text-red-600' : 'text-slate-900',
                  },
                  { label: 'Đơn hàng', value: `${fmtNum(d.qtyOrder, 3)} ${row.dvt ?? ''}`, sub: `${fmtTy(row.tri_gia_don_hang_tong)} tỷ` },
                  { label: 'SL tính phiếu', value: fmtNum(d.qtyTicket, 3), sub: `${fmtTy(row.thanh_tien_tinh_phieu)} tỷ` },
                  {
                    label: 'Đã nhập kho', value: `${fmtNum(d.qtyIn, 3)} / ${fmtNum(d.qtyOrder, 3)}`,
                    sub: d.cancelled ? 'Đơn HỦY — không tính giá trị' : `${d.pctValue.toFixed(0)}% giá trị · ${fmtTy(d.valDone)} tỷ · còn ${fmtTy(d.valRemain)} tỷ`,
                    tone: d.full ? 'text-emerald-600' : 'text-slate-900',
                  },
                ].map(k => (
                  <div key={k.label} className="rounded-lg border border-slate-200 px-3 py-2">
                    <p className="text-[0.6875rem] text-slate-500">{k.label}</p>
                    <p className={`text-base font-semibold tabular-nums ${k.tone ?? 'text-slate-900'}`}>{k.value}</p>
                    <p className="truncate text-[0.6875rem] text-slate-400" title={k.sub}>{k.sub}</p>
                  </div>
                ))}
              </div>

              {/* Mốc ngày bất thường (chỉ hiện khi có) */}
              {checks && checks.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs">
                  <p className="mb-1.5 font-semibold text-slate-700">Kiểm tra mốc ngày</p>
                  <ul className="space-y-1">
                    {checks.warnings.map(w => (
                      <li key={w} className="text-amber-800"><AlertTriangle size={11} className="-mt-0.5 mr-1 inline" />{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
                {/* BOP — tiến trình */}
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="mb-3 text-xs font-semibold text-slate-700">Tiến trình (BOP) <span className="font-normal text-slate-400">· SL đã giao theo công đoạn / SL đơn hàng</span></p>
                  <ol className="space-y-3">
                    {d.milestones.map(m => {
                      const Icon = m.st === 'done' ? CheckCircle2 : m.st === 'current' ? CircleDot : m.st === 'cancelled' ? XCircle : Circle;
                      const color = m.st === 'done' ? 'text-emerald-600' : m.st === 'current' ? 'text-amber-600' : m.st === 'cancelled' ? 'text-rose-400' : 'text-slate-300';
                      return (
                        <li key={m.key} className="flex gap-3">
                          <Icon size={18} className={`mt-0.5 shrink-0 ${color}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2">
                              <span className={`text-sm font-semibold ${m.st === 'todo' || m.st === 'cancelled' ? 'text-slate-400' : 'text-slate-800'}`}>{m.title}</span>
                              <span className="text-[0.6875rem] text-slate-400">{m.stage}</span>
                              {m.st === 'cancelled' && <span className="rounded bg-rose-50 px-1.5 text-[0.625rem] font-semibold text-rose-600">Hủy</span>}
                              <span className="ml-auto text-xs tabular-nums text-slate-600">
                                {m.date ? fmtDate(m.date) : ''}
                                {'date2' in m && m.date2 && m.date2.getTime() !== m.date?.getTime() ? ` → ${fmtDate(m.date2)}` : ''}
                              </span>
                            </div>
                            {m.note && <p className="text-xs text-slate-500">{m.note}</p>}
                            {m.gap && <p className="text-[0.6875rem] text-slate-400">{m.gap}</p>}
                            {/* Sản xuất: SL đã giao theo từng công đoạn so với SL tính phiếu */}
                            {m.key === 'sx' && (
                              <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                                {WORK_STEPS.filter(w => !w.flag || String(row[w.flag] ?? '').toLowerCase() === 'yes' || Number(row[w.key]) > 0).map(w => {
                                  const done = Number(row[w.key]) || 0;
                                  const base = d.qtyOrder || d.qtyTicket; // so với SL đơn hàng
                                  const pct = base > 0 ? Math.min(100, (done / base) * 100) : 0;
                                  return (
                                    <div key={w.key} className="flex items-center gap-2 text-xs">
                                      <span className="w-14 shrink-0 text-slate-600">{w.label}</span>
                                      <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                                        <div className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-400' : ''}`} style={{ width: `${pct}%` }} />
                                      </div>
                                      <span className="w-20 shrink-0 text-right tabular-nums text-slate-500">{fmtNum(done, 3)} / {fmtNum(base, 3)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>

                {/* BOT — các mốc hạn */}
                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <CalendarClock size={14} /> Thời hạn (BOT)
                      <span className="font-normal text-slate-400">· hạn dùng: KH nhập kho tuần → KH nhập kho tháng (các ngày khác chỉ tham khảo)</span>
                    </p>
                    <ul className="divide-y divide-slate-100 text-xs">
                      {d.deadlines.map(x => {
                        const dd = x.date ? Math.floor((x.date.getTime() - today) / DAY) : null;
                        const late = !x.ref && dd !== null && dd < 0 && !d.full && !d.cancelled;
                        return (
                          <li key={x.label} className={`flex items-center gap-2 py-1.5 ${x.used ? 'font-semibold' : ''}`}>
                            <span className={x.used ? 'text-slate-900' : 'text-slate-500'}>{x.label}</span>
                            {x.used && <span className="rounded bg-slate-800 px-1.5 text-[0.625rem] font-medium text-white">đang dùng</span>}
                            {x.extra && <span className="text-[0.6875rem] font-normal text-slate-400">{x.extra}</span>}
                            <span className={`ml-auto tabular-nums ${!x.date ? 'text-slate-300' : late ? 'text-red-600' : 'text-slate-700'}`}>
                              {fmtDate(x.date)}
                              {dd !== null && <span className="ml-1 font-normal text-slate-400">({dd < 0 ? `-${-dd}` : `+${dd}`}d)</span>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {/* Vật tư + vướng mắc */}
                  <div className="rounded-lg border border-slate-200 p-4 text-xs">
                    <p className="mb-2 font-semibold text-slate-700">Vật tư & vướng mắc</p>
                    {bom ? (
                      <dl className="grid grid-cols-[1fr_auto] gap-y-1">
                        <dt className="text-slate-500">Số dòng PR</dt><dd className="text-right tabular-nums">{bom.lines || '—'}</dd>
                        <dt className="text-slate-500">Chưa mua / trễ hẹn / theo nhu cầu SX / chưa tới hẹn</dt>
                        <dd className="text-right tabular-nums">
                          <span className="text-rose-600">{bom.byLine.notOrdered ?? 0}</span> / <span className="text-orange-600">{bom.byLine.late ?? 0}</span> / <span className="text-yellow-700">{bom.byLine.deferred ?? 0}</span> / {bom.byLine.onTrack ?? 0}
                        </dd>
                        <dt className="text-slate-500">Ngày cần VT · dự kiến giao PMH</dt>
                        <dd className="text-right tabular-nums">{fmtDate(bom.needDate)} · {fmtDate(bom.dueDate)}</dd>
                      </dl>
                    ) : <p className="text-slate-400">Đang tải vật tư…</p>}
                    {bom && bom.lines === 0 && (
                      <p className="mt-1 text-amber-700">Chưa có dòng PR nào ghi mã nhà máy của hạng mục — vật tư có thể mua gộp theo công trình (khối "Vật tư chung" ở tab BOM) hoặc lấy từ tồn kho. Xem định mức NVL bên dưới.</p>
                    )}
                    <div className="mt-3 border-t border-slate-100 pt-2">
                      {openIssues.length === 0 ? (
                        <p className="text-slate-400">Không có vướng mắc đang mở.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {openIssues.map(v => (
                            <li key={v.id} className="rounded-md bg-red-50 px-2.5 py-1.5 text-red-800">
                              <AlertTriangle size={11} className="-mt-0.5 mr-1 inline" />
                              <span className="whitespace-pre-line">{v.content}</span>
                              <span className="block text-[0.6875rem] text-red-600/80">
                                {v.handler ? `Xử lý: ${v.handler} · ` : ''}{v.bot ? `BOT ${new Date(v.bot).toLocaleDateString('vi-VN')}` : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Định mức + tình trạng NVL theo hạng mục (bảng sản xuất, kế hoạch cập nhật) */}
              {(nvl.needs.length > 0 || nvl.status.length > 0 || row.co_gia_cong_ngoai) && (
                <div className="rounded-lg border border-slate-200">
                  <p className="border-b border-slate-100 px-4 py-2 text-xs font-semibold text-slate-700">
                    Định mức & tình trạng NVL{' '}
                    <span className="font-normal text-slate-400">
                      · theo bảng sản xuất (kế hoạch cập nhật) — có cả vật tư mua gộp theo công trình, không cần PR ghi mã
                    </span>
                  </p>
                  <div className="grid gap-0 lg:grid-cols-2 lg:divide-x divide-slate-100">
                    <div className="p-3">
                      <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-slate-500">Định mức vật tư</p>
                      {nvl.needs.length === 0 ? (
                        <p className="text-xs text-slate-400">Chưa có định mức.</p>
                      ) : (
                        <table className="w-full text-xs">
                          <tbody className="divide-y divide-slate-100">
                            {nvl.needs.map((n, idx) => (
                              <tr key={idx}>
                                <td className="py-1 pr-2 text-[0.6875rem] text-slate-400 whitespace-nowrap">{NVL_GROUP_LABEL[n.group]}</td>
                                <td className="py-1 pr-2 text-slate-800">{n.name}</td>
                                <td className="py-1 text-right tabular-nums whitespace-nowrap text-slate-700">
                                  {n.qty !== null ? Number(n.qty.toFixed(3)).toLocaleString('vi-VN') : '—'} <span className="text-slate-400">{n.dvt}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-slate-500">
                        Tình trạng mua theo hạng mục
                        {nvl.status.length > 0 && <span className="ml-1 font-normal normal-case text-slate-400">· {nvl.status.filter(nvlLinePending).length} dòng còn chờ / {nvl.status.length}</span>}
                      </p>
                      {nvl.status.length === 0 ? (
                        <p className="text-xs text-slate-400">Kế hoạch chưa ghi tình trạng mua cho hạng mục này.</p>
                      ) : (
                        <ul className="max-h-56 space-y-1 overflow-auto pr-1 custom-scrollbar">
                          {nvl.status.map((l, idx) => {
                            const pending = nvlLinePending(l);
                            const dueDate = parsePlanDate(l.due);
                            const late = pending && !!dueDate && dueDate.getTime() < today;
                            return (
                              <li key={idx} className={`rounded-md px-2 py-1.5 text-xs ${pending ? (late ? 'bg-orange-50' : 'bg-amber-50/60') : 'bg-slate-50'}`}>
                                <div className="flex items-start gap-2">
                                  <span className="min-w-0 flex-1 font-medium text-slate-800">{l.name}</span>
                                  <span className={`shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold ${
                                    !pending ? 'bg-emerald-100 text-emerald-700' : late ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-800'
                                  }`}>
                                    {!pending ? (l.state || (/CCLD/i.test(l.note) ? 'CCLD' : 'Đã về')) : late ? 'Trễ hẹn' : (l.state || 'Còn chờ')}
                                  </span>
                                </div>
                                <div className="mt-0.5 text-[0.6875rem] text-slate-500">
                                  {l.source === 'gcn' ? 'Gia công ngoài · ' : ''}
                                  KL {l.req ?? '—'} · đã về {l.got ?? '—'} · còn {l.left ?? '—'}
                                  {l.due ? ` · dự kiến giao ${l.due}` : ''}
                                  {l.note ? ` · ${l.note}` : ''}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {row.co_gia_cong_ngoai && (
                        <p className="mt-2 text-[0.6875rem] text-slate-500">
                          Gia công ngoài: <span className="font-semibold text-slate-700">{String(row.tinh_trang_gcn ?? '—')}</span>
                          {row.ngay_du_kien_ve_gcn ? ` · dự kiến về ${String(row.ngay_du_kien_ve_gcn)}` : ''}
                          {row.xuong_yeu_cau_gcn ? ` · xưởng yêu cầu ${String(row.xuong_yeu_cau_gcn)}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Lịch sử nhập kho */}
              <div className="rounded-lg border border-slate-200">
                <p className="border-b border-slate-100 px-4 py-2 text-xs font-semibold text-slate-700">
                  Lịch sử nhập kho <span className="font-normal text-slate-400">· {d.stockIn.length} lần</span>
                </p>
                {d.stockIn.length === 0 ? (
                  <p className="px-4 py-4 text-center text-xs text-slate-400">Chưa nhập kho.</p>
                ) : (
                  <div className="max-h-56 overflow-auto custom-scrollbar">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-50 text-slate-500">
                        <tr>
                          <th className="w-10 px-3 py-1.5 text-right font-medium">STT</th>
                          <th className="px-3 py-1.5 text-left font-medium">Ngày</th>
                          <th className="px-3 py-1.5 text-right font-medium">SL nhập</th>
                          <th className="px-3 py-1.5 text-right font-medium">Thành tiền (tỷ)</th>
                          <th className="px-3 py-1.5 text-left font-medium">Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {d.stockIn.map((s, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{i + 1}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{s.date}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{s.qty || '—'}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{s.value ? fmtTy(noteNumber(s.value)) : '—'}</td>
                            <td className="px-3 py-1.5 text-slate-600">{s.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* QC: bảng từng lần kiểm (parse từ cột tổng hợp QC) */}
              {qcEntries.length > 0 && (
                <div className="rounded-lg border border-slate-200">
                  <p className="border-b border-slate-100 px-4 py-2 text-xs font-semibold text-slate-700">
                    Kiểm tra QC <span className="font-normal text-slate-400">· {qcEntries.length} lần · {qcEntries.reduce((n, e) => n + e.fail, 0)} sản phẩm lỗi · mới nhất trước</span>
                  </p>
                  <div className="max-h-64 overflow-auto custom-scrollbar">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-medium">Ngày</th>
                          <th className="px-3 py-1.5 text-left font-medium">Công đoạn</th>
                          <th className="px-3 py-1.5 text-left font-medium">Kết quả</th>
                          <th className="px-3 py-1.5 text-right font-medium">Kiểm</th>
                          <th className="px-3 py-1.5 text-right font-medium">Đạt</th>
                          <th className="px-3 py-1.5 text-right font-medium">Lỗi</th>
                          <th className="px-3 py-1.5 text-left font-medium">QC</th>
                          <th className="px-3 py-1.5 text-left font-medium">Ghi chú</th>
                          <th className="px-3 py-1.5 text-right font-medium">Ảnh</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {qcEntries.map((e, i) => {
                          const bad = e.status === 'rejected' || e.status === 'flagged' || e.fail > 0;
                          const wait = e.status === 'pending' || e.status === 'submitted';
                          return (
                            <tr key={i} className={bad ? 'bg-red-50/40' : ''}>
                              <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{e.date}</td>
                              <td className="max-w-[200px] truncate px-3 py-1.5 text-slate-600" title={e.stage}>{e.stage || '—'}</td>
                              <td className="whitespace-nowrap px-3 py-1.5">
                                <span className={`rounded-full px-2 py-0.5 text-[0.625rem] font-semibold ${bad ? 'bg-red-100 text-red-700' : wait ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
                                  {QC_STATUS_VI[e.status] ?? e.status}
                                </span>
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(e.checked, 3)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">{fmtNum(e.pass, 3)}</td>
                              <td className={`px-3 py-1.5 text-right tabular-nums ${e.fail > 0 ? 'font-semibold text-red-600' : 'text-slate-400'}`}>{fmtNum(e.fail, 3)}</td>
                              <td className="whitespace-nowrap px-3 py-1.5 text-slate-600">{e.qc || '—'}</td>
                              <td className="max-w-[320px] px-3 py-1.5 text-slate-600"><span className="line-clamp-2 whitespace-pre-line" title={e.note}>{e.note || '—'}</span></td>
                              <td className="whitespace-nowrap px-3 py-1.5 text-right">
                                {e.photos.length === 0 ? <span className="text-slate-300">—</span> : (
                                  <button
                                    type="button"
                                    onClick={() => setPhotoView({ urls: e.photos, idx: 0, title: `QC ${e.date} · ${e.stage || ''}` })}
                                    title="Xem ảnh QC ngay trong app"
                                    className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-blue-700 hover:bg-blue-50"
                                  >
                                    <ImageIcon size={12} /> {e.photos.length} ảnh
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Ghi chú phiếu, mô tả (QC đã có bảng riêng; chỉ hiện nguyên văn khi không parse được) */}
              <div className="grid gap-4 lg:grid-cols-2">
                {[
                  { title: 'Ghi chú phiếu', text: row.ghi_chu_phieu },
                  { title: 'Thông tin QC', text: qcEntries.length ? '' : row.tong_hop_thong_tin_qc },
                  { title: 'Mô tả sản phẩm', text: row.mo_ta_san_pham },
                  { title: 'Ghi chú đơn hàng / xuất kho', text: [row.ghi_chu_don_hang_tong, row.tong_hop_ghi_chu_xuat_kho].filter(Boolean).join('\n') },
                ].filter(b => String(b.text ?? '').trim()).map(b => (
                  <div key={b.title} className="rounded-lg border border-slate-200 p-3">
                    <p className="mb-1 text-xs font-semibold text-slate-700">{b.title}</p>
                    <p className="max-h-48 overflow-auto whitespace-pre-line break-words text-xs text-slate-600 custom-scrollbar">{b.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {photoView && <LinkLightbox urls={photoView.urls} start={photoView.idx} title={photoView.title} onClose={() => setPhotoView(null)} />}
    </ModalShell>
  );
};
