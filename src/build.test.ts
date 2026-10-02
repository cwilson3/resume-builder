import { describe, expect, it } from 'vitest';
import { buildFile, defaultBaseName, formatInfo, FORMATS, sanitizeBaseName, slugify } from './build';
import { parseResume } from './parse';
import { serializeResume } from './serialize';
import { masterMarkdown } from './test-utils/master-fixture';
import { extractPdfPages, firstTextX, normalizeText } from './test-utils/pdf-text';

describe('naming', () => {
  it('slugifies names', () => {
    expect(slugify('Bilbo Baggins')).toBe('Bilbo-Baggins');
    expect(slugify('  José  Álvarez!! ')).toBe('Jose-Alvarez');
    expect(slugify('')).toBe('');
  });

  it('derives the default base name from the resume name', () => {
    expect(defaultBaseName(parseResume(masterMarkdown))).toBe('Bilbo-Baggins-Resume');
    expect(defaultBaseName({ name: '', contact: '', sections: [] })).toBe('Resume');
  });

  it('sanitizes a typed file name and falls back when empty', () => {
    expect(sanitizeBaseName('My Resume.pdf', 'fb')).toBe('My-Resume');
    expect(sanitizeBaseName('a/b:c*d?e"f<g>h|i', 'fb')).toBe('a-b-c-d-e-f-g-h-i');
    expect(sanitizeBaseName('   ', 'fb')).toBe('fb');
    expect(sanitizeBaseName('.md', 'fb')).toBe('fb');
  });
});

describe('formats', () => {
  it('exposes md and pdf', () => {
    expect(FORMATS.map((f) => f.value)).toEqual(['md', 'pdf']);
    expect(formatInfo('pdf').extension).toBe('.pdf');
    expect(() => formatInfo('docx' as never)).toThrow(/Unknown format/);
  });
});

describe('buildFile', () => {
  const resume = parseResume(masterMarkdown);

  it('builds a Markdown file whose content is the serialized resume', async () => {
    const built = buildFile(resume, 'md');
    expect(built.filename).toBe('Bilbo-Baggins-Resume.md');
    expect(built.mime).toBe('text/markdown');
    expect(await built.blob.text()).toBe(serializeResume(resume));
  });

  it('builds a PDF file that starts with the PDF signature', async () => {
    const built = buildFile(resume, 'pdf', 'tailored');
    expect(built.filename).toBe('tailored.pdf');
    expect(built.mime).toBe('application/pdf');
    const bytes = new Uint8Array(await built.blob.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1000);
  });
});

describe('pdf options pass-through', () => {
  it('applies the margin given to buildFile to the PDF it builds', async () => {
    const resume = parseResume(masterMarkdown);
    const compact = await buildFile(resume, 'pdf', undefined, { margin: 36 }).blob.arrayBuffer();
    const byDefault = await buildFile(resume, 'pdf').blob.arrayBuffer();
    expect(firstTextX(compact)).toBe(36);
    expect(firstTextX(byDefault)).toBe(48);
  });

  it('applies the separator to the PDF only; Markdown always keeps the pipe', async () => {
    const resume = parseResume(masterMarkdown);
    for (const options of [undefined, { separator: '·' }, { separator: '|' }]) {
      const markdown = await buildFile(resume, 'md', undefined, options).blob.text();
      expect(markdown, JSON.stringify(options)).toBe(serializeResume(resume));
      expect(markdown, JSON.stringify(options)).toContain('Thorin and Company | Erebor, Lonely Mountain | Apr 2941 - Jun 2942');
      expect(markdown, JSON.stringify(options)).not.toContain('·');
    }

    const byDefault = normalizeText((await extractPdfPages(await buildFile(resume, 'pdf').blob.arrayBuffer())).join('\n'));
    expect(byDefault).toContain('Thorin and Company · Erebor, Lonely Mountain · Apr 2941 - Jun 2942');
    expect(byDefault).not.toContain(' | ');

    const pipes = normalizeText((await extractPdfPages(await buildFile(resume, 'pdf', undefined, { separator: '|' }).blob.arrayBuffer())).join('\n'));
    expect(pipes).toContain('Thorin and Company | Erebor, Lonely Mountain | Apr 2941 - Jun 2942');
  });
});
