import type { Request, Response } from 'express';
import { gzipSync } from 'zlib';
import { timedQuery } from '../db.js';
import { app } from '../server/app.js';
import { chuoi } from '../server/botTongHop.js';
import { getVersions } from '../server/data.js';
import { COT_CT, sqlHangMuc, moDoi, taoNhoCoHan } from '../server/congTrinh.js';
import { guiGzip } from '../server/snapshot.js';
import { laGioNghiDb } from '../server/gioNghi.js';

// ============================================================================
// TỔNG QUAN CÔNG TRÌNH theo file công trình (05_PRODUCTION STATUS / sheet TỔNG HỢP của MASTER_PROJECT_COORDINATION)
//   GET /api/cong-trinh/hang-muc => { coBang, capNhat, soFile, cot[], dong: [hex, {cột: giá trị file khác app} | 0][] }
//   - dong = mọi HEX trong các file công trình (mỗi HEX 1 dòng) — phạm vi của trang
//   - giao diện lấy dòng production_status_app cùng HEX rồi đè các ô khác (server/congTrinh.ts,
//     frontend/components/Construction/core/ghepFileCongTrinh.ts)
// - Bảng cong_trinh_hang_muc do tool tong_hop_production_status.py nạp (cùng lượt với bot_tong_hop).
//   Chưa chạy SQL (backend/sql/2026-11-12_cong_trinh_hang_muc.sql) => coBang = false, trang dùng dữ liệu app như cũ.
// - Nhớ kết quả theo (giờ nạp file mới nhất, số file, phiên bản bảng sản xuất như trình duyệt dùng — table_versions):
//   không đổi thì không chạy lại truy vấn nặng. Không tự tải lại theo chu kỳ (DB được ngủ).
// - Bản ghi gọn dựng sẵn /api/tong-quan/cong-trinh (routes/tongQuan.ts) cũng ghép số file (layFileCongTrinh) để máy chưa
//   có bảng sản xuất hiện ngay số theo file; mốc file (khoaFileNho) đưa vào việc tự làm nóng => file đổi là dựng lại sẵn.
// ============================================================================

const SQL = sqlHangMuc();
const SQL_KHOA = `SELECT COALESCE(max(nap_luc)::text, '') || '/' || count(*) AS khoa,
                         to_char(max(nap_luc) FILTER (WHERE loi IS NULL) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS cap_nhat,
                         count(*) FILTER (WHERE loi IS NULL)::int AS so_file
                    FROM bot_tong_hop_file`;

export interface FileCongTrinh {
  /** Mốc dữ liệu file (giờ nạp mới nhất / số file) — đổi là số file đổi */
  khoa: string;
  body: { coBang: boolean; capNhat: string | null; soFile: number; cot: string[]; dong: [string, Record<string, unknown> | 0][] };
  /** body đã JSON + gzip (dựng 1 lần ở lần gửi đầu, xem route) — không stringify + nén lại ~0,5 MB mỗi request */
  gz?: Buffer;
}
const RONG: FileCongTrinh['body'] = { coBang: false, capNhat: null, soFile: 0, cot: [], dong: [] };

/** Mốc file công trình: khoa đổi là số file đổi; coBang false = chưa tạo bảng bot_tong_hop_file */
export interface MocFile { coBang: boolean; khoa: string; capNhat: string | null; soFile: number }
const MOC_KHONG_BANG: MocFile = { coBang: false, khoa: 'khong-bang', capNhat: null, soFile: 0 };
// Mốc file: 1 câu nhẹ (không tham số => 1 lượt đi-về), nhớ 3 giây + gộp các lần hỏi đồng thời như getVersions —
// /cong-trinh/hang-muc, /tong-quan/cong-trinh, /bot-cong-doan/hex và việc tự làm nóng dùng chung 1 câu.
// An toàn: file mới hiện chậm tối đa 3 giây (tool nạp file vài phút / lần); lỗi DB không được nhớ.
const mocFile = taoNhoCoHan<MocFile>(3000, async () => {
  try {
    const k = (await timedQuery(SQL_KHOA)).rows[0] ?? {};
    return { coBang: true, khoa: chuoi(k.khoa), capNhat: chuoi(k.cap_nhat) || null, soFile: Number(k.so_file) || 0 };
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') return MOC_KHONG_BANG;
    throw e;
  }
});
export const layMocFile = (): Promise<MocFile> => mocFile.lay();

