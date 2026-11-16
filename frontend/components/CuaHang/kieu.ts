// ============================================================================
// Kiểu dùng chung của trang khách (/#/cua-hang): vòng focus, màu nhấn đỏ AA, bo góc, màu trạng thái.
// Bảng màu: nền be lanh / travertine #ECE5DA (15/11/2026: hợp ngành nội thất sang trọng), bề mặt trắng, chữ / viền thang
// stone; đỏ AA #B0182B chỉ dùng vài điểm nhấn. Không dùng xanh lá / vàng hổ phách — trạng thái dùng than / stone.
// ============================================================================

/** Vòng focus bàn phím chung (nền sáng) */
export const VONG_FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white';

/** Vòng focus trên nền tối (khối danh mục than, ảnh) */
export const VONG_FOCUS_TOI =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-stone-900';

/** Đỏ thương hiệu AA (trắng trên đỏ / đỏ trên trắng ≈ 6.4:1) */
export const DO_AA = '#B0182B';
/** Lớp nền / chữ đỏ AA (Tailwind cần chuỗi tĩnh — giữ cùng giá trị với DO_AA) */
export const NEN_DO_AA = 'bg-[#B0182B]';
export const CHU_DO_AA = 'text-[#B0182B]';

/** Bo góc thống nhất: 6px cho thẻ, nút, ô, chip, bảng; 8px cho khối lớn (danh mục than, cửa sổ chi tiết) */
export const BO_GOC = 'rounded-md';
export const BO_GOC_LON = 'rounded-lg';

/** Màu trạng thái: xác nhận (đã chép, đã có trong yêu cầu) = than; lưu ý nhẹ = stone nghiêng; lỗi = đỏ đậm */
export const CHU_XAC_NHAN = 'text-stone-900';
export const CHU_LUU_Y = 'italic text-stone-600';
export const CHU_LOI = 'text-rose-700';

/** Liên kết chữ: than, gạch chân nhạt, rê => gạch chân đỏ AA */
export const LOP_LIEN_KET =
  'font-medium text-stone-900 underline decoration-stone-300 underline-offset-4 transition-colors hover:decoration-[#B0182B]';
