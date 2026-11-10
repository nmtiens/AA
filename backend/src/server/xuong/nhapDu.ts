import type { Pool } from 'pg';

/** Đã nhập kho đủ: đủ tiền HOẶC đủ số lượng, không dùng ngưỡng 98% (cùng quy tắc frontend utils/productionMetrics.daNhapDu) */
export const daNhapDu = (triGia: number, nhapKho: number, duSoLuong = false): boolean =>
  duSoLuong || (triGia > 0 && Math.max(nhapKho, 0) >= triGia);

/** HEX đã nhập đủ số lượng đơn hàng (bảng sản xuất) */
export async function hexDuSoLuong(pool: Pick<Pool, 'query'>, hex: string[]): Promise<Set<string>> {
  if (!hex.length) return new Set();
  const r = await pool.query(
    `SELECT hex::text AS hex FROM production_status_app
     WHERE hex::text = ANY($1::text[]) AND so_luong_don_hang_tong > 0 AND so_luong_nhap_kho_luy_ke >= so_luong_don_hang_tong`, [hex]);
  return new Set(r.rows.map(x => String(x.hex)));
}
