// ============================================================================
// HIỆU CHỈNH ĐỒNG HỒ MÁY (quyết định R8 — docs/designs/xuong-checkin.md)
// Máy gọi GET /api/xuong/time mỗi lần đồng bộ, tự đo thời gian đi về để tính lệch = giờ server − giờ máy.
// Mỗi sự kiện mang lệch gần nhất đo TRƯỚC lúc bấm (lech_ms). Máy phát hiện đổi giờ (Date.now() lệch khỏi
// performance.now()) thì gắn sau_doi_gio = true cho các sự kiện bấm sau mốc đó tới khi đo lệch mới.
// Server: giờ dùng để đo = device_ts + lech_ms, và gắn cờ những trường hợp không tin được.
// ============================================================================

/** Ngưỡng lệch đồng hồ gắn cờ (Open Question 8 — mặc định 5 phút, đổi khi chốt) */
export const NGUONG_LECH_MS = 5 * 60_000;
/** Cho phép giờ bấm (đã hiệu chỉnh) vượt giờ server tối đa bao nhiêu trước khi coi là "giờ tương lai" */
export const DUNG_SAI_TUONG_LAI_MS = 2 * 60_000;

export interface KetQuaHieuChinh {
  /** device_ts_hieu_chinh (ms) */
  ts: number;
  co: string[];
}

export function hieuChinhGio(
  deviceTs: number,
  lechMs: number | null | undefined,
  sauDoiGio: boolean | undefined,
  serverNow: number,
): KetQuaHieuChinh {
  const co: string[] = [];
  const lech = typeof lechMs === 'number' && Number.isFinite(lechMs) ? Math.round(lechMs) : null;
  if (lech === null) co.push('chua_do_lech');
  else if (Math.abs(lech) > NGUONG_LECH_MS) co.push('lech_dong_ho_lon');
  if (sauDoiGio) co.push('doi_gio_may');
  const ts = deviceTs + (lech ?? 0);
  if (ts > serverNow + DUNG_SAI_TUONG_LAI_MS) co.push('gio_tuong_lai');
  return { ts, co };
}

/**
 * Lệch đồng hồ tính ở máy từ một lần gọi /api/xuong/time: t0, t1 là giờ máy lúc gửi và lúc nhận,
 * serverNow là giờ server trả về. Giả định đường đi và về bằng nhau.
 * (Hàm thuần dùng chung ý tưởng với frontend; backend giữ để test hợp đồng.)
 */
export const tinhLech = (t0: number, t1: number, serverNow: number): number =>
  Math.round(serverNow - (t0 + t1) / 2);
