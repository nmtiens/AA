// ============================================================================
// LÕI TÍNH SỐ "TỔNG QUAN" TỪ BẢNG SẢN XUẤT — hàm thuần (không React, không trình duyệt), dùng chung:
//   - trình duyệt: các hook useDashboardFilters / usePivotTables / useDashboardOptions / ProductionDonutPanel;
//   - máy chủ: /api/tong-quan/san-xuat tính sẵn màn đầu cho người chưa tải bảng sản xuất (backend bundle qua esbuild).
// Thân hàm chuyển nguyên từ các hook cũ — đổi công thức ở đây là đổi cả hai nơi, số luôn khớp.
// ============================================================================
import type { DataRow, ColumnDefinition } from '../../../types';
import { TARGET_COLUMN_NAMES } from '../../../types';
import { STATUS_GROUPS } from '../constants';
import { parseNumber } from '../utils/numberParsers';
import { findColumnKey } from '../utils/columnKeyResolver';
import { toFilterSet, matchesFilter, matchesCategory, categoryOptions, categoryValue, NO_DATA_LABEL } from '../utils/filterMatch';
import {
  isCancelledIpo, isStocked, isQtyComplete, remainValue, dwellBucket, DWELL_KEYS, DWELL_STUCK,
  BOP_STAGE_ORDER, projectMatchKey,
} from '../../../utils/productionMetrics';
import { ON_LINE_STAGES, P002_STAGE } from './stages';
import type { MetricType, BottleneckItem, WorkshopPivotData, ProjectPivotData } from '../types';
import { mucBopTuDong, tinhBangCongTrinhBop, type BangCongTrinhBop, type MucBop } from '../../Construction/core/bopPivot';

// ---------------------------------------------------------------------------
// Cột bảng sản xuất
// ---------------------------------------------------------------------------
export function khoaSanXuat(productionColumns: ColumnDefinition[]) {
  return {
    hexKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.HEX) || 'hex',
    tinhTrangKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.TINH_TRANG) || 'tinh_trang',
    tinhTrangIpoKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.TINH_TRANG_IPO) || 'tinh_trang_ipo',
    valueKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.GIA_TRI_CON_LAI) || 'gia_tri_don_hang_con_lai',
    realValueKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.GIA_TRI_THUC_TE) || 'gia_tri_con_lai',
    congTrinhKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.CONG_TRINH) || 'ten_cong_trinh',
    xuongKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.XUONG) || 'xuong_chinh',
    hangMucKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.TEN_HANG_MUC) || 'ten_hang_muc',
    daysAtCurrentStageKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.SO_NGAY_CD_HIEN_TAI) || 'so_ngay_cd_hien_tai',
    phanLoaiNhomSanPhamKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.PHAN_LOAI_NHOM_SAN_PHAM) || 'phan_loai_nhom_san_pham',
    bopKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.BOP) || 'bop',
    triGiaDonHangTongKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.TRI_GIA_DON_HANG_TONG) || 'tri_gia_don_hang_tong',
    thanhTienTinhPhieuKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.THANH_TIEN_TINH_PHIEU) || 'thanh_tien_tinh_phieu',
    thanhTienNhapKhoKey: findColumnKey(productionColumns, TARGET_COLUMN_NAMES.THANH_TIEN_NHAP_KHO) || 'thanh_tien_nhap_kho_luy_ke',
    khachHangKey: findColumnKey(productionColumns, 'khach_hang') || 'khach_hang',
    khuVucDuAnKey: findColumnKey(productionColumns, 'khu_vuc_du_an') || 'khu_vuc_du_an',
    // Kho lũy kế theo HEX — cùng cột ConstructionOverview đưa vào cửa sổ công trình (phần Kho của bảng BOP)
    xuatKhoKey: findColumnKey(productionColumns, 'thanh_tien_xuat_kho_luy_ke') || 'thanh_tien_xuat_kho_luy_ke',
    tonKhoKey: findColumnKey(productionColumns, 'thanh_tien_ton_kho_hien_tai') || 'thanh_tien_ton_kho_hien_tai',
  };
}
export type KhoaSanXuat = ReturnType<typeof khoaSanXuat>;

// ---------------------------------------------------------------------------
// Bộ lọc tổng
// ---------------------------------------------------------------------------
export interface DashboardFiltersState {
  congTrinh: string[];
  xuong: string[];
  tinhTrang: string[];
  tinhTrangIpo: string[];
  khachHang: string[];
  khuVucDuAn: string[];
  /** Nhóm sản phẩm — lọc theo từng dòng (không quy về công trình), chỉ áp cho dữ liệu sản xuất */
  phanLoai: string[];
}

export const DEFAULT_FILTERS: DashboardFiltersState = {
  congTrinh: [],
  xuong: [],
  tinhTrang: [],
  tinhTrangIpo: ['01. ĐANG SẢN XUẤT'],
  khachHang: [],
  khuVucDuAn: [],
  phanLoai: [],
};

// Khi lọc Khách hàng / Khu vực dự án mà không có công trình nào khớp: mảng công trình rỗng
// nghĩa là "không lọc" nên phải dùng 1 giá trị giả để mọi nơi trả về kết quả rỗng.
export const NO_MATCH_PROJECT = '__KHONG_CO_CONG_TRINH__';

