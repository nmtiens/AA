// ============================================================================
// QUY TẮC TÍNH SỐ LIỆU SẢN XUẤT — dùng chung cho MỌI trang (Tổng quan, Luồng đỏ,
// Báo cáo tiến độ, cửa sổ tổng quan công trình...) để các con số luôn khớp nhau.
//
//  • Đơn HỦY (cột Tình trạng IPO chứa "HỦY") không tính vào tổng / đã nhập / còn lại.
//  • Đã nhập kho của 1 hạng mục = min(max(nhập kho lũy kế, 0), trị giá đơn hàng).
//  • Còn lại của 1 hạng mục     = trị giá đơn hàng − đã nhập kho (≥ 0).
//  • Ngày kế hoạch (BOT / quá hạn / biểu đồ theo tháng):
//      KH nhập kho tuần → KH nhập kho tháng → ngày cần giao.
//  • Công trình: gom theo MÃ công trình, hiển thị 1 tên chuẩn (cách viết nhiều dòng nhất).
// ============================================================================
import type { DataRow, ColumnDefinition } from '../types';
import { parseNumber } from '../components/Dashboard/utils/numberParsers';
import { parseVNDate } from '../components/Dashboard/utils/dateHelpers';
import { findColumnKey } from '../components/Dashboard/utils/columnKeyResolver';

export const isCancelledIpo = (ipo: unknown): boolean => String(ipo ?? '').toUpperCase().includes('HỦY');

/** Trị giá tính vào tổng (0 nếu đơn HỦY). Đơn vị giữ nguyên như dữ liệu gốc (triệu đồng). */
export const orderValue = (total: number, cancelled: boolean): number => (cancelled ? 0 : total);

/** Đã nhập kho của 1 hạng mục (không âm, không vượt trị giá). */
export const doneValue = (total: number, nhapKho: number, cancelled = false): number =>
  cancelled ? 0 : Math.min(Math.max(nhapKho, 0), Math.max(total, 0));

/** Còn lại của 1 hạng mục = trị giá − đã nhập kho. */
export const remainValue = (total: number, nhapKho: number, cancelled = false): number =>
  cancelled ? 0 : Math.max(total - Math.max(nhapKho, 0), 0);

/** Các khoá cột dùng để tính trên 1 dòng sản xuất. */
export interface ProductionValueKeys {
  triGiaKey: string;
  nhapKhoKey: string;
  ipoKey: string;
}

export const rowRemain = (row: DataRow, k: ProductionValueKeys): number =>
  remainValue(parseNumber(row[k.triGiaKey]), parseNumber(row[k.nhapKhoKey]), isCancelledIpo(row[k.ipoKey]));

export const rowDone = (row: DataRow, k: ProductionValueKeys): number =>
  doneValue(parseNumber(row[k.triGiaKey]), parseNumber(row[k.nhapKhoKey]), isCancelledIpo(row[k.ipoKey]));

export const rowOrder = (row: DataRow, k: ProductionValueKeys): number =>
  orderValue(parseNumber(row[k.triGiaKey]), isCancelledIpo(row[k.ipoKey]));

export const resolveValueKeys = (columns: ColumnDefinition[]): ProductionValueKeys => ({
  triGiaKey: findColumnKey(columns, 'tri_gia_don_hang_tong') || 'tri_gia_don_hang_tong',
  nhapKhoKey: findColumnKey(columns, 'thanh_tien_nhap_kho_luy_ke') || 'thanh_tien_nhap_kho_luy_ke',
  ipoKey: findColumnKey(columns, 'tinh_trang_ipo') || 'tinh_trang_ipo',
});

// ---------------------------------------------------------------------------
// Ngày kế hoạch
// ---------------------------------------------------------------------------

/** "2026-09-26 00:00:00" / "2026-09-26" / ISO / dd/mm/yyyy -> Date theo giờ địa phương (chỉ phần ngày). */
export const parsePlanDate = (v: unknown): Date | null => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}([ T]|$)/.test(s)) {
    // Chuỗi có múi giờ (vd ISO "…T17:00:00.000Z" của cột date) -> đổi sang giờ địa phương trước
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = parseVNDate(s);
  return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null;
};

export type DeadlineSource = 'tuần' | 'tháng' | 'cần giao';

export interface DeadlineKeys {
  khnkTuanKey: string;
  khnkThangKey: string;
  ngayCanGiaoKey: string;
}

export const resolveDeadlineKeys = (columns: ColumnDefinition[]): DeadlineKeys => ({
  khnkTuanKey: findColumnKey(columns, 'ngay_khnk_tuan') || 'ngay_khnk_tuan',
  khnkThangKey: findColumnKey(columns, 'ngay_khnk_thang') || 'ngay_khnk_thang',
  ngayCanGiaoKey: findColumnKey(columns, 'ngay_can_giao') || 'ngay_can_giao',
});

export interface Deadline {
  date: Date | null;
  source: DeadlineSource | null;
  khnkTuan: Date | null;
  khnkThang: Date | null;
  canGiao: Date | null;
}

