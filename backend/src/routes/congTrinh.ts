import type { Request, Response } from 'express';
import { gzipSync } from 'zlib';
import { createHash } from 'node:crypto';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { docSnapshot, docSnapshotMoiNhat, luuSnapshot } from '../server/snapshot.js';
import { giuHamSong } from '../server/sharedCache.js';
import { timedQuery } from '../db.js';
import { app } from '../server/app.js';
import { chuoi } from '../server/botTongHop.js';
import { getVersions, hanPhienBan } from '../server/data.js';
import { COT_CT, sqlHangMuc, kieuAppTuCsdl, moDoi, taoNhoCoHan, type KieuApp } from '../server/congTrinh.js';
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
// Câu nhanh theo kiểu cột thật của production_status_app (đọc 1 lần / instance); đọc kiểu lỗi => câu cũ (kết quả như nhau)
let sqlNhanh: Promise<string> | null = null;
const laySql = (): Promise<string> => (sqlNhanh ??= timedQuery<{ k: string; t: string }>(
  `SELECT column_name AS k, data_type AS t FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'production_status_app'`)
  .then(r => sqlHangMuc(COT_CT, Object.fromEntries(r.rows.map(x => [x.k, kieuAppTuCsdl(x.t)])) as Record<string, KieuApp>))
  .catch(() => { sqlNhanh = null; return SQL; }));
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
// Mốc file: 1 câu nhẹ (không tham số => 1 lượt đi-về), nhớ 2 giây (ngắn hơn 2,5 giây trình duyệt chờ gom) + gộp các lần hỏi đồng thời như getVersions —
// /cong-trinh/hang-muc, /tong-quan/cong-trinh, /bot-cong-doan/hex và việc tự làm nóng dùng chung 1 câu.
// An toàn: file mới hiện chậm tối đa 2 giây (tool nạp file vài phút / lần); lỗi DB không được nhớ.
const mocFile = taoNhoCoHan<MocFile>(2000, async () => {
  try {
    const k = (await timedQuery(SQL_KHOA)).rows[0] ?? {};
    return { coBang: true, khoa: chuoi(k.khoa), capNhat: chuoi(k.cap_nhat) || null, soFile: Number(k.so_file) || 0 };
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') return MOC_KHONG_BANG;
    throw e;
  }
});
export const layMocFile = (): Promise<MocFile> => mocFile.lay();

// Bản nén dùng chung mọi instance (all_data_snapshot): instance mới đọc 1 dòng ~100 KB thay vì chạy lại câu nặng (5–8 giây
// trên web thật 25/11/2026). Khoá kèm dấu vân tay câu SQL: bản code khác (bản xem trước, đổi cột) không đọc nhầm nhau.
const KHOA_NEN = `hang-muc-file|${createHash('sha1').update(SQL).update(JSON.stringify(COT_CT)).digest('hex').slice(0, 10)}`;
const nen = promisify(gzip), giaiNen = promisify(gunzip);
const docChung = async (khoa: string): Promise<FileCongTrinh['body'] | null> => {
  try {
    const buf = await docSnapshot(KHOA_NEN, khoa, { v: '' });
    return buf ? JSON.parse((await giaiNen(buf)).toString('utf8')) as FileCongTrinh['body'] : null;
  } catch (e) {
    console.error('[cong-trinh/hang-muc] đọc bản nén lỗi', e);
    return null;
  }
};
const ghiChung = async (khoa: string, body: FileCongTrinh['body']): Promise<void> => {
  try {
    await luuSnapshot(KHOA_NEN, khoa, await nen(Buffer.from(JSON.stringify(body))));
  } catch (e) {
    console.error('[cong-trinh/hang-muc] lưu bản nén lỗi', e);
  }
};

