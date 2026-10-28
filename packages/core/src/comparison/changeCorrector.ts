// Ported from com.intellij.diff.comparison.ChangeCorrector (JetBrains/intellij-community, Apache-2.0).
// Base class for two-step diff algorithms: given a matching between sub-sequences, build a matching on whole sequences.
import { ChangeBuilder } from '../iterables/changeBuilder';
import { type FairDiffIterable, fair } from '../iterables/diffIterable';

export abstract class ChangeCorrector {
  protected readonly builder: ChangeBuilder;

  constructor(
    private readonly length1: number,
    private readonly length2: number,
    private readonly changes: FairDiffIterable,
  ) {
    this.builder = new ChangeBuilder(length1, length2);
  }

  build(): FairDiffIterable {
    this.execute();
    return fair(this.builder.finish());
  }

  private execute(): void {
    let last1 = 0;
    let last2 = 0;
    for (const ch of this.changes.unchanged()) {
      const count = ch.end1 - ch.start1;
      for (let i = 0; i < count; i++) {
        const [start1, end1] = this.getOriginalRange1(ch.start1 + i);
        const [start2, end2] = this.getOriginalRange2(ch.start2 + i);
        this.matchGap(last1, start1, last2, start2);
        this.builder.markEqual(start1, start2, end1, end2);
        last1 = end1;
        last2 = end2;
      }
    }
    this.matchGap(last1, this.length1, last2, this.length2);
  }

  protected abstract matchGap(start1: number, end1: number, start2: number, end2: number): void;
  protected abstract getOriginalRange1(index: number): [number, number];
  protected abstract getOriginalRange2(index: number): [number, number];
}
