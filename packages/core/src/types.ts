// Shared contract for @ide-diff/core. Mirrors com.intellij.diff.comparison / com.intellij.diff.fragments.
// Viewer packages depend ONLY on what is exported here + the functions declared in index.ts.

/** com.intellij.diff.comparison.ComparisonPolicy */
export type ComparisonPolicy = 'DEFAULT' | 'TRIM_WHITESPACES' | 'IGNORE_WHITESPACES';

/** com.intellij.diff.tools.util.text.IgnorePolicy (toolbar "Ignore whitespaces" dropdown). */
export type IgnorePolicy =
  | 'DEFAULT' // Do not ignore
  | 'TRIM_WHITESPACES' // Trim whitespaces
  | 'IGNORE_WHITESPACES' // Ignore whitespaces
  | 'IGNORE_WHITESPACES_CHUNKS'; // Ignore whitespaces and empty lines

/** com.intellij.diff.tools.util.text.HighlightPolicy (toolbar "Highlight" dropdown). */
export type HighlightPolicy =
  | 'BY_LINE' // Highlight lines
  | 'BY_WORD' // Highlight words
  | 'BY_WORD_SPLIT' // Highlight split changes
  | 'BY_CHAR' // Highlight symbols
  | 'DO_NOT_HIGHLIGHT'; // Do not highlight

/** com.intellij.diff.fragments.DiffFragment — offsets are relative to the enclosing LineFragment start offsets. */
export interface DiffFragment {
  startOffset1: number;
  endOffset1: number;
  startOffset2: number;
  endOffset2: number;
}

/**
 * com.intellij.diff.fragments.LineFragment.
 * Lines are 0-based, end exclusive. Offsets are absolute char offsets into text1/text2, end exclusive.
 * innerFragments: null => whole change highlighted as one block (BY_LINE / DO_NOT_HIGHLIGHT or too big);
 * otherwise word/char-level sub-ranges with offsets RELATIVE to startOffset1/startOffset2.
 */
export interface LineFragment extends DiffFragment {
  startLine1: number;
  endLine1: number;
  startLine2: number;
  endLine2: number;
  innerFragments: DiffFragment[] | null;
}

/** com.intellij.diff.util.TextDiffType */
export type TextDiffType = 'INSERTED' | 'DELETED' | 'MODIFIED' | 'CONFLICT';

/** com.intellij.diff.util.ThreeSide: 0 = LEFT, 1 = BASE, 2 = RIGHT */
export type ThreeSide = 0 | 1 | 2;

/** com.intellij.diff.fragments.MergeLineFragment — [left, base, right] line ranges, 0-based, end exclusive. */
export interface MergeLineFragment {
  startLine: [number, number, number];
  endLine: [number, number, number];
}

/** com.intellij.diff.util.MergeConflictType */
export interface MergeConflictType {
  type: TextDiffType; // INSERTED / DELETED / MODIFIED for non-conflicting, CONFLICT otherwise
  leftChange: boolean;
  rightChange: boolean;
  /** true when IntelliJ's "Resolve simple conflicts" (magic wand) could auto-resolve it */
  canBeResolved: boolean;
}

export interface MergeLineFragmentWithType extends MergeLineFragment {
  conflictType: MergeConflictType;
  /** word-level inner fragments per side (index by ThreeSide), null when not computed */
  innerFragments: [DiffFragment[] | null, DiffFragment[] | null, DiffFragment[] | null] | null;
}

export interface CompareOptions {
  ignorePolicy?: IgnorePolicy; // default 'DEFAULT'
  highlightPolicy?: HighlightPolicy; // default 'BY_WORD'
}

/** Thrown internally (and caught) when a diff is too big; mirrors DiffTooBigException behaviour. */
export class DiffTooBigError extends Error {
  constructor() {
    super('Diff is too big');
    this.name = 'DiffTooBigError';
  }
}
