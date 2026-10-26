# Performance reference: the prototype's measurements

These are the numbers measured on the **prototype** this repository was cleaned up from, on
Oct 25–26, 2026, before the React shell was moved here. They are kept unchanged as a record and a
point of reference. They were **not** measured on the code in this repository; see "How the prototype
differs" below before comparing a new run against them. A new run writes to `../results/`, never here.

`tables.md` is the prototype's generated tables and `raw/` the JSON the prototype harness wrote; both
are copied as they were. `../README.md` explains how the harness works and why it is set up this way.

Three builds of the same resume builder, measured the same way:

- **vanilla**: the original TypeScript shell.
- **React, initial port**: the React shell as it first passed the shared Playwright suite, before any
  memoization, frozen as a build and never rebuilt.
- **React, optimized**: the same shell after memoization.

Both shells call the same pure modules (parse, serialize, render, PDF), so the differences below are
the cost of the shell: how each one updates the editor and the preview.

## How the prototype differs

The comparison is the same in kind, but these differences mean the absolute numbers are not this
repository's:

- **The master was built into the page.** The prototype embedded the master resume in each build;
  here it ships beside the page and is fetched, and the page has gained the Download dialog and the
  welcome panel, so page size and start-up differ. Every measured scenario loads a fixture first, so
  the editing numbers are affected less than the cold open and page size.
- **The toolbar was older.** The prototype had the download options inline in the toolbar and an
  "Open .md…" button; here they sit in the Download dialog and the button is Change source. The
  harness drives the hidden file input and editor buttons that both versions share.
- **The initial port was a frozen file.** Here `../build-react-initial.mts` rebuilds the initial port
  from its commit; it is the same code with the memoization removed, not the same bytes.
- **Playwright 1.60.0, Chromium 148.0.7778.96.** This repository pins Playwright 1.63.0, which brings
  a newer Chromium.
- **One machine:** an Apple M2 Pro, 16 GB, throttled 4x. Absolute numbers will differ elsewhere; the
  ratios are the result.

## Summary

| Question | Answer at 200 entries (2,000 bullets) | At 50 entries |
| -------- | ------------------------------------- | ------------- |
| What does a person feel while typing? | The same in all three. Keystroke to editor paint is about 10 ms in vanilla and optimized React (22 ms in the initial port); the preview follows the 120 ms debounce plus the render, about 310–350 ms. | The same in all three, about 10 ms and 175–180 ms. |
| What does typing cost? | Optimized React spends 2.7x vanilla's script time with the debounce on (509 against 191 ms over 200 characters) and 4% more with it off. The initial port spent 14.6x. | Optimized React 5.3x vanilla with the debounce on (227 against 43 ms), 14% more with it off. The initial port 18x. |
| Structural edits (add, delete, move, undo) | React is 2.3x faster: about 220 ms against 500 ms to the next paint. Moving a section, 374 against 499 ms. | React about 2x faster: about 60 against 120 ms. Moving a section, 100 against 119 ms. |
| Opening the page | Vanilla shows the full editor sooner (670 against 855 ms); React paints its first content sooner (220 against 680 ms). React's page is 66 KB larger gzipped. | 298 against 432 ms to the editor; 220 against 308 ms to first paint. |

Where React helps: every structural edit, because keyed reconciliation updates only the cards that
changed, while vanilla rebuilds the whole editor (`renderEditor()`) on each one. Where it costs:
per-keystroke script time, editor start-up, and 66 KB of page weight. What closed the typing gap:
`memo` on the four card components with stable callbacks, which cut React's debounced typing script
by 71% at 50 entries and 82% at 200 (see below).

## Results

Medians, never means. Latencies are the median of three per-run medians, then the worst of the three
per-run 95th percentiles. Per-run totals show the median run and the range across the three runs.

### `stress-200x10.md`

