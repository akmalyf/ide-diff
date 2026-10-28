// Ported from com.intellij.diff.util.DiffUtil.compareThreesideInner (JetBrains/intellij-community, Apache-2.0).
import type { ComparisonPolicy, DiffFragment } from '../types';
import { isEqualTexts } from '../text/equality';
import { compareWords } from '../comparison/byWord';

/** One-sided text range [start, end) encoded as a DiffFragment with both sides equal (only `*1` is meaningful). */
export function textRange(start: number, end: number): DiffFragment {
  return { startOffset1: start, endOffset1: end, startOffset2: start, endOffset2: end };
}

export type ThreesideInner = [DiffFragment[] | null, DiffFragment[] | null, DiffFragment[] | null];

/**
 * Per-side word ranges for a merge chunk (left, base, right; `null` = side not involved).
 * Ranges are relative to each chunk start. Returns null when nothing can be compared.
 * Note: base ranges are concatenated (base-vs-left followed by base-vs-right), NOT sorted — exactly as in IntelliJ.
 */
export function compareThreesideInner(chunks: readonly [string | null, string | null, string | null], policy: ComparisonPolicy): ThreesideInner | null {
  const [c0, c1, c2] = chunks;
  if (c0 == null && c1 == null && c2 == null) return null; // ---

  if (policy === 'IGNORE_WHITESPACES') {
    if (isEqualTexts(c0 ?? '', c1 ?? '', policy) && isEqualTexts(c0 ?? '', c2 ?? '', policy)) {
      // whitespace-only changes, ex: empty lines added/removed
      return [[], [], []];
    }
  }

  if ((c0 == null && c1 == null) || (c0 == null && c2 == null) || (c1 == null && c2 == null)) return null; // =--, -=-, --=

  if (c0 != null && c1 != null && c2 != null) {
    // ===
    const fragments1 = compareWords(c1, c0, policy);
    const fragments2 = compareWords(c1, c2, policy);
    const left: DiffFragment[] = [];
    const base: DiffFragment[] = [];
    const right: DiffFragment[] = [];
    for (const f of fragments1) {
      base.push(textRange(f.startOffset1, f.endOffset1));
      left.push(textRange(f.startOffset2, f.endOffset2));
    }
    for (const f of fragments2) {
      base.push(textRange(f.startOffset1, f.endOffset1));
      right.push(textRange(f.startOffset2, f.endOffset2));
    }
    return [left, base, right];
  }

  // ==-, =-=, -==
  const side1 = c0 != null ? 0 : 1;
  const side2 = c2 != null ? 2 : 1;
  const wordConflicts = compareWords(chunks[side1]!, chunks[side2]!, policy);
  const result: ThreesideInner = [null, null, null];
  result[side1] = wordConflicts.map((f) => textRange(f.startOffset1, f.endOffset1));
  result[side2] = wordConflicts.map((f) => textRange(f.startOffset2, f.endOffset2));
  return result;
}
