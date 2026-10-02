import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Lock, User, ArrowRight, Loader, Mail, Key, TrendingUp } from 'lucide-react';
import { userService } from '../services/userService';
import { useToast } from '../context/ToastContext';

type LoginView = 'LOGIN' | 'FORGOT_PASSWORD' | 'VERIFY_OTP';

// Style dùng chung cho form (tối giản: viền mảnh, không đổ bóng nặng)
const LABEL_CLS = 'block text-xs font-medium text-slate-600 mb-1.5';
const INPUT_CLS =
  'w-full pl-10 pr-3 py-2.5 text-sm bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-wood-600/15 focus:border-wood-600 transition';
const ICON_CLS =
  'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-wood-600 transition-colors';
const BTN_PRIMARY =
  'w-full py-2.5 bg-wood-600 hover:bg-wood-700 text-white text-sm rounded-lg font-medium transition-colors ' +
  'disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2';
const BTN_GHOST = 'w-full py-2 text-slate-500 hover:text-slate-900 text-sm font-medium transition-colors';

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
      const afterLogin = sessionStorage.getItem('after_login');
      if (afterLogin) {
        sessionStorage.removeItem('after_login');
        window.location.replace(afterLogin); // bắt buộc dùng location: /m/ nằm ngoài HashRouter
        return;
      }
      navigate('/', { replace: true });
    } else {
      setError(result.message || 'Đăng nhập thất bại');
      setIsSubmitting(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return setError('Vui lòng nhập email');

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
    if (!otp || !newPassword) return setError('Vui lòng nhập đủ thông tin');

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

  const errorBox = error && (
    <div className="px-3 py-2.5 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm flex items-start gap-2">
      <span className="w-1.5 h-1.5 bg-red-500 rounded-full mt-1.5 shrink-0"></span>
      <span>{error}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-wood-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Thương hiệu */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-11 h-11 bg-wood-600 rounded-xl mb-4">
            <TrendingUp className="w-5 h-5 text-white" strokeWidth={2.25} />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Operations Hub</h2>
          <p className="text-slate-500 text-sm mt-1">Hệ thống quản lý tiến độ sản xuất</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-7">
          {/* --- VIEW: LOGIN --- */}
          {viewState === 'LOGIN' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className={LABEL_CLS}>Tài khoản</label>
                <div className="relative group">
                  <User className={ICON_CLS} />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className={INPUT_CLS}
                    placeholder="Nhập tên đăng nhập"
                    autoComplete="username"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-600">Mật khẩu</label>
                  <button
                    type="button"
                    onClick={() => { setViewState('FORGOT_PASSWORD'); setError(''); }}
                    className="text-xs text-slate-500 hover:text-slate-900 hover:underline"
                  >
                    Quên mật khẩu?
                  </button>
                </div>
                <div className="relative group">
                  <Lock className={ICON_CLS} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={INPUT_CLS}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 text-wood-600 border-slate-300 rounded focus:ring-wood-600 cursor-pointer"
                />
                <label htmlFor="rememberMe" className="text-sm text-slate-600 cursor-pointer select-none">
                  Ghi nhớ đăng nhập
                </label>
              </div>

              {errorBox}

              <button type="submit" disabled={isSubmitting} className={BTN_PRIMARY}>
                {isSubmitting ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Đăng nhập
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* --- VIEW: FORGOT PASSWORD (EMAIL) --- */}
          {viewState === 'FORGOT_PASSWORD' && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="text-center mb-2">
                <h3 className="text-base font-semibold text-slate-900">Khôi phục mật khẩu</h3>
                <p className="text-sm text-slate-500 mt-1">Nhập email đã đăng ký để nhận mã OTP</p>
              </div>

              <div>
                <label className={LABEL_CLS}>Email</label>
                <div className="relative group">
                  <Mail className={ICON_CLS} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={INPUT_CLS}
                    placeholder="example@company.com"
                    autoComplete="email"
                  />
                </div>
              </div>

              {errorBox}

              <button type="submit" disabled={isSubmitting} className={BTN_PRIMARY}>
                {isSubmitting ? <Loader className="w-4 h-4 animate-spin" /> : 'Gửi mã OTP'}
              </button>
              <button
                type="button"
                onClick={() => { setViewState('LOGIN'); setError(''); }}
                className={BTN_GHOST}
              >
                Quay lại đăng nhập
              </button>
            </form>
          )}

          {/* --- VIEW: VERIFY OTP --- */}
          {viewState === 'VERIFY_OTP' && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="text-center mb-2">
                <h3 className="text-base font-semibold text-slate-900">Xác thực OTP</h3>
                <p className="text-sm text-slate-500 mt-1">Mã đã được gửi đến {email}</p>
              </div>

              <div>
                <label className={LABEL_CLS}>Mã OTP</label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-center tracking-[0.5em] font-semibold text-lg tabular-nums placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-wood-600/15 focus:border-wood-600 transition"
                  placeholder="------"
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </div>

              <div>
                <label className={LABEL_CLS}>Mật khẩu mới</label>
                <div className="relative group">
                  <Key className={ICON_CLS} />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={INPUT_CLS}
                    placeholder="Mật khẩu mới"
                    autoComplete="new-password"
                  />
                </div>
              </div>

              {errorBox}

              <button type="submit" disabled={isSubmitting} className={BTN_PRIMARY}>
                {isSubmitting ? <Loader className="w-4 h-4 animate-spin" /> : 'Đổi mật khẩu'}
              </button>
              <button
                type="button"
                onClick={() => { setViewState('FORGOT_PASSWORD'); setError(''); }}
                className={BTN_GHOST}
              >
                Gửi lại mã?
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">© 2026 Operations Hub System</p>
      </div>
    </div>
  );
};

export default Login;