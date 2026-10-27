# giam-doc.json — 100 câu · đúng 94 · hỏi lại 1 · sai/nhờ AI 5

- [giam-doc-006] "khách hàng nào lớn nhất năm nay" → hoi_lai: hỏi lại: lớn nhất (đường: tự tra)
  đọc được: {"bang":"production_status_app","kieu":"tong","do":[{"ham":"dem"},{"ham":"tong","cot":"tri_gia_don_hang_tong"},{"ham":"tong","cot":"gia_tri_con_lai"}],"nhom":["khach_hang"],"loc":[],"tu":"2026-01-01","den":"2026-10-19"}
  mong đợi: {"loai":"tu_tra","bang":"nhap_kho","nhom":["sx:khach_hang"],"ky":{"tu":"2026-01-01","den":"2026-10-19"}}
- [giam-doc-013] "quý 3 nhập khp bao nhiêu, so với quý 2" → nho_ai: chưa hiểu: khp (đường: nhờ AI (chưa hiểu: khp))
  đọc được: {"bang":"nhap_kho","kieu":"tong","do":[{"ham":"tong","cot":"thanh_tien_nhap_kho"},{"ham":"dem_khac","cot":"hex"}],"nhom":[],"loc":[],"tu":"2026-07-01","den":"2026-09-30","soSanh":{"tu":"2026-04-01","den":"2026-06-30","ten":"quý 2/2026"}}
  mong đợi: {"loai":"tu_tra","bang":"nhap_kho","ky":{"tu":"2026-07-01","den":"2026-09-30"},"soSanh":{"tu":"2026-04-01","den":"2026-06-30"}}
- [giam-doc-019] "hm sap den han giao 2 tuan toi con bn" → sai: lọc [ngay_can_giao|trong_khoang|2026-10-19,2026-11-02; gia_tri_con_lai|lon_hon|0; so_ngay_cd_hien_tai|bang|2 tuan] ≠ [ngay_can_giao|trong_khoang|2026-10-19,2026-11-02; gia_tri_con_lai|lon_hon|0] (đường: tự tra)
  đọc được: {"bang":"production_status_app","kieu":"tong","do":[{"ham":"dem"},{"ham":"tong","cot":"gia_tri_con_lai"}],"nhom":[],"loc":[{"cot":"ngay_can_giao","op":"trong_khoang","gt":["2026-10-19","2026-11-02"]},{"cot":"gia_tri_con_lai","op":"lon_hon","gt":0},{"cot":"so_ngay_cd_hien_tai","op":"bang","gt":["2 TUẦN"]}]}
  mong đợi: {"loai":"tu_tra","bang":"production_status_app","loc":[{"cot":"ngay_can_giao","op":"trong_khoang","gt":["2026-10-19","2026-11-02"]},{"cot":"gia_tri_con_lai","op":"lon_hon","gt":0}],"ky":null}
- [giam-doc-026] "tang ca thang nay xuong nao nhieu nhat" → sai: xếp chênh tang ≠ undefined (đường: tự tra)
  đọc được: {"bang":"diem_danh","kieu":"tong","do":[{"ham":"tb","cot":"so_luong_cong_nhan"},{"ham":"tong","cot":"gio_cong_hanh_chinh"},{"ham":"tong","cot":"gio_cong_tang_ca"}],"nhom":["xuong_chinh"],"loc":[],"sapChenh":"tang","tu":"2026-10-01","den":"2026-10-19","soSanh":{"tu":"2026-09-01","den":"2026-09-30","ten":"kỳ trước"}}
  mong đợi: {"loai":"tu_tra","bang":"diem_danh","coDo":{"ham":"tong","cot":"gio_cong_tang_ca"},"nhom":["xuong_chinh"],"ky":{"tu":"2026-10-01","den":"2026-10-19"}}
- [giam-doc-054] "8AB tháng này nhập bao nhiêu so với 8C" → sai: chia [] ≠ [xuong_chinh] (đường: tự tra)
  đọc được: {"bang":"nhap_kho","kieu":"tong","do":[{"ham":"tong","cot":"thanh_tien_nhap_kho"},{"ham":"dem_khac","cot":"hex"}],"nhom":[],"loc":[{"cot":"xuong_chinh","op":"bang","gt":["8AB","8C"]}],"tu":"2026-10-01","den":"2026-10-19"}
  mong đợi: {"loai":"tu_tra","bang":"nhap_kho","loc":[{"cot":"xuong_chinh","op":"bang","gt":["8AB","8C"]}],"nhom":["xuong_chinh"],"ky":{"tu":"2026-10-01","den":"2026-10-19"}}
- [giam-doc-060] "cho tôi 10 hạng mục còn lại nhiều tiền nhất" → sai: kiểu tong ≠ dong (đường: tự tra)
  đọc được: {"bang":"production_status_app","kieu":"tong","do":[{"ham":"tong","cot":"gia_tri_con_lai"}],"nhom":[],"loc":[]}
  mong đợi: {"loai":"tu_tra","bang":"production_status_app","kieu":"dong","loc":[{"cot":"gia_tri_con_lai","op":"lon_hon","gt":0}],"gioiHan":10,"ky":null}