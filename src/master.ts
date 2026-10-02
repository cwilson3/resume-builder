/**
 * The master (superset) resume. It is not part of the page: the build ships it
 * as a Markdown file beside index.html, and the page only knows its name. Which
 * file it is comes from rezoom.config.json (or the REZOOM_MASTER environment
 * variable), read by the `rezoom-master-resume` plugin in vite.config.ts. The
 * page reads the master and never writes it; it only ever produces new files.
 */
export { MASTER_FILE } from 'virtual:master';

/**
 * Fetches the master shipped beside the page, or returns null when it cannot be
 * read. That is expected when the page is opened from disk (file://), where
 * browsers block reading other files, so the user picks the file instead.
 */
export async function fetchShippedMaster(fileName: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await fetchImpl(`./${encodeURIComponent(fileName)}`, { cache: 'no-store' });
    // A file:// read that a browser does allow reports status 0 rather than 200.
    if (!response.ok && response.status !== 0) return null;
    const text = await response.text();
    return text.trim() === '' ? null : text;
  } catch {
    return null;
  }
}
