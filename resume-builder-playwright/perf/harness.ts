import type { BrowserContext, CDPSession, Page } from '@playwright/test';
import path from 'node:path';

/**
 * Shared pieces of the performance harness (see perf/README.md for why it is built this way). Everything
 * is measured from outside the page, through `addInitScript`, `page.evaluate`, and CDP, so no shell
 * carries instrumentation of its own and all three builds are measured the same way.
 */

const ROOT = path.resolve(__dirname, '../..');

export interface Shell {
  id: 'vanilla' | 'react-initial' | 'react-optimized';
  label: string;
  file: string;
}

/** The three builds compared. `react-initial` is built from the unmemoized commit by perf/build-react-initial.mts. */
export const SHELLS: Shell[] = [
  { id: 'vanilla', label: 'vanilla', file: path.join(ROOT, 'dist/index.html') },
  { id: 'react-initial', label: 'React, initial port', file: path.join(__dirname, 'builds/react-initial.html') },
  { id: 'react-optimized', label: 'React, optimized', file: path.join(ROOT, 'resume-builder-react/dist/index.html') },
];

export const FIXTURES = [
  { id: 'stress-50x10', file: path.resolve(__dirname, '../fixtures/perf/stress-50x10.md'), entries: 50 },
  { id: 'stress-200x10', file: path.resolve(__dirname, '../fixtures/perf/stress-200x10.md'), entries: 200 },
] as const;

export type Fixture = (typeof FIXTURES)[number];

export const CPU_THROTTLE = 4;

/** Installed before any page script: Event Timing at the 16 ms floor, and long tasks. */
export function observers(): void {
  const store = { events: [] as { name: string; duration: number }[], longtasks: [] as number[] };
  (window as unknown as { __perf: typeof store }).__perf = store;
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) store.events.push({ name: e.name, duration: e.duration });
    }).observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit);
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) store.longtasks.push(e.duration);
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    // An unsupported entry type leaves the arrays empty; the report shows zeros rather than failing.
  }
}

/**
 * Arms a one-shot listener for `evt` (capture phase, so it sees the event before the shell does) and
 * stores a promise of the ms from the event's timestamp to the next frame after the watched change:
 * 'paint' waits for the next frame after the event, 'preview' for the next frame after #preview mutates.
 * The frame is marked by a message posted from requestAnimationFrame, which runs after that frame's paint
 * is scheduled; it approximates the paint, it is not INP.
 */
export function arm({ kind, evt }: { kind: 'paint' | 'preview'; evt: string }): void {
  const w = window as unknown as { __latency: Promise<number> };
  w.__latency = new Promise((resolve) => {
    const afterPaint = (t0: number) =>
      requestAnimationFrame(() => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => resolve(performance.now() - t0);
        channel.port2.postMessage(0);
      });
    addEventListener(
      evt,
      (e) => {
        if (kind === 'paint') {
          afterPaint(e.timeStamp);
          return;
        }
        const mo = new MutationObserver(() => {
          mo.disconnect();
          afterPaint(e.timeStamp);
        });
        mo.observe(document.getElementById('preview')!, { childList: true, subtree: true, characterData: true });
      },
      { once: true, capture: true },
    );
  });
}

export async function measure(page: Page, kind: 'paint' | 'preview', evt: string, act: () => Promise<void>): Promise<number> {
  await page.evaluate(arm, { kind, evt });
  await act();
  return page.evaluate(() => (window as unknown as { __latency: Promise<number> }).__latency);
}

export async function resetObservers(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = (window as unknown as { __perf: { events: unknown[]; longtasks: unknown[] } }).__perf;
    store.events.length = 0;
    store.longtasks.length = 0;
  });
}

export async function readObservers(page: Page): Promise<{ keydown: number[]; longtasks: number[] }> {
  return page.evaluate(() => {
    const store = (window as unknown as { __perf: { events: { name: string; duration: number }[]; longtasks: number[] } }).__perf;
    return { keydown: store.events.filter((e) => e.name === 'keydown').map((e) => e.duration), longtasks: [...store.longtasks] };
  });
}

export interface CdpTotals {
  scriptMs: number;
  layoutMs: number;
  styleMs: number;
  heapMb: number;
}

export async function cdpTotals(cdp: CDPSession): Promise<CdpTotals> {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const get = (name: string) => metrics.find((m) => m.name === name)?.value ?? 0;
  return {
    scriptMs: get('ScriptDuration') * 1000,
    layoutMs: get('LayoutDuration') * 1000,
    styleMs: get('RecalcStyleDuration') * 1000,
    heapMb: get('JSHeapUsedSize') / 2 ** 20,
  };
}

export function cdpDelta(before: CdpTotals, after: CdpTotals): CdpTotals {
  return { scriptMs: after.scriptMs - before.scriptMs, layoutMs: after.layoutMs - before.layoutMs, styleMs: after.styleMs - before.styleMs, heapMb: after.heapMb };
}

/** A throttled page in a fresh context (fresh localStorage), with the observers installed. */
export async function openPage(context: BrowserContext): Promise<{ page: Page; cdp: CDPSession }> {
  await context.addInitScript(observers);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  return { page, cdp };
}

/** Index of the block in the section whose text field holds `text` exactly, or starts with it. */
export async function blockIndex(page: Page, section: string, text: string): Promise<number> {
  const index = await page.evaluate(
    ({ section, text }) =>
      Array.from(document.querySelectorAll(`.ed-section[data-title="${section}"] .ed-block`)).findIndex((block) => {
        const field = block.querySelector<HTMLInputElement | HTMLTextAreaElement>('.ed-text-field');
        return field !== null && field.value.startsWith(text);
      }),
    { section, text },
  );
  if (index < 0) throw new Error(`No block starting ${JSON.stringify(text)} in ${section}`);
  return index;
}
