import { useEffect, useState } from 'react';
import { theoDoiMoc } from '../services/nhoApi';

/**
 * Số đếm tăng mỗi lần dữ liệu máy chủ đổi (App gọi baoMocDoi sau check-versions thấy chữ ký phiên bản / ngày khác lần
 * trước). Đưa vào deps của effect tải số tổng hợp để gọi lại API; số đang hiện giữ nguyên tới khi số mới về.
 * Bắt đầu từ 0 và không tăng lúc gắn, nên thêm vào deps không sinh thêm lần gọi nào.
 */
export function useMocDuLieu(): number {
  const [dem, setDem] = useState(0);
  useEffect(() => theoDoiMoc(() => setDem(n => n + 1)), []);
  return dem;
}
