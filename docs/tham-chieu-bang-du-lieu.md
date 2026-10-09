# Tham chiếu bảng dữ liệu

App đọc PostgreSQL theo hai nhóm: **bảng do ETL đổ vào** (app chỉ đọc; phiên bản theo dõi ở `table_versions`) và **bảng app tự quản** (tạo bằng file trong `backend/sql/`).

## Bảng ETL (chỉ đọc)

Cột đưa xuống trình duyệt qua `/api/all-data` được giới hạn bởi `REPORT_COLUMNS` trong `backend/src/server/data.ts`. Muốn dùng cột mới ở frontend thì thêm vào đó và tăng `CACHE_DB_NAME` (xem how-to).

| Bảng | Khoá phiên bản | Khoá nối | Dùng cho |
|---|---|---|---|
| `production_status_app` | `production` | `hex` (số, so sánh qua `hex::text`), `ma_cong_trinh`, `ma_id_sap` | bảng sản xuất: trị giá, nhập kho luỹ kế, công đoạn `bop`, tình trạng, KH nhập kho tuần/tháng, ngày cần giao, BOT dự án, QC, GCN, định mức NVL. Mỗi HEX có thể nhiều dòng; lấy dòng `updated_at` mới nhất |
| `vat_tu` | `material` | `trackingno` = mã công trình; `ma_nha_may` / `item_note_pr` chứa mã 13 số (4 số đầu + HEX) | PR vật tư, trạng thái mua, ngày dự kiến giao |
| `khsx` | `khsx` | `hex`, `ma_cong_trinh`, `nam/thang/tuan` | kế hoạch sản xuất theo tuần/tháng |
| `khsx_nam` | `yearlyPlan` | `nam/thang`, `xuong_chinh` | kế hoạch năm |
| `dht` | `order` | `hex` | đơn hàng tổng, `ngay_nhan_tu_pm` |
| `nhap_kho` | `inventory` | `hex`, `date` / `date_parsed` | lịch sử nhập kho (từ 01/2023) |
| `xuat_kho` | `export` | `hex`, `date` | xuất kho (chỉ có từ 01/2025) |
| `ton_kho` | `stock` | `ma_id_sap` ↔ `production_status_app.ma_id_sap`, `date_parsed` = ngày chụp | tồn kho theo ngày |
| `tkbv_full` | `tkbv` | `hex`, `ngay_nhan` | thiết kế bản vẽ |
| `pthsp_full` | `pthsp` | `hex`, `ngay_hoan_thanh` | phát triển sản phẩm |
| `phan_tich_kh_th` | `analysis` | | phân tích kế hoạch / thực hiện |
| `diem_danh` | `attendance` | | chấm công |
| `table_versions` | | `table_name`, `last_updated`, `is_manual` | phiên bản từng bảng; `/api/check-versions` đọc từ đây |

### Cột quan trọng của `production_status_app`

