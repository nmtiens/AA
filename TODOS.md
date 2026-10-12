# TODOS

## Xưởng

### Nối chấm công theo người (quy tắc 4a)

**What:** Nạp chấm công từng người (mã AAF × ngày, giờ vào/ra hoặc số giờ, tăng ca) từ Google Sheet / Excel của nhân sự, nối vào tổ qua xuong_to_thanh_vien; dùng làm quân số khi tổ chưa chốt.

**Why:** Bảng diem_danh hiện chỉ có số cả xưởng mỗi ngày và dừng ở 02/02/2026 — không biết tổ nào có bao nhiêu người, nên tổ quên chốt quân số thì giờ công chỉ tính theo số người khai (quy tắc 4b).

**Context:** Người dùng xác nhận nguồn là Google Sheet / Excel (2026-10-12) — cần link hoặc file mẫu để viết phần nạp (giống `C:\data mra\app.py`). Báo cáo đã có khối đối chiếu chấm công mức xưởng (routes/xuongBaoCao.ts).

**Effort:** M
**Priority:** P2
**Depends on:** File / link chấm công mẫu từ nhân sự; tổ có danh sách thành viên mã AAF.

## Giao diện

### Lập DESIGN.md chung cho project_v2

**What:** Chạy /design-consultation để có DESIGN.md chung (màu, chữ, khoảng cách, vùng chạm, bộ icon) cho cả app desktop và /m/.

**Why:** Chưa có hệ giao diện chung: mỗi màn tự chọn màu / cỡ chữ; /m/ Vướng mắc dùng emoji còn màn Xưởng dùng icon nét lucide (quyết định 4B). Không gom lại thì màn mới tiếp tục tự đặt token, lệch dần.

**Pros:** Màn mới dựng nhanh, nhất quán; có chuẩn để /design-review đối chiếu.
**Cons:** Khoảng 1 ngày người (CC ~1 giờ); có thể phải sửa nhẹ các màn cũ cho khớp.

**Context:** Phát sinh ở /plan-design-review 2026-10-12 cho module Xưởng (Pass 5, docs/designs/xuong-checkin.md). Điểm khởi đầu: `frontend/components/Mobile/mobileUi.tsx` (token /m/) và `xuongUi.ts` của màn Xưởng (quyết định 5A: nút 64/56px, số 24px tabular, 4 màu trạng thái luôn kèm chữ).

**Effort:** M
**Priority:** P3
**Depends on:** Màn Xưởng (T7) chạy ổn ở 3A.

## Completed

- **Chốt nơi lưu ảnh tiến độ** — 2026-10-12: Postgres như ảnh vướng mắc (quyết định D24, thay R2); bảng xuong_anh — backend/sql/2026-10-12_xuong_anh.sql.
