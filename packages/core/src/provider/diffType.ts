// Ported from com.intellij.diff.util.DiffUtil.getLineDiffType / getDiffType (JetBrains/intellij-community, Apache-2.0).
import type { DiffFragment, LineFragment, MergeConflictType, TextDiffType } from '../types';

function diffType(hasDeleted: boolean, hasInserted: boolean): TextDiffType {
  if (hasDeleted && hasInserted) return 'MODIFIED';
  if (hasDeleted) return 'DELETED';
  if (hasInserted) return 'INSERTED';
  return 'MODIFIED'; // IntelliJ logs "Diff fragment should not be empty"
}

/** DiffUtil.getLineDiffType: by line ranges. */
export function getDiffType(f: LineFragment): TextDiffType {
  return diffType(f.startLine1 !== f.endLine1, f.startLine2 !== f.endLine2);
}

/** DiffUtil.getDiffType(DiffFragment): by offsets (use for inner fragments). */
export function getDiffFragmentType(f: DiffFragment): TextDiffType {
  return diffType(f.endOffset1 !== f.startOffset1, f.endOffset2 !== f.startOffset2);
}

/** DiffUtil.getDiffType(MergeConflictType). */
export function getMergeDiffType(t: MergeConflictType): TextDiffType {
  return t.type;
}
