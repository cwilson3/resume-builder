# React version of the resume builder: plan

> **A historical record.** This is the plan the React shell was built from, with its milestone results,
> risks, and decisions, as written in the prototype this repository was cleaned up from (Oct 23–26,
> 2026). It is kept as written apart from removing personal details, so it uses the prototype's
> paths, describes the prototype's page, and refers to section numbers that code comments here no
> longer cite. For how things work now, read the READMEs.
>
> | Prototype path | In this repository |
> | -------------- | ------------------ |
> | `builder/` | the repository root (`src/`, `vite-plugins.ts`, `index.html`) |
> | `builder-react/` | `resume-builder-react/` |
> | `playwright-tests-for-rezoom-site/` | `resume-builder-playwright/` |
> | `perf/RESULTS.md` | `resume-builder-playwright/perf/prototype-reference/RESULTS.md` |
> | `perf/builds/react-initial.html` (frozen) | rebuilt from commit `080c53c` by `resume-builder-playwright/perf/build-react-initial.mts` |
>
> What changed when the work moved here (PRs #5 to #8):
>
> - **The master is no longer built into the page.** It ships beside the page and is fetched; a page
>   opened from disk shows a welcome panel, and Change source (formerly "Open .md…") makes the chosen
>   file the master. So the "master changed" dialog (sections 2, 3.5, 4.2 and the M1 to M3 results) and
>   the `rezoom.workingCopy.master.v1` key are gone; the master is stored as `rezoom.master.v1`.
> - **The download options moved into a Download dialog** (`#btnDownloadOpen` opens it; `#marginGroup`
>   is gone) and the theme and width controls behind a settings gear, so the DOM contract in section 2
>   is out of date in those places. The React shell follows the current vanilla page, not the
>   prototype's.
> - **The initial React port is rebuilt from git instead of frozen as a file.** The port and the
>   memoization were committed separately; the unmemoized commit is reachable through
>   `refs/pull/6/head`.
> - **The perf numbers were not re-measured here.** The prototype's are kept as a reference;
>   `resume-builder-playwright/perf/README.md` explains the harness and why a full run takes hours.
> - **Playwright is pinned to 1.63.0** here, not 1.60.0 (risk 7.6).

**Status:** draft, Oct 23, 2026; revised Oct 25, 2026 after an outside review (disposition in
section 10). **M0 done Oct 25, 2026** (results in section 8.1); **M1 done Oct 25, 2026** (section 8.2); **M2 done
Oct 25, 2026** (section 8.3); **M3 done Oct 25, 2026** (section 8.4); **M4 done Oct 26, 2026** (section 8.5); **M5 done
Oct 26, 2026** as the move into this repository.

**Goal:** a second, React-based shell for the resume builder that lives beside the existing vanilla
TypeScript shell in this repository, runs on its own port, passes the same Playwright suite, and can
be measured against the vanilla version. The port is done the way a React team would expect to
review it: hooks and a reducer, React Testing Library component tests, coverage thresholds, CI, and
a published performance comparison.

**Non-goals:** replacing the vanilla version, changing the document model, the Markdown round trip,
the PDF guarantees, or the visual design. The master stays read-only.

## 1. Layout: a sibling package, no copied logic

Recommended: a new top-level package `builder-react/` with its own `package.json` and
`node_modules`, matching how `playwright-tests-for-rezoom-site/` already sits beside `builder/`.

```text
builder/                 vanilla shell (unchanged except for one small refactor, see 1.2)
builder-react/           React shell, imports the pure modules from ../builder/src by alias
playwright-tests-for-rezoom-site/   one suite, run against both ports
```

Why not a second entry inside `builder/`: the vanilla package's coverage exclusions, test
environment (`node`), and README are all coupled to one shell, and `CLAUDE.md` promises that
`main.ts` and `dom.ts` are the only UI files. A sibling package keeps those invariants intact and
gives the public repository a clean "two front ends, one core" story.

Why not npm workspaces: there is deliberately no root package, and the Playwright package pins
`@playwright/test` to the local Chromium cache. Adding workspaces would hoist and re-resolve every
dependency. The alias approach below needs no root package.

### 1.1 Sharing the pure modules

`builder-react/vite.config.ts` and `tsconfig.json` map `@core/*` to `../builder/src/*`:

- Vite: `resolve.alias: { '@core': resolve(__dirname, '../builder/src') }` and
  `server.fs.allow: [resolve(__dirname, '..')]` so dev mode may serve files above the package root.
  Setting `fs.allow` explicitly turns off Vite's automatic workspace-root detection; that is
  intended here, since there is no workspace root to detect.
- TypeScript: `paths: { '@core/*': ['../builder/src/*'] }` and `include` adds `../builder/src`.
- `jspdf` is imported only by `../builder/src/pdf.ts`, and Vite resolves bare imports from the
  importing file's directory, so at run time it comes from `builder/node_modules`. `builder-react`
  still declares `jspdf` at the same pinned version so its `package.json` is honest about what the
  build needs, but declaring it does not change resolution: **`builder/` must be installed before
  `builder-react/` builds**, in CI and on a fresh clone. The first build verifies the checklist in
  risk 7.3.
- Nothing from `builder/src` is copied. The React shell imports `parse`, `serialize`, `model`,
  `render-html`, `build`, `pdf`, `separator`, `storage`, and `master` exactly as `main.ts` does.
- `builder/src/builder.css` is imported by alias too, so the two shells share one stylesheet and
  the Playwright assertions on classes keep working.

### 1.2 One refactor in `builder/`

Move the two Vite plugins (`masterResume`, `inlineIcon`) out of `builder/vite.config.ts` into
`builder/vite-plugins.ts` and import them from both configs. The `virtual:master` module must be
produced by the same plugin in both packages so `rezoom.config.json` and `REZOOM_MASTER` keep
meaning the same thing. `resolve-master.ts` resolves relative to `builder/`, so the React config
calls it with `builder/` as the base. This is the only change to `builder/`, and the existing
unit and Playwright suites must stay green after it.

### 1.3 Ports and scripts

| Package | Script | Port | Output |
| ------- | ------ | ---- | ------ |
| `builder/` | `npm run dev` | 5173 | `builder/dist/index.html` |
| `builder-react/` | `npm run dev` | 5180 | `builder-react/dist/index.html` |

`builder-react/package.json` mirrors the vanilla scripts: `dev`, `build`, `typecheck`, `test`,
`test:watch`, `coverage`. Dependencies: `react`, `react-dom`, `jspdf` (same version as `builder/`,
see 1.1). Dev dependencies: `vite`,
`@vitejs/plugin-react`, `vite-plugin-singlefile`, `vitest`, `@vitest/coverage-v8`, `jsdom`,
`@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`,
`@types/react`, `@types/react-dom`, `typescript`. Pin `vite`, `vitest`, and `typescript` to the
versions already in `builder/` so both packages compile the shared modules the same way.

The single-file build works unchanged: `viteSingleFile()` inlines the React bundle, and the icon
plugin inlines the favicon. Expect roughly 45 KB gzipped more than the vanilla bundle. (M0 measured about 62 KB: a probe build
that pulls in `jspdf` was 315 KB gzipped against vanilla's 253 KB. Restated at M2: 321.3 KB against
252.8 KB as Vite reports it, so about 69 KB; see 8.3.)

## 2. The DOM contract the React shell must honor

The Playwright suite and the stylesheet address the page by ids, classes, data attributes, and
accessible names. The React shell renders the same ones, so the same spec file runs against both
ports with no branching. From `tests/builder.spec.ts` and `builder.css`:

| Kind | Must match |
| ---- | ---------- |
| Toolbar ids | `#sourceLabel`, `#modifiedBadge`, `#btnUndo`, `#btnReset`, `#btnOpen`, `#fileInput`, `#formatPicker`, `#marginGroup`, `#marginPicker`, `#separatorPicker`, `#filename`, `#extLabel`, `#btnDownload`, `#status`, `#flash` |
| Editor | `#editor`, `#fName`, `#fContact`, `.ed-section[data-section][data-title]`, `.ed-title`, `.ed-entry`, `.ed-block[data-block][data-type]`, `.ed-text-field`, `button[data-act]` with the same `data-act` values and `aria-label`s, `#btnAddSection` |
| Preview | `#preview` with the HTML from `renderResumeHtml` unchanged (`h1`, `h2`, `h3`, `p`, `li`, `.rp-contact`), `#previewPanel`, `#markdownPanel`, `#mdOut`, `#tabPreview`, `#tabMarkdown` with `role="tab"` and `aria-selected` |
| Warnings and dialog | `#warning` with `role="alert"` and `hidden`, `#masterChangedDialog`, `#masterChangedOld`, `#masterChangedNew`, OK button |
| Page chrome | `#themeSwitch`, `#widthToggle` buttons named `24`, `40`, `Full` with `aria-pressed`, `body.dark-theme`, `body.width-24|40|full` |
| Button names | `Delete section`, `Delete entry`, `+ Entry`, `+ Paragraph`, `+ List`, `+ Subheading`, `Undo`, `Reset to master`, `Open .md…`, `Download`, `OK` |
| Storage keys | `rezoom.workingCopy.v1`, `rezoom.workingCopy.master.v1`, `rezoom.pdfMargin`, `rezoom.separator`, `rezoom.theme`, `rezoom.width` |

The theme and width inline scripts in `index.html` run before any framework code to avoid a flash
of the wrong theme. Keep them as inline scripts in `builder-react/index.html` as well; they are
not part of the React tree.

## 3. Component and state design

### 3.1 Tree

```text
<App>
  <Toolbar/>                 source label, Modified badge, Undo, Reset, Open, format, margins, separator, file name, Download, status, flash
  <UnsupportedWarning/>      #warning
  <Editor>
    <HeaderCard/>            #fName, #fContact
    <SectionCard/> * n       title, actions, collapse
      <EntryGroup/>          .ed-entry wrapper for a heading and the blocks under it (entryRange)
        <BlockEditor/> * m   .ed-block with a controlled input or textarea
      <AddBar/>
    <AddSectionButton/>
  </Editor>
  <PreviewPane>              tabs, #preview (innerHTML from renderResumeHtml), #mdOut
  <MasterChangedDialog/>
</App>
```

### 3.2 State: one reducer with semantic actions

`builder-react/src/reducer.ts` is a pure module with no React import so it is unit-testable in
Node and counts toward coverage. Actions name the operation rather than carrying a finished
`Resume`, because the reducer has a second job the vanilla `commit` does not: keeping the React
key table in step with the model (see 3.4).

```ts
interface Ids { sections: number[]; blocks: number[][] }   // parallel to resume.sections[i].blocks[j]
interface EditorState {
  resume: Resume; ids: Ids; undo: { resume: Resume; ids: Ids }[];
  lastEditKey: string | null; source: string;
}
type Action =
  // text edits, debounced downstream, share an undo step while editKey repeats
  | { type: 'setName'; value: string } | { type: 'setContact'; value: string }
  | { type: 'renameSection'; si: number; title: string }
  | { type: 'updateBlock'; si: number; bi: number; block: Block }
  // structural edits, flushed immediately, always push an undo step
  | { type: 'addSection' } | { type: 'deleteSection'; si: number } | { type: 'moveSection'; si: number; to: number }
  | { type: 'addBlock'; si: number; block: Block } | { type: 'deleteBlock'; si: number; bi: number }
  | { type: 'moveBlock'; si: number; bi: number; to: number }
  | { type: 'addEntry'; si: number } | { type: 'deleteEntry'; si: number; bi: number }
  | { type: 'undo' }
  | { type: 'load'; markdown: string; source: string; pushUndo: boolean };
```

Each structural case calls the matching `builder/src/model.ts` operation and applies the same
splice to `ids` (fresh ids from a counter for inserted sections and blocks; `addEntry` inserts as
many ids as `entryRange` covers). Text cases call the model operation and leave `ids` untouched.
`undo` restores both. `load` reparses and assigns a fresh id table; with `pushUndo: false` it is
not a user edit and leaves the undo stack alone (init uses this; Reset uses `pushUndo: true` as
the vanilla shell does).

The reducer reproduces the three rules in `main.ts`: structural actions and text edits with a new
`editKey` push an undo step; consecutive text edits with the same key share one; undo cap is 100.
The `editKey` is derived inside the reducer from the action (`name`, `contact`, `title:${si}`,
`block:${si}:${bi}`) so callers cannot get it wrong.

### 3.3 Live state and settled state

The vanilla shell has two update paths, not one: every `commit()` (text edits **and** structural
adds, deletes, and moves) schedules `refresh()` 120 ms later, while undo, reset, and load call
`refresh()` synchronously. (Corrected at M2: earlier revisions said structural commits refresh
synchronously in vanilla. They re-render the editor at once but the preview trails by 120 ms; see
risk 7.15.) The React shell keeps the two paths explicit, and flushes structural edits at once:

| Source | Feeds | Updates |
| ------ | ----- | ------- |
| `state.resume` (live) | editor inputs, action buttons, Undo enabled state, `fit()` of textareas | every render |
| `settledResume` | preview HTML, Markdown tab, status line, Modified badge, unsupported warning, file name placeholder, working-copy save | 120 ms after the last text edit; immediately after any other action |

`settledResume` comes from `useSettledValue(state.resume, 120, flushNow)` where `flushNow` is
true when the last action was not a text edit; the hook returns the live value at once in that
case and the trailing value otherwise. Everything in the second row is memoized from
`settledResume`, never stored:

```ts
const markdown     = useMemo(() => serializeResume(settledResume), [settledResume]);
const previewHtml  = useMemo(() => renderResumeHtml(applySeparator(settledResume, glyph)), [settledResume, glyph]);
const stats        = useMemo(() => M.stats(settledResume), [settledResume]);
const unsupported  = useMemo(() => resumeUnsupportedChars(settledResume), [settledResume]);
const modified     = markdown !== masterMarkdown;
```

Keep 120 ms as the default so the performance comparison is fair, and read an optional
`?debounce=0` query parameter so both shells can be measured without it (the vanilla shell gets
the same parameter in milestone M4).

### 3.4 Keys and focus

Resolved Oct 25, 2026 by reading `builder/src/model.ts` and `main.ts`:

- The model operations use `map`, `filter`, and `slice`, so untouched sections and blocks keep
  their object identity across structural edits, **but every text edit replaces the edited block
  object** (`main.ts` builds a new block and calls `updateBlock`). A `WeakMap<Block, number>` key
  would therefore remount the field being typed in on every keystroke and lose focus and caret.
  Index keys would reuse an instance for a different block after a move or delete. Neither is
  acceptable, so identity lives outside the model: the `ids` table in the reducer (3.2), which is
  the "stable UI identity kept separately from the serialized data" the review asked for, without
  touching `Resume`.
- `SectionCard` is keyed by `ids.sections[si]`, `BlockEditor` by `ids.blocks[si][bi]`. Entry
  groups take the key of their heading block.
- Collapsed sections: `useState<Set<number>>` of section ids. The vanilla shell has to re-add the
  section to its `WeakSet` after a rename because the object changes; ids make that go away.
- Controlled inputs keep focus across re-renders, so text edits need no special handling. Each
  textarea calls `fit()` from a `useLayoutEffect` on value change, replacing the manual call.
- "+ Entry" and "+ Add section" focus the new field after commit: a `pendingFocus` ref holding
  the new id, read in a `useEffect` after the render that adds the element.
- Acceptance (component tests, 4.2): caret stays in place while typing in the middle of a field;
  focus survives insert, delete, and move of a neighboring block and of the block itself; a
  structural change followed by typing produces two undo steps.

### 3.5 Side effects and persistence

- Working-copy save: `useEffect` on the settled Markdown, calling `saveWorkingCopy`
  unconditionally, including right after Reset. This matches the vanilla shell, where Reset calls
  `clearWorkingCopy()` and the following `refresh()` immediately re-saves the master text; the
  invariant that makes it correct is on the read side: **init treats a stored copy equal to the
  master as "no working copy"** (`main.ts` `init()`: `saved !== masterMarkdown`). The React shell
  keeps both halves, and the lifecycle is tested end to end (4.4): edit, reload, edits survive;
  Reset, reload, master is active with no "Working copy" label; edit again, reload, new edits
  survive; stored master label differs, dialog shows and the copy is kept.
- Preferences (`rezoom.pdfMargin`, `rezoom.separator`): a `usePersistedPref(key, fallback)` hook
  with the same try/catch around `localStorage`. The shared `storage.ts` already swallows storage
  errors; the component suite covers a throwing `Storage` once to prove the shell renders anyway.
- Download: a click handler that calls `buildFile` and `downloadBlob`; the flash message is state
  cleared by a 4 s timeout in an effect.
- Init: on mount, read the working copy and its master label, dispatch `load` with
  `pushUndo: false`, and open `<dialog>` with `showModal()` from a ref when the saved master
  differs. Same wording as today.
- `index.html` keeps the theme and width inline scripts; a `useBodyClass` hook is unnecessary.

### 3.6 Preview rendering

`#preview` is set with `dangerouslySetInnerHTML` from `renderResumeHtml`. That is the right call:
the HTML renderer is a shared pure module with its own tests, and rebuilding it as components would
fork the preview from the PDF. Memoization means the string is only rebuilt when the debounced
resume or the separator changes.

## 4. Tests

Tests follow the team quality guide: Vitest unit tests co-located with the code, React Testing
Library for components, Playwright for end-to-end.

### 4.1 Unit (Node environment)

- `reducer.test.ts`: every action, the undo cap, the shared-edit-key rule, `load` with and
  without an undo push, and the `ids` table: ids move with their blocks on move and delete, new
  ids are unique, `addEntry` inserts the right count, `undo` restores the previous table. Mirrors
  the behaviors Playwright already asserts ("undo restores", "Modified badge").
- `hooks/useSettledValue.test.ts` with fake timers: trailing value after 120 ms for text edits,
  immediate value when `flushNow` is set, `?debounce=0` path.

### 4.2 Component (jsdom environment, React Testing Library)

Vitest 4 `test.projects` in `builder-react/vite.config.ts`: a `unit` project (`node`) for
`*.test.ts` and a `components` project (`jsdom`) for `*.test.tsx`. Cases, each driven through
`user-event` and asserted on the DOM contract in section 2:

- Renders the master: name field, section cards, and preview headings from the real
  `virtual:master`.
- Typing in a bullet updates the preview after the debounce and sets the Modified badge; typing
  the original text back clears it.
- Add entry inserts `New Role` and focuses the last field; Delete entry removes the heading and
  its blocks and nothing else.
- Move section up and down, with the first and last buttons disabled.
- Undo after a structural change restores the previous resume; consecutive keystrokes collapse to
  one undo step.
- Unsupported character shows the warning with the right glyph listed.
- Format picker switches the extension label and hides or shows the margin group.
- Download calls `buildFile` with the chosen format, margin, and separator (mock `downloadBlob`).
- Reset to master restores the label, hides the badge, and leaves storage holding the master text
  (the rule in 3.5); a remount then shows the master with no "Working copy" label.
- Master-changed dialog opens when the stored master label differs; in jsdom it falls back to the
  `open` attribute (risk 7.5); Escape or OK closes it and the working copy is untouched.
- Focus and caret (from 3.4): typing in the middle of a bullet keeps the caret; focus survives
  moving the focused block and deleting its neighbor; "+ Entry" focuses the new heading.
- Undo after mixed operations: delete a block, type in another, undo twice, both restored in
  order.
- Trust boundary: open a Markdown file containing `<script>`, an `&`, and a `javascript:` link;
  the preview has no `script` element, the text is escaped, and the anchor's `href` is `#`. The
  shared renderer already covers this in `builder/src/render-html.test.ts` and `inline.test.ts`;
  this one test proves the React shell did not add an unescaped path around it.
- Storage throwing: a `Storage` stub whose methods throw; the page renders the master and edits
  still work.

### 4.3 Coverage

Same thresholds as `builder/`: 95% statements, 90% branches, 95% functions, 95% lines, over
`builder-react/src/**/*.{ts,tsx}` excluding `main.tsx` and test utilities. The shared modules under
`../builder/src` are excluded here because `builder/` already measures them. The thresholds are a
floor, not the goal: every case in 4.2 asserts a behavior a user would notice, and no test exists
only to cover a line.

### 4.4 End-to-end

`playwright.config.ts` gains a second project and a second web server:

```ts
projects: [
  { name: 'vanilla', use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5173' } },
  { name: 'react',   use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5180' } },
],
webServer: [
  { command: 'npm run dev -- --port 5173 --strictPort', cwd: '../builder',       url: 'http://localhost:5173', reuseExistingServer: true },
  { command: 'npm run dev -- --port 5180 --strictPort', cwd: '../builder-react', url: 'http://localhost:5180', reuseExistingServer: true },
],
```

`tests/builder.spec.ts` runs unchanged under both projects. `npx playwright test --project=react`
runs one side. Until M2, `npm test` runs `--project=vanilla` only (`test:react` and `test:all` run
the rest); M2 switches `npm test` to both projects. The master-changed and open-another-file scenarios keep using
`fixtures/other-person.md`. Done means both projects are green with no existing test edited to
accommodate the React shell; a needed edit means the DOM contract was broken.

New tests may be added to the shared spec when they describe behavior both shells already have;
the vanilla project must pass them without any change to `builder/`. One is planned now, because
the suite covers steps 1 and 4 of the persistence lifecycle in 3.5 but not steps 2 and 3:
"reset then reload shows the master, and a later edit survives a reload". It is written in M0,
confirmed green on vanilla, and then becomes part of the gate for the React shell.

## 5. Performance comparison

The two shells share every pure module, so only the shell's rendering cost differs. Measure that,
and measure the pure modules once as the shared baseline.

### 5.1 Instrumentation (both shells, behind `?perf=1`)

**Revised in M4:** not built as written. The frozen initial React build (8.3) has no `perf.ts`, so
an in-page module would have measured two rows one way and the third another. The same observers
(Event Timing at `durationThreshold: 16`, long tasks) are installed into every page by
`perf/harness.ts` through `addInitScript`, latency is stamped by a listener armed through
`page.evaluate`, and script, layout, style, and heap come from CDP. The bullets below are the
original design, kept for the record.

A tiny `perf.ts` in each shell, loaded only when the query flag is present:

- `performance.mark` and `performance.measure` around commit and refresh, with a double
  `requestAnimationFrame` after each state change to stamp the next paint.
- A `PerformanceObserver` for `event` entries with `durationThreshold: 16` (the Event Timing
  default of 104 ms would drop almost every keystroke we want to see; 16 ms is the documented
  minimum) and for `longtask` entries. These are **lab event-timing samples**, not INP: INP is a
  defined field metric with its own aggregation, and `RESULTS.md` never uses the name for these
  numbers.
- Everything collected on `window.__rezoomPerf` so Playwright can read it. Production builds
  without the flag load nothing.

### 5.2 Fixtures

`playwright-tests-for-rezoom-site/fixtures/perf/` with generated resumes: `stress-50x10.md` (50
entries, 500 bullets) and `stress-200x10.md` (2,000 bullets), produced by a script in
`fixtures/perf/generate.ts` so they can be regenerated. The real resume is too small to show a
difference.

### 5.3 Scenarios

Each scenario runs after a warm-up, 50 iterations per run, three runs per shell, on both ports,
with the same fixture loaded through "Open .md…". Twenty samples made the 95th percentile hinge
on one slow iteration; the table reports the median of the three per-run medians and the worst
of the three per-run p95s.

1. Keystroke to preview paint in a bullet. Two numbers, reported in separate columns and never
   combined: the user-facing latency with the 120 ms debounce (what a person feels, and it
   includes the deliberate wait), and the processing cost with `?debounce=0` (what the shell
   actually costs). The debounced column is the headline; the raw column is the diagnosis.
2. Structural operations: add entry, delete entry, move block, move section, undo.
3. Sustained typing: 200 characters into one bullet, long tasks counted.
4. Cold open of `dist/index.html`: time to first editor render and bundle size.

### 5.4 Capture and reporting

**Results:** `playwright-tests-for-rezoom-site/perf/RESULTS.md` (M4, 8.5). What was built differs
from the bullets below in three places: a separate `playwright.perf.config.ts` rather than `--grep @perf`, no
Lighthouse (7.10), and no `<Profiler>` numbers in the tables.

- A `perf.spec.ts` in the Playwright package, tagged so `npm test` skips it and
  `npx playwright test --grep @perf` runs it.
- A Chrome DevTools Protocol session per page: `Performance.getMetrics` before and after each
  scenario for script, layout, and style-recalc durations and heap size; `Emulation.setCPUThrottlingRate`
  at 4x to widen gaps; optional `Tracing` for a flamegraph to open in DevTools.
- Medians and 95th percentiles, never means, written to `perf/RESULTS.md` as a table with the
  Chromium version, machine, and date. Three rows per scenario, all kept: **vanilla baseline**,
  **initial React port** (as it stands when M2 goes green, before any memoization), and
  **optimized React port**. The middle row is what a framework change costs by itself; it is
  never overwritten by the optimized numbers.
- React-only diagnosis: wrap the tree in `<Profiler>` to get per-commit actual duration, and use
  the React DevTools profiler for flamegraphs. These are not comparison numbers.
- Pure-module baseline: `vitest bench` on `parseResume`, `serializeResume`, `renderResumeHtml`,
  and `buildFile` against the same fixtures.
- Lighthouse against both static builds for the startup metrics.

### 5.5 Fairness rules

Same machine, same Chromium, production builds only (React development mode is far slower), same
fixture, same debounce setting, and the shared modules at the same version in both trees.

### 5.6 Expected result and what to do with it

On the real resume both shells will stay well under one frame per keystroke. On the stress fixtures
expect React to win structural edits through keyed reconciliation and to lose raw typing unless
`SectionCard` and `BlockEditor` are memoized with stable keys. Measure the initial port first and
record it, then fix the typing case, re-measure, and present all three rows. If vanilla wins a
scenario after optimization, the table says so and the text explains why; the finding that
matters is where React helps, where it costs, and which optimization closed the gap, not that
React won. That table, not the port itself, is the result.

## 6. CI and publication

- The working copy here is not under git. Do the React work in a clone of the public GitHub
  repository (see also risk 7.1), and keep this folder as the reference copy.
- `.github/workflows/ci.yml`: on push and pull request, `npm ci` in `builder/` **first** (the
  shared modules resolve `jspdf` from there, see 1.1), then in `builder-react/`; for each run
  `npm run typecheck`, `npm run coverage`, `npm run build`; then install Playwright Chromium and
  run both projects. Upload the Playwright report as an artifact. CI runs from a clean checkout,
  so the `ESBUILD_BINARY_PATH` bypass in risk 7.1 never appears in a script or workflow; it stays
  a local shell export.
- `builder-react/README.md`: what differs from the vanilla shell, how to run, how the suite is
  shared, where the performance results live. `README.md` at the root and `CLAUDE.md` add the new
  folder to their tables and note the dual Playwright projects.

## 7. Risks and open items

1. **esbuild blocked by macOS quarantine.** Resolved for now, Oct 25, 2026: `node_modules` had been
   reinstalled and the esbuild binary runs (`0.28.2`), so no bypass was used in M0 and the
   `esbuild-clean` copy no longer exists. History kept below in case it recurs. Every folder in this working copy carries
   `com.apple.quarantine`, and Gatekeeper refuses to run `builder/node_modules/@esbuild/darwin-arm64/bin/esbuild`,
   so `tsx`, Vite, and Vitest hang. Found Oct 23, 2026. Clearing the flag on the binary and
   replacing it with a clean copy at the same path did not help; a copy at a new path runs. Working
   bypass: `ESBUILD_BINARY_PATH=<builder>/node_modules/@esbuild/darwin-arm64/bin/esbuild-clean`
   (that copy already exists). Durable fix: work in a fresh `git clone`, which has no quarantine
   flags, or run `xattr -rd com.apple.quarantine .` on the project and then delete and reinstall
   both `node_modules` folders.
2. **Vitest 4 projects.** Resolved in M0: `test.projects` with `extends: true` works on Vitest
   4.1.11 (`|unit|` and `|components|` in the run output).
3. **`jspdf` resolution across packages** (section 1.1). Verified in M0 (8.1). The first build checks, in order:
   `npm run dev` serves the master; `npm run build` succeeds from a fresh clone with `builder/`
   installed first; a PDF download works in the browser and `src/pdf.test.ts`-style parsing of
   it still passes; `dist/index.html` opened from `file://` renders, edits, and downloads.
4. **Block identity** (section 3.4). Resolved: ids live in the reducer, not the model. The
   residual risk is a structural action that forgets to update `ids`; `reducer.test.ts` checks
   the table shape after every action.
5. **`<dialog>` in jsdom.** `showModal` is missing in jsdom; the component falls back to the
   `open` attribute as `main.ts` does, and the component test asserts on that. Found in M3: jsdom
   has no `close` either and does not implement `<form method="dialog">` or Escape. The OK form
   now removes `open` itself when `close` is missing (browsers never take that path), and Escape
   is covered by a shared Playwright test instead of a component test.
6. **Playwright 1.60.0 pin.** Adding a project and a second web server does not require a version
   change. Do not bump it. Found in M0: the cache no longer held Chromium build 1223 (only 1248
   from another project), so the suite could not launch; `npx playwright install chromium`
   restored it. Also pre-existing: `npx tsc --noEmit` in the Playwright package reports one
   error at the axe scan, because `@axe-core/playwright` hoists `playwright-core@1.63.0` as a peer
   and its `Page` type differs from 1.60's. Tests run fine; fix by pinning `playwright-core` with
   an `overrides` entry when convenient.
12. **Port 5174 is Vite's fallback port.** Found and resolved in M0. Any second Vite server lands on
    5174 when 5173 is busy, and one from another project was already there. With
    `reuseExistingServer: true`, Playwright would have run the `react` project against that app
    without complaint. The React shell uses 5180 instead.
7. **Scope creep.** No restyle, no new features, no model changes. Anything that would improve
   both shells goes into `builder/src` as a pure module with tests, then both import it.
8. **Perf runs against dev servers.** Resolved in M4, found Oct 25, 2026. The `webServer` entries in 4.4
   start both shells with `npm run dev`, which runs React in development mode and breaks the
   production-only rule in 5.5. The perf run needs its own Playwright config or projects that
   serve `dist/` through `vite preview` on separate ports, or open `dist/index.html` directly.
   M4 took the last: `playwright.perf.config.ts` has no web server and opens the built files from
   disk, which is also how the single-file page is meant to be used.
9. **Location of `perf/`.** Resolved in M4. Section 5.4 names `perf/RESULTS.md` without saying which package
   holds it. Proposed: `playwright-tests-for-rezoom-site/perf/`, since `perf.spec.ts` writes it.
   Done that way; the fixtures are in `fixtures/perf/` beside the other fixtures.
10. **Lighthouse is not a dependency.** Resolved in M4 by not using it. Section 5.4 runs Lighthouse, but no package declares
    it, and it needs an HTTP URL rather than `file://`. Either add it as a dev dependency of the
    Playwright package or accept `npx` fetching it on each run. M4 measures the cold open with
    Playwright and CDP instead (editor rendered, first contentful paint, script time, heap, page
    size) under the same throttling as every other number. Lighthouse would add a large dependency,
    an HTTP server, and a score that weighs network metrics a local single file does not have.
11. **Bench files and coverage.** Resolved in M4. `vitest bench` in 5.4 needs `*.bench.ts` files in
    `builder/src`, and the coverage configuration must exclude them so the thresholds stay
    meaningful. `builder/src/pipeline.bench.ts` is excluded in `builder/vite.config.ts`.
13. **Moving a block across an entry boundary remounts it.** Resolved in M3, found in M1. Each `.ed-entry`
    wrapper is keyed by its heading's id, so a block that moves from one entry into the next changes
    parent and React remounts it, losing focus. Moves inside an entry keep it. The 3.4 acceptance
    case "focus survives move of the block itself" (4.2, M3) needs either a flat keyed list with
    the entry wrapper drawn differently, or an explicit refocus by id after the move. M3 took the
    second: a move records the block id and the button used, and an effect after the render focuses
    that button again, or the block's field when the button has just become disabled at the top or
    bottom. The block still remounts, so a half-typed list draft in a block that crosses an entry
    boundary is lost; moves inside an entry and edits elsewhere keep it.
14. **List fields cannot be plainly controlled.** Resolved in M1. The model keeps only non-blank
    list items, so `items.join('\n')` as the textarea value deletes a newline the moment it is
    typed and no second bullet can be started. `ListField` keeps the typed draft and shows it while
    it still parses to the same items (`list-field.ts`); undo or load replaces it.
15. **Structural edits settle at different times in the two shells.** Resolved for measurement in M4, found in M2. Vanilla
    `commit()` re-renders the editor at once but debounces the preview for structural edits too; the
    React shell flushes them (3.3). No test can see it, since Playwright waits for the preview, but
    a "structural edit to preview paint" number would compare 120 ms of deliberate wait against none.
    M4 either times structural edits to the editor paint only (as the M2 baseline does) or runs
    them under `?debounce=0` in both shells, and `RESULTS.md` states which. Changing either shell to
    match the other is a behavior change and is not done as part of the port. M4 times structural
    edits under `?debounce=0` only, where vanilla's `scheduleRefresh()` now refreshes in the same
    task (a zero delay calls `refresh()` directly, as React's `useSettledValue` returns the live
    value), so both shells do the same work before the next paint. The default-mode difference
    remains and is stated in `RESULTS.md`.
16. **A cold open can stall after a long perf session.** Open, found in M4. Twice on
    `stress-200x10`, after the typing and structural phases had run in the same browser, one cold
    open of the optimized build never reached the editor-rendered mark. It never reproduced in a
    fresh browser (ten probe loads, both React builds) or in the final run. The first time it cost a
    1.8-hour run, because `perf.spec.ts` wrote its JSON only at the end. The spec now writes the
    typing data before the cold opens, gives each cold open 30 s, and records and replaces a stuck
    one (with its block count, ready state, and whether the init scripts ran); more than three fail
    the test. `RESULTS.md` reports the count, zero in every final row. Cause not found.

## 8. Milestones

| # | Deliverable | Done when | Estimate |
| - | ----------- | --------- | -------- |
| M0 ✅ | Prep: plugins exported from `builder/`, Playwright dual projects plus the reset-then-reload test (4.4), esbuild fix or bypass, `builder-react/` scaffold with alias and `npm run dev` on 5180 (planned as 5174, see 7.12) | Vanilla unit and Playwright suites still green including the new test; React dev server and a clean-clone production build both work (risk 7.3 checklist); React page serves the master read-only | 0.5 day |
| M1 ✅ | Reducer with `ids`, `useSettledValue`, static render of toolbar, editor, preview | `reducer.test.ts` and hook tests green; controlled inputs keep focus and caret while typing; the live/settled split (3.3) and the persistence rule (3.5) are implemented as written | 1 day |
| M2 ✅ | Full interaction parity, then the baseline measurement | `npx playwright test --project=react` green with no existing spec edited; persistence lifecycle verified across reloads on both shells; initial-port perf row captured before any memoization | 1 day |
| M3 ✅ | Component tests and coverage | Every case in 4.2 has an assertion; `npm run coverage` in `builder-react/` passes thresholds without filler tests | 0.5 day |
| M4 ✅ | Performance harness and results | `perf/RESULTS.md` with all three rows on both fixtures, debounced and raw typing columns, measurement limits stated | 1 day |
| M5 ✅ | CI and READMEs, done as the move into the public repository (see the note at the top) | Workflow green on GitHub from a clean checkout; READMEs explain the architecture, the shared suite, and the measured trade-offs | 0.5 day |

### 8.1 M0 result (Oct 25, 2026)

Done. Every exit criterion was met; the checks behind each one are listed below.

| Criterion | Evidence |
| --------- | -------- |
| Plugins exported from `builder/` | `builder/vite-plugins.ts` exports `masterResume()` and `inlineIcon(iconDir?)`; `builder/vite.config.ts` imports them. `typecheck` clean, 124/124 unit tests, build inlines the icon. |
| Vanilla Playwright green, including the new test | `npm test` (vanilla project) 19/19. New: "reset then reload shows the master, and a later edit survives a reload". Confirmed it can fail: with `main.ts` `init()` reduced to `saved !== null`, it failed on the "Working copy" label; restored. |
| Dual projects | `playwright.config.ts` has `vanilla` (5173) and `react` (5180) projects and two web servers. `react` is 19/19 red, as expected before M1 and M2 (no `#fName` yet). |
| esbuild | Runs natively; no bypass (risk 7.1). |
| `builder-react/` scaffold | `package.json` (vite, vitest, typescript, jspdf, vite-plugin-singlefile pinned to `builder/`'s installed versions), `tsconfig.json` with `@core/*` paths, `vite.config.ts` with the alias, `fs.allow`, shared plugins, Vitest `unit` and `components` projects, coverage thresholds. `App.tsx` renders the master preview read-only; `App.test.tsx` (RTL) 2/2, fails as expected under `REZOOM_MASTER=…/other-person.md`. Coverage 100% of the scaffold. |
| React dev server | `npm run dev` on 5180 serves the master with the shared stylesheet and inlined icon, no console errors. |
| Clean-copy production build (risk 7.3) | Fresh copy without `node_modules` (rsync, since there is no git repo yet): building `builder-react/` first fails with `Rolldown failed to resolve import "jspdf"` from `builder/src/pdf.ts`, which confirms 1.1; after `npm ci` in `builder/` (124/124 tests) the React build succeeds, and `dist/index.html` opened from `file://` renders the master and produces a `%PDF-` file through `@core/build` (a temporary probe, never added to this tree). |

Departures from the text above, all small:

- Port 5180 instead of 5174 (risk 7.12).
- `tsconfig.json` does not `include` all of `../builder/src` (1.1). That would pull the vanilla test
  files, and `pdfjs-dist`, into the React typecheck. It includes `src`, `vite.config.ts`, and
  `../builder/src/vite-env.d.ts`; TypeScript follows the `@core` imports to the modules actually used.
- `builder-react/index.html` keeps the vanilla header (theme switch, width toggle) and its inline
  scripts as static HTML; React renders the `<main>` region into `#root`.
- Not done at M0 by design: `builder-react/README.md` (M5), the master-changed dialog and every
  toolbar control (M1, M2).

### 8.2 M1 result (Oct 25, 2026)

Done. Every exit criterion was met.

| Criterion | Evidence |
| --------- | -------- |
| `reducer.test.ts` green | `src/reducer.ts`: every action in 3.2, undo cap 100, shared edit key, `load` with and without an undo push, and the `ids` table (moves with its block, unique, `addEntry` inserts as many ids as blocks, `undo` restores it, shape equals the resume after a mixed run). 45 tests. Confirmed it can fail: with `moveBlock` not moving ids, two tests go red. |
| Hook tests green | `hooks/useSettledValue.test.tsx` (15: trailing value at 120 ms, restart on each edit, flush wins over a pending value, `?debounce=0` and malformed values) and `hooks/usePersistedPref.test.tsx` (4, including throwing storage). Confirmed: returning the live value always turns 4 red. |
| Controlled inputs keep focus and caret while typing | `App.test.tsx`: caret in the middle of a bullet, a newline at the end of a list, focus across keystrokes in the name field. Confirmed: keying blocks by content (what a `WeakMap<Block>` key does) turns the caret and newline tests red. Also checked in Chromium against the dev server under `StrictMode`: caret 5 → 8 after typing three characters, Enter then text starts a new bullet, no console errors or warnings. |
| Live/settled split (3.3) | `App.tsx`: the editor and Undo state read `state.resume`; preview, Markdown, status, Modified badge, warning, file-name placeholder, and save read `useSettledValue(state.resume, delay, state.settle === 'now')`. The reducer sets `settle` to `debounced` for text edits and `now` for everything else. Component tests show the preview unchanged before 120 ms and updated at 120 ms. |
| Persistence rule (3.5) | `startup.ts` `chooseStartup` (6 unit tests) treats a stored copy equal to the master as none; `App` saves the settled Markdown unconditionally in an effect and reads storage in the `useReducer` initializer, so no save can run before the read. Confirmed: dropping the equal-to-master clause turns 3 tests red. In Chromium, an edit survives a reload as "Working copy". |

Totals: `npm test` 101/101 in `builder-react/` (unit 57, components 44); `npm run typecheck` clean;
`npm run coverage` passes (statements 99.0%, branches 93.8%, functions 100%, lines 100%);
`npm run build` produces `dist/index.html` at 319 KB gzipped. Shared Playwright suite, `react`
project: 7 of 19 green (load, unsupported-character warning, theme and width, screenshot, axe,
both reload-persistence cases). The other 12 click buttons M2 wires. The master-changed test gets
through the dialog (open, paths, OK closes, copy kept) and stops at `#btnReset`. Nothing in
`builder/` or the Playwright package changed, so the vanilla results from M0 stand.

Departures and findings:

- The plan says init dispatches `load` on mount. It uses the `useReducer` initializer instead:
  an effect-time `load` would let the save effect write the empty first render over the stored
  copy before the load landed.
- The hook test is `useSettledValue.test.tsx` in the `components` (jsdom) project, not a Node
  test as 4.1 says: `renderHook` needs a DOM.
- New pure modules `startup.ts` and `list-field.ts`, each with a co-located test; risk 7.14
  explains the second. Risk 7.13 is new and open for M3.
- Buttons are rendered with the vanilla ids, `data-act` values, `aria-label`s, and disabled
  states, but only the format, margin, separator, and file-name controls have handlers. Every
  button handler, collapse, tabs, the flash message, and `pendingFocus` are M2.
- `EditorState` gained `nextId` (keeps the reducer pure) and `settle` (feeds `flushNow`).

Estimate restated: M1 took the planned day and held no surprises beyond 7.13 and 7.14, so the
four-and-a-half-day total stands.

### 8.3 M2 result (Oct 25, 2026)

Done. Every exit criterion was met.

| Criterion | Evidence |
| --------- | -------- |
| `npx playwright test --project=react` green, no spec edited | 19/19. `tests/builder.spec.ts` is unchanged since M0. `npm test` now runs both projects (4.4): 38/38, twice in a row. |
| Persistence lifecycle on both shells | The four persistence tests (edit survives reload; master-changed dialog then Reset then reload; quiet notice for a current or legacy copy; reset then reload then edit then reload) pass on `vanilla` and `react` in the same run. |
| Initial-port perf row captured before any memoization | `builder-react/dist/index.html` frozen as `playwright-tests-for-rezoom-site/perf/builds/react-initial.html` (sha256 in the README beside it) so M4 measures the unmemoized port with its final harness. Preliminary numbers below. |

What M2 wired: Undo, Reset (clears the copy, `load` with an undo push, flash), Open (`load` with an
undo push, flash, input cleared so the same file can be chosen again), Download (`buildFile` from the
live resume, as `main.ts` does, then `downloadBlob` and flash), the `#flash` timeout
(`hooks/useFlash.ts`, 4 s), the Preview and Markdown tabs, section up/down/delete/collapse, block
up/down/delete, Delete entry, the four add buttons, and `#btnAddSection`. Collapse state is a set of
section ids, so it survives a rename without the `WeakSet` re-add `main.ts` needs. Focus after an add
uses a `pendingFocus` ref read in an effect after the render, with the same targets as
`focusLastField()`: the last text field of the section, or the newest section title.

Parity beyond the spec, checked with a throwaway script that runs the same steps on both dev servers
and compares the DOM: collapse and expand (blocks and add bar removed, label, `aria-expanded`, kept
across a rename), tabs (`hidden`, `aria-selected`, Markdown content), focus after each of the four
adds and after Add section, section move order, block move and delete inside an entry, three undos,
and the flash text and its 4 s clear. All 18 checks identical; no console errors or warnings in
either shell (React under `StrictMode`).

Preliminary baseline. Production builds opened from `file://`, `stress-50x10.md` (50 entries, 500
bullets) loaded through Open, CPU throttled 4x by CDP, 10 warm-up keystrokes, 50 iterations per run,
three runs per shell. Median of the three run medians / worst of the three run p95s, in ms.
Chromium 148.0.7778.96 (Playwright 1.60.0), Apple M2 Pro, 16 GB, macOS 26.6.2. Script and fixture
generator in `playwright-tests-for-rezoom-site/perf/m2-baseline/`; M4's `perf.spec.ts` replaces them.

| Shell | Keystroke to editor paint | Keystroke to preview paint | + Entry to paint | Undo to paint | Long tasks typing 200 chars (count, total ms, per run) |
| ----- | ------------------------- | -------------------------- | ---------------- | ------------- | ------------------------------------------------------ |
| vanilla | 11.0 / 26.6 | 176.2 / 182.0 | 80.7 / 87.2 | 122.4 / 145.9 | 0, 0 · 0, 0 · 0, 0 |
| React, initial port | 10.5 / 22.9 | 183.4 / 194.4 | 68.0 / 78.4 | 66.2 / 95.2 | 0, 0 · 0, 0 · 0, 0 |
| React, initial port, `?debounce=0` | 65.2 / 96.1 | 65.6 / 92.6 | 67.6 / 75.9 | 65.2 / 79.9 | 32, 1969 · 24, 1452 · 28, 1669 |

How to read it, and its limits:

- Timings run from the event's `timeStamp` to a message posted from the next `requestAnimationFrame`,
  so they approximate the next paint; they are lab samples, not INP (5.1).
- Keystroke to preview paint includes the 120 ms debounce in both shells. React is 7 ms slower
  there but not in the editor-paint column, so the per-keystroke re-render of every unmemoized
  `SectionCard` and `BlockEditor` (the cost 5.6 predicted) is not yet visible at this size. Whether the
  7 ms is the settle path's extra render or noise is for M4, with more fixtures, to decide.
- `+ Entry` is not like for like (risk 7.15): vanilla's number is the editor rebuild only, with the
  preview 120 ms later; React's includes the preview, and is still lower. Undo is like for like (both
  refresh synchronously); React's keyed reconciliation is about half the cost of vanilla's full
  editor rebuild.
- The `?debounce=0` row is the raw processing cost: each keystroke re-renders the preview, and fast
  typing produces long tasks. Vanilla has no `?debounce=0` yet (M4), so there is no vanilla raw row.
- Sustained typing with the debounce produces no long tasks in either shell because the preview runs
  once at the end; M4 should type with a per-key delay above 120 ms as well to see the steady state.
- No `stress-200x10.md` run yet; that fixture and the optimized row are M4.

Bundle: `dist/index.html` is 321.3 KB gzipped against vanilla's 252.8 KB (Vite's figures; 316.2 KB
and 248.3 KB with `gzip -9`), so React adds about 69 KB, above the 45 KB first estimated in 1.3.

