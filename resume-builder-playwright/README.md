# playwright-tests-for-resume-builder

System (end-to-end) tests for the resume builder in the parent directory (`..`), kept in a separate
package per the team quality guide so they can move to their own repository later.

## Run

```bash
npm install
npm test            # starts the builder's Vite dev server itself, then runs Chromium
npx playwright test --project=built-page   # only the built page (rebuilds dist/ first)
npm run report      # opens the HTML report
```

There are two sets of tests:

- **`chromium`** runs `tests/builder.spec.ts` against the Vite dev server.
- **`built-page`** runs `tests/built-page.spec.ts` against `../dist/index.html`, opened from
  disk (`file://`) the way the page is handed out, with the master shipped beside it. It depends on the `build` setup project
  (`tests/build.setup.ts`), which runs `npm run build` in the builder first, so the file
  under test is never stale. That build empties `dist/`, so it also removes any PDF that
  `npm run build:file` left there.

`@playwright/test` is pinned to exactly 1.63.0 because that release matches the Chromium
build already present in the local Playwright browser cache (build 1243); on a machine
without it, or after bumping the version, run `npx playwright install chromium`.

## What is covered

- The master loads into the editor and the preview.
- Deleting a section removes it from the preview and from the downloaded Markdown, and
  the master file on disk is unchanged (checked by hash).
- Deleting an entry removes the role heading and its bullets together.
- Downloading a PDF produces a file with the PDF signature, title metadata, and the
  default file name; a typed file name is respected.
- The PDF margin choice applies to the download and persists across a reload.
- The field separator choice (middle dot by default, or the pipe) changes the preview
  and the PDF, leaves the Markdown and the editor untouched, and persists across a
  reload.
- Undo restores a deleted section; Reset returns to the master.
- Adding a section and an entry shows up in the preview.
- Opening another Markdown file replaces the working copy.
- The page warns about characters the standard PDF fonts cannot render.
- The working copy survives a reload and is labeled as restored.
- The master is fetched from beside the page at start-up, not built in.
- A file opened with Change source stays the master that Reset returns to, after a reload.
- An axe-core scan reports no serious or critical WCAG 2.x A/AA violations.
- A full-page screenshot is attached to the report.

The built page (`built-page`):

- The build produces a single-file page plus the master, copied unchanged, and the page
  does not contain the resume.
- Opened from disk on a first visit, it shows a welcome panel naming the shipped file, with
  Reset and Download disabled, makes no network requests, and passes an axe-core scan.
- Choosing the shipped file loads it as the master; Reset returns to it after an edit and
  a reload; Change source makes another file the master.
- It downloads the resume as Markdown (identical to the shipped file) and as a PDF.
