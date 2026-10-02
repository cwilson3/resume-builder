/**
 * Browser persistence. Two things are kept: the in-progress working copy, so a
 * refresh does not lose edits, and the master it started from, so "Reset to
 * master" still works after a reload of a page opened from disk, where the
 * shipped master cannot be fetched again. The master file itself is never
 * written. Every access is guarded because storage can be blocked or throw.
 */

export const WORKING_COPY_KEY = 'rezoom.workingCopy.v1';
/** The master the user is working from, as JSON (see StoredMaster). */
export const MASTER_KEY = 'rezoom.master.v1';

/**
 * The master resume as last loaded. `shipped` was fetched from beside the page
 * and is fetched again on the next load when it can be, so edits to the file
 * show up; `picked` was chosen with Change source and stays until another is picked.
 */
export interface StoredMaster {
  name: string;
  markdown: string;
  origin: 'shipped' | 'picked';
}

function defaultStore(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function loadWorkingCopy(store: Storage | undefined = defaultStore()): string | null {
  try {
    return store?.getItem(WORKING_COPY_KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveWorkingCopy(markdown: string, store: Storage | undefined = defaultStore()): boolean {
  try {
    store?.setItem(WORKING_COPY_KEY, markdown);
    return store !== undefined;
  } catch {
    return false;
  }
}

export function clearWorkingCopy(store: Storage | undefined = defaultStore()): void {
  try {
    store?.removeItem(WORKING_COPY_KEY);
  } catch {
    // ignore
  }
}

function isStoredMaster(value: unknown): value is StoredMaster {
  const v = value as Partial<StoredMaster> | null;
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.name === 'string' &&
    typeof v.markdown === 'string' &&
    (v.origin === 'shipped' || v.origin === 'picked')
  );
}

/** The stored master, or null when there is none or what is stored is unreadable. */
export function loadMaster(store: Storage | undefined = defaultStore()): StoredMaster | null {
  try {
    const raw = store?.getItem(MASTER_KEY);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredMaster(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveMaster(master: StoredMaster, store: Storage | undefined = defaultStore()): boolean {
  try {
    store?.setItem(MASTER_KEY, JSON.stringify(master));
    return store !== undefined;
  } catch {
    return false;
  }
}
