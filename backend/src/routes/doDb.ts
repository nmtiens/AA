import type { Request, Response } from 'express';
import type { Pool } from 'pg';
import { pool, poolMra, chayCoGioiHan } from '../db.js';
import { app } from '../server/app.js';
import { authenticateJWT, requireRole } from '../server/auth.js';

// ============================================================================
// GET /api/do-db (ADMIN) — đo độ trễ mạng từ máy chủ tới DB, để quyết có đáng giảm tiếp số lượt đi-về không
// (mỗi truy vấn có tham số hiện tốn 3 lượt: mở giao dịch + giới hạn 8 giây / câu truy vấn / COMMIT — db.ts).
// Chỉ đọc: SELECT 1. Trả về, cho từng DB:
//   moKetNoiMs  — thời gian lấy 1 kết nối (kết nối rảnh đóng sau 1 giây nên thường là mở mới: TLS + đăng nhập)
//   luotMs      — 7 lần SELECT 1 trên cùng kết nối (mỗi lần đúng 1 lượt đi-về), đã xếp tăng dần
//   motLuotMs   — trung vị của luotMs = độ trễ 1 lượt đi-về
//   baLuotMs    — 1 truy vấn có tham số đi đúng đường của app (3 lượt), trung vị của 3 lần
//   tietKiemMoiTruyVanMs — ước lượng bớt được cho MỖI truy vấn có tham số nếu còn 1 lượt (= baLuotMs − motLuotMs)
// ============================================================================
const tron = (v: number) => Math.round(v * 10) / 10;
const ms = (t0: bigint) => Number(process.hrtime.bigint() - t0) / 1e6;

async function doMot(p: Pool) {
  let t = process.hrtime.bigint();
  const c = await p.connect();
  const moKetNoiMs = tron(ms(t));
  try {
    const luot: number[] = [];
    for (let i = 0; i < 7; i++) {
      t = process.hrtime.bigint();
      await c.query('SELECT 1');
      luot.push(tron(ms(t)));
    }
    luot.sort((a, b) => a - b);
    // 3 lần, lấy trung vị (lần đầu trên kết nối mới có thể chậm bất thường)
    const ba: number[] = [];
    for (let i = 0; i < 3; i++) {
      t = process.hrtime.bigint();
      await chayCoGioiHan(c, 'SELECT $1::int AS x', [1]);
      ba.push(tron(ms(t)));
    }
    const baLuotMs = ba.sort((x, y) => x - y)[1];
    const motLuotMs = luot[3];
    return { moKetNoiMs, luotMs: luot, motLuotMs, baLuotMs, tietKiemMoiTruyVanMs: tron(Math.max(baLuotMs - motLuotMs, 0)) };
  } finally {
    c.release();
  }
}

app.get('/api/do-db', authenticateJWT, requireRole('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const chinh = await doMot(pool);
    const xuong = poolMra === pool ? null : await doMot(poolMra);
    res.set('Cache-Control', 'no-store').json({
      vung: process.env.VERCEL_REGION ?? null,   // vùng của máy chủ (vd. iad1); null = chạy ở máy
      luc: new Date().toISOString(),
      chinh, xuong,
    });
  } catch (e) {
    console.error('[do-db]', e);
    res.status(500).json({ error: 'Không đo được độ trễ DB' });
  }
});
