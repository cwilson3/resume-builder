import { expect, test, type Browser, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  blockIndex,
  cdpDelta,
  cdpTotals,
  FIXTURES,
  measure,
  openPage,
  readObservers,
  resetObservers,
  SHELLS,
  CPU_THROTTLE,
  type CdpTotals,
  type Fixture,
  type Shell,
} from './harness';

/**
 * Performance comparison of the vanilla shell, the initial (unmemoized) React port, and the current React
 * build. Writes one JSON file per shell and fixture to perf/results/raw/; `node perf/report.mts` turns
 * them into perf/results/tables.md. perf/README.md explains the setup and why it takes hours.
 *
 * Knobs, all optional: PERF_SHELLS=vanilla,react-optimized  PERF_FIXTURES=stress-50x10
 * PERF_RUNS (3)  PERF_N (50, iterations per scenario per run)  PERF_COLD (10, cold opens per run)
 * PERF_OUT (a directory for the JSON instead of perf/results/raw, for smoke runs).
 */

const pick = <T extends { id: string }>(all: readonly T[], env: string | undefined): T[] =>
  env ? all.filter((item) => env.split(',').includes(item.id)) : [...all];
const RUNS = Number(process.env.PERF_RUNS ?? 3);
const N = Number(process.env.PERF_N ?? 50);
const COLD = Number(process.env.PERF_COLD ?? 10);
const TYPED = 200;
const TYPE_DELAY_MS = 100;
const SECTION = 'Professional Experience';
const RAW_DIR = process.env.PERF_OUT ?? path.join(__dirname, 'results/raw');

interface TypingResult {
  keydown: number[];
  longtasks: number[];
  cdp: CdpTotals;
}

interface RunResult {
  keyEditor: number[];
  keyPreview: number[];
  keyRaw: number[];
  typing: { debounced: TypingResult; raw: TypingResult };
  structural: { addEntry: number[]; deleteEntry: number[]; moveBlock: number[]; moveSection: number[]; undo: number[] };
  structuralCdp: CdpTotals;
}

interface ColdResult {
  firstRenderMs: number;
  fcpMs: number;
  cdp: CdpTotals;
}

/** A cold open that never reached the editor-rendered mark, kept so the report can say so. */
interface ColdTimeout {
  blocks: number;
  readyState: string;
  /** Whether the init scripts ran: the observers' store exists. */
  observers: boolean;
}

/** Normal cold opens finish in under a second even on stress-200x10; a load past this is stuck. */
const COLD_TIMEOUT_MS = 30_000;

/** A pause with nothing happening, so a pending debounce fires and the next scenario starts from rest. */
const quiet = (page: Page) => page.waitForTimeout(500);

async function loadFixture(page: Page, fixture: Fixture): Promise<void> {
  await page.setInputFiles('#fileInput', fixture.file);
  await expect(page.locator('#fName')).toHaveValue('Stress Person', { timeout: 60_000 });
  await expect(page.locator('#preview h1')).toHaveText('Stress Person', { timeout: 60_000 });
}

/** Focuses the bullet list of the middle entry with the caret at its end. */
async function focusTypingField(page: Page, fixture: Fixture): Promise<void> {
  const mid = fixture.entries / 2;
  const index = await blockIndex(page, SECTION, `Bullet 1 of entry ${mid}:`);
  const field = page.locator(`.ed-section[data-title="${SECTION}"] .ed-block`).nth(index).locator('textarea');
  await field.click();
  await field.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(el.value.length, el.value.length));
  for (let i = 0; i < 10; i++) await page.keyboard.press('w'); // warm-up
  await quiet(page);
}

async function sustainedTyping(page: Page, cdp: Awaited<ReturnType<typeof openPage>>['cdp']): Promise<TypingResult> {
  await resetObservers(page);
  const before = await cdpTotals(cdp);
  await page.keyboard.type('s'.repeat(TYPED), { delay: TYPE_DELAY_MS });
  await quiet(page);
  const after = await cdpTotals(cdp);
  return { ...(await readObservers(page)), cdp: cdpDelta(before, after) };
}

