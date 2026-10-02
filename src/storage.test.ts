import { describe, expect, it } from 'vitest';
import {
  clearWorkingCopy,
  loadMaster,
  loadWorkingCopy,
  MASTER_KEY,
  saveMaster,
  saveWorkingCopy,
  WORKING_COPY_KEY,
  type StoredMaster,
} from './storage';

function fakeStore(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

function throwingStore(): Storage {
  const boom = (): never => {
    throw new Error('blocked');
  };
  return { length: 0, clear: boom, getItem: boom, key: boom, removeItem: boom, setItem: boom };
}

const picked: StoredMaster = { name: 'other-person.md', markdown: '# Other Person\n', origin: 'picked' };

describe('working copy storage', () => {
  it('loads the copy it saved', () => {
    const store = fakeStore();
    saveWorkingCopy('# md', store);

    expect(loadWorkingCopy(store)).toBe('# md');
  });

  it('has no copy once cleared', () => {
    const store = fakeStore();
    saveWorkingCopy('# md', store);

    clearWorkingCopy(store);

    expect(loadWorkingCopy(store)).toBeNull();
  });

  it('keeps the stored master when the working copy is cleared', () => {
    const store = fakeStore();
    saveMaster(picked, store);
    saveWorkingCopy('# edited', store);

    clearWorkingCopy(store);

    expect(loadMaster(store)).toEqual(picked);
  });

  it('stores the copy under its documented key', () => {
    const store = fakeStore();

    saveWorkingCopy('# md', store);

    expect(store.getItem(WORKING_COPY_KEY)).toBe('# md');
  });
});

describe('master storage', () => {
  it('loads the master it saved, with its name and origin', () => {
    const store = fakeStore();
    saveMaster(picked, store);

    expect(loadMaster(store)).toEqual(picked);
  });

  it('replaces the previous master', () => {
    const store = fakeStore();
    saveMaster({ name: 'Bilbo-Baggins-Resume.md', markdown: '# Bilbo\n', origin: 'shipped' }, store);

    saveMaster(picked, store);

    expect(loadMaster(store)).toEqual(picked);
  });

  it('has no master before one is saved', () => {
    expect(loadMaster(fakeStore())).toBeNull();
  });

  it.each([
    ['not JSON', '{ nope'],
    ['missing the Markdown', JSON.stringify({ name: 'a.md', origin: 'picked' })],
    ['an unknown origin', JSON.stringify({ name: 'a.md', markdown: '# a', origin: 'baked' })],
    ['not an object', JSON.stringify('# a')],
    ['null', 'null'],
  ])('ignores a stored master that is %s', (_label, raw) => {
    const store = fakeStore();
    store.setItem(MASTER_KEY, raw);

    expect(loadMaster(store)).toBeNull();
  });
});

describe('when storage is blocked', () => {
  it('loads no working copy', () => {
    expect(loadWorkingCopy(throwingStore())).toBeNull();
  });

  it('reports the working copy as not saved', () => {
    expect(saveWorkingCopy('x', throwingStore())).toBe(false);
  });

  it('clears without throwing', () => {
    expect(() => clearWorkingCopy(throwingStore())).not.toThrow();
  });

  it('loads no master', () => {
    expect(loadMaster(throwingStore())).toBeNull();
  });

  it('reports the master as not saved', () => {
    expect(saveMaster(picked, throwingStore())).toBe(false);
  });
});

describe('when no storage exists', () => {
  it('reports the working copy as not saved', () => {
    expect(saveWorkingCopy('x', undefined)).toBe(false);
  });

  it('reports the master as not saved', () => {
    expect(saveMaster(picked, undefined)).toBe(false);
  });

  it('loads neither a working copy nor a master', () => {
    expect([loadWorkingCopy(undefined), loadMaster(undefined)]).toEqual([null, null]);
  });
});
