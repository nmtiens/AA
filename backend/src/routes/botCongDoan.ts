import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool, timedQuery, withTransaction } from '../db.js';
import { app } from '../server/app.js';
import { authenticateJWT, requireRole } from '../server/auth.js';
import { ensureWorkshopGroups, workshopGroupOf } from '../server/workshopGroups.js';
import {
  CONG_DOAN, SETUP_RONG, docSetup, congDoanDuocNhap, xuongDuocNhap, lyDoCam, docNgay, chuanTen, nguoiTuQuyen, khoaNhoHex,
  type NguoiNhap, type SetupBot,
} from '../server/botCongDoan.js';
import { loadUserAccess } from '../server/permissions.js';
import { getVersions } from '../server/data.js';
import { taoNhoCoHan } from '../server/congTrinh.js';
import { layMocFile } from './congTrinh.js';

// ============================================================================
// BOT THEO CÔNG ĐOẠN — ngày BOT các bộ phận nhập cho từng HEX × công đoạn (backend/sql/2026-11-13_bot_cong_doan.sql)
//   GET  /api/bot-cong-doan            => { coBang, congDoan[], ngay: {hex: {'P014': cuối, 'P014:dau': đầu}}, quyen, setup, boPhanDs[] }
//   POST /api/bot-cong-doan            body { ds: [{hex, congDoan, dot?: 'dau' | 'cuoi', ngay: 'YYYY-MM-DD' | null}] } — ghi / xoá, kiểm quyền TỪNG ô
//        mỗi HEX × công đoạn có 2 ngày: đợt đầu (dot 'dau') và đợt cuối (dot 'cuoi', mặc định)
//        => { ghi, bo: [{hex, congDoan, lyDo}] }  (ô không được phép bị bỏ, ô khác vẫn ghi)
//   GET  /api/bot-cong-doan/lich-su?hex=  => lịch sử sửa của 1 HEX
//   GET  /api/bot-cong-doan/quyen      => { admin, boPhan, congDoan[], xuong } — menu "Nhập BOT" chỉ hiện khi có công đoạn
//   GET  /api/bot-cong-doan/hex        => HEX đang sản xuất (theo file công trình, IPO 01) người này được nhập, dạng cột gọn —
//        trang "Nhập BOT" mở nhanh không cần bảng sản xuất; bộ phận giới hạn xưởng chỉ nhận HEX xưởng mình
//   POST /api/bot-cong-doan/setup (ADMIN) body SetupBot — phân công công đoạn / xưởng cho bộ phận
// Quyền theo DB (users.role / department), không theo token (token có thể còn quyền cũ tới 8 giờ).
// ============================================================================

const docSetupDb = async (): Promise<SetupBot> => {
  const r = await timedQuery(`SELECT gia_tri FROM bot_cong_doan_setup WHERE khoa = 'phan-cong'`);
  return r.rows[0] ? docSetup(r.rows[0].gia_tri) : SETUP_RONG;
};
const nguoiNhap = async (req: Request): Promise<NguoiNhap & { active: boolean }> => {
  const r = await pool.query('SELECT department, role, is_active FROM users WHERE id = $1', [req.user!.id]);
  return { admin: r.rows[0]?.role === 'ADMIN', boPhan: r.rows[0]?.department ?? null, active: r.rows[0]?.is_active === true };
};
// ---- ĐƯỜNG ĐỌC: bớt lượt đi-về tới DB (POST ghi ngày BOT ở dưới vẫn đọc users + setup THẲNG từ DB) ----
// Người nhập lấy từ quyền mà middleware chung vừa nạp (permissions.loadUserAccess: role / is_active / department theo DB,
// nhớ 60 giây, admin sửa user thì xoá ngay) => 0 câu thay cho 1 câu users mỗi request. Độ trễ bằng đúng độ trễ khoá /
// hạ quyền tài khoản mà cả app đang chấp nhận; chỉ dùng cho hiển thị (menu, danh sách HEX), không dùng để ghi.
const nguoiNhapNho = async (req: Request) => nguoiTuQuyen(await loadUserAccess(req.user!.id));
// Setup phân công: nhớ 60 giây, gán lại ngay khi POST /setup ghi xong (instance khác trễ tối đa 60 giây — chỉ ảnh hưởng
// hiển thị; kiểm quyền GHI đọc DB). Lỗi (kể cả thiếu bảng) không được nhớ => coBang false vẫn như cũ.
const setupNho = taoNhoCoHan<SetupBot>(60_000, docSetupDb);
// Danh sách bộ phận (chỉ để ADMIN chọn ở màn phân công): người thường nhận bản nhớ 5 phút; ADMIN luôn đọc mới.
const boPhanNho = taoNhoCoHan<string[]>(300_000, async () => {
  const bp = await timedQuery(`SELECT DISTINCT department FROM users WHERE is_active AND COALESCE(TRIM(department), '') NOT IN ('', '0') ORDER BY 1`);
  return [...new Set(bp.rows.map(x => chuanTen(x.department)))];
});
// Thiếu bảng của tính năng này (chưa chạy SQL) — bảng khác thiếu thì báo lỗi chung
const laThieuBang = (e: unknown) => (e as { code?: string })?.code === '42P01' && /bot_cong_doan/.test(String((e as Error)?.message ?? ''));
/** HEX dạng số, bỏ số 0 đầu (khớp hex::text của production_status_app); sai => null */
const chuanHex = (h: string) => (/^\d{6,15}$/.test(h) ? BigInt(h).toString() : null);

