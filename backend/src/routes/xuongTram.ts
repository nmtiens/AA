import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { pool, withTransaction } from '../db.js';
import { app } from '../server/app.js';
import { verifyDeviceToken, signDeviceToken, newDeviceId, signTramToken } from '../server/xuong/auth.js';
import { hieuChinhGio } from '../server/xuong/clock.js';
import { doanCoMat, chuanMnv } from '../server/xuong/chamCong.js';
import { suKienConHieuLuc } from '../server/xuong/state.js';
import { CHE_DO_CHAM, cheDoTheoNgay, coSuaNgay, laSuKienTram, mnvCua, ngayCa, type CheDoCham } from '../server/xuong/tram.js';
import { pairKey, type SuKien } from '../server/xuong/types.js';
import {
  fail, coQuyenXuong, xuongQuanLy, quanLyDuoc, toTruongCua, phamViXem, COT_SU_KIEN, toSuKien, suKienTheoHex,
  suKienSchema, kiemTraTheoLoai, ghiVaTinhLai, thongTinHangMuc, lichCaCuaXuong, coBangTram, mocCheDo, gioiHanNhan,
  soTram, type Row, type SuKienVao,
} from './xuong.js';

// ============================================================================
// TRẠM QUÉT THEO TỔ (docs/designs/xuong-tram-quet.md — T3)
//   Máy trạm (token phạm vi 'tram', chỉ /api/xuong/tram/may/*):
//     GET  /api/xuong/tram/may/bang        bảng "ai đang ở hàng nào", hạng mục làm được, lịch ca (+ gia hạn token)
//     GET  /api/xuong/tram/may/cong-nhan   danh sách công nhân để tra thẻ khi mất sóng
//     POST /api/xuong/tram/may/events      lô vao_ca / ra_ca / nguoi_vao / nguoi_ra của tổ trạm (+ gia hạn token)
//   Quản lý / tổ trưởng (token người dùng):
//     POST /api/xuong/tram/dang-ky         đăng ký máy đang dùng làm trạm của tổ → token trạm
//     GET  /api/xuong/tram/ds?toId=        các trạm của tổ
//     POST /api/xuong/tram/thu-hoi         thu hồi một trạm
//     POST /api/xuong/to/:id/che-do        đổi chế độ chấm của tổ (có hiệu lực từ ngày ca kế tiếp) — quản lý xưởng
//     GET  /api/xuong/to/:id/sua-ngay      dòng thời gian từng người trong ngày + cờ (màn Sửa ngày)
// Chưa chạy backend/sql/2026-10-16_xuong_tram.sql: trả { available: false }.
// ============================================================================

// Trạm ghi: vào / ra ca, người vào / ra hàng; Nhận đủ số giao tới và Xong hết số đã nhận (số lượng máy chủ tự tính —
// nhận / xong một phần vẫn làm trên app tổ trưởng)
const LOAI_TRAM = new Set(['vao_ca', 'ra_ca', 'nguoi_vao', 'nguoi_ra', 'nhan', 'hoan_thanh']);
const TRAM_CHI_GHI = 'Trạm chỉ ghi vào / ra ca, người vào / ra hàng, Nhận đủ và Xong hết';
const SAI_SO = 0.0005;
const lamTron3 = (n: number) => Math.round(n * 1000) / 1000;
const LO_TRAM_TOI_DA = 200;

const chuaBat = (res: Response) => res.json({ success: true, available: false, message: 'Chưa bật trạm quét (chưa chạy SQL 2026-10-16_xuong_tram.sql)' });

/** Quản lý xưởng của tổ, hoặc tổ trưởng của tổ */
async function quyenTo(req: Request, toId: number): Promise<{ xuong: string; quanLy: boolean } | null> {
  const r = await pool.query('SELECT xuong, to_truong_user_id FROM xuong_to WHERE id = $1 AND active', [toId]);
  const to = r.rows[0];
  if (!to) return null;
  const quanLy = quanLyDuoc(await xuongQuanLy(req.user!.id), String(to.xuong));
  if (quanLy || Number(to.to_truong_user_id) === Number(req.user!.id)) return { xuong: String(to.xuong), quanLy };
  return null;
}

interface TramHienTai { deviceId: string; toId: number; xuong: string; congDoan: string[]; sentBy: number; ten: string | null }

