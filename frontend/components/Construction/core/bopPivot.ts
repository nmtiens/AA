// ============================================================================
// LÕI BẢNG "CÔNG ĐOẠN × KHO" (BOP) — hàm thuần (không React, không trình duyệt), dùng chung:
//   - tab BOP của cửa sổ công trình (ProjectHealthTabs.BopTab: dòng = nhóm sản phẩm / xưởng);
//   - bảng "Tình trạng đơn hàng theo Công trình" trang Tổng quan (dòng = công trình; máy chủ tính sẵn qua
//     Dashboard/core/tongQuanSanXuat.ts nên file này chỉ được kéo theo file thuần).
// Cột: công đoạn theo thứ tự BOP, gom dưới nhóm (Chưa triển khai / Chưa tính phiếu / Đang trên chuyền / Nhập kho
// chưa đủ) + TỔNG + Kho lũy kế (Đã nhập P022 · Đã xuất P025 · Tồn kho · Chênh).
// ============================================================================
import type { DataRow } from '../../../types';
import type { RemainBucket } from '../../Dashboard/core/tongQuanSanXuat';
import { remainBucketOf } from '../../Dashboard/core/tongQuanSanXuat';
import { extractStage } from '../../Dashboard/core/stages';
import { parseNumber } from '../../Dashboard/utils/numberParsers';
import { BOP_STAGE_ORDER, stageRank, isQtyComplete, remainValue, doneValue } from '../../../utils/productionMetrics';
import { formatTrieuAsTy } from '../../../utils/money';
import { fmtInt } from '../../../utils/format';

/** Phần của 1 hạng mục mà bảng BOP cần (HexInfo của cửa sổ công trình có đủ các trường này) */
export interface MucBop {
  stage: string | null;
  bucket: RemainBucket | null; // nhóm của phần giá trị còn lại (null = không còn giá trị chưa nhập)
  open: boolean;               // còn theo dõi: chưa nhập đủ giá trị và chưa nhập đủ số lượng, hoặc trị giá 0
  total: number;               // triệu đồng
  inv: number;                 // đã nhập kho (triệu, chặn ≤ trị giá)
  xuat?: number;               // đã xuất kho lũy kế (triệu)
  tonKho?: number;             // tồn kho hiện tại (triệu); undefined = dữ liệu không có cột
  remain: number;              // trị giá − đã nhập (triệu)
}

export type BopMetric = 'count' | 'remain' | 'total';
/** Kho lũy kế: đã nhập (P022), đã xuất (P025), tồn kho hiện tại, chênh = nhập − xuất − tồn (không rõ đi đâu) */
export type Kho = { nk: number; xk: number; ton: number; chenh: number };
export type KhoCot = keyof Kho;
export const KHO_COT: KhoCot[] = ['nk', 'xk', 'ton', 'chenh'];

// Nhóm công đoạn — cùng tên / màu với thẻ BOP ở trang tổng quan công trình
export const BOP_GROUP: Record<RemainBucket, { label: string; dot: string }> = {
  notDeployed: { label: 'Chưa triển khai', dot: 'bg-slate-400' },
  p002: { label: 'Chưa tính phiếu', dot: 'bg-sky-400' },
  onLine: { label: 'Đang trên chuyền', dot: 'bg-amber-400' },
  shortfall: { label: 'Nhập kho chưa đủ', dot: 'bg-violet-400' },
};

export const KHONG_RO_CONG_DOAN = '(Không rõ)';
export const stageOfBop = (i: Pick<MucBop, 'stage'>) => i.stage ?? KHONG_RO_CONG_DOAN;
/** Tên cột công đoạn: P022 / P025 là cột công đoạn chỉ khi còn hạng mục nhập kho chưa đủ ở đó */
export const tenCotCongDoan = (st: string) => (st === 'P022' || st === 'P025' ? `${st} chưa đủ` : st);

