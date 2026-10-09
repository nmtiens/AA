import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Download, ChevronUp, ChevronDown, ChevronsUpDown, Package } from 'lucide-react';
import { formatSmartDecimal } from '../../utils/numberParsers';
import { downloadCsvFile, rowsToCsvString } from '../../utils/csvExport';
import { MaterialPrTable, buildPrGroups, prGroupsToCsvRows } from './MaterialPrTable';
import { PrHexDetailModal } from './PrHexDetailModal';
import { isMaterialMissing, materialLineState } from '../../../../utils/productionMetrics';

// Vật tư liên quan đến các hạng mục (hex). Bảng vat_tu không có hex trực tiếp:
// backend map bằng mã nhà máy bỏ 4 số đầu (xem /api/material/by-hex).
export interface MaterialRow {
  /** Các hex (trong danh sách đang xem) mà dòng vật tư này khớp — 1 ô mã nhà máy có thể chứa nhiều mã */
  hexes: string[];
  /** Mã nhà máy khớp với các hex đang xem (ô gốc có thể gộp mã của nhiều hạng mục khác) */
  matched_codes: string[];
  /** Tổng số mã trong ô mã nhà máy gốc — > 1 nghĩa là vật tư mua gộp cho nhiều hạng mục */
  total_codes: number;
  /** Mã lấy từ cột nào: 'ma_nha_may' hoặc 'item_note_pr' (khi ô mã nhà máy trống) */
  code_source?: 'ma_nha_may' | 'item_note_pr' | null;
  /** Tổng số hex / dòng vật tư của PR này trên toàn bộ dữ liệu (không chỉ hex đang xem) */
  pr_total_hexes?: number | null;
  pr_total_lines?: number | null;
  ma_nha_may: string | null;
  /** Chỉ có ở dòng "chưa có mã nhà máy chỉ định" (map theo mã công trình) */
  trackingno?: string | null;
  ten_cong_trinh?: string | null;
  trang_thai: string | null;
  trang_thai_sap: string | null;
  tinh_trang_pr: string | null;
  nguoi_yeu_cau: string | null;
  so_pr: number | null;
  pr_line: number | null;
  ngay_pr: string | null;
  ma_vat_tu_sap: number | null;
  ten_vat_tu: string | null;
  nhom_vt: string | null;
  dvt: string | null;
  so_luong_yeu_cau: number | null;
  so_luong_da_nhan_sap: number | null;
  so_luong_con_lai: number | null;
  ngay_can_vat_tu: string | null;
  so_po: number | null;
  tinh_trang_po: string | null;
  ghi_chu_tinh_trang_po: string | null;
  ngay_du_kien_giao_hang_pmh_nhap: string | null;
  ngay_thuc_te_ve: string | null;
  ngay_ve: string | null;
  sl_hang_ve_thuc_te: string | null;
  team_pr_note: string | null;
  item_note_pr: string | null;
  ghi_chu_kho: string | null;
}

interface HexMaterialModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Tiêu đề phụ, vd "NGUYỄN NGỌC YẾN" hoặc tên công trình */
  title: string;
  /** Danh sách hex cần xem vật tư */
  hexes: string[];
  /** Tên hạng mục theo hex (để hiện cạnh mã hex) */
  hangMucByHex: Record<string, string>;
  /** Tên công trình theo hex — truyền khi danh sách gồm nhiều công trình */
  congTrinhByHex?: Record<string, string>;
  /** 'matched': vật tư map theo mã nhà máy; 'unassigned': vật tư cùng công trình chưa có mã nhà máy chỉ định */
  mode?: MaterialViewMode;
}

export type MaterialViewMode = 'matched' | 'unassigned';

type ColKind = 'text' | 'num' | 'date' | 'code';
interface ColDef {
  key: Exclude<keyof MaterialRow, 'hexes'> | 'hex' | 'hangMuc' | 'congTrinh';
  label: string;
  kind: ColKind;
  width: number;
}

