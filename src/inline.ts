/**
 * Minimal inline-Markdown support: **bold**, *italic*, and [text](url).
 * Shared by the HTML preview and the PDF layout so both render the same spans.
 */

export interface Span {
  text: string;
  bold: boolean;
  italic: boolean;
  href?: string;
}

// Alternatives, in priority order: bold, italic, link.
const INLINE_TOKEN = /\*\*(.+?)\*\*|\*([^*]+?)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(markdown: string): Span[] {
  const spans: Span[] = [];
  let last = 0;
  for (const match of markdown.matchAll(INLINE_TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) spans.push({ text: markdown.slice(last, at), bold: false, italic: false });
    if (match[1] !== undefined) spans.push({ text: match[1], bold: true, italic: false });
    else if (match[2] !== undefined) spans.push({ text: match[2], bold: false, italic: true });
    else spans.push({ text: match[3], bold: false, italic: false, href: match[4] });
    last = at + match[0].length;
  }
  if (last < markdown.length) spans.push({ text: markdown.slice(last), bold: false, italic: false });
  return spans;
}

/** Plain text with all inline markup removed (link text kept, URL dropped). */
export function stripInline(markdown: string): string {
  return parseInline(markdown)
    .map((s) => s.text)
    .join('');
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** Only allow link schemes that cannot execute script. */
export function safeHref(href: string): string {
  return /^(https?:|mailto:|tel:)/i.test(href.trim()) ? href.trim() : '#';
}

export function inlineToHtml(markdown: string): string {
  return parseInline(markdown)
    .map((s) => {
      let html = escapeHtml(s.text);
      if (s.bold) html = `<strong>${html}</strong>`;
      if (s.italic) html = `<em>${html}</em>`;
      if (s.href) html = `<a href="${escapeHtml(safeHref(s.href))}" rel="noopener">${html}</a>`;
      return html;
    })
    .join('');
}
