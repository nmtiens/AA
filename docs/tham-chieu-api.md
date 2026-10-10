# Tham chiếu API backend

Mọi route `/api/*` đòi `Authorization: Bearer <JWT>` (lấy từ `POST /api/auth/login`), trừ nhóm **Công khai** bên dưới. Frontend tự gắn header này qua `frontend/services/authFetch.ts`. Lỗi trả về theo một trong hai dạng: `{ "success": false, "message": "..." }` (tiếng Việt, 404/500/CORS) hoặc `{ "error": "..." }` (kiểm tra tham số). 401 từ route ngoài `/api/auth/*` nghĩa là token hết hạn, frontend tự đăng xuất.

Ngày truyền dạng `YYYY-MM-DD`. Tiền trong mọi phản hồi là **triệu đồng** trừ khi ghi rõ "tỷ".

Nguồn: `backend/api/index.ts` (thứ tự đăng ký) và từng file trong `backend/src/routes/`.

## Công khai (không cần token)

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/api/auth/login` | `{username, password}` → `{token, user}`; giới hạn tần suất |
| POST | `/api/auth/forgot-password` | gửi OTP |
| POST | `/api/auth/verify-otp` | xác minh OTP, đặt lại mật khẩu |
| GET | `/api/warmup` | làm nóng cache; cần header `x-warmup-key = WARMUP_SECRET` |
| GET | `/api/cron/vuong-mac-bot` | cron quét hạn BOT + leo thang quá hạn; cần `Authorization: Bearer <CRON_SECRET>` hoặc header `x-cron-key` |

## Tài khoản

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/auth/me` | thông tin tài khoản đang đăng nhập |
| POST | `/api/auth/change-password` | đổi mật khẩu |
| GET/POST | `/api/users` | ADMIN: danh sách / tạo user |
| PUT/DELETE | `/api/users/:id` | ADMIN: sửa / xoá user |

## Dữ liệu bảng (nguồn cho mọi trang)

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/all-data?tables=production,order,...` | 12 bảng theo whitelist cột `REPORT_COLUMNS`; trả gzip sẵn; bỏ `tables` để lấy đủ 12 |
| GET | `/api/production`, `/api/material`, `/api/khsx`, `/api/order`, `/api/inventory`, `/api/tkbv`, `/api/pthsp`, `/api/analysis`, `/api/yearly-plan`, `/api/export`, `/api/attendance`, `/api/stock` | từng bảng, cùng whitelist; `?updated_after=` lọc theo `updated_at` |
| GET | `/api/production/hex/:hex` | 1 hạng mục đủ cột cho cửa sổ BOP×BOT |
| POST | `/api/production/notes` | `{hexes[], full?}` ghi chú nhập kho / QC / phiếu theo HEX (≤2000) |
| POST | `/api/production/by-hex-extra` | `{hexes[]}` (≤4000): SL theo công đoạn SX, tóm tắt QC, gia công ngoài, mốc ngày |
| GET | `/api/production/plan-met` | HEX đã đạt SL KH tuần / tháng trong kỳ (để bỏ qua hạn đã đạt) |
| GET | `/api/check-versions` | phiên bản 12 bảng (`table_versions`) — client so với cache |
| GET | `/api/data-update-log` | nhật ký cập nhật dữ liệu |
| GET | `/api/project-aliases` | mã công trình → các cách viết tên |

Tên khoá phiên bản: `production, material, khsx, order, inventory, tkbv, pthsp, analysis, yearlyPlan, export, attendance, stock`.

## Tổng hợp cho Dashboard

| Method | Đường dẫn | Tham số chính | Mô tả |
|---|---|---|---|
| GET | `/api/overview/summary` | `dateFrom, dateTo, dates, xuong, congTrinh, tinhTrang, ipo` | các ô KPI trang Tổng quan |
| GET | `/api/overview/by-group` | như trên + `groupBy` | bảng theo công trình / xưởng |
| GET | `/api/trend` | `source, granularity=day|week|month, dateFrom, dateTo, xuong, congTrinh, dvt, phanLoai` | chuỗi thời gian; `source` = một bảng phân tích hoặc `stock` |
| GET | `/api/trend-by-xuong`, `/api/trend-by-congtrinh`, `/api/trend-by-dvt`, `/api/trend-by-phanloai` | như `/api/trend` | chia theo chiều |
| GET | `/api/detail` | như `/api/trend` + `limit` (≤5000) | dòng chi tiết khi bấm biểu đồ |
| GET | `/api/filters/xuong`, `/api/filters/cong-trinh`, `/api/filters/dvt`, `/api/filters/phan-loai-nhom-san-pham` | `source` | giá trị cho ô chọn |
| GET | `/api/revenue`, `/api/revenue/:year` | | doanh thu theo tháng |
| GET | `/api/khsx-nam/plan`, `/api/khsx-nam/plan-actual` | `nam` | kế hoạch năm / KH-TH |
| GET | `/api/khsx-nhapkho/summary` | `nam, mode=month|week, thang, tuan, xuong` | KH sản xuất vs nhập kho |
| GET | `/api/stock/dates` | | các ngày chụp tồn kho |
| GET | `/api/stock/by-project` | `date, xuong, congTrinh` | tồn kho theo công trình (tên chuẩn) |
| GET | `/api/stock/items` | `date, ...` | danh sách tồn kho |
| GET | `/api/stock/total-count` | | tổng dòng tồn kho |
| GET | `/api/stock/export/csv` | `date` | xuất CSV (giới hạn tần suất) |

## Vật tư

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/api/material/by-hex` | `{hexes[], mode}`; `mode` = `hex-counts` \| `matched` \| `project-uncoded` \| `nvl` |
| POST | `/api/material/pr-hexes` | HEX phục vụ bởi từng PR |

