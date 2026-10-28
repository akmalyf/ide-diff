// Ported from com.intellij.diff.comparison.iterables.DiffIterableUtil (JetBrains/intellij-community, Apache-2.0).
import { DiffTooBigError } from '../types';
import { buildChanges } from '../lcs/diff';
import { FilesTooBigError } from '../lcs/myers';
import { Range } from '../util/range';
import { expandKeys } from '../util/trim';
import { create, type DiffIterable, type FairDiffIterable, fair } from './diffIterable';

/**
 * DiffIterableUtil.diff: compare two sequences of keys (strings) or ints (code points) by `===`.
 * @throws DiffTooBigError
 */
export function diff(data1: ArrayLike<string | number>, data2: ArrayLike<string | number>): FairDiffIterable {
  try {
    const changes = buildChanges(data1, data2);
    return fair(create(changes, data1.length, data2.length));
  } catch (e) {
    if (e instanceof FilesTooBigError) throw new DiffTooBigError();
    throw e;
  }
}

/** DiffIterableUtil.ChangeBuilder. */
export class ChangeBuilder {
  private _index1 = 0;
  private _index2 = 0;
  protected readonly changes: Range[] = [];

  constructor(
    readonly length1: number,
    readonly length2: number,
  ) {}

  get index1(): number {
    return this._index1;
  }

  get index2(): number {
    return this._index2;
  }

  /** markEqual(index1, index2, end1, end2). Use {@link markEqualCount} for (index1, index2, count). */
  markEqual(index1: number, index2: number, end1: number = index1 + 1, end2: number = index2 + 1): void {
    if (index1 === end1 && index2 === end2) return;
    if (!(this._index1 <= index1 && this._index2 <= index2 && index1 <= end1 && index2 <= end2)) {
      throw new Error(`ChangeBuilder.markEqual: invalid state (${this._index1}, ${this._index2}) -> [${index1}, ${end1}) [${index2}, ${end2})`);
    }
    if (this._index1 !== index1 || this._index2 !== index2) this.addChange(this._index1, this._index2, index1, index2);
    this._index1 = end1;
    this._index2 = end2;
  }

  markEqualCount(index1: number, index2: number, count: number): void {
    this.markEqual(index1, index2, index1 + count, index2 + count);
  }

  protected addChange(start1: number, start2: number, end1: number, end2: number): void {
    this.changes.push(new Range(start1, end1, start2, end2));
  }

  finish(): DiffIterable {
    if (!(this._index1 <= this.length1 && this._index2 <= this.length2)) throw new Error('ChangeBuilder.finish: invalid state');
    if (this.length1 !== this._index1 || this.length2 !== this._index2) {
      this.addChange(this._index1, this._index2, this.length1, this.length2);
      this._index1 = this.length1;
      this._index2 = this.length2;
    }
    return create(this.changes, this.length1, this.length2);
  }
}

/** ExpandChangeBuilder: strips equal elements at both edges of every change. */
export class ExpandChangeBuilder extends ChangeBuilder {
  constructor(
    private readonly keys1: readonly string[],
    private readonly keys2: readonly string[],
  ) {
    super(keys1.length, keys2.length);
  }

  protected override addChange(start1: number, start2: number, end1: number, end2: number): void {
    const range = expandKeys(this.keys1, this.keys2, start1, start2, end1, end2);
    if (!range.isEmpty) super.addChange(range.start1, range.start2, range.end1, range.end2);
  }
}
