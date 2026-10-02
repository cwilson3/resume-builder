import { jsPDF } from 'jspdf';
import type { Block, Resume } from './model';
import { allText } from './model';
import { parseInline, type Span } from './inline';
import { applySeparator, DEFAULT_SEPARATOR } from './separator';

/**
 * Resume → PDF, built for applicant tracking systems:
 *  - one column, drawn top to bottom, so the content stream order IS the
 *    reading order (the original export failed exactly this test);
 *  - real text using the standard Helvetica family (no embedded fonts, no
 *    letter-spacing, no tables, no text boxes, and no images), with each line
 *    written as one string per weight and slant so the viewer spaces the words
 *    itself and the text layer carries real spaces;
 *  - standard "•" bullets that sit in the text layer as real characters;
 *  - Letter size with generous margins and automatic page breaks that keep
 *    a heading with the lines that follow it;
 *  - the original's red rule under each section title, drawn as a vector
 *    line outside the text layer.
 */

export interface PdfOptions {
  /** Page margin in points (72 pt = 1 in). */
  margin?: number;
  /** Body font size in points. */
  bodySize?: number;
  font?: 'helvetica' | 'times';
  /**
   * The glyph drawn in place of every " | " field separator; the middle dot
   * unless given. The Markdown keeps the pipe regardless; see separator.ts for
   * the offered presets.
   */
  separator?: string;
}

export const PAGE = { width: 612, height: 792 } as const;

/**
 * Page-margin choices offered by the page. The first is the built-in default;
 * "compact" is the 0.5 in minimum the ATS review recommends, below which some
 * converters clip text.
 */
export type MarginPresetId = 'comfortable' | 'compact';
export interface MarginPreset {
  id: MarginPresetId;
  label: string;
  /** Margin on every side, in points (72 pt = 1 in). */
  points: number;
}
export const MARGIN_PRESETS: readonly MarginPreset[] = [
  { id: 'comfortable', label: 'Comfortable (48 pt)', points: 48 },
  { id: 'compact', label: 'Compact (36 pt)', points: 36 },
];
export const DEFAULT_MARGIN_PRESET: MarginPreset = MARGIN_PRESETS[0];

/** The preset with this id, or the default for anything unknown (null, a stale stored value, a typo). */
export function marginPreset(id: string | null | undefined): MarginPreset {
  return MARGIN_PRESETS.find((p) => p.id === id) ?? DEFAULT_MARGIN_PRESET;
}

const DEFAULTS: Required<PdfOptions> = { margin: DEFAULT_MARGIN_PRESET.points, bodySize: 10, font: 'helvetica', separator: DEFAULT_SEPARATOR.glyph };
const LINE_HEIGHT = 1.28;
const BULLET = '•';
const BULLET_INDENT = 14;

type Rgb = [number, number, number];
const INK: Rgb = [0, 0, 0];
const HEADING_INK: Rgb = [40, 40, 40];
/**
 * Section rule: the red bar under every section title in the original Pages
 * export (measured from its content stream: #C00000, 0.75 pt, content width).
 * It is a vector path, not text, so parsers never see it. jsPDF writes draw
 * colors with two decimals, so the stream carries "0.75 0 0 RG" (191/255), one
 * level off the original and indistinguishable on screen or paper.
 */
const RULE: Rgb = [192, 0, 0];
const RULE_WIDTH = 0.75;

/** One word or one space, with the style of the span it came from. */
interface Token {
  text: string;
  bold: boolean;
  italic: boolean;
  href?: string;
  width: number;
  space: boolean;
}

/** A link inside a run: where it starts, as an offset from the run's start, and how wide it is. */
interface LinkSpan {
  href: string;
  x: number;
  width: number;
}

/**
 * Consecutive tokens of one weight and slant on one line, written to the PDF
 * as a single string. Links do not split a run; their annotations are placed at
 * measured offsets inside it.
 */
interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
  width: number;
  links: LinkSpan[];
}

interface RichOptions {
  bold?: boolean;
  italic?: boolean;
  color?: Rgb;
  /** Extra height that must fit on the page together with the first line. */
  keepWith?: number;
}

class Layout {
  readonly doc: jsPDF;
  readonly margin: number;
  readonly bodySize: number;
  readonly font: string;
  readonly contentWidth: number;
  y: number;

