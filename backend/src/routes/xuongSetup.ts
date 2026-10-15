import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db.js';
import { app } from '../server/app.js';
import { invalidateUserAccess } from '../server/permissions.js';
import { LOAI_CA, pairKey } from '../server/xuong/types.js';
import {
  fail, xuongQuanLy, quanLyDuoc, phamViXem, toTruongCua, ghiVaTinhLai, suaChoGiaoCuoiTuyen, xoaCacheGioCong, HEX_RE, PERM_XUONG, type Row,
  coBangCongNhan, COT_SU_KIEN, toSuKien, lichCaCuaXuong, suKienTheoHex, thongTinHangMuc,
} from './xuong.js';
import { suKienConHieuLuc, THANH_PHAN, tuyenTheoThanhPhan } from '../server/xuong/state.js';
import { ensureWorkshopGroups, workshopGroupSql } from '../server/workshopGroups.js';
import { doanCoMat, tomTatDiemDanh } from '../server/xuong/chamCong.js';
import { vnDayKey } from '../server/common.js';
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
    // Tổ trưởng (kể cả có quyền quản lý): chỉ xem số liệu tổ mình — danh sách xưởng = xưởng có tổ của mình
    const toTruong = admin ? [] : await toTruongCua(req.user!.id);
    if (!ds.size && !toTruong.length) return khongQuyen(res, 'Cần quyền quản lý xưởng');
    const tatCa = toTruong.length ? [...new Set(toTruong.map(t => t.xuong))].sort() : (await pool.query(
      `SELECT DISTINCT xuong FROM (SELECT xuong FROM xuong_cong_doan UNION SELECT xuong FROM xuong_to) x ORDER BY xuong`)).rows
      .map(x => String(x.xuong)).filter(x => admin || ds.has(x));
    const yeuCau = typeof req.query.xuong === 'string' && req.query.xuong ? req.query.xuong.toUpperCase() : null;
    const xuong = yeuCau && tatCa.includes(yeuCau) ? yeuCau : yeuCau && !toTruong.length ? yeuCau : tatCa[0] ?? null;
    if (!xuong) return res.json({ success: true, available: true, admin, dsXuong: tatCa, xuong: null, chiTo: null });
    const chiTo = toTruong.length ? toTruong.filter(t => t.xuong === xuong).map(t => t.id) : null;
    if (!chiTo && !quanLyDuoc(ds, xuong)) return khongQuyen(res);

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
    const toXem = chiTo ? to.rows.filter(x => chiTo.includes(Number(x.id))) : to.rows;
    res.json({
      success: true, available: true, admin, dsXuong: tatCa, xuong, chiTo,
      congDoan: cd.rows.map(x => ({
        id: x.id, tenCd: x.ten_cd, cdTachMa: x.cd_tach_ma, ten: x.cd_chi_tiet, thuTu: x.thu_tu, laBaoBi: x.la_bao_bi, active: x.active,
      })),
      to: toXem.map(x => ({
        id: Number(x.id), ten: x.ten_to, active: x.active,
        toTruong: x.to_truong_user_id ? {
          id: Number(x.to_truong_user_id), ten: x.full_name || x.username, msnv: x.msnv ?? null, coQuyenXuong: coQuyen(x),
        } : null,
        congDoan: tc.rows.filter(t => Number(t.to_id) === Number(x.id)).map(t => String(t.cong_doan_id)),
        thanhVien: tv.rows.filter(t => Number(t.to_id) === Number(x.id)).map(t => String(t.mnv)),
      })),
      lichCa: lc.rows.map(x => ({ xuong: x.xuong, loaiCa: x.loai_ca, gioBatDau: x.bd, gioKetThuc: x.kt, nghi: Array.isArray(x.nghi) ? x.nghi : [] })),
      quanLy: chiTo ? [] : ql.rows.map(x => ({ userId: Number(x.user_id), ten: x.full_name || x.username })),
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
    // Dòng cũ còn "chờ giao" ở công đoạn cuối tuyến (trước khi có quy tắc cuối tuyến = xong): tính lại
    await suaChoGiaoCuoiTuyen((await pool.query(`SELECT hex, cong_doan_id FROM xuong_trang_thai WHERE xuong = $1 AND trang_thai = 'cho_giao' LIMIT 500`, [xuong]))
      .rows.map(x => [String(x.hex), String(x.cong_doan_id)] as [string, string]));
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
    // Chấm công hôm nay theo tổ: có mặt / tổng danh sách, vắng, trễ, về sớm (ca chính / Chủ nhật)
    type NguoiDd = { mnv: string; hoTen: string };
    const diemDanh = new Map<number, {
      daDiemDanh: boolean; coMat: number; tong: number; vang: NguoiDd[];
      tre: Array<NguoiDd & { phut: number }>; veSom: Array<NguoiDd & { luc: number }>;
    }>();
    if (r.rows.length && await coBangCongNhan()) {
      const ids = r.rows.map(x => Number(x.id));
      const ngay = vnDayKey(new Date());
      const now = Date.now();
      const [ev, ds2, lichCa] = await Promise.all([
        pool.query(
          `SELECT ${COT_SU_KIEN} FROM xuong_su_kien e WHERE to_id = ANY($1::int[]) AND loai IN ('vao_ca','ra_ca')
             AND (device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $2::date`, [ids, ngay]),
        pool.query(`SELECT mnv, ho_ten, to_id FROM xuong_cong_nhan WHERE active AND to_id = ANY($1::int[])`, [ids]),
        lichCaCuaXuong(xuong),
      ]);
      const ten = new Map<string, string>(ds2.rows.map(x => [String(x.mnv), String(x.ho_ten)]));
      // Người mượn (không thuộc tổ) cũng cần tên
      const thieu = [...new Set(ev.rows.flatMap(x => (Array.isArray(x.du_lieu?.nguoi) ? x.du_lieu.nguoi : []).map((n: { mnv?: string }) => String(n?.mnv ?? ''))))]
        .filter(m => m && !ten.has(m));
      if (thieu.length) {
        for (const x of (await pool.query('SELECT mnv, ho_ten FROM xuong_cong_nhan WHERE mnv = ANY($1::text[])', [thieu])).rows) ten.set(String(x.mnv), String(x.ho_ten));
      }
      const tenCua = (m: string) => ten.get(m) ?? m;
      const theoTo = new Map<number, Row[]>();
      for (const x of ev.rows) { const k = Number(x.to_id); if (!theoTo.has(k)) theoTo.set(k, []); theoTo.get(k)!.push(x); }
      for (const id of ids) {
        const coMat = doanCoMat(suKienConHieuLuc((theoTo.get(id) ?? []).map(toSuKien)));
        const caChinh = [...(coMat.chinh ?? []), ...(coMat.chu_nhat ?? [])];
        const daDiemDanh = caChinh.length > 0;
        const dangCo = new Set(caChinh.filter(d => d.end === null || d.end > now).map(d => d.mnv));
        const tomTat = tomTatDiemDanh({ chinh: coMat.chinh ?? [] }, ngay, lichCa);
        const doi = ds2.rows.filter(x => Number(x.to_id) === id).map(x => String(x.mnv));
        const daTung = new Set(caChinh.map(d => d.mnv));
        diemDanh.set(id, {
          daDiemDanh, coMat: dangCo.size, tong: doi.length,
          vang: daDiemDanh ? doi.filter(m => !daTung.has(m)).map(m => ({ mnv: m, hoTen: tenCua(m) })) : [],
          tre: Object.entries(tomTat).filter(([, v]) => v.treP > 0).map(([m, v]) => ({ mnv: m, hoTen: tenCua(m), phut: v.treP })),
          veSom: caChinh.filter(d => d.end !== null && d.end <= now && !dangCo.has(d.mnv)).map(d => ({ mnv: d.mnv, hoTen: tenCua(d.mnv), luc: d.end! })),
        });
      }
    }
    res.json({
      success: true, available: true, dsXuong, xuong,
      to: r.rows.map(x => ({
        id: Number(x.id), ten: x.ten_to, toTruong: x.to_truong ?? null, quanSo: x.quan_so === null ? null : Number(x.quan_so),
        dangChay: x.dang_chay, tamNgung: x.tam_ngung, choNhan: x.cho_nhan, choGiao: x.cho_giao, canXem: x.can_xem,
        thaoTacCuoi: x.thao_tac_cuoi, diemDanh: diemDanh.get(Number(x.id)) ?? null,
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
        `SELECT DISTINCT ON (p.phan_loai_nhom_san_pham) p.phan_loai_nhom_san_pham AS nhom, e.du_lieu->'tuyen' AS tuyen,
                e.du_lieu->'thanhPhan' AS thanh_phan
         FROM xuong_su_kien e JOIN LATERAL (SELECT phan_loai_nhom_san_pham FROM production_status_app WHERE hex::text = e.hex LIMIT 1) p ON true
         WHERE e.loai = 'trien_khai' AND e.du_lieu->>'xuong' = $1
           AND (jsonb_typeof(e.du_lieu->'tuyen') = 'array' OR jsonb_typeof(e.du_lieu->'thanhPhan') = 'array')
           AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id)
         ORDER BY p.phan_loai_nhom_san_pham, e.device_ts_hieu_chinh DESC`, [xuong]),
    ]);
    const daTk = new Map(tk.rows.map(x => [String(x.hex), Number(x.sl)]));
    // Gợi ý theo lần triển khai trước của cùng nhóm sản phẩm: các thành phần (bản cũ chỉ có 1 tuyến => 1 thành phần GỖ)
    const goiY = new Map(lanTruoc.rows.map(x => [String(x.nhom ?? ''), Array.isArray(x.thanh_phan)
      ? (x.thanh_phan as Array<Record<string, unknown>>).map(t => ({ ten: String(t.ten ?? ''), xuong: String(t.xuong ?? xuong), tuyen: Array.isArray(t.tuyen) ? (t.tuyen as unknown[]).map(String) : [] }))
      : [{ ten: 'GỖ', xuong, tuyen: ((x.tuyen as unknown[]) ?? []).map(String) }]]));
    const ds2 = sp.rows.map(x => ({
      hex: String(x.hex), ten: x.ten_hang_muc, maCongTrinh: x.ma_cong_trinh, tenCongTrinh: x.ten_cong_trinh, dvt: x.dvt,
      soLuongDonHang: x.so_luong_don_hang_tong === null ? null : Number(x.so_luong_don_hang_tong),
      nhom: x.phan_loai_nhom_san_pham ?? null,
      daTrienKhai: daTk.get(String(x.hex)) ?? 0,
      goiYThanhPhan: goiY.get(String(x.phan_loai_nhom_san_pham ?? '')) ?? null,
    })).filter(x => !chiChua || x.soLuongDonHang === null || x.daTrienKhai < x.soLuongDonHang);
    res.json({
      success: true, available: true, xuong,
      hangMuc: ds2,
      congDoan: cd.rows.map(x => ({ id: x.id, xuong: x.xuong, ten: x.cd_chi_tiet, cdTachMa: x.cd_tach_ma, thuTu: x.thu_tu })),
      thanhPhan: THANH_PHAN,
    });
  } catch (e) { fail(res, e, '/api/xuong/trien-khai'); }
});

// Thành phần (QT1): tên (Gỗ / Sofa / Kim loại / Kính / Đá), xưởng thực hiện, tuyến CĐ chi tiết. Xưởng phụ để trống tuyến
// thì xưởng phụ tự khai ở QT2 (/api/xuong/khai-chi-tiet). Bản cũ gửi `tuyen` (1 tuyến) => 1 thành phần GỖ của xưởng chính.
const thanhPhanSchema = z.object({
  ten: z.enum(THANH_PHAN),
  xuong: z.string().trim().min(1).max(20),
  tuyen: z.array(z.string().max(40)).max(30),
});
const trienKhaiSchema = z.object({
  xuong: z.string().trim().min(1).max(20),
  items: z.array(z.object({
    hex: z.string().regex(HEX_RE),
    soLuong: z.number().positive().max(1_000_000),
    tuyen: z.array(z.string().max(40)).min(1).max(30).optional(),
    thanhPhan: z.array(thanhPhanSchema).min(1).max(THANH_PHAN.length).optional(),
  }).refine(i => !!i.tuyen || !!i.thanhPhan)).min(1).max(200),
});

app.post('/api/xuong/trien-khai', async (req: Request, res: Response) => {
  try {
    const p = trienKhaiSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ success: false, message: 'Mỗi hạng mục cần mã 9 số, số lượng > 0 và ít nhất một thành phần / công đoạn' });
    const xuong = p.data.xuong.toUpperCase();
    const me = Number(req.user!.id);
    const { ds } = await xuongDuocSua(req);
    if (!quanLyDuoc(ds, xuong)) return khongQuyen(res, 'Cần quyền quản lý xưởng này');
    const items = p.data.items.map(it => ({
      hex: it.hex, soLuong: it.soLuong,
      thanhPhan: (it.thanhPhan ?? [{ ten: 'GỖ' as const, xuong, tuyen: it.tuyen ?? [] }]).map(t => ({ ...t, xuong: t.xuong.toUpperCase() })),
    }));
    for (const it of items) {
      const ten = it.thanhPhan.map(t => t.ten);
      if (new Set(ten).size !== ten.length) return res.status(400).json({ success: false, message: `${it.hex}: mỗi thành phần chỉ khai một lần` });
      // Thành phần của xưởng chính phải có tuyến; xưởng phụ để trống thì xưởng phụ tự khai CĐ chi tiết (QT2)
      if (it.thanhPhan.some(t => t.xuong === xuong && !t.tuyen.length)) {
        return res.status(400).json({ success: false, message: `${it.hex}: thành phần của xưởng chính cần tuyến công đoạn chi tiết` });
      }
    }
    // QT1 chỉ xưởng chính của hạng mục triển khai (theo bảng sản xuất, đã gộp xưởng)
    await ensureWorkshopGroups();
    const hexes = [...new Set(items.map(i => i.hex))];
    const dung = new Set((await pool.query(
      `SELECT DISTINCT hex::text AS hex FROM production_status_app
       WHERE hex::text = ANY($1::text[]) AND (UPPER(TRIM(xuong_chinh)) = $2 OR ${workshopGroupSql('xuong_chinh')} = $2)`, [hexes, xuong])).rows.map(x => String(x.hex)));
    const sai = hexes.filter(h => !dung.has(h));
    if (sai.length) return res.status(400).json({ success: false, message: `Không thuộc xưởng chính ${xuong}: ${sai.slice(0, 8).join(', ')}${sai.length > 8 ? '…' : ''}` });

    const kq = await withTransaction(async client => {
      const cdIds = [...new Set(items.flatMap(i => i.thanhPhan.flatMap(t => t.tuyen)))];
      const cd = await client.query('SELECT id, xuong FROM xuong_cong_doan WHERE id = ANY($1::text[]) AND active', [cdIds]);
      const xuongCd = new Map(cd.rows.map(x => [String(x.id), String(x.xuong)]));
      const thieu = cdIds.filter(id => !xuongCd.has(id));
      if (thieu.length) return { loi: `Công đoạn không tồn tại / đã tắt: ${thieu.join(', ')}` } as const;
      for (const it of items) for (const t of it.thanhPhan) {
        if (t.tuyen.length && xuongCd.get(t.tuyen[0]) !== t.xuong) return { loi: `${it.hex} · ${t.ten}: công đoạn đầu tuyến phải thuộc xưởng ${t.xuong}` } as const;
      }
      const ghi: Row[] = [];
      for (const it of items) {
        const tk = dongServer({
          loai: 'trien_khai', hex: it.hex, xuong, so_luong: it.soLuong,
          // tuyen: tuyến thành phần đầu tiên có tuyến (báo cáo / bản cũ đọc)
          du_lieu: { xuong, thanhPhan: it.thanhPhan, tuyen: it.thanhPhan.find(t => t.tuyen.length)?.tuyen ?? [] },
        }, me);
        ghi.push(tk);
        // Song song: mỗi thành phần đã có tuyến => cấp đủ số bộ cho công đoạn đầu tuyến của thành phần đó
        for (const t of it.thanhPhan) {
          if (!t.tuyen.length) continue;
          ghi.push(dongServer({
            loai: 'khai_bao_cd', hex: it.hex, xuong: xuongCd.get(t.tuyen[0]) ?? xuong, so_luong: it.soLuong, cong_doan_den_id: t.tuyen[0],
            du_lieu: { xuongTrienKhai: xuong, trienKhaiId: tk.id, thanhPhan: t.ten, tuyen: t.tuyen },
          }, me));
        }
      }
      await ghiVaTinhLai(client, ghi);
      return { so: items.length } as const;
    });
    if ('loi' in kq) return res.status(400).json({ success: false, message: kq.loi });
    // Thông báo: tổ đầu tuyến có hàng chờ nhận; xưởng phụ được giao thành phần / công đoạn
    await baoHangChoNhan(items.flatMap(i => i.thanhPhan.filter(t => t.tuyen.length).map(t => ({ hex: i.hex, congDoanDenId: t.tuyen[0], soLuong: i.soLuong }))), me);
    await baoXuongPhu(xuong, items, me);
    res.json({ success: true, available: true, soHangMuc: kq.so,
      cap: items.flatMap(i => i.thanhPhan.filter(t => t.tuyen.length).map(t => pairKey(i.hex, t.tuyen[0]))) });
  } catch (e) { fail(res, e, '/api/xuong/trien-khai'); }
});