/** Kiểm token trạm với sổ thiết bị: máy loại trạm, đúng tổ, chưa thu hồi */
async function tramCuaToi(req: Request, db: Pick<PoolClient, 'query'> = pool): Promise<TramHienTai | { loi: string }> {
  const u = req.user!;
  if (u.scope !== 'tram' || !u.did || !u.to) return { loi: 'Token trạm không hợp lệ' };
  const r = await db.query(
    `SELECT p.cong_doan, p.ten, p.thu_hoi, t.xuong FROM xuong_phien_thiet_bi p JOIN xuong_to t ON t.id = p.to_id
     WHERE p.device_id = $1 AND p.user_id = $2 AND p.loai = 'tram' AND p.to_id = $3`, [u.did, Number(u.id), Number(u.to)]);
  const x = r.rows[0];
  if (!x || x.thu_hoi) return { loi: 'Trạm đã bị thu hồi hoặc chưa đăng ký — cần đăng ký lại' };
  return { deviceId: u.did, toId: Number(u.to), xuong: String(x.xuong), congDoan: (x.cong_doan ?? []).map(String), sentBy: Number(u.id), ten: x.ten ?? null };
}

/** Token mới (30 ngày) cho trạm vừa gọi thành công — trạm dùng hằng ngày nên không bao giờ hết hạn */
const giaHan = (req: Request, t: TramHienTai) =>
  signTramToken({ id: t.sentBy, username: req.user!.username, role: req.user!.role }, t.deviceId, t.toId);

// ---------------------------------------------------------------------------
// Quản lý trạm
// ---------------------------------------------------------------------------
const dangKySchema = z.object({
  toId: z.number().int().positive(),
  congDoan: z.array(z.string().max(40)).max(20).default([]),
  ten: z.string().trim().max(80).nullish(),
});

app.post('/api/xuong/tram/dang-ky', async (req: Request, res: Response) => {
  try {
    if (!(await coBangTram())) return chuaBat(res);
    const p = dangKySchema.safeParse(req.body ?? {});
    if (!p.success) return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ' });
    if (!(await coQuyenXuong(req))) return res.status(403).json({ success: false, message: 'Tài khoản chưa được cấp quyền mục Xưởng' });
    const quyen = await quyenTo(req, p.data.toId);
    if (!quyen) return res.status(403).json({ success: false, message: 'Chỉ quản lý xưởng hoặc tổ trưởng của tổ được đăng ký trạm' });
    const cdTo = (await pool.query('SELECT cong_doan_id FROM xuong_to_cong_doan WHERE to_id = $1', [p.data.toId])).rows.map(x => String(x.cong_doan_id));
    const congDoan = [...new Set(p.data.congDoan)];
    if (congDoan.some(c => !cdTo.includes(c))) return res.status(400).json({ success: false, message: 'Công đoạn không thuộc tổ' });
    const deviceId = newDeviceId();
    await pool.query(
      `INSERT INTO xuong_phien_thiet_bi (device_id, user_id, loai, to_id, cong_doan, ten) VALUES ($1, $2, 'tram', $3, $4, $5)`,
      [deviceId, Number(req.user!.id), p.data.toId, congDoan, p.data.ten || null]);
    res.json({
      success: true, available: true, deviceId,
      token: signTramToken({ id: req.user!.id, username: req.user!.username, role: req.user!.role }, deviceId, p.data.toId),
      deviceToken: signDeviceToken(deviceId),
    });
  } catch (e) { fail(res, e, '/api/xuong/tram/dang-ky'); }
});

app.get('/api/xuong/tram/ds', async (req: Request, res: Response) => {
  try {
    if (!(await coBangTram())) return chuaBat(res);
    const toId = Number(req.query.toId);
    if (!Number.isInteger(toId) || toId <= 0) return res.status(400).json({ success: false, message: 'Thiếu tổ' });
    if (!(await quyenTo(req, toId))) return res.status(403).json({ success: false, message: 'Không có quyền với tổ này' });
    const r = await pool.query(
      `SELECT p.device_id, p.ten, p.cong_doan, p.lan_dau, p.lan_cuoi, p.thu_hoi, u.full_name, u.username
       FROM xuong_phien_thiet_bi p LEFT JOIN users u ON u.id = p.user_id
       WHERE p.loai = 'tram' AND p.to_id = $1 ORDER BY p.thu_hoi, p.lan_dau DESC`, [toId]);
    res.json({
      success: true, available: true,
      tram: r.rows.map(x => ({
        deviceId: String(x.device_id), ten: x.ten, congDoan: x.cong_doan ?? [], lanDau: x.lan_dau, lanCuoi: x.lan_cuoi,
        thuHoi: !!x.thu_hoi, nguoiDangKy: x.full_name || x.username || null,
      })),
    });
  } catch (e) { fail(res, e, '/api/xuong/tram/ds'); }
});

