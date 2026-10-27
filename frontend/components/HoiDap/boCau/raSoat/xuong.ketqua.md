# xuong.json — 100 câu · đúng 89 · hỏi lại 2 · sai/nhờ AI 9

- [xuong-011] "xuong 4A dang ket gi" → hoi_lai: hỏi lại: dang ket (đường: tự tra)
  đọc được: {"bang":"production_status_app","kieu":"tong","do":[{"ham":"dem"},{"ham":"tong","cot":"tri_gia_don_hang_tong"},{"ham":"tong","cot":"gia_tri_con_lai"}],"nhom":[],"loc":[{"cot":"xuong_chinh","op":"bang","gt":["4A"]}]}
  mong đợi: {"loai":"tu_tra","bang":"vuong_mac","kieu":"dong","loc":[{"cot":"xuong","op":"bang","gt":["4A"]},{"cot":"is_resolved","op":"bang","gt":["Chưa xử lý"]}],"ky":null}
- [xuong-012] "vm quá hạn của 4A" → sai: kiểu tong ≠ dong (đường: tự tra)
  đọc được: {"bang":"vuong_mac","kieu":"tong","do":[{"ham":"dem"}],"nhom":[],"loc":[{"cot":"qua_han","op":"bang","gt":"Quá hạn"},{"cot":"xuong","op":"bang","gt":["4A"]}]}
  mong đợi: {"loai":"tu_tra","bang":"vuong_mac","kieu":"dong","loc":[{"cot":"xuong","op":"bang","gt":["4A"]},{"cot":"qua_han","op":"bang","gt":["Quá hạn"]}],"ky":null}
- [xuong-013] "tổ 4A có bao nhiêu vướng mắc về máy" → sai: lọc [category|bang|may; xuong|bang|4a] ≠ [xuong|bang|4a; category|bang|machine] (đường: tự tra)
  đọc được: {"bang":"vuong_mac","kieu":"tong","do":[{"ham":"dem"}],"nhom":[],"loc":[{"cot":"category","op":"bang","gt":["Máy"]},{"cot":"xuong","op":"bang","gt":["4A"]}],"tu":"2026-01-01","den":"2026-10-19"}
  mong đợi: {"loai":"tu_tra","bang":"vuong_mac","loc":[{"cot":"xuong","op":"bang","gt":["4A"]},{"cot":"category","op":"bang","gt":["machine"]}],"ky":null}
- [xuong-018] "4A tháng này nhập kho nhiều hơn hay ít hơn tháng trước" → nho_ai: chưa hiểu: thang truoc (đường: nhờ AI (chưa hiểu: thang truoc))
  đọc được: {"bang":"nhap_kho","kieu":"tong","do":[{"ham":"tong","cot":"thanh_tien_nhap_kho"},{"ham":"dem_khac","cot":"hex"}],"nhom":[],"loc":[{"cot":"xuong_chinh","op":"bang","gt":["4A"]}],"tu":"2026-10-01","den":"2026-10-19"}
  mong đợi: {"loai":"tu_tra","bang":"nhap_kho","loc":[{"cot":"xuong_chinh","op":"bang","gt":["4A"]}],"ky":{"tu":"2026-10-01","den":"2026-10-19"},"soSanh":{"tu":"2026-09-01","den":"2026-09-30"}}
- [xuong-024] "hang 4A phai nhap trong 2 tuan toi" → sai: kiểu tong ≠ dong (đường: tự tra)
  đọc được: {"bang":"production_status_app","kieu":"tong","do":[{"ham":"dem"},{"ham":"tong","cot":"tri_gia_don_hang_tong"},{"ham":"tong","cot":"gia_tri_con_lai"}],"nhom":[],"loc":[{"cot":"nhom_bot","op":"bang","gt":["2. ≤ 14 ngày"]},{"cot":"xuong_chinh","op":"bang","gt":["4A"]}]}
  mong đợi: {"loai":"tu_tra","bang":"production_status_app","kieu":"dong","loc":[{"cot":"xuong_chinh","op":"bang","gt":["4A"]},{"cot":"nhom_bot","op":"bang","gt":["2. ≤ 14 ngày"]}],"ky":null}
- [xuong-033] "vat tu da chua ve con bn" → hoi_lai: hỏi lại: da (đường: tự tra)
  đọc được: {"bang":"vat_tu","kieu":"tong","do":[{"ham":"dem"},{"ham":"dem_khac","cot":"so_pr"}],"nhom":[],"loc":[{"cot":"so_luong_con_lai","op":"lon_hon","gt":0}]}
  mong đợi: {"loai":"tu_tra","bang":"vat_tu","loc":[{"cot":"nhom_vt","op":"bang","gt":["107 - Da"]},{"cot":"so_luong_con_lai","op":"lon_hon","gt":0}],"ky":null}
