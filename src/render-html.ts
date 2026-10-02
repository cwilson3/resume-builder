import type { Block, Resume } from './model';
import { inlineToHtml } from './inline';

/** Resume → HTML fragment for the live preview. All text is escaped. */

export function renderBlockHtml(block: Block): string {
  switch (block.type) {
    case 'heading':
      return `<h3>${inlineToHtml(block.text)}</h3>`;
    case 'paragraph':
      return `<p>${inlineToHtml(block.text.replace(/\n/g, ' '))}</p>`;
    case 'list':
      return `<ul>${block.items.map((item) => `<li>${inlineToHtml(item)}</li>`).join('')}</ul>`;
  }
}

export function renderResumeHtml(resume: Resume): string {
  const out: string[] = [];
  out.push('<header class="rp-head">');
  out.push(`<h1>${inlineToHtml(resume.name)}</h1>`);
  for (const paragraph of resume.contact.split(/\n{2,}/)) {
    if (paragraph.trim() !== '') out.push(`<p class="rp-contact">${inlineToHtml(paragraph.replace(/\n/g, ' '))}</p>`);
  }
  out.push('</header>');
  for (const section of resume.sections) {
    out.push('<section class="rp-section">');
    out.push(`<h2>${inlineToHtml(section.title)}</h2>`);
    for (const block of section.blocks) out.push(renderBlockHtml(block));
    out.push('</section>');
  }
  return out.join('\n');
}
