import * as M from './model';
import type { Block, Resume, Section } from './model';
import { parseResume } from './parse';
import { serializeResume } from './serialize';
import { renderResumeHtml } from './render-html';
import { buildFile, defaultBaseName, formatInfo, type OutputFormat } from './build';
import { MARGIN_PRESETS, marginPreset, resumeUnsupportedChars } from './pdf';
import { applySeparator, SEPARATOR_PRESETS, separatorPreset, type SeparatorPreset } from './separator';
import { clearWorkingCopy, loadMaster, loadWorkingCopy, saveMaster, saveWorkingCopy, type StoredMaster } from './storage';
import { fetchShippedMaster, MASTER_FILE } from './master';
import { downloadBlob, fit, h, qs } from './dom';

/**
 * UI wiring only. All document logic lives in the pure modules; this file maps
 * DOM events to model operations and re-renders. The master is never written:
 * every edit produces a new working-copy Resume. Until a resume is loaded (the
 * shipped master, a restored working copy, or a file the user picks) the editor
 * shows a welcome panel and the buttons that need a document stay disabled.
 */

const UNDO_LIMIT = 100;

let state: Resume = M.createEmptyResume();
/** What "Reset to master" returns to; null until a master has been loaded. */
let master: StoredMaster | null = null;
/** False while the welcome panel is showing. */
let loaded = false;
const undoStack: Resume[] = [];
let lastEditKey: string | null = null;
const collapsed = new WeakSet<Section>();
let refreshTimer: number | undefined;
let flashTimer: number | undefined;

const els = {
  editor: qs<HTMLDivElement>('#editor'),
  preview: qs<HTMLDivElement>('#preview'),
  mdOut: qs<HTMLTextAreaElement>('#mdOut'),
  source: qs<HTMLSpanElement>('#sourceLabel'),
  modified: qs<HTMLSpanElement>('#modifiedBadge'),
  status: qs<HTMLSpanElement>('#status'),
  flash: qs<HTMLSpanElement>('#flash'),
  warning: qs<HTMLDivElement>('#warning'),
  format: qs<HTMLSelectElement>('#formatPicker'),
  marginFields: Array.from(document.querySelectorAll<HTMLElement>('.margin-field')),
  margin: qs<HTMLSelectElement>('#marginPicker'),
  separator: qs<HTMLSelectElement>('#separatorPicker'),
  filename: qs<HTMLInputElement>('#filename'),
  ext: qs<HTMLSpanElement>('#extLabel'),
  btnDownloadOpen: qs<HTMLButtonElement>('#btnDownloadOpen'),
  btnDownloadCancel: qs<HTMLButtonElement>('#btnDownloadCancel'),
  downloadDialog: qs<HTMLDialogElement>('#downloadDialog'),
  downloadForm: qs<HTMLFormElement>('#downloadForm'),
  btnReset: qs<HTMLButtonElement>('#btnReset'),
  btnUndo: qs<HTMLButtonElement>('#btnUndo'),
  btnOpen: qs<HTMLButtonElement>('#btnOpen'),
  fileInput: qs<HTMLInputElement>('#fileInput'),
  btnAddSection: qs<HTMLButtonElement>('#btnAddSection'),
  tabPreview: qs<HTMLButtonElement>('#tabPreview'),
  tabMarkdown: qs<HTMLButtonElement>('#tabMarkdown'),
  previewPanel: qs<HTMLDivElement>('#previewPanel'),
  markdownPanel: qs<HTMLDivElement>('#markdownPanel'),
};

// ------------------------------------------------------------------ state

function pushUndo(): void {
  undoStack.push(state);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  els.btnUndo.disabled = false;
}

interface CommitOptions {
  /** Re-render the editor (adds, deletes, moves). Text edits leave the editor alone so focus is kept. */
  structural?: boolean;
  /** Consecutive text edits with the same key share one undo step. */
  editKey?: string;
}

function commit(next: Resume, options: CommitOptions = {}): void {
  const { structural = false, editKey } = options;
  if (structural || editKey === undefined || editKey !== lastEditKey) pushUndo();
  lastEditKey = structural ? null : (editKey ?? null);
  state = next;
  if (structural) renderEditor();
  scheduleRefresh();
}

function undo(): void {
  const previous = undoStack.pop();
  if (!previous) return;
  state = previous;
  lastEditKey = null;
  renderEditor();
  refresh();
}

