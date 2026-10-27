# Gom lỗi theo nguyên nhân gốc — vòng 1 (chấm 23/10/2026, HÔM NAY của bộ câu = 19/10/2026)

Lệnh chấm: `cd C:/project_v2/frontend && npx vitest run components/HoiDap/boCau/chamFile.test.ts`

**CHẤM TỔNG: 500 câu · đúng 299 (59.8%) · hỏi lại 2**

| File | Câu | Đúng | Hỏi lại | Sai / nhờ AI |
|---|---|---|---|---|
| giam-doc.json | 100 | 57 | 0 | 43 |
| ke-hoach-ke-toan.json | 100 | 61 | 0 | 39 |
| kho-mua-hang.json | 100 | 71 | 0 | 29 |
| pm.json | 100 | 59 | 1 | 40 |
| xuong.json | 100 | 51 | 1 | 48 |

Cách rà: với mọi câu không đúng (201 câu), chạy lại qua `hieuCauHoi` + `hieuTruyVan` + `apNguCanh` (file vitest tạm, HOM_NAY = 19/10/2026),
rồi chạy thêm 1 lượt **đã mở viết tắt** (bn → bao nhiêu, hm → hạng mục, ntn, ko, sl, sp, tg, trc, ncc, ds, dc, hnay, kh → kế hoạch,
bỏ "thôi / lấy / nhỉ / bên") để tách câu *chỉ* thiếu viết tắt khỏi câu có lỗi sâu hơn. Kết quả: **53 câu đúng ngay sau khi mở viết tắt**;
148 câu còn lại xếp vào các cụm dưới. Mỗi câu nằm đúng 1 cụm (cụm = nguyên nhân còn chặn sau khi đã bỏ viết tắt). Viết tắt id:
gd = giam-doc, kk = ke-hoach-ke-toan, kmh = kho-mua-hang, pm, x = xuong.

Thứ tự cụm theo số câu giảm dần.

---

## 1. `parser-viet-tat` — viết tắt / từ đệm / khẩu ngữ chưa có trong TU_DEM, LUẬT hieuCauHoi (parser) — **63 câu**

Ý: bộ đọc đã đọc ĐÚNG truy vấn, chỉ còn 1–2 chữ "chưa hiểu" nên đi nhờ AI (hoặc hieuCauHoi không nhận loại câu vì viết tắt).

Chữ chưa hiểu gặp (số câu): **bn** (≈25), **hm** (12), **thôi** (6), **ko / hok** (5), **tg** (3), **sp** (3), **sl** (2), **ntn** (2), **trc** (2), **dc / đc** (2),
**kh** (= kế hoạch: "rot kh", "tre han kh", "kh nk"), **ds**, **hnay**, **nhỉ**, **bên** (4A), **cùng kì**, **khp** (gõ sai "kho"), **hàg** (gõ sai 3 chữ — suaChinhTa chỉ sửa chữ ≥ 4 ký tự),
**vm** (hieuCauHoi không có → không ra mẫu vuong_mac), **nk** trong khái niệm ("chưa nk" ≠ "chưa nhập kho"), **nó** (đại từ), **hết** ("về hết chưa"), **đưa xuống** (đơn),
**giữ** ("kho đang giữ"), **xu hướng** (= theo tháng), **dòng** ("bao nhiêu dòng" không được đánh dấu), **yếu nhất** (= ít nhất).

Danh sách: gd-004, 008, 010, 011, 013, 014, 017, 021, 027, 043, 047, 052, 055, 056, 057, 058, 065, 074, 078, 086 · kk-017, 021, 025, 026, 040, 044, 046, 077 ·
kmh-002, 004, 016, 019, 024, 034, 039, 040, 044, 081 · pm-003, 006, 010, 019, 022, 028, 034, 040, 045, 048, 053, 064, 070 ·
x-002, 003, 006, 008, 019, 031, 035, 037, 045, 057, 058, 059

Ví dụ:
- gd-008 "ton kho tren 6 thang con bn tien" → nhờ AI (chưa hiểu: bn); truy vấn đã đúng.
- pm-003 "hm nào của CT26-110 đang quá hạn giao" → nhờ AI (hm); mở "hạng mục" thì đúng (kể cả kiểu liệt kê).
- gd-065 [sau "doanh thu năm nay theo khách hàng"] "top 3 thôi" → nhờ AI (thoi); nối tiếp đã đúng, chỉ dư chữ "thôi".
- kk-040 "hạng mục ko có kế hoạch theo xưởng" → "ko co ke hoach" bị đọc thành khái niệm "CÓ kế hoạch" + lọc hạng mục chứa "ko" (ngược nghĩa!).
- gd-027 "vm qua han" → đi tự tra (kỳ năm nay) thay vì mẫu vuong_mac: hieuCauHoi LUAT vuong_mac chỉ có "vuong mac|vuong".
- gd-056 "con bn tien chua nk cua capitaland" → bảng nhập kho + chưa hiểu "chua": KHAI_NIEM SX `/chua (nhap kho|nhap|…)/` không có "nk".
- gd-017 "đơn hàg trên 2 tỷ năm nay" → "hag" 3 chữ, suaChinhTa bỏ qua (w.length < 4).

Gợi ý sửa (hieuTruyVan.ts):
- Thêm bước **mở viết tắt** trước `docCau` (hàm `hieuTruyVan`, ngay trước `docCau(cau…)` và trong `suaChinhTa`): bảng VIET_TAT = { bn: 'bao nhiêu', hm: 'hạng mục', ntn: 'như thế nào',
  ko/hok/k: 'không', sl: 'số lượng', sp: 'sản phẩm', tg: 'tháng', trc: 'trước', ncc: 'nhà cung cấp', ds: 'danh sách', dc/đc: 'được', hnay: 'hôm nay', kh: 'kế hoạch' (trừ sau "khách"),
  nk: 'nhập kho', xk: 'xuất kho', vm: 'vướng mắc', tb: 'trung bình', cùng kì: 'cùng kỳ' }. Giữ độ dài gốc (Cau dùng vị trí ký tự) → mở trên chuỗi câu TRƯỚC khi tạo `new Cau`, hoặc thêm vào `TU_DEM`/dn.
  Cùng bảng này dùng cho `hieuCauHoi` (boDau rồi mở) để "vm qua han", "kh tuan 42" ra mẫu.