const BASE_COLUMNS: ColDef[] = [
  { key: 'hex', label: 'Mã Hex', kind: 'text', width: 110 },
  { key: 'ma_nha_may', label: 'Mã nhà máy', kind: 'text', width: 125 },
  { key: 'hangMuc', label: 'Hạng mục', kind: 'text', width: 220 },
  { key: 'congTrinh', label: 'Công trình', kind: 'text', width: 200 },
  { key: 'trang_thai', label: 'Trạng thái', kind: 'text', width: 140 },
  { key: 'ma_vat_tu_sap', label: 'Mã VT (SAP)', kind: 'code', width: 120 },
  { key: 'ten_vat_tu', label: 'Tên vật tư', kind: 'text', width: 260 },
  { key: 'item_note_pr', label: 'Item note PR', kind: 'text', width: 260 },
  { key: 'nhom_vt', label: 'Nhóm VT', kind: 'text', width: 130 },
  { key: 'dvt', label: 'ĐVT', kind: 'text', width: 60 },
  { key: 'so_luong_yeu_cau', label: 'SL yêu cầu', kind: 'num', width: 90 },
  { key: 'so_luong_da_nhan_sap', label: 'SL đã nhận (SAP)', kind: 'num', width: 100 },
  { key: 'so_luong_con_lai', label: 'SL còn lại', kind: 'num', width: 90 },
  { key: 'so_pr', label: 'Số PR', kind: 'code', width: 110 },
  { key: 'pr_line', label: 'PR line', kind: 'code', width: 70 },
  { key: 'ngay_pr', label: 'Ngày PR', kind: 'date', width: 90 },
  { key: 'ngay_can_vat_tu', label: 'Ngày cần VT', kind: 'date', width: 95 },
  { key: 'so_po', label: 'Số PO', kind: 'code', width: 110 },
  { key: 'tinh_trang_po', label: 'Tình trạng PO', kind: 'text', width: 130 },
  { key: 'ngay_du_kien_giao_hang_pmh_nhap', label: 'Dự kiến giao (PMH)', kind: 'date', width: 105 },
  { key: 'ngay_thuc_te_ve', label: 'Ngày thực tế về', kind: 'date', width: 105 },
  { key: 'ngay_ve', label: 'Ngày về (kho báo)', kind: 'date', width: 105 },
  { key: 'sl_hang_ve_thuc_te', label: 'SL về thực tế (kho báo)', kind: 'text', width: 110 },
  { key: 'tinh_trang_pr', label: 'Tình trạng PR', kind: 'text', width: 120 },
  { key: 'team_pr_note', label: 'Team PR note', kind: 'text', width: 160 },
  { key: 'ghi_chu_tinh_trang_po', label: 'Ghi chú tình trạng PO', kind: 'text', width: 200 },
  { key: 'ghi_chu_kho', label: 'Ghi chú kho', kind: 'text', width: 180 },
  { key: 'nguoi_yeu_cau', label: 'Người yêu cầu', kind: 'text', width: 100 },
];

const fmtDate = (v: string | null): string => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('vi-VN');
};

const fmtNum = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? formatSmartDecimal(n, 3) : String(v);
};

// Số PR / PO / mã SAP là số lớn kiểu double — hiện nguyên dạng, không dấu phẩy.
const fmtCode = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) && typeof v === 'number' ? String(Math.round(n)) : String(v);
};

type SortDir = 'asc' | 'desc';

const COLLAPSE_LIMIT = 3;

