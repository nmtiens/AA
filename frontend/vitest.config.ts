import { defineConfig } from 'vitest/config';

// Test đơn vị cho quy tắc số liệu dùng chung (utils/*) và hàng đợi mục Xưởng (services/xuongQueue). Chạy: npm test (vitest run).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['utils/**/*.test.ts', 'components/**/*.test.ts', 'services/**/*.test.ts'],
  },
});
