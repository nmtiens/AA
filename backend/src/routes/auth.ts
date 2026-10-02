import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import { pool } from '../db.js';
import { signAuthToken, authenticateJWT, requireSelfOrRole } from '../server/auth.js';
import { validateBody, loginSchema, forgotPasswordSchema, verifyOtpSchema, changePasswordSchema } from '../server/validation.js';
import { app, loginLimiter, otpRequestLimiter, otpVerifyLimiter } from '../server/app.js';

// ============================================================================
// AUTH API — TRUY XUẤT BẢNG users TRONG POSTGRES
// (Giữ nguyên pool.query — không phải điểm nóng, không cần đo timing)
// ============================================================================

// --- ĐĂNG NHẬP (nay phát hành JWT) ---
app.post('/api/auth/login', loginLimiter, validateBody(loginSchema), async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    const result = await pool.query(
      `SELECT id, username, password_hash, full_name, email, role, permissions, is_active
       FROM users WHERE username = $1`,
      [username]
    );

    const user = result.rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại hoặc đã bị khóa' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Sai tên đăng nhập hoặc mật khẩu' });
    }

    const token = signAuthToken({ id: user.id, username: user.username, role: user.role });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        permissions: user.permissions || [],
      },
    });
  } catch (error) {
    console.error('Lỗi đăng nhập:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// --- QUÊN MẬT KHẨU: GỬI OTP ---
// Trả cùng 1 message dù email tồn tại hay không, tránh lộ danh sách email có tài khoản.
app.post('/api/auth/forgot-password', otpRequestLimiter, validateBody(forgotPasswordSchema), async (req: Request, res: Response) => {
  const genericMessage = 'Nếu email tồn tại trong hệ thống, mã OTP đã được gửi tới email đó';
  try {
    const { email } = req.body;

    const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

   if (user) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await pool.query(
    `UPDATE users SET otp_code = $1, otp_expires_at = $2, updated_at = now() WHERE id = $3`,
    [otp, expiresAt, user.id]
  );

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[DEV] OTP cho ${email}: ${otp}`);
  }
  // TODO: gọi service gửi email thật ở đây khi có (nodemailer/SES/...)
}

    res.json({ success: true, message: genericMessage });
  } catch (error) {
    console.error('Lỗi gửi OTP:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// --- XÁC THỰC OTP + ĐỔI MẬT KHẨU ---
app.post('/api/auth/verify-otp', otpVerifyLimiter, validateBody(verifyOtpSchema), async (req: Request, res: Response) => {
  try {
    const { email, otp, newPassword } = req.body;

    const result = await pool.query(
      `SELECT id, otp_code, otp_expires_at FROM users WHERE email = $1`,
      [email]
    );
    const user = result.rows[0];

    if (!user || user.otp_code !== otp) {
      return res.status(400).json({ success: false, message: 'Mã OTP không đúng' });
    }
    if (!user.otp_expires_at || new Date(user.otp_expires_at) < new Date()) {
      return res.status(400).json({ success: false, message: 'Mã OTP đã hết hạn' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      `UPDATE users SET password_hash = $1, otp_code = NULL, otp_expires_at = NULL, updated_at = now() WHERE id = $2`,
      [newHash, user.id]
    );

    res.json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (error) {
    console.error('Lỗi xác thực OTP:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

// --- ĐỔI MẬT KHẨU (khi đã đăng nhập, biết mật khẩu cũ) ---
// Nay yêu cầu JWT hợp lệ + chỉ được tự đổi mật khẩu của chính mình (hoặc admin).
app.post(
  '/api/auth/change-password',
  authenticateJWT,
  requireSelfOrRole((req) => req.body?.username, 'ADMIN'),
  validateBody(changePasswordSchema),
  async (req: Request, res: Response) => {
    try {
      const { username, oldPassword, newPassword } = req.body;

      const result = await pool.query(
        `SELECT id, password_hash FROM users WHERE username = $1`,
        [username]
      );
      const user = result.rows[0];
      if (!user) {
        return res.status(404).json({ success: false, message: 'Tài khoản không tồn tại' });
      }

      const isMatch = await bcrypt.compare(oldPassword, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Mật khẩu cũ không đúng' });
      }

      const newHash = await bcrypt.hash(newPassword, 12);
      await pool.query(
        `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`,
        [newHash, user.id]
      );

      res.json({ success: true, message: 'Đổi mật khẩu thành công' });
    } catch (error) {
      console.error('Lỗi đổi mật khẩu:', error);
      res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
    }
  }
);

// --- LẤY THÔNG TIN USER HIỆN TẠI TỪ TOKEN (dùng để refresh state, không tin snapshot cũ) ---
// (Giữ nguyên pool.query — nhẹ, chạy trên bảng users nhỏ)
app.get('/api/auth/me', authenticateJWT, async (req: Request, res: Response) => {
  try {
    // req.user chỉ chứa id/username/role từ token — cần query DB để lấy dữ liệu mới nhất
    // (role, permissions, status... có thể đã bị admin đổi sau khi token được phát hành)
    const result = await pool.query(
      `SELECT id, username, full_name, email, role, permissions, is_active
       FROM users WHERE id = $1`,
      [req.user!.id]
    );

    const user = result.rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại hoặc đã bị khóa' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        permissions: user.permissions || [],
      },
    });
  } catch (error) {
    console.error('Lỗi /api/auth/me:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});
