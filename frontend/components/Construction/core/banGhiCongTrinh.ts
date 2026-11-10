// ============================================================================
// LÕI "TỔNG QUAN CÔNG TRÌNH": dựng bản ghi gọn cho từng hạng mục từ bảng sản xuất — hàm thuần (không React, không
// trình duyệt), dùng chung:
//   - trình duyệt: ConstructionOverview (allRecords) khi đã có bảng sản xuất;
//   - máy chủ: /api/tong-quan/cong-trinh dựng sẵn + nén cột (~vài trăm KB thay vì bảng 3 MB) cho người CHƯA có bảng
//     — mọi bảng / biểu đồ / bộ lọc của trang tính từ bản ghi nên hiện và lọc được ngay.
// Thân taoBanGhi chuyển nguyên từ ConstructionOverview — đổi ở đây là đổi cả hai nơi, số luôn khớp.
// ============================================================================
import type { DataRow, ColumnDefinition } from '../../../types';
import { TARGET_COLUMN_NAMES } from '../../../types';
import { findColumnKey } from '../../Dashboard/utils/columnKeyResolver';
import { parseNumber } from '../../Dashboard/utils/numberParsers';
import { deadlineOf, resolveDeadlineKeys, isQtyComplete, projectMatchKey, laHuy } from '../../../utils/productionMetrics';
import { extractStage, remainBucketOf, type RemainBucket } from '../../Dashboard/core/stages';
import { laChuaTheSX } from '../../Dashboard/constants';
import { khoCua } from './bopPivot';

export type Status = 'HOÀN THÀNH' | 'CÓ PHIẾU SX' | 'CHƯA TKSX' | 'CẦN XỬ LÝ' | 'TẠM NGƯNG' | 'HỦY';

export interface Rec {
  ct: string; pm: string; pc: string; kv: string; kh: string; pl: string;
  nct: string;        // nhóm công trình (nhom_ct) — vd. "CỤM TÂY HỒ VIEW", "OUT TOP 33 CT"
  tda: string;        // tình trạng dự án (tinh_trang_du_an) — SẢN XUẤT / ĐÓNG DỰ ÁN / CẦN XỬ LÝ
  ma: string;         // mã công trình (khớp vướng mắc theo mã)
  deadline: Date | null; // hạn = KH nhập kho tuần → tháng
  // Có KH nhập kho tuần / tháng nhưng KH kỳ đã đạt hết (deadline = null) — chờ KH kỳ sau, KHÔNG phải "chưa có KH"
  planMet: boolean;
  open: boolean;      // còn phải theo dõi (chưa nhập đủ giá trị / số lượng, không hủy)
  overdue: boolean;   // open và đã qua hạn
  botDuAn: Date | null;  // BOT dự án (tham khảo)
  ctKey: string;      // khoá ĐẾM công trình: tên chuẩn (projectMatchKey, xem projectKeyResolver)
  month: string;      // 'YYYY-MM' hoặc 'none'
  status: Status;
  total: number;      // trị giá đơn hàng; đơn HỦY = 0 (số HỦY ở totalHuy)
  totalHuy: number;   // trị giá của đơn HỦY, hiện riêng ngoài tổng
  done: number;       // giá trị đã nhập kho, tối đa = total; đơn HỦY = 0
  // Đã xuất = TT xuất kho lũy kế đúng như file gốc, KHÔNG chặn theo đã nhập; đơn HỦY = 0. Phần vượt nhập ở xuatVuot
  exported: number;
  exportedRecorded: number; // TT xuất kho lũy kế gốc — để tham khảo
  xuatVuot: number;   // xuất vượt nhập (bopPivot.khoCua)
  // Tồn kho hiện tại chặn ≤ đã nhập − đã xuất. Tồn kho vẫn gồm đơn HỦY (hàng thực có trong kho), chặn theo nhập − xuất ghi nhận
  stock: number;
  // Chênh ≥ 0: đã nhập mà không thấy xuất lẫn tồn (bảng xuất kho chỉ có từ 01/2025, giao không qua phiếu xuất…).
  // Luôn đúng (không HỦY): done + xuatVuot = exported + stock + unmatched
  unmatched: number;
  stockCut: number;   // phần tồn kho hiện tại vượt giá trị đã nhập (bị chặn) — để ghi chú
  qtyDone: boolean;   // đã nhập đủ số lượng đơn hàng (đếm là đã nhập kho dù thành tiền NK thấp hơn trị giá)
  /** Dòng gốc — để mở cửa sổ danh sách HEX. Bản ghi máy chủ gửi chỉ có { hex } (laBanGhiMayChu) */
  row: DataRow;
  ipo: string;        // Tình trạng IPO gốc (đã trim) — cho bộ lọc Tình trạng IPO
  mk: string;         // khoá so khớp tên công trình gốc (projectMatchKey) — lọc theo nhóm Luồng đỏ / Căn mẫu
  // Phần CHƯA NHẬP KHO xếp theo công đoạn (cùng cách chia với bảng "Tình trạng đơn hàng theo công trình"):
  // P001 / P002 / đang trên chuyền (P012→P021, GCVT) / P022–P025 nhập chưa đủ; đơn HỦY tách riêng
  bucket: RemainBucket | 'cancelled';
}

