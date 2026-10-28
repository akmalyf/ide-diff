// Test DSL ported from intellij-community DiffTestCase / ComparisonUtilTestBase / ComparisonMergeUtilTestBase
// (JetBrains/intellij-community, Apache-2.0). Test-only: excluded from the build.
import { expect } from 'vitest';
import type { ComparisonPolicy, DiffFragment, LineFragment } from '../types';
import { LineOffsets } from '../text/lineOffsets';
import { setVerifyEnabled } from '../iterables/diffIterable';
import { compareChars, compareLines, compareLines3, compareLinesInner, compareWords, mergeLinesRaw, processBlocks, squash } from '../comparison/comparisonManager';
import { compareCharsRaw } from '../comparison/byChar';
import { compareWords3, convertIntoDiffFragments } from '../comparison/byWord';
import { buildSimple } from '../comparison/comparisonMergeUtil';
import type { MergeRange } from '../util/range';

setVerifyEnabled(true);

export const chSmile = '😂';
export const chGun = '🔫';
export const chMan = '🧒';
export const chFace = '🤫';

export const parseSource = (s: string): string => s.replace(/_/g, '\n');

type Pair = [number, number];
export type Change2 = [Pair, Pair];
export type Change3 = [Pair, Pair, Pair];

export function mod(line1: number, line2: number, count1: number, count2: number): Change2 {
  if (count1 === 0 || count2 === 0) throw new Error('mod: zero count');
  return [[line1, line1 + count1], [line2, line2 + count2]];
}

export function del(line1: number, line2: number, count1: number): Change2 {
  if (count1 === 0) throw new Error('del: zero count');
  return [[line1, line1 + count1], [line2, line2]];
}

export function ins(line1: number, line2: number, count2: number): Change2 {
  if (count2 === 0) throw new Error('ins: zero count');
  return [[line1, line1], [line2, line2 + count2]];
}

// ---- bitsets as sorted index arrays ----

function parseMatching(matching: string, text: string): number[] {
  const pattern = matching.replace(/\./g, '');
  expect(pattern.length, `matching length for ${JSON.stringify(text)}`).toBe(text.length);
  const set: number[] = [];
  for (let i = 0; i < pattern.length; i++) if (pattern[i] !== ' ') set.push(i);
  return set;
}

function parseLineMatching(matching: string, text: string): number[] {
  expect(matching.length).toBe(text.length);
  const lines1 = matching.split(/[_*]/);
  const lines2 = text.split('\n');
  expect(lines1.length).toBe(lines2.length);
  for (let i = 0; i < lines1.length; i++) expect(lines1[i].length, `line ${i}`).toBe(lines2[i].length);
  const set: number[] = [];
  let index = 0;
  let lineNumber = 0;
  while (index < matching.length) {
    let end = indexOfAny(matching, index) + 1;
    if (end === 0) end = matching.length;
    const line = matching.substring(index, end);
    if (/[^ _]/.test(line)) {
      expect(line.includes(' ')).toBe(false);
      set.push(lineNumber);
    }
    lineNumber++;
    index = end;
  }
  return set;
}

function indexOfAny(s: string, from: number): number {
  for (let i = from; i < s.length; i++) if (s[i] === '_' || s[i] === '*') return i;
  return -1;
}

function rangesToSet(ranges: Array<[number, number]>): number[] {
  const set = new Set<number>();
  for (const [s, e] of ranges) for (let i = s; i < e; i++) set.add(i);
  return [...set].sort((a, b) => a - b);
}

// ---- consistency checks ----

export function checkLineOffsets(text: string, startLine: number, endLine: number, startOffset: number, endOffset: number): void {
  const lo = LineOffsets.create(text);
  if (startLine !== endLine) {
    expect(startOffset).toBe(lo.getLineStart(startLine));
    let offset = lo.getLineEnd(endLine - 1);
    if (offset < text.length) offset++;
    expect(endOffset).toBe(offset);
  } else {
    const offset = startLine === lo.lineCount ? text.length : lo.getLineStart(startLine);
    expect(startOffset).toBe(offset);
    expect(endOffset).toBe(offset);
  }
}

