import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db.js';
import { app } from '../server/app.js';
import { invalidateUserAccess } from '../server/permissions.js';
import { LOAI_CA, pairKey } from '../server/xuong/types.js';
import {
  fail, xuongQuanLy, quanLyDuoc, ghiVaTinhLai, xoaCacheGioCong, HEX_RE, PERM_XUONG, type Row,
} from './xuong.js';
import { xoaGioCongLuu } from './xuongBaoCao.js';
import { baoHangChoNhan, baoXuongPhu } from './xuongThongBao.js';

// ============================================================================
// MỤC XƯỞNG — PHẦN MÁY TÍNH (T8, docs/designs/xuong-checkin.md)
//   GET  /api/xuong/setup?xuong=           thẻ Xưởng trong Setup: công đoạn, tổ, lịch ca, quản lý
//   POST /api/xuong/setup/cong-doan        thêm / sửa công đoạn
//   POST /api/xuong/setup/to               thêm / sửa tổ (tổ trưởng, công đoạn phụ trách, thành viên)
//   PUT  /api/xuong/setup/lich-ca          sửa lịch ca (giờ nghỉ trưa…) — '*' = mặc định mọi xưởng (chỉ admin)
//   DELETE /api/xuong/setup/lich-ca        bỏ lịch riêng của xưởng (quay về mặc định)
//   POST /api/xuong/setup/quan-ly          admin gán / bỏ quản lý xưởng
//   GET  /api/xuong/setup/nguoi-dung?q=    tìm tài khoản để gán tổ trưởng / quản lý
//   POST /api/xuong/huy                    quản lý huỷ một sự kiện từ máy tính (R7)
//   POST /api/xuong/hex-tom-tat            hạng mục đang ở công đoạn nào (cột trong HexDetailModal)
//   GET  /api/xuong/trien-khai?xuong=&q=   danh sách hạng mục của xưởng chính để triển khai (QT1/QT2, 7A)
//   POST /api/xuong/trien-khai             triển khai số lượng + tuyến → công đoạn đầu tiên thấy "Chờ nhận"
// Quyền: ADMIN mọi xưởng; quản lý xưởng (quyền xuong_quan_ly + bảng xuong_quan_ly) trong xưởng của mình.
// ============================================================================

const gioRe = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Xưởng người gọi được cấu hình; rỗng = không có quyền */
async function xuongDuocSua(req: Request) {
  const ds = await xuongQuanLy(req.user!.id);
  return { ds, admin: ds.has('*') };
}

const khongQuyen = (res: Response, msg = 'Chỉ admin hoặc quản lý xưởng này được thay đổi') =>
  res.status(403).json({ success: false, message: msg });

