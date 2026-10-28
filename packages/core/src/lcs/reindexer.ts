// Ported from com.intellij.util.diff.Reindexer (JetBrains/intellij-community, Apache-2.0).
import { type Bits, setBits } from './myers';

export interface LCSBuilder {
  addEqual(length: number): void;
  addChange(first: number, second: number): void;
}

export class Reindexer {
  private readonly oldIndices: [Int32Array, Int32Array] = [new Int32Array(0), new Int32Array(0)];
  private readonly originalLengths = [-1, -1];
  private readonly discardedLengths = [-1, -1];

  discardUnique(ints1: Int32Array, ints2: Int32Array): [Int32Array, Int32Array] {
    const discarded1 = this.discard(ints2, ints1, 0);
    return [discarded1, this.discard(discarded1, ints2, 1)];
  }

  private discard(needed: Int32Array, toDiscard: Int32Array, arrayIndex: 0 | 1): Int32Array {
    this.originalLengths[arrayIndex] = toDiscard.length;
    const set = new Set<number>(needed);
    const discarded: number[] = [];
    const oldIndices: number[] = [];
    for (let i = 0; i < toDiscard.length; i++) {
      const index = toDiscard[i];
      if (set.has(index)) {
        discarded.push(index);
        oldIndices.push(i);
      }
    }
    this.oldIndices[arrayIndex] = Int32Array.from(oldIndices);
    this.discardedLengths[arrayIndex] = discarded.length;
    return Int32Array.from(discarded);
  }

  reindex(discardedChanges: [Bits, Bits], builder: LCSBuilder): void {
    let changes1: Bits;
    let changes2: Bits;
    const [origLen1, origLen2] = this.originalLengths;
    const [discLen1, discLen2] = this.discardedLengths;
    if (discLen1 === origLen1 && discLen2 === origLen2) {
      changes1 = discardedChanges[0];
      changes2 = discardedChanges[1];
    } else {
      changes1 = new Uint8Array(origLen1);
      changes2 = new Uint8Array(origLen2);
      const old1 = this.oldIndices[0];
      const old2 = this.oldIndices[1];
      const d1 = discardedChanges[0];
      const d2 = discardedChanges[1];
      let x = 0;
      let y = 0;
      while (x < discLen1 || y < discLen2) {
        if (x < discLen1 && y < discLen2 && !d1[x] && !d2[y]) {
          x = increment(old1, x, changes1, origLen1);
          y = increment(old2, y, changes2, origLen2);
        } else if (d1[x]) {
          changes1[old1[x]] = 1;
          x = increment(old1, x, changes1, origLen1);
        } else if (d2[y]) {
          changes2[old2[y]] = 1;
          y = increment(old2, y, changes2, origLen2);
        }
      }
      if (discLen1 === 0) setBits(changes1, 0, origLen1);
      else setBits(changes1, 0, old1[0]);
      if (discLen2 === 0) setBits(changes2, 0, origLen2);
      else setBits(changes2, 0, old2[0]);
    }

    let x = 0;
    let y = 0;
    while (x < origLen1 && y < origLen2) {
      const startX = x;
      while (x < origLen1 && y < origLen2 && !changes1[x] && !changes2[y]) {
        x++;
        y++;
      }
      if (x > startX) builder.addEqual(x - startX);
      let dx = 0;
      let dy = 0;
      while (x < origLen1 && changes1[x]) {
        dx++;
        x++;
      }
      while (y < origLen2 && changes2[y]) {
        dy++;
        y++;
      }
      if (dx !== 0 || dy !== 0) builder.addChange(dx, dy);
    }
    if (x !== origLen1 || y !== origLen2) builder.addChange(origLen1 - x, origLen2 - y);
  }
}

function increment(indexes: Int32Array, i: number, set: Bits, length: number): number {
  if (i + 1 < indexes.length) setBits(set, indexes[i] + 1, indexes[i + 1]);
  else setBits(set, indexes[i] + 1, length);
  return i + 1;
}
