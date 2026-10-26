import * as M from '@core/model';
import type { Block, Resume } from '@core/model';
import { parseResume } from '@core/parse';

/**
 * Editor state for the React shell. Pure, no React import, so it runs and is
 * measured in Node. Every case calls the shared `@core/model` operation the vanilla `main.ts` calls;
 * the reducer's own job is the undo rules and keeping `ids` (the React key table) in step with the
 * model, because the model replaces the edited block object on every keystroke.
 */

export const UNDO_LIMIT = 100;

/** Stable UI identity, parallel to `resume.sections[i]` and `resume.sections[i].blocks[j]`. */
export interface Ids {
  sections: number[];
  blocks: number[][];
}

export interface Snapshot {
  resume: Resume;
  ids: Ids;
}

export interface EditorState {
  resume: Resume;
  ids: Ids;
  undo: Snapshot[];
  /** Consecutive text edits with the same key share one undo step; null after anything else. */
  lastEditKey: string | null;
  /** The toolbar source label. */
  source: string;
  /** Next fresh id. Kept in state so the reducer stays pure. */
  nextId: number;
  /** 'debounced' after a text edit, 'now' after anything else: drives the settled resume . */
  settle: 'debounced' | 'now';
}

export type Action =
  | { type: 'setName'; value: string }
  | { type: 'setContact'; value: string }
  | { type: 'renameSection'; si: number; title: string }
  | { type: 'updateBlock'; si: number; bi: number; block: Block }
  | { type: 'addSection' }
  | { type: 'deleteSection'; si: number }
  | { type: 'moveSection'; si: number; to: number }
  | { type: 'addBlock'; si: number; block: Block }
  | { type: 'deleteBlock'; si: number; bi: number }
  | { type: 'moveBlock'; si: number; bi: number; to: number }
  | { type: 'addEntry'; si: number }
  | { type: 'deleteEntry'; si: number; bi: number }
  | { type: 'undo' }
  | { type: 'load'; markdown: string; source: string; pushUndo: boolean };

/** What "+ Entry" inserts, same as the vanilla shell. */
export const NEW_ENTRY: M.EntryInput = { title: 'New Role', meta: 'Company | City, ST | Mon YYYY - Mon YYYY', bullets: ['New accomplishment'] };

function freshIds(resume: Resume, start: number): { ids: Ids; nextId: number } {
  let next = start;
  const sections: number[] = [];
  const blocks: number[][] = [];
  for (const section of resume.sections) {
    sections.push(next++);
    blocks.push(section.blocks.map(() => next++));
  }
  return { ids: { sections, blocks }, nextId: next };
}

/** A fresh editor holding `markdown`, with an empty undo stack. */
export function initEditor(markdown: string, source: string): EditorState {
  const resume = parseResume(markdown);
  const { ids, nextId } = freshIds(resume, 1);
  return { resume, ids, undo: [], lastEditKey: null, source, nextId, settle: 'now' };
}

function withUndo(state: EditorState): Snapshot[] {
  const undo = [...state.undo, { resume: state.resume, ids: state.ids }];
  return undo.length > UNDO_LIMIT ? undo.slice(undo.length - UNDO_LIMIT) : undo;
}

function textEdit(state: EditorState, resume: Resume, editKey: string): EditorState {
  if (resume === state.resume) return state;
  const undo = editKey === state.lastEditKey ? state.undo : withUndo(state);
  return { ...state, resume, undo, lastEditKey: editKey, settle: 'debounced' };
}

function structural(state: EditorState, resume: Resume, ids: Ids, nextId = state.nextId): EditorState {
  if (resume === state.resume) return state;
  return { ...state, resume, ids, nextId, undo: withUndo(state), lastEditKey: null, settle: 'now' };
}