## Vướng mắc sản xuất

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/vuong-mac/all` | `st=open,doing,done,closed`, `mine=assignee|reporter|confirm|1`, `due=overdue|soon`, `sort=bot|oldest|priority`, `xuong, congTrinh, handler, stage, priority, q, page, pageSize` |
| GET | `/api/vuong-mac/item/:id` | 1 vướng mắc kèm thông tin sản xuất + `perms` |
| GET | `/api/vuong-mac/stats` | số liệu cho trang chủ mobile (của tôi / chờ xác nhận / quá hạn) |
| GET | `/api/vuong-mac/dashboard` | `from, to, xuong`: KPI, theo loại/xưởng/công đoạn/người xử lý/công trình, tuổi, 12 tuần |
| GET | `/api/vuong-mac/by-project` | vướng mắc đang mở theo mã công trình (memo 60 giây) |
| POST | `/api/vuong-mac` | tạo: `{hex, category, content, handler?, bot?, priority?, photos?}` |
| PUT | `/api/vuong-mac/:id` | sửa nội dung / `status` + `statusNote` / `priority` / `isResolved` cũ |
| POST | `/api/vuong-mac/:id/comment` | `{content}` |
| POST | `/api/vuong-mac/:id/extend` | xin thêm thời gian |
| DELETE | `/api/vuong-mac/:id` | xoá (Admin / người báo / cùng phòng) |
| POST | `/api/vuong-mac/list` | `{hexes[]}` (≤2000) → vướng mắc theo HEX |
| GET | `/api/vuong-mac/log/:hex?id=` | nhật ký thay đổi |
| GET | `/api/vuong-mac/hex-search?q=` · POST `/api/vuong-mac/hex-bulk` | tìm hạng mục khi báo vướng mắc |
| GET | `/api/vuong-mac/xuong`, `/handlers`, `/people` | giá trị cho ô chọn |
| GET/DELETE | `/api/vuong-mac/photo/:photoId` | ảnh đính kèm |

Quy trình trạng thái và quyền: xem `backend/sql/README_vuong_mac_quy_trinh.md`.

## Thông báo và Web Push

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/notifications` · `/unread-count` | hộp thông báo |
| POST | `/api/notifications/read` | đánh dấu đã đọc |
| GET/PUT | `/api/notifications/prefs` | cài đặt từng loại (`mention, assigned, status, extend, due, newInDept`) |
| GET | `/api/notifications/diagnose` · POST `/test` | chẩn đoán / gửi thử |
| POST | `/api/push/subscribe` · `/unsubscribe` | đăng ký Web Push |

## Cài đặt (ADMIN)

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET/POST | `/api/view-project-mapping[/:viewId]` | công trình thuộc view Luồng đỏ / Căn mẫu |
| GET/POST | `/api/workshop-groups` | gộp mã xưởng → xưởng hiển thị |
| GET/POST | `/api/table-column-config[/:tableId]` | cột hiển thị mặc định của bảng dữ liệu |

## Cache phía server

API chỉ đọc (trend, filters, detail, overview, khsx, revenue, stock, by-hex, notes, plan-met, by-hex-extra) được cache theo phiên bản bảng (`backend/src/server/cache.ts`): cùng tham số và phiên bản bảng liên quan chưa đổi thì trả kết quả cũ; nhiều request giống nhau tới cùng lúc chỉ tính một lần. Cache sống trong một instance (serverless), nên sau deploy gọi `/api/warmup` để làm nóng.
