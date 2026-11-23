-- Lịch sử nhận hàng vật tư (người dùng đồng ý 21/11/2026).
-- Bảng vat_tu chỉ có số ĐÃ NHẬN luỹ kế và bị nạp lại toàn bộ (TRUNCATE) mỗi lượt vat_tu.py chạy (7h/12h/18h),
-- nên không biết hàng về NGÀY NÀO. Mỗi lượt nạp, vat_tu.py chụp thêm vào đây các dòng PR (so_pr + pr_line)
-- MỚI XUẤT HIỆN hoặc ĐỔI số đã nhận / trạng thái SAP / ngày dự kiến / số PO / SL yêu cầu so với lần chụp gần nhất.
--   so_luong_tang = số đã nhận lần này − lần chụp trước (dòng mới: − 0). NULL ở lượt chụp đầu tiên (mốc nền,
--   không biết về lúc nào). Hàng về trong kỳ = SUM(so_luong_tang > 0) theo chup_luc.
-- Chạy một lần trên DB thật:  psql ... -f backend/sql/2026-11-21_vat_tu_nhan_ls.sql
CREATE TABLE IF NOT EXISTS vat_tu_nhan_ls (
  id                bigserial PRIMARY KEY,
  chup_luc          timestamptz      NOT NULL DEFAULT now(),
  so_pr             bigint           NOT NULL,
  pr_line           integer          NOT NULL,
  ma_vat_tu         text,
  so_po             bigint,
  nhom_vt           text,
  trackingno        text,
  dvt               text,
  so_luong_yeu_cau  double precision,
  so_luong_da_nhan  double precision NOT NULL DEFAULT 0,
  so_luong_tang     double precision,
  trang_thai_sap    text,
  ngay_du_kien      date,
  ngay_thuc_te_ve   date,
  don_gia           double precision,
  lan_dau           boolean          NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS vat_tu_nhan_ls_dong_idx ON vat_tu_nhan_ls (so_pr, pr_line, chup_luc DESC, id DESC);
CREATE INDEX IF NOT EXISTS vat_tu_nhan_ls_chup_idx ON vat_tu_nhan_ls (chup_luc);
CREATE INDEX IF NOT EXISTS vat_tu_nhan_ls_ma_idx   ON vat_tu_nhan_ls (ma_vat_tu);

INSERT INTO table_versions (table_name, last_updated)
SELECT 'vat_tu_nhan_ls', now()
WHERE NOT EXISTS (SELECT 1 FROM table_versions WHERE table_name = 'vat_tu_nhan_ls');
