// Ported from com.intellij.diff.util.MergeRangeUtil + MergeConflictType (JetBrains/intellij-community, Apache-2.0).
import type { ComparisonPolicy, MergeConflictType, MergeLineFragment, TextDiffType, ThreeSide } from '../types';
import { isEqualTexts } from '../text/equality';
import { getLinesContent, type LineOffsets } from '../text/lineOffsets';
import type { MergeRange } from '../util/range';
import { tryResolveConflict } from '../comparison/comparisonMergeUtil';

export const LEFT: ThreeSide = 0;
export const BASE: ThreeSide = 1;
export const RIGHT: ThreeSide = 2;

function conflictType(type: TextDiffType, leftChange: boolean, rightChange: boolean, canBeResolved = true): MergeConflictType {
  return { type, leftChange, rightChange, canBeResolved };
}

/** MergeConflictType.isChange(ThreeSide). */
export function isChange(t: MergeConflictType, side: ThreeSide): boolean {
  return side === LEFT ? t.leftChange : side === RIGHT ? t.rightChange : true;
}

export function getMergeType(
  emptiness: (side: ThreeSide) => boolean,
  equality: (side1: ThreeSide, side2: ThreeSide) => boolean,
  trueEquality: ((side1: ThreeSide, side2: ThreeSide) => boolean) | null,
  conflictResolver: () => boolean,
): MergeConflictType {
  const isLeftEmpty = emptiness(LEFT);
  const isBaseEmpty = emptiness(BASE);
  const isRightEmpty = emptiness(RIGHT);
  if (isLeftEmpty && isBaseEmpty && isRightEmpty) throw new Error('check failed: empty merge fragment');

  if (isBaseEmpty) {
    if (isLeftEmpty) return conflictType('INSERTED', false, true); // --=
    if (isRightEmpty) return conflictType('INSERTED', true, false); // =--
    // =-=
    if (equality(LEFT, RIGHT)) return conflictType('INSERTED', true, true);
    return conflictType('CONFLICT', true, true, false);
  }
  if (isLeftEmpty && isRightEmpty) return conflictType('DELETED', true, true); // -=-

  // -==, ==-, ===
  const unchangedLeft = equality(BASE, LEFT);
  const unchangedRight = equality(BASE, RIGHT);
  if (unchangedLeft && unchangedRight) {
    if (trueEquality == null) throw new Error('check failed: trueEquality is required');
    const trueUnchangedLeft = trueEquality(BASE, LEFT);
    const trueUnchangedRight = trueEquality(BASE, RIGHT);
    if (trueUnchangedLeft && trueUnchangedRight) throw new Error('check failed: unchanged merge fragment');
    return conflictType('MODIFIED', !trueUnchangedLeft, !trueUnchangedRight);
  }
  if (unchangedLeft) return conflictType(isRightEmpty ? 'DELETED' : 'MODIFIED', false, true);
  if (unchangedRight) return conflictType(isLeftEmpty ? 'DELETED' : 'MODIFIED', true, false);
  if (equality(LEFT, RIGHT)) return conflictType('MODIFIED', true, true);
  const canBeResolved = !isLeftEmpty && !isRightEmpty && conflictResolver();
  return conflictType('CONFLICT', true, true, canBeResolved);
}

type Texts = readonly [string, string, string];
type Offsets = readonly [LineOffsets, LineOffsets, LineOffsets];

/** Used by the merge viewer: detects "ignored" (whitespace-only) blocks via DEFAULT trueEquality. */
export function getLineMergeType(fragment: MergeLineFragment, texts: Texts, offsets: Offsets, policy: ComparisonPolicy): MergeConflictType {
  return getMergeType(
    (side) => fragment.startLine[side] === fragment.endLine[side],
    (s1, s2) => compareLineMergeContents(fragment, texts, offsets, policy, s1, s2),
    (s1, s2) => compareLineMergeContents(fragment, texts, offsets, 'DEFAULT', s1, s2),
    () => canResolveLineConflict(fragment, texts, offsets),
  );
}

/** Used by the 3-way diff viewer (no ignored blocks). */
export function getLineThreeWayDiffType(fragment: MergeLineFragment, texts: Texts, offsets: Offsets, policy: ComparisonPolicy): MergeConflictType {
  return getMergeType(
    (side) => fragment.startLine[side] === fragment.endLine[side],
    (s1, s2) => compareLineMergeContents(fragment, texts, offsets, policy, s1, s2),
    null,
    () => canResolveLineConflict(fragment, texts, offsets),
  );
}

function canResolveLineConflict(fragment: MergeLineFragment, texts: Texts, offsets: Offsets): boolean {
  const contents = ([LEFT, BASE, RIGHT] as const).map((side) =>
    getLinesContent(texts[side], offsets[side], fragment.startLine[side], fragment.endLine[side]));
  return tryResolveConflict(contents[0], contents[1], contents[2]) != null;
}

function compareLineMergeContents(
  fragment: MergeLineFragment, texts: Texts, offsets: Offsets, policy: ComparisonPolicy, side1: ThreeSide, side2: ThreeSide,
): boolean {
  const start1 = fragment.startLine[side1];
  const end1 = fragment.endLine[side1];
  const start2 = fragment.startLine[side2];
  const end2 = fragment.endLine[side2];
  if (end2 - start2 !== end1 - start1) return false;
  for (let i = 0; i < end1 - start1; i++) {
    const line1 = start1 + i;
    const line2 = start2 + i;
    const content1 = getLinesContent(texts[side1], offsets[side1], line1, line1 + 1);
    const content2 = getLinesContent(texts[side2], offsets[side2], line2, line2 + 1);
    if (!isEqualTexts(content1, content2, policy)) return false;
  }
  return true;
}

function startOffset(r: MergeRange, side: ThreeSide): number {
  return side === LEFT ? r.start1 : side === BASE ? r.start2 : r.start3;
}

function endOffset(r: MergeRange, side: ThreeSide): number {
  return side === LEFT ? r.end1 : side === BASE ? r.end2 : r.end3;
}

/** Word-level merge type (1 = left, 2 = base, 3 = right offsets). The resolver is always false. */
export function getWordMergeType(fragment: MergeRange, texts: Texts, policy: ComparisonPolicy): MergeConflictType {
  return getMergeType(
    (side) => startOffset(fragment, side) === endOffset(fragment, side),
    (s1, s2) => compareWordMergeContents(fragment, texts, policy, s1, s2),
    null,
    () => false,
  );
}

export function compareWordMergeContents(fragment: MergeRange, texts: Texts, policy: ComparisonPolicy, side1: ThreeSide, side2: ThreeSide): boolean {
  const content1 = texts[side1].substring(startOffset(fragment, side1), endOffset(fragment, side1));
  const content2 = texts[side2].substring(startOffset(fragment, side2), endOffset(fragment, side2));
  return isEqualTexts(content1, content2, policy);
}
