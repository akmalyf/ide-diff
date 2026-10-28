// Ported from com.intellij.diff.comparison.ComparisonMergeUtil (JetBrains/intellij-community, Apache-2.0).
import { USE_GREEDY_MERGE_MAGIC_RESOLVE } from '../config';
import type { FairDiffIterable } from '../iterables/diffIterable';
import { MergeRange, type Range } from '../util/range';
import { tryGreedyResolve, tryResolve } from './mergeResolveUtil';

/** (leftIndex, baseIndex, rightIndex) => true when the three elements are equal under DEFAULT policy. */
export type SideEquality = (leftIndex: number, baseIndex: number, rightIndex: number) => boolean;

/** Both iterables share side 1 = base. fragments1: base -> left, fragments2: base -> right. Result: 1 = left, 2 = base, 3 = right. */
export function buildSimple(fragments1: FairDiffIterable, fragments2: FairDiffIterable): MergeRange[] {
  if (fragments1.length1 !== fragments2.length1) throw new Error('check failed: base lengths differ');
  return new FairMergeBuilder(new MergeChangeBuilder()).execute(fragments1, fragments2);
}

export function buildMerge(fragments1: FairDiffIterable, fragments2: FairDiffIterable, trueEquality: SideEquality): MergeRange[] {
  if (fragments1.length1 !== fragments2.length1) throw new Error('check failed: base lengths differ');
  return new FairMergeBuilder(new IgnoringChangeBuilder(trueEquality)).execute(fragments1, fragments2);
}

export function tryResolveConflict(leftText: string, baseText: string, rightText: string): string | null {
  return USE_GREEDY_MERGE_MAGIC_RESOLVE ? tryGreedyResolve(leftText, baseText, rightText) : tryResolve(leftText, baseText, rightText);
}

class FairMergeBuilder {
  constructor(private readonly builder: MergeChangeBuilder) {}

  execute(fragments1: FairDiffIterable, fragments2: FairDiffIterable): MergeRange[] {
    const unchanged1 = fragments1.unchanged();
    const unchanged2 = fragments2.unchanged();
    let i1 = 0;
    let i2 = 0;
    while (i1 < unchanged1.length && i2 < unchanged2.length) {
      const advanceLeft = this.add(unchanged1[i1], unchanged2[i2]);
      if (advanceLeft) i1++;
      else i2++;
    }
    return this.builder.finish(fragments1.length2, fragments1.length1, fragments2.length2);
  }

  /** @returns true to advance the first iterator (Side.LEFT), false for the second. */
  private add(range1: Range, range2: Range): boolean {
    const start1 = range1.start1;
    const end1 = range1.end1;
    const start2 = range2.start1;
    const end2 = range2.end1;
    if (end1 <= start2) return true;
    if (end2 <= start1) return false;
    const startBase = Math.max(start1, start2);
    const endBase = Math.min(end1, end2);
    const count = endBase - startBase;
    const startLeft = range1.start2 + (startBase - start1);
    const startRight = range2.start2 + (startBase - start2);
    this.builder.markEqual(startLeft, startBase, startRight, startLeft + count, endBase, startRight + count);
    return end1 <= end2;
  }
}

class MergeChangeBuilder {
  protected readonly changes: MergeRange[] = [];
  private index1 = 0;
  private index2 = 0;
  private index3 = 0;

  protected addChange(start1: number, start2: number, start3: number, end1: number, end2: number, end3: number): void {
    if (start1 === end1 && start2 === end2 && start3 === end3) return;
    this.changes.push(new MergeRange(start1, end1, start2, end2, start3, end3));
  }

  markEqual(start1: number, start2: number, start3: number, end1: number, end2: number, end3: number): void {
    if (!(this.index1 <= start1 && this.index2 <= start2 && this.index3 <= start3 && start1 <= end1 && start2 <= end2 && start3 <= end3)) {
      throw new Error('check failed: MergeChangeBuilder.markEqual');
    }
    this.processChange(this.index1, this.index2, this.index3, start1, start2, start3);
    this.index1 = end1;
    this.index2 = end2;
    this.index3 = end3;
  }

  finish(length1: number, length2: number, length3: number): MergeRange[] {
    if (!(this.index1 <= length1 && this.index2 <= length2 && this.index3 <= length3)) {
      throw new Error('check failed: MergeChangeBuilder.finish');
    }
    this.processChange(this.index1, this.index2, this.index3, length1, length2, length3);
    return this.changes;
  }

  protected processChange(start1: number, start2: number, start3: number, end1: number, end2: number, end3: number): void {
    this.addChange(start1, start2, start3, end1, end2, end3);
  }
}

class IgnoringChangeBuilder extends MergeChangeBuilder {
  constructor(private readonly trueEquality: SideEquality) {
    super();
  }

  protected override processChange(start1: number, start2: number, start3: number, end1: number, end2: number, end3: number): void {
    const lastChange = this.changes.length === 0 ? null : this.changes[this.changes.length - 1];
    const unchangedStart1 = lastChange?.end1 ?? 0;
    const unchangedStart2 = lastChange?.end2 ?? 0;
    const unchangedStart3 = lastChange?.end3 ?? 0;
    this.addIgnoredChanges(unchangedStart1, unchangedStart2, unchangedStart3, start1, start2, start3);
    this.addChange(start1, start2, start3, end1, end2, end3);
  }

  private addIgnoredChanges(start1: number, start2: number, start3: number, end1: number, end2: number, end3: number): void {
    const count = end2 - start2;
    if (end1 - start1 !== count || end3 - start3 !== count) throw new Error('check failed: IgnoringChangeBuilder');
    let firstIgnoredCount = -1;
    for (let i = 0; i < count; i++) {
      const isIgnored = !this.trueEquality(start1 + i, start2 + i, start3 + i);
      const previousAreIgnored = firstIgnoredCount !== -1;
      if (isIgnored && !previousAreIgnored) firstIgnoredCount = i;
      if (!isIgnored && previousAreIgnored) {
        this.addChange(start1 + firstIgnoredCount, start2 + firstIgnoredCount, start3 + firstIgnoredCount,
          start1 + i, start2 + i, start3 + i);
        firstIgnoredCount = -1;
      }
    }
    if (firstIgnoredCount !== -1) {
      this.addChange(start1 + firstIgnoredCount, start2 + firstIgnoredCount, start3 + firstIgnoredCount,
        start1 + count, start2 + count, start3 + count);
    }
  }
}
