// ============================================================================
// Định dạng số / ngày dùng chung cho các view công trình (Báo cáo tiến độ, BOT/BOP/BOM, BOP×BOT).
// Số đếm dùng locale en-US (12,751) cho khớp với tiền tỷ ở utils/money.ts (1,942.89) — trước đây cửa sổ
// công trình dùng vi-VN (12.751) nên cùng một số hiện hai kiểu trên hai màn hình. Ngày luôn dd/mm/yyyy.
// ============================================================================

/** Số nguyên có dấu phân cách nghìn: 12,751 */
export const fmtInt = (n: number): string => (Number.isFinite(n) ? Math.round(n) : 0).toLocaleString('en-US');

/** Giá trị đã ở đơn vị tỷ: 2 số lẻ; khác 0 mà dưới 0.01 ghi "<0.01" (0.00 dễ hiểu nhầm là 0) */
export const fmtSoTy = (ty: number): string => {
  const v = Number.isFinite(ty) ? ty : 0;
  if (v !== 0 && Math.abs(v) < 0.01) return '<0.01';
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** Tiền gốc (triệu đồng) ra tỷ: 1,942.89 */
export const fmtTy = (trieu: number): string => fmtSoTy(trieu / 1000);

/** Tỷ lệ theo %: 1 số lẻ (12.3%); đúng 0 ghi 0%; không phải số ghi "—" */
export const fmtPt = (pt: number | null | undefined): string => {
  if (pt === null || pt === undefined || !Number.isFinite(pt)) return '—';
  return pt === 0 ? '0%' : `${pt.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
};

/** Tháng: T11/2026. Nhận Date hoặc chuỗi bắt đầu bằng YYYY-MM; không hợp lệ ghi "—" */
export const fmtThang = (t: Date | string | null | undefined): string => {
  if (t instanceof Date) return Number.isNaN(t.getTime()) ? '—' : `T${t.getMonth() + 1}/${t.getFullYear()}`;
  const m = /^(\d{4})-(\d{2})/.exec(t ?? '');
  return m ? `T${Number(m[2])}/${m[1]}` : '—';
};

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
