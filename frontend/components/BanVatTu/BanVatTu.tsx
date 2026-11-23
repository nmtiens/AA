import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowDownWideNarrow, ArrowUpNarrowWide, Download, LayoutGrid, Loader2, RefreshCw, Search,
  Shield, Table2, X,
} from 'lucide-react';
import {
  laLoiChuaCoQuyenBan, layDanhSachBanVatTu, LoiBanVatTu, type AnhNoiBo, type DanhSachBanVatTu, type TrangThaiAnh,
} from '../../services/banVatTuApi';
import { useToast } from '../../context/ToastContext';
import { ChiTietVatTu } from './ChiTietVatTu';
import { DongBang, TheVatTu } from './TheVatTu';
import {
  bangExcel, chuanBiDong, dinhDangTrieu, docSoTrieu, DS_NHOM_TUOI, dsLuaChon, ganTrangThaiAnh, homNayVn,
  locDong, LOC_TRONG, thuTuLoai,
  NHAN_TUOI, NHAN_XEP, nhanNgay, soLocDangBat, tomTat, xepDong, type CachXep, type DongBan, type LocBan, type Xep,
} from './xuLy';

// ============================================================================
// TRANG "DANH MỤC VẬT TƯ" (/ban-vat-tu, quyền 'ban_vat_tu') — công cụ quản trị tra cứu tồn kho vật tư nội bộ.
// TẤT CẢ hàng đang tồn trong kho vật tư (kể cả hàng gán công trình — gắn nhãn "Đang gán CT …", mã đầu 800 giá 0,
// CCDC đầu 400). Số liệu: GET /api/ban-vat-tu/danh-sach (ảnh chụp file "BC ton kho vat tu dd.mm.yyyy.xlsx" + MASTER
// DATA vật tư + ảnh mẫu sheet 03). ≈5.100 dòng: tải 1 lần, lọc / xếp ở trình duyệt, hiện dần theo cuộn (mỗi đợt 60
// thẻ / 150 dòng) để trang không nặng.
// Có quyền 'ban_vat_tu_sua' => duyệt / ẩn ảnh mẫu trong cửa sổ chi tiết (PUT /api/ban-vat-tu/anh/:id).
// (Đường dẫn / quyền giữ chữ "ban" để không vỡ quyền đã cấp; tính năng bán + trang khách đã bỏ 21/11/2026.)
// ============================================================================

type CheDo = 'luoi' | 'bang';
const KHOA_CHE_DO = 'banVatTu.cheDo';
const DOT_HIEN: Record<CheDo, number> = { luoi: 60, bang: 150 };

const docCheDo = (): CheDo => {
  try { return localStorage.getItem(KHOA_CHE_DO) === 'bang' ? 'bang' : 'luoi'; } catch { return 'luoi'; }
};

type TrangThaiTai =
  | { loai: 'dang_tai' }
  | { loai: 'loi'; thongBao: string }
  | { loai: 'chua_quyen'; thongBao: string }
  | { loai: 'xong' };

function OSo({ nhan, giaTri, phu }: { nhan: string; giaTri: React.ReactNode; phu?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="kpi-label">{nhan}</p>
      <p className="mt-1 truncate text-2xl font-bold leading-tight tabular-nums text-slate-900">{giaTri}</p>
      {phu && <p className="mt-0.5 truncate text-xs text-slate-500">{phu}</p>}
    </div>
  );
}

/** Ô chọn gọn của bộ lọc: đang chọn => viền đậm */
function ChonLoc({ nhan, giaTri, onDoi, children }: {
  nhan: string; giaTri: string; onDoi: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <label className="min-w-0">
      <span className="sr-only">{nhan}</span>
      <select value={giaTri} onChange={e => onDoi(e.target.value)} title={nhan}
        className={`w-full truncate rounded-lg border bg-white py-1.5 pl-2.5 pr-7 text-sm outline-none focus:ring-2 focus:ring-slate-200 ${giaTri ? 'border-slate-700 font-medium text-slate-900' : 'border-slate-200 text-slate-600'}`}>
        {children}
      </select>
    </label>
  );
}