app.get('/api/bot-cong-doan', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const nguoi = await nguoiNhapNho(req);
    // ADMIN là người sửa phân công: luôn đọc setup + danh sách bộ phận mới từ DB (không sửa đè trên bản cũ của instance
    // khác). Người khác: bản nhớ => chỉ còn 1 câu (bot_cong_doan) thay vì 4 câu trên pool 2 kết nối.
    const [setup, ngay, boPhanDs] = await Promise.all([
      nguoi.admin ? setupNho.docMoi() : setupNho.lay(),
      timedQuery(`SELECT hex, cong_doan, dot, to_char(ngay, 'YYYY-MM-DD') AS ngay FROM bot_cong_doan`),
      nguoi.admin ? boPhanNho.docMoi() : boPhanNho.lay(),
    ]);
    const m: Record<string, Record<string, string>> = {};
    for (const x of ngay.rows) (m[x.hex] ??= {})[x.dot === 'dau' ? `${x.cong_doan}:dau` : x.cong_doan] = x.ngay;
    res.json({
      coBang: true,
      congDoan: CONG_DOAN,
      ngay: m,
      quyen: { admin: nguoi.admin, boPhan: nguoi.boPhan, congDoan: nguoi.active ? congDoanDuocNhap(nguoi, setup) : [], xuong: xuongDuocNhap(nguoi, setup) },
      setup,
      boPhanDs,
    });
  } catch (e) {
    if (laThieuBang(e)) return res.json({ coBang: false, congDoan: CONG_DOAN, ngay: {}, quyen: null, setup: SETUP_RONG, boPhanDs: [] });
    console.error('[bot-cong-doan]', e);
    res.status(500).json({ error: 'Không đọc được BOT công đoạn' });
  }
});

const ghiSchema = z.object({
  ds: z.array(z.object({
    hex: z.string().trim().min(1).max(40), congDoan: z.string().max(10), dot: z.enum(['dau', 'cuoi']).default('cuoi'), ngay: z.string().max(10).nullable(),
  })).min(1).max(20000),
});

