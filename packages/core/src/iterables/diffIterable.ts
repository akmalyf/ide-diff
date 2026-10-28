// Ported from com.intellij.diff.comparison.iterables.* (JetBrains/intellij-community, Apache-2.0).
// Iterables are materialised as arrays; sizes are small after LCS.
import { Range } from '../util/range';

/**
 * Computed differences between two sequences. Ranges are sorted, non-empty (changes) and non-overlapping,
 * but NOT guaranteed to be squashed. `unchanged()` may contain empty ranges between touching changes.
 */
export interface DiffIterable {
  readonly length1: number;
  readonly length2: number;
  changes(): readonly Range[];
  unchanged(): readonly Range[];
}

/**
 * Marker: elements are compared one-by-one, unchanged ranges have equal lengths on both sides.
 * (Kotlin marker interface; here a documentation-only alias.)
 */
export type FairDiffIterable = DiffIterable;

let verifyEnabled = false;

/** Test-only: enables expensive invariant checks (DiffIterableUtil.setVerifyEnabled). */
export function setVerifyEnabled(value: boolean): void {
  verifyEnabled = value;
}

/** ChangeDiffIterableBase over an explicit list of changes. */
class RangesDiffIterable implements DiffIterable {
  private unchangedCache: Range[] | null = null;

  constructor(
    private readonly ranges: readonly Range[],
    readonly length1: number,
    readonly length2: number,
  ) {}

  changes(): readonly Range[] {
    return this.ranges;
  }

  unchanged(): readonly Range[] {
    if (this.unchangedCache == null) this.unchangedCache = computeUnchanged(this.ranges, this.length1, this.length2);
    return this.unchangedCache;
  }
}

/** ChangeDiffIterableBase.UnchangedIterator, ported verbatim (may yield empty ranges). */
function computeUnchanged(ranges: readonly Range[], length1: number, length2: number): Range[] {
  const result: Range[] = [];
  let last1 = 0;
  let last2 = 0;
  let i = 0;
  if (ranges.length > 0 && ranges[0].start1 === 0 && ranges[0].start2 === 0) {
    last1 = ranges[0].end1;
    last2 = ranges[0].end2;
    i = 1;
  }
  for (; i < ranges.length; i++) {
    const r = ranges[i];
    if (!(r.start1 >= last1 || r.start2 >= last2)) throw new Error('check failed');
    result.push(new Range(last1, r.start1, last2, r.start2));
    last1 = r.end1;
    last2 = r.end2;
  }
  if (last1 !== length1 || last2 !== length2) result.push(new Range(last1, length1, last2, length2));
  return result;
}

class InvertedDiffIterable implements DiffIterable {
  constructor(private readonly iterable: DiffIterable) {}
  get length1(): number {
    return this.iterable.length1;
  }
  get length2(): number {
    return this.iterable.length2;
  }
  changes(): readonly Range[] {
    return this.iterable.unchanged();
  }
  unchanged(): readonly Range[] {
    return this.iterable.changes();
  }
}

export function create(ranges: readonly Range[], length1: number, length2: number): DiffIterable {
  const iterable = new RangesDiffIterable(ranges, length1, length2);
  verify(iterable);
  return iterable;
}

export function createUnchanged(ranges: readonly Range[], length1: number, length2: number): DiffIterable {
  const inverted = invert(create(ranges, length1, length2));
  verify(inverted);
  return inverted;
}

export function invert(iterable: DiffIterable): DiffIterable {
  const wrapper = new InvertedDiffIterable(iterable);
  verify(wrapper);
  return wrapper;
}

export function fair(iterable: DiffIterable): FairDiffIterable {
  verifyFair(iterable);
  return iterable;
}

/**
 * SubiterableDiffIterable: window [start1,end1)x[start2,end2) onto a list of changes, re-based to (start1, start2).
 * `firstIndex` is the first range in `changed` that might affect the window.
 */
export function subiterable(
  changed: readonly Range[],
  start1: number, end1: number, start2: number, end2: number,
  firstIndex: number,
): DiffIterable {
  const result: Range[] = [];
  for (let index = firstIndex; index < changed.length; index++) {
    const range = changed[index];
    if (range.end1 < start1 || range.end2 < start2) continue;
    if (range.start1 > end1 || range.start2 > end2) break;
    const r = new Range(
      Math.max(start1, range.start1) - start1, Math.min(end1, range.end1) - start1,
      Math.max(start2, range.start2) - start2, Math.min(end2, range.end2) - start2,
    );
    if (r.isEmpty) continue;
    result.push(r);
  }
  return new RangesDiffIterable(result, end1 - start1, end2 - start2);
}

/** DiffIterableUtil.iterateAll: alternating [range, isEqual] pairs covering both sequences. */
export function iterateAll(iterable: DiffIterable): Array<[Range, boolean]> {
  const result: Array<[Range, boolean]> = [];
  const changes = iterable.changes();
  const peekUnchanged = (start1: number, start2: number, index: number): Range | null => {
    const next = index < changes.length ? changes[index] : null;
    const r = next != null
      ? new Range(start1, next.start1, start2, next.start2)
      : new Range(start1, iterable.length1, start2, iterable.length2);
    return r.isEmpty ? null : r;
  };
  let u = peekUnchanged(0, 0, 0);
  if (u) result.push([u, true]);
  for (let i = 0; i < changes.length; i++) {
    const ch = changes[i];
    result.push([ch, false]);
    u = peekUnchanged(ch.end1, ch.end2, i + 1);
    if (u) result.push([u, true]);
  }
  return result;
}

// ---- verification (test-only) ----

export function verify(iterable: DiffIterable): void {
  if (!verifyEnabled) return;
  verifyRanges(iterable.changes());
  verifyRanges(iterable.unchanged());
  verifyFullCover(iterable);
}

export function verifyFair(iterable: DiffIterable): void {
  if (!verifyEnabled) return;
  verify(iterable);
  for (const r of iterable.unchanged()) {
    if (r.end1 - r.start1 !== r.end2 - r.start2) throw new Error(`verifyFair failed: ${r}`);
  }
}

function verifyRanges(ranges: readonly Range[]): void {
  for (const r of ranges) {
    if (!(r.start1 <= r.end1)) throw new Error(`verify failed: ${r}`);
    if (!(r.start2 <= r.end2)) throw new Error(`verify failed: ${r}`);
    if (r.isEmpty) throw new Error(`verify failed: empty range ${r}`);
  }
}

function verifyFullCover(iterable: DiffIterable): void {
  let last1 = 0;
  let last2 = 0;
  let lastEquals: boolean | null = null;
  for (const [range, equal] of iterateAll(iterable)) {
    if (last1 !== range.start1 || last2 !== range.start2 || lastEquals === equal) {
      throw new Error(`verifyFullCover failed at ${range}`);
    }
    last1 = range.end1;
    last2 = range.end2;
    lastEquals = equal;
  }
  if (last1 !== iterable.length1 || last2 !== iterable.length2) throw new Error('verifyFullCover failed: not fully covered');
}
