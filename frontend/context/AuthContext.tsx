import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { userService } from '../services/userService';
import { useToast } from './ToastContext';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string, rememberMe: boolean) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  hasPermission: (viewId: string) => boolean;
}

const AuthContext = createContext<AuthContextType>(null!);

// --- KEY CHUẨN HOÁ CHO STORAGE (tránh lặp string rải rác) ---
const STORAGE_KEYS = {
  persistUser: 'app_user_persist',
  persistToken: 'app_token', // dùng chung 1 key token, chỉ khác storage (local/session)
  sessionUser: 'app_user_session',
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();

  



  // Check storage khi khởi động app
useEffect(() => {
  const initAuth = async () => {
    const persistedUser = localStorage.getItem(STORAGE_KEYS.persistUser);
    const sessionUser = sessionStorage.getItem(STORAGE_KEYS.sessionUser);
    const storedUser = persistedUser || sessionUser;

    const storedToken =
      localStorage.getItem(STORAGE_KEYS.persistToken) ||
      sessionStorage.getItem(STORAGE_KEYS.persistToken);

    if (!storedUser || !storedToken) {
      clearAllStorage();
      setIsLoading(false);
      return;
    }

    // Hiển thị tạm dữ liệu cũ trong lúc chờ xác thực, tránh giật UI
    try {
      const parsedUser = JSON.parse(storedUser);
      if (parsedUser && typeof parsedUser === 'object' && parsedUser.username) {
        setUser(parsedUser);
      }
    } catch (e) {
      console.error('Failed to parse stored user', e);
      clearAllStorage();
      setIsLoading(false);
      return;
    }

    // Xác thực + đồng bộ lại dữ liệu mới nhất từ DB (role, permissions, status...)
    try {
      const result = await userService.getMe();
      if (result.success && result.user) {
        setUser(result.user);
        // Ghi đè lại storage với dữ liệu mới, giữ nguyên loại storage đang dùng (local/session)
        const userStr = JSON.stringify(result.user);
        if (persistedUser) {
          localStorage.setItem(STORAGE_KEYS.persistUser, userStr);
        } else {
          sessionStorage.setItem(STORAGE_KEYS.sessionUser, userStr);
        }
      } else {
        // Token hết hạn / tài khoản bị khoá / không hợp lệ -> đăng xuất
        setUser(null);
        clearAllStorage();
      }
    } catch (e) {
      console.error('Lỗi xác thực phiên đăng nhập', e);
      // Lỗi mạng: không đăng xuất, giữ tạm dữ liệu cũ để không làm gián đoạn người dùng offline
    }

    setIsLoading(false);
  };

  initAuth();
}, []);

  const clearAllStorage = () => {
    localStorage.removeItem(STORAGE_KEYS.persistUser);
    localStorage.removeItem(STORAGE_KEYS.persistToken);
    sessionStorage.removeItem(STORAGE_KEYS.sessionUser);
    sessionStorage.removeItem(STORAGE_KEYS.persistToken);
  };

  const login = async (username: string, password: string, rememberMe: boolean) => {
    setIsLoading(true);
    try {
      const result = await userService.login(username, password);

      if (result.success && result.user && result.token) {
        setUser(result.user);

        try {
          const userStr = JSON.stringify(result.user);
          if (rememberMe) {
            localStorage.setItem(STORAGE_KEYS.persistUser, userStr);
            localStorage.setItem(STORAGE_KEYS.persistToken, result.token);
          } else {
            sessionStorage.setItem(STORAGE_KEYS.sessionUser, userStr);
            sessionStorage.setItem(STORAGE_KEYS.persistToken, result.token);
          }
        } catch (storageErr) {
          console.error('Storage quota exceeded or error', storageErr);
          showToast('Không thể lưu phiên đăng nhập (Bộ nhớ đầy)', 'info');
        }

        showToast(`Xin chào, ${result.user.fullName}!`, 'success');
        return { success: true };
      }

      showToast(result.message || 'Đăng nhập thất bại', 'error');
      return { success: false, message: result.message || 'Đăng nhập thất bại' };
    } catch (error) {
      showToast('Lỗi hệ thống', 'error');
      return { success: false, message: 'Lỗi hệ thống' };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    clearAllStorage();
    showToast('Đã đăng xuất', 'info');
  };

  const hasPermission = (viewId: string) => {
    if (!user) return false;
    if (user.role === 'ADMIN') return true;
    return Array.isArray(user.permissions) && user.permissions.includes(viewId);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);