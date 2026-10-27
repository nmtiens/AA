import plugin from 'tailwindcss/plugin';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './**/*.{ts,tsx}', '!./node_modules/**'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        // "wood" là tên cũ (nhiều chỗ dùng wood-600, wood-50...). Giữ tên để không phải sửa component:
        // 50–300 = nền/viền xám trung tính; 400–900 = đỏ thương hiệu AA cho nút chính, mục đang chọn, liên kết.
        // Thiết kế: Figma "Operations Hub – Thiết kế lại" (docs/designs/figma-thiet-ke-lai/).
        wood: {
          50: '#f5f6f8', 100: '#eef0f3', 200: '#e3e6ec', 300: '#c9ced8', 400: '#f07479',
          500: '#e8484d', 600: '#e31e24', 700: '#b3141a', 800: '#8e1015', 900: '#5e0a0e',
        },
        // Màu thương hiệu AA (logo): đỏ + cam
        aa: {
          50: '#fdecec', 100: '#fbd5d6', 200: '#f6a9ab', 500: '#e8484d', 600: '#e31e24', 700: '#b3141a', 800: '#8e1015',
        },
        cam: { 50: '#fef3e2', 500: '#f7941d', 600: '#e07f0a' },
        // Các thẻ/bảng báo cáo đang dùng viền + nền tiêu đề emerald-50/100/200 (xanh lá nhạt).
        // Đổi 3 mức nhạt này sang xám trung tính; emerald-500..900 vẫn xanh để giữ ý nghĩa "tăng/tốt".
        emerald: {
          50: '#f6f8fa', 100: '#eef1f5', 200: '#e1e6ec',
        },
      },
      // Bóng đổ nhẹ hơn hẳn mặc định => cảm giác phẳng, tối giản
      boxShadow: {
        sm: '0 1px 2px 0 rgb(16 24 40 / 0.04)',
        DEFAULT: '0 1px 3px 0 rgb(16 24 40 / 0.06), 0 1px 2px -1px rgb(16 24 40 / 0.04)',
        md: '0 2px 8px -2px rgb(16 24 40 / 0.08)',
        lg: '0 8px 20px -6px rgb(16 24 40 / 0.10)',
        xl: '0 12px 32px -8px rgb(16 24 40 / 0.14)',
        '2xl': '0 24px 48px -12px rgb(16 24 40 / 0.18)',
      },
    },
  },
  plugins: [
    // rsm: / rmd: / rlg: / rxl: / r2xl: = sm: / md: … nhưng KHÔNG áp khi <html class="dien-thoai"> — điện thoại bật
    // "Trang web cho máy tính" (Chrome bỏ qua meta viewport, ép rộng 980px). App Xưởng gắn class đó và phóng to trang
    // về bề rộng màn thật (components/Mobile/xuong/cheDoDienThoai.ts) nên phải dùng bố cục điện thoại.
    plugin(({ addVariant }) => {
      for (const [ten, px] of [['sm', 640], ['md', 768], ['lg', 1024], ['xl', 1280], ['2xl', 1536]]) {
        addVariant(`r${ten}`, `@media (min-width: ${px}px) { html:not(.dien-thoai) & }`);
      }
    }),
  ],
};