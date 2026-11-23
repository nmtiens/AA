import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { dangMayTinhBang } from '../../services/mayTinhBang';
import { AlertTriangle, ChevronLeft, ChevronRight, Database, Download, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as bang from '../shared/bangBaoCao';
import { DashboardFilter } from '../Dashboard/components/shared/DashboardFilter';
import { useToast } from '../../context/ToastContext';
import { fmtInt } from '../../utils/format';
import {
  layChiTietTieuHao, layTongHopTieuHao, LoiVatTu,
  type BoLocTieuHao, type ChiTietTieuHao, type ChuaCoTieuHao, type DongTieuHao, type MvtTieuHao, type TheoTieuHao, type TongHopTieuHao,
} from '../../services/vatTuApi';
import { fmtNgay, fmtTrieu, nhanThangNgan, tachCongTrinh, tenFileAnToan } from './xuLyDatMua';
import {
  bangExcelChungTu, chuOChungTu, cotChungTuHien, duLieuBieuDo, fmtPt, fmtSoO, fmtThangDuDung, ghiChu262, giaoThang, locCuaDong,
  mucThangDuDung, mvtCuaO, nhanKhoangTb3, phanTramDoi, soCuaO, thangCuoi, type CheDoO,
} from './xuLyTieuHao';

// ============================================================================
// XUẤT TIÊU HAO VẬT TƯ (/vat-tu/tieu-hao) — đợt 4 module Vật tư (thiết kế 21/11/2026, "Khía cạnh 3")
// Nguồn: bảng xuat_tieu_hao_vt (file tháng MB51 14_XUAT_TIEU_HAO_SAP do người dùng tự xuất), gộp ở máy chủ
// (/api/vat-tu/tieu-hao/*). Tiêu hao = xuất 261 trừ hoàn trả 262; hao hụt Z14 hiện riêng; % hao hụt = Z14 / (tiêu hao
// + Z14). Trục nhóm SAP 3 số; mặc định ẩn 806 Gia công / 401 CCDC và BTP / TP (mã 200* / 300* xuất lại vào lệnh — trùng
// vật tư đã xuất cho lệnh BTP). Ô số chỉ cộng tiêu hao (hoặc chỉ hao hụt khi lọc Loại xuất = Z14), bấm ô ra đúng các dòng đó. Tiền triệu đồng; không có quyền xem giá => bảng
// đếm số dòng chứng từ thay giá trị.
// Bấm cột biểu đồ => lọc theo tháng; bấm tên nhóm => bảng mã của nhóm; bấm tên công trình => bảng HEX; bấm số => danh
// sách chứng từ (xuất Excel).
// ============================================================================

type TaiTrangThai = { loai: 'dang_tai' } | { loai: 'xong' } | { loai: 'chua_co' } | { loai: 'loi'; thongBao: string; chuaQuyen: boolean };
type TabTh = 'nhom' | 'ct' | 'xuong' | 'ma';
const TAB: [TabTh, string][] = [['nhom', 'Theo nhóm'], ['ct', 'Theo công trình'], ['xuong', 'Theo xưởng'], ['ma', 'Theo mã']];
const TEN_COT: Record<TheoTieuHao, string> = { nhom: 'Nhóm SAP', ct: 'Công trình', hex: 'HEX', xuong: 'Xưởng', ma: 'Mã vật tư', thang: 'Tháng' };

/** Yêu cầu mở danh sách chứng từ */
type XemChungTu = { tieuDe: string; loc: BoLocTieuHao; ma?: string; dvt?: string };
/** Yêu cầu mở bảng con (mã của 1 nhóm / HEX của 1 công trình) */
type XemCon = { tieuDe: string; theo: TheoTieuHao; loc: BoLocTieuHao };

const thongBaoLoi = (e: unknown) => (e instanceof LoiVatTu ? e.message : 'Không tải được số liệu, hãy thử lại');
const laChuaQuyen = (e: unknown) => e instanceof LoiVatTu && e.chuaCoQuyen;
const laChuaCo = (x: TongHopTieuHao | ChiTietTieuHao | ChuaCoTieuHao): x is ChuaCoTieuHao => x.chuaCo === true;
const fmtLuc = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

const TieuHao: React.FC = () => {
  const [loc, setLoc] = useState<BoLocTieuHao>({});
  const [tab, setTab] = useState<TabTh>('nhom');
  const [oCt, setOCt] = useState('');
  const [oTim, setOTim] = useState('');
  const [thangChon, setThangChon] = useState<string | null>(null);
  const [du, setDu] = useState<TongHopTieuHao | null>(null);
  const [duBieuDo, setDuBieuDo] = useState<TongHopTieuHao | null>(null);
  const [tt, setTt] = useState<TaiTrangThai>({ loai: 'dang_tai' });
  const [lanTai, setLanTai] = useState(0);
  const [xemCt, setXemCt] = useState<XemChungTu | null>(null);
  const [xemCon, setXemCon] = useState<XemCon | null>(null);
  // Mọi nhóm từng thấy (đang lọc nhóm thì máy chủ chỉ trả nhóm đã chọn — danh sách chọn vẫn phải đủ)
  const [tenNhom, setTenNhom] = useState<Record<string, string>>({});

  // Bảng + thẻ số = bộ lọc trang + tháng chọn trên biểu đồ; biểu đồ không theo tháng chọn
  const locBang = useMemo<BoLocTieuHao>(() => {
    const k = thangChon ? giaoThang(loc, thangChon) : null;
    return k ? { ...loc, ...k } : loc;
  }, [loc, thangChon]);

  // Biểu đồ (luôn theo nhóm)
  useEffect(() => {
    const ac = new AbortController();
    layTongHopTieuHao(loc, 'nhom', ac.signal)
      .then(d => {
        if (laChuaCo(d)) { setDuBieuDo(null); return; }
        setDuBieuDo(d);
        setTenNhom(cu => {
          const moi = { ...cu };
          for (const n of d.dong) moi[n.khoa] = n.ten;
          return moi;
        });
      })
      .catch(() => { if (!ac.signal.aborted) setDuBieuDo(null); });
    return () => ac.abort();
  }, [loc, lanTai]);

  // Bảng + thẻ số theo tab
  useEffect(() => {
    const ac = new AbortController();
    setTt({ loai: 'dang_tai' });
    layTongHopTieuHao(locBang, tab, ac.signal)
      .then(d => {
        if (laChuaCo(d)) { setDu(null); setTt({ loai: 'chua_co' }); return; }
        setDu(d);
        setTt({ loai: 'xong' });
      })
      .catch(e => { if (!ac.signal.aborted) setTt({ loai: 'loi', thongBao: thongBaoLoi(e), chuaQuyen: laChuaQuyen(e) }); });
    return () => ac.abort();
  }, [locBang, tab, lanTai]);

  const coGia = du?.coGia === true;
  const datLoc = <K extends keyof BoLocTieuHao>(k: K, v: BoLocTieuHao[K]) => setLoc(l => ({ ...l, [k]: v }));
  const apCt = () => datLoc('ct', tachCongTrinh(oCt));
  const apTim = () => datLoc('q', oTim.trim() || undefined);
  const xoaLoc = () => { setLoc({}); setOCt(''); setOTim(''); setThangChon(null); };
  const soLoc = [loc.tu, loc.den, loc.nhom?.length, loc.ct?.length, loc.mvt, loc.q, thangChon, loc.an806 === false, loc.an401 === false, loc.anBtp === false]
    .filter(Boolean).length;
  const dsNhom = useMemo(() => Object.entries(tenNhom).sort((a, b) => a[0].localeCompare(b[0])), [tenNhom]);
  const dangTai = tt.loai === 'dang_tai';
  const the = du?.the;
  const doiThang = the ? phanTramDoi(the.thMoi, the.thTruoc) : null;
  const chu262 = du ? ghiChu262(du.thang262Tu, du.thang) : '';

  const moChungTu = useCallback((x: XemChungTu) => setXemCt(x), []);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-[#f5f6f8]">
      {/* Đầu trang */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="h-3 w-3 rounded-sm bg-orange-500" aria-hidden />
            <h1 className="page-title">Xuất tiêu hao vật tư</h1>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            Xuất SAP 261 − hoàn trả 262 theo nhóm vật tư SAP · Z14 hao hụt riêng · triệu đồng
            {du?.duLieuToi && <> · <b className="text-slate-700">dữ liệu tới ngày {fmtNgay(du.duLieuToi)}</b></>}
            {du?.capNhat && <> · nạp lúc {fmtLuc(du.capNhat)}</>}
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
      ) : tt.loai === 'chua_co' ? (
        <div className="m-6 flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <Database size={36} className="text-slate-300" />
          <p className="text-lg font-bold text-slate-800">Chưa có dữ liệu xuất tiêu hao</p>
          <p className="max-w-xl text-sm text-slate-600">
            Bảng <code className="rounded bg-slate-100 px-1">xuat_tieu_hao_vt</code> chưa được tạo hoặc chưa nạp file tháng nào
            (thư mục 14_XUAT_TIEU_HAO_SAP). Sau khi chạy SQL tạo bảng và nạp lượt đầu, trang sẽ tự hiện số liệu.
          </p>
          <button type="button" onClick={() => setLanTai(n => n + 1)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            <RefreshCw size={14} /> Kiểm tra lại
          </button>
        </div>
      ) : (
        <div className="space-y-4 p-4 sm:p-6">
          {/* Bộ lọc */}
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <label className="flex flex-col text-xs font-semibold text-slate-600">Tháng từ
              <input type="month" value={loc.tu ?? ''} max={loc.den || undefined} onChange={e => datLoc('tu', e.target.value || undefined)}
                className="mt-0.5 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-normal text-slate-800" />
            </label>
            <label className="flex flex-col text-xs font-semibold text-slate-600">đến
              <input type="month" value={loc.den ?? ''} min={loc.tu || undefined} onChange={e => datLoc('den', e.target.value || undefined)}
                className="mt-0.5 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-normal text-slate-800" />
            </label>
            <div className="flex flex-col text-xs font-semibold text-slate-600">Nhóm SAP
              <div className="mt-0.5">
                <DashboardFilter label="Nhóm" options={dsNhom.map(([, t]) => t)}
                  selectedValues={(loc.nhom ?? []).map(m => tenNhom[m] ?? m)}
                  onChange={v => datLoc('nhom', dsNhom.filter(([, t]) => v.includes(t)).map(([m]) => m))}
                  onClearAll={() => datLoc('nhom', [])} />
              </div>
            </div>
            <label className="flex flex-col text-xs font-semibold text-slate-600">Công trình (mã CT, "-" = chưa ghép)
              <input value={oCt} onChange={e => setOCt(e.target.value)} onBlur={apCt} onKeyDown={e => { if (e.key === 'Enter') apCt(); }}
                placeholder="CT26-055" className="mt-0.5 w-44 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-normal text-slate-800" />
            </label>
            <label className="flex flex-col text-xs font-semibold text-slate-600">Loại xuất
              <select value={loc.mvt ?? ''} onChange={e => datLoc('mvt', (e.target.value || undefined) as MvtTieuHao | undefined)}
                className="mt-0.5 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-normal text-slate-800">
                <option value="">Tất cả</option>
                <option value="tieuHao">Tiêu hao (261 − 262)</option>
                <option value="z14">Hao hụt Z14</option>
              </select>
            </label>
            <label className="flex min-w-[14rem] flex-1 flex-col text-xs font-semibold text-slate-600">Tìm mã VT / số chứng từ / lệnh SX / tên / HEX
              <span className="relative mt-0.5">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={oTim} onChange={e => setOTim(e.target.value)} onBlur={apTim} onKeyDown={e => { if (e.key === 'Enter') apTim(); }}
                  placeholder="100000000440 keo" className="w-full rounded-lg border border-slate-200 py-1.5 pl-7 pr-2 text-sm font-normal text-slate-800" />
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-1 text-sm text-slate-700">
              {([['an806', 'Hiện 806 Gia công'], ['an401', 'Hiện 401 CCDC'], ['anBtp', 'Hiện BTP / TP xuất lại']] as const).map(([k, l]) => (
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
          {chu262 && (
            <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
              <AlertTriangle size={15} className="shrink-0" />{chu262}
            </p>
          )}

          {/* Thẻ số */}
          {the && du && (
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <TheSo cham="bg-orange-500" nhan={`Tiêu hao ${the.thangMoi ? nhanThangNgan(the.thangMoi) : 'tháng này'}`}
                so={coGia ? fmtTrieu(the.thMoi) || '0' : '—'} donVi={coGia ? 'triệu' : ''}
                phu={du.duLieuToi ? `tới ngày ${fmtNgay(du.duLieuToi)}` : 'tháng có dữ liệu mới nhất'}
                onClick={the.thangMoi ? () => moChungTu({ tieuDe: `Tiêu hao ${nhanThangNgan(the.thangMoi!)}`, loc: { ...loc, tu: the.thangMoi!, den: the.thangMoi!, mvt: 'tieuHao' } }) : undefined} />
              <TheSo cham="bg-amber-400" nhan="Tháng trước" so={coGia ? fmtTrieu(the.thTruoc) || '0' : '—'} donVi={coGia ? 'triệu' : ''}
                phu={doiThang === null ? 'so tháng này' : <>tháng này <b className={doiThang > 0 ? 'text-red-600' : 'text-emerald-700'}>{doiThang > 0 ? '+' : ''}{fmtPt(doiThang)}</b></>} />
              <TheSo cham="bg-sky-500" nhan="TB 3 tháng" so={coGia ? fmtTrieu(the.thTb3) || '0' : '—'} donVi={coGia ? 'triệu / tháng' : ''}
                phu={du.thangTb3.length ? `3 tháng đủ ${nhanKhoangTb3(du.thangTb3)}` : 'chưa đủ dữ liệu'} />
              <TheSo cham="bg-rose-500" nhan="Hao hụt Z14" so={coGia ? fmtTrieu(the.hh) || '0' : '—'} donVi={coGia ? 'triệu' : ''} mau="text-rose-700"
                phu={<>{fmtPt(the.ptHaoHut)} của (tiêu hao + hao hụt) trong khoảng lọc</>}
                onClick={() => moChungTu({ tieuDe: 'Hao hụt Z14', loc: { ...locBang, mvt: 'z14' } })} />
              <TheSo cham="bg-indigo-500" nhan="Số mã xuất" so={fmtInt(the.soMa)} donVi="mã"
                phu={<>{fmtInt(the.soDong)} dòng chứng từ trong khoảng lọc</>} onClick={() => setTab('ma')} />
              <TheSo cham="bg-slate-500" nhan="Chưa ghép CT / HEX" so={fmtPt(the.ptChuaGhep)} donVi="" mau={the.ptChuaGhep !== null && the.ptChuaGhep > 10 ? 'text-amber-700' : 'text-slate-900'}
                phu={<>{fmtInt(the.soDongChuaGhep)} dòng không ra được lệnh SX → HEX / CT</>}
                onClick={() => moChungTu({ tieuDe: 'Dòng chưa ghép được công trình / HEX', loc: { ...locBang, chuaGhep: true } })} />
            </div>
          )}

          {/* Biểu đồ chồng theo nhóm */}
          <BieuDo du={duBieuDo} coGia={coGia} haoHut={loc.mvt === 'z14'} chon={thangChon} onChon={t => setThangChon(c => (c === t ? null : t))} />

          {/* Bảng theo tab */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="inline-flex overflow-hidden rounded-lg border border-slate-300" role="tablist">
                {TAB.map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                    className={`px-3 py-1.5 text-sm font-semibold ${tab === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{l}</button>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                {thangChon ? <>tháng {nhanThangNgan(thangChon)} · </> : null}
                {tab === 'nhom' ? 'bấm tên nhóm xem từng mã' : tab === 'ct' ? 'bấm mã CT xem từng HEX' : tab === 'ma' ? 'SL theo đúng ĐVT của mã' : ''}
                {' · '}bấm số xem chứng từ{coGia ? '' : ' · không có quyền xem giá: số là số dòng chứng từ'}
              </p>
              {thangChon && (
                <button type="button" onClick={() => setThangChon(null)} className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
                  Bỏ lọc tháng {nhanThangNgan(thangChon)} <X size={12} />
                </button>
              )}
              {dangTai && <Loader2 size={14} className="animate-spin text-slate-400" />}
            </div>
            {du && (
              <BangGop du={du} theo={tab} loc={locBang} coGia={coGia} maxH="max-h-[70vh]"
                onXemChungTu={moChungTu}
                onXemCon={tab === 'nhom' ? d => setXemCon({ tieuDe: d.ten, theo: 'ma', loc: { ...locBang, nhom: [d.khoa] } })
                  : tab === 'ct' ? d => setXemCon({ tieuDe: d.khoa === '-' ? 'Chưa ghép được công trình' : d.khoa, theo: 'hex', loc: { ...locBang, ct: [d.khoa] } })
                    : undefined} />
            )}
            <p className="mt-2 text-xs text-slate-500">
              Tiêu hao = xuất cho sản xuất (261) trừ hoàn trả (262), hao hụt (Z14) tính riêng; % hao hụt = Z14 / (tiêu hao + Z14).
              Mặc định ẩn BTP / TP (mã 2… / 3… xuất lại vào lệnh — vật tư làm ra chúng đã tính ở lệnh BTP).
              TB 3 tháng = trung bình 3 tháng đủ gần nhất theo ngày dữ liệu mới nhất (không theo khoảng tháng đang lọc).
              Số tháng đủ dùng = tồn hiện tại (lần chốt tồn kho vật tư mới nhất) / SL tiêu hao TB 3 tháng, chỉ khi cùng ĐVT; dưới 1 tháng tô đỏ.
              Công trình / HEX ghép từ lệnh sản xuất của dòng chứng từ.
            </p>
          </div>
        </div>
      )}

      {xemCon && (
        <CuaSoCon yc={xemCon} coGia={coGia} tren={!xemCt} onClose={() => setXemCon(null)} onXemChungTu={moChungTu} />
      )}
      {xemCt && <CuaSoChungTu yc={xemCt} onClose={() => setXemCt(null)} />}
    </div>
  );
};

export default TieuHao;

// ============================================================================
// Thành phần
// ============================================================================
const TheSo = ({ cham, nhan, so, donVi, phu, mau = 'text-slate-900', onClick }: {
  cham: string; nhan: string; so: string; donVi: string; phu: React.ReactNode; mau?: string; onClick?: () => void;
}) => {
  const noiDung = (
    <>
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-700"><span className={`h-2.5 w-2.5 rounded-full ${cham}`} aria-hidden />{nhan}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${mau}`}>{so} <span className="text-sm font-medium text-slate-500">{donVi}</span></p>
      <p className="mt-1 text-sm text-slate-600">{phu}</p>
    </>
  );
  const cls = 'rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm';
  return onClick ? (
    <button type="button" onClick={onClick} title="Bấm xem chứng từ" className={`${cls} transition hover:border-slate-300 hover:bg-slate-50`}>{noiDung}</button>
  ) : <div className={cls}>{noiDung}</div>;
};

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
// Biểu đồ cột chồng theo nhóm SAP
// ---------------------------------------------------------------------------
const BieuDo = ({ du, coGia, haoHut, chon, onChon }: {
  du: TongHopTieuHao | null; coGia: boolean; haoHut: boolean; chon: string | null; onChon: (t: string) => void;
}) => {
  const cheDo: CheDoO = coGia ? 'giaTri' : 'soDong';
  const { nhom, cot } = useMemo(() => (du ? duLieuBieuDo(du.dong, du.thang, cheDo, undefined, haoHut) : { nhom: [], cot: [] }), [du, cheDo, haoHut]);
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-bold text-slate-900">{haoHut ? 'Hao hụt Z14 theo tháng' : 'Tiêu hao theo tháng'}</p>
        <p className="text-xs text-slate-500">{coGia ? 'triệu đồng' : 'số dòng chứng từ'} · chồng theo nhóm SAP (8 nhóm lớn nhất + Khác) · bấm cột để lọc bảng theo tháng</p>
        <span className="ml-auto inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
          {nhom.map(n => <span key={n.khoa} className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm" style={{ background: n.mau }} />{n.ten}</span>)}
        </span>
      </div>
      <div className="mt-1 h-64">
        {!du ? <p className="py-20 text-center text-sm text-slate-400">Đang tải…</p> : !cot.length ? <p className="py-20 text-center text-sm text-slate-400">Không có số liệu.</p> : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cot} margin={{ top: 12, right: 8, left: 8, bottom: 4 }} barCategoryGap="22%"
              onClick={(e: { activeTooltipIndex?: number } | null) => { const x = e?.activeTooltipIndex; if (x != null && cot[x]) onChon(cot[x].thang); }}>
              <XAxis dataKey="nhan" axisLine={{ stroke: '#e2e8f0' }} tickLine={false} interval={dangMayTinhBang() ? 'equidistantPreserveStart' : 0} tick={{ fontSize: 12, fill: '#475569' }} />
              <YAxis hide domain={[0, (m: number) => (m > 0 ? m * 1.08 : 1)]} />
              <Tooltip cursor={{ fill: '#f1f5f9' }} content={({ active, payload }) => {
                const c = active ? (payload?.[0]?.payload as (typeof cot)[number] | undefined) : undefined;
                if (!c) return null;
                return (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                    <p className="font-bold text-slate-900">Tháng {c.thang.slice(5)}/{c.thang.slice(0, 4)} · tổng {fmtSoO(c.tong, cheDo) || 0}{coGia ? ' triệu' : ' dòng'}</p>
                    {[...nhom].reverse().map(n => (
                      <p key={n.khoa} className="tabular-nums text-slate-700">
                        <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: n.mau }} />{n.ten}: <b>{fmtSoO(Number(c[n.khoa] ?? 0), cheDo) || 0}</b>
                      </p>
                    ))}
                    <p className="mt-1 text-slate-400">Bấm để lọc bảng theo tháng này</p>
                  </div>
                );
              }} />
              {nhom.map((n, i) => (
                <Bar key={n.khoa} dataKey={n.khoa} stackId="a" fill={n.mau} maxBarSize={34} isAnimationActive={false} className="cursor-pointer"
                  radius={i === nhom.length - 1 ? [4, 4, 0, 0] : undefined}>
                  {cot.map(c => <Cell key={c.thang} fillOpacity={chon && c.thang !== chon ? 0.35 : 1} />)}
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
// Bảng gộp (dòng = khoá theo `theo`, cột = 6 tháng cuối + Tổng + TB 3 tháng + hao hụt …)
// ---------------------------------------------------------------------------
const BangGop = ({ du, theo, loc, coGia, maxH, onXemChungTu, onXemCon }: {
  du: TongHopTieuHao; theo: TheoTieuHao; loc: BoLocTieuHao; coGia: boolean; maxH: string;
  onXemChungTu: (x: XemChungTu) => void; onXemCon?: (d: DongTieuHao) => void;
}) => {
  const laMa = theo === 'ma';
  // Bảng mã: ô tháng là SL (cùng ĐVT); bảng khác: giá trị (hoặc số dòng khi không có quyền giá)
  const cheDo: CheDoO = laMa ? 'soLuong' : coGia ? 'giaTri' : 'soDong';
  // Lọc Loại xuất = Z14: ô tháng / Tổng là hao hụt; còn lại là tiêu hao (261 − 262). Bấm ô => đúng loại đó.
  const haoHut = loc.mvt === 'z14';
  const mvtO = mvtCuaO(haoHut);
  const cheDoHh: CheDoO = laMa ? 'soLuong' : coGia ? 'giaTri' : 'soDong';
  const thang = thangCuoi(du.thang);
  const xem = (d: DongTieuHao | null, tieuDePhu: string, them: Partial<BoLocTieuHao> = {}) => {
    const base = d ? locCuaDong(loc, theo, d.khoa) : { loc };
    const tenDong = d ? (laMa ? `${d.ma ?? '(không mã)'} · ${d.ten}` : d.ten) : 'Tất cả';
    onXemChungTu({ tieuDe: `${tenDong} · ${tieuDePhu}`, loc: { ...base.loc, ...them }, ma: 'ma' in base ? base.ma : undefined, dvt: 'dvt' in base ? base.dvt : undefined });
  };
  /** Ô số bấm được (0 / trống thì không bấm) */
  const oBam = (key: string, v: number | null | undefined, cd: CheDoO, onClick: () => void, cls = '') => {
    const chu = fmtSoO(v, cd);
    return (
      <td key={key} className={`${bang.tdSo} ${cls}`}>
        {chu ? <button type="button" onClick={onClick} title="Bấm xem chứng từ" className={`${bang.soBam} rounded px-1 hover:bg-blue-50 hover:text-blue-700`}>{chu}</button> : ''}
      </td>
    );
  };
  const soCot = thang.length + (laMa ? 9 + (coGia ? 1 : 0) : 8);
  return (
    <>
      <div className={`${bang.khung} ${maxH}`}>
        <table className={bang.table}>
          <thead className={bang.thead}>
            <tr>
              <th className={`${bang.thC} w-12`}>STT</th>
              <th className={`${bang.thB} sticky left-0 z-30 bg-emerald-300 text-left`}>{TEN_COT[theo]}</th>
              {laMa && <th className={bang.thC}>ĐVT</th>}
              {thang.map(m => <th key={m} className={`${bang.thC} whitespace-nowrap`}>{nhanThangNgan(m)}</th>)}
              <th className={`${bang.thC} whitespace-nowrap`}>Tổng{laMa ? ' SL' : ''}<br /><span className="text-xs font-semibold text-slate-700">{du.thang.length > thang.length ? 'cả khoảng lọc' : ''}</span></th>
              {laMa && coGia && <th className={`${bang.thC} whitespace-nowrap`}>Giá trị<br /><span className="text-xs font-semibold text-slate-700">triệu</span></th>}
              <th className={`${bang.thC} whitespace-nowrap`}>TB 3 tháng<br /><span className="text-xs font-semibold text-slate-700">{laMa ? 'SL' : coGia ? 'triệu' : ''}</span></th>
              {laMa && <th className={bang.thC}>Tồn hiện tại</th>}
              {laMa && <th className={`${bang.thC} whitespace-nowrap`}>Số tháng<br />đủ dùng</th>}
              <th className={`${bang.thC} whitespace-nowrap`}>Hao hụt Z14<br /><span className="text-xs font-semibold text-slate-700">{laMa ? 'SL' : coGia ? 'triệu' : 'dòng'}</span></th>
              {!laMa && <th className={bang.thC}>% hao hụt</th>}
              {!laMa && <th className={bang.thC}>Số mã</th>}
              <th className={bang.thC}>Số dòng</th>
            </tr>
          </thead>
          <tbody>
            {du.dong.map((d, i) => {
              const muc = mucThangDuDung(d.soThangDuDung);
              const hh = soCuaO(d.tong, cheDoHh, true);
              return (
                <tr key={d.khoa} className="group hover:bg-slate-50">
                  <td className={bang.tdSo}>{i + 1}</td>
                  <td className={`${bang.tdB} sticky left-0 z-[1] min-w-[14rem] bg-white group-hover:bg-slate-50`}>
                    {onXemCon ? (
                      <button type="button" onClick={() => onXemCon(d)} title={theo === 'nhom' ? 'Bấm xem từng mã trong nhóm' : 'Bấm xem từng HEX'}
                        className="text-left font-semibold underline decoration-slate-300 decoration-dotted underline-offset-2 hover:text-blue-700">{d.ten}</button>
                    ) : laMa ? (
                      <span><span className="font-semibold tabular-nums">{d.ma ?? '(không mã)'}</span> <span className="text-slate-700">{d.ten}</span></span>
                    ) : <span className="font-semibold">{d.ten}</span>}
                    {d.phu && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">{d.phu}</span>}
                  </td>
                  {laMa && <td className={`${bang.tdB} whitespace-nowrap text-center`}>{d.dvt ?? ''}</td>}
                  {thang.map(m => oBam(m, soCuaO(d.thang[m], cheDo, haoHut), cheDo, () => xem(d, `tháng ${nhanThangNgan(m)}`, { tu: m, den: m, mvt: mvtO })))}
                  {oBam('tong', soCuaO(d.tong, cheDo, haoHut), cheDo, () => xem(d, 'mọi tháng trong khoảng lọc', { mvt: mvtO }), 'font-semibold')}
                  {laMa && coGia && oBam('gt', soCuaO(d.tong, 'giaTri', haoHut), 'giaTri', () => xem(d, 'mọi tháng trong khoảng lọc', { mvt: mvtO }))}
                  <td className={bang.tdSo}>{fmtSoO(laMa ? d.slTb3 : coGia ? d.gtTb3 : null, laMa ? 'soLuong' : 'giaTri')}</td>
                  {laMa && <td className={bang.tdSo}>{d.ton === null || d.ton === undefined ? '' : `${d.ton.toLocaleString('en-US', { maximumFractionDigits: 3 })}${d.dvtTon && d.dvtTon !== d.dvt ? ` ${d.dvtTon}` : ''}`}</td>}
                  {laMa && <td className={`${bang.tdSo} ${muc === 'do' ? 'bg-red-50 font-bold text-red-600' : muc === 'cam' ? 'font-semibold text-amber-700' : ''}`}>{fmtThangDuDung(d.soThangDuDung)}</td>}
                  {oBam('hh', hh, cheDoHh, () => xem(d, 'hao hụt Z14', { mvt: 'z14' }), 'text-rose-700')}
                  {!laMa && <td className={bang.tdSo}>{coGia ? fmtPt(d.tong.th !== null && d.tong.hh !== null && d.tong.th + d.tong.hh > 0 ? (d.tong.hh / (d.tong.th + d.tong.hh)) * 100 : null).replace('—', '') : ''}</td>}
                  {!laMa && <td className={bang.tdSo}>{d.soMa ? fmtInt(d.soMa) : ''}</td>}
                  <td className={bang.tdSo}>{d.tong.sd ? fmtInt(d.tong.sd) : ''}</td>
                </tr>
              );
            })}
            {!du.dong.length && (
              <tr><td colSpan={soCot} className={`${bang.tdB} py-8 text-center text-slate-500`}>Không có dòng xuất nào khớp bộ lọc.</td></tr>
            )}
          </tbody>
          {du.dong.length > 0 && !laMa && (
            <tfoot className={bang.tfoot}>
              <tr>
                <td colSpan={2} className={`${bang.tdB} text-center`}>TỔNG ({fmtInt(du.soKhoa)} dòng)</td>
                {thang.map(m => oBam(m, soCuaO(du.tong.thang[m], cheDo, haoHut), cheDo, () => xem(null, `tháng ${nhanThangNgan(m)}`, { tu: m, den: m, mvt: mvtO })))}
                {oBam('tong', soCuaO(du.tong.tong, cheDo, haoHut), cheDo, () => xem(null, 'mọi tháng trong khoảng lọc', { mvt: mvtO }))}
                <td className={bang.tdSo}>{coGia ? fmtSoO(du.the.thTb3, 'giaTri') : ''}</td>
                {oBam('hh', soCuaO(du.tong.tong, cheDoHh, true), cheDoHh, () => xem(null, 'hao hụt Z14', { mvt: 'z14' }))}
                <td className={bang.tdSo}>{coGia ? fmtPt(du.the.ptHaoHut).replace('—', '') : ''}</td>
                <td className={bang.tdSo}>{fmtInt(du.tong.soMa)}</td>
                <td className={bang.tdSo}>{fmtInt(du.tong.tong.sd)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {du.catBot && <p className="mt-1 text-xs text-amber-700">Chỉ hiện {fmtInt(du.dong.length)} / {fmtInt(du.soKhoa)} dòng lớn nhất — lọc thêm để xem phần còn lại.</p>}
    </>
  );
};

// ---------------------------------------------------------------------------
// Cửa sổ bảng con: mã của 1 nhóm / HEX của 1 công trình
// ---------------------------------------------------------------------------
const CuaSoCon = ({ yc, coGia, tren, onClose, onXemChungTu }: {
  yc: XemCon; coGia: boolean; tren: boolean; onClose: () => void; onXemChungTu: (x: XemChungTu) => void;
}) => {
  const [du, setDu] = useState<TongHopTieuHao | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  useEsc(tren, onClose);
  useEffect(() => {
    const ac = new AbortController();
    layTongHopTieuHao(yc.loc, yc.theo, ac.signal)
      .then(d => { if (laChuaCo(d)) setLoi('Chưa có dữ liệu xuất tiêu hao'); else setDu(d); })
      .catch(e => { if (!ac.signal.aborted) setLoi(thongBaoLoi(e)); });
    return () => ac.abort();
  }, [yc]);
  return (
    <div className={bang.cuaSoNen} onClick={onClose}>
      <div className={bang.cuaSoKhung} onClick={e => e.stopPropagation()}>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-slate-900">{yc.tieuDe}</p>
            <p className="text-sm text-slate-500">
              {yc.theo === 'ma' ? 'Từng mã vật tư (mã + ĐVT) · ô tháng là SL theo ĐVT' : 'Từng HEX'} · bấm số xem chứng từ
              {du ? ` · ${fmtInt(du.soKhoa)} dòng` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100" aria-label="Đóng">×</button>
        </div>
        {loi ? <p className="text-sm text-red-600">{loi}</p> : !du ? <p className="text-sm text-slate-500">Đang tải…</p> : (
          <div className="flex min-h-0 flex-1 flex-col">
            <BangGop du={du} theo={yc.theo} loc={yc.loc} coGia={coGia && du.coGia} maxH="min-h-0 flex-1" onXemChungTu={onXemChungTu} />
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Cửa sổ danh sách chứng từ (phân trang + xuất Excel)
// ---------------------------------------------------------------------------
const CO_TRANG = 200;
const CO_EXCEL = 30000;
const CuaSoChungTu = ({ yc, onClose }: { yc: XemChungTu; onClose: () => void }) => {
  const [trang, setTrang] = useState(1);
  const [du, setDu] = useState<ChiTietTieuHao | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangXuat, setDangXuat] = useState(false);
  const { showToast } = useToast();
  useEsc(true, onClose);
  useEffect(() => {
    const ac = new AbortController();
    setLoi(null);
    layChiTietTieuHao(yc.loc, { ma: yc.ma, dvt: yc.dvt, trang, co: CO_TRANG }, ac.signal)
      .then(d => { if (laChuaCo(d)) setLoi('Chưa có dữ liệu xuất tiêu hao'); else setDu(d); })
      .catch(e => { if (!ac.signal.aborted) setLoi(thongBaoLoi(e)); });
    return () => ac.abort();
  }, [yc, trang]);
  const coGia = du?.coGia === true;
  const cot = useMemo(() => cotChungTuHien(coGia), [coGia]);
  const soTrang = du ? Math.max(1, Math.ceil(du.tong / CO_TRANG)) : 1;

  const xuatExcel = async () => {
    setDangXuat(true);
    try {
      const tat = await layChiTietTieuHao(yc.loc, { ma: yc.ma, dvt: yc.dvt, trang: 1, co: CO_EXCEL });
      if (laChuaCo(tat)) throw new Error('chưa có bảng');
      const XLSX = await import('xlsx');
      const aoa = bangExcelChungTu(tat.dong, tat.coGia);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = aoa[0].map((_, c) => {
        let max = 8;
        for (let r = 0; r < Math.min(aoa.length, 400); r++) max = Math.max(max, String(aoa[r][c] ?? '').length);
        return { wch: Math.min(48, max + 1) };
      });
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: aoa[0].length - 1 } }) };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Chứng từ xuất');
      XLSX.writeFile(wb, `tieu-hao_${tenFileAnToan(yc.tieuDe)}_${tat.homNay || 'hom-nay'}.xlsx`);
      if (tat.tong > tat.dong.length) showToast(`File chỉ có ${fmtInt(tat.dong.length)} / ${fmtInt(tat.tong)} dòng đầu`, 'info');
    } catch (e) {
      console.error('Lỗi xuất Excel Xuất tiêu hao:', e);
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
            <p className="text-sm text-slate-500">{du ? `${fmtInt(du.tong)} dòng chứng từ` : 'Đang tải…'} · SL xuất dương = xuất, âm = hoàn trả (262)</p>
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
                  <tr key={`${d.nam}|${d.soCt}|${d.dong}|${i}`} className="hover:bg-slate-50">
                    <td className={bang.tdSo}>{(trang - 1) * CO_TRANG + i + 1}</td>
                    {cot.map(c => {
                      const so = c.kieu === 'so' || c.kieu === 'tien' || c.kieu === 'ma' || c.kieu === 'ngay' || c.kieu === 'mvt';
                      const am = (c.kieu === 'so' || c.kieu === 'tien') && Number(d[c.khoa]) < 0;
                      return (
                        <td key={c.khoa} className={`${so ? bang.tdSo : `${bang.tdB} text-sm`} ${c.rong ?? ''} ${am ? 'text-emerald-700' : ''} ${c.kieu === 'mvt' && d.mvt === 'Z14' ? 'text-rose-700' : ''}`}>
                          {chuOChungTu(c, d)}
                        </td>
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
