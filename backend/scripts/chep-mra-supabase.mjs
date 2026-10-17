/* global process, console, URL */
// ============================================================================
// CHÉP DỮ LIỆU MRA (bảng xuong_*) TỪ LAYERBASE SANG SUPABASE
//   Nguồn: NGUON_URL (Layerbase thật; chỉ đếm thì mặc định DATABASE_URL)   Đích: DATABASE_URL_MRA (backend/.env)
//   node backend/scripts/chep-mra-supabase.mjs              → chỉ đếm, so sánh (không ghi)
//   node backend/scripts/chep-mra-supabase.mjs --ghi        → XOÁ dữ liệu xuong_* ở đích rồi chép lại toàn bộ (1 giao dịch)
//   thêm --tu-db-may: chép từ DATABASE_URL ở máy (thử)
// Chạy SAU backend/sql/supabase/2026-10-16_mra_supabase.sql. Chạy lại an toàn (chép đè).
// Khi chuyển thật: chạy --ghi ngay trước khi đẩy code dùng DATABASE_URL_MRA (thao tác ghi vào Layerbase sau lần
// chép sẽ không sang Supabase — chép lại lần cuối lúc xưởng nghỉ).
// Không in chuỗi kết nối / mật khẩu.
// ============================================================================
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Đọc backend/.env dù chạy lệnh từ thư mục nào
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const GHI = process.argv.includes('--ghi');
// Chép thật (--ghi) phải khai rõ nguồn NGUON_URL (Layerbase thật): DATABASE_URL ở máy thường là bản copy.
// Muốn chép từ DB ở máy để thử: thêm --tu-db-may.
const TU_MAY = process.argv.includes('--tu-db-may');
const nguonUrl = process.env.NGUON_URL || (TU_MAY || !GHI ? process.env.DATABASE_URL : undefined);
const dichUrl = process.env.DATABASE_URL_MRA;
if (!dichUrl) { console.error('Thiếu DATABASE_URL_MRA trong backend/.env'); process.exit(1); }
if (!nguonUrl) {
  console.error([
    'Chép thật cần nguồn Layerbase: đặt NGUON_URL trước khi chạy, vd (PowerShell):',
    '  $env:NGUON_URL = "postgresql://...layerbase..."',
    '  node backend/scripts/chep-mra-supabase.mjs --ghi',
    '(chép từ DB ở máy để thử: thêm --tu-db-may)',
  ].join('\n'));
  process.exit(1);
}
const host = u => { try { return new URL(u).hostname; } catch { return '?'; } };

// Thứ tự theo khoá ngoại (bảng cha trước)
const BANG = [
  ['xuong_cong_doan', 'id'], ['xuong_to', 'id'], ['xuong_to_cong_doan', 'to_id, cong_doan_id'],
  ['xuong_to_thanh_vien', 'to_id, mnv, tu_ngay'], ['xuong_to_che_do', 'id'], ['xuong_lich_ca', 'xuong, loai_ca'],
  ['xuong_quan_ly', 'user_id, xuong'], ['xuong_cong_nhan', 'mnv'], ['xuong_phien_thiet_bi', 'device_id, user_id'],
  ['xuong_su_kien', 'id'], ['xuong_trang_thai', 'hex, cong_doan_id'], ['xuong_phien_ban', 'to_id, ngay'],
  ['xuong_gio_cong_ngay', 'to_id, ngay'], ['xuong_anh', 'id'],
];
const TRANG = 1000;

const ssl = u => (/supabase\.com|layerbase|sslmode=require/.test(u) ? { rejectUnauthorized: false } : false);
const boSsl = u => { const x = new URL(u); x.searchParams.delete('sslmode'); return x.toString(); };
const nguon = new pg.Client({ connectionString: boSsl(nguonUrl), ssl: ssl(nguonUrl) });
const dich = new pg.Client({ connectionString: boSsl(dichUrl), ssl: { rejectUnauthorized: false } });
await nguon.connect(); await dich.connect();
await nguon.query(`SET statement_timeout = '120s'`);
console.log(`Nguồn: ${host(nguonUrl)} → Đích: ${host(dichUrl)} · ${GHI ? 'GHI (chép đè)' : 'chỉ đếm'}`);

