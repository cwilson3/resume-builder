import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MASTER_FILE } from '@core/master';
import { MASTER_KEY, WORKING_COPY_KEY, loadMaster, type StoredMaster } from '@core/storage';
import { downloadBlob } from '@core/dom';
import { masterMarkdown } from '@core/test-utils/master-fixture';
import { App } from './App';

// The browser download and the network are the boundaries; everything that builds the file runs for real.
vi.mock('@core/dom', async (importOriginal) => ({ ...(await importOriginal<typeof import('@core/dom')>()), downloadBlob: vi.fn() }));

const MASTER_LABEL = `Master: ${MASTER_FILE}`;

/** Serves `body` as the master shipped beside the page, or fails the request when it is null. */
function serveMaster(body: string | null = masterMarkdown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => (body === null ? Promise.reject(new TypeError('Failed to fetch')) : new Response(body))),
  );
}

/** Renders the page and waits for start-up to load a resume into the editor. */
async function renderLoaded() {
  const result = render(<App />);
  await screen.findByLabelText('Name');
  return result;
}

function firstBullets(): HTMLTextAreaElement {
  return screen.getAllByRole('textbox', { name: 'List items, one per line' })[0] as HTMLTextAreaElement;
}

function previewHeading(): string {
  return within(document.getElementById('preview')!).getByRole('heading', { level: 1 }).textContent ?? '';
}

function sectionTitles(): string[] {
  return screen.getAllByRole('textbox', { name: 'Section title' }).map((el) => (el as HTMLInputElement).value);
}

function sectionCard(title: string): HTMLElement {
  const input = screen.getAllByRole('textbox', { name: 'Section title' }).find((el) => (el as HTMLInputElement).value === title)!;
  return input.closest('section')!;
}

function nameValue(): string {
  return (screen.getByLabelText('Name') as HTMLInputElement).value;
}

function sourceLabel(): string {
  return document.getElementById('sourceLabel')!.textContent ?? '';
}

function flashText(): string {
  return document.getElementById('flash')!.textContent ?? '';
}

function downloadDialog(): HTMLDialogElement {
  return document.getElementById('downloadDialog') as HTMLDialogElement;
}

/** The file handed to the browser download, as text in the PDF's own byte encoding when it is a PDF. */
async function downloaded(): Promise<{ filename: string; text: string }> {
  const [blob, filename] = vi.mocked(downloadBlob).mock.calls[0];
  const text = filename.endsWith('.pdf') ? Buffer.from(await blob.arrayBuffer()).toString('latin1') : await blob.text();
  return { filename, text };
}

const OTHER_TEXT = '# Other Person\n\nother@example.com\n\n## Summary\n\nAnother resume.\n';
const OTHER = new File([OTHER_TEXT], 'other.md', { type: 'text/markdown' });

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  serveMaster();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('App: first render', () => {
  it('renders the master fetched from beside the page in the preview', async () => {
    await renderLoaded();

    expect(screen.getByRole('heading', { level: 1, name: 'Bilbo Baggins' })).toBeInTheDocument();
  });

  it('names the master file as the source', async () => {
    await renderLoaded();

    expect(sourceLabel()).toBe(MASTER_LABEL);
  });

  it('renders one section card per section of the master', async () => {
    await renderLoaded();

    expect(sectionTitles()).toContain('Around the Shire');
  });

  it('shows what the served file holds now, not a copy carried inside the page', async () => {
    serveMaster('# Changed Person\n\nSomewhere | 555-0199\n');

    await renderLoaded();

    expect(nameValue()).toBe('Changed Person');
  });

  it('remembers the fetched master in this browser', async () => {
    await renderLoaded();

    expect(loadMaster()).toEqual({ name: MASTER_FILE, markdown: masterMarkdown, origin: 'shipped' });
  });
});

