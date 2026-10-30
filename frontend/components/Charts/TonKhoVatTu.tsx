import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ChevronDown, ChevronUp, ChevronsUpDown, Download, FileSpreadsheet, FileText, Info, Loader2, RefreshCw, Search, Shield, X,
} from 'lucide-react';
import {
  Area, Bar, CartesianGrid, ComposedChart, LabelList, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ModalShell } from '../shared/ModalShell';
import { useAuth } from '../../context/AuthContext';
import { LocTenVatTu } from './tonKhoVatTu/LocTenVatTu';
import type { LocTen } from './tonKhoVatTu/locTenExcel';
import {
  layChiTietTonKhoVt, layDoanhThuKeHoach, layTongHopTonKhoVt, laLoiChuaCoQuyen, LoiTonKhoVt, type ChiTietTonKhoVt, type TongHopTonKhoVt,
} from '../../services/tonKhoVtApi';
import {
  bangChiTietExcel, bangDocExcel, bangTongHopExcel, boDau, chonNhanTruc, demTheoLoc, dinhDangChenh, dinhDangChiSo,
  dinhDangPt, dinhDangSo, dinhDangSoLuong, dinhDangTienDong, dsNgayChot, dungChuoi, khoangTheoLuaChon, locDong,
  NHAN_LOC, ngayThieuCham, nhanNgay, nhanNgayNgan, nhanThang, phanLoaiDong, tachCongTrinh, tenFileAnToan, tenNhomGon, tongCacNhom,
  congThangKhoa, duBaoTonTheoDoanhThu, diemTieuBieu, SO_THANG_DU_BAO_TOI_DA, catDuBao, namCuaKhoang, TY_LE_ANH_TON, vachTrucY, xepDong, XEP_MAC_DINH, chiSoNhan, tomTatNhom, trungBinhTong, xuHuongTong,
  type CachXep, type ChiSo, type ChuoiNhom, type CotXep, type DiemChuoi, type DongDaPhanLoai, type KhoangXem, type LocDong,
  type MocXem, type O, type DoanhThuKeHoach, type DiemDuBao, type DuBaoTon,
} from './tonKhoVatTu/xuLy';
import { DOANH_SO_CAN_DAT } from './tonKhoVatTu/doanhSoCanDat';

// ============================================================================
// TRANG "7. TỒN KHO VẬT TƯ" (bảng ton_kho_vt — chốt hằng tuần, thứ Năm)
// 6 biểu đồ đường (1 biểu đồ / dòng), mỗi nhóm kho vật tư (KVT) 1 biểu đồ: tổng tồn (màu nhóm) + chậm luân chuyển
// > 3 tháng (xám, nét đứt), trục từ 0, số ghi tại điểm, câu tóm tắt tự tính; mặc định theo tháng (lần chốt cuối tháng),
// đổi được sang từng lần chốt (tuần). Tồn kho là ảnh chụp => KHÔNG cộng các lần chốt.
// Bấm 1 điểm => cửa sổ từng mã của nhóm tại lần chốt đó, so với điểm liền trước trên biểu đồ (tuần: lần chốt trước;
// tháng: lần chốt cuối tháng trước) — đúng mức chênh tooltip đang hiện (tăng / giảm / mới / đã hết).
// Mỗi thẻ có bộ lọc tên vật tư riêng, làm đúng như bộ lọc cột của Excel (tonKhoVatTu/locTenExcel.ts): lọc thẻ nào chỉ thẻ đó đổi (câu tóm tắt, trung bình, xu hướng, từng
// mã, phần của nhóm trong báo cáo xuất); 4 số tổng đầu trang luôn tính cho toàn kho.
// Xem theo tháng: dưới mỗi biểu đồ tồn là biểu đồ DOANH THU từng tháng (= DOANH SỐ CẦN ĐẠT người dùng đưa, cả công ty —
// tonKhoVatTu/doanhSoCanDat.ts), và biểu đồ tồn kéo dài sang các tháng tới: DỰ BÁO tồn theo kế hoạch doanh thu (xuLy
// duBaoTonTheoDoanhThu, nét đứt + dải sai số kiểm lại). Người dùng yêu cầu 28/10: thấy tồn + doanh thu từng tháng và dự đoán
// tồn tương lai theo kế hoạch doanh thu.
// Số liệu: GET /api/ton-kho-vt/tong-hop (POST khi lọc tên), /api/ton-kho-vt/chi-tiet, /api/ton-kho-vt/ten-vat-tu
// (quyền chart_stock_vt). Tiền là triệu đồng, hiện tỷ.
// ============================================================================

