-- ============================================================================
-- MỤC XƯỞNG — NẠP DANH MỤC TỪ MRA (sinh bởi C:\data mra\tao_danh_muc_xuong.py, 2026-10-12)
-- Chạy SAU 2026-10-12_xuong.sql. Chạy lại an toàn (không xoá gì). Chỉ 4 câu lệnh (tránh giới hạn số câu của trang Query).
-- 97 công đoạn chi tiết; mỗi công đoạn một tổ (tên tổ = tên công đoạn). Gộp / tách tổ ở thẻ Xưởng.
-- Tổ trưởng: gán theo users.msnv khi tài khoản đã có; xem danh sách cuối file để tạo tài khoản + cấp quyền 'xuong'.
-- ============================================================================

INSERT INTO xuong_cong_doan (id, xuong, ten_cd, cd_tach_ma, cd_chi_tiet, thu_tu, la_bao_bi) VALUES
  ('CD2400093', '2A', '2A-MÁY', '1.Ép laminate + 4.Dán', 'DÁN CẠNH', 1, false),
  ('CD2400008', '2A', '2A-MÁY', '1.Ép laminate + 4.Dán', 'LAMINATE', 1, false),
  ('CD2400094', '2A', '2A-MÁY', '2.Ép ván', 'ÉP NGUỘI', 2, false),
  ('CD2400010', '2A', '2A-MÁY', '2.Ép ván', 'TUBI', 2, false),
  ('CD2400009', '2A', '2A-MÁY', '3.Máy Panel', 'CẮT', 3, false),
  ('CD2400007', '2A', '2A-MÁY', '5.CNC', 'CNC X2', 5, false),
  ('CD2400006', '2A', '2A-MỘC', '6.Lắp ráp', 'LẮP RÁP 10', 6, false),
  ('CD2400004', '2A', '2A-MỘC', '6.Lắp ráp', 'LẮP RÁP 7', 6, false),
  ('CD2400005', '2A', '2A-MỘC', '6.Lắp ráp', 'LẮP RÁP 8', 6, false),
  ('CD2400003', '2A', '2A-MỘC', '6.Lắp ráp', 'LẮP RÁP 9', 6, false),
  ('CD2400002', '2A', '2A-MỘC', '6.Lắp ráp', 'SƠN', 6, false),
  ('CD2400098', '2A', '2A-MỘC', '6.Lắp ráp', 'SORTING', 6, false),
  ('CD2400086', '2A', 'GIAO NHẬN', 'GIAO NHẬN', 'GN-XƯỞNG 2A', 0, false),
  ('CD2400081', '2B', '2B-VÁN LẠNG', '1.Ván lạng', 'ÉP NÓNG', 1, false),
  ('CD2400097', '2B', '2B-VÁN LẠNG', '1.Ván lạng', 'ÉP NÓNG 2', 1, false),
  ('CD2400079', '2B', '2B-VÁN LẠNG', '1.Ván lạng', 'VÁN LẠNG CT', 1, false),
  ('CD2400080', '2B', '2B-VÁN LẠNG', '1.Ván lạng', 'VÁN LẠNG OEM', 1, false),
  ('CD2400087', '2B', 'GIAO NHẬN', 'GIAO NHẬN', 'GN-XƯỞNG 2B', 0, false),
  ('CD2400048', '3A', '3A-CTS', '1.Máy tấm', 'CTS GỖ 2', 1, false),
  ('CD2400015', '3A', '3A-CTS', '1.Máy tấm', 'CTS TẤM 1', 1, false),
  ('CD2400011', '3A', '3A-VECNI', '1.Vecni', 'VECNI 5', 1, false),
  ('CD2400012', '3A', '3A-VECNI', '1.Vecni', 'VECNI 6', 1, false),
  ('CD2400083', '3A', '3A-MỘC', '2.Máy tinh', 'CNC X3', 2, false),
  ('CD2400017', '3A', '3A-MÁY', '2.Máy tinh', 'TINH GỖ', 2, false),
  ('CD2400016', '3A', '3A-MÁY', '2.Máy tinh', 'TINH TẤM', 2, false),
  ('CD2400018', '3A', '3A-MÁY', '3.Mộc X.Mộc đặc thù', 'CHÀ NHÁM GỖ', 3, false),
  ('CD2400022', '3A', '3A-MỘC', '3.Mộc X.Mộc đặc thù', 'CHÀ NHÁM TRẮNG X3', 3, false),
  ('CD2400013', '3A', '3A-VECNI', '3.Mộc X.Mộc đặc thù', 'UV', 3, false),
  ('CD2400085', '3A', '3A-FITTING', '4.Fitting', 'DẶM VÁ 1 X3', 4, false),
  ('CD2400014', '3A', '3A-FITTING', '4.Fitting', 'FITTING + DẶM VÁ', 4, false),
  ('CD2400019', '3A', '3A-MỘC', '4.Fitting', 'LẮP RÁP 1', 4, false),
  ('CD2400020', '3A', '3A-MỘC', '4.Fitting', 'LẮP RÁP 2', 4, false),
  ('CD2400021', '3A', '3A-MỘC', '4.Fitting', 'LẮP RÁP 3', 4, false),
  ('CD2400096', '3A', '3A-MỘC', '4.Fitting', 'LẮP RÁP 4', 4, false),
  ('CD2400100', '3A', '3A-MỘC', '4.Fitting', 'LẮP RÁP 5', 4, false),
  ('CD2400088', '3A', 'GIAO NHẬN', 'GIAO NHẬN', 'GN-XƯỞNG 3A', 0, false),
  ('CD2400047', '4A', '4A-CTS', '1.Cut to size', 'CTS GỖ 1', 1, false),
  ('CD2400034', '4A', '4A-MỘC', '1.Cut to size', 'CTS TẤM 2', 1, false),
  ('CD2400027', '4A', '4A-VECNI', '1.Vecni', 'VECNI 3', 1, false),
  ('CD2400026', '4A', '4A-VECNI', '1.Vecni', 'VECNI 4', 1, false),
  ('CD2400023', '4A', '4A-VECNI', '1.Vecni', 'VECNI CHUYỀN A', 1, false),
  ('CD2400030', '4A', '4A-VECNI', '1.Vecni', 'VECNI CHUYỀN B', 1, false),
  ('CD2400024', '4A', '4A-VECNI', '1.Vecni', 'VECNI CHUYỀN B', 1, false),
  ('CD2400084', '4A', '4A-MỘC', '2.Máy tinh', 'CNC MẪU X4', 2, false),
  ('CD2400033', '4A', '4A-MỘC', '2.Máy tinh', 'CNC X4', 2, false),
  ('CD2400043', '4A', '4A-MÁY', '2.Máy tinh', 'MÁY TINH GỖ 1', 2, false),
  ('CD2400044', '4A', '4A-MÁY', '2.Máy tinh', 'MÁY TINH GỖ 2', 2, false),
  ('CD2400045', '4A', '4A-MÁY', '2.Máy tinh', 'MÁY TINH GỖ 3', 2, false),
  ('CD2400046', '4A', '4A-MÁY', '2.Máy tinh', 'MÁY TINH TẤM', 2, false),
  ('CD2400031', '4A', '4A-MỘC', '3.Mộc', 'CHÀ NHÁM TRẮNG X4', 3, false),
  ('CD2400032', '4A', '4A-MỘC', '3.Mộc', 'CHẠM', 3, false),
  ('CD2400035', '4A', '4A-MỘC', '3.Mộc', 'MỘC 1', 3, false),
  ('CD2400036', '4A', '4A-MỘC', '3.Mộc', 'MỘC 2', 3, false),
  ('CD2400037', '4A', '4A-MỘC', '3.Mộc', 'MỘC 5', 3, false),
  ('CD2400038', '4A', '4A-MỘC', '3.Mộc', 'MỘC 6', 3, false),
  ('CD2400039', '4A', '4A-MỘC', '3.Mộc', 'MỘC 7', 3, false),
  ('CD2400041', '4A', '4A-MỘC', '3.Mộc', 'MỘC MẪU 2', 3, false),
  ('CD2400042', '4A', '4A-MỘC', '3.Mộc', 'MỘC MẪU 4', 3, false),
  ('CD2400040', '4A', '4A-MỘC', '3.Mộc', 'MỘC MẪU 5', 3, false),
  ('CD2400029', '4A', '4A-FITTING', '4.Fitting', 'DẶM VÁ 1', 4, false),
  ('CD2400025', '4A', '4A-FITTING', '4.Fitting', 'DẶM VÁ 2', 4, false),
  ('CD2400028', '4A', '4A-FITTING', '4.Fitting', 'FITTING X4', 4, false),
  ('CD2400077', '4A', '4A-BAO BÌ', 'BAO BÌ', 'BAO BÌ', 0, true),
  ('CD2400089', '4A', 'GIAO NHẬN', 'GIAO NHẬN', 'GN-XƯỞNG 4A', 0, false),
  ('CD2400049', '5A', '5A-MỘC', '1.Máy', 'CẮT KHUNG', 1, false),
  ('CD2400052', '5A', '5A-MỘC', '2.Mộc', 'MỘC SOFA 1', 2, false),
  ('CD2400050', '5A', '5A-MỘC', '2.Mộc', 'MỘC SOFA 2', 2, false),
  ('CD2400051', '5A', '5A-MỘC', '2.Mộc', 'MỘC SOFA 4', 2, false),
  ('CD2400095', '5A', '5A-MỘC', '2.Mộc', 'MỘC SOFA 5', 2, false),
  ('CD2400099', '5A', '5A-SOFA', '3.May', 'CẮT DA VẢI', 3, false),
  ('CD2400060', '5A', '5A-SOFA', '3.May', 'MAY_01', 3, false),
  ('CD2400061', '5A', '5A-SOFA', '3.May', 'MAY_02', 3, false),
  ('CD2400062', '5A', '5A-SOFA', '3.May', 'MAY_03+CẮT', 3, false),
  ('CD2400059', '5A', '5A-SOFA', '4.Đan mây', 'ĐAN MÂY', 4, false),
  ('CD2400058', '5A', '5A-SOFA', '5.Bọc nệm, lắp ráp phụ kiện', 'BỌC NỆM 1', 5, false),
  ('CD2400057', '5A', '5A-SOFA', '5.Bọc nệm, lắp ráp phụ kiện', 'BỌC NỆM 2', 5, false),
  ('CD2400055', '5A', '5A-SOFA', '5.Bọc nệm, lắp ráp phụ kiện', 'BỌC NỆM 3', 5, false),
  ('CD2400054', '5A', '5A-SOFA', '5.Bọc nệm, lắp ráp phụ kiện', 'BỌC NỆM 4', 5, false),
  ('CD2400064', '5A', '5A-FITTING', '5.Bọc nệm, lắp ráp phụ kiện', 'DÁN MOUSSE HÀNG LOẠT', 5, false),
  ('CD2400063', '5A', '5A-SOFA', '5.Bọc nệm, lắp ráp phụ kiện', 'DÁN MOUSSE MẪU LẺ', 5, false),
  ('CD2400065', '5A', '5A-FITTING', '5.Bọc nệm, lắp ráp phụ kiện', 'FITTING X5', 5, false),
  ('CD2400053', '5A', '5A-MỘC', '5.Bọc nệm, lắp ráp phụ kiện', 'MỘC SOFA 3', 5, false),
  ('CD2400090', '5A', 'GIAO NHẬN', 'GIAO NHẬN', 'GN-XƯỞNG 5A', 0, false),
  ('CD2400072', '8AB', '8AB-KIM LOẠI', '1.Sản xuất phôi, CNC, Inplay', 'PHÔI ĐỊNH HÌNH', 1, false),
  ('CD2400071', '8AB', '8AB-KIM LOẠI', '1.Sản xuất phôi, CNC, Inplay', 'PHÔI TẤM INLAY', 1, false),
  ('CD2400066', '8AB', '8AB-KIM LOẠI', '2.Hàn + công trình', 'HÀN1', 2, false),
  ('CD2400067', '8AB', '8AB-KIM LOẠI', '2.Hàn + công trình', 'HÀN2', 2, false),
  ('CD2400074', '8AB', '8AB-KIM LOẠI', '3.Nguội + đồng nhôm', 'ĐỒNG NHÔM', 3, false),
  ('CD2400068', '8AB', '8AB-KIM LOẠI', '3.Nguội + đồng nhôm', 'NGUỘI 1', 3, false),
  ('CD2400069', '8AB', '8AB-KIM LOẠI', '3.Nguội + đồng nhôm', 'NGUỘI 2', 3, false),
  ('CD2400073', '8AB', '8AB-KIM LOẠI', '3.Nguội + đồng nhôm', 'RESIN', 3, false),
  ('CD2400070', '8AB', '8AB-KIM LOẠI', '4.PVD, Fitting, Đóng gói', 'PVD', 4, false),
  ('CD2400091', '8AB', 'GIAO NHẬN', 'GIAO NHẬN', 'GN-XƯỞNG 8AB', 0, false),
  ('CD2400076', '8C', '8C-KÍNH', '1.Cắt và hoàn thiện kính', 'KÍNH', 1, false),
  ('CD2400078', '8C', '8C-ĐÁ', '2.Sản xuất phôi đá', 'CTS ĐÁ', 2, false),
  ('CD2400075', '8C', '8C-ĐÁ', '3.Hoàn thiện đá', 'ĐÁ', 3, false),
  ('CD2400092', '8C', 'GIAO NHẬN', 'GIAO NHẬN', 'GN-XƯỞNG 8C', 0, false)
