import { Pool, types, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

types.setTypeParser(1082, (val: string) => val);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,

  // GIẢM MẠNH: transaction-mode pooler (6543) có pool phía server rất nhỏ,
  // dùng CHUNG cho mọi client/instance. max lớn ở đây không "tận dụng" được gì
  // vì Supavisor đã multiplex hộ — chỉ khiến 1 instance dễ chiếm hết pool chung.
  max: 3,

  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,

  // TĂNG: tránh đóng hết connection lúc idle rồi phải mở lại hàng loạt
  // đúng lúc traffic tăng đột ngột (đây là nguyên nhân gây "connect storm"
  // thấy trong log — rất nhiều dòng "Connected to PostgreSQL database" liên tiếp)
  idleTimeoutMillis: 60000,

  connectionTimeoutMillis: 15000,

  application_name: 'vercel-backend',

  // GIẢM nhẹ: fail nhanh hơn để nhường connection cho request khác,
  // phù hợp với pool server nhỏ
  statement_timeout: 8000,

  // TẮT: allowExitOnIdle gây đóng/mở connection hàng loạt không cần thiết
  // trên serverless — để mặc định (false)
  allowExitOnIdle: false,
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected DB error on idle client:', err);
});

export async function timedQuery<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[] }> {
  const debug = process.env.DEBUG_DB_TIMING === 'true';

  if (!debug) {
    return pool.query(text, params);
  }

  const t0 = Date.now();
  const client = await pool.connect();
  const t1 = Date.now();
  try {
    const result = await client.query(text, params);
    const t2 = Date.now();
    console.log(
      `[db timing] connect: ${t1 - t0}ms | query: ${t2 - t1}ms | sql: ${text.slice(0, 80)}`
    );
    return result;
  } finally {
    client.release();
  }
}

process.on('SIGINT', async () => {
  console.log('Closing PostgreSQL pool...');
  await pool.end();
  console.log('PostgreSQL pool closed.');
  process.exit(0);
});