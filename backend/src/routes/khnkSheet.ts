import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { gzipSync } from 'zlib';
import { app } from '../server/app.js';
import { guiGzip } from '../server/snapshot.js';
import { createCache, cachedByVersions } from '../server/cache.js';
import { numericCol, REPORT_COLUMNS } from '../server/data.js';

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
// GET /api/khnk-sheet/kho => { kho: { 'CT26-116': { nhap, xuat, ton } }, ngayTon } — cột "NHẬP KHO (P022)" và 2 cột con:
//   NHẬP KHO (P022) = Σ thanh_tien_nhap_kho của bảng nhap_kho (mọi phiếu, lũy kế) theo mã công trình (người dùng 19/11/2026:
//   nhập / xuất / tồn lấy theo 3 bảng nhập, xuất, tồn — bấm số mở đúng các dòng đó, GET /api/khnk-sheet/kho-dong)
//   XUẤT KHO (P025) = Σ thanh_tien_xuat_kho của bảng xuat_kho (mọi phiếu, lũy kế) theo mã công trình
//   TỒN KHO (P023)  = Σ gia_tri của bảng ton_kho tại NGÀY TỒN MỚI NHẤT theo mã công trình
// (người dùng 19/11/2026: lấy từ 2 bảng xuất / tồn, không lấy cột lũy kế của bảng sản xuất). Đơn vị TRIỆU ĐỒNG như sheet.
// Nhớ theo phiên bản 2 bảng xuất / tồn.
// ----------------------------------------------------------------------------
const khoCache = createCache<unknown>(2);
app.get('/api/khnk-sheet/kho', async (_req: Request, res: Response) => {
  try {
    const payload = await cachedByVersions(khoCache, 'kho', ['inventory', 'export', 'stock'], async () => {
      const [nhap, xuat, ton] = await Promise.all([
        timedQuery(`SELECT UPPER(TRIM(ma_cong_trinh)) AS ma, COALESCE(SUM(${numericCol('nhap_kho', 'thanh_tien_nhap_kho')}), 0)::float8 AS v
          FROM nhap_kho WHERE COALESCE(TRIM(ma_cong_trinh), '') <> '' GROUP BY 1`),
        timedQuery(`SELECT UPPER(TRIM(ma_cong_trinh)) AS ma, COALESCE(SUM(${numericCol('xuat_kho', 'thanh_tien_xuat_kho')}), 0)::float8 AS v
          FROM xuat_kho WHERE COALESCE(TRIM(ma_cong_trinh), '') <> '' GROUP BY 1`),
        timedQuery(`WITH m AS (SELECT max(date_parsed) AS d FROM ton_kho)
          SELECT UPPER(TRIM(t.ma_cong_trinh)) AS ma, COALESCE(SUM(t.gia_tri_num), 0)::float8 AS v, (SELECT d FROM m)::text AS ngay
            FROM ton_kho t, m WHERE t.date_parsed = m.d AND COALESCE(TRIM(t.ma_cong_trinh), '') <> '' GROUP BY 1`),
      ]);
      const kho: Record<string, { nhap: number; xuat: number; ton: number }> = {};
      const o = (ma: string) => (kho[ma] ??= { nhap: 0, xuat: 0, ton: 0 });
      for (const x of nhap.rows) o(x.ma).nhap = Number(x.v) || 0;
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
// GET /api/khnk-sheet/kho-dong?loai=nhap|xuat|ton&ma=CT26-116 => { rows, columns, truncated, ngayTon? } — các dòng của bảng
// nhap_kho / xuat_kho (mọi phiếu) / ton_kho (ngày tồn mới nhất) của 1 mã công trình: khớp số ở cột NHẬP / XUẤT / TỒN của
// bảng KHNK (cùng cách cộng với /kho). Cột theo REPORT_COLUMNS như cửa sổ "Xem chi tiết" của biểu đồ.
// ----------------------------------------------------------------------------
const KHO_DONG: Record<string, { bang: string; ngay: string }> = {
  nhap: { bang: 'nhap_kho', ngay: 'date_parsed' }, xuat: { bang: 'xuat_kho', ngay: 'date_parsed' }, ton: { bang: 'ton_kho', ngay: 'date_parsed' },
};
app.get('/api/khnk-sheet/kho-dong', async (req: Request, res: Response) => {
  const cfg = KHO_DONG[String(req.query.loai ?? '')];
  const ma = String(req.query.ma ?? '').trim().toUpperCase();
  if (!cfg || !/^[A-Z]{2}\d{2}-\d{3}$/.test(ma)) { res.status(400).json({ error: 'Sai loại hoặc mã công trình' }); return; }
  try {
    const cols = (REPORT_COLUMNS as Record<string, string[]>)[cfg.bang] ?? [];
    if (!cols.length) { res.status(400).json({ error: 'Bảng không được hỗ trợ' }); return; }
    const GIOI_HAN = 10000;
    const dkNgay = cfg.bang === 'ton_kho' ? ` AND ${cfg.ngay} = (SELECT max(${cfg.ngay}) FROM ton_kho)` : '';
    const q = await timedQuery(`SELECT ${cols.map(c => `"${c}"`).join(', ')} FROM ${cfg.bang}
       WHERE UPPER(TRIM(ma_cong_trinh)) = $1${dkNgay}
       ORDER BY ${cfg.ngay} DESC NULLS LAST LIMIT ${GIOI_HAN + 1}`, [ma]);
    const cat = q.rows.length > GIOI_HAN;
    res.json({ rows: cat ? q.rows.slice(0, GIOI_HAN) : q.rows, columns: cols, truncated: cat });
  } catch (e) {
    console.error('[khnk-sheet/kho-dong]', e);
    res.status(500).json({ error: 'Không đọc được dòng nhập / xuất / tồn kho' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/khnk-sheet/kho-dong-chuan?loai=nhap|xuat|ton&ma=CT26-116 => { rows: [{ ngay, hex, hang_muc, cong_trinh, so_luong, dvt,
// gia_tri }], tong, ngayTon } — cửa sổ chung Nhập / Xuất / Tồn (người dùng 20/11/2026): 3 bảng kho cùng 1 bộ cột.
// Nhập / xuất: mọi phiếu (lũy kế); tồn: ngày tồn mới nhất. Giá trị triệu đồng (cùng cách cộng với /kho => tổng = số trên bảng).
// ----------------------------------------------------------------------------
const KHO_CHUAN: Record<string, { bang: string; sl: string; gt: string; hm: string }> = {
  nhap: { bang: 'nhap_kho', sl: 'so_luong_nhap_kho', gt: numericCol('nhap_kho', 'thanh_tien_nhap_kho'), hm: 'ten_hang_muc' },
  xuat: { bang: 'xuat_kho', sl: 'so_luong_xuat_kho', gt: numericCol('xuat_kho', 'thanh_tien_xuat_kho'), hm: 'ten_hang_muc' },
  ton: { bang: 'ton_kho', sl: 'so_luong', gt: 'gia_tri_num', hm: 'ten_san_pham' },
};
app.get('/api/khnk-sheet/kho-dong-chuan', async (req: Request, res: Response) => {
  const cfg = KHO_CHUAN[String(req.query.loai ?? '')];
  const ma = String(req.query.ma ?? '').trim().toUpperCase();
  if (!cfg || !/^[A-Z]{2,3}\d{2}-[0-9A-Z]{1,12}$/.test(ma)) { res.status(400).json({ error: 'Sai loại hoặc mã công trình' }); return; }
  try {
    const dk = cfg.bang === 'ton_kho' ? ' AND date_parsed = (SELECT max(date_parsed) FROM ton_kho)' : '';
    const q = await timedQuery(`SELECT to_char(date_parsed, 'YYYY-MM-DD') AS ngay, (hex)::bigint::text AS hex, ${cfg.hm} AS hang_muc,
                                       ten_cong_trinh AS cong_trinh, (${cfg.sl})::float8 AS so_luong, dvt, (${cfg.gt})::float8 AS gia_tri
                                  FROM ${cfg.bang} WHERE UPPER(TRIM(ma_cong_trinh)) = $1${dk}
                                 ORDER BY date_parsed DESC NULLS LAST, hex LIMIT 20001`, [ma]);
    const cat = q.rows.length > 20000;
    const rows = cat ? q.rows.slice(0, 20000) : q.rows;
    res.json({ rows, cat, ngayTon: cfg.bang === 'ton_kho' ? (rows[0]?.ngay ?? null) : null });
  } catch (e) {
    console.error('[khnk-sheet/kho-dong-chuan]', e);
    res.status(500).json({ error: 'Không đọc được dòng nhập / xuất / tồn' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/khnk-sheet/kho-chenh?ma=CT26-116 => { rows: [{ hex, hang_muc, nhap, xuat, ton, chenh }], ngayTon } — cột CHÊNH
// (nhập − xuất − tồn) của bảng KHNK tách theo HEX, cùng 3 nguồn với /kho (nhap_kho, xuat_kho lũy kế; ton_kho ngày mới nhất)
// nên tổng các dòng = số trên bảng (người dùng 20/11/2026: cửa sổ riêng cho cột chênh). Dòng không HEX gom "(không HEX)".
// ----------------------------------------------------------------------------
app.get('/api/khnk-sheet/kho-chenh', async (req: Request, res: Response) => {
  const ma = String(req.query.ma ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2,3}\d{2}-[0-9A-Z]{1,12}$/.test(ma)) { res.status(400).json({ error: 'Sai mã công trình' }); return; }
  try {
    const W = 'UPPER(TRIM(ma_cong_trinh)) = $1';
    const hx = (c: string) => `COALESCE((${c})::bigint::text, '(không HEX)')`;   // hex số thực => chuỗi số nguyên như bảng sản xuất
    const q = await timedQuery(`
      WITH n AS (SELECT ${hx('hex')} AS hex, SUM(${numericCol('nhap_kho', 'thanh_tien_nhap_kho')}) AS v, MAX(ten_hang_muc) AS hm FROM nhap_kho WHERE ${W} GROUP BY 1),
           x AS (SELECT ${hx('hex')} AS hex, SUM(${numericCol('xuat_kho', 'thanh_tien_xuat_kho')}) AS v, MAX(ten_hang_muc) AS hm FROM xuat_kho WHERE ${W} GROUP BY 1),
           m AS (SELECT max(date_parsed) AS d FROM ton_kho),
           t AS (SELECT ${hx('hex')} AS hex, SUM(gia_tri_num) AS v, MAX(ten_san_pham) AS hm FROM ton_kho, m WHERE ${W} AND date_parsed = m.d GROUP BY 1),
           k AS (SELECT hex FROM n UNION SELECT hex FROM x UNION SELECT hex FROM t)
      SELECT k.hex, COALESCE(p.hm, n.hm, x.hm, t.hm) AS hang_muc, p.ipo,
             COALESCE(n.v, 0)::float8 AS nhap, COALESCE(x.v, 0)::float8 AS xuat, COALESCE(t.v, 0)::float8 AS ton,
             (COALESCE(n.v, 0) - COALESCE(x.v, 0) - COALESCE(t.v, 0))::float8 AS chenh, (SELECT d FROM m)::text AS ngay_ton
        FROM k LEFT JOIN n ON n.hex = k.hex LEFT JOIN x ON x.hex = k.hex LEFT JOIN t ON t.hex = k.hex
        LEFT JOIN LATERAL (SELECT ten_hang_muc AS hm, tinh_trang_ipo AS ipo FROM production_status_app WHERE hex::text = k.hex LIMIT 1) p ON true
       ORDER BY abs(COALESCE(n.v, 0) - COALESCE(x.v, 0) - COALESCE(t.v, 0)) DESC`, [ma]);
    res.json({ rows: q.rows.map(r => ({ hex: r.hex, hangMuc: r.hang_muc, ipo: r.ipo, nhap: r.nhap, xuat: r.xuat, ton: r.ton, chenh: r.chenh })), ngayTon: q.rows[0]?.ngay_ton ?? null });
  } catch (e) {
    console.error('[khnk-sheet/kho-chenh]', e);
    res.status(500).json({ error: 'Không tính được chênh nhập / xuất / tồn' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/khnk-sheet/thong-tin => { ct: { 'CT26-116': { kv, kh, tksx } } } — bộ lọc Khu vực / Khách hàng của bảng KHNK
// + tksx = Σ thanh_tien_tinh_phieu (TRIỆU) bỏ hạng mục HỦY: cột GT ĐÃ TKSX tính lại trên app (người dùng 19/11/2026 — số
//   của file có chỗ vượt GT đơn hàng làm CHƯA TKSX âm); CHƯA TKSX = GT ĐƠN HÀNG − tksx do giao diện tính.
// + nk = Σ đã nhập kho (TRIỆU) bỏ hạng mục HỦY, mỗi hạng mục 0 ≤ nhập ≤ trị giá (như doneValue của app): cột NHẬP KHO (P022)
//   tính lại trên app — file cộng cả phần đã nhập của hạng mục HỦY (người dùng 19/11/2026 chọn bỏ HỦY).
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
               COALESCE(SUM(${numericCol('production_status_app', 'thanh_tien_tinh_phieu')}), 0)::float8 AS v,
               COALESCE(SUM(LEAST(GREATEST(COALESCE(thanh_tien_nhap_kho_luy_ke, 0), 0), GREATEST(COALESCE(tri_gia_don_hang_tong, 0), 0))), 0)::float8 AS nk,
               COALESCE(SUM(COALESCE(tri_gia_don_hang_tong, 0)), 0)::float8 AS dh, count(*)::int AS n
          FROM production_status_app
         WHERE COALESCE(TRIM(ma_cong_trinh), '') <> ''
           AND UPPER(COALESCE(tinh_trang_ipo, '')) NOT LIKE '%HỦY%' AND UPPER(COALESCE(tinh_trang_ipo, '')) NOT LIKE '%HUỶ%'
         GROUP BY 1`)]);
      // + dh = Σ trị giá, n = số dòng (bỏ HỦY): giao diện dùng khi dòng hạng mục của trang thiếu mã (công trình đã đóng…)
      const ct: Record<string, { kv: string | null; kh: string | null; tksx: number; nk?: number; dh?: number; n?: number }> = {};
      const o = (ma: string) => (ct[ma] ??= { kv: null, kh: null, tksx: 0 });
      for (const x of kv.rows) o(x.ma).kv = x.v ?? null;
      for (const x of kh.rows) o(x.ma).kh = x.v ?? null;
      for (const x of tk.rows) { const y = o(x.ma); y.tksx = Number(x.v) || 0; y.nk = Number(x.nk) || 0; y.dh = Number(x.dh) || 0; y.n = Number(x.n) || 0; }
      return { ct };
    }, '', '', false);
    res.json(payload);
  } catch (e) {
    console.error('[khnk-sheet/thong-tin]', e);
    res.status(500).json({ error: 'Không đọc được khu vực / khách hàng' });
  }
});
