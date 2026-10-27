-- Nhật ký cửa sổ "Hỏi số liệu": câu người dùng hỏi + cách máy hiểu + đánh giá 👍/👎.
-- Dùng để biết tỷ lệ đúng THẬT và đem câu bị 👎 vào bộ câu mẫu (frontend/components/HoiDap/boCau) mỗi tuần.
-- Chưa chạy file này thì cửa sổ vẫn chạy bình thường (chỉ không ghi nhật ký, nút 👍/👎 không lưu).
-- Chạy 1 lần, chạy lại không sao.

CREATE TABLE IF NOT EXISTS hoi_dap_nhat_ky (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER,                    -- người hỏi
  cau         TEXT NOT NULL,              -- câu gõ
  truoc       TEXT,                       -- câu hỏi trước (ngữ cảnh)
  duong       TEXT NOT NULL,              -- mau | tu_tra | ai | hoi_lai | khong_hieu | bao_cao (xuất báo cáo)
  hieu        TEXT,                       -- dòng "Hiểu là …" / tên câu trả lời mẫu
  tv          JSONB,                      -- truy vấn đã chạy (tự tra / AI)
  danh_gia    SMALLINT,                   -- 1 = 👍, -1 = 👎, NULL = chưa đánh giá
  ghi_chu     TEXT,                       -- người dùng ghi "ý đúng là …" khi bấm 👎
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS hoi_dap_nhat_ky_created_idx ON hoi_dap_nhat_ky (created_at DESC);
CREATE INDEX IF NOT EXISTS hoi_dap_nhat_ky_danh_gia_idx ON hoi_dap_nhat_ky (danh_gia) WHERE danh_gia IS NOT NULL;
