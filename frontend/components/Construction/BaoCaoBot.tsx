import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, X, ChevronRight, ChevronDown, AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { ModalShell } from '../shared/ModalShell';
import { API_BASE_URL } from '../../services/dataService';
import { fmtInt, fmtTy } from '../../utils/format';
import * as bang from '../shared/bangBaoCao';
import { dungBaoCaoBot, luuHomNay, loiTheoTen, IPO_MAC_DINH, ipoTheoTrang, CHUA_BOT, type OBot, type CotBot, type FileLoiBot } from './core/baoCaoBot';
import { mauLuong, sapXepTheoThuTu, sttHienThi } from './core/thuTuNhom';
import { useThuTuLuongDo } from './useThuTuLuongDo';
import { DanhSachLoi, fmtLuc, moTaLoi } from './DanhSachFileLoi';

// ============================================================================
// BÁO CÁO BOT — giá trị đơn hàng còn lại theo dự án, giống sheet BÁO CÁO BOT của MASTER_PROJECT_COORDINATION.xlsx.
// Số liệu do tool trên máy PC đẩy lên ngay khi file công trình (05_PRODUCTION STATUS) được lưu, không theo bộ lọc
// của trang. Không tự tải lại theo chu kỳ (để DB được ngủ) — bấm "Tải lại" để lấy số mới nhất.
// ============================================================================

interface DuLieu {
  coBang: boolean; capNhat: string | null; soFile: number; fileLoi: FileLoiBot[]; ipos: string[]; o: OBot[];
  luuFile?: Record<string, string>;   // TÊN CÔNG TRÌNH -> giờ lưu file công trình gần nhất (tô xanh nếu lưu hôm nay)
}
interface DongChiTiet { maCt: string; hex: string; ipo: string; ngay: string; tt: number | null; nguon: string }
interface ChonO { ten: string; cot: CotBot | null }

const NHAN_CHUA = 'CHƯA BOT';
const fmtO = (v: number | undefined) => (v ? fmtTy(v) : '');   // tiền gốc triệu => tỷ 2 số lẻ; 0 / không có để trống
const fmtNgay = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };

