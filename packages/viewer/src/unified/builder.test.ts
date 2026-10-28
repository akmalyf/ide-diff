import { describe, expect, it } from 'vitest';
import { compareTexts } from '@ide-diff/core';
import { buildUnified, lineStarts, unifiedToRight } from './builder';

const build = (a: string, b: string) => buildUnified(a, b, compareTexts(a, b));

describe('buildUnified', () => {
  it('puts deleted lines before inserted lines and keeps unchanged lines from the right side', () => {
    const st = build('a\nb\nc\n', 'a\nB\nc\nd\n');
    expect(st.text).toBe('a\nb\nB\nc\nd\n');
    expect(Array.from(st.lineMap1)).toEqual([0, 1, -1, 2, -1, 3]);
    expect(Array.from(st.lineMap2)).toEqual([0, -1, 1, 2, 3, 4]);
    expect(st.changes.map((c) => [c.line1, c.insertedStart, c.line2])).toEqual([
      [1, 2, 3],
      [4, 4, 5],
    ]);
  });

  it('returns the right text unchanged when both sides are equal', () => {
    const st = build('x\ny', 'x\ny');
    expect(st.text).toBe('x\ny');
    expect(st.changes).toEqual([]);
  });

  it('maps unified offsets to right offsets and rejects deleted lines', () => {
    const right = 'a\nB\nc\n';
    const st = build('a\nb\nc\n', right);
    const u = lineStarts(st.text);
    const r = lineStarts(right);
    expect(unifiedToRight(st, u, r, 0)).toBe(0); // "a"
    expect(unifiedToRight(st, u, r, 2)).toBeNull(); // deleted "b"
    expect(unifiedToRight(st, u, r, 4)).toBe(2); // "B"
    expect(unifiedToRight(st, u, r, 7)).toBe(5); // after "c"
  });
});
