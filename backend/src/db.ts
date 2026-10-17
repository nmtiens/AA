import { Pool, types, QueryResultRow, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

types.setTypeParser(1082, (val: string) => val);

// Bỏ tham số sslmode khỏi chuỗi kết nối: SSL đã cấu hình riêng ở `ssl` bên dưới. pg hiện cảnh báo sslmode=require
// sẽ bị hiểu là verify-full ở bản pg sau (kiểm tra chứng chỉ) => có thể không kết nối được pooler; bỏ đi thì `ssl`
// bên dưới quyết định (production: mã hoá, không kiểm tra chứng chỉ — như hiện tại).
const boSslmode = (raw: string | undefined) => {
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    if (!u.searchParams.has('sslmode')) return raw;
    u.searchParams.delete('sslmode');
    return u.toString();
  } catch {
    return raw;
  }
};
const connectionString = boSslmode(process.env.DATABASE_URL);

export const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,

  // Transaction-mode pooler có giới hạn số client (max_client_conn) dùng chung cho MỌI instance Vercel.
  // Mỗi instance thường xử lý 1 request tại 1 thời điểm => 2 kết nối là đủ (1 cho request, 1 cho việc nền như
  // nạp bảng tên công trình); 3 làm nhiều instance cộng lại vượt trần pooler.
  max: 2,

  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,

  // Trả connection rảnh về pooler gần như ngay (1 giây). Trên Vercel instance bị ĐÓNG BĂNG ngay sau khi trả kết quả:
  // bộ đếm rảnh không chạy trong lúc đóng băng => kết nối chưa kịp trả bị giữ suốt đời instance (vài phút). Nhiều
  // instance cùng giữ => vượt trần pooler ("no more connections allowed (max_client_conn)") => mọi API 500
  // (12/10/2026 với 30 giây). Mở lại kết nối tốn ít vì hàm API (iad1) đặt cạnh DB (Mỹ).
  idleTimeoutMillis: 1000,

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
function boRetry(p: Pool) {
  const rawConnect = p.connect.bind(p) as () => Promise<PoolClient>;
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
  (p as unknown as { connect: unknown }).connect = (cb?: (err: Error | undefined, client?: PoolClient, done?: PoolClient["release"]) => void) => {
    if (typeof cb === 'function') {
      connectWithRetry().then(
        client => cb(undefined, client, client.release),
        err => cb(err as Error),
      );
      return undefined;
    }
    return connectWithRetry();
  };
}
boRetry(pool);

// ============================================================================
// DỮ LIỆU MRA (mục Xưởng — bảng xuong_*) Ở SUPABASE (backend/sql/supabase/2026-10-16_mra_supabase.sql).
// DATABASE_URL_MRA = chuỗi "Transaction pooler" (cổng 6543) của project Supabase, vùng us-east-1 (cạnh hàm iad1).
// Chưa đặt biến: poolMra = pool (bảng Xưởng vẫn ở Layerbase như trước). users / dữ liệu sản xuất luôn ở `pool`.
// ============================================================================
const urlMra = boSslmode(process.env.DATABASE_URL_MRA);
export const coDbMra = !!urlMra;
export const poolMra: Pool = urlMra ? new Pool({
  connectionString: urlMra,
  // Supabase luôn bắt SSL (kể cả chạy ở máy)
  ssl: { rejectUnauthorized: false },
  max: 2,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  idleTimeoutMillis: 1000,
  connectionTimeoutMillis: 15000,
  application_name: 'vercel-backend-mra',
  allowExitOnIdle: false,
}) : pool;
if (poolMra !== pool) {
  poolMra.on('connect', (client) => {
    client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`).catch((err) => {
      console.error('Không set được statement_timeout (MRA):', err.message);
    });
  });
  poolMra.on('error', (err) => {
    console.error('Unexpected DB error on idle client (MRA):', err);
  });
  boRetry(poolMra);
}

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
        // SET LOCAL chỉ có hiệu lực trong transaction này -> an toàn với transaction-mode pooler.
        // BEGIN + các SET gửi chung 1 lệnh (1 lượt đi về thay vì 3 — mỗi lượt tới DB là vài chục–vài trăm ms)
        const setup = ['BEGIN'];
        if (opts.timeoutMs) setup.push(`SET LOCAL statement_timeout = ${Math.floor(opts.timeoutMs)}`);
        if (opts.workMemMb) setup.push(`SET LOCAL work_mem = '${Math.max(1, Math.floor(opts.workMemMb))}MB'`);
        try {
          // Trong try: SET lỗi thì vẫn ROLLBACK, không trả kết nối đang kẹt transaction về pool
          await client.query(setup.join('; '));
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
  return giaoDich(pool, fn);
}

/** Như withTransaction nhưng trên DB MRA (bảng xuong_*). Không ghi bảng Layerbase (users…) trong `fn`. */
export async function withTransactionMra<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return giaoDich(poolMra, fn);
}

async function giaoDich<T>(p: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await p.connect();
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
  if (poolMra !== pool) await poolMra.end();
  console.log('PostgreSQL pool closed.');
  process.exit(0);
});