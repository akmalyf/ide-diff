// @ide-diff/core — TypeScript port of JetBrains IntelliJ's diff/merge comparison algorithms
// (com.intellij.diff.comparison, JetBrains/intellij-community, Apache-2.0).

export * from './types';

export {
  compareLines,
  compareLinesInner,
  compareWords,
  compareChars,
  compareLines3,
  squash,
  processBlocks,
} from './comparison/comparisonManager';
export { compareTexts, compareTextsStrict } from './provider/textDiffProvider';
export { mergeLines } from './provider/mergeProvider';
export { getDiffType, getDiffFragmentType } from './provider/diffType';
export { lineOffsets } from './text/lineOffsets';
export { isEqualTexts } from './text/equality';
export { tryResolve, tryGreedyResolve } from './comparison/mergeResolveUtil';
