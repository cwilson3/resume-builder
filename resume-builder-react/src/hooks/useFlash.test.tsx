import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLASH_MS, useFlash } from './useFlash';

describe('useFlash', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with no message', () => {
    const { result } = renderHook(() => useFlash());

    expect(result.current[0]).toBe('');
  });

  it('shows a message until the timeout has passed', () => {
    const { result } = renderHook(() => useFlash());

    act(() => result.current[1]('Saved'));
    act(() => vi.advanceTimersByTime(FLASH_MS - 1));

    expect(result.current[0]).toBe('Saved');
  });

  it('clears the message once the timeout has passed', () => {
    const { result } = renderHook(() => useFlash());

    act(() => result.current[1]('Saved'));
    act(() => vi.advanceTimersByTime(FLASH_MS));

    expect(result.current[0]).toBe('');
  });

  it('restarts the timeout when the same message is shown again', () => {
    const { result } = renderHook(() => useFlash());
    act(() => result.current[1]('Saved'));
    act(() => vi.advanceTimersByTime(FLASH_MS - 1));

    act(() => result.current[1]('Saved'));
    act(() => vi.advanceTimersByTime(FLASH_MS - 1));

    expect(result.current[0]).toBe('Saved');
  });

  it('replaces an earlier message with a later one', () => {
    const { result } = renderHook(() => useFlash());

    act(() => result.current[1]('First'));
    act(() => result.current[1]('Second'));

    expect(result.current[0]).toBe('Second');
  });
});
