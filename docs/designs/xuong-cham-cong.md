# Chấm công theo thời gian thực — app Xưởng

Trạng thái: **đã làm cả 4 đợt** (13/10/2026), chờ file nhân sự. Các câu hỏi bên dưới đang dùng phương án đề xuất. Nối tiếp `docs/designs/xuong-checkin.md`.

## Vấn đề

App Xưởng hiện chỉ biết **số người** của tổ:
- quân số chốt mỗi ca;
- số người khai cho từng hạng mục.

Chấm công thật nằm ở bảng `diem_danh`, nhưng bảng này chỉ có **tổng theo xưởng × ngày** (số công nhân, giờ hành chính, giờ tăng ca) và được nạp sau, không theo thời gian thực.

Hệ quả:
- không biết **ai** có mặt, ai đi trễ, về sớm, tăng ca;
- không biết **người nào làm hạng mục nào**, bao nhiêu giờ;
- không có số liệu từng người cho tính lương, thưởng;
- không đối chiếu được với Điểm danh theo từng người.

## Mục tiêu (người dùng chốt)

1. Giờ công **từng người** theo hạng mục.
2. Thay hoặc đối chiếu được Điểm danh: giờ vào – ra, trễ, về sớm, tăng ca của từng người, có ngay trong ngày.
3. Quân số tổ chính xác theo thời gian thực: ai đến muộn, về sớm, chuyển tổ giữa ca.
4. Xuất dữ liệu cho tính lương / thưởng.

## Cách chấm: tổ trưởng điểm danh trên app

Đây là cách dễ triển khai nhất, người dùng đã chọn:
- công nhân **không cần** điện thoại, tài khoản, thẻ hay máy chấm công;
- tổ trưởng vốn đã mở app đầu ca để chốt quân số; điểm danh thay luôn bước "chốt quân số" (quân số = số người có mặt);
- sau này có thể thêm cách khác (công nhân quét thẻ, đọc máy vân tay) **mà không đổi dữ liệu**, vì mọi cách đều ghi cùng loại sự kiện.

## Dữ liệu

### Danh sách công nhân (mới)

Bảng `xuong_cong_nhan`:

| Cột | Ý nghĩa |
|---|---|
| `mnv` (khóa chính) | mã nhân viên, vd AAF7615 |
| `ho_ten` | họ tên |
| `xuong` | xưởng |
| `to_id` | tổ hiện tại (có thể trống) |
| `chuc_vu` | chức vụ |
| `active` | còn làm hay không |
| `cap_nhat` | lần cập nhật cuối |

- Nạp từ **file nhân sự** người dùng cung cấp. Có màn nạp lại khi có người vào làm, nghỉ việc hay chuyển tổ.
- `xuong_to_thanh_vien` (đã có: tổ, mã NV, từ ngày, đến ngày) giữ **lịch sử thuộc tổ**.

### Điểm danh = sự kiện trong sổ (dùng lại cơ chế đang chạy)

Ghi vào `xuong_su_kien`, nên được hưởng sẵn:
- hàng đợi khi mất sóng;
- giờ bấm hiệu chỉnh lệch đồng hồ;
- huỷ / hoàn tác;
- cờ cần xem.

| Loại sự kiện | `du_lieu` | Khi nào |
|---|---|---|
| `vao_ca` | `{ loaiCa, nguoi: [{mnv, luc}] }` | đầu ca: tick người có mặt; người đến trễ thì ghi riêng với giờ đến |
| `ra_ca` | `{ nguoi: [{mnv, luc, lyDo}] }` | về sớm, nghỉ giữa ca, hết ca tăng ca |
| `muon_nguoi` | `{ mnv, tuToId, luc }` | người tổ khác sang làm (chuyển tổ giữa ca) |

- **Quân số** của ca = số người đang có mặt. Không còn nhập tay, nhưng sự kiện `quan_so` cũ vẫn được đọc cho dữ liệu trước đây.
- **Hết ca chính** thì tự coi là ra ca, không cần bấm. Chỉ ghi `ra_ca` khi về sớm hơn giờ ca.

### Gắn người vào hạng mục

- **Bắt đầu / Tiếp tục:** chọn **tên người làm** thay vì nhập số. App gợi ý sẵn những người đang có mặt và chưa làm hạng mục khác chạy cùng lúc.
- **Chia người:** kéo người giữa các hạng mục.
- `soNguoi` vẫn ghi (bằng số tên đã chọn), nên báo cáo và phân bổ cũ không đổi.
- `du_lieu.nguoi = [mnv…]` là phần mới.

## Quy tắc tính

