# Hướng dẫn dựng môi trường phát triển

Sau bài này bạn có backend chạy ở `localhost:5000`, frontend ở `localhost:3000`, đăng nhập được và mở được trang Tổng quan với dữ liệu thật từ PostgreSQL.

## Cần có trước

- Node.js 22 (CI dùng 22; bản 20 vẫn chạy được).
- Git.
- Chuỗi kết nối PostgreSQL. Có 2 lựa chọn:
  - DB thử nghiệm của dự án (ít dữ liệu, đổi gì cũng không ảnh hưởng ai) — xin quản trị dự án.
  - DB thật — chỉ đọc, không chạy SQL trong `backend/sql` lên đó nếu chưa được duyệt.
- Một tài khoản trong bảng `users` của DB đó (quản trị tạo, hoặc tự tạo bằng API `/api/users` khi đã có tài khoản ADMIN).

## Các bước

1. Cài thư viện cho hai phần:

   ```bash
   npm install --prefix backend
   npm install --prefix frontend
   ```

2. Tạo file môi trường từ mẫu:

   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

   Mở `backend/.env`, điền `DATABASE_URL`. Các khoá khác để trống được khi chạy dev (xem chú thích trong file mẫu). `frontend/.env` chỉ cần khi thử thông báo đẩy.

3. Chạy SQL bổ sung lên DB (chỉ khi DB chưa có; mọi file đều chạy lại được an toàn):

   | File | Bắt buộc? | Tạo gì |
   |---|---|---|
   | `backend/sql/2026-10-03_notifications.sql` | Nên có | bảng `notifications`, cột `users.notify_prefs` (hộp thông báo) |
   | `backend/sql/2026-10-07_workshop_groups.sql` | Nên có | bảng `workshop_group_mapping` (gộp xưởng) |
   | `backend/sql/2026-10-10_vuong_mac_quy_trinh.sql` | Nên có | cột quy trình `status/priority/...` cho `vuong_mac`, nới ràng buộc `vuong_mac_log.action` |
   | `backend/sql/2026-10-09_indexes_toc_do.sql` | Tuỳ chọn | index tăng tốc; dùng `CREATE INDEX CONCURRENTLY`, chạy ngoài transaction |

   ```bash
   psql "$DATABASE_URL" -f backend/sql/2026-10-03_notifications.sql
   psql "$DATABASE_URL" -f backend/sql/2026-10-07_workshop_groups.sql
   psql "$DATABASE_URL" -f backend/sql/2026-10-10_vuong_mac_quy_trinh.sql
   ```

   Thiếu file nào thì app vẫn chạy nhưng tính năng tương ứng tắt hoặc báo 409 kèm hướng dẫn (ví dụ "Nhận xử lý" ở vướng mắc khi chưa chạy file 2026-10-10).

4. Chạy hai server ở hai cửa sổ terminal:

   ```bash
   npm run dev --prefix backend
   ```

   ```bash
   npm run dev --prefix frontend
   ```

   Backend in `Server running on http://localhost:5000`. Vite in địa chỉ `http://localhost:3000`.

5. Mở `http://localhost:3000`, đăng nhập bằng tài khoản trong bảng `users`. Lần đầu app tải toàn bộ 12 bảng qua `/api/all-data` (vài chục MB nén gzip) rồi cất vào IndexedDB, các lần sau chỉ tải bảng nào đổi phiên bản.

## Kiểm tra đã đúng chưa

- `curl http://localhost:5000/` trả "Server Backend PostgreSQL đang hoạt động bình thường!".
- Trang Tổng quan hiện số liệu, không có ô "Đang tải" treo quá 1 phút.
- Bản điện thoại: `http://localhost:3000/m/`.

Trước khi commit:

```bash
npx --prefix frontend tsc --noEmit -p frontend
npx --prefix backend tsc --noEmit -p backend
```

Nếu sửa backend, đóng gói lại và commit `backend/api/dist.js` (CI sẽ chặn nếu quên):

```bash
npm run build:bundle --prefix backend
```

## Lỗi thường gặp

| Hiện tượng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Vào trang bị đá về `/login` liên tục | `JWT_SECRET` backend khác lúc ký token (đổi .env rồi không đăng nhập lại) | Đăng xuất, đăng nhập lại |
| `ERR_CONNECTION_REFUSED` cho `/api/*` trong console | Backend chưa chạy hoặc chạy cổng khác 5000 | Kiểm tra `PORT` trong `backend/.env` khớp `vite.config.ts` |
| 409 "Máy chủ chưa chạy file SQL backend/sql/2026-10-10..." | DB thiếu cột quy trình vướng mắc | Chạy file SQL đó |
| Thêm cột vào `REPORT_COLUMNS` mà trình duyệt không thấy | Cache IndexedDB chỉ đổi theo phiên bản dữ liệu | Tăng `CACHE_DB_NAME` trong `frontend/services/dataService.ts` và thêm tên cũ vào `OLD_CACHE_DB_NAMES` |
| `tsc` hết bộ nhớ trên máy yếu | Dự án frontend lớn | `NODE_OPTIONS=--max-old-space-size=3072 npx tsc --noEmit -p frontend` |
| Thông báo đẩy không tới | Thiếu VAPID hoặc `VITE_VAPID_PUBLIC_KEY` khác `VAPID_PUBLIC_KEY` | Tạo lại cặp khoá, điền cả hai file .env |

## Đọc tiếp

- [Danh sách API](tham-chieu-api.md)
- [Bảng dữ liệu app dùng](tham-chieu-bang-du-lieu.md)
- [Quy tắc số liệu và kiến trúc dữ liệu](giai-thich-so-lieu-va-kien-truc.md)
