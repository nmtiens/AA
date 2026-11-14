import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { app } from '../server/app.js';
import { authenticateJWT, requireRole } from '../server/auth.js';
import { KHOA_HOP_LE, dinhDang, chuoi, oTuDong, fileCanXem } from '../server/botTongHop.js';
import { ensureWorkshopGroups, workshopGroupSql, workshopGroupsVersion } from '../server/workshopGroups.js';
import { getVersions } from '../server/data.js';

// ============================================================================
// BÁO CÁO BOT — giá trị đơn hàng còn lại theo dự án (như sheet BÁO CÁO BOT của MASTER_PROJECT_COORDINATION.xlsx)
//   GET /api/bot-tong-hop                         => { coBang, capNhat, soFile, fileLoi[], ipos[], o[], luuFile{tên CT: giờ lưu file} }
//       fileLoi = file cần xem (server/botTongHop.fileCanXem): tool đọc lỗi (số cũ giữ nguyên) hoặc cột cần trống cả file
//       o = các ô đã cộng sẵn: TÊN CÔNG TRÌNH × TÌNH TRẠNG IPO FINAL × ngày NGÀY CẦN GIAO PC ĐỀ XUẤT ('' = CHƯA BOT);
//       mỗi ô có ngay 'YYYY-MM-DD' và thang 'YYYY-MM' (giữ cho bản giao diện cũ) — giao diện tự cộng lên tháng / năm
//       (lọc IPO + dựng pivot năm / tháng / ngày: frontend/components/Construction/core/baoCaoBot.ts)
//   GET /api/bot-tong-hop/ngay-hex                => { hex[], ngay[] } BOT hạng mục (ngày cần giao PC đề xuất) theo HEX
//   GET /api/bot-tong-hop/loi (ADMIN)                => { coBang, fileLoi[] } — chỉ danh sách file lỗi, cho thanh cảnh báo admin ở mọi trang
//   GET /api/bot-tong-hop/chi-tiet?ten=&ipo=a|b&thang=&ct=1  => dòng HEX của 1 ô (thang: 'YYYY-MM-DD', 'YYYY-MM', 'YYYY', 'CHUA', '' = cả hàng;
//       ct=1: chỉ mã CTxx-xxx)
// - Bảng bot_tong_hop / bot_tong_hop_file do tool tong_hop_production_status.py --theo-doi nạp mỗi khi file công trình lưu.
//   Chưa chạy SQL tạo bảng (backend/sql/2026-11-09_bot_tong_hop.sql) => coBang = false.
// - ~30k dòng: cộng ở DB còn vài nghìn ô. Kết quả nhớ trong bộ nhớ theo "mốc file" (lần nạp mới nhất + số file của
//   bot_tong_hop_file — tool ghi nap_luc ở MỌI lần nạp) + phiên bản bảng sản xuất + setup gộp xưởng: file chưa lưu lại
//   thì mở tab BOT chỉ còn 1 câu nhẹ hỏi mốc (trước 4 câu, có câu nối 30k dòng với bảng sản xuất).
// ============================================================================

// Lọc MÃ CÔNG TRÌNH của pivot trong file = chọn tay mọi mã CTxx-xxx, bỏ DM / EM / NB / SP / XK (OEM, hàng lẻ, xuất khẩu)
const LA_CT = `(COALESCE(b.ma_ct, '') ~ '^CT[0-9]{2}-[0-9]{3}')`;
// Nhóm sản phẩm / xưởng của HEX lấy từ dữ liệu sản xuất (production_status_app; 12/11/2026 khớp HEX 100%) — chiều
// "Theo sản phẩm / Theo xưởng" như tab BOP. Xưởng đã gộp theo Setup gộp xưởng (cùng tên với các trang khác).
// LATERAL ... LIMIT 1: mỗi HEX 1 dòng dù bảng sản xuất có trùng HEX (không nhân đôi giá trị); dùng chỉ mục idx_psa_hex_text.
const NOI_SX = `LEFT JOIN LATERAL (SELECT phan_loai_nhom_san_pham, xuong_chinh FROM production_status_app p
                                     WHERE p.hex::text = b.hex LIMIT 1) p ON true`;
const NSP = `COALESCE(TRIM(p.phan_loai_nhom_san_pham::text), '')`;
const XUONG = () => `COALESCE(${workshopGroupSql('p.xuong_chinh')}, '')`;

const SQL_FILE = `SELECT nguon, loi, to_char(nap_luc AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS nap_luc,
                         to_char(mtime AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS mtime
                    FROM bot_tong_hop_file`;
// Thống kê theo file: file lỗi (tên công trình + số dòng cũ đang hiện) và file có cột cần trống cả file
const SQL_THONG_KE = `SELECT nguon, COUNT(*)::int AS n, COUNT(tt_con_lai)::int AS tt, COUNT(ipo)::int AS ipo, COUNT(ten_ct)::int AS ten,
                         ARRAY_AGG(DISTINCT COALESCE(ten_ct, '')) AS ds
                    FROM bot_tong_hop GROUP BY nguon
                  HAVING COUNT(tt_con_lai) = 0 OR COUNT(ipo) = 0 OR COUNT(ten_ct) = 0
                      OR nguon IN (SELECT nguon FROM bot_tong_hop_file WHERE loi IS NOT NULL)`;

