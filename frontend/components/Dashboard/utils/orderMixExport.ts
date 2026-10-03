import { ColumnDefinition, DataRow, TARGET_COLUMN_NAMES } from '../../../types';
import { findColumnKey } from './columnKeyResolver';
import { parseNumber } from './numberParsers';

// ============================================================================
// Xuất Excel cho thẻ "Cơ cấu đơn hàng" (Tổng quan, Luồng đỏ, Căn mẫu, Báo cáo tiến độ công trình).
// File gồm: Tóm tắt | Theo khu vực | Theo khách hàng | Theo nhóm SP | Danh sách hạng mục.
// Giá trị gốc là TRIỆU ĐỒNG => Tỷ = / 1,000.
// ============================================================================

export interface MixExportRec {
  /** Khoá đếm công trình (mã -> tên chuẩn) */
  ctKey: string;
  kv: string;
  kh: string;
  pl: string;
  /** Trị giá (triệu đồng), 0 nếu hủy */
  total: number;
  row: DataRow;
}

export interface MixExportInput {
  fileName: string;
  /** Mô tả phạm vi, vd. "Tất cả" hoặc "MIỀN BẮC · SUN GROUP" */
  scopeLabel: string;
  /** Các dòng đang hiển thị trên từng biểu đồ (mỗi biểu đồ bỏ qua lựa chọn của chính nó) */
  byDim: { kv: MixExportRec[]; kh: MixExportRec[]; pl: MixExportRec[] };
  /** Các dòng khớp mọi lựa chọn — dùng cho Tóm tắt và Danh sách hạng mục */
  scopeRows: MixExportRec[];
  columns: ColumnDefinition[];
}

const TY = 1000;
const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

const groupSheet = (rows: MixExportRec[], dim: 'kv' | 'kh' | 'pl', label: string) => {
  const m = new Map<string, { cts: Set<string>; items: number; total: number }>();
  for (const r of rows) {
    const e = m.get(r[dim]) ?? { cts: new Set<string>(), items: 0, total: 0 };
    e.cts.add(r.ctKey); e.items++; e.total += r.total;
    m.set(r[dim], e);
  }
  const sumItems = rows.length || 1;
  const sumTotal = rows.reduce((s, r) => s + r.total, 0) || 1;
  const list = [...m.entries()].sort((a, b) => b[1].items - a[1].items || b[1].total - a[1].total);
  const data = list.map(([name, e], i) => ({
    STT: i + 1,
    [label]: name,
    'Số công trình': e.cts.size,
    'Số hạng mục': e.items,
    'Tỷ lệ số mục (%)': round((e.items / sumItems) * 100, 1),
    'Giá trị (Tỷ)': round(e.total / TY),
    'Tỷ lệ giá trị (%)': round((e.total / sumTotal) * 100, 1),
  }));
  const allCts = new Set(rows.map(r => r.ctKey));
  data.push({
    STT: '' as unknown as number,
    [label]: 'TỔNG CỘNG',
    'Số công trình': allCts.size,
    'Số hạng mục': rows.length,
    'Tỷ lệ số mục (%)': 100,
    'Giá trị (Tỷ)': round(rows.reduce((s, r) => s + r.total, 0) / TY),
    'Tỷ lệ giá trị (%)': 100,
  });
  return data;
};

