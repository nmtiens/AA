-- Danh mục file trong thư mục dự án trên Shared Drive (005_PROJECT\NĂM 20xx\<mã> <tên>\...)
-- Nạp bằng backend/scripts/quet_tai_lieu_ct.py (đọc metadata của Google Drive for Desktop — có mã file Drive để mở link).
-- Dùng cho trang Hồ sơ công trình: mục Concept (02_CONCEPT), lệnh khởi công, BOQ, masterplan, bản vẽ PM, hồ sơ thay đổi…
-- Bảng thay nguyên mỗi lần quét (1 giao dịch).
CREATE TABLE IF NOT EXISTS cong_trinh_tai_lieu (
  ma_ct        text        NOT NULL,          -- mã công trình lấy từ tên thư mục dự án (thư mục 2 mã => 2 dòng)
  thu_muc_ct   text        NOT NULL,          -- tên thư mục dự án, vd "CT26-116 DỰ ÁN SỐ 1 VIP-GĐ2"
  nam          text,                          -- "NĂM 2026"
  duong_dan    text        NOT NULL,          -- đường dẫn trong thư mục dự án, vd "02_SẢN XUẤT/01_HỒ SƠ ĐẦU VÀO/02_CONCEPT/x.pdf"
  nhom         text,                          -- 3 cấp thư mục đầu, vd "02_SẢN XUẤT/01_HỒ SƠ ĐẦU VÀO/02_CONCEPT"
  ten          text        NOT NULL,
  la_thu_muc   boolean     NOT NULL DEFAULT false,
  drive_id     text,                          -- mã file / thư mục Google Drive => link mở
  mime         text,
  kich_thuoc   bigint,
  sua_luc      timestamptz,
  quet_luc     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cong_trinh_tai_lieu_ma_ct ON cong_trinh_tai_lieu (ma_ct);
