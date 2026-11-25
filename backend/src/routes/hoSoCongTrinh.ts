import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { createCache, cachedByVersions } from '../server/cache.js';
import { app } from '../server/app.js';
import { userHasPermission, MATERIAL_PRICE_PERMISSION } from '../server/permissions.js';

// ============================================================================
// HỒ SƠ CÔNG TRÌNH (người dùng 20/11/2026): 1 công trình theo cây mục
//   1 Thông tin dự án (giá trị / số lượng / PM / PC) · 2 Concept · 3 Danh mục vật liệu · 4 Masterplan
//   5 BOP-BOM-BOT · 6 Biên bản họp · 7 Rủi ro – vướng mắc
// Khoá theo MÃ CT (ma_cong_trinh, vd CT26-116) — không theo tên (tên có nhiều cách viết).
// Tiền: production_status_app / khsx / nhap_kho / xuat_kho / ton_kho / ton_kho_vt = TRIỆU ĐỒNG; vat_tu.thanh_tien = ĐỒNG.
// Concept / Biên bản họp: chưa có trong DB (chỉ ở Drive) — trả null, giao diện ghi rõ.
// ============================================================================

// Mã CT dạng CTxx-xxx, cả mã đơn OEM / xuất khẩu dài (EM24-1035028, DM26-3010000290, NB26-55)
const MA = /^[A-Z]{2,3}\d{2}-[0-9A-Z]{1,12}$/;
const HUY = `(UPPER(COALESCE(tinh_trang_ipo, '')) LIKE '%HỦY%' OR UPPER(COALESCE(tinh_trang_ipo, '')) LIKE '%HUỶ%')`;
// Câu chỉ đọc, tham số là mã CT / danh sách mã => ghép thành hằng, 1 lượt đi-về thay vì 3 (DB ở Mỹ)
const doc = (text: string, params?: unknown[]) => timedQuery(text, params, { gopThamSo: true });
/** Bảng chưa tạo (42P01) => null */
const neuCoBang = async <T>(viec: () => Promise<T>): Promise<T | null> => {
  try {
    return await viec();
  } catch (e) {
    if ((e as { code?: string }).code === '42P01') return null;
    throw e;
  }
};
const so = (v: unknown) => (v == null ? 0 : Number(v) || 0);

const cacheDs = createCache<{ ds: Record<string, unknown>[] }>(1);
// GET /api/ho-so-cong-trinh/danh-sach => [{ ma, ten, pm, pcs, soHex, giaTri }] — ô chọn công trình + danh sách công trình theo PC
app.get('/api/ho-so-cong-trinh/danh-sach', async (_req: Request, res: Response) => {
  try {
    res.json(await cachedByVersions(cacheDs, 'ds', ['production'], async () => {
    const r = await timedQuery(`
      SELECT x.ma, (array_agg(ten ORDER BY n DESC))[1] AS ten, MAX(pc.pcs) AS pcs, (array_agg(pm ORDER BY npm DESC) FILTER (WHERE pm IS NOT NULL))[1] AS pm,
             SUM(n)::int AS so_hex, SUM(gt)::float8 AS gia_tri, MAX(bot)::text AS bot
        FROM (
          SELECT UPPER(TRIM(ma_cong_trinh)) AS ma, ten_cong_trinh AS ten, NULLIF(TRIM(ten_pm), '') AS pm,
                 count(*) AS n, count(*) AS npm,
                 SUM(CASE WHEN ${HUY} THEN 0 ELSE COALESCE(tri_gia_don_hang_tong, 0) END) AS gt, MAX(bot_du_an) AS bot
            FROM production_status_app
           WHERE UPPER(TRIM(ma_cong_trinh)) ~ '^[A-Z]{2,3}[0-9]{2}-[0-9A-Z]{1,12}$'
           GROUP BY 1, 2, 3) x
        LEFT JOIN (SELECT UPPER(TRIM(ma_cong_trinh)) AS ma, string_agg(DISTINCT TRIM(ten_pc), '|') AS pcs
                     FROM production_status_app WHERE COALESCE(TRIM(ten_pc), '') <> '' GROUP BY 1) pc ON pc.ma = x.ma
       GROUP BY x.ma ORDER BY x.ma DESC`);
    return { ds: r.rows.map(x => ({ ma: x.ma, ten: x.ten, pm: x.pm, pcs: x.pcs ? String(x.pcs).split('|') : [], soHex: x.so_hex, giaTri: so(x.gia_tri), bot: x.bot })) };
    }, '', 'ho-so-ct/danh-sach', false));
  } catch (e) {
    console.error('[ho-so-cong-trinh/danh-sach]', e);
    res.status(500).json({ error: 'Không đọc được danh sách công trình' });
  }
});