- [xuong-050] "cong nhan 4A tb thang 9 bn nguoi" → nho_ai: chưa hiểu: cong (đường: nhờ AI (chưa hiểu: cong))
  đọc được: {"bang":"production_status_app","kieu":"tong","do":[{"ham":"dem"},{"ham":"tong","cot":"tri_gia_don_hang_tong"},{"ham":"tong","cot":"gia_tri_con_lai"}],"nhom":["ngay_nhan_tu_pm@thang"],"loc":[{"cot":"tinh_trang","op":"bang","gt":["05.2. NGUỘI"]},{"cot":"xuong_chinh","op":"bang","gt":["4A"]}],"binhQuan":"thang"}
  mong đợi: {"loai":"tu_tra","bang":"diem_danh","coDo":{"ham":"tb","cot":"so_luong_cong_nhan"},"loc":[{"cot":"xuong_chinh","op":"bang","gt":["4A"]}],"ky":{"tu":"2026-09-01","den":"2026-09-30"}}
- [xuong-053] "ngày nào tháng này 4A tăng ca nhiều nhất" → sai: xếp chênh tang ≠ undefined (đường: tự tra)
  đọc được: {"bang":"diem_danh","kieu":"tong","do":[{"ham":"tb","cot":"so_luong_cong_nhan"},{"ham":"tong","cot":"gio_cong_hanh_chinh"},{"ham":"tong","cot":"gio_cong_tang_ca"}],"nhom":["date@ngay"],"loc":[{"cot":"xuong_chinh","op":"bang","gt":["4A"]}],"sapChenh":"tang","tu":"2026-10-01","den":"2026-10-19","soSanh":{"tu":"2026-09-01","den":"2026-09-30","ten":"kỳ trước"}}
  mong đợi: {"loai":"tu_tra","bang":"diem_danh","coDo":{"ham":"tong","cot":"gio_cong_tang_ca"},"nhom":["date@ngay"],"loc":[{"cot":"xuong_chinh","op":"bang","gt":["4A"]}],"ky":{"tu":"2026-10-01","den":"2026-10-19"}}
- [xuong-054] "vướng mắc theo loại của xưởng 8AB" → sai: có kỳ 2026-01-01..2026-10-19 (không được có) (đường: tự tra)
  đọc được: {"bang":"vuong_mac","kieu":"tong","do":[{"ham":"dem"}],"nhom":["category"],"loc":[{"cot":"xuong","op":"bang","gt":["8AB"]}],"tu":"2026-01-01","den":"2026-10-19"}
  mong đợi: {"loai":"tu_tra","bang":"vuong_mac","nhom":["category"],"loc":[{"cot":"xuong","op":"bang","gt":["8AB"]}],"ky":null}
- [xuong-076] "vướng mắc chưa xử lý của 4A" → sai: kiểu tong ≠ dong (đường: tự tra)
  đọc được: {"bang":"vuong_mac","kieu":"tong","do":[{"ham":"dem"}],"nhom":[],"loc":[{"cot":"is_resolved","op":"bang","gt":"Chưa xử lý"},{"cot":"xuong","op":"bang","gt":["4A"]}]}
  mong đợi: {"loai":"tu_tra","bang":"vuong_mac","kieu":"dong","loc":[{"cot":"xuong","op":"bang","gt":["4A"]},{"cot":"is_resolved","op":"bang","gt":["Chưa xử lý"]}],"ky":null}
- [xuong-090] [sau "nhom san pham 8AB dang lam ⟶ ghe thoi"] "bn cai qua han giao" → sai: lọc [ngay_can_giao|nho_hon|2026-10-19; gia_tri_con_lai|lon_hon|0; xuong_chinh|bang|8ab] ≠ [xuong_chinh|bang|8ab; phan_loai_nhom_san_pham|bang|02. ghe; ngay_can_giao|nho_hon|2026-10-19; gia_tri_con_lai|lon_hon|0] (đường: tự tra)
  đọc được: {"bang":"production_status_app","kieu":"tong","do":[{"ham":"dem"}],"nhom":[],"loc":[{"cot":"ngay_can_giao","op":"nho_hon","gt":"2026-10-19"},{"cot":"gia_tri_con_lai","op":"lon_hon","gt":0},{"cot":"xuong_chinh","op":"bang","gt":["8AB"]}]}
  mong đợi: {"loai":"tu_tra","bang":"production_status_app","loc":[{"cot":"xuong_chinh","op":"bang","gt":["8AB"]},{"cot":"phan_loai_nhom_san_pham","op":"bang","gt":["02. GHẾ"]},{"cot":"ngay_can_giao","op":"nho_hon","gt":"2026-10-19"},{"cot":"gia_tri_con_lai","op":"lon_hon","gt":0}],"ky":null}