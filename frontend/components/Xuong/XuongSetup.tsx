import React, { useCallback, useEffect, useState } from 'react';
import { Factory, RefreshCw, Rocket, ListTree, Activity, Users, ListOrdered, Clock, ShieldCheck, AlertTriangle, BarChart3, Contact } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { xuongSetupApi, type SetupXuong } from '../../services/xuongSetupApi';
import { XuongToSetup, XuongCongDoanSetup, XuongLichCaSetup, XuongQuanLySetup, XuongCanXem } from './XuongSetupMuc';
import TrienKhaiXuong from './TrienKhaiXuong';
import KhaiChiTietXuong from './KhaiChiTietXuong';
import TheoDoiTrienKhai from './TheoDoiTrienKhai';
import BaoCaoXuong from './BaoCaoXuong';
import NhanSuXuong from './NhanSuXuong';

// ============================================================================
// THẺ "XƯỞNG" TRONG SETUP DỮ LIỆU (T8 — docs/designs/xuong-checkin.md).
// Mục con: Báo cáo xưởng / tổ · Triển khai hạng mục (QT1/QT2, 7A) · Tổ & tổ trưởng · Nhân sự (chấm công) · Công đoạn · Lịch ca · Quản lý xưởng · Cần xem.
// Quyền: admin mọi xưởng; quản lý xưởng chỉ xưởng của mình (backend kiểm lại).
// Dùng chung cho mục "Quản lý" của app Xưởng (/xuong): `trongApp` = chừa chỗ thanh điều hướng dưới, tiêu đề lớn hơn.
// ============================================================================

type Muc = 'bao-cao' | 'trien-khai' | 'khai-chi-tiet' | 'theo-doi' | 'to' | 'nhan-su' | 'cong-doan' | 'lich-ca' | 'quan-ly' | 'can-xem';
const MUC: Array<{ id: Muc; ten: string; icon: React.ReactNode }> = [
  { id: 'bao-cao', ten: 'Báo cáo', icon: <BarChart3 size={15} /> },
  { id: 'trien-khai', ten: 'Triển khai hạng mục', icon: <Rocket size={15} /> },
  { id: 'khai-chi-tiet', ten: 'Khai CĐ chi tiết', icon: <ListTree size={15} /> },
  { id: 'theo-doi', ten: 'Theo dõi triển khai', icon: <Activity size={15} /> },
  { id: 'to', ten: 'Tổ & tổ trưởng', icon: <Users size={15} /> },
  { id: 'nhan-su', ten: 'Nhân sự', icon: <Contact size={15} /> },
  { id: 'cong-doan', ten: 'Công đoạn', icon: <ListOrdered size={15} /> },
  { id: 'lich-ca', ten: 'Lịch ca', icon: <Clock size={15} /> },
  { id: 'quan-ly', ten: 'Quản lý xưởng', icon: <ShieldCheck size={15} /> },
  { id: 'can-xem', ten: 'Cần xem', icon: <AlertTriangle size={15} /> },
];
// Điện thoại (app Xưởng): chỉ các mục quản lý dùng tại xưởng; mục cấu hình (tổ, công đoạn, lịch ca…) để máy tính
const MUC_DIEN_THOAI: Muc[] = ['theo-doi', 'can-xem', 'bao-cao'];
const laDienThoai = () => document.documentElement.classList.contains('dien-thoai') || window.innerWidth < 768;
const KHOA_XUONG = 'xuong_setup_xuong';
const KHOA_MUC = 'xuong_setup_muc';

