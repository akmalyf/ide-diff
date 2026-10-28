// Ported from com.intellij.diff.comparison.TrimUtil (JetBrains/intellij-community, Apache-2.0).
import { isEqualTexts } from '../text/equality';
import { isWs } from '../text/chars';
import { MergeRange, Range } from './range';

type Eq = (i1: number, i2: number) => boolean;
type Ignored = (i: number) => boolean;

// ---- generic ----

export function trimStartGeneric(start: number, end: number, ignored: Ignored): number {
  while (start < end) {
    if (!ignored(start)) break;
    start++;
  }
  return start;
}

export function trimEndGeneric(start: number, end: number, ignored: Ignored): number {
  while (start < end) {
    if (!ignored(end - 1)) break;
    end--;
  }
  return end;
}

export function expandForwardGeneric(start1: number, start2: number, end1: number, end2: number, equals: Eq): number {
  const old = start1;
  while (start1 < end1 && start2 < end2) {
    if (!equals(start1, start2)) break;
    start1++;
    start2++;
  }
  return start1 - old;
}

export function expandBackwardGeneric(start1: number, start2: number, end1: number, end2: number, equals: Eq): number {
  const old = end1;
  while (start1 < end1 && start2 < end2) {
    if (!equals(end1 - 1, end2 - 1)) break;
    end1--;
    end2--;
  }
  return old - end1;
}

export function expandGeneric(start1: number, start2: number, end1: number, end2: number, equals: Eq): Range {
  const count1 = expandForwardGeneric(start1, start2, end1, end2, equals);
  start1 += count1;
  start2 += count1;
  const count2 = expandBackwardGeneric(start1, start2, end1, end2, equals);
  end1 -= count2;
  end2 -= count2;
  return new Range(start1, end1, start2, end2);
}

function expandIgnoredForward(start1: number, start2: number, end1: number, end2: number, equals: Eq, ignored1: Ignored): number {
  const old = start1;
  while (start1 < end1 && start2 < end2) {
    if (!equals(start1, start2)) break;
    if (!ignored1(start1)) break;
    start1++;
    start2++;
  }
  return start1 - old;
}

function expandIgnoredBackward(start1: number, start2: number, end1: number, end2: number, equals: Eq, ignored1: Ignored): number {
  const old = end1;
  while (start1 < end1 && start2 < end2) {
    if (!equals(end1 - 1, end2 - 1)) break;
    if (!ignored1(end1 - 1)) break;
    end1--;
    end2--;
  }
  return old - end1;
}

function expandIgnoredForward3(
  start1: number, start2: number, start3: number, end1: number, end2: number, end3: number,
  equals12: Eq, equals13: Eq, ignored1: Ignored,
): number {
  const old = start1;
  while (start1 < end1 && start2 < end2 && start3 < end3) {
    if (!equals12(start1, start2)) break;
    if (!equals13(start1, start3)) break;
    if (!ignored1(start1)) break;
    start1++;
    start2++;
    start3++;
  }
  return start1 - old;
}

function expandIgnoredBackward3(
  start1: number, start2: number, start3: number, end1: number, end2: number, end3: number,
  equals12: Eq, equals13: Eq, ignored1: Ignored,
): number {
  const old = end1;
  while (start1 < end1 && start2 < end2 && start3 < end3) {
    if (!equals12(end1 - 1, end2 - 1)) break;
    if (!equals13(end1 - 1, end3 - 1)) break;
    if (!ignored1(end1 - 1)) break;
    end1--;
    end2--;
    end3--;
  }
  return old - end1;
}

// ---- text ----

export function trimStart(text: string, start: number, end: number): number {
  return trimStartGeneric(start, end, (i) => isWs(text, i));
}

export function trimEnd(text: string, start: number, end: number): number {
  return trimEndGeneric(start, end, (i) => isWs(text, i));
}

export function trimRange(text1: string, text2: string, range: Range): Range {
  const s1 = trimStart(text1, range.start1, range.end1);
  const e1 = trimEnd(text1, s1, range.end1);
  const s2 = trimStart(text2, range.start2, range.end2);
  const e2 = trimEnd(text2, s2, range.end2);
  return new Range(s1, e1, s2, e2);
}

export function trimRange3(text1: string, text2: string, text3: string, r: MergeRange): MergeRange {
  const s1 = trimStart(text1, r.start1, r.end1);
  const e1 = trimEnd(text1, s1, r.end1);
  const s2 = trimStart(text2, r.start2, r.end2);
  const e2 = trimEnd(text2, s2, r.end2);
  const s3 = trimStart(text3, r.start3, r.end3);
  const e3 = trimEnd(text3, s3, r.end3);
  return new MergeRange(s1, e1, s2, e2, s3, e3);
}

/** Keys-based list expansion (element equality). */
export function expandKeys(keys1: readonly string[], keys2: readonly string[], start1: number, start2: number, end1: number, end2: number): Range {
  return expandGeneric(start1, start2, end1, end2, (i1, i2) => keys1[i1] === keys2[i2]);
}