// ---------------------------------------------------------------------------
// QT2 — XƯỞNG PHỤ KHAI CĐ CHI TIẾT cho thành phần được xưởng chính giao (triển khai để trống tuyến)
//   GET  /api/xuong/khai-chi-tiet?xuong=  → thành phần đang chờ xưởng này khai tuyến
//   POST /api/xuong/khai-chi-tiet { xuong, items: [{ trienKhaiId, thanhPhan, tuyen }] }
// ---------------------------------------------------------------------------
async function choKhaiChiTiet(xuong: string, trienKhaiIds?: string[]) {
  const r = await pool.query(
    `SELECT e.id, e.hex, e.so_luong::float AS so_luong, e.du_lieu->>'xuong' AS xuong_chinh, tp->>'ten' AS thanh_phan,
            to_char(e.device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI') AS luc
     FROM xuong_su_kien e, jsonb_array_elements(CASE WHEN jsonb_typeof(e.du_lieu->'thanhPhan') = 'array' THEN e.du_lieu->'thanhPhan' ELSE '[]'::jsonb END) tp
     WHERE e.loai = 'trien_khai' AND upper(tp->>'xuong') = $1 AND jsonb_array_length(COALESCE(tp->'tuyen', '[]'::jsonb)) = 0
       AND ($2::uuid[] IS NULL OR e.id = ANY($2::uuid[]))
       AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id)
       AND NOT EXISTS (SELECT 1 FROM xuong_su_kien k WHERE k.loai = 'khai_bao_cd' AND k.du_lieu->>'trienKhaiId' = e.id::text
                         AND k.du_lieu->>'thanhPhan' = tp->>'ten'
                         AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h2 WHERE h2.loai = 'huy' AND h2.sua_cho = k.id))
     ORDER BY e.device_ts_hieu_chinh DESC LIMIT 500`, [xuong, trienKhaiIds ?? null]);
  return r.rows;
}