// ---------------------------------------------------------------------------
// GET /api/xuong/setup?xuong=
// ---------------------------------------------------------------------------
app.get('/api/xuong/setup', async (req: Request, res: Response) => {
  try {
    const { ds, admin } = await xuongDuocSua(req);
    if (!ds.size) return khongQuyen(res, 'Cần quyền quản lý xưởng');
    const tatCa = (await pool.query(
      `SELECT DISTINCT xuong FROM (SELECT xuong FROM xuong_cong_doan UNION SELECT xuong FROM xuong_to) x ORDER BY xuong`)).rows
      .map(x => String(x.xuong)).filter(x => admin || ds.has(x));
    const xuong = typeof req.query.xuong === 'string' && req.query.xuong ? req.query.xuong.toUpperCase() : tatCa[0] ?? null;
    if (!xuong) return res.json({ success: true, available: true, admin, dsXuong: tatCa, xuong: null });
    if (!quanLyDuoc(ds, xuong)) return khongQuyen(res);

    const [cd, to, tc, tv, lc, ql] = await Promise.all([
      pool.query(`SELECT id, xuong, ten_cd, cd_tach_ma, cd_chi_tiet, thu_tu, la_bao_bi, active FROM xuong_cong_doan
                  WHERE xuong = $1 ORDER BY thu_tu, cd_tach_ma, cd_chi_tiet`, [xuong]),
      pool.query(`SELECT t.id, t.ten_to, t.active, t.to_truong_user_id, u.full_name, u.username, u.msnv, u.permissions, u.role
                  FROM xuong_to t LEFT JOIN users u ON u.id = t.to_truong_user_id WHERE t.xuong = $1 ORDER BY t.ten_to`, [xuong]),
      pool.query(`SELECT tc.to_id, tc.cong_doan_id FROM xuong_to_cong_doan tc JOIN xuong_to t ON t.id = tc.to_id WHERE t.xuong = $1`, [xuong]),
      pool.query(`SELECT tv.to_id, tv.mnv FROM xuong_to_thanh_vien tv JOIN xuong_to t ON t.id = tv.to_id
                  WHERE t.xuong = $1 AND (tv.den_ngay IS NULL OR tv.den_ngay >= CURRENT_DATE) ORDER BY tv.mnv`, [xuong]),
      pool.query(`SELECT xuong, loai_ca, to_char(gio_bat_dau,'HH24:MI') AS bd, to_char(gio_ket_thuc,'HH24:MI') AS kt, nghi
                  FROM xuong_lich_ca WHERE xuong IN ($1, '*') ORDER BY xuong, loai_ca`, [xuong]),
      pool.query(`SELECT q.user_id, u.full_name, u.username FROM xuong_quan_ly q JOIN users u ON u.id = q.user_id
                  WHERE q.xuong = $1 ORDER BY u.full_name`, [xuong]),
    ]);
    const coQuyen = (r: Row) => r.role === 'ADMIN' || (Array.isArray(r.permissions) && r.permissions.includes(PERM_XUONG));
    res.json({
      success: true, available: true, admin, dsXuong: tatCa, xuong,
      congDoan: cd.rows.map(x => ({
        id: x.id, tenCd: x.ten_cd, cdTachMa: x.cd_tach_ma, ten: x.cd_chi_tiet, thuTu: x.thu_tu, laBaoBi: x.la_bao_bi, active: x.active,
      })),
      to: to.rows.map(x => ({
        id: Number(x.id), ten: x.ten_to, active: x.active,
        toTruong: x.to_truong_user_id ? {
          id: Number(x.to_truong_user_id), ten: x.full_name || x.username, msnv: x.msnv ?? null, coQuyenXuong: coQuyen(x),
        } : null,
        congDoan: tc.rows.filter(t => Number(t.to_id) === Number(x.id)).map(t => String(t.cong_doan_id)),
        thanhVien: tv.rows.filter(t => Number(t.to_id) === Number(x.id)).map(t => String(t.mnv)),
      })),
      lichCa: lc.rows.map(x => ({ xuong: x.xuong, loaiCa: x.loai_ca, gioBatDau: x.bd, gioKetThuc: x.kt, nghi: Array.isArray(x.nghi) ? x.nghi : [] })),
      quanLy: ql.rows.map(x => ({ userId: Number(x.user_id), ten: x.full_name || x.username })),
    });
  } catch (e) { fail(res, e, '/api/xuong/setup'); }
});

