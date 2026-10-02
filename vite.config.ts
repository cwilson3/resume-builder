import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveMaster } from './scripts/resolve-master.ts';

const builderDir = fileURLToPath(new URL('.', import.meta.url));

const VIRTUAL_ID = 'virtual:master';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

/**
 * Ships the configured master resume beside the page instead of inside it. The
 * page only learns the file's name (the `virtual:master` module) and fetches it
 * at start-up. The build copies the file into dist next to index.html, and
 * `npm run dev` serves it from the same path and reloads the page when it is
 * edited. Which file is the master comes from rezoom.config.json (or the
 * REZOOM_MASTER environment variable).
 */
function masterResume(): Plugin {
  const master = resolveMaster();
  const fileName = basename(master.file);
  const urlPath = `/${encodeURIComponent(fileName)}`;
  return {
    name: 'rezoom-master-resume',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    load(id) {
      return id === RESOLVED_ID ? `export const MASTER_FILE = ${JSON.stringify(fileName)};` : undefined;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== urlPath) return next();
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(readFileSync(master.file));
      });
      server.watcher.add(master.file);
      server.watcher.on('change', (changed) => {
        if (resolve(changed) === master.file) server.ws.send({ type: 'full-reload' });
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName, source: readFileSync(master.file, 'utf8') });
    },
  };
}

/**
 * Inlines the page icon, both the favicon `<link rel="icon" href="/src/assets/hardhat.svg">`
 * and the header `<img src="/src/assets/hardhat.svg">`. Vite never inlines assets referenced
 * from a `<link>` tag, so the favicon would leave a second file in dist and the
 * page would lose its icon when opened from disk; the `<img>` is handled the same
 * way so both always come from the one SVG. This hook runs before Vite's own HTML
 * handling and swaps the href or src for a data URI built from the SVG it names,
 * resolved from the project root, in dev and in the build alike.
 */
function inlineIcon(): Plugin {
  const svgToDataUri = (svg: string): string => {
    const compact = svg
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s*\n\s*/g, '')
      .replace(/"/g, "'")
      .trim();
    const encoded = compact.replace(/[%#<>]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    return `data:image/svg+xml,${encoded}`;
  };
  return {
    name: 'rezoom-inline-icon',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace(/(<(?:link rel="icon"|img)[^>]*(?:href|src)=")\/([^"]+\.svg)(")/g, (_match, before, file, after) => {
          const svg = readFileSync(resolve(builderDir, file), 'utf8');
          return `${before}${svgToDataUri(svg)}${after}`;
        });
      },
    },
  };
}

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
      exclude: ['src/**/*.test.ts', 'src/main.ts', 'src/dom.ts', 'src/vite-env.d.ts', 'src/test-utils/**'],
      reporter: ['text', 'html'],
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
    },
  },
});
