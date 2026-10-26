import { MASTER_FILE } from '@core/master';

/**
 * The editor column before a resume is loaded: shown when no master can be read and no working copy is
 * stored, which is normal for a page opened from disk. `showPanel` is false while start-up is still
 * looking, so the panel does not flash before the master arrives. Same markup as `showWelcome()` in
 * main.ts.
 */
export function Welcome({ showPanel, onChoose }: { showPanel: boolean; onChoose: () => void }) {
  return (
    <>
      <div id="editor">
        {showPanel ? (
          <section className="card ed-card ed-welcome">
            <div className="eyebrow">Get started</div>
            <h2>Open a resume to get started</h2>
            <p>
              Choose a Markdown (.md) resume. A sample, <code>{MASTER_FILE}</code>, is in the same folder as this page.
            </p>
            <button type="button" className="btn-primary" data-act="choose-file" onClick={onChoose}>Choose a resume…</button>
          </section>
        ) : null}
      </div>
      <button type="button" id="btnAddSection" className="btn-secondary" disabled>+ Add section</button>
    </>
  );
}
