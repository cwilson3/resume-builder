import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Extract the text of each page in CONTENT-STREAM ORDER, the same way a naive
 * applicant-tracking-system parser reads it. No position sorting is applied,
 * so a scrambled document would come back scrambled.
 */
export async function extractPdfPages(bytes: ArrayBuffer): Promise<string[]> {
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true });
  const doc = await task.promise;
  const pages: string[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let text = '';
      for (const item of content.items) {
        if ('str' in item) text += item.str + (item.hasEOL ? '\n' : '');
      }
      pages.push(text);
    }
  } finally {
    await task.destroy();
  }
  return pages;
}

/**
 * The x coordinate, in points, of the first positioned text in the content
 * stream. The name is drawn first at the left margin, so this is the margin the
 * PDF was built with. Works on the raw bytes because the builder does not
 * compress content streams.
 */
export function firstTextX(bytes: ArrayBuffer): number {
  const raw = new TextDecoder('latin1').decode(new Uint8Array(bytes));
  const match = /(-?[\d.]+) -?[\d.]+ Td/.exec(raw);
  if (!match) throw new Error('no positioned text found in the PDF');
  return Number(match[1]);
}

export interface PlacedText {
  /** 1-based page the string is drawn on. */
  page: number;
  /** PDF user-space x of the string's start, in points. */
  x: number;
  /** PDF user-space y as written by jsPDF (top baseline), in points. */
  y: number;
  text: string;
}

/**
 * Every string the builder positions, in content-stream order. jsPDF writes
 * each text() call as one "x y Td" followed by one "(string) Tj", so a run of
 * words drawn together shows up as a single entry, and the x of consecutive
 * entries on a line shows where the builder believes the previous one ends.
 * Escaped parentheses and backslashes are unescaped. Works on the raw bytes
 * because content streams are not compressed.
 */
export function placedText(bytes: ArrayBuffer): PlacedText[] {
  const raw = new TextDecoder('latin1').decode(new Uint8Array(bytes));
  const out: PlacedText[] = [];
  const streams = raw.split(/\bstream\r?\n/).slice(1);
  const pattern = /(-?[\d.]+) (-?[\d.]+) Td\n\(((?:\\.|[^\\)])*)\) Tj/g;
  let page = 0;
  for (const stream of streams) {
    if (!/\bTj\b|\bTf\b/.test(stream)) continue; // not a page content stream
    page += 1;
    for (const m of stream.matchAll(pattern)) {
      out.push({ page, x: Number(m[1]), y: Number(m[2]), text: m[3].replace(/\\([()\\])/g, '$1') });
    }
  }
  return out;
}

/** Collapse whitespace so ordering assertions are not sensitive to line breaks. */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export interface StrokedRule {
  /** 1-based page the rule is drawn on. */
  page: number;
  /** Stroke color as written in the content stream, e.g. "0.75 0. 0." for jsPDF's #C00000. */
  color: string;
  /** Line width in points. */
  width: number;
  x1: number;
  x2: number;
  /** PDF user-space y (origin bottom-left). */
  y: number;
}

/**
 * Every horizontal line the builder strokes right after setting an RGB draw
 * color and a line width: the section rules. jsPDF also re-emits the current
 * draw state at the top of each new page, but without a path, so those are not
 * matched. Works on the raw bytes because content streams are not compressed.
 */
export function sectionRules(bytes: ArrayBuffer): StrokedRule[] {
  const raw = new TextDecoder('latin1').decode(new Uint8Array(bytes));
  const rules: StrokedRule[] = [];
  // Content streams appear in page order; each starts after "stream\n".
  const streams = raw.split(/\bstream\r?\n/).slice(1);
  const pattern = /(-?[\d.]+ -?[\d.]+ -?[\d.]+) RG\n(-?[\d.]+) w\n(-?[\d.]+) (-?[\d.]+) m\n(-?[\d.]+) (-?[\d.]+) l\nS\n/g;
  let page = 0;
  for (const stream of streams) {
    if (!/\bTj\b|\bTf\b/.test(stream)) continue; // not a page content stream
    page += 1;
    for (const m of stream.matchAll(pattern)) {
      const y1 = Number(m[4]);
      const y2 = Number(m[6]);
      if (y1 !== y2) continue; // not horizontal
      rules.push({ page, color: m[1], width: Number(m[2]), x1: Number(m[3]), x2: Number(m[5]), y: y1 });
    }
  }
  return rules;
}
