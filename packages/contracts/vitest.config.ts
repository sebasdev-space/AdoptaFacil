import { defineConfig } from 'vitest/config';

// Contracts are pure TS (types + small pure functions + a dependency-free fake),
// so tests run in the node environment. Kept OUT of `src/` so the dual ESM/CJS
// build (tsconfig.build.*.json include src/**/*) never emits test code to dist.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
