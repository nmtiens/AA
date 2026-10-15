import { createHash } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { pool, withTransaction } from '../db.js';
import { app } from '../server/app.js';
import { loadUserAccess, userHasPermission } from '../server/permissions.js';
import { vnDayKey, runWithLimit } from '../server/common.js';
import { isMissingSchema } from '../notifications.js';
import {
  xuongLimiter, verifyDeviceToken, signDeviceToken, newDeviceId, signXuongToken, bumpTokenVersion,
} from '../server/xuong/auth.js';
import { hieuChinhGio } from '../server/xuong/clock.js';
import { tinhTrangThai, suKienConHieuLuc, tuyenTheoThanhPhan, laCuoiTuyen, type TuyenThanhPhan } from '../server/xuong/state.js';
import { khungCaChinh, gioTrongCa } from '../server/xuong/mraLichSu.js';
import { doanCoMat, tomTatDiemDanh, kiemTraDiemDanh, chuanMnv } from '../server/xuong/chamCong.js';
import { cuaSoTrongNgay, phanBoGioCong, trangThaiXacNhan, type ThayDoiSoNguoi } from '../server/xuong/allocation.js';
import { thoiGianTheoLo } from '../server/xuong/metrics.js';
import { baoHangChoNhan } from './xuongThongBao.js';
import { khoaAnhHopLe, kieuAnh, ANH_TOI_DA_BYTE } from '../server/xuong/anh.js';
import {
  LOAI_SU_KIEN, LY_DO_TAM_NGUNG, LOAI_CA, LOAI_CA_TANG_CA, pairKey,
  type SuKien, type LichCaRow, type LoaiCa, type DoanChay,
} from '../server/xuong/types.js';

// ============================================================================
// API MỤC XƯỞNG (docs/designs/xuong-checkin.md — đợt 1, quyết định R1–R14)
//   GET  /api/xuong/time               giờ server (máy tự đo lệch đồng hồ, R8)
//   POST /api/xuong/thiet-bi           đăng ký máy → mã thiết bị ký HMAC + token Xưởng 30 ngày (R4, R5)
//   POST /api/xuong/events             nhận lô ≤200 sự kiện, chống ghi trùng, tính lại trạng thái (R3)
//   GET  /api/xuong/cong-viec          việc của tổ: Chờ nhận · Đang làm · Chờ giao
//   GET  /api/xuong/gioi-han-nhan      số tối đa nhận được ở từng công đoạn của tổ (đã triển khai − đã nhận)
//   GET  /api/xuong/hex/:hex           dòng thời gian, trạng thái từng công đoạn, thời gian trong xưởng, giờ công
//   GET  /api/xuong/to/:id/gio-cong    giờ công phân bổ của tổ trong ngày (cache theo phiên bản sổ, R3)
//   GET  /api/xuong/can-xem            sự kiện / trạng thái gắn cờ của xưởng
//   GET  /api/xuong/danh-muc           công đoạn, tổ, lịch ca
//   POST /api/xuong/thu-hoi/:userId    admin thu hồi mọi token / máy Xưởng của một người (R5)
// Chưa chạy backend/sql/2026-10-12_xuong.sql: trả { available: false } thay vì lỗi 500.
// ============================================================================

// Giới hạn riêng theo người cho cả mục Xưởng (R1); middleware đăng nhập chung đã chạy trước
app.use('/api/xuong', xuongLimiter);

export const PERM_XUONG = 'xuong';
export const PERM_QUAN_LY = 'xuong_quan_ly';
const LO_TOI_DA = 200;
const HUY_TRONG_MS = 24 * 3_600_000;
export const HEX_RE = /^\d{9}$/;

export const fail = (res: Response, e: unknown, where: string) => {
  if (isMissingSchema(e)) return res.json({ success: true, available: false });
  console.error(`Lỗi ${where}:`, e);
  return res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
};

export const coQuyenXuong = async (req: Request) =>
  (await userHasPermission(req, PERM_XUONG)) || (await userHasPermission(req, PERM_QUAN_LY));

/** Xưởng mà người dùng quản lý ('*' = mọi xưởng, với ADMIN) */
export async function xuongQuanLy(userId: string | number): Promise<Set<string>> {
  const access = await loadUserAccess(userId);
  if (access.role === 'ADMIN') return new Set(['*']);
  if (!access.perms.has(PERM_QUAN_LY)) return new Set();
  const r = await pool.query('SELECT xuong FROM xuong_quan_ly WHERE user_id = $1', [Number(userId)]);
  return new Set(r.rows.map(x => String(x.xuong)));
}
export const quanLyDuoc = (ds: Set<string>, xuong: string | null) => ds.has('*') || (!!xuong && ds.has(xuong));

/** Tổ mà tài khoản làm tổ trưởng (đang hoạt động) */
export async function toTruongCua(userId: string | number): Promise<Array<{ id: number; xuong: string }>> {
  const r = await pool.query('SELECT id, xuong FROM xuong_to WHERE active AND to_truong_user_id = $1', [Number(userId)]);
  return r.rows.map(x => ({ id: Number(x.id), xuong: String(x.xuong) }));
}

/**
 * Phạm vi XEM số liệu xưởng (báo cáo, theo dõi triển khai, cần xem):
 *  - admin: cả xưởng;
 *  - tài khoản tổ trưởng: chỉ các tổ mình phụ trách trong xưởng đó — kể cả khi có quyền quản lý xưởng;
 *  - quản lý xưởng (không làm tổ trưởng): cả xưởng;
 *  - còn lại: null (không được xem).
 * chiTo = null là cả xưởng.
 */
export async function phamViXem(userId: string | number, xuong: string): Promise<{ chiTo: number[] | null } | null> {
  const ds = await xuongQuanLy(userId);
  if (ds.has('*')) return { chiTo: null };
  const tt = await toTruongCua(userId);
  if (tt.length) {
    const cua = tt.filter(t => t.xuong === xuong).map(t => t.id);
    return cua.length ? { chiTo: cua } : null;
  }
  return quanLyDuoc(ds, xuong) ? { chiTo: null } : null;
}

// ---------------------------------------------------------------------------
// Đọc sổ
// ---------------------------------------------------------------------------
export const COT_SU_KIEN = `id, loai, hex, cong_doan_id, to_id, xuong, so_luong, cong_doan_den_id, cong_doan_nguon_id, xuong_nguon,
  so_nguoi, ly_do_tam_ngung, tien_do, ghi_chu, du_lieu, device_ts, lech_ms, device_ts_hieu_chinh, server_ts, user_id,
  user_id_khai, sent_by, device_id, sua_cho, nguon, nguoi_thao_tac_goc, co`;

export type Row = Record<string, any>;
export const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

export const toSuKien = (r: Row): SuKien => ({
  id: String(r.id),
  loai: r.loai,
  hex: r.hex ?? null,
  congDoanId: r.cong_doan_id ?? null,
  toId: r.to_id === null || r.to_id === undefined ? null : Number(r.to_id),
  soLuong: num(r.so_luong),
  congDoanDenId: r.cong_doan_den_id ?? null,
  congDoanNguonId: r.cong_doan_nguon_id ?? null,
  xuongNguon: r.xuong_nguon ?? null,
  soNguoi: r.so_nguoi === null || r.so_nguoi === undefined ? null : Number(r.so_nguoi),
  lyDoTamNgung: r.ly_do_tam_ngung ?? null,
  duLieu: r.du_lieu ?? null,
  ts: new Date(r.device_ts_hieu_chinh).getTime(),
  serverTs: new Date(r.server_ts).getTime(),
  suaCho: r.sua_cho ? String(r.sua_cho) : null,
});

/**
 * Sự kiện của một tập hạng mục (gồm cả huy và giao đến). Mặc định CHỈ sự kiện từ app: lịch sử nạp từ MRA
 * (nguon = 'mra') không được ảnh hưởng trạng thái hiện tại / giờ công phân bổ — chỉ hiện trong chi tiết hex.
 */
export async function suKienTheoHex(db: Pick<PoolClient, 'query'>, hexes: string[], kemMra = false): Promise<Row[]> {
  if (!hexes.length) return [];
  const r = await db.query(
    `SELECT ${COT_SU_KIEN} FROM xuong_su_kien WHERE hex = ANY($1::text[])${kemMra ? '' : " AND nguon = 'app'"}`, [hexes]);
  return r.rows;
}

/** Tính trạng thái các cặp (hex, công đoạn) từ sự kiện của các hạng mục đó */
function trangThaiCacCap(rows: Row[], pairs: Array<[string, string]>) {
  const evts = rows.map(toSuKien);
  const tuyenHex = new Map<string, TuyenThanhPhan[]>();
  return pairs.map(([hex, cd]) => {
    const cua = evts.filter(e => e.hex === hex && e.congDoanId === cd);
    const den = evts.filter(e => e.hex === hex && (e.loai === 'giao' || e.loai === 'khai_bao_cd' || e.loai === 'huy')
      && (e.congDoanDenId === cd || e.loai === 'huy'));
    if (!tuyenHex.has(hex)) tuyenHex.set(hex, tuyenTheoThanhPhan(evts.filter(e => e.hex === hex)));
    return { hex, cd, state: tinhTrangThai(cua, den, tuyenHex.get(hex), cd) };
  });
}

export interface GioiHanNhan { moc: number | null; loai: 'trien_khai' | 'don_hang' | null; daNhan: number; dvt: string | null }

/**
 * Số lượng tối đa nhận được ở từng (hạng mục, công đoạn): mốc = tổng số đã TRIỂN KHAI cho xưởng của công đoạn
 * (chưa triển khai thì lấy số lượng đơn hàng ở bảng sản xuất — cùng mốc với thời gian trong xưởng); đã nhận = số
 * nhận hiện có ở công đoạn đó. Khoá trả về: `${hex}|${congDoanId}`.
 */
export async function gioiHanNhan(db: Pick<PoolClient, 'query'>, pairs: Array<[string, string]>): Promise<Map<string, GioiHanNhan>> {
  const out = new Map<string, GioiHanNhan>();
  if (!pairs.length) return out;
  const hexes = [...new Set(pairs.map(p => p[0]))];
  const cds = [...new Set(pairs.map(p => p[1]))];
  const [cdRows, nhanRows, evRows, info] = await Promise.all([
    db.query('SELECT id, xuong FROM xuong_cong_doan WHERE id = ANY($1::text[])', [cds]),
    db.query('SELECT hex, cong_doan_id, sl_nhan FROM xuong_trang_thai WHERE hex = ANY($1::text[]) AND cong_doan_id = ANY($2::text[])', [hexes, cds]),
    suKienTheoHex(db, hexes),
    thongTinHangMuc(hexes),
  ]);
  const xuongCd = new Map(cdRows.rows.map(x => [String(x.id), String(x.xuong)]));
  const daNhan = new Map(nhanRows.rows.map(x => [`${x.hex}|${x.cong_doan_id}`, num(x.sl_nhan)]));
  const tk = new Map<string, number>(); // `${hex}|${xuong}` -> tổng triển khai còn hiệu lực
  for (const e of suKienConHieuLuc(evRows.map(toSuKien))) {
    if (e.loai !== 'trien_khai' || !e.hex) continue;
    // Xưởng chính + xưởng thực hiện từng thành phần (song song: mỗi thành phần nhận đủ số bộ triển khai)
    const tp = Array.isArray(e.duLieu?.thanhPhan) ? (e.duLieu!.thanhPhan as Array<Record<string, unknown>>) : [];
    const cacXuong = new Set([String(e.duLieu?.xuong ?? ''), ...tp.map(x => String(x?.xuong ?? '')).filter(Boolean)]);
    for (const x of cacXuong) tk.set(`${e.hex}|${x}`, (tk.get(`${e.hex}|${x}`) ?? 0) + (e.soLuong ?? 0));
  }
  for (const [hex, cd] of pairs) {
    const daTk = tk.get(`${hex}|${xuongCd.get(cd) ?? ''}`) ?? 0;
    const dh = info.get(hex)?.so_luong_don_hang_tong;
    const moc = daTk > 0 ? { moc: daTk, loai: 'trien_khai' as const }
      : dh ? { moc: Number(dh), loai: 'don_hang' as const } : { moc: null, loai: null };
    out.set(`${hex}|${cd}`, { ...moc, daNhan: daNhan.get(`${hex}|${cd}`) ?? 0, dvt: info.get(hex)?.dvt ? String(info.get(hex)!.dvt).trim() : null });
  }
  return out;
}

