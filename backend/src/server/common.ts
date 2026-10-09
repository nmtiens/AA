import { pool } from '../db.js';

// Giới hạn số query chạy song song, tránh 1 request xin quá nhiều connection
// cùng lúc từ transaction-mode pooler (pool phía server rất nhỏ và dùng chung).
export async function runWithLimit<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let idx = 0;
  const worker = async () => {
    while (idx < tasks.length) {
      const current = idx++;
      results[current] = await tasks[current]();
    }
  };
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ============================================================================
// ============================================================================
// HẰNG SỐ QUY ĐỔI TIỀN TỆ
// Dữ liệu tiền trong DB (thanh_tien_nhap_kho, thanh_tien_ke_hoach...) lưu theo
// đơn vị TRIỆU ĐỒNG. Dashboard hiển thị theo TỶ ĐỒNG => chia 1000.
// ============================================================================
export const TRIEU_TO_TY = 1_000;
export const TARGET_WORKSHOPS = ['2A', '3A', '4A', '5A', '8AB', '8C'];
// Năm mặc định của /api/revenue tính MỖI LẦN GỌI theo giờ VN (trước đây cố định lúc
// server khởi động, nên instance chạy qua giao thừa vẫn trả năm cũ).
export const currentVnYear = (): number => Number(vnDayKey(new Date()).slice(0, 4));

// Ngưỡng coi là "đã cập nhật" (giờ). Đổi số này nếu muốn nới/siết.
// "Đã cập nhật" = lần cập nhật cuối rơi vào NGÀY HÔM NAY theo giờ Việt Nam
// (không còn tính cửa sổ trượt 24h).
export const VN_TZ = 'Asia/Ho_Chi_Minh';

// Trước giờ này (giờ VN), cập nhật của HÔM QUA vẫn được tính là "đã cập nhật",
// vì ETL chưa kịp chạy. Đặt 0 để tắt hoàn toàn (đúng 00:00 là chuyển đỏ hết).
// Ví dụ ETL chạy khoảng 8-11h sáng -> đặt 12.
export const GRACE_UNTIL_HOUR = 0;

// 'en-CA' cho ra định dạng YYYY-MM-DD, tính theo giờ VN chứ không phải UTC
export const vnDayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: VN_TZ });
export const vnHourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: VN_TZ, hour: '2-digit', hourCycle: 'h23',
});
export const vnDayKey = (d: Date): string => vnDayFormatter.format(d);
export const vnHour = (d: Date): number => Number(vnHourFormatter.format(d));
// "Hôm nay" theo giờ VN, biểu diễn bằng 00:00 UTC của ngày đó — khớp cách các route
// overview tính toán (toISOString().slice(0,10), getUTC*). Dùng thay cho new Date() khi
// client không gửi ngày: tránh việc từ 0h-7h sáng giờ VN, "hôm nay" bị tính thành hôm qua.
export const vnTodayUtc = (): Date => new Date(`${vnDayKey(new Date())}T00:00:00Z`);

// ----------------------------------------------------------------------------
// Tuần ISO -> khoảng ngày, cắt trong năm dương lịch (cùng cách bảng KHSX đánh số tuần: 29–31/12/2025 là
// tuần 53 của 2025, 01–04/01/2026 là tuần 1 của 2026). Tính ở Node thay vì to_date('IYYY-IW') cho TỪNG
// dòng nhập kho trong SQL (trước mất ~3s khi xem KHSX theo tuần).
// Trả null khi tuần không có ngày nào trong năm (vd. tuần 53 của năm chỉ có 52 tuần).
// ----------------------------------------------------------------------------
const isoDateStr = (d: Date) => d.toISOString().slice(0, 10);
export const isoWeekRangeInYear = (year: number, week: number): { start: string; end: string } | null => {
  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) return null;
  // Thứ Hai của tuần ISO 1 = thứ Hai của tuần chứa ngày 4/1
  const jan4 = Date.UTC(year, 0, 4);
  const dow = (new Date(jan4).getUTCDay() + 6) % 7; // Thứ Hai = 0
  const monday = jan4 - dow * 86_400_000 + (week - 1) * 7 * 86_400_000;
  const sunday = monday + 6 * 86_400_000;
  const yStart = Date.UTC(year, 0, 1);
  const yEnd = Date.UTC(year, 11, 31);
  const start = Math.max(monday, yStart);
  const end = Math.min(sunday, yEnd);
  if (start > end) return null;
  return { start: isoDateStr(new Date(start)), end: isoDateStr(new Date(end)) };
};
