import { gzip as gzipCb, gunzip as gunzipCb } from 'zlib';
import { promisify } from 'util';
import { getTablesData } from './data.js';
import { stripMaterialPriceColumns } from './permissions.js';
import { docSnapshot, luuSnapshot } from './snapshot.js';

// ============================================================================
// BẢN DỰNG SẴN THEO TỪNG BẢNG cho /api/all-data.
// Trước: bản nén lưu theo ĐÚNG bộ bảng client xin (khoá "production,tkbv|1"). Sau mỗi lần ETL, bộ bảng đổi phiên bản
// mỗi lúc một khác (client chỉ xin bảng vừa đổi, gom nhóm theo dung lượng) => gần như lần nào cũng trượt, người đầu
// tiên phải chờ đọc DB + nén lại 9–12 giây (đo 14/10/2026). Nay lưu thêm mỗi BẢNG một bản (khoá "bang:<bảng>|<giá>",
// ver = phiên bản bảng đó): bộ bảng nào cũng ghép được từ các mảnh có sẵn (giải nén + nén lại vài trăm ms), và làm
// nóng được trước (danh sách bảng cố định) — xem server/lamNong.ts.
// ============================================================================
const gzip = promisify(gzipCb);
const gunzip = promisify(gunzipCb);

const khoaBang = (key: string, gia: boolean) => `bang:${key}|${key === 'material' && !gia ? 0 : 1}`;
/** Phiên bản bảng dạng chuỗi (table_versions.last_updated là timestamptz => pg trả Date; so sánh / lưu cần chuỗi) */
export const verBang = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v ?? ''));

const manhDang = new Map<string, Promise<string>>();

/** Mảng dòng của 1 bảng dạng chuỗi JSON — lấy bản dựng sẵn hoặc đọc DB rồi lưu lại. nguon: 'mem' | 'db' | 'dung' */
export async function manhBang(key: string, gia: boolean, verGoc: unknown, nguon?: { v: string }): Promise<string> {
  const khoa = khoaBang(key, gia);
  const ver = verBang(verGoc);
  const n = { v: '' };
  const buf = await docSnapshot(khoa, ver, n);
  if (buf) {
    if (nguon) nguon.v = n.v;
    return (await gunzip(buf)).toString('utf8');
  }
  const k = `${khoa}|${ver}`;
  let p = manhDang.get(k);
  if (!p) {
    p = (async () => {
      const { payload } = await getTablesData([key]);
      const rows = payload[key] ?? [];
      const json = JSON.stringify(key === 'material' && !gia ? stripMaterialPriceColumns(rows) : rows);
      await luuSnapshot(khoa, ver, await gzip(json));
      return json;
    })().finally(() => manhDang.delete(k));
    manhDang.set(k, p);
  }
  if (nguon) nguon.v = 'dung';
  return p;
}

/** Gói gzip {bảng: [...]} cho bộ bảng `keys`, ghép từ các mảnh từng bảng. Trả kèm nguồn từng mảnh (Server-Timing). */
export async function dungGoi(keys: string[], gia: boolean, versions: Record<string, string>): Promise<{ buf: Buffer; nguon: string }> {
  const nguon: string[] = [];
  const manh: string[] = [];
  // Lần lượt (không dồn nhiều bảng lớn vào bộ nhớ / DB cùng lúc)
  for (const key of keys) {
    const n = { v: '' };
    manh.push(`${JSON.stringify(key)}:${await manhBang(key, gia, versions[key], n)}`);
    nguon.push(`${key}=${n.v}`);
  }
  return { buf: await gzip(`{${manh.join(',')}}`), nguon: nguon.join(' ') };
}