let nho: { khoa: string; kq: FileCongTrinh } | null = null;
let dangDung: { khoa: string; p: Promise<FileCongTrinh> } | null = null;

/** Số theo file (đã nhớ theo mốc file + phiên bản bảng sản xuất). Chưa tạo bảng => coBang false.
 *  `moc`: mốc nơi gọi vừa lấy (routes/tongQuan.ts) — khỏi hỏi lại. */
export async function layFileCongTrinh(moc?: MocFile): Promise<FileCongTrinh> {
  // Mốc file và phiên bản bảng hỏi SONG SONG (trước nối tiếp). Chưa có bảng thì trả rỗng như cũ, không xét lỗi phiên bản.
  const pVer = getVersions();
  pVer.catch(() => { /* lỗi được xét ở await dưới (nếu còn cần) */ });
  const k = moc ?? await layMocFile();
  if (!k.coBang) {
    // Chờ câu phiên bản xong (bỏ qua lỗi) rồi mới trả: không để truy vấn chạy dở sau khi đã trả lời (Vercel đóng băng hàm)
    await pVer.catch(() => { /* chưa có bảng: không cần phiên bản */ });
    return { khoa: 'khong-bang', body: RONG };
  }
  const ver = await pVer;
  const khoaFile = k.khoa;
  const khoa = `${khoaFile}|${ver.production ?? ''}`;
  if (nho?.khoa === khoa) return nho.kq;
  // Chờ chung CHỈ khi cùng khoá: lượt đang dựng theo mốc cũ không được trả cho request đã thấy mốc mới
  if (dangDung?.khoa === khoa) return dangDung.p;
  const p = (async () => {
    try {
      const r = await timedQuery(SQL, [], { timeoutMs: 60_000, heavy: true });
      const kq: FileCongTrinh = {
        khoa: khoaFile,
        body: {
          coBang: true,
          capNhat: k.capNhat,
          soFile: k.soFile,
          cot: COT_CT.map(c => c.k),
          dong: r.rows.map(x => [chuoi(x.hex), moDoi(x.doi)] as [string, Record<string, unknown> | 0]),
        },
      };
      nho = { khoa, kq };
      return kq;
    } catch (e) {
      if ((e as { code?: string })?.code === '42P01') return { khoa: 'khong-bang', body: RONG };
      throw e;
    }
  })().finally(() => { if (dangDung?.p === p) dangDung = null; });
  dangDung = { khoa, p };
  return p;
}

/** Mốc file cho việc tự làm nóng (hỏi DB tối đa 1 lần / 30 giây — /api/check-versions được gọi vài giây một lần;
 *  giờ để DB ngủ thì không hỏi thêm) */
let mocNho: { luc: number; khoa: string } | null = null;
export async function khoaFileNho(): Promise<string> {
  if (mocNho && (Date.now() - mocNho.luc < 30_000 || laGioNghiDb())) return mocNho.khoa;
  if (laGioNghiDb()) return '';
  let khoa = '';
  try { const m = await layMocFile(); khoa = m.coBang ? m.khoa : ''; } catch { /* chưa có bảng / lỗi DB: không tính */ }
  mocNho = { luc: Date.now(), khoa };
  return khoa;
}

app.get('/api/cong-trinh/hang-muc', async (_req: Request, res: Response) => {
  try {
    const kq = await layFileCongTrinh();
    if (!kq.body.coBang) return res.json(kq.body);
    // Gói đã nhớ: nén sẵn 1 lần rồi gửi thẳng (như routes/tongQuan.ts) — nội dung y hệt res.json(body)
    kq.gz ??= gzipSync(JSON.stringify(kq.body));
    guiGzip(res, kq.gz);
  } catch (e) {
    console.error('[cong-trinh/hang-muc]', e);
    res.status(500).json({ error: 'Không đọc được dữ liệu file công trình' });
  }
});
