import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, ChevronUp, ChevronDown, ChevronsUpDown, Download } from 'lucide-react';
import { formatSmartDecimal, formatDecimalFull, parseNumber } from '../../utils/numberParsers';
import { exportDetailRowsToCsv } from '../../utils/csvExport';
import { DataRow } from '../../../../types';
import { formatDateDisplay } from '../../utils/dateHelpers';
import { ModalColumnSetupButton } from '../../../Construction/utils/ModalColumnSetupButton';
import { resolveVisibleModalColumns, ModalColumnDef } from '../../../Construction/utils/tableColumnConfig';

export interface InventoryDetailColumnKeys {
  hexKey: string;
  congTrinhKey: string;
  xuongKey: string;
  dateKey: string;
  thanhTienKey: string;
  // Cột ghi chú nhập kho — tùy chọn, mặc định là tên cột trong DB
  ghiChuKey?: string;
  // Cột số lượng nhập kho — tùy chọn, mặc định là tên cột trong DB.
  // ✅ MỚI: backend đã có sẵn field này trong bảng nhap_kho.
  soLuongKey?: string;
  // ✅ MỚI: Tên Hạng Mục — tùy chọn, mặc định 'ten_hang_muc'.
  hangMucKey?: string;
}

interface InventoryDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string | null;
  rows: DataRow[];
  columnKeys: InventoryDetailColumnKeys;
}

const money = (value: number) => formatSmartDecimal(value / 1000);
const quantity = (value: number) => formatSmartDecimal(value);

const moneyTotal = (value: number) => formatDecimalFull(value / 1000);
const quantityTotal = (value: number) => formatDecimalFull(value);

const PREVIEW_LIMIT = 100;
const truncateText = (text: string, limit = PREVIEW_LIMIT) =>
  text.length > limit ? `${text.slice(0, limit)}...` : text;

// Độ rộng PX THẬT SỰ của từng cột (dùng trực tiếp trong <colgroup>, không quy
// đổi ra %). Nhờ vậy offset "sticky left" của cột Mã Hex luôn khớp chính xác
// với độ rộng thật của cột STT đứng trước nó, bất kể modal rộng bao nhiêu.
const COL_WIDTHS = {
  stt: 50,
  hex: 150,
  hangMuc: 260, // ✅ MỚI — Tên Hạng Mục
  congTrinh: 200,
  xuong: 100,
  date: 120,
  soLuong: 110, // ✅ MỚI
  thanhTien: 140,
  ghiChu: 320,
};

type SortKey = 'stt' | 'hex' | 'hangMuc' | 'congTrinh' | 'xuong' | 'date' | 'soLuong' | 'thanhTien' | 'ghiChu';
type SortDir = 'asc' | 'desc';

// Các cột "phụ" — có thể ẩn/hiện và SẮP XẾP LẠI THỨ TỰ qua Setup cột (Admin),
// đồng bộ cơ chế với ExportDetailModal (Xuất kho).
type OptionalColKey = 'hangMuc' | 'congTrinh' | 'xuong' | 'date' | 'soLuong' | 'thanhTien' | 'ghiChu';

const COLUMN_META: Record<OptionalColKey, { label: React.ReactNode; sortKey: SortKey; align?: 'left' | 'right' }> = {
  hangMuc: { label: 'Hạng Mục', sortKey: 'hangMuc' },
  congTrinh: { label: 'Công Trình', sortKey: 'congTrinh' },
  xuong: { label: 'Khu Vực SX', sortKey: 'xuong' },
  date: { label: 'Ngày Nhập', sortKey: 'date' },
  soLuong: { label: 'Số Lượng', sortKey: 'soLuong', align: 'right' },
  thanhTien: { label: 'Thành Tiền', sortKey: 'thanhTien', align: 'right' },
  ghiChu: { label: <>Ghi Chú <br />Nhập Kho</>, sortKey: 'ghiChu' },
};

const NUMERIC_SORT_KEYS: SortKey[] = ['thanhTien', 'soLuong'];

