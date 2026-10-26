import { useState } from 'react';

/**
 * Preview and Markdown tabs. `#preview` takes the shared renderer's HTML as is: the
 * renderer escapes text and neutralizes unsafe links, and rebuilding it as components would fork the
 * preview from the PDF.
 */
export function PreviewPane({ html, markdown }: { html: string; markdown: string }) {
  const [tab, setTab] = useState<'preview' | 'markdown'>('preview');
  const preview = tab === 'preview';
  return (
    <aside className="card preview-pane" aria-label="Output preview">
      <div className="tabs" role="tablist" aria-label="Output view">
        <button type="button" id="tabPreview" className="btn-ghost" role="tab" aria-selected={preview} aria-controls="previewPanel" onClick={() => setTab('preview')}>
          Preview
        </button>
        <button type="button" id="tabMarkdown" className="btn-ghost" role="tab" aria-selected={!preview} aria-controls="markdownPanel" onClick={() => setTab('markdown')}>
          Markdown
        </button>
      </div>
      <div id="previewPanel" role="tabpanel" aria-labelledby="tabPreview" hidden={!preview}>
        <div id="preview" className="resume-paper" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      <div id="markdownPanel" role="tabpanel" aria-labelledby="tabMarkdown" hidden={preview}>
        <textarea id="mdOut" readOnly aria-label="Markdown output" spellCheck={false} value={markdown} />
      </div>
    </aside>
  );
}
