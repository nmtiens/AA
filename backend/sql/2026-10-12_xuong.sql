-- ============================================================================
-- MODULE XƯỞNG — ĐỢT 1 (2026-10-12). Chạy 1 lần trên PostgreSQL (an toàn khi chạy lại).
-- Thiết kế: docs/designs/xuong-checkin.md (đã qua /plan-eng-review, quyết định R1–R14).
--
-- Sổ sự kiện chỉ ghi thêm (xuong_su_kien): mọi lần bấm của tổ trưởng là 1 dòng, không sửa / xoá.
-- Sửa sai = sự kiện loại 'huy' trỏ tới sự kiện gốc (sua_cho). Trạng thái hiện tại theo (hex, công đoạn)
-- tính lại trong transaction của API lô và lưu ở xuong_trang_thai (R3).
--
-- CHƯA chạy file này: các API /api/xuong/* trả { available: false }, phần còn lại của app không đổi.
-- Sau khi chạy: nạp danh mục công đoạn / tổ / thành viên tổ từ MRA (script trong C:\data mra) rồi
-- cấp quyền 'xuong' cho tổ trưởng, 'xuong_quan_ly' + dòng xuong_quan_ly cho quản lý xưởng.
-- ============================================================================

-- Thu hồi token Xưởng (R5): tăng token_version => mọi token Xưởng cũ của người đó hết hiệu lực
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;

-- Danh mục công đoạn chi tiết (nạp từ MRA config.cong_doan: 98 công đoạn / 9 xưởng)
CREATE TABLE IF NOT EXISTS xuong_cong_doan (
  id           text PRIMARY KEY,                 -- vd CD2400043 (giữ mã MRA)
  xuong        text NOT NULL,                    -- vd 4A
  ten_cd       text NOT NULL,                    -- công đoạn cấp xưởng, vd 4A-MÁY
  cd_tach_ma   text,                             -- công đoạn cấp thành phần / nhóm, vd 2.Máy tinh
  cd_chi_tiet  text NOT NULL,                    -- công đoạn chi tiết (định biên tổ), vd MÁY TINH GỖ 1
  thu_tu       integer NOT NULL DEFAULT 0,       -- thứ tự gợi ý trong tuyến
  la_bao_bi    boolean NOT NULL DEFAULT false,   -- công đoạn cuối (BAO BÌ)
  active       boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_xuong_cong_doan_xuong ON xuong_cong_doan (xuong) WHERE active;

-- Tổ: đơn vị quân số. Một tổ có thể làm nhiều công đoạn.
CREATE TABLE IF NOT EXISTS xuong_to (
  id                  serial PRIMARY KEY,
  xuong               text NOT NULL,
  ten_to              text NOT NULL,
  to_truong_user_id   integer REFERENCES users(id) ON DELETE SET NULL,
  active              boolean NOT NULL DEFAULT true,
  UNIQUE (xuong, ten_to)
);
CREATE TABLE IF NOT EXISTS xuong_to_cong_doan (
  to_id         integer NOT NULL REFERENCES xuong_to(id) ON DELETE CASCADE,
  cong_doan_id  text    NOT NULL REFERENCES xuong_cong_doan(id) ON DELETE CASCADE,
  PRIMARY KEY (to_id, cong_doan_id)
);
CREATE TABLE IF NOT EXISTS xuong_to_thanh_vien (
  to_id     integer NOT NULL REFERENCES xuong_to(id) ON DELETE CASCADE,
  mnv       text    NOT NULL,                    -- mã nhân viên AAF (khớp users.msnv / nhân sự)
  tu_ngay   date    NOT NULL DEFAULT CURRENT_DATE,
  den_ngay  date,
  PRIMARY KEY (to_id, mnv, tu_ngay)
);

-- Lịch ca theo xưởng; xuong = '*' là mặc định cho mọi xưởng. Giờ địa phương Asia/Ho_Chi_Minh.
-- nghi: [["11:30","12:30"]] — khoảng nghỉ trong ca (không tính giờ chạy / giờ công).
CREATE TABLE IF NOT EXISTS xuong_lich_ca (
  xuong         text NOT NULL,
  loai_ca       text NOT NULL,                   -- chinh | ca1 | ca2 | ca3 | ca4 | chu_nhat
  gio_bat_dau   time NOT NULL,
  gio_ket_thuc  time NOT NULL,                   -- qua đêm khi gio_ket_thuc <= gio_bat_dau
  nghi          jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (xuong, loai_ca)
);
-- Mặc định theo tài liệu hướng dẫn MRA 17/01/2025: hành chính 7h30–15h45; tăng ca bắt đầu 16h15.
-- Giờ nghỉ trưa CHƯA xác nhận (Open Question 9) => để trống, sửa ở thẻ Xưởng trong Setup dữ liệu.
INSERT INTO xuong_lich_ca (xuong, loai_ca, gio_bat_dau, gio_ket_thuc) VALUES
  ('*', 'chinh',    '07:30', '15:45'),
  ('*', 'ca1',      '16:15', '18:45'),
  ('*', 'ca2',      '16:15', '20:15'),
  ('*', 'ca3',      '16:15', '22:00'),
  ('*', 'ca4',      '16:15', '06:00'),
  ('*', 'chu_nhat', '07:30', '15:45')
ON CONFLICT (xuong, loai_ca) DO NOTHING;

-- Quản lý xưởng: được huỷ / đính chính mọi sự kiện của xưởng đó (R7), xem danh sách cần xem.
CREATE TABLE IF NOT EXISTS xuong_quan_ly (
  user_id  integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  xuong    text    NOT NULL,
  PRIMARY KEY (user_id, xuong)
);

-- Thiết bị đã đăng ký (R4): device_id do server cấp (ký HMAC). Một máy có thể có nhiều người đăng nhập.
CREATE TABLE IF NOT EXISTS xuong_phien_thiet_bi (
  device_id   uuid        NOT NULL,
  user_id     integer     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lan_dau     timestamptz NOT NULL DEFAULT now(),
  lan_cuoi    timestamptz NOT NULL DEFAULT now(),
  thu_hoi     boolean     NOT NULL DEFAULT false,
  PRIMARY KEY (device_id, user_id)
);

-- SỔ SỰ KIỆN (chỉ ghi thêm)
CREATE TABLE IF NOT EXISTS xuong_su_kien (
  id                    uuid        PRIMARY KEY,           -- sinh trên máy, chống ghi trùng khi gửi lại
  loai                  text        NOT NULL CHECK (loai IN (
                          'trien_khai','khai_bao_cd','nhan','bat_dau','tam_ngung','tiep_tuc','hoan_thanh','giao',
                          'tang_ca','chia_nguoi','quan_so','xac_nhan_cuoi_ngay','tien_do','huy')),
  hex                   text,                              -- 9 số; NULL với sự kiện cấp tổ (quan_so, tang_ca, …)
  cong_doan_id          text,
  to_id                 integer,
  xuong                 text,                              -- xưởng của công đoạn / tổ lúc ghi
  so_luong              numeric,
  cong_doan_den_id      text,                              -- giao: công đoạn nhận
  cong_doan_nguon_id    text,                              -- nhận từ xưởng chưa dùng app (R10)
  xuong_nguon           text,
  so_nguoi              integer,                           -- bat_dau / tiep_tuc: số người trên hạng mục
  ly_do_tam_ngung       text CHECK (ly_do_tam_ngung IS NULL OR ly_do_tam_ngung IN (
                          'thieu_vat_tu','cho_ban_ve_duyet','loi_chat_luong','chuyen_viec_gap','lenh_cap_tren','khac')),
  tien_do               integer CHECK (tien_do IS NULL OR tien_do BETWEEN 0 AND 100),
  ghi_chu               text,
  du_lieu               jsonb,                             -- chi tiết theo loại (chia người, quân số, tăng ca, xác nhận)
  device_ts             timestamptz NOT NULL,              -- giờ bấm trên máy
  lech_ms               bigint,                            -- lệch đồng hồ đo gần nhất trước lúc bấm (R8)
  device_ts_hieu_chinh  timestamptz NOT NULL,              -- = device_ts + lech_ms; dùng để sắp thứ tự / đo
  server_ts             timestamptz NOT NULL DEFAULT now(),
  user_id               integer,                           -- tác giả đã xác minh (R6)
  user_id_khai          integer,                           -- tác giả máy khai, khi không xác minh được (R6)
  sent_by               integer     NOT NULL,              -- người gửi lô (đã xác thực)
  device_id             uuid,
  sua_cho               uuid,                              -- huy: sự kiện bị huỷ
  nguon                 text        NOT NULL DEFAULT 'app' CHECK (nguon IN ('app','mra')),
  nguoi_thao_tac_goc    text,                              -- chỉ dữ liệu MRA
  co                    text[]      NOT NULL DEFAULT '{}'  -- cờ cần xem
);
CREATE INDEX IF NOT EXISTS idx_xuong_su_kien_hex_cd   ON xuong_su_kien (hex, cong_doan_id);
CREATE INDEX IF NOT EXISTS idx_xuong_su_kien_to_ts    ON xuong_su_kien (to_id, device_ts_hieu_chinh);
CREATE INDEX IF NOT EXISTS idx_xuong_su_kien_den      ON xuong_su_kien (cong_doan_den_id, hex) WHERE loai = 'giao';
CREATE INDEX IF NOT EXISTS idx_xuong_su_kien_sua_cho  ON xuong_su_kien (sua_cho) WHERE sua_cho IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_xuong_su_kien_co       ON xuong_su_kien (xuong, server_ts) WHERE co <> '{}';

-- TRẠNG THÁI HIỆN TẠI theo (hex, công đoạn) — tính lại trong transaction của API lô (R3)
CREATE TABLE IF NOT EXISTS xuong_trang_thai (
  hex                  text    NOT NULL,
  cong_doan_id         text    NOT NULL,
  xuong                text,
  trang_thai           text    NOT NULL,     -- cho_nhan | da_nhan | dang_lam | tam_ngung | cho_giao | xong
  sl_giao_den          numeric NOT NULL DEFAULT 0,
  sl_nhan              numeric NOT NULL DEFAULT 0,
  sl_hoan_thanh        numeric NOT NULL DEFAULT 0,
  sl_giao              numeric NOT NULL DEFAULT 0,
  so_nguoi             integer,
  dang_chay_tu         timestamptz,
  su_kien_cuoi         timestamptz,
  co                   text[]  NOT NULL DEFAULT '{}',
  cap_nhat             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hex, cong_doan_id)
);
CREATE INDEX IF NOT EXISTS idx_xuong_trang_thai_cd ON xuong_trang_thai (cong_doan_id, trang_thai);

-- Phiên bản sổ theo (tổ, ngày): tăng trong transaction lô; khoá cache giờ công phân bổ (R3)
CREATE TABLE IF NOT EXISTS xuong_phien_ban (
  to_id  integer NOT NULL,
  ngay   date    NOT NULL,
  v      bigint  NOT NULL DEFAULT 0,
  PRIMARY KEY (to_id, ngay)
);
