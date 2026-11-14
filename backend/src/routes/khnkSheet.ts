import type { Request, Response } from 'express';
import { timedQuery } from '../db.js';
import { gzipSync } from 'zlib';
import { app } from '../server/app.js';
import { guiGzip } from '../server/snapshot.js';

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
