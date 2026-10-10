import express from 'express';
import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import { pool } from '../db.js';
import { authenticateJWT, requireRole, isValidUserId } from '../server/auth.js';
import { invalidateUserAccess } from '../server/permissions.js';
import { validateBody, createUserSchema, updateUserSchema } from '../server/validation.js';
import { app } from '../server/app.js';
import { invalidateUsersCache } from '../notifications.js';

// ============================================================================
// USERS API — nay yêu cầu JWT + role ADMIN cho toàn bộ (trước đây public hoàn toàn)
// (Giữ nguyên pool.query — CRUD nhỏ, không phải điểm nóng)
// ============================================================================
const usersRouter = express.Router();
usersRouter.use(authenticateJWT, requireRole('ADMIN'));

// --- LẤY DANH SÁCH USER (có phân trang) ---
usersRouter.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
    const offset = (page - 1) * pageSize;

    const [countResult, result] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query(
        `SELECT id, username, full_name, email, role, permissions,
                msnv, department, note, is_active, created_at, updated_at
         FROM users ORDER BY created_at DESC, id DESC
         LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      ),
    ]);

    const users = result.rows.map(u => ({
      id: u.id,
      username: u.username,
      fullName: u.full_name,
      email: u.email,
      role: u.role,
      permissions: u.permissions || [],
      msnv: u.msnv,
      department: u.department,
      note: u.note,
      status: u.is_active ? 'ACTIVE' : 'INACTIVE',
      createdAt: u.created_at,
      updatedAt: u.updated_at,
    }));

    res.json({
      success: true,
      data: users,
      pagination: { page, pageSize, total: Number(countResult.rows[0].count) },
    });
  } catch (error) {
    console.error('Lỗi lấy danh sách user:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// --- THÊM USER MỚI ---
usersRouter.post('/', validateBody(createUserSchema), async (req: Request, res: Response) => {
  try {
    const { username, password, fullName, email, role, permissions, msnv, department, note, status } = req.body;

    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Tên đăng nhập đã tồn tại' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const isActive = status !== 'INACTIVE';

    const result = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, email, role, permissions, msnv, department, note, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, username, full_name, email, role, permissions, msnv, department, note, is_active, created_at`,
      [username, passwordHash, fullName, email || null, role || 'USER', permissions || [], msnv || null, department || null, note || null, isActive]
    );

    const u = result.rows[0];
    res.json({
      success: true,
      message: 'Tạo user thành công',
      data: {
        id: u.id, username: u.username, fullName: u.full_name, email: u.email,
        role: u.role, permissions: u.permissions || [], msnv: u.msnv,
        department: u.department, note: u.note, status: u.is_active ? 'ACTIVE' : 'INACTIVE',
      },
    });
  } catch (error) {
    console.error('Lỗi tạo user:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// Số ADMIN đang hoạt động KHÁC user id — 0 thì không cho khoá / hạ quyền / xoá user này (mất quyền quản trị)
const otherActiveAdmins = async (id: string | string[]): Promise<number> => {
  const r = await pool.query(`SELECT COUNT(*) AS n FROM users WHERE role = 'ADMIN' AND is_active = true AND id <> $1`, [String(id)]);
  return Number(r.rows[0].n);
};

// --- CẬP NHẬT USER ---
usersRouter.put('/:id', validateBody(updateUserSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidUserId(id)) return res.status(400).json({ success: false, message: 'ID không hợp lệ' });
    const { password, fullName, email, role, permissions, msnv, department, note, status } = req.body;

    const existing = await pool.query('SELECT id, role, is_active FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
    }
    // Không cho admin tự khoá / tự hạ quyền chính mình (tránh mất quyền quản trị)
    if (Number(existing.rows[0].id) === Number(req.user!.id)) {
      if (status !== undefined && status !== 'ACTIVE') {
        return res.status(400).json({ success: false, message: 'Không thể tự khoá tài khoản của chính mình' });
      }
      if (role !== undefined && role !== 'ADMIN') {
        return res.status(400).json({ success: false, message: 'Không thể tự hạ quyền ADMIN của chính mình' });
      }
    }
    // Không khoá / hạ quyền ADMIN đang hoạt động cuối cùng
    const ex = existing.rows[0];
    const losesAdmin = (status !== undefined && status !== 'ACTIVE') || (role !== undefined && role !== 'ADMIN');
    if (ex.role === 'ADMIN' && ex.is_active && losesAdmin && (await otherActiveAdmins(id)) === 0) {
      return res.status(400).json({ success: false, message: 'Không thể khoá hoặc hạ quyền ADMIN đang hoạt động cuối cùng' });
    }

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    const push = (col: string, val: any) => { fields.push(`${col} = $${idx}`); values.push(val); idx++; };

    if (fullName !== undefined) push('full_name', fullName);
    if (email !== undefined) push('email', email || null);
    if (role !== undefined) push('role', role);
    if (permissions !== undefined) push('permissions', permissions || []);
    if (msnv !== undefined) push('msnv', msnv || null);
    if (department !== undefined) push('department', department || null);
    if (note !== undefined) push('note', note || null);
    if (status !== undefined) push('is_active', status === 'ACTIVE');

    if (password) {
      const passwordHash = await bcrypt.hash(password, 12);
      push('password_hash', passwordHash);
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'Không có dữ liệu để cập nhật' });
    }

    fields.push(`updated_at = now()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, username, full_name, email, role, permissions, msnv, department, note, is_active`,
      values
    );
    // Role / quyền / trạng thái có hiệu lực ngay (không chờ cache 60 giây) — cả danh sách người nhận thông báo / push
    invalidateUserAccess(String(Number(id)));
    invalidateUsersCache();

    const u = result.rows[0];
    res.json({
      success: true,
      message: 'Cập nhật thành công',
      data: {
        id: u.id, username: u.username, fullName: u.full_name, email: u.email,
        role: u.role, permissions: u.permissions || [], msnv: u.msnv,
        department: u.department, note: u.note, status: u.is_active ? 'ACTIVE' : 'INACTIVE',
      },
    });
  } catch (error) {
    console.error('Lỗi cập nhật user:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// --- XÓA USER ---
usersRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // So theo số: '/api/users/01' cũng là chính mình
    if (!isValidUserId(id)) return res.status(400).json({ success: false, message: 'ID không hợp lệ' });
    if (Number(id) === Number(req.user!.id)) {
      return res.status(400).json({ success: false, message: 'Không thể tự xoá tài khoản của chính mình' });
    }
    const target = await pool.query('SELECT username, role, is_active FROM users WHERE id = $1', [id]);
    if (target.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
    }
    if (target.rows[0].username === 'admin') {
      return res.status(403).json({ success: false, message: 'Không thể xóa tài khoản admin' });
    }
    if (target.rows[0].role === 'ADMIN' && target.rows[0].is_active && (await otherActiveAdmins(id)) === 0) {
      return res.status(400).json({ success: false, message: 'Không thể xoá ADMIN đang hoạt động cuối cùng' });
    }

    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    invalidateUserAccess(String(Number(id)));
    invalidateUsersCache(); // user vừa xoá không còn nhận thông báo / push
    res.json({ success: true, message: 'Xóa user thành công' });
  } catch (error) {
    console.error('Lỗi xóa user:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

app.use('/api/users', usersRouter);
