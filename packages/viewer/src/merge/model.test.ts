import { describe, expect, it } from 'vitest';
import { ChangeSet, Text } from '@codemirror/state';
import {
  BASE,
  LEFT,
  RIGHT,
  MergeCommand,
  computeMergeChanges,
  countUnresolved,
  initialStates,
  isResolved,
  lineModification,
  linesContent,
  mapStates,
  restoreStates,
  statusText,
  tokenizeLines,
  updateRangeOnModification,
  type MergeTexts,
} from './model';
import { computeFoldGroupsN } from './folding';
import { compareThreesideInner } from './inner';
import { mergeSamplePhp } from './samples';

const text = (s: string) => Text.of(s.split('\n'));

function setup(left: string, base: string, right: string) {
  const texts: MergeTexts = { left: text(left), base: text(base), right: text(right) };
  const changes = computeMergeChanges(left, base, right, 'DEFAULT');
  const cmd = new MergeCommand(texts, changes, texts.base, initialStates(changes));
  return { texts, changes, cmd };
}

describe('updateRangeOnModification', () => {
  it('handles changes before / after / inside / damaging the range', () => {
    expect(updateRangeOnModification(5, 8, 1, 2, 3)).toEqual({ start: 8, end: 11, damaged: false }); // before → shift
    expect(updateRangeOnModification(5, 8, 9, 10, 3)).toEqual({ start: 5, end: 8, damaged: false }); // after
    expect(updateRangeOnModification(5, 8, 6, 7, 2)).toEqual({ start: 5, end: 10, damaged: false }); // inside
    expect(updateRangeOnModification(5, 8, 4, 9, -2)).toEqual({ start: 7, end: 7, damaged: true }); // swallowed
    expect(updateRangeOnModification(5, 8, 7, 10, 0)).toEqual({ start: 5, end: 7, damaged: true }); // bottom damaged
  });
});

describe('line modifications (DiffUtil.applyModification)', () => {
  it('inserts, replaces and deletes whole lines', () => {
    const doc = text('a\nb\nc');
    const apply = (e: ReturnType<typeof lineModification>) => (e ? doc.replace(e.from, e.to, text(e.insert)).toString() : doc.toString());
    expect(apply(lineModification(doc, 1, 1, ['x', 'y']))).toBe('a\nx\ny\nb\nc');
    expect(apply(lineModification(doc, 3, 3, ['z']))).toBe('a\nb\nc\nz');
    expect(apply(lineModification(doc, 1, 2, ['B']))).toBe('a\nB\nc');
    expect(apply(lineModification(doc, 1, 3, []))).toBe('a');
    expect(apply(lineModification(doc, 0, 1, []))).toBe('b\nc');
    expect(lineModification(doc, 2, 2, [])).toBeNull();
  });

  it('tokenizes resolved content like LineTokenizer', () => {
    expect(tokenizeLines('')).toEqual([]);
    expect(tokenizeLines('a\nb')).toEqual(['a', 'b']);
    expect(tokenizeLines('a\nb\n')).toEqual(['a', 'b']);
  });
});