/** Màu từng nhóm (đường "tổng tồn"); đã kiểm tách bạch với màu xám "chậm luân chuyển" kể cả người mù màu */
const MAU_NHOM: Record<string, string> = {
  'KVT Phụ kiện': '#2a78d6',
  'KVT Vải Da Mouss': '#d55181',
  'KVT Tấm – Ván': '#199e70',
  'KVT Đá': '#6250d6',
  'KVT Gỗ': '#eb6834',
  'KVT Kim Loại': '#c98500',
};
const MAU_DU_PHONG = ['#0e7490', '#be123c', '#4d7c0f', '#7c3aed'];
const MAU_CHAM = '#94a3b8';
/** Tồn tăng = vốn đọng thêm (cam); tồn giảm (xanh) */
const MAU_TANG = '#b45309';
const MAU_GIAM = '#047857';
const MAU_TRANG = '#0d9488';
/** Tháng hiện tại theo giờ Việt Nam ('YYYY-MM'): tháng chưa hết => doanh thu tháng này là tạm tính, dùng dự kiến */
const thangHienTaiVn = (): string => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${p.find(x => x.type === 'year')?.value}-${p.find(x => x.type === 'month')?.value}`;
};

/**
 * Chụp biểu đồ của 1 nhóm (SVG recharts đang hiện trên trang) thành ảnh PNG cho báo cáo PDF: chép SVG, thêm nền
 * trắng + phông Arial (ảnh SVG dựng ngoài trang không có phông của trang), vẽ lên canvas gấp 2 cho nét.
 */
async function chupBieuDo(nhom: string, boChon = '[data-tkvt-ton] .recharts-wrapper svg'): Promise<string | undefined> {
  const the = [...document.querySelectorAll<HTMLElement>('section[data-tkvt-nhom]')].find(x => x.dataset.tkvtNhom === nhom);
  return chupSvg(the?.querySelector<SVGSVGElement>(boChon) ?? null);
}

/** SVG recharts => ảnh PNG (dùng cho biểu đồ từng nhóm và biểu đồ doanh số chung đầu trang) */
async function chupSvg(svg: SVGSVGElement | null): Promise<string | undefined> {
  if (!svg) return undefined;
  const { width, height } = svg.getBoundingClientRect();
  if (!width || !height) return undefined;
  const ban = svg.cloneNode(true) as SVGSVGElement;
  ban.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  ban.setAttribute('width', String(width));
  ban.setAttribute('height', String(height));
  ban.setAttribute('font-family', 'Arial, Helvetica, sans-serif');
  const nen = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  nen.setAttribute('width', '100%');
  nen.setAttribute('height', '100%');
  nen.setAttribute('fill', '#ffffff');
  ban.insertBefore(nen, ban.firstChild);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(ban)], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((xong, loi) => { img.onload = () => xong(); img.onerror = () => loi(new Error('Không vẽ được ảnh biểu đồ')); img.src = url; });
    const heSo = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * heSo);
    canvas.height = Math.round(height * heSo);
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.scale(heSo, heSo);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Tra màu theo tên đã bỏ dấu / gạch nối (phòng 'Tấm - Ván' gạch ngắn); nhóm lạ lấy màu dự phòng theo tên (ổn định)
const khoaMau = (s: string) => boDau(s).replace(/[‐-―-]/g, '-').replace(/\s+/g, ' ').trim();
const MAU_THEO_KHOA = new Map(Object.entries(MAU_NHOM).map(([k, v]) => [khoaMau(k), v]));
const mauNhom = (nhom: string): string => {
  const m = MAU_THEO_KHOA.get(khoaMau(nhom));
  if (m) return m;
  let h = 0;
  for (const c of nhom) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return MAU_DU_PHONG[h % MAU_DU_PHONG.length];
};

const nhanSoVoi = (d: DiemChuoi, moc: MocXem) => (moc === 'tuan' ? nhanNgayNgan(d.ngayChot) : d.nhan);

const dinhDangCapNhat = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
};

// ---------------------------------------------------------------------------
// Xuất Excel (SheetJS tải động — không kéo 'xlsx' vào gói chính)
// ---------------------------------------------------------------------------
interface SheetExcel {
  ten: string;
  /** null = ô trống (không ghi ô) */
  dong: Array<Array<O | null>>;
  /** Chỉ số dòng tiêu đề cột (mặc định 0) — định dạng số theo chữ trong tiêu đề cột ('(tỷ)', '%…') */
  hangTieuDe?: number;
  /** Ô công thức (ghi kèm giá trị đã tính để mở ra là có số) */
  congThuc?: Array<{ r: number; c: number; f: string; v: number }>;
  /** Độ rộng cột đặt sẵn (ký tự); bỏ trống = tự tính theo nội dung */
  rongCot?: number[];
}

/** Tải file Excel; `xuLyGoi` = sửa gói .xlsx trước khi tải (chèn biểu đồ — SheetJS bản cộng đồng không ghi biểu đồ) */
async function taiExcel(tenFile: string, sheets: SheetExcel[], xuLyGoi?: (goi: ArrayBuffer) => Promise<Uint8Array>): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.dong);
    for (const ct of s.congThuc ?? []) ws[XLSX.utils.encode_cell({ r: ct.r, c: ct.c })] = { t: 'n', v: ct.v, f: ct.f };
    const hangTd = s.hangTieuDe ?? 0;
    const dau = s.dong[hangTd] ?? [];
    s.dong.forEach((hang, r) => {
      if (r <= hangTd) return;
      hang.forEach((o, c) => {
        if (typeof o !== 'number') return;
        const oExcel = ws[XLSX.utils.encode_cell({ r, c })];
        if (!oExcel || oExcel.t !== 'n') return;
        const tieuDe = String(dau[c] ?? '');
        oExcel.z = tieuDe.includes('(tỷ)') ? '#,##0.00' : tieuDe.includes('(triệu)') ? '#,##0.0'
          : tieuDe.startsWith('%') ? '0.0' : tieuDe.includes('(mã)') ? '#,##0' : Number.isInteger(o) ? '#,##0' : '#,##0.##';
      });
    });
    ws['!cols'] = s.rongCot ? s.rongCot.map(wch => ({ wch })) : dau.map((_, c) => {
      let max = 8;
      for (const hang of s.dong.slice(hangTd)) max = Math.max(max, String(hang[c] ?? '').length);
      return { wch: Math.min(50, max + 1) };
    });
    XLSX.utils.book_append_sheet(wb, ws, s.ten);
  }
  if (!xuLyGoi) {
    XLSX.writeFile(wb, tenFile);
    return;
  }
  const goi = await xuLyGoi(XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true }) as ArrayBuffer);
  const url = URL.createObjectURL(new Blob([goi as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = tenFile;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

// ---------------------------------------------------------------------------
// Thành phần nhỏ
// ---------------------------------------------------------------------------
function PhanDoan<T extends string>({ nhan, giaTri, chon, onChon, tat }: {
  nhan: string; giaTri: T; chon: Array<[T, string]>; onChon: (v: T) => void; tat?: boolean;
}) {
  return (
    <div className="flex rounded-lg bg-slate-100 p-1" role="group" aria-label={nhan}>
      {chon.map(([k, l]) => (
        <button key={k} type="button" disabled={tat} onClick={() => onChon(k)} aria-pressed={giaTri === k}
          className={`whitespace-nowrap rounded-md px-3 py-1 text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${giaTri === k ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** ▲ +1.23 tỷ (+0.9%) — tăng chữ cam, giảm chữ xanh */
function ChuChenh({ v, pt, chiSo, coPt = true }: { v: number | null; pt: number | null; chiSo: ChiSo; coPt?: boolean }) {
  if (v === null) return <span className="text-slate-400">—</span>;
  if (Math.abs(v) < 1e-9) return <span className="font-medium text-slate-500">Không đổi</span>;
  const tang = v > 0;
  return (
    <span className="font-medium tabular-nums" style={{ color: tang ? MAU_TANG : MAU_GIAM }}>
      {tang ? '▲' : '▼'} {dinhDangChenh(v, chiSo)}
      {coPt && pt !== null && <span className="font-normal opacity-80"> ({dinhDangPt(pt, true)})</span>}
    </span>
  );
}

function OSo({ nhan, giaTri, phu, mauSo }: { nhan: string; giaTri: React.ReactNode; phu?: React.ReactNode; mauSo?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="kpi-label">{nhan}</p>
      <p className="kpi-value mt-1 truncate" style={mauSo ? { color: mauSo } : undefined}>{giaTri}</p>
      {phu && <p className="mt-0.5 text-xs text-slate-500">{phu}</p>}
    </div>
  );
}

function HangTooltip({ mau, nhan, giaTri, dam }: { mau?: string; nhan: string; giaTri: React.ReactNode; dam?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="inline-flex items-center gap-1.5 text-slate-600">
        {mau && <span className="h-2 w-2 rounded-sm" style={{ background: mau }} aria-hidden />}
        {nhan}
      </span>
      <span className={`tabular-nums ${dam ? 'font-semibold text-slate-900' : 'text-slate-800'}`}>{giaTri}</span>
    </div>
  );
}

function TooltipDiem({ diem, truoc, nhom, mau, chiSo, moc, tb }: {
  diem: DiemChuoi; truoc: DiemChuoi | null; nhom: string; mau: string; chiSo: ChiSo; moc: MocXem; tb: number | null;
}) {
  const pt = diem.tong > 0 && !diem.thieuCham ? (diem.cham / diem.tong) * 100 : null;
  const soTb = tb !== null && tb > 0 ? ((diem.tong - tb) / tb) * 100 : null;
  return (
    <div className="min-w-[230px] rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-lg">
      <p className="font-semibold text-slate-900">{nhom}</p>
      <p className="text-slate-500">{moc === 'tuan' ? `Chốt ${nhanNgay(diem.ngayChot)}` : `${diem.nhan} · chốt ${nhanNgay(diem.ngayChot)}`}</p>
      <div className="mt-2 space-y-1">
        <HangTooltip mau={mau} nhan="Tổng tồn" giaTri={dinhDangChiSo(diem.tong, chiSo)} dam />
        <HangTooltip mau={MAU_CHAM} nhan="Chậm LC > 3 tháng"
          giaTri={diem.thieuCham ? 'không có số' : `${dinhDangChiSo(diem.cham, chiSo)} (${dinhDangPt(pt)})`} />
        <HangTooltip nhan={truoc ? `So với ${nhanSoVoi(truoc, moc)}` : 'So với lần trước'}
          giaTri={<ChuChenh v={diem.chenh} pt={diem.chenhPt} chiSo={chiSo} />} />
        {tb !== null && (
          <HangTooltip nhan={`So với trung bình (${dinhDangChiSo(tb, chiSo)})`}
            giaTri={soTb === null || Math.abs(soTb) < 0.5 ? 'ngang trung bình' : `${soTb > 0 ? 'cao hơn' : 'thấp hơn'} ${dinhDangPt(Math.abs(soTb))}`} />
        )}
      </div>
      <p className="mt-2 border-t border-slate-100 pt-1.5 text-slate-500">
        {chiSo === 'giaTri'
          ? `${dinhDangSo(diem.goc.soMa)} mã${diem.thieuCham ? '' : ` · ${dinhDangSo(diem.goc.soMaCham)} mã chậm luân chuyển`}`
          : `${dinhDangSo(diem.goc.giaTri / 1000, 2)} tỷ${diem.thieuCham ? '' : ` · ${dinhDangSo(diem.goc.giaTriCham / 1000, 2)} tỷ chậm luân chuyển`}`}
      </p>
      {diem.thieuCham && (
        <p className="mt-1 text-[0.6875rem] text-amber-700">File chốt ngày này không có cột chậm luân chuyển</p>
      )}
      <p className="mt-1 text-[0.6875rem] text-slate-400">Bấm điểm để xem từng mã</p>
    </div>
  );
}

/** Số liệu 1 nhóm theo bộ lọc tên của thẻ (tải riêng khi áp dụng bộ lọc) */
type KetQuaLoc =
  | { trangThai: 'dang_tai' }
  | { trangThai: 'loi'; thongBao: string }
  | { trangThai: 'xong'; duLieu: TongHopTonKhoVt };

/** "A, B, C … và 12 tên khác" */
const nhanDsTen = (ten: string[], toiDa = 6) =>
  ten.slice(0, toiDa).join(', ') + (ten.length > toiDa ? ` … và ${dinhDangSo(ten.length - toiDa)} tên khác` : '');

/** Điểm vẽ: chamVe = null ở lần chốt thiếu cờ chậm luân chuyển => đường xám đứt quãng ở đó thay vì rơi về 0 */
type DiemVe = DiemChuoi & { chamVe: number | null; xuHuong: number | null };

/** Dòng dữ liệu biểu đồ tồn: điểm thật (DiemVe) hoặc tháng dự báo (laDuBao); duBao / dai = đường dự báo + dải sai số */
type DongVe = Partial<DiemVe> & {
  khoa: string; laDuBao?: boolean; duBao?: number; dai?: [number, number] | null; diemDuBao?: DiemDuBao;
};

function TooltipDuBao({ d, nhom, mau }: { d: DiemDuBao; nhom: string; mau: string }) {
  return (
    <div className="min-w-[240px] rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-lg">
      <p className="font-semibold text-slate-900">{nhom}</p>
      <p className="text-slate-500">{d.nhan} · dự báo theo kế hoạch doanh thu</p>
      <div className="mt-2 space-y-1">
        <HangTooltip mau={mau} nhan="Tồn dự báo" giaTri={`${dinhDangSo(d.ton / 1000, 2)} tỷ`} dam />
        {d.thap !== null && d.cao !== null && (
          <HangTooltip nhan="Khoảng thường gặp" giaTri={`${dinhDangSo(d.thap / 1000, 2)} – ${dinhDangSo(d.cao / 1000, 2)} tỷ`} />
        )}
        <HangTooltip nhan="Doanh số cần đạt tháng" giaTri={`${dinhDangSo(d.keHoach, 2)} tỷ`} />
      </div>
    </div>
  );
}

const MAU_DT = '#94a3b8';

/**
 * Doanh số cần đạt (kế hoạch, cột) và doanh thu thực tế (đường) từng tháng của cả công ty — 1 biểu đồ ở đầu trang
 * (không lặp dưới từng nhóm: số này của cả công ty, giống nhau ở mọi nhóm). Tháng sau tháng hiện tại = cột viền.
 */
function BieuDoDoanhSo({ dt, tuThang, denThang, thangHienTai }: { dt: DoanhThuKeHoach; tuThang: string; denThang: string; thangHienTai: string }) {
  const cot = useMemo(() => {
    const ds: { khoa: string; kh: number | null; khToi: number | null; tt: number | null; nhanKh: number | null }[] = [];
    for (let k = tuThang; k <= denThang; k = congThangKhoa(k, 1)) {
      const kh = dt.keHoach[k] ?? null, toi = k > thangHienTai;
      ds.push({ khoa: k, kh: toi ? null : kh, khToi: toi ? kh : null, tt: toi ? null : dt.thucTe[k] ?? null, nhanKh: kh });
      if (ds.length > 40) break;
    }
    return ds;
  }, [dt, tuThang, denThang, thangHienTai]);
  if (!cot.some(c => c.nhanKh !== null)) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:px-5" aria-label="Doanh số cần đạt và doanh thu thực tế từng tháng" data-tkvt-doanhso>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="text-sm font-semibold text-slate-800">Doanh số cần đạt & thực tế từng tháng (cả công ty, tỷ)</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5" style={{ background: MAU_DT }} aria-hidden />cần đạt</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 border border-dashed border-slate-500 bg-white" aria-hidden />cần đạt (tháng tới)</span>
        <span className="inline-flex items-center gap-1"><span className="h-[3px] w-4 rounded-full bg-slate-800" aria-hidden />thực tế (nhập kho thành phẩm)</span>
        <span className="text-slate-400">· là cơ sở dự báo tồn của từng nhóm bên dưới</span>
      </div>
      <div className="mt-2 h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={cot} margin={{ top: 16, right: 16, left: 0, bottom: 2 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke="#eef2f6" />
            <XAxis dataKey="khoa" tickFormatter={(k: string) => nhanThang(k)} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }} interval="preserveStartEnd" minTickGap={8} />
            <YAxis width={40} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <Tooltip cursor={{ fill: '#f1f5f9' }} isAnimationActive={false} wrapperStyle={{ outline: 'none', zIndex: 30 }}
              content={p => {
                const c = p.payload?.[0]?.payload as (typeof cot)[number] | undefined;
                if (!p.active || !c) return null;
                return (
                  <div className="min-w-[200px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                    <p className="font-semibold text-slate-900">{nhanThang(c.khoa)}</p>
                    <div className="mt-1.5 space-y-1">
                      <HangTooltip mau={MAU_DT} nhan="Doanh số cần đạt" giaTri={c.nhanKh === null ? '—' : `${dinhDangSo(c.nhanKh, 2)} tỷ`} dam />
                      {c.tt !== null && <HangTooltip mau="#1e293b" nhan="Thực tế" giaTri={`${dinhDangSo(c.tt, 2)} tỷ`} />}
                      {c.tt !== null && c.nhanKh ? <HangTooltip nhan="Đạt" giaTri={`${Math.round((c.tt / c.nhanKh) * 100)}%`} /> : null}
                    </div>
                  </div>
                );
              }} />
            <Bar dataKey="kh" stackId="kh" fill={MAU_DT} fillOpacity={0.55} isAnimationActive={false} />
            <Bar dataKey="khToi" stackId="kh" fill="#ffffff" stroke="#64748b" strokeDasharray="3 2" isAnimationActive={false}>
              <LabelList dataKey="nhanKh" content={(q: object) => {
                const { x, y, width, index } = q as { x?: number; y?: number; width?: number; index?: number };
                const v = index === undefined ? null : cot[index]?.nhanKh;
                if (v == null) return null;
                return <text x={Number(x) + Number(width) / 2} y={Number(y) - 4} textAnchor="middle" fontSize={10} fill="#475569"
                  style={{ fontVariantNumeric: 'tabular-nums' }}>{dinhDangSo(v, 0)}</text>;
              }} />
            </Bar>
            <Line type="linear" dataKey="tt" stroke="#1e293b" strokeWidth={2} dot={{ r: 2.5, fill: '#1e293b' }} isAnimationActive={false} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/** Dòng nói dự báo: số từng tháng, cách tính, độ sai khi kiểm lại (so với "giữ nguyên tồn") */
