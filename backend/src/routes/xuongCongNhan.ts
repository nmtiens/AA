import type { Request, Response } from 'express';
import { z } from 'zod';
import { poolMra } from '../db.js';
import { app } from '../server/app.js';
import { chuanMnv, MNV_RE } from '../server/xuong/chamCong.js';
import { fail, coQuyenXuong, coBangCongNhan, xuongQuanLy, quanLyDuoc, msnvCua } from './xuong.js';

// ============================================================================
// DANH SÁCH CÔNG NHÂN — chấm công theo người (docs/designs/xuong-cham-cong.md, backend/sql/2026-10-13_xuong_cham_cong.sql)
//   GET  /api/xuong/cong-nhan/tim?q=&xuong=   tìm người (mượn người tổ khác / thêm vào tổ)
//   POST /api/xuong/cong-nhan                 thêm người vào tổ (tổ trưởng của tổ hoặc quản lý xưởng)
//   POST /api/xuong/cong-nhan/roi-to          bỏ người khỏi tổ
//   GET  /api/xuong/cong-nhan?xuong=          danh sách của xưởng (quản lý)
//   POST /api/xuong/cong-nhan/sua             chuyển tổ / nghỉ việc / sửa tên (quản lý)
//   POST /api/xuong/cong-nhan/nap             nạp file nhân sự (quản lý; trình duyệt đọc file, gửi các dòng)
// Chưa chạy file SQL: trả { available: false }.
// ============================================================================

const chuaBat = (res: Response) => res.json({ success: true, available: false });

/** Quyền sửa danh sách của tổ: tổ trưởng / thành viên tổ (theo mã NV) hoặc quản lý xưởng của tổ */
async function quyenTo(req: Request, toId: number): Promise<{ duoc: boolean; quanLy: boolean; xuong: string | null }> {
  const me = Number(req.user!.id);
  const to = (await poolMra.query('SELECT xuong, to_truong_user_id FROM xuong_to WHERE id = $1', [toId])).rows[0];
  if (!to) return { duoc: false, quanLy: false, xuong: null };
  const xuong = String(to.xuong);
  const quanLy = quanLyDuoc(await xuongQuanLy(me), xuong);
  if (quanLy || Number(to.to_truong_user_id) === me) return { duoc: true, quanLy, xuong };
  const msnv = await msnvCua(me);
  if (!msnv) return { duoc: false, quanLy: false, xuong };
  const tv = await poolMra.query(
    `SELECT 1 FROM xuong_to_thanh_vien tv
     WHERE tv.to_id = $1 AND upper(tv.mnv) = $2 AND (tv.den_ngay IS NULL OR tv.den_ngay >= CURRENT_DATE) LIMIT 1`, [toId, msnv]);
  return { duoc: tv.rows.length > 0, quanLy: false, xuong };
}

const dong = (x: Record<string, unknown>) => ({
  mnv: String(x.mnv), hoTen: String(x.ho_ten), xuong: x.xuong ? String(x.xuong) : null,
  toId: x.to_id === null || x.to_id === undefined ? null : Number(x.to_id), tenTo: x.ten_to ? String(x.ten_to) : null,
  chucVu: x.chuc_vu ? String(x.chuc_vu) : null, active: x.active !== false, nguon: x.nguon ? String(x.nguon) : null,
});

app.get('/api/xuong/cong-nhan/tim', async (req: Request, res: Response) => {
  try {
    if (!(await coQuyenXuong(req))) return res.status(403).json({ success: false, message: 'Tài khoản chưa được cấp quyền mục Xưởng' });
    if (!(await coBangCongNhan())) return chuaBat(res);
    const q = String(req.query.q ?? '').trim().slice(0, 60);
    if (q.length < 2) return res.json({ success: true, available: true, ketQua: [] });
    const xuong = typeof req.query.xuong === 'string' && req.query.xuong ? req.query.xuong.toUpperCase() : null;
    const mau = `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`;
    const r = await poolMra.query(
      `SELECT c.*, t.ten_to FROM xuong_cong_nhan c LEFT JOIN xuong_to t ON t.id = c.to_id
       WHERE c.active AND (c.mnv ILIKE $1 OR c.ho_ten ILIKE $1) AND ($2::text IS NULL OR c.xuong = $2)
       ORDER BY (upper(c.mnv) = upper($3)) DESC, c.ho_ten LIMIT 20`, [mau, xuong, q]);
    res.json({ success: true, available: true, ketQua: r.rows.map(dong) });
  } catch (e) { fail(res, e, '/api/xuong/cong-nhan/tim'); }
});

