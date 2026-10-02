import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MASTER = path.resolve(__dirname, '../../resume/Bilbo-Baggins-Resume.md');
const FIXTURE = path.resolve(__dirname, '../fixtures/other-person.md');

const masterHash = (): string => createHash('sha256').update(readFileSync(MASTER)).digest('hex');
const section = (page: Page, title: string) => page.locator(`.ed-section[data-title="${title}"]`);
const settingsButton = (page: Page) => page.getByRole('button', { name: 'Settings' });

async function openSettings(page: Page): Promise<void> {
  await settingsButton(page).click();
  await expect(page.locator('#settingsPanel')).toBeVisible();
}

const downloadDialog = (page: Page) => page.getByRole('dialog', { name: 'Download' });

/** Opens the Download dialog from the toolbar; the format, margin, separator and file name live inside it. */
async function openDownloadDialog(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Download…' }).click();
  await expect(downloadDialog(page)).toBeVisible();
}

/** Clicks Download inside the open dialog, which saves the file and closes the dialog. */
async function download(page: Page): Promise<{ filename: string; bytes: Buffer }> {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnDownload')]);
  await expect(downloadDialog(page)).toBeHidden();
  const file = await dl.path();
  return { filename: dl.suggestedFilename(), bytes: readFileSync(file) };
}

