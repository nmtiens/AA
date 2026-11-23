-- Danh mục vật liệu từng công trình (sheet 03_MATERIALS file Production Status) + ảnh mẫu
-- Nạp bằng backend/scripts/nap_danh_muc_vl.py (tool tự chạy file này trước khi ghi). App: mục 3 trang Hồ sơ công trình.
CREATE TABLE IF NOT EXISTS ct_vl_file (
  ma_ct      text PRIMARY KEY,
  ten_file   text,
  mtime      timestamptz,
  so_dong    integer,
  so_anh     integer,
  loi        text,            -- khác NULL: lần nạp gần nhất đọc lỗi, dữ liệu cũ giữ nguyên
  nap_luc    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ct_vl (
  ma_ct      text NOT NULL,
  dong       integer NOT NULL,  -- số dòng trong sheet 03
  nhom       text,
  code       text,
  mo_ta      text,
  tt_mau     text,
  ngay_duyet text,
  nhu_cau    text,
  vi_tri     text,              -- cột GHI CHÚ (vị trí dùng)
  dvt_qs     text,
  sl_qs      text,
  ma_sap     text,              -- nhiều mã cách xuống dòng
  ten_vt     text,
  tt_pr      text,
  tt_vat_tu  text,
  bop_m2     text,
  PRIMARY KEY (ma_ct, dong)
);
CREATE TABLE IF NOT EXISTS ct_vl_anh (
  hash        text PRIMARY KEY,  -- sha1 ảnh đã nén (dùng chung giữa công trình)
  data        bytea NOT NULL,
  rong        integer,
  cao         integer,
  kich_thuoc  integer
);
CREATE TABLE IF NOT EXISTS ct_vl_anh_dong (
  ma_ct   text NOT NULL,
  dong    integer NOT NULL,
  thu_tu  integer NOT NULL,
  hash    text NOT NULL REFERENCES ct_vl_anh (hash),
  PRIMARY KEY (ma_ct, dong, thu_tu)
);
CREATE INDEX IF NOT EXISTS ct_vl_anh_dong_hash ON ct_vl_anh_dong (hash);