const SortIcon = ({ active, dir }: { active: boolean; dir?: SortDir }) => {
  if (!active) return <ChevronsUpDown size={12} className="shrink-0 text-slate-400" />;
  return dir === 'asc' ? (
    <ChevronUp size={12} className="shrink-0 text-emerald-700" />
  ) : (
    <ChevronDown size={12} className="shrink-0 text-emerald-700" />
  );
};

const parseDateValue = (value: unknown): number => {
  const s = String(value ?? '').trim();
  if (!s) return -Infinity;
  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) return iso;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
  return -Infinity;
};

export const InventoryDetailModal = ({
  isOpen,
  onClose,
  projectName,
  rows,
  columnKeys,
}: InventoryDetailModalProps) => {
  const {
    hexKey, congTrinhKey, xuongKey, dateKey, thanhTienKey,
    ghiChuKey = 'ghi_chu',
    soLuongKey = 'so_luong_nhap_kho', // ✅ MỚI — chỉnh lại nếu tên cột thật trong DB khác
    hangMucKey = 'ten_hang_muc', // ✅ MỚI
  } = columnKeys;

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [selectedNote, setSelectedNote] = useState<{ row: DataRow } | null>(null);

  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const footerScrollRef = useRef<HTMLDivElement>(null);
  const [scrollbarWidth, setScrollbarWidth] = useState(0);

useEffect(() => {
  if (!isOpen) {
    setSearch('');
    setSort(null);
    setSelectedNote(null);
    return;
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (selectedNote) return;
    onClose();
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}, [isOpen, onClose, selectedNote]);

const getNotePreview = useCallback(
  (row: DataRow): string => String(row[ghiChuKey] ?? ''),
  [ghiChuKey]
);

const openNoteCell = useCallback((row: DataRow, e: React.MouseEvent) => {
  e.stopPropagation();
  setSelectedNote({ row });
}, []);

  useEffect(() => {
    if (!isOpen) return;
    const measure = () => {
      const el = bodyScrollRef.current;
      if (el) setScrollbarWidth(el.offsetWidth - el.clientWidth);
    };
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, [isOpen, rows, search]);

  const handleBodyScroll = useCallback(() => {
    const left = bodyScrollRef.current?.scrollLeft ?? 0;
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = left;
    if (footerScrollRef.current) footerScrollRef.current.scrollLeft = left;
  }, []);

  const toggleSort = useCallback((key: SortKey) => {
    const defaultDir: SortDir = NUMERIC_SORT_KEYS.includes(key) || key === 'date' ? 'desc' : 'asc';
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: defaultDir };
      if (prev.dir === defaultDir) return { key, dir: defaultDir === 'asc' ? 'desc' : 'asc' };
      return null;
    });
  }, []);

  const showProjectColumn = projectName === null;

  // ==== Setup cột hiển thị (chỉ Admin) — đồng bộ cơ chế với Xuất kho ====
  const [cfgVersion, setCfgVersion] = useState(0);

  const OPTIONAL_COLUMNS: ModalColumnDef[] = useMemo(() => [
    { key: 'hangMuc', label: 'Hạng Mục' },
    ...(showProjectColumn ? [{ key: 'congTrinh', label: 'Công Trình' }] : []),
    { key: 'xuong', label: 'Khu Vực SX' },
    { key: 'date', label: 'Ngày Nhập' },
    { key: 'soLuong', label: 'Số Lượng' },
    { key: 'thanhTien', label: 'Thành Tiền' },
    { key: 'ghiChu', label: 'Ghi Chú Nhập Kho' },
  ], [showProjectColumn]);

  const visibleCols = useMemo(
    () => resolveVisibleModalColumns('modal_inventory_detail', OPTIONAL_COLUMNS),
    [OPTIONAL_COLUMNS, cfgVersion]
  );
  const V = (key: string) => visibleCols.some(c => c.key === key);

  // ✅ Thứ tự cột thực tế cần render — lấy trực tiếp từ visibleCols (đã được
  // resolveVisibleModalColumns sắp xếp đúng theo cấu hình Admin đã lưu/kéo-thả).
  const orderedCols = useMemo(
    () => visibleCols.map(c => c.key) as OptionalColKey[],
    [visibleCols]
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(row => {
      const hex = String(row[hexKey] || '').toLowerCase();
      const xuong = String(row[xuongKey] || '').toLowerCase();
      const date = String(row[dateKey] || '').toLowerCase();
      return hex.includes(q) || xuong.includes(q) || date.includes(q);
    });
  }, [rows, search, hexKey, xuongKey, dateKey]);

  const groupedDefaultRows = useMemo(() => {
    const groups = new Map<string, DataRow[]>();
    filteredRows.forEach((row) => {
      const hex = String(row[hexKey] || '');
      const arr = groups.get(hex) ?? [];
      arr.push(row);
      groups.set(hex, arr);
    });
    const groupList = Array.from(groups.values()).map((groupRows) => {
      const sortedGroup = [...groupRows].sort(
        (a, b) => parseDateValue(b[dateKey]) - parseDateValue(a[dateKey])
      );
      const maxDate = sortedGroup.reduce((max, r) => Math.max(max, parseDateValue(r[dateKey])), -Infinity);
      return { sortedGroup, maxDate };
    });
    groupList.sort((a, b) => b.maxDate - a.maxDate);
    return groupList.flatMap((g) => g.sortedGroup);
  }, [filteredRows, hexKey, dateKey]);

  const indexedRows = useMemo(() => {
    const source = sort ? filteredRows : groupedDefaultRows;
    let sttCounter = 0;
    let lastHex: string | null = null;
    return source.map((row) => {
      const hexVal = String(row[hexKey] || '');
      if (hexVal !== lastHex) {
        sttCounter += 1;
        lastHex = hexVal;
      }
      return { row, stt: sttCounter };
    });
  }, [filteredRows, groupedDefaultRows, sort, hexKey]);

  const sortedRows = useMemo(() => {
    if (!sort) return indexedRows;
    if (sort.key === 'stt') {
      const sorted = [...indexedRows].sort((a, b) => a.stt - b.stt);
      return sort.dir === 'desc' ? sorted.reverse() : sorted;
    }
const getValue = (row: DataRow): number | string => {
  switch (sort.key) {
    case 'hex': return String(row[hexKey] || '');
    case 'hangMuc': return String(row[hangMucKey] || ''); // ✅ MỚI
    case 'congTrinh': return String(row[congTrinhKey] || '');
    case 'xuong': return String(row[xuongKey] || '');
    case 'date': return parseDateValue(row[dateKey]);
    case 'soLuong': return parseNumber(row[soLuongKey]);
    case 'thanhTien': return parseNumber(row[thanhTienKey]);
    case 'ghiChu': return getNotePreview(row);
    default: return '';
  }
};
    const sorted = [...indexedRows].sort((a, b) => {
      const va = getValue(a.row);
      const vb = getValue(b.row);
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va).localeCompare(String(vb), 'vi');
      }
      return (va as number) - (vb as number);
    });
    return sort.dir === 'desc' ? sorted.reverse() : sorted;
  }, [indexedRows, sort, hexKey, hangMucKey, congTrinhKey, xuongKey, dateKey, soLuongKey, thanhTienKey, getNotePreview]);

  const totals = useMemo(() => {
    return filteredRows.reduce((acc, row) => acc + parseNumber(row[thanhTienKey]), 0);
  }, [filteredRows, thanhTienKey]);

  // ✅ MỚI: tổng số lượng nhập kho, hiển thị ở dòng TỔNG CỘNG cạnh thành tiền.
  const totalQuantity = useMemo(() => {
    return filteredRows.reduce((acc, row) => acc + parseNumber(row[soLuongKey]), 0);
  }, [filteredRows, soLuongKey]);

  const groupCount = useMemo(() => {
    const set = new Set(filteredRows.map(row => String(row[hexKey] || '')));
    return set.size;
  }, [filteredRows, hexKey]);

  if (!isOpen) return null;

