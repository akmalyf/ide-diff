// Ported from com.intellij.diff.comparison.ByCharRt + ChangeCorrector.DefaultCharChangeCorrector
// (JetBrains/intellij-community, Apache-2.0). Offsets are UTF-16 code units; the diff runs over code points.
import { charCount, codePointAt, isPunctuation, isWhiteSpaceCodePoint } from '../text/chars';
import { ChangeBuilder, diff } from '../iterables/changeBuilder';
import { create, type DiffIterable, type FairDiffIterable, fair, iterateAll } from '../iterables/diffIterable';
import { Range } from '../util/range';
import { expandWhitespacesForward } from '../util/trim';
import { ChangeCorrector } from './changeCorrector';
import { trimSpacesCorrector } from './whitespaceCorrectors';

export class CodePointsOffsets {
  constructor(
    readonly codePoints: Int32Array,
    readonly offsets: Int32Array,
  ) {}

  charOffset(index: number): number {
    return this.offsets[index];
  }

  charOffsetAfter(index: number): number {
    return this.offsets[index] + charCount(this.codePoints[index]);
  }
}

/** ByCharRt.compare: raw diff over all code points. */
export function compareCharsRaw(text1: string, text2: string): FairDiffIterable {
  const codePoints1 = getAllCodePoints(text1);
  const codePoints2 = getAllCodePoints(text2);
  const iterable = diff(codePoints1, codePoints2);
  let offset1 = 0;
  let offset2 = 0;
  const builder = new ChangeBuilder(text1.length, text2.length);
  for (const [range, equals] of iterateAll(iterable)) {
    const end1 = offset1 + countChars(codePoints1, range.start1, range.end1);
    const end2 = offset2 + countChars(codePoints2, range.start2, range.end2);
    if (equals) builder.markEqual(offset1, offset2, end1, end2);
    offset1 = end1;
    offset2 = end2;
  }
  if (offset1 !== text1.length || offset2 !== text2.length) throw new Error('check failed');
  return fair(builder.finish());
}

/** ByCharRt.compareTwoStep (BY_CHAR, DEFAULT policy). */
export function compareTwoStep(text1: string, text2: string): FairDiffIterable {
  const codePoints1 = getNonSpaceCodePoints(text1);
  const codePoints2 = getNonSpaceCodePoints(text2);
  const nonSpaceChanges = diff(codePoints1.codePoints, codePoints2.codePoints);
  return new DefaultCharChangeCorrector(codePoints1, codePoints2, text1, text2, nonSpaceChanges).build();
}

export function compareTrimWhitespaces(text1: string, text2: string): DiffIterable {
  const iterable = compareTwoStep(text1, text2);
  return trimSpacesCorrector(iterable, text1, text2);
}

export function compareIgnoreWhitespaces(text1: string, text2: string): DiffIterable {
  const codePoints1 = getNonSpaceCodePoints(text1);
  const codePoints2 = getNonSpaceCodePoints(text2);
  const changes = diff(codePoints1.codePoints, codePoints2.codePoints);
  return matchAdjustmentSpacesIW(codePoints1, codePoints2, text1, text2, changes);
}

/** Compare punctuation chars only, all other characters are left unmatched. */
export function comparePunctuation(text1: string, text2: string): FairDiffIterable {
  const chars1 = getPunctuationChars(text1);
  const chars2 = getPunctuationChars(text2);
  const nonSpaceChanges = diff(chars1.codePoints, chars2.codePoints);
  const builder = new ChangeBuilder(text1.length, text2.length);
  for (const range of nonSpaceChanges.unchanged()) {
    const count = range.end1 - range.start1;
    for (let i = 0; i < count; i++) {
      builder.markEqual(chars1.offsets[range.start1 + i], chars2.offsets[range.start2 + i]);
    }
  }
  return fair(builder.finish());
}

/**
 * Given DiffIterable on non-whitespace characters, convert it into DiffIterable on original texts.
 * matched characters: matched non-space characters + all adjustment whitespaces
 */
