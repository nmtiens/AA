import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// PWA: dùng service worker tự viết ở public/sw.js (có xử lý Web Push cho "Vướng mắc")
// và 2 manifest ở public/ (manifest.webmanifest cho /m/, manifest-desktop.webmanifest
// cho desktop — index.html tự chọn). KHÔNG dùng vite-plugin-pwa nữa: plugin này sinh
// dist/sw.js + manifest.webmanifest trùng tên, ghi đè file tự viết khi build và làm
// mất phần xử lý thông báo đẩy. Đăng ký service worker nằm ở index.tsx.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
  build: { chunkSizeWarningLimit: 1000 },
  optimizeDeps: { include: ['recharts'] },
});
