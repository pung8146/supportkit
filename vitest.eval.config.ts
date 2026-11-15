import { defineConfig } from 'vitest/config';

// Billed: runs real model calls. Not part of `test`.
export default defineConfig({
  test: { include: ['tests/eval/**/*.eval.test.ts'], testTimeout: 60_000, fileParallelism: false },
});
