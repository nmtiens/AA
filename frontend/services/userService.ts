import { User, ApiResponse } from '../types';

const API_BASE = '/api';

// --- HELPER: Lấy token đã lưu (ưu tiên localStorage "remember me", fallback sessionStorage) ---
// ĐÃ EXPORT: dataService.ts (saveViewProjectMapping) dùng chung hàm này thay vì
// tự đọc localStorage.getItem('token') sai key như trước.
export const getToken = (): string | null => {
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

  // API phân trang (tối đa 100 / trang) — lấy ĐỦ mọi trang (trước chỉ gọi trang 1 nên chỉ hiện 50 user)
  getUsers: async (): Promise<ApiResponse<User[]>> => {
    const PAGE_SIZE = 100;
    const all: User[] = [];
    const seen = new Set<string>();
    for (let page = 1; page <= 100; page++) {
      const res = await request<User[]>(`${API_BASE}/users?page=${page}&pageSize=${PAGE_SIZE}`, {
        method: 'GET',
        headers: authHeaders(),
      });
      if (!res.success || !Array.isArray(res.data)) return page === 1 ? res : { ...res, data: all };
      // Gộp theo id (phòng trùng dòng giữa 2 trang khi có người dùng mới được thêm lúc đang tải).
      // Chỉ dừng khi trang rỗng hoặc đã đủ tổng số — KHÔNG dựa vào "trang ít hơn PAGE_SIZE" vì server
      // có thể giới hạn pageSize nhỏ hơn số xin (trước đây chỉ lấy được 50 người).
      for (const u of res.data) if (!seen.has(String(u.id))) { seen.add(String(u.id)); all.push(u); }
      const total = res.pagination?.total;
      if (res.data.length === 0 || total === undefined || all.length >= total) {
        return { ...res, data: all, pagination: { page: 1, pageSize: all.length, total: total ?? all.length } };
      }
    }
    return { success: true, data: all };
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