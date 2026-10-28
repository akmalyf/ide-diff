// Ported from com.intellij.diff.comparison.ByLineRt + ChangeCorrector.SmartLineChangeCorrector
// (JetBrains/intellij-community, Apache-2.0).
import type { ComparisonPolicy } from '../types';
import { UNIMPORTANT_LINE_CHAR_COUNT } from '../config';
import { isEquals } from '../text/equality';
import { diff, ExpandChangeBuilder } from '../iterables/changeBuilder';
import { create, type FairDiffIterable, fair } from '../iterables/diffIterable';
import type { MergeRange, Range } from '../util/range';
import { expandKeys } from '../util/trim';
import { ChangeCorrector } from './changeCorrector';
import { LineChunkOptimizer } from './chunkOptimizer';
import { buildMerge, buildSimple } from './comparisonMergeUtil';
import { Line } from './line';

const IW: ComparisonPolicy = 'IGNORE_WHITESPACES';

const getLines = (texts: readonly string[], policy: ComparisonPolicy): Line[] => texts.map((t) => new Line(t, policy));
const convertMode = (lines: readonly Line[], policy: ComparisonPolicy): Line[] => lines.map((l) => l.withPolicy(policy));
const keysOf = (lines: readonly Line[]): string[] => lines.map((l) => l.key);

/** ByLineRt.compare (2-way). */
export function compareLinesRt(lines1: readonly string[], lines2: readonly string[], policy: ComparisonPolicy): FairDiffIterable {
  return doCompare(getLines(lines1, policy), getLines(lines2, policy), policy);
}

/** ByLineRt.compare (3-way, no ignored blocks). left, base, right. */
export function compareLines3Rt(lines1: readonly string[], lines2: readonly string[], lines3: readonly string[], policy: ComparisonPolicy): MergeRange[] {
  return doCompare3(getLines(lines1, policy), getLines(lines2, policy), getLines(lines3, policy), policy, false);
}

/** ByLineRt.merge (3-way, keeps "ignored" whitespace-only blocks for non-DEFAULT policies). left, base, right. */
export function mergeLinesRt(lines1: readonly string[], lines2: readonly string[], lines3: readonly string[], policy: ComparisonPolicy): MergeRange[] {
  return doCompare3(getLines(lines1, policy), getLines(lines2, policy), getLines(lines3, policy), policy, true);
}

function doCompare(lines1: Line[], lines2: Line[], policy: ComparisonPolicy): FairDiffIterable {
  if (policy === IW) {
    let changes = compareSmart(lines1, lines2);
    changes = new LineChunkOptimizer(lines1, lines2, changes).build();
    return expandRanges(lines1, lines2, changes);
  }
  const iwLines1 = convertMode(lines1, IW);
  const iwLines2 = convertMode(lines2, IW);
  let iwChanges = compareSmart(iwLines1, iwLines2);
  iwChanges = new LineChunkOptimizer(lines1, lines2, iwChanges).build();
  return correctChangesSecondStep(lines1, lines2, iwChanges);
}

function doCompare3(lines1: Line[], lines2: Line[], lines3: Line[], policy: ComparisonPolicy, keepIgnoredChanges: boolean): MergeRange[] {
  const iwLines1 = convertMode(lines1, IW);
  const iwLines2 = convertMode(lines2, IW);
  const iwLines3 = convertMode(lines3, IW);

  let iwChanges1 = compareSmart(iwLines2, iwLines1);
  iwChanges1 = new LineChunkOptimizer(lines2, lines1, iwChanges1).build();
  const iterable1 = correctChangesSecondStep(lines2, lines1, iwChanges1);

  let iwChanges2 = compareSmart(iwLines2, iwLines3);
  iwChanges2 = new LineChunkOptimizer(lines2, lines3, iwChanges2).build();
  const iterable2 = correctChangesSecondStep(lines2, lines3, iwChanges2);

  if (keepIgnoredChanges && policy !== 'DEFAULT') {
    return buildMerge(iterable1, iterable2, (index1, index2, index3) => {
      const content1 = lines1[index1].content;
      const content2 = lines2[index2].content;
      const content3 = lines3[index3].content;
      return content2 === content1 && content2 === content3;
    });
  }
  return buildSimple(iterable1, iterable2);
}

