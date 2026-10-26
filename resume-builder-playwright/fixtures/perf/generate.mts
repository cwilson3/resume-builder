/**
 * Generates the performance fixtures: resumes in the master's shape, large enough
 * for the shells' rendering cost to show. The sample resume is too small. Run from this package:
 *
 *   node fixtures/perf/generate.mts
 *
 * Output is deterministic, so regenerating leaves the committed files unchanged.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PERF_FIXTURES = [
  { file: 'stress-50x10.md', entries: 50, bullets: 10 },
  { file: 'stress-200x10.md', entries: 200, bullets: 10 },
] as const;

export function stressResume(entries: number, bullets: number): string {
  const lines = ['# Stress Person', '', 'Columbus, OH | 555-555-0100 | stress@example.com', '', '## Summary', '', 'A generated resume for performance runs.', '', '## Professional Experience', ''];
  for (let e = 1; e <= entries; e++) {
    lines.push(`### Role ${e}`, '', `Company ${e} | City, ST | Jan 2000 - Dec 2001`, '');
    for (let b = 1; b <= bullets; b++) lines.push(`- Bullet ${b} of entry ${e}: delivered a **measurable** result across *several* teams and systems.`);
    lines.push('');
  }
  return lines.join('\n');
}

const here = fileURLToPath(new URL('.', import.meta.url));
for (const { file, entries, bullets } of PERF_FIXTURES) writeFileSync(`${here}${file}`, stressResume(entries, bullets));