app.post('/api/bot-cong-doan', authenticateJWT, async (req: Request, res: Response) => {
  const p = ghiSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
  try {
    const [setup, nguoi] = await Promise.all([docSetupDb(), nguoiNhap(req)]);
    if (!nguoi.active) return res.status(403).json({ error: 'Tài khoản đã khoá' });
    // HEX phải có trong dữ liệu sản xuất (không ghi HEX lạ / sai dạng). Xưởng của HEX (đã gộp như các trang khác) để kiểm
    // bộ phận bị giới hạn xưởng; 1 HEX nhiều dòng => lấy dòng mới cập nhật nhất (như server/data.ts)
    const canXuong = !!xuongDuocNhap(nguoi, setup);
    if (canXuong) await ensureWorkshopGroups();
    const hexs = [...new Set(p.data.ds.map(x => chuanHex(x.hex)).filter((h): h is string => !!h))];
    const xuongHex = new Map<string, string>();
    if (hexs.length) {
      const r = await timedQuery(`SELECT DISTINCT ON (hex::text) hex::text AS hex, xuong_chinh FROM production_status_app
                                   WHERE hex::text = ANY($1::text[]) ORDER BY hex::text, updated_at DESC NULLS LAST, id DESC`, [hexs]);
      for (const x of r.rows) xuongHex.set(x.hex, canXuong ? workshopGroupOf(x.xuong_chinh) : '');
    }
    const bo: { hex: string; congDoan: string; lyDo: string }[] = [];
    const ghi = new Map<string, { hex: string; congDoan: string; dot: 'dau' | 'cuoi'; ngay: string | null }>();   // ô trùng: lấy lần cuối
    for (const x0 of p.data.ds) {
      const hex = chuanHex(x0.hex);
      if (!hex || !xuongHex.has(hex)) { bo.push({ hex: x0.hex, congDoan: x0.congDoan, lyDo: `HEX ${x0.hex} không có trong dữ liệu sản xuất` }); continue; }
      const x = { ...x0, hex };
      const ngay = docNgay(x.ngay);
      if (ngay === undefined) { bo.push({ hex: x.hex, congDoan: x.congDoan, lyDo: `Ngày sai: ${x.ngay}` }); continue; }
      const lyDo = lyDoCam(nguoi, setup, x.congDoan, canXuong ? xuongHex.get(x.hex) ?? null : null);
      if (lyDo) { bo.push({ hex: x.hex, congDoan: x.congDoan, lyDo }); continue; }
      ghi.set(`${x.hex}|${x.congDoan}|${x.dot}`, { hex: x.hex, congDoan: x.congDoan, dot: x.dot, ngay });
    }
    const ds = [...ghi.values()];
    let soDoi = 0;
    if (ds.length) {
      soDoi = await withTransaction(async c => {
        // Ghi lần lượt (ít người sửa cùng lúc): lịch sử ngày cũ -> mới luôn đúng thứ tự, không ghi đè lẫn nhau
        await c.query('LOCK TABLE bot_cong_doan IN SHARE ROW EXCLUSIVE MODE');
        const hexs = ds.map(x => x.hex), cds = ds.map(x => x.congDoan), dots = ds.map(x => x.dot), ngays = ds.map(x => x.ngay);
        // Chỉ ô thật sự đổi mới ghi + lưu lịch sử
        const r = await c.query(`
          WITH moi AS (SELECT * FROM unnest($1::text[], $2::text[], $6::text[], $3::date[]) AS m(hex, cong_doan, dot, ngay)),
          doi AS (
            SELECT moi.hex, moi.cong_doan, moi.dot, b.ngay AS ngay_cu, moi.ngay AS ngay_moi
              FROM moi LEFT JOIN bot_cong_doan b USING (hex, cong_doan, dot)
             WHERE b.ngay IS DISTINCT FROM moi.ngay
          ),
          xoa AS (DELETE FROM bot_cong_doan b USING doi
                   WHERE b.hex = doi.hex AND b.cong_doan = doi.cong_doan AND b.dot = doi.dot AND doi.ngay_moi IS NULL RETURNING 1),
          sua AS (
            INSERT INTO bot_cong_doan (hex, cong_doan, dot, ngay, nguoi_sua, sua_luc)
            SELECT hex, cong_doan, dot, ngay_moi, $4, now() FROM doi WHERE ngay_moi IS NOT NULL
            ON CONFLICT (hex, cong_doan, dot) DO UPDATE SET ngay = EXCLUDED.ngay, nguoi_sua = EXCLUDED.nguoi_sua, sua_luc = now()
            RETURNING 1
          )
          INSERT INTO bot_cong_doan_lich_su (hex, cong_doan, dot, ngay_cu, ngay_moi, nguoi, bo_phan)
          SELECT hex, cong_doan, dot, ngay_cu, ngay_moi, $4, $5 FROM doi
          RETURNING 1`, [hexs, cds, ngays, req.user!.username, nguoi.boPhan, dots]);
        return r.rowCount ?? 0;
      });
    }
    res.json({ ghi: soDoi, bo });
  } catch (e) {
    if (laThieuBang(e)) return res.status(503).json({ error: 'Chưa tạo bảng BOT công đoạn (backend/sql/2026-11-13_bot_cong_doan.sql)' });
    console.error('[bot-cong-doan POST]', e);
    res.status(500).json({ error: 'Không lưu được BOT công đoạn' });
  }
});

