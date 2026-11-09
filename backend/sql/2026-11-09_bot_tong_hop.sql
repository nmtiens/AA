-- BÁO CÁO BOT (giá trị đơn hàng còn lại theo dự án) — dữ liệu từ các file công trình của PC (05_PRODUCTION STATUS),
-- cùng nguồn với sheet TỔNG HỢP của MASTER_PROJECT_COORDINATION.xlsx.
-- Nạp bằng tool trên Drive: ...\02_MASTER_PROJECT_COORDINATION\Cập nhật công trình mới\tong_hop_production_status.py --theo-doi
--   (canh file công trình, file nào vừa lưu thì đọc lại file đó và thay toàn bộ dòng của file đó).
-- App đọc qua GET /api/bot-tong-hop (trang Báo cáo tiến độ công trình, nút "BÁO CÁO BOT").
-- Chạy 1 lần trên DB thật (người dùng tự chạy).

-- Mỗi file công trình đã nạp
CREATE TABLE IF NOT EXISTS bot_tong_hop_file (
  nguon        text PRIMARY KEY,   -- đường dẫn tương đối dưới 005_PROJECT (giống cột FILE NGUỒN của MASTER)
  mtime        timestamptz,
  kich_thuoc   bigint,
  so_dong      integer,
  loi          text,               -- khác NULL: lần đọc gần nhất lỗi, dòng cũ của file giữ nguyên
  nap_luc      timestamptz NOT NULL DEFAULT now()
);

-- 1 dòng / HEX (dòng sheet 02_DATA; file mẫu cũ: sheet DATA)
CREATE TABLE IF NOT EXISTS bot_tong_hop (
  nguon          text NOT NULL,
  stt            integer NOT NULL,   -- thứ tự dòng trong file
  ma_ct          text,               -- MÃ CÔNG TRÌNH
  ten_ct         text,               -- TÊN CÔNG TRÌNH (hàng của pivot)
  hex            text,
  ipo            text,               -- TÌNH TRẠNG IPO FINAL (lọc của pivot, mặc định 01. ĐANG SẢN XUẤT)
  ngay_can_giao  date,               -- NGÀY CẦN GIAO PC ĐỀ XUẤT (cột năm / tháng của pivot; trống = CHƯA BOT)
  tt_con_lai     double precision,   -- TT ĐH CÒN LẠI (giá trị cộng của pivot)
  PRIMARY KEY (nguon, stt)
);
CREATE INDEX IF NOT EXISTS bot_tong_hop_ipo ON bot_tong_hop (ipo);
