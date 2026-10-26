import { defineConfig, devices } from '@playwright/test';

// Performance harness (perf/README.md). Kept apart from playwright.config.ts so `npm test` never runs
// it: production builds only, opened from disk, one worker so runs never compete for the CPU.
export default defineConfig({
  testDir: './perf',
  testMatch: 'perf.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 4 * 60 * 60_000, // one shell on stress-200x10 takes up to about 2 hours
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 1000 } },
});
