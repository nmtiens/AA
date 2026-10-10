-- ĐỀ XUẤT (CHƯA CHẠY) — sửa cột generated *_num ép sai số dạng khoa học.
-- Biểu thức cũ xoá ký tự ngoài [0-9.-] nên "6.4e-06" -> "6.4-06" => NULL, "1.5e+03" -> "1.503" (sai im lặng).
-- Biểu thức mới khớp numericExpr ở backend/src/server/data.ts: dạng khoa học (bỏ dấu phẩy ngăn nghìn,
-- số mũ quá 3 chữ số => NULL) ép thẳng ::numeric; dạng khác giữ hành vi cũ.
-- Đo 10/10/2026: dht 3.522 dòng, nhap_kho 2.472, khsx 582, pthsp_full 147, tkbv_full 119 dòng e-notation
-- (đều cỡ 1e-06 triệu đồng = vài đồng => ảnh hưởng tổng không đáng kể, chủ yếu là dòng bị NULL).
-- Cần PostgreSQL 17+ (ALTER COLUMN ... SET EXPRESSION; DB hiện tại 18.6). Mỗi lệnh VIẾT LẠI CẢ BẢNG và dựng
-- lại index idx_*_num (khoá ACCESS EXCLUSIVE) => chạy ngoài giờ. Sau khi chạy nên bump table_versions để xoá cache.

BEGIN;

ALTER TABLE dht ALTER COLUMN tri_gia_don_hang_tong_num SET EXPRESSION AS (
  CASE
    WHEN REPLACE(tri_gia_don_hang_tong::text, ',', '') ~ '^\s*-?[0-9]+(\.[0-9]+)?[eE][-+]?[0-9]+\s*$'
    THEN CASE WHEN tri_gia_don_hang_tong::text ~ '[eE][-+]?0*[0-9]{1,3}\s*$' THEN TRIM(REPLACE(tri_gia_don_hang_tong::text, ',', ''))::numeric END
    ELSE NULLIF(CASE WHEN regexp_replace(tri_gia_don_hang_tong::text, '[^0-9.-]', '', 'g') ~ '^-?[0-9]+(\.[0-9]+)?$'
                     THEN regexp_replace(tri_gia_don_hang_tong::text, '[^0-9.-]', '', 'g') ELSE NULL END, '')::numeric
  END
);

ALTER TABLE tkbv_full ALTER COLUMN tri_gia_don_hang_tong_num SET EXPRESSION AS (
  CASE
    WHEN REPLACE(tri_gia_don_hang_tong::text, ',', '') ~ '^\s*-?[0-9]+(\.[0-9]+)?[eE][-+]?[0-9]+\s*$'
    THEN CASE WHEN tri_gia_don_hang_tong::text ~ '[eE][-+]?0*[0-9]{1,3}\s*$' THEN TRIM(REPLACE(tri_gia_don_hang_tong::text, ',', ''))::numeric END
    ELSE NULLIF(CASE WHEN regexp_replace(tri_gia_don_hang_tong::text, '[^0-9.-]', '', 'g') ~ '^-?[0-9]+(\.[0-9]+)?$'
                     THEN regexp_replace(tri_gia_don_hang_tong::text, '[^0-9.-]', '', 'g') ELSE NULL END, '')::numeric
  END
);

ALTER TABLE pthsp_full ALTER COLUMN tri_gia_don_hang_tong_num SET EXPRESSION AS (
  CASE
    WHEN REPLACE(tri_gia_don_hang_tong::text, ',', '') ~ '^\s*-?[0-9]+(\.[0-9]+)?[eE][-+]?[0-9]+\s*$'
    THEN CASE WHEN tri_gia_don_hang_tong::text ~ '[eE][-+]?0*[0-9]{1,3}\s*$' THEN TRIM(REPLACE(tri_gia_don_hang_tong::text, ',', ''))::numeric END
    ELSE NULLIF(CASE WHEN regexp_replace(tri_gia_don_hang_tong::text, '[^0-9.-]', '', 'g') ~ '^-?[0-9]+(\.[0-9]+)?$'
                     THEN regexp_replace(tri_gia_don_hang_tong::text, '[^0-9.-]', '', 'g') ELSE NULL END, '')::numeric
  END
);

