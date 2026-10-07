-- Setup gộp xưởng (khu vực sản xuất): mã xưởng gốc -> xưởng gộp.
-- Dùng cho mọi nơi chia / lọc theo xưởng (trang "Setup gộp xưởng", chỉ ADMIN sửa).
-- Mã không có trong bảng giữ nguyên.

CREATE TABLE IF NOT EXISTS workshop_group_mapping (
  xuong_raw   TEXT PRIMARY KEY,          -- mã xưởng gốc trong dữ liệu (viết hoa), vd. 'ABC'
  xuong_group TEXT NOT NULL,             -- xưởng gộp, vd. 'KHÁC' hoặc '4A'
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);

-- Mặc định: giữ đúng cách gộp đang dùng (các xưởng nhỏ -> KHÁC). ADMIN sửa lại ở trang Setup.
INSERT INTO workshop_group_mapping (xuong_raw, xuong_group) VALUES
  ('X.ĐB', 'KHÁC'),
  ('ABC', 'KHÁC'),
  ('VÁN SÀN', 'KHÁC'),
  ('OTHERS', 'KHÁC'),
  ('HN', 'KHÁC'),
  ('TNC', 'KHÁC'),
  ('X.HÀ NỘI', 'KHÁC'),
  ('GCN', 'KHÁC'),
  ('0', 'KHÁC')
ON CONFLICT (xuong_raw) DO NOTHING;