function matchAdjustmentSpacesIW(
  codePoints1: CodePointsOffsets, codePoints2: CodePointsOffsets, text1: string, text2: string, changes: FairDiffIterable,
): DiffIterable {
  const ranges: Range[] = [];
  for (const ch of changes.changes()) {
    let startOffset1: number;
    let endOffset1: number;
    if (ch.start1 === ch.end1) {
      endOffset1 = expandForwardW(codePoints1, codePoints2, text1, text2, ch, true);
      startOffset1 = endOffset1;
    } else {
      startOffset1 = codePoints1.charOffset(ch.start1);
      endOffset1 = codePoints1.charOffsetAfter(ch.end1 - 1);
    }
    let startOffset2: number;
    let endOffset2: number;
    if (ch.start2 === ch.end2) {
      endOffset2 = expandForwardW(codePoints1, codePoints2, text1, text2, ch, false);
      startOffset2 = endOffset2;
    } else {
      startOffset2 = codePoints2.charOffset(ch.start2);
      endOffset2 = codePoints2.charOffsetAfter(ch.end2 - 1);
    }
    ranges.push(new Range(startOffset1, endOffset1, startOffset2, endOffset2));
  }
  return create(ranges, text1.length, text2.length);
}

// We want to match whitespaces if we can: "x y" -> "x zy", space should be matched instead of being ignored.
function expandForwardW(
  codePoints1: CodePointsOffsets, codePoints2: CodePointsOffsets, text1: string, text2: string, ch: Range, left: boolean,
): number {
  const offset1 = ch.start1 === 0 ? 0 : codePoints1.charOffsetAfter(ch.start1 - 1);
  const offset2 = ch.start2 === 0 ? 0 : codePoints2.charOffsetAfter(ch.start2 - 1);
  const start = left ? offset1 : offset2;
  return start + expandWhitespacesForward(text1, text2, offset1, offset2, text1.length, text2.length);
}

function getAllCodePoints(text: string): Int32Array {
  const list: number[] = [];
  let offset = 0;
  while (offset < text.length) {
    const ch = codePointAt(text, offset);
    list.push(ch);
    offset += charCount(ch);
  }
  return Int32Array.from(list);
}

function getNonSpaceCodePoints(text: string): CodePointsOffsets {
  const codePoints: number[] = [];
  const offsets: number[] = [];
  let offset = 0;
  while (offset < text.length) {
    const ch = codePointAt(text, offset);
    if (!isWhiteSpaceCodePoint(ch)) {
      codePoints.push(ch);
      offsets.push(offset);
    }
    offset += charCount(ch);
  }
  return new CodePointsOffsets(Int32Array.from(codePoints), Int32Array.from(offsets));
}

function getPunctuationChars(text: string): CodePointsOffsets {
  const codePoints: number[] = [];
  const offsets: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (isPunctuation(c)) {
      codePoints.push(c);
      offsets.push(i);
    }
  }
  return new CodePointsOffsets(Int32Array.from(codePoints), Int32Array.from(offsets));
}

function countChars(codePoints: Int32Array, start: number, end: number): number {
  let count = 0;
  for (let i = start; i < end; i++) count += charCount(codePoints[i]);
  return count;
}

class DefaultCharChangeCorrector extends ChangeCorrector {
  constructor(
    private readonly codePoints1: CodePointsOffsets,
    private readonly codePoints2: CodePointsOffsets,
    private readonly text1: string,
    private readonly text2: string,
    changes: FairDiffIterable,
  ) {
    super(text1.length, text2.length, changes);
  }

  protected matchGap(start1: number, end1: number, start2: number, end2: number): void {
    const inner1 = this.text1.substring(start1, end1);
    const inner2 = this.text2.substring(start2, end2);
    const innerChanges = compareCharsRaw(inner1, inner2);
    for (const chunk of innerChanges.unchanged()) {
      this.builder.markEqualCount(start1 + chunk.start1, start2 + chunk.start2, chunk.end1 - chunk.start1);
    }
  }

  protected getOriginalRange1(index: number): [number, number] {
    return [this.codePoints1.charOffset(index), this.codePoints1.charOffsetAfter(index)];
  }

  protected getOriginalRange2(index: number): [number, number] {
    return [this.codePoints2.charOffset(index), this.codePoints2.charOffsetAfter(index)];
  }
}
