-- ============================================================================
-- BÁN VẬT TƯ TỒN KHO — TRANG NGƯỜI MUA (CÔNG KHAI, không cần đăng nhập): /#/cua-hang
-- Chạy SAU 2026-11-14_ban_vat_tu_ton.sql và 2026-11-15_ban_vat_tu_bo_sung.sql. An toàn khi chạy lại (IF NOT EXISTS).
--
--   1) ban_vt_thong_tin: admin duyệt đăng từng mã / hàng loạt (dang_cong_khai) + tên / mô tả cho khách.
--      Trang khách chỉ hiện mã dang_cong_khai = true AND trang_thai = 'dang_ban' AND đang có trong lần chốt tồn mới nhất.
--   2) ban_vt_anh.cong_khai: ảnh sheet 03 hay có chữ viết tay / dấu duyệt / tên công trình => MẶC ĐỊNH KHÔNG công khai,
--      admin bật từng ảnh.
--   3) ban_vt_yeu_cau: yêu cầu báo giá khách gửi từ trang công khai (POST /api/cong-khai/yeu-cau); admin xem / xử lý ở
--      GET / PUT /api/ban-vat-tu/yeu-cau.
--   4) Bump table_versions 'ban_vt' (cache danh sách admin + trang khách tính lại với cột mới).
--
-- Chưa chạy file này: API admin vẫn chạy như cũ (cột mới coi như mặc định), trang khách trả danh sách rỗng, gửi yêu
-- cầu trả 503.
-- ============================================================================

-- 1) Đăng lên trang khách
ALTER TABLE ban_vt_thong_tin ADD COLUMN IF NOT EXISTS dang_cong_khai     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ban_vt_thong_tin ADD COLUMN IF NOT EXISTS ten_hien_thi       TEXT;          -- tên cho khách (trống => tên vật tư)
ALTER TABLE ban_vt_thong_tin ADD COLUMN IF NOT EXISTS mo_ta_cong_khai    TEXT;          -- mô tả cho khách (văn bản thuần)
ALTER TABLE ban_vt_thong_tin ADD COLUMN IF NOT EXISTS dang_cong_khai_luc TIMESTAMPTZ;   -- lần bật đăng gần nhất (sắp xếp "mới đăng")
CREATE INDEX IF NOT EXISTS idx_ban_vt_thong_tin_cong_khai ON ban_vt_thong_tin (ma_vat_tu) WHERE dang_cong_khai;

-- 2) Ảnh nội bộ hiện cho khách (IF EXISTS: bảng ảnh tạo ở 2026-11-15_ban_vat_tu_bo_sung.sql)
ALTER TABLE IF EXISTS ban_vt_anh ADD COLUMN IF NOT EXISTS cong_khai BOOLEAN NOT NULL DEFAULT false;

-- 3) Yêu cầu báo giá của khách
CREATE TABLE IF NOT EXISTS ban_vt_yeu_cau (
  id              BIGSERIAL PRIMARY KEY,
  ma_yeu_cau      TEXT UNIQUE,                         -- mã ngắn cho khách, vd YC-20261115-AB12
  items           JSONB NOT NULL,                      -- [{ma, ten, soLuong, dvt}] — tên / đvt chụp lúc gửi (lấy từ DB)
  ten_khach       TEXT NOT NULL,
  sdt             TEXT NOT NULL,                       -- đã chuẩn hoá (chỉ chữ số, +84 => 0)
  email           TEXT,
  cong_ty         TEXT,
  ghi_chu         TEXT,
  trang_thai      TEXT NOT NULL DEFAULT 'moi'
                  CHECK (trang_thai IN ('moi', 'dang_xu_ly', 'da_xong', 'huy')),
  ghi_chu_noi_bo  TEXT,
  xu_ly_boi       TEXT,                                -- username người xử lý gần nhất
  xu_ly_luc       TIMESTAMPTZ,
  ip_hash         TEXT,                                -- sha256(ip + bí mật máy chủ): giới hạn số lần gửi, không lưu IP thô
  user_agent      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ban_vt_yeu_cau_created_at ON ban_vt_yeu_cau (created_at);
CREATE INDEX IF NOT EXISTS idx_ban_vt_yeu_cau_trang_thai ON ban_vt_yeu_cau (trang_thai);
-- Đếm số lần gửi theo IP trong 1 giờ / 1 ngày (giới hạn chống spam)
CREATE INDEX IF NOT EXISTS idx_ban_vt_yeu_cau_ip ON ban_vt_yeu_cau (ip_hash, created_at);

-- 4) Bump phiên bản cache 'ban_vt'
UPDATE table_versions SET last_updated = now() WHERE table_name = 'ban_vt';
INSERT INTO table_versions (table_name, last_updated)
SELECT 'ban_vt', now()
WHERE NOT EXISTS (SELECT 1 FROM table_versions WHERE table_name = 'ban_vt');
