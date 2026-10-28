// Ported from com.intellij.diff.fragments.{DiffFragmentImpl, LineFragmentImpl} (JetBrains/intellij-community, Apache-2.0).
import type { DiffFragment, LineFragment } from '../types';

export function createDiffFragment(startOffset1: number, endOffset1: number, startOffset2: number, endOffset2: number): DiffFragment {
  if (startOffset1 === endOffset1 && startOffset2 === endOffset2) {
    throw new Error(`DiffFragment should not be empty: [${startOffset1}, ${endOffset1}) - [${startOffset2}, ${endOffset2})`);
  }
  if (startOffset1 > endOffset1 || startOffset2 > endOffset2) {
    throw new Error(`DiffFragment is invalid: [${startOffset1}, ${endOffset1}) - [${startOffset2}, ${endOffset2})`);
  }
  return { startOffset1, endOffset1, startOffset2, endOffset2 };
}

/** LineFragmentImpl constructor, including `dropWholeChangedFragments`. */
export function createLineFragment(
  startLine1: number, endLine1: number, startLine2: number, endLine2: number,
  startOffset1: number, endOffset1: number, startOffset2: number, endOffset2: number,
  innerFragments: DiffFragment[] | null = null,
): LineFragment {
  if (startLine1 === endLine1 && startLine2 === endLine2) {
    throw new Error(`LineFragment should not be empty: lines [${startLine1}, ${endLine1}) - [${startLine2}, ${endLine2})`);
  }
  if (startLine1 > endLine1 || startLine2 > endLine2 || startOffset1 > endOffset1 || startOffset2 > endOffset2) {
    throw new Error('LineFragment is invalid');
  }
  return {
    startLine1, endLine1, startLine2, endLine2,
    startOffset1, endOffset1, startOffset2, endOffset2,
    innerFragments: dropWholeChangedFragments(innerFragments, endOffset1 - startOffset1, endOffset2 - startOffset2),
  };
}

export function withInnerFragments(f: LineFragment, inner: DiffFragment[] | null): LineFragment {
  return createLineFragment(f.startLine1, f.endLine1, f.startLine2, f.endLine2,
    f.startOffset1, f.endOffset1, f.startOffset2, f.endOffset2, inner);
}

function dropWholeChangedFragments(fragments: DiffFragment[] | null, length1: number, length2: number): DiffFragment[] | null {
  if (fragments != null && fragments.length === 1) {
    const f = fragments[0];
    if (f.startOffset1 === 0 && f.startOffset2 === 0 && f.endOffset1 === length1 && f.endOffset2 === length2) return null;
  }
  return fragments;
}
