import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePersistedPref } from './usePersistedPref';

const KEY = 'rezoom.test.pref';
const normalize = (raw: string | null) => (raw === 'b' ? 'b' : 'a');

describe('usePersistedPref', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('starts from the stored value', () => {
    localStorage.setItem(KEY, 'b');

    const { result } = renderHook(() => usePersistedPref(KEY, normalize));

    expect(result.current[0]).toBe('b');
  });

  it('falls back to the default when the stored value is unknown', () => {
    localStorage.setItem(KEY, 'stale');

    const { result } = renderHook(() => usePersistedPref(KEY, normalize));

    expect(result.current[0]).toBe('a');
  });

  it('stores the normalized value on change', () => {
    const { result } = renderHook(() => usePersistedPref(KEY, normalize));

    act(() => result.current[1]('b'));

    expect(localStorage.getItem(KEY)).toBe('b');
  });

  it('still changes the value when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => usePersistedPref(KEY, normalize));

    act(() => result.current[1]('b'));

    expect(result.current[0]).toBe('b');
  });
});