/** Tập công trình thuộc các Khách hàng + Khu vực dự án đã chọn (null = không lọc theo 2 tiêu chí này) */
export function tinhScopedProjects(
  productionData: DataRow[], khachHang: string[], khuVucDuAn: string[],
  congTrinhKey: string | undefined, khachHangKey: string | undefined, khuVucDuAnKey: string | undefined,
): Set<string> | null {
  if (!congTrinhKey) return null;
  if (khachHang.length === 0 && khuVucDuAn.length === 0) return null;
  const khachHangSet = toFilterSet(khachHang);
  const khuVucDuAnSet = toFilterSet(khuVucDuAn);
  const set = new Set<string>();
  for (const row of productionData) {
    const ct = String(row[congTrinhKey] || '').trim();
    if (!ct) continue;
    if (!matchesCategory(khachHangSet, row, khachHangKey)) continue;
    if (!matchesCategory(khuVucDuAnSet, row, khuVucDuAnKey)) continue;
    set.add(ct);
  }
  return set;
}

/** Danh sách công trình thực sự áp dụng = (công trình đã chọn) giao (công trình thuộc khách hàng/khu vực) */
export function tinhEffectiveCongTrinh(scopedProjects: Set<string> | null, congTrinh: string[]): string[] {
  if (!scopedProjects) return congTrinh;
  const list = congTrinh.length > 0 ? congTrinh.filter(ct => scopedProjects.has(ct)) : Array.from(scopedProjects);
  return list.length > 0 ? list : [NO_MATCH_PROJECT];
}

export interface TapLoc {
  congTrinhSet: Set<string> | null; explicitCongTrinhSet: Set<string> | null; xuongSet: Set<string> | null;
  tinhTrangSet: Set<string> | null; tinhTrangIpoSet: Set<string> | null; phanLoaiSet: Set<string> | null;
  rowKhSet: Set<string> | null; rowKvSet: Set<string> | null;
}
export function tapLoc(applied: DashboardFiltersState, effectiveCongTrinh: string[]): TapLoc {
  return {
    congTrinhSet: toFilterSet(effectiveCongTrinh),
    explicitCongTrinhSet: toFilterSet(applied.congTrinh),
    xuongSet: toFilterSet(applied.xuong),
    tinhTrangSet: toFilterSet(applied.tinhTrang),
    tinhTrangIpoSet: toFilterSet(applied.tinhTrangIpo),
    phanLoaiSet: toFilterSet(applied.phanLoai),
    rowKhSet: toFilterSet(applied.khachHang),
    rowKvSet: toFilterSet(applied.khuVucDuAn),
  };
}

// Cột dùng để lọc — trang khác (vd. công trình) có thể không có cột => undefined (matchesFilter: đang lọc mà
// không có cột thì không khớp)
export interface KhoaLoc {
  congTrinhKey?: string; xuongKey?: string; tinhTrangKey?: string; tinhTrangIpoKey?: string;
  khachHangKey?: string; khuVucDuAnKey?: string; phanLoaiKey?: string;
}

/** Dữ liệu sản xuất qua đủ 7 bộ lọc (KH / KV / Nhóm SP lọc theo từng hạng mục) */
export function locFiltered(productionData: DataRow[], t: TapLoc, k: KhoaLoc): DataRow[] {
  const khRowKey = k.khachHangKey ?? 'khach_hang';
  const kvRowKey = k.khuVucDuAnKey ?? 'khu_vuc_du_an';
  return productionData.filter(row =>
    matchesFilter(t.congTrinhSet, row, k.congTrinhKey) &&
    matchesFilter(t.xuongSet, row, k.xuongKey) &&
    matchesFilter(t.tinhTrangSet, row, k.tinhTrangKey) &&
    matchesFilter(t.tinhTrangIpoSet, row, k.tinhTrangIpoKey) &&
    matchesCategory(t.phanLoaiSet, row, k.phanLoaiKey) &&
    matchesCategory(t.rowKhSet, row, khRowKey) &&
    matchesCategory(t.rowKvSet, row, kvRowKey)
  );
}

/** "Cơ cấu đơn hàng": mọi bộ lọc tổng TRỪ Khách hàng / Khu vực dự án / Nhóm SP (biểu đồ tự lọc chéo) */
export function locCrossFilterBase(source: DataRow[], t: TapLoc, k: KhoaLoc): DataRow[] {
  return source.filter(row =>
    matchesFilter(t.explicitCongTrinhSet, row, k.congTrinhKey) &&
    matchesFilter(t.xuongSet, row, k.xuongKey) &&
    matchesFilter(t.tinhTrangSet, row, k.tinhTrangKey) &&
    matchesFilter(t.tinhTrangIpoSet, row, k.tinhTrangIpoKey)
  );
}

/** Phễu "TÌNH TRẠNG ĐƠN HÀNG AATN": mọi bộ lọc TRỪ ô "Tình trạng" (phễu chính là phân bổ theo tình trạng) */
export function locFunnel(productionData: DataRow[], t: TapLoc, k: KhoaLoc): DataRow[] {
  const khRowKey = k.khachHangKey ?? 'khach_hang';
  const kvRowKey = k.khuVucDuAnKey ?? 'khu_vuc_du_an';
  return productionData.filter(row =>
    matchesFilter(t.congTrinhSet, row, k.congTrinhKey) &&
    matchesFilter(t.xuongSet, row, k.xuongKey) &&
    matchesCategory(t.phanLoaiSet, row, k.phanLoaiKey) &&
    matchesCategory(t.rowKhSet, row, khRowKey) &&
    matchesCategory(t.rowKvSet, row, kvRowKey) &&
    matchesFilter(t.tinhTrangIpoSet, row, k.tinhTrangIpoKey)
  );
}

