import { describe, expect, test } from 'vitest';
import {
  compareTexts, compareTextsStrict, DiffTooBigError, getDiffFragmentType, getDiffType, type LineFragment, lineOffsets, mergeLines,
} from '../index';
import { checkLineConsistency } from '../test/dsl';

const lines = (fs: LineFragment[]) => fs.map((f) => [f.startLine1, f.endLine1, f.startLine2, f.endLine2]);

describe('lineOffsets', () => {
  test('line start offsets', () => {
    expect(lineOffsets('')).toEqual([0]);
    expect(lineOffsets('a')).toEqual([0]);
    expect(lineOffsets('a\n')).toEqual([0, 2]);
    expect(lineOffsets('ab\ncd\n\nx')).toEqual([0, 3, 6, 7]);
  });
});

describe('getDiffType', () => {
  test('by lines and by offsets', () => {
    const f = (l1: number, e1: number, l2: number, e2: number): LineFragment => ({
      startLine1: l1, endLine1: e1, startLine2: l2, endLine2: e2, startOffset1: 0, endOffset1: 0, startOffset2: 0, endOffset2: 0, innerFragments: null,
    });
    expect(getDiffType(f(0, 1, 0, 1))).toBe('MODIFIED');
    expect(getDiffType(f(0, 1, 0, 0))).toBe('DELETED');
    expect(getDiffType(f(0, 0, 0, 1))).toBe('INSERTED');
    expect(getDiffFragmentType({ startOffset1: 0, endOffset1: 0, startOffset2: 0, endOffset2: 2 })).toBe('INSERTED');
    expect(getDiffFragmentType({ startOffset1: 0, endOffset1: 1, startOffset2: 0, endOffset2: 0 })).toBe('DELETED');
  });
});

describe('compareTexts (TextDiffProviderBase semantics)', () => {
  const t1 = 'a\nfoo(a, b)\nc\n  d\n';
  const t2 = 'a\nfoo(a, c)\nc\nd\n';

  test('BY_WORD (default) squashes and computes inner word fragments', () => {
    const fs = compareTexts(t1, t2);
    checkLineConsistency(fs, t1, t2);
    expect(lines(fs)).toEqual([[1, 2, 1, 2], [3, 4, 3, 4]]);
    // "foo(a, b)" vs "foo(a, c)": only 'b' -> 'c'
    expect(fs[0].innerFragments).toEqual([{ startOffset1: 7, endOffset1: 8, startOffset2: 7, endOffset2: 8 }]);
    // whitespace-only change in DEFAULT policy: highlighted as inner whitespace change
    expect(fs[1].innerFragments).toEqual([{ startOffset1: 0, endOffset1: 2, startOffset2: 0, endOffset2: 0 }]);
  });

  test('BY_LINE has no inner fragments', () => {
    const fs = compareTexts(t1, t2, { highlightPolicy: 'BY_LINE' });
    expect(lines(fs)).toEqual([[1, 2, 1, 2], [3, 4, 3, 4]]);
    for (const f of fs) expect(f.innerFragments).toBeNull();
  });

  test('BY_CHAR computes char-level inner fragments', () => {
    const fs = compareTexts('abcd\n', 'abXd\n', { highlightPolicy: 'BY_CHAR' });
    expect(fs).toHaveLength(1);
    expect(fs[0].innerFragments).toEqual([{ startOffset1: 2, endOffset1: 3, startOffset2: 2, endOffset2: 3 }]);
  });

  test('DO_NOT_HIGHLIGHT returns no changes', () => {
    expect(compareTexts(t1, t2, { highlightPolicy: 'DO_NOT_HIGHLIGHT' })).toEqual([]);
  });

  test('TRIM_WHITESPACES ignores leading/trailing whitespace', () => {
    const fs = compareTexts(t1, t2, { ignorePolicy: 'TRIM_WHITESPACES' });
    expect(lines(fs)).toEqual([[1, 2, 1, 2]]);
  });

  test('IGNORE_WHITESPACES keeps whitespace-only insertions as "ignored" ([] inner), CHUNKS drops them', () => {
    const a = 'x\ny\n';
    const b = 'x\n\n   \ny\n';
    const ignore = compareTexts(a, b, { ignorePolicy: 'IGNORE_WHITESPACES' });
    expect(lines(ignore)).toEqual([[1, 1, 1, 3]]);
    expect(ignore[0].innerFragments).toEqual([]);
    expect(compareTexts(a, b, { ignorePolicy: 'IGNORE_WHITESPACES_CHUNKS' })).toEqual([]);
  });

  test('BY_WORD_SPLIT does not squash split blocks', () => {
    const a = 'aaa bbb\nccc ddd\n';
    const b = 'aaa XXX\nccc YYY\n';
    const split = compareTexts(a, b, { highlightPolicy: 'BY_WORD_SPLIT' });
    const word = compareTexts(a, b, { highlightPolicy: 'BY_WORD' });
    expect(lines(split)).toEqual([[0, 1, 0, 1], [1, 2, 1, 2]]);
    expect(lines(word)).toEqual([[0, 2, 0, 2]]);
    expect(word[0].innerFragments).toEqual([
      { startOffset1: 4, endOffset1: 7, startOffset2: 4, endOffset2: 7 },
      { startOffset1: 12, endOffset1: 15, startOffset2: 12, endOffset2: 15 },
    ]);
  });

  test('equal texts produce no changes', () => {
    expect(compareTexts('abc\n', 'abc\n')).toEqual([]);
    expect(compareTexts('', '')).toEqual([]);
  });

  test('line-level DiffTooBigError: strict rethrows, compareTexts falls back to one block', { timeout: 60000 }, () => {
    // Every line occurs twice on each side (no unique lines => patience fallback cannot reduce the problem),
    // and the order is shuffled so that Myers exceeds its difference budget.
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const base: string[] = [];
    for (let i = 0; i < 6000; i++) base.push(`line ${i}`, `line ${i}`);
    const shuffled = [...base];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const a = base.join('\n');
    const b = shuffled.join('\n');
    expect(() => compareTextsStrict(a, b, { highlightPolicy: 'BY_LINE' })).toThrow(DiffTooBigError);
    const fs = compareTexts(a, b, { highlightPolicy: 'BY_LINE' });
    expect(fs).toHaveLength(1);
    expect(fs[0]).toMatchObject({ startLine1: 0, endLine1: 12000, startLine2: 0, endLine2: 12000, innerFragments: null });
  });
});

