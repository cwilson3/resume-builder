import { expect, test as setup } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const BUILDER = path.resolve(__dirname, '../..');
const DIST = path.join(BUILDER, 'dist');
const MASTER = path.join(BUILDER, 'resume/Bilbo-Baggins-Resume.md');

setup('builds the page into dist with the master shipped beside it', () => {
  const startedAt = Date.now();

  execFileSync('npm', ['run', 'build'], { cwd: BUILDER, stdio: 'pipe' });

  const page = path.join(DIST, 'index.html');
  // Written by this run, not left over from an earlier one.
  expect(statSync(page).mtimeMs).toBeGreaterThanOrEqual(startedAt - 1000);
  // Everything else is inlined: no script or stylesheet is loaded from a separate file.
  const html = readFileSync(page, 'utf8');
  expect(html).not.toMatch(/<script[^>]+src=/);
  expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/);
  // The master ships as its own file, unchanged, and is not carried inside the page.
  expect(readFileSync(path.join(DIST, 'Bilbo-Baggins-Resume.md'), 'utf8')).toBe(readFileSync(MASTER, 'utf8'));
  expect(html).not.toContain('Recovered the Arkenstone');
});
