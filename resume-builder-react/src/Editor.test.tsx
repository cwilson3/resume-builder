import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderEditor } from './test-utils/renderEditor';

function card(title: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`.ed-section[data-title="${title}"]`);
  if (!el) throw new Error(`No section card titled ${title}`);
  return el;
}

function fieldOf(block: Element): HTMLInputElement | HTMLTextAreaElement {
  const field = block.querySelector<HTMLInputElement | HTMLTextAreaElement>('.ed-text-field');
  if (!field) throw new Error('Block has no text field');
  return field;
}

/** Each block of a section as `type:text`, in editor order. */
function blocks(title: string): string[] {
  return Array.from(card(title).querySelectorAll<HTMLElement>('.ed-block'), (el) => `${el.dataset.type}:${fieldOf(el).value}`);
}

/** The block in a section whose field holds `text`. */
function block(title: string, text: string): HTMLElement {
  const found = Array.from(card(title).querySelectorAll<HTMLElement>('.ed-block')).find((el) => fieldOf(el).value === text);
  if (!found) throw new Error(`No block holding ${JSON.stringify(text)} in ${title}`);
  return found;
}

function sectionTitles(): string[] {
  return screen.getAllByRole('textbox', { name: 'Section title' }).map((el) => (el as HTMLInputElement).value);
}

const EXPERIENCE = [
  'paragraph:Intro paragraph.',
  'heading:Role A',
  'paragraph:Company A | City, ST | 2020',
  'list:A1\nA2',
  'heading:Role B',
  'paragraph:Company B | City, ST | 2021',
  'list:B1',
];

describe('Editor: sections', () => {
  it('moves a section down', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(within(card('Experience')).getByRole('button', { name: 'Move section down' }));

    expect(sectionTitles()).toEqual(['Skills', 'Experience']);
  });

  it('moves a section up', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(within(card('Skills')).getByRole('button', { name: 'Move section up' }));

    expect(sectionTitles()).toEqual(['Skills', 'Experience']);
  });

  it('disables moving the first section up and the last section down', () => {
    renderEditor();
    const button = (title: string, name: string) => within(card(title)).getByRole('button', { name }) as HTMLButtonElement;

    const disabled = {
      firstUp: button('Experience', 'Move section up').disabled,
      firstDown: button('Experience', 'Move section down').disabled,
      lastUp: button('Skills', 'Move section up').disabled,
      lastDown: button('Skills', 'Move section down').disabled,
    };

    expect(disabled).toEqual({ firstUp: true, firstDown: false, lastUp: false, lastDown: true });
  });

  it('deletes a section', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(within(card('Experience')).getByRole('button', { name: 'Delete section' }));

    expect(sectionTitles()).toEqual(['Skills']);
  });

  it('collapsing a section hides its blocks and its add buttons', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(within(card('Experience')).getByRole('button', { name: 'Collapse section' }));

    const toggle = within(card('Experience')).getByRole('button', { name: 'Expand section' });
    expect({
      blocks: blocks('Experience').length,
      addButtons: within(card('Experience')).queryAllByRole('button', { name: /^\+ / }).length,
      label: toggle.textContent,
      expanded: toggle.getAttribute('aria-expanded'),
    }).toEqual({ blocks: 0, addButtons: 0, label: 'Expand', expanded: 'false' });
  });

  it('expanding a collapsed section shows its blocks again', async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(within(card('Experience')).getByRole('button', { name: 'Collapse section' }));

    await user.click(within(card('Experience')).getByRole('button', { name: 'Expand section' }));

    expect(blocks('Experience')).toEqual(EXPERIENCE);
  });

  it('keeps a collapsed section collapsed when it is renamed', async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(within(card('Experience')).getByRole('button', { name: 'Collapse section' }));

    await user.type(within(card('Experience')).getByRole('textbox', { name: 'Section title' }), 's');

    expect(blocks('Experiences')).toEqual([]);
  });

  it('+ Add section appends a New Section and focuses its title', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole('button', { name: '+ Add section' }));

    expect({ titles: sectionTitles(), focused: document.activeElement === within(card('New Section')).getByRole('textbox', { name: 'Section title' }) }).toEqual({
      titles: ['Experience', 'Skills', 'New Section'],
      focused: true,
    });
  });
});

