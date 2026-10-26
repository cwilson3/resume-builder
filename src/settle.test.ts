import { describe, expect, it } from 'vitest';
import { SETTLE_DELAY, settleDelay } from './settle';

describe('settleDelay', () => {
  it.each([
    ['', SETTLE_DELAY],
    ['?debounce=0', 0],
    ['?debounce=250', 250],
    ['?debounce=', SETTLE_DELAY],
    ['?debounce=abc', SETTLE_DELAY],
    ['?debounce=-5', SETTLE_DELAY],
    ['?other=1', SETTLE_DELAY],
  ])('reads %j as %d ms', (search, expected) => {
    expect(settleDelay(search)).toBe(expected);
  });
});
