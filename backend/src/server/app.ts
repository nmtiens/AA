import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { allowedOrigins } from './config.js';
import { authenticateJWT } from './auth.js';
import { ensureProjectAliases } from './projectAlias.js';
import { ensureWorkshopGroups } from './workshopGroups.js';

// Instance Express dùng chung. Middleware hạ tầng + bắt buộc đăng nhập được gắn
// NGAY khi module này được nạp, tức là TRƯỚC mọi route (các module trong src/routes/
// import `app` từ đây rồi đăng ký route ở cấp module).
export const app = express();

// ============================================================================
// MIDDLEWARE HẠ TẦNG: helmet, CORS whitelist, compression, rate limit chung
// ============================================================================
app.set('trust proxy', 1); // cần thiết khi chạy sau proxy/CDN (Vercel...) để rate-limit theo IP thật hoạt động đúng
// Route phân biệt hoa thường: mặc định Express coi /API/x = /api/x, trong khi middleware
// đăng nhập bên dưới so khớp '/api/' -> /API/... từng lọt qua mà không cần token.
app.set('case sensitive routing', true);
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || (allowedOrigins.length === 0 && process.env.NODE_ENV !== 'production') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // status 403: error handler cuối (api/index.ts) trả 403 thay vì 500 "lỗi hệ thống"
    return callback(Object.assign(new Error('CORS: origin không được phép'), { status: 403 }));
  },
  credentials: true,
}));
app.use(compression()); // Nén gzip response — giảm 70-90% dung lượng JSON
app.use(express.json({ limit: '1mb' }));

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Thử đăng nhập quá nhiều lần, vui lòng thử lại sau ít phút' },
});
export const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Yêu cầu quá nhiều lần, vui lòng thử lại sau' },
});
export const otpVerifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Nhập sai quá nhiều lần, vui lòng yêu cầu mã OTP mới' },
});
export const warmupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
});


// ============================================================================
// BẮT BUỘC ĐĂNG NHẬP CHO MỌI ROUTE /api/*
// Trừ các route đăng nhập / quên mật khẩu, và các route đã có khoá bí mật riêng
// (warmup: x-warmup-key, cron: CRON_SECRET). Phải đăng ký TRƯỚC mọi route bên dưới.
// ============================================================================
export const PUBLIC_API_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/verify-otp',
  '/api/warmup',
]);
export const PUBLIC_API_PREFIXES = ['/api/cron/'];

app.use((req: Request, res: Response, next: NextFunction) => {
  // So khớp không phân biệt hoa thường: /API/..., /Api/... cũng phải qua đăng nhập
  // (router con như express.Router() mặc định vẫn khớp không phân biệt hoa thường).
  const path = req.path.toLowerCase();
  if (req.method === 'OPTIONS' || !path.startsWith('/api/')) return next();
  if (PUBLIC_API_PATHS.has(path) || PUBLIC_API_PREFIXES.some(p => path.startsWith(p))) return next();
  return authenticateJWT(req, res, next);
});

// Lọc theo tên công trình: nạp sẵn bảng "mọi cách viết tên của cùng mã" (làm mới 10 phút/lần).
// Setup gộp xưởng: bảng nhỏ, nạp cho mọi API (làm mới 5 phút/lần, lưu xong nạp lại ngay).
// API gộp tên theo công trình (canonicalProjectName) cần bảng tên kể cả khi KHÔNG lọc công trình —
// trước chỉ nạp khi có congTrinh nên vừa khởi động mà mở trang không lọc thì các cách viết không được gộp.
const NEEDS_PROJECT_ALIASES = /^\/api\/(trend-by-congtrinh|overview\/by-group|khsx-nhapkho\/summary|stock\/(by-project|items))/i;
app.use(async (req: Request, _res: Response, next: NextFunction) => {
  if (req.path.toLowerCase().startsWith('/api/')) {
    try { await ensureWorkshopGroups(); } catch { /* giữ setup cũ */ }
  }
  if (req.query.congTrinh || req.query.ctWhitelist || NEEDS_PROJECT_ALIASES.test(req.path)) {
    try { await ensureProjectAliases(); } catch { /* giữ bảng cũ */ }
  }
  next();
});

