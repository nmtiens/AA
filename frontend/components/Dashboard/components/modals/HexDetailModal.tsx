import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, ChevronUp, ChevronDown, ChevronsUpDown, Download } from 'lucide-react';
import { formatDecimal, parseNumber } from '../../utils/numberParsers';
import { exportDetailRowsToCsv } from '../../utils/csvExport';
import { DataRow } from '../../../../types';

export interface HexDetailColumnKeys {
  hexKey: string;
  congTrinhKey: string;
  hangMucKey: string;
  xuongKey: string;
  bopKey: string;
  tinhTrangKey: string;
  phanLoaiNhomSanPhamKey: string;
  triGiaDonHangTongKey: string;
  thanhTienTinhPhieuKey: string;
  thanhTienNhapKhoKey: string;
  // Các cột ghi chú — tùy chọn, mặc định là tên cột trong DB
  ghiChuNhapKhoKey?: string;
  thongTinQcKey?: string;
  ghiChuXuatKhoKey?: string;
  ghiChuDonHangTongKey?: string;
  ghiChuPhieuKey?: string;
}

interface HexDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  projectName: string | null;
  rows: DataRow[];
  columnKeys: HexDetailColumnKeys;
}

type NotesByHex = Record<string, Record<string, string | null>>;

const money = (value: number) => formatDecimal(value / 1000);

// Cắt 100 ký tự đầu, thêm "..." nếu dài hơn
const PREVIEW_LIMIT = 100;
const truncateText = (text: string, limit = PREVIEW_LIMIT) =>
  text.length > limit ? `${text.slice(0, limit)}...` : text;

// Tách nội dung ghi chú thành các khối theo mốc ngày (dd/mm/yyyy).
// Chỉ coi là "mốc ngày" khi ngày đứng ngay trước dấu # (hoặc dấu : rồi #, hoặc cuối chuỗi),
// để không cắt nhầm những ngày nằm giữa câu ghi chú.
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

const COL_WIDTHS = {
  stt: 50,
  hex: 150,
  congTrinh: 200,
  hangMuc: 260,
  xuong: 100,
  bop: 80,
  tinhTrang: 200,
  phanLoai: 160,
  triGiaDonHangTong: 130,
  thanhTienTinhPhieu: 130,
  thanhTienNhapKho: 130,
  ghiChuNhapKho: 280,
  thongTinQc: 280,
  ghiChuXuatKho: 280,
  ghiChuDonHangTong: 280,
  ghiChuPhieu: 280,
};

type SortKey =
  | 'stt'
  | 'hex'
  | 'congTrinh'
  | 'hangMuc'
  | 'xuong'
  | 'bop'
  | 'tinhTrang'
  | 'phanLoai'
  | 'triGia'
  | 'thanhTienPhieu'
  | 'thanhTienKho'
  | 'ghiChuNhapKho'
  | 'thongTinQc'
  | 'ghiChuXuatKho'
  | 'ghiChuDonHangTong'
  | 'ghiChuPhieu';
type SortDir = 'asc' | 'desc';

const NUMERIC_SORT_KEYS: SortKey[] = ['triGia', 'thanhTienPhieu', 'thanhTienKho'];

const SortIcon = ({ active, dir }: { active: boolean; dir?: SortDir }) => {
  if (!active) return <ChevronsUpDown size={12} className="shrink-0 text-slate-400" />;
  return dir === 'asc' ? (
    <ChevronUp size={12} className="shrink-0 text-emerald-700" />
  ) : (
    <ChevronDown size={12} className="shrink-0 text-emerald-700" />
  );
};

