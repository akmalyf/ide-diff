// Extension host bundle: dist/extension.cjs (CommonJS, `vscode` and Node built-ins external).
// Also copies the repo-root NOTICE (Apache-2.0 / JetBrains attribution) into the package for the .vsix.
import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const external = ['vscode', ...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false, // dist/webview.js is built first
    target: 'node20',
    sourcemap: true,
    minify: false,
    lib: { entry: 'src/extension.ts', formats: ['cjs'], fileName: () => 'extension.cjs' },
    rollupOptions: { external, output: { exports: 'named' } },
  },
  plugins: [
    {
      name: 'copy-notice',
      closeBundle() {
        copyFileSync(fileURLToPath(new URL('../../NOTICE', import.meta.url)), fileURLToPath(new URL('./NOTICE', import.meta.url)));
      },
    },
  ],
});
