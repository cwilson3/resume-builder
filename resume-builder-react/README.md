# Resume Builder, React shell

The resume builder in the parent directory, rebuilt as a React 19 app. Same page, same
element ids, same behavior; only the shell differs. It exists to compare a hand-wired DOM
shell (`../src/main.ts`) with a React one over identical document logic.

Nothing is copied from the vanilla page. Every document operation (parse, model edits,
serialize, preview HTML, PDF, storage, the master fetch) is imported from `../src` through
the `@core` alias, and `vite.config.ts` reuses `../vite-plugins.ts`, so the master named in
`../rezoom.config.json` is shipped beside this page exactly as it is beside the vanilla one.
The stylesheet is `../src/builder.css`.

## Run

Install the parent package first: the shared modules resolve their own dependencies
(`jspdf`) and the shared Vite plugins resolve `vite` from `../node_modules`.

```bash
(cd .. && npm install)
npm install
npm run dev          # http://localhost:5180 (the vanilla page uses 5173)
```

| Command | What it does |
| ------- | ------------ |
| `npm run build` | One self-contained `dist/index.html`, with the master copied beside it, that also works from disk (`file://`). |
| `npm test` | Vitest, two projects: `unit` (Node, `*.test.ts`) and `components` (jsdom and React Testing Library, `*.test.tsx`). |
| `npm run coverage` | The same thresholds as the parent: 95% statements, 90% branches, 95% functions, 95% lines. |
| `npm run typecheck` | TypeScript, no emit, including the shared modules it imports. |

The end-to-end specs in `../resume-builder-playwright` run against this shell too (`npm run test:react` there), on the dev server and on the built page opened from disk.

## How it maps to the vanilla page

| Vanilla (`../src/main.ts`, `../index.html`) | React (`src/`) |
| ------------------------------------------- | -------------- |
| `state`, the undo stack, `commit()` | `reducer.ts`: a pure reducer over the shared model operations, with the same undo rules (consecutive text edits in one field share a step) and a stable id per section and block so React keys survive edits. |
| `refresh()` after a 120 ms debounce | `hooks/useSettledValue.ts`: text edits settle after `../src/settle.ts`'s delay (`?debounce=0` turns it off); everything else settles at once. Preview, Markdown, status, badge, warning, and the working-copy save derive from the settled resume. |
| `init()` | `startup.ts` (which master, which document) and the start-up effect in `App.tsx`. A file picked while the shipped master is still being fetched wins, as in `main.ts`. |
| `showWelcome()` | `Welcome.tsx` |
| `renderEditor()` and the delegated listeners | `Editor.tsx`: controlled fields; `list-field.ts` keeps a list's typed draft (blank lines, a trailing newline) that the model's item list cannot hold. |
| The toolbar and the Download dialog | `Toolbar.tsx`, `DownloadDialog.tsx` |
| The preview tabs | `PreviewPane.tsx`: the shared renderer's HTML, unchanged, so the preview never forks from the PDF. |

The header (title, settings gear, dark mode, content width) is the vanilla page's static
markup and inline scripts, copied into `index.html`; React renders everything below it.

## Design record

`../docs/react-shell-plan.md` is the plan this shell was built from: the layout and state
design, the risks found along the way, the milestone results, and the decisions log. It
describes the prototype this repository came from; its header maps the old paths to these.
