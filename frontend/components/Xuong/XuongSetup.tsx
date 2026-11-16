import React, { useCallback, useEffect, useState } from 'react';
import { Factory, RefreshCw, Rocket, Route, ListTree, Activity, Users, ListOrdered, Clock, ShieldCheck, AlertTriangle, BarChart3, Contact } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { xuongSetupApi, type SetupXuong, type ThongKeViTriBop } from '../../services/xuongSetupApi';
import { XuongToSetup, XuongCongDoanSetup, XuongLichCaSetup, XuongQuanLySetup, XuongCanXem } from './XuongSetupMuc';
import TrienKhaiXuong from './TrienKhaiXuong';
import TuyenMacDinhXuong from './TuyenMacDinhXuong';
import KhaiChiTietXuong from './KhaiChiTietXuong';
import TheoDoiTrienKhai from './TheoDoiTrienKhai';
import BaoCaoXuong from './BaoCaoXuong';
import NhanSuXuong from './NhanSuXuong';
import { KHO_DIEN_THOAI } from './xuongDesktopUi';

// ============================================================================
// THẺ "XƯỞNG" TRONG SETUP DỮ LIỆU (T8 — docs/designs/xuong-checkin.md).
// Mục con chia 2 nhóm: Việc (Cần xem · Khai CĐ chi tiết · Triển khai hạng mục · Theo dõi triển khai · Báo cáo) và
// Cài đặt (Tuyến mặc định · Tổ & tổ trưởng · Nhân sự · Công đoạn · Lịch ca · Quản lý xưởng).
// Quyền: admin mọi xưởng; quản lý xưởng chỉ xưởng của mình (backend kiểm lại).
// Dùng chung cho mục "Quản lý" của app Xưởng (/xuong): `trongApp` = chừa chỗ thanh điều hướng dưới, tiêu đề lớn hơn.
// Mở thẳng một mục từ thông báo / Tổng quan: tham số URL ?ql=<mục>&xuong=<mã xưởng> (đọc một lần rồi xoá).
// ============================================================================

type Muc = 'bao-cao' | 'trien-khai' | 'tuyen-mac-dinh' | 'khai-chi-tiet' | 'theo-doi' | 'to' | 'nhan-su' | 'cong-doan' | 'lich-ca' | 'quan-ly' | 'can-xem';
type Nhom = 'viec' | 'cai-dat';
const TEN_NHOM: Record<Nhom, string> = { viec: 'Việc', 'cai-dat': 'Cài đặt' };
const MUC: Array<{ id: Muc; ten: string; icon: React.ReactNode; nhom: Nhom }> = [
  { id: 'can-xem', ten: 'Cần xem', icon: <AlertTriangle size={15} />, nhom: 'viec' },
  { id: 'khai-chi-tiet', ten: 'Khai CĐ chi tiết', icon: <ListTree size={15} />, nhom: 'viec' },
  { id: 'trien-khai', ten: 'Triển khai hạng mục', icon: <Rocket size={15} />, nhom: 'viec' },
  { id: 'theo-doi', ten: 'Theo dõi triển khai', icon: <Activity size={15} />, nhom: 'viec' },
  { id: 'bao-cao', ten: 'Báo cáo', icon: <BarChart3 size={15} />, nhom: 'viec' },
  { id: 'tuyen-mac-dinh', ten: 'Tuyến mặc định', icon: <Route size={15} />, nhom: 'cai-dat' },
  { id: 'to', ten: 'Tổ & tổ trưởng', icon: <Users size={15} />, nhom: 'cai-dat' },
  { id: 'nhan-su', ten: 'Nhân sự', icon: <Contact size={15} />, nhom: 'cai-dat' },
  { id: 'cong-doan', ten: 'Công đoạn', icon: <ListOrdered size={15} />, nhom: 'cai-dat' },
  { id: 'lich-ca', ten: 'Lịch ca', icon: <Clock size={15} />, nhom: 'cai-dat' },
  { id: 'quan-ly', ten: 'Quản lý xưởng', icon: <ShieldCheck size={15} />, nhom: 'cai-dat' },
];
// Điện thoại (app Xưởng): chỉ các mục quản lý dùng tại xưởng; mục cấu hình (tổ, công đoạn, lịch ca…) để máy tính.
// Có thành phần chờ khai CĐ chi tiết thì "Khai CĐ chi tiết" lên đầu (xem dsMuc)
const MUC_DIEN_THOAI: Muc[] = ['can-xem', 'theo-doi', 'bao-cao'];
const laDienThoai = () => document.documentElement.classList.contains('dien-thoai') || window.innerWidth < 768;
const KHOA_XUONG = 'xuong_setup_xuong';
const KHOA_MUC = 'xuong_setup_muc';

