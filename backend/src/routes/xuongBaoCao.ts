import type { Request, Response } from 'express';
import { pool } from '../db.js';
import { app } from '../server/app.js';
import { vnDayKey, runWithLimit } from '../server/common.js';
import { isMissingSchema } from '../notifications.js';
import { fail, xuongQuanLy, quanLyDuoc, thongTinHangMuc, gioCongToNgay, lichCaCuaXuong, dauLichCa } from './xuong.js';

// ============================================================================
// BÁO CÁO XƯỞNG / TỔ (đợt 2 — docs/designs/xuong-checkin.md, mục Màn hình: "theo xưởng / tổ — giờ công so với
// quân số, giờ chờ, hạng mục đang chạy, hàng chờ nhận" + các chỉ số Success Criteria).
//   GET /api/xuong/bao-cao?xuong=&tu=YYYY-MM-DD&den=YYYY-MM-DD   (tối đa 62 ngày)
// Giờ công từng (tổ, ngày) = phân bổ theo quân số (allocation.ts, qua gioCongToNgay). Ngày đã qua được lưu ở bảng
// xuong_gio_cong_ngay (backend/sql/2026-10-12_xuong_bao_cao.sql) theo phiên bản sổ; mỗi lần gọi tính thêm tối đa
// TINH_TOI_DA ngày còn thiếu, trả `conThieu` để màn hình gọi lại tới khi đủ (giữ mỗi request < 8 giây).
// ============================================================================

const TINH_TOI_DA = 30;
const NGAY_RE = /^\d{4}-\d{2}-\d{2}$/;
type KetQuaNgay = NonNullable<Awaited<ReturnType<typeof gioCongToNgay>>>;

/** Lịch ca đổi: bỏ kết quả đã lưu của các tổ trong xưởng ('*' = mọi xưởng) */
export async function xoaGioCongLuu(xuong: string) {
  try {
    if (xuong === '*') await pool.query('DELETE FROM xuong_gio_cong_ngay');
    else await pool.query('DELETE FROM xuong_gio_cong_ngay WHERE to_id IN (SELECT id FROM xuong_to WHERE xuong = $1)', [xuong]);
  } catch (e) {
    if (!isMissingSchema(e)) throw e;
  }
}

const cong = (a: { thuong: number; tangCa: number }, b: { thuong: number; tangCa: number }) => {
  a.thuong += b.thuong; a.tangCa += b.tangCa;
};
const lam = (n: number) => Math.round(n * 100) / 100;
const minN = (a: number, b: number) => (a > 0 && b > 0 ? Math.min(a, b) : a || b); // số người ít nhất (bỏ 0 = chưa có)


