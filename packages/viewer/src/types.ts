// Public option/handle types (see docs/CONTRACT.md).
import type { Extension } from '@codemirror/state';
import type { HighlightPolicy, IgnorePolicy, LineFragment } from '@ide-diff/core';

export interface DiffViewerOptions {
  original: string;
  modified: string;
  /** CodeMirror language support, e.g. php() from @codemirror/lang-php */
  language?: Extension;
  /** header above each pane (file name / revision) */
  originalTitle?: string;
  modifiedTitle?: string;
  /** default 'side-by-side' */
  mode?: 'side-by-side' | 'unified';
  /** IntelliJ New UI Islands Dark / Light; default 'dark' */
  theme?: 'dark' | 'light';
  ignorePolicy?: IgnorePolicy;
  highlightPolicy?: HighlightPolicy;
  /** default: original read-only, modified editable */
  readOnly?: boolean | { original?: boolean; modified?: boolean };
  /** default true */
  collapseUnchanged?: boolean;
  /** default 4 (IntelliJ default) */
  contextLines?: number;
  /** default true */
  syncScroll?: boolean;
  /** default true */
  showToolbar?: boolean;
  /** extra CodeMirror extensions for both editors */
  extensions?: Extension[];
}

export interface DiffViewer {
  getOriginal(): string;
  getModified(): string;
  setOriginal(text: string): void;
  setModified(text: string): void;
  setOptions(options: Partial<DiffViewerOptions>): void;
  onDidChange(cb: (modified: string) => void): () => void;
  onDidUpdateDiff(cb: (changes: LineFragment[]) => void): () => void;
  getChanges(): LineFragment[];
  goToNextChange(): void;
  goToPreviousChange(): void;
  layout(): void;
  dispose(): void;
}
