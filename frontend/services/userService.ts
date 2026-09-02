import { User, ApiResponse } from '../types';

const API_BASE = '/api';

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

  // --- QUẢN TRỊ USER ---

  getUsers: async (): Promise<ApiResponse<User[]>> => {
    try {
      const res = await fetch(`${API_BASE}/users`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      return await res.json();
    } catch (error) {
      console.error('Lỗi lấy danh sách user:', error);
      return { success: false, message: 'Lỗi kết nối server' };
    }
  },

  addUser: async (userData: Partial<User> & { password: string }): Promise<ApiResponse<User>> => {
    try {
      const res = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });
      return await res.json();
    } catch (error) {
      console.error('Lỗi tạo user:', error);
      return { success: false, message: 'Lỗi kết nối server' };
    }
  },

  updateUser: async (userData: Partial<User> & { id: string }): Promise<ApiResponse<User>> => {
    try {
      const { id, ...payload } = userData;
      const res = await fetch(`${API_BASE}/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return await res.json();
    } catch (error) {
      console.error('Lỗi cập nhật user:', error);
      return { success: false, message: 'Lỗi kết nối server' };
    }
  },

  deleteUser: async (id: string): Promise<ApiResponse> => {
    try {
      const res = await fetch(`${API_BASE}/users/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      return await res.json();
    } catch (error) {
      console.error('Lỗi xóa user:', error);
      return { success: false, message: 'Lỗi kết nối server' };
    }
  },
};