ALTER TABLE nhap_kho ALTER COLUMN thanh_tien_nhap_kho_num SET EXPRESSION AS (
  CASE
    WHEN REPLACE(thanh_tien_nhap_kho::text, ',', '') ~ '^\s*-?[0-9]+(\.[0-9]+)?[eE][-+]?[0-9]+\s*$'
    THEN CASE WHEN thanh_tien_nhap_kho::text ~ '[eE][-+]?0*[0-9]{1,3}\s*$' THEN TRIM(REPLACE(thanh_tien_nhap_kho::text, ',', ''))::numeric END
    ELSE NULLIF(CASE WHEN regexp_replace(thanh_tien_nhap_kho::text, '[^0-9.-]', '', 'g') ~ '^-?[0-9]+(\.[0-9]+)?$'
                     THEN regexp_replace(thanh_tien_nhap_kho::text, '[^0-9.-]', '', 'g') ELSE NULL END, '')::numeric
  END
);

ALTER TABLE khsx ALTER COLUMN thanh_tien_ke_hoach_num SET EXPRESSION AS (
  CASE
    WHEN REPLACE(thanh_tien_ke_hoach::text, ',', '') ~ '^\s*-?[0-9]+(\.[0-9]+)?[eE][-+]?[0-9]+\s*$'
    THEN CASE WHEN thanh_tien_ke_hoach::text ~ '[eE][-+]?0*[0-9]{1,3}\s*$' THEN TRIM(REPLACE(thanh_tien_ke_hoach::text, ',', ''))::numeric END
    ELSE NULLIF(CASE WHEN regexp_replace(thanh_tien_ke_hoach::text, '[^0-9.-]', '', 'g') ~ '^-?[0-9]+(\.[0-9]+)?$'
                     THEN regexp_replace(thanh_tien_ke_hoach::text, '[^0-9.-]', '', 'g') ELSE NULL END, '')::numeric
  END
);

-- Hiện không có dòng e-notation (10/10/2026) nhưng sửa luôn cho đồng nhất:
ALTER TABLE khsx_nam ALTER COLUMN thanh_tien_ke_hoach_num SET EXPRESSION AS (
  CASE
    WHEN REPLACE(thanh_tien_ke_hoach::text, ',', '') ~ '^\s*-?[0-9]+(\.[0-9]+)?[eE][-+]?[0-9]+\s*$'
    THEN CASE WHEN thanh_tien_ke_hoach::text ~ '[eE][-+]?0*[0-9]{1,3}\s*$' THEN TRIM(REPLACE(thanh_tien_ke_hoach::text, ',', ''))::numeric END
    ELSE NULLIF(CASE WHEN regexp_replace(thanh_tien_ke_hoach::text, '[^0-9.-]', '', 'g') ~ '^-?[0-9]+(\.[0-9]+)?$'
                     THEN regexp_replace(thanh_tien_ke_hoach::text, '[^0-9.-]', '', 'g') ELSE NULL END, '')::numeric
  END
);

ALTER TABLE xuat_kho ALTER COLUMN so_luong_xuat_kho_num SET EXPRESSION AS (
  CASE
    WHEN REPLACE(so_luong_xuat_kho::text, ',', '') ~ '^\s*-?[0-9]+(\.[0-9]+)?[eE][-+]?[0-9]+\s*$'
    THEN CASE WHEN so_luong_xuat_kho::text ~ '[eE][-+]?0*[0-9]{1,3}\s*$' THEN TRIM(REPLACE(so_luong_xuat_kho::text, ',', ''))::numeric END
    ELSE NULLIF(CASE WHEN regexp_replace(so_luong_xuat_kho::text, '[^0-9.-]', '', 'g') ~ '^-?[0-9]+(\.[0-9]+)?$'
                     THEN regexp_replace(so_luong_xuat_kho::text, '[^0-9.-]', '', 'g') ELSE NULL END, '')::numeric
  END
);

ALTER TABLE ton_kho ALTER COLUMN gia_tri_num SET EXPRESSION AS (
  CASE
    WHEN REPLACE(gia_tri::text, ',', '') ~ '^\s*-?[0-9]+(\.[0-9]+)?[eE][-+]?[0-9]+\s*$'
    THEN CASE WHEN gia_tri::text ~ '[eE][-+]?0*[0-9]{1,3}\s*$' THEN TRIM(REPLACE(gia_tri::text, ',', ''))::numeric END
    ELSE NULLIF(CASE WHEN regexp_replace(gia_tri::text, '[^0-9.-]', '', 'g') ~ '^-?[0-9]+(\.[0-9]+)?$'
                     THEN regexp_replace(gia_tri::text, '[^0-9.-]', '', 'g') ELSE NULL END, '')::numeric
  END
);

UPDATE table_versions SET last_updated = NOW()
WHERE table_name IN ('dht', 'tkbv_full', 'pthsp_full', 'nhap_kho', 'khsx', 'khsx_nam', 'xuat_kho', 'ton_kho');

COMMIT;
