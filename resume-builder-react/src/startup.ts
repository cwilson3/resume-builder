import type { StoredMaster } from '@core/storage';

/**
 * Which master and which document the page opens with: the same rules as `init()` in the vanilla
 * `main.ts`, as pure functions so both halves can be tested without a browser.
 */

/** The label the toolbar shows for a master. */
export function masterLabel(master: StoredMaster): string {
  return `Master: ${master.name}`;
}

/**
 * A master the user picked stays the master. Otherwise the shipped file is fetched fresh, so edits to it
 * show up, falling back to the copy stored the last time it could be read (a page opened from disk
 * cannot fetch it). `loadShipped` resolves to null when the shipped file cannot be read.
 */
export async function findMaster(stored: StoredMaster | null, loadShipped: () => Promise<StoredMaster | null>): Promise<StoredMaster | null> {
  if (stored?.origin === 'picked') return stored;
  return (await loadShipped()) ?? stored;
}

export interface Startup {
  markdown: string;
  source: string;
}

/**
 * What the editor opens: a stored working copy that differs from the master, else the master, else
 * nothing (null), in which case the page shows the welcome panel. A stored copy equal to the master
 * counts as no copy, because the page re-saves the working copy on every settle, including right
 * after Reset.
 */
export function chooseStartup(saved: string | null, master: StoredMaster | null): Startup | null {
  if (saved !== null && saved !== master?.markdown) {
    const from = master ? ` · master: ${master.name}` : '';
    return { markdown: saved, source: `Working copy (restored from this browser)${from}` };
  }
  return master ? { markdown: master.markdown, source: masterLabel(master) } : null;
}
