import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Box, Lock, User, ArrowRight, Loader, Mail, Key, TrendingUp } from 'lucide-react';
import { userService } from '../services/userService';
import { useToast } from '../context/ToastContext';

type LoginView = 'LOGIN' | 'FORGOT_PASSWORD' | 'VERIFY_OTP';

const Login: React.FC = () => {
  const [viewState, setViewState] = useState<LoginView>('LOGIN');
  
  // Login State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  
  // Forgot Password State
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Load saved username if exists (Check Remember Me)
  useEffect(() => {
    const savedUsername = localStorage.getItem('saved_username');
    if (savedUsername) {
        setUsername(savedUsername);
        setRememberMe(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Vui lòng nhập đầy đủ thông tin');
      return;
    }

    setError('');
    setIsSubmitting(true);
    
    // AuthContext handles session persistence (keeping user logged in)
    const result = await login(username, password, rememberMe);
    
    if (result.success) {
      // Handle Username Persistence (Pre-fill for next time after logout)
      if (rememberMe) {
          localStorage.setItem('saved_username', username);
      } else {
          localStorage.removeItem('saved_username');
      }
      navigate('/', { replace: true });
    } else {
      setError(result.message || 'Đăng nhập thất bại');
      setIsSubmitting(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return setError("Vui lòng nhập email");
    
    setIsSubmitting(true);
    const res = await userService.forgotPassword(email);
    setIsSubmitting(false);

    if (res.success) {
      showToast(res.message || 'Đã gửi mã OTP', 'success');
      setViewState('VERIFY_OTP');
      setError('');
    } else {
      setError(res.message || 'Không thể gửi mã OTP');
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || !newPassword) return setError("Vui lòng nhập đủ thông tin");
    
    setIsSubmitting(true);
    const res = await userService.verifyOtpAndReset(email, otp, newPassword);
    setIsSubmitting(false);

    if (res.success) {
      showToast('Đổi mật khẩu thành công! Vui lòng đăng nhập.', 'success');
      setViewState('LOGIN');
      setError('');
      setPassword('');
    } else {
      setError(res.message || 'Xác thực thất bại');
    }
  };

  return (
    <div className="min-h-screen bg-wood-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 left-0 w-64 h-64 bg-wood-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
      <div className="absolute top-0 right-0 w-64 h-64 bg-wood-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-64 h-64 bg-wood-400 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>

      <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 w-full max-w-md p-8 relative z-10 transition-all duration-300 hover:shadow-wood-200/50">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-wood-600 rounded-2xl shadow-lg mb-4 transform rotate-3 hover:rotate-6 transition-transform">
            <TrendingUp className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-wood-900 tracking-tight">Operations Hub</h2>
          <p className="text-slate-500 text-sm mt-2">Hệ thống quản lý tiến độ sản xuất</p>
        </div>

        {/* --- VIEW: LOGIN --- */}
        {viewState === 'LOGIN' && (
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-1">
              <label className="text-xs font-bold text-wood-800 uppercase tracking-wider ml-1">Tài khoản</label>
              <div className="relative group">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-wood-600 transition-colors" />
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500 transition-all shadow-sm"
                  placeholder="Nhập tên đăng nhập"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-wood-800 uppercase tracking-wider ml-1">Mật khẩu</label>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-wood-600 transition-colors" />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500 transition-all shadow-sm"
                  placeholder="••••••••"
                />
              </div>
              <div className="flex justify-end pt-1">
                 <button 
                  type="button" 
                  onClick={() => { setViewState('FORGOT_PASSWORD'); setError(''); }}
                  className="text-xs text-wood-600 hover:text-wood-800 hover:underline font-medium"
                >
                  Quên mật khẩu?
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
                <input 
                    type="checkbox" 
                    id="rememberMe" 
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 text-wood-600 border-slate-300 rounded focus:ring-wood-500 cursor-pointer"
                />
                <label htmlFor="rememberMe" className="text-sm text-slate-600 cursor-pointer select-none">Ghi nhớ đăng nhập</label>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm flex items-center animate-shake">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-2"></span>
                {error}
              </div>
            )}

            <button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full py-3.5 bg-wood-600 hover:bg-wood-700 text-white rounded-xl font-semibold shadow-lg shadow-wood-600/30 transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Đăng nhập
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>
        )}

        {/* --- VIEW: FORGOT PASSWORD (EMAIL) --- */}
        {viewState === 'FORGOT_PASSWORD' && (
           <form onSubmit={handleSendOtp} className="space-y-6">
              <div className="text-center mb-4">
                  <h3 className="text-lg font-semibold text-slate-800">Khôi phục mật khẩu</h3>
                  <p className="text-sm text-slate-500">Nhập email đã đăng ký để nhận mã OTP</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-wood-800 uppercase tracking-wider ml-1">Email</label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-wood-600 transition-colors" />
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500 transition-all shadow-sm"
                    placeholder="example@company.com"
                  />
                </div>
              </div>

              {error && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}

              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full py-3.5 bg-wood-600 hover:bg-wood-700 text-white rounded-xl font-semibold shadow-lg disabled:opacity-70 flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader className="w-5 h-5 animate-spin"/> : "Gửi mã OTP"}
              </button>
              <button 
                 type="button" 
                 onClick={() => { setViewState('LOGIN'); setError(''); }}
                 className="w-full py-2 text-slate-500 hover:text-slate-800 text-sm font-medium"
              >
                  Quay lại đăng nhập
              </button>
           </form>
        )}

        {/* --- VIEW: VERIFY OTP --- */}
        {viewState === 'VERIFY_OTP' && (
           <form onSubmit={handleVerifyOtp} className="space-y-6">
               <div className="text-center mb-4">
                  <h3 className="text-lg font-semibold text-slate-800">Xác thực OTP</h3>
                  <p className="text-sm text-slate-500">Mã đã được gửi đến {email}</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-wood-800 uppercase tracking-wider ml-1">Mã OTP</label>
                <input 
                    type="text" 
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wood-500 text-center tracking-[0.5em] font-bold text-lg"
                    placeholder="------"
                    maxLength={6}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-wood-800 uppercase tracking-wider ml-1">Mật khẩu mới</label>
                <div className="relative group">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-wood-600 transition-colors" />
                  <input 
                    type="password" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wood-500/20 focus:border-wood-500"
                    placeholder="Mật khẩu mới"
                  />
                </div>
              </div>

              {error && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}

              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full py-3.5 bg-wood-600 hover:bg-wood-700 text-white rounded-xl font-semibold shadow-lg disabled:opacity-70 flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader className="w-5 h-5 animate-spin"/> : "Đổi mật khẩu"}
              </button>
              <button 
                 type="button" 
                 onClick={() => { setViewState('FORGOT_PASSWORD'); setError(''); }}
                 className="w-full py-2 text-slate-500 hover:text-slate-800 text-sm font-medium"
              >
                  Gửi lại mã?
              </button>
           </form>
        )}

        <div className="mt-8 text-center">
           <p className="text-xs text-slate-400">© 2026 Operations Hub System</p>
        </div>
      </div>
    </div>
  );
};

export default Login;