# Quy trình vận hành MRA (module Xưởng)

Mô tả theo code hiện tại (30/10/2026, gồm cả các sửa chưa push). Ba nơi dùng: **MRA trên máy tính** (quản lý, `/mra`),
**app tổ trưởng** (điện thoại, `/xuong`), **trạm quét** (máy đặt ở tổ, `/xuong/tram`).

Trình tự tổng quát: **1. Thiết lập xưởng → 2. Triển khai hạng mục → 3. Tổ trưởng nhận / làm / xong / giao trên app (tổ dùng
trạm: công nhân quét thẻ + phiếu ở trạm) → 4. Quản lý theo dõi, báo cáo, xử lý Cần xem.**

# PHẦN 1 — THIẾT LẬP XƯỞNG trên máy tính (trang MRA)

## Mục đích
Đây là phần khai báo nền cho một xưởng trước khi tổ trưởng dùng app `/xuong` và trạm quét `/xuong/tram`. Gồm:
- danh mục **công đoạn** và thứ tự hàng đi qua;
- **tổ**: tổ trưởng, công đoạn phụ trách, thành viên, chế độ chấm công, trạm;
- danh sách **công nhân** để chấm công theo người và in nhãn QR;
- **giờ ca** và giờ nghỉ, dùng để tính giờ công;
- người **quản lý xưởng**.

## Ai dùng & quyền
- **Cách vào:** menu trái có mục **"MRA"** (`/mra`). Mục này chỉ hiện với ADMIN hoặc tài khoản có quyền `xuong_quan_ly` (frontend/App.tsx:1016, 1165-1173). Người khác mở `/mra` sẽ bị đưa về `/` (App.tsx:378). Đường cũ `/setup?tab=xuong` tự chuyển sang `/mra` (App.tsx:355).
- **Ba mức quyền** (backend/src/routes/xuong.ts:48-80):
  - `admin` (role ADMIN): làm được ở mọi xưởng. Chỉ admin được gán hoặc bỏ quản lý xưởng, sửa lịch ca mặc định `*`, và cấp quyền `xuong` cho tổ trưởng.
  - `xuong_quan_ly` kèm một dòng trong bảng `xuong_quan_ly`: chỉ cấu hình được những xưởng mình được gán. Có quyền mà chưa được gán xưởng nào thì bị 403 "Cần quyền quản lý xưởng" (xuongSetup.ts:76).
  - `xuong` (quyền tổ trưởng): ghi thao tác trên app `/xuong`. Quyền này **không** mở được trang MRA trên máy tính.
- **Tài khoản đang làm tổ trưởng của một tổ đang hoạt động:** kể cả khi có quyền quản lý, chỉ thấy các mục xem (Theo dõi triển khai, Cần xem, Báo cáo), số liệu lọc theo tổ mình, không có mục cấu hình nào (xuongSetup.ts:74-83; XuongSetup.tsx:71-73). Admin không bị giới hạn này.
- **Danh sách xưởng** trong ô "Xưởng" lấy từ các xưởng đã có công đoạn hoặc tổ (xuongSetup.ts:77-79). Xưởng mới phải có ít nhất một công đoạn hoặc một tổ (thường do chạy SQL danh mục) mới hiện ra.

## Các bước (đúng thứ tự nên làm)

**0. Mở trang và chọn xưởng**
- Mở **MRA**, chọn xưởng ở ô **"Xưởng"**.
- Thanh tab gồm: **Báo cáo · Triển khai hạng mục · Khai CĐ chi tiết · Theo dõi triển khai · Tổ & tổ trưởng · Nhân sự · Công đoạn · Lịch ca · Quản lý xưởng · Cần xem** (XuongSetup.tsx:21-32).
- Xưởng và tab đang chọn được nhớ trong trình duyệt (localStorage `xuong_setup_xuong`, `xuong_setup_muc`). Nút ↻ (**"Tải lại"**) tải lại toàn bộ.
- Trên điện thoại (mục Quản lý của app `/xuong`) chỉ hiện Theo dõi, Cần xem, Báo cáo. Muốn thấy các tab còn lại thì bấm **"Mục cấu hình…"** (XuongSetup.tsx:34, 102-106).

**1. Quản lý xưởng (admin làm trước tiên)**
- Tab **Quản lý xưởng**: gõ tối thiểu 2 ký tự (tên, tài khoản hoặc mã NV) vào ô tìm, chọn người, bấm **"+ Thêm quản lý"**.
- Thông báo thành công: "`<tên>` là quản lý xưởng `<X>`".
- Hệ thống thêm một dòng vào `xuong_quan_ly` và **tự gắn quyền `xuong_quan_ly`** cho tài khoản đó (xuongSetup.ts:449-455).
- Nút **"Bỏ"** cạnh từng người để bỏ quản lý. Người không phải admin chỉ thấy dòng "Chỉ admin gán / bỏ quản lý xưởng."

**2. Công đoạn** (XuongSetupMuc.tsx:262-314; xuongSetup.ts:266-299)
- Bấm **"+ Thêm công đoạn"**: thêm một dòng mới, ô "Công đoạn xưởng" điền sẵn `<XƯỞNG>-`, "Thứ tự" lấy bằng số lớn nhất hiện có.
- Các cột:
  - **Thứ tự**: số nguyên 0–999.
  - **Nhóm công đoạn**: cột `cd_tach_ma`.
  - **Công đoạn chi tiết (tổ)**: cột `cd_chi_tiet`, là tên tổ trưởng nhìn thấy.
  - **Công đoạn xưởng**: cột `ten_cd`.
  - **Bao bì**: ô tích.
  - **Đang dùng**: ô tích.
- Dòng nào sửa sẽ tô vàng. Bấm **"Lưu N"** để lưu.
- Ý nghĩa:
  - *Thứ tự* chỉ dùng để gợi ý công đoạn kế tiếp khi hạng mục **chưa có tuyến** lúc triển khai (xuong.ts:779-800), và để sắp xếp công đoạn trong báo cáo.
  - *Bao bì*: bấm Xong ở công đoạn bao bì được tính là hàng **ra khỏi xưởng** trong số liệu vào/ra (xuong.ts:1333-1334).
  - *Nhóm công đoạn* hiện kèm tên công đoạn khi chọn tuyến (ChonTuyen.tsx:346).
- Mã công đoạn mới do máy tự sinh: `CD-<XƯỞNG>-<6 ký tự hex>`.

**3. Lịch ca** (XuongSetupMuc.tsx:319-390; xuongSetup.ts:395-434)
- Có 6 dòng: Ca chính, Ca 1, Ca 2, Ca 3, Ca 4, Chủ nhật. Mỗi dòng có Bắt đầu, Kết thúc và giờ nghỉ.
- Thêm giờ nghỉ bằng **"+ Thêm khoảng nghỉ"** (mặc định 11:30–12:30), bỏ bằng biểu tượng thùng rác. Tối đa 6 khoảng nghỉ cho mỗi ca.
- Các nút:
  - **"Lưu cho `<X>`"**: tạo lịch riêng cho xưởng.
  - **"Lưu mặc định"** (chỉ admin): áp cho mọi xưởng chưa có lịch riêng.
  - **"Bỏ lịch riêng"**: quay về lịch mặc định.
- Cột "Áp dụng" ghi "Riêng xưởng X" hoặc "Mặc định".
- Nếu ca chính chưa có giờ nghỉ, trang hiện cảnh báo vàng "Ca chính chưa có giờ nghỉ trưa — giờ công đang tính cả giờ nghỉ…".
- Ca có giờ kết thúc nhỏ hơn giờ bắt đầu là ca qua đêm.
- Mỗi lần lưu, cache giờ công bị xoá và giờ công được tính lại (xuongSetup.ts:414-415).

**4. Tổ & tổ trưởng** (XuongSetupMuc.tsx:136-256; xuongSetup.ts:304-390)
- **Đầu bảng:**
  - dòng "N tổ · xưởng X";
  - cảnh báo "N tổ chưa có tổ trưởng (tổ trưởng chưa dùng được app MRA)";
  - bộ lọc **Tất cả tổ / Chưa có tổ trưởng**;
  - nút **"In nhãn QR mã NV"** và nút **"+ Thêm tổ"**.
- **Bảng:** Tổ (tổ ngừng có chữ "(ngừng)"), Tổ trưởng ("Chưa có", hoặc "chưa có quyền Xưởng"), Chấm công (nhãn chế độ, lần đổi đã hẹn "→ … từ dd/mm", "· n trạm"), Công đoạn phụ trách ("Chưa gán"), Thành viên. Nút **"Sửa"** để mở form, bấm lần nữa thành **"Đóng"**.
- **Trong form:**
  1. **Tên tổ** (bắt buộc).
  2. **Tổ trưởng**: tìm như ở bước 1. Đã chọn thì có nút **"Đổi"** / **"Bỏ"**.
     - Tài khoản không có mã NV thì hiện "Tài khoản chưa có mã nhân viên — vẫn gán được…".
     - Tài khoản chưa có quyền `xuong`: admin thấy ô tích **"Cấp luôn quyền 'Tổ trưởng — ghi thao tác ở xưởng' cho tài khoản này"** (tích sẵn). Quản lý không phải admin chỉ thấy dòng "nhờ admin cấp ở Quản lý người dùng". Quyền được cấp sau khi lưu tổ xong (xuongSetup.ts:378-384).
  3. **Công đoạn phụ trách**: tích các công đoạn của xưởng. Công đoạn đã bỏ "Đang dùng" thì ẩn, trừ khi tổ đang giữ nó.
  4. **Chấm công · trạm quét**: khung này **chỉ có khi sửa tổ đã có**, tổ mới tạo chưa có (XuongSetupMuc.tsx:181). Xem bước 5.
  5. **Thành viên**: ghi mã NV, mỗi dòng một mã (cũng chấp nhận phân tách bằng dấu cách, dấu phẩy, chấm phẩy). Máy tự đổi sang chữ hoa và bỏ trùng.
  6. **"Tổ đang hoạt động"**: ô tích.
  7. Bấm **"Thêm tổ"** hoặc **"Lưu tổ"**. Thông báo "Đã thêm tổ" / "Đã lưu tổ". Nút **"Huỷ"** để đóng mà không lưu.
- **Lưu tổ CÓ ghi vào Nhân sự** (xuongSetup.ts:352-374):
  - Bảng `xuong_to_thanh_vien`: người bị bỏ khỏi danh sách được đóng hạn từ **hôm qua** (`den_ngay = CURRENT_DATE - 1`), người mới được mở từ hôm nay.
  - Bảng `xuong_cong_nhan`: người bị bỏ thành "chưa xếp tổ". Người có trong danh sách được **xếp vào tổ này**: chuyển từ tổ khác nếu có, đặt `active = true`, cập nhật xưởng. Người chưa có thì được tạo mới với nguồn "app", họ tên lấy theo tài khoản trùng mã NV, không có thì để bằng mã NV.
  - Ô Thành viên hiển thị **gộp** cả hai bảng (xuongSetup.ts:91-98).

**5. Chế độ chấm công của tổ** (XuongSetupMuc.tsx:24-80; xuongTram.ts:145-168)
- Chọn một trong ba:
  - **Bấm tay (cũ)**: tổ trưởng bấm Bắt đầu / Tạm ngưng / Chia người và điểm danh tay.
  - **Song song**: tổ trưởng vẫn bấm, đây là số chính thức; trạm chỉ dùng để so khớp trong Báo cáo.
  - **Trạm quét**: công nhân tự quét thẻ đầu ca; quét phiếu kèm thẻ để vào hàng. App tổ trưởng ẩn Bắt đầu, Tạm ngưng, Chia người và điểm danh.
- Ô tích **"Áp dụng ngay hôm nay (mặc định: từ ngày ca mai)"**. Bấm **"Lưu chế độ"**.
- Hệ thống ghi vào `xuong_to_che_do` với `tu_ngay` = ngày ca kế tiếp, hoặc hôm nay nếu tích ô trên. Ngày ca được tính đổi ngày lúc **06:00 sáng** (tram.ts:36). Nếu đổi nhiều lần cho cùng một ngày hiệu lực thì lần sau thay lần trước.
- Thông báo: "`<Tổ>`: `<Chế độ>` từ dd/mm". Khi chuyển sang Trạm quét mà còn hạng mục đang chạy theo bấm tay thì thêm câu "— N hạng mục đang chạy theo bấm tay sẽ tạm ngưng, chạy lại khi có người quét".
- **Chỉ quản lý xưởng hoặc admin** đổi được. Tổ trưởng bị 403 "Chỉ quản lý xưởng được đổi chế độ chấm của tổ".

**6. Trạm của tổ** (cùng khung ở bước 5)
- Dòng "Trạm của tổ (n) — Đăng ký: mở **/xuong/tram** trên máy đặt ở tổ". Đăng ký được làm trên chính máy trạm, bởi quản lý hoặc tổ trưởng của tổ (xuongTram.ts:81-102).
- Mỗi trạm hiện tên, người đăng ký và "lần cuối …".
- Nút **"Thu hồi"** hỏi xác nhận "Thu hồi trạm này? Máy trạm sẽ phải đăng ký lại." Thu hồi xong trạm hiện "(đã thu hồi)" và token của trạm bị từ chối (xuongTram.ts:64).

**7. In nhãn QR mã NV** (InTheQr.tsx)
- Ở tab Tổ, bấm **"In nhãn QR mã NV"**: mở màn hình phủ toàn trang.
- Chọn **"Cả xưởng (n)"** (mặc định), một tổ, hoặc **"Chưa gán tổ (n)"**.
- Chạm vào nhãn để bỏ hoặc chọn lại. Bấm **"In"** (khổ A4, 4 nhãn mỗi hàng, cỡ khoảng 45×55 mm, cắt theo nét đứt). Bấm **"Đóng"** để thoát.
- Mã QR chứa đúng mã NV. Chỉ in người đang làm (active).

**8. Nhân sự** (NhanSuXuong.tsx; xuongCongNhan.ts)
- **Nạp file:**
  1. Bấm **"Chọn file Excel / CSV"** (.xlsx, .xls, .csv). Máy chỉ đọc **sheet đầu tiên**.
  2. Máy tự đoán cột theo tiêu đề: Mã NV*, Họ tên*, Xưởng, Tổ, Chức vụ. Có thể sửa từng cột bằng ô chọn.
  3. Xem trước 5 dòng đầu.
  4. Tuỳ chọn tích **"Đánh nghỉ việc người của các xưởng trong file mà không có tên trong file"**.
  5. Bấm **"Nạp N người"**.
  6. Kết quả: "Đã nạp X người, bỏ qua Y dòng, đánh nghỉ việc Z người", kèm danh sách "Tổ không khớp…" và lỗi từng dòng (tối đa 20 dòng lỗi).
- **Quy tắc khi nạp** (xuongCongNhan.ts:154-207):
  - Mã NV khớp mẫu `^[A-Z0-9][A-Z0-9._-]{1,19}$` sau khi đổi chữ hoa và bỏ khoảng trắng.
  - Tối đa 5000 dòng.
  - File không có cột Xưởng thì lấy xưởng đang chọn.
  - Tổ được ghép theo **tên trùng** (không phân biệt hoa thường), chỉ với tổ đang hoạt động trong xưởng đó.
  - Người đã có thì được cập nhật: họ tên, xưởng, nguồn = "file", `active = true`. Tổ và chức vụ chỉ bị ghi đè khi file có giá trị.
  - Dòng thuộc xưởng mình không quản lý bị bỏ: "Dòng n: không có quyền xưởng …".
- **Danh sách:**
  - Có ô tìm **"Tìm mã NV, họ tên"**, bộ lọc tổ ("Mọi tổ (n)", "Chưa xếp tổ", từng tổ), ô tích **"Ẩn người nghỉ việc"**, nút **"Tải lại"**.
  - Đổi ô **Tổ** trên một dòng là lưu ngay, không hỏi xác nhận.
  - Nút **"Nghỉ việc"** / **"Khôi phục"** cũng lưu ngay.
  - Cột Nguồn: "File nhân sự" hoặc "Tổ trưởng thêm".
  - Chuyển tổ cần quyền quản lý ở **cả xưởng cũ lẫn xưởng mới** (xuongCongNhan.ts:136).

**9. Cần xem** (vận hành hằng ngày, không phải thiết lập)
- Mặc định lọc **"Cần xử lý (n)"**: chỉ các thao tác trong 30 ngày có cờ cần xử lý. Chọn "Mọi cờ, kể cả chỉ để biết" để xem hết.
- Quản lý bấm **"Huỷ"** trên một thao tác, nhập lý do (không bắt buộc), thông báo "Đã huỷ thao tác". Tổ trưởng chỉ xem được, không huỷ.

## Quy tắc & ràng buộc
- Tên tổ không được trùng trong một xưởng. Không đổi được xưởng của tổ hoặc công đoạn đã có (xuongSetup.ts:287, 339, 387).
- Công đoạn phụ trách phải thuộc xưởng của tổ (xuongSetup.ts:334).
- Không xoá được công đoạn, chỉ bỏ tích "Đang dùng". Gợi ý công đoạn kế chỉ xét công đoạn đang dùng (xuong.ts:791).
- Tổ ngừng hoạt động:
  - tổ trưởng mất phạm vi tổ đó (`toTruongCua` chỉ lấy tổ active, xuong.ts:84);
  - không quản lý được trạm hay chế độ của tổ (quyenTo của trạm đòi tổ active, xuongTram.ts:46);
  - không hiện trong ô chọn tổ ở Nhân sự, In QR, nạp file.
- Lịch ca `*` (mặc định) chỉ admin sửa được. "Bỏ lịch riêng" không áp dụng cho `*` (xuongSetup.ts:409, 424).
- Chế độ chấm không bao giờ đổi giữa ca, trừ khi chủ động tích "Áp dụng ngay hôm nay".

## Thông báo/lỗi hay gặp & cách xử lý

