import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    sequence: { concurrent: false },
    testTimeout: 15000,
  },
});
