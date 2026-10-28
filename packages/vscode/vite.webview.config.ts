// Webview bundle: dist/webview.js (IIFE, everything bundled: @ide-diff/viewer, core, CodeMirror, languages).
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    lib: { entry: 'src/webview/main.ts', formats: ['iife'], name: 'ideDiffWebview', fileName: () => 'webview.js' },
  },
});