app.get('/api/xuong/khai-chi-tiet', async (req: Request, res: Response) => {
  try {
    const xuong = String(req.query.xuong ?? '').toUpperCase();
    const { ds } = await xuongDuocSua(req);
    if (!xuong || !quanLyDuoc(ds, xuong)) return khongQuyen(res, 'Cần quyền quản lý xưởng này');
    const rows = await choKhaiChiTiet(xuong);
    const hexes = [...new Set(rows.map(x => String(x.hex)))];
    const [sp, cd] = await Promise.all([
      hexes.length ? pool.query(
        `SELECT DISTINCT ON (hex::text) hex::text AS hex, ten_hang_muc, ten_cong_trinh, dvt FROM production_status_app
         WHERE hex::text = ANY($1::text[]) ORDER BY hex::text, updated_at DESC NULLS LAST`, [hexes]) : Promise.resolve({ rows: [] as Row[] }),
      pool.query(`SELECT id, xuong, cd_chi_tiet, cd_tach_ma, thu_tu FROM xuong_cong_doan WHERE active ORDER BY xuong, thu_tu, cd_chi_tiet`),
    ]);
    const info = new Map(sp.rows.map(x => [String(x.hex), x]));
    res.json({
      success: true, available: true, xuong,
      cho: rows.map(x => ({
        trienKhaiId: String(x.id), hex: String(x.hex), thanhPhan: x.thanh_phan, soLuong: Number(x.so_luong), xuongChinh: x.xuong_chinh, luc: x.luc,
        ten: info.get(String(x.hex))?.ten_hang_muc ?? null, tenCongTrinh: info.get(String(x.hex))?.ten_cong_trinh ?? null, dvt: info.get(String(x.hex))?.dvt ?? null,
      })),
      congDoan: cd.rows.map(x => ({ id: x.id, xuong: x.xuong, ten: x.cd_chi_tiet, cdTachMa: x.cd_tach_ma, thuTu: x.thu_tu })),
    });
  } catch (e) { fail(res, e, '/api/xuong/khai-chi-tiet'); }
});