const themSchema = z.object({ toId: z.number().int().positive(), mnv: z.string().min(2).max(20), hoTen: z.string().trim().max(80).optional() });

app.post('/api/xuong/cong-nhan', async (req: Request, res: Response) => {
  try {
    if (!(await coQuyenXuong(req))) return res.status(403).json({ success: false, message: 'Tài khoản chưa được cấp quyền mục Xưởng' });
    if (!(await coBangCongNhan())) return chuaBat(res);
    const p = themSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ success: false, message: 'Thiếu tổ / mã nhân viên' });
    const mnv = chuanMnv(p.data.mnv);
    if (!MNV_RE.test(mnv)) return res.status(400).json({ success: false, message: 'Mã nhân viên chỉ gồm chữ, số (vd AAF7615)' });
    const q = await quyenTo(req, p.data.toId);
    if (!q.duoc) return res.status(403).json({ success: false, message: 'Chỉ tổ trưởng của tổ hoặc quản lý xưởng được sửa danh sách' });
    const cu = (await poolMra.query(
      `SELECT c.*, t.ten_to FROM xuong_cong_nhan c LEFT JOIN xuong_to t ON t.id = c.to_id WHERE c.mnv = $1`, [mnv])).rows[0];
    if (cu && cu.active && cu.to_id !== null && Number(cu.to_id) !== p.data.toId && !q.quanLy) {
      return res.status(409).json({
        success: false, message: `${cu.ho_ten} (${mnv}) đang ở tổ ${cu.ten_to ?? 'khác'} — điểm danh "Người tổ khác" để mượn, hoặc nhờ quản lý chuyển tổ`,
      });
    }
    const hoTen = p.data.hoTen?.trim() || (cu ? String(cu.ho_ten) : '');
    if (!hoTen) return res.status(400).json({ success: false, message: 'Nhập họ tên người mới' });
    const r = await poolMra.query(
      `INSERT INTO xuong_cong_nhan (mnv, ho_ten, xuong, to_id, nguon) VALUES ($1, $2, $3, $4, 'app')
       ON CONFLICT (mnv) DO UPDATE SET to_id = EXCLUDED.to_id, active = true, cap_nhat = now(),
         xuong = EXCLUDED.xuong, ho_ten = CASE WHEN xuong_cong_nhan.nguon = 'file' THEN xuong_cong_nhan.ho_ten ELSE EXCLUDED.ho_ten END
       RETURNING *`, [mnv, hoTen, q.xuong, p.data.toId]);
    res.json({ success: true, available: true, congNhan: dong(r.rows[0]) });
  } catch (e) { fail(res, e, '/api/xuong/cong-nhan'); }
});

app.post('/api/xuong/cong-nhan/roi-to', async (req: Request, res: Response) => {
  try {
    if (!(await coQuyenXuong(req))) return res.status(403).json({ success: false, message: 'Tài khoản chưa được cấp quyền mục Xưởng' });
    if (!(await coBangCongNhan())) return chuaBat(res);
    const p = z.object({ toId: z.number().int().positive(), mnv: z.string().min(2).max(20) }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ success: false, message: 'Thiếu tổ / mã nhân viên' });
    const q = await quyenTo(req, p.data.toId);
    if (!q.duoc) return res.status(403).json({ success: false, message: 'Chỉ tổ trưởng của tổ hoặc quản lý xưởng được sửa danh sách' });
    await poolMra.query(`UPDATE xuong_cong_nhan SET to_id = NULL, cap_nhat = now() WHERE mnv = $1 AND to_id = $2`, [chuanMnv(p.data.mnv), p.data.toId]);
    res.json({ success: true, available: true });
  } catch (e) { fail(res, e, '/api/xuong/cong-nhan/roi-to'); }
});

