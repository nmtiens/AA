import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, X, ChevronUp, ChevronDown, ChevronsUpDown, Download,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { formatDecimal, parseNumber } from '../../utils/numberParsers';
import { exportDetailRowsToCsv } from '../../utils/csvExport';
import { DataRow } from '../../../../types';
import { ModalColumnSetupButton } from '../../../Construction/utils/ModalColumnSetupButton';
import { resolveVisibleModalColumns, ModalColumnDef } from '../../../Construction/utils/tableColumnConfig';
import { useFrozenColumns, applyFrozen, fzClass, fzStyle } from '../../../Construction/utils/useFrozenColumns';
import {
  fetchVuongMacList,
  type VuongMacItem,
  type FiveMCategory,
} from '../../../../services/vuongMacService';
import { VuongMacDetailModal } from './VuongMacDetailModal';

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
  currentUser: string;
}

type NotesResponse = Record<string, Record<string, string | null>>;

const money = (value: number) => formatDecimal(value / 1000);

const PREVIEW_LIMIT = 100;
const truncateText = (text: string, limit = PREVIEW_LIMIT) =>
  text.length > limit ? `${text.slice(0, limit)}...` : text;

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

// ===== Nhận diện & hiển thị ảnh Google Drive trong ghi chú =====
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
          className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative flex h-[94vh] w-[97vw] max-w-6xl flex-col rounded-lg bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-2">
              <span className="text-xs text-slate-500">
                Ảnh {lightboxIndex + 1} / {fileIds.length}
              </span>
              <div className="flex items-center gap-3">
                
               <a   href={DRIVE_VIEW_URL(fileIds[lightboxIndex])}
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

// CUỘN 2 LỚP: lớp ngoài (popup) cuộn qua các NGÀY; lớp trong (phần ảnh của
// mỗi khối ngày) tự cuộn riêng khi ảnh của NGÀY ĐÓ dài.
const NOTE_BLOCK_MAX_HEIGHT = 420;

