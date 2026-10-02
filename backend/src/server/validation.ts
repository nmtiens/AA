import type { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

// ============================================================================
// VALIDATE INPUT (zod)
// ============================================================================
export const validateBody = (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ', errors: result.error.flatten().fieldErrors });
  }
  req.body = result.data;
  next();
};

export const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });
export const forgotPasswordSchema = z.object({ email: z.string().email() });
export const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  newPassword: z.string().min(8, 'Mật khẩu mới phải có ít nhất 8 ký tự'),
});
export const changePasswordSchema = z.object({
  username: z.string().min(1),
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Mật khẩu mới phải có ít nhất 8 ký tự'),
});
export const createUserSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8, 'Mật khẩu phải có ít nhất 8 ký tự'),
  fullName: z.string().min(1),
  email: z.string().email().optional().nullable(),
  role: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  msnv: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export const updateUserSchema = z.object({
  password: z.string().min(8).optional(),
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
  role: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  msnv: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