test.describe('resume builder', () => {
  test.beforeEach(async ({ page }) => {
    // Start every test from the master, not from a working copy left by a previous test.
    await page.addInitScript(() => {
      try {
        localStorage.removeItem('rezoom.workingCopy.v1');
        localStorage.removeItem('rezoom.master.v1');
      } catch {
        /* ignore */
      }
    });
    await page.goto('/');
    await expect(page.locator('#fName')).toHaveValue('Bilbo Baggins');
  });

  test('loads the master document into the editor and the preview', async ({ page }) => {
    await expect(page.locator('#sourceLabel')).toHaveText('Master: Bilbo-Baggins-Resume.md');
    await expect(page.locator('#btnReset')).toBeEnabled();
    await expect(page.locator('#preview h1')).toHaveText('Bilbo Baggins');
    expect(await page.locator('#preview h2').count()).toBeGreaterThanOrEqual(4);
    await expect(section(page, 'Adventures and Employment')).toBeVisible();
    await expect(page.locator('#modifiedBadge')).toBeHidden();
    await expect(page.locator('#status')).toContainText(/\d+ words/);
  });

  test('deleting a section removes it from the preview and the downloaded Markdown without touching the master', async ({ page }) => {
    const before = masterHash();
    await section(page, 'Around the Shire').getByRole('button', { name: 'Delete section' }).click();

    await expect(section(page, 'Around the Shire')).toHaveCount(0);
    await expect(page.locator('#preview h2', { hasText: 'Around the Shire' })).toHaveCount(0);
    await expect(page.locator('#modifiedBadge')).toBeVisible();

    await openDownloadDialog(page);
    const { filename, bytes } = await download(page);
    expect(filename).toBe('Bilbo-Baggins-Resume.md');
    const markdown = bytes.toString('utf8');
    expect(markdown).not.toContain('## Around the Shire');
    expect(markdown).toContain('## Adventures and Employment');
    expect(markdown.startsWith('# Bilbo Baggins\n')).toBe(true);

    expect(masterHash()).toBe(before);
    expect(readFileSync(MASTER, 'utf8')).toContain('## Around the Shire');
  });

  test('deleting an entry removes the role and its bullets together', async ({ page }) => {
    const experience = section(page, 'Adventures and Employment');
    const entries = experience.locator('.ed-entry');
    const countBefore = await entries.count();
    await entries.first().getByRole('button', { name: 'Delete entry' }).click();
    await expect(entries).toHaveCount(countBefore - 1);
    await expect(page.locator('#preview h3', { hasText: 'Burglar (Contract)' })).toHaveCount(0);
    await expect(page.locator('#preview li', { hasText: 'Recovered the Arkenstone' })).toHaveCount(0);
  });

  test('downloads a PDF with the default file name', async ({ page }) => {
    await openDownloadDialog(page);
    await page.selectOption('#formatPicker', 'pdf');
    await expect(page.locator('#extLabel')).toHaveText('.pdf');
    const { filename, bytes } = await download(page);
    expect(filename).toBe('Bilbo-Baggins-Resume.pdf');
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1000);
    expect(bytes.toString('latin1')).toContain('/Title (Bilbo Baggins Resume)');
  });

  test('offers a PDF margin choice that applies to the download and persists', async ({ page }) => {
    const margins = page.locator('#marginPicker');
    await openDownloadDialog(page);
    // Only meaningful for PDF, so hidden while Markdown is selected.
    await expect(margins).toBeHidden();
    await page.selectOption('#formatPicker', 'pdf');
    await expect(margins).toBeVisible();
    await expect(margins).toHaveValue('comfortable');
    await expect(margins.locator('option')).toHaveText(['Comfortable (48 pt)', 'Compact (36 pt)']);

    // The name is the first positioned text and is drawn at the left margin.
    const firstTextX = (bytes: Buffer): string => /([\d.]+) [\d.]+ Td/.exec(bytes.toString('latin1'))?.[1] ?? '';
    expect(firstTextX((await download(page)).bytes)).toBe('48.');

    await openDownloadDialog(page);
    await margins.selectOption('compact');
    expect(firstTextX((await download(page)).bytes)).toBe('36.');

    // The choice persists; the format does not, so the picker is hidden again until PDF is chosen.
    await page.reload();
    await openDownloadDialog(page);
    await expect(margins).toHaveValue('compact');
    await expect(margins).toBeHidden();
    await page.selectOption('#formatPicker', 'pdf');
    await expect(margins).toBeVisible();
    await expect(margins).toHaveValue('compact');

    await page.evaluate(() => localStorage.removeItem('rezoom.pdfMargin'));
  });

  test('offers a field separator that changes the preview and the PDF, keeps the pipe in Markdown, and persists', async ({ page }) => {
    const picker = page.locator('#separatorPicker');
    const meta = page.locator('#preview p', { hasText: 'Erebor, Lonely Mountain' });
    await expect(meta).toHaveText('Thorin and Company · Erebor, Lonely Mountain · Apr 2941 - Jun 2942');
    await expect(page.locator('#preview .rp-contact')).toContainText('Bag End, Hobbiton, The Shire · 555-555-0111');
    // The editor's text keeps the pipe, so the working copy still equals the master.
    await expect(page.locator('#fContact')).toHaveValue(/Bag End, Hobbiton, The Shire \| 555-555-0111/);
    await expect(page.locator('#modifiedBadge')).toBeHidden();

    // A display choice for both formats (it changes the preview), so shown for Markdown and PDF alike.
    await openDownloadDialog(page);
    await expect(picker).toBeVisible();
    await expect(picker).toHaveValue('dot');
    await expect(picker.locator('option')).toHaveText(['Middle dot ·', 'Pipe |']);

    // Markdown keeps the pipe under the default...
    const markdown = (await download(page)).bytes.toString('utf8');
    expect(markdown).toContain('Thorin and Company | Erebor, Lonely Mountain | Apr 2941 - Jun 2942');
    expect(markdown).not.toContain('·');

    // ...and the default PDF carries the dot. The standard fonts use Windows-1252, where it is byte 0xB7.
    await openDownloadDialog(page);
    await page.selectOption('#formatPicker', 'pdf');
    const dotPdf = (await download(page)).bytes.toString('latin1');
    expect(dotPdf).toContain('Thorin and Company · Erebor, Lonely Mountain · Apr 2941 - Jun 2942');
    expect(dotPdf).not.toContain('Thorin and Company | Erebor');

    // Changing the separator inside the dialog updates the preview behind it straight away.
    await openDownloadDialog(page);
    await picker.selectOption('pipe');
    await expect(meta).toHaveText('Thorin and Company | Erebor, Lonely Mountain | Apr 2941 - Jun 2942');
    const pipePdf = (await download(page)).bytes.toString('latin1');
    expect(pipePdf).toContain('Thorin and Company | Erebor, Lonely Mountain | Apr 2941 - Jun 2942');
    expect(pipePdf).not.toContain('·');

    await page.reload();
    await expect(page.locator('#preview p', { hasText: 'Erebor, Lonely Mountain' })).toHaveText('Thorin and Company | Erebor, Lonely Mountain | Apr 2941 - Jun 2942');
    await openDownloadDialog(page);
    await expect(picker).toHaveValue('pipe');

    await page.evaluate(() => localStorage.removeItem('rezoom.separator'));
  });

  test('uses a custom file name when one is typed', async ({ page }) => {
    await openDownloadDialog(page);
    await page.fill('#filename', 'Tailored Burglar.pdf');
    const { filename } = await download(page);
    expect(filename).toBe('Tailored-Burglar.md');
  });

  test('keeps the download options in a dialog that the toolbar Download button opens', async ({ page }) => {
    const dialog = downloadDialog(page);
    // Closed, the options are out of sight; the toolbar only offers the button that opens them.
    await expect(dialog).toBeHidden();
    await expect(page.locator('#formatPicker')).toBeHidden();
    await expect(page.locator('#separatorPicker')).toBeHidden();
    await expect(page.locator('#filename')).toBeHidden();

    await openDownloadDialog(page);
    await expect(dialog.getByLabel('Format')).toBeVisible();
    await expect(dialog.getByLabel('Separator')).toBeVisible();
    await expect(dialog.getByLabel('File name')).toBeVisible();

    // Cancel and Escape close it without downloading.
    let downloads = 0;
    page.on('download', () => downloads++);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await openDownloadDialog(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(downloads).toBe(0);

    // Enter in the file name downloads, like the Download button.
    await openDownloadDialog(page);
    await page.fill('#filename', 'From Enter');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.press('#filename', 'Enter')]);
    expect(dl.suggestedFilename()).toBe('From-Enter.md');
    await expect(dialog).toBeHidden();
  });

  test('undo restores a deleted section', async ({ page }) => {
    await expect(page.locator('#btnUndo')).toBeDisabled();
    await section(page, 'Honours').getByRole('button', { name: 'Delete section' }).click();
    await expect(section(page, 'Honours')).toHaveCount(0);
    await page.click('#btnUndo');
    await expect(section(page, 'Honours')).toBeVisible();
    await expect(page.locator('#modifiedBadge')).toBeHidden();
  });

  test('edits flow to the preview and reset returns to the master', async ({ page }) => {
    const summary = section(page, 'About Bilbo');
    await summary.locator('.ed-title').fill('Profile');
    await expect(page.locator('#preview h2', { hasText: 'Profile' })).toBeVisible();
    await expect(page.locator('#modifiedBadge')).toBeVisible();

    await page.click('#btnReset');
    await expect(section(page, 'About Bilbo')).toBeVisible();
    await expect(page.locator('#preview h2', { hasText: 'Profile' })).toHaveCount(0);
    await expect(page.locator('#modifiedBadge')).toBeHidden();
  });

  test('adds a new section with a new entry', async ({ page }) => {
    await page.click('#btnAddSection');
    const created = section(page, 'New Section');
    await expect(created).toBeVisible();
    await created.getByRole('button', { name: '+ Entry' }).click();
    await expect(page.locator('#preview h2', { hasText: 'New Section' })).toBeVisible();
    await expect(page.locator('#preview h3', { hasText: 'New Role' })).toBeVisible();
    await expect(page.locator('#preview li', { hasText: 'New accomplishment' })).toBeVisible();
  });

  test('opens another Markdown file as the working copy', async ({ page }) => {
    await page.setInputFiles('#fileInput', FIXTURE);
    await expect(page.locator('#fName')).toHaveValue('Other Person');
    await expect(page.locator('#sourceLabel')).toContainText('other-person.md');
    await expect(page.locator('#preview h3', { hasText: 'Tester' })).toBeVisible();
    await openDownloadDialog(page);
    const { filename } = await download(page);
    expect(filename).toBe('Other-Person-Resume.md');
  });

  test('warns about characters the standard PDF fonts cannot render', async ({ page }) => {
    await expect(page.locator('#warning')).toBeHidden();
    await page.fill('#fName', 'Bilbo ▪ Baggins');
    await expect(page.locator('#warning')).toBeVisible();
    await expect(page.locator('#warning')).toContainText('▪');
  });

  test('the settings gear opens the display options and closes on Escape or an outside click', async ({ page }) => {
    const panel = page.locator('#settingsPanel');
    await expect(panel).toBeHidden();
    await expect(settingsButton(page)).toHaveAttribute('aria-expanded', 'false');

    await openSettings(page);
    await expect(settingsButton(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(panel.getByRole('switch', { name: 'Dark mode' })).toBeVisible();
    await expect(panel.getByRole('group', { name: 'Content width' })).toBeVisible();

    // Escape from inside the panel hands focus back to the gear.
    await panel.getByRole('switch', { name: 'Dark mode' }).focus();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(settingsButton(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(settingsButton(page)).toBeFocused();

    await openSettings(page);
    await page.locator('#preview').click();
    await expect(panel).toBeHidden();
  });

  test('dark mode and content width choices apply and persist across a reload', async ({ page }) => {
    await expect(page.locator('body')).not.toHaveClass(/dark-theme/);
    await openSettings(page);
    await expect(page.getByRole('button', { name: '40', exact: true })).toHaveAttribute('aria-pressed', 'true');

    await page.locator('#themeSwitch').click();
    await expect(page.locator('body')).toHaveClass(/dark-theme/);
    await page.getByRole('button', { name: 'Full', exact: true }).click();
    await expect(page.locator('body')).toHaveClass(/width-full/);

    await page.reload();
    await expect(page.locator('body')).toHaveClass(/dark-theme/);
    await expect(page.locator('body')).toHaveClass(/width-full/);
    await openSettings(page);
    await expect(page.locator('#themeSwitch')).toBeChecked();
    await expect(page.getByRole('button', { name: 'Full', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('captures a full-page screenshot for the report', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1400, height: 1000 });
    const file = testInfo.outputPath('builder-full.png');
    await page.screenshot({ path: file, fullPage: true });
    await testInfo.attach('builder-full', { path: file, contentType: 'image/png' });
  });

  test('has no serious or critical accessibility violations (WCAG 2.x A/AA)', async ({ page }) => {
    const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
    for (const theme of ['light', 'dark'] as const) {
      if (theme === 'dark') {
        await openSettings(page);
        await page.locator('#themeSwitch').click();
        await expect(page.locator('body')).toHaveClass(/dark-theme/);
      }
      const results = await new AxeBuilder({ page }).withTags(tags).analyze();
      const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      const summary = blocking.map((v) => `${theme}: ${v.id} (${v.impact}): ${v.help} x${v.nodes.length}`).join('\n');
      expect(blocking, summary).toEqual([]);
    }

    await page.keyboard.press('Escape');
    await openDownloadDialog(page);
    const dialogResults = await new AxeBuilder({ page }).withTags(tags).analyze();
    const dialogBlocking = dialogResults.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(dialogBlocking, dialogBlocking.map((v) => `download dialog: ${v.id}: ${v.help}`).join('\n')).toEqual([]);
  });
});

test.describe('working copy and master persistence', () => {
  const MASTER_KEYS = ['rezoom.workingCopy.v1', 'rezoom.master.v1'];

  test.afterEach(async ({ page }) => {
    await page.evaluate((keys) => keys.forEach((k) => localStorage.removeItem(k)), MASTER_KEYS);
  });

  test('edits survive a reload and are labeled as a restored working copy', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#fName')).toHaveValue('Bilbo Baggins');

    await section(page, 'About Bilbo').locator('.ed-title').fill('Profile');
    await expect(page.locator('#modifiedBadge')).toBeVisible();
    await page.reload();

    await expect(section(page, 'Profile')).toBeVisible();
    await expect(page.locator('#sourceLabel')).toContainText('Working copy');
    await expect(page.locator('#modifiedBadge')).toBeVisible();
  });

  test('fetches the master from beside the page at start-up rather than carrying it inside', async ({ page }) => {
    // The served file changes; the page shows the new content, so it was not built in.
    await page.route('**/Bilbo-Baggins-Resume.md', (route) =>
      route.fulfill({ contentType: 'text/markdown', body: '# Changed Person\n\nSomewhere | 555-0199\n\n## Summary\n\nEdited on disk.\n' }),
    );

    await page.goto('/');

    await expect(page.locator('#fName')).toHaveValue('Changed Person');
    await expect(page.locator('#sourceLabel')).toHaveText('Master: Bilbo-Baggins-Resume.md');
  });

  test('a file opened with Change source stays the master that Reset returns to, after a reload', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#fName')).toHaveValue('Bilbo Baggins');
    await page.setInputFiles('#fileInput', FIXTURE);
    await expect(page.locator('#fName')).toHaveValue('Other Person');

    await page.fill('#fName', 'Edited Person');
    // The badge appears once the debounced refresh has saved the working copy.
    await expect(page.locator('#modifiedBadge')).toBeVisible();
    await page.reload();
    await expect(page.locator('#fName')).toHaveValue('Edited Person');
    await page.click('#btnReset');

    // Back to the picked file, not to the master served beside the page.
    await expect(page.locator('#fName')).toHaveValue('Other Person');
    await expect(page.locator('#sourceLabel')).toHaveText('Master: other-person.md');
    await expect(page.locator('#modifiedBadge')).toBeHidden();
  });
});
