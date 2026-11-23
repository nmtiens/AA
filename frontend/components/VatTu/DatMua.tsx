import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { dangMayTinhBang } from '../../services/mayTinhBang';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as bang from '../shared/bangBaoCao';
import { DashboardFilter } from '../Dashboard/components/shared/DashboardFilter';
import { useToast } from '../../context/ToastContext';
import { fmtInt } from '../../utils/format';
import {
  layDong, layTheoMa, layTheoNhom, layTheoThang, LoiVatTu, TRANG_THAI_PR,
  type BoLocDatMua, type DanhSachDong, type DongMa, type DongNhom, type LoaiO, type SoGop, type TheoMa, type TheoNhom,
  type TheoThang, type TrangThaiPr,
} from '../../services/vatTuApi';
import {
  bangExcelDong, chuODong, COT_BANG, cotBangHien, cotDongHien, fmtNgay, fmtO, fmtTrieu, giaoKhoang, khoangThang, MAU_TRANG_THAI,
  NHAN_LOAI_O, NHAN_TRANG_THAI, nhanThangNgan, soNgayToi, tachCongTrinh, tenFileAnToan, trangThaiSoDong, TT_VE_CHUA_TRE, type CotSo,
} from './xuLyDatMua';
import { fmtThangDuDung, mucThangDuDung } from './xuLyTieuHao';

/** SL: tới 3 số lẻ; null / 0 => '' */
const fmtSl = (v: number | null | undefined) => (v ? v.toLocaleString('en-US', { maximumFractionDigits: 3 }) : '');

// ============================================================================
// ĐẶT – MUA THEO NHÓM SAP (/vat-tu/dat-mua) — đợt 1 module Vật tư (thiết kế 21/11/2026)
// Mỗi dòng bảng = 1 nhóm SAP 3 số ("115 - Phụ kiện"), đếm dòng PR theo trạng thái (máy chủ tính — CASE ở
// backend/src/routes/vatTu.ts, khớp materialLineState). Số liệu tổng hợp ở máy chủ (/api/vat-tu/dat-mua/*), không tải
// bảng vat_tu ~30 nghìn dòng về trình duyệt. Tiền triệu đồng; không có quyền xem giá => ẩn mọi cột tiền.
// Mặc định ẨN nhóm 806 Gia công, 401 CCDC, mã đầu 800 và dòng HỦY (người dùng chốt 21/11/2026) — công tắc để hiện.
// Bấm ô số => danh sách dòng PR (xuất Excel); bấm tên nhóm => bảng mã trong nhóm; bấm cột biểu đồ => lọc theo tháng PR.
// ============================================================================

type TaiTrangThai = { loai: 'dang_tai' } | { loai: 'xong' } | { loai: 'loi'; thongBao: string; chuaQuyen: boolean };

/** Yêu cầu mở danh sách dòng PR (dvt: ĐVT của dòng bảng mã, '-' = không ghi ĐVT) */
type XemDong = { tieuDe: string; phu?: string; loc: BoLocDatMua; ma?: string | null; dvt?: string | null; loai?: LoaiO | null };
/** Biểu đồ tháng: đang tải / lỗi / có số liệu */
type TaiThang = { loai: 'dang_tai' } | { loai: 'loi'; thongBao: string } | { loai: 'xong'; du: TheoThang };

const thongBaoLoi = (e: unknown) => (e instanceof LoiVatTu ? e.message : 'Không tải được số liệu, hãy thử lại');
const laChuaQuyen = (e: unknown) => e instanceof LoiVatTu && e.chuaCoQuyen;
const fmtLuc = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