function loadMarkdown(markdown: string, label: string): void {
  loaded = true;
  state = parseResume(markdown);
  lastEditKey = null;
  els.source.textContent = label;
  renderEditor();
  refresh();
}

function scheduleRefresh(): void {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(refresh, 120);
}

function refresh(): void {
  if (!loaded) return;
  const markdown = serializeResume(state);
  els.preview.innerHTML = renderResumeHtml(applySeparator(state, currentSeparator().glyph));
  els.mdOut.value = markdown;
  const s = M.stats(state);
  els.status.textContent = `${s.words} words · ${s.sections} sections · ${s.bullets} bullets`;
  els.modified.hidden = master === null || markdown === master.markdown;
  els.btnReset.disabled = master === null;
  els.btnDownloadOpen.disabled = false;
  els.btnAddSection.disabled = false;
  els.filename.placeholder = defaultBaseName(state);
  els.btnUndo.disabled = undoStack.length === 0;
  const unsupported = resumeUnsupportedChars(state);
  els.warning.hidden = unsupported.length === 0;
  if (unsupported.length > 0) {
    els.warning.textContent =
      `These characters are outside the standard PDF font set and will not render in the PDF: ${unsupported.join(' ')} . ` +
      'Replace them (for example use "-" or "•" for bullets) before downloading a PDF.';
  }
  saveWorkingCopy(markdown);
}

function masterLabel(m: StoredMaster): string {
  return `Master: ${m.name}`;
}

/** Shown when no resume could be loaded, which is normal for a page opened from disk. */
function showWelcome(): void {
  els.source.textContent = 'No resume loaded';
  els.status.textContent = '';
  els.preview.replaceChildren();
  els.mdOut.value = '';
  els.editor.replaceChildren(
    h(
      'section',
      { class: 'card ed-card ed-welcome' },
      h('div', { class: 'eyebrow', text: 'Get started' }),
      h('h2', { text: 'Open a resume to get started' }),
      h('p', {}, 'Choose a Markdown (.md) resume. A sample, ', h('code', { text: MASTER_FILE }), ', is in the same folder as this page.'),
      h('button', { type: 'button', class: 'btn-primary', 'data-act': 'choose-file' }, 'Choose a resume…'),
    ),
  );
}

function flash(message: string): void {
  els.flash.textContent = message;
  window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => {
    els.flash.textContent = '';
  }, 4000);
}

// ----------------------------------------------------------------- editor

function actionButton(act: string, label: string, ariaLabel: string, disabled = false, extra: Record<string, string> = {}): HTMLButtonElement {
  return h('button', { type: 'button', class: 'btn-ghost ed-btn', 'data-act': act, 'aria-label': ariaLabel, disabled, ...extra }, label);
}

function renderHeaderCard(): HTMLElement {
  const name = h('input', { type: 'text', id: 'fName', class: 'ed-input', autocomplete: 'off' });
  name.value = state.name;
  const contact = h('textarea', { id: 'fContact', class: 'ed-text', rows: '2' });
  contact.value = state.contact;
  return h(
    'section',
    { class: 'card ed-card ed-header' },
    h('div', { class: 'eyebrow', text: 'Header' }),
    h('label', { class: 'ed-label', for: 'fName', text: 'Name' }),
    name,
    h('label', { class: 'ed-label', for: 'fContact', text: 'Contact line' }),
    contact,
    h('div', { class: 'ed-hint', text: 'Separate fields with " | " (the Separator picker chooses how it is shown). Links as [text](https://…). Never put contact details in a header or footer.' }),
  );
}