function CauDuBao({ duBao, ten }: { duBao: DuBaoTon; ten?: string }) {
  if (!duBao.diem.length) return null;
  const s1 = duBao.saiSo[0], g1 = duBao.saiSoGiuNguyen[0];
  return (
    <div className="text-xs text-slate-600">
      <p>
        <span className="font-medium text-slate-800">{ten ? `${ten} — d` : 'D'}ự báo tồn theo kế hoạch doanh thu:</span>{' '}
        {diemTieuBieu(duBao).map((d, i) => (
          <span key={d.khoa} className="tabular-nums">
            {i > 0 && ' · '}<span className="font-semibold text-slate-900">{d.nhan} ≈ {dinhDangSo(d.ton / 1000, 2)} tỷ</span>
            {d.cao !== null && <> (±{dinhDangSo((d.cao - d.ton) / 1000, 1)})</>}
          </span>
        ))}
      </p>
      <p className="text-[0.6875rem] text-slate-500">
        Dựa trên doanh số cần đạt (cả công ty):{' '}
        {duBao.diem.map((d, i) => (
          <span key={d.khoa} className="tabular-nums">{i > 0 && ' · '}{d.nhan} {dinhDangSo(d.keHoach, 0)} tỷ</span>
        ))}
        {' '}— đạt ~{Math.round(duBao.tyLeDat * 100)}% kế hoạch như 3 tháng {nhanThang(duBao.tyLeTu)}–{nhanThang(duBao.tyLeDen)}.
      </p>
      <p className="text-[0.6875rem] text-slate-400">
        Tồn đổi bằng ½ mức đổi của doanh thu bình quân 3 tháng (doanh thu = doanh số cần đạt từng tháng).
        {s1 !== null && g1 !== null && <> Kiểm lại {duBao.soLanKiem[0]} tháng đã qua: sai trung bình ±{dinhDangSo(s1 / 1000, 1)} tỷ trước 1 tháng
          (giữ nguyên tồn: ±{dinhDangSo(g1 / 1000, 1)} tỷ).</>}
        {duBao.saiSo[1] !== undefined && duBao.saiSo[1] !== null && duBao.saiSoGiuNguyen[1] !== null && (
          <> Trước 2 tháng: ±{dinhDangSo(duBao.saiSo[1] / 1000, 1)} tỷ (giữ nguyên: ±{dinhDangSo(duBao.saiSoGiuNguyen[1]! / 1000, 1)}).</>
        )}
      </p>
    </div>
  );
}

/** Số ghi tại điểm (recharts LabelList content): chỉ ở các điểm trong `hien`; `duoi` = ghi dưới điểm (đường chậm LC) */
function NhanSo({ x, y, value, index, hien, duoi, chiSo, dam, soLe = 1 }: {
  x?: number | string; y?: number | string; value?: number | string | null; index?: number;
  hien: Set<number>; duoi?: boolean; chiSo: ChiSo; dam?: boolean; soLe?: number;
}) {
  if (value === null || value === undefined || index === undefined || !hien.has(index)) return null;
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  return (
    <text x={Number(x)} y={Number(y) + (duoi ? 15 : -9)} textAnchor="middle" fontSize={11}
      fill={dam ? '#0f172a' : '#64748b'} fontWeight={dam ? 600 : 400} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {chiSo === 'giaTri' ? dinhDangSo(v / 1000, soLe) : dinhDangSo(v, 0)}
    </text>
  );
}

