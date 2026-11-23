// ============================================================================
// HÀM THUẦN trang Xuất tiêu hao (/vat-tu/tieu-hao) — test: xuLyTieuHao.test.ts
// Số do máy chủ gộp (backend/src/routes/vatTu.ts, bảng xuat_tieu_hao_vt) — ở đây chỉ chọn tháng, biểu đồ chồng, định
// dạng, khoá bấm, Excel. Tiêu hao = 261 − 262 (số dương), hao hụt = Z14 (riêng). Tiền triệu đồng.
// ============================================================================
import type { BoLocTieuHao, DongChungTu, DongTieuHao, MvtTieuHao, OTieuHao, TheoTieuHao } from '../../services/vatTuApi';
import { fmtInt } from '../../utils/format';
import { fmtNgay, fmtTrieu, nhanThangNgan } from './xuLyDatMua';

/** Số tháng hiện ở bảng (cột tháng) và biểu đồ */
export const SO_THANG_BANG = 6;
export const SO_THANG_BIEU_DO = 18;
/** Biểu đồ chồng: số nhóm lớn nhất vẽ riêng, còn lại gộp "Khác" */
export const SO_NHOM_BIEU_DO = 8;
export const KHOA_KHAC = '__khac';

/** Màu chồng (8 nhóm + Khác xám) */
export const MAU_NHOM = ['#0ea5e9', '#10b981', '#f59e0b', '#6366f1', '#ef4444', '#14b8a6', '#a855f7', '#84cc16'];
export const MAU_KHAC = '#94a3b8';

/** n tháng cuối của danh sách tháng tăng dần */
export const thangCuoi = (thang: string[], n = SO_THANG_BANG): string[] => thang.slice(Math.max(0, thang.length - n));

/** Số của 1 ô theo chế độ: có quyền giá => giá trị tiêu hao (triệu); không => số dòng chứng từ tiêu hao. Mã => SL.
 *  haoHut = true (đang lọc Loại xuất = Z14): lấy phần hao hụt — số trong ô luôn khớp danh sách chứng từ khi bấm. */
export type CheDoO = 'giaTri' | 'soDong' | 'soLuong';
export const soCuaO = (o: OTieuHao | undefined, cheDo: CheDoO, haoHut = false): number | null => {
  if (!o) return null;
  if (cheDo === 'giaTri') return haoHut ? o.hh : o.th;
  if (cheDo === 'soLuong') return haoHut ? o.slHh : o.sl;
  return haoHut ? o.sdHh : o.sdTh;
};

/** Loại xuất khi bấm 1 ô tiêu hao / hao hụt: danh sách chứng từ chỉ gồm đúng loại đã cộng vào ô */
export const mvtCuaO = (haoHut: boolean): MvtTieuHao => (haoHut ? 'z14' : 'tieuHao');

/** Chữ của 1 ô: 0 / trống => ''; giá trị theo fmtTrieu; SL tới 3 số lẻ (âm khi hoàn trả nhiều hơn xuất) */
export const fmtSoO = (v: number | null | undefined, cheDo: CheDoO): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  if (cheDo === 'giaTri') return fmtTrieu(v);
  if (cheDo === 'soLuong') return Math.abs(v) < 0.0005 ? '' : v.toLocaleString('en-US', { maximumFractionDigits: 3 });
  return v ? fmtInt(v) : '';
};

/** % 1 số lẻ; null => '—' */
export const fmtPt = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** Số tháng đủ dùng: < 1 => '< 1' (tô đỏ ở bảng); ≥ 100 => '≥ 100'; null => '' */
export const fmtThangDuDung = (v: number | null | undefined): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  if (v < 1) return v <= 0 ? '0' : '< 1';
  if (v >= 100) return '≥ 100';
  return v.toLocaleString('en-US', { maximumFractionDigits: 1 });
};

/** Mức cảnh báo số tháng đủ dùng: < 1 đỏ, < 2 cam */
export const mucThangDuDung = (v: number | null | undefined): 'do' | 'cam' | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : v < 1 ? 'do' : v < 2 ? 'cam' : null;

/** % thay đổi so với kỳ trước; kỳ trước ≤ 0 / thiếu => null */
export const phanTramDoi = (nay: number | null, truoc: number | null): number | null =>
  nay === null || truoc === null || truoc <= 0 ? null : ((nay - truoc) / truoc) * 100;