Findings and departures:

- Risk 7.15 is new: section 3.3 misdescribed vanilla's structural edits, now corrected.
- `#btnAddSection` moved inside the `Editor` component (rendered after `#editor`, same place in the
  DOM) so the add-section focus request lives with the other focus logic.
- Section cards carry an extra `data-section-id` attribute, the reducer id, used only to find the
  section to focus. The DOM contract allows extra attributes; nothing in the stylesheet or the spec
  uses it.
- The save effect depends on the settled resume as well as the Markdown, so the copy is re-saved on
  every settle as vanilla's `refresh()` does. Without it, Reset on an unmodified page would clear
  storage and leave it empty, because the Markdown string did not change.
- `npm run coverage` in `builder-react/` now fails its thresholds (statements 83.2%, branches 84.5%,
  functions 75.5%, lines 82.5%), down from 99% at M1: the new handlers are covered by the shared
  Playwright suite but have no component tests yet. Those are M3's exit criterion, so this is
  expected, but **M3 must close it before anything is published**. (Closed in M3: 8.4.) `npm test` (101/101) and
  `npm run typecheck` are green.
- Nothing in `builder/` changed: 124/124 unit tests and `typecheck` clean; vanilla Playwright is
  19/19 in the same runs.

Estimate: M2 took the planned day. The total stands.

