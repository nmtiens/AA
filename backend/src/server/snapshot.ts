import type { Response } from 'express';
import { pool } from '../db.js';
import { isMissingSchema } from '../notifications.js';

// ----------------------------------------------------------------------------
// Bản nén lưu ở Postgres (all_data_snapshot — backend/sql/2026-10-13_all_data_snapshot.sql), dùng chung mọi phiên
// bản hàm: phiên bản hàm mới (sau deploy / tăng tải / lâu không dùng) không phải truy vấn + nén lại hàng chục nghìn
// dòng (đo 10/2026: 5–6 giây mỗi request bảng lớn). Khoá = bộ bảng + có cột giá; ver = phiên bản các bảng đó.
// Chưa chạy SQL → bỏ qua, chạy như cũ.
// ----------------------------------------------------------------------------
const SNAPSHOT_NHO_MAX = 24;
let snapshotBat = true;
const snapshotNho = new Map<string, { ver: string; buf: Buffer }>();

export const docSnapshot = async (khoa: string, ver: string, nguon: { v: string }): Promise<Buffer | null> => {
  const nho = snapshotNho.get(khoa);
  if (nho && nho.ver === ver) { nguon.v = 'mem'; return nho.buf; }
  if (!snapshotBat) { nguon.v = 'off'; return null; }
  try {
    const r = await pool.query('SELECT du_lieu FROM all_data_snapshot WHERE khoa = $1 AND ver = $2', [khoa, ver]);
    const buf: Buffer | undefined = r.rows[0]?.du_lieu;
    if (!buf) { nguon.v = 'miss'; return null; }
    snapshotNho.set(khoa, { ver, buf });
    nguon.v = 'db';
    return buf;
  } catch (e) {
    if (isMissingSchema(e)) snapshotBat = false; else console.error('[all-data] đọc bản nén lỗi', e);
    nguon.v = 'err';
    return null;
  }
};

// Khoá cũ (bộ bảng / công thức không còn dùng) không ai ghi đè nên nằm mãi (25/11/2026: 72 bản cũ, ~100 MB).
// Bỏ bản quá hạn khi ghi bản mới, mỗi instance tối đa 1 lần / 6 giờ; bản còn cần thì lần sau dựng lại.
const SNAPSHOT_GIU_NGAY = 14;
const SNAPSHOT_DON_MS = 6 * 3600_000;
let donLuc = 0;
const donSnapshotCu = async () => {
  if (Date.now() - donLuc < SNAPSHOT_DON_MS) return;
  donLuc = Date.now();
  try {
    await pool.query(`DELETE FROM all_data_snapshot WHERE cap_nhat < now() - interval '${SNAPSHOT_GIU_NGAY} days'`);
  } catch (e) {
    console.error('[all-data] dọn bản nén cũ lỗi', e);
  }
};

export const luuSnapshot = async (khoa: string, ver: string, buf: Buffer) => {
  snapshotNho.set(khoa, { ver, buf });
  while (snapshotNho.size > SNAPSHOT_NHO_MAX) {
    const cu = snapshotNho.keys().next().value;
    if (cu === undefined) break;
    snapshotNho.delete(cu);
  }
  if (!snapshotBat) return;
  try {
    await pool.query(
      `INSERT INTO all_data_snapshot (khoa, ver, du_lieu, cap_nhat) VALUES ($1, $2, $3, now())
       ON CONFLICT (khoa) DO UPDATE SET ver = EXCLUDED.ver, du_lieu = EXCLUDED.du_lieu, cap_nhat = now()`,
      [khoa, ver, buf]);
    await donSnapshotCu();
  } catch (e) {
    if (isMissingSchema(e)) snapshotBat = false; else console.error('[all-data] lưu bản nén lỗi', e);
  }
};

export const guiGzip = (res: Response, buf: Buffer, timing?: string, encoding: 'gzip' | 'br' = 'gzip') => {
  if (timing) res.set('Server-Timing', timing);
  res.status(200).set({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Encoding': encoding,
    'Content-Length': String(buf.length),
    'Vary': 'Accept-Encoding',
    'Cache-Control': 'no-store',
  });
  res.end(buf);
};