/**
 * Compared lines are IW-equal, but not necessarily equal under the requested policy.
 * Re-match them so that as many exactly-equal pairs as possible are matched.
 * Never matches lines that were unmatched in the first step.
 */
function correctChangesSecondStep(lines1: readonly Line[], lines2: readonly Line[], changes: FairDiffIterable): FairDiffIterable {
  const keys1 = keysOf(lines1);
  const keys2 = keysOf(lines2);
  const builder = new ExpandChangeBuilder(keys1, keys2);
  let sample: string | null = null;
  let last1 = 0;
  let last2 = 0;

  const alignExactMatching = (subLines1: number[], subLines2: number[]): void => {
    const n = Math.max(subLines1.length, subLines2.length);
    const skipAligning = n > 10 || // we use brute-force algorithm (C_n_k). This will limit search space by ~250 cases.
      subLines1.length === subLines2.length; // nothing to do
    if (skipAligning) {
      const count = Math.min(subLines1.length, subLines2.length);
      for (let i = 0; i < count; i++) {
        const index1 = subLines1[i];
        const index2 = subLines2[i];
        if (keys1[index1] === keys2[index2]) builder.markEqual(index1, index2);
      }
      return;
    }
    if (subLines1.length < subLines2.length) {
      const matching = getBestMatchingAlignment(subLines1, subLines2, keys1, keys2);
      for (let i = 0; i < subLines1.length; i++) {
        const index1 = subLines1[i];
        const index2 = subLines2[matching[i]];
        if (keys1[index1] === keys2[index2]) builder.markEqual(index1, index2);
      }
    } else {
      const matching = getBestMatchingAlignment(subLines2, subLines1, keys2, keys1);
      for (let i = 0; i < subLines2.length; i++) {
        const index1 = subLines1[matching[i]];
        const index2 = subLines2[i];
        if (keys1[index1] === keys2[index2]) builder.markEqual(index1, index2);
      }
    }
  };

  const flush = (line1: number, line2: number): void => {
    if (sample == null) return;
    const start1 = Math.max(last1, builder.index1);
    const start2 = Math.max(last2, builder.index2);
    const subLines1: number[] = [];
    const subLines2: number[] = [];
    for (let i = start1; i < line1; i++) {
      if (isEquals(sample, lines1[i].content, IW)) {
        subLines1.push(i);
        last1 = i + 1;
      }
    }
    for (let i = start2; i < line2; i++) {
      if (isEquals(sample, lines2[i].content, IW)) {
        subLines2.push(i);
        last2 = i + 1;
      }
    }
    if (!(subLines1.length > 0 && subLines2.length > 0)) throw new Error('check failed: correctChangesSecondStep');
    alignExactMatching(subLines1, subLines2);
    sample = null;
  };

  for (const range of changes.unchanged()) {
    const count = range.end1 - range.start1;
    for (let i = 0; i < count; i++) {
      const index1 = range.start1 + i;
      const index2 = range.start2 + i;
      if (!isEquals(sample, lines1[index1].content, IW)) {
        if (keys1[index1] === keys2[index2]) {
          flush(index1, index2);
          builder.markEqual(index1, index2);
        } else {
          flush(index1, index2);
          sample = lines1[index1].content;
        }
      }
    }
  }
  flush(changes.length1, changes.length2);
  return fair(builder.finish());
}

