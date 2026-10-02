import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import {
  buildPdf,
  buildPdfBytes,
  DEFAULT_MARGIN_PRESET,
  findUnsupportedChars,
  isWinAnsiChar,
  MARGIN_PRESETS,
  marginPreset,
  resumeUnsupportedChars,
} from './pdf';
import { parseResume } from './parse';
import { stripInline } from './inline';
import { masterMarkdown } from './test-utils/master-fixture';
import { extractPdfPages, firstTextX, normalizeText, placedText, sectionRules } from './test-utils/pdf-text';
import { applySeparator, DEFAULT_SEPARATOR } from './separator';
import type { Resume } from './model';

const master = parseResume(masterMarkdown);
/** The master as the PDF shows it by default: field pipes drawn as the default separator. */
const shown = applySeparator(master, DEFAULT_SEPARATOR.glyph);

describe('buildPdf (master document)', () => {
  it('produces a Letter-size PDF with document metadata and no more than three pages', async () => {
    const doc = buildPdf(master);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    expect(doc.getNumberOfPages()).toBeLessThanOrEqual(3);
    const { width, height } = doc.internal.pageSize;
    expect(Math.round(width)).toBe(612);
    expect(Math.round(height)).toBe(792);
    const bytes = new Uint8Array(buildPdfBytes(master));
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
    const raw = new TextDecoder('latin1').decode(bytes);
    expect(raw).toContain('/Title (Bilbo Baggins Resume)');
    expect(raw).toContain('/Author (Bilbo Baggins)');
  });

  it('puts the name first and every section title in document order (ATS reading order)', async () => {
    const pages = await extractPdfPages(buildPdfBytes(master));
    const text = normalizeText(pages.join('\n'));
    expect(text.startsWith('Bilbo Baggins')).toBe(true);
    let cursor = 0;
    for (const section of master.sections) {
      const at = text.indexOf(section.title.toUpperCase(), cursor);
      expect(at, `section "${section.title}" should follow the previous one`).toBeGreaterThan(-1);
      cursor = at;
    }
  });

  it('keeps every entry heading directly ahead of its own bullets, ahead of the next heading', async () => {
    const pages = await extractPdfPages(buildPdfBytes(master));
    const text = normalizeText(pages.join('\n'));
    for (const section of shown.sections) {
      for (let i = 0; i < section.blocks.length; i++) {
        const block = section.blocks[i];
        if (block.type !== 'heading') continue;
        const headingAt = text.indexOf(stripInline(block.text));
        expect(headingAt, `heading "${block.text}"`).toBeGreaterThan(-1);
        // The next heading in this section, if any, bounds this entry.
        let nextAt = text.length;
        for (let j = i + 1; j < section.blocks.length; j++) {
          const next = section.blocks[j];
          if (next.type === 'heading') {
            nextAt = text.indexOf(stripInline(next.text), headingAt + 1);
            break;
          }
        }
        for (let j = i + 1; j < section.blocks.length; j++) {
          const next = section.blocks[j];
          if (next.type === 'heading') break;
          const needles = next.type === 'list' ? next.items : [next.text];
          for (const needle of needles) {
            const probe = normalizeText(stripInline(needle)).slice(0, 60);
            const at = text.indexOf(probe, headingAt);
            expect(at, `"${probe}" should follow "${block.text}"`).toBeGreaterThan(headingAt);
            expect(at, `"${probe}" should precede the next heading`).toBeLessThan(nextAt);
          }
        }
      }
    }
  });

  it('writes standard round bullets into the text layer and never the legacy square glyph', async () => {
    const pages = await extractPdfPages(buildPdfBytes(master));
    const text = pages.join('\n');
    expect(text).toContain('•');
    expect(text).not.toContain('▪');
    expect(text).not.toContain('�');
  });

  it('keeps every bullet of the master in the text layer', async () => {
    const pages = await extractPdfPages(buildPdfBytes(master));
    const text = normalizeText(pages.join('\n'));
    for (const section of shown.sections) {
      for (const block of section.blocks) {
        if (block.type !== 'list') continue;
        for (const item of block.items) {
          expect(text).toContain(normalizeText(stripInline(item)).slice(0, 60));
        }
      }
    }
  });

  it('embeds no fonts (standard Helvetica family only) and draws no images', () => {
    const raw = new TextDecoder('latin1').decode(new Uint8Array(buildPdfBytes(master)));
    expect(raw).toMatch(/\/BaseFont\s*\/Helvetica/);
    expect(raw).not.toContain('/FontFile');
    expect(raw).not.toContain('/Subtype /Image');
    expect(raw).not.toContain('/Subtype/Image');
  });

  it('adds a link annotation for the website URL in the contact line', () => {
    const raw = new TextDecoder('latin1').decode(new Uint8Array(buildPdfBytes(master)));
    expect(raw).toContain('https://bagend.example/there-and-back-again');
  });
});

