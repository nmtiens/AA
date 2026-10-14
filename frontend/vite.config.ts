import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// PWA: dùng service worker tự viết ở public/sw.js (có xử lý Web Push cho "Vướng mắc")
// và 2 manifest ở public/ (manifest.webmanifest cho /m/, manifest-desktop.webmanifest
// cho desktop — index.html tự chọn). KHÔNG dùng vite-plugin-pwa nữa: plugin này sinh
// dist/sw.js + manifest.webmanifest trùng tên, ghi đè file tự viết khi build và làm
// mất phần xử lý thông báo đẩy. Đăng ký service worker nằm ở index.tsx.
// App Xưởng (/xuong) cài riêng: trang HTML riêng ghi SẴN manifest / tên / tiêu đề Xưởng. Trước đây dùng chung
// index.html (ghi sẵn manifest Vướng mắc, script mới đổi sang manifest Xưởng) => Chrome điện thoại có lúc lấy manifest
// Vướng mắc, bấm "Cài đặt" lại mở app Vướng mắc. vercel.json trả xuong.html cho /xuong (và đường cũ /m/xuong).
function trangXuong(): Plugin {
  return {
    name: 'trang-xuong',
    apply: 'build',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      const goc = bundle['index.html'];
      if (!goc || goc.type !== 'asset') this.error('Không thấy index.html để dựng xuong.html');
      let html = String(goc.source);
      const doi = (a: string, b: string) => {
        if (!html.includes(a)) this.error(`xuong.html: không thấy "${a}" trong index.html`);
        html = html.replace(a, b);
      };
      doi('href="/manifest.webmanifest"', 'href="/manifest-xuong.webmanifest"');
      doi('<meta name="apple-mobile-web-app-title" content="Vướng mắc" />', '<meta name="apple-mobile-web-app-title" content="MRA" />');
      doi('<meta name="theme-color" content="#f1f4f9" />', '<meta name="theme-color" content="#f4f6fa" />');
      doi('<title>Operations Hub</title>', '<title>MRA</title>');
      this.emitFile({ type: 'asset', fileName: 'xuong.html', source: html });
    },
  };
}

export default defineConfig({
  plugins: [react(), trangXuong()],
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
  build: { chunkSizeWarningLimit: 1000 },
  optimizeDeps: { include: ['recharts'] },
});
