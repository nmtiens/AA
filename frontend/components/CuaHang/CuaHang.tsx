import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, CloudOff, LayoutGrid, MapPin, PackageSearch, RefreshCw, Search, ShoppingBag, X } from 'lucide-react';
import { layDanhSachKhach, LoiCuaHang, type HangKhach } from '../../services/cuaHangApi';
import { ChiTietHang } from './ChiTietHang';
import { GioYeuCau } from './GioYeuCau';
import { BO_GOC, BO_GOC_LON, CHU_DO_AA, DO_AA, LOP_LIEN_KET, NEN_DO_AA, VONG_FOCUS, VONG_FOCUS_TOI } from './kieu';
import { useDongBangNutBack } from './nutBack';
import { AnhKhach, TheHang } from './TheHang';
import { dsAnhKhach } from './hangKhach';
import {
  BUOC_MUA_GON, cachXepCo, chuanBiHang, datSoLuong, demChungLoai, demNhomMau, demTheoLoai, docGio, docHashCuaHang, docSoTrang, dsNutTrang,
  gioHien, KHOA_GIO, khoaLoai, locHang, locThem, MA_MOI_TRANG, NHAN_XEP_KHACH, soTrang, taoHashCuaHang, tenChungLoai, tenLoaiGon, themVaoGio,
  timNhomMau, TOI_DA_DONG_GIO, xepHang, xoaKhoiGio, type CachXepKhach, type DongGio, type NhomMau,
} from './xuLyCuaHang';

// ============================================================================
// TRANG KHÁCH "VẬT TƯ THANH LÝ & TỒN KHO" — /#/cua-hang, CÔNG KHAI (không đăng nhập, không dùng AuthContext).
// Chỉ hiện mã admin đã đăng (máy chủ lọc). Khách tìm / lọc theo loại / xếp, xem chi tiết, gom mã vào "Yêu cầu báo giá"
// (giỏ lưu localStorage), gửi tên + SĐT => nhân viên gọi lại. Lưới chia trang (MA_MOI_TRANG mã / trang).
// Bố cục: đầu trang dính (thương hiệu + ô tìm + giỏ) · (≥ lg) khối danh mục màu than bên trái + lưới · (< lg) chip loại
// cuộn ngang · chân trang tối gọn. Giỏ: nút ở đầu trang, thông báo "Đã thêm" có nút "Xem". Không có nút giỏ nổi.
// Điện thoại: đầu trang 1 hàng 56px — ô tìm mở bằng nút kính lúp (thay chỗ thương hiệu), không chiếm thêm hàng.
// ============================================================================

const docGioDaLuu = (): DongGio[] => {
  try { return docGio(localStorage.getItem(KHOA_GIO)); } catch { return []; }
};
const luuGio = (gio: DongGio[]) => {
  try {
    if (gio.length) localStorage.setItem(KHOA_GIO, JSON.stringify(gio));
    else localStorage.removeItem(KHOA_GIO);
  } catch { /* chế độ riêng tư / bộ nhớ đầy: giỏ chỉ sống trong phiên này */ }
};

const so = (n: number) => n.toLocaleString('vi-VN');
const KHUNG = 'mx-auto w-full max-w-[1920px] px-4 sm:px-6 2xl:px-10';

type TrangThai = { loai: 'dang_tai' } | { loai: 'loi'; thongBao: string } | { loai: 'xong' };

