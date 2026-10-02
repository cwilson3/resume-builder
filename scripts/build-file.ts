/**
 * CLI: build a .md or .pdf from a Markdown resume without the browser.
 *
 *   npm run build:file -- --format pdf
 *   npm run build:file -- --format pdf --margin compact
 *   npm run build:file -- --format pdf --separator pipe
 *   npm run build:file -- --in resume/Bilbo-Baggins-Resume.md --format md --out dist/out.md
 *
 * Without --in, the input is the master from rezoom.config.json (or the
 * REZOOM_MASTER environment variable), the same file the build ships beside the page.
 * --margin takes a preset name (comfortable, compact) or a number of points, as
 * the page's Margins picker does. --separator takes a preset name (dot, the default,
 * or pipe) and changes how the " | " between fields is drawn in the PDF, as the page's
 * Separator picker does; Markdown output always keeps the pipe. Reads the input, never
 * writes to it.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseResume } from '../src/parse';
import { buildFile, defaultBaseName, formatInfo, type OutputFormat } from '../src/build';
import { MARGIN_PRESETS, type PdfOptions } from '../src/pdf';
import { SEPARATOR_PRESETS } from '../src/separator';
import { resolveMaster } from './resolve-master';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const here = dirname(new URL(import.meta.url).pathname);
const input = arg('in') !== undefined ? resolve(arg('in') as string) : resolveMaster().file;
const format = (arg('format') ?? 'pdf') as OutputFormat;
formatInfo(format); // throws on an unknown format

function marginOption(value: string | undefined): PdfOptions | undefined {
  if (value === undefined) return undefined;
  if (/^\d+(\.\d+)?$/.test(value)) return { margin: Number(value) };
  const preset = MARGIN_PRESETS.find((p) => p.id === value);
  if (!preset) throw new Error(`--margin must be a number of points or one of: ${MARGIN_PRESETS.map((p) => p.id).join(', ')}`);
  return { margin: preset.points };
}

function separatorOption(value: string | undefined): PdfOptions | undefined {
  if (value === undefined) return undefined;
  const preset = SEPARATOR_PRESETS.find((p) => p.id === value);
  if (!preset) throw new Error(`--separator must be one of: ${SEPARATOR_PRESETS.map((p) => p.id).join(', ')}`);
  return { separator: preset.glyph };
}

const resume = parseResume(readFileSync(input, 'utf8'));
const built = buildFile(resume, format, undefined, { ...marginOption(arg('margin')), ...separatorOption(arg('separator')) });
const output = resolve(arg('out') ?? resolve(here, '../dist', `${defaultBaseName(resume)}${formatInfo(format).extension}`));

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, new Uint8Array(await built.blob.arrayBuffer()));
console.log(`${input}\n  -> ${output} (${built.blob.size} bytes)`);
