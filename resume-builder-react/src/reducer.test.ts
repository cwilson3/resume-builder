import { describe, expect, it } from 'vitest';
import { serializeResume } from '@core/serialize';
import { editorReducer, initEditor, UNDO_LIMIT, type Action, type EditorState } from './reducer';

const DOC = `# Jane Doe

City | jane@example.com

## Summary

Builds things.

## Experience

### Role One

Company | City | 2020 - 2024

- First
- Second

### Role Two

- Third
`;

function start(): EditorState {
  return initEditor(DOC, 'Master: test.md');
}

function run(state: EditorState, ...actions: Action[]): EditorState {
  return actions.reduce(editorReducer, state);
}

/** Every id in the table, in document order. */
function allIds(state: EditorState): number[] {
  return [...state.ids.sections, ...state.ids.blocks.flat()];
}

/** Block counts per section, from the id table and from the resume; equal when the table is in step. */
function idShape(state: EditorState): number[] {
  return [state.ids.sections.length, ...state.ids.blocks.map((list) => list.length)];
}

function resumeShape(state: EditorState): number[] {
  return [state.resume.sections.length, ...state.resume.sections.map((s) => s.blocks.length)];
}

describe('initEditor', () => {
  it('parses the markdown into the resume', () => {
    const state = start();

    expect(serializeResume(state.resume)).toBe(DOC);
  });

  it('gives every section and block a unique id', () => {
    const state = start();

    expect(new Set(allIds(state)).size).toBe(2 + 1 + 5);
  });

  it('starts with an empty undo stack and settles at once', () => {
    const state = start();

    expect({ undo: state.undo.length, settle: state.settle, source: state.source }).toEqual({ undo: 0, settle: 'now', source: 'Master: test.md' });
  });
});

describe('text edits', () => {
  it('setName changes the name and asks for a debounced settle', () => {
    const state = run(start(), { type: 'setName', value: 'Janet' });

    expect({ name: state.resume.name, settle: state.settle }).toEqual({ name: 'Janet', settle: 'debounced' });
  });

  it('setContact changes the contact line', () => {
    const state = run(start(), { type: 'setContact', value: 'Elsewhere' });

    expect(state.resume.contact).toBe('Elsewhere');
  });

  it('renameSection changes only that section title', () => {
    const state = run(start(), { type: 'renameSection', si: 1, title: 'Work' });

    expect(state.resume.sections.map((s) => s.title)).toEqual(['Summary', 'Work']);
  });

  it('updateBlock replaces the block and keeps its id', () => {
    const before = start();

    const after = run(before, { type: 'updateBlock', si: 1, bi: 2, block: { type: 'list', items: ['Changed'] } });

    expect({ block: after.resume.sections[1].blocks[2], ids: after.ids }).toEqual({ block: { type: 'list', items: ['Changed'] }, ids: before.ids });
  });

  it('updateBlock out of range leaves the state untouched', () => {
    const before = start();

    const after = run(before, { type: 'updateBlock', si: 1, bi: 99, block: { type: 'paragraph', text: 'x' } });

    expect(after).toBe(before);
  });

  it('consecutive edits to the same field share one undo step', () => {
    const state = run(start(), { type: 'setName', value: 'J' }, { type: 'setName', value: 'Ja' }, { type: 'setName', value: 'Jan' });

    expect(state.undo).toHaveLength(1);
  });

  it('an edit to a different field starts a new undo step', () => {
    const state = run(start(), { type: 'setName', value: 'J' }, { type: 'setContact', value: 'c' }, { type: 'setName', value: 'Ja' });

    expect(state.undo).toHaveLength(3);
  });

  it('edits to two different blocks are separate undo steps', () => {
    const state = run(
      start(),
      { type: 'updateBlock', si: 1, bi: 2, block: { type: 'list', items: ['a'] } },
      { type: 'updateBlock', si: 1, bi: 4, block: { type: 'list', items: ['b'] } },
    );

    expect(state.undo).toHaveLength(2);
  });
});

