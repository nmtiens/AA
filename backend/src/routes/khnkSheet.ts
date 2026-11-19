import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { gzipSync } from 'zlib';
import { app } from '../server/app.js';
import { guiGzip } from '../server/snapshot.js';
import { createCache, cachedByVersions } from '../server/cache.js';
import { numericCol } from '../server/data.js';

// ============================================================================
// KẾ HOẠCH NHẬP KHO THEO THÁNG — nguyên sheet năm (2027...) của PRODUCTION STATUS.xlsx (002_REPORTS\01_PRODUCTION_STATUS)
//   GET /api/khnk-sheet => { coBang, sheet, capNhat (giờ sửa file), napLuc, loi, tieuDe[], dong[] }
// - Bảng khnk_sheet do tool tong_hop_production_status.py (chế độ canh, PC01) nạp mỗi khi file lưu
//   (backend/sql/2026-11-12_khnk_sheet.sql). Tiêu đề / dòng theo đúng sheet: thêm bớt cột tự theo.
// - Nhớ theo giờ nạp: không đổi thì không đọc lại khối JSON. Không tự tải lại theo chu kỳ (DB được ngủ).
// ============================================================================

const TEN = 'PRODUCTION STATUS';
// Nhớ gói đã JSON + gzip: không stringify + nén lại nguyên sheet mỗi request (nội dung gửi y hệt res.json(body))
let nho: { khoa: string; gz: Buffer } | null = null;

