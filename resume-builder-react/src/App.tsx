import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import * as M from '@core/model';
import { serializeResume } from '@core/serialize';
import { renderResumeHtml } from '@core/render-html';
import { buildFile, defaultBaseName, type OutputFormat } from '@core/build';
import { marginPreset, resumeUnsupportedChars } from '@core/pdf';
import { applySeparator, separatorPreset } from '@core/separator';
import { clearWorkingCopy, loadMaster, loadWorkingCopy, saveMaster, saveWorkingCopy, type StoredMaster } from '@core/storage';
import { fetchShippedMaster, MASTER_FILE } from '@core/master';
import { downloadBlob } from '@core/dom';
import { settleDelay } from '@core/settle';
import { editorReducer, initEditor } from './reducer';
import { chooseStartup, findMaster, masterLabel } from './startup';
import { useSettledValue } from './hooks/useSettledValue';
import { usePersistedPref } from './hooks/usePersistedPref';
import { useFlash } from './hooks/useFlash';
import { Toolbar } from './Toolbar';
import { Editor } from './Editor';
import { Welcome } from './Welcome';
import { PreviewPane } from './PreviewPane';
import { DownloadDialog, showDialog } from './DownloadDialog';

const normalizeMargin = (raw: string | null) => marginPreset(raw).id;
const normalizeSeparator = (raw: string | null) => separatorPreset(raw).id;

/** Fetches the master shipped beside the page and remembers it, or null when it cannot be read. */
async function loadShippedMaster(): Promise<StoredMaster | null> {
  const markdown = await fetchShippedMaster(MASTER_FILE);
  if (markdown === null) return null;
  const shipped: StoredMaster = { name: MASTER_FILE, markdown, origin: 'shipped' };
  saveMaster(shipped);
  return shipped;
}

/** Where start-up is: still looking for a resume, found none (the welcome panel), or one is loaded. */
type Phase = 'starting' | 'welcome' | 'loaded';

/**
 * The React shell. The live resume feeds the editor; everything downstream (preview, Markdown, status,
 * Modified badge, warning, file name placeholder, working-copy save) is derived from the settled resume,
 * which trails text edits by 120 ms and follows every other action at once.
 */
export function App() {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => initEditor('', ''));
  const [phase, setPhase] = useState<Phase>('starting');
  /** What "Reset to master" returns to; null until a master has been loaded. */
  const [master, setMaster] = useState<StoredMaster | null>(null);
  // Read synchronously by start-up, which must not replace a file the user picked while it was fetching.
  const loadedRef = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const downloadDialog = useRef<HTMLDialogElement>(null);

  const [delay] = useState(() => settleDelay(window.location.search));
  const settledResume = useSettledValue(state.resume, delay, state.settle === 'now');

  const [format, setFormat] = useState<OutputFormat>('md');
  const [margin, setMargin] = usePersistedPref('rezoom.pdfMargin', normalizeMargin);
  const [separator, setSeparator] = usePersistedPref('rezoom.separator', normalizeSeparator);
  const [filename, setFilename] = useState('');
  const glyph = separatorPreset(separator).glyph;
  const loaded = phase === 'loaded';

  const markdown = useMemo(() => serializeResume(settledResume), [settledResume]);
  const previewHtml = useMemo(() => (loaded ? renderResumeHtml(applySeparator(settledResume, glyph)) : ''), [loaded, settledResume, glyph]);
  const stats = useMemo(() => M.stats(settledResume), [settledResume]);
  const unsupported = useMemo(() => resumeUnsupportedChars(settledResume), [settledResume]);
  const modified = loaded && master !== null && markdown !== master.markdown;

  const [flash, showFlash] = useFlash();

  const load = useCallback((text: string, source: string, pushUndo: boolean) => {
    loadedRef.current = true;
    setPhase('loaded');
    dispatch({ type: 'load', markdown: text, source, pushUndo });
  }, []);

  // Start-up, as init() in main.ts: find the master, then restore the working copy on top of it.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const found = await findMaster(loadMaster(), loadShippedMaster);
      // StrictMode's discarded first run, or the user picked a file while the fetch was in flight.
      if (cancelled || loadedRef.current) return;
      setMaster(found);
      const startup = chooseStartup(loadWorkingCopy(), found);
      if (startup) load(startup.markdown, startup.source, false);
      else setPhase('welcome');
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Saved on every settle, as the vanilla refresh() does, including right after Reset clears the copy;
  // chooseStartup treats a copy equal to the master as none.
  useEffect(() => {
    if (loaded) saveWorkingCopy(markdown);
  }, [loaded, settledResume, markdown]);

  const reset = useCallback(() => {
    if (!master) return;
    clearWorkingCopy();
    load(master.markdown, masterLabel(master), true);
    showFlash('Reset to master');
  }, [master, load, showFlash]);

  const open = useCallback(
    async (file: File) => {
      const text = await file.text();
      // The chosen file becomes the master that Reset returns to, here and after a reload.
      const picked: StoredMaster = { name: file.name, markdown: text, origin: 'picked' };
      setMaster(picked);
      saveMaster(picked);
      load(text, masterLabel(picked), loadedRef.current);
      showFlash(`Opened ${file.name}`);
    },
    [load, showFlash],
  );

  // Builds from the live resume, as main.ts does, so a download never misses the last keystrokes.
  const download = () => {
    const file = buildFile(state.resume, format, filename, { margin: marginPreset(margin).points, separator: glyph });
    downloadBlob(file.blob, file.filename);
    showFlash(`Downloaded ${file.filename}`);
  };

  const chooseFile = () => fileInput.current?.click();

  return (
    <>
      <main className="wrap">
        <Toolbar
          source={phase === 'welcome' ? 'No resume loaded' : state.source}
          modified={modified}
          canUndo={state.undo.length > 0}
          canReset={master !== null}
          canDownload={loaded}
          status={loaded ? `${stats.words} words · ${stats.sections} sections · ${stats.bullets} bullets` : ''}
          flash={flash}
          fileInput={fileInput}
          onUndo={() => dispatch({ type: 'undo' })}
          onReset={reset}
          onOpen={open}
          onOpenDownload={() => showDialog(downloadDialog.current)}
        />
        <div id="warning" className="callout warn" role="alert" hidden={unsupported.length === 0}>
          {unsupported.length > 0
            ? `These characters are outside the standard PDF font set and will not render in the PDF: ${unsupported.join(' ')} . ` +
              'Replace them (for example use "-" or "•" for bullets) before downloading a PDF.'
            : null}
        </div>
        <div className="builder-grid">
          <div className="editor-column">
            {loaded ? (
              <Editor name={state.resume.name} contact={state.resume.contact} sections={state.resume.sections} ids={state.ids} dispatch={dispatch} />
            ) : (
              <Welcome showPanel={phase === 'welcome'} onChoose={chooseFile} />
            )}
          </div>
          <PreviewPane html={previewHtml} markdown={loaded ? markdown : ''} />
        </div>
      </main>
      <DownloadDialog
        dialogRef={downloadDialog}
        format={format}
        onFormat={setFormat}
        margin={margin}
        onMargin={setMargin}
        separator={separator}
        onSeparator={setSeparator}
        filename={filename}
        onFilename={setFilename}
        filenamePlaceholder={defaultBaseName(settledResume)}
        onDownload={download}
      />
    </>
  );
}