describe('structural edits', () => {
  it('addSection appends a section with a fresh id and no blocks', () => {
    const before = start();

    const after = run(before, { type: 'addSection' });

    expect({ title: after.resume.sections[2].title, ids: after.ids.blocks[2], fresh: !allIds(before).includes(after.ids.sections[2]) }).toEqual({
      title: 'New Section',
      ids: [],
      fresh: true,
    });
  });

  it('deleteSection removes the section and its ids', () => {
    const before = start();

    const after = run(before, { type: 'deleteSection', si: 0 });

    expect(after.ids).toEqual({ sections: [before.ids.sections[1]], blocks: [before.ids.blocks[1]] });
  });

  it('deleteSection out of range leaves the state untouched', () => {
    const before = start();

    expect(run(before, { type: 'deleteSection', si: 5 })).toBe(before);
  });

  it('moveSection moves the section ids and their block ids together', () => {
    const before = start();

    const after = run(before, { type: 'moveSection', si: 1, to: 0 });

    expect(after.ids).toEqual({ sections: [before.ids.sections[1], before.ids.sections[0]], blocks: [before.ids.blocks[1], before.ids.blocks[0]] });
  });

  it('moveSection past the end clamps like the model', () => {
    const before = start();

    const after = run(before, { type: 'moveSection', si: 0, to: 9 });

    expect(after.resume.sections.map((s) => s.title)).toEqual(['Experience', 'Summary']);
  });

  it('addBlock appends the block with a fresh id', () => {
    const before = start();

    const after = run(before, { type: 'addBlock', si: 0, block: { type: 'paragraph', text: '' } });

    expect(after.ids.blocks[0]).toEqual([before.ids.blocks[0][0], before.nextId]);
  });

  it('addBlock to a missing section leaves the state untouched', () => {
    const before = start();

    expect(run(before, { type: 'addBlock', si: 7, block: { type: 'paragraph', text: '' } })).toBe(before);
  });

  it('deleteBlock removes exactly that block id', () => {
    const before = start();
    const [h1, , list1, h2, list2] = before.ids.blocks[1];

    const after = run(before, { type: 'deleteBlock', si: 1, bi: 1 });

    expect(after.ids.blocks[1]).toEqual([h1, list1, h2, list2]);
  });

  it('moveBlock moves the id with its block', () => {
    const before = start();
    const [h1, meta, list1, h2, list2] = before.ids.blocks[1];

    const after = run(before, { type: 'moveBlock', si: 1, bi: 2, to: 1 });

    expect(after.ids.blocks[1]).toEqual([h1, list1, meta, h2, list2]);
  });

  it('moveBlock keeps each id paired with the same block text', () => {
    const before = start();
    const idOfFirst = before.ids.blocks[1][2];

    const after = run(before, { type: 'moveBlock', si: 1, bi: 2, to: 4 });

    expect(after.resume.sections[1].blocks[after.ids.blocks[1].indexOf(idOfFirst)]).toEqual({ type: 'list', items: ['First', 'Second'] });
  });

  it('moveBlock with a source out of range keeps the id table', () => {
    const before = start();

    const after = run(before, { type: 'moveBlock', si: 1, bi: 9, to: 0 });

    expect(after.ids).toEqual(before.ids);
  });

  it('addEntry inserts one fresh id per inserted block', () => {
    const before = start();

    const after = run(before, { type: 'addEntry', si: 1 });

    expect(after.ids.blocks[1].slice(5)).toEqual([before.nextId, before.nextId + 1, before.nextId + 2]);
  });

  it('addEntry inserts New Role, its meta line, and one bullet', () => {
    const after = run(start(), { type: 'addEntry', si: 1 });

    expect(after.resume.sections[1].blocks.slice(5)).toEqual([
      { type: 'heading', text: 'New Role' },
      { type: 'paragraph', text: 'Company | City, ST | Mon YYYY - Mon YYYY' },
      { type: 'list', items: ['New accomplishment'] },
    ]);
  });

  it('addEntry to a missing section leaves the state untouched', () => {
    const before = start();

    expect(run(before, { type: 'addEntry', si: 4 })).toBe(before);
  });

  it('deleteEntry removes the heading and the ids of every block under it', () => {
    const before = start();
    const [, , , h2, list2] = before.ids.blocks[1];

    const after = run(before, { type: 'deleteEntry', si: 1, bi: 0 });

    expect(after.ids.blocks[1]).toEqual([h2, list2]);
  });

  it('deleteEntry on a block that is not a heading leaves the state untouched', () => {
    const before = start();

    expect(run(before, { type: 'deleteEntry', si: 1, bi: 1 })).toBe(before);
  });

  it('deleteEntry on a missing section leaves the state untouched', () => {
    const before = start();

    expect(run(before, { type: 'deleteEntry', si: 3, bi: 0 })).toBe(before);
  });

  it('a structural edit settles at once and pushes an undo step', () => {
    const state = run(start(), { type: 'setName', value: 'X' }, { type: 'addSection' });

    expect({ settle: state.settle, undo: state.undo.length }).toEqual({ settle: 'now', undo: 2 });
  });

  it('typing after a structural edit is a new undo step even in the same field', () => {
    const state = run(start(), { type: 'setName', value: 'X' }, { type: 'addSection' }, { type: 'setName', value: 'XY' });

    expect(state.undo).toHaveLength(3);
  });

  it('keeps the id table the same shape as the resume after every kind of action', () => {
    const state = run(
      start(),
      { type: 'addSection' },
      { type: 'addBlock', si: 2, block: { type: 'list', items: [] } },
      { type: 'addEntry', si: 2 },
      { type: 'moveSection', si: 2, to: 0 },
      { type: 'moveBlock', si: 0, bi: 0, to: 3 },
      { type: 'deleteEntry', si: 2, bi: 3 },
      { type: 'deleteBlock', si: 1, bi: 0 },
      { type: 'deleteSection', si: 1 },
      { type: 'undo' },
    );

    expect(idShape(state)).toEqual(resumeShape(state));
  });

  it('never reuses an id after deletes and adds', () => {
    const state = run(start(), { type: 'deleteSection', si: 0 }, { type: 'addSection' }, { type: 'addEntry', si: 1 }, { type: 'deleteBlock', si: 0, bi: 0 }, { type: 'addBlock', si: 0, block: { type: 'paragraph', text: '' } });

    const ids = allIds(state);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('undo', () => {
  it('restores the previous resume and id table', () => {
    const before = start();

    const after = run(before, { type: 'deleteSection', si: 0 }, { type: 'undo' });

    expect({ resume: after.resume, ids: after.ids }).toEqual({ resume: before.resume, ids: before.ids });
  });

  it('undoes a run of keystrokes in one step', () => {
    const before = start();

    const after = run(before, { type: 'setName', value: 'J' }, { type: 'setName', value: 'Jo' }, { type: 'undo' });

    expect(after.resume.name).toBe('Jane Doe');
  });

  it('undoes mixed operations in reverse order', () => {
    const before = start();
    const edited = run(before, { type: 'deleteBlock', si: 1, bi: 1 }, { type: 'updateBlock', si: 0, bi: 0, block: { type: 'paragraph', text: 'Changed' } });

    const once = run(edited, { type: 'undo' });
    const twice = run(once, { type: 'undo' });

    expect([once.resume.sections[0].blocks[0], twice.resume]).toEqual([{ type: 'paragraph', text: 'Builds things.' }, before.resume]);
  });

  it('with nothing to undo leaves the state untouched', () => {
    const before = start();

    expect(run(before, { type: 'undo' })).toBe(before);
  });

  it('starts a new undo step for the next keystroke in the same field', () => {
    const state = run(start(), { type: 'setName', value: 'A' }, { type: 'setContact', value: 'c' }, { type: 'undo' }, { type: 'setName', value: 'AB' });

    expect(state.undo).toHaveLength(2);
  });

  it('keeps at most the last UNDO_LIMIT steps', () => {
    const actions: Action[] = Array.from({ length: UNDO_LIMIT + 5 }, () => ({ type: 'addSection' }));

    const state = run(start(), ...actions);

    expect(state.undo).toHaveLength(UNDO_LIMIT);
  });

  it('drops the oldest step when the cap is reached', () => {
    const actions: Action[] = Array.from({ length: UNDO_LIMIT + 1 }, () => ({ type: 'addSection' }));

    const state = run(start(), ...actions);

    expect(state.undo[0].resume.sections).toHaveLength(3);
  });
});

describe('load', () => {
  const OTHER = '# Someone Else\n\nElsewhere\n\n## Skills\n\n- Typing\n';

  it('replaces the resume and the source label', () => {
    const state = run(start(), { type: 'load', markdown: OTHER, source: 'File: other.md', pushUndo: true });

    expect({ md: serializeResume(state.resume), source: state.source }).toEqual({ md: OTHER, source: 'File: other.md' });
  });

  it('with pushUndo can be undone back to the previous document', () => {
    const before = start();

    const after = run(before, { type: 'load', markdown: OTHER, source: 'x', pushUndo: true }, { type: 'undo' });

    expect(after.resume).toEqual(before.resume);
  });

  it('without pushUndo leaves the undo stack alone', () => {
    const edited = run(start(), { type: 'addSection' });

    const after = run(edited, { type: 'load', markdown: OTHER, source: 'x', pushUndo: false });

    expect(after.undo).toBe(edited.undo);
  });

  it('assigns ids that do not reuse any id from the previous document', () => {
    const before = start();

    const after = run(before, { type: 'load', markdown: DOC, source: 'x', pushUndo: false });

    expect(allIds(after).filter((id) => allIds(before).includes(id))).toEqual([]);
  });

  it('settles at once', () => {
    const state = run(start(), { type: 'setName', value: 'X' }, { type: 'load', markdown: OTHER, source: 'x', pushUndo: false });

    expect(state.settle).toBe('now');
  });

  it('resets the edit key, so the next keystroke in the same field is a new undo step', () => {
    const state = run(start(), { type: 'setName', value: 'X' }, { type: 'load', markdown: OTHER, source: 'x', pushUndo: true }, { type: 'setName', value: 'XY' });

    expect(state.undo).toHaveLength(3);
  });
});