export function checkDiffConsistency(fragments: readonly DiffFragment[]): void {
  for (const f of fragments) {
    expect(f.startOffset1 <= f.endOffset1).toBe(true);
    expect(f.startOffset2 <= f.endOffset2).toBe(true);
    expect(f.startOffset1 !== f.endOffset1 || f.startOffset2 !== f.endOffset2).toBe(true);
  }
}

export function checkLineConsistency(fragments: readonly LineFragment[], before: string, after: string): void {
  const lc1 = LineOffsets.create(before).lineCount;
  const lc2 = LineOffsets.create(after).lineCount;
  for (const f of fragments) {
    expect(f.startOffset1 <= f.endOffset1).toBe(true);
    expect(f.startOffset2 <= f.endOffset2).toBe(true);
    expect(f.startLine1 <= f.endLine1).toBe(true);
    expect(f.startLine2 <= f.endLine2).toBe(true);
    expect(f.startLine1 !== f.endLine1 || f.startLine2 !== f.endLine2).toBe(true);
    expect(f.startLine1 >= 0 && f.startLine2 >= 0).toBe(true);
    expect(f.endLine1 <= lc1 && f.endLine2 <= lc2).toBe(true);
    checkLineOffsets(before, f.startLine1, f.endLine1, f.startOffset1, f.endOffset1);
    checkLineOffsets(after, f.startLine2, f.endLine2, f.startOffset2, f.endOffset2);
    if (f.innerFragments) checkDiffConsistency(f.innerFragments);
  }
}

// ---- 2-way / 3-way comparison builder ----

type TestType = 'LINE' | 'LINE_INNER' | 'WORD' | 'CHAR' | 'CHAR_SMART' | 'CHAR_RAW' | 'SPLITTER';

interface Data<T> {
  before?: T;
  base?: T;
  after?: T;
}

interface PolicyData<T> {
  default?: T;
  trim?: T;
  ignore?: T;
}

function policyGet<T>(d: PolicyData<T>, policy: ComparisonPolicy): T | undefined {
  switch (policy) {
    case 'IGNORE_WHITESPACES':
      return d.ignore ?? d.trim ?? d.default;
    case 'TRIM_WHITESPACES':
      return d.trim ?? d.default;
    case 'DEFAULT':
      return d.default;
  }
}

const convertDiff = (fs: readonly DiffFragment[]): Change2[] =>
  fs.map((f) => [[f.startOffset1, f.endOffset1], [f.startOffset2, f.endOffset2]]);
const convertLines = (fs: readonly LineFragment[]): Change2[] =>
  fs.map((f) => [[f.startLine1, f.endLine1], [f.startLine2, f.endLine2]]);
const convertMerge = (fs: readonly MergeRange[]): Change3[] =>
  fs.map((f) => [[f.start1, f.end1], [f.start2, f.end2], [f.start3, f.end3]]);

export class TestBuilder {
  private executed = false;
  private text: Data<string> = {};
  private changes: PolicyData<Array<Change2 | Change3>> = {};
  private matchings: PolicyData<Data<number[]>> = {};
  private shouldSquash = false;
  private shouldTrim = false;

  constructor(private readonly type: TestType) {}

  assertExecuted(): void {
    expect(this.executed, 'test builder was never executed').toBe(true);
  }

  /** ("before" - "after") or ("left" - "base" - "right"). First call sets the texts. */
  $(before: string, after: string, right?: string): TestHelper {
    // Kotlin: ("A" - "B" - "C") => before = A, base = B, after = C
    if (right === undefined) return new TestHelper(this, this.type, before, after, undefined);
    return new TestHelper(this, this.type, before, right, after);
  }

