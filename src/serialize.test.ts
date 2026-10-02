import { describe, expect, it } from 'vitest';
import { parseResume } from './parse';
import { serializeBlock, serializeResume } from './serialize';
import { masterMarkdown } from './test-utils/master-fixture';
import type { Resume } from './model';

describe('serializeResume', () => {
  it('round-trips the master document byte for byte', () => {
    expect(serializeResume(parseResume(masterMarkdown))).toBe(masterMarkdown);
  });

  it('round-trips a synthetic document', () => {
    const md = '# N\n\nc1\n\nc2\n\n## S\n\n### H\n\nmeta\n\n*desc*\n\n- a\n- b\n\n## T\n\npara\nwrapped\n';
    expect(serializeResume(parseResume(md))).toBe(md);
  });

  it('emits the expected shape and a single trailing newline', () => {
    const r: Resume = {
      name: 'N',
      contact: 'c',
      sections: [{ title: 'S', blocks: [{ type: 'list', items: ['a'] }] }],
    };
    expect(serializeResume(r)).toBe('# N\n\nc\n\n## S\n\n- a\n');
  });

  it('omits an empty contact and empty blocks and items', () => {
    const r: Resume = {
      name: 'N',
      contact: '  ',
      sections: [
        {
          title: 'S',
          blocks: [
            { type: 'paragraph', text: '' },
            { type: 'heading', text: '   ' },
            { type: 'list', items: ['', 'kept', '  '] },
          ],
        },
      ],
    };
    expect(serializeResume(r)).toBe('# N\n\n## S\n\n- kept\n');
  });

  it('keeps a section with no blocks as a bare heading', () => {
    const r: Resume = { name: 'N', contact: '', sections: [{ title: 'Empty', blocks: [] }] };
    expect(serializeResume(r)).toBe('# N\n\n## Empty\n');
  });
});

describe('serializeBlock', () => {
  it('serializes each block type', () => {
    expect(serializeBlock({ type: 'heading', text: 'H' })).toBe('### H');
    expect(serializeBlock({ type: 'paragraph', text: 'p' })).toBe('p');
    expect(serializeBlock({ type: 'list', items: ['a', 'b'] })).toBe('- a\n- b');
  });
});
