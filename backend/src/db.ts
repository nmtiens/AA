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

  max: 5,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,   // MỚI: gửi gói keepalive đầu tiên sau 10s thay vì mặc định 0
                                          // (mặc định 0 gửi ngay, hơi tốn không cần thiết cho connection ngắn hạn)

  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,

  // MỚI: đặt tên connection để dễ nhận diện trong Supabase Dashboard -> Database -> Roles/Activity
  // Giúp debug khi cần xem connection nào đang chiếm pool
  application_name: 'vercel-backend',

  // MỚI: tự động hủy query nếu chạy quá lâu, TRẢ CONNECTION VỀ POOL ngay
  // thay vì để 1 query nặng giữ connection tới khi connectionTimeoutMillis (15s)
  // -> giảm rủi ro 1 query chậm làm nghẽn cả pool cho các request khác
  statement_timeout: 10000,   // 10s — chỉnh tùy độ nặng thực tế của query overview/summary

  // MỚI: cho phép pool tự đóng hết connection khi không còn client nào tham chiếu
  // (hữu ích khi Vercel freeze function giữa các lần gọi — tránh giữ handle treo)
  allowExitOnIdle: true,
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected DB error on idle client:', err);
});

/**
 * Helper để query kèm log thời gian connect vs query.
 * Set DEBUG_DB_TIMING=true trong env để bật log.
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

process.on('SIGINT', async () => {
  console.log('Closing PostgreSQL pool...');
  await pool.end();
  console.log('PostgreSQL pool closed.');
  process.exit(0);
});