export default function XuongSetup({ trongApp = false }: { trongApp?: boolean }) {
  const { showToast } = useToast();
  const [xuong, setXuong] = useState<string | undefined>(() => localStorage.getItem(KHOA_XUONG) || undefined);
  const [muc, setMuc] = useState<Muc>(() => (localStorage.getItem(KHOA_MUC) as Muc) || 'bao-cao');
  const [d, setD] = useState<SetupXuong | null>(null);
  const [loi, setLoi] = useState('');
  const [dang, setDang] = useState(true);

  const tai = useCallback(async () => {
    setDang(true);
    const r = await xuongSetupApi.setup(xuong);
    if (r.ok) {
      setD(r.data); setLoi('');
      if (r.data.xuong && r.data.xuong !== xuong) setXuong(r.data.xuong);
    } else setLoi(r.message);
    setDang(false);
  }, [xuong]);
  useEffect(() => { tai(); }, [tai]);
  useEffect(() => { if (xuong) localStorage.setItem(KHOA_XUONG, xuong); }, [xuong]);
  useEffect(() => { localStorage.setItem(KHOA_MUC, muc); }, [muc]);

  const bao = useCallback((ok: boolean, msg: string) => showToast(msg, ok ? 'success' : 'error'), [showToast]);

  const [dienThoai, setDienThoai] = useState(() => trongApp && laDienThoai());
  useEffect(() => {
    if (!trongApp) return;
    const doi = () => setDienThoai(laDienThoai());
    window.addEventListener('resize', doi);
    return () => window.removeEventListener('resize', doi);
  }, [trongApp]);
  const [hienHet, setHienHet] = useState(false);
  // Tài khoản tổ trưởng: chỉ các mục xem, số liệu đã lọc theo tổ (backend lọc), không có mục cấu hình
  const toTruong = !!d?.chiTo;
  const gon = toTruong || (dienThoai && !hienHet);
  const dsMuc = gon ? MUC.filter(m => MUC_DIEN_THOAI.includes(m.id)).sort((a, b) => MUC_DIEN_THOAI.indexOf(a.id) - MUC_DIEN_THOAI.indexOf(b.id)) : MUC;
  const mucHien: Muc = dsMuc.some(m => m.id === muc) ? muc : dsMuc[0].id;
  // Điện thoại: nút / chữ ≥ 44px / 16px như phần còn lại của app
  const lon = dienThoai;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-wood-50">
      <div className={`flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 rmd:px-6 ${trongApp ? 'pt-[calc(env(safe-area-inset-top)+12px)]' : ''}`}>
        <Factory size={18} className={`text-wood-700 ${trongApp ? 'hidden rsm:block' : ''}`} aria-hidden />
        <h2 className={trongApp ? 'text-xl font-semibold text-slate-900' : 'text-base font-bold text-slate-800'}>
          {toTruong ? `Tổ ${d!.to.map(t => t.ten).join(', ')}` : trongApp ? 'Quản lý xưởng' : 'Xưởng'}</h2>
        {/* Tổ trưởng 1 xưởng: không cần chọn xưởng */}
        {!(toTruong && (d?.dsXuong.length ?? 0) <= 1) && (
        <label className={`flex items-center gap-2 text-slate-600 ${trongApp ? 'text-base' : 'text-sm'}`}>
          <span className={trongApp ? 'sr-only rsm:not-sr-only' : ''}>Xưởng</span>
          <select value={xuong ?? ''} onChange={e => setXuong(e.target.value)}
            className={`rounded-md border border-slate-300 bg-white px-2 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-wood-300 ${lon ? 'min-h-11 text-base' : 'py-1.5 text-sm'}`}>
            {(d?.dsXuong ?? (xuong ? [xuong] : [])).map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        )}
        <nav className="order-last -mx-4 flex w-[calc(100%+2rem)] gap-1 overflow-x-auto px-4 [scrollbar-width:none] rmd:order-none rmd:mx-0 rmd:w-auto rmd:flex-wrap rmd:overflow-visible rmd:px-0" aria-label="Mục cấu hình Xưởng">
          {dsMuc.map(m => (
            <button key={m.id} type="button" onClick={() => setMuc(m.id)} aria-pressed={mucHien === m.id}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 ${lon ? 'min-h-11 text-base' : 'py-1.5 text-sm'} ${mucHien === m.id ? 'bg-wood-600 font-semibold text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
              {m.icon}{m.ten}
            </button>
          ))}
          {dienThoai && !toTruong && (
            <button type="button" onClick={() => setHienHet(v => !v)}
              className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg px-3 text-base text-slate-700 underline underline-offset-4">
              {hienHet ? 'Thu gọn' : 'Mục cấu hình…'}
            </button>
          )}
        </nav>
        <button type="button" onClick={tai} className={`ml-auto flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 ${lon ? 'h-11 w-11' : 'p-2'}`} aria-label="Tải lại" title="Tải lại">
          <RefreshCw size={16} className={dang ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className={`min-h-0 flex-1 overflow-auto p-4 rmd:p-6 ${trongApp ? 'pb-[calc(env(safe-area-inset-bottom)+6rem)] rmd:pb-6' : ''}`}>
        {loi && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{loi}</p>}
        {!d && dang && <div className="flex justify-center py-16 text-slate-400"><RefreshCw className="animate-spin" size={20} /></div>}
        {d && !d.xuong && <p className="text-sm text-slate-600">Chưa có xưởng nào trong danh mục. Chạy file SQL danh mục (backend/sql/2026-10-12_xuong_danh_muc_mra.sql) hoặc thêm công đoạn.</p>}
        {d && d.xuong && (
          <>
            {gon && !toTruong && mucHien === 'theo-doi' && <p className="mb-3 text-base text-slate-600">Điện thoại chỉ hiện mục dùng tại xưởng. Tổ, công đoạn, lịch ca, triển khai: bấm <b>Mục cấu hình…</b> hoặc làm trên máy tính.</p>}
            {mucHien === 'bao-cao' && <BaoCaoXuong xuong={d.xuong} />}
            {mucHien === 'trien-khai' && <TrienKhaiXuong xuong={d.xuong} bao={bao} />}
            {mucHien === 'khai-chi-tiet' && <KhaiChiTietXuong xuong={d.xuong} bao={bao} />}
            {mucHien === 'theo-doi' && <TheoDoiTrienKhai xuong={d.xuong} />}
            {mucHien === 'to' && <XuongToSetup d={d} bao={bao} tai={tai} />}
            {mucHien === 'nhan-su' && <NhanSuXuong d={d} bao={bao} />}
            {mucHien === 'cong-doan' && <XuongCongDoanSetup d={d} bao={bao} tai={tai} />}
            {mucHien === 'lich-ca' && <XuongLichCaSetup d={d} bao={bao} tai={tai} />}
            {mucHien === 'quan-ly' && <XuongQuanLySetup d={d} bao={bao} tai={tai} />}
            {mucHien === 'can-xem' && <XuongCanXem xuong={d.xuong} congDoan={d.congDoan} to={d.to} bao={bao} chiXem={toTruong} />}
          </>
        )}
      </div>
    </div>
  );
}
