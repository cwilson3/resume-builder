import { describe, expect, it } from 'vitest';
import {
  addBlock,
  addEntry,
  addSection,
  allText,
  cloneResume,
  countWords,
  createEmptyResume,
  deleteBlock,
  deleteEntry,
  deleteSection,
  entryRange,
  moveBlock,
  moveSection,
  renameSection,
  setContact,
  setName,
  stats,
  updateBlock,
  type Resume,
} from './model';

function fixture(): Resume {
  return {
    name: 'Jane',
    contact: 'c',
    sections: [
      { title: 'A', blocks: [{ type: 'paragraph', text: 'p' }] },
      {
        title: 'B',
        blocks: [
          { type: 'heading', text: 'Role 1' },
          { type: 'paragraph', text: 'meta 1' },
          { type: 'list', items: ['x', 'y'] },
          { type: 'heading', text: 'Role 2' },
          { type: 'list', items: ['z'] },
        ],
      },
    ],
  };
}

describe('immutability', () => {
  it('never mutates the input resume', () => {
    const original = fixture();
    const snapshot = structuredClone(original);
    setName(original, 'X');
    setContact(original, 'X');
    addSection(original, 'S');
    deleteSection(original, 0);
    moveSection(original, 0, 1);
    renameSection(original, 0, 'R');
    addBlock(original, 0, { type: 'paragraph', text: 'n' });
    deleteBlock(original, 1, 0);
    moveBlock(original, 1, 0, 1);
    updateBlock(original, 0, 0, { type: 'paragraph', text: 'u' });
    deleteEntry(original, 1, 0);
    addEntry(original, 1, { title: 'T' });
    expect(original).toEqual(snapshot);
  });

  it('cloneResume returns a deep copy', () => {
    const a = fixture();
    const b = cloneResume(a);
    expect(b).toEqual(a);
    expect(b).not.toBe(a);
    expect(b.sections[1].blocks).not.toBe(a.sections[1].blocks);
  });
});

describe('header', () => {
  it('sets name and contact', () => {
    expect(setName(fixture(), 'Z').name).toBe('Z');
    expect(setContact(fixture(), 'Z').contact).toBe('Z');
  });
});

describe('sections', () => {
  it('adds a section at the end by default, or at an index', () => {
    expect(addSection(fixture()).sections.map((s) => s.title)).toEqual(['A', 'B', 'New Section']);
    expect(addSection(fixture(), 'S', 0).sections.map((s) => s.title)).toEqual(['S', 'A', 'B']);
    expect(addSection(fixture(), 'S', 99).sections.map((s) => s.title)).toEqual(['A', 'B', 'S']);
  });

  it('deletes a section and ignores out-of-range indexes', () => {
    expect(deleteSection(fixture(), 0).sections.map((s) => s.title)).toEqual(['B']);
    expect(deleteSection(fixture(), 5)).toEqual(fixture());
    expect(deleteSection(fixture(), -1)).toEqual(fixture());
  });

  it('moves a section and clamps the target', () => {
    expect(moveSection(fixture(), 1, 0).sections.map((s) => s.title)).toEqual(['B', 'A']);
    expect(moveSection(fixture(), 0, 99).sections.map((s) => s.title)).toEqual(['B', 'A']);
    expect(moveSection(fixture(), 9, 0)).toEqual(fixture());
  });

  it('renames a section', () => {
    expect(renameSection(fixture(), 1, 'Work').sections[1].title).toBe('Work');
    expect(renameSection(fixture(), 7, 'Work')).toEqual(fixture());
  });
});

describe('blocks', () => {
  it('adds a block at the end or at an index', () => {
    const r = addBlock(fixture(), 0, { type: 'list', items: ['i'] });
    expect(r.sections[0].blocks).toHaveLength(2);
    expect(r.sections[0].blocks[1]).toEqual({ type: 'list', items: ['i'] });
    const r2 = addBlock(fixture(), 0, { type: 'heading', text: 'h' }, 0);
    expect(r2.sections[0].blocks[0]).toEqual({ type: 'heading', text: 'h' });
  });

  it('deletes, moves and updates a block', () => {
    expect(deleteBlock(fixture(), 1, 1).sections[1].blocks.map((b) => b.type)).toEqual(['heading', 'list', 'heading', 'list']);
    expect(moveBlock(fixture(), 1, 2, 1).sections[1].blocks.map((b) => b.type)).toEqual(['heading', 'list', 'paragraph', 'heading', 'list']);
    expect(updateBlock(fixture(), 0, 0, { type: 'paragraph', text: 'new' }).sections[0].blocks[0]).toEqual({ type: 'paragraph', text: 'new' });
  });

  it('ignores a bad section index', () => {
    expect(addBlock(fixture(), 9, { type: 'paragraph', text: 'p' })).toEqual(fixture());
  });
});

describe('entries', () => {
  it('computes the range of an entry up to the next heading', () => {
    const section = fixture().sections[1];
    expect(entryRange(section, 0)).toEqual([0, 3]);
    expect(entryRange(section, 3)).toEqual([3, 5]);
  });

  it('returns null when the index is not a heading', () => {
    const section = fixture().sections[1];
    expect(entryRange(section, 1)).toBeNull();
    expect(entryRange(section, 42)).toBeNull();
  });

  it('deletes a whole entry (heading + following blocks)', () => {
    const r = deleteEntry(fixture(), 1, 0);
    expect(r.sections[1].blocks).toEqual([
      { type: 'heading', text: 'Role 2' },
      { type: 'list', items: ['z'] },
    ]);
  });

  it('deleteEntry is a no-op for a non-heading or a missing section', () => {
    expect(deleteEntry(fixture(), 1, 1)).toEqual(fixture());
    expect(deleteEntry(fixture(), 9, 0)).toEqual(fixture());
  });

  it('adds a full entry with meta, italic descriptor and bullets', () => {
    const r = addEntry(fixture(), 1, { title: 'T', meta: 'M', descriptor: 'D', bullets: ['b1'] }, 0);
    expect(r.sections[1].blocks.slice(0, 4)).toEqual([
      { type: 'heading', text: 'T' },
      { type: 'paragraph', text: 'M' },
      { type: 'paragraph', text: '*D*' },
      { type: 'list', items: ['b1'] },
    ]);
  });

  it('adds a minimal entry with a placeholder bullet at the end', () => {
    const r = addEntry(fixture(), 1, { title: 'T' });
    const blocks = r.sections[1].blocks;
    expect(blocks.slice(-2)).toEqual([
      { type: 'heading', text: 'T' },
      { type: 'list', items: ['New accomplishment'] },
    ]);
  });
});

describe('stats', () => {
  it('collects all text in document order', () => {
    expect(allText(fixture())).toEqual(['Jane', 'c', 'A', 'p', 'B', 'Role 1', 'meta 1', 'x', 'y', 'Role 2', 'z']);
  });

  it('counts words', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
    expect(countWords('one  two\nthree')).toBe(3);
  });

  it('summarizes the resume', () => {
    expect(stats(fixture())).toEqual({ words: 14, sections: 2, blocks: 6, bullets: 3 });
    expect(stats(createEmptyResume())).toEqual({ words: 0, sections: 0, blocks: 0, bullets: 0 });
  });
});
