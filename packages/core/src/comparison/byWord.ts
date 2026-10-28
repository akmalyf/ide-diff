// Ported from com.intellij.diff.comparison.ByWordRt (JetBrains/intellij-community, Apache-2.0).
import type { ComparisonPolicy, DiffFragment } from '../types';
import { ChangeBuilder, diff } from '../iterables/changeBuilder';
import { createUnchanged, type DiffIterable, type FairDiffIterable, fair, subiterable } from '../iterables/diffIterable';
import { createDiffFragment } from '../util/fragments';
import { type MergeRange, Range } from '../util/range';
import { comparePunctuation } from './byChar';
import { WordChunkOptimizer } from './chunkOptimizer';
import { buildSimple } from './comparisonMergeUtil';
import { getInlineChunks, type InlineChunk } from './inlineChunks';
import { LineFragmentSplitter, type WordBlock } from './lineFragmentSplitter';
import { matchAdjustmentWhitespaces, matchAdjustmentWhitespaces3 } from './whitespaceCorrectors';

export interface LineBlock {
  readonly fragments: DiffFragment[];
  readonly offsets: Range;
  readonly newlines1: number;
  readonly newlines2: number;
}

const keys = (words: readonly InlineChunk[]): string[] => words.map((w) => w.key);

/** ByWordRt.compare (2-way) — ComparisonManager.compareWords. */
export function compareWords(text1: string, text2: string, policy: ComparisonPolicy): DiffFragment[] {
  const words1 = getInlineChunks(text1);
  const words2 = getInlineChunks(text2);
  let wordChanges = diff(keys(words1), keys(words2));
  wordChanges = new WordChunkOptimizer(words1, words2, text1, text2, wordChanges).build();
  const delimitersIterable = matchAdjustmentDelimiters(text1, text2, words1, words2, wordChanges, 0, 0);
  const iterable = matchAdjustmentWhitespaces(text1, text2, delimitersIterable, policy);
  return convertIntoDiffFragments(iterable);
}

/** ByWordRt.compare (3-way: text1 = left, text2 = base, text3 = right) -> MergeRange in char offsets. */
export function compareWords3(text1: string, text2: string, text3: string, policy: ComparisonPolicy): MergeRange[] {
  const words1 = getInlineChunks(text1);
  const words2 = getInlineChunks(text2);
  const words3 = getInlineChunks(text3);

  let wordChanges1 = diff(keys(words2), keys(words1));
  wordChanges1 = new WordChunkOptimizer(words2, words1, text2, text1, wordChanges1).build();
  const iterable1 = matchAdjustmentDelimiters(text2, text1, words2, words1, wordChanges1, 0, 0);

  let wordChanges2 = diff(keys(words2), keys(words3));
  wordChanges2 = new WordChunkOptimizer(words2, words3, text2, text3, wordChanges2).build();
  const iterable2 = matchAdjustmentDelimiters(text2, text3, words2, words3, wordChanges2, 0, 0);

  const wordConflicts = buildSimple(iterable1, iterable2);
  return matchAdjustmentWhitespaces3(text1, text2, text3, wordConflicts, policy);
}

/** ByWordRt.compareAndSplit — used for line-inner WORDS highlighting. */
export function compareAndSplit(text1: string, text2: string, policy: ComparisonPolicy): LineBlock[] {
  const words1 = getInlineChunks(text1);
  const words2 = getInlineChunks(text2);
  let wordChanges = diff(keys(words1), keys(words2));
  wordChanges = new WordChunkOptimizer(words1, words2, text1, text2, wordChanges).build();

  const wordBlocks = new LineFragmentSplitter(text1, text2, words1, words2, wordChanges).run();
  const subIterables = collectWordBlockSubIterables(wordChanges, wordBlocks);

  const lineBlocks: LineBlock[] = [];
  for (let i = 0; i < wordBlocks.length; i++) {
    const { offsets, words } = wordBlocks[i];
    const subtext1 = text1.substring(offsets.start1, offsets.end1);
    const subtext2 = text2.substring(offsets.start2, offsets.end2);
    const subwords1 = words1.slice(words.start1, words.end1);
    const subwords2 = words2.slice(words.start2, words.end2);
    const delimitersIterable = matchAdjustmentDelimiters(subtext1, subtext2, subwords1, subwords2, subIterables[i],
      offsets.start1, offsets.start2);
    const iterable = matchAdjustmentWhitespaces(subtext1, subtext2, delimitersIterable, policy);
    lineBlocks.push({
      fragments: convertIntoDiffFragments(iterable),
      offsets,
      newlines1: countNewlines(subwords1),
      newlines2: countNewlines(subwords2),
    });
  }
  return lineBlocks;
}

