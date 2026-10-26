import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { inlineIcon, masterResume } from './vite-plugins.ts';

export default defineConfig({
  plugins: [masterResume(), inlineIcon(), viteSingleFile()],
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    emptyOutDir: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.bench.ts', 'src/main.ts', 'src/dom.ts', 'src/vite-env.d.ts', 'src/test-utils/**'],
      reporter: ['text', 'html'],
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
    },
  },
});