// GET /api/ho-so-cong-trinh/:ma => toàn bộ 7 mục của 1 công trình
// GET /api/ho-so-cong-trinh/anh-vl/:hash => bytes ảnh mẫu vật liệu (bảng ct_vl_anh — tool nap_danh_muc_vl.py)
app.get('/api/ho-so-cong-trinh/anh-vl/:hash', async (req: Request, res: Response) => {
  const h = String(req.params.hash ?? '');
  if (!/^[0-9a-f]{40}$/.test(h)) { res.status(400).json({ error: 'Sai mã ảnh' }); return; }
  try {
    const r = await timedQuery(`SELECT data FROM ct_vl_anh WHERE hash = $1`, [h]);
    const d = r.rows[0]?.data;
    if (!Buffer.isBuffer(d)) { res.status(404).json({ error: 'Không có ảnh' }); return; }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');   // hash = nội dung => không đổi
    res.send(d);
  } catch (e) {
    if ((e as { code?: string }).code === '42P01') { res.status(404).json({ error: 'Không có ảnh' }); return; }
    console.error('[ho-so-cong-trinh/anh-vl]', e);
    res.status(500).json({ error: 'Không đọc được ảnh' });
  }
});

app.get('/api/ho-so-cong-trinh/:ma', async (req: Request, res: Response) => {
  const ma = String(req.params.ma ?? '').trim().toUpperCase();
  if (!MA.test(ma)) { res.status(400).json({ error: 'Sai mã công trình (vd CT26-116)' }); return; }
  try {
    const coGia = await userHasPermission(req, MATERIAL_PRICE_PERMISSION);
    const W = `UPPER(TRIM(ma_cong_trinh)) = $1`;
    const [dau, nguoi, ipo, bop, kho, khsx, nhapThang, tkbv, botTh, botCd, khnk, pr, prDong, tonVt, bopM2, nvl, vm, khsxDong, danhMucVl, bienBan, hm, tl] = await Promise.all([
      // 1. Thông tin chung (mode các cột lặp theo HEX)
      doc(`SELECT
          (SELECT ten_cong_trinh FROM production_status_app WHERE ${W} GROUP BY 1 ORDER BY count(*) DESC LIMIT 1) AS ten,
          (SELECT khach_hang FROM production_status_app WHERE ${W} AND COALESCE(TRIM(khach_hang), '') <> '' GROUP BY 1 ORDER BY count(*) DESC LIMIT 1) AS khach_hang,
          (SELECT khu_vuc_du_an FROM production_status_app WHERE ${W} AND COALESCE(TRIM(khu_vuc_du_an), '') <> '' GROUP BY 1 ORDER BY count(*) DESC LIMIT 1) AS khu_vuc,
          (SELECT nhom_ct FROM production_status_app WHERE ${W} AND COALESCE(TRIM(nhom_ct), '') <> '' GROUP BY 1 ORDER BY count(*) DESC LIMIT 1) AS nhom_ct,
          (SELECT tinh_trang_du_an FROM production_status_app WHERE ${W} AND COALESCE(TRIM(tinh_trang_du_an), '') <> '' GROUP BY 1 ORDER BY count(*) DESC LIMIT 1) AS tinh_trang_du_an,
          (SELECT to_char(MAX(bot_du_an), 'YYYY-MM-DD') FROM production_status_app WHERE ${W}) AS bot_du_an,
          (SELECT to_char(MIN(ngay_nhan_tu_pm), 'YYYY-MM-DD') FROM production_status_app WHERE ${W}) AS nhan_tu_pm,
          (SELECT to_char(MAX(ngay_nhan_tu_pm), 'YYYY-MM-DD') FROM production_status_app WHERE ${W}) AS nhan_tu_pm_cuoi,
          (SELECT count(*) FROM production_status_app WHERE ${W})::int AS so_hex,
          (SELECT COALESCE(SUM(CASE WHEN ${HUY} THEN 0 ELSE tri_gia_don_hang_tong END), 0) FROM production_status_app WHERE ${W})::float8 AS gia_tri,
          (SELECT COALESCE(SUM(CASE WHEN ${HUY} THEN 0 ELSE LEAST(GREATEST(COALESCE(thanh_tien_nhap_kho_luy_ke, 0), 0), GREATEST(COALESCE(tri_gia_don_hang_tong, 0), 0)) END), 0)
             FROM production_status_app WHERE ${W})::float8 AS da_nhap_hm,
          (SELECT COALESCE(SUM(CASE WHEN ${HUY} THEN 0 ELSE thanh_tien_tinh_phieu END), 0) FROM production_status_app WHERE ${W})::float8 AS tinh_phieu`, [ma]),
      // PM / PC (mọi cách ghi + số hạng mục)
      doc(`SELECT 'pm' AS vai, TRIM(ten_pm) AS ten, count(*)::int AS n FROM production_status_app WHERE ${W} AND COALESCE(TRIM(ten_pm), '') <> '' GROUP BY 2
                  UNION ALL
                  SELECT 'pc', TRIM(ten_pc), count(*)::int FROM production_status_app WHERE ${W} AND COALESCE(TRIM(ten_pc), '') <> '' GROUP BY 2
                  ORDER BY 1, 3 DESC`, [ma]),
      // Theo tình trạng IPO: số HEX, giá trị, số lượng (đơn vị khác nhau => chỉ để tham khảo theo ĐVT)
      doc(`SELECT COALESCE(NULLIF(TRIM(tinh_trang_ipo), ''), '(trống)') AS ipo, count(*)::int AS so_hex,
                         COALESCE(SUM(tri_gia_don_hang_tong), 0)::float8 AS gia_tri
                    FROM production_status_app WHERE ${W} GROUP BY 1 ORDER BY 1`, [ma]),
      // 5. BOP: công đoạn hiện tại của hạng mục (bỏ HỦY), giá trị còn lại
      doc(`SELECT COALESCE(NULLIF(TRIM(bop), ''), '(trống)') AS bop, count(*)::int AS so_hex,
                         COALESCE(SUM(tri_gia_don_hang_tong), 0)::float8 AS gia_tri,
                         COALESCE(SUM(GREATEST(COALESCE(tri_gia_don_hang_tong, 0) - LEAST(GREATEST(COALESCE(thanh_tien_nhap_kho_luy_ke, 0), 0), GREATEST(COALESCE(tri_gia_don_hang_tong, 0), 0)), 0)), 0)::float8 AS con_lai
                    FROM production_status_app WHERE ${W} AND NOT ${HUY} GROUP BY 1 ORDER BY 1`, [ma]),
      // Nhập / xuất / tồn theo 3 bảng kho (như Bảng KHNK)
      doc(`SELECT
          (SELECT COALESCE(SUM(thanh_tien_nhap_kho), 0) FROM nhap_kho WHERE ${W})::float8 AS nhap,
          (SELECT COALESCE(SUM(thanh_tien_xuat_kho), 0) FROM xuat_kho WHERE ${W})::float8 AS xuat,
          (SELECT COALESCE(SUM(gia_tri_num), 0) FROM ton_kho WHERE ${W} AND date_parsed = (SELECT max(date_parsed) FROM ton_kho))::float8 AS ton,
          (SELECT max(date_parsed)::text FROM ton_kho) AS ngay_ton`, [ma]),
      // 4. Masterplan: KH sản xuất tháng / tuần
      doc(`SELECT UPPER(TRIM(phan_loai_kh)) AS loai, nam::int AS nam, thang::int AS thang, tuan::int AS tuan,
                         count(DISTINCT hex)::int AS so_hex, COALESCE(SUM(thanh_tien_ke_hoach_num), 0)::float8 AS gia_tri
                    FROM khsx k WHERE UPPER(TRIM(k.ma_cong_trinh)) = $1
                     AND NOT EXISTS (SELECT 1 FROM production_status_app p WHERE p.hex = k.hex AND ${HUY.replace(/tinh_trang_ipo/g, 'p.tinh_trang_ipo')})
                   GROUP BY 1, 2, 3, 4 ORDER BY 2, 3, 4`, [ma]),
      doc(`SELECT to_char(date_parsed, 'YYYY-MM') AS thang, COALESCE(SUM(thanh_tien_nhap_kho), 0)::float8 AS gia_tri, count(DISTINCT hex)::int AS so_hex
                    FROM nhap_kho WHERE ${W} AND date_parsed IS NOT NULL GROUP BY 1 ORDER BY 1`, [ma]),
      // 2/4. Triển khai bản vẽ
      doc(`SELECT COALESCE(NULLIF(TRIM(tinh_trang_trien_khai_ban_ve), ''), '(trống)') AS tt, count(*)::int AS so_hex,
                         to_char(MIN(ngay_trien_khai_ban_ve), 'YYYY-MM-DD') AS tu, to_char(MAX(ngay_trien_khai_ban_ve), 'YYYY-MM-DD') AS den
                    FROM production_status_app WHERE ${W} AND NOT ${HUY} GROUP BY 1 ORDER BY 2 DESC`, [ma]),
      // 5. BOT: ngày cần giao (file tổng hợp BOT)
      doc(`SELECT to_char(MIN(ngay_can_giao), 'YYYY-MM-DD') AS tu, to_char(MAX(ngay_can_giao), 'YYYY-MM-DD') AS den, count(*)::int AS so_hex,
                         COALESCE(SUM(tt_con_lai), 0)::float8 AS con_lai
                    FROM bot_tong_hop WHERE UPPER(TRIM(ma_ct)) = $1
                     AND UPPER(COALESCE(ipo, '')) NOT LIKE '%HỦY%' AND UPPER(COALESCE(ipo, '')) NOT LIKE '%HUỶ%'`, [ma]),
      // BOT công đoạn (BOT nhập theo công đoạn)
      doc(`SELECT b.cong_doan, count(DISTINCT b.hex)::int AS so_hex, to_char(MIN(b.ngay), 'YYYY-MM-DD') AS tu, to_char(MAX(b.ngay), 'YYYY-MM-DD') AS den
                    FROM bot_cong_doan b JOIN (SELECT DISTINCT hex::text AS hex FROM production_status_app WHERE ${W} AND NOT ${HUY}) p ON p.hex = b.hex::text
                   GROUP BY 1 ORDER BY 1`, [ma]),
      // KHNK theo tháng (sheet năm của PRODUCTION STATUS.xlsx)
      doc(`SELECT sheet, tieu_de, dong FROM khnk_sheet ORDER BY nap_luc DESC LIMIT 1`),
      // 3. Danh mục vật liệu: PR / PO (vat_tu, khớp trackingno = mã CT)
      doc(`SELECT COALESCE(NULLIF(TRIM(trang_thai), ''), '(trống)') AS tt, count(*)::int AS so_dong, count(DISTINCT so_pr)::int AS so_pr,
                         COALESCE(SUM(thanh_tien), 0)::float8 AS thanh_tien, count(*) FILTER (WHERE COALESCE(thanh_tien, 0) > 0)::int AS co_gia
                    FROM vat_tu WHERE UPPER(TRIM(trackingno)) = $1 GROUP BY 1 ORDER BY 1`, [ma]),
      doc(`SELECT trang_thai, so_pr, pr_line, ma_vat_tu_sap, ten_vat_tu, nhom_vt, dvt, so_luong_yeu_cau, so_luong_con_lai, so_po, nha_cung_cap,
                         to_char(ngay_pr, 'YYYY-MM-DD') AS ngay_pr, to_char(ngay_can_vat_tu, 'YYYY-MM-DD') AS ngay_can,
                         to_char(ngay_du_kien_giao_hang_pmh_nhap, 'YYYY-MM-DD') AS ngay_du_kien, to_char(ngay_thuc_te_ve, 'YYYY-MM-DD') AS ngay_ve,
                         code_vat_lieu, team_pr_note, thanh_tien
                    FROM vat_tu WHERE UPPER(TRIM(trackingno)) = $1 ORDER BY trang_thai, ngay_pr DESC NULLS LAST LIMIT 500`, [ma]),
      doc(`SELECT to_char(date, 'YYYY-MM-DD') AS ngay, ma_vat_tu, ten_vat_tu, nhom_vat_tu, so_luong::float8 AS so_luong, dvt, gia_tri::float8 AS gia_tri
                    FROM ton_kho_vt WHERE ${W} AND date = (SELECT max(date) FROM ton_kho_vt)
                   ORDER BY ${coGia ? 'gia_tri' : 'so_luong'} DESC NULLS LAST LIMIT 300`, [ma]),
      doc(`SELECT (SELECT count(*) FROM bop_m2_vat_lieu WHERE UPPER(TRIM(ma_ct)) = $1)::int AS vat_lieu,
                         (SELECT count(*) FROM bop_m2_hex WHERE UPPER(TRIM(ma_ct)) = $1)::int AS hex`, [ma]),
      // 7. Rủi ro: tình trạng NVL theo hạng mục (giao diện tách dòng bằng nvlParse)
      doc(`SELECT hex::text AS hex, ten_hang_muc, bop, tinh_trang_nvl_khac_item_by_item, tinh_trang_nvl_kinh_da_item_by_item,
                         tinh_trang_nvl_sofa_item_by_item, tinh_trang_gcn_chua_ve
                    FROM production_status_app WHERE ${W} AND NOT ${HUY}
                     AND (COALESCE(tinh_trang_nvl_khac_item_by_item, '') <> '' OR COALESCE(tinh_trang_nvl_kinh_da_item_by_item, '') <> ''
                       OR COALESCE(tinh_trang_nvl_sofa_item_by_item, '') <> '' OR COALESCE(tinh_trang_gcn_chua_ve, '') <> '')`, [ma]),
      doc(`SELECT v.id, v.hex, v.category, v.content, v.status, v.priority, v.stage, v.handler, v.bot, v.ten_hang_muc,
                         to_char(v.created_at, 'YYYY-MM-DD') AS ngay, v.is_resolved
                    FROM vuong_mac v
                   WHERE UPPER(TRIM(v.ma_cong_trinh)) = $1
                      OR v.hex IN (SELECT hex::text FROM production_status_app WHERE ${W})
                   ORDER BY v.is_resolved, v.created_at DESC LIMIT 200`, [ma]),
      // 4. Chi tiết KH sản xuất (tháng + tuần) — bấm số ở Masterplan
      doc(`SELECT UPPER(TRIM(phan_loai_kh)) AS loai, nam::int AS nam, thang::int AS thang, tuan::int AS tuan, ngay::text AS ngay,
                         hex::text AS hex, ten_hang_muc, NULLIF(TRIM(xuong_chinh), '') AS xuong, dvt, so_luong_kh::text AS sl,
                         COALESCE(thanh_tien_ke_hoach_num, 0)::float8 AS gia_tri
                    FROM khsx k WHERE UPPER(TRIM(k.ma_cong_trinh)) = $1
                     AND NOT EXISTS (SELECT 1 FROM production_status_app p WHERE p.hex = k.hex AND ${HUY.replace(/tinh_trang_ipo/g, 'p.tinh_trang_ipo')})
                   ORDER BY nam, thang, tuan NULLS FIRST, ngay, hex LIMIT 5000`, [ma]),
      // 3. Danh mục vật liệu (sheet 03_MATERIALS + ảnh mẫu — tool nap_danh_muc_vl.py). Chưa tạo bảng => null
      neuCoBang(async () => {
        const [vl, f] = await Promise.all([
          doc(`SELECT v.dong, v.nhom, v.code, v.mo_ta, v.tt_mau, v.ngay_duyet, v.nhu_cau, v.vi_tri, v.dvt_qs, v.sl_qs, v.ma_sap, v.ten_vt,
                             v.tt_pr, v.tt_vat_tu, v.bop_m2,
                             COALESCE((SELECT array_agg(a.hash ORDER BY a.thu_tu) FROM ct_vl_anh_dong a WHERE a.ma_ct = v.ma_ct AND a.dong = v.dong), '{}') AS anh
                        FROM ct_vl v WHERE v.ma_ct = $1 ORDER BY v.dong`, [ma]),
          doc(`SELECT ten_file, to_char(mtime, 'YYYY-MM-DD HH24:MI') AS sua_luc, to_char(nap_luc, 'YYYY-MM-DD HH24:MI') AS nap_luc, loi
                        FROM ct_vl_file WHERE ma_ct = $1`, [ma]),
        ]);
        return { rows: vl.rows as Record<string, unknown>[], file: (f.rows[0] ?? null) as Record<string, unknown> | null };
      }),
      // 6. Biên bản họp (bảng bien_ban_hop — tool nap_bien_ban_hop.py). Chưa tạo bảng => null
      neuCoBang(async () => (await doc(`SELECT loai, to_char(ngay, 'YYYY-MM-DD') AS ngay, ten_file, drive_id, y_id, chu_de, noi_dung, de_xuat, nguoi, han, khop
                                     FROM bien_ban_hop WHERE ma_ct = $1 ORDER BY ngay DESC NULLS LAST, ten_file, y_id LIMIT 2000`, [ma])).rows as Record<string, unknown>[]),
      // 5. BOP-BOM-BOT dạng pivot như file PRODUCTION STATUS (người dùng 20/11/2026): mỗi HEX 1 dòng — IPO / BOP / phân loại /
      // ĐVT / BOP-M2 / ngày cần giao PC đề xuất lấy theo FILE công trình (cong_trinh_hang_muc, như trang Tổng quan công trình),
      // thiếu thì theo bảng sản xuất; tình trạng phiếu theo bảng sản xuất
      doc(`
      SELECT p.hex::text AS hex,
             COALESCE(NULLIF(TRIM(c.tinh_trang_ipo), ''), NULLIF(TRIM(p.tinh_trang_ipo), ''), '(trống)') AS ipo,
             COALESCE(NULLIF(TRIM(c.bop), ''), NULLIF(TRIM(p.bop), ''), '(trống)') AS bop,
             COALESCE(NULLIF(TRIM(c.phan_loai_nhom_san_pham), ''), NULLIF(TRIM(p.phan_loai_nhom_san_pham), ''), '(trống)') AS pl,
             COALESCE(NULLIF(TRIM(c.dvt), ''), NULLIF(TRIM(p.dvt), ''), '(trống)') AS dvt,
             COALESCE(NULLIF(TRIM(p.tinh_trang_phieu), ''), '(trống)') AS phieu,
             COALESCE(NULLIF(TRIM(c.tinh_trang_bop_m2), ''), '(blank)') AS bom,
             to_char(c.ngay_can_giao_pc, 'YYYY-MM-DD') AS ngay_giao,
             p.ten_hang_muc AS ten, NULLIF(TRIM(p.ten_pc), '') AS pc, NULLIF(TRIM(p.xuong_chinh), '') AS xuong,
             COALESCE(p.tri_gia_don_hang_tong, 0)::float8 AS tri_gia, COALESCE(p.thanh_tien_nhap_kho_luy_ke, 0)::float8 AS da_nhap,
             COALESCE(p.thanh_tien_tinh_phieu, 0)::float8 AS tinh_phieu
        FROM production_status_app p
        LEFT JOIN (SELECT DISTINCT ON (hex) hex, tinh_trang_ipo, bop, phan_loai_nhom_san_pham, dvt, tinh_trang_bop_m2, ngay_can_giao_pc
                     FROM cong_trinh_hang_muc WHERE UPPER(TRIM(ma_cong_trinh)) = $1
                    ORDER BY hex, (COALESCE(tinh_trang_ipo, '') LIKE '04%'), nguon DESC, stt) c ON c.hex = p.hex::text
       WHERE UPPER(TRIM(p.ma_cong_trinh)) = $1`, [ma]),
      // Tài liệu thư mục dự án trên Drive (bảng cong_trinh_tai_lieu). Chưa tạo bảng => null
      neuCoBang(() => doc(`SELECT thu_muc_ct, duong_dan, nhom, ten, la_thu_muc, drive_id, mime, kich_thuoc,
                                          to_char(sua_luc, 'YYYY-MM-DD') AS sua, to_char(quet_luc, 'YYYY-MM-DD HH24:MI') AS quet
                                     FROM cong_trinh_tai_lieu WHERE ma_ct = $1
                                      AND (duong_dan = '' OR NOT la_thu_muc OR array_length(string_to_array(duong_dan, '/'), 1) <= 3)
                                    ORDER BY duong_dan`, [ma])),
    ]);
    const d = dau.rows[0] ?? {};
    if (!d.so_hex) { res.status(404).json({ error: `Không có hạng mục nào của ${ma} trong bảng sản xuất` }); return; }
    // KHNK: dòng của mã trong sheet năm
    const ks = khnk.rows[0];
    let khnkDong: { nhan: string; v: number }[] = [];
    let khnkBot: string | null = null;
    if (ks) {
      const td = (typeof ks.tieu_de === 'string' ? JSON.parse(ks.tieu_de) : ks.tieu_de) as { nhan: string; an: boolean; kieu: string }[];
      const dong = (typeof ks.dong === 'string' ? JSON.parse(ks.dong) : ks.dong) as { o: unknown[] }[];
      const iMa = td.findIndex(t => String(t.nhan).trim().toUpperCase() === 'MÃ CT');
      const iBot = td.findIndex(t => String(t.nhan).trim().toUpperCase() === 'BOT DỰ ÁN');
      const row = iMa >= 0 ? dong.find(x => String(x.o[iMa] ?? '').trim().toUpperCase() === ma) : undefined;
      if (row) {
        khnkBot = iBot >= 0 && typeof row.o[iBot] === 'string' ? String(row.o[iBot]).slice(0, 10) : null;
        khnkDong = td.map((t, i) => ({ t, i }))
          .filter(({ t }) => !t.an && t.kieu === 'so' && /^(KHNK\s*T\s*\d{1,2}|\d{2}-\d{2})$/i.test(String(t.nhan).trim()))
          .map(({ t, i }) => ({ nhan: String(t.nhan).trim(), v: so(row.o[i]) }));
      }
    }
    const k = kho.rows[0] ?? {};
    // 3. Ảnh vật liệu (bảng ban_vt_anh — ảnh mẫu sheet 03_MATERIALS các công trình, nạp bằng nap_anh_vat_tu.py):
    // theo mã SAP của dòng PR / tồn kho vật tư; ưu tiên ảnh của chính công trình, đã duyệt, chắc chắn, mới nhất. Tối đa 6 ảnh / mã.
    // Theo code vật liệu: chỉ ảnh của chính công trình (code VL là mã nội bộ từng công trình). Chưa có bảng => {}.
    const anhTheoMa: Record<string, unknown[]> = {}, anhTheoCode: Record<string, unknown[]> = {};
    try {
      const dsMa = [...new Set([...prDong.rows.map(x => x.ma_vat_tu_sap), ...tonVt.rows.map(x => x.ma_vat_tu)]
        .filter(x => x != null && String(x).trim() !== '').map(x => String(x).trim()))];
      const an = await doc(`
        SELECT id::text AS id, ma_vat_tu, cong_trinh, code_vat_lieu, chac_chan, trang_thai, (UPPER(TRIM(cong_trinh)) = $1) AS cung_ct
          FROM ban_vt_anh
         WHERE trang_thai <> 'an' AND (ma_vat_tu = ANY($2::text[]) OR (UPPER(TRIM(cong_trinh)) = $1 AND COALESCE(TRIM(code_vat_lieu), '') <> ''))
         ORDER BY cung_ct DESC, (trang_thai = 'da_duyet') DESC, chac_chan DESC, created_at DESC, id DESC`, [ma, dsMa]);
      for (const a of an.rows) {
        const anh = { id: Number(a.id), chacChan: !!a.chac_chan, trangThai: a.trang_thai === 'da_duyet' ? 'da_duyet' : 'tu_dong',
          congTrinh: a.cong_trinh ?? null, codeVatLieu: a.code_vat_lieu ?? null, congKhai: false };
        if (a.ma_vat_tu && dsMa.includes(a.ma_vat_tu)) { const l = (anhTheoMa[a.ma_vat_tu] ??= []); if (l.length < 6) l.push(anh); }
        if (a.cung_ct && a.code_vat_lieu) {
          const c = String(a.code_vat_lieu).trim().toUpperCase(); const l = (anhTheoCode[c] ??= []); if (l.length < 6 && !l.some(z => (z as { id: number }).id === anh.id)) l.push(anh);
        }
      }
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== '42P01' && code !== '42703') throw e;
    }
    // Tài liệu thư mục dự án trên Drive (bảng cong_trinh_tai_lieu — tool quet_tai_lieu_ct.py). Chưa tạo bảng => null
    let taiLieu: { thuMuc: string | null; driveId: string | null; quetLuc: string | null; files: Record<string, unknown>[] } | null = null;
    if (tl) {
      const goc = tl.rows.find(x => x.duong_dan === '');
      taiLieu = {
        thuMuc: goc?.thu_muc_ct ?? null, driveId: goc?.drive_id ?? null, quetLuc: tl.rows[0]?.quet ?? null,
        files: tl.rows.filter(x => x.duong_dan !== '').map(x => ({ duongDan: x.duong_dan, nhom: x.nhom, ten: x.ten, laThuMuc: x.la_thu_muc,
          driveId: x.drive_id, mime: x.mime, kichThuoc: x.kich_thuoc == null ? null : Number(x.kich_thuoc), sua: x.sua })),
      };
    }
    res.json({
      ma,
      thongTin: {
        ten: d.ten, khachHang: d.khach_hang, khuVuc: d.khu_vuc, nhomCt: d.nhom_ct, tinhTrangDuAn: d.tinh_trang_du_an,
        botDuAn: d.bot_du_an, botDuAnKhnk: khnkBot, nhanTuPm: d.nhan_tu_pm, nhanTuPmCuoi: d.nhan_tu_pm_cuoi,
        soHex: d.so_hex, giaTri: so(d.gia_tri), daNhapHm: so(d.da_nhap_hm), tinhPhieu: so(d.tinh_phieu),
        pm: nguoi.rows.filter(x => x.vai === 'pm').map(x => ({ ten: x.ten, n: x.n })),
        pc: nguoi.rows.filter(x => x.vai === 'pc').map(x => ({ ten: x.ten, n: x.n })),
        ipo: ipo.rows.map(x => ({ ipo: x.ipo, soHex: x.so_hex, giaTri: so(x.gia_tri) })),
        kho: { nhap: so(k.nhap), xuat: so(k.xuat), ton: so(k.ton), ngayTon: k.ngay_ton ?? null },
      },
      masterplan: {
        khsx: khsx.rows.map(x => ({ loai: x.loai, nam: x.nam, thang: x.thang, tuan: x.tuan, soHex: x.so_hex, giaTri: so(x.gia_tri) })),
        khsxDong: khsxDong.rows.map(x => ({ ...x, gia_tri: so(x.gia_tri) })),
        nhapTheoThang: nhapThang.rows.map(x => ({ thang: x.thang, giaTri: so(x.gia_tri), soHex: x.so_hex })),
        khnk: khnkDong,
        tkbv: tkbv.rows.map(x => ({ tt: x.tt, soHex: x.so_hex, tu: x.tu, den: x.den })),
      },
      bopBomBot: {
        bop: bop.rows.map(x => ({ bop: x.bop, soHex: x.so_hex, giaTri: so(x.gia_tri), conLai: so(x.con_lai) })),
        bom: { vatLieu: so(bopM2.rows[0]?.vat_lieu), hex: so(bopM2.rows[0]?.hex) },
        bot: { canGiaoTu: botTh.rows[0]?.tu ?? null, canGiaoDen: botTh.rows[0]?.den ?? null, soHex: so(botTh.rows[0]?.so_hex), conLai: so(botTh.rows[0]?.con_lai) },
        botCongDoan: botCd.rows.map(x => ({ congDoan: x.cong_doan, soHex: x.so_hex, tu: x.tu, den: x.den })),
      },
      vatLieu: {
        coGia,
        pr: pr.rows.map(x => ({ tt: x.tt, soDong: x.so_dong, soPr: x.so_pr, coGia: x.co_gia, thanhTien: coGia ? so(x.thanh_tien) : null })),
        prTong: pr.rows.reduce((s, x) => s + Number(x.so_dong || 0), 0),
        prDong: prDong.rows.map(x => ({ ...x, thanh_tien: coGia ? so(x.thanh_tien) : null, nha_cung_cap: coGia ? x.nha_cung_cap : null })),
        tonKhoVt: tonVt.rows.map(x => ({ ...x, gia_tri: coGia ? so(x.gia_tri) : null })),
        anhTheoMa, anhTheoCode,
        danhMuc: danhMucVl,
      },
      ruiRo: { nvl: nvl.rows, vuongMac: vm.rows },
      taiLieu,
      hangMuc: hm.rows,
      bienBanHop: bienBan,
    });
  } catch (e) {
    console.error('[ho-so-cong-trinh]', e);
    res.status(500).json({ error: 'Không đọc được hồ sơ công trình' });
  }
});
