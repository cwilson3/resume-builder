/**
 * How long the page waits after a text edit before refreshing the preview,
 * Markdown, status, and working copy. A module of its own so every shell uses
 * the same rule and can be measured under it.
 */

/** The refresh delay after a text edit, in milliseconds. */
export const SETTLE_DELAY = 120;

/** `?debounce=0` (or any non-negative number) overrides the delay, for measuring raw cost. */
export function settleDelay(search: string): number {
  const raw = new URLSearchParams(search).get('debounce');
  const value = raw === null || raw.trim() === '' ? Number.NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : SETTLE_DELAY;
}