export function expandForwardKeys(keys1: readonly string[], keys2: readonly string[], start1: number, start2: number, end1: number, end2: number): number {
  return expandForwardGeneric(start1, start2, end1, end2, (i1, i2) => keys1[i1] === keys2[i2]);
}

export function expandBackwardKeys(keys1: readonly string[], keys2: readonly string[], start1: number, start2: number, end1: number, end2: number): number {
  return expandBackwardGeneric(start1, start2, end1, end2, (i1, i2) => keys1[i1] === keys2[i2]);
}

export function expandWhitespaces(text1: string, text2: string, range: Range): Range {
  const eq: Eq = (i1, i2) => text1.charCodeAt(i1) === text2.charCodeAt(i2);
  const ign: Ignored = (i) => isWs(text1, i);
  let { start1, start2, end1, end2 } = range;
  const count1 = expandIgnoredForward(start1, start2, end1, end2, eq, ign);
  start1 += count1;
  start2 += count1;
  const count2 = expandIgnoredBackward(start1, start2, end1, end2, eq, ign);
  end1 -= count2;
  end2 -= count2;
  return new Range(start1, end1, start2, end2);
}

export function expandWhitespacesForward(text1: string, text2: string, start1: number, start2: number, end1: number, end2: number): number {
  return expandIgnoredForward(start1, start2, end1, end2, (i1, i2) => text1.charCodeAt(i1) === text2.charCodeAt(i2), (i) => isWs(text1, i));
}

export function expandWhitespacesBackward(text1: string, text2: string, start1: number, start2: number, end1: number, end2: number): number {
  return expandIgnoredBackward(start1, start2, end1, end2, (i1, i2) => text1.charCodeAt(i1) === text2.charCodeAt(i2), (i) => isWs(text1, i));
}

export function expandWhitespaces3(text1: string, text2: string, text3: string, r: MergeRange): MergeRange {
  const eq12: Eq = (i1, i2) => text1.charCodeAt(i1) === text2.charCodeAt(i2);
  const eq13: Eq = (i1, i3) => text1.charCodeAt(i1) === text3.charCodeAt(i3);
  const ign: Ignored = (i) => isWs(text1, i);
  let { start1, start2, start3, end1, end2, end3 } = r;
  const count1 = expandIgnoredForward3(start1, start2, start3, end1, end2, end3, eq12, eq13, ign);
  start1 += count1;
  start2 += count1;
  start3 += count1;
  const count2 = expandIgnoredBackward3(start1, start2, start3, end1, end2, end3, eq12, eq13, ign);
  end1 -= count2;
  end2 -= count2;
  end3 -= count2;
  return new MergeRange(start1, end1, start2, end2, start3, end3);
}

export function expandWhitespacesForward3(
  text1: string, text2: string, text3: string,
  start1: number, start2: number, start3: number, end1: number, end2: number, end3: number,
): number {
  return expandIgnoredForward3(start1, start2, start3, end1, end2, end3,
    (i1, i2) => text1.charCodeAt(i1) === text2.charCodeAt(i2),
    (i1, i3) => text1.charCodeAt(i1) === text3.charCodeAt(i3),
    (i) => isWs(text1, i));
}

export function expandWhitespacesBackward3(
  text1: string, text2: string, text3: string,
  start1: number, start2: number, start3: number, end1: number, end2: number, end3: number,
): number {
  return expandIgnoredBackward3(start1, start2, start3, end1, end2, end3,
    (i1, i2) => text1.charCodeAt(i1) === text2.charCodeAt(i2),
    (i1, i3) => text1.charCodeAt(i1) === text3.charCodeAt(i3),
    (i) => isWs(text1, i));
}

export function isEqualsRange(text1: string, text2: string, r: Range): boolean {
  return isEqualTexts(text1.substring(r.start1, r.end1), text2.substring(r.start2, r.end2), 'DEFAULT');
}

export function isEqualsIgnoreWhitespacesRange(text1: string, text2: string, r: Range): boolean {
  return isEqualTexts(text1.substring(r.start1, r.end1), text2.substring(r.start2, r.end2), 'IGNORE_WHITESPACES');
}

export function isEqualsRange3(text1: string, text2: string, text3: string, r: MergeRange): boolean {
  const s1 = text1.substring(r.start1, r.end1);
  const s2 = text2.substring(r.start2, r.end2);
  const s3 = text3.substring(r.start3, r.end3);
  return isEqualTexts(s2, s1, 'DEFAULT') && isEqualTexts(s2, s3, 'DEFAULT');
}

export function isEqualsIgnoreWhitespacesRange3(text1: string, text2: string, text3: string, r: MergeRange): boolean {
  const s1 = text1.substring(r.start1, r.end1);
  const s2 = text2.substring(r.start2, r.end2);
  const s3 = text3.substring(r.start3, r.end3);
  return isEqualTexts(s2, s1, 'IGNORE_WHITESPACES') && isEqualTexts(s2, s3, 'IGNORE_WHITESPACES');
}