describe('App: start-up without a readable master', () => {
  beforeEach(() => {
    serveMaster(null);
  });

  it('shows the welcome panel naming the shipped sample when nothing is stored', async () => {
    render(<App />);

    const welcome = await screen.findByRole('heading', { name: 'Open a resume to get started' });

    expect(welcome.closest('#editor')).toHaveTextContent(MASTER_FILE);
  });

  it('says no resume is loaded', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: 'Open a resume to get started' });

    expect(sourceLabel()).toBe('No resume loaded');
  });

  it('offers nothing to reset to or download', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: 'Open a resume to get started' });

    expect({
      reset: screen.getByRole('button', { name: 'Reset to master' }).hasAttribute('disabled'),
      download: screen.getByRole('button', { name: 'Download…' }).hasAttribute('disabled'),
      addSection: screen.getByRole('button', { name: '+ Add section' }).hasAttribute('disabled'),
    }).toEqual({ reset: true, download: true, addSection: true });
  });

  it('falls back to the master stored the last time it could be read', async () => {
    const stored: StoredMaster = { name: MASTER_FILE, markdown: '# Stored Person\n', origin: 'shipped' };
    localStorage.setItem(MASTER_KEY, JSON.stringify(stored));

    await renderLoaded();

    expect(nameValue()).toBe('Stored Person');
  });

  it('Choose a resume… opens the file chooser', async () => {
    const user = userEvent.setup();
    render(<App />);
    const choose = await screen.findByRole('button', { name: 'Choose a resume…' });
    let opened = false;
    screen.getByLabelText('Open a Markdown file').addEventListener('click', () => {
      opened = true;
    });

    await user.click(choose);

    expect(opened).toBe(true);
  });

  it('loads a file chosen from the welcome panel as the master, with nothing to undo', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'Open a resume to get started' });

    await user.upload(screen.getByLabelText('Open a Markdown file'), OTHER);
    await screen.findByDisplayValue('Other Person');

    expect({ source: sourceLabel(), undo: screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled') }).toEqual({
      source: 'Master: other.md',
      undo: true,
    });
  });
});

describe('App: start-up with a picked master', () => {
  it('keeps a master picked with Change source over the shipped one', async () => {
    const picked: StoredMaster = { name: 'mine.md', markdown: '# Picked Person\n', origin: 'picked' };
    localStorage.setItem(MASTER_KEY, JSON.stringify(picked));

    await renderLoaded();

    expect({ name: nameValue(), source: sourceLabel() }).toEqual({ name: 'Picked Person', source: 'Master: mine.md' });
  });

  it('keeps a file picked while the shipped master is still being fetched', async () => {
    let answer: (response: Response) => void = () => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))));
    const user = userEvent.setup();
    render(<App />);
    await user.upload(screen.getByLabelText('Open a Markdown file'), OTHER);
    await screen.findByDisplayValue('Other Person');

    await act(async () => answer(new Response(masterMarkdown)));

    expect({ name: nameValue(), source: sourceLabel() }).toEqual({ name: 'Other Person', source: 'Master: other.md' });
  });
});

describe('App: typing', () => {
  it('keeps focus and the caret in place while typing in the middle of a bullet', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    const field = firstBullets();
    const at = 5;

    await user.type(field, 'XYZ', { initialSelectionStart: at, initialSelectionEnd: at });

    expect({ focused: document.activeElement === field, caret: field.selectionStart, inserted: field.value.slice(at, at + 3) }).toEqual({
      focused: true,
      caret: at + 3,
      inserted: 'XYZ',
    });
  });

  it('keeps a newline typed at the end of a list, so a new bullet can be started', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    const field = firstBullets();
    const original = field.value;

    await user.type(field, '{Enter}Next', { initialSelectionStart: original.length, initialSelectionEnd: original.length });

    expect(field.value).toBe(`${original}\nNext`);
  });

  it('keeps focus in the name field across many keystrokes', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    const name = screen.getByLabelText('Name');

    await user.type(name, ' Jr.');

    expect({ focused: document.activeElement === name, value: (name as HTMLInputElement).value }).toEqual({ focused: true, value: 'Bilbo Baggins Jr.' });
  });

  it('enables Undo after the first keystroke', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.type(screen.getByLabelText('Name'), '!');

    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });
});

