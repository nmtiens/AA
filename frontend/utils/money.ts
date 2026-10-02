// ============================================================================
// ĐƠN VỊ TIỀN — dùng chung toàn app
// Mọi cột tiền trong DB (tri_gia_don_hang_tong, thanh_tien_tinh_phieu,
// thanh_tien_nhap_kho(_luy_ke), thanh_tien_xuat_kho...) lưu theo TRIỆU ĐỒNG.
// Đã xác nhận bằng dữ liệu: tri_gia_don_hang_tong = số lượng × đơn giá (đồng) / 1.000.000.
// Backend dùng cùng quy ước (TRIEU_TO_TY = 1000 trong backend/api/index.ts).
// ============================================================================

/** Nhãn đơn vị của giá trị tiền gốc trong DB */
export const MONEY_UNIT_LABEL = 'Triệu đồng';

/** Số triệu đồng trong 1 tỷ đồng */
export const TRIEU_PER_TY = 1000;

/** Đổi giá trị gốc (triệu đồng) sang tỷ đồng */
export const trieuToTy = (value: number): number => value / TRIEU_PER_TY;