- `TU_DEM` thêm: thoi, lay (chỉ lấy), nhi, ben, no (nó / cái đó), het, dua (đưa xuống), giu, khi (khi nào), nguoi (bao nhiêu người), xu huong / dien bien (chỉ là "theo tháng").
- `suaChinhTa`: cho sửa chữ 3 ký tự khi chữ không có trong từ vựng và chỉ cách 1 chữ cái với 1 từ ≥ 4 ký tự ("hag" → "hang", "khp" → "kho").
- Phần đếm dòng (`demDong`, cuối docCau): khi khớp "bao nhiêu dòng / mấy đơn…" phải `c.danh(...)` chữ "dong" để không còn là chữ chưa hiểu (pm-045, kmh-009, gd-022).
- `itNhat` (docCau bước 2): thêm "yeu nhat", "kem nhat", "te nhat".
- KHAI_NIEM SX: các regex "chua nhap kho" thêm biến thể "chua nk"; vat_tu "chua ve" ok.

---

## 2. `ngu-canh` — hỏi nối tiếp lấy sai / thiếu phần câu trước (ngu_canh) — **24 câu**

Danh sách: gd-066, 071, 090 · kk-072, 078, 080, 081, 090 · kmh-062, 084 · pm-065, 071, 072, 081, 083 · x-066, 068, 069, 077, 078, 080, 081, 084, 090

Nguyên nhân con (đều ở `hieuTruyVan.ts`: `noiCauTruoc`, `noiNguCanh`, `apNguCanh`, `nguCanhSau`):

a) **Câu nối có khái niệm → không nối** (`noiCauTruoc` trả null khi `h.khaiNiem`): mất nhóm / lọc của câu trước, chỉ còn thực thể.
- gd-071 [sau "tồn kho theo công trình"] "chỉ lấy tồn trên 3 tháng" → chia [] (mất ten_cong_trinh). Cùng: kk-080, kmh-062, kk-081 ("top 5" sau đó).
- kk-090 [sau "hạng mục quá hạn kế hoạch ⟶ theo PM đi"] "còn quá hạn giao thì sao" → mất nhóm ten_pm (có cả chữ nối "thì sao" mà vẫn không nối).
- x-090 [sau "nhom san pham 8AB dang lam ⟶ ghe thoi"] "bn cai qua han giao" → mất lọc ghế (noiNguCanh chỉ kế thừa THUC_THE, không kế thừa lọc nhóm sản phẩm / trạng thái).
- pm-071 [sau "PR của CT25-070 chưa về hết chưa"] "theo nhóm vật tư" → mất `so_luong_con_lai > 0` ("nhóm vật tư" chứa tên bảng "vật tư" → roBang = true → không nối).
  Sửa: khi câu nối ngắn (≤ 6 chữ) hoặc có chữ nối ("còn … thì sao", "chỉ …", "theo …"), vẫn nối cả truy vấn trước rồi *cộng thêm* khái niệm mới; `roBang` do tên cột chứa tên bảng ("nhóm vật tư") không tính là gọi tên bảng.

b) **Câu nối ngắn có khái niệm chung ("quá hạn", "trễ", "trễ hẹn") → chọn bảng SX thay vì bảng câu trước** (KHAI_NIEM ưu tiên SX khi không gọi tên bảng):
- gd-090 [sau "vướng mắc chưa xử lý theo xưởng ⟶ 3A chi tiết đi"] "cái nào quá hạn rồi" → bảng SX (vuong_mac có cột qua_han).
- x-077 "cái nào quá hạn" (sau vướng mắc 4A) → SX; x-078 "ai đang xử lý" theo sau → tiếp tục sai (+ chưa hiểu "xu ly").
- pm-072 [sau "PR của CT25-070 chưa về hết chưa ⟶ theo nhóm vật tư"] "cái nào trễ hẹn rồi" → SX thay vì vat_tu.
  Sửa: trong `apNguCanh`, khi câu mới không gọi tên bảng và bảng câu trước CŨNG có khái niệm / giá trị cố định cùng tên (vuong_mac.qua_han, vat_tu "trễ hẹn"), đọc lại theo bảng câu trước
  (hiện chỉ đọc lại khi `!h.khaiNiem`). "cái nào" → kieu dong.

c) **`nguCanhSau` đổi bảng ngữ cảnh sang bảng mẫu (BANG_MAU) dù câu có khái niệm**: "còn bao nhiêu chưa nhập" (y = nhap_kho, roBang false) → ngữ cảnh ghi bảng nhap_kho, câu sau mất xưởng.
- x-084 [sau "ct nam phương bên 4A làm tới đâu ⟶ còn bao nhiêu chưa nhập"] "cái nào trễ hạn giao" → thiếu xưởng 4A (noiNguCanh bỏ xưởng khi khác bảng) + kiểu tong.
- pm-065 [sau "CT26-110 còn những hm nào chưa nhập kho"] "theo công đoạn đi" → bảng nhap_kho, do [].
  Sửa: `nguCanhSau` không đổi sang BANG_MAU khi `h.khaiNiem` hoặc câu đã đi tự tra.

