# App vướng mắc — quy trình xử lý (từ 2026-10-10)

## Cần làm khi triển khai
1. Chạy `backend/sql/2026-10-10_vuong_mac_quy_trinh.sql` trên DB thật (psql, chạy lại được). File thêm cột
   `status / priority / stage / xuong / ten_cong_trinh / accepted_* / closed_* / escalated_at` vào `vuong_mac`,
   chuyển dữ liệu cũ (đã xử lý → đã đóng; có người xử lý → đang xử lý) và mở rộng ràng buộc `vuong_mac_log.action`.
2. Cấp quyền **"Vướng mắc sản xuất (quản lý)"** (`vuong_mac`) cho quản lý xưởng / giám đốc để thấy menu
   *Vướng mắc* trên bản máy tính.
3. Cron `/api/cron/vuong-mac-bot` (đã có) nay thêm bước **leo thang**: quá hạn BOT hơn 24 giờ mà chưa xử lý
   → báo Admin + người xử lý + phòng ban người báo, ghi `escalated_at`.

Chưa chạy SQL thì app vẫn chạy với 2 trạng thái cũ; các thao tác "Nhận xử lý", "Xác nhận đóng", ưu tiên
trả lỗi 409 kèm hướng dẫn.

## Quy trình
```
Mới (open) ──nhận xử lý──> Đang xử lý (doing) ──báo xong──> Chờ xác nhận (done) ──người báo xác nhận──> Đã đóng (closed)
   └───────────── báo xong ─────────────┘                        └── chưa đạt: mở lại ──> Đang xử lý
```
- Báo có sẵn người xử lý → vào thẳng *Đang xử lý*; chưa giao → *Mới*, người xử lý bấm *Nhận xử lý* (tự thành người xử lý).
- *Đã xử lý xong* bắt buộc ghi nội dung đã xử lý; *Mở lại* bắt buộc ghi lý do; *Đóng không cần xử lý* (báo nhầm, trùng) cần lý do.
- `is_resolved` = status ∈ {done, closed} để màn hình cũ vẫn chạy.

## Quyền (server tính, trả về `perms` trên từng dòng)
| Thao tác | Ai |
|---|---|
| Sửa nội dung / người xử lý / BOT / ưu tiên; nhận xử lý; báo xong; xin thêm thời gian | Admin, người báo, cùng phòng ban người báo, **người xử lý** |
| Xác nhận đóng; mở lại; đóng trực tiếp; xoá | Admin, người báo, cùng phòng ban người báo |
| Bình luận | mọi tài khoản |

## Giao diện
- **Điện thoại (`/m/`)**: Tổng quan (Tôi phải xử lý · Chờ tôi xác nhận · tồn đọng theo hạn / loại / khu vực / công trình),
  danh sách (Chưa xong · Chờ XN · Đã đóng · Tất cả + bộ lọc), báo vướng mắc 2 bước (chọn hạng mục — tìm / gần đây / quét mã
  → nội dung, ảnh, giao người, BOT chọn nhanh, ưu tiên), chi tiết với thông tin hạng mục (công đoạn, hạn nhập kho),
  mốc quy trình, trao đổi (bình luận).
- **Máy tính (`/vuong-mac`)**: KPI kỳ, xu hướng 12 tuần, tuổi vướng mắc, theo loại / khu vực / công đoạn / người xử lý /
  công trình, cần xử lý ngay, danh sách lọc + xuất Excel, cùng cửa sổ chi tiết với app điện thoại.
- Mã dùng chung: `frontend/components/VuongMac/{model.ts, sheets.tsx, VuongMacManager.tsx}`.

## API
- `GET /api/vuong-mac/all`: thêm `st=open,doing,done,closed`, `mine=assignee|reporter|confirm|1`, `xuong`, `congTrinh`,
  `handler`, `stage`, `priority`, `sort=bot|oldest|priority`, `pageSize`; trả thêm thông tin sản xuất hiện tại và `perms`.
- `PUT /api/vuong-mac/:id`: `status` + `statusNote`, `priority` (vẫn nhận `isResolved` cũ).
- `POST /api/vuong-mac/:id/comment`, `GET /api/vuong-mac/item/:id`, `GET /api/vuong-mac/dashboard?from&to&xuong`,
  `GET /api/vuong-mac/people`, `GET /api/vuong-mac/log/:hex?id=`.
- Thông báo mới: `accepted`, `closed`, `comment`, `escalated` (theo cài đặt từng người như trước).