const NoteSection = ({ label, text }: { label: string; text: string }) => {
  const blocks = useMemo(() => parseNoteBlocks(text), [text]);
  // Chỉ thêm tiền tố "# " khi nội dung gốc thực sự dùng dấu # (vd: ghi chú đơn hàng tổng là văn bản thường)
  const hasHash = text.includes('#');

  return (
    <div>
      <h4 className="mb-1.5 text-xs font-bold uppercase tracking-tight text-emerald-800">{label}</h4>
      <div className="rounded-lg border border-slate-200 bg-slate-50 text-xs leading-relaxed text-slate-700">
        {blocks.length === 0 ? (
          <div className="p-3 text-slate-400">Không có dữ liệu</div>
        ) : (
          blocks.map((block, i) => (
            <div
              key={i}
              className={`px-3 py-2.5 ${i > 0 ? 'border-t border-slate-200' : ''}`}
            >
              {block.date && (
                <div className="mb-1">
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                    {block.date}
                  </span>
                </div>
              )}
              {block.lines.map((line, j) => (
                <div key={j} className="break-words whitespace-pre-wrap pl-1">
                  {hasHash ? '# ' : ''}{line}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export const HexDetailModal = ({
  isOpen,
  onClose,
  title,
  projectName,
  rows,
  columnKeys,
}: HexDetailModalProps) => {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  // Dòng đang được mở xem đầy đủ nội dung
  const [selectedEntry, setSelectedEntry] = useState<{ row: DataRow; stt: number } | null>(null);

  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const footerScrollRef = useRef<HTMLDivElement>(null);

  const [scrollbarWidth, setScrollbarWidth] = useState(0);

  const {
    hexKey, congTrinhKey, hangMucKey, xuongKey, bopKey, tinhTrangKey,
    phanLoaiNhomSanPhamKey, triGiaDonHangTongKey, thanhTienTinhPhieuKey, thanhTienNhapKhoKey,
    ghiChuNhapKhoKey = 'tong_hop_ghi_chu_nhap_kho',
    thongTinQcKey = 'tong_hop_thong_tin_qc',
    ghiChuXuatKhoKey = 'tong_hop_ghi_chu_xuat_kho',
    ghiChuDonHangTongKey = 'ghi_chu_don_hang_tong',
    ghiChuPhieuKey = 'ghi_chu_phieu',
  } = columnKeys;

  // Ghi chú không nằm trong /api/all-data (quá nặng) nên tải riêng theo danh sách hex
  const [notesMap, setNotesMap] = useState<NotesByHex>({});
  const [fullNotes, setFullNotes] = useState<Record<string, string | null> | null>(null);
  // Đánh số request để bỏ qua response cũ khi bấm nhanh nhiều dòng
  const openReqRef = useRef(0);

  const hexList = useMemo(
    () => Array.from(new Set(rows.map((r) => String(r[hexKey] || '')).filter(Boolean))),
    [rows, hexKey]
  );

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setSort(null);
      setSelectedEntry(null);
      setFullNotes(null);
      setNotesMap({});
    }
  }, [isOpen]);

  // Escape: nếu đang mở cửa sổ nội dung đầy đủ thì đóng cửa sổ đó trước
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedEntry) setSelectedEntry(null);
      else onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, selectedEntry]);

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

  // Tải bản xem trước ghi chú của toàn bộ hex khi mở popup
  useEffect(() => {
    if (!isOpen || hexList.length === 0) return;
    const ctrl = new AbortController();
    setNotesMap({});
    fetch('/api/production/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hexes: hexList }),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : {}))
      .then(setNotesMap)
      .catch(() => { /* bỏ qua: ô ghi chú hiện "—" */ });
    return () => ctrl.abort();
  }, [isOpen, hexList]);

  const getNote = useCallback(
    (row: DataRow, key: string): string =>
      String(notesMap[String(row[hexKey] || '')]?.[key] ?? ''),
    [notesMap, hexKey]
  );

  // Bấm dòng: tải nguyên văn của đúng hex đó
const openEntry = (entry: { row: DataRow; stt: number }) => {
  const hex = String(entry.row[hexKey] || '');
  const reqId = ++openReqRef.current;
  setSelectedEntry(entry);
  setFullNotes(null);
  fetch('/api/production/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hexes: [hex], full: true }),
  })
    .then((r): Promise<NotesByHex> => (r.ok ? r.json() : Promise.resolve({})))
    .then((d) => {
      if (reqId === openReqRef.current) setFullNotes(d[hex] ?? {});
    })
    .catch(() => {
      if (reqId === openReqRef.current) setFullNotes({});
    });
};

  const toggleSort = useCallback((key: SortKey) => {
    const defaultDir: SortDir = NUMERIC_SORT_KEYS.includes(key) ? 'desc' : 'asc';
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: defaultDir };
      if (prev.dir === defaultDir) return { key, dir: defaultDir === 'asc' ? 'desc' : 'asc' };
      return null;
    });
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hex = String(row[hexKey] || '').toLowerCase();
      const hangMuc = String(row[hangMucKey] || '').toLowerCase();
      const status = String(row[tinhTrangKey] || '').toLowerCase();
      return hex.includes(q) || hangMuc.includes(q) || status.includes(q);
    });
  }, [rows, search, hexKey, hangMucKey, tinhTrangKey]);

  // STT cố định (1..N) theo thứ tự gốc của filteredRows — không đổi khi sort cột khác.
  const indexedRows = useMemo(
    () => filteredRows.map((row, i) => ({ row, stt: i + 1 })),
    [filteredRows]
  );

  const sortedRows = useMemo(() => {
    if (!sort) return indexedRows;

    if (sort.key === 'stt') {
      const sorted = [...indexedRows].sort((a, b) => a.stt - b.stt);
      return sort.dir === 'desc' ? sorted.reverse() : sorted;
    }

    const getValue = (row: DataRow): number | string => {
      switch (sort.key) {
        case 'hex': return String(row[hexKey] || '');
        case 'congTrinh': return String(row[congTrinhKey] || '');
        case 'hangMuc': return String(row[hangMucKey] || '');
        case 'xuong': return String(row[xuongKey] || '');
        case 'bop': return String(row[bopKey] || '');
        case 'tinhTrang': return String(row[tinhTrangKey] || '');
        case 'phanLoai': return String(row[phanLoaiNhomSanPhamKey] || '');
        case 'triGia': return parseNumber(row[triGiaDonHangTongKey]);
        case 'thanhTienPhieu': return parseNumber(row[thanhTienTinhPhieuKey]);
        case 'thanhTienKho': return parseNumber(row[thanhTienNhapKhoKey]);
        // Cột ghi chú: sắp xếp theo bản xem trước đã tải từ /api/production/notes
        case 'ghiChuNhapKho': return getNote(row, ghiChuNhapKhoKey);
        case 'thongTinQc': return getNote(row, thongTinQcKey);
        case 'ghiChuXuatKho': return getNote(row, ghiChuXuatKhoKey);
        case 'ghiChuDonHangTong': return getNote(row, ghiChuDonHangTongKey);
        case 'ghiChuPhieu': return getNote(row, ghiChuPhieuKey);
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
  }, [
    indexedRows, sort, hexKey, congTrinhKey, hangMucKey, xuongKey, bopKey, tinhTrangKey,
    phanLoaiNhomSanPhamKey, triGiaDonHangTongKey, thanhTienTinhPhieuKey, thanhTienNhapKhoKey,
    ghiChuNhapKhoKey, thongTinQcKey, ghiChuXuatKhoKey, ghiChuDonHangTongKey, ghiChuPhieuKey,
    getNote,
  ]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.triGiaDonHangTong += parseNumber(row[triGiaDonHangTongKey]);
        acc.thanhTienTinhPhieu += parseNumber(row[thanhTienTinhPhieuKey]);
        acc.thanhTienNhapKho += parseNumber(row[thanhTienNhapKhoKey]);
        return acc;
      },
      { triGiaDonHangTong: 0, thanhTienTinhPhieu: 0, thanhTienNhapKho: 0 }
    );
  }, [filteredRows, triGiaDonHangTongKey, thanhTienTinhPhieuKey, thanhTienNhapKhoKey]);

  // ---- Từ đây trở xuống không được khai báo hook (đã có early return) ----
  if (!isOpen) return null;

  const showProjectColumn = projectName === null;

  const exportColumns = [
    'STT',
    'Mã Hex',
    ...(showProjectColumn ? ['Công Trình'] : []),
    'Hạng Mục',
    'Khu Vực SX',
    'BOP',
    'Tình Trạng',
    'Phân Loại Nhóm Sản Phẩm',
    'Trị Giá Đơn Hàng Tổng (1000 VNĐ)',
    'Thành Tiền Tính Phiếu (1000 VNĐ)',
    'Thành Tiền Nhập Kho (1000 VNĐ)',
    'Tổng Hợp Ghi Chú Nhập Kho',
    'Tổng Hợp Thông Tin QC',
    'Tổng Hợp Ghi Chú Xuất Kho',
    'Ghi Chú Đơn Hàng Tổng',
    'Ghi Chú Phiếu',
  ];

  const exportFileName = `chi_tiet_hex_${(projectName ?? 'tat_ca_cong_trinh')
    .toString()
    .trim()
    .replace(/\s+/g, '_')}`;

  const buildExportRow = (
    row: DataRow,
    stt: number,
    note: (row: DataRow, key: string) => string
  ) => ({
    'STT': stt,
    'Mã Hex': String(row[hexKey] || ''),
    ...(showProjectColumn ? { 'Công Trình': String(row[congTrinhKey] || '') } : {}),
    'Hạng Mục': String(row[hangMucKey] || ''),
    'Khu Vực SX': String(row[xuongKey] || ''),
    'BOP': String(row[bopKey] || ''),
    'Tình Trạng': String(row[tinhTrangKey] || ''),
    'Phân Loại Nhóm Sản Phẩm': String(row[phanLoaiNhomSanPhamKey] || ''),
    'Trị Giá Đơn Hàng Tổng (1000 VNĐ)': parseNumber(row[triGiaDonHangTongKey]) / 1000,
    'Thành Tiền Tính Phiếu (1000 VNĐ)': parseNumber(row[thanhTienTinhPhieuKey]) / 1000,
    'Thành Tiền Nhập Kho (1000 VNĐ)': parseNumber(row[thanhTienNhapKhoKey]) / 1000,
    'Tổng Hợp Ghi Chú Nhập Kho': note(row, ghiChuNhapKhoKey),
    'Tổng Hợp Thông Tin QC': note(row, thongTinQcKey),
    'Tổng Hợp Ghi Chú Xuất Kho': note(row, ghiChuXuatKhoKey),
    'Ghi Chú Đơn Hàng Tổng': note(row, ghiChuDonHangTongKey),
    'Ghi Chú Phiếu': note(row, ghiChuPhieuKey),
  });

  // Export giữ NGUYÊN văn (tải bản full từ API, không cắt 100 ký tự)
  const exportCsv = async () => {
    let full: NotesByHex = {};
    try {
      const r = await fetch('/api/production/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hexes: hexList, full: true }),
      });
      if (r.ok) full = await r.json();
    } catch { /* xuất không kèm ghi chú nếu lỗi */ }
    const fullNote = (row: DataRow, key: string) =>
      String(full[String(row[hexKey] || '')]?.[key] ?? '');
    const data = sortedRows.map(({ row, stt }) => buildExportRow(row, stt, fullNote));
    exportDetailRowsToCsv(exportFileName, exportColumns, data);
  };

  const totalMinWidth =
    COL_WIDTHS.stt +
    COL_WIDTHS.hex +
    (showProjectColumn ? COL_WIDTHS.congTrinh : 0) +
    COL_WIDTHS.hangMuc +
    COL_WIDTHS.xuong +
    COL_WIDTHS.bop +
    COL_WIDTHS.tinhTrang +
    COL_WIDTHS.phanLoai +
    COL_WIDTHS.triGiaDonHangTong +
    COL_WIDTHS.thanhTienTinhPhieu +
    COL_WIDTHS.thanhTienNhapKho +
    COL_WIDTHS.ghiChuNhapKho +
    COL_WIDTHS.thongTinQc +
    COL_WIDTHS.ghiChuXuatKho +
    COL_WIDTHS.ghiChuDonHangTong +
    COL_WIDTHS.ghiChuPhieu;

  const pct = (px: number) => `${((px / totalMinWidth) * 100).toFixed(4)}%`;

  const ColGroup = () => (
    <colgroup>
      <col style={{ width: pct(COL_WIDTHS.stt) }} />
      <col style={{ width: pct(COL_WIDTHS.hex) }} />
      {showProjectColumn && <col style={{ width: pct(COL_WIDTHS.congTrinh) }} />}
      <col style={{ width: pct(COL_WIDTHS.hangMuc) }} />
      <col style={{ width: pct(COL_WIDTHS.xuong) }} />
      <col style={{ width: pct(COL_WIDTHS.bop) }} />
      <col style={{ width: pct(COL_WIDTHS.tinhTrang) }} />
      <col style={{ width: pct(COL_WIDTHS.phanLoai) }} />
      <col style={{ width: pct(COL_WIDTHS.triGiaDonHangTong) }} />
      <col style={{ width: pct(COL_WIDTHS.thanhTienTinhPhieu) }} />
      <col style={{ width: pct(COL_WIDTHS.thanhTienNhapKho) }} />
      <col style={{ width: pct(COL_WIDTHS.ghiChuNhapKho) }} />
      <col style={{ width: pct(COL_WIDTHS.thongTinQc) }} />
      <col style={{ width: pct(COL_WIDTHS.ghiChuXuatKho) }} />
      <col style={{ width: pct(COL_WIDTHS.ghiChuDonHangTong) }} />
      <col style={{ width: pct(COL_WIDTHS.ghiChuPhieu) }} />
    </colgroup>
  );

  const tableStyle: React.CSSProperties = {
    width: '100%',
    minWidth: totalMinWidth,
    tableLayout: 'fixed',
  };

  const headerCellClass =
    'cursor-pointer select-none border-b border-r border-emerald-200 bg-emerald-50 px-3 py-3 transition-colors hover:bg-emerald-100';

  const SortableHeader = ({
    sortKey,
    align = 'left',
    children,
    className = '',
  }: {
    sortKey: SortKey;
    align?: 'left' | 'right';
    children: React.ReactNode;
    className?: string;
  }) => (
    <th onClick={() => toggleSort(sortKey)} className={`${headerCellClass} ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {children}
        <SortIcon active={sort?.key === sortKey} dir={sort?.dir} />
      </span>
    </th>
  );

  const noteCellClass =
    'px-3 py-2.5 text-left align-top text-slate-600 break-words whitespace-normal';

  return (
    <>
      <div
        className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-900/50 p-4"
        role="dialog"
        aria-modal="true"
      >
        <div
          className="flex flex-col rounded-xl bg-white shadow-xl"
          style={{ width: '96vw', maxWidth: 1680, height: '92vh' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-slate-800">
                Chi tiết theo Hex — {title}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {projectName ?? 'Tất cả công trình'} · {filteredRows.length} hex ·{' '}
                Đơn vị tiền: 1,000 VNĐ · Bấm vào dòng để xem đầy đủ ghi chú
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={exportCsv}
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
                placeholder="Tìm theo mã hex, hạng mục, tình trạng..."
                className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-300"
              />
            </div>
          </div>

          {filteredRows.length > 0 ? (
            <>
              <div className="shrink-0 overflow-hidden border-b border-emerald-200 bg-emerald-50 px-5 pt-5">
                <div className="flex">
                  <div ref={headerScrollRef} className="min-w-0 flex-1 overflow-x-hidden">
                    <table style={tableStyle} className="border-separate border-spacing-0 text-xs">
                      <ColGroup />
                      <thead className="font-bold uppercase tracking-tight text-slate-800">
                        <tr>
                          <th
                            onClick={() => toggleSort('stt')}
                            style={{ left: 0 }}
                            className="sticky z-10 cursor-pointer select-none border-b border-r border-emerald-200 bg-emerald-50 px-2 py-3 text-center transition-colors hover:bg-emerald-100"
                          >
                            <span className="inline-flex items-center justify-center gap-1">
                              STT
                              <SortIcon active={sort?.key === 'stt'} dir={sort?.dir} />
                            </span>
                          </th>
                          <th
                            onClick={() => toggleSort('hex')}
                            style={{ left: COL_WIDTHS.stt }}
                            className="sticky z-10 min-w-[140px] cursor-pointer select-none border-b border-r border-emerald-200 bg-emerald-50 px-3 py-3 text-left transition-colors hover:bg-emerald-100"
                          >
                            <span className="inline-flex items-center gap-1">
                              Mã Hex
                              <SortIcon active={sort?.key === 'hex'} dir={sort?.dir} />
                            </span>
                          </th>
                          {showProjectColumn && (
                            <SortableHeader sortKey="congTrinh">Công Trình</SortableHeader>
                          )}
                          <SortableHeader sortKey="hangMuc">Hạng Mục</SortableHeader>
                          <SortableHeader sortKey="xuong">Khu Vực SX</SortableHeader>
                          <SortableHeader sortKey="bop">BOP</SortableHeader>
                          <SortableHeader sortKey="tinhTrang">Tình Trạng</SortableHeader>
                          <SortableHeader sortKey="phanLoai" align="right">
                            Phân Loại <br />Nhóm SP
                          </SortableHeader>
                          <SortableHeader sortKey="triGia" align="right">
                            Trị Giá Đơn <br />Hàng Tổng
                          </SortableHeader>
                          <SortableHeader sortKey="thanhTienPhieu" align="right">
                            Thành Tiền <br />Tính Phiếu
                          </SortableHeader>
                          <SortableHeader sortKey="thanhTienKho" align="right">
                            Thành Tiền <br />Nhập Kho
                          </SortableHeader>
                          <SortableHeader sortKey="ghiChuNhapKho">
                            Ghi Chú <br />Nhập Kho
                          </SortableHeader>
                          <SortableHeader sortKey="thongTinQc">
                            Thông Tin <br />QC
                          </SortableHeader>
                          <SortableHeader sortKey="ghiChuXuatKho">
                            Ghi Chú <br />Xuất Kho
                          </SortableHeader>
                          <SortableHeader sortKey="ghiChuDonHangTong">
                            Ghi Chú <br />Đơn Hàng Tổng
                          </SortableHeader>
                          <th
                            onClick={() => toggleSort('ghiChuPhieu')}
                            className="cursor-pointer select-none border-b border-emerald-200 bg-emerald-50 px-3 py-3 text-left transition-colors hover:bg-emerald-100"
                          >
                            <span className="inline-flex items-center gap-1">
                              Ghi Chú <br />Phiếu
                              <SortIcon active={sort?.key === 'ghiChuPhieu'} dir={sort?.dir} />
                            </span>
                          </th>
                        </tr>
                      </thead>
                    </table>
                  </div>
                  {scrollbarWidth > 0 && <div style={{ width: scrollbarWidth }} className="shrink-0" />}
                </div>
              </div>

              <div
                ref={bodyScrollRef}
                onScroll={handleBodyScroll}
                className="min-h-0 flex-1 overflow-auto custom-scrollbar px-5"
              >
                <table style={tableStyle} className="border-separate border-spacing-0 text-xs">
                  <ColGroup />
                  <tbody className="divide-y divide-emerald-50">
                    {sortedRows.map((entry) => {
                      const row = entry.row;
                      return (
                        <tr
                          key={entry.stt}
                          onClick={() => openEntry(entry)}
                          title="Bấm để xem đầy đủ nội dung"
                          className="group cursor-pointer transition-colors hover:bg-slate-50"
                        >
                          <td
                            style={{ left: 0 }}
                            className="sticky z-10 border-r border-slate-100 bg-white px-2 py-2.5 text-center align-top font-semibold text-slate-500 group-hover:bg-slate-50"
                          >
                            {entry.stt}
                          </td>
                          <td
                            style={{ left: COL_WIDTHS.stt }}
                            className="sticky z-10 border-r border-slate-100 bg-white px-3 py-2.5 text-left align-top font-medium text-slate-700 group-hover:bg-slate-50"
                          >
                            {String(row[hexKey] || '—')}
                          </td>
                          {showProjectColumn && (
                            <td className="px-3 py-2.5 text-left align-top text-slate-700">
                              {String(row[congTrinhKey] || '—')}
                            </td>
                          )}
                          <td className="px-3 py-2.5 text-left align-top text-slate-700">
                            {String(row[hangMucKey] || '—')}
                          </td>
                          <td className="px-3 py-2.5 text-left align-top text-slate-600">
                            {String(row[xuongKey] || '—')}
                          </td>
                          <td className="px-3 py-2.5 text-left align-top text-slate-600">
                            {String(row[bopKey] || '—')}
                          </td>
                          <td className="px-3 py-2.5 text-left align-top text-slate-600">
                            {String(row[tinhTrangKey] || '—')}
                          </td>
                          <td className="px-3 py-2.5 text-right align-top text-slate-600">
                            {String(row[phanLoaiNhomSanPhamKey] || '—')}
                          </td>
                          <td className="px-3 py-2.5 text-right align-top text-slate-800">
                            {money(parseNumber(row[triGiaDonHangTongKey]))}
                          </td>
                          <td className="px-3 py-2.5 text-right align-top text-slate-800">
                            {money(parseNumber(row[thanhTienTinhPhieuKey]))}
                          </td>
                          <td className="px-3 py-2.5 text-right align-top font-medium text-indigo-700">
                            {money(parseNumber(row[thanhTienNhapKhoKey]))}
                          </td>
                          <td className={noteCellClass}>
                            {truncateText(getNote(row, ghiChuNhapKhoKey)) || '—'}
                          </td>
                          <td className={noteCellClass}>
                            {truncateText(getNote(row, thongTinQcKey)) || '—'}
                          </td>
                          <td className={noteCellClass}>
                            {truncateText(getNote(row, ghiChuXuatKhoKey)) || '—'}
                          </td>
                          <td className={noteCellClass}>
                            {truncateText(getNote(row, ghiChuDonHangTongKey)) || '—'}
                          </td>
                          <td className={noteCellClass}>
                            {truncateText(getNote(row, ghiChuPhieuKey)) || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="shrink-0 overflow-hidden border-t-2 border-emerald-400 bg-emerald-100 px-5 shadow-[0_-2px_6px_rgba(0,0,0,0.06)]">
                <div className="flex">
                  <div ref={footerScrollRef} className="min-w-0 flex-1 overflow-x-hidden">
                    <table style={tableStyle} className="border-separate border-spacing-0 text-xs">
                      <ColGroup />
                      <tfoot className="font-bold text-slate-900">
                        <tr>
                          <td
                            className="sticky left-0 z-10 bg-emerald-100 px-3 py-3 text-left"
                            colSpan={(showProjectColumn ? 6 : 5) + 1}
                          >
                            TỔNG CỘNG ({filteredRows.length} hex)
                          </td>
                          <td className="px-3 py-3"></td>
                          <td className="px-3 py-3 text-right">{money(totals.triGiaDonHangTong)}</td>
                          <td className="px-3 py-3 text-right">{money(totals.thanhTienTinhPhieu)}</td>
                          <td className="px-3 py-3 text-right text-indigo-800">{money(totals.thanhTienNhapKho)}</td>
                          {/* 5 cột ghi chú không có tổng */}
                          <td colSpan={5} className="px-3 py-3"></td>
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
                Không có dữ liệu hex phù hợp để hiển thị.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cửa sổ xem đầy đủ nội dung các cột ghi chú của dòng được bấm */}
      {selectedEntry && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedEntry(null)}
        >
          <div
            className="flex max-h-[92vh] w-[95vw] max-w-6xl flex-col rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-800">
                  Hex {String(selectedEntry.row[hexKey] || '—')}
                </h3>
                <p className="mt-0.5 break-words text-xs text-slate-500">
                  {String(selectedEntry.row[hangMucKey] || '—')}
                  {showProjectColumn && selectedEntry.row[congTrinhKey]
                    ? ` · ${String(selectedEntry.row[congTrinhKey])}`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                aria-label="Đóng"
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5 custom-scrollbar">
              {fullNotes === null ? (
                <div className="text-xs text-slate-400">Đang tải...</div>
              ) : (
                <>
                  <NoteSection label="Ghi chú đơn hàng tổng" text={String(fullNotes[ghiChuDonHangTongKey] ?? '')} />
                  <NoteSection label="Ghi chú phiếu" text={String(fullNotes[ghiChuPhieuKey] ?? '')} />
                  <NoteSection label="Tổng hợp ghi chú nhập kho" text={String(fullNotes[ghiChuNhapKhoKey] ?? '')} />
                  <NoteSection label="Tổng hợp thông tin QC" text={String(fullNotes[thongTinQcKey] ?? '')} />
                  <NoteSection label="Tổng hợp ghi chú xuất kho" text={String(fullNotes[ghiChuXuatKhoKey] ?? '')} />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};