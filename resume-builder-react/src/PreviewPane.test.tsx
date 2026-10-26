import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PreviewPane } from './PreviewPane';

const HTML = '<h1>Test Person</h1>';
const MARKDOWN = '# Test Person\n';

function panels() {
  return {
    preview: !document.getElementById('previewPanel')!.hidden,
    markdown: !document.getElementById('markdownPanel')!.hidden,
    previewSelected: screen.getByRole('tab', { name: 'Preview' }).getAttribute('aria-selected'),
    markdownSelected: screen.getByRole('tab', { name: 'Markdown' }).getAttribute('aria-selected'),
  };
}

describe('PreviewPane', () => {
  it('opens on the Preview tab', () => {
    render(<PreviewPane html={HTML} markdown={MARKDOWN} />);

    expect(panels()).toEqual({ preview: true, markdown: false, previewSelected: 'true', markdownSelected: 'false' });
  });

  it('shows the Markdown panel and hides the preview when the Markdown tab is chosen', async () => {
    const user = userEvent.setup();
    render(<PreviewPane html={HTML} markdown={MARKDOWN} />);

    await user.click(screen.getByRole('tab', { name: 'Markdown' }));

    expect(panels()).toEqual({ preview: false, markdown: true, previewSelected: 'false', markdownSelected: 'true' });
  });

  it('returns to the preview when the Preview tab is chosen again', async () => {
    const user = userEvent.setup();
    render(<PreviewPane html={HTML} markdown={MARKDOWN} />);
    await user.click(screen.getByRole('tab', { name: 'Markdown' }));

    await user.click(screen.getByRole('tab', { name: 'Preview' }));

    expect(panels()).toEqual({ preview: true, markdown: false, previewSelected: 'true', markdownSelected: 'false' });
  });

  it('puts the Markdown in the read-only output field', () => {
    render(<PreviewPane html={HTML} markdown={MARKDOWN} />);

    expect(screen.getByRole('textbox', { name: 'Markdown output', hidden: true })).toHaveValue(MARKDOWN);
  });
});
