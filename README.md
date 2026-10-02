# Operations Hub

Hệ thống báo cáo sản xuất – đơn hàng – kho cho nhà máy: Dashboard tổng quan, báo cáo tiến độ công trình,
biểu đồ quản trị, bảng dữ liệu, và bản điện thoại (PWA) để tra cứu hex và ghi nhận vướng mắc.

| Phần | Công nghệ | Chạy local |
|---|---|---|
| `frontend/` | React 18, Vite 5, TypeScript, Tailwind 3, Recharts | http://localhost:3000 (bản điện thoại: `/m/`) |
| `backend/` | Express 5, TypeScript, PostgreSQL (`pg`), JWT, web-push | http://localhost:5000 |

Khi chạy dev, Vite chuyển tiếp `/api/*` sang `localhost:5000`.

## Cài đặt

Cần Node.js 20 trở lên và chuỗi kết nối PostgreSQL (xin quản trị dự án).

```bash
npm install --prefix backend
npm install --prefix frontend
```

Tạo `backend/.env` (đã nằm trong `.gitignore`, **không commit**):

```env
PORT=5000
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DBNAME
JWT_SECRET=...            # bắt buộc ở production
ALLOWED_ORIGINS=...       # bắt buộc ở production, nhiều domain cách nhau dấu phẩy
WARMUP_SECRET=...         # khoá cho /api/warmup
CRON_SECRET=...           # khoá cho /api/cron/*
VAPID_PUBLIC_KEY=...      # thông báo đẩy (tạo bằng: npx web-push generate-vapid-keys)
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:...
```

Tạo `frontend/.env` nếu dùng thông báo đẩy: `VITE_VAPID_PUBLIC_KEY=<giống VAPID_PUBLIC_KEY>`.

## Chạy

```bash
npm run dev --prefix backend
npm run dev --prefix frontend
```

## Quy ước quan trọng

- **Đơn vị tiền:** mọi cột tiền trong DB lưu theo **triệu đồng** (xem `frontend/utils/money.ts`). Hiển thị "Tỷ" thì chia 1.000.
- **Đăng nhập:** mọi route `/api/*` yêu cầu JWT, trừ đăng nhập / quên mật khẩu (`backend/src/server/app.ts`).
  Frontend tự gắn token qua `frontend/services/authFetch.ts`.
- **Thêm cột cho một bảng:** thêm vào `REPORT_COLUMNS` (`backend/src/server/data.ts`), rồi đổi tên cache
  IndexedDB `OpsHub_Database_Vn` trong `frontend/services/dataService.ts` để trình duyệt tải lại.
- **Menu và phân quyền:** `frontend/App.tsx` (route) và `frontend/types.ts` (`APP_VIEWS`, `PERMISSION_GROUPS`).

## Cấu trúc backend

```
backend/api/index.ts      điểm vào: ghép app, import các nhóm route theo thứ tự
backend/src/server/       dùng chung: config, app (middleware), auth, validation, data, common
backend/src/routes/       mỗi file một nhóm API: data, overview, stock, revenue, settings,
                          auth, users, khsx, trend, vuongMac
backend/src/vuongMacPush.ts   Web Push + cron nhắc hạn BOT
```

## Kiểm tra trước khi commit

```bash
npx --prefix frontend tsc --noEmit -p frontend
npx --prefix backend tsc --noEmit -p backend
```

## Deploy (Vercel)

`vercel.json` build frontend bằng `@vercel/static-build` và chạy backend từ file đóng gói
`backend/api/dist.js`. **Sau mỗi lần sửa backend phải đóng gói lại và commit file này:**

```bash
npm run build:bundle --prefix backend
```