// BOT hạng mục: NGÀY CẦN GIAO PC ĐỀ XUẤT của từng HEX theo file công trình — cột "BOT hạng mục" ở cửa sổ HEX
// (BOP / BOT x BOP). Dạng cột { hex[], ngay[] } (chỉ HEX có ngày); nhớ tạm theo lần nạp file mới nhất của tool
// (bot_tong_hop_file.nap_luc) => không đọc lại ~30k dòng mỗi lần mở trang.
// Mốc file: 1 câu nhẹ, nhớ 3 giây và gộp các lần hỏi đồng thời (mở trang gọi /bot-tong-hop, /loi, /ngay-hex cùng lúc)
let mocNho: { luc: number; khoa: string } | null = null;
let mocDangHoi: Promise<string> | null = null;
const layMocFile = (): Promise<string> => {
  if (mocNho && Date.now() - mocNho.luc < 3000) return Promise.resolve(mocNho.khoa);
  if (!mocDangHoi) {
    mocDangHoi = timedQuery(`SELECT COALESCE(to_char(MAX(nap_luc), 'YYYYMMDDHH24MISSUS'), '') || ':' || COUNT(*) AS khoa FROM bot_tong_hop_file`)
      .then(k => { const khoa = chuoi(k.rows[0]?.khoa); mocNho = { luc: Date.now(), khoa }; return khoa; })
      .finally(() => { mocDangHoi = null; });
  }
  return mocDangHoi;
};
let boNhoNgayHex: { khoa: string; body: { hex: string[]; ngay: string[] } } | null = null;
let boNhoLoi: { khoa: string; body: string } | null = null;
let boNhoBot: { khoa: string; body: string } | null = null;
const guiJson = (res: Response, body: string) => { res.type('application/json').send(body); };
app.get('/api/bot-tong-hop/ngay-hex', async (_req: Request, res: Response) => {
  try {
    const khoa = await layMocFile();
    if (boNhoNgayHex?.khoa !== khoa) {
      // 1 HEX có thể nằm ở 2 file (chuyển công trình): lấy ngày của file nạp gần nhất
      const r = await timedQuery(`SELECT DISTINCT ON (b.hex) b.hex, to_char(b.ngay_can_giao, 'YYYY-MM-DD') AS ngay
                                    FROM bot_tong_hop b LEFT JOIN bot_tong_hop_file f USING (nguon)
                                   WHERE b.hex IS NOT NULL AND b.hex <> '' AND b.ngay_can_giao IS NOT NULL
                                   ORDER BY b.hex, f.nap_luc DESC NULLS LAST`);
      boNhoNgayHex = { khoa, body: { hex: r.rows.map(x => chuoi(x.hex)), ngay: r.rows.map(x => chuoi(x.ngay)) } };
    }
    res.json(boNhoNgayHex.body);
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') return res.json({ hex: [], ngay: [] });
    console.error('[bot-tong-hop/ngay-hex]', e);
    res.status(500).json({ error: 'Không đọc được BOT hạng mục' });
  }
});

// Thanh cảnh báo của admin (mọi trang): chỉ cần danh sách file lỗi, không kéo các ô số
app.get('/api/bot-tong-hop/loi', authenticateJWT, requireRole('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const khoa = await layMocFile();
    if (boNhoLoi?.khoa !== khoa) {
      const [f, tk] = await Promise.all([timedQuery(SQL_FILE), timedQuery(SQL_THONG_KE)]);
      boNhoLoi = { khoa, body: JSON.stringify({ coBang: true, fileLoi: fileCanXem(f.rows, tk.rows) }) };
    }
    guiJson(res, boNhoLoi.body);
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') return res.json({ coBang: false, fileLoi: [] });
    console.error('[bot-tong-hop/loi]', e);
    res.status(500).json({ error: 'Không đọc được danh sách file lỗi' });
  }
});

