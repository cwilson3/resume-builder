import { describe, expect, it } from 'vitest';
import { applySeparator, DEFAULT_SEPARATOR, PIPE, replaceSeparator, SEPARATOR_PRESETS, separatorPreset } from './separator';
import { isWinAnsiChar } from './pdf';
import { parseResume } from './parse';
import { serializeResume } from './serialize';
import { masterMarkdown } from './test-utils/master-fixture';
import type { Resume } from './model';

describe('separator presets', () => {
  it('offers the middle dot (the default) and the pipe the Markdown itself uses', () => {
    expect(SEPARATOR_PRESETS.map((p) => [p.id, p.glyph])).toEqual([
      ['dot', '·'],
      ['pipe', '|'],
    ]);
    expect(DEFAULT_SEPARATOR.id).toBe('dot');
    expect(DEFAULT_SEPARATOR.glyph).toBe('·');
    expect(separatorPreset('pipe').glyph).toBe(PIPE);
    expect(separatorPreset('dot').glyph).toBe('·');
    expect(separatorPreset('pipe').glyph).toBe('|');
  });

  it('falls back to the default for unknown or missing ids', () => {
    expect(separatorPreset(null)).toBe(DEFAULT_SEPARATOR);
    expect(separatorPreset(undefined)).toBe(DEFAULT_SEPARATOR);
    expect(separatorPreset('bullet')).toBe(DEFAULT_SEPARATOR);
    expect(separatorPreset('')).toBe(DEFAULT_SEPARATOR);
  });

  it('only offers single glyphs the standard PDF fonts can draw, and never the list bullet or a dash', () => {
    for (const preset of SEPARATOR_PRESETS) {
      expect([...preset.glyph], preset.id).toHaveLength(1);
      expect(isWinAnsiChar(preset.glyph), preset.id).toBe(true);
      expect(['•', '-', '–', '—'], preset.id).not.toContain(preset.glyph);
      expect(preset.label, preset.id).toContain(preset.glyph);
    }
  });
});

describe('replaceSeparator', () => {
  it('swaps every pipe that has whitespace on both sides and keeps that whitespace', () => {
    expect(replaceSeparator('Thorin and Company | Erebor, Lonely Mountain | Apr 2941 - Jun 2942', '·')).toBe('Thorin and Company · Erebor, Lonely Mountain · Apr 2941 - Jun 2942');
    expect(replaceSeparator('a  |  b', '·')).toBe('a  ·  b');
    expect(replaceSeparator('a\n| b', '·')).toBe('a\n· b');
  });

  it('leaves pipes glued to text or at the edges alone', () => {
    expect(replaceSeparator('a|b', '·')).toBe('a|b');
    expect(replaceSeparator('| a | b |', '·')).toBe('| a · b |');
    expect(replaceSeparator('x |', '·')).toBe('x |');
    expect(replaceSeparator('| x', '·')).toBe('| x');
  });

  it('is the identity for the pipe itself', () => {
    const text = 'a | b |c| d';
    expect(replaceSeparator(text, PIPE)).toBe(text);
  });

  it('does not touch link URLs and works inside inline markup', () => {
    expect(replaceSeparator('[in](https://x.y/a|b) | **Bold | Label** | *it | al*', '·')).toBe('[in](https://x.y/a|b) · **Bold · Label** · *it · al*');
  });
});

describe('applySeparator', () => {
  const resume: Resume = {
    name: 'A | B',
    contact: 'City | phone\n\nsecond | line',
    sections: [
      {
        title: 'S | T',
        blocks: [
          { type: 'heading', text: 'H | I' },
          { type: 'paragraph', text: 'Co | City | 2020 - 2021' },
          { type: 'list', items: ['Degree | School | 2007', 'plain'] },
        ],
      },
    ],
  };

  it('swaps the separator in every text field and returns a new resume, leaving the input untouched', () => {
    const before = JSON.stringify(resume);
    const out = applySeparator(resume, '·');
    expect(out).toEqual({
      name: 'A · B',
      contact: 'City · phone\n\nsecond · line',
      sections: [
        {
          title: 'S · T',
          blocks: [
            { type: 'heading', text: 'H · I' },
            { type: 'paragraph', text: 'Co · City · 2020 - 2021' },
            { type: 'list', items: ['Degree · School · 2007', 'plain'] },
          ],
        },
      ],
    });
    expect(out).not.toBe(resume);
    expect(JSON.stringify(resume)).toBe(before);
  });

  it('returns the very same resume for the pipe or no glyph, so callers can compare by reference', () => {
    expect(applySeparator(resume, PIPE)).toBe(resume);
    expect(applySeparator(resume, undefined)).toBe(resume);
  });

  it('changes nothing but the separator glyph in the master', () => {
    const master = parseResume(masterMarkdown);
    const shown = serializeResume(applySeparator(master, '·'));
    expect(shown).not.toMatch(/\s\|\s/);
    expect(shown).toContain('Thorin and Company · Erebor, Lonely Mountain · Apr 2941 - Jun 2942');
    expect(shown).toContain('Bag End, Hobbiton, The Shire · 555-555-0111 · bilbo@bagend.example');
    // Swapping the glyph back gives the master byte for byte: nothing else moved.
    expect(shown.replace(/·/g, '|')).toBe(serializeResume(master));
  });
});
