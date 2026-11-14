// ============================================================================
// Bản lưu giờ công từng (tổ, ngày) — bảng xuong_gio_cong_ngay (Báo cáo xưởng ghi, Báo cáo + chi tiết hạng mục đọc).
// Phần thuần (không đọc DB) để test được.
// ============================================================================

/**
 * Bản lưu của một (tổ, ngày) có dùng thay cho tính lại được không. Đủ CẢ 3 điều kiện:
 *  - ngày đã qua (hôm nay còn đổi theo giờ hiện tại — luôn tính);
 *  - bản lưu ghi đúng phiên bản sổ hiện tại của (tổ, ngày) (có sự kiện mới / huỷ thì phiên bản tăng) — chưa có dòng
 *    phiên bản (v null / undefined) thì không dùng;
 *  - bản lưu tính với đúng dấu lịch ca hiện tại của xưởng tổ đó (dấu gồm cả phiên bản cách tính — đổi giờ ca, giờ nghỉ
 *    hay cách tính thì tính lại).
 */
export function banLuuDungDuoc(d: {
  ngay: string; homNay: string;
  /** Phiên bản sổ hiện tại (xuong_phien_ban.v) */
  v: unknown;
  /** Dòng bản lưu: v lúc lưu + dấu lịch ca lúc tính (ket_qua.bamLichCa) */
  luu: { v?: unknown; bam?: unknown } | null | undefined;
  bamHienTai: string;
}): boolean {
  if (!(d.ngay < d.homNay)) return false;
  if (d.v === null || d.v === undefined || !d.luu) return false;
  if (d.luu.v === null || d.luu.v === undefined) return false;
  return String(d.luu.v) === String(d.v) && typeof d.luu.bam === 'string' && d.luu.bam === d.bamHienTai;
}