// ipoChon: lựa chọn ở ô "Tình Trạng IPO" của trang (một bộ lọc chung, không lặp nút IPO trong bảng);
// onIpos: báo lên trang các IPO có trong file công trình (vd. 03. TẠM NGƯNG) để ô lọc có đủ lựa chọn
export const BaoCaoBot = ({ onHexClick, ipoChon = [IPO_MAC_DINH], onIpos }: {
  onHexClick?: (hex: string) => void; ipoChon?: readonly string[]; onIpos?: (ipos: string[]) => void;
}) => {
  const [du, setDu] = useState<DuLieu | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const [namMo, setNamMo] = useState<Set<string>>(() => new Set());
  const [thangMo, setThangMo] = useState<Set<string>>(() => new Set());
  const [tim, setTim] = useState('');
  const [chiCt, setChiCt] = useState(true);
  const [chon, setChon] = useState<ChonO | null>(null);
  const [xemLoi, setXemLoi] = useState(false);
  const [xep, setXep] = useState<'luu' | 'gia'>('luu');   // luu: file lưu mới nhất lên đầu; gia: theo tổng giảm dần (như file)

  const tai = useCallback(() => {
    setDangTai(true);
    setLoi(null);
    fetch(`${API_BASE_URL}/bot-tong-hop`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`Lỗi ${r.status}`))))
      .then((d: DuLieu) => setDu(d))
      .catch(e => setLoi(e instanceof Error ? e.message : String(e)))
      .finally(() => setDangTai(false));
  }, []);
  useEffect(() => { tai(); }, [tai]);
  // Quay lại tab / cửa sổ => lấy số mới (tối đa 30 giây / lần). Không chạy hẹn giờ nền để DB được ngủ.
  useEffect(() => {
    let lanCuoi = Date.now();
    const khiHien = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lanCuoi < 30_000) return;
      lanCuoi = Date.now();
      tai();
    };
    document.addEventListener('visibilitychange', khiHien);
    window.addEventListener('focus', khiHien);
    return () => { document.removeEventListener('visibilitychange', khiHien); window.removeEventListener('focus', khiHien); };
  }, [tai]);

  useEffect(() => { if (du) onIpos?.(du.ipos.filter(Boolean)); }, [du, onIpos]);
  const ipo = useMemo(() => (du ? ipoTheoTrang(ipoChon, du.ipos) : null), [du, ipoChon]);
  const bc = useMemo(() => (du ? dungBaoCaoBot(du.o, ipo, namMo, chiCt, thangMo) : null), [du, ipo, namMo, chiCt, thangMo]);
  // Danh sách Luồng đỏ (Setup → Nhóm công trình): công trình trong luồng lên đầu theo STT, tô đỏ / vàng
  const thuTuNhom = useThuTuLuongDo();
  const [sapCot, setSapCot] = useState<{ k: string; giam: boolean } | null>(null);
  const doiSap = (k: string) => setSapCot(s => {
    const dau = k !== 'ten' && k !== 'stt';                     // số: lớn trước; chữ / STT: nhỏ trước
    if (!s || s.k !== k) return { k, giam: dau };
    return s.giam === dau ? { k, giam: !dau } : null;
  });
  const dong = useMemo(() => {
    if (!bc) return [];
    const t = tim.trim().toUpperCase();
    const ds = t ? bc.dong.filter(d => d.ten.toUpperCase().includes(t)) : bc.dong;
    const luu = du?.luuFile ?? {};
    // ISO cùng dạng => so chuỗi được; chưa có giờ lưu xuống cuối; cùng giờ thì theo tổng giảm dần (thứ tự sẵn của bc.dong)
    const theoXep = xep === 'gia' ? ds : [...ds].sort((a, b) => (luu[b.ten] ?? '').localeCompare(luu[a.ten] ?? ''));
    if (sapCot) {
      const k = sapCot.k;
      const gt = (d: (typeof ds)[number]): number | string => (k === 'ten' ? d.ten : k === 'luu' ? (luu[d.ten] ?? '')
        : k === 'tong' ? d.tong : k === 'stt' ? (thuTuNhom(d.ten)?.stt ?? Number.MAX_SAFE_INTEGER) : (d.o[k] ?? 0));
      const so = (a: number | string, b: number | string) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'vi'));
      return [...ds].sort((a, b) => (sapCot.giam ? so(gt(b), gt(a)) : so(gt(a), gt(b))));
    }
    return sapXepTheoThuTu(theoXep, d => d.ten, thuTuNhom);
  }, [bc, tim, xep, du, thuTuNhom, sapCot]);
  const NutSap = ({ k }: { k: string }) => (
    <button type="button" onClick={() => doiSap(k)} title="Sắp xếp (bấm lần 3 về thứ tự mặc định)" aria-label="Sắp xếp"
      className={`ml-0.5 inline-flex align-middle ${sapCot?.k === k ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}>
      {sapCot?.k === k ? (sapCot.giam ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5" />}
    </button>
  );
  // STT tính theo thứ tự mặc định (luồng trước), không đổi khi bấm sắp xếp cột
  const sttTheoTen = useMemo(() => {
    if (!bc) return new Map<string, number>();
    const goc = sapXepTheoThuTu(bc.dong, d => d.ten, thuTuNhom);
    const so = sttHienThi(goc.map(d => thuTuNhom(d.ten)));
    return new Map(goc.map((d, i) => [d.ten, so[i]]));
  }, [bc, thuTuNhom]);
  const tongLoc = useMemo(() => {
    if (!bc || !tim.trim()) return null;
    const m: Record<string, number> = {};
    let tong = 0;
    for (const d of dong) { for (const [k, v] of Object.entries(d.o)) m[k] = (m[k] ?? 0) + v; tong += d.tong; }
    return { o: m, tong };
  }, [bc, dong, tim]);
  // Công trình có file lưu trong ngày (giờ VN) => viền trái + ô LƯU FILE xanh, còn lại đỏ (chưa cập nhật hôm nay) (dùng green: emerald-50..200 của dự án đã đổi sang xám, xem tailwind.config.js).
  // Nền dòng theo luồng (đỏ / vàng); ngoài luồng nền trắng.
  const homNay = useMemo(() => new Set(Object.entries(du?.luuFile ?? {}).filter(([, t]) => luuHomNay(t)).map(([ten]) => ten)), [du]);
  const soMoi = dong.filter(d => homNay.has(d.ten)).length;
  // File công trình lỗi => dấu cảnh báo ở dòng của công trình đó (số trên dòng là của lần đọc tốt gần nhất)
  const loiCua = useMemo(() => loiTheoTen(du?.fileLoi), [du]);

  const doi = (k: string) => (s: Set<string>) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; };
  const doiMo = (loai: CotBot['loai'], khoa: string) => (loai === 'nam' ? setNamMo(doi(khoa)) : setThangMo(doi(khoa)));

  if (loi && !du) {
    return <div className="py-10 text-center text-sm text-slate-600">Không tải được BÁO CÁO BOT ({loi}). <button type="button" onClick={tai} className="font-semibold text-blue-700 underline">Thử lại</button></div>;
  }
  if (!du || !bc) return <p className="py-10 text-center text-sm font-semibold text-slate-500">Đang tải BÁO CÁO BOT…</p>;
  if (!du.coBang) {
    return <p className="py-10 text-center text-sm text-slate-600">Chưa có dữ liệu BÁO CÁO BOT: cần chạy SQL tạo bảng (backend/sql/2026-11-09_bot_tong_hop.sql) và bật tool canh file công trình trên máy PC.</p>;
  }

  const tongHien = tongLoc ?? { o: bc.tongCot, tong: bc.tong };
  const soTang = bc.tieuDe.length;
  const oSo = (ten: string, cot: CotBot | null, v: number | undefined, dam = false) => (
    <td className={`${bang.tdSo} ${dam ? 'font-bold' : ''}`}>
      {v ? (
        <button type="button" onClick={() => setChon({ ten, cot })} title="Bấm để xem các HEX" className={`${bang.soBam} hover:text-blue-700`}>{fmtO(v)}</button>
      ) : ''}
    </td>
  );
  const nutCls = (bat: boolean) => `h-full rounded px-2.5 font-semibold transition ${bat ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`;

  return (
    <div className="space-y-2.5">
      {/* Một dòng: tình trạng cập nhật · sắp xếp · chỉ mã CT · tìm. Lọc IPO dùng ô "Tình Trạng IPO" của trang */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-green-100 px-2.5 font-semibold text-green-900" title="Công trình có file lưu hôm nay">
          <span className="h-2.5 w-2.5 rounded-full bg-green-600" aria-hidden />{fmtInt(soMoi)} lưu hôm nay
        </span>
        <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-100 px-2.5 font-semibold text-red-800" title="Công trình chưa lưu file hôm nay">
          <span className="h-2.5 w-2.5 rounded-full bg-red-600" aria-hidden />{fmtInt(dong.length - soMoi)} chưa cập nhật
        </span>
        {du.fileLoi.length > 0 && (
          <button type="button" onClick={() => setXemLoi(true)} title={du.fileLoi.map(moTaLoi).join('\n')}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 font-semibold text-amber-900 hover:bg-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />{fmtInt(du.fileLoi.length)} file lỗi
          </button>
        )}
        <div className="flex h-9 items-center rounded-lg border border-slate-300 bg-white p-0.5" role="group" aria-label="Sắp xếp">
          {([['luu', 'Lưu mới nhất'], ['gia', 'Giá trị']] as const).map(([k, nhan]) => (
            <button key={k} type="button" aria-pressed={xep === k} onClick={() => { setXep(k); setSapCot(null); }} className={nutCls(xep === k && !sapCot)}>{nhan}</button>
          ))}
        </div>
        <label className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 font-semibold text-slate-700"
          title="Như lọc MÃ CÔNG TRÌNH của pivot trong file: chỉ mã CTxx-xxx, bỏ OEM / hàng lẻ / xuất khẩu (DM, EM, NB, SP, XK…)">
          <input type="checkbox" checked={chiCt} onChange={e => setChiCt(e.target.checked)} /> Chỉ mã CT
        </label>
        <span className="ml-auto text-xs text-slate-500"
          title={`Số do tool trên máy PC đẩy lên khi file công trình được lưu (như sheet BÁO CÁO BOT của MASTER_PROJECT_COORDINATION) · ${fmtInt(du.soFile)} file · chỉ theo bộ lọc Tình Trạng IPO của trang`}>
          Cập nhật <b className="text-slate-700">{fmtLuc(du.capNhat)}</b>
        </span>
        <button type="button" onClick={tai} disabled={dangTai} title="Tải lại số mới nhất" aria-label="Tải lại"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${dangTai ? 'animate-spin' : ''}`} aria-hidden />
        </button>
        <label className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5">
          <Search className="h-4 w-4 text-slate-400" aria-hidden />
          <input value={tim} onChange={e => setTim(e.target.value)} placeholder="Tìm công trình / mã CT" className="w-44 outline-none" />
          {tim && <button type="button" onClick={() => setTim('')} aria-label="Xoá tìm"><X className="h-4 w-4 text-slate-400" /></button>}
        </label>
      </div>

      <div className={`${bang.khung} max-h-[calc(100vh-12rem)] min-h-[20rem]`}>
        <table className={bang.table}>
          <thead className={bang.thead}>
            {bc.tieuDe.map((tang, ti) => (
              <tr key={ti}>
                {ti === 0 && (
                  <>
                    <th rowSpan={soTang} className={`${bang.thC} w-px`} title="STT theo danh sách Luồng đỏ (Setup → Nhóm công trình); ngoài luồng đánh tiếp">STT<NutSap k="stt" /></th>
                    <th rowSpan={soTang} className={`${bang.thC} sticky left-0 z-20 whitespace-nowrap bg-emerald-300`}>TÊN CÔNG TRÌNH<NutSap k="ten" /></th>
                    <th rowSpan={soTang} className={`${bang.thC} w-[7%] whitespace-nowrap`} title="Giờ (hôm nay) / ngày lưu file công trình gần nhất">LƯU FILE<NutSap k="luu" /></th>
                  </>
                )}
                {tang.map(h => {
                  const nhom = !h.cot;                         // cấp đang bung: gộp ngang, bấm để gộp lại
                  const bam = nhom || (h.moDuoc && !h.dangMo); // cấp đóng có con: bấm để bung
                  return (
                    <th key={`${h.khoa}-${nhom ? 'n' : 'c'}`} colSpan={h.colSpan} rowSpan={h.rowSpan}
                      className={`${bang.thC} whitespace-nowrap ${h.loai === 'ngay' ? 'min-w-[4.5rem]' : 'min-w-[5.5rem]'}`}>
                      {nhom ? (
                        <button type="button" onClick={() => doiMo(h.loai, h.khoa)} aria-expanded title="Gộp lại"
                          className="inline-flex items-center gap-0.5 hover:underline">
                          <ChevronDown className="h-4 w-4" aria-hidden />{h.nhan}
                        </button>
                      ) : bam ? (
                        <button type="button" onClick={() => doiMo(h.loai, h.khoa)} aria-expanded={nhom}
                          title={nhom ? 'Gộp lại' : h.loai === 'nam' ? 'Bung theo tháng' : 'Bung theo ngày'}
                          className="inline-flex items-center gap-0.5 hover:underline">
                          {nhom ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}{h.nhan}
                        </button>
                      ) : h.nhan}
                      {h.cot && <NutSap k={h.khoa} />}
                    </th>
                  );
                })}
                {ti === 0 && <th rowSpan={soTang} className={`${bang.thC} w-[10%] min-w-[6.5rem] whitespace-nowrap`}>TỔNG (tỷ)<NutSap k="tong" /></th>}
              </tr>
            ))}
          </thead>
          <tbody>
            {dong.map(d => {
              const luu = du.luuFile?.[d.ten];
              const moi = homNay.has(d.ten);
              const mau = mauLuong(thuTuNhom(d.ten));
              const fl = loiCua.get(d.ten);
              const moTaFl = fl ? `File lỗi — ${fl.map(moTaLoi).join('\n')}` : '';
              const nen = mau ? mau.nen : 'bg-white';
              return (
              <tr key={d.ten} className={`${nen} ${mau ? mau.hover : 'hover:bg-blue-50'}`}
                title={`${mau ? `${mau.nhan} · ` : ''}${luu ? `File công trình lưu lần cuối: ${fmtLuc(luu)}` : 'Chưa thấy giờ lưu file công trình'}`}>
                <td className={`${bang.tdSo} ${mau?.stt ?? ''}`}>{sttTheoTen.get(d.ten)}</td>
                <td className={`${bang.tdB} sticky left-0 z-[1] border-l-4 ${nen} ${moi ? 'border-l-green-600' : 'border-l-red-500'}`}>
                  <div className="mx-auto min-w-[16rem] max-w-[32rem] text-center">
                    {fl && <button type="button" onClick={() => setXemLoi(true)} title={moTaFl} aria-label="File công trình lỗi" className="mr-1 inline-flex align-text-bottom"><AlertTriangle className="h-4 w-4 text-amber-600" /></button>}
                    {d.ten || '(trống)'}
                  </div>
                </td>
                <td className={bang.tdSo} title={moTaFl || undefined}>
                  <span className={`inline-flex min-w-[3.5rem] items-center justify-center gap-0.5 rounded px-1.5 font-bold text-white ${fl ? 'bg-amber-500' : moi ? 'bg-green-600' : 'bg-red-600'}`}>
                    {fl && <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}{moi ? new Date(luu!).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : luu ? fmtNgay(luu) : 'chưa có'}
                  </span>
                </td>
                {bc.cot.map(c => <React.Fragment key={c.khoa}>{oSo(d.ten, c, d.o[c.khoa], !!c.dangMo)}</React.Fragment>)}
                {oSo(d.ten, null, d.tong, true)}
              </tr>
              );
            })}
            {dong.length === 0 && (
              <tr><td colSpan={bc.cot.length + 4} className={`${bang.tdB} py-8 text-center text-slate-500`}>Không có công trình nào{tim ? ' khớp ô tìm' : ' theo lọc IPO đang chọn'}.</td></tr>
            )}
          </tbody>
          <tfoot className={bang.tfoot}>
            <tr>
              <td colSpan={2} className={`${bang.tdB} left-0 !z-[3] text-center`}>TỔNG{tim ? ' (đang tìm)' : ''} · {fmtInt(dong.length)} công trình</td>
              <td className={bang.tdB} />
              {bc.cot.map(c => <td key={c.khoa} className={bang.tdSo}>{fmtO(tongHien.o[c.khoa])}</td>)}
              <td className={bang.tdSo}>{fmtO(tongHien.tong)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {xemLoi && <DanhSachLoi ds={du.fileLoi} onClose={() => setXemLoi(false)} />}
      {chon && <ChiTietO chon={chon} ipo={ipo ? [...ipo] : []} chiCt={chiCt} onClose={() => setChon(null)} onHexClick={onHexClick} />}
    </div>
  );
};

const ChiTietO = ({ chon, ipo, chiCt, onClose, onHexClick }: { chon: ChonO; ipo: string[]; chiCt: boolean; onClose: () => void; onHexClick?: (hex: string) => void }) => {
  const [dong, setDong] = useState<DongChiTiet[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const thang = chon.cot ? chon.cot.khoa : '';
  const ipoKhoa = ipo.join('|');
  useEffect(() => {
    const q = new URLSearchParams({ ten: chon.ten, ipo: ipoKhoa, thang, ct: chiCt ? '1' : '0' });
    fetch(`${API_BASE_URL}/bot-tong-hop/chi-tiet?${q}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`Lỗi ${r.status}`))))
      .then((d: { dong: DongChiTiet[] }) => setDong(d.dong))
      .catch(e => setLoi(e instanceof Error ? e.message : String(e)));
  }, [chon.ten, ipoKhoa, thang, chiCt]);
  const k = chon.cot?.khoa ?? '';
  const tieuDeCot = !k ? 'tất cả' : k === CHUA_BOT ? NHAN_CHUA
    : k.length === 10 ? `ngày ${k.slice(8)}/${k.slice(5, 7)}/${k.slice(0, 4)}` : k.length === 7 ? `tháng ${k.slice(5)}/${k.slice(0, 4)}` : `năm ${k}`;
  const tong = (dong ?? []).reduce((a, x) => a + (x.tt ?? 0), 0);
  return (
    <ModalShell open onClose={onClose} labelledBy="bcbot-ct" closeOnEsc closeOnBackdrop
      overlayClassName="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-900/40 p-4"
      panelClassName="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div>
          <p className="text-xs text-slate-500">BÁO CÁO BOT · {tieuDeCot} · {ipo.length ? ipo.join(', ') : 'mọi tình trạng IPO'}</p>
          <h3 id="bcbot-ct" className="text-base font-bold text-slate-900">{chon.ten || '(trống)'}</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="Đóng" className="rounded p-1 hover:bg-slate-100"><X className="h-5 w-5" /></button>
      </div>
      <div className="flex min-h-0 flex-col px-5 py-3">
        {loi ? <p className="text-sm text-red-700">Không tải được ({loi}).</p>
          : !dong ? <p className="text-sm text-slate-500">Đang tải…</p>
            : (
              <div className={`${bang.khung} min-h-0`}>
                <table className={bang.table}>
                  <thead className={bang.thead}>
                    <tr>
                      <th className={bang.thC}>HEX</th><th className={bang.thC}>MÃ CT</th><th className={bang.thC}>TÌNH TRẠNG IPO</th>
                      <th className={bang.thC}>NGÀY CẦN GIAO PC ĐỀ XUẤT</th><th className={bang.thC}>TT ĐH CÒN LẠI (tỷ)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dong.map((x, i) => (
                      <tr key={`${x.hex}-${i}`} className="hover:bg-slate-50">
                        <td className={bang.tdB}>{x.hex && onHexClick ? <button type="button" onClick={() => onHexClick(x.hex)} className="font-semibold text-blue-700 hover:underline">{x.hex}</button> : x.hex}</td>
                        <td className={`${bang.tdB} whitespace-nowrap`}>{x.maCt}</td>
                        <td className={bang.tdB}>{x.ipo}</td>
                        <td className={bang.tdSo}>{x.ngay || NHAN_CHUA}</td>
                        <td className={bang.tdSo}>{bang.trong0(x.tt ?? 0, fmtTy)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className={bang.tfoot}>
                    <tr><td className={`${bang.tdB} text-center`} colSpan={4}>TỔNG · {fmtInt(dong.length)} dòng</td><td className={bang.tdSo}>{bang.trong0(tong, fmtTy)}</td></tr>
                  </tfoot>
                </table>
              </div>
            )}
      </div>
    </ModalShell>
  );
};

