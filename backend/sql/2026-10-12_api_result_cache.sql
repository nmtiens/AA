-- Cache kết quả API dùng chung mọi instance Vercel (backend/src/server/cache.ts, tham số `shared`).
-- Hiện dùng cho 4 danh sách ô lọc (xưởng / công trình / ĐVT / nhóm SP): trước mỗi instance mới quét DISTINCT
-- 7 bảng lớn (5–9 giây); giờ chỉ tính lại khi ETL đổi dữ liệu, instance khác đọc lại 1 dòng nhỏ.
-- Chưa chạy file này thì code vẫn chạy bình thường (bỏ qua tầng cache này).
-- Chạy 1 lần, chạy lại không sao.

CREATE TABLE IF NOT EXISTS api_result_cache (
  cache_key  TEXT PRIMARY KEY,           -- đường dẫn API + tham số
  versions   TEXT NOT NULL,              -- phiên bản các bảng dữ liệu (+ setup gộp xưởng) lúc tính
  data       JSONB NOT NULL,             -- kết quả trả về
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
