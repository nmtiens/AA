# Quy tắc số liệu và kiến trúc dữ liệu

Tài liệu này trả lời "vì sao số ở trang này khớp (hoặc phải khớp) số ở trang kia" và "dữ liệu đi từ DB tới màn hình như thế nào". Phần quy tắc lấy từ `frontend/utils/productionMetrics.ts`, nơi mọi trang cùng gọi.

## Vấn đề

Cùng một công trình được xem ở nhiều chỗ: Tổng quan, Luồng đỏ, Báo cáo tiến độ công trình, cửa sổ BOT/BOP/BOM, tồn kho. Nếu mỗi trang tự tính "đã nhập kho", "còn lại", "quá hạn" theo cách riêng thì người dùng thấy hai số khác nhau cho cùng một thứ và mất niềm tin vào cả hai. Dữ liệu nguồn lại có nhiều bẫy: đơn huỷ vẫn có trị giá, thành tiền nhập kho đôi khi vượt trị giá hoặc bằng 0 dù đã nhập đủ số lượng, một công trình có nhiều cách viết tên, và 85% hạng mục đang sản xuất không có kế hoạch nhập kho tuần/tháng.

## Quy tắc chung (bắt buộc với mọi view)

| Quy tắc | Cụ thể | Hàm |
|---|---|---|
| Đơn huỷ | `tinh_trang_ipo` chứa "HỦY" → trị giá, đã nhập, còn lại đều = 0 khi tính tổng (trang Báo cáo tiến độ cho phép lọc IPO để thấy cả huỷ) | `isCancelledIpo`, `orderValue` |
| Đã nhập kho (tiền) | `min(max(nhập kho luỹ kế, 0), trị giá)` | `doneValue` |
| Còn lại (tiền) | `trị giá − đã nhập`, không âm | `remainValue` |
| Đã xong khi ĐẾM / tính hạn | nhập đủ **số lượng** đơn hàng cũng coi là xong dù tiền thiếu (lệch đơn giá) | `isQtyComplete`, `isStocked` |
| Hạn (BOT) | chỉ KH nhập kho **tuần → tháng**. KH của kỳ đã đạt SL (server `/api/production/plan-met`) thì bỏ qua. Ngày cần giao / ngày cần (PM) / BOT dự án chỉ **tham khảo**, không tính quá hạn | `deadlineOf`, `planAfterDue` |
| Công trình | gom theo mã → một tên chuẩn (cách viết nhiều dòng nhất), làm một lần ở `App.tsx`; so tên giữa các bảng bằng `projectMatchKey` | `canonicalizeProjectNames`, `projectMatchKey` |
| Tiền | DB lưu **triệu đồng**; hiển thị tỷ = chia 1.000, luôn 2 chữ số thập phân | `utils/money.ts` |
| Vật tư | trạng thái từng dòng PR theo cột trạng thái + SL còn lại SAP: huỷ, đã nhận đủ, PR đóng chưa nhận đủ, chưa mua, kho báo về chờ SAP, đang mua trễ hẹn / chưa tới hẹn | `materialLineState` |
| Nhóm giá trị còn lại (BOP) | P001 hoặc "15. CHƯA TRIỂN KHAI" → chưa triển khai; P002 → chưa tính phiếu; P012→P021 → đang trên chuyền; còn lại → nhập kho chưa đủ | `remainBucketOf` (usePivotTables) |

Hệ quả cần nhớ:

- "Hạng mục đã nhập kho" đếm theo quy tắc số lượng, còn "giá trị đã nhập kho" tính theo tiền. Hai con số có thể cho cảm giác lệch nhau, đó là cố ý.
- "Đã xuất / giao" ở Báo cáo tiến độ = đã nhập − tồn kho theo từng hạng mục, không lấy bảng xuất kho vì bảng đó chỉ có từ 01/2025.
- Mốc tham khảo (ngày cần giao, BOT dự án, tuổi đơn từ ngày nhận PM) được thêm vào tab BOT vì phần lớn hạng mục không có KH tuần/tháng; chúng luôn được ghi nhãn "tham khảo".

