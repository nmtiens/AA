import type { Request } from 'express';
import { pool } from '../db.js';

// ============================================================================
// QUYỀN CHI TIẾT (users.permissions) + ROLE / TRẠNG THÁI TÀI KHOẢN PHÍA SERVER
// Token JWT sống 8 giờ nên KHÔNG tin role trong token: role, is_active và danh sách quyền đọc từ DB
// (admin có thể khoá / hạ quyền bất cứ lúc nào), cache ngắn theo user để không query mỗi request.
// Admin sửa / xoá user => gọi invalidateUserAccess(id) để có hiệu lực ngay.
// Quy ước giống frontend (AuthContext.hasPermission): ADMIN có mọi quyền.
// ============================================================================
const ACCESS_CACHE_TTL_MS = 60_000;

export interface UserAccess {
  /** Còn tồn tại và đang hoạt động */
  active: boolean;
  /** Role hiện tại trong DB ('' nếu không còn) */
  role: string;
  perms: Set<string>;
}

const accessCache = new Map<string, { access: UserAccess; at: number }>();

export const loadUserAccess = async (userId: string | number): Promise<UserAccess> => {
  const key = String(userId);
  const hit = accessCache.get(key);
  if (hit && Date.now() - hit.at < ACCESS_CACHE_TTL_MS) return hit.access;
  const r = await pool.query(
    `SELECT role, permissions, is_active FROM users WHERE id = $1`,
    [userId]
  );
  const row = r.rows[0];
  const active = !!row && row.is_active === true;
  const access: UserAccess = {
    active,
    role: active ? String(row.role ?? '') : '',
    perms: new Set<string>(active && Array.isArray(row.permissions) ? row.permissions : []),
  };
  accessCache.set(key, { access, at: Date.now() });
  if (accessCache.size > 1000) {
    const oldest = accessCache.keys().next().value;
    if (oldest !== undefined) accessCache.delete(oldest);
  }
  return access;
};

/** Xoá cache quyền của 1 user (sau khi admin đổi role / quyền / trạng thái / xoá) */
export const invalidateUserAccess = (userId: string | number) => { accessCache.delete(String(userId)); };

/** true nếu user của request có quyền `permission` (ADMIN luôn có). Tài khoản bị khoá / lỗi DB -> KHÔNG có quyền. */
export const userHasPermission = async (req: Request, permission: string): Promise<boolean> => {
  if (!req.user) return false;
  try {
    const access = await loadUserAccess(req.user.id);
    if (!access.active) return false;
    return access.role === 'ADMIN' || access.perms.has(permission);
  } catch (error) {
    console.error('Lỗi đọc quyền người dùng:', error);
    return false;
  }
};

// ---------------------------------------------------------------------------
// Vật tư: giá / nhà cung cấp chỉ trả cho người có quyền "Xem Giá/NCC"
// ---------------------------------------------------------------------------
export const MATERIAL_PRICE_PERMISSION = 'materials_view_price';
export const MATERIAL_PRICE_COLUMNS = ['thanh_tien', 'don_gia', 'nha_cung_cap'];

// Bản đã bỏ cột giá được nhớ theo mảng gốc: /api/all-data trả cùng 1 mảng cache cho
// mọi người, nên chỉ cần cắt 1 lần cho tới khi cache dữ liệu đổi.
const strippedCache = new WeakMap<object, Record<string, unknown>[]>();

export const stripMaterialPriceColumns = (rows: unknown): unknown => {
  if (!Array.isArray(rows)) return rows;
  const cached = strippedCache.get(rows);
  if (cached) return cached;
  const out = rows.map((row: Record<string, unknown>) => {
    const copy = { ...row };
    MATERIAL_PRICE_COLUMNS.forEach(c => { delete copy[c]; });
    return copy;
  });
  strippedCache.set(rows, out);
  return out;
};