function renderBlock(block: Block, sectionIndex: number, blockIndex: number, total: number): HTMLElement {
  const label = block.type === 'heading' ? 'Subheading' : block.type === 'list' ? 'List' : 'Paragraph';
  const lower = label.toLowerCase();
  const actions = h(
    'div',
    { class: 'ed-actions' },
    actionButton('block-up', '↑', `Move ${lower} up`, blockIndex === 0),
    actionButton('block-down', '↓', `Move ${lower} down`, blockIndex === total - 1),
    block.type === 'heading'
      ? actionButton('entry-delete', 'Delete entry', 'Delete entry and everything under it', false, { class: 'btn-ghost ed-btn ed-danger' })
      : null,
    actionButton('block-delete', '✕', `Delete ${lower}`, false, { class: 'btn-ghost ed-btn ed-danger' }),
  );
  const head = h('div', { class: 'ed-block-head' }, h('span', { class: 'badge badge-outline', text: label }), actions);

  let field: HTMLInputElement | HTMLTextAreaElement;
  let hint: string;
  if (block.type === 'heading') {
    field = h('input', { type: 'text', class: 'ed-input ed-text-field ed-heading', 'aria-label': 'Subheading text', autocomplete: 'off' });
    field.value = block.text;
    hint = 'A job title or other entry heading. The blocks below it belong to this entry.';
  } else if (block.type === 'list') {
    field = h('textarea', { class: 'ed-text ed-text-field', 'aria-label': 'List items, one per line', rows: '2' });
    field.value = block.items.join('\n');
    hint = 'One bullet per line. **bold**, *italic*, [text](https://…) allowed.';
  } else {
    field = h('textarea', { class: 'ed-text ed-text-field', 'aria-label': 'Paragraph text', rows: '2' });
    field.value = block.text;
    hint = 'Plain text. Use *italic* for an industry descriptor, **bold** for a label.';
  }
  return h('div', { class: 'ed-block', 'data-block': String(blockIndex), 'data-type': block.type }, head, field, h('div', { class: 'ed-hint', text: hint }));
}

function renderBlocks(section: Section, sectionIndex: number): HTMLElement {
  const wrap = h('div', { class: 'ed-blocks' });
  let entry: HTMLElement | null = null;
  section.blocks.forEach((block, blockIndex) => {
    const node = renderBlock(block, sectionIndex, blockIndex, section.blocks.length);
    if (block.type === 'heading') {
      entry = h('div', { class: 'ed-entry' });
      wrap.append(entry);
    }
    (entry ?? wrap).append(node);
  });
  if (section.blocks.length === 0) {
    wrap.append(h('p', { class: 'ed-empty', text: 'No content yet. Add a paragraph, list, subheading, or entry below.' }));
  }
  return wrap;
}

function addBar(): HTMLElement {
  const add = (act: string, label: string): HTMLButtonElement => h('button', { type: 'button', class: 'btn-secondary ed-btn', 'data-act': act }, label);
  return h('div', { class: 'ed-add' }, add('add-paragraph', '+ Paragraph'), add('add-list', '+ List'), add('add-heading', '+ Subheading'), add('add-entry', '+ Entry'));
}

function renderSectionCard(section: Section, sectionIndex: number): HTMLElement {
  const isCollapsed = collapsed.has(section);
  const title = h('input', { type: 'text', class: 'ed-input ed-title', 'aria-label': 'Section title', placeholder: 'Section title', autocomplete: 'off' });
  title.value = section.title;
  const card = h('section', { class: 'card ed-card ed-section', 'data-section': String(sectionIndex), 'data-title': section.title });
  card.append(
    h(
      'div',
      { class: 'ed-section-head' },
      h('span', { class: 'eyebrow', text: 'Section' }),
      title,
      h(
        'div',
        { class: 'ed-actions' },
        actionButton('section-up', '↑', 'Move section up', sectionIndex === 0),
        actionButton('section-down', '↓', 'Move section down', sectionIndex === state.sections.length - 1),
        actionButton('section-toggle', isCollapsed ? 'Expand' : 'Collapse', isCollapsed ? 'Expand section' : 'Collapse section', false, {
          'aria-expanded': String(!isCollapsed),
        }),
        actionButton('section-delete', 'Delete', 'Delete section', false, { class: 'btn-ghost ed-btn ed-danger' }),
      ),
    ),
  );
  if (!isCollapsed) {
    card.append(renderBlocks(section, sectionIndex));
    card.append(addBar());
  }
  return card;
}

function renderEditor(): void {
  const fragment = document.createDocumentFragment();
  fragment.append(renderHeaderCard());
  state.sections.forEach((section, i) => fragment.append(renderSectionCard(section, i)));
  els.editor.replaceChildren(fragment);
  els.editor.querySelectorAll<HTMLTextAreaElement>('textarea.ed-text').forEach(fit);
}

function indexOf(el: Element, kind: 'section' | 'block'): number | null {
  const host = el.closest<HTMLElement>(`[data-${kind}]`);
  const value = host?.dataset[kind];
  return value === undefined ? null : Number(value);
}

function focusLastField(sectionIndex: number): void {
  const fields = els.editor.querySelectorAll<HTMLElement>(`[data-section="${sectionIndex}"] .ed-text-field`);
  fields[fields.length - 1]?.focus();
}

// ----------------------------------------------------------------- events

