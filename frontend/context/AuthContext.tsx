import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, APP_VIEWS } from '../types';
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();

  // Check LocalStorage on init
  useEffect(() => {
    // Check persist storage first (Remember Me)
    const persistedUser = localStorage.getItem('app_user_persist');
    const sessionUser = sessionStorage.getItem('app_user_session');
    
    const storedUser = persistedUser || sessionUser;

    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        // Basic validation to ensure it looks like a user object
        if (parsedUser && typeof parsedUser === 'object' && parsedUser.username) {
            setUser(parsedUser);
        }
      } catch (e) {
        console.error("Failed to parse stored user", e);
        // Clear corrupted data
        localStorage.removeItem('app_user_persist');
        sessionStorage.removeItem('app_user_session');
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string, rememberMe: boolean) => {
    setIsLoading(true);
    try {
      const result = await userService.login(username, password);
      if (result.success && result.user) {
        setUser(result.user);
        
        // Save to appropriate storage with safety check
        try {
            const userStr = JSON.stringify(result.user);
            if (rememberMe) {
                localStorage.setItem('app_user_persist', userStr);
            } else {
                sessionStorage.setItem('app_user_session', userStr);
            }
        } catch (storageErr) {
            console.error("Storage quota exceeded or error", storageErr);
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
    localStorage.removeItem('app_user_persist');
    sessionStorage.removeItem('app_user_session');
    showToast('Đã đăng xuất', 'info');
  };

  const hasPermission = (viewId: string) => {
    if (!user) return false;
    
    // ADMIN role has full access
    if (user.role === 'ADMIN') return true;
    
    // USER role checks permission list (Defensive check)
    // Ensure permissions exists and is an array before calling includes
    return Array.isArray(user.permissions) && user.permissions.includes(viewId);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);