describe('App: settled output', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  async function typeInName(text: string) {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(screen.getByLabelText('Name'), text);
  }

  it('leaves the preview alone until the debounce has passed', async () => {
    await renderLoaded();

    await typeInName('!');

    expect(previewHeading()).toBe('Bilbo Baggins');
  });

  it('updates the preview 120 ms after the last keystroke', async () => {
    await renderLoaded();
    await typeInName('!');

    act(() => vi.advanceTimersByTime(120));

    expect(previewHeading()).toBe('Bilbo Baggins!');
  });

  it('shows the Modified badge once the edit settles', async () => {
    await renderLoaded();
    await typeInName('!');

    act(() => vi.advanceTimersByTime(120));

    expect(document.getElementById('modifiedBadge')).toBeVisible();
  });

  it('saves the settled edit as the working copy', async () => {
    await renderLoaded();
    await typeInName('!');

    act(() => vi.advanceTimersByTime(120));

    expect(localStorage.getItem(WORKING_COPY_KEY)).toBe(masterMarkdown.replace('# Bilbo Baggins\n', '# Bilbo Baggins!\n'));
  });
});

describe('App: editing each kind of field', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  async function typeInto(field: HTMLElement, text: string) {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(field, text);
    act(() => vi.advanceTimersByTime(120));
  }

  function previewText(selector: string): string[] {
    return Array.from(document.getElementById('preview')!.querySelectorAll(selector), (el) => el.textContent ?? '');
  }

  it('renaming a section updates its data-title at once, before the preview settles', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderLoaded();
    const title = screen.getAllByRole('textbox', { name: 'Section title' })[0];

    await user.type(title, 's');

    expect(title.closest('.ed-section')).toHaveAttribute('data-title', 'About Bilbos');
  });

  it('editing the contact line shows in the preview once settled', async () => {
    await renderLoaded();

    await typeInto(screen.getByLabelText('Contact line'), ' | Remote');

    expect(previewText('.rp-contact')[0]).toMatch(/Remote$/);
  });

  it('editing a subheading shows in the preview once settled', async () => {
    await renderLoaded();

    await typeInto(screen.getAllByRole('textbox', { name: 'Subheading text' })[0], ' II');

    expect(previewText('h3')).toContain('Burglar (Contract) II');
  });

  it('editing a paragraph shows in the preview once settled', async () => {
    await renderLoaded();
    const paragraph = screen.getAllByRole('textbox', { name: 'Paragraph text' })[0];

    await typeInto(paragraph, ' Extra.');

    expect(previewText('p').some((text) => text.endsWith(' Extra.'))).toBe(true);
  });
});

describe('App: startup from storage', () => {
  it('restores a working copy that differs from the master', async () => {
    localStorage.setItem(WORKING_COPY_KEY, masterMarkdown.replace('# Bilbo Baggins', '# Restored Name'));

    await renderLoaded();

    expect({ source: sourceLabel(), name: nameValue() }).toEqual({
      source: `Working copy (restored from this browser) · master: ${MASTER_FILE}`,
      name: 'Restored Name',
    });
  });

  it('treats a stored copy equal to the master as no working copy', async () => {
    localStorage.setItem(WORKING_COPY_KEY, masterMarkdown);

    await renderLoaded();

    expect(sourceLabel()).toBe(MASTER_LABEL);
  });
});