app.post('/api/xuong/tram/thu-hoi', async (req: Request, res: Response) => {
  try {
    if (!(await coBangTram())) return chuaBat(res);
    const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId : '';
    const r = await pool.query(`SELECT to_id FROM xuong_phien_thiet_bi WHERE device_id = $1 AND loai = 'tram' LIMIT 1`, [deviceId])
      .catch(() => ({ rows: [] as Row[] }));
    const toId = Number(r.rows[0]?.to_id);
    if (!toId) return res.status(404).json({ success: false, message: 'Không tìm thấy trạm' });
    if (!(await quyenTo(req, toId))) return res.status(403).json({ success: false, message: 'Không có quyền với tổ này' });
    await pool.query(`UPDATE xuong_phien_thiet_bi SET thu_hoi = true WHERE device_id = $1 AND loai = 'tram'`, [deviceId]);
    res.json({ success: true, available: true });
  } catch (e) { fail(res, e, '/api/xuong/tram/thu-hoi'); }
});

// ---------------------------------------------------------------------------
// Chế độ chấm của tổ — có hiệu lực từ ngày ca kế tiếp (không đổi giữa ca)
// ---------------------------------------------------------------------------
/** Ngày ca kế tiếp của mốc `now` (YYYY-MM-DD) */
export const ngayCaKeTiep = (now: number): string =>
  new Date(Date.parse(`${ngayCa(now)}T12:00:00+07:00`) + 86_400_000).toISOString().slice(0, 10);

app.post('/api/xuong/to/:id/che-do', async (req: Request, res: Response) => {
  try {
    if (!(await coBangTram())) return chuaBat(res);
    const toId = Number(req.params.id);
    const cheDo = req.body?.cheDo as CheDoCham;
    if (!Number.isInteger(toId) || toId <= 0 || !CHE_DO_CHAM.includes(cheDo)) return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ' });
    const quyen = await quyenTo(req, toId);
    if (!quyen?.quanLy) return res.status(403).json({ success: false, message: 'Chỉ quản lý xưởng được đổi chế độ chấm của tổ' });
    // Mặc định từ ngày ca kế tiếp (không đổi giữa ca); "Áp dụng ngay hôm nay" để bắt đầu thử từ đầu ca hôm nay
    const tuNgay = req.body?.homNay === true ? ngayCa(Date.now()) : ngayCaKeTiep(Date.now());
    await withTransaction(async client => {
      // Đổi nhiều lần trong ngày: lần sau thay lần trước cho cùng ngày hiệu lực
      await client.query('DELETE FROM xuong_to_che_do WHERE to_id = $1 AND tu_ngay = $2::date', [toId, tuNgay]);
      await client.query('INSERT INTO xuong_to_che_do (to_id, che_do, tu_ngay, nguoi_doi) VALUES ($1, $2, $3::date, $4)',
        [toId, cheDo, tuNgay, Number(req.user!.id)]);
      await client.query('UPDATE xuong_to SET che_do_cham = $2 WHERE id = $1', [toId, cheDo]);
    });
    // Chuyển sang trạm: hạng mục còn "đang làm" theo bấm tay vẫn chạy tới khi có người quét / Xong — báo để tổ trưởng xử lý
    const dang = cheDo === 'tram' ? (await pool.query(
      `SELECT t.hex, t.cong_doan_id FROM xuong_trang_thai t JOIN xuong_to_cong_doan tc ON tc.cong_doan_id = t.cong_doan_id
       WHERE tc.to_id = $1 AND t.trang_thai = 'dang_lam'`, [toId])).rows : [];
    res.json({ success: true, available: true, cheDo, tuNgay, dangLamBamTay: dang.map(x => ({ hex: x.hex, congDoanId: x.cong_doan_id })) });
  } catch (e) { fail(res, e, '/api/xuong/to/:id/che-do'); }
});

// ---------------------------------------------------------------------------
// Sổ trạm của một tổ quanh một khoảng thời gian (sự kiện thô gồm huy + nhận / xong của các hạng mục đó)
// ---------------------------------------------------------------------------
async function soTramCuaTo(toId: number, tu: number, den: number): Promise<SuKien[]> {
  const r = await pool.query(
    `SELECT ${COT_SU_KIEN} FROM xuong_su_kien
     WHERE to_id = $1 AND loai IN ('vao_ca','ra_ca','nguoi_vao','nguoi_ra') AND device_ts_hieu_chinh BETWEEN $2 AND $3`,
    [toId, new Date(tu).toISOString(), new Date(den).toISOString()]);
  const rows = r.rows.filter(x => laSuKienTram(toSuKien(x)));
  const huy = rows.length ? (await pool.query(
    `SELECT ${COT_SU_KIEN} FROM xuong_su_kien WHERE loai = 'huy' AND sua_cho = ANY($1::uuid[])`, [rows.map(x => String(x.id))])).rows : [];
  const hexes = [...new Set(rows.filter(x => x.hex).map(x => String(x.hex)))];
  const sl = (await suKienTheoHex(pool, hexes)).filter(x => x.loai === 'nhan' || x.loai === 'hoan_thanh' || x.loai === 'huy');
  const theoId = new Map<string, Row>();
  for (const x of [...rows, ...huy, ...sl]) theoId.set(String(x.id), x);
  return [...theoId.values()].map(toSuKien);
}

