import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: [fileURLToPath(new URL('./tests/setup.ts', import.meta.url))],
  },
});