| Thông báo | Nguyên nhân / cách xử lý |
|---|---|
| "Cần quyền quản lý xưởng" / "Chỉ admin hoặc quản lý xưởng này được thay đổi" | Chưa được gán xưởng ở tab Quản lý xưởng. Nhờ admin gán. |
| "Công đoạn cần tên chi tiết và tên công đoạn xưởng" | Ô "Công đoạn chi tiết" hoặc "Công đoạn xưởng" đang trống. |
| "Xưởng đã có tổ trùng tên" | Đặt tên tổ khác. |
| "Công đoạn phụ trách phải thuộc xưởng của tổ" | Bỏ tích công đoạn của xưởng khác. |
| "Chỉ admin được cấp quyền tài khoản" | Quản lý thường gửi yêu cầu cấp quyền. Nhờ admin. |
| "Chỉ quản lý xưởng được đổi chế độ chấm của tổ" | Tổ trưởng tự đổi chế độ. Nhờ quản lý. |
| "Giờ phải dạng HH:MM" / "Chỉ admin sửa lịch mặc định" | Sai định dạng giờ / người không phải admin bấm "Lưu mặc định". |
| "Máy chủ chưa chạy file backend/sql/2026-10-13_xuong_cham_cong.sql" (tab Nhân sự) | Chưa bật bảng công nhân. Cần chạy SQL. |
| "Máy chủ chưa bật trạm quét" | Chưa chạy SQL `2026-10-16_xuong_tram.sql`. |
| "File không đúng dạng (cần mã NV, họ tên)" / "Dòng n: thiếu / sai mã NV hoặc họ tên" | Kiểm tra lại các cột đã chọn, hoặc mã có ký tự lạ. |
| "Tổ không khớp tên tổ trong hệ thống…" | Người vẫn được nạp nhưng chưa xếp tổ. Sửa tên tổ trong file cho khớp, hoặc xếp tay ở Nhân sự. |
| "Chưa có xưởng nào trong danh mục…" | Chạy `backend/sql/2026-10-12_xuong_danh_muc_mra.sql`. |

## Chỗ dễ nhầm
1. **Quản lý mà cũng là tổ trưởng thì không cấu hình được.** Nếu tài khoản không phải admin đang là tổ trưởng của một tổ đang hoạt động, trang MRA chỉ hiện các mục xem cho tổ đó (xuongSetup.ts:75, 83). Muốn cấu hình thì phải bỏ người đó khỏi vai trò tổ trưởng, hoặc dùng tài khoản khác.
2. **Lưu tổ ghi đè thay đổi đã làm ở Nhân sự.** Chuyển tổ hoặc cho nghỉ việc ở tab Nhân sự chỉ sửa bảng `xuong_cong_nhan`, không đóng dòng trong `xuong_to_thanh_vien`. Vì vậy mã NV đó vẫn nằm trong ô Thành viên của tổ cũ. Lần sau ai bấm "Lưu tổ" cho tổ cũ, người đó bị **kéo về tổ cũ và bật lại "đang làm"** (xuongSetup.ts:93-98, 367-373). Trước khi lưu tổ, nên xoá các mã đã chuyển đi khỏi ô Thành viên.
3. **"Lưu chế độ" đóng form tổ.** Nút này gọi `xong()` để đóng form và tải lại. Mọi sửa đổi về tên, tổ trưởng, công đoạn, thành viên **chưa bấm "Lưu tổ" sẽ mất**. Nên lưu tổ trước, rồi mở "Sửa" lại để đổi chế độ.
4. **Tổ mới chưa có khung chế độ chấm và trạm.** Phải bấm "Thêm tổ" trước, sau đó mới "Sửa" để chọn chế độ.
5. **Bỏ người khỏi ô Thành viên** thì họ rời tổ từ hôm qua (`den_ngay = hôm qua`), tức biến mất ngay trong hôm nay. Ở Nhân sự họ thành "chưa xếp tổ", **không** bị đánh nghỉ việc.
6. **Tích "Đánh nghỉ việc…" khi nạp file một phần.** Mọi người của xưởng có trong file mà không có tên trong file đều bị nghỉ việc và mất tổ. File chỉ có một tổ cũng khiến cả xưởng còn lại bị nghỉ việc.
7. **Bỏ quản lý xưởng không gỡ quyền `xuong_quan_ly`.** Lệnh chỉ xoá dòng trong bảng `xuong_quan_ly` (xuongSetup.ts:447). Người đó vẫn thấy menu MRA nhưng vào sẽ bị báo "Cần quyền quản lý xưởng". Muốn gỡ hẳn thì gỡ quyền ở Quản lý người dùng.
8. **Thông báo trong màn In QR dẫn sai chỗ.** Màn hình ghi "gán tổ ở Báo cáo → Công nhân" (InTheQr.tsx:65-66), nhưng thực tế gán tổ và nạp file nằm ở tab **Nhân sự**, hoặc ô Thành viên của tab Tổ.
9. **Đổi tổ ở Nhân sự là lưu ngay**, không hỏi xác nhận. "Nghỉ việc" ở Nhân sự giữ nguyên tổ (chỉ đặt `active = false`), khác với nghỉ việc khi nạp file (bỏ luôn tổ).
10. **Ô "Thứ tự" công đoạn** không quyết định tuyến của hạng mục đã triển khai. Tuyến khai ở Triển khai hạng mục được ưu tiên; thứ tự chỉ là gợi ý khi chưa có tuyến.
11. **Nút "Lưu cho X" luôn bấm được khi xưởng đang dùng lịch mặc định.** Bấm vào là tạo lịch riêng, sao chép đúng giờ mặc định. Từ đó xưởng không còn nhận các thay đổi của lịch mặc định nữa, cho tới khi bấm "Bỏ lịch riêng".

Các file chính: `C:\project_v2\frontend\components\Xuong\XuongSetup.tsx`, `C:\project_v2\frontend\components\Xuong\XuongSetupMuc.tsx`, `C:\project_v2\frontend\components\Xuong\NhanSuXuong.tsx`, `C:\project_v2\frontend\components\Xuong\InTheQr.tsx`, `C:\project_v2\frontend\App.tsx`, `C:\project_v2\backend\src\routes\xuongSetup.ts`, `C:\project_v2\backend\src\routes\xuongCongNhan.ts`, `C:\project_v2\backend\src\routes\xuongTram.ts`, `C:\project_v2\backend\src\routes\xuong.ts`.

---

# PHẦN 2: TRIỂN KHAI HẠNG MỤC VÀO CHUYỀN (module Xưởng / MRA)

> Viết theo code hiện tại, gồm cả phần sửa chưa commit. Đường dẫn file tính từ `C:\project_v2`. Số dòng của `backend/src/routes/xuongSetup.ts` là số dòng thật trong file.

## Mục đích

"Triển khai" trong MRA nghĩa là **xưởng chính đưa một số lượng của hạng mục (HEX) vào chuyền sản xuất trên app**. Mỗi lần triển khai khai báo ba thứ:
- số bộ triển khai đợt này;
- các thành phần của hạng mục: GỖ / SOFA / KIM LOẠI / KÍNH / ĐÁ (`backend/src/server/xuong/state.ts:51`);
- với mỗi thành phần: xưởng nào làm và đi qua tuyến công đoạn chi tiết nào.

Bấm "Triển khai" xong thì công đoạn đầu tuyến của từng thành phần thấy hàng ở mục **"Chờ nhận"**, và tổ phụ trách nhận được thông báo. Nếu một thành phần giao cho xưởng phụ mà để trống tuyến, xưởng phụ phải tự vào mục **Khai CĐ chi tiết** khai tuyến (gọi là QT2).

**Khác với "Triển khai bản vẽ" (TKBV):** TKBV là mốc P002 ("Triển khai BV", đơn vị "bản vẽ", lấy từ nguồn TKBV) trên Dashboard / Công trình (`frontend/components/Dashboard/components/sections/OrderOverviewSection.tsx:438`). Đó là việc phòng kỹ thuật ra bản vẽ, không có trên app Xưởng. Triển khai MRA ghi sự kiện `trien_khai` vào sổ `xuong_su_kien` (DB MRA, Supabase), chỉ dùng để mở hàng cho chuyền. Hai việc độc lập nhau: một hạng mục đã có TKBV vẫn có thể chưa triển khai trên app, và ngược lại.

## Ai dùng & quyền

| Việc | Ai được | Kiểm ở đâu |
|---|---|---|
| Xem danh sách triển khai (`GET /api/xuong/trien-khai`), bấm Triển khai (`POST`) | ADMIN (mọi xưởng), hoặc tài khoản có quyền `xuong_quan_ly` **và** có dòng trong bảng `xuong_quan_ly` cho đúng xưởng đó | `xuongSetup.ts:543-544`, `:614-615`; `backend/src/routes/xuong.ts:73-80` |
| Khai CĐ chi tiết (xưởng phụ) | Quản lý của **xưởng phụ** đó (hoặc ADMIN) | `xuongSetup.ts:698-699`, `:735-736` |
| Theo dõi triển khai | ADMIN, quản lý xưởng, **và tổ trưởng** (tổ trưởng chỉ thấy hạng mục đi qua công đoạn tổ mình) | `phamViXem` ở `xuong.ts:96-105`; lọc `quaTo` ở `xuongSetup.ts:828, 878-880` |
| Nút "Triển khai" trên app điện thoại | Hiện khi tài khoản có quyền `xuong_quan_ly` (`XuongApp.tsx:78, 757`; nút ở Tổng quan `TongQuanXuong.tsx:196`). Server vẫn kiểm theo bảng `xuong_quan_ly` | như dòng đầu |
| Huỷ một sự kiện | Quản lý của xưởng ghi trên sự kiện, hoặc ADMIN | `xuongSetup.ts:~493-515` (`POST /api/xuong/huy`) |
| Huỷ một đợt triển khai (nút "Huỷ đợt này" ở Theo dõi triển khai) | Quản lý của **xưởng chính** của đợt, hoặc ADMIN | `POST /api/xuong/trien-khai/huy` |

Tổ trưởng mở Quản lý xưởng chỉ thấy 3 mục "Theo dõi triển khai", "Cần xem", "Báo cáo" (`XuongSetup.tsx:34, 71-73`). Họ không có mục Triển khai hay Khai CĐ chi tiết.

## Các bước

### A. Triển khai trên máy tính: Quản lý xưởng → mục "Triển khai hạng mục"

1. **Chọn xưởng** ở đầu màn Quản lý xưởng, rồi chọn mục **"Triển khai hạng mục"** (`XuongSetup.tsx:23`).

2. **Danh sách hạng mục tự tải** (`xuongSetup.ts:540-589`):
   - Nguồn là bảng `production_status_app` ở Layerbase. Lấy dòng có `xuong_chinh` (đã cắt khoảng trắng, viết hoa) đúng bằng xưởng đang chọn, có hex, và cột `tam_ngung_huy_don_hang_tong` trống (bỏ hạng mục tạm ngưng / huỷ đơn) (`:549`).
   - Mỗi hex lấy dòng `updated_at` mới nhất, sắp mới nhất trước, **tối đa 300 dòng** (`:555-559`).
   - Cột **"Đã triển khai"** = tổng số lượng các sự kiện `trien_khai` còn hiệu lực (chưa bị huỷ) của xưởng này (`:562-565`).

3. **Lọc**:
   - Ô **"Tìm hex, hạng mục, công trình"** tìm theo hex, tên hạng mục, tên công trình, mã công trình. Gõ xong khoảng 0,4 giây thì tự tải lại (`TrienKhaiXuong.tsx:31`, `xuongSetup.ts:551-554`).
   - Ô tick **"Chỉ hạng mục chưa triển khai đủ"** được **bật sẵn** (`TrienKhaiXuong.tsx:21`). Khi bật, chỉ hiện hạng mục có Đã triển khai < Đơn hàng, hoặc chưa có số đơn hàng (`xuongSetup.ts:581`).
   - Nút **"Tải lại"** để tải lại danh sách.

4. **Tick chọn hạng mục** (từng dòng, hoặc ô "Chọn tất cả" ở đầu bảng).

5. **Số lượng**: cột **"Triển khai lần này"** điền sẵn số còn lại = Đơn hàng − Đã triển khai. Nếu chưa có số đơn hàng thì điền 1 (`TrienKhaiXuong.tsx:187`). Có thể sửa; số âm bị đưa về 0.

6. **Thành phần · tuyến công đoạn**:
   - Cột này của mỗi dòng có thể có sẵn **gợi ý**, kèm nhãn xanh "gợi ý". Gợi ý lấy từ lần triển khai gần nhất (chưa huỷ) của **cùng nhóm sản phẩm** (`phan_loai_nhom_san_pham`) tại xưởng này (`xuongSetup.ts:49-67, 572-574`).
   - Dữ liệu triển khai kiểu cũ chỉ có một tuyến; khi đó gợi ý thành 1 thành phần GỖ của xưởng chính.
   - Dòng chưa hợp lệ hiện chữ cam: "Chưa có thành phần — khai ở dưới", "GỖ: chưa có tuyến", "…: đầu tuyến phải thuộc xưởng X".

7. **Soạn mẫu ở khung "Công đoạn thành phần (N hạng mục đã chọn)"**:
   - Bấm **"+ Thêm thành phần"**. Lần lượt lấy tên chưa dùng: GỖ → SOFA → KIM LOẠI → KÍNH → ĐÁ. Mỗi tên chỉ dùng một lần. Hạng mục một khối thì chỉ cần GỖ.
   - Với mỗi thành phần:
     - Chọn tên ở ô chọn đầu khung.
     - Chọn **"Xưởng thực hiện"**: "X (xưởng chính)" hoặc "Y — xưởng phụ". Danh sách là các xưởng có công đoạn đang dùng. **Đổi xưởng thì tuyến của thành phần đó bị xoá trắng** (`TrienKhaiXuong.tsx:147`).
     - Chọn tuyến bằng ChonTuyen: ô chọn **"+ Chọn công đoạn đầu tuyến…"**, sau đó là **"+ Thêm công đoạn kế tiếp…"**. **Chọn một dòng là công đoạn được thêm luôn vào cuối tuyến**, không có nút "Thêm" riêng (`ChonTuyen.tsx:47-48`).
     - Công đoạn trong ô chọn chia nhóm theo "Xưởng X (xưởng thực hiện)" và các xưởng khác. Mỗi công đoạn trên tuyến có nút ↑ "Lên", ↓ "Xuống", × "Bỏ".
     - **Công đoạn đầu tuyến phải thuộc xưởng thực hiện**. Sai thì hiện chữ đỏ "Công đoạn đầu tuyến phải thuộc xưởng X." (`ChonTuyen.tsx:29, 45`). Các công đoạn sau được phép thuộc xưởng khác, ví dụ tuyến KIM LOẠI của 8C kết thúc ở Fitting của xưởng chính.
     - Thành phần giao xưởng phụ được phép để trống tuyến. Khi đó hiện dòng "Để trống: xưởng Y nhận thông báo và tự khai CĐ chi tiết."
     - Bấm × ở góc khung để bỏ thành phần.
   - Nút **"Lấy thành phần của <hex>"** chỉ hiện khi đang chọn đúng 1 hạng mục đã có thành phần. Bấm để chép thành phần của hạng mục đó vào mẫu.
   - Nút **"Áp cho N hạng mục đã chọn"** chép mẫu vào mọi hạng mục đang tick. Nút bị mờ khi mẫu chưa hợp lệ.

8. **Kiểm "sẵn sàng"** (`TrienKhaiXuong.tsx:48-64`). Dòng tóm tắt "**x / N hạng mục sẵn sàng (có số lượng > 0 và thành phần hợp lệ).**" Một hạng mục sẵn sàng khi:
   - đang được tick;
   - số lượng > 0;
   - thành phần hợp lệ: có ít nhất 1 thành phần; thành phần của xưởng chính có tuyến; tuyến nào có thì đầu tuyến thuộc đúng xưởng thực hiện.

   **Trường hợp đặc biệt:** nếu thành phần riêng của hạng mục chưa hợp lệ mà mẫu đang soạn hợp lệ, hệ thống **tự dùng mẫu**, không cần bấm "Áp cho…" (`:58-63`). Hạng mục không sẵn sàng thì bị bỏ qua, kèm dòng cam: "Hạng mục thiếu số lượng hoặc thành phần / tuyến sẽ không được triển khai."

9. **Bấm "Triển khai x hạng mục"** (nút chính có hình tên lửa). Chỉ các hạng mục sẵn sàng được gửi đi. Server làm các việc sau (`xuongSetup.ts:608-673`):
   - Kiểm dữ liệu: mã 9 số, số lượng > 0 và ≤ 1.000.000, 1–200 hạng mục mỗi lần (`:598-606`).
   - Thành phần không được trùng tên; thành phần của xưởng chính phải có tuyến (`:620-627`).
   - Hạng mục phải có `xuong_chinh` đúng xưởng này. Phép kiểm này **có tính nhóm xưởng gộp** `workshopGroupSql` (`:629-635`).
   - Mọi công đoạn trên tuyến phải tồn tại và đang dùng (`active`); đầu tuyến thuộc xưởng thực hiện (`:638-645`).
   - Trong một giao dịch, ghi vào `xuong_su_kien`:
     - 1 sự kiện **`trien_khai`** cho mỗi hạng mục (xưởng = xưởng chính, số lượng, `du_lieu.thanhPhan`) (`:648-653`);
     - 1 sự kiện **`khai_bao_cd`** cho **mỗi thành phần đã có tuyến**: số lượng bằng đủ số bộ, `cong_doan_den_id` = công đoạn đầu tuyến (`:655-661`).
   - `ghiVaTinhLai` tính lại bảng **`xuong_trang_thai`** cho từng cặp (hex, công đoạn đầu tuyến). Cặp đó có `sl_giao_den` > `sl_nhan`, nên app hiện "Chờ nhận".
   - Gửi thông báo cho tổ đầu tuyến ("Có hàng giao tới <công đoạn>") và cho xưởng phụ được giao thành phần ("… cần khai CĐ chi tiết") (`:668-669`; `backend/src/routes/xuongThongBao.ts:109, 138`).
   - Báo thành công: "Đã triển khai N hạng mục — công đoạn đầu tuyến từng thành phần đã thấy "Chờ nhận"; thành phần giao xưởng phụ chờ xưởng phụ khai CĐ chi tiết". Danh sách tự tải lại.

10. **Triển khai nhiều đợt**: được phép. Mỗi lần bấm là một sự kiện `trien_khai` mới. "Đã triển khai" là tổng các đợt. Với một thành phần, tuyến của lần sau thay tuyến lần trước (`state.ts:57-69`).

### B. Xưởng phụ khai CĐ chi tiết: mục "Khai CĐ chi tiết"

