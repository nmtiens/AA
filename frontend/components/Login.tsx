import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import { TrangDangNhap } from './DangNhapChung';

// Trang đăng nhập Operations Hub (máy tính) — luồng và giao diện dùng chung với app Vướng mắc / app MRA
// (components/DangNhapChung.tsx: Đăng nhập · Ghi nhớ · Quên mật khẩu qua mã OTP).
const Login: React.FC = () => {
  const navigate = useNavigate();
  return (
    <TrangDangNhap
      bieuTuong={<TrendingUp className="h-7 w-7" strokeWidth={2.25} aria-hidden />}
      ten="Operations Hub" moTa="Theo dõi đơn hàng, sản xuất, kho và xưởng của AA trong một nơi — số liệu cập nhật theo ngày."
      chan="Tài khoản do quản trị viên cấp · © 2026 Operations Hub"
      sauDangNhap={() => {
        const afterLogin = sessionStorage.getItem('after_login');
        if (afterLogin) {
          sessionStorage.removeItem('after_login');
          window.location.replace(afterLogin); // bắt buộc dùng location: /m/ nằm ngoài HashRouter
        } else navigate('/', { replace: true });
      }} />
  );
};

export default Login;