d) **Đổi bảng giữ đối tượng** quá chặt (`chiDoiBang` ≤ 5 chữ; `noiNguCanh` bỏ xưởng/PM khi khác bảng; câu nối > 6 chữ không nối):
- x-080 [sau "kế hoạch tuần này của 8AB"] "nhập kho được bao nhiêu rồi" (6 chữ) → mất xưởng 8AB, đi mẫu nhập kho cả nhà máy; x-081 "tuần trước thì sao" cũng mất.
- gd-066 [sau "doanh thu năm nay theo khách hàng ⟶ top 3 thôi"] "sun group chi tiết theo công trình" (7 chữ) → không nối, sang bảng SX.
- kmh-084 [sau "vật tư kính chưa về ⟶ cái nào đang mua"] "của tây hồ view thôi" → câu tự nêu công trình = câu mới → mất kính / chưa về / đang mua.
- pm-083 [sau "kế hoạch nhập kho tháng này của emerald raiya"] "thực tế nhập được bao nhiêu rồi" → mất kỳ tháng này (chỉ kế thừa công trình); kk-072 "đã tính phiếu bao nhiêu" (sau capella) lại kéo kỳ mặc định năm nay vào (`if (!tv.tu && h.tv.tu)`).
  Sửa: nới ngưỡng chữ (đếm chữ sau khi bỏ từ đệm); "của X thôi / riêng X / X thôi" = thêm lọc vào truy vấn trước; khi đổi bảng giữ xưởng của câu trước nếu câu mới không nêu đối tượng;
  không copy kỳ mặc định (`h.ky` chứa "mặc định") sang truy vấn nối.

e) **Phép tính / bình quân / kiểu không được thay**:
- x-068 [sau "hôm nay xưởng 8AB có bao nhiêu người đi làm"] "tăng ca bao nhiêu giờ" → vẫn `tong so_luong_cong_nhan` (h.doRo false vì cột số nhắc không kèm gì → giữ do câu trước); x-069 "so với hôm qua" kế thừa lỗi.
- kk-078 [sau "tính phiếu quý 3 theo xưởng ⟶ chỉ 3A thôi"] "bình quân mỗi tuần" → mất `binhQuan` (noiCauTruoc chép nhom nhưng không chép binhQuan).
- x-066 [sau "… quá hạn kh ⟶ chi tiết đi"] "theo công trình đi" và pm-081 [sau "… ⟶ liệt kê ra"] "xưởng nào nhiều nhất" → vẫn kieu dong (câu "theo X" / "X nào nhiều nhất" phải về tổng).
  Sửa `noiCauTruoc`: nếu câu mới nhắc cột số khác (doNgam) → thay `do`; chép `binhQuan`; khi câu mới có nhom mà không nói "liệt kê" → kieu = 'tong'.

---

## 3. `parser-ke-hoach` — bảng kế hoạch / KH-TH / BOT: chọn bảng, kỳ, loại mẫu sai (parser) — **21 câu**

Danh sách: gd-001, 012, 032 · kk-002, 003, 005, 010, 049, 050, 052, 053, 054, 061, 063 · pm-050, 051, 079, 080, 084 · x-015, 024

Nguyên nhân con:
a) **"kế hoạch" + kỳ (tháng 11, tuần này, tuần 44, tháng 10) → chọn bảng SX** vì dn cột `ngay_khnk_thang` = "kế hoạch tháng" / `ngay_khnk_tuan` = "kế hoạch tuần" thắng ở bước đoán bảng theo cột, rồi "ke hoach" thành chữ chưa hiểu:
- gd-032 "kế hoạch tháng 11 bao nhiêu" → SX, kỳ 19/10..01/11 (!), nhờ AI (ke hoach). Cùng: kk-050 "kh thang 10 theo ct", kk-049 "công trình nào có kế hoạch tuần này", pm-051 "kế hoạch tháng 11 của tây hồ view", kk-003 "tháng 11 có kế hoạch nhập kho những công trình nào" (khái niệm "có kế hoạch nhập kho" của SX nuốt), kk-002 "kh nk tuan nay xuong 3A bn".
  Sửa (docCau bước 1, nhánh đoán bảng theo cột): câu có "kế hoạch/kh" + kỳ tương lai hoặc kỳ cụ thể (tháng N, tuần N, tháng sau) và không có khái niệm "có/không có kế hoạch" → bảng `khsx`; dn "kế hoạch tháng / kế hoạch tuần" của SX chỉ nhận khi đứng sau "có / không có / hạn".
b) **Kỳ "tháng sau / tuần sau / tháng tới"** chưa có trong `docKy` / `docKyRong`: kk-063 "tháng sau thì sao", pm-084 "tháng sau kế hoạch bao nhiêu" (nhờ AI: sau). Thêm vào `hieuCauHoi.docKy`: thang (sau|toi|ke) → tháng kế, tuan (sau|toi) → tuần kế.
c) **Khái niệm KH-TH** (bảng `phan_tich_kh_th`) chưa có luật: kk-005 "ti le dat ke hoach tuan truoc" (→ coDo dung_ke_hoach), kk-010 "nhập kho thực tế so với kế hoạch tháng 9 ntn" (→ nhap_kho_tuan), kk-052 "nk thang nay dat bn % ke hoach", kk-053 "vượt kế hoạch tuần 41 bao nhiêu" (→ vuot_ke_hoach), kk-054 "nhập kho ngoài kế hoạch tháng 9 theo công trình" (→ nhap_kho_ngoai_ke_hoach; hiện khái niệm "ngoài kế hoạch" chỉ có cho SX), pm-050 "CT26-110 tuần trước đúng kế hoạch hay rớt" (→ chia theo tinh_trang_thuc_hien_ke_hoach; hiện lọc RỚT + tong dung_ke_hoach).
  Sửa: thêm KHAI_NIEM bảng phan_tich_kh_th: /dat (bn|bao nhieu) %? (ke hoach|kh)|ti le (dat|hoan thanh) (ke hoach|kh)|thuc te so voi (ke hoach|kh)/ → bảng này + do tong nhap_kho_tuan & thanh_tien_ke_hoach; /vuot (ke hoach|kh)/ → tong vuot_ke_hoach; /(nhap kho )?ngoai (ke hoach|kh)/ → tong nhap_kho_ngoai_ke_hoach (khi câu có bảng nhập kho / không có "hạng mục"); "A hay B" với 2 giá trị cùng cột → chia theo cột đó. dn cột `nhap_kho_tuan` thêm "thực tế", "nhập thực tế".
