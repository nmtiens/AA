import { useEffect, useRef, useState, type FormEvent, type ReactNode, type KeyboardEvent } from 'react';
import { Lock, User, ArrowRight, ArrowLeft, Loader2, Eye, EyeOff, WifiOff, Mail, Key, BarChart3, Factory, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { userService } from '../services/userService';
import { LogoAADayDu } from './LogoAA';

// ============================================================================
// KHUNG ĐĂNG NHẬP DÙNG CHUNG cho 3 trang: Operations Hub (máy tính), app Vướng mắc (/m), app MRA (/xuong) —
// cùng giao diện VÀ cùng luồng của trang máy tính (TrangDangNhap): Đăng nhập (Ghi nhớ đăng nhập) · Quên mật khẩu
// (email → mã OTP → mật khẩu mới).
// Cùng nền, khối thương hiệu, thẻ, ô nhập có icon, nút mắt, hộp lỗi, nút chính, báo Caps Lock / mất sóng — mỗi app chỉ
// khác biểu tượng, tên, mô tả và phần riêng (Quên mật khẩu, Ghi nhớ…). Kích thước theo rem: app điện thoại tự to theo
// cỡ chữ đã chọn; ô nhập / nút cao 3rem (≥ 48px).
// ============================================================================

export const NHAN = 'mb-1.5 block text-sm font-medium text-slate-700';
export const O_NHAP =
  'h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-3 text-base text-slate-900 placeholder:text-slate-400 ' +
  'transition focus:border-wood-600 focus:outline-none focus:ring-4 focus:ring-wood-600/10';
export const ICON_O = 'pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-wood-600';
export const NUT_CHINH_DN =
  'flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-wood-600 text-base font-semibold text-white transition-colors ' +
  'hover:bg-wood-700 active:bg-wood-800 disabled:cursor-not-allowed disabled:opacity-70 focus:outline-none focus-visible:ring-4 focus-visible:ring-wood-600/25';

const DIEM_NOI_BAT = [
  { icon: BarChart3, ten: 'Biểu đồ & bảng dữ liệu', moTa: 'P001 → P025, tồn kho, điểm danh' },
  { icon: Factory, ten: 'App Xưởng (MRA)', moTa: 'Tổ trưởng, trạm quét thẻ, phân công đầu ca' },
  { icon: AlertTriangle, ten: 'App Vướng mắc', moTa: 'Báo và xử lý vướng mắc tại công trình' },
];

/**
 * Bố cục trang đăng nhập: máy tính chia 2 cột (trái: logo, tên app, 3 app của hệ thống; phải: thẻ đăng nhập);
 * điện thoại 1 cột với logo + tên gọn ở trên thẻ. Dùng rlg: để điện thoại bật "trang cho máy tính" vẫn ra 1 cột.
 */
export function BoCucDangNhap({ ten, moTa, children }: { ten: string; moTa: string; children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-wood-50 rlg:grid rlg:grid-cols-[minmax(0,45%)_minmax(0,1fr)]">
      <aside className="hidden flex-col justify-between border-r border-slate-200 bg-white px-16 py-14 rlg:flex rxl:px-20">
        <div className="space-y-10">
          <LogoAADayDu className="h-36 w-auto" />
          <div className="space-y-4">
            <div className="h-1.5 w-14 rounded-full bg-aa-600" aria-hidden />
            <h1 className="text-[2rem] font-bold leading-tight text-slate-900">{ten}</h1>
            <p className="max-w-md text-lg text-slate-600">{moTa}</p>
          </div>
          <ul className="space-y-4">
            {DIEM_NOI_BAT.map(({ icon: Icon, ten: t, moTa: m }) => (
              <li key={t} className="flex items-center gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-aa-50 text-aa-600"><Icon className="h-5 w-5" aria-hidden /></span>
                <span>
                  <span className="block text-base font-semibold text-slate-900">{t}</span>
                  <span className="block text-sm text-slate-500">{m}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-slate-400">© 1989–2026 AA Corporation · Interior Solutions</p>
      </aside>
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+24px)]">
        <div className="w-full max-w-[440px]">
          <div className="mb-6 flex flex-col items-center text-center rlg:hidden">
            <LogoAADayDu className="h-24 w-auto" />
            <p className="mt-4 text-xl font-semibold tracking-tight text-slate-900">{ten}</p>
            <p className="text-base text-slate-600">{moTa}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Thẻ trắng chứa form */
export function TheDangNhap({ tieuDe, moTa, truoc, children }: { tieuDe: string; moTa?: string; truoc?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-[1.25rem] border border-slate-200 bg-white p-6 shadow-[0_12px_32px_-8px_rgba(22,24,29,0.12)] sm:p-10">
      {truoc}
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">{tieuDe}</h2>
        {moTa && <p className="mt-1 text-base text-slate-600">{moTa}</p>}
      </div>
      {children}
    </div>
  );
}

export function HopLoi({ loi }: { loi: string }) {
  if (!loi) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-base text-red-700">
      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
      <span>{loi}</span>
    </div>
  );
}

/** Nút hiện / ẩn mật khẩu trong ô nhập (vùng bấm 44px) */
export function NutMat({ hien, doi }: { hien: boolean; doi: () => void }) {
  return (
    <button type="button" onClick={doi} aria-label={hien ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} title={hien ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
      className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800">
      {hien ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
    </button>
  );
}

/**
 * Form tài khoản + mật khẩu dùng chung. `dangNhap` gọi AuthContext.login và trả kết quả; thành công thì form tự lưu
 * tên tài khoản (trừ khi ghiNho = false). `quenMatKhau`: hiện liên kết "Quên mật khẩu?"; `ghiNho`: hiện ô "Ghi nhớ".
 */
export function FormDangNhap({ dangNhap, quenMatKhau, ghiNho, baoMatSong = false, ghiChu }: {
  dangNhap: (taiKhoan: string, matKhau: string) => Promise<{ success: boolean; message?: string }>;
  quenMatKhau?: () => void;
  ghiNho?: { value: boolean; onChange: (v: boolean) => void };
  /** App điện thoại: báo rõ khi mất sóng (lần đầu cần sóng) */
  baoMatSong?: boolean;
  /** Dòng nhắc phía trên form (vd còn thao tác chưa gửi trên máy) */
  ghiChu?: ReactNode;
}) {
  const [taiKhoan, setTaiKhoan] = useState(() => { try { return localStorage.getItem('saved_username') || ''; } catch { return ''; } });
  const [matKhau, setMatKhau] = useState('');
  const [hien, setHien] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const [online, setOnline] = useState(() => navigator.onLine);
  const oTaiKhoan = useRef<HTMLInputElement>(null);
  const oMatKhau = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Đã nhớ tài khoản => con trỏ vào ô mật khẩu
    setTimeout(() => (taiKhoan ? oMatKhau : oTaiKhoan).current?.focus(), 0);
    const len = () => setOnline(true), mat = () => setOnline(false);
    window.addEventListener('online', len); window.addEventListener('offline', mat);
    return () => { window.removeEventListener('online', len); window.removeEventListener('offline', mat); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const xetCaps = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.('CapsLock') ?? false);

  const gui = async (e: FormEvent) => {
    e.preventDefault();
    if (!taiKhoan.trim() || !matKhau) { setLoi('Vui lòng nhập tài khoản và mật khẩu'); return; }
    setDang(true); setLoi('');
    const r = await dangNhap(taiKhoan.trim(), matKhau);
    if (r.success) {
      try {
        if (ghiNho && !ghiNho.value) localStorage.removeItem('saved_username');
        else localStorage.setItem('saved_username', taiKhoan.trim());
      } catch { /* bỏ qua */ }
      return; // trang cha chuyển màn
    }
    setDang(false);
    setLoi(!navigator.onLine ? 'Đang mất sóng — cần có mạng để đăng nhập.' : (r.message || 'Đăng nhập thất bại'));
  };

  return (
    <form onSubmit={gui} className="space-y-4" noValidate>
      {ghiChu}
      {baoMatSong && !online && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-base text-amber-800" role="status">
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> Đang mất sóng — cần có mạng để đăng nhập.
        </p>
      )}
      <div>
        <label htmlFor="dn-tai-khoan" className={NHAN}>Tài khoản</label>
        <div className="group relative">
          <User className={ICON_O} />
          <input id="dn-tai-khoan" ref={oTaiKhoan} value={taiKhoan} onChange={e => setTaiKhoan(e.target.value)} className={O_NHAP}
            placeholder="Nhập tên đăng nhập" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" />
        </div>
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="dn-mat-khau" className="text-sm font-medium text-slate-700">Mật khẩu</label>
          {quenMatKhau && (
            <button type="button" onClick={quenMatKhau} className="min-h-11 text-sm font-medium text-wood-600 underline-offset-2 hover:text-wood-800 hover:underline">
              Quên mật khẩu?
            </button>
          )}
        </div>
        <div className="group relative">
          <Lock className={ICON_O} />
          <input id="dn-mat-khau" ref={oMatKhau} type={hien ? 'text' : 'password'} value={matKhau} onChange={e => setMatKhau(e.target.value)}
            onKeyUp={xetCaps} onKeyDown={xetCaps} onBlur={() => setCapsLock(false)}
            className={`${O_NHAP} pr-12`} placeholder="Nhập mật khẩu" autoComplete="current-password" enterKeyHint="go" />
          <NutMat hien={hien} doi={() => setHien(v => !v)} />
        </div>
        {capsLock && <p className="mt-1.5 text-sm font-medium text-amber-700">Caps Lock đang bật</p>}
      </div>
      {ghiNho && (
        <label className="flex min-h-11 w-fit cursor-pointer select-none items-center gap-2.5">
          <input type="checkbox" checked={ghiNho.value} onChange={e => ghiNho.onChange(e.target.checked)}
            className="h-5 w-5 cursor-pointer rounded border-slate-300 accent-aa-600 focus:ring-wood-600" />
          <span className="text-base text-slate-700">Ghi nhớ đăng nhập</span>
        </label>
      )}
      <HopLoi loi={loi} />
      <button type="submit" disabled={dang} className={NUT_CHINH_DN}>
        {dang ? <><Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden /> Đang đăng nhập…</> : <>Đăng nhập <ArrowRight className="h-5 w-5" aria-hidden /></>}
      </button>
    </form>
  );
}

/** Dòng chân trang */
export const ChanDangNhap = ({ children }: { children: ReactNode }) => (
  <p className="mt-6 text-center text-sm text-slate-600">{children}</p>
);

type Buoc = 'DANG_NHAP' | 'QUEN_MAT_KHAU' | 'NHAP_OTP';

/**
 * Trang đăng nhập đầy đủ (luồng trang máy tính) — mỗi app chỉ truyền thương hiệu và việc làm sau khi đăng nhập.
 * `macDinhGhiNho`: lần đầu (chưa lưu tài khoản) có tick "Ghi nhớ" sẵn không — app đã cài trên điện thoại bật để mở lại
 * app không phải đăng nhập lại.
 */
export function TrangDangNhap({ ten, moTa, chan, sauDangNhap, macDinhGhiNho = false, baoMatSong = false, ghiChu }: {
  /** Không còn hiển thị (logo AA thay biểu tượng riêng) — giữ để các app cũ truyền vào không lỗi */
  bieuTuong?: ReactNode; ten: string; moTa: string; chan: ReactNode;
  sauDangNhap: () => void;
  macDinhGhiNho?: boolean; baoMatSong?: boolean; ghiChu?: ReactNode;
}) {
  const { login } = useAuth();
  const { showToast } = useToast();
  const [buoc, setBuoc] = useState<Buoc>('DANG_NHAP');
  const [ghiNho, setGhiNho] = useState(() => { try { return !!localStorage.getItem('saved_username') || macDinhGhiNho; } catch { return macDinhGhiNho; } });
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [matKhauMoi, setMatKhauMoi] = useState('');
  const [hienMoi, setHienMoi] = useState(false);
  const [loi, setLoi] = useState('');
  const [dang, setDang] = useState(false);

  const den = (b: Buoc) => { setBuoc(b); setLoi(''); };
  const dangNhap = async (u: string, p: string) => {
    const r = await login(u, p, ghiNho);
    if (r.success) sauDangNhap();
    return r;
  };
  const guiOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) { setLoi('Vui lòng nhập email'); return; }
    setDang(true);
    const r = await userService.forgotPassword(email);
    setDang(false);
    if (r.success) { showToast(r.message || 'Đã gửi mã OTP', 'success'); den('NHAP_OTP'); }
    else setLoi(r.message || 'Không thể gửi mã OTP');
  };
  const doiMatKhau = async (e: FormEvent) => {
    e.preventDefault();
    if (!otp || !matKhauMoi) { setLoi('Vui lòng nhập đủ thông tin'); return; }
    setDang(true);
    const r = await userService.verifyOtpAndReset(email, otp, matKhauMoi);
    setDang(false);
    if (r.success) {
      showToast('Đổi mật khẩu thành công! Vui lòng đăng nhập.', 'success');
      setOtp(''); setMatKhauMoi(''); den('DANG_NHAP');
    } else setLoi(r.message || 'Xác thực thất bại');
  };

  const dau = buoc === 'QUEN_MAT_KHAU'
    ? { step: 'Bước 1/2', title: 'Khôi phục mật khẩu', desc: 'Nhập email đã đăng ký để nhận mã OTP.' }
    : buoc === 'NHAP_OTP'
      ? { step: 'Bước 2/2', title: 'Đặt mật khẩu mới', desc: `Nhập mã OTP đã gửi đến ${email}.` }
      : { step: '', title: 'Đăng nhập', desc: 'Dùng tài khoản được cấp để tiếp tục.' };

  return (
    // Trang có thể nằm trong vùng khoá cuộn (body h-screen overflow-hidden / khung app cố định) => tự cuộn khi màn thấp
    <div className="h-[100dvh] overflow-y-auto">
      <BoCucDangNhap ten={ten} moTa={moTa}>
        <TheDangNhap tieuDe={dau.title} moTa={dau.desc} truoc={<>
          {buoc !== 'DANG_NHAP' && (
            <button type="button" onClick={() => den(buoc === 'NHAP_OTP' ? 'QUEN_MAT_KHAU' : 'DANG_NHAP')}
              className="-ml-1 mb-4 inline-flex min-h-11 items-center gap-1.5 px-1 text-base text-slate-600 transition-colors hover:text-slate-900">
              <ArrowLeft className="h-5 w-5" />
              {buoc === 'NHAP_OTP' ? 'Đổi email / gửi lại mã' : 'Quay lại đăng nhập'}
            </button>
          )}
          {dau.step && <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-wood-600">{dau.step}</p>}
        </>}>
          {buoc === 'DANG_NHAP' && (
            <FormDangNhap dangNhap={dangNhap} quenMatKhau={() => den('QUEN_MAT_KHAU')} ghiNho={{ value: ghiNho, onChange: setGhiNho }}
              baoMatSong={baoMatSong} ghiChu={ghiChu} />
          )}
          {buoc === 'QUEN_MAT_KHAU' && (
            <form onSubmit={guiOtp} className="space-y-4" noValidate>
              <div>
                <label htmlFor="dn-email" className={NHAN}>Email</label>
                <div className="group relative">
                  <Mail className={ICON_O} />
                  <input id="dn-email" type="email" value={email} onChange={e => setEmail(e.target.value)} className={O_NHAP}
                    placeholder="example@company.com" autoComplete="email" autoFocus />
                </div>
              </div>
              <HopLoi loi={loi} />
              <button type="submit" disabled={dang} className={NUT_CHINH_DN}>
                {dang ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Gửi mã OTP <ArrowRight className="h-5 w-5" /></>}
              </button>
            </form>
          )}
          {buoc === 'NHAP_OTP' && (
            <form onSubmit={doiMatKhau} className="space-y-4" noValidate>
              <div>
                <label htmlFor="dn-otp" className={NHAN}>Mã OTP</label>
                <input id="dn-otp" type="text" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-center text-lg font-semibold tabular-nums tracking-[0.6em] text-slate-900 transition placeholder:text-slate-300 focus:border-wood-600 focus:outline-none focus:ring-4 focus:ring-wood-600/10"
                  placeholder="––––––" maxLength={6} inputMode="numeric" autoComplete="one-time-code" autoFocus />
              </div>
              <div>
                <label htmlFor="dn-mat-khau-moi" className={NHAN}>Mật khẩu mới</label>
                <div className="group relative">
                  <Key className={ICON_O} />
                  <input id="dn-mat-khau-moi" type={hienMoi ? 'text' : 'password'} value={matKhauMoi} onChange={e => setMatKhauMoi(e.target.value)}
                    className={`${O_NHAP} pr-12`} placeholder="Nhập mật khẩu mới" autoComplete="new-password" />
                  <NutMat hien={hienMoi} doi={() => setHienMoi(v => !v)} />
                </div>
              </div>
              <HopLoi loi={loi} />
              <button type="submit" disabled={dang} className={NUT_CHINH_DN}>
                {dang ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Đổi mật khẩu'}
              </button>
            </form>
          )}
        </TheDangNhap>
        <ChanDangNhap>{chan}</ChanDangNhap>
      </BoCucDangNhap>
    </div>
  );
}
