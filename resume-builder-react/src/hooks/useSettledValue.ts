import { useEffect, useState } from 'react';

/**
 * The value as of `delay` ms after it last changed, or the live value at once when `flushNow` is set
 * or the delay is zero. Text edits pass `flushNow: false`; structural edits, undo, and load pass true.
 */
export function useSettledValue<T>(value: T, delay: number, flushNow: boolean): T {
  const immediate = flushNow || delay <= 0;
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    if (immediate) {
      setSettled(value);
      return undefined;
    }
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay, immediate]);

  return immediate ? value : settled;
}