d) **BOT**: pm-079 "CT25-070 có bao nhiêu hạng mục quá hạn BOT" → đọc thành quá hạn giao + chia theo nhom_bot (kv: nhom_bot = "1. Quá hạn KH"); pm-080 "liệt kê ra" kế thừa. x-024 "hang 4A phai nhap trong 2 tuan toi" → bảng nhập kho + giá trị "2 TUẦN" (kv: nhom_bot "2. ≤ 14 ngày").
  Sửa KHAI_NIEM: /(qua han|tre) bot/ → nhom_bot 1; /(phai|can) nhap (kho )?(trong )?(2 tuan|14 ngay) (toi|nua)/ → nhom_bot 2.
e) **Mẫu / nenTuTra**: kk-061 "kế hoạch nhập kho tháng này" → hieuTruyVan ra khsx đúng nhưng hieuCauHoi y = nhap_kho và `nenTuTra` vẫn chọn mẫu nhập kho (mauLamDuoc: m.bang nhap_kho ≠ khsx nhưng roBang… → false, rồi `h.phuc` false → trả mẫu). Sửa `nenTuTra`: `h.roBang && MAU_LAM[c.y].bang && h.tv.bang !== bang` ⇒ true (tự tra).
   gd-012 "tuần này kế hoạch nhập kho bao nhiêu" → hieuCauHoi ra nhap_kho (LUAT ke_hoach_tuan cần "ke hoach tuan" liền nhau): thêm /(ke hoach|kh) (nhap kho )?(tuan|thang)/ và /(tuan|thang) (nay|truoc|\d+) (ke hoach|kh)/.
   gd-001 "tháng này sao rồi" → kv mẫu tien_do_thang; hieuCauHoi không có luật "<kỳ> sao rồi/thế nào" không chủ ngữ → thêm: tháng → tien_do_thang, tuần → ke_hoach_tuan, năm → tien_do_nam.
   x-015 "tuần 43 xưởng 8AB phải nhập bao nhiêu" → "phải nhập / cần nhập / chỉ tiêu nhập" = kế hoạch (khsx), hiện đi mẫu nhập kho.

---

## 4. `parser-khai-niem` — khái niệm / cách nói nghiệp vụ chưa có luật, chọn bảng & cột theo khái niệm (parser) — **20 câu**

Danh sách: gd-038, 049, 050 · kk-022, 023, 050→(xem cụm 3) · kmh-023, 043, 050, 053, 059 · pm-009, 016, 058, 059, 060, 086, 090 · x-010, 021, 027

Ví dụ & gợi ý:
- **"chưa triển khai (bản vẽ)"** → chọn bảng `tkbv_full` vì "triển khai bản vẽ" là tên bảng: gd-050 "còn bao nhiêu hạng mục chưa triển khai bản vẽ", pm-009, x-027 "ban ve chua trien khai cua 3A con may cai", pm-090 [chuỗi CT26-110] "cái nào chưa triển khai bản vẽ".
  Sửa: KHAI_NIEM SX /chua (duoc )?trien khai( ban ve)?/ → tinh_trang = "15. CHƯA TRIỂN KHAI" (bộ câu chính dùng cột này; kv người viết dùng tinh_trang_trien_khai_ban_ve = "CHƯA TRIỂN KHAI" — agent bo-cau thống nhất 1 trong 2, chấm nên chấp nhận cả hai), và khái niệm phải thắng tên bảng "triển khai bản vẽ" khi có "chưa".
- **Cột riêng của SX được nhắc nhưng bảng gọi tên là dòng chảy ngắn**: kk-022 "trị giá đơn còn lại của PM LÊ MINH TUẤN" (→ dht; "còn lại" chỉ SX có), kk-023 "đơn nào sắp đến hạn giao mà chưa nhập kho" (→ dht, khái niệm SX bị bỏ), pm-058 "capella xuất kho lũy kế bao nhiêu rồi" (→ xuat_kho + kỳ "lũy kế từ đầu năm"; kv SX thanh_tien_xuat_kho_luy_ke — hoặc xuat_kho ky null theo mẫu ct-xuat-het), kmh-059 "hm nào đã nhập kho mà chưa xuất, theo ct" (→ SX thanh_tien_ton_kho_hien_tai > 0).
  Sửa docCau bước 1: nếu câu có khái niệm/cột mà CHỈ bảng SX có ("còn lại", "sắp đến hạn giao", "chưa nhập kho", "lũy kế") và tên bảng khớp chỉ là từ ngắn ("đơn", "hàng", "xuất kho" + "lũy kế") → chọn SX. "lũy kế" + công trình → không cắt từ đầu năm.
