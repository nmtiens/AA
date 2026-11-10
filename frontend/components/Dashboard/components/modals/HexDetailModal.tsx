import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, X, ChevronUp, ChevronDown, ChevronsUpDown, Download,
  ChevronLeft, ChevronRight, Package,
} from 'lucide-react';
import { parseNumber } from '../../utils/numberParsers';
import { fmtDate, fmtInt, fmtTy } from '../../../../utils/format';
import { exportDetailRowsToCsv } from '../../utils/csvExport';
import { DataRow } from '../../../../types';
import { deadlineOf as deadlineOfRow, DEADLINE_SOURCE_LABEL, type DeadlineKeys } from '../../../../utils/productionMetrics';
import { ModalColumnSetupButton } from '../../../Construction/utils/ModalColumnSetupButton';
import { resolveVisibleModalColumns, ModalColumnDef } from '../../../Construction/utils/tableColumnConfig';
import { useFrozenColumns, applyFrozen, fzClass, fzStyle } from '../../../Construction/utils/useFrozenColumns';
import {
  fetchVuongMacList,
  type VuongMacItem,
  type FiveMCategory,
} from '../../../../services/vuongMacService';
import { VuongMacDetailModal } from './VuongMacDetailModal';
import { HexMaterialModal, type MaterialViewMode } from './HexMaterialModal';
import { xuongSetupApi, type TomTatHex } from '../../../../services/xuongSetupApi';
import XuongHexChiTiet from '../../../Xuong/XuongHexChiTiet';
import { ModalShell } from '../../../shared/ModalShell';
import * as bang from '../../../shared/bangBaoCao';
import { chenCotSoHex, soHex, tongHex, type KhoaSoHex, type SoHex } from '../../core/chiTietHex';

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
  /** Cột ngày cần giao — để sắp hex "chưa tìm thấy vật tư" theo hạn giao. Không truyền thì tự dò tên cột. */
  ngayCanGiaoKey?: string;
}

// Lọc theo vật tư: tất cả | hex có vật tư | hex chưa tìm thấy vật tư (map theo mã nhà máy)
type MaterialFilter = 'all' | 'with' | 'without';

interface HexDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  projectName: string | null;
  rows: DataRow[];
  columnKeys: HexDetailColumnKeys;
  currentUser: string;
  /** Giá trị của chính số vừa bấm theo từng HEX (bảng nguồn, trong kỳ): thêm 1 cột để tổng bằng số đã bấm */
  giaTriKy?: Record<string, number> | null;
}

type NotesResponse = Record<string, Record<string, string | null>>;

// Giá trị gốc là triệu đồng: hiển thị tỷ, ô 0 để trống
const money = (value: number) => bang.trong0(value, fmtTy);

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
                <span className="text-[0.6875rem] text-slate-400">Cuộn trong khung để xem hết</span>
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

const FIVE_M_ORDER: FiveMCategory[] = ['man', 'machine', 'material', 'method', 'measurement'];
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
  triGia: 110,
  thanhTienPhieu: 110,
  thanhTienKho: 110,
  giaTriKy: 110,
  conLai: 110,
  daXuat: 110,
  tonKho: 110,
  chenh: 100,
  xuatVuot: 110,
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
  | 'giaTriKy'
  | 'conLai'
  | 'daXuat'
  | 'tonKho'
  | 'chenh'
  | 'xuatVuot'
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
  | 'giaTriKy'
  | 'conLai'
  | 'daXuat'
  | 'tonKho'
  | 'chenh'
  | 'xuatVuot'
  | 'ghiChuDonHangTong'
  | 'ghiChuPhieu'
  | 'ghiChuNhapKho'
  | 'thongTinQc'
  | 'ghiChuXuatKho'
  | 'vuongMac';

/** Cột số căn giữa + lấy số nào ở mỗi cột: cùng khoá ở bảng và dòng TỔNG */
const COT_SO: Partial<Record<OptionalColKey, keyof Omit<SoHex, 'huy' | 'triGiaHuy'>>> = {
  triGia: 'triGia', thanhTienPhieu: 'phieu', thanhTienKho: 'nhap', conLai: 'conLai',
  daXuat: 'xuat', tonKho: 'ton', chenh: 'chenh', xuatVuot: 'xv',
};

