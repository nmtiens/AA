-- ============================================================================
-- APP VƯỚNG MẮC — QUY TRÌNH XỬ LÝ (2026-10-10). Chạy 1 lần trên PostgreSQL (an toàn khi chạy lại).
--
-- Trạng thái vướng mắc (cột status):
--   open   : Mới báo, chưa ai nhận
--   doing  : Người xử lý đã nhận, đang xử lý
--   done   : Người xử lý báo đã xử lý xong — chờ người báo (hoặc cùng phòng ban / Admin) xác nhận
--   closed : Người báo xác nhận, đóng vướng mắc
-- is_resolved vẫn giữ (= status IN ('done','closed')) để các màn hình cũ không hỏng.
--
-- CHƯA chạy file này: app vẫn chạy với 2 trạng thái cũ (tồn đọng / đã xử lý); các thao tác
-- "Nhận xử lý", "Xác nhận đóng", ưu tiên, leo thang sẽ báo "chưa chạy SQL".
-- ============================================================================

ALTER TABLE vuong_mac
  ADD COLUMN IF NOT EXISTS status        text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS priority      text NOT NULL DEFAULT 'normal',   -- normal | high | urgent
  ADD COLUMN IF NOT EXISTS stage         text,                             -- công đoạn (BOP) lúc báo, vd P013
  ADD COLUMN IF NOT EXISTS xuong         text,                             -- khu vực SX (đã gộp) lúc báo
  ADD COLUMN IF NOT EXISTS ten_cong_trinh text,
  ADD COLUMN IF NOT EXISTS ma_cong_trinh  text,
  ADD COLUMN IF NOT EXISTS ten_hang_muc   text,
  ADD COLUMN IF NOT EXISTS accepted_at   timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by   text,
  ADD COLUMN IF NOT EXISTS closed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by     text,
  ADD COLUMN IF NOT EXISTS escalated_at  timestamptz;                      -- đã báo quản lý vì quá hạn lâu

-- Dữ liệu cũ: đã xử lý => coi như đã đóng; chưa xử lý mà có người xử lý => đang xử lý
UPDATE vuong_mac SET status = 'closed', closed_at = COALESCE(resolved_at, updated_at), closed_by = resolved_by
 WHERE is_resolved AND status = 'open';
UPDATE vuong_mac SET status = 'doing', accepted_at = created_at, accepted_by = created_by
 WHERE NOT is_resolved AND status = 'open' AND COALESCE(TRIM(handler), '') <> '';

-- Bổ sung công đoạn / xưởng / công trình lúc báo cho dữ liệu cũ (lấy theo dòng sản xuất hiện tại)
UPDATE vuong_mac vm
   SET stage = COALESCE(vm.stage, SUBSTRING(UPPER(TRIM(p.bop)) FROM '^(P[0-9]{3}|GCVT)')),
       xuong = COALESCE(vm.xuong, UPPER(TRIM(p.xuong_chinh))),
       ten_cong_trinh = COALESCE(vm.ten_cong_trinh, p.ten_cong_trinh),
       ma_cong_trinh  = COALESCE(vm.ma_cong_trinh, p.ma_cong_trinh),
       ten_hang_muc   = COALESCE(vm.ten_hang_muc, p.ten_hang_muc)
  FROM (
    SELECT DISTINCT ON (hex::text) hex::text AS hex, bop, xuong_chinh, ten_cong_trinh, ma_cong_trinh, ten_hang_muc
    FROM production_status_app WHERE hex IS NOT NULL
    ORDER BY hex::text, updated_at DESC NULLS LAST, id DESC
  ) p
 WHERE p.hex = vm.hex AND (vm.stage IS NULL OR vm.xuong IS NULL OR vm.ten_cong_trinh IS NULL);

CREATE INDEX IF NOT EXISTS idx_vuong_mac_status_created ON vuong_mac (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vuong_mac_handler_open ON vuong_mac (LOWER(TRIM(handler))) WHERE is_resolved = false;
CREATE INDEX IF NOT EXISTS idx_vuong_mac_log_vm_id ON vuong_mac_log (vuong_mac_id, acted_at);

-- Nhật ký: thêm 2 loại thao tác mới (đổi trạng thái, bình luận). Ràng buộc cũ chỉ cho CREATE/UPDATE/DELETE.
ALTER TABLE vuong_mac_log DROP CONSTRAINT IF EXISTS vuong_mac_log_action_check;
ALTER TABLE vuong_mac_log ADD CONSTRAINT vuong_mac_log_action_check
  CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'STATUS', 'COMMENT'));
