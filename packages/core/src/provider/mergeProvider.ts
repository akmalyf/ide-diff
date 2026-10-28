// Mirrors com.intellij.diff.merge.MergeDiffBuilder.rediff + MergeThreesideViewer's inner pass
// (JetBrains/intellij-community, Apache-2.0).
import type { ComparisonPolicy, MergeLineFragmentWithType, ThreeSide } from '../types';
import { DiffTooBigError } from '../types';
import { getLinesContent, LineOffsets } from '../text/lineOffsets';
import { mergeLinesRaw } from '../comparison/comparisonManager';
import { getLineMergeType, isChange } from '../merge/mergeRangeUtil';
import { compareThreesideInner } from '../merge/threesideInner';

/**
 * 3-way merge of (left, base, right) by lines, with conflict types and word-level inner fragments.
 * Inner fragments per side are one-sided ranges encoded as DiffFragments (only startOffset1/endOffset1 matter),
 * relative to the start of the chunk's first line on that side. Base ranges may be unsorted/overlapping
 * (base-vs-left ranges followed by base-vs-right ranges), as in IntelliJ.
 * @throws DiffTooBigError when the line-level merge is too big.
 */
export function mergeLines(left: string, base: string, right: string, policy: ComparisonPolicy = 'DEFAULT'): MergeLineFragmentWithType[] {
  const texts = [left, base, right] as const;
  const offsets = [LineOffsets.create(left), LineOffsets.create(base), LineOffsets.create(right)] as const;
  const fragments = mergeLinesRaw(left, base, right, policy);
  return fragments.map((fragment) => {
    const conflictType = getLineMergeType(fragment, texts, offsets, policy);
    const chunks = ([0, 1, 2] as ThreeSide[]).map((side) => {
      const start = fragment.startLine[side];
      const end = fragment.endLine[side];
      if (!isChange(conflictType, side) || start === end) return null;
      return getLinesContent(texts[side], offsets[side], start, end);
    }) as [string | null, string | null, string | null];
    let innerFragments: MergeLineFragmentWithType['innerFragments'] = null;
    try {
      innerFragments = compareThreesideInner(chunks, policy);
    } catch (e) {
      if (!(e instanceof DiffTooBigError)) throw e;
    }
    return { startLine: fragment.startLine, endLine: fragment.endLine, conflictType, innerFragments };
  });
}
