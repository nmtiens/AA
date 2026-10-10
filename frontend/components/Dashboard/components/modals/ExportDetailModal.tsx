import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, X, ChevronUp, ChevronDown, ChevronsUpDown, Download,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { parseNumber } from '../../utils/numberParsers';
import { TY_UNIT_LABEL, formatTrieuAsTy } from '../../../../utils/money';
import { exportDetailRowsToCsv } from '../../utils/csvExport';
import { DataRow } from '../../../../types';
import { formatDateDisplay } from '../../utils/dateHelpers';
import { ModalColumnSetupButton } from '../../../Construction/utils/ModalColumnSetupButton';
import { resolveVisibleModalColumns, ModalColumnDef } from '../../../Construction/utils/tableColumnConfig';
import { useFrozenColumns, applyFrozen, fzClass, fzStyle } from '../../../Construction/utils/useFrozenColumns';

export interface ExportDetailColumnKeys {
  hexKey: string;
  congTrinhKey: string;
  xuongKey: string;
  dateKey: string;
  soLuongKey: string;
  thanhTienKey: string;
  ghiChuXuatKhoKey?: string;
  hangMucKey?: string;
}

interface ExportDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string | null;
  rows: DataRow[];
  columnKeys: ExportDetailColumnKeys;
}

// Giá trị gốc là triệu đồng (xem utils/money.ts) — hiển thị Tỷ, 2 chữ số thập phân
const money = (value: number) => formatTrieuAsTy(value);
const moneyTotal = (value: number) => formatTrieuAsTy(value);

const PREVIEW_LIMIT = 100;
const truncateText = (text: string, limit = PREVIEW_LIMIT) =>
  text.length > limit ? `${text.slice(0, limit)}...` : text;

// ===== Tách nội dung ghi chú theo mốc ngày + hiển thị ảnh Google Drive =====
interface NoteBlock {
  date: string | null;
  lines: string[];
}

const splitNoteLines = (s: string): string[] =>
  s.split('#').map((x) => x.trim()).filter(Boolean);