// ---------------------------------------------------------------------------
// Máy trạm
// ---------------------------------------------------------------------------
app.get('/api/xuong/tram/may/bang', async (req: Request, res: Response) => {
  try {
    if (!(await coBangTram())) return chuaBat(res);
    const t = await tramCuaToi(req);
    if ('loi' in t) return res.status(401).json({ success: false, message: t.loi, dangKyLai: true });
    pool.query('UPDATE xuong_phien_thiet_bi SET lan_cuoi = now() WHERE device_id = $1 AND user_id = $2', [t.deviceId, t.sentBy]).catch(() => {});
    const now = Date.now();
    const ngay = ngayCa(now);
    const [toRow, cdRows, lichCa, tangCa, moc] = await Promise.all([
      pool.query('SELECT ten_to FROM xuong_to WHERE id = $1', [t.toId]),
      pool.query(
        `SELECT c.id, c.cd_chi_tiet FROM xuong_to_cong_doan tc JOIN xuong_cong_doan c ON c.id = tc.cong_doan_id
         WHERE tc.to_id = $1 AND c.active ORDER BY c.thu_tu, c.cd_chi_tiet`, [t.toId]),
      lichCaCuaXuong(t.xuong),
      pool.query(
        `SELECT DISTINCT du_lieu->>'loaiCa' AS ca FROM xuong_su_kien e
         WHERE to_id = $1 AND loai = 'tang_ca' AND (device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $2::date
           AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id)`, [t.toId, ngay]),
      mocCheDo(pool, [t.toId]),
    ]);
    const cheDo = cheDoTheoNgay(moc)(t.toId, ngay);
    const cds = cdRows.rows.map(x => String(x.id));

    // Ai đang ở hàng nào: sổ trạm 36 giờ gần nhất (đoạn mở tự đóng cuối ca). Trạm luôn hiện theo sổ trạm — kể cả tuần
    // song song (số chính thức vẫn theo bấm tay)
    const evs = await soTramCuaTo(t.toId, now - 36 * 3_600_000, now + 60_000);
    const st = await soTram(pool, evs, 'so_khop', now);
    const dangO = Object.entries(st?.kq.dangO ?? {}).filter(([k]) => cds.some(c => k.endsWith(`|${c}`)));
    // Người đã vào ca (theo trạm) mà chưa ở hàng nào
    const ddHom = suKienConHieuLuc(evs).filter(e => (e.loai === 'vao_ca' || e.loai === 'ra_ca') && laSuKienTram(e) && ngayCa(e.ts) === ngay);
    const coMat = Object.values(doanCoMat(ddHom)).flat().filter(d => d && d.end === null).map(d => d!.mnv);
    const oHang = new Set(dangO.flatMap(([, ds]) => ds));
    const chuaVaoHang = [...new Set(coMat)].filter(m => !oHang.has(m));

    // Hạng mục của tổ ở trạm: đang làm được (đã nhận, chưa xong hết) hoặc còn hàng chờ nhận (trạm nhận đủ khi vào hàng)
    const hm = cds.length ? (await pool.query(
      `SELECT hex, cong_doan_id, trang_thai, sl_giao_den, sl_nhan, sl_hoan_thanh FROM xuong_trang_thai
       WHERE cong_doan_id = ANY($1::text[]) AND (sl_nhan > sl_hoan_thanh OR sl_giao_den > sl_nhan)`, [cds])).rows : [];
    const ghNhan = await gioiHanNhan(pool, hm.filter(x => Number(x.sl_giao_den) > Number(x.sl_nhan)).map(x => [String(x.hex), String(x.cong_doan_id)] as [string, string]));
    const conNhanCua = (x: Row) => {
      const g = ghNhan.get(`${x.hex}|${x.cong_doan_id}`);
      let con = Number(x.sl_giao_den) - Number(x.sl_nhan);
      if (g && g.moc !== null) con = Math.min(con, g.moc - g.daNhan);
      return Math.max(0, lamTron3(con));
    };
    const mnvs = [...new Set([...oHang, ...chuaVaoHang])];
    const [info, ten] = await Promise.all([
      thongTinHangMuc([...new Set([...hm.map(x => String(x.hex)), ...dangO.map(([k]) => k.split('|')[0])])]),
      mnvs.length ? pool.query('SELECT mnv, ho_ten FROM xuong_cong_nhan WHERE mnv = ANY($1::text[])', [mnvs]) : Promise.resolve({ rows: [] as Row[] }),
    ]);
    const hoTen = new Map(ten.rows.map(x => [String(x.mnv), String(x.ho_ten)]));
    const nguoi = (m: string) => ({ mnv: m, hoTen: hoTen.get(m) ?? m });
    res.json({
      success: true, available: true, serverNow: now, ngay, cheDo,
      token: giaHan(req, t),
      tram: { ten: t.ten, congDoan: t.congDoan },
      to: { id: t.toId, xuong: t.xuong, ten: toRow.rows[0]?.ten_to ?? null },
      congDoan: cdRows.rows.map(x => ({ id: String(x.id), ten: x.cd_chi_tiet })),
      lichCa, tangCa: tangCa.rows.map(x => String(x.ca)),
      dangO: dangO.map(([k, ds]) => {
        const [hex, congDoanId] = k.split('|');
        return { hex, congDoanId, tenHangMuc: info.get(hex)?.ten_hang_muc ?? null, nguoi: ds.map(nguoi) };
      }),
      chuaVaoHang: chuaVaoHang.map(nguoi),
      hangMuc: hm.map(x => ({
        hex: String(x.hex), congDoanId: String(x.cong_doan_id), trangThai: x.trang_thai,
        tenHangMuc: info.get(String(x.hex))?.ten_hang_muc ?? null,
        conLam: Math.max(0, lamTron3(Number(x.sl_nhan) - Number(x.sl_hoan_thanh))),
        conNhan: conNhanCua(x),
        dvt: info.get(String(x.hex))?.dvt ? String(info.get(String(x.hex))!.dvt).trim() : null,
      })).filter(x => x.conLam > 0 || x.conNhan > 0),
    });
  } catch (e) { fail(res, e, '/api/xuong/tram/may/bang'); }
});

