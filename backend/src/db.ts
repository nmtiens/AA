import { Pool, types, QueryResultRow, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

types.setTypeParser(1082, (val: string) => val);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,

  // Transaction-mode pooler có giới hạn số client (max_client_conn) dùng chung cho MỌI instance Vercel.
  // Mỗi instance thường xử lý 1 request tại 1 thời điểm => 2 kết nối là đủ (1 cho request, 1 cho việc nền như
  // nạp bảng tên công trình); 3 làm nhiều instance cộng lại vượt trần pooler.
  max: 2,

  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,

  // Trả connection rảnh về pooler sau 30 giây (5 giây khiến gần như request nào cũng mở lại kết nối SSL mới,
  // chậm thêm vài trăm ms; pooler đầy thoáng qua đã có thử lại ở connectWithRetry): trên Vercel mỗi instance có pool riêng, giữ 60 giây khiến nhiều
  // instance cùng giữ chỗ => vượt trần pooler ("no more connections allowed (max_client_conn)") => mọi API 500.
  idleTimeoutMillis: 30000,

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

// Pooler (PgBouncer) báo đầy lúc mở kết nối — "no more connections allowed (max_client_conn)" / "too many
// clients": thường chỉ thoáng qua khi nhiều instance Vercel cùng khởi động. Thử lại tối đa 4 lần (chờ tăng dần,
// tổng ~3 giây) thay vì trả 500 ngay. Bọc pool.connect nên áp cho cả pool.query, timedQuery, withTransaction.
const isPoolerFull = (err: unknown) =>
  /max_client_conn|too many clients|remaining connection slots/i.test(String((err as Error)?.message ?? err));
const CONNECT_RETRY_DELAYS_MS = [250, 500, 900, 1400];
const rawConnect = pool.connect.bind(pool) as () => Promise<PoolClient>;
const connectWithRetry = async (): Promise<PoolClient> => {
  for (let i = 0; ; i++) {
    try {
      return await rawConnect();
    } catch (err) {
      if (!isPoolerFull(err) || i >= CONNECT_RETRY_DELAYS_MS.length) throw err;
      await new Promise(r => setTimeout(r, CONNECT_RETRY_DELAYS_MS[i]));
    }
  }
};
// pg-pool gọi this.connect(cb) (kiểu callback) bên trong pool.query; code dự án gọi kiểu promise
(pool as unknown as { connect: unknown }).connect = (cb?: (err: Error | undefined, client?: PoolClient, done?: PoolClient["release"]) => void) => {
  if (typeof cb === 'function') {
    connectWithRetry().then(
      client => cb(undefined, client, client.release),
      err => cb(err as Error),
    );
    return undefined;
  }
  return connectWithRetry();
};

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
  /** work_mem riêng (MB) cho query gộp / sắp xếp lớn: work_mem mặc định của DB thấp (4MB) nên GROUP BY /
   *  COUNT(DISTINCT) trên ~90k dòng phải sort ra đĩa. SET LOCAL chỉ có hiệu lực trong transaction này. */
  workMemMb?: number;
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
      if (opts.timeoutMs || opts.workMemMb) {
        // SET LOCAL chỉ có hiệu lực trong transaction này -> an toàn với transaction-mode pooler
        await client.query('BEGIN');
        try {
          if (opts.timeoutMs) await client.query(`SET LOCAL statement_timeout = ${Math.floor(opts.timeoutMs)}`);
          if (opts.workMemMb) await client.query(`SET LOCAL work_mem = '${Math.max(1, Math.floor(opts.workMemMb))}MB'`);
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

/**
 * Chạy nhiều câu lệnh GHI trong 1 transaction: lỗi ở bất kỳ bước nào => hoàn tác tất cả.
 * Dùng cho thao tác nhiều bước (vd. xoá vướng mắc + ghi nhật ký) để không bao giờ
 * xảy ra cảnh bước 1 thành công còn bước 2 thất bại.
 * Trong `fn` phải dùng `client.query`, KHÔNG dùng pool.query (sẽ chạy ngoài transaction).
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
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