const parseNoteBlocks = (text: string): NoteBlock[] => {
  const src = text.trim();
  if (!src) return [];

  const marks = [...src.matchAll(/(\d{2}\/\d{2}\/\d{4})(?=:?\s*(?:#|$))/g)];
  if (marks.length === 0) return [{ date: null, lines: splitNoteLines(src) }];

  const blocks: NoteBlock[] = [];

  const head = src.slice(0, marks[0].index ?? 0);
  const headLines = splitNoteLines(head);
  if (headLines.length > 0) blocks.push({ date: null, lines: headLines });

  marks.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < marks.length ? (marks[i + 1].index ?? src.length) : src.length;
    blocks.push({ date: m[1], lines: splitNoteLines(src.slice(start, end)) });
  });

  return blocks;
};

const DRIVE_LINK_REGEX = /https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/view/g;
const DRIVE_THUMB_URL = (id: string, size = 220) => `https://drive.google.com/thumbnail?id=${id}&sz=w${size}`;
const DRIVE_PREVIEW_URL = (id: string) => `https://drive.google.com/file/d/${id}/preview`;
const DRIVE_VIEW_URL = (id: string) => `https://drive.google.com/file/d/${id}/view`;

const extractDriveFileIds = (text: string): string[] => {
  const ids: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(DRIVE_LINK_REGEX);
  while ((m = re.exec(text)) !== null) ids.push(m[1]);
  return ids;
};

const isBareDriveLink = (s: string) => /^https:\/\/drive\.google\.com\/file\/d\/[a-zA-Z0-9_-]+\/view$/.test(s.trim());

const stripBareDriveLinks = (line: string): string =>
  line.split('\n').filter(sub => !isBareDriveLink(sub)).join('\n').trim();

const ImageThumb = ({ id, index }: { id: string; index: number }) => {
  const [imgFailed, setImgFailed] = useState(false);

  if (imgFailed) {
    return (
      <div className="pointer-events-none h-full w-full overflow-hidden">
        <iframe
          src={DRIVE_PREVIEW_URL(id)}
          className="h-full w-full scale-125"
          title={`thumb-${id}`}
          tabIndex={-1}
        />
      </div>
    );
  }

  return (
    <img
      src={DRIVE_THUMB_URL(id)}
      alt={`Ảnh ${index + 1}`}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="h-full w-full object-cover transition-transform group-hover:scale-105"
      onError={() => setImgFailed(true)}
    />
  );
};

const ImageGallery = ({ fileIds }: { fileIds: string[] }) => {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (fileIds.length === 0) return null;

  return (
    <>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {fileIds.map((id, i) => (
          <button
            key={id}
            type="button"
            onClick={() => setLightboxIndex(i)}
            className="group relative aspect-square overflow-hidden rounded border border-slate-200 bg-slate-100"
            title={`Ảnh ${i + 1}`}
          >
            <ImageThumb id={id} index={i} />
          </button>
        ))}
      </div>

      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative flex h-[94vh] w-[97vw] max-w-6xl flex-col rounded-lg bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-2">
              <span className="text-xs text-slate-500">
                Ảnh {lightboxIndex + 1} / {fileIds.length}
              </span>
              <div className="flex items-center gap-3">
                <a
                  href={DRIVE_VIEW_URL(fileIds[lightboxIndex])}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-emerald-700 hover:underline"
                >
                  Mở trên Drive
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxIndex(null)}
                  aria-label="Đóng"
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="relative min-h-0 flex-1">
              <iframe
                key={fileIds[lightboxIndex]}
                src={DRIVE_PREVIEW_URL(fileIds[lightboxIndex])}
                className="h-full w-full"
                allow="autoplay"
                title={`preview-${fileIds[lightboxIndex]}`}
              />
              {lightboxIndex > 0 && (
                <button
                  type="button"
                  onClick={() => setLightboxIndex(idx => (idx !== null ? idx - 1 : idx))}
                  aria-label="Ảnh trước"
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow hover:bg-white"
                >
                  <ChevronLeft size={20} />
                </button>
              )}
              {lightboxIndex < fileIds.length - 1 && (
                <button
                  type="button"
                  onClick={() => setLightboxIndex(idx => (idx !== null ? idx + 1 : idx))}
                  aria-label="Ảnh sau"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow hover:bg-white"
                >
                  <ChevronRight size={20} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const NOTE_BLOCK_MAX_HEIGHT = 420;

const NoteContent = ({ text }: { text: string }) => {
  const blocks = useMemo(() => parseNoteBlocks(text), [text]);

  if (blocks.length === 0) {
    return <div className="p-3 text-sm text-slate-400">Không có dữ liệu</div>;
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const fileIds = extractDriveFileIds(block.lines.join('\n'));
        return (
          <div key={i} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {block.date && (
              <div className="flex items-center justify-between border-b border-slate-200 bg-emerald-50 px-4 py-2">
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                  {block.date}
                </span>
                <span className="text-[0.6875rem] text-slate-400">Cuộn trong khung để xem hết</span>
              </div>
            )}
            <div
              className="overflow-y-auto p-4 text-sm leading-relaxed text-slate-700 custom-scrollbar"
              style={{ maxHeight: NOTE_BLOCK_MAX_HEIGHT }}
            >
              {block.lines.map((line, j) => {
                const displayLine = stripBareDriveLinks(line);
                if (!displayLine) return null;
                return (
                  <div key={j} className="break-words whitespace-pre-wrap pl-1">
                    # {displayLine}
                  </div>
                );
              })}
              <ImageGallery fileIds={fileIds} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

const COL_WIDTHS = {
  stt: 50,
  hex: 150,
  hangMuc: 260,
  congTrinh: 200,
  xuong: 100,
  date: 120,
  soLuong: 130,
  thanhTien: 140,
  ghiChuXuatKho: 320,
};

type SortKey = 'stt' | 'hex' | 'hangMuc' | 'congTrinh' | 'xuong' | 'date' | 'soLuong' | 'thanhTien' | 'ghiChuXuatKho';
type SortDir = 'asc' | 'desc';

type OptionalColKey = 'hangMuc' | 'congTrinh' | 'xuong' | 'date' | 'soLuong' | 'thanhTien' | 'ghiChuXuatKho';

const COLUMN_META: Record<OptionalColKey, { label: React.ReactNode; sortKey: SortKey; align?: 'left' | 'right' }> = {
  hangMuc: { label: 'Hạng Mục', sortKey: 'hangMuc' },
  congTrinh: { label: 'Công Trình', sortKey: 'congTrinh' },
  xuong: { label: 'Khu Vực SX', sortKey: 'xuong' },
  date: { label: 'Ngày Xuất', sortKey: 'date' },
  soLuong: { label: 'Số Lượng', sortKey: 'soLuong', align: 'right' },
  thanhTien: { label: 'Thành Tiền (tỷ)', sortKey: 'thanhTien', align: 'right' },
  ghiChuXuatKho: { label: <>Ghi Chú <br />Xuất Kho</>, sortKey: 'ghiChuXuatKho' },
};

const NUMERIC_SORT_KEYS: SortKey[] = ['soLuong', 'thanhTien'];

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

export const ExportDetailModal = ({
  isOpen,
  onClose,
  projectName,
  rows,
  columnKeys,
}: ExportDetailModalProps) => {
  const {
    hexKey, congTrinhKey, xuongKey, dateKey, soLuongKey, thanhTienKey,
    ghiChuXuatKhoKey = 'tong_hop_ghi_chu_xuat_kho',
    hangMucKey = 'ten_hang_muc',
  } = columnKeys;

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const footerScrollRef = useRef<HTMLDivElement>(null);
  const [scrollbarWidth, setScrollbarWidth] = useState(0);

  const [selectedNote, setSelectedNote] = useState<{ row: DataRow } | null>(null);
  const [fullNoteText, setFullNoteText] = useState<string | null>(null);

  // Loại bỏ các dòng trùng lặp hoàn toàn (dữ liệu nguồn đôi khi bị lặp bản ghi).
  const dedupedRows = useMemo(() => {
    const seen = new Set<string>();
    return rows.filter((row) => {
      const sig = [
        row[hexKey], row[congTrinhKey], row[xuongKey],
        row[dateKey], row[soLuongKey], row[thanhTienKey],
      ].map(v => String(v ?? '')).join('|');
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });
  }, [rows, hexKey, congTrinhKey, xuongKey, dateKey, soLuongKey, thanhTienKey]);

  // Escape: chỉ đóng modal chính. Popup ghi chú CHỈ đóng bằng nút X.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedNote) return;
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, selectedNote]);

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

  const getNotePreview = useCallback(
    (row: DataRow): string => String(row[ghiChuXuatKhoKey] ?? ''),
    [ghiChuXuatKhoKey]
  );

  const openNoteCell = useCallback((row: DataRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNote({ row });
    setFullNoteText(String(row[ghiChuXuatKhoKey] ?? ''));
  }, [ghiChuXuatKhoKey]);

  const toggleSort = useCallback((key: SortKey) => {
    const defaultDir: SortDir = NUMERIC_SORT_KEYS.includes(key) || key === 'date' ? 'desc' : 'asc';
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: defaultDir };
      if (prev.dir === defaultDir) return { key, dir: defaultDir === 'asc' ? 'desc' : 'asc' };
      return null;
    });
  }, []);

  const showProjectColumn = projectName === null;

  // ==== Setup cột hiển thị (chỉ Admin) ====
  const [cfgVersion, setCfgVersion] = useState(0);

  const OPTIONAL_COLUMNS: ModalColumnDef[] = useMemo(() => [
    { key: 'hangMuc', label: 'Hạng Mục' },
    ...(showProjectColumn ? [{ key: 'congTrinh', label: 'Công Trình' }] : []),
    { key: 'xuong', label: 'Khu Vực SX' },
    { key: 'date', label: 'Ngày Xuất' },
    { key: 'soLuong', label: 'Số Lượng' },
    { key: 'thanhTien', label: 'Thành Tiền (tỷ)' },
    { key: 'ghiChuXuatKho', label: 'Ghi Chú Xuất Kho' },
  ], [showProjectColumn]);

  const visibleCols = useMemo(
    () => resolveVisibleModalColumns('modal_export_detail', OPTIONAL_COLUMNS),
    [OPTIONAL_COLUMNS, cfgVersion]
  );

  const orderedCols = useMemo(
    () => visibleCols.map(c => c.key) as OptionalColKey[],
    [visibleCols]
  );

  // ✅ Freeze: gồm cả STT + Mã Hex + các cột phụ
  const frozen = useFrozenColumns(
    'modal_export_detail',
    [{ key: 'stt', width: COL_WIDTHS.stt }, { key: 'hex', width: COL_WIDTHS.hex }],
    orderedCols,
    COL_WIDTHS,
    cfgVersion
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dedupedRows;
    return dedupedRows.filter(row => {
      const hex = String(row[hexKey] || '').toLowerCase();
      const xuong = String(row[xuongKey] || '').toLowerCase();
      const date = String(row[dateKey] || '').toLowerCase();
      return hex.includes(q) || xuong.includes(q) || date.includes(q);
    });
  }, [dedupedRows, search, hexKey, xuongKey, dateKey]);

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
        case 'hangMuc': return String(row[hangMucKey] || '');
        case 'congTrinh': return String(row[congTrinhKey] || '');
        case 'xuong': return String(row[xuongKey] || '');
        case 'date': return parseDateValue(row[dateKey]);
        case 'soLuong': return parseNumber(row[soLuongKey]);
        case 'thanhTien': return parseNumber(row[thanhTienKey]);
        case 'ghiChuXuatKho': return getNotePreview(row);
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
    return filteredRows.reduce(
      (acc, row) => {
        acc.soLuong += parseNumber(row[soLuongKey]);
        acc.thanhTien += parseNumber(row[thanhTienKey]);
        return acc;
      },
      { soLuong: 0, thanhTien: 0 }
    );
  }, [filteredRows, soLuongKey, thanhTienKey]);

  const groupCount = useMemo(() => {
    const set = new Set(filteredRows.map(row => String(row[hexKey] || '')));
    return set.size;
  }, [filteredRows, hexKey]);

  if (!isOpen) return null;

  const exportColumns = [
    'STT', 'Mã Hex', 'Hạng Mục',
    ...(showProjectColumn ? ['Công Trình'] : []),
    'Khu Vực SX', 'Ngày Xuất', 'Số Lượng Xuất Kho', 'Thành Tiền Xuất Kho (Triệu đồng)',
    'Tổng Hợp Ghi Chú Xuất Kho',
  ];

  const exportFileName = `chi_tiet_xuat_kho_${(projectName ?? 'tat_ca_cong_trinh')
    .toString()
    .trim()
    .replace(/\s+/g, '_')}`;

  const handleExportCsv = () => {
    const exportRows = sortedRows.map(({ row, stt }) => ({
      'STT': stt,
      'Mã Hex': String(row[hexKey] || ''),
      'Hạng Mục': String(row[hangMucKey] || ''),
      ...(showProjectColumn ? { 'Công Trình': String(row[congTrinhKey] || '') } : {}),
      'Khu Vực SX': String(row[xuongKey] || ''),
      'Ngày Xuất': formatDateDisplay(row[dateKey]),
      'Số Lượng Xuất Kho': parseNumber(row[soLuongKey]),
      'Thành Tiền Xuất Kho (Triệu đồng)': parseNumber(row[thanhTienKey]),
      'Tổng Hợp Ghi Chú Xuất Kho': String(row[ghiChuXuatKhoKey] ?? ''),
    }));
    exportDetailRowsToCsv(exportFileName, exportColumns, exportRows);
  };

  const totalMinWidth =
    COL_WIDTHS.stt +
    COL_WIDTHS.hex +
    orderedCols.reduce((sum, key) => sum + COL_WIDTHS[key], 0);

  const tableStyle: React.CSSProperties = {
    width: '100%',
    minWidth: totalMinWidth,
    tableLayout: 'fixed',
  };

  // Colgroup dùng PX; cột phụ CUỐI CÙNG không khai báo width -> hấp thụ phần dư.
  const ColGroup = () => (
    <colgroup>
      <col style={{ width: COL_WIDTHS.stt }} />
      <col style={{ width: COL_WIDTHS.hex }} />
      {orderedCols.map((key, i) =>
        i === orderedCols.length - 1
          ? <col key={key} />
          : <col key={key} style={{ width: COL_WIDTHS[key] }} />
      )}
    </colgroup>
  );

  const headerCellClass =
    'cursor-pointer select-none border-b border-r border-emerald-200 bg-emerald-50 px-3 py-3 transition-colors hover:bg-emerald-100';

  const SortableHeader = ({
    sortKey,
    align = 'left',
    children,
    className = '',
    isLast = false,
    style,
  }: {
    sortKey: SortKey;
    align?: 'left' | 'right';
    children: React.ReactNode;
    className?: string;
    isLast?: boolean;
    style?: React.CSSProperties;
  }) => (
    <th
      onClick={() => toggleSort(sortKey)}
      style={style}
      className={`${isLast ? headerCellClass.replace('border-r ', '') : headerCellClass} ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {children}
        <SortIcon active={sort?.key === sortKey} dir={sort?.dir} />
      </span>
    </th>
  );

  return (
    <>
      <div
        className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-900/50 p-4"
        role="dialog"
        aria-modal="true"
      >
        <div
          className="flex flex-col overflow-hidden rounded-xl bg-white shadow-xl"
          style={{ width: '98vw', maxWidth: 2000, height: '94vh' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-slate-800">Chi tiết Đã Xuất Kho P025</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {projectName ?? 'Tất cả công trình'} · {filteredRows.length} dòng ·{' '}
                Đơn vị tiền: {TY_UNIT_LABEL} · Bấm vào ô ghi chú để xem đầy đủ
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ModalColumnSetupButton
                modalId="modal_export_detail"
                allColumns={OPTIONAL_COLUMNS}
                onChange={() => setCfgVersion(v => v + 1)}
              />
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={filteredRows.length === 0}
                title="Xuất dữ liệu đang hiển thị ra file .CSV"
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

          <div className="shrink-0 border-b border-slate-100 px-5 py-3">
            <div className="relative max-w-xs">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo mã hex, khu vực SX, ngày xuất..."
                className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-300"
              />
            </div>
          </div>

          {filteredRows.length > 0 ? (
            <>
              {/* Header: không padding ngang -> bảng chạy sát mép modal */}
              <div className="shrink-0 overflow-hidden border-b border-emerald-200 bg-emerald-50 pt-5">
                <div className="flex">
                  <div ref={headerScrollRef} className="min-w-0 flex-1 overflow-x-hidden">
                    <table style={tableStyle} className="border-separate border-spacing-0 text-xs">
                      <ColGroup />
                      <thead className="font-bold uppercase tracking-tight text-slate-800">
                        <tr>
                          <th
                            onClick={() => toggleSort('stt')}
                            style={fzStyle(frozen.get('stt'))}
                            className={`${fzClass(frozen.get('stt'))} cursor-pointer select-none border-b border-r border-emerald-200 bg-emerald-50 px-2 py-3 text-center transition-colors hover:bg-emerald-100`}
                          >
                            <span className="inline-flex items-center justify-center gap-1">
                              STT
                              <SortIcon active={sort?.key === 'stt'} dir={sort?.dir} />
                            </span>
                          </th>
                          <th
                            onClick={() => toggleSort('hex')}
                            style={fzStyle(frozen.get('hex'))}
                            className={`${fzClass(frozen.get('hex'))} min-w-[140px] cursor-pointer select-none border-b border-r border-emerald-200 bg-emerald-50 px-3 py-3 text-left transition-colors hover:bg-emerald-100`}
                          >
                            <span className="inline-flex items-center gap-1">
                              Mã Hex
                              <SortIcon active={sort?.key === 'hex'} dir={sort?.dir} />
                            </span>
                          </th>
                          {orderedCols.map((key, i) => {
                            const meta = COLUMN_META[key];
                            const isLast = i === orderedCols.length - 1;
                            return applyFrozen(
                              <SortableHeader key={key} sortKey={meta.sortKey} align={meta.align} isLast={isLast}>
                                {meta.label}
                              </SortableHeader>,
                              frozen.get(key),
                              '!bg-emerald-50'
                            );
                          })}
                        </tr>
                      </thead>
                    </table>
                  </div>
                  {scrollbarWidth > 0 && <div style={{ width: scrollbarWidth }} className="shrink-0" />}
                </div>
              </div>

              {/* Body: vùng cuộn duy nhất, KHÔNG có px-5 để sticky left:0 dính sát mép */}
              <div
                ref={bodyScrollRef}
                onScroll={handleBodyScroll}
                className="min-h-0 flex-1 overflow-auto custom-scrollbar"
              >
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
                          hexRowSpan++;
                          j++;
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
                          xuongRowSpan++;
                          j++;
                        }
                      }

                      const rowTopBorder = isHexGroupStart && idx > 0 ? 'border-t-2 border-t-emerald-200' : '';
                      const cellBorder = 'border-b border-slate-200';

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
                              <td key="soLuong" className={`px-3 py-2.5 text-right align-top text-slate-800 ${cellBorder}`}>
                                {parseNumber(row[soLuongKey]).toLocaleString('vi-VN')}
                              </td>
                            );

                          case 'thanhTien':
                            return (
                              <td key="thanhTien" className={`px-3 py-2.5 text-right align-top font-medium text-emerald-700 ${cellBorder}`}>
                                {money(parseNumber(row[thanhTienKey]))}
                              </td>
                            );

                          case 'ghiChuXuatKho':
                            return (
                              <td
                                key="ghiChuXuatKho"
                                onClick={(e) => openNoteCell(row, e)}
                                title="Bấm để xem đầy đủ nội dung"
                                className={`cursor-pointer px-3 py-2.5 text-left align-top text-slate-600 break-words whitespace-normal transition-colors hover:bg-emerald-50 ${cellBorder}`}
                              >
                                {truncateText(getNotePreview(row)) || '—'}
                              </td>
                            );

                          default:
                            return null;
                        }
                      };

                      return (
                        <tr key={idx} className={`group transition-colors hover:bg-emerald-50/40 ${rowTopBorder}`}>
                          {isHexGroupStart && (
                            <td
                              rowSpan={hexRowSpan}
                              style={fzStyle(frozen.get('stt'))}
                              className={`${fzClass(frozen.get('stt'))} border-r ${cellBorder} bg-emerald-50 px-2 py-2.5 text-center align-middle font-semibold text-slate-700`}
                            >
                              {entry.stt}
                            </td>
                          )}
                          {isHexGroupStart && (
                            <td
                              rowSpan={hexRowSpan}
                              style={fzStyle(frozen.get('hex'))}
                              className={`${fzClass(frozen.get('hex'))} border-r ${cellBorder} bg-emerald-50 px-3 py-2.5 text-left align-middle font-bold text-slate-800`}
                            >
                              {hexValue}
                            </td>
                          )}
                          {orderedCols.map((key) =>
                            applyFrozen(
                              renderCell(key),
                              frozen.get(key),
                              key === 'xuong' ? '!bg-slate-50' : '!bg-white group-hover:!bg-emerald-50'
                            )
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer: không padding ngang */}
              <div className="shrink-0 overflow-hidden border-t-2 border-emerald-400 bg-emerald-100 shadow-[0_-2px_6px_rgba(0,0,0,0.06)]">
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
                                  className={`${frozen.has('stt') ? 'sticky left-0 z-10' : ''} bg-emerald-100 px-3 py-3 text-left`}
                                  colSpan={pendingSpan}
                                >
                                  TỔNG CỘNG ({groupCount} mã Hex)
                                </td>
                              );
                              labelRendered = true;
                            };

                            orderedCols.forEach((key) => {
                              const isNumeric = numericKeys.includes(key);
                              const isNote = key === 'ghiChuXuatKho';

                              if (!labelRendered && !isNumeric && !isNote) {
                                pendingSpan += 1;
                                return;
                              }

                              if (!labelRendered) flushLabel();

                              if (isNumeric) {
                                cells.push(
                                  applyFrozen(
                                    <td key={key} className="px-3 py-3 text-right">
                                      {key === 'soLuong'
                                        ? totals.soLuong.toLocaleString('vi-VN')
                                        : moneyTotal(totals.thanhTien)}
                                    </td>,
                                    frozen.get(key),
                                    '!bg-emerald-100'
                                  )
                                );
                              } else {
                                cells.push(
                                  applyFrozen(
                                    <td key={key} className="px-3 py-3" />,
                                    frozen.get(key),
                                    '!bg-emerald-100'
                                  )
                                );
                              }
                            });

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
                Không có dữ liệu xuất kho phù hợp.
              </div>
            </div>
          )}
        </div>
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
                <h3 className="text-lg font-semibold text-slate-800">Ghi chú xuất kho</h3>
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
            <div className="min-h-0 flex-1 overflow-y-auto p-6 custom-scrollbar">
              {fullNoteText === null ? (
                <div className="p-3 text-sm text-slate-400">Đang tải...</div>
              ) : (
                <NoteContent text={fullNoteText} />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};