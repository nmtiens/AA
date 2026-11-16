// ============================================================================
// PHỦ VỊ TRÍ CÔNG ĐOẠN MRA LÊN BẢNG SẢN XUẤT — hàm thuần (không React, không trình duyệt), dùng chung:
//   - trình duyệt: App.tsx phủ canonicalProductionData trước khi đưa vào mọi view;
//   - máy chủ: /api/tong-quan/* và /api/production/hex/:hex (qua '@tong-quan/core').
// Bản đồ MRA lấy từ GET /api/xuong/vi-tri-bop (backend/src/server/xuong/viTriBop.ts).
// Dòng bị phủ: bop / so_ngay_cd_hien_tai = MRA, giữ giá trị PC ở bop_pc / so_ngay_pc, nguon_bop = 'MRA'.
// Chỉ phủ trong bộ nhớ — không ghi IndexedDB / DB.
// ============================================================================
import type { DataRow, ColumnDefinition } from '../../../types';
import { laHuy } from '../../../utils/productionMetrics';
import { extractStage } from './stages';
import { khoaSanXuat } from './tongQuanSanXuat';

export type MaViTriMra = 'P012' | 'P013' | 'P014' | 'P016' | 'P018' | 'P020' | 'P021';

export type ViTriMra = {
  ma: MaViTriMra;
  /** ISO, mốc tính số ngày ở công đoạn */
  tu: string | null;
  /** Tên CĐ chi tiết của (các) dòng được chọn */
  cd: string[];
  /** cho_nhan | da_nhan | dang_lam | tam_ngung | cho_giao, hoặc 'trien_khai' khi chưa có dòng */
  trangThai: string;
};
export type BanDoMra = { ver: string; map: Record<string, ViTriMra> };

/** GCVT (gia công vật tư ngoài) chưa theo dõi trên MRA: giữ PC */
export const PHU_GCVT = false;
/**
 * Công đoạn PC KHÔNG phủ: P022 / P025 (đã vào kho). P001 / P002 VẪN phủ — hạng mục đã triển khai trên MRA
 * là hàng đã vào xưởng, PC còn P001/P002 là PC đang trễ (chủ app chốt).
 */
const KHONG_PHU = new Set(['P022', 'P025']);

/** Nhãn dự phòng khi bảng PC chưa có chuỗi nào của công đoạn đó (theo nhãn phễu usePivotTables) */
export const NHAN_DU_PHONG: Record<MaViTriMra, string> = {
  P012: 'P012. Có phiếu chưa sản xuất',
  P013: 'P013. Ra phôi sơ chế',
  P014: 'P014. Tinh chỉnh định hình',
  P016: 'P016. Lắp ráp tinh chỉnh',
  P018: 'P018. Sơn - làm màu',
  P020: 'P020. Lắp ráp hoàn thiện',
  P021: 'P021. Đóng gói hoàn thành',
};

const NGAY_MS = 86_400_000;

/**
 * Số ngày ở công đoạn theo cách ghi của PC (cột so_ngay_cd_hien_tai):
 * ≤3 ngày "<3 NGÀY", 4–7 "4-7 NGÀY", 8–55 "n TUẦN" (n = ceil(ngày/7), tối đa 7), ≥56 "TỪ 8 TUẦN TRỞ LÊN".
 * Mốc trống / sai: "0" (= chưa có số ngày).
 */
export function soNgayTuMoc(tuIso: string | null | undefined, nowMs: number): string {
  if (!tuIso) return '0';
  const tu = Date.parse(tuIso);
  if (!Number.isFinite(tu)) return '0';
  const d = Math.floor((nowMs - tu) / NGAY_MS);
  if (d <= 3) return '<3 NGÀY';
  if (d <= 7) return '4-7 NGÀY';
  if (d >= 56) return 'TỪ 8 TUẦN TRỞ LÊN';
  // PC chỉ có "2 TUẦN"…"7 TUẦN": 50–55 ngày giữ "7 TUẦN" để không sinh chuỗi mới
  return `${Math.min(Math.ceil(d / 7), 7)} TUẦN`;
}

