// ============================================================================
// Định dạng số / ngày dùng chung cho các view công trình (Báo cáo tiến độ, BOT/BOP/BOM, BOP×BOT).
// Số đếm dùng locale en-US (12,751) cho khớp với tiền tỷ ở utils/money.ts (1,942.89) — trước đây cửa sổ
// công trình dùng vi-VN (12.751) nên cùng một số hiện hai kiểu trên hai màn hình. Ngày luôn dd/mm/yyyy.
// ============================================================================

/** Số nguyên có dấu phân cách nghìn: 12,751 */
export const fmtInt = (n: number): string => (Number.isFinite(n) ? Math.round(n) : 0).toLocaleString('en-US');

/** Số lượng (tối đa 3 số lẻ, bỏ sai số dấu phẩy động 12.799999… -> 12.8): 17,400 / 12.8; không phải số -> "—" */
export const fmtQty = (v: unknown): string => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(n) ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 3 });
};

/** dd/mm/yyyy; null -> "—" */
export const fmtDate = (d: Date | null | undefined): string =>
  d ? d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

/** Một ngày tính bằng mili giây */
export const DAY_MS = 86_400_000;
