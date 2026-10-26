import type { RefObject } from 'react';
import { MARGIN_PRESETS } from '@core/pdf';
import { SEPARATOR_PRESETS } from '@core/separator';
import { formatInfo, type OutputFormat } from '@core/build';

/**
 * The download options, in a modal dialog the toolbar's "Download…" button opens, with the vanilla ids.
 * Submitting (the Download button, or Enter in the file name) downloads and closes it; Cancel and
 * Escape close it without downloading. The parent opens it through `dialogRef`; see `showDialog`.
 */

interface DownloadDialogProps {
  dialogRef: RefObject<HTMLDialogElement | null>;
  format: OutputFormat;
  onFormat: (format: OutputFormat) => void;
  margin: string;
  onMargin: (id: string) => void;
  separator: string;
  onSeparator: (id: string) => void;
  filename: string;
  onFilename: (value: string) => void;
  filenamePlaceholder: string;
  onDownload: () => void;
}

/** Opens a dialog modally. jsdom has no `showModal`, so the `open` attribute stands in, as in main.ts. */
export function showDialog(dialog: HTMLDialogElement | null): void {
  if (!dialog) return;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

/** Closes a dialog; jsdom has no `close`, so the `open` attribute is dropped by hand. */
export function closeDialog(dialog: HTMLDialogElement | null): void {
  if (!dialog) return;
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

export function DownloadDialog(props: DownloadDialogProps) {
  const pdf = props.format === 'pdf';
  return (
    <dialog ref={props.dialogRef} id="downloadDialog" className="dialog download-dialog" aria-labelledby="downloadTitle">
      <form
        id="downloadForm"
        method="dialog"
        onSubmit={(e) => {
          props.onDownload();
          // Browsers close the dialog for method="dialog"; jsdom does not, so close it by hand there.
          if (typeof props.dialogRef.current?.close !== 'function') {
            e.preventDefault();
            closeDialog(props.dialogRef.current);
          }
        }}
      >
        <h2 id="downloadTitle">Download</h2>
        <div className="download-fields">
          <label htmlFor="formatPicker">Format</label>
          <select id="formatPicker" value={props.format} onChange={(e) => props.onFormat(e.target.value === 'pdf' ? 'pdf' : 'md')}>
            <option value="md">Markdown (.md)</option>
            <option value="pdf">PDF (.pdf)</option>
          </select>
          <label htmlFor="marginPicker" className="margin-field" hidden={!pdf}>Margins</label>
          <select
            id="marginPicker"
            className="margin-field"
            hidden={!pdf}
            title="PDF page margins on every side. Compact is the 0.5 inch minimum recommended for applicant tracking systems."
            value={props.margin}
            onChange={(e) => props.onMargin(e.target.value)}
          >
            {MARGIN_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.label}</option>
            ))}
          </select>
          <label htmlFor="separatorPicker">Separator</label>
          <select
            id="separatorPicker"
            aria-describedby="separatorHint"
            title={'How the " | " between fields (company, location, dates) is shown in the preview and the PDF. The Markdown always keeps the pipe.'}
            value={props.separator}
            onChange={(e) => props.onSeparator(e.target.value)}
          >
            {SEPARATOR_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.label}</option>
            ))}
          </select>
          <p id="separatorHint" className="download-hint">Also changes the preview. Markdown always keeps the pipe.</p>
          <label htmlFor="filename">File name</label>
          <span className="filename-field">
            <input
              type="text"
              id="filename"
              placeholder={props.filenamePlaceholder}
              autoComplete="off"
              spellCheck={false}
              value={props.filename}
              onChange={(e) => props.onFilename(e.target.value)}
            />
            <span id="extLabel" className="ext-label">{formatInfo(props.format).extension}</span>
          </span>
        </div>
        <div className="dialog-actions">
          <button type="button" id="btnDownloadCancel" className="btn-ghost" onClick={() => closeDialog(props.dialogRef.current)}>Cancel</button>
          <button type="submit" id="btnDownload" className="btn-primary">Download</button>
        </div>
      </form>
    </dialog>
  );
}