async function luuTrangThai(client: PoolClient, pairs: Array<[string, string]>) {
  if (!pairs.length) return;
  const hexes = [...new Set(pairs.map(p => p[0]))];
  const rows = await suKienTheoHex(client, hexes);
  const xuongCd = new Map<string, string | null>();
  const cds = [...new Set(pairs.map(p => p[1]))];
  const r = await client.query('SELECT id, xuong FROM xuong_cong_doan WHERE id = ANY($1::text[])', [cds]);
  r.rows.forEach(x => xuongCd.set(String(x.id), x.xuong));
  const out = trangThaiCacCap(rows, pairs).map(({ hex, cd, state }) => ({
    hex, cong_doan_id: cd, xuong: xuongCd.get(cd) ?? null, trang_thai: state.trangThai,
    sl_giao_den: state.slGiaoDen, sl_nhan: state.slNhan, sl_hoan_thanh: state.slHoanThanh, sl_giao: state.slGiao,
    so_nguoi: state.soNguoi,
    dang_chay_tu: state.dangChayTu === null ? null : new Date(state.dangChayTu).toISOString(),
    su_kien_cuoi: state.suKienCuoi === null ? null : new Date(state.suKienCuoi).toISOString(),
    co: state.co,
    rong: state.slGiaoDen === 0 && state.slNhan === 0 && state.slHoanThanh === 0 && state.slGiao === 0 && state.dangChayTu === null,
  }));
  const giu = out.filter(x => !x.rong);
  const bo = out.filter(x => x.rong);
  if (bo.length) {
    await client.query(
      `DELETE FROM xuong_trang_thai t USING jsonb_to_recordset($1::jsonb) AS x(hex text, cong_doan_id text)
       WHERE t.hex = x.hex AND t.cong_doan_id = x.cong_doan_id`, [JSON.stringify(bo)]);
  }
  if (giu.length) {
    await client.query(
      `INSERT INTO xuong_trang_thai (hex, cong_doan_id, xuong, trang_thai, sl_giao_den, sl_nhan, sl_hoan_thanh, sl_giao,
         so_nguoi, dang_chay_tu, su_kien_cuoi, co, cap_nhat)
       SELECT hex, cong_doan_id, xuong, trang_thai, sl_giao_den, sl_nhan, sl_hoan_thanh, sl_giao, so_nguoi,
              dang_chay_tu, su_kien_cuoi, co, now()
       FROM jsonb_to_recordset($1::jsonb) AS x(hex text, cong_doan_id text, xuong text, trang_thai text,
         sl_giao_den numeric, sl_nhan numeric, sl_hoan_thanh numeric, sl_giao numeric, so_nguoi int,
         dang_chay_tu timestamptz, su_kien_cuoi timestamptz, co text[])
       ON CONFLICT (hex, cong_doan_id) DO UPDATE SET
         xuong = EXCLUDED.xuong, trang_thai = EXCLUDED.trang_thai, sl_giao_den = EXCLUDED.sl_giao_den,
         sl_nhan = EXCLUDED.sl_nhan, sl_hoan_thanh = EXCLUDED.sl_hoan_thanh, sl_giao = EXCLUDED.sl_giao,
         so_nguoi = EXCLUDED.so_nguoi, dang_chay_tu = EXCLUDED.dang_chay_tu, su_kien_cuoi = EXCLUDED.su_kien_cuoi,
         co = EXCLUDED.co, cap_nhat = now()`,
      [JSON.stringify(giu)]);
  }
}

// ---------------------------------------------------------------------------
// GET /api/xuong/time
// ---------------------------------------------------------------------------
app.get('/api/xuong/time', (_req: Request, res: Response) => {
  res.json({ success: true, serverNow: Date.now() });
});

// ---------------------------------------------------------------------------
// POST /api/xuong/thiet-bi — đăng ký máy, cấp token Xưởng
// ---------------------------------------------------------------------------
const thietBiSchema = z.object({ deviceToken: z.string().max(200).optional() });

app.post('/api/xuong/thiet-bi', async (req: Request, res: Response) => {
  try {
    const parsed = thietBiSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ' });
    if (!(await coQuyenXuong(req))) return res.status(403).json({ success: false, message: 'Tài khoản chưa được cấp quyền mục Xưởng' });
    const userId = Number(req.user!.id);
    // Token Xưởng chỉ gia hạn được cho đúng máy đã ký trong token
    const cu = verifyDeviceToken(parsed.data.deviceToken);
    const deviceId = req.user!.scope === 'xuong' ? (req.user!.did ?? null) : (cu ?? newDeviceId());
    if (!deviceId) return res.status(401).json({ success: false, message: 'Mã thiết bị không hợp lệ' });

    const r = await pool.query(
      `INSERT INTO xuong_phien_thiet_bi (device_id, user_id) VALUES ($1, $2)
       ON CONFLICT (device_id, user_id) DO UPDATE SET lan_cuoi = now()
       RETURNING thu_hoi`, [deviceId, userId]);
    if (r.rows[0]?.thu_hoi) return res.status(403).json({ success: false, message: 'Máy này đã bị thu hồi quyền mục Xưởng' });

    const access = await loadUserAccess(userId);
    const u = await pool.query('SELECT id, username, full_name, role, msnv FROM users WHERE id = $1', [userId]);
    const user = u.rows[0];
    const to = await pool.query(
      `SELECT t.id, t.xuong, t.ten_to, t.to_truong_user_id = $1 AS la_to_truong FROM xuong_to t
       WHERE t.active AND (t.to_truong_user_id = $1 OR EXISTS (
         SELECT 1 FROM xuong_to_thanh_vien tv WHERE tv.to_id = t.id AND tv.mnv = $2 AND (tv.den_ngay IS NULL OR tv.den_ngay >= CURRENT_DATE)))
       ORDER BY t.xuong, t.ten_to`, [userId, user?.msnv ?? '']);
    res.json({
      success: true,
      available: true,
      token: signXuongToken({ id: userId, username: user.username, role: access.role }, deviceId, access.tokenVersion ?? 0),
      deviceToken: signDeviceToken(deviceId),
      user: { id: userId, username: user.username, fullName: user.full_name, msnv: user.msnv },
      to: to.rows.map(t => ({ id: Number(t.id), xuong: t.xuong, ten: t.ten_to, toTruong: !!t.la_to_truong })),
    });
  } catch (e) { fail(res, e, '/api/xuong/thiet-bi'); }
});

// ---------------------------------------------------------------------------
// POST /api/xuong/events — nhận lô sự kiện
// ---------------------------------------------------------------------------
const soHuuHan = z.number().finite();
const suKienSchema = z.object({
  id: z.string().uuid(),
  loai: z.enum(LOAI_SU_KIEN),
  hex: z.string().max(20).nullish(),
  congDoanId: z.string().max(40).nullish(),
  toId: z.number().int().positive().nullish(),
  soLuong: soHuuHan.min(0).max(1_000_000).nullish(),
  congDoanDenId: z.string().max(40).nullish(),
  congDoanNguonId: z.string().max(40).nullish(),
  xuongNguon: z.string().max(20).nullish(),
  soNguoi: z.number().int().min(0).max(500).nullish(),
  lyDoTamNgung: z.enum(LY_DO_TAM_NGUNG).nullish(),
  tienDo: z.number().int().min(0).max(100).nullish(),
  ghiChu: z.string().max(1000).nullish(),
  duLieu: z.record(z.string(), z.unknown()).nullish(),
  deviceTs: soHuuHan,
  lechMs: soHuuHan.nullish(),
  sauDoiGio: z.boolean().optional(),
  userId: z.number().int().positive().nullish(),
  suaCho: z.string().uuid().nullish(),
});
const loSchema = z.object({
  deviceToken: z.string().max(200),
  events: z.array(z.unknown()).min(1).max(LO_TOI_DA),
});
type SuKienVao = z.infer<typeof suKienSchema>;

const CAN_HEX = new Set(['trien_khai', 'khai_bao_cd', 'nhan', 'bat_dau', 'tam_ngung', 'tiep_tuc', 'hoan_thanh', 'giao', 'tien_do']);
const CAN_CONG_DOAN = new Set(['nhan', 'bat_dau', 'tam_ngung', 'tiep_tuc', 'hoan_thanh', 'giao', 'tien_do']);
const CAN_TO = new Set(['tang_ca', 'chia_nguoi', 'quan_so', 'xac_nhan_cuoi_ngay', 'vao_ca', 'ra_ca']);

/** Kiểm tra theo loại; trả lý do từ chối hoặc null */
function kiemTraTheoLoai(e: SuKienVao): string | null {
  if (CAN_HEX.has(e.loai) && !(e.hex && HEX_RE.test(e.hex))) return 'Mã hạng mục phải có 9 số';
  if (CAN_CONG_DOAN.has(e.loai) && !e.congDoanId) return 'Thiếu công đoạn';
  if (CAN_TO.has(e.loai) && !e.toId) return 'Thiếu tổ';
  if (['nhan', 'hoan_thanh', 'giao', 'trien_khai'].includes(e.loai) && !(e.soLuong && e.soLuong > 0)) return 'Số lượng phải lớn hơn 0';
  if ((e.loai === 'giao' || e.loai === 'khai_bao_cd') && !e.congDoanDenId) return 'Thiếu công đoạn nhận';
  if (e.loai === 'tam_ngung' && !e.lyDoTamNgung) return 'Tạm ngưng phải chọn lý do';
  if (e.loai === 'huy' && !e.suaCho) return 'Thiếu sự kiện cần huỷ';
  if (e.duLieu && 'anh' in e.duLieu) {
    const anh = e.duLieu.anh;
    if (!Array.isArray(anh) || anh.length > 5 || !anh.every(khoaAnhHopLe)) return 'Ảnh không hợp lệ (tối đa 5 ảnh đã tải lên)';
  }
  if (e.loai === 'tang_ca') {
    const ca = e.duLieu?.loaiCa;
    if (typeof ca !== 'string' || !LOAI_CA_TANG_CA.includes(ca as LoaiCa)) return 'Loại ca tăng ca không hợp lệ';
  }
  if (e.loai === 'vao_ca' || e.loai === 'ra_ca') {
    const loi = kiemTraDiemDanh(e.duLieu);
    if (loi) return loi;
  }
  if (e.loai === 'quan_so') {
    const ca = e.duLieu?.loaiCa;
    if (typeof ca !== 'string' || !LOAI_CA.includes(ca as LoaiCa)) return 'Loại ca không hợp lệ';
    if (typeof e.duLieu?.soNguoi !== 'number' || (e.duLieu.soNguoi as number) < 0) return 'Thiếu quân số';
  }
  return null;
}

/**
 * Ghi các dòng sự kiện đã kiểm (chống trùng theo id), tính lại trạng thái các cặp bị chạm (R3) và tăng phiên bản
 * sổ (tổ, ngày). Dùng chung cho lô từ máy (POST /events) và thao tác từ máy tính (huỷ, triển khai — xuongSetup.ts).
 * `dichDb`: các sự kiện bị huỷ đọc từ DB (để tính lại cặp nhận của sự kiện giao bị huỷ).
 */