// ---------------------------------------------------------------------------
// GET /api/xuong/tong-quan?xuong= — quản lý xem nhanh trên điện thoại (D25): mỗi tổ quân số hôm nay, đang chạy,
// tạm ngưng, chờ nhận, chờ giao, cần xem, thao tác cuối hôm nay
// ---------------------------------------------------------------------------
app.get('/api/xuong/tong-quan', async (req: Request, res: Response) => {
  try {
    const { ds, admin } = await xuongDuocSua(req);
    if (!ds.size) return khongQuyen(res, 'Cần quyền quản lý xưởng');
    const dsXuong = (await pool.query(`SELECT DISTINCT xuong FROM xuong_to WHERE active ORDER BY xuong`)).rows
      .map(x => String(x.xuong)).filter(x => admin || ds.has(x));
    const xuong = typeof req.query.xuong === 'string' && req.query.xuong ? req.query.xuong.toUpperCase() : dsXuong[0] ?? null;
    if (!xuong) return res.json({ success: true, available: true, dsXuong, xuong: null, to: [] });
    if (!quanLyDuoc(ds, xuong)) return khongQuyen(res);
    const r = await pool.query(
      `WITH homnay AS (SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS d)
       SELECT t.id, t.ten_to, u.full_name AS to_truong,
         (SELECT (e.du_lieu->>'soNguoi')::int FROM xuong_su_kien e, homnay
            WHERE e.to_id = t.id AND e.loai = 'quan_so' AND e.du_lieu->>'loaiCa' IN ('chinh','chu_nhat')
              AND (e.device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = homnay.d
              AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id)
            ORDER BY e.device_ts_hieu_chinh DESC LIMIT 1) AS quan_so,
         count(s.*) FILTER (WHERE s.trang_thai = 'dang_lam')::int AS dang_chay,
         count(s.*) FILTER (WHERE s.trang_thai = 'tam_ngung')::int AS tam_ngung,
         count(s.*) FILTER (WHERE s.sl_giao_den > s.sl_nhan)::int AS cho_nhan,
         count(s.*) FILTER (WHERE s.sl_hoan_thanh > s.sl_giao)::int AS cho_giao,
         count(s.*) FILTER (WHERE s.co <> '{}')::int AS can_xem,
         (SELECT max(e.server_ts) FROM xuong_su_kien e, homnay WHERE e.to_id = t.id
            AND (e.device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = homnay.d) AS thao_tac_cuoi
       FROM xuong_to t
       LEFT JOIN users u ON u.id = t.to_truong_user_id
       LEFT JOIN xuong_to_cong_doan tc ON tc.to_id = t.id
       LEFT JOIN xuong_trang_thai s ON s.cong_doan_id = tc.cong_doan_id AND s.trang_thai <> 'xong'
       WHERE t.xuong = $1 AND t.active
       GROUP BY t.id, t.ten_to, u.full_name
       ORDER BY t.ten_to`, [xuong]);
    res.json({
      success: true, available: true, dsXuong, xuong,
      to: r.rows.map(x => ({
        id: Number(x.id), ten: x.ten_to, toTruong: x.to_truong ?? null, quanSo: x.quan_so === null ? null : Number(x.quan_so),
        dangChay: x.dang_chay, tamNgung: x.tam_ngung, choNhan: x.cho_nhan, choGiao: x.cho_giao, canXem: x.can_xem,
        thaoTacCuoi: x.thao_tac_cuoi,
      })),
    });
  } catch (e) { fail(res, e, '/api/xuong/tong-quan'); }
});

// ---------------------------------------------------------------------------
// Công đoạn
// ---------------------------------------------------------------------------
const congDoanSchema = z.object({
  id: z.string().max(40).optional(),
  xuong: z.string().trim().min(1).max(20),
  tenCd: z.string().trim().min(1).max(200),
  cdTachMa: z.string().trim().max(200).nullish(),
  ten: z.string().trim().min(1).max(200),
  thuTu: z.number().int().min(0).max(999),
  laBaoBi: z.boolean(),
  active: z.boolean(),
});

app.post('/api/xuong/setup/cong-doan', async (req: Request, res: Response) => {
  try {
    const p = congDoanSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ success: false, message: 'Thiếu tên công đoạn / xưởng / thứ tự' });
    const d = { ...p.data, xuong: p.data.xuong.toUpperCase() };
    const { ds } = await xuongDuocSua(req);
    if (!quanLyDuoc(ds, d.xuong)) return khongQuyen(res);
    if (d.id) {
      const cu = await pool.query('SELECT xuong FROM xuong_cong_doan WHERE id = $1', [d.id]);
      if (!cu.rows[0]) return res.status(404).json({ success: false, message: 'Không tìm thấy công đoạn' });
      if (cu.rows[0].xuong !== d.xuong) return res.status(400).json({ success: false, message: 'Không đổi được xưởng của công đoạn đã có' });
      await pool.query(
        `UPDATE xuong_cong_doan SET ten_cd = $2, cd_tach_ma = $3, cd_chi_tiet = $4, thu_tu = $5, la_bao_bi = $6, active = $7 WHERE id = $1`,
        [d.id, d.tenCd, d.cdTachMa ?? null, d.ten, d.thuTu, d.laBaoBi, d.active]);
      return res.json({ success: true, available: true, id: d.id });
    }
    const id = `CD-${d.xuong}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    await pool.query(
      `INSERT INTO xuong_cong_doan (id, xuong, ten_cd, cd_tach_ma, cd_chi_tiet, thu_tu, la_bao_bi, active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, d.xuong, d.tenCd, d.cdTachMa ?? null, d.ten, d.thuTu, d.laBaoBi, d.active]);
    res.json({ success: true, available: true, id });
  } catch (e) { fail(res, e, '/api/xuong/setup/cong-doan'); }
});

