# Performance harness: vanilla shell against the React shell

Measures the same resume builder three ways and reports the cost of each shell:

| Row | Build | Where it comes from |
| --- | ----- | ------------------- |
| vanilla | `../../dist/index.html` | `npm run build` in the repository root |
| React, initial port | `builds/react-initial.html` | `npm run perf:build-initial`, from the unmemoized commit `080c53c` |
| React, optimized | `../../resume-builder-react/dist/index.html` | `npm run build` in `resume-builder-react` |

Both shells call the same pure modules, so the differences are the shell's: how it updates the
editor and the preview. `prototype-reference/` holds the measurements made on the prototype before
the React shell moved here, kept as a record and a point of reference; read its "How the prototype
differs" section before comparing a new run with it.

## Running

From this package, with the repository root and `resume-builder-react` installed:

```bash
npm run perf           # builds all three, runs perf.spec.ts, writes results/raw/*.json and results/tables.md
npm run perf:report    # re-renders results/tables.md from results/raw/*.json
npm run perf:fixtures  # regenerates fixtures/perf/*.md (deterministic; the committed files do not change)
(cd ../.. && npm run bench)   # the shared modules alone, in Node, on the same fixtures
```

A full run takes **about 4.5 hours** (see "Where the time goes"). Start it in a terminal that stays
open, or detached, and leave the machine otherwise idle: anything else using the CPU shows up in the
numbers. It is never part of `npm test` or CI.

Optional environment variables:

| Variable | Default | Effect |
| -------- | ------- | ------ |
| `PERF_FIXTURES` | both | `stress-50x10`, `stress-200x10`, or both comma-separated |
| `PERF_SHELLS` | all three | any of `vanilla`, `react-initial`, `react-optimized` |
| `PERF_RUNS` | 3 | runs per build and fixture |
| `PERF_N` | 50 | iterations of each scenario per run (keep it even: moves are done in pairs) |
| `PERF_COLD` | 10 | cold opens per run |
| `PERF_OUT` | `results/raw` | where the JSON goes; point smoke runs elsewhere so they never overwrite results |

A smoke run that checks the harness end to end in about 3 minutes:

```bash
PERF_RUNS=1 PERF_N=4 PERF_COLD=2 PERF_FIXTURES=stress-50x10 PERF_OUT=/tmp/perf-smoke \
  npx playwright test -c playwright.perf.config.ts
```

## Why it is set up this way

Each choice below was made for the accuracy or fairness of the comparison. Most of them also make
the run longer; the last column says how.

| Choice | Why | What it costs in time |
| ------ | --- | --------------------- |
| **Three builds, not two.** The unmemoized initial port is measured alongside the optimized one. | It separates what moving to React costs by itself from what the one optimization (memoization) won back. Without it, the table could not say which change closed the gap. | A third more runs. |
| **Production builds opened from disk** (`file://`). | That is how the page is meant to be used. React's development build is far slower than its production build, so a dev-server comparison would measure the wrong thing. | Every build is rebuilt first (seconds). |
| **Generated stress resumes**: 50 entries (500 bullets) and 200 entries (2,000 bullets). | The sample resume is far too small: the shared modules take about 1.6 ms per keystroke even at 200 entries, so on a real resume both shells stay under a frame and show no difference. Two sizes show how each shell scales. | The 200-entry runs dominate the total: every action on a 2,000-bullet page is slow. |
| **CPU throttled 4x** through CDP. | It widens the gaps between the shells so they rise above run-to-run noise, and it stands in for a mid-range laptop rather than a fast development machine. | Everything in the page runs about four times slower. |
| **One worker, a fresh browser context per phase.** | Parallel runs would compete for the CPU and distort each other's timings. A fresh context gives each phase empty storage and no state left over from the last. | Nothing runs in parallel. |
| **50 iterations per scenario, 3 runs, reported as the median of the run medians and the worst of the run 95th percentiles.** Medians, never means. | With 20 samples the 95th percentile hinged on a single slow iteration. Separate runs catch stalls that hit a whole run: in the prototype, one vanilla run at 200 entries had a 95th percentile of 857 ms while the other two had 347 ms. Medians keep one stall from moving the headline. | Three times one run; 50 of everything. |
| **Every measurement waits for the next frame after the change.** A one-shot listener stamps the event; the end is a message posted from the next `requestAnimationFrame` (for the preview, the frame after `#preview` changes). | It times what a person sees, the paint after the work, rather than when the event handler returns. | Each iteration takes as long as the page does to respond, up to about half a second per structural edit at 200 entries. |
| **A 500 ms quiet pause between scenarios**, and 10 warm-up keystrokes before measuring. | A pending 120 ms debounce must fire before the next scenario starts, or its work lands in the next scenario's numbers. Warm-up keeps first-use costs (JIT, first layout) out of the samples. | Small; once per scenario. |
| **Typing measured twice**: with the 120 ms debounce and with `?debounce=0`. | The debounced numbers are what a person feels and are the headline; with the debounce off, both shells refresh in the same task as the keystroke, which exposes each shell's full cost. The second set is the diagnosis. | Every typing scenario runs twice. |
| **Sustained typing**: 200 characters at one every 100 ms. | About the pace of real typing. It counts long tasks and total script and layout time over a realistic burst, which single keystrokes cannot show. | A fixed 40 seconds per run (20 s debounced, 20 s raw) whatever `PERF_N` is. |
| **Structural edits measured only with `?debounce=0`.** | With the debounce on, the vanilla page rebuilds the editor at once but refreshes the preview 120 ms later, while React does both at once, so a debounced comparison would time different work. With it off, both do the editor and the preview in the same task. | None extra; it rules out a cheaper debounced set. |
| **Every edit paired with its reversal**: + Entry then Undo, Delete entry then Undo, each move down then back up. | The document stays the same size, so the 50th iteration measures the same page as the first. | Twice the clicks. |
| **10 cold opens per run**, with the fixture stored as a picked master and as the working copy, as a returning user would see it; 30 s limit each, a stuck one recorded and replaced, more than three fail the test. | Start-up cost differs by design between the shells (vanilla builds the editor before its first paint, React paints first and renders after). The prototype twice saw one load never finish after the long typing phases; it never reproduced, so the harness records it rather than losing hours of data. | 30 page loads per build and fixture. |
| **Measured from outside the page** (`addInitScript`, `page.evaluate`, CDP) instead of instrumentation built into each shell. | The initial port is rebuilt from an old commit and has no instrumentation of its own; measuring all three the same way is the only fair option. | None. |
| **A separate config** (`playwright.perf.config.ts`) with a 4-hour test timeout. | `npm test` and CI must never run it. One build on the 200-entry resume can take up to about 2 hours, past Playwright's usual limits. | None. |

