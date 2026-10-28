-- BOP-M2: tình trạng vật liệu (M001…M008) nạp từ file Excel công trình của PC
-- (G:\Shared drives\BỘ PHẬN ĐIỀU PHỐI-PC\001_PROJECT\01_SOURCE\<tên>_CTxx-xxx.xlsx, sheet 02_DATA + 03_MATERIALS).
-- Nạp bằng backend/scripts/nap_bop_m2.py; app đọc qua GET /api/bop-m2?ct=CTxx-xxx (tab BOM của cửa sổ công trình).
-- Chạy 1 lần trên DB thật (người dùng tự chạy).

-- Mỗi file đã nạp: để lần sau chỉ nạp lại file có thay đổi (mtime / kích thước)
CREATE TABLE IF NOT EXISTS bop_m2_file (
  ten_file     text PRIMARY KEY,
  ma_ct        text,
  mtime        timestamptz,
  kich_thuoc   bigint,
  so_hex       integer,
  so_vat_lieu  integer,
  nap_luc      timestamptz NOT NULL DEFAULT now(),
  loi          text            -- khác NULL: file không nạp được (thiếu sheet / cột…), dữ liệu cũ của công trình giữ nguyên
);

-- Sheet 02_DATA: 1 dòng / HEX
CREATE TABLE IF NOT EXISTS bop_m2_hex (
  ma_ct          text NOT NULL,
  hex            text NOT NULL,
  ma_nha_may     text,
  ten_hang_muc   text,
  nhom_sp        text,           -- PHÂN LOẠI NHÓM SẢN PHẨM
  xuong          text,           -- XƯỞNG CHÍNH
  ipo            text,           -- TÌNH TRẠNG IPO FINAL
  bop            text,
  m2             jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {"GỖ":"M008","TẤM VÁN":"M003",…} chỉ nhóm có ghi
  final          text,           -- TÌNH TRẠNG BOP-M2 FINAL
  ten_file       text,
  PRIMARY KEY (ma_ct, hex)
);

-- Sheet 03_MATERIALS: 1 dòng / vật liệu (không có HEX)
CREATE TABLE IF NOT EXISTS bop_m2_vat_lieu (
  ma_ct          text NOT NULL,
  stt            integer NOT NULL,   -- thứ tự dòng trong sheet
  nhom_vat_tu    text,
  code           text,
  mo_ta          text,
  tt_mau         text,
  ngay_duyet     text,               -- dd/mm/yyyy (giữ dạng chữ như file; ô PR nhiều dòng có nhiều ngày)
  nhu_cau        text,
  ghi_chu        text,
  tt_pr          text,
  ngay_pr        text,
  ngay_du_kien   text,
  ngay_ve        text,
  bop_m2         text,
  ten_file       text,
  PRIMARY KEY (ma_ct, stt)
);
