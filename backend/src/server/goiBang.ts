import { gzip as gzipCb, gunzip as gunzipCb, brotliCompress as brCb, constants as Z } from 'zlib';
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
//
// ĐỊNH DẠNG CỘT (?fmt=cot, khoá "bangc:"): mỗi bảng {"c":[tên cột],"r":[[giá trị theo thứ tự cột], ...]} thay vì mảng
// object lặp lại tên cột ở MỌI dòng (sản xuất 52 nghìn dòng × 34 cột: phần lớn ~59 MB JSON là tên cột). Trình duyệt
// đổi ngược lại thành mảng dòng (services/dataService.ts — giaiCot) nên phần còn lại không đổi.
// ============================================================================
const gzip = promisify(gzipCb);
const gunzip = promisify(gunzipCb);
const brotli = promisify(brCb);
// Brotli mức 5: nhỏ hơn gzip ~19% (đo 10/2026, gói sản xuất + TKBV định dạng cột 2.59 -> 2.09 MB), thời gian nén ngang gzip
const nenBr = (s: string) => brotli(s, { params: { [Z.BROTLI_PARAM_QUALITY]: 5, [Z.BROTLI_PARAM_SIZE_HINT]: Buffer.byteLength(s) } });

const khoaBang = (key: string, gia: boolean, cot: boolean) => `${cot ? 'bangc' : 'bang'}:${key}|${key === 'material' && !gia ? 0 : 1}`;
/** Phiên bản bảng dạng chuỗi (table_versions.last_updated là timestamptz => pg trả Date; so sánh / lưu cần chuỗi) */
export const verBang = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v ?? ''));

/** Mảng dòng -> {c, r}: cột = hợp mọi khoá theo thứ tự gặp; dòng thiếu cột => null */
export function sangCot(rows: Record<string, unknown>[]): { c: string[]; r: unknown[][] } {
  const idx = new Map<string, number>();
  for (const row of rows) for (const k of Object.keys(row)) if (!idx.has(k)) idx.set(k, idx.size);
  const c = [...idx.keys()];
  return { c, r: rows.map(row => c.map(k => (row[k] === undefined ? null : row[k]))) };
}

/** {c, r} -> mảng dòng (máy chủ đọc lại mảnh định dạng cột, vd Tổng quan) */
export function tuCot(v: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(v)) return v as Record<string, unknown>[];
  const o = v as { c?: string[]; r?: unknown[][] } | null;
  if (!o || !Array.isArray(o.c) || !Array.isArray(o.r)) return null;
  const c = o.c;
  return o.r.map(a => { const row: Record<string, unknown> = {}; for (let i = 0; i < c.length; i++) row[c[i]] = a[i]; return row; });
}

const manhDang = new Map<string, Promise<string>>();

/** Dữ liệu 1 bảng dạng chuỗi JSON (mảng dòng, hoặc {c,r} khi cot) — lấy bản dựng sẵn hoặc đọc DB rồi lưu lại.
 *  nguon: 'mem' | 'db' | 'dung' */
export async function manhBang(key: string, gia: boolean, verGoc: unknown, nguon?: { v: string }, cot = false): Promise<string> {
  const khoa = khoaBang(key, gia, cot);
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
      const goc = payload[key] ?? [];
      const rows = key === 'material' && !gia ? stripMaterialPriceColumns(goc) : goc;
      const json = JSON.stringify(cot ? sangCot(rows as Record<string, unknown>[]) : rows);
      await luuSnapshot(khoa, ver, await gzip(json));
      return json;
    })().finally(() => manhDang.delete(k));
    manhDang.set(k, p);
  }
  if (nguon) nguon.v = 'dung';
  return p;
}

/** Gói nén {bảng: ...} cho bộ bảng `keys` (gzip, hoặc brotli khi br), ghép từ các mảnh từng bảng. Trả kèm nguồn từng
 *  mảnh (Server-Timing). */
export async function dungGoi(keys: string[], gia: boolean, versions: Record<string, string>, cot = false, br = false): Promise<{ buf: Buffer; nguon: string }> {
  const nguon: string[] = [];
  const manh: string[] = [];
  // Lần lượt (không dồn nhiều bảng lớn vào bộ nhớ / DB cùng lúc)
  for (const key of keys) {
    const n = { v: '' };
    manh.push(`${JSON.stringify(key)}:${await manhBang(key, gia, versions[key], n, cot)}`);
    nguon.push(`${key}=${n.v}`);
  }
  const json = `{${manh.join(',')}}`;
  return { buf: br ? await nenBr(json) : await gzip(json), nguon: nguon.join(' ') };
}