const BanVatTu: React.FC = () => {
  const [duLieu, setDuLieu] = useState<DanhSachBanVatTu | null>(null);
  const [dong, setDong] = useState<DongBan[]>([]);
  const [trangThai, setTrangThai] = useState<TrangThaiTai>({ loai: 'dang_tai' });
  const [lanTai, setLanTai] = useState(0);
  const [loc, setLoc] = useState<LocBan>(LOC_TRONG);
  const [oGtTu, setOGtTu] = useState('');
  const [oGtDen, setOGtDen] = useState('');
  const [xep, setXep] = useState<Xep>({ cot: 'giaTri', giam: true });
  const [cheDo, setCheDoState] = useState<CheDo>(docCheDo);
  const [soHien, setSoHien] = useState(DOT_HIEN.luoi);
  const [moKhoa, setMoKhoa] = useState<string | null>(null);
  const [dangXuat, setDangXuat] = useState(false);
  const { showToast } = useToast();
  const homNay = useMemo(() => homNayVn(), []);
  const cuonRef = useRef<HTMLDivElement>(null);
  const moiRef = useRef<HTMLDivElement>(null);

  const setCheDo = (c: CheDo) => {
    setCheDoState(c);
    try { localStorage.setItem(KHOA_CHE_DO, c); } catch { /* trình duyệt chặn bộ nhớ: bỏ qua */ }
  };

  useEffect(() => {
    const ac = new AbortController();
    setTrangThai({ loai: 'dang_tai' });
    layDanhSachBanVatTu(ac.signal)
      .then(ds => {
        setDuLieu(ds);
        setDong(chuanBiDong(ds.items, homNay));
        setTrangThai({ loai: 'xong' });
        // Không có quyền giá vốn mà đang xếp theo giá trị => xếp theo số lượng
        if (!ds.coGiaVon) setXep(x => (x.cot === 'giaTri' ? { cot: 'soLuong', giam: true } : x));
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        if (laLoiChuaCoQuyenBan(e)) setTrangThai({ loai: 'chua_quyen', thongBao: (e as LoiBanVatTu).message });
        else setTrangThai({ loai: 'loi', thongBao: e instanceof LoiBanVatTu ? e.message : 'Không tải được danh sách, hãy thử lại' });
      });
    return () => ac.abort();
  }, [lanTai, homNay]);

  const coGiaVon = duLieu?.coGiaVon === true;
  const coQuyenSua = duLieu?.coQuyenSua === true;

  // Lọc theo giá trị gõ chậm (useDeferredValue) để ô tìm không giật trên ≈5.100 dòng
  const locTre = useDeferredValue(loc);
  const daLoc = useMemo(() => xepDong(locDong(dong, locTre, coGiaVon), xep), [dong, locTre, coGiaVon, xep]);
  const tongToanKho = useMemo(() => tomTat(dong), [dong]);
  const tongLoc = useMemo(() => tomTat(daLoc), [daLoc]);
  const soLoc = soLocDangBat(loc);

  // Lựa chọn của từng bộ lọc: đếm theo các bộ lọc khác đang bật (bỏ qua chính nó)
  // Lọc theo LOẠI CHÍNH = 10 kho vật tư (người dùng chốt 14/11/2026: bỏ lọc nhóm SAP / chủng loại, quá vụn)
  const chonKho = useMemo(() => dsLuaChon(locDong(dong, locTre, coGiaVon, 'kho'), d => d.khoTen)
    .sort((a, b) => thuTuLoai(a.giaTri) - thuTuLoai(b.giaTri) || a.giaTri.localeCompare(b.giaTri, 'vi')), [dong, locTre, coGiaVon]);

  // Đổi bộ lọc / cách xếp / chế độ / tải lại => về đầu danh sách, hiện lại đợt đầu (duyệt ảnh thì giữ chỗ đang xem)
  useEffect(() => {
    setSoHien(DOT_HIEN[cheDo]);
    cuonRef.current?.scrollTo({ top: 0 });
  }, [locTre, xep, cheDo, duLieu]);

  // Cuộn gần cuối => hiện thêm 1 đợt
  useEffect(() => {
    const moc = moiRef.current, goc = cuonRef.current;
    // Đã hiện hết => không quan sát nữa (tránh tăng soHien mãi)
    if (!moc || !goc || soHien >= daLoc.length) return;
    const ob = new IntersectionObserver(es => {
      if (es.some(e => e.isIntersecting)) setSoHien(n => n + DOT_HIEN[cheDo]);
    }, { root: goc, rootMargin: '800px 0px' });
    ob.observe(moc);
    return () => ob.disconnect();
    // soHien trong deps: quan sát lại sau mỗi đợt => mốc vẫn trong vùng (màn hình cao) thì hiện tiếp đợt nữa
  }, [cheDo, trangThai.loai, daLoc.length, soHien]);

  const datLoc = <K extends keyof LocBan>(k: K, v: LocBan[K]) => setLoc(l => ({ ...l, [k]: v }));
  const xoaLoc = () => { setLoc(LOC_TRONG); setOGtTu(''); setOGtDen(''); };

  const moChiTiet = useCallback((d: DongBan) => setMoKhoa(d.khoa), []);
  const dangMo = moKhoa ? dong.find(d => d.khoa === moKhoa) ?? null : null;
  const cungMa = useMemo(() => (dangMo ? dong.filter(d => d.ma === dangMo.ma) : []), [dong, dangMo]);
  const daDoiAnh = useCallback((ma: string, id: number, tt: TrangThaiAnh, anhGoc?: AnhNoiBo) =>
    setDong(ds => ganTrangThaiAnh(ds, ma, id, tt, anhGoc)), []);

  const xuatExcel = async () => {
    if (!daLoc.length) return;
    setDangXuat(true);
    try {
      const XLSX = await import('xlsx');
      const aoa = bangExcel(daLoc, coGiaVon, homNay);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = aoa[0].map((_, c) => {
        let max = 8;
        for (let r = 0; r < Math.min(aoa.length, 400); r++) max = Math.max(max, String(aoa[r][c] ?? '').length);
        return { wch: Math.min(48, max + 1) };
      });
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: aoa[0].length - 1 } }) };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Tồn kho vật tư');
      XLSX.writeFile(wb, `ton-kho-vat-tu${soLoc ? '_dang-loc' : ''}_${duLieu?.ngayChot ?? homNay}.xlsx`);
    } catch (e) {
      console.error('Lỗi xuất Excel danh mục vật tư:', e);
      showToast('Không xuất được file Excel, hãy thử lại', 'error');
    } finally {
      setDangXuat(false);
    }
  };

  const hien = daLoc.slice(0, soHien);
  const conNua = daLoc.length > hien.length;

  return (
    <div ref={cuonRef} className="h-full overflow-y-auto custom-scrollbar bg-[#f5f6f8]">
      {/* Đầu trang */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="h-3 w-3 rounded-sm bg-emerald-600" aria-hidden />
            <h1 className="page-title">Danh mục vật tư</h1>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            Toàn bộ hàng đang tồn trong kho vật tư
            {duLieu?.ngayChot && <> · tồn chốt {nhanNgay(duLieu.ngayChot)}</>}
            {duLieu?.nguonFile && <span title={duLieu.nguonFile}> · {duLieu.nguonFile.split(/[\\/]/).pop()}</span>}
            {trangThai.loai === 'dang_tai' && <> · đang tải…</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Chế độ xem">
            {([['luoi', 'Lưới', LayoutGrid], ['bang', 'Bảng', Table2]] as const).map(([k, l, Icon]) => (
              <button key={k} type="button" onClick={() => setCheDo(k)} aria-pressed={cheDo === k}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition ${cheDo === k ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                <Icon size={14} /> {l}
              </button>
            ))}
          </div>
          <button type="button" onClick={xuatExcel} disabled={!daLoc.length || dangXuat}
            title="Xuất danh sách đang lọc ra Excel"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {dangXuat ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {dangXuat ? 'Đang xuất…' : 'Xuất Excel'}
          </button>
          <button type="button" onClick={() => setLanTai(n => n + 1)} disabled={trangThai.loai === 'dang_tai'} aria-label="Tải lại" title="Tải lại"
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50">
            <RefreshCw size={15} className={trangThai.loai === 'dang_tai' ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-6">
        {trangThai.loai === 'dang_tai' && (
          <div aria-busy="true" aria-label="Đang tải danh sách vật tư" className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-[84px] animate-pulse rounded-xl bg-slate-200/70" />)}
            </div>
            <div className="h-24 animate-pulse rounded-xl bg-slate-200/70" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {Array.from({ length: 12 }, (_, i) => <div key={i} className="h-72 animate-pulse rounded-xl bg-slate-200/70" />)}
            </div>
          </div>
        )}

        {trangThai.loai === 'loi' && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
            <AlertTriangle className="h-9 w-9 text-amber-500" />
            <p className="text-sm font-medium text-slate-700">Không tải được danh sách vật tư</p>
            <p className="text-xs text-slate-500">{trangThai.thongBao}</p>
            <button type="button" onClick={() => setLanTai(n => n + 1)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <RefreshCw size={14} /> Thử lại
            </button>
          </div>
        )}

        {trangThai.loai === 'chua_quyen' && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
            <Shield className="h-10 w-10 text-slate-300" strokeWidth={1.5} />
            <p className="text-sm font-semibold text-slate-700">{trangThai.thongBao}</p>
            <p className="text-xs text-slate-500">Nhờ quản trị cấp quyền "Danh mục vật tư".</p>
          </div>
        )}

        {trangThai.loai === 'xong' && duLieu?.canhBao && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">{duLieu.canhBao}</p>
              <p className="mt-0.5 text-xs text-amber-700">
                Cách khắc phục: quản trị chạy file SQL tạo bảng trên cơ sở dữ liệu, rồi nạp tồn kho bằng
                <code className="mx-1 rounded bg-amber-100 px-1">python scripts/nap_ban_vat_tu.py --demo "&lt;file DEMO&gt;" --ghi</code>
                (chạy trong thư mục backend; thiếu --demo thì không có chủng loại, quy cách, thương hiệu) và bấm Tải lại.
              </p>
            </div>
          </div>
        )}

        {trangThai.loai === 'xong' && !duLieu?.canhBao && dong.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
            Chưa có dữ liệu tồn kho vật tư — chạy script nạp file "BC ton kho vat tu" rồi tải lại.
          </div>
        )}

        {trangThai.loai === 'xong' && dong.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <OSo nhan="Mã vật tư đang tồn" giaTri={tongToanKho.soMa.toLocaleString('vi-VN')}
                phu={`${tongToanKho.soDong.toLocaleString('vi-VN')} dòng (mã × kho)`} />
              {coGiaVon
                ? <OSo nhan="Tổng giá trị tồn (giá vốn)" giaTri={dinhDangTrieu(tongToanKho.tongGiaTri)} phu="chỉ người có quyền xem giá thấy" />
                : <OSo nhan="Đang gán công trình" giaTri={tongToanKho.ganCT.toLocaleString('vi-VN')} phu="dòng (mã × kho) có tên công trình" />}
              <OSo nhan="Chậm luân chuyển" giaTri={tongToanKho.cham.toLocaleString('vi-VN')}
                phu={`${tongToanKho.soMa ? Math.round((tongToanKho.cham / tongToanKho.soMa) * 100) : 0}% số mã · chậm luân chuyển > 3 tháng`} />
              <OSo nhan="Đã có ảnh" giaTri={tongToanKho.coAnh.toLocaleString('vi-VN')}
                phu={`${tongToanKho.soMa ? Math.round((tongToanKho.coAnh / tongToanKho.soMa) * 100) : 0}% số mã · gồm ảnh mẫu sheet 03`} />
            </div>

            {/* Bộ lọc */}
            <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative min-w-[14rem] flex-1">
                  <span className="sr-only">Tìm tên, mã, quy cách, màu, công trình</span>
                  <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={loc.tim} onChange={e => datLoc('tim', e.target.value)} placeholder="Tìm tên, mã, quy cách, màu, thương hiệu, công trình…"
                    className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-8 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200" />
                  {loc.tim && (
                    <button type="button" onClick={() => datLoc('tim', '')} aria-label="Xoá ô tìm"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"><X size={13} /></button>
                  )}
                </label>
                <div className="flex items-center gap-1.5">
                  <label>
                    <span className="sr-only">Sắp xếp theo</span>
                    <select value={xep.cot} onChange={e => setXep(x => ({ cot: e.target.value as CachXep, giam: e.target.value === 'ten' ? false : x.giam }))}
                      className="rounded-lg border border-slate-200 bg-white py-1.5 pl-2.5 pr-7 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-slate-200">
                      {(Object.keys(NHAN_XEP) as CachXep[]).filter(k => coGiaVon || k !== 'giaTri').map(k => (
                        <option key={k} value={k}>Xếp: {NHAN_XEP[k]}</option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={() => setXep(x => ({ ...x, giam: !x.giam }))}
                    aria-label={xep.giam ? 'Đang xếp giảm dần — bấm để xếp tăng dần' : 'Đang xếp tăng dần — bấm để xếp giảm dần'}
                    title={xep.giam ? 'Giảm dần' : 'Tăng dần'}
                    className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50">
                    {xep.giam ? <ArrowDownWideNarrow size={15} /> : <ArrowUpNarrowWide size={15} />}
                  </button>
                </div>
              </div>

              <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${coGiaVon ? 'lg:grid-cols-7' : 'lg:grid-cols-5'}`}>
                <ChonLoc nhan="Loại" giaTri={loc.kho} onDoi={v => datLoc('kho', v)}>
                  <option value="">Mọi loại</option>
                  {chonKho.map(o => <option key={o.giaTri} value={o.giaTri}>{o.giaTri} ({o.dem})</option>)}
                  {loc.kho && !chonKho.some(o => o.giaTri === loc.kho) && <option value={loc.kho}>{loc.kho} (0)</option>}
                </ChonLoc>
                <ChonLoc nhan="Dùng chung / gán công trình" giaTri={loc.ganCT} onDoi={v => datLoc('ganCT', v as LocBan['ganCT'])}>
                  <option value="">Dùng chung + gán CT</option>
                  <option value="dung_chung">Chỉ hàng dùng chung</option>
                  <option value="gan_ct">Chỉ hàng đang gán CT</option>
                </ChonLoc>
                <ChonLoc nhan="Tuổi tồn" giaTri={loc.tuoi} onDoi={v => datLoc('tuoi', v as LocBan['tuoi'])}>
                  <option value="">Mọi tuổi tồn</option>
                  {DS_NHOM_TUOI.map(t => <option key={t} value={t}>{NHAN_TUOI[t]}</option>)}
                </ChonLoc>
                <ChonLoc nhan="Chậm luân chuyển" giaTri={loc.cham} onDoi={v => datLoc('cham', v as LocBan['cham'])}>
                  <option value="">Chậm LC: tất cả</option>
                  <option value="cham">Chậm luân chuyển &gt; 3 tháng</option>
                  <option value="khong">Không chậm luân chuyển</option>
                </ChonLoc>
                <ChonLoc nhan="Ảnh" giaTri={loc.anh} onDoi={v => datLoc('anh', v as LocBan['anh'])}>
                  <option value="">Có ảnh + chưa ảnh</option>
                  <option value="co">Đã có ảnh</option>
                  <option value="chua">Chưa có ảnh</option>
                </ChonLoc>
                {coGiaVon && (
                  <div className="col-span-2 flex items-center gap-1.5 sm:col-span-1 lg:col-span-2">
                    <span className="shrink-0 text-xs text-slate-500">Giá trị (triệu)</span>
                    <input value={oGtTu} inputMode="decimal" placeholder="từ" title="Triệu đồng, gõ kiểu 1.000 hoặc 2,5" aria-label="Giá trị tồn từ (triệu đồng)"
                      onChange={e => { setOGtTu(e.target.value); datLoc('giaTriTu', docSoTrieu(e.target.value)); }}
                      className="w-full min-w-0 rounded-lg border border-slate-200 px-2 py-1.5 text-sm tabular-nums outline-none focus:ring-2 focus:ring-slate-200" />
                    <span className="text-slate-400">–</span>
                    <input value={oGtDen} inputMode="decimal" placeholder="đến" title="Triệu đồng, gõ kiểu 1.000 hoặc 2,5" aria-label="Giá trị tồn đến (triệu đồng)"
                      onChange={e => { setOGtDen(e.target.value); datLoc('giaTriDen', docSoTrieu(e.target.value)); }}
                      className="w-full min-w-0 rounded-lg border border-slate-200 px-2 py-1.5 text-sm tabular-nums outline-none focus:ring-2 focus:ring-slate-200" />
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-sm">
                <p className="text-slate-600">
                  <span className="font-semibold tabular-nums text-slate-900">{tongLoc.soMa.toLocaleString('vi-VN')}</span> mã
                  <span className="text-slate-400"> · {tongLoc.soDong.toLocaleString('vi-VN')} dòng</span>
                  {coGiaVon && <> · giá trị <span className="font-semibold tabular-nums text-slate-900">{dinhDangTrieu(tongLoc.tongGiaTri)}</span></>}
                  {tongLoc.ganCT > 0 && <span className="text-slate-500"> · {tongLoc.ganCT.toLocaleString('vi-VN')} dòng đang gán CT</span>}
                  {locTre !== loc && <Loader2 size={13} className="ml-2 inline animate-spin text-slate-400" />}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {soLoc > 0 && (
                    <button type="button" onClick={xoaLoc}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
                      <X size={13} /> Xoá {soLoc} bộ lọc
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Danh sách */}
            {daLoc.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center text-sm text-slate-500">
                Không có vật tư nào khớp bộ lọc.
                {soLoc > 0 && <button type="button" onClick={xoaLoc} className="ml-1 font-medium text-slate-800 underline">Xoá bộ lọc</button>}
              </div>
            ) : cheDo === 'luoi' ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {hien.map(d => <TheVatTu key={d.khoa} d={d} coGiaVon={coGiaVon} homNay={homNay} onMo={moChiTiet} />)}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th scope="col" className="w-12 px-3 py-2"><span className="sr-only">Ảnh</span></th>
                      {([
                        ['ten', 'Vật tư', false], [null, 'Nhóm', false], ['soLuong', 'Số lượng', true], [null, 'Kho', false], ['tuoi', 'Tuổi tồn', false],
                        ...(coGiaVon ? [['giaTri', 'Giá trị tồn', true] as const] : []),
                      ] as Array<readonly [CachXep | null, string, boolean]>).map(([k, nhan, phai]) => (
                        <th key={nhan} scope="col" className={`whitespace-nowrap px-3 py-2 font-medium ${phai ? 'text-right' : 'text-left'}`}
                          aria-sort={k && xep.cot === k ? (xep.giam ? 'descending' : 'ascending') : undefined}>
                          {k ? (
                            <button type="button" onClick={() => setXep(x => (x.cot === k ? { ...x, giam: !x.giam } : { cot: k, giam: k !== 'ten' }))}
                              className={`hover:text-slate-900 ${xep.cot === k ? 'text-slate-900' : ''}`}>
                              {nhan}{xep.cot === k ? (xep.giam ? ' ↓' : ' ↑') : ''}
                            </button>
                          ) : nhan}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {hien.map(d => <DongBang key={d.khoa} d={d} coGiaVon={coGiaVon} homNay={homNay} onMo={moChiTiet} />)}
                  </tbody>
                </table>
              </div>
            )}
            <div ref={moiRef} aria-hidden className="h-px" />
            {conNua && (
              <div className="flex justify-center pb-2">
                <button type="button" onClick={() => setSoHien(n => n + DOT_HIEN[cheDo])}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
                  Đang hiện {hien.length.toLocaleString('vi-VN')} / {daLoc.length.toLocaleString('vi-VN')} — xem thêm
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {dangMo && (
        <ChiTietVatTu key={dangMo.khoa} d={dangMo} cungMa={cungMa} coGiaVon={coGiaVon} coQuyenSua={coQuyenSua} homNay={homNay}
          onDong={() => setMoKhoa(null)} onDoiAnh={daDoiAnh} />
      )}
    </div>
  );
};

export default BanVatTu;