1. Quản lý xưởng phụ chọn xưởng của mình, mở **"Khai CĐ chi tiết"**. Bảng "Thành phần xưởng chính giao cho xưởng Y — chờ khai CĐ chi tiết" liệt kê các thành phần thoả cả ba điều kiện (`xuongSetup.ts:680-693`):
   - nằm trong sự kiện triển khai chưa huỷ;
   - có `xuong` = xưởng này và tuyến trống;
   - chưa có `khai_bao_cd` còn hiệu lực cho cặp (triển khai, thành phần).

   Tối đa 500 dòng. Cột: Hex, Hạng mục · công trình, Thành phần, Số bộ, "Xưởng chính · lúc triển khai", Tuyến CĐ chi tiết.
2. Tick các thành phần. Ở khung "Tuyến công đoạn chi tiết (N thành phần đã chọn)", chọn tuyến bằng ChonTuyen như bước A7. Đầu tuyến phải thuộc **xưởng phụ này**. Tuyến được phép kết thúc ở công đoạn hợp nhánh của xưởng chính.
3. Bấm **"Áp tuyến cho N thành phần đã chọn"**. **Bước này bắt buộc**: khác màn Triển khai, ở đây không tự dùng mẫu (`KhaiChiTietXuong.tsx:40, 94-96`). Dòng nào chưa áp vẫn hiện "Chưa khai — chọn ở dưới".
4. Bấm **"Khai CĐ chi tiết x thành phần"**. Server (`xuongSetup.ts:729-764`):
   - kiểm lại thành phần còn chờ;
   - kiểm công đoạn tồn tại / đang dùng, đầu tuyến thuộc xưởng phụ;
   - ghi `khai_bao_cd` với số lượng = số bộ của đợt triển khai và `du_lieu.trienKhaiId` trỏ về sự kiện triển khai;
   - tính lại trạng thái, báo tổ đầu tuyến.

   Thông báo: "Đã khai CĐ chi tiết N thành phần — tổ đầu tuyến đã thấy "Chờ nhận"".

### C. Triển khai trên app điện thoại (`/xuong`)

1. Tài khoản có quyền `xuong_quan_ly` bấm nút **"Triển khai"** ở một trong ba chỗ:
   - thanh việc của tổ (`XuongApp.tsx:757`);
   - màn Tổng quan xưởng, nút có hình tên lửa (`TongQuanXuong.tsx:196`);
   - màn "Tài khoản chưa được gán tổ nào", nút "Triển khai hạng mục" (`XuongApp.tsx:564`).

   Màn mở ra là bảng trượt **"Triển khai hạng mục"** (`TrienKhaiGon.tsx`).
2. Nếu tài khoản thấy nhiều xưởng thì có nút "Xưởng X" để chọn.
3. Nhập mã vào ô "Mã hạng mục (gõ vài số)", hoặc bấm biểu tượng quét để quét phiếu QR. Bấm **"Tìm theo tên hạng mục / công trình"** để chuyển sang bàn phím chữ.
   - Gõ từ 3 số trở lên, hoặc 2 chữ trở lên: hiện tối đa 12 hạng mục khớp để chọn (`:58-72`).
   - Đủ 9 số: tải thông tin hạng mục, hiện "Đơn hàng … · đã triển khai … · còn …".
4. **Số lượng triển khai**: bộ đếm, mặc định = số còn lại, đúng theo đơn vị hạng mục (có số lẻ nếu đơn vị cho phép) (`:48-53`). Nhập vượt số còn lại chỉ **cảnh báo** "Vượt số còn lại (…) — kiểm tra lại trước khi triển khai." hoặc "Hạng mục đã triển khai đủ số đơn hàng — …", **không chặn** (`:156-160`).
5. **Thành phần và tuyến không sửa được trên điện thoại.** App chỉ dùng **gợi ý theo nhóm sản phẩm**. Không có gợi ý, hoặc thành phần của xưởng chính trong gợi ý thiếu tuyến, thì nút bị mờ và hiện: "Chưa có thành phần / tuyến gợi ý cho nhóm này — triển khai trên máy tính (Setup dữ liệu → Xưởng) để chọn." (`:85, 170`).
6. Bấm **"Triển khai <số> <đvt>"**. App gọi cùng API như máy tính. Thành công thì báo "Đã triển khai … <hex> — <công đoạn đầu> thấy "Chờ nhận"". Thao tác này **cần có sóng**, không lưu chờ gửi; mất sóng thì báo "Cần có sóng để triển khai."

### D. Theo dõi triển khai: mục "Theo dõi triển khai"

1. Mở mục này trên máy tính, hoặc trên điện thoại (có trong 3 mục dành cho điện thoại). Chọn khoảng **"Triển khai 30 / 90 / 180 / 365 ngày gần nhất"** (mặc định 90), rồi **"Tải lại"** nếu cần.
2. **Nguồn dữ liệu** (`xuongSetup.ts:784-801`):
   - (a) các hạng mục xưởng này triển khai với tư cách xưởng chính, **hoặc** được giao thành phần với tư cách xưởng phụ, trong khoảng ngày đã chọn;
   - (b) cộng thêm các hạng mục **đang có hàng ở tổ trong xưởng mà chưa có sự kiện triển khai** nào. Đây là loại "**nhận thẳng**": tổ bấm nhận hàng mà không qua triển khai (hàng từ ngoài app, hoặc xưởng chưa dùng bước triển khai). Màn hình luôn gửi `tatCa=1`, nên có cả hạng mục đã xong.
3. **Các nút lọc**, mỗi nút kèm số đếm (`TheoDoiTrienKhai.tsx:12-16, 73-88`):

   | Nút | Điều kiện |
   |---|---|
   | **Chưa xong** (mặc định) | hạng mục chưa xong |
   | **Đang làm** | có công đoạn đang làm |
   | **Tạm ngưng** | có công đoạn tạm ngưng |
   | **Có hàng chờ nhận** | có công đoạn mà hàng giao đến > hàng đã nhận |
   | **Chờ xưởng phụ khai** | có thành phần giao xưởng phụ chưa khai tuyến |
   | **Chưa triển khai trên app** | hàng nhận thẳng, chưa xong |
   | **Không có trong KHSX** | không có dòng kế hoạch tuần / tháng trong bảng `khsx`, chưa xong |
   | **Đã xong** | hạng mục đã xong |

   Ô tìm "Tìm hex, hạng mục, công trình" lọc thêm trên kết quả.
4. **Mỗi thẻ hạng mục** gồm:
   - hex, tên, công trình;
   - "triển khai <SL> · <ngày>", hoặc "đơn hàng …" với hàng nhận thẳng;
   - nhãn kế hoạch "KH tuần n/năm · KHNK dd/mm", hoặc nhãn đỏ "Không có trong KHSX";
   - nhãn cam "Chưa triển khai trên app (nhận thẳng)" nếu là hàng nhận thẳng;
   - thanh tiến độ "Xong công đoạn cuối x/y";
   - từng thành phần với dãy ô công đoạn theo tuyến. Mỗi ô có trạng thái Đang làm / Tạm ngưng / Chờ nhận / Chờ giao / Đã nhận, chưa làm / Xong / Chưa tới, kèm tổ phụ trách và số nhận · xong · giao;
   - dòng "<THÀNH PHẦN>: chờ xưởng Y khai CĐ chi tiết";
   - hàng "Ngoài tuyến": công đoạn có hàng nhưng không nằm trong tuyến. Với hàng nhận thẳng, hàng này có nhãn "Công đoạn".
5. **Quy tắc "xong"** (`xuongSetup.ts:863-868`):
   - Hàng đã triển khai: không còn thành phần chờ khai, và công đoạn cuối của **mọi** thành phần đã hoàn thành ≥ số triển khai. Số xong lấy theo thành phần chậm nhất (min).
   - Hàng nhận thẳng: mọi công đoạn có hàng đều xong.

### E. Huỷ triển khai

- Màn **Theo dõi triển khai** (máy tính): mỗi thẻ hạng mục có mục mở ra **"Đợt triển khai (N)"**. Mỗi đợt ghi giờ, người triển khai, số lượng, thành phần (xưởng). Admin / quản lý **xưởng chính** của đợt thấy nút **"Huỷ đợt này"**: hỏi xác nhận + lý do (không bắt buộc) (`TheoDoiTrienKhai.tsx`, `DsDot`).
- Server `POST /api/xuong/trien-khai/huy { trienKhaiId, lyDo }` (`xuongSetup.ts`): trong một giao dịch ghi sự kiện `huy` (`sua_cho`) cho `trien_khai` và **mọi `khai_bao_cd` của đợt** (cả của xưởng phụ, `du_lieu.trienKhaiId`), người huỷ = `user_id`; tính lại mọi cặp (hạng mục, công đoạn) của hạng mục. Không xoá dòng.
- **Chặn** khi hàng của đợt đã được tổ nhận: sau khi huỷ mà ở công đoạn đầu tuyến số đã nhận trong app > số giao tới còn lại thì từ chối, câu báo "<Tổ> đã nhận N ở <CĐ> (huỷ xong chỉ còn giao tới M) — huỷ nhận ở tổ trước…". Nhận ngoài app (có ghi nguồn) không tính. Luật ở `backend/src/server/xuong/huyTrienKhai.ts` (`kiemTraHuyDot`, test `backend/test/xuongHuyTrienKhai.test.ts`).
- `POST /api/xuong/huy` (huỷ một sự kiện lẻ) vẫn còn, nhưng huỷ riêng `trien_khai` bằng đường này không huỷ các `khai_bao_cd` đi kèm.
- Khi huỷ, các truy vấn đều bỏ qua sự kiện đã huỷ:
  - "Đã triển khai" giảm;
  - gợi ý không lấy lần triển khai đó nữa;
  - mục Khai CĐ chi tiết không còn thành phần của đợt đó.

## Quy tắc & ràng buộc

1. **Chỉ xưởng chính của hạng mục được triển khai.** Xưởng chính lấy theo `production_status_app.xuong_chinh`, có tính nhóm xưởng gộp (`xuongSetup.ts:631-635`). Màn danh sách thì chỉ so đúng tên xưởng, không tính nhóm (`:549`).
2. Mỗi thành phần chỉ khai một lần cho một hạng mục. Thành phần của xưởng chính **bắt buộc có tuyến**. Thành phần giao xưởng phụ được phép để trống tuyến (`:620-627`).
3. **Đầu tuyến phải thuộc xưởng thực hiện thành phần.** Kiểm cả ở giao diện (`ChonTuyen.tsx:29`, `TrienKhaiXuong.tsx:52`) và ở server (`xuongSetup.ts:644`, `:750`).
4. Công đoạn trên tuyến phải đang dùng (`active`) (`:639-642`).
5. **Song song và hợp nhánh** (`state.ts:76-97`):
   - Mỗi thành phần có tuyến được cấp **đủ số bộ** ở công đoạn đầu tuyến của nó.
   - Ở công đoạn mà ≥ 2 thành phần cùng đi qua (ví dụ Fitting), số "giao đến" = **min theo thành phần**, cộng phần giao từ công đoạn chung phía trước. Nghĩa là chỉ nhận được số bộ đã về đủ mọi thành phần.
6. **Giới hạn nhận ở tổ** (`xuong.ts:307-340, 704-707`):
   - Mốc tối đa = tổng số đã triển khai cho xưởng của công đoạn (xưởng chính hoặc xưởng thực hiện thành phần).
   - Chưa triển khai thì mốc = số lượng đơn hàng.
   - Nhận vượt mốc bị từ chối: "Nhận vượt số đã triển khai X — còn nhận được Y".
7. **Không chặn triển khai vượt số đơn hàng** ở cả máy tính lẫn điện thoại. Server chỉ chặn số lượng ≤ 0 hoặc > 1.000.000.
8. Mỗi lần gửi tối đa 200 hạng mục (`:606`). Danh sách triển khai tối đa 300 dòng; Khai CĐ chi tiết tối đa 500; Theo dõi tối đa 400 hạng mục đã triển khai + 400 hạng mục đang có hàng.
9. Gợi ý thành phần theo **nhóm sản phẩm**, lấy lần triển khai mới nhất của nhóm đó tại xưởng (`:49-67`). Hạng mục không có nhóm sản phẩm thì dùng chung "nhóm rỗng".
10. Tổ trưởng ở Theo dõi chỉ thấy hạng mục đi qua công đoạn tổ mình. Trên thẻ vẫn hiện cả tuyến để thấy tổ trước / sau (`:828, 878`).

## Thông báo/lỗi hay gặp & cách xử lý

| Thông báo | Nguyên nhân | Xử lý |
|---|---|---|
| "Cần quyền quản lý xưởng này" (403) | Tài khoản không có quyền `xuong_quan_ly`, hoặc chưa có dòng trong `xuong_quan_ly` cho xưởng đó | Admin gán ở mục "Quản lý xưởng" |
| "Mỗi hạng mục cần mã 9 số, số lượng > 0 và ít nhất một thành phần / công đoạn" | Dữ liệu gửi sai: số lượng 0, không có thành phần… | Kiểm số lượng / thành phần |
| "<hex>: mỗi thành phần chỉ khai một lần" | Trùng tên thành phần | Bỏ thành phần trùng |
| "<hex>: thành phần của xưởng chính cần tuyến công đoạn chi tiết" | Thành phần chọn xưởng chính mà để trống tuyến | Chọn tuyến, hoặc đổi sang xưởng phụ |
| "Không thuộc xưởng chính X: hex1, hex2…" | `xuong_chinh` của hạng mục ở dữ liệu sản xuất không phải xưởng này | Xưởng đúng phải triển khai, hoặc sửa dữ liệu sản xuất |
| "Công đoạn không tồn tại / đã tắt: …" | Công đoạn đã tắt ở mục Công đoạn, hay gặp khi dùng **gợi ý cũ** | Bật lại công đoạn, hoặc chọn tuyến khác |
| "<hex> · <TP>: công đoạn đầu tuyến phải thuộc xưởng Y" | Đầu tuyến sai xưởng | Đưa công đoạn của xưởng thực hiện lên đầu (nút ↑) |
| "Thành phần <TP> không còn chờ xưởng Y khai (đã khai hoặc triển khai đã huỷ)" | Người khác đã khai, hoặc đợt triển khai bị huỷ | Bấm "Tải lại" |
| "Mỗi thành phần cần ít nhất một công đoạn chi tiết" | Khai CĐ chi tiết với tuyến trống | Chọn tuyến rồi "Áp tuyến…" |
| App: "Chưa có thành phần / tuyến gợi ý cho nhóm này — triển khai trên máy tính…" | Nhóm sản phẩm chưa từng triển khai ở xưởng này | Triển khai lần đầu trên máy tính; từ lần sau app có gợi ý |
| App: "Không thấy hạng mục <hex> có xưởng chính X." | Hex không có xưởng chính X, hoặc đang tạm ngưng / huỷ đơn | Kiểm lại dữ liệu sản xuất, chọn đúng xưởng |
| App: "Cần có sóng để triển khai." | Mất mạng | Có sóng rồi thử lại |
| Tổ: "Nhận vượt số đã triển khai X — còn nhận được Y" | Tổ nhận nhiều hơn số đã triển khai | Triển khai thêm đợt mới, hoặc nhận đúng số |

## Chỗ dễ nhầm

1. **"Triển khai" ở MRA không phải TKBV.** TKBV là mốc bản vẽ (P002) trên Dashboard. MRA triển khai là mở hàng cho chuyền.
2. **Ô "Chỉ hạng mục chưa triển khai đủ" bật sẵn.** Hạng mục đã triển khai đủ sẽ không hiện; muốn triển khai thêm hoặc xem lại thì bỏ tick.
3. **Đổi "Xưởng thực hiện" là mất tuyến** của thành phần đó.
4. **Ô chọn công đoạn thêm ngay khi chọn**, không có nút "Thêm". Chọn nhầm thì bấm × để bỏ.
5. Ở màn Triển khai, mẫu hợp lệ được **tự dùng** cho hạng mục chưa có thành phần hợp lệ. Hạng mục **đã có gợi ý hợp lệ thì vẫn giữ gợi ý**, không lấy mẫu. Muốn thay thì phải bấm "Áp cho … hạng mục đã chọn". Ngược lại, ở Khai CĐ chi tiết **bắt buộc** bấm "Áp tuyến…".
6. **Thành phần xưởng phụ để trống tuyến thì chưa có "Chờ nhận" ở đâu cả**, cho tới khi xưởng phụ khai CĐ chi tiết. Theo dõi hiện dòng "chờ xưởng Y khai CĐ chi tiết" và nút lọc "Chờ xưởng phụ khai".
7. **Công đoạn hợp nhánh (Fitting) nhận được ít hơn số triển khai** là đúng thiết kế: chỉ tính số bộ đã đủ mọi thành phần.
8. **Danh sách triển khai và Theo dõi khác nguồn.** Danh sách lấy từ dữ liệu sản xuất (Layerbase), tối đa 300 dòng mới nhất, nên hạng mục cũ có thể không hiện; khi đó dùng ô tìm. Theo dõi lấy từ sổ sự kiện MRA.
9. **"Nhận thẳng" / "Chưa triển khai trên app"** là hàng tổ đã nhận mà không qua bước triển khai. Mốc nhận khi đó là số đơn hàng. Hàng này không có tuyến, nên chỉ hiện ở hàng "Công đoạn".
10. **App điện thoại không sửa được thành phần / tuyến**, chỉ dùng gợi ý theo nhóm sản phẩm. Gợi ý có thể chứa công đoạn đã tắt và bị server từ chối. App cũng không chặn triển khai vượt đơn hàng, chỉ cảnh báo.
11. **Nút "Triển khai" trên app hiện theo quyền `xuong_quan_ly` chung.** Người có quyền này mà chưa được gán vào xưởng (`xuong_quan_ly`) vẫn thấy nút, nhưng bấm sẽ bị "Cần quyền quản lý xưởng này".
12. **Không có nút huỷ triển khai** (xem mục E). Theo code, huỷ `trien_khai` **không tự huỷ kèm các `khai_bao_cd`** đã sinh ra cùng lúc: `POST /api/xuong/huy` chỉ huỷ đúng một sự kiện (`xuongSetup.ts:~505-510`). Vì vậy hàng "Chờ nhận" ở đầu tuyến vẫn còn, trong khi mốc nhận lại tụt về số đơn hàng. Điểm này tôi suy ra từ code, chưa chạy thử; muốn huỷ sạch thì phải huỷ cả các `khai_bao_cd` có `du_lieu.trienKhaiId` = id đợt triển khai.

