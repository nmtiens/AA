// ============================================================================
// GIỜ ĐỂ DB NGỦ — gói miễn phí Layerbase bắt DB ngủ ≥ 25% thời gian mỗi 7 ngày (~6 giờ/ngày); DB chỉ ngủ khi
// không có kết nối nào một lúc. Cron hẹn giờ (dựng sẵn Tổng quan, nhắc hạn BOT, warmup) nếu gọi suốt đêm sẽ giữ
// DB thức 24/7 => bị tạm dừng (20/10/2026). Trong khung giờ này các việc đó trả về ngay, không chạm DB.
//   DB_GIO_NGHI="22-6"  (mặc định: 22h tối tới 6h sáng giờ Việt Nam) · "tat" = tắt (cron chạy cả đêm)
// ============================================================================

const gioVN = (d: Date) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hour12: false }).format(d)) % 24;

/** Khung giờ nghỉ [từ, tới) theo giờ VN; null = tắt */
export const khungGioNghi = (giaTri = process.env.DB_GIO_NGHI): [number, number] | null => {
  const s = (giaTri ?? '22-6').trim().toLowerCase();
  if (!s || s === 'tat' || s === 'off') return null;
  const m = s.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (!m) return [22, 6];
  const tu = Number(m[1]) % 24, toi = Number(m[2]) % 24;
  return tu === toi ? null : [tu, toi];
};

/** Đang trong giờ để DB ngủ (khung có thể qua nửa đêm, vd. 22–6) */
export const laGioNghiDb = (now = new Date(), giaTri?: string): boolean => {
  const k = khungGioNghi(giaTri);
  if (!k) return false;
  const h = gioVN(now);
  const [tu, toi] = k;
  return tu < toi ? h >= tu && h < toi : h >= tu || h < toi;
};