export const NO_DATA = '(Chưa có)';
export const NO_MONTH = 'none';

/** Chuẩn hoá từng dòng 1 lần (trước nằm trong ConstructionOverview — allRecords) */
export function taoBanGhi(data: DataRow[], columns: ColumnDefinition[], today: number): Rec[] {
  const key = (target: string, fallback: string) => findColumnKey(columns, target) || fallback;
  const ctK = key(TARGET_COLUMN_NAMES.CONG_TRINH, 'ten_cong_trinh');
  const pmK = key('ten_pm', 'ten_pm');
  const pcK = key('ten_pc', 'ten_pc');
  const kvK = key('khu_vuc_du_an', 'khu_vuc_du_an');
  const khK = key('khach_hang', 'khach_hang');
  const plK = key(TARGET_COLUMN_NAMES.PHAN_LOAI_NHOM_SAN_PHAM, 'phan_loai_nhom_san_pham');
  const dlKeys = resolveDeadlineKeys(columns);
  const stK = key(TARGET_COLUMN_NAMES.TINH_TRANG, 'tinh_trang');
  const ipoK = key(TARGET_COLUMN_NAMES.TINH_TRANG_IPO, 'tinh_trang_ipo');
  const totK = key(TARGET_COLUMN_NAMES.TRI_GIA_DON_HANG_TONG, 'tri_gia_don_hang_tong');
  const invK = key(TARGET_COLUMN_NAMES.THANH_TIEN_NHAP_KHO, 'thanh_tien_nhap_kho_luy_ke');
  const maK = key(TARGET_COLUMN_NAMES.MA_CONG_TRINH, 'ma_cong_trinh');
  const xkK = key('thanh_tien_xuat_kho_luy_ke', 'thanh_tien_xuat_kho_luy_ke');
  const tkK = key('thanh_tien_ton_kho_hien_tai', 'thanh_tien_ton_kho_hien_tai');
  const nctK = columns.find(c => c.key === 'nhom_ct')?.key ?? 'nhom_ct';
  const bopK = key(TARGET_COLUMN_NAMES.BOP, 'bop');
  const tdaK = columns.find(c => c.key === 'tinh_trang_du_an')?.key ?? 'tinh_trang_du_an';
  // Khoá ĐẾM công trình = tên chuẩn (projectMatchKey) — xem projectKeyResolver ở ProductionDonutPanel
  const projectKey = (row: DataRow) => projectMatchKey(row[ctK]);

  const txt = (v: unknown) => {
    const t = String(v ?? '').trim();
    return !t || t.startsWith('#') ? NO_DATA : t;
  };

  const out: Rec[] = [];
  for (const row of data) {
    const ct = String(row[ctK] ?? '').trim();
    if (!ct) continue;

    const ipo = String(row[ipoK] ?? '').toUpperCase();
    const st = String(row[stK] ?? '').toUpperCase();
    const totalRaw = parseNumber(row[totK]);
    const invRaw = parseNumber(row[invK]);

    // Ưu tiên cột Tình trạng IPO (nguồn chính thức); riêng "01. ĐANG SẢN XUẤT" thì chia tiếp
    // thành CHƯA TKSX / CÓ PHIẾU SX theo cột Tình trạng (công đoạn).
    let status: Status;
    if (laHuy(ipo)) status = 'HỦY';
    else if (ipo.includes('HOÀN THÀNH')) status = 'HOÀN THÀNH';
    else if (ipo.includes('TẠM NGƯNG')) status = 'TẠM NGƯNG';
    else if (ipo.includes('CẦN XỬ LÝ')) status = 'CẦN XỬ LÝ';
    else if (laChuaTheSX(st)) status = 'CHƯA TKSX';
    else status = 'CÓ PHIẾU SX';

    // Tháng hạn = KH nhập kho tuần → KH nhập kho tháng (quy tắc chung; không có KH => "Chưa có KH nhập kho")
    const dl = deadlineOf(row, dlKeys);
    const d = dl.date;
    const month = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : NO_MONTH;

    const cancelled = status === 'HỦY';
    const stockRaw = Math.max(parseNumber(row[tkK]), 0);
    const exportedRecorded = Math.max(parseNumber(row[xkK]), 0);
    const exported = cancelled ? 0 : exportedRecorded;
    // HỦY = 0 trong mọi tổng; riêng tồn kho vẫn gồm hàng HỦY còn trong kho
    const done = cancelled ? 0 : Math.min(Math.max(invRaw, 0), totalRaw);
    const stockHuy = cancelled ? Math.min(stockRaw, Math.max(Math.max(invRaw, 0) - exportedRecorded, 0), Math.max(totalRaw, 0)) : 0;
    const kho = cancelled ? { ton: stockHuy, chenh: 0, xv: 0 } : khoCua({ inv: done, xuat: exported, tonKho: stockRaw });
    const qtyDone = isQtyComplete(row);
    // Cùng định nghĩa "còn theo dõi" với cửa sổ tổng quan công trình (ProjectHealthModal)
    const open = !cancelled && !qtyDone && (totalRaw - done > 0 || totalRaw <= 0);
    out.push({
      ct, ctKey: projectKey(row), pm: txt(row[pmK]), pc: txt(row[pcK]), kv: txt(row[kvK]), kh: txt(row[khK]), pl: txt(row[plK]),
      nct: txt(row[nctK]), tda: txt(row[tdaK]), ma: String(row[maK] ?? '').trim().toUpperCase(),
      deadline: d, planMet: !d && (dl.tuanMet || dl.thangMet), open, overdue: open && !!d && d.getTime() < today, botDuAn: dl.botDuAn,
      ipo: String(row[ipoK] ?? '').trim(),
      month, status,
      total: cancelled ? 0 : totalRaw,
      totalHuy: cancelled ? totalRaw : 0,
      done,
      exported,
      exportedRecorded,
      xuatVuot: kho.xv,
      stock: kho.ton,
      unmatched: kho.chenh,
      stockCut: stockRaw - kho.ton,
      qtyDone,
      row,
      mk: projectMatchKey(ct),
      bucket: cancelled ? 'cancelled' : remainBucketOf(st, extractStage(row[bopK])),
    });
  }

  // Tên hiển thị của 1 công trình = cách viết xuất hiện nhiều nhất trong các dòng cùng khoá
  // (mã công trình -> tên chuẩn). Gán lại `ct` để MỌI danh sách / bộ lọc / số đếm trên trang
  // cùng gom theo 1 khoá — tránh cảnh ô "Công trình" ra 387 mà danh sách lại 402 dòng.
  const nameCount = new Map<string, Map<string, number>>();
  for (const r of out) {
    let m = nameCount.get(r.ctKey);
    if (!m) { m = new Map(); nameCount.set(r.ctKey, m); }
    m.set(r.ct, (m.get(r.ct) ?? 0) + 1);
  }
  const displayName = new Map<string, string>();
  nameCount.forEach((m, k) => {
    let best = '', bestN = -1;
    m.forEach((n, name) => { if (n > bestN || (n === bestN && name < best)) { best = name; bestN = n; } });
    displayName.set(k, best);
  });
  for (const r of out) r.ct = displayName.get(r.ctKey) ?? r.ct;
  return out;
}

