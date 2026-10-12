import { createHash } from 'crypto';
import { getRelevantVersions } from './data.js';
import { projectAliasesVersion } from './projectAlias.js';
import { timedQuery } from '../db.js';

// ============================================================================
// CACHE KẾT QUẢ API THEO PHIÊN BẢN BẢNG (table_versions)
// Mọi API chỉ đọc (trend, filters, revenue, by-hex…) tính lại khá nặng nhưng dữ liệu chỉ đổi khi ETL
// chạy (vài lần / ngày). Cache theo khoá = tham số request, hợp lệ khi phiên bản các bảng liên quan
// không đổi. Nhiều request giống nhau tới cùng lúc (mở trang, nhiều tab) chỉ tính 1 lần (inflight).
// Lưu ý serverless: cache chỉ sống trong 1 instance (giống các cache in-memory khác của dự án).
// ============================================================================

interface Entry<T> { vkey: string; payload: T }

export interface VersionedCache<T> {
  max: number;
  map: Map<string, Entry<T>>;
  inflight: Map<string, Promise<T>>;
}

export const createCache = <T = unknown>(max = 50): VersionedCache<T> => ({ max, map: new Map(), inflight: new Map() });

// ----------------------------------------------------------------------------
// CACHE DÙNG CHUNG MỌI INSTANCE (bảng api_result_cache, xem sql/2026-10-12_api_result_cache.sql)
// Cache trong bộ nhớ mất khi Vercel mở instance mới => truy vấn nặng (vd. danh sách ô lọc quét DISTINCT 7 bảng lớn,
// 5–9 giây) chạy lại ở mỗi instance. Lưu kết quả vào DB kèm phiên bản dữ liệu: instance khác đọc lại 1 dòng nhỏ,
// chỉ tính lại khi ETL đổi dữ liệu. Chưa tạo bảng / DB lỗi => bỏ qua, tính như cũ.
// ----------------------------------------------------------------------------
let sharedCacheDisabled = false; // bảng chưa tạo: thôi thử trong instance này
const isMissingTable = (e: unknown) => (e as { code?: string })?.code === '42P01';

async function readShared<T>(key: string, versions: string): Promise<T | undefined> {
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

async function writeShared(key: string, versions: string, data: unknown): Promise<void> {
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

/**
 * Trả kết quả đã cache nếu phiên bản các bảng `versionKeys` (+ `extraVersion`, vd. setup gộp xưởng)
 * không đổi; ngược lại gọi `compute` rồi lưu lại. Entry cũ nhất bị bỏ khi vượt `max`.
 * `shared` = true: thêm tầng cache trong DB dùng chung mọi instance — CHỈ cho kết quả không phụ thuộc người dùng
 * và bảng tên công trình (khoá dùng chung không gồm projectAliasesVersion vì instance mới chưa nạp bảng tên).
 */
export async function cachedByVersions<T>(
  cache: VersionedCache<T>,
  key: string,
  versionKeys: string[],
  compute: () => Promise<T>,
  extraVersion = '',
  shared = false,
): Promise<T> {
  const versions = await getRelevantVersions(versionKeys);
  // Gắn cả phiên bản bảng tên công trình: các API gộp / mở rộng tên công trình phải tính lại khi bảng tên đổi
  const vkey = `${JSON.stringify(versions)}|${extraVersion}|${projectAliasesVersion()}`;
  const hit = cache.map.get(key);
  if (hit && hit.vkey === vkey) return hit.payload;

  const flightKey = `${key}|${vkey}`;
  const pending = cache.inflight.get(flightKey);
  if (pending) return pending;

  const p = (async () => {
    try {
      const sharedVersions = `${JSON.stringify(versions)}|${extraVersion}`;
      let payload = shared ? await readShared<T>(key, sharedVersions) : undefined;
      if (payload === undefined) {
        payload = await compute();
        if (shared) await writeShared(key, sharedVersions, payload);
      }
      cache.map.delete(key); // Map giữ thứ tự chèn: xoá rồi chèn lại để entry vừa dùng nằm cuối
      cache.map.set(key, { vkey, payload });
      while (cache.map.size > cache.max) {
        const oldest = cache.map.keys().next().value;
        if (oldest === undefined) break;
        cache.map.delete(oldest);
      }
      return payload;
    } finally {
      cache.inflight.delete(flightKey);
    }
  })();
  cache.inflight.set(flightKey, p);
  return p;
}

/** Khoá cache ngắn cho tham số lớn (vd. danh sách hàng chục nghìn HEX). */
export const hashKey = (value: unknown): string =>
  createHash('sha1').update(JSON.stringify(value)).digest('hex');

/** Khoá cache từ các tham số query (chỉ lấy các tên được liệt kê). Giữ cả tham số có mặt nhưng rỗng
 * (vd. `ctWhitelist=` = "không công trình nào" khác hẳn với không gửi tham số). */
export const queryKey = (query: Record<string, unknown>, names: string[]): string => {
  const o: Record<string, string> = {};
  for (const n of names) {
    const v = query[n];
    if (v !== undefined && v !== null) o[n] = String(v);
  }
  return JSON.stringify(o);
};
