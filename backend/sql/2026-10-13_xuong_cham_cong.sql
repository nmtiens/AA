-- ============================================================================
-- MỤC XƯỞNG — CHẤM CÔNG THEO NGƯỜI (docs/designs/xuong-cham-cong.md). Chạy SAU 2026-10-12_xuong.sql. Chạy lại an toàn.
--   1. Danh sách công nhân (xuong_cong_nhan): mã NV, họ tên, tổ hiện tại — nạp từ file nhân sự hoặc tổ trưởng tự thêm.
--   2. Sổ sự kiện nhận thêm 2 loại: vao_ca (điểm danh có mặt / đến trễ / mượn người tổ khác), ra_ca (về sớm, vắng).
-- Chưa chạy file này: app vẫn chạy như cũ (chốt quân số bằng số), không hiện điểm danh.
-- ============================================================================

CREATE TABLE IF NOT EXISTS xuong_cong_nhan (
  mnv        text        PRIMARY KEY,               -- mã nhân viên (viết hoa, bỏ khoảng trắng), vd AAF7615
  ho_ten     text        NOT NULL,
  xuong      text,
  to_id      integer     REFERENCES xuong_to(id) ON DELETE SET NULL,  -- tổ hiện tại; NULL = chưa xếp tổ
  chuc_vu    text,
  active     boolean     NOT NULL DEFAULT true,     -- false = nghỉ việc (giữ lại cho báo cáo cũ)
  nguon      text        NOT NULL DEFAULT 'app' CHECK (nguon IN ('app', 'file')),  -- tổ trưởng thêm / nạp file nhân sự
  tao_luc    timestamptz NOT NULL DEFAULT now(),
  cap_nhat   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_xuong_cong_nhan_to ON xuong_cong_nhan (to_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_xuong_cong_nhan_xuong ON xuong_cong_nhan (xuong) WHERE active;

-- Loại sự kiện mới: vao_ca, ra_ca
ALTER TABLE xuong_su_kien DROP CONSTRAINT IF EXISTS xuong_su_kien_loai_check;
ALTER TABLE xuong_su_kien ADD CONSTRAINT xuong_su_kien_loai_check CHECK (loai IN (
  'trien_khai','khai_bao_cd','nhan','bat_dau','tam_ngung','tiep_tuc','hoan_thanh','giao',
  'tang_ca','chia_nguoi','quan_so','xac_nhan_cuoi_ngay','tien_do','huy','vao_ca','ra_ca'));

-- Kiểm tra
SELECT count(*) AS so_cong_nhan FROM xuong_cong_nhan;
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'xuong_su_kien_loai_check';
