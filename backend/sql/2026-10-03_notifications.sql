-- ============================================================================
-- Hộp thông báo + cài đặt thông báo cho app (vướng mắc).
-- Chạy 1 lần trên PostgreSQL (an toàn khi chạy lại: dùng IF NOT EXISTS).
-- Chưa chạy thì app vẫn hoạt động, chỉ hộp thông báo / cài đặt thông báo tạm tắt.
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id            bigserial PRIMARY KEY,
  user_id       text        NOT NULL,          -- users.id dạng chữ (giống push_subscriptions.user_id)
  kind          text        NOT NULL,          -- mention | assigned | resolved | reopened | extend | due60 | due15 | overdue | new_in_dept
  title         text        NOT NULL,
  body          text,
  vuong_mac_id  bigint,                        -- không đặt khoá ngoại: vướng mắc bị xoá thì thông báo cũ vẫn giữ
  hex           text,
  actor         text,                          -- username người thao tác
  created_at    timestamptz NOT NULL DEFAULT now(),
  read_at       timestamptz
);

-- Danh sách theo người (mới nhất trước) và đếm chưa đọc
CREATE INDEX IF NOT EXISTS notifications_user_id_idx     ON notifications (user_id, id DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

-- Cài đặt bật/tắt từng loại thông báo của mỗi người (NULL = dùng mặc định)
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_prefs jsonb;

-- (Tuỳ chọn) dọn thông báo đã đọc quá 90 ngày — có thể chạy định kỳ:
-- DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < now() - interval '90 days';
