import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { ClipboardList, LayoutGrid, Search, Settings2, UserRound, Loader2 } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { getToken } from '../../../services/userService';
import { BG, Toast } from '../mobileUi';
import DangNhapXuong from './DangNhapXuong';
import XuongApp, { type ToMo } from './XuongApp';
import { apDungCheDoDienThoai } from './cheDoDienThoai';

// ============================================================================
// APP XƯỞNG RIÊNG (/xuong — đường cũ /m/xuong của bản đã cài vẫn vào đây). Cài riêng thành app "Xưởng".
// Mục: Tổ (màn tổ trưởng, luôn chạy nền để gửi hàng đợi) · Tổng quan (quản lý) · Tra cứu · Quản lý (báo cáo, triển khai,
// tổ, công đoạn, lịch ca, cần xem — quản lý) · Tài khoản.
// Điện thoại: thanh điều hướng dưới; máy tính (≥ md): cột menu trái, nội dung ở giữa.
// ============================================================================

const TongQuanXuong = lazy(() => import('./TongQuanXuong'));
const TraCuuXuong = lazy(() => import('./TraCuuXuong'));
const XuongSetup = lazy(() => import('../../Xuong/XuongSetup'));
const MobileAccount = lazy(() => import('../MobileAccount'));

type Muc = 'to' | 'tongQuan' | 'traCuu' | 'quanLy' | 'taiKhoan';
const KHOA_MUC = 'xuong_app_muc';
const TEXT_SIZES = [17, 19, 21, 24];
const SIZE_LABELS = ['Nhỏ', 'Vừa', 'Lớn', 'Rất lớn'];
const KHOA_CO_CHU = 'xuong_size_idx';

const dangNhapSan = () => !!getToken() || !!localStorage.getItem('xuong_token');

const Cho = () => <div className="flex h-full items-center justify-center text-slate-500"><Loader2 className="animate-spin" aria-hidden /></div>;

