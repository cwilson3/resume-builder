import { describe, expect, it } from 'vitest';
import { renderBlockHtml, renderResumeHtml } from './render-html';
import type { Resume } from './model';

describe('renderBlockHtml', () => {
  it('renders each block type with inline markup', () => {
    expect(renderBlockHtml({ type: 'heading', text: 'Role' })).toBe('<h3>Role</h3>');
    expect(renderBlockHtml({ type: 'paragraph', text: '*desc*\nwrapped' })).toBe('<p><em>desc</em> wrapped</p>');
    expect(renderBlockHtml({ type: 'list', items: ['**A:** b', 'c'] })).toBe('<ul><li><strong>A:</strong> b</li><li>c</li></ul>');
  });

  it('escapes HTML in content', () => {
    expect(renderBlockHtml({ type: 'paragraph', text: '<script>alert(1)</script>' })).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
  });
});

describe('renderResumeHtml', () => {
  const resume: Resume = {
    name: 'Jane <Doe>',
    contact: 'City | [site](https://x.y)\n\nsecond',
    sections: [{ title: 'S & T', blocks: [{ type: 'list', items: ['a'] }] }],
  };

  it('renders header, contact paragraphs and sections', () => {
    const html = renderResumeHtml(resume);
    expect(html).toContain('<h1>Jane &lt;Doe&gt;</h1>');
    expect(html).toContain('<p class="rp-contact">City | <a href="https://x.y" rel="noopener">site</a></p>');
    expect(html).toContain('<p class="rp-contact">second</p>');
    expect(html).toContain('<h2>S &amp; T</h2>');
    expect(html).toContain('<ul><li>a</li></ul>');
  });

  it('renders no contact paragraph when contact is blank', () => {
    expect(renderResumeHtml({ ...resume, contact: '' })).not.toContain('rp-contact');
  });
});