describe('Editor: adding blocks', () => {
  it.each([
    ['+ Paragraph', 'paragraph:'],
    ['+ List', 'list:'],
    ['+ Subheading', 'heading:New Subheading'],
  ])('%s appends the new block to the section and focuses it', async (name, added) => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(within(card('Skills')).getByRole('button', { name }));

    const last = card('Skills').querySelectorAll('.ed-block')[1];
    expect({ blocks: blocks('Skills'), focused: document.activeElement === fieldOf(last) }).toEqual({ blocks: ['list:Skill 1', added], focused: true });
  });

  it('+ Entry appends a heading, a meta line, and a bullet, and focuses the bullet', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(within(card('Skills')).getByRole('button', { name: '+ Entry' }));

    expect({ blocks: blocks('Skills'), focused: document.activeElement === fieldOf(block('Skills', 'New accomplishment')) }).toEqual({
      blocks: ['list:Skill 1', 'heading:New Role', 'paragraph:Company | City, ST | Mon YYYY - Mon YYYY', 'list:New accomplishment'],
      focused: true,
    });
  });
});

describe('Editor: deleting and moving blocks', () => {
  it('Delete entry removes the heading and every block under it, and nothing else', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(within(block('Experience', 'Role A')).getByRole('button', { name: 'Delete entry and everything under it' }));

    expect(blocks('Experience')).toEqual(['paragraph:Intro paragraph.', 'heading:Role B', 'paragraph:Company B | City, ST | 2021', 'list:B1']);
  });

  it('deleting a block removes only that block', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(within(block('Experience', 'Company A | City, ST | 2020')).getByRole('button', { name: 'Delete paragraph' }));

    expect(blocks('Experience')).toEqual(EXPERIENCE.filter((b) => b !== 'paragraph:Company A | City, ST | 2020'));
  });

  it('moving a block down swaps it with the block below', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(within(block('Experience', 'Company A | City, ST | 2020')).getByRole('button', { name: 'Move paragraph down' }));

    expect(blocks('Experience')).toEqual([EXPERIENCE[0], EXPERIENCE[1], EXPERIENCE[3], EXPERIENCE[2], ...EXPERIENCE.slice(4)]);
  });

  it('disables moving the first block up and the last block down', () => {
    renderEditor();

    expect({
      firstUp: (within(block('Experience', 'Intro paragraph.')).getByRole('button', { name: 'Move paragraph up' }) as HTMLButtonElement).disabled,
      lastDown: (within(block('Experience', 'B1')).getByRole('button', { name: 'Move list down' }) as HTMLButtonElement).disabled,
    }).toEqual({ firstUp: true, lastDown: true });
  });

  it('keeps focus on the move button when a block moves inside its entry', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(within(block('Experience', 'A1\nA2')).getByRole('button', { name: 'Move list up' }));

    expect(document.activeElement).toBe(within(block('Experience', 'A1\nA2')).getByRole('button', { name: 'Move list up' }));
  });

  it('keeps focus on the move button when a block moves into the previous entry', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(within(block('Experience', 'Company B | City, ST | 2021')).getByRole('button', { name: 'Move paragraph up' }));

    expect(document.activeElement).toBe(within(block('Experience', 'Company B | City, ST | 2021')).getByRole('button', { name: 'Move paragraph up' }));
  });

  it('moves focus to the block field when the block reaches the top and its up button disables', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(within(block('Experience', 'Role A')).getByRole('button', { name: 'Move subheading up' }));

    expect(document.activeElement).toBe(fieldOf(block('Experience', 'Role A')));
  });

  it('keeps a half-typed bullet in a list when a neighboring block is deleted', async () => {
    const user = userEvent.setup();
    renderEditor();
    const list = fieldOf(block('Experience', 'A1\nA2'));
    await user.type(list, '{Enter}', { initialSelectionStart: list.value.length, initialSelectionEnd: list.value.length });

    await user.click(within(block('Experience', 'Company A | City, ST | 2020')).getByRole('button', { name: 'Delete paragraph' }));

    expect(blocks('Experience')).toEqual([EXPERIENCE[0], EXPERIENCE[1], 'list:A1\nA2\n', ...EXPERIENCE.slice(4)]);
  });
});