describe('buildPdf (section rules)', () => {
  // The original Pages export draws a red rule under every section title:
  // #C00000, 0.75 pt, spanning the content width (measured from its content
  // stream). The builder reproduces it as a vector stroke, never as text.

  it('draws one red 0.75 pt rule per section title', () => {
    const rules = sectionRules(buildPdfBytes(master));
    expect(rules).toHaveLength(master.sections.length);
    for (const rule of rules) {
      expect(rule.color).toBe('0.75 0. 0.'); // jsPDF's two-decimal form of #C00000
      expect(rule.width).toBe(0.75);
    }
  });

  it('spans the rule from the left margin to the right margin, for every margin preset', () => {
    for (const preset of MARGIN_PRESETS) {
      const rules = sectionRules(buildPdfBytes(master, { margin: preset.points }));
      expect(rules.length, preset.id).toBeGreaterThan(0);
      for (const rule of rules) {
        expect(rule.x1, preset.id).toBe(preset.points);
        expect(rule.x2, preset.id).toBe(612 - preset.points);
      }
    }
  });

  it('draws the rules in section order, top to bottom and page by page', () => {
    const rules = sectionRules(buildPdfBytes(master));
    for (let i = 1; i < rules.length; i++) {
      if (rules[i].page === rules[i - 1].page) {
        // PDF y grows upward, so a later rule on the same page has a smaller y.
        expect(rules[i].y, `rule ${i}`).toBeLessThan(rules[i - 1].y);
      } else {
        expect(rules[i].page, `rule ${i}`).toBeGreaterThan(rules[i - 1].page);
      }
    }
  });
});

