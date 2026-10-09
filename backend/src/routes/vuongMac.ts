import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool, timedQuery, withTransaction } from '../db.js';
import { parseBotEnd } from '../vuongMacPush.js';
import {
  notify, findMentionedIds, idsByFullName, idsByUsername, recipientsFor, displayName, adminIds,
} from '../notifications.js';
import { authenticateJWT } from '../server/auth.js';
import { validateBody } from '../server/validation.js';
import { expandWorkshops, workshopGroupOf } from '../server/workshopGroups.js';
import { canonicalProjectName } from '../server/projectAlias.js';
import { app } from '../server/app.js';

// ============================================================================
// VƯỚNG MẮC SẢN XUẤT (5M) — QUY TRÌNH XỬ LÝ
//
//   open ──(nhận xử lý)──> doing ──(báo xong)──> done ──(người báo xác nhận)──> closed
//     │                      │                     │
//     └──────(báo xong)──────┘        (chưa đạt: mở lại)──> doing
//
// - open   : mới báo, chưa ai nhận          - done   : người xử lý báo xong, chờ người báo xác nhận
// - doing  : người xử lý đã nhận, đang làm   - closed : người báo (hoặc cùng phòng ban / Admin) đã xác nhận
// is_resolved = status IN ('done','closed') để màn hình cũ vẫn chạy.
//
// Quyền (server tính cho từng dòng, trả về trong `perms`):
//   edit   : sửa nội dung / người xử lý / BOT / ưu tiên   — Admin, người tạo, cùng phòng ban người tạo, người xử lý
//   work   : nhận xử lý, báo xong, xin thêm thời gian     — như edit
//   close  : xác nhận đóng, mở lại                         — Admin, người tạo, cùng phòng ban người tạo
//   delete : xoá                                           — Admin, người tạo, cùng phòng ban người tạo
//
// Cột quy trình (status, priority, stage, xuong, accepted_*, closed_*, escalated_at) do file
// backend/sql/2026-10-10_vuong_mac_quy_trinh.sql tạo. Chưa chạy SQL: vẫn chạy với 2 trạng thái cũ,
// các thao tác cần cột mới trả 409 kèm hướng dẫn.
// ============================================================================

const FIVE_M_CATEGORIES = ['man', 'machine', 'material', 'method', 'measurement'] as const;
export const VM_STATUSES = ['open', 'doing', 'done', 'closed'] as const;
type VmStatus = typeof VM_STATUSES[number];
const PRIORITIES = ['normal', 'high', 'urgent'] as const;
type Priority = typeof PRIORITIES[number];

const vuongMacCreateSchema = z.object({
  hex: z.string().min(1),
  category: z.enum(FIVE_M_CATEGORIES),
  content: z.string().min(1).max(2000),
  handler: z.string().max(200).optional().nullable(),
  bot: z.string().max(200).optional().nullable(),
  solution: z.string().max(2000).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
  priority: z.enum(PRIORITIES).optional(),
});
const vuongMacUpdateSchema = z.object({
  category: z.enum(FIVE_M_CATEGORIES).optional(),
  content: z.string().min(1).max(2000).optional(),
  // Cũ: isResolved true = báo xong (done), false = mở lại
  isResolved: z.boolean().optional(),
  resolvedNote: z.string().max(2000).optional().nullable(),
  // Mới: đổi trạng thái theo quy trình + ghi chú kèm (bắt buộc khi báo xong / mở lại)
  status: z.enum(VM_STATUSES).optional(),
  statusNote: z.string().max(2000).optional().nullable(),
  priority: z.enum(PRIORITIES).optional(),
  handler: z.string().max(200).optional().nullable(),
  bot: z.string().max(200).optional().nullable(),
  solution: z.string().max(2000).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});
const vuongMacExtendSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  bot: z.string().trim().min(1).max(200),
  note: z.string().max(2000).optional().nullable(),
});
const commentSchema = z.object({ content: z.string().trim().min(1).max(2000) });

const BASE_COLUMN_LIST = [
  'id', 'hex', 'category', 'content', 'is_resolved', 'created_by', 'created_at',
  'updated_by', 'updated_at', 'handler', 'bot', 'solution', 'note',
  'resolved_note', 'resolved_by', 'resolved_at',
];
// Cột của quy trình mới (chỉ có sau khi chạy SQL 2026-10-10)
const WORKFLOW_COLUMN_LIST = [
  'status', 'priority', 'stage', 'xuong', 'ten_cong_trinh', 'ma_cong_trinh', 'ten_hang_muc',
  'accepted_at', 'accepted_by', 'closed_at', 'closed_by', 'escalated_at',
];
const WORKFLOW_SQL_HINT = 'Máy chủ chưa chạy file SQL backend/sql/2026-10-10_vuong_mac_quy_trinh.sql — thao tác này cần cột quy trình mới';

