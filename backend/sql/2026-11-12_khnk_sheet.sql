-- KẾ HOẠCH NHẬP KHO THEO THÁNG — nguyên sheet năm (2027, 2028...) của
-- 002_REPORTS\01_PRODUCTION_STATUS\PRODUCTION STATUS.xlsx (kế hoạch nhập tay: BOT dự án, KHNK tháng, ghi chú, màu dòng).
-- Nạp bằng tool trên Drive (tong_hop_production_status.py, chế độ canh): file lưu xong thì đọc lại sheet và thay cả dòng.
-- Lưu theo đúng sheet (tiêu đề + dòng dạng JSON) => sheet thêm / bớt / đổi chỗ cột thì app tự theo, không sửa bảng.
-- App đọc qua GET /api/khnk-sheet (trang Tổng quan công trình, nút "Kế Hoạch Nhập Kho").
-- Đọc lỗi => tool chỉ ghi cột loi, giữ tieu_de / dong của lần đọc tốt gần nhất.

CREATE TABLE IF NOT EXISTS khnk_sheet (
  ten         text PRIMARY KEY,               -- 'PRODUCTION STATUS'
  nguon       text,                           -- đường dẫn file
  sheet       text,                           -- tên sheet đã đọc (năm lớn nhất)
  mtime       timestamptz,                    -- giờ sửa file lúc đọc
  kich_thuoc  bigint,
  tieu_de     jsonb NOT NULL DEFAULT '[]',    -- [{cot: 'A', nhan, tren, an (cột ẩn trong file), kieu: so | ngay | chu}]
  dong        jsonb NOT NULL DEFAULT '[]',    -- [{o: [giá trị theo tieu_de], mau?: {chỉ số cột: 'RRGGBB'}}]
  loi         text,                           -- khác NULL: lần đọc gần nhất lỗi, số đang hiện là lần đọc tốt trước
  nap_luc     timestamptz NOT NULL DEFAULT now()
);
