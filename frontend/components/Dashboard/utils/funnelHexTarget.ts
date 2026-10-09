// ---------------------------------------------------------------------------
// Phễu "Tình trạng đơn hàng AATN": ánh xạ từ mã bước (BOP: P001, P002, P012 -> P021, GCVT)
// sang cột/công đoạn của dữ liệu hex gốc, để bấm 1 con số trong bảng "Chi tiết dữ liệu Phễu"
// mở tiếp được danh sách HEX. Dùng chung cho Tổng quan, Luồng đỏ, Căn mẫu.
//
// - P001 ứng với cột "notDeployed".
// - P002 ứng với cột "p002".
// - P012 -> P021, GCVT ứng với cột "onLine", lọc thêm theo đúng mã BOP đó.
// - P022 (TỒN KHO) lấy từ nguồn khác nên KHÔNG có hex gốc -> không mở danh sách HEX.
// ---------------------------------------------------------------------------

export type FunnelHexColumn = 'totalOrder' | 'notDeployed' | 'p002' | 'onLine' | 'shortfall';

export const FUNNEL_HEX_COLUMN_LABELS: Record<FunnelHexColumn, string> = {
  totalOrder: 'Tổng Giá Trị Đơn Hàng',
  notDeployed: 'Chưa Triển Khai (P001)',
  p002: 'Chưa Tính Phiếu (P002)',
  onLine: 'Đang Trên Chuyền (P012->P021)',
  shortfall: 'Nhập Kho Chưa Đủ (P022/P025)',
};

const FUNNEL_TO_HEX_TARGET: Partial<Record<string, { column: FunnelHexColumn; stage: string | null }>> = {
  P001: { column: 'notDeployed', stage: null },
  P002: { column: 'p002', stage: 'P002' },
  P012: { column: 'onLine', stage: 'P012' },
  P013: { column: 'onLine', stage: 'P013' },
  GCVT: { column: 'onLine', stage: 'GCVT' },
  P014: { column: 'onLine', stage: 'P014' },
  P016: { column: 'onLine', stage: 'P016' },
  P018: { column: 'onLine', stage: 'P018' },
  P020: { column: 'onLine', stage: 'P020' },
  P021: { column: 'onLine', stage: 'P021' },
  // Thanh gộp P022/P025 chưa nhập kho đủ (phần còn lại của hạng mục đã tới tồn kho / giao)
  P022_SHORT: { column: 'shortfall', stage: null },
  P025: { column: 'shortfall', stage: 'P025' },
};

/**
 * Xác định (column, stage, projectName) cho danh sách HEX khi bấm 1 con số trong bảng pivot của Phễu.
 * - Đã chọn 1 bước (itemId != null): bảng đang hiển thị theo CÔNG TRÌNH -> `name` = tên công trình
 *   (null = dòng TỔNG CỘNG).
 * - Chưa chọn bước nào (itemId == null): bảng đang hiển thị TỔNG theo BOP -> `name` CHÍNH LÀ mã BOP
 *   (null = dòng TỔNG CỘNG, xem tất cả).
 */
export function resolveFunnelHexTarget(
  name: string | null,
  itemId: string | null,
): { column: FunnelHexColumn; stage: string | null; projectName: string | null } | null {
  if (itemId) {
    if (itemId === 'P022') return null; // Tồn kho: không có dữ liệu hex gốc
    const mapping = FUNNEL_TO_HEX_TARGET[itemId];
    if (!mapping) return null;
    return { column: mapping.column, stage: mapping.stage, projectName: name };
  }
  if (name === null) return { column: 'totalOrder', stage: null, projectName: null };
  if (name === 'P022') return null;
  const mapping = FUNNEL_TO_HEX_TARGET[name];
  if (!mapping) return null;
  return { column: mapping.column, stage: mapping.stage, projectName: null };
}
