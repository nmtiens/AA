-- Dò phiên bản bản đồ vị trí BOP theo MRA (backend/src/server/xuong/viTriBop.ts, SQL_DO) mỗi ≤ 30 giây:
--   max(server_ts) của sự kiện triển khai / huỷ / khai CĐ nguồn app.
-- Không có index này thì lệnh dò quét cả xuong_su_kien. Chạy trên DB MRA (Supabase); không bắt buộc để app chạy.
CREATE INDEX IF NOT EXISTS idx_xuong_su_kien_vi_tri ON xuong_su_kien (server_ts)
  WHERE nguon = 'app' AND loai IN ('trien_khai', 'khai_bao_cd', 'huy');
