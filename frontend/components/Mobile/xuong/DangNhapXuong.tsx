import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Factory, Eye, EyeOff, WifiOff, Loader2 } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { NUT_CHINH, CHU_PHU, MAU } from './xuongUi';

// ============================================================================
// ĐĂNG NHẬP APP XƯỞNG — trang riêng của app Xưởng (tách hẳn app Vướng mắc). Theo token màn Xưởng (xuongUi):
// ô nhập / nút cao ≥ 56–64px, chữ ≥ 16px cho tay đeo găng, đèn xưởng; báo rõ khi mất sóng (lần đầu cần sóng).
// ============================================================================

const O_NHAP = 'h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 text-lg text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15';

export default function DangNhapXuong({ onSuccess, ghiChu }: {
  onSuccess: () => void;
  /** Dòng nhắc phía trên (vd. còn thao tác chưa gửi trên máy) */
  ghiChu?: ReactNode;
}) {
  const { login } = useAuth();
  const [taiKhoan, setTaiKhoan] = useState(() => { try { return localStorage.getItem('saved_username') || ''; } catch { return ''; } });
  const [matKhau, setMatKhau] = useState('');
  const [hien, setHien] = useState(false);
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const len = () => setOnline(true), mat = () => setOnline(false);
    window.addEventListener('online', len); window.addEventListener('offline', mat);
    return () => { window.removeEventListener('online', len); window.removeEventListener('offline', mat); };
  }, []);

  const gui = async (e: FormEvent) => {
    e.preventDefault();
    if (!taiKhoan.trim() || !matKhau) { setLoi('Nhập tài khoản và mật khẩu'); return; }
    setDang(true); setLoi('');
    // rememberMe = true: app đã cài giữ được phiên đăng nhập
    const r = await login(taiKhoan.trim(), matKhau, true);
    setDang(false);
    if (r.success) {
      try { localStorage.setItem('saved_username', taiKhoan.trim()); } catch { /* bỏ qua */ }
      onSuccess();
    } else {
      setLoi(!navigator.onLine ? 'Đang mất sóng — cần có sóng để đăng nhập.' : (r.message || 'Đăng nhập không được'));
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col justify-center bg-[#f4f6fa] px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+24px)]">
      <div className="mx-auto w-full max-w-sm space-y-6">
        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-900 text-white shadow-sm">
            <Factory size={40} strokeWidth={1.75} aria-hidden />
          </div>
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Xưởng</h1>
            <p className={`mt-1 ${CHU_PHU}`}>Ghi việc của tổ: nhận hàng, bắt đầu, xong — giao</p>
          </div>
        </div>

        {ghiChu}
        {!online && (
          <p className={`flex items-start gap-2 rounded-2xl ${MAU.ngung.nen} p-3 text-base ${MAU.ngung.chu}`} role="status">
            <WifiOff size="1.2em" className="mt-0.5 shrink-0" aria-hidden /> Đang mất sóng — cần có sóng để đăng nhập.
          </p>
        )}

        <form onSubmit={gui} className="space-y-4 rounded-3xl bg-white p-5 shadow-sm" noValidate>
          <label className="block space-y-1.5">
            <span className="text-base font-medium text-slate-800">Tài khoản</span>
            <input value={taiKhoan} onChange={e => setTaiKhoan(e.target.value)} className={O_NHAP}
              placeholder="Tên đăng nhập" autoCapitalize="none" autoCorrect="off" autoComplete="username" enterKeyHint="next" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-base font-medium text-slate-800">Mật khẩu</span>
            <span className="relative block">
              <input type={hien ? 'text' : 'password'} value={matKhau} onChange={e => setMatKhau(e.target.value)}
                className={`${O_NHAP} pr-14`} placeholder="Mật khẩu" autoComplete="current-password" enterKeyHint="go" />
              <button type="button" onClick={() => setHien(v => !v)} aria-label={hien ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                className="absolute right-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-xl text-slate-500 active:bg-slate-100">
                {hien ? <EyeOff size="1.3em" /> : <Eye size="1.3em" />}
              </button>
            </span>
          </label>
          {loi && <p className={`rounded-2xl ${MAU.loi.nen} p-3 text-base font-medium ${MAU.loi.chu}`} role="alert">{loi}</p>}
          <button type="submit" disabled={dang} className={NUT_CHINH}>
            {dang ? <><Loader2 size="1.2em" className="animate-spin motion-reduce:animate-none" aria-hidden /> Đang đăng nhập…</> : 'Đăng nhập'}
          </button>
        </form>

        <p className={`text-center ${CHU_PHU}`}>Chưa có tài khoản hoặc quên mật khẩu? Báo quản lý xưởng.</p>
      </div>
    </div>
  );
}
