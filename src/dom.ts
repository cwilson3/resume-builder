/** Tiny DOM helpers kept apart from the pure modules so those stay unit-testable in Node. */

export function qs<T extends Element>(selector: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}

type Attrs = Record<string, string | boolean | undefined>;
type Child = Node | string | null | undefined;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === 'text') el.textContent = String(value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  for (const child of children) if (child !== null && child !== undefined) el.append(child);
  return el;
}

/** Grow a textarea to fit its content. */
export function fit(textarea: HTMLTextAreaElement): void {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight + 2}px`;
}

/** Trigger a browser download of a Blob under the given file name. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
