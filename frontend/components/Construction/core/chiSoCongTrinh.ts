// ============================================================================
// CHỈ SỐ CÔNG TRÌNH — MỘT NƠI ĐỊNH NGHĨA (dùng chung trang Báo cáo tiến độ công trình, cửa sổ công trình, chi tiết HEX)
// Trước đây mỗi khung tự tính nên cùng nhãn mà ra số khác (vd "Chưa có KH nhập kho" ở thẻ BOT không gồm "Đạt KH kỳ",
// ở tab BOT lại gồm). Mọi chỗ hiển thị các nhóm / chỉ số này phải gọi hàm ở đây.
// Đơn vị tiền: TRIỆU ĐỒNG (utils/money.ts).
// ============================================================================
import type { Rec } from './banGhiCongTrinh';

const NGAY = 86_400_000;

/** 6 nhóm thời hạn (BOT = KH nhập kho tuần → tháng) của hạng mục CÒN THEO DÕI (chưa nhập kho đủ, không hủy) */
export type NhomBot = 'quaHan' | 'den14' | 'den30' | 'sau30' | 'datKy' | 'chuaCoKh';

export const NHOM_BOT: ReadonlyArray<{ key: NhomBot; label: string; mau: string; giaiThich: string }> = [
  { key: 'quaHan', label: 'Quá hạn KH', mau: '#e31e24', giaiThich: 'Đã qua KH nhập kho tuần → tháng mà chưa nhập kho đủ.' },
  { key: 'den14', label: '≤ 14 ngày', mau: '#f59e0b', giaiThich: 'Còn từ 0 đến 14 ngày tới KH nhập kho.' },
  { key: 'den30', label: '15–30 ngày', mau: '#fcd34d', giaiThich: 'Còn 15–30 ngày tới KH nhập kho.' },
  { key: 'sau30', label: 'Sau 30 ngày', mau: '#86efac', giaiThich: 'KH nhập kho còn hơn 30 ngày.' },
  { key: 'datKy', label: 'Đạt KH kỳ, chờ KH tiếp', mau: '#60a5fa', giaiThich: 'Đã nhập đủ số lượng KH nhập kho của kỳ nhưng đơn hàng chưa nhập kho đủ — không trễ, chờ KH kỳ sau.' },
  { key: 'chuaCoKh', label: 'Chưa có KH nhập kho', mau: '#c9ced8', giaiThich: 'Không có KH nhập kho tuần / tháng — không theo dõi được trễ hạn.' },
];

/**
 * Nhóm thời hạn của 1 hạng mục; null = không còn theo dõi (đã nhập kho đủ hoặc hủy).
 * Nhận dạng tối thiểu để cửa sổ công trình (dòng gốc) cũng dùng được.
 */
export function nhomBot(
  r: { open: boolean; overdue: boolean; planMet: boolean; deadline: Date | null },
  today: number,
): NhomBot | null {
  if (!r.open) return null;
  if (r.planMet) return 'datKy';
  if (!r.deadline) return 'chuaCoKh';
  const conNgay = Math.floor((r.deadline.getTime() - today) / NGAY);
  if (r.overdue || conNgay < 0) return 'quaHan';
  if (conNgay <= 14) return 'den14';
  if (conNgay <= 30) return 'den30';
  return 'sau30';
}

/** Đã nhập kho đủ trị giá đơn hàng HOẶC đủ số lượng (không tính đơn hủy) */
export const daNhapDu = (r: Rec) => r.status !== 'HỦY' && ((r.total > 0 && r.done >= r.total) || r.qtyDone);

