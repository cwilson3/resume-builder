import { useCallback, useEffect, useState } from 'react';

/** How long a toolbar message stays, as in the vanilla `flash()`. */
export const FLASH_MS = 4000;

/**
 * A short status message (`#flash`) that clears itself `FLASH_MS` after it was last shown. Showing the
 * same text twice restarts the timer, because each call is a new message object.
 */
export function useFlash(): [string, (message: string) => void] {
  const [flash, setFlash] = useState<{ text: string } | null>(null);

  useEffect(() => {
    if (!flash) return undefined;
    const timer = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  const show = useCallback((text: string) => setFlash({ text }), []);
  return [flash?.text ?? '', show];
}