// ---------------------------------------------------------------------------
// Danh sách lựa chọn của bộ lọc (từ bảng sản xuất)
// ---------------------------------------------------------------------------
/** Giá trị thô khác nhau của 1 cột (1 vòng, không tạo mảng trung gian) */
const distinctRaw = (data: DataRow[], key: string): Set<unknown> => {
  const raw = new Set<unknown>();
  for (const row of data) raw.add(row[key]);
  return raw;
};

/** Lấy danh sách giá trị duy nhất (đã trim, bỏ rỗng, sort) của 1 cột trong 1 tập dữ liệu. */
export const getUniqueOptions = (data: DataRow[], key: string | undefined): string[] => {
  if (!key) return [];
  const set = new Set<string>();
  for (const v of distinctRaw(data, key)) {
    const t = String(v || '').trim();
    if (t) set.add(t);
  }
  return Array.from(set).sort();
};

export function luaChonSanXuat(productionData: DataRow[], k: KhoaSanXuat) {
  return {
    congTrinhOptions: getUniqueOptions(productionData, k.congTrinhKey),
    xuongOptions: getUniqueOptions(productionData, k.xuongKey),
    tinhTrangOptions: getUniqueOptions(productionData, k.tinhTrangKey),
    tinhTrangIpoOptions: getUniqueOptions(productionData, k.tinhTrangIpoKey),
    khachHangOptions: categoryOptions(productionData, k.khachHangKey),
    khuVucDuAnOptions: categoryOptions(productionData, k.khuVucDuAnKey),
    phanLoaiOptions: categoryOptions(productionData, k.phanLoaiNhomSanPhamKey),
  };
}

// ---------------------------------------------------------------------------
// Pivot / phễu / thẻ (trước nằm trong usePivotTables)
// ---------------------------------------------------------------------------
export type BottleneckViewMode = 'BOP' | 'TÌNH TRẠNG';
export type ProjectSummaryMetric = 'VALUE' | 'COUNT';

const ON_LINE_STAGE_SET = new Set<string>(ON_LINE_STAGES);

// Bảng "Tình trạng đơn hàng theo Công trình" (v2): phần CÒN LẠI của 1 hạng mục =
// trị giá đơn hàng - đã nhập kho (không âm), xếp vào đúng 1 cột theo công đoạn BOP:
//   P001 (hoặc tình trạng 15. CHƯA TRIỂN KHAI)  -> Chưa triển khai
//   P002                                         -> Chưa tính phiếu
//   GCVT, P012 -> P021                           -> Đang trên chuyền
//   còn lại (P022 / P025 nhưng nhập kho chưa đủ) -> Nhập kho chưa đủ
// => Tổng còn lại = tổng 4 cột = Tổng đơn hàng - Đã nhập kho (đơn HỦY không tính).
export type RemainBucket = 'notDeployed' | 'p002' | 'onLine' | 'shortfall';

export function remainBucketOf(statusUpper: string, stage: string | null): RemainBucket {
  if (statusUpper.includes('15. CHƯA TRIỂN KHAI') || stage === 'P001') return 'notDeployed';
  if (stage === P002_STAGE) return 'p002';
  if (stage && ON_LINE_STAGE_SET.has(stage)) return 'onLine';
  return 'shortfall';
}

// Hạng mục không có tên công trình: gom vào 1 dòng 'Chưa xác định' (giống phễu) để bảng / danh sách HEX
// khớp tổng phễu thay vì bỏ mất các dòng này; dòng này luôn xếp cuối bảng.
export const UNKNOWN_PROJECT = 'Chưa xác định';
export function projectNameOf(value: unknown): string {
  return String(value ?? '').trim() || UNKNOWN_PROJECT;
}
const unknownProjectLast = (a: { name: string }, b: { name: string }) =>
  Number(a.name === UNKNOWN_PROJECT) - Number(b.name === UNKNOWN_PROJECT);

type KhoaPivot = Pick<KhoaSanXuat,
  'tinhTrangKey' | 'tinhTrangIpoKey' | 'xuongKey' | 'bopKey' | 'congTrinhKey' | 'hangMucKey' | 'daysAtCurrentStageKey' |
  'triGiaDonHangTongKey' | 'thanhTienTinhPhieuKey' | 'thanhTienNhapKhoKey'>;

