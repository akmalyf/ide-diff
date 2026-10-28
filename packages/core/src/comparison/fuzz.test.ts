// Randomized consistency checks, modelled after intellij-community ComparisonUtilAutoTest (JetBrains, Apache-2.0).
import { describe, expect, test } from 'vitest';
import type { ComparisonPolicy, DiffFragment, HighlightPolicy, IgnorePolicy, LineFragment } from '../types';
import { isEqualTexts } from '../text/equality';
import { LineOffsets } from '../text/lineOffsets';
import { compareTexts } from '../provider/textDiffProvider';
import { mergeLines } from '../provider/mergeProvider';
import { compareChars, compareLinesInnerWithPolicy, compareWords, processBlocks, squash } from './comparisonManager';
import { checkLineConsistency, chFace, chGun, chMan, chSmile } from '../test/dsl';

const RUNS = 30;
const MAX_LENGTH = 300;
const POLICIES: ComparisonPolicy[] = ['DEFAULT', 'TRIM_WHITESPACES', 'IGNORE_WHITESPACES'];
const CHAR_TABLE = ['\n', '\n', '\t', ' ', ' ', '.', '<', '!'];

/** mulberry32 */
function rng(seed: number): (n: number) => number {
  let a = seed >>> 0;
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

function generateText(next: (n: number) => number, useHighSurrogates: boolean): string {
  const table = useHighSurrogates ? [...CHAR_TABLE, chSmile, chFace, chGun, chMan] : CHAR_TABLE;
  const count = 12 + (useHighSurrogates ? 4 : 0);
  const length = next(MAX_LENGTH + 1);
  let s = '';
  for (let i = 0; i < length; i++) {
    const rnd = next(count);
    s += rnd < table.length ? table[rnd] : String.fromCharCode(rnd + 97);
  }
  return s;
}

function forEachPair(seed: number, f: (t1: string, t2: string) => void): void {
  const next = rng(seed);
  for (let run = 0; run < RUNS; run++) {
    for (const surrogates of [true, false]) {
      const t1 = generateText(next, surrogates);
      const t2 = generateText(next, surrogates);
      try {
        f(t1, t2);
      } catch (e) {
        throw new Error(`seed ${seed}, run ${run}: ${JSON.stringify(t1)} vs ${JSON.stringify(t2)}\n${(e as Error).message}`);
      }
    }
  }
}

const stripNewline = (s: string): string | null => (s.endsWith('\n') ? s.substring(0, s.length - 1) : null);
const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;

function checkCodePointBoundary(text: string, offset: number): void {
  if (offset > 0 && offset < text.length) {
    expect(isHigh(text.charCodeAt(offset - 1)) && isLow(text.charCodeAt(offset)), `surrogate pair split at ${offset}`).toBe(false);
  }
}

/**
 * Fragments are ordered, non-overlapping and non-empty; unchanged gaps are equal (exactly for DEFAULT, ignoring whitespace
 * otherwise); changed fragments are not equal; for DEFAULT, applying the diff to text1 reconstructs text2.
 */
function checkDiffFragments(text1: string, text2: string, fragments: readonly DiffFragment[], policy: ComparisonPolicy, lineLevel: boolean): void {
  const gapsEqual = (g1: string, g2: string): boolean => {
    if (policy !== 'DEFAULT') return isEqualTexts(g1, g2, 'IGNORE_WHITESPACES');
    if (g1 === g2) return true;
    // line fragments: the trailing '\n' of the last line may belong to the unchanged part (DiffTestCase skipLastNewline)
    return lineLevel && (stripNewline(g1) === g2 || g1 === stripNewline(g2));
  };
  let last1 = 0;
  let last2 = 0;
  let rebuilt = '';
  for (const f of fragments) {
    expect(f.startOffset1 !== f.endOffset1 || f.startOffset2 !== f.endOffset2, 'empty fragment').toBe(true);
    expect(last1 <= f.startOffset1 && f.startOffset1 <= f.endOffset1 && f.endOffset1 <= text1.length, 'order 1').toBe(true);
    expect(last2 <= f.startOffset2 && f.startOffset2 <= f.endOffset2 && f.endOffset2 <= text2.length, 'order 2').toBe(true);
    for (const o of [f.startOffset1, f.endOffset1]) checkCodePointBoundary(text1, o);
    for (const o of [f.startOffset2, f.endOffset2]) checkCodePointBoundary(text2, o);
    const gap1 = text1.substring(last1, f.startOffset1);
    const gap2 = text2.substring(last2, f.startOffset2);
    expect(gapsEqual(gap1, gap2), `unchanged gap ${JSON.stringify(gap1)} vs ${JSON.stringify(gap2)}`).toBe(true);
    if (!lineLevel) {
      const ch1 = text1.substring(f.startOffset1, f.endOffset1);
      const ch2 = text2.substring(f.startOffset2, f.endOffset2);
      expect(isEqualTexts(ch1, ch2, policy === 'IGNORE_WHITESPACES' ? 'IGNORE_WHITESPACES' : 'DEFAULT'), 'changed fragment is equal').toBe(false);
    }
    rebuilt += gap1 + text2.substring(f.startOffset2, f.endOffset2);
    last1 = f.endOffset1;
    last2 = f.endOffset2;
  }
  const tail1 = text1.substring(last1);
  const tail2 = text2.substring(last2);
  expect(gapsEqual(tail1, tail2), 'unchanged tail').toBe(true);
  rebuilt += tail1;
  if (policy === 'DEFAULT' && !lineLevel) expect(rebuilt, 'applying the diff to text1 reconstructs text2').toBe(text2);
}

/** Line fragments: consistent with line offsets, ordered, unchanged lines equal under the policy, inner fragments valid. */
function checkLineFragments(text1: string, text2: string, fragments: readonly LineFragment[], policy: ComparisonPolicy): void {
  checkLineConsistency(fragments, text1, text2);
  checkDiffFragments(text1, text2, fragments, policy, true);
  const lo1 = LineOffsets.create(text1);
  const lo2 = LineOffsets.create(text2);
  let lastLine1 = 0;
  let lastLine2 = 0;
  const unchangedLinesEqual = (end1: number, end2: number) => {
    expect(end1 - lastLine1, 'unchanged line counts').toBe(end2 - lastLine2);
    for (let i = 0; i < end1 - lastLine1; i++) {
      const l1 = text1.substring(lo1.getLineStart(lastLine1 + i), lo1.getLineEnd(lastLine1 + i));
      const l2 = text2.substring(lo2.getLineStart(lastLine2 + i), lo2.getLineEnd(lastLine2 + i));
      expect(isEqualTexts(l1, l2, policy), `unchanged line ${JSON.stringify(l1)} vs ${JSON.stringify(l2)}`).toBe(true);
    }
  };
  for (const f of fragments) {
    expect(lastLine1 <= f.startLine1 && lastLine2 <= f.startLine2).toBe(true);
    unchangedLinesEqual(f.startLine1, f.startLine2);
    lastLine1 = f.endLine1;
    lastLine2 = f.endLine2;
    if (f.innerFragments) {
      const sub1 = text1.substring(f.startOffset1, f.endOffset1);
      const sub2 = text2.substring(f.startOffset2, f.endOffset2);
      // inner fragments are relative to the fragment start (IntelliJ: checkResultWord on inner fragments)
      checkDiffFragments(sub1, sub2, f.innerFragments, policy, false);
      let i1 = 0;
      let i2 = 0;
      for (const inner of f.innerFragments) {
        expect(i1 <= inner.startOffset1 && inner.startOffset1 <= inner.endOffset1 && inner.endOffset1 <= sub1.length).toBe(true);
        expect(i2 <= inner.startOffset2 && inner.startOffset2 <= inner.endOffset2 && inner.endOffset2 <= sub2.length).toBe(true);
        i1 = inner.endOffset1;
        i2 = inner.endOffset2;
      }
    }
  }
  unchangedLinesEqual(lo1.lineCount, lo2.lineCount);
}

describe('fuzz (ComparisonUtilAutoTest)', () => {
  test('chars', () => {
    forEachPair(1, (t1, t2) => {
      for (const policy of POLICIES) checkDiffFragments(t1, t2, compareChars(t1, t2, policy), policy, false);
    });
  });

  test('words', () => {
    forEachPair(2, (t1, t2) => {
      for (const policy of POLICIES) checkDiffFragments(t1, t2, compareWords(t1, t2, policy), policy, false);
    });
  });

  test('lines (WORDS and CHARS inner), squashed and trimmed', () => {
    forEachPair(3, (t1, t2) => {
      for (const policy of POLICIES) {
        for (const inner of ['WORDS', 'CHARS'] as const) {
          const fragments = compareLinesInnerWithPolicy(t1, t2, policy, inner);
          checkLineFragments(t1, t2, fragments, policy);
          checkLineFragments(t1, t2, squash(fragments), policy);
          checkLineFragments(t1, t2, processBlocks(fragments, t1, t2, policy, true, true), policy);
        }
      }
    });
  });

  test('compareTexts with every Ignore/Highlight policy', () => {
    const ignorePolicies: IgnorePolicy[] = ['DEFAULT', 'TRIM_WHITESPACES', 'IGNORE_WHITESPACES', 'IGNORE_WHITESPACES_CHUNKS'];
    const highlightPolicies: HighlightPolicy[] = ['BY_LINE', 'BY_WORD', 'BY_WORD_SPLIT', 'BY_CHAR'];
    forEachPair(4, (t1, t2) => {
      for (const ip of ignorePolicies) {
        for (const hp of highlightPolicies) {
          const policy: ComparisonPolicy = ip === 'IGNORE_WHITESPACES_CHUNKS' ? 'IGNORE_WHITESPACES' : ip;
          checkLineFragments(t1, t2, compareTexts(t1, t2, { ignorePolicy: ip, highlightPolicy: hp }), policy);
        }
      }
    });
  });

  test('mergeLines', () => {
    const next = rng(5);
    for (let run = 0; run < RUNS; run++) {
      for (const surrogates of [true, false]) {
        const texts = [generateText(next, surrogates), generateText(next, surrogates), generateText(next, surrogates)] as const;
        for (const policy of POLICIES) {
          const fragments = mergeLines(texts[0], texts[1], texts[2], policy);
          const offsets = texts.map((t) => LineOffsets.create(t));
          const last = [0, 0, 0];
          for (const f of fragments) {
            const unchanged = f.startLine[1] - last[1];
            for (let side = 0; side < 3; side++) {
              expect(last[side] <= f.startLine[side] && f.startLine[side] <= f.endLine[side]).toBe(true);
              expect(f.endLine[side] <= offsets[side].lineCount).toBe(true);
              expect(f.startLine[side] - last[side], 'unchanged stretch has equal length on all sides').toBe(unchanged);
              last[side] = f.endLine[side];
            }
            expect(f.startLine.some((s, i) => s !== f.endLine[i]), 'empty merge fragment').toBe(true);
            if (f.conflictType.type !== 'CONFLICT') expect(f.conflictType.canBeResolved).toBe(true);
          }
          for (let side = 0; side < 3; side++) {
            expect(offsets[side].lineCount - last[side]).toBe(offsets[1].lineCount - last[1]);
          }
        }
      }
    }
  });
});