- **Thời gian ở công đoạn** (cột so_ngay_cd_hien_tai, giá trị rời "2 TUẦN", "TỪ 8 TUẦN TRỞ LÊN"…): x-021 "hạng mục nào ở 8AB nằm ở công đoạn hơn 4 tuần rồi" (kv: 5,6,7 TUẦN + TỪ 8 TUẦN TRỞ LÊN), pm-016 "… trên 8 tuần rồi" (kv: TỪ 8 TUẦN TRỞ LÊN). Thêm khái niệm: /(hon|tren|qua|lau hon) (\d) tuan/ trên bảng SX → tập giá trị ≥ N+1 tuần của từ điển cột này.
- **Tồn / tuổi**: gd-049 "hàng tồn lâu trên 1 năm còn bao nhiêu" (KHAI_NIEM ton_kho chỉ bắt "N tháng"; "tồn lâu" lại bật liệt kê lâu nhất) → thêm "(tren|hon|qua) (\d) nam" → so_thang_ton_kho > 12·N, và "tồn lâu" + ngưỡng thì không bật kieu dong. kmh-053 "PR chưa mua quá 30 ngày rồi" → đọc "30 ngày" thành kỳ; cần: /(qua|hon|tren) (\d+) ngay( roi)?/ sau trạng thái → ngay_pr < hôm nay − N.
- **Chọn bảng theo khái niệm chung "trễ hẹn"**: kmh-043 "ncc nào trễ hẹn nhiều nhất" → SX (nhacCot chỉ cộng điểm cho dn ≥ 6 ký tự, "ncc" = 3). Bỏ ngưỡng độ dài khi dn là viết tắt duy nhất của 1 bảng.
- kmh-023 "tuần 41 xuất bao nhiêu phiếu" → bảng tính phiếu (vì "phiếu" dài hơn "xuất"); "xuất … phiếu" = xuất kho đếm so_phieu (dn "phiếu xuất"). Luật: khi câu có cả "xuất/nhập" và "phiếu" đứng sau "bao nhiêu/số" → bảng xuất kho, dem_khac so_phieu.
- kmh-050 "sl còn thiếu của vật tư da" → KHAI_NIEM "còn thiếu" (so_luong_con_lai > 0) nuốt cụm nên không ra `tong so_luong_con_lai`. Luật: "số lượng/sl + <dn cột số>" → tong cột đó (khái niệm giữ nguyên).
- pm-059 "khách hàng SUN GROUP còn bao nhiêu hạng mục đang sản xuất" → thiếu `gia_tri_con_lai > 0`: "còn … đang sản xuất / đang làm" = chưa nhập xong.
- pm-060 "CT25-070 hạn giao gần nhất là khi nào" → max ngay_can_giao; kv min + còn lại > 0. "gần nhất" với ngày tương lai = sớm nhất trong hạng mục còn lại; "khi nào" vào TU_DEM.
- gd-038 "công trình nào đang kẹt ở mộc nhiều nhất" → "kẹt/nằm/đứng ở <công đoạn>" = đang ở (TU_DEM hoặc OP).
- pm-086 [sau "tkbv nam phương tháng này"] "ai vẽ" → cần nhom nguoi_trien_khai: luật "ai + động từ của bảng" (ai vẽ / ai triển khai / ai xử lý / ai phụ trách / ai mua) → chia theo cột người NGUOI[b.id] (hiện chỉ khi có "nhiều … nhất").
- x-010 "xưởng 5A định biên bao nhiêu người" → tong dinh_bien (kv tb) + chưa hiểu "người": cột định biên / số công nhân mặc định `tb` (như `mac` của diem_danh), "người" vào TU_DEM.

---

## 5. `kv-sai` — kỳ vọng người viết sai (kv_sai) — **18 câu**

Cách sửa cụ thể (agent bo-cau):
- kk-004 "tuần 43 xưởng nào rớt kế hoach": kv → `{ bang: phan_tich_kh_th, coDo: {ham: tong, cot: rot_ke_hoach}, nhom: [xuong_chinh], ky: 2026-10-19..2026-10-25 }` (bỏ loc RỚT — cùng cách với gd-055 mà bộ đọc đã đọc đúng).
- kk-012 "đơn hàng trên 2 tỷ năm nay nhé": bỏ `kieu: dong` (mẫu dh-tren của bộ câu chính là tổng).
- kk-018 "ct nam phương còn lại bao nhiêu chưa nhập kho": loc thêm `{cot: gia_tri_con_lai, op: lon_hon, gt: 0}` (như mẫu sx-ct-chua-nk).
- kk-045 "hạng mục chưa phiếu theo xưởng": loc → `{cot: tinh_trang_phieu, op: bang, gt: ["CHƯA PHIẾU"]}` (như mẫu sx-chua-phieu; không phải tinh_trang "14. CHƯA PHIẾU").
- kk-048 "tri gia da tinh phieu cua ct holiday inn": kv → `{ bang: pthsp_full, loc: [ten_cong_trinh chứa "holiday inn"], ky: null }` (cùng quy ước mẫu ct-xuat-het; bộ đọc đã đọc đúng vậy). Nếu muốn giữ SX.thanh_tien_tinh_phieu thì phải chấp nhận cả hai.
- kk-039 "kế hoạch tuần 44 của 5A" và x-079 "kế hoạch tuần này của 8AB": kv → `{ loai: mau, y: ke_hoach_tuan }` (traLoi.keHoachTuan lọc xưởng + tuần N được).
- x-051 "giờ công hành chính 8AB tuần 42": kv → `{ loai: mau, y: mra }` (mẫu MRA đọc xưởng + tuần 42; nếu muốn riêng giờ hành chính thì để tu_tra nhưng khi đó cần sửa `mauLamDuoc` xét cột số được nhắc — xem cụm 9).
- kmh-010 "hex 250012345 còn trong kho ko": kv → `{ bang: ton_kho, loc: [{cot: hex, op: bang, gt: ["250012345"]}], ky: null }` (câu gọi rõ "trong kho"; bộ đọc đã ra đúng vậy) — hoặc giữ mẫu tra_hex thì cần luật riêng.
- pm-018 "CT25-070 còn hạng mục nào trên 2 tỷ chưa nhập kho ko": loc → `[ten_cong_trinh chứa [CT25-070], tri_gia_don_hang_tong lon_hon 2000, gia_tri_con_lai lon_hon 0]` (hạng mục trị giá > 2 tỷ và chưa nhập; "chưa nhập kho" không phải "còn lại > 2 tỷ").
- x-020 "top 5 hạng mục giá trị lớn nhất đang làm ở 4A": kv → `{ kieu: tong, nhom: [ten_hang_muc], coDo: {tong, tri_gia_don_hang_tong}, gioiHan: 5, loc: [xưởng 4A], ky: null }` (bộ đọc ra đúng vậy).
- x-023, x-028, x-034, x-043, x-056 (câu danh từ không có "liệt kê / những … nào": "hạng mục sắp đến hạn giao của xưởng 3A", "hang gia cong ve tinh cua 4A", "PR trễ hẹn nhóm gỗ", "hm tren 2 ty dang o xuong 4A", "hạng mục bàn của 8AB chưa nhập kho"): bỏ `kieu: dong` — quy ước bộ câu chính (sx-qh-theo, vt-nhom-chua-ve, sx-ghe-ct…) là tổng.
- x-074 [sau "hàng 4A đang ở công đoạn nào"] "chỉ lấy mộc thôi": bỏ `kieu: dong`, chấp nhận `nhom: [tinh_trang]` (bộ đọc giữ nhóm câu trước + lọc mộc).
- x-089 [sau "nhom san pham 8AB dang lam"] "ghe thoi": bỏ `kieu: dong`, chấp nhận `nhom: [phan_loai_nhom_san_pham]`.