app.get('/api/xuong/cong-nhan', async (req: Request, res: Response) => {
  try {
    const xuong = String(req.query.xuong ?? '').toUpperCase();
    if (!xuong || !quanLyDuoc(await xuongQuanLy(req.user!.id), xuong)) return res.status(403).json({ success: false, message: 'Cần quyền quản lý xưởng này' });
    if (!(await coBangCongNhan())) return chuaBat(res);
    const r = await poolMra.query(
      `SELECT c.*, t.ten_to FROM xuong_cong_nhan c LEFT JOIN xuong_to t ON t.id = c.to_id
       WHERE c.xuong = $1 OR t.xuong = $1 ORDER BY c.active DESC, t.ten_to NULLS LAST, c.ho_ten`, [xuong]);
    res.json({ success: true, available: true, congNhan: r.rows.map(dong) });
  } catch (e) { fail(res, e, '/api/xuong/cong-nhan'); }
});

const suaSchema = z.object({
  mnv: z.string().min(2).max(20),
  toId: z.number().int().positive().nullable().optional(),
  active: z.boolean().optional(),
  hoTen: z.string().trim().min(1).max(80).optional(),
});

app.post('/api/xuong/cong-nhan/sua', async (req: Request, res: Response) => {
  try {
    if (!(await coBangCongNhan())) return chuaBat(res);
    const p = suaSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ' });
    const mnv = chuanMnv(p.data.mnv);
    const cu = (await poolMra.query('SELECT * FROM xuong_cong_nhan WHERE mnv = $1', [mnv])).rows[0];
    if (!cu) return res.status(404).json({ success: false, message: 'Không có người này' });
    const ds = await xuongQuanLy(req.user!.id);
    let xuongMoi: string | null = cu.xuong ?? null;
    if (p.data.toId) {
      const to = (await poolMra.query('SELECT xuong FROM xuong_to WHERE id = $1', [p.data.toId])).rows[0];
      if (!to) return res.status(404).json({ success: false, message: 'Tổ không tồn tại' });
      xuongMoi = String(to.xuong);
    }
    if (!quanLyDuoc(ds, cu.xuong ?? null) || !quanLyDuoc(ds, xuongMoi)) return res.status(403).json({ success: false, message: 'Cần quyền quản lý xưởng này' });
    const r = await poolMra.query(
      `UPDATE xuong_cong_nhan SET to_id = CASE WHEN $2::boolean THEN $3::int ELSE to_id END, xuong = $4,
         active = COALESCE($5, active), ho_ten = COALESCE($6, ho_ten), cap_nhat = now() WHERE mnv = $1 RETURNING *`,
      [mnv, p.data.toId !== undefined, p.data.toId ?? null, xuongMoi, p.data.active ?? null, p.data.hoTen ?? null]);
    res.json({ success: true, available: true, congNhan: dong(r.rows[0]) });
  } catch (e) { fail(res, e, '/api/xuong/cong-nhan/sua'); }
});

const napSchema = z.object({
  rows: z.array(z.object({
    mnv: z.string().max(40), hoTen: z.string().max(120), xuong: z.string().max(20).nullish(),
    tenTo: z.string().max(80).nullish(), chucVu: z.string().max(80).nullish(),
  })).min(1).max(5000),
  /** Người của các xưởng trong file mà không có trong file => đánh nghỉ việc */
  nghiNguoiVang: z.boolean().optional(),
});