/** Same splice as `moveItem` in model.ts: clamp the target, ignore an out-of-range source. */
function moveId(list: number[], from: number, to: number): number[] {
  if (from < 0 || from >= list.length) return list.slice();
  const out = list.slice();
  const [id] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(to, out.length)), 0, id);
  return out;
}

function mapBlockIds(ids: Ids, si: number, update: (list: number[]) => number[]): Ids {
  return { ...ids, blocks: ids.blocks.map((list, i) => (i === si ? update(list) : list)) };
}

export function editorReducer(state: EditorState, action: Action): EditorState {
  const { resume, ids } = state;
  switch (action.type) {
    case 'setName':
      return textEdit(state, M.setName(resume, action.value), 'name');
    case 'setContact':
      return textEdit(state, M.setContact(resume, action.value), 'contact');
    case 'renameSection':
      return textEdit(state, M.renameSection(resume, action.si, action.title), `title:${action.si}`);
    case 'updateBlock': {
      if (!resume.sections[action.si]?.blocks[action.bi]) return state;
      return textEdit(state, M.updateBlock(resume, action.si, action.bi, action.block), `block:${action.si}:${action.bi}`);
    }
    case 'addSection': {
      const next = { sections: [...ids.sections, state.nextId], blocks: [...ids.blocks, []] };
      return structural(state, M.addSection(resume), next, state.nextId + 1);
    }
    case 'deleteSection': {
      const keep = (_: unknown, i: number) => i !== action.si;
      return structural(state, M.deleteSection(resume, action.si), { sections: ids.sections.filter(keep), blocks: ids.blocks.filter(keep) });
    }
    case 'moveSection':
      return structural(state, M.moveSection(resume, action.si, action.to), {
        sections: moveId(ids.sections, action.si, action.to),
        blocks: moveId(ids.sections.map((_, i) => i), action.si, action.to).map((i) => ids.blocks[i]),
      });
    case 'addBlock':
      return structural(state, M.addBlock(resume, action.si, action.block), mapBlockIds(ids, action.si, (list) => [...list, state.nextId]), state.nextId + 1);
    case 'deleteBlock':
      return structural(state, M.deleteBlock(resume, action.si, action.bi), mapBlockIds(ids, action.si, (list) => list.filter((_, i) => i !== action.bi)));
    case 'moveBlock':
      return structural(state, M.moveBlock(resume, action.si, action.bi, action.to), mapBlockIds(ids, action.si, (list) => moveId(list, action.bi, action.to)));
    case 'addEntry': {
      const next = M.addEntry(resume, action.si, NEW_ENTRY);
      if (next === resume) return state;
      const added = next.sections[action.si].blocks.length - resume.sections[action.si].blocks.length;
      const fresh = Array.from({ length: added }, (_, k) => state.nextId + k);
      return structural(state, next, mapBlockIds(ids, action.si, (list) => [...list, ...fresh]), state.nextId + added);
    }
    case 'deleteEntry': {
      const section = resume.sections[action.si];
      const range = section ? M.entryRange(section, action.bi) : null;
      if (!range) return state;
      const [start, end] = range;
      return structural(state, M.deleteEntry(resume, action.si, action.bi), mapBlockIds(ids, action.si, (list) => [...list.slice(0, start), ...list.slice(end)]));
    }
    case 'undo': {
      const previous = state.undo[state.undo.length - 1];
      if (!previous) return state;
      return { ...state, resume: previous.resume, ids: previous.ids, undo: state.undo.slice(0, -1), lastEditKey: null, settle: 'now' };
    }
    case 'load': {
      // Ids continue from the counter so nothing in the new document reuses a key from the old one.
      const loaded = parseResume(action.markdown);
      const fresh = freshIds(loaded, state.nextId);
      return {
        resume: loaded,
        ids: fresh.ids,
        undo: action.pushUndo ? withUndo(state) : state.undo,
        lastEditKey: null,
        source: action.source,
        nextId: fresh.nextId,
        settle: 'now',
      };
    }
  }
}