148.0.7778.96 · Apple M2 Pro, 16 GB, Darwin 25.6.0 · CPU throttled 4x · 3 runs × 50 iterations · measured 2026-10-25, 2026-10-26

**Typing, one key at a time** (ms, median / worst p95)

| Shell | Keystroke to preview paint, 120 ms debounce | Keystroke to preview paint, `?debounce=0` | Keystroke to editor paint, 120 ms debounce |
| ----- | ---: | ---: | ---: |
| vanilla | 320.7 / 857.0 | 202.0 / 244.4 | 9.5 / 24.7 |
| React, initial port | 348.7 / 438.9 | 227.0 / 302.0 | 21.7 / 36.6 |
| React, optimized | 311.9 / 343.1 | 201.4 / 274.9 | 10.4 / 24.0 |

**Sustained typing**, 200 characters at one per 100 ms (per run: median run, range)

| Shell | Script ms, debounced | Long tasks, debounced | Script ms, `?debounce=0` | Layout ms, `?debounce=0` | Long tasks, `?debounce=0` | Long-task ms, `?debounce=0` |
| ----- | ---: | ---: | ---: | ---: | ---: | ---: |
| vanilla | 191 (143–201) | 4 (4–6) | 9874 (9799–10490) | 18431 (18330–19697) | 200 (200–201) | 32832 (32617–35080) |
| React, initial port | 2781 (2757–3030) | 2 (2–5) | 15261 (14781–16235) | 17930 (17775–20773) | 200 (200–201) | 35130 (34539–39091) |
| React, optimized | 509 (487–617) | 3 (2–3) | 10255 (10202–10341) | 18081 (17987–18143) | 200 (200–200) | 32974 (32963–32986) |

**Structural edits, `?debounce=0`**, click to next paint (ms, median / worst p95)

| Shell | + Entry | Delete entry | Move block | Move section | Undo | Script ms, all structural |
| ----- | ---: | ---: | ---: | ---: | ---: | ---: |
| vanilla | 502.2 / 580.5 | 503.7 / 643.6 | 506.2 / 552.6 | 499.3 / 537.6 | 515.4 / 627.9 | 27349 (27035–27930) |
| React, initial port | 227.0 / 250.5 | 231.6 / 250.8 | 223.8 / 233.4 | 383.5 / 429.9 | 233.5 / 269.0 | 23305 (23066–23451) |
| React, optimized | 221.1 / 252.3 | 222.0 / 237.3 | 203.2 / 262.1 | 373.8 / 430.2 | 219.5 / 250.1 | 19519 (19074–21158) |

**Cold open** with the fixture restored as the working copy (30 loads; median / p95)

| Shell | Editor rendered (ms) | First contentful paint (ms) | Script (ms) | JS heap (MB) | Page size, gzip -9 (KB) | Stuck loads replaced |
| ----- | ---: | ---: | ---: | ---: | ---: | ---: |
| vanilla | 670 / 721 | 680 / 728 | 109 / 116 | 6.2 | 244.5 | 0 |
| React, initial port | 859 / 893 | 220 / 228 | 225 / 237 | 6.5 | 310.5 | 0 |
| React, optimized | 855 / 918 | 220 / 232 | 225 / 244 | 8.5 | 310.7 | 0 |

### `stress-50x10.md`

148.0.7778.96 · Apple M2 Pro, 16 GB, Darwin 25.6.0 · CPU throttled 4x · 3 runs × 50 iterations · measured 2026-10-25

**Typing, one key at a time** (ms, median / worst p95)

| Shell | Keystroke to preview paint, 120 ms debounce | Keystroke to preview paint, `?debounce=0` | Keystroke to editor paint, 120 ms debounce |
| ----- | ---: | ---: | ---: |
| vanilla | 174.0 / 185.6 | 54.3 / 71.5 | 10.8 / 26.1 |
| React, initial port | 180.4 / 188.5 | 63.0 / 91.9 | 9.7 / 22.8 |
| React, optimized | 178.5 / 195.9 | 56.4 / 79.9 | 11.3 / 25.4 |