  constructor(doc: jsPDF, options: Required<PdfOptions>) {
    this.doc = doc;
    this.margin = options.margin;
    this.bodySize = options.bodySize;
    this.font = options.font;
    this.contentWidth = PAGE.width - options.margin * 2;
    this.y = options.margin;
  }

  get bottom(): number {
    return PAGE.height - this.margin;
  }

  /** Start a new page if `height` points will not fit below the cursor. */
  ensure(height: number): void {
    if (this.y + height > this.bottom) {
      this.doc.addPage();
      this.y = this.margin;
    }
  }

  setFont(size: number, bold: boolean, italic: boolean): void {
    const style = bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal';
    this.doc.setFont(this.font, style);
    this.doc.setFontSize(size);
  }

  /**
   * Width of `text` in the current font, measured the way a viewer will draw
   * it. jsPDF's own measurement applies the font's kerning pairs, but it writes
   * plain text operators that no viewer kerns, so kerned widths come up short
   * (0.9 pt on "Tuckborough" in bold at 10 pt) and anything positioned after the word
   * lands too far left, visibly swallowing the space before a " | " separator.
   * Measuring without kerning matches the advance widths in the file.
   */
  measure(text: string, size: number): number {
    return this.doc.getStringUnitWidth(text, { doKerning: false }) * size;
  }

  tokenize(spans: Span[], size: number): Token[] {
    const out: Token[] = [];
    for (const span of spans) {
      for (const part of span.text.split(/(\s+)/)) {
        if (part === '') continue;
        const space = /^\s+$/.test(part);
        const text = space ? ' ' : part;
        this.setFont(size, span.bold, span.italic);
        out.push({ text, bold: span.bold, italic: span.italic, href: span.href, space, width: this.measure(text, size) });
      }
    }
    return out;
  }

  wrap(tokens: Token[], maxWidth: number): Token[][] {
    const lines: Token[][] = [];
    let line: Token[] = [];
    let width = 0;
    const flush = (): void => {
      while (line.length > 0 && line[line.length - 1].space) line.pop();
      if (line.length > 0) lines.push(line);
      line = [];
      width = 0;
    };
    for (const token of tokens) {
      if (token.space && line.length === 0) continue;
      if (!token.space && line.length > 0 && width + token.width > maxWidth) flush();
      line.push(token);
      width += token.width;
    }
    flush();
    return lines;
  }

  /**
   * Merge a wrapped line into runs that change only where the weight or slant
   * changes. A space joins the run that is open (its own weight does not
   * matter: the space glyph has one width per family). Links stay inside the
   * run and are remembered as offsets, so a line such as the contact line is
   * one string even when it ends in a link.
   *
   * Fewer boundaries also means less drift: jsPDF's width table rounds every
   * glyph to 10 font units, about 0.5% short, so where a run does start after
   * another the viewer's advance and the computed x can differ by that share
   * of the preceding run. With boundaries only after short bold labels, that
   * stays under half a point.
   */
  runs(line: Token[]): Run[] {
    const out: Run[] = [];
    for (const token of line) {
      let run = out[out.length - 1];
      if (run === undefined || !(token.space || (run.bold === token.bold && run.italic === token.italic))) {
        run = { text: '', bold: token.bold, italic: token.italic, width: 0, links: [] };
        out.push(run);
      }
      if (token.href !== undefined) {
        const last = run.links[run.links.length - 1];
        if (last !== undefined && last.href === token.href && last.x + last.width === run.width) last.width += token.width;
        else run.links.push({ href: token.href, x: run.width, width: token.width });
      }
      run.text += token.text;
      run.width += token.width;
    }
    return out;
  }

  /** Draw inline-Markdown text at x within maxWidth, wrapping and paging as needed. */
  drawRich(markdown: string, x: number, maxWidth: number, size: number, options: RichOptions = {}): void {
    const spans = parseInline(markdown.replace(/\s*\n\s*/g, ' ')).map((s) => ({
      ...s,
      bold: s.bold || options.bold === true,
      italic: s.italic || options.italic === true,
    }));
    const lines = this.wrap(this.tokenize(spans, size), maxWidth);
    const lineHeight = size * LINE_HEIGHT;
    this.ensure(lineHeight + (options.keepWith ?? 0));
    const color = options.color ?? INK;
    for (const line of lines) {
      this.ensure(lineHeight);
      let cx = x;
      for (const run of this.runs(line)) {
        this.setFont(size, run.bold, run.italic);
        this.doc.setTextColor(color[0], color[1], color[2]);
        this.doc.text(run.text, cx, this.y, { baseline: 'top' });
        for (const link of run.links) this.doc.link(cx + link.x, this.y, link.width, lineHeight, { url: link.href });
        cx += run.width;
      }
      this.y += lineHeight;
    }
  }

