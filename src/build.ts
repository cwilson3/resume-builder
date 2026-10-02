import type { Resume } from './model';
import { serializeResume } from './serialize';
import { buildPdfBytes, type PdfOptions } from './pdf';

/** The one place that turns a Resume into downloadable bytes. */

export type OutputFormat = 'md' | 'pdf';

export interface FormatInfo {
  value: OutputFormat;
  label: string;
  extension: string;
  mime: string;
}

export const FORMATS: readonly FormatInfo[] = [
  { value: 'md', label: 'Markdown (.md)', extension: '.md', mime: 'text/markdown' },
  { value: 'pdf', label: 'PDF (.pdf)', extension: '.pdf', mime: 'application/pdf' },
];

export function formatInfo(format: OutputFormat): FormatInfo {
  const info = FORMATS.find((f) => f.value === format);
  if (!info) throw new Error(`Unknown format: ${String(format)}`);
  return info;
}

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "Bilbo Baggins" → "Bilbo-Baggins-Resume" */
export function defaultBaseName(resume: Resume): string {
  const slug = slugify(resume.name);
  return slug === '' ? 'Resume' : `${slug}-Resume`;
}

/** Clean a user-typed file name: strip a typed extension and unsafe characters. */
export function sanitizeBaseName(input: string, fallback: string): string {
  const cleaned = input
    .trim()
    .replace(/\.(md|pdf)$/i, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned === '' ? fallback : cleaned;
}

export interface BuiltFile {
  blob: Blob;
  filename: string;
  mime: string;
}

export function buildFile(resume: Resume, format: OutputFormat, baseName?: string, pdfOptions?: PdfOptions): BuiltFile {
  const info = formatInfo(format);
  const name = sanitizeBaseName(baseName ?? '', defaultBaseName(resume));
  const filename = `${name}${info.extension}`;
  if (format === 'md') {
    return { blob: new Blob([serializeResume(resume)], { type: info.mime }), filename, mime: info.mime };
  }
  return { blob: new Blob([buildPdfBytes(resume, pdfOptions)], { type: info.mime }), filename, mime: info.mime };
}