export async function ghiVaTinhLai(client: PoolClient, ghi: Row[], dichDb: Row[] = []): Promise<Set<string>> {
  const moi = new Set<string>();
  if (ghi.length) {
    const ins = await client.query(
      `INSERT INTO xuong_su_kien (id, loai, hex, cong_doan_id, to_id, xuong, so_luong, cong_doan_den_id, cong_doan_nguon_id,
         xuong_nguon, so_nguoi, ly_do_tam_ngung, tien_do, ghi_chu, du_lieu, device_ts, lech_ms, device_ts_hieu_chinh,
         user_id, user_id_khai, sent_by, device_id, sua_cho, co)
       SELECT id, loai, hex, cong_doan_id, to_id, xuong, so_luong, cong_doan_den_id, cong_doan_nguon_id,
         xuong_nguon, so_nguoi, ly_do_tam_ngung, tien_do, ghi_chu, du_lieu, device_ts, lech_ms, device_ts_hieu_chinh,
         user_id, user_id_khai, sent_by, device_id, sua_cho, co
       FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, loai text, hex text, cong_doan_id text, to_id int, xuong text,
         so_luong numeric, cong_doan_den_id text, cong_doan_nguon_id text, xuong_nguon text, so_nguoi int,
         ly_do_tam_ngung text, tien_do int, ghi_chu text, du_lieu jsonb, device_ts timestamptz, lech_ms bigint,
         device_ts_hieu_chinh timestamptz, user_id int, user_id_khai int, sent_by int, device_id uuid, sua_cho uuid, co text[])
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [JSON.stringify(ghi)]);
    for (const x of ins.rows) moi.add(String(x.id));

    // Tính lại trạng thái các cặp bị chạm (R3)
    const cap = new Map<string, [string, string]>();
    for (const x of ghi) {
      if (x.hex && x.cong_doan_id) cap.set(pairKey(x.hex, x.cong_doan_id), [x.hex, x.cong_doan_id]);
      if (x.hex && x.cong_doan_den_id) cap.set(pairKey(x.hex, x.cong_doan_den_id), [x.hex, x.cong_doan_den_id]);
    }
    // Huỷ một sự kiện giao / khai báo: cặp nhận cũng phải tính lại
    const giaoBiHuy = dichDb.filter(x => x.loai === 'giao' || x.loai === 'khai_bao_cd').map(x => String(x.id));
    if (giaoBiHuy.length) {
      const den = await client.query('SELECT hex, cong_doan_den_id FROM xuong_su_kien WHERE id = ANY($1::uuid[])', [giaoBiHuy]);
      for (const x of den.rows) if (x.hex && x.cong_doan_den_id) cap.set(pairKey(x.hex, x.cong_doan_den_id), [x.hex, x.cong_doan_den_id]);
    }
    await luuTrangThai(client, [...cap.values()]);

    // Phiên bản sổ theo (tổ, ngày) — khoá cache giờ công (R3)
    const pb = new Map<string, { to_id: number; ngay: string }>();
    for (const x of ghi) {
      if (!x.to_id) continue;
      const ngay = vnDayKey(new Date(x.device_ts_hieu_chinh));
      pb.set(`${x.to_id}|${ngay}`, { to_id: x.to_id, ngay });
      // Ra ca rạng sáng (ca qua đêm) thuộc ngày hôm trước
      if (x.loai === 'ra_ca' && new Date(new Date(x.device_ts_hieu_chinh).getTime() + 7 * 3_600_000).getUTCHours() < 12) {
        const truoc = vnDayKey(new Date(new Date(x.device_ts_hieu_chinh).getTime() - 24 * 3_600_000));
        pb.set(`${x.to_id}|${truoc}`, { to_id: x.to_id, ngay: truoc });
      }
    }
    if (pb.size) {
      await client.query(
        `INSERT INTO xuong_phien_ban (to_id, ngay, v)
         SELECT to_id, ngay, 1 FROM jsonb_to_recordset($1::jsonb) AS x(to_id int, ngay date)
         ON CONFLICT (to_id, ngay) DO UPDATE SET v = xuong_phien_ban.v + 1`,
        [JSON.stringify([...pb.values()])]);
    }
  }
  return moi;
}

app.post('/api/xuong/events', async (req: Request, res: Response) => {
  const serverNow = Date.now();
  try {
    const body = loSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ success: false, message: `Lô phải có 1–${LO_TOI_DA} sự kiện và mã thiết bị` });
    if (!(await coQuyenXuong(req))) return res.status(403).json({ success: false, message: 'Tài khoản chưa được cấp quyền mục Xưởng' });
    const sentBy = Number(req.user!.id);
    const deviceId = verifyDeviceToken(body.data.deviceToken);
    if (!deviceId) return res.status(401).json({ success: false, message: 'Mã thiết bị không hợp lệ, hãy mở lại mục Xưởng để đăng ký máy' });
    if (req.user!.scope === 'xuong' && req.user!.did !== deviceId) {
      return res.status(401).json({ success: false, message: 'Token không thuộc máy này' });
    }

    const tuChoi: Array<{ id: string; reason: string }> = [];
    const hopLe: SuKienVao[] = [];
    for (const raw of body.data.events) {
      const p = suKienSchema.safeParse(raw);
      const id = (raw as { id?: unknown })?.id;
      if (!p.success) { tuChoi.push({ id: typeof id === 'string' ? id : '', reason: 'Dữ liệu sự kiện không hợp lệ' }); continue; }
      const why = kiemTraTheoLoai(p.data);
      if (why) { tuChoi.push({ id: p.data.id, reason: why }); continue; }
      hopLe.push(p.data);
    }

    const ketQua = await withTransaction(async client => {
      // Máy phải đã đăng ký cho người gửi và chưa bị thu hồi
      const phien = await client.query(
        'SELECT user_id, thu_hoi FROM xuong_phien_thiet_bi WHERE device_id = $1', [deviceId]);
      const nguoiTrenMay = new Set(phien.rows.filter(x => !x.thu_hoi).map(x => Number(x.user_id)));
      if (!nguoiTrenMay.has(sentBy)) return { loi: 'Máy chưa đăng ký hoặc đã bị thu hồi cho tài khoản này' } as const;

      // Thông tin công đoạn / tổ để gắn xưởng
      const cds = [...new Set(hopLe.flatMap(e => [e.congDoanId, e.congDoanDenId]).filter((x): x is string => !!x))];
      const tos = [...new Set(hopLe.map(e => e.toId).filter((x): x is number => !!x))];
      const [cdRows, toRows] = await Promise.all([
        cds.length ? client.query('SELECT id, xuong FROM xuong_cong_doan WHERE id = ANY($1::text[])', [cds]) : { rows: [] as Row[] },
        tos.length ? client.query('SELECT id, xuong FROM xuong_to WHERE id = ANY($1::int[])', [tos]) : { rows: [] as Row[] },
      ]);
      const xuongCd = new Map(cdRows.rows.map(x => [String(x.id), String(x.xuong)]));
      const xuongTo = new Map(toRows.rows.map(x => [Number(x.id), String(x.xuong)]));

      // Sự kiện bị huỷ: lấy từ DB (hoặc cùng lô) để kiểm quyền và gắn hex / công đoạn cho sự kiện huy
      const huyIds = hopLe.filter(e => e.loai === 'huy').map(e => e.suaCho!);
      const dichDb = huyIds.length
        ? (await client.query(`SELECT id, hex, cong_doan_id, to_id, xuong, sent_by, server_ts, loai FROM xuong_su_kien WHERE id = ANY($1::uuid[])`, [huyIds])).rows
        : [];
      const dich = new Map<string, Row>(dichDb.map(x => [String(x.id), x]));
      const quanLy = await xuongQuanLy(sentBy);
      // Tổ người gửi được ghi: tổ trưởng, hoặc thành viên đang trong tổ (theo mã NV — một người có thể có nhiều tài khoản)
      const toCuaToi = new Set((await client.query(
        `SELECT t.id FROM xuong_to t WHERE t.to_truong_user_id = $1
         UNION SELECT tv.to_id FROM xuong_to_thanh_vien tv JOIN users u ON u.id = $1
           WHERE u.msnv IS NOT NULL AND upper(tv.mnv) = upper(trim(u.msnv)) AND (tv.den_ngay IS NULL OR tv.den_ngay >= CURRENT_DATE)`,
        [sentBy])).rows.map(x => Number(x.id)));

      // Số lượng chỉ có đủ, không có vượt: nhận ≤ đã triển khai (chưa triển khai: đơn hàng), xong ≤ đã nhận,
      // giao ≤ đã xong — vượt thì từ chối (kể cả thao tác ghi lúc mất sóng); cộng dồn theo thứ tự trong lô
      const SAI_SO = 0.0005;
      const capSl = hopLe.filter(e => ['nhan', 'hoan_thanh', 'giao'].includes(e.loai) && e.hex && e.congDoanId)
        .map(e => [e.hex!, e.congDoanId!] as [string, string]);
      const gioiHan = await gioiHanNhan(client, capSl.filter(([h, c]) => hopLe.some(e => e.loai === 'nhan' && e.hex === h && e.congDoanId === c)));
      const soCap = new Map<string, { nhan: number; ht: number; giao: number }>();
      if (capSl.length) {
        const tt = await client.query(
          `SELECT t.hex, t.cong_doan_id, t.sl_nhan, t.sl_hoan_thanh, t.sl_giao FROM xuong_trang_thai t
           JOIN unnest($1::text[], $2::text[]) AS c(hex, cd) ON c.hex = t.hex AND c.cd = t.cong_doan_id`,
          [capSl.map(x => x[0]), capSl.map(x => x[1])]);
        for (const x of tt.rows) soCap.set(`${x.hex}|${x.cong_doan_id}`, { nhan: num(x.sl_nhan) ?? 0, ht: num(x.sl_hoan_thanh) ?? 0, giao: num(x.sl_giao) ?? 0 });
      }
      const hienSo = (n: number) => String(Math.round(Math.max(0, n) * 1000) / 1000).replace('.', ',');

      const ghi: Row[] = [];
      for (const e of hopLe) {
        let hex = e.hex ?? null;
        let congDoanId = e.congDoanId ?? null;
        let toId = e.toId ?? null;
        let xuong: string | null = (congDoanId ? xuongCd.get(congDoanId) : undefined)
          ?? (toId ? xuongTo.get(toId) : undefined) ?? null;
        if (congDoanId && !xuongCd.has(congDoanId)) { tuChoi.push({ id: e.id, reason: 'Công đoạn không tồn tại' }); continue; }
        if (e.congDoanDenId && !xuongCd.has(e.congDoanDenId)) { tuChoi.push({ id: e.id, reason: 'Công đoạn nhận không tồn tại' }); continue; }
        if (toId && !xuongTo.has(toId)) { tuChoi.push({ id: e.id, reason: 'Tổ không tồn tại' }); continue; }

        if (e.loai === 'huy') {
          const cungLo = ghi.find(x => x.id === e.suaCho);
          const d: Row | undefined = dich.get(e.suaCho!) ?? (cungLo ? { ...cungLo, server_ts: new Date(serverNow) } : undefined);
          if (!d) { tuChoi.push({ id: e.id, reason: 'Không tìm thấy sự kiện cần huỷ' }); continue; }
          const laNguoiGui = Number(d.sent_by) === sentBy && serverNow - new Date(d.server_ts).getTime() <= HUY_TRONG_MS;
          if (!laNguoiGui && !quanLyDuoc(quanLy, d.xuong ?? null)) {
            tuChoi.push({ id: e.id, reason: 'Chỉ người gửi (trong 24 giờ) hoặc quản lý xưởng được huỷ' });
            continue;
          }
          hex = d.hex ?? null; congDoanId = d.cong_doan_id ?? null;
          toId = d.to_id === null || d.to_id === undefined ? null : Number(d.to_id); xuong = d.xuong ?? null;
        }

        const co: string[] = [];
        // Quyền ghi theo tổ: người của tổ; quản lý xưởng ghi hộ được (gắn cờ để đối chiếu); người khác bị từ chối
        if (e.loai !== 'huy') {
          if (toId) {
            if (!toCuaToi.has(toId)) {
              if (!quanLyDuoc(quanLy, xuongTo.get(toId) ?? null)) { tuChoi.push({ id: e.id, reason: 'Tài khoản không thuộc tổ này' }); continue; }
              co.push('quan_ly_ghi_ho');
            }
          } else if (!quanLyDuoc(quanLy, xuong)) {
            tuChoi.push({ id: e.id, reason: 'Thao tác không gắn tổ chỉ quản lý xưởng được ghi' });
            continue;
          }
        }
        // Tác giả (R6): chỉ tin người khai nếu đã đăng nhập trên chính máy này
        let userId: number = sentBy;
        let userIdKhai: number | null = null;
        if (e.userId && e.userId !== sentBy) {
          if (nguoiTrenMay.has(e.userId)) { userId = e.userId; co.push('gui_ho'); }
          else { userIdKhai = e.userId; co.push('tac_gia_khong_xac_minh'); }
        }
        if (hex && congDoanId && (e.loai === 'nhan' || e.loai === 'hoan_thanh' || e.loai === 'giao')) {
          const k = `${hex}|${congDoanId}`;
          const c = soCap.get(k) ?? { nhan: 0, ht: 0, giao: 0 };
          const sl = e.soLuong ?? 0;
          if (e.loai === 'nhan') {
            const gh = gioiHan.get(k);
            if (gh && gh.moc !== null && c.nhan + sl > gh.moc + SAI_SO) {
              tuChoi.push({ id: e.id, reason: `Nhận vượt số ${gh.loai === 'trien_khai' ? 'đã triển khai' : 'lượng đơn hàng'} ${hienSo(gh.moc)} — còn nhận được ${hienSo(gh.moc - c.nhan)}` });
              continue;
            }
            c.nhan += sl;
          } else if (e.loai === 'hoan_thanh') {
            if (c.ht + sl > c.nhan + SAI_SO) { tuChoi.push({ id: e.id, reason: `Xong nhiều hơn số đã nhận — còn ${hienSo(c.nhan - c.ht)}` }); continue; }
            c.ht += sl;
          } else {
            if (c.giao + sl > c.ht + SAI_SO) { tuChoi.push({ id: e.id, reason: `Giao nhiều hơn số đã xong — còn ${hienSo(c.ht - c.giao)}` }); continue; }
            c.giao += sl;
          }
          soCap.set(k, c);
        }
        // Bắt đầu / tiếp tục phải khai số người làm hạng mục (app bắt khai; máy cũ chưa cập nhật thì gắn cờ)
        if ((e.loai === 'bat_dau' || e.loai === 'tiep_tuc') && !e.soNguoi) co.push('thieu_so_nguoi');
        const gio = hieuChinhGio(e.deviceTs, e.lechMs ?? null, e.sauDoiGio, serverNow);
        co.push(...gio.co);
        // Khai bù: tổ trưởng chọn ngày thực hiện trước hôm nay khi nhận / giao (QT3 / QT4 — "ngày thực hiện")
        if (e.duLieu && (e.duLieu as Record<string, unknown>).khaiBu === true) co.push('khai_bu');
        ghi.push({
          id: e.id, loai: e.loai, hex, cong_doan_id: congDoanId, to_id: toId, xuong,
          so_luong: e.soLuong ?? null, cong_doan_den_id: e.congDoanDenId ?? null,
          cong_doan_nguon_id: e.congDoanNguonId ?? null, xuong_nguon: e.xuongNguon ?? null,
          so_nguoi: e.soNguoi ?? null, ly_do_tam_ngung: e.lyDoTamNgung ?? null, tien_do: e.tienDo ?? null,
          ghi_chu: e.ghiChu ?? null, du_lieu: e.duLieu ?? null,
          device_ts: new Date(e.deviceTs).toISOString(), lech_ms: e.lechMs === undefined || e.lechMs === null ? null : Math.round(e.lechMs),
          device_ts_hieu_chinh: new Date(gio.ts).toISOString(),
          user_id: userId, user_id_khai: userIdKhai, sent_by: sentBy, device_id: deviceId,
          sua_cho: e.suaCho ?? null, co,
        });
      }

      const moi = await ghiVaTinhLai(client, ghi, dichDb);
      return {
        ghi: ghi.map(x => String(x.id)),
        // Chỉ sự kiện mới ghi (gửi lại lô cũ thì không báo trùng)
        giaoDen: ghi.filter(x => moi.has(String(x.id)) && (x.loai === 'giao' || x.loai === 'khai_bao_cd') && x.hex && x.cong_doan_den_id)
          .map(x => ({ hex: String(x.hex), congDoanDenId: String(x.cong_doan_den_id), soLuong: Number(x.so_luong ?? 0) })),
      } as const;
    });

    if ('loi' in ketQua) return res.status(401).json({ success: false, message: ketQua.loi });
    // Báo tổ nhận hàng (thông báo không bao giờ làm hỏng lô — guiTinXuong tự nuốt lỗi). Chờ tối đa 1,5 giây để Web Push
    // chậm không kéo dài phản hồi lô (máy coi chậm là mất mạng và gửi lại).
    if (ketQua.giaoDen.length) {
      await Promise.race([baoHangChoNhan(ketQua.giaoDen, sentBy), new Promise(r => setTimeout(r, 1500))]);
    }
    res.json({ success: true, available: true, saved: ketQua.ghi, rejected: tuChoi, serverNow });
  } catch (e) { fail(res, e, '/api/xuong/events'); }
});

// ---------------------------------------------------------------------------
// Thông tin hạng mục từ bảng sản xuất (ETL)
// ---------------------------------------------------------------------------
export async function thongTinHangMuc(hexes: string[]): Promise<Map<string, Row>> {
  if (!hexes.length) return new Map();
  const r = await pool.query(
    `SELECT DISTINCT ON (hex::text) hex::text AS hex, ten_hang_muc, ma_cong_trinh, ten_cong_trinh, dvt,
            so_luong_don_hang_tong, xuong_chinh
     FROM production_status_app WHERE hex::text = ANY($1::text[])
     ORDER BY hex::text, updated_at DESC NULLS LAST`, [hexes]);
  return new Map(r.rows.map(x => [String(x.hex), x]));
}

const dongTrangThai = (x: Row, info?: Row) => ({
  hex: x.hex, congDoanId: x.cong_doan_id, trangThai: x.trang_thai,
  slGiaoDen: Number(x.sl_giao_den), slNhan: Number(x.sl_nhan), slHoanThanh: Number(x.sl_hoan_thanh), slGiao: Number(x.sl_giao),
  soNguoi: x.so_nguoi === null ? null : Number(x.so_nguoi),
  dangChayTu: x.dang_chay_tu, suKienCuoi: x.su_kien_cuoi, co: x.co ?? [],
  tenHangMuc: info?.ten_hang_muc ?? null, maCongTrinh: info?.ma_cong_trinh ?? null, tenCongTrinh: info?.ten_cong_trinh ?? null,
  dvt: info?.dvt ?? null,
});

/**
 * Gợi ý công đoạn kế cho "Xong — giao" (3F, cải tiến 6). Ưu tiên tuyến đã khai khi triển khai
 * (du_lieu.tuyen = [id công đoạn theo thứ tự]); chưa có tuyến thì các công đoạn cùng xưởng ở bậc `thu_tu` kế tiếp
 * (theo cd_tach_ma). Mảng rỗng = chưa có tuyến, màn hình bắt chọn nơi giao.
 */
async function goiYCongDoanKe(pairs: Array<[string, string]>): Promise<{ ke: Map<string, string[]>; cuoi: Set<string> }> {
  const out = new Map<string, string[]>();
  const cuoi = new Set<string>();
  if (!pairs.length) return { ke: out, cuoi };
  const hexes = [...new Set(pairs.map(p => p[0]))];
  const [evRows, cd] = await Promise.all([
    suKienTheoHex(pool, hexes),
    pool.query('SELECT id, xuong, thu_tu FROM xuong_cong_doan WHERE active'),
  ]);
  const evts = evRows.map(toSuKien);
  const tuyen = new Map<string, TuyenThanhPhan[]>();
  for (const hex of hexes) tuyen.set(hex, tuyenTheoThanhPhan(evts.filter(e => e.hex === hex)));
  const cdMap = new Map(cd.rows.map(x => [String(x.id), { xuong: String(x.xuong), thuTu: Number(x.thu_tu) }]));
  for (const [hex, cdId] of pairs) {
    // Cuối tuyến: xong là hết, không gợi ý nơi giao (trước đây rơi xuống gợi ý theo thứ tự công đoạn / báo "chưa có tuyến")
    if (laCuoiTuyen(tuyen.get(hex) ?? [], cdId)) { cuoi.add(pairKey(hex, cdId)); continue; }
    // Công đoạn kế theo tuyến của (các) thành phần đi qua công đoạn này
    const qua = (tuyen.get(hex) ?? []).filter(t => t.tuyen.includes(cdId));
    const ke = [...new Set(qua.map(t => t.tuyen[t.tuyen.indexOf(cdId) + 1]).filter((x): x is string => !!x))];
    if (ke.length) { out.set(pairKey(hex, cdId), ke); continue; }
    const cur = cdMap.get(cdId);
    if (!cur) continue;
    const sau = [...cdMap.entries()].filter(([, v]) => v.xuong === cur.xuong && v.thuTu > cur.thuTu);
    if (!sau.length) continue;
    const bac = Math.min(...sau.map(([, v]) => v.thuTu));
    out.set(pairKey(hex, cdId), sau.filter(([, v]) => v.thuTu === bac).map(([id]) => id));
  }
  return { ke: out, cuoi };
}

/**
 * Tự sửa trạng thái lưu từ trước khi có quy tắc "cuối tuyến xong là hết": cặp còn "chờ giao" ở công đoạn cuối tuyến
 * => tính lại (thành "xong"). Chỉ xét cặp đang cho_giao nên sau lần đầu gần như không tốn gì.
 */
export async function suaChoGiaoCuoiTuyen(pairs: Array<[string, string]>): Promise<number> {
  if (!pairs.length) return 0;
  const { cuoi } = await goiYCongDoanKe(pairs);
  const can = pairs.filter(([h, c]) => cuoi.has(pairKey(h, c)));
  if (!can.length) return 0;
  await withTransaction(client => luuTrangThai(client, can));
  return can.length;
}

// ---------------------------------------------------------------------------
// Ảnh tiến độ trong Postgres (D24) — bảng xuong_anh (backend/sql/2026-10-12_xuong_anh.sql)
//   POST /api/xuong/anh?id=<uuid máy sinh>&hex=  body = bytes WebP / JPEG (≤ 1 MB)  → { bat, khoa }
//   GET  /api/xuong/anh/:id                                                         → bytes ảnh
// ---------------------------------------------------------------------------
let bangAnh: { co: boolean; luc: number } | null = null;
/** Đã chạy file SQL ảnh chưa (có rồi thì nhớ luôn; chưa có thì 5 phút kiểm lại) */
let bangCongNhan: { co: boolean; luc: number } | null = null;
/** Đã chạy backend/sql/2026-10-13_xuong_cham_cong.sql (bảng công nhân + loại sự kiện vao_ca / ra_ca) */
export async function coBangCongNhan(): Promise<boolean> {
  if (bangCongNhan && (bangCongNhan.co || Date.now() - bangCongNhan.luc < 300_000)) return bangCongNhan.co;
  const r = await pool.query(`SELECT to_regclass('xuong_cong_nhan') IS NOT NULL AS co`);
  bangCongNhan = { co: !!r.rows[0]?.co, luc: Date.now() };
  return bangCongNhan.co;
}

async function coBangAnh(): Promise<boolean> {
  if (bangAnh && (bangAnh.co || Date.now() - bangAnh.luc < 300_000)) return bangAnh.co;
  const r = await pool.query(`SELECT to_regclass('xuong_anh') IS NOT NULL AS co`);
  bangAnh = { co: !!r.rows[0]?.co, luc: Date.now() };
  return bangAnh.co;
}

app.post('/api/xuong/anh', express.raw({ type: 'image/*', limit: '1mb' }), async (req: Request, res: Response) => {
  try {
    if (!(await coQuyenXuong(req))) return res.status(403).json({ success: false, message: 'Tài khoản chưa được cấp quyền mục Xưởng' });
    if (!(await coBangAnh())) return res.json({ success: true, available: true, bat: false });
    const id = String(req.query.id ?? '');
    const hex = String(req.query.hex ?? '');
    if (!khoaAnhHopLe(id) || !HEX_RE.test(hex)) return res.status(400).json({ success: false, message: 'Thiếu mã ảnh / mã hạng mục' });
    const buf = req.body as Buffer;
    const mime = Buffer.isBuffer(buf) ? kieuAnh(buf) : null;
    if (!mime || buf.length > ANH_TOI_DA_BYTE) return res.status(400).json({ success: false, message: 'Chỉ nhận ảnh WebP / JPEG dưới 1 MB' });
    await pool.query(
      `INSERT INTO xuong_anh (id, hex, mime, size, data, user_id) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
      [id, hex, mime, buf.length, buf, Number(req.user!.id)]);
    res.json({ success: true, available: true, bat: true, khoa: id });
  } catch (e) { fail(res, e, '/api/xuong/anh'); }
});

