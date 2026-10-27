# Bảng ghép nhóm vật tư ↔ công đoạn (tab BOM, cờ "▲ cần ngay")

Chốt 21/10/2026 từ dữ liệu thật (bảng `vat_tu` + `production_status_app`, DB a-only-colt, chỉ đọc).

Dòng PR nối hạng mục qua mã nhà máy (`ma_nha_may`, không có thì mã 13 số trong `item_note_pr`; mã 13 số bỏ 4 số đầu = HEX).
Nhóm lấy từ 3 số đầu cột `nhom_vt`.

| Cột trong lưới | Nhóm VT (`nhom_vt`) | Dòng PR gắn HM (thật) | Cần ở công đoạn (`tinh_trang`) |
|---|---|---:|---|
| Gỗ · Ván | 101 Gỗ, 102 Tấm/Ván, 103 VL dán bề mặt, 104 VL dán cạnh | 485 | 07. CTS · 07.2. PHÔI · 06. MÁY · 05. MỘC |
| Kim loại | 105 Kim loại | 900 | 06.1. HÀN · 03.3. FITTING KL · 04.2. PVD · 04.3. SƠN TĨNH ĐIỆN |
| Đá | 111 Đá, 122 Gạch | 594 | 07.1. CTS ĐÁ · 05.1. TỔ ĐÁ |
| Kính | 110 Kính | 3.152 | 03. FITTING |
| Phụ kiện | 115 Phụ kiện | 416 | 03. FITTING |
| Vải · Da · Nệm | 106 Vải, 107 Da, 108 NVL phụ may/bọc sofa | 1.072 | 04.1. BỌC NỆM |
| Gia công ngoài | 806 Gia công | 5.728 | — (bản thân là công đoạn 16.x — hiện trạng thái, **không** tính là chặn) |
| Khác | 109 Mây tre, 116 VT SX bao bì, 118 VL trang trí, 899 Khác… | ~130 | — (không gắn công đoạn) |

Không hiện trong lưới:
- **112 Sơn**: 0 dòng PR gắn hạng mục (mua gộp theo công trình / tồn kho) → công đoạn 04. VECNI không kiểm được vật tư theo hạng mục; định mức sơn chỉ có ở cột `nvl_vecni` bảng sản xuất.
- 113 Keo, 114 Hoá chất, 121 Vật tư phụ, 117 VL xây dựng: gần như không gắn hạng mục.
- 4xx (CCDC, dao cụ, thiết bị…), 7xx, 8xx trừ 806: không phải vật tư của hạng mục.

Công đoạn không có nhóm vật tư "cần ngay": 05.2. NGUỘI, 04. VECNI, 02. BAO BÌ, 02.1. ĐÓNG KIỆN.

## Quy tắc "▲ cần ngay"

Hạng mục đang ở công đoạn X, có dòng PR (đã gắn HEX, chưa HỦY, `so_luong_con_lai` > 0) thuộc nhóm cần ở X.

Đếm thử trên dữ liệu thật (toàn công ty, 21/10, chưa trừ dòng "về theo nhu cầu SX"):

| Công đoạn | Hạng mục đang chờ vật tư |
|---|---:|
| 04.1. BỌC NỆM (Vải · Da) | 58 |
| 05. MỘC (Gỗ · Ván) | 34 |
| 06. MÁY (Gỗ · Ván) | 27 |
| 07.2. PHÔI (Gỗ · Ván) | 19 |
| 03. FITTING (Kính, Phụ kiện) | 18 |
| 07. CTS (Gỗ · Ván) | 14 |
| 07.1. CTS ĐÁ (Đá) | 1 |
| **Tổng** | **171** |

(Nếu tính cả gia công ngoài thì thêm 345 mục ở 16.x — đây là hàng đang gia công bên ngoài, không phải bị chặn, nên bỏ.)

Khi code: loại thêm dòng "về theo nhu cầu SX" và dòng đã về đủ theo kho (`sl_hang_ve_thuc_te`) giống cách tab BOM đang phân loại dòng PR.

# Lý do trễ của hạng mục quá hạn KH nhập kho (tab BOT, cột "Trễ vì")

Mỗi hạng mục quá hạn lấy 1 lý do CHÍNH theo thứ tự ưu tiên (vẫn hiện thêm các lý do phụ):

| # | Lý do | Nhóm | Điều kiện (dữ liệu thật) |
|---|---|---|---|
| 1 | Vướng mắc đang mở | VM | `vuong_mac` cùng HEX, `is_resolved = false` và `closed_at` trống |
| 2 | Chờ vật tư của công đoạn | BOM | dòng PR còn chờ thuộc nhóm "cần ngay" ở công đoạn hiện tại (bảng ghép ở trên) |
| 3 | Chưa triển khai bản vẽ | BOP | `tinh_trang` 15 |
| 4 | Chưa có phiếu | BOP | `tinh_trang` 13 / 14 |
| 5 | Có phiếu, chưa vào SX | BOP | `tinh_trang` 11 / 12 |
| 6 | Gia công ngoài chưa về | GCN | `tinh_trang` 16.x (kèm `tinh_trang_gcn`) |
| 7 | Đứng ≥ 4 tuần ở công đoạn | BOP | `so_ngay_cd_hien_tai` từ 4 tuần |
| 8 | Nhập kho chưa đủ SL | NK | `tinh_trang` 01. NHẬP KHO KĐB |
| 9 | Đang SX, chậm so KH | ? | không rơi vào lý do nào ở trên |

Chạy thử trên dữ liệu thật ngày 21/10 (toàn công ty, 822 hạng mục quá hạn KH):

| Lý do chính | Hạng mục | % |
|---|---:|---:|
| Đang SX, chậm so KH (không thấy vướng) | 338 | 41% |
| Gia công ngoài chưa về | 206 | 25% |
| Có phiếu, chưa vào SX | 105 | 13% |
| Nhập kho chưa đủ SL | 90 | 11% |
| Chưa có phiếu | 46 | 6% |
| Chờ vật tư của công đoạn | 30 | 4% |
| Chưa triển khai bản vẽ | 7 | 1% |
| Vướng mắc đang mở | 0 | 0% |
| Đứng ≥ 4 tuần (không kèm lý do khác) | 0 | 0% |

Ghi chú: QC lỗi chưa đưa vào (dữ liệu QC nằm ở ô `tong_hop_thong_tin_qc`, cần tách theo lần kiểm) — nên thêm làm lý do riêng khi code.