// Giờ máy chủ cho trạm đo lệch đồng hồ (token trạm không gọi được /api/xuong/time)
app.get('/api/xuong/tram/may/time', (_req: Request, res: Response) => {
  res.json({ success: true, serverNow: Date.now() });
});

app.get('/api/xuong/tram/may/cong-nhan', async (req: Request, res: Response) => {
  try {
    if (!(await coBangTram())) return chuaBat(res);
    const t = await tramCuaToi(req);
    if ('loi' in t) return res.status(401).json({ success: false, message: t.loi, dangKyLai: true });
    // Mọi công nhân đang làm (người tổ khác được quét ở trạm này — mượn người / phụ việc)
    const r = await pool.query(
      `SELECT c.mnv, c.ho_ten, c.to_id, t.ten_to FROM xuong_cong_nhan c LEFT JOIN xuong_to t ON t.id = c.to_id WHERE c.active`);
    res.json({
      success: true, available: true,
      congNhan: r.rows.map(x => ({ mnv: String(x.mnv), hoTen: String(x.ho_ten), toId: x.to_id === null ? null : Number(x.to_id), tenTo: x.ten_to ?? null })),
    });
  } catch (e) { fail(res, e, '/api/xuong/tram/may/cong-nhan'); }
});

const laCongNhan = async (mnv: string) =>
  (await pool.query('SELECT 1 FROM xuong_cong_nhan WHERE active AND mnv = $1', [mnv])).rows.length > 0;

const loTramSchema = z.object({
  deviceToken: z.string().max(200),
  events: z.array(z.unknown()).min(1).max(LO_TRAM_TOI_DA),
});

/**
 * Kiểm một sự kiện trạm (đã qua suKienSchema + kiemTraTheoLoai) với dữ liệu tổ; trả lý do từ chối hoặc null.
 * Thuần — tách để test.
 */
export function kiemTraSuKienTram(e: SuKienVao, ctx: {
  congNhan: Set<string>; cdCuaTo: Set<string>; lamDuoc: Set<string>;
}): string | null {
  if (!LOAI_TRAM.has(e.loai)) return TRAM_CHI_GHI;
  const mnv = mnvCua({ duLieu: e.duLieu ?? null });
  if (!mnv || !ctx.congNhan.has(mnv)) return 'Thẻ chưa có trong danh sách — báo tổ trưởng';
  if (e.loai === 'nhan' || e.loai === 'hoan_thanh') {
    if (!e.congDoanId || !ctx.cdCuaTo.has(e.congDoanId)) return 'Công đoạn không thuộc tổ của trạm';
    if (e.loai === 'nhan' && e.duLieu?.nhanDu !== true) return 'Trạm chỉ Nhận đủ — nhận một phần làm trên app tổ trưởng';
    if (e.loai === 'hoan_thanh' && e.duLieu?.xongHet !== true) return 'Trạm chỉ ghi Xong hết — xong một phần làm trên app tổ trưởng';
  }
  if (e.loai === 'nguoi_vao') {
    if (!e.congDoanId || !ctx.cdCuaTo.has(e.congDoanId)) return 'Công đoạn không thuộc tổ của trạm';
    if (!ctx.lamDuoc.has(pairKey(e.hex!, e.congDoanId))) return 'Hạng mục chưa nhận ở tổ này hoặc đã xong hết';
  }
  return null;
}

