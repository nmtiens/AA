import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { app } from '../server/app.js';

// ============================================================================
// BÁO CÁO BOT — giá trị đơn hàng còn lại theo dự án (như sheet BÁO CÁO BOT của MASTER_PROJECT_COORDINATION.xlsx)
//   GET /api/bot-tong-hop                         => { coBang, capNhat, soFile, fileLoi[], ipos[], o[] }
//       o = các ô đã cộng sẵn: TÊN CÔNG TRÌNH × TÌNH TRẠNG IPO FINAL × tháng NGÀY CẦN GIAO PC ĐỀ XUẤT ('' = CHƯA BOT)
//       (giao diện lọc IPO + dựng pivot năm / tháng: frontend/components/Construction/core/baoCaoBot.ts)
//   GET /api/bot-tong-hop/chi-tiet?ten=&ipo=a|b&thang=&ct=1  => dòng HEX của 1 ô (thang: 'YYYY-MM', 'YYYY', 'CHUA', '' = cả hàng;
//       ct=1: chỉ mã CTxx-xxx)
// - Bảng bot_tong_hop / bot_tong_hop_file do tool tong_hop_production_status.py --theo-doi nạp mỗi khi file công trình lưu.
//   Chưa chạy SQL tạo bảng (backend/sql/2026-11-09_bot_tong_hop.sql) => coBang = false.
// - ~30k dòng: cộng ở DB còn vài nghìn ô, không cache (dữ liệu đổi theo từng lần lưu file).
// ============================================================================

const chuoi = (x: unknown) => (x === null || x === undefined ? '' : String(x));
// Lọc MÃ CÔNG TRÌNH của pivot trong file = chọn tay mọi mã CTxx-xxx, bỏ DM / EM / NB / SP / XK (OEM, hàng lẻ, xuất khẩu)
const LA_CT = `(COALESCE(ma_ct, '') ~ '^CT[0-9]{2}-[0-9]{3}')`;

app.get('/api/bot-tong-hop', async (_req: Request, res: Response) => {
  try {
    const [o, f] = await Promise.all([
      timedQuery(`SELECT COALESCE(ten_ct, '') AS ten, COALESCE(ipo, '') AS ipo,
                         COALESCE(to_char(ngay_can_giao, 'YYYY-MM'), '') AS thang, ${LA_CT} AS ct,
                         SUM(tt_con_lai) AS tt, COUNT(*)::int AS so
                    FROM bot_tong_hop GROUP BY 1, 2, 3, 4`),
      timedQuery(`SELECT nguon, loi, to_char(nap_luc AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS nap_luc
                    FROM bot_tong_hop_file`),
    ]);
    const capNhat = f.rows.reduce((m: string, r) => (r.nap_luc > m ? r.nap_luc : m), '');
    res.json({
      coBang: true,
      capNhat: capNhat || null,
      soFile: f.rows.filter(r => !r.loi).length,
      fileLoi: f.rows.filter(r => r.loi).map(r => ({ nguon: chuoi(r.nguon), loi: chuoi(r.loi) })),
      ipos: [...new Set(o.rows.map(r => chuoi(r.ipo)))].sort(),
      o: o.rows.map(r => ({ ten: chuoi(r.ten), ipo: chuoi(r.ipo), thang: chuoi(r.thang), ct: !!r.ct, tt: r.tt === null ? null : Number(r.tt), so: r.so })),
    });
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') return res.json({ coBang: false, capNhat: null, soFile: 0, fileLoi: [], ipos: [], o: [] });
    console.error('[bot-tong-hop]', e);
    res.status(500).json({ error: 'Không đọc được dữ liệu BÁO CÁO BOT' });
  }
});

app.get('/api/bot-tong-hop/chi-tiet', async (req: Request, res: Response) => {
  const ten = String(req.query.ten ?? '');
  const ipos = String(req.query.ipo ?? '').split('|').filter(Boolean).slice(0, 20);
  const thang = String(req.query.thang ?? '');
  if (thang && !/^(CHUA|\d{4}|\d{4}-\d{2})$/.test(thang)) return res.status(400).json({ error: 'Sai tháng' });
  const dk: string[] = [`COALESCE(ten_ct, '') = $1`];
  const ts: unknown[] = [ten];
  if (ipos.length) { ts.push(ipos); dk.push(`COALESCE(ipo, '') = ANY($${ts.length}::text[])`); }
  if (req.query.ct === '1') dk.push(LA_CT);
  if (thang === 'CHUA') dk.push('ngay_can_giao IS NULL');
  else if (thang) { ts.push(thang); dk.push(`to_char(ngay_can_giao, '${thang.length === 4 ? 'YYYY' : 'YYYY-MM'}') = $${ts.length}`); }
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