ON CONFLICT (id) DO UPDATE SET xuong = EXCLUDED.xuong, ten_cd = EXCLUDED.ten_cd, cd_tach_ma = EXCLUDED.cd_tach_ma,
  cd_chi_tiet = EXCLUDED.cd_chi_tiet, thu_tu = EXCLUDED.thu_tu, la_bao_bi = EXCLUDED.la_bao_bi;

-- Một tổ cho mỗi công đoạn chi tiết
INSERT INTO xuong_to (xuong, ten_to)
SELECT xuong, cd_chi_tiet FROM xuong_cong_doan WHERE id IN ('CD2400093', 'CD2400008', 'CD2400094', 'CD2400010', 'CD2400009', 'CD2400007', 'CD2400006', 'CD2400004', 'CD2400005', 'CD2400003', 'CD2400002', 'CD2400098', 'CD2400086', 'CD2400081', 'CD2400097', 'CD2400079', 'CD2400080', 'CD2400087', 'CD2400048', 'CD2400015', 'CD2400011', 'CD2400012', 'CD2400083', 'CD2400017', 'CD2400016', 'CD2400018', 'CD2400022', 'CD2400013', 'CD2400085', 'CD2400014', 'CD2400019', 'CD2400020', 'CD2400021', 'CD2400096', 'CD2400100', 'CD2400088', 'CD2400047', 'CD2400034', 'CD2400027', 'CD2400026', 'CD2400023', 'CD2400030', 'CD2400024', 'CD2400084', 'CD2400033', 'CD2400043', 'CD2400044', 'CD2400045', 'CD2400046', 'CD2400031', 'CD2400032', 'CD2400035', 'CD2400036', 'CD2400037', 'CD2400038', 'CD2400039', 'CD2400041', 'CD2400042', 'CD2400040', 'CD2400029', 'CD2400025', 'CD2400028', 'CD2400077', 'CD2400089', 'CD2400049', 'CD2400052', 'CD2400050', 'CD2400051', 'CD2400095', 'CD2400099', 'CD2400060', 'CD2400061', 'CD2400062', 'CD2400059', 'CD2400058', 'CD2400057', 'CD2400055', 'CD2400054', 'CD2400064', 'CD2400063', 'CD2400065', 'CD2400053', 'CD2400090', 'CD2400072', 'CD2400071', 'CD2400066', 'CD2400067', 'CD2400074', 'CD2400068', 'CD2400069', 'CD2400073', 'CD2400070', 'CD2400091', 'CD2400076', 'CD2400078', 'CD2400075', 'CD2400092')
ON CONFLICT (xuong, ten_to) DO NOTHING;