function collectWordBlockSubIterables(wordChanges: FairDiffIterable, wordBlocks: readonly WordBlock[]): FairDiffIterable[] {
  const changed = wordChanges.changes();
  let index = 0;
  const result: FairDiffIterable[] = [];
  for (const block of wordBlocks) {
    const words = block.words;
    while (index < changed.length) {
      const range = changed[index];
      if (range.end1 < words.start1 || range.end2 < words.start2) {
        index++;
        continue;
      }
      break;
    }
    result.push(fair(subiterable(changed, words.start1, words.end1, words.start2, words.end2, index)));
  }
  return result;
}

export function convertIntoDiffFragments(changes: DiffIterable): DiffFragment[] {
  return changes.changes().map((ch) => createDiffFragment(ch.start1, ch.end1, ch.start2, ch.end2));
}

function countNewlines(words: readonly InlineChunk[]): number {
  let count = 0;
  for (const w of words) if (w.newline) count++;
  return count;
}

function matchAdjustmentDelimiters(
  text1: string, text2: string, words1: readonly InlineChunk[], words2: readonly InlineChunk[],
  changes: FairDiffIterable, startShift1: number, startShift2: number,
): FairDiffIterable {
  return new AdjustmentPunctuationMatcher(text1, text2, words1, words2, startShift1, startShift2, changes).build();
}

function comparePunctuation2Side(text1: string, text21: string, text22: string): [FairDiffIterable, FairDiffIterable] {
  const changes = comparePunctuation(text1, text21 + text22);
  const offset = text21.length;
  const ranges1: Range[] = [];
  const ranges2: Range[] = [];
  for (const ch of changes.unchanged()) {
    if (ch.end2 <= offset) {
      ranges1.push(new Range(ch.start1, ch.end1, ch.start2, ch.end2));
    } else if (ch.start2 >= offset) {
      ranges2.push(new Range(ch.start1, ch.end1, ch.start2 - offset, ch.end2 - offset));
    } else {
      const len2 = offset - ch.start2;
      ranges1.push(new Range(ch.start1, ch.start1 + len2, ch.start2, offset));
      ranges2.push(new Range(ch.start1 + len2, ch.end1, 0, ch.end2 - offset));
    }
  }
  return [
    fair(createUnchanged(ranges1, text1.length, text21.length)),
    fair(createUnchanged(ranges2, text1.length, text22.length)),
  ];
}

/**
 * Matches punctuation in the gaps around matched words, so that `foo(a, b)` vs `foo(a, c)` keeps `(`, `,` and `)` matched.
 * "[ X { A ! B } Y ]" "( X ... Y )" will lead to comparison of `[` with `(`, `{` + `}` with `...`, `]` with `)`.
 */
class AdjustmentPunctuationMatcher {
  private readonly len1: number;
  private readonly len2: number;
  private readonly builder: ChangeBuilder;
  private lastStart1 = -1;
  private lastStart2 = -1;
  private lastEnd1 = -1;
  private lastEnd2 = -1;

  constructor(
    private readonly text1: string,
    private readonly text2: string,
    private readonly words1: readonly InlineChunk[],
    private readonly words2: readonly InlineChunk[],
    private readonly startShift1: number,
    private readonly startShift2: number,
    private readonly changes: FairDiffIterable,
  ) {
    this.len1 = text1.length;
    this.len2 = text2.length;
    this.builder = new ChangeBuilder(this.len1, this.len2);
  }

  build(): FairDiffIterable {
    this.execute();
    return fair(this.builder.finish());
  }

  private execute(): void {
    this.clearLastRange();
    this.matchForwardIdx(-1, -1);
    for (const ch of this.changes.unchanged()) {
      const count = ch.end1 - ch.start1;
      for (let i = 0; i < count; i++) {
        const index1 = ch.start1 + i;
        const index2 = ch.start2 + i;
        const start1 = this.getStartOffset1(index1);
        const start2 = this.getStartOffset2(index2);
        const end1 = this.getEndOffset1(index1);
        const end2 = this.getEndOffset2(index2);
        this.matchBackwardIdx(index1, index2);
        this.builder.markEqual(start1, start2, end1, end2);
        this.matchForwardIdx(index1, index2);
      }
    }
    this.matchBackwardIdx(this.words1.length, this.words2.length);
  }

  private clearLastRange(): void {
    this.lastStart1 = -1;
    this.lastStart2 = -1;
    this.lastEnd1 = -1;
    this.lastEnd2 = -1;
  }

  private matchBackwardIdx(index1: number, index2: number): void {
    const start1 = index1 === 0 ? 0 : this.getEndOffset1(index1 - 1);
    const start2 = index2 === 0 ? 0 : this.getEndOffset2(index2 - 1);
    const end1 = index1 === this.words1.length ? this.len1 : this.getStartOffset1(index1);
    const end2 = index2 === this.words2.length ? this.len2 : this.getStartOffset2(index2);
    this.matchBackward(start1, start2, end1, end2);
    this.clearLastRange();
  }

