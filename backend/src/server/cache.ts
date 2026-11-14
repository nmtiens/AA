import { createHash } from 'crypto';
import { getRelevantVersions } from './data.js';
import { projectAliasesVersion } from './projectAlias.js';
import { readShared, writeShared, giuHamSong } from './sharedCache.js';

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
 * `sharedKey`: thêm tầng cache trong DB dùng chung mọi instance (server/sharedCache.ts) với khoá này — CHỈ cho kết
 * quả không phụ thuộc người dùng và bảng tên công trình (phiên bản dùng chung không gồm projectAliasesVersion vì
 * instance mới chưa nạp bảng tên). Khoá do nơi gọi chọn (vd. chỉ đường dẫn API): không lấy từ tham số request
 * => tham số tuỳ ý không đẻ thêm dòng trong bảng cache.
 * `dungBangTen` (mặc định true = như cũ): false => KHÔNG đưa phiên bản bảng tên công trình vào khoá. CHỈ truyền false
 * khi compute không hề dùng bảng tên (expandProjectNames / canonicalProjectName / lọc congTrinh / ctWhitelist): kết quả
 * khi đó không phụ thuộc bảng tên nên giữ lại được lúc bảng tên vừa nạp xong ở nền (instance mới khỏi tính lại 1 lượt).
 */
export async function cachedByVersions<T>(
  cache: VersionedCache<T>,
  key: string,
  versionKeys: string[],
  compute: () => Promise<T>,
  extraVersion = '',
  sharedKey = '',
  dungBangTen = true,
): Promise<T> {
  const versions = await getRelevantVersions(versionKeys);
  // Gắn cả phiên bản bảng tên công trình: các API gộp / mở rộng tên công trình phải tính lại khi bảng tên đổi
  const vkey = khoaPhienBan(versions, extraVersion, dungBangTen ? projectAliasesVersion() : '');
  const hit = cache.map.get(key);
  if (hit && hit.vkey === vkey) return hit.payload;

  const flightKey = `${key}|${vkey}`;
  const pending = cache.inflight.get(flightKey);
  if (pending) return pending;

  const p = (async () => {
    try {
      const sharedVersions = `${JSON.stringify(versions)}|${extraVersion}`;
      let payload = sharedKey ? await readShared<T>(sharedKey, sharedVersions) : undefined;
      if (payload === undefined) {
        payload = await compute();
        if (sharedKey) {
          // Kết quả đã có: không bắt người dùng chờ ghi bản dùng chung (3 lượt đi-về + tải payload lên DB).
          // An toàn vì lệnh ghi được đăng ký waitUntil (Vercel giữ hàm sống tới khi ghi xong); trên Vercel mà
          // không đăng ký được thì CHỜ như cũ — không để lệnh ghi bị đóng băng giữa giao dịch.
          const ghi = writeShared(sharedKey, sharedVersions, payload);
          if (!giuHamSong(ghi) && process.env.VERCEL) await ghi;
        }
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

/** Khoá phiên bản của 1 entry: phiên bản các bảng | phiên bản phụ (vd. gộp xưởng) | phiên bản bảng tên ('' = không dùng) */
export const khoaPhienBan = (versions: Record<string, string>, extraVersion: string, bangTen: string): string =>
  `${JSON.stringify(versions)}|${extraVersion}|${bangTen}`;

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
