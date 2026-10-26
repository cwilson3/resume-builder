import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SETTLE_DELAY } from '@core/settle';
import { useSettledValue } from './useSettledValue';

describe('useSettledValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(initial: string) {
    return renderHook(({ value, flush, delay }) => useSettledValue(value, delay, flush), {
      initialProps: { value: initial, flush: true, delay: SETTLE_DELAY },
    });
  }

  it('returns the starting value at once', () => {
    const { result } = setup('a');

    expect(result.current).toBe('a');
  });

  it('keeps the previous value until the delay has passed after a text edit', () => {
    const { result, rerender } = setup('a');

    rerender({ value: 'ab', flush: false, delay: SETTLE_DELAY });
    act(() => vi.advanceTimersByTime(SETTLE_DELAY - 1));

    expect(result.current).toBe('a');
  });

  it('settles on the trailing value once the delay has passed', () => {
    const { result, rerender } = setup('a');

    rerender({ value: 'ab', flush: false, delay: SETTLE_DELAY });
    act(() => vi.advanceTimersByTime(SETTLE_DELAY));

    expect(result.current).toBe('ab');
  });

  it('restarts the wait on every edit, so a burst of typing settles once on the last value', () => {
    const { result, rerender } = setup('a');

    rerender({ value: 'ab', flush: false, delay: SETTLE_DELAY });
    act(() => vi.advanceTimersByTime(SETTLE_DELAY - 20));
    rerender({ value: 'abc', flush: false, delay: SETTLE_DELAY });
    act(() => vi.advanceTimersByTime(SETTLE_DELAY - 20));

    expect(result.current).toBe('a');
  });

  it('returns the live value at once when flushNow is set', () => {
    const { result, rerender } = setup('a');

    rerender({ value: 'b', flush: true, delay: SETTLE_DELAY });

    expect(result.current).toBe('b');
  });

  it('a flush after a pending text edit wins over the pending value', () => {
    const { result, rerender } = setup('a');

    rerender({ value: 'ab', flush: false, delay: SETTLE_DELAY });
    rerender({ value: 'structural', flush: true, delay: SETTLE_DELAY });
    act(() => vi.advanceTimersByTime(SETTLE_DELAY * 2));

    expect(result.current).toBe('structural');
  });

  it('a text edit after a flush trails from the flushed value', () => {
    const { result, rerender } = setup('a');

    rerender({ value: 'b', flush: true, delay: SETTLE_DELAY });
    rerender({ value: 'bc', flush: false, delay: SETTLE_DELAY });

    expect(result.current).toBe('b');
  });

  it('returns the live value at once when the delay is zero', () => {
    const { result, rerender } = setup('a');

    rerender({ value: 'ab', flush: false, delay: 0 });

    expect(result.current).toBe('ab');
  });
});
