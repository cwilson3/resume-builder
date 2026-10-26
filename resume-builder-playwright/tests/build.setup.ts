import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { expect, REPO_ROOT, test as setup } from './fixtures';

const MASTER = path.join(REPO_ROOT, 'resume/Bilbo-Baggins-Resume.md');

setup('builds the page into dist with the master shipped beside it', ({ shellDir, dist }) => {
  const startedAt = Date.now();

  execFileSync('npm', ['run', 'build'], { cwd: shellDir, stdio: 'pipe' });

  const page = path.join(dist, 'index.html');
  // Written by this run, not left over from an earlier one.
  expect(statSync(page).mtimeMs).toBeGreaterThanOrEqual(startedAt - 1000);
  // Everything else is inlined: no script or stylesheet is loaded from a separate file.
  const html = readFileSync(page, 'utf8');
  expect(html).not.toMatch(/<script[^>]+src=/);
  expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/);
  // The master ships as its own file, unchanged, and is not carried inside the page.
  expect(readFileSync(path.join(dist, 'Bilbo-Baggins-Resume.md'), 'utf8')).toBe(readFileSync(MASTER, 'utf8'));
  expect(html).not.toContain('Recovered the Arkenstone');
});