  /** @internal */
  setTexts(before: string, after: string, base: string | undefined, force: boolean): void {
    const t = this.text;
    if (force || (t.before == null && t.after == null) || (base != null && t.base == null)) {
      this.text = { before, after, base };
    }
  }

  /** @internal */
  getText(): Data<string> {
    return this.text;
  }

  /** @internal */
  setMatching(policy: 'default' | 'trim' | 'ignore', data: Data<number[]>): void {
    expect(this.matchings[policy]).toBeUndefined();
    this.matchings[policy] = data;
  }

  default(...expected: Array<Change2 | Change3>): void {
    expect(this.changes.default).toBeUndefined();
    this.changes.default = expected;
  }

  trim(...expected: Array<Change2 | Change3>): void {
    expect(this.changes.trim).toBeUndefined();
    this.changes.trim = expected;
  }

  ignore(...expected: Array<Change2 | Change3>): void {
    expect(this.changes.ignore).toBeUndefined();
    this.changes.ignore = expected;
  }

  postprocess(squash: boolean, trim: boolean): void {
    this.shouldSquash = squash;
    this.shouldTrim = trim;
  }

  testAll(): void {
    this.testDefault();
    this.testTrim();
    this.testIgnore();
  }

  testDefault(): void {
    this.run('DEFAULT');
  }

  testTrim(): void {
    this.run('TRIM_WHITESPACES');
  }

  testIgnore(): void {
    this.run('IGNORE_WHITESPACES');
  }

  private run(policy: ComparisonPolicy): void {
    this.executed = true;
    const { before, base, after } = this.text;
    if (before == null || after == null) throw new Error('texts are not set');
    const changes = policyGet(this.changes, policy);
    const matchings = policyGet(this.matchings, policy);
    expect(changes != null || matchings != null, `no expectations for ${policy}`).toBe(true);
    const ctx = `policy ${policy}: ${JSON.stringify(before)} vs ${JSON.stringify(after)}`;
    if (base == null) {
      const exp = changes as Change2[] | undefined;
      switch (this.type) {
        case 'LINE': {
          const fragments = compareLines(before, after, policy);
          checkLineConsistency(fragments, before, after);
          if (matchings) {
            expect(rangesToSet(fragments.map((f) => [f.startLine1, f.endLine1])), `${ctx} (before lines)`).toEqual(matchings.before);
            expect(rangesToSet(fragments.map((f) => [f.startLine2, f.endLine2])), `${ctx} (after lines)`).toEqual(matchings.after);
          }
          if (exp) expect(convertLines(fragments), ctx).toEqual(exp);
          break;
        }
        case 'LINE_INNER': {
          const fragments = squash(compareLinesInner(before, after, policy));
          expect(fragments.length, ctx).toBe(1);
          const f = fragments[0];
          expect([f.startOffset1, f.startOffset2, f.endOffset1, f.endOffset2]).toEqual([0, 0, before.length, after.length]);
          expect(f.innerFragments, `${ctx}: inner fragments are null`).not.toBeNull();
          checkDiffConsistency(f.innerFragments!);
          this.checkDiff(f.innerFragments!, matchings, exp, `${ctx} (lines_inner)`);
          const words = compareWords(before, after, policy);
          checkDiffConsistency(words);
          this.checkDiff(words, matchings, exp, `${ctx} (words)`);
          break;
        }
        case 'WORD': {
          const fragments = compareWords(before, after, policy);
          checkDiffConsistency(fragments);
          this.checkDiff(fragments, matchings, exp, ctx);
          break;
        }
        case 'CHAR':
        case 'CHAR_SMART':
        case 'CHAR_RAW': {
          if (this.type !== 'CHAR_RAW') {
            const fragments = compareChars(before, after, policy);
            checkDiffConsistency(fragments);
            this.checkDiff(fragments, matchings, exp, `${ctx} (chars)`);
          }
          if (this.type !== 'CHAR_SMART' && policy === 'DEFAULT') {
            const fragments = convertIntoDiffFragments(compareCharsRaw(before, after));
            checkDiffConsistency(fragments);
            this.checkDiff(fragments, matchings, exp, `${ctx} (chars raw)`);
          }
          break;
        }
        case 'SPLITTER': {
          expect(matchings).toBeUndefined();
          let fragments = compareLinesInner(before, after, policy);
          checkLineConsistency(fragments, before, after);
          fragments = processBlocks(fragments, before, after, policy, this.shouldSquash, this.shouldTrim);
          checkLineConsistency(fragments, before, after);
          if (exp) expect(convertLines(fragments), ctx).toEqual(exp);
          break;
        }
      }
    } else {
      if (this.type !== 'WORD') throw new Error('3-way only supported for words');
      const fragments = compareWords3(before, base, after, policy);
      for (const f of fragments) expect(f.isEmpty).toBe(false);
      if (matchings) {
        expect(rangesToSet(fragments.map((f) => [f.start1, f.end1])), `${ctx} (left)`).toEqual(matchings.before);
        expect(rangesToSet(fragments.map((f) => [f.start2, f.end2])), `${ctx} (base)`).toEqual(matchings.base);
        expect(rangesToSet(fragments.map((f) => [f.start3, f.end3])), `${ctx} (right)`).toEqual(matchings.after);
      }
      if (changes) expect(convertMerge(fragments), ctx).toEqual(changes);
    }
  }