describe('App: download dialog', () => {
  async function openDialog() {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole('button', { name: 'Download…' }));
    return user;
  }

  it('opens from the toolbar', async () => {
    await openDialog();

    expect(downloadDialog()).toHaveAttribute('open');
  });

  it('switching the format to PDF changes the extension and shows the margins', async () => {
    const user = await openDialog();

    await user.selectOptions(screen.getByLabelText('Format'), 'pdf');

    expect({ ext: document.getElementById('extLabel')!.textContent, marginsVisible: !document.getElementById('marginPicker')!.hidden }).toEqual({
      ext: '.pdf',
      marginsVisible: true,
    });
  });

  it('keeps the margins hidden for Markdown', async () => {
    await openDialog();

    expect(document.getElementById('marginPicker')).not.toBeVisible();
  });

  it('switching the separator to pipe re-renders the preview at once', async () => {
    const user = await openDialog();

    await user.selectOptions(screen.getByLabelText('Separator'), 'pipe');

    expect(document.querySelector('#preview .rp-contact')!.textContent).toContain('Bag End, Hobbiton, The Shire | ');
  });

  it('remembers the chosen margins in this browser', async () => {
    const user = await openDialog();
    await user.selectOptions(screen.getByLabelText('Format'), 'pdf');

    await user.selectOptions(screen.getByLabelText('Margins'), 'compact');

    expect(localStorage.getItem('rezoom.pdfMargin')).toBe('compact');
  });

  it('keeps the typed file name in the field', async () => {
    const user = await openDialog();

    await user.type(screen.getByLabelText('File name'), 'My-Resume');

    expect(screen.getByLabelText('File name')).toHaveValue('My-Resume');
  });

  it('Cancel closes it without downloading', async () => {
    const user = await openDialog();

    await user.click(within(downloadDialog()).getByRole('button', { name: 'Cancel' }));

    expect({ open: downloadDialog().hasAttribute('open'), downloads: vi.mocked(downloadBlob).mock.calls.length }).toEqual({ open: false, downloads: 0 });
  });

  it('Download closes it once the file is built', async () => {
    const user = await openDialog();

    await user.click(within(downloadDialog()).getByRole('button', { name: 'Download' }));

    expect({ open: downloadDialog().hasAttribute('open'), downloads: vi.mocked(downloadBlob).mock.calls.length }).toEqual({ open: false, downloads: 1 });
  });

  it('Enter in the file name downloads, like the Download button', async () => {
    const user = await openDialog();

    await user.type(screen.getByLabelText('File name'), 'From Enter{Enter}');

    expect((await downloaded()).filename).toBe('From-Enter.md');
  });
});

describe('App: settled output after editing', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  function user() {
    return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  }

  it('shows a bullet edit in the preview once settled', async () => {
    await renderLoaded();
    const field = firstBullets();

    await user().type(field, ' Extra', { initialSelectionStart: field.value.indexOf('\n'), initialSelectionEnd: field.value.indexOf('\n') });
    act(() => vi.advanceTimersByTime(120));

    expect(Array.from(document.querySelectorAll('#preview li'), (li) => li.textContent).some((text) => text?.endsWith(' Extra'))).toBe(true);
  });

  it('clears the Modified badge when the original text is typed back', async () => {
    await renderLoaded();
    await user().type(screen.getByLabelText('Name'), '!{Backspace}');

    act(() => vi.advanceTimersByTime(120));

    expect(document.getElementById('modifiedBadge')).not.toBeVisible();
  });

  it('warns about a character the PDF fonts cannot render, naming it', async () => {
    await renderLoaded();
    await user().type(screen.getByLabelText('Name'), ' ▪');

    act(() => vi.advanceTimersByTime(120));

    const warning = screen.getByRole('alert');
    expect({ visible: !warning.hidden, names: warning.textContent?.includes(': ▪ .') }).toEqual({ visible: true, names: true });
  });

  it('keeps the warning hidden for text the PDF fonts can render', async () => {
    await renderLoaded();

    expect(screen.getByRole('alert', { hidden: true })).not.toBeVisible();
  });
});