/** Hàm tính giá trị theo dòng — đơn HỦY = 0; còn lại theo quy tắc chung (trị giá − đã nhập, chặn [0, trị giá]) */
export function hamGiaTri(k: KhoaPivot) {
  const isCancelledRow = (row: DataRow) => !!k.tinhTrangIpoKey && isCancelledIpo(row[k.tinhTrangIpoKey]);
  const rowRemain = (row: DataRow) =>
    remainValue(parseNumber(row[k.triGiaDonHangTongKey]), k.thanhTienNhapKhoKey ? parseNumber(row[k.thanhTienNhapKhoKey]) : 0);
  const calculateMetricValue = (row: DataRow, metric: MetricType): number => {
    // Đơn HỦY không tính cả khi ĐẾM
    if (isCancelledRow(row)) return 0;
    if (metric === 'COUNT_HEX') return 1;
    if (metric === 'SUM_GT_CON_LAI' || metric === 'SUM_GT_DON_HANG') return rowRemain(row);
    return 0;
  };
  // Phễu = phần CÒN LẠI theo công đoạn: khi ĐẾM chỉ đếm hạng mục chưa nhập kho đủ (đủ giá trị hoặc đủ số
  // lượng thì bỏ) — khớp chế độ giá trị (hạng mục đã nhập đủ có giá trị còn lại 0)
  const funnelValue = (row: DataRow, metric: MetricType): number => {
    if (metric !== 'COUNT_HEX') {
      if (isCancelledRow(row)) return 0;
      return remainValue(parseNumber(row[k.triGiaDonHangTongKey]), k.thanhTienNhapKhoKey ? parseNumber(row[k.thanhTienNhapKhoKey]) : 0);
    }
    if (isCancelledRow(row)) return 0;
    const total = parseNumber(row[k.triGiaDonHangTongKey]);
    const nk = k.thanhTienNhapKhoKey ? parseNumber(row[k.thanhTienNhapKhoKey]) : 0;
    return isStocked(total, nk, false, isQtyComplete(row)) ? 0 : 1;
  };
  return { isCancelledRow, rowRemain, calculateMetricValue, funnelValue };
}

const statusOf = (row: DataRow, k: KhoaPivot, mode: BottleneckViewMode): string => {
  let status = '';
  if (mode === 'BOP') {
    status = k.bopKey ? String(row[k.bopKey] || 'Chưa xác định').trim() : 'Chưa xác định';
    if (!status) status = 'Chưa xác định';
  } else {
    status = String(row[k.tinhTrangKey] || '').trim();
  }
  return status;
};

export function tinhBottleneck(rows: DataRow[], k: KhoaPivot, mode: BottleneckViewMode): BottleneckItem[] {
  if (!k.tinhTrangKey || !k.daysAtCurrentStageKey) return [];
  // Nhóm thời gian dùng chung (utils/productionMetrics.dwellBucket): 4–7 tuần và "từ 8 tuần"
  // đều vào "Từ 4 tuần trở lên"; "0"/trống vào "Chưa có số ngày" để công đoạn không bị mất cột.
  const agg: Record<string, BottleneckItem> = {};
  rows.forEach(row => {
    const status = statusOf(row, k, mode);
    if (!status) return;
    if (!agg[status]) {
      agg[status] = { name: status } as BottleneckItem;
      DWELL_KEYS.forEach(d => { agg[status][d] = 0; });
    }
    const d = dwellBucket(row[k.daysAtCurrentStageKey]);
    agg[status][d] = ((agg[status][d] as number) || 0) + 1;
  });
  return Object.values(agg).sort((a, b) => a.name.localeCompare(b.name));
}

export function tinhTopBottlenecks(rows: DataRow[], k: KhoaPivot, mode: BottleneckViewMode): { name: string; count: number }[] {
  if (!k.tinhTrangKey || !k.daysAtCurrentStageKey) return [];
  const counts: Record<string, number> = {};
  rows.forEach(row => {
    const status = statusOf(row, k, mode);
    if (status && dwellBucket(row[k.daysAtCurrentStageKey]) === DWELL_STUCK) {
      counts[status] = (counts[status] || 0) + 1;
    }
  });
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    // Lấy 6: P001 (chờ triển khai bản vẽ) được tách ra ô riêng ở BottleneckSection, còn lại top 5 sản xuất
    .slice(0, 6);
}

export interface CardMetrics {
  coTheSX: number; vecniFitting: number; chuyenKhac: number; coPhieuChuaSX: number;
  chuaTheSX: number; vuongSL: number; chuaTrienKhai: number;
}
export function tinhCardMetrics(rows: DataRow[], k: KhoaPivot): CardMetrics {
  const metrics = { coTheSX: 0, vecniFitting: 0, chuyenKhac: 0, coPhieuChuaSX: 0, chuaTheSX: 0, vuongSL: 0, chuaTrienKhai: 0 };
  if (!k.tinhTrangKey) return metrics;
  const { isCancelledRow, rowRemain } = hamGiaTri(k);
  rows.forEach(row => {
    const status = String(row[k.tinhTrangKey] || '').trim().toUpperCase();
    const val = isCancelledRow(row) ? 0 : rowRemain(row);
    const isIn = (group: string[]) => group.some(s => status.includes(s));
    if (isIn(STATUS_GROUPS.CO_THE_SX)) metrics.coTheSX += val;
    if (isIn(STATUS_GROUPS.VECNI_FITTING)) metrics.vecniFitting += val;
    else if (isIn(STATUS_GROUPS.CHUYEN_KHAC)) metrics.chuyenKhac += val;
    else if (isIn(STATUS_GROUPS.CO_PHIEU_CHUA_SX)) metrics.coPhieuChuaSX += val;
    if (isIn(STATUS_GROUPS.CHUA_THE_SX)) metrics.chuaTheSX += val;
    if (isIn(STATUS_GROUPS.VUONG_SL)) metrics.vuongSL += val;
    else if (isIn(STATUS_GROUPS.CHUA_TRIEN_KHAI)) metrics.chuaTrienKhai += val;
  });
  return metrics;
}

