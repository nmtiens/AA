// ============================================================================
// QUY TẮC TÍNH SỐ LIỆU SẢN XUẤT — dùng chung cho MỌI trang (Tổng quan, Luồng đỏ,
// Báo cáo tiến độ, cửa sổ tổng quan công trình...) để các con số luôn khớp nhau.
//
//  • Đơn HỦY (cột Tình trạng IPO chứa "HỦY") không tính vào tổng / đã nhập / còn lại.
//  • Đã nhập kho của 1 hạng mục = min(max(nhập kho lũy kế, 0), trị giá đơn hàng).
//  • Còn lại của 1 hạng mục     = trị giá đơn hàng − đã nhập kho (≥ 0).
//  • Ngày kế hoạch (BOT / quá hạn / biểu đồ theo tháng):
//      KH nhập kho tuần → KH nhập kho tháng → ngày cần giao.
//  • Công trình: gom theo MÃ công trình, hiển thị 1 tên chuẩn (cách viết nhiều dòng nhất).
// ============================================================================
import type { DataRow, ColumnDefinition } from '../types';
import { parseNumber } from '../components/Dashboard/utils/numberParsers';
import { parseVNDate } from '../components/Dashboard/utils/dateHelpers';
import { findColumnKey } from '../components/Dashboard/utils/columnKeyResolver';

export const isCancelledIpo = (ipo: unknown): boolean => String(ipo ?? '').toUpperCase().includes('HỦY');

/** Trị giá tính vào tổng (0 nếu đơn HỦY). Đơn vị giữ nguyên như dữ liệu gốc (triệu đồng). */
export const orderValue = (total: number, cancelled: boolean): number => (cancelled ? 0 : total);

/** Đã nhập kho của 1 hạng mục (không âm, không vượt trị giá). */
export const doneValue = (total: number, nhapKho: number, cancelled = false): number =>
  cancelled ? 0 : Math.min(Math.max(nhapKho, 0), Math.max(total, 0));

/** Còn lại của 1 hạng mục = trị giá − đã nhập kho. */
export const remainValue = (total: number, nhapKho: number, cancelled = false): number =>
  cancelled ? 0 : Math.max(total - Math.max(nhapKho, 0), 0);

/** Các khoá cột dùng để tính trên 1 dòng sản xuất. */
export interface ProductionValueKeys {
  triGiaKey: string;
  nhapKhoKey: string;
  ipoKey: string;
}

/**
 * Hạng mục "đã nhập kho đủ" (dùng cho mọi chỗ ĐẾM hạng mục): không HỦY, trị giá > 0 và không còn lại.
 * Hạng mục trị giá 0 không tính là đã nhập, cũng không tính là còn lại.
 */
export const isStocked = (total: number, nhapKho: number, cancelled = false): boolean =>
  !cancelled && total > 0 && remainValue(total, nhapKho) <= 0;

export const rowRemain = (row: DataRow, k: ProductionValueKeys): number =>
  remainValue(parseNumber(row[k.triGiaKey]), parseNumber(row[k.nhapKhoKey]), isCancelledIpo(row[k.ipoKey]));

export const rowDone = (row: DataRow, k: ProductionValueKeys): number =>
  doneValue(parseNumber(row[k.triGiaKey]), parseNumber(row[k.nhapKhoKey]), isCancelledIpo(row[k.ipoKey]));

export const rowOrder = (row: DataRow, k: ProductionValueKeys): number =>
  orderValue(parseNumber(row[k.triGiaKey]), isCancelledIpo(row[k.ipoKey]));

export const resolveValueKeys = (columns: ColumnDefinition[]): ProductionValueKeys => ({
  triGiaKey: findColumnKey(columns, 'tri_gia_don_hang_tong') || 'tri_gia_don_hang_tong',
  nhapKhoKey: findColumnKey(columns, 'thanh_tien_nhap_kho_luy_ke') || 'thanh_tien_nhap_kho_luy_ke',
  ipoKey: findColumnKey(columns, 'tinh_trang_ipo') || 'tinh_trang_ipo',
});

// ---------------------------------------------------------------------------
// Ngày kế hoạch
// ---------------------------------------------------------------------------

/** "2026-09-26 00:00:00" / "2026-09-26" / ISO / dd/mm/yyyy -> Date theo giờ địa phương (chỉ phần ngày). */
export const parsePlanDate = (v: unknown): Date | null => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}([ T]|$)/.test(s)) {
    // Chuỗi có múi giờ (vd ISO "…T17:00:00.000Z" của cột date) -> đổi sang giờ địa phương trước
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = parseVNDate(s);
  return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null;
};

