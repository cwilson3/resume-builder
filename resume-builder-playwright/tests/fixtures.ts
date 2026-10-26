import { test as base } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** The repository root, which is also the vanilla page's package. */
export const REPO_ROOT = path.resolve(__dirname, '../..');

/** The React shell's package. */
export const REACT_DIR = path.join(REPO_ROOT, 'resume-builder-react');

/** Set per project in playwright.config.ts: which shell's package the build tests build and open. */
export interface ShellOptions {
  /** The shell's package directory; its build lands in `<shellDir>/dist`. */
  shellDir: string;
}

interface BuiltPageFixtures {
  /** `<shellDir>/dist`. */
  dist: string;
  /** The built page as a file:// URL, opened from disk the way it is handed out. */
  builtPage: string;
  /** The sample master the build copies beside the page. */
  shippedMaster: string;
}

/** `test` for the build and built-page tests, which run once per shell. */
export const test = base.extend<ShellOptions & BuiltPageFixtures>({
  shellDir: [REPO_ROOT, { option: true }],
  dist: async ({ shellDir }, use) => {
    await use(path.join(shellDir, 'dist'));
  },
  builtPage: async ({ dist }, use) => {
    await use(pathToFileURL(path.join(dist, 'index.html')).href);
  },
  shippedMaster: async ({ dist }, use) => {
    await use(path.join(dist, 'Bilbo-Baggins-Resume.md'));
  },
});

export { expect } from '@playwright/test';
