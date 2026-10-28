// Ported from com.intellij.diff.comparison.ComparisonManagerImpl (JetBrains/intellij-community, Apache-2.0).
import type { ComparisonPolicy, DiffFragment, LineFragment, MergeLineFragment } from '../types';
import { DiffTooBigError } from '../types';
import { MAX_BAD_LINES } from '../config';
import { isEqualTexts, isEquals } from '../text/equality';
import { getLines, LineOffsets } from '../text/lineOffsets';
import type { DiffIterable } from '../iterables/diffIterable';
import { createDiffFragment, createLineFragment, withInnerFragments } from '../util/fragments';
import type { MergeRange } from '../util/range';
import { compareIgnoreWhitespaces, compareTrimWhitespaces, compareTwoStep } from './byChar';
import { compareLines3Rt, compareLinesRt, mergeLinesRt } from './byLine';
import { compareAndSplit, compareWords as byWordCompare, convertIntoDiffFragments } from './byWord';

export type InnerFragmentsPolicy = 'NONE' | 'WORDS' | 'CHARS';

/** ComparisonManager.compareLines: line fragments with `innerFragments = null`. @throws DiffTooBigError */
export function compareLines(
  text1: string, text2: string, policy: ComparisonPolicy = 'DEFAULT',
  lineOffsets1: LineOffsets = LineOffsets.create(text1), lineOffsets2: LineOffsets = LineOffsets.create(text2),
): LineFragment[] {
  const iterable = compareLinesRt(getLines(text1, lineOffsets1), getLines(text2, lineOffsets2), policy);
  return convertIntoLineFragments(lineOffsets1, lineOffsets2, iterable);
}

/**
 * ComparisonManager.compareLinesInner with an explicit inner fragments policy. Inner failures (too big) are swallowed;
 * a line-level DiffTooBigError propagates.
 */
export function compareLinesInnerWithPolicy(
  text1: string, text2: string, policy: ComparisonPolicy, fragmentsPolicy: InnerFragmentsPolicy,
  lineOffsets1: LineOffsets = LineOffsets.create(text1), lineOffsets2: LineOffsets = LineOffsets.create(text2),
): LineFragment[] {
  const lineFragments = compareLines(text1, text2, policy, lineOffsets1, lineOffsets2);
  if (fragmentsPolicy === 'NONE') return lineFragments;
  return createInnerFragments(lineFragments, text1, text2, policy, fragmentsPolicy);
}

/** ComparisonManager.compareLinesInner(text1, text2, policy): WORDS inner fragments, not squashed. */
export function compareLinesInner(text1: string, text2: string, policy: ComparisonPolicy = 'DEFAULT'): LineFragment[] {
  return compareLinesInnerWithPolicy(text1, text2, policy, 'WORDS');
}

/** ComparisonManager.compareLines(text1, text2, text3) — 3-way diff without ignored blocks. Texts: left, base, right. */
export function compareLines3(text1: string, text2: string, text3: string, policy: ComparisonPolicy = 'DEFAULT'): MergeLineFragment[] {
  return compareLines3Rt(getLines(text1), getLines(text2), getLines(text3), policy).map(toMergeLineFragment);
}

/** ComparisonManager.mergeLines(text1, text2, text3) — 3-way merge (keeps ignored blocks). Texts: left, base, right. */
export function mergeLinesRaw(text1: string, text2: string, text3: string, policy: ComparisonPolicy = 'DEFAULT'): MergeLineFragment[] {
  return mergeLinesRt(getLines(text1), getLines(text2), getLines(text3), policy).map(toMergeLineFragment);
}

export function toMergeLineFragment(r: MergeRange): MergeLineFragment {
  return { startLine: [r.start1, r.start2, r.start3], endLine: [r.end1, r.end2, r.end3] };
}

function createInnerFragments(
  lineFragments: readonly LineFragment[], text1: string, text2: string, policy: ComparisonPolicy, fragmentsPolicy: InnerFragmentsPolicy,
): LineFragment[] {
  const result: LineFragment[] = [];
  let tooBigChunksCount = 0;
  for (const fragment of lineFragments) {
    try {
      const tryComputeDifferences = tooBigChunksCount < MAX_BAD_LINES;
      result.push(...createInnerFragmentsFor(fragment, text1, text2, policy, fragmentsPolicy, tryComputeDifferences));
    } catch (e) {
      if (!(e instanceof DiffTooBigError)) throw e;
      result.push(fragment);
      tooBigChunksCount++;
    }
  }
  return result;
}

