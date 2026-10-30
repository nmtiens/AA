// ============================================================================
// CẦN XEM của mục Xưởng — một định nghĩa "thao tác cần xử lý" dùng chung cho:
//   số trên nút "Cần xem (N)" / "x cần xem" ở thẻ tổ (GET /api/xuong/tong-quan),
//   danh sách Cần xem (GET /api/xuong/can-xem, bộ lọc mặc định "Cần xử lý"),
//   thông báo 8h sáng "có thao tác cần xem" (xuongThongBao.ts).
// ============================================================================

/** Cờ chỉ để biết (không phải lỗi): quản lý ghi hộ + các cờ ghi chú của trạm quét / phân công đầu ca */
export const CO_CHI_DE_BIET: readonly string[] = ['quan_ly_ghi_ho', 'tram', 'nhan_du', 'xong_het', 'khai_ho', 'phan_cong', 'bao_xong'];
const CHI_DE_BIET = new Set(CO_CHI_DE_BIET);

/** Danh sách Cần xem lấy thao tác trong bấy nhiêu ngày */
export const CAN_XEM_NGAY = 30;

/** Thao tác cần xử lý: có ít nhất một cờ ngoài nhóm chỉ để biết */
export function canXuLy(co: unknown): boolean {
  return Array.isArray(co) && co.some(c => !CHI_DE_BIET.has(String(c)));
}

/** Cùng điều kiện canXuLy viết bằng SQL cho sự kiện bí danh `a` (cột co text[]) */
export function sqlCanXuLy(a = 'e'): string {
  return `(${a}.co <> '{}' AND NOT (${a}.co <@ ARRAY[${CO_CHI_DE_BIET.map(c => `'${c}'`).join(', ')}]::text[]))`;
}

/** Sự kiện bí danh `a` chưa bị huỷ (thao tác đã huỷ không còn gì để xem) */
export const sqlChuaHuy = (a = 'e') => `NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = ${a}.id)`;

/** Thao tác cần xử lý còn hiệu lực, ghi lên máy chủ trong `gio` giờ qua — đếm như danh sách Cần xem ở bộ lọc mặc định */
export function sqlThaoTacCanXuLy(a = 'e', gio = CAN_XEM_NGAY * 24): string {
  return `${sqlCanXuLy(a)} AND ${a}.server_ts > now() - interval '${Math.round(gio)} hours' AND ${sqlChuaHuy(a)}`;
}
