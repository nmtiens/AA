import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Plus, Send, Trash2, X } from 'lucide-react';
import { guiYeuCau, LoiCuaHang } from '../../services/cuaHangApi';
import { dinhDangSoLuong, tenDvt } from '../BanVatTu/xuLy';
import { AnhKhach } from './TheHang';
import { dsAnhKhach, tenKhach } from './hangKhach';
import { SoLuongChon } from './SoLuongChon';
import { BO_GOC, CHU_LUU_Y, DO_AA, LOP_LIEN_KET, VONG_FOCUS } from './kieu';
import {
  docSoLuong, dungBodyYeuCau, FORM_TRONG, kiemTraYeuCau, tenHienThi, type DongGioHien, type FormKhach, type LoiForm,
} from './xuLyCuaHang';

// ============================================================================
// Ngăn "Yêu cầu báo giá": danh sách mã + số lượng sửa được, form liên hệ (tên + SĐT bắt buộc), ô bẫy ẩn chống máy
// gửi rác, gửi => màn hình cảm ơn kèm mã yêu cầu. Điện thoại: phủ toàn màn hình, Email / Công ty gom sau nút
// "+ Thêm email / công ty"; máy tính: ngăn bên phải, hiện đủ ô.
// ============================================================================

const soGon = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 3 });

function DongSoLuong({ d, onDat }: { d: DongGioHien; onDat: (soLuong: number) => void }) {
  const [chu, setChu] = useState(soGon(d.soLuong));
  // Số trong giỏ đổi từ ngoài (thêm từ thẻ, hạ theo tồn) => cập nhật ô
  useEffect(() => { setChu(soGon(d.soLuong)); }, [d.soLuong]);
  const ton = d.hang?.soLuong ?? 0;
  const xong = () => {
    const n = docSoLuong(chu);
    if (n === null || n <= 0) setChu(soGon(d.soLuong));
    else onDat(n);
  };
  const buoc = (k: number) => {
    const n = Math.round((d.soLuong + k) * 1000) / 1000;
    if (n > 0) onDat(ton > 0 ? Math.min(ton, n) : n);
  };
  return (
    <SoLuongChon value={chu} onChange={setChu} onBlur={xong} nhan={`Số lượng ${d.hang ? tenKhach(d.hang) : d.ma}`}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
      onGiam={() => buoc(-1)} onTang={() => buoc(1)} coGiam={d.soLuong > 1} coTang={ton <= 0 || d.soLuong < ton} />
  );
}

function O({ id, nhan, batBuoc, loi, children }: { id: string; nhan: string; batBuoc?: boolean; loi?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-stone-700">
        {nhan}{batBuoc && <span className="text-rose-700" aria-hidden> *</span>}
      </label>
      {children}
      {loi && <p id={`${id}-loi`} className="mt-1 text-xs text-rose-700">{loi}</p>}
    </div>
  );
}

const lopO = (loi?: string) =>
  `w-full ${BO_GOC} border bg-white px-3 text-base text-stone-900 outline-none transition placeholder:text-stone-400 focus:ring-4 ${loi
    ? 'border-rose-500 focus:border-rose-600 focus:ring-rose-500/15' : 'border-stone-300 focus:border-stone-900 focus:ring-stone-900/10'}`;
/** Thuộc tính lỗi cho ô nhập (aria-invalid + aria-describedby trỏ dòng lỗi) */
const ariaLoi = (id: string, loi?: string) => (loi ? { 'aria-invalid': true, 'aria-describedby': `${id}-loi` } : {});

