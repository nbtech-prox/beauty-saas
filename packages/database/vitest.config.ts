import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    sequence: { concurrent: false },
    // Suite partilha uma única base PostgreSQL. Para evitar races entre
    // ficheiros, forçamos um único worker.
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