function times(n: number, f: () => Promise<void>): Promise<void> {
  return Array.from({ length: n }).reduce<Promise<void>>((p) => p.then(f), Promise.resolve());
}

async function debouncedRun(browser: Browser, shell: Shell, fixture: Fixture) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  try {
    const { page, cdp } = await openPage(context);
    await page.goto(pathToFileURL(shell.file).href);
    await loadFixture(page, fixture);
    await focusTypingField(page, fixture);

    const keyEditor: number[] = [];
    await times(N, async () => void keyEditor.push(await measure(page, 'paint', 'keydown', () => page.keyboard.press('a'))));
    await quiet(page);
    const keyPreview: number[] = [];
    await times(N, async () => void keyPreview.push(await measure(page, 'preview', 'keydown', () => page.keyboard.press('b'))));
    await quiet(page);
    const typing = await sustainedTyping(page, cdp);
    return { keyEditor, keyPreview, typing };
  } finally {
    await context.close();
  }
}

async function rawRun(browser: Browser, shell: Shell, fixture: Fixture) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  try {
    const { page, cdp } = await openPage(context);
    await page.goto(`${pathToFileURL(shell.file).href}?debounce=0`);
    await loadFixture(page, fixture);
    await focusTypingField(page, fixture);

    const keyRaw: number[] = [];
    await times(N, async () => void keyRaw.push(await measure(page, 'preview', 'keydown', () => page.keyboard.press('a'))));
    await quiet(page);
    const typing = await sustainedTyping(page, cdp);

    // Structural edits under ?debounce=0, where both shells refresh the preview in the same task, so the
    // numbers are like for like (perf/README.md). Each edit is paired with its reversal to keep the document stable.
    const mid = fixture.entries / 2;
    const blocks = page.locator(`.ed-section[data-title="${SECTION}"] .ed-block`);
    const click = (selector: string) => () => page.locator(selector).click();
    const s = { addEntry: [] as number[], deleteEntry: [] as number[], moveBlock: [] as number[], moveSection: [] as number[], undo: [] as number[] };
    const undo = async () => void s.undo.push(await measure(page, 'paint', 'click', click('#btnUndo')));
    const before = await cdpTotals(cdp);
    await times(N, async () => {
      s.addEntry.push(await measure(page, 'paint', 'click', click(`.ed-section[data-title="${SECTION}"] [data-act="add-entry"]`)));
      await undo();
    });
    await times(N, async () => {
      const heading = await blockIndex(page, SECTION, `Role ${mid}`);
      s.deleteEntry.push(await measure(page, 'paint', 'click', () => blocks.nth(heading).locator('[data-act="entry-delete"]').click()));
      await undo();
    });
    await times(N / 2, async () => {
      const meta = await blockIndex(page, SECTION, `Company ${mid} |`);
      s.moveBlock.push(await measure(page, 'paint', 'click', () => blocks.nth(meta).locator('[data-act="block-down"]').click()));
      s.moveBlock.push(await measure(page, 'paint', 'click', () => blocks.nth(meta + 1).locator('[data-act="block-up"]').click()));
    });
    await times(N / 2, async () => {
      s.moveSection.push(await measure(page, 'paint', 'click', click('.ed-section[data-title="Summary"] [data-act="section-down"]')));
      s.moveSection.push(await measure(page, 'paint', 'click', click('.ed-section[data-title="Summary"] [data-act="section-up"]')));
    });
    const structuralCdp = cdpDelta(before, await cdpTotals(cdp));
    return { keyRaw, typing, structural: s, structuralCdp };
  } finally {
    await context.close();
  }
}

/**
 * Opens the built page as a returning user would: the fixture already stored as the master (picked with
 * Change source, so nothing is fetched) and as the working copy.
 */
