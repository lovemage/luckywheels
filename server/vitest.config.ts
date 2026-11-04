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
    // 測試 DB 在 Railway（luckywheels-test）時，每支測試前的清表＋seed 來回延遲較高
    hookTimeout: 60000,
  },
});
