import type { ListBlock, ParagraphBlock, Resume, Section } from './model';

/**
 * Markdown → Resume.
 *
 * Understands the subset the master document uses: one `#` name, paragraph(s)
 * of contact text, `##` sections, `###` entry headings, `-` bullet lists, and
 * paragraphs. It also tolerates `*`/`+`/numbered bullets and the `▪`/`•`
 * glyphs from the original export so an older file still loads.
 */

// Closing hashes are only stripped when preceded by whitespace ("## Title ##"),
// so a title such as "Walking Songs in C#" keeps its hash.
const HEADING_RE = /^(#{1,6})(?:\s+(.*?))?(?:\s+#+)?\s*$/;
const LIST_RE = /^\s{0,3}(?:[-*+]|▪|•|\d+[.)])\s+(.*)$/;

export function parseResume(markdown: string): Resume {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const resume: Resume = { name: '', contact: '', sections: [] };
  const contactParagraphs: string[] = [];

  let section: Section | null = null;
  let list: ListBlock | null = null;
  let paragraph: ParagraphBlock | null = null;
  let contactLines: string[] | null = null;
  let prevBlank = true;

  const closeParagraph = (): void => {
    paragraph = null;
    if (contactLines) {
      contactParagraphs.push(contactLines.join('\n'));
      contactLines = null;
    }
  };

  const currentSection = (): Section => {
    if (!section) {
      section = { title: '', blocks: [] };
      resume.sections.push(section);
    }
    return section;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');

    if (line === '') {
      // A blank line ends a paragraph but not a list (loose lists stay one list).
      closeParagraph();
      prevBlank = true;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      closeParagraph();
      list = null;
      const level = heading[1].length;
      const text = (heading[2] ?? '').trim();
      if (level === 1 && !section && resume.name === '') {
        resume.name = text;
      } else if (level <= 2) {
        section = { title: text, blocks: [] };
        resume.sections.push(section);
      } else {
        currentSection().blocks.push({ type: 'heading', text });
      }
      prevBlank = false;
      continue;
    }

    const item = LIST_RE.exec(line);
    if (item) {
      closeParagraph();
      const target = currentSection();
      if (!list || target.blocks[target.blocks.length - 1] !== list) {
        list = { type: 'list', items: [] };
        target.blocks.push(list);
      }
      list.items.push(item[1].trim());
      prevBlank = false;
      continue;
    }

    // Plain text line.
    if (list && !prevBlank) {
      // Lazy continuation of the previous bullet.
      list.items[list.items.length - 1] += ' ' + line.trim();
      prevBlank = false;
      continue;
    }
    list = null;

    if (!section) {
      if (resume.name === '' && contactParagraphs.length === 0 && !contactLines) {
        // No `#` heading yet: the first text line is the name.
        resume.name = line.trim();
      } else if (contactLines) {
        contactLines.push(line);
      } else {
        contactLines = [line];
      }
      prevBlank = false;
      continue;
    }

    if (paragraph) {
      paragraph.text += '\n' + line;
    } else {
      paragraph = { type: 'paragraph', text: line };
      section.blocks.push(paragraph);
    }
    prevBlank = false;
  }

  closeParagraph();
  resume.contact = contactParagraphs.join('\n\n');
  return resume;
}
