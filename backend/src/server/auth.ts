import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { JWT_SECRET_SAFE } from './config.js';

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
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn' });
  }
};

export const requireRole = (...allowedRoles: string[]) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Chưa xác thực' });
  if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ success: false, message: 'Không có quyền truy cập' });
  next();
};

export const requireSelfOrRole = (usernameParam: (req: Request) => string, ...allowedRoles: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Chưa xác thực' });
    const target = usernameParam(req);
    if (req.user.username === target || allowedRoles.includes(req.user.role)) return next();
    return res.status(403).json({ success: false, message: 'Không có quyền truy cập' });
  };

export const requireWarmupSecret = (req: Request, res: Response, next: NextFunction) => {
  const expected = process.env.WARMUP_SECRET;
  if (!expected) return res.status(503).json({ ok: false, error: 'WARMUP_SECRET chưa được cấu hình' });
  if (req.headers['x-warmup-key'] !== expected) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  next();
};
