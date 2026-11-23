-- Bảng GỘP của xuat_tieu_hao_vt (Module Vật tư, trang Xuất tiêu hao + cột tiêu hao bên Đặt – Mua) — 21/11/2026.
-- Lý do: trang /vat-tu/tieu-hao tính khoá k_* trên ~640 nghìn dòng gốc mỗi lượt (4–5 truy vấn × ~5 giây) => quá 15 giây,
--   HTTP 500. Bảng gộp ~150 nghìn dòng, khoá đã chuẩn hoá sẵn => mỗi truy vấn còn vài trăm ms.
-- 1 dòng = (thang, k_nhom, k_loai, k_ct, k_xuong, k_ma, k_dvt, chua_ghep), khoá chuẩn hoá Y HỆT sqlNguonTieuHao
--   (backend/src/routes/vatTu.ts):
--   k_nhom   : nguon_nhom 'BTP' / 'TP' => chính nó; còn lại mã nhóm SAP trước ' - ' của nhom_sap; trống => '-'
--   k_loai   : 'TH' = MvT 261 / 262 (tiêu hao), 'HH' = Z14 / Z15 (hao hụt)
--   k_ct     : upper(mã CT), trống => NULL (giao diện hiện '-' = chưa ghép)
--   k_xuong  : xuong, trống thì plant, trống nữa => '-'
--   k_ma     : mã vật tư bỏ số 0 đầu, trống => NULL;  k_dvt : ĐVT viết hoa, trống => NULL
--   chua_ghep: dòng không có cả mã CT lẫn HEX
--   ma_goc = MAX(mã gốc); ten_vat_tu = tên ở ngày mới nhất (hoà: tên lớn nhất), ngay_ten = ngày đó; phan_loai = MAX
--   th_gt / hh_gt (TRIỆU đồng) / th_sl / hh_sl: đã ĐỔI DẤU (xuất dương); sd / sd_th / sd_262 = số dòng chứng từ (tất cả / 261+262 / 262).
-- CÂU GỘP (SELECT bên dưới) là BẢN CHÉP của sqlGopTieuHao() trong backend/src/routes/vatTu.ts — nguồn duy nhất; tool nạp
--   003_PERSONAL\13_MR_TIEN\tieu-hao-vt\nap_tieu_hao.py (SQL_GOP) cũng chép y hệt. Sửa câu gộp thì sửa ở vatTu.ts rồi chép
--   sang 2 nơi này (backend/test/vatTu.test.ts so khớp file này với sqlGopTieuHao()).
-- Tool nạp: mỗi file tháng ghi xong bảng gốc thì xoá + gộp lại các tháng của file đó TRONG CÙNG giao dịch, cập nhật
--   table_versions 'xuat_tieu_hao_vt_gop' cùng lúc với 'xuat_tieu_hao_vt'. Backend chỉ đọc bảng gộp khi phiên bản bảng gộp
--   >= phiên bản bảng gốc (nạp bằng tool cũ => tự quay về đọc bảng gốc, chậm nhưng đúng).
-- Chạy MỘT lần trên DB thật (tạo + nạp đầy đủ từ bảng gốc, ~vài chục giây):
--   psql ... -f backend/sql/2026-11-21_xuat_tieu_hao_vt_gop.sql
-- Chạy lại bất cứ lúc nào để dựng lại toàn bộ bảng gộp từ bảng gốc.
BEGIN;
SET LOCAL statement_timeout = '600s';
SET LOCAL work_mem = '64MB';

CREATE TABLE IF NOT EXISTS xuat_tieu_hao_vt_gop (
  thang       text             NOT NULL,
  k_nhom      text             NOT NULL,
  k_loai      text             NOT NULL,   -- 'TH' (261/262) | 'HH' (Z14/Z15)
  k_ct        text,
  k_xuong     text             NOT NULL,
  k_ma        text,
  k_dvt       text,
  chua_ghep   boolean          NOT NULL,
  ma_goc      text,
  ten_vat_tu  text,
  ngay_ten    date,
  phan_loai   text,
  th_gt       double precision NOT NULL,
  hh_gt       double precision NOT NULL,
  th_sl       double precision NOT NULL,
  hh_sl       double precision NOT NULL,
  sd          integer          NOT NULL,
  sd_th       integer          NOT NULL,
  sd_262      integer          NOT NULL    -- số dòng hoàn trả 262 (tháng đầu có 262 = file MB51 mới)
);
CREATE INDEX IF NOT EXISTS xuat_tieu_hao_vt_gop_thang_idx      ON xuat_tieu_hao_vt_gop (thang);
CREATE INDEX IF NOT EXISTS xuat_tieu_hao_vt_gop_nhom_thang_idx ON xuat_tieu_hao_vt_gop (k_nhom, thang);
CREATE INDEX IF NOT EXISTS xuat_tieu_hao_vt_gop_ma_idx         ON xuat_tieu_hao_vt_gop (k_ma);