| Nhóm | Cột | Ghi chú |
|---|---|---|
| Nhận diện | `hex`, `ma_cong_trinh`, `ten_cong_trinh`, `ten_hang_muc`, `ma_nha_may`, `ma_id_sap` | `ten_cong_trinh` có nhiều cách viết cho cùng mã; app gộp về tên chuẩn |
| Phân loại | `tinh_trang_ipo`, `tinh_trang`, `bop`, `xuong_chinh`, `khu_vuc_du_an`, `khach_hang`, `phan_loai_nhom_san_pham`, `nhom_ct`, `tinh_trang_du_an`, `ten_pm`, `ten_pc` | `tinh_trang_ipo` chứa "HỦY" = đơn huỷ |
| Tiền (triệu đồng) | `tri_gia_don_hang_tong`, `thanh_tien_tinh_phieu`, `thanh_tien_nhap_kho_luy_ke`, `thanh_tien_xuat_kho_luy_ke`, `thanh_tien_ton_kho_hien_tai` | |
| Số lượng | `so_luong_don_hang_tong`, `so_luong_tinh_phieu`, `so_luong_nhap_kho_luy_ke`, `so_luong_xuat_kho_luy_ke`, `so_luong_ton_kho_hien_tai`, `so_luong_cong_doan_*_da_giao` | cột `cong_doan`: cts, may, moc, kim_loai, vecni, sofa, da, kinh, fitting, bao_bi |
| Ngày | `ngay_nhan_tu_pm`, `ngay_trien_khai_ban_ve`, `ngay_tinh_phieu`, `ngay_duyet_phieu`, `ngay_khnk_tuan` (text), `ngay_khnk_thang`, `ngay_can_giao`, `ngay_can`, `bot_du_an` | `bot_du_an` là 1 ngày chung cho cả công trình |
| Cờ / tình trạng | `tinh_trang_trien_khai_ban_ve`, `tinh_trang_phieu`, `co_vecni`, `co_sofa`, `co_kim_loai`, `co_kinh_da`, `co_gia_cong_ngoai`, `tinh_trang_gcn`, `so_ngay_cd_hien_tai` | `so_ngay_cd_hien_tai` là nhãn ("4-7 NGÀY", "3 TUẦN"...) |
| Văn bản tổng hợp | `tong_hop_ghi_chu_nhap_kho`, `tong_hop_thong_tin_qc`, `tong_hop_ghi_chu_xuat_kho`, `ghi_chu_phieu`, `nvl_*`, `tinh_trang_nvl_*_item_by_item` | định dạng có cấu trúc, parser ở `frontend/utils/qcParse.ts`, `frontend/utils/nvlParse.ts`, `backend/src/routes/data.ts` |

## Bảng app tự quản

| Bảng | Tạo bởi | Nội dung |
|---|---|---|
| `users` | có sẵn | `id, username, password_hash, full_name, role (ADMIN/USER), department, permissions, is_active, otp_code, otp_expires_at, notify_prefs (jsonb)` |
| `vuong_mac` | có sẵn + `2026-10-10_vuong_mac_quy_trinh.sql` | vướng mắc theo HEX: `category (man/machine/material/method/measurement)`, `content, handler, bot, bot_end, is_resolved`, cột quy trình `status (open/doing/done/closed), priority, stage, xuong, ten_cong_trinh, ma_cong_trinh, ten_hang_muc, accepted_*, closed_*, escalated_at` |
| `vuong_mac_log` | có sẵn | nhật ký; `action IN ('CREATE','UPDATE','DELETE','STATUS','COMMENT')` sau khi chạy SQL 2026-10-10 |
| `vuong_mac_photo`, `vuong_mac_extension`, `vuong_mac_bot_notifications` | có sẵn | ảnh đính kèm, xin gia hạn, mốc đã nhắc (chống nhắc trùng) |
| `notifications` | `2026-10-03_notifications.sql` | hộp thông báo theo `user_id`, `kind`, đã đọc |
| `push_subscriptions` | có sẵn | đăng ký Web Push theo user |
| `workshop_group_mapping` | `2026-10-07_workshop_groups.sql` | mã xưởng gốc → xưởng gộp |
| `view_project_mapping` | có sẵn | công trình thuộc view Luồng đỏ / Căn mẫu |
| `table_column_config` | tự tạo khi chạy (`CREATE TABLE IF NOT EXISTS` trong `routes/settings.ts`) | cột hiển thị mặc định từng bảng dữ liệu |

## Index tuỳ chọn

`backend/sql/2026-10-09_indexes_toc_do.sql` thêm index trên `production_status_app(hex::text, ma_id_sap, ma_cong_trinh)`, `vat_tu(so_pr, trackingno)`, `ton_kho(date_parsed, ma_id_sap)`, `khsx(hex)`, `vuong_mac(hex, is_resolved)`. Dùng `CONCURRENTLY` nên chạy từng lệnh ngoài transaction.

## Đọc tiếp

- [Danh sách API](tham-chieu-api.md)
- [Quy tắc số liệu và kiến trúc dữ liệu](giai-thich-so-lieu-va-kien-truc.md)
