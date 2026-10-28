// Ported from com.intellij.diff.comparison.ChunkOptimizer (JetBrains/intellij-community, Apache-2.0).
import { UNIMPORTANT_LINE_CHAR_COUNT } from '../config';
import { isWs } from '../text/chars';
import { createUnchanged, type FairDiffIterable, fair } from '../iterables/diffIterable';
import { Range, type Side } from '../util/range';
import { expandBackwardKeys, expandForwardKeys } from '../util/trim';
import type { InlineChunk } from './inlineChunks';
import type { Line } from './line';

const LEFT: Side = 0;

abstract class ChunkOptimizer {
  private readonly ranges: Range[] = [];

  constructor(
    protected readonly keys1: readonly string[],
    protected readonly keys2: readonly string[],
    private readonly iterable: FairDiffIterable,
  ) {}

  build(): FairDiffIterable {
    for (const range of this.iterable.unchanged()) {
      this.ranges.push(range);
      this.processLastRanges();
    }
    return fair(createUnchanged(this.ranges, this.keys1.length, this.keys2.length));
  }

  private processLastRanges(): void {
    const ranges = this.ranges;
    if (ranges.length < 2) return; // nothing to do
    const range1 = ranges[ranges.length - 2];
    const range2 = ranges[ranges.length - 1];
    if (range1.end1 !== range2.start1 && range1.end2 !== range2.start2) {
      // if changes do not touch and we still can perform one of these optimisations,
      // it means that given DiffIterable is not LCS (because we can build a smaller one). This should not happen.
      return;
    }
    const count1 = range1.end1 - range1.start1;
    const count2 = range2.end1 - range2.start1;
    const equalForward = expandForwardKeys(this.keys1, this.keys2, range1.end1, range1.end2, range1.end1 + count2, range1.end2 + count2);
    const equalBackward = expandBackwardKeys(this.keys1, this.keys2, range2.start1 - count1, range2.start2 - count1, range2.start1, range2.start2);

    // nothing to do
    if (equalForward === 0 && equalBackward === 0) return;

    // merge chunks left [A]B[B] -> [AB]B
    if (equalForward === count2) {
      ranges.pop();
      ranges.pop();
      ranges.push(new Range(range1.start1, range1.end1 + count2, range1.start2, range1.end2 + count2));
      this.processLastRanges();
      return;
    }

    // merge chunks right [A]A[B] -> A[AB]
    if (equalBackward === count1) {
      ranges.pop();
      ranges.pop();
      ranges.push(new Range(range2.start1 - count1, range2.end1, range2.start2 - count1, range2.end2));
      this.processLastRanges();
      return;
    }

    const touchSide: Side = range1.end1 === range2.start1 ? 0 : 1;
    const shift = this.getShift(touchSide, equalForward, equalBackward, range1, range2);
    if (shift !== 0) {
      ranges.pop();
      ranges.pop();
      ranges.push(new Range(range1.start1, range1.end1 + shift, range1.start2, range1.end2 + shift));
      ranges.push(new Range(range2.start1 + shift, range2.end1, range2.start2 + shift, range2.end2));
    }
  }

  protected abstract getShift(touchSide: Side, equalForward: number, equalBackward: number, range1: Range, range2: Range): number;
}

/*
 * 1. Minimise amount of chunks
 * 2. Minimise amount of modified 'sentences', where sentence is a sequence of words, that are not separated by whitespace
 *      good: "[AX] [AZ]" - "[AX] AY [AZ]"
 *      bad: "[AX A][Z]" - "[AX A]Y A[Z]"
 */
export class WordChunkOptimizer extends ChunkOptimizer {
  constructor(
    private readonly words1: readonly InlineChunk[],
    private readonly words2: readonly InlineChunk[],
    private readonly text1: string,
    private readonly text2: string,
    changes: FairDiffIterable,
  ) {
    super(words1.map((w) => w.key), words2.map((w) => w.key), changes);
  }

  protected getShift(touchSide: Side, equalForward: number, equalBackward: number, _range1: Range, range2: Range): number {
    const touchWords = touchSide === LEFT ? this.words1 : this.words2;
    const touchText = touchSide === LEFT ? this.text1 : this.text2;
    const touchStart = touchSide === LEFT ? range2.start1 : range2.start2;

    // check if chunks are already separated by whitespaces
    if (isSeparatedWithWhitespace(touchText, touchWords[touchStart - 1], touchWords[touchStart])) return 0;

    // shift chunks left [X]A Y[A ZA] -> [XA] YA [ZA]
    //                   [X][A ZA] -> [XA] [ZA]
    const leftShift = findSequenceEdgeShift(touchText, touchWords, touchStart, equalForward, true);
    if (leftShift > 0) return leftShift;

    // shift chunks right [AX A]Y A[Z] -> [AX] AY [AZ]
    //                    [AX A][Z] -> [AX] [AZ]
    const rightShift = findSequenceEdgeShift(touchText, touchWords, touchStart - 1, equalBackward, false);
    if (rightShift > 0) return -rightShift;

    // nothing to do
    return 0;
  }
}

