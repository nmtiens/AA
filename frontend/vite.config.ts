import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Vướng mắc sản xuất',
        short_name: 'Vướng mắc',
        start_url: '/m/vuong-mac',
        scope: '/',
        display: 'standalone',
        theme_color: '#b91c1c',
        background_color: '#f8fafc',
        icons: [
          { src: '/icons/192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [{
          urlPattern: /\/api\/vuong-mac\/all/,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'vm-api',
            networkTimeoutSeconds: 5,
            expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 },
          },
        }],
      },
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
  build: { chunkSizeWarningLimit: 1000 },
  optimizeDeps: { include: ['recharts'] },
});