describe('buildPdf (page breaking)', () => {
  const long: Resume = {
    name: 'Long Resume',
    contact: 'contact',
    sections: [
      {
        title: 'Experience',
        blocks: Array.from({ length: 12 }, (_, i) => [
          { type: 'heading' as const, text: `Role ${i + 1}` },
          { type: 'paragraph' as const, text: `Company ${i + 1} | City, ST | 2020 - 2021` },
          { type: 'list' as const, items: Array.from({ length: 6 }, (_, k) => `Role ${i + 1} bullet ${k + 1} with enough words to wrap onto a second line in the PDF layout engine`) },
        ]).flat(),
      },
    ],
  };

  it('spans several pages and keeps everything in order across page breaks', async () => {
    const doc = buildPdf(long);
    expect(doc.getNumberOfPages()).toBeGreaterThan(2);
    const pages = await extractPdfPages(doc.output('arraybuffer'));
    const text = normalizeText(pages.join('\n'));
    let cursor = 0;
    for (let i = 1; i <= 12; i++) {
      const at = text.indexOf(`Role ${i} bullet 6`, cursor);
      expect(at, `Role ${i} should come after Role ${i - 1}`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it('never leaves an entry heading as the last line of a page', async () => {
    const pages = await extractPdfPages(buildPdfBytes(long));
    for (const page of pages) {
      const lastLine = page.trim().split('\n').pop() ?? '';
      expect(lastLine).not.toMatch(/^Role \d+$/);
    }
  });

  it('honors margin and body size options', () => {
    const small = buildPdf(long, { bodySize: 8, margin: 36 }).getNumberOfPages();
    const large = buildPdf(long, { bodySize: 12, margin: 72 }).getNumberOfPages();
    expect(small).toBeLessThan(large);
  });

  it('renders with the Times family when requested', () => {
    const raw = new TextDecoder('latin1').decode(new Uint8Array(buildPdfBytes(long, { font: 'times' })));
    expect(raw).toMatch(/\/BaseFont\s*\/Times/);
  });
});

describe('character support', () => {
  it('accepts ASCII, Latin-1 and the CP-1252 specials such as • – — and curly quotes', () => {
    for (const ch of ['a', 'Z', ' ', 'é', '•', '–', '—', '’', '“', '€', '\n']) expect(isWinAnsiChar(ch), ch).toBe(true);
  });

  it('rejects the legacy square bullet, emoji and non-Latin scripts', () => {
    for (const ch of ['▪', '✓', '😀', 'π', '中']) expect(isWinAnsiChar(ch), ch).toBe(false);
  });

  it('lists each unsupported character once', () => {
    expect(findUnsupportedChars('a ▪ b ▪ ✓')).toEqual(['▪', '✓']);
    expect(findUnsupportedChars('plain')).toEqual([]);
  });

  it('reports the master as fully supported', () => {
    expect(resumeUnsupportedChars(master)).toEqual([]);
  });

  it('finds unsupported characters anywhere in a resume', () => {
    const r: Resume = { name: 'N ✓', contact: '', sections: [{ title: 'S', blocks: [{ type: 'list', items: ['▪ x'] }] }] };
    expect(resumeUnsupportedChars(r)).toEqual(['✓', '▪']);
  });
});

describe('margin presets', () => {
  it('offers comfortable (48 pt, the default) and compact (36 pt, the ATS minimum)', () => {
    expect(MARGIN_PRESETS.map((p) => [p.id, p.points])).toEqual([
      ['comfortable', 48],
      ['compact', 36],
    ]);
    expect(DEFAULT_MARGIN_PRESET.id).toBe('comfortable');
    expect(marginPreset('compact').points).toBe(36);
    expect(marginPreset('comfortable').points).toBe(48);
  });

  it('falls back to the default for unknown or missing ids', () => {
    expect(marginPreset(null)).toBe(DEFAULT_MARGIN_PRESET);
    expect(marginPreset(undefined)).toBe(DEFAULT_MARGIN_PRESET);
    expect(marginPreset('huge')).toBe(DEFAULT_MARGIN_PRESET);
    expect(marginPreset('')).toBe(DEFAULT_MARGIN_PRESET);
  });

  it('draws the name at the chosen margin, and no option means the default preset', () => {
    expect(firstTextX(buildPdfBytes(master))).toBe(DEFAULT_MARGIN_PRESET.points);
    for (const preset of MARGIN_PRESETS) {
      expect(firstTextX(buildPdfBytes(master, { margin: preset.points })), preset.id).toBe(preset.points);
    }
  });
});

describe('buildPdf (text placement)', () => {
  // Viewers draw the standard fonts with plain advance widths and no kerning.
  // The builder therefore writes each same-style run of a line as one string
  // (so the viewer spaces the words itself) and positions the next run with
  // unkerned widths, so a style change never swallows the space after a word.
  const sample: Resume = {
    name: 'Placement Test',
    contact: 'Hobbiton, The Shire | 555-555-0100 | someone@example.com',
    sections: [
      {
        title: 'Experience',
        blocks: [
          { type: 'heading', text: 'Burglar (Contract)' },
          { type: 'paragraph', text: 'Thorin and Company | Erebor, Lonely Mountain | Apr 2941 - Jun 2942' },
          { type: 'paragraph', text: '**Tuckborough** Hobbiton' },
          { type: 'list', items: ['**Burglary:** silent entry, lock assessment', 'See [my site](https://example.com) for more'] },
        ],
      },
    ],
  };

  it('writes each line as one string per weight and slant, spaces and links included', () => {
    const texts = placedText(buildPdfBytes(sample)).map((t) => t.text);
    // The default separator (middle dot) is applied before layout.
    expect(texts).toContain('Thorin and Company · Erebor, Lonely Mountain · Apr 2941 - Jun 2942');
    expect(texts).toContain('Hobbiton, The Shire · 555-555-0100 · someone@example.com');
    expect(texts).toContain('Burglar (Contract)');
    // A link does not split the line.
    expect(texts).toContain('See my site for more');
    // A weight change does; a space joins the run that is open, here the bold label.
    expect(texts).toContain('Burglary: ');
    expect(texts).toContain('silent entry, lock assessment');
    expect(texts).not.toContain(' ');
  });

  it("writes the master's contact line, link and all, as a single string", () => {
    const texts = placedText(buildPdfBytes(master)).map((t) => t.text);
    expect(texts).toContain('Bag End, Hobbiton, The Shire · 555-555-0111 · bilbo@bagend.example · bagend.example/there-and-back-again');
    const pipes = placedText(buildPdfBytes(master, { separator: '|' })).map((t) => t.text);
    expect(pipes).toContain('Bag End, Hobbiton, The Shire | 555-555-0111 | bilbo@bagend.example | bagend.example/there-and-back-again');
  });

  it('starts the run after a style change where the viewer finishes the previous run (unkerned width)', () => {
    const placed = placedText(buildPdfBytes(sample));
    const bold = placed.find((t) => t.text === 'Tuckborough ');
    const plain = placed.find((t) => t.text === 'Hobbiton');
    expect(bold).toBeDefined();
    expect(plain).toBeDefined();
    const probe = new jsPDF({ unit: 'pt' });
    probe.setFont('helvetica', 'bold');
    probe.setFontSize(10);
    const unkerned = probe.getStringUnitWidth('Tuckborough ', { doKerning: false }) * 10;
    const kerned = probe.getTextWidth('Tuckborough ');
    expect(kerned, 'the font kerns this word, so the two measurements differ').toBeLessThan(unkerned);
    expect(plain!.y).toBe(bold!.y);
    expect(plain!.x - bold!.x).toBeCloseTo(unkerned, 1);
  });

  it('places the link annotation over the link text inside its run', () => {
    const bytes = buildPdfBytes(sample);
    const line = placedText(bytes).find((t) => t.text === 'See my site for more');
    expect(line).toBeDefined();
    const raw = new TextDecoder('latin1').decode(new Uint8Array(bytes));
    const annot = /\/Rect \[(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)\][^>]*\/URI \(https:\/\/example\.com\)/.exec(raw);
    expect(annot, 'one link annotation for the URL').not.toBeNull();
    const probe = new jsPDF({ unit: 'pt' });
    probe.setFont('helvetica', 'normal');
    probe.setFontSize(10);
    const width = (text: string): number => probe.getStringUnitWidth(text, { doKerning: false }) * 10;
    expect(Number(annot![1])).toBeCloseTo(line!.x + width('See '), 1);
    expect(Number(annot![3]) - Number(annot![1])).toBeCloseTo(width('my site'), 1);
  });

});

describe('buildPdf (separator option)', () => {
  it('draws the middle dot in place of every field pipe by default, as a real character in the text layer', async () => {
    const text = normalizeText((await extractPdfPages(buildPdfBytes(master))).join('\n'));
    expect(text).toContain('Thorin and Company · Erebor, Lonely Mountain · Apr 2941 - Jun 2942');
    expect(text).toContain('Bag End, Hobbiton, The Shire · 555-555-0111 · bilbo@bagend.example');
    expect(text).not.toContain(' | ');
    expect(text).not.toContain('�');
  });

  it('keeps the pipe when asked', async () => {
    const text = normalizeText((await extractPdfPages(buildPdfBytes(master, { separator: '|' }))).join('\n'));
    expect(text).toContain('Thorin and Company | Erebor, Lonely Mountain | Apr 2941 - Jun 2942');
    expect(text).not.toContain('·');
  });

  it('leaves the resume it was given untouched', () => {
    const before = JSON.stringify(master);
    buildPdfBytes(master, { separator: '·' });
    expect(JSON.stringify(master)).toBe(before);
  });
});
