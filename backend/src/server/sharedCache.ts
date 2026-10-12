import { timedQuery } from '../db.js';

// ============================================================================
// CACHE DÙNG CHUNG MỌI INSTANCE (bảng api_result_cache, xem sql/2026-10-12_api_result_cache.sql)
// Cache trong bộ nhớ mất khi Vercel mở instance mới => truy vấn nặng (danh sách ô lọc quét DISTINCT 7 bảng lớn,
// bảng tên công trình nối 8 bảng qua HEX ~28 giây) chạy lại ở mỗi instance. Lưu kết quả vào DB kèm phiên bản dữ
// liệu: instance khác đọc lại 1 dòng nhỏ, chỉ tính lại khi ETL đổi dữ liệu. Chưa tạo bảng / DB lỗi => bỏ qua.
// CHỈ dùng cho kết quả không phụ thuộc người dùng.
// ============================================================================
let sharedCacheDisabled = false; // bảng chưa tạo: thôi thử trong instance này
const isMissingTable = (e: unknown) => (e as { code?: string })?.code === '42P01';

export async function readShared<T>(key: string, versions: string): Promise<T | undefined> {
  if (sharedCacheDisabled) return undefined;
  try {
    const r = await timedQuery<{ data: T }>(
      'SELECT data FROM api_result_cache WHERE cache_key = $1 AND versions = $2', [key, versions]);
    return r.rows[0]?.data;
  } catch (e) {
    if (isMissingTable(e)) sharedCacheDisabled = true;
    return undefined;
  }
}

export async function writeShared(key: string, versions: string, data: unknown): Promise<void> {
  if (sharedCacheDisabled) return;
  try {
    await timedQuery(
      `INSERT INTO api_result_cache (cache_key, versions, data, updated_at) VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (cache_key) DO UPDATE SET versions = EXCLUDED.versions, data = EXCLUDED.data, updated_at = NOW()`,
      [key, versions, JSON.stringify(data)]);
  } catch (e) {
    if (isMissingTable(e)) sharedCacheDisabled = true;
  }
}