export default function CuaHang() {
  const [trangThai, setTrangThai] = useState<TrangThai>({ loai: 'dang_tai' });
  const [items, setItems] = useState<HangKhach[]>([]);
  const [lanTai, setLanTai] = useState(0);

  const [tim, setTim] = useState('');
  const timHoan = useDeferredValue(tim);
  const [loai, setLoai] = useState('');
  // Thanh lọc ngang (16/11/2026): khoá chủng loại (theo loại đang chọn) + id nhóm màu; '' = tất cả
  const [chungLoai, setChungLoai] = useState('');
  const [mau, setMau] = useState('');
  const [xep, setXep] = useState<CachXepKhach>('moi');
  const [trang, setTrang] = useState(1);
  // Loại + bộ lọc + trang đọc từ địa chỉ lúc mở (#/cua-hang?loai=da&cl=dda&mau=xam&trang=2) — áp khi danh sách tải xong
  const urlDau = useRef(docHashCuaHang(window.location.hash));
  const daApUrl = useRef(false);
  const boQuaVeTrang1 = useRef(false);

  const [gio, setGio] = useState<DongGio[]>(docGioDaLuu);
  const [moGio, setMoGio] = useState(false);
  const [chiTiet, setChiTiet] = useState<HangKhach | null>(null);
  const [thongBao, setThongBao] = useState<string | null>(null);
  const hetGioThongBao = useRef<ReturnType<typeof setTimeout>>();
  const khungRef = useRef<HTMLDivElement>(null);
  const dauTrangRef = useRef<HTMLElement>(null);
  const noiDungRef = useRef<HTMLDivElement>(null);
  const [moTimDT, setMoTimDT] = useState(false);
  const [thongBaoXem, setThongBaoXem] = useState(false);

  // Tiêu đề tab riêng cho trang khách (trả lại khi rời trang)
  useEffect(() => {
    const cu = document.title;
    document.title = 'Vật tư thanh lý & tồn kho — AA Corporation';
    return () => { document.title = cu; };
  }, []);

  useEffect(() => {
    const huy = new AbortController();
    setTrangThai({ loai: 'dang_tai' });
    layDanhSachKhach(huy.signal)
      .then(kq => { setItems(kq.items); setTrangThai({ loai: 'xong' }); })
      .catch(e => {
        if (huy.signal.aborted) return;
        setTrangThai({ loai: 'loi', thongBao: e instanceof LoiCuaHang ? e.message : 'Không tải được danh sách vật tư' });
      });
    return () => huy.abort();
  }, [lanTai]);

  useEffect(() => { luuGio(gio); }, [gio]);
  // Tab khác sửa giỏ => đồng bộ
  useEffect(() => {
    const nghe = (e: StorageEvent) => { if (e.key === KHOA_GIO) setGio(docGio(e.newValue)); };
    window.addEventListener('storage', nghe);
    return () => window.removeEventListener('storage', nghe);
  }, []);
  useEffect(() => () => clearTimeout(hetGioThongBao.current), []);

  const bao = useCallback((s: string, xem = false) => {
    setThongBao(s);
    setThongBaoXem(xem);
    clearTimeout(hetGioThongBao.current);
    hetGioThongBao.current = setTimeout(() => setThongBao(null), 2600);
  }, []);

  // Lọc: tìm => loại => chủng loại + màu => xếp. Số đếm mỗi loại tính trên tập đã qua ô tìm + màu; số đếm chủng loại /
  // màu tính trên loại đang chọn và bộ lọc còn lại (chọn màu thì đếm chủng loại có màu đó và ngược lại).
  const tatCa = useMemo(() => chuanBiHang(items), [items]);
  const theoMa = useMemo(() => new Map(items.map(h => [h.ma, h])), [items]);
  const theoTim = useMemo(() => locHang(tatCa, timHoan, ''), [tatCa, timHoan]);
  const loaiTatCa = useMemo(() => demTheoLoai(tatCa), [tatCa]);
  // Ảnh đại diện mỗi loại cho menu: mã có ảnh đầu tiên của loại (thứ tự máy chủ = mới đăng)
  const anhLoai = useMemo(() => {
    const m = new Map<string, HangKhach>();
    for (const h of items) if (!m.has(h.loai) && dsAnhKhach(h).length) m.set(h.loai, h);
    return m;
  }, [items]);
  const theoMau = useMemo(() => locThem(theoTim, '', mau), [theoTim, mau]);
  const chipLoai = useMemo(() => {
    const dem = new Map(demTheoLoai(theoMau).map(c => [c.loai, c.dem]));
    const ds = loaiTatCa.map(c => ({ loai: c.loai, dem: dem.get(c.loai) ?? 0 }));
    // Loại đang chọn không còn trong danh sách (tải lại) => vẫn hiện để bỏ chọn
    if (loai && !ds.some(c => c.loai === loai)) ds.push({ loai, dem: 0 });
    return ds;
  }, [theoMau, loaiTatCa, loai]);
  // Chưa mã nào có giá (mọi mã "Liên hệ") => không có cách xếp theo giá; đang xếp theo giá (giá vừa bị gỡ) => Mới đăng
  const coGia = useMemo(() => items.some(h => h.giaBanVnd !== null), [items]);
  const dsXep = useMemo(() => cachXepCo(coGia), [coGia]);
  const xepDung = dsXep.includes(xep) ? xep : 'moi';
  const theoLoai = useMemo(() => (loai ? theoTim.filter(h => h.loai === loai) : theoTim), [theoTim, loai]);
  const dsChungLoai = useMemo(() => {
    const ds = demChungLoai(locThem(theoLoai, '', mau));
    // Đang chọn mà hết mã (đổi màu / tìm) => vẫn hiện để bỏ chọn
    if (chungLoai && !ds.some(c => c.khoa === chungLoai)) {
      const h = tatCa.find(x => x.khoaCL === chungLoai);
      ds.push({ khoa: chungLoai, ten: h ? tenChungLoai(h.thuocTinh.chungLoai ?? '') : chungLoai, dem: 0 });
    }
    return ds;
  }, [theoLoai, mau, chungLoai, tatCa]);
  const dsMau = useMemo(() => {
    const kq = demNhomMau(locThem(theoLoai, chungLoai, ''));
    const n = timNhomMau(mau);
    if (n && !kq.nhom.some(x => x.id === mau)) kq.nhom = [...kq.nhom, { ...n, dem: 0 }];
    return kq;
  }, [theoLoai, chungLoai, mau]);
  const daLoc = useMemo(() => xepHang(locThem(theoLoai, chungLoai, mau), xepDung), [theoLoai, chungLoai, mau, xepDung]);
  const coLocThem = !!(chungLoai || mau);

  const gioDayDu = useMemo(() => gioHien(gio, theoMa), [gio, theoMa]);
  const slTheoMa = useMemo(() => new Map(gio.map(d => [d.ma, d.soLuong])), [gio]);
  const soTrongGio = trangThai.loai === 'xong' ? gioDayDu.filter(d => !d.hetHang).length : gio.length;

  const xoaLoc = useCallback(() => { setTim(''); setLoai(''); setChungLoai(''); setMau(''); }, []);
  const datLaiLoc = useCallback(() => { setChungLoai(''); setMau(''); }, []);
  // Đổi loại => bỏ chủng loại (chủng loại thuộc loại cũ); màu giữ nguyên
  const chonLoai = useCallback((l: string) => { setLoai(l); setChungLoai(''); }, []);

  /**
   * Cuộn về đầu vùng hàng (điện thoại: hàng chip loại; máy tính: thanh công cụ) ngay dưới đầu trang dính — chỉ khi đang
   * ở dưới điểm đó (đang ở đầu trang thì không kéo đi).
   */
  const cuonVeLuoi = useCallback(() => {
    const khung = khungRef.current;
    const dich = noiDungRef.current;
    if (!khung || !dich) return;
    const cao = dauTrangRef.current?.offsetHeight ?? 64;
    const top = dich.getBoundingClientRect().top - khung.getBoundingClientRect().top + khung.scrollTop - cao - 8;
    if (khung.scrollTop > top) khung.scrollTo({ top: Math.max(0, top) });
  }, []);

  // Đổi bộ lọc => về trang 1, đưa đầu lưới vào tầm nhìn
  const lanDau = useRef(true);
  useEffect(() => {
    // Loại vừa áp từ địa chỉ trang (kèm trang trên địa chỉ) => không về trang 1, không cuộn
    if (boQuaVeTrang1.current) { boQuaVeTrang1.current = false; return; }
    setTrang(1);
    if (lanDau.current) { lanDau.current = false; return; }
    cuonVeLuoi();
  }, [timHoan, loai, chungLoai, mau, xepDung, cuonVeLuoi]);

  // Danh sách tải xong lần đầu => áp loại + trang trên địa chỉ (khoá loại lạ => bỏ qua, xem tất cả)
  useEffect(() => {
    if (trangThai.loai !== 'xong' || daApUrl.current) return;
    daApUrl.current = true;
    const { loai: khoa, chungLoai: cl, mau: m, trang: t } = urlDau.current;
    const tim = khoa ? loaiTatCa.find(c => khoaLoai(c.loai) === khoa) : undefined;
    const coCL = !!cl && tatCa.some(h => h.khoaCL === cl && (!tim || h.loai === tim.loai));
    const coMau = !!timNhomMau(m);
    if (tim || coCL || coMau) boQuaVeTrang1.current = true;
    if (tim) setLoai(tim.loai);
    if (coCL) setChungLoai(cl);
    if (coMau) setMau(m);
    if (t > 1) setTrang(t);
  }, [trangThai.loai, loaiTatCa, tatCa]);

  const tongTrang = soTrang(daLoc.length);
  const trangHien = Math.min(trang, tongTrang); // danh sách co lại (tải lại) => không đứng ở trang rỗng

  // Ghi loại + trang đang xem lên địa chỉ (gửi link / tải lại vẫn đúng chỗ). replaceState: không thêm mục lịch sử,
  // không phát hashchange. Chỉ khi không có cửa sổ mở (nút Back của cửa sổ đang giữ 1 mục lịch sử riêng).
  useEffect(() => {
    if (trangThai.loai !== 'xong' || !daApUrl.current || chiTiet || moGio) return;
    const hash = taoHashCuaHang(loai, trangHien, { chungLoai, mau });
    if (!/^#\/cua-hang(\?|$)/.test(window.location.hash) || window.location.hash === hash) return;
    try { window.history.replaceState(window.history.state, '', hash); } catch { /* trình duyệt chặn: bỏ qua */ }
  }, [trangThai.loai, loai, chungLoai, mau, trangHien, chiTiet, moGio]);
  const denTrang = useCallback((n: number) => {
    setTrang(n);
    // Về đầu lưới (ngay dưới đầu trang dính), không về đỉnh trang
    cuonVeLuoi();
  }, [cuonVeLuoi]);

  // Giỏ mới nhất cho hàm thêm (không đưa gio vào deps => thẻ không vẽ lại mỗi lần thêm)
  const gioRef = useRef(gio);
  gioRef.current = gio;
  const them = useCallback((h: HangKhach, soLuong: number) => {
    const kq = themVaoGio(gioRef.current, h.ma, soLuong, h.soLuong);
    if (kq.day) { bao(`Mỗi yêu cầu tối đa ${TOI_DA_DONG_GIO} mã — vui lòng gửi yêu cầu này trước`); return; }
    gioRef.current = kq.gio;
    setGio(kq.gio);
    bao('Đã thêm vào yêu cầu báo giá', true);
  }, [bao]);
  const themTuThe = useCallback((h: HangKhach) => them(h, Math.min(1, h.soLuong)), [them]);
  const moChiTiet = useCallback((h: HangKhach) => setChiTiet(h), []);
  const dongChiTiet = useCallback(() => setChiTiet(null), []);
  const dongGio = useCallback(() => setMoGio(false), []);
  // Nút Back (Android / trình duyệt) đóng cửa sổ chi tiết / giỏ thay vì rời trang
  useDongBangNutBack(!!chiTiet, dongChiTiet, 'cuaHangChiTiet');
  useDongBangNutBack(moGio, dongGio, 'cuaHangGio');

  // Phím "/" => nhảy vào ô tìm (máy tính)
  useEffect(() => {
    const phim = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || chiTiet || moGio) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const o = [...document.querySelectorAll<HTMLInputElement>('input[data-o-tim]')].find(x => x.offsetParent !== null);
      if (!o) return;
      e.preventDefault();
      o.focus();
    };
    window.addEventListener('keydown', phim);
    return () => window.removeEventListener('keydown', phim);
  }, [chiTiet, moGio]);

  const tu = (trangHien - 1) * MA_MOI_TRANG;
  const hien = daLoc.slice(tu, tu + MA_MOI_TRANG);

  // Pill chỉ cho từ khoá tìm (loại đang chọn đã thể hiện ở khối danh mục / chip loại)
  const tuKhoa = tim.trim();

  // Hàng chip cuộn ngang (điện thoại): luôn đưa chip loại đang chọn vào giữa tầm nhìn (vào lại trang vẫn thấy đang lọc gì)
  const hangChipRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const hang = hangChipRef.current;
    const chip = hang?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!hang || !chip || hang.clientWidth === 0) return;
    hang.scrollTo({ left: Math.max(0, chip.offsetLeft - (hang.clientWidth - chip.offsetWidth) / 2) });
  }, [loai, trangThai.loai]);

  return (
    // Trang tự cuộn trong khung riêng (body của app bị overflow:hidden); mở cửa sổ => khoá cuộn nền
    <div ref={khungRef} className={`fixed inset-0 overscroll-contain bg-[#ECE5DA] font-sans text-[14px] leading-5 text-stone-900 antialiased ${chiTiet || moGio ? 'overflow-hidden' : 'overflow-y-auto'}`}>
      {/* ============ ĐẦU TRANG ============ */}
      <header ref={dauTrangRef} className="sticky top-0 z-30 border-b border-[#DDD3C4] bg-[#FAF7F2] shadow-[0_1px_0_rgba(28,25,23,.03),0_8px_20px_-16px_rgba(28,25,23,.35)]">
        <div className={`${KHUNG} flex h-[56px] items-center gap-2 md:h-16 md:gap-6`}>
          {/* Điện thoại đang tìm: ô tìm thay chỗ logo + giỏ, nút Huỷ — đầu trang vẫn 1 hàng 56px */}
          {moTimDT && (
            <div className="flex min-w-0 flex-1 items-center gap-1 md:hidden">
              <div className="min-w-0 flex-1"><OTim tim={tim} setTim={setTim} tuFocus placeholder="Tìm theo tên, mã, màu sắc…" /></div>
              <button type="button" onClick={() => { setTim(''); setMoTimDT(false); }}
                className={`inline-flex h-10 shrink-0 items-center ${BO_GOC} px-2.5 text-[15px] font-medium text-stone-700 hover:bg-stone-100 ${VONG_FOCUS}`}>
                Huỷ
              </button>
            </div>
          )}
          <a href="#/cua-hang" className={`${moTimDT ? 'hidden md:flex' : 'flex'} min-w-0 items-center gap-2.5 ${BO_GOC} ${VONG_FOCUS}`}
            onClick={e => { e.preventDefault(); khungRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            {/* Logo đầy đủ (biểu tượng + AA Corporation + Interior Solutions, Since 1989) — bản ngang cho vừa đầu trang 1 hàng */}
            <img src="/logo-aa-ngang.png" alt="AA Corporation — Interior Solutions, Since 1989" className="h-10 w-auto shrink-0 object-contain md:h-11" draggable={false} />
          </a>
          <div className="hidden min-w-0 flex-1 justify-center md:flex">
            <div className="w-full max-w-[480px]"><OTim tim={tim} setTim={setTim} placeholder="Tìm tên, mã, màu, quy cách, thương hiệu…" /></div>
          </div>
          <div className={`${moTimDT ? 'hidden md:flex' : 'flex'} ml-auto shrink-0 items-center gap-1 md:ml-0`}>
            <button type="button" onClick={() => setMoTimDT(true)} aria-label="Tìm vật tư"
              className={`relative inline-flex h-10 w-10 items-center justify-center ${BO_GOC} text-stone-800 hover:bg-stone-100 md:hidden ${VONG_FOCUS}`}>
              <Search size={20} />
              {tim.trim() && <span aria-hidden style={{ background: DO_AA }} className="absolute right-2 top-2 h-2 w-2 rounded-full" />}
            </button>
            <button type="button" onClick={() => setMoGio(true)}
              aria-label={`Yêu cầu báo giá${soTrongGio ? ` (${soTrongGio} mã)` : ''}`}
              className={`relative inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 ${BO_GOC} bg-stone-900 text-[15px] font-semibold text-white shadow-[0_6px_16px_-8px_rgba(28,25,23,.6)] transition hover:bg-stone-700 md:w-auto md:px-4 ${VONG_FOCUS}`}>
              <ShoppingBag size={20} className="shrink-0 md:h-[18px] md:w-[18px]" />
              <span className="hidden whitespace-nowrap md:inline">Yêu cầu báo giá</span>
              {soTrongGio > 0 && (
                <span aria-hidden style={{ background: DO_AA }}
                  className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[12px] font-semibold tabular-nums text-white ring-2 ring-[#FAF7F2] md:static md:ml-0.5 md:ring-0">
                  {soTrongGio}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Không có dải giới thiệu (người dùng 15/11/2026) — tiêu đề trang chỉ cho trình đọc màn hình */}
      <h1 className="sr-only">Vật tư thanh lý & tồn kho — AA Corporation</h1>

      <main className={`${KHUNG} min-h-[100dvh] pb-16 pt-4 md:pt-5`}>
        {trangThai.loai === 'dang_tai' && <KhungCho />}

        {trangThai.loai === 'loi' && (
          <div className="mx-auto mt-10 flex max-w-sm flex-col items-center text-center">
            <CloudOff size={40} className="text-stone-400" aria-hidden />
            <h2 className="mt-4 text-base font-semibold text-stone-900">Chưa tải được danh sách</h2>
            <p className="mt-1.5 text-sm text-stone-600">{trangThai.thongBao}</p>
            <button type="button" onClick={() => setLanTai(n => n + 1)}
              className={`mt-5 inline-flex h-10 items-center gap-2 ${BO_GOC} bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-700 ${VONG_FOCUS}`}>
              <RefreshCw size={15} /> Tải lại
            </button>
          </div>
        )}

        {trangThai.loai === 'xong' && (
          <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-8">
            {/* ============ KHỐI DANH MỤC (≥ lg): khối màu than gọn, dính khi cuộn ============ */}
            <aside aria-label="Danh mục vật tư" className="hidden self-start lg:sticky lg:top-20 lg:block">
              <div className="max-h-[calc(100dvh-6rem)] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <DanhMuc>
                  <DongLoc chon={loai === ''} onClick={() => chonLoai('')} nhan="Tất cả" dem={theoMau.length}
                    o={<LayoutGrid size={20} className="absolute inset-0 m-auto text-white" aria-hidden />} />
                  {chipLoai.map(c => {
                    const mau = anhLoai.get(c.loai);
                    const nhan = tenLoaiGon(c.loai);
                    return (
                      <DongLoc key={c.loai} chon={loai === c.loai} onClick={() => chonLoai(loai === c.loai ? '' : c.loai)} nhan={nhan} dem={c.dem}
                        o={mau
                          ? <AnhKhach nguon={dsAnhKhach(mau)} ten={nhan} className="h-full w-full" boAnhDet lopCat="scale-[1.6] transition-transform duration-300 group-hover:scale-[1.75]" />
                          : <span className="absolute inset-0 flex items-center justify-center pl-[0.15em] text-[12px] font-medium tracking-[0.15em] text-stone-300">{nhan.slice(0, 2).toUpperCase()}</span>} />
                    );
                  })}
                </DanhMuc>
              </div>
            </aside>

            <div ref={noiDungRef} className="min-w-0">
              {/* ============ CHIP LOẠI (< lg): 1 hàng chip cuộn ngang ============ */}
              <div ref={hangChipRef} className="-mx-4 mb-3 overflow-x-auto scroll-px-4 px-4 [mask-image:linear-gradient(to_right,transparent,#000_16px,#000_calc(100%-16px),transparent)] [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:hidden [&::-webkit-scrollbar]:hidden">
                <div className="flex w-max gap-2 py-1">
                  <Chip chon={loai === ''} onClick={() => chonLoai('')} nhan="Tất cả" dem={theoMau.length} />
                  {chipLoai.map(c => (
                    <Chip key={c.loai} chon={loai === c.loai} onClick={() => chonLoai(loai === c.loai ? '' : c.loai)} nhan={tenLoaiGon(c.loai)} dem={c.dem} />
                  ))}
                </div>
              </div>

              {/* ============ THANH LỌC (< md): 2 ô chọn nhỏ cạnh nhau dưới hàng chip loại ============ */}
              <ThanhLoc lop="mb-2 flex md:hidden" dsChungLoai={dsChungLoai} chungLoai={chungLoai} setChungLoai={setChungLoai}
                dsMau={dsMau} mau={mau} setMau={setMau} coLoc={coLocThem} onDatLai={datLaiLoc} />

              {/* ============ THANH CÔNG CỤ: số mã · (≥ md) thanh lọc + sắp xếp; hàng dưới: từ khoá đang tìm (bấm × để bỏ) ============ */}
              <div className="mb-3 md:mb-4">
                <div className="flex items-center justify-between gap-3 text-[13px] leading-[18px]">
                  <p aria-live="polite" className="min-w-0 truncate text-stone-600">
                    <b className="font-semibold tabular-nums text-stone-900">{so(daLoc.length)}</b> mã
                    {loai && <> {tenLoaiGon(loai).toLocaleLowerCase('vi')}</>}
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    <ThanhLoc lop="hidden md:flex" dsChungLoai={dsChungLoai} chungLoai={chungLoai} setChungLoai={setChungLoai}
                      dsMau={dsMau} mau={mau} setMau={setMau} coLoc={coLocThem} onDatLai={datLaiLoc} />
                    <span aria-hidden className="mx-1 hidden h-5 w-px bg-stone-300 md:block" />
                    <ChonXep xep={xepDung} setXep={setXep} ds={dsXep} />
                  </div>
                </div>
                {tuKhoa && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex h-8 max-w-[16rem] items-center gap-0.5 ${BO_GOC} border border-stone-300 bg-white pl-3 text-[13px] font-medium text-stone-800`}>
                      <span className="truncate">“{tuKhoa}”</span>
                      <button type="button" onClick={() => setTim('')} aria-label={`Bỏ tìm “${tuKhoa}”`}
                        className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center ${BO_GOC} text-stone-500 hover:text-stone-900 before:absolute before:-inset-1 ${VONG_FOCUS}`}>
                        <X size={14} />
                      </button>
                    </span>
                    {(loai || coLocThem) && (
                      <button type="button" onClick={xoaLoc} className={`${BO_GOC} px-1 text-[13px] ${LOP_LIEN_KET} ${VONG_FOCUS}`}>Xoá tất cả</button>
                    )}
                  </div>
                )}
              </div>

              {daLoc.length === 0 ? (
                <div className="mx-auto mt-10 flex max-w-sm flex-col items-center text-center">
                  <PackageSearch size={40} className="text-stone-300" aria-hidden />
                  {items.length === 0 ? (
                    <p className="mt-4 text-sm text-stone-600">Hiện chưa có vật tư nào đang chào bán. Vui lòng quay lại sau.</p>
                  ) : (
                    <>
                      <h2 className="mt-4 text-base font-semibold text-stone-900">Không có mã phù hợp</h2>
                      <p className="mt-1.5 text-sm text-stone-600">
                        {[tuKhoa && `“${tuKhoa}”`, [loai && tenLoaiGon(loai), dsChungLoai.find(c => c.khoa === chungLoai)?.ten,
                          timNhomMau(mau)?.ten.toLocaleLowerCase('vi')].filter(Boolean).join(' · ')].filter(Boolean).join(' trong ')}
                      </p>
                      <button type="button" onClick={xoaLoc}
                        className={`mt-5 inline-flex h-10 items-center ${BO_GOC} border border-stone-300 bg-white px-4 text-sm font-medium text-stone-900 hover:bg-stone-50 ${VONG_FOCUS}`}>
                        Xoá bộ lọc
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                  {hien.map(h => (
                    <TheHang key={h.ma} h={h} slTrongGio={slTheoMa.get(h.ma) ?? 0} onMo={moChiTiet} onThem={themTuThe} />
                  ))}
                </div>
              )}
              {daLoc.length > 0 && <PhanTrang trang={trangHien} tongTrang={tongTrang} tong={daLoc.length} onDen={denTrang} />}
            </div>
          </div>
        )}
      </main>

      <ChanTrang />

      {thongBao && !moGio && (
        <div role="status"
          className={`fixed inset-x-4 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-[60] mx-auto flex w-fit max-w-[min(90vw,32rem)] items-center gap-2.5 ${BO_GOC} bg-stone-900 px-4 py-2.5 text-sm text-white shadow-lg`}>
          <Check size={16} className="shrink-0 text-white" aria-hidden />
          <span className="min-w-0">{thongBao}</span>
          {thongBaoXem && (
            <button type="button" onClick={() => { setThongBao(null); setMoGio(true); }}
              className="-my-1 ml-1 shrink-0 rounded px-2 py-1 text-sm font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              Xem
            </button>
          )}
        </div>
      )}

      {chiTiet && (
        <ChiTietHang key={chiTiet.ma} h={chiTiet} slTrongGio={slTheoMa.get(chiTiet.ma) ?? 0} onDong={dongChiTiet}
          ds={items} onMo={moChiTiet}
          onThem={(h, sl) => { them(h, sl); setChiTiet(null); }} />
      )}
      {moGio && (
        <GioYeuCau gio={trangThai.loai === 'xong' ? gioDayDu : gio.map(d => ({ ...d, hang: null, hetHang: true, daHa: false }))}
          onDong={dongGio}
          onDat={(ma, sl) => setGio(g => datSoLuong(g, ma, sl, theoMa.get(ma)?.soLuong ?? 0))}
          onXoa={ma => setGio(g => xoaKhoiGio(g, ma))}
          onDaGui={() => setGio([])} />
      )}
    </div>
  );
}

function OTim({ tim, setTim, tuFocus, placeholder }: { tim: string; setTim: (s: string) => void; tuFocus?: boolean; placeholder: string }) {
  return (
    <div className="relative">
      <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-700" aria-hidden />
      <input type="search" value={tim} onChange={e => setTim(e.target.value)} placeholder={placeholder}
        aria-label="Tìm vật tư" enterKeyHint="search" data-o-tim autoFocus={tuFocus}
        className={`h-11 w-full ${BO_GOC} border border-stone-300 bg-white pl-11 pr-10 text-base text-stone-900 shadow-[0_1px_2px_rgba(28,25,23,.06)] outline-none transition placeholder:text-stone-500 hover:border-stone-400 focus:border-stone-900 focus:ring-4 focus:ring-stone-900/10 md:text-[15px] [&::-webkit-search-cancel-button]:hidden`} />
      {tim && (
        <button type="button" onClick={() => setTim('')} aria-label="Xoá ô tìm"
          className={`absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center ${BO_GOC} text-stone-500 hover:bg-stone-200/70 hover:text-stone-900 ${VONG_FOCUS}`}>
          <X size={15} />
        </button>
      )}
    </div>
  );
}

/** Sắp xếp: chữ không viền "Sắp xếp: Mới đăng ▾" (điện thoại chỉ còn tên cách xếp; ô rộng theo chữ đang chọn — field-sizing) */
function ChonXep({ xep, setXep, ds }: { xep: CachXepKhach; setXep: (x: CachXepKhach) => void; ds: CachXepKhach[] }) {
  return (
    <label className="inline-flex items-center gap-1 text-[13px]">
      <span className="sr-only text-stone-600 sm:not-sr-only">Sắp xếp:</span>
      <span className="relative inline-flex">
        <select value={xep} onChange={e => setXep(e.target.value as CachXepKhach)}
          className={`h-10 cursor-pointer appearance-none ${BO_GOC} border-0 bg-transparent [field-sizing:content] py-0 pl-1 pr-6 text-[15px] font-medium text-stone-900 transition-colors hover:text-stone-600 md:h-9 md:text-[13px] ${VONG_FOCUS}`}>
          {ds.map(k => <option key={k} value={k}>{NHAN_XEP_KHACH[k]}</option>)}
        </select>
        <ChevronDown size={15} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-stone-600" aria-hidden />
      </span>
    </label>
  );
}

/** Ô lọc chung (Chủng loại / Màu): khung trắng viền rõ; đang lọc => viền than, chữ đậm */
const lopOLoc = (dangLoc: boolean) =>
  `relative inline-flex h-10 w-full min-w-0 cursor-pointer items-center ${BO_GOC} border bg-white pl-3 pr-8 text-left text-[14px] leading-5 shadow-[0_1px_2px_rgba(28,25,23,.05)] transition-colors md:h-9 md:w-auto md:text-[13px] ${VONG_FOCUS} ${dangLoc
    ? 'border-stone-900 font-semibold text-stone-900' : 'border-stone-300 font-medium text-stone-700 hover:border-stone-500'}`;

type DsMau = { nhom: Array<NhomMau & { dem: number }>; chuaRo: number };

/**
 * Thanh lọc ngang (theo mẫu trang danh mục đá): ô "Chủng loại" (chủng loại trong loại đang chọn, có đếm) + ô "Màu"
 * (nhóm màu tiếng Việt có chấm màu) + "Đặt lại" khi đang lọc. Ô chủng loại ẩn khi chỉ có ≤ 1 chủng loại, ô màu ẩn khi
 * không mã nào rõ màu (trừ khi đang chọn — để bỏ chọn được). Điện thoại: 2 ô chia đôi hàng; máy tính: ô rộng theo chữ.
 */
function ThanhLoc({ lop, dsChungLoai, chungLoai, setChungLoai, dsMau, mau, setMau, coLoc, onDatLai }: {
  lop: string; dsChungLoai: Array<{ khoa: string; ten: string; dem: number }>; chungLoai: string; setChungLoai: (s: string) => void;
  dsMau: DsMau; mau: string; setMau: (s: string) => void; coLoc: boolean; onDatLai: () => void;
}) {
  const hienCL = dsChungLoai.length > 1 || !!chungLoai;
  const hienMau = dsMau.nhom.length > 0 || !!mau;
  if (!hienCL && !hienMau) return null;
  return (
    <div role="group" aria-label="Lọc vật tư" className={`${lop} min-w-0 items-center gap-2`}>
      {hienCL && (
        <span className="relative min-w-0 flex-1 md:flex-none">
          <select value={chungLoai} onChange={e => setChungLoai(e.target.value)} aria-label="Lọc theo chủng loại"
            className={`${lopOLoc(!!chungLoai)} appearance-none truncate md:max-w-[13rem]`}>
            <option value="">Tất cả chủng loại</option>
            {dsChungLoai.map(c => <option key={c.khoa} value={c.khoa}>{c.ten} ({so(c.dem)})</option>)}
          </select>
          <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500" aria-hidden />
        </span>
      )}
      {hienMau && <ChonMau ds={dsMau} mau={mau} setMau={setMau} />}
      {coLoc && (
        <button type="button" onClick={onDatLai}
          className={`inline-flex h-10 shrink-0 items-center gap-1 ${BO_GOC} px-2 text-[14px] font-medium text-stone-700 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-stone-900 hover:decoration-[#B0182B] md:h-9 md:text-[13px] ${VONG_FOCUS}`}>
          Đặt lại
        </button>
      )}
    </div>
  );
}

/** Chấm màu minh hoạ (trắng / kem có viền để không chìm vào nền trắng) */
function ChamMau({ mau, nho }: { mau: string; nho?: boolean }) {
  return <span aria-hidden style={{ background: mau }} className={`inline-block shrink-0 rounded-full ring-1 ring-inset ring-black/15 ${nho ? 'h-3 w-3' : 'h-3.5 w-3.5'}`} />;
}

/**
 * Ô chọn màu (danh sách tự vẽ — ô chọn gốc của trình duyệt không vẽ được chấm màu): bấm mở, phím ↑ ↓ / Home / End
 * di chuyển, Esc đóng, bấm ra ngoài đóng. Dòng cuối ghi số mã chưa rõ màu (không lọc được theo màu).
 */
function ChonMau({ ds, mau, setMau }: { ds: DsMau; mau: string; setMau: (s: string) => void }) {
  const [mo, setMo] = useState(false);
  const goc = useRef<HTMLDivElement>(null);
  const nut = useRef<HTMLButtonElement>(null);
  const ds1 = useMemo(() => [{ id: '', ten: 'Tất cả màu', mau: '', dem: -1 }, ...ds.nhom], [ds.nhom]);
  const chon = ds.nhom.find(n => n.id === mau);

  useEffect(() => {
    if (!mo) return;
    // Mở => đưa focus vào màu đang chọn
    goc.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    const ngoai = (e: PointerEvent) => { if (!goc.current?.contains(e.target as Node)) setMo(false); };
    document.addEventListener('pointerdown', ngoai);
    return () => document.removeEventListener('pointerdown', ngoai);
  }, [mo]);

  const dong = (traFocus: boolean) => { setMo(false); if (traFocus) nut.current?.focus(); };
  const phim = (e: React.KeyboardEvent) => {
    const cac = [...(goc.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    const i = cac.indexOf(document.activeElement as HTMLElement);
    const den = (n: number) => { e.preventDefault(); cac[Math.max(0, Math.min(cac.length - 1, n))]?.focus(); };
    if (e.key === 'Escape') { e.preventDefault(); dong(true); }
    else if (e.key === 'ArrowDown') den(i + 1);
    else if (e.key === 'ArrowUp') den(i - 1);
    else if (e.key === 'Home') den(0);
    else if (e.key === 'End') den(cac.length - 1);
    else if (e.key === 'Tab') setMo(false);
  };

  return (
    <div ref={goc} className="relative min-w-0 flex-1 md:flex-none" onKeyDown={mo ? phim : undefined}>
      <button ref={nut} type="button" onClick={() => setMo(m => !m)} aria-haspopup="listbox" aria-expanded={mo}
        aria-label={`Lọc theo màu: ${chon ? chon.ten : 'tất cả'}`}
        onKeyDown={e => { if (!mo && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setMo(true); } }}
        className={`${lopOLoc(!!mau)} gap-2`}>
        {chon ? <ChamMau mau={chon.mau} /> : <span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-full bg-[conic-gradient(#B83A4B,#D4A12A,#4F7A52,#2F5E96,#6D4C8F,#B83A4B)] ring-1 ring-inset ring-black/10" />}
        <span className="truncate">{chon ? chon.ten : 'Màu'}</span>
        <ChevronDown size={15} className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500 transition-transform ${mo ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {mo && (
        <div className={`absolute right-0 top-full z-20 mt-1.5 w-56 overflow-hidden ${BO_GOC} border border-stone-200 bg-white py-1 shadow-[0_16px_36px_-12px_rgba(28,25,23,.35)]`}>
          <div role="listbox" aria-label="Màu" className="max-h-[min(60vh,28rem)] overflow-y-auto">
            {ds1.map(n => {
              const dangChon = n.id === mau;
              return (
                <button key={n.id || 'tat-ca'} type="button" role="option" aria-selected={dangChon}
                  onClick={() => { setMau(n.id); dong(true); }}
                  className={`flex h-10 w-full items-center gap-2.5 px-3 text-left text-[14px] leading-5 outline-none transition-colors hover:bg-stone-100 focus-visible:bg-stone-100 md:h-9 md:text-[13px] ${dangChon ? 'font-semibold text-stone-900' : 'text-stone-700'}`}>
                  {n.mau ? <ChamMau mau={n.mau} /> : <span aria-hidden className="h-3.5 w-3.5 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate">{n.ten}</span>
                  {n.dem >= 0 && <span className="shrink-0 text-[12px] tabular-nums text-stone-500">{so(n.dem)}</span>}
                  {dangChon ? <Check size={15} className={`shrink-0 ${CHU_DO_AA}`} aria-hidden /> : <span aria-hidden className="w-[15px] shrink-0" />}
                </button>
              );
            })}
          </div>
          {ds.chuaRo > 0 && (
            <p className="mt-1 border-t border-stone-100 px-3 pb-1.5 pt-2 text-[12px] leading-4 text-stone-500">
              {so(ds.chuaRo)} mã chưa rõ màu — chỉ hiện khi chọn “Tất cả màu”
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Khối danh mục màu than đậm tách hẳn khỏi nền trang (người dùng 15/11/2026: "màu phần menu khác biệt hơn") */
function DanhMuc({ children }: { children: React.ReactNode }) {
  return (
    <div role="group" aria-label="Danh mục vật tư" className={`${BO_GOC_LON} bg-stone-900 p-2.5 shadow-[0_12px_32px_-16px_rgba(28,25,23,.55)]`}>
      <p className="mb-3 px-2 pt-2 text-[15px] font-bold uppercase leading-5 tracking-[0.1em] text-white">Danh mục vật tư</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

/**
 * Dòng danh mục trên nền than: ô ảnh vật liệu thật của loại (`o`), tên 15px, số đếm dạng huy hiệu tròn.
 * Đang chọn = nền đỏ AA, chữ trắng; rê = sáng nhẹ; vòng focus trắng (tương phản trên nền tối).
 */
function DongLoc({ chon, onClick, nhan, dem, o }: { chon: boolean; onClick: () => void; nhan: string; dem: number; o: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={chon}
      className={`group relative flex w-full items-center gap-3 ${BO_GOC} p-1.5 pr-3 text-left transition-colors ${VONG_FOCUS_TOI} ${chon
        ? `${NEN_DO_AA} shadow-[0_6px_16px_-8px_rgba(176,24,43,.8)]`
        : `hover:bg-white/[0.07] ${dem === 0 ? 'opacity-40' : ''}`}`}>
      <span className={`relative h-11 w-11 shrink-0 overflow-hidden rounded ring-1 ring-inset ${chon ? 'ring-white/40' : 'ring-white/10'} bg-stone-700`}>{o}</span>
      <span className={`min-w-0 flex-1 truncate text-[15px] leading-5 ${chon ? 'font-semibold text-white' : 'font-medium text-stone-100'}`}>{nhan}</span>
      <span className={`inline-flex h-6 min-w-[1.75rem] shrink-0 items-center justify-center rounded-full px-2 text-xs font-semibold tabular-nums ${chon
        ? `bg-white ${CHU_DO_AA}` : 'bg-white/10 text-stone-300'}`}>{so(dem)}</span>
    </button>
  );
}

/** Chip loại (< lg): đang chọn = nền đỏ AA như khối danh mục, số đếm dạng huy hiệu tròn */
function Chip({ chon, onClick, nhan, dem }: { chon: boolean; onClick: () => void; nhan: string; dem: number }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={chon}
      className={`inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap ${BO_GOC} px-3.5 text-[14px] font-medium transition-colors ${VONG_FOCUS} ${chon
        ? `${NEN_DO_AA} text-white` : 'bg-white text-stone-800 ring-1 ring-inset ring-stone-200 hover:ring-stone-300'}`}>
      {nhan}
      <span className={`inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-full px-1.5 text-[12px] font-semibold tabular-nums ${chon
        ? `bg-white ${CHU_DO_AA}` : 'bg-stone-100 text-stone-600'}`}>{so(dem)}</span>
    </button>
  );
}

/**
 * Chân lưới (theo mẫu trang danh mục đá): "Tổng N mã · Trang a/b" (trái) · Trước 1 … 6 7 8 … 14 Sau (giữa) · "Đến trang
 * [ ] Đi" (phải). sm–lg: số trang 1 hàng trên, tổng + ô đến trang hàng dưới. Điện thoại giữ gọn: Trước · Trang x / y · Sau.
 * Trước / Sau không dùng được thì ẩn nhưng giữ chỗ; trang hiện tại = ô nền đỏ AA.
 */
function PhanTrang({ trang, tongTrang, tong, onDen }: { trang: number; tongTrang: number; tong: number; onDen: (n: number) => void }) {
  const nut = `relative inline-flex items-center justify-center ${BO_GOC} text-sm font-medium tabular-nums transition-colors ${VONG_FOCUS}`;
  const vien = 'border border-stone-400 bg-white font-semibold text-stone-900 shadow-[0_1px_2px_rgba(28,25,23,.06)] hover:border-stone-900 hover:bg-stone-50';
  const [go, setGo] = useState('');
  const [sai, setSai] = useState(false);
  const nhieuTrang = tongTrang > 1;
  const den = (e: React.FormEvent) => {
    e.preventDefault();
    const n = docSoTrang(go, tongTrang);
    if (n === null) { setSai(true); return; }
    setGo('');
    setSai(false);
    if (n !== trang) onDen(n);
  };
  return (
    <nav aria-label="Phân trang" className="mt-10">
      {/* Điện thoại */}
      {nhieuTrang && (
        <div className="flex items-center gap-2 sm:hidden">
          <button type="button" disabled={trang <= 1} onClick={() => onDen(trang - 1)}
            className={`${nut} ${vien} h-11 flex-1 gap-1 px-3 disabled:invisible`}>
            <ChevronLeft size={16} aria-hidden /> Trước
          </button>
          <span className="flex-1 text-center text-sm text-stone-600">Trang <b className="font-semibold tabular-nums text-stone-900">{trang}</b> / <span className="tabular-nums">{tongTrang}</span></span>
          <button type="button" disabled={trang >= tongTrang} onClick={() => onDen(trang + 1)}
            className={`${nut} ${vien} h-11 flex-1 gap-1 px-3 disabled:invisible`}>
            Sau <ChevronRight size={16} aria-hidden />
          </button>
        </div>
      )}
      {/* Máy tính / máy tính bảng */}
      <div className="hidden items-center gap-x-4 gap-y-4 border-t border-stone-300/70 pt-5 sm:grid sm:grid-cols-[1fr_auto] lg:grid-cols-[1fr_auto_1fr]">
        <p className="order-2 text-[13px] leading-5 text-stone-600 lg:order-none">
          Tổng <b className="font-semibold tabular-nums text-stone-900">{so(tong)}</b> mã
          <span aria-hidden className="mx-1.5 text-stone-400">·</span>
          Trang <b className="font-semibold tabular-nums text-stone-900">{trang}</b>/<span className="tabular-nums">{tongTrang}</span>
        </p>
        {nhieuTrang && (
          <div className="order-1 col-span-2 flex items-center justify-center gap-1 lg:order-none lg:col-span-1">
            <button type="button" disabled={trang <= 1} onClick={() => onDen(trang - 1)}
              className={`${nut} ${vien} h-10 gap-1 px-3 pr-3.5 disabled:invisible`}>
              <ChevronLeft size={16} aria-hidden /> Trước
            </button>
            <div className="flex items-center gap-1.5 px-2">
              {dsNutTrang(trang, tongTrang).map((n, i) => n === '…'
                ? <span key={`c${i}`} aria-hidden className="inline-flex h-10 w-6 items-center justify-center text-stone-400">…</span>
                : (
                  <button key={n} type="button" onClick={() => onDen(n)} aria-current={n === trang ? 'page' : undefined}
                    aria-label={`Trang ${n}`}
                    className={`${nut} h-10 min-w-10 px-2 ${n === trang
                      ? 'bg-[#B0182B] font-semibold text-white shadow-[0_6px_14px_-8px_rgba(176,24,43,.8)]'
                      : 'border border-stone-300 bg-white text-stone-800 hover:border-stone-900 hover:text-stone-900'}`}>
                    {n}
                  </button>
                ))}
            </div>
            <button type="button" disabled={trang >= tongTrang} onClick={() => onDen(trang + 1)}
              className={`${nut} ${vien} h-10 gap-1 px-3 pl-3.5 disabled:invisible`}>
              Sau <ChevronRight size={16} aria-hidden />
            </button>
          </div>
        )}
        {nhieuTrang && (
          <form onSubmit={den} className="order-3 flex items-center gap-2 justify-self-end text-[13px] text-stone-600 lg:order-none">
            <label htmlFor="den-trang" className="whitespace-nowrap">Đến trang</label>
            <input id="den-trang" type="text" inputMode="numeric" autoComplete="off" value={go} placeholder={String(trang)}
              onChange={e => { setGo(e.target.value.replace(/[^\d]/g, '').slice(0, 4)); setSai(false); }}
              aria-invalid={sai || undefined} aria-describedby={sai ? 'den-trang-loi' : undefined}
              className={`h-10 w-14 ${BO_GOC} border bg-white px-2 text-center text-sm tabular-nums text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-900 focus:ring-4 focus:ring-stone-900/10 ${sai ? 'border-rose-700' : 'border-stone-300 hover:border-stone-500'}`} />
            <button type="submit" className={`${nut} ${vien} h-10 px-3.5`}>Đi</button>
            {sai && <span id="den-trang-loi" className="sr-only">Nhập số trang từ 1 đến {tongTrang}</span>}
          </form>
        )}
      </div>
    </nav>
  );
}

const LINK_BAN_DO_KHO = 'https://maps.app.goo.gl/C266gy3zz6bTkoTU7';

/** Chân trang gọn: thương hiệu + 1 câu + nút bản đồ kho (trái), "Cách mua" 3 bước 1 hàng (phải, máy tính); dòng chú thích + © */
function ChanTrang() {
  return (
    <footer className="bg-stone-900 text-stone-400">
      <div className={`${KHUNG} py-8 md:py-10`}>
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between md:gap-12">
          <div className="max-w-md">
            <div className="flex items-center gap-2.5">
              <img src="/logo-aa-mark.png" alt="" className="h-7 w-7 shrink-0 object-contain" draggable={false} />
              <p className="text-[13px] font-semibold uppercase leading-5 tracking-[0.12em] text-white">AA Corporation</p>
            </div>
            <p className="mt-3 text-sm leading-6 text-stone-300">
              Vật tư thanh lý & tồn kho — vật liệu còn dư sau các dự án nội thất, chào bán theo số lượng hiện có.
            </p>
            {/* Vị trí kho do người dùng gửi 15/11/2026 (link Google Maps — chỉ có toạ độ, không ghi địa chỉ chữ để khỏi sai) */}
            <a href={LINK_BAN_DO_KHO} target="_blank" rel="noopener noreferrer"
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg border border-white/15 px-3.5 text-sm font-medium text-white transition-colors hover:border-white/30 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              <MapPin size={16} className="text-[#E5A3AC]" aria-hidden /> Kho AA · Xem đường đi trên bản đồ
            </a>
          </div>
          <div className="hidden md:block">
            <h2 className="text-[11px] font-semibold uppercase leading-4 tracking-[0.14em] text-stone-400">Cách mua</h2>
            <ol className="mt-2 flex items-center gap-5 text-[13px] text-stone-300">
              {BUOC_MUA_GON.map((b, i) => (
                <li key={b} className="flex items-center gap-2 whitespace-nowrap">
                  <span aria-hidden className="tabular-nums text-stone-400">{String(i + 1).padStart(2, '0')}</span>{b}
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="mt-7 flex flex-col gap-1 border-t border-white/10 pt-5 text-[12px] leading-[18px] text-stone-400 md:flex-row md:items-center md:justify-between md:gap-6">
          <p>Ảnh mẫu thực tế, màu có thể chênh lệch theo lô · Xem hàng và giao nhận tại kho AA</p>
          <p className="shrink-0">© {new Date().getFullYear()} AA Corporation</p>
        </div>
      </div>
    </footer>
  );
}

function KhungCho() {
  const xuong = 'animate-pulse rounded bg-stone-300/50 motion-reduce:animate-none';
  return (
    <div aria-busy="true" aria-label="Đang tải danh sách vật tư" className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-8">
      {/* Khối danh mục giả: cùng màu than, cùng bo góc với khối thật */}
      <div className={`hidden self-start ${BO_GOC_LON} bg-stone-900 p-2.5 lg:block`}>
        <div className="mx-2 mb-4 mt-2.5 h-3.5 w-36 rounded bg-white/15" />
        <div className="space-y-1.5">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex h-14 items-center gap-3 p-1.5" style={{ opacity: 1 - i * 0.08 }}>
              <div className="h-11 w-11 shrink-0 animate-pulse rounded bg-white/10 motion-reduce:animate-none" />
              <div className="h-3.5 flex-1 animate-pulse rounded bg-white/10 motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-4 flex gap-2 lg:hidden">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className={`h-10 w-20 ${BO_GOC} ${xuong}`} />)}
        </div>
        <div className={`mb-4 h-4 w-32 ${xuong}`} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className={`relative overflow-hidden ${BO_GOC} border border-stone-200/80 bg-white`}>
              <div className="aspect-square animate-pulse bg-[#EAE3D8] motion-reduce:animate-none" />
              <div className="space-y-2 p-3 sm:p-4">
                <div className={`h-4 w-4/5 ${xuong}`} />
                <div className={`h-3 w-1/2 ${xuong}`} />
                <div className="flex items-center justify-between gap-2 pt-2">
                  <div className={`h-3.5 w-2/5 ${xuong}`} />
                  <div className={`h-3 w-1/4 ${xuong} sm:hidden`} />
                  <div className={`hidden h-9 w-9 rounded-full sm:block ${xuong}`} />
                </div>
              </div>
              <div className="absolute right-2 top-2 h-9 w-9 rounded-full bg-white/70 sm:hidden" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
