// ---------------------------------------------------------------------------
// Phễu "Tình trạng đơn hàng AATN": ánh xạ từ mã bước (BOP: P001, P002, P012 -> P021, GCVT)
// sang cột/công đoạn của dữ liệu hex gốc, để bấm 1 con số trong bảng "Chi tiết dữ liệu Phễu"
// mở tiếp được danh sách HEX. Dùng chung cho Tổng quan, Luồng đỏ, Căn mẫu.
//
// - P001 ứng với cột "notDeployed".
// - P002 ứng với cột "p002".
// - P012 -> P021, GCVT ứng với cột "onLine", lọc thêm theo đúng mã BOP đó.
// - P022 (TỒN KHO) mở danh sách tồn kho (StockItemsModal, theo hạng mục) ở Dashboard, không qua đây.
//
// stages: danh sách = hạng mục CÒN LẠI có công đoạn (BOP) thuộc các mã này — đúng cách thanh phễu đếm (gom theo
// BOP, tinhPivotFunnel). Không dùng nhóm remainBucketOf: hạng mục tình trạng "15. CHƯA TRIỂN KHAI" nằm ở P002 /
// P022… bị xếp vào P001 => thanh P002 đếm nhưng danh sách P002 không có, danh sách P001 lại dư.
// ---------------------------------------------------------------------------

export type FunnelHexColumn = 'totalOrder' | 'notDeployed' | 'p002' | 'onLine' | 'shortfall' | 'remaining';

export const FUNNEL_HEX_COLUMN_LABELS: Record<FunnelHexColumn, string> = {
  totalOrder: 'Tổng Giá Trị Đơn Hàng',
  notDeployed: 'Chưa Triển Khai (P001)',
  p002: 'Chưa Tính Phiếu (P002)',
  onLine: 'Đang Trên Chuyền (P012->P021)',
  shortfall: 'Nhập Kho Chưa Đủ (P022/P025)',
  remaining: 'Còn Lại (mọi công đoạn)',
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
  // Dòng "P022" của bảng phễu (chưa chọn thanh nào) = hạng mục sản xuất ở P022 chưa nhập đủ — KHÔNG phải tồn kho
  P022: { column: 'shortfall', stage: 'P022' },
};

/** Mã BOP mà 1 thanh phễu gom (thanh gộp P022/P025 = 2 công đoạn) */
const stagesOf = (id: string): string[] => (id === 'P022_SHORT' ? ['P022', 'P025'] : [id]);

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
): { column: FunnelHexColumn; stage: string | null; stages: string[] | null; projectName: string | null } | null {
  if (itemId) {
    if (itemId === 'P022') return null; // Tồn kho: Dashboard mở StockItemsModal
    const mapping = FUNNEL_TO_HEX_TARGET[itemId];
    if (!mapping) return null;
    return { column: mapping.column, stage: mapping.stage, stages: stagesOf(itemId), projectName: name };
  }
  // Dòng TỔNG CỘNG của phễu = tổng phần CÒN LẠI (không phải tổng đơn hàng)
  if (name === null) return { column: 'remaining', stage: null, stages: null, projectName: null };
  const mapping = FUNNEL_TO_HEX_TARGET[name];
  if (!mapping) return null;
  return { column: mapping.column, stage: mapping.stage, stages: stagesOf(name), projectName: null };
}