function findSequenceEdgeShift(text: string, words: readonly InlineChunk[], offset: number, count: number, leftToRight: boolean): number {
  for (let i = 0; i < count; i++) {
    let word1: InlineChunk;
    let word2: InlineChunk;
    if (leftToRight) {
      word1 = words[offset + i];
      word2 = words[offset + i + 1];
    } else {
      word1 = words[offset - i - 1];
      word2 = words[offset - i];
    }
    if (isSeparatedWithWhitespace(text, word1, word2)) return i + 1;
  }
  return -1;
}

function isSeparatedWithWhitespace(text: string, word1: InlineChunk, word2: InlineChunk): boolean {
  if (word1.newline || word2.newline) return true;
  for (let i = word1.offset2; i < word2.offset1; i++) {
    if (isWs(text, i)) return true;
  }
  return false;
}

/*
 * 1. Minimise amount of chunks
 * 2. Prefer insertions/deletions, that are bounded by empty(or 'unimportant') line
 *      good: "ABooYZ [ABuuYZ ]ABzzYZ" - "ABooYZ []ABzzYZ"
 *      bad: "ABooYZ AB[uuYZ AB]zzYZ" - "ABooYZ AB[]zzYZ"
 */
export class LineChunkOptimizer extends ChunkOptimizer {
  constructor(
    private readonly lines1: readonly Line[],
    private readonly lines2: readonly Line[],
    changes: FairDiffIterable,
  ) {
    super(lines1.map((l) => l.key), lines2.map((l) => l.key), changes);
  }

  protected getShift(touchSide: Side, equalForward: number, equalBackward: number, range1: Range, range2: Range): number {
    const threshold = UNIMPORTANT_LINE_CHAR_COUNT;
    let shift = this.getUnchangedBoundaryShift(touchSide, equalForward, equalBackward, range2, 0);
    if (shift != null) return shift;
    shift = this.getChangedBoundaryShift(touchSide, equalForward, equalBackward, range1, range2, 0);
    if (shift != null) return shift;
    shift = this.getUnchangedBoundaryShift(touchSide, equalForward, equalBackward, range2, threshold);
    if (shift != null) return shift;
    shift = this.getChangedBoundaryShift(touchSide, equalForward, equalBackward, range1, range2, threshold);
    if (shift != null) return shift;
    return 0;
  }

  /** search for an empty line boundary in unchanged lines: we want insertion/deletion to go right before/after of an empty line */
  private getUnchangedBoundaryShift(touchSide: Side, equalForward: number, equalBackward: number, range2: Range, threshold: number): number | null {
    const touchLines = touchSide === LEFT ? this.lines1 : this.lines2;
    const touchStart = touchSide === LEFT ? range2.start1 : range2.start2;
    const shiftForward = findNextUnimportantLine(touchLines, touchStart, equalForward + 1, threshold);
    const shiftBackward = findPrevUnimportantLine(touchLines, touchStart - 1, equalBackward + 1, threshold);
    return getShiftForBoundaries(shiftForward, shiftBackward);
  }

  /** search for an empty line boundary in changed lines: we want insertion/deletion to start/end with an empty line */
  private getChangedBoundaryShift(
    touchSide: Side, equalForward: number, equalBackward: number, range1: Range, range2: Range, threshold: number,
  ): number | null {
    const nonTouchLeft = touchSide !== LEFT;
    const nonTouchLines = nonTouchLeft ? this.lines1 : this.lines2;
    const changeStart = nonTouchLeft ? range1.end1 : range1.end2;
    const changeEnd = nonTouchLeft ? range2.start1 : range2.start2;
    const shiftForward = findNextUnimportantLine(nonTouchLines, changeStart, equalForward + 1, threshold);
    const shiftBackward = findPrevUnimportantLine(nonTouchLines, changeEnd - 1, equalBackward + 1, threshold);
    return getShiftForBoundaries(shiftForward, shiftBackward);
  }
}

function findNextUnimportantLine(lines: readonly Line[], offset: number, count: number, threshold: number): number {
  for (let i = 0; i < count; i++) {
    if (lines[offset + i].nonSpaceChars <= threshold) return i;
  }
  return -1;
}

function findPrevUnimportantLine(lines: readonly Line[], offset: number, count: number, threshold: number): number {
  for (let i = 0; i < count; i++) {
    if (lines[offset - i].nonSpaceChars <= threshold) return i;
  }
  return -1;
}

function getShiftForBoundaries(shiftForward: number, shiftBackward: number): number | null {
  if (shiftForward === -1 && shiftBackward === -1) return null;
  if (shiftForward === 0 || shiftBackward === 0) return 0;
  return shiftForward !== -1 ? shiftForward : -shiftBackward;
}