const khaiChiTietSchema = z.object({
  xuong: z.string().trim().min(1).max(20),
  items: z.array(z.object({
    trienKhaiId: z.string().uuid(),
    thanhPhan: z.enum(THANH_PHAN),
    tuyen: z.array(z.string().max(40)).min(1).max(30),
  })).min(1).max(200),
});

app.post('/api/xuong/khai-chi-tiet', async (req: Request, res: Response) => {
  try {
    const p = khaiChiTietSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ success: false, message: 'Mỗi thành phần cần ít nhất một công đoạn chi tiết' });
    const xuong = p.data.xuong.toUpperCase();
    const me = Number(req.user!.id);
    const { ds } = await xuongDuocSua(req);
    if (!quanLyDuoc(ds, xuong)) return khongQuyen(res, 'Cần quyền quản lý xưởng này');
    const kq = await withTransaction(async client => {
      const cho = await choKhaiChiTiet(xuong, [...new Set(p.data.items.map(i => i.trienKhaiId))]);
      const conCho = new Map(cho.map(x => [`${x.id}|${x.thanh_phan}`, x]));
      const cdIds = [...new Set(p.data.items.flatMap(i => i.tuyen))];
      const cd = await client.query('SELECT id, xuong FROM xuong_cong_doan WHERE id = ANY($1::text[]) AND active', [cdIds]);
      const xuongCd = new Map(cd.rows.map(x => [String(x.id), String(x.xuong)]));
      const thieu = cdIds.filter(id => !xuongCd.has(id));
      if (thieu.length) return { loi: `Công đoạn không tồn tại / đã tắt: ${thieu.join(', ')}` } as const;
      const ghi: Row[] = [];
      const baoNhan: Array<{ hex: string; congDoanDenId: string; soLuong: number }> = [];
      for (const it of p.data.items) {
        const t = conCho.get(`${it.trienKhaiId}|${it.thanhPhan}`);
        if (!t) return { loi: `Thành phần ${it.thanhPhan} không còn chờ xưởng ${xuong} khai (đã khai hoặc triển khai đã huỷ)` } as const;
        if (xuongCd.get(it.tuyen[0]) !== xuong) return { loi: `${t.hex} · ${it.thanhPhan}: công đoạn đầu tuyến phải thuộc xưởng ${xuong}` } as const;
        ghi.push(dongServer({
          loai: 'khai_bao_cd', hex: String(t.hex), xuong, so_luong: Number(t.so_luong), cong_doan_den_id: it.tuyen[0],
          du_lieu: { xuongTrienKhai: t.xuong_chinh, trienKhaiId: it.trienKhaiId, thanhPhan: it.thanhPhan, tuyen: it.tuyen },
        }, me));
        baoNhan.push({ hex: String(t.hex), congDoanDenId: it.tuyen[0], soLuong: Number(t.so_luong) });
      }
      await ghiVaTinhLai(client, ghi);
      return { so: ghi.length, baoNhan } as const;
    });
    if ('loi' in kq) return res.status(400).json({ success: false, message: kq.loi });
    await baoHangChoNhan(kq.baoNhan, me);
    res.json({ success: true, available: true, soThanhPhan: kq.so });
  } catch (e) { fail(res, e, '/api/xuong/khai-chi-tiet'); }
});


