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
  /** users.token_version (thu hồi token mục Xưởng); null khi DB chưa chạy SQL 2026-10-12_xuong.sql */
  tokenVersion: number | null;
  /** users.department đúng như trong DB (null nếu trống / không còn tài khoản) — vướng mắc, BOT công đoạn tính quyền */
  department: string | null;
  /** users.full_name đúng như trong DB (null nếu trống / không còn tài khoản) */
  fullName: string | null;
}

/** Dòng users đọc kèm quyền (GET /api/auth/me dùng lại, khỏi đọc bảng users 2 lần) */
export interface UserRowDayDu {
  id: number; username: string; full_name: string | null; email: string | null;
  role: string; permissions: unknown; is_active: boolean; token_version?: number | null; department: string | null;
}

const accessCache = new Map<string, { access: UserAccess; at: number }>();
// Các lần gọi đồng thời của cùng 1 user (mở 1 trang bắn ~15 request) dùng chung 1 câu SELECT users.
// Không đổi kết quả: ai cũng nhận đúng dòng vừa đọc; promise lỗi bị gỡ ngay (finally) nên lần sau đọc lại.
const accessInflight = new Map<string, Promise<UserAccess>>();
// Tăng mỗi lần invalidateUserAccess: lượt đọc thẳng (docUserDayDu) bắt đầu trước đó không được ghi cache
let luotHuy = 0;

const NO_ACCESS: UserAccess = { active: false, role: '', perms: new Set<string>(), tokenVersion: null, department: null, fullName: null };

const COT_QUYEN = 'role, permissions, is_active, department, full_name';
const COT_DAY_DU = `id, username, email, ${COT_QUYEN}`;
// Cột token_version chỉ có sau khi chạy backend/sql/2026-10-12_xuong.sql: thiếu cột thì đọc như cũ
let hasTokenVersion: boolean | null = null;
const queryUserRow = async (id: number, cot: string) => {
  if (hasTokenVersion !== false) {
    try {
      const r = await pool.query(`SELECT ${cot}, token_version FROM users WHERE id = $1`, [id]);
      hasTokenVersion = true;
      return r.rows[0];
    } catch (e) {
      if ((e as { code?: string })?.code !== '42703') throw e;
      hasTokenVersion = false;
    }
  }
  const r = await pool.query(`SELECT ${cot} FROM users WHERE id = $1`, [id]);
  return r.rows[0];
};
// Khoá cache chuẩn hoá: '01' và 1 là cùng user
const accessKey = (userId: string | number): string => String(Number(userId));
const idHopLe = (userId: string | number): boolean =>
  /^\d+$/.test(String(userId)) && Number(userId) > 0 && Number(userId) <= 2147483647;

/** Dòng users (hoặc undefined) -> quyền. Hàm thuần. */
export const accessTuDong = (row: Record<string, any> | undefined): UserAccess => {
  const active = !!row && row.is_active === true;
  return {
    active,
    role: active ? String(row!.role ?? '') : '',
    perms: new Set<string>(active && Array.isArray(row!.permissions) ? row!.permissions : []),
    tokenVersion: row && row.token_version !== undefined && row.token_version !== null ? Number(row.token_version) : null,
    department: row?.department ?? null,
    fullName: row?.full_name ?? null,
  };
};

const ghiCache = (key: string, access: UserAccess) => {
  accessCache.delete(key); // chèn lại cuối Map: bản vừa đọc không bị coi là cũ nhất
  accessCache.set(key, { access, at: Date.now() });
  if (accessCache.size > 1000) {
    const oldest = accessCache.keys().next().value;
    if (oldest !== undefined) accessCache.delete(oldest);
  }
};

export const loadUserAccess = async (userId: string | number, ttlMs = ACCESS_CACHE_TTL_MS): Promise<UserAccess> => {
  // id không phải số nguyên dương -> coi như không tồn tại (tránh query ép kiểu integer lỗi 500)
  if (!idHopLe(userId)) return NO_ACCESS;
  const key = accessKey(userId);
  const hit = accessCache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.access;
  const dangDoc = accessInflight.get(key);
  if (dangDoc) return dangDoc;
  const p: Promise<UserAccess> = queryUserRow(Number(userId), COT_QUYEN)
    .then(row => {
      const access = accessTuDong(row);
      // Chỉ ghi cache khi lượt đọc này còn là lượt hiện hành: admin vừa sửa user (invalidateUserAccess) hoặc
      // /api/auth/me vừa đọc bản mới hơn thì KHÔNG để dòng đọc trước đó đè lên
      if (accessInflight.get(key) === p) ghiCache(key, access);
      return access;
    })
    .finally(() => { if (accessInflight.get(key) === p) accessInflight.delete(key); });
  accessInflight.set(key, p);
  return p;
};

/**
 * Đọc THẲNG DB cả dòng users (không dùng cache) rồi ghi luôn vào cache quyền — cho GET /api/auth/me: 1 câu thay
 * cho 2 (middleware + route), dữ liệu luôn mới, các request ngay sau đó có sẵn quyền. Lỗi DB thì ném ra.
 */
export const docUserDayDu = async (userId: string | number): Promise<{ row: UserRowDayDu | undefined; access: UserAccess }> => {
  if (!idHopLe(userId)) return { row: undefined, access: NO_ACCESS };
  const key = accessKey(userId);
  const truocKhiDoc = luotHuy;
  const row = await queryUserRow(Number(userId), COT_DAY_DU) as UserRowDayDu | undefined;
  const access = accessTuDong(row);
  // Admin vừa sửa / khoá user nào đó trong lúc đang đọc: dòng này có thể là bản TRƯỚC khi sửa => không ghi cache
  // (lần sau đọc lại DB). Route vẫn trả theo dòng vừa đọc như trước đây.
  if (luotHuy === truocKhiDoc) {
    accessInflight.delete(key); // lượt đọc bắt đầu trước đó (cũ hơn) không được đè bản này
    ghiCache(key, access);
  }
  return { row, access };
};

/** Xoá cache quyền của 1 user (sau khi admin đổi role / quyền / trạng thái / xoá) */
export const invalidateUserAccess = (userId: string | number) => {
  const key = accessKey(userId);
  luotHuy++;
  accessCache.delete(key);
  accessInflight.delete(key); // lượt đang đọc dở có thể mang dữ liệu trước khi sửa: không cho ghi cache, lần sau đọc lại
};

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