els.editor.addEventListener('input', (event) => {
  const target = event.target as HTMLElement;
  if (target instanceof HTMLTextAreaElement) fit(target);
  if (target.id === 'fName') {
    commit(M.setName(state, (target as HTMLInputElement).value), { editKey: 'name' });
    return;
  }
  if (target.id === 'fContact') {
    commit(M.setContact(state, (target as HTMLTextAreaElement).value), { editKey: 'contact' });
    return;
  }
  const sectionIndex = indexOf(target, 'section');
  if (sectionIndex === null) return;

  if (target.classList.contains('ed-title')) {
    const value = (target as HTMLInputElement).value;
    const wasCollapsed = collapsed.has(state.sections[sectionIndex]);
    const next = M.renameSection(state, sectionIndex, value);
    if (wasCollapsed) collapsed.add(next.sections[sectionIndex]);
    target.closest<HTMLElement>('.ed-section')?.setAttribute('data-title', value);
    commit(next, { editKey: `title:${sectionIndex}` });
    return;
  }

  const blockIndex = indexOf(target, 'block');
  if (blockIndex === null || !target.classList.contains('ed-text-field')) return;
  const block = state.sections[sectionIndex].blocks[blockIndex];
  const value = (target as HTMLInputElement | HTMLTextAreaElement).value;
  let next: Block;
  if (block.type === 'list') next = { type: 'list', items: value.split('\n').filter((line) => line.trim() !== '') };
  else if (block.type === 'heading') next = { type: 'heading', text: value };
  else next = { type: 'paragraph', text: value };
  commit(M.updateBlock(state, sectionIndex, blockIndex, next), { editKey: `block:${sectionIndex}:${blockIndex}` });
});

els.editor.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
  if (!button) return;
  const act = button.dataset.act ?? '';
  if (act === 'choose-file') {
    els.fileInput.click();
    return;
  }
  const si = indexOf(button, 'section');
  const bi = indexOf(button, 'block');
  if (si === null) return;
  const section = state.sections[si];

  switch (act) {
    case 'section-up':
      commit(M.moveSection(state, si, si - 1), { structural: true });
      break;
    case 'section-down':
      commit(M.moveSection(state, si, si + 1), { structural: true });
      break;
    case 'section-delete':
      commit(M.deleteSection(state, si), { structural: true });
      break;
    case 'section-toggle':
      if (collapsed.has(section)) collapsed.delete(section);
      else collapsed.add(section);
      renderEditor();
      break;
    case 'add-paragraph':
      commit(M.addBlock(state, si, { type: 'paragraph', text: '' }), { structural: true });
      focusLastField(si);
      break;
    case 'add-list':
      commit(M.addBlock(state, si, { type: 'list', items: [] }), { structural: true });
      focusLastField(si);
      break;
    case 'add-heading':
      commit(M.addBlock(state, si, { type: 'heading', text: 'New Subheading' }), { structural: true });
      focusLastField(si);
      break;
    case 'add-entry':
      commit(M.addEntry(state, si, { title: 'New Role', meta: 'Company | City, ST | Mon YYYY - Mon YYYY', bullets: ['New accomplishment'] }), { structural: true });
      focusLastField(si);
      break;
    case 'block-up':
      if (bi !== null) commit(M.moveBlock(state, si, bi, bi - 1), { structural: true });
      break;
    case 'block-down':
      if (bi !== null) commit(M.moveBlock(state, si, bi, bi + 1), { structural: true });
      break;
    case 'block-delete':
      if (bi !== null) commit(M.deleteBlock(state, si, bi), { structural: true });
      break;
    case 'entry-delete':
      if (bi !== null) commit(M.deleteEntry(state, si, bi), { structural: true });
      break;
    default:
      break;
  }
});

els.btnAddSection.addEventListener('click', () => {
  commit(M.addSection(state), { structural: true });
  const titles = els.editor.querySelectorAll<HTMLInputElement>('.ed-title');
  titles[titles.length - 1]?.focus();
});

function currentFormat(): OutputFormat {
  return els.format.value === 'pdf' ? 'pdf' : 'md';
}

/** The extension label follows the format; the margin choice only applies to PDF, so it hides otherwise. */
function updateFormatControls(): void {
  const format = currentFormat();
  els.ext.textContent = formatInfo(format).extension;
  for (const field of els.marginFields) field.hidden = format !== 'pdf';
}

els.format.addEventListener('change', updateFormatControls);

// PDF margins. The presets live in the PDF module; the choice persists in this browser.
const MARGIN_PREF_KEY = 'rezoom.pdfMargin';

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

