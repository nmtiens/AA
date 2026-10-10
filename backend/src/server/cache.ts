import { createHash } from 'crypto';
import { getRelevantVersions } from './data.js';
import { projectAliasesVersion } from './projectAlias.js';

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

/**
 * Trả kết quả đã cache nếu phiên bản các bảng `versionKeys` (+ `extraVersion`, vd. setup gộp xưởng)
 * không đổi; ngược lại gọi `compute` rồi lưu lại. Entry cũ nhất bị bỏ khi vượt `max`.
 */
export async function cachedByVersions<T>(
  cache: VersionedCache<T>,
  key: string,
  versionKeys: string[],
  compute: () => Promise<T>,
  extraVersion = '',
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
      const payload = await compute();
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
