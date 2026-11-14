// Ghép số theo FILE CÔNG TRÌNH vào dòng dữ liệu app (thuần — dùng chung trình duyệt và máy chủ qua '@tong-quan/core').
// Máy chủ (GET /api/cong-trinh/hang-muc, backend/src/server/congTrinh.ts) gửi mọi HEX có trong file + các ô file KHÁC dữ liệu app.
// Ở đây lấy dòng dữ liệu app (production_status_app, đã gộp tên / xưởng) cùng HEX rồi đè các ô khác:
//   - phạm vi trang = các HEX trong file (công trình không có file không hiện)
//   - cột file không có (số ngày ở công đoạn, ngày nhận từ PM, tình trạng bản vẽ / phiếu, nhóm CT, BOT dự án...) giữ của app
import type { ColumnDefinition, DataRow } from '../../../types';
import { workshopGroupOf } from '../../../utils/workshopGroupsCore';
import { canonicalProjectName, canonicalizePersonNames, canonicalizeProjectNames } from '../../../utils/productionMetrics';

export type DoiFile = Record<string, unknown> | 0;
export interface DuLieuFileCongTrinh {
  coBang: boolean;
  capNhat: string | null;
  soFile: number;
  cot: string[];
  /** [HEX, ô file khác app | 0] — mỗi HEX 1 dòng */
  dong: [string, DoiFile][];
}

/** Có dùng được số theo file không (đã tạo bảng và tool đã nạp file) */
export const coSoFile = (d: DuLieuFileCongTrinh | null | undefined): d is DuLieuFileCongTrinh => !!d && d.coBang && d.dong.length > 0;

/**
 * Dòng của trang = dòng app cùng HEX, đè ô file khác. HEX chưa có trong app (file mới hơn dữ liệu app) => dòng chỉ có số file.
 * Ô đè được gộp tên như dữ liệu app (xưởng theo Setup gộp xưởng, tên công trình theo bảng tên, tên PM / PC).
 * Dòng không có ô khác giữ nguyên object của app (rẻ, ~31k dòng).
 */
export function ghepDongFile(app: readonly DataRow[], columns: ColumnDefinition[], hexKey: string, d: DuLieuFileCongTrinh): DataRow[] {
  const theoHex = new Map<string, DataRow>();
  for (const r of app) {
    const h = String(r[hexKey] ?? '').trim();
    if (h && !theoHex.has(h)) theoHex.set(h, r);
  }
  let doiNguoi = false, doiTen = false;
  const ra = d.dong.map(([hex, doi]): DataRow => {
    const goc = theoHex.get(hex);
    if (!doi) return goc ?? { [hexKey]: hex };
    const dong: DataRow = goc ? { ...goc } : { [hexKey]: hex };
    for (const [k, v] of Object.entries(doi)) {
      if (k === 'xuong_chinh') dong[k] = v == null || v === '' ? v as null : workshopGroupOf(v);
      else if (k === 'ten_cong_trinh') { dong[k] = v == null ? null : canonicalProjectName(v); doiTen = true; }
      else {
        if (k === 'ma_cong_trinh') doiTen = true;
        if (k === 'ten_pm' || k === 'ten_pc') doiNguoi = true;
        dong[k] = v as DataRow[string];
      }
    }
    return dong;
  });
  // Tên công trình / mã từ file: gộp về 1 tên theo mã như dữ liệu app (lọc / bấm theo tên mới khớp);
  // tên PM / PC: gộp cách viết như dữ liệu app (cả 2 tính trên cả tập dòng)
  const raTen = doiTen ? canonicalizeProjectNames(ra, columns) : ra;
  return doiNguoi ? canonicalizePersonNames(raTen, columns) : raTen;
}
