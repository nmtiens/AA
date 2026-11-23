/** TẠM (người dùng 21/11/2026): bê tông nhóm 117 (ĐVT M3) trong file đặt hàng có đơn giá gấp 1.000 lần (vd 1.296.296.300 đ/M3,
 *  giá thật ~1,3 triệu) → chia 1.000 khi đơn giá > 10 triệu/M3 (cả "BƠM BÊ TÔNG" 92,6 triệu/M3). Bỏ khi file nguồn TỔNG HỢP BÁO CÁO ĐẶT HÀNG VẬT TƯ đã sửa.
 *  Dùng chung cho Đặt – Mua (routes/vatTu.ts) và trang Dữ liệu vật tư (/api/material, server/data.ts) để 2 trang cùng một số. */
export const sqlHeSoGia = (v = 'v') =>
  `(CASE WHEN split_part(btrim(${v}.nhom_vt), ' - ', 1) = '117' AND upper(btrim(${v}.dvt)) = 'M3' AND ${v}.don_gia > 1e7 THEN 1000 ELSE 1 END)`;
