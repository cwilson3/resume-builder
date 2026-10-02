import type { Block, Resume } from './model';

/**
 * Resume → Markdown, in exactly the shape of the master document:
 * `# Name`, contact paragraph, `## Section`, `### Entry`, `- bullet`, with one
 * blank line between blocks and a single trailing newline.
 */

export function serializeBlock(block: Block): string {
  switch (block.type) {
    case 'heading':
      return block.text.trim() === '' ? '' : `### ${block.text}`;
    case 'paragraph':
      return block.text.trim() === '' ? '' : block.text;
    case 'list':
      return block.items
        .filter((item) => item.trim() !== '')
        .map((item) => `- ${item}`)
        .join('\n');
  }
}

export function serializeResume(resume: Resume): string {
  const parts: string[] = [];
  parts.push(`# ${resume.name}`.trimEnd());
  if (resume.contact.trim() !== '') parts.push(resume.contact);
  for (const section of resume.sections) {
    parts.push(`## ${section.title}`.trimEnd());
    for (const block of section.blocks) {
      const text = serializeBlock(block);
      if (text !== '') parts.push(text);
    }
  }
  return parts.join('\n\n') + '\n';
}
