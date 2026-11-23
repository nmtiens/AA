import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Customized } from 'recharts';
import { FolderOpen, Info, Lightbulb, Package, CalendarRange, Layers, NotebookPen, AlertTriangle } from 'lucide-react';
import { API_BASE_URL } from '../../services/dataService';
import SearchableSelect from '../Dashboard/components/Dashboards/SearchableSelect';
import { parseNvlStatus, nvlLinePending, type NvlStatusLine } from '../../utils/nvlParse';
import { BopM2Section } from './BopM2Section';
import { CuaSoKho, type LoaiKho } from './CuaSoKho';
import { AnhNoiBoImg, XemAnhNoiBo } from '../BanVatTu/AnhNoiBo';
import type { AnhNoiBo } from '../../services/banVatTuApi';
import * as bang from '../shared/bangBaoCao';

// ============================================================================
// HỒ SƠ CÔNG TRÌNH (người dùng 20/11/2026) — 1 công trình theo cây mục:
//   1 Thông tin dự án · 2 Concept · 3 Danh mục vật liệu · 4 Masterplan · 5 BOP-BOM-BOT · 6 Biên bản họp · 7 Rủi ro – vướng mắc
// Số từ GET /api/ho-so-cong-trinh/:ma (backend/src/routes/hoSoCongTrinh.ts). Tiền DB = triệu đồng => hiện tỷ;
// PR (vat_tu.thanh_tien) = đồng. Mục chưa có dữ liệu trong app (Concept, Biên bản họp) ghi rõ nguồn đang nằm ở đâu.
// ============================================================================

type Nguoi = { ten: string; n: number };
interface HoSo {
  ma: string;
  thongTin: {
    ten: string; khachHang: string | null; khuVuc: string | null; nhomCt: string | null; tinhTrangDuAn: string | null;
    botDuAn: string | null; botDuAnKhnk: string | null; nhanTuPm: string | null; nhanTuPmCuoi: string | null;
    soHex: number; giaTri: number; daNhapHm: number; tinhPhieu: number; pm: Nguoi[]; pc: Nguoi[];
    ipo: { ipo: string; soHex: number; giaTri: number }[];
    kho: { nhap: number; xuat: number; ton: number; ngayTon: string | null };
  };
  masterplan: {
    khsx: { loai: string; nam: number; thang: number; tuan: number | null; soHex: number; giaTri: number }[];
    khsxDong?: KhsxDong[];
    nhapTheoThang: { thang: string; giaTri: number; soHex: number }[];
    khnk: { nhan: string; v: number }[];
    tkbv: { tt: string; soHex: number; tu: string | null; den: string | null }[];
  };
  bopBomBot: {
    bop: { bop: string; soHex: number; giaTri: number; conLai: number }[];
    bom: { vatLieu: number; hex: number };
    bot: { canGiaoTu: string | null; canGiaoDen: string | null; soHex: number; conLai: number };
    botCongDoan: { congDoan: string; soHex: number; tu: string | null; den: string | null }[];
  };
  vatLieu: {
    coGia: boolean;
    pr: { tt: string; soDong: number; soPr: number; coGia: number; thanhTien: number | null }[];
    prTong: number;
    prDong: Record<string, string | number | null>[];
    /** ảnh vật liệu (ban_vt_anh): theo mã SAP / theo code VL của chính công trình */
    anhTheoMa?: Record<string, AnhNoiBo[]>;
    anhTheoCode?: Record<string, AnhNoiBo[]>;
    /** danh mục vật liệu sheet 03_MATERIALS (tool nap_danh_muc_vl.py); null = chưa nạp */
    danhMuc?: { rows: DongVl[]; file: { ten_file: string; sua_luc: string; nap_luc: string; loi: string | null } | null } | null;
    tonKhoVt: { ngay: string; ma_vat_tu: string; ten_vat_tu: string; nhom_vat_tu: string; so_luong: number; dvt: string; gia_tri: number | null }[];
  };
  ruiRo: { nvl: Record<string, string | null>[]; vuongMac: Record<string, string | number | boolean | null>[] };
  /** Danh mục file thư mục dự án trên Drive (tool quet_tai_lieu_ct.py); null = chưa nạp */
  taiLieu: { thuMuc: string | null; driveId: string | null; quetLuc: string | null; files: TaiLieu[] } | null;
  /** Mỗi HEX 1 dòng (IPO / BOP / phân loại / ĐVT / tình trạng phiếu / BOP-M2 / ngày cần giao PC) — dựng 3 pivot mục 5 */
  hangMuc: HangMuc[];
  /** Ý biên bản họp gắn với công trình (tool nap_bien_ban_hop.py); null = chưa nạp */
  bienBanHop: BienBan[] | null;
}
interface BienBan { loai: string; ngay: string | null; ten_file: string; drive_id: string | null; y_id: string; chu_de: string | null;
  noi_dung: string | null; de_xuat: string | null; nguoi: string | null; han: string | null; khop: string | null }
interface HangMuc { hex: string; ipo: string; bop: string; pl: string; dvt: string; phieu: string; bom: string; ngay_giao: string | null;
  ten: string | null; pc: string | null; xuong: string | null; tri_gia: number; da_nhap: number; tinh_phieu: number }
interface TaiLieu { duongDan: string; nhom: string; ten: string; laThuMuc: boolean; driveId: string | null; mime: string | null; kichThuoc: number | null; sua: string | null }
const linkDrive = (id: string | null, thuMuc = false) => (id ? (thuMuc ? `https://drive.google.com/drive/folders/${id}` : `https://drive.google.com/open?id=${id}`) : null);
/** Xem ngay trong app (người dùng 20/11/2026): file => trang xem trước của Drive, thư mục => danh sách nhúng.
 *  Cần đăng nhập tài khoản Google có quyền vào Shared Drive (như xem ảnh QC). */
