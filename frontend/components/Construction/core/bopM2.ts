// BOP-M2 — tình trạng vật liệu (M001…M008) từ file Excel công trình của PC (G:\…\001_PROJECT\01_SOURCE\<tên>_CTxx-xxx.xlsx).
// Sheet 02_DATA: mỗi dòng 1 HEX, 9 cột "BOP-M2 <nhóm vật tư>" + "TÌNH TRẠNG BOP-M2 FINAL" (file tự tính từ 03_MATERIALS).
// Sheet 03_MATERIALS: mỗi dòng 1 vật liệu (code, mẫu, PR, ngày về…) + cột BOP-M2 — không có HEX.
// Hàm thuần (không React). Bảng hiển thị làm ĐÚNG như 2 pivot của sheet 01_REPORT trong file mẫu PC:
//   PivotTable3 (II. BOM - theo danh mục vật liệu): nguồn MATERIALS, dòng NHÓM VẬT TƯ, cột BOP-M2,
//     lọc PHÂN LOẠI NHU CẦU ĐẶT MUA (mặc định tất cả), giá trị Count of CODE VẬT LIỆU (ô CODE trống không đếm).
//   PivotTable2 (3/ Tình trạng vật tư theo đơn hàng): nguồn DATA, dòng PHÂN LOẠI NHÓM SẢN PHẨM, cột TÌNH TRẠNG
//     BOP-M2 FINAL, lọc TÌNH TRẠNG IPO FINAL, giá trị Count of HEX.
// Ô trống hiện "(blank)" như Excel; giá trị lỗi của file (vd #N/A) giữ nguyên chữ.
import type { WorkBook } from 'xlsx';

export const BOP_M2: { ma: string; ten: string; mau: string }[] = [
  { ma: 'M001', ten: 'Chưa trình mẫu', mau: '#ef4444' },
  { ma: 'M002', ten: 'Đang trình mẫu', mau: '#f97316' },
  { ma: 'M003', ten: 'Đã duyệt mẫu', mau: '#f59e0b' },
  { ma: 'M004', ten: 'PC đã nhận mẫu', mau: '#eab308' },
  { ma: 'M005', ten: 'Lập PR', mau: '#38bdf8' },
  { ma: 'M006', ten: 'Lập PO', mau: '#3b82f6' },
  { ma: 'M007', ten: 'Đã nhập kho', mau: '#10b981' },
  { ma: 'M008', ten: 'Chỉ định hoàn thiện bề mặt', mau: '#94a3b8' },
];
export const NHOM_VAT_TU = ['GỖ', 'TẤM VÁN', 'VẢI/DA/MÂY', 'KIM LOẠI', 'KÍNH', 'ĐÁ', 'PHỤ KIỆN', 'GIA CÔNG', 'KHÁC'] as const;

export interface HexM2 {
  hex: string; maNm: string; hangMuc: string; nhomSp: string; xuong: string;
  /** TÌNH TRẠNG IPO FINAL (đúng cột lọc của pivot; không lấy TÌNH TRẠNG IPO thay) */
  ipo: string; bop: string;
  /** Tình trạng theo nhóm vật tư (chỉ nhóm có ghi) */
  m2: Partial<Record<string, string>>;
  final: string;
}
export interface VatLieuM2 {
  nhom: string; code: string; moTa: string; ttMau: string; ngayDuyet: string; nhuCau: string; ghiChu: string;
  ttPr: string; ngayPr: string; ngayDuKien: string; ngayVe: string; m: string;
}
export interface DuLieuM2 { nguon: string; maCt: string; docLuc: string; hex: HexM2[]; vatLieu: VatLieuM2[] }

const chu = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    // SheetJS (cellDates) trả ngày lệch vài giây trước nửa đêm giờ máy => làm tròn tới giờ gần nhất rồi mới lấy ngày
    const d = new Date(Math.round(v.getTime() / 3_600_000) * 3_600_000);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }
  return String(v).trim();
};
const chuan = (s: unknown) => chu(s).replace(/\s+/g, ' ').toUpperCase();

/** Dòng tiêu đề = dòng đầu (trong 10 dòng) có ô đúng bằng `moc` */
const bangTheoTieuDe = (XLSX: typeof import('xlsx'), wb: WorkBook, sheet: string, moc: string) => {
  const ws = wb.Sheets[sheet];
  if (!ws) throw new Error(`File không có sheet "${sheet}"`);
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  const i = aoa.slice(0, 10).findIndex(r => r.some(v => chuan(v) === moc));
  if (i < 0) throw new Error(`Sheet "${sheet}" không có cột "${moc}"`);
  const cot = new Map<string, number>();
  aoa[i].forEach((v, j) => { const k = chuan(v); if (k && !cot.has(k)) cot.set(k, j); });
  const lay = (r: unknown[], ten: string) => { const j = cot.get(ten); return j === undefined ? '' : chu(r[j]); };
  return { dong: aoa.slice(i + 1), lay };
};

