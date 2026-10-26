import { readFileSync } from 'node:fs';
import { describe, test } from 'vitest';
import { parseResume } from './parse';
import { serializeResume } from './serialize';
import { renderResumeHtml } from './render-html';
import { buildFile } from './build';
import { marginPreset } from './pdf';

/**
 * The shared pure modules on the performance fixtures: the cost both shells pay equally, so the browser
 * comparison (resume-builder-playwright/perf) can be read as shell cost on top of this. The fixtures live
 * with the harness that generates them, in the Playwright package. Run: npm run bench
 */

const FIXTURES = ['stress-50x10', 'stress-200x10'];

for (const name of FIXTURES) {
  const markdown = readFileSync(new URL(`../resume-builder-playwright/fixtures/perf/${name}.md`, import.meta.url), 'utf8');
  const resume = parseResume(markdown);

  describe(name, () => {
    // Vitest 5 registers benchmarks through the test's `bench` fixture; `compare` runs them as one
    // group and prints them side by side, as the separate `bench()` calls did before.
    test('shared pipeline', async ({ bench }) => {
      await bench.compare(
        bench('parseResume', () => {
          parseResume(markdown);
        }),
        bench('serializeResume', () => {
          serializeResume(resume);
        }),
        bench('renderResumeHtml', () => {
          renderResumeHtml(resume);
        }),
        bench('buildFile md', () => {
          buildFile(resume, 'md', '');
        }),
        bench('buildFile pdf', () => {
          buildFile(resume, 'pdf', '', { margin: marginPreset(null).points, separator: '·' });
        }),
      );
    });
  });
}