**Sustained typing**, 200 characters at one per 100 ms (per run: median run, range)

| Shell | Script ms, debounced | Long tasks, debounced | Script ms, `?debounce=0` | Layout ms, `?debounce=0` | Long tasks, `?debounce=0` | Long-task ms, `?debounce=0` |
| ----- | ---: | ---: | ---: | ---: | ---: | ---: |
| vanilla | 43 (37–43) | 0 (0–0) | 2478 (2447–2616) | 4555 (4555–4862) | 0 (0–20) | 0 (0–1028) |
| React, initial port | 775 (767–848) | 0 (0–0) | 3949 (3948–4186) | 4595 (4593–4760) | 6 (2–50) | 319 (101–2627) |
| React, optimized | 227 (203–249) | 0 (0–0) | 2815 (2807–2829) | 4586 (4541–4608) | 3 (1–5) | 168 (51–258) |

**Structural edits, `?debounce=0`**, click to next paint (ms, median / worst p95)

| Shell | + Entry | Delete entry | Move block | Move section | Undo | Script ms, all structural |
| ----- | ---: | ---: | ---: | ---: | ---: | ---: |
| vanilla | 122.4 / 131.5 | 119.4 / 126.5 | 121.3 / 126.3 | 118.8 / 124.3 | 120.4 / 130.7 | 7043 (6900–7046) |
| React, initial port | 64.7 / 92.8 | 64.6 / 99.5 | 62.2 / 87.3 | 102.9 / 114.3 | 64.4 / 78.8 | 6491 (6453–6633) |
| React, optimized | 61.2 / 77.0 | 61.3 / 93.8 | 55.7 / 66.0 | 99.6 / 118.6 | 61.1 / 73.7 | 5403 (5298–5440) |

**Cold open** with the fixture restored as the working copy (30 loads; median / p95)

| Shell | Editor rendered (ms) | First contentful paint (ms) | Script (ms) | JS heap (MB) | Page size, gzip -9 (KB) | Stuck loads replaced |
| ----- | ---: | ---: | ---: | ---: | ---: | ---: |
| vanilla | 298 / 303 | 308 / 312 | 56 / 58 | 4.7 | 244.5 | 0 |
| React, initial port | 428 / 441 | 216 / 220 | 148 / 153 | 5.4 | 310.5 | 0 |
| React, optimized | 432 / 445 | 220 / 224 | 149 / 155 | 5.4 | 310.7 | 0 |
### Shared modules (Node, `vitest bench`, no throttling)

Mean ms per call, from `npm run bench` in the prototype's builder package, same machine, Node 24.21.0, Vitest 4.1.11.

| Function | `stress-50x10` | `stress-200x10` |
| -------- | ---: | ---: |
| `parseResume` | 0.20 | 0.79 |
| `serializeResume` | 0.02 | 0.12 |
| `renderResumeHtml` | 0.36 | 1.46 |
| `buildFile`, Markdown | 0.04 | 0.19 |
| `buildFile`, PDF | 30.4 | 122.6 |

A refresh after a keystroke serializes and renders: about 1.6 ms at 200 entries, roughly 6 ms with
the browser's 4x throttle. The raw keystroke-to-preview figure is about 200 ms, so nearly all of it is
the shell and the browser (layout alone is about 90 ms a keystroke: 18 s over 200), not the shared
code. The PDF is built only on Download.

## Reading the tables

- **The debounced column is the headline; the `?debounce=0` column is the diagnosis.** With the
  default 120 ms debounce, the preview waits until typing pauses, which is what a person sees. With
  `?debounce=0` both shells refresh the preview in the same task as the keystroke, which exposes the
  full cost of each one.
