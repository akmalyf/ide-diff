// Ported from com.intellij.diff.comparison.LineFragmentSplitter (JetBrains/intellij-community, Apache-2.0).
// Given matchings on words, split initial line block into 'logically different' line blocks.
import { isEquals } from '../text/equality';
import type { FairDiffIterable } from '../iterables/diffIterable';
import { Range } from '../util/range';
import type { InlineChunk } from './inlineChunks';

export interface WordBlock {
  readonly words: Range;
  readonly offsets: Range;
}

interface PendingChunk {
  readonly block: WordBlock;
  readonly hasEqualWords: boolean;
  readonly hasWordsInside: boolean;
  readonly isEqualIgnoreWhitespaces: boolean;
}

export class LineFragmentSplitter {
  private readonly result: WordBlock[] = [];
  private last1 = -1;
  private last2 = -1;
  private pendingChunk: PendingChunk | null = null;

  constructor(
    private readonly text1: string,
    private readonly text2: string,
    private readonly words1: readonly InlineChunk[],
    private readonly words2: readonly InlineChunk[],
    private readonly iterable: FairDiffIterable,
  ) {}

  run(): WordBlock[] {
    let hasEqualWords = false;
    for (const range of this.iterable.unchanged()) {
      const count = range.end1 - range.start1;
      for (let i = 0; i < count; i++) {
        const index1 = range.start1 + i;
        const index2 = range.start2 + i;
        if (this.words1[index1].newline && this.words2[index2].newline) {
          // split by matched newlines
          this.addLineChunk(index1, index2, hasEqualWords);
          hasEqualWords = false;
        } else {
          if (isFirstInLine(this.words1, index1) && isFirstInLine(this.words2, index2)) {
            // split by matched first word in line
            this.addLineChunk(index1 - 1, index2 - 1, hasEqualWords);
            hasEqualWords = false;
          }
          hasEqualWords = true;
        }
      }
    }
    this.addLineChunk(this.words1.length, this.words2.length, hasEqualWords);
    if (this.pendingChunk) this.result.push(this.pendingChunk.block);
    return this.result;
  }

  private addLineChunk(end1: number, end2: number, hasEqualWords: boolean): void {
    if (this.last1 > end1 || this.last2 > end2) return;
    const chunk = this.createChunk(this.last1, this.last2, end1, end2, hasEqualWords);
    if (chunk.block.offsets.isEmpty) return;
    const pending = this.pendingChunk;
    if (pending == null) {
      this.pendingChunk = chunk;
    } else if (shouldMergeChunks(pending, chunk)) {
      this.pendingChunk = mergeChunks(pending, chunk);
    } else {
      this.result.push(pending.block);
      this.pendingChunk = chunk;
    }
    this.last1 = end1;
    this.last2 = end2;
  }

  private createChunk(start1: number, start2: number, end1: number, end2: number, hasEqualWords: boolean): PendingChunk {
    const startOffset1 = getOffset(this.words1, this.text1, start1);
    const startOffset2 = getOffset(this.words2, this.text2, start2);
    const endOffset1 = getOffset(this.words1, this.text1, end1);
    const endOffset2 = getOffset(this.words2, this.text2, end2);
    const block: WordBlock = {
      words: new Range(Math.max(0, start1 + 1), Math.min(end1 + 1, this.words1.length),
        Math.max(0, start2 + 1), Math.min(end2 + 1, this.words2.length)),
      offsets: new Range(startOffset1, endOffset1, startOffset2, endOffset2),
    };
    return {
      block,
      hasEqualWords,
      hasWordsInside: this.hasWordsInside(block),
      isEqualIgnoreWhitespaces: isEquals(
        this.text1.substring(block.offsets.start1, block.offsets.end1),
        this.text2.substring(block.offsets.start2, block.offsets.end2),
        'IGNORE_WHITESPACES',
      ),
    };
  }

  private hasWordsInside(block: WordBlock): boolean {
    for (let i = block.words.start1; i < block.words.end1; i++) if (!this.words1[i].newline) return true;
    for (let i = block.words.start2; i < block.words.end2; i++) if (!this.words2[i].newline) return true;
    return false;
  }
}

function shouldMergeChunks(chunk1: PendingChunk, chunk2: PendingChunk): boolean {
  if (!chunk1.hasEqualWords && !chunk2.hasEqualWords) return true; // combine lines, that matched only by '\n'
  if (chunk1.isEqualIgnoreWhitespaces && chunk2.isEqualIgnoreWhitespaces) return true; // combine whitespace-only changed lines
  if (!chunk1.hasWordsInside || !chunk2.hasWordsInside) return true; // squash block without words in it
  return false;
}

function mergeChunks(chunk1: PendingChunk, chunk2: PendingChunk): PendingChunk {
  const b1 = chunk1.block;
  const b2 = chunk2.block;
  return {
    block: {
      words: new Range(b1.words.start1, b2.words.end1, b1.words.start2, b2.words.end2),
      offsets: new Range(b1.offsets.start1, b2.offsets.end1, b1.offsets.start2, b2.offsets.end2),
    },
    hasEqualWords: chunk1.hasEqualWords || chunk2.hasEqualWords,
    hasWordsInside: chunk1.hasWordsInside || chunk2.hasWordsInside,
    isEqualIgnoreWhitespaces: chunk1.isEqualIgnoreWhitespaces && chunk2.isEqualIgnoreWhitespaces,
  };
}

function getOffset(words: readonly InlineChunk[], text: string, index: number): number {
  if (index === -1) return 0;
  if (index === words.length) return text.length;
  const chunk = words[index];
  if (!chunk.newline) throw new Error('check failed: expected NewlineChunk');
  return chunk.offset2;
}

function isFirstInLine(words: readonly InlineChunk[], index: number): boolean {
  if (index === 0) return true;
  return words[index - 1].newline;
}