const COLUMN_META: Record<OptionalColKey, { label: React.ReactNode; sortKey: SortKey; align?: 'left' | 'center' }> = {
  congTrinh: { label: 'Công trình', sortKey: 'congTrinh' },
  hangMuc: { label: 'Hạng mục', sortKey: 'hangMuc' },
  xuong: { label: 'Khu vực SX', sortKey: 'xuong' },
  bop: { label: 'BOP', sortKey: 'bop' },
  tinhTrang: { label: 'Tình trạng', sortKey: 'tinhTrang' },
  phanLoai: { label: 'Phân loại nhóm SP', sortKey: 'phanLoai' },
  giaTriKy: { label: 'Giá trị kỳ (tỷ)', sortKey: 'giaTriKy', align: 'center' },
  triGia: { label: 'Trị giá (tỷ)', sortKey: 'triGia', align: 'center' },
  thanhTienPhieu: { label: 'Tính phiếu (tỷ)', sortKey: 'thanhTienPhieu', align: 'center' },
  thanhTienKho: { label: 'Đã nhập (tỷ)', sortKey: 'thanhTienKho', align: 'center' },
  conLai: { label: 'Còn lại (tỷ)', sortKey: 'conLai', align: 'center' },
  daXuat: { label: 'Đã xuất (tỷ)', sortKey: 'daXuat', align: 'center' },
  tonKho: { label: 'Tồn theo đơn (tỷ)', sortKey: 'tonKho', align: 'center' },
  chenh: { label: 'Chênh (tỷ)', sortKey: 'chenh', align: 'center' },
  xuatVuot: { label: 'Xuất vượt nhập (tỷ)', sortKey: 'xuatVuot', align: 'center' },
  ghiChuDonHangTong: { label: 'Ghi chú đơn hàng tổng', sortKey: 'ghiChuDonHangTong' },
  ghiChuPhieu: { label: 'Ghi chú phiếu', sortKey: 'ghiChuPhieu' },
  ghiChuNhapKho: { label: 'Ghi chú nhập kho', sortKey: 'ghiChuNhapKho' },
  thongTinQc: { label: 'Thông tin QC', sortKey: 'thongTinQc' },
  ghiChuXuatKho: { label: 'Ghi chú xuất kho', sortKey: 'ghiChuXuatKho' },
  // Chỉ để thỏa kiểu dữ liệu — header thật của "vuongMac" render đặc biệt (2 tầng).
  vuongMac: { label: 'Vướng Mắc (5M)', sortKey: 'vmMan' },
};

const COT_KHO_CSV = ['Còn Lại (Triệu đồng)', 'Đã Xuất (Triệu đồng)', 'Tồn Theo Đơn (Triệu đồng)', 'Chênh (Triệu đồng)', 'Xuất Vượt Nhập (Triệu đồng)'];

const NUMERIC_SORT_KEYS: SortKey[] = ['giaTriKy', 'triGia', 'thanhTienPhieu', 'thanhTienKho', 'conLai', 'daXuat', 'tonKho', 'chenh', 'xuatVuot'];

const SortIcon = ({ active, dir }: { active: boolean; dir?: SortDir }) => {
  if (!active) return <ChevronsUpDown size={12} className="shrink-0 text-slate-600" />;
  return dir === 'asc' ? <ChevronUp size={12} className="shrink-0" /> : <ChevronDown size={12} className="shrink-0" />;
};

// Ghi chú theo hex — API nhận tối đa 2000 hex / lần => chia lô rồi gộp (trước gửi cả danh sách, quá 2000
// thì nhận 400, ô ghi chú hiện "—" và file CSV mất ghi chú)
const NOTES_CHUNK = 2000;
async function fetchNotesChunked(hexes: string[], full: boolean, signal?: AbortSignal): Promise<NotesResponse> {
  const out: NotesResponse = {};
  for (let i = 0; i < hexes.length; i += NOTES_CHUNK) {
    const r = await fetch('/api/production/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hexes: hexes.slice(i, i + NOTES_CHUNK), ...(full ? { full: true } : {}) }),
      signal,
    });
    if (r.ok) Object.assign(out, await r.json());
  }
  return out;
}

