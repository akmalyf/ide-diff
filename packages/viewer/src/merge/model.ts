// Merge model: port of com.intellij.diff.merge.MergeModelBase (result line-range tracking) and
// MergeConflictModel / TextMergeChange (per-change resolved state + apply / ignore / auto-resolve operations).
// Pure logic on CodeMirror `Text` documents — no DOM — so it can be unit-tested.
import { ChangeSet, Text } from '@codemirror/state';
import {
  compareLines,
  mergeLines,
  tryResolve,
  type ComparisonPolicy,
  type MergeConflictType,
  type TextDiffType,
} from '@ide-diff/core';

/** com.intellij.diff.util.ThreeSide: 0 = LEFT, 1 = BASE (the result editor), 2 = RIGHT */
export type ThreeSide = 0 | 1 | 2;
/** com.intellij.diff.util.Side: 0 = LEFT, 1 = RIGHT */
export type Side = 0 | 1;

export const LEFT: ThreeSide = 0;
export const BASE: ThreeSide = 1;
export const RIGHT: ThreeSide = 2;

/** Static part of a TextMergeChange: the original fragment (left / base / right lines) and its conflict type. */
export interface MergeChange {
  index: number;
  startLine: [number, number, number];
  endLine: [number, number, number];
  conflictType: MergeConflictType;
}

/** Dynamic part of a TextMergeChange: tracked result line range + resolved flags (TextMergeChange.State). */
export interface ChangeState {
  /** line range in the result document (0-based, end exclusive) */
  start: number;
  end: number;
  /** resolved[Side.LEFT], resolved[Side.RIGHT] */
  resolved: [boolean, boolean];
  /** a conflict where one side was already applied: the other side's arrow becomes "append" (arrow-down) */
  onesideApplied: boolean;
}

export const sideToThree = (side: Side): ThreeSide => (side === 0 ? LEFT : RIGHT);

export function isConflict(c: MergeChange): boolean {
  return c.conflictType.type === 'CONFLICT';
}

/** MergeConflictType.isChange(ThreeSide) */
export function isChange(c: MergeChange, side: ThreeSide): boolean {
  return side === LEFT ? c.conflictType.leftChange : side === RIGHT ? c.conflictType.rightChange : true;
}

export function isResolved(s: ChangeState): boolean {
  return s.resolved[0] && s.resolved[1];
}

/** TextMergeChange.isResolved(ThreeSide) */
export function isResolvedOn(s: ChangeState, side: ThreeSide): boolean {
  return side === LEFT ? s.resolved[0] : side === RIGHT ? s.resolved[1] : isResolved(s);
}

export function diffType(c: MergeChange): TextDiffType {
  return c.conflictType.type;
}

export function cloneStates(states: readonly ChangeState[]): ChangeState[] {
  return states.map((s) => ({ start: s.start, end: s.end, resolved: [s.resolved[0], s.resolved[1]], onesideApplied: s.onesideApplied }));
}

// ---------------------------------------------------------------------------------------------------------------
// Line helpers (DiffUtil)

/** DiffUtil.getLineCount: max(lineCount, 1) — CodeMirror documents always have at least one line. */
export function lineCount(doc: Text): number {
  return doc.lines;
}

function lineStartOffset(doc: Text, line: number): number {
  return line >= doc.lines ? doc.length : doc.line(line + 1).from;
}

/** DiffUtil.getLinesRange(document, line1, line2) */
export function linesRange(doc: Text, line1: number, line2: number): { from: number; to: number } {
  if (line1 === line2) {
    const offset = lineStartOffset(doc, line1);
    return { from: offset, to: offset };
  }
  return { from: doc.line(line1 + 1).from, to: doc.line(Math.min(line2, doc.lines)).to };
}

/** DiffUtil.getLinesContent */
export function linesContent(doc: Text, line1: number, line2: number): string {
  const { from, to } = linesRange(doc, line1, line2);
  return doc.sliceString(from, to);
}

/** DiffUtil.getLines */
export function getLines(doc: Text, line1: number, line2: number): string[] {
  const lines: string[] = [];
  for (let l = line1; l < line2 && l < doc.lines; l++) lines.push(doc.line(l + 1).text);
  return lines;
}

/** LineTokenizer.tokenize(text, false) */
export function tokenizeLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export interface TextEdit {
  from: number;
  to: number;
  insert: string;
}

