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
// ✅ MỚI: Vướng Mắc 5M — VẪN LÀ 1 CỘT DUY NHẤT "Vướng Mắc (5M)" (tô đỏ, ẩn/hiện
// 1 lần qua Setup cột), nhưng bên trong tách header 2 tầng: tầng trên là tiêu
// đề nhóm màu đỏ span ngang 5 cột con, tầng dưới là 5 cột con M1..M5 (Man/
// Machine/Material/Method/Measurement) — mỗi cột con vẫn sort/click riêng
// theo đúng loại, mở popup CRUD + log khóa cứng đúng loại đó.
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

// ✅ MỚI: thứ tự cố định M1..M5 + nhãn ngắn — dùng cho header con, setup cột,
// export CSV, và khóa loại khi mở popup CRUD.
const FIVE_M_ORDER: FiveMCategory[] = ['man', 'machine', 'material', 'method', 'measurement'];
const FIVE_M_SHORT: Record<FiveMCategory, string> = {
  man: 'M1',
  machine: 'M2',
  material: 'M3',
  method: 'M4',
  measurement: 'M5',
};
// ✅ MỚI: nhãn THUẦN TIẾNG VIỆT cho từng loại 5M — dùng riêng cho header cột
// con, tooltip và export CSV trong file này (không dùng nhãn có kèm tiếng
// Anh từ service để tránh hiển thị lẫn "Man (Con người)").
const FIVE_M_VI: Record<FiveMCategory, string> = {
  man: 'Con Người',
  machine: 'Máy Móc',
  material: 'Nguyên Vật Liệu',
  method: 'Phương Pháp',
  measurement: 'Đo Lường',
};
// sort key riêng cho từng cột con bên trong nhóm "Vướng Mắc"
const CATEGORY_SORT_KEY: Record<FiveMCategory, SortKey> = {
  man: 'vmMan',
  machine: 'vmMachine',
  material: 'vmMaterial',
  method: 'vmMethod',
  measurement: 'vmMeasurement',
};

// ✅ MỚI: màu chữ theo loại 5M — dùng cho nội dung xem trước hiển thị trong
// từng cột con, để phân biệt nhanh loại vướng mắc bằng màu sắc.
const VUONG_MAC_TEXT_STYLE: Record<FiveMCategory, string> = {
  man: 'text-blue-700',
  machine: 'text-purple-700',
  material: 'text-amber-700',
  method: 'text-teal-700',
  measurement: 'text-pink-700',
};

// Chiều rộng 1 cột con M — nhân 5 ra tổng chiều rộng của cả nhóm "Vướng Mắc".
// Tăng từ 76 lên 108 để đủ chỗ hiển thị tên đầy đủ "Con Người (M1)" thay vì chỉ "M1".
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
  // ✅ MỚI: 1 cột gộp "Vướng Mắc (5M)" — chiều rộng = tổng 5 cột con bên trong
  vuongMac: VM_SUB_WIDTH * 5,
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
  // ✅ MỚI: 5 khóa sort riêng cho 5 cột con bên trong nhóm "Vướng Mắc"
  | 'vmMan'
  | 'vmMachine'
  | 'vmMaterial'
  | 'vmMethod'
  | 'vmMeasurement';
type SortDir = 'asc' | 'desc';

// Các cột "phụ" — có thể ẩn/hiện và SẮP XẾP LẠI THỨ TỰ qua Setup cột (Admin),
// đồng bộ cơ chế với ExportDetailModal / InventoryDetailModal.
// ✅ "vuongMac" vẫn là 1 khóa DUY NHẤT (ẩn/hiện cả nhóm 1 lần); 5 cột con
// M1..M5 chỉ là chi tiết hiển thị BÊN TRONG vị trí của khóa này, không phải
// 5 khóa cột riêng.
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
  // ✅ MỚI: chỉ dùng để thỏa mãn kiểu dữ liệu — header thật của "vuongMac"
  // được render đặc biệt (2 tầng: nhãn nhóm + 5 cột con), không đi qua
  // SortableHeader thông thường như các cột khác.
  vuongMac: { label: 'Vướng Mắc (5M)', sortKey: 'vmMan' },
};

