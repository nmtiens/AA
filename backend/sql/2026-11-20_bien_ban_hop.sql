-- Biên bản họp (Shared Drive 002_REPORTS\08_BIÊN BẢN HỌP) tách theo từng ý, gắn mã công trình — trang Hồ sơ công trình mục 6.
-- Nạp bằng backend/scripts/nap_bien_ban_hop.py (đọc .xlsx trên ổ G:, link Drive lấy từ metadata Drive for Desktop).
-- 1 ý có thể nhắc nhiều công trình => nhiều dòng (cùng y_id). Bảng thay nguyên mỗi lần nạp (1 giao dịch).
CREATE TABLE IF NOT EXISTS bien_ban_hop (
  loai       text        NOT NULL,   -- HỌP SẢN XUẤT HÀNG NGÀY / HỌP VẬT TƯ / KICK OFF / BBH TKSX / BÁM SÁT DỰ ÁN / KHÁC
  ngay       date,                   -- ngày họp (đầu tên file yymmdd)
  ten_file   text        NOT NULL,
  drive_id   text,                   -- mã file Drive => mở / xem trong app
  y_id       text        NOT NULL,   -- định danh 1 ý: <tên file>#<dòng>#<thứ tự ý>
  chu_de     text,
  noi_dung   text,                   -- 1 ý của ô NỘI DUNG (đã tách theo "1. … 2. …")
  de_xuat    text,
  nguoi      text,
  han        text,
  ma_ct      text,                   -- mã công trình gắn được (NULL = chưa gắn)
  khop       text,                   -- cụm chữ đã khớp (mã / tên gọi) để kiểm tra gắn đúng
  nap_luc    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bien_ban_hop_ma_ct ON bien_ban_hop (ma_ct);
