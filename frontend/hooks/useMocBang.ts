import { useEffect, useRef, useState } from 'react';
import { theoDoiMocBang, type NhomDuLieu } from '../services/mocDuLieu';

/**
 * Số đếm tăng mỗi lần một trong các nhóm dữ liệu `nhom` có dữ liệu mới trên máy chủ. Đưa vào deps của effect tải API để
 * gọi lại; số đang hiện PHẢI giữ nguyên tới khi số mới về (không bật vòng chờ, không xoá dữ liệu đang hiện).
 * Bắt đầu từ 0, không tăng lúc gắn => thêm vào deps không sinh thêm lần gọi nào.
 */
export function useMocBang(nhom: readonly NhomDuLieu[]): number {
  const [dem, setDem] = useState(0);
  const ref = useRef(nhom);
  ref.current = nhom;
  useEffect(() => theoDoiMocBang(doi => { if (ref.current.some(k => doi.has(k))) setDem(n => n + 1); }), []);
  return dem;
}
