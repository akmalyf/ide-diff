// Ported from com.intellij.util.diff.{PatienceIntLCS, UniqueLCS} (JetBrains/intellij-community, Apache-2.0).
import { type Bits, FilesTooBigError, MyersLCS, setBits } from './myers';

export class PatienceIntLCS {
  constructor(
    private readonly first: Int32Array,
    private readonly second: Int32Array,
    private readonly start1: number = 0,
    private readonly count1: number = first.length,
    private readonly start2: number = 0,
    private readonly count2: number = second.length,
    readonly changes1: Bits = new Uint8Array(first.length),
    readonly changes2: Bits = new Uint8Array(second.length),
  ) {}

  get changes(): [Bits, Bits] {
    return [this.changes1, this.changes2];
  }

  execute(failOnSmallReduction = false): void {
    const thresholdCheckCounter = failOnSmallReduction ? 2 : -1;
    this.run(this.start1, this.count1, this.start2, this.count2, thresholdCheckCounter);
  }

  private run(start1: number, count1: number, start2: number, count2: number, thresholdCheckCounter: number): void {
    if (count1 === 0 && count2 === 0) return;
    if (count1 === 0 || count2 === 0) {
      this.addChange(start1, count1, start2, count2);
      return;
    }
    const startOffset = this.matchForward(start1, count1, start2, count2);
    start1 += startOffset;
    start2 += startOffset;
    count1 -= startOffset;
    count2 -= startOffset;
    const endOffset = this.matchBackward(start1, count1, start2, count2);
    count1 -= endOffset;
    count2 -= endOffset;
    if (count1 === 0 || count2 === 0) {
      this.addChange(start1, count1, start2, count2);
      return;
    }
    if (thresholdCheckCounter === 0) this.checkReduction(count1, count2);
    thresholdCheckCounter = Math.max(-1, thresholdCheckCounter - 1);
    const matching = new UniqueLCS(this.first, this.second, start1, count1, start2, count2).execute();
    if (matching == null) {
      if (thresholdCheckCounter >= 0) this.checkReduction(count1, count2);
      new MyersLCS(this.first, this.second, start1, count1, start2, count2, this.changes1, this.changes2).executeLinear();
      return;
    }
    const [m1, m2] = matching;
    const matched = m1.length;
    if (!(matched > 0)) throw new Error('check failed');
    let s1: number;
    let s2: number;
    let c1 = m1[0];
    let c2 = m2[0];
    this.run(start1, c1, start2, c2, thresholdCheckCounter);
    for (let i = 1; i < matched; i++) {
      s1 = m1[i - 1] + 1;
      s2 = m2[i - 1] + 1;
      c1 = m1[i] - s1;
      c2 = m2[i] - s2;
      if (c1 > 0 || c2 > 0) this.run(start1 + s1, c1, start2 + s2, c2, thresholdCheckCounter);
    }
    if (m1[matched - 1] === count1 - 1) {
      s1 = count1 - 1;
      c1 = 0;
    } else {
      s1 = m1[matched - 1] + 1;
      c1 = count1 - s1;
    }
    if (m2[matched - 1] === count2 - 1) {
      s2 = count2 - 1;
      c2 = 0;
    } else {
      s2 = m2[matched - 1] + 1;
      c2 = count2 - s2;
    }
    this.run(start1 + s1, c1, start2 + s2, c2, thresholdCheckCounter);
  }

  private matchForward(start1: number, count1: number, start2: number, count2: number): number {
    const size = Math.min(count1, count2);
    let idx = 0;
    for (let i = 0; i < size; i++) {
      if (this.first[start1 + i] !== this.second[start2 + i]) break;
      ++idx;
    }
    return idx;
  }

  private matchBackward(start1: number, count1: number, start2: number, count2: number): number {
    const size = Math.min(count1, count2);
    let idx = 0;
    for (let i = 1; i <= size; i++) {
      if (this.first[start1 + count1 - i] !== this.second[start2 + count2 - i]) break;
      ++idx;
    }
    return idx;
  }

  private addChange(start1: number, count1: number, start2: number, count2: number): void {
    setBits(this.changes1, start1, start1 + count1);
    setBits(this.changes2, start2, start2 + count2);
  }

  private checkReduction(count1: number, count2: number): void {
    if (count1 * 2 < this.count1) return;
    if (count2 * 2 < this.count2) return;
    throw new FilesTooBigError();
  }
}

export class UniqueLCS {
  constructor(
    private readonly first: Int32Array,
    private readonly second: Int32Array,
    private readonly start1: number = 0,
    private readonly count1: number = first.length,
    private readonly start2: number = 0,
    private readonly count2: number = second.length,
  ) {}

  execute(): [Int32Array, Int32Array] | null {
    // map: key -> (offset1 + 1); match: offset1 -> (offset2 + 1)
    const map = new Map<number, number>();
    const match = new Int32Array(this.count1);
    for (let i = 0; i < this.count1; i++) {
      const key = this.first[this.start1 + i];
      const value = map.get(key) ?? 0;
      if (value === -1) continue;
      if (value === 0) map.set(key, i + 1);
      else map.set(key, -1);
    }
    let count = 0;
    for (let i = 0; i < this.count2; i++) {
      const key = this.second[this.start2 + i];
      const value = map.get(key) ?? 0;
      if (value === 0 || value === -1) continue;
      if (match[value - 1] === 0) {
        match[value - 1] = i + 1;
        count++;
      } else {
        match[value - 1] = 0;
        map.set(key, -1);
        count--;
      }
    }
    if (count === 0) return null;

    // Largest increasing subsequence on unique elements
    const sequence = new Int32Array(count);
    const lastElement = new Int32Array(count);
    const predecessor = new Int32Array(this.count1);
    let length = 0;
    for (let i = 0; i < this.count1; i++) {
      if (match[i] === 0) continue;
      const j = binarySearchInsertion(sequence, match[i], length);
      if (j === length || match[i] < sequence[j]) {
        sequence[j] = match[i];
        lastElement[j] = i;
        predecessor[i] = j > 0 ? lastElement[j - 1] : -1;
        if (j === length) length++;
      }
    }
    const ret1 = new Int32Array(length);
    const ret2 = new Int32Array(length);
    let i = length - 1;
    let curr = lastElement[length - 1];
    while (curr !== -1) {
      ret1[i] = curr;
      ret2[i] = match[curr] - 1;
      i--;
      curr = predecessor[curr];
    }
    return [ret1, ret2];
  }
}

// find max i: a[i] < val; return i + 1 (asserts a[i] != val)
function binarySearchInsertion(a: Int32Array, value: number, length: number): number {
  let l = 0;
  let r = length - 1;
  while (l <= r) {
    const m = (l + r) >>> 1;
    const v = a[m];
    if (v < value) l = m + 1;
    else if (v > value) r = m - 1;
    else throw new Error('check failed: unique value already present');
  }
  return l;
}