describe('App: undo', () => {
  it('brings back a deleted section', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(within(sectionCard('Honours')).getByRole('button', { name: 'Delete section' }));

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(sectionTitles()).toContain('Honours');
  });

  it('undoes a run of keystrokes in one field as a single step', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.type(screen.getByLabelText('Name'), ' Jr.');

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(nameValue()).toBe('Bilbo Baggins');
  });

  it('undoes a structural change and a later edit one at a time, newest first', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    const titlesBefore = sectionTitles();
    await user.click(within(document.querySelector<HTMLElement>('.ed-section')!).getByRole('button', { name: 'Delete section' }));
    await user.type(screen.getByLabelText('Name'), '!');
    const undo = screen.getByRole('button', { name: 'Undo' });

    await user.click(undo);
    const afterFirst = { name: nameValue(), titles: sectionTitles() };
    await user.click(undo);
    const afterSecond = { name: nameValue(), titles: sectionTitles() };

    expect([afterFirst, afterSecond]).toEqual([
      { name: 'Bilbo Baggins', titles: titlesBefore.slice(1) },
      { name: 'Bilbo Baggins', titles: titlesBefore },
    ]);
  });

  it('is disabled again once every step has been undone', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.type(screen.getByLabelText('Name'), '!');

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });
});

describe('App: download', () => {
  async function downloadFrom(user: ReturnType<typeof userEvent.setup>) {
    await user.click(within(downloadDialog()).getByRole('button', { name: 'Download' }));
  }

  async function renderAndOpen() {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole('button', { name: 'Download…' }));
    return user;
  }

  it('downloads the Markdown under the default file name', async () => {
    const user = await renderAndOpen();

    await downloadFrom(user);

    expect(await downloaded()).toEqual({ filename: 'Bilbo-Baggins-Resume.md', text: masterMarkdown });
  });

  it('includes keystrokes that have not settled into the preview yet', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.type(screen.getByLabelText('Name'), '!');
    await user.click(screen.getByRole('button', { name: 'Download…' }));

    await downloadFrom(user);

    expect((await downloaded()).text.startsWith('# Bilbo Baggins!\n')).toBe(true);
  });

  it('builds the PDF with the chosen margins and separator', async () => {
    const user = await renderAndOpen();
    await user.selectOptions(screen.getByLabelText('Format'), 'pdf');
    await user.selectOptions(screen.getByLabelText('Margins'), 'compact');
    await user.selectOptions(screen.getByLabelText('Separator'), 'pipe');

    await downloadFrom(user);

    const { filename, text } = await downloaded();
    expect({ filename, firstTextX: /([\d.]+) [\d.]+ Td/.exec(text)?.[1], pipe: text.includes('Thorin and Company | Erebor, Lonely Mountain') }).toEqual({
      filename: 'Bilbo-Baggins-Resume.pdf',
      firstTextX: '36.',
      pipe: true,
    });
  });

  it('uses the typed file name', async () => {
    const user = await renderAndOpen();
    await user.type(screen.getByLabelText('File name'), 'Tailored Burglar');

    await downloadFrom(user);

    expect((await downloaded()).filename).toBe('Tailored-Burglar.md');
  });

  it('says which file was downloaded', async () => {
    const user = await renderAndOpen();

    await downloadFrom(user);

    expect(flashText()).toBe('Downloaded Bilbo-Baggins-Resume.md');
  });
});

