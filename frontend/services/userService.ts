import { User, ApiResponse } from '../types';

const API_BASE = 'http://localhost:5000/api';

export const userService = {
  login: async (username: string, password: string): Promise<ApiResponse<User>> => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      return await res.json();
    } catch (error) {
      console.error('Lỗi đăng nhập:', error);
      return { success: false, message: 'Lỗi kết nối server' };
    }
  },

  forgotPassword: async (email: string): Promise<ApiResponse> => {
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      return await res.json();
    } catch (error) {
      console.error('Lỗi gửi OTP:', error);
      return { success: false, message: 'Lỗi kết nối server' };
    }
  },

  verifyOtpAndReset: async (email: string, otp: string, newPassword: string): Promise<ApiResponse> => {
    try {
      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, newPassword }),
      });
      return await res.json();
    } catch (error) {
      console.error('Lỗi xác thực OTP:', error);
      return { success: false, message: 'Lỗi kết nối server' };
    }
  },

  changePassword: async (username: string, oldPassword: string, newPassword: string): Promise<ApiResponse> => {
    try {
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, oldPassword, newPassword }),
      });
      return await res.json();
    } catch (error) {
      console.error('Lỗi đổi mật khẩu:', error);
      return { success: false, message: 'Lỗi kết nối server' };
    }
  },
};