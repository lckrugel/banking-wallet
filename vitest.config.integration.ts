import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.integration.spec.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