/** DiffUtil.applyModification(document, line1, line2, newLines) as a single text edit (null = no-op). */
export function lineModification(doc: Text, line1: number, line2: number, newLines: readonly string[]): TextEdit | null {
  if (line1 === line2 && newLines.length === 0) return null;
  if (line1 === line2) {
    // insertLines
    const text = newLines.join('\n');
    if (line1 >= lineCount(doc)) return { from: doc.length, to: doc.length, insert: '\n' + text };
    const offset = lineStartOffset(doc, line1);
    return { from: offset, to: offset, insert: text + '\n' };
  }
  if (newLines.length === 0) {
    // deleteLines
    let { from, to } = linesRange(doc, line1, line2);
    if (from > 0) from--;
    else if (to < doc.length) to++;
    return { from, to, insert: '' };
  }
  // replaceLines
  const { from, to } = linesRange(doc, line1, line2);
  return { from, to, insert: newLines.join('\n') };
}

// ---------------------------------------------------------------------------------------------------------------
// Range tracking (MergeModelBase.DocumentListener + DiffUtil.updateRangeOnModification)

export interface UpdatedLineRange {
  start: number;
  end: number;
  damaged: boolean;
}

/** DiffUtil.updateRangeOnModification */
export function updateRangeOnModification(
  start: number,
  end: number,
  changeStart: number,
  changeEnd: number,
  shift: number,
  greedy = false,
): UpdatedLineRange {
  if (end <= changeStart) return { start, end, damaged: false }; // change before
  if (start >= changeEnd) return { start: start + shift, end: end + shift, damaged: false }; // change after
  if (start <= changeStart && end >= changeEnd) return { start, end: end + shift, damaged: false }; // change inside

  // range is damaged: we don't know the new boundaries, return an approximate position
  const newChangeEnd = changeEnd + shift;
  if (start >= changeStart && end <= changeEnd) {
    // fully inside change
    return greedy ? { start: changeStart, end: newChangeEnd, damaged: true } : { start: newChangeEnd, end: newChangeEnd, damaged: true };
  }
  if (start < changeStart) {
    // bottom boundary damaged
    return greedy ? { start, end: newChangeEnd, damaged: true } : { start, end: changeStart, damaged: true };
  }
  // top boundary damaged
  return greedy ? { start: changeStart, end: end + shift, damaged: true } : { start: newChangeEnd, end: end + shift, damaged: true };
}

