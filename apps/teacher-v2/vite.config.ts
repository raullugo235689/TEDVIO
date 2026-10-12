import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sourceDigest } from '../../.github/scripts/release-integrity.mjs';

export default defineConfig({
  base: '/teacher-v2/',
  plugins: [react()],
  define: { __TEDVIO_BUILD_ID__: JSON.stringify(sourceDigest()) },
  server: {
    host: '0.0.0.0',
    port: 4174,
  },
  build: {
    target: 'es2022',
    outDir: '../../teacher-v2',
    emptyOutDir: true,
    sourcemap: false,
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('@tanstack')) return 'query';
          if (id.includes('react-router')) return 'router';
          if (id.includes('react')) return 'react';
          return 'vendor';
        },
      },
    },
  },
});
