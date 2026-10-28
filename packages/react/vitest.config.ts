import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@ide-diff/core': src('../core/src/index.ts'),
      '@ide-diff/viewer': src('../viewer/src/index.ts'),
    },
  },
  test: { environment: 'jsdom' },
});
