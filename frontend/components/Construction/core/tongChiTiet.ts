// ============================================================================
// Hàm thuần cho các view con của công trình (cửa sổ chi tiết thẻ, danh sách hạng mục, chi tiết HEX):
// tổng dòng TỔNG của từng bảng con phải bằng số vừa bấm ở view cha. Đơn vị tiền: TRIỆU ĐỒNG.
// ============================================================================
import type { Rec } from './banGhiCongTrinh';
import { khoCua, type Kho, type MucBop } from './bopPivot';
import { fmtQty } from '../../../utils/format';
import type { QcEntry } from '../../../utils/qcParse';

// ---------------------------------------------------------------------------
// Lịch sử nhập kho của 1 HEX: "11/06/2026 # Đơn giá: … # SL NK: 20 # TT NK: 524.8 # ghi chú"
// Số trong ghi chú viết kiểu EN (dấu chấm là thập phân), không dùng parseNumber.
// ---------------------------------------------------------------------------
export const soGhiChu = (v: string): number => {
  const n = Number(String(v).replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export interface LanNhapKho { date: string; sl: number; tien: number; note: string }

export const docLichSuNhap = (text: unknown): LanNhapKho[] =>
  String(text ?? '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const parts = l.split('#').map(p => p.trim());
    const pick = (label: string) => parts.find(p => p.toUpperCase().startsWith(label))?.split(':').slice(1).join(':').trim() ?? '';
    const note = parts.filter((p, i) => i > 0 && !/^(ĐƠN GIÁ|SL NK|TT NK)\s*:/i.test(p)).join(' · ');
    return { date: parts[0], sl: soGhiChu(pick('SL NK')), tien: soGhiChu(pick('TT NK')), note };
  });

export const tongLichSuNhap = (ds: LanNhapKho[]) => ds.reduce((a, x) => ({ sl: a.sl + x.sl, tien: a.tien + x.tien }), { sl: 0, tien: 0 });

export const tongQc = (ds: Pick<QcEntry, 'checked' | 'pass' | 'fail'>[]) =>
  ds.reduce((a, x) => ({ checked: a.checked + x.checked, pass: a.pass + x.pass, fail: a.fail + x.fail }), { checked: 0, pass: 0, fail: 0 });

// Sai số số lượng (số thực từ DB): dưới ngưỡng coi như 0
export const QTY_EPS = 1e-6;

/** Kho theo số lượng của 1 HEX: cùng công thức khoCua của bảng BOP (đã xuất giữ gốc, tách xuất vượt nhập, chênh không âm) */
export const khoSoLuong = (nhap: unknown, xuat: unknown, ton: unknown): Kho =>
  khoCua({ inv: Math.max(Number(nhap) || 0, 0), xuat: Math.max(Number(xuat) || 0, 0), tonKho: Math.max(Number(ton) || 0, 0) });

/** Dòng tóm tắt kho: chỉ ghi phần khác 0 */
export const ghiChuKho = (k: Kho, dvt = ''): string => {
  const phan = ([['đã xuất', k.xk], ['tồn kho', k.ton], ['chênh', k.chenh], ['xuất vượt nhập', k.xv]] as const)
    .filter(([, v]) => v > QTY_EPS).map(([t, v]) => `${t} ${fmtQty(v)}`);
  return phan.length ? `${phan.join(' · ')}${dvt ? ` ${dvt}` : ''}` : '';
};

// ---------------------------------------------------------------------------
// Tổng 1 danh sách hạng mục (dòng TỔNG của bảng hạng mục)
// ---------------------------------------------------------------------------
export interface TongHangMuc extends Kho { n: number; total: number; remain: number }

export const tongHangMuc = (ds: Pick<MucBop, 'total' | 'remain' | 'inv' | 'xuat' | 'tonKho'>[]): TongHangMuc => {
  const t: TongHangMuc = { n: 0, total: 0, remain: 0, nk: 0, xk: 0, ton: 0, chenh: 0, xv: 0 };
  for (const i of ds) {
    const k = khoCua(i);
    t.n++; t.total += i.total; t.remain += i.remain;
    t.nk += k.nk; t.xk += k.xk; t.ton += k.ton; t.chenh += k.chenh; t.xv += k.xv;
  }
  return t;
};

// ---------------------------------------------------------------------------
// Cửa sổ chi tiết thẻ (trang Báo cáo tiến độ công trình): gom các dòng của số vừa bấm theo công trình.
// HỦY = 0 trong tổng, đếm và trị giá riêng; tồn kho vẫn gồm HỦY.
// ---------------------------------------------------------------------------
export type TieuDiem = 'items' | 'total' | 'done' | 'remain' | 'exported' | 'stock' | 'unmatched' | 'xuatVuot' | 'stockCut';

interface SoChiTiet {
  items: number; huyN: number; totalHuy: number; total: number; done: number;
  exported: number; xuatVuot: number; stock: number; unmatched: number; stockCut: number;
}
export interface DongChiTiet extends SoChiTiet { name: string; pms: Set<string> }
export interface TomTatChiTiet extends SoChiTiet { cts: number; rows: number; projects: DongChiTiet[] }

const soRong = (): SoChiTiet => ({ items: 0, huyN: 0, totalHuy: 0, total: 0, done: 0, exported: 0, xuatVuot: 0, stock: 0, unmatched: 0, stockCut: 0 });
const cong = (e: SoChiTiet, r: Rec) => {
  if (r.status === 'HỦY') { e.huyN++; e.totalHuy += r.totalHuy; } else e.items++;
  e.total += r.total; e.done += r.done; e.exported += r.exported; e.xuatVuot += r.xuatVuot;
  e.stock += r.stock; e.unmatched += r.unmatched; e.stockCut += r.stockCut;
};

export const giaTriTieuDiem = (p: SoChiTiet, f: TieuDiem): number => (f === 'remain' ? p.total - p.done : p[f]);

export function tomTatChiTiet(rows: Rec[], focus: TieuDiem): TomTatChiTiet {
  const cts = new Set<string>();
  const tong = soRong();
  const m = new Map<string, DongChiTiet>();
  for (const r of rows) {
    cts.add(r.ctKey);
    cong(tong, r);
    let e = m.get(r.ct);
    if (!e) { e = { ...soRong(), name: r.ct, pms: new Set() }; m.set(r.ct, e); }
    e.pms.add(r.pm);
    cong(e, r);
  }
  const projects = [...m.values()].sort((a, b) => giaTriTieuDiem(b, focus) - giaTriTieuDiem(a, focus) || b.items - a.items);
  return { ...tong, cts: cts.size, rows: rows.length, projects };
}