// ---------------------------------------------------------------------------
// Thẻ 1 nhóm vật tư — biểu đồ ĐƯỜNG (người dùng chọn mẫu B): tổng tồn (màu nhóm) + chậm luân chuyển (xám, nét đứt)
// + đường trung bình (chấm, màu nhóm) + đường xu hướng (gạch dài, cam tăng / xanh giảm); trục Y từ 0, số ghi tại điểm,
// câu tóm tắt tự tính ở đầu thẻ
// ---------------------------------------------------------------------------
function TheNhom({ chuoi, chiSo, moc, onChon, xuat, loc, ketQuaLoc, onLoc, phienBan, khoaLoc, doanhThu, duBao, tuThang }: {
  chuoi: ChuoiNhom; chiSo: ChiSo; moc: MocXem;
  /** Đang xem 1 năm: chỉ vẽ các tháng từ đây (năm tới chưa có tồn: bỏ lần chốt mới nhất dùng làm điểm nối) */
  tuThang?: string | null;
  /** Doanh thu thực tế + kế hoạch theo tháng (cả công ty, tỷ); undefined = chưa tải / lỗi */
  doanhThu?: DoanhThuKeHoach;
  /** Dự báo tồn của nhóm theo kế hoạch doanh thu (tính trên chuỗi tháng đủ, giá trị) */
  duBao?: DuBaoTon | null;
  /** Tháng hiện tại ('YYYY-MM', giờ VN) */
  thangHienTai: string;
  /** Phiên bản bảng (đổi => bộ lọc tải lại danh sách tên) */
  phienBan: string;
  /** Khoá nút lọc (đang xuất báo cáo) */
  khoaLoc?: boolean;
  /** Bộ lọc tên của thẻ này (null = cả nhóm); `chuoi` đã là số theo bộ lọc khi ketQuaLoc 'xong' */
  loc: LocTen | null;
  ketQuaLoc?: KetQuaLoc;
  onLoc: (loc: LocTen | null) => void;
  /** Đang chụp cho báo cáo PDF: biểu đồ tạm theo tỷ lệ 2,7:1 (cao hơn) để ảnh lấp kín 1 trang ngang */
  xuat?: boolean;
  /** truoc = điểm liền trước trong dãy (null ở điểm đầu): cửa sổ chi tiết so với đúng điểm này như tooltip */
  onChon: (nhom: string, d: DiemChuoi, truoc: DiemChuoi | null) => void;
}) {
  const ds = chuoi.diem;
  const mau = mauNhom(chuoi.nhom);
  const cuoi = ds.length ? ds[ds.length - 1] : null;
  // Kích thước lúc chụp PDF: rộng như đang hiện, cao theo tỷ lệ 2,7:1 (ảnh lấp kín 1 trang ngang A4)
  const khungRef = useRef<HTMLDivElement>(null);
  const rongXuat = xuat ? Math.max(600, Math.round(khungRef.current?.clientWidth ?? 1000)) : 0;
  const caoXuat = Math.round(rongXuat / TY_LE_ANH_TON);
  // Đường xu hướng tăng / giảm (hồi quy tuyến tính tổng tồn, ≥ 3 điểm): cam = tăng (vốn đọng thêm), xanh = giảm
  const xh = useMemo(() => xuHuongTong(ds), [ds]);
  const mauXh = xh?.huong === 'tang' ? MAU_TANG : xh?.huong === 'giam' ? MAU_GIAM : '#64748b';
  const duLieuVe = useMemo<DiemVe[]>(
    () => ds.map((d, i) => ({ ...d, chamVe: d.thieuCham ? null : d.cham, xuHuong: xh ? xh.giaTri[i] : null })), [ds, xh]);
  // Dự báo: chỉ khi xem theo THÁNG + GIÁ TRỊ và điểm cuối là tháng có tồn mới nhất (dự báo nối tiếp đúng điểm đó)
  const coDuBao = moc === 'thang' && chiSo === 'giaTri' && !!duBao && duBao.diem.length > 0 && !!cuoi
    && congThangKhoa(cuoi.khoa, 1) === duBao.diem[0].khoa;
  const duLieuBieuDo = useMemo<DongVe[]>(() => {
    if (!coDuBao || !duBao) return duLieuVe;
    const n = duLieuVe.length;
    return [
      ...duLieuVe.map((d, i) => (i === n - 1 ? { ...d, duBao: d.tong, dai: [d.tong, d.tong] as [number, number] } : d)),
      ...duBao.diem.map(p => ({
        khoa: p.khoa, nhan: p.nhan, laDuBao: true, duBao: p.ton, diemDuBao: p,
        dai: p.thap !== null && p.cao !== null ? [p.thap, p.cao] as [number, number] : null,
      })),
    ];
  }, [coDuBao, duBao, duLieuVe]);
  // Xem 1 năm: chỉ các tháng của năm đó (dữ liệu vẽ + dự báo ghi chữ)
  const duLieuHien = useMemo(() => (tuThang ? duLieuBieuDo.filter(d => d.khoa >= tuThang) : duLieuBieuDo), [duLieuBieuDo, tuThang]);
  const duBaoHien = useMemo(() => catDuBao(duBao ?? null, null, tuThang ?? null), [duBao, tuThang]);
  // Số ghi trên đường dự báo: chỉ các tháng tiêu biểu (theo khoá tháng)
  const hienDuBao = new Set(coDuBao && duBaoHien ? diemTieuBieu(duBaoHien).map(p => p.khoa) : []);
  const maxDuBao = coDuBao && duBao ? Math.max(...duBao.diem.map(p => p.cao ?? p.ton)) : 0;
  const max = Math.max(ds.reduce((m, d) => Math.max(m, d.tong), 0), ...(xh ? xh.giaTri : [0]), maxDuBao);
  const { vach, soLe } = useMemo(() => vachTrucY(max, chiSo === 'giaTri' ? 'ty' : 'so'), [max, chiSo]);
  const dsKhoa = useMemo(() => duLieuHien.map(d => d.khoa), [duLieuHien]);
  const nhanTruc = useMemo(() => chonNhanTruc(dsKhoa, 14), [dsKhoa]);
  const hienTong = useMemo(() => chiSoNhan(ds.map(d => d.tong)), [ds]);
  const hienCham = useMemo(() => chiSoNhan(duLieuVe.map(d => d.chamVe)), [duLieuVe]);
  // Lần chốt thiếu cờ chậm luân chuyển (03/09/2026): đường xám nối qua (khỏi trông như lỗi đứt khúc) + chấm rỗng
  // "thiếu số" ở mức giữa 2 điểm kề — chỉ để đánh dấu chỗ thiếu, không phải số thật
  const chamThieu = useMemo(() => duLieuVe.flatMap((d, i) => {
    if (!d.thieuCham) return [];
    let t = i - 1, s2 = i + 1;
    while (t >= 0 && duLieuVe[t].chamVe === null) t--;
    while (s2 < duLieuVe.length && duLieuVe[s2].chamVe === null) s2++;
    const a = t >= 0 ? duLieuVe[t].chamVe : null, b = s2 < duLieuVe.length ? duLieuVe[s2].chamVe : null;
    const y = a !== null && b !== null ? (a + b) / 2 : a ?? b;
    return y === null ? [] : [{ khoa: d.khoa, y }];
  }), [duLieuVe]);
  const theoKhoa = useMemo(() => new Map(ds.map((d, i) => [d.khoa, i])), [ds]);
  const tomTat = useMemo(() => tomTatNhom(ds, chiSo), [ds, chiSo]);
  // Nhóm nhỏ (dưới 2 tỷ, vd Kim Loại 0,52 tỷ): 1 số lẻ làm 0,52 thành 0,5 => ghi 2 số lẻ
  const soLeNhan = max < 2000 ? 2 : 1;
  const coCham = ds.some(d => !d.thieuCham && d.cham > 0);
  // Đường trung bình tổng tồn của các điểm đang xem (vẽ khi có ≥ 2 điểm)
  const tb = useMemo(() => (ds.length > 1 ? trungBinhTong(ds) : null), [ds]);
  const nhanTb = tb === null ? '' : `TB ${chiSo === 'giaTri' ? dinhDangSo(tb / 1000, soLeNhan) : dinhDangSo(tb, 0)}`;
  // Lề phải chừa chỗ nhãn "TB …"; biểu đồ số ngày doanh thu bên dưới dùng cùng lề để thẳng cột tháng
  const lePhai = tb === null ? 24 : 58;
  const chon = (d: DiemChuoi) => {
    const i = theoKhoa.get(d.khoa) ?? 0;
    onChon(chuoi.nhom, d, i > 0 ? ds[i - 1] : null);
  };
  const bamDiem = (s: { activePayload?: Array<{ payload?: unknown }> } | null) => {
    const p = s?.activePayload?.[0]?.payload as DongVe | undefined;
    if (p && !p.laDuBao) chon(p as DiemChuoi);
  };

  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4 sm:px-5" aria-label={`Tồn kho ${chuoi.nhom}`}
      data-tkvt-nhom={chuoi.nhom}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800" title={chuoi.nhom}>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: mau }} aria-hidden />
          {tenNhomGon(chuoi.nhom)}
        </h2>
        <div className="flex items-center gap-3">
          {cuoi && (
            <button type="button" onClick={() => chon(cuoi)}
              className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline">
              Xem từng mã ({nhanSoVoi(cuoi, moc)}) ›
            </button>
          )}
          <LocTenVatTu nhom={chuoi.nhom} phienBan={phienBan} loc={loc} onApDung={onLoc} tat={khoaLoc} />
        </div>
      </div>
      {loc && (
        <p className="mt-1 text-xs text-slate-500">
          {ketQuaLoc?.trangThai === 'dang_tai' ? (
            <span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Đang tính theo bộ lọc ({loc.moTa})…</span>
          ) : ketQuaLoc?.trangThai === 'loi' ? (
            <span className="inline-flex flex-wrap items-center gap-x-2 text-red-700">
              <AlertTriangle size={12} /> Không tải được số theo bộ lọc ({ketQuaLoc.thongBao}) — đang hiện cả nhóm.
              <button type="button" onClick={() => onLoc(loc)} className="font-medium underline underline-offset-2">Thử lại</button>
            </span>
          ) : (
            loc.ten.length === 0
              ? <span className="text-amber-700">Không có tên vật tư nào có {loc.moTa} — biểu đồ bằng 0 (như Excel khi lọc không còn dòng nào)</span>
            : loc.boLoc.kieu === 'dk'
              ? <>Chỉ tính các mã có <span className="font-medium text-slate-700">{loc.moTa}</span> ({dinhDangSo(loc.ten.length)} tên vật tư: <span title={loc.ten.join('\n')}>{nhanDsTen(loc.ten, 3)}</span>)</>
              : <>Chỉ tính <span className="font-medium text-slate-700">{loc.moTa}</span>: <span title={loc.ten.join('\n')}>{nhanDsTen(loc.ten)}</span></>
          )}
        </p>
      )}
      <p className="mt-1 text-[0.9375rem] font-medium leading-snug text-slate-900">{tomTat}</p>

      <div ref={khungRef} data-tkvt-ton className={`mt-3 cursor-pointer transition-opacity ${ketQuaLoc?.trangThai === 'dang_tai' ? 'opacity-40' : ''}`}
        style={{ height: xuat ? caoXuat : 250 }} role="img"
        aria-label={`Biểu đồ đường tồn ${chuoi.nhom} theo ${moc === 'tuan' ? 'từng lần chốt' : 'tháng'}: ${tomTat}. Bấm điểm để xem từng mã`}>
        {(() => {
          const bieuDo = (
          <ComposedChart data={duLieuHien} margin={{ top: 20, right: lePhai, left: 0, bottom: 4 }} onClick={bamDiem}
            width={xuat ? rongXuat : undefined} height={xuat ? caoXuat : undefined}>
            <CartesianGrid vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="khoa" ticks={nhanTruc} interval="preserveEnd" minTickGap={4}
              tickFormatter={(k: string) => (moc === 'tuan' ? nhanNgayNgan(k) : nhanThang(k))}
              tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} padding={{ left: 16, right: 16 }} />
            <YAxis domain={[0, vach[vach.length - 1]]} ticks={vach} width={44} tickLine={false} axisLine={false}
              tickFormatter={(v: number) => (chiSo === 'giaTri' ? dinhDangSo(v / 1000, soLe) : dinhDangSo(v, 0))}
              tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <Tooltip cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} isAnimationActive={false}
              wrapperStyle={{ outline: 'none', zIndex: 30 }}
              content={p => {
                const r = p.payload?.[0]?.payload as DongVe | undefined;
                if (!p.active || !r) return null;
                if (r.laDuBao && r.diemDuBao) return <TooltipDuBao d={r.diemDuBao} nhom={chuoi.nhom} mau={mau} />;
                const d = r as DiemChuoi;
                const i = theoKhoa.get(d.khoa) ?? 0;
                return <TooltipDiem diem={d} truoc={i > 0 ? ds[i - 1] : null} nhom={chuoi.nhom} mau={mau} chiSo={chiSo} moc={moc} tb={tb} />;
              }} />
            {coDuBao && cuoi && (!tuThang || cuoi.khoa >= tuThang) && (
              <ReferenceLine x={cuoi.khoa} stroke="#cbd5e1" strokeDasharray="3 3"
                label={{ value: 'Dự báo →', position: 'insideTopRight', fill: '#64748b', fontSize: 10 }} />
            )}
            {coDuBao && (
              <Area type="linear" dataKey="dai" stroke="none" fill={mau} fillOpacity={0.12} isAnimationActive={false} activeDot={false} />
            )}
            {coDuBao && (
              <Line type="linear" dataKey="duBao" name="Dự báo" stroke={mau} strokeWidth={2} strokeDasharray="6 4"
                dot={{ r: 3, fill: '#ffffff', stroke: mau, strokeWidth: 1.5 }} activeDot={{ r: 4.5, fill: mau, stroke: '#fff', strokeWidth: 1.5 }}
                isAnimationActive={false}>
                <LabelList dataKey="duBao" content={(q: object) => {
                  const { x, y, value, index } = q as { x?: number; y?: number; value?: number | null; index?: number };
                  const dong = index === undefined ? undefined : duLieuHien[index];
                  if (value == null || !dong?.laDuBao || !hienDuBao.has(dong.khoa)) return null;
                  return <text x={Number(x)} y={Number(y) - 9} textAnchor="middle" fontSize={11} fill={mau} fontWeight={600}
                    style={{ fontVariantNumeric: 'tabular-nums' }}>{dinhDangSo(value / 1000, soLeNhan)}</text>;
                }} />
              </Line>
            )}
            {tb !== null && (
              <ReferenceLine y={tb} stroke={mau} strokeOpacity={0.75} strokeWidth={1.25} strokeDasharray="2 3" ifOverflow="extendDomain"
                label={{ value: nhanTb, position: 'right', fill: mau, fontSize: 11, fontWeight: 600 }} />
            )}
            {xh && (
              <Line type="linear" dataKey="xuHuong" name="Xu hướng" stroke={mauXh} strokeWidth={1.75} strokeDasharray="10 5"
                strokeOpacity={0.9} dot={false} activeDot={false} isAnimationActive={false} />
            )}
            {coCham && (
              <Line type="linear" dataKey="chamVe" name="Chậm luân chuyển > 3 tháng" stroke={MAU_CHAM} strokeWidth={1.5}
                strokeDasharray="5 4" dot={{ r: 2.5, fill: MAU_CHAM, stroke: '#fff', strokeWidth: 1 }}
                activeDot={{ r: 4, fill: MAU_CHAM, stroke: '#fff', strokeWidth: 1.5 }} connectNulls isAnimationActive={false}>
                <LabelList dataKey="chamVe" content={(p: object) => <NhanSo {...p} hien={hienCham} duoi chiSo={chiSo} soLe={soLeNhan} />} />
              </Line>
            )}
            {coCham && chamThieu.map(t => (
              <ReferenceDot key={t.khoa} x={t.khoa} y={t.y} r={3.5} fill="#ffffff" stroke={MAU_CHAM} strokeWidth={1.5}
                ifOverflow="extendDomain" label={{ value: 'thiếu số', position: 'bottom', fontSize: 10, fill: MAU_TANG }} />
            ))}
            <Line type="linear" dataKey="tong" name="Tổng tồn" stroke={mau} strokeWidth={2.25}
              dot={{ r: 3.5, fill: mau, stroke: '#fff', strokeWidth: 1.5 }}
              activeDot={{ r: 5.5, fill: mau, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false}>
              <LabelList dataKey="tong" content={(p: object) => <NhanSo {...p} hien={hienTong} chiSo={chiSo} dam soLe={soLeNhan} />} />
            </Line>
          </ComposedChart>
          );
          // Lúc chụp cho PDF: vẽ thẳng kích thước cố định (ResponsiveContainer đo lại qua ResizeObserver — chậm / không chạy
          // khi tab ở nền, ảnh chụp sẽ còn kích thước cũ)
          return xuat ? bieuDo : <ResponsiveContainer width="100%" height="100%">{bieuDo}</ResponsiveContainer>;
        })()}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.6875rem] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[3px] w-4 rounded-full" style={{ background: mau }} aria-hidden />Tổng tồn
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed" style={{ borderColor: MAU_CHAM }} aria-hidden />Chậm luân chuyển &gt; 3 tháng
        </span>
        {tb !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dotted" style={{ borderColor: mau }} aria-hidden />
            Trung bình {ds.length} {moc === 'tuan' ? 'lần chốt' : 'tháng'}: {dinhDangChiSo(tb, chiSo)}
          </span>
        )}
        {xh && (
          <span className="inline-flex items-center gap-1.5" style={{ color: mauXh }}>
            <span className="w-4 border-t-2 border-dashed" style={{ borderColor: mauXh }} aria-hidden />
            {xh.huong === 'ngang'
              ? 'Xu hướng: đi ngang'
              : xh.huong === 'khongRo'
                ? <span title="Đường thẳng xu hướng giải thích dưới 50% dao động của tổng tồn => không kết luận tăng hay giảm">
                  Xu hướng: không rõ — tồn lên xuống, đường thẳng chỉ giải thích {Math.round(xh.r2 * 100)}% dao động
                </span>
                : <>Xu hướng {xh.huong === 'tang' ? '▲ tăng' : '▼ giảm'} ~{dinhDangChiSo(Math.abs(xh.moiDiem), chiSo)}/{moc === 'tuan' ? 'tuần' : 'tháng'}
                {xh.ptCaKhoang !== null && <> ({dinhDangPt(xh.ptCaKhoang, true)} cả khoảng)</>}</>}
          </span>
        )}
        {coDuBao && (
          <span className="inline-flex items-center gap-1.5" style={{ color: mau }}>
            <span className="relative inline-flex h-3 w-4 items-center" aria-hidden>
              <span className="absolute inset-0 rounded-sm" style={{ background: mau, opacity: 0.15 }} />
              <span className="relative w-4 border-t-2 border-dashed" style={{ borderColor: mau }} />
            </span>
            Dự báo theo kế hoạch doanh thu (vùng mờ = sai số thường gặp)
          </span>
        )}
        <span>{chiSo === 'giaTri' ? 'Đơn vị: tỷ đồng' : 'Đơn vị: số mã'}</span>
      </div>
      {coDuBao && duBaoHien && <div className="mt-2"><CauDuBao duBao={duBaoHien} /></div>}
      {doanhThu && moc === 'tuan' && (
        <p className="mt-2 text-[0.6875rem] text-slate-400">Doanh thu từng tháng và dự báo tồn theo kế hoạch doanh thu: xem ở chế độ Theo tháng.</p>
      )}
      {doanhThu && moc === 'thang' && chiSo === 'soMa' && (
        <p className="mt-2 text-[0.6875rem] text-slate-400">Dự báo tồn theo kế hoạch doanh thu tính trên giá trị: chọn "Giá trị" để xem.</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Cửa sổ chi tiết từng mã
// ---------------------------------------------------------------------------
interface MoChiTiet {
  nhom: string;
  ngayChot: string;
  /** Ngày chốt của điểm liền trước trên biểu đồ (tháng: lần chốt cuối tháng trước); null = lần chốt liền trước */
  ngaySoVoi: string | null;
  /** Đang xem theo tháng và có điểm trước => so với cuối tháng trước (đổi nhãn đầu cửa sổ) */
  soVoiThang: boolean;
  thieuCham?: boolean;
  /** Bộ lọc tên của thẻ (chỉ các mã mang các tên này); bỏ trống = cả nhóm */
  loc?: LocTen;
}

const BUOC_HIEN = 300;
const COT_SO = new Set<CotXep>(['soLuong', 'soLuongTruoc', 'giaTri', 'soThang', 'cham']);

// Gắn mới mỗi lần mở (key theo nhóm + ngày + ngày so) => bộ lọc / ô tìm / cách xếp tự về mặc định, không loé số của lần mở trước
function ChiTietModal({ mo, onDong }: { mo: MoChiTiet; onDong: () => void }) {
  const [duLieu, setDuLieu] = useState<ChiTietTonKhoVt | null>(null);
  const [loi, setLoi] = useState<{ thongBao: string; chuaCoQuyen: boolean } | null>(null);
  const [lanTai, setLanTai] = useState(0);
  const oTimRef = useRef<HTMLInputElement>(null);
  const [loc, setLoc] = useState<LocDong>('tat_ca');
  const [tim, setTim] = useState('');
  const timHoan = useDeferredValue(tim);
  const [xep, setXep] = useState<CachXep>(XEP_MAC_DINH);
  const [gioiHan, setGioiHan] = useState(BUOC_HIEN);
  const [dangXuat, setDangXuat] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    setDuLieu(null); setLoi(null);
    if (mo.loc && mo.loc.ten.length === 0) {
      setDuLieu({ ngay: mo.ngayChot, ngayTruoc: mo.ngaySoVoi, coGia: true, dong: [] });
      return () => ac.abort();
    }
    layChiTietTonKhoVt(mo.ngayChot, mo.nhom, mo.ngaySoVoi, ac.signal, mo.loc?.ten)
      .then(d => { if (!ac.signal.aborted) setDuLieu(d); })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        console.error('Lỗi tải chi tiết tồn kho vật tư:', e);
        if (laLoiChuaCoQuyen(e)) setLoi({ thongBao: 'Bạn chưa có quyền xem tồn kho vật tư', chuaCoQuyen: true });
        // LoiTonKhoVt luôn mang câu tiếng Việt; lỗi khác (lỗi lập trình…) không đưa chữ tiếng Anh ra người dùng
        else setLoi({ thongBao: e instanceof LoiTonKhoVt ? e.message : 'Lỗi không xác định, hãy thử lại', chuaCoQuyen: false });
      });
    return () => ac.abort();
  }, [mo, lanTai]);

  // ModalShell chỉ tìm [data-autofocus] lúc mở, khi đó ô tìm chưa vẽ (đang tải) => tiêu điểm nằm ở nút Đóng.
  // Danh sách về thì đưa tiêu điểm vào ô tìm: gõ được mã ngay, Space / Enter không lỡ tay đóng cửa sổ.
  useEffect(() => { if (duLieu) oTimRef.current?.focus(); }, [duLieu]);

  useEffect(() => { setGioiHan(BUOC_HIEN); }, [loc, timHoan, xep, duLieu]);

  const coGia = duLieu?.coGia ?? false;
  const ds = useMemo(() => (duLieu ? duLieu.dong.map(d => phanLoaiDong(d, duLieu.coGia)) : []), [duLieu]);
  // Số trên thẻ lọc tính theo ô tìm đang gõ (thẻ nào bấm vào cũng ra đúng số dòng đó)
  const dem = useMemo(() => demTheoLoc(timHoan.trim() ? locDong(ds, 'tat_ca', timHoan) : ds), [ds, timHoan]);
  const daXep = useMemo(() => xepDong(locDong(ds, loc, timHoan), xep), [ds, loc, timHoan, xep]);
  const tomTat = useMemo(() => {
    let soMa = 0, gt = 0, gtTruoc = 0, cham = 0;
    for (const d of ds) {
      if (d.soLuong !== null) { soMa++; if (d.cham) cham++; }
      gt += d.giaTri ?? 0; gtTruoc += d.giaTriTruoc ?? 0;
    }
    return { soMa, gt, chenh: gt - gtTruoc, cham };
  }, [ds]);

  const bamCot = (k: CotXep) => {
    if (k === 'chenh') {
      setXep(x => (x.cot === 'doLon' ? { cot: 'chenh', giam: true } : x.cot === 'chenh' && x.giam ? { cot: 'chenh', giam: false } : XEP_MAC_DINH));
      return;
    }
    setXep(x => (x.cot === k ? { cot: k, giam: !x.giam } : { cot: k, giam: COT_SO.has(k) }));
  };

  const xuat = async () => {
    if (!duLieu) return;
    setDangXuat(true);
    try {
      await taiExcel(`ton-kho-vat-tu_${tenFileAnToan(mo.nhom)}${mo.loc ? '_loc-ten' : ''}_${duLieu.ngay}.xlsx`, [{ ten: 'Chi tiết', dong: bangChiTietExcel(daXep, coGia) }]);
    } catch (e) {
      console.error('Lỗi xuất Excel chi tiết tồn kho vật tư:', e);
    } finally {
      setDangXuat(false);
    }
  };

  const cot: Array<{ k: CotXep; nhan: string; phai?: boolean }> = [
    { k: 'ma', nhan: 'Mã' },
    { k: 'ten', nhan: 'Tên vật tư' },
    { k: 'dvt', nhan: 'ĐVT' },
    { k: 'soLuong', nhan: 'SL lần này', phai: true },
    { k: 'soLuongTruoc', nhan: 'SL lần trước', phai: true },
    ...(coGia ? [{ k: 'giaTri' as const, nhan: 'Giá trị', phai: true }] : []),
    { k: 'chenh', nhan: coGia ? 'Chênh giá trị' : 'Chênh SL', phai: true },
    { k: 'soThang', nhan: 'Số tháng nhập', phai: true },
    { k: 'cham', nhan: 'Chậm LC' },
    { k: 'congTrinh', nhan: 'Công trình' },
  ];
  const dangXep = (k: CotXep) => (k === 'chenh' ? xep.cot === 'chenh' || xep.cot === 'doLon' : xep.cot === k);
  const tieuDe = `${mo.nhom}${mo.loc ? ` (lọc: ${mo.loc.moTa})` : ''} · chốt ${nhanNgay(mo.ngayChot)}${duLieu ? (duLieu.ngayTruoc ? ` · so với ${nhanNgay(duLieu.ngayTruoc)}` : ' · lần chốt đầu tiên') : ''}`;
  const hien = daXep.slice(0, gioiHan);

  return (
    <ModalShell open onClose={onDong} labelledBy="tkvt-chi-tiet-tieu-de" closeOnBackdrop closeOnEsc
      overlayClassName="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-900/50 p-2 sm:p-4"
      panelClassName="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl outline-none">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <p className="kpi-label">Từng mã vật tư · {mo.soVoiThang ? 'so với lần chốt cuối tháng trước' : 'so với lần chốt liền trước'}</p>
          <h3 id="tkvt-chi-tiet-tieu-de" className="text-base font-semibold text-slate-900 sm:text-lg">{tieuDe}</h3>
          {duLieu && (
            <p className="mt-0.5 text-xs text-slate-500">
              {dinhDangSo(tomTat.soMa)} mã còn tồn
              {coGia && <> · tổng {dinhDangSo(tomTat.gt / 1000, 2)} tỷ (<ChuChenh v={duLieu.ngayTruoc ? tomTat.chenh : null} pt={null} chiSo="giaTri" />)</>}
              {mo.thieuCham
                ? <span className="text-amber-700"> · file chốt ngày này không có cột chậm luân chuyển</span>
                : <>{' · '}{dinhDangSo(tomTat.cham)} mã chậm luân chuyển &gt; 3 tháng</>}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={xuat} disabled={!duLieu || dangXuat || daXep.length === 0}
            title="Xuất danh sách đang lọc ra Excel"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50">
            <Download size={14} /> <span className="hidden sm:inline">{dangXuat ? 'Đang xuất…' : 'Xuất Excel'}</span>
          </button>
          <button type="button" onClick={onDong} aria-label="Đóng"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>
      </div>

      {loi ? (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          {loi.chuaCoQuyen ? (
            <>
              <Shield className="h-9 w-9 text-slate-300" strokeWidth={1.5} />
              <p className="text-sm font-medium text-slate-700">{loi.thongBao}</p>
            </>
          ) : (
            <>
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-sm font-medium text-slate-700">Không tải được danh sách mã</p>
                <p className="mt-1 text-xs text-slate-500">{loi.thongBao}</p>
              </div>
              <button type="button" onClick={() => setLanTai(n => n + 1)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <RefreshCw size={14} /> Thử lại
              </button>
            </>
          )}
        </div>
      ) : !duLieu ? (
        <div className="space-y-2 p-5" aria-busy="true" aria-label="Đang tải danh sách mã">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-7 animate-pulse rounded bg-slate-100" />)}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
            {NHAN_LOC.map(([k, l]) => (
              <button key={k} type="button" onClick={() => setLoc(k)} aria-pressed={loc === k}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${loc === k ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                {l} <span className="tabular-nums opacity-70">{dinhDangSo(dem[k])}</span>
              </button>
            ))}
            <label className="relative ml-auto w-full sm:w-72">
              <span className="sr-only">Tìm mã, tên vật tư, công trình</span>
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input ref={oTimRef} value={tim} onChange={e => setTim(e.target.value)} placeholder="Tìm mã, tên vật tư, công trình…"
                className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200" />
            </label>
          </div>
          {!coGia && (
            <p className="flex items-center gap-1.5 border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800 sm:px-5">
              <Info size={13} /> Cần quyền xem giá vật tư để thấy giá trị từng mã — đang so theo số lượng.
            </p>
          )}

          <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500 shadow-[0_1px_0_#e2e8f0]">
                <tr>
                  {cot.map(c => (
                    <th key={c.k} scope="col" className={`whitespace-nowrap px-3 py-2 font-medium ${c.phai ? 'text-right' : 'text-left'}`}
                      aria-sort={dangXep(c.k) ? (xep.giam ? 'descending' : 'ascending') : 'none'}>
                      <button type="button" onClick={() => bamCot(c.k)}
                        title={c.k === 'chenh' ? (xep.cot === 'doLon' ? 'Đang xếp theo độ lớn chênh lệch (tăng hay giảm đều tính) — bấm để xếp tăng nhiều nhất trước' : 'Bấm để đổi cách xếp') : `Xếp theo ${c.nhan}`}
                        className={`inline-flex items-center gap-1 hover:text-slate-900 ${dangXep(c.k) ? 'text-slate-900' : ''}`}>
                        {c.nhan}
                        {c.k === 'chenh' && xep.cot === 'doLon' && <span className="text-[0.625rem] font-normal">(độ lớn)</span>}
                        {dangXep(c.k) ? (xep.giam ? <ChevronDown size={12} /> : <ChevronUp size={12} />) : <ChevronsUpDown size={12} className="opacity-40" />}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hien.map(d => {
                  const ct = tachCongTrinh(d.congTrinh);
                  const het = d.loai === 'het';
                  return (
                    <tr key={d.ma} className={`hover:bg-slate-50 ${het ? 'text-slate-400' : 'text-slate-700'}`}>
                      <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">
                        {d.ma}
                        {d.loai === 'moi' && <span className="ml-1.5 rounded bg-sky-50 px-1.5 py-0.5 font-sans text-[0.625rem] font-semibold text-sky-700">Mới</span>}
                        {het && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 font-sans text-[0.625rem] font-semibold text-slate-500">Đã hết</span>}
                        {d.ghiChu && <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 font-sans text-[0.625rem] font-semibold text-amber-700" title={d.ghiChu}>{d.ghiChu}</span>}
                      </td>
                      <td className="max-w-[280px] truncate px-3 py-1.5" title={d.ten ?? undefined}>{d.ten ?? '—'}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-xs">{d.dvt ?? '—'}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{dinhDangSoLuong(d.soLuong)}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-500">{dinhDangSoLuong(d.soLuongTruoc)}</td>
                      {coGia && <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{dinhDangTienDong(d.giaTri)}</td>}
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                        <OChenhDong d={d} coGia={coGia} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                        {d.soThang === null ? '—' : d.soThang.toLocaleString('en-US', { maximumFractionDigits: 1 })}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        {d.cham && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.6875rem] font-medium text-slate-600">Chậm</span>}
                      </td>
                      <td className="max-w-[260px] px-3 py-1.5 text-xs" title={ct.join('\n') || undefined}>
                        {ct.length === 0 ? <span className="text-slate-300">—</span> : (
                          <span className="flex items-center gap-1">
                            <span className="truncate">{ct[0]}</span>
                            {ct.length > 1 && <span className="shrink-0 rounded bg-slate-100 px-1 text-[0.625rem] font-semibold text-slate-500">+{ct.length - 1}</span>}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {daXep.length === 0 && <p className="px-6 py-12 text-center text-sm text-slate-400">Không có mã nào khớp bộ lọc</p>}
            {daXep.length > gioiHan && (
              <div className="flex items-center justify-center gap-3 border-t border-slate-100 p-3 text-xs text-slate-500">
                Đang hiện {dinhDangSo(gioiHan)} / {dinhDangSo(daXep.length)} mã
                <button type="button" onClick={() => setGioiHan(g => g + BUOC_HIEN * 3)}
                  className="rounded-lg border border-slate-200 px-3 py-1 font-medium text-slate-700 hover:bg-slate-50">
                  Hiện thêm
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </ModalShell>
  );
}

function OChenhDong({ d, coGia }: { d: DongDaPhanLoai; coGia: boolean }) {
  const v = coGia ? d.chenhGiaTri ?? 0 : d.chenhSoLuong;
  if (Math.abs(v) < 1e-9) return <span className="text-slate-400">0</span>;
  const tang = v > 0;
  const chu = coGia ? dinhDangTienDong(v, true) : `${tang ? '+' : '−'}${dinhDangSoLuong(Math.abs(v))}`;
  return <span className="font-medium" style={{ color: tang ? MAU_TANG : MAU_GIAM }}>{tang ? '▲' : '▼'} {chu}</span>;
}

// ---------------------------------------------------------------------------
// Trang
// ---------------------------------------------------------------------------
type TrangThai = { loai: 'dang_tai' } | { loai: 'loi'; thongBao: string } | { loai: 'chua_quyen'; thongBao: string } | { loai: 'xong'; duLieu: TongHopTonKhoVt };

const TonKhoVatTu: React.FC = () => {
  const [trangThai, setTrangThai] = useState<TrangThai>({ loai: 'dang_tai' });
  const [lanTai, setLanTai] = useState(0);
  const [chiSo, setChiSo] = useState<ChiSo>('giaTri');
  const [moc, setMoc] = useState<MocXem>('thang');
  const [khoang, setKhoang] = useState<KhoangXem>('tat_ca');
  const [moChiTiet, setMoChiTiet] = useState<MoChiTiet | null>(null);
  const [dangXuat, setDangXuat] = useState<'pdf' | 'xlsx' | null>(null);
  const [loiXuat, setLoiXuat] = useState<string | null>(null);
  const [moMenu, setMoMenu] = useState(false);
  const [dangChup, setDangChup] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  // Bộ lọc tên từng thẻ (nhóm => bộ lọc kiểu Excel) và số liệu nhóm theo bộ lọc đó
  const [locTheoNhom, setLocTheoNhom] = useState<Record<string, LocTen>>({});
  const [ketQuaLoc, setKetQuaLoc] = useState<Record<string, KetQuaLoc>>({});
  const acLoc = useRef(new Map<string, AbortController>());
  useEffect(() => { const m = acLoc.current; return () => m.forEach(ac => ac.abort()); }, []);

  /** Áp dụng (hoặc bỏ: null) bộ lọc tên của 1 thẻ — chỉ tải lại số của nhóm đó */
  const apDungLoc = (nhom: string, loc: LocTen | null) => {
    acLoc.current.get(nhom)?.abort();
    acLoc.current.delete(nhom);
    setLocTheoNhom(m => {
      const n = { ...m };
      if (loc) n[nhom] = loc; else delete n[nhom];
      return n;
    });
    if (!loc) {
      setKetQuaLoc(m => { const n = { ...m }; delete n[nhom]; return n; });
      return;
    }
    if (loc.ten.length === 0) {
      setKetQuaLoc(m => ({ ...m, [nhom]: { trangThai: 'xong', duLieu: { capNhat: null, ngay: [], nhom: [nhom], diem: [] } } }));
      return;
    }
    const ac = new AbortController();
    acLoc.current.set(nhom, ac);
    setKetQuaLoc(m => ({ ...m, [nhom]: { trangThai: 'dang_tai' } }));
    layTongHopTonKhoVt(ac.signal, { nhom, ten: loc.ten })
      .then(d => { if (!ac.signal.aborted) setKetQuaLoc(m => ({ ...m, [nhom]: { trangThai: 'xong', duLieu: d } })); })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        console.error('Lỗi tải tồn kho vật tư theo bộ lọc tên:', e);
        setKetQuaLoc(m => ({ ...m, [nhom]: { trangThai: 'loi', thongBao: e instanceof LoiTonKhoVt ? e.message : 'Lỗi không xác định, hãy thử lại' } }));
      });
  };

  useEffect(() => {
    const ac = new AbortController();
    setTrangThai({ loai: 'dang_tai' });
    layTongHopTonKhoVt(ac.signal)
      .then(d => { if (!ac.signal.aborted) setTrangThai({ loai: 'xong', duLieu: d }); })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        console.error('Lỗi tải tổng hợp tồn kho vật tư:', e);
        // LoiTonKhoVt luôn mang câu tiếng Việt; lỗi khác không đưa chữ tiếng Anh ra người dùng (đã ghi console)
        const thongBao = e instanceof LoiTonKhoVt ? e.message : 'Lỗi không xác định, hãy thử lại';
        setTrangThai(laLoiChuaCoQuyen(e) ? { loai: 'chua_quyen', thongBao } : { loai: 'loi', thongBao });
      });
    return () => ac.abort();
  }, [lanTai]);

  const duLieu = trangThai.loai === 'xong' ? trangThai.duLieu : null;
  const ngayMoiNhat = useMemo(() => (duLieu ? dsNgayChot(duLieu).slice(-1)[0] ?? null : null), [duLieu]);
  const chuoi = useMemo(() => {
    if (!duLieu) return [];
    const k = khoangTheoLuaChon(ngayMoiNhat, khoang, moc);
    return dungChuoi(duLieu, { ...k, moc, chiSo });
  }, [duLieu, ngayMoiNhat, khoang, moc, chiSo]);
  const tong = useMemo(() => tongCacNhom(chuoi), [chuoi]);
  // Thẻ có bộ lọc tên (đã tải xong) vẽ số theo bộ lọc; số tổng đầu trang vẫn từ `chuoi` (toàn kho)
  const thieuToanBang = useMemo(() => (duLieu ? ngayThieuCham(duLieu) : new Set<string>()), [duLieu]);
  const chuoiHien = useMemo(() => {
    if (!duLieu) return chuoi;
    const k = khoangTheoLuaChon(ngayMoiNhat, khoang, moc);
    return chuoi.map(c => {
      const kq = ketQuaLoc[c.nhom];
      if (!locTheoNhom[c.nhom] || kq?.trangThai !== 'xong') return c;
      // Trục ngày chung của cả bảng (lần chốt các tên đã chọn không còn tồn => 0); "thiếu cờ" theo toàn bảng
      const th: TongHopTonKhoVt = { ...kq.duLieu, ngay: duLieu.ngay, nhom: [c.nhom] };
      return dungChuoi(th, { ...k, moc, chiSo, thieu: thieuToanBang }).find(x => x.nhom === c.nhom) ?? c;
    });
  }, [chuoi, duLieu, ngayMoiNhat, khoang, moc, chiSo, locTheoNhom, ketQuaLoc, thieuToanBang]);
  /** Bộ lọc đang có hiệu lực trên biểu đồ (đã tải xong số) — dùng cho báo cáo xuất */
  const locHieuLuc = useMemo(
    () => Object.fromEntries(Object.entries(locTheoNhom).filter(([n]) => ketQuaLoc[n]?.trangThai === 'xong')), [locTheoNhom, ketQuaLoc]);
  const nhomDangLoc = Object.keys(locTheoNhom);
  // Xuất báo cáo phải dùng đúng 1 trạng thái: chờ bộ lọc tải xong số mới cho xuất
  const dangTaiLoc = Object.values(ketQuaLoc).some(k => k.trangThai === 'dang_tai');
  const ngayThieu = useMemo(() => (chuoi[0]?.diem ?? []).filter(d => d.thieuCham).map(d => d.ngayChot), [chuoi]);
  const capNhat = dinhDangCapNhat(duLieu?.capNhat ?? null);
  // Doanh thu tháng (cả công ty) cho biểu đồ "tồn bằng bao nhiêu ngày doanh thu": các năm từ 3 tháng trước lần chốt
  // đầu tiên tới lần chốt cuối (bình quân 3 tháng của lần chốt đầu cần cả tháng của năm trước)
  const [doanhThu, setDoanhThu] = useState<{ dt: DoanhThuKeHoach; loi: string | null } | null>(null);
  const thangHienTai = useMemo(thangHienTaiVn, []);
  const namCoTon = useMemo(() => {
    const ngay = duLieu ? dsNgayChot(duLieu) : [];
    if (!ngay.length) return '';
    // từ 3 tháng trước lần chốt đầu (bình quân 3 tháng) tới 3 tháng sau lần chốt cuối (kế hoạch các tháng dự báo)
    const tu = Number(congThangKhoa(ngay[0].slice(0, 7), -3).slice(0, 4));
    const den = Number(congThangKhoa(ngay[ngay.length - 1].slice(0, 7), SO_THANG_DU_BAO_TOI_DA).slice(0, 4));
    return Array.from({ length: den - tu + 1 }, (_, i) => tu + i).join(',');
  }, [duLieu]);
  useEffect(() => {
    if (!namCoTon) return;
    const ac = new AbortController();
    Promise.all(namCoTon.split(',').map(n => layDoanhThuKeHoach(Number(n), ac.signal)))
      .then(ds => {
        if (ac.signal.aborted) return;
        setDoanhThu({ dt: { thucTe: Object.assign({}, ...ds.map(d => d.thucTe)), keHoach: Object.assign({}, ...ds.map(d => d.keHoach)) }, loi: null });
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        console.error('Lỗi tải doanh thu tháng:', e);
        setDoanhThu({ dt: { thucTe: {}, keHoach: {} }, loi: e instanceof LoiTonKhoVt ? e.message : 'Lỗi không xác định' });
      });
    return () => ac.abort();
  }, [namCoTon]);
  const dtKH = doanhThu && !doanhThu.loi ? doanhThu.dt : undefined;
  // Dự báo tồn theo kế hoạch doanh thu: chuỗi THÁNG đủ (không theo khoảng đang xem — kiểm lại được nhiều tháng), GIÁ TRỊ;
  // nhóm đang lọc tên thì theo số đã lọc. Toàn kho = cộng các nhóm (không lọc).
  const chuoiThangDu = useMemo(() => {
    if (!duLieu) return [] as ChuoiNhom[];
    return dungChuoi(duLieu, { moc: 'thang', chiSo: 'giaTri' }).map(c => {
      const kq = ketQuaLoc[c.nhom];
      if (!locTheoNhom[c.nhom] || kq?.trangThai !== 'xong') return c;
      const th: TongHopTonKhoVt = { ...kq.duLieu, ngay: duLieu.ngay, nhom: [c.nhom] };
      return dungChuoi(th, { moc: 'thang', chiSo: 'giaTri', thieu: thieuToanBang }).find(x => x.nhom === c.nhom) ?? c;
    });
  }, [duLieu, locTheoNhom, ketQuaLoc, thieuToanBang]);
  const duBaoTheoNhomDu = useMemo<Record<string, DuBaoTon | null>>(
    () => (dtKH ? Object.fromEntries(chuoiThangDu.map(c => [c.nhom, duBaoTonTheoDoanhThu(c.diem, dtKH, thangHienTai, SO_THANG_DU_BAO_TOI_DA)])) : {}),
    [chuoiThangDu, dtKH, thangHienTai]);
  const duBaoToanKhoDu = useMemo(() => {
    if (!dtKH || !duLieu) return null;
    const goc = dungChuoi(duLieu, { moc: 'thang', chiSo: 'giaTri' });
    if (!goc.length) return null;
    const tongThang: DiemChuoi[] = goc[0].diem.map((d, i) => {
      const t = goc.reduce((sum, c) => sum + (c.diem[i]?.tong ?? 0), 0);
      return { ...d, tong: t, goc: { ...d.goc, giaTri: t } };
    });
    return duBaoTonTheoDoanhThu(tongThang, dtKH, thangHienTai, SO_THANG_DU_BAO_TOI_DA);
  }, [dtKH, duLieu, thangHienTai]);
  // Chọn 1 năm: dự báo chỉ hiện tới tháng 12 năm đó (kiểm lại sai số vẫn tính trên cả chuỗi)
  const namXem = namCuaKhoang(khoang);
  const denThangXem = namXem === null ? null : `${namXem}-12`;
  const tuThangXem = namXem === null ? null : `${namXem}-01`;
  const duBaoTheoNhom = useMemo(() => Object.fromEntries(Object.entries(duBaoTheoNhomDu).map(([k, d]) => [k, catDuBao(d, denThangXem)])),
    [duBaoTheoNhomDu, denThangXem]);
  const duBaoToanKho = useMemo(() => catDuBao(duBaoToanKhoDu, denThangXem), [duBaoToanKhoDu, denThangXem]);
  // Các năm chọn được: năm có lần chốt + năm có doanh số cần đạt từ năm chốt đầu trở đi (năm tới = dự báo)
  const dsNam = useMemo(() => {
    const ngay = duLieu ? dsNgayChot(duLieu) : [];
    if (!ngay.length) return [] as number[];
    const dau = Number(ngay[0].slice(0, 4));
    // Năm chưa có tồn chỉ có dự báo (theo tháng, giá trị) — xem theo tuần / số mã thì chỉ các năm có lần chốt
    const coDuBaoNam = moc === 'thang' && chiSo === 'giaTri';
    const nam = new Set([...ngay.map(n => Number(n.slice(0, 4))), ...(coDuBaoNam ? Object.keys(DOANH_SO_CAN_DAT).map(Number).filter(n => n >= dau) : [])]);
    return [...nam].sort((a, b) => a - b);
  }, [duLieu, moc, chiSo]);
  useEffect(() => {
    if (namXem !== null && dsNam.length && !dsNam.includes(namXem)) setKhoang('tat_ca');
  }, [namXem, dsNam]);
  const coSo = !!ngayMoiNhat && chuoi.length > 0;

  const khoangNhan = namXem !== null ? `Năm ${namXem}` : khoang === 'tat_ca' ? 'Tất cả' : khoang === '6t' ? '6 tháng gần nhất' : '3 tháng gần nhất';
  const nguoiLap = user?.fullName || user?.username || '';
  const dongMenu = () => setMoMenu(false);
  useEffect(() => {
    if (!moMenu) return;
    const ngoai = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMoMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoMenu(false); };
    document.addEventListener('mousedown', ngoai);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', ngoai); document.removeEventListener('keydown', esc); };
  }, [moMenu]);

  // Excel: sheet "Báo cáo" (tổng kết từng nhóm), sheet "Biểu đồ" (6 biểu đồ đường gốc của Excel, số ở sheet
  // "Số liệu biểu đồ"), rồi 2 sheet số liệu từng kỳ
  const xuatExcel = async () => {
    dongMenu();
    if (!coSo || !ngayMoiNhat || dangTaiLoc) return;
    setDangXuat('xlsx');
    setLoiXuat(null);
    try {
      const [{ bangBaoCaoExcel, tenFileBaoCao }, { chenBieuDoVaoXlsx, dungBieuDoExcel, DONG_BIEU_DO_DAU, TEN_SHEET_BIEU_DO, TEN_SHEET_SO_LIEU }] =
        await Promise.all([import('./tonKhoVatTu/baoCao'), import('./tonKhoVatTu/excelBieuDo')]);
      const dsLoc = Object.entries(locHieuLuc);
      const tieuDe: O[][] = [
        ['Báo cáo tồn kho vật tư'],
        [`${moc === 'tuan' ? 'Theo từng lần chốt (tuần)' : 'Theo tháng (lần chốt cuối tháng)'} · ${khoangNhan} · ${chiSo === 'giaTri' ? 'giá trị, tỷ đồng' : 'số mã vật tư'}`],
        [`Chốt mới nhất ${nhanNgay(ngayMoiNhat)}${capNhat ? ` · dữ liệu cập nhật ${capNhat}` : ''} · người lập: ${nguoiLap}`],
        ...(dsLoc.length
          ? [[`${dsLoc.length} nhóm đang lọc tên vật tư (ghi "lọc: …" sau tên nhóm) — điều kiện + danh sách tên ở sheet "Bộ lọc tên"`]]
          : []),
        [],
      ];
      // Nhóm đang lọc: ghi rõ ngay trong tên nhóm ở mọi sheet
      const chuoiXuat = chuoiHien.map(c => (locHieuLuc[c.nhom] ? { ...c, nhom: `${c.nhom} (lọc: ${locHieuLuc[c.nhom].moTa})` } : c));
      const bd = dungBieuDoExcel({
        chuoi: chuoiHien, chiSo, moc, loc: locHieuLuc, mau: Object.fromEntries(chuoiHien.map(c => [c.nhom, mauNhom(c.nhom)])),
        doanhThu: dtKH, thangHienTai, duBao: moc === 'thang' && chiSo === 'giaTri' ? duBaoTheoNhom : undefined,
      });
      const dauBieuDo: O[][] = [
        ['Biểu đồ tồn kho vật tư'],
        tieuDe[1], tieuDe[2],
        [`Biểu đồ Excel: số lấy ở sheet "${TEN_SHEET_SO_LIEU}" (sửa số ở đó thì biểu đồ đổi theo). Đường gạch dài = đường xu hướng tuyến tính của Excel; chấm = trung bình; xám nét đứt = chậm luân chuyển > 3 tháng (lần chốt thiếu cột này để trống, đường nối qua).`],
        ...(moc === 'thang' && chiSo === 'giaTri' ? [[`Tháng dự báo: điểm rỗng nét đứt = tồn dự báo theo kế hoạch doanh thu; thanh dọc = khoảng sai số thường gặp (± mức lệch trung bình khi kiểm lại cách dự báo trên các tháng đã qua) — tồn thật thường nằm giữa số ở đầu dưới và đầu trên của thanh. Số ở cột G–K sheet "${TEN_SHEET_SO_LIEU}".`]] : []),
      ];
      while (dauBieuDo.length < DONG_BIEU_DO_DAU) dauBieuDo.push([]);
      await taiExcel(tenFileBaoCao({ moc, ngayMoiNhat }, 'xlsx'), [
        {
          ten: 'Báo cáo', hangTieuDe: tieuDe.length,
          dong: [...tieuDe, ...bangBaoCaoExcel(chuoiXuat, chiSo, moc, dsLoc.length ? 'Tổng các dòng trên (theo bộ lọc tên)' : undefined)],
        },
        { ten: TEN_SHEET_BIEU_DO, dong: dauBieuDo, hangTieuDe: dauBieuDo.length },
        { ten: TEN_SHEET_SO_LIEU, dong: bd.soLieu, hangTieuDe: 1, congThuc: bd.congThuc, rongCot: bd.rongCot },
        { ten: 'Ngày x nhóm', dong: bangTongHopExcel(chuoiXuat) },
        { ten: 'Dạng dọc', dong: bangDocExcel(chuoiXuat) },
        ...(dsLoc.length
          ? [{ ten: 'Bộ lọc tên', dong: [['Nhóm vật tư', 'Bộ lọc', 'Tên vật tư thoả bộ lọc'], ...dsLoc.flatMap(([n, l]) => l.ten.map((t): O[] => [n, l.moTa, t]))] }]
          : []),
      ], goi => chenBieuDoVaoXlsx(goi, TEN_SHEET_BIEU_DO, bd.bieuDo));
    } catch (e) {
      console.error('Lỗi xuất Excel tồn kho vật tư:', e);
      setLoiXuat('Không xuất được file Excel, hãy thử lại');
    } finally {
      setDangXuat(null);
    }
  };

  // PDF: chụp đúng các biểu đồ đang hiện trên trang (chế độ / khoảng đang xem) rồi dựng báo cáo
  const xuatPdf = async () => {
    dongMenu();
    if (!coSo || !ngayMoiNhat || !tong || dangTaiLoc) return;
    setDangXuat('pdf');
    setLoiXuat(null);
    try {
      // Tạm đổi biểu đồ sang tỷ lệ báo cáo, chờ recharts vẽ lại theo kích thước mới rồi mới chụp
      setDangChup(true);
      await new Promise(r => setTimeout(r, 450));
      const anh: Record<string, string | undefined> = {};
      try {
        for (const c of chuoiHien) {
          anh[c.nhom] = await chupBieuDo(c.nhom).catch((e: unknown) => { console.error('Lỗi chụp biểu đồ', c.nhom, e); return undefined; });
        }
      } finally {
        setDangChup(false);
      }
      const { taiBaoCaoPdf } = await import('./tonKhoVatTu/baoCao');
      await taiBaoCaoPdf({
        chuoi: chuoiHien, tong, chiSo, moc, khoangNhan, ngayMoiNhat, capNhat, nguoiLap, luc: new Date(), anh, loc: locHieuLuc,
        // 1 biểu đồ doanh số chung (đầu trang) — không lặp dưới từng nhóm
        anhDoanhSo: moc === 'thang' ? await chupSvg(document.querySelector<SVGSVGElement>('[data-tkvt-doanhso] .recharts-wrapper svg')).catch(() => undefined) : undefined,
        doanhThu: dtKH, thangHienTai, duBao: moc === 'thang' && chiSo === 'giaTri' ? duBaoTheoNhom : undefined, duBaoToanKho,
        mau: Object.fromEntries(chuoi.map(c => [c.nhom, mauNhom(c.nhom)])),
      });
    } catch (e) {
      console.error('Lỗi xuất báo cáo PDF tồn kho vật tư:', e);
      setLoiXuat('Không xuất được báo cáo PDF, hãy thử lại');
    } finally {
      setDangXuat(null);
    }
  };

  const giaTri = chiSo === 'giaTri';
  const nhanTruoc = moc === 'tuan' ? 'So với lần chốt trước' : 'So với cuối tháng trước';

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-[#f5f6f8]">
      {/* Điện thoại: đầu trang cao (3 nhóm nút xuống dòng) nên không ghim, để dành chỗ cho biểu đồ */}
      <div className="z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:sticky sm:top-0 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="h-3 w-3 rounded-sm" style={{ background: MAU_TRANG }} aria-hidden />
            <h1 className="page-title">7. Tồn kho vật tư</h1>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Chốt hằng tuần
            {ngayMoiNhat && <> · mới nhất {nhanNgay(ngayMoiNhat)}</>}
            {capNhat && <> · cập nhật lúc {capNhat}</>}
            {trangThai.loai === 'dang_tai' && <> · đang tải…</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PhanDoan nhan="Chỉ số" giaTri={chiSo} onChon={setChiSo} tat={!coSo || !!dangXuat}
            chon={[['giaTri', 'Giá trị'], ['soMa', 'Số mã']]} />
          <PhanDoan nhan="Mốc thời gian" giaTri={moc} onChon={setMoc} tat={!coSo || !!dangXuat}
            chon={[['tuan', 'Theo tuần'], ['thang', 'Theo tháng']]} />
          <PhanDoan nhan="Khoảng thời gian" giaTri={khoang} onChon={setKhoang} tat={!coSo || !!dangXuat}
            chon={[['3t', '3 tháng'], ['6t', '6 tháng'], ...dsNam.map((n): [KhoangXem, string] => [`nam${n}`, String(n)]), ['tat_ca', 'Tất cả']]} />
          <div className="relative" ref={menuRef}>
            <button type="button" onClick={() => setMoMenu(v => !v)} disabled={!coSo || !!dangXuat || dangTaiLoc}
              aria-haspopup="menu" aria-expanded={moMenu}
              title={dangTaiLoc ? 'Đang tính số theo bộ lọc tên — chờ xong rồi xuất' : 'Xuất báo cáo theo đúng chế độ đang xem (tháng / tuần, khoảng, giá trị / số mã, bộ lọc tên)'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <Download size={15} />
              {dangXuat === 'pdf' ? 'Đang dựng PDF…' : dangXuat === 'xlsx' ? 'Đang xuất Excel…' : 'Xuất báo cáo'}
              <ChevronDown size={14} className="text-slate-400" />
            </button>
            {moMenu && (
              <div role="menu" aria-label="Xuất báo cáo"
                className="absolute right-0 z-30 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                <button type="button" role="menuitem" onClick={xuatPdf}
                  className="flex w-full items-start gap-2.5 rounded-md px-3 py-2 text-left hover:bg-slate-50">
                  <FileText size={18} className="mt-0.5 shrink-0 text-red-600" />
                  <span>
                    <span className="block text-sm font-medium text-slate-800">Báo cáo PDF</span>
                    <span className="block text-xs text-slate-500">Số tổng, bảng tổng kết, biểu đồ + tóm tắt từng nhóm</span>
                  </span>
                </button>
                <button type="button" role="menuitem" onClick={xuatExcel}
                  className="flex w-full items-start gap-2.5 rounded-md px-3 py-2 text-left hover:bg-slate-50">
                  <FileSpreadsheet size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                  <span>
                    <span className="block text-sm font-medium text-slate-800">Excel</span>
                    <span className="block text-xs text-slate-500">Sheet Báo cáo (tổng kết từng nhóm) + biểu đồ Excel (tồn, doanh thu, dự báo) + số liệu từng kỳ</span>
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-6">
        {trangThai.loai === 'dang_tai' && (
          <div aria-busy="true" aria-label="Đang tải số liệu tồn kho vật tư" className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-[92px] animate-pulse rounded-xl bg-slate-200/70" />)}
            </div>
            <div className="grid grid-cols-1 gap-4">
              {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[380px] animate-pulse rounded-xl bg-slate-200/70" />)}
            </div>
          </div>
        )}

        {trangThai.loai === 'loi' && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
            <AlertTriangle className="h-9 w-9 text-amber-500" />
            <p className="text-sm font-medium text-slate-700">Không tải được số liệu tồn kho vật tư</p>
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
            <p className="text-sm font-semibold text-slate-700">{trangThai.thongBao || 'Bạn chưa có quyền xem tồn kho vật tư'}</p>
            <p className="text-xs text-slate-500">Nhờ quản trị cấp quyền "7. Tồn kho vật tư" (nhóm Quản trị — Biểu đồ).</p>
          </div>
        )}

        {trangThai.loai === 'xong' && !coSo && (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
            Chưa có dữ liệu tồn kho vật tư
          </div>
        )}

        {loiXuat && (
          <p role="alert" className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertTriangle size={15} className="shrink-0" /> {loiXuat}
            <button type="button" onClick={() => setLoiXuat(null)} aria-label="Đóng thông báo" className="ml-auto rounded p-0.5 hover:bg-red-100"><X size={14} /></button>
          </p>
        )}

        {coSo && tong && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <OSo nhan="Tổng tồn vật tư" giaTri={dinhDangChiSo(tong.tong, chiSo)}
                phu={`chốt ${nhanNgay(tong.ngayChot)} · ${tong.soNhom} nhóm`} />
              <OSo nhan={nhanTruoc}
                giaTri={<ChuChenh v={tong.truoc?.chenh ?? null} pt={null} chiSo={chiSo} />}
                phu={tong.truoc ? `${dinhDangPt(tong.truoc.chenhPt, true)} · so với ${moc === 'tuan' ? nhanNgay(tong.truoc.ngayChot) : `${tong.truoc.nhan} (chốt ${nhanNgay(tong.truoc.ngayChot)})`}` : 'chưa có lần chốt trước trong khoảng'} />
              <OSo nhan="So với đầu khoảng"
                giaTri={<ChuChenh v={tong.dau?.chenh ?? null} pt={null} chiSo={chiSo} />}
                phu={tong.dau ? `${dinhDangPt(tong.dau.chenhPt, true)} · từ ${moc === 'tuan' ? nhanNgay(tong.dau.ngayChot) : tong.dau.nhan}` : 'khoảng chỉ có 1 lần chốt'} />
              <OSo nhan="Chậm luân chuyển > 3 tháng" giaTri={tong.thieuCham ? '—' : dinhDangChiSo(tong.cham, chiSo)}
                phu={tong.thieuCham ? 'lần chốt cuối thiếu cột chậm luân chuyển' : `${dinhDangPt(tong.ptCham)} ${giaTri ? 'tổng giá trị tồn' : 'tổng số mã'}`} />
            </div>

            {dtKH && moc === 'thang' && chuoiThangDu[0]?.diem.length ? (
              <BieuDoDoanhSo dt={dtKH} thangHienTai={thangHienTai}
                tuThang={tuThangXem ?? chuoiThangDu[0].diem[0].khoa}
                denThang={(duBaoToanKho?.diem.length ? duBaoToanKho.diem[duBaoToanKho.diem.length - 1].khoa : null) ?? denThangXem ?? thangHienTai} />
            ) : null}

            <p className="flex items-start gap-1.5 text-xs text-slate-500">
              <Info size={13} className="mt-0.5 shrink-0" />
              <span>
                Mỗi điểm là tồn tại 1 lần chốt (không cộng dồn các tuần){moc === 'thang' && '; theo tháng lấy lần chốt cuối tháng'}.
                Đường xám nét đứt là phần chậm luân chuyển &gt; 3 tháng. <span style={{ color: MAU_TANG }}>▲ Tăng</span> = vốn đọng thêm,{' '}
                <span style={{ color: MAU_GIAM }}>▼ giảm</span> = tồn giảm. Bấm 1 điểm để xem từng mã tăng / giảm / mới / đã hết.
                {dtKH && moc === 'thang' && (
                  <> Biểu đồ doanh số phía trên là của cả công ty; đường nét đứt sau "Dự báo →" ở mỗi nhóm là tồn dự báo
                    theo kế hoạch doanh thu, vùng mờ là sai số thường gặp khi kiểm lại trên các tháng đã qua.</>
                )}
                {doanhThu?.loi && <span className="text-amber-700"> Không tải được doanh thu tháng ({doanhThu.loi}).</span>}
                {nhomDangLoc.length > 0 && (
                  <span className="font-medium text-slate-700">
                    {' '}Đang lọc tên vật tư ở {nhomDangLoc.length === 1 ? `biểu đồ ${tenNhomGon(nhomDangLoc[0])}` : `${nhomDangLoc.length} biểu đồ`} — 4 số tổng phía trên vẫn tính cho toàn kho.
                  </span>
                )}
                {ngayThieu.length > 0 && (
                  <span className="text-amber-700">
                    {' '}Lần chốt {ngayThieu.map(nhanNgay).join(', ')}: file nguồn không có cột chậm luân chuyển — đường xám nối qua, chấm rỗng "thiếu số" đánh dấu chỗ thiếu.
                  </span>
                )}
              </span>
            </p>

            {moc === 'thang' && duBaoToanKho && duBaoToanKho.diem.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 sm:px-5">
                <CauDuBao duBao={catDuBao(duBaoToanKho, null, tuThangXem)!} ten="Toàn kho" />
              </div>
            )}

            <div className="grid grid-cols-1 gap-4">
              {chuoiHien.map(c => (
                <TheNhom key={c.nhom} chuoi={c} chiSo={chiSo} moc={moc} xuat={dangChup}
                  loc={locTheoNhom[c.nhom] ?? null} ketQuaLoc={ketQuaLoc[c.nhom]} onLoc={l => apDungLoc(c.nhom, l)}
                  phienBan={duLieu?.capNhat ?? ''} khoaLoc={!!dangXuat} doanhThu={dtKH} duBao={duBaoTheoNhom[c.nhom] ?? null} thangHienTai={thangHienTai} tuThang={tuThangXem}
                  onChon={(nhom, d, truoc) => setMoChiTiet({
                    nhom, ngayChot: d.ngayChot, ngaySoVoi: truoc?.ngayChot ?? null, soVoiThang: moc === 'thang' && !!truoc,
                    thieuCham: d.thieuCham, loc: locHieuLuc[nhom],
                  })} />
              ))}
            </div>
          </>
        )}
      </div>

      {moChiTiet && (
        <ChiTietModal key={`${moChiTiet.nhom}|${moChiTiet.ngayChot}|${moChiTiet.ngaySoVoi ?? ''}|${moChiTiet.loc?.ten.join('\u0001') ?? ''}`} mo={moChiTiet} onDong={() => setMoChiTiet(null)} />
      )}
    </div>
  );
};

export default TonKhoVatTu;
