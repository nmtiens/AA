// ============================================================================
// ẢNH TIẾN ĐỘ MỤC XƯỞNG — lưu trong Postgres, bảng xuong_anh (quyết định D24, 2026-10-12: giống ảnh vướng mắc).
// Máy gửi từng ảnh (bytes WebP / JPEG đã nén) kèm id ảnh sinh trên máy => gửi lại không ghi trùng.
// Sự kiện tien_do mang du_lieu.anh = [id ảnh]. Xem ảnh qua GET /api/xuong/anh/:id (cần đăng nhập).
// Bảng tạo bằng backend/sql/2026-10-12_xuong_anh.sql — chưa chạy thì chức năng ảnh tắt.
// ============================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Khoá ảnh = id ảnh (uuid) */
export const khoaAnhHopLe = (k: unknown): k is string => typeof k === 'string' && UUID_RE.test(k);

/** Nhận diện kiểu ảnh theo byte đầu (không tin header máy gửi) */
export function kieuAnh(b: Buffer): 'image/webp' | 'image/jpeg' | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export const ANH_TOI_DA_BYTE = 1_000_000;