/** Khoảng 3 tháng TB: ['2026-08','2026-09','2026-10'] => 'T8–T10/26' */
export const nhanKhoangTb3 = (thang: string[]): string => {
  if (!thang.length) return '';
  const a = thang[0], b = thang[thang.length - 1];
  return a.slice(0, 4) === b.slice(0, 4)
    ? `T${Number(a.slice(5, 7))}–T${Number(b.slice(5, 7))}/${b.slice(2, 4)}`
    : `${nhanThangNgan(a)}–${nhanThangNgan(b)}`;
};

/** Một cột biểu đồ chồng: tháng + giá trị từng nhóm (khoá = mã nhóm, Khác = KHOA_KHAC) */
export type CotBieuDo = { thang: string; nhan: string; tong: number } & Record<string, number | string>;

/**
 * Biểu đồ chồng theo nhóm: chọn SO_NHOM_BIEU_DO nhóm có tổng lớn nhất (trong các tháng vẽ), còn lại gộp "Khác".
 * Nhóm có tổng ≤ 0 (chỉ hoàn trả) không vẽ riêng.
 */
export const duLieuBieuDo = (
  dong: DongTieuHao[], thang: string[], cheDo: CheDoO, soNhom = SO_NHOM_BIEU_DO, haoHut = false,
): { nhom: { khoa: string; ten: string; mau: string }[]; cot: CotBieuDo[] } => {
  const ve = thangCuoi(thang, SO_THANG_BIEU_DO);
  const so = (o: OTieuHao | undefined) => soCuaO(o, cheDo, haoHut) ?? 0;
  const tongNhom = dong.map(d => ({ d, t: ve.reduce((a, m) => a + so(d.thang[m]), 0) }))
    .filter(x => x.t > 0)
    .sort((a, b) => b.t - a.t || a.d.khoa.localeCompare(b.d.khoa));
  const chon = tongNhom.slice(0, soNhom).map(x => x.d);
  const khoaChon = new Set(chon.map(d => d.khoa));
  const coKhac = dong.some(d => !khoaChon.has(d.khoa) && ve.some(m => so(d.thang[m]) !== 0));
  const nhom = chon.map((d, i) => ({ khoa: d.khoa, ten: d.ten, mau: MAU_NHOM[i % MAU_NHOM.length] }));
  if (coKhac) nhom.push({ khoa: KHOA_KHAC, ten: 'Khác', mau: MAU_KHAC });
  const cot = ve.map(m => {
    const c: CotBieuDo = { thang: m, nhan: nhanThangNgan(m), tong: 0 };
    let khac = 0;
    for (const d of dong) {
      const v = so(d.thang[m]);
      if (khoaChon.has(d.khoa)) c[d.khoa] = v;
      else khac += v;
      c.tong += v;
    }
    if (coKhac) c[KHOA_KHAC] = khac;
    return c;
  });
  return { nhom, cot };
};

/** Bộ lọc khi bấm 1 dòng gộp (theo `theo`): thêm khoá của dòng; mã => trả mã + ĐVT riêng (tham số chi tiết) */
export const locCuaDong = (
  loc: BoLocTieuHao, theo: TheoTieuHao, khoa: string,
): { loc: BoLocTieuHao; ma?: string; dvt?: string } => {
  switch (theo) {
    case 'nhom': return { loc: { ...loc, nhom: [khoa] } };
    case 'ct': return { loc: { ...loc, ct: [khoa] } };
    case 'hex': return { loc: { ...loc, hex: [khoa] } };
    case 'xuong': return { loc: { ...loc, xuong: [khoa] } };
    case 'thang': return { loc: { ...loc, tu: khoa, den: khoa } };
    case 'ma': {
      const [ma, dvt] = khoa.split('|');
      return { loc, ma: ma || '-', dvt: dvt || '-' };
    }
  }
};

/** Khoảng tháng khi chọn 1 tháng: GIAO với khoảng đang lọc (không nới rộng) — null khi không giao */
export const giaoThang = (loc: BoLocTieuHao, thang: string): { tu: string; den: string } | null => {
  if ((loc.tu && thang < loc.tu) || (loc.den && thang > loc.den)) return null;
  return { tu: thang, den: thang };
};

export const NHAN_MVT: Record<string, string> = { '261': '261 Xuất SX', '262': '262 Hoàn trả', Z14: 'Z14 Hao hụt', Z15: 'Z15 Hoàn hao hụt' };