// Bảng "Tình trạng đơn hàng theo Công trình": mỗi dòng 1 công trình, cột theo cấu trúc bảng BOP của cửa sổ công trình
// (Construction/core/bopPivot): công đoạn (gom nhóm Chưa triển khai / Chưa tính phiếu / Đang trên chuyền) + TỔNG +
// Kho lũy kế (Đã nhập · Đã xuất · Tồn kho · Chênh). Số lượng = số hạng mục; Giá trị = phần CÒN LẠI chưa nhập (triệu).
// Ăn mọi bộ lọc trang (rows đã lọc); bỏ đơn HỦY.
export type KhoaBangCongTrinh = KhoaPivot & Partial<Pick<KhoaSanXuat, 'xuatKhoKey' | 'tonKhoKey'>>;
export function tinhBangCongTrinh(rows: DataRow[], k: KhoaBangCongTrinh, metric: ProjectSummaryMetric): BangCongTrinhBop | null {
  if (!k.congTrinhKey || !k.triGiaDonHangTongKey) return null;
  const { isCancelledRow } = hamGiaTri(k);
  const khoa = {
    bopKey: k.bopKey, tinhTrangKey: k.tinhTrangKey, triGiaKey: k.triGiaDonHangTongKey, nhapKhoKey: k.thanhTienNhapKhoKey,
    // Trình duyệt (usePivotTables) không truyền 2 khoá này => tên cột chuẩn, như ConstructionOverview
    xuatKhoKey: k.xuatKhoKey || 'thanh_tien_xuat_kho_luy_ke', tonKhoKey: k.tonKhoKey || 'thanh_tien_ton_kho_hien_tai',
  };
  const items: (MucBop & { ct: string })[] = [];
  for (const row of rows) {
    if (isCancelledRow(row)) continue;
    items.push({ ...mucBopTuDong(row, khoa), ct: projectNameOf(row[k.congTrinhKey]) });
  }
  return tinhBangCongTrinhBop(items, metric === 'COUNT' ? 'count' : 'remain', UNKNOWN_PROJECT);
}

export function tinhPivotWorkshop(rows: DataRow[], k: KhoaPivot, metric: MetricType): WorkshopPivotData | null {
  if (!k.tinhTrangKey || !k.xuongKey) return null;
  const { calculateMetricValue } = hamGiaTri(k);
  const uniqueWorkshops = Array.from(new Set(rows.map(r => String(r[k.xuongKey] || '').trim()).filter(Boolean))).sort();
  const pivotRows: { bop: string; status: string; key: string }[] = [];
  const seen = new Set<string>();
  rows.forEach(r => {
    const bop = String(r[k.bopKey] || '').trim();
    const status = String(r[k.tinhTrangKey] || '').trim();
    if (status) {
      const combinedKey = `${bop} ||| ${status}`;
      if (!seen.has(combinedKey)) { seen.add(combinedKey); pivotRows.push({ bop, status, key: combinedKey }); }
    }
  });
  pivotRows.sort((a, b) => {
    const bopComp = a.bop.localeCompare(b.bop);
    if (bopComp !== 0) return bopComp;
    return a.status.localeCompare(b.status);
  });
  if (uniqueWorkshops.length === 0 || pivotRows.length === 0) return null;
  const uniqueBops = Array.from(new Set(pivotRows.map(r => r.bop)));
  const matrix: Record<string, Record<string, number>> = {};
  const rowTotals: Record<string, number> = {};
  const colTotals: Record<string, number> = {};
  const bopTotals: Record<string, Record<string, number>> = {};
  const bopRowTotals: Record<string, number> = {};
  let grandTotal = 0;
  uniqueBops.forEach(b => { bopTotals[b] = {}; bopRowTotals[b] = 0; uniqueWorkshops.forEach(w => { bopTotals[b][w] = 0; }); });
  pivotRows.forEach(r => {
    matrix[r.key] = {};
    rowTotals[r.key] = 0;
    uniqueWorkshops.forEach(w => { matrix[r.key][w] = 0; colTotals[w] = (colTotals[w] || 0); });
  });
  rows.forEach(row => {
    const bop = String(row[k.bopKey] || '').trim();
    const s = String(row[k.tinhTrangKey] || '').trim();
    const w = String(row[k.xuongKey] || '').trim();
    if (s && w) {
      const combinedKey = `${bop} ||| ${s}`;
      const val = calculateMetricValue(row, metric);
      if (matrix[combinedKey] && matrix[combinedKey][w] !== undefined) {
        matrix[combinedKey][w] += val;
        rowTotals[combinedKey] += val;
        colTotals[w] += val;
        grandTotal += val;
        if (bopTotals[bop] && bopTotals[bop][w] !== undefined) { bopTotals[bop][w] += val; bopRowTotals[bop] += val; }
      }
    }
  });
  return { uniqueWorkshops, rows: pivotRows, uniqueBops, bopTotals, bopRowTotals, matrix, rowTotals, colTotals, grandTotal };
}

export interface FunnelPivot { data: { name: string; value: number }[]; total: number }

