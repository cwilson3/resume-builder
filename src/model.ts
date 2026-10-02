/**
 * Resume data model and the pure operations the builder UI performs on it.
 *
 * Every operation returns a new Resume and leaves its input untouched, so the
 * master (superset) document can never be modified by accident: the UI holds a
 * working copy produced by these functions and the master string is read-only.
 */

export interface ParagraphBlock {
  type: 'paragraph';
  /** Inline Markdown allowed (bold, italic, links). Hard-wrapped lines are kept with '\n'. */
  text: string;
}

export interface ListBlock {
  type: 'list';
  /** One bullet per item. Inline Markdown allowed. */
  items: string[];
}

export interface HeadingBlock {
  type: 'heading';
  /** Rendered as a level-3 heading (###). Starts an "entry" such as a job. */
  text: string;
}

export type Block = ParagraphBlock | ListBlock | HeadingBlock;
export type BlockType = Block['type'];

export interface Section {
  /** Rendered as a level-2 heading (##). */
  title: string;
  blocks: Block[];
}

export interface Resume {
  /** Rendered as the single level-1 heading (#). */
  name: string;
  /** Paragraph(s) directly under the name. Multiple paragraphs are separated by a blank line. */
  contact: string;
  sections: Section[];
}

export function createEmptyResume(): Resume {
  return { name: '', contact: '', sections: [] };
}

export function cloneResume(resume: Resume): Resume {
  return structuredClone(resume);
}

function clampIndex(index: number, max: number): number {
  return Math.max(0, Math.min(index, max));
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return items.slice();
  const target = clampIndex(to, items.length - 1);
  const out = items.slice();
  const [item] = out.splice(from, 1);
  out.splice(target, 0, item);
  return out;
}

function updateSection(resume: Resume, index: number, update: (section: Section) => Section): Resume {
  if (index < 0 || index >= resume.sections.length) return resume;
  return { ...resume, sections: resume.sections.map((s, i) => (i === index ? update(s) : s)) };
}

// ---------------------------------------------------------------- header

export function setName(resume: Resume, name: string): Resume {
  return { ...resume, name };
}

export function setContact(resume: Resume, contact: string): Resume {
  return { ...resume, contact };
}

// -------------------------------------------------------------- sections

export function addSection(resume: Resume, title = 'New Section', index = resume.sections.length): Resume {
  const sections = resume.sections.slice();
  sections.splice(clampIndex(index, sections.length), 0, { title, blocks: [] });
  return { ...resume, sections };
}

export function deleteSection(resume: Resume, index: number): Resume {
  if (index < 0 || index >= resume.sections.length) return resume;
  return { ...resume, sections: resume.sections.filter((_, i) => i !== index) };
}

export function moveSection(resume: Resume, from: number, to: number): Resume {
  return { ...resume, sections: moveItem(resume.sections, from, to) };
}

export function renameSection(resume: Resume, index: number, title: string): Resume {
  return updateSection(resume, index, (s) => ({ ...s, title }));
}

// ---------------------------------------------------------------- blocks

export function addBlock(resume: Resume, sectionIndex: number, block: Block, index?: number): Resume {
  return updateSection(resume, sectionIndex, (s) => {
    const blocks = s.blocks.slice();
    const at = index === undefined ? blocks.length : clampIndex(index, blocks.length);
    blocks.splice(at, 0, block);
    return { ...s, blocks };
  });
}

export function deleteBlock(resume: Resume, sectionIndex: number, blockIndex: number): Resume {
  return updateSection(resume, sectionIndex, (s) => ({ ...s, blocks: s.blocks.filter((_, i) => i !== blockIndex) }));
}

export function moveBlock(resume: Resume, sectionIndex: number, from: number, to: number): Resume {
  return updateSection(resume, sectionIndex, (s) => ({ ...s, blocks: moveItem(s.blocks, from, to) }));
}

export function updateBlock(resume: Resume, sectionIndex: number, blockIndex: number, block: Block): Resume {
  return updateSection(resume, sectionIndex, (s) => ({
    ...s,
    blocks: s.blocks.map((b, i) => (i === blockIndex ? block : b)),
  }));
}

// --------------------------------------------------------------- entries
// An "entry" is a heading block plus every block that follows it up to the
// next heading: a job title with its company line, descriptor, and bullets.

export function entryRange(section: Section, headingIndex: number): [start: number, end: number] | null {
  const block = section.blocks[headingIndex];
  if (!block || block.type !== 'heading') return null;
  let end = headingIndex + 1;
  while (end < section.blocks.length && section.blocks[end].type !== 'heading') end++;
  return [headingIndex, end];
}

export function deleteEntry(resume: Resume, sectionIndex: number, headingIndex: number): Resume {
  const section = resume.sections[sectionIndex];
  if (!section) return resume;
  const range = entryRange(section, headingIndex);
  if (!range) return resume;
  const [start, end] = range;
  return updateSection(resume, sectionIndex, (s) => ({
    ...s,
    blocks: [...s.blocks.slice(0, start), ...s.blocks.slice(end)],
  }));
}

export interface EntryInput {
  title: string;
  /** e.g. "Company | City, ST | Mon YYYY - Mon YYYY" */
  meta?: string;
  /** e.g. an industry descriptor; rendered in italics */
  descriptor?: string;
  bullets?: string[];
}

export function addEntry(resume: Resume, sectionIndex: number, entry: EntryInput, index?: number): Resume {
  const blocks: Block[] = [{ type: 'heading', text: entry.title }];
  if (entry.meta) blocks.push({ type: 'paragraph', text: entry.meta });
  if (entry.descriptor) blocks.push({ type: 'paragraph', text: `*${entry.descriptor}*` });
  blocks.push({ type: 'list', items: entry.bullets && entry.bullets.length > 0 ? entry.bullets : ['New accomplishment'] });
  return updateSection(resume, sectionIndex, (s) => {
    const out = s.blocks.slice();
    const at = index === undefined ? out.length : clampIndex(index, out.length);
    out.splice(at, 0, ...blocks);
    return { ...s, blocks: out };
  });
}

// ----------------------------------------------------------------- stats

/** Every human-readable string in the resume, in document order. */
export function allText(resume: Resume): string[] {
  const out: string[] = [resume.name, resume.contact];
  for (const s of resume.sections) {
    out.push(s.title);
    for (const b of s.blocks) {
      if (b.type === 'list') out.push(...b.items);
      else out.push(b.text);
    }
  }
  return out;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

export interface ResumeStats {
  words: number;
  sections: number;
  blocks: number;
  bullets: number;
}

export function stats(resume: Resume): ResumeStats {
  let blocks = 0;
  let bullets = 0;
  for (const s of resume.sections) {
    blocks += s.blocks.length;
    for (const b of s.blocks) if (b.type === 'list') bullets += b.items.length;
  }
  return {
    words: allText(resume).reduce((n, t) => n + countWords(t), 0),
    sections: resume.sections.length,
    blocks,
    bullets,
  };
}