app.get('/api/xuong/anh/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!khoaAnhHopLe(id)) return res.status(400).json({ success: false, message: 'Mã ảnh không hợp lệ' });
    const r = await pool.query('SELECT mime, data FROM xuong_anh WHERE id = $1', [id]);
    if (!r.rows[0]) return res.status(404).json({ success: false, message: 'Không tìm thấy ảnh' });
    res.setHeader('Content-Type', r.rows[0].mime === 'image/webp' ? 'image/webp' : 'image/jpeg');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(r.rows[0].data);
  } catch (e) { fail(res, e, '/api/xuong/anh/:id'); }
});

// ---------------------------------------------------------------------------
// GET /api/xuong/cong-viec?toId= — Chờ nhận · Đang làm · Chờ giao của tổ
// ---------------------------------------------------------------------------
app.get('/api/xuong/cong-viec', async (req: Request, res: Response) => {
  try {
    if (!(await coQuyenXuong(req))) return res.status(403).json({ success: false, message: 'Tài khoản chưa được cấp quyền mục Xưởng' });
    const toId = Number(req.query.toId);
    if (!Number.isInteger(toId) || toId <= 0) return res.status(400).json({ success: false, message: 'Thiếu tổ' });
    const cdRows = await pool.query(
      `SELECT c.id, c.cd_chi_tiet, c.xuong FROM xuong_to_cong_doan tc JOIN xuong_cong_doan c ON c.id = tc.cong_doan_id
       WHERE tc.to_id = $1 AND c.active ORDER BY c.thu_tu, c.cd_chi_tiet`, [toId]);
    const cds = cdRows.rows.map(x => String(x.id));
    // Dòng cũ còn "chờ giao" ở công đoạn cuối tuyến: tính lại trước khi đọc
    if (cds.length) {
      await suaChoGiaoCuoiTuyen((await pool.query(`SELECT hex, cong_doan_id FROM xuong_trang_thai WHERE cong_doan_id = ANY($1::text[]) AND trang_thai = 'cho_giao'`, [cds]))
        .rows.map(x => [String(x.hex), String(x.cong_doan_id)] as [string, string]));
    }
    const st = cds.length
      ? (await pool.query(`SELECT * FROM xuong_trang_thai WHERE cong_doan_id = ANY($1::text[]) AND trang_thai <> 'xong'`, [cds])).rows
      : [];
    const info = await thongTinHangMuc([...new Set(st.map(x => String(x.hex)))]);
    const ngay = vnDayKey(new Date());
    const hom = await pool.query(
      `SELECT loai, du_lieu, device_ts_hieu_chinh FROM xuong_su_kien e
       WHERE to_id = $1 AND loai IN ('quan_so','tang_ca')
         AND (device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $2::date
         AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id)
       ORDER BY device_ts_hieu_chinh`, [toId, ngay]);
    const quanSo: Record<string, number> = {};
    const tangCa: string[] = [];
    for (const x of hom.rows) {
      const d = x.du_lieu ?? {};
      if (x.loai === 'quan_so' && typeof d.loaiCa === 'string') quanSo[d.loaiCa] = Number(d.soNguoi);
      if (x.loai === 'tang_ca' && typeof d.loaiCa === 'string' && !tangCa.includes(d.loaiCa)) tangCa.push(d.loaiCa);
    }
    const toRow = (await pool.query('SELECT xuong, ten_to FROM xuong_to WHERE id = $1', [toId])).rows[0];
    const xuongTo = toRow?.xuong ? String(toRow.xuong) : (cdRows.rows[0]?.xuong ?? null);

    // "Giống hôm qua" (3B, 3H): quân số gần nhất trước hôm nay theo ca, số người tăng ca gần nhất
    const [truoc, tcTruoc, xacNhan, lichCa] = await Promise.all([
      pool.query(
        `SELECT DISTINCT ON (du_lieu->>'loaiCa') du_lieu->>'loaiCa' AS ca, du_lieu->>'soNguoi' AS so
         FROM xuong_su_kien e WHERE to_id = $1 AND loai = 'quan_so'
           AND (device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < $2::date
           AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id)
         ORDER BY du_lieu->>'loaiCa', device_ts_hieu_chinh DESC`, [toId, ngay]),
      pool.query(
        `SELECT so_nguoi FROM xuong_su_kien e WHERE to_id = $1 AND loai = 'tang_ca' AND so_nguoi IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id)
         ORDER BY device_ts_hieu_chinh DESC LIMIT 1`, [toId]),
      pool.query(
        `SELECT 1 FROM xuong_su_kien e WHERE to_id = $1 AND loai = 'xac_nhan_cuoi_ngay'
           AND (device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $2::date
           AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id) LIMIT 1`, [toId, ngay]),
      xuongTo ? lichCaCuaXuong(xuongTo) : Promise.resolve([] as LichCaRow[]),
    ]);
    const quanSoTruoc: Record<string, number> = {};
    for (const x of truoc.rows) if (x.ca && x.so !== null) quanSoTruoc[x.ca] = Number(x.so);

    const { ke: goiY, cuoi: cuoiTuyen } = await goiYCongDoanKe(st.map(x => [String(x.hex), String(x.cong_doan_id)] as [string, string]));
    // Số người đang làm: lần chia người (3D) sau lần bắt đầu / tiếp tục gần nhất thì thay số khai lúc bắt đầu
    // (cùng cách phân bổ giờ công đọc soNguoi theo thời gian — allocation.ts)
    const chia = await pool.query(
      `SELECT loai, hex, cong_doan_id, du_lieu->'phanBo' AS pb, du_lieu->'nguoi' AS nguoi, device_ts_hieu_chinh AS ts FROM xuong_su_kien e
       WHERE to_id = $1 AND loai IN ('chia_nguoi','bat_dau','tiep_tuc') AND device_ts_hieu_chinh > now() - interval '30 days'
         AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id)
       ORDER BY device_ts_hieu_chinh`, [toId]);
    /** Tên người đang làm (khai theo tên) từ lần bắt đầu / tiếp tục / chia người gần nhất kể từ lúc chạy */
    const tenDangLam = (hex: string, cd: string, tu: Date | null): string[] | null => {
      if (!tu) return null;
      let ten: string[] | null = null;
      for (const c of chia.rows) {
        if (new Date(c.ts).getTime() < tu.getTime() - 1000) continue;
        if (c.loai === 'chia_nguoi') {
          const p = Array.isArray(c.pb) ? (c.pb as Array<Record<string, unknown>>).find(x => x.hex === hex && x.congDoanId === cd) : undefined;
          if (p) ten = dsTen(p.nguoi);
        } else if (String(c.hex) === hex && String(c.cong_doan_id) === cd) ten = dsTen(c.nguoi);
      }
      return ten;
    };
    const soNguoiChia = (hex: string, cd: string, tu: Date | null): number | null => {
      if (!tu) return null;
      let n: number | null = null;
      for (const c of chia.rows) {
        if (c.loai !== 'chia_nguoi' || new Date(c.ts).getTime() < tu.getTime() || !Array.isArray(c.pb)) continue;
        const p = (c.pb as Array<Record<string, unknown>>).find(x => x.hex === hex && x.congDoanId === cd);
        if (p && typeof p.soNguoi === 'number') n = p.soNguoi;
      }
      return n;
    };
    // Hạng mục tạm ngưng: lý do + lúc ngưng (lần tạm ngưng chưa huỷ gần nhất) — dòng hiện "Tạm ngưng · Thiếu vật tư · 12 phút"
    const dsNgung = st.filter(x => x.trang_thai === 'tam_ngung');
    const ngung = new Map<string, { lyDo: string | null; tu: string }>();
    if (dsNgung.length) {
      const q = await pool.query(
        `SELECT DISTINCT ON (hex, cong_doan_id) hex, cong_doan_id, ly_do_tam_ngung, device_ts_hieu_chinh AS ts FROM xuong_su_kien e
         WHERE to_id = $1 AND loai = 'tam_ngung' AND hex = ANY($2::text[])
           AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id)
         ORDER BY hex, cong_doan_id, device_ts_hieu_chinh DESC`, [toId, dsNgung.map(x => String(x.hex))]);
      for (const x of q.rows) ngung.set(pairKey(String(x.hex), String(x.cong_doan_id)), { lyDo: x.ly_do_tam_ngung ?? null, tu: new Date(x.ts).toISOString() });
    }
    const rows = st.map(x => {
      const d = dongTrangThai(x, info.get(String(x.hex)));
      const n = soNguoiChia(String(x.hex), String(x.cong_doan_id), x.dang_chay_tu ? new Date(x.dang_chay_tu) : null);
      const tu = x.dang_chay_tu ? new Date(x.dang_chay_tu) : null;
      return {
        ...d, soNguoi: n ?? d.soNguoi, nguoi: x.trang_thai === 'dang_lam' ? tenDangLam(String(x.hex), String(x.cong_doan_id), tu) : null,
        goiYKe: goiY.get(pairKey(String(x.hex), String(x.cong_doan_id))) ?? [],
        // Công đoạn cuối tuyến: Xong là hết (app hiện "Xong — hết tuyến", không vào Chờ giao)
        cuoiTuyen: cuoiTuyen.has(pairKey(String(x.hex), String(x.cong_doan_id))),
        ngung: x.trang_thai === 'tam_ngung' ? ngung.get(pairKey(String(x.hex), String(x.cong_doan_id))) ?? null : null,
      };
    });

    const ghChoNhan = await gioiHanNhan(pool, rows.filter(x => x.slGiaoDen > x.slNhan).map(x => [String(x.hex), String(x.congDoanId)] as [string, string]));

    // Chấm công theo người: danh sách công nhân của tổ + người có mặt hôm nay theo ca (kể cả người mượn tổ khác)
    const chamCong = await coBangCongNhan();
    let congNhan: Array<{ mnv: string; hoTen: string; toKhac: string | null }> = [];
    const coMatHomNay: Record<string, Array<{ mnv: string; vao: number; ra: number | null }>> = {};
    if (chamCong) {
      const dd = (await pool.query(
        `SELECT ${COT_SU_KIEN} FROM xuong_su_kien e
         WHERE to_id = $1 AND loai IN ('vao_ca','ra_ca')
           AND device_ts_hieu_chinh > ($2::date - 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'`, [toId, ngay])).rows;
      const evs = suKienConHieuLuc(dd.map(toSuKien)).filter(e => vnDayKey(new Date(e.ts)) === ngay || e.loai === 'ra_ca');
      for (const [ca, ds] of Object.entries(doanCoMat(evs))) {
        coMatHomNay[ca] = (ds ?? []).map(d => ({ mnv: d.mnv, vao: d.start, ra: d.end }));
      }
      const muon = [...new Set(Object.values(coMatHomNay).flat().map(x => x.mnv))];
      const cn = await pool.query(
        `SELECT c.mnv, c.ho_ten, c.to_id, t.ten_to FROM xuong_cong_nhan c LEFT JOIN xuong_to t ON t.id = c.to_id
         WHERE c.active AND (c.to_id = $1 OR c.mnv = ANY($2::text[])) ORDER BY c.ho_ten`, [toId, muon]);
      congNhan = cn.rows.map(x => ({ mnv: String(x.mnv), hoTen: String(x.ho_ten), toKhac: Number(x.to_id) === toId ? null : (x.ten_to ?? 'tổ khác') }));
      // Người có mặt mà chưa có trong danh sách (mã nhập tay chưa lưu) vẫn hiện
      for (const m of muon) if (!congNhan.some(c => c.mnv === m)) congNhan.push({ mnv: m, hoTen: m, toKhac: null });
    }
    res.json({
      success: true, available: true, serverNow: Date.now(), ngay,
      to: { id: toId, xuong: xuongTo, ten: toRow?.ten_to ?? null },
      congDoan: cdRows.rows.map(x => ({ id: x.id, ten: x.cd_chi_tiet, xuong: x.xuong })),
      // Kèm số còn nhận được (đã triển khai / đơn hàng − đã nhận); đã nhận đủ thì không còn chờ nhận
      // (số lượng chỉ có đủ, không có vượt — dữ liệu cũ ghi trước khi có giới hạn có thể "giao tới" nhiều hơn)
      choNhan: rows.filter(x => x.slGiaoDen > x.slNhan).map(x => {
        const g = ghChoNhan.get(`${x.hex}|${x.congDoanId}`);
        return { ...x, toiDaNhan: g && g.moc !== null ? Math.max(0, Math.round((g.moc - g.daNhan) * 1000) / 1000) : null };
      }).filter(x => x.toiDaNhan === null || x.toiDaNhan > 0),
      dangLam: rows.filter(x => ['dang_lam', 'tam_ngung', 'da_nhan'].includes(x.trangThai)),
      // Theo số lượng, không theo trạng thái: xong một phần mà vẫn chạy / đang tạm ngưng vẫn giao được phần đã xong
      choGiao: rows.filter(x => x.slHoanThanh > x.slGiao && !x.cuoiTuyen),
      quanSo, tangCa, quanSoTruoc,
      chamCong, congNhan, coMat: coMatHomNay,
      soNguoiTangCaTruoc: tcTruoc.rows[0] ? Number(tcTruoc.rows[0].so_nguoi) : null,
      daXacNhanHomNay: xacNhan.rows.length > 0,
      anhBat: await coBangAnh(),
      lichCa,
    });
  } catch (e) { fail(res, e, '/api/xuong/cong-viec'); }
});