/** Tham số mở thẳng mục (?ql=can-xem&xuong=F1): chỉ nhận mục có trong danh sách; điện thoại chỉ mục dùng tại xưởng */
function docThamSoUrl(trongApp: boolean): { muc: Muc | null; xuong: string | null } {
  try {
    const p = new URLSearchParams(location.search);
    const ql = p.get('ql') as Muc | null;
    const choPhep: Muc[] = trongApp && laDienThoai() ? [...MUC_DIEN_THOAI, 'khai-chi-tiet'] : MUC.map(m => m.id);
    return { muc: ql && choPhep.includes(ql) ? ql : null, xuong: p.get('xuong')?.trim() || null };
  } catch { return { muc: null, xuong: null }; }
}

/** Mục chỉ đọc dưới "Công đoạn": tên công đoạn chưa ra mã BOP (P013…P021) khi phủ vị trí MRA lên Tổng quan
 *  (GET /api/xuong/vi-tri-bop, thongKe.chuaNoi) — hạng mục chỉ có các CĐ này thì vẫn theo kiểm tay PC. */
function CongDoanChuaNoiBop({ lan }: { lan: number }) {
  const [tk, setTk] = useState<{ tat: boolean; thongKe: ThongKeViTriBop } | null>(null);
  const [loi, setLoi] = useState('');
  useEffect(() => {
    let huy = false;
    xuongSetupApi.viTriBop().then(r => {
      if (huy) return;
      if (!r.ok) { setLoi(r.message); return; }
      if ('map' in r.data) { setTk({ tat: r.data.ver === 'off', thongKe: r.data.thongKe }); setLoi(''); }
    });
    return () => { huy = true; };
  }, [lan]);
  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">Công đoạn chưa nối mã BOP</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        Tên công đoạn không suy ra được vị trí P013–P021. Hạng mục chỉ có các công đoạn này vẫn theo kiểm tay PC.
      </p>
      {loi ? <p className="mt-2 text-sm text-red-700">{loi}</p>
        : !tk ? <p className="mt-2 text-sm text-slate-400">Đang tải…</p>
        : tk.tat ? <p className="mt-2 text-sm text-slate-500">Phủ vị trí MRA đang tắt.</p>
        : (
          <>
            <p className="mt-2 text-xs text-slate-500">
              MRA cho vị trí {tk.thongKe.soHex.toLocaleString('vi-VN')} HEX · {tk.thongKe.giuPc.toLocaleString('vi-VN')} HEX xong hết công đoạn giữ PC
            </p>
            {tk.thongKe.chuaNoi.length === 0
              ? <p className="mt-2 text-sm text-emerald-700">Mọi công đoạn đều đã nối mã.</p>
              : (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {tk.thongKe.chuaNoi.map(t => <li key={t} className="rounded-md bg-amber-50 px-2 py-0.5 text-sm text-amber-800">{t}</li>)}
                </ul>
              )}
          </>
        )}
    </section>
  );
}

