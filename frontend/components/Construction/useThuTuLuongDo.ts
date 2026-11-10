import { useMemo } from 'react';
import { phienBanViewMapping, thuTuNhomCua } from './utils/viewDataConfig';
import type { ThuTuTra } from './core/thuTuNhom';

/** Thứ tự + luồng (đỏ / vàng) theo danh sách nhóm Luồng đỏ (Setup dữ liệu → Nhóm công trình) — áp cho mọi nhóm đang xem
 *  của trang Công trình: công trình trong danh sách lên đầu theo STT, tô màu theo luồng. Trả hàm tra (null = ngoài luồng). */
export function useThuTuLuongDo(): (tenCongTrinh: unknown) => ThuTuTra | null {
  const phienBan = phienBanViewMapping();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => thuTuNhomCua('luong-do'), [phienBan]);
}