INSERT INTO xuong_to_cong_doan (to_id, cong_doan_id)
SELECT t.id, c.id FROM xuong_cong_doan c JOIN xuong_to t ON t.xuong = c.xuong AND t.ten_to = c.cd_chi_tiet
WHERE c.id IN ('CD2400093', 'CD2400008', 'CD2400094', 'CD2400010', 'CD2400009', 'CD2400007', 'CD2400006', 'CD2400004', 'CD2400005', 'CD2400003', 'CD2400002', 'CD2400098', 'CD2400086', 'CD2400081', 'CD2400097', 'CD2400079', 'CD2400080', 'CD2400087', 'CD2400048', 'CD2400015', 'CD2400011', 'CD2400012', 'CD2400083', 'CD2400017', 'CD2400016', 'CD2400018', 'CD2400022', 'CD2400013', 'CD2400085', 'CD2400014', 'CD2400019', 'CD2400020', 'CD2400021', 'CD2400096', 'CD2400100', 'CD2400088', 'CD2400047', 'CD2400034', 'CD2400027', 'CD2400026', 'CD2400023', 'CD2400030', 'CD2400024', 'CD2400084', 'CD2400033', 'CD2400043', 'CD2400044', 'CD2400045', 'CD2400046', 'CD2400031', 'CD2400032', 'CD2400035', 'CD2400036', 'CD2400037', 'CD2400038', 'CD2400039', 'CD2400041', 'CD2400042', 'CD2400040', 'CD2400029', 'CD2400025', 'CD2400028', 'CD2400077', 'CD2400089', 'CD2400049', 'CD2400052', 'CD2400050', 'CD2400051', 'CD2400095', 'CD2400099', 'CD2400060', 'CD2400061', 'CD2400062', 'CD2400059', 'CD2400058', 'CD2400057', 'CD2400055', 'CD2400054', 'CD2400064', 'CD2400063', 'CD2400065', 'CD2400053', 'CD2400090', 'CD2400072', 'CD2400071', 'CD2400066', 'CD2400067', 'CD2400074', 'CD2400068', 'CD2400069', 'CD2400073', 'CD2400070', 'CD2400091', 'CD2400076', 'CD2400078', 'CD2400075', 'CD2400092')
ON CONFLICT DO NOTHING;

