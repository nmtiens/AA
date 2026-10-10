// ESLint 9 (flat config) cho frontend: TypeScript + quy tắc hooks của React.
// Chỉ bắt lỗi thật (biến không dùng, hooks sai thứ tự, điều kiện vô nghĩa...). `any` chỉ cảnh báo:
// code hiện dùng nhiều `any` cho dữ liệu bảng động, siết dần sau.
// Chạy: npm run lint (CI chạy với --max-warnings=0? không — warning không chặn, error mới chặn).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import unusedImports from 'eslint-plugin-unused-imports';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'public/**', '*.config.*'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.es2022 } },
    plugins: { 'react-hooks': reactHooks, 'unused-imports': unusedImports },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // import không dùng: tự xoá được bằng --fix
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      // Code dùng `{}`/`Function` ở vài chỗ cũ; cảnh báo thay vì chặn
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'prefer-const': 'warn',
    },
  },
  {
    files: ['**/*.test.ts', 'vitest.config.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
);