app.get('/api/khnk-sheet', async (_req: Request, res: Response) => {
  try {
    // Câu khoá KHÔNG tham số (TEN là hằng trong code) => db.ts gửi cả giao dịch 1 lượt đi-về thay vì 3
    const k = await timedQuery(`SELECT nap_luc::text AS khoa FROM khnk_sheet WHERE ten = '${TEN}'`);
    if (!k.rows.length) return res.json({ coBang: true, tieuDe: [], dong: [] });
    const khoa = String(k.rows[0].khoa);
    if (nho?.khoa !== khoa) {
      const r = await timedQuery(`SELECT sheet, loi, tieu_de, dong,
             to_char(mtime AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS cap_nhat,
             to_char(nap_luc AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS nap_luc
        FROM khnk_sheet WHERE ten = $1`, [TEN]);
      const x = r.rows[0];
      const body = { coBang: true, sheet: x.sheet ?? null, capNhat: x.cap_nhat ?? null, napLuc: x.nap_luc ?? null, loi: x.loi ?? null,
        tieuDe: x.tieu_de ?? [], dong: x.dong ?? [] };
      nho = { khoa, gz: gzipSync(JSON.stringify(body)) };
    }
    guiGzip(res, nho.gz);
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') return res.json({ coBang: false, tieuDe: [], dong: [] });
    console.error('[khnk-sheet]', e);
    res.status(500).json({ error: 'Không đọc được kế hoạch nhập kho' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/khnk-sheet/kho => { kho: { 'CT26-116': { xuat, ton } }, ngayTon } — cột con của "NHẬP KHO (P022)":
//   XUẤT KHO (P025) = Σ thanh_tien_xuat_kho của bảng xuat_kho (mọi phiếu, lũy kế) theo mã công trình
//   TỒN KHO (P023)  = Σ gia_tri của bảng ton_kho tại NGÀY TỒN MỚI NHẤT theo mã công trình
// (người dùng 19/11/2026: lấy từ 2 bảng xuất / tồn, không lấy cột lũy kế của bảng sản xuất). Đơn vị TRIỆU ĐỒNG như sheet.
// Nhớ theo phiên bản 2 bảng xuất / tồn.
// ----------------------------------------------------------------------------
const khoCache = createCache<unknown>(2);
app.get('/api/khnk-sheet/kho', async (_req: Request, res: Response) => {
  try {
    const payload = await cachedByVersions(khoCache, 'kho', ['export', 'stock'], async () => {
      const [xuat, ton] = await Promise.all([
        timedQuery(`SELECT UPPER(TRIM(ma_cong_trinh)) AS ma, COALESCE(SUM(${numericCol('xuat_kho', 'thanh_tien_xuat_kho')}), 0)::float8 AS v
          FROM xuat_kho WHERE COALESCE(TRIM(ma_cong_trinh), '') <> '' GROUP BY 1`),
        timedQuery(`WITH m AS (SELECT max(date_parsed) AS d FROM ton_kho)
          SELECT UPPER(TRIM(t.ma_cong_trinh)) AS ma, COALESCE(SUM(t.gia_tri_num), 0)::float8 AS v, (SELECT d FROM m)::text AS ngay
            FROM ton_kho t, m WHERE t.date_parsed = m.d AND COALESCE(TRIM(t.ma_cong_trinh), '') <> '' GROUP BY 1`),
      ]);
      const kho: Record<string, { xuat: number; ton: number }> = {};
      const o = (ma: string) => (kho[ma] ??= { xuat: 0, ton: 0 });
      for (const x of xuat.rows) o(x.ma).xuat = Number(x.v) || 0;
      for (const x of ton.rows) o(x.ma).ton = Number(x.v) || 0;
      return { kho, ngayTon: ton.rows[0]?.ngay ?? null };
    }, '', '', false);
    res.json(payload);
  } catch (e) {
    console.error('[khnk-sheet/kho]', e);
    res.status(500).json({ error: 'Không đọc được xuất / tồn kho' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/khnk-sheet/thong-tin => { ct: { 'CT26-116': { kv, kh, tksx } } } — bộ lọc Khu vực / Khách hàng của bảng KHNK
// + tksx = Σ thanh_tien_tinh_phieu (TRIỆU) bỏ hạng mục HỦY: cột GT ĐÃ TKSX tính lại trên app (người dùng 19/11/2026 — số
//   của file có chỗ vượt GT đơn hàng làm CHƯA TKSX âm); CHƯA TKSX = GT ĐƠN HÀNG − tksx do giao diện tính.
// (người dùng 19/11/2026). File KHNK không có 2 cột này => lấy từ bảng sản xuất theo mã công trình, mỗi mã lấy giá trị
// xuất hiện nhiều nhất (bỏ trống). Nhớ theo phiên bản bảng sản xuất.
// ----------------------------------------------------------------------------
const ttCache = createCache<unknown>(2);
const modeSql = (col: string) => `SELECT DISTINCT ON (ma) ma, v FROM (
    SELECT UPPER(TRIM(ma_cong_trinh)) AS ma, NULLIF(TRIM(${col}), '') AS v, count(*) AS n
      FROM production_status_app WHERE COALESCE(TRIM(ma_cong_trinh), '') <> '' GROUP BY 1, 2) x
  ORDER BY ma, (v IS NULL), n DESC, v`;
app.get('/api/khnk-sheet/thong-tin', async (_req: Request, res: Response) => {
  try {
    const payload = await cachedByVersions(ttCache, 'tt', ['production'], async () => {
      const [kv, kh, tk] = await Promise.all([timedQuery(modeSql('khu_vuc_du_an')), timedQuery(modeSql('khach_hang')),
        timedQuery(`SELECT UPPER(TRIM(ma_cong_trinh)) AS ma,
               COALESCE(SUM(${numericCol('production_status_app', 'thanh_tien_tinh_phieu')}), 0)::float8 AS v
          FROM production_status_app
         WHERE COALESCE(TRIM(ma_cong_trinh), '') <> '' AND UPPER(COALESCE(tinh_trang_ipo, '')) NOT LIKE '%HỦY%'
         GROUP BY 1`)]);
      const ct: Record<string, { kv: string | null; kh: string | null; tksx: number }> = {};
      const o = (ma: string) => (ct[ma] ??= { kv: null, kh: null, tksx: 0 });
      for (const x of kv.rows) o(x.ma).kv = x.v ?? null;
      for (const x of kh.rows) o(x.ma).kh = x.v ?? null;
      for (const x of tk.rows) o(x.ma).tksx = Number(x.v) || 0;
      return { ct };
    }, '', '', false);
    res.json(payload);
  } catch (e) {
    console.error('[khnk-sheet/thong-tin]', e);
    res.status(500).json({ error: 'Không đọc được khu vực / khách hàng' });
  }
});
