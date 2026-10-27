# Đối chiếu số chatbot "Hỏi số liệu" với số các trang trong app (DB ở máy)

Ngày chạy: 23/10/2026 (hôm nay thật của máy — cả chatbot và trang đều dùng ngày này). DB: bản sao localhost
(`db_production_full`, bảng sản xuất cập nhật 15/10, nhập kho 19/10, tồn kho chốt 15/10). Backend thật chạy từ
`backend/api/dist.js` ở cổng 5093, tài khoản ADMIN.

Cách lấy số:
- **Chatbot — tự tra**: dịch câu bằng đúng `hieuTruyVan()` (danhMuc.mau.json + tuDien.mau.json), quyết định đường đi
  (mẫu / tự tra / hỏi lại) đúng như `HoiDapPopup.traLoiCau`, rồi POST `/api/hoi-dap/truy-van`.
- **Chatbot — mẫu**: `traLoi.ts` gọi chính các API của trang (`/api/overview/summary`, `/api/stock/dates`,
  `/api/tong-quan/cong-trinh`, `/api/vuong-mac/dashboard`…) nên số **bằng trang theo cấu tạo**; bảng dưới chủ yếu đối
  chiếu tầng tự tra (có ghi rõ chỗ nào đường đi thật là mẫu).
- **Trang**: `/api/overview/summary|by-group` (Tổng quan), `/api/stock/dates` (Tồn kho), `/api/tong-quan/cong-trinh`
  → `giaiNenBanGhi` + `tinhChiSo` (Tổng quan công trình / thẻ BOT), `/api/khsx-nhapkho/summary` (Kế hoạch tháng / tuần),
  `/api/vuong-mac/stats` (Vướng mắc), SQL theo đúng định nghĩa trang khi không có thẻ.
- Tiền ở DB là **triệu đồng**; trang KHSX trả **tỷ** (đã quy đổi khi so).

## Bảng đối chiếu