export type DeadlineSource = 'tuần' | 'tháng' | 'cần giao';

export interface DeadlineKeys {
  khnkTuanKey: string;
  khnkThangKey: string;
  ngayCanGiaoKey: string;
}

export const resolveDeadlineKeys = (columns: ColumnDefinition[]): DeadlineKeys => ({
  khnkTuanKey: findColumnKey(columns, 'ngay_khnk_tuan') || 'ngay_khnk_tuan',
  khnkThangKey: findColumnKey(columns, 'ngay_khnk_thang') || 'ngay_khnk_thang',
  ngayCanGiaoKey: findColumnKey(columns, 'ngay_can_giao') || 'ngay_can_giao',
});

export interface Deadline {
  date: Date | null;
  source: DeadlineSource | null;
  khnkTuan: Date | null;
  khnkThang: Date | null;
  canGiao: Date | null;
}

/** Ngày kế hoạch của 1 hạng mục: KH tuần → KH tháng → ngày cần giao. */
export const deadlineOf = (row: DataRow, k: DeadlineKeys): Deadline => {
  const khnkTuan = parsePlanDate(row[k.khnkTuanKey]);
  const khnkThang = parsePlanDate(row[k.khnkThangKey]);
  const canGiao = parsePlanDate(row[k.ngayCanGiaoKey]);
  const date = khnkTuan ?? khnkThang ?? canGiao;
  const source: DeadlineSource | null = khnkTuan ? 'tuần' : khnkThang ? 'tháng' : canGiao ? 'cần giao' : null;
  return { date, source, khnkTuan, khnkThang, canGiao };
};

export const DEADLINE_SOURCE_LABEL: Record<DeadlineSource, string> = {
  'tuần': 'KH nhập kho tuần',
  'tháng': 'KH nhập kho tháng',
  'cần giao': 'Ngày cần giao',
};

// ---------------------------------------------------------------------------
// Công trình: mã -> tên chuẩn
// ---------------------------------------------------------------------------