1. **Giờ có mặt** của mỗi người = từ giờ vào tới giờ ra, cắt theo cửa sổ ca (trừ giờ nghỉ). Tăng ca tính theo ca tăng ca người đó được chọn.
2. **Giờ công từng người theo hạng mục**: trong mỗi đoạn thời gian, người đó được tính cho đúng hạng mục đang gắn tên mình. Một người không thể ở 2 hạng mục cùng lúc; app chặn ngay khi chọn.
3. **Giờ chờ từng người** = giờ có mặt − giờ đã gắn hạng mục. Lý do lấy như báo cáo hiện tại: người rảnh, không có hạng mục chạy, lý do tạm ngưng.
4. **Giờ công hạng mục** = tổng giờ của những người gắn vào hạng mục. Khớp với cách tính hiện tại, chỉ chính xác hơn vì biết từng người.
5. **Đi trễ / về sớm**: so giờ vào – ra với giờ ca.

## Màn hình

### Tổ trưởng (điện thoại)

- **Điểm danh đầu ca** (thay thẻ đỏ "Chốt quân số"):
  - danh sách tên trong tổ;
  - nút **Tất cả có mặt**;
  - chạm để đánh vắng;
  - "Đến trễ lúc …";
  - **+ Người tổ khác** (tìm theo tên hoặc mã NV).
- **Có mặt hiện tại**: thẻ nhỏ ghi "18/20 có mặt". Chạm để xem ai vắng, ai về sớm.
- **Về sớm / ra giữa ca**: chọn người → giờ ra → lý do.
- **Bắt đầu hạng mục**: chọn người bằng chip tên, có sẵn gợi ý.
- **Khai tăng ca**: chọn người tăng ca, không chỉ nhập số.

### Quản lý

- **Tổng quan**: mỗi tổ ghi "có mặt / tổng" và số người vắng.
- **Nhân sự**: nạp file nhân sự, xem danh sách theo tổ, chuyển tổ, cho nghỉ.
- **Báo cáo → tab "Theo người"** (mới):
  - mỗi người, mỗi ngày: giờ vào, giờ ra, trễ, về sớm, giờ hành chính, tăng ca, giờ công theo từng hạng mục, giờ chờ;
  - **Xuất Excel cho tính lương**: mỗi người × ngày, kèm tổng tháng.
- **Đối chiếu Điểm danh**: tổng số người và giờ theo xưởng × ngày so với bảng `diem_danh`; lệch thì tô màu.

## Chia giai đoạn

| Đợt | Nội dung | Phụ thuộc |
|---|---|---|
| 1 | Bảng công nhân + nạp file nhân sự + xem / sửa danh sách theo tổ | file nhân sự |
| 2 | Điểm danh đầu ca, đến trễ, về sớm, người tổ khác; quân số tự tính; tăng ca theo người | đợt 1 |
| 3 | Chọn tên người khi Bắt đầu / Chia người; phân bổ giờ công theo từng người | đợt 2 |
| 4 | Báo cáo Theo người, Excel tính lương, đối chiếu Điểm danh theo người | đợt 3 |

Mỗi đợt dùng được riêng. Riêng đợt 2 đã cho quân số chính xác và giờ vào – ra từng người.

## Câu hỏi cần chốt

1. **File nhân sự** có những cột nào: mã NV, họ tên, xưởng, tổ, chức vụ, ngày vào / nghỉ? Gửi một file mẫu.
2. **Giờ vào mặc định**: tổ trưởng tick "có mặt" lúc 7:40 thì ghi giờ vào là 7:30 (giờ đầu ca) hay 7:40? Đề xuất: tick trước 8:00 thì tính đúng giờ ca, sau 8:00 thì hỏi giờ đến.
3. **Tăng ca**: tính theo ca khai (Ca 1–Ca 4) hay theo giờ ra thực tế của từng người?
4. **Tính lương** cần định dạng Excel cụ thể nào (mẫu của phòng nhân sự)?
5. Có cần **tổ trưởng xác nhận / ký** bảng công cuối ngày hay cuối tuần không?

## Rủi ro

- **Thao tác:** tổ đông (20–30 người) thì điểm danh từng người mất thời gian. Nút "Tất cả có mặt" và mặc định "giống hôm qua" phải đủ nhanh, mục tiêu dưới 30 giây mỗi sáng.
- **Mất sóng:** đã có hàng đợi, nhưng danh sách công nhân phải lưu sẵn trên máy (như danh mục).
- **Dữ liệu lương nhạy cảm:** chỉ quản lý xưởng và admin xem được tab Theo người; tổ trưởng chỉ thấy tổ mình trong ngày.