| # | Câu hỏi (đường đi thật) | Số chatbot | Số trang | Lệch | Nguyên nhân | Kết luận |
|---|---|---|---|---|---|---|
| 1 | nhập kho tháng 9 (mẫu; tự tra cùng số) | 156.077,36 tr · 2.157 HEX | Tổng quan 01–30/9 inventory: 156.077,36 · 2.157 | 0 | — | **khớp** |
| 2 | nhập kho tháng 9 theo xưởng (mẫu; tự tra cùng số) | 4A 41.870,29/488 · 3A 38.087,08/328 · 2A 28.181,70/175 · 5A 23.353,35/493 · 8AB 12.597,85/244 · 8C 9.806,09/213 · KHÁC 2.180,99/218 | by-group inventory/xuong: y hệt từng dòng | 0 | gộp xưởng cùng `workshopGroupSql` | **khớp** |
| 3 | nhập kho tháng 9 xưởng 4A | 41.870,29 · 488 | summary?xuong=4A: 41.870,29 · 488 | 0 | — | **khớp** |
| 4 | xuất kho tháng 9 | 139.996,69 · 2.176 | export: 139.996,69 · 2.176 | 0 | — | **khớp** |
| 5 | đơn hàng mới tháng 9 | 130.407,52 · 1.198 | order: 130.407,52 · 1.198 | 0 | — | **khớp** |
| 6 | triển khai bản vẽ tháng 9 | 178.271,77 · 1.144 | tkbv: 178.271,77 · 1.144 | 0 | — | **khớp** |
| 7 | tính phiếu tháng 9 | 161.341,84 · 1.461 | pthsp: 161.341,84 · 1.461 | 0 | — | **khớp** |
| 8 | nhập kho tháng này so với tháng trước (tự tra, 2 lượt) | T10: 84.640,01 · 1.263 — T9: 156.077,36 · 2.157 | summary 01–23/10: mtd 84.640,01/1.263 · lastMonth 156.077,36/2.157 | 0 | — | **khớp** |
| 9 | tồn kho (mẫu; tự tra cùng số) | 278.516,04 tr · 4.094 mã SAP · chốt 15/10 | stock/dates mới nhất 2026-10-15: 4.094 · 278.516,04 | 0 | tồn kho lấy đúng 1 ngày chốt | **khớp** |
| 10 | tồn kho công trình CT25-070 (tự tra) | 32,167 tr · 4 mã | stock/dates?congTrinh=…CT25-070 ngày 15/10: 4 · 32,167 | 0 | — | **khớp** |
| 11 | hạng mục quá hạn giao (tự tra) | 4.163 hạng mục · còn lại 398.701,80 | Không có thẻ trang nào tính "quá hạn giao" (ngay_can_giao chỉ dùng làm hạn phụ). SQL cùng định nghĩa, bỏ HỦY: 4.163 · 398.701,80 (tính cả HỦY: 7.499) | 0 | SQL ghép đúng; bỏ HỦY như Tổng quan | **khớp SQL** (không có trang để so) |
| 12 | hạng mục quá hạn giao theo xưởng | 5A 1.093 · 4A 943 · 3A 573 · 8AB 498 · 2A 402 · 8C 383 · KHÁC 271 (=4.163) | như trên | 0 | gộp xưởng như trang | **khớp SQL** |
| 13 | hạng mục quá hạn kế hoạch (BOT nhóm 1) | **1.133** · còn lại 166.063,93 | Thẻ BOT "Quá hạn KH" (tinhChiSo trên bản ghi /api/tong-quan/cong-trinh, không lọc): **1.133** · 185.961,10 | số HM 0 · giá trị −19.897 | Số hạng mục khớp tuyệt đối (cùng danh sách HEX đạt KH). Giá trị lệch vì "còn lại" chatbot = cột SAP `gia_tri_con_lai`, trang = trị giá − min(đã nhập, trị giá) (xem #17, #24) | **khớp số HM**; giá trị = lệch định nghĩa |
| 14 | số hạng mục quá hạn KH theo xưởng | 4A 383 · 5A 270 · 3A 189 · 2A 119 · 8C 117 · 8AB 55 (=1.133) | bản ghi trang không mang cột xưởng; tổng 1.133 khớp | 0 (tổng) | — | **khớp tổng** |
| 15 | hạng mục quá hạn KH công trình CT25-070 | 21 · 4.347,61 | Tổng quan công trình CT25-070: quaHan 21 · 4.394,86 | 0 HM · −47 tr | định nghĩa còn lại | **khớp số HM** |
| 16 | hạng mục chưa có kế hoạch nhập kho (tự tra → khái niệm `ngay_khnk_thang rỗng + ngay_khnk_tuan rỗng + còn lại > 0`) | 14.471 · 1.220.094 | Thẻ BOT "Chưa có KH nhập kho": 14.553 · 1.372.550. Chatbot nhóm BOT 6 (`nhom_bot = 6.`) cũng ra 14.553 | −82 HM | Khái niệm đòi `gia_tri_con_lai > 0`; trang tính "còn theo dõi" = chưa đủ SL và (còn giá trị hoặc trị giá ≤ 0). Nhóm BOT 6 của chatbot thì khớp trang | lệch chấp nhận được — nhưng nên để câu "chưa có KH nhập kho" đi nhóm BOT 6 thay cho khái niệm |
| 17 | công trình CT25-070 — **mẫu** (đường đi thật) | 559 HM · 49,56 tỷ · đã nhập 30,72 · còn 18,84 · quá hạn KH 21 (4,39 tỷ) | Tổng quan công trình: y hệt (mẫu dùng chính bản ghi trang + tinhChiSo) | 0 | cùng nguồn | **khớp** |
| 18 | công trình CT25-070 — tự tra (số HM / trị giá / còn lại) | 544 · 48.605,25 · 14.366,81 (bỏ HỦY); gomHuy: 559 · 49.556,39 · 15.424,58 | 559 (gồm 15 HỦY, trang cố ý) · 49.556,39 · 18.836,22 (bỏ HỦY theo công thức trang: 17.885,08) | HM −15 · trị giá −951 · còn lại −3.518 (so bản bỏ HỦY) | (a) chatbot bỏ HỦY mặc định, trang gồm HỦY (có ghi); (b) cột `gia_tri_con_lai` ≠ trị giá − đã nhập ở 48/544 HM (vd HEX 260101460: trị giá 1.484,76 · đã nhập 881,92 · `gia_tri_con_lai` = 0) | (a) chấp nhận được · (b) **lệch định nghĩa — xem #24** |
| 19 | kế hoạch nhập kho tháng này theo xưởng (tự tra khsx) | 22.289,18 tr: 4A 6.320,59 · 3A 6.088,94 · 5A 3.213,15 · 2A 2.818,16 · 8C 2.100,74 · 8AB 1.747,6 | KHSX tháng 10: KH THÁNG = 0 (chưa nhập), `weeklyKhFallback` 22,29 tỷ | 0 so với KH tuần; trang tháng = 0 | chatbot lấy đúng các dòng TUẦN (tuần 40) vì KH THÁNG không có ngày — xem #20 | khớp số tuần, nhưng là **triệu chứng của #20** |
| 20 | kế hoạch nhập kho tháng 9 (tự tra khsx; cũng là cách bộ câu kỳ vọng) | **155.769,07 tr · 1.340 HEX** — toàn dòng loại TUẦN; theo xưởng 3A 43.094 · 4A 42.269 · 2A 25.323 · 5A 24.284 · 8AB 11.092 · 8C 9.706 | KHSX tháng 9 (`phan_loai_kh LIKE '%THÁNG%'`, bỏ HỦY): **161,01 tỷ**; 4A 46,19 · 3A 38,74 · 5A 28,21 · 2A 27,03 · 8AB 11,29 · 8C 9,55 | −5.455 tr tổng; từng xưởng lệch 2–4 tỷ | Bảng `khsx`: 1.786 dòng KH THÁNG của 9/2026 có `ngay_khnk` = NULL (0/1.786 có ngày), chỉ dòng TUẦN có ngày. Danh mục chatbot đặt cột kỳ = `ngay_khnk` nên mọi câu có kỳ **bỏ hết KH tháng, chỉ cộng KH tuần**; cũng không phân biệt `phan_loai_kh` như trang (tháng → THÁNG, tuần → TUẦN) | **LỖI THẬT** |
| 21 | "kế hoạch nhập kho tháng này" / "kế hoạch nhập kho tháng 9" — **đường đi thật = mẫu nhập kho** | trả "Nhập kho (P022) tháng 10: 1.263 mục · 84,64 tỷ" / "tháng 9: 2.157 · 156,08 tỷ" | KH tháng 10 = 0 (tuần 22,29 tỷ) / KH tháng 9 = 161,01 tỷ | sai hẳn bảng | `hieuCauHoi`: "kế hoạch nhập kho" khớp luật `nhap_kho` (luật `tien_do_thang` chỉ bắt "kế hoạch tháng"); `mauLamDuoc` trả false (bảng khsx ≠ nhap_kho) nhưng `nenTuTra` không coi đó là lý do tự tra (`phuc` false) → rơi về mẫu nhập kho. Bộ câu không có câu trần này (chỉ có "…theo xưởng", "…của {ma}" — hai câu đó đi tự tra đúng) | **LỖI THẬT** |
| 22 | PR chưa mua (tự tra) | 2.023 dòng · 565 PR | SQL theo định nghĩa cột BOM trang Tổng quan công trình ("1.CHƯA MUA / SAP Mở"): 2.023 · 565 (mọi dòng 1.CHƯA MUA đều SAP "Mở") | 0 | — | **khớp** |
| 23 | vướng mắc đang mở — **mẫu** (đường đi thật) | đang mở 2 (quá hạn BOT 1, chờ xác nhận 1) | /api/vuong-mac/stats: open 2 · overdue 1 · waiting 1 | 0 | mẫu dùng /api/vuong-mac/dashboard, cùng cách tính | **khớp** |
| 23b | vướng mắc đang mở **theo xưởng** (đường đi thật = tự tra) | 9 vướng mắc (3A 5 · 4A 2 · 8C 1 · 5A 1) — đếm MỌI vướng mắc năm nay | stats.byXuong: 4A open 1 · 3A open 1 (Đã đóng 6, Đã xong 1 không tính) | +7 | `hieuTruyVan` không có khái niệm "đang mở" cho bảng vướng mắc → không lọc `status`; chỉ có "quá hạn" | **LỖI THẬT** |
| 24 | vướng mắc quá hạn (mẫu; tự tra `qua_han = Quá hạn` = 1) | 1 | stats.overdue 1 | 0 | — | **khớp** |
| 25 | "còn lại / chưa nhập kho" nói chung (khái niệm `gia_tri_con_lai > 0`) — kiểm tra toàn bảng | tổng `gia_tri_con_lai` (bỏ HỦY) 1.461.741 tr | công thức trang Σ(trị giá − min(đã nhập, trị giá)) bỏ HỦY: 1.670.824 tr; 1.387 HM trang còn theo dõi nhưng chatbot coi "hết còn lại" (733 ở "13. CHƯA PHIẾU PHẦN CÒN LẠI", 559 "HOÀN THÀNH / NHẬP KHO ĐB"); ngược lại 1.725 HM | −209.083 tr | Cột SAP `gia_tri_con_lai` không phải trị giá − nhập kho lũy kế | **lệch định nghĩa, cần quyết** (xem ghi chú) |

## Nguyên nhân thật của các lệch

1. **KH tháng mất khi lọc kỳ (bảng `khsx`)** — `backend/src/server/hoiDapDanhMuc.ts` bảng `khsx` khai `ngay: 'ngay_khnk'`.
   Dòng loại THÁNG không có `ngay_khnk` (NULL), chỉ dòng TUẦN có. Mọi câu kế hoạch có kỳ (tháng này, tháng 9, quý 3…)
   chỉ cộng KH TUẦN → "kế hoạch nhập kho tháng 9" ra 155,77 tỷ thay cho 161,01 tỷ của trang; từng xưởng lệch 2–4 tỷ.
   Trang (`backend/src/routes/khsx.ts`) lọc bằng `nam`/`thang` (+ `tuan`) và `phan_loai_kh LIKE '%THÁNG%'` khi xem tháng,
   `'%TUẦN%'` khi xem tuần. Hướng sửa: cột kỳ của `khsx` nên là biểu thức từ `nam`/`thang`/`tuan`
   (vd `COALESCE(t.ngay_khnk, make_date(t.nam::int, t.thang::int, 1))`), và mặc định lọc `phan_loai_kh` = THÁNG khi kỳ là
   tháng / quý / năm, TUẦN khi kỳ là tuần (hoặc nhóm theo `phan_loai_kh` để không cộng đôi). Cập nhật `danhMuc.mau.json`,
   kỳ vọng bộ câu nhóm "kế hoạch" (`mauCau.ts` k6-*) nếu đổi dạng lọc.
2. **"kế hoạch nhập kho tháng này/tháng 9" trả lời bằng mẫu NHẬP KHO** — `frontend/components/HoiDap/hieuCauHoi.ts`
   (LUAT: `nhap_kho` bắt "nhập kho" trước khi xét "kế hoạch") + `hieuTruyVan.ts nenTuTra`: khi `mauLamDuoc` = false vì
   **khác bảng** (tv.bang `khsx` ≠ mẫu `nhap_kho`, `roBang` true) vẫn trả false nếu `phuc` false → popup dùng mẫu. Hướng
   sửa: trong `nenTuTra`, bảng của tự tra khác bảng mẫu mà câu gọi tên bảng rõ (`h.roBang`) ⇒ `true`; hoặc thêm luật
   `ke_hoach_tuan/tien_do_thang` bắt "kế hoạch nhập kho". Thêm câu trần "kế hoạch nhập kho tháng này" vào bộ câu
   (`mauCau.ts`, kỳ vọng tu_tra khsx 2026-10-01..31).
3. **"đang mở" của vướng mắc không lọc** — `hieuTruyVan.ts` KHAI_NIEM chưa có khái niệm cho bảng `vuong_mac`
   "đang mở / chưa xong / đang xử lý" = `status bang ['Mới', 'Đang xử lý']` (cột `status` ở danh mục có gt
   `['Đang xử lý', 'Đã xong', 'Đã đóng']`, thiếu 'Mới'). Mẫu che được câu trần ("vướng mắc đang mở") nhưng câu có "theo xưởng",
   "theo công trình", "công trình X" rơi vào tự tra và đếm cả đã đóng. Cũng cần bổ sung gt 'Mới' trong
   `hoiDapDanhMuc.ts` để lọc được.
4. **"còn lại" = cột SAP `gia_tri_con_lai`** — khác công thức trang `trị giá − min(đã nhập, trị giá)` (core
   `banGhiCongTrinh.ts`). Toàn bảng lệch 209 tỷ (1,46 nghìn tỷ vs 1,67 nghìn tỷ), 1.387 HM trang còn theo dõi mà chatbot
   coi hết còn lại. Số **hạng mục** của BOT vẫn khớp vì cột `nhom_bot` dùng điều kiện MO (trị giá > đã nhập) chứ không dùng
   `gia_tri_con_lai`. Đây là chỗ cần người dùng/agent quyết: hoặc đổi cột `gia_tri_con_lai` trong danh mục thành biểu thức
   `GREATEST(COALESCE(t.tri_gia_don_hang_tong,0) − COALESCE(t.thanh_tien_nhap_kho_luy_ke,0), 0)` (và khái niệm "chưa nhập kho"
   dùng nó) để khớp trang, hoặc giữ cột SAP và ghi rõ trong câu trả lời "còn lại theo SAP". Nếu đổi, kỳ vọng `loc`
   `gia_tri_con_lai lon_hon 0` trong bộ câu vẫn đúng (cùng id cột).

Những lệch còn lại (HỦY: chatbot bỏ, trang Tổng quan công trình gồm; khái niệm "không có kế hoạch" ≠ nhóm BOT 6 ở 82 HM)
là định nghĩa khác đã có ghi chú trong câu trả lời (`boHuy`) hoặc chấp nhận được.

## Kết luận

Tầng **mẫu** luôn bằng trang (cùng API). Tầng **tự tra** khớp tuyệt đối với Tổng quan (nhập / xuất / đơn hàng / triển khai /
tính phiếu, theo kỳ và theo xưởng), tồn kho (tổng + 1 công trình), số hạng mục BOT quá hạn KH (1.133 — tổng, theo xưởng,
theo công trình), chưa có KH (nhóm BOT 6), PR chưa mua, vướng mắc quá hạn. Ba lỗi thật: (1) bảng kế hoạch mất hết KH THÁNG khi
lọc theo kỳ vì KH tháng không có `ngay_khnk`; (2) câu trần "kế hoạch nhập kho tháng này / tháng 9" bị trả bằng mẫu NHẬP KHO
(sai bảng); (3) "vướng mắc đang mở" không lọc trạng thái khi đi đường tự tra. Một lệch định nghĩa cần quyết: "còn lại"
dùng cột SAP `gia_tri_con_lai` khác công thức trang (−209 tỷ toàn bảng, −3,5 tỷ ở CT25-070).