const cot = async (c, t) => (await c.query(
  `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [t])).rows;
const dem = async (c, t) => Number((await c.query(`SELECT count(*) AS n FROM ${t}`)).rows[0].n);

const ke = [];
for (const [t] of BANG) {
  const coNguon = (await nguon.query('SELECT to_regclass($1) IS NOT NULL AS co', [t])).rows[0].co;
  const coDich = (await dich.query('SELECT to_regclass($1) IS NOT NULL AS co', [t])).rows[0].co;
  ke.push({ t, coNguon, coDich, nNguon: coNguon ? await dem(nguon, t) : null, nDich: coDich ? await dem(dich, t) : null });
}
console.table(ke.map(x => ({ bang: x.t, nguon: x.coNguon ? x.nNguon : '(chưa có bảng)', dich: x.coDich ? x.nDich : '(CHƯA TẠO — chạy SQL)' })));
if (ke.some(x => !x.coDich)) { console.error('Đích thiếu bảng: chạy backend/sql/supabase/2026-10-16_mra_supabase.sql trước'); process.exit(1); }
if (!GHI) { await nguon.end(); await dich.end(); process.exit(0); }

try {
  await dich.query('BEGIN');
  await dich.query(`SET LOCAL statement_timeout = '600s'`);
  await dich.query(`TRUNCATE ${BANG.map(([t]) => t).join(', ')} RESTART IDENTITY`);
  for (const [t, khoa] of BANG) {
    if (!ke.find(x => x.t === t).coNguon) { console.log(`${t}: nguồn chưa có bảng — bỏ qua`); continue; }
    const cn = await cot(nguon, t);
    const cd = new Map((await cot(dich, t)).map(x => [x.column_name, x.data_type]));
    const ds = cn.map(x => x.column_name).filter(c => cd.has(c));
    const json = new Set(ds.filter(c => ['json', 'jsonb'].includes(cd.get(c))));
    let n = 0;
    for (let off = 0; ; off += TRANG) {
      const rows = (await nguon.query(`SELECT ${ds.join(', ')} FROM ${t} ORDER BY ${khoa} LIMIT ${TRANG} OFFSET ${off}`)).rows;
      if (!rows.length) break;
      const thamSo = [];
      const giaTri = rows.map(r => `(${ds.map(c => {
        const v = r[c];
        thamSo.push(json.has(c) && v !== null && v !== undefined ? JSON.stringify(v) : v);
        return `$${thamSo.length}`;
      }).join(', ')})`);
      await dich.query(`INSERT INTO ${t} (${ds.join(', ')}) VALUES ${giaTri.join(', ')}`, thamSo);
      n += rows.length;
      if (rows.length < TRANG) break;
    }
    console.log(`${t}: chép ${n} dòng`);
  }
  // Số tự tăng tiếp sau id lớn nhất đã chép
  for (const t of ['xuong_to', 'xuong_to_che_do']) {
    await dich.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), GREATEST((SELECT max(id) FROM ${t}), 1), (SELECT max(id) IS NOT NULL FROM ${t}))`);
  }
  await dich.query('COMMIT');
} catch (e) {
  await dich.query('ROLLBACK').catch(() => {});
  console.error('LỖI — đã hoàn tác, đích không đổi:', e.message);
  process.exit(1);
}
const lech = [];
for (const [t] of BANG) {
  const x = ke.find(k => k.t === t);
  const nd = await dem(dich, t);
  if (x.coNguon && nd !== x.nNguon) lech.push(`${t}: nguồn ${x.nNguon} ≠ đích ${nd}`);
}
console.log(lech.length ? `LỆCH:\n${lech.join('\n')}` : 'Đã chép xong, số dòng khớp từng bảng.');
await nguon.end(); await dich.end();
