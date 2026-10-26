import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type ReactNode } from 'react';
import type { Block, Section } from '@core/model';
import { fit } from '@core/dom';
import type { Action, Ids } from './reducer';
import { listFieldValue, parseListItems } from './list-field';

/**
 * The editor column. Every field is controlled by the live resume; React keeps
 * focus and caret because each card and block is keyed by its id from the reducer, never by index
 * and never by the block object, which a text edit replaces.
 */

interface EditorProps {
  name: string;
  contact: string;
  sections: Section[];
  ids: Ids;
  dispatch: Dispatch<Action>;
}

/**
 * What to focus after the next render: the last text field of a section, the newest section's title, or
 * the move button just used on a block (a block that crosses an entry boundary changes parent,
 * so React remounts it and the button that had focus is gone).
 */
type FocusRequest =
  | { kind: 'section-field'; sectionId: number }
  | { kind: 'last-title' }
  | { kind: 'block-action'; blockId: number; act: string };

function focusTarget(root: HTMLElement, request: FocusRequest): HTMLElement | null {
  if (request.kind === 'block-action') {
    const block = root.querySelector<HTMLElement>(`[data-block-id="${request.blockId}"]`);
    const button = block?.querySelector<HTMLButtonElement>(`[data-act="${request.act}"]`);
    // At the top or bottom the button just used is disabled; the block's own field keeps the place.
    return button && !button.disabled ? button : (block?.querySelector<HTMLElement>('.ed-text-field') ?? null);
  }
  const selector = request.kind === 'last-title' ? '.ed-title' : `[data-section-id="${request.sectionId}"] .ed-text-field`;
  const fields = root.querySelectorAll<HTMLElement>(selector);
  return fields[fields.length - 1] ?? null;
}

export function Editor({ name, contact, sections, ids, dispatch }: EditorProps) {
  // Section ids, not section objects: a rename replaces the object, the id survives.
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());
  const editorRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<FocusRequest | null>(null);

  // After the render that added or moved the element, focus it, as focusLastField() does in main.ts.
  useEffect(() => {
    const request = pendingFocus.current;
    const root = editorRef.current;
    if (!request || !root) return;
    pendingFocus.current = null;
    focusTarget(root, request)?.focus();
  });

  const toggle = useCallback(
    (sectionId: number) =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (!next.delete(sectionId)) next.add(sectionId);
        return next;
      }),
    [],
  );

  const add = useCallback(
    (sectionId: number, action: Action) => {
      pendingFocus.current = { kind: 'section-field', sectionId };
      dispatch(action);
    },
    [dispatch],
  );

  const moveBlock = useCallback(
    (si: number, bi: number, to: number, blockId: number, act: string) => {
      pendingFocus.current = { kind: 'block-action', blockId, act };
      dispatch({ type: 'moveBlock', si, bi, to });
    },
    [dispatch],
  );

  const addSection = () => {
    pendingFocus.current = { kind: 'last-title' };
    dispatch({ type: 'addSection' });
  };

  return (
    <>
      <div id="editor" ref={editorRef}>
        <HeaderCard name={name} contact={contact} dispatch={dispatch} />
        {sections.map((section, si) => (
          <SectionCard
            key={ids.sections[si]}
            section={section}
            si={si}
            sectionId={ids.sections[si]}
            last={si === sections.length - 1}
            blockIds={ids.blocks[si]}
            collapsed={collapsed.has(ids.sections[si])}
            onToggle={toggle}
            onAdd={add}
            onMoveBlock={moveBlock}
            dispatch={dispatch}
          />
        ))}
      </div>
      <button type="button" id="btnAddSection" className="btn-secondary" onClick={addSection}>+ Add section</button>
    </>
  );
}

/** A textarea that grows to fit its content after every value change, as `fit()` does in `main.ts`. */
function AutoTextarea(props: { id?: string; className: string; label?: string; value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (ref.current) fit(ref.current);
  }, [props.value]);
  return (
    <textarea ref={ref} id={props.id} className={props.className} aria-label={props.label} rows={2} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
  );
}