app.get('/api/xuong/bao-cao', async (req: Request, res: Response) => {
  try {
    const xuong = String(req.query.xuong ?? '').toUpperCase();
    const ds = await xuongQuanLy(req.user!.id);
    if (!xuong || !quanLyDuoc(ds, xuong)) return res.status(403).json({ success: false, message: 'Cần quyền quản lý xưởng này' });
    const homNay = vnDayKey(new Date());
    const den = typeof req.query.den === 'string' && NGAY_RE.test(req.query.den) ? req.query.den : homNay;
    const tu = typeof req.query.tu === 'string' && NGAY_RE.test(req.query.tu) ? req.query.tu : den;
    const soNgay = (Date.parse(den) - Date.parse(tu)) / 86_400_000;
    if (soNgay < 0 || soNgay > 62) return res.status(400).json({ success: false, message: 'Khoảng ngày phải từ 1 tới 63 ngày' });

    const toRows = (await pool.query('SELECT id, ten_to, active FROM xuong_to WHERE xuong = $1 ORDER BY ten_to', [xuong])).rows;
    const toIds = toRows.map(t => Number(t.id));
    const [pb, kpiNk, kpiGui, hienTai, qsNgay, nhanNgay, xongNgay] = await Promise.all([
      pool.query(`SELECT to_id, to_char(ngay,'YYYY-MM-DD') AS ngay, v FROM xuong_phien_ban
                  WHERE to_id = ANY($1::int[]) AND ngay BETWEEN $2::date AND $3::date ORDER BY ngay`, [toIds, tu, den]),
      // Nhật ký công đoạn có đủ Bắt đầu và Hoàn thành (cặp hex × công đoạn có bắt đầu / hoàn thành trong kỳ)
      pool.query(
        `WITH hl AS (SELECT * FROM xuong_su_kien e WHERE e.xuong = $1 AND e.nguon = 'app' AND e.loai IN ('bat_dau','hoan_thanh')
                       AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id)),
              cap AS (SELECT DISTINCT hex, cong_doan_id FROM hl
                      WHERE (device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $2::date AND $3::date)
         SELECT count(*)::int AS tong,
                count(*) FILTER (WHERE EXISTS (SELECT 1 FROM hl WHERE hl.hex = cap.hex AND hl.cong_doan_id = cap.cong_doan_id AND hl.loai = 'bat_dau')
                                   AND EXISTS (SELECT 1 FROM hl WHERE hl.hex = cap.hex AND hl.cong_doan_id = cap.cong_doan_id AND hl.loai = 'hoan_thanh'))::int AS du
         FROM cap`, [xuong, tu, den]),
      // Sự kiện tới server trong vòng 1 giờ sau khi bấm (chỉ sự kiện từ máy; bỏ sự kiện ghi lùi giờ "Đã dừng lúc…")
      pool.query(
        `SELECT count(*)::int AS tong, count(*) FILTER (WHERE server_ts - device_ts_hieu_chinh <= interval '1 hour')::int AS nhanh
         FROM xuong_su_kien WHERE xuong = $1 AND device_id IS NOT NULL AND COALESCE(du_lieu->>'ghiLui', '') <> 'true'
           AND (device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $2::date AND $3::date`, [xuong, tu, den]),
      // Hiện tại: hạng mục đang chạy, hàng chờ nhận theo tổ
      pool.query(
        `SELECT tc.to_id, count(*) FILTER (WHERE t.trang_thai = 'dang_lam')::int AS dang_chay,
                count(*) FILTER (WHERE t.sl_giao_den > t.sl_nhan)::int AS cho_nhan,
                count(*) FILTER (WHERE t.trang_thai = 'tam_ngung')::int AS tam_ngung
         FROM xuong_to_cong_doan tc JOIN xuong_trang_thai t ON t.cong_doan_id = tc.cong_doan_id
         WHERE tc.to_id = ANY($1::int[]) GROUP BY tc.to_id`, [toIds]),
      // Quân số chốt theo (tổ, ngày, loại ca) — lần chốt cuối còn hiệu lực
      pool.query(
        `SELECT DISTINCT ON (e.to_id, 2, e.du_lieu->>'loaiCa') e.to_id,
                to_char((e.device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,'YYYY-MM-DD') AS ngay,
                e.du_lieu->>'loaiCa' AS loai_ca, (e.du_lieu->>'soNguoi')::float AS so
         FROM xuong_su_kien e
         WHERE e.to_id = ANY($1::int[]) AND e.loai = 'quan_so'
           AND (e.device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $2::date AND $3::date
           AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id)
         ORDER BY e.to_id, 2, e.du_lieu->>'loaiCa', e.device_ts_hieu_chinh DESC`, [toIds, tu, den]),
      // Hạng mục tổ nhận theo ngày
      pool.query(
        `SELECT e.to_id, to_char((e.device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,'YYYY-MM-DD') AS ngay,
                e.hex, e.cong_doan_id, sum(e.so_luong)::float AS sl
         FROM xuong_su_kien e
         WHERE e.to_id = ANY($1::int[]) AND e.loai = 'nhan' AND e.hex IS NOT NULL
           AND (e.device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $2::date AND $3::date
           AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id)
         GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3`, [toIds, tu, den]),
      // Số lượng tổ làm xong theo ngày
      pool.query(
        `SELECT e.to_id, to_char((e.device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,'YYYY-MM-DD') AS ngay,
                e.hex, e.cong_doan_id, sum(e.so_luong)::float AS sl
         FROM xuong_su_kien e
         WHERE e.to_id = ANY($1::int[]) AND e.loai = 'hoan_thanh' AND e.hex IS NOT NULL
           AND (e.device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $2::date AND $3::date
           AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id)
         GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3`, [toIds, tu, den]),
    ]);

    // Kết quả đã lưu
    let banLuu = true;
    const daLuu = new Map<string, { v: string; kq: KetQuaNgay }>();
    try {
      const r = await pool.query(
        `SELECT to_id, to_char(ngay,'YYYY-MM-DD') AS ngay, v, ket_qua FROM xuong_gio_cong_ngay
         WHERE to_id = ANY($1::int[]) AND ngay BETWEEN $2::date AND $3::date`, [toIds, tu, den]);
      for (const x of r.rows) daLuu.set(`${x.to_id}|${x.ngay}`, { v: String(x.v), kq: x.ket_qua });
    } catch (e) {
      if (!isMissingSchema(e)) throw e;
      banLuu = false;
    }

    // Kết quả đã lưu chỉ dùng được khi tính cùng lịch ca hiện tại (đổi giờ nghỉ / giờ ca thì tính lại)
    const bamHienTai = dauLichCa(await lichCaCuaXuong(xuong));
    const ketQua = new Map<string, KetQuaNgay>();
    const canTinh: Array<{ toId: number; ngay: string; v: string }> = [];
    for (const x of pb.rows) {
      const k = `${x.to_id}|${x.ngay}`;
      const luu = daLuu.get(k);
      if (x.ngay < homNay && luu && luu.v === String(x.v) && luu.kq.bamLichCa === bamHienTai) ketQua.set(k, luu.kq);
      else canTinh.push({ toId: Number(x.to_id), ngay: x.ngay, v: String(x.v) });
    }
    // Hôm nay luôn tính (đổi theo giờ); ngày cũ còn thiếu tính dần, mới trước
    canTinh.sort((a, b) => (a.ngay === homNay ? -1 : b.ngay === homNay ? 1 : b.ngay.localeCompare(a.ngay)));
    const lanNay = canTinh.slice(0, TINH_TOI_DA);
    await runWithLimit(lanNay.map(c => async () => {
      const kq = await gioCongToNgay(c.toId, c.ngay);
      if (!kq) return;
      ketQua.set(`${c.toId}|${c.ngay}`, kq);
      if (banLuu && c.ngay < homNay) {
        await pool.query(
          `INSERT INTO xuong_gio_cong_ngay (to_id, ngay, v, ket_qua) VALUES ($1, $2::date, $3, $4::jsonb)
           ON CONFLICT (to_id, ngay) DO UPDATE SET v = EXCLUDED.v, ket_qua = EXCLUDED.ket_qua, tinh_luc = now()`,
          [c.toId, c.ngay, c.v, JSON.stringify(kq)]);
      }
    }), 2);

    // Gộp theo tổ
    const ht = new Map(hienTai.rows.map(x => [Number(x.to_id), x]));
    const tatCaHex = new Set<string>();
    const quanSoCua = new Map<string, Record<string, number>>(); // `${toId}|${ngay}` -> loại ca -> số người
    for (const x of qsNgay.rows) {
      const k = `${x.to_id}|${x.ngay}`;
      quanSoCua.set(k, { ...(quanSoCua.get(k) ?? {}), [String(x.loai_ca)]: Number(x.so) });
    }
    const nhanCua = new Map<string, Array<{ hex: string; congDoanId: string; soLuong: number }>>();
    for (const x of nhanNgay.rows) {
      const k = `${x.to_id}|${x.ngay}`;
      if (!nhanCua.has(k)) nhanCua.set(k, []);
      nhanCua.get(k)!.push({ hex: String(x.hex), congDoanId: String(x.cong_doan_id), soLuong: lam(Number(x.sl)) });
      tatCaHex.add(String(x.hex));
    }
    const xongCua = new Map<string, Array<{ hex: string; congDoanId: string; soLuong: number }>>();
    for (const x of xongNgay.rows) {
      const k = `${x.to_id}|${x.ngay}`;
      if (!xongCua.has(k)) xongCua.set(k, []);
      xongCua.get(k)!.push({ hex: String(x.hex), congDoanId: String(x.cong_doan_id), soLuong: lam(Number(x.sl)) });
      tatCaHex.add(String(x.hex));
    }
    // Hạng mục đang chạy lúc này (đánh dấu trong ngày hôm nay)
    const dangChayNay = new Set((await pool.query(
      `SELECT DISTINCT t.hex, t.cong_doan_id FROM xuong_to_cong_doan tc JOIN xuong_trang_thai t ON t.cong_doan_id = tc.cong_doan_id
       WHERE tc.to_id = ANY($1::int[]) AND t.trang_thai = 'dang_lam'`, [toIds])).rows.map(x => `${x.hex}|${x.cong_doan_id}`));
    const theoTo = toRows.map(t => {
      const toId = Number(t.id);
      const gioNguoi = { thuong: 0, tangCa: 0 };
      const gioCho = { thuong: 0, tangCa: 0 };
      const gioCong = { thuong: 0, tangCa: 0 };
      const hm = new Map<string, { gioChay: number; thuong: number; tangCa: number; gnk: number; max: number; min: number }>();
      const theoNgay: Array<{
        ngay: string; gioNguoi: number; gioCong: number; gioCongTangCa: number; gioCho: number; co: string[];
        quanSo: Record<string, number>;
        hangMuc: Array<{
          hex: string; congDoanId: string; gioChay: number; gioCongThuong: number; gioCongTangCa: number; dangChay: boolean;
          gioNguoiKhai: number; soNguoiMax: number; soNguoiMin: number;
        }>;
        nhan: Array<{ hex: string; congDoanId: string; soLuong: number }>;
        xong: Array<{ hex: string; congDoanId: string; soLuong: number }>;
        gioChoLyDo: Record<string, number>;
      }> = [];
      const gioChoLyDo: Record<string, number> = {};
      let ngayCoChay = 0; let ngayChot = 0; let khaiVuot = 0;
      for (const x of pb.rows.filter(p => Number(p.to_id) === toId)) {
        const kq = ketQua.get(`${toId}|${x.ngay}`);
        if (!kq) continue;
        cong(gioNguoi, kq.gioNguoiTo); cong(gioCho, kq.gioCho);
        for (const [ly, h] of Object.entries(kq.gioChoLyDo ?? {})) gioChoLyDo[ly] = (gioChoLyDo[ly] ?? 0) + h;
        let gcNgay = 0; let tcNgay = 0; let chay = 0;
        const hmNgay: (typeof theoNgay)[number]['hangMuc'] = [];
        for (const [k, h] of Object.entries(kq.theoHangMuc)) {
          tcNgay += h.gioCongTangCa;
          if (h.gioChay > 0 || h.gioCongThuong + h.gioCongTangCa > 0) {
            hmNgay.push({
              hex: k.split('|')[0], congDoanId: k.split('|')[1], gioChay: lam(h.gioChay),
              gioCongThuong: lam(h.gioCongThuong), gioCongTangCa: lam(h.gioCongTangCa),
              dangChay: x.ngay === homNay && dangChayNay.has(k),
              gioNguoiKhai: lam(h.gioNguoiKhai ?? 0), soNguoiMax: h.soNguoiMax ?? 0, soNguoiMin: h.soNguoiMin ?? 0,
            });
          }
          gioCong.thuong += h.gioCongThuong; gioCong.tangCa += h.gioCongTangCa;
          gcNgay += h.gioCongThuong + h.gioCongTangCa; chay += h.gioChay;
          const cur = hm.get(k) ?? { gioChay: 0, thuong: 0, tangCa: 0, gnk: 0, max: 0, min: 0 };
          cur.gioChay += h.gioChay; cur.thuong += h.gioCongThuong; cur.tangCa += h.gioCongTangCa;
          cur.gnk += h.gioNguoiKhai ?? 0; cur.max = Math.max(cur.max, h.soNguoiMax ?? 0); cur.min = minN(cur.min, h.soNguoiMin ?? 0);
          hm.set(k, cur);
          tatCaHex.add(k.split('|')[0]);
        }
        if (chay > 0) {
          ngayCoChay++;
          if (!kq.co.includes('chua_chot_quan_so')) ngayChot++;
        }
        if (kq.co.includes('khai_vuot_quan_so')) khaiVuot++;
        theoNgay.push({
          ngay: x.ngay, gioNguoi: lam(kq.gioNguoiTo.thuong + kq.gioNguoiTo.tangCa), gioCong: lam(gcNgay), gioCongTangCa: lam(tcNgay),
          gioCho: lam(kq.gioCho.thuong + kq.gioCho.tangCa), co: kq.co,
          quanSo: quanSoCua.get(`${toId}|${x.ngay}`) ?? {},
          hangMuc: hmNgay.sort((a, b) => (b.gioCongThuong + b.gioCongTangCa) - (a.gioCongThuong + a.gioCongTangCa)),
          nhan: nhanCua.get(`${toId}|${x.ngay}`) ?? [],
          xong: xongCua.get(`${toId}|${x.ngay}`) ?? [],
          gioChoLyDo: Object.fromEntries(Object.entries(kq.gioChoLyDo ?? {}).map(([k, v]) => [k, lam(v)])),
        });
      }
      const h = ht.get(toId);
      return {
        toId, ten: t.ten_to, active: t.active,
        gioNguoi: { thuong: lam(gioNguoi.thuong), tangCa: lam(gioNguoi.tangCa) },
        gioCong: { thuong: lam(gioCong.thuong), tangCa: lam(gioCong.tangCa) },
        gioCho: { thuong: lam(gioCho.thuong), tangCa: lam(gioCho.tangCa) },
        ngayCoChay, ngayChot, khaiVuot,
        gioChoLyDo: Object.fromEntries(Object.entries(gioChoLyDo).map(([k, v]) => [k, lam(v)])),
        dangChay: h ? Number(h.dang_chay) : 0, tamNgung: h ? Number(h.tam_ngung) : 0, choNhan: h ? Number(h.cho_nhan) : 0,
        theoNgay,
        theoHangMuc: [...hm.entries()].map(([k, v]) => ({
          hex: k.split('|')[0], congDoanId: k.split('|')[1],
          gioChay: lam(v.gioChay), gioCongThuong: lam(v.thuong), gioCongTangCa: lam(v.tangCa),
          gioNguoiKhai: lam(v.gnk), soNguoiMax: v.max, soNguoiMin: v.min,
        })).sort((a, b) => (b.gioCongThuong + b.gioCongTangCa) - (a.gioCongThuong + a.gioCongTangCa)),
      };
    });
    const info = await thongTinHangMuc([...tatCaHex].slice(0, 2000));
    type CdHm = { congDoanId: string; to: Set<string>; gioChay: number; thuong: number; tangCa: number; slXong: number; gnk: number; max: number; min: number };
    const hmKy = new Map<string, Map<string, CdHm>>();
    const layCd = (hex: string, cd: string) => {
      if (!hmKy.has(hex)) hmKy.set(hex, new Map());
      const m = hmKy.get(hex)!;
      if (!m.has(cd)) m.set(cd, { congDoanId: cd, to: new Set(), gioChay: 0, thuong: 0, tangCa: 0, slXong: 0, gnk: 0, max: 0, min: 0 });
      return m.get(cd)!;
    };
    for (const t of theoTo) {
      for (const h of t.theoHangMuc) {
        const c = layCd(h.hex, h.congDoanId);
        c.to.add(String(t.ten)); c.gioChay += h.gioChay; c.thuong += h.gioCongThuong; c.tangCa += h.gioCongTangCa;
        c.gnk += h.gioNguoiKhai; c.max = Math.max(c.max, h.soNguoiMax); c.min = minN(c.min, h.soNguoiMin);
      }
      for (const n of t.theoNgay) for (const x of n.xong) {
        const c = layCd(x.hex, x.congDoanId);
        c.to.add(String(t.ten)); c.slXong += x.soLuong;
      }
    }
    const ttHm = hmKy.size ? (await pool.query(
      `SELECT hex, cong_doan_id, trang_thai, sl_nhan::float AS sl_nhan, sl_hoan_thanh::float AS sl_ht FROM xuong_trang_thai WHERE hex = ANY($1::text[])`,
      [[...hmKy.keys()]])).rows : [];
    const ttCua = new Map(ttHm.map(x => [`${x.hex}|${x.cong_doan_id}`, x]));
    const cdTen = new Map((await pool.query('SELECT id, cd_chi_tiet FROM xuong_cong_doan WHERE xuong = $1', [xuong])).rows
      .map(x => [String(x.id), String(x.cd_chi_tiet)]));

    // Đối chiếu chấm công (bảng diem_danh — Dữ liệu Điểm danh, theo xưởng × ngày): giờ người các tổ dùng app
    // (quân số × giờ ca) so với giờ công điểm danh của cả xưởng. Xưởng chưa đưa hết tổ lên app thì app < điểm danh.
    let chamCong: {
      moiNhat: string | null;
      theoNgay: Array<{ ngay: string; congNhan: number; gioHc: number; gioTc: number; quanSoApp: number; gioThuongApp: number; gioTangCaApp: number }>;
    } | null = null;
    try {
      const [dd, moi, qs] = await Promise.all([
        pool.query(
          `SELECT to_char(date,'YYYY-MM-DD') AS ngay, sum(so_luong_cong_nhan)::float AS cn, sum(gio_cong_hanh_chinh)::float AS hc,
                  sum(gio_cong_tang_ca)::float AS tc
           FROM diem_danh WHERE upper(trim(xuong_chinh)) = $1 AND date BETWEEN $2::date AND $3::date GROUP BY date ORDER BY date`, [xuong, tu, den]),
        pool.query(`SELECT to_char(max(date),'YYYY-MM-DD') AS d FROM diem_danh WHERE upper(trim(xuong_chinh)) = $1`, [xuong]),
        pool.query(
          `SELECT ngay, sum(so)::float AS so FROM (
             SELECT DISTINCT ON (e.to_id, (e.device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
                    to_char((e.device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,'YYYY-MM-DD') AS ngay, (e.du_lieu->>'soNguoi')::float AS so
             FROM xuong_su_kien e
             WHERE e.to_id = ANY($1::int[]) AND e.loai = 'quan_so' AND e.du_lieu->>'loaiCa' IN ('chinh','chu_nhat')
               AND (e.device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $2::date AND $3::date
               AND NOT EXISTS (SELECT 1 FROM xuong_su_kien h WHERE h.loai = 'huy' AND h.sua_cho = e.id)
             ORDER BY e.to_id, (e.device_ts_hieu_chinh AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, e.device_ts_hieu_chinh DESC) x
           GROUP BY ngay`, [toIds, tu, den]),
      ]);
      const appNgay = new Map<string, { thuong: number; tangCa: number }>();
      for (const x of pb.rows) {
        const kq = ketQua.get(`${x.to_id}|${x.ngay}`);
        if (!kq) continue;
        const a = appNgay.get(x.ngay) ?? { thuong: 0, tangCa: 0 };
        cong(a, kq.gioNguoiTo);
        appNgay.set(x.ngay, a);
      }
      const qsNgay = new Map(qs.rows.map(x => [String(x.ngay), Number(x.so)]));
      const ngays = [...new Set([...dd.rows.map(x => String(x.ngay)), ...appNgay.keys()])].sort();
      chamCong = {
        moiNhat: moi.rows[0]?.d ?? null,
        theoNgay: ngays.map(n => {
          const d = dd.rows.find(x => x.ngay === n);
          const a = appNgay.get(n);
          return {
            ngay: n, congNhan: d ? Number(d.cn) : 0, gioHc: d ? lam(Number(d.hc)) : 0, gioTc: d ? lam(Number(d.tc)) : 0,
            quanSoApp: qsNgay.get(n) ?? 0, gioThuongApp: a ? lam(a.thuong) : 0, gioTangCaApp: a ? lam(a.tangCa) : 0,
          };
        }),
      };
    } catch (e) {
      if (!isMissingSchema(e)) throw e;
    }

    const hangMuc = [...hmKy.entries()].map(([hex, m]) => {
      const congDoan = [...m.values()].map(c => {
        const tt = ttCua.get(`${hex}|${c.congDoanId}`);
        return {
          congDoanId: c.congDoanId, tenCongDoan: cdTen.get(c.congDoanId) ?? c.congDoanId, to: [...c.to].sort(),
          gioChay: lam(c.gioChay), gioCong: lam(c.thuong + c.tangCa), gioCongTangCa: lam(c.tangCa), slXong: lam(c.slXong),
          // Số công nhân bình quân lúc chạy = giờ người khai / giờ chạy
          // giờ chạy rất ngắn (vài phút) làm tròn lệch => không cho vượt số người khai nhiều nhất
          soNguoiTb: c.gioChay > 0 ? lam(Math.min(c.max, c.gnk / c.gioChay)) : 0, soNguoiMax: c.max, soNguoiMin: c.min,
          trangThai: tt ? String(tt.trang_thai) : null, slNhan: tt ? lam(Number(tt.sl_nhan)) : 0, slHoanThanh: tt ? lam(Number(tt.sl_ht)) : 0,
        };
      }).sort((a, b) => b.gioCong - a.gioCong);
      const i = info.get(hex);
      return {
        hex, tenHangMuc: i?.ten_hang_muc ?? null, tenCongTrinh: i?.ten_cong_trinh ?? null, dvt: i?.dvt ?? null,
        soLuongDonHang: i?.so_luong_don_hang_tong ? Number(i.so_luong_don_hang_tong) : null,
        gioCong: lam(congDoan.reduce((a, c) => a + c.gioCong, 0)), slXong: lam(congDoan.reduce((a, c) => a + c.slXong, 0)),
        congDoan,
      };
    }).sort((a, b) => b.gioCong - a.gioCong);

    const tong = theoTo.reduce((a, t) => ({
      ngayCoChay: a.ngayCoChay + t.ngayCoChay, ngayChot: a.ngayChot + t.ngayChot, khaiVuot: a.khaiVuot + t.khaiVuot,
    }), { ngayCoChay: 0, ngayChot: 0, khaiVuot: 0 });
    res.json({
      success: true, available: true, xuong, tu, den, banLuu,
      conThieu: Math.max(0, canTinh.length - lanNay.length),
      chamCong,
      hangMuc,
      chiSo: {
        nhatKy: { tong: kpiNk.rows[0]?.tong ?? 0, du: kpiNk.rows[0]?.du ?? 0 },
        guiTrong1Gio: { tong: kpiGui.rows[0]?.tong ?? 0, nhanh: kpiGui.rows[0]?.nhanh ?? 0 },
        chotQuanSo: { ngayCoChay: tong.ngayCoChay, ngayChot: tong.ngayChot },
        khaiVuotQuanSo: tong.khaiVuot,
      },
      theoTo: theoTo.map(t => ({
        ...t,
        theoNgay: t.theoNgay.map(n => ({
          ...n,
          hangMuc: n.hangMuc.map(x => ({ ...x, tenCongDoan: cdTen.get(x.congDoanId) ?? x.congDoanId, tenHangMuc: info.get(x.hex)?.ten_hang_muc ?? null })),
          nhan: n.nhan.map(x => ({ ...x, tenCongDoan: cdTen.get(x.congDoanId) ?? x.congDoanId, tenHangMuc: info.get(x.hex)?.ten_hang_muc ?? null, dvt: info.get(x.hex)?.dvt ?? null })),
          xong: n.xong.map(x => ({ ...x, tenCongDoan: cdTen.get(x.congDoanId) ?? x.congDoanId, tenHangMuc: info.get(x.hex)?.ten_hang_muc ?? null, dvt: info.get(x.hex)?.dvt ?? null })),
        })).reverse(),
        theoHangMuc: t.theoHangMuc.map(x => ({
          ...x, tenCongDoan: cdTen.get(x.congDoanId) ?? x.congDoanId,
          tenHangMuc: info.get(x.hex)?.ten_hang_muc ?? null, tenCongTrinh: info.get(x.hex)?.ten_cong_trinh ?? null,
        })),
      })),
    });
  } catch (e) { fail(res, e, '/api/xuong/bao-cao'); }
});