/** Số kho của 1 hạng mục: xuất chặn ≤ nhập; tồn = cột tồn kho hiện tại chặn ≤ nhập − xuất (không có cột => nhập − xuất) */
export const khoCua = (i: MucBop): Kho => {
  const nk = Math.max(i.inv, 0);
  const xk = Math.min(i.xuat ?? 0, nk);
  const ton = Math.min(i.tonKho ?? nk - xk, nk - xk);
  return { nk, xk, ton, chenh: nk - xk - ton };
};

// Theo giá trị: hạng mục có số > 0 ở cột đó. Theo số hạng mục: mỗi hạng mục có nhập rơi vào ĐÚNG 1 cột để
// Đã nhập = Đã xuất + Tồn kho + Chênh: còn hàng => Tồn kho; hết hàng mà xuất đủ => Đã xuất; còn lại => Chênh
export const laKho = (i: MucBop, f: KhoCot, metric: BopMetric) => {
  const k = khoCua(i);
  if (k.nk <= 0) return false;
  if (f === 'nk') return true;
  if (metric !== 'count') return k[f] > 0;
  // Dưới 10.000đ (0,01 triệu) coi như 0 — sai số làm tròn của nguồn
  const conTon = k.ton >= 0.01, coChenh = k.chenh >= 0.01;
  if (f === 'ton') return conTon;
  if (f === 'xk') return !conTon && !coChenh;
  return !conTon && coChenh;
};

/** Số kho 1 hạng mục góp vào bảng: đếm (0/1 mỗi cột) hoặc số tiền */
export const khoMuc = (i: MucBop, metric: BopMetric): Kho => (metric === 'count'
  ? { nk: laKho(i, 'nk', metric) ? 1 : 0, xk: laKho(i, 'xk', metric) ? 1 : 0, ton: laKho(i, 'ton', metric) ? 1 : 0, chenh: laKho(i, 'chenh', metric) ? 1 : 0 }
  : khoCua(i));

/** Hạng mục vào phần công đoạn: đếm = còn theo dõi; giá trị = mọi hạng mục còn giá trị chưa nhập (khớp thẻ BOP) */
export const mucCongDoan = <T extends MucBop>(items: T[], metric: BopMetric): T[] =>
  (metric === 'count' ? items.filter(i => i.open) : items.filter(i => i.open || i.remain > 0));
export const giaTriBop = (i: MucBop, metric: BopMetric) => (metric === 'count' ? 1 : metric === 'remain' ? i.remain : i.total);

/** Số trong ô: đếm = số nguyên; giá trị = tỷ đồng, dưới 5 triệu ghi "<0.01" (làm tròn "0.00" dễ hiểu nhầm là 0) */
export const fmtGiaTriBop = (v: number, metric: BopMetric) =>
  (metric === 'count' ? fmtInt(v) : !v ? '-' : Math.abs(v) < 5 ? '<0.01' : formatTrieuAsTy(v));

export type DongGop = { cells: Record<string, number>; total: number; n: number };
export type NhomCot = { bucket: RemainBucket | null; stages: string[] };
const khoRong = (): Kho => ({ nk: 0, xk: 0, ton: 0, chenh: 0 });
const congKho = (e: Kho, v: Kho) => { e.nk += v.nk; e.xk += v.xk; e.ton += v.ton; e.chenh += v.chenh; };
const nhomMacDinh = (st: string): RemainBucket => (st === 'P001' ? 'notDeployed' : st === 'P002' ? 'p002' : 'onLine');
const BOP_SET = new Set<string>(BOP_STAGE_ORDER);

export interface PivotBop {
  stages: string[];
  groups: NhomCot[];
  /** Theo khoá dòng (1 hạng mục có thể góp vào nhiều khoá, vd nhóm SP và nhóm SP + xưởng) */
  dong: Map<string, DongGop>;
  colTot: Record<string, number>;
  colN: Record<string, number>;
  grand: number;
  kho: Map<string, Kho>;
  khoTot: Kho;
}

