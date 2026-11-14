-- Chỉ mục cho các câu nối bảng nhập kho theo HEX dạng chữ (hex::text):
--   KH kỳ đã đạt (routes/data.ts, routes/vuongMac.ts planMetOf), KHSX (routes/khsx.ts), Xưởng (xuongKeHoach, xuongBaoCao, nhapDu).
-- Đo 14/11/2026 (chỉ đọc): nhap_kho ~92,6 nghìn dòng / 45 MB; câu lọc hex::text = ANY(...) hiện phải đọc CẢ chỉ mục
-- idx_nhap_kho_hex (Index Only Scan + Filter, cost ~3459) vì chỉ mục đó lập trên cột hex (số), không phải hex::text.
-- CONCURRENTLY: không khoá ghi bảng trong lúc tạo; PHẢI chạy ngoài giao dịch (1 lệnh riêng). Chạy trên DB CHÍNH (Layerbase).
-- ĐÃ CHẠY trên DB thật 14/11/2026 (tạo 0,6 giây, 2 MB, hợp lệ): câu thử 6 HEX từ 27,3 ms (đọc cả chỉ mục cũ) xuống 0,04 ms.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nhap_kho_hex_text ON nhap_kho ((hex::text));
ANALYZE nhap_kho;

-- Kiểm sau khi chạy: indisvalid phải là true (false = tạo dở, DROP INDEX CONCURRENTLY idx_nhap_kho_hex_text rồi chạy lại)
-- SELECT c.relname, i.indisvalid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = 'idx_nhap_kho_hex_text';