// ---------------------------------------------------------------------------
// Tổ
// ---------------------------------------------------------------------------
const toSchema = z.object({
  id: z.number().int().positive().optional(),
  xuong: z.string().trim().min(1).max(20),
  ten: z.string().trim().min(1).max(200),
  toTruongUserId: z.number().int().positive().nullable(),
  congDoan: z.array(z.string().max(40)).max(50),
  thanhVien: z.array(z.string().trim().min(1).max(20)).max(300),
  active: z.boolean(),
  /** Admin: cấp luôn quyền 'xuong' cho tổ trưởng chưa có */
  capQuyen: z.boolean().optional(),
});

app.post('/api/xuong/setup/to', async (req: Request, res: Response) => {
  try {
    const p = toSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ success: false, message: 'Dữ liệu tổ không hợp lệ' });
    const d = { ...p.data, xuong: p.data.xuong.toUpperCase(), thanhVien: [...new Set(p.data.thanhVien.map(x => x.toUpperCase()))] };
    const { ds, admin } = await xuongDuocSua(req);
    if (!quanLyDuoc(ds, d.xuong)) return khongQuyen(res);
    if (d.capQuyen && !admin) return khongQuyen(res, 'Chỉ admin được cấp quyền tài khoản');

    const kq = await withTransaction(async client => {
      const cds = d.congDoan.length
        ? (await client.query('SELECT id FROM xuong_cong_doan WHERE id = ANY($1::text[]) AND xuong = $2', [d.congDoan, d.xuong])).rows
        : [];
      if (cds.length !== d.congDoan.length) return { loi: 'Công đoạn phụ trách phải thuộc xưởng của tổ' } as const;
      let id = d.id;
      if (id) {
        const cu = await client.query('SELECT xuong FROM xuong_to WHERE id = $1', [id]);
        if (!cu.rows[0]) return { loi: 'Không tìm thấy tổ' } as const;
        if (cu.rows[0].xuong !== d.xuong) return { loi: 'Không đổi được xưởng của tổ đã có' } as const;
        await client.query('UPDATE xuong_to SET ten_to = $2, to_truong_user_id = $3, active = $4 WHERE id = $1',
          [id, d.ten, d.toTruongUserId, d.active]);
      } else {
        id = Number((await client.query(
          'INSERT INTO xuong_to (xuong, ten_to, to_truong_user_id, active) VALUES ($1,$2,$3,$4) RETURNING id',
          [d.xuong, d.ten, d.toTruongUserId, d.active])).rows[0].id);
      }
      await client.query('DELETE FROM xuong_to_cong_doan WHERE to_id = $1 AND NOT (cong_doan_id = ANY($2::text[]))', [id, d.congDoan]);
      if (d.congDoan.length) {
        await client.query(
          `INSERT INTO xuong_to_cong_doan (to_id, cong_doan_id) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`, [id, d.congDoan]);
      }
      // Thành viên: người rời tổ đóng lại từ hôm qua (giữ lịch sử); người mới mở từ hôm nay
      await client.query(
        `UPDATE xuong_to_thanh_vien SET den_ngay = CURRENT_DATE - 1
         WHERE to_id = $1 AND (den_ngay IS NULL OR den_ngay >= CURRENT_DATE) AND NOT (mnv = ANY($2::text[]))`, [id, d.thanhVien]);
      if (d.thanhVien.length) {
        await client.query(
          `INSERT INTO xuong_to_thanh_vien (to_id, mnv, tu_ngay)
           SELECT $1, m, CURRENT_DATE FROM unnest($2::text[]) m
           WHERE NOT EXISTS (SELECT 1 FROM xuong_to_thanh_vien x WHERE x.to_id = $1 AND x.mnv = m AND (x.den_ngay IS NULL OR x.den_ngay >= CURRENT_DATE))
           ON CONFLICT (to_id, mnv, tu_ngay) DO UPDATE SET den_ngay = NULL`, [id, d.thanhVien]);
      }
      if (d.capQuyen && d.toTruongUserId) {
        await client.query(
          `UPDATE users SET permissions = array_append(COALESCE(permissions, '{}'), $2)
           WHERE id = $1 AND NOT ($2 = ANY(COALESCE(permissions, '{}')))`, [d.toTruongUserId, PERM_XUONG]);
      }
      return { id } as const;
    });
    if ('loi' in kq) return res.status(400).json({ success: false, message: kq.loi });
    if (d.capQuyen && d.toTruongUserId) invalidateUserAccess(d.toTruongUserId);
    res.json({ success: true, available: true, id: kq.id });
  } catch (e) {
    if ((e as { code?: string })?.code === '23505') return res.status(400).json({ success: false, message: 'Xưởng đã có tổ trùng tên' });
    fail(res, e, '/api/xuong/setup/to');
  }
});

