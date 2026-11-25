import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { installAuthFetch, giuSuat, guiTruocTrang } from './services/authFetch';
import { getToken } from './services/userService';
import { napNho, goiTruoc, docChuDangNhap } from './services/nhoApi';
import { urlGuiTruoc, urlGuiTruocTrang } from './services/urlTongQuan';
import { apDungMayTinhBang } from './services/mayTinhBang';
import { reloadForNewVersion } from './utils/chunkReload';

// Máy tính bảng: gắn <html class="may-tinh-bang"> trước khi vẽ
apDungMayTinhBang();

// Phải gọi TRƯỚC khi render để mọi request /api/* đều mang token
installAuthFetch();

// Gửi trước các API màn đầu ngay lúc tải JS (trước khi React vẽ và /api/auth/me trả lời) để số về sớm hơn 1 chặng
// mạng; trang gắn sau nhận lại đúng các request này (services/nhoApi). Chỉ làm khi còn phiên đăng nhập (đủ token +
// tài khoản, như AuthContext): chưa đăng nhập thì không gọi gì.
try {
  const chu = getToken() ? docChuDangNhap() : null;
  if (chu) {
    // Giữ 1 suất hàng đợi cho /api/auth/me: không thì các request gửi trước lấp đầy 4 suất, trang gắn muộn 1 lượt
    giuSuat(true);
    // Nạp bản lưu số trong ngày của tài khoản này vào RAM; chỉ nạp, không tự đẩy số cũ vào trang
    void napNho(chu);
    // Chỉ gửi trước cho trang Tổng quan / Tổng quan công trình của bản máy tính và khi tài khoản lưu trên máy có
    // quyền xem trang đó — app điện thoại (/m, /xuong) và người không có quyền không phát request thừa
    let u: { role?: unknown; permissions?: unknown } | null = null;
    try { u = JSON.parse(localStorage.getItem('app_user_persist') || sessionStorage.getItem('app_user_session') || 'null'); } catch { /* bỏ qua */ }
    const urls = urlGuiTruoc(window.location.pathname, window.location.hash, u, new Date());
    // Trang Tổng quan đã có 3 số màn đầu đi cùng lượt: chỉ gửi trước /auth/me, phiên bản dữ liệu chờ lượt sau
    const trang = urlGuiTruocTrang(window.location.pathname, window.location.hash, u);
    guiTruocTrang(urls.length ? trang.slice(0, 1) : trang);
    if (urls.length) goiTruoc(urls);
  }
} catch { /* gửi trước chỉ để nhanh hơn: lỗi thì trang tự gọi như cũ */ }

// Vừa deploy bản mới mà tab còn mở bản cũ: file JS tải động (xuất Excel, trang lazy...) của bản cũ không còn (404)
// => tải lại trang 1 lần để lấy bản mới (utils/chunkReload)
window.addEventListener('vite:preloadError', event => {
  if (reloadForNewVersion()) event.preventDefault();
});

// Service worker tự viết (public/sw.js): cache offline + thông báo đẩy "Vướng mắc".
// Chỉ đăng ký ở bản build production để khi dev không bị cache file cũ.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.error('Đăng ký service worker lỗi:', err));
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);