---

## 6. `parser-gia-tri` — timGiaTri bắt nhầm / bỏ sót giá trị từ điển, cột mã Năm/Tháng bắt nhầm chữ (parser) — **10 câu**

Danh sách: gd-019, 022 · kk-009, 051, 084 · kmh-058 · pm-005, 011, 049 · x-050

- gd-019 "hm sap den han giao 2 tuan toi con bn", pm-011 "… sắp đến hạn giao trong 2 tuần tới" → thêm lọc so_ngay_cd_hien_tai = "2 TUẦN" (giá trị cột thời gian ở công đoạn). Sửa `timGiaTri`: cấm giá trị dạng "N tuần/ngày" khi sau đó là "tới / nữa / sau / qua" hoặc trước đó là "trong".
- gd-022 "pr tre hen bn dong" → "dong" (dòng) khớp giá trị tinh_trang_pr "ĐÓNG". Thêm "dong" vào MO_HO / CHUNG; chữ sau "bao nhiêu/mấy" là từ đếm, không phải giá trị.
- x-050 "cong nhan 4A tb thang 9 bn nguoi" → "nguoi" khớp công đoạn "05.2. NGUỘI" → bảng SX. Thêm "nguoi" vào MO_HO (câu không dấu không đoán).
- kk-051 "hạng mục đang tạm ngưng theo công trình" → giá trị bop "TẠM NGƯNG" bị loại vì trùng dn cột `tam_ngung_huy_dht` của bảng dht (`cam` trong timGiaTri), rơi thành lọc tên hạng mục chứa "đang tạm ngưng". Chỉ cấm khi tên cột đó thuộc bảng đang hỏi.
- kmh-058 "hạng mục đã xuất hàng của Olalani" → tên bảng "xuất" thắng giá trị tinh_trang "00. ĐÃ XUẤT HÀNG", còn ten_hang_muc chứa "đã". Giá trị dài phủ trọn tên bảng ngắn phải thắng (nuotBang) — kiểm tra lại điều kiện `h.den - h.tu > o.den - o.tu + 3`.
- pm-005 "tây hồ view tháp 4a còn bn tiền chưa nhập kho" → "4a" đọc thành xưởng (hieuCauHoi đã có luật "4A nằm trong tên công trình thì không phải xưởng", hieuTruyVan chưa). Trong docCau bước 4: mã xưởng đứng sau "tháp / tòa / tầng / block" hoặc nằm trong tên công trình từ điển đã khớp → không phải xưởng.
- pm-049 "khsx tuần này nam phương" → cột `nam` (Năm, kiểu mã) của khsx bắt chữ "nam" → tên công trình còn "phương". kk-009 "mục tiêu năm nay theo từng tháng", kk-084 "theo tháng đi" → chia theo cột mã `thang` thay vì `thoi_gian@thang`. Sửa: cột mã Năm/Tháng/Tuần của bảng kế hoạch chỉ nhận khi theo sau là số / "này / trước"; "theo tháng" ưu tiên mốc `${b.ngay}@thang` (hoặc chấm chấp nhận cả `thang`).

---

## 7. `parser-so-sanh-xep-hang` — so sánh 2 kỳ / 2 xưởng, xếp chênh, top N không có chữ "top" (parser) — **9 câu**

Danh sách: gd-026, 054, 060 · kk-030, 032 · kmh-090 · pm-013 · x-018, 053

- gd-054 "8AB tháng này nhập bao nhiêu so với 8C" → lọc 2 xưởng nhưng không chia: "so với <xưởng/công trình>" → thêm nhom cột đó. pm-013 "so giá trị còn lại của 3 công trình CT25-070, CT26-110, CT24-066" → nhiều mã CT đầy đủ cũng phải chia theo công trình (hiện `nhieuCt` chỉ áp cho mã tắt).
- kk-030 "xưởng nào nhập kho tăng nhiều nhất tháng 9 so tháng 8" → "so tháng 8" (không có "với") không được đọc là kỳ 2 → chưa hiểu "thang". Regex kỳ 2 thêm "so <kỳ>".
- x-018 "4A tháng này nhập kho nhiều hơn hay ít hơn tháng trước" → "(nhiều|ít) hơn … <kỳ 2>" = so sánh; hiện chưa hiểu "thang truoc".
- kmh-090 [sau "xuất kho quý 3 theo công trình ⟶ so với quý 2"] "xếp theo chênh lệch giảm dần" → chưa hiểu xep/lich/dan (và sửa chính tả lượt 2 biến "chênh" → PM "chinh"). Thêm luật `chenh`: /xep (theo )?(chenh lech|muc (giam|tang)) (giam|tang) dan/ → sapChenh.
- gd-026 "tang ca thang nay xuong nao nhieu nhat", x-053 "ngày nào tháng này 4A tăng ca nhiều nhất" → "tăng ca" + "nhiều nhất" bật `sapChenh: tang` + so với kỳ trước. Regex `chenh` phải loại "tang ca" (và "tang" là tên cột giờ tăng ca đã khớp).
- gd-060 "cho tôi 10 hạng mục còn lại nhiều tiền nhất", kk-032 "3 pm có đơn hàng lớn nhất quý này" → "<N> <cột> … nhất" không có "top" → gioiHan N + chia theo cột; "có" sau tên cột người không được thành giá trị lọc (DUNG).

---

## 8. `parser-liet-ke` — câu hỏi kiểu liệt kê / tra 1 mã chưa nhận ra `kieu: dong` (parser) — **8 câu**

Danh sách: kmh-009, 054, 055 · pm-026, 032, 066 · x-030, 082

