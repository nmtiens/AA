import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, X, ChevronUp, ChevronDown, ChevronsUpDown, Download,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
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

// Dữ liệu ghi chú trả về từ /api/production/notes: { [hex]: { [cột]: nội dung } }
type NotesResponse = Record<string, Record<string, string | null>>;

const money = (value: number) => formatDecimal(value / 1000);

// Cắt 100 ký tự đầu, thêm "..." nếu dài hơn (dùng cho ô xem trước trong bảng)
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

// Lưới ảnh thu nhỏ (thumbnail) + xem phóng to (lightbox) có nút chuyển ảnh trước/sau.
// Ảnh không tải được (do quyền Drive hoặc chưa đăng nhập đúng tài khoản Google)
// hiện ô báo lỗi thay vì icon ảnh vỡ mặc định của trình duyệt.
// Google Drive chặn <img src="/thumbnail?...">` nếu trình duyệt gửi kèm header
// Referer là domain lạ (hotlink protection) -> dùng referrerPolicy="no-referrer"
// để bỏ header đó, ảnh sẽ tải được với các file đã cấp quyền cho tài khoản đang
// đăng nhập. Nếu ảnh vẫn lỗi (quyền chặt hơn), tự chuyển ô đó sang hiển thị bằng
// iframe preview thu nhỏ — cùng cơ chế đang dùng ở popup phóng to, vốn tải được.
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
                
                 <a href={DRIVE_VIEW_URL(fileIds[lightboxIndex])}
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

// Hiển thị nội dung ĐÚNG 1 cột ghi chú của ĐÚNG 1 dòng đang chọn (không gộp 5 mục).
// CUỘN 2 LỚP:
//  - Lớp NGOÀI (do component cha bọc, xem trong JSX popup): cuộn qua các NGÀY.
//  - Lớp TRONG (mỗi khối ngày ở đây): tự cuộn riêng khi nội dung/ảnh của
//    NGÀY ĐÓ dài, để không đẩy các ngày khác ra xa và không bị lẫn với ngày khác.
const NOTE_BLOCK_MAX_HEIGHT = 420; // px — đủ cao để thấy ~1 hàng ảnh trước khi phải cuộn