// Kiểu dòng TỔNG CỘNG cho từng cột phụ: 'label' gộp vào ô nhãn "TỔNG CỘNG",
// 'total' có tổng số liệu, 'blank' chỉ là ô trống (text/ghi chú không có tổng).
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
}: HexDetailModalProps) => {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const footerScrollRef = useRef<HTMLDivElement>(null);

  const [scrollbarWidth, setScrollbarWidth] = useState(0);

  // 🔧 FIX (vệt đỏ lạc chỗ khi chưa cuộn tới nhóm Vướng Mắc): 2 ô đệm màu ở
  // đầu/cuối phần header (đệm trái, đệm phải, ô bù trừ scrollbar) nằm NGOÀI
  // vùng overflow-x-hidden nên không tự cuộn theo bảng. Trước đây chúng được
  // tô đỏ chỉ dựa vào "cột cuối cùng có phải Vướng Mắc không" (lastColIsVuongMac),
  // nên vệt đỏ bám cứng ở rìa phải NGAY CẢ KHI người dùng chưa cuộn tới đó —
  // trông như 1 cột khác (vd "Ghi Chú Xuất Kho") bị tô đỏ nhầm. Cần biết thêm
  // bảng đã thực sự cuộn hết sang phải hay chưa trước khi đổi màu ô đệm.
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

  // Ghi chú không nằm trong /api/all-data (quá nặng) nên tải riêng theo danh sách hex.
  // notesMap: bản xem trước (đã cắt 100 ký tự) cho toàn bộ danh sách hex đang xem.
  const [notesMap, setNotesMap] = useState<NotesResponse>({});

  // ✅ MỚI: bản đồ hex -> danh sách vướng mắc 5M (mọi loại, chưa lọc trạng
  // thái/loại) — dùng chung cho cả nhóm cột "Vướng Mắc", lọc theo category
  // khi hiển thị từng cột con M1..M5.
  const [vuongMacMap, setVuongMacMap] = useState<Record<string, VuongMacItem[]>>({});

  // ✅ MỚI: hex + loại 5M đang mở popup CRUD + log vướng mắc (khóa cứng theo
  // đúng cột con M vừa bấm)
const [vuongMacDetail, setVuongMacDetail] = useState<{
  open: boolean;
  hex: string;
  label: string;
  category: FiveMCategory;
  categoryLabel: string; // ✅ MỚI: nhãn chuẩn "Con Người (M1)" theo đúng ô vừa bấm
}>({ open: false, hex: '', label: '', category: 'man', categoryLabel: '' });

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

  // ✅ MỚI: tải danh sách vướng mắc 5M cho toàn bộ hex đang hiển thị. Tải lại
  // mỗi khi hexList đổi (kể cả sau khi popup con đóng lại), để badge trong
  // bảng luôn khớp với dữ liệu vừa thêm/sửa/xóa.
  useEffect(() => {
    if (!isOpen || hexList.length === 0) {
      setVuongMacMap({});
      return;
    }
    fetchVuongMacList(hexList).then(setVuongMacMap);
  }, [isOpen, hexList, vuongMacDetail.open]);

  // Escape: chỉ đóng modal chính. Popup nội dung ghi chú CHỈ đóng bằng nút X.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedNote) return;
      if (vuongMacDetail.open) return; // ✅ MỚI: không đóng modal chính khi popup vướng mắc đang mở
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

    // 🔧 FIX: chỉ coi là "đã cuộn tới cuối" khi khoảng cách còn lại gần 0
    // (chừa 1px sai số làm tròn của trình duyệt).
    if (el) {
      const atEnd = left + el.clientWidth >= el.scrollWidth - 1;
      setScrolledToEnd(atEnd);
    }
  }, []);

  // 🔧 FIX: đo lại trạng thái cuộn mỗi khi mở modal / đổi dữ liệu / đổi cấu
  // hình cột — vì scrollWidth có thể đổi (thêm/bớt cột, đổi dữ liệu), nên
  // trạng thái "đã cuộn hết" tính từ lần trước có thể không còn đúng.
  useEffect(() => {
    if (!isOpen) return;
    handleBodyScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, rows, search, handleBodyScroll]);

  const getNotePreview = useCallback(
    (row: DataRow, key: string): string => String(notesMap[String(row[hexKey] || '')]?.[key] ?? ''),
    [notesMap, hexKey]
  );

  // ✅ MỚI: danh sách vướng mắc CHƯA xử lý của 1 hex, lọc theo ĐÚNG 1 loại 5M
  // — dùng để hiển thị badge của từng cột con M1..M5 và để sort theo số lượng.
  const getOpenVuongMacByCategory = useCallback(
    (row: DataRow, category: FiveMCategory): VuongMacItem[] => {
      const hex = String(row[hexKey] || '');
      return (vuongMacMap[hex] || []).filter(v => !v.isResolved && v.category === category);
    },
    [vuongMacMap, hexKey]
  );

  // ✅ MỚI: mục vướng mắc CHƯA xử lý được cập nhật/tạo GẦN NHẤT của 1 hex,
  // đúng 1 loại 5M — dùng để hiển thị nội dung xem trước trong ô cột con
  // (thay vì chỉ hiện số lượng).
  const getLatestOpenVuongMac = useCallback(
    (row: DataRow, category: FiveMCategory): VuongMacItem | null => {
      const list = getOpenVuongMacByCategory(row, category);
      if (list.length === 0) return null;
      return [...list].sort((a, b) => {
        const ta = new Date(a.updatedAt || a.createdAt).getTime();
        const tb = new Date(b.updatedAt || b.createdAt).getTime();
        return tb - ta;
      })[0];
    },
    [getOpenVuongMacByCategory]
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

  // ✅ MỚI: bấm vào 1 cột con "M1..M5" bên trong nhóm "Vướng Mắc" -> mở popup
  // CRUD + log, khóa cứng đúng hex + đúng loại 5M của cột con vừa bấm.
const openVuongMacCell = useCallback((row: DataRow, category: FiveMCategory, e: React.MouseEvent) => {
  e.stopPropagation();
  const hex = String(row[hexKey] || '');
  if (!hex) return;
  setVuongMacDetail({
    open: true,
    hex,
    label: String(row[hangMucKey] || ''),
    category,
    categoryLabel: `${FIVE_M_VI[category]} (${FIVE_M_SHORT[category]})`, // ví dụ: "Con Người (M1)"
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

  // ==== Setup cột hiển thị (chỉ Admin) — đồng bộ cơ chế với Xuất kho/Nhập kho ====
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
    // ✅ MỚI: 1 khóa DUY NHẤT — ẩn/hiện cả nhóm 5 cột con M1..M5 cùng lúc
    { key: 'vuongMac', label: 'Vướng Mắc (5M)' },
  ], [showProjectColumn]);

  const visibleCols = useMemo(
    () => resolveVisibleModalColumns('modal_hex_detail', OPTIONAL_COLUMNS),
    [OPTIONAL_COLUMNS, cfgVersion]
  );

  // ✅ Thứ tự cột thực tế cần render — lấy trực tiếp từ visibleCols (đã được
  // resolveVisibleModalColumns sắp xếp đúng theo cấu hình Admin đã lưu/kéo-thả).
  const orderedCols = useMemo(
    () => visibleCols.map(c => c.key) as OptionalColKey[],
    [visibleCols]
  );

  // ✅ MỚI: có đang hiển thị nhóm "Vướng Mắc" hay không — quyết định có cần
  // thêm hàng header thứ 2 (5 cột con M1..M5) hay không.
  const hasVuongMacCol = orderedCols.includes('vuongMac');

  // 🔧 FIX (mảng xanh chỗ scrollbar-placeholder): cần biết cột CUỐI CÙNG đang
  // hiển thị có phải "vuongMac" hay không, để tô đúng màu đỏ cho ô bù trừ
  // scrollbar ở header — thay vì luôn ăn theo nền emerald mặc định của
  // container ngoài, gây lộ 1 vệt xanh ngay sau vùng đỏ của nhóm 5M.
  // Lưu ý: bản thân biến này không còn quyết định màu một mình — phải kết
  // hợp với scrolledToEnd (xem 2 chỗ dùng bên dưới) để tránh tô nhầm khi
  // chưa cuộn tới nơi.
  const lastColIsVuongMac = orderedCols[orderedCols.length - 1] === 'vuongMac';

  // 🔧 FIX: điều kiện tô đỏ thực tế cho 2 ô đệm — chỉ đỏ khi cột cuối là
  // Vướng Mắc VÀ người dùng đã cuộn ngang tới hết bên phải.
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
        // ✅ MỚI: sort theo số lượng vướng mắc CHƯA xử lý của đúng cột con M
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
    // ✅ MỚI: CSV không có khái niệm "gộp cột" nên vẫn tách 1 cột riêng cho
    // từng loại M1..M5 để không mất dữ liệu chi tiết khi xuất.
    ...FIVE_M_ORDER.map((cat) => `Vướng Mắc ${FIVE_M_SHORT[cat]} (${FIVE_M_VI[cat]})`),
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

    // ✅ MỚI: gộp vướng mắc CỦA ĐÚNG 1 LOẠI thành 1 dòng text cho CSV — mỗi
    // mục 1 đoạn "nội dung(Đã xử lý nếu có)", các mục cách nhau bằng " | ".
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
      // ✅ MỚI
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

  const pct = (px: number) => `${((px / totalMinWidth) * 100).toFixed(4)}%`;

  // ✅ Colgroup lặp theo orderedCols. Với khóa "vuongMac", 1 vị trí trong
  // orderedCols cần render thành 5 <col> vật lý (5 cột con M1..M5) thay vì 1.
  const ColGroup = () => (
    <colgroup>
      <col style={{ width: pct(COL_WIDTHS.stt) }} />
      <col style={{ width: pct(COL_WIDTHS.hex) }} />
      {orderedCols.map((key) => {
        if (key === 'vuongMac') {
          return FIVE_M_ORDER.map((cat) => (
            <col key={`vm-${cat}`} style={{ width: pct(VM_SUB_WIDTH) }} />
          ));
        }
        return <col key={key} style={{ width: pct(COL_WIDTHS[key]) }} />;
      })}
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
    isLast = false,
    rowSpan = 1,
  }: {
    sortKey: SortKey;
    align?: 'left' | 'right';
    children: React.ReactNode;
    className?: string;
    isLast?: boolean;
    rowSpan?: number;
  }) => (
    <th
      onClick={() => toggleSort(sortKey)}
      rowSpan={rowSpan}
      className={`${isLast ? headerCellClass.replace('border-r ', '') : headerCellClass} ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
    >
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
        className="cursor-pointer px-3 py-2.5 text-left align-top text-slate-600 break-words whitespace-normal transition-colors group-hover:bg-slate-50 hover:!bg-emerald-50"
      >
        {truncateText(preview) || '—'}
      </td>
    );
  };

  // ✅ MỚI: 1 ô của 1 cột con M (đã khóa cứng đúng 1 loại) — hiện NỘI DUNG
  // vướng mắc CHƯA xử lý được cập nhật gần nhất (thay vì chỉ hiện số lượng),
  // giống cách các ô ghi chú khác đang hiển thị; nếu còn nhiều hơn 1 mục thì
  // ghi thêm "+N khác" bên dưới. Bấm vào ô để mở popup xem đầy đủ/thêm/sửa/xóa
  // + log đúng loại này.
  const VuongMacCatCell = ({ row, category }: { row: DataRow; category: FiveMCategory }) => {
    const openList = getOpenVuongMacByCategory(row, category);
    const latest = getLatestOpenVuongMac(row, category);
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
            <span className={`block break-words text-[11px] font-medium ${VUONG_MAC_TEXT_STYLE[category]}`}>
              {truncateText(latest.content, 40)}
            </span>
            {openList.length > 1 && (
              <span className="text-[10px] text-red-400">+{openList.length - 1} khác</span>
            )}
          </div>
        )}
      </td>
    );
  };

  // ✅ Render 1 ô "phụ" theo key — vị trí trong hàng do orderedCols.map quyết
  // định, không hardcode theo vị trí cố định như trước. Riêng "vuongMac" trả
  // về MẢNG 5 <td> (5 cột con M1..M5) thay vì 1 <td> duy nhất.
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

      // ✅ MỚI: 1 vị trí -> 5 <td> (5 cột con M1..M5), luôn theo đúng
      // FIVE_M_ORDER để khớp với 5 <col> trong ColGroup và 5 header con.
      case 'vuongMac':
        return FIVE_M_ORDER.map((cat) => (
          <VuongMacCatCell key={cat} row={row} category={cat} />
        ));

      default:
        return null;
    }
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
                  {/* 🔧 FIX (rìa xanh/đỏ không khớp): trước đây toàn bộ đệm trái +
                      phải của header dùng CHUNG 1 lớp bg-emerald-50 px-5 trên div
                      ngoài cùng, nên rìa phải LUÔN xanh dù cột cuối cùng là nhóm
                      "Vướng Mắc (5M)" nền đỏ. Giờ tách riêng đệm trái (luôn xanh,
                      vì cột đầu luôn là cột thường) và đệm phải (đổi màu theo
                      showRedEdge, tức là VỪA cột cuối là vuongMac VỪA đã cuộn
                      hết sang phải) thành 2 div độc lập. */}
                  <div className="w-5 shrink-0 bg-emerald-50" />
                  <div ref={headerScrollRef} className="min-w-0 flex-1 overflow-x-hidden">
                    <table style={tableStyle} className="border-separate border-spacing-0 text-xs">
                      <ColGroup />
                      <thead className="font-bold uppercase tracking-tight text-slate-800">
                        <tr>
                          <th
                            onClick={() => toggleSort('stt')}
                            rowSpan={hasVuongMacCol ? 2 : 1}
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
                            rowSpan={hasVuongMacCol ? 2 : 1}
                            style={{ left: COL_WIDTHS.stt }}
                            className="sticky z-10 min-w-[140px] cursor-pointer select-none border-b border-r border-emerald-200 bg-emerald-50 px-3 py-3 text-left transition-colors hover:bg-emerald-100"
                          >
                            <span className="inline-flex items-center gap-1">
                              Mã Hex
                              <SortIcon active={sort?.key === 'hex'} dir={sort?.dir} />
                            </span>
                          </th>
                          {/* ✅ Header tầng 1 lặp theo orderedCols (đúng thứ tự đã setup).
                              Cột thường: <th rowSpan=2> khi có nhóm Vướng Mắc, để chừa
                              chỗ cho hàng header thứ 2 bên dưới. Riêng "vuongMac": 1 ô
                              nhãn nhóm màu đỏ, colSpan=5, KHÔNG rowSpan (hàng dưới là 5
                              cột con của chính nó). */}
                          {orderedCols.map((key, i) => {
                            const isLast = i === orderedCols.length - 1;
                            if (key === 'vuongMac') {
                              // ✅ SỬA LỖI GIAO DIỆN: trước đây kế thừa headerCellClass
                              // (có border-emerald-200) rồi mới thêm bg-red-50 đè lên —
                              // nền đỏ thắng nhưng viền dưới VẪN LÀ XANH do 2 class border
                              // màu khác nhau cùng áp cho border-b (đè nhau không chắc
                              // ăn). Viết riêng 1 class cho ô nhóm này, dùng ĐÚNG tông đỏ
                              // cho mọi viền (border-b/border-r), không còn lẫn màu xanh.
                              return (
                                <th
                                  key="vuongMac-group"
                                  colSpan={5}
                                  className={`cursor-default select-none border-b border-red-200 bg-red-50 px-3 py-3 text-center text-red-700 ${
                                    isLast ? '' : 'border-r border-red-200'
                                  }`}
                                >
                                  Vướng Mắc (5M)
                                </th>
                              );
                            }
                            const meta = COLUMN_META[key];
                            return (
                              <SortableHeader
                                key={key}
                                sortKey={meta.sortKey}
                                align={meta.align}
                                isLast={isLast}
                                rowSpan={hasVuongMacCol ? 2 : 1}
                              >
                                {meta.label}
                              </SortableHeader>
                            );
                          })}
                        </tr>
                        {/* ✅ Header tầng 2 — CHỈ xuất hiện khi nhóm "Vướng Mắc" đang
                            hiển thị. Nhờ các <th rowSpan=2> ở tầng 1 đã chiếm sẵn chỗ,
                            trình duyệt tự xếp 5 ô này đúng vào vị trí bên dưới nhãn
                            nhóm, bất kể "vuongMac" nằm ở vị trí nào trong orderedCols. */}
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
                  {/* Đệm phải: cùng nguyên lý như đệm trái ở trên, nhưng đổi màu
                      theo showRedEdge — đỏ CHỈ KHI cột cuối cùng đang hiển thị là
                      nhóm "Vướng Mắc (5M)" VÀ bảng đã thực sự cuộn tới hết bên
                      phải; xanh cho mọi trường hợp còn lại (kể cả khi Vướng Mắc
                      là cột cuối nhưng chưa cuộn tới đó). */}
                  <div className={`w-5 shrink-0 ${showRedEdge ? 'bg-red-50' : 'bg-emerald-50'}`} />
                  {/* Ô bù trừ scrollbar: cũng đổi màu theo cùng logic showRedEdge,
                      để không còn lộ vệt đỏ/xanh sai chỗ khi cuộn ngang. */}
                  {scrollbarWidth > 0 && (
                    <div
                      style={{ width: scrollbarWidth }}
                      className={`shrink-0 ${showRedEdge ? 'bg-red-50' : 'bg-emerald-50'}`}
                    />
                  )}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden px-5">
                {/* 🔧 FIX (hở khe lộ dữ liệu khi cuộn ngang): trước đây px-5 nằm
                    TRỰC TIẾP trên chính div overflow-auto (bodyScrollRef) — div này
                    vừa là khung cuộn ngang/dọc thật sự, vừa là "scrollport" mà các ô
                    sticky (STT, Mã Hex) dùng làm mốc tính vị trí. Khi scrollport có
                    padding, trình duyệt neo ô sticky vào MÉP PADDING (lùi vào trong
                    20px) chứ không phải mép ngoài cùng của khung nhìn — để lại 1 khe
                    hở 20px cố định, và nội dung đã cuộn qua vẫn lộ ra qua khe đó.
                    Sửa bằng cách tách 2 lớp: lớp NGOÀI (div này) chỉ tạo khoảng đệm
                    20px, KHÔNG cuộn nên không phải là scrollport của sticky; lớp
                    TRONG (bodyScrollRef ngay dưới) mới thực sự cuộn và KHÔNG còn
                    padding — sticky lúc này neo đúng sát mép, hết khe hở. */}
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
                          // 🔧 FIX: thêm "group" để 2 ô sticky (STT, Mã Hex) bên dưới có
                          // thể bám theo trạng thái hover của CẢ DÒNG qua group-hover,
                          // thay vì đứng yên bg-white trong khi các ô còn lại đổi sang
                          // slate-50 — trước đây gây cảm giác 2 cột "nổi" tách rời dòng.
                          <tr key={entry.stt} className="group transition-colors hover:bg-slate-50">
                            <td
                              style={{ left: 0 }}
                              className="sticky z-10 border-r border-slate-100 bg-white group-hover:bg-slate-50 px-2 py-2.5 text-center align-top font-semibold text-slate-500"
                            >
                              {entry.stt}
                            </td>
                            <td
                              style={{ left: COL_WIDTHS.stt }}
                              className="sticky z-10 border-r border-slate-100 bg-white group-hover:bg-slate-50 px-3 py-2.5 text-left align-top font-medium text-slate-700"
                            >
                              {String(row[hexKey] || '—')}
                            </td>
                            {/* ✅ Body lặp theo orderedCols, đúng thứ tự + tập cột đang
                                được cấu hình hiển thị. "vuongMac" tự nở ra 5 <td>. */}
                            {orderedCols.map((key) => renderCell(row, key))}
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
                            // ✅ Footer duyệt theo orderedCols: gộp colSpan cho mọi cột
                            // "label" (congTrinh/hangMuc/xuong/bop/tinhTrang) vào ô nhãn
                            // "TỔNG CỘNG", in tổng cho 3 cột số liệu (triGia/thanhTienPhieu/
                            // thanhTienKho) và để trống cho các cột "blank" (phanLoai +
                            // 5 cột ghi chú). Riêng "vuongMac": 1 ô trống colSpan=5 để
                            // khớp với 5 cột con bên trên.
                            const cells: React.ReactNode[] = [];
                            let pendingSpan = 2; // STT + Mã Hex luôn có mặt
                            let labelRendered = false;

                            const flushLabel = () => {
                              cells.push(
                                <td
                                  key="label"
                                  className="sticky left-0 z-10 bg-emerald-100 px-3 py-3 text-left"
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
                                  <td
                                    key={key}
                                    className={`px-3 py-3 text-right ${key === 'thanhTienKho' ? 'text-indigo-800' : ''}`}
                                  >
                                    {money(value)}
                                  </td>
                                );
                                } else if (key === 'vuongMac') {
                                  cells.push(<td key={key} className="px-3 py-3" colSpan={5} />);
                                } else {
                                  cells.push(<td key={key} className="px-3 py-3" />);
                              }
                            });

                            // Trường hợp không có cột số liệu/blank nào được hiển thị
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

      {/* ✅ MỚI: Popup CRUD + log Vướng Mắc — khóa cứng đúng hex + đúng loại
          5M của cột con vừa bấm. */}
          <VuongMacDetailModal
        isOpen={vuongMacDetail.open}
        onClose={() => setVuongMacDetail(prev => ({ ...prev, open: false }))}
        hex={vuongMacDetail.hex}
        hexLabel={vuongMacDetail.label}
        category={vuongMacDetail.category}
        categoryLabel={vuongMacDetail.categoryLabel} // ✅ MỚI
      />
    </>,
    document.body
  );
};