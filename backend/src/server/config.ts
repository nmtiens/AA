
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// CẤU HÌNH BẮT BUỘC QUA ENV (xem .env.example cuối file / README đã gửi trước)
// ============================================================================
export const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET chưa được cấu hình trong biến môi trường.');
}
export const JWT_SECRET_SAFE = JWT_SECRET || 'dev-only-insecure-secret';

export const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  throw new Error('ALLOWED_ORIGINS chưa được cấu hình trong biến môi trường (bắt buộc ở production).');
}