app.post('/api/xuong/cong-nhan/nap', async (req: Request, res: Response) => {
  try {
    if (!(await coBangCongNhan())) return chuaBat(res);
    const p = napSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ success: false, message: 'File không đúng dạng (cần mã NV, họ tên)' });
    const ds = await xuongQuanLy(req.user!.id);
    if (!ds.size) return res.status(403).json({ success: false, message: 'Cần quyền quản lý xưởng' });
    const toRows = (await poolMra.query('SELECT id, xuong, ten_to FROM xuong_to WHERE active')).rows;
    const timTo = (xuong: string | null, ten: string | null) => {
      if (!ten) return null;
      const t = ten.trim().toUpperCase();
      return toRows.find(x => (!xuong || String(x.xuong) === xuong) && String(x.ten_to).trim().toUpperCase() === t) ?? null;
    };
    const loi: string[] = [];
    const toKhongKhop = new Set<string>();
    const hopLe: Array<{ mnv: string; hoTen: string; xuong: string | null; toId: number | null; chucVu: string | null }> = [];
    for (const [i, x] of p.data.rows.entries()) {
      const mnv = chuanMnv(x.mnv);
      if (!MNV_RE.test(mnv) || !x.hoTen.trim()) { if (loi.length < 20) loi.push(`Dòng ${i + 2}: thiếu / sai mã NV hoặc họ tên`); continue; }
      const to = timTo(x.xuong?.trim().toUpperCase() || null, x.tenTo ?? null);
      if (x.tenTo && !to) toKhongKhop.add(`${x.xuong ?? ''} ${x.tenTo}`.trim());
      const xuong = (to ? String(to.xuong) : x.xuong?.trim().toUpperCase()) || null;
      if (!quanLyDuoc(ds, xuong)) { if (loi.length < 20) loi.push(`Dòng ${i + 2}: không có quyền xưởng ${xuong ?? '(trống)'}`); continue; }
      hopLe.push({ mnv, hoTen: x.hoTen.trim(), xuong, toId: to ? Number(to.id) : null, chucVu: x.chucVu?.trim() || null });
    }
    const client = await poolMra.connect();
    let nghi = 0;
    try {
      // Tự huỷ phía DB nếu bị bỏ dở giữa chừng (xem IDLE_TX_TIMEOUT_SQL ở db.ts)
      await client.query('BEGIN; SET LOCAL idle_in_transaction_session_timeout = 30000');
      for (let i = 0; i < hopLe.length; i += 500) {
        const lo = hopLe.slice(i, i + 500);
        await client.query(
          `INSERT INTO xuong_cong_nhan (mnv, ho_ten, xuong, to_id, chuc_vu, nguon, active)
           SELECT * , 'file', true FROM unnest($1::text[], $2::text[], $3::text[], $4::int[], $5::text[])
           ON CONFLICT (mnv) DO UPDATE SET ho_ten = EXCLUDED.ho_ten, xuong = EXCLUDED.xuong,
             to_id = COALESCE(EXCLUDED.to_id, xuong_cong_nhan.to_id), chuc_vu = COALESCE(EXCLUDED.chuc_vu, xuong_cong_nhan.chuc_vu),
             nguon = 'file', active = true, cap_nhat = now()`,
          [lo.map(x => x.mnv), lo.map(x => x.hoTen), lo.map(x => x.xuong), lo.map(x => x.toId), lo.map(x => x.chucVu)]);
      }
      if (p.data.nghiNguoiVang) {
        const xs = [...new Set(hopLe.map(x => x.xuong).filter((x): x is string => !!x))];
        const r = await client.query(
          `UPDATE xuong_cong_nhan SET active = false, to_id = NULL, cap_nhat = now()
           WHERE active AND xuong = ANY($1::text[]) AND NOT (mnv = ANY($2::text[]))`, [xs, hopLe.map(x => x.mnv)]);
        nghi = r.rowCount ?? 0;
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    res.json({
      success: true, available: true, daNap: hopLe.length, boQua: p.data.rows.length - hopLe.length, nghi,
      loi, toKhongKhop: [...toKhongKhop].slice(0, 30),
    });
  } catch (e) { fail(res, e, '/api/xuong/cong-nhan/nap'); }
});