/** So khớp tên không phân biệt hoa/thường, khoảng trắng. */
export const normProjectName = (v: unknown): string => String(v ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

let projectAlias = new Map<string, string>();
// Tên chuẩn (khoá chuẩn hoá) -> mọi cách viết gốc của cùng công trình (để gửi lên API lọc các bảng khác)
let projectVariants = new Map<string, Set<string>>();

/** Mở rộng danh sách tên công trình thành mọi cách viết đã biết (tên chuẩn + tên phụ của cùng mã). */
export const expandProjectNames = (names: string[]): string[] => {
  const out = new Set<string>();
  for (const n of names) {
    out.add(n);
    projectVariants.get(projectMatchKey(n))?.forEach(v => out.add(v));
  }
  return [...out];
};

/** Tên chuẩn của 1 tên công trình bất kỳ (tên phụ của cùng mã -> tên chuẩn; không biết thì giữ nguyên). */
export const canonicalProjectName = (name: unknown): string => {
  const t = String(name ?? '').trim().replace(/\s+/g, ' ');
  return projectAlias.get(normProjectName(t)) ?? t;
};

/** Khoá so khớp công trình giữa các bảng: tên chuẩn, không phân biệt hoa/thường, khoảng trắng. */
export const projectMatchKey = (name: unknown): string => normProjectName(canonicalProjectName(name));

/**
 * Đổi tên công trình của mọi dòng về 1 tên chuẩn theo mã công trình (cách viết xuất hiện nhiều
 * dòng nhất). Dòng có tên đã chuẩn giữ nguyên object (không tạo lại), nên rẻ khi gọi trên ~51k dòng.
 */
export function canonicalizeProjectNames(rows: DataRow[], columns: ColumnDefinition[]): DataRow[] {
  const maKey = findColumnKey(columns, 'ma_cong_trinh');
  const tenKey = findColumnKey(columns, 'ten_cong_trinh');
  if (!maKey || !tenKey || rows.length === 0) return rows;

  const counts = new Map<string, Map<string, number>>(); // mã -> (tên gọn -> số dòng)
  for (const row of rows) {
    const ma = normProjectName(row[maKey]);
    const ten = String(row[tenKey] ?? '').trim().replace(/\s+/g, ' ');
    if (!ma || !ten) continue;
    let m = counts.get(ma);
    if (!m) { m = new Map(); counts.set(ma, m); }
    m.set(ten, (m.get(ten) ?? 0) + 1);
  }
  const canonical = new Map<string, string>();
  counts.forEach((m, ma) => {
    let best = '', bestN = -1;
    m.forEach((n, ten) => { if (n > bestN || (n === bestN && ten < best)) { best = ten; bestN = n; } });
    canonical.set(ma, best);
  });
  // Tên -> các mã có dùng tên đó. Chốt theo TÊN: tên dùng cho nhiều mã (vd. tên khách xuất khẩu chung,
  // hoặc ghi nhầm) thì không đổi / không gộp — chỉ gộp các cách viết chỉ thuộc đúng 1 mã (cùng quy tắc server).
  const nameCodes = new Map<string, Set<string>>();
  counts.forEach((m, ma) => m.forEach((_n, ten) => {
    const k = normProjectName(ten);
    let s = nameCodes.get(k);
    if (!s) { s = new Set(); nameCodes.set(k, s); }
    s.add(ma);
  }));
  const single = (ten: unknown) => (nameCodes.get(normProjectName(ten))?.size ?? 0) <= 1;

  // Bảng tên phụ -> tên chuẩn cho các bảng khác chỉ có TÊN công trình (nhập/xuất kho, danh sách
  // công trình của view...). Tên đang là tên chuẩn của 1 mã khác thì giữ nguyên, không đổi.
  const canonicalNames = new Set([...canonical.values()].map(normProjectName));
  const alias = new Map<string, string>();
  counts.forEach((m, ma) => {
    const best = canonical.get(ma)!;
    if (!single(best)) return;
    m.forEach((_n, ten) => {
      const k = normProjectName(ten);
      if (ten !== best && !canonicalNames.has(k) && single(ten)) alias.set(k, best);
    });
  });
  projectAlias = alias;
  const variants = new Map<string, Set<string>>();
  counts.forEach((m, ma) => {
    const best = canonical.get(ma)!;
    if (!single(best)) return;
    const k = normProjectName(best);
    let set = variants.get(k);
    if (!set) { set = new Set(); variants.set(k, set); }
    m.forEach((_n, ten) => { if (single(ten)) set!.add(ten); });
  });
  projectVariants = variants;

  let changed = false;
  const out = rows.map(row => {
    const name = canonical.get(normProjectName(row[maKey]));
    if (!name || row[tenKey] === name) return row;
    // Chốt theo tên: không đổi tên dòng khi tên của dòng hoặc tên chuẩn dùng cho nhiều mã
    const own = String(row[tenKey] ?? '').trim();
    if (own && (!single(own) || !single(name))) return row;
    changed = true;
    return { ...row, [tenKey]: name };
  });
  return changed ? out : rows;
}

// ---------------------------------------------------------------------------
// Vật tư (bảng vat_tu)
// ---------------------------------------------------------------------------

/**
 * Trạng thái 1 dòng vật tư (PR line), chi tiết hơn cột trang_thai:
 *  - cancelled   : 4.HỦY
 *  - done        : đã nhận đủ (SL còn lại ≤ 0)
 *  - ccld        : CCLD — cung cấp lắp đặt (NCC giao + lắp thẳng tại công trình, không về kho nhà máy):
 *                  ghi chú Team PR có "CCLD" hoặc tình trạng PO "CUNG CẤP LẮP ĐẶT"; không chặn sản xuất
 *  - closedShort : PR đã ĐÓNG trên SAP nhưng chưa nhận đủ (dùng tồn kho, đề xuất đóng...) —
 *                  cột trang_thai vẫn ghi "3.ĐÃ NHẬP KHO" dù nhiều dòng chưa nhận gì; không chờ thêm
 *  - notOrdered  : 1.CHƯA MUA (chưa có PO)
 *  - arrived     : đang mua, KHO đã báo hàng về đủ SL yêu cầu nhưng SAP chưa nhập
 *  - late        : đang mua, đã quá ngày dự kiến giao (PMH nhập) mà chưa về đủ
 *  - onTrack     : đang mua, chưa tới ngày dự kiến giao
 */
export type MaterialLineState = 'cancelled' | 'done' | 'ccld' | 'closedShort' | 'notOrdered' | 'arrived' | 'late' | 'onTrack';

export interface MaterialLineFields {
  so_luong_con_lai?: unknown;
  so_luong_yeu_cau?: unknown;
  trang_thai?: unknown;
  trang_thai_sap?: unknown;
  sl_hang_ve_thuc_te?: unknown;
  ngay_du_kien_giao_hang_pmh_nhap?: unknown;
  ngay_can_vat_tu?: unknown;
  ngay_pr?: unknown;
  ngay_thuc_te_ve?: unknown;
  team_pr_note?: unknown;
  tinh_trang_po?: unknown;
}

export const isCcldLine = (r: MaterialLineFields): boolean =>
  /CCLD/i.test(String(r.team_pr_note ?? '')) || String(r.tinh_trang_po ?? '').toUpperCase().includes('CUNG CẤP LẮP ĐẶT');

const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

export const materialLineState = (r: MaterialLineFields, today = todayStart()): MaterialLineState => {
  const st = String(r.trang_thai ?? '').toUpperCase();
  const sap = String(r.trang_thai_sap ?? '').toUpperCase();
  if (st.includes('HỦY') || sap.includes('HỦY')) return 'cancelled';
  if (!(Number(r.so_luong_con_lai) > 0)) return 'done';
  if (isCcldLine(r)) return 'ccld';
  if (sap.includes('ĐÓNG') || st.includes('ĐÃ NHẬP KHO') || sap.includes('HOÀN THÀNH')) return 'closedShort';
  if (st.includes('CHƯA MUA')) return 'notOrdered';
  const yc = Number(r.so_luong_yeu_cau);
  const khoBao = Number(r.sl_hang_ve_thuc_te);
  if (khoBao > 0 && yc > 0 && khoBao >= yc) return 'arrived';
  const due = parsePlanDate(r.ngay_du_kien_giao_hang_pmh_nhap);
  return due && due.getTime() < today ? 'late' : 'onTrack';
};

/** Dòng còn phải chờ vật tư về (chưa mua / đang mua trễ / đang mua đúng hẹn). */
export const isMaterialPending = (s: MaterialLineState) => s === 'notOrdered' || s === 'late' || s === 'onTrack';

/**
 * Dòng vật tư còn THIẾU = còn phải chờ về (chưa mua / đang mua). Không tính dòng HỦY, CCLD (lắp tại
 * công trình), PR đã đóng trên SAP, và dòng kho đã báo về đủ (chỉ chờ nhập SAP).
 */
export const isMaterialMissing = (r: MaterialLineFields): boolean => isMaterialPending(materialLineState(r));

// ---------------------------------------------------------------------------
// Thời gian ở công đoạn hiện tại (cột so_ngay_cd_hien_tai)
// Giá trị gốc: "<3 NGÀY", "4-7 NGÀY", "2 TUẦN" … "7 TUẦN", "TỪ 8 TUẦN TRỞ LÊN", "0" / trống.
// ---------------------------------------------------------------------------
export const DWELL_KEYS = ['<3 NGÀY', '4-7 NGÀY', '2 tuần', '3 tuần', 'Từ 4 tuần trở lên', 'Chưa có số ngày'] as const;
export type DwellKey = typeof DWELL_KEYS[number];
export const DWELL_STUCK: DwellKey = 'Từ 4 tuần trở lên';
export const DWELL_NONE: DwellKey = 'Chưa có số ngày';

/** Gom về 5 nhóm của biểu đồ điểm nghẽn; 4, 5, 6, 7 tuần và "từ 8 tuần" đều là "Từ 4 tuần trở lên". */
export const dwellBucket = (v: unknown): DwellKey => {
  const s = String(v ?? '').trim().toUpperCase();
  if (!s || s === '0') return DWELL_NONE;
  if (s.includes('<3')) return '<3 NGÀY';
  if (s.includes('4-7')) return '4-7 NGÀY';
  const w = s.match(/(\d+)\s*TUẦN/);
  if (w) {
    const n = Number(w[1]);
    if (n >= 4) return DWELL_STUCK;
    if (n === 3) return '3 tuần';
    if (n === 2) return '2 tuần';
    return '4-7 NGÀY';
  }
  return DWELL_NONE;
};

// ---------------------------------------------------------------------------
// Tên PM / PC: cùng 1 người được ghi nhiều kiểu ("ĐẶNG NGỌC SÁU" / "NGỌC SÁU" / "saudn",
// "LÊ ANH QUANG" / "ANH QUANG" / "QUANG"). Gom về tên đầy đủ, dò trong CÙNG công trình trước
// (tránh nhầm người trùng tên), không thấy mới dò toàn bộ và chỉ nhận khi duy nhất 1 người khớp.
// ---------------------------------------------------------------------------
const deaccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd');
const normPerson = (v: unknown) => String(v ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toUpperCase();
const isAccount = (raw: string) => /^[a-z0-9._]+$/.test(raw.trim()) && !raw.includes(' ');

/** Tên rút gọn / tài khoản `short` có phải của người tên đầy đủ `full` không. */
const personMatches = (short: string, shortRaw: string, full: string): boolean => {
  const fw = full.split(' ');
  if (isAccount(shortRaw)) {
    // Tài khoản: tên + chữ cái đầu họ/đệm (saudn = SÁU + Đ, N), hoặc viết liền cả họ tên (nguyenvietdung)
    const acc = shortRaw.toLowerCase().split('.')[0].replace(/\d+$/, '');
    const words = fw.map(w => deaccent(w).toLowerCase());
    if (words.length < 2) return false;
    const given = words[words.length - 1];
    if (acc === words.join('') || acc === [given, ...words.slice(0, -1)].join('')) return true;
    if (!acc.startsWith(given)) return false;
    const rest = acc.slice(given.length).split('').sort().join('');
    const initials = words.slice(0, -1).map(w => w[0]).sort().join('');
    return rest.length > 0 && rest === initials;
  }
  const sw = short.split(' ');
  return fw.length > sw.length && fw.slice(fw.length - sw.length).join(' ') === short;
};

export function canonicalizePersonNames(rows: DataRow[], columns: ColumnDefinition[]): DataRow[] {
  const maKey = findColumnKey(columns, 'ma_cong_trinh');
  const keys = ['ten_pm', 'ten_pc'].map(k => findColumnKey(columns, k)).filter(Boolean) as string[];
  if (!maKey || keys.length === 0 || rows.length === 0) return rows;

  const maps = keys.map(key => {
    // Cách viết hiển thị của 1 tên chuẩn hoá = cách viết nhiều dòng nhất
    const display = new Map<string, Map<string, number>>();
    const perProject = new Map<string, Set<string>>();
    const rawOf = new Map<string, string>(); // tên chuẩn hoá -> 1 cách viết gốc (để nhận diện tài khoản)
    for (const row of rows) {
      const raw = String(row[key] ?? '').trim();
      if (!raw) continue;
      const n = normPerson(raw);
      let d = display.get(n); if (!d) { d = new Map(); display.set(n, d); }
      d.set(raw, (d.get(raw) ?? 0) + 1);
      if (!rawOf.has(n)) rawOf.set(n, raw);
      const ma = normProjectName(row[maKey]);
      let s = perProject.get(ma); if (!s) { s = new Set(); perProject.set(ma, s); }
      s.add(n);
    }
    const best = (n: string) => {
      let b = n, bn = -1;
      display.get(n)?.forEach((c, raw) => { if (c > bn) { b = raw; bn = c; } });
      return b;
    };
    const fulls = [...display.keys()].filter(n => n.includes(' '));
    // Ứng viên dài nhất (bỏ ứng viên là tên rút gọn của ứng viên khác)
    const pick = (n: string, pool: Iterable<string>): string | null => {
      const raw = rawOf.get(n) ?? n;
      const cands = [...pool].filter(f => f !== n && f.includes(' ') && personMatches(n, raw, f));
      const top = cands.filter(f => !cands.some(g => g !== f && personMatches(f, f, g)));
      return top.length === 1 ? top[0] : null;
    };
    const perProjectAlias = new Map<string, Map<string, string>>();
    perProject.forEach((names, ma) => {
      const m = new Map<string, string>();
      names.forEach(n => {
        const target = pick(n, names) ?? pick(n, fulls);
        m.set(n, best(target ?? n));
      });
      perProjectAlias.set(ma, m);
    });
    return { key, perProjectAlias };
  });

  let changed = false;
  const out = rows.map(row => {
    const ma = normProjectName(row[maKey]);
    let next: DataRow | null = null;
    for (const { key, perProjectAlias } of maps) {
      const raw = String(row[key] ?? '').trim();
      if (!raw) continue;
      const name = perProjectAlias.get(ma)?.get(normPerson(raw));
      if (name && name !== row[key]) {
        if (!next) next = { ...row };
        next[key] = name;
      }
    }
    if (!next) return row;
    changed = true;
    return next;
  });
  return changed ? out : rows;
}