/** Phễu theo BOP — nguồn funnelProductionData (theo Tình trạng IPO của trang, không ăn filters.tinhTrang) */
export function tinhPivotFunnel(rows: DataRow[], k: KhoaPivot, metric: MetricType): FunnelPivot | null {
  if (!k.bopKey) return null;
  const { funnelValue } = hamGiaTri(k);
  const agg: Record<string, number> = {};
  let total = 0;
  rows.forEach(row => {
    const bop = String(row[k.bopKey] || 'Chưa xác định').trim();
    const s = String(row[k.tinhTrangKey] || '').trim();
    const w = String(row[k.xuongKey] || '').trim();
    if (s && w) {
      const val = funnelValue(row, metric);
      agg[bop] = (agg[bop] || 0) + val;
      total += val;
    }
  });
  const bopOrder: readonly string[] = BOP_STAGE_ORDER;
  return {
    data: Object.entries(agg)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => {
        const indexA = bopOrder.indexOf(a.name);
        const indexB = bopOrder.indexOf(b.name);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return b.value - a.value;
      }),
    total,
  };
}

/** Chi tiết theo Công trình cho TỪNG bước BOP của phễu (cùng nguồn với tinhPivotFunnel) */
export function tinhFunnelBreakdownByBop(rows: DataRow[], k: KhoaPivot, metric: MetricType): Record<string, FunnelPivot> {
  const result: Record<string, FunnelPivot> = {};
  if (!k.bopKey || !k.congTrinhKey) return result;
  const { funnelValue } = hamGiaTri(k);
  const agg: Record<string, Record<string, number>> = {}; // bop -> công trình -> value
  const totals: Record<string, number> = {};
  rows.forEach(row => {
    const bop = String(row[k.bopKey] || 'Chưa xác định').trim();
    const s = String(row[k.tinhTrangKey] || '').trim();
    const w = String(row[k.xuongKey] || '').trim();
    if (!s || !w) return;
    const project = projectNameOf(row[k.congTrinhKey]);
    const val = funnelValue(row, metric);
    if (!agg[bop]) agg[bop] = {};
    agg[bop][project] = (agg[bop][project] || 0) + val;
    totals[bop] = (totals[bop] || 0) + val;
  });
  Object.keys(agg).forEach(bop => {
    result[bop] = {
      data: Object.entries(agg[bop]).map(([name, value]) => ({ name, value })).sort((a, b) => unknownProjectLast(a, b) || b.value - a.value),
      total: totals[bop] || 0,
    };
  });
  // Thanh gộp "P022/P025. Nhập kho chưa đủ" của phễu: chi tiết = cộng 2 công đoạn
  const short: Record<string, number> = {};
  ['P022', 'P025'].forEach(bop => Object.entries(agg[bop] ?? {}).forEach(([name, v]) => { short[name] = (short[name] || 0) + v; }));
  if (Object.keys(short).length) {
    result.P022_SHORT = {
      data: Object.entries(short).map(([name, value]) => ({ name, value })).sort((a, b) => unknownProjectLast(a, b) || b.value - a.value),
      total: (totals.P022 || 0) + (totals.P025 || 0),
    };
  }
  return result;
}

export function tinhPivotProject(rows: DataRow[], k: KhoaPivot, metric: MetricType, excludeFabrics: boolean): ProjectPivotData | null {
  if (!k.congTrinhKey || !k.tinhTrangKey) return null;
  const { calculateMetricValue } = hamGiaTri(k);
  const dataToUse = excludeFabrics
    ? rows.filter(r => {
        const hm = String(r[k.hangMucKey] || '').toLowerCase();
        return !hm.includes('vải') && !hm.includes('gối');
      })
    : rows;
  const uniqueStatuses = Array.from(new Set(dataToUse.map(r => String(r[k.tinhTrangKey] || '').trim()).filter(Boolean))).sort();
  const uniqueProjects = Array.from(new Set(dataToUse.map(r => String(r[k.congTrinhKey] || '').trim()).filter(Boolean))).sort();
  const matrix: Record<string, Record<string, number>> = {};
  const rowTotals: Record<string, number> = {};
  const colTotals: Record<string, number> = {};
  let grandTotal = 0;
  uniqueProjects.forEach(p => { matrix[p] = {}; rowTotals[p] = 0; uniqueStatuses.forEach(s => { matrix[p][s] = 0; colTotals[s] = (colTotals[s] || 0); }); });
  dataToUse.forEach(row => {
    const p = String(row[k.congTrinhKey] || '').trim();
    const s = String(row[k.tinhTrangKey] || '').trim();
    if (p && s) {
      const val = calculateMetricValue(row, metric);
      if (matrix[p] && matrix[p][s] !== undefined) { matrix[p][s] += val; rowTotals[p] += val; colTotals[s] += val; grandTotal += val; }
    }
  });
  return { uniqueProjects, uniqueStatuses, matrix, rowTotals, colTotals, grandTotal };
}

// ---------------------------------------------------------------------------
// Biểu đồ tròn "Cơ cấu đơn hàng" (trước nằm trong ProductionDonutPanel)
// ---------------------------------------------------------------------------
// Giá trị gốc tính theo triệu đồng  =>  Tỷ = giá trị gốc / 1,000
const UNIT = 1000;
export const OTHERS = 'Khác';          // gộp các khách hàng nhỏ
export const TOP_CUSTOMERS = 6;        // số khách hàng hiển thị riêng, phần còn lại gộp vào "Khác"

export type DKey = 'kv' | 'kh' | 'pl';
export type MixMetric = 'count' | 'value';
export interface OrderMixSelection { kv: string[]; kh: string[]; pl: string[] }

export interface MixRec {
  /** Khoá đếm công trình (tên chuẩn) */
  ct: string;
  kv: string; kh: string; pl: string; total: number;
  row: DataRow;  // dòng gốc — cho file xuất Excel
}