/** Phiên bản bảng sản xuất, không phụ thuộc múi giờ máy chủ (bản nén dùng chung giữa Vercel UTC và máy giờ VN) */
const verBang = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '';
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
};

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
  const khoa = `${khoaFile}|${verBang(ver.production)}`;
  if (nho?.khoa === khoa) return nho.kq;
  // Chờ chung CHỈ khi cùng khoá: lượt đang dựng theo mốc cũ không được trả cho request đã thấy mốc mới
  if (dangDung?.khoa === khoa) return dangDung.p;
  const p = (async () => {
    try {
      const chung = await docChung(khoa);
      if (chung) {
        const kq: FileCongTrinh = { khoa: khoaFile, body: chung };
        nho = { khoa, kq };
        return kq;
      }
      const r = await timedQuery(await laySql(), [], { timeoutMs: 60_000, heavy: true, workMemMb: 32 });
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
      const ghi = ghiChung(khoa, kq.body); // trả lời trước, ghi sau
      giuHamSong(ghi);
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
  if (mocNho && (Date.now() - mocNho.luc < hanPhienBan(30_000) || laGioNghiDb())) return mocNho.khoa;
  if (laGioNghiDb()) return '';
  let khoa = '';
  try { const m = await layMocFile(); khoa = m.coBang ? m.khoa : ''; } catch { /* chưa có bảng / lỗi DB: không tính */ }
  mocNho = { luc: Date.now(), khoa };
  return khoa;
}

/** Phần phiên bản bảng sản xuất của khoá `${mốc file}|${phiên bản}` */
const phanBang = (khoa: string) => khoa.slice(khoa.lastIndexOf('|') + 1);
/**
 * Bản của lần nạp file TRƯỚC, trả ngay để trang khỏi chờ câu nặng (file nạp vài phút / lần, người mở đầu tiên sau mỗi lần nạp
 * chờ 5–9 giây). Chỉ khi cùng phiên bản bảng sản xuất: ô file so với bảng đó, khác bảng thì ghép lệch.
 * null = đã có bản đúng (bộ nhớ) / chưa có bản nào dùng được => đi đường thường.
 */
async function layBanTruoc(): Promise<FileCongTrinh['body'] | null> {
  const [k, ver] = await Promise.all([layMocFile(), getVersions()]);
  if (!k.coBang) return null;
  const bang = verBang(ver.production), khoa = `${k.khoa}|${bang}`;
  if (nho?.khoa === khoa) return null;
  // Xem bản chung trong DB TRƯỚC bản cũ trong bộ nhớ: instance khác / việc làm nóng thường đã tính xong bản đúng vài giây sau
  // khi nạp file (đo 26/11/2026: nạp :34, có bản :42) => nhận luôn bản đúng, khỏi hiện số cũ rồi gọi thêm 1 lượt
  const x = await docSnapshotMoiNhat(KHOA_NEN);
  const giai = async (buf: Buffer): Promise<FileCongTrinh['body'] | null> => {
    try { return JSON.parse((await giaiNen(buf)).toString('utf8')) as FileCongTrinh['body']; } catch { return null; }
  };
  if (x?.ver === khoa) {
    const body = await giai(x.buf);
    if (body) nho = { khoa, kq: { khoa: k.khoa, body } }; // đường thường ngay sau đó trúng bộ nhớ
    return null;
  }
  if (nho && phanBang(nho.khoa) === bang) return nho.kq.body;
  if (!x || phanBang(x.ver) !== bang) return null;
  return giai(x.buf);
}

// ?cu=1: nhận bản của lần nạp trước kèm dangCapNhat = true (giao diện gọi lại không có cu để lấy bản đúng).
// Không có cu (tab mở từ bản giao diện cũ): luôn bản đúng như trước.
app.get('/api/cong-trinh/hang-muc', async (req: Request, res: Response) => {
  try {
    if (req.query.cu === '1') {
      const truoc = await layBanTruoc().catch(() => null);
      if (truoc) return guiGzip(res, gzipSync(JSON.stringify({ ...truoc, dangCapNhat: true })));
    }
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