for (const preset of MARGIN_PRESETS) els.margin.append(h('option', { value: preset.id, text: preset.label }));
els.margin.value = marginPreset(readPref(MARGIN_PREF_KEY)).id;
els.margin.addEventListener('change', () => writePref(MARGIN_PREF_KEY, marginPreset(els.margin.value).id));

// Field separator. A display choice for the preview and the PDF only: the Markdown
// (and so the working copy and the master) always keeps " | ". Persists in this browser.
const SEPARATOR_PREF_KEY = 'rezoom.separator';

function currentSeparator(): SeparatorPreset {
  return separatorPreset(els.separator.value);
}

for (const preset of SEPARATOR_PRESETS) els.separator.append(h('option', { value: preset.id, text: preset.label }));
els.separator.value = separatorPreset(readPref(SEPARATOR_PREF_KEY)).id;
els.separator.addEventListener('change', () => {
  writePref(SEPARATOR_PREF_KEY, currentSeparator().id);
  refresh();
});

// Download dialog. The toolbar button opens it; submitting the form (the Download
// button, or Enter in the file name) builds the file and closes it (method="dialog").
// Cancel and Escape close it without downloading. The choices inside persist as above.
els.btnDownloadOpen.addEventListener('click', () => {
  if (typeof els.downloadDialog.showModal === 'function') els.downloadDialog.showModal();
  else els.downloadDialog.setAttribute('open', '');
});

els.btnDownloadCancel.addEventListener('click', () => els.downloadDialog.close());

els.downloadForm.addEventListener('submit', () => {
  const file = buildFile(state, currentFormat(), els.filename.value, {
    margin: marginPreset(els.margin.value).points,
    separator: currentSeparator().glyph,
  });
  downloadBlob(file.blob, file.filename);
  flash(`Downloaded ${file.filename}`);
});

els.btnUndo.addEventListener('click', undo);

els.btnReset.addEventListener('click', () => {
  if (!master) return;
  pushUndo();
  clearWorkingCopy();
  loadMarkdown(master.markdown, masterLabel(master));
  flash('Reset to master');
});

els.btnOpen.addEventListener('click', () => els.fileInput.click());

els.fileInput.addEventListener('change', async () => {
  const file = els.fileInput.files?.[0];
  if (!file) return;
  const text = await file.text();
  if (loaded) pushUndo();
  // The chosen file becomes the master that Reset returns to, here and after a reload.
  master = { name: file.name, markdown: text, origin: 'picked' };
  saveMaster(master);
  loadMarkdown(text, masterLabel(master));
  flash(`Opened ${file.name}`);
  els.fileInput.value = '';
});

function selectTab(which: 'preview' | 'markdown'): void {
  const preview = which === 'preview';
  els.tabPreview.setAttribute('aria-selected', String(preview));
  els.tabMarkdown.setAttribute('aria-selected', String(!preview));
  els.previewPanel.hidden = !preview;
  els.markdownPanel.hidden = preview;
}

els.tabPreview.addEventListener('click', () => selectTab('preview'));
els.tabMarkdown.addEventListener('click', () => selectTab('markdown'));

// ------------------------------------------------------------------- init

/** Fetches the master shipped beside the page and remembers it, or null when it cannot be read. */
async function loadShippedMaster(): Promise<StoredMaster | null> {
  const markdown = await fetchShippedMaster(MASTER_FILE);
  if (markdown === null) return null;
  const shipped: StoredMaster = { name: MASTER_FILE, markdown, origin: 'shipped' };
  saveMaster(shipped);
  return shipped;
}

/**
 * A master the user picked stays the master. Otherwise the shipped file is
 * fetched fresh, so edits to it show up, falling back to the copy stored the
 * last time it could be read (a page opened from disk cannot fetch it). The
 * working copy, when there is one, is restored on top.
 */
async function init(): Promise<void> {
  updateFormatControls();
  const stored = loadMaster();
  const found = stored?.origin === 'picked' ? stored : ((await loadShippedMaster()) ?? stored);
  // The user may have picked a file while the fetch was in flight; that choice wins.
  if (loaded) return;
  master = found;
  const saved = loadWorkingCopy();
  if (saved !== null && saved !== master?.markdown) {
    const from = master ? ` · master: ${master.name}` : '';
    loadMarkdown(saved, `Working copy (restored from this browser)${from}`);
  } else if (master) {
    loadMarkdown(master.markdown, masterLabel(master));
  } else {
    showWelcome();
  }
}

void init();