// ---------------------------------------------------------------------------
// Giờ công phân bổ của tổ trong một ngày — cache theo phiên bản sổ (to, ngày) (R3)
// ---------------------------------------------------------------------------
export type KetQuaGioCong = ReturnType<typeof phanBoGioCong> & {
  bamLichCa: string;
  /** Giờ vào / ra, phút trễ / về sớm từng người (chấm công) */
  diemDanh?: ReturnType<typeof tomTatDiemDanh>;
};
/** du_lieu.nguoi của bat_dau / tiep_tuc / phanBo chia_nguoi → mã NV; không có = null (khai theo số) */
const dsTen = (v: unknown): string[] | null =>
  Array.isArray(v) ? [...new Set(v.map(chuanMnv).filter(Boolean))] : null;
const gioCongCache = new Map<string, { v: string; payload: KetQuaGioCong }>();

/** Dấu ngắn của lịch ca (giờ, nghỉ) — kết quả phân bổ giờ công phụ thuộc lịch ca */
// PHIEN_BAN_TINH: đổi khi cách tính / dạng kết quả phân bổ đổi (vd thêm gioChoLyDo) — kết quả đã lưu tự tính lại
const PHIEN_BAN_TINH = 'pb7'; // pb3: gioNguoiKhai / soNguoiMax; pb4: soNguoiMin; pb5: chấm công theo người; pb6: chỉ tính người có mặt; pb7: người gắn tên không điểm danh (mượn / mới) coi như có mặt, trễ / về sớm theo vào đầu / ra cuối
export const dauLichCa = (lichCa: LichCaRow[]) => createHash('sha1')
  .update(PHIEN_BAN_TINH + JSON.stringify([...lichCa].sort((a, b) => a.loaiCa.localeCompare(b.loaiCa)))).digest('hex').slice(0, 12);
