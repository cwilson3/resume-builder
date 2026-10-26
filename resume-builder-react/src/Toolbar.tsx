import type { RefObject } from 'react';

/** The build controls, with the vanilla ids. The download options live in `DownloadDialog`. */

interface ToolbarProps {
  source: string;
  modified: boolean;
  canUndo: boolean;
  /** False until a master has been loaded: there is nothing to reset to. */
  canReset: boolean;
  /** False while no resume is loaded. */
  canDownload: boolean;
  status: string;
  flash: string;
  /** The hidden file input, shared with the welcome panel's "Choose a resume…" button. */
  fileInput: RefObject<HTMLInputElement | null>;
  onUndo: () => void;
  onReset: () => void;
  onOpen: (file: File) => void;
  onOpenDownload: () => void;
}

export function Toolbar(props: ToolbarProps) {
  return (
    <section className="card toolbar" aria-label="Build controls">
      <div className="group group-source">
        <span className="eyebrow">Source</span>
        <span id="sourceLabel" className="source-label">{props.source}</span>
        <span id="modifiedBadge" className="badge badge-gold" hidden={!props.modified}>Modified</span>
      </div>
      <div className="group">
        <button type="button" id="btnUndo" className="btn-ghost" disabled={!props.canUndo} onClick={props.onUndo}>Undo</button>
        <button type="button" id="btnReset" className="btn-ghost" disabled={!props.canReset} onClick={props.onReset}>Reset to master</button>
        <button type="button" id="btnOpen" className="btn-ghost" onClick={() => props.fileInput.current?.click()}>Change source</button>
        <input
          ref={props.fileInput}
          type="file"
          id="fileInput"
          accept=".md,.markdown,text/markdown,text/plain"
          hidden
          aria-label="Open a Markdown file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Cleared so choosing the same file again fires another change, as in main.ts.
            e.target.value = '';
            if (file) props.onOpen(file);
          }}
        />
      </div>
      <div className="group group-status">
        <span id="status" className="status">{props.status}</span>
        <span id="flash" className="status flash" role="status" aria-live="polite">{props.flash}</span>
        <button
          type="button"
          id="btnDownloadOpen"
          className="btn-primary"
          aria-haspopup="dialog"
          aria-controls="downloadDialog"
          disabled={!props.canDownload}
          onClick={props.onOpenDownload}
        >
          Download…
        </button>
      </div>
    </section>
  );
}