const DatMua: React.FC = () => {
  const [loc, setLoc] = useState<BoLocDatMua>({});
  const [oCt, setOCt] = useState('');
  const [oTim, setOTim] = useState('');
  const [thangChon, setThangChon] = useState<string | null>(null);
  const [du, setDu] = useState<TheoNhom | null>(null);
  const [thang, setThang] = useState<TaiThang>({ loai: 'dang_tai' });
  const [tt, setTt] = useState<TaiTrangThai>({ loai: 'dang_tai' });
  const [lanTai, setLanTai] = useState(0);
  const [xemDong, setXemDong] = useState<XemDong | null>(null);
  const [xemNhom, setXemNhom] = useState<{ ma: string; ten: string } | null>(null);
  const [sap, setSap] = useState<{ khoa: keyof SoGop | 'ten' | 'soMa'; giam: boolean }>({ khoa: 'soDong', giam: true });
  // Mọi nhóm từng thấy (khi đang lọc nhóm, máy chủ chỉ trả nhóm đã chọn — danh sách chọn vẫn phải đủ)
  const [tenNhom, setTenNhom] = useState<Record<string, string>>({});

  // Bộ lọc của bảng + thẻ số = bộ lọc trang + tháng đang chọn trên biểu đồ (biểu đồ thì không theo tháng chọn); khoảng
  // ngày = GIAO của khoảng đang lọc và tháng chọn (lọc từ 10/11 rồi bấm T11 vẫn tính từ 10/11)
  const locBang = useMemo<BoLocDatMua>(() => {
    const k = thangChon ? khoangThang(thangChon) : null;
    return k ? { ...loc, ...giaoKhoang(loc, k) } : loc;
  }, [loc, thangChon]);

  useEffect(() => {
    const ac = new AbortController();
    setTt({ loai: 'dang_tai' });
    layTheoNhom(locBang, ac.signal)
      .then(d => {
        setDu(d);
        setTenNhom(cu => {
          const moi = { ...cu };
          for (const n of d.nhom) moi[n.ma] = n.ten;
          return moi;
        });
        setTt({ loai: 'xong' });
      })
      .catch(e => { if (!ac.signal.aborted) setTt({ loai: 'loi', thongBao: thongBaoLoi(e), chuaQuyen: laChuaQuyen(e) }); });
    return () => ac.abort();
  }, [locBang, lanTai]);

  useEffect(() => {
    const ac = new AbortController();
    setThang({ loai: 'dang_tai' });
    layTheoThang(loc, ac.signal)
      .then(du => setThang({ loai: 'xong', du }))
      .catch(e => { if (!ac.signal.aborted) setThang({ loai: 'loi', thongBao: thongBaoLoi(e) }); });
    return () => ac.abort();
  }, [loc, lanTai]);

  const coGia = du?.coGia === true;
  const homNay = du?.homNay ?? '';
  const datLoc = <K extends keyof BoLocDatMua>(k: K, v: BoLocDatMua[K]) => setLoc(l => ({ ...l, [k]: v }));
  const apCt = () => datLoc('ct', tachCongTrinh(oCt));
  const apTim = () => datLoc('q', oTim.trim() || undefined);
  const xoaLoc = () => { setLoc({}); setOCt(''); setOTim(''); setThangChon(null); };
  const soLoc = [loc.tu, loc.den, loc.ct?.length, loc.nhom?.length, loc.trangThai?.length, loc.q, thangChon,
    loc.an806 === false, loc.an401 === false, loc.an800 === false, loc.anHuy === false].filter(Boolean).length;

  const dsNhom = useMemo(() => Object.entries(tenNhom).sort((a, b) => a[0].localeCompare(b[0])), [tenNhom]);
  const cot = useMemo(() => cotBangHien(coGia, du?.tong), [coGia, du]);

  const nhom = useMemo(() => {
    const ds = [...(du?.nhom ?? [])];
    const { khoa, giam } = sap;
    ds.sort((a, b) => {
      const va = khoa === 'ten' ? a.ma : a[khoa as keyof DongNhom];
      const vb = khoa === 'ten' ? b.ma : b[khoa as keyof DongNhom];
      const so = typeof va === 'number' || typeof vb === 'number'
        ? ((va as number | null) ?? -Infinity) - ((vb as number | null) ?? -Infinity)
        : String(va ?? '').localeCompare(String(vb ?? ''));
      return giam ? -so : so;
    });
    return ds;
  }, [du, sap]);

  /** Mở danh sách dòng PR của 1 ô (nhóm null = mọi nhóm đang hiện) */
  const moO = useCallback((c: CotSo, n: DongNhom | null) => {
    const l: BoLocDatMua = { ...locBang, ...(n ? { nhom: [n.ma] } : {}) };
    if (c.trangThai) l.trangThai = c.trangThai;
    if (c.trangThai?.includes('huy')) l.anHuy = false;
    // Ô "Số dòng PR" không đếm HỦY => danh sách cũng bỏ HỦY (kể cả khi đang bật "Hiện dòng HỦY")
    if (c.khoa === 'soDong') l.trangThai = trangThaiSoDong(locBang);
    setXemDong({
      tieuDe: `${n ? n.ten : 'Tất cả nhóm'} · ${c.loai ? NHAN_LOAI_O[c.loai] : c.trangThai ? c.trangThai.map(t => NHAN_TRANG_THAI[t]).join(', ') : 'mọi dòng PR'}`,
      loc: l, loai: c.loai ?? null,
    });
  }, [locBang]);

  const datSap = (khoa: typeof sap.khoa) => setSap(s => (s.khoa === khoa ? { khoa, giam: !s.giam } : { khoa, giam: khoa !== 'ten' }));
  const IconSap = ({ khoa }: { khoa: typeof sap.khoa }) => (sap.khoa !== khoa ? <ArrowUpDown size={12} className="ml-1 opacity-40" />
    : sap.giam ? <ArrowDown size={12} className="ml-1" /> : <ArrowUp size={12} className="ml-1" />);

  const tong = du?.tong;
  const dangTai = tt.loai === 'dang_tai';
  // Cột tiêu hao TB 3 tháng (bảng xuat_tieu_hao_vt): chỉ khi đã có bảng + có quyền giá
  const coTieuHao = !!du?.tieuHao && coGia;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-[#f5f6f8]">
      {/* Đầu trang */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="h-3 w-3 rounded-sm bg-emerald-600" aria-hidden />
            <h1 className="page-title">Đặt – Mua vật tư</h1>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            Dòng PR theo nhóm vật tư SAP · triệu đồng
            {du?.capNhat && <> · dữ liệu cập nhật {fmtLuc(du.capNhat)}</>}
            {dangTai && <> · đang tải…</>}
          </p>
        </div>
        <button type="button" onClick={() => setLanTai(n => n + 1)} disabled={dangTai} aria-label="Tải lại" title="Tải lại"
          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50">
          <RefreshCw size={15} className={dangTai ? 'animate-spin' : ''} />
        </button>
      </div>

      {tt.loai === 'loi' && tt.chuaQuyen ? (
        <div className="m-6 rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-800">{tt.thongBao}</div>
      ) : (
        <div className="space-y-4 p-4 sm:p-6">
          {/* Bộ lọc */}
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <label className="flex flex-col text-xs font-semibold text-slate-600">Ngày PR từ
              <input type="date" value={loc.tu ?? ''} max={loc.den || undefined} onChange={e => datLoc('tu', e.target.value || undefined)}
                className="mt-0.5 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-normal text-slate-800" />
            </label>
            <label className="flex flex-col text-xs font-semibold text-slate-600">đến
              <input type="date" value={loc.den ?? ''} min={loc.tu || undefined} onChange={e => datLoc('den', e.target.value || undefined)}
                className="mt-0.5 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-normal text-slate-800" />
            </label>
            <label className="flex flex-col text-xs font-semibold text-slate-600">Công trình (mã CT, SDC…)
              <input value={oCt} onChange={e => setOCt(e.target.value)} onBlur={apCt} onKeyDown={e => { if (e.key === 'Enter') apCt(); }}
                placeholder="CT26-055, XDCB" className="mt-0.5 w-44 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-normal text-slate-800" />
            </label>
            <div className="flex flex-col text-xs font-semibold text-slate-600">Nhóm SAP
              <div className="mt-0.5">
                <DashboardFilter label="Nhóm" options={dsNhom.map(([, t]) => t)}
                  selectedValues={(loc.nhom ?? []).map(m => tenNhom[m] ?? m)}
                  onChange={v => datLoc('nhom', dsNhom.filter(([, t]) => v.includes(t)).map(([m]) => m))}
                  onClearAll={() => datLoc('nhom', [])} />
              </div>
            </div>
            <div className="flex flex-col text-xs font-semibold text-slate-600">Tình trạng
              <div className="mt-0.5">
                <DashboardFilter label="Tình trạng" options={TRANG_THAI_PR.filter(t => t !== 'huy' || loc.anHuy === false).map(t => NHAN_TRANG_THAI[t])}
                  selectedValues={(loc.trangThai ?? []).map(t => NHAN_TRANG_THAI[t])}
                  onChange={v => datLoc('trangThai', TRANG_THAI_PR.filter(t => v.includes(NHAN_TRANG_THAI[t])))}
                  onClearAll={() => datLoc('trangThai', [])} />
              </div>
            </div>
            <label className="flex min-w-[14rem] flex-1 flex-col text-xs font-semibold text-slate-600">Tìm số PR / PO / mã SAP / tên (nhiều, cách dấu cách)
              <span className="relative mt-0.5">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={oTim} onChange={e => setOTim(e.target.value)} onBlur={apTim} onKeyDown={e => { if (e.key === 'Enter') apTim(); }}
                  placeholder="1400017476 4100031157 100000469285" className="w-full rounded-lg border border-slate-200 py-1.5 pl-7 pr-2 text-sm font-normal text-slate-800" />
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-1 text-sm text-slate-700">
              {([['an806', 'Hiện 806 Gia công'], ['an401', 'Hiện 401 CCDC'], ['an800', 'Hiện mã 800…'], ['anHuy', 'Hiện dòng HỦY']] as const).map(([k, l]) => (
                <label key={k} className="inline-flex items-center gap-1.5">
                  <input type="checkbox" className="h-3.5 w-3.5" checked={loc[k] === false}
                    onChange={e => datLoc(k, e.target.checked ? false : undefined)} />{l}
                </label>
              ))}
            </div>
            {soLoc > 0 && (
              <button type="button" onClick={xoaLoc} className="mb-0.5 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
                <X size={14} /> Bỏ lọc ({soLoc})
              </button>
            )}
          </div>

          {tt.loai === 'loi' && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{tt.thongBao}</div>}

          {/* Thẻ số */}
          {tong && (
            <div className={`grid gap-3 sm:grid-cols-3 ${coGia ? 'xl:grid-cols-6' : 'xl:grid-cols-5'}`}>
              <TheSo cham="bg-amber-500" nhan="PR chưa mua" so={fmtInt(tong.chuaMua)} donVi="dòng"
                phu={<><b className="text-amber-700">{fmtInt(tong.prChuaPoQua14)}</b> dòng quá 14 ngày chưa có PO</>}
                onClick={() => moO(COT_BANG.find(c => c.khoa === 'chuaMua')!, null)} />
              <TheSo cham="bg-sky-500" nhan="Đang về" so={fmtInt(TT_VE_CHUA_TRE.reduce((a, t) => a + tong[t], 0))} donVi="dòng"
                phu={<>đúng hẹn {tong.ptDungHen === null ? '—' : `${tong.ptDungHen.toFixed(1)}%`} · {fmtInt(tong.motPhan)} về một phần
                  {tong.theoNhuCau + tong.giaCong > 0 && <> · {fmtInt(tong.theoNhuCau + tong.giaCong)} theo nhu cầu SX / gia công</>}</>}
                onClick={() => setXemDong({ tieuDe: 'Tất cả nhóm · Đang về (có PO, chưa về đủ, chưa trễ)', loc: { ...locBang, trangThai: TT_VE_CHUA_TRE } })} />
              <TheSo cham="bg-red-600" nhan="Trễ hẹn" so={fmtInt(tong.tre)} donVi="dòng" mau="text-red-600"
                phu="có PO, quá hạn về mà chưa về đủ" onClick={() => moO(COT_BANG.find(c => c.khoa === 'tre')!, null)} />
              <TheSo cham="bg-rose-500" nhan="Đóng thiếu" so={fmtInt(tong.dongThieu)} donVi="dòng"
                phu={<>SAP đóng mà nhận &lt; yêu cầu · +{fmtInt(tong.dongKhongPo)} đóng không PO</>}
                onClick={() => moO(COT_BANG.find(c => c.khoa === 'dongThieu')!, null)} />
              {coGia && (
                <TheSo cham="bg-emerald-600" nhan="Giá trị chờ về" so={fmtTrieu(tong.giaTriCho) || '0'} donVi="triệu"
                  phu="SL còn lại × đơn giá của dòng đang về" onClick={() => moO(COT_BANG.find(c => c.khoa === 'giaTriCho')!, null)} />
              )}
              <TheSo cham="bg-indigo-500" nhan="Về 7 ngày tới" so={fmtInt(tong.ve7Ngay)} donVi="dòng"
                phu={homNay ? `hạn về ${fmtNgay(homNay)} → +7 ngày` : 'hạn về trong 7 ngày'}
                onClick={() => setXemDong({ tieuDe: `Tất cả nhóm · ${NHAN_LOAI_O.ve7Ngay}`, loc: locBang, loai: 've7Ngay' })} />
            </div>
          )}

          {/* Biểu đồ tháng */}
          <BieuDoThang tai={thang} coGia={coGia} chon={thangChon} onChon={t => setThangChon(c => (c === t ? null : t))} />

          {/* Bảng theo nhóm SAP */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="font-bold text-slate-900">Theo nhóm vật tư SAP</p>
              <p className="text-xs text-slate-500">
                {thangChon ? <>PR tạo {nhanThangNgan(thangChon)} · </> : null}
                bấm tên nhóm xem từng mã · bấm số xem dòng PR
                {loc.anHuy !== false ? ' · không tính dòng HỦY' : ' · Số dòng PR không gồm HỦY'}
              </p>
              {thangChon && (
                <button type="button" onClick={() => setThangChon(null)} className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
                  Bỏ lọc tháng {nhanThangNgan(thangChon)} <X size={12} />
                </button>
              )}
              {dangTai && <Loader2 size={14} className="animate-spin text-slate-400" />}
            </div>
            <div className={`${bang.khung} max-h-[70vh]`}>
              <table className={bang.table}>
                <thead className={bang.thead}>
                  <tr>
                    <th className={`${bang.thC} w-12`}>STT</th>
                    <th className={`${bang.thB} sticky left-0 z-30 bg-emerald-300 text-left`}>
                      <button type="button" onClick={() => datSap('ten')} className="inline-flex items-center">Nhóm SAP<IconSap khoa="ten" /></button>
                    </th>
                    <th className={bang.thC}>
                      <button type="button" onClick={() => datSap('soMa')} className="inline-flex items-center">Số mã<IconSap khoa="soMa" /></button>
                    </th>
                    {cot.map(c => (
                      <th key={c.khoa} className={`${bang.thC} whitespace-nowrap`}>
                        <button type="button" onClick={() => datSap(c.khoa)} className="inline-flex flex-col items-center leading-tight">
                          <span className="inline-flex items-center">{c.nhan}<IconSap khoa={c.khoa} /></span>
                          <span className={`text-xs font-semibold text-slate-700 ${c.donVi ? '' : 'invisible'}`}>{c.donVi ?? '·'}</span>
                        </button>
                      </th>
                    ))}
                    {coTieuHao && (
                      <th className={`${bang.thC} whitespace-nowrap`} title={`Xuất tiêu hao (261 − 262) trung bình 3 tháng đủ ${du?.tieuHao?.thangTb3.join(', ') ?? ''}`}>
                        Tiêu hao TB<br /><span className="text-xs font-semibold text-slate-700">3 tháng · triệu</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {nhom.map((n, i) => (
                    <tr key={n.ma} className="group hover:bg-slate-50">
                      <td className={bang.tdSo}>{i + 1}</td>
                      <td className={`${bang.tdB} sticky left-0 z-[1] min-w-[14rem] bg-white group-hover:bg-slate-50`}>
                        <button type="button" onClick={() => setXemNhom({ ma: n.ma, ten: n.ten })} title="Bấm xem từng mã trong nhóm"
                          className="text-left font-semibold underline decoration-slate-300 decoration-dotted underline-offset-2 hover:text-blue-700">{n.ten}</button>
                      </td>
                      <td className={bang.tdSo}>{n.soMa ? fmtInt(n.soMa) : ''}</td>
                      {cot.map(c => <OSo key={c.khoa} cot={c} v={n[c.khoa]} onClick={() => moO(c, n)} />)}
                      {coTieuHao && <td className={`${bang.tdSo} text-orange-700`}>{fmtTrieu(n.tieuHaoTb3)}</td>}
                    </tr>
                  ))}
                  {!nhom.length && !dangTai && (
                    <tr><td colSpan={cot.length + 3 + (coTieuHao ? 1 : 0)} className={`${bang.tdB} py-8 text-center text-slate-500`}>Không có dòng PR nào khớp bộ lọc.</td></tr>
                  )}
                </tbody>
                {tong && nhom.length > 0 && (
                  <tfoot className={bang.tfoot}>
                    <tr>
                      <td colSpan={2} className={`${bang.tdB} text-center`}>TỔNG ({nhom.length} nhóm)</td>
                      <td className={bang.tdSo}>{fmtInt(tong.soMa)}</td>
                      {cot.map(c => <OSo key={c.khoa} cot={c} v={tong[c.khoa]} onClick={() => moO(c, null)} />)}
                      {coTieuHao && <td className={bang.tdSo}>{fmtTrieu(tong.tieuHaoTb3)}</td>}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Trạng thái tính giống Bảng KHNK / cửa sổ vật tư hạng mục. Đang về = có PO, chưa tới hạn (Về một phần: đã nhận một phần, chưa tới hạn). Trễ hẹn = có PO, quá hạn về (ngày dự kiến PMH, Team PR ghi ngày muộn hơn thì theo ngày đó) mà chưa về đủ.
              Theo nhu cầu SX = quá hạn nhưng ghi chú cho về theo nhu cầu SX / dùng trước tồn kho (không tính trễ). Gia công ngoài = nhóm 806 hoặc ghi chú GC (không tính trễ).
              Đã về đủ = SL nhận SAP ≥ SL yêu cầu, hoặc kho đã báo về đủ / Team PR ghi HOÀN THÀNH (chờ nhập SAP). Đóng thiếu = SAP đóng mà nhận &lt; yêu cầu.
              Tạm dừng / CCLD = PO hủy / tạm ngưng / pending hoặc cung cấp lắp đặt (không còn chờ về). % đúng hẹn = (đúng hẹn + về một phần) / (đúng hẹn + về một phần + trễ).
              Cần ≤ 14 ngày = còn chờ (chưa mua / đang về) có ngày cần vật tư từ nay tới 14 ngày sau, gồm cả ngày cần đã qua.
            </p>
          </div>
        </div>
      )}

      {xemNhom && (
        <CuaSoMa nhom={xemNhom} loc={locBang} coGia={coGia} tren={!xemDong} onClose={() => setXemNhom(null)}
          onXemDong={setXemDong} />
      )}
      {xemDong && <CuaSoDong yc={xemDong} homNay={homNay} onClose={() => setXemDong(null)} />}
    </div>
  );
};

export default DatMua;

// ============================================================================
// Thành phần
// ============================================================================
const TheSo = ({ cham, nhan, so, donVi, phu, mau = 'text-slate-900', onClick }: {
  cham: string; nhan: string; so: string; donVi: string; phu: React.ReactNode; mau?: string; onClick?: () => void;
}) => (
  <button type="button" onClick={onClick} title="Bấm xem danh sách dòng PR"
    className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50">
    <p className="flex items-center gap-2 text-sm font-semibold text-slate-700"><span className={`h-2.5 w-2.5 rounded-full ${cham}`} aria-hidden />{nhan}</p>
    <p className={`mt-1 text-2xl font-bold tabular-nums ${mau}`}>{so} <span className="text-sm font-medium text-slate-500">{donVi}</span></p>
    <p className="mt-1 text-sm text-slate-600">{phu}</p>
  </button>
);

/** Ô số bảng chính: 0 để trống; bấm được khi cột có trạng thái / loại ô */
const OSo = ({ cot, v, onClick }: { cot: CotSo; v: number | null; onClick: () => void }) => {
  const chu = fmtO(cot, v);
  const bam = !!chu && (cot.trangThai || cot.loai || cot.khoa === 'soDong');
  let cls = `${bang.tdSo} ${cot.mau ?? ''}`;
  if (cot.phanTram && v !== null) cls += v < 50 ? ' text-red-600' : v < 80 ? ' text-amber-700' : ' text-emerald-700';
  return (
    <td className={cls}>
      {bam ? (
        <button type="button" onClick={onClick} title="Bấm xem danh sách dòng PR"
          className={`${bang.soBam} rounded px-1 hover:bg-blue-50 hover:text-blue-700`}>{chu}</button>
      ) : chu}
    </td>
  );
};

const NhanTt = ({ tt }: { tt: TrangThaiPr }) => (
  <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${MAU_TRANG_THAI[tt]}`}>{NHAN_TRANG_THAI[tt]}</span>
);

/** Đóng cửa sổ bằng Esc (chỉ cửa sổ trên cùng) */
const useEsc = (bat: boolean, onClose: () => void) => {
  useEffect(() => {
    if (!bat) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [bat, onClose]);
};

// ---------------------------------------------------------------------------
// Biểu đồ PR tạo / hàng về theo tháng
// ---------------------------------------------------------------------------
const SO_THANG_HIEN = 18;
const BieuDoThang = ({ tai, coGia, chon, onChon }: { tai: TaiThang; coGia: boolean; chon: string | null; onChon: (t: string) => void }) => {
  const [kieu, setKieu] = useState<'dong' | 'giaTri'>('dong');
  const du = tai.loai === 'xong' ? tai.du : null;
  const laGiaTri = kieu === 'giaTri' && coGia;
  const ds = useMemo(() => (du?.thang ?? []).slice(-SO_THANG_HIEN).map(t => ({
    ...t, nhan: nhanThangNgan(t.thang),
    pr: laGiaTri ? t.prGiaTri ?? 0 : t.prDong, ve: laGiaTri ? t.veGiaTri ?? 0 : t.veDong,
  })), [du, laGiaTri]);
  const fmt = (v: number) => (laGiaTri ? fmtTrieu(v) : v ? fmtInt(v) : '');
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-bold text-slate-900">PR tạo và hàng về theo tháng</p>
        <p className="text-xs text-slate-500">{laGiaTri ? 'triệu đồng' : 'số dòng PR'} · PR theo ngày PR, hàng về theo ngày thực tế về · bấm cột để lọc bảng theo tháng PR</p>
        <span className="ml-auto inline-flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-sky-500" />PR tạo</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-emerald-500" />Hàng về</span>
          {coGia && (
            <span className="inline-flex overflow-hidden rounded-md border border-slate-300" role="group" aria-label="Đơn vị biểu đồ">
              {([['dong', 'Số dòng'], ['giaTri', 'Giá trị']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setKieu(k)} aria-pressed={kieu === k}
                  className={`px-2 py-0.5 font-semibold ${kieu === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{l}</button>
              ))}
            </span>
          )}
        </span>
      </div>
      <div className="mt-1 h-56">
        {tai.loai === 'loi' ? <p className="flex items-center justify-center gap-2 py-16 text-sm text-red-600"><AlertTriangle size={15} />{tai.thongBao}</p>
          : !du ? <p className="py-16 text-center text-sm text-slate-400">Đang tải…</p> : !ds.length ? <p className="py-16 text-center text-sm text-slate-400">Không có số liệu.</p> : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ds} margin={{ top: 18, right: 8, left: 8, bottom: 4 }} barCategoryGap="22%"
              onClick={(e: { activeTooltipIndex?: number } | null) => { const x = e?.activeTooltipIndex; if (x != null && ds[x]) onChon(ds[x].thang); }}>
              <XAxis dataKey="nhan" axisLine={{ stroke: '#e2e8f0' }} tickLine={false} interval={dangMayTinhBang() ? 'equidistantPreserveStart' : 0} tick={{ fontSize: 12, fill: '#475569' }} />
              <YAxis hide domain={[0, (m: number) => (m > 0 ? m * 1.1 : 1)]} />
              <Tooltip cursor={{ fill: '#f1f5f9' }} content={({ active, payload }) => {
                const c = active ? (payload?.[0]?.payload as (typeof ds)[number] | undefined) : undefined;
                if (!c) return null;
                return (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                    <p className="font-bold text-slate-900">Tháng {c.thang.slice(5)}/{c.thang.slice(0, 4)}</p>
                    <p className="tabular-nums text-slate-700">PR tạo: <b>{fmtInt(c.prDong)}</b> dòng{coGia && c.prGiaTri != null ? ` · ${fmtTrieu(c.prGiaTri) || 0} triệu` : ''}</p>
                    <p className="tabular-nums text-slate-700">Hàng về: <b>{fmtInt(c.veDong)}</b> dòng{coGia && c.veGiaTri != null ? ` · ${fmtTrieu(c.veGiaTri) || 0} triệu` : ''}</p>
                    <p className="mt-1 text-slate-400">Bấm để lọc bảng theo PR tạo tháng này</p>
                  </div>
                );
              }} />
              {(['pr', 've'] as const).map(k => (
                <Bar key={k} dataKey={k} fill={k === 'pr' ? '#0ea5e9' : '#10b981'} maxBarSize={28} radius={[4, 4, 0, 0]} isAnimationActive={false} className="cursor-pointer">
                  {ds.map(c => <Cell key={c.thang} fillOpacity={chon && c.thang !== chon ? 0.35 : 1} />)}
                  <LabelList dataKey={k} position="top" fontSize={10} fill="#334155" formatter={(v: number) => fmt(v)} />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Cửa sổ bảng mã trong 1 nhóm
// ---------------------------------------------------------------------------
const CuaSoMa = ({ nhom, loc, coGia, tren, onClose, onXemDong }: {
  nhom: { ma: string; ten: string }; loc: BoLocDatMua; coGia: boolean; tren: boolean; onClose: () => void; onXemDong: (x: XemDong) => void;
}) => {
  const [du, setDu] = useState<TheoMa | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [tim, setTim] = useState('');
  const locNhom = useMemo(() => ({ ...loc, nhom: [nhom.ma] }), [loc, nhom.ma]);
  useEsc(tren, onClose);
  useEffect(() => {
    const ac = new AbortController();
    layTheoMa(locNhom, ac.signal).then(setDu).catch(e => { if (!ac.signal.aborted) setLoi(thongBaoLoi(e)); });
    return () => ac.abort();
  }, [locNhom]);
  const ds = useMemo(() => {
    const t = tim.trim().toLowerCase();
    const tat = du?.ma ?? [];
    return t ? tat.filter(m => `${m.ma ?? ''} ${m.ten ?? ''}`.toLowerCase().includes(t)) : tat;
  }, [du, tim]);
  const xem = (m: DongMa, trangThai?: TrangThaiPr[], tieuDe?: string) => onXemDong({
    tieuDe: `${m.ma ?? '(không mã SAP)'} · ${m.ten ?? ''}${tieuDe ? ` · ${tieuDe}` : ''}`,
    loc: { ...locNhom, ...(trangThai ? { trangThai } : {}) }, ma: m.ma ?? '-', dvt: m.dvt ?? '-',
  });
  const cotTt: [TrangThaiPr, string][] = [['chuaMua', 'Chưa mua'], ['dungHen', 'Đang về'], ['tre', 'Trễ'], ['motPhan', 'Về 1 phần'], ['du', 'Về đủ'], ['dongThieu', 'Đóng thiếu']];
  // Cột tiêu hao (bảng xuat_tieu_hao_vt): ẩn khi chưa có bảng
  const coTh = !!du?.tieuHao;
  const tieuDeCot = ['STT', 'Mã SAP', 'Tên vật tư', 'ĐVT', 'Số dòng PR', ...cotTt.map(c => c[1]), 'SL chờ về', 'Hẹn về gần nhất', ...(coGia ? ['Giá trị PR (triệu)', 'Chờ về (triệu)'] : []),
    ...(coTh ? ['SL tiêu hao TB 3 tháng', ...(coGia ? ['Tiêu hao TB 3 tháng (triệu)'] : []), 'Tồn hiện tại', 'Số tháng đủ dùng'] : [])];
  const homNay = du?.homNay ?? '';
  return (
    <div className={bang.cuaSoNen} onClick={onClose}>
      <div className={bang.cuaSoKhung} onClick={e => e.stopPropagation()}>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-slate-900">{nhom.ten}</p>
            <p className="text-sm text-slate-500">Từng mã vật tư (mã SAP + ĐVT) · bấm mã hoặc số để xem dòng PR{du ? ` · ${fmtInt(du.ma.length)} mã` : ''}{du?.catBot ? ' (chỉ hiện 3.000 mã nhiều dòng còn chờ nhất)' : ''}</p>
          </div>
          <label className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={tim} onChange={e => setTim(e.target.value)} placeholder="Tìm mã / tên" className="w-56 rounded-lg border border-slate-200 py-1.5 pl-7 pr-2 text-sm" />
          </label>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100" aria-label="Đóng">×</button>
        </div>
        {loi ? <p className="text-sm text-red-600">{loi}</p> : !du ? <p className="text-sm text-slate-500">Đang tải…</p> : (
          <div className={`${bang.khung} min-h-0 flex-1`}>
            <table className={`${bang.table} ${bang.cuaSoBang}`}>
              <thead className={bang.thead}>
                <tr>
                  {tieuDeCot.map(h => <th key={h} className={`${bang.thC} whitespace-nowrap`}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {ds.map((m, i) => {
                  const con = soNgayToi(m.veGanNhat, homNay);
                  return (
                    <tr key={`${m.ma ?? '-'}|${m.dvt ?? ''}`} className="hover:bg-slate-50">
                      <td className={bang.tdSo}>{i + 1}</td>
                      <td className={bang.tdSo}>
                        <button type="button" onClick={() => xem(m)} className={`${bang.soBam} hover:text-blue-700`}>{m.ma ?? '(không mã)'}</button>
                      </td>
                      <td className={`${bang.tdB} min-w-[18rem]`}>{m.ten ?? ''}</td>
                      <td className={`${bang.tdB} whitespace-nowrap text-center`}>{m.dvt ?? ''}</td>
                      <td className={bang.tdSo}>{fmtInt(m.soDong)}</td>
                      {cotTt.map(([k, l]) => (
                        <td key={k} className={`${bang.tdSo} ${k === 'tre' && m.tre ? 'text-red-600' : ''}`}>
                          {m[k] ? <button type="button" onClick={() => xem(m, [k], l)} className={`${bang.soBam} hover:text-blue-700`}>{fmtInt(m[k])}</button> : ''}
                        </td>
                      ))}
                      <td className={bang.tdSo}>{m.slCho ? m.slCho.toLocaleString('en-US', { maximumFractionDigits: 3 }) : ''}</td>
                      <td className={`${bang.tdSo} ${con !== null && con <= 7 ? 'font-semibold text-indigo-700' : ''}`}>{fmtNgay(m.veGanNhat)}</td>
                      {coGia && <td className={bang.tdSo}>{fmtTrieu(m.giaTriPr)}</td>}
                      {coGia && <td className={bang.tdSo}>{fmtTrieu(m.giaTriCho)}</td>}
                      {coTh && <td className={bang.tdSo}>{fmtSl(m.slTieuHaoTb3)}{m.slTieuHaoTb3 && m.dvtTieuHao && m.dvtTieuHao !== (m.dvt ?? '').trim().toUpperCase() ? ` ${m.dvtTieuHao}` : ''}</td>}
                      {coTh && coGia && <td className={bang.tdSo}>{fmtTrieu(m.tieuHaoTb3)}</td>}
                      {coTh && <td className={bang.tdSo}>{fmtSl(m.tonHienTai)}{m.tonHienTai && m.dvtTon && m.dvtTon !== (m.dvt ?? '').trim().toUpperCase() ? ` ${m.dvtTon}` : ''}</td>}
                      {coTh && (
                        <td className={`${bang.tdSo} ${mucThangDuDung(m.soThangDuDung) === 'do' ? 'bg-red-50 font-bold text-red-600' : mucThangDuDung(m.soThangDuDung) === 'cam' ? 'font-semibold text-amber-700' : ''}`}>
                          {fmtThangDuDung(m.soThangDuDung)}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {!ds.length && <tr><td colSpan={tieuDeCot.length} className={`${bang.tdB} py-6 text-center text-slate-500`}>Không có mã nào.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-500">
          SL chỉ cộng trong cùng mã và cùng ĐVT. SL chờ về = SL còn lại của dòng có PO chưa về đủ.
          {coTh && <> Tiêu hao TB 3 tháng = xuất 261 − hoàn trả 262 trung bình 3 tháng đủ ({du?.tieuHao?.thangTb3.join(', ')}), theo mã (ĐVT kho SAP — khác ĐVT PR thì ghi kèm).
            Số tháng đủ dùng = tồn hiện tại / SL tiêu hao TB, dưới 1 tháng tô đỏ.</>}
        </p>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Cửa sổ danh sách dòng PR (phân trang + xuất Excel)
// ---------------------------------------------------------------------------
const CO_TRANG = 200;
const CO_EXCEL = 30000;
const CuaSoDong = ({ yc, homNay, onClose }: { yc: XemDong; homNay: string; onClose: () => void }) => {
  const [trang, setTrang] = useState(1);
  const [du, setDu] = useState<DanhSachDong | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangXuat, setDangXuat] = useState(false);
  const { showToast } = useToast();
  useEsc(true, onClose);
  useEffect(() => {
    const ac = new AbortController();
    setLoi(null);
    layDong(yc.loc, { ma: yc.ma, dvt: yc.dvt, loai: yc.loai, trang, co: CO_TRANG }, ac.signal)
      .then(setDu).catch(e => { if (!ac.signal.aborted) setLoi(thongBaoLoi(e)); });
    return () => ac.abort();
  }, [yc, trang]);
  const coGia = du?.coGia === true;
  const cot = useMemo(() => cotDongHien(coGia), [coGia]);
  const soTrang = du ? Math.max(1, Math.ceil(du.tong / CO_TRANG)) : 1;

  const xuatExcel = async () => {
    setDangXuat(true);
    try {
      const tat = await layDong(yc.loc, { ma: yc.ma, dvt: yc.dvt, loai: yc.loai, trang: 1, co: CO_EXCEL });
      const XLSX = await import('xlsx');
      const aoa = bangExcelDong(tat.dong, tat.coGia);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = aoa[0].map((_, c) => {
        let max = 8;
        for (let r = 0; r < Math.min(aoa.length, 400); r++) max = Math.max(max, String(aoa[r][c] ?? '').length);
        return { wch: Math.min(48, max + 1) };
      });
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: aoa[0].length - 1 } }) };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Dòng PR');
      XLSX.writeFile(wb, `dat-mua_${tenFileAnToan(yc.tieuDe)}_${homNay || 'hom-nay'}.xlsx`);
      if (tat.tong > tat.dong.length) showToast(`File chỉ có ${fmtInt(tat.dong.length)} / ${fmtInt(tat.tong)} dòng đầu`, 'info');
    } catch (e) {
      console.error('Lỗi xuất Excel Đặt – Mua:', e);
      showToast('Không xuất được file Excel, hãy thử lại', 'error');
    } finally {
      setDangXuat(false);
    }
  };

  return (
    <div className={bang.cuaSoNen} onClick={onClose}>
      <div className={bang.cuaSoKhung} onClick={e => e.stopPropagation()}>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-slate-900">{yc.tieuDe}</p>
            <p className="text-sm text-slate-500">{du ? `${fmtInt(du.tong)} dòng PR` : 'Đang tải…'}{yc.phu ? ` · ${yc.phu}` : ''}</p>
          </div>
          <button type="button" onClick={xuatExcel} disabled={!du?.tong || dangXuat}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {dangXuat ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {dangXuat ? 'Đang xuất…' : 'Xuất Excel'}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100" aria-label="Đóng">×</button>
        </div>
        {loi ? <p className="flex items-center gap-2 text-sm text-red-600"><AlertTriangle size={15} />{loi}</p> : (
          <div className={`${bang.khung} min-h-0 flex-1`}>
            <table className={bang.table}>
              <thead className={bang.thead}>
                <tr>
                  <th className={bang.thC}>STT</th>
                  {cot.map(c => <th key={c.khoa} className={`${bang.thC} whitespace-nowrap`}>{c.nhan}</th>)}
                </tr>
              </thead>
              <tbody>
                {(du?.dong ?? []).map((d, i) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className={bang.tdSo}>{(trang - 1) * CO_TRANG + i + 1}</td>
                    {cot.map(c => {
                      if (c.kieu === 'tt') return <td key={c.khoa} className={`${bang.tdB} text-center`}><NhanTt tt={d.tt} /></td>;
                      const chu = chuODong(c, d);
                      const so = c.kieu === 'so' || c.kieu === 'tien' || c.kieu === 'ma' || c.kieu === 'ngay';
                      const treHan = c.khoa === 'han' && d.tt === 'tre';
                      return (
                        <td key={c.khoa} className={`${so ? bang.tdSo : `${bang.tdB} text-sm`} ${c.rong ?? ''} ${treHan ? 'font-semibold text-red-600' : ''}`}>{chu}</td>
                      );
                    })}
                  </tr>
                ))}
                {du && !du.dong.length && <tr><td colSpan={cot.length + 1} className={`${bang.tdB} py-6 text-center text-slate-500`}>Không có dòng nào.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {soTrang > 1 && (
          <div className="flex items-center justify-end gap-2 text-sm text-slate-600">
            <button type="button" disabled={trang <= 1} onClick={() => setTrang(t => t - 1)} className="rounded-md border border-slate-200 p-1 disabled:opacity-40" aria-label="Trang trước"><ChevronLeft size={16} /></button>
            <span>Trang {trang} / {soTrang}</span>
            <button type="button" disabled={trang >= soTrang} onClick={() => setTrang(t => t + 1)} className="rounded-md border border-slate-200 p-1 disabled:opacity-40" aria-label="Trang sau"><ChevronRight size={16} /></button>
          </div>
        )}
      </div>
    </div>
  );
};
