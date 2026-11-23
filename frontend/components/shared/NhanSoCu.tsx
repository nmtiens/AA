import React, { useSyncExternalStore } from 'react';
import { theoDoiNho, trangThaiNho } from '../../services/nhoApi';

// Nhãn nhỏ cạnh tiêu đề trang: chỉ hiện khi có API gọi lỗi trong lúc trang đang hiện số đã lưu của chính API đó
// (mất mạng / máy chủ lỗi) — để người xem biết số trên màn hình chưa phải số mới. Mạng lấy lại được thì tự ẩn.

const gioPhut = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const NhanSoCu: React.FC<{ className?: string }> = ({ className }) => {
  const tt = useSyncExternalStore(theoDoiNho, trangThaiNho, trangThaiNho);
  if (!tt.loi || tt.t === null) return null;
  return (
    <span role="status" title="Không gọi được máy chủ; số trên trang là số đã lưu trên máy này"
      className={`inline-flex items-center rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 ${className ?? ''}`}>
      Đang hiện số lưu lúc {gioPhut(tt.t)}, chưa cập nhật được
    </span>
  );
};

export default NhanSoCu;