## Where the time goes

From the prototype's runs (Apple M2 Pro, the defaults above) and a smoke run in this repository:

| Run | Time |
| --- | ---- |
| 50-entry resume, one build | about 5–6 minutes |
| 50-entry resume, all three builds | about 15–20 minutes |
| 200-entry resume, one build | about 45 minutes to 2 hours |
| Everything (both resumes, all three builds) | about 4.5 hours |
| Smoke run above (50 entries, 1 run, 4 iterations, 2 cold opens, all three builds) | about 3 minutes |

Almost all of it is the 200-entry resume. Each of its runs repeats about 450 measured actions
(single keystrokes, structural edits, and their reversals), two 20-second typing bursts, and the cold
opens, all on a 2,000-bullet page under a 4x throttle; Playwright's own work for each action
(finding the element, scrolling it into view, checking it can be clicked) also grows with the page.
The harness does not time its own overhead, so the split between the page and Playwright is not
measured.

## Shortening a run

Each of these trades accuracy for time; say which one was used when quoting the numbers.

- **Only the 50-entry resume** (`PERF_FIXTURES=stress-50x10`): about 20 minutes. Loses the large-page
  results, where the structural-edit difference is largest.
- **Fewer runs or iterations** (`PERF_RUNS`, `PERF_N`): time falls about in proportion, but the
  95th percentiles become unreliable below about 50 iterations, and one run cannot show a run-level
  stall.
- **Fewer builds** (`PERF_SHELLS=vanilla,react-optimized`): a third less, but no initial-port row, so
  the table can no longer say what memoization won.

## Files

| File | Role |
| ---- | ---- |
| `perf.spec.ts` | The scenarios; writes one JSON file per build and fixture. |
| `harness.ts` | The builds, fixtures, observers, latency measurement, and CDP helpers. |
| `report.mts` | `results/raw/*.json` to `results/tables.md`. Page size is measured from the builds on disk, so build them first. |
| `build-react-initial.mts` | Builds the initial port from commit `080c53c` in a temporary git worktree. PR #6 was squash-merged, so the commit is not on `main`; it stays reachable as the parent of GitHub's `refs/pull/6/head`, which the script fetches if needed. |
| `../fixtures/perf/generate.mts` | Generates the two stress resumes. |
| `../playwright.perf.config.ts` | One worker, no retries, 4-hour timeout, 1400 × 1000 viewport. |
| `../../src/pipeline.bench.ts` | `npm run bench` in the root: the shared modules alone, so the browser numbers can be read as shell cost on top. |
| `prototype-reference/` | The prototype's results, kept unchanged. |