// ---------------------------------------------------------------------------
// Lịch ca
// ---------------------------------------------------------------------------
const lichCaSchema = z.object({
  xuong: z.string().trim().min(1).max(20),
  loaiCa: z.enum(LOAI_CA),
  gioBatDau: z.string().regex(gioRe),
  gioKetThuc: z.string().regex(gioRe),
  nghi: z.array(z.tuple([z.string().regex(gioRe), z.string().regex(gioRe)])).max(6),
});

app.put('/api/xuong/setup/lich-ca', async (req: Request, res: Response) => {
  try {
    const p = lichCaSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ success: false, message: 'Giờ phải dạng HH:MM' });
    const d = { ...p.data, xuong: p.data.xuong === '*' ? '*' : p.data.xuong.toUpperCase() };
    const { ds, admin } = await xuongDuocSua(req);
    if (d.xuong === '*' ? !admin : !quanLyDuoc(ds, d.xuong)) return khongQuyen(res, d.xuong === '*' ? 'Chỉ admin sửa lịch mặc định' : undefined);
    await pool.query(
      `INSERT INTO xuong_lich_ca (xuong, loai_ca, gio_bat_dau, gio_ket_thuc, nghi) VALUES ($1,$2,$3,$4,$5::jsonb)
       ON CONFLICT (xuong, loai_ca) DO UPDATE SET gio_bat_dau = EXCLUDED.gio_bat_dau, gio_ket_thuc = EXCLUDED.gio_ket_thuc, nghi = EXCLUDED.nghi`,
      [d.xuong, d.loaiCa, d.gioBatDau, d.gioKetThuc, JSON.stringify(d.nghi)]);
    xoaCacheGioCong();
    await xoaGioCongLuu(d.xuong);
    res.json({ success: true, available: true });
  } catch (e) { fail(res, e, '/api/xuong/setup/lich-ca'); }
});

app.delete('/api/xuong/setup/lich-ca', async (req: Request, res: Response) => {
  try {
    const xuong = String(req.body?.xuong ?? '').toUpperCase();
    const loaiCa = String(req.body?.loaiCa ?? '');
    if (!xuong || xuong === '*' || !(LOAI_CA as readonly string[]).includes(loaiCa)) {
      return res.status(400).json({ success: false, message: 'Chỉ bỏ được lịch riêng của một xưởng' });
    }
    const { ds } = await xuongDuocSua(req);
    if (!quanLyDuoc(ds, xuong)) return khongQuyen(res);
    await pool.query('DELETE FROM xuong_lich_ca WHERE xuong = $1 AND loai_ca = $2', [xuong, loaiCa]);
    xoaCacheGioCong();
    await xoaGioCongLuu(xuong);
    res.json({ success: true, available: true });
  } catch (e) { fail(res, e, '/api/xuong/setup/lich-ca'); }
});

// ---------------------------------------------------------------------------
// Quản lý xưởng (admin) + tìm người dùng
// ---------------------------------------------------------------------------
app.post('/api/xuong/setup/quan-ly', async (req: Request, res: Response) => {
  try {
    const { admin } = await xuongDuocSua(req);
    if (!admin) return khongQuyen(res, 'Chỉ admin gán quản lý xưởng');
    const userId = Number(req.body?.userId);
    const xuong = String(req.body?.xuong ?? '').toUpperCase();
    if (!Number.isInteger(userId) || userId <= 0 || !xuong) return res.status(400).json({ success: false, message: 'Thiếu người / xưởng' });
    if (req.body?.bo) {
      await pool.query('DELETE FROM xuong_quan_ly WHERE user_id = $1 AND xuong = $2', [userId, xuong]);
    } else {
      await pool.query('INSERT INTO xuong_quan_ly (user_id, xuong) VALUES ($1,$2) ON CONFLICT DO NOTHING', [userId, xuong]);
      // Quản lý cần quyền xuong_quan_ly để qua kiểm tra quyền chung
      await pool.query(
        `UPDATE users SET permissions = array_append(COALESCE(permissions, '{}'), 'xuong_quan_ly')
         WHERE id = $1 AND NOT ('xuong_quan_ly' = ANY(COALESCE(permissions, '{}')))`, [userId]);
    }
    invalidateUserAccess(userId);
    res.json({ success: true, available: true });
  } catch (e) { fail(res, e, '/api/xuong/setup/quan-ly'); }
});

