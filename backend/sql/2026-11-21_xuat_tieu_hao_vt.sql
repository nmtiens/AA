-- Xuất tiêu hao vật tư từ SAP MB51 (Module Vật tư, khía cạnh 3 "Xuất tiêu hao") — 21/11/2026.
-- Nguồn: 000_MASTER_DATA\14_XUAT_TIEU_HAO_SAP\01_DATA_XUAT_TIEU_HAO_SAP\Tmm.yyyy.xlsx (mỗi tháng 1 file, ~30 nghìn dòng).
-- Nạp bằng tool trên Drive: 003_PERSONAL\13_MR_TIEN\tieu-hao-vt\nap_tieu_hao.py (mặc định CHẠY KHÔ, --ghi mới ghi):
--   mỗi file đổi -> 1 giao dịch: DELETE các dòng nguon_file = <file> rồi COPY lại, cập nhật table_versions.
-- Quy ước (người dùng chốt 21/11/2026):
--   - Chỉ giữ Movement Type 261 (xuất cho lệnh SX), 262 (hoàn xuất 261), Z14 (xuất hao hụt).
--   - so_luong / gia_tri giữ DẤU NHƯ SAP: xuất (261, Z14) ÂM, hoàn (262) DƯƠNG.
--     TIÊU HAO = −SUM(261 + 262) (net); HAO HỤT = −SUM(Z14), hiện riêng; % hao hụt = Z14 / (261 net + Z14).
--   - gia_tri = Amt.in Loc.Cur. (VND) / 1e6 => TRIỆU ĐỒNG.
--   - so_luong theo đơn vị cơ sở (cột Quantity + Base Unit of Measure), không theo Unit of Entry.
--   - nhom_sap: mã nhóm SAP 3 số; nguon_nhom = nơi lấy (ban_vt_master / vat_tu / ZMM60 / MASTER_DATA / '-').
--     '-' = chưa phân nhóm.
--   - hex / ma_ct / phan_loai_nhom_sp: nối Order -> HEX như tool tong-hop-da (EXPORT_*.xlsx, 02_DATA_LSX_SAP,
--     nhap_kho.lenh_san_xuat) rồi production_status_app. Order có nhiều HEX: hex = 'H1, H2', ma_ct chỉ điền khi cùng CT.
-- Chạy một lần trên DB thật:  psql ... -f backend/sql/2026-11-21_xuat_tieu_hao_vt.sql
CREATE TABLE IF NOT EXISTS xuat_tieu_hao_vt (
  nam                 integer          NOT NULL,   -- Material Doc. Year
  so_ct               text             NOT NULL,   -- Material Document
  dong                integer          NOT NULL,   -- Material Doc.Item
  ngay                date             NOT NULL,   -- Posting Date
  thang               text             NOT NULL,   -- 'YYYY-MM' theo Posting Date
  ma_vat_tu           text             NOT NULL,   -- Material (chuỗi, giữ nguyên 11/12 số)
  ten_vat_tu          text,
  mvt                 text             NOT NULL,   -- '261' | '262' | 'Z14'
  so_luong            double precision,            -- Quantity (đơn vị cơ sở), dấu như SAP
  dvt                 text,                        -- Base Unit of Measure
  gia_tri             double precision,            -- TRIỆU đồng, dấu như SAP
  plant               text,
  sloc                text,
  xuong               text,                        -- Name 1 (tên plant / khối)
  order_sx            text,                        -- Order (lệnh sản xuất 10000xxxxx)
  sales_order         text,
  wbs                 text,
  hex                 text,
  ma_ct               text,
  phan_loai_nhom_sp   text,
  nhom_sap            text             NOT NULL DEFAULT '-',
  nguon_nhom          text,
  nguon_file          text             NOT NULL,   -- tên file tháng, vd 'T11.2026.xlsx'
  nguoi               text,                        -- User Name
  PRIMARY KEY (nam, so_ct, dong)
);
CREATE INDEX IF NOT EXISTS xuat_tieu_hao_vt_thang_idx     ON xuat_tieu_hao_vt (thang);
CREATE INDEX IF NOT EXISTS xuat_tieu_hao_vt_ma_idx        ON xuat_tieu_hao_vt (ma_vat_tu);
CREATE INDEX IF NOT EXISTS xuat_tieu_hao_vt_ct_idx        ON xuat_tieu_hao_vt (ma_ct);
CREATE INDEX IF NOT EXISTS xuat_tieu_hao_vt_nhom_thang_idx ON xuat_tieu_hao_vt (nhom_sap, thang);

INSERT INTO table_versions (table_name, last_updated)
SELECT 'xuat_tieu_hao_vt', now()
WHERE NOT EXISTS (SELECT 1 FROM table_versions WHERE table_name = 'xuat_tieu_hao_vt');