describe('merge model on the PHP sample', () => {
  const { left, base, right } = mergeSamplePhp;

  it('finds non-conflicting changes on both sides, real conflicts and a magic-wand conflict', () => {
    const { changes, cmd } = setup(left, base, right);
    const conflicts = changes.filter((c) => c.conflictType.type === 'CONFLICT');
    expect(conflicts.length).toBeGreaterThanOrEqual(3);
    expect(conflicts.filter((c) => !c.conflictType.canBeResolved).length).toBeGreaterThanOrEqual(2);
    expect(changes.some((c) => c.conflictType.type !== 'CONFLICT' && c.conflictType.leftChange)).toBe(true);
    expect(changes.some((c) => c.conflictType.type !== 'CONFLICT' && c.conflictType.rightChange)).toBe(true);
    expect(cmd.hasAutoResolvableConflictedChanges()).toBe(true);
    expect(statusText(countUnresolved(changes, cmd.states))).toBe('5 changes, 3 conflicts');
  });

  it('applies non-conflicting changes from one side or both', () => {
    const l = setup(left, base, right);
    l.cmd.applyNonConflictedChanges(LEFT);
    expect(l.cmd.doc.toString()).toContain('use App\\Event\\OrderPlaced;');
    expect(l.cmd.doc.toString()).not.toContain('setCancelledAt');
    expect(countUnresolved(l.changes, l.cmd.states)).toEqual({ changes: 3, conflicts: 3 });
    expect(l.cmd.hasNonConflictedChanges(LEFT)).toBe(false);
    expect(l.cmd.hasNonConflictedChanges(RIGHT)).toBe(true);

    const all = setup(left, base, right);
    all.cmd.applyNonConflictedChanges(BASE);
    const result = all.cmd.doc.toString();
    expect(result).toContain('use App\\Event\\OrderPlaced;');
    expect(result).toContain('$order->setCancelledAt(new \\DateTimeImmutable());');
    expect(result).toContain("findOneBy(['id' => $id])");
    expect(countUnresolved(all.changes, all.cmd.states)).toEqual({ changes: 0, conflicts: 3 });
    // the change set reproduces the same document from base
    expect(all.cmd.changeSet.apply(all.texts.base).toString()).toBe(result);
    // tracked ranges point at the applied content
    all.changes.forEach((c, i) => {
      if (c.conflictType.type === 'CONFLICT') return;
      const s = all.cmd.states[i]!;
      const src = c.conflictType.leftChange ? all.texts.left : all.texts.right;
      const side = c.conflictType.leftChange ? 0 : 2;
      expect(linesContent(all.cmd.doc, s.start, s.end)).toBe(linesContent(src, c.startLine[side], c.endLine[side]));
    });
  });

  it('accepts one side of a conflict, then appends the other side', () => {
    const { changes, cmd } = setup(left, base, right);
    const i = changes.findIndex((c) => c.conflictType.type === 'CONFLICT');
    cmd.replaceChange(i, 0, false);
    let s = cmd.states[i]!;
    expect(s.resolved).toEqual([true, false]);
    expect(s.onesideApplied).toBe(true);
    expect(linesContent(cmd.doc, s.start, s.end)).toBe('    private const MAX_ITEMS = 100;');
    cmd.replaceChange(i, 1, false);
    s = cmd.states[i]!;
    expect(isResolved(s)).toBe(true);
    expect(linesContent(cmd.doc, s.start, s.end)).toBe('    private const MAX_ITEMS = 100;\n    private const MAX_ITEMS = 75;');
  });

  it('ctrl+click resolves a conflict with one side; ignore keeps the text', () => {
    const { changes, cmd } = setup(left, base, right);
    const conflicts = changes.flatMap((c, i) => (c.conflictType.type === 'CONFLICT' ? [i] : []));
    cmd.replaceChange(conflicts[0]!, 1, true);
    expect(isResolved(cmd.states[conflicts[0]!]!)).toBe(true);
    const before = cmd.doc.toString();
    cmd.ignoreChange(conflicts[1]!, 0, false);
    expect(cmd.states[conflicts[1]!]!.resolved).toEqual([true, false]);
    cmd.ignoreChange(conflicts[2]!, 1, true);
    expect(isResolved(cmd.states[conflicts[2]!]!)).toBe(true);
    expect(cmd.doc.toString()).toBe(before);
  });

  it('resolves simple conflicts with the magic wand', () => {
    const { changes, cmd } = setup(left, base, right);
    cmd.applyResolvableConflictedChanges();
    const result = cmd.doc.toString();
    expect(result).toContain('$sum += $item->getUnitPrice() * $item->getAmount();');
    // unresolvable conflicts stay
    expect(countUnresolved(changes, cmd.states)).toEqual({ changes: 0, conflicts: 2 });
  });

  it('reverts resolved changes back to base', () => {
    const { changes, cmd } = setup(left, base, right);
    cmd.applyNonConflictedChanges(BASE);
    cmd.resetChanges();
    expect(cmd.doc.toString()).toBe(base);
    expect(countUnresolved(changes, cmd.states)).toEqual({ changes: 5, conflicts: 3 });
  });

  it('accepts a whole side', () => {
    const { cmd } = setup(left, base, right);
    cmd.acceptRevisionForSide(1);
    expect(cmd.doc.toString()).toBe(right);
    expect(cmd.states.every(isResolved)).toBe(true);
  });

  it('re-attaches an edited result to fresh fragments', () => {
    const { texts, changes, cmd } = setup(left, base, right);
    cmd.applyNonConflictedChanges(LEFT);
    const conflict = changes.findIndex((c) => c.conflictType.type === 'CONFLICT');
    cmd.replaceChange(conflict, 1, false);
    const restored = restoreStates(changes, texts, cmd.doc);
    restored.forEach((s, i) => {
      expect([s.start, s.end]).toEqual([cmd.states[i]!.start, cmd.states[i]!.end]);
      expect(isResolved(s)).toBe(isResolved(cmd.states[i]!));
    });
    expect(restored[conflict]!.resolved).toEqual([false, true]);
  });
});

