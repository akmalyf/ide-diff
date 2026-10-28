// Ported from com.intellij.diff.comparison.ComparisonUtil + StringsKmp (JetBrains/intellij-community, Apache-2.0).
import type { ComparisonPolicy } from '../types';
import { isWs } from './chars';

/** Strip [ \t\n] at both ends (never use String.prototype.trim — it strips more). */
export function trimWs(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && isWs(text, start)) start++;
  while (start < end && isWs(text, end - 1)) end--;
  return start === 0 && end === text.length ? text : text.substring(start, end);
}

/** Remove every [ \t\n]. */
export function removeWs(text: string): string {
  return text.replace(/[ \t\n]+/g, '');
}

/** Canonical key: two sequences are `isEquals` under `policy` iff their keys are equal. */
export function keyOf(text: string, policy: ComparisonPolicy): string {
  switch (policy) {
    case 'DEFAULT':
      return text;
    case 'TRIM_WHITESPACES':
      return trimWs(text);
    case 'IGNORE_WHITESPACES':
      return removeWs(text);
  }
}

/** ComparisonUtil.isEquals — single sequence (line / word) equality. `null` never equals a non-null text. */
export function isEquals(text1: string | null, text2: string | null, policy: ComparisonPolicy): boolean {
  if (text1 === text2) return true;
  if (text1 == null || text2 == null) return false;
  switch (policy) {
    case 'DEFAULT':
      return false;
    case 'TRIM_WHITESPACES':
      return trimWs(text1) === trimWs(text2);
    case 'IGNORE_WHITESPACES':
      return removeWs(text1) === removeWs(text2);
  }
}

/** ComparisonUtil.isEqualTexts — multi-line text equality (TRIM is applied per line). */
export function isEqualTexts(text1: string, text2: string, policy: ComparisonPolicy): boolean {
  switch (policy) {
    case 'DEFAULT':
      return text1 === text2;
    case 'TRIM_WHITESPACES':
      return equalsTrimWhitespaces(text1, text2);
    case 'IGNORE_WHITESPACES':
      return removeWs(text1) === removeWs(text2);
  }
}

/**
 * ComparisonUtil.equalsTrimWhitespaces: leading/trailing whitespaces of *inner* lines are ignored as well.
 * "\nXY\n" equals "\n XY \n"; "\nXY\n" does not equal "\nX Y\n".
 */
export function equalsTrimWhitespaces(s1: string, s2: string): boolean {
  let index1 = 0;
  let index2 = 0;
  for (;;) {
    let lastLine1 = false;
    let lastLine2 = false;
    let end1 = s1.indexOf('\n', index1) + 1;
    let end2 = s2.indexOf('\n', index2) + 1;
    if (end1 === 0) {
      end1 = s1.length;
      lastLine1 = true;
    }
    if (end2 === 0) {
      end2 = s2.length;
      lastLine2 = true;
    }
    if (lastLine1 !== lastLine2) return false;
    const line1 = s1.substring(index1, end1);
    const line2 = s2.substring(index2, end2);
    if (trimWs(line1) !== trimWs(line2)) return false;
    index1 = end1;
    index2 = end2;
    if (lastLine1) return true;
  }
}