/** Chuỗi bop hay gặp nhất của từng công đoạn trong bảng PC (để dòng phủ dùng đúng chuỗi PC, không thêm nhóm mới) */
export function nhanTheoMa(rows: DataRow[], bopKey: string): Map<string, string> {
  const dem = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const s = String(row[bopKey] ?? '').trim();
    const st = extractStage(s);
    if (!st) continue;
    let m = dem.get(st);
    if (!m) { m = new Map(); dem.set(st, m); }
    m.set(s, (m.get(s) || 0) + 1);
  }
  const nhan = new Map<string, string>();
  for (const [st, m] of dem) {
    let tot = ''; let n = -1;
    for (const [s, c] of m) if (c > n) { tot = s; n = c; }
    nhan.set(st, tot);
  }
  for (const [ma, s] of Object.entries(NHAN_DU_PHONG)) if (!nhan.has(ma)) nhan.set(ma, s);
  return nhan;
}

/**
 * Phủ vị trí MRA lên bảng sản xuất. Phủ dòng khi: HEX có trong bản đồ, không HỦY, công đoạn PC không phải
 * P022 / P025 (và không phải GCVT khi PHU_GCVT = false); công đoạn PC trống cũng phủ.
 * Không phủ dòng nào thì trả đúng mảng cũ; dòng không phủ giữ nguyên object; không sửa mảng / dòng gốc.
 */
export function phuViTriMra(
  rows: DataRow[], cols: ColumnDefinition[], ban: BanDoMra | null | undefined, nowMs: number, nhan?: Map<string, string>,
): { rows: DataRow[]; soPhu: number } {
  const map = ban?.map;
  if (!map || !rows.length) return { rows, soPhu: 0 };
  const k = khoaSanXuat(cols);
  const bopKey = k.bopKey;
  const soNgayKey = k.daysAtCurrentStageKey;
  let nhanDung = nhan;
  /** Dòng sau khi phủ; null = giữ PC */
  const phu = (row: DataRow): DataRow | null => {
    const hex = String(row[k.hexKey] ?? '').trim();
    const v = hex ? (map[hex] ?? map[hex.toUpperCase()]) : undefined;
    if (!v) return null;
    if (laHuy(row[k.tinhTrangIpoKey]) || laHuy(row[k.tinhTrangKey])) return null;
    const st = extractStage(row[bopKey]);
    if (st && KHONG_PHU.has(st)) return null;
    if (st === 'GCVT' && !PHU_GCVT) return null;
    if (!nhanDung) nhanDung = nhanTheoMa(rows, bopKey);
    return {
      ...row,
      [bopKey]: nhanDung.get(v.ma) ?? NHAN_DU_PHONG[v.ma] ?? v.ma,
      [soNgayKey]: soNgayTuMoc(v.tu, nowMs),
      bop_pc: row[bopKey],
      so_ngay_pc: row[soNgayKey],
      nguon_bop: 'MRA',
      mra_cd: v.cd.join(', '),
      mra_tu: v.tu,
    } as DataRow;
  };
  let out: DataRow[] | null = null;
  let soPhu = 0;
  for (let i = 0; i < rows.length; i++) {
    const moi = phu(rows[i]);
    if (moi) {
      if (!out) out = rows.slice(0, i);
      soPhu++;
    }
    if (out) out.push(moi ?? rows[i]);
  }
  if (!out) return { rows, soPhu: 0 };
  return { rows: out, soPhu };
}

/** Số dòng đang lấy vị trí từ MRA (dùng cho chú thích) */
export function demNguonBop(rows: DataRow[]): number {
  let n = 0;
  for (const r of rows) if (r.nguon_bop === 'MRA') n++;
  return n;
}