export async function exportOrderMixExcel(input: MixExportInput): Promise<void> {
  const XLSX = await import('xlsx');
  const { byDim, scopeRows, columns } = input;
  const wb = XLSX.utils.book_new();

  // --- Tóm tắt ---
  const cts = new Set(scopeRows.map(r => r.ctKey));
  const totalTrieu = scopeRows.reduce((s, r) => s + r.total, 0);
  const summary = [
    ['CƠ CẤU ĐƠN HÀNG'],
    ['Phạm vi', input.scopeLabel],
    ['Xuất lúc', new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })],
    [],
    ['Chỉ số', 'Giá trị'],
    ['Số công trình (theo mã công trình)', cts.size],
    ['Số hạng mục', scopeRows.length],
    ['Tổng giá trị (Tỷ)', round(totalTrieu / TY)],
    [],
    ['Ghi chú', 'Đơn hủy vẫn được đếm hạng mục nhưng không tính giá trị.'],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  wsSummary['!cols'] = [{ wch: 36 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Tóm tắt');

  // --- 3 sheet cơ cấu ---
  const addGroup = (rows: MixExportRec[], dim: 'kv' | 'kh' | 'pl', label: string, sheet: string) => {
    const ws = XLSX.utils.json_to_sheet(groupSheet(rows, dim, label));
    ws['!cols'] = [{ wch: 6 }, { wch: 36 }, { wch: 14 }, { wch: 13 }, { wch: 16 }, { wch: 13 }, { wch: 17 }];
    XLSX.utils.book_append_sheet(wb, ws, sheet);
  };
  addGroup(byDim.kv, 'kv', 'Khu vực', 'Theo khu vực');
  addGroup(byDim.kh, 'kh', 'Khách hàng', 'Theo khách hàng');
  addGroup(byDim.pl, 'pl', 'Nhóm sản phẩm', 'Theo nhóm SP');

  // --- Danh sách hạng mục ---
  const key = (target: string) => findColumnKey(columns, target) || target;
  const k = {
    hex: key(TARGET_COLUMN_NAMES.HEX),
    ma: key(TARGET_COLUMN_NAMES.MA_CONG_TRINH),
    ct: key(TARGET_COLUMN_NAMES.CONG_TRINH),
    hm: key(TARGET_COLUMN_NAMES.TEN_HANG_MUC),
    xuong: key(TARGET_COLUMN_NAMES.XUONG),
    tt: key(TARGET_COLUMN_NAMES.TINH_TRANG),
    ipo: key(TARGET_COLUMN_NAMES.TINH_TRANG_IPO),
    pm: key('ten_pm'),
    pc: key('ten_pc'),
    han: key('ngay_can_giao'),
    triGia: key(TARGET_COLUMN_NAMES.TRI_GIA_DON_HANG_TONG),
    nhapKho: key(TARGET_COLUMN_NAMES.THANH_TIEN_NHAP_KHO),
  };
  const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
  const items = scopeRows.map((r, i) => ({
    STT: i + 1,
    HEX: txt(r.row[k.hex]),
    'Mã công trình': txt(r.row[k.ma]),
    'Tên công trình': txt(r.row[k.ct]),
    'Tên hạng mục': txt(r.row[k.hm]),
    'Khu vực dự án': r.kv,
    'Khách hàng': r.kh,
    'Nhóm sản phẩm': r.pl,
    'Xưởng': txt(r.row[k.xuong]),
    'Tình trạng': txt(r.row[k.tt]),
    'Tình trạng IPO': txt(r.row[k.ipo]),
    PM: txt(r.row[k.pm]),
    PC: txt(r.row[k.pc]),
    'Ngày cần giao': txt(r.row[k.han]),
    'Trị giá đơn hàng (triệu đồng)': round(parseNumber(r.row[k.triGia])),
    'Nhập kho lũy kế (triệu đồng)': round(parseNumber(r.row[k.nhapKho])),
  }));
  const wsItems = XLSX.utils.json_to_sheet(items);
  wsItems['!cols'] = [
    { wch: 6 }, { wch: 12 }, { wch: 16 }, { wch: 40 }, { wch: 40 }, { wch: 16 }, { wch: 22 }, { wch: 20 },
    { wch: 8 }, { wch: 22 }, { wch: 20 }, { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
  ];
  wsItems['!autofilter'] = { ref: `A1:P${items.length + 1}` };
  XLSX.utils.book_append_sheet(wb, wsItems, 'Danh sách hạng mục');

  const safe = input.fileName.replace(/[\\/:*?"<>|\s]+/g, '_');
  XLSX.writeFile(wb, safe.toLowerCase().endsWith('.xlsx') ? safe : `${safe}.xlsx`);
}