describe('mergeLines', () => {
  test('non-conflicting changes on both sides', () => {
    const base = 'a\nb\nc\nd\n';
    const left = 'a\nB\nc\nd\n';
    const right = 'a\nb\nc\nD\n';
    const fs = mergeLines(left, base, right);
    expect(fs.map((f) => [f.startLine, f.endLine])).toEqual([[[1, 1, 1], [2, 2, 2]], [[3, 3, 3], [4, 4, 4]]]);
    expect(fs[0].conflictType).toEqual({ type: 'MODIFIED', leftChange: true, rightChange: false, canBeResolved: true });
    expect(fs[1].conflictType).toEqual({ type: 'MODIFIED', leftChange: false, rightChange: true, canBeResolved: true });
    // left vs base inner fragments; right side not involved
    expect(fs[0].innerFragments![0]).toEqual([{ startOffset1: 0, endOffset1: 1, startOffset2: 0, endOffset2: 1 }]);
    expect(fs[0].innerFragments![2]).toBeNull();
  });

  test('conflict resolvable by the magic wand', () => {
    // MergeResolveUtilTest: ("x x x", "x Y x x", "x x Z x") -> "x Y x Z x"
    const base = 'x x x\n';
    const left = 'x Y x x\n';
    const right = 'x x Z x\n';
    const fs = mergeLines(left, base, right);
    expect(fs).toHaveLength(1);
    expect(fs[0].conflictType).toEqual({ type: 'CONFLICT', leftChange: true, rightChange: true, canBeResolved: true });
  });

  test('unresolvable conflict', () => {
    const fs = mergeLines('a X c\n', 'a b c\n', 'a Y c\n');
    expect(fs).toHaveLength(1);
    expect(fs[0].conflictType).toEqual({ type: 'CONFLICT', leftChange: true, rightChange: true, canBeResolved: false });
  });

  test('insertions and deletions', () => {
    const fs = mergeLines('a\nnew\nb\n', 'a\nb\nc\n', 'a\nb\n');
    expect(fs.map((f) => f.conflictType.type)).toEqual(['INSERTED', 'DELETED']);
  });

  test('ignored whitespace-only blocks with non-DEFAULT policy', () => {
    const fs = mergeLines('a\n  b\nc\n', 'a\nb\nc\n', 'a\nb\nc\n', 'IGNORE_WHITESPACES');
    expect(fs).toHaveLength(1);
    expect(fs[0].conflictType).toEqual({ type: 'MODIFIED', leftChange: true, rightChange: false, canBeResolved: true });
    // left and base differ only in whitespace; right side is not involved
    expect(fs[0].innerFragments).toEqual([[], [], null]);
  });
});
