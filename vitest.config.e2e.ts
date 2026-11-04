import 'dotenv/config';
import { defineConfig } from 'vitest/config';

const { TEST_PG_HOST, TEST_PG_PORT, TEST_PG_DB } = process.env;
if (
  !TEST_PG_HOST ||
  !TEST_PG_PORT ||
  !/^\d+$/.test(TEST_PG_PORT) ||
  Number(TEST_PG_PORT) < 1 ||
  Number(TEST_PG_PORT) > 65535 ||
  !TEST_PG_DB
) {
  throw new Error(
    'Set TEST_PG_HOST, TEST_PG_PORT and TEST_PG_DB to an isolated, migrated PostgreSQL database for E2E tests',
  );
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    env: {
      NODE_ENV: 'test',
      PG_HOST: TEST_PG_HOST,
      PG_PORT: TEST_PG_PORT,
      PG_DB: TEST_PG_DB,
    },
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
