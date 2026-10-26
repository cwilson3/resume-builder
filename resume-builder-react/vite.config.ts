import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inlineIcon, masterResume } from '../vite-plugins.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..');

export default defineConfig({
  // The vanilla page's plugins, so `virtual:master`, the master shipped beside the page, and the
  // inlined icon mean the same thing here.
  plugins: [react(), masterResume(), inlineIcon(), viteSingleFile()],
  resolve: {
    // The pure modules are imported from the vanilla page's src/, never copied.
    alias: { '@core': resolve(repoRoot, 'src') },
  },
  server: {
    port: 5180,
    // Allow serving ../src and ../src/assets. Setting this turns off workspace-root detection,
    // which is intended: the repository root is the vanilla package, not a workspace.
    fs: { allow: [repoRoot] },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    emptyOutDir: true,
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', environment: 'node', include: ['src/**/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'components',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['src/test-utils/setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/main.tsx', 'src/test-utils/**'],
      reporter: ['text', 'html'],
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
    },
  },
});