// ---------- Cột quy trình đã có trên DB chưa (kiểm tra lại mỗi phút cho tới khi có) ----------
let workflowReady: boolean | null = null;
let workflowCheckedAt = 0;
export async function hasWorkflowSchema(): Promise<boolean> {
  if (workflowReady === true) return true;
  if (workflowReady !== null && Date.now() - workflowCheckedAt < 60_000) return workflowReady;
  try {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'vuong_mac' AND column_name = 'escalated_at'`);
    workflowReady = r.rows.length > 0;
  } catch {
    workflowReady = false;
  }
  workflowCheckedAt = Date.now();
  return workflowReady;
}

const vmCols = (ready: boolean, alias = 'vm') => [
  ...BASE_COLUMN_LIST.map(c => `${alias}.${c}`),
  ...WORKFLOW_COLUMN_LIST.map(c => (ready ? `${alias}.${c}` : `NULL AS ${c}`)),
].join(', ');

// Dòng sản xuất mới nhất của HEX: công trình / hạng mục / xưởng / công đoạn / hạn nhập kho
const PRODUCTION_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT ten_cong_trinh, ten_hang_muc, xuong_chinh, ma_cong_trinh, bop, tinh_trang, tinh_trang_ipo,
           ten_pc, ten_pm, ngay_khnk_tuan, ngay_khnk_thang, ngay_can_giao
    FROM production_status_app
    WHERE hex::text = vm.hex
    ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 1
  ) p ON TRUE`;
const PRODUCTION_COLS = `
  p.ten_cong_trinh AS p_ten_cong_trinh, p.ten_hang_muc AS p_ten_hang_muc, p.xuong_chinh AS p_xuong_chinh,
  p.ma_cong_trinh AS p_ma_cong_trinh, p.bop AS p_bop, p.tinh_trang AS p_tinh_trang, p.tinh_trang_ipo AS p_tinh_trang_ipo,
  p.ten_pc AS p_ten_pc, p.ten_pm AS p_ten_pm, p.ngay_khnk_tuan AS p_khnk_tuan, p.ngay_khnk_thang AS p_khnk_thang,
  p.ngay_can_giao AS p_ngay_can_giao`;

// SELECT đầy đủ 1 vướng mắc: cột + phòng ban người tạo + lịch sử gia hạn + id ảnh (+ dòng sản xuất nếu withProduction)
const selectVm = (ready: boolean, withProduction: boolean) => `
  SELECT ${vmCols(ready)}, u.department AS created_department,
    COALESCE((
      SELECT json_agg(json_build_object(
               'id', e.id, 'content', e.content, 'bot', e.bot, 'oldBot', e.old_bot,
               'note', e.note, 'createdBy', e.created_by, 'createdAt', e.created_at
             ) ORDER BY e.created_at, e.id)
      FROM vuong_mac_extension e WHERE e.vuong_mac_id = vm.id
    ), '[]'::json) AS extensions,
    COALESCE((
      SELECT json_agg(ph.id ORDER BY ph.id)
      FROM vuong_mac_photo ph WHERE ph.vuong_mac_id = vm.id
    ), '[]'::json) AS photos
    ${withProduction ? `, ${PRODUCTION_COLS}` : ''}
  FROM vuong_mac vm
  LEFT JOIN users u ON u.username = vm.created_by
  ${withProduction ? PRODUCTION_LATERAL : ''}`;

// ---------- PHÂN QUYỀN ----------
const normDept = (d?: string | null) => (d ?? '').trim().toLowerCase();
const isSameDept = (a?: string | null, b?: string | null) => {
  const x = normDept(a);
  return x !== '' && x === normDept(b);
};
const sameName = (a?: string | null, b?: string | null) =>
  (a ?? '').trim().toLowerCase() !== '' && (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

interface VuongMacActor {
  username: string;
  role: string;
  department: string | null;
  /** Họ tên (users.full_name) — để nhận ra "tôi là người xử lý" theo cột Người xử lý */
  fullName: string | null;
}

const getVuongMacActor = async (req: Request): Promise<VuongMacActor> => {
  const r = await pool.query('SELECT department, full_name FROM users WHERE id = $1', [req.user!.id]);
  return {
    username: req.user!.username,
    role: req.user!.role,
    department: r.rows[0]?.department ?? null,
    fullName: r.rows[0]?.full_name ?? null,
  };
};

const isHandler = (me: VuongMacActor, handler: string | null) =>
  !!handler && (sameName(handler, me.fullName) || sameName(handler, me.username));

// "Việc của tôi": tôi là người xử lý hoặc tôi tạo
const isMine = (me: VuongMacActor, handler: string | null, createdBy: string | null) =>
  (!!createdBy && createdBy === me.username) || isHandler(me, handler);

export interface VmPerms { edit: boolean; work: boolean; close: boolean; delete: boolean }
const permsOf = (me: VuongMacActor, createdBy: string | null, createdDept: string | null, handler: string | null): VmPerms => {
  const admin = me.role === 'ADMIN';
  const reporterSide = admin || (!!createdBy && createdBy === me.username) || isSameDept(me.department, createdDept);
  const handlerSide = reporterSide || isHandler(me, handler);
  return { edit: handlerSide, work: handlerSide, close: reporterSide, delete: reporterSide };
};
// Giữ tên cũ cho các chỗ còn gọi (ảnh, xoá…): = quyền edit
const canModifyVuongMac = (me: VuongMacActor, createdBy: string | null, createdDept: string | null, handler: string | null = null) =>
  permsOf(me, createdBy, createdDept, handler).edit;

const canAddToVuongMacThread = async (actor: VuongMacActor, hex: string, category: string) => {
  if (actor.role === 'ADMIN') return true;
  const r = await pool.query(
    `SELECT vm.created_by, vm.handler, u.department AS created_department
     FROM vuong_mac vm
     LEFT JOIN users u ON u.username = vm.created_by
     WHERE vm.hex = $1 AND vm.category = $2`,
    [hex, category]
  );
  if (r.rows.length === 0) return true;
  return r.rows.some(
    row => row.created_by === actor.username || isSameDept(actor.department, row.created_department) || isHandler(actor, row.handler)
  );
};

// ---------- Hạn BOT ----------
const DUE_SOON_MS = 24 * 60 * 60 * 1000;
type DueState = 'overdue' | 'soon' | 'ok' | 'none';
const dueState = (bot: string | null, now = Date.now()): DueState => {
  const end = parseBotEnd(bot);
  if (!end) return 'none';
  const left = end.getTime() - now;
  return left < 0 ? 'overdue' : left <= DUE_SOON_MS ? 'soon' : 'ok';
};
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Hạn nhập kho của hạng mục: KH tuần → KH tháng (quy tắc chung, utils/productionMetrics.deadlineOf)
const planDate = (tuan: unknown, thang: unknown): string | null => {
  const t = String(tuan ?? '').match(/^\d{4}-\d{2}-\d{2}/);
  if (t) return t[0];
  const m = String(thang ?? '').match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
};
const stageOf = (bop: unknown): string | null => String(bop ?? '').trim().toUpperCase().match(/^(P\d{3}|GCVT)/)?.[1] ?? null;
const statusOf = (row: any): VmStatus =>
  (VM_STATUSES as readonly string[]).includes(row.status) ? row.status : row.is_resolved ? 'closed' : 'open';

// Chuyển 1 dòng vuong_mac (kèm extensions, photos, dòng sản xuất nếu có) sang JSON trả cho client
const mapVuongMacRow = (
  row: any,
  actor: VuongMacActor,
  createdDepartment: string | null = row.created_department ?? null
) => {
  const perms = permsOf(actor, row.created_by, createdDepartment, row.handler);
  const hasProd = 'p_ten_cong_trinh' in row;
  const rawCt = hasProd ? (row.p_ten_cong_trinh ?? row.ten_cong_trinh) : row.ten_cong_trinh;
  return {
    id: row.id,
    hex: row.hex,
    category: row.category,
    content: row.content,
    isResolved: row.is_resolved,
    status: statusOf(row),
    priority: ((PRIORITIES as readonly string[]).includes(row.priority) ? row.priority : 'normal') as Priority,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
    handler: row.handler,
    bot: row.bot,
    solution: row.solution,
    note: row.note,
    resolvedNote: row.resolved_note,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    acceptedAt: row.accepted_at ?? null,
    acceptedBy: row.accepted_by ?? null,
    closedAt: row.closed_at ?? null,
    closedBy: row.closed_by ?? null,
    escalatedAt: row.escalated_at ?? null,
    extensions: Array.isArray(row.extensions) ? row.extensions : [],
    photos: Array.isArray(row.photos) ? row.photos : [],          // danh sách id ảnh
    createdDepartment,
    // Công đoạn / xưởng LÚC BÁO (cột lưu) — công đoạn hiện tại lấy ở bop
    stage: row.stage ?? (hasProd ? stageOf(row.p_bop) : null),
    xuong: workshopGroupOf(row.xuong ?? (hasProd ? row.p_xuong_chinh : null)) || null,
    congTrinh: rawCt ? canonicalProjectName(rawCt) : null,
    maCongTrinh: (hasProd ? row.p_ma_cong_trinh : null) ?? row.ma_cong_trinh ?? null,
    hangMuc: (hasProd ? row.p_ten_hang_muc : null) ?? row.ten_hang_muc ?? null,
    // Thông tin sản xuất hiện tại (chỉ khi truy vấn có nối bảng sản xuất)
    bop: hasProd ? (row.p_bop ?? null) : undefined,
    tinhTrang: hasProd ? (row.p_tinh_trang ?? null) : undefined,
    tinhTrangIpo: hasProd ? (row.p_tinh_trang_ipo ?? null) : undefined,
    pc: hasProd ? (row.p_ten_pc ?? null) : undefined,
    pm: hasProd ? (row.p_ten_pm ?? null) : undefined,
    deadline: hasProd ? planDate(row.p_khnk_tuan, row.p_khnk_thang) : undefined,
    ngayCanGiao: hasProd ? (row.p_ngay_can_giao ?? null) : undefined,
    perms,
    canModify: perms.edit,
  };
};
type VmRow = ReturnType<typeof mapVuongMacRow>;

const fetchOne = async (id: number | string, me: VuongMacActor) => {
  const ready = await hasWorkflowSchema();
  const r = await pool.query(`${selectVm(ready, true)} WHERE vm.id = $1`, [id]);
  return r.rows[0] ? mapVuongMacRow(r.rows[0], me) : null;
};

// Dòng sản xuất hiện tại của 1 HEX (để lưu snapshot công đoạn / xưởng / công trình lúc báo)
const productionOfHex = async (hex: string) => {
  const r = await pool.query(
    `SELECT bop, xuong_chinh, ten_cong_trinh, ma_cong_trinh, ten_hang_muc
     FROM production_status_app WHERE hex::text = $1
     ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 1`, [hex]);
  const p = r.rows[0];
  if (!p) return null;
  return {
    stage: stageOf(p.bop),
    xuong: workshopGroupOf(p.xuong_chinh) || null,
    tenCongTrinh: p.ten_cong_trinh ?? null, maCongTrinh: p.ma_cong_trinh ?? null, tenHangMuc: p.ten_hang_muc ?? null,
  };
};

// ---------- Ảnh đính kèm vướng mắc: tải lên / xem / xoá ----------
const MAX_PHOTOS_PER_ITEM = 5;
const isJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

// Tải 1 ảnh lên (body = bytes JPEG thô, mỗi request 1 ảnh)
app.post(
  '/api/vuong-mac/:id/photos',
  authenticateJWT,
  express.raw({ type: 'image/*', limit: '2mb' }),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'ID không hợp lệ' });

      const buf = req.body as Buffer;
      if (!Buffer.isBuffer(buf) || buf.length === 0) {
        return res.status(400).json({ success: false, message: 'Không có dữ liệu ảnh' });
      }
      if (!isJpeg(buf)) {
        return res.status(400).json({ success: false, message: 'Chỉ nhận ảnh JPEG' });
      }

      const me = await getVuongMacActor(req);
      const existing = await pool.query(
        `SELECT vm.created_by, vm.handler, u.department AS created_department
         FROM vuong_mac vm LEFT JOIN users u ON u.username = vm.created_by
         WHERE vm.id = $1`,
        [id]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy vướng mắc' });
      }
      const old = existing.rows[0];
      if (!canModifyVuongMac(me, old.created_by, old.created_department, old.handler)) {
        return res.status(403).json({ success: false, message: 'Không có quyền thêm ảnh' });
      }

      const cnt = await pool.query('SELECT COUNT(*) FROM vuong_mac_photo WHERE vuong_mac_id = $1', [id]);
      if (Number(cnt.rows[0].count) >= MAX_PHOTOS_PER_ITEM) {
        return res.status(400).json({ success: false, message: `Tối đa ${MAX_PHOTOS_PER_ITEM} ảnh` });
      }

      const r = await pool.query(
        `INSERT INTO vuong_mac_photo (vuong_mac_id, data, mime, size, created_by)
         VALUES ($1, $2, 'image/jpeg', $3, $4) RETURNING id`,
        [id, buf, buf.length, me.username]
      );
      res.json({ success: true, data: { id: r.rows[0].id } });
    } catch (error) {
      console.error('Lỗi upload ảnh vuong-mac:', error);
      res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
    }
  }
);