app.get('/api/xuong/setup/nguoi-dung', async (req: Request, res: Response) => {
  try {
    const { ds } = await xuongDuocSua(req);
    if (!ds.size) return khongQuyen(res, 'Cần quyền quản lý xưởng');
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) return res.json({ success: true, available: true, ketQua: [] });
    const mau = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
    const r = await pool.query(
      `SELECT id, full_name, username, msnv, role, permissions FROM users
       WHERE is_active AND (full_name ILIKE $1 OR username ILIKE $1 OR msnv ILIKE $1) ORDER BY full_name LIMIT 20`, [mau]);
    res.json({
      success: true, available: true,
      ketQua: r.rows.map(x => ({
        id: Number(x.id), ten: x.full_name || x.username, username: x.username, msnv: x.msnv ?? null,
        coQuyenXuong: x.role === 'ADMIN' || (Array.isArray(x.permissions) && x.permissions.includes(PERM_XUONG)),
      })),
    });
  } catch (e) { fail(res, e, '/api/xuong/setup/nguoi-dung'); }
});

// ---------------------------------------------------------------------------
// POST /api/xuong/huy — quản lý huỷ sự kiện từ máy tính (R7: quản lý xưởng huỷ được mọi lúc)
// ---------------------------------------------------------------------------
const dongServer = (p: Partial<Row> & { loai: string }, userId: number): Row => {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(), hex: null, cong_doan_id: null, to_id: null, xuong: null, so_luong: null, cong_doan_den_id: null,
    cong_doan_nguon_id: null, xuong_nguon: null, so_nguoi: null, ly_do_tam_ngung: null, tien_do: null, ghi_chu: null,
    du_lieu: null, device_ts: now, lech_ms: 0, device_ts_hieu_chinh: now, user_id: userId, user_id_khai: null,
    sent_by: userId, device_id: null, sua_cho: null, co: [], ...p,
  };
};

app.post('/api/xuong/huy', async (req: Request, res: Response) => {
  try {
    const id = String(req.body?.suKienId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ success: false, message: 'Thiếu sự kiện cần huỷ' });
    const me = Number(req.user!.id);
    const kq = await withTransaction(async client => {
      const d = (await client.query('SELECT id, loai, hex, cong_doan_id, to_id, xuong FROM xuong_su_kien WHERE id = $1', [id])).rows[0];
      if (!d) return { loi: 'Không tìm thấy sự kiện', ma: 404 } as const;
      if (!quanLyDuoc(await xuongQuanLy(me), d.xuong ?? null)) return { loi: 'Chỉ quản lý xưởng được huỷ từ máy tính', ma: 403 } as const;
      const da = await client.query(`SELECT 1 FROM xuong_su_kien WHERE loai = 'huy' AND sua_cho = $1 LIMIT 1`, [id]);
      if (da.rows.length) return { loi: 'Sự kiện đã được huỷ', ma: 400 } as const;
      await ghiVaTinhLai(client, [dongServer({
        loai: 'huy', sua_cho: id, hex: d.hex, cong_doan_id: d.cong_doan_id, to_id: d.to_id, xuong: d.xuong,
        ghi_chu: typeof req.body?.lyDo === 'string' ? req.body.lyDo.slice(0, 500) : null,
      }, me)], [d]);
      return { ok: true, ma: 200 } as const;
    });
    if ('loi' in kq) return res.status(kq.ma).json({ success: false, message: kq.loi });
    res.json({ success: true, available: true });
  } catch (e) { fail(res, e, '/api/xuong/huy'); }
});