app.post('/api/xuong/tram/may/events', async (req: Request, res: Response) => {
  const serverNow = Date.now();
  try {
    if (!(await coBangTram())) return chuaBat(res);
    const body = loTramSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ success: false, message: `Lô phải có 1–${LO_TRAM_TOI_DA} sự kiện và mã thiết bị` });
    const t = await tramCuaToi(req);
    if ('loi' in t) return res.status(401).json({ success: false, message: t.loi, dangKyLai: true });
    if (verifyDeviceToken(body.data.deviceToken) !== t.deviceId) return res.status(401).json({ success: false, message: 'Token không thuộc máy này' });

    const tuChoi: Array<{ id: string; reason: string }> = [];
    const hopLe: SuKienVao[] = [];
    for (const raw of body.data.events) {
      const p = suKienSchema.safeParse(raw);
      const id = (raw as { id?: unknown })?.id;
      if (!p.success) { tuChoi.push({ id: typeof id === 'string' ? id : '', reason: 'Dữ liệu sự kiện không hợp lệ' }); continue; }
      // Trạm chỉ ghi cho tổ của trạm; đánh dấu sổ trạm
      const e: SuKienVao = { ...p.data, toId: t.toId, userId: null, suaCho: null, duLieu: { ...(p.data.duLieu ?? {}), tram: true } };
      if (e.duLieu && typeof e.duLieu.mnv === 'string') e.duLieu.mnv = chuanMnv(e.duLieu.mnv);
      const why = LOAI_TRAM.has(e.loai) ? kiemTraTheoLoai(e) : TRAM_CHI_GHI;
      if (why) { tuChoi.push({ id: e.id, reason: why }); continue; }
      hopLe.push(e);
    }

    const mnvs = [...new Set(hopLe.map(e => mnvCua({ duLieu: e.duLieu ?? null })).filter((x): x is string => !!x))];
    const [cn, cdRows] = await Promise.all([
      mnvs.length ? pool.query('SELECT mnv FROM xuong_cong_nhan WHERE active AND mnv = ANY($1::text[])', [mnvs]) : Promise.resolve({ rows: [] as Row[] }),
      pool.query('SELECT cong_doan_id FROM xuong_to_cong_doan WHERE to_id = $1', [t.toId]),
    ]);
    const cdCuaTo = new Set(cdRows.rows.map(x => String(x.cong_doan_id)));
    // Số lượng từng cặp (giao tới / đã nhận / đã xong), cập nhật dần theo thứ tự trong lô: Nhận rồi vào hàng cùng lô được
    const capLo = [...new Map(hopLe.filter(e => ['nguoi_vao', 'nhan', 'hoan_thanh'].includes(e.loai) && e.hex && e.congDoanId)
      .map(e => [pairKey(e.hex!, e.congDoanId!), [e.hex!, e.congDoanId!] as [string, string]])).values()];
    const soCap = new Map<string, { den: number; nhan: number; ht: number }>();
    const lamDuoc = new Set<string>();
    let ghNhan = new Map<string, { moc: number | null; daNhan: number }>();
    if (capLo.length) {
      const tt = await pool.query(
        `SELECT t.hex, t.cong_doan_id, t.sl_giao_den, t.sl_nhan, t.sl_hoan_thanh FROM xuong_trang_thai t
         JOIN unnest($1::text[], $2::text[]) AS c(hex, cd) ON c.hex = t.hex AND c.cd = t.cong_doan_id`,
        [capLo.map(x => x[0]), capLo.map(x => x[1])]);
      for (const x of tt.rows) {
        const k = pairKey(String(x.hex), String(x.cong_doan_id));
        soCap.set(k, { den: Number(x.sl_giao_den), nhan: Number(x.sl_nhan), ht: Number(x.sl_hoan_thanh) });
        if (Number(x.sl_nhan) > Number(x.sl_hoan_thanh) + SAI_SO) lamDuoc.add(k);
      }
      if (hopLe.some(e => e.loai === 'nhan')) ghNhan = await gioiHanNhan(pool, capLo.filter(([h, c]) => hopLe.some(e => e.loai === 'nhan' && e.hex === h && e.congDoanId === c)));
    }
    const ctx = { congNhan: new Set(cn.rows.map(x => String(x.mnv))), cdCuaTo, lamDuoc };
    // Khai hộ vào hàng chỉ cho người đã tự quét thẻ vào ca (ở trạm, trong ngày ca) — không ghi hộ người vắng
    const duocKhai = hopLe.filter(e => typeof e.duLieu?.khaiBoi === 'string').map(e => mnvCua({ duLieu: e.duLieu ?? null })).filter((x): x is string => !!x);
    const daVaoCa = new Set<string>(hopLe.filter(e => e.loai === 'vao_ca' && typeof e.duLieu?.khaiBoi !== 'string')
      .map(e => mnvCua({ duLieu: e.duLieu ?? null })).filter((x): x is string => !!x));
    if (duocKhai.length) {
      const r = await pool.query(
        `SELECT DISTINCT du_lieu->>'mnv' AS mnv FROM xuong_su_kien e
         WHERE loai = 'vao_ca' AND du_lieu->>'tram' = 'true' AND du_lieu->>'mnv' = ANY($1::text[])
           AND NOT (du_lieu ? 'khaiBoi') AND device_ts_hieu_chinh >= $2
           AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id)`,
        [[...new Set(duocKhai)], new Date(Date.parse(`${ngayCa(serverNow)}T05:00:00+07:00`)).toISOString()]);
      for (const x of r.rows) daVaoCa.add(String(x.mnv));
    }

    const ghi: Row[] = [];
    for (const e of hopLe) {
      const why = kiemTraSuKienTram(e, ctx);
      if (why) { tuChoi.push({ id: e.id, reason: why }); continue; }
      const gio = hieuChinhGio(e.deviceTs, e.lechMs ?? null, e.sauDoiGio, serverNow);
      const co = ['tram', ...gio.co];
      if (e.duLieu?.ngoaiCa === true) co.push('ngoai_ca');
      // Nhận đủ / Xong hết: số lượng máy chủ tính lúc ghi (chỉ có đủ, không vượt)
      let soLuong: number | null = null;
      if (e.loai === 'nhan' || e.loai === 'hoan_thanh') {
        const k = pairKey(e.hex!, e.congDoanId!);
        const c = soCap.get(k) ?? { den: 0, nhan: 0, ht: 0 };
        if (e.loai === 'nhan') {
          let con = c.den - c.nhan;
          const g = ghNhan.get(`${e.hex}|${e.congDoanId}`);
          if (g && g.moc !== null) con = Math.min(con, g.moc - g.daNhan - (c.nhan - (soCap.get(k)?.nhan ?? 0)));
          if (con <= SAI_SO) { tuChoi.push({ id: e.id, reason: 'Không còn hàng chờ nhận ở hạng mục này' }); continue; }
          soLuong = lamTron3(con); c.nhan += soLuong; lamDuoc.add(k); co.push('nhan_du');
        } else {
          const con = c.nhan - c.ht;
          if (con <= SAI_SO) { tuChoi.push({ id: e.id, reason: 'Hạng mục đã xong hết số đã nhận' }); continue; }
          soLuong = lamTron3(con); c.ht += soLuong; lamDuoc.delete(k); co.push('xong_het');
        }
        soCap.set(k, c);
      }
      // Một người khai cho cả nhóm làm chung: gắn mã người khai để đối chiếu máy chấm công (R2)
      if (typeof e.duLieu?.khaiBoi === 'string') {
        if (e.loai === 'vao_ca') { tuChoi.push({ id: e.id, reason: 'Mỗi người tự quét thẻ vào ca' }); continue; }
        if (e.loai === 'nguoi_vao' && !daVaoCa.has(mnvCua({ duLieu: e.duLieu })!)) {
          tuChoi.push({ id: e.id, reason: 'Người này chưa tự quét thẻ vào ca' }); continue;
        }
        const kb = chuanMnv(e.duLieu.khaiBoi);
        if (!ctx.congNhan.has(kb) && !(await laCongNhan(kb))) { tuChoi.push({ id: e.id, reason: 'Người khai không có trong danh sách' }); continue; }
        e.duLieu.khaiBoi = kb;
        co.push('khai_ho');
      }
      ghi.push({
        id: e.id, loai: e.loai, hex: e.hex ?? null, cong_doan_id: e.congDoanId ?? null, to_id: t.toId, xuong: t.xuong,
        so_luong: soLuong, cong_doan_den_id: null, cong_doan_nguon_id: null, xuong_nguon: null, so_nguoi: null,
        ly_do_tam_ngung: null, tien_do: null, ghi_chu: null, du_lieu: e.duLieu,
        device_ts: new Date(e.deviceTs).toISOString(), lech_ms: e.lechMs === undefined || e.lechMs === null ? null : Math.round(e.lechMs),
        device_ts_hieu_chinh: new Date(gio.ts).toISOString(),
        user_id: t.sentBy, user_id_khai: null, sent_by: t.sentBy, device_id: t.deviceId, sua_cho: null, co,
      });
    }
    if (ghi.length) await withTransaction(client => ghiVaTinhLai(client, ghi));
    pool.query('UPDATE xuong_phien_thiet_bi SET lan_cuoi = now() WHERE device_id = $1 AND user_id = $2', [t.deviceId, t.sentBy]).catch(() => {});
    res.json({ success: true, available: true, saved: ghi.map(x => String(x.id)), rejected: tuChoi, serverNow, token: giaHan(req, t) });
  } catch (e) { fail(res, e, '/api/xuong/tram/may/events'); }
});

