-- ============================================================================
-- MỤC XƯỞNG — BẢNG LƯU GIỜ CÔNG ĐÃ PHÂN BỔ THEO (TỔ, NGÀY) CHO BÁO CÁO
-- Chạy SAU 2026-10-12_xuong.sql. Chạy lại an toàn.
-- Chỉ lưu ngày đã qua; dòng hết hạn khi phiên bản sổ (xuong_phien_ban.v) của (tổ, ngày) đổi hoặc lịch ca đổi
-- (backend tự xoá). Chưa chạy file này: báo cáo vẫn chạy, chỉ tính lại mỗi lần xem (chậm hơn).
-- ============================================================================

CREATE TABLE IF NOT EXISTS xuong_gio_cong_ngay (
  to_id     integer     NOT NULL,
  ngay      date        NOT NULL,
  v         bigint      NOT NULL,          -- xuong_phien_ban.v lúc tính
  ket_qua   jsonb       NOT NULL,          -- kết quả phanBoGioCong (theoHangMuc, gioCho, gioNguoiTo, co)
  tinh_luc  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (to_id, ngay)
);