-- Nạp đầy đủ từ bảng gốc
DELETE FROM xuat_tieu_hao_vt_gop;
INSERT INTO xuat_tieu_hao_vt_gop (thang, k_nhom, k_loai, k_ct, k_xuong, k_ma, k_dvt, chua_ghep, ma_goc, ten_vat_tu,
                                  ngay_ten, phan_loai, th_gt, hh_gt, th_sl, hh_sl, sd, sd_th, sd_262)
SELECT x.thang,
       CASE WHEN btrim(x.nguon_nhom) IN ('BTP','TP') THEN btrim(x.nguon_nhom)
            ELSE COALESCE(NULLIF(split_part(btrim(x.nhom_sap), ' - ', 1), ''), '-') END AS k_nhom,
       CASE WHEN upper(btrim(x.mvt::text)) IN ('261','262') THEN 'TH' ELSE 'HH' END AS k_loai,
       upper(NULLIF(btrim(x.ma_ct), '')) AS k_ct,
       COALESCE(NULLIF(btrim(x.xuong), ''), NULLIF(btrim(x.plant::text), ''), '-') AS k_xuong,
       NULLIF(ltrim(btrim(x.ma_vat_tu::text), '0'), '') AS k_ma,
       NULLIF(upper(btrim(x.dvt)), '') AS k_dvt,
       (NULLIF(btrim(x.ma_ct), '') IS NULL AND NULLIF(btrim(x.hex), '') IS NULL) AS chua_ghep,
       MAX(btrim(x.ma_vat_tu::text)) AS ma_goc,
       (ARRAY_AGG(x.ten_vat_tu ORDER BY x.ngay DESC NULLS LAST, x.ten_vat_tu DESC NULLS LAST))[1] AS ten_vat_tu,
       MAX(x.ngay) AS ngay_ten,
       MAX(NULLIF(btrim(x.phan_loai_nhom_sp), '')) AS phan_loai,
       SUM(CASE WHEN upper(btrim(x.mvt::text)) IN ('261','262') THEN -COALESCE(x.gia_tri, 0) ELSE 0 END) AS th_gt,
       SUM(CASE WHEN upper(btrim(x.mvt::text)) IN ('Z14','Z15') THEN -COALESCE(x.gia_tri, 0) ELSE 0 END) AS hh_gt,
       SUM(CASE WHEN upper(btrim(x.mvt::text)) IN ('261','262') THEN -COALESCE(x.so_luong, 0) ELSE 0 END) AS th_sl,
       SUM(CASE WHEN upper(btrim(x.mvt::text)) IN ('Z14','Z15') THEN -COALESCE(x.so_luong, 0) ELSE 0 END) AS hh_sl,
       COUNT(*)::int AS sd,
       (COUNT(*) FILTER (WHERE upper(btrim(x.mvt::text)) IN ('261','262')))::int AS sd_th,
       (COUNT(*) FILTER (WHERE upper(btrim(x.mvt::text)) = '262'))::int AS sd_262
FROM xuat_tieu_hao_vt x
WHERE upper(btrim(x.mvt::text)) IN ('261','262','Z14','Z15')
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8;

-- Phiên bản: bảng gộp phải >= bảng gốc thì backend mới đọc bảng gộp
UPDATE table_versions SET last_updated = now() WHERE table_name = 'xuat_tieu_hao_vt_gop';
INSERT INTO table_versions (table_name, last_updated)
SELECT 'xuat_tieu_hao_vt_gop', now()
WHERE NOT EXISTS (SELECT 1 FROM table_versions WHERE table_name = 'xuat_tieu_hao_vt_gop');

COMMIT;
ANALYZE xuat_tieu_hao_vt_gop;