export const HexMaterialModal = ({
  isOpen, onClose, title, hexes, hangMucByHex, congTrinhByHex, mode = 'matched',
}: HexMaterialModalProps) => {
  const [rows, setRows] = useState<MaterialRow[] | null>(null);
  const isUnassigned = mode === 'unassigned';
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [sort, setSort] = useState<{ key: ColDef['key']; dir: SortDir } | null>(null);
  // 'line': mỗi dòng 1 dòng vật tư; 'pr': gom theo số PR (1 PR mua cho bao nhiêu hex)
  const [groupBy, setGroupBy] = useState<'line' | 'pr'>('line');
  const byPr = groupBy === 'pr' && !isUnassigned;
  // PR đang mở popup "mua cho những hex nào"
  const [prDetail, setPrDetail] = useState<string | null>(null);
  const viewingHexSet = useMemo(() => new Set(hexes), [hexes]);

  const hexKey = useMemo(() => [...hexes].sort().join(','), [hexes]);

  useEffect(() => {
    if (!isOpen) {
      setSearch(''); setStatusFilter(''); setOnlyMissing(false); setSort(null); setGroupBy('line'); setPrDetail(null);
      return;
    }
    if (hexes.length === 0) { setRows([]); return; }
    const ctrl = new AbortController();
    setRows(null); setError(false);
    fetch('/api/material/by-hex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hexes, mode }),
      signal: ctrl.signal,
    })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { rows?: MaterialRow[] }) => {
        const list = Array.isArray(data?.rows) ? data.rows : [];
        setRows(mode === 'unassigned'
          ? list.map(r => ({ ...r, hexes: [], matched_codes: [], total_codes: 0 }))
          : list);
      })
      .catch(e => { if (e?.name !== 'AbortError') { setError(true); setRows([]); } });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, hexKey, mode]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const showProject = !!congTrinhByHex && new Set(Object.values(congTrinhByHex)).size > 1;
  const columns = useMemo(
    () => (isUnassigned
      // Chưa có mã nhà máy -> không biết thuộc hex/hạng mục nào, chỉ biết công trình
      ? BASE_COLUMNS.filter(c => c.key !== 'hex' && c.key !== 'hangMuc')
      : BASE_COLUMNS.filter(c => c.key !== 'congTrinh' || showProject)),
    [showProject, isUnassigned]
  );

  const cellValue = (row: MaterialRow, key: ColDef['key']): unknown => {
    // Nhiều hex / hạng mục trên 1 dòng: mỗi giá trị 1 dòng (ô dùng whitespace-pre-line)
    const uniq = (list: string[]) => Array.from(new Set(list.filter(Boolean))).join('\n');
    if (isUnassigned) {
      if (key === 'congTrinh') return row.ten_cong_trinh || row.trackingno || '';
      if (key === 'ma_nha_may') return row.ma_nha_may ?? '';
    }
    if (key === 'hex') return row.hexes.join('\n');
    if (key === 'hangMuc') return uniq(row.hexes.map(h => hangMucByHex[h] ?? ''));
    if (key === 'congTrinh') return uniq(row.hexes.map(h => congTrinhByHex?.[h] ?? ''));
    // Chỉ hiện mã khớp hạng mục đang xem, không hiện cả ô mua gộp
    if (key === 'ma_nha_may') return row.matched_codes.join('\n');
    return row[key];
  };

  const statuses = useMemo(() => {
    const m = new Map<string, number>();
    (rows || []).forEach(r => {
      const s = r.trang_thai || '(Trống)';
      m.set(s, (m.get(s) || 0) + 1);
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'vi'));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows || []).filter(r => {
      if (statusFilter && (r.trang_thai || '(Trống)') !== statusFilter) return false;
      if (onlyMissing && !isMaterialMissing(r)) return false;
      if (!q) return true;
      return [
        ...r.hexes, ...r.hexes.map(h => hangMucByHex[h]), r.ma_nha_may, r.ten_cong_trinh, r.trackingno, r.ten_vat_tu, r.item_note_pr, fmtCode(r.ma_vat_tu_sap),
        fmtCode(r.so_pr), fmtCode(r.so_po), r.nhom_vt, r.trang_thai, r.tinh_trang_po,
      ].some(v => String(v ?? '').toLowerCase().includes(q));
    });
  }, [rows, search, statusFilter, onlyMissing, hangMucByHex]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find(c => c.key === sort.key);
    const mul = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = cellValue(a, sort.key);
      const vb = cellValue(b, sort.key);
      if (va == null || va === '') return 1;
      if (vb == null || vb === '') return -1;
      if (col?.kind === 'num' || col?.kind === 'code') return (Number(va) - Number(vb)) * mul;
      if (col?.kind === 'date') return (new Date(String(va)).getTime() - new Date(String(vb)).getTime()) * mul;
      return String(va).localeCompare(String(vb), 'vi') * mul;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort, columns]);

  const stats = useMemo(() => {
    const all = rows || [];
    // "Hex có vật tư" không tính dòng PR đã HỦY — khớp số "N VT" ở danh sách HEX và tab BOM
    const live = all.filter(r => materialLineState(r) !== 'cancelled');
    const hexWithMaterial = new Set(live.flatMap(r => r.hexes)).size;
    const prCount = new Set(all.map(r => r.so_pr).filter(v => v != null)).size;
    const missing = all.filter(isMaterialMissing).length;
    const projectCount = new Set(all.map(r => r.trackingno).filter(Boolean)).size;
    return { lines: all.length, cancelled: all.length - live.length, hexWithMaterial, prCount, missing, projectCount };
  }, [rows]);

  // Dòng vật tư mua gộp có thể khớp hàng chục hex: mặc định ô nhiều giá trị chỉ hiện
  // COLLAPSE_LIMIT giá trị đầu, bấm "+N nữa" để mở cả dòng.
  const [expanded, setExpanded] = useState<Set<MaterialRow>>(() => new Set());
  useEffect(() => { setExpanded(new Set()); }, [rows]);
  const toggleExpanded = (row: MaterialRow) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(row)) next.delete(row); else next.add(row);
      return next;
    });

  const toggleSort = (key: ColDef['key']) =>
    setSort(prev => (!prev || prev.key !== key ? { key, dir: 'asc' }
      : prev.dir === 'asc' ? { key, dir: 'desc' } : null));

  const renderValue = (row: MaterialRow, col: ColDef): string => {
    const v = cellValue(row, col.key);
    if (col.kind === 'date') return fmtDate(v as string | null);
    if (col.kind === 'num') return fmtNum(v);
    if (col.kind === 'code') return fmtCode(v);
    return v == null ? '' : String(v);
  };

  const prCountShown = useMemo(
    () => (byPr ? new Set(filtered.map(r => r.so_pr)).size : 0),
    [byPr, filtered]
  );

  const handleExport = () => {
    if (byPr) {
      downloadCsvFile(`vat_tu_theo_pr_${title}.csv`, rowsToCsvString(prGroupsToCsvRows(buildPrGroups(filtered, hangMucByHex))));
      return;
    }
    const out = sorted.map((r, i) => {
      const o: Record<string, string | number> = { STT: i + 1 };
      columns.forEach(c => {
        o[c.label] = renderValue(r, c).replace(/\n/g, ', ');
        if (c.key === 'ma_nha_may') o['Mua gộp (tổng số mã)'] = r.total_codes > 1 ? r.total_codes : '';
      });
      return o;
    });
    downloadCsvFile(
      `${isUnassigned ? 'vat_tu_chua_co_ma_nha_may' : 'vat_tu_theo_hex'}_${title}.csv`,
      rowsToCsvString(out)
    );
  };

  if (!isOpen) return null;

  const tableWidth = 48 + columns.reduce((s, c) => s + c.width, 0);

  return createPortal(
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      // Portal vẫn lan sự kiện theo cây React: chặn lại để click trong popup này
      // không bị popup cha (vd popup PC có bấm nền để đóng) hiểu là bấm ra ngoài.
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <div
        className="flex flex-col rounded-xl bg-white shadow-xl"
        style={{ width: '98vw', maxWidth: 2200, height: '94vh' }}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800">
              <Package size={18} className="text-amber-600" />
              {isUnassigned ? 'Vật tư chưa có mã nhà máy chỉ định' : 'Vật tư theo hạng mục'} — {title}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {isUnassigned
                ? 'Hex không khớp được vật tư theo mã nhà máy → lấy vật tư cùng mã công trình có ô mã nhà máy trống / không có mã'
                : `${hexes.length} hex · map qua mã nhà máy (bỏ 4 số đầu = mã hex; 1 ô có nhiều mã thì tách từng mã; ô trống thì lấy mã trong Item note PR)`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExport}
              disabled={sorted.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-700 shadow-sm transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={15} />
              <span>Xuất CSV</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-3 px-5 pt-3 sm:grid-cols-4">
          {[
            { label: stats.cancelled ? `Dòng vật tư (gồm ${stats.cancelled} hủy)` : 'Dòng vật tư', value: stats.lines, cls: 'text-slate-800' },
            isUnassigned
              ? { label: 'Công trình', value: stats.projectCount, cls: 'text-slate-800' }
              : { label: 'Hex có vật tư', value: `${stats.hexWithMaterial} / ${hexes.length}`, cls: 'text-slate-800' },
            { label: 'Số PR', value: stats.prCount, cls: 'text-slate-800' },
            { label: 'Dòng còn thiếu (SL còn lại > 0)', value: stats.missing, cls: 'text-amber-600' },
          ].map(s => (
            <div key={s.label} className="rounded-lg border border-slate-200 px-3 py-2">
              <div className="text-[0.6875rem] text-slate-500">{s.label}</div>
              <div className={`text-lg font-bold ${s.cls}`}>{rows === null ? '…' : s.value}</div>
            </div>
          ))}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
          {!isUnassigned && (
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-xs font-semibold">
              {([['line', 'Theo dòng vật tư'], ['pr', 'Theo PR']] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setGroupBy(k)}
                  className={`px-3 py-1.5 transition-colors ${
                    groupBy === k ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="relative w-full max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Tìm theo hex, hạng mục, vật tư, PR, PO..."
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-300"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-emerald-400 focus:outline-none"
          >
            <option value="">Trạng thái: Tất cả</option>
            {statuses.map(([s, n]) => (
              <option key={s} value={s}>{s} ({n})</option>
            ))}
          </select>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} />
            Chỉ dòng còn thiếu
          </label>
          <span className="ml-auto text-xs text-slate-500">
            {byPr ? `${prCountShown} PR · ${sorted.length} dòng` : `${sorted.length} dòng`}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 pb-4 custom-scrollbar">
          {rows === null ? (
            <div className="p-8 text-center text-sm text-slate-400">Đang tải vật tư...</div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-red-500">Không tải được dữ liệu vật tư.</div>
          ) : byPr && sorted.length > 0 ? (
            <MaterialPrTable
              rows={filtered}
              hangMucByHex={hangMucByHex}
              onOpenPr={(pr) => { setGroupBy('line'); setSearch(pr); setSort(null); }}
              onOpenPrHexes={setPrDetail}
            />
          ) : sorted.length === 0 ? (
            <div className="mt-3 rounded-lg bg-slate-50 p-8 text-center text-slate-500">
              {stats.lines > 0
                ? 'Không có dòng vật tư phù hợp bộ lọc.'
                : isUnassigned
                  ? 'Công trình không có vật tư nào chưa có mã nhà máy.'
                  : 'Không có vật tư nào gắn với các hex này (không tìm thấy mã nhà máy tương ứng).'}
            </div>
          ) : (
            <table className="border-separate border-spacing-0 text-xs" style={{ width: tableWidth, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 48 }} />
                {columns.map(c => <col key={c.key} style={{ width: c.width }} />)}
              </colgroup>
              <thead className="sticky top-0 z-10 font-bold uppercase tracking-tight text-slate-800">
                <tr>
                  <th className="border-b border-r border-emerald-200 bg-emerald-50 px-2 py-3 text-center">STT</th>
                  {columns.map(c => (
                    <th
                      key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className={`cursor-pointer select-none border-b border-r border-emerald-200 bg-emerald-50 px-2 py-3 transition-colors hover:bg-emerald-100 ${
                        c.kind === 'num' ? 'text-right' : 'text-left'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {c.label}
                        {sort?.key === c.key
                          ? (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
                          : <ChevronsUpDown size={12} className="text-slate-300" />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => {
                  const missing = isMaterialMissing(r);
                  return (
                    <tr key={`${r.hexes[0]}-${r.so_pr}-${r.pr_line}-${i}`} className="hover:bg-slate-50">
                      <td className="border-b border-r border-slate-100 px-2 py-2 text-center align-top font-semibold text-slate-500">{i + 1}</td>
                      {columns.map(c => (
                        <td
                          key={c.key}
                          className={`whitespace-pre-line break-words border-b border-r border-slate-100 px-2 py-2 align-top ${
                            c.kind === 'num' ? 'text-right tabular-nums' : 'text-left'
                          } ${c.key === 'hex' ? 'font-medium text-slate-700' : 'text-slate-600'} ${
                            c.key === 'so_luong_con_lai' && missing ? 'font-semibold text-amber-600' : ''
                          }`}
                        >
                          {(() => {
                            const text = renderValue(r, c);
                            if (!text) return <span className="text-slate-300">—</span>;
                            const parts = text.split('\n');
                            if (parts.length <= COLLAPSE_LIMIT) return text;
                            const open = expanded.has(r);
                            return (
                              <>
                                {open ? text : parts.slice(0, COLLAPSE_LIMIT).join('\n')}
                                <button
                                  type="button"
                                  onClick={() => toggleExpanded(r)}
                                  className="mt-0.5 block text-[0.6875rem] font-semibold text-amber-700 hover:underline"
                                >
                                  {open ? 'Thu gọn ▴' : `+${parts.length - COLLAPSE_LIMIT} nữa ▾`}
                                </button>
                              </>
                            );
                          })()}
                          {c.key === 'ma_nha_may' && r.total_codes > r.matched_codes.length && (
                            <div
                              className="mt-0.5 text-[0.625rem] italic text-slate-400"
                              title="Vật tư này mua gộp cho nhiều hạng mục — số lượng là của cả đơn mua gộp"
                            >
                              Mua gộp {r.total_codes} mã
                            </div>
                          )}
                          {c.key === 'ma_nha_may' && r.code_source === 'item_note_pr' && (
                            <div
                              className="mt-0.5 text-[0.625rem] italic text-sky-600"
                              title="Ô Mã nhà máy trống — mã được lấy từ cột Item note PR"
                            >
                              lấy từ Item note PR
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <PrHexDetailModal
        isOpen={prDetail !== null}
        onClose={() => setPrDetail(null)}
        pr={prDetail ?? ''}
        viewingHexes={viewingHexSet}
      />
    </div>,
    document.body
  );
};
