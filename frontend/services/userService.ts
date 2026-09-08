import { User, ApiResponse } from '../types';

const API_BASE = '/api';

// --- HELPER: Lấy token đã lưu (ưu tiên localStorage "remember me", fallback sessionStorage) ---
const getToken = (): string | null => {
  return localStorage.getItem('app_token') || sessionStorage.getItem('app_token');
};

// --- HELPER: Header chuẩn có kèm Authorization nếu có token ---
const authHeaders = (): HeadersInit => {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

// --- HELPER: Wrap fetch, tự parse JSON và bắt lỗi mạng ---
const request = async <T,>(url: string, options: RequestInit): Promise<ApiResponse<T>> => {
  try {
    const res = await fetch(url, options);
    const data = await res.json();
    return data;
  } catch (error) {
    console.error(`Lỗi gọi API ${url}:`, error);
    return { success: false, message: 'Lỗi kết nối server' } as ApiResponse<T>;
  }
};

export const userService = {
  login: async (username: string, password: string): Promise<ApiResponse<User>> => {
    return request<User>(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  },

  getMe: async (): Promise<ApiResponse<User>> => {
  return request<User>(`${API_BASE}/auth/me`, {
    method: 'GET',
    headers: authHeaders(),
  });
},

  forgotPassword: async (email: string): Promise<ApiResponse> => {
    return request(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  },

  verifyOtpAndReset: async (email: string, otp: string, newPassword: string): Promise<ApiResponse> => {
    return request(`${API_BASE}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp, newPassword }),
    });
  },

  // Cần token vì backend yêu cầu authenticateJWT + requireSelfOrRole
  changePassword: async (username: string, oldPassword: string, newPassword: string): Promise<ApiResponse> => {
    return request(`${API_BASE}/auth/change-password`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ username, oldPassword, newPassword }),
    });
  },

  // --- QUẢN TRỊ USER (toàn bộ yêu cầu JWT + role ADMIN) ---

  getUsers: async (): Promise<ApiResponse<User[]>> => {
    return request<User[]>(`${API_BASE}/users`, {
      method: 'GET',
      headers: authHeaders(),
    });
  },

  addUser: async (userData: Partial<User> & { password: string }): Promise<ApiResponse<User>> => {
    return request<User>(`${API_BASE}/users`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(userData),
    });
  },

  updateUser: async (userData: Partial<User> & { id: string }): Promise<ApiResponse<User>> => {
    const { id, ...payload } = userData;
    return request<User>(`${API_BASE}/users/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
  },

  deleteUser: async (id: string): Promise<ApiResponse> => {
    return request(`${API_BASE}/users/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
  },
};