describe('App: reset to master', () => {
  beforeEach(() => {
    localStorage.setItem(WORKING_COPY_KEY, masterMarkdown.replace('# Bilbo Baggins', '# Restored Name'));
  });

  it('loads the master, names it as the source, and clears the Modified badge', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole('button', { name: 'Reset to master' }));

    expect({ name: nameValue(), source: sourceLabel(), modified: document.getElementById('modifiedBadge')!.hidden }).toEqual({
      name: 'Bilbo Baggins',
      source: MASTER_LABEL,
      modified: true,
    });
  });

  it('leaves the master text as the stored working copy', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole('button', { name: 'Reset to master' }));

    expect(localStorage.getItem(WORKING_COPY_KEY)).toBe(masterMarkdown);
  });

  it('opens on the master, not a working copy, the next time the page loads', async () => {
    const user = userEvent.setup();
    const { unmount } = await renderLoaded();
    await user.click(screen.getByRole('button', { name: 'Reset to master' }));
    unmount();

    await renderLoaded();

    expect(sourceLabel()).toBe(MASTER_LABEL);
  });

  it('can be undone, returning to the working copy', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole('button', { name: 'Reset to master' }));

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(nameValue()).toBe('Restored Name');
  });

  it('says it reset', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole('button', { name: 'Reset to master' }));

    expect(flashText()).toBe('Reset to master');
  });
});

describe('App: Change source', () => {
  it('opens the file chooser', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    const chooser = screen.getByLabelText('Open a Markdown file');
    let opened = false;
    chooser.addEventListener('click', () => {
      opened = true;
    });

    await user.click(screen.getByRole('button', { name: 'Change source' }));

    expect(opened).toBe(true);
  });

  it('loads the chosen file into the editor', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.upload(screen.getByLabelText('Open a Markdown file'), OTHER);

    expect(await screen.findByDisplayValue('Other Person')).toBe(screen.getByLabelText('Name'));
  });

  it('names the chosen file as the master', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.upload(screen.getByLabelText('Open a Markdown file'), OTHER);

    await waitFor(() => expect(sourceLabel()).toBe('Master: other.md'));
  });

  it('remembers the chosen file as the master in this browser', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.upload(screen.getByLabelText('Open a Markdown file'), OTHER);
    await screen.findByDisplayValue('Other Person');

    expect(loadMaster()).toEqual({ name: 'other.md', markdown: OTHER_TEXT, origin: 'picked' });
  });

  it('makes Reset return to the chosen file, not the shipped master', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.upload(screen.getByLabelText('Open a Markdown file'), OTHER);
    await screen.findByDisplayValue('Other Person');
    await user.type(screen.getByLabelText('Name'), ' Edited');

    await user.click(screen.getByRole('button', { name: 'Reset to master' }));

    expect(nameValue()).toBe('Other Person');
  });

  it('says which file was opened', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.upload(screen.getByLabelText('Open a Markdown file'), OTHER);

    await waitFor(() => expect(flashText()).toBe('Opened other.md'));
  });

  it('can be undone, returning to the previous document', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.upload(screen.getByLabelText('Open a Markdown file'), OTHER);
    await screen.findByDisplayValue('Other Person');

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(nameValue()).toBe('Bilbo Baggins');
  });

  it('renders markup in an opened file as text and neutralizes javascript: links', async () => {
    const user = userEvent.setup();
    const hostile = new File(['# Eve <script>alert(1)</script> & Co\n\n[site](javascript:alert(1))\n'], 'hostile.md', { type: 'text/markdown' });
    await renderLoaded();

    await user.upload(screen.getByLabelText('Open a Markdown file'), hostile);
    await screen.findByDisplayValue('Eve <script>alert(1)</script> & Co');

    const preview = document.getElementById('preview')!;
    expect({
      scripts: preview.querySelectorAll('script').length,
      heading: preview.querySelector('h1')?.textContent,
      href: preview.querySelector('a')?.getAttribute('href'),
    }).toEqual({ scripts: 0, heading: 'Eve <script>alert(1)</script> & Co', href: '#' });
  });
});

describe('App: blocked storage', () => {
  it('renders the master and still turns edits into preview output when every storage call throws', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);
    await renderLoaded();

    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).type(screen.getByLabelText('Name'), '!');
    act(() => vi.advanceTimersByTime(120));

    expect(previewHeading()).toBe('Bilbo Baggins!');
  });
});