function createInnerFragmentsFor(
  fragment: LineFragment, text1: string, text2: string, policy: ComparisonPolicy, fragmentsPolicy: InnerFragmentsPolicy,
  tryComputeDifferences: boolean,
): LineFragment[] {
  if (fragmentsPolicy === 'NONE') return [fragment];
  const subSequence1 = text1.substring(fragment.startOffset1, fragment.endOffset1);
  const subSequence2 = text2.substring(fragment.startOffset2, fragment.endOffset2);

  if (fragment.startLine1 === fragment.endLine1 || fragment.startLine2 === fragment.endLine2) {
    // Insertion / Deletion
    if (isEqualTexts(subSequence1, subSequence2, policy)) return [withInnerFragments(fragment, [])];
    return [fragment];
  }

  if (!tryComputeDifferences) return [fragment];

  if (fragmentsPolicy === 'WORDS') return createInnerWordFragments(fragment, subSequence1, subSequence2, policy);
  return [withInnerFragments(fragment, compareChars(subSequence1, subSequence2, policy))];
}

function createInnerWordFragments(fragment: LineFragment, subSequence1: string, subSequence2: string, policy: ComparisonPolicy): LineFragment[] {
  const lineBlocks = compareAndSplit(subSequence1, subSequence2, policy);
  if (lineBlocks.length === 0) throw new Error('check failed: no line blocks');
  const startOffset1 = fragment.startOffset1;
  const startOffset2 = fragment.startOffset2;
  let currentStartLine1 = fragment.startLine1;
  let currentStartLine2 = fragment.startLine2;
  const chunks: LineFragment[] = [];
  for (let i = 0; i < lineBlocks.length; i++) {
    const block = lineBlocks[i];
    const offsets = block.offsets;
    const isLast = i === lineBlocks.length - 1;
    const currentEndLine1 = !isLast ? currentStartLine1 + block.newlines1 : fragment.endLine1;
    const currentEndLine2 = !isLast ? currentStartLine2 + block.newlines2 : fragment.endLine2;
    chunks.push(createLineFragment(currentStartLine1, currentEndLine1, currentStartLine2, currentEndLine2,
      offsets.start1 + startOffset1, offsets.end1 + startOffset1,
      offsets.start2 + startOffset2, offsets.end2 + startOffset2,
      block.fragments));
    currentStartLine1 = currentEndLine1;
    currentStartLine2 = currentEndLine2;
  }
  return chunks;
}

/** ComparisonManager.compareWords. @throws DiffTooBigError */
export function compareWords(text1: string, text2: string, policy: ComparisonPolicy = 'DEFAULT'): DiffFragment[] {
  return byWordCompare(text1, text2, policy);
}

/** ComparisonManager.compareChars. @throws DiffTooBigError */
export function compareChars(text1: string, text2: string, policy: ComparisonPolicy = 'DEFAULT'): DiffFragment[] {
  let iterable: DiffIterable;
  if (policy === 'DEFAULT') iterable = compareTwoStep(text1, text2);
  else if (policy === 'TRIM_WHITESPACES') iterable = compareTrimWhitespaces(text1, text2);
  else iterable = compareIgnoreWhitespaces(text1, text2);
  return convertIntoDiffFragments(iterable);
}

export function convertIntoLineFragments(lineOffsets1: LineOffsets, lineOffsets2: LineOffsets, changes: DiffIterable): LineFragment[] {
  return changes.changes().map((r) => createLineFragmentFromLines(r.start1, r.end1, r.start2, r.end2, lineOffsets1, lineOffsets2));
}

export function createLineFragmentFromLines(
  startLine1: number, endLine1: number, startLine2: number, endLine2: number, lineOffsets1: LineOffsets, lineOffsets2: LineOffsets,
): LineFragment {
  const [s1, e1] = getOffsets(lineOffsets1, startLine1, endLine1);
  const [s2, e2] = getOffsets(lineOffsets2, startLine2, endLine2);
  return createLineFragment(startLine1, endLine1, startLine2, endLine2, s1, e1, s2, e2);
}

function getOffsets(lineOffsets: LineOffsets, startIndex: number, endIndex: number): [number, number] {
  if (startIndex === endIndex) {
    const offset = startIndex < lineOffsets.lineCount
      ? lineOffsets.getLineStart(startIndex)
      : lineOffsets.getLineEnd(lineOffsets.lineCount - 1, true);
    return [offset, offset];
  }
  return [lineOffsets.getLineStart(startIndex), lineOffsets.getLineEnd(endIndex - 1, true)];
}

// ---- post-processing ----

/** Squash adjoining fragments (those produced by one compareAndSplit call) into one. */
export function squash(oldFragments: readonly LineFragment[]): LineFragment[] {
  if (oldFragments.length === 0) return [...oldFragments];
  const newFragments: LineFragment[] = [];
  processAdjoining(oldFragments, (fragments) => newFragments.push(doSquash(fragments)));
  return newFragments;
}