// Lấy 1 ảnh (cần token nên client fetch -> blob -> objectURL).
// Quyền xem ảnh = quyền xem vướng mắc: mọi tài khoản ĐANG HOẠT ĐỘNG (danh sách vướng mắc
// không lọc phòng ban). Chỉ trả ảnh thuộc vướng mắc còn tồn tại; tài khoản đã bị khoá thì
// không xem được dù token cũ còn hạn.
app.get('/api/vuong-mac/photo/:photoId', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const photoId = Number(req.params.photoId);
    if (!Number.isInteger(photoId) || photoId <= 0) return res.status(400).json({ error: 'Invalid id' });

    const active = await pool.query('SELECT 1 FROM users WHERE id = $1 AND is_active', [req.user!.id]);
    if (active.rows.length === 0) return res.status(403).json({ error: 'Tài khoản không còn hoạt động' });

    const r = await pool.query(
      `SELECT ph.data
       FROM vuong_mac_photo ph
       JOIN vuong_mac vm ON vm.id = ph.vuong_mac_id
       WHERE ph.id = $1`,
      [photoId]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    // Upload chỉ nhận JPEG (kiểm tra magic bytes) -> luôn trả image/jpeg, không tin cột mime
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(r.rows[0].data);
  } catch (error) {
    console.error('Lỗi lấy ảnh vuong-mac:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Xóa 1 ảnh
app.delete('/api/vuong-mac/photo/:photoId', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const photoId = Number(req.params.photoId);
    if (!Number.isInteger(photoId)) return res.status(400).json({ success: false, message: 'ID không hợp lệ' });

    const me = await getVuongMacActor(req);
    const r = await pool.query(
      `SELECT vm.created_by, vm.handler, u.department AS created_department
       FROM vuong_mac_photo ph
       JOIN vuong_mac vm ON vm.id = ph.vuong_mac_id
       LEFT JOIN users u ON u.username = vm.created_by
       WHERE ph.id = $1`,
      [photoId]
    );
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Không tìm thấy ảnh' });
    if (!canModifyVuongMac(me, r.rows[0].created_by, r.rows[0].created_department, r.rows[0].handler)) {
      return res.status(403).json({ success: false, message: 'Không có quyền xóa ảnh' });
    }
    await pool.query('DELETE FROM vuong_mac_photo WHERE id = $1', [photoId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Lỗi xóa ảnh vuong-mac:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// Lấy toàn bộ vướng mắc cho danh sách hex (không nối bảng sản xuất: nơi gọi đã có sẵn dữ liệu sản xuất)
app.post('/api/vuong-mac/list', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const hexes = Array.isArray(req.body?.hexes)
      ? req.body.hexes.map((h: unknown) => String(h)).filter(Boolean)
      : [];
    if (hexes.length === 0) return res.json({});
    if (hexes.length > 2000) return res.status(400).json({ error: 'Too many hexes' });

    const actor = await getVuongMacActor(req);
    const ready = await hasWorkflowSchema();
    const r = await timedQuery(
      `${selectVm(ready, false)}
       WHERE vm.hex = ANY($1::text[])
       ORDER BY vm.hex, vm.created_at ASC`,
      [hexes]
    );

    const out: Record<string, any[]> = {};
    r.rows.forEach(row => {
      if (!out[row.hex]) out[row.hex] = [];
      out[row.hex].push(mapVuongMacRow(row, actor));
    });
    res.json(out);
  } catch (error) {
    console.error('Lỗi /api/vuong-mac/list:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 1 vướng mắc (mở từ thông báo / đường dẫn chia sẻ)
app.get('/api/vuong-mac/item/:id', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'ID không hợp lệ' });
    const me = await getVuongMacActor(req);
    const row = await fetchOne(id, me);
    if (!row) return res.status(404).json({ success: false, message: 'Không tìm thấy vướng mắc (có thể đã bị xoá)' });
    res.json({ success: true, data: row });
  } catch (error) {
    console.error('Lỗi /api/vuong-mac/item:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// ============================================================================
// DANH SÁCH (app điện thoại + màn quản lý)
//   status : open (chưa xong: open+doing) | resolved (done+closed) | all      — tương thích cũ
//   st     : danh sách trạng thái cụ thể, ngăn bằng dấu phẩy (open,doing,done,closed) — ưu tiên hơn status
//   mine   : 1 (tôi tạo hoặc tôi xử lý) | assignee (tôi xử lý) | reporter (tôi tạo) | confirm (tôi tạo, chờ tôi xác nhận)
//   due    : overdue | soon (theo hạn BOT, chỉ dòng chưa xong)
//   sort   : bot (hạn BOT gần nhất) | oldest | priority | (mặc định: mới tạo trước)
//   xuong, congTrinh, handler, stage, priority, category, q, from, to, page, pageSize
// ============================================================================
app.get('/api/vuong-mac/all', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const status = String(req.query.status || 'open');
    const stList = String(req.query.st || '').split(',').map(s => s.trim()).filter(s => (VM_STATUSES as readonly string[]).includes(s)) as VmStatus[];
    const category = String(req.query.category || '');
    const q = String(req.query.q || '').trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 30));

    const mine = String(req.query.mine || '');
    const due = String(req.query.due || '');
    const sort = String(req.query.sort || '');
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    const xuongList = expandWorkshops(String(req.query.xuong || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean));
    const congTrinh = String(req.query.congTrinh || '').trim();
    const handler = String(req.query.handler || '').trim();
    const stage = String(req.query.stage || '').trim().toUpperCase();
    const priority = String(req.query.priority || '').trim();
    if ((from && !DAY_RE.test(from)) || (to && !DAY_RE.test(to))) {
      return res.status(400).json({ success: false, message: 'Ngày không hợp lệ' });
    }

    const me = await getVuongMacActor(req);
    const ready = await hasWorkflowSchema();
    const conds: string[] = [];
    const params: any[] = [];

    // Trạng thái
    const statusExpr = ready ? 'b.status' : `(CASE WHEN b.is_resolved THEN 'closed' ELSE 'open' END)`;
    if (stList.length) {
      // Chưa chạy SQL: doing ~ open, done ~ closed
      const mapped = ready ? stList : [...new Set(stList.map(s => (s === 'doing' ? 'open' : s === 'done' ? 'closed' : s)))];
      params.push(mapped);
      conds.push(`${statusExpr} = ANY($${params.length}::text[])`);
    } else if (status === 'open') conds.push('b.is_resolved = FALSE');
    else if (status === 'resolved') conds.push('b.is_resolved = TRUE');

    if ((FIVE_M_CATEGORIES as readonly string[]).includes(category)) {
      params.push(category);
      conds.push(`b.category = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      const n = params.length;
      conds.push(`(b.content ILIKE $${n} OR b.handler ILIKE $${n} OR b.created_by ILIKE $${n}
                   OR b.hex ILIKE $${n} OR COALESCE(b.p_ten_cong_trinh, b.ten_cong_trinh) ILIKE $${n}
                   OR COALESCE(b.p_ten_hang_muc, b.ten_hang_muc) ILIKE $${n})`);
    }
    if (from) {
      params.push(from);
      conds.push(`b.created_at >= ($${params.length}::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`);
    }
    if (to) {
      params.push(to);
      conds.push(`b.created_at < (($${params.length}::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`);
    }
    // Chỉ đẩy tham số thực sự dùng: tham số khai báo mà câu lệnh không tham chiếu => Postgres báo
    // "could not determine data type of parameter" (lỗi 500 khi lọc "Tôi báo" / "Tôi xử lý")
    const creatorCond = () => { params.push(me.username); return `b.created_by = $${params.length}`; };
    const handlerCond = () => {
      params.push(me.fullName ?? '');
      const n = params.length;
      return `($${n}::text <> '' AND LOWER(TRIM(b.handler)) = LOWER(TRIM($${n}::text)))`;
    };
    if (mine === 'assignee') conds.push(handlerCond());
    else if (mine === 'reporter') conds.push(creatorCond());
    else if (mine === 'confirm') conds.push(`${creatorCond()} AND ${statusExpr} = 'done'`);
    else if (mine) conds.push(`(${creatorCond()} OR ${handlerCond()})`);
    if (xuongList.length) {
      params.push(xuongList);
      conds.push(`UPPER(TRIM(COALESCE(${ready ? 'b.xuong, ' : ''}b.p_xuong_chinh, ''))) = ANY($${params.length}::text[])`);
    }
    if (congTrinh) {
      params.push(`%${congTrinh}%`);
      conds.push(`COALESCE(b.p_ten_cong_trinh, b.ten_cong_trinh) ILIKE $${params.length}`);
    }
    if (handler) {
      params.push(handler);
      conds.push(`LOWER(TRIM(b.handler)) = LOWER(TRIM($${params.length}))`);
    }
    if (stage && ready) { params.push(stage); conds.push(`b.stage = $${params.length}`); }
    if (priority && ready && (PRIORITIES as readonly string[]).includes(priority)) { params.push(priority); conds.push(`b.priority = $${params.length}`); }

    // Lọc / sắp theo hạn BOT phải đọc BOT (dạng chữ) nên làm ở Node: lấy hết dòng khớp rồi tự phân trang.
    // Chỉ áp cho vướng mắc CHƯA xong nên số dòng nhỏ.
    const byBot = (due === 'overdue' || due === 'soon') || sort === 'bot';
    if (due === 'overdue' || due === 'soon') conds.push('b.is_resolved = FALSE');
    if (!byBot) params.push(pageSize, (page - 1) * pageSize);

    const orderBy = sort === 'oldest'
      ? 'b.is_resolved ASC, b.created_at ASC'
      : sort === 'priority' && ready
        ? `b.is_resolved ASC, CASE b.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, b.created_at DESC`
        : 'b.is_resolved ASC, b.created_at DESC';

    const r = await timedQuery(
      `WITH base AS (${selectVm(ready, true)})
       SELECT b.*, COUNT(*) OVER() AS total
       FROM base b
       ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
       ORDER BY ${orderBy}
       ${byBot ? '' : `LIMIT $${params.length - 1} OFFSET $${params.length}`}`,
      params,
      { timeoutMs: 20000 }
    );

    let rows = r.rows;
    let total = rows[0] ? Number(rows[0].total) : 0;
    if (byBot) {
      const now = Date.now();
      if (due === 'overdue' || due === 'soon') rows = rows.filter(row => dueState(row.bot, now) === due);
      if (sort === 'bot') {
        // Chưa xong trước; trong đó hạn BOT sớm nhất trước, không có BOT xuống cuối
        const endOf = (row: any) => parseBotEnd(row.bot)?.getTime() ?? Number.POSITIVE_INFINITY;
        rows = [...rows].sort((a, b) =>
          Number(a.is_resolved) - Number(b.is_resolved) || endOf(a) - endOf(b));
      }
      total = rows.length;
      rows = rows.slice((page - 1) * pageSize, page * pageSize);
    }

    res.json({
      success: true,
      total,
      page,
      pageSize,
      workflow: ready,
      data: rows.map(row => mapVuongMacRow(row, me)),
    });
  } catch (e) {
    console.error('Lỗi /api/vuong-mac/all:', e);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// ============================================================================
// SỐ LIỆU MÀN "TỔNG QUAN" (app điện thoại): việc của tôi, theo trạng thái / hạn / loại / xưởng / công trình
// ============================================================================
app.get('/api/vuong-mac/stats', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const me = await getVuongMacActor(req);
    const ready = await hasWorkflowSchema();
    const [openR, dayR] = await Promise.all([
      // Vướng mắc chưa đóng (ít dòng) — đọc BOT ở Node để biết quá hạn / sắp đến hạn
      timedQuery(
        `SELECT vm.id, vm.category, vm.handler, vm.created_by, vm.bot, vm.is_resolved, vm.created_at,
                ${ready ? 'vm.status, vm.priority, vm.xuong, vm.escalated_at, vm.ten_cong_trinh,' : `NULL AS status, NULL AS priority, NULL AS xuong, NULL AS escalated_at, NULL AS ten_cong_trinh,`}
                EXISTS (SELECT 1 FROM vuong_mac_extension e WHERE e.vuong_mac_id = vm.id) AS has_ext,
                p.ten_cong_trinh AS p_ten_cong_trinh, p.xuong_chinh AS p_xuong_chinh
         FROM vuong_mac vm
         LEFT JOIN LATERAL (
           SELECT ten_cong_trinh, xuong_chinh FROM production_status_app
           WHERE hex::text = vm.hex ORDER BY updated_at DESC NULLS LAST LIMIT 1
         ) p ON TRUE
         WHERE ${ready ? `vm.status <> 'closed'` : 'vm.is_resolved = FALSE'}`
      ),
      // Phát sinh / đã xử lý / đã đóng trong hôm nay (giờ Việt Nam)
      timedQuery(
        `WITH d AS (SELECT (date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh') AS start)
         SELECT
           (SELECT COUNT(*) FROM vuong_mac, d WHERE created_at >= d.start) AS created_today,
           (SELECT COUNT(*) FROM vuong_mac, d WHERE is_resolved AND resolved_at >= d.start) AS resolved_today
           ${ready ? `, (SELECT COUNT(*) FROM vuong_mac, d WHERE closed_at >= d.start) AS closed_today` : ', 0 AS closed_today'}`
      ),
    ]);

    const now = Date.now();
    const s = {
      open: 0, doing: 0, waiting: 0, overdue: 0, soon: 0, extended: 0, noBot: 0, urgent: 0, escalated: 0,
      mine: { open: 0, overdue: 0, soon: 0, doing: 0, waiting: 0, reported: 0 },
      byCategory: {} as Record<string, number>,
      byStatus: { open: 0, doing: 0, done: 0 } as Record<string, number>,
    };
    const projects = new Map<string, { open: number; overdue: number }>();
    const xuongs = new Map<string, { open: number; overdue: number }>();
    for (const row of openR.rows) {
      const st = statusOf(row);
      const d = dueState(row.bot, now);
      const active = st === 'open' || st === 'doing';
      s.byStatus[st] = (s.byStatus[st] ?? 0) + 1;
      if (st === 'done') s.waiting++;
      const creator = row.created_by === me.username;
      const handlerMe = isHandler(me, row.handler);
      if (creator && st !== 'closed') s.mine.reported++;
      if (creator && st === 'done') s.mine.waiting++;
      if (!active) continue;
      s.open++;
      if (st === 'doing') s.doing++;
      if (d === 'overdue') s.overdue++;
      else if (d === 'soon') s.soon++;
      else if (d === 'none') s.noBot++;
      if (row.has_ext) s.extended++;
      if (row.priority === 'urgent') s.urgent++;
      if (row.escalated_at) s.escalated++;
      s.byCategory[row.category] = (s.byCategory[row.category] ?? 0) + 1;
      if (handlerMe || (creator && !row.handler)) {
        s.mine.open++;
        if (st === 'doing') s.mine.doing++;
        if (d === 'overdue') s.mine.overdue++;
        else if (d === 'soon') s.mine.soon++;
      }
      const name = String(row.p_ten_cong_trinh ?? row.ten_cong_trinh ?? '').trim();
      if (name) {
        const k = canonicalProjectName(name);
        const e = projects.get(k) ?? { open: 0, overdue: 0 };
        e.open++; if (d === 'overdue') e.overdue++;
        projects.set(k, e);
      }
      const x = workshopGroupOf(row.xuong ?? row.p_xuong_chinh ?? '');
      if (x) {
        const e = xuongs.get(x) ?? { open: 0, overdue: 0 };
        e.open++; if (d === 'overdue') e.overdue++;
        xuongs.set(x, e);
      }
    }
    const topProjects = [...projects.entries()]
      .map(([name, e]) => ({ name, ...e }))
      .sort((a, b) => b.overdue - a.overdue || b.open - a.open)
      .slice(0, 5);
    const byXuong = [...xuongs.entries()]
      .map(([name, e]) => ({ name, ...e }))
      .sort((a, b) => b.overdue - a.overdue || b.open - a.open);

    res.json({
      success: true,
      workflow: ready,
      ...s,
      createdToday: Number(dayR.rows[0]?.created_today ?? 0),
      resolvedToday: Number(dayR.rows[0]?.resolved_today ?? 0),
      closedToday: Number(dayR.rows[0]?.closed_today ?? 0),
      topProjects,
      byXuong,
      fullName: me.fullName,
      generatedAt: new Date(now).toISOString(),
    });
  } catch (e) {
    console.error('Lỗi /api/vuong-mac/stats:', e);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// ============================================================================
// BẢNG ĐIỀU KHIỂN CHO QUẢN LÝ (desktop): kỳ [from, to] (mặc định 30 ngày), lọc xưởng.
// Trả: tổng theo trạng thái / hạn; theo loại, xưởng, công đoạn, người xử lý, công trình;
// tuổi vướng mắc chưa xong; chuỗi theo tuần 12 tuần; thời gian nhận / xử lý / đóng trung bình.
// ============================================================================
const hoursBetween = (a: unknown, b: unknown) => {
  const x = a ? new Date(String(a)).getTime() : NaN, y = b ? new Date(String(b)).getTime() : NaN;
  return Number.isFinite(x) && Number.isFinite(y) && y >= x ? (y - x) / 3_600_000 : null;
};
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const vnDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(d);

app.get('/api/vuong-mac/dashboard', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const ready = await hasWorkflowSchema();
    const today = vnDay(new Date());
    const to = DAY_RE.test(String(req.query.to || '')) ? String(req.query.to) : today;
    const defFrom = new Date(`${to}T00:00:00+07:00`); defFrom.setDate(defFrom.getDate() - 29);
    const from = DAY_RE.test(String(req.query.from || '')) ? String(req.query.from) : vnDay(defFrom);
    const xuongList = expandWorkshops(String(req.query.xuong || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean));

    // 12 tuần gần nhất (thứ Hai -> Chủ nhật) cho chuỗi theo tuần
    const weekStart = new Date(`${to}T00:00:00+07:00`);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7) - 7 * 11);
    const seriesFrom = vnDay(weekStart);
    const lo = from < seriesFrom ? from : seriesFrom;

    const r = await timedQuery(
      `SELECT vm.id, vm.hex, vm.category, vm.content, vm.handler, vm.created_by, vm.created_at, vm.bot, vm.is_resolved,
              vm.resolved_at, vm.updated_at,
              ${ready
                ? 'vm.status, vm.priority, vm.stage, vm.xuong, vm.ten_cong_trinh, vm.accepted_at, vm.closed_at, vm.escalated_at,'
                : 'NULL AS status, NULL AS priority, NULL AS stage, NULL AS xuong, NULL AS ten_cong_trinh, NULL AS accepted_at, vm.resolved_at AS closed_at, NULL AS escalated_at,'}
              p.ten_cong_trinh AS p_ten_cong_trinh, p.xuong_chinh AS p_xuong_chinh, p.bop AS p_bop
       FROM vuong_mac vm
       LEFT JOIN LATERAL (
         SELECT ten_cong_trinh, xuong_chinh, bop FROM production_status_app
         WHERE hex::text = vm.hex ORDER BY updated_at DESC NULLS LAST LIMIT 1
       ) p ON TRUE
       WHERE ${ready ? `vm.status <> 'closed'` : 'vm.is_resolved = FALSE'}
          OR vm.created_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
          OR vm.resolved_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
          ${ready ? `OR vm.closed_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')` : ''}`,
      [lo],
      { timeoutMs: 20000 }
    );

    const now = Date.now();
    const inPeriod = (ts: unknown) => { const d = ts ? vnDay(new Date(String(ts))) : ''; return !!d && d >= from && d <= to; };
    type Agg = { open: number; doing: number; waiting: number; overdue: number; soon: number; created: number; done: number; closed: number; doneHours: number[] };
    const newAgg = (): Agg => ({ open: 0, doing: 0, waiting: 0, overdue: 0, soon: 0, created: 0, done: 0, closed: 0, doneHours: [] });
    const group = (m: Map<string, Agg>, k: string) => { let e = m.get(k); if (!e) { e = newAgg(); m.set(k, e); } return e; };
    const byCategory = new Map<string, Agg>(), byXuong = new Map<string, Agg>(), byStage = new Map<string, Agg>(),
      byHandler = new Map<string, Agg>(), byProject = new Map<string, Agg>();
    const totals = newAgg();
    let noBot = 0, escalated = 0, urgent = 0, extendedActive = 0;
    const acceptHours: number[] = [], doneHours: number[] = [], closeHours: number[] = [];
    const aging = { d1: 0, d3: 0, d7: 0, d14: 0, more: 0 };
    const weeks = new Map<string, { start: string; created: number; done: number; closed: number }>();
    for (let i = 0; i < 12; i++) {
      const d = new Date(weekStart); d.setDate(d.getDate() + i * 7);
      weeks.set(vnDay(d), { start: vnDay(d), created: 0, done: 0, closed: 0 });
    }
    const weekKeyOf = (ts: unknown) => {
      if (!ts) return null;
      const d = new Date(`${vnDay(new Date(String(ts)))}T00:00:00+07:00`);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const k = vnDay(d);
      return weeks.has(k) ? k : null;
    };
    const oldest: any[] = [];

    for (const row of r.rows) {
      const st = statusOf(row);
      const xuong = workshopGroupOf(row.xuong ?? row.p_xuong_chinh ?? '') || 'Chưa rõ';
      if (xuongList.length && !xuongList.includes(xuong) && !xuongList.includes(String(row.p_xuong_chinh ?? '').toUpperCase().trim())) continue;
      const stage = row.stage ?? stageOf(row.p_bop) ?? 'Chưa rõ';
      const project = row.p_ten_cong_trinh || row.ten_cong_trinh ? canonicalProjectName(row.p_ten_cong_trinh ?? row.ten_cong_trinh) : 'Chưa rõ';
      const handlerName = String(row.handler ?? '').trim() || 'Chưa giao';
      const groups = [totals, group(byCategory, row.category), group(byXuong, xuong), group(byStage, stage),
        group(byHandler, handlerName), group(byProject, project)];
      const active = st === 'open' || st === 'doing';
      const d = active ? dueState(row.bot, now) : 'none';

      if (active) {
        for (const g of groups) { g.open++; if (st === 'doing') g.doing++; if (d === 'overdue') g.overdue++; else if (d === 'soon') g.soon++; }
        if (d === 'none') noBot++;
        if (row.escalated_at) escalated++;
        if (row.priority === 'urgent') urgent++;
        const ageH = hoursBetween(row.created_at, new Date().toISOString()) ?? 0;
        if (ageH <= 24) aging.d1++; else if (ageH <= 72) aging.d3++; else if (ageH <= 168) aging.d7++; else if (ageH <= 336) aging.d14++; else aging.more++;
        oldest.push({ id: row.id, hex: row.hex, content: row.content, handler: row.handler, status: st, priority: row.priority ?? 'normal',
          createdAt: row.created_at, bot: row.bot, due: d, xuong, project, ageHours: Math.round(ageH), escalated: !!row.escalated_at });
      } else if (st === 'done') {
        for (const g of groups) g.waiting++;
      }
      if (inPeriod(row.created_at)) for (const g of groups) g.created++;
      if (row.is_resolved && inPeriod(row.resolved_at)) {
        for (const g of groups) g.done++;
        const h = hoursBetween(row.created_at, row.resolved_at);
        if (h !== null) { doneHours.push(h); for (const g of groups) g.doneHours.push(h); }
      }
      if (st === 'closed' && inPeriod(row.closed_at)) {
        for (const g of groups) g.closed++;
        const h = hoursBetween(row.created_at, row.closed_at);
        if (h !== null) closeHours.push(h);
      }
      if (row.accepted_at && inPeriod(row.accepted_at)) {
        const h = hoursBetween(row.created_at, row.accepted_at);
        if (h !== null) acceptHours.push(h);
      }
      const wc = weekKeyOf(row.created_at); if (wc) weeks.get(wc)!.created++;
      const wd = row.is_resolved ? weekKeyOf(row.resolved_at) : null; if (wd) weeks.get(wd)!.done++;
      const wz = st === 'closed' ? weekKeyOf(row.closed_at) : null; if (wz) weeks.get(wz)!.closed++;
    }

    const out = (m: Map<string, Agg>, limit?: number) => [...m.entries()]
      .map(([name, g]) => ({ name, open: g.open, doing: g.doing, waiting: g.waiting, overdue: g.overdue, soon: g.soon,
        created: g.created, done: g.done, closed: g.closed, avgDoneHours: avg(g.doneHours) }))
      .sort((a, b) => b.overdue - a.overdue || b.open - a.open || b.created - a.created)
      .slice(0, limit ?? 999);
    // Vướng mắc chưa xong lâu nhất: quá hạn trước, rồi tuổi lớn nhất
    oldest.sort((a, b) => Number(b.due === 'overdue') - Number(a.due === 'overdue') || b.ageHours - a.ageHours);

    res.json({
      success: true,
      workflow: ready,
      period: { from, to },
      generatedAt: new Date(now).toISOString(),
      totals: {
        open: totals.open, doing: totals.doing, waiting: totals.waiting, overdue: totals.overdue, soon: totals.soon,
        noBot, escalated, urgent, extended: extendedActive,
        created: totals.created, done: totals.done, closed: totals.closed,
        avgAcceptHours: avg(acceptHours), avgDoneHours: avg(doneHours), avgCloseHours: avg(closeHours),
      },
      byCategory: out(byCategory),
      byXuong: out(byXuong),
      byStage: out(byStage),
      byHandler: out(byHandler, 30),
      byProject: out(byProject, 15),
      aging,
      weekly: [...weeks.values()],
      oldest: oldest.slice(0, 20),
    });
  } catch (e) {
    console.error('Lỗi /api/vuong-mac/dashboard:', e);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// ============================================================================
// TẠO MỚI
// ============================================================================
app.post(
  '/api/vuong-mac',
  authenticateJWT,
  validateBody(vuongMacCreateSchema),
  async (req: Request, res: Response) => {
    try {
      const { hex, category, content, handler, bot, solution, note, priority } = req.body;
      const me = await getVuongMacActor(req);
      const actor = me.username;

      if (!(await canAddToVuongMacThread(me, hex, category))) {
        return res.status(403).json({ success: false, message: 'Chỉ thành viên cùng phòng ban mới được thêm vướng mắc vào mục này' });
      }
      const ready = await hasWorkflowSchema();
      const prod = ready ? await productionOfHex(String(hex)) : null;
      const hasHandler = !!(handler ?? '').trim();

      // Thêm vướng mắc + ghi nhật ký trong 1 transaction (nhật ký lỗi thì không thêm)
      const row = await withTransaction(async (client) => {
        const cols = ['hex', 'category', 'content', 'created_by', 'updated_by', 'handler', 'bot', 'bot_end', 'solution', 'note'];
        const vals: any[] = [hex, category, content, actor, actor, handler || null, bot || null, parseBotEnd(bot), solution || null, note || null];
        if (ready) {
          // Có người xử lý ngay từ đầu => coi như đã giao (đang xử lý); chưa có => mới
          cols.push('status', 'priority', 'stage', 'xuong', 'ten_cong_trinh', 'ma_cong_trinh', 'ten_hang_muc');
          vals.push(hasHandler ? 'doing' : 'open', priority ?? 'normal', prod?.stage ?? null, prod?.xuong ?? null,
            prod?.tenCongTrinh ?? null, prod?.maCongTrinh ?? null, prod?.tenHangMuc ?? null);
          if (hasHandler) { cols.push('accepted_at', 'accepted_by'); vals.push(new Date(), actor); }
        }
        const result = await client.query(
          `INSERT INTO vuong_mac (${cols.join(', ')}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(', ')})
           RETURNING id, hex`,
          vals
        );
        const inserted = result.rows[0];
        await client.query(
          `INSERT INTO vuong_mac_log (vuong_mac_id, hex, action, category, content_after, actor)
           VALUES ($1, $2, 'CREATE', $3, $4, $5)`,
          [inserted.id, hex, category, content, actor]
        );
        return inserted;
      });

      // Thông báo: người được tag > người xử lý > cùng phòng ban (mỗi người 1 thông báo)
      const who = await displayName(actor);
      await notify({ id: row.id, hex, category }, [
        { kind: 'mention', userIds: await findMentionedIds(content, solution, note),
          title: `${who} đã nhắc đến bạn — HEX ${hex}`, body: content },
        { kind: 'assigned', userIds: await idsByFullName(handler),
          title: `Bạn được giao xử lý vướng mắc — HEX ${hex}`, body: content },
        { kind: 'new_in_dept', userIds: await recipientsFor(actor, me.department),
          title: `Vướng mắc mới của ${who} — HEX ${hex}`, body: content },
      ], actor);

      res.json({ success: true, data: await fetchOne(row.id, me) });
    } catch (error) {
      console.error('Lỗi tạo vuong-mac:', error);
      res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
    }
  }
);

// ============================================================================
// SỬA + ĐỔI TRẠNG THÁI THEO QUY TRÌNH
// ============================================================================
const STATUS_LABEL: Record<VmStatus, string> = { open: 'Mới', doing: 'Đang xử lý', done: 'Đã xử lý', closed: 'Đã đóng' };

app.put(
  '/api/vuong-mac/:id',
  authenticateJWT,
  validateBody(vuongMacUpdateSchema),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const me = await getVuongMacActor(req);
      const actor = me.username;
      const ready = await hasWorkflowSchema();

      const existing = await pool.query(
        `SELECT vm.*, u.department AS created_department
         FROM vuong_mac vm
         LEFT JOIN users u ON u.username = vm.created_by
         WHERE vm.id = $1`,
        [id]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy vướng mắc' });
      }
      const old = existing.rows[0];
      const perms = permsOf(me, old.created_by, old.created_department, old.handler);
      if (!perms.edit) {
        return res.status(403).json({ success: false, message: 'Chỉ người tạo, người xử lý, cùng phòng ban người tạo hoặc Admin được thao tác' });
      }

      const { category, content, isResolved, resolvedNote, statusNote, priority, handler, bot, solution, note } = req.body;
      const noteClean = String(statusNote ?? resolvedNote ?? '').trim();

      // Trạng thái hiện tại / đích (tương thích isResolved cũ)
      const cur = statusOf(old);
      let target: VmStatus | undefined = req.body.status;
      if (!target && isResolved !== undefined) {
        target = isResolved ? (cur === 'closed' ? 'closed' : 'done') : (old.accepted_at ? 'doing' : 'open');
      }
      if (target === cur) target = undefined;

      const fields: string[] = ['updated_by = $1', 'updated_at = now()'];
      const values: any[] = [actor];
      let idx = 2;
      const push = (col: string, val: any) => { fields.push(`${col} = $${idx}`); values.push(val); idx++; };
      const logs: string[] = [];
      const events: Parameters<typeof notify>[1] = [];
      const who = await displayName(actor);
      // Người quan tâm tới trạng thái: người tạo + người xử lý + những người được tag
      const watchers = async (handlerName?: string | null, ...texts: (string | null | undefined)[]) =>
        [...(await idsByUsername(old.created_by)), ...(await idsByFullName(handlerName ?? old.handler)),
         ...(await findMentionedIds(...texts))];

      if (category !== undefined) push('category', category);
      if (content !== undefined) push('content', content);
      let newHandler: string | null | undefined;
      if (handler !== undefined) {
        newHandler = (handler ?? '').trim() || null;
        push('handler', newHandler);
      }
      if (bot !== undefined) {
        push('bot', bot || null);
        push('bot_end', parseBotEnd(bot));
      }
      if (solution !== undefined) push('solution', solution || null);
      if (note !== undefined) push('note', note || null);
      if (priority !== undefined && priority !== old.priority) {
        if (!ready) return res.status(409).json({ success: false, message: WORKFLOW_SQL_HINT });
        push('priority', priority);
        logs.push(`Ưu tiên: ${old.priority ?? 'normal'} → ${priority}`);
      }

      if (target) {
        const needReady = target === 'doing' || target === 'closed';
        if (needReady && !ready) return res.status(409).json({ success: false, message: WORKFLOW_SQL_HINT });
        const allowed: Record<VmStatus, VmStatus[]> = {
          open: ['doing', 'done', 'closed'],
          doing: ['open', 'done', 'closed'],
          done: ['doing', 'open', 'closed'],
          closed: ['doing', 'open'],
        };
        if (!allowed[cur].includes(target)) {
          return res.status(400).json({ success: false, message: `Không chuyển được từ "${STATUS_LABEL[cur]}" sang "${STATUS_LABEL[target]}"` });
        }
        const reopening = (cur === 'done' || cur === 'closed') && (target === 'doing' || target === 'open');
        // Quyền theo bước: báo xong / nhận xử lý = work; xác nhận đóng / mở lại = close
        if ((target === 'closed' || reopening) && !perms.close) {
          return res.status(403).json({ success: false, message: 'Chỉ người báo (hoặc cùng phòng ban người báo / Admin) mới xác nhận đóng hay mở lại được' });
        }
        if ((target === 'done' || target === 'doing') && !reopening && !perms.work) {
          return res.status(403).json({ success: false, message: 'Bạn không phải người xử lý của vướng mắc này' });
        }
        if ((target === 'done' || reopening || (target === 'closed' && cur !== 'done')) && !noteClean) {
          return res.status(400).json({
            success: false,
            message: target === 'done' ? 'Vui lòng nhập nội dung đã xử lý' : reopening ? 'Vui lòng ghi lý do mở lại' : 'Vui lòng ghi lý do đóng',
          });
        }
        if (ready) push('status', target);

        if (target === 'doing' && cur === 'open') {
          push('accepted_at', new Date()); push('accepted_by', actor);
          // Chưa có người xử lý => người nhận chính là người xử lý
          const effHandler = newHandler !== undefined ? newHandler : old.handler;
          if (!effHandler && me.fullName) { newHandler = me.fullName; push('handler', me.fullName); }
          logs.push(`Nhận xử lý${noteClean ? `: ${noteClean}` : ''}`);
          events.push({ kind: 'accepted', userIds: await idsByUsername(old.created_by),
            title: `${who} đã nhận xử lý vướng mắc — HEX ${old.hex}`, body: old.content });
        } else if (target === 'open' && cur === 'doing') {
          push('accepted_at', null); push('accepted_by', null);
          logs.push(`Trả lại, chưa xử lý${noteClean ? `: ${noteClean}` : ''}`);
        } else if (target === 'done') {
          push('is_resolved', true); push('resolved_note', noteClean); push('resolved_by', actor);
          fields.push('resolved_at = now()');
          if (ready && !old.accepted_at) { push('accepted_at', new Date()); push('accepted_by', actor); }
          logs.push(`Đánh dấu đã xử lý: ${noteClean}`);
          events.push({ kind: 'resolved', userIds: await watchers(newHandler, noteClean),
            title: `${who} đã xử lý xong vướng mắc — HEX ${old.hex}, chờ xác nhận`, body: noteClean });
        } else if (target === 'closed') {
          push('is_resolved', true);
          if (!old.is_resolved) { push('resolved_note', noteClean || 'Đóng trực tiếp'); push('resolved_by', actor); fields.push('resolved_at = now()'); }
          push('closed_at', new Date()); push('closed_by', actor);
          logs.push(`Xác nhận đóng${noteClean ? `: ${noteClean}` : ''}`);
          events.push({ kind: 'closed', userIds: await watchers(newHandler, noteClean),
            title: `${who} đã xác nhận đóng vướng mắc — HEX ${old.hex}`, body: noteClean || old.content });
        } else if (reopening) {
          push('is_resolved', false);
          fields.push('resolved_note = NULL', 'resolved_by = NULL', 'resolved_at = NULL');
          if (ready) { push('closed_at', null); push('closed_by', null); }
          if (target === 'open' && ready) { push('accepted_at', null); push('accepted_by', null); }
          logs.push(`Mở lại: ${noteClean}`);
          events.push({ kind: 'reopened', userIds: await watchers(newHandler, noteClean),
            title: `${who} đã mở lại vướng mắc — HEX ${old.hex}`, body: noteClean });
        }
      }

      if (fields.length === 2 && logs.length === 0) {
        return res.status(400).json({ success: false, message: 'Không có gì để lưu' });
      }

      values.push(id);
      const detail = logs.length ? logs.join('\n') : null;
      // Loại thao tác STATUS chỉ có sau khi chạy SQL quy trình (ràng buộc CHECK của vuong_mac_log)
      const action = target && ready ? 'STATUS' : 'UPDATE';

      // Cập nhật + ghi nhật ký trong 1 transaction
      const row = await withTransaction(async (client) => {
        const result = await client.query(
          `UPDATE vuong_mac SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, hex, category, content, handler, solution, note, resolved_note`,
          values
        );
        const updated = result.rows[0];
        await client.query(
          `INSERT INTO vuong_mac_log (vuong_mac_id, hex, action, category, content_before, content_after, detail, actor)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [updated.id, updated.hex, action, updated.category, old.content, updated.content, detail, actor]
        );
        return updated;
      });

      // Thông báo
      const oldMentions = await findMentionedIds(old.content, old.solution, old.note, old.resolved_note);
      const newMentions = await findMentionedIds(row.content, row.solution, row.note, row.resolved_note);
      const freshMentions = [...newMentions].filter(uid => !oldMentions.has(uid));   // chỉ báo người MỚI được tag
      const handlerChanged = newHandler !== undefined && !!newHandler && !sameName(newHandler, old.handler);
      await notify({ id: row.id, hex: row.hex, category: row.category }, [
        { kind: 'mention', userIds: freshMentions, title: `${who} đã nhắc đến bạn — HEX ${row.hex}`, body: noteClean || row.content },
        { kind: 'assigned', userIds: handlerChanged ? await idsByFullName(newHandler) : [],
          title: `Bạn được giao xử lý vướng mắc — HEX ${row.hex}`, body: row.content },
        ...events,
      ], actor);

      res.json({ success: true, data: await fetchOne(row.id, me) });
    } catch (error) {
      console.error('Lỗi sửa vuong-mac:', error);
      res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
    }
  }
);

// ============================================================================
// BÌNH LUẬN (trao đổi trong 1 vướng mắc): ghi vào nhật ký, báo cho người tạo / người xử lý / người được tag
// ============================================================================
app.post('/api/vuong-mac/:id/comment', authenticateJWT, validateBody(commentSchema), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'ID không hợp lệ' });
    const me = await getVuongMacActor(req);
    const old = (await pool.query('SELECT id, hex, category, content, handler, created_by FROM vuong_mac WHERE id = $1', [id])).rows[0];
    if (!old) return res.status(404).json({ success: false, message: 'Không tìm thấy vướng mắc' });
    const content = String(req.body.content).trim();
    // Chưa chạy SQL quy trình: ràng buộc CHECK cũ không nhận 'COMMENT' => ghi UPDATE kèm nhãn
    const ready = await hasWorkflowSchema();
    const r = await pool.query(
      `INSERT INTO vuong_mac_log (vuong_mac_id, hex, action, category, content_after, detail, actor)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, acted_at`,
      [old.id, old.hex, ready ? 'COMMENT' : 'UPDATE', old.category, ready ? content : old.content, ready ? null : `Bình luận: ${content}`, me.username]
    );
    const who = await displayName(me.username);
    await notify({ id: old.id, hex: old.hex, category: old.category }, [
      { kind: 'mention', userIds: await findMentionedIds(content), title: `${who} đã nhắc đến bạn — HEX ${old.hex}`, body: content },
      { kind: 'comment', userIds: [...(await idsByUsername(old.created_by)), ...(await idsByFullName(old.handler))],
        title: `${who} bình luận — HEX ${old.hex}`, body: content },
    ], me.username);
    res.json({ success: true, data: { id: r.rows[0].id, actedAt: r.rows[0].acted_at, actor: me.username, content } });
  } catch (error) {
    console.error('Lỗi bình luận vuong-mac:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// "Cần thêm thời gian"
app.post(
  '/api/vuong-mac/:id/extend',
  authenticateJWT,
  validateBody(vuongMacExtendSchema),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { content, bot, note } = req.body;
      const me = await getVuongMacActor(req);
      const actor = me.username;

      const botEnd = parseBotEnd(bot);
      if (!botEnd) {
        return res.status(400).json({ success: false, message: 'BOT không đúng định dạng "HH:mm dd/MM/yyyy - HH:mm dd/MM/yyyy"' });
      }

      const existing = await pool.query(
        `SELECT vm.*, u.department AS created_department
         FROM vuong_mac vm
         LEFT JOIN users u ON u.username = vm.created_by
         WHERE vm.id = $1`,
        [id]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy vướng mắc' });
      }
      const old = existing.rows[0];

      if (!permsOf(me, old.created_by, old.created_department, old.handler).work) {
        return res.status(403).json({ success: false, message: 'Chỉ người xử lý, người tạo, cùng phòng ban người tạo hoặc Admin được thao tác' });
      }
      if (old.is_resolved) {
        return res.status(400).json({ success: false, message: 'Vướng mắc đã xử lý, không thể xin thêm thời gian' });
      }

      const noteClean = (note ?? '').trim();
      const detail = [
        `Cần thêm thời gian: ${content}`,
        `BOT: ${old.bot || '—'} → ${bot}`,
        noteClean ? `Ghi chú: ${noteClean}` : null,
      ].filter(Boolean).join('\n');

      // 3 bước (thêm gia hạn, đổi BOT, ghi nhật ký) trong 1 transaction
      await withTransaction(async (client) => {
        await client.query(
          `INSERT INTO vuong_mac_extension (vuong_mac_id, content, bot, old_bot, note, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [old.id, content, bot, old.bot || null, noteClean || null, actor]
        );
        await client.query(
          `UPDATE vuong_mac SET bot = $1, bot_end = $2, updated_by = $3, updated_at = now() WHERE id = $4`,
          [bot, botEnd, actor, old.id]
        );
        await client.query(
          `INSERT INTO vuong_mac_log (vuong_mac_id, hex, action, category, content_before, content_after, detail, actor)
           VALUES ($1, $2, 'UPDATE', $3, $4, $4, $5, $6)`,
          [old.id, old.hex, old.category, old.content, detail, actor]
        );
      });

      const who = await displayName(actor);
      await notify({ id: old.id, hex: old.hex, category: old.category }, [
        { kind: 'mention', userIds: await findMentionedIds(content, noteClean),
          title: `${who} đã nhắc đến bạn — HEX ${old.hex}`, body: content },
        { kind: 'extend',
          userIds: [...(await idsByFullName(old.handler)), ...(await recipientsFor(old.created_by, old.created_department))],
          title: `${who} xin thêm thời gian — HEX ${old.hex}`, body: `${content}\nBOT mới: ${bot}` },
      ], actor);

      res.json({ success: true, data: await fetchOne(old.id, me) });
    } catch (error) {
      console.error('Lỗi extend vuong-mac:', error);
      res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
    }
  }
);

// Xóa
app.delete('/api/vuong-mac/:id', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const me = await getVuongMacActor(req);
    const actor = me.username;

    const existing = await pool.query(
      `SELECT vm.*, u.department AS created_department
       FROM vuong_mac vm
       LEFT JOIN users u ON u.username = vm.created_by
       WHERE vm.id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy vướng mắc' });
    }
    const old = existing.rows[0];
    if (!permsOf(me, old.created_by, old.created_department, old.handler).delete) {
      return res.status(403).json({ success: false, message: 'Chỉ người tạo, cùng phòng ban người tạo hoặc Admin được xóa' });
    }

    // Chụp lại toàn bộ thông tin TRƯỚC khi xóa (lịch sử gia hạn bị xóa theo CASCADE)
    const ext = await pool.query(
      `SELECT id, content, bot, old_bot AS "oldBot", note, created_by AS "createdBy", created_at AS "createdAt"
       FROM vuong_mac_extension WHERE vuong_mac_id = $1 ORDER BY created_at, id`,
      [old.id]
    );
    const { canModify: _omit, perms: _p, ...snapshot } = mapVuongMacRow(
      { ...old, extensions: ext.rows }, me, old.created_department
    );

    await withTransaction(async (client) => {
      await client.query('DELETE FROM vuong_mac WHERE id = $1', [id]);
      await client.query(
        `INSERT INTO vuong_mac_log (vuong_mac_id, hex, action, category, content_before, snapshot, actor)
         VALUES ($1, $2, 'DELETE', $3, $4, $5::jsonb, $6)`,
        [old.id, old.hex, old.category, old.content, JSON.stringify(snapshot), actor]
      );
    });

    res.json({ success: true, message: 'Đã xóa vướng mắc' });
  } catch (error) {
    console.error('Lỗi xóa vuong-mac:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// Nhật ký theo hex (?id= : chỉ 1 vướng mắc)
app.get('/api/vuong-mac/log/:hex', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { hex } = req.params;
    const id = Number(req.query.id) || null;
    const r = await timedQuery(
      `SELECT id, vuong_mac_id, hex, action, category, content_before, content_after, detail, snapshot, actor, acted_at
       FROM vuong_mac_log
       WHERE hex = $1 AND ($2::int IS NULL OR vuong_mac_id = $2)
       ORDER BY acted_at DESC
       LIMIT 500`,
      [hex, id]
    );
    res.json(r.rows.map(row => ({
      id: row.id,
      vuongMacId: row.vuong_mac_id,
      action: row.action,
      category: row.category,
      contentBefore: row.content_before,
      contentAfter: row.content_after,
      detail: row.detail,
      snapshot: row.snapshot ?? null,
      actor: row.actor,
      actedAt: row.acted_at,
    })));
  } catch (error) {
    console.error('Lỗi lấy log vuong-mac:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Danh sách xưởng (nhà máy) cho dropdown
// Vướng mắc đang mở (chưa xử lý xong) gộp theo công trình — cho Báo cáo tiến độ công trình (cột "VM" + ô cảnh báo).
// Khoá: mã công trình (bảng sản xuất, dòng mới nhất của HEX) + tên chuẩn; máy khách khớp theo mã trước, tên sau.
type VmByProject = { ma: string; ten: string; open: number; overdue: number }[];
let vmByProjectMemo: { at: number; value: VmByProject } | null = null;
let vmByProjectInflight: Promise<VmByProject> | null = null;
const VM_BY_PROJECT_TTL_MS = 60_000; // vướng mắc đổi bất kỳ lúc nào (không có phiên bản bảng) => giữ 1 phút
app.get('/api/vuong-mac/by-project', authenticateJWT, async (_req: Request, res: Response) => {
  try {
    if (vmByProjectMemo && Date.now() - vmByProjectMemo.at < VM_BY_PROJECT_TTL_MS) return res.json(vmByProjectMemo.value);
    if (!vmByProjectInflight) {
      vmByProjectInflight = (async () => {
        const r = await timedQuery(
          `SELECT COALESCE(NULLIF(TRIM(p.ma_cong_trinh), ''), '') AS ma,
                  COALESCE(NULLIF(TRIM(p.ten_cong_trinh), ''), '') AS ten,
                  COUNT(*)::int AS open,
                  COUNT(*) FILTER (WHERE vm.bot_end IS NOT NULL AND vm.bot_end < NOW())::int AS overdue
           FROM vuong_mac vm
           ${PRODUCTION_LATERAL}
           WHERE vm.is_resolved = FALSE
           GROUP BY 1, 2`,
          [],
          { timeoutMs: 20000 }
        );
        const value: VmByProject = r.rows.map(row => ({
          ma: String(row.ma), ten: canonicalProjectName(String(row.ten)), open: Number(row.open), overdue: Number(row.overdue),
        }));
        vmByProjectMemo = { at: Date.now(), value };
        return value;
      })().finally(() => { vmByProjectInflight = null; });
    }
    res.json(await vmByProjectInflight);
  } catch (error) {
    console.error('Lỗi /api/vuong-mac/by-project:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/vuong-mac/xuong', authenticateJWT, async (_req: Request, res: Response) => {
  try {
    const r = await timedQuery(
      `SELECT DISTINCT TRIM(xuong_chinh) AS name
       FROM production_status_app
       WHERE xuong_chinh IS NOT NULL AND TRIM(xuong_chinh) <> ''
       ORDER BY 1`
    );
    // Tên xưởng ĐÃ GỘP (setup gộp xưởng), bỏ trùng
    res.json([...new Set(r.rows.map(row => workshopGroupOf(row.name)).filter(Boolean))].sort());
  } catch (error) {
    console.error('Lỗi /api/vuong-mac/xuong:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Danh sách "Người xử lý" cho ô chọn: họ tên (users.full_name) của các tài khoản đang hoạt động.
// Mọi người đã đăng nhập đều gọi được (API /api/users/* chỉ dành cho ADMIN) nên CHỈ trả về họ tên.
app.get('/api/vuong-mac/handlers', authenticateJWT, async (_req: Request, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT DISTINCT TRIM(full_name) AS name
       FROM users
       WHERE is_active AND full_name IS NOT NULL AND TRIM(full_name) <> ''
       ORDER BY 1`
    );
    res.set('Cache-Control', 'private, max-age=300');
    res.json(r.rows.map(row => row.name as string));
  } catch (error) {
    console.error('Lỗi /api/vuong-mac/handlers:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Người xử lý + phòng ban (gợi ý giao việc theo loại 5M: vật tư -> phòng mua hàng / PC…)
app.get('/api/vuong-mac/people', authenticateJWT, async (_req: Request, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT TRIM(full_name) AS name, COALESCE(TRIM(department), '') AS department
       FROM users WHERE is_active AND full_name IS NOT NULL AND TRIM(full_name) <> ''
       ORDER BY 2, 1`
    );
    res.set('Cache-Control', 'private, max-age=300');
    res.json(r.rows);
  } catch (error) {
    console.error('Lỗi /api/vuong-mac/people:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Cột "mã nhà máy" (12 số) trong production_status_app. Đổi tên nếu cột thực tế khác.
const FACTORY_CODE_COL = 'ma_nha_may';
const HEX_HIT_COLS = `hex::text AS hex, ${FACTORY_CODE_COL}::text AS ma_nha_may,
                ten_cong_trinh, ten_hang_muc, xuong_chinh, ma_cong_trinh, ten_pc, ten_pm,
                bop, tinh_trang, tinh_trang_ipo, phan_loai_nhom_san_pham,
                tri_gia_don_hang_tong, thanh_tien_tinh_phieu, thanh_tien_nhap_kho_luy_ke,
                ngay_khnk_tuan, ngay_khnk_thang, ngay_can_giao`;
const mapHexHit = (row: any) => ({
  hex: row.hex,
  maNhaMay: row.ma_nha_may,
  congTrinh: row.ten_cong_trinh ? canonicalProjectName(row.ten_cong_trinh) : row.ten_cong_trinh,
  maCongTrinh: row.ma_cong_trinh,
  hangMuc: row.ten_hang_muc,
  xuong: workshopGroupOf(row.xuong_chinh) || row.xuong_chinh,
  pc: row.ten_pc,
  pm: row.ten_pm,
  bop: row.bop,
  stage: stageOf(row.bop),
  tinhTrang: row.tinh_trang,
  tinhTrangIpo: row.tinh_trang_ipo,
  phanLoai: row.phan_loai_nhom_san_pham,
  triGia: row.tri_gia_don_hang_tong,
  thanhTienPhieu: row.thanh_tien_tinh_phieu,
  thanhTienKho: row.thanh_tien_nhap_kho_luy_ke,
  deadline: planDate(row.ngay_khnk_tuan, row.ngay_khnk_thang),
  ngayCanGiao: row.ngay_can_giao ?? null,
});

// Tìm hex: theo xưởng (tuỳ chọn) + từ khoá (mã hex / công trình / hạng mục / xưởng)
app.get('/api/vuong-mac/hex-search', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    const xuongList = expandWorkshops(String(req.query.xuong || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean));
    if (q.length < 2 && xuongList.length === 0) return res.json([]);

    const conds: string[] = ['hex IS NOT NULL'];
    const params: any[] = [];
    if (xuongList.length) {
      params.push(xuongList);
      conds.push(`UPPER(TRIM(xuong_chinh)) = ANY($${params.length}::text[])`);
    }
    if (q) {
      params.push(`%${q.replace(/[%_\\]/g, '\\$&')}%`);
      const n = params.length;
      conds.push(`(hex::text ILIKE $${n} OR ${FACTORY_CODE_COL}::text ILIKE $${n}
                   OR ten_cong_trinh ILIKE $${n} OR ten_hang_muc ILIKE $${n} OR xuong_chinh ILIKE $${n})`);
    }

    const r = await timedQuery(
      `SELECT * FROM (
         SELECT DISTINCT ON (hex::text) ${HEX_HIT_COLS}
         FROM production_status_app
         WHERE ${conds.join(' AND ')}
         ORDER BY hex::text, updated_at DESC NULLS LAST
       ) t
       ORDER BY hex
       LIMIT 50`,
      params
    );
    res.json(r.rows.map(mapHexHit));
  } catch (error) {
    console.error('Lỗi /api/vuong-mac/hex-search:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/vuong-mac/hex-bulk', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const codes = Array.from(new Set(
      (Array.isArray(req.body?.codes) ? req.body.codes : [])
        .map((c: unknown) => String(c).trim()).filter(Boolean)
    )).slice(0, 200) as string[];
    const xuongs = (Array.isArray(req.body?.xuongs) ? req.body.xuongs : [])
      .map((x: unknown) => String(x).trim().toUpperCase()).filter(Boolean) as string[];
    if (codes.length === 0) return res.json({ hits: [], missing: [] });

    const params: any[] = [codes];
    let xuongCond = '';
    if (xuongs.length) {
      // Xưởng đã gộp (setup gộp xưởng) -> mọi mã gốc, giống hex-search
      params.push(expandWorkshops(xuongs));
      xuongCond = `AND UPPER(TRIM(xuong_chinh)) = ANY($2::text[])`;
    }

    const r = await timedQuery(
      `SELECT DISTINCT ON (hex::text) ${HEX_HIT_COLS}
       FROM production_status_app
       WHERE hex IS NOT NULL
         AND (TRIM(hex::text) = ANY($1::text[]) OR TRIM(${FACTORY_CODE_COL}::text) = ANY($1::text[]))
         ${xuongCond}
       ORDER BY hex::text, updated_at DESC NULLS LAST
       LIMIT 500`,
      params
    );

    const found = new Set<string>();
    r.rows.forEach(row => { found.add(String(row.hex).trim()); if (row.ma_nha_may) found.add(String(row.ma_nha_may).trim()); });

    res.json({
      hits: r.rows.map(mapHexHit),
      missing: codes.filter(c => !found.has(c)),
    });
  } catch (error) {
    console.error('Lỗi /api/vuong-mac/hex-bulk:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export type { VmRow };
export { isMine };