---

# PHẦN 3: App tổ trưởng trên điện thoại (`/xuong`)

## Mục đích
Tổ trưởng dùng điện thoại để ghi việc của tổ: nhận hàng, bắt đầu, tạm ngưng, xong, giao, điểm danh / chốt quân số, tăng ca, xác nhận cuối ngày. Mỗi lần bấm được **lưu trên máy trước** (IndexedDB), màn hình đổi ngay, rồi app gửi lên máy chủ. Vì vậy app vẫn dùng được khi mất sóng (`XuongApp.tsx:31-35`, `services/xuongQueue.ts:4-11`). Quản lý xưởng cũng dùng app này để xem hoặc ghi hộ một tổ, và để triển khai hạng mục.

## Ai dùng & quyền
- **Vào được app:** tài khoản có quyền `xuong` hoặc `xuong_quan_ly` (`backend/src/routes/xuong.ts:69-70`). Không có quyền thì đăng ký máy báo "Tài khoản chưa được cấp quyền mục Xưởng" (`xuong.ts:399`).
- **Danh sách tổ của tài khoản:** gồm tổ mà tài khoản là tổ trưởng (`to_truong_user_id`) và tổ có mã NV (msnv) của tài khoản trong danh sách thành viên còn hiệu lực (`xuong.ts:415-419`).
- **Được ghi vào tổ nào:** người của tổ (tổ trưởng hoặc thành viên theo mã NV). Quản lý của xưởng đó cũng ghi được, khi đó sự kiện mang cờ `quan_ly_ghi_ho`. Người khác bị từ chối với lý do "Tài khoản không thuộc tổ này" (`xuong.ts:681-690`).
- **Ghi người vào / ra hàng (Phân công, Sửa ngày):** chỉ tổ trưởng của tổ hoặc quản lý xưởng (`xuong.ts:672-679`).
- **Huỷ một sự kiện:** được huỷ nếu là một trong ba trường hợp sau (`xuong.ts:656-663`, `57-60`):
  - người gửi, trong vòng 24 giờ;
  - quản lý xưởng, không giới hạn thời gian;
  - tổ trưởng, với sự kiện trạm của tổ mình (cờ `tram` hoặc `to_truong_ghi_ho`), trong vòng 7 ngày.
- **Menu dưới của app** (`XuongShell.tsx:45-56`):

  | Mục | Ai thấy |
  |---|---|
  | Tổ, Tra cứu, Tài khoản | mọi người |
  | Tổng quan | chỉ quản lý **không** làm tổ trưởng tổ nào |
  | Báo cáo | tổ trưởng; chỉ thấy số liệu tổ mình, backend lọc theo `phamViXem` (`xuong.ts:96-105`) |
  | Quản lý | quản lý không làm tổ trưởng |

- **Nút Triển khai** chỉ hiện với quyền `xuong_quan_ly` (`XuongApp.tsx:757`).

## Các bước

1. **Đăng nhập:** màn "MRA" hiện dòng "Ghi việc của tổ: nhận hàng, bắt đầu, xong — giao". Ô "Ghi nhớ" bật sẵn. Lần đầu dùng phải có sóng (`DangNhapXuong.tsx:17-19`).
   - Nếu phiên hết hạn (lỗi 401) mà máy còn thao tác chưa gửi, màn đăng nhập báo "Còn N thao tác chưa gửi — đăng nhập để gửi. Các thao tác vẫn giữ trên máy." (`XuongApp.tsx:538-541`).
2. **Đăng ký máy (tự động):** app gọi `POST /api/xuong/thiet-bi` và nhận token Xưởng gắn với máy cùng danh sách tổ. Trong lúc chờ, màn hình hiện "Đang tải việc của tổ…".
   - Lỗi thì hiện câu báo kèm nút **Thử lại**.
   - Mất sóng nhưng máy đã từng đăng ký thì vẫn vào làm việc với hàng đợi (`XuongApp.tsx:116-132, 545-556`).
3. **Chọn tổ:**
   - Tài khoản có nhiều tổ: bấm tên tổ (có mũi tên ▼) để mở cửa sổ "Chọn tổ"; tổ đang mở có chữ "Đang chọn". App nhớ tổ chọn lần cuối (`XuongApp.tsx:646-653`, `XuongSheets.tsx:939-956`).
   - Chưa được gán tổ nào: hiện "Tài khoản chưa được gán tổ nào".
     - Quản lý thấy thêm 2 nút **Mở Tổng quan xưởng** và **Triển khai hạng mục**.
     - Người khác thấy lời nhắc báo quản lý gán vào tổ (Quản lý → Tổ & tổ trưởng) (`XuongApp.tsx:557-572`).
   - Quản lý chọn một tổ ở Tổng quan: màn tổ hiện "Ghi hộ · xưởng X" và link **Tổ của tôi** để quay về (`XuongApp.tsx:658-663`).
4. **Điểm danh đầu ca (bắt buộc với tổ bấm tay):**
   - Tổ trưởng mở tổ mình trong một ca chưa điểm danh thì app **tự mở** cửa sổ Điểm danh, mỗi tổ / ca / ngày một lần. Quản lý ghi hộ thì không tự mở (`XuongApp.tsx:307-316`).
   - Đầu màn có băng đỏ "Chưa điểm danh ca chính → Điểm danh". Với tổ không chấm công theo tên, băng là "Chưa chốt quân số … → Chốt" (`XuongApp.tsx:697-707`).
   - Ca chưa chốt mà bấm bất kỳ thao tác ghi nào (Nhận, Bắt đầu, Tiếp tục, Xong, Giao, Tạm ngưng, Tiến độ, Quét phiếu, Gõ mã) thì app mở Điểm danh trước. Lưu xong, app **tự làm tiếp** thao tác vừa bấm (`XuongApp.tsx:299-306`).
   - **Cửa sổ "Điểm danh ca chính"** (`DiemDanh.tsx:136-375`):
     - Lần đầu trong ca: cả tổ được tick sẵn là có mặt. Giờ vào lấy đúng giờ đầu ca, kể cả khi điểm danh muộn trong 30 phút đầu ca (`DiemDanh.tsx:155-159`). Dòng nhắc: "Lần điểm danh đầu tính mọi người vào đúng giờ đầu ca…".
     - Nút **Tất cả** / **Bỏ hết**. Chạm tên để tick hoặc bỏ tick.
     - Người chưa có mặt có nút **Trễ** (chỉnh giờ ở ô "Đến lúc").
     - Người đang có mặt có nút **Về sớm** (chọn giờ ở ô "Ra lúc" và lý do: Về sớm / Nghỉ giữa ca / Sang tổ khác / Vắng (tick nhầm)).
     - Giờ vào / ra chung và lý do nằm ngay trên nút lưu.
     - Tổ hơn 12 người: thêm ô tìm "Tìm tên / mã NV trong tổ" và bộ lọc "Cả tổ / Vắng / Trễ, về sớm".
     - **Thêm người / mượn người tổ khác:** tìm theo tên hoặc mã NV, cần có sóng. Kết quả hiện chữ "Thêm" (người của tổ), "Mượn" (tổ khác) hoặc "Đã có". Không thấy ai thì bấm **Thêm người mới vào tổ** (Mã NV + Họ tên → **Thêm vào tổ**).
     - Nút lưu đổi chữ theo tình huống: "Lưu điểm danh · N có mặt", "Lưu · N có mặt, M vắng", "Lưu thay đổi · N có mặt". Khi chưa thay đổi gì, nút hiện "N người có mặt" và bị khoá.
     - **Không điểm danh tên — chỉ nhập số người:** chuyển sang cửa sổ Chốt quân số.
   - Hệ thống ghi các sự kiện `vao_ca` / `ra_ca` (theo tên), `quan_so` (= số người có mặt), và `chia_nguoi` để gỡ người vừa ra ca khỏi hạng mục đang chạy (`XuongApp.tsx:326-349`).
   - **Chốt quân số** (`XuongSheets.tsx:69-86`): đếm −/+ hoặc gõ số (tối đa 500), có nút **Giống hôm qua (N)**. Nút chốt là **Chốt N người** (thêm "và bắt đầu…" nếu đang chờ một thao tác).
   - Sau khi chốt, đầu màn hiện ô "N có mặt · Điểm danh". Nếu có người có mặt chưa gắn việc, có thêm nút "**K chưa gắn việc**" để mở Chia người (`XuongApp.tsx:708-731`).
5. **Màn chính, 3 tab** (`XuongApp.tsx:762-788`). App tự mở tab đang có việc theo thứ tự Đang làm → Chờ nhận → Chờ giao (`XuongApp.tsx:149-153`).

   | Tab | Nhóm trong tab | Nút từng dòng |
   |---|---|---|
   | **Chờ nhận** | "Hàng giao tới tổ" | **Nhận N** |
   | **Đang làm** | "Đang chạy" (chạy lâu nhất lên đầu), "Tạm ngưng", "Chưa bắt đầu" (`xuongModel.ts:165-172`) | theo chế độ, xem bước 6 |
   | **Chờ giao** | "Xong, chờ giao" | **Giao N** |

   Tab trống hiện câu báo kèm nút "Xem N hạng mục …" để sang tab đang có hàng.

   Mỗi dòng hiện (`XuongDong.tsx`):
   - mã hạng mục, tên hạng mục, tên công trình;
   - trạng thái kèm biểu tượng: Đang chạy / Tạm ngưng / Chưa bắt đầu / Chờ nhận / Chờ giao;
   - thời gian đã chạy, hoặc lý do ngưng và đã ngưng bao lâu;
   - "N người: An, Bình +2" hoặc "chưa chia người";
   - số lượng: Giao tới · Nhận · Xong · Giao;
   - nhãn **Chờ gửi** / **Đã gửi**;
   - cờ đỏ tổ trưởng tự sửa được, ví dụ "Bấm bắt đầu 2 lần — kiểm tra lại" (`xuongModel.ts:262-270`).
6. **Nút từng dòng ở tab Đang làm, theo chế độ tổ** (`XuongApp.tsx:579-607`):
   - **Bấm tay** (chế độ `cu` / `song_song`):

     | Trạng thái dòng | Nút |
     |---|---|
     | Chưa bắt đầu | **Bắt đầu** |
     | Đang chạy | **Xong — giao** (công đoạn cuối tuyến thì là **Xong**) + **Tạm ngưng** + **Tiến độ** |
     | Tạm ngưng | **Tiếp tục** |

   - **Trạm** (`cheDo === 'tram'`):
     - Không có nút Bắt đầu / Tiếp tục / Chia người, và **không bắt điểm danh trước khi ghi** (`XuongApp.tsx:284-287`).
     - Chưa bắt đầu: dòng chỉ ghi "Quét thẻ + phiếu ở trạm để bắt đầu".
     - Các trạng thái khác: **Xong — giao / Xong** + **Tiến độ**. Nút **Tạm ngưng** chỉ hiện khi hàng đang chạy và có người ở hàng. Tạm ngưng ở tổ trạm sẽ ghi `nguoi_ra` cho từng người, tức là đưa cả nhóm ra khỏi hàng (`XuongApp.tsx:376-386`).
7. **Nhận** (`XuongSheets.tsx:420-511`, `XuongApp.tsx:417-432`). Mở bằng nút **Nhận N**, Quét phiếu, Gõ mã, hoặc **Nhận thêm vào tổ** (trong cửa sổ "Hạng mục … ở tổ").
   - Phần "Xem tình trạng & ảnh ở công đoạn trước" mở ra được.
   - Tổ có nhiều công đoạn thì chọn "Nhận vào công đoạn".
   - Số lượng mặc định là số còn phải nhận. Đơn vị đo (m², m³…) cho nhập số lẻ tối đa 3 chữ số, đơn vị đếm chỉ nhập số nguyên (`xuongModel.ts:226-228`).
   - **Giới hạn nhận:** tối đa = số đã triển khai (chưa triển khai thì lấy số lượng đơn hàng) trừ số đã nhận. App hỏi máy chủ (`gioi-han-nhan`) và hiện "Tối đa X — đã triển khai Y, đã nhận Z". Nhận đủ rồi thì nút khoá với chữ "Đã nhận đủ số triển khai". Mất sóng thì app không chặn, nhưng máy chủ vẫn từ chối khi vượt (`xuong.ts:703-708`).
   - Nếu chưa ai bấm giao hạng mục này cho tổ, phải chọn "Hàng từ đâu tới?". Có thể chọn công đoạn, mục "Xưởng khác…", hoặc "Xưởng X (chưa dùng app)". Chưa chọn thì nút hiện "(chọn nơi giao tới)".
   - Chọn "Ngày thực hiện": Hôm nay / Hôm qua / chọn ngày, tối đa 7 ngày trước. Ngày trước hôm nay là **khai bù**: ghi lúc 12:00 ngày đó và gắn cờ `khai_bu` (`XuongSheets.tsx:217-240`).
   - Ảnh "Ảnh hàng lúc nhận": chỉ hiện khi máy chủ đã bật kho ảnh.
   - Nhận xong, app chuyển sang tab Đang làm.
8. **Bắt đầu / Tiếp tục** (`XuongSheets.tsx:91-155`, `XuongApp.tsx:353-374`). Cửa sổ "Bắt đầu 123456789 — mấy người làm?" (hoặc "— ai làm?" với tổ chấm công theo tên).
   - **Theo số:** khai số người, có dòng "Tổ có Q người · D đang làm hạng mục khác · còn rảnh R". Khai vượt số rảnh thì hiện chữ đỏ khuyên chia lại người. Có nút **Tất cả người đang rảnh (R)**.
   - **Theo tên:** chạm tên trong cả tổ. Tên mờ là người đang ở hạng mục khác; chọn họ thì họ **chuyển** sang hạng mục này. Có nút **Chọn N người có mặt đang rảnh** và **+ Thêm người tổ khác / người mới**.
   - Nút xác nhận: **Bắt đầu với N người** / **Tiếp tục với N người**. Phải có ít nhất 1 người.
   - Bắt đầu xong, ở đáy màn có thể hiện dải vàng "N người đang rảnh" hoặc "Có hạng mục chưa có người", kèm nút **Chia đều** / **Chọn** (`XuongApp.tsx:793-801`).
9. **Chia người** (nút trên thanh việc, chỉ hiện khi tổ bấm tay, đã chốt quân số và có hạng mục đang chạy) (`XuongSheets.tsx:675-818`).
   - **Theo số:** mỗi hạng mục một bộ đếm. Dòng đầu báo "Còn rảnh X / Q người", vượt quân số thì báo "Khai N người — nhiều hơn quân số Q".
   - **Theo tên:** chọn hạng mục A/B/C ở trên, rồi chạm tên ở lưới bên dưới. Có lọc "Cả tổ / Chưa gắn", nút **Chia đều N**, **Gắn N vào A**. Nút lưu là **Lưu · còn K chưa gắn**.
10. **Tạm ngưng** (`XuongSheets.tsx:165-188`). Cửa sổ "Tạm ngưng … — vì sao?".
    - Chọn "Tiến độ đến lúc ngưng" 25 / 50 / 75 / 100% (không bắt buộc).
    - **Chạm một lần vào một ô lý do là ghi luôn.** Có 6 lý do: Thiếu vật tư / Chờ bản vẽ duyệt / Lỗi chất lượng / Chuyển việc gấp / Lệnh cấp trên / Khác.
    - Máy chủ bắt buộc phải có lý do: "Tạm ngưng phải chọn lý do" (`xuong.ts:473`).
11. **Tiến độ:** cửa sổ "Cập nhật tiến độ …", chọn 25 / 50 / 75 / 100%, rồi bấm **Lưu tiến độ X%**. Chưa chọn thì nút hiện "Chọn tiến độ" và bị khoá (`XuongSheets.tsx:202-215`).
12. **Xong — giao / Xong / Giao** (`XuongSheets.tsx:343-413`, `XuongApp.tsx:392-415`):
    - Số lượng mặc định là toàn bộ phần còn lại: còn làm (khi Xong) hoặc đã xong chưa giao (khi Giao). Bớt đi thì là xong hoặc giao **một phần**, màn báo "Còn X ở lại tổ."
    - Nơi giao: nếu chỉ có 1 công đoạn kế theo tuyến thì chọn sẵn, nhiều thì hiện các chip để chọn. Có link **Giao chỗ khác** để chọn trong xưởng hoặc xưởng khác. Hạng mục chưa có tuyến thì báo "Hạng mục chưa có tuyến — chọn nơi giao."
    - **Công đoạn cuối tuyến:** dòng chữ "Công đoạn cuối tuyến — xong là hạng mục xong ở xưởng, không cần giao." và nút chính **Xong — hết tuyến**. Hàng không vào tab Chờ giao.
    - Nút chính **Xong — giao** / **Giao** (chưa chọn nơi giao thì hiện "(chọn nơi giao)" và khoá). Nút phụ **Xong, hàng chưa chuyển — giao sau** chỉ ghi Xong; hàng sang tab Chờ giao, sau đó bấm **Giao N** ở đó.
    - Có chọn ngày thực hiện (khai bù). Khai bù mà mốc giờ sớm hơn lúc bắt đầu thì app tự lùi về ngay sau giờ bắt đầu (`XuongApp.tsx:395-398`).
    - Có ảnh "Ảnh hàng lúc giao" hoặc "Ảnh hàng lúc xong".
    - Máy chủ chặn: Xong không vượt số đã nhận, Giao không vượt số đã xong (`xuong.ts:710-715`).
13. **Thanh việc của tổ** (hàng nút vuốt ngang, `XuongApp.tsx:739-758`):

    | Nút | Hiện khi |
    |---|---|
    | **Chia người** | tổ bấm tay, có hạng mục đang chạy |
    | **Quân số ca …** (· N người / · chưa chốt) | tổ bấm tay, không chấm công theo tên |
    | **Tăng ca** | luôn hiện |
    | **Cuối ngày** (✓ khi đã xác nhận) | luôn hiện |
    | **Lịch sử** | luôn hiện |
    | **Điểm danh** + **Phân công** | tổ trạm |
    | **Sửa ngày** | chế độ `song_song` hoặc `tram` |
    | **Triển khai** | quản lý |

