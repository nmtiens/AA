-- ============================================================================
-- production_status_app.ma_id_sap: double precision -> text
--
-- Vì sao: cột đang lưu kiểu số thực (double), chỉ giữ ~15-16 chữ số.
--   - Mã 12 số (300000000006 … 300001029661, khớp bảng ton_kho) vẫn đúng.
--   - 13.547 dòng có mã 18 số (3.0000000000012154e+17 …) đã MẤT chữ số cuối khi nạp:
--     nhiều mã khác nhau bị gộp thành 1 (13.547 dòng chỉ còn 417 giá trị) — không khôi phục được
--     từ DB, phải nạp lại từ nguồn sau khi sửa ETL (đọc cột này dạng chuỗi).
--   - Hiển thị / so khớp ::text ra dạng khoa học "3.0000000000018675e+17".
--
-- Code backend luôn so khớp ma_id_sap qua ::text nên đổi kiểu không ảnh hưởng truy vấn.
--
-- LƯU Ý QUAN TRỌNG: nếu ETL nạp bảng bằng kiểu "xoá rồi tạo lại bảng" (vd pandas to_sql(if_exists='replace'))
-- thì kiểu cột sẽ bị tạo lại thành double ở lần nạp sau => phải sửa ETL (khai báo cột này là text / đọc
-- dtype=str) TRƯỚC hoặc CÙNG LÚC với file này.
--
-- Chạy 1 lần, ngoài giờ (ghi lại toàn bộ bảng, khoá bảng trong lúc chạy).
-- ============================================================================

BEGIN;

ALTER TABLE production_status_app
  ALTER COLUMN ma_id_sap TYPE text
  USING CASE
    WHEN ma_id_sap IS NULL THEN NULL
    -- Qua chuỗi trước (float8 -> text cho đủ 17 chữ số có nghĩa) rồi mới ra numeric: ép thẳng
    -- float8::numeric làm tròn còn 15 chữ số => mã 18 số bị gộp thêm (đã xảy ra: 417 giá trị còn 59)
    ELSE ma_id_sap::text::numeric::numeric(30, 0)::text
  END;

COMMIT;

-- Kiểm tra sau khi chạy:
-- SELECT LENGTH(ma_id_sap) AS so_chu_so, COUNT(*) FROM production_status_app GROUP BY 1 ORDER BY 1;
--   => 12 chữ số: ~38.351 dòng; 18 chữ số: 13.547 dòng (chờ nạp lại từ nguồn); NULL: 234