/**
 * Pivot Khoá dòng × Công đoạn + Kho.
 * - items: hạng mục của phần công đoạn (lọc open / remain theo metric bên trong);
 * - khoItems: hạng mục của phần Kho (lũy kế) — khoá dòng chỉ có hàng đã xong vẫn hiện dòng (cột công đoạn trống);
 * - nhomTheoCongDoan: nhóm của cột lấy theo mã công đoạn (bảng nhiều công trình) thay vì theo hạng mục gặp đầu
 *   tiên (tab BOP — 1 công trình); công đoạn lạ => nhóm "Khác".
 */
export function tinhPivotBop<T extends MucBop>(
  items: T[], khoItems: T[], metric: BopMetric, khoaDong: (i: T) => string[], nhomTheoCongDoan = false,
): PivotBop {
  const stageBucket = new Map<string, RemainBucket | null>();
  const dong = new Map<string, DongGop>();
  const colTot: Record<string, number> = {};
  const colN: Record<string, number> = {};
  let grand = 0;
  for (const i of mucCongDoan(items, metric)) {
    const v = giaTriBop(i, metric), st = stageOfBop(i);
    if (!stageBucket.has(st)) stageBucket.set(st, nhomTheoCongDoan ? (BOP_SET.has(st) ? remainBucketOf('', st) : null) : i.bucket);
    for (const k of khoaDong(i)) {
      const d = dong.get(k) ?? { cells: {}, total: 0, n: 0 };
      d.cells[st] = (d.cells[st] ?? 0) + v; d.total += v; d.n++;
      dong.set(k, d);
    }
    colTot[st] = (colTot[st] ?? 0) + v; colN[st] = (colN[st] ?? 0) + 1;
    grand += v;
  }
  // Luôn đủ cột P001 → P021 (công đoạn trống vẫn hiện "-"); P022 / P025 chỉ thành cột công đoạn khi còn hạng mục
  // nhập kho chưa đủ ở đó; công đoạn lạ xếp cuối
  const coDinh = BOP_STAGE_ORDER.filter(st => st !== 'P022' && st !== 'P025') as string[];
  coDinh.forEach(st => { if (!stageBucket.has(st)) stageBucket.set(st, nhomMacDinh(st)); });
  const stages = [...stageBucket.keys()].sort((x, y) => stageRank(x) - stageRank(y) || x.localeCompare(y));
  // Dải nhóm trên đầu cột: các công đoạn liền nhau cùng nhóm gộp 1 ô
  const groups: NhomCot[] = [];
  for (const st of stages) {
    const bk = stageBucket.get(st) ?? null;
    const last = groups[groups.length - 1];
    if (last && last.bucket === bk) last.stages.push(st); else groups.push({ bucket: bk, stages: [st] });
  }
  // Kho (lũy kế): P022 đã nhập − P025 đã xuất = tồn kho. Xuất chặn ≤ nhập từng hạng mục để tồn không âm.
  const kho = new Map<string, Kho>();
  const khoTot = khoRong();
  for (const i of khoItems) {
    const v = khoMuc(i, metric);
    if (!v.nk) continue;
    for (const k of khoaDong(i)) {
      const e = kho.get(k) ?? khoRong();
      congKho(e, v); kho.set(k, e);
      if (!dong.has(k)) dong.set(k, { cells: {}, total: 0, n: 0 });
    }
    congKho(khoTot, v);
  }
  return { stages, groups, dong, colTot, colN, grand, kho, khoTot };
}

