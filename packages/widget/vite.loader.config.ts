import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: '../../apps/admin/public/widget',
    emptyOutDir: true,
    target: 'es2020',
    lib: {
      entry: 'src/loader.ts',
      formats: ['iife'],
      name: 'SupportKitLoader',
      fileName: () => 'loader.js',
    },
  },
});