export interface MixItem {
  name: string;
  /** Giá trị vẽ lát: số hạng mục hoặc Tỷ, tuỳ chế độ */
  value: number;
  items: number;      // số hạng mục
  totalTy: number;    // tổng giá trị (Tỷ)
  cts: Set<string>;   // các công trình
}
export interface MixSummary { cts: number; items: number; totalTy: number }

/** Gom các dòng theo `dimOf`, trả về danh sách lát (đã bỏ lát = 0), sắp giảm dần theo value. */
export function aggregateMix<R>(
  rows: R[], dimOf: (r: R) => string, ctOf: (r: R) => string, totalTrieuOf: (r: R) => number, metric: MixMetric,
): MixItem[] {
  const m = new Map<string, MixItem>();
  for (const r of rows) {
    const name = dimOf(r);
    let e = m.get(name);
    if (!e) { e = { name, value: 0, items: 0, totalTy: 0, cts: new Set() }; m.set(name, e); }
    const ty = totalTrieuOf(r) / UNIT;
    e.items++;
    e.totalTy += ty;
    e.cts.add(ctOf(r));
    e.value += metric === 'count' ? 1 : ty;
  }
  return [...m.values()].filter(d => d.value > 0).sort((a, b) => b.value - a.value);
}

/** Tóm tắt (số công trình / hạng mục / giá trị) của 1 tập dòng. */
export function summarizeMix<R>(rows: R[], ctOf: (r: R) => string, totalTrieuOf: (r: R) => number): MixSummary {
  const cts = new Set<string>();
  let total = 0;
  for (const r of rows) { cts.add(ctOf(r)); total += totalTrieuOf(r); }
  return { cts: cts.size, items: rows.length, totalTy: total / UNIT };
}

/** Giữ top N (và luôn giữ mục đang chọn), phần còn lại gộp thành "Khác". `list` đã sắp giảm dần. */
export const groupTopN = (list: MixItem[], topN: number, selected: string[] = []): MixItem[] => {
  if (list.length <= topN) return list;
  const head = list.filter((d, i) => i < topN || selected.includes(d.name));
  const rest = list.filter(d => !head.includes(d));
  if (rest.length === 0) return head;
  const others: MixItem = { name: OTHERS, value: 0, items: 0, totalTy: 0, cts: new Set() };
  for (const d of rest) {
    others.value += d.value; others.items += d.items; others.totalTy += d.totalTy;
    d.cts.forEach(c => others.cts.add(c));
  }
  return [...head, others];
};

// Mã đầu tên kiểu "01. BÀN", "10. CỬA"
const CODE_PREFIX = /^(\d+)\s*[.\-)]/;

/**
 * Thứ tự hiển thị: nếu mọi nhóm đều có mã số đầu tên (nhóm sản phẩm) => xếp theo mã 01, 02, 03...
 * ngược lại giữ giảm dần theo giá trị. "(Chưa có)" và "Khác" luôn đứng cuối.
 */
export const orderMix = (list: MixItem[]): MixItem[] => {
  const isTail = (n: string) => n === NO_DATA_LABEL || n === OTHERS;
  const head = list.filter(d => !isTail(d.name));
  const tail = list.filter(d => isTail(d.name)).sort((a, b) => (a.name === OTHERS ? 1 : b.name === OTHERS ? -1 : 0));
  if (head.length > 0 && head.every(d => CODE_PREFIX.test(d.name))) {
    const code = (n: string) => Number(CODE_PREFIX.exec(n)![1]);
    head.sort((a, b) => code(a.name) - code(b.name) || a.name.localeCompare(b.name, 'vi'));
  }
  return [...head, ...tail];
};

/** Dòng cho biểu đồ tròn: bỏ dòng không tên công trình / đơn HỦY; công trình gom theo tên chuẩn (projectMatchKey) */
export function mixRecords(data: DataRow[], columns: ColumnDefinition[]): MixRec[] {
  const key = (target: string, fallback: string) => findColumnKey(columns, target) || fallback;
  const kvK = key('khu_vuc_du_an', 'khu_vuc_du_an');
  const khK = key('khach_hang', 'khach_hang');
  const plK = key(TARGET_COLUMN_NAMES.PHAN_LOAI_NHOM_SAN_PHAM, 'phan_loai_nhom_san_pham');
  const ipoK = key(TARGET_COLUMN_NAMES.TINH_TRANG_IPO, 'tinh_trang_ipo');
  const totK = key(TARGET_COLUMN_NAMES.TRI_GIA_DON_HANG_TONG, 'tri_gia_don_hang_tong');
  const ctK = key(TARGET_COLUMN_NAMES.CONG_TRINH, 'ten_cong_trinh');
  const out: MixRec[] = [];
  for (const row of data) {
    if (!String(row[ctK] ?? '').trim()) continue;
    // Đơn HỦY không tính (cả số hạng mục lẫn giá trị) — quy tắc chung
    if (String(row[ipoK] ?? '').toUpperCase().includes('HỦY')) continue;
    out.push({
      ct: projectMatchKey(row[ctK]),
      kv: categoryValue(row[kvK]), kh: categoryValue(row[khK]), pl: categoryValue(row[plK]),
      total: parseNumber(row[totK]),
      row,
    });
  }
  return out;
}

const recCt = (r: MixRec) => r.ct;
const recTotal = (r: MixRec) => r.total;