// ---------------------------------------------------------------------------
// Dựng MucBop từ 1 dòng bảng sản xuất (cùng quy tắc với cửa sổ công trình — ProjectHealthModal)
// ---------------------------------------------------------------------------
export interface KhoaMucBop {
  bopKey: string; tinhTrangKey: string; triGiaKey: string; nhapKhoKey: string;
  xuatKhoKey?: string; tonKhoKey?: string;
}
export function mucBopTuDong(row: DataRow, k: KhoaMucBop): MucBop {
  const total = parseNumber(row[k.triGiaKey]);
  const nk = parseNumber(row[k.nhapKhoKey]);
  const remain = remainValue(total, nk);
  const stage = extractStage(row[k.bopKey]);
  const status = String(row[k.tinhTrangKey] ?? '').toUpperCase();
  // Chưa xong = còn giá trị chưa nhập HOẶC trị giá 0, TRỪ hạng mục đã nhập đủ SỐ LƯỢNG
  const open = !isQtyComplete(row) && (remain > 0 || total <= 0);
  return {
    stage,
    // Nhóm phần giá trị còn lại (cả hạng mục đủ SL mà còn lệch tiền — để tổng tiền BOP khớp)
    bucket: open || remain > 0 ? remainBucketOf(status, stage) : null,
    open,
    total,
    inv: doneValue(total, nk),
    xuat: k.xuatKhoKey ? Math.max(parseNumber(row[k.xuatKhoKey]), 0) : 0,
    tonKho: k.tonKhoKey ? Math.max(parseNumber(row[k.tonKhoKey]), 0) : undefined,
    remain,
  };
}

// ---------------------------------------------------------------------------
// Bảng "Tình trạng đơn hàng theo Công trình" (trang Tổng quan): mỗi dòng = 1 công trình. Dạng JSON thuần (máy chủ
// gửi qua mạng). Đơn vị giá trị: triệu đồng (giao diện đổi ra tỷ).
// ---------------------------------------------------------------------------
/** donHang = tổng đơn hàng của công trình (số hạng mục / trị giá, triệu — kể cả hạng mục đã nhập kho đủ) */
export interface DongCongTrinhBop { name: string; cells: Record<string, number>; total: number; kho: Kho; donHang: number }
export interface BangCongTrinhBop {
  metric: 'count' | 'remain';
  stages: string[];
  groups: NhomCot[];
  rows: DongCongTrinhBop[];
  colTot: Record<string, number>;
  grand: number;
  khoTot: Kho;
  donHangTot: number;
}

/**
 * items: hạng mục KHÔNG HỦY (đã qua bộ lọc trang) kèm tên công trình. Sắp theo TỔNG giảm dần (khối việc còn lại),
 * bằng nhau thì theo Đã nhập kho giảm dần rồi tên; `cuoi` (vd "Chưa xác định") luôn xếp cuối.
 */
export function tinhBangCongTrinhBop<T extends MucBop & { ct: string }>(items: T[], metric: 'count' | 'remain', cuoi?: string): BangCongTrinhBop {
  const p = tinhPivotBop(items, items, metric, i => [i.ct], true);
  // Tổng đơn hàng: mọi hạng mục (kể cả đã nhập kho đủ) — công trình đã xong hết vẫn có dòng (cột công đoạn trống)
  const donHang = new Map<string, number>();
  for (const i of items) donHang.set(i.ct, (donHang.get(i.ct) ?? 0) + (metric === 'count' ? 1 : Math.max(i.total, 0)));
  const rows: DongCongTrinhBop[] = [...donHang.entries()].map(([name, dh]) => {
    const d = p.dong.get(name);
    return { name, cells: d?.cells ?? {}, total: d?.total ?? 0, kho: p.kho.get(name) ?? khoRong(), donHang: dh };
  });
  rows.sort((a, b) => Number(a.name === cuoi) - Number(b.name === cuoi) || b.total - a.total || b.kho.nk - a.kho.nk || a.name.localeCompare(b.name, 'vi'));
  return { metric, stages: p.stages, groups: p.groups, rows, colTot: p.colTot, grand: p.grand, khoTot: p.khoTot, donHangTot: [...donHang.values()].reduce((a, b) => a + b, 0) };
}