14. **Tăng ca** (`XuongSheets.tsx:516-579`, `XuongApp.tsx:458-472`):
    - Chọn ca: Ca 1–4 hoặc Chủ nhật, có giờ bên dưới; ca đã khai có chữ "(đã khai)".
    - Bỏ tick hạng mục nào không làm tăng ca.
    - Tổ theo tên: chọn người tăng ca (chọn sẵn người có mặt ca chính). Tổ theo số: nhập số người.
    - Bấm **Khai tăng ca ca 1 · N người**. App ghi `tang_ca` + `vao_ca` (theo tên, tính từ đầu ca tăng ca) + `quan_so`.
15. **Cuối ngày (xác nhận)** (`XuongSheets.tsx:590-670`, `XuongApp.tsx:474-514`):
    - Từ **15:30** mà còn hạng mục đang chạy và chưa xác nhận, đầu màn hiện băng "Xác nhận cuối ngày (N hạng mục đang chạy) → **Xác nhận**" (`xuongModel.ts:159`).
    - Nhanh nhất: bấm **Tất cả N hạng mục vẫn đang làm — xác nhận luôn**.
    - Hoặc chọn từng hạng mục: **Vẫn làm** / **Đã dừng**. Chọn Đã dừng thì phải chọn mốc "Đã dừng lúc": Thao tác cuối HH:MM / Hết ca chính / Hết ca tăng ca. Chưa chọn thì nút hiện "Chọn giờ đã dừng" và khoá.
    - Nút **Thêm**: thêm ảnh và tiến độ cho từng hạng mục.
    - Hệ thống ghi ngược thời gian: tổ bấm tay ghi `tam_ngung` lý do "Khác"; tổ trạm ghi `nguoi_ra` cho từng người. Sau đó ghi `xac_nhan_cuoi_ngay`.
16. **Lịch sử** (`XuongSheets.tsx:823-867`): "Lịch sử hôm nay", gồm thao tác **24 giờ qua** của tổ. Lượt quét trạm không nằm ở đây (`xuong.ts:1500-1503`).
    - Dòng nào huỷ được thì có nút **Huỷ**. Dòng đã huỷ bị gạch ngang và có chữ "Đã huỷ".
    - Huỷ = ghi sự kiện `huy` (`XuongApp.tsx:275-280`).
    - Ngoài ra, sau mỗi thao tác, ở đáy màn có dải đen "Đã ghi: …" với nút **Hoàn tác** trong **10 giây** (`XuongApp.tsx:254-256, 802-807`).
17. **Phân công** (chỉ tổ trạm, `PhanCong.tsx`): cửa sổ "Phân công đầu ca", cần có sóng.
    - Mỗi người có một ô chọn hàng, mặc định là hàng đang làm, nếu chưa thì hàng hôm qua (có chữ "(hôm qua)"). Mỗi người hiện "Có mặt" / "Chưa vào ca".
    - Nút **Giữ như hôm qua**, nút lưu **Lưu (N thay đổi)**.
    - Người đang "tự gán" được đánh dấu vàng; giữ nguyên hàng đó thì tính là xác nhận.
    - Ai không được phân công và không quét trong 30 phút thì hệ thống tự gán theo hàng hôm trước.
    - Chỉ tổ trưởng hoặc quản lý sửa được (`suaDuoc`, `xuongTram.ts:494`).
18. **Sửa ngày** (`SuaNgay.tsx`): cửa sổ "Sửa ngày — lượt quét ở trạm", có nút ‹ › để đổi ngày (không qua được ngày mai).
    - Mỗi người hiện các khoảng "Có mặt …", các đoạn ở hàng (nguồn: quét / phân công / tự gán / ghi hộ) và các cờ: Quên ra — tự đóng cuối ca / Quét ngoài giờ ca / Trống > 30 phút / Một hàng > 4 giờ / Vào ca, không vào hàng nào.
    - Đoạn quét có nút **Huỷ**. Đoạn tự gán có nút **Đúng** / **Không làm**.
    - Nút **Xác nhận cả tổ — N đoạn tự gán đúng**.
    - **Ghi hộ** một người: chọn Vào hàng / Ra hàng / Ra ca + giờ "Lúc", rồi bấm **Ghi**. Giờ ở tương lai không ghi được.
19. **Triển khai** (quản lý, `TrienKhaiGon.tsx`), cần có sóng:
    - Gõ mã hoặc tên (≥ 3 số hoặc ≥ 2 chữ), hoặc bấm nút quét.
    - Màn hiện Đơn hàng / đã triển khai / còn, và các thành phần & tuyến gợi ý theo nhóm sản phẩm.
    - Bấm **Triển khai N cái**. Không có tuyến gợi ý thì nút khoá, kèm câu "triển khai trên máy tính (Setup dữ liệu → Xưởng)".
    - Xong thì báo nhanh "Đã triển khai … — <công đoạn đầu> thấy "Chờ nhận"".
20. **Quét phiếu / Gõ mã** (đáy màn):
    - Quét QR lấy mã 9 số. Hạng mục đã ở tổ thì mở cửa sổ "Hạng mục … ở tổ" (gồm dòng và nút, thêm **Nhận thêm vào tổ** / **Đóng**). Hạng mục chưa ở tổ thì mở Nhận (`XuongApp.tsx:516-521`).
    - Gõ mã: gõ từ 3 số trở lên để có gợi ý, dòng thuộc tổ có nhãn "việc của tổ". Gõ đủ 9 số mà không có thì báo "Không có hạng mục mã … Kiểm tra lại số trên phiếu." Mất sóng thì có nút **Dùng mã …** (`XuongSheets.tsx:872-934`).
21. **Tra cứu** (mục riêng): quét hoặc gõ mã / tên, xem tiến độ qua các tổ, giờ công, dòng thời gian, ảnh. Có danh sách "Tra gần đây" (8 mã). Cần có sóng.
22. **Báo cáo trên app:** mục "Báo cáo" (tổ trưởng) hoặc "Quản lý" mở màn quản lý dạng nhúng trong app (`XuongSetup trongApp`). Số liệu bị backend giới hạn theo tổ của tổ trưởng.
23. **Làm mới:** nút ⟳ trên đầu màn gửi hàng đợi và tải lại việc + danh mục, kèm thông báo nhanh "Đang làm mới".

## Quy tắc & ràng buộc
- **Hàng đợi** (`xuongQueue.ts`):
  - Lưu IndexedDB trước, gửi theo lô tối đa 200 sự kiện. Gửi lại mỗi 20 giây, khi có mạng lại, và khi mở lại app (`XuongApp.tsx:227-240`).
  - Lỗi 429, lỗi máy chủ hay mất mạng: chờ tăng dần từ 1 đến 60 giây rồi thử lại, không mất sự kiện.
  - Lỗi 401: giữ hàng đợi và mở màn đăng nhập.
- **Thanh trạng thái gửi:** "Mất sóng · N thao tác chờ gửi" / "Đang gửi N thao tác" / "**Đã gửi hết**". Thao tác cũ nhất chờ quá **4 giờ** thì thanh chuyển đỏ và thêm "— quá 4 giờ, tìm chỗ có sóng" (`XuongApp.tsx:632-636, 655`; `xuongQueue.ts:21`).
- **Ảnh:**
  - Nén WebP trên máy, tối đa 3 ảnh mỗi thao tác. Trên điện thoại có nút **Chụp ảnh** (mở camera sau) và **Chọn ảnh**.
  - Máy chỉ giữ tối đa **20 ảnh chờ gửi** (`xuongQueue.ts:19, 54-57`).
  - Máy chủ chỉ nhận WebP / JPEG dưới 1 MB (`xuong.ts:859`).
  - Ảnh chỉ hiện khi máy chủ đã bật kho ảnh (`cv.anhBat`).
- **Số lượng chỉ có đủ, không có vượt:** nhận ≤ đã triển khai (hoặc đơn hàng), xong ≤ đã nhận, giao ≤ đã xong. Máy chủ cộng dồn theo thứ tự trong lô (`xuong.ts:629-718`).
- **Khai bù:** tối đa 7 ngày trước, ghi lúc 12:00 ngày đó, gắn cờ `khai_bu` (`xuong.ts:724`).
- **Bắt đầu / Tiếp tục thiếu số người:** máy chủ vẫn ghi nhưng gắn cờ `thieu_so_nguoi` (`xuong.ts:720`).
- **Mỗi người chỉ ở một hạng mục:** chọn người ở hạng mục khác thì app ghi thêm `chia_nguoi` để gỡ họ khỏi hạng mục cũ (`XuongApp.tsx:359-367`).
- **Ca cần chốt** (`xuongModel.ts:125-141`): ngày thường, trước giờ hết ca chính là ca chính. Sau đó, hoặc vào Chủ nhật, là ca tăng ca đã khai. Ngoài giờ làm thì không cần chốt.
- **Ngày trạm:** các thao tác bấm tay Bắt đầu / Tiếp tục / Tạm ngưng / Chia người **bị bỏ khi tính** (`server/xuong/tram.ts:43-44`).

## Thông báo / lỗi hay gặp & cách xử lý

| Thông báo | Nguyên nhân / cách xử lý |
|---|---|
| Thẻ đỏ "Không ghi được: <lý do> — <mã> (<mô tả>)" + nút **Làm lại** / **Bỏ qua** | Máy chủ từ chối sự kiện; máy rung báo. Bấm Làm lại để mở lại hạng mục (`XuongApp.tsx:686-695`) |
| "Nhận vượt số đã triển khai X — còn nhận được Y" | Giảm số nhận, hoặc nhờ quản lý triển khai thêm |
| "Xong nhiều hơn số đã nhận — còn X" / "Giao nhiều hơn số đã xong — còn X" | Thường do bấm lúc mất sóng trên số cũ; kiểm tra lại số |
| "Tài khoản không thuộc tổ này" | Chưa được gán tổ hoặc mã NV chưa có trong tổ; báo quản lý |
| "Chỉ người gửi (trong 24 giờ), tổ trưởng (sự kiện trạm của tổ, 7 ngày) hoặc quản lý xưởng được huỷ" | Nhờ quản lý xưởng huỷ |
| "Chỉ tổ trưởng của tổ hoặc quản lý xưởng được ghi hộ người vào / ra" | Thành viên thường dùng Phân công / Sửa ngày |
| "Chưa lưu được trên máy. Thao tác vừa bấm CHƯA được ghi." | Bộ nhớ đầy hoặc bị chặn; xoá bớt ảnh / ứng dụng rồi bấm lại (`XuongApp.tsx:678-684`) |
| "Máy đang giữ 20 ảnh chưa gửi — cần có sóng…" | Ra chỗ có sóng để máy gửi bớt ảnh |
| "Máy này đã bị thu hồi quyền mục Xưởng" / "Máy chưa đăng ký hoặc đã bị thu hồi cho tài khoản này" | Admin đã thu hồi; liên hệ admin |
| "Cần có sóng lần đầu để tải việc của tổ." / "Đang mất sóng — danh sách cập nhật lúc HH:MM" | Danh sách đang lấy từ bộ nhớ máy |
| "Máy chủ chưa bật mục Xưởng. Báo quản lý." | Chưa chạy SQL trên máy chủ |
| "Chưa cho phép dùng camera…" / "Không mở được camera trên máy này. Hãy gõ mã." | Dùng Gõ mã |
| "Đang mất sóng — lịch sử / Sửa ngày / phân công / tìm người cần có sóng." | Các màn này không chạy khi mất sóng |

## Chỗ dễ nhầm
- **Tổ trạm không bị bắt điểm danh** trước khi ghi, và không có Bắt đầu / Tiếp tục. Hàng chạy khi công nhân quét thẻ + phiếu. Dòng "Chưa bắt đầu" ở tổ trạm **không có nút Xong**.
- **Tổ song song** (`song_song`) vẫn bấm tay đủ nút như chế độ cũ, nhưng có thêm **Sửa ngày**.
- **Tạm ngưng ở tổ trạm** = đưa cả nhóm ra khỏi hàng. Muốn chạy lại thì công nhân phải quét lại ở trạm; app không có nút Tiếp tục.
- **"Xong, hàng chưa chuyển — giao sau"** chỉ ghi Xong. Hàng nằm ở tab Chờ giao cho tới khi bấm **Giao N**.
- **Lịch sử ghi 24 giờ, không phải "hôm nay" theo lịch.** Tiêu đề và lời nhắc chỉ nói "người bấm huỷ được trong 24 giờ", nhưng nút Huỷ cũng hiện cho quản lý xưởng (`xuong.ts:1522-1523`). Quyền 7 ngày của tổ trưởng chỉ áp cho lượt quét trạm, và những lượt này sửa ở màn **Sửa ngày**, không phải ở Lịch sử.
- **Hoàn tác chỉ có trong 10 giây.** Sau đó phải vào Lịch sử để huỷ.
- **Tổ trưởng không thấy Tổng quan** kể cả khi tài khoản có quyền quản lý. Mục "Quản lý" lúc đó đổi tên thành "Báo cáo" và chỉ có số liệu tổ mình.
- **Lần điểm danh đầu ca** tính mọi người vào đúng giờ đầu ca. Người đến trễ phải bấm **Trễ** ở từng người, không thì họ được tính đủ giờ.
- **Nhận khi mất sóng không bị chặn trên máy**, nhưng máy chủ vẫn từ chối nếu vượt giới hạn. Khi có sóng, thẻ đỏ "Không ghi được" mới hiện ra.

---

# PHẦN 4: Trạm quét (/xuong/tram) và chế độ chấm công

## Mục đích
- Trạm quét là một máy dùng chung của tổ (máy tính bảng hoặc điện thoại để cố định ở xưởng). Công nhân quét **thẻ NV** để vào ca và ra ca. Họ quét **phiếu PTHSP + thẻ** để vào hàng hoặc ra hàng. Từ đó hệ thống dựng ra các đoạn "ai ở hàng nào, từ lúc nào tới lúc nào". Ở tổ chạy chế độ `tram`, các đoạn này thay cho việc tổ trưởng bấm Bắt đầu / Tạm ngưng / Tiếp tục / Chia người và điểm danh tay (`backend/src/server/xuong/tram.ts:8-24`).
- Trạm còn ghi được **Nhận đủ** và **Xong hết**. Số lượng do máy chủ tự tính. Nhận một phần hay xong một phần vẫn phải làm trên app tổ trưởng (`routes/xuongTram.ts:34-37, 317-321`).

## Ai dùng & quyền
| Việc | Ai | Ràng buộc |
|---|---|---|
| Đăng ký máy làm trạm | Quản lý xưởng của xưởng chứa tổ, hoặc tổ trưởng của chính tổ đó | Tài khoản phải có quyền mục Xưởng (`xuongTram.ts:86-88`, `quyenTo` `:45-52`) |
| Xem danh sách trạm, Thu hồi trạm | Quản lý xưởng hoặc tổ trưởng của tổ | `xuongTram.ts:104-136` |
| Đổi chế độ chấm (`cu`/`song_song`/`tram`) | **Chỉ quản lý xưởng** | `xuongTram.ts:151-152`: "Chỉ quản lý xưởng được đổi chế độ chấm của tổ" |
| Quét ở trạm | Mọi công nhân đang active, kể cả người tổ khác | Trạm tải toàn bộ công nhân active (`xuongTram.ts:289-291`) |
| Sửa ngày (huỷ hoặc ghi hộ lượt quét) | Tổ trưởng của tổ hoặc quản lý xưởng | Nút "Sửa ngày" chỉ hiện khi chế độ khác `cu` (`XuongApp.tsx:756`) |

- Token trạm có phạm vi `tram`, chỉ gọi được `/api/xuong/tram/may/*`. Gọi chỗ khác sẽ nhận lỗi "Token trạm chỉ dùng được cho máy trạm". Chiều ngược lại, token người dùng gọi API máy trạm sẽ nhận "API này chỉ dành cho máy trạm đã đăng ký" (`server/xuong/auth.ts:101-102`).
- Token sống 30 ngày (`auth.ts:20`). Mỗi lần gọi `bang` hoặc `events` thành công, máy chủ trả token mới (`xuongTram.ts:69-70, 258, 442`), nên trạm dùng hằng ngày thì không bao giờ hết hạn.

## Các bước

### A. Đăng ký trạm (làm một lần cho mỗi máy)
1. Trên máy đặt ở tổ, mở **/xuong/tram**. Nếu máy chưa có token trạm, màn đăng nhập hiện câu "Máy này chưa là trạm quét. Quản lý xưởng hoặc tổ trưởng đăng nhập để đăng ký." (`TramQuet.tsx:717-719`).
2. Đăng nhập xong sẽ vào màn **"Đăng ký máy này làm trạm quét"**.
3. Chọn **Tổ** trong ô "— Chọn tổ —". Danh sách hiện mọi tổ dạng "xưởng · tên tổ", nhưng máy chủ chỉ cho tổ mà người đăng ký có quyền.
4. Nếu tổ có từ 2 công đoạn trở lên, sẽ hiện ô tick **"Công đoạn mặc định của trạm (không chọn = mọi công đoạn của tổ)"** (`:749-759`). Công đoạn đã tick **chỉ được ưu tiên** khi quét phiếu (`:460-462`). Nó không giới hạn việc trạm làm được.
5. Nhập **Tên trạm (vd "cửa kho")** nếu muốn (tối đa 80 ký tự), rồi bấm **"Đăng ký trạm"** (chữ đổi thành "Đang đăng ký…" trong lúc chờ).
6. Hệ thống tạo `device_id`, lưu dòng `xuong_phien_thiet_bi` loại `tram` (`xuongTram.ts:92-95`) và trả về token trạm cùng deviceToken. Máy **tự đăng xuất tài khoản người đăng ký**, chỉ giữ token trạm (`TramQuet.tsx:730-734`).
7. Quản lý xem các trạm ở máy tính, mục Setup, khối "Chấm công · trạm quét" → "Trạm của tổ (N)". Ở đó có nút **"Thu hồi"**, bấm sẽ hỏi "Thu hồi trạm này? Máy trạm sẽ phải đăng ký lại." (`XuongSetupMuc.tsx:40-45, 66-77`).

### B. Màn trạm
- **Đầu trang**: "Trạm {tổ} · {tên trạm}", xưởng, "N lượt chờ gửi". Có nhãn **"Có sóng"** hoặc **"Mất sóng — vẫn quét được"**, đồng hồ lớn và nút tải lại (`TramQuet.tsx:551-563`).
- **Dải chế độ** (`:565-571`):
  - `cu`: "Tổ đang chạy cách cũ: lượt quét được lưu nhưng chưa tính giờ công (quản lý bật chế độ trạm ở Setup)."
  - `song_song`: "Tuần chạy song song: tổ trưởng vẫn bấm như cũ, số của trạm chỉ dùng để so khớp."
  - `tram`: không có dải.