const GIO_CONG_CACHE_MAX = 300;
/** Lịch ca đổi (thẻ Xưởng trong Setup) thì giờ công mọi ngày phải tính lại */
export const xoaCacheGioCong = () => gioCongCache.clear();

export async function lichCaCuaXuong(xuong: string): Promise<LichCaRow[]> {
  const r = await pool.query(
    `SELECT DISTINCT ON (loai_ca) loai_ca, to_char(gio_bat_dau,'HH24:MI') AS bd, to_char(gio_ket_thuc,'HH24:MI') AS kt, nghi
     FROM xuong_lich_ca WHERE xuong IN ($1, '*') ORDER BY loai_ca, (xuong = '*')`, [xuong]);
  return r.rows.map(x => ({ loaiCa: x.loai_ca, gioBatDau: x.bd, gioKetThuc: x.kt, nghi: Array.isArray(x.nghi) ? x.nghi : [] }));
}

export async function gioCongToNgay(toId: number, ngay: string) {
  const pb = await pool.query('SELECT v FROM xuong_phien_ban WHERE to_id = $1 AND ngay = $2::date', [toId, ngay]);
  const toRow = await pool.query('SELECT xuong FROM xuong_to WHERE id = $1', [toId]);
  const xuong = toRow.rows[0]?.xuong;
  if (!xuong) return null;
  const lichCa = await lichCaCuaXuong(String(xuong));
  // Khoá cache = phiên bản sổ + dấu lịch ca: đổi lịch ca (giờ nghỉ…) thì mọi instance tự tính lại, không chỉ instance
  // nhận request sửa lịch
  const bamLichCa = dauLichCa(lichCa);
  const v = `${pb.rows[0]?.v ?? 0}|${bamLichCa}`;
  const key = `${toId}|${ngay}`;
  const today = vnDayKey(new Date()) === ngay;
  const hit = gioCongCache.get(key);
  // Ngày hôm nay có đoạn đang chạy => kết quả đổi theo giờ hiện tại, không cache
  if (hit && hit.v === v && !today) return hit.payload;

  // Sự kiện của tổ quanh ngày đó (quân số, tăng ca, chia người, xác nhận, các hạng mục tổ đã chạm) …
  const r = await pool.query(
    `SELECT ${COT_SU_KIEN} FROM xuong_su_kien
     WHERE to_id = $1 AND (device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN ($2::date - 7) AND ($2::date + 1)`,
    [toId, ngay]);
  // … cộng TOÀN BỘ lịch sử các cặp (hex, công đoạn) đó: hạng mục chạy nhiều tuần vẫn có mốc bắt đầu
  const capTrongCuaSo = new Set(r.rows.filter(x => x.hex && x.cong_doan_id).map(x => pairKey(x.hex, x.cong_doan_id)));
  const lichSu = (await suKienTheoHex(pool, [...new Set(r.rows.filter(x => x.hex).map(x => String(x.hex)))]))
    .filter(x => x.hex && x.cong_doan_id && capTrongCuaSo.has(pairKey(x.hex, x.cong_doan_id)));
  const theoId = new Map<string, Row>();
  for (const x of [...r.rows, ...lichSu]) theoId.set(String(x.id), x);
  const conHieuLuc = suKienConHieuLuc([...theoId.values()].map(toSuKien));

  const trongNgay = (e: SuKien) => vnDayKey(new Date(e.ts)) === ngay;
  const caTangCa = conHieuLuc.filter(e => e.loai === 'tang_ca' && trongNgay(e)).map(e => String(e.duLieu?.loaiCa) as LoaiCa);
  const boChon: Partial<Record<LoaiCa, string[]>> = {};
  for (const e of conHieuLuc.filter(x => x.loai === 'tang_ca' && trongNgay(x))) {
    const ca = String(e.duLieu?.loaiCa) as LoaiCa;
    const ds = Array.isArray(e.duLieu?.boChon) ? (e.duLieu!.boChon as unknown[]).map(String) : [];
    boChon[ca] = [...(boChon[ca] ?? []), ...ds];
  }
  const quanSo: Partial<Record<LoaiCa, number | null>> = {};
  for (const e of conHieuLuc.filter(x => x.loai === 'quan_so' && trongNgay(x))) {
    quanSo[String(e.duLieu?.loaiCa) as LoaiCa] = Number(e.duLieu?.soNguoi);
  }

  // Đoạn chạy + số người theo cặp; ngày hoạt động cuối để áp R3-3
  const doanChay: Record<string, DoanChay[]> = {};
  const soNguoi: ThayDoiSoNguoi[] = [];
  const ngayCuoi = new Map<string, string>();
  const capCuaTo = new Map<string, SuKien[]>();
  for (const e of conHieuLuc) {
    if (e.hex && e.congDoanId) {
      const k = pairKey(e.hex, e.congDoanId);
      if (!capCuaTo.has(k)) capCuaTo.set(k, []);
      capCuaTo.get(k)!.push(e);
      if (e.loai !== 'tien_do') {
        const d = vnDayKey(new Date(e.ts));
        if (d <= ngay && (!ngayCuoi.has(k) || ngayCuoi.get(k)! < d)) ngayCuoi.set(k, d);
      }
      if ((e.loai === 'bat_dau' || e.loai === 'tiep_tuc') && e.soNguoi !== null) {
        soNguoi.push({ key: k, at: e.ts, soNguoi: e.soNguoi, nguoi: dsTen(e.duLieu?.nguoi) });
      }
    }
    if (e.loai === 'chia_nguoi' && Array.isArray(e.duLieu?.phanBo)) {
      for (const p of e.duLieu!.phanBo as Array<Record<string, unknown>>) {
        if (typeof p.hex === 'string' && typeof p.congDoanId === 'string' && typeof p.soNguoi === 'number') {
          soNguoi.push({ key: pairKey(p.hex, p.congDoanId), at: e.ts, soNguoi: p.soNguoi, nguoi: dsTen(p.nguoi) });
        }
      }
    }
    if (e.loai === 'xac_nhan_cuoi_ngay' && Array.isArray(e.duLieu?.hangMuc)) {
      const d = vnDayKey(new Date(e.ts));
      for (const p of e.duLieu!.hangMuc as Array<Record<string, unknown>>) {
        if (typeof p.hex === 'string' && typeof p.congDoanId === 'string' && p.trangThai === 'van_lam') {
          const k = pairKey(p.hex, p.congDoanId);
          if (d <= ngay && (!ngayCuoi.has(k) || ngayCuoi.get(k)! < d)) ngayCuoi.set(k, d);
        }
      }
    }
  }
  const ngungTinh: string[] = [];
  const chuaXacNhan: string[] = [];
  for (const [k, evts] of capCuaTo) {
    const st = tinhTrangThai(evts, []);
    if (st.doanChay.length) doanChay[k] = st.doanChay;
    if (st.dangChayTu !== null && st.dangChayTu < Date.parse(`${ngay}T00:00:00+07:00`)) {
      const tt = trangThaiXacNhan(ngay, ngayCuoi.get(k) ?? ngay);
      if (tt === 'ngung') ngungTinh.push(k);
      if (tt === 'chua_xac_nhan') chuaXacNhan.push(k);
    }
  }

  // Đoạn tạm ngưng (tam_ngung → bat_dau / tiep_tuc / hoan_thanh) — tách lý do giờ chờ
  const doanNgung: Record<string, Array<{ start: number; end: number | null; lyDo: string }>> = {};
  for (const [k, evts] of capCuaTo) {
    let dangNgung: { start: number; end: number | null; lyDo: string } | null = null;
    for (const e of [...evts].sort((a, b) => a.ts - b.ts || a.serverTs - b.serverTs)) {
      if (e.loai === 'tam_ngung' && !dangNgung) {
        dangNgung = { start: e.ts, end: null, lyDo: e.lyDoTamNgung || 'khac' };
        (doanNgung[k] ??= []).push(dangNgung);
      } else if (dangNgung && (e.loai === 'bat_dau' || e.loai === 'tiep_tuc' || e.loai === 'hoan_thanh')) {
        dangNgung.end = e.ts; dangNgung = null;
      }
    }
  }

  // Điểm danh (chấm công theo người): vao_ca trong ngày; ra_ca trong ngày hoặc sáng hôm sau (ca qua đêm)
  const truaMai = Date.parse(`${ngay}T12:00:00+07:00`) + 24 * 3_600_000;
  const coMat = doanCoMat(conHieuLuc.filter(e => (e.loai === 'vao_ca' && trongNgay(e))
    || (e.loai === 'ra_ca' && (trongNgay(e) || (e.duLieu?.loaiCa !== 'chinh' && e.ts > Date.parse(`${ngay}T00:00:00+07:00`) && e.ts < truaMai)))));

  const payload: KetQuaGioCong = { ...phanBoGioCong({
    cuaSo: cuaSoTrongNgay(ngay, lichCa, caTangCa), quanSo, doanChay, soNguoi, doanNgung, coMat,
    boChonTangCa: boChon, ngungTinh, chuaXacNhan, now: Date.now(),
  }), bamLichCa, diemDanh: tomTatDiemDanh(coMat, ngay, lichCa) };
  gioCongCache.delete(key);
  gioCongCache.set(key, { v, payload });
  while (gioCongCache.size > GIO_CONG_CACHE_MAX) {
    const oldest = gioCongCache.keys().next().value;
    if (oldest === undefined) break;
    gioCongCache.delete(oldest);
  }
  return payload;
}

app.get('/api/xuong/to/:id/gio-cong', async (req: Request, res: Response) => {
  try {
    if (!(await coQuyenXuong(req))) return res.status(403).json({ success: false, message: 'Tài khoản chưa được cấp quyền mục Xưởng' });
    const toId = Number(req.params.id);
    const ngay = typeof req.query.ngay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.ngay) ? req.query.ngay : vnDayKey(new Date());
    if (!Number.isInteger(toId) || toId <= 0) return res.status(400).json({ success: false, message: 'Tổ không hợp lệ' });
    const kq = await gioCongToNgay(toId, ngay);
    if (!kq) return res.status(404).json({ success: false, message: 'Không tìm thấy tổ' });
    res.json({ success: true, available: true, toId, ngay, ...kq });
  } catch (e) { fail(res, e, '/api/xuong/to/:id/gio-cong'); }
});

