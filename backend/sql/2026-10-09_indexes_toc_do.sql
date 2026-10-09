-- ============================================================================
-- INDEX TĂNG TỐC CÁC API TÍNH TOÁN (2026-10-09). Chạy TAY trên DB thật bằng psql (autocommit) —
-- CREATE INDEX CONCURRENTLY không chạy được trong transaction. Mọi lệnh đều IF NOT EXISTS, chạy lại không sao.
-- Không bắt buộc: code mới đã chạy đúng khi chưa có index; index giúp giảm thêm thời gian quét.
-- ============================================================================

-- Bảng sản xuất: mọi API nối theo hex::text (ghi chú, chi tiết HEX, NVL, vướng mắc, loại đơn HỦY)
-- -> trước chỉ có khoá chính, mỗi lần tra 1 HEX phải quét cả ~52k dòng.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_psa_hex_text ON production_status_app ((hex::text));
-- Tập HEX đã HỦY (dùng ở mọi biểu đồ / tổng quan để bỏ đơn hủy): index một phần, quét rất nhỏ
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_psa_hex_cancelled ON production_status_app ((hex::text))
  WHERE UPPER(COALESCE(tinh_trang_ipo, '')) LIKE '%HỦY%';
-- Tồn kho nối sản xuất qua ma_id_sap (stock/items, stock/dates có lọc xưởng)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_psa_ma_id_sap ON production_status_app (ma_id_sap);
-- Vật tư chung của công trình: khớp mã công trình (trackingno)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_psa_ma_cong_trinh ON production_status_app ((UPPER(TRIM(ma_cong_trinh))));

-- Vật tư: tra theo số PR (chi tiết PR, tổng dòng / hex của PR) và mã công trình
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vat_tu_so_pr ON vat_tu (so_pr);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vat_tu_trackingno ON vat_tu ((UPPER(TRIM(trackingno))));

-- Tồn kho: lọc theo ngày rồi nối mã SAP
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ton_kho_date_sap ON ton_kho (date_parsed, ma_id_sap);
-- KHSX: tập HEX có kế hoạch theo kỳ (khsx-nhapkho/summary)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_khsx_hex ON khsx (hex);
-- Vướng mắc: nối hex dạng text
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vuong_mac_hex_resolved ON vuong_mac (hex, is_resolved);

-- Cập nhật thống kê để planner chọn đúng kế hoạch (trên dev, ước lượng tập HỦY lệch ~90 lần)
ANALYZE production_status_app;
ANALYZE vat_tu;
ANALYZE nhap_kho;
ANALYZE ton_kho;
ANALYZE dht;
ANALYZE khsx;