const exportColumns = [
  'STT', 'Mã Hex', 'Hạng Mục', // ✅ MỚI
  ...(showProjectColumn ? ['Công Trình'] : []),
  'Khu Vực SX', 'Ngày Nhập', 'Số Lượng Nhập Kho', 'Thành Tiền Nhập Kho (1000 VNĐ)', 'Ghi Chú Nhập Kho',
];

  const exportFileName = `chi_tiet_nhap_kho_${(projectName ?? 'tat_ca_cong_trinh')
    .toString().trim().replace(/\s+/g, '_')}`;

const handleExportCsv = () => {
  const exportRows = sortedRows.map(({ row, stt }) => ({
    'STT': stt,
    'Mã Hex': String(row[hexKey] || ''),
    'Hạng Mục': String(row[hangMucKey] || ''), // ✅ MỚI
    ...(showProjectColumn ? { 'Công Trình': String(row[congTrinhKey] || '') } : {}),
    'Khu Vực SX': String(row[xuongKey] || ''),
    'Ngày Nhập': formatDateDisplay(row[dateKey]),
    'Số Lượng Nhập Kho': parseNumber(row[soLuongKey]),
    'Thành Tiền Nhập Kho (1000 VNĐ)': parseNumber(row[thanhTienKey]) / 1000,
    'Ghi Chú Nhập Kho': String(row[ghiChuKey] ?? ''),
  }));
  exportDetailRowsToCsv(exportFileName, exportColumns, exportRows);
};

