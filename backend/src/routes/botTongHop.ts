import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { app } from '../server/app.js';
import { authenticateJWT, requireRole } from '../server/auth.js';
import { KHOA_HOP_LE, dinhDang, chuoi, oTuDong, fileCanXem } from '../server/botTongHop.js';

// ============================================================================
// BÁO CÁO BOT — giá trị đơn hàng còn lại theo dự án (như sheet BÁO CÁO BOT của MASTER_PROJECT_COORDINATION.xlsx)
//   GET /api/bot-tong-hop                         => { coBang, capNhat, soFile, fileLoi[], ipos[], o[], luuFile{tên CT: giờ lưu file} }
//       fileLoi = file cần xem (server/botTongHop.fileCanXem): tool đọc lỗi (số cũ giữ nguyên) hoặc cột cần trống cả file
//       o = các ô đã cộng sẵn: TÊN CÔNG TRÌNH × TÌNH TRẠNG IPO FINAL × ngày NGÀY CẦN GIAO PC ĐỀ XUẤT ('' = CHƯA BOT);
//       mỗi ô có ngay 'YYYY-MM-DD' và thang 'YYYY-MM' (giữ cho bản giao diện cũ) — giao diện tự cộng lên tháng / năm
//       (lọc IPO + dựng pivot năm / tháng / ngày: frontend/components/Construction/core/baoCaoBot.ts)
//   GET /api/bot-tong-hop/loi (ADMIN)                => { coBang, fileLoi[] } — chỉ danh sách file lỗi, cho thanh cảnh báo admin ở mọi trang
//   GET /api/bot-tong-hop/chi-tiet?ten=&ipo=a|b&thang=&ct=1  => dòng HEX của 1 ô (thang: 'YYYY-MM-DD', 'YYYY-MM', 'YYYY', 'CHUA', '' = cả hàng;
//       ct=1: chỉ mã CTxx-xxx)
// - Bảng bot_tong_hop / bot_tong_hop_file do tool tong_hop_production_status.py --theo-doi nạp mỗi khi file công trình lưu.
//   Chưa chạy SQL tạo bảng (backend/sql/2026-11-09_bot_tong_hop.sql) => coBang = false.
// - ~30k dòng: cộng ở DB còn vài nghìn ô, không cache (dữ liệu đổi theo từng lần lưu file).
// ============================================================================

// Lọc MÃ CÔNG TRÌNH của pivot trong file = chọn tay mọi mã CTxx-xxx, bỏ DM / EM / NB / SP / XK (OEM, hàng lẻ, xuất khẩu)
const LA_CT = `(COALESCE(ma_ct, '') ~ '^CT[0-9]{2}-[0-9]{3}')`;

const SQL_FILE = `SELECT nguon, loi, to_char(nap_luc AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS nap_luc,
                         to_char(mtime AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS mtime
                    FROM bot_tong_hop_file`;
// Thống kê theo file: file lỗi (tên công trình + số dòng cũ đang hiện) và file có cột cần trống cả file
const SQL_THONG_KE = `SELECT nguon, COUNT(*)::int AS n, COUNT(tt_con_lai)::int AS tt, COUNT(ipo)::int AS ipo, COUNT(ten_ct)::int AS ten,
                         ARRAY_AGG(DISTINCT COALESCE(ten_ct, '')) AS ds
                    FROM bot_tong_hop GROUP BY nguon
                  HAVING COUNT(tt_con_lai) = 0 OR COUNT(ipo) = 0 OR COUNT(ten_ct) = 0
                      OR nguon IN (SELECT nguon FROM bot_tong_hop_file WHERE loi IS NOT NULL)`;

// Thanh cảnh báo của admin (mọi trang): chỉ cần danh sách file lỗi, không kéo các ô số
app.get('/api/bot-tong-hop/loi', authenticateJWT, requireRole('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const [f, tk] = await Promise.all([timedQuery(SQL_FILE), timedQuery(SQL_THONG_KE)]);
    res.json({ coBang: true, fileLoi: fileCanXem(f.rows, tk.rows) });
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') return res.json({ coBang: false, fileLoi: [] });
    console.error('[bot-tong-hop/loi]', e);
    res.status(500).json({ error: 'Không đọc được danh sách file lỗi' });
  }
});