- **Bên trái, lúc đang chờ**: khung tối có nút "Bấm để quét bằng camera", dòng **"Quét phiếu hạng mục, rồi quét thẻ của bạn"**, dòng "Đầu ca / cuối ca: chỉ cần quét thẻ", và nút **"Gõ mã"**. Ô gõ mã ghi "Mã nhân viên hoặc mã hạng mục (9 số)", có nút Huỷ / Xong.
  - Máy quét USB hoặc Bluetooth kiểu bàn phím chạy trực tiếp: các phím cách nhau dưới 300 ms rồi Enter được coi là một lần quét (`:510-524`).
- **Bên phải, "Ai đang ở hàng nào"**: mỗi hàng ghi tên hạng mục, "N người", "hex · công đoạn" và danh sách tên. Khi trống thì hiện "Chưa ai ở hàng nào."
  - Dưới đó là khối vàng **"Đã vào ca, chưa ở hàng nào (N)"** (`:645-668`).
  - Nguồn dữ liệu: sổ trạm 36 giờ gần nhất, tính kiểu `so_khop`, nên **mọi chế độ đều hiện theo sổ trạm** (`xuongTram.ts:224-228`).
  - "Đã vào ca" gồm cả người **tổ trưởng điểm danh tay** trên app (`:229-236`).
  - Bảng được tải lại mỗi 30 giây, sau mỗi lô gửi được, và khi máy có mạng trở lại. Các lượt chưa gửi được áp ngay lên bảng trên máy (`TramQuet.tsx:205-219, 294-308`).
- Cách nhận biết mã (`utils/xuongTheNv.ts:26-44`), theo thứ tự:
  1. Mã NV có trong danh sách (cả chuỗi, tham số `mnv=`/`id=`, hoặc một đoạn của chuỗi) → thẻ.
  2. Có dãy 9 số → phiếu.
  3. Chuỗi ngắn có cả chữ lẫn số nhưng không có trong danh sách → "thẻ lạ".
  4. Còn lại → "Không đọc được mã — quét lại thẻ hoặc phiếu".

### C. Quét thẻ (không kèm phiếu)
1. **Thẻ không có trong danh sách**: báo lỗi "Thẻ {mã} chưa có trong danh sách — báo tổ trưởng" (`TramQuet.tsx:480`). Máy chủ cũng chặn với cùng lý do (`xuongTram.ts:316`).
2. **Lần quét đầu trong ngày ca = vào ca** (`TramQuet.tsx:376-387`). Máy ghi `vao_ca` có `du_lieu.tram`. Ca được xác định như sau (`xuongTheNv.ts:75-92`):
   - Có ca đang mở → giờ vào là giờ quét. Báo "{tên} — vào ca HH:MM. Quét phiếu để vào hàng."
   - Quét **sớm tối đa 90 phút** trước giờ bắt đầu ca (ca chính 07:30 thì quét từ 06:00) → công tính **từ giờ bắt đầu ca**. Báo "vào ca từ 07:30".
   - Ca tăng ca chỉ được tính khi tổ trưởng đã khai `tang_ca` trong ngày. Ca chính tính mọi ngày trừ Chủ nhật.
   - **Ngoài ca**: bíp lỗi, báo "{tên} — ngoài giờ ca: báo tổ trưởng khai tăng ca. Đã ghi vào ca." Lượt vẫn được ghi, kèm cờ `ngoai_ca` (`xuongTram.ts:401`).
3. **Đã vào ca, đang trong ca**: hiện thẻ người. Thẻ có tên, mã, nhãn "· Người tổ X" nếu là người tổ khác, dòng "Đang ở: …" hoặc "Chưa ở hàng nào", và bộ đếm 20 giây (`TramQuet.tsx:601-620`). Các nút:
   - **"Ra khỏi hàng"** (chỉ hiện khi đang ở một hàng) → ghi `nguoi_ra`.
   - **"Ra ca"** → ghi `nguoi_ra` (nếu đang ở hàng) và `ra_ca`.
   - **"Xong"** → chỉ đóng thẻ người, không ghi gì.
   - Thêm hai nút "Quét phiếu bằng camera" và "Gõ mã phiếu". Trong 20 giây này quét phiếu sẽ mở thẳng màn chọn người làm chung (`:465-471`). Đây là cách cũ, quét thẻ trước.
4. **Hết ca** (`daHetCa`: có ca đã khai đã kết thúc, và không còn ca nào đang mở hoặc sắp mở trong 30 phút; `xuongTheNv.ts:97-108`): **quét thẻ là ra ca luôn**, không cần bấm nút. Máy rời hàng đang ở rồi ghi `ra_ca`, báo "{tên} — ra ca HH:MM (rời …)" (`TramQuet.tsx:353-365`). Tăng ca bắt đầu trong vòng 30 phút sau ca chính, ví dụ 16:15, vẫn được coi là còn trong ca.

### D. Quét phiếu + thẻ để vào hàng (cách chính)
1. Quét **phiếu PTHSP**. Trạm lấy các công đoạn của tổ đang làm được hạng mục đó, ưu tiên công đoạn mặc định của trạm (`TramQuet.tsx:456-462`). Danh sách gồm hạng mục đã nhận mà chưa xong hết, hoặc còn hàng chờ nhận (`xuongTram.ts:238-248`).
   - Không có công đoạn nào: báo lỗi "Hạng mục {hex} không có trong việc tổ {tổ} đang làm — chưa Nhận, đã xong hết, hoặc là việc của tổ khác (quét ở trạm của tổ đó). Tổ trưởng {tổ} bấm Nhận trên app MRA rồi quét lại" (`TramQuet.tsx:464`). Lỗi này cũng gặp khi **quét nhầm trạm tổ khác**.
2. Màn hiện "Phiếu {hex}", tên hạng mục và chữ lớn **"Quét thẻ của bạn"**. Có các nút "Quét thẻ bằng camera", "Gõ mã thẻ", "Huỷ". Phiếu chờ thẻ tối đa 120 giây và không đếm ngược trên màn (`:31-32, 580-594`).
   - Nếu hàng chưa nhận thì có thêm dòng "Hàng chưa nhận — vào hàng thì trạm Nhận đủ {số} {ĐVT}".
3. **Người khai quét thẻ.** Nếu người đó chưa vào ca, máy ghi vào ca luôn (`:376-387`). Màn **chọn người làm chung** mở ra, báo "{tên} khai — chọn người làm chung". Màn này có hạn 60 giây, mỗi lần chạm gia hạn thêm (`:36, 532`).
4. **Chọn công đoạn**: chỉ hiện khi có từ 2 công đoạn ("Chọn công đoạn", mỗi công đoạn một nút). Nếu chỉ có 1 thì máy tự chọn (`:329`).
5. **"Ai làm chung? (chạm để chọn, hoặc người đó quét thẻ)"** (`ChonNguoi`, `:81-203`):
   - Danh sách mặc định chỉ có người **đã điểm danh, đang rảnh** ("chưa ở hàng nào"). Đó là người đã quét thẻ đầu ca ở trạm hoặc được tổ trưởng điểm danh trên app.
   - Người "chưa quét thẻ vào ca" bị lọc ra khỏi danh sách, không chọn được bằng chạm.
   - Người tổ khác chỉ hiện khi tìm theo tên hoặc mã, hoặc khi đã có trên bảng của trạm (`:99-100`).
   - Nút **"Chọn nhóm lần trước (N): tên, tên…"**: nhóm làm chung lần trước ở cùng hạng mục và công đoạn. Thông tin này lưu localStorage trên máy trạm, giữ 200 hạng mục gần nhất. Nút chỉ lấy người đang rảnh (`:86-108, 168-172, 447-450`).
   - Ô tìm **"Tìm tên / mã NV người đã điểm danh"**.
   - Nút gạch chân **"Chuyển người từ hàng khác (N)"** (bấm lại thành "Ẩn người đang làm hàng khác") mở ra những người đang ở hàng khác, nền vàng, ghi "đang ở X — chọn = chuyển sang hàng này". Mặc định ẩn để tránh chạm nhầm kéo người khỏi hàng đang chạy (`:103-106, 184-188`).
   - Khi đang mở màn này, **người khác quét thẻ = chọn thêm người đó**, báo "Thêm {tên}". Nếu người đó chưa vào ca thì máy ghi vào ca cho họ trước, vì họ có mặt thật (`:339-351`).
   - Khi không có ai rảnh: "Chưa có ai đã điểm danh mà đang rảnh. Người làm chung quét thẻ ngay tại trạm (hoặc tổ trưởng điểm danh trên app) để vào nhóm — hoặc bấm "Vào hàng" nếu làm một mình."
6. Bấm **"Vào hàng — N người"** (`vaoHangNhom`, `:416-454`):
   - Nếu hàng **chưa nhận** (còn làm ≤ 0, còn nhận > 0), máy ghi trước `nhan` với `nhanDu:true`. Màn báo trước "Hàng chưa nhận: bấm "Vào hàng" là **Nhận đủ X** rồi vào hàng." (`:164-166, 423-426`). Máy chủ tự tính số nhận, giới hạn bởi số triển khai (`xuongTram.ts:407-412`).
   - Với mỗi người: nếu đang ở hàng khác thì ghi `nguoi_ra` hàng cũ rồi `nguoi_vao` hàng mới cùng thời điểm. Người làm chung được gắn `khaiBoi` = mã người khai (cờ `khai_ho`). Người đã ở hàng này thì bỏ qua.
   - Báo "[Nhận X · ] N người → {hạng mục} (A, B đã ở hàng này)".
7. Nút **"Huỷ"** đóng màn. Hết 60 giây mà không chạm gì: "Hết giờ chọn người — quét lại phiếu".

### E. Ra hàng / Xong hết từ trạm
- **Ra một người**: quét thẻ rồi bấm "Ra khỏi hàng" (mục C.3).
- **Ra cả nhóm**: người khai **đang ở hàng đó** quét phiếu + thẻ. Màn chuyển sang chế độ "ra" (`TramQuet.tsx:322-330, 134-154`), hiện "Đang ở hàng này — ai ra? (bỏ chọn người còn ở lại)". Cả nhóm được chọn sẵn. Các nút:
  - **"Làm xong hết {số} — cả nhóm ra"**: ghi `hoan_thanh` với `xongHet:true`, số lượng = đã nhận − đã xong, máy chủ tự tính (`xuongTram.ts:413-417`). Mọi người ở hàng ra tại mốc Xong (`tram.ts:344-347`). Báo "Xong hết … — cả nhóm ra hàng. Tổ trưởng chỉ còn bấm Giao."
  - **"Ra hàng, chưa xong — N người"**: ghi `nguoi_ra` cho những người còn được chọn.
  - **"Thêm người vào hàng này"**: quay về màn chọn người để thêm người vào.
  - "Huỷ".
- **Xong hết khi không còn ai ở hàng** (hàng đang tạm ngưng): ở màn vào hàng có link **"Hàng này đã làm xong? Ghi Xong hết {số} (không vào hàng)"** (`TramQuet.tsx:193-198`).

### F. Tự đóng cuối ca, ra ca
- Ai quên ra hàng thì đoạn đang mở **tự đóng ở cuối khối ca** chứa lúc vào, gắn cờ `tu_dong` (`tram.ts:150-155, 330-334`). Khối ca gồm ca chính và các ca tăng ca đã khai, nối lại nếu cách nhau ≤ 60 phút.
- Việc tính lại này chạy lúc đọc, không có tác vụ chạy ngầm. Trạng thái "đang làm" của tổ trạm được tính lại khi màn tổ mở, tối đa 1 lần mỗi phút (`routes/xuong.ts:240-255`).
- **Vào hàng ngoài mọi ca**: đoạn rỗng, cờ `ngoai_ca`, hàng không chạy (`tram.ts:369-370`). Nếu sau đó tổ trưởng khai tăng ca phủ giờ đó, lần tính sau sẽ tự đúng.
- Người ở lại tăng ca không cần quét lại thẻ: có mặt ca chính được nối sang ca tăng ca đã khai (`tram.ts:114-132`).
- **Tự gán** (`tram.ts:185-246`): người có mặt quá 30 phút mà chưa vào hàng nào và chưa ra ca → hệ thống gán từ lúc vào ca vào hàng gần nhất người đó làm dở trước hôm nay, nếu hàng chưa xong hết. Tổ trưởng xác nhận, hoặc báo "Không làm", ở màn Sửa ngày.

### G. Mất sóng
- Mọi lượt quét được ghi vào **IndexedDB trước** (DB `xuong-tram-hang-doi`), rồi mới gửi (`xuongTramApi.ts:28-31`, `TramQuet.tsx:310-320`).
- Khi mất sóng: hiện "Mất sóng — vẫn quét được" và "N lượt chờ gửi". Bảng vẫn cập nhật trên máy theo các lượt chưa gửi, kể cả Nhận đủ / Xong hết (`:205-232`).
- Khi có mạng lại (sự kiện `online`, hoặc chu kỳ 30 giây) máy tự gửi. Mỗi lô tối đa 200 sự kiện (`xuongTram.ts:40`).
- Danh sách công nhân và bảng cuối cùng được lưu localStorage để tra thẻ khi mất sóng. Danh sách công nhân làm mới mỗi 30 phút (`TramQuet.tsx:296-304`).
- Nếu chưa từng tải được bảng (máy mới, chưa có sóng), quét thẻ sẽ báo "Trạm chưa tải được dữ liệu tổ — kiểm tra sóng" (`:334`).

## Ba chế độ chấm `cu` / `song_song` / `tram`
| | `cu` (Bấm tay (cũ)) | `song_song` (Song song) | `tram` (Trạm quét) |
|---|---|---|---|
| Số giờ công / người ở hàng **chính thức** | Theo bấm tay, bỏ sổ trạm | Theo bấm tay, bỏ sổ trạm | Theo **sổ trạm**. Bỏ `bat_dau/tiep_tuc/tam_ngung/chia_nguoi` bấm tay (`tram.ts:43-44, 75-87`) |
| Sổ trạm dùng làm gì | Chỉ lưu (dải: "chưa tính giờ công") | So khớp trong Báo cáo (`so_khop` bỏ cả bấm tay lẫn điểm danh tay) | Chính thức |
| Bảng trên trạm | Vẫn hiện theo sổ trạm | Theo sổ trạm | Theo sổ trạm |
| App tổ trưởng | Bình thường | Bình thường + nút **Sửa ngày** | **Ẩn** Bắt đầu / Tiếp tục / Chia người / Quân số / ô điểm danh đầu trang. Dòng "đã nhận" ghi "Quét thẻ + phiếu ở trạm để bắt đầu". Còn: Xong / Xong — giao, **Tạm ngưng** (= ghi hộ cả nhóm `nguoi_ra`), Tiến độ, Tăng ca, Cuối ngày, **Điểm danh** (cho người quên thẻ), **Phân công**, **Sửa ngày** (`XuongApp.tsx:286, 379-381, 587-599, 742-756`) |

- Chưa đổi lần nào thì là `cu` (`tram.ts:54-67`).
- **Đổi chế độ**: ở máy tính, Setup → khối "Chấm công · trạm quét". Chọn radio, rồi bấm **"Lưu chế độ"**. Thao tác này chỉ quản lý xưởng làm được.
  - Mặc định có hiệu lực **từ ngày ca kế tiếp**.
  - Tick **"Áp dụng ngay hôm nay (mặc định: từ ngày ca mai)"** thì áp từ đầu ngày ca hôm nay (`xuongTram.ts:141-161`, `XuongSetupMuc.tsx:57-65`).
  - Đổi nhiều lần cho cùng một ngày hiệu lực thì lần sau thay lần trước.
  - Báo thành công: "{tổ}: {chế độ} từ dd/mm".
- Chuyển sang `tram` khi còn hàng đang chạy theo bấm tay: thông báo kèm "— N hạng mục đang chạy theo bấm tay sẽ tạm ngưng, chạy lại khi có người quét". Hệ thống chèn một lần tạm ngưng giả lúc 06:00 ngày chuyển (`tram.ts:89-112`).
- Ngày ca tính từ 06:00 tới 06:00 hôm sau, nên ca 4 qua đêm vẫn thuộc hôm trước (`tram.ts:36`).

## Quy tắc & ràng buộc (máy chủ, `xuongTram.ts:311-327, 329-444`)
- Trạm chỉ ghi được `vao_ca, ra_ca, nguoi_vao, nguoi_ra, nhan, hoan_thanh`. Loại khác bị từ chối: "Trạm chỉ ghi vào / ra ca, người vào / ra hàng, Nhận đủ và Xong hết".
- Mọi sự kiện bị ép `toId` = tổ của trạm và gắn `du_lieu.tram` cùng cờ `tram` (`:346, 400`).
- `nguoi_vao` phải là công đoạn thuộc tổ, và hạng mục phải đã nhận mà chưa xong hết. Chuỗi Nhận rồi vào hàng trong **cùng một lô** vẫn hợp lệ (`:359-376`).
- `nhan` chỉ chấp nhận `nhanDu`, `hoan_thanh` chỉ chấp nhận `xongHet`. Số lượng do máy chủ tính.
- Khai hộ (`khaiBoi`):
  - Không được khai hộ vào ca.
  - Người được khai phải **đã tự điểm danh vào ca** trong ngày ca (từ 05:00), tức là quét ở trạm hoặc được tổ trưởng điểm danh (`:378-393, 421-430`).
- Mỗi người chỉ ở một hàng một lúc. Vào hàng mới thì rời hàng cũ tại mốc đó. Hàng chạy khi có ít nhất 1 người, hết người thì tạm ngưng không lý do (`tram.ts:18-19`).
- `nguoi_ra` gắn với một hàng cụ thể sẽ bị bỏ qua nếu lúc đó người ấy không ở hàng đó (`tram.ts:380`).
- Có mặt: `luc` không được muộn hơn giờ bấm quá 3 giờ (`chamCong.ts:43-55`).