// ---------------------------------------------------------------------------
// Nén cột để gửi qua mạng: chuỗi lặp (công trình, PM, PC…) thành bảng từ + chỉ số; ngày thành 'YYYY-MM-DD'
// (giờ địa phương — máy chủ chạy UTC, trình duyệt +7); quá hạn tính lại ở trình duyệt theo ngày của máy xem.
// ---------------------------------------------------------------------------
const COT_CHU = ['ct', 'pm', 'pc', 'kv', 'kh', 'pl', 'nct', 'tda', 'ma', 'ctKey', 'month', 'status', 'ipo', 'mk', 'bucket'] as const;
const COT_SO = ['total', 'totalHuy', 'done', 'exported', 'exportedRecorded', 'xuatVuot', 'stock', 'stockCut', 'unmatched'] as const;

export interface BanGhiNen {
  n: number;
  tu: string[];
  chu: Record<(typeof COT_CHU)[number], number[]>;
  so: Record<(typeof COT_SO)[number], number[]> & { totalHuy?: number[]; xuatVuot?: number[] };
  /** open, qtyDone, planMet: 0/1 */
  open: number[]; qtyDone: number[]; planMet?: number[];
  /** chỉ số vào tu ('' = không có) */
  deadline: number[]; botDuAn: number[]; hex: number[];
}

