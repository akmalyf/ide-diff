// Ported from com.intellij.diff.comparison.MergeResolveUtil (JetBrains/intellij-community, Apache-2.0).
// The "magic wand": tries to resolve a conflict by merging non-intersecting word-level changes.
import type { ComparisonPolicy, DiffFragment, ThreeSide } from '../types';
import { DiffTooBigError } from '../types';
import { isEqualTexts } from '../text/equality';
import { MergeRange } from '../util/range';
import { BASE, compareWordMergeContents, getWordMergeType, isChange, LEFT, RIGHT } from '../merge/mergeRangeUtil';
import { compareWords, compareWords3 } from './byWord';

export function tryResolve(leftText: string, baseText: string, rightText: string): string | null {
  try {
    const resolved = new SimpleHelper(leftText, baseText, rightText).execute('DEFAULT');
    if (resolved != null) return resolved;
    return new SimpleHelper(leftText, baseText, rightText).execute('IGNORE_WHITESPACES');
  } catch (e) {
    if (e instanceof DiffTooBigError) return null;
    throw e;
  }
}

export function tryGreedyResolve(leftText: string, baseText: string, rightText: string): string | null {
  try {
    const resolved = new GreedyHelper(leftText, baseText, rightText).execute('DEFAULT');
    if (resolved != null) return resolved;
    return new GreedyHelper(leftText, baseText, rightText).execute('IGNORE_WHITESPACES');
  } catch (e) {
    if (e instanceof DiffTooBigError) return null;
    throw e;
  }
}

class SimpleHelper {
  private newContent = '';
  private last1 = 0;
  private last2 = 0;
  private last3 = 0;
  private readonly texts: readonly [string, string, string];

  constructor(
    private readonly leftText: string,
    private readonly baseText: string,
    private readonly rightText: string,
  ) {
    this.texts = [leftText, baseText, rightText];
  }

  execute(policy: ComparisonPolicy): string | null {
    const changes = compareWords3(this.leftText, this.baseText, this.rightText, policy);
    for (const fragment of changes) {
      const baseRange = this.nextMergeRange(fragment.start1, fragment.start2, fragment.start3);
      this.appendBase(baseRange);
      const conflictRange = this.nextMergeRange(fragment.end1, fragment.end2, fragment.end3);
      if (!this.appendConflict(conflictRange, policy)) return null;
    }
    const trailingRange = this.nextMergeRange(this.leftText.length, this.baseText.length, this.rightText.length);
    this.appendBase(trailingRange);
    return this.newContent;
  }

  private nextMergeRange(end1: number, end2: number, end3: number): MergeRange {
    const range = new MergeRange(this.last1, end1, this.last2, end2, this.last3, end3);
    this.last1 = end1;
    this.last2 = end2;
    this.last3 = end3;
    return range;
  }

  private appendBase(range: MergeRange): void {
    if (range.isEmpty) return;
    const policy: ComparisonPolicy = 'DEFAULT';
    if (this.isUnchangedRange(range, policy)) {
      this.append(range, BASE);
    } else {
      const type = getWordMergeType(range, this.texts, policy);
      if (isChange(type, LEFT)) this.append(range, LEFT);
      else if (isChange(type, RIGHT)) this.append(range, RIGHT);
      else this.append(range, BASE);
    }
  }

  private appendConflict(range: MergeRange, policy: ComparisonPolicy): boolean {
    const type = getWordMergeType(range, this.texts, policy);
    if (type.type === 'CONFLICT') return false;
    this.append(range, isChange(type, LEFT) ? LEFT : RIGHT);
    return true;
  }

  private append(range: MergeRange, side: ThreeSide): void {
    if (side === LEFT) this.newContent += this.leftText.substring(range.start1, range.end1);
    else if (side === BASE) this.newContent += this.baseText.substring(range.start2, range.end2);
    else this.newContent += this.rightText.substring(range.start3, range.end3);
  }

  private isUnchangedRange(range: MergeRange, policy: ComparisonPolicy): boolean {
    return compareWordMergeContents(range, this.texts, policy, BASE, LEFT) &&
      compareWordMergeContents(range, this.texts, policy, BASE, RIGHT);
  }
}

class GreedyHelper {
  private newContent = '';
  private lastBaseOffset = 0;
  private index1 = 0;
  private index2 = 0;

  constructor(
    private readonly leftText: string,
    private readonly baseText: string,
    private readonly rightText: string,
  ) {}

  execute(policy: ComparisonPolicy): string | null {
    const fragments1 = compareWords(this.baseText, this.leftText, policy);
    const fragments2 = compareWords(this.baseText, this.rightText, policy);

    for (;;) {
      const changeStart1 = fragments1[this.index1]?.startOffset1 ?? -1;
      const changeStart2 = fragments2[this.index2]?.startOffset1 ?? -1;

      if (changeStart1 === -1 && changeStart2 === -1) {
        // no more changes left
        this.appendBase(this.baseText.length);
        break;
      }

      // skip till the next block of changes
      if (changeStart1 !== -1 && changeStart2 !== -1) this.appendBase(Math.min(changeStart1, changeStart2));
      else if (changeStart1 !== -1) this.appendBase(changeStart1);
      else this.appendBase(changeStart2);

      // collect next block of changes, that intersect one another.
      let baseOffsetEnd = this.lastBaseOffset;
      let end1 = this.index1;
      let end2 = this.index2;
      for (;;) {
        const next1: DiffFragment | undefined = fragments1[end1];
        const next2: DiffFragment | undefined = fragments2[end2];
        if (next1 != null && next1.startOffset1 <= baseOffsetEnd) {
          baseOffsetEnd = Math.max(baseOffsetEnd, next1.endOffset1);
          end1++;
          continue;
        }
        if (next2 != null && next2.startOffset1 <= baseOffsetEnd) {
          baseOffsetEnd = Math.max(baseOffsetEnd, next2.endOffset1);
          end2++;
          continue;
        }
        break;
      }
      if (this.index1 === end1 && this.index2 === end2) throw new Error('check failed');

      const inserted1 = this.getInsertedContent(fragments1, this.index1, end1, this.leftText);
      const inserted2 = this.getInsertedContent(fragments2, this.index2, end2, this.rightText);
      this.index1 = end1;
      this.index2 = end2;

      // merge and apply deletions
      this.lastBaseOffset = baseOffsetEnd;

      // merge and apply non-conflicted insertions
      if (inserted1.length === 0 && inserted2.length === 0) continue;
      if (inserted2.length === 0) {
        this.newContent += inserted1;
        continue;
      }
      if (inserted1.length === 0) {
        this.newContent += inserted2;
        continue;
      }
      if (isEqualTexts(inserted1, inserted2, policy)) {
        this.newContent += inserted1.length <= inserted2.length ? inserted1 : inserted2;
        continue;
      }
      // we faced conflicting insertions - resolve failed
      return null;
    }
    return this.newContent;
  }

  private appendBase(endOffset: number): void {
    if (this.lastBaseOffset === endOffset) return;
    this.newContent += this.baseText.substring(this.lastBaseOffset, endOffset);
    this.lastBaseOffset = endOffset;
  }

  private getInsertedContent(fragments: readonly DiffFragment[], start: number, end: number, text: string): string {
    let result = '';
    for (let i = start; i < end; i++) result += text.substring(fragments[i].startOffset2, fragments[i].endOffset2);
    return result;
  }
}
