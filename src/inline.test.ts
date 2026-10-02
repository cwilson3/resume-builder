import { describe, expect, it } from 'vitest';
import { escapeHtml, inlineToHtml, parseInline, safeHref, stripInline } from './inline';

describe('parseInline', () => {
  it('returns one plain span for text without markup', () => {
    expect(parseInline('plain text')).toEqual([{ text: 'plain text', bold: false, italic: false }]);
  });

  it('parses bold', () => {
    expect(parseInline('a **b** c')).toEqual([
      { text: 'a ', bold: false, italic: false },
      { text: 'b', bold: true, italic: false },
      { text: ' c', bold: false, italic: false },
    ]);
  });

  it('parses italic', () => {
    expect(parseInline('*Estate management and hospitality*')).toEqual([
      { text: 'Estate management and hospitality', bold: false, italic: true },
    ]);
  });

  it('parses a link and keeps its href', () => {
    expect(parseInline('see [site](https://example.com/x) now')).toEqual([
      { text: 'see ', bold: false, italic: false },
      { text: 'site', bold: false, italic: false, href: 'https://example.com/x' },
      { text: ' now', bold: false, italic: false },
    ]);
  });

  it('handles a bold label followed by plain text (Skills line shape)', () => {
    const spans = parseInline('**Burglary:** silent entry, barrel logistics');
    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({ text: 'Burglary:', bold: true });
    expect(spans[1]).toMatchObject({ text: ' silent entry, barrel logistics', bold: false });
  });

  it('returns an empty list for an empty string', () => {
    expect(parseInline('')).toEqual([]);
  });
});

describe('stripInline', () => {
  it('removes markers and keeps link text', () => {
    expect(stripInline('**A** and *b* and [c](https://x.y)')).toBe('A and b and c');
  });
});

describe('escapeHtml / safeHref', () => {
  it('escapes the five HTML metacharacters', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('allows http, https, mailto and tel; blocks anything else', () => {
    expect(safeHref('https://a.b')).toBe('https://a.b');
    expect(safeHref('mailto:x@y.z')).toBe('mailto:x@y.z');
    expect(safeHref('javascript:alert(1)')).toBe('#');
    expect(safeHref('data:text/html,hi')).toBe('#');
  });
});

describe('inlineToHtml', () => {
  it('renders bold, italic and safe links with escaped text', () => {
    expect(inlineToHtml('**B** *i* [t](https://x.y/?a=1&b=2) <x>')).toBe(
      '<strong>B</strong> <em>i</em> <a href="https://x.y/?a=1&amp;b=2" rel="noopener">t</a> &lt;x&gt;',
    );
  });

  it('never emits a javascript: href', () => {
    expect(inlineToHtml('[x](javascript:alert)')).toBe('<a href="#" rel="noopener">x</a>');
  });
});
