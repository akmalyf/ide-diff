// Ported from com.intellij.util.diff.Diff + com.intellij.diff.util.Enumerator (JetBrains/intellij-community, Apache-2.0).
import { USE_PATIENCE_ALG } from '../config';
import { Range } from '../util/range';
import { type Bits, FilesTooBigError, MyersLCS } from './myers';
import { PatienceIntLCS } from './patience';
import { type LCSBuilder, Reindexer } from './reindexer';

/** Diff.ChangeBuilder: collects changes as ranges (line0, line0+deleted, line1, line1+inserted). */
class ChangeBuilder implements LCSBuilder {
  private index1: number;
  private index2: number;
  readonly changes: Range[] = [];

  constructor(startShift: number) {
    this.index1 = startShift;
    this.index2 = startShift;
  }

  addChange(first: number, second: number): void {
    this.changes.push(new Range(this.index1, this.index1 + first, this.index2, this.index2 + second));
    this.index1 += first;
    this.index2 += second;
  }

  addEqual(length: number): void {
    this.index1 += length;
    this.index2 += length;
  }
}

type Seq = ArrayLike<string | number>;

/**
 * Diff.buildChanges: changed ranges between two sequences compared by `===`.
 * @throws FilesTooBigError
 */
export function buildChanges(objects1: Seq, objects2: Seq): Range[] {
  const n1 = objects1.length;
  const n2 = objects2.length;
  const size = Math.min(n1, n2);
  let startShift = 0;
  while (startShift < size && objects1[startShift] === objects2[startShift]) startShift++;
  const size2 = size - startShift;
  let endCut = 0;
  while (endCut < size2 && objects1[n1 - endCut - 1] === objects2[n2 - endCut - 1]) endCut++;

  const trimmed1 = n1 - startShift - endCut;
  const trimmed2 = n2 - startShift - endCut;
  if (trimmed1 === 0 || trimmed2 === 0) {
    if (trimmed1 === 0 && trimmed2 === 0) return [];
    return [new Range(startShift, startShift + trimmed1, startShift, startShift + trimmed2)];
  }

  // Enumerator
  const numbers = new Map<string | number, number>();
  let next = 1;
  const enumerate = (seq: Seq, len: number): Int32Array => {
    const result = new Int32Array(len);
    for (let i = 0; i < len; i++) {
      const obj = seq[startShift + i];
      let num = numbers.get(obj);
      if (num === undefined) {
        num = next++;
        numbers.set(obj, num);
      }
      result[i] = num;
    }
    return result;
  };
  const ints1 = enumerate(objects1, trimmed1);
  const ints2 = enumerate(objects2, trimmed2);
  const builder = new ChangeBuilder(startShift);
  doBuildChanges(ints1, ints2, builder);
  return builder.changes;
}

function doBuildChanges(ints1: Int32Array, ints2: Int32Array, builder: ChangeBuilder): void {
  const reindexer = new Reindexer(); // discard unique elements, that have no chance to be matched
  const discarded = reindexer.discardUnique(ints1, ints2);
  if (discarded[0].length === 0 && discarded[1].length === 0) {
    builder.addChange(ints1.length, ints2.length);
    return;
  }
  let changes: [Bits, Bits];
  if (USE_PATIENCE_ALG) {
    const patience = new PatienceIntLCS(discarded[0], discarded[1]);
    patience.execute();
    changes = patience.changes;
  } else {
    try {
      const lcs = new MyersLCS(discarded[0], discarded[1]);
      lcs.executeWithThreshold();
      changes = lcs.changes;
    } catch (e) {
      if (!(e instanceof FilesTooBigError)) throw e;
      const patience = new PatienceIntLCS(discarded[0], discarded[1]);
      patience.execute(true);
      changes = patience.changes;
    }
  }
  reindexer.reindex(changes, builder);
}