// ---------------------------------------------------------------------------
// GET /api/xuong/hex/:hex — dòng thời gian + trạng thái + thời gian trong xưởng + giờ công
// ---------------------------------------------------------------------------
app.get('/api/xuong/hex/:hex', async (req: Request, res: Response) => {
  try {
    const hex = String(req.params.hex);
    if (!HEX_RE.test(hex)) return res.status(400).json({ success: false, message: 'Mã hạng mục phải có 9 số' });
    const [rows, st, info] = await Promise.all([
      suKienTheoHex(pool, [hex], true),
      pool.query('SELECT * FROM xuong_trang_thai WHERE hex = $1', [hex]),
      thongTinHangMuc([hex]),
    ]);
    const now = Date.now();
    const evts = rows.map(toSuKien);
    const laMra = new Set(rows.filter(r => r.nguon === 'mra').map(r => String(r.id)));
    const evtsApp = evts.filter(e => !laMra.has(e.id));
    const conHieuLuc = new Set(suKienConHieuLuc(evts).map(e => e.id));
    const cdIds = [...new Set(evts.flatMap(e => [e.congDoanId, e.congDoanDenId]).filter((x): x is string => !!x))];
    const cd = cdIds.length ? (await pool.query('SELECT id, xuong, cd_chi_tiet, la_bao_bi, thu_tu FROM xuong_cong_doan WHERE id = ANY($1::text[])', [cdIds])).rows : [];
    const cdMap = new Map(cd.map(x => [String(x.id), x]));
    const xuongCua = (id: string | null) => (id ? (cdMap.get(id)?.xuong ?? null) : null);

    // Thời gian trong từng xưởng theo lô (R3-4, R10)
    // Theo lô chỉ với sự kiện app — MRA không ghi rõ lô vào xưởng (lịch sử MRA tính đầu–cuối riêng bên dưới)
    const hl = suKienConHieuLuc(evtsApp);
    const dsXuong = [...new Set(hl.map(e => xuongCua(e.congDoanId)).filter((x): x is string => !!x))];
    const p = info.get(hex);
    const thoiGianXuong = dsXuong.map(xg => {
      // Cặp "cửa vào" của xưởng: có hàng đến từ ngoài xưởng (giao từ công đoạn xưởng khác, đơn hàng nội bộ QT2,
      // hoặc nhận ghi nguồn ngoài app — R10). Mỗi lần nhận ở cặp cửa vào là một lô vào xưởng.
      const cuaVao = new Set<string>();
      for (const g of hl) {
        if (!g.hex || !g.congDoanDenId || xuongCua(g.congDoanDenId) !== xg) continue;
        if (g.loai === 'khai_bao_cd' || (g.loai === 'giao' && xuongCua(g.congDoanId) !== xg)) cuaVao.add(g.congDoanDenId);
      }
      const vao = hl.filter(e => e.loai === 'nhan' && xuongCua(e.congDoanId) === xg
          && (cuaVao.has(e.congDoanId ?? '') || !!e.xuongNguon || (!!e.congDoanNguonId && xuongCua(e.congDoanNguonId) !== xg)))
        .map(e => ({ ts: e.ts, soLuong: e.soLuong ?? 0 }));
      const ra = hl.filter(e => (e.loai === 'giao' && xuongCua(e.congDoanId) === xg && xuongCua(e.congDoanDenId) !== xg)
        || (e.loai === 'hoan_thanh' && xuongCua(e.congDoanId) === xg && cdMap.get(e.congDoanId ?? '')?.la_bao_bi))
        .map(e => ({ ts: e.ts, soLuong: e.soLuong ?? 0 }));
      // Mốc = số triển khai cho xưởng: xưởng chính, hoặc xưởng phụ được giao thành phần (mỗi thành phần đủ số bộ)
      const choXuong = (e: SuKien) => e.duLieu?.xuong === xg || (Array.isArray(e.duLieu?.thanhPhan)
        && (e.duLieu!.thanhPhan as Array<Record<string, unknown>>).some(t => String(t?.xuong ?? '').toUpperCase() === xg));
      const tk = hl.filter(e => e.loai === 'trien_khai' && choXuong(e)).reduce((a, e) => a + (e.soLuong ?? 0), 0);
      const moc = tk > 0 ? { soLuong: tk, loai: 'trien_khai' as const }
        : p?.so_luong_don_hang_tong ? { soLuong: Number(p.so_luong_don_hang_tong), loai: 'don_hang' as const } : null;
      return { xuong: xg, ...thoiGianTheoLo(vao, ra, moc, now) };
    });

    // Giờ chạy (đồng hồ) và giờ công phân bổ theo quân số (6A). Giờ công cộng từ phân bổ từng (tổ, ngày) có chạm
    // hạng mục — tối đa 20 ngày gần nhất mỗi lần xem (mỗi ngày đã qua được cache theo phiên bản sổ).
    const GIO = 3_600_000;
    const gioChay = new Map<string, number>();
    const toNgay = new Set<string>();
    for (const x of st.rows) {
      const cdId = String(x.cong_doan_id);
      const cua = evtsApp.filter(e => e.congDoanId === cdId);
      const doan = tinhTrangThai(cua, []).doanChay;
      gioChay.set(cdId, doan.reduce((a, d) => a + ((d.end ?? now) - d.start) / GIO, 0));
      const toCua = [...new Set(cua.filter(e => e.toId && (e.loai === 'bat_dau' || e.loai === 'tiep_tuc')).map(e => e.toId!))];
      for (const d of doan) {
        for (let t = d.start; t <= (d.end ?? now) + 1; t += 86_400_000) {
          for (const to of toCua) toNgay.add(`${to}|${vnDayKey(new Date(Math.min(t, d.end ?? now)))}`);
        }
        for (const to of toCua) toNgay.add(`${to}|${vnDayKey(new Date(d.end ?? now))}`);
      }
    }
    // Giờ chạy TRONG CA (ca chính, trừ nghỉ, bỏ Chủ nhật) — cùng cách đo với báo cáo / mốc chuẩn; giờ đồng hồ tính cả đêm
    // ("1 ngày 22 giờ") dễ hiểu nhầm là giờ làm
    const khungXuong = new Map<string, Array<[number, number]>>();
    for (const xg of [...new Set(st.rows.map(x => String(x.xuong ?? '')).filter(Boolean))]) khungXuong.set(xg, khungCaChinh(await lichCaCuaXuong(xg)));
    const gioChayCa = new Map<string, number>();
    for (const x of st.rows) {
      const cdId = String(x.cong_doan_id);
      const khung = khungXuong.get(String(x.xuong ?? ''));
      if (!khung) continue;
      const doan = tinhTrangThai(evtsApp.filter(e => e.congDoanId === cdId), []).doanChay;
      gioChayCa.set(cdId, doan.reduce((a, d) => a + gioTrongCa(d.start, d.end ?? now, khung), 0));
    }
    // Vị trí theo tuyến của hạng mục (thành phần nối nhau theo thứ tự gặp) — hiện công đoạn đúng thứ tự hàng đi
    const viTri = new Map<string, number>();
    for (const t of tuyenTheoThanhPhan(evtsApp)) t.tuyen.forEach(id => { if (!viTri.has(id)) viTri.set(id, viTri.size); });
    const capNgay = [...toNgay].sort((a, b) => (a.split('|')[1] < b.split('|')[1] ? 1 : -1));
    const gioCong = new Map<string, number>();
    await runWithLimit(capNgay.slice(0, 20).map(k => async () => {
      const [to, ngay] = k.split('|');
      const kq = await gioCongToNgay(Number(to), ngay);
      if (!kq) return;
      for (const x of st.rows) {
        const h = kq.theoHangMuc[pairKey(hex, String(x.cong_doan_id))];
        if (h) gioCong.set(String(x.cong_doan_id), (gioCong.get(String(x.cong_doan_id)) ?? 0) + h.gioCongThuong + h.gioCongTangCa);
      }
    }), 2);
    const lam = (n: number) => Math.round(n * 100) / 100;

    // Lịch sử MRA (nguon = 'mra'): công đoạn tính riêng từ sự kiện MRA — thời gian chạy + số nhân công gốc
    // (MRA không có quân số nên không phân bổ giờ công; số nhân công gốc có thể đếm trùng)
    const evtsMra = evts.filter(e => laMra.has(e.id));
    const cdMra = [...new Set(evtsMra.map(e => e.congDoanId).filter((x): x is string => !!x))];
    const congDoanMra = cdMra.map(cdId => {
      const cua = evtsMra.filter(e => e.congDoanId === cdId);
      const den = evtsMra.filter(e => (e.loai === 'giao' || e.loai === 'khai_bao_cd') && e.congDoanDenId === cdId);
      const t = tinhTrangThai(cua, den);
      const nc = cua.filter(e => e.loai === 'chia_nguoi' && e.soNguoi !== null).sort((a, b) => a.ts - b.ts);
      return {
        // MRA hay ghi trùng số giao tới => trạng thái lịch sử theo số tổ đã nhận / xong, không theo "chờ nhận"
        hex, congDoanId: cdId, nguon: 'mra' as const,
        trangThai: t.trangThai === 'cho_nhan' || t.trangThai === 'cho_giao'
          ? (t.slNhan > 0 && t.slHoanThanh >= t.slNhan ? 'xong' as const : t.slNhan > 0 ? 'da_nhan' as const : t.trangThai)
          : t.trangThai,
        slGiaoDen: t.slGiaoDen, slNhan: t.slNhan, slHoanThanh: t.slHoanThanh, slGiao: t.slGiao, soNguoi: null,
        dangChayTu: null, suKienCuoi: t.suKienCuoi === null ? null : new Date(t.suKienCuoi).toISOString(), co: [],
        ten: cdMap.get(cdId)?.cd_chi_tiet ?? null, xuong: cdMap.get(cdId)?.xuong ?? null, thuTu: cdMap.get(cdId)?.thu_tu ?? null,
        gioChay: lam(t.doanChay.reduce((a, d) => a + ((d.end ?? t.suKienCuoi ?? d.start) - d.start) / GIO, 0)), gioCong: 0,
        nhanCongMra: nc.length ? nc[nc.length - 1].soNguoi : null,
      };
    });

    // Lịch sử MRA theo xưởng: từ thao tác đầu tới lần hoàn thành / giao cuối
    const thoiGianMra = [...new Set(evtsMra.map(e => xuongCua(e.congDoanId)).filter((x): x is string => !!x))].map(xg => {
      const cua = evtsMra.filter(e => xuongCua(e.congDoanId) === xg);
      const ra = cua.filter(e => e.loai === 'hoan_thanh' || e.loai === 'giao');
      const tu = Math.min(...cua.map(e => e.ts));
      const den = ra.length ? Math.max(...ra.map(e => e.ts)) : null;
      return { xuong: xg, tu: new Date(tu).toISOString(), den: den === null ? null : new Date(den).toISOString() };
    }).sort((a, b) => a.tu.localeCompare(b.tu));

    const ketQua: Row = {
      success: true, available: true, hex,
      gioCongTamTinh: capNgay.length > 20,
      thoiGianMra,
      hangMuc: p ? { ten: p.ten_hang_muc, maCongTrinh: p.ma_cong_trinh, tenCongTrinh: p.ten_cong_trinh, dvt: p.dvt,
        soLuongDonHang: p.so_luong_don_hang_tong === null ? null : Number(p.so_luong_don_hang_tong), xuongChinh: p.xuong_chinh } : null,
      congDoan: [...st.rows.map(x => ({
        ...dongTrangThai(x), ten: cdMap.get(String(x.cong_doan_id))?.cd_chi_tiet ?? null,
        xuong: x.xuong ?? null, thuTu: cdMap.get(String(x.cong_doan_id))?.thu_tu ?? null,
        gioChay: lam(gioChay.get(String(x.cong_doan_id)) ?? 0), gioCong: lam(gioCong.get(String(x.cong_doan_id)) ?? 0),
        gioChayCa: lam(gioChayCa.get(String(x.cong_doan_id)) ?? 0) as number | null,
        viTriTuyen: viTri.get(String(x.cong_doan_id)) ?? null,
        nguon: 'app' as const, nhanCongMra: null as number | null,
      })), ...congDoanMra],
      thoiGianXuong,
      suKien: rows.map(r => ({
        id: r.id, loai: r.loai, congDoanId: r.cong_doan_id, congDoanDenId: r.cong_doan_den_id, soLuong: num(r.so_luong),
        soNguoi: r.so_nguoi, lyDo: r.ly_do_tam_ngung, tienDo: r.tien_do, ghiChu: r.ghi_chu,
        luc: r.device_ts_hieu_chinh, nguon: r.nguon, nguoiGoc: r.nguoi_thao_tac_goc, co: r.co ?? [], duLieu: r.du_lieu ?? null,
        anh: Array.isArray(r.du_lieu?.anh) ? (r.du_lieu.anh as unknown[]).filter(khoaAnhHopLe) : [],
        conHieuLuc: r.loai === 'huy' || conHieuLuc.has(String(r.id)), suaCho: r.sua_cho,
      })).sort((a, b) => new Date(a.luc).getTime() - new Date(b.luc).getTime()),
    };
    res.json(ketQua);
  } catch (e) { fail(res, e, '/api/xuong/hex/:hex'); }
});

