import { z } from 'zod';

// ============================================================================
// VIEW PROJECT MAPPING — danh sách công trình của từng nhóm (Luồng đỏ, Căn mẫu...)
// ở bảng view_project_mapping (view_id, projects jsonb).
//  - view_id thường ('luong-do'...): projects = string[] (tên công trình, thứ tự = ưu tiên) — như cũ.
//  - view_id '<viewId>:thu-tu': projects = { ten, stt, luong }[] — STT người dùng gõ (cho trùng, cho bỏ số)
//    và luồng đỏ / vàng của từng công trình. Lưu kèm cùng lúc với danh sách (cùng giao dịch), không đổi cấu trúc DB.
// ============================================================================

export const HAU_TO_THU_TU = ':thu-tu';
export const khoaThuTu = (viewId: string) => `${viewId}${HAU_TO_THU_TU}`;
export const laKhoaThuTu = (viewId: string) => viewId.endsWith(HAU_TO_THU_TU);

export const thuTuCongTrinhSchema = z.object({
  ten: z.string().trim().min(1).max(300),
  stt: z.number().int().min(1).max(9999),
  luong: z.enum(['do', 'vang']),
});
export type ThuTuCongTrinh = z.infer<typeof thuTuCongTrinhSchema>;

export const viewMappingSchema = z.object({
  projects: z.array(z.string().max(300)).max(2000),
  /** Không gửi = giữ nguyên thứ tự đã lưu (client cũ chỉ gửi projects). */
  thuTu: z.array(thuTuCongTrinhSchema).max(2000).optional(),
});
export type ViewMappingBody = z.infer<typeof viewMappingSchema>;

type Query = (sql: string, params: unknown[]) => Promise<unknown>;

const UPSERT = `INSERT INTO view_project_mapping (view_id, projects, updated_at)
  VALUES ($1, $2::jsonb, now())
  ON CONFLICT (view_id) DO UPDATE
  SET projects = EXCLUDED.projects, updated_at = now()`;

/** Ghi danh sách (và thứ tự nếu có) của 1 nhóm. Gọi trong 1 giao dịch để 2 dòng luôn khớp nhau.
 *  Trả lỗi (chuỗi) khi viewId là khoá thứ tự — không cho ghi đè dòng thứ tự bằng mảng chuỗi. */
export async function luuViewMapping(query: Query, viewId: string, body: ViewMappingBody): Promise<string | null> {
  if (!viewId || laKhoaThuTu(viewId)) return 'viewId không hợp lệ';
  await query(UPSERT, [viewId, JSON.stringify(body.projects)]);
  if (body.thuTu) await query(UPSERT, [khoaThuTu(viewId), JSON.stringify(body.thuTu)]);
  return null;
}

/** Dòng DB -> bản GET: dòng thường giữ string[] (bỏ phần tử không phải chuỗi), dòng thứ tự giữ object hợp lệ. */
export function docViewMapping(rows: { view_id: string; projects: unknown }[]): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const row of rows) {
    const arr = Array.isArray(row.projects) ? row.projects : [];
    out[row.view_id] = laKhoaThuTu(row.view_id)
      ? arr.filter(x => thuTuCongTrinhSchema.safeParse(x).success)
      : arr.filter(x => typeof x === 'string');
  }
  return out;
}
