import { describe, expect, it } from 'vitest';
import { listFieldValue, parseListItems } from './list-field';

describe('parseListItems', () => {
  it('splits lines into items and drops blank ones', () => {
    expect(parseListItems('a\n\n  \nb\n')).toEqual(['a', 'b']);
  });

  it('returns no items for empty text', () => {
    expect(parseListItems('')).toEqual([]);
  });
});

describe('listFieldValue', () => {
  it('keeps a trailing newline the person just typed', () => {
    expect(listFieldValue('a\nb\n', ['a', 'b'])).toBe('a\nb\n');
  });

  it('keeps a blank line between items', () => {
    expect(listFieldValue('a\n\nb', ['a', 'b'])).toBe('a\n\nb');
  });

  it('shows the items when they changed outside the field', () => {
    expect(listFieldValue('a\nb\n', ['a'])).toBe('a');
  });

  it('shows the items when an item differs in text', () => {
    expect(listFieldValue('a\nb', ['a', 'c'])).toBe('a\nc');
  });
});