function HeaderCard({ name, contact, dispatch }: { name: string; contact: string; dispatch: Dispatch<Action> }) {
  return (
    <section className="card ed-card ed-header">
      <div className="eyebrow">Header</div>
      <label className="ed-label" htmlFor="fName">Name</label>
      <input type="text" id="fName" className="ed-input" autoComplete="off" value={name} onChange={(e) => dispatch({ type: 'setName', value: e.target.value })} />
      <label className="ed-label" htmlFor="fContact">Contact line</label>
      <AutoTextarea id="fContact" className="ed-text" value={contact} onChange={(value) => dispatch({ type: 'setContact', value })} />
      <div className="ed-hint">
        Separate fields with &quot; | &quot; (the Separator picker chooses how it is shown). Links as [text](https://…). Never put contact details in a header or footer.
      </div>
    </section>
  );
}

interface ActionButtonProps {
  act: string;
  label: string;
  aria: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  expanded?: boolean;
}

function ActionButton({ act, label, aria, onClick, disabled = false, danger = false, expanded }: ActionButtonProps) {
  return (
    <button
      type="button"
      className={danger ? 'btn-ghost ed-btn ed-danger' : 'btn-ghost ed-btn'}
      data-act={act}
      aria-label={aria}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

interface SectionCardProps {
  section: Section;
  si: number;
  sectionId: number;
  last: boolean;
  blockIds: number[];
  collapsed: boolean;
  onToggle: (sectionId: number) => void;
  onAdd: (sectionId: number, action: Action) => void;
  onMoveBlock: (si: number, bi: number, to: number, blockId: number, act: string) => void;
  dispatch: Dispatch<Action>;
}

function SectionCard({ section, si, sectionId, last, blockIds, collapsed, onToggle, onAdd, onMoveBlock, dispatch }: SectionCardProps) {
  const total = section.blocks.length;
  const renderBlock = (bi: number) => (
    <BlockEditor
      key={blockIds[bi]}
      block={section.blocks[bi]}
      si={si}
      bi={bi}
      blockId={blockIds[bi]}
      total={total}
      onMoveBlock={onMoveBlock}
      dispatch={dispatch}
    />
  );

  // Blocks before the first heading stand alone; each heading opens an .ed-entry keyed by the heading's id.
  const loose: number[] = [];
  const entries: number[][] = [];
  section.blocks.forEach((block, bi) => {
    if (block.type === 'heading') entries.push([bi]);
    else if (entries.length > 0) entries[entries.length - 1].push(bi);
    else loose.push(bi);
  });

  return (
    <section className="card ed-card ed-section" data-section={si} data-section-id={sectionId} data-title={section.title}>
      <div className="ed-section-head">
        <span className="eyebrow">Section</span>
        <input
          type="text"
          className="ed-input ed-title"
          aria-label="Section title"
          placeholder="Section title"
          autoComplete="off"
          value={section.title}
          onChange={(e) => dispatch({ type: 'renameSection', si, title: e.target.value })}
        />
        <div className="ed-actions">
          <ActionButton act="section-up" label="↑" aria="Move section up" disabled={si === 0} onClick={() => dispatch({ type: 'moveSection', si, to: si - 1 })} />
          <ActionButton act="section-down" label="↓" aria="Move section down" disabled={last} onClick={() => dispatch({ type: 'moveSection', si, to: si + 1 })} />
          <ActionButton
            act="section-toggle"
            label={collapsed ? 'Expand' : 'Collapse'}
            aria={collapsed ? 'Expand section' : 'Collapse section'}
            expanded={!collapsed}
            onClick={() => onToggle(sectionId)}
          />
          <ActionButton act="section-delete" label="Delete" aria="Delete section" danger onClick={() => dispatch({ type: 'deleteSection', si })} />
        </div>
      </div>
      {collapsed ? null : (
        <>
          <div className="ed-blocks">
            {loose.map(renderBlock)}
            {entries.map((entry) => (
              <div className="ed-entry" key={blockIds[entry[0]]}>
                {entry.map(renderBlock)}
              </div>
            ))}
            {total === 0 ? <p className="ed-empty">No content yet. Add a paragraph, list, subheading, or entry below.</p> : null}
          </div>
          <div className="ed-add">
            <AddButton act="add-paragraph" onClick={() => onAdd(sectionId, { type: 'addBlock', si, block: { type: 'paragraph', text: '' } })}>+ Paragraph</AddButton>
            <AddButton act="add-list" onClick={() => onAdd(sectionId, { type: 'addBlock', si, block: { type: 'list', items: [] } })}>+ List</AddButton>
            <AddButton act="add-heading" onClick={() => onAdd(sectionId, { type: 'addBlock', si, block: { type: 'heading', text: 'New Subheading' } })}>+ Subheading</AddButton>
            <AddButton act="add-entry" onClick={() => onAdd(sectionId, { type: 'addEntry', si })}>+ Entry</AddButton>
          </div>
        </>
      )}
    </section>
  );
}

function AddButton({ act, onClick, children }: { act: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="btn-secondary ed-btn" data-act={act} onClick={onClick}>
      {children}
    </button>
  );
}

const BLOCK_LABEL = { heading: 'Subheading', list: 'List', paragraph: 'Paragraph' } as const;

interface BlockEditorProps {
  block: Block;
  si: number;
  bi: number;
  blockId: number;
  total: number;
  onMoveBlock: (si: number, bi: number, to: number, blockId: number, act: string) => void;
  dispatch: Dispatch<Action>;
}

function BlockEditor({ block, si, bi, blockId, total, onMoveBlock, dispatch }: BlockEditorProps) {
  const label = BLOCK_LABEL[block.type];
  const lower = label.toLowerCase();
  const update = (next: Block) => dispatch({ type: 'updateBlock', si, bi, block: next });

  let field: ReactNode;
  let hint: string;
  if (block.type === 'heading') {
    field = (
      <input
        type="text"
        className="ed-input ed-text-field ed-heading"
        aria-label="Subheading text"
        autoComplete="off"
        value={block.text}
        onChange={(e) => update({ type: 'heading', text: e.target.value })}
      />
    );
    hint = 'A job title or other entry heading. The blocks below it belong to this entry.';
  } else if (block.type === 'list') {
    field = <ListField items={block.items} onChange={(items) => update({ type: 'list', items })} />;
    hint = 'One bullet per line. **bold**, *italic*, [text](https://…) allowed.';
  } else {
    field = <AutoTextarea className="ed-text ed-text-field" label="Paragraph text" value={block.text} onChange={(text) => update({ type: 'paragraph', text })} />;
    hint = 'Plain text. Use *italic* for an industry descriptor, **bold** for a label.';
  }

  return (
    <div className="ed-block" data-block={bi} data-block-id={blockId} data-type={block.type}>
      <div className="ed-block-head">
        <span className="badge badge-outline">{label}</span>
        <div className="ed-actions">
          <ActionButton act="block-up" label="↑" aria={`Move ${lower} up`} disabled={bi === 0} onClick={() => onMoveBlock(si, bi, bi - 1, blockId, 'block-up')} />
          <ActionButton act="block-down" label="↓" aria={`Move ${lower} down`} disabled={bi === total - 1} onClick={() => onMoveBlock(si, bi, bi + 1, blockId, 'block-down')} />
          {block.type === 'heading' ? (
            <ActionButton act="entry-delete" label="Delete entry" aria="Delete entry and everything under it" danger onClick={() => dispatch({ type: 'deleteEntry', si, bi })} />
          ) : null}
          <ActionButton act="block-delete" label="✕" aria={`Delete ${lower}`} danger onClick={() => dispatch({ type: 'deleteBlock', si, bi })} />
        </div>
      </div>
      {field}
      <div className="ed-hint">{hint}</div>
    </div>
  );
}

/** Keeps the typed text (blank lines, a trailing newline) that the model's item list cannot hold; see list-field.ts. */
function ListField({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  const [draft, setDraft] = useState(() => items.join('\n'));
  const change = (text: string) => {
    setDraft(text);
    onChange(parseListItems(text));
  };
  return <AutoTextarea className="ed-text ed-text-field" label="List items, one per line" value={listFieldValue(draft, items)} onChange={change} />;
}
