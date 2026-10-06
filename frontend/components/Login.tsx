import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Lock, User, ArrowRight, ArrowLeft, Loader, Mail, Key, TrendingUp, Eye, EyeOff } from 'lucide-react';
import { userService } from '../services/userService';
import { useToast } from '../context/ToastContext';

type LoginView = 'LOGIN' | 'FORGOT_PASSWORD' | 'VERIFY_OTP';

// Style dùng chung cho form (tối giản: viền mảnh, không đổ bóng nặng)
const LABEL_CLS = 'block text-[0.8125rem] font-medium text-slate-700 mb-1.5';
const INPUT_CLS =
  'w-full h-11 pl-10 pr-3 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 ' +
  'focus:outline-none focus:ring-4 focus:ring-wood-600/10 focus:border-wood-600 transition';
const ICON_CLS =
  'absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-wood-600 transition-colors pointer-events-none';
const BTN_PRIMARY =
  'w-full h-11 bg-wood-600 hover:bg-wood-700 active:bg-wood-800 text-white text-sm rounded-lg font-semibold transition-colors ' +
  'disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 ' +
  'focus:outline-none focus-visible:ring-4 focus-visible:ring-wood-600/25';

const Login: React.FC = () => {
  const [viewState, setViewState] = useState<LoginView>('LOGIN');

  // Login State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  // Forgot Password State
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Load saved username if exists (Check Remember Me)
  useEffect(() => {
    const savedUsername = localStorage.getItem('saved_username');
    if (savedUsername) {
      setUsername(savedUsername);
      setRememberMe(true);
      // Đã nhớ tài khoản -> đặt con trỏ thẳng vào ô mật khẩu
      setTimeout(() => passwordRef.current?.focus(), 0);
    } else {
      setTimeout(() => usernameRef.current?.focus(), 0);
    }
  }, []);

  const goTo = (view: LoginView) => {
    setViewState(view);
    setError('');
  };

  const handleCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(e.getModifierState?.('CapsLock') ?? false);
  };

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
      goTo('VERIFY_OTP');
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
      goTo('LOGIN');
      setPassword('');
      setOtp('');
      setNewPassword('');
    } else {
      setError(res.message || 'Xác thực thất bại');
    }
  };

  const errorBox = error && (
    <div
      role="alert"
      className="px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2"
    >
      <span className="w-1.5 h-1.5 bg-red-500 rounded-full mt-1.5 shrink-0" />
      <span>{error}</span>
    </div>
  );

  const passwordToggle = (shown: boolean, toggle: () => void) => (
    <button
      type="button"
      onClick={toggle}
      aria-label={shown ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
      title={shown ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
    >
      {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );

  // Tiêu đề trong thẻ cho từng màn hình
  const header = (() => {
    switch (viewState) {
      case 'FORGOT_PASSWORD':
        return { step: 'Bước 1/2', title: 'Khôi phục mật khẩu', desc: 'Nhập email đã đăng ký để nhận mã OTP.' };
      case 'VERIFY_OTP':
        return { step: 'Bước 2/2', title: 'Đặt mật khẩu mới', desc: `Nhập mã OTP đã gửi đến ${email}.` };
      default:
        return { step: '', title: 'Đăng nhập', desc: 'Dùng tài khoản được cấp để tiếp tục.' };
    }
  })();

  return (
    // body đang khoá cuộn (h-screen overflow-hidden) -> trang tự cuộn khi màn hình thấp
    <div className="relative h-screen overflow-y-auto overflow-x-hidden bg-wood-50">
      {/* ===== Trang trí nền (chỉ để nhìn, không tương tác) ===== */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        {/* Lưới chấm, mờ dần ra mép */}
        <div
          className="absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, #cbd2dc 1px, transparent 0)',
            backgroundSize: '24px 24px',
            maskImage: 'radial-gradient(ellipse 70% 60% at 50% 45%, #000 30%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 45%, #000 30%, transparent 100%)',
          }}
        />
        {/* Quầng màu loang nhẹ ở 2 góc */}
        <div className="absolute -top-32 -left-32 w-[460px] h-[460px] rounded-full bg-sky-200/60 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 w-[520px] h-[520px] rounded-full bg-wood-300/60 blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-[360px] h-[360px] rounded-full bg-emerald-200/30 blur-3xl" />
        {/* Đường "tiến độ" mảnh chạy ngang phía dưới */}
        <svg
          className="absolute bottom-0 left-0 w-full h-48 text-wood-300"
          viewBox="0 0 1440 200"
          preserveAspectRatio="none"
          fill="none"
        >
          <path
            d="M0 170 C 180 165, 260 140, 400 145 S 620 110, 760 118 S 980 70, 1120 78 S 1340 30, 1440 24"
            stroke="currentColor"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M0 170 C 180 165, 260 140, 400 145 S 620 110, 760 118 S 980 70, 1120 78 S 1340 30, 1440 24 L1440 200 L0 200 Z"
            fill="currentColor"
            opacity="0.18"
          />
        </svg>
      </div>

      <div className="relative min-h-full flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-[400px]">
          {/* Thương hiệu */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-11 h-11 bg-wood-600 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" strokeWidth={2.25} />
            </div>
            <p className="mt-3 text-lg font-semibold text-slate-900 tracking-tight">Operations Hub</p>
            <p className="text-sm text-slate-500">Hệ thống quản lý tiến độ sản xuất</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_8px_30px_-12px_rgba(16,24,40,0.18)] p-6 sm:p-8">
            {viewState !== 'LOGIN' && (
              <button
                type="button"
                onClick={() => goTo(viewState === 'VERIFY_OTP' ? 'FORGOT_PASSWORD' : 'LOGIN')}
                className="mb-4 -ml-1 inline-flex items-center gap-1.5 px-1 text-sm text-slate-500 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                {viewState === 'VERIFY_OTP' ? 'Đổi email / gửi lại mã' : 'Quay lại đăng nhập'}
              </button>
            )}

            <div className="mb-6">
              {header.step && (
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-wood-500">{header.step}</p>
              )}
              <h2 className="text-xl font-semibold text-slate-900 tracking-tight">{header.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{header.desc}</p>
            </div>

            {/* --- VIEW: LOGIN --- */}
            {viewState === 'LOGIN' && (
              <form onSubmit={handleLogin} className="space-y-4" noValidate>
                <div>
                  <label htmlFor="login-username" className={LABEL_CLS}>Tài khoản</label>
                  <div className="relative group">
                    <User className={ICON_CLS} />
                    <input
                      id="login-username"
                      ref={usernameRef}
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className={INPUT_CLS}
                      placeholder="Nhập tên đăng nhập"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="login-password" className="text-[0.8125rem] font-medium text-slate-700">Mật khẩu</label>
                    <button
                      type="button"
                      onClick={() => goTo('FORGOT_PASSWORD')}
                      className="text-[0.8125rem] font-medium text-wood-600 hover:text-wood-800 hover:underline underline-offset-2"
                    >
                      Quên mật khẩu?
                    </button>
                  </div>
                  <div className="relative group">
                    <Lock className={ICON_CLS} />
                    <input
                      id="login-password"
                      ref={passwordRef}
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyUp={handleCapsLock}
                      onKeyDown={handleCapsLock}
                      onBlur={() => setCapsLock(false)}
                      className={`${INPUT_CLS} pr-11`}
                      placeholder="Nhập mật khẩu"
                      autoComplete="current-password"
                    />
                    {passwordToggle(showPassword, () => setShowPassword(v => !v))}
                  </div>
                  {capsLock && (
                    <p className="mt-1.5 text-xs font-medium text-amber-600">Caps Lock đang bật</p>
                  )}
                </div>

                <label htmlFor="rememberMe" className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
                  <input
                    type="checkbox"
                    id="rememberMe"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 text-wood-600 border-slate-300 rounded focus:ring-wood-600 cursor-pointer"
                  />
                  <span className="text-sm text-slate-600">Ghi nhớ đăng nhập</span>
                </label>

                {errorBox}

                <button type="submit" disabled={isSubmitting} className={BTN_PRIMARY}>
                  {isSubmitting ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Đang đăng nhập...
                    </>
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
              <form onSubmit={handleSendOtp} className="space-y-4" noValidate>
                <div>
                  <label htmlFor="forgot-email" className={LABEL_CLS}>Email</label>
                  <div className="relative group">
                    <Mail className={ICON_CLS} />
                    <input
                      id="forgot-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={INPUT_CLS}
                      placeholder="example@company.com"
                      autoComplete="email"
                      autoFocus
                    />
                  </div>
                </div>

                {errorBox}

                <button type="submit" disabled={isSubmitting} className={BTN_PRIMARY}>
                  {isSubmitting ? <Loader className="w-4 h-4 animate-spin" /> : <>Gửi mã OTP <ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            )}

            {/* --- VIEW: VERIFY OTP --- */}
            {viewState === 'VERIFY_OTP' && (
              <form onSubmit={handleVerifyOtp} className="space-y-4" noValidate>
                <div>
                  <label htmlFor="otp-code" className={LABEL_CLS}>Mã OTP</label>
                  <input
                    id="otp-code"
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    className="w-full h-12 px-3 bg-white border border-slate-300 rounded-lg text-center tracking-[0.6em] font-semibold text-lg tabular-nums text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-wood-600/10 focus:border-wood-600 transition"
                    placeholder="––––––"
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                  />
                </div>

                <div>
                  <label htmlFor="otp-new-password" className={LABEL_CLS}>Mật khẩu mới</label>
                  <div className="relative group">
                    <Key className={ICON_CLS} />
                    <input
                      id="otp-new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className={`${INPUT_CLS} pr-11`}
                      placeholder="Nhập mật khẩu mới"
                      autoComplete="new-password"
                    />
                    {passwordToggle(showNewPassword, () => setShowNewPassword(v => !v))}
                  </div>
                </div>

                {errorBox}

                <button type="submit" disabled={isSubmitting} className={BTN_PRIMARY}>
                  {isSubmitting ? <Loader className="w-4 h-4 animate-spin" /> : 'Đổi mật khẩu'}
                </button>
              </form>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            Tài khoản do quản trị viên cấp · © 2026 Operations Hub
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
