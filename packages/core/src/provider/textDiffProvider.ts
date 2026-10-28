// Ported from com.intellij.diff.tools.util.text.{TwosideTextDiffProviderBase, SimpleTextDiffProvider} and
// com.intellij.diff.tools.util.base.{IgnorePolicy, HighlightPolicy} (JetBrains/intellij-community, Apache-2.0).
import type { CompareOptions, ComparisonPolicy, HighlightPolicy, IgnorePolicy, LineFragment } from '../types';
import { DiffTooBigError } from '../types';
import { isEqualTexts } from '../text/equality';
import { LineOffsets } from '../text/lineOffsets';
import { createLineFragment } from '../util/fragments';
import { compareLinesInnerWithPolicy, type InnerFragmentsPolicy, processBlocks } from '../comparison/comparisonManager';

/** IgnorePolicy.getComparisonPolicy. */
export function toComparisonPolicy(ignorePolicy: IgnorePolicy): ComparisonPolicy {
  switch (ignorePolicy) {
    case 'DEFAULT':
      return 'DEFAULT';
    case 'TRIM_WHITESPACES':
      return 'TRIM_WHITESPACES';
    case 'IGNORE_WHITESPACES':
    case 'IGNORE_WHITESPACES_CHUNKS':
      return 'IGNORE_WHITESPACES';
  }
}

/** HighlightPolicy.getFragmentsPolicy. */
export function toInnerFragmentsPolicy(highlightPolicy: HighlightPolicy): InnerFragmentsPolicy {
  switch (highlightPolicy) {
    case 'BY_WORD':
    case 'BY_WORD_SPLIT':
      return 'WORDS';
    case 'BY_CHAR':
      return 'CHARS';
    case 'BY_LINE':
    case 'DO_NOT_HIGHLIGHT':
      return 'NONE';
  }
}

/**
 * Like {@link compareTexts}, but a line-level {@link DiffTooBigError} is rethrown (IntelliJ shows
 * "Contents are too big" in that case). Inner (word/char) failures are always swallowed per fragment.
 */
export function compareTextsStrict(text1: string, text2: string, opts: CompareOptions = {}): LineFragment[] {
  const ignorePolicy = opts.ignorePolicy ?? 'DEFAULT';
  const highlightPolicy = opts.highlightPolicy ?? 'BY_WORD';
  // HighlightPolicy.isShouldCompare: IntelliJ returns null => the viewer shows no changes at all.
  if (highlightPolicy === 'DO_NOT_HIGHLIGHT') return [];
  const policy = toComparisonPolicy(ignorePolicy);
  const lo1 = LineOffsets.create(text1);
  const lo2 = LineOffsets.create(text2);
  const fragments = compareLinesInnerWithPolicy(text1, text2, policy, toInnerFragmentsPolicy(highlightPolicy), lo1, lo2);
  // highlightPolicy.isShouldSquash && ignorePolicy.isShouldSquash (always true for supported ignore policies)
  const squash = highlightPolicy !== 'BY_WORD_SPLIT';
  const trim = ignorePolicy === 'IGNORE_WHITESPACES_CHUNKS'; // IgnorePolicy.isShouldTrimChunks
  return processBlocks(fragments, text1, text2, policy, squash, trim);
}

/**
 * What viewers call: TextDiffProviderBase semantics (Ignore/Highlight policy mapping, squash, trim chunks).
 * Never throws DiffTooBigError: if the line-level diff is too big, the whole text is reported as a single changed
 * block (innerFragments = null), or no changes when the texts are equal under the policy.
 */
export function compareTexts(text1: string, text2: string, opts: CompareOptions = {}): LineFragment[] {
  try {
    return compareTextsStrict(text1, text2, opts);
  } catch (e) {
    if (!(e instanceof DiffTooBigError)) throw e;
    return wholeTextFragment(text1, text2, toComparisonPolicy(opts.ignorePolicy ?? 'DEFAULT'));
  }
}

function wholeTextFragment(text1: string, text2: string, policy: ComparisonPolicy): LineFragment[] {
  if (isEqualTexts(text1, text2, policy)) return [];
  const lo1 = LineOffsets.create(text1);
  const lo2 = LineOffsets.create(text2);
  return [createLineFragment(0, lo1.lineCount, 0, lo2.lineCount, 0, text1.length, 0, text2.length, null)];
}