function countNewlines(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

/**
 * MergeModelBase.DocumentListener.beforeDocumentChange for one edit of `doc` (in `doc` coordinates):
 * DiffUtil.getAffectedLineRange + countLinesShift, then processDocumentChange for every change.
 * Mutates `states`.
 */
export function processEdit(states: ChangeState[], changes: readonly MergeChange[], doc: Text, from: number, to: number, insert: string): void {
  if (!states.length) return;
  const line1 = doc.lineAt(from).number - 1;
  const line2 = doc.lineAt(to).number; // getLineNumber(offset + oldLength) + 1
  const shift = countNewlines(insert) - countNewlines(doc.sliceString(from, to));
  states.forEach((s, index) => {
    const r = updateRangeOnModification(s.start, s.end, line1, line2, shift);
    s.start = r.start;
    s.end = r.end;
    // MergeConflictModel.MergeModelImpl.processDocumentChange: a DELETED change whose result range became empty is resolved
    const change = changes[index];
    if (change && s.start === s.end && change.conflictType.type === 'DELETED' && !isResolved(s)) {
      s.resolved = [true, true];
    }
  });
}

/** Maps tracked states through a CodeMirror change set applied to `startDoc` (pure; returns new states). */
export function mapStates(states: readonly ChangeState[], changes: readonly MergeChange[], startDoc: Text, changeSet: ChangeSet): ChangeState[] {
  const result = cloneStates(states);
  const edits: TextEdit[] = [];
  changeSet.iterChanges((fromA, toA, _fromB, _toB, inserted) => edits.push({ from: fromA, to: toA, insert: inserted.toString() }));
  // process back to front: line numbers of earlier edits stay valid in `startDoc` coordinates
  for (let i = edits.length - 1; i >= 0; i--) {
    const e = edits[i]!;
    processEdit(result, changes, startDoc, e.from, e.to, e.insert);
  }
  return result;
}

// ---------------------------------------------------------------------------------------------------------------
// Building

export interface MergeTexts {
  left: Text;
  base: Text;
  right: Text;
}

/** MergeDiffBuilder.rediff: line fragments + conflict types (left, base, right). */
export function computeMergeChanges(left: string, base: string, right: string, policy: ComparisonPolicy): MergeChange[] {
  return mergeLines(left, base, right, policy).map((f, index) => ({
    index,
    startLine: [f.startLine[0], f.startLine[1], f.startLine[2]],
    endLine: [f.endLine[0], f.endLine[1], f.endLine[2]],
    conflictType: f.conflictType,
  }));
}

/** MergeConflictModel.buildResultLineRanges: result = base, every change unresolved. */
export function initialStates(changes: readonly MergeChange[]): ChangeState[] {
  return changes.map((c) => ({ start: c.startLine[1], end: c.endLine[1], resolved: [false, false], onesideApplied: false }));
}

/**
 * Re-attaches a (possibly edited) result to freshly computed merge changes. Not in IntelliJ (it always restarts the merge
 * from base): the base → result line diff is replayed onto the base ranges (greedily: an edited block that touches a
 * change becomes part of it), then resolved flags are inferred from the content of the resulting range:
 * - equal to base → unresolved;
 * - conflict equal to one side's content (and the other side non-empty) → that side applied ("one-side applied");
 * - anything else → resolved.
 */
export function restoreStates(changes: readonly MergeChange[], texts: MergeTexts, result: Text): ChangeState[] {
  const states = initialStates(changes);
  const baseStr = texts.base.toString();
  const resultStr = result.toString();
  if (baseStr === resultStr) return states;

  let fragments;
  try {
    fragments = compareLines(baseStr, resultStr, 'DEFAULT');
  } catch {
    return states.map((s) => ({ ...s, resolved: [true, true] as [boolean, boolean] }));
  }
  // back to front, so a fragment's base start line is still valid in the partially mapped coordinates
  for (let k = fragments.length - 1; k >= 0; k--) {
    const f = fragments[k]!;
    const s1 = f.startLine1;
    const e1 = f.endLine1;
    const len2 = f.endLine2 - f.startLine2;
    const shift = len2 - (e1 - s1);
    for (const st of states) {
      const empty = st.start === st.end || s1 === e1;
      const touches = empty ? s1 <= st.end && e1 >= st.start : s1 < st.end && e1 > st.start;
      if (touches) {
        // greedy: the edited block becomes part of the change
        const end = st.end > e1 ? st.end + shift : s1 + len2;
        st.start = Math.min(st.start, s1);
        st.end = end;
      } else if (st.start >= e1) {
        st.start += shift;
        st.end += shift;
      }
    }
  }

  changes.forEach((c, i) => {
    const s = states[i]!;
    if (isResolved(s)) return;
    const content = linesContent(result, s.start, s.end);
    if (content === linesContent(texts.base, c.startLine[1], c.endLine[1])) return;
    if (isConflict(c)) {
      const leftContent = linesContent(texts.left, c.startLine[0], c.endLine[0]);
      const rightContent = linesContent(texts.right, c.startLine[2], c.endLine[2]);
      const rightEmpty = c.startLine[2] === c.endLine[2];
      const leftEmpty = c.startLine[0] === c.endLine[0];
      if (content === leftContent && !rightEmpty) {
        s.resolved = [true, false];
        s.onesideApplied = true;
        return;
      }
      if (content === rightContent && !leftEmpty) {
        s.resolved = [false, true];
        s.onesideApplied = true;
        return;
      }
    }
    s.resolved = [true, true];
  });
  return states;
}

// ---------------------------------------------------------------------------------------------------------------
// Operations

/**
 * A merge command over the result document: MergeModelBase.replaceChange / appendChange + MergeConflictModel
 * operations. Every edit is accumulated into `changeSet` (relative to the initial document) so the viewer can dispatch
 * a single undoable transaction; `states` hold the final tracked ranges / resolved flags.
 */
export class MergeCommand {
  doc: Text;
  states: ChangeState[];
  changeSet: ChangeSet;
  private readonly startStates: string;

  constructor(
    readonly texts: MergeTexts,
    readonly changes: readonly MergeChange[],
    doc: Text,
    states: readonly ChangeState[],
  ) {
    this.doc = doc;
    this.states = cloneStates(states);
    this.changeSet = ChangeSet.empty(doc.length);
    this.startStates = JSON.stringify(this.states);
  }

  /** true when the command changed the document or any change state */
  get modified(): boolean {
    return !this.changeSet.empty || JSON.stringify(this.states) !== this.startStates;
  }

  private applyEdit(edit: TextEdit | null): void {
    if (!edit) return;
    processEdit(this.states, this.changes, this.doc, edit.from, edit.to, edit.insert);
    const cs = ChangeSet.of(edit, this.doc.length);
    this.doc = cs.apply(this.doc);
    this.changeSet = this.changeSet.compose(cs);
  }

  // MergeModelBase -------------------------------------------------------------------------------------------------

  /** MergeModelBase.replaceChange */
  replaceChangeLines(index: number, newLines: readonly string[]): void {
    const s = this.states[index]!;
    const start = s.start;
    const end = s.end;
    this.applyEdit(lineModification(this.doc, start, end, newLines));
    if (start === end) this.moveChangesAfterInsertion(index, start, start + newLines.length);
  }

  /** MergeModelBase.appendChange */
  appendChangeLines(index: number, newLines: readonly string[]): void {
    const s = this.states[index]!;
    const start = s.start;
    const end = s.end;
    this.applyEdit(lineModification(this.doc, end, end, newLines));
    this.moveChangesAfterInsertion(index, start, end + newLines.length);
  }

  /** MergeModelBase.moveChangesAfterInsertion: include the inserted block into the change, keep the order of changes */
  private moveChangesAfterInsertion(index: number, newStart: number, newEnd: number): void {
    const self = this.states[index]!;
    self.start = newStart;
    self.end = newEnd;
    let beforeChange = true;
    for (let other = 0; other < this.states.length; other++) {
      const s = this.states[other]!;
      if (s.end < newStart) continue;
      if (s.start > newEnd) break;
      if (other === index) {
        beforeChange = false;
        continue;
      }
      const start = beforeChange ? Math.min(s.start, newStart) : newEnd;
      const end = beforeChange ? Math.min(s.end, newStart) : Math.max(s.end, newEnd);
      s.start = start;
      s.end = end;
    }
  }

  // MergeConflictModel ---------------------------------------------------------------------------------------------

  markChangeResolved(index: number): void {
    const s = this.states[index]!;
    s.resolved = [true, true];
  }

  markChangeSideResolved(index: number, side: Side): void {
    const s = this.states[index]!;
    if (isResolved(s)) return;
    s.resolved[side] = true;
  }

  /** MergeConflictModel.ignoreChange */
  ignoreChange(index: number, side: Side, resolveChange: boolean): void {
    const c = this.changes[index]!;
    if (!isConflict(c) || resolveChange) this.markChangeResolved(index);
    else this.markChangeSideResolved(index, side);
  }

  /** MergeConflictModel.replaceChange: apply the `side` version of the change into the result. */
  replaceChange(index: number, side: Side, resolveChange: boolean): boolean {
    const c = this.changes[index]!;
    const s = this.states[index]!;
    if (s.resolved[side]) return false;
    const sourceSide = sideToThree(side);
    if (!isChange(c, sourceSide)) {
      this.markChangeResolved(index);
      return false;
    }
    const oppositeSide = side === 0 ? RIGHT : LEFT;
    const source = sourceSide === LEFT ? this.texts.left : this.texts.right;
    const newContent = getLines(source, c.startLine[sourceSide], c.endLine[sourceSide]);

    if (isConflict(c)) {
      if (s.onesideApplied) this.appendChangeLines(index, newContent);
      else this.replaceChangeLines(index, newContent);

      if (resolveChange || c.startLine[oppositeSide] === c.endLine[oppositeSide]) {
        this.markChangeResolved(index);
      } else {
        this.states[index]!.onesideApplied = true;
        this.markChangeSideResolved(index, side);
      }
    } else {
      this.replaceChangeLines(index, newContent);
      this.markChangeResolved(index);
    }
    return true;
  }

  /** MergeConflictModel.isChangeRangeModified */
  isChangeRangeModified(index: number): boolean {
    const c = this.changes[index]!;
    const s = this.states[index]!;
    return linesContent(this.texts.base, c.startLine[1], c.endLine[1]) !== linesContent(this.doc, s.start, s.end);
  }

  /** MergeConflictModel.canResolveChangeAutomatically */
  canResolveChangeAutomatically(index: number, side: ThreeSide): boolean {
    const c = this.changes[index]!;
    const s = this.states[index]!;
    if (isConflict(c)) {
      return side === BASE && c.conflictType.canBeResolved && !s.resolved[0] && !s.resolved[1] && !this.isChangeRangeModified(index);
    }
    return !isResolved(s) && isChange(c, side) && !this.isChangeRangeModified(index);
  }

  /** MergeConflictModel.resolveChangeAutomatically */
  resolveChangeAutomatically(index: number, side: ThreeSide): boolean {
    if (!this.canResolveChangeAutomatically(index, side)) return false;
    const c = this.changes[index]!;
    if (isConflict(c)) {
      const s = this.states[index]!;
      const leftText = linesContent(this.texts.left, c.startLine[0], c.endLine[0]);
      const baseText = linesContent(this.doc, s.start, s.end);
      const rightText = linesContent(this.texts.right, c.startLine[2], c.endLine[2]);
      const newContent = tryResolve(leftText, baseText, rightText);
      if (newContent == null) return false;
      this.replaceChangeLines(index, tokenizeLines(newContent));
      this.markChangeResolved(index);
      return true;
    }
    const master: Side = side === LEFT ? 0 : side === RIGHT ? 1 : isChange(c, LEFT) ? 0 : 1;
    return this.replaceChange(index, master, false);
  }

  /** MergeConflictModel.resetResolvedChange: put the base content back and forget the resolution. */
  resetResolvedChange(index: number, force = false): void {
    const c = this.changes[index]!;
    const s = this.states[index]!;
    if (!force && !isResolved(s)) return;
    this.replaceChangeLines(index, getLines(this.texts.base, c.startLine[1], c.endLine[1]));
    const st = this.states[index]!;
    st.resolved = [false, false];
    st.onesideApplied = false;
  }

  /** MergeThreesideViewer.applyNonConflictedChanges */
  applyNonConflictedChanges(side: ThreeSide): void {
    this.changes.forEach((c, i) => {
      if (!isConflict(c)) this.resolveChangeAutomatically(i, side);
    });
  }

  /** MergeThreesideViewer.applyResolvableConflictedChanges ("Resolve simple conflicts", magic wand) */
  applyResolvableConflictedChanges(): void {
    this.changes.forEach((_c, i) => this.resolveChangeAutomatically(i, BASE));
  }

  /** MergeThreesideViewer.resetChanges ("Revert conflict resolution") */
  resetChanges(): void {
    this.changes.forEach((_c, i) => {
      if (isResolved(this.states[i]!)) this.resetResolvedChange(i, false);
    });
  }

  /** MergeConflictModel.acceptRevisionForSide ("Accept Left" / "Accept Right" dialog buttons) */
  acceptRevisionForSide(side: Side): void {
    this.changes.forEach((_c, i) => this.resetResolvedChange(i, true));
    this.changes.forEach((_c, i) => this.replaceChange(i, side, true));
  }

  hasNonConflictedChanges(side: ThreeSide): boolean {
    return this.changes.some((c, i) => !isConflict(c) && this.canResolveChangeAutomatically(i, side));
  }

  hasAutoResolvableConflictedChanges(): boolean {
    return this.changes.some((_c, i) => this.canResolveChangeAutomatically(i, BASE));
  }
}

/** ThreesideTextDiffViewerEx counters: unresolved non-conflicting changes and unresolved conflicts. */
export function countUnresolved(changes: readonly MergeChange[], states: readonly ChangeState[]): { changes: number; conflicts: number } {
  let nChanges = 0;
  let nConflicts = 0;
  changes.forEach((c, i) => {
    const s = states[i];
    if (!s || isResolved(s)) return;
    if (isConflict(c)) nConflicts++;
    else nChanges++;
  });
  return { changes: nChanges, conflicts: nConflicts };
}

/** DiffBundle merge.differences.status.text / merge.dialog.all.conflicts.resolved.message.text */
export function statusText(counts: { changes: number; conflicts: number }): string {
  if (counts.changes === 0 && counts.conflicts === 0) return 'All conflicts resolved';
  const c = counts.changes === 0 ? 'No changes' : counts.changes === 1 ? '1 change' : `${counts.changes} changes`;
  const k = counts.conflicts === 0 ? 'No conflicts' : counts.conflicts === 1 ? '1 conflict' : `${counts.conflicts} conflicts`;
  return `${c}, ${k}`;
}