// ---------------------------------------------------------------------------
// POST /api/xuong/hex-tom-tat {hexes} — hạng mục đang ở công đoạn nào (mọi người đã đăng nhập xem được, như /hex/:hex)
// ---------------------------------------------------------------------------
app.post('/api/xuong/hex-tom-tat', async (req: Request, res: Response) => {
  try {
    const hexes = Array.isArray(req.body?.hexes)
      ? [...new Set((req.body.hexes as unknown[]).map(String).filter(h => HEX_RE.test(h)))].slice(0, 1000) : [];
    if (!hexes.length) return res.json({ success: true, available: true, tomTat: {} });
    const r = await pool.query(
      `SELECT t.hex, t.xuong, t.trang_thai, c.cd_chi_tiet FROM xuong_trang_thai t
       LEFT JOIN xuong_cong_doan c ON c.id = t.cong_doan_id WHERE t.hex = ANY($1::text[])`, [hexes]);
    const tomTat: Record<string, { soCongDoan: number; dangO: Array<{ xuong: string | null; ten: string | null; trangThai: string }> }> = {};
    for (const x of r.rows) {
      const k = String(x.hex);
      tomTat[k] ??= { soCongDoan: 0, dangO: [] };
      tomTat[k].soCongDoan++;
      if (x.trang_thai !== 'xong') tomTat[k].dangO.push({ xuong: x.xuong, ten: x.cd_chi_tiet, trangThai: x.trang_thai });
    }
    res.json({ success: true, available: true, tomTat });
  } catch (e) { fail(res, e, '/api/xuong/hex-tom-tat'); }
});

// ---------------------------------------------------------------------------
// Triển khai hạng mục (QT1 / QT2 gộp — cải tiến 8, quyết định 7A)
// ---------------------------------------------------------------------------
app.get('/api/xuong/trien-khai', async (req: Request, res: Response) => {
  try {
    const xuong = String(req.query.xuong ?? '').toUpperCase();
    const { ds } = await xuongDuocSua(req);
    if (!xuong || !quanLyDuoc(ds, xuong)) return khongQuyen(res, 'Cần quyền quản lý xưởng này');
    const q = String(req.query.q ?? '').trim();
    const chiChua = req.query.chua === '1';
    const hexLoc = typeof req.query.hex === 'string' && HEX_RE.test(req.query.hex) ? req.query.hex : null;
    const params: unknown[] = [xuong];
    let dk = `UPPER(TRIM(xuong_chinh)) = $1 AND hex IS NOT NULL AND COALESCE(tam_ngung_huy_don_hang_tong, '') = ''`;
    if (hexLoc) { params.push(hexLoc); dk += ` AND hex::text = $${params.length}`; }
    else if (q) {
      params.push(`%${q.replace(/[%_\\]/g, '\\$&')}%`);
      dk += ` AND (hex::text ILIKE $${params.length} OR ten_hang_muc ILIKE $${params.length} OR ten_cong_trinh ILIKE $${params.length} OR ma_cong_trinh ILIKE $${params.length})`;
    }
    const sp = await pool.query(
      `SELECT * FROM (SELECT DISTINCT ON (hex::text) hex::text AS hex, ten_hang_muc, ma_cong_trinh, ten_cong_trinh, dvt,
              so_luong_don_hang_tong, phan_loai_nhom_san_pham, xuong_chinh, updated_at
       FROM production_status_app WHERE ${dk} ORDER BY hex::text, updated_at DESC NULLS LAST) t
       ORDER BY updated_at DESC NULLS LAST, hex DESC LIMIT 300`, params);
    const hexes = sp.rows.map(x => String(x.hex));
    const [tk, cd, lanTruoc] = await Promise.all([
      hexes.length ? pool.query(
        `SELECT hex, sum(so_luong)::float AS sl FROM xuong_su_kien e WHERE loai = 'trien_khai' AND hex = ANY($1::text[])
           AND du_lieu->>'xuong' = $2 AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id)
         GROUP BY hex`, [hexes, xuong]) : Promise.resolve({ rows: [] as Row[] }),
      pool.query(`SELECT id, xuong, cd_chi_tiet, cd_tach_ma, thu_tu FROM xuong_cong_doan WHERE active ORDER BY xuong, thu_tu, cd_chi_tiet`),
      // Tuyến lần triển khai gần nhất theo nhóm sản phẩm (gợi ý — cải tiến 8)
      pool.query(
        `SELECT DISTINCT ON (p.phan_loai_nhom_san_pham) p.phan_loai_nhom_san_pham AS nhom, e.du_lieu->'tuyen' AS tuyen
         FROM xuong_su_kien e JOIN LATERAL (SELECT phan_loai_nhom_san_pham FROM production_status_app WHERE hex::text = e.hex LIMIT 1) p ON true
         WHERE e.loai = 'trien_khai' AND e.du_lieu->>'xuong' = $1 AND jsonb_typeof(e.du_lieu->'tuyen') = 'array'
           AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id)
         ORDER BY p.phan_loai_nhom_san_pham, e.device_ts_hieu_chinh DESC`, [xuong]),
    ]);
    const daTk = new Map(tk.rows.map(x => [String(x.hex), Number(x.sl)]));
    const goiY = new Map(lanTruoc.rows.map(x => [String(x.nhom ?? ''), (x.tuyen as unknown[]).map(String)]));
    const ds2 = sp.rows.map(x => ({
      hex: String(x.hex), ten: x.ten_hang_muc, maCongTrinh: x.ma_cong_trinh, tenCongTrinh: x.ten_cong_trinh, dvt: x.dvt,
      soLuongDonHang: x.so_luong_don_hang_tong === null ? null : Number(x.so_luong_don_hang_tong),
      nhom: x.phan_loai_nhom_san_pham ?? null,
      daTrienKhai: daTk.get(String(x.hex)) ?? 0,
      goiYTuyen: goiY.get(String(x.phan_loai_nhom_san_pham ?? '')) ?? null,
    })).filter(x => !chiChua || x.soLuongDonHang === null || x.daTrienKhai < x.soLuongDonHang);
    res.json({
      success: true, available: true, xuong,
      hangMuc: ds2,
      congDoan: cd.rows.map(x => ({ id: x.id, xuong: x.xuong, ten: x.cd_chi_tiet, cdTachMa: x.cd_tach_ma, thuTu: x.thu_tu })),
    });
  } catch (e) { fail(res, e, '/api/xuong/trien-khai'); }
});

