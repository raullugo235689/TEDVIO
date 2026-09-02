import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const packageRoot = fileURLToPath(new URL('.', import.meta.url));

const trimBundleLines = (): Plugin => ({
  name: 'tedvio-trim-bundle-lines',
  enforce: 'post' as const,
  renderChunk(code: string) {
    const normalized = code.replace(/[\t ]+$/gm, '');
    return normalized === code ? null : { code: normalized, map: null };
  },
  generateBundle(_options, bundle) {
    for (const output of Object.values(bundle)) {
      if (output.type === 'chunk') {
        output.code = output.code.replace(/[\t ]+$/gm, '');
      }
    }
  },
});

export default defineConfig(({ mode }) => {
  if (!['student-v2', 'projection-v2'].includes(mode)) {
    throw new Error('Usa --mode student-v2 o --mode projection-v2.');
  }

  const sourceName = mode === 'student-v2' ? 'student' : 'projection';
  const sourceRoot = resolve(packageRoot, 'live', sourceName);

  return {
    root: sourceRoot,
    base: `/${mode}/`,
    publicDir: resolve(sourceRoot, 'public'),
    plugins: [react(), trimBundleLines()],
    build: {
      target: 'es2022',
      outDir: resolve(packageRoot, '..', '..', mode),
      emptyOutDir: true,
      sourcemap: false,
      manifest: 'manifest.json',
      assetsDir: 'assets',
      rollupOptions: {
        output: {
          entryFileNames: 'assets/app-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  };
});