const NoteContent = ({ text }: { text: string }) => {
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

            {/* Dòng nội dung (#...) cố định phía trên, KHÔNG cuộn theo ảnh */}
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

            {/* Chỉ phần ảnh mới cuộn khi nội dung dài */}
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

  // Ghi chú không nằm trong /api/all-data (quá nặng) nên tải riêng theo danh sách hex.
  // notesMap: bản xem trước (đã cắt 100 ký tự) cho toàn bộ danh sách hex đang xem.
  const [notesMap, setNotesMap] = useState<NotesResponse>({});

  // Ô đang được mở xem đầy đủ: đúng 1 hex + đúng 1 cột ghi chú
  const [selectedNote, setSelectedNote] = useState<{
    row: DataRow;
    columnKey: string;
    label: string;
  } | null>(null);
  // Nội dung đầy đủ (nguyên văn) của ô đang mở — null nghĩa là đang tải
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

  // Escape: chỉ đóng modal chính. Popup nội dung ghi chú CHỈ đóng bằng nút X.
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
    (row: DataRow, key: string): string => String(notesMap[String(row[hexKey] || '')]?.[key] ?? ''),
    [notesMap, hexKey]
  );

  // Bấm vào 1 ô ghi chú: mở popup CHỈ với đúng cột đó, tải nguyên văn riêng
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
    return rows.filter(row => {
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
        case 'ghiChuNhapKho': return getNotePreview(row, ghiChuNhapKhoKey);
        case 'thongTinQc': return getNotePreview(row, thongTinQcKey);
        case 'ghiChuXuatKho': return getNotePreview(row, ghiChuXuatKhoKey);
        case 'ghiChuDonHangTong': return getNotePreview(row, ghiChuDonHangTongKey);
        case 'ghiChuPhieu': return getNotePreview(row, ghiChuPhieuKey);
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
    getNotePreview,
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
    'Ghi Chú Đơn Hàng Tổng',
    'Ghi Chú Phiếu',
    'Tổng Hợp Ghi Chú Nhập Kho',
    'Tổng Hợp Thông Tin QC',
    'Tổng Hợp Ghi Chú Xuất Kho',
  ];

  const exportFileName = `chi_tiet_hex_${(projectName ?? 'tat_ca_cong_trinh')
    .toString()
    .trim()
    .replace(/\s+/g, '_')}`;

  // Xuất CSV: tải nguyên văn 5 cột ghi chú cho toàn bộ hex đang hiển thị
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
    }));
    exportDetailRowsToCsv(exportFileName, exportColumns, exportRows);
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
      <col style={{ width: pct(COL_WIDTHS.ghiChuDonHangTong) }} />
      <col style={{ width: pct(COL_WIDTHS.ghiChuPhieu) }} />
      <col style={{ width: pct(COL_WIDTHS.ghiChuNhapKho) }} />
      <col style={{ width: pct(COL_WIDTHS.thongTinQc) }} />
      <col style={{ width: pct(COL_WIDTHS.ghiChuXuatKho) }} />
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

  // Ô ghi chú trong bảng: bấm vào ĐÚNG Ô này mới mở popup, không phải cả dòng
  const NoteCell = ({ row, columnKey, label }: { row: DataRow; columnKey: string; label: string }) => {
    const preview = getNotePreview(row, columnKey);
    return (
      <td
        onClick={(e) => openNoteCell(row, columnKey, label, e)}
        title="Bấm để xem đầy đủ nội dung"
        className="cursor-pointer px-3 py-2.5 text-left align-top text-slate-600 break-words whitespace-normal transition-colors hover:bg-emerald-50"
      >
        {truncateText(preview) || '—'}
      </td>
    );
  };

  // ✅ SỬA: return createPortal(...) — render trực tiếp ra document.body để
  // position: fixed luôn tính theo viewport thật, không bị giam trong bất kỳ
  // ancestor nào có transform/filter/contain ở layout cha (sidebar, app shell...).
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
                          <SortableHeader sortKey="ghiChuDonHangTong">
                            Ghi Chú <br />Đơn Hàng Tổng
                          </SortableHeader>
                          <SortableHeader sortKey="ghiChuPhieu">
                            Ghi Chú <br />Phiếu
                          </SortableHeader>
                          <SortableHeader sortKey="ghiChuNhapKho">
                            Ghi Chú <br />Nhập Kho
                          </SortableHeader>
                          <SortableHeader sortKey="thongTinQc">
                            Thông Tin <br />QC
                          </SortableHeader>
                          <th
                            onClick={() => toggleSort('ghiChuXuatKho')}
                            className="cursor-pointer select-none border-b border-emerald-200 bg-emerald-50 px-3 py-3 text-left transition-colors hover:bg-emerald-100"
                          >
                            <span className="inline-flex items-center gap-1">
                              Ghi Chú <br />Xuất Kho
                              <SortIcon active={sort?.key === 'ghiChuXuatKho'} dir={sort?.dir} />
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
                        <tr key={entry.stt} className="transition-colors hover:bg-slate-50">
                          <td
                            style={{ left: 0 }}
                            className="sticky z-10 border-r border-slate-100 bg-white px-2 py-2.5 text-center align-top font-semibold text-slate-500"
                          >
                            {entry.stt}
                          </td>
                          <td
                            style={{ left: COL_WIDTHS.stt }}
                            className="sticky z-10 border-r border-slate-100 bg-white px-3 py-2.5 text-left align-top font-medium text-slate-700"
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
                          <NoteCell row={row} columnKey={ghiChuDonHangTongKey} label="Ghi chú đơn hàng tổng" />
                          <NoteCell row={row} columnKey={ghiChuPhieuKey} label="Ghi chú phiếu" />
                          <NoteCell row={row} columnKey={ghiChuNhapKhoKey} label="Tổng hợp ghi chú nhập kho" />
                          <NoteCell row={row} columnKey={thongTinQcKey} label="Tổng hợp thông tin QC" />
                          <NoteCell row={row} columnKey={ghiChuXuatKhoKey} label="Tổng hợp ghi chú xuất kho" />
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

      {/* Popup: chỉ hiện nội dung của ĐÚNG 1 ô (1 dòng x 1 cột) vừa bấm.
          Chỉ đóng bằng nút X — bấm ra ngoài (backdrop) hoặc Escape KHÔNG đóng. */}
      {selectedNote && (
        <div
         className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="flex h-[92vh] w-[96vw] max-w-none flex-col rounded-xl bg-white shadow-2xl"
          >
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
            {/* Mỗi khối theo ngày (bên trong NoteContent) tự cuộn riêng; khung này
                chỉ cuộn thêm khi tổng số khối vượt quá chiều cao popup. */}
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
    </>,
    document.body
  );
};