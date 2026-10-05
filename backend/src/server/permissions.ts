import type { Request } from 'express';
import { pool } from '../db.js';

// ============================================================================
// QUYỀN CHI TIẾT (users.permissions) PHÍA SERVER
// Token JWT chỉ mang role; danh sách quyền nằm ở cột users.permissions và admin có
// thể đổi bất cứ lúc nào -> đọc từ DB, cache ngắn theo user để không query mỗi request.
// Quy ước giống frontend (AuthContext.hasPermission): ADMIN có mọi quyền.
// ============================================================================
const PERMISSION_CACHE_TTL_MS = 60_000;
const permissionCache = new Map<string, { perms: Set<string>; at: number }>();

const loadPermissions = async (userId: string | number): Promise<Set<string>> => {
  const key = String(userId);
  const hit = permissionCache.get(key);
  if (hit && Date.now() - hit.at < PERMISSION_CACHE_TTL_MS) return hit.perms;
  const r = await pool.query(
    `SELECT permissions, is_active FROM users WHERE id = $1`,
    [userId]
  );
  const row = r.rows[0];
  const perms = new Set<string>(row && row.is_active && Array.isArray(row.permissions) ? row.permissions : []);
  permissionCache.set(key, { perms, at: Date.now() });
  if (permissionCache.size > 1000) {
    const oldest = permissionCache.keys().next().value;
    if (oldest !== undefined) permissionCache.delete(oldest);
  }
  return perms;
};

/** true nếu user của request có quyền `permission` (ADMIN luôn có). Lỗi DB -> coi như KHÔNG có quyền. */
export const userHasPermission = async (req: Request, permission: string): Promise<boolean> => {
  if (!req.user) return false;
  if (req.user.role === 'ADMIN') return true;
  try {
    return (await loadPermissions(req.user.id)).has(permission);
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
