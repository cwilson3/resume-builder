# playwright-tests-for-resume-builder

System (end-to-end) tests for the resume builder in the parent directory (`..`), kept in a separate
package per the team quality guide so they can move to their own repository later. The same specs
run against both shells: the vanilla page (`..`) and the React shell (`../resume-builder-react`).

## Run

Install the vanilla page (`..`) and the React shell (`../resume-builder-react`) first; the tests
start both dev servers and build both pages.

```bash
npm install
npm test                 # every project, both shells; starts both Vite dev servers itself
npm run test:vanilla     # the vanilla page only (dev server and built page)
npm run test:react       # the React shell only (dev server and built page)
npm run report           # opens the HTML report
```

| Project | Runs | Against |
| ------- | ---- | ------- |
| `vanilla` | `tests/builder.spec.ts` | The vanilla dev server, http://localhost:5173 |
| `react` | `tests/builder.spec.ts` | The React dev server, http://localhost:5180 |
| `vanilla-built-page` | `tests/built-page.spec.ts` | `../dist/index.html`, opened from disk (`file://`) |
| `react-built-page` | `tests/built-page.spec.ts` | `../resume-builder-react/dist/index.html`, opened from disk |

Each built-page project depends on a build setup project (`vanilla-build`, `react-build`, both
`tests/build.setup.ts`) that runs `npm run build` in that shell's package first, so the file under
test is never stale. The build empties that `dist/`, so in the vanilla page it also removes any PDF
that `npm run build:file` left there. Which package a build or built-page project uses comes from
the `shellDir` option in `tests/fixtures.ts`, set per project in `playwright.config.ts`.

Outside CI, a server already listening on 5173 or 5180 is reused instead of started. Stop any
other dev server on those ports first, or the tests run against whatever it serves.

`@playwright/test` is pinned to exactly 1.63.0 because that release matches the Chromium
build already present in the local Playwright browser cache (build 1243); on a machine
without it, or after bumping the version, run `npx playwright install chromium`.

## What is covered

The dev server (`vanilla` and `react`):

- The source file loads into the editor and the preview.
- Deleting a section removes it from the preview and from the downloaded Markdown, and
  the source file on disk is unchanged (checked by hash).
- Deleting an entry removes the role heading and its bullets together.
- Downloading a PDF produces a file with the PDF signature, title metadata, and the
  default file name; a typed file name is respected.
- The PDF margin choice applies to the download and persists across a reload.
- The field separator choice (middle dot by default, or the pipe) changes the preview
  and the PDF, leaves the Markdown and the editor untouched, and persists across a
  reload.
- Undo restores a deleted section; Reset returns to the source file.
- Adding a section and an entry shows up in the preview.
- Opening another Markdown file replaces the working copy.
- The page warns about characters the standard PDF fonts cannot render.
- The working copy survives a reload and is labeled as restored.
- The source file is fetched from beside the page at start-up, not built in.
- A file opened with Change source stays the source file that Reset returns to, after a reload.
- An axe-core scan reports no serious or critical WCAG 2.x A/AA violations.
- A full-page screenshot is attached to the report.

The built page (`vanilla-built-page` and `react-built-page`):

- The build produces a single-file page plus the source file, copied unchanged, and the page
  does not contain the resume.
- Opened from disk on a first visit, it shows a welcome panel naming the shipped file, with
  Reset and Download disabled, makes no network requests, and passes an axe-core scan.
- Choosing the shipped file loads it as the source file; Reset returns to it after an edit and
  a reload; Change source makes another file the source file.
- It downloads the resume as Markdown (identical to the shipped file) and as a PDF.
