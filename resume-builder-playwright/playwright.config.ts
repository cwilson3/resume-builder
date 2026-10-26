import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import type { ShellOptions } from './tests/fixtures';

// One suite, two shells: the vanilla page and the React shell must pass the same specs.
const VANILLA_PORT = 5173;
const REACT_PORT = 5180;
const REACT_DIR = path.resolve(__dirname, '../resume-builder-react');

const devServer = (cwd: string, port: number) => ({
  command: `npm run dev -- --port ${port} --strictPort`,
  cwd,
  url: `http://localhost:${port}`,
  reuseExistingServer: !process.env.CI,
  timeout: 60_000,
});

const DEV_SPECS = /build\.setup\.ts|built-page\.spec\.ts/;

export default defineConfig<ShellOptions>({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [['dot'], ['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    acceptDownloads: true,
  },
  projects: [
    // Each shell as served by its Vite dev server.
    { name: 'vanilla', testIgnore: DEV_SPECS, use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${VANILLA_PORT}` } },
    { name: 'react', testIgnore: DEV_SPECS, use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${REACT_PORT}` } },
    // Each shell's single-file build, opened from disk (file://) the way it is handed out. The
    // build projects run `npm run build` in the shell's package first so the page under test is
    // never stale.
    { name: 'vanilla-build', testMatch: /build\.setup\.ts/, use: { shellDir: path.resolve(__dirname, '..') } },
    { name: 'react-build', testMatch: /build\.setup\.ts/, use: { shellDir: REACT_DIR } },
    {
      name: 'vanilla-built-page',
      testMatch: /built-page\.spec\.ts/,
      dependencies: ['vanilla-build'],
      use: { ...devices['Desktop Chrome'], shellDir: path.resolve(__dirname, '..') },
    },
    {
      name: 'react-built-page',
      testMatch: /built-page\.spec\.ts/,
      dependencies: ['react-build'],
      use: { ...devices['Desktop Chrome'], shellDir: REACT_DIR },
    },
  ],
  webServer: [devServer(path.resolve(__dirname, '..'), VANILLA_PORT), devServer(REACT_DIR, REACT_PORT)],
});
