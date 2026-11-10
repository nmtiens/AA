// ============================================================================
// Số của cửa sổ chi tiết trang Tổng quan: dùng đúng công thức view cha để tổng trong cửa sổ bằng số vừa bấm.
// HỦY = 0 trong mọi tổng (hiện riêng), tồn kho vẫn gồm hàng HỦY còn trong kho.
// ============================================================================
import type { DataRow } from '../../../types';
import { doneValue, laHuy, remainValue } from '../../../utils/productionMetrics';
import { khoCua } from '../../Construction/core/bopPivot';
import { parseNumber } from '../utils/numberParsers';

export interface KhoaSoHex {
  ipoKey?: string;
  triGiaKey: string;
  phieuKey: string;
  nhapKhoKey: string;
  xuatKhoKey?: string;
  tonKhoKey?: string;
}

export interface SoHex {
  huy: boolean;
  triGia: number;
  /** Trị giá gốc của đơn HỦY (đơn khác = 0) */
  triGiaHuy: number;
  phieu: number;
  nhap: number;
  conLai: number;
  xuat: number;
  ton: number;
  chenh: number;
  xv: number;
}

export function soHex(row: DataRow, k: KhoaSoHex): SoHex {
  const huy = laHuy(row[k.ipoKey ?? 'tinh_trang_ipo']);
  const goc = parseNumber(row[k.triGiaKey]);
  const nk = parseNumber(row[k.nhapKhoKey]);
  const xuatGoc = Math.max(parseNumber(row[k.xuatKhoKey ?? 'thanh_tien_xuat_kho_luy_ke']), 0);
  const tonGoc = Math.max(parseNumber(row[k.tonKhoKey ?? 'thanh_tien_ton_kho_hien_tai']), 0);
  if (huy) {
    const ton = Math.min(tonGoc, Math.max(Math.max(nk, 0) - xuatGoc, 0), Math.max(goc, 0));
    return { huy, triGia: 0, triGiaHuy: goc, phieu: 0, nhap: 0, conLai: 0, xuat: 0, ton, chenh: 0, xv: 0 };
  }
  const nhap = doneValue(goc, nk);
  const kho = khoCua({ inv: nhap, xuat: xuatGoc, tonKho: tonGoc });
  return {
    huy, triGia: goc, triGiaHuy: 0, phieu: parseNumber(row[k.phieuKey]), nhap, conLai: remainValue(goc, nk),
    xuat: kho.xk, ton: kho.ton, chenh: kho.chenh, xv: kho.xv,
  };
}

export interface TongHex extends Omit<SoHex, 'huy' | 'triGiaHuy'> {
  /** Số hạng mục không HỦY */
  n: number;
  /** Số hạng mục HỦY + trị giá gốc của chúng */
  huy: { n: number; triGia: number };
}

export function tongHex(rows: DataRow[], k: KhoaSoHex): TongHex {
  const t: TongHex = { n: 0, huy: { n: 0, triGia: 0 }, triGia: 0, phieu: 0, nhap: 0, conLai: 0, xuat: 0, ton: 0, chenh: 0, xv: 0 };
  for (const row of rows) {
    const s = soHex(row, k);
    if (s.huy) { t.huy.n += 1; t.huy.triGia += s.triGiaHuy; } else t.n += 1;
    t.triGia += s.triGia; t.phieu += s.phieu; t.nhap += s.nhap; t.conLai += s.conLai;
    t.xuat += s.xuat; t.ton += s.ton; t.chenh += s.chenh; t.xv += s.xv;
  }
  return t;
}

/** Cột số kho luôn hiện, kể cả khi cấu hình cột đã lưu từ trước chưa có chúng */
export const COT_KHO_HEX = ['conLai', 'daXuat', 'tonKho', 'chenh', 'xuatVuot'] as const;

/** Chèn các cột kho sau cột Đã nhập; có giá trị kỳ thì thêm cột đó trước cột số đầu tiên */
export function chenCotSoHex(cot: string[], coKy: boolean): string[] {
  const thieu: string[] = COT_KHO_HEX.filter(k => !cot.includes(k));
  const i = cot.indexOf('thanhTienKho');
  const ds = i < 0 ? [...cot, ...thieu] : [...cot.slice(0, i + 1), ...thieu, ...cot.slice(i + 1)];
  if (!coKy) return ds;
  const dau = ds.findIndex(k => k === 'triGia' || k === 'thanhTienPhieu' || k === 'thanhTienKho');
  return dau < 0 ? [...ds, 'giaTriKy'] : [...ds.slice(0, dau), 'giaTriKy', ...ds.slice(dau)];
}

/** Cộng cột giá trị của bảng nguồn theo từng HEX */
export function gomGiaTriTheoHex(rows: Record<string, unknown>[], cot: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const hex = String(r.hex ?? '').trim();
    if (hex) out[hex] = (out[hex] ?? 0) + parseNumber(r[cot] as string | number | null | undefined);
  }
  return out;
}

/** P001 / "15. CHƯA TRIỂN KHAI" là chờ bản vẽ, không phải nghẽn trong xưởng */
export const laChoBanVe = (name: string): boolean =>
  /^P001(?![0-9])/i.test(name.trim()) || name.toUpperCase().includes('15. CHƯA TRIỂN KHAI');

/** Điểm nghẽn đầu trang = dòng đầu top sản xuất của khối Điểm nghẽn */
export const diemNghenDau = <T extends { name: string }>(top: T[]): T | undefined => top.find(b => !laChoBanVe(b.name));

/** Bỏ dòng của hạng mục HỦY (tính theo cột Tình trạng IPO của bảng sản xuất) */
export const boDongHexHuy = <T extends Record<string, unknown>>(rows: T[], hexKey: string, huy: ReadonlySet<string>): T[] =>
  (huy.size === 0 ? rows : rows.filter(r => !huy.has(String(r[hexKey] ?? '').trim())));

/** Tồn kho đếm mã có giá trị khác 0, cùng cách đếm của số trên thẻ */
export const dongTonKhac0 = <T extends Record<string, unknown>>(rows: T[]): T[] =>
  rows.filter(r => parseNumber(r.gia_tri as string | number | null | undefined) !== 0);

/** Cộng số lượng khi mọi dòng cùng ĐVT; khác ĐVT thì không cộng được (null) */
export function tongCungDvt<T>(rows: T[], dvt: (r: T) => unknown, so: (r: T) => unknown): number | null {
  const dv = new Set(rows.map(r => String(dvt(r) ?? '').trim().toUpperCase()));
  if (dv.size !== 1) return null;
  return rows.reduce((a, r) => a + parseNumber(so(r) as string | number | null | undefined), 0);
}

/** Tỷ lệ NK / KH; chưa có KH thì không có tỷ lệ (null), khác với 0% */
export const tyLeKh = (nk: number, kh: number): number | null => (kh > 0 ? (nk / kh) * 100 : null);

/** dd/mm/yyyy từ chuỗi ngày của API; chuỗi lạ giữ nguyên */
export const ngayChuoi = (v: string | null | undefined): string => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