-- Tổ trưởng: gán khi users.msnv khớp (tổ chưa có tổ trưởng). Một công đoạn nhiều tổ trưởng: lấy người đầu tiên.
UPDATE xuong_to t SET to_truong_user_id = u.id
FROM (VALUES
  ('2A', 'CNC X2', 'AAF7622'),
  ('2A', 'CẮT', 'AAF7615'),
  ('2A', 'DÁN CẠNH', 'AAF7684'),
  ('2A', 'LAMINATE', 'AAF7684'),
  ('2A', 'LẮP RÁP 10', 'AAF5541'),
  ('2A', 'LẮP RÁP 7', 'AAF7625'),
  ('2A', 'LẮP RÁP 8', 'AAF7605'),
  ('2A', 'LẮP RÁP 9', 'AAF0226'),
  ('2A', 'SƠN', 'AAF13577'),
  ('2A', 'TUBI', 'AAF4213'),
  ('2A', 'ÉP NGUỘI', 'AAF7615'),
  ('2B', 'VÁN LẠNG CT', 'AAF1296'),
  ('2B', 'VÁN LẠNG OEM', 'AAF6979'),
  ('2B', 'ÉP NÓNG', 'AAF3965'),
  ('2B', 'ÉP NÓNG 2', 'AAF0569'),
  ('3A', 'CHÀ NHÁM GỖ', 'AAF7096'),
  ('3A', 'CHÀ NHÁM TRẮNG X3', 'AAF0222'),
  ('3A', 'CNC X3', 'AAF7242'),
  ('3A', 'CTS GỖ 2', 'AAF7185'),
  ('3A', 'CTS TẤM 1', 'AAF3951'),
  ('3A', 'DẶM VÁ 1 X3', 'AAF7562'),
  ('3A', 'FITTING + DẶM VÁ', 'AAF3931'),
  ('3A', 'LẮP RÁP 1', 'AAF7091'),
  ('3A', 'LẮP RÁP 2', 'AAF3828'),
  ('3A', 'LẮP RÁP 3', 'AAF5638'),
  ('3A', 'LẮP RÁP 4', 'AAF11445'),
  ('3A', 'TINH GỖ', 'AAF4856'),
  ('3A', 'TINH TẤM', 'AAF2319'),
  ('3A', 'UV', 'AAF7461'),
  ('3A', 'VECNI 6', 'AAF10940'),
  ('4A', 'CHÀ NHÁM TRẮNG X4', 'AAF0803'),
  ('4A', 'CHẠM', 'AAF2297'),
  ('4A', 'CNC MẪU X4', 'AAF10691'),
  ('4A', 'CNC X4', 'AAF2757'),
  ('4A', 'CTS GỖ 1', 'AAF5552'),
  ('4A', 'CTS TẤM 2', 'AAF0427'),
  ('4A', 'DẶM VÁ 1', 'AAF1143'),
  ('4A', 'DẶM VÁ 2', 'AAF0680'),
  ('4A', 'FITTING X4', 'AAF2267'),
  ('4A', 'MÁY TINH GỖ 1', 'AAF11724'),
  ('4A', 'MÁY TINH GỖ 2', 'AAF1151'),
  ('4A', 'MÁY TINH GỖ 3', 'AAF1156'),
  ('4A', 'MÁY TINH TẤM', 'AAF0563'),
  ('4A', 'MỘC 1', 'AAF0469'),
  ('4A', 'MỘC 2', 'AAF0355'),
  ('4A', 'MỘC 5', 'AAF0852'),
  ('4A', 'MỘC 6', 'AAF0229'),
  ('4A', 'MỘC 7', 'AAF0230'),
  ('4A', 'MỘC MẪU 2', 'AAF0615'),
  ('4A', 'MỘC MẪU 4', 'AAF4152'),
  ('4A', 'MỘC MẪU 5', 'AAF5827'),
  ('4A', 'VECNI 3', 'AAF0240'),
  ('4A', 'VECNI 4', 'AAF0685'),
  ('4A', 'VECNI CHUYỀN A', 'AAF0697'),
  ('4A', 'VECNI CHUYỀN B', 'AAF0709'),
  ('5A', 'BỌC NỆM 1', 'AAF2766'),
  ('5A', 'BỌC NỆM 2', 'AAF7306'),
  ('5A', 'BỌC NỆM 3', 'AAF11701'),
  ('5A', 'BỌC NỆM 4', 'AAF4371'),
  ('5A', 'CẮT KHUNG', 'AAF11413'),
  ('5A', 'DÁN MOUSSE HÀNG LOẠT', 'AAF6699'),
  ('5A', 'DÁN MOUSSE MẪU LẺ', 'AAF0276'),
  ('5A', 'FITTING X5', 'AAF7876'),
  ('5A', 'MAY_02', 'AAF7198'),
  ('5A', 'MAY_03+CẮT', 'AAF1557'),
  ('5A', 'MỘC SOFA 1', 'AAF4740'),
  ('5A', 'MỘC SOFA 2', 'AAF4732'),
  ('5A', 'MỘC SOFA 3', 'AAF4056'),
  ('5A', 'MỘC SOFA 4', 'AAF5193'),
  ('5A', 'MỘC SOFA 5', 'AAF0308'),
  ('5A', 'ĐAN MÂY', 'AAF6712'),
  ('8AB', 'NGUỘI 1', 'AAF1003'),
  ('8AB', 'NGUỘI 2', 'AAF0990'),
  ('8AB', 'PHÔI TẤM INLAY', 'AAF4686'),
  ('8AB', 'PHÔI ĐỊNH HÌNH', 'AAF12570'),
  ('8AB', 'PVD', 'AAF5842'),
  ('8AB', 'RESIN', 'AAF7158'),
  ('8AB', 'ĐỒNG NHÔM', 'AAF0278'),
  ('8C', 'CTS ĐÁ', 'AAF13009'),
  ('8C', 'KÍNH', 'AAF11533'),
  ('8C', 'ĐÁ', 'AAF6704')
) AS g(xuong, ten_to, msnv)
JOIN users u ON upper(trim(u.msnv)) = upper(g.msnv)
WHERE t.xuong = g.xuong AND upper(t.ten_to) = g.ten_to AND t.to_truong_user_id IS NULL;