- **Typing.** The initial port re-rendered every section and block card on every keystroke, because
  each card received fresh callbacks. At 200 entries every keystroke in the debounced sustained run
  produced a keydown event over 16 ms (200 of 200 in each run), against 30–92 in vanilla and 49–92
  after memoization. With the debounce off, the preview render dominates and the shells converge:
  every keystroke is a long task in all three at 200 entries, and layout time is the same.
- **Structural edits.** Measured with `?debounce=0` only, because with the debounce on vanilla
  refreshes the preview 120 ms after a structural edit while React does it at once, so a
  debounced comparison would time different work. Under `?debounce=0` both do the editor and the
  preview in the same task. Moving a section gains least: React still moves a whole section's subtree in the
  DOM, and the preview re-renders in full in every shell.
- **Cold open.** Vanilla builds the editor in one synchronous pass before the first paint, so its
  first paint and its full editor arrive together. React paints the static shell first, then renders
  the editor, so its first paint is earlier and its full editor later. Script time at start-up is
  about double vanilla's (225 against 109 ms at 200 entries), which is React itself plus the first
  render.
- **The tail.** Vanilla's 857 ms p95 for the debounced preview at 200 entries comes from one run in
  which 5 of 50 keystrokes took over 500 ms (the worst 2.7 s); its other two runs had a p95 of 347 ms.
  Optimized React had one 2.1 s keystroke in one run. These are occasional stalls in both shells, not
  a difference between them.
- **Heap** is `JSHeapUsedSize` at one moment after load, including garbage not yet collected; treat
  differences of a couple of MB as noise.

## What closed the gap, and what did not

The initial port was measured first and kept. Memoization was then added in one change:

| Change | Effect |
| ------ | ------ |
| `memo` on `HeaderCard`, `SectionCard`, `BlockEditor`, and `PreviewPane`; editor callbacks made stable with `useCallback` and given ids as arguments, so a keystroke re-renders only the card being typed in | Debounced typing script: 775 → 227 ms at 50 entries, 2,781 → 509 ms at 200. Raw typing script: 3,949 → 2,815 ms and 15,261 → 10,255 ms. Structural script time down about 16% at both sizes. Kept. |
| Moving the textarea auto-fit from a layout effect into the input handler | No measurable change. Reverted. |
| Updating the settled value during render instead of in an effect | A gain inside run-to-run noise. Reverted. |

What remains is spread across reconciliation (the profiler showed no single hotspot): React still
diffs the section list and the root on each keystroke, and the settled render runs the preview after
the debounce. Optimized React's raw typing script cost is within 4% of vanilla's at 200 entries; with
the debounce on it is still 2.7x, about 1.6 ms a keystroke of extra script on this throttled CPU,
which no column of what a person sees reflects.

## Limits

- **Not INP, and not paint.** `requestAnimationFrame` plus a message approximates the next paint; it
  is not a presentation timestamp, and these lab samples are not the field metric INP.
- **One machine, one browser.** An Apple M2 Pro throttled 4x, headless Chromium. Absolute numbers will
  differ elsewhere; the ratios are the result.
- **Structural edits only under `?debounce=0`** (see above). With the default debounce, vanilla's
  editor paint after a structural edit is faster than these numbers and its preview later.
- **Saving the working copy.** Vanilla saves to `localStorage` inside its refresh; React saves in a
  passive effect after the paint, which moves that work out of React's measured task. Its size was
  not measured separately; it favors React slightly in the raw latency columns.
- **No Lighthouse and no network.** Start-up is measured from disk, so bundle size shows up only as
  parse and compile time, not as download time.
- **An intermittent harness hang.** Twice, after the long typing phases on `stress-200x10`, one cold
  open never reached the editor-rendered mark (the first failed run lost its data; a smoke run hit it
  on its first load). It did not reproduce in a fresh browser or in the final runs. The harness now
  gives each cold open 30 s, records a stuck one, and replaces it; the "Stuck loads replaced" column
  reports how many. All six final rows show none.
- Event Timing keydown counts are collected in the raw JSON and quoted above, not tabulated.
