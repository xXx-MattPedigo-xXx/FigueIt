import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // relative asset paths so the build works under any sub-path (GitHub Pages serves it at /<repo>/)
  base: './',
  plugins: [react()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
