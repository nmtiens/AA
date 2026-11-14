-- BOT THEO CÔNG ĐOẠN — các bộ phận nhập ngày BOT (hạn phải xong) cho từng HEX × công đoạn (P001 … P025).
-- App: Tổng quan công trình → tab "BOT công đoạn" (GET / POST /api/bot-cong-doan, setup: /api/bot-cong-doan/setup).
-- Quyền: ADMIN nhập mọi ô; người dùng khác chỉ nhập công đoạn được gán cho bộ phận (users.department) của mình trong setup,
--   bộ phận có gán xưởng thì chỉ nhập HEX thuộc các xưởng đó. Mọi lần sửa ghi vào bot_cong_doan_lich_su.
-- Chạy 1 lần trên DB (người dùng cho phép). Chạy lại không sao (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS bot_cong_doan (
  hex        text NOT NULL,
  cong_doan  text NOT NULL,              -- P001, P002, P012, P013, GCVT, P014, P016, P018, P020, P021, P022, P025
  ngay       date NOT NULL,              -- ngày BOT
  nguoi_sua  text,                       -- username lần sửa gần nhất
  sua_luc    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hex, cong_doan)
);

CREATE TABLE IF NOT EXISTS bot_cong_doan_lich_su (
  id         bigserial PRIMARY KEY,
  hex        text NOT NULL,
  cong_doan  text NOT NULL,
  ngay_cu    date,                       -- NULL = trước đó chưa có
  ngay_moi   date,                       -- NULL = xoá
  nguoi      text,
  bo_phan    text,
  luc        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bot_cong_doan_lich_su_hex ON bot_cong_doan_lich_su (hex, cong_doan, luc DESC);

-- Setup phân công (1 dòng, khoa = 'phan-cong'):
--   { "congDoan": { "P001": ["PM"], "P002": ["PC"], ... },   -- bộ phận được nhập từng công đoạn
--     "xuongCua": { "XƯỞNG 5 SOFA & GHẾ": ["5A"], ... } }      -- bộ phận chỉ nhập HEX thuộc các xưởng này (trống = mọi xưởng)
CREATE TABLE IF NOT EXISTS bot_cong_doan_setup (
  khoa       text PRIMARY KEY,
  gia_tri    jsonb NOT NULL,
  nguoi_sua  text,
  sua_luc    timestamptz NOT NULL DEFAULT now()
);

-- 13/11/2026: mỗi HEX × công đoạn có 2 ngày BOT — đợt đầu (xong lô đầu) và đợt cuối (xong hết). Cột dot: 'dau' | 'cuoi'.
ALTER TABLE bot_cong_doan ADD COLUMN IF NOT EXISTS dot text NOT NULL DEFAULT 'cuoi';
ALTER TABLE bot_cong_doan DROP CONSTRAINT IF EXISTS bot_cong_doan_pkey;
ALTER TABLE bot_cong_doan ADD CONSTRAINT bot_cong_doan_pkey PRIMARY KEY (hex, cong_doan, dot);
ALTER TABLE bot_cong_doan_lich_su ADD COLUMN IF NOT EXISTS dot text NOT NULL DEFAULT 'cuoi';
