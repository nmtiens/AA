import { gzip as gzipCb, gunzip as gunzipCb, brotliCompress as brCb, constants as Z } from 'zlib';
import { promisify } from 'util';
import { getTablesData } from './data.js';
import { stripMaterialPriceColumns } from './permissions.js';
import { docSnapshot, luuSnapshot } from './snapshot.js';
import { pool } from '../db.js';

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

// Mảnh (đã nén) của từng bảng mà instance này vừa đọc / vừa dựng — để dungGoi biết mảnh nào CÒN THIẾU và đọc gộp
// các mảnh thiếu trong 1 câu (trước: mỗi bảng 1 truy vấn nối tiếp). An toàn: khoá gồm bảng + cờ giá + định dạng,
// chỉ dùng khi ver trùng đúng phiên bản bảng đang hỏi (như snapshotNho); buffer dùng chung tham chiếu với
// snapshotNho nên không tốn thêm bộ nhớ đáng kể.
const MANH_NHO_MAX = 24;
const manhNho = new Map<string, { ver: string; buf: Buffer }>();
const nhoManh = (khoa: string, ver: string, buf: Buffer) => {
  manhNho.delete(khoa);
  manhNho.set(khoa, { ver, buf });
  while (manhNho.size > MANH_NHO_MAX) {
    const cu = manhNho.keys().next().value;
    if (cu === undefined) break;
    manhNho.delete(cu);
  }
};

export type ManhCan = { khoa: string; ver: string };
/** Các mảnh chưa có trong bộ nhớ đúng phiên bản (bỏ khoá trùng) — hàm thuần, có test */
export function manhThieu<T extends ManhCan>(can: T[], verDaCo: (khoa: string) => string | undefined): T[] {
  const thay = new Set<string>();
  return can.filter(m => {
    if (thay.has(m.khoa) || verDaCo(m.khoa) === m.ver) return false;
    thay.add(m.khoa);
    return true;
  });
}

/** Đọc 1 câu mọi mảnh thiếu, so luôn ver trong câu (không kéo bản cũ vài MB về rồi bỏ). Lỗi / chưa có bảng =>
 *  trả rỗng, từng mảnh rơi về manhBang như cũ. Trả các khoá vừa đọc được. */
async function docNhieuManh(thieu: ManhCan[]): Promise<Set<string>> {
  const co = new Set<string>();
  try {
    const r = await pool.query(
      `SELECT s.khoa, s.du_lieu FROM all_data_snapshot s
       JOIN unnest($1::text[], $2::text[]) AS w(khoa, ver) ON s.khoa = w.khoa AND s.ver = w.ver`,
      [thieu.map(m => m.khoa), thieu.map(m => m.ver)]);
    const verCua = new Map(thieu.map(m => [m.khoa, m.ver]));
    for (const row of r.rows) {
      const khoa = String(row.khoa);
      const ver = verCua.get(khoa);
      if (ver === undefined || !row.du_lieu) continue;
      nhoManh(khoa, ver, row.du_lieu as Buffer);
      co.add(khoa);
    }
  } catch (e) {
    // Từng mảnh rơi về manhBang (docSnapshot tự tắt khi thiếu bảng). Lỗi khác (quá hạn, DB bận) phải thấy trong log
    if ((e as { code?: string })?.code !== '42P01') console.error('[all-data] đọc gộp mảnh lỗi', e);
  }
  return co;
}

/** Dữ liệu 1 bảng dạng chuỗi JSON (mảng dòng, hoặc {c,r} khi cot) — lấy bản dựng sẵn hoặc đọc DB rồi lưu lại.
 *  nguon: 'mem' | 'db' | 'dung' */
export async function manhBang(key: string, gia: boolean, verGoc: unknown, nguon?: { v: string }, cot = false): Promise<string> {
  const khoa = khoaBang(key, gia, cot);
  const ver = verBang(verGoc);
  const n = { v: '' };
  const buf = await docSnapshot(khoa, ver, n);
  if (buf) {
    nhoManh(khoa, ver, buf);
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
      const gz = await gzip(json);
      nhoManh(khoa, ver, gz);
      // Vẫn CHỜ ghi xong (lamNong dựa vào đó để nơi khác thấy bản đã dựng; ghi nền ở đây sẽ chiếm cả 2 kết nối pool)
      await luuSnapshot(khoa, ver, gz);
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
  const can = keys.map(key => ({ key, khoa: khoaBang(key, gia, cot), ver: verBang(versions[key]) }));
  // Từ 2 mảnh thiếu trở lên: đọc gộp 1 câu (bản NÉN, tổng dung lượng bằng các lượt đọc riêng trước đây)
  const thieu = manhThieu(can, k => manhNho.get(k)?.ver);
  const vuaDoc = thieu.length >= 2 ? await docNhieuManh(thieu) : new Set<string>();
  // Giải nén / dựng lần lượt (không dồn nhiều bảng lớn đã giải nén vào bộ nhớ / DB cùng lúc)
  for (const m of can) {
    const nho = manhNho.get(m.khoa);
    if (nho && nho.ver === m.ver) {
      manh.push(`${JSON.stringify(m.key)}:${(await gunzip(nho.buf)).toString('utf8')}`);
      nguon.push(`${m.key}=${vuaDoc.has(m.khoa) ? 'db' : 'mem'}`);
      continue;
    }
    const n = { v: '' };
    manh.push(`${JSON.stringify(m.key)}:${await manhBang(m.key, gia, versions[m.key], n, cot)}`);
    nguon.push(`${m.key}=${n.v}`);
  }
  const json = `{${manh.join(',')}}`;
  return { buf: br ? await nenBr(json) : await gzip(json), nguon: nguon.join(' ') };
}
