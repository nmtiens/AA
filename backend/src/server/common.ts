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