describe('range tracking of user edits', () => {
  it('shifts, grows and resolves changes like MergeModelBase', () => {
    const base = 'a\nb\nc\nd\ne';
    const left = 'a\nB\nc\nd\ne';
    const right = 'a\nb\nc\ne'; // deletes "d"
    const { changes } = setup(left, base, right);
    expect(changes.map((c) => c.conflictType.type)).toEqual(['MODIFIED', 'DELETED']);
    const doc = text(base);
    const states = initialStates(changes);

    // insert a line at the top: everything shifts by one
    let cs = ChangeSet.of({ from: 0, insert: 'top\n' }, doc.length);
    let mapped = mapStates(states, changes, doc, cs);
    expect(mapped.map((s) => [s.start, s.end])).toEqual([
      [2, 3],
      [4, 5],
    ]);

    // type inside the first change: the range grows
    cs = ChangeSet.of({ from: doc.line(2).to, insert: '\nmore' }, doc.length);
    mapped = mapStates(states, changes, doc, cs);
    expect(mapped.map((s) => [s.start, s.end])).toEqual([
      [1, 3],
      [4, 5],
    ]);

    // deleting the DELETED change's lines by hand resolves it
    cs = ChangeSet.of({ from: doc.line(3).to, to: doc.line(4).to }, doc.length);
    mapped = mapStates(states, changes, doc, cs);
    expect(mapped[1]).toMatchObject({ start: 3, end: 3, resolved: [true, true] });
  });
});

describe('3-side folding and inner differences', () => {
  it('folds unchanged gaps on every side', () => {
    const groups = computeFoldGroupsN([[20, 21, 20, 21, 20, 22]], [40, 40, 41], 4);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.blocks[0]).toEqual([
      { groupId: 0, startLine: 0, endLine: 16 },
      { groupId: 0, startLine: 0, endLine: 16 },
      { groupId: 0, startLine: 0, endLine: 16 },
    ]);
    expect(groups[1]!.blocks[0]![2]).toEqual({ groupId: 1, startLine: 26, endLine: 41 });
  });

  it('computes by-word ranges for the three chunks', () => {
    const inner = compareThreesideInner(['foo(a, b)', 'foo(x, b)', 'foo(x, c)'], 'DEFAULT')!;
    expect(inner[0]).toEqual([[4, 5]]);
    expect(inner[2]).toEqual([[7, 8]]);
    expect(inner[1]).toEqual([
      [4, 5],
      [7, 8],
    ]);
  });
});