// ---------------------------------------------------------------------------
// Sửa ngày (tổ trưởng / quản lý): dòng thời gian từng người — vào ca → các đoạn ở hàng → ra ca, kèm cờ
// ---------------------------------------------------------------------------
app.get('/api/xuong/to/:id/sua-ngay', async (req: Request, res: Response) => {
  try {
    if (!(await coBangTram())) return chuaBat(res);
    if (!(await coQuyenXuong(req))) return res.status(403).json({ success: false, message: 'Tài khoản chưa được cấp quyền mục Xưởng' });
    const toId = Number(req.params.id);
    const now = Date.now();
    const ngay = typeof req.query.ngay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.ngay) ? req.query.ngay : ngayCa(now);
    if (!Number.isInteger(toId) || toId <= 0) return res.status(400).json({ success: false, message: 'Tổ không hợp lệ' });
    const toRow = (await pool.query('SELECT xuong FROM xuong_to WHERE id = $1', [toId])).rows[0];
    if (!toRow) return res.status(404).json({ success: false, message: 'Không tìm thấy tổ' });
    const pv = await phamViXem(req.user!.id, String(toRow.xuong));
    if (!pv || (pv.chiTo && !pv.chiTo.includes(toId))) return res.status(403).json({ success: false, message: 'Không có quyền xem tổ này' });

    // Ngày ca: 06:00 hôm đó tới 06:00 hôm sau (ca 4 qua đêm) — lấy rộng hơn 1 giờ mỗi bên cho quét sớm
    const dau = Date.parse(`${ngay}T05:00:00+07:00`);
    const cuoi = dau + 25 * 3_600_000;
    const evs = await soTramCuaTo(toId, dau, cuoi);
    const st = await soTram(pool, evs, 'so_khop', now);
    const doan = (st?.kq.doanNguoi ?? []).filter(d => d.toId === toId && ngayCa(d.start) === ngay);
    const hl = suKienConHieuLuc(evs);
    const dd = hl.filter(e => (e.loai === 'vao_ca' || e.loai === 'ra_ca') && laSuKienTram(e) && ngayCa(e.ts) === ngay);
    const coMat = Object.values(doanCoMat(dd)).flat().filter((d): d is NonNullable<typeof d> => !!d);
    const mnvs = [...new Set([...doan.map(d => d.mnv), ...coMat.map(d => d.mnv)])];
    const [ten, info] = await Promise.all([
      mnvs.length ? pool.query('SELECT mnv, ho_ten FROM xuong_cong_nhan WHERE mnv = ANY($1::text[])', [mnvs]) : Promise.resolve({ rows: [] as Row[] }),
      thongTinHangMuc([...new Set(doan.map(d => d.hex))]),
    ]);
    const hoTen = new Map(ten.rows.map(x => [String(x.mnv), String(x.ho_ten)]));
    const quanLy = quanLyDuoc(await xuongQuanLy(req.user!.id), String(toRow.xuong));
    const laToTruong = (await toTruongCua(req.user!.id)).some(x => x.id === toId);
    res.json({
      success: true, available: true, ngay, serverNow: now,
      cheDo: cheDoTheoNgay(await mocCheDo(pool, [toId]))(toId, ngay),
      // Huỷ / ghi hộ: tổ trưởng của tổ (sự kiện trạm trong 7 ngày) hoặc quản lý xưởng
      suaDuoc: quanLy || laToTruong,
      nguoi: mnvs.sort().map(m => {
        const cm = coMat.filter(d => d.mnv === m);
        const ds = doan.filter(d => d.mnv === m).sort((a, b) => a.start - b.start);
        return {
          mnv: m, hoTen: hoTen.get(m) ?? m,
          coMat: cm.map(d => ({ start: d.start, end: d.end })),
          doan: ds.map(d => ({ ...d, tenHangMuc: info.get(d.hex)?.ten_hang_muc ?? null })),
          co: coSuaNgay(ds, cm, now),
        };
      }),
      // Sự kiện trạm của ngày (để huỷ từng dòng)
      suKien: hl.filter(e => laSuKienTram(e) && ngayCa(e.ts) === ngay && e.toId === toId)
        .map(e => ({ id: e.id, loai: e.loai, mnv: mnvCua(e), hex: e.hex, congDoanId: e.congDoanId, ts: e.ts })),
    });
  } catch (e) { fail(res, e, '/api/xuong/to/:id/sua-ngay'); }
});