- pm-032 "tháng 9 công trình st.regis có đơn mới nào ko", kmh-009 "dòng tồn kho nào trên 2 tỷ", pm-066 [chuỗi] "cái nào trễ rồi" → regex `ds1` thiếu "don (moi )?nao", "dong … nao", "cai nao", "phieu nao", "vuong mac nao", "ma nao".
- pm-026 "hôm qua CT25-070 có nhập kho gì khong" → đi mẫu nhập kho (tổng); "có … gì (không)" = liệt kê dòng.
- x-030 "tủ áo của tây hồ view bên 4A làm tới đâu rồi", x-082 "ct nam phương bên 4A làm tới đâu" → tổng mặc định; "làm tới đâu / đến đâu rồi / tới công đoạn nào" (có lọc công trình/xưởng, không phải mẫu công trình) → liệt kê dòng (hoặc chia theo tinh_trang).
- kmh-054 "số PR 1000234567 đến đâu rồi", kmh-055 "PO 4500012345 ve chua" → số 10 chữ số bị `reHex` (9–13 số) nuốt rồi boQua vì vat_tu không có HEX → không lọc gì. Luật: số đứng sau "PR / số PR" → so_pr, sau "PO" → so_po (op bang); hỏi 1 mã → kieu dong.

---

## 9. `parser-vuong-mac-ky` — bảng vướng mắc lấy kỳ mặc định năm nay (parser) — **6 câu**

Danh sách: gd-028, 088, 089 · x-012, 054, 076

- gd-028 "vướng mắc đang xử lý theo công trình", gd-088 "vướng mắc chưa xử lý theo xưởng", gd-089 [sau đó] "3A chi tiết đi", x-054 "vướng mắc theo loại của xưởng 8AB", x-076 "vướng mắc chưa xử lý của 4A", x-012 "vm quá hạn của 4A" → đều có kỳ 2026-01-01..2026-10-19 (kv: không kỳ — vướng mắc là bảng trạng thái).
- Sửa: thêm `vuong_mac` vào `KHONG_KY_MAC_DINH` (ít nhất khi câu lọc trạng thái: đang xử lý / chưa xử lý / quá hạn). Lưu ý mẫu `vm-loai` trong mauCau có kỳ rõ → không ảnh hưởng. (x-012, x-076 kv còn ghi `kieu: dong` cho câu danh từ — agent bo-cau bỏ.)

---

## 10. `tu-dien` — thiếu cách gọi (dn) / giá trị tiếng Việt trong danh mục (tu_dien) — **6 câu**

Danh sách: kmh-018, 046, 047, 052, 060 · x-013

- x-013 "tổ 4A có bao nhiêu vướng mắc về máy", kmh-060 "vướng mắc về vật tư còn đang xử lý" → cột `vuong_mac.category` giá trị tiếng Anh (man / machine / material), câu nói "máy / vật tư / người" → không khớp (chưa hiểu "to", "vat"). Sửa `backend/src/server/hoiDapDanhMuc.ts` (+ danhMuc.mau.json): cột category thêm gt/dn ánh xạ "máy, máy móc" → machine, "vật tư, nguyên liệu" → material, "người, nhân sự, con người" → man; dn bảng vuong_mac thêm "tổ" (xưởng) hoặc TU_DEM "to".
- kmh-052 "PR cần vật tư trước 1/11 mà chưa về" → cột `ngay_can_vat_tu` dn [] nên "cần" bị khớp giá trị tinh_trang_pr "CẦN", "trước 1/11" thành kỳ. Thêm dn "cần vật tư", "ngày cần", "cần trước".
- kmh-047 "vat tu ve thuc te tuan truoc" → `ngay_thuc_te_ve` thêm dn "về thực tế", "thực tế về", "đã về". kmh-046 "pr nao hen ve tuan nay" → `ngay_du_kien_giao_hang_pmh_nhap` thêm dn "hẹn về", "hẹn giao", "hẹn". kmh-018 "tồn kho nhập từ tháng 9 mà vẫn còn nằm kho" → `ton_kho.ngay_nhap_kho` thêm dn "ngày nhập", "nhập từ".
- Kèm luật parser (hieuTruyVan `coLocNgay`): "<cột ngày> + kỳ" ("hẹn về tuần này", "về thực tế tuần trước", "nhập từ tháng 9") → lọc `trong_khoang` trên cột đó thay vì kỳ của bảng.

---

## 11. `parser-mau` — hieuCauHoi / nenTuTra chọn nhầm câu trả lời mẫu (parser) — **5 câu**

Danh sách: gd-009, 025, 037 · pm-012, 054

- gd-009 "chỗ nào có vấn đề" → tự tra vuong_mac (kv mẫu vuong_mac): LUAT vuong_mac thêm "van de", "su co" (dn đã có ở danh mục).
- gd-037 "nam phương làm tới đâu rồi" → mẫu tim_kiem (kv mẫu cong_trinh): `hieuCauHoi` chỉ nhận công trình qua mã hoặc chữ "công trình X"; cho nhận tên công trình từ từ điển `td.ct` (như hieuTruyVan đã làm) khi câu hỏi tình hình ("làm tới đâu / sao rồi / thế nào").
- pm-012 "CT25-070 tổng đơn bao nhiêu, nhập kho được bao nhiêu rồi?" → tự tra nhập kho (kv mẫu cong_trinh): câu hỏi 2 ý về 1 công trình (tổng đơn + nhập kho) = tóm tắt công trình; thêm "tong don" vào MAU_LAM.cong_trinh.tu và `nenTuTra` không ép tự tra khi câu nói ≥ 2 chỉ số của mẫu.
- pm-054 "hex 250700123 đang ở cong đoạn nào" → tự tra (nhom tinh_trang) thay mẫu tra_hex: với 1 HEX, "công đoạn nào / đang ở đâu" là đúng ý mẫu → MAU_LAM.tra_hex cho phép nhom [tinh_trang] (hoặc không chia khi lọc 1 HEX).
- gd-025 "sl cong nhan di lam hom nay" → mẫu mra (hỏi lại "xưởng nào?") thay tự tra diem_danh: LUAT mra bắt "cong nhan"; khi không có "giờ công / tỷ lệ có việc / MRA" và không có xưởng → để tự tra bảng điểm danh (hoặc `mauLamDuoc` trả false khi mẫu cần xưởng mà câu không có).
  Chung cho cụm: `mauLamDuoc` nên xét cột số được nhắc khác cột mặc định (`h.phuc` do cột số) → tự tra.