### 8.4 M3 result (Oct 25, 2026)

Done. Every exit criterion was met.

| Criterion | Evidence |
| --------- | -------- |
| Every case in 4.2 has an assertion | Mapping below. 156 tests in `builder-react/` (unit 57, components 99), up from 101; new files `Editor.test.tsx`, `PreviewPane.test.tsx`, `hooks/useFlash.test.tsx`, and new `describe` blocks in `App.test.tsx`. |
| `npm run coverage` passes without filler tests | Statements 99.3%, branches 93.8%, functions 100%, lines 100% (thresholds 95/90/95/95). The 8 uncovered branches are null fallbacks in the focus lookup and the file chooser closed without a file; none got a test written only to cover it. |
| The tests can fail | Fourteen deliberate breaks in the source, each run against the file that should catch it, all turned red: refocus after a move removed, focus after an add removed, collapse ignored, collapse keyed by index instead of id, Delete entry deleting one block, Download building from the settled resume, Download ignoring the margin, Reset without an undo step, Open without its source label, the dialog close fallback removed, an unguarded storage read, unescaped preview HTML, a stuck tab, and a flash that never clears. Every file restored afterwards. |

| 4.2 case | Where |
| -------- | ----- |
| Renders the master | `App.test.tsx` "first render" (from M1) |
| Bullet edit reaches the preview after the debounce, sets Modified; typing the original back clears it | `App.test.tsx` "settled output" and "settled output after editing" |
| + Entry inserts New Role and focuses the last field; Delete entry removes the heading and its blocks and nothing else | `Editor.test.tsx` "adding blocks", "deleting and moving blocks" |
| Move section up and down, first and last disabled | `Editor.test.tsx` "sections" |
| Undo after a structural change; keystrokes collapse to one step | `App.test.tsx` "undo" |
| Unsupported character warning names the glyph | `App.test.tsx` "settled output after editing" |
| Format picker switches the extension and the margin group | `App.test.tsx` "toolbar" (from M1) |
| Download uses the chosen format, margin, and separator | `App.test.tsx` "download": asserts on the file handed to `downloadBlob` (the only mock), including the first text x position of 36 for Compact and the pipe in the PDF text, rather than on a `buildFile` call |
| Reset restores the label, hides the badge, leaves the master in storage; a remount shows the master | `App.test.tsx` "reset to master" |
| Master-changed dialog opens; OK or Escape closes it, copy untouched | `App.test.tsx` "startup from storage" and "master-changed dialog" (OK); Escape in the shared Playwright suite (below) |
| Focus and caret | Caret: `App.test.tsx` "typing" (from M1). Moves: `Editor.test.tsx`, inside an entry, into the previous entry, and to the top where the button disables. "+ Entry" focus: see departures |
| Undo after mixed operations, both restored in order | `App.test.tsx` "undo" |
| Trust boundary | `App.test.tsx` "opening a file": no `script`, markup shown as text, `javascript:` link becomes `#` |
| Storage throwing | `App.test.tsx` "blocked storage": every `Storage` method throws, the master renders and an edit reaches the preview |

