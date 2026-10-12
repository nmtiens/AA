-- ============================================================================
-- MỤC XƯỞNG — ẢNH TIẾN ĐỘ LƯU TRONG POSTGRES (quyết định D24, 2026-10-12: giống ảnh vướng mắc)
-- Chạy SAU 2026-10-12_xuong.sql. Chạy lại an toàn.
-- Ảnh đã nén trên điện thoại (WebP / JPEG, cạnh dài 1280px, ~150 KB) => khoảng 2,2 GB mỗi năm nếu dùng như MRA.
-- Chưa chạy file này: nút chụp ảnh ở Xác nhận cuối ngày tự ẩn, các phần khác chạy bình thường.
-- ============================================================================

CREATE TABLE IF NOT EXISTS xuong_anh (
  id          uuid        PRIMARY KEY,               -- id sinh trên máy (gửi lại không ghi trùng)
  hex         text        NOT NULL,
  mime        text        NOT NULL CHECK (mime IN ('image/webp', 'image/jpeg')),
  size        integer     NOT NULL,
  data        bytea       NOT NULL,
  user_id     integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_xuong_anh_hex ON xuong_anh (hex);
