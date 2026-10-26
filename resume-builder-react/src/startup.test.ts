import { describe, expect, it } from 'vitest';
import type { StoredMaster } from '@core/storage';
import { chooseStartup, findMaster, masterLabel } from './startup';

const SHIPPED: StoredMaster = { name: 'Sample.md', markdown: '# Shipped\n', origin: 'shipped' };
const STALE_SHIPPED: StoredMaster = { name: 'Sample.md', markdown: '# Shipped, as stored last time\n', origin: 'shipped' };
const PICKED: StoredMaster = { name: 'mine.md', markdown: '# Picked\n', origin: 'picked' };

describe('masterLabel', () => {
  it('names the master file', () => {
    expect(masterLabel(PICKED)).toBe('Master: mine.md');
  });
});

describe('findMaster', () => {
  it('keeps a picked master without fetching the shipped one', async () => {
    let fetched = false;

    const result = await findMaster(PICKED, async () => {
      fetched = true;
      return SHIPPED;
    });

    expect({ result, fetched }).toEqual({ result: PICKED, fetched: false });
  });

  it('prefers a freshly fetched shipped master over the stored copy of it', async () => {
    const result = await findMaster(STALE_SHIPPED, async () => SHIPPED);

    expect(result).toBe(SHIPPED);
  });

  it('falls back to the stored master when the shipped one cannot be read', async () => {
    const result = await findMaster(STALE_SHIPPED, async () => null);

    expect(result).toBe(STALE_SHIPPED);
  });

  it('finds no master when nothing is stored and nothing can be fetched', async () => {
    const result = await findMaster(null, async () => null);

    expect(result).toBeNull();
  });
});

describe('chooseStartup', () => {
  it('opens the master when no working copy is stored', () => {
    const result = chooseStartup(null, SHIPPED);

    expect(result).toEqual({ markdown: '# Shipped\n', source: 'Master: Sample.md' });
  });

  it('treats a stored copy equal to the master as no working copy', () => {
    const result = chooseStartup('# Shipped\n', SHIPPED);

    expect(result).toEqual({ markdown: '# Shipped\n', source: 'Master: Sample.md' });
  });

  it('restores a stored copy that differs from the master, naming the master', () => {
    const result = chooseStartup('# Edited\n', SHIPPED);

    expect(result).toEqual({ markdown: '# Edited\n', source: 'Working copy (restored from this browser) · master: Sample.md' });
  });

  it('restores a stored copy even when no master can be found', () => {
    const result = chooseStartup('# Edited\n', null);

    expect(result).toEqual({ markdown: '# Edited\n', source: 'Working copy (restored from this browser)' });
  });

  it('opens nothing when there is neither a working copy nor a master', () => {
    const result = chooseStartup(null, null);

    expect(result).toBeNull();
  });
});