app.get('/api/bot-cong-doan/quyen', authenticateJWT, async (req: Request, res: Response) => {
  try {
    // Gọi ở MỌI lần mở app: quyền đã được middleware nạp + setup nhớ 60 giây => thường 0 câu DB (trước 2 câu, 2 kết nối)
    const [setup, nguoi] = await Promise.all([setupNho.lay(), nguoiNhapNho(req)]);
    res.json({ admin: nguoi.admin, boPhan: nguoi.boPhan, congDoan: nguoi.active ? congDoanDuocNhap(nguoi, setup) : [], xuong: xuongDuocNhap(nguoi, setup) });
  } catch (e) {
    if (laThieuBang(e)) return res.json({ admin: false, boPhan: null, congDoan: [], xuong: null });
    console.error('[bot-cong-doan/quyen]', e);
    res.status(500).json({ error: 'Không đọc được quyền' });
  }
});

// Cột gửi về (mỗi cột 1 mảng): HEX đang sản xuất theo file công trình + BOT dự án của app
const COT_HEX = ['hex', 'ct', 'nsp', 'xuong', 'bop', 'hm', 'total', 'inv', 'xuat', 'remain', 'botDuAn'] as const;
const SQL_HEX = `
      SELECT DISTINCT ON (c.hex) c.hex, c.ten_cong_trinh, c.phan_loai_nhom_san_pham, c.xuong_chinh, c.bop, c.ten_hang_muc,
             c.tri_gia_don_hang_tong, c.thanh_tien_nhap_kho_luy_ke, c.thanh_tien_xuat_kho_luy_ke,
             to_char(p.bot_du_an, 'YYYY-MM-DD') AS bot_du_an
        FROM cong_trinh_hang_muc c
        LEFT JOIN LATERAL (SELECT bot_du_an FROM production_status_app p WHERE p.hex::text = c.hex
                            ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 1) p ON true
       WHERE c.hex IS NOT NULL AND c.hex <> '' AND COALESCE(c.tinh_trang_ipo, '') LIKE '01%'
       ORDER BY c.hex, c.nguon DESC, c.stt`;