  drawHeader(resume: Resume): void {
    this.drawRich(resume.name, this.margin, this.contentWidth, 17, { bold: true });
    this.y += 3;
    for (const paragraph of resume.contact.split(/\n{2,}/)) {
      if (paragraph.trim() === '') continue;
      this.drawRich(paragraph, this.margin, this.contentWidth, 9.5);
      this.y += 1;
    }
    this.y += 4;
  }

  drawSectionTitle(title: string): void {
    const size = this.bodySize + 0.5;
    const lineHeight = size * LINE_HEIGHT;
    this.y += 8;
    // Keep the title with at least two body lines so it never sits alone at a page bottom.
    this.ensure(lineHeight + 8 + this.bodySize * LINE_HEIGHT * 2);
    this.drawRich(title.toUpperCase(), this.margin, this.contentWidth, size, { bold: true, color: HEADING_INK });
    this.y += 1.5;
    this.doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    this.doc.setLineWidth(RULE_WIDTH);
    this.doc.line(this.margin, this.y, this.margin + this.contentWidth, this.y);
    this.y += 5;
  }

  drawSubheading(text: string): void {
    const size = this.bodySize + 0.5;
    this.y += 5;
    this.ensure(size * LINE_HEIGHT + this.bodySize * LINE_HEIGHT * 2);
    this.drawRich(text, this.margin, this.contentWidth, size, { bold: true });
    this.y += 1;
  }

  drawParagraph(text: string): void {
    this.drawRich(text, this.margin, this.contentWidth, this.bodySize);
    this.y += 3;
  }

  drawList(items: string[]): void {
    const lineHeight = this.bodySize * LINE_HEIGHT;
    for (const item of items) {
      if (item.trim() === '') continue;
      this.ensure(lineHeight);
      this.setFont(this.bodySize, false, false);
      this.doc.setTextColor(INK[0], INK[1], INK[2]);
      this.doc.text(BULLET, this.margin + 3, this.y, { baseline: 'top' });
      this.drawRich(item, this.margin + BULLET_INDENT, this.contentWidth - BULLET_INDENT, this.bodySize);
      this.y += 1.5;
    }
    this.y += 2;
  }

  drawBlock(block: Block): void {
    switch (block.type) {
      case 'heading':
        this.drawSubheading(block.text);
        break;
      case 'paragraph':
        this.drawParagraph(block.text);
        break;
      case 'list':
        this.drawList(block.items);
        break;
    }
  }
}

export function buildPdf(resume: Resume, options: PdfOptions = {}): jsPDF {
  const settings: Required<PdfOptions> = { ...DEFAULTS, ...options };
  const shown = applySeparator(resume, settings.separator);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait', compress: false });
  doc.setProperties({
    title: `${shown.name} Resume`.trim(),
    author: shown.name,
    subject: 'Resume',
    keywords: 'resume',
    creator: 'rezoom builder',
  });
  const layout = new Layout(doc, settings);
  layout.drawHeader(shown);
  for (const section of shown.sections) {
    layout.drawSectionTitle(section.title);
    for (const block of section.blocks) layout.drawBlock(block);
  }
  return doc;
}

export function buildPdfBytes(resume: Resume, options: PdfOptions = {}): ArrayBuffer {
  return buildPdf(resume, options).output('arraybuffer');
}

// --------------------------------------------------------- character support
// The standard PDF fonts use WinAnsi (CP-1252) encoding. Anything outside it
// (emoji, box-drawing glyphs such as the original ▪ bullet, non-Latin scripts)
// would render as garbage, so the UI warns before download.

const CP1252_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

export function isWinAnsiChar(char: string): boolean {
  const code = char.codePointAt(0) ?? -1;
  if (code === 0x09 || code === 0x0a || code === 0x0d) return true;
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0xa0 && code <= 0xff) return true;
  return CP1252_EXTRA.has(char);
}

export function findUnsupportedChars(text: string): string[] {
  return [...new Set([...text].filter((ch) => !isWinAnsiChar(ch)))];
}

export function resumeUnsupportedChars(resume: Resume): string[] {
  return findUnsupportedChars(allText(resume).join('\n'));
}
