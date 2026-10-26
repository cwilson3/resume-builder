import { useReducer } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { Editor } from '../Editor';
import { editorReducer, initEditor } from '../reducer';

/**
 * A two-section resume small enough to name every block in a test. Experience holds a loose paragraph
 * and two entries; Skills holds one list.
 */
export const EDITOR_FIXTURE = `# Test Person

test@example.com

## Experience

Intro paragraph.

### Role A

Company A | City, ST | 2020

- A1
- A2

### Role B

Company B | City, ST | 2021

- B1

## Skills

- Skill 1
`;

/** The editor driven by the real reducer, as App drives it, without the toolbar or preview. */
function EditorHarness({ markdown }: { markdown: string }) {
  const [state, dispatch] = useReducer(editorReducer, markdown, (md) => initEditor(md, 'test'));
  return <Editor name={state.resume.name} contact={state.resume.contact} sections={state.resume.sections} ids={state.ids} dispatch={dispatch} />;
}

export function renderEditor(markdown: string = EDITOR_FIXTURE): RenderResult {
  return render(<EditorHarness markdown={markdown} />);
}