/** Các dòng khớp lựa chọn của mọi biểu đồ, trừ `exclude` (lọc chéo: mỗi biểu đồ bỏ qua lựa chọn của chính nó) */
export function mixMatching(records: MixRec[], selection: OrderMixSelection, exclude?: DKey): MixRec[] {
  const active = (['kv', 'kh', 'pl'] as DKey[])
    .filter(x => x !== exclude && selection[x].length > 0)
    .map(x => [x, new Set(selection[x])] as const);
  return active.length ? records.filter(r => active.every(([o, set]) => set.has(r[o]))) : records;
}

export function mixBuild(records: MixRec[], selection: OrderMixSelection, k: DKey, metric: MixMetric, topN?: number): MixItem[] {
  const list = aggregateMix(mixMatching(records, selection, k), r => r[k], recCt, recTotal, metric);
  return orderMix(topN ? groupTopN(list, topN, selection[k]) : list);
}

export function mixSummary(records: MixRec[], selection: OrderMixSelection): MixSummary {
  return summarizeMix(mixMatching(records, selection), recCt, recTotal);
}

/** Đủ 3 biểu đồ + tóm tắt */
export function tinhCoCauDonHang(records: MixRec[], selection: OrderMixSelection, metric: MixMetric) {
  return {
    kv: mixBuild(records, selection, 'kv', metric),
    kh: mixBuild(records, selection, 'kh', metric, TOP_CUSTOMERS),
    pl: mixBuild(records, selection, 'pl', metric),
    summary: mixSummary(records, selection),
  };
}
export type CoCauDonHang = ReturnType<typeof tinhCoCauDonHang>;

// ---------------------------------------------------------------------------
// Tất cả số liệu màn đầu Tổng quan từ bảng sản xuất (máy chủ tính sẵn; trình duyệt dùng khi chưa có bảng)
// ---------------------------------------------------------------------------
export interface TuyChonTongQuan {
  workshopMetric: MetricType;
  projectMetric: MetricType;
  projectSummaryMetric: ProjectSummaryMetric;
  excludeFabrics: boolean;
  bottleneckViewMode: BottleneckViewMode;
}
export const TUY_CHON_MAC_DINH: TuyChonTongQuan = {
  workshopMetric: 'SUM_GT_DON_HANG', projectMetric: 'SUM_GT_DON_HANG', projectSummaryMetric: 'VALUE',
  excludeFabrics: false, bottleneckViewMode: 'BOP',
};

/** Biểu đồ tròn dạng gửi qua mạng: cts là mảng (Set không qua được JSON) */
export interface MixItemJson extends Omit<MixItem, 'cts'> { cts: string[] }
const mixJson = (l: MixItem[]): MixItemJson[] => l.map(d => ({ ...d, cts: [...d.cts] }));
export const mixTuJson = (l: MixItemJson[]): MixItem[] => l.map(d => ({ ...d, cts: new Set(d.cts) }));

export function tinhTongQuanSanXuat(
  productionData: DataRow[], productionColumns: ColumnDefinition[], applied: DashboardFiltersState, tuy: TuyChonTongQuan,
) {
  const k = khoaSanXuat(productionColumns);
  const kLoc: KhoaLoc = { ...k, phanLoaiKey: k.phanLoaiNhomSanPhamKey };
  const scoped = tinhScopedProjects(productionData, applied.khachHang, applied.khuVucDuAn, k.congTrinhKey, k.khachHangKey, k.khuVucDuAnKey);
  const effectiveCongTrinh = tinhEffectiveCongTrinh(scoped, applied.congTrinh);
  const t = tapLoc(applied, effectiveCongTrinh);
  const filtered = locFiltered(productionData, t, kLoc);
  const funnel = locFunnel(productionData, t, kLoc);
  const crossBase = locCrossFilterBase(productionData, t, kLoc);
  const mixMetric: MixMetric = tuy.workshopMetric === 'COUNT_HEX' ? 'count' : 'value';
  const coCau = tinhCoCauDonHang(mixRecords(crossBase, productionColumns), { kv: applied.khuVucDuAn, kh: applied.khachHang, pl: applied.phanLoai }, mixMetric);
  return {
    soDong: productionData.length,
    luaChon: luaChonSanXuat(productionData, k),
    scopedProjects: scoped ? [...scoped] : null,
    effectiveCongTrinh,
    cardMetrics: tinhCardMetrics(filtered, k),
    bangCongTrinh: tinhBangCongTrinh(filtered, k, tuy.projectSummaryMetric),
    pivotWorkshopData: tinhPivotWorkshop(filtered, k, tuy.workshopMetric),
    pivotFunnelData: tinhPivotFunnel(funnel, k, tuy.workshopMetric),
    funnelBreakdownByBop: tinhFunnelBreakdownByBop(funnel, k, tuy.workshopMetric),
    pivotProjectData: tinhPivotProject(filtered, k, tuy.projectMetric, tuy.excludeFabrics),
    bottleneckData: tinhBottleneck(filtered, k, tuy.bottleneckViewMode),
    topBottlenecks: tinhTopBottlenecks(filtered, k, tuy.bottleneckViewMode),
    coCau: { kv: mixJson(coCau.kv), kh: mixJson(coCau.kh), pl: mixJson(coCau.pl), summary: coCau.summary },
  };
}
export type TongQuanSanXuat = ReturnType<typeof tinhTongQuanSanXuat>;
