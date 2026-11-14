-- TỔNG QUAN CÔNG TRÌNH theo file công trình — mỗi dòng sheet 02_DATA (file add-in) / DATA (file cũ) của các file
-- 05_PRODUCTION STATUS, cùng nguồn với sheet TỔNG HỢP của MASTER_PROJECT_COORDINATION.xlsx.
-- Nạp bằng tool trên Drive: ...\02_MASTER_PROJECT_COORDINATION\Cập nhật công trình mới\tong_hop_production_status.py
--   (cùng lượt / cùng giao dịch với bot_tong_hop: file nào vừa lưu thì thay toàn bộ dòng của file đó; file lỗi giữ số cũ).
-- Danh sách file + lỗi + giờ nạp: dùng chung bảng bot_tong_hop_file (2026-11-09_bot_tong_hop.sql).
-- App đọc qua GET /api/cong-trinh/hang-muc (trang Tổng quan công trình): số theo file, cột file không có lấy từ
--   production_status_app theo HEX.
-- Tên cột = tên cột của production_status_app có cùng nghĩa (giao diện ghép thẳng vào dòng của trang).
-- Chạy 1 lần trên DB (người dùng cho phép). Chạy lại không sao (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS cong_trinh_hang_muc (
  nguon                        text NOT NULL,     -- FILE NGUỒN (đường dẫn tương đối dưới 005_PROJECT)
  stt                          integer NOT NULL,  -- thứ tự dòng trong file
  hex                          text,
  ma_cong_trinh                text,              -- MÃ CÔNG TRÌNH
  ten_cong_trinh               text,              -- TÊN CÔNG TRÌNH
  tinh_trang_ipo_goc           text,              -- TÌNH TRẠNG IPO (theo SAP)
  tinh_trang_ipo               text,              -- TÌNH TRẠNG IPO FINAL (PC chốt; lọc IPO của trang)
  tinh_trang                   text,              -- TÌNH TRẠNG SX
  bop                          text,              -- BOP (P001..P025, HỦY, GCVT, TẠM NGƯNG)
  ten_hang_muc                 text,
  phan_loai_nhom_san_pham      text,
  khu_vuc                      text,
  xuong_chinh                  text,
  dvt                          text,
  don_gia_co_oh                double precision,  -- ĐƠN GIÁ (đồng)
  so_luong_don_hang_tong       double precision,  -- SL ĐƠN HÀNG
  tri_gia_don_hang_tong        double precision,  -- TT ĐƠN HÀNG (triệu đồng, như production_status_app)
  so_luong_tinh_phieu          double precision,
  thanh_tien_tinh_phieu        double precision,
  so_luong_nhap_kho_luy_ke     double precision,
  thanh_tien_nhap_kho_luy_ke   double precision,
  so_luong_xuat_kho_luy_ke     double precision,
  thanh_tien_xuat_kho_luy_ke   double precision,
  so_luong_ton_kho_hien_tai    double precision,
  thanh_tien_ton_kho_hien_tai  double precision,
  so_luong_con_lai             double precision,  -- SL PHIẾU CÒN LẠI
  gia_tri_con_lai              double precision,  -- TT PHIẾU CÒN LẠI
  so_luong_don_hang_con_lai    double precision,  -- SL ĐH CÒN LẠI
  gia_tri_don_hang_con_lai     double precision,  -- TT ĐH CÒN LẠI
  ten_pm                       text,
  ten_pc                       text,
  khu_vuc_du_an                text,
  ngay_can_giao_file           date,              -- NGÀY CẦN GIAO (của file; khác cột ngay_can_giao của app)
  ngay_can_giao_pc             date,              -- NGÀY CẦN GIAO PC ĐỀ XUẤT
  ngay_duyet_phieu             date,
  ngay_khnk_thang              date,
  sl_khnk_thang                double precision,
  gt_khnk_thang                double precision,
  ngay_khnk_tuan               date,
  sl_khnk_tuan                 double precision,
  gt_khnk_tuan                 double precision,
  tinh_trang_bop_m2            text,              -- TÌNH TRẠNG BOP-M2 FINAL
  bo_phan_vuong_mac            text,              -- BỘ PHẬN GIẢI QUYẾT VƯỚNG MẮC
  noi_dung_vuong_mac           text,
  PRIMARY KEY (nguon, stt)
);
CREATE INDEX IF NOT EXISTS cong_trinh_hang_muc_hex ON cong_trinh_hang_muc (hex);

-- Dấu lần nạp cong_trinh_hang_muc của từng file (tool ghi '<phiên bản>:<giờ sửa>:<kích thước>'): khác dấu của file hiện tại
-- => tool nạp lại file đó (lần đầu; tool thêm cột; hoặc bản tool cũ đã nạp bot_tong_hop mà chưa nạp bảng này).
ALTER TABLE bot_tong_hop_file ADD COLUMN IF NOT EXISTS ct_dau text;
-- Cột của cong_trinh_hang_muc mà file không có (đổi tên / xoá cột): trang dùng số app cho các cột này, không coi là trống.
ALTER TABLE bot_tong_hop_file ADD COLUMN IF NOT EXISTS ct_thieu text[];
-- Bản đầu (12/11/2026) dùng ct_phien: thay bằng ct_dau
ALTER TABLE bot_tong_hop_file DROP COLUMN IF EXISTS ct_phien;
