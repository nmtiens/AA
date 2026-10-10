import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { allowedOrigins } from './config.js';
import { authenticateActiveUser } from './auth.js';
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
// Không tính ETag: Express băm (md5) toàn bộ body mỗi response để sinh ETag — với /api/all-data (hàng trăm
// MB JSON) tốn hàng trăm ms CPU mà giao diện gọi với cache: 'no-store' nên không bao giờ dùng 304.
app.set('etag', false);
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
// 2mb: /api/material/by-hex có thể gửi toàn bộ ~52k mã HEX
app.use(express.json({ limit: '2mb' }));

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
// Token hợp lệ VÀ tài khoản còn tồn tại, đang hoạt động (theo DB, cache 60 giây) — khoá / xoá user
// có hiệu lực với mọi API, không chỉ các route có requireRole. Trừ các route đăng nhập / quên mật khẩu, và các route đã có khoá bí mật riêng
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
  // Bỏ '/' cuối khi so danh sách công khai ('/api/warmup/' = '/api/warmup', Express cũng khớp như vậy) —
  // trước so khớp chính xác nên có '/' cuối bị đòi JWT
  if (PUBLIC_API_PATHS.has(path.replace(/\/+$/, '')) || PUBLIC_API_PREFIXES.some(p => path.startsWith(p))) return next();
  return authenticateActiveUser(req, res, next);
});

// Lọc theo tên công trình: nạp sẵn bảng "mọi cách viết tên của cùng mã" (làm mới 10 phút/lần, chạy nền).
// Setup gộp xưởng: bảng nhỏ, nạp cho mọi API (làm mới 5 phút/lần, lưu xong nạp lại ngay).
// Bảng tên mặc định CHỜ nạp cho mọi API (route mới / bị quên vẫn gộp đúng các cách viết ngay khi vừa khởi động).
// Riêng các route chắc chắn không dùng tên công trình (danh sách bỏ qua bên dưới) chỉ kích nạp nền, không chờ
// — lần nạp đầu ~2-3 giây, không để đăng nhập / thông báo / người dùng... chờ theo.
// cron (quét hạn BOT) và warmup (cache all-data + stock/dates không lọc) không dùng tên công trình.
// Sau lần nạp đầu, ensureProjectAliases chỉ so mốc thời gian (làm mới nền) => không tốn thêm thời gian.
const NO_WAIT_PROJECT_ALIASES = /^\/api\/(auth|users|notifications|push|check-versions|table-column-config|view-project-mapping|workshop-groups|data-update-log|cron|warmup)(\/|$)/i;
app.use(async (req: Request, _res: Response, next: NextFunction) => {
  const path = req.path.toLowerCase();
  if (path.startsWith('/api/')) {
    try { await ensureWorkshopGroups(); } catch { /* giữ setup cũ */ }
    if (NO_WAIT_PROJECT_ALIASES.test(path)) {
      ensureProjectAliases().catch(() => { /* giữ bảng cũ */ });
    } else {
      try { await ensureProjectAliases(); } catch { /* giữ bảng cũ */ }
    }
  }
  next();
});

