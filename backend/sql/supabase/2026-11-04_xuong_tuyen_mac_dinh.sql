-- Tuyến mặc định theo nhóm sản phẩm của từng xưởng (DB MRA / Supabase).
-- Điện thoại triển khai theo tuyến này; chưa khai thì dùng tuyến lần triển khai gần nhất của cùng nhóm.
-- thanh_phan: [{ ten, xuong, tuyen: [id công đoạn] }] — cùng dạng du_lieu.thanhPhan của sự kiện trien_khai.
CREATE TABLE IF NOT EXISTS xuong_tuyen_mac_dinh (
  xuong       text        NOT NULL,
  nhom        text        NOT NULL,
  thanh_phan  jsonb       NOT NULL,
  user_id     integer,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (xuong, nhom)
);

-- Khoá Data API của Supabase như các bảng xuong_* khác: chỉ backend truy cập
ALTER TABLE xuong_tuyen_mac_dinh ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON xuong_tuyen_mac_dinh FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON xuong_tuyen_mac_dinh FROM authenticated; END IF;
END $$;
