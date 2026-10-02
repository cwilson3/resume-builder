# Resume Builder

A single-page tool for producing tailored versions of a master resume without ever
editing the master itself. It ships with a Bilbo Baggins resume
(`resume/Bilbo-Baggins-Resume.md`) as filler; point `rezoom.config.json` at your own
Markdown resume to use it for real. Load the master (or any Markdown resume), modify, add, or
delete sections and content in the page, then download the result as Markdown or as
an ATS-friendly PDF. All file building happens in small pure TypeScript modules that
run both in the browser and in Node, so the same code is unit-tested and used by a
command-line script.

## Master document

The master (superset of everything that could go on the resume) is whichever Markdown
file `rezoom.config.json` points at. The path is relative to this directory:

```json
{ "master": "resume/Bilbo-Baggins-Resume.md" }
```

The master is not built into the page. `npm run build` copies it into `dist/` beside
`index.html` (for example `dist/Bilbo-Baggins-Resume.md`), and the page only knows its
file name. Hand off both files together. The page reads the master and never writes to it.
The `REZOOM_MASTER` environment variable overrides the config for a single command and is
resolved the same way, for example `REZOOM_MASTER=../my-resume.md npm run build`.

How the page finds its master at start-up:

1. **Served over http** (`npm run dev`, or `dist/` on any web host): it fetches the
   shipped file, so edits to that file show up on the next load.
2. **Opened from disk** (`file://`): browsers do not let a page read other files on
   its own, so the fetch fails. The page falls back to the master stored in this browser
   from an earlier visit. On a first visit there is none, so it shows a welcome panel
   that names the shipped file and offers **Choose a resume…**.
3. A file chosen with **Choose a resume…** or **Change source** becomes the master and
   stays the master, here and after a reload, until another file is chosen.

**Reset to master** is disabled until a master has been loaded, then returns to it.
The master and the in-progress working copy are kept in this browser's local storage
under `rezoom.master.v1` and `rezoom.workingCopy.v1`. Reset discards the working copy.

### What the master file must look like

Any Markdown file works as long as its structure maps onto the builder's fields:

| Markdown | Builder field |
| -------- | ------------- |
| First `#` heading (or the first text line when there is none) | Header name |
| Paragraph(s) between the name and the first `##` | Contact line |
| `##` heading | Section |
| `###` heading | Subheading; starts an entry |
| `-` bullets (also `*`, `+`, `1.`, `•`, `▪`) | List, one bullet per line |
| Any other text | Paragraph |
| A `###` heading plus every block until the next `###` or `##` | Entry |

Headings deeper than `###` are read as subheadings, and tables, images, and code
fences are read as plain paragraphs. The file must start with the name; front matter
would be read as the name.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173, live-reloads when the master changes
```

Other commands:

| Command | What it does |
| ------- | ------------ |
| `npm run build` | Bundles the page into one self-contained `dist/index.html` that also works when opened from disk (`file://`), and copies the master named in `rezoom.config.json` beside it. |
| `npm run build:file -- --format pdf` | Builds a PDF (named after the resume, for example `dist/Bilbo-Baggins-Resume.pdf`) from the configured master without a browser. Also `--format md`, `--in <file.md>`, `--out <path>`, `--margin compact` (a preset name or a number of points), and `--separator pipe` (how the ` \| ` between fields is drawn; `dot`, the default, or `pipe`). |
| `npm test` | Runs the Vitest unit suite (145 tests). |
| `npm run coverage` | Unit tests with a V8 coverage report and thresholds (95% statements, 90% branches, 95% functions, 95% lines). |
| `npm run typecheck` | TypeScript, no emit. |

End-to-end tests live in `playwright-tests-for-resume-builder/`, a separate npm package (see its
README) kept apart per the team quality guide so it can move to its own repository later.

## Using the page

- **Header card**: name and contact line. Keep contact details here, never in a page
  header or footer, so parsers can find them.
- **Section cards**: rename, reorder, collapse, or delete a section. Inside a section,
  each block is a paragraph, a list (one bullet per line), or a subheading. A subheading
  plus the blocks beneath it form an entry (a job); "Delete entry" removes the whole
  group at once. "+ Entry" adds a ready-made role skeleton.
- **Inline formatting**: `**bold**`, `*italic*`, and `[text](https://…)` are supported
  in any text and render in both the preview and the PDF.
- **Download…** (toolbar) opens the Download dialog, which holds the Format, Margins,
  Separator, and File name options below. **Download** in the dialog (or Enter in the
  file name) saves the file and closes it; **Cancel** or Escape closes it without
  downloading.
- **Format**: `.md` or `.pdf`. Optionally type a file name; the default is derived from
  the header name, for example `Bilbo-Baggins-Resume.pdf`.
- **Margins** (shown for PDF only): Comfortable (48 pt, the default) or Compact (36 pt,
  the 0.5 inch minimum commonly recommended for ATS parsing). The choice persists in this browser.
