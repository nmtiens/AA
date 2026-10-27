# ke-hoach-ke-toan.json — 100 câu · đúng 94 · hỏi lại 0 · sai/nhờ AI 6

- [ke-hoach-ke-toan-009] "mục tiêu năm nay theo từng tháng" → sai: chia [thang] ≠ [thoi_gian@thang] (đường: tự tra)
  đọc được: {"bang":"khsx_nam","kieu":"tong","do":[{"ham":"tong","cot":"thanh_tien_ke_hoach"}],"nhom":["thang"],"loc":[],"tu":"2026-01-01","den":"2026-12-31"}
  mong đợi: {"loai":"tu_tra","bang":"khsx_nam","nhom":["thoi_gian@thang"],"ky":{"tu":"2026-01-01","den":"2026-12-31"}}
- [ke-hoach-ke-toan-030] "xưởng nào nhập kho tăng nhiều nhất tháng 9 so tháng 8" → nho_ai: chưa hiểu: thang (đường: nhờ AI (chưa hiểu: thang))
  đọc được: {"bang":"nhap_kho","kieu":"tong","do":[{"ham":"tong","cot":"thanh_tien_nhap_kho"},{"ham":"dem_khac","cot":"hex"}],"nhom":["xuong_chinh"],"loc":[],"sapChenh":"tang","tu":"2026-09-01","den":"2026-09-30","soSanh":{"tu":"2026-08-01","den":"2026-08-31","ten":"kỳ trước"}}
  mong đợi: {"loai":"tu_tra","bang":"nhap_kho","nhom":["xuong_chinh"],"ky":{"tu":"2026-09-01","den":"2026-09-30"},"soSanh":{"tu":"2026-08-01","den":"2026-08-31"},"sapChenh":"tang"}
- [ke-hoach-ke-toan-032] "3 pm có đơn hàng lớn nhất quý này" → sai: chia [] ≠ [ten_pm] (đường: tự tra)
  đọc được: {"bang":"dht","kieu":"tong","do":[{"ham":"tong","cot":"tri_gia_don_hang_tong"},{"ham":"dem_khac","cot":"hex"}],"nhom":[],"loc":[{"cot":"ten_pm","op":"chua","gt":"có"}],"tu":"2026-10-01","den":"2026-10-19"}
  mong đợi: {"loai":"tu_tra","bang":"dht","nhom":["ten_pm"],"gioiHan":3,"ky":{"tu":"2026-10-01","den":"2026-10-19"}}
- [ke-hoach-ke-toan-051] "hạng mục đang tạm ngưng theo công trình" → sai: lọc [ten_hang_muc|chua|dang tam ngung] ≠ [bop|bang|tam ngung] (đường: tự tra)
  đọc được: {"bang":"production_status_app","kieu":"tong","do":[{"ham":"dem"},{"ham":"tong","cot":"tri_gia_don_hang_tong"},{"ham":"tong","cot":"gia_tri_con_lai"}],"nhom":["ten_cong_trinh"],"loc":[{"cot":"ten_hang_muc","op":"chua","gt":"đang tạm ngưng"}]}
  mong đợi: {"loai":"tu_tra","bang":"production_status_app","loc":[{"cot":"bop","op":"bang","gt":["TẠM NGƯNG"]}],"nhom":["ten_cong_trinh"],"ky":null}
- [ke-hoach-ke-toan-072] [sau "công trình capella còn lại bao nhiêu ⟶ theo hạng mục"] "đã tính phiếu bao nhiêu" → sai: bảng pthsp_full ≠ production_status_app (đường: tự tra)
  đọc được: {"bang":"pthsp_full","kieu":"tong","do":[{"ham":"tong","cot":"tri_gia_don_hang_tong"},{"ham":"dem_khac","cot":"hex"}],"nhom":["ten_hang_muc"],"loc":[{"cot":"ten_cong_trinh","op":"chua","gt":"capella"}]}
  mong đợi: {"loai":"tu_tra","bang":"production_status_app","coDo":{"ham":"tong","cot":"thanh_tien_tinh_phieu"},"loc":[{"cot":"ten_cong_trinh","op":"chua","gt":"capella"}],"ky":null}
- [ke-hoach-ke-toan-084] [sau "mục tiêu năm 2026 theo xưởng ⟶ năm 2025 thì sao"] "theo tháng đi" → sai: chia [thang] ≠ [thoi_gian@thang] (đường: tự tra)
  đọc được: {"bang":"khsx_nam","kieu":"tong","do":[{"ham":"tong","cot":"thanh_tien_ke_hoach"}],"nhom":["thang"],"loc":[],"tu":"2025-01-01","den":"2025-12-31"}
  mong đợi: {"loai":"tu_tra","bang":"khsx_nam","nhom":["thoi_gian@thang"],"ky":{"tu":"2025-01-01","den":"2025-12-31"}}