import { Pool, types, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// OID 1082 = DATE type. Keep as string to avoid timezone shifts.
types.setTypeParser(1082, (val: string) => val);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  max: 5,                        // đủ cho vài query song song / request
  keepAlive: true,               // giữ TCP connection sống, tránh bị âm thầm ngắt
  idleTimeoutMillis: 30000,      // tăng từ 10s -> 30s, giảm reconnect giữa các request
  connectionTimeoutMillis: 15000,
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected DB error on idle client:', err);
});

/**
 * Helper để query kèm log thời gian connect vs query.
 * Dùng tạm để chẩn đoán chỗ nào đang chậm — connect (network/region/reconnect)
 * hay query (thiếu index / query nặng).
 *
 * Set DEBUG_DB_TIMING=true trong env để bật log, tắt đi khi đã xác định xong nguyên nhân.
 */
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

// Trên Vercel serverless, SIGINT không được gửi khi function bị freeze/kill,
// nên đoạn này chỉ có tác dụng khi chạy local / trên server dài hạn.
process.on('SIGINT', async () => {
  console.log('Closing PostgreSQL pool...');
  await pool.end();
  console.log('PostgreSQL pool closed.');
  process.exit(0);
});