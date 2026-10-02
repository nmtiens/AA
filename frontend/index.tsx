import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { installAuthFetch } from './services/authFetch';

// Phải gọi TRƯỚC khi render để mọi request /api/* đều mang token
installAuthFetch();

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