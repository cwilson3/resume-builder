import { useCallback, useState } from 'react';

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore: storage can be blocked
  }
}

/**
 * A preference kept in this browser (`rezoom.pdfMargin`, `rezoom.separator`). `normalize` maps a stored
 * or chosen value to a known id, as `marginPreset(...).id` does in the vanilla shell, so a stale or
 * hand-edited value falls back to the default.
 */
export function usePersistedPref(key: string, normalize: (raw: string | null) => string): [string, (value: string) => void] {
  const [value, setValue] = useState(() => normalize(readPref(key)));
  const update = useCallback(
    (next: string) => {
      const id = normalize(next);
      setValue(id);
      writePref(key, id);
    },
    [key, normalize],
  );
  return [value, update];
}