export function GioYeuCau({ gio, onDong, onDat, onXoa, onDaGui }: {
  gio: DongGioHien[];
  onDong: () => void;
  onDat: (ma: string, soLuong: number) => void;
  onXoa: (ma: string) => void;
  /** Gửi xong => xoá giỏ */
  onDaGui: () => void;
}) {
  const [f, setF] = useState<FormKhach>(FORM_TRONG);
  const [loi, setLoi] = useState<LoiForm>({});
  const [dangGui, setDangGui] = useState(false);
  const [loiGui, setLoiGui] = useState<string | null>(null);
  const [maYeuCau, setMaYeuCau] = useState<string | null>(null);
  // Điện thoại: Email / Công ty ẩn sau nút chữ; đã có giá trị / lỗi => tự mở
  const [moThem, setMoThem] = useState(false);
  const hienThem = moThem || !!(f.email || f.congTy || loi.email || loi.congTy);

  useEffect(() => {
    const phim = (e: KeyboardEvent) => { if (e.key === 'Escape') onDong(); };
    window.addEventListener('keydown', phim);
    return () => window.removeEventListener('keydown', phim);
  }, [onDong]);

  const doi = (k: keyof FormKhach) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    setF(cu => ({ ...cu, [k]: v }));
    if (loi[k as keyof LoiForm]) setLoi(cu => ({ ...cu, [k]: undefined }));
  };

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    if (dangGui) return;
    const l = kiemTraYeuCau(f, gio);
    setLoi(l);
    setLoiGui(null);
    if (Object.values(l).some(Boolean)) return;
    setDangGui(true);
    try {
      const ma = await guiYeuCau(dungBodyYeuCau(f, gio));
      setMaYeuCau(ma || '—');
      onDaGui();
    } catch (err) {
      setLoiGui(err instanceof LoiCuaHang ? err.message : 'Không gửi được, vui lòng thử lại');
    } finally {
      setDangGui(false);
    }
  };

  const conHang = gio.filter(d => !d.hetHang);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-stone-950/50 backdrop-blur-[2px]" role="dialog" aria-modal="true"
      aria-label="Yêu cầu báo giá" onClick={onDong}>
      <aside className="flex h-[100dvh] w-full flex-col bg-white shadow-2xl sm:max-w-md" onClick={e => e.stopPropagation()}>
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-stone-200 px-4 sm:px-5">
          <div>
            <h2 className="text-base font-semibold leading-5 text-stone-900">Yêu cầu báo giá</h2>
            {!maYeuCau && <p className="text-[13px] leading-[18px] text-stone-500">{conHang.length} mã vật tư</p>}
          </div>
          <button type="button" onClick={onDong} aria-label="Đóng" className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100 ${VONG_FOCUS}`}>
            <X size={18} />
          </button>
        </header>

        {maYeuCau ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <CheckCircle2 size={52} strokeWidth={1.25} style={{ color: DO_AA }} aria-hidden />
            <div>
              <h3 className="text-lg font-semibold text-stone-900">Đã gửi yêu cầu. Cảm ơn quý khách!</h3>
              <p className="mt-2 text-sm text-stone-600">Nhân viên AA Corporation sẽ gọi lại để xác nhận số lượng và báo giá.</p>
            </div>
            <div className={`${BO_GOC} border border-stone-200 bg-stone-50 px-6 py-4`}>
              <p className="text-xs text-stone-600">Mã yêu cầu của quý khách</p>
              <p className="mt-1 font-sans text-xl font-semibold tabular-nums tracking-wide text-stone-900">{maYeuCau}</p>
            </div>
            <button type="button" onClick={onDong} className={`inline-flex h-11 items-center ${BO_GOC} bg-stone-900 px-5 text-sm font-semibold text-white hover:bg-stone-700 ${VONG_FOCUS}`}>
              Tiếp tục xem vật tư
            </button>
          </div>
        ) : (
          <form onSubmit={gui} noValidate className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4 sm:px-5">
              {gio.length === 0 ? (
                <div className={`${BO_GOC} bg-stone-50 p-6 text-center text-sm text-stone-600`}>
                  <p>Chưa có vật tư trong yêu cầu.</p>
                  <button type="button" onClick={onDong} className={`mt-2 ${BO_GOC} px-1 text-sm ${LOP_LIEN_KET} ${VONG_FOCUS}`}>Xem vật tư</button>
                </div>
              ) : (
                <ul className={`divide-y divide-stone-100 ${BO_GOC} border border-stone-200`}>
                  {gio.map(d => (
                    <li key={d.ma} className={`flex gap-3 p-3 ${d.hetHang ? 'bg-stone-50' : ''}`}>
                      <div className={`relative h-14 w-14 shrink-0 overflow-hidden ${BO_GOC} bg-[#F3EEE6] after:pointer-events-none after:absolute after:inset-0 after:ring-1 after:ring-inset after:ring-black/5`}>
                        {d.hang
                          ? <AnhKhach nguon={dsAnhKhach(d.hang)} ten={tenKhach(d.hang)} fit="tu_dong" viTri="50% 100%" className="h-full w-full" lopCat="origin-bottom scale-[1.15]" boAnhDet />
                          : <div className="h-full w-full bg-stone-200" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium leading-snug text-stone-900" title={d.hang ? `${tenHienThi(d.hang.ten)} · Mã ${d.ma}` : undefined}>{d.hang ? tenKhach(d.hang) : d.ma}</p>
                        {d.hetHang || !d.hang ? (
                          <p className={`mt-1 text-[13px] ${CHU_LUU_Y}`}>Mã này không còn chào bán — sẽ không gửi</p>
                        ) : (
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-stone-500">
                            {/* Bộ chọn − ô + và đơn vị liền nhau (không để đơn vị rơi xuống dòng riêng) */}
                            <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-stone-700">
                              <DongSoLuong d={d} onDat={n => onDat(d.ma, n)} />
                              {tenDvt(d.hang.dvt)}
                            </span>
                            <span className="whitespace-nowrap">Còn {dinhDangSoLuong(d.hang.soLuong, d.hang.dvt)}</span>
                            {d.daHa && <span className={`w-full ${CHU_LUU_Y}`}>Đã giảm theo số lượng còn</span>}
                          </div>
                        )}
                      </div>
                      <button type="button" onClick={() => onXoa(d.ma)} aria-label={`Bỏ ${d.hang ? tenKhach(d.hang) : d.ma}`}
                        className={`-mr-1 -mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center self-start ${BO_GOC} text-stone-500 transition-colors hover:bg-rose-50 hover:text-rose-700 ${VONG_FOCUS}`}>
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {loi.gio && <p className="text-sm text-rose-700" role="alert">{loi.gio}</p>}

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-stone-900">Thông tin liên hệ</h3>
                <O id="kh-ten" nhan="Họ tên" batBuoc loi={loi.ten}>
                  <input id="kh-ten" value={f.ten} onChange={doi('ten')} maxLength={100} autoComplete="name" className={`h-11 ${lopO(loi.ten)}`} {...ariaLoi('kh-ten', loi.ten)} />
                </O>
                <O id="kh-sdt" nhan="Số điện thoại" batBuoc loi={loi.sdt}>
                  <input id="kh-sdt" type="tel" inputMode="tel" value={f.sdt} onChange={doi('sdt')} maxLength={20} autoComplete="tel"
                    placeholder="0912 345 678" className={`h-11 ${lopO(loi.sdt)}`} {...ariaLoi('kh-sdt', loi.sdt)} />
                </O>
                {!hienThem && (
                  <button type="button" onClick={() => setMoThem(true)}
                    className={`inline-flex h-10 items-center gap-1.5 ${BO_GOC} text-sm font-medium text-stone-700 hover:text-stone-900 sm:hidden ${VONG_FOCUS}`}>
                    <Plus size={15} aria-hidden /> Thêm email / công ty
                  </button>
                )}
                <div className={`space-y-3 ${hienThem ? '' : 'hidden sm:block'}`}>
                  <O id="kh-email" nhan="Email" loi={loi.email}>
                    <input id="kh-email" type="email" inputMode="email" value={f.email} onChange={doi('email')} maxLength={200} autoComplete="email" className={`h-11 ${lopO(loi.email)}`} {...ariaLoi('kh-email', loi.email)} />
                  </O>
                  <O id="kh-cty" nhan="Công ty" loi={loi.congTy}>
                    <input id="kh-cty" value={f.congTy} onChange={doi('congTy')} maxLength={200} autoComplete="organization" className={`h-11 ${lopO(loi.congTy)}`} {...ariaLoi('kh-cty', loi.congTy)} />
                  </O>
                </div>
                <O id="kh-ghichu" nhan="Ghi chú" loi={loi.ghiChu}>
                  <textarea id="kh-ghichu" value={f.ghiChu} onChange={doi('ghiChu')} maxLength={1000} rows={2}
                    placeholder="Thời gian cần hàng, địa chỉ giao, yêu cầu khác…" className={`py-2.5 sm:min-h-[6.5rem] ${lopO(loi.ghiChu)}`} {...ariaLoi('kh-ghichu', loi.ghiChu)} />
                </O>
                {/* Ô bẫy: người thật không thấy, máy gửi rác hay điền => máy chủ bỏ qua */}
                <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                  <label htmlFor="kh-web">Website</label>
                  <input id="kh-web" name="web" tabIndex={-1} autoComplete="off" value={f.web} onChange={doi('web')} />
                </div>
              </div>
            </div>

            <footer className="space-y-2 border-t border-stone-200 bg-white px-4 pt-3 sm:px-5" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              {loiGui && (
                <p className={`flex items-start gap-1.5 ${BO_GOC} bg-rose-50 px-3 py-2 text-sm text-rose-700`} role="alert">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {loiGui}
                </p>
              )}
              <button type="submit" disabled={dangGui || conHang.length === 0}
                className={`inline-flex h-12 w-full items-center justify-center gap-2 ${BO_GOC} bg-stone-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500 ${VONG_FOCUS}`}>
                {dangGui ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {dangGui ? 'Đang gửi…' : 'Gửi yêu cầu báo giá'}
              </button>
              <p className="text-center text-xs text-stone-500">Chúng tôi chỉ dùng thông tin này để liên hệ báo giá.</p>
            </footer>
          </form>
        )}
      </aside>
    </div>
  );
}
