-- BÁN VẬT TƯ TỒN KHO: trang "/ban-vat-tu" chào bán TẤT CẢ hàng đang tồn trong kho vật tư
-- (kể cả hàng gán công trình, mã đầu 800 giá 0, CCDC đầu 400).
--
-- Nguồn:
--   ban_vt_ton       <- "BC ton kho vat tu dd.mm.yyyy.xlsx", sheet "Chi tiet tong ton kho"
--                       (G:\Shared drives\PPD-Production Planning Department\000_MASTER_DATA\13_TON_KHO_VAT_TU\01_DATA_TON_KHO_VAT_TU)
--   ban_vt_master    <- MASTER DATA VẬT TƯ.xlsx (ZMM60, sheet Data) + file DEMO (sheet DATA_ZMM60 bù mã thiếu,
--                       sheet MD_MATERIAL_PROPERTIES thuộc tính MP00–MP99)
--   ban_vt_thong_tin <- người dùng nhập trên web (PUT /api/ban-vat-tu/:ma): giá bán, ảnh, trạng thái, liên hệ, ghi chú
--
-- Cách chạy:
--   1) Chạy file này 1 lần trên DB thật (người dùng tự chạy; chỉ CREATE ... IF NOT EXISTS, chạy lại không sao).
--   2) Nạp dữ liệu (từ thư mục backend):
--        python scripts/nap_ban_vat_tu.py                          # CHẠY KHÔ: đọc file + in thống kê, KHÔNG ghi DB
--        python scripts/nap_ban_vat_tu.py --demo "<file DEMO>" --ghi   # ghi DB (xoá hết ban_vt_ton / ban_vt_master rồi ghi lại)
--      Loader ghi xong thì bump table_versions('ban_vt') để cache API tính lại.
--   3) Quyền 'ban_vat_tu' (xem) và 'ban_vat_tu_sua' (sửa thông tin bán) là chuỗi trong users.permissions
--      (gán ở trang quản lý người dùng) => không cần SQL. Giá vốn chỉ hiện với quyền 'materials_view_price'.
--
-- Đơn vị: gia_tri = TRIỆU ĐỒNG (như các bảng khác); gia_ban_vnd = ĐỒNG / 1 đơn vị tính (nhập tay);
--         gia_binh_quan = đồng / price_unit đơn vị (giữ nguyên như file ZMM60; API chia price_unit => đồng / 1 đvt).
-- Mã vật tư là CHUỖI giữ nguyên (mã 11 số là mã thật, không thêm số 0).

-- 1) Ảnh chụp tồn kho — mỗi lần nạp XOÁ HẾT rồi ghi lại trong 1 giao dịch. 1 mã có thể nhiều dòng (khác kho).
CREATE TABLE IF NOT EXISTS ban_vt_ton (
  id                      BIGSERIAL PRIMARY KEY,
  ma_vat_tu               TEXT NOT NULL,
  ten_vat_tu              TEXT,
  dvt                     TEXT,
  so_luong                NUMERIC,
  gia_tri                 NUMERIC,          -- triệu đồng (Total Value / 1e6)
  kho                     TEXT,             -- Sloc name
  ngay_nhap_kho_gan_nhat  DATE,             -- 2024-09-30 = ngày chuyển SAP (giao diện hiện "từ trước 10/2024")
  cham_luan_chuyen        BOOLEAN,          -- cột "Chậm luân chuyển trên 3 tháng" = X
  ten_cong_trinh          TEXT,             -- 'DÙNG CHUNG' / tên công trình đang gán
  ma_cong_trinh           TEXT,
  ngay_chot               DATE NOT NULL,    -- ngày trong tên file
  nguon_file              TEXT,
  updated_at              TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ban_vt_ton_ma ON ban_vt_ton (ma_vat_tu);

-- 2) Thuộc tính vật tư (chỉ các mã đang có trong ban_vt_ton) — mỗi lần nạp xoá hết rồi ghi lại cùng giao dịch với ban_vt_ton.
CREATE TABLE IF NOT EXISTS ban_vt_master (
  ma_vat_tu      TEXT PRIMARY KEY,
  ten_master     TEXT,
  dvt            TEXT,
  nhom_sap       TEXT,                      -- mã Material Group (vd 103)
  ten_nhom_sap   TEXT,                      -- Material Group Description
  loai_vat_tu    TEXT,                      -- Material Type Des. (vd "Vật tư, NVL")
  gia_binh_quan  NUMERIC,                   -- Periodic unit price (đồng / price_unit)
  price_unit     NUMERIC,
  chung_loai     TEXT,                      -- MP01
  chat_lieu      TEXT,                      -- MP35
  quy_cach       TEXT,                      -- ghép MP20–MP24 (phách, dày x rộng x dài, đường kính)
  mau            TEXT,                      -- MP15 (không có thì Color của ZMM60)
  thuong_hieu    TEXT,                      -- MP12
  xuat_xu        TEXT,                      -- MP26 (không có thì Country Origin của ZMM60)
  thuoc_tinh     JSONB NOT NULL DEFAULT '{}'::jsonb,  -- mọi MPxx khác rỗng: {"MP01 CHỦNG LOẠI": "VẢI", ...}
  nguon          TEXT,                      -- 'MASTER' | 'DEMO_ZMM60' | 'DEMO_MP' (chỉ có thuộc tính)
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- 3) Thông tin bán do người dùng nhập — loader KHÔNG đụng bảng này.
CREATE TABLE IF NOT EXISTS ban_vt_thong_tin (
  ma_vat_tu    TEXT PRIMARY KEY,
  gia_ban_vnd  NUMERIC,                     -- đồng / 1 đơn vị tính; NULL = "Liên hệ"
  anh_urls     TEXT[] NOT NULL DEFAULT '{}',
  trang_thai   TEXT NOT NULL DEFAULT 'dang_ban'
               CHECK (trang_thai IN ('dang_ban', 'da_giu', 'da_ban', 'ngung_ban')),
  lien_he      TEXT,
  ghi_chu      TEXT,
  updated_by   TEXT,
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Phiên bản cache API: CHỈ loader bump dòng này (sửa giá / ảnh trên web đổi khoá cache qua MAX(updated_at) của
-- ban_vt_thong_tin) => trang nhật ký cập nhật dữ liệu thấy đúng lần nạp tồn kho.
INSERT INTO table_versions (table_name, last_updated)
SELECT 'ban_vt', now()
WHERE NOT EXISTS (SELECT 1 FROM table_versions WHERE table_name = 'ban_vt');

-- Tên hiện ở nhật ký cập nhật dữ liệu (/api/data-update-log) thay cho nhãn thô 'ban_vt' — chỉ khi DB đã có cột
-- display_label (migration ghi ở backend/src/routes/data.ts)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'table_versions' AND column_name = 'display_label') THEN
    UPDATE table_versions SET display_label = 'Bán vật tư tồn kho'
    WHERE table_name = 'ban_vt' AND display_label IS NULL;
  END IF;
END $$;