export interface ChiSo {
  cts: number; items: number; cancelled: number;
  stocked: number; notStocked: number; partial: number; stockedDone: number; partialDone: number;
  total: number; done: number; remain: number;
  exported: number; stock: number; stockHuy: number; exportedRecorded: number; unmatched: number;
  stockOver: number; stockOverItems: number;
  /** Phần chưa nhập kho theo công đoạn (cộng lại = remain) */
  remainBy: Record<Rec['bucket'], number>;
  /** Số hạng mục + phần chưa nhập kho theo nhóm thời hạn (cộng các nhóm = số hạng mục còn theo dõi) */
  bot: Record<NhomBot, { n: number; remain: number }>;
  openItems: number;
  pastBot: number; pastBotRemain: number;
}

/** Toàn bộ chỉ số của một tập hạng mục — thẻ, thanh, "Cần chú ý" đều đọc từ đây */
export function tinhChiSo(rows: Rec[], today: number): ChiSo {
  const cts = new Set<string>();
  const remainBy: ChiSo['remainBy'] = { notDeployed: 0, p002: 0, onLine: 0, shortfall: 0, cancelled: 0 };
  const bot = Object.fromEntries(NHOM_BOT.map(g => [g.key, { n: 0, remain: 0 }])) as ChiSo['bot'];
  const c = {
    cancelled: 0, stocked: 0, notStocked: 0, partial: 0, stockedDone: 0, partialDone: 0, total: 0, done: 0,
    exported: 0, stock: 0, stockHuy: 0, exportedRecorded: 0, unmatched: 0, stockOver: 0, stockOverItems: 0,
    openItems: 0, pastBot: 0, pastBotRemain: 0,
  };
  for (const r of rows) {
    cts.add(r.ctKey);
    remainBy[r.bucket] += Math.max(r.total - r.done, 0);
    if (r.status === 'HỦY') { c.cancelled++; c.stockHuy += r.stock; }
    else if (daNhapDu(r)) { c.stocked++; c.stockedDone += r.done; }
    else { c.notStocked++; if (r.done > 0) { c.partial++; c.partialDone += r.done; } }
    c.total += r.total; c.done += r.done; c.exported += r.exported; c.stock += r.stock;
    c.exportedRecorded += r.exportedRecorded; c.unmatched += r.unmatched;
    if (r.stockCut > 0.001) { c.stockOver += r.stockCut; c.stockOverItems++; }
    const g = nhomBot(r, today);
    if (g) {
      const rem = r.total - r.done;
      c.openItems++; bot[g].n++; bot[g].remain += rem;
      if (r.botDuAn && r.botDuAn.getTime() < today) { c.pastBot++; c.pastBotRemain += rem; }
    }
  }
  return { ...c, cts: cts.size, items: rows.length, remain: c.total - c.done, remainBy, bot };
}

/** Giải thích cách tính — hiện ở dấu "?" cạnh mỗi con số (thay cho câu chú thích dài) */
export const GIAI_THICH = {
  tongGiaTri: 'Tổng trị giá đơn hàng của các hạng mục, gồm cả đơn hủy (khớp file gốc) — lọc Tình trạng IPO để bỏ hủy.',
  daNhapKho: 'Giá trị đã nhập kho lũy kế (P022), mỗi hạng mục tối đa bằng trị giá đơn hàng. % = đã nhập / tổng giá trị.',
  quaHan: 'Hạng mục chưa nhập kho đủ đã qua KH nhập kho tuần → tháng (KH kỳ đã nhập đủ số lượng thì không tính).',
  quaBot: 'Hạng mục chưa nhập kho đủ đã qua BOT dự án — hạn chung của công trình, chỉ để tham khảo.',
  congDoan: 'Giá trị chưa nhập kho chia theo công đoạn BOP hiện tại; giá trị đã nhập kho chia thành tồn kho / đã xuất. Xếp theo dòng chảy sản xuất.',
  theoNhom: 'Mỗi dòng: thanh xanh = đã nhập kho, cam = chưa nhập kho (độ dài theo tổng giá trị). Số đỏ = hạng mục quá hạn KH.',
  hoanThanh: 'Giá trị đã nhập kho / tổng trị giá đơn hàng của công trình.',
} as const;