export const NoteContent = ({ text }: { text: string }) => {
  const blocks = useMemo(() => parseNoteBlocks(text), [text]);

  if (blocks.length === 0) {
    return <div className="p-3 text-sm text-slate-400">Không có dữ liệu</div>;
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const fileIds = extractDriveFileIds(block.lines.join('\n'));
        const textLines = block.lines.filter(
          (line) => extractDriveFileIds(line).length === 0 && line.trim()
        );

        return (
          <div key={i} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {block.date && (
              <div className="flex items-center justify-between border-b border-slate-200 bg-emerald-50 px-4 py-2">
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                  {block.date}
                </span>
                <span className="text-[11px] text-slate-400">Cuộn trong khung để xem hết</span>
              </div>
            )}

            {textLines.length > 0 && (
              <div className="border-b border-slate-200 p-4 text-sm leading-relaxed text-slate-700">
                <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                  {textLines.map((line, j) => (
                    <span
                      key={j}
                      className="whitespace-normal break-words after:mx-1.5 after:text-slate-300 after:content-['•'] last:after:content-none"
                    >
                      # {line}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {fileIds.length > 0 && (
              <div
                className="overflow-y-auto p-4 custom-scrollbar"
                style={{ maxHeight: NOTE_BLOCK_MAX_HEIGHT }}
              >
                <ImageGallery fileIds={fileIds} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const FIVE_M_ORDER: FiveMCategory[] = ['man', 'machine', 'material', 'method'];
const FIVE_M_SHORT: Record<FiveMCategory, string> = {
  man: 'M1',
  machine: 'M2',
  material: 'M3',
  method: 'M4',
  measurement: 'M5',
};
const FIVE_M_VI: Record<FiveMCategory, string> = {
  man: 'Con Người',
  machine: 'Máy Móc',
  material: 'Nguyên Vật Liệu',
  method: 'Phương Pháp',
  measurement: 'Đo Lường',
};
const CATEGORY_SORT_KEY: Record<FiveMCategory, SortKey> = {
  man: 'vmMan',
  machine: 'vmMachine',
  material: 'vmMaterial',
  method: 'vmMethod',
  measurement: 'vmMeasurement',
};

const VUONG_MAC_TEXT_STYLE: Record<FiveMCategory, string> = {
  man: 'text-blue-700',
  machine: 'text-purple-700',
  material: 'text-amber-700',
  method: 'text-teal-700',
  measurement: 'text-pink-700',
};

const VM_SUB_WIDTH = 108;

const COL_WIDTHS = {
  stt: 50,
  hex: 150,
  congTrinh: 200,
  hangMuc: 260,
  xuong: 100,
  bop: 80,
  tinhTrang: 200,
  phanLoai: 160,
  triGia: 130,
  thanhTienPhieu: 130,
  thanhTienKho: 130,
  ghiChuNhapKho: 280,
  thongTinQc: 280,
  ghiChuXuatKho: 280,
  ghiChuDonHangTong: 280,
  ghiChuPhieu: 280,
  vuongMac: VM_SUB_WIDTH * FIVE_M_ORDER.length,
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
  | 'ghiChuPhieu'
  | 'vmMan'
  | 'vmMachine'
  | 'vmMaterial'
  | 'vmMethod'
  | 'vmMeasurement';
type SortDir = 'asc' | 'desc';

// "vuongMac" là 1 khóa DUY NHẤT (ẩn/hiện cả nhóm); 5 cột con chỉ là chi tiết bên trong.
type OptionalColKey =
  | 'congTrinh'
  | 'hangMuc'
  | 'xuong'
  | 'bop'
  | 'tinhTrang'
  | 'phanLoai'
  | 'triGia'
  | 'thanhTienPhieu'
  | 'thanhTienKho'
  | 'ghiChuDonHangTong'
  | 'ghiChuPhieu'
  | 'ghiChuNhapKho'
  | 'thongTinQc'
  | 'ghiChuXuatKho'
  | 'vuongMac';

const COLUMN_META: Record<OptionalColKey, { label: React.ReactNode; sortKey: SortKey; align?: 'left' | 'right' }> = {
  congTrinh: { label: 'Công Trình', sortKey: 'congTrinh' },
  hangMuc: { label: 'Hạng Mục', sortKey: 'hangMuc' },
  xuong: { label: 'Khu Vực SX', sortKey: 'xuong' },
  bop: { label: 'BOP', sortKey: 'bop' },
  tinhTrang: { label: 'Tình Trạng', sortKey: 'tinhTrang' },
  phanLoai: { label: <>Phân Loại <br />Nhóm SP</>, sortKey: 'phanLoai', align: 'right' },
  triGia: { label: <>Trị Giá Đơn <br />Hàng Tổng</>, sortKey: 'triGia', align: 'right' },
  thanhTienPhieu: { label: <>Thành Tiền <br />Tính Phiếu</>, sortKey: 'thanhTienPhieu', align: 'right' },
  thanhTienKho: { label: <>Thành Tiền <br />Nhập Kho</>, sortKey: 'thanhTienKho', align: 'right' },
  ghiChuDonHangTong: { label: <>Ghi Chú <br />Đơn Hàng Tổng</>, sortKey: 'ghiChuDonHangTong' },
  ghiChuPhieu: { label: <>Ghi Chú <br />Phiếu</>, sortKey: 'ghiChuPhieu' },
  ghiChuNhapKho: { label: <>Ghi Chú <br />Nhập Kho</>, sortKey: 'ghiChuNhapKho' },
  thongTinQc: { label: <>Thông Tin <br />QC</>, sortKey: 'thongTinQc' },
  ghiChuXuatKho: { label: <>Ghi Chú <br />Xuất Kho</>, sortKey: 'ghiChuXuatKho' },
  // Chỉ để thỏa kiểu dữ liệu — header thật của "vuongMac" render đặc biệt (2 tầng).
  vuongMac: { label: 'Vướng Mắc (5M)', sortKey: 'vmMan' },
};

const FOOTER_KIND: Record<OptionalColKey, 'label' | 'total' | 'blank'> = {
  congTrinh: 'label',
  hangMuc: 'label',
  xuong: 'label',
  bop: 'label',
  tinhTrang: 'label',
  phanLoai: 'blank',
  triGia: 'total',
  thanhTienPhieu: 'total',
  thanhTienKho: 'total',
  ghiChuDonHangTong: 'blank',
  ghiChuPhieu: 'blank',
  ghiChuNhapKho: 'blank',
  thongTinQc: 'blank',
  ghiChuXuatKho: 'blank',
  vuongMac: 'blank',
};

const NUMERIC_SORT_KEYS: SortKey[] = ['triGia', 'thanhTienPhieu', 'thanhTienKho'];

const SortIcon = ({ active, dir }: { active: boolean; dir?: SortDir }) => {
  if (!active) return <ChevronsUpDown size={12} className="shrink-0 text-slate-400" />;
  return dir === 'asc' ? (
    <ChevronUp size={12} className="shrink-0 text-emerald-700" />
  ) : (
    <ChevronDown size={12} className="shrink-0 text-emerald-700" />
  );
};

export const HexDetailModal = ({
  isOpen,
  onClose,
  title,
  projectName,
  rows,
  columnKeys,
  currentUser,
}: HexDetailModalProps) => {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const footerScrollRef = useRef<HTMLDivElement>(null);

  const [scrollbarWidth, setScrollbarWidth] = useState(0);

  // Đã cuộn ngang hết sang phải hay chưa — để tô đỏ 2 ô đệm ở rìa phải header đúng lúc.
  const [scrolledToEnd, setScrolledToEnd] = useState(false);

  const {
    hexKey, congTrinhKey, hangMucKey, xuongKey, bopKey, tinhTrangKey,
    phanLoaiNhomSanPhamKey, triGiaDonHangTongKey, thanhTienTinhPhieuKey, thanhTienNhapKhoKey,
    ghiChuNhapKhoKey = 'tong_hop_ghi_chu_nhap_kho',
    thongTinQcKey = 'tong_hop_thong_tin_qc',
    ghiChuXuatKhoKey = 'tong_hop_ghi_chu_xuat_kho',
    ghiChuDonHangTongKey = 'ghi_chu_don_hang_tong',
    ghiChuPhieuKey = 'ghi_chu_phieu',
  } = columnKeys;

  const [notesMap, setNotesMap] = useState<NotesResponse>({});
  const [vuongMacMap, setVuongMacMap] = useState<Record<string, VuongMacItem[]>>({});

  const [vuongMacDetail, setVuongMacDetail] = useState<{
    open: boolean;
    hex: string;
    label: string;
    category: FiveMCategory;
    categoryLabel: string;
  }>({ open: false, hex: '', label: '', category: 'man', categoryLabel: '' });

  const [selectedNote, setSelectedNote] = useState<{
    row: DataRow;
    columnKey: string;
    label: string;
  } | null>(null);
  const [fullNoteText, setFullNoteText] = useState<string | null>(null);

  const hexList = useMemo(
    () => Array.from(new Set(rows.map(r => String(r[hexKey] || '')).filter(Boolean))),
    [rows, hexKey]
  );

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setSort(null);
      setSelectedNote(null);
      setFullNoteText(null);
      setVuongMacDetail({ open: false, hex: '', label: '', category: 'man', categoryLabel: '' });
      return;
    }
    if (hexList.length === 0) return;
    const ctrl = new AbortController();
    setNotesMap({});
    fetch('/api/production/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hexes: hexList }),
      signal: ctrl.signal,
    })
      .then((r): Promise<NotesResponse> => (r.ok ? r.json() : Promise.resolve({})))
      .then(setNotesMap)
      .catch(() => { /* bỏ qua lỗi mạng: ô ghi chú hiện "—" */ });
    return () => ctrl.abort();
  }, [isOpen, hexList]);

  // Tải lại vướng mắc 5M mỗi khi hexList đổi (kể cả sau khi popup con đóng).
  useEffect(() => {
    if (!isOpen || hexList.length === 0) {
      setVuongMacMap({});
      return;
    }
    fetchVuongMacList(hexList).then(setVuongMacMap);
  }, [isOpen, hexList, vuongMacDetail.open]);

  // Escape: chỉ đóng modal chính.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedNote) return;
      if (vuongMacDetail.open) return;
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, selectedNote, vuongMacDetail.open]);

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
    const el = bodyScrollRef.current;
    const left = el?.scrollLeft ?? 0;
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = left;
    if (footerScrollRef.current) footerScrollRef.current.scrollLeft = left;

    if (el) {
      const atEnd = left + el.clientWidth >= el.scrollWidth - 1;
      setScrolledToEnd(atEnd);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    handleBodyScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, rows, search, handleBodyScroll]);

  const getNotePreview = useCallback(
    (row: DataRow, key: string): string => String(notesMap[String(row[hexKey] || '')]?.[key] ?? ''),
    [notesMap, hexKey]
  );

  const getOpenVuongMacByCategory = useCallback(
    (row: DataRow, category: FiveMCategory): VuongMacItem[] => {
      const hex = String(row[hexKey] || '');
      return (vuongMacMap[hex] || []).filter(v => !v.isResolved && v.category === category);
    },
    [vuongMacMap, hexKey]
  );

  const getCategoryVuongMac = useCallback(
    (row: DataRow, category: FiveMCategory): VuongMacItem[] => {
      const hex = String(row[hexKey] || '');
      return (vuongMacMap[hex] || []).filter(v => v.category === category);
    },
    [vuongMacMap, hexKey]
  );

  const getLatestVuongMac = useCallback(
    (row: DataRow, category: FiveMCategory): VuongMacItem | null => {
      const list = getCategoryVuongMac(row, category);
      if (list.length === 0) return null;
      return list.reduce((best, v) => {
        const tv = new Date(v.createdAt).getTime();
        const tb = new Date(best.createdAt).getTime();
        return tv > tb || (tv === tb && v.id > best.id) ? v : best;
      });
    },
    [getCategoryVuongMac]
  );

  const openNoteCell = useCallback((row: DataRow, columnKey: string, label: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNote({ row, columnKey, label });
    setFullNoteText(null);

    const hex = String(row[hexKey] || '');
    if (!hex) { setFullNoteText(''); return; }

    fetch('/api/production/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hexes: [hex], full: true }),
    })
      .then((r): Promise<NotesResponse> => (r.ok ? r.json() : Promise.resolve({})))
      .then((d: NotesResponse) => setFullNoteText(String(d?.[hex]?.[columnKey] ?? '')))
      .catch(() => setFullNoteText(''));
  }, [hexKey]);

  const openVuongMacCell = useCallback((row: DataRow, category: FiveMCategory, e: React.MouseEvent) => {
    e.stopPropagation();
    const hex = String(row[hexKey] || '');
    if (!hex) return;
    setVuongMacDetail({
      open: true,
      hex,
      label: String(row[hangMucKey] || ''),
      category,
      categoryLabel: `${FIVE_M_VI[category]} (${FIVE_M_SHORT[category]})`,
    });
  }, [hexKey, hangMucKey]);

  const toggleSort = useCallback((key: SortKey) => {
    const defaultDir: SortDir = NUMERIC_SORT_KEYS.includes(key) ? 'desc' : 'asc';
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
    ...(showProjectColumn ? [{ key: 'congTrinh', label: 'Công Trình' }] : []),
    { key: 'hangMuc', label: 'Hạng Mục' },
    { key: 'xuong', label: 'Khu Vực SX' },
    { key: 'bop', label: 'BOP' },
    { key: 'tinhTrang', label: 'Tình Trạng' },
    { key: 'phanLoai', label: 'Phân Loại Nhóm Sản Phẩm' },
    { key: 'triGia', label: 'Trị Giá Đơn Hàng Tổng' },
    { key: 'thanhTienPhieu', label: 'Thành Tiền Tính Phiếu' },
    { key: 'thanhTienKho', label: 'Thành Tiền Nhập Kho' },
    { key: 'ghiChuDonHangTong', label: 'Ghi Chú Đơn Hàng Tổng' },
    { key: 'ghiChuPhieu', label: 'Ghi Chú Phiếu' },
    { key: 'ghiChuNhapKho', label: 'Tổng Hợp Ghi Chú Nhập Kho' },
    { key: 'thongTinQc', label: 'Tổng Hợp Thông Tin QC' },
    { key: 'ghiChuXuatKho', label: 'Tổng Hợp Ghi Chú Xuất Kho' },
    { key: 'vuongMac', label: 'Vướng Mắc (5M)' },
  ], [showProjectColumn]);

  const visibleCols = useMemo(
    () => resolveVisibleModalColumns('modal_hex_detail', OPTIONAL_COLUMNS),
    [OPTIONAL_COLUMNS, cfgVersion]
  );

  const orderedCols = useMemo(
    () => visibleCols.map(c => c.key) as OptionalColKey[],
    [visibleCols]
  );

  // ✅ Freeze: gồm cả STT + Mã Hex + các cột phụ. Nhóm "Vướng Mắc (5M)" không
  // ghim được — hook tự cắt phần ghim lại ở trước nhóm này.
  const frozen = useFrozenColumns(
    'modal_hex_detail',
    [{ key: 'stt', width: COL_WIDTHS.stt }, { key: 'hex', width: COL_WIDTHS.hex }],
    orderedCols,
    COL_WIDTHS,
    cfgVersion,
    ['vuongMac']
  );

  const hasVuongMacCol = orderedCols.includes('vuongMac');
  const lastColIsVuongMac = orderedCols[orderedCols.length - 1] === 'vuongMac';
  const showRedEdge = lastColIsVuongMac && scrolledToEnd;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(row => {
      const hex = String(row[hexKey] || '').toLowerCase();
      const hangMuc = String(row[hangMucKey] || '').toLowerCase();
      const status = String(row[tinhTrangKey] || '').toLowerCase();
      return hex.includes(q) || hangMuc.includes(q) || status.includes(q);
    });
  }, [rows, search, hexKey, hangMucKey, tinhTrangKey]);

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
        case 'ghiChuNhapKho': return getNotePreview(row, ghiChuNhapKhoKey);
        case 'thongTinQc': return getNotePreview(row, thongTinQcKey);
        case 'ghiChuXuatKho': return getNotePreview(row, ghiChuXuatKhoKey);
        case 'ghiChuDonHangTong': return getNotePreview(row, ghiChuDonHangTongKey);
        case 'ghiChuPhieu': return getNotePreview(row, ghiChuPhieuKey);
        case 'vmMan': return getOpenVuongMacByCategory(row, 'man').length;
        case 'vmMachine': return getOpenVuongMacByCategory(row, 'machine').length;
        case 'vmMaterial': return getOpenVuongMacByCategory(row, 'material').length;
        case 'vmMethod': return getOpenVuongMacByCategory(row, 'method').length;
        case 'vmMeasurement': return getOpenVuongMacByCategory(row, 'measurement').length;
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
    getNotePreview, getOpenVuongMacByCategory,
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

  if (!isOpen) return null;

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
    'Ghi Chú Đơn Hàng Tổng',
    'Ghi Chú Phiếu',
    'Tổng Hợp Ghi Chú Nhập Kho',
    'Tổng Hợp Thông Tin QC',
    'Tổng Hợp Ghi Chú Xuất Kho',
    ...FIVE_M_ORDER.map((cat) => `Vướng Mắc ${FIVE_M_SHORT[cat]} (${FIVE_M_VI[cat]})`),
  ];

  const exportFileName = `chi_tiet_hex_${(projectName ?? 'tat_ca_cong_trinh')
    .toString()
    .trim()
    .replace(/\s+/g, '_')}`;

  const handleExportCsv = async () => {
    let fullMap: NotesResponse = {};
    if (hexList.length > 0) {
      try {
        const r = await fetch('/api/production/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hexes: hexList, full: true }),
        });
        if (r.ok) fullMap = await r.json();
      } catch { /* xuất không kèm ghi chú nếu lỗi mạng */ }
    }
    const fullNoteOf = (row: DataRow, key: string) =>
      String(fullMap[String(row[hexKey] || '')]?.[key] ?? '');

    const vuongMacTextOf = (row: DataRow, category: FiveMCategory) => {
      const hex = String(row[hexKey] || '');
      const list = (vuongMacMap[hex] || []).filter(v => v.category === category);
      if (list.length === 0) return '';
      return list
        .map(v => `${v.content}${v.isResolved ? ' (Đã xử lý)' : ''}`)
        .join(' | ');
    };

    const exportRows = sortedRows.map(({ row, stt }) => ({
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
      'Ghi Chú Đơn Hàng Tổng': fullNoteOf(row, ghiChuDonHangTongKey),
      'Ghi Chú Phiếu': fullNoteOf(row, ghiChuPhieuKey),
      'Tổng Hợp Ghi Chú Nhập Kho': fullNoteOf(row, ghiChuNhapKhoKey),
      'Tổng Hợp Thông Tin QC': fullNoteOf(row, thongTinQcKey),
      'Tổng Hợp Ghi Chú Xuất Kho': fullNoteOf(row, ghiChuXuatKhoKey),
      ...Object.fromEntries(
        FIVE_M_ORDER.map((cat) => [
          `Vướng Mắc ${FIVE_M_SHORT[cat]} (${FIVE_M_VI[cat]})`,
          vuongMacTextOf(row, cat),
        ])
      ),
    }));
    exportDetailRowsToCsv(exportFileName, exportColumns, exportRows);
  };

  const totalMinWidth =
    COL_WIDTHS.stt +
    COL_WIDTHS.hex +
    orderedCols.reduce((sum, key) => sum + COL_WIDTHS[key], 0);

  // Colgroup dùng PX. Với "vuongMac", 1 vị trí -> 5 <col> vật lý. Cột vật lý
  // CUỐI CÙNG không khai báo width -> hấp thụ phần dư.
  const ColGroup = () => {
    const widths: number[] = [COL_WIDTHS.stt, COL_WIDTHS.hex];
    orderedCols.forEach((k) => {
      if (k === 'vuongMac') FIVE_M_ORDER.forEach(() => widths.push(VM_SUB_WIDTH));
      else widths.push(COL_WIDTHS[k]);
    });
    return (
      <colgroup>
        {widths.map((w, i) => (
          <col key={i} style={i === widths.length - 1 ? undefined : { width: w }} />
        ))}
      </colgroup>
    );
  };

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
    isLast = false,
    rowSpan = 1,
    style,
  }: {
    sortKey: SortKey;
    align?: 'left' | 'right';
    children: React.ReactNode;
    className?: string;
    isLast?: boolean;
    rowSpan?: number;
    style?: React.CSSProperties;
  }) => (
    <th
      onClick={() => toggleSort(sortKey)}
      rowSpan={rowSpan}
      style={style}
      className={`${isLast ? headerCellClass.replace('border-r ', '') : headerCellClass} ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {children}
        <SortIcon active={sort?.key === sortKey} dir={sort?.dir} />
      </span>
    </th>
  );

  const NoteCell = ({
    row, columnKey, label, className = '', style,
  }: {
    row: DataRow;
    columnKey: string;
    label: string;
    className?: string;
    style?: React.CSSProperties;
  }) => {
    const preview = getNotePreview(row, columnKey);
    return (
      <td
        style={style}
        onClick={(e) => openNoteCell(row, columnKey, label, e)}
        title="Bấm để xem đầy đủ nội dung"
        className={`cursor-pointer px-3 py-2.5 text-left align-top text-slate-600 break-words whitespace-normal transition-colors group-hover:bg-slate-50 hover:!bg-emerald-50 ${className}`}
      >
        {truncateText(preview) || '—'}
      </td>
    );
  };

  const VuongMacCatCell = ({ row, category }: { row: DataRow; category: FiveMCategory }) => {
    const openList = getOpenVuongMacByCategory(row, category);
    const total = getCategoryVuongMac(row, category).length;
    const latest = getLatestVuongMac(row, category);
    return (
      <td
        onClick={(e) => openVuongMacCell(row, category, e)}
        title={`Bấm để xem/nhập vướng mắc — ${FIVE_M_VI[category]}`}
        className={`cursor-pointer border-r border-red-100 px-2 py-2.5 text-left align-top transition-colors last:border-r-0 hover:bg-red-50 ${
          openList.length > 0 ? 'bg-red-50/60' : ''
        }`}
      >
        {!latest ? (
          <span className="text-slate-300">—</span>
        ) : (
          <div className="space-y-0.5">
            <span
              className={`block break-words text-[11px] font-medium ${
                latest.isResolved ? 'text-emerald-700' : VUONG_MAC_TEXT_STYLE[category]
              }`}
            >
              {truncateText(latest.content, 40)}
            </span>
            {latest.isResolved && <span className="block text-[10px] text-emerald-500">✓ Đã xử lý</span>}
            {total > 1 && (
              <span className={`block text-[10px] ${openList.length > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                +{total - 1} khác
              </span>
            )}
          </div>
        )}
      </td>
    );
  };

  // Render 1 ô "phụ" theo key — riêng "vuongMac" trả về MẢNG 5 <td>.
  const renderCell = (row: DataRow, key: OptionalColKey): React.ReactNode => {
    switch (key) {
      case 'congTrinh':
        return showProjectColumn ? (
          <td key="congTrinh" className="px-3 py-2.5 text-left align-top text-slate-700 group-hover:bg-slate-50">
            {String(row[congTrinhKey] || '—')}
          </td>
        ) : null;

      case 'hangMuc':
        return (
          <td key="hangMuc" className="px-3 py-2.5 text-left align-top text-slate-700 group-hover:bg-slate-50">
            {String(row[hangMucKey] || '—')}
          </td>
        );

      case 'xuong':
        return (
          <td key="xuong" className="px-3 py-2.5 text-left align-top text-slate-600 group-hover:bg-slate-50">
            {String(row[xuongKey] || '—')}
          </td>
        );

      case 'bop':
        return (
          <td key="bop" className="px-3 py-2.5 text-left align-top text-slate-600 group-hover:bg-slate-50">
            {String(row[bopKey] || '—')}
          </td>
        );

      case 'tinhTrang':
        return (
          <td key="tinhTrang" className="px-3 py-2.5 text-left align-top text-slate-600 group-hover:bg-slate-50">
            {String(row[tinhTrangKey] || '—')}
          </td>
        );

      case 'phanLoai':
        return (
          <td key="phanLoai" className="px-3 py-2.5 text-right align-top text-slate-600 group-hover:bg-slate-50">
            {String(row[phanLoaiNhomSanPhamKey] || '—')}
          </td>
        );

      case 'triGia':
        return (
          <td key="triGia" className="px-3 py-2.5 text-right align-top text-slate-800 group-hover:bg-slate-50">
            {money(parseNumber(row[triGiaDonHangTongKey]))}
          </td>
        );

      case 'thanhTienPhieu':
        return (
          <td key="thanhTienPhieu" className="px-3 py-2.5 text-right align-top text-slate-800 group-hover:bg-slate-50">
            {money(parseNumber(row[thanhTienTinhPhieuKey]))}
          </td>
        );

      case 'thanhTienKho':
        return (
          <td key="thanhTienKho" className="px-3 py-2.5 text-right align-top font-medium text-indigo-700 group-hover:bg-slate-50">
            {money(parseNumber(row[thanhTienNhapKhoKey]))}
          </td>
        );

      case 'ghiChuDonHangTong':
        return (
          <NoteCell key="ghiChuDonHangTong" row={row} columnKey={ghiChuDonHangTongKey} label="Ghi chú đơn hàng tổng" />
        );

      case 'ghiChuPhieu':
        return (
          <NoteCell key="ghiChuPhieu" row={row} columnKey={ghiChuPhieuKey} label="Ghi chú phiếu" />
        );

      case 'ghiChuNhapKho':
        return (
          <NoteCell key="ghiChuNhapKho" row={row} columnKey={ghiChuNhapKhoKey} label="Tổng hợp ghi chú nhập kho" />
        );

      case 'thongTinQc':
        return (
          <NoteCell key="thongTinQc" row={row} columnKey={thongTinQcKey} label="Tổng hợp thông tin QC" />
        );

      case 'ghiChuXuatKho':
        return (
          <NoteCell key="ghiChuXuatKho" row={row} columnKey={ghiChuXuatKhoKey} label="Tổng hợp ghi chú xuất kho" />
        );

      case 'vuongMac':
        return FIVE_M_ORDER.map((cat) => (
          <VuongMacCatCell key={cat} row={row} category={cat} />
        ));

      default:
        return null;
    }
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/50 p-4"
        role="dialog"
        aria-modal="true"
      >
        <div
          className="flex flex-col rounded-xl bg-white shadow-xl"
          style={{ width: '98vw', maxWidth: 2200, height: '94vh' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-slate-800">
                Chi tiết theo Hex — {title}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {projectName ?? 'Tất cả công trình'} · {filteredRows.length} hex ·{' '}
                Đơn vị tiền: 1,000 VNĐ · Bấm vào ô ghi chú để xem đầy đủ
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ModalColumnSetupButton
                modalId="modal_hex_detail"
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

          <div className="shrink-0 border-b border-slate-100 px-5 py-3 mb-2">
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
              <div className="shrink-0 overflow-hidden">
                <div className="flex bg-emerald-50">
                  {/* Đệm trái (luôn xanh) và đệm phải (đỏ CHỈ KHI cột cuối là
                      Vướng Mắc VÀ đã cuộn hết sang phải) là 2 div độc lập. */}
                  <div className="w-5 shrink-0 bg-emerald-50" />
                  <div ref={headerScrollRef} className="min-w-0 flex-1 overflow-x-hidden">
                    <table style={tableStyle} className="border-separate border-spacing-0 text-xs">
                      <ColGroup />
                      <thead className="font-bold uppercase tracking-tight text-slate-800">
                        <tr>
                          <th
                            onClick={() => toggleSort('stt')}
                            rowSpan={hasVuongMacCol ? 2 : 1}
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
                            rowSpan={hasVuongMacCol ? 2 : 1}
                            style={fzStyle(frozen.get('hex'))}
                            className={`${fzClass(frozen.get('hex'))} min-w-[140px] cursor-pointer select-none border-b border-r border-emerald-200 bg-emerald-50 px-3 py-3 text-left transition-colors hover:bg-emerald-100`}
                          >
                            <span className="inline-flex items-center gap-1">
                              Mã Hex
                              <SortIcon active={sort?.key === 'hex'} dir={sort?.dir} />
                            </span>
                          </th>
                          {orderedCols.map((key, i) => {
                            const isLast = i === orderedCols.length - 1;
                            if (key === 'vuongMac') {
                              return (
                                <th
                                  key="vuongMac-group"
                                  colSpan={FIVE_M_ORDER.length}
                                  className={`cursor-default select-none border-b border-red-200 bg-red-50 px-3 py-3 text-center text-red-700 ${
                                    isLast ? '' : 'border-r border-red-200'
                                  }`}
                                >
                                  Vướng Mắc (5M)
                                </th>
                              );
                            }
                            const meta = COLUMN_META[key];
                            return applyFrozen(
                              <SortableHeader
                                key={key}
                                sortKey={meta.sortKey}
                                align={meta.align}
                                isLast={isLast}
                                rowSpan={hasVuongMacCol ? 2 : 1}
                              >
                                {meta.label}
                              </SortableHeader>,
                              frozen.get(key),
                              '!bg-emerald-50'
                            );
                          })}
                        </tr>
                        {hasVuongMacCol && (
                          <tr>
                            {FIVE_M_ORDER.map((cat, idx) => (
                              <th
                                key={cat}
                                onClick={() => toggleSort(CATEGORY_SORT_KEY[cat])}
                                title={`${FIVE_M_VI[cat]} (${FIVE_M_SHORT[cat]})`}
                                className={`cursor-pointer select-none border-b border-red-200 bg-red-50/70 px-1 py-2 text-center text-red-700 transition-colors hover:bg-red-100 ${
                                  idx < FIVE_M_ORDER.length - 1 ? 'border-r border-red-100' : ''
                                }`}
                              >
                                <span className="inline-flex flex-col items-center justify-center gap-0.5 text-[10.5px] normal-case leading-tight">
                                  <span className="whitespace-normal break-words">
                                    {FIVE_M_VI[cat]} ({FIVE_M_SHORT[cat]})
                                  </span>
                                  <SortIcon active={sort?.key === CATEGORY_SORT_KEY[cat]} dir={sort?.dir} />
                                </span>
                              </th>
                            ))}
                          </tr>
                        )}
                      </thead>
                    </table>
                  </div>
                  <div className={`w-5 shrink-0 ${showRedEdge ? 'bg-red-50' : 'bg-emerald-50'}`} />
                  {scrollbarWidth > 0 && (
                    <div
                      style={{ width: scrollbarWidth }}
                      className={`shrink-0 ${showRedEdge ? 'bg-red-50' : 'bg-emerald-50'}`}
                    />
                  )}
                </div>
              </div>

              {/* Lớp NGOÀI chỉ tạo đệm 20px, KHÔNG cuộn; lớp TRONG (bodyScrollRef)
                  mới cuộn và không có padding — để sticky neo sát mép, không hở khe. */}
              <div className="min-h-0 flex-1 overflow-hidden px-5">
                <div
                  ref={bodyScrollRef}
                  onScroll={handleBodyScroll}
                  className="h-full overflow-auto custom-scrollbar"
                >
                  <table style={tableStyle} className="border-separate border-spacing-0 text-xs">
                    <ColGroup />
                    <tbody className="divide-y divide-emerald-50">
                      {sortedRows.map((entry) => {
                        const row = entry.row;
                        return (
                          <tr key={entry.stt} className="group transition-colors hover:bg-slate-50">
                            <td
                              style={fzStyle(frozen.get('stt'))}
                              className={`${fzClass(frozen.get('stt'))} border-r border-slate-100 bg-white group-hover:bg-slate-50 px-2 py-2.5 text-center align-top font-semibold text-slate-500`}
                            >
                              {entry.stt}
                            </td>
                            <td
                              style={fzStyle(frozen.get('hex'))}
                              className={`${fzClass(frozen.get('hex'))} border-r border-slate-100 bg-white group-hover:bg-slate-50 px-3 py-2.5 text-left align-top font-medium text-slate-700`}
                            >
                              {String(row[hexKey] || '—')}
                            </td>
                            {orderedCols.map((key) =>
                              applyFrozen(
                                renderCell(row, key),
                                frozen.get(key),
                                '!bg-white group-hover:!bg-slate-50'
                              )
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="shrink-0 overflow-hidden border-t-2 border-emerald-400 bg-emerald-100 px-5 shadow-[0_-2px_6px_rgba(0,0,0,0.06)]">
                <div className="flex">
                  <div ref={footerScrollRef} className="min-w-0 flex-1 overflow-x-hidden">
                    <table style={tableStyle} className="border-separate border-spacing-0 text-xs">
                      <ColGroup />
                      <tfoot className="font-bold text-slate-900">
                        <tr>
                          {(() => {
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
                                  TỔNG CỘNG ({filteredRows.length} hex)
                                </td>
                              );
                              labelRendered = true;
                            };

                            orderedCols.forEach((key) => {
                              const kind = FOOTER_KIND[key];
                              if (!labelRendered && kind === 'label') {
                                pendingSpan += 1;
                                return;
                              }
                              if (!labelRendered) flushLabel();
                              if (kind === 'total') {
                                const value =
                                  key === 'triGia' ? totals.triGiaDonHangTong :
                                  key === 'thanhTienPhieu' ? totals.thanhTienTinhPhieu :
                                  totals.thanhTienNhapKho;
                                cells.push(
                                  applyFrozen(
                                    <td
                                      key={key}
                                      className={`px-3 py-3 text-right ${key === 'thanhTienKho' ? 'text-indigo-800' : ''}`}
                                    >
                                      {money(value)}
                                    </td>,
                                    frozen.get(key),
                                    '!bg-emerald-100'
                                  )
                                );
                              } else if (key === 'vuongMac') {
                                cells.push(<td key={key} className="px-3 py-3" colSpan={FIVE_M_ORDER.length} />);
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
                Không có dữ liệu hex phù hợp để hiển thị.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Popup ghi chú: chỉ đóng bằng nút X. */}
      {selectedNote && (
        <div
          className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex h-[92vh] w-[96vw] max-w-none flex-col rounded-xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-slate-800">{selectedNote.label}</h3>
                <p className="mt-0.5 break-words text-xs text-slate-500">
                  Hex {String(selectedNote.row[hexKey] || '—')} · {String(selectedNote.row[hangMucKey] || '—')}
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

      {/* Popup CRUD + log Vướng Mắc — khóa cứng đúng hex + đúng loại 5M. */}
      <VuongMacDetailModal
        isOpen={vuongMacDetail.open}
        onClose={() => setVuongMacDetail(prev => ({ ...prev, open: false }))}
        hex={vuongMacDetail.hex}
        hexLabel={vuongMacDetail.label}
        category={vuongMacDetail.category}
        categoryLabel={vuongMacDetail.categoryLabel}
        currentUser={currentUser}
      />
    </>,
    document.body
  );
};