/** Ghi chú khi có tháng chưa trừ hoàn trả 262 (file MB51 cũ chỉ xuất 261 + Z14): '' = không cần */
export const ghiChu262 = (thang262Tu: string | null | undefined, thangCoSo: string[]): string => {
  const cu = thangCoSo.filter(m => !thang262Tu || m < thang262Tu);
  if (!cu.length) return '';
  const a = cu[0], b = cu[cu.length - 1];
  const khoang = a === b ? nhanThangNgan(a) : `${nhanThangNgan(a)}–${nhanThangNgan(b)}`;
  return `${khoang}: file SAP chưa có dòng hoàn trả 262 — tiêu hao các tháng này CHƯA trừ hoàn trả (cao hơn thực một ít)`;
};

/** Cột danh sách chứng từ */
export type CotChungTu = { khoa: keyof DongChungTu; nhan: string; kieu: 'chu' | 'so' | 'ma' | 'ngay' | 'tien' | 'mvt'; gia?: boolean; rong?: string };
export const COT_CHUNG_TU: CotChungTu[] = [
  { khoa: 'ngay', nhan: 'Ngày hạch toán', kieu: 'ngay' },
  { khoa: 'mvt', nhan: 'Loại xuất', kieu: 'mvt' },
  { khoa: 'soCt', nhan: 'Số chứng từ', kieu: 'ma' },
  { khoa: 'dong', nhan: 'Dòng', kieu: 'ma' },
  { khoa: 'ma', nhan: 'Mã VT (SAP)', kieu: 'ma' },
  { khoa: 'tenVatTu', nhan: 'Tên vật tư', kieu: 'chu', rong: 'min-w-[16rem]' },
  { khoa: 'nhom', nhan: 'Nhóm SAP', kieu: 'ma' },
  { khoa: 'sl', nhan: 'SL xuất', kieu: 'so' },
  { khoa: 'dvt', nhan: 'ĐVT', kieu: 'chu' },
  { khoa: 'giaTri', nhan: 'Giá trị (triệu)', kieu: 'tien', gia: true },
  { khoa: 'maCt', nhan: 'Mã CT', kieu: 'chu' },
  { khoa: 'hex', nhan: 'HEX', kieu: 'chu' },
  { khoa: 'phanLoai', nhan: 'Phân loại SP', kieu: 'chu' },
  { khoa: 'orderSx', nhan: 'Lệnh SX', kieu: 'ma' },
  { khoa: 'salesOrder', nhan: 'Sales order', kieu: 'ma' },
  { khoa: 'wbs', nhan: 'WBS', kieu: 'chu' },
  { khoa: 'xuong', nhan: 'Xưởng', kieu: 'chu' },
  { khoa: 'plant', nhan: 'Plant', kieu: 'ma' },
  { khoa: 'sloc', nhan: 'Kho (SLoc)', kieu: 'ma' },
  { khoa: 'nguoi', nhan: 'Người hạch toán', kieu: 'chu' },
  { khoa: 'nguonNhom', nhan: 'Nguồn nhóm', kieu: 'chu' },
  { khoa: 'nguonFile', nhan: 'File nguồn', kieu: 'chu' },
];

export const cotChungTuHien = (coGia: boolean): CotChungTu[] => COT_CHUNG_TU.filter(c => coGia || !c.gia);

/** Chữ hiển thị 1 ô chứng từ */
export const chuOChungTu = (c: CotChungTu, d: DongChungTu): string => {
  const v = d[c.khoa];
  if (v === null || v === undefined || v === '') return '';
  if (c.kieu === 'ngay') return fmtNgay(String(v));
  if (c.kieu === 'tien') return fmtTrieu(Number(v)) || '0';
  if (c.kieu === 'so') return Number(v).toLocaleString('en-US', { maximumFractionDigits: 3 });
  if (c.kieu === 'mvt') return NHAN_MVT[String(v)] ?? String(v);
  return String(v);
};

/** Bảng Excel chứng từ: số giữ kiểu số, ngày dd/mm/yyyy */
export const bangExcelChungTu = (dong: DongChungTu[], coGia: boolean): (string | number | null)[][] => {
  const cot = cotChungTuHien(coGia);
  return [
    cot.map(c => c.nhan),
    ...dong.map(d => cot.map(c => {
      const v = d[c.khoa];
      if (v === null || v === undefined || v === '') return null;
      if (c.kieu === 'ngay') return fmtNgay(String(v));
      if (c.kieu === 'so' || c.kieu === 'tien') { const n = Number(v); return Number.isFinite(n) ? n : null; }
      if (c.kieu === 'mvt') return NHAN_MVT[String(v)] ?? String(v);
      return String(v);
    })),
  ];
};