// ---------------------------------------------------------------------------
// THEO DÕI TRIỂN KHAI — các hạng mục xưởng đã triển khai trên app: từng thành phần, tuyến CĐ chi tiết, ở mỗi công đoạn
// tổ nào phụ trách, trạng thái (chờ nhận / đang làm / tạm ngưng / chờ giao / xong) và số nhận / xong / giao.
//   GET /api/xuong/theo-doi-trien-khai?xuong=&ngay=90&tatCa=1
//   ngay: triển khai trong N ngày gần nhất (mặc định 90, tối đa 400); tatCa=1: gồm cả hạng mục đã xong hết.
// ---------------------------------------------------------------------------
app.get('/api/xuong/theo-doi-trien-khai', async (req: Request, res: Response) => {
  try {
    const xuong = String(req.query.xuong ?? '').toUpperCase();
    const pv = xuong ? await phamViXem(req.user!.id, xuong) : null;
    if (!pv) return khongQuyen(res, 'Cần quyền quản lý xưởng này');
    // Dòng cũ còn "chờ giao" ở công đoạn cuối tuyến: tính lại
    await suaChoGiaoCuoiTuyen((await pool.query(`SELECT hex, cong_doan_id FROM xuong_trang_thai WHERE xuong = $1 AND trang_thai = 'cho_giao' LIMIT 500`, [xuong]))
      .rows.map(x => [String(x.hex), String(x.cong_doan_id)] as [string, string]));
    const soNgay = Math.min(400, Math.max(1, Number(req.query.ngay) || 90));
    const tatCa = req.query.tatCa === '1';
    // Hạng mục: xưởng này triển khai (xưởng chính) hoặc được giao thành phần (xưởng phụ)
    const tk = await pool.query(
      `SELECT e.hex, sum(e.so_luong)::float AS sl, min(e.device_ts_hieu_chinh) AS dau, max(e.device_ts_hieu_chinh) AS cuoi,
              (array_agg(e.du_lieu->>'xuong' ORDER BY e.device_ts_hieu_chinh DESC))[1] AS xuong_chinh
       FROM xuong_su_kien e
       WHERE e.loai = 'trien_khai' AND e.device_ts_hieu_chinh >= now() - ($2 || ' days')::interval
         AND (e.du_lieu->>'xuong' = $1 OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e.du_lieu->'thanhPhan') = 'array'
               THEN e.du_lieu->'thanhPhan' ELSE '[]'::jsonb END) tp WHERE upper(tp->>'xuong') = $1))
         AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id)
       GROUP BY e.hex ORDER BY max(e.device_ts_hieu_chinh) DESC LIMIT 400`, [xuong, String(soNgay)]);
    // Cộng hạng mục tổ trong xưởng đang có hàng / đang chạy mà chưa triển khai trên app (nhận thẳng, nhận ngoài app)
    const dangCo = await pool.query(
      `SELECT hex, max(su_kien_cuoi) AS cuoi FROM xuong_trang_thai
       WHERE xuong = $1 AND (trang_thai <> 'xong' OR su_kien_cuoi >= now() - ($2 || ' days')::interval)
       GROUP BY hex ORDER BY max(su_kien_cuoi) DESC NULLS LAST LIMIT 400`, [xuong, String(soNgay)]);
    const daTk = new Set(tk.rows.map(x => String(x.hex)));
    const chuaTk = dangCo.rows.filter(x => !daTk.has(String(x.hex)))
      .map(x => ({ hex: String(x.hex), sl: 0, dau: null, cuoi: x.cuoi, xuong_chinh: null, chuaTrienKhai: true }));
    const dsHm = [...tk.rows.map(x => ({ ...x, chuaTrienKhai: false })), ...chuaTk];
    const hexes = dsHm.map(x => String(x.hex));
    if (!hexes.length) return res.json({ success: true, available: true, xuong, chiTo: pv.chiTo, hangMuc: [] });
    const [evRows, st, cd, toCd, info, kh] = await Promise.all([
      suKienTheoHex(pool, hexes),
      pool.query(`SELECT hex, cong_doan_id, trang_thai, sl_giao_den::float AS g, sl_nhan::float AS n, sl_hoan_thanh::float AS h,
                         sl_giao::float AS gi, so_nguoi, dang_chay_tu, su_kien_cuoi FROM xuong_trang_thai WHERE hex = ANY($1::text[])`, [hexes]),
      pool.query('SELECT id, xuong, cd_chi_tiet, la_bao_bi, thu_tu FROM xuong_cong_doan'),
      pool.query(`SELECT tc.cong_doan_id, tc.to_id, t.ten_to FROM xuong_to_cong_doan tc JOIN xuong_to t ON t.id = tc.to_id AND t.active`),
      thongTinHangMuc(hexes),
      // Kế hoạch KHSX gần nhất của hạng mục (tuần / tháng): hạng mục đang chạy có nằm trong kế hoạch không
      pool.query(
        `SELECT DISTINCT ON (hex::text) hex::text AS hex, upper(trim(phan_loai_kh)) AS loai, nam, thang, tuan,
                to_char(ngay_khnk, 'YYYY-MM-DD') AS ngay_khnk
         FROM khsx WHERE hex::text = ANY($1::text[]) AND phan_loai_kh IS NOT NULL
         ORDER BY hex::text, nam DESC NULLS LAST, thang DESC NULLS LAST, tuan DESC NULLS LAST`, [hexes]),
    ]);
    const khCua = new Map(kh.rows.map(x => [String(x.hex), {
      loai: String(x.loai ?? '').includes('TUẦN') ? 'tuan' as const : 'thang' as const,
      nam: x.nam === null ? null : Number(x.nam), thang: x.thang === null ? null : Number(x.thang), tuan: x.tuan === null ? null : Number(x.tuan),
      ngayKhnk: x.ngay_khnk ?? null,
    }]));
    const evts = evRows.map(toSuKien);
    const cdMap = new Map(cd.rows.map(x => [String(x.id), x]));
    const toCua = new Map<string, string[]>();
    for (const x of toCd.rows) { const k = String(x.cong_doan_id); if (!toCua.has(k)) toCua.set(k, []); toCua.get(k)!.push(String(x.ten_to)); }
    // Tổ trưởng: chỉ hạng mục đi qua công đoạn tổ mình phụ trách (vẫn hiện cả dòng hàng để thấy tổ trước / sau)
    const cdCuaTo = pv.chiTo ? new Set(toCd.rows.filter(x => pv.chiTo!.includes(Number(x.to_id))).map(x => String(x.cong_doan_id))) : null;
    const stMap = new Map(st.rows.map(x => [`${x.hex}|${x.cong_doan_id}`, x]));
    const congDoan = (hex: string, id: string) => {
      const c = cdMap.get(id); const s2 = stMap.get(`${hex}|${id}`);
      return {
        congDoanId: id, ten: c?.cd_chi_tiet ?? id, xuong: c?.xuong ?? null, laBaoBi: !!c?.la_bao_bi, to: toCua.get(id) ?? [],
        trangThai: s2?.trang_thai ?? null, slGiaoDen: s2?.g ?? 0, slNhan: s2?.n ?? 0, slHoanThanh: s2?.h ?? 0, slGiao: s2?.gi ?? 0,
        soNguoi: s2?.so_nguoi ?? null,
        dangChayTu: s2?.dang_chay_tu ?? null,
        suKienCuoi: s2?.su_kien_cuoi ?? null,
      };
    };
    const hangMuc = dsHm.map(t => {
      const hex = String(t.hex);
      const ev = evts.filter(e => e.hex === hex);
      const tuyen = tuyenTheoThanhPhan(ev);
      // Thành phần giao xưởng phụ mà chưa khai CĐ chi tiết (QT2)
      const choKhai: Array<{ thanhPhan: string; xuong: string }> = [];
      for (const e of suKienConHieuLuc(ev)) {
        if (e.loai !== 'trien_khai' || !Array.isArray(e.duLieu?.thanhPhan)) continue;
        for (const tp of e.duLieu!.thanhPhan as Array<Record<string, unknown>>) {
          const ten = String(tp.ten ?? '');
          if (!tuyen.some(x => x.thanhPhan === ten) && !choKhai.some(x => x.thanhPhan === ten)) choKhai.push({ thanhPhan: ten, xuong: String(tp.xuong ?? '') });
        }
      }
      const thanhPhan = tuyen.map(x => ({ thanhPhan: x.thanhPhan, tuyen: x.tuyen.map(id => congDoan(hex, id)) }));
      // Công đoạn có hàng nhưng nằm ngoài tuyến (giao chỗ khác / nhận ngoài app)
      const trongTuyen = new Set(tuyen.flatMap(x => x.tuyen));
      // Thứ tự gần với dòng hàng: công đoạn đã xong trước, rồi theo thứ tự công đoạn trong danh mục
      const thuTu = (id: string) => Number(cdMap.get(id)?.thu_tu ?? 999);
      const ngoaiTuyen = st.rows.filter(x => String(x.hex) === hex && !trongTuyen.has(String(x.cong_doan_id)))
        .map(x => congDoan(hex, String(x.cong_doan_id)))
        .sort((a, b) => Number(b.trangThai === 'xong') - Number(a.trangThai === 'xong') || thuTu(a.congDoanId) - thuTu(b.congDoanId));
      const tatCaCd = [...thanhPhan.flatMap(x => x.tuyen), ...ngoaiTuyen];
      const sl = Number(t.sl);
      // Xong: công đoạn cuối (bao bì) của mọi thành phần đã hoàn thành đủ số triển khai
      const cuoi = thanhPhan.map(x => x.tuyen[x.tuyen.length - 1]).filter(Boolean);
      const slXong = cuoi.length ? Math.min(...cuoi.map(c => c.slHoanThanh)) : 0;
      // Chưa triển khai trên app: xong khi mọi công đoạn có hàng đều xong
      const xong = t.chuaTrienKhai ? ngoaiTuyen.every(c => c.trangThai === 'xong')
        : !choKhai.length && cuoi.length > 0 && slXong >= sl - 0.0005;
      const i = info.get(hex);
      return {
        hex, ten: i?.ten_hang_muc ?? null, tenCongTrinh: i?.ten_cong_trinh ?? null, dvt: i?.dvt ? String(i.dvt).trim() : null,
        xuongChinh: t.xuong_chinh ?? (i?.xuong_chinh ? String(i.xuong_chinh).trim() : null), slTrienKhai: sl, trienKhaiDau: t.dau, trienKhaiCuoi: t.cuoi,
        chuaTrienKhai: t.chuaTrienKhai, keHoach: khCua.get(hex) ?? null, soLuongDonHang: i?.so_luong_don_hang_tong === null || i?.so_luong_don_hang_tong === undefined ? null : Number(i.so_luong_don_hang_tong),
        thanhPhan, choKhai, ngoaiTuyen, slXong, xong,
        dangLam: tatCaCd.filter(c => c.trangThai === 'dang_lam').length,
        tamNgung: tatCaCd.filter(c => c.trangThai === 'tam_ngung').length,
        choNhan: tatCaCd.filter(c => c.slGiaoDen > c.slNhan + 0.0005).length,
        quaTo: !cdCuaTo || tatCaCd.some(c => cdCuaTo.has(c.congDoanId)),
      };
    }).filter(h => (tatCa || !h.xong) && h.quaTo).map(({ quaTo: _q, ...h }) => h);
    res.json({ success: true, available: true, xuong, chiTo: pv.chiTo, hangMuc });
  } catch (e) { fail(res, e, '/api/xuong/theo-doi-trien-khai'); }
});
