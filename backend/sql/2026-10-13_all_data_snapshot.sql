-- ============================================================================
-- BẢN NÉN SẴN CỦA /api/all-data (dùng chung mọi phiên bản hàm Vercel)
-- Mỗi khoá = bộ bảng client xin trong 1 request + có / không cột giá vật tư. ver = phiên bản dữ liệu các bảng đó;
-- dữ liệu đổi (ETL) thì request đầu tiên nén lại và ghi đè. Người mới / phiên bản hàm mới đọc thẳng khối gzip
-- (~3 MB) thay vì truy vấn + nén lại hàng chục nghìn dòng (5–6 giây).
-- Chạy 1 lần. Chạy lại an toàn. Chưa chạy thì /api/all-data vẫn chạy như cũ.
-- ============================================================================

CREATE TABLE IF NOT EXISTS all_data_snapshot (
  khoa      text PRIMARY KEY,
  ver       text NOT NULL,
  du_lieu   bytea NOT NULL,
  cap_nhat  timestamptz NOT NULL DEFAULT now()
);

-- Dữ liệu đã gzip: không nén lại lần nữa khi lưu
ALTER TABLE all_data_snapshot ALTER COLUMN du_lieu SET STORAGE EXTERNAL;