app.get('/api/bot-tong-hop', async (_req: Request, res: Response) => {
  try {
    const [o, f, l, tk] = await Promise.all([
      timedQuery(`SELECT COALESCE(ten_ct, '') AS ten, COALESCE(ipo, '') AS ipo,
                         COALESCE(to_char(ngay_can_giao, 'YYYY-MM-DD'), '') AS ngay, ${LA_CT} AS ct,
                         SUM(tt_con_lai) AS tt, COUNT(*)::int AS so
                    FROM bot_tong_hop GROUP BY 1, 2, 3, 4`),
      timedQuery(SQL_FILE),
      // Giờ lưu file công trình gần nhất của từng TÊN CÔNG TRÌNH (tô dòng "cập nhật hôm nay")
      timedQuery(`SELECT COALESCE(b.ten_ct, '') AS ten, to_char(MAX(f.mtime) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS luu
                    FROM (SELECT DISTINCT nguon, ten_ct FROM bot_tong_hop) b JOIN bot_tong_hop_file f USING (nguon)
                   GROUP BY 1`),
      timedQuery(SQL_THONG_KE),
    ]);
    // Giờ dữ liệu = lần nạp tốt gần nhất (tool ghi nap_luc cả khi chỉ ghi lỗi — không tính)
    const capNhat = f.rows.reduce((m: string, r) => (!r.loi && r.nap_luc > m ? r.nap_luc : m), '');
    res.json({
      coBang: true,
      capNhat: capNhat || null,
      soFile: f.rows.filter(r => !r.loi).length,
      fileLoi: fileCanXem(f.rows, tk.rows),
      ipos: [...new Set(o.rows.map(r => chuoi(r.ipo)))].sort(),
      o: o.rows.map(oTuDong),
      luuFile: Object.fromEntries(l.rows.filter(r => r.luu).map(r => [chuoi(r.ten), chuoi(r.luu)])),
    });
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') return res.json({ coBang: false, capNhat: null, soFile: 0, fileLoi: [], ipos: [], o: [], luuFile: {} });
    console.error('[bot-tong-hop]', e);
    res.status(500).json({ error: 'Không đọc được dữ liệu BÁO CÁO BOT' });
  }
});

app.get('/api/bot-tong-hop/chi-tiet', async (req: Request, res: Response) => {
  const ten = String(req.query.ten ?? '');
  const ipos = String(req.query.ipo ?? '').split('|').filter(Boolean).slice(0, 20);
  const thang = String(req.query.thang ?? '');
  if (thang && !KHOA_HOP_LE.test(thang)) return res.status(400).json({ error: 'Sai tháng' });
  const dk: string[] = [`COALESCE(ten_ct, '') = $1`];
  const ts: unknown[] = [ten];
  if (ipos.length) { ts.push(ipos); dk.push(`COALESCE(ipo, '') = ANY($${ts.length}::text[])`); }
  if (req.query.ct === '1') dk.push(LA_CT);
  if (thang === 'CHUA') dk.push('ngay_can_giao IS NULL');
  else if (thang) { ts.push(thang); dk.push(`to_char(ngay_can_giao, '${dinhDang(thang)}') = $${ts.length}`); }
  try {
    const r = await timedQuery(`SELECT ma_ct, hex, ipo, to_char(ngay_can_giao, 'DD/MM/YYYY') AS ngay, tt_con_lai, nguon
                                  FROM bot_tong_hop WHERE ${dk.join(' AND ')}
                                  ORDER BY ngay_can_giao NULLS FIRST, hex LIMIT 5000`, ts);
    res.json({
      dong: r.rows.map(x => ({
        maCt: chuoi(x.ma_ct), hex: chuoi(x.hex), ipo: chuoi(x.ipo), ngay: chuoi(x.ngay),
        tt: x.tt_con_lai === null ? null : Number(x.tt_con_lai), nguon: chuoi(x.nguon),
      })),
    });
  } catch (e) {
    console.error('[bot-tong-hop/chi-tiet]', e);
    res.status(500).json({ error: 'Không đọc được chi tiết' });
  }
});
