// Ported from com.intellij.diff.comparison.ByWordRt (DefaultCorrector, TrimSpacesCorrector, IgnoreSpacesCorrector and
// their Merge* 3-way variants) (JetBrains/intellij-community, Apache-2.0).
import type { ComparisonPolicy } from '../types';
import { isWs } from '../text/chars';
import { create, type DiffIterable } from '../iterables/diffIterable';
import { MergeRange, Range } from '../util/range';
import {
  expandWhitespaces, expandWhitespaces3, expandWhitespacesBackward, expandWhitespacesBackward3,
  expandWhitespacesForward, expandWhitespacesForward3, isEqualsIgnoreWhitespacesRange,
  isEqualsIgnoreWhitespacesRange3, isEqualsRange, isEqualsRange3, trimEnd, trimRange, trimRange3, trimStart,
} from '../util/trim';

/** ByWordRt.matchAdjustmentWhitespaces (2-way). */
export function matchAdjustmentWhitespaces(text1: string, text2: string, iterable: DiffIterable, policy: ComparisonPolicy): DiffIterable {
  switch (policy) {
    case 'DEFAULT':
      return defaultCorrector(iterable, text1, text2);
    case 'TRIM_WHITESPACES':
      return trimSpacesCorrector(defaultCorrector(iterable, text1, text2), text1, text2);
    case 'IGNORE_WHITESPACES':
      return ignoreSpacesCorrector(iterable, text1, text2);
  }
}

/** ByWordRt.matchAdjustmentWhitespaces (3-way). */
export function matchAdjustmentWhitespaces3(
  text1: string, text2: string, text3: string, conflicts: MergeRange[], policy: ComparisonPolicy,
): MergeRange[] {
  switch (policy) {
    case 'DEFAULT':
      return mergeDefaultCorrector(conflicts, text1, text2, text3);
    case 'TRIM_WHITESPACES':
      return mergeTrimSpacesCorrector(mergeDefaultCorrector(conflicts, text1, text2, text3), text1, text2, text3);
    case 'IGNORE_WHITESPACES':
      return mergeIgnoreSpacesCorrector(conflicts, text1, text2, text3);
  }
}

export function defaultCorrector(iterable: DiffIterable, text1: string, text2: string): DiffIterable {
  const changes: Range[] = [];
  for (const range of iterable.changes()) {
    const endCut = expandWhitespacesBackward(text1, text2, range.start1, range.start2, range.end1, range.end2);
    const startCut = expandWhitespacesForward(text1, text2, range.start1, range.start2, range.end1 - endCut, range.end2 - endCut);
    const expand = new Range(range.start1 + startCut, range.end1 - endCut, range.start2 + startCut, range.end2 - endCut);
    if (!expand.isEmpty) changes.push(expand);
  }
  return create(changes, text1.length, text2.length);
}

function mergeDefaultCorrector(iterable: MergeRange[], text1: string, text2: string, text3: string): MergeRange[] {
  const changes: MergeRange[] = [];
  for (const r of iterable) {
    const endCut = expandWhitespacesBackward3(text1, text2, text3, r.start1, r.start2, r.start3, r.end1, r.end2, r.end3);
    const startCut = expandWhitespacesForward3(text1, text2, text3, r.start1, r.start2, r.start3,
      r.end1 - endCut, r.end2 - endCut, r.end3 - endCut);
    const expand = new MergeRange(r.start1 + startCut, r.end1 - endCut, r.start2 + startCut, r.end2 - endCut,
      r.start3 + startCut, r.end3 - endCut);
    if (!expand.isEmpty) changes.push(expand);
  }
  return changes;
}

function ignoreSpacesCorrector(iterable: DiffIterable, text1: string, text2: string): DiffIterable {
  const changes: Range[] = [];
  for (const range of iterable.changes()) {
    const expanded = expandWhitespaces(text1, text2, range);
    const trimmed = trimRange(text1, text2, expanded);
    if (!trimmed.isEmpty && !isEqualsIgnoreWhitespacesRange(text1, text2, trimmed)) changes.push(trimmed);
  }
  return create(changes, text1.length, text2.length);
}

function mergeIgnoreSpacesCorrector(iterable: MergeRange[], text1: string, text2: string, text3: string): MergeRange[] {
  const changes: MergeRange[] = [];
  for (const range of iterable) {
    const expanded = expandWhitespaces3(text1, text2, text3, range);
    const trimmed = trimRange3(text1, text2, text3, expanded);
    if (!trimmed.isEmpty && !isEqualsIgnoreWhitespacesRange3(text1, text2, text3, trimmed)) changes.push(trimmed);
  }
  return changes;
}

export function trimSpacesCorrector(iterable: DiffIterable, text1: string, text2: string): DiffIterable {
  const changes: Range[] = [];
  for (const range of iterable.changes()) {
    let { start1, start2, end1, end2 } = range;
    if (isLeadingTrailingSpace(text1, start1)) start1 = trimStart(text1, start1, end1);
    if (isLeadingTrailingSpace(text1, end1 - 1)) end1 = trimEnd(text1, start1, end1);
    if (isLeadingTrailingSpace(text2, start2)) start2 = trimStart(text2, start2, end2);
    if (isLeadingTrailingSpace(text2, end2 - 1)) end2 = trimEnd(text2, start2, end2);
    const trimmed = new Range(start1, end1, start2, end2);
    if (!trimmed.isEmpty && !isEqualsRange(text1, text2, trimmed)) changes.push(trimmed);
  }
  return create(changes, text1.length, text2.length);
}

function mergeTrimSpacesCorrector(iterable: MergeRange[], text1: string, text2: string, text3: string): MergeRange[] {
  const changes: MergeRange[] = [];
  for (const range of iterable) {
    let { start1, start2, start3, end1, end2, end3 } = range;
    if (isLeadingTrailingSpace(text1, start1)) start1 = trimStart(text1, start1, end1);
    if (isLeadingTrailingSpace(text1, end1 - 1)) end1 = trimEnd(text1, start1, end1);
    if (isLeadingTrailingSpace(text2, start2)) start2 = trimStart(text2, start2, end2);
    if (isLeadingTrailingSpace(text2, end2 - 1)) end2 = trimEnd(text2, start2, end2);
    if (isLeadingTrailingSpace(text3, start3)) start3 = trimStart(text3, start3, end3);
    if (isLeadingTrailingSpace(text3, end3 - 1)) end3 = trimEnd(text3, start3, end3);
    const trimmed = new MergeRange(start1, end1, start2, end2, start3, end3);
    if (!trimmed.isEmpty && !isEqualsRange3(text1, text2, text3, trimmed)) changes.push(trimmed);
  }
  return changes;
}

function isLeadingTrailingSpace(text: string, start: number): boolean {
  return isLeadingSpace(text, start) || isTrailingSpace(text, start);
}

function isLeadingSpace(text: string, start: number): boolean {
  if (start < 0) return false;
  if (start === text.length) return false;
  if (!isWs(text, start)) return false;
  start--;
  while (start >= 0) {
    const c = text.charCodeAt(start);
    if (c === 10) return true;
    if (!isWs(text, start)) return false;
    start--;
  }
  return true;
}

function isTrailingSpace(text: string, end: number): boolean {
  if (end < 0) return false;
  if (end === text.length) return false;
  if (!isWs(text, end)) return false;
  while (end < text.length) {
    const c = text.charCodeAt(end);
    if (c === 10) return true;
    if (!isWs(text, end)) return false;
    end++;
  }
  return true;
}