// ✅ totalMinWidth vẫn dùng để tính min-width tổng của bảng (đảm bảo scroll
// ngang khi màn hình hẹp) — tính động theo orderedCols thay vì cộng cứng.
const totalMinWidth =
  COL_WIDTHS.stt + COL_WIDTHS.hex +
  orderedCols.reduce((sum, key) => sum + COL_WIDTHS[key], 0);

  const tableStyle: React.CSSProperties = { width: '100%', minWidth: totalMinWidth, tableLayout: 'fixed' };

// ✅ Colgroup dùng PX cố định cho STT + Hex + mọi cột phụ, LẶP THEO
// orderedCols để đúng thứ tự đã setup. Cột phụ CUỐI CÙNG trong orderedCols
// (bất kể đó là cột nào) không khai báo width -> với table-layout: fixed, nó
// tự hấp thụ phần không gian còn thừa khi modal rộng hơn totalMinWidth,
// giống hành vi gốc (trước đây cố định là cột Ghi Chú vì nó luôn ở cuối).
const ColGroup = () => (
  <colgroup>
    <col style={{ width: COL_WIDTHS.stt }} />
    <col style={{ width: COL_WIDTHS.hex }} />
    {orderedCols.map((key, i) => {
      const isLast = i === orderedCols.length - 1;
      return isLast
        ? <col key={key} />
        : <col key={key} style={{ width: COL_WIDTHS[key] }} />;
    })}
  </colgroup>
);

  const headerCellClass =
    'cursor-pointer select-none border-b border-r border-indigo-200 bg-indigo-50 px-3 py-3 transition-colors hover:bg-indigo-100';

  const SortableHeader = ({
    sortKey, align = 'left', children, isLast = false,
  }: { sortKey: SortKey; align?: 'left' | 'right'; children: React.ReactNode; isLast?: boolean }) => (
    <th
      onClick={() => toggleSort(sortKey)}
      className={`${isLast ? headerCellClass.replace('border-r ', '') : headerCellClass} ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {children}
        <SortIcon active={sort?.key === sortKey} dir={sort?.dir} />
      </span>
    </th>
  );

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
      <div
        className="flex flex-col rounded-xl bg-white shadow-xl"
        style={{ width: '98vw', maxWidth: 2200, height: '96vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-800">Chi tiết Đã Nhập Kho P022</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {projectName ?? 'Tất cả công trình'} · {filteredRows.length} dòng · Đơn vị tiền: 1,000 VNĐ
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ModalColumnSetupButton
              modalId="modal_inventory_detail"
              allColumns={OPTIONAL_COLUMNS}
              onChange={() => setCfgVersion(v => v + 1)}
            />
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredRows.length === 0}
              title="Xuất dữ liệu đang hiển thị ra file .CSV"
              className="flex items-center gap-1.5 rounded-lg border border-indigo-600 bg-indigo-50 px-3.5 py-1.5 text-xs font-bold text-indigo-700 shadow-sm transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
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

        <div className="shrink-0 border-b border-slate-100 px-5 py-3">
          <div className="relative max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo mã hex, khu vực SX, ngày nhập..."
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
            />
          </div>
        </div>

        {filteredRows.length > 0 ? (
          <>
            <div className="shrink-0 overflow-hidden border-b border-indigo-200 bg-indigo-50 px-5 pt-5">
              <div className="flex">
                <div ref={headerScrollRef} className="min-w-0 flex-1 overflow-x-hidden">
                  <table style={tableStyle} className="border-separate border-spacing-0 text-xs">
                    <ColGroup />
                    <thead className="font-bold uppercase tracking-tight text-slate-800">
                      <tr>
                        <th
                          onClick={() => toggleSort('stt')}
                          style={{ left: 0 }}
                          className="sticky z-10 cursor-pointer select-none border-b border-r border-indigo-200 bg-indigo-50 px-2 py-3 text-center transition-colors hover:bg-indigo-100"
                        >
                          <span className="inline-flex items-center justify-center gap-1">
                            STT
                            <SortIcon active={sort?.key === 'stt'} dir={sort?.dir} />
                          </span>
                        </th>
                        <th
                          onClick={() => toggleSort('hex')}
                          style={{ left: COL_WIDTHS.stt }}
                          className="sticky z-10 min-w-[140px] cursor-pointer select-none border-b border-r border-indigo-200 bg-indigo-50 px-3 py-3 text-left transition-colors hover:bg-indigo-100"
                        >
                          <span className="inline-flex items-center gap-1">
                            Mã Hex
                            <SortIcon active={sort?.key === 'hex'} dir={sort?.dir} />
                          </span>
                        </th>
                        {/* ✅ Header lặp theo orderedCols (đúng thứ tự đã setup) thay vì
                            các SortableHeader hardcode theo vị trí cố định như trước. */}
                        {orderedCols.map((key, i) => {
                          const meta = COLUMN_META[key];
                          const isLast = i === orderedCols.length - 1;
                          return (
                            <SortableHeader key={key} sortKey={meta.sortKey} align={meta.align} isLast={isLast}>
                              {meta.label}
                            </SortableHeader>
                          );
                        })}
                      </tr>
                    </thead>
                  </table>
                </div>
                {scrollbarWidth > 0 && <div style={{ width: scrollbarWidth }} className="shrink-0" />}
              </div>
            </div>

            <div ref={bodyScrollRef} onScroll={handleBodyScroll} className="min-h-0 flex-1 overflow-auto custom-scrollbar px-5">
              <table style={tableStyle} className="border-separate border-spacing-0 text-xs">
                <ColGroup />
                <tbody>
                  {sortedRows.map((entry, idx) => {
                    const row = entry.row;
                    const hexValue = String(row[hexKey] || '—');
                    const xuongValue = String(row[xuongKey] || '—');

                    const shouldGroupHex = !sort || sort.key === 'hex';
                    const prevHexValue = idx > 0 ? String(sortedRows[idx - 1].row[hexKey] || '—') : null;
                    const isHexGroupStart = !shouldGroupHex || hexValue !== prevHexValue;

                    let hexRowSpan = 1;
                    if (shouldGroupHex && isHexGroupStart) {
                      let j = idx + 1;
                      while (j < sortedRows.length && String(sortedRows[j].row[hexKey] || '—') === hexValue) {
                        hexRowSpan++; j++;
                      }
                    }

                    const prevXuongValue = idx > 0 ? String(sortedRows[idx - 1].row[xuongKey] || '—') : null;
                    const isXuongGroupStart = isHexGroupStart || xuongValue !== prevXuongValue;

                    let xuongRowSpan = 1;
                    if (isXuongGroupStart) {
                      let j = idx + 1;
                      while (
                        j < sortedRows.length &&
                        String(sortedRows[j].row[hexKey] || '—') === hexValue &&
                        String(sortedRows[j].row[xuongKey] || '—') === xuongValue
                      ) {
                        xuongRowSpan++; j++;
                      }
                    }

                    const rowTopBorder = isHexGroupStart && idx > 0 ? 'border-t-2 border-t-indigo-200' : '';
                    const cellBorder = 'border-b border-slate-200';

                    // ✅ Render 1 ô "phụ" theo key — dùng chung logic rowSpan/nhóm ở
                    // trên, nhưng vị trí trong hàng giờ do orderedCols.map quyết
                    // định, không hardcode.
                    const renderCell = (key: OptionalColKey): React.ReactNode => {
                      switch (key) {
                        case 'hangMuc':
                          return isHexGroupStart ? (
                            <td
                              key="hangMuc"
                              rowSpan={hexRowSpan}
                              className={`border-r ${cellBorder} px-3 py-2.5 text-left align-middle text-slate-700`}
                            >
                              {String(row[hangMucKey] || '—')}
                            </td>
                          ) : null;

                        case 'congTrinh':
                          return showProjectColumn ? (
                            <td key="congTrinh" className={`px-3 py-2.5 text-left align-top text-slate-700 ${cellBorder}`}>
                              {String(row[congTrinhKey] || '—')}
                            </td>
                          ) : null;

                        case 'xuong':
                          return isXuongGroupStart ? (
                            <td
                              key="xuong"
                              rowSpan={xuongRowSpan}
                              className={`border-r ${cellBorder} bg-slate-50 px-3 py-2.5 text-left align-middle font-medium text-slate-700`}
                            >
                              {xuongValue}
                            </td>
                          ) : null;

                        case 'date':
                          return (
                            <td key="date" className={`px-3 py-2.5 text-left align-top text-slate-600 ${cellBorder}`}>
                              {formatDateDisplay(row[dateKey]) || '—'}
                            </td>
                          );

                        case 'soLuong':
                          return (
                            <td key="soLuong" className={`px-3 py-2.5 text-right align-top text-slate-700 ${cellBorder}`}>
                              {quantity(parseNumber(row[soLuongKey]))}
                            </td>
                          );

                        case 'thanhTien':
                          return (
                            <td key="thanhTien" className={`px-3 py-2.5 text-right align-top font-medium text-indigo-700 ${cellBorder}`}>
                              {money(parseNumber(row[thanhTienKey]))}
                            </td>
                          );

                        case 'ghiChu':
                          return (
                            <td
                              key="ghiChu"
                              onClick={(e) => openNoteCell(row, e)}
                              title="Bấm để xem đầy đủ nội dung"
                              className={`cursor-pointer px-3 py-2.5 text-left align-top text-slate-600 break-words whitespace-normal transition-colors hover:bg-indigo-50 ${cellBorder}`}
                            >
                              {truncateText(getNotePreview(row)) || '—'}
                            </td>
                          );

                        default:
                          return null;
                      }
                    };

                    return (
                      <tr key={idx} className={`transition-colors hover:bg-indigo-50/40 ${rowTopBorder}`}>
                        {isHexGroupStart && (
                          <td
                            rowSpan={hexRowSpan}
                            style={{ left: 0 }}
                            className={`sticky z-10 border-r ${cellBorder} bg-indigo-50/60 px-2 py-2.5 text-center align-middle font-semibold text-slate-700`}
                          >
                            {entry.stt}
                          </td>
                        )}
                        {isHexGroupStart && (
                          <td
                            rowSpan={hexRowSpan}
                            style={{ left: COL_WIDTHS.stt }}
                            className={`sticky z-10 border-r ${cellBorder} bg-indigo-50/60 px-3 py-2.5 text-left align-middle font-bold text-slate-800`}
                          >
                            {hexValue}
                          </td>
                        )}
                        {orderedCols.map((key) => renderCell(key))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="shrink-0 overflow-hidden border-t-2 border-indigo-400 bg-indigo-100 px-5 shadow-[0_-2px_6px_rgba(0,0,0,0.06)]">
              <div className="flex">
                <div ref={footerScrollRef} className="min-w-0 flex-1 overflow-x-hidden">
                  <table style={tableStyle} className="border-separate border-spacing-0 text-xs">
                    <ColGroup />
                <tfoot className="font-bold text-slate-900">
  <tr>
    {(() => {
      const numericKeys: OptionalColKey[] = ['soLuong', 'thanhTien'];
      const cells: React.ReactNode[] = [];
      let pendingSpan = 2; // STT + Mã Hex luôn có mặt
      let labelRendered = false;

      const flushLabel = () => {
        cells.push(
          <td
            key="label"
            className="sticky left-0 z-10 bg-indigo-100 px-3 py-3 text-left"
            colSpan={pendingSpan}
          >
            TỔNG CỘNG ({groupCount} mã Hex)
          </td>
        );
        labelRendered = true;
      };

      orderedCols.forEach((key) => {
        const isNumeric = numericKeys.includes(key);
        const isNote = key === 'ghiChu';

        // Cột text (hangMuc/congTrinh/xuong/date) CHỈ được gộp vào ô nhãn khi
        // nó còn đứng liền đầu. Nếu nó bị Admin kéo ra sau một cột số liệu
        // hoặc cột ghi chú thì vẫn phải có ô riêng (trống) để không lệch cột.
        if (!labelRendered && !isNumeric && !isNote) {
          pendingSpan += 1;
          return;
        }

        if (!labelRendered) flushLabel();

        if (isNumeric) {
          cells.push(
            <td key={key} className="px-3 py-3 text-right">
              {key === 'soLuong' ? quantityTotal(totalQuantity) : moneyTotal(totals)}
            </td>
          );
        } else {
          // ghiChu hoặc cột text đến muộn — ô trống để giữ số cột khớp
          cells.push(<td key={key} className="px-3 py-3" />);
        }
      });

      // Trường hợp không có cột số liệu/ghi chú nào được hiển thị
      if (!labelRendered) flushLabel();

      return cells;
    })()}
  </tr>
</tfoot>
                  </table>
                </div>
                {scrollbarWidth > 0 && <div style={{ width: scrollbarWidth }} className="shrink-0" />}
              </div>
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto p-5">
            <div className="rounded-lg bg-slate-50 p-8 text-center text-slate-500">
              Không có dữ liệu nhập kho phù hợp.
            </div>
          </div>
        )}
      </div>

      {selectedNote && (
  <div
    className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 p-4"
    role="dialog"
    aria-modal="true"
  >
    <div className="flex h-[92vh] w-[96vw] max-w-none flex-col rounded-xl bg-white shadow-2xl">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-slate-800">Ghi chú nhập kho</h3>
          <p className="mt-0.5 break-words text-xs text-slate-500">
            Hex {String(selectedNote.row[hexKey] || '—')}
            {showProjectColumn && selectedNote.row[congTrinhKey]
              ? ` · ${String(selectedNote.row[congTrinhKey])}`
              : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSelectedNote(null)}
          aria-label="Đóng"
          className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={20} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-6 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
        {String(selectedNote.row[ghiChuKey] ?? '') || 'Không có dữ liệu'}
      </div>
    </div>
  </div>
)}
    </div>
  );
};