async function coldOpen(browser: Browser, shell: Shell, fixture: Fixture): Promise<ColdResult | ColdTimeout> {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  try {
    const expectedBlocks = 1 + fixture.entries * 3;
    await context.addInitScript(
      ({ markdown, name, expectedBlocks }) => {
        localStorage.setItem('rezoom.workingCopy.v1', markdown);
        localStorage.setItem('rezoom.master.v1', JSON.stringify({ name, markdown, origin: 'picked' }));
        const w = window as unknown as { __firstRender?: number };
        const mo = new MutationObserver(() => {
          if (document.querySelectorAll('.ed-block').length < expectedBlocks) return;
          mo.disconnect();
          requestAnimationFrame(() => {
            const channel = new MessageChannel();
            channel.port1.onmessage = () => (w.__firstRender = performance.now());
            channel.port2.postMessage(0);
          });
        });
        mo.observe(document, { childList: true, subtree: true });
      },
      { markdown: readFileSync(fixture.file, 'utf8'), name: path.basename(fixture.file), expectedBlocks },
    );
    const { page, cdp } = await openPage(context);
    await page.goto(pathToFileURL(shell.file).href);
    try {
      await page.waitForFunction(() => (window as unknown as { __firstRender?: number }).__firstRender !== undefined, null, { timeout: COLD_TIMEOUT_MS });
    } catch {
      return await page.evaluate(() => ({
        blocks: document.querySelectorAll('.ed-block').length,
        readyState: document.readyState,
        observers: '__perf' in window,
      }));
    }
    const firstRenderMs = await page.evaluate(() => (window as unknown as { __firstRender: number }).__firstRender);
    const fcpMs = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? Number.NaN);
    return { firstRenderMs, fcpMs, cdp: await cdpTotals(cdp) };
  } finally {
    await context.close();
  }
}

for (const fixture of pick(FIXTURES, process.env.PERF_FIXTURES)) {
  for (const shell of pick(SHELLS, process.env.PERF_SHELLS)) {
    test(`${fixture.id} · ${shell.id} @perf`, async ({ browser }) => {
      const runs: RunResult[] = [];
      for (let run = 0; run < RUNS; run++) {
        const debounced = await debouncedRun(browser, shell, fixture);
        const raw = await rawRun(browser, shell, fixture);
        runs.push({
          keyEditor: debounced.keyEditor,
          keyPreview: debounced.keyPreview,
          keyRaw: raw.keyRaw,
          typing: { debounced: debounced.typing, raw: raw.typing },
          structural: raw.structural,
          structuralCdp: raw.structuralCdp,
        });
      }
      expect(runs.flatMap((r) => r.keyPreview)).toHaveLength(RUNS * N);
      mkdirSync(RAW_DIR, { recursive: true });
      // Written once before the cold opens and again after, so a failure there keeps the hour of typing data.
      const save = (cold: ColdResult[], coldTimeouts: ColdTimeout[]) => writeFileSync(
        path.join(RAW_DIR, `${fixture.id}__${shell.id}.json`),
        JSON.stringify(
          {
            shell: shell.id,
            label: shell.label,
            fixture: fixture.id,
            date: new Date().toISOString(),
            chromium: browser.version(),
            machine: `${os.cpus()[0]?.model ?? 'unknown CPU'}, ${Math.round(os.totalmem() / 2 ** 30)} GB, ${os.type()} ${os.release()}`,
            cpuThrottle: CPU_THROTTLE,
            settings: { runs: RUNS, iterations: N, cold: COLD, typed: TYPED, typeDelayMs: TYPE_DELAY_MS },
            runs,
            cold,
            coldTimeouts,
          },
          null,
          1,
        ),
      );
      save([], []);

      // A stuck load is recorded and replaced by another; more than three fails the test.
      const cold: ColdResult[] = [];
      const coldTimeouts: ColdTimeout[] = [];
      while (cold.length < RUNS * COLD && coldTimeouts.length <= 3) {
        const result = await coldOpen(browser, shell, fixture);
        if ('firstRenderMs' in result) cold.push(result);
        else coldTimeouts.push(result);
      }
      save(cold, coldTimeouts);
      expect(cold).toHaveLength(RUNS * COLD);
    });
  }
}