  private matchForwardIdx(index1: number, index2: number): void {
    const start1 = index1 === -1 ? 0 : this.getEndOffset1(index1);
    const start2 = index2 === -1 ? 0 : this.getEndOffset2(index2);
    const end1 = index1 + 1 === this.words1.length ? this.len1 : this.getStartOffset1(index1 + 1);
    const end2 = index2 + 1 === this.words2.length ? this.len2 : this.getStartOffset2(index2 + 1);
    if (!(this.lastStart1 === -1 && this.lastStart2 === -1 && this.lastEnd1 === -1 && this.lastEnd2 === -1)) {
      throw new Error('check failed');
    }
    this.lastStart1 = start1;
    this.lastStart2 = start2;
    this.lastEnd1 = end1;
    this.lastEnd2 = end2;
  }

  private matchBackward(start1: number, start2: number, end1: number, end2: number): void {
    if (this.lastStart1 === -1 || this.lastStart2 === -1 || this.lastEnd1 === -1 || this.lastEnd2 === -1) {
      throw new Error('check failed');
    }
    if (this.lastStart1 === start1 && this.lastStart2 === start2) {
      // pair of adjustment matched words, match gap between ("A B" - "A B")
      this.matchRange(start1, start2, end1, end2);
      return;
    }
    if (this.lastStart1 < start1 && this.lastStart2 < start2) {
      // pair of matched words, with few unmatched ones between ("A X B" - "A Y B")
      this.matchRange(this.lastStart1, this.lastStart2, this.lastEnd1, this.lastEnd2);
      this.matchRange(start1, start2, end1, end2);
      return;
    }
    // one side adjustment, and other has non-matched words between ("A B" - "A Y B")
    this.matchComplexRange(this.lastStart1, this.lastStart2, this.lastEnd1, this.lastEnd2, start1, start2, end1, end2);
  }

  private matchRange(start1: number, start2: number, end1: number, end2: number): void {
    if (start1 === end1 && start2 === end2) return;
    const changes = comparePunctuation(this.text1.substring(start1, end1), this.text2.substring(start2, end2));
    for (const ch of changes.unchanged()) {
      this.builder.markEqual(start1 + ch.start1, start2 + ch.start2, start1 + ch.end1, start2 + ch.end2);
    }
  }

  private matchComplexRange(
    start11: number, start12: number, end11: number, end12: number,
    start21: number, start22: number, end21: number, end22: number,
  ): void {
    if (start11 === start21 && end11 === end21) {
      this.matchComplexRangeLeft(start11, end11, start12, end12, start22, end22);
    } else if (start12 === start22 && end12 === end22) {
      this.matchComplexRangeRight(start12, end12, start11, end11, start21, end21);
    } else {
      throw new Error('IllegalStateException');
    }
  }

  private matchComplexRangeLeft(start1: number, end1: number, start12: number, end12: number, start22: number, end22: number): void {
    const [first, second] = comparePunctuation2Side(
      this.text1.substring(start1, end1), this.text2.substring(start12, end12), this.text2.substring(start22, end22));
    for (const ch of first.unchanged()) {
      this.builder.markEqual(start1 + ch.start1, start12 + ch.start2, start1 + ch.end1, start12 + ch.end2);
    }
    for (const ch of second.unchanged()) {
      this.builder.markEqual(start1 + ch.start1, start22 + ch.start2, start1 + ch.end1, start22 + ch.end2);
    }
  }

  private matchComplexRangeRight(start2: number, end2: number, start11: number, end11: number, start21: number, end21: number): void {
    const [first, second] = comparePunctuation2Side(
      this.text2.substring(start2, end2), this.text1.substring(start11, end11), this.text1.substring(start21, end21));
    for (const ch of first.unchanged()) {
      this.builder.markEqual(start11 + ch.start2, start2 + ch.start1, start11 + ch.end2, start2 + ch.end1);
    }
    for (const ch of second.unchanged()) {
      this.builder.markEqual(start21 + ch.start2, start2 + ch.start1, start21 + ch.end2, start2 + ch.end1);
    }
  }

  private getStartOffset1(index: number): number {
    return this.words1[index].offset1 - this.startShift1;
  }

  private getStartOffset2(index: number): number {
    return this.words2[index].offset1 - this.startShift2;
  }

  private getEndOffset1(index: number): number {
    return this.words1[index].offset2 - this.startShift1;
  }

  private getEndOffset2(index: number): number {
    return this.words2[index].offset2 - this.startShift2;
  }
}