Also covered, beyond the list: tabs, collapse and expand (and collapse kept across a rename), each add
button's block and focus, + Add section, block delete and move, the flash text for Download, Reset,
and Open, Open .md… opening the chooser, undo of Reset and of Open, and the `useFlash` timer.

Shared Playwright suite: one new test, "Escape closes the master notice and keeps the working
copy", allowed by 4.4 because both shells already had the behavior. It passes on `vanilla` with no
change to `builder/` and on `react`; with the React dialog made to swallow `cancel`, it fails. `npm
test` is 40/40 (20 per project). `tsc --noEmit` in that package still reports only the known axe
type error (risk 7.6).

Code changes M3 needed, both small:

- Risk 7.13 resolved by refocusing after a block move (`Editor.tsx`, `focusTarget`). Blocks carry a
  `data-block-id` attribute for it, like the `data-section-id` added in M2.
- The dialog's OK form closes it by hand when `close` is missing (risk 7.5).

Departures and findings:

- 4.2 is inconsistent about "+ Entry": one case says it focuses the last field, another the new
  heading. The vanilla shell focuses the last field (the new bullet), so the React shell does and
  the test asserts that.
- "Focus survives deleting its neighbor" cannot happen in either shell: clicking the neighbor's
  Delete moves focus to that button, which is then removed. The test checks what the requirement
  protects instead: the surviving block keeps its instance, so a half-typed new bullet in a list
  is still there after the block beside it is deleted.
