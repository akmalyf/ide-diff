// By-word differences inside one merge change (MergeThreesideViewer.MyInnerDiffWorker + InnerChunkData):
// port of DiffUtil.compareThreesideInner on the current left / result / right chunk texts.
import { compareWords, isEqualTexts, type ComparisonPolicy } from '@ide-diff/core';

/** [start, end) offsets relative to the chunk start on that side */
export type InnerRanges = Array<[number, number]>;
/** MergeInnerDifferences: per ThreeSide ranges, null = side not compared */
export type ThreesideInner = [InnerRanges | null, InnerRanges | null, InnerRanges | null];

/** DiffUtil.compareThreesideInner. Returns null when nothing can be compared. @throws DiffTooBigError */
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
    const left: InnerRanges = [];
    const base: InnerRanges = [];
    const right: InnerRanges = [];
    for (const f of compareWords(c1, c0, policy)) {
      base.push([f.startOffset1, f.endOffset1]);
      left.push([f.startOffset2, f.endOffset2]);
    }
    for (const f of compareWords(c1, c2, policy)) {
      base.push([f.startOffset1, f.endOffset1]);
      right.push([f.startOffset2, f.endOffset2]);
    }
    return [left, base, right];
  }

  // ==-, =-=, -==
  const side1 = c0 != null ? 0 : 1;
  const side2 = c2 != null ? 2 : 1;
  const words = compareWords(chunks[side1]!, chunks[side2]!, policy);
  const result: ThreesideInner = [null, null, null];
  result[side1] = words.map((f) => [f.startOffset1, f.endOffset1]);
  result[side2] = words.map((f) => [f.startOffset2, f.endOffset2]);
  return result;
}
