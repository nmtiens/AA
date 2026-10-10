import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { JWT_SECRET_SAFE } from './config.js';
import { loadUserAccess } from './permissions.js';

// ============================================================================
// AUTH MIDDLEWARE: JWT + phân quyền role
// ============================================================================
export interface AuthTokenPayload {
  id: string | number;
  username: string;
  role: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export const signAuthToken = (payload: AuthTokenPayload): string =>
  jwt.sign(payload, JWT_SECRET_SAFE, { expiresIn: '8h' });

export const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'Thiếu token xác thực' });
  try {
    req.user = jwt.verify(token, JWT_SECRET_SAFE) as AuthTokenPayload;
  } catch {
    return res.status(401).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn' });
  }
  // id phải là số nguyên dương (users.id integer) — id lạ làm query ép kiểu lỗi 500
  if (!isValidUserId(req.user?.id)) return res.status(401).json({ success: false, message: 'Token không hợp lệ' });
  next();
};

/** true nếu v là id user hợp lệ: số nguyên dương trong phạm vi integer Postgres (số hoặc chuỗi chữ số) */
export const isValidUserId = (v: unknown): boolean => {
  if (typeof v !== 'number' && typeof v !== 'string') return false;
  const s = String(v);
  return /^\d+$/.test(s) && Number(s) > 0 && Number(s) <= 2147483647;
};

// Kiểm token + tài khoản còn tồn tại và đang hoạt động (theo DB, cache 60 giây).
// Dùng cho middleware chung /api/*: tài khoản bị khoá / đã xoá -> 401 dù token còn hạn.
export const authenticateActiveUser = (req: Request, res: Response, next: NextFunction) =>
  authenticateJWT(req, res, () => {
    loadUserAccess(req.user!.id).then(access => {
      if (!access.active) return res.status(401).json({ success: false, message: 'Tài khoản đã bị khoá hoặc không còn tồn tại' });
      next();
    }).catch(error => {
      console.error('Lỗi kiểm tra tài khoản:', error);
      res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
    });
  });

// Role / trạng thái lấy theo DB (cache 60 giây, xem permissions.loadUserAccess) — token còn hạn tới 8 giờ
// sau khi tài khoản bị khoá / hạ quyền. Cập nhật req.user.role theo DB cho các bước sau.
const withCurrentAccess = (
  req: Request, res: Response,
  allowed: (req: Request) => boolean,
  next: NextFunction
) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Chưa xác thực' });
  loadUserAccess(req.user.id).then(access => {
    if (!access.active) return res.status(401).json({ success: false, message: 'Tài khoản đã bị khoá hoặc không còn tồn tại' });
    req.user!.role = access.role;
    if (!allowed(req)) return res.status(403).json({ success: false, message: 'Không có quyền truy cập' });
    next();
  }).catch(error => {
    console.error('Lỗi kiểm tra tài khoản:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  });
};

export const requireRole = (...allowedRoles: string[]) => (req: Request, res: Response, next: NextFunction) =>
  withCurrentAccess(req, res, r => allowedRoles.includes(r.user!.role), next);

export const requireSelfOrRole = (usernameParam: (req: Request) => string, ...allowedRoles: string[]) =>
  (req: Request, res: Response, next: NextFunction) =>
    withCurrentAccess(req, res, r => r.user!.username === usernameParam(r) || allowedRoles.includes(r.user!.role), next);

export const requireWarmupSecret = (req: Request, res: Response, next: NextFunction) => {
  const expected = process.env.WARMUP_SECRET;
  if (!expected) return res.status(503).json({ ok: false, error: 'WARMUP_SECRET chưa được cấu hình' });
  if (req.headers['x-warmup-key'] !== expected) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  next();
};