- Editor cases render the `Editor` through `test-utils/renderEditor.tsx`, which drives it with the
  real reducer and a seven-block fixture instead of the master, so each assertion can list every
  block. App-level flows still use the master.
- `vi.mock('@core/dom')` replaces only `downloadBlob`; `fit` and the rest stay real.
- Bundle after M3: 321.5 KB gzipped (Vite's figure). The frozen M2 build is unchanged (same sha256).

Estimate: M3 took about the planned half day. The total stands.

### 8.5 M4 result (Oct 26, 2026)

Done. The exit criterion was met: `playwright-tests-for-rezoom-site/perf/RESULTS.md` has all three
rows (vanilla, initial port, optimized) on both fixtures, separate debounced and `?debounce=0`
typing columns, and a Limits section.

| Piece | Where |
| ----- | ----- |
| Harness | `perf/harness.ts` (observers, latency stamp, CDP totals), `perf/perf.spec.ts` (scenarios, raw JSON per shell and fixture), `playwright.perf.config.ts` (no web server, one worker, 4 h timeout) |
| Fixtures | `fixtures/perf/generate.mts`, `stress-50x10.md`, `stress-200x10.md` (5.2) |
| Tables | `perf/report.mts` → `perf/results/tables.md`, copied into `RESULTS.md` |
| Shared-module bench | `builder/src/pipeline.bench.ts`, `npm run bench`; excluded from coverage (7.11) |
| Scripts | `npm run perf` (builds both shells, measures, renders), `perf:report`, `perf:fixtures` |
| Vanilla `?debounce=0` | `builder/src/settle.ts`, shared with the React shell; a zero delay refreshes in the same task in both (7.15) |
| Optimization | `memo` on `HeaderCard`, `SectionCard`, `BlockEditor`, `PreviewPane`; stable `useCallback` handlers that take ids |

Headline, 200 entries (`RESULTS.md` has both fixtures and the method):

- What a person feels while typing is the same in all three shells: about 10 ms to the editor
  paint (22 ms in the initial port), the preview after the debounce.
- Memoization cut React's debounced typing script from 2,781 to 509 ms over 200 characters
  (vanilla 191); with the debounce off, optimized React is within 4% of vanilla.
- React is about 2.3x faster on structural edits (about 220 against 500 ms), the result 5.6
  predicted from keyed reconciliation against vanilla's full editor rebuild.
- Vanilla shows the full editor sooner on a cold open (670 against 855 ms); React paints first
  (220 against 680 ms) and is 66 KB larger gzipped.
- The shared modules cost about 1.6 ms a keystroke unthrottled, so nearly all the measured cost is
  the shell and the browser's layout.

Departures and findings:

- 5.1's in-page `?perf=1` module was not built; everything is measured from outside the page so the
  frozen build is measured the same way (decision log).
- Two changes were tried and reverted for no measurable gain: the textarea fit in the input handler,
  and updating the settled value during render.
- The 200-entry runs take up to two hours per shell, past both the old two-hour test timeout and a
  background-task limit; the config now allows four hours.
- Risk 7.16 (stalled cold open) is new and open; the harness tolerates and reports it.
- Test counts after M4: `builder/` 131 (12 files, `settle.test.ts` new), `builder-react/` 149
  (the `settleDelay` tests moved to `builder/`), Playwright 40/40. Coverage: `builder/` 98.9%
  statements, 95.9% branches; `builder-react/` 99.3% and 93.4%. Typecheck clean in both shells; the
  Playwright package keeps only the known axe error (7.6).

Estimate: the active work took about the planned day, but the measurement took over seven hours of
machine time, including a lost 1.8-hour run (7.16). The remaining estimate is M5's half day.

Total about four and a half days, as a happy path. The estimate is re-stated after M1: M0 proves
the environment and the cross-package build, M1 proves the identity and focus design, and those
two carry most of the unknowns. M0 through M2 are the minimum for a working React shell; M4 is
what turns it into a measured comparison.

## 9. Decisions log

- Oct 23, 2026: sibling package with alias imports, not a second entry in `builder/` and not
  workspaces (section 1).
- Oct 23, 2026: preview stays `dangerouslySetInnerHTML` from the shared renderer (section 3.6).
- Oct 23, 2026: 120 ms debounce kept as default for a fair comparison; `?debounce=0` for raw cost
  (section 3.3).
- Oct 25, 2026: semantic reducer actions with an `ids` table for React keys; no `WeakMap` keys,
  no index keys, no model change (3.2, 3.4). Decided after reading `model.ts` and `main.ts`.
- Oct 25, 2026: only text edits are debounced; structural actions, undo, reset, and load flush at
  once (3.3). Corrected at M2: this matches vanilla for undo, reset, and load but not for
  structural edits, which vanilla debounces too. Kept as is; the perf harness accounts for it (7.15).
- Oct 25, 2026: working copy is saved unconditionally, including after Reset; init treats a copy
  equal to the master as none. Same rule as `main.ts`, now written down and tested (3.5, 4.4).
- Oct 25, 2026: `jspdf` declared in `builder-react` at the same version; `builder/` installs
  first in CI (1.1, 6).
- Oct 25, 2026: perf results keep three rows (vanilla, initial React, optimized React), use
  `durationThreshold: 16`, and are labeled event-timing samples, not INP (5.1, 5.4).
- Oct 25, 2026: React shell port is 5180, not 5174, to keep clear of Vite's fallback port (7.12).
- Oct 25, 2026: until M2, `npm test` in the Playwright package runs only the vanilla project (4.4).
- Resolved Oct 25, 2026: `jspdf` resolves from `builder/node_modules` and needs `builder/`
  installed first, as 1.1 predicted (7.3, 8.1).
- Oct 25, 2026: init reads storage in the `useReducer` initializer rather than dispatching
  `load` from an effect, so the save effect can never run first (3.5, 8.2).
- Oct 25, 2026: list textareas keep a local draft while it parses to the model's items (7.14).
- Oct 25, 2026: M2 switches `npm test` in the Playwright package to both projects; `test:vanilla`
  runs one side (4.4).
- Oct 25, 2026: a block move refocuses the moved block's button by id, rather than flattening the
  entry wrappers, which the DOM contract needs (7.13, 8.4).
- Oct 25, 2026: "+ Entry" focuses the last field, as vanilla does, where 4.2 also said the heading
  (8.4).
- Oct 25, 2026: the initial React port is frozen as a built file at M2 instead of being re-measured
  from source in M4, so later optimization cannot erase it (5.4, 8.3).
- Resolved Oct 25, 2026 (M4): the perf harness gaps found while writing an assessment guide (since
  replaced by `resume-builder-playwright/perf/README.md`):
  production builds opened from disk, `perf/` in the Playwright package, no Lighthouse, bench files
  excluded from coverage (7.8 to 7.11).
- Oct 25, 2026: no `?perf=1` instrumentation in either shell. Every number is taken from outside
  the page (init scripts, `page.evaluate`, CDP), because the frozen initial build has none and the
  three rows must be measured the same way (5.1, 8.5).
- Oct 25, 2026: `settleDelay` moved to `builder/src/settle.ts` and is shared; vanilla gained
  `?debounce=0`, and a zero delay refreshes synchronously in both shells (3.3, 7.15).
- Oct 26, 2026: structural edits are reported under `?debounce=0` only; the perf config timeout is
  four hours; a stalled cold open is recorded and replaced rather than failing the run (7.15, 7.16).

## 10. Review disposition (Oct 25, 2026)

What the outside review asked for and what this revision did with it. The review itself is not
included in this repository.

| Review item | Taken | Where | Note |
| ----------- | ----- | ----- | ---- |
| P0 key strategy | Yes | 3.2, 3.4, 4.1, 4.2 | The review was right and the plan's `WeakMap` fallback was wrong: `updateBlock` replaces the edited block object on every keystroke. Ids now live in the reducer. |
| P0 reset vs persistence | Yes, as a rule, not a guard | 3.5, 4.4 | The vanilla shell already re-saves the master after Reset and relies on init treating that as "no copy". The plan states the rule and adds the missing reload test instead of adding a reset guard that vanilla does not have. |
| P1 live vs debounced | Yes | 3.3 | Also corrected the plan's own description of vanilla: only text edits are debounced. |
| P1 perf methodology | Yes | 5.1, 5.3, 5.4 | `durationThreshold: 16`, debounced and raw typing in separate columns, no INP label, 50 x 3 samples. |
| A. `jspdf` explicit | Partly | 1.1, 1.3, 6, 7.3 | Declared, but declaring it does not change where Vite resolves it from; the real fix is CI install order plus the first-build checklist. A shared-core package was already rejected (no workspaces, section 1). |
| B. HTML trust boundary | Yes, lightly | 4.2 | Already unit-tested in `builder/`; one component test proves the shell adds no unescaped path. |
| C. Interaction contract | Partly | 3.4, 4.2 | Focus after structural edits, mixed undo, dialog dismissal, and throwing storage added. Keyboard navigation between fields is native tab order in both shells and is covered by the existing axe test; nothing added. "Malformed saved data" is Markdown text, and `parseResume` accepts any string; nothing added. |
| D. Keep the unoptimized result | Yes | 5.4, 5.6, M2 | Baseline row captured at M2 before any memoization. |
| esbuild workaround local | Yes | 6 | |
| Coverage is a floor | Yes | 4.3 | |
| `fs.allow` nuance, Vitest projects | Yes | 1.1, 4.2 | |
| Schedule | Partly | 8 | Exit criteria made explicit; total kept as a happy-path figure to be restated after M1 rather than withheld. |