// ---------------------------------------------------------------------------
// GET /api/xuong/can-xem?xuong= — cần xem cho quản lý xưởng
// ---------------------------------------------------------------------------
app.get('/api/xuong/can-xem', async (req: Request, res: Response) => {
  try {
    const xuong = typeof req.query.xuong === 'string' ? req.query.xuong.toUpperCase() : '';
    const pv = xuong ? await phamViXem(req.user!.id, xuong) : null;
    if (!pv) return res.status(403).json({ success: false, message: 'Không có quyền quản lý xưởng này' });
    // Tổ trưởng: chỉ thao tác của tổ mình + trạng thái ở công đoạn tổ phụ trách
    const chiTo = pv.chiTo;
    const [sk, st] = await Promise.all([
      pool.query(
        // Kèm số lượng / số người / lý do để mô tả đủ ("Nhận 10 cái"); bỏ thao tác đã huỷ (không còn gì để xem)
        `SELECT id, loai, hex, cong_doan_id, to_id, device_ts_hieu_chinh, server_ts, user_id, user_id_khai, sent_by, co,
                so_luong, so_nguoi, ly_do_tam_ngung, du_lieu
         FROM xuong_su_kien e WHERE xuong = $1 AND co <> '{}' AND server_ts > now() - interval '30 days'
           AND ($2::int[] IS NULL OR e.to_id = ANY($2::int[]))
           AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id)
         ORDER BY server_ts DESC LIMIT 300`, [xuong, chiTo]),
      pool.query(`SELECT * FROM xuong_trang_thai t WHERE xuong = $1 AND co <> '{}'
                    AND ($2::int[] IS NULL OR EXISTS (SELECT 1 FROM xuong_to_cong_doan tc WHERE tc.cong_doan_id = t.cong_doan_id AND tc.to_id = ANY($2::int[])))
                  ORDER BY cap_nhat DESC LIMIT 300`, [xuong, chiTo]),
    ]);
    const info = await thongTinHangMuc([...new Set(st.rows.map(x => String(x.hex)))]);
    res.json({
      success: true, available: true, xuong, chiTo,
      suKien: sk.rows,
      trangThai: st.rows.map(x => dongTrangThai(x, info.get(String(x.hex)))),
    });
  } catch (e) { fail(res, e, '/api/xuong/can-xem'); }
});

// ---------------------------------------------------------------------------
// GET /api/xuong/lich-su?toId= — "Lịch sử hôm nay" (3G): thao tác 24 giờ qua của tổ, kèm quyền huỷ (R7)
// ---------------------------------------------------------------------------
app.get('/api/xuong/lich-su', async (req: Request, res: Response) => {
  try {
    if (!(await coQuyenXuong(req))) return res.status(403).json({ success: false, message: 'Tài khoản chưa được cấp quyền mục Xưởng' });
    const toId = Number(req.query.toId);
    if (!Number.isInteger(toId) || toId <= 0) return res.status(400).json({ success: false, message: 'Thiếu tổ' });
    const me = Number(req.user!.id);
    const [r, quanLy] = await Promise.all([
      pool.query(
        `SELECT e.id, e.loai, e.hex, e.cong_doan_id, e.cong_doan_den_id, e.so_luong, e.so_nguoi, e.ly_do_tam_ngung,
                e.du_lieu, e.device_ts_hieu_chinh, e.server_ts, e.sent_by, e.xuong, u.full_name, u.username,
                c.cd_chi_tiet AS ten_cd, d.cd_chi_tiet AS ten_cd_den,
                EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id) AS da_huy
         FROM xuong_su_kien e
         LEFT JOIN users u ON u.id = e.sent_by
         LEFT JOIN xuong_cong_doan c ON c.id = e.cong_doan_id
         LEFT JOIN xuong_cong_doan d ON d.id = e.cong_doan_den_id
         WHERE e.loai <> 'huy' AND e.server_ts > now() - interval '24 hours'
           AND (e.to_id = $1 OR e.cong_doan_id IN (SELECT cong_doan_id FROM xuong_to_cong_doan WHERE to_id = $1))
         ORDER BY e.device_ts_hieu_chinh DESC LIMIT 300`, [toId]),
      xuongQuanLy(me),
    ]);
    const info = await thongTinHangMuc([...new Set(r.rows.filter(x => x.hex).map(x => String(x.hex)))]);
    const now = Date.now();
    res.json({
      success: true, available: true,
      suKien: r.rows.map(x => ({
        id: String(x.id), loai: x.loai, hex: x.hex, congDoanId: x.cong_doan_id, tenCongDoan: x.ten_cd,
        tenCongDoanDen: x.ten_cd_den, soLuong: num(x.so_luong), soNguoi: x.so_nguoi, lyDo: x.ly_do_tam_ngung,
        duLieu: x.du_lieu, luc: x.device_ts_hieu_chinh, nguoi: x.full_name || x.username || null,
        tenHangMuc: x.hex ? (info.get(String(x.hex))?.ten_hang_muc ?? null) : null,
        daHuy: !!x.da_huy,
        huyDuoc: !x.da_huy && ((Number(x.sent_by) === me && now - new Date(x.server_ts).getTime() <= HUY_TRONG_MS)
          || quanLyDuoc(quanLy, x.xuong ?? null)),
      })),
    });
  } catch (e) { fail(res, e, '/api/xuong/lich-su'); }
});

// ---------------------------------------------------------------------------
// GET /api/xuong/gioi-han-nhan?hex=&toId= — số tối đa nhận được ở từng công đoạn của tổ (màn Nhận chặn trước)
// ---------------------------------------------------------------------------
app.get('/api/xuong/gioi-han-nhan', async (req: Request, res: Response) => {
  try {
    if (!(await coQuyenXuong(req))) return res.status(403).json({ success: false, message: 'Tài khoản chưa được cấp quyền mục Xưởng' });
    const hex = String(req.query.hex ?? '');
    const toId = Number(req.query.toId);
    if (!HEX_RE.test(hex) || !Number.isInteger(toId) || toId <= 0) return res.status(400).json({ success: false, message: 'Thiếu mã hạng mục / tổ' });
    const cds = (await pool.query('SELECT cong_doan_id FROM xuong_to_cong_doan WHERE to_id = $1', [toId])).rows.map(x => String(x.cong_doan_id));
    const gh = await gioiHanNhan(pool, cds.map(cd => [hex, cd] as [string, string]));
    res.json({ success: true, available: true, congDoan: cds.map(cd => ({ congDoanId: cd, ...gh.get(`${hex}|${cd}`)! })) });
  } catch (e) { fail(res, e, '/api/xuong/gioi-han-nhan'); }
});

// ---------------------------------------------------------------------------
// GET /api/xuong/tim-hex?q=&toId= — gợi ý khi gõ mã (7B): việc của tổ trước, rồi hạng mục trong bảng sản xuất.
// q có chữ (≥ 2 ký tự) => tìm theo tên hạng mục / tên hoặc mã công trình (Tra cứu)
// ---------------------------------------------------------------------------
app.get('/api/xuong/tim-hex', async (req: Request, res: Response) => {
  try {
    if (!(await coQuyenXuong(req))) return res.status(403).json({ success: false, message: 'Tài khoản chưa được cấp quyền mục Xưởng' });
    const raw = String(req.query.q ?? '').trim().slice(0, 80);
    if (/\p{L}/u.test(raw)) {
      if (raw.length < 2) return res.json({ success: true, available: true, ketQua: [] });
      const mauChu = `%${raw.replace(/[\\%_]/g, c => `\\${c}`)}%`;
      const r = await pool.query(
        `SELECT DISTINCT ON (hex::text) hex::text AS hex, ten_hang_muc, ten_cong_trinh FROM production_status_app
         WHERE hex IS NOT NULL AND (ten_hang_muc ILIKE $1 OR ten_cong_trinh ILIKE $1 OR ma_cong_trinh ILIKE $1)
         ORDER BY hex::text DESC LIMIT 30`, [mauChu]);
      return res.json({
        success: true, available: true,
        ketQua: r.rows.filter(x => HEX_RE.test(String(x.hex))).slice(0, 15).map(x => ({
          hex: String(x.hex), cuaTo: false, tenHangMuc: x.ten_hang_muc ?? null, tenCongTrinh: x.ten_cong_trinh ?? null,
        })),
      });
    }
    const q = raw.replace(/\D/g, '').slice(0, 9);
    if (q.length < 3) return res.json({ success: true, available: true, ketQua: [] });
    const toId = Number(req.query.toId);
    const mau = `%${q}%`;
    const cuaTo = Number.isInteger(toId) && toId > 0
      ? (await pool.query(
          `SELECT DISTINCT t.hex FROM xuong_trang_thai t
           WHERE t.hex LIKE $1 AND t.trang_thai <> 'xong'
             AND (t.cong_doan_id IN (SELECT cong_doan_id FROM xuong_to_cong_doan WHERE to_id = $2)) LIMIT 10`, [mau, toId])).rows.map(x => String(x.hex))
      : [];
    const khac = await pool.query(
      `SELECT DISTINCT hex::text AS hex FROM production_status_app WHERE hex IS NOT NULL AND hex::text LIKE $1 LIMIT 10`, [mau]);
    const ds = [...new Set([...cuaTo, ...khac.rows.map(x => String(x.hex))])].filter(h => HEX_RE.test(h)).slice(0, 10);
    const info = await thongTinHangMuc(ds);
    res.json({
      success: true, available: true,
      ketQua: ds.map(h => ({
        hex: h, cuaTo: cuaTo.includes(h),
        tenHangMuc: info.get(h)?.ten_hang_muc ?? null, tenCongTrinh: info.get(h)?.ten_cong_trinh ?? null,
      })),
    });
  } catch (e) { fail(res, e, '/api/xuong/tim-hex'); }
});

// ---------------------------------------------------------------------------
// GET /api/xuong/danh-muc?xuong= — công đoạn, tổ, lịch ca
// ---------------------------------------------------------------------------
app.get('/api/xuong/danh-muc', async (req: Request, res: Response) => {
  try {
    if (!(await coQuyenXuong(req))) return res.status(403).json({ success: false, message: 'Tài khoản chưa được cấp quyền mục Xưởng' });
    const xuong = typeof req.query.xuong === 'string' && req.query.xuong ? req.query.xuong.toUpperCase() : null;
    const [cd, to, tc, lc] = await Promise.all([
      pool.query(`SELECT id, xuong, ten_cd, cd_tach_ma, cd_chi_tiet, thu_tu, la_bao_bi FROM xuong_cong_doan
                  WHERE active AND ($1::text IS NULL OR xuong = $1) ORDER BY xuong, thu_tu, cd_chi_tiet`, [xuong]),
      pool.query(`SELECT id, xuong, ten_to, to_truong_user_id FROM xuong_to WHERE active AND ($1::text IS NULL OR xuong = $1)
                  ORDER BY xuong, ten_to`, [xuong]),
      pool.query(`SELECT to_id, cong_doan_id FROM xuong_to_cong_doan`),
      pool.query(`SELECT xuong, loai_ca, to_char(gio_bat_dau,'HH24:MI') AS bd, to_char(gio_ket_thuc,'HH24:MI') AS kt, nghi
                  FROM xuong_lich_ca WHERE $1::text IS NULL OR xuong IN ($1, '*') ORDER BY xuong, loai_ca`, [xuong]),
    ]);
    res.json({
      success: true, available: true,
      congDoan: cd.rows.map(x => ({ id: x.id, xuong: x.xuong, tenCd: x.ten_cd, cdTachMa: x.cd_tach_ma, ten: x.cd_chi_tiet, thuTu: x.thu_tu, laBaoBi: x.la_bao_bi })),
      to: to.rows.map(x => ({
        id: Number(x.id), xuong: x.xuong, ten: x.ten_to, toTruongUserId: x.to_truong_user_id,
        congDoan: tc.rows.filter(t => Number(t.to_id) === Number(x.id)).map(t => t.cong_doan_id),
      })),
      lichCa: lc.rows.map(x => ({ xuong: x.xuong, loaiCa: x.loai_ca, gioBatDau: x.bd, gioKetThuc: x.kt, nghi: x.nghi })),
    });
  } catch (e) { fail(res, e, '/api/xuong/danh-muc'); }
});

// ---------------------------------------------------------------------------
// POST /api/xuong/thu-hoi/:userId — admin thu hồi token + mọi máy Xưởng của một người (R5)
// ---------------------------------------------------------------------------
app.post('/api/xuong/thu-hoi/:userId', async (req: Request, res: Response) => {
  try {
    const access = await loadUserAccess(req.user!.id);
    if (access.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'Chỉ admin được thu hồi' });
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ success: false, message: 'ID không hợp lệ' });
    await pool.query('UPDATE xuong_phien_thiet_bi SET thu_hoi = true WHERE user_id = $1', [userId]);
    await bumpTokenVersion(userId);
    res.json({ success: true, available: true });
  } catch (e) { fail(res, e, '/api/xuong/thu-hoi/:userId'); }
});
