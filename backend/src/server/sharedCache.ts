import { timedQuery } from '../db.js';

// ============================================================================
// CACHE DÙNG CHUNG MỌI INSTANCE (bảng api_result_cache, xem sql/2026-10-12_api_result_cache.sql)
// Cache trong bộ nhớ mất khi Vercel mở instance mới => truy vấn nặng (danh sách ô lọc quét DISTINCT 7 bảng lớn,
// bảng tên công trình nối 8 bảng qua HEX ~28 giây) chạy lại ở mỗi instance. Lưu kết quả vào DB kèm phiên bản dữ
// liệu: instance khác đọc lại 1 dòng nhỏ, chỉ tính lại khi ETL đổi dữ liệu. Chưa tạo bảng / DB lỗi => bỏ qua.
// CHỈ dùng cho kết quả không phụ thuộc người dùng.
// ============================================================================
let sharedCacheDisabled = false; // bảng chưa tạo: thôi thử trong instance này
// Đổi khi công thức tính đổi: bản lưu của code cũ không bị đọc nhầm, 2 bản chạy song song không ghi đè nhau
const PHIEN_BAN_TINH = 'r3';
const khoaChung = (key: string) => `${PHIEN_BAN_TINH}:${key}`;
const isMissingTable = (e: unknown) => (e as { code?: string })?.code === '42P01';

/**
 * Việc chạy NỀN sau khi đã trả lời: đăng ký với Vercel (cùng cơ chế waitUntil của @vercel/functions, như
 * server/lamNong.ts) để instance không bị đóng băng giữa truy vấn / giao dịch. Trả true nếu đã đăng ký.
 * Chạy ở máy (không có ngữ cảnh Vercel) => false, promise vẫn tự chạy tới xong vì tiến trình không bị đóng băng.
 */
export const giuHamSong = (p: Promise<unknown>): boolean => {
  try {
    const ctx = (globalThis as Record<symbol, { get?: () => { waitUntil?: (p: Promise<unknown>) => void } | undefined } | undefined>)[
      Symbol.for('@vercel/request-context')]?.get?.();
    if (typeof ctx?.waitUntil !== 'function') return false;
    ctx.waitUntil(p);
    return true;
  } catch {
    return false;
  }
};

const sqlChuoi = (s: string) => `'${s.replace(/'/g, "''")}'`;
/** Chuỗi phiên bản của 1 nhóm bảng (tên bảng là hằng trong code, không lấy từ request) */
const sqlPhienBanBang = (tables: string[]) =>
  `SELECT STRING_AGG(table_name || ':' || last_updated::text, ',' ORDER BY table_name) AS v FROM table_versions
   WHERE table_name IN (${tables.map(sqlChuoi).join(', ')})`;
/** Câu gộp: phiên bản nhóm bảng + bản lưu chung khớp đúng phiên bản đó (không tham số => db.ts gửi 1 lượt đi-về) */
export const sqlDocChungTheoBang = (key: string, tables: string[]) =>
  `WITH v AS (${sqlPhienBanBang(tables)})
   SELECT v.v, c.data FROM v LEFT JOIN api_result_cache c ON c.cache_key = ${sqlChuoi(khoaChung(key))} AND c.versions = v.v`;

/**
 * Đọc trong 1 câu: chuỗi phiên bản của `tables` (table_versions) và bản lưu chung của `key` nếu khớp phiên bản đó.
 * Trước là 2 câu nối tiếp. Câu gộp lỗi => rơi về câu chỉ đọc phiên bản: câu này lỗi thì ném ra (như câu đọc phiên
 * bản trước đây), được thì coi như không có bản lưu (như readShared cũ nuốt lỗi đọc bản lưu => nơi gọi tự tính lại,
 * không kẹt vì riêng bảng api_result_cache trục trặc). Chưa có bảng api_result_cache (42P01) => thôi dùng bản chung.
 * `tables` phải là hằng trong code.
 */
export async function docChungTheoBang<T>(key: string, tables: string[]): Promise<{ versions: string; data: T | undefined }> {
  if (!sharedCacheDisabled) {
    try {
      const r = await timedQuery<{ v: string | null; data: T | null }>(sqlDocChungTheoBang(key, tables));
      return { versions: r.rows[0]?.v ?? '', data: r.rows[0]?.data ?? undefined };
    } catch (e) {
      // Lỗi có thể do table_versions / DB (câu dưới ném lại như cũ) hoặc do riêng api_result_cache (bỏ qua bản lưu)
      const v = await timedQuery<{ v: string | null }>(sqlPhienBanBang(tables));
      if (isMissingTable(e)) sharedCacheDisabled = true;
      return { versions: v.rows[0]?.v ?? '', data: undefined };
    }
  }
  const v = await timedQuery<{ v: string | null }>(sqlPhienBanBang(tables));
  return { versions: v.rows[0]?.v ?? '', data: undefined };
}

export async function readShared<T>(key: string, versions: string): Promise<T | undefined> {
  if (sharedCacheDisabled) return undefined;
  try {
    const r = await timedQuery<{ data: T }>(
      'SELECT data FROM api_result_cache WHERE cache_key = $1 AND versions = $2', [khoaChung(key), versions]);
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
      [khoaChung(key), versions, JSON.stringify(data)]);
  } catch (e) {
    if (isMissingTable(e)) sharedCacheDisabled = true;
  }
}
