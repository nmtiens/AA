// ============================================================================
// ĐIỂM VÀO BACKEND (Express) — chỉ ghép các phần lại với nhau.
//
//   src/server/  : phần dùng chung
//     config.ts      biến môi trường bắt buộc (JWT_SECRET, ALLOWED_ORIGINS)
//     app.ts         instance Express + middleware hạ tầng + bắt buộc đăng nhập /api/*
//     auth.ts        JWT, phân quyền role, khoá warmup
//     validation.ts  validate body (zod) + schema đăng nhập / user
//     data.ts        whitelist cột, đọc bảng, phiên bản bảng, cache all-data, SQL helpers
//     common.ts      giới hạn song song, hằng số tiền, ngày giờ VN
//   src/routes/  : mỗi file một nhóm API, tự đăng ký route lên `app` khi được import
//   src/vuongMacPush.ts : Web Push + cron nhắc hạn BOT
//
// Thứ tự import các file route bên dưới = thứ tự đăng ký route (giữ như file cũ).
// ============================================================================
import type { Request, Response, NextFunction } from 'express';
import { app } from '../src/server/app.js';
import { authenticateJWT } from '../src/server/auth.js';
import { registerVuongMacPush } from '../src/vuongMacPush.js';

import '../src/routes/data.js';       // /api/all-data, 12 bảng, production/*, check-versions, data-update-log
import '../src/routes/overview.js';   // /api/overview/*
import '../src/routes/stock.js';      // /api/stock/*, /api/warmup
import '../src/routes/revenue.js';    // /api/revenue
import '../src/routes/settings.js';   // /api/view-project-mapping, /api/table-column-config
import '../src/routes/auth.js';       // /api/auth/*
import '../src/routes/users.js';      // /api/users/*
import '../src/routes/khsx.js';       // /api/khsx-nhapkho/summary
import '../src/routes/trend.js';      // /api/trend*, /api/filters/*, /api/detail
import '../src/routes/vuongMac.js';   // /api/vuong-mac/*

const PORT = process.env.PORT || 5000;

app.get('/', (_req: Request, res: Response) => {
  res.send('Server Backend PostgreSQL đang hoạt động bình thường!');
});

// Push: /api/push/subscribe, /api/push/unsubscribe, /api/cron/vuong-mac-bot
registerVuongMacPush(app, { authenticateJWT });

// --- 404 cho các route không khớp ---
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Không tìm thấy endpoint' });
});

// --- ERROR HANDLER TẬP TRUNG (bắt cả lỗi từ CORS callback) ---
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  // Lỗi có chủ đích kèm status 4xx (vd. CORS từ chối origin -> 403): trả đúng mã, không log như lỗi hệ thống
  if (err.status && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  console.error('Lỗi không được xử lý:', err);
  res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
