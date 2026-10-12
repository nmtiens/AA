import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { JWT_SECRET_SAFE } from '../config.js';
import { pool } from '../../db.js';
import { invalidateUserAccess } from '../permissions.js';

// ============================================================================
// ĐĂNG NHẬP MỤC XƯỞNG (docs/designs/xuong-checkin.md — R1, R4, R5)
// - Mã thiết bị do server cấp, ký HMAC: máy không tự đặt / giả mã máy của người khác được (R4).
// - Token Xưởng: sống 30 ngày, CHỈ hợp lệ cho /api/xuong/*, gắn mã thiết bị và token_version của người dùng.
//   Admin thu hồi / đổi mật khẩu / khoá tài khoản => token_version tăng => token Xưởng cũ hết hiệu lực (R5).
//   Các mục khác của app vẫn dùng JWT 8 giờ như cũ.
// - Giới hạn request riêng cho /api/xuong/*: 120 / phút theo người (điện thoại ở xưởng dùng chung IP nhà máy),
//   /api/xuong/* không tính vào giới hạn chung 300 / phút / IP (R1).
// ============================================================================

export const XUONG_PREFIX = '/api/xuong/';
export const XUONG_TOKEN_TTL = '30d';
export const XUONG_RATE_PER_MIN = 120;

/** Đường dẫn thuộc mục Xưởng (so không phân biệt hoa thường, giống middleware đăng nhập chung) */
export const isXuongPath = (path: string): boolean => {
  const p = path.toLowerCase();
  return p.startsWith(XUONG_PREFIX) || p === '/api/xuong';
};

// ---------------- Mã thiết bị ----------------
const hmac = (data: string) =>
  crypto.createHmac('sha256', JWT_SECRET_SAFE).update(`xuong-device:${data}`).digest('base64url');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "<uuid>.<chữ ký>" */
export const signDeviceToken = (deviceId: string): string => `${deviceId}.${hmac(deviceId)}`;

/** Trả device_id nếu chữ ký đúng, ngược lại null */
export const verifyDeviceToken = (token: unknown): string | null => {
  if (typeof token !== 'string') return null;
  const i = token.lastIndexOf('.');
  if (i <= 0) return null;
  const id = token.slice(0, i);
  const sig = token.slice(i + 1);
  if (!UUID_RE.test(id)) return null;
  const expected = hmac(id);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return id.toLowerCase();
};

export const newDeviceId = (): string => crypto.randomUUID();

// ---------------- Token Xưởng ----------------
export interface XuongTokenClaims {
  id: string | number;
  username: string;
  role: string;
  scope: 'xuong';
  /** device_id đã ký */
  did: string;
  /** token_version lúc cấp */
  tv: number;
}

export const signXuongToken = (u: { id: string | number; username: string; role: string }, deviceId: string, tokenVersion: number): string =>
  jwt.sign({ id: u.id, username: u.username, role: u.role, scope: 'xuong', did: deviceId, tv: tokenVersion } satisfies XuongTokenClaims,
    JWT_SECRET_SAFE, { expiresIn: XUONG_TOKEN_TTL });

/**
 * Token Xưởng chỉ dùng được ở /api/xuong/*. Token thường (không có scope) dùng được mọi nơi, kể cả /api/xuong/*
 * (quản lý xem trên máy tính). Trả thông báo lỗi nếu không hợp lệ, null nếu được đi tiếp.
 */
export const xuongScopeError = (claims: { scope?: unknown } | undefined, path: string): string | null => {
  if (claims?.scope === undefined) return null;
  if (claims.scope !== 'xuong') return 'Token không hợp lệ';
  return isXuongPath(path) ? null : 'Token mục Xưởng chỉ dùng được trong mục Xưởng';
};

/** Token Xưởng còn hiệu lực theo token_version hiện tại trong DB (null = DB chưa có cột → bỏ qua) */
export const xuongTokenVersionOk = (claims: { scope?: unknown; tv?: unknown } | undefined, currentVersion: number | null): boolean => {
  if (claims?.scope !== 'xuong' || currentVersion === null) return true;
  return Number(claims.tv ?? -1) === currentVersion;
};

/** Tăng token_version (thu hồi mọi token Xưởng của người đó). Chưa chạy SQL thì bỏ qua. */
export async function bumpTokenVersion(userId: string | number): Promise<void> {
  try {
    await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [Number(userId)]);
  } catch (e) {
    if ((e as { code?: string })?.code !== '42703') throw e;
  } finally {
    invalidateUserAccess(userId);
  }
}

// ---------------- Giới hạn request theo người ----------------
/** Khoá giới hạn: theo user id đã xác thực (middleware đăng nhập chạy trước) */
export const xuongRateKey = (req: Request): string => `xuong-user:${req.user?.id ?? 'anon'}`;

export const xuongLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: XUONG_RATE_PER_MIN,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: xuongRateKey,
  message: { success: false, message: 'Gửi quá nhiều yêu cầu, máy sẽ tự gửi lại sau ít giây' },
});
