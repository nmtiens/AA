import { Pool, types, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

types.setTypeParser(1082, (val: string) => val);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,

  // Transaction-mode pooler (6543) có pool phía server rất nhỏ, dùng chung cho mọi
  // client/instance. Không tăng max khi chưa biết giới hạn thật của pooler.
  max: 3,

  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,

  // Giữ connection lâu hơn để tránh "connect storm" khi traffic tăng đột ngột
  idleTimeoutMillis: 60000,

  connectionTimeoutMillis: 15000,

  application_name: 'vercel-backend',

  // Không đặt statement_timeout ở đây: pg gửi nó trong StartupMessage và
  // PgBouncer của Layerbase từ chối startup parameter không chuẩn.
  // Timeout được áp dụng bằng lệnh SET ở sự kiện 'connect' bên dưới.

  allowExitOnIdle: false,
});

const STATEMENT_TIMEOUT_MS = 8000;

pool.on('connect', (client) => {
  console.log('Connected to PostgreSQL database');
  // Timeout mặc định cho query thường. Query nặng dùng SET LOCAL riêng (xem timedQuery).
  client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`).catch((err) => {
    console.error('Không set được statement_timeout:', err.message);
  });
});

pool.on('error', (err) => {
  console.error('Unexpected DB error on idle client:', err);
});

// ============================================================================
// Semaphore: giới hạn số query "nặng" chạy đồng thời trên mỗi instance,
// để luôn còn connection trống cho các request nhẹ.
// ============================================================================
class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;
  constructor(private readonly max: number) {}

  async acquire(): Promise<() => void> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      this.queue.shift()?.();
    };
  }
}

// Chỉ 1 query nặng chạy cùng lúc trên mỗi instance
const heavySemaphore = new Semaphore(1);

export interface TimedQueryOptions {
  /** Xếp hàng riêng, không cho chiếm hết pool */
  heavy?: boolean;
  /** Timeout riêng cho query này (ms). Mặc định dùng STATEMENT_TIMEOUT_MS */
  timeoutMs?: number;
}

export async function timedQuery<T extends QueryResultRow = any>(
  text: string,
  params?: any[],
  opts: TimedQueryOptions = {}
): Promise<{ rows: T[] }> {
  const debug = process.env.DEBUG_DB_TIMING === 'true';
  const t0 = Date.now();
  const releaseHeavy = opts.heavy ? await heavySemaphore.acquire() : null;

  try {
    const client = await pool.connect();
    const t1 = Date.now();
    try {
      let result;
      if (opts.timeoutMs) {
        // SET LOCAL chỉ có hiệu lực trong transaction này -> an toàn với transaction-mode pooler
        await client.query('BEGIN');
        try {
          await client.query(`SET LOCAL statement_timeout = ${Math.floor(opts.timeoutMs)}`);
          result = await client.query(text, params);
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
        }
      } else {
        result = await client.query(text, params);
      }

      if (debug) {
        console.log(
          `[db timing] wait: ${t1 - t0}ms | query: ${Date.now() - t1}ms | sql: ${text.slice(0, 80)}`
        );
      }
      return result;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(
      `[db timing:ERROR] ${Date.now() - t0}ms | sql: ${text.slice(0, 80)} | err: ${(err as Error).message}`
    );
    throw err;
  } finally {
    releaseHeavy?.();
  }
}

process.on('SIGINT', async () => {
  console.log('Closing PostgreSQL pool...');
  await pool.end();
  console.log('PostgreSQL pool closed.');
  process.exit(0);
});