app.get('/api/bot-tong-hop', async (_req: Request, res: Response) => {
  try {
    await ensureWorkshopGroups();
    const [moc, ver] = await Promise.all([layMocFile(), getVersions()]);
    const khoa = `${moc}|${ver.production ?? ''}|${workshopGroupsVersion()}`;
    if (boNhoBot?.khoa === khoa) return guiJson(res, boNhoBot.body);
    const [o, f, l, tk] = await Promise.all([
      timedQuery(`SELECT COALESCE(b.ten_ct, '') AS ten, COALESCE(b.ipo, '') AS ipo,
                         COALESCE(to_char(b.ngay_can_giao, 'YYYY-MM-DD'), '') AS ngay, ${LA_CT} AS ct,
                         ${NSP} AS nsp, ${XUONG()} AS xuong,
                         SUM(b.tt_con_lai) AS tt, COUNT(*)::int AS so
                    FROM bot_tong_hop b ${NOI_SX} GROUP BY 1, 2, 3, 4, 5, 6`),
      timedQuery(SQL_FILE),
      // Giờ lưu file công trình gần nhất của từng TÊN CÔNG TRÌNH (tô dòng "cập nhật hôm nay")
      timedQuery(`SELECT COALESCE(b.ten_ct, '') AS ten, to_char(MAX(f.mtime) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS luu
                    FROM (SELECT DISTINCT nguon, ten_ct FROM bot_tong_hop) b JOIN bot_tong_hop_file f USING (nguon)
                   GROUP BY 1`),
      timedQuery(SQL_THONG_KE),
    ]);
    // Giờ dữ liệu = lần nạp tốt gần nhất (tool ghi nap_luc cả khi chỉ ghi lỗi — không tính)
    const capNhat = f.rows.reduce((m: string, r) => (!r.loi && r.nap_luc > m ? r.nap_luc : m), '');
    boNhoBot = { khoa, body: JSON.stringify({
      coBang: true,
      capNhat: capNhat || null,
      soFile: f.rows.filter(r => !r.loi).length,
      fileLoi: fileCanXem(f.rows, tk.rows),
      ipos: [...new Set(o.rows.map(r => chuoi(r.ipo)))].sort(),
      o: o.rows.map(oTuDong),
      luuFile: Object.fromEntries(l.rows.filter(r => r.luu).map(r => [chuoi(r.ten), chuoi(r.luu)])),
    }) };
    guiJson(res, boNhoBot.body);
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') return res.json({ coBang: false, capNhat: null, soFile: 0, fileLoi: [], ipos: [], o: [], luuFile: {} });
    console.error('[bot-tong-hop]', e);
    res.status(500).json({ error: 'Không đọc được dữ liệu BÁO CÁO BOT' });
  }
});

app.get('/api/bot-tong-hop/chi-tiet', async (req: Request, res: Response) => {
  // ten / nsp / xuong: có tham số thì lọc đúng giá trị đó ('' = trống); không có = mọi giá trị (ô của dòng sản phẩm / xưởng)
  const coTen = req.query.ten !== undefined;
  const ten = String(req.query.ten ?? '');
  const nsp = req.query.nsp === undefined ? null : String(req.query.nsp).trim();
  const xuong = req.query.xuong === undefined ? null : String(req.query.xuong).trim();
  const ipos = String(req.query.ipo ?? '').split('|').filter(Boolean).slice(0, 20);
  const thang = String(req.query.thang ?? '');
  if (thang && !KHOA_HOP_LE.test(thang)) return res.status(400).json({ error: 'Sai tháng' });
  if (!coTen && nsp === null && xuong === null) return res.status(400).json({ error: 'Thiếu công trình / sản phẩm / xưởng' });
  const dk: string[] = ['true'];
  const ts: unknown[] = [];
  if (coTen) { ts.push(ten); dk.push(`COALESCE(b.ten_ct, '') = $${ts.length}`); }
  if (ipos.length) { ts.push(ipos); dk.push(`COALESCE(b.ipo, '') = ANY($${ts.length}::text[])`); }
  if (req.query.ct === '1') dk.push(LA_CT);
  if (thang === 'CHUA') dk.push('b.ngay_can_giao IS NULL');
  else if (thang) { ts.push(thang); dk.push(`to_char(b.ngay_can_giao, '${dinhDang(thang)}') = $${ts.length}`); }
  try {
    if (xuong !== null) await ensureWorkshopGroups();
    if (nsp !== null) { ts.push(nsp); dk.push(`${NSP} = $${ts.length}`); }
    if (xuong !== null) { ts.push(xuong); dk.push(`${XUONG()} = $${ts.length}`); }
    const r = await timedQuery(`SELECT b.ma_ct, b.ten_ct, b.hex, b.ipo, to_char(b.ngay_can_giao, 'DD/MM/YYYY') AS ngay, b.tt_con_lai, b.nguon,
                                       ${NSP} AS nsp, ${XUONG()} AS xuong
                                  FROM bot_tong_hop b ${NOI_SX} WHERE ${dk.join(' AND ')}
                                  ORDER BY b.ngay_can_giao NULLS FIRST, b.hex LIMIT 5000`, ts);
    res.json({
      dong: r.rows.map(x => ({
        maCt: chuoi(x.ma_ct), ten: chuoi(x.ten_ct), hex: chuoi(x.hex), ipo: chuoi(x.ipo), ngay: chuoi(x.ngay),
        nsp: chuoi(x.nsp), xuong: chuoi(x.xuong),
        tt: x.tt_con_lai === null ? null : Number(x.tt_con_lai), nguon: chuoi(x.nguon),
      })),
    });
  } catch (e) {
    console.error('[bot-tong-hop/chi-tiet]', e);
    res.status(500).json({ error: 'Không đọc được chi tiết' });
  }
});
