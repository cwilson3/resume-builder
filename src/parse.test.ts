import { describe, expect, it } from 'vitest';
import { parseResume } from './parse';

const SAMPLE = `# Jane Doe

City, ST | 555-0100 | jane@example.com

## Summary

**Headline**

A paragraph.

## Experience

### Title One

Company | City, ST | Jan 2020 - Present

*Industry*

- First bullet
- Second bullet

### Title Two

Other Co | Town, ST | Jan 2018 - Dec 2019

- Only bullet

## Education

- Degree | School | 2007
`;

describe('parseResume', () => {
  it('reads the name from the H1 and the contact from the paragraph beneath it', () => {
    const r = parseResume(SAMPLE);
    expect(r.name).toBe('Jane Doe');
    expect(r.contact).toBe('City, ST | 555-0100 | jane@example.com');
  });

  it('creates one section per H2 in order', () => {
    const r = parseResume(SAMPLE);
    expect(r.sections.map((s) => s.title)).toEqual(['Summary', 'Experience', 'Education']);
  });

  it('turns ### into heading blocks, text into paragraphs and - into lists', () => {
    const r = parseResume(SAMPLE);
    expect(r.sections[1].blocks).toEqual([
      { type: 'heading', text: 'Title One' },
      { type: 'paragraph', text: 'Company | City, ST | Jan 2020 - Present' },
      { type: 'paragraph', text: '*Industry*' },
      { type: 'list', items: ['First bullet', 'Second bullet'] },
      { type: 'heading', text: 'Title Two' },
      { type: 'paragraph', text: 'Other Co | Town, ST | Jan 2018 - Dec 2019' },
      { type: 'list', items: ['Only bullet'] },
    ]);
  });

  it('keeps paragraph blocks separate when a blank line divides them', () => {
    const r = parseResume(SAMPLE);
    expect(r.sections[0].blocks).toEqual([
      { type: 'paragraph', text: '**Headline**' },
      { type: 'paragraph', text: 'A paragraph.' },
    ]);
  });

  it('preserves hard-wrapped paragraph lines with a newline', () => {
    const r = parseResume('# N\n\n## S\n\nline one\nline two\n');
    expect(r.sections[0].blocks).toEqual([{ type: 'paragraph', text: 'line one\nline two' }]);
  });

  it('accepts the legacy square and round bullet glyphs and * / + / numbered markers', () => {
    const r = parseResume('# N\n\n## S\n\n▪ a\n• b\n* c\n+ d\n1. e\n2) f\n');
    expect(r.sections[0].blocks).toEqual([{ type: 'list', items: ['a', 'b', 'c', 'd', 'e', 'f'] }]);
  });

  it('keeps a loose list (blank lines between items) as one list', () => {
    const r = parseResume('# N\n\n## S\n\n- a\n\n- b\n');
    expect(r.sections[0].blocks).toEqual([{ type: 'list', items: ['a', 'b'] }]);
  });

  it('treats an unindented line right after a bullet as a continuation of that bullet', () => {
    const r = parseResume('# N\n\n## S\n\n- a long\nbullet\n');
    expect(r.sections[0].blocks).toEqual([{ type: 'list', items: ['a long bullet'] }]);
  });

  it('normalizes CRLF line endings and trailing whitespace', () => {
    const r = parseResume('# N  \r\n\r\nc\r\n\r\n## S\r\n\r\n- a   \r\n');
    expect(r.name).toBe('N');
    expect(r.contact).toBe('c');
    expect(r.sections[0].blocks).toEqual([{ type: 'list', items: ['a'] }]);
  });

  it('joins multiple contact paragraphs with a blank line', () => {
    const r = parseResume('# N\n\nline a\n\nline b\n\n## S\n');
    expect(r.contact).toBe('line a\n\nline b');
  });

  it('uses the first text line as the name when there is no H1', () => {
    const r = parseResume('Jane\n\ncontact\n\n## S\n');
    expect(r.name).toBe('Jane');
    expect(r.contact).toBe('contact');
  });

  it('puts content that appears before any H2 into an untitled section', () => {
    const r = parseResume('# N\n\n### Sub\n\n- a\n');
    expect(r.sections).toEqual([{ title: '', blocks: [{ type: 'heading', text: 'Sub' }, { type: 'list', items: ['a'] }] }]);
  });

  it('treats a second H1 as a section', () => {
    const r = parseResume('# N\n\n# Again\n\n- a\n');
    expect(r.sections.map((s) => s.title)).toEqual(['Again']);
  });

  it('strips closing hashes only when preceded by a space', () => {
    const r = parseResume('# N\n\n## Title ##\n\n### Walking Songs in C#\n');
    expect(r.sections[0].title).toBe('Title');
    expect(r.sections[0].blocks).toEqual([{ type: 'heading', text: 'Walking Songs in C#' }]);
  });

  it('accepts an empty heading', () => {
    const r = parseResume('# N\n\n##\n\n- a\n');
    expect(r.sections[0].title).toBe('');
  });

  it('returns an empty resume for empty input', () => {
    expect(parseResume('')).toEqual({ name: '', contact: '', sections: [] });
  });
});
