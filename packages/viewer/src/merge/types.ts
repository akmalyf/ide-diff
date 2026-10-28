// Public option/handle types of the 3-way merge viewer (see docs/CONTRACT.md).
import type { Extension } from '@codemirror/state';
import type { HighlightPolicy, IgnorePolicy } from '@ide-diff/core';

export interface MergeViewerOptions {
  /** "ours" / local changes (read-only) */
  left: string;
  /** common ancestor; the result editor starts with this text */
  base: string;
  /** "theirs" / incoming changes (read-only) */
  right: string;
  /** CodeMirror language support, e.g. php() from @codemirror/lang-php */
  language?: Extension;
  leftTitle?: string;
  /** title above the middle (result) editor; default "Result" */
  baseTitle?: string;
  rightTitle?: string;
  /** IntelliJ New UI Islands Dark / Light; default 'dark' */
  theme?: 'dark' | 'light';
  /** merge supports DEFAULT / TRIM_WHITESPACES / IGNORE_WHITESPACES (IGNORE_WHITESPACES_CHUNKS → IGNORE_WHITESPACES) */
  ignorePolicy?: IgnorePolicy;
  /** merge supports BY_LINE / BY_WORD (other by-word variants → BY_WORD, DO_NOT_HIGHLIGHT → BY_LINE) */
  highlightPolicy?: HighlightPolicy;
  /** extra CodeMirror extensions for all three editors */
  extensions?: Extension[];

  // ---- optional extras (not in the contract) ----
  /** initial result text (e.g. a partially resolved merge); resolved states are inferred. Default: `base` */
  result?: string;
  /** default true */
  collapseUnchanged?: boolean;
  /** default 4 */
  contextLines?: number;
  /** default true */
  syncScroll?: boolean;
  /** default true */
  showToolbar?: boolean;
  /** "Automatically apply non-conflicting changes" (IntelliJ setting, default false) */
  autoApplyNonConflicting?: boolean;
}

export interface MergeStatus {
  /** unresolved non-conflicting changes */
  changes: number;
  /** unresolved conflicts */
  conflicts: number;
}

export interface MergeViewer {
  getResult(): string;
  onDidChange(cb: (result: string) => void): () => void;
  applyNonConflicting(side?: 'left' | 'right' | 'all'): void;
  goToNextConflict(): void;
  goToPreviousConflict(): void;
  setOptions(options: Partial<MergeViewerOptions>): void;
  dispose(): void;

  // ---- optional extras ----
  /** "Resolve simple conflicts" (magic wand toolbar action) */
  resolveSimpleConflicts(): void;
  /** "Accept Left" / "Accept Right" (merge dialog buttons): result = that side for every change */
  acceptSide(side: 'left' | 'right'): void;
  /** "Revert conflict resolution": every resolved change goes back to base */
  revertResolution(): void;
  goToNextChange(): void;
  goToPreviousChange(): void;
  getStatus(): MergeStatus;
  onDidUpdateStatus(cb: (status: MergeStatus) => void): () => void;
  layout(): void;
}
