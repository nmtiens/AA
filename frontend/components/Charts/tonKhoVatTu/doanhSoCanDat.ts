// ============================================================================
// DOANH SỐ CẦN ĐẠT theo tháng (TỶ đồng, cả công ty) — số người dùng đưa (biểu đồ "ĐVT: TỶ ĐỒNG", 29/10/2026), ghi cứng
// theo lựa chọn của người dùng (đổi số => sửa ở đây). Trang Tồn kho vật tư dùng làm DOANH THU tháng cho biểu đồ doanh
// thu + dự báo tồn (thay số bảng khsx_nam).
//   2025 = 853 tỷ; 2026 = 1.656 tỷ theo số từng tháng (ảnh ghi 1.667 — do số tháng đã làm tròn); 2027 = 3.000 tỷ.
// ============================================================================

export const DOANH_SO_CAN_DAT: Record<number, readonly number[]> = {
  2025: [45, 43, 61, 50, 71, 69, 60, 52, 74, 101, 111, 116],
  2026: [114, 81, 123, 97, 101, 131, 151, 151, 152, 175, 180, 200],
  2027: [200, 150, 200, 220, 230, 250, 250, 280, 280, 300, 320, 320],
};

/** Doanh số cần đạt của 1 năm theo khoá 'YYYY-MM' (năm chưa có số => rỗng) */
export function doanhSoCanDatNam(nam: number): Record<string, number> {
  const ds = DOANH_SO_CAN_DAT[nam];
  if (!ds) return {};
  return Object.fromEntries(ds.map((v, i) => [`${nam}-${String(i + 1).padStart(2, '0')}`, v]));
}
