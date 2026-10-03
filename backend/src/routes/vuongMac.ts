import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool, timedQuery, withTransaction } from '../db.js';
import { parseBotEnd } from '../vuongMacPush.js';
import { notify, findMentionedIds, idsByFullName, idsByUsername, recipientsFor, displayName } from '../notifications.js';
import { authenticateJWT } from '../server/auth.js';
import { validateBody } from '../server/validation.js';
import { app } from '../server/app.js';

const FIVE_M_CATEGORIES = ['man', 'machine', 'material', 'method', 'measurement'] as const;

const vuongMacCreateSchema = z.object({
  hex: z.string().min(1),
  category: z.enum(FIVE_M_CATEGORIES),
  content: z.string().min(1).max(2000),
  handler: z.string().max(200).optional().nullable(),
  bot: z.string().max(200).optional().nullable(),
  solution: z.string().max(2000).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});
const vuongMacUpdateSchema = z.object({
  category: z.enum(FIVE_M_CATEGORIES).optional(),
  content: z.string().min(1).max(2000).optional(),
  isResolved: z.boolean().optional(),
  resolvedNote: z.string().max(2000).optional().nullable(),
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

const VUONG_MAC_COLUMN_LIST = [
  'id', 'hex', 'category', 'content', 'is_resolved', 'created_by', 'created_at',
  'updated_by', 'updated_at', 'handler', 'bot', 'solution', 'note',
  'resolved_note', 'resolved_by', 'resolved_at',
];
const VUONG_MAC_COLUMNS = VUONG_MAC_COLUMN_LIST.join(', ');
const VUONG_MAC_COLUMNS_VM = VUONG_MAC_COLUMN_LIST.map(c => `vm.${c}`).join(', ');

// ---------- PHÂN QUYỀN THEO PHÒNG BAN ----------
const normDept = (d?: string | null) => (d ?? '').trim().toLowerCase();
const isSameDept = (a?: string | null, b?: string | null) => {
  const x = normDept(a);
  return x !== '' && x === normDept(b);
};

interface VuongMacActor {
  username: string;
  role: string;
  department: string | null;
  /** Họ tên (users.full_name) — để lọc "việc của tôi" theo cột Người xử lý */
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

// "Việc của tôi": tôi là người xử lý (so họ tên, không phân biệt hoa thường) hoặc tôi tạo
const isMine = (me: VuongMacActor, handler: string | null, createdBy: string | null) =>
  (!!createdBy && createdBy === me.username) ||
  (!!me.fullName && !!handler && handler.trim().toLowerCase() === me.fullName.trim().toLowerCase());

// Hạn BOT: "sắp đến hạn" = còn trong vòng 24 giờ
const DUE_SOON_MS = 24 * 60 * 60 * 1000;
type DueState = 'overdue' | 'soon' | 'ok' | 'none';
const dueState = (bot: string | null, now = Date.now()): DueState => {
  const end = parseBotEnd(bot);
  if (!end) return 'none';
  const left = end.getTime() - now;
  return left < 0 ? 'overdue' : left <= DUE_SOON_MS ? 'soon' : 'ok';
};

// Ngày "YYYY-MM-DD" theo giờ Việt Nam -> điều kiện SQL trên created_at
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const canModifyVuongMac = (actor: VuongMacActor, createdBy: string | null, createdDept: string | null) =>
  actor.role === 'ADMIN' ||
  (!!createdBy && createdBy === actor.username) ||
  isSameDept(actor.department, createdDept);

const canAddToVuongMacThread = async (actor: VuongMacActor, hex: string, category: string) => {
  if (actor.role === 'ADMIN') return true;
  const r = await pool.query(
    `SELECT vm.created_by, u.department AS created_department
     FROM vuong_mac vm
     LEFT JOIN users u ON u.username = vm.created_by
     WHERE vm.hex = $1 AND vm.category = $2`,
    [hex, category]
  );
  if (r.rows.length === 0) return true;
  return r.rows.some(
    row => row.created_by === actor.username || isSameDept(actor.department, row.created_department)
  );
};

// Chuyển 1 dòng vuong_mac (kèm extensions, photos) sang JSON trả cho client
const mapVuongMacRow = (
  row: any,
  actor: VuongMacActor,
  createdDepartment: string | null = row.created_department ?? null
) => ({
  id: row.id,
  category: row.category,
  content: row.content,
  isResolved: row.is_resolved,
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
  extensions: Array.isArray(row.extensions) ? row.extensions : [],
  photos: Array.isArray(row.photos) ? row.photos : [],          // danh sách id ảnh
  createdDepartment,
  canModify: canModifyVuongMac(actor, row.created_by, createdDepartment),
});


// SELECT vuong_mac kèm phòng ban người tạo, danh sách gia hạn (extensions) và id ảnh (photos)
const SELECT_VUONG_MAC_WITH_DEPT = `
  SELECT ${VUONG_MAC_COLUMNS_VM}, u.department AS created_department,
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
  FROM vuong_mac vm
  LEFT JOIN users u ON u.username = vm.created_by
`;


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
        `SELECT vm.created_by, u.department AS created_department
         FROM vuong_mac vm LEFT JOIN users u ON u.username = vm.created_by
         WHERE vm.id = $1`,
        [id]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy vướng mắc' });
      }
      const old = existing.rows[0];
      if (!canModifyVuongMac(me, old.created_by, old.created_department)) {
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

// Lấy 1 ảnh (cần token nên client fetch -> blob -> objectURL)
app.get('/api/vuong-mac/photo/:photoId', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const photoId = Number(req.params.photoId);
    if (!Number.isInteger(photoId)) return res.status(400).json({ error: 'Invalid id' });
    const r = await pool.query('SELECT data, mime FROM vuong_mac_photo WHERE id = $1', [photoId]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.setHeader('Content-Type', r.rows[0].mime || 'image/jpeg');
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
      `SELECT vm.created_by, u.department AS created_department
       FROM vuong_mac_photo ph
       JOIN vuong_mac vm ON vm.id = ph.vuong_mac_id
       LEFT JOIN users u ON u.username = vm.created_by
       WHERE ph.id = $1`,
      [photoId]
    );
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Không tìm thấy ảnh' });
    if (!canModifyVuongMac(me, r.rows[0].created_by, r.rows[0].created_department)) {
      return res.status(403).json({ success: false, message: 'Không có quyền xóa ảnh' });
    }
    await pool.query('DELETE FROM vuong_mac_photo WHERE id = $1', [photoId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Lỗi xóa ảnh vuong-mac:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// Lấy toàn bộ vướng mắc cho danh sách hex
app.post('/api/vuong-mac/list', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const hexes = Array.isArray(req.body?.hexes)
      ? req.body.hexes.map((h: unknown) => String(h)).filter(Boolean)
      : [];
    if (hexes.length === 0) return res.json({});
    if (hexes.length > 2000) return res.status(400).json({ error: 'Too many hexes' });

    const actor = await getVuongMacActor(req);
    const r = await timedQuery(
      `${SELECT_VUONG_MAC_WITH_DEPT}
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

// Danh sách toàn bộ (dùng cho trang mobile)
app.get('/api/vuong-mac/all', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const status = String(req.query.status || 'open'); // open | resolved | all
    const category = String(req.query.category || '');
    const q = String(req.query.q || '').trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 30));

    // Bộ lọc mới cho app mobile
    const mine = req.query.mine === '1';                                   // việc của tôi
    const due = String(req.query.due || '');                               // overdue | soon
    const sort = String(req.query.sort || '');                             // bot = hạn BOT gần nhất trước
    const from = String(req.query.from || '');                             // ngày tạo từ (YYYY-MM-DD, giờ VN)
    const to = String(req.query.to || '');                                 // ngày tạo đến
    if ((from && !DAY_RE.test(from)) || (to && !DAY_RE.test(to))) {
      return res.status(400).json({ success: false, message: 'Ngày không hợp lệ' });
    }

    const me = await getVuongMacActor(req);
    const conds: string[] = [];
    const params: any[] = [];

    if (status === 'open') conds.push('b.is_resolved = FALSE');
    else if (status === 'resolved') conds.push('b.is_resolved = TRUE');
    if ((FIVE_M_CATEGORIES as readonly string[]).includes(category)) {
      params.push(category);
      conds.push(`b.category = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      const n = params.length;
      conds.push(`(b.content ILIKE $${n} OR b.handler ILIKE $${n} OR b.created_by ILIKE $${n}
                   OR b.hex ILIKE $${n} OR p.ten_cong_trinh ILIKE $${n})`);
    }
    if (from) {
      params.push(from);
      conds.push(`b.created_at >= ($${params.length}::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`);
    }
    if (to) {
      params.push(to);
      conds.push(`b.created_at < (($${params.length}::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`);
    }
    if (mine) {
      params.push(me.username, me.fullName ?? '');
      const u = params.length - 1, n = params.length;
      conds.push(`(b.created_by = $${u} OR ($${n} <> '' AND LOWER(TRIM(b.handler)) = LOWER(TRIM($${n}))))`);
    }

    // Lọc / sắp theo hạn BOT phải đọc BOT (dạng chữ) nên làm ở Node: lấy hết dòng khớp rồi tự phân trang.
    // Chỉ áp cho vướng mắc CHƯA xử lý nên số dòng nhỏ.
    const byBot = (due === 'overdue' || due === 'soon') || sort === 'bot';
    if (due === 'overdue' || due === 'soon') conds.push('b.is_resolved = FALSE');
    if (!byBot) params.push(pageSize, (page - 1) * pageSize);

    const r = await timedQuery(
      `WITH base AS (${SELECT_VUONG_MAC_WITH_DEPT})
       SELECT b.*, p.ten_cong_trinh, p.ten_hang_muc, p.xuong_chinh,
              COUNT(*) OVER() AS total
       FROM base b
       LEFT JOIN LATERAL (
         SELECT ten_cong_trinh, ten_hang_muc, xuong_chinh
         FROM production_status_app
         WHERE hex::text = b.hex
         ORDER BY updated_at DESC NULLS LAST LIMIT 1
       ) p ON TRUE
       ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
       ORDER BY b.is_resolved ASC, b.created_at DESC
       ${byBot ? '' : `LIMIT $${params.length - 1} OFFSET $${params.length}`}`,
      params
    );

    let rows = r.rows;
    let total = rows[0] ? Number(rows[0].total) : 0;
    if (byBot) {
      const now = Date.now();
      if (due === 'overdue' || due === 'soon') rows = rows.filter(row => dueState(row.bot, now) === due);
      if (sort === 'bot') {
        // Chưa xử lý trước; trong đó hạn BOT sớm nhất trước, không có BOT xuống cuối
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
      data: rows.map(row => ({
        ...mapVuongMacRow(row, me),
        hex: row.hex,
        congTrinh: row.ten_cong_trinh,
        hangMuc: row.ten_hang_muc,
        xuong: row.xuong_chinh,
      })),
    });
  } catch (e) {
    console.error('Lỗi /api/vuong-mac/all:', e);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// Số liệu cho màn "Tổng quan" của app mobile
app.get('/api/vuong-mac/stats', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const me = await getVuongMacActor(req);
    const [openR, dayR] = await Promise.all([
      // Vướng mắc chưa xử lý (ít dòng) — đọc BOT ở Node để biết quá hạn / sắp đến hạn
      timedQuery(
        `SELECT vm.id, vm.category, vm.handler, vm.created_by, vm.bot,
                EXISTS (SELECT 1 FROM vuong_mac_extension e WHERE e.vuong_mac_id = vm.id) AS has_ext,
                p.ten_cong_trinh
         FROM vuong_mac vm
         LEFT JOIN LATERAL (
           SELECT ten_cong_trinh FROM production_status_app
           WHERE hex::text = vm.hex ORDER BY updated_at DESC NULLS LAST LIMIT 1
         ) p ON TRUE
         WHERE vm.is_resolved = FALSE`
      ),
      // Phát sinh / đã xử lý trong hôm nay (giờ Việt Nam)
      timedQuery(
        `WITH d AS (SELECT (date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh') AS start)
         SELECT
           (SELECT COUNT(*) FROM vuong_mac, d WHERE created_at >= d.start) AS created_today,
           (SELECT COUNT(*) FROM vuong_mac, d WHERE is_resolved AND resolved_at >= d.start) AS resolved_today`
      ),
    ]);

    const now = Date.now();
    const s = {
      open: 0, overdue: 0, soon: 0, extended: 0, noBot: 0,
      mine: { open: 0, overdue: 0, soon: 0 },
      byCategory: {} as Record<string, number>,
    };
    const projects = new Map<string, { open: number; overdue: number }>();
    for (const row of openR.rows) {
      const d = dueState(row.bot, now);
      s.open++;
      if (d === 'overdue') s.overdue++;
      else if (d === 'soon') s.soon++;
      else if (d === 'none') s.noBot++;
      if (row.has_ext) s.extended++;
      s.byCategory[row.category] = (s.byCategory[row.category] ?? 0) + 1;
      if (isMine(me, row.handler, row.created_by)) {
        s.mine.open++;
        if (d === 'overdue') s.mine.overdue++;
        else if (d === 'soon') s.mine.soon++;
      }
      const name = String(row.ten_cong_trinh ?? '').trim();
      if (name) {
        const e = projects.get(name) ?? { open: 0, overdue: 0 };
        e.open++; if (d === 'overdue') e.overdue++;
        projects.set(name, e);
      }
    }
    const topProjects = [...projects.entries()]
      .map(([name, e]) => ({ name, ...e }))
      .sort((a, b) => b.overdue - a.overdue || b.open - a.open)
      .slice(0, 5);

    res.json({
      success: true,
      ...s,
      createdToday: Number(dayR.rows[0]?.created_today ?? 0),
      resolvedToday: Number(dayR.rows[0]?.resolved_today ?? 0),
      topProjects,
      fullName: me.fullName,
      generatedAt: new Date(now).toISOString(),
    });
  } catch (e) {
    console.error('Lỗi /api/vuong-mac/stats:', e);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// Tạo mới
app.post(
  '/api/vuong-mac',
  authenticateJWT,
  validateBody(vuongMacCreateSchema),
  async (req: Request, res: Response) => {
    try {
      const { hex, category, content, handler, bot, solution, note } = req.body;
      const me = await getVuongMacActor(req);
      const actor = me.username;

      if (!(await canAddToVuongMacThread(me, hex, category))) {
        return res.status(403).json({ success: false, message: 'Chỉ thành viên cùng phòng ban mới được thêm vướng mắc vào mục này' });
      }

      // Thêm vướng mắc + ghi nhật ký trong 1 transaction (nhật ký lỗi thì không thêm)
      const row = await withTransaction(async (client) => {
        const result = await client.query(
          `INSERT INTO vuong_mac (hex, category, content, created_by, updated_by, handler, bot, bot_end, solution, note)
           VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9)
           RETURNING ${VUONG_MAC_COLUMNS}`,
          [hex, category, content, actor, handler || null, bot || null, parseBotEnd(bot), solution || null, note || null]
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

      res.json({ success: true, data: mapVuongMacRow(row, me, me.department) });
    } catch (error) {
      console.error('Lỗi tạo vuong-mac:', error);
      res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
    }
  }
);

// Sửa (đánh dấu đã xử lý bắt buộc có resolvedNote)
app.put(
  '/api/vuong-mac/:id',
  authenticateJWT,
  validateBody(vuongMacUpdateSchema),
  async (req: Request, res: Response) => {
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

      if (!canModifyVuongMac(me, old.created_by, old.created_department)) {
        return res.status(403).json({ success: false, message: 'Chỉ thành viên cùng phòng ban với người tạo (hoặc Admin) được thao tác' });
      }

      const { category, content, isResolved, resolvedNote, handler, bot, solution, note } = req.body;

      const resolvedNoteClean = (resolvedNote ?? '').trim();
      const markingResolved = isResolved === true && !old.is_resolved;
      if (markingResolved && !resolvedNoteClean) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập nội dung đã xử lý' });
      }

      const fields: string[] = ['updated_by = $1', 'updated_at = now()'];
      const values: any[] = [actor];
      let idx = 2;
      const push = (col: string, val: any) => { fields.push(`${col} = $${idx}`); values.push(val); idx++; };

      if (category !== undefined) push('category', category);
      if (content !== undefined) push('content', content);
      if (handler !== undefined) push('handler', handler || null);
      if (bot !== undefined) {
        push('bot', bot || null);
        push('bot_end', parseBotEnd(bot));
      }
      if (solution !== undefined) push('solution', solution || null);
      if (note !== undefined) push('note', note || null);

      if (isResolved !== undefined) {
        push('is_resolved', isResolved);
        if (isResolved) {
          if (markingResolved) {
            push('resolved_note', resolvedNoteClean);
            push('resolved_by', actor);
            fields.push('resolved_at = now()');
          }
        } else {
          fields.push('resolved_note = NULL', 'resolved_by = NULL', 'resolved_at = NULL');
        }
      }

      values.push(id);
      const detail = markingResolved ? `Đánh dấu đã xử lý: ${resolvedNoteClean}` : null;

      // Cập nhật + ghi nhật ký trong 1 transaction
      const row = await withTransaction(async (client) => {
        const result = await client.query(
          `UPDATE vuong_mac SET ${fields.join(', ')} WHERE id = $${idx}
           RETURNING ${VUONG_MAC_COLUMNS}`,
          values
        );
        const updated = result.rows[0];
        await client.query(
          `INSERT INTO vuong_mac_log (vuong_mac_id, hex, action, category, content_before, content_after, detail, actor)
           VALUES ($1, $2, 'UPDATE', $3, $4, $5, $6, $7)`,
          [updated.id, updated.hex, updated.category, old.content, updated.content, detail, actor]
        );
        return updated;
      });

      // Thông báo
      const who = await displayName(actor);
      const sameName = (a?: string | null, b?: string | null) =>
        (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
      const oldMentions = await findMentionedIds(old.content, old.solution, old.note, old.resolved_note);
      const newMentions = await findMentionedIds(row.content, row.solution, row.note, row.resolved_note);
      const freshMentions = [...newMentions].filter(id => !oldMentions.has(id));   // chỉ báo người MỚI được tag
      const handlerChanged = handler !== undefined && !!(handler ?? '').trim() && !sameName(handler, old.handler);
      const reopening = isResolved === false && old.is_resolved;
      // Người quan tâm tới trạng thái: người tạo + người xử lý + những người được tag
      const watchers = markingResolved || reopening
        ? [...(await idsByUsername(row.created_by)), ...(await idsByFullName(row.handler)), ...newMentions]
        : [];
      await notify({ id: row.id, hex: row.hex, category: row.category }, [
        { kind: 'mention', userIds: freshMentions, title: `${who} đã nhắc đến bạn — HEX ${row.hex}`,
          body: markingResolved ? resolvedNoteClean : row.content },
        { kind: 'assigned', userIds: handlerChanged ? await idsByFullName(handler) : [],
          title: `Bạn được giao xử lý vướng mắc — HEX ${row.hex}`, body: row.content },
        { kind: 'resolved', userIds: markingResolved ? watchers : [],
          title: `${who} đã xử lý xong vướng mắc — HEX ${row.hex}`, body: resolvedNoteClean },
        { kind: 'reopened', userIds: reopening ? watchers : [],
          title: `${who} đã mở lại vướng mắc — HEX ${row.hex}`, body: row.content },
      ], actor);

      res.json({ success: true, data: mapVuongMacRow(row, me, old.created_department) });
    } catch (error) {
      console.error('Lỗi sửa vuong-mac:', error);
      res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
    }
  }
);

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

      if (!canModifyVuongMac(me, old.created_by, old.created_department)) {
        return res.status(403).json({ success: false, message: 'Chỉ thành viên cùng phòng ban với người tạo (hoặc Admin) được thao tác' });
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

      // 3 bước (thêm gia hạn, đổi BOT, ghi nhật ký) trong 1 transaction: không còn cảnh
      // đã thêm gia hạn nhưng BOT chưa đổi, hoặc đổi rồi mà không có nhật ký.
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

      // Thông báo (sau khi đã lưu xong; không ném lỗi): người được tag, rồi người xử lý + người tạo + cùng phòng ban
      const who = await displayName(actor);
      await notify({ id: old.id, hex: old.hex, category: old.category }, [
        { kind: 'mention', userIds: await findMentionedIds(content, noteClean),
          title: `${who} đã nhắc đến bạn — HEX ${old.hex}`, body: content },
        { kind: 'extend',
          userIds: [...(await idsByFullName(old.handler)), ...(await recipientsFor(old.created_by, old.created_department))],
          title: `${who} xin thêm thời gian — HEX ${old.hex}`, body: `${content}\nBOT mới: ${bot}` },
      ], actor);

      const fresh = await pool.query(`${SELECT_VUONG_MAC_WITH_DEPT} WHERE vm.id = $1`, [old.id]);
      res.json({ success: true, data: mapVuongMacRow(fresh.rows[0], me) });
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
    if (!canModifyVuongMac(me, old.created_by, old.created_department)) {
      return res.status(403).json({ success: false, message: 'Chỉ thành viên cùng phòng ban với người tạo (hoặc Admin) được xóa' });
    }

    // Chụp lại toàn bộ thông tin TRƯỚC khi xóa (lịch sử gia hạn bị xóa theo CASCADE)
    const ext = await pool.query(
      `SELECT id, content, bot, old_bot AS "oldBot", note, created_by AS "createdBy", created_at AS "createdAt"
       FROM vuong_mac_extension WHERE vuong_mac_id = $1 ORDER BY created_at, id`,
      [old.id]
    );
    const { canModify: _omit, ...snapshot } = mapVuongMacRow(
      { ...old, extensions: ext.rows }, me, old.created_department
    );

    // Xoá + ghi nhật ký (kèm bản chụp) trong 1 transaction. Trước đây 2 lệnh chạy rời: nếu ghi
    // nhật ký lỗi thì vướng mắc VẪN bị xoá mà không còn bản lưu, người dùng lại nhận lỗi 500.
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

// Nhật ký theo hex
app.get('/api/vuong-mac/log/:hex', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { hex } = req.params;
    const r = await timedQuery(
      `SELECT id, vuong_mac_id, hex, action, category, content_before, content_after, detail, snapshot, actor, acted_at
       FROM vuong_mac_log
       WHERE hex = $1
       ORDER BY acted_at DESC
       LIMIT 500`,
      [hex]
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
app.get('/api/vuong-mac/xuong', authenticateJWT, async (_req: Request, res: Response) => {
  try {
    const r = await timedQuery(
      `SELECT DISTINCT TRIM(xuong_chinh) AS name
       FROM production_status_app
       WHERE xuong_chinh IS NOT NULL AND TRIM(xuong_chinh) <> ''
       ORDER BY 1`
    );
    res.json(r.rows.map(row => row.name as string));
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

// Cột "mã nhà máy" (12 số) trong production_status_app. Đổi tên nếu cột thực tế khác.
const FACTORY_CODE_COL = 'ma_nha_may';
// Tìm hex: theo xưởng (tuỳ chọn) + từ khoá (mã hex / công trình / hạng mục / xưởng)
app.get('/api/vuong-mac/hex-search', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    const xuongList = String(req.query.xuong || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
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
         SELECT DISTINCT ON (hex::text)
                hex::text AS hex, ${FACTORY_CODE_COL}::text AS ma_nha_may,
                ten_cong_trinh, ten_hang_muc, xuong_chinh,
                bop, tinh_trang, phan_loai_nhom_san_pham,
                tri_gia_don_hang_tong, thanh_tien_tinh_phieu, thanh_tien_nhap_kho_luy_ke
         FROM production_status_app
         WHERE ${conds.join(' AND ')}
         ORDER BY hex::text, updated_at DESC NULLS LAST
       ) t
       ORDER BY hex
       LIMIT 50`,
      params
    );
    res.json(r.rows.map(row => ({
      hex: row.hex,
      maNhaMay: row.ma_nha_may,
      congTrinh: row.ten_cong_trinh,
      hangMuc: row.ten_hang_muc,
      xuong: row.xuong_chinh,
      bop: row.bop,
      tinhTrang: row.tinh_trang,
      phanLoai: row.phan_loai_nhom_san_pham,
      triGia: row.tri_gia_don_hang_tong,
      thanhTienPhieu: row.thanh_tien_tinh_phieu,
      thanhTienKho: row.thanh_tien_nhap_kho_luy_ke,
    })));
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
      params.push(xuongs);
      xuongCond = `AND UPPER(TRIM(xuong_chinh)) = ANY($2::text[])`;
    }

    const r = await timedQuery(
      `SELECT DISTINCT ON (hex::text)
              hex::text AS hex, ${FACTORY_CODE_COL}::text AS ma_nha_may,
              ten_cong_trinh, ten_hang_muc, xuong_chinh,
              bop, tinh_trang, phan_loai_nhom_san_pham,
              tri_gia_don_hang_tong, thanh_tien_tinh_phieu, thanh_tien_nhap_kho_luy_ke
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
      hits: r.rows.map(row => ({
        hex: row.hex, maNhaMay: row.ma_nha_may,
        congTrinh: row.ten_cong_trinh, hangMuc: row.ten_hang_muc, xuong: row.xuong_chinh,
        bop: row.bop, tinhTrang: row.tinh_trang, phanLoai: row.phan_loai_nhom_san_pham,
        triGia: row.tri_gia_don_hang_tong, thanhTienPhieu: row.thanh_tien_tinh_phieu,
        thanhTienKho: row.thanh_tien_nhap_kho_luy_ke,
      })),
      missing: codes.filter(c => !found.has(c)),
    });
  } catch (error) {
    console.error('Lỗi /api/vuong-mac/hex-bulk:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