const trienKhaiSchema = z.object({
  xuong: z.string().trim().min(1).max(20),
  items: z.array(z.object({
    hex: z.string().regex(HEX_RE),
    soLuong: z.number().positive().max(1_000_000),
    tuyen: z.array(z.string().max(40)).min(1).max(30),
  })).min(1).max(200),
});

app.post('/api/xuong/trien-khai', async (req: Request, res: Response) => {
  try {
    const p = trienKhaiSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ success: false, message: 'Mỗi hạng mục cần mã 9 số, số lượng > 0 và ít nhất một công đoạn' });
    const xuong = p.data.xuong.toUpperCase();
    const me = Number(req.user!.id);
    const { ds } = await xuongDuocSua(req);
    if (!quanLyDuoc(ds, xuong)) return khongQuyen(res, 'Cần quyền quản lý xưởng này');
    const kq = await withTransaction(async client => {
      const cdIds = [...new Set(p.data.items.flatMap(i => i.tuyen))];
      const cd = await client.query('SELECT id, xuong FROM xuong_cong_doan WHERE id = ANY($1::text[]) AND active', [cdIds]);
      const xuongCd = new Map(cd.rows.map(x => [String(x.id), String(x.xuong)]));
      const thieu = cdIds.filter(id => !xuongCd.has(id));
      if (thieu.length) return { loi: `Công đoạn không tồn tại / đã tắt: ${thieu.join(', ')}` } as const;
      const ghi: Row[] = [];
      for (const it of p.data.items) {
        ghi.push(dongServer({ loai: 'trien_khai', hex: it.hex, xuong, so_luong: it.soLuong, du_lieu: { xuong, tuyen: it.tuyen } }, me));
        ghi.push(dongServer({
          loai: 'khai_bao_cd', hex: it.hex, xuong: xuongCd.get(it.tuyen[0]) ?? xuong, so_luong: it.soLuong, cong_doan_den_id: it.tuyen[0],
          du_lieu: { xuongTrienKhai: xuong },
        }, me));
      }
      await ghiVaTinhLai(client, ghi);
      return { so: p.data.items.length } as const;
    });
    if ('loi' in kq) return res.status(400).json({ success: false, message: kq.loi });
    // Thông báo: tổ đầu tuyến có hàng chờ nhận; xưởng phụ được giao công đoạn
    await baoHangChoNhan(p.data.items.map(i => ({ hex: i.hex, congDoanDenId: i.tuyen[0], soLuong: i.soLuong })), me);
    await baoXuongPhu(xuong, p.data.items, me);
    res.json({ success: true, available: true, soHangMuc: kq.so, cap: p.data.items.map(i => pairKey(i.hex, i.tuyen[0])) });
  } catch (e) { fail(res, e, '/api/xuong/trien-khai'); }
});
