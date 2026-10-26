/**
 * The list textarea shows one bullet per line, but the model keeps only non-blank items, so the text
 * a person is typing (a trailing newline, a blank line) does not survive a round trip through the
 * model. A controlled textarea fed `items.join('\n')` would delete the newline as it is typed. The
 * field therefore keeps its own draft and shows it while the draft still means the same items.
 */

export function parseListItems(text: string): string[] {
  return text.split('\n').filter((line) => line.trim() !== '');
}

/** The draft while it parses to `items`; otherwise (undo, load, an outside change) the items themselves. */
export function listFieldValue(draft: string, items: readonly string[]): string {
  const parsed = parseListItems(draft);
  const same = parsed.length === items.length && parsed.every((item, i) => item === items[i]);
  return same ? draft : items.join('\n');
}
