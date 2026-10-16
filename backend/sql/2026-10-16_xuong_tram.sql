-- ============================================================================
-- MỤC XƯỞNG — TRẠM QUÉT THEO TỔ (docs/designs/xuong-tram-quet.md). Chạy SAU 2026-10-13_xuong_cham_cong.sql.
-- Chạy lại an toàn.
--   1. Sổ sự kiện nhận thêm 2 loại: nguoi_vao (công nhân quét thẻ + phiếu = vào làm hạng mục), nguoi_ra (ra khỏi hàng).
--   2. Chế độ chấm của tổ: 'cu' (bấm tay như nay) | 'song_song' (bấm tay là số chính thức, trạm chỉ để so khớp)
--      | 'tram' (trạm thay bấm tay). Đổi cờ có hiệu lực từ ngày ca kế tiếp — lịch sử ở xuong_to_che_do.
--   3. Thiết bị loại trạm: gắn một tổ + công đoạn mặc định, token riêng (phạm vi 'tram'), thu hồi riêng.
-- Chưa chạy file này: mọi tổ coi như chế độ 'cu', app chạy y như cũ; API trạm báo chưa bật.
-- ============================================================================

-- 1. Loại sự kiện mới
ALTER TABLE xuong_su_kien DROP CONSTRAINT IF EXISTS xuong_su_kien_loai_check;
ALTER TABLE xuong_su_kien ADD CONSTRAINT xuong_su_kien_loai_check CHECK (loai IN (
  'trien_khai','khai_bao_cd','nhan','bat_dau','tam_ngung','tiep_tuc','hoan_thanh','giao',
  'tang_ca','chia_nguoi','quan_so','xac_nhan_cuoi_ngay','tien_do','huy','vao_ca','ra_ca',
  'nguoi_vao','nguoi_ra'));

-- Dòng thời gian một người (người vào / ra hàng, ra ca từ trạm) — tính đoạn ở hàng theo mã NV
CREATE INDEX IF NOT EXISTS idx_xuong_su_kien_mnv ON xuong_su_kien ((du_lieu->>'mnv'), device_ts_hieu_chinh)
  WHERE loai IN ('nguoi_vao','nguoi_ra','ra_ca');

-- 2. Chế độ chấm của tổ
ALTER TABLE xuong_to ADD COLUMN IF NOT EXISTS che_do_cham text NOT NULL DEFAULT 'cu';
ALTER TABLE xuong_to DROP CONSTRAINT IF EXISTS xuong_to_che_do_cham_check;
ALTER TABLE xuong_to ADD CONSTRAINT xuong_to_che_do_cham_check CHECK (che_do_cham IN ('cu','song_song','tram'));

CREATE TABLE IF NOT EXISTS xuong_to_che_do (
  id         serial      PRIMARY KEY,
  to_id      integer     NOT NULL REFERENCES xuong_to(id) ON DELETE CASCADE,
  che_do     text        NOT NULL CHECK (che_do IN ('cu','song_song','tram')),
  tu_ngay    date        NOT NULL,                  -- ngày ca bắt đầu có hiệu lực (ngày ca = ngày bắt đầu ca)
  nguoi_doi  integer     REFERENCES users(id) ON DELETE SET NULL,
  luc        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_xuong_to_che_do_to ON xuong_to_che_do (to_id, tu_ngay);

-- 3. Thiết bị loại trạm
ALTER TABLE xuong_phien_thiet_bi ADD COLUMN IF NOT EXISTS loai text NOT NULL DEFAULT 'ca_nhan';
ALTER TABLE xuong_phien_thiet_bi DROP CONSTRAINT IF EXISTS xuong_phien_thiet_bi_loai_check;
ALTER TABLE xuong_phien_thiet_bi ADD CONSTRAINT xuong_phien_thiet_bi_loai_check CHECK (loai IN ('ca_nhan','tram'));
ALTER TABLE xuong_phien_thiet_bi ADD COLUMN IF NOT EXISTS to_id integer REFERENCES xuong_to(id) ON DELETE CASCADE;
ALTER TABLE xuong_phien_thiet_bi ADD COLUMN IF NOT EXISTS cong_doan text[] NOT NULL DEFAULT '{}';  -- công đoạn mặc định của trạm
ALTER TABLE xuong_phien_thiet_bi ADD COLUMN IF NOT EXISTS ten text;                               -- vd "Trạm 3A — cửa kho"
CREATE INDEX IF NOT EXISTS idx_xuong_phien_thiet_bi_tram ON xuong_phien_thiet_bi (to_id) WHERE loai = 'tram';

-- Kiểm tra
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'xuong_su_kien_loai_check';
SELECT che_do_cham, count(*) FROM xuong_to GROUP BY che_do_cham;
SELECT loai, count(*) FROM xuong_phien_thiet_bi GROUP BY loai;
