// Builds the single "unified" document from two texts and their line fragments.
// Port of com.intellij.diff.tools.fragmented.UnifiedFragmentBuilder (master side = right):
// unchanged lines come from the right text, each change shows its deleted (left) lines followed by its
// inserted (right) lines.
import type { LineFragment } from '@ide-diff/core';

export interface UnifiedChange {
  /** unified lines: deleted block [line1, insertedStart), inserted block [insertedStart, line2) */
  line1: number;
  insertedStart: number;
  line2: number;
  fragment: LineFragment;
}

export interface UnifiedState {
  text: string;
  changes: UnifiedChange[];
  /** per unified line: 0-based line in the left text, or -1 */
  lineMap1: Int32Array;
  /** per unified line: 0-based line in the right text, or -1 */
  lineMap2: Int32Array;
}

function splitLines(text: string): string[] {
  return text.split('\n');
}

export function buildUnified(text1: string, text2: string, fragments: LineFragment[]): UnifiedState {
  const lines1 = splitLines(text1);
  const lines2 = splitLines(text2);
  const out: string[] = [];
  const map1: number[] = [];
  const map2: number[] = [];
  const changes: UnifiedChange[] = [];

  let next1 = 0;
  let next2 = 0;
  const equals = (end1: number, end2: number) => {
    // equal regions have the same number of lines on both sides
    for (let i = 0; next2 + i < end2; i++) {
      out.push(lines2[next2 + i]!);
      map1.push(next1 + i < end1 ? next1 + i : -1);
      map2.push(next2 + i);
    }
    next1 = end1;
    next2 = end2;
  };

  for (const f of fragments) {
    equals(f.startLine1, f.startLine2);
    const line1 = out.length;
    for (let l = f.startLine1; l < f.endLine1; l++) {
      out.push(lines1[l]!);
      map1.push(l);
      map2.push(-1);
    }
    const insertedStart = out.length;
    for (let l = f.startLine2; l < f.endLine2; l++) {
      out.push(lines2[l]!);
      map1.push(-1);
      map2.push(l);
    }
    changes.push({ line1, insertedStart, line2: out.length, fragment: f });
    next1 = f.endLine1;
    next2 = f.endLine2;
  }
  equals(lines1.length, lines2.length);

  return { text: out.join('\n'), changes, lineMap1: Int32Array.from(map1), lineMap2: Int32Array.from(map2) };
}

/** Converts a unified-document offset to an offset in the right text (null inside deleted lines). */
export function unifiedToRight(state: UnifiedState, unifiedLineStarts: number[], rightLineStarts: number[], pos: number): number | null {
  let lo = 0;
  let hi = unifiedLineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (unifiedLineStarts[mid]! <= pos) lo = mid;
    else hi = mid - 1;
  }
  const right = state.lineMap2[lo]!;
  if (right < 0) return null;
  return rightLineStarts[right]! + (pos - unifiedLineStarts[lo]!);
}

export function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  return starts;
}
