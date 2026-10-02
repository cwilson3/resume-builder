import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const PORT = 5173;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [['dot'], ['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    acceptDownloads: true,
  },
  projects: [
    // The app as served by the Vite dev server.
    { name: 'chromium', testIgnore: /build\.setup\.ts|built-page\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    // The single-file build, opened from disk (file://) the way it is handed out. `build`
    // runs `npm run build` first so the page under test is never stale.
    { name: 'build', testMatch: /build\.setup\.ts/ },
    { name: 'built-page', testMatch: /built-page\.spec\.ts/, dependencies: ['build'], use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    cwd: path.resolve(__dirname, '..'),
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