## Luồng dữ liệu

```
ETL (ngoài app) ──> PostgreSQL ──> table_versions.last_updated đổi
                                        │
            ┌───────────────────────────┴───────────────────────────┐
            │ GET /api/check-versions (poll 60s, khi mở tab)         │
            ▼                                                        ▼
   Trình duyệt so với IndexedDB (OpsHub_Database_V13)      API tổng hợp (overview, trend, stock,
   bảng nào đổi → GET /api/all-data?tables=...             khsx, by-hex...) cache theo phiên bản
   (gzip sẵn, cột theo REPORT_COLUMNS)                     bảng liên quan (server/cache.ts)
            │                                                        │
            ▼                                                        ▼
   App.tsx: canonicalizeProjectNames, canonicalizeWorkshops,   JSON cho từng khối
   canonicalizePersonNames → context cho mọi trang
            │
            ▼
   Trang tính số liệu ở client bằng productionMetrics.ts
   (Tổng quan, Báo cáo tiến độ, BOT/BOP/BOM, HEX detail)
```

Hai đường song song: **bảng thô xuống client** (tính ở trình duyệt, lọc tức thì, 51k dòng sản xuất) và **API tổng hợp** (SQL nặng, cache ở server). Khi thêm số liệu mới, chọn đường theo câu hỏi: cần lọc chéo tức thì theo mọi cột thì tính ở client; cần gộp nhiều bảng lớn hoặc cột nặng (QC, ghi chú) thì làm API theo HEX như `/api/production/by-hex-extra`.

## Vì sao có `backend/api/dist.js` trong git

Vercel chạy backend từ một file đóng gói bằng esbuild, không build TypeScript lúc deploy. Sửa backend mà quên `npm run build:bundle --prefix backend` thì production vẫn chạy code cũ. CI (`.github/workflows/ci.yml`) đóng gói lại và so sánh, lệch là chặn.

## Vì sao cache IndexedDB có tên phiên bản

Client chỉ tải lại một bảng khi `last_updated` của bảng đó đổi. Thêm cột vào `REPORT_COLUMNS` không đổi `last_updated`, nên dữ liệu cũ trong IndexedDB thiếu cột mới mãi cho tới lần ETL kế tiếp. Đổi `CACHE_DB_NAME` (V12 → V13...) buộc tải lại toàn bộ; tên cũ liệt kê trong `OLD_CACHE_DB_NAMES` để xoá.

## Đánh đổi đã chọn

| Chọn | Bỏ |
|---|---|
| Tải cả 12 bảng xuống client, tính ở trình duyệt | Dung lượng lần đầu vài chục MB; máy yếu chậm khi mở 51k dòng |
| Cache server theo phiên bản bảng, sống trong instance | Sau deploy hoặc instance mới phải làm nóng lại (`/api/warmup`) |
| Quy tắc hạn chỉ dùng KH tuần/tháng | Nhiều hạng mục "không có BOT"; bù bằng mốc tham khảo có nhãn rõ |
| Gộp tên công trình theo mã, chốt theo tên khi một tên dùng cho nhiều mã | Vài công trình phải xử lý tay trong bảng alias |
| Vướng mắc tự phát hiện DB đã chạy SQL quy trình hay chưa (`hasWorkflowSchema`) | Trước khi chạy SQL, vài thao tác trả 409 kèm hướng dẫn thay vì hoạt động |

## Đọc tiếp

- [Dựng môi trường](huong-dan-dung-moi-truong.md)
- [Danh sách API](tham-chieu-api.md)
- [Bảng dữ liệu](tham-chieu-bang-du-lieu.md)
- Quy trình vướng mắc: `backend/sql/README_vuong_mac_quy_trinh.md`
