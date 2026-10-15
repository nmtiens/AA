import { pool } from '../db.js';
import { manhBang, verBang } from './goiBang.js';

// ============================================================================
// TỰ LÀM NÓNG SAU ETL (không cần cron ngoài).
// Trình duyệt đang mở web hỏi /api/check-versions vài giây một lần. Lần hỏi đầu tiên thấy phiên bản dữ liệu khác lần
// làm nóng gần nhất => sau khi đã trả lời, dựng sẵn ở NỀN (Vercel waitUntil): mảnh từng bảng của /api/all-data
// (server/goiBang.ts) + các bản dựng sẵn đăng ký thêm (màn đầu Tổng quan, Tổng quan công trình — routes/tongQuan.ts).
// Người mở web sau đó không phải chờ máy chủ đọc DB + nén lại (đo 14/10/2026: 9–12 giây mỗi gói bảng lớn, 10 giây
// màn đầu Tổng quan). Bản đã có thì bỏ qua (chỉ kiểm khoá + phiên bản).
// ============================================================================

/** Thứ tự bảng: nặng / hay dùng trước */
const BANG = ['production', 'inventory', 'material', 'order', 'export', 'pthsp', 'tkbv', 'khsx', 'analysis', 'stock', 'attendance', 'yearlyPlan'];

type Viec = { ten: string; chay: () => Promise<unknown> };
const viecThem: Viec[] = [];
/** Đăng ký thêm việc dựng sẵn (chạy sau các bảng) */
export const dangKyLamNong = (ten: string, chay: () => Promise<unknown>) => { viecThem.push({ ten, chay }); };

let daLamCho = '';
let dangLam: Promise<void> | null = null;

async function lamNong(versions: Record<string, string>) {
  const t0 = Date.now();
  const kq: string[] = [];
  // Bảng nào đã có bản dựng đúng phiên bản thì bỏ qua (chỉ đọc khoá + ver, không đọc khối dữ liệu) — nhiều phiên bản
  // hàm cùng làm thì nơi sau thấy bản của nơi trước và bỏ qua; không dùng khoá tư vấn vì phải giữ riêng 1 kết nối
  // trong khi pool chỉ có 2 (đọc bảng cũng cần kết nối => tắc)
  const coSan = new Map<string, string>();
  try {
    const r = await pool.query('SELECT khoa, ver FROM all_data_snapshot WHERE khoa = ANY($1::text[])', [BANG.map(k => `bang:${k}|1`)]);
    for (const row of r.rows) coSan.set(String(row.khoa), String(row.ver));
  } catch { /* chưa có bảng all_data_snapshot: dựng như thường */ }
  for (const key of BANG) {
    if (!(key in versions)) continue;
    if (coSan.get(`bang:${key}|1`) === verBang(versions[key])) continue;
    const n = { v: '' };
    try { await manhBang(key, true, versions[key], n); kq.push(`${key}:${n.v}`); }
    catch (e) { kq.push(`${key}:lỗi`); console.error(`[lam-nong] ${key}`, e); }
  }
  for (const v of viecThem) {
    try { await v.chay(); kq.push(`${v.ten}:ok`); } catch (e) { kq.push(`${v.ten}:lỗi`); console.error(`[lam-nong] ${v.ten}`, e); }
  }
  console.log(`[lam-nong] ${Date.now() - t0}ms ${kq.join(' ') || 'đã có sẵn'}`);
}

/** Gọi từ /api/check-versions sau khi đã trả lời: phiên bản đổi so với lần làm nóng trước thì dựng sẵn ở nền */
export function kichLamNong(versions: Record<string, string>) {
  const khoa = JSON.stringify(versions);
  if (khoa === daLamCho || dangLam) return;
  daLamCho = khoa;
  dangLam = lamNong(versions)
    .catch(e => { daLamCho = ''; console.error('[lam-nong] lỗi', e); })
    .finally(() => { dangLam = null; });
  // Vercel: giữ hàm sống tới khi xong việc nền (cùng cơ chế @vercel/functions waitUntil); chạy ở máy thì bỏ qua
  const ctx = (globalThis as Record<symbol, { get?: () => { waitUntil?: (p: Promise<unknown>) => void } } | undefined>)[
    Symbol.for('@vercel/request-context')]?.get?.();
  ctx?.waitUntil?.(dangLam);
}