export default function XuongSetup({ trongApp = false }: { trongApp?: boolean }) {
  const { showToast } = useToast();
  const [tuUrl] = useState(() => docThamSoUrl(trongApp));
  const [xuong, setXuong] = useState<string | undefined>(() => tuUrl.xuong || localStorage.getItem(KHOA_XUONG) || undefined);
  const [muc, setMuc] = useState<Muc>(() => tuUrl.muc || (localStorage.getItem(KHOA_MUC) as Muc) || 'bao-cao');
  const [d, setD] = useState<SetupXuong | null>(null);
  const [loi, setLoi] = useState('');
  const [dang, setDang] = useState(true);
  // Đã đọc tham số mở thẳng => xoá khỏi URL (mở lại / tải lại không bị kéo về mục đó nữa)
  useEffect(() => {
    try {
      const u = new URL(location.href);
      if (!u.searchParams.has('ql') && !u.searchParams.has('xuong')) return;
      u.searchParams.delete('ql'); u.searchParams.delete('xuong');
      history.replaceState(history.state, '', u);
    } catch { /* bỏ qua */ }
  }, []);

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

  // Số trên mục Cần xem / Khai CĐ chi tiết: tải khi mở và khi bấm Tải lại (không tải lại sau mỗi lần lưu cấu hình)
  const [lanDem, setLanDem] = useState(0);
  const [dem, setDem] = useState<{ canXem: number; khai: number | null }>({ canXem: 0, khai: null });
  const xuongDem = d?.xuong ?? null;
  const coChoKhai = d?.choKhai !== undefined;
  useEffect(() => {
    setDem({ canXem: 0, khai: null });
    if (!xuongDem || toTruong) return;
    let huy = false;
    xuongSetupApi.tongQuan(xuongDem).then(r => { if (!huy && r.ok) setDem(x => ({ ...x, canXem: r.data.canXem ?? 0 })); });
    // Máy chủ mới trả sẵn choKhai trong setup — khỏi gọi danh sách
    if (!coChoKhai) xuongSetupApi.dsKhaiChiTiet(xuongDem).then(r => { if (!huy && r.ok) setDem(x => ({ ...x, khai: r.data.cho.length })); });
    return () => { huy = true; };
  }, [xuongDem, toTruong, coChoKhai, lanDem]);
  const soKhai = d?.choKhai?.so ?? dem.khai ?? 0;
  const soMuc: Partial<Record<Muc, number>> = { 'can-xem': dem.canXem, 'khai-chi-tiet': soKhai };

  const gon = toTruong || (dienThoai && !hienHet);
  const idDienThoai: Muc[] = !toTruong && soKhai > 0 ? ['khai-chi-tiet', ...MUC_DIEN_THOAI] : MUC_DIEN_THOAI;
  const dsMuc = gon ? MUC.filter(m => idDienThoai.includes(m.id)).sort((a, b) => idDienThoai.indexOf(a.id) - idDienThoai.indexOf(b.id)) : MUC;
  const haiNhom = dsMuc.some(m => m.nhom === 'cai-dat');
  const mucHien: Muc = dsMuc.some(m => m.id === muc) ? muc : dsMuc[0].id;
  // Điện thoại: nút / chữ ≥ 44px / 16px như phần còn lại của app
  const lon = dienThoai;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f5f6f8]">
      <div className={`flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 rmd:px-6 ${trongApp ? 'pt-[calc(env(safe-area-inset-top)+12px)]' : ''}`}>
        {/* Máy tính: tiêu đề "MRA" đã ở đầu trang => chỉ hiện ô chọn xưởng (trừ tài khoản tổ trưởng) */}
        {(trongApp || toTruong) && <Factory size={18} className={`text-slate-500 ${trongApp ? 'hidden rsm:block' : ''}`} aria-hidden />}
        {(trongApp || toTruong) && <h2 className={trongApp ? 'text-xl font-semibold text-slate-900' : 'text-base font-semibold text-slate-900'}>
          {toTruong ? `Tổ ${d!.to.map(t => t.ten).join(', ')}` : 'Quản lý xưởng'}</h2>}
        {/* Tổ trưởng 1 xưởng: không cần chọn xưởng */}
        {!(toTruong && (d?.dsXuong.length ?? 0) <= 1) && (
        <label className={`flex items-center gap-2 text-slate-600 ${trongApp ? 'text-base' : 'text-sm'}`}>
          <span className={trongApp ? 'sr-only rsm:not-sr-only' : ''}>Xưởng</span>
          <select value={xuong ?? ''} onChange={e => setXuong(e.target.value)}
            className={`rounded-md border border-slate-300 bg-white px-2 font-semibold text-slate-800 focus:border-slate-500 focus:outline-none ${lon ? 'min-h-11 text-base' : 'py-1.5 text-sm'}`}>
            {(d?.dsXuong ?? (xuong ? [xuong] : [])).map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        )}
        <nav className="order-last -mx-4 flex w-[calc(100%+2rem)] gap-1 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rmd:order-none rmd:mx-0 rmd:w-auto rmd:min-w-0 rmd:flex-1 rmd:px-0" aria-label="Mục cấu hình Xưởng">
          {dsMuc.map((m, i) => {
            const so = soMuc[m.id] ?? 0;
            // Đầu mỗi nhóm: vạch ngăn + nhãn nhỏ (chỉ khi hiện cả 2 nhóm)
            const dauNhom = haiNhom && (i === 0 || dsMuc[i - 1].nhom !== m.nhom);
            return (
              <React.Fragment key={m.id}>
                {dauNhom && i > 0 && <span className="mx-1 w-px shrink-0 self-stretch bg-slate-200" aria-hidden />}
                {dauNhom && <span className="shrink-0 self-center px-1 text-xs font-medium text-slate-400">{TEN_NHOM[m.nhom]}</span>}
                <button type="button" onClick={() => setMuc(m.id)} aria-pressed={mucHien === m.id}
                  className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 ${lon ? 'min-h-11 text-base' : 'py-1.5 text-sm'} ${mucHien === m.id ? 'bg-slate-900 font-semibold text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
                  {m.icon}{m.ten}
                  {so > 0 && <span className={`rounded-full px-1.5 text-xs font-semibold tabular-nums text-white ${m.id === 'can-xem' ? 'bg-red-600' : 'bg-amber-600'}`}>{so}</span>}
                </button>
              </React.Fragment>
            );
          })}
          {dienThoai && !toTruong && (
            <button type="button" onClick={() => setHienHet(v => !v)}
              className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg px-3 text-base text-slate-700 underline underline-offset-4">
              {hienHet ? 'Thu gọn' : 'Mục cấu hình…'}
            </button>
          )}
        </nav>
        <button type="button" onClick={() => { tai(); setLanDem(n => n + 1); }} className={`ml-auto flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 ${lon ? 'h-11 w-11' : 'p-2'}`} aria-label="Tải lại" title="Tải lại">
          <RefreshCw size={16} className={dang ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className={`min-h-0 flex-1 overflow-auto p-4 rmd:p-6 ${trongApp ? 'pb-[calc(env(safe-area-inset-bottom)+6rem)] rmd:pb-6' : ''} ${lon ? KHO_DIEN_THOAI : ''}`}>
        {loi && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{loi}</p>}
        {!d && dang && <div className="flex justify-center py-16 text-slate-400"><RefreshCw className="animate-spin" size={20} /></div>}
        {d && !d.xuong && <p className="text-sm text-slate-600">Chưa có xưởng nào trong danh mục — báo người quản trị nạp danh mục.</p>}
        {d && d.xuong && (
          <>
            {mucHien === 'bao-cao' && <BaoCaoXuong xuong={d.xuong} />}
            {mucHien === 'trien-khai' && <TrienKhaiXuong xuong={d.xuong} bao={bao} />}
            {mucHien === 'tuyen-mac-dinh' && <TuyenMacDinhXuong xuong={d.xuong} bao={bao} />}
            {mucHien === 'khai-chi-tiet' && <KhaiChiTietXuong xuong={d.xuong} bao={bao} />}
            {mucHien === 'theo-doi' && <TheoDoiTrienKhai xuong={d.xuong} />}
            {mucHien === 'to' && <XuongToSetup d={d} bao={bao} tai={tai} />}
            {mucHien === 'nhan-su' && <NhanSuXuong d={d} bao={bao} />}
            {mucHien === 'cong-doan' && <><XuongCongDoanSetup d={d} bao={bao} tai={tai} /><CongDoanChuaNoiBop lan={lanDem} /></>}
            {mucHien === 'lich-ca' && <XuongLichCaSetup d={d} bao={bao} tai={tai} />}
            {mucHien === 'quan-ly' && <XuongQuanLySetup d={d} bao={bao} tai={tai} />}
            {mucHien === 'can-xem' && <XuongCanXem xuong={d.xuong} congDoan={d.congDoan} to={d.to} bao={bao} chiXem={toTruong} />}
          </>
        )}
      </div>
    </div>
  );
}
