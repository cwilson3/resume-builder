import type { Block, Resume } from './model';

/**
 * The " | " between fields ("Company | City, ST | Mon YYYY - Mon YYYY") is the
 * delimiter the ATS review recommends for the Markdown, and the Markdown always
 * keeps it. The preview and the PDF show a middle dot in its place by default,
 * or the pipe itself on request; this module is the one place that swap
 * happens, so the working copy itself is never touched.
 *
 * Only glyphs the standard PDF fonts can draw (Windows-1252) belong here, and
 * none that the resume already uses for something else: "•" is the list bullet
 * and a dash would compete with the hyphen in every date range.
 */

export type SeparatorId = 'dot' | 'pipe';

export interface SeparatorPreset {
  id: SeparatorId;
  label: string;
  /** The character drawn between fields. */
  glyph: string;
}

export const PIPE = '|';

/** The first preset is the default. */
export const SEPARATOR_PRESETS: readonly SeparatorPreset[] = [
  { id: 'dot', label: 'Middle dot ·', glyph: '·' },
  { id: 'pipe', label: 'Pipe |', glyph: PIPE },
];
export const DEFAULT_SEPARATOR: SeparatorPreset = SEPARATOR_PRESETS[0];

/** The preset with this id, or the default for anything unknown (null, a stale stored value, a typo). */
export function separatorPreset(id: string | null | undefined): SeparatorPreset {
  return SEPARATOR_PRESETS.find((p) => p.id === id) ?? DEFAULT_SEPARATOR;
}

/**
 * A pipe with whitespace on both sides is a field separator. Pipes glued to
 * text ("a|b", the edge of a table row) are left alone, and so is the
 * whitespace around the match.
 */
const FIELD_PIPE = /(?<=\s)\|(?=\s)/g;

export function replaceSeparator(text: string, glyph: string): string {
  return glyph === PIPE ? text : text.replace(FIELD_PIPE, glyph);
}

/**
 * The resume with every field separator shown as `glyph`. Returns the input
 * itself when nothing would change, so callers can compare by reference.
 */
export function applySeparator(resume: Resume, glyph: string | undefined): Resume {
  if (glyph === undefined || glyph === PIPE) return resume;
  const swap = (text: string): string => replaceSeparator(text, glyph);
  const block = (b: Block): Block => (b.type === 'list' ? { type: 'list', items: b.items.map(swap) } : { ...b, text: swap(b.text) });
  return {
    name: swap(resume.name),
    contact: swap(resume.contact),
    sections: resume.sections.map((s) => ({ title: swap(s.title), blocks: s.blocks.map(block) })),
  };
}