- **Separator**: how the ` | ` between fields (company, location, dates; the contact
  line; education and certification items) is shown in the preview and the PDF: a
  middle dot ( · ), the default, or the pipe itself. It is a display choice only. The
  editor, the Markdown download, and the working copy always keep the pipe in the
  source, so the master round-trips unchanged and the
  Modified badge does not light up. Only pipes with a space on both sides are swapped.
  Although it lives in the Download dialog, changing it updates the preview right away.
  The choice persists in this browser.
- **Undo** reverts structural changes and text edits; **Reset to master** reloads the
  master; **Change source** loads any other Markdown resume and makes it the master.
- A warning appears if the text contains characters the standard PDF fonts cannot
  render (for example the old `▪` bullet or emoji).
- **Settings** (the gear in the top-right corner): a dark-mode switch and a content-width
  choice (24, 40, or Full). The panel closes on Escape or a click outside it. Both persist in this browser. Styling is intentionally plain:
  system fonts, neutral colors, no branding.

## Why the PDF is ATS-friendly

Resume exports from design tools often fail automated parsing. The PDF built here avoids
the usual causes:

- one column drawn top to bottom, so the content stream order is the reading order;
- real text in the standard Helvetica family, with no embedded fonts, no letter-spacing,
  no tables, no text boxes, and no images;
- each line written as one string per weight and slant, spaces and links inside it, so
  the viewer spaces the words itself. Where a run does follow another (after a bold
  label) it is placed with unkerned widths, because viewers draw the standard fonts
  without kerning: a position computed from jsPDF's kerned measurement (0.9 pt short on
  "Tuckborough" in bold at 10 pt) used to swallow the space before a ` \| ` separator;
- standard `•` bullets that exist as characters in the text layer;
- Letter size, 48 pt margins by default (36 pt with the Compact choice, still the
  recommended 0.5 inch minimum), automatic page breaks that keep a heading with the
  lines that follow it;
- document metadata (title, author) set from the resume name;
- a red rule under each section title (#C00000, 0.75 pt), drawn as a vector line outside the text layer so parsers never see it.
  The live preview draws the same rule.

`src/pdf.test.ts` proves these properties by parsing the generated PDF back with
pdf.js in content-stream order and asserting that every entry heading is followed by
its own bullets before the next heading.

## Architecture

| Module | Responsibility | Tests |
| ------ | -------------- | ----- |
| `src/model.ts` | Resume data model and pure, immutable operations (add, delete, move, rename, entries). | `model.test.ts` |
| `src/parse.ts` | Markdown → Resume. Tolerates legacy bullet glyphs. | `parse.test.ts` |
| `src/serialize.ts` | Resume → Markdown in the master's exact shape. Round-trips the master byte for byte. | `serialize.test.ts` |
| `src/inline.ts` | Bold, italic, and link spans shared by the HTML preview and the PDF. | `inline.test.ts` |
| `src/render-html.ts` | Resume → escaped HTML for the live preview. | `render-html.test.ts` |
| `src/pdf.ts` | Resume → PDF via jsPDF: rich-text wrapping into same-style runs, unkerned placement, bullets, page breaks, the separator option, character support check. | `pdf.test.ts` |
| `src/separator.ts` | The field-separator presets (middle dot, the default, and pipe) and the pure swap applied to a Resume for display. Shared by the preview and the PDF; never by the Markdown. | `separator.test.ts` |
| `src/build.ts` | File naming and the one place that turns a Resume into downloadable bytes. | `build.test.ts` |
| `src/storage.ts` | Guarded local storage for the working copy and the master (its name, its Markdown, and whether it was shipped or picked). | `storage.test.ts` |
| `src/master.ts` | The shipped master's file name (from the `rezoom-master-resume` plugin in `vite.config.ts`) and the fetch that reads it from beside the page. | `master.test.ts` |
| `src/main.ts`, `src/dom.ts` | UI wiring only; covered by the end-to-end suite. | Playwright |
| `src/assets/hardhat.svg` | The page icon (an orange hardhat), used as the favicon and beside the page title. Edit this file; `vite.config.ts` inlines both uses into `index.html` as data URIs in dev and in the build, so the page stays a single file. | Visual |
| `scripts/resolve-master.ts` | Reads `rezoom.config.json` (or `REZOOM_MASTER`) to find the master. Shared by the Vite plugin and the CLI so they always agree. | `resolve-master.test.ts` |
| `scripts/build-file.ts` | Command-line build using the same modules. | Manual, `npm run build:file` |

Unit tests are co-located with the code they test, per the team quality guide. They
were generated with AI assistance and should be reviewed like any other test code.

## Limitations

- Inline Markdown is a deliberate subset: no nested styles, no images, no tables, and
  a link URL cannot contain a `)`.
- The PDF uses the standard 14 fonts, so text is limited to the Windows-1252 character
  set. The page warns before download when other characters are present.
- Numbered lists are read but written back as `-` bullets.
