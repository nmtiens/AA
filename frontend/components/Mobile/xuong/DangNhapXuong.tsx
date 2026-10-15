import type { ReactNode } from 'react';
import { Factory } from 'lucide-react';
import { TrangDangNhap } from '../../DangNhapChung';

// ============================================================================
// ĐĂNG NHẬP APP MRA — trang riêng của app MRA (tách hẳn app Vướng mắc); luồng và giao diện dùng chung với trang máy tính
// (components/DangNhapChung.tsx: Đăng nhập · Ghi nhớ · Quên mật khẩu qua mã OTP). "Ghi nhớ" bật sẵn để app đã cài giữ
// được phiên; báo rõ khi mất sóng (lần đầu cần sóng).
// ============================================================================

export default function DangNhapXuong({ onSuccess, ghiChu }: {
  onSuccess: () => void;
  /** Dòng nhắc phía trên (vd. còn thao tác chưa gửi trên máy) */
  ghiChu?: ReactNode;
}) {
  return (
    <TrangDangNhap bieuTuong={<Factory className="h-7 w-7" strokeWidth={2} aria-hidden />}
      ten="MRA" moTa="Ghi việc của tổ: nhận hàng, bắt đầu, xong — giao" chan="Tài khoản do quản trị viên cấp · © 2026 Operations Hub"
      macDinhGhiNho baoMatSong ghiChu={ghiChu} sauDangNhap={onSuccess} />
  );
}