---

## 12. `mo-ho` — câu hai nghĩa, chatbot nên hỏi lại (mo_ho) — **4 câu**

- x-033 "vat tu da chua ve con bn" → đã hỏi lại ("da" = Da hay đã) — đúng hành vi; sau khi mở "bn" vẫn hỏi lại. kv nên chấp nhận `hoi_lai` (hoặc đổi câu thành có dấu).
- pm-046 "vat tu go cua CT26-110 dang mua" → hỏi lại "go" (Gỗ / gõ) — đúng hành vi cho câu không dấu; kv chấp nhận hỏi lại.
- gd-006 "khách hàng nào lớn nhất năm nay" → bộ đọc chọn SX (trị giá đơn hàng + còn lại theo khách hàng), kv chọn nhập kho (doanh thu). "lớn nhất" theo đơn hàng hay theo nhập kho là hai nghĩa thật → nên hỏi lại (thêm vào `moHo` khi câu chỉ có "khách hàng/công trình nào lớn nhất" không nói chỉ số), hoặc kv ghi rõ "nhập kho nhiều nhất".
- x-011 "xuong 4A dang ket gi" → kv vướng mắc chưa xử lý của 4A; bộ đọc chọn SX (chưa hiểu "ket"). "kẹt gì" = vướng mắc hay hàng nghẽn ở công đoạn → hỏi lại (2 lựa chọn: vướng mắc 4A / điểm nghẽn 4A).

---

## 13. `parser-sua-chinh-ta` — sửa chính tả lượt 2 đổi chữ thật thành tên người (parser) — **3 câu**

- gd-041 "tháng 10 xuất cho khách bao nhiêu, theo khách hàng" → "khách" (chưa hiểu vì "khách hàng" là cột nhưng "khách" lẻ không) bị lượt 2 sửa thành PC "KHÁNH" ở MỌI chỗ → mất luôn "theo khách hàng" (chia []). Cùng: kk-056 "giá trị đơn hàng của khách CAPITALAND còn chưa nhập kho", x-049 "các hạng mục của 4A đang ở vecni cho khách sun group" (thêm lọc ten_pc = KHÁNH).
- Sửa `hieuTruyVan` (lượt 2 của suaChinhTa): không thay chữ thành giá trị của cột người (COT_NGUOI) / tên riêng; không thay chữ đang nằm trong cụm đã hiểu ("khách hàng"); thay theo vị trí (chỉ chữ chưa hiểu), không `replace` toàn câu. Thêm "khach" vào TU_DEM ("cho khách" = xuất kho).

---

## 14. `parser-ton-kho-xuong` — xưởng ở bảng tồn kho bị bỏ (boQua) rồi đi mẫu tồn kho (parser) — **3 câu**

- kk-035 "gia tri ton kho hien tai cua xuong 2A", kmh-011 "ad ơi cho e hỏi tồn kho 3A hiện giờ", x-036 "hang ton cua 4A hon 3 thang" → `cotXuong = b.cot.find(kieu === 'xuong')` không có ở ton_kho → boQua "không có cột xưởng" → `mauLamDuoc` vẫn true (không xét boQua) → mẫu tồn kho toàn nhà máy.
- Sửa docCau bước 4: tìm cột xưởng trong `cotDu` (cotMoRong → `sx:xuong_chinh`) thay vì `b.cot`; `mauLamDuoc` trả false khi `h.boQua.length`. (x-036 kv còn `kieu: dong` cho câu danh từ — bo-cau bỏ.)

---

## 15. `ngoai-du-lieu` — câu ngoài dữ liệu mà trả lời tự tin (ngoai_du_lieu) — **1 câu**

- gd-092 "dự báo tháng 11 có đạt kế hoạch không" → tự tra khsx tháng 11 (tổng kế hoạch) không còn chữ chưa hiểu: "bao" ∈ TU_DEM, "du" bị coi là chữ của tên bảng (chuBang khsx có "dữ liệu kế hoạch").
- Sửa: thêm luật kiểu RE_TAI_SAO cho "dự báo / dự đoán / dự kiến đạt / liệu … có … không / có kịp không / có đạt … không" → báo không trả lời được (số liệu không dự báo); `chuBang` không nuốt chữ không nằm trong cụm tên bảng thực sự khớp trong câu.

---

## Ghi chú chung cho agent bo-cau (ngoài cụm kv-sai)
- Quy ước kiểu: câu danh từ không có "liệt kê / danh sách / những … nào / … nào" → `kieu: tong` (bỏ `kieu: dong` ở nhiều câu xuong.json).
- Giá trị "chưa triển khai": bộ câu chính dùng `tinh_trang = "15. CHƯA TRIỂN KHAI"`; raSoat dùng `tinh_trang_trien_khai_ban_ve = "CHƯA TRIỂN KHAI"` → thống nhất (hoặc chamDiem chấp nhận cả hai).
- Hỏi lại (x-033, pm-046) với câu không dấu là hành vi đúng → kv nên có cách ghi chấp nhận `hoi_lai`.
- Sau khi parser mở viết tắt, nên thêm vào mauCau.ts các mẫu hồi quy: viết tắt (bn/hm/ko/sl/tg), "kế hoạch tháng N / tuần N (của xưởng)", "A so với B (xưởng)", "cái nào quá hạn" sau vướng mắc, "chỉ lấy … / … thôi" nối tiếp, "<cột ngày> + kỳ" ở vật tư, "quá hạn BOT".
