import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../../apps/admin/public/widget',
    emptyOutDir: false,
    target: 'es2022',
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      input: 'src/embed/main.tsx',
      output: {
        entryFileNames: 'embed.js',
        assetFileNames: 'embed[extname]',
      },
    },
  },
});
