import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Point workspace packages at their sources so the playground hot-reloads without building them.
export default defineConfig({
  resolve: {
    alias: {
      '@ide-diff/core': src('../packages/core/src/index.ts'),
      '@ide-diff/viewer': src('../packages/viewer/src/index.ts'),
    },
  },
  server: { port: 5173 },
});