type Xem = { id: string; ten: string; thuMuc: boolean };
let moXemToanCuc: ((x: Xem) => void) | null = null;
const xemTrongApp = (x: Xem) => moXemToanCuc?.(x);
const CuaSoXem = () => {
  const [x, setX] = useState<Xem | null>(null);
  useEffect(() => { moXemToanCuc = setX; return () => { moXemToanCuc = null; }; }, []);
  useEffect(() => {
    if (!x) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setX(null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [x]);
  if (!x) return null;
  const src = x.thuMuc ? `https://drive.google.com/embeddedfolderview?id=${x.id}#list` : `https://drive.google.com/file/d/${x.id}/preview`;
  return (
    <div className="fixed inset-0 z-[9993] flex items-center justify-center bg-slate-900/50 p-2 sm:p-4" onClick={() => setX(null)}>
      <div className="flex h-[94vh] w-[96vw] flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-2.5">
          <p className="min-w-0 flex-1 truncate font-semibold text-slate-900" title={x.ten}>{x.thuMuc ? '📁 ' : ''}{x.ten}</p>
          <a href={linkDrive(x.id, x.thuMuc) ?? undefined} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50">Mở trên Drive ↗</a>
          <button type="button" onClick={() => setX(null)} className="shrink-0 rounded-lg px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100" aria-label="Đóng">×</button>
        </div>
        <iframe key={src} src={src} title={x.ten} className="min-h-0 flex-1 bg-slate-50" allow="autoplay" />
        <p className="border-t border-slate-100 px-4 py-1.5 text-xs text-slate-500">Không hiện nội dung? Đăng nhập Google bằng tài khoản có quyền vào Shared Drive, hoặc bấm “Mở trên Drive”. File nén (.rar / .zip) và bản vẽ CAD Drive không xem trước được.</p>
      </div>
    </div>
  );
};
/** Bấm số trên trang (người dùng 20/11/2026) => cửa sổ danh sách hạng mục (HEX) của đúng ô đó */
type DsHex = { tieuDe: string; dong: HangMuc[] };
let moDsHexToanCuc: ((x: DsHex) => void) | null = null;
const moDsHex = (tieuDe: string, dong: HangMuc[]) => moDsHexToanCuc?.({ tieuDe, dong });
const trieu1 = (v: number) => (Math.abs(v) < 0.05 ? '' : v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
type CtDs = { ma: string; ten: string; pm: string | null; pcs: string[]; soHex: number; giaTri: number; bot: string | null };
const tenGonCt = (x: { ma: string; ten: string }) => x.ten.replace(new RegExp(`[_\\s-]*${x.ma}\\s*$`), '');
/** Các công trình PC đang theo (người dùng 20/11/2026) — bấm 1 công trình => cả trang chuyển sang công trình đó. */
const CuaSoCtPc = ({ pc, ds, ma, onChon, onClose }: { pc: string; ds: CtDs[]; ma: string; onChon: (m: string) => void; onClose: () => void }) => {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const dong = ds.filter(x => x.pcs.includes(pc)).sort((p1, p2) => Number(!p1.ma.startsWith('CT')) - Number(!p2.ma.startsWith('CT')));   // CT lên trước
  return (
    <div className={bang.cuaSoNen} onClick={onClose}>
      <div className={`${bang.cuaSoKhung} !max-w-4xl`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-lg font-bold text-slate-900">Công trình PC {pc} đang theo <span className="text-sm font-medium text-slate-500">· {dong.length} công trình · bấm để chuyển sang</span></p>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100" aria-label="Đóng">×</button>
        </div>
        <div className={`${bang.khung} min-h-0 flex-1`}>
          <table className={`${bang.table} ${bang.cuaSoBang}`}>
            <thead className={bang.thead}><tr>
              {['STT', 'Mã', 'Công trình', 'Hạng mục', 'Giá trị (tỷ)', 'BOT dự án'].map(h => <th key={h} className={`${bang.thC} whitespace-nowrap`}>{h}</th>)}
            </tr></thead>
            <tbody>{dong.map((x, i) => (
              <tr key={x.ma} onClick={() => onChon(x.ma)} className={`cursor-pointer ${x.ma === ma ? 'bg-blue-50 font-semibold' : 'hover:bg-slate-50'}`}>
                <td className={bang.tdSo}>{i + 1}</td>
                <td className={`${bang.tdSo} whitespace-nowrap text-blue-700`}>{x.ma}</td>
                <td className={`${bang.tdB} min-w-[18rem]`}>{tenGonCt(x)}</td>
                <td className={bang.tdSo}>{x.soHex}</td>
                <td className={bang.tdSo}>{ty(x.giaTri)}</td>
                <td className={bang.tdSo}>{x.bot ? ngay(x.bot.slice(0, 10)) : ''}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const CuaSoDsHex = () => {
  const [x, setX] = useState<DsHex | null>(null);
  const [tim, setTim] = useState('');
  useEffect(() => { moDsHexToanCuc = v => { setTim(''); setX(v); }; return () => { moDsHexToanCuc = null; }; }, []);
  useEffect(() => {
    if (!x) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setX(null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [x]);
  if (!x) return null;
  const t = tim.trim().toUpperCase();
  const ds = (t ? x.dong.filter(h => `${h.hex} ${h.ten ?? ''} ${h.pl} ${h.bop}`.toUpperCase().includes(t)) : x.dong)
    .slice().sort((a, b) => b.tri_gia - a.tri_gia);
  const tong = (k: 'tri_gia' | 'tinh_phieu' | 'da_nhap') => ds.reduce((s0, h) => s0 + (h[k] || 0), 0);
  return (
    <div className={bang.cuaSoNen} onClick={() => setX(null)}>
      <div className={bang.cuaSoKhung} onClick={e => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-lg font-bold text-slate-900">{x.tieuDe} <span className="text-sm font-medium text-slate-500">· {x.dong.length} hạng mục</span></p>
          <input value={tim} onChange={e => setTim(e.target.value)} placeholder="Tìm HEX / hạng mục" className="h-9 w-56 rounded-lg border border-slate-300 px-3 text-sm outline-none" />
          <button type="button" onClick={() => setX(null)} className="rounded-lg px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100" aria-label="Đóng">×</button>
        </div>
        <div className={`${bang.khung} min-h-0 flex-1`}>
          <table className={`${bang.table} ${bang.cuaSoBang}`}>
            <thead className={bang.thead}><tr>
              {['STT', 'HEX', 'Hạng mục', 'Tình trạng IPO', 'Phân loại', 'Khu vực SX', 'BOP', 'BOP-M2', 'Ngày cần giao', 'Tình trạng phiếu', 'Trị giá (triệu)', 'Tính phiếu (triệu)', 'Đã nhập (triệu)']
                .map(h => <th key={h} className={`${bang.thC} whitespace-nowrap`}>{h}</th>)}
            </tr></thead>
            <tbody>{ds.map((h, i) => (
              <tr key={h.hex} className={/HỦY|HUỶ/.test(h.ipo.toUpperCase()) ? 'text-slate-400' : 'hover:bg-slate-50'}>
                <td className={bang.tdSo}>{i + 1}</td><td className={bang.tdSo}>{h.hex}</td>
                <td className={`${bang.tdB} min-w-[16rem]`}>{h.ten ?? ''}</td>
                <td className={`${bang.tdB} whitespace-nowrap text-sm`}>{h.ipo}</td><td className={`${bang.tdB} whitespace-nowrap text-sm`}>{h.pl}</td>
                <td className={bang.tdSo}>{h.xuong ?? ''}</td><td className={bang.tdSo}>{h.bop}</td><td className={bang.tdSo}>{h.bom}</td>
                <td className={bang.tdSo}>{h.ngay_giao ? ngay(h.ngay_giao) : ''}</td><td className={`${bang.tdB} whitespace-nowrap text-sm`}>{h.phieu}</td>
                <td className={bang.tdSo}>{trieu1(h.tri_gia)}</td><td className={bang.tdSo}>{trieu1(h.tinh_phieu)}</td><td className={bang.tdSo}>{trieu1(h.da_nhap)}</td>
              </tr>))}</tbody>
            <tfoot className={bang.tfoot}><tr>
              <td colSpan={10} className={`${bang.tdB} text-center`}>TỔNG ({ds.length} hạng mục)</td>
              <td className={bang.tdSo}>{trieu1(tong('tri_gia'))}</td><td className={bang.tdSo}>{trieu1(tong('tinh_phieu'))}</td><td className={bang.tdSo}>{trieu1(tong('da_nhap'))}</td>
            </tr></tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
/** Nhập / xuất / tồn: cửa sổ chung CuaSoKho (cùng Bảng KHNK) — 3 bảng kho cùng bộ cột, chuyển qua lại */
type KhoDong = { tieuDe?: string; loai: LoaiKho; ma: string; ten?: string; thang?: string };
let moKhoToanCuc: ((x: KhoDong) => void) | null = null;
const moKho = (x: KhoDong) => moKhoToanCuc?.(x);
const CuaSoKhoTrang = () => {
  const [x, setX] = useState<KhoDong | null>(null);
  useEffect(() => { moKhoToanCuc = setX; return () => { moKhoToanCuc = null; }; }, []);
  return x ? <CuaSoKho ma={x.ma} ten={x.ten} loai={x.loai} thang={x.thang} onClose={() => setX(null)} /> : null;
};
const coMb = (b: number | null) => (b == null ? '' : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
/** Nhóm thư mục dự án => mục hồ sơ (theo cây thư mục chuẩn 005_PROJECT) */
const NHOM_TL: { k: string; ten: string; khop: RegExp }[] = [
  { k: 'concept', ten: 'Concept', khop: /01_HỒ SƠ ĐẦU VÀO\/02_CONCEPT/i },
  { k: 'khoi-cong', ten: 'Lệnh khởi công & SĐTC', khop: /01_HỒ SƠ ĐẦU VÀO\/01_/i },
  { k: 'boq', ten: 'BOQ', khop: /01_HỒ SƠ ĐẦU VÀO\/03_BOQ/i },
  { k: 'masterplan', ten: 'Masterplan dự án', khop: /02_MASTERPLAN/i },
  { k: 'ban-ve', ten: 'Bản vẽ PM triển khai', khop: /04_BẢN VẼ PM/i },
  { k: 'thay-doi', ten: 'Hồ sơ quản lý sự thay đổi', khop: /07_HỒ SƠ QUẢN LÝ SỰ THAY ĐỔI/i },
];
const fileNhom = (hs: HoSo, k: string) => {
  const n = NHOM_TL.find(x => x.k === k)!;
  return (hs.taiLieu?.files ?? []).filter(f => !f.laThuMuc && n.khop.test(f.duongDan));
};
const thuMucNhom = (hs: HoSo, k: string) => {
  const n = NHOM_TL.find(x => x.k === k)!;
  // thư mục khớp nhóm, nông nhất (vd 02_SẢN XUẤT/01_HỒ SƠ ĐẦU VÀO/02_CONCEPT)
  return (hs.taiLieu?.files ?? []).filter(f => f.laThuMuc && n.khop.test(f.duongDan)).sort((a, b) => a.duongDan.length - b.duongDan.length)[0] ?? null;
};
const DanhSachFile = ({ hs, k, toiDa = 8 }: { hs: HoSo; k: string; toiDa?: number }) => {
  const [mo, setMo] = useState(false);
  const ds = fileNhom(hs, k).sort((a, b) => (b.sua ?? '').localeCompare(a.sua ?? ''));
  const tm = thuMucNhom(hs, k);
  const n = NHOM_TL.find(x => x.k === k)!;
  if (!hs.taiLieu || !ds.length) return null;   // thư mục rỗng: không hiện khung
  const hien = mo ? ds : ds.slice(0, toiDa);
  return (
    <div className="rounded-xl border border-slate-200 px-4 py-3">
      <p className="flex flex-wrap items-baseline gap-2 text-sm font-semibold text-slate-800">{n.ten}
        <span className="font-normal text-slate-500">{ds.length} file</span>
        {tm?.driveId && (
          <span className="ml-auto flex gap-3 text-xs font-semibold">
            <button type="button" onClick={() => xemTrongApp({ id: tm.driveId!, ten: `${n.ten} — ${tm.duongDan}`, thuMuc: true })} className="text-blue-700 hover:underline">Xem thư mục</button>
          </span>
        )}
      </p>
      {ds.length ? (
        <ul className="mt-1.5 divide-y divide-slate-100">
          {hien.map(f => (
            <li key={f.duongDan} className="flex items-baseline gap-3 py-1 text-sm">
              <a href={linkDrive(f.driveId) ?? undefined} target="_blank" rel="noreferrer" title={`${f.duongDan}\nBấm để xem ngay trong app (Ctrl + bấm: mở tab Drive)`}
                onClick={e => { if (!f.driveId || e.ctrlKey || e.metaKey || e.shiftKey) return; e.preventDefault(); xemTrongApp({ id: f.driveId, ten: f.ten, thuMuc: false }); }}
                className="min-w-0 flex-1 truncate font-medium text-blue-700 hover:underline">{f.ten}</a>
              <span className="shrink-0 text-xs text-slate-500">{coMb(f.kichThuoc)}</span>
              <span className="w-20 shrink-0 text-right text-xs tabular-nums text-slate-500">{ngay(f.sua)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {ds.length > toiDa && <button type="button" onClick={() => setMo(m => !m)} className="mt-1 text-xs font-semibold text-blue-700 hover:underline">{mo ? 'Thu gọn' : `Xem đủ ${ds.length} file`}</button>}
    </div>
  );
};

const ty = (trieu: number) => ((Math.round((trieu || 0) / 10) / 100) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tyDong = (dong: number) => ty((dong || 0) / 1e6);
/** Bảng từng dòng: triệu đồng 1 số lẻ (làm tròn tỷ thì nhiều dòng thành 0.00) */
const trieu = (v: number) => (v || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ngay = (s: string | null | undefined) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—');
const soNgayToi = (s: string | null) => (s ? Math.round((new Date(`${s.slice(0, 10)}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000) : null);

const MUC = [
  { k: 'thong-tin', ten: 'Thông tin dự án', phu: 'Giá trị / Số lượng / PM / PC', Icon: Info },
  { k: 'concept', ten: 'Concept', phu: 'Thiết kế, triển khai bản vẽ', Icon: Lightbulb },
  { k: 'vat-lieu', ten: 'Danh mục vật liệu', phu: 'PR / PO, tồn kho vật tư', Icon: Package },
  { k: 'masterplan', ten: 'Masterplan', phu: 'Mốc, KH tháng / tuần, nhập kho', Icon: CalendarRange },
  { k: 'bop-bom-bot', ten: 'BOP-BOM-BOT', phu: 'Công đoạn, vật tư, thời hạn', Icon: Layers },
  { k: 'bien-ban', ten: 'Biên bản họp', phu: 'Họp kick-off, TKSX, hằng ngày', Icon: NotebookPen },
  { k: 'rui-ro', ten: 'Rủi ro – vướng mắc', phu: 'Vật tư chưa về, 6M, trễ BOT', Icon: AlertTriangle },
] as const;
type KhoaMuc = (typeof MUC)[number]['k'];
type TrangThai = 'du' | 'mot-phan' | 'chua';
const CHAM: Record<TrangThai, [string, string]> = { du: ['bg-emerald-500', 'Có dữ liệu'], 'mot-phan': ['bg-amber-400', 'Một phần'], chua: ['bg-slate-300', 'Chưa có trong app'] };

export default function HoSoCongTrinh() {
  const [ds, setDs] = useState<CtDs[]>([]);
  const [pcXem, setPcXem] = useState<string | null>(null);
  const [ma, setMa] = useState<string>(() => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('ma') ?? '');
  const [hs, setHs] = useState<HoSo | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const [mucMo, setMucMo] = useState<KhoaMuc>('thong-tin');
  const refs = useRef<Partial<Record<KhoaMuc, HTMLElement | null>>>({});

  useEffect(() => {
    fetch(`${API_BASE_URL}/ho-so-cong-trinh/danh-sach`).then(r => (r.ok ? r.json() : Promise.reject(new Error(`Lỗi ${r.status}`))))
      .then((d: { ds: typeof ds }) => {
        const hop = (d.ds ?? []).filter(x => /^[A-Z]{2,3}\d{2}-[0-9A-Z]{1,12}$/.test(x.ma));
        setDs(hop);
        setMa(m => m || hop.find(x => x.ma.startsWith('CT'))?.ma || '');
      })
      .catch(e => setLoi(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => {
    if (!ma) return;
    const ac = new AbortController();
    setDangTai(true); setLoi(null); setHs(null);
    // giữ mã trên địa chỉ để gửi link
    const goc = window.location.hash.split('?')[0];
    window.history.replaceState(null, '', `${goc}?ma=${encodeURIComponent(ma)}`);
    fetch(`${API_BASE_URL}/ho-so-cong-trinh/${encodeURIComponent(ma)}`, { signal: ac.signal })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Lỗi ${r.status}`); return j as HoSo; })
      .then(setHs)
      .catch(e => { if (!ac.signal.aborted) { setHs(null); setLoi(e instanceof Error ? e.message : String(e)); } })
      .finally(() => { if (!ac.signal.aborted) setDangTai(false); });
    return () => ac.abort();
  }, [ma]);

  const trangThai = useMemo<Record<KhoaMuc, TrangThai>>(() => ({
    'thong-tin': 'du',
    concept: hs?.taiLieu && fileNhom(hs, 'concept').length ? 'du' : hs && hs.masterplan.tkbv.length ? 'mot-phan' : 'chua',
    'vat-lieu': hs && (hs.vatLieu.pr.length || hs.vatLieu.tonKhoVt.length) ? (hs.bopBomBot.bom.vatLieu ? 'du' : 'mot-phan') : 'chua',
    masterplan: hs && (hs.masterplan.khsx.length || hs.masterplan.khnk.length) ? 'mot-phan' : 'chua',
    'bop-bom-bot': hs ? (hs.bopBomBot.bom.vatLieu ? 'du' : 'mot-phan') : 'chua',
    'bien-ban': hs?.bienBanHop?.length ? 'du' : 'chua',
    'rui-ro': hs && (hs.ruiRo.nvl.length || hs.ruiRo.vuongMac.length) ? 'mot-phan' : 'chua',
  }), [hs]);

  const cuon = useRef<HTMLDivElement | null>(null);
  const dangBam = useRef<number | null>(null);
  const den = (k: KhoaMuc) => {
    setMucMo(k);
    if (dangBam.current) window.clearTimeout(dangBam.current);
    dangBam.current = window.setTimeout(() => { dangBam.current = null; }, 900);
    refs.current[k]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  // Mục lục sáng theo mục đang xem: mục cuối có đầu mục đã qua 1/4 khung; cuộn tới đáy => mục cuối
  useEffect(() => {
    const el = cuon.current;
    if (!el || !hs) return;
    const xet = () => {
      if (dangBam.current) return;
      const top = el.getBoundingClientRect().top + el.clientHeight * 0.25;
      let chon: KhoaMuc = MUC[0].k;
      for (const m of MUC) { const s0 = refs.current[m.k]; if (s0 && s0.getBoundingClientRect().top <= top) chon = m.k; }
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) chon = MUC[MUC.length - 1].k;
      setMucMo(chon);
    };
    el.addEventListener('scroll', xet, { passive: true });
    return () => el.removeEventListener('scroll', xet);
  }, [hs]);
  const tt = hs?.thongTin;

  return (
    <div ref={cuon} className="h-full overflow-y-auto custom-scrollbar">
    <CuaSoXem />
    <CuaSoDsHex />
    <CuaSoKhoTrang />
    <CuaSoKhsx />
    {pcXem && <CuaSoCtPc pc={pcXem} ds={ds} ma={ma} onChon={m => { setPcXem(null); setMa(m); cuon.current?.scrollTo({ top: 0 }); }} onClose={() => setPcXem(null)} />}
    <div className="space-y-4 px-4 pb-4 md:px-6 md:pb-6">
      {/* Đầu trang: chọn công trình — ghim khi cuộn (người dùng 20/11/2026) */}
      <div className="sticky top-0 z-30 -mx-4 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-[#f5f6f8]/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <h2 className="page-title flex items-center gap-2"><FolderOpen className="h-6 w-6 text-slate-500" aria-hidden />Hồ sơ công trình</h2>
        <SearchableSelect value={ma} onChange={v => v && setMa(v)} allLabel="Chọn công trình" widthClass="w-[28rem] max-w-full"
          options={ds.map(x => ({ code: x.ma, name: `${x.ma} · ${tenGonCt(x)}` }))}
          className="text-sm [&>button]:h-10 [&>button]:rounded-lg [&>button]:px-3" />
        {dangTai && <span className="text-sm text-slate-500">Đang tải…</span>}
      </div>
      {loi && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loi}</p>}

      {tt && hs && (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <p className="text-sm font-semibold text-slate-500">{hs.ma}</p>
            <p className="text-xl font-bold text-slate-900">{tt.ten.replace(new RegExp(`[_\\s-]*${hs.ma}\\s*$`), '')}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              {[['Khách hàng', tt.khachHang], ['Khu vực', tt.khuVuc], ['Nhóm', tt.nhomCt], ['Tình trạng', tt.tinhTrangDuAn]].filter(([, v]) => v).map(([k, v]) => (
                <span key={k} className="rounded-full bg-slate-100 px-3 py-1 text-slate-700"><span className="text-slate-500">{k}:</span> <b>{v}</b></span>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] mtb:grid-cols-[minmax(0,1fr)]">
            {/* Cây mục */}
            {/* Máy tính bảng: mục lục thành dải ngang dính trên đầu, nhường cả bề rộng cho nội dung */}
            <nav className="h-fit rounded-2xl border border-slate-200 bg-white p-3 lg:sticky lg:top-20 mtb:sticky mtb:top-16 mtb:z-20 mtb:overflow-x-auto mtb:p-1.5" aria-label="Mục hồ sơ">
              <p className="px-2 pb-2 text-xs font-bold uppercase tracking-wide text-slate-500 mtb:hidden">Mục lục hồ sơ</p>
              <ul className="space-y-0.5 border-l-2 border-slate-200 pl-2 mtb:flex mtb:gap-1 mtb:space-y-0 mtb:border-l-0 mtb:pl-0">
                {MUC.map((m, i) => (
                  <li key={m.k}>
                    <button type="button" onClick={() => den(m.k)}
                      className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left mtb:items-center mtb:whitespace-nowrap mtb:px-3 ${mucMo === m.k ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full mtb:mt-0 ${CHAM[trangThai[m.k]][0]}`} title={CHAM[trangThai[m.k]][1]} />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{i + 1}. {m.ten}</span>
                        <span className={`block text-xs mtb:hidden ${mucMo === m.k ? 'text-slate-300' : 'text-slate-500'}`}>{m.phu}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-3 space-y-1 border-t border-slate-100 px-2 pt-2 text-xs text-slate-500 mtb:hidden">
                {(Object.keys(CHAM) as TrangThai[]).map(k => <p key={k} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${CHAM[k][0]}`} />{CHAM[k][1]}</p>)}
              </div>
            </nav>

            <div key={hs.ma} className="min-w-0 space-y-4">
              <Muc refEl={el => { refs.current['thong-tin'] = el; }} so={1} m={MUC[0]}><ThongTin hs={hs} onXemPc={setPcXem} /></Muc>
              <Muc refEl={el => { refs.current.concept = el; }} so={2} m={MUC[1]}><Concept hs={hs} /></Muc>
              <Muc refEl={el => { refs.current['vat-lieu'] = el; }} so={3} m={MUC[2]}><VatLieu hs={hs} /></Muc>
              <Muc refEl={el => { refs.current.masterplan = el; }} so={4} m={MUC[3]}><Masterplan hs={hs} /></Muc>
              <Muc refEl={el => { refs.current['bop-bom-bot'] = el; }} so={5} m={MUC[4]}><BopBomBot hs={hs} /></Muc>
              <Muc refEl={el => { refs.current['bien-ban'] = el; }} so={6} m={MUC[5]}><BienBanHop hs={hs} /></Muc>
              <Muc refEl={el => { refs.current['rui-ro'] = el; }} so={7} m={MUC[6]}><RuiRo hs={hs} /></Muc>
            </div>
          </div>
        </>
      )}
    </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
const Muc = ({ so, m, children, refEl }: { so: number; m: (typeof MUC)[number]; children: React.ReactNode; refEl: (el: HTMLElement | null) => void }) => (
  <section ref={refEl} className="scroll-mt-20 mtb:scroll-mt-32 rounded-2xl border border-slate-200 bg-white p-5">
    <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900"><m.Icon className="h-5 w-5 text-slate-500" aria-hidden />{so}. {m.ten}</h3>
    {children}
  </section>
);
const The = ({ nhan, so, phu, mau = 'text-slate-900', bam }: { nhan: string; so: React.ReactNode; phu?: React.ReactNode; mau?: string; bam?: () => void }) => {
  const nd = (<>
    <p className="flex items-baseline justify-between gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">{nhan}
      {bam && <span className="normal-case tracking-normal text-blue-600">Chi tiết ›</span>}</p>
    <p className={`mt-0.5 text-2xl font-extrabold tabular-nums ${mau}`}>{so}</p>
    {phu && <div className="mt-0.5 text-sm text-slate-600">{phu}</div>}
  </>);
  return bam
    ? <button type="button" onClick={bam} className="rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-slate-300 hover:shadow-md">{nd}</button>
    : <div className="rounded-xl border border-slate-200 px-4 py-3">{nd}</div>;
};
const ChuaCo = ({ nguon, can }: { nguon: string; can: string }) => (
  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
    <p className="font-semibold text-slate-700">Chưa có trong app</p>
    <p className="mt-1">Đang nằm ở: {nguon}</p>
    <p className="mt-1 text-slate-500">{can}</p>
  </div>
);

// 1 ---------------------------------------------------------------------------
const ThongTin = ({ hs, onXemPc }: { hs: HoSo; onXemPc: (pc: string) => void }) => {
  const t = hs.thongTin;
  const conBot = soNgayToi(t.botDuAn);
  const hm = hs.hangMuc ?? [];
  const laHuy = (ipo: string) => /HỦY|HUỶ/.test(ipo.toUpperCase());
  const khongHuy = hm.filter(h => !laHuy(h.ipo));
  // Cùng 1 nguồn với cửa sổ danh sách HEX + 3 pivot mục 5 (người dùng 21/11/2026 "mâu thuẫn": bảng IPO đọc bảng sản xuất ra
  // 1 hạng mục HOÀN THÀNH, cửa sổ đọc file công trình ra 9): tình trạng IPO theo FILE công trình, trị giá / đã nhập theo hạng mục.
  // Chưa có dữ liệu hạng mục thì dùng số tổng của máy chủ như cũ.
  const coHm = hm.length > 0;
  const ipoTheoHm = [...hm.reduce((m, h) => {
    const x = m.get(h.ipo) ?? { ipo: h.ipo, soHex: 0, giaTri: 0 };
    x.soHex += 1; x.giaTri += h.tri_gia || 0; m.set(h.ipo, x); return m;
  }, new Map<string, { ipo: string; soHex: number; giaTri: number }>()).values()].sort((a, b) => a.ipo.localeCompare(b.ipo, 'vi', { numeric: true }));
  const dsIpo = coHm ? ipoTheoHm : t.ipo;
  const soHuy = dsIpo.filter(x => laHuy(x.ipo)).reduce((s0, x) => s0 + x.soHex, 0);
  const giaTri = coHm ? khongHuy.reduce((s0, h) => s0 + (h.tri_gia || 0), 0) : t.giaTri;
  // đã nhập theo hạng mục: bỏ HỦY, mỗi hạng mục 0 ≤ nhập ≤ trị giá (bảng nhập kho gồm cả nhập của hạng mục HỦY)
  const daNhap = coHm ? khongHuy.reduce((s0, h) => s0 + Math.min(Math.max(h.da_nhap || 0, 0), Math.max(h.tri_gia || 0, 0)), 0) : t.daNhapHm;
  const pt = giaTri > 0 ? (daNhap / giaTri) * 100 : 0;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <The nhan="Giá trị đơn hàng" so={<>{ty(giaTri)} <span className="text-base font-semibold text-slate-500">tỷ</span></>} bam={() => moDsHex('Giá trị đơn hàng (không tính HỦY)', khongHuy)} />
        <The nhan="Số lượng" so={<>{(coHm ? hm.length : t.soHex) - soHuy} <span className="text-base font-semibold text-slate-500">hạng mục</span></>}
          phu={soHuy ? `+ ${soHuy} hạng mục HỦY` : undefined} bam={() => moDsHex('Tất cả hạng mục', hm)} />
        <The nhan="PM" so={<span className="text-lg">{t.pm[0]?.ten ?? '—'}</span>} phu={t.pm.length > 1 ? `và ${t.pm.slice(1).map(x => x.ten).join(', ')}` : undefined} />
        <The nhan="PC" so={<span className="text-lg">{t.pc[0]?.ten ?? '—'}</span>}
          bam={t.pc[0] ? () => onXemPc(t.pc[0].ten) : undefined} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <The nhan="Đã nhập kho" mau="text-emerald-700" so={<>{ty(daNhap)} <span className="text-base font-semibold text-slate-500">tỷ</span></>}
          phu={<>Hoàn thành <b>{pt.toFixed(1)}%</b> · còn {ty(Math.max(giaTri - daNhap, 0))} tỷ</>}
          bam={() => moKho({ loai: 'nhap', ma: hs.ma, ten: t.ten })} />
        <The nhan="Xuất kho / Tồn kho" so={<span className="text-xl">{ty(t.kho.xuat)} / {ty(t.kho.ton)} <span className="text-base font-semibold text-slate-500">tỷ</span></span>}
          phu={`Tồn ngày ${ngay(t.kho.ngayTon)}`} bam={() => moKho({ loai: 'xuat', ma: hs.ma, ten: t.ten })} />
        <The nhan="Nhận đơn từ PM" so={<span className="text-xl">{ngay(t.nhanTuPm)}</span>} />
        <The nhan="BOT dự án" mau={conBot != null && conBot < 0 ? 'text-red-600' : 'text-slate-900'} so={<span className="text-xl">{ngay(t.botDuAn)}</span>}
          phu={<>{conBot != null && (conBot < 0 ? <b className="text-red-600">Trễ {-conBot} ngày</b> : `Còn ${conBot} ngày`)}</>} />
      </div>
      <table className={`${bang.table} !w-auto`}>
        <thead className={bang.thead}><tr><th className={bang.thB}>Tình trạng IPO</th><th className={bang.thC}>Hạng mục</th><th className={bang.thC}>Giá trị (tỷ)</th></tr></thead>
        <tbody>{dsIpo.map(x => (
          <tr key={x.ipo} className={laHuy(x.ipo) ? 'text-slate-400' : ''}>
            <td className={bang.tdB}>{x.ipo}</td>
            <td className={bang.tdSo}><button type="button" onClick={() => moDsHex(`Tình trạng IPO: ${x.ipo}`, hm.filter(h => h.ipo === x.ipo))} className={`${bang.soBam} hover:text-blue-700`}>{x.soHex}</button></td>
            <td className={bang.tdSo}><button type="button" onClick={() => moDsHex(`Tình trạng IPO: ${x.ipo}`, hm.filter(h => h.ipo === x.ipo))} className={`${bang.soBam} hover:text-blue-700`}>{ty(x.giaTri)}</button></td>
          </tr>))}</tbody>
      </table>
    </div>
  );
};

// 2 ---------------------------------------------------------------------------
const TkbvThanh = ({ hs }: { hs: HoSo }) => {
  const ds = hs.masterplan.tkbv;
  const tong = ds.reduce((s, x) => s + x.soHex, 0) || 1;
  const da = ds.filter(x => /ĐÃ/.test(x.tt.toUpperCase())).reduce((s, x) => s + x.soHex, 0);
  return (
    <div>
      <p className="text-sm text-slate-700">Đã triển khai bản vẽ <b>{da}</b> / {tong} hạng mục (<b>{((da / tong) * 100).toFixed(0)}%</b>)</p>
      <div className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-slate-200">
        <span className="bg-emerald-500" style={{ width: `${(da / tong) * 100}%` }} />
      </div>
    </div>
  );
};
const Concept = ({ hs }: { hs: HoSo }) => (
  <div className="space-y-3">
    <TkbvThanh hs={hs} />
    {hs.taiLieu ? (<>
      <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        Thư mục dự án: <b className="text-slate-700">{hs.taiLieu.thuMuc ?? '— chưa thấy thư mục mang mã này trên Drive'}</b>
        {hs.taiLieu.driveId && <a href={linkDrive(hs.taiLieu.driveId, true) ?? undefined} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 hover:underline">Mở trên Drive ↗</a>}
      </p>
      {!(['concept', 'khoi-cong', 'boq', 'ban-ve', 'thay-doi'] as const).some(k => fileNhom(hs, k).length) &&
        <p className="text-sm text-slate-500">Thư mục dự án chưa có file concept / hồ sơ đầu vào / bản vẽ.</p>}
      <div className="grid gap-3 xl:grid-cols-3">
        <DanhSachFile hs={hs} k="concept" />
        <DanhSachFile hs={hs} k="khoi-cong" />
        <DanhSachFile hs={hs} k="boq" />
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <DanhSachFile hs={hs} k="ban-ve" toiDa={6} />
        <DanhSachFile hs={hs} k="thay-doi" toiDa={6} />
      </div>
    </>) : <ChuaCo nguon={`Drive: 005_PROJECT\\NĂM 20${hs.ma.slice(2, 4)}\\${hs.ma} …\\02_SẢN XUẤT\\01_HỒ SƠ ĐẦU VÀO\\02_CONCEPT (file concept, BOQ, bản vẽ PM triển khai)`}
      can="Chưa nạp danh mục file — chạy backend/scripts/quet_tai_lieu_ct.py (đọc metadata Drive for Desktop) để hiện file + link mở." />}
  </div>
);

// 3 ---------------------------------------------------------------------------
type DongVl = {
  dong: number; nhom: string | null; code: string | null; mo_ta: string | null; tt_mau: string | null; ngay_duyet: string | null;
  nhu_cau: string | null; vi_tri: string | null; dvt_qs: string | null; sl_qs: string | null; ma_sap: string | null; ten_vt: string | null;
  tt_pr: string | null; tt_vat_tu: string | null; bop_m2: string | null; anh: string[];
};
/** Ảnh mẫu vật liệu (ct_vl_anh): API cần token => fetch -> blob -> objectURL; chỉ tải khi gần vào màn hình */
const anhVlCache = new Map<string, Promise<string>>();
const taiAnhVl = (h: string) => {
  let p = anhVlCache.get(h);
  if (!p) {
    p = fetch(`${API_BASE_URL}/ho-so-cong-trinh/anh-vl/${h}`).then(r => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status))))).then(b => URL.createObjectURL(b));
    p.catch(() => anhVlCache.delete(h));
    anhVlCache.set(h, p);
  }
  return p;
};
const AnhVl = ({ hash, alt, className }: { hash: string; alt: string; className: string }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loi, setLoi] = useState(false);
  useEffect(() => {
    setUrl(null); setLoi(false);
    const el = ref.current;
    let song = true;
    const tai = () => taiAnhVl(hash).then(u => { if (song) setUrl(u); }).catch(() => { if (song) setLoi(true); });
    if (!el || typeof IntersectionObserver === 'undefined') { tai(); return () => { song = false; }; }
    const ob = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { ob.disconnect(); tai(); } }, { rootMargin: '400px 0px' });
    ob.observe(el);
    return () => { song = false; ob.disconnect(); };
  }, [hash]);
  if (url) return <img src={url} alt={alt} decoding="async" className={`${className} object-cover`} />;
  return <div ref={ref} className={`${className} ${loi ? 'bg-slate-100' : 'animate-pulse bg-slate-200'}`} />;
};
const mauTtMau = (t: string | null) => (/ĐÃ DUYỆT/i.test(t ?? '') ? 'bg-emerald-100 text-emerald-800' : /CHƯA|CHỜ/i.test(t ?? '') ? 'bg-amber-100 text-amber-800' : /HỦY/i.test(t ?? '') ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-700');
const boSo = (t: string | null) => (t ?? '').replace(/^\d+\.\s*/, '');
/** Cửa sổ 1 vật liệu: ảnh lớn + toàn bộ thông tin dòng sheet 03 */
const CuaSoVl = ({ v, onClose }: { v: DongVl; onClose: () => void }) => {
  const [i, setI] = useState(0);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') setI(x => Math.min(x + 1, v.anh.length - 1)); if (e.key === 'ArrowLeft') setI(x => Math.max(x - 1, 0)); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, v.anh.length]);
  const dong: [string, string | null][] = [['Nhóm vật tư', boSo(v.nhom)], ['Tình trạng mẫu', boSo(v.tt_mau)], ['Ngày duyệt mẫu', v.ngay_duyet],
    ['Vị trí dùng', v.vi_tri], ['SL theo QS', [v.sl_qs, v.dvt_qs].filter(Boolean).join(' ')], ['Nhu cầu đặt mua', boSo(v.nhu_cau)],
    ['Mã SAP', v.ma_sap], ['Tên vật tư SAP', v.ten_vt], ['Tình trạng PR', boSo(v.tt_pr)], ['Tình trạng vật tư', boSo(v.tt_vat_tu)], ['BOP-M2', v.bop_m2]];
  return (
    <div className={bang.cuaSoNen} onClick={onClose}>
      <div className={`${bang.cuaSoKhung} !max-w-4xl`} onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-slate-900">{v.code || '—'} <span className="font-medium text-slate-500">· {boSo(v.nhom)}</span></p>
            <p className="whitespace-pre-line text-sm text-slate-700">{v.mo_ta}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100" aria-label="Đóng">×</button>
        </div>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto md:grid-cols-[minmax(0,1fr)_18rem]">
          <div>
            {v.anh.length ? <AnhVl key={v.anh[i]} hash={v.anh[i]} alt={v.code ?? ''} className="max-h-[60vh] w-full rounded-lg !object-contain bg-slate-50" />
              : <div className="flex h-48 items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">Chưa có ảnh mẫu</div>}
            {v.anh.length > 1 && <div className="mt-2 flex gap-2">{v.anh.map((h, j) => (
              <button key={h} type="button" onClick={() => setI(j)} className={`overflow-hidden rounded-md border-2 ${j === i ? 'border-blue-500' : 'border-transparent'}`}>
                <AnhVl hash={h} alt="" className="h-14 w-14" /></button>))}</div>}
          </div>
          <dl className="space-y-1.5 text-sm">
            {dong.filter(([, x]) => x).map(([k, x]) => (
              <div key={k}><dt className="text-xs font-semibold uppercase text-slate-500">{k}</dt><dd className="whitespace-pre-line text-slate-800">{x}</dd></div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
};
/** Danh mục vật liệu đang dùng ở công trình (sheet 03_MATERIALS) dạng thẻ ảnh — lọc nhóm, tìm, bấm thẻ xem chi tiết */
const DanhMucVl = ({ hs }: { hs: HoSo }) => {
  const dm = hs.vatLieu.danhMuc;
  const [nhom, setNhom] = useState('');
  const [tim, setTim] = useState('');
  const [xem, setXem] = useState<DongVl | null>(null);
  // Mặc định chỉ hiện 3 dòng thẻ (người dùng 21/11/2026), "Xem tất cả" để sổ hết; số cột đọc từ lưới (đổi theo bề rộng)
  const [moHet, setMoHet] = useState(false);
  const [soCot, setSoCot] = useState(6);
  const quan = useRef<ResizeObserver | null>(null);
  const gridRef = useCallback((el: HTMLDivElement | null) => {
    quan.current?.disconnect();
    if (!el) return;
    const doc = () => setSoCot(Math.max(1, getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length));
    doc();
    quan.current = new ResizeObserver(doc);
    quan.current.observe(el);
  }, []);
  useEffect(() => { setMoHet(false); }, [nhom, tim]);
  if (dm === undefined || dm === null) return <ChuaCo nguon="sheet 03_MATERIALS file Production Status" can="Chưa nạp — chạy nap_danh_muc_vl.py." />;
  if (!dm.rows.length) return <p className="text-sm text-slate-500">File công trình chưa có dòng vật liệu nào ở sheet 03_MATERIALS{dm.file?.loi ? ` (${dm.file.loi})` : ''}.</p>;
  const dsNhom = [...new Map(dm.rows.map(r => [r.nhom ?? '', 0])).keys()].sort();
  const dem = (n: string) => dm.rows.filter(r => (r.nhom ?? '') === n).length;
  const t = tim.trim().toUpperCase();
  const rows = dm.rows.filter(r => (!nhom || (r.nhom ?? '') === nhom) && (!t || `${r.code ?? ''} ${r.mo_ta ?? ''} ${r.vi_tri ?? ''} ${r.ten_vt ?? ''}`.toUpperCase().includes(t)));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {['', ...dsNhom].map(n => (
          <button key={n || 'tat-ca'} type="button" onClick={() => setNhom(n)} aria-pressed={nhom === n}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${nhom === n ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {n ? boSo(n) || '(chưa ghi nhóm)' : 'Tất cả'} <span className="opacity-60">{n ? dem(n) : dm.rows.length}</span></button>
        ))}
        <input value={tim} onChange={e => setTim(e.target.value)} placeholder="Tìm code / mô tả / vị trí" className="ml-auto h-8 w-56 rounded-lg border border-slate-300 px-3 text-sm outline-none" />
      </div>
      <div ref={gridRef} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
        {(moHet ? rows : rows.slice(0, soCot * 3)).map(r => (
          <button key={r.dong} type="button" onClick={() => setXem(r)} className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition hover:border-slate-300 hover:shadow-md">
            <div className="relative">
              {r.anh.length ? <AnhVl hash={r.anh[0]} alt={r.code ?? ''} className="aspect-[4/3] w-full" />
                : <div className="flex aspect-[4/3] w-full items-center justify-center bg-slate-50 text-xs text-slate-400">Chưa có ảnh</div>}
              {r.anh.length > 1 && <span className="absolute bottom-1 right-1 rounded bg-slate-900/70 px-1.5 text-[10px] font-semibold text-white">{r.anh.length} ảnh</span>}
            </div>
            <div className="space-y-1 p-2.5">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-bold text-slate-900">{r.code || '—'}</span>
                {r.tt_mau && <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${mauTtMau(r.tt_mau)}`}>{boSo(r.tt_mau)}</span>}
              </div>
              <p className="line-clamp-2 text-xs text-slate-700" title={r.mo_ta ?? ''}>{r.mo_ta}</p>
              {r.vi_tri && <p className="truncate text-[11px] text-slate-500" title={r.vi_tri}>{r.vi_tri.replace(/\n/g, ' · ')}</p>}
            </div>
          </button>
        ))}
      </div>
      {rows.length > soCot * 3 && (
        <button type="button" onClick={() => setMoHet(v => !v)} aria-expanded={moHet}
          className="w-full rounded-lg border border-dashed border-slate-300 py-1.5 text-sm font-semibold text-blue-700 hover:bg-slate-50">
          {moHet ? 'Thu gọn ▲' : `Xem tất cả ${rows.length} vật liệu (còn ${rows.length - soCot * 3}) ▼`}
        </button>
      )}
      {!rows.length && <p className="text-sm text-slate-500">Không có vật liệu khớp.</p>}
      {dm.file && <p className="text-[11px] text-slate-400">Nguồn: {dm.file.ten_file} · sửa {dm.file.sua_luc}</p>}
      {xem && <CuaSoVl v={xem} onClose={() => setXem(null)} />}
    </div>
  );
};

/** Ô ảnh vật liệu: ảnh nhỏ (lấy theo mã SAP, không có thì theo code VL của công trình); bấm xem ảnh lớn */
const OAnhVl = ({ ds, vl, ten, onXem, onXemVl }: { ds: AnhNoiBo[] | undefined; vl?: DongVl; ten: string; onXem: (ds: AnhNoiBo[], ten: string) => void; onXemVl: (v: DongVl) => void }) => {
  // Ưu tiên ảnh sheet 03 của chính công trình (dòng vật liệu khớp mã SAP / code VL), không có mới lấy kho ảnh vật tư
  if (vl?.anh.length) return (
    <button type="button" onClick={() => onXemVl(vl)} className="relative mx-auto block h-12 w-12 overflow-hidden rounded-md border border-slate-200 hover:ring-2 hover:ring-blue-400"
      title={`${vl.code ?? ''} — xem vật liệu`}>
      <AnhVl hash={vl.anh[0]} alt={ten} className="h-12 w-12" />
    </button>
  );
  if (!ds?.length) return <span className="text-xs text-slate-300">—</span>;
  return (
    <button type="button" onClick={() => onXem(ds, ten)} className="relative mx-auto block h-12 w-12 overflow-hidden rounded-md border border-slate-200 hover:ring-2 hover:ring-blue-400"
      title={`Xem ảnh${ds.length > 1 ? ` (${ds.length})` : ''}`}>
      <AnhNoiBoImg anh={ds[0]} alt={ten} className="h-12 w-12" duPhong={<span className="text-xs text-slate-300">—</span>} />
      {ds.length > 1 && <span className="absolute bottom-0 right-0 rounded-tl bg-slate-900/70 px-1 text-[10px] font-semibold text-white">{ds.length}</span>}
    </button>
  );
};

const VatLieu = ({ hs }: { hs: HoSo }) => {
  const v = hs.vatLieu;
  const [moHet, setMoHet] = useState(false);
  const [xemAnh, setXemAnh] = useState<{ ds: AnhNoiBo[]; ten: string } | null>(null);
  const [xemVl, setXemVl] = useState<DongVl | null>(null);
  // Dòng sheet 03 (có ảnh) theo mã SAP (ô nhiều mã) và theo code VL
  const vlTheo = useMemo(() => {
    const ma = new Map<string, DongVl>(), code = new Map<string, DongVl>();
    for (const d of v.danhMuc?.rows ?? []) {
      if (!d.anh.length) continue;
      for (const m of (d.ma_sap ?? '').split('\n').map(x => x.trim()).filter(Boolean)) if (!ma.has(m)) ma.set(m, d);
      const c = (d.code ?? '').trim().toUpperCase();
      if (c && !code.has(c)) code.set(c, d);
    }
    return { ma, code };
  }, [v.danhMuc]);
  const vlCua = (maSap: unknown, code: unknown) => (maSap != null ? vlTheo.ma.get(String(maSap).trim()) : undefined)
    ?? (code != null ? vlTheo.code.get(String(code).trim().toUpperCase()) : undefined);
  const anhCua = (maSap: unknown, code: unknown) => {
    const m = maSap != null ? v.anhTheoMa?.[String(maSap).trim()] : undefined;
    if (m?.length) return m;
    return code != null && String(code).trim() ? v.anhTheoCode?.[String(code).trim().toUpperCase()] : undefined;
  };
  const xem = (ds: AnhNoiBo[], ten: string) => setXemAnh({ ds, ten });
  const dong = moHet ? v.prDong : v.prDong.slice(0, 12);
  return (
    <div className="space-y-4">
      <DanhMucVl hs={hs} />
      <p className="border-t border-slate-100 pt-3 text-sm font-bold text-slate-800">Mua hàng (PR) của công trình</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {v.pr.map(x => (
          <The key={x.tt} nhan={x.tt.replace(/^\d+\./, '')} so={<>{x.soDong} <span className="text-base font-semibold text-slate-500">dòng PR</span></>}
            phu={<>{x.soPr} PR{v.coGia && x.thanhTien != null ? (x.coGia > 0 ? <> · <b>{tyDong(x.thanhTien)}</b> tỷ{x.coGia < x.soDong ? ` (${x.soDong - x.coGia} dòng chưa có giá)` : ''}</> : ' · chưa có giá') : ''}</>}
            mau={/ĐÃ NHẬP/.test(x.tt) ? 'text-emerald-700' : /ĐANG/.test(x.tt) ? 'text-blue-700' : /HỦY/.test(x.tt) ? 'text-slate-400' : 'text-amber-700'} />
        ))}
        {!v.pr.length && <p className="text-sm text-slate-500">Chưa có PR nào ghi mã {hs.ma} (TrackingNo).</p>}
      </div>
      {v.prDong.length > 0 && (
        <div className={`${bang.khung} max-h-[26rem]`}>
          <table className={bang.table}>
            <thead className={bang.thead}><tr>
              {['Ảnh', 'Tình trạng', 'Số PR', 'Mã SAP', 'Tên vật tư', 'Code VL', 'SL yêu cầu', 'Còn lại', 'ĐVT', 'Ngày PR', 'Dự kiến về', 'Thực tế về', 'NCC', ...(v.coGia ? ['Thành tiền (triệu)'] : []), 'PR note']
                .map(h => <th key={h} className={`${bang.thC} whitespace-nowrap`}>{h}</th>)}
            </tr></thead>
            <tbody>{dong.map((r, i) => (
              <tr key={i}>
                <td className={`${bang.tdB} !py-1`}><OAnhVl ds={anhCua(r.ma_vat_tu_sap, r.code_vat_lieu)} vl={vlCua(r.ma_vat_tu_sap, r.code_vat_lieu)} ten={String(r.ten_vat_tu ?? '')} onXem={xem} onXemVl={setXemVl} /></td>
                <td className={`${bang.tdB} whitespace-nowrap`}>{String(r.trang_thai ?? '')}</td>
                <td className={bang.tdSo}>{r.so_pr ?? ''}{r.pr_line ? `/${r.pr_line}` : ''}</td>
                <td className={bang.tdSo}>{r.ma_vat_tu_sap ?? ''}</td>
                <td className={`${bang.tdB} min-w-[14rem]`}>{String(r.ten_vat_tu ?? '')}</td>
                <td className={bang.tdSo}>{String(r.code_vat_lieu ?? '')}</td>
                <td className={bang.tdSo}>{r.so_luong_yeu_cau ?? ''}</td>
                <td className={bang.tdSo}>{r.so_luong_con_lai ?? ''}</td>
                <td className={bang.tdSo}>{String(r.dvt ?? '')}</td>
                <td className={bang.tdSo}>{ngay(r.ngay_pr as string)}</td>
                <td className={bang.tdSo}>{ngay(r.ngay_du_kien as string)}</td>
                <td className={bang.tdSo}>{ngay(r.ngay_ve as string)}</td>
                <td className={`${bang.tdB} min-w-[10rem]`}>{String(r.nha_cung_cap ?? '')}</td>
                {v.coGia && <td className={bang.tdSo}>{r.thanh_tien ? trieu(Number(r.thanh_tien) / 1e6) : ''}</td>}
                <td className={`${bang.tdB} min-w-[12rem] text-sm`}>{String(r.team_pr_note ?? '')}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      {v.prDong.length > 12 && <button type="button" onClick={() => setMoHet(m => !m)} className="text-sm font-semibold text-blue-700 hover:underline">{moHet ? 'Thu gọn' : v.prTong > v.prDong.length ? `Xem ${v.prDong.length} / ${v.prTong} dòng PR (mới nhất)` : `Xem đủ ${v.prDong.length} dòng PR`}</button>}
      <div>
        <p className="mb-1.5 text-sm font-semibold text-slate-800">Tồn kho vật tư của công trình {v.tonKhoVt[0] ? `(ngày ${ngay(v.tonKhoVt[0].ngay)})` : ''}</p>
        {v.tonKhoVt.length ? (
          <table className={`${bang.table} !w-auto`}>
            <thead className={bang.thead}><tr>{['Ảnh', 'Mã vật tư', 'Tên vật tư', 'Nhóm', 'Số lượng', 'ĐVT', ...(v.coGia ? ['Giá trị (triệu)'] : [])].map(h => <th key={h} className={bang.thC}>{h}</th>)}</tr></thead>
            <tbody>{v.tonKhoVt.map((r, i) => (
              <tr key={i}><td className={`${bang.tdB} !py-1`}><OAnhVl ds={anhCua(r.ma_vat_tu, null)} vl={vlCua(r.ma_vat_tu, null)} ten={String(r.ten_vat_tu ?? '')} onXem={xem} onXemVl={setXemVl} /></td><td className={bang.tdSo}>{r.ma_vat_tu}</td><td className={bang.tdB}>{r.ten_vat_tu}</td><td className={bang.tdB}>{r.nhom_vat_tu}</td>
                <td className={bang.tdSo}>{r.so_luong?.toLocaleString('en-US')}</td><td className={bang.tdSo}>{r.dvt}</td>
                {v.coGia && <td className={bang.tdSo}>{r.gia_tri != null ? trieu(r.gia_tri) : ''}</td>}</tr>))}</tbody>
          </table>
        ) : <p className="text-sm text-slate-500">Không có vật tư tồn kho ghi mã công trình này.</p>}
      </div>
      {xemVl && <CuaSoVl v={xemVl} onClose={() => setXemVl(null)} />}
      {xemAnh && <XemAnhNoiBo ds={xemAnh.ds} start={0} ten={xemAnh.ten} coQuyenSua={false} dangDoi={null} onDoi={() => undefined} onDong={() => setXemAnh(null)} />}
    </div>
  );
};

// 4 ---------------------------------------------------------------------------
const nhanThang = (ym: string) => `T${Number(ym.slice(5, 7))}/${ym.slice(2, 4)}`;
/** Tuần ISO (thứ 2 đầu tuần) — đánh dấu "tuần này" trong KH tuần */
const tuanIso = (d0: Date) => {
  const d = new Date(Date.UTC(d0.getFullYear(), d0.getMonth(), d0.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
};
/** "2026-09" => "Tháng 9/2026" */
const tenThangVn = (ym: string) => `Tháng ${Number(ym.slice(5, 7))}/${ym.slice(0, 4)}`;
/** Trục tháng 2 dòng: "Tháng 9" + năm nhỏ bên dưới */
const MpTickThang = ({ x, y, payload, du }: { x?: number; y?: number; payload?: { index: number }; du: { thang: string }[] }) => {
  const d = payload ? du[payload.index] : undefined;
  if (x == null || y == null || !d) return null;
  return (
    <g transform={`translate(${x},${y})`}>
      <text y={12} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="#334155">Tháng {Number(d.thang.slice(5, 7))}</text>
      <text y={25} textAnchor="middle" fontSize={10} fill="#94a3b8">{d.thang.slice(0, 4)}</text>
    </g>
  );
};
// Số trên biểu đồ (người dùng 20/11/2026): cả 3 số ghi giữa cột, mỗi số ngay trên đỉnh của nó; số nào sát nhau thì đẩy
// số cao hơn lên 1 dòng => không bao giờ đè nhau / đè lên trục tháng.
type TrucMap = Record<string, { scale: ((v: string | number) => number) & { bandwidth?: () => number } }>;
const MpNhanSo = ({ du, xAxisMap, yAxisMap }: { du: { ten: string; khnk: number; khsx: number; nhap: number }[]; xAxisMap?: TrucMap; yAxisMap?: TrucMap }) => {
  const xa = xAxisMap?.kh, ya = yAxisMap ? Object.values(yAxisMap)[0] : undefined;
  if (!xa || !ya) return null;
  const bw = xa.scale.bandwidth?.() ?? 0;
  return (
    <g>
      {du.map(d => {
        const cx = xa.scale(d.ten) + bw / 2;
        const ds = ([[d.khnk, '#475569', 600], [d.khsx, '#7c3aed', 600], [d.nhap, '#047857', 700]] as [number, string, number][])
          .filter(([v]) => v >= 0.005)
          .map(([v, mau, dam]) => ({ v, mau, dam, y: ya.scale(v) - 6 }))
          .sort((p, q) => q.y - p.y);   // thấp nhất (y lớn) trước
        for (let i = 1; i < ds.length; i++) if (ds[i].y > ds[i - 1].y - 13) ds[i].y = ds[i - 1].y - 13;
        return ds.map(n => <text key={n.mau} x={cx} y={n.y} textAnchor="middle" fontSize={11} fontWeight={n.dam} fill={n.mau}
          stroke="#fff" strokeWidth={3} paintOrder="stroke">{n.v.toFixed(2)}</text>);
      })}
    </g>
  );
};
type KhsxDong = { loai: string; nam: number; thang: number; tuan: number | null; ngay: string | null; hex: string; ten_hang_muc: string | null; xuong: string | null; dvt: string | null; sl: string | null; gia_tri: number };
let moKhsxToanCuc: ((v: { tieuDe: string; dong: KhsxDong[] }) => void) | null = null;
const moKhsx = (tieuDe: string, dong: KhsxDong[]) => moKhsxToanCuc?.({ tieuDe, dong });
/** Cửa sổ chi tiết KH sản xuất (dòng file KHSX) — bấm tháng / tuần ở mục Masterplan */
const CuaSoKhsx = () => {
  const [x, setX] = useState<{ tieuDe: string; dong: KhsxDong[] } | null>(null);
  useEffect(() => { moKhsxToanCuc = setX; return () => { moKhsxToanCuc = null; }; }, []);
  useEffect(() => {
    if (!x) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setX(null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [x]);
  if (!x) return null;
  const tong = x.dong.reduce((a, d) => a + d.gia_tri, 0);
  return (
    <div className={bang.cuaSoNen} onClick={() => setX(null)}>
      <div className={bang.cuaSoKhung} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-lg font-bold text-slate-900">{x.tieuDe} <span className="text-sm font-medium text-slate-500">· {new Set(x.dong.map(d => d.hex)).size} hạng mục · {x.dong.length} dòng</span></p>
          <button type="button" onClick={() => setX(null)} className="rounded-lg px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100" aria-label="Đóng">×</button>
        </div>
        <div className={`${bang.khung} min-h-0 flex-1`}>
          <table className={`${bang.table} ${bang.cuaSoBang}`}>
            <thead className={bang.thead}><tr>
              {['STT', 'Loại KH', 'Tuần', 'Ngày', 'HEX', 'Hạng mục', 'Khu vực SX', 'SL KH', 'Giá trị KH (triệu)'].map(h => <th key={h} className={`${bang.thC} whitespace-nowrap`}>{h}</th>)}
            </tr></thead>
            <tbody>{x.dong.map((d, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className={bang.tdSo}>{i + 1}</td>
                <td className={bang.tdSo}>{d.loai === 'TUẦN' ? 'Tuần' : 'Tháng'}</td>
                <td className={bang.tdSo}>{d.tuan ?? ''}</td>
                <td className={bang.tdSo}>{d.ngay && /^\d{4}-\d{2}-\d{2}/.test(d.ngay) ? ngay(d.ngay.slice(0, 10)) : (d.ngay ?? '')}</td>
                <td className={bang.tdSo}>{d.hex}</td>
                <td className={`${bang.tdB} min-w-[18rem]`}>{d.ten_hang_muc ?? ''}</td>
                <td className={bang.tdSo}>{d.xuong ?? ''}</td>
                <td className={bang.tdSo}>{d.sl ?? ''}{d.dvt ? <span className="ml-1 text-xs text-slate-500">{d.dvt}</span> : null}</td>
                <td className={bang.tdSo}>{trieu1(d.gia_tri)}</td>
              </tr>))}</tbody>
            <tfoot className={bang.tfoot}><tr>
              <td colSpan={8} className={`${bang.tdB} text-center`}>TỔNG</td>
              <td className={bang.tdSo}>{trieu1(tong)}</td>
            </tr></tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
type MpDong = { ten: string; thang: string; khnk: number; khsx: number; nhap: number };
/** Tooltip biểu đồ masterplan: KHNK / KH SX / thực nhập + % đạt so KHNK */
const MpTip = ({ active, payload }: { active?: boolean; payload?: { payload: MpDong }[] }) => {
  const x = active ? payload?.[0]?.payload : undefined;
  if (!x) return null;
  const dong: [string, string, number][] = [['#94a3b8', 'KHNK', x.khnk], ['#8b5cf6', 'KH sản xuất', x.khsx], ['#059669', 'Thực nhập', x.nhap]];
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 text-sm font-bold text-slate-900">{tenThangVn(x.thang)}</p>
      {dong.map(([m, t, v]) => (
        <p key={t} className="flex items-center gap-2"><i className="inline-block h-2 w-2 rounded-full" style={{ background: m }} />
          <span className="text-slate-600">{t}</span><b className="ml-auto pl-4 tabular-nums text-slate-900">{v.toFixed(2)} tỷ</b></p>
      ))}
      {x.khnk > 0 && <p className="mt-1 border-t border-slate-100 pt-1 text-slate-600">Đạt <b className={x.nhap >= x.khnk ? 'text-emerald-700' : 'text-red-600'}>{Math.round((x.nhap / x.khnk) * 100)}%</b> KHNK</p>}
    </div>
  );
};
const Masterplan = ({ hs }: { hs: HoSo }) => {
  const mp = hs.masterplan;
  // KHNK file: "KHNK T11" => tháng 11 của năm trước tháng đầu dạng "01-27"
  const dauMmYy = mp.khnk.map(x => /^(\d{2})-(\d{2})$/.exec(x.nhan)).find(Boolean);
  const namDau = dauMmYy ? 2000 + Number(dauMmYy[2]) : new Date().getFullYear();
  const thangDau = dauMmYy ? Number(dauMmYy[1]) : 1;
  const ym = (x: { nhan: string }) => {
    const a = /^(\d{2})-(\d{2})$/.exec(x.nhan); if (a) return `20${a[2]}-${a[1]}`;
    const b = /T\s*(\d{1,2})$/i.exec(x.nhan); const m = b ? Number(b[1]) : 1;
    return `${m > thangDau ? namDau - 1 : namDau}-${String(m).padStart(2, '0')}`;
  };
  const thang = new Map<string, { thang: string; khnk: number; khsx: number; nhap: number }>();
  const o = (k: string) => { if (!thang.has(k)) thang.set(k, { thang: k, khnk: 0, khsx: 0, nhap: 0 }); return thang.get(k)!; };
  mp.khnk.forEach(x => { o(ym(x)).khnk += x.v; });
  mp.khsx.filter(x => x.loai.includes('THÁNG')).forEach(x => { o(`${x.nam}-${String(x.thang).padStart(2, '0')}`).khsx += x.giaTri; });
  mp.nhapTheoThang.forEach(x => { o(x.thang).nhap += x.giaTri; });
  const tatCa = [...thang.values()].sort((a, b) => a.thang.localeCompare(b.thang));
  // Bỏ các tháng trống ở 2 đầu (file KHNK có cột tới 06-27 dù công trình đã hết kế hoạch)
  const co = (x: (typeof tatCa)[number]) => Math.abs(x.khnk) + Math.abs(x.khsx) + Math.abs(x.nhap) > 0.5;
  const dauI = tatCa.findIndex(co), cuoiI = tatCa.length - 1 - [...tatCa].reverse().findIndex(co);
  const du = (dauI < 0 ? [] : tatCa.slice(dauI, cuoiI + 1))
    .map(x => ({ ...x, ten: nhanThang(x.thang), khnk: x.khnk / 1000, khsx: x.khsx / 1000, nhap: x.nhap / 1000 }))
    // vẽ: tháng không có số => để trống (không vẽ 0 ở tháng tương lai / tháng chưa có KH SX)
    .map(x => ({ ...x, khsxVe: x.khsx > 0.005 ? x.khsx : null, nhapVe: x.nhap > 0.005 ? x.nhap : null }));
  const t = hs.thongTin;
  const moc = [
    { ten: 'Nhận đơn từ PM', d: t.nhanTuPm },
    { ten: 'Triển khai bản vẽ', d: mp.tkbv.map(x => x.tu).filter(Boolean).sort()[0] ?? null },
    { ten: 'BOT cần giao sớm nhất', d: hs.bopBomBot.bot.canGiaoTu },
    { ten: 'BOT dự án', d: t.botDuAn },
  ];
  const tuan = mp.khsx.filter(x => x.loai.includes('TUẦN'));
  const dongKh = mp.khsxDong ?? [];
  const laTuan = (d: KhsxDong) => d.loai.includes('TUẦN');
  const moThang = (nam: number, thang: number) => moKhsx(`KH sản xuất tháng ${thang}/${nam}`, dongKh.filter(d => !laTuan(d) && d.nam === nam && d.thang === thang));
  const khThang = (nam: number, thang: number) => mp.khsx.filter(x => !x.loai.includes('TUẦN') && x.nam === nam && x.thang === thang).reduce((a, x) => a + x.giaTri, 0);
  const tongMp = du.reduce((a, x) => ({ khnk: a.khnk + x.khnk, khsx: a.khsx + x.khsx, nhap: a.nhap + x.nhap }), { khnk: 0, khsx: 0, nhap: 0 });
  const homNay = new Date();
  const thangNayYm = `${homNay.getFullYear()}-${String(homNay.getMonth() + 1).padStart(2, '0')}`;
  const thangNay = du.some(x => x.thang === thangNayYm) ? nhanThang(thangNayYm) : null;
  const namNay = homNay.getFullYear(), tuanNay = tuanIso(homNay);
  // KH tuần gom theo tháng, mới nhất lên trên
  const tuanTheoThang: { k: string; nam: number; thang: number; tong: number; ds: typeof tuan }[] = [];
  [...tuan].sort((a, b) => b.nam - a.nam || b.thang - a.thang || (b.tuan ?? 0) - (a.tuan ?? 0)).forEach(x => {
    const k = `${x.nam}-${x.thang}`;
    let g = tuanTheoThang.find(y => y.k === k);
    if (!g) { g = { k, nam: x.nam, thang: x.thang, tong: 0, ds: [] }; tuanTheoThang.push(g); }
    g.ds.push(x); g.tong += x.giaTri;
  });
  return (
    <div className="space-y-4">
      <ol className="grid gap-2 sm:grid-cols-4">
        {moc.map((m, i) => {
          const c = soNgayToi(m.d);
          return (
            <li key={m.ten} className="rounded-xl border border-slate-200 px-3 py-2">
              <p className="text-xs font-bold uppercase text-slate-500">{i + 1}. {m.ten}</p>
              <p className={`text-lg font-bold tabular-nums ${c != null && c < 0 && i >= 2 ? 'text-red-600' : 'text-slate-900'}`}>{ngay(m.d)}</p>
            </li>
          );
        })}
      </ol>
      {du.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <p className="text-sm font-bold text-slate-800">Kế hoạch nhập kho và thực nhập theo tháng <span className="font-normal text-slate-500">(tỷ)</span></p>
              <span className="ml-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#cbd5e1] align-middle" />KHNK <b className="tabular-nums text-slate-900">{tongMp.khnk.toFixed(2)}</b></span>
                <span><i className="mr-1 inline-block h-0.5 w-3 bg-[#8b5cf6] align-middle" />KH sản xuất <b className="tabular-nums text-slate-900">{tongMp.khsx.toFixed(2)}</b></span>
                <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#059669] align-middle" />Thực nhập <b className="tabular-nums text-emerald-700">{tongMp.nhap.toFixed(2)}</b></span>
              </span>
            </div>
            <div className="mt-2 h-60">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={du} margin={{ top: 16, right: 24, left: 0, bottom: 0 }} className="cursor-pointer"
                  onClick={(e: { activeTooltipIndex?: number } | null) => { const d = e?.activeTooltipIndex != null ? du[e.activeTooltipIndex] : undefined; if (d) moKho({ loai: 'nhap', ma: hs.ma, ten: hs.thongTin.ten, thang: d.thang }); }}>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis xAxisId="kh" dataKey="ten" tick={<MpTickThang du={du} />} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} interval="preserveStartEnd" height={34} />
                  <XAxis xAxisId="th" dataKey="ten" hide />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} width={36} tickLine={false} axisLine={false} domain={[0, (m: number) => Math.ceil(m * 1.25)]} />
                  {thangNay && <ReferenceLine xAxisId="kh" x={thangNay} stroke="#94a3b8" strokeDasharray="4 3" label={{ value: 'Tháng này', position: 'insideTopRight', fontSize: 11, fill: '#64748b' }} />}
                  <Tooltip cursor={{ fill: '#f8fafc' }} content={<MpTip />} />
                  {/* KH = cột rộng nhạt phía sau, thực nhập = cột hẹp đậm đè lên (cùng tâm) => nhìn ngay đạt / hụt */}
                  <Bar xAxisId="kh" dataKey="khnk" name="KHNK" fill="#cbd5e1" isAnimationActive={false} maxBarSize={38} radius={[3, 3, 0, 0]} />
                  <Bar xAxisId="th" dataKey="nhapVe" name="Thực nhập" fill="#059669" isAnimationActive={false} maxBarSize={14} radius={[3, 3, 0, 0]} />
                  <Line xAxisId="kh" dataKey="khsxVe" name="KH sản xuất tháng" stroke="#8b5cf6" isAnimationActive={false} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: '#8b5cf6' }} connectNulls />
                  <Customized component={(p: object) => <MpNhanSo du={du} {...p} />} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="flex max-h-[20rem] flex-col rounded-xl border border-slate-200">
            <div className="border-b border-slate-100 px-3 py-2">
              <p className="text-sm font-bold text-slate-800">KH sản xuất theo tuần <span className="font-normal text-slate-500">(tỷ)</span></p>
              <p className="text-[11px] text-slate-500">KH tuần và KH tháng là 2 kế hoạch riêng trong file KHSX — bấm số để xem hạng mục</p>
            </div>
            {tuanTheoThang.length ? (
              <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
                {tuanTheoThang.map(g => (
                  <div key={g.k}>
                    <p className="sticky top-0 flex items-baseline gap-2 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">T{g.thang}/{g.nam}
                      <button type="button" onClick={() => moThang(g.nam, g.thang)} className="ml-auto font-semibold text-violet-700 hover:underline" title="Xem hạng mục KH tháng">tháng {ty(khThang(g.nam, g.thang))}</button>
                      <button type="button" onClick={() => moKhsx(`KH sản xuất các tuần của tháng ${g.thang}/${g.nam}`, dongKh.filter(d => laTuan(d) && d.nam === g.nam && d.thang === g.thang))}
                        className="tabular-nums hover:text-blue-700 hover:underline" title="Xem hạng mục KH các tuần">tuần {ty(g.tong)}</button></p>
                    {g.ds.map(x => {
                      const nay = x.nam === namNay && x.tuan === tuanNay;
                      return (
                        <button type="button" key={x.tuan} onClick={() => moKhsx(`KH sản xuất tuần ${x.tuan} (tháng ${x.thang}/${x.nam})`, dongKh.filter(d => laTuan(d) && d.nam === x.nam && d.thang === x.thang && d.tuan === x.tuan))}
                          className={`flex w-full items-baseline gap-2 px-3 py-1 text-left text-sm hover:bg-slate-50 ${nay ? 'bg-blue-50 font-semibold' : ''}`}>
                          <span className="w-16 text-slate-700">Tuần {x.tuan}</span>
                          <span className="text-xs text-slate-500">{x.soHex} HM</span>
                          {nay && <span className="rounded bg-blue-600 px-1.5 text-[10px] font-bold text-white">tuần này</span>}
                          <span className="ml-auto tabular-nums text-slate-900">{ty(x.giaTri)}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : <p className="px-3 py-2 text-sm text-slate-500">Chưa có KH tuần.</p>}
          </div>
        </div>
      ) : <p className="text-sm text-slate-500">Chưa có kế hoạch nhập kho theo tháng.</p>}
      {hs.taiLieu && <DanhSachFile hs={hs} k="masterplan" />}
    </div>
  );
};

// 5 ---------------------------------------------------------------------------
// 3 bảng như file PRODUCTION STATUS (người dùng 20/11/2026): Count of HEX
//   BOP  — dòng: Tình trạng IPO × Phân loại nhóm SP, cột: BOP, lọc Tình trạng phiếu
//   BOM  — dòng: Phân loại nhóm SP HOẶC BOP (nút chuyển — file có 2 bảng), cột: Tình trạng BOP-M2, lọc IPO
//   BOT  — dòng: Tình trạng IPO × BOP, cột: Ngày cần giao (PC đề xuất), lọc ĐVT
const THU_TU_BOP = ['GCVT', 'P001', 'P002', 'P012', 'P013', 'P014', 'P016', 'P018', 'P020', 'P021', 'P022', 'P023', 'P025'];
const soBop = (a: string, b: string) => {
  const x = THU_TU_BOP.indexOf(a), y = THU_TU_BOP.indexOf(b);
  return (x < 0 ? 99 : x) - (y < 0 ? 99 : y) || a.localeCompare(b, 'vi', { numeric: true });
};
const soChu = (a: string, b: string) => {
  const ta = /^\(/.test(a), tb = /^\(/.test(b);   // (trống) / (blank) cuối
  return ta !== tb ? (ta ? 1 : -1) : a.localeCompare(b, 'vi', { numeric: true });
};
const ngayCot = (v: string) => (v === '(trống)' ? 'Chưa có ngày' : ngay(v));

type CotPivot = { ten: string; khoa: (h: HangMuc) => string; so: (a: string, b: string) => number };
/** Bảng pivot đếm HEX: 1–2 cấp dòng, 1 cấp cột, dòng TỔNG + cột TỔNG */
const Pivot = ({ dong, hang, cot, nhanCot, ten = 'Danh sách hạng mục' }: { dong: HangMuc[]; hang: CotPivot[]; cot: CotPivot; nhanCot: (v: string) => string; ten?: string }) => {
  // Bấm ô => danh sách HEX đúng ô (dòng cấp 1 / 2, cột; cột TỔNG / dòng TỔNG bỏ điều kiện tương ứng)
  const bam = (k1: string | null, k2: string | null, c: string | null, n: number) => {
    if (!n) return;
    const ds = dong.filter(h => (k1 == null || hang[0].khoa(h) === k1) && (k2 == null || !hang[1] || hang[1].khoa(h) === k2) && (c == null || cot.khoa(h) === c));
    moDsHex([ten, k1, k2 || null, c != null ? `${cot.ten}: ${nhanCot(c)}` : null].filter(Boolean).join(' · '), ds);
  };
  const O = ({ n, onClick, dam }: { n: number; onClick: () => void; dam?: boolean }) => (n
    ? <button type="button" onClick={onClick} className={`${bang.soBam} ${dam ? 'font-bold' : ''} hover:text-blue-700`}>{n}</button> : null);
  const dsCot = [...new Set(dong.map(cot.khoa))].sort(cot.so);
  const nhom = new Map<string, Map<string, Map<string, number>>>();   // cấp 1 -> cấp 2 -> cột -> n
  for (const h of dong) {
    const k1 = hang[0].khoa(h), k2 = hang[1] ? hang[1].khoa(h) : '', c = cot.khoa(h);
    const m1 = nhom.get(k1) ?? new Map(); nhom.set(k1, m1);
    const m2 = m1.get(k2) ?? new Map<string, number>(); m1.set(k2, m2);
    m2.set(c, (m2.get(c) ?? 0) + 1);
  }
  const tongCot = (c: string) => dong.filter(h => cot.khoa(h) === c).length;
  const k1s = [...nhom.keys()].sort(hang[0].so);
  if (!dong.length) return <p className="text-sm text-slate-500">Không có hạng mục nào khớp bộ lọc.</p>;
  return (
    <div className={`${bang.khung} max-h-[30rem]`}>
      <table className={`${bang.table} !w-auto min-w-full`}>
        <thead className={bang.thead}>
          <tr>
            {hang.map(h => <th key={h.ten} className={`${bang.thC} whitespace-nowrap`}>{h.ten}</th>)}
            {dsCot.map(c => <th key={c} className={`${bang.thC} whitespace-nowrap`}>{nhanCot(c)}</th>)}
            <th className={`${bang.thC} whitespace-nowrap`}>TỔNG</th>
          </tr>
        </thead>
        <tbody>
          {k1s.map(k1 => {
            const m1 = nhom.get(k1)!;
            const k2s = [...m1.keys()].sort(hang[1]?.so ?? soChu);
            return k2s.map((k2, i) => {
              const m2 = m1.get(k2)!;
              const tong = [...m2.values()].reduce((s0, n) => s0 + n, 0);
              return (
                <tr key={`${k1}|${k2}`} className="hover:bg-slate-50">
                  {i === 0 && <td rowSpan={k2s.length} className={`${bang.tdB} whitespace-nowrap align-top font-bold`}>{k1}</td>}
                  {hang[1] && <td className={`${bang.tdB} whitespace-nowrap font-semibold`}>{k2}</td>}
                  {dsCot.map(c => <td key={c} className={bang.tdSo}><O n={m2.get(c) ?? 0} onClick={() => bam(k1, k2, c, m2.get(c) ?? 0)} /></td>)}
                  <td className={`${bang.tdSo} font-bold`}><O dam n={tong} onClick={() => bam(k1, k2, null, tong)} /></td>
                </tr>
              );
            });
          })}
        </tbody>
        <tfoot className={bang.tfoot}>
          <tr>
            <td colSpan={hang.length} className={`${bang.tdB} text-center`}>TỔNG</td>
            {dsCot.map(c => <td key={c} className={bang.tdSo}><O n={tongCot(c)} onClick={() => bam(null, null, c, tongCot(c))} /></td>)}
            <td className={bang.tdSo}><O n={dong.length} onClick={() => bam(null, null, null, dong.length)} /></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};
/** Ô lọc 1 giá trị kiểu pivot Excel: "(Tất cả)" + các giá trị */
const LocPivot = ({ nhan, gt, ds, doi }: { nhan: string; gt: string; ds: string[]; doi: (v: string) => void }) => (
  <label className="inline-flex items-center gap-1.5 text-sm">
    <span className="font-semibold text-slate-600">{nhan}</span>
    <select value={gt} onChange={e => doi(e.target.value)} className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm">
      <option value="">(Tất cả)</option>
      {ds.map(v => <option key={v} value={v}>{v}</option>)}
    </select>
  </label>
);
const C_IPO: CotPivot = { ten: 'TÌNH TRẠNG IPO', khoa: h => h.ipo, so: soChu };
const C_PL: CotPivot = { ten: 'PHÂN LOẠI NHÓM SP', khoa: h => h.pl, so: soChu };
const C_BOP: CotPivot = { ten: 'BOP', khoa: h => h.bop, so: soBop };
const C_BOM: CotPivot = { ten: 'TÌNH TRẠNG BOP-M2', khoa: h => h.bom, so: soChu };
const C_NGAY: CotPivot = { ten: 'NGÀY CẦN GIAO', khoa: h => h.ngay_giao ?? '(trống)', so: soChu };
const IPO_MD = (ds: string[]) => ds.find(x => /^01\./.test(x)) ?? '';

const BopBomBot = ({ hs }: { hs: HoSo }) => {
  const hm = hs.hangMuc ?? [];
  const dsIpo = [...new Set(hm.map(h => h.ipo))].sort(soChu);
  const dsPhieu = [...new Set(hm.map(h => h.phieu))].sort(soChu);
  const dsDvt = [...new Set(hm.map(h => h.dvt))].sort(soChu);
  const [phieu, setPhieu] = useState('');
  const [ipoBop, setIpoBop] = useState(() => IPO_MD(dsIpo));   // như file: lọc 01. ĐANG SẢN XUẤT
  const [ipoBom, setIpoBom] = useState(() => IPO_MD(dsIpo));
  const [bomTheo, setBomTheo] = useState<'pl' | 'bop'>('pl');
  const [dvt, setDvt] = useState('');
  const [ipoBot, setIpoBot] = useState(() => IPO_MD(dsIpo));
  const [botChiTiet, setBotChiTiet] = useState(false);
  const b = hs.bopBomBot;
  const khongHuy = (h: HangMuc) => !/HỦY|HUỶ/.test(h.ipo.toUpperCase());
  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <p className="text-sm font-bold text-slate-800">I. BOP · Tổng quan hạng mục công trình</p>
          <span className="ml-auto flex flex-wrap gap-3">
            <LocPivot nhan="Tình trạng IPO" gt={ipoBop} ds={dsIpo} doi={setIpoBop} />
            <LocPivot nhan="Tình trạng phiếu" gt={phieu} ds={dsPhieu} doi={setPhieu} />
          </span>
        </div>
        <Pivot dong={hm.filter(h => (ipoBop ? h.ipo === ipoBop : khongHuy(h)) && (!phieu || h.phieu === phieu))} hang={[C_IPO, C_PL]} cot={C_BOP} nhanCot={v => v} ten="BOP" />
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <p className="text-sm font-bold text-slate-800">II. BOM · Tình trạng vật tư theo đơn hàng (item by item)</p>
          <span className="inline-flex overflow-hidden rounded-md border border-slate-300 text-sm" role="group" aria-label="Dòng của bảng BOM">
            {([['pl', 'Theo phân loại nhóm SP'], ['bop', 'Theo BOP']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setBomTheo(k)} aria-pressed={bomTheo === k}
                className={`px-3 py-1 font-semibold ${bomTheo === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{l}</button>
            ))}
          </span>
          <span className="ml-auto"><LocPivot nhan="Tình trạng IPO" gt={ipoBom} ds={dsIpo} doi={setIpoBom} /></span>
        </div>
        <Pivot dong={hm.filter(h => !ipoBom || h.ipo === ipoBom)} hang={[bomTheo === 'pl' ? C_PL : C_BOP]} cot={C_BOM} nhanCot={v => v} ten="BOM" />
        {b.bom.vatLieu > 0 && <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold text-blue-700">Danh mục vật liệu (sheet 03_MATERIALS)</summary><div className="mt-2"><BopM2Section tenCongTrinh={hs.thongTin.ten} /></div></details>}
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <p className="text-sm font-bold text-slate-800">III. BOT · PC đề xuất ngày giao</p>
          <label className="inline-flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" checked={botChiTiet} onChange={e => setBotChiTiet(e.target.checked)} className="h-3.5 w-3.5" />Chi tiết phân loại nhóm SP
          </label>
          <span className="ml-auto flex flex-wrap gap-3">
            <LocPivot nhan="Tình trạng IPO" gt={ipoBot} ds={dsIpo} doi={setIpoBot} />
            <LocPivot nhan="ĐVT" gt={dvt} ds={dsDvt} doi={setDvt} />
          </span>
        </div>
        <Pivot dong={hm.filter(h => (!ipoBot || h.ipo === ipoBot) && (!dvt || h.dvt === dvt))}
          hang={botChiTiet ? [C_BOP, C_PL] : [C_IPO, C_BOP]} cot={C_NGAY} nhanCot={ngayCot} ten="BOT" />
        {b.botCongDoan.length > 0 && <p className="mt-1.5 text-xs text-slate-500">BOT công đoạn: {b.botCongDoan.map(x => `${x.congDoan} ${x.soHex} HM (${ngay(x.tu)} – ${ngay(x.den)})`).join(' · ')}</p>}
      </div>
    </div>
  );
};

// 6 ---------------------------------------------------------------------------
// Biên bản họp: gom theo cuộc họp (file), mới nhất trước; mỗi ý: chủ đề / nội dung / đề xuất / người / hạn.
// Ý gắn công trình theo tên gọi nhiều công trình cùng khớp (khop bắt đầu "≈") => nhãn "có thể" để người đọc tự xét.
const LOAI_NGAN: Record<string, string> = { 'HỌP SẢN XUẤT HÀNG NGÀY': 'Họp SX', 'HỌP VẬT TƯ': 'Họp vật tư', 'KICK OFF': 'Kick off', 'BBH TKSX': 'TKSX', 'BÁM SÁT DỰ ÁN': 'Bám sát' };
/** Biên bản họp gọn (người dùng 20/11/2026): 1 cuộc họp = 1 dòng (ngày · loại · chủ đề · nút Xem), không hiện nội dung;
 *  nút Xem mở file biên bản trong app. Mặc định 5 cuộc họp, "Xem tất cả" để sổ hết. Ý gắn theo tên trùng => nhãn "có thể". */
const BienBanHop = ({ hs }: { hs: HoSo }) => {
  const ds = hs.bienBanHop;
  const [loai, setLoai] = useState('');
  const [tatCa, setTatCa] = useState(false);
  if (!ds) return <ChuaCo nguon="Drive: 002_REPORTS\08_BIÊN BẢN HỌP" can="Chưa nạp — chạy nap_bien_ban_hop.py." />;
  if (!ds.length) return <p className="text-sm text-slate-500">Chưa có biên bản họp nhắc tới {hs.ma}.</p>;
  const y = ds.filter(x => (x.noi_dung || x.chu_de) && (!loai || x.loai === loai));
  const hop: { k: string; ds: typeof y }[] = [];
  const theoK = new Map<string, typeof y>();
  y.forEach(x => { const k = `${x.ngay}|${x.ten_file}`; let g = theoK.get(k); if (!g) { g = []; theoK.set(k, g); hop.push({ k, ds: g }); } g.push(x); });
  const dsLoai = [...new Set(ds.map(x => x.loai))];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-600"><b>{hop.length}</b> cuộc họp · <b>{y.length}</b> ý</span>
        <span className="ml-auto inline-flex flex-wrap gap-1">
          {['', ...dsLoai].map(l => (
            <button key={l || 'tat-ca'} type="button" onClick={() => { setLoai(l); setTatCa(false); }} aria-pressed={loai === l}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${loai === l ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{l ? (LOAI_NGAN[l] ?? l) : 'Tất cả'}</button>
          ))}
        </span>
      </div>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {(tatCa ? hop : hop.slice(0, 5)).map(({ k, ds: g }) => {
          const dau = g[0];
          const chuDe = [...new Set(g.map(x => x.chu_de).filter(Boolean))];
          const coThe = g.find(x => x.khop?.startsWith('≈'));
          return (
            <li key={k}>
              <div className="grid grid-cols-[5.5rem_5.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 px-3 py-1.5 text-sm">
                <span className="tabular-nums font-semibold text-slate-800">{ngay(dau.ngay)}</span>
                <span className="truncate text-xs text-slate-500">{LOAI_NGAN[dau.loai] ?? dau.loai}</span>
                <span className="truncate text-xs font-semibold uppercase text-slate-600" title={chuDe.join(' · ')}>{chuDe.join(' · ') || '—'}
                  {coThe && <span className="ml-1 rounded bg-amber-100 px-1 normal-case text-amber-800" title={`Khớp theo tên "${coThe.khop!.slice(1)}" — trùng nhiều công trình`}>có thể</span>}</span>
                <button type="button" disabled={!dau.drive_id} title={dau.drive_id ? `Mở ${dau.ten_file}` : 'Chưa có file trên Drive'}
                  onClick={() => dau.drive_id && xemTrongApp({ id: dau.drive_id, ten: dau.ten_file, thuMuc: false })}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">Xem</button>
              </div>
            </li>
          );
        })}
      </ul>
      {hop.length > 5 && <button type="button" onClick={() => setTatCa(v => !v)} aria-expanded={tatCa} className="text-sm font-semibold text-blue-700 hover:underline">{tatCa ? 'Thu gọn ▲' : `Xem tất cả ${hop.length} cuộc họp ▼`}</button>}
    </div>
  );
};

// 7 ---------------------------------------------------------------------------
const RuiRo = ({ hs }: { hs: HoSo }) => {
  const dongNvl = useMemo(() => hs.ruiRo.nvl.flatMap(r => parseNvlStatus(r).filter(nvlLinePending).map(l => ({ ...l, hex: r.hex, hm: r.ten_hang_muc, bop: r.bop }))),
    [hs]) as (NvlStatusLine & { hex: string | null; hm: string | null; bop: string | null })[];
  const t = hs.thongTin;
  const conBot = soNgayToi(t.botDuAn);
  // còn lại theo hạng mục (file công trình, bỏ HỦY) — cùng nguồn với mục 1
  const hmKh = (hs.hangMuc ?? []).filter(h => !/HỦY|HUỶ/.test(h.ipo.toUpperCase()));
  const conLai = hmKh.length
    ? hmKh.reduce((s0, h) => s0 + Math.max((h.tri_gia || 0) - Math.min(Math.max(h.da_nhap || 0, 0), Math.max(h.tri_gia || 0, 0)), 0), 0)
    : Math.max(t.giaTri - t.daNhapHm, 0);
  const canhBao: string[] = [];
  if (conBot != null && conBot < 0 && conLai > 5) canhBao.push(`Quá BOT dự án ${-conBot} ngày, còn ${ty(conLai)} tỷ chưa nhập kho`);
  else if (conBot != null && conBot <= 30 && conLai > 5) canhBao.push(`Còn ${conBot} ngày tới BOT dự án, còn ${ty(conLai)} tỷ chưa nhập kho`);
  if (t.botDuAnKhnk && t.botDuAn && t.botDuAnKhnk !== t.botDuAn) canhBao.push(`BOT dự án lệch nguồn: bảng sản xuất ${ngay(t.botDuAn)} · file KHNK ${ngay(t.botDuAnKhnk)}`);
  if (dongNvl.length) canhBao.push(`${dongNvl.length} dòng vật tư chưa về đủ trên ${new Set(dongNvl.map(x => x.hex)).size} hạng mục`);
  return (
    <div className="space-y-4">
      {canhBao.length > 0 && (
        <ul className="space-y-1.5">{canhBao.map(x => <li key={x} className="flex items-start gap-2 rounded-lg border-l-4 border-l-red-500 bg-red-50 px-3 py-2 text-sm text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{x}</li>)}</ul>
      )}
      <div>
        <p className="mb-1.5 text-sm font-bold text-slate-800">Vật tư chưa về (theo tình trạng NVL của hạng mục)</p>
        {dongNvl.length ? (
          <div className={`${bang.khung} max-h-[24rem]`}>
            <table className={bang.table}>
              <thead className={bang.thead}><tr>{['HEX', 'Hạng mục', 'BOP', 'Vật tư', 'Yêu cầu', 'Đã về', 'Còn lại', 'Dự kiến giao', 'PR note'].map(h => <th key={h} className={`${bang.thC} whitespace-nowrap`}>{h}</th>)}</tr></thead>
              <tbody>{dongNvl.map((l, i) => (
                <tr key={i}><td className={bang.tdSo}>{l.hex}</td><td className={`${bang.tdB} min-w-[12rem]`}>{l.hm}</td><td className={bang.tdSo}>{l.bop}</td>
                  <td className={`${bang.tdB} min-w-[14rem]`}>{l.name}</td><td className={bang.tdSo}>{l.req ?? ''}</td><td className={bang.tdSo}>{l.got ?? ''}</td>
                  <td className={`${bang.tdSo} font-semibold text-red-600`}>{l.left ?? ''}</td><td className={bang.tdSo}>{l.due || '—'}</td>
                  <td className={`${bang.tdB} min-w-[12rem] text-sm`}>{l.note}</td></tr>))}</tbody>
            </table>
          </div>
        ) : <p className="text-sm text-slate-500">Không có vật tư chưa về.</p>}
      </div>
      <div>
        <p className="mb-1.5 text-sm font-bold text-slate-800">Vướng mắc 6M</p>
        {hs.ruiRo.vuongMac.length ? (
          <table className={`${bang.table} !w-auto`}>
            <thead className={bang.thead}><tr>{['Ngày', 'HEX', 'Nhóm', 'Nội dung', 'Trạng thái', 'Người xử lý', 'BOT'].map(h => <th key={h} className={bang.thC}>{h}</th>)}</tr></thead>
            <tbody>{hs.ruiRo.vuongMac.map(v => (
              <tr key={String(v.id)} className={v.is_resolved ? 'text-slate-400' : ''}><td className={bang.tdSo}>{ngay(v.ngay as string)}</td><td className={bang.tdSo}>{String(v.hex ?? '')}</td>
                <td className={bang.tdSo}>{String(v.category ?? '')}</td><td className={`${bang.tdB} min-w-[16rem]`}>{String(v.content ?? '')}</td>
                <td className={bang.tdSo}>{String(v.status ?? '')}</td><td className={bang.tdB}>{String(v.handler ?? '')}</td><td className={bang.tdSo}>{String(v.bot ?? '')}</td></tr>))}</tbody>
          </table>
        ) : <p className="text-sm text-slate-500">Chưa có vướng mắc.</p>}
      </div>
    </div>
  );
};