export default function XuongShell() {
  const { user, hasPermission } = useAuth();
  const [daDangNhap, setDaDangNhap] = useState(dangNhapSan);
  const laQuanLy = hasPermission('xuong_quan_ly');
  // Tổ trưởng: không hiện Tổng quan; mục Quản lý chỉ số liệu tổ mình (backend lọc) — kể cả tổ trưởng không có quyền
  // quản lý. Lần đầu đọc phiên đã lưu để menu không nháy.
  const [soTo, setSoTo] = useState<number>(() => {
    try {
      const to = JSON.parse(localStorage.getItem('xuong_phien') || 'null')?.to as Array<{ toTruong?: boolean }> | undefined;
      return to?.filter(t => t.toTruong !== false).length ?? 0;
    } catch { return 0; }
  });
  const coTongQuan = laQuanLy && soTo === 0;
  const coQuanLy = laQuanLy || soTo > 0;
  // Điện thoại bật "Trang web cho máy tính" → vẫn dùng bố cục điện thoại (trước khi vẽ để không nháy bố cục máy tính)
  useLayoutEffect(() => apDungCheDoDienThoai(), []);

  const dsMuc: Array<{ id: Muc; ten: string; icon: ReactNode }> = [
    { id: 'to', ten: 'Tổ', icon: <ClipboardList size="1.375em" /> },
    ...(coTongQuan ? [{ id: 'tongQuan' as const, ten: 'Tổng quan', icon: <LayoutGrid size="1.375em" /> }] : []),
    { id: 'traCuu', ten: 'Tra cứu', icon: <Search size="1.375em" /> },
    ...(coQuanLy ? [{ id: 'quanLy' as const, ten: soTo > 0 ? 'Báo cáo' : 'Quản lý', icon: <Settings2 size="1.375em" /> }] : []),
    { id: 'taiKhoan', ten: 'Tài khoản', icon: <UserRound size="1.375em" /> },
  ];

  const [muc, setMuc] = useState<Muc>(() => {
    const tuUrl = new URLSearchParams(location.search).get('muc');
    const v = (tuUrl || localStorage.getItem(KHOA_MUC) || 'to') as Muc;
    return ['to', 'tongQuan', 'traCuu', 'quanLy', 'taiKhoan'].includes(v) ? v : 'to';
  });
  // Mục quản lý mà tài khoản không có quyền (đổi người / bị thu quyền) → về Tổ
  const mucHienTai: Muc = dsMuc.some(m => m.id === muc) ? muc : 'to';
  // Mục đã mở thì giữ lại (ẩn đi) để không tải lại khi quay về
  const [daMo, setDaMo] = useState<Set<Muc>>(() => new Set<Muc>(['to', mucHienTai]));
  const chon = useCallback((m: Muc) => {
    setMuc(m); setDaMo(s => (s.has(m) ? s : new Set([...s, m])));
    try { localStorage.setItem(KHOA_MUC, m); } catch { /* bỏ qua */ }
  }, []);

  const [moTo, setMoTo] = useState<ToMo | null>(null);
  const [lanQl, setLanQl] = useState(0);
  const moKeHoach = useCallback((xuong: string) => {
    try {
      localStorage.setItem('xuong_setup_xuong', xuong);
      localStorage.setItem('xuong_setup_muc', 'bao-cao');
      localStorage.setItem('xuong_bao_cao_tab', 'keHoach');
    } catch { /* bỏ qua */ }
    setLanQl(n => n + 1); chon('quanLy');
  }, [chon]);
  const [toast, setToast] = useState('');
  const flash = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); }, []);

  // Cỡ chữ riêng của app Xưởng
  const [sizeIdx, setSizeIdx] = useState(() => {
    const v = Number(localStorage.getItem(KHOA_CO_CHU));
    return Number.isInteger(v) && v >= 0 && v < TEXT_SIZES.length ? v : 1;
  });
  useEffect(() => {
    document.documentElement.style.fontSize = `${TEXT_SIZES[sizeIdx]}px`;
    try { localStorage.setItem(KHOA_CO_CHU, String(sizeIdx)); } catch { /* bỏ qua */ }
    return () => { document.documentElement.style.fontSize = ''; };
  }, [sizeIdx]);

  if (!daDangNhap) {
    return <div className="fixed inset-0 overflow-y-auto"><DangNhapXuong onSuccess={() => setDaDangNhap(true)} /></div>;
  }

  const ten = user?.fullName || user?.username || '';
  const khung = (m: Muc, noiDung: ReactNode, tuCuon = true) => daMo.has(m) && (
    <div key={m} className={`absolute inset-0 ${tuCuon ? 'overflow-y-auto overscroll-contain' : 'flex flex-col overflow-hidden'} ${mucHienTai === m ? '' : 'hidden'}`}
      role="tabpanel" aria-label={dsMuc.find(x => x.id === m)?.ten}>
      <Suspense fallback={<Cho />}>{noiDung}</Suspense>
    </div>
  );

  return (
    <div className={`fixed inset-0 flex ${BG}`}>
      {/* Máy tính: cột menu trái */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white rmd:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-xl text-white" aria-hidden>🏭</span>
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-tight text-slate-900">MRA</p>
            <p className="truncate text-sm text-slate-500">{ten}</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1 px-3" aria-label="Mục app MRA">
          {dsMuc.map(m => (
            <button key={m.id} onClick={() => chon(m.id)} aria-current={mucHienTai === m.id ? 'page' : undefined}
              className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-base ${mucHienTai === m.id ? 'bg-slate-900 font-semibold text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
              {m.icon}{m.ten}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-1 border-t border-slate-100 p-3 text-sm">
          <a href="/" className="block rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">Operations Hub (máy tính)</a>
        </div>
      </aside>

      <div className="relative min-w-0 flex-1">
        {/* Tổ: luôn gắn để hàng đợi tiếp tục gửi khi đang xem mục khác */}
        <div className={`absolute inset-0 overflow-y-auto overscroll-contain ${mucHienTai === 'to' ? '' : 'hidden'}`} role="tabpanel" aria-label="Tổ">
          <XuongApp moTo={moTo} onTongQuan={() => chon('tongQuan')} dangXem={mucHienTai === 'to'} onSoTo={setSoTo} />
        </div>
        {khung('tongQuan', <TongQuanXuong onChonTo={t => { setMoTo({ ...t, lan: Date.now() }); chon('to'); }} onMoKeHoach={moKeHoach} />)}
        {khung('traCuu', <TraCuuXuong />)}
        {khung('quanLy', <XuongSetup key={lanQl} trongApp />, false)}
        {khung('taiKhoan', (
          <div className="mx-auto max-w-2xl">
            <MobileAccount appXuong sizeIdx={sizeIdx} sizeLabels={SIZE_LABELS} onSizeChange={setSizeIdx}
              onLoggedOut={() => { setDaDangNhap(false); setMoTo(null); chon('to'); }} flash={flash} />
          </div>
        ))}
      </div>

      {/* Điện thoại: thanh điều hướng dưới */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur rmd:hidden" aria-label="Mục app MRA">
        <div className="mx-auto flex h-16 max-w-xl">
          {dsMuc.map(m => (
            <button key={m.id} onClick={() => chon(m.id)} aria-current={mucHienTai === m.id ? 'page' : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-xs ${mucHienTai === m.id ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
              {m.icon}<span className="truncate">{m.ten}</span>
            </button>
          ))}
        </div>
      </nav>
      <Toast text={toast} />
    </div>
  );
}
