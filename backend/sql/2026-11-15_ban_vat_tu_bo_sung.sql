-- BÁN VẬT TƯ TỒN KHO — bổ sung (15/11/2026): thuộc tính suy từ tên (A) + ảnh vật tư (E).
-- Chạy SAU backend/sql/2026-11-14_ban_vat_tu_ton.sql. Chỉ ADD COLUMN / CREATE ... IF NOT EXISTS => chạy lại an toàn.
-- Người dùng tự chạy file này trên DB thật; loader kiểm tra cột / bảng trước khi ghi.
--
-- Nạp dữ liệu (từ thư mục backend):
--   python scripts/nap_ban_vat_tu.py            # chạy khô: thống kê trước/sau từng thuộc tính + 20 mẫu duyệt
--   python scripts/nap_ban_vat_tu.py --ghi      # ghi ban_vt_ton + ban_vt_master (kèm suy_tu_ten)
--   python scripts/nap_anh_vat_tu.py            # ảnh từ sheet 03_MATERIALS (chạy khô mặc định; --ghi để ghi)

-- 1) Thuộc tính TÁCH TỪ TÊN vật tư (backend/scripts/tach_thuoc_tinh.py) — CHỈ cho trường master đang trống,
--    không bao giờ đè dữ liệu ZMM60 / MD. Khoá trong {chung_loai, quy_cach, mau, ma_mau, thuong_hieu, chat_lieu},
--    giá trị chuỗi. Vd: {"chung_loai": "CHẶN CỬA", "quy_cach": "78 mm", "thuong_hieu": "HAFELE", "chat_lieu": "INOX"}.
--    Mã tồn không có ở master / DEMO có dòng ban_vt_master nguon = 'SUY_TEN' (ten_master = tên trong file tồn).
ALTER TABLE ban_vt_master ADD COLUMN IF NOT EXISTS suy_tu_ten JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2) Ảnh vật tư. nguon = 'SHEET03' (ảnh mẫu duyệt cột "HÌNH MẪU VẬT LIỆU", sheet 03_MATERIALS file Production Status)
--    | sau này 'CHUP' (kho chụp). Ảnh đã nén (cạnh dài <= 1000px, JPEG); hash = sha1 của ảnh đã nén.
--    chac_chan = true khi dòng sheet 03 chỉ có 1 mã SAP; false = dòng nhiều mã chung 1 ảnh => cần người duyệt.
--    Loader ảnh xoá + ghi lại CHỈ các dòng nguon = 'SHEET03' AND trang_thai = 'tu_dong'; dòng đã duyệt / ẩn giữ nguyên
--    (ON CONFLICT (ma_vat_tu, hash) DO NOTHING).
CREATE TABLE IF NOT EXISTS ban_vt_anh (
  id             BIGSERIAL PRIMARY KEY,
  ma_vat_tu      TEXT NOT NULL,                       -- mã SAP chuỗi 12 số (không zfill)
  nguon          TEXT NOT NULL,                       -- 'SHEET03' | 'CHUP'
  hash           TEXT NOT NULL,                       -- sha1 (hex) của ảnh đã nén
  data           BYTEA NOT NULL,
  mime           TEXT NOT NULL DEFAULT 'image/jpeg',
  rong           INT,                                 -- px
  cao            INT,                                 -- px
  kich_thuoc     INT,                                 -- byte
  cong_trinh     TEXT,                                -- mã CT (vd CT26-041)
  code_vat_lieu  TEXT,                                -- ST-05, FAB-996…
  mo_ta          TEXT,                                -- mô tả dòng sheet 03 nếu có
  file_nguon     TEXT,
  dong_nguon     INT,
  chac_chan      BOOLEAN NOT NULL,
  trang_thai     TEXT NOT NULL DEFAULT 'tu_dong'
                 CHECK (trang_thai IN ('tu_dong', 'da_duyet', 'an')),
  duyet_boi      TEXT,
  duyet_luc      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (ma_vat_tu, hash)
);
CREATE INDEX IF NOT EXISTS idx_ban_vt_anh_ma ON ban_vt_anh (ma_vat_tu);

-- 3) Bump phiên bản cache API 'ban_vt' (cachedByVersions(['ban_vt'])) để danh sách tính lại với cột / bảng mới.
UPDATE table_versions SET last_updated = now() WHERE table_name = 'ban_vt';
INSERT INTO table_versions (table_name, last_updated)
SELECT 'ban_vt', now()
WHERE NOT EXISTS (SELECT 1 FROM table_versions WHERE table_name = 'ban_vt');