// Dòng THÔ của câu nặng trên (chưa lọc xưởng, chưa gộp xưởng — hai việc đó vẫn làm theo từng người ở mỗi request nên
// không lộ HEX xưởng khác). SQL không phụ thuộc người dùng => nhớ theo mốc file công trình (cong_trinh_hang_muc nạp
// cùng lượt bot_tong_hop_file) + phiên bản bảng sản xuất (bot_du_an). Không lập được khoá thì chạy thẳng như cũ.
type DongHex = Record<string, any>;
let nhoHex: { khoa: string; rows: DongHex[] } | null = null;
let hexDangDoc: { khoa: string; p: Promise<DongHex[]> } | null = null;
const docHexTho = async (): Promise<DongHex[]> => (await timedQuery(SQL_HEX, [], { timeoutMs: 60_000, heavy: true })).rows;
async function layHexTho(): Promise<DongHex[]> {
  let khoa: string | null = null;
  try {
    const [moc, ver] = await Promise.all([layMocFile(), getVersions()]);
    khoa = khoaNhoHex(moc, ver.production);
  } catch { /* không hỏi được mốc: không nhớ, câu chính tự báo lỗi nếu DB hỏng */ }
  if (khoa === null) return docHexTho();
  if (nhoHex?.khoa === khoa) return nhoHex.rows;
  if (hexDangDoc?.khoa === khoa) return hexDangDoc.p;
  const k = khoa;
  const p = docHexTho().then(rows => { nhoHex = { khoa: k, rows }; return rows; })
    .finally(() => { if (hexDangDoc?.p === p) hexDangDoc = null; });
  hexDangDoc = { khoa: k, p };
  return p;
}
app.get('/api/bot-cong-doan/hex', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const [setup, nguoi] = await Promise.all([setupNho.lay(), nguoiNhapNho(req)]);
    const cds = nguoi.active ? congDoanDuocNhap(nguoi, setup) : [];
    if (!cds.length) return res.json({ cot: COT_HEX, ds: COT_HEX.map(() => []) });
    await ensureWorkshopGroups();
    const rows = await layHexTho();
    const xs = xuongDuocNhap(nguoi, setup);
    const ds: unknown[][] = COT_HEX.map(() => []);
    for (const x of rows) {
      const xuong = workshopGroupOf(x.xuong_chinh);
      if (xs && !xs.includes(chuanTen(xuong))) continue;
      const total = Number(x.tri_gia_don_hang_tong) || 0, inv = Math.min(Number(x.thanh_tien_nhap_kho_luy_ke) || 0, total);
      const dong = [x.hex, x.ten_cong_trinh ?? '', x.phan_loai_nhom_san_pham ?? '', xuong, x.bop ?? null, x.ten_hang_muc ?? '',
        total, inv, Number(x.thanh_tien_xuat_kho_luy_ke) || 0, Math.max(total - inv, 0), x.bot_du_an ?? null];
      dong.forEach((v, i) => ds[i].push(v));
    }
    res.json({ cot: COT_HEX, ds });
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') return res.json({ cot: COT_HEX, ds: COT_HEX.map(() => []) });
    console.error('[bot-cong-doan/hex]', e);
    res.status(500).json({ error: 'Không đọc được danh sách HEX' });
  }
});

app.get('/api/bot-cong-doan/lich-su', authenticateJWT, async (req: Request, res: Response) => {
  const hex = String(req.query.hex ?? '').trim();
  if (!hex) return res.status(400).json({ error: 'Thiếu HEX' });
  try {
    const r = await timedQuery(`SELECT cong_doan, dot, to_char(ngay_cu, 'YYYY-MM-DD') AS ngay_cu, to_char(ngay_moi, 'YYYY-MM-DD') AS ngay_moi,
             nguoi, bo_phan, to_char(luc AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS luc
        FROM bot_cong_doan_lich_su WHERE hex = $1 ORDER BY luc DESC LIMIT 200`, [hex]);
    res.json({ ds: r.rows });
  } catch (e) {
    if (laThieuBang(e)) return res.json({ ds: [] });
    console.error('[bot-cong-doan/lich-su]', e);
    res.status(500).json({ error: 'Không đọc được lịch sử' });
  }
});

const setupSchema = z.object({
  congDoan: z.record(z.string().max(10), z.array(z.string().max(100)).max(50)),
  xuongCua: z.record(z.string().max(100), z.array(z.string().max(50)).max(50)),
});

app.post('/api/bot-cong-doan/setup', authenticateJWT, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const p = setupSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Setup không hợp lệ' });
  try {
    const setup = docSetup(p.data);
    await timedQuery(`INSERT INTO bot_cong_doan_setup (khoa, gia_tri, nguoi_sua, sua_luc) VALUES ('phan-cong', $1::jsonb, $2, now())
                      ON CONFLICT (khoa) DO UPDATE SET gia_tri = EXCLUDED.gia_tri, nguoi_sua = EXCLUDED.nguoi_sua, sua_luc = now()`,
    [JSON.stringify(setup), req.user!.username]);
    setupNho.dat(setup);   // instance này thấy setup mới ngay
    res.json({ ok: true, setup });
  } catch (e) {
    if (laThieuBang(e)) return res.status(503).json({ error: 'Chưa tạo bảng BOT công đoạn' });
    console.error('[bot-cong-doan/setup]', e);
    res.status(500).json({ error: 'Không lưu được setup' });
  }
});