export async function docFileBopM2(buf: ArrayBuffer, tenFile: string, now = new Date()): Promise<DuLieuM2> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'array', cellDates: true, sheets: ['02_DATA', '03_MATERIALS'] });
  const d = bangTheoTieuDe(XLSX, wb, '02_DATA', 'HEX');
  let maCt = '';
  const hex: HexM2[] = [];
  for (const r of d.dong) {
    const h = d.lay(r, 'HEX');
    if (!h) continue;
    maCt ||= d.lay(r, 'MÃ CÔNG TRÌNH');
    const m2: Partial<Record<string, string>> = {};
    for (const n of NHOM_VAT_TU) { const v = d.lay(r, `BOP-M2 ${n}`); if (v) m2[n] = v; }
    hex.push({
      hex: h, maNm: d.lay(r, 'MÃ NHÀ MÁY'), hangMuc: d.lay(r, 'TÊN HẠNG MỤC'), nhomSp: d.lay(r, 'PHÂN LOẠI NHÓM SẢN PHẨM'),
      xuong: d.lay(r, 'XƯỞNG CHÍNH'), ipo: d.lay(r, 'TÌNH TRẠNG IPO FINAL'), bop: d.lay(r, 'BOP'),
      m2, final: d.lay(r, 'TÌNH TRẠNG BOP-M2 FINAL'),
    });
  }
  const vatLieu: VatLieuM2[] = [];
  if (wb.Sheets['03_MATERIALS']) {
    const m = bangTheoTieuDe(XLSX, wb, '03_MATERIALS', 'CODE VẬT LIỆU');
    for (const r of m.dong) {
      const code = m.lay(r, 'CODE VẬT LIỆU'), moTa = m.lay(r, 'MÔ TẢ VẬT LIỆU');
      if (!code && !moTa) continue;
      vatLieu.push({
        nhom: m.lay(r, 'NHÓM VẬT TƯ'), code, moTa, ttMau: m.lay(r, 'TÌNH TRẠNG MẪU'), ngayDuyet: m.lay(r, 'NGÀY DUYỆT MẪU'),
        nhuCau: m.lay(r, 'PHÂN LOẠI NHU CẦU ĐẶT MUA'), ghiChu: m.lay(r, 'GHI CHÚ'), ttPr: m.lay(r, 'TÌNH TRẠNG PR'),
        ngayPr: m.lay(r, 'NGÀY PR'), ngayDuKien: m.lay(r, 'NGÀY DỰ KIẾN GIAO HÀNG PMH NHẬP'), ngayVe: m.lay(r, 'NGÀY THỰC TẾ VỀ'),
        m: m.lay(r, 'BOP-M2'),
      });
    }
  }
  if (!hex.length) throw new Error('Sheet 02_DATA không có dòng HEX nào');
  return { nguon: tenFile, maCt, docLuc: now.toISOString(), hex, vatLieu };
}

/** File có đúng công trình đang xem không (so mã CTxx-xxx trong tên công trình) */
export const khopCongTrinh = (d: DuLieuM2, tenCongTrinh: string): boolean => {
  const ma = (d.maCt || d.nguon.match(/CT\d{2}-\d{3}/i)?.[0] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return !!ma && tenCongTrinh.toUpperCase().replace(/[^A-Z0-9]/g, '').includes(ma);
};

export const TRONG_M2 = '(blank)';
const sapChu = (a: string, b: string) => a.localeCompare(b, 'vi', { numeric: true });
/** Xếp tăng dần như pivot Excel, (blank) cuối */
const sapPivot = (a: string, b: string) => (a === TRONG_M2 ? 1 : b === TRONG_M2 ? -1 : sapChu(a, b));

/** Pivot đếm: dòng × cột + tổng dòng / cột (Grand Total), chỉ hiện dòng / cột có số */
export function pivotM2<T>(ds: T[], dongOf: (x: T) => string, cotOf: (x: T) => string) {
  const rows = new Map<string, { cells: Record<string, number>; total: number }>();
  const colTot: Record<string, number> = {};
  for (const x of ds) {
    const k = dongOf(x) || TRONG_M2, m = cotOf(x) || TRONG_M2;
    const r = rows.get(k) ?? { cells: {}, total: 0 };
    r.cells[m] = (r.cells[m] ?? 0) + 1; r.total++;
    rows.set(k, r);
    colTot[m] = (colTot[m] ?? 0) + 1;
  }
  return { rows, keys: [...rows.keys()].sort(sapPivot), cols: Object.keys(colTot).sort(sapPivot), colTot, tong: ds.length };
}

/** Các giá trị của 1 cột lọc (page field), xếp như pivot */
export const giaTriLoc = <T>(ds: T[], of: (x: T) => string) => [...new Set(ds.map(x => of(x) || TRONG_M2))].sort(sapPivot);