function getBestMatchingAlignment(subLines1: number[], subLines2: number[], keys1: readonly string[], keys2: readonly string[]): number[] {
  if (!(subLines1.length < subLines2.length)) throw new Error('check failed');
  const size = subLines1.length;
  const comb = new Array<number>(size).fill(0);
  const best = Array.from({ length: size }, (_, i) => i);
  let bestWeight = 0;

  const processCombination = (): void => {
    let weight = 0;
    for (let i = 0; i < size; i++) {
      if (keys1[subLines1[i]] === keys2[subLines2[comb[i]]]) weight++;
    }
    if (weight > bestWeight) {
      bestWeight = weight;
      for (let i = 0; i < size; i++) best[i] = comb[i];
    }
  };
  const combinations = (start: number, n: number, k: number): void => {
    if (k === size) {
      processCombination();
      return;
    }
    for (let i = start; i <= n; i++) {
      comb[k] = i;
      combinations(i + 1, n, k + 1);
    }
  };
  combinations(0, subLines2.length - 1, 0);
  return best;
}

/** Two-step diff: ignore "unimportant" lines (<= 3 non-space chars) on the first pass. */
function compareSmart(lines1: readonly Line[], lines2: readonly Line[]): FairDiffIterable {
  const threshold: number = UNIMPORTANT_LINE_CHAR_COUNT;
  if (threshold === 0) return diff(keysOf(lines1), keysOf(lines2));
  const [bigLines1, indexes1] = getBigLines(lines1, threshold);
  const [bigLines2, indexes2] = getBigLines(lines2, threshold);
  const changes = diff(keysOf(bigLines1), keysOf(bigLines2));
  return new SmartLineChangeCorrector(indexes1, indexes2, lines1, lines2, changes).build();
}

function getBigLines(lines: readonly Line[], threshold: number): [Line[], number[]] {
  const bigLines: Line[] = [];
  const indexes: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].nonSpaceChars > threshold) {
      bigLines.push(lines[i]);
      indexes.push(i);
    }
  }
  return [bigLines, indexes];
}

function expandRanges(lines1: readonly Line[], lines2: readonly Line[], iterable: FairDiffIterable): FairDiffIterable {
  const keys1 = keysOf(lines1);
  const keys2 = keysOf(lines2);
  const changes: Range[] = [];
  for (const ch of iterable.changes()) {
    const expanded = expandKeys(keys1, keys2, ch.start1, ch.start2, ch.end1, ch.end2);
    if (!expanded.isEmpty) changes.push(expanded);
  }
  return fair(create(changes, lines1.length, lines2.length));
}

class SmartLineChangeCorrector extends ChangeCorrector {
  private readonly keys1: string[];
  private readonly keys2: string[];

  constructor(
    private readonly indexes1: readonly number[],
    private readonly indexes2: readonly number[],
    lines1: readonly Line[],
    lines2: readonly Line[],
    changes: FairDiffIterable,
  ) {
    super(lines1.length, lines2.length, changes);
    this.keys1 = keysOf(lines1);
    this.keys2 = keysOf(lines2);
  }

  protected matchGap(start1: number, end1: number, start2: number, end2: number): void {
    const expand = expandKeys(this.keys1, this.keys2, start1, start2, end1, end2);
    const inner1 = this.keys1.slice(expand.start1, expand.end1);
    const inner2 = this.keys2.slice(expand.start2, expand.end2);
    const innerChanges = diff(inner1, inner2);
    this.builder.markEqual(start1, start2, expand.start1, expand.start2);
    for (const chunk of innerChanges.unchanged()) {
      this.builder.markEqualCount(expand.start1 + chunk.start1, expand.start2 + chunk.start2, chunk.end1 - chunk.start1);
    }
    this.builder.markEqual(expand.end1, expand.end2, end1, end2);
  }

  protected getOriginalRange1(index: number): [number, number] {
    const offset = this.indexes1[index];
    return [offset, offset + 1];
  }

  protected getOriginalRange2(index: number): [number, number] {
    const offset = this.indexes2[index];
    return [offset, offset + 1];
  }
}