-- ----------------------------------------------------------------------------
-- DANH SÁCH TỔ TRƯỞNG MRA (cần tài khoản project_v2 có msnv + quyền 'xuong')
-- xưởng | công đoạn | họ tên | mã NV | ghi chú
--  | TEST | TRẦN THANH NHÃ | AAF11655 | công đoạn không có trong danh mục MRA
-- 2A | CNC X2 | LÂM THANH HUY | AAF7622 | 
-- 2A | CẮT | NGÔ VĂN NHANH | AAF7615 | 
-- 2A | DÁN CẠNH | DANH HÀ QUY | AAF7684 | 
-- 2A | LAMINATE | DANH HÀ QUY | AAF7684 | 
-- 2A | LẮP RÁP 10 | HUỲNH THÁI NGUYÊN | AAF5541 | 
-- 2A | LẮP RÁP 7 | NGUYỄN MINH VƯƠNG | AAF7625 | 
-- 2A | LẮP RÁP 8 | NGUYỄN ANH TUẤN | AAF7605 | 
-- 2A | LẮP RÁP 9 | HOÀNG THẮNG | AAF0226 | 
-- 2A | SORTING | NGUYỄN VĂN ĐẠT | AAF 5639 | mã NV thiếu / sai
-- 2A | SƠN | NGUYỄN MINH TRƯỜNG | AAF13577 | 
-- 2A | TUBI | NGUYỄN PHÁT ĐẠT | AAF4213 | 
-- 2A | ÉP NGUỘI | NGÔ VĂN NHANH | AAF7615 | 
-- 2B | VÁN LẠNG CT | NGUYỄN TRẦN DƯƠNG THÙY HUỆ | AAF1296 | 
-- 2B | VÁN LẠNG OEM | NGUYỄN THỊ KIM QUYÊN | AAF6979 | 
-- 2B | ÉP NÓNG | ĐẶNG CHÍ CƯỜNG | AAF3965 | 
-- 2B | ÉP NÓNG 2 | NGUYỄN VĂN PHÚC | AAF0569 | 
-- 3A | CHÀ NHÁM GỖ | LÊ TRỌNG NGUYỆN | AAF7096 | 
-- 3A | CHÀ NHÁM TRẮNG X3 | TRẦN QUANG TÂM | AAF0222 | 
-- 3A | CNC X3 | PHẠM THANH TÚ | AAF7242 | 2 tổ trưởng cùng công đoạn
-- 3A | CNC X3 | PHÙNG KHẮC NGUYÊN | AAF7419 | 2 tổ trưởng cùng công đoạn
-- 3A | CTS GỖ 2 | NGUYỄN VĂN CƯỜNG | AAF7185 | 
-- 3A | CTS TẤM 1 | PHẠM HỮU ĐỨC | AAF3951 | 2 tổ trưởng cùng công đoạn
-- 3A | CTS TẤM 1 | PHẠM HỮU ĐỨC | AAF7195 | 2 tổ trưởng cùng công đoạn
-- 3A | DẶM VÁ 1 X3 | HUỲNH THỊ NGA | AAF7562 | 
-- 3A | FITTING + DẶM VÁ | TRẦN VĨNH HIỂN | AAF3931 | 
-- 3A | FITTING 2 | MAI PHƯỚC THIỆN | AAF7086 | công đoạn không có trong danh mục MRA
-- 3A | LẮP RÁP 1 | NGUYỄN CHÍ THIỆN | AAF7091 | 
-- 3A | LẮP RÁP 2 | PHAN VĂN KỲ | AAF3828 | 
-- 3A | LẮP RÁP 3 | NGUYỄN MINH QUÂN | AAF5638 | 
-- 3A | LẮP RÁP 4 | NGUYỄN ĐỨC TIN | AAF11445 | 
-- 3A | LẮP RÁP 5 | LÊ TRUNG HIẾU | AAF | mã NV thiếu / sai
-- 3A | TINH GỖ | LÊ VĂN CHÂU | AAF4856 | 
-- 3A | TINH TẤM | NGUYỄN THANH PHƯƠNG | AAF2319 | 
-- 3A | UV | LÊ VĂN QUÂN | AAF7461 | 
-- 3A | VECNI 5 | ĐOÀN TẤN PHƯƠNG | AAF | mã NV thiếu / sai
-- 3A | VECNI 6 | NGUYỄN VĂN TÈO | AAF10940 | 
-- 4A | CHÀ NHÁM TRẮNG X4 | THÁI THỊ NGỌC BÍCH | AAF0803 | 
-- 4A | CHẠM | NGUYỄN VĂN QUÝ | AAF2297 | 
-- 4A | CNC MẪU X4 | NGUYỄN LÊ QUÂN | AAF10691 | 
-- 4A | CNC X4 | ĐỖ VĂN DUYỆT | AAF2757 | 
-- 4A | CTS GỖ 1 | HUỲNH VĂN TRUYỆN | AAF5552 | 
-- 4A | CTS TẤM 2 | VÕ VĂN THỪA | AAF0427 | 
-- 4A | DẶM VÁ 1 | NGUYỄN THỊ NĂM | AAF1143 | 
-- 4A | DẶM VÁ 2 | NGUYỄN HẢI DƯƠNG | AAF0680 | 
-- 4A | FITTING X4 | NGUYỄN XUÂN GƠ | AAF2267 | 
-- 4A | MÁY TINH GỖ 1 | NGUYỄN HỮU THƯƠNG | AAF11724 | 
-- 4A | MÁY TINH GỖ 2 | VĂN VƯƠNG VŨ | AAF1151 | 
-- 4A | MÁY TINH GỖ 3 | MAI XUÂN LONG | AAF1156 | 
-- 4A | MÁY TINH TẤM | LÊ THANH TÂM | AAF0563 | 
-- 4A | MỘC 1 | LÂM HOÀI SƠN | AAF0469 | 
-- 4A | MỘC 2 | NGUYỄN VĂN TÚ | AAF0355 | 
-- 4A | MỘC 5 | TRẦN HÙNG SANG | AAF0852 | 
-- 4A | MỘC 6 | PHẠM BÁ TIẾN | AAF0229 | 
-- 4A | MỘC 7 | HỒ QUỐC TUẤN | AAF0230 | 
-- 4A | MỘC MẪU 2 | HỒ THẾ VINH | AAF0615 | 
-- 4A | MỘC MẪU 4 | NGUYỄN VĂN LINH | AAF4152 | 
-- 4A | MỘC MẪU 5 | NGUYỄN VĂN KHOA | AAF5827 | 
-- 4A | VECNI 3 | NGUYỄN THANH VŨ | AAF0240 | 
-- 4A | VECNI 4 | TRƯƠNG VĂN NHÂN | AAF0685 | 
-- 4A | VECNI CHUYỀN A | LÂM TUẤN | AAF0697 | 
-- 4A | VECNI CHUYỀN B | LÊ QUỐC TUẤN | AAF0709 | 2 tổ trưởng cùng công đoạn
-- 4A | VECNI CHUYỀN B | NGUYỄN NGỌC THANH GIANG | AAF0242 | 2 tổ trưởng cùng công đoạn
-- 5A | BỌC NỆM 1 | NGUYỄN HOÀI THANH | AAF2766 | 
-- 5A | BỌC NỆM 2 | PHẠM HỮU TÀI | AAF7306 | 
-- 5A | BỌC NỆM 3 | TRẦN THANH THẨM | AAF11701 | 
-- 5A | BỌC NỆM 4 | NGUYỄN HỮU THANH | AAF4371 | 
-- 5A | CẮT DA VẢI | SƠN | AAF | mã NV thiếu / sai
-- 5A | CẮT KHUNG | ĐINH VĂN HƯNG | AAF11413 | 
-- 5A | DÁN MOUSSE HÀNG LOẠT | TRẦN VĂN HÙNG | AAF6699 | 
-- 5A | DÁN MOUSSE MẪU LẺ | LÊ VĂN ĐƯỢM | AAF0276 | 
-- 5A | FITTING X5 | NGUYỄN THÀNH LỘC | AAF7876 | 
-- 5A | MAY_02 | HOÀNG THỊ HỢI | AAF7198 | 
-- 5A | MAY_03+CẮT | ĐOÀN THỊ NGỌC GIÀU | AAF1557 | 
-- 5A | MỘC SOFA 1 | LÊ MINH TRUNG | AAF4740 | 
-- 5A | MỘC SOFA 2 | TRẦN VĂN MINH | AAF4732 | 
-- 5A | MỘC SOFA 3 | TRẦN MINH THƯƠNG | AAF4056 | 
-- 5A | MỘC SOFA 4 | NGUYỄN HOÀNG VŨ | AAF5193 | 
-- 5A | MỘC SOFA 5 | NGUYỄN CÔNG TUÂN | AAF0308 | 
-- 5A | ĐAN MÂY | NGUYỄN MINH NHÍ | AAF6712 | 2 tổ trưởng cùng công đoạn
-- 5A | ĐAN MÂY | PHAN HỒ NGỌC THUYỀN | AAF8920 | 2 tổ trưởng cùng công đoạn
-- 8AB | HÀN 1 | HUỲNH VĂN TÂN | AAF7067 | công đoạn không có trong danh mục MRA; 2 tổ trưởng cùng công đoạn
-- 8AB | HÀN 1 | NGUYỄN QUỐC BẢO | AFF3374 | công đoạn không có trong danh mục MRA; mã NV thiếu / sai; 2 tổ trưởng cùng công đoạn
-- 8AB | HÀN 2 | DƯƠNG VĂN TRÒN | AAF4706 | công đoạn không có trong danh mục MRA
-- 8AB | NGUỘI 1 | TRƯƠNG CÔNG QUỐC | AAF1003 | 
-- 8AB | NGUỘI 2 | ĐẶNG NGỌC HÙNG | AAF0990 | 2 tổ trưởng cùng công đoạn
-- 8AB | NGUỘI 2 | DƯƠNG VĂN KỲ | AAF12571 | 2 tổ trưởng cùng công đoạn
-- 8AB | PHÔI TẤM INLAY | NGUYỄN QUỐC HƯNG | AAF4686 | 
-- 8AB | PHÔI ĐỊNH HÌNH | LÊ THANH HẢI | AAF12570 | 
-- 8AB | PVD | ĐỖ THỊ BÉ BẢY | AAF5842 | 2 tổ trưởng cùng công đoạn
-- 8AB | PVD | HỒ CUỐN VŨ | AAF3165 | 2 tổ trưởng cùng công đoạn
-- 8AB | RESIN | ĐỖ VĨNH TIẾN | AAF7158 | 
-- 8AB | ĐỒNG NHÔM | TRẦN NGỌC PHÚC | AAF0278 | 
-- 8C | CTS ĐÁ | NGUYỄN HOÀNG BẢO | AAF13009 | 
-- 8C | KÍNH | NGUYỄN MINH CHÂU | AAF11533 | 
-- 8C | ĐÁ | NGÔ THANH NHÀN | AAF6704 | 
-- XƯỞNG KHÁC | XƯỞNG KHÁC | ANH NHANH | AAF4365 | công đoạn không có trong danh mục MRA
