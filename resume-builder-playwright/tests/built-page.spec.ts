import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The page as it is handed out: dist/index.html opened straight from disk, no server,
// with the sample master shipped beside it. The `build` project rebuilds both first.
const DIST = path.resolve(__dirname, '../../dist');
const BUILT_PAGE = pathToFileURL(path.join(DIST, 'index.html')).href;
const SHIPPED_MASTER = path.join(DIST, 'Bilbo-Baggins-Resume.md');
const FIXTURE = path.resolve(__dirname, '../fixtures/other-person.md');

const downloadDialog = (page: Page) => page.getByRole('dialog', { name: 'Download' });
const welcome = (page: Page) => page.getByRole('heading', { name: 'Open a resume to get started' });

/** Answers the file picker that `open` brings up with the given file. */
async function chooseFile(page: Page, open: () => Promise<void>, file: string): Promise<void> {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open()]);
  await chooser.setFiles(file);
}

/** Opens the Download dialog, optionally picks a format, and returns the file it saves. */
async function download(page: Page, format?: 'md' | 'pdf'): Promise<{ filename: string; bytes: Buffer }> {
  await page.getByRole('button', { name: 'Download…' }).click();
  await expect(downloadDialog(page)).toBeVisible();
  if (format) await page.selectOption('#formatPicker', format);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnDownload')]);
  await expect(downloadDialog(page)).toBeHidden();
  return { filename: dl.suggestedFilename(), bytes: readFileSync(await dl.path()) };
}

test.describe('built page opened from disk, before a resume is chosen', () => {
  test('shows a welcome panel naming the shipped sample, with nothing to reset or download, and requests nothing from the network', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (req) => {
      if (!/^(file|data|blob):/.test(req.url())) external.push(req.url());
    });

    await page.goto(BUILT_PAGE);

    await expect(welcome(page)).toBeVisible();
    await expect(page.locator('#editor')).toContainText('Bilbo-Baggins-Resume.md');
    await expect(page.locator('#sourceLabel')).toHaveText('No resume loaded');
    await expect(page.getByRole('button', { name: 'Reset to master' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Download…' })).toBeDisabled();
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /^data:image\/svg\+xml,/);
    expect(external).toEqual([]);
  });

  test('the welcome panel has no serious or critical accessibility violations (WCAG 2.x A/AA)', async ({ page }) => {
    await page.goto(BUILT_PAGE);
    await expect(welcome(page)).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();

    const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([]);
  });
});

test.describe('built page opened from disk, after choosing the shipped sample', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BUILT_PAGE);
    await chooseFile(page, () => page.getByRole('button', { name: 'Choose a resume…' }).click(), SHIPPED_MASTER);
    await expect(page.locator('#fName')).toHaveValue('Bilbo Baggins');
  });

  test('loads the chosen file as the master', async ({ page }) => {
    await expect(welcome(page)).toHaveCount(0);
    await expect(page.locator('#preview h1')).toHaveText('Bilbo Baggins');
    await expect(page.locator('#sourceLabel')).toHaveText('Master: Bilbo-Baggins-Resume.md');
    await expect(page.getByRole('button', { name: 'Reset to master' })).toBeEnabled();
    await expect(page.locator('#modifiedBadge')).toBeHidden();
  });

  test('Reset returns to the chosen master after an edit and a reload', async ({ page }) => {
    await page.fill('#fName', 'Edited Baggins');
    await expect(page.locator('#modifiedBadge')).toBeVisible();
    await page.reload();
    await expect(page.locator('#fName')).toHaveValue('Edited Baggins');
    await expect(page.locator('#sourceLabel')).toContainText('Working copy');

    await page.getByRole('button', { name: 'Reset to master' }).click();

    await expect(page.locator('#fName')).toHaveValue('Bilbo Baggins');
    await expect(page.locator('#sourceLabel')).toHaveText('Master: Bilbo-Baggins-Resume.md');
    await expect(page.locator('#modifiedBadge')).toBeHidden();
  });

  test('Change source makes another file the master that Reset returns to', async ({ page }) => {
    await chooseFile(page, () => page.getByRole('button', { name: 'Change source' }).click(), FIXTURE);
    await expect(page.locator('#fName')).toHaveValue('Other Person');
    await page.fill('#fName', 'Edited Person');
    await expect(page.locator('#modifiedBadge')).toBeVisible();

    await page.getByRole('button', { name: 'Reset to master' }).click();

    await expect(page.locator('#fName')).toHaveValue('Other Person');
    await expect(page.locator('#sourceLabel')).toHaveText('Master: other-person.md');
  });

  test('downloads the working copy as Markdown', async ({ page }) => {
    const { filename, bytes } = await download(page, 'md');

    expect(filename).toBe('Bilbo-Baggins-Resume.md');
    expect(bytes.toString('utf8')).toBe(readFileSync(SHIPPED_MASTER, 'utf8'));
  });

  test('downloads the working copy as a PDF', async ({ page }) => {
    const { filename, bytes } = await download(page, 'pdf');

    expect(filename).toBe('Bilbo-Baggins-Resume.pdf');
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.toString('latin1')).toContain('/Title (Bilbo Baggins Resume)');
  });
});