/**
 * ComparisonManagerImpl.processBlocks: optional squash of adjoining fragments and, for IGNORE_WHITESPACES with `trim`,
 * dropping of whitespace-only fragments at the edges of each adjoining group.
 */
export function processBlocks(
  oldFragments: readonly LineFragment[], text1: string, text2: string, policy: ComparisonPolicy, squashFragments: boolean, trim: boolean,
): LineFragment[] {
  if (!squashFragments && !trim) return [...oldFragments];
  if (oldFragments.length === 0) return [];
  const newFragments: LineFragment[] = [];
  processAdjoining(oldFragments, (fragments) => {
    newFragments.push(...processAdjoiningGroup(fragments, text1, text2, policy, squashFragments, trim));
  });
  return newFragments;
}

function processAdjoining(oldFragments: readonly LineFragment[], consumer: (fragments: readonly LineFragment[]) => void): void {
  let startIndex = 0;
  for (let i = 1; i < oldFragments.length; i++) {
    if (!isAdjoining(oldFragments[i - 1], oldFragments[i])) {
      consumer(oldFragments.slice(startIndex, i));
      startIndex = i;
    }
  }
  if (startIndex < oldFragments.length) consumer(oldFragments.slice(startIndex));
}

function processAdjoiningGroup(
  fragments: readonly LineFragment[], text1: string, text2: string, policy: ComparisonPolicy, squashFragments: boolean, trim: boolean,
): LineFragment[] {
  let start = 0;
  let end = fragments.length;
  if (trim && policy === 'IGNORE_WHITESPACES') {
    const isSignificant = (f: LineFragment): boolean =>
      (f.innerFragments == null || f.innerFragments.length !== 0) &&
      !isEquals(text1.substring(f.startOffset1, f.endOffset1), text2.substring(f.startOffset2, f.endOffset2), 'IGNORE_WHITESPACES');
    while (start < end && !isSignificant(fragments[start])) start++;
    while (start < end && !isSignificant(fragments[end - 1])) end--;
  }
  if (start === end) return [];
  if (squashFragments) return [doSquash(fragments.slice(start, end))];
  return fragments.slice(start, end);
}

function doSquash(oldFragments: readonly LineFragment[]): LineFragment {
  if (oldFragments.length === 0) throw new Error('check failed: empty group');
  if (oldFragments.length === 1) return oldFragments[0];
  const firstFragment = oldFragments[0];
  const lastFragment = oldFragments[oldFragments.length - 1];
  const newInnerFragments: DiffFragment[] = [];
  for (const fragment of oldFragments) {
    const shift1 = fragment.startOffset1 - firstFragment.startOffset1;
    const shift2 = fragment.startOffset2 - firstFragment.startOffset2;
    for (const inner of extractInnerFragments(fragment)) {
      const previous = newInnerFragments.length > 0 ? newInnerFragments[newInnerFragments.length - 1] : null;
      if (previous == null || !isAdjoiningInner(previous, inner, shift1, shift2)) {
        newInnerFragments.push(createDiffFragment(inner.startOffset1 + shift1, inner.endOffset1 + shift1,
          inner.startOffset2 + shift2, inner.endOffset2 + shift2));
      } else {
        newInnerFragments[newInnerFragments.length - 1] = createDiffFragment(previous.startOffset1, inner.endOffset1 + shift1,
          previous.startOffset2, inner.endOffset2 + shift2);
      }
    }
  }
  return createLineFragment(firstFragment.startLine1, lastFragment.endLine1, firstFragment.startLine2, lastFragment.endLine2,
    firstFragment.startOffset1, lastFragment.endOffset1, firstFragment.startOffset2, lastFragment.endOffset2,
    newInnerFragments);
}

function isAdjoining(before: LineFragment, after: LineFragment): boolean {
  return before.endLine1 === after.startLine1 && before.endLine2 === after.startLine2 &&
    before.endOffset1 === after.startOffset1 && before.endOffset2 === after.startOffset2;
}

function isAdjoiningInner(before: DiffFragment, after: DiffFragment, shift1: number, shift2: number): boolean {
  return before.endOffset1 === after.startOffset1 + shift1 && before.endOffset2 === after.startOffset2 + shift2;
}

function extractInnerFragments(lineFragment: LineFragment): readonly DiffFragment[] {
  if (lineFragment.innerFragments != null) return lineFragment.innerFragments;
  const length1 = lineFragment.endOffset1 - lineFragment.startOffset1;
  const length2 = lineFragment.endOffset2 - lineFragment.startOffset2;
  return [createDiffFragment(0, length1, 0, length2)];
}
