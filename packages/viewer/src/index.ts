import { DiffViewerHost } from './host';
import type { DiffViewerOptions } from './types';

export type { DiffViewer, DiffViewerOptions } from './types';
export type { HighlightPolicy, IgnorePolicy, LineFragment, DiffFragment, TextDiffType } from '@ide-diff/core';
export { SideBySideDiffViewer } from './sideBySide/SideBySideViewer';
export { UnifiedDiffViewer } from './unified/UnifiedViewer';
export { DiffViewerHost } from './host';
export { ideEditorTheme, ideHighlightStyle, ideSyntaxHighlighting } from './theme/editorTheme';
export { injectStyles } from './theme/styles';
export { icons, getIcon, type IconName } from './icons';

/** Creates a JetBrains-style diff viewer inside `container` (which should have an explicit height). */
export function createDiffViewer(container: HTMLElement, options: DiffViewerOptions): DiffViewerHost {
  return new DiffViewerHost(container, options);
}

// 3-way merge viewer (TextMergeViewer / MergeThreesideViewer port)
export type { MergeViewer, MergeViewerOptions, MergeStatus } from './merge/types';
export { TextMergeViewer, createMergeViewer } from './merge/MergeViewer';
export { mergeSamplePhp } from './merge/samples';
