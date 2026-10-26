import { readFileSync } from 'node:fs';
import { bench, describe } from 'vitest';
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
    bench('parseResume', () => {
      parseResume(markdown);
    });
    bench('serializeResume', () => {
      serializeResume(resume);
    });
    bench('renderResumeHtml', () => {
      renderResumeHtml(resume);
    });
    bench('buildFile md', () => {
      buildFile(resume, 'md', '');
    });
    bench('buildFile pdf', () => {
      buildFile(resume, 'pdf', '', { margin: marginPreset(null).points, separator: '·' });
    });
  });
}