export const HexDetailModal = ({
  isOpen,
  onClose,
  title,
  projectName,
  rows,
  columnKeys,
  currentUser,
  giaTriKy = null,
}: HexDetailModalProps) => {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

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
  // Xem vật tư: null = đóng; hexes = danh sách hex cần xem (1 hex hoặc cả danh sách đang lọc)
  const [materialView, setMaterialView] = useState<{ hexes: string[]; title: string; mode: MaterialViewMode } | null>(null);
  // Tổng vật tư cùng công trình nhưng chưa có mã nhà máy chỉ định (cho các hex không khớp được vật tư)
  const [unassignedCount, setUnassignedCount] = useState<{ lines: number; prs: number } | null>(null);
  // Số dòng vật tư (map theo mã nhà máy) của từng hex; null = đang tải
  const [materialCountByHex, setMaterialCountByHex] = useState<Record<string, number> | null>(null);
  // Mục Xưởng: hạng mục đang ở công đoạn nào (chỉ hex đã có dữ liệu xưởng) + hex đang mở chi tiết
  const [xuongTomTat, setXuongTomTat] = useState<Record<string, TomTatHex>>({});
  const [xuongHex, setXuongHex] = useState<string | null>(null);
  // Mặc định hiện ĐỦ hex (khớp số ở bảng ngoài)
  const [materialFilter, setMaterialFilter] = useState<MaterialFilter>('all');

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
      setMaterialView(null);
      setVuongMacDetail({ open: false, hex: '', label: '', category: 'man', categoryLabel: '' });
      return;
    }
    if (hexList.length === 0) return;
    const ctrl = new AbortController();
    setNotesMap({});
    fetchNotesChunked(hexList, false, ctrl.signal)
      .then(setNotesMap)
      .catch(() => { /* bỏ qua lỗi mạng: ô ghi chú hiện "—" */ });
    return () => ctrl.abort();
  }, [isOpen, hexList]);

  useEffect(() => {
    setUnassignedCount(null);
    setMaterialCountByHex(null);
    if (!isOpen) { setMaterialFilter('all'); return; }
    if (hexList.length === 0) return;
    const ctrl = new AbortController();
    const post = (mode: string) => fetch('/api/material/by-hex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hexes: hexList, mode }),
      signal: ctrl.signal,
    }).then(r => (r.ok ? r.json() : null));
    post('unassigned-count')
      .then(d => { if (d) setUnassignedCount({ lines: Number(d.lines) || 0, prs: Number(d.prs) || 0 }); })
      .catch(() => { /* lỗi mạng: nút hiện "…" */ });
    post('hex-counts')
      .then(d => setMaterialCountByHex(d && typeof d === 'object' ? d : {}))
      .catch(e => { if (e?.name !== 'AbortError') setMaterialCountByHex({}); });
    return () => ctrl.abort();
  }, [isOpen, hexList]);

  useEffect(() => {
    setXuongTomTat({});
    if (!isOpen || hexList.length === 0) return;
    let huy = false;
    // API nhận tối đa 1000 hex / lần: chia lô rồi gộp
    const lo: string[][] = [];
    for (let i = 0; i < hexList.length; i += 1000) lo.push(hexList.slice(i, i + 1000));
    Promise.all(lo.map(x => xuongSetupApi.tomTat(x))).then(rs => {
      if (huy) return;
      setXuongTomTat(Object.assign({}, ...rs.map(r => (r.ok ? r.data.tomTat : {}))));
    });
    return () => { huy = true; };
  }, [isOpen, hexList]);

  // Tải lại vướng mắc 5M mỗi khi hexList đổi (kể cả sau khi popup con đóng).
  useEffect(() => {
    if (!isOpen || hexList.length === 0) {
      setVuongMacMap({});
      return;
    }
    fetchVuongMacList(hexList).then(setVuongMacMap);
  }, [isOpen, hexList, vuongMacDetail.open]);

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

  const { hangMucByHex, congTrinhByHex } = useMemo(() => {
    const hm: Record<string, string> = {};
    const ct: Record<string, string> = {};
    rows.forEach(r => {
      const h = String(r[hexKey] || '');
      if (!h) return;
      if (!hm[h]) hm[h] = String(r[hangMucKey] || '');
      if (!ct[h]) ct[h] = String(r[congTrinhKey] || '');
    });
    return { hangMucByHex: hm, congTrinhByHex: ct };
  }, [rows, hexKey, hangMucKey, congTrinhKey]);

  // ==== Setup cột hiển thị (chỉ Admin) ====
  const [cfgVersion, setCfgVersion] = useState(0);

  const OPTIONAL_COLUMNS: ModalColumnDef[] = useMemo(() => [
    ...(showProjectColumn ? [{ key: 'congTrinh', label: 'Công Trình' }] : []),
    { key: 'hangMuc', label: 'Hạng Mục' },
    { key: 'xuong', label: 'Khu Vực SX' },
    { key: 'bop', label: 'BOP' },
    { key: 'tinhTrang', label: 'Tình Trạng' },
    { key: 'phanLoai', label: 'Phân Loại Nhóm Sản Phẩm' },
    { key: 'triGia', label: 'Trị giá (tỷ)' },
    { key: 'thanhTienPhieu', label: 'Tính phiếu (tỷ)' },
    { key: 'thanhTienKho', label: 'Đã nhập (tỷ)' },
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
    () => chenCotSoHex(visibleCols.map(c => c.key), !!giaTriKy) as OptionalColKey[],
    [visibleCols, giaTriKy]
  );

  const khoaSo = useMemo<KhoaSoHex>(() => ({
    triGiaKey: triGiaDonHangTongKey, phieuKey: thanhTienTinhPhieuKey, nhapKhoKey: thanhTienNhapKhoKey,
  }), [triGiaDonHangTongKey, thanhTienTinhPhieuKey, thanhTienNhapKhoKey]);
  const kyCua = useCallback((row: DataRow) => giaTriKy?.[String(row[hexKey] ?? '').trim()] ?? 0, [giaTriKy, hexKey]);

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

  // Ngày hạn (quy tắc chung): CHỈ KH nhập kho tuần → KH nhập kho tháng (ngày cần giao chỉ tham khảo).
  // Khoá ngày cần giao: ưu tiên khoá được truyền vào, không thì dò theo tên cột trong dữ liệu.
  const deadlineKeys = useMemo<DeadlineKeys | null>(() => {
    const sample = rows[0];
    if (!sample) return null;
    const keys = Object.keys(sample);
    const ngayCanGiaoKey = columnKeys.ngayCanGiaoKey || (keys.find(k => /ngay[_\s]*can[_\s]*giao/i.test(k)) ?? '');
    const dk: DeadlineKeys = {
      khnkTuanKey: 'ngay_khnk_tuan', khnkThangKey: 'ngay_khnk_thang', ngayCanGiaoKey,
      ngayCanKey: 'ngay_can', botDuAnKey: 'bot_du_an', hexKey: columnKeys.hexKey || 'hex',
    };
    return [dk.khnkTuanKey, dk.khnkThangKey, ngayCanGiaoKey].some(k => k && keys.includes(k)) ? dk : null;
  }, [columnKeys.ngayCanGiaoKey, rows]);
  const hasDeadline = deadlineKeys !== null;
  const deadlineInfo = (row: DataRow) => (deadlineKeys ? deadlineOfRow(row, deadlineKeys) : null);
  const deadlineOf = (row: DataRow): Date | null => deadlineInfo(row)?.date ?? null;
  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);

  const hexWithMaterialCount = useMemo(
    () => (materialCountByHex ? hexList.filter(h => (materialCountByHex[h] || 0) > 0).length : null),
    [materialCountByHex, hexList]
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Lọc "chỉ hex có vật tư" chỉ áp dụng khi đã tải xong số vật tư
    const hasMat = (row: DataRow) => (materialCountByHex?.[String(row[hexKey] || '')] || 0) > 0;
    let base = rows;
    if (materialFilter !== 'all' && materialCountByHex) {
      base = rows.filter(row => (materialFilter === 'with' ? hasMat(row) : !hasMat(row)));
      // Hex chưa tìm thấy vật tư: gấp nhất (hạn KH nhập kho sớm nhất) lên đầu, không có ngày xếp cuối
      if (materialFilter === 'without' && hasDeadline) {
        const t = (row: DataRow) => deadlineOf(row)?.getTime() ?? Number.POSITIVE_INFINITY;
        base = [...base].sort((a, b) => t(a) - t(b));
      }
    }
    if (!q) return base;
    return base.filter(row => {
      const hex = String(row[hexKey] || '').toLowerCase();
      const hangMuc = String(row[hangMucKey] || '').toLowerCase();
      const status = String(row[tinhTrangKey] || '').toLowerCase();
      return hex.includes(q) || hangMuc.includes(q) || status.includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, hexKey, hangMucKey, tinhTrangKey, materialFilter, materialCountByHex, deadlineKeys]);

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
        case 'giaTriKy': return kyCua(row);
        case 'triGia': return soHex(row, khoaSo).triGia;
        case 'thanhTienPhieu': return soHex(row, khoaSo).phieu;
        case 'thanhTienKho': return soHex(row, khoaSo).nhap;
        case 'conLai': return soHex(row, khoaSo).conLai;
        case 'daXuat': return soHex(row, khoaSo).xuat;
        case 'tonKho': return soHex(row, khoaSo).ton;
        case 'chenh': return soHex(row, khoaSo).chenh;
        case 'xuatVuot': return soHex(row, khoaSo).xv;
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
    phanLoaiNhomSanPhamKey, khoaSo, kyCua,
    ghiChuNhapKhoKey, thongTinQcKey, ghiChuXuatKhoKey, ghiChuDonHangTongKey, ghiChuPhieuKey,
    getNotePreview, getOpenVuongMacByCategory,
  ]);

  const totals = useMemo(() => tongHex(filteredRows, khoaSo), [filteredRows, khoaSo]);
  const tongKy = useMemo(() => filteredRows.reduce((a, row) => a + kyCua(row), 0), [filteredRows, kyCua]);

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
    'Trị Giá Đơn Hàng Tổng (Triệu đồng)',
    'Thành Tiền Tính Phiếu (Triệu đồng)',
    'Thành Tiền Nhập Kho (Triệu đồng)',
    ...COT_KHO_CSV,
    ...(giaTriKy ? ['Giá Trị Kỳ (Triệu đồng)'] : []),
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
        fullMap = await fetchNotesChunked(hexList, true);
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
      'Trị Giá Đơn Hàng Tổng (Triệu đồng)': parseNumber(row[triGiaDonHangTongKey]),
      'Thành Tiền Tính Phiếu (Triệu đồng)': parseNumber(row[thanhTienTinhPhieuKey]),
      'Thành Tiền Nhập Kho (Triệu đồng)': parseNumber(row[thanhTienNhapKhoKey]),
      ...(() => {
        const s = soHex(row, khoaSo);
        return Object.fromEntries(COT_KHO_CSV.map((ten, i) => [ten, [s.conLai, s.xuat, s.ton, s.chenh, s.xv][i]]));
      })(),
      ...(giaTriKy ? { 'Giá Trị Kỳ (Triệu đồng)': kyCua(row) } : {}),
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

  const headerCellClass = `${bang.thB} cursor-pointer select-none transition-colors hover:bg-emerald-400`;

  const SortableHeader = ({
    sortKey,
    align = 'left',
    children,
    className = '',
    rowSpan = 1,
    style,
  }: {
    sortKey: SortKey;
    align?: 'left' | 'center';
    children: React.ReactNode;
    className?: string;
    rowSpan?: number;
    style?: React.CSSProperties;
  }) => (
    <th
      onClick={() => toggleSort(sortKey)}
      rowSpan={rowSpan}
      style={style}
      className={`${headerCellClass} ${align === 'center' ? 'text-center' : 'text-left'} ${className}`}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'center' ? 'justify-center' : ''}`}>
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
        className={`${bang.tdB} cursor-pointer break-words whitespace-normal text-left transition-colors group-hover:bg-slate-50 hover:!bg-emerald-50 ${className}`}
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
        className={`${bang.tdB} cursor-pointer text-left transition-colors hover:bg-red-50 ${openList.length > 0 ? 'bg-red-50/60' : ''}`}
      >
        {!latest ? (
          <span className="text-slate-300">—</span>
        ) : (
          <div className="space-y-0.5">
            <span
              className={`block break-words text-[0.6875rem] font-medium ${
                latest.isResolved ? 'text-emerald-700' : VUONG_MAC_TEXT_STYLE[category]
              }`}
            >
              {truncateText(latest.content, 40)}
            </span>
            {latest.isResolved && <span className="block text-[0.625rem] text-emerald-500">✓ Đã xử lý</span>}
            {total > 1 && (
              <span className={`block text-[0.625rem] ${openList.length > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                +{total - 1} khác
              </span>
            )}
          </div>
        )}
      </td>
    );
  };

  // Render 1 ô "phụ" theo key — riêng "vuongMac" trả về MẢNG 5 <td>.
  const oChu = (key: string, v: unknown) => (
    <td key={key} className={`${bang.tdB} break-words group-hover:bg-slate-50`}>{String(v || '—')}</td>
  );
  const renderCell = (row: DataRow, key: OptionalColKey, s: SoHex): React.ReactNode => {
    const cotSo = COT_SO[key];
    if (cotSo) return <td key={key} className={`${bang.tdSo} group-hover:bg-slate-50`}>{money(s[cotSo])}</td>;
    switch (key) {
      case 'congTrinh':
        return showProjectColumn ? oChu(key, row[congTrinhKey]) : null;

      case 'hangMuc':
        return oChu(key, row[hangMucKey]);

      case 'xuong':
        return oChu(key, row[xuongKey]);

      case 'bop':
        return oChu(key, row[bopKey]);

      case 'tinhTrang':
        return oChu(key, row[tinhTrangKey]);

      case 'phanLoai':
        return oChu(key, row[phanLoaiNhomSanPhamKey]);

      case 'giaTriKy':
        return <td key={key} className={`${bang.tdSo} font-bold group-hover:bg-slate-50`}>{money(kyCua(row))}</td>;

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
      <ModalShell
        open={isOpen}
        onClose={onClose}
        labelledBy="hex-detail-title"
        overlayClassName="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/50 p-4"
        panelClassName="flex h-[94vh] w-[98vw] max-w-[2200px] flex-col rounded-xl bg-white shadow-xl focus:outline-none"
      >
        <div className="flex min-h-0 flex-1 flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <h3 id="hex-detail-title" className="text-base font-semibold text-slate-800">
                Chi tiết theo Hex — {title}
              </h3>
              <p className="mt-0.5 text-sm text-slate-500">
                {projectName ?? 'Tất cả công trình'} · {fmtInt(totals.n)} hex
                {totals.huy.n > 0 && (
                  <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 font-medium text-red-700">
                    HỦY: {fmtInt(totals.huy.n)} hex · {fmtTy(totals.huy.triGia)} tỷ
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMaterialView({
                  hexes: Array.from(new Set(filteredRows.map(r => String(r[hexKey] || '')).filter(Boolean))),
                  title,
                  mode: 'matched',
                })}
                disabled={filteredRows.length === 0}
                title="Xem vật tư của các hex đang hiển thị (map qua mã nhà máy)"
                className="flex items-center gap-1.5 rounded-lg border border-amber-500 bg-amber-50 px-3.5 py-1.5 text-xs font-bold text-amber-700 shadow-sm transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Package size={15} />
                <span>Vật tư</span>
              </button>
              <button
                type="button"
                onClick={() => setMaterialView({ hexes: hexList, title, mode: 'unassigned' })}
                disabled={!unassignedCount || unassignedCount.lines === 0}
                title="Vật tư cùng công trình (theo mã công trình) nhưng chưa ghi mã nhà máy cho hạng mục nào — tính cho các hex không khớp được vật tư theo mã nhà máy"
                className="flex items-center gap-1.5 rounded-lg border border-rose-400 bg-rose-50 px-3.5 py-1.5 text-xs font-bold text-rose-700 shadow-sm transition-all hover:bg-rose-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span>Chưa có mã nhà máy chỉ định</span>
                <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[0.6875rem] text-white">
                  {unassignedCount === null
                    ? '…'
                    : `${fmtInt(unassignedCount.lines)} dòng · ${fmtInt(unassignedCount.prs)} PR`}
                </span>
              </button>
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

          <div className="mb-2 flex shrink-0 flex-wrap items-center gap-4 border-b border-slate-100 px-5 py-3">
            <div className="relative w-full max-w-xs">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo mã hex, hạng mục, tình trạng..."
                className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-300"
              />
            </div>
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-xs font-medium">
              {([
                ['all', 'Tất cả', hexList.length],
                ['with', 'Có PR ghi mã HM', hexWithMaterialCount],
                ['without', 'Chưa có PR ghi mã HM', hexWithMaterialCount === null ? null : hexList.length - hexWithMaterialCount],
              ] as [MaterialFilter, string, number | null][]).map(([k, label, n]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setMaterialFilter(k); if (k === 'without') setSort(null); }}
                  disabled={k !== 'all' && hexWithMaterialCount === null}
                  title={k === 'without'
                    ? 'Hex không gắn được dòng vật tư nào theo mã nhà máy — sắp theo hạn KH nhập kho, gấp nhất lên đầu'
                    : undefined}
                  className={`px-3 py-1.5 transition-colors disabled:cursor-wait disabled:opacity-60 ${
                    materialFilter === k
                      ? (k === 'without' ? 'bg-red-600 text-white' : 'bg-slate-800 text-white')
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {label} <span className="opacity-70">({n === null ? '…' : fmtInt(n)})</span>
                </button>
              ))}
            </div>
            {materialFilter === 'without' && (
              <span className="text-xs text-slate-500">
                {hasDeadline ? <>Gấp nhất lên đầu · <span className="font-semibold text-red-600">đỏ</span> = quá hạn</> : 'Không có ngày kế hoạch'}
              </span>
            )}
          </div>

          {filteredRows.length > 0 ? (
            <div className="min-h-0 flex-1 overflow-hidden px-5 pb-4">
              <div className={`${bang.khung} h-full`}>
                <table style={tableStyle} className={bang.table}>
                  <ColGroup />
                  <thead className={bang.thead}>
                    <tr>
                      <th
                        onClick={() => toggleSort('stt')}
                        rowSpan={hasVuongMacCol ? 2 : 1}
                        style={fzStyle(frozen.get('stt'))}
                        className={`${fzClass(frozen.get('stt'))} ${headerCellClass} bg-emerald-300 text-center`}
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
                        className={`${fzClass(frozen.get('hex'))} ${headerCellClass} min-w-[140px] bg-emerald-300 text-left`}
                      >
                        <span className="inline-flex items-center gap-1">
                          Mã Hex
                          <SortIcon active={sort?.key === 'hex'} dir={sort?.dir} />
                        </span>
                      </th>
                      {orderedCols.map((key) => {
                        if (key === 'vuongMac') {
                          return (
                            <th key="vuongMac-group" colSpan={FIVE_M_ORDER.length} className={bang.thC}>
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
                            rowSpan={hasVuongMacCol ? 2 : 1}
                          >
                            {meta.label}
                          </SortableHeader>,
                          frozen.get(key),
                          '!bg-emerald-300'
                        );
                      })}
                    </tr>
                    {hasVuongMacCol && (
                      <tr>
                        {FIVE_M_ORDER.map((cat) => (
                          <th
                            key={cat}
                            onClick={() => toggleSort(CATEGORY_SORT_KEY[cat])}
                            title={`${FIVE_M_VI[cat]} (${FIVE_M_SHORT[cat]})`}
                            className={`${headerCellClass} text-center`}
                          >
                            <span className="inline-flex flex-col items-center justify-center gap-0.5 text-xs leading-tight">
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
                  <tbody>
                    {sortedRows.map((entry) => {
                      const row = entry.row;
                      const s = soHex(row, khoaSo);
                      return (
                        <tr key={entry.stt} className={`group transition-colors hover:bg-slate-50 ${s.huy ? 'text-slate-400' : ''}`}>
                          <td
                            style={fzStyle(frozen.get('stt'))}
                            className={`${fzClass(frozen.get('stt'))} ${bang.tdSo} bg-white text-slate-500 group-hover:bg-slate-50`}
                          >
                            {entry.stt}
                          </td>
                          <td
                            style={fzStyle(frozen.get('hex'))}
                            className={`${fzClass(frozen.get('hex'))} ${bang.tdB} bg-white text-left group-hover:bg-slate-50`}
                          >
                            {row[hexKey] && materialCountByHex && !materialCountByHex[String(row[hexKey])] ? (
                              String(row[hexKey])
                            ) : row[hexKey] ? (
                              <button
                                type="button"
                                onClick={() => setMaterialView({
                                  hexes: [String(row[hexKey])],
                                  title: `Hex ${String(row[hexKey])}`,
                                  mode: 'matched',
                                })}
                                title="Bấm để xem vật tư của hex này"
                                className="text-left text-amber-700 hover:underline"
                              >
                                {String(row[hexKey])}
                                {materialCountByHex?.[String(row[hexKey])] ? (
                                  <span className="ml-1 rounded bg-amber-50 px-1 text-[0.625rem] font-semibold text-amber-600">
                                    {materialCountByHex[String(row[hexKey])]} VT
                                  </span>
                                ) : null}
                              </button>
                            ) : '—'}
                            {s.huy && <span className="ml-1 rounded bg-red-50 px-1 text-[0.625rem] font-semibold text-red-700">HỦY</span>}
                            {row[hexKey] && xuongTomTat[String(row[hexKey])] && (() => {
                              const t = xuongTomTat[String(row[hexKey])];
                              const o = t.dangO[0];
                              return (
                                <button type="button" onClick={() => setXuongHex(String(row[hexKey]))}
                                  title="Xem tiến độ ở xưởng: công đoạn, số lượng, giờ công"
                                  className="mt-0.5 block text-left text-[0.6875rem] font-normal text-emerald-700 hover:underline">
                                  {o ? `Xưởng: ${o.ten ?? ''}${t.dangO.length > 1 ? ` +${t.dangO.length - 1}` : ''}` : 'Xưởng: xong'}
                                </button>
                              );
                            })()}
                            {materialFilter === 'without' && hasDeadline && (() => {
                              const info = deadlineInfo(row);
                              const d = info?.date;
                              if (!d || !info?.source) return <div className="mt-0.5 text-[0.625rem] font-normal text-slate-400">Chưa có hạn</div>;
                              const late = d.getTime() < todayStart;
                              return (
                                <div
                                  title={`${DEADLINE_SOURCE_LABEL[info.source]}${late ? ' — đã quá hạn' : ''}`}
                                  className={`mt-0.5 whitespace-nowrap text-[0.625rem] ${late ? 'font-semibold text-red-600' : 'font-normal text-slate-500'}`}
                                >
                                  Hạn: {fmtDate(d)}
                                  <span className="ml-1 font-normal text-slate-400">({info.source})</span>
                                </div>
                              );
                            })()}
                          </td>
                          {orderedCols.map((key) =>
                            applyFrozen(
                              renderCell(row, key, s),
                              frozen.get(key),
                              '!bg-white group-hover:!bg-slate-50'
                            )
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className={bang.tfoot}>
                    <tr>
                      <td
                        colSpan={2}
                        style={frozen.has('stt') ? { left: 0 } : undefined}
                        className={`${bang.tdSo} ${frozen.has('stt') ? '!z-[12]' : ''}`}
                      >
                        TỔNG ({fmtInt(totals.n)} hex)
                      </td>
                      {orderedCols.map((key) => {
                        if (key === 'vuongMac') return <td key={key} className={bang.tdB} colSpan={FIVE_M_ORDER.length} />;
                        if (key === 'congTrinh' && !showProjectColumn) return null;
                        const cotSo = COT_SO[key];
                        const v = cotSo ? totals[cotSo] : key === 'giaTriKy' ? tongKy : 0;
                        return applyFrozen(
                          <td key={key} className={bang.tdSo}>{money(v)}</td>,
                          frozen.get(key),
                          '!z-[12]'
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto px-5">
              <div className="rounded-lg bg-slate-50 p-8 text-center text-slate-500">
                {materialFilter === 'with' && hexWithMaterialCount === 0
                  ? 'Không có hex nào map được vật tư theo mã nhà máy — chọn "Tất cả" để xem đủ danh sách.'
                  : materialFilter === 'without'
                    ? 'Mọi hex đều đã tìm thấy vật tư.'
                    : 'Không có dữ liệu hex phù hợp để hiển thị.'}
              </div>
            </div>
          )}
        </div>
      </ModalShell>

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

      {xuongHex && (
        <ModalShell
          open
          onClose={() => setXuongHex(null)}
          label={`Xưởng — hex ${xuongHex}`}
          closeOnBackdrop
          overlayClassName="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-900/50 p-4"
          panelClassName="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-slate-50 shadow-xl focus:outline-none"
        >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
              <div className="min-w-0">
                <p className="text-base font-bold text-slate-800">Xưởng — hex <span className="tabular-nums">{xuongHex}</span></p>
                <p className="truncate text-xs text-slate-500">{hangMucByHex?.[xuongHex] ?? ''}{congTrinhByHex?.[xuongHex] ? ` · ${congTrinhByHex[xuongHex]}` : ''}</p>
              </div>
              <button type="button" onClick={() => setXuongHex(null)} aria-label="Đóng" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4"><XuongHexChiTiet hex={xuongHex} /></div>
        </ModalShell>
      )}

      <HexMaterialModal
        isOpen={materialView !== null}
        onClose={() => setMaterialView(null)}
        title={materialView?.title ?? ''}
        hexes={materialView?.hexes ?? []}
        mode={materialView?.mode ?? 'matched'}
        hangMucByHex={hangMucByHex}
        congTrinhByHex={congTrinhByHex}
      />

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