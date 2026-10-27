# kho-mua-hang.json — 100 câu · đúng 93 · hỏi lại 0 · sai/nhờ AI 7

- [kho-mua-hang-018] "tồn kho nhập từ tháng 9 mà vẫn còn nằm kho" → nho_ai: chưa hiểu: van (đường: nhờ AI (chưa hiểu: van))
  đọc được: {"bang":"ton_kho","kieu":"tong","do":[{"ham":"tong","cot":"gia_tri"},{"ham":"dem_khac","cot":"ma_id_sap"}],"nhom":[],"loc":[],"tu":"2026-09-01","den":"2026-09-30"}
  mong đợi: {"loai":"tu_tra","bang":"ton_kho","loc":[{"cot":"ngay_nhap_kho","op":"trong_khoang","gt":["2026-09-01","2026-09-30"]}],"ky":null}
- [kho-mua-hang-046] "pr nao hen ve tuan nay" → sai: lọc [] ≠ [ngay_du_kien_giao_hang_pmh_nhap|trong_khoang|2026-10-19,2026-10-19] (đường: tự tra)
  đọc được: {"bang":"vat_tu","kieu":"dong","do":[],"nhom":[],"loc":[],"tu":"2026-10-19","den":"2026-10-19"}
  mong đợi: {"loai":"tu_tra","bang":"vat_tu","kieu":"dong","loc":[{"cot":"ngay_du_kien_giao_hang_pmh_nhap","op":"trong_khoang","gt":["2026-10-19","2026-10-19"]}],"ky":null}
- [kho-mua-hang-047] "vat tu ve thuc te tuan truoc" → sai: lọc [] ≠ [ngay_thuc_te_ve|trong_khoang|2026-10-12,2026-10-18] (đường: tự tra)
  đọc được: {"bang":"vat_tu","kieu":"tong","do":[{"ham":"dem"},{"ham":"dem_khac","cot":"so_pr"}],"nhom":[],"loc":[],"tu":"2026-10-12","den":"2026-10-18"}
  mong đợi: {"loai":"tu_tra","bang":"vat_tu","loc":[{"cot":"ngay_thuc_te_ve","op":"trong_khoang","gt":["2026-10-12","2026-10-18"]}],"ky":null}
- [kho-mua-hang-058] "hạng mục đã xuất hàng của Olalani" → sai: lọc [ten_cong_trinh|chua|olalani] ≠ [tinh_trang|bang|00. da xuat hang; ten_cong_trinh|chua|olalani] (đường: tự tra)
  đọc được: {"bang":"production_status_app","kieu":"tong","do":[{"ham":"tong","cot":"thanh_tien_xuat_kho_luy_ke"}],"nhom":[],"loc":[{"cot":"ten_cong_trinh","op":"chua","gt":"Olalani"}]}
  mong đợi: {"loai":"tu_tra","bang":"production_status_app","loc":[{"cot":"tinh_trang","op":"bang","gt":["00. ĐÃ XUẤT HÀNG"]},{"cot":"ten_cong_trinh","op":"chua","gt":"olalani"}],"ky":null}
- [kho-mua-hang-059] "hm nào đã nhập kho mà chưa xuất, theo ct" → nho_ai: chưa hiểu: chua xuat (đường: nhờ AI (chưa hiểu: chua xuat))
  đọc được: {"bang":"nhap_kho","kieu":"dong","do":[],"nhom":[],"loc":[],"tu":"2026-01-01","den":"2026-10-19"}
  mong đợi: {"loai":"tu_tra","bang":"production_status_app","loc":[{"cot":"thanh_tien_ton_kho_hien_tai","op":"lon_hon","gt":0}],"nhom":["ten_cong_trinh"],"ky":null}
- [kho-mua-hang-060] "vướng mắc về vật tư còn đang xử lý" → sai: đi mẫu vuong_mac thay vì tự tra (đường: mẫu vuong_mac)
  đọc được: {"bang":"vuong_mac","kieu":"tong","do":[{"ham":"dem"}],"nhom":[],"loc":[{"cot":"status","op":"bang","gt":"Đang xử lý"},{"cot":"category","op":"bang","gt":"Vật tư"}]}
  mong đợi: {"loai":"tu_tra","bang":"vuong_mac","loc":[{"cot":"category","op":"bang","gt":["material"]},{"cot":"status","op":"bang","gt":["Đang xử lý"]}],"ky":null}
- [kho-mua-hang-090] [sau "xuất kho quý 3 theo công trình ⟶ so với quý 2"] "xếp theo chênh lệch giảm dần" → nho_ai: chưa hiểu: xep lich dan (đường: nhờ AI (chưa hiểu: xep lich dan))
  đọc được: {"bang":"xuat_kho","kieu":"tong","do":[{"ham":"tong","cot":"thanh_tien_xuat_kho"},{"ham":"dem_khac","cot":"hex"}],"nhom":["ten_cong_trinh"],"loc":[{"cot":"sx:ten_pm","op":"bang","gt":["chinh"]}],"tu":"2026-07-01","den":"2026-09-30","soSanh":{"tu":"2026-04-01","den":"2026-06-30"}}
  mong đợi: {"loai":"tu_tra","bang":"xuat_kho","nhom":["ten_cong_trinh"],"ky":{"tu":"2026-07-01","den":"2026-09-30"},"soSanh":{"tu":"2026-04-01","den":"2026-06-30"},"sapChenh":"giam"}