const ngayChuoi = (d: Date | null) =>
  (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '');
const chuoiNgay = (s: string): Date | null => (s ? new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) : null);

export function nenBanGhi(recs: Rec[]): BanGhiNen {
  const tu: string[] = [];
  const idx = new Map<string, number>();
  const ma = (s: string) => { let i = idx.get(s); if (i === undefined) { i = tu.length; tu.push(s); idx.set(s, i); } return i; };
  const chu = Object.fromEntries(COT_CHU.map(k => [k, recs.map(r => ma(String(r[k])))])) as BanGhiNen['chu'];
  const so = Object.fromEntries(COT_SO.map(k => [k, recs.map(r => r[k])])) as BanGhiNen['so'];
  return {
    n: recs.length, tu, chu, so,
    open: recs.map(r => (r.open ? 1 : 0)), qtyDone: recs.map(r => (r.qtyDone ? 1 : 0)), planMet: recs.map(r => (r.planMet ? 1 : 0)),
    deadline: recs.map(r => ma(ngayChuoi(r.deadline))), botDuAn: recs.map(r => ma(ngayChuoi(r.botDuAn))),
    hex: recs.map(r => ma(String(r.row?.['hex'] ?? '').trim())),
  };
}

/** Bản ghi từ máy chủ: row chỉ có { hex } — danh sách HEX / cửa sổ công trình / xuất Excel chờ bảng sản xuất */
export function giaiNenBanGhi(z: BanGhiNen, today: number): Rec[] {
  const out: Rec[] = new Array(z.n);
  const t = z.tu;
  for (let i = 0; i < z.n; i++) {
    const deadline = chuoiNgay(t[z.deadline[i]]);
    const open = z.open[i] === 1;
    out[i] = {
      ct: t[z.chu.ct[i]], pm: t[z.chu.pm[i]], pc: t[z.chu.pc[i]], kv: t[z.chu.kv[i]], kh: t[z.chu.kh[i]], pl: t[z.chu.pl[i]],
      nct: t[z.chu.nct[i]], tda: t[z.chu.tda[i]], ma: t[z.chu.ma[i]], ctKey: t[z.chu.ctKey[i]], month: t[z.chu.month[i]],
      status: t[z.chu.status[i]] as Status, ipo: t[z.chu.ipo[i]], mk: t[z.chu.mk[i]],
      bucket: t[z.chu.bucket[i]] as Rec['bucket'],
      deadline, planMet: z.planMet?.[i] === 1, open, overdue: open && !!deadline && deadline.getTime() < today, botDuAn: chuoiNgay(t[z.botDuAn[i]]),
      total: z.so.total[i], totalHuy: z.so.totalHuy?.[i] ?? 0, done: z.so.done[i], exported: z.so.exported[i], exportedRecorded: z.so.exportedRecorded[i],
      xuatVuot: z.so.xuatVuot?.[i] ?? 0,
      stock: z.so.stock[i], stockCut: z.so.stockCut[i], unmatched: z.so.unmatched?.[i] ?? 0, qtyDone: z.qtyDone[i] === 1,
      row: { hex: t[z.hex[i]] } as DataRow,
    };
  }
  return out;
}