  private checkDiff(fragments: readonly DiffFragment[], matchings: Data<number[]> | undefined, expected: Change2[] | undefined, ctx: string): void {
    if (matchings) {
      expect(rangesToSet(fragments.map((f) => [f.startOffset1, f.endOffset1])), `${ctx} (before)`).toEqual(matchings.before);
      expect(rangesToSet(fragments.map((f) => [f.startOffset2, f.endOffset2])), `${ctx} (after)`).toEqual(matchings.after);
    }
    if (expected) expect(convertDiff(fragments), ctx).toEqual(expected);
  }
}

export class TestHelper {
  constructor(
    private readonly builder: TestBuilder,
    private readonly type: TestType,
    private readonly before: string,
    private readonly after: string,
    private readonly base: string | undefined,
  ) {
    builder.setTexts(parseSource(before), parseSource(after), base != null ? parseSource(base) : undefined, false);
  }

  plainSource(): void {
    this.builder.setTexts(this.before, this.after, this.base, true);
  }

  default(): void {
    this.builder.setMatching('default', this.parse());
  }

  trim(): void {
    this.builder.setMatching('trim', this.parse());
  }

  ignore(): void {
    this.builder.setMatching('ignore', this.parse());
  }

  private parse(): Data<number[]> {
    const t = this.builder.getText();
    const p = this.type === 'LINE' ? parseLineMatching : parseMatching;
    return {
      before: p(this.before, t.before!),
      base: this.base != null ? p(this.base, t.base!) : undefined,
      after: p(this.after, t.after!),
    };
  }
}

function doTest(type: TestType, f: (t: TestBuilder) => void, init?: (t: TestBuilder) => void): void {
  const builder = new TestBuilder(type);
  init?.(builder);
  f(builder);
  builder.assertExecuted();
}

export const lines = (f: (t: TestBuilder) => void): void => doTest('LINE', f);
export const lines_inner = (f: (t: TestBuilder) => void): void => doTest('LINE_INNER', f);
export const words = (f: (t: TestBuilder) => void): void => doTest('WORD', f);
export const chars = (f: (t: TestBuilder) => void): void => doTest('CHAR', f);
export const chars_raw = (f: (t: TestBuilder) => void): void => doTest('CHAR_RAW', f);
export const chars_smart = (f: (t: TestBuilder) => void): void => doTest('CHAR_SMART', f);
export function splitter(opts: { squash?: boolean; trim?: boolean }, f: (t: TestBuilder) => void): void {
  doTest('SPLITTER', f, (t) => t.postprocess(opts.squash ?? false, opts.trim ?? false));
}

