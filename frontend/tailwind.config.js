/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './**/*.{ts,tsx}', '!./node_modules/**'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'sans-serif'] },
      colors: {
        wood: {
          50: '#fbf7f3', 100: '#f5ebe0', 200: '#ead6c2', 300: '#debfa0', 400: '#d0a075',
          500: '#c58451', 600: '#ba6a42', 700: '#9a5338', 800: '#7f4534', 900: '#673a2e',
        },
      },
    },
  },
  plugins: [],
};