## Thông báo/lỗi hay gặp & cách xử lý
| Thông báo | Nguyên nhân | Xử lý |
|---|---|---|
| "Thẻ X chưa có trong danh sách — báo tổ trưởng" | Mã NV không có hoặc không active trong `xuong_cong_nhan` | Thêm công nhân ở Setup. Trạm làm mới danh sách mỗi 30 phút, hoặc tải lại trang |
| "Hạng mục … không có trong việc tổ … đang làm — … việc của tổ khác…" | Chưa Nhận, đã xong hết, hoặc **quét nhầm trạm tổ khác** | Quét ở trạm đúng tổ, hoặc tổ trưởng bấm Nhận trên app |
| "… — ngoài giờ ca: báo tổ trưởng khai tăng ca. Đã ghi vào ca." | Không có ca nào đang mở hoặc sắp mở | Tổ trưởng khai Tăng ca. Lần tính sau tự đúng |
| "Hết giờ chọn người — quét lại phiếu" | Màn chọn người để quá 60 giây không chạm | Quét lại phiếu |
| "{tên}: Người này chưa điểm danh vào ca" (máy chủ từ chối, hiện sau khi gửi) | Khai hộ người chưa vào ca | Người đó tự quét thẻ, hoặc tổ trưởng điểm danh |
| "Hạng mục chưa nhận ở tổ này hoặc đã xong hết" / "Không còn hàng chờ nhận…" / "Hạng mục đã xong hết số đã nhận" | Số liệu trên máy chủ đã khác lúc quét (có người khác vừa Nhận hoặc Xong, hoặc khi mất sóng) | Tải lại, xem bảng, quét lại nếu cần |
| "Hạng mục không còn gì để Xong" | Còn làm = 0 trên máy | — |
| "Chưa lưu được trên máy" | IndexedDB đầy hoặc bị chặn (`LoiLuuMay`) | Kiểm tra trình duyệt hoặc bộ nhớ máy. Lượt đó **chưa được ghi** |
| "Trạm chưa tải được dữ liệu tổ — kiểm tra sóng" | Chưa từng tải được bảng | Có sóng rồi bấm tải lại |
| Màn "Trạm cần đăng ký lại" + nút **"Đăng ký lại"** | Máy chủ trả 401: trạm bị thu hồi, sai tổ hoặc token hỏng ("Trạm đã bị thu hồi hoặc chưa đăng ký — cần đăng ký lại") | Quản lý hoặc tổ trưởng đăng nhập và đăng ký lại |
| "Chỉ quản lý xưởng hoặc tổ trưởng của tổ được đăng ký trạm" / "Công đoạn không thuộc tổ" / "Tài khoản chưa được cấp quyền mục Xưởng" | Lỗi lúc đăng ký | Dùng đúng tài khoản |
| "Chưa bật trạm quét (chưa chạy SQL 2026-10-16_xuong_tram.sql)" | DB chưa có bảng trạm | Chạy SQL |

- Âm báo: bíp cao ngắn khi được, bíp trầm dài kèm rung khi lỗi (`TramQuet.tsx:46-61`).

## Chỗ dễ nhầm
1. **Nhận đủ / Xong hết từ trạm là số lượng thật ở mọi chế độ, kể cả `cu` và `song_song`.** `locTheoCheDo` chỉ lọc sự kiện người và ca của trạm (`laSuKienTram`, `tram.ts:39-41`). Dải "chưa tính giờ công" chỉ nói về giờ công.
2. **Công đoạn mặc định của trạm chỉ dùng để ưu tiên**, không giới hạn. Bảng "Ai đang ở hàng nào" luôn hiện mọi công đoạn của tổ (`xuongTram.ts:222-228`).
3. Bảng trạm **luôn** hiện theo sổ trạm. Ở `cu` hay `song_song` thấy "đang ở hàng" trên trạm **không** có nghĩa là app tổ trưởng hoặc báo cáo chính thức tính như vậy.
4. Chạm chọn người làm chung chỉ chọn được người **đã điểm danh**. Người đang làm hàng khác bị ẩn sau link "Chuyển người từ hàng khác". Người chưa vào ca chỉ vào nhóm được bằng cách **tự quét thẻ** khi màn chọn đang mở.
5. Sau giờ hết ca, quét thẻ là **ra ca ngay**, không có nút xác nhận. Quét trong 30 phút trước tăng ca đã khai thì chưa bị coi là hết ca. Nếu tổ trưởng chưa khai tăng ca, người ở lại làm mà quét thẻ sẽ bị ra ca.
6. Ở màn chờ thẻ sau khi quét phiếu, nếu người khai **đang ở chính hàng đó**, màn mở ở chế độ **ra hàng** chứ không phải vào hàng.
7. Đổi chế độ mặc định có hiệu lực từ **ngày ca mai**. Muốn thử ngay phải tick "Áp dụng ngay hôm nay".
8. Lượt bị máy chủ từ chối đã hiện trên bảng của trạm trước đó (vì cập nhật tại máy), sau lần tải bảng kế tiếp sẽ biến mất. Lý do từ chối chỉ hiện một lần dưới dạng "{tên}: {lý do}" (`TramQuet.tsx:287`).
9. "Nhóm lần trước" được lưu **trên từng máy trạm** (localStorage). Đổi máy hoặc xoá dữ liệu trình duyệt là mất.
10. Token trạm gắn với tài khoản người đăng ký: máy chủ kiểm `p.user_id = u.id` (`xuongTram.ts:60-62`). Thu hồi trạm hoặc đăng ký lại sẽ tạo `device_id` mới.

---

# Phần 5: Theo dõi, báo cáo, cảnh báo cho quản lý (module Xưởng / MRA)

Mô tả theo code hiện tại, kể cả phần chưa commit. Không sửa file nào, không truy vấn DB.

## Mục đích

Giúp quản lý xưởng và tổ trưởng:
- thấy số liệu sản xuất theo ngày, theo tổ, theo hạng mục, theo người: giờ công, giờ công sản phẩm, giờ chờ việc, tỷ lệ có việc;
- đối chiếu với kế hoạch tuần (KHSX) và nhập kho để biết hạng mục nào sắp rớt hoặc đã rớt;
- xem nhanh tình hình trong ngày trên điện thoại (tổ nào chưa điểm danh, tổ nào cần chú ý);
- xử lý các thao tác bị gắn cờ (mục Cần xem);
- tra cứu một hạng mục (HEX) đang ở công đoạn nào;
- nhận thông báo nhắc việc lúc 8h00 và 16h30.

## Ai dùng & quyền

**Hàm phân quyền xem `phamViXem`** (`backend/src/routes/xuong.ts:96-105`):
- **Admin:** xem cả xưởng.
- **Tài khoản là tổ trưởng của một tổ đang hoạt động:** chỉ xem tổ mình (`chiTo`), kể cả khi tài khoản đó có thêm quyền quản lý xưởng. Tổ trưởng không có tổ trong xưởng đang chọn thì bị trả 403.
- **Quản lý xưởng** (quyền `xuong_quan_ly` và có dòng trong bảng `xuong_quan_ly`, `xuong.ts:73-79`) mà không làm tổ trưởng: xem cả xưởng của mình.
- **Còn lại:** không được xem. Thông báo lỗi là "Cần quyền quản lý xưởng này" (báo cáo, kế hoạch tuần, phân tích) hoặc "Không có quyền quản lý xưởng này" (Cần xem).

**Áp dụng cho:** `GET /api/xuong/bao-cao` (`xuongBaoCao.ts:43-44`), `/ke-hoach-tuan` (`xuongKeHoach.ts:43-44`), `/phan-tich` (`xuongPhanTich.ts`), `/can-xem` (`xuong.ts:1456-1458`).

**Ngoại lệ về quyền:**
- **Tổng quan xưởng** (`GET /api/xuong/tong-quan`, `xuongSetup.ts:152-160`) chỉ dùng quyền quản lý (`xuongQuanLy`), không qua phamViXem. Trên app, tab "Tổng quan" chỉ hiện khi người dùng có quyền `xuong_quan_ly` và không phải tổ trưởng (`XuongShell.tsx:45`).
- **Tra cứu HEX** (`GET /api/xuong/hex/:hex`, `xuong.ts:1298`) chỉ cần đăng nhập, không kiểm quyền Xưởng.

**Nơi vào màn hình:**
- **Máy tính:** trang `/#/mra` (tiêu đề "MRA"), cần là ADMIN hoặc có quyền `xuong_quan_ly` (`App.tsx:378`). Các mục: Báo cáo · Triển khai hạng mục · Khai CĐ chi tiết · Theo dõi triển khai · Tổ & tổ trưởng · Nhân sự · Công đoạn · Lịch ca · Quản lý xưởng · Cần xem (`XuongSetup.tsx:19-30`).
- **Tổ trưởng** (trên máy tính và trong app): chỉ thấy các mục "Theo dõi triển khai", "Cần xem", "Báo cáo" (`XuongSetup.tsx:33,75-77`). Tiêu đề là "Tổ …".
- **App `/xuong`:** tab "Tổng quan" cho quản lý. Tab "Quản lý" đổi tên thành "Báo cáo" nếu tài khoản là tổ trưởng (`XuongShell.tsx:52-54`).
- **Cần xem:** quản lý được bấm "Huỷ". Tổ trưởng chỉ xem (`chiXem`, `XuongSetupMuc.tsx:432-436`); tổ trưởng huỷ thao tác ở mục Lịch sử trong app.

## Các bước

### A. Báo cáo xưởng (máy tính: MRA → Báo cáo)

1. **Chọn xưởng** ở ô "Xưởng" (tổ trưởng chỉ có một xưởng thì ô này ẩn).
2. **Chọn khoảng ngày:**
   - ô "Từ" / "đến"; mặc định là 7 ngày gần nhất;
   - các nút "Hôm nay", "7 ngày", "Tháng này";
   - ô "Tháng" để chọn nhanh một tháng (kể cả các tháng của MRA cũ 04/2025 – 02/2026).
   - Ô "Ẩn tổ không có số liệu" được tích sẵn.
3. **Hệ thống tải số liệu.**
   - Máy tính kiểm tra khoảng ngày trước, phải trong khoảng 0–185 ngày chênh lệch (`BaoCaoXuong.tsx:1113-1117`).
   - Máy chủ mỗi lượt chỉ tính tối đa 30 ngày-tổ còn thiếu (`TINH_TOI_DA`, `xuongBaoCao.ts:18`) và trả `conThieu`. Màn hình gọi lại tối đa 20 lượt (`BaoCaoXuong.tsx:1119-1125`), trong lúc đó hiện "Đang tính thêm N ngày-tổ…".
   - Ngày đã qua được lưu ở bảng `xuong_gio_cong_ngay` theo phiên bản sổ và lịch ca. Đổi lịch ca thì các ngày đó tự tính lại (`xuongBaoCao.ts:132-170`). Ngày hôm nay luôn được tính lại.
4. **Đọc 5 thẻ đầu trang** (ẩn khi đang ở tab Kế hoạch, `BaoCaoXuong.tsx:1196-1208`):
   - "Công nhân / ngày";
   - "Giờ công sản phẩm";
   - "Tỷ lệ có việc" (mục tiêu ≥ 80%);
   - "Giờ chờ việc" (kèm lý do nhiều nhất);
   - "Hạng mục có công đoạn xong".
   - Mở "Cách đọc các số" để xem định nghĩa.
5. **Chọn tab** (`BaoCaoXuong.tsx:1086-1089`). Tab đang chọn được nhớ trên máy (localStorage).
   - **Kế hoạch & phân tích:** xem mục B.
   - **Theo ngày:**
     - bảng ngày × tổ với các cột Công nhân · Giờ công · Giờ công sản phẩm · Giờ chờ việc · Tỷ lệ có việc · Nhận · Chạy · Xong;
     - bấm một tổ để mở 4 khung: "Giờ công sản phẩm theo hạng mục", "Nhận", "Xong", "Giờ chờ việc … — vì sao";
     - dòng có nhãn **MRA** là số ước tính từ MRA cũ;
     - "chưa chốt" (chữ vàng) nghĩa là tổ chưa chốt quân số;
     - biểu tượng tam giác nghĩa là ngày đó có cờ.
   - **Theo tổ:**
     - mỗi ô ngày là % có việc của tổ;
     - các cột tổng kỳ gồm "Chốt quân số" dạng `ngày chốt/ngày có chạy`, Đang chạy, Tạm ngưng, Chờ nhận;
     - nhãn "khai vượt N ngày" nghĩa là tổ khai nhiều người hơn quân số;
     - bấm một tổ để xem giờ công sản phẩm cả kỳ theo hạng mục và giờ chờ theo lý do.
   - **Theo hạng mục (N):**
     - ô tìm "Tìm mã hạng mục, tên, công trình" và ô tích "Chỉ hạng mục lệch kế hoạch (N)";
     - mỗi hạng mục có 2 nhãn so với kế hoạch (`soKeHoach`, `BaoCaoXuong.tsx:460-499`):
       - so với KHSX: "Ngoài kế hoạch" / "Trễ KHNK x ngày" / "Còn x ngày tới KHNK" / "Đã nhập kho đủ";
       - so với triển khai: "Chưa triển khai" / "MRA cũ" / "Đúng tuyến" / "Ngoài tuyến: …" / "Bỏ qua: …";
     - bảng công đoạn: Công nhân, Giờ chạy, Giờ công SP / người, Tổng giờ công SP, SL xong, Giờ công SP / đơn vị, Hiện tại (còn x chờ nhận / chờ giao / hết tuyến);
     - nút "Theo ngày (N)" để mở chi tiết từng ngày.
   - **Theo người (N):**
     - ô tìm "Tìm mã NV, họ tên, tổ";
     - 2 kiểu xem: "Danh sách" và "Bảng công" (ô ghi V = vắng, tô màu khi trễ / về sớm);
     - mở một người để xem từng ngày: vào – ra, trễ, về sớm, hạng mục.
     - Chưa có số liệu thì hiện "Chưa có số liệu chấm công theo người trong kỳ." Số liệu chỉ có khi tổ trưởng điểm danh tên và chọn tên người lúc bắt đầu hạng mục.
   - **Chất lượng dữ liệu** (`BaoCaoXuong.tsx:979-1014`):
     - 4 chỉ số:
       - "Nhật ký đủ Bắt đầu và Hoàn thành" (mục tiêu ≥ 90%);
       - "Ngày-tổ có chốt quân số" (≥ 90%);
       - "Thao tác tới máy chủ trong 1 giờ" (≥ 95%);
       - "Ngày-tổ khai vượt quân số" (chỉ theo dõi);
     - khung "Cờ cần xem trong kỳ": đếm số ngày-tổ theo từng loại cờ;
     - khung "Đối chiếu chấm công (Dữ liệu Điểm danh, cả xưởng)": app lệch ≤ 10% so với điểm danh là đạt (`BaoCaoXuong.tsx:926-976`).
6. **"Xuất Excel"** tạo các sheet Theo ngay / Hang muc theo ngay / Nhan - Xong / Gio cho / Theo to / Theo hang muc…
   - Nút bị khoá khi máy chủ còn đang tính dở (`conThieu > 0`, `BaoCaoXuong.tsx:1179`).
   - "Tải lại" để tính lại.

### B. Kế hoạch & phân tích (tab đầu của Báo cáo, `KeHoachTuan.tsx`)

1. **Chọn tuần** bằng nút ‹ / ›, hoặc nút "Tuần này". Tuần ISO, từ thứ Hai tới Chủ nhật. Tab này không dùng khoảng ngày ở trên.
2. **Hệ thống tải dữ liệu:** kế hoạch tuần từ KHSX (dòng có `phan_loai_kh` chứa "TUẦN"), nhập kho, trạng thái công đoạn và dự báo. Sau đó gọi thêm báo cáo cùng khoảng ngày để lấy giờ công sản phẩm.
   - Tổ trưởng chỉ thấy hạng mục đi qua công đoạn của tổ mình; màn hình in đậm câu ghi chú tương ứng.
3. **Mỗi hạng mục được xếp một tình trạng** (`tinhTrang`, `KeHoachTuan.tsx:56-86`):
   - "Đã nhập kho" khi nhập kho ≥ 98% kế hoạch; "Đã nhập đủ từ trước";
   - "Nhập kho x%";
   - "Rớt kế hoạch": chỉ khi tuần đã qua và nhập kho đã cập nhật tới hết tuần (`tuanDaChot`, dòng 53);
   - "Chưa triển khai"; "Tạm ngưng" (kèm lý do); "Chưa tổ nào nhận"; "Đang làm"; "Xong xưởng, chờ nhập kho"; "Đã nhận, chưa chạy";
   - "Nguy cơ rớt": tổng số ngày "thường mất" của các công đoạn còn lại lớn hơn số ngày còn tới KHNK (`duBao.ts:94`). Mức "sát" (> 80% số ngày còn lại) chỉ đổi màu sang vàng;
   - Quá ngày KHNK thì tối thiểu là mức vàng.
4. **Đọc khung "Cần xử lý"** (`KeHoachTuan.tsx:215-249`). Mỗi dòng có số hạng mục, số tiền còn thiếu, gợi ý xử lý và tối đa 6 mã HEX:

   | Nhóm | Gợi ý trên màn hình |
   |---|---|
   | NGUY CƠ RỚT | "Ưu tiên, thêm người / tăng ca, hoặc báo kế hoạch dời ngày" |
   | CHƯA TRIỂN KHAI | "Mở Triển khai hạng mục để giao cho tổ" |
   | RỚT KẾ HOẠCH | "Đưa vào kế hoạch tuần sau / báo kế hoạch" |
   | NHẬP KHO CHƯA ĐỦ | "Làm nốt phần còn lại, báo kế hoạch" |
   | CHƯA TỔ NÀO NHẬN | "Hỏi tổ đầu tuyến / kiểm tra hàng đã về chưa" |
   | TẠM NGƯNG | "Xem lý do để gỡ (vật tư, bản vẽ…)" |
   | CHƯA CHẠY | "Nhắc tổ bắt đầu" |
   | QUÁ NGÀY KHNK | (không có gợi ý riêng) |
   | Giờ công SP ngoài kế hoạch ≥ 30% | "Kiểm tra ưu tiên: tổ có đang làm hàng không cần gấp?" |

   Không có gì cần xử lý thì hiện khung xanh "Kế hoạch tuần đang đúng hướng — không có hạng mục cần xử lý."
5. **6 thẻ số:** Kế hoạch tuần · Nhập kho theo kế hoạch · Còn phải nhập kho (tuần đã qua thì ghi "Rớt kế hoạch") · Ngoài / vượt kế hoạch · Doanh số / giờ công · Doanh số / công nhân.
   - Tiền tính bằng triệu đồng; từ 1.000 trở lên hiện "tỷ".
   - Giờ công ưu tiên lấy từ Dữ liệu Điểm danh. Nếu không có, lấy từ các tổ dùng app, và màn hình cảnh báo "chỉ x/y tổ dùng MRA, số cao hơn thực tế".
6. **Bảng "Hạng mục kế hoạch tuần (N)":** hạng mục cần xử lý xếp lên đầu. Bấm một dòng để xem từng công đoạn (nhận · xong · giao).
7. **Hai khung phụ:** "Nhập kho ngoài kế hoạch tuần" và "Giờ công SP cho hạng mục ngoài kế hoạch".
8. **Mục "Mốc chuẩn thời gian"** đóng sẵn, chỉ tải khi mở. Đây là phân tích 180 ngày tới hết tuần đang xem (`KeHoachTuan.tsx:337-350`).

### C. Tổng quan xưởng trên app (`/xuong` → tab "Tổng quan")

1. **Chọn xưởng** ở hàng nút trên cùng (xưởng chọn được nhớ trên máy). Nút tải lại hình mũi tên tròn.
2. **Dòng tóm tắt:**
   - nút gạch chân "**N tổ chưa điểm danh**" (hoặc "chưa chốt quân số" nếu chưa dùng điểm danh tên). Chỉ đếm tổ có việc mà chưa có quân số ca chính / Chủ nhật hôm nay (`TongQuanXuong.tsx:115`). Bấm nút này để bật / tắt bộ lọc Cần chú ý;
   - "x hạng mục đang chạy", "x chờ nhận".
3. **Khung chấm công hôm nay:** "x/y có mặt", "x vắng", "x trễ", "x về sớm", và "· a/b tổ đã điểm danh". Bấm để xem tên người theo từng tổ.
4. **Khung đỏ "Kế hoạch tuần N: x/y hạng mục cần xử lý"** (đếm các hạng mục mức ≥ 2, cùng cách tính với mục B). Bấm để mở Quản lý → Báo cáo → Kế hoạch tuần của xưởng đó.
5. **Hai nút lớn:**
   - "Triển khai": gõ hoặc quét mã để triển khai nhanh;
   - "Cần xem (N)": mở danh sách thao tác có cờ trong 30 ngày. Mỗi dòng có nút "Huỷ thao tác", hỏi lại "Huỷ thao tác này?" trước khi huỷ.
6. **Bộ lọc** "Tất cả N tổ" / "Cần chú ý N". Một tổ được tính là cần chú ý khi (`TongQuanXuong.tsx:106-107`):
   - có việc nhưng chưa điểm danh hoặc chốt quân số, hoặc
   - có cờ cần xem, hoặc
   - có hạng mục tạm ngưng.
7. **Mỗi thẻ tổ hiển thị:**
   - tên tổ trưởng (hoặc "Chưa có tổ trưởng"), "thao tác cuối hh:mm";
   - quân số / có mặt; "Chưa điểm danh" / "Chưa chốt quân số" (chữ đỏ);
   - đang chạy, tạm ngưng, chưa bắt đầu, chờ nhận, chờ giao, "x cần xem";
   - "Chưa có việc" khi tổ không có việc gì.
   - Bấm vào thẻ để mở màn tổ trưởng của tổ đó (xem hoặc thao tác hộ; máy chủ gắn cờ "Quản lý ghi hộ tổ").

### D. Cần xem (máy tính: MRA → Cần xem; `XuongSetupMuc.tsx:432-530`)

1. **Khung "Thao tác có cờ · 30 ngày · N"** có ô chọn lọc:
   - "Cần xử lý (n)": mặc định;
   - "Mọi cờ, kể cả chỉ để biết (n)";
   - hoặc từng loại cờ.
2. **Các cờ "chỉ để biết"** bị ẩn khỏi bộ lọc Cần xử lý (`XuongSetupMuc.tsx:447`):
   - quan_ly_ghi_ho (Quản lý ghi hộ tổ);
   - các cờ của trạm quét / phân công đầu ca: tram, nhan_du, xong_het, khai_ho, phan_cong, bao_xong.
3. **Cột:** Lúc · Thao tác · Hạng mục · công đoạn · tổ · Cờ (tên cờ tiếng Việt lấy từ `TEN_CO`, `xuongModel.ts:312-343`).
4. **Huỷ một thao tác** (chỉ quản lý): bấm "Huỷ", ô hỏi "Huỷ thao tác này? Ghi lý do (không bắt buộc):". Bấm Cancel thì không huỷ. Huỷ xong hiện "Đã huỷ thao tác".
5. **Khung "Hạng mục có cờ · N":** các dòng trạng thái công đoạn có cờ, kèm số lượng "Giao tới · Nhận · Xong · Giao". Khung này chỉ để xem, không có nút huỷ.

**Dữ liệu (máy chủ):** `xuong_su_kien` có cờ, `server_ts` trong 30 ngày, chưa bị huỷ, tối đa 300 dòng; cộng `xuong_trang_thai` có cờ (`xuong.ts:1453-1480`). Tổ trưởng chỉ thấy thao tác của tổ mình và các công đoạn tổ mình phụ trách.

### E. Tra cứu HEX (`XuongHexChiTiet.tsx`)

**Nơi mở:**
- **Máy tính:** trong cửa sổ chi tiết hex của Dashboard, bấm dòng xanh "Xưởng: <công đoạn>" hoặc "Xưởng: xong" (`HexDetailModal.tsx:1418-1421`). Cửa sổ có tiêu đề "Xưởng — hex …".
- **App:** tab "Tra cứu".
  - Gõ ≥ 3 số mã HEX, hoặc ≥ 2 chữ của tên hạng mục / công trình, để hiện gợi ý; hoặc bấm "Quét phiếu".
  - Lỗi thường gặp: "Gõ ít nhất 3 số của mã HEX, hoặc 2 chữ của tên hạng mục / công trình.", "Không thấy hạng mục khớp.", "Chọn một hạng mục trong danh sách bên dưới.", "Đang mất sóng — tra cứu cần có sóng."

**Nội dung hiển thị:**
1. Tên hạng mục, công trình, số lượng đơn hàng.
2. Khung "Lịch sử MRA (đến 2/2026)".
3. Khung "Thời gian trong xưởng X": tạm tính theo % đã ra so với số triển khai hoặc số đơn hàng, chia theo lô.
4. Bảng công đoạn theo thứ tự tuyến: Công đoạn · Trạng thái · Giao tới · Nhận · Hoàn thành · Giao · Giờ chạy · Giờ công. Các trạng thái: Đang chạy / Tạm ngưng / Chưa bắt đầu / Chờ nhận / Chờ giao / Xong. Cờ hiện bằng chữ đỏ.
5. Khung "Ảnh theo công đoạn (N)", nhãn ảnh: Check-in / Xong / Giao / Cuối ngày.
6. Mục "Nhật ký thao tác (N)": thao tác đã huỷ bị gạch ngang, có chữ "· đã huỷ".

**Lưu ý:** mã phải đủ 9 số, sai thì báo "Mã hạng mục phải có 9 số" (`xuong.ts:1301`). Giờ công sản phẩm chỉ cộng 20 ngày làm gần nhất; khi đó màn hình ghi chú "Giờ công sản phẩm cộng 20 ngày làm gần nhất…".

### F. Thông báo / push (`backend/src/routes/xuongThongBao.ts`)

**Cơ chế chung:**
- Thông báo lưu vào hộp thông báo và gửi Web Push.
- Chỉ gửi cho người bật mục "Xưởng" trong cài đặt thông báo. Không gửi cho chính người vừa thao tác.
- Người nhận "theo tổ" = tổ trưởng + thành viên tổ có tài khoản (khớp mã NV).

**Gửi ngay lúc thao tác:**
- "Có hàng giao tới <công đoạn>": gửi cho tổ phụ trách công đoạn nhận hàng.
- "Xưởng A giao công đoạn cho xưởng B": gửi cho quản lý xưởng B.

**Cron `GET /api/cron/xuong`:**
- Do dịch vụ ngoài gọi, cần CRON_SECRET.
- Không truyền `dot` thì máy chủ tự chọn theo giờ VN: trước 12h là "sang", sau là "chieu" (`xuongThongBao.ts:274-281`).
- **8h00, dot=sang** (`nhacSang`, dòng 174):
  1. "<Tổ>: chưa chốt quân số ca chính": bỏ qua Chủ nhật; chỉ gửi cho tổ đang có việc.
  2. "Hạng mục đang chạy hơn 2 ngày chưa cập nhật": hạng mục chạy quá 48 giờ mà tổ không có thao tác nào và không xác nhận "vẫn làm".
  3. "Xưởng X: có thao tác cần xem": đếm thao tác có cờ trong 24 giờ, gửi cho quản lý xưởng (bảng `xuong_quan_ly`).
  4. Dọn ảnh tiến độ đã quá 2 ngày mà không có sự kiện nào dùng.
- **16h30, dot=chieu** (`nhacChieu`, dòng 242):
  1. "<Tổ>: chưa chốt quân số tăng ca": tổ đã khai tăng ca hôm nay nhưng chưa chốt quân số ca đó.
  2. "<Tổ>: xác nhận cuối ngày": nội dung ghi bấm "Tất cả vẫn đang làm"; không xác nhận 2 ngày liền thì ngừng tính giờ.
- Mỗi loại thông báo chỉ gửi **một lần / người / ngày** (`moiNgayMotLan`, so theo tiêu đề), nên gọi cron lại cũng không gửi trùng.

**Bấm vào thông báo:**
- Trong danh sách thông báo trên điện thoại: thông báo `xuong_co` mở `/#/mra`, các loại khác mở `/xuong` (`MobileNotifications.tsx:88`).
- Bấm từ push: `xuong_co` mở `/#/setup?tab=xuong`.

## Quy tắc & ràng buộc

**Khoảng ngày của báo cáo:**
- Tối đa 186 ngày. Máy chủ báo "Khoảng ngày phải từ 1 tới 186 ngày (khoảng 6 tháng)" (`xuongBaoCao.ts:53`).
- Trên 62 ngày (`rutGon`) thì không có chi tiết từng ngày. Bấm mở một ngày sẽ thấy "Khoảng ngày dài hơn 2 tháng nên không có chi tiết từng ngày — chọn khoảng ≤ 2 tháng…" (`BaoCaoXuong.tsx:129-131`).

**Cách tính các số:**
- **Giờ công** = quân số × giờ ca, trừ giờ nghỉ. Nếu có điểm danh tên thì tính theo từng người (trễ / về sớm bị trừ).
- **Giờ công sản phẩm** = phần giờ công được gắn vào hạng mục đang chạy, chia theo số người khai. Khai vượt quân số thì co lại theo tỷ lệ và gắn cờ `khai_vuot_quan_so` (`allocation.ts:288-289`).
- **Giờ chờ việc** = giờ công − giờ công sản phẩm. Các lý do: Người rảnh / Không có hạng mục chạy / Tạm ngưng: … Lý do dưới 3 phút bị bỏ (`BaoCaoXuong.tsx:52`).
- **Màu % có việc:** xanh ≥ 80, vàng 50–79, đỏ < 50 (`BaoCaoXuong.tsx:46-47`).
- **Thao tác bị huỷ** (có sự kiện `huy` trỏ tới) không được tính ở bất kỳ màn hình nào.

**Số liệu MRA cũ:**
- Giờ công lấy từ Dữ liệu Điểm danh, chia cho các tổ theo tỷ lệ.
- Giờ công sản phẩm = nhân công MRA × giờ trong ca, không vượt giờ công điểm danh.
- Ngày nào tổ đã có số liệu app thì dùng số app, bỏ số MRA.

**Kế hoạch tuần:**
- Chỉ kết luận "Rớt" khi tuần đã qua **và** nhập kho đã cập nhật tới hết tuần (`KeHoachTuan.tsx:53`).
- Nếu nhập kho chưa cập nhật hết tuần thì hiện dòng vàng "… chưa kết luận rớt kế hoạch" (`KeHoachTuan.tsx:209-213`).

**Cảnh báo bảng chưa tạo:** nếu chưa chạy SQL tạo bảng lưu kết quả, màn hình hiện dòng vàng "Chưa chạy file backend/sql/2026-10-12_xuong_bao_cao.sql — báo cáo tính lại mỗi lần xem" (`BaoCaoXuong.tsx:1188-1192`).

## Thông báo/lỗi hay gặp & cách xử lý

| Thông báo | Nguyên nhân | Cách xử lý |
|---|---|---|
| "Cần quyền quản lý xưởng này" / "Không có quyền quản lý xưởng này" | Không phải admin / quản lý xưởng đó; hoặc là tổ trưởng nhưng không có tổ trong xưởng đang chọn | Cấp quyền `xuong_quan_ly` và thêm vào Quản lý xưởng; hoặc chọn đúng xưởng |
| "\"Từ\" phải trước \"đến\"." / "Khoảng đang chọn N ngày — tối đa 186 ngày…" | Chọn khoảng ngày ngược hoặc quá dài | Chọn lại ngày |
| "Đang tính thêm N ngày-tổ…" và nút Xuất Excel bị khoá | Máy chủ đang tính dần các ngày còn thiếu | Đợi tính xong; nếu dừng giữa chừng thì bấm "Tải lại" |
| Ô Công nhân hiện "chưa chốt" (chữ vàng) | Tổ chưa chốt quân số, nên giờ công của ngày đó thiếu | Nhắc tổ trưởng chốt quân số hoặc khai bù |
| "Chưa có kế hoạch tuần N của xưởng X trong KHSX." | KHSX chưa có dòng kế hoạch tuần cho xưởng đó | Bấm "Xem tuần trước" hoặc kiểm tra ETL KHSX |
| "Doanh số / giờ công" chữ vàng, kèm "chỉ x/y tổ dùng MRA" | Không có Dữ liệu Điểm danh, chưa đủ tổ dùng app | Coi số này là cao hơn thực tế |
| "Đang mất sóng — tổng quan cần có sóng." | App mất mạng | Chờ có sóng rồi tải lại |
| "Mã hạng mục phải có 9 số" | Gõ mã sai | Gõ đủ 9 số, hoặc chọn từ gợi ý |
| "Hạng mục … chưa có dữ liệu ở mục Xưởng (chưa triển khai / chưa tổ nào ghi nhận)." | Hạng mục chưa có sự kiện nào trong mục Xưởng | Triển khai hạng mục / hỏi tổ đầu tuyến |

## Chỗ dễ nhầm

1. **Chưa thấy "so khớp trạm" trong Báo cáo xưởng.**
   - Máy chủ có tính số theo sổ trạm cho tuần chạy song song (`soKhopTram`, `xuong.ts:1105-1106, 1162-1167`), nhưng frontend không đọc trường này. `BaoCaoXuong.tsx` và `xuongBaoCao.ts` đều không có phần so khớp.
   - Hiện số theo trạm chỉ xem được ở màn **"Sửa ngày"** trên app. Màn này dùng `soTram(…, 'so_khop')` (`xuongTram.ts:518-535`) và chỉ hiện với tổ không ở chế độ cũ (`XuongApp.tsx:756`).
   - Màn trạm và màn Setup ghi "để so khớp trong Báo cáo" (`XuongSetupMuc.tsx:58`) là chưa đúng với code hiện tại.
2. **Hai con số "cần xem" trên Tổng quan đếm khác nhau.**
   - Số "x cần xem" trên từng thẻ tổ và số trên nút "Cần xem (N)" đếm **dòng trạng thái hạng mục có cờ** (`xuong_trang_thai.co`, `xuongSetup.ts:176`).
   - Danh sách mở ra lại liệt kê **thao tác có cờ trong 30 ngày** (`suKien`), không lọc "chỉ để biết". Vì vậy số trên nút và số dòng trong danh sách có thể không khớp.
3. **Push "có thao tác cần xem" lúc 8h có thể không khớp với màn Cần xem.**
   - Cron đếm mọi cờ trong 24 giờ, kể cả cờ chỉ để biết như quản lý ghi hộ hay quét trạm (`xuongThongBao.ts:218`).
   - Màn Cần xem mặc định lọc "Cần xử lý", nên có thể ghi "Không có thao tác nào cần xử lý. (N thao tác chỉ để biết — chọn \"Mọi cờ\" để xem.)".
4. **Admin không nhận push cờ / xưởng phụ.** Hai loại này chỉ gửi cho người có tên trong bảng `xuong_quan_ly` của xưởng đó, không gửi cho admin.
5. **Tổ trưởng có quyền quản lý vẫn chỉ xem được tổ mình** ở Báo cáo, Kế hoạch tuần, Cần xem (`xuong.ts:89-105`). Tài khoản như vậy cũng không thấy tab "Tổng quan" trên app.
6. **Tab "Kế hoạch & phân tích" xem theo tuần ISO**, không theo khoảng "Từ / đến" ở trên. 5 thẻ đầu trang bị ẩn khi đang ở tab này.
7. **Ngày hôm nay chưa trọn.** Dòng ngày hôm nay ghi "hôm nay, tính đến hh:mm", số còn tăng tới hết ca nên đừng so với ngày đã xong.
8. **Ô "Ẩn tổ không có số liệu" được tích sẵn.** Tổ không có ngày nào và không có việc đang chạy / chờ nhận / tạm ngưng sẽ không hiện.
9. **Đối chiếu chấm công thấp hơn điểm danh là bình thường** khi chưa đưa hết tổ lên app: điểm danh tính cả xưởng, còn app chỉ gồm các tổ đã dùng.
10. **Nút "N tổ chưa điểm danh" có thể đếm khác bộ lọc "Cần chú ý".** Số trên nút xét quân số ca chính / Chủ nhật đã chốt (`TongQuanXuong.tsx:115`). Bộ lọc thì còn loại các tổ đã điểm danh tên (`dòng 106`). Kết quả là một tổ đã điểm danh tên ở trạm nhưng chưa có sự kiện chốt quân số vẫn có thể bị tính vào "chưa điểm danh".
11. **Tra cứu HEX không giới hạn theo xưởng / tổ:** ai đăng nhập cũng xem được (`xuong.ts:1298`). Điều này khác với các màn báo cáo, vốn có kiểm tra phamViXem.
