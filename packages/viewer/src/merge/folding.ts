// "Collapse unchanged fragments" for N editors: FoldingModelSupport.FoldingBuilderBase.build generalized to the
// three merge editors (left / result / right). Rendering reuses common/folding (setFolds + FoldWidget).
import type { FoldRegion } from '../common/folding';

export interface FoldGroupN {
  id: number;
  /** blocks[level][side] — null when that side has nothing to fold at this level */
  blocks: Array<Array<FoldRegion | null>>;
  /** gap start line per side (keeps the expanded state across recomputations) */
  anchor: number[];
}

const MIN = Number.MIN_SAFE_INTEGER;
const MAX = Number.MAX_SAFE_INTEGER;

/** FoldingModelSupport.getRangeShift: nested context levels range, 2*range, 4*range */
function rangeShift(range: number, level: number): number {
  return level === 0 ? range : level === 1 ? range * 2 : level === 2 ? range * 4 : -1;
}

const bound = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * `changes[i]` = [start0, end0, start1, end1, ...] for every side (sorted, non-overlapping per side).
 * `lineCount[side]` = number of lines of that side's document.
 */
export function computeFoldGroupsN(changes: ReadonlyArray<readonly number[]>, lineCount: readonly number[], range: number): FoldGroupN[] {
  const n = lineCount.length;
  const groups: FoldGroupN[] = [];
  const addGroup = (starts: number[], ends: number[]) => {
    const blocks: FoldGroupN['blocks'] = [];
    for (let level = 0; ; level++) {
      const shift = rangeShift(range, level);
      if (shift === -1) break;
      const row: Array<FoldRegion | null> = new Array(n).fill(null);
      let any = false;
      for (let side = 0; side < n; side++) {
        const s = bound(starts[side]! + shift, 0, lineCount[side]!);
        const e = bound(ends[side]! - shift, 0, lineCount[side]!);
        if (e - s >= 2) {
          row[side] = { groupId: groups.length, startLine: s, endLine: e };
          any = true;
        }
      }
      if (any) blocks.push(row);
    }
    if (blocks.length) {
      groups.push({ id: groups.length, blocks, anchor: starts.map((s, side) => bound(s, 0, lineCount[side]!)) });
    }
  };
  let last: number[] = new Array(n).fill(MIN);
  for (const c of changes) {
    addGroup(last, Array.from({ length: n }, (_, side) => c[side * 2]!));
    last = Array.from({ length: n }, (_, side) => c[side * 2 + 1]!);
  }
  addGroup(last, new Array(n).fill(MAX));
  return groups;
}