/** Ngày kế hoạch của 1 hạng mục: KH tuần → KH tháng → ngày cần giao. */
export const deadlineOf = (row: DataRow, k: DeadlineKeys): Deadline => {
  const khnkTuan = parsePlanDate(row[k.khnkTuanKey]);
  const khnkThang = parsePlanDate(row[k.khnkThangKey]);
  const canGiao = parsePlanDate(row[k.ngayCanGiaoKey]);
  const date = khnkTuan ?? khnkThang ?? canGiao;
  const source: DeadlineSource | null = khnkTuan ? 'tuần' : khnkThang ? 'tháng' : canGiao ? 'cần giao' : null;
  return { date, source, khnkTuan, khnkThang, canGiao };
};

export const DEADLINE_SOURCE_LABEL: Record<DeadlineSource, string> = {
  'tuần': 'KH nhập kho tuần',
  'tháng': 'KH nhập kho tháng',
  'cần giao': 'Ngày cần giao',
};

// ---------------------------------------------------------------------------
// Công trình: mã -> tên chuẩn
// ---------------------------------------------------------------------------

/** So khớp tên không phân biệt hoa/thường, khoảng trắng. */
export const normProjectName = (v: unknown): string => String(v ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

let projectAlias = new Map<string, string>();

/** Tên chuẩn của 1 tên công trình bất kỳ (tên phụ của cùng mã -> tên chuẩn; không biết thì giữ nguyên). */
export const canonicalProjectName = (name: unknown): string => {
  const t = String(name ?? '').trim().replace(/\s+/g, ' ');
  return projectAlias.get(normProjectName(t)) ?? t;
};

/** Khoá so khớp công trình giữa các bảng: tên chuẩn, không phân biệt hoa/thường, khoảng trắng. */
export const projectMatchKey = (name: unknown): string => normProjectName(canonicalProjectName(name));

/**
 * Đổi tên công trình của mọi dòng về 1 tên chuẩn theo mã công trình (cách viết xuất hiện nhiều
 * dòng nhất). Dòng có tên đã chuẩn giữ nguyên object (không tạo lại), nên rẻ khi gọi trên ~51k dòng.
 */
export function canonicalizeProjectNames(rows: DataRow[], columns: ColumnDefinition[]): DataRow[] {
  const maKey = findColumnKey(columns, 'ma_cong_trinh');
  const tenKey = findColumnKey(columns, 'ten_cong_trinh');
  if (!maKey || !tenKey || rows.length === 0) return rows;

  const counts = new Map<string, Map<string, number>>(); // mã -> (tên gọn -> số dòng)
  for (const row of rows) {
    const ma = normProjectName(row[maKey]);
    const ten = String(row[tenKey] ?? '').trim().replace(/\s+/g, ' ');
    if (!ma || !ten) continue;
    let m = counts.get(ma);
    if (!m) { m = new Map(); counts.set(ma, m); }
    m.set(ten, (m.get(ten) ?? 0) + 1);
  }
  const canonical = new Map<string, string>();
  counts.forEach((m, ma) => {
    let best = '', bestN = -1;
    m.forEach((n, ten) => { if (n > bestN || (n === bestN && ten < best)) { best = ten; bestN = n; } });
    canonical.set(ma, best);
  });

  // Bảng tên phụ -> tên chuẩn cho các bảng khác chỉ có TÊN công trình (nhập/xuất kho, danh sách
  // công trình của view...). Tên đang là tên chuẩn của 1 mã khác thì giữ nguyên, không đổi.
  const canonicalNames = new Set([...canonical.values()].map(normProjectName));
  const alias = new Map<string, string>();
  counts.forEach((m, ma) => {
    const best = canonical.get(ma)!;
    m.forEach((_n, ten) => {
      const k = normProjectName(ten);
      if (ten !== best && !canonicalNames.has(k)) alias.set(k, best);
    });
  });
  projectAlias = alias;

  let changed = false;
  const out = rows.map(row => {
    const name = canonical.get(normProjectName(row[maKey]));
    if (!name || row[tenKey] === name) return row;
    changed = true;
    return { ...row, [tenKey]: name };
  });
  return changed ? out : rows;
}

// ---------------------------------------------------------------------------
// Vật tư (bảng vat_tu)
// ---------------------------------------------------------------------------

/**
 * Dòng vật tư còn THIẾU = còn SL chưa về VÀ dòng còn hiệu lực. Dòng "4.HỦY" (SAP Hủy) và
 * "3.ĐÃ NHẬP KHO" (SAP Đóng — đã chốt, phần dư không mua thêm) dù còn SL vẫn không tính là thiếu.
 */
export const isMaterialMissing = (r: { so_luong_con_lai?: unknown; trang_thai?: unknown }): boolean => {
  if (!(Number(r.so_luong_con_lai) > 0)) return false;
  const st = String(r.trang_thai ?? '').toUpperCase();
  return !st.includes('HỦY') && !st.includes('ĐÃ NHẬP KHO');
};
