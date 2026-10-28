// Ported from com.intellij.util.diff.MyersLCS (JetBrains/intellij-community, Apache-2.0).
// Myers' O(ND) linear-space algorithm. Ported verbatim: tie-breaks affect results.
import { DELTA_THRESHOLD_SIZE } from '../config';

/** Thrown when the difference exceeds the budget (FilesTooBigForDiffException). */
export class FilesTooBigError extends Error {
  constructor() {
    super('Files too big for diff');
    this.name = 'FilesTooBigError';
  }
}

/** Bitset over Uint8Array. Reads past the end are falsy (like Kotlin BitSet.get). */
export type Bits = Uint8Array;

export function setBits(bits: Bits, from: number, to: number, value = true): void {
  const v = value ? 1 : 0;
  for (let i = from; i < to; i++) bits[i] = v;
}

export class MyersLCS {
  private readonly vForward: Int32Array;
  private readonly vBackward: Int32Array;

  constructor(
    private readonly first: Int32Array,
    private readonly second: Int32Array,
    private readonly start1: number = 0,
    private readonly count1: number = first.length,
    private readonly start2: number = 0,
    private readonly count2: number = second.length,
    readonly changes1: Bits = new Uint8Array(first.length),
    readonly changes2: Bits = new Uint8Array(second.length),
  ) {
    setBits(changes1, start1, start1 + count1);
    setBits(changes2, start2, start2 + count2);
    const total = count1 + count2;
    this.vForward = new Int32Array(total + 1);
    this.vBackward = new Int32Array(total + 1);
  }

  executeLinear(): void {
    const threshold = 20000 + 10 * Math.trunc(Math.sqrt(this.count1 + this.count2));
    this.run(threshold, false);
  }

  execute(): void {
    this.run(this.count1 + this.count2, false);
  }

  executeWithThreshold(): void {
    const threshold = Math.max(20000 + 10 * Math.trunc(Math.sqrt(this.count1 + this.count2)), DELTA_THRESHOLD_SIZE);
    this.run(threshold, true);
  }

  get changes(): [Bits, Bits] {
    return [this.changes1, this.changes2];
  }

  private run(threshold: number, throwException: boolean): void {
    if (this.count1 === 0 || this.count2 === 0) return;
    this.executeRange(0, this.count1, 0, this.count2, Math.min(threshold, this.count1 + this.count2), throwException);
  }

  // LCS( old[oldStart, oldEnd), new[newStart, newEnd) )
  private executeRange(oldStart: number, oldEnd: number, newStart: number, newEnd: number, differenceEstimate: number, throwException: boolean): void {
    if (!(oldStart <= oldEnd && newStart <= newEnd)) throw new Error('check failed');
    if (!(oldStart < oldEnd && newStart < newEnd)) return;
    const VForward = this.vForward;
    const VBackward = this.vBackward;
    const oldLength = oldEnd - oldStart;
    const newLength = newEnd - newStart;
    VForward[newLength + 1] = 0;
    VBackward[newLength + 1] = 0;
    const halfD = Math.trunc((differenceEstimate + 1) / 2);
    let xx = -1;
    let kk = -1;
    let td = -1;
    loop: for (let d = 0; d <= halfD; d++) {
      const L = newLength + Math.max(-d, -newLength + ((d ^ newLength) & 1));
      const R = newLength + Math.min(d, oldLength - ((d ^ oldLength) & 1));
      for (let k = L; k <= R; k += 2) {
        let x = k === L || (k !== R && VForward[k - 1] < VForward[k + 1]) ? VForward[k + 1] : VForward[k - 1] + 1;
        const y = x - k + newLength;
        x += this.commonSubsequenceLengthForward(oldStart + x, newStart + y, Math.min(oldEnd - oldStart - x, newEnd - newStart - y));
        VForward[k] = x;
      }
      if ((oldLength - newLength) % 2 !== 0) {
        for (let k = L; k <= R; k += 2) {
          if (oldLength - (d - 1) <= k && k <= oldLength + (d - 1)) {
            if (VForward[k] + VBackward[newLength + oldLength - k] >= oldLength) {
              xx = VForward[k];
              kk = k;
              td = 2 * d - 1;
              break loop;
            }
          }
        }
      }
      for (let k = L; k <= R; k += 2) {
        let x = k === L || (k !== R && VBackward[k - 1] < VBackward[k + 1]) ? VBackward[k + 1] : VBackward[k - 1] + 1;
        const y = x - k + newLength;
        x += this.commonSubsequenceLengthBackward(oldEnd - 1 - x, newEnd - 1 - y, Math.min(oldEnd - oldStart - x, newEnd - newStart - y));
        VBackward[k] = x;
      }
      if ((oldLength - newLength) % 2 === 0) {
        for (let k = L; k <= R; k += 2) {
          if (oldLength - d <= k && k <= oldLength + d) {
            if (VForward[oldLength + newLength - k] + VBackward[k] >= oldLength) {
              xx = oldLength - VBackward[k];
              kk = oldLength + newLength - k;
              td = 2 * d;
              break loop;
            }
          }
        }
      }
    }

    if (td > 1) {
      const yy = xx - kk + newLength;
      const oldDiff = Math.trunc((td + 1) / 2);
      if (0 < xx && 0 < yy) this.executeRange(oldStart, oldStart + xx, newStart, newStart + yy, oldDiff, throwException);
      if (oldStart + xx < oldEnd && newStart + yy < newEnd) {
        this.executeRange(oldStart + xx, oldEnd, newStart + yy, newEnd, td - oldDiff, throwException);
      }
    } else if (td >= 0) {
      let x = oldStart;
      let y = newStart;
      while (x < oldEnd && y < newEnd) {
        const commonLength = this.commonSubsequenceLengthForward(x, y, Math.min(oldEnd - x, newEnd - y));
        if (commonLength > 0) {
          this.addUnchanged(x, y, commonLength);
          x += commonLength;
          y += commonLength;
        } else if (oldEnd - oldStart > newEnd - newStart) {
          ++x;
        } else {
          ++y;
        }
      }
    } else {
      // The difference is more than the given estimate
      if (throwException) throw new FilesTooBigError();
    }
  }

  private addUnchanged(start1: number, start2: number, count: number): void {
    setBits(this.changes1, this.start1 + start1, this.start1 + start1 + count, false);
    setBits(this.changes2, this.start2 + start2, this.start2 + start2 + count, false);
  }

  private commonSubsequenceLengthForward(oldIndex: number, newIndex: number, maxLength: number): number {
    let x = oldIndex;
    let y = newIndex;
    maxLength = Math.min(maxLength, Math.min(this.count1 - oldIndex, this.count2 - newIndex));
    const first = this.first;
    const second = this.second;
    const s1 = this.start1;
    const s2 = this.start2;
    while (x - oldIndex < maxLength && first[s1 + x] === second[s2 + y]) {
      ++x;
      ++y;
    }
    return x - oldIndex;
  }

  private commonSubsequenceLengthBackward(oldIndex: number, newIndex: number, maxLength: number): number {
    let x = oldIndex;
    let y = newIndex;
    maxLength = Math.min(maxLength, Math.min(oldIndex, newIndex) + 1);
    const first = this.first;
    const second = this.second;
    const s1 = this.start1;
    const s2 = this.start2;
    while (oldIndex - x < maxLength && first[s1 + x] === second[s2 + y]) {
      --x;
      --y;
    }
    return oldIndex - x;
  }
}
