/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './**/*.{ts,tsx}', '!./node_modules/**'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        // "wood" là tên cũ (78 chỗ dùng wood-600, 59 chỗ wood-50...). Giữ tên để không phải sửa component,
        // chỉ đổi giá trị: nền xám nhạt -> viền -> navy đậm cho nút/mục đang chọn.
        wood: {
          50: '#f7f8fa', 100: '#eff1f5', 200: '#e3e7ed', 300: '#cbd2dc', 400: '#8f9bad',
          500: '#5b6b82', 600: '#1f2a44', 700: '#172036', 800: '#111827', 900: '#0b1220',
        },
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
  plugins: [],
};