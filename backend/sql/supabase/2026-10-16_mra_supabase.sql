-- ============================================================================
-- DỮ LIỆU MRA (MỤC XƯỞNG) TRÊN SUPABASE — cấu trúc bảng gộp, trạng thái mới nhất (tới 2026-10-16).
-- Gộp từ: 2026-10-12_xuong.sql, _xuong_anh.sql, _xuong_bao_cao.sql, 2026-10-13_xuong_cham_cong.sql,
--         2026-10-16_xuong_tram.sql (thư mục backend/sql).
-- Chạy ở Supabase → SQL Editor (project mra). Chạy lại an toàn.
--
-- Khác bản Layerbase:
--   - KHÔNG có khoá ngoại tới users (users vẫn ở Layerbase): xuong_to.to_truong_user_id, xuong_quan_ly.user_id,
--     xuong_phien_thiet_bi.user_id, xuong_to_che_do.nguoi_doi chỉ là số id — backend tự kiểm.
--   - Không có ALTER TABLE users (token_version ở Layerbase, giữ nguyên).
--   - Bật RLS, không policy + thu quyền anon / authenticated: dữ liệu không đọc được qua Data API của Supabase,
--     chỉ backend (kết nối Postgres bằng user postgres — chủ bảng) đọc ghi được.
--   - Danh mục công đoạn / tổ / lịch ca thật: chép từ Layerbase bằng script chuyển dữ liệu (không nạp ở đây),
--     chỉ thêm lịch ca mặc định '*' nếu chưa có.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Danh mục
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS xuong_cong_doan (
  id           text PRIMARY KEY,                 -- vd CD2400043 (giữ mã MRA)
  xuong        text NOT NULL,                    -- vd 4A
  ten_cd       text NOT NULL,                    -- công đoạn cấp xưởng, vd 4A-MÁY
  cd_tach_ma   text,                             -- công đoạn cấp thành phần / nhóm
  cd_chi_tiet  text NOT NULL,                    -- công đoạn chi tiết (định biên tổ)
  thu_tu       integer NOT NULL DEFAULT 0,
  la_bao_bi    boolean NOT NULL DEFAULT false,
  active       boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_xuong_cong_doan_xuong ON xuong_cong_doan (xuong) WHERE active;

CREATE TABLE IF NOT EXISTS xuong_to (
  id                  serial PRIMARY KEY,
  xuong               text NOT NULL,
  ten_to              text NOT NULL,
  to_truong_user_id   integer,                   -- users.id ở Layerbase (không khoá ngoại)
  active              boolean NOT NULL DEFAULT true,
  che_do_cham         text NOT NULL DEFAULT 'cu' CHECK (che_do_cham IN ('cu','song_song','tram')),
  UNIQUE (xuong, ten_to)
);

CREATE TABLE IF NOT EXISTS xuong_to_cong_doan (
  to_id         integer NOT NULL REFERENCES xuong_to(id) ON DELETE CASCADE,
  cong_doan_id  text    NOT NULL REFERENCES xuong_cong_doan(id) ON DELETE CASCADE,
  PRIMARY KEY (to_id, cong_doan_id)
);

CREATE TABLE IF NOT EXISTS xuong_to_thanh_vien (
  to_id     integer NOT NULL REFERENCES xuong_to(id) ON DELETE CASCADE,
  mnv       text    NOT NULL,
  tu_ngay   date    NOT NULL DEFAULT CURRENT_DATE,
  den_ngay  date,
  PRIMARY KEY (to_id, mnv, tu_ngay)
);

-- Chế độ chấm của tổ theo ngày ca (trạm quét)
CREATE TABLE IF NOT EXISTS xuong_to_che_do (
  id         serial      PRIMARY KEY,
  to_id      integer     NOT NULL REFERENCES xuong_to(id) ON DELETE CASCADE,
  che_do     text        NOT NULL CHECK (che_do IN ('cu','song_song','tram')),
  tu_ngay    date        NOT NULL,
  nguoi_doi  integer,                            -- users.id ở Layerbase
  luc        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_xuong_to_che_do_to ON xuong_to_che_do (to_id, tu_ngay);

-- Lịch ca theo xưởng; '*' = mặc định mọi xưởng. Giờ Asia/Ho_Chi_Minh.
CREATE TABLE IF NOT EXISTS xuong_lich_ca (
  xuong         text NOT NULL,
  loai_ca       text NOT NULL,                   -- chinh | ca1 | ca2 | ca3 | ca4 | chu_nhat
  gio_bat_dau   time NOT NULL,
  gio_ket_thuc  time NOT NULL,                   -- qua đêm khi gio_ket_thuc <= gio_bat_dau
  nghi          jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (xuong, loai_ca)
);
INSERT INTO xuong_lich_ca (xuong, loai_ca, gio_bat_dau, gio_ket_thuc, nghi) VALUES
  ('*', 'chinh',    '07:30', '15:45', '[["11:30","12:15"]]'::jsonb),
  ('*', 'ca1',      '16:15', '18:45', '[]'::jsonb),
  ('*', 'ca2',      '16:15', '20:15', '[]'::jsonb),
  ('*', 'ca3',      '16:15', '22:00', '[]'::jsonb),
  ('*', 'ca4',      '16:15', '06:00', '[]'::jsonb),
  ('*', 'chu_nhat', '07:30', '15:45', '[]'::jsonb)
ON CONFLICT (xuong, loai_ca) DO NOTHING;

CREATE TABLE IF NOT EXISTS xuong_quan_ly (
  user_id  integer NOT NULL,                     -- users.id ở Layerbase
  xuong    text    NOT NULL,
  PRIMARY KEY (user_id, xuong)
);

-- Công nhân (chấm công theo người, trạm quét)
CREATE TABLE IF NOT EXISTS xuong_cong_nhan (
  mnv        text        PRIMARY KEY,
  ho_ten     text        NOT NULL,
  xuong      text,
  to_id      integer     REFERENCES xuong_to(id) ON DELETE SET NULL,
  chuc_vu    text,
  active     boolean     NOT NULL DEFAULT true,
  nguon      text        NOT NULL DEFAULT 'app' CHECK (nguon IN ('app', 'file')),
  tao_luc    timestamptz NOT NULL DEFAULT now(),
  cap_nhat   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_xuong_cong_nhan_to ON xuong_cong_nhan (to_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_xuong_cong_nhan_xuong ON xuong_cong_nhan (xuong) WHERE active;

-- ---------------------------------------------------------------------------
-- Thiết bị (máy cá nhân + trạm quét)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS xuong_phien_thiet_bi (
  device_id   uuid        NOT NULL,
  user_id     integer     NOT NULL,              -- users.id ở Layerbase (trạm: người đăng ký)
  lan_dau     timestamptz NOT NULL DEFAULT now(),
  lan_cuoi    timestamptz NOT NULL DEFAULT now(),
  thu_hoi     boolean     NOT NULL DEFAULT false,
  loai        text        NOT NULL DEFAULT 'ca_nhan' CHECK (loai IN ('ca_nhan','tram')),
  to_id       integer     REFERENCES xuong_to(id) ON DELETE CASCADE,
  cong_doan   text[]      NOT NULL DEFAULT '{}',
  ten         text,
  PRIMARY KEY (device_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_xuong_phien_thiet_bi_tram ON xuong_phien_thiet_bi (to_id) WHERE loai = 'tram';

-- ---------------------------------------------------------------------------
-- Sổ sự kiện (chỉ ghi thêm) + trạng thái tính lại
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS xuong_su_kien (
  id                    uuid        PRIMARY KEY,
  loai                  text        NOT NULL CONSTRAINT xuong_su_kien_loai_check CHECK (loai IN (
                          'trien_khai','khai_bao_cd','nhan','bat_dau','tam_ngung','tiep_tuc','hoan_thanh','giao',
                          'tang_ca','chia_nguoi','quan_so','xac_nhan_cuoi_ngay','tien_do','huy','vao_ca','ra_ca',
                          'nguoi_vao','nguoi_ra')),
  hex                   text,
  cong_doan_id          text,
  to_id                 integer,
  xuong                 text,
  so_luong              numeric,
  cong_doan_den_id      text,
  cong_doan_nguon_id    text,
  xuong_nguon           text,
  so_nguoi              integer,
  ly_do_tam_ngung       text CHECK (ly_do_tam_ngung IS NULL OR ly_do_tam_ngung IN (
                          'thieu_vat_tu','cho_ban_ve_duyet','loi_chat_luong','chuyen_viec_gap','lenh_cap_tren','khac')),
  tien_do               integer CHECK (tien_do IS NULL OR tien_do BETWEEN 0 AND 100),
  ghi_chu               text,
  du_lieu               jsonb,
  device_ts             timestamptz NOT NULL,
  lech_ms               bigint,
  device_ts_hieu_chinh  timestamptz NOT NULL,
  server_ts             timestamptz NOT NULL DEFAULT now(),
  user_id               integer,
  user_id_khai          integer,
  sent_by               integer     NOT NULL,
  device_id             uuid,
  sua_cho               uuid,
  nguon                 text        NOT NULL DEFAULT 'app' CHECK (nguon IN ('app','mra')),
  nguoi_thao_tac_goc    text,
  co                    text[]      NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_xuong_su_kien_hex_cd   ON xuong_su_kien (hex, cong_doan_id);
CREATE INDEX IF NOT EXISTS idx_xuong_su_kien_to_ts    ON xuong_su_kien (to_id, device_ts_hieu_chinh);
CREATE INDEX IF NOT EXISTS idx_xuong_su_kien_den      ON xuong_su_kien (cong_doan_den_id, hex) WHERE loai = 'giao';
CREATE INDEX IF NOT EXISTS idx_xuong_su_kien_sua_cho  ON xuong_su_kien (sua_cho) WHERE sua_cho IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_xuong_su_kien_co       ON xuong_su_kien (xuong, server_ts) WHERE co <> '{}';
CREATE INDEX IF NOT EXISTS idx_xuong_su_kien_mnv      ON xuong_su_kien ((du_lieu->>'mnv'), device_ts_hieu_chinh)
  WHERE loai IN ('nguoi_vao','nguoi_ra','ra_ca');

CREATE TABLE IF NOT EXISTS xuong_trang_thai (
  hex                  text    NOT NULL,
  cong_doan_id         text    NOT NULL,
  xuong                text,
  trang_thai           text    NOT NULL,
  sl_giao_den          numeric NOT NULL DEFAULT 0,
  sl_nhan              numeric NOT NULL DEFAULT 0,
  sl_hoan_thanh        numeric NOT NULL DEFAULT 0,
  sl_giao              numeric NOT NULL DEFAULT 0,
  so_nguoi             integer,
  dang_chay_tu         timestamptz,
  su_kien_cuoi         timestamptz,
  co                   text[]  NOT NULL DEFAULT '{}',
  cap_nhat             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hex, cong_doan_id)
);
CREATE INDEX IF NOT EXISTS idx_xuong_trang_thai_cd ON xuong_trang_thai (cong_doan_id, trang_thai);

CREATE TABLE IF NOT EXISTS xuong_phien_ban (
  to_id  integer NOT NULL,
  ngay   date    NOT NULL,
  v      bigint  NOT NULL DEFAULT 0,
  PRIMARY KEY (to_id, ngay)
);

-- Giờ công đã phân bổ theo (tổ, ngày) cho báo cáo
CREATE TABLE IF NOT EXISTS xuong_gio_cong_ngay (
  to_id     integer     NOT NULL,
  ngay      date        NOT NULL,
  v         bigint      NOT NULL,
  ket_qua   jsonb       NOT NULL,
  tinh_luc  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (to_id, ngay)
);

-- Ảnh tiến độ
CREATE TABLE IF NOT EXISTS xuong_anh (
  id          uuid        PRIMARY KEY,
  hex         text        NOT NULL,
  mime        text        NOT NULL CHECK (mime IN ('image/webp', 'image/jpeg')),
  size        integer     NOT NULL,
  data        bytea       NOT NULL,
  user_id     integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_xuong_anh_hex ON xuong_anh (hex);

-- ---------------------------------------------------------------------------
-- Khoá Data API của Supabase: chỉ backend (user postgres, chủ bảng) truy cập
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['xuong_cong_doan','xuong_to','xuong_to_cong_doan','xuong_to_thanh_vien','xuong_to_che_do',
    'xuong_lich_ca','xuong_quan_ly','xuong_cong_nhan','xuong_phien_thiet_bi','xuong_su_kien','xuong_trang_thai',
    'xuong_phien_ban','xuong_gio_cong_ngay','xuong_anh'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon', t); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated', t); END IF;
  END LOOP;
END $$;

-- Kiểm tra: 14 bảng, RLS bật
SELECT c.relname AS bang, c.relrowsecurity AS rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'xuong%'
ORDER BY 1;