// ---- merge builder ----

type MergeTestType = 'CHAR' | 'LINE_DIFF' | 'LINE_MERGE';

export function mod3(line1: number, line2: number, line3: number, count1: number, count2: number, count3: number): Change3 {
  return [[line1, line1 + count1], [line2, line2 + count2], [line3, line3 + count3]];
}

export class MergeTestBuilder {
  private executed = false;
  private texts: [string, string, string] | null = null;
  private expectedChanges: Change3[] | null = null;
  private matching: [number[], number[], number[]] | null = null;

  constructor(private readonly type: MergeTestType) {}

  assertExecuted(): void {
    expect(this.executed, 'merge test builder was never executed').toBe(true);
  }

  $(left: string, base: string, right: string): { matching(): void } {
    if (this.texts == null) this.texts = [parseSource(left), parseSource(base), parseSource(right)];
    const raw = [left, base, right];
    return {
      matching: () => {
        expect(this.matching).toBeNull();
        const t = this.texts!;
        const p = this.type !== 'CHAR' ? parseLineMatching : parseMatching;
        this.matching = [p(raw[0], t[0]), p(raw[1], t[1]), p(raw[2], t[2])];
      },
    };
  }

  changes(...expected: Change3[]): void {
    expect(this.expectedChanges).toBeNull();
    this.expectedChanges = expected;
  }

  mod(line1: number, line2: number, line3: number, count1: number, count2: number, count3: number): Change3 {
    return mod3(line1, line2, line3, count1, count2, count3);
  }

  test(policy: ComparisonPolicy = 'DEFAULT'): void {
    this.executed = true;
    expect(this.expectedChanges != null || this.matching != null).toBe(true);
    const [left, base, right] = this.texts!;
    let actual: Change3[];
    if (this.type === 'CHAR') {
      expect(policy).toBe('DEFAULT');
      const iterable1 = compareCharsRaw(base, left);
      const iterable2 = compareCharsRaw(base, right);
      actual = convertMerge(buildSimple(iterable1, iterable2));
      checkMergeConsistency(actual);
    } else {
      const fragments = this.type === 'LINE_DIFF' ? compareLines3(left, base, right, policy) : mergeLinesRaw(left, base, right, policy);
      actual = fragments.map((f) => [[f.startLine[0], f.endLine[0]], [f.startLine[1], f.endLine[1]], [f.startLine[2], f.endLine[2]]]);
    }
    const ctx = `policy ${policy}: ${JSON.stringify(this.texts)}`;
    if (this.matching) {
      for (let side = 0; side < 3; side++) {
        expect(rangesToSet(actual.map((c) => c[side])), `${ctx} side ${side}`).toEqual(this.matching[side]);
      }
    }
    if (this.expectedChanges) expect(actual, ctx).toEqual(this.expectedChanges);
  }
}

function checkMergeConsistency(actual: readonly Change3[]): void {
  let lasts = [-1, -1, -1];
  for (const change of actual) {
    let empty = true;
    let squashed = true;
    for (let side = 0; side < 3; side++) {
      const [start, end] = change[side];
      expect(lasts[side] <= start).toBe(true);
      expect(start <= end).toBe(true);
      empty &&= start === end;
      squashed &&= start === lasts[side];
    }
    expect(empty).toBe(false);
    expect(squashed).toBe(false);
    lasts = change.map((p) => p[1]);
  }
}

function doMergeTest(type: MergeTestType, f: (t: MergeTestBuilder) => void): void {
  const builder = new MergeTestBuilder(type);
  f(builder);
  builder.assertExecuted();
}

export const merge_chars = (f: (t: MergeTestBuilder) => void): void => doMergeTest('CHAR', f);
export const lines_diff = (f: (t: MergeTestBuilder) => void): void => doMergeTest('LINE_DIFF', f);
export const lines_merge = (f: (t: MergeTestBuilder) => void): void => doMergeTest('LINE_MERGE', f);
