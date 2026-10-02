import { describe, expect, it } from 'vitest';
import { basename } from 'node:path';
import { fetchShippedMaster, MASTER_FILE } from './master';
import { parseResume } from './parse';
import { resolveMaster } from '../scripts/resolve-master';
import { masterMarkdown } from './test-utils/master-fixture';

/** A fetch that answers every request with the given status and body, recording the URLs asked for. */
function fakeFetch(status: number, body: string, requested: string[] = []): typeof fetch {
  return async (input) => {
    requested.push(String(input));
    return { ok: status >= 200 && status < 300, status, text: async () => body } as Response;
  };
}

const rejectingFetch: typeof fetch = async () => {
  throw new TypeError('Failed to fetch');
};

describe('master document', () => {
  it('is shipped under the file name rezoom.config.json (or REZOOM_MASTER) points at', () => {
    expect(MASTER_FILE).toBe(basename(resolveMaster().file));
  });

  it('maps onto the builder fields: a name, a contact line, and titled sections', () => {
    const resume = parseResume(masterMarkdown);

    const shape = {
      hasName: resume.name !== '',
      hasContact: resume.contact !== '',
      hasSections: resume.sections.length > 0,
      allTitled: resume.sections.every((section) => section.title !== ''),
    };

    expect(shape).toEqual({ hasName: true, hasContact: true, hasSections: true, allTitled: true });
  });
});

describe('fetchShippedMaster', () => {
  it('returns the Markdown served beside the page', async () => {
    const text = await fetchShippedMaster('Resume.md', fakeFetch(200, '# Bilbo Baggins\n'));

    expect(text).toBe('# Bilbo Baggins\n');
  });

  it('asks for the file next to the page, with its name URL-encoded', async () => {
    const requested: string[] = [];

    await fetchShippedMaster('My Resume #2.md', fakeFetch(200, '# x\n', requested));

    expect(requested).toEqual(['./My%20Resume%20%232.md']);
  });

  it('returns null when the server answers with an error status', async () => {
    const text = await fetchShippedMaster('Resume.md', fakeFetch(404, 'Not found'));

    expect(text).toBeNull();
  });

  it('returns null when the fetch is refused, as it is for a page opened from disk', async () => {
    const text = await fetchShippedMaster('Resume.md', rejectingFetch);

    expect(text).toBeNull();
  });

  it('accepts a file:// read that a browser allows, which reports status 0', async () => {
    const text = await fetchShippedMaster('Resume.md', fakeFetch(0, '# From disk\n'));

    expect(text).toBe('# From disk\n');
  });

  it('returns null for an empty file', async () => {
    const text = await fetchShippedMaster('Resume.md', fakeFetch(200, '  \n'));

    expect(text).toBeNull();
  });
});
