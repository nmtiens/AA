// Quân số thực và số Chờ nhận dùng chung cho Tổng quan và Báo cáo Xưởng.
import type { PoolClient } from 'pg';

/**
 * Quân số thực của 1 ngày-tổ theo loại ca. Ca có điểm danh tính theo người có mặt (đúng số allocation dùng),
 * không thì theo số chốt. Ca Chủ nhật là ca chính của ngày đó.
 */
export const quanSoThucTe = (chot: Record<string, number>, coMat: Partial<Record<string, Array<{ mnv: string }>>>): Record<string, number> => {
  const q: Record<string, number> = { ...chot };
  for (const [ca, ds] of Object.entries(coMat)) if (ds?.length) q[ca] = new Set(ds.map(d => d.mnv)).size;
  if (q.chinh === undefined && q.chu_nhat !== undefined) { q.chinh = q.chu_nhat; delete q.chu_nhat; }
  return q;
};

export interface CapChoNhan { to_id: number | string; hex: string; cong_doan_id: string }
type GioiHan = { moc: number | null; daNhan: number };

/** Bỏ dòng đã nhận đủ mốc. Tổng xưởng đếm cặp hạng mục × công đoạn khác nhau, không cộng các tổ */
export const gomChoNhan = (cap: CapChoNhan[], gh: Map<string, GioiHan>) => {
  const theoTo = new Map<number, number>();
  const cacCap = new Set<string>();
  for (const x of cap) {
    const k = `${x.hex}|${x.cong_doan_id}`;
    const g = gh.get(k);
    if (g && g.moc !== null && g.moc - g.daNhan <= 0.0005) continue;
    theoTo.set(Number(x.to_id), (theoTo.get(Number(x.to_id)) ?? 0) + 1);
    cacCap.add(k);
  }
  return { theoTo, tong: cacCap.size };
};

/** toIds = null: mọi tổ đang hoạt động của xưởng */
export async function demChoNhan(
  db: Pick<PoolClient, 'query'>, xuong: string, toIds: number[] | null,
  gioiHan: (db: Pick<PoolClient, 'query'>, pairs: Array<[string, string]>) => Promise<Map<string, GioiHan>>,
) {
  const cap = (await db.query(
    `SELECT tc.to_id, s.hex, s.cong_doan_id FROM xuong_to t JOIN xuong_to_cong_doan tc ON tc.to_id = t.id
       JOIN xuong_trang_thai s ON s.cong_doan_id = tc.cong_doan_id AND s.trang_thai <> 'xong' AND s.sl_giao_den > s.sl_nhan
     WHERE t.xuong = $1 AND ($2::int[] IS NULL AND t.active OR t.id = ANY($2::int[]))`, [xuong, toIds])).rows as CapChoNhan[];
  return gomChoNhan(cap, await gioiHan(db, cap.map(x => [String(x.hex), String(x.cong_doan_id)] as [string, string])));
}
