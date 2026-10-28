// Ported from intellij-community platform/diff-impl/tests/.../comparison/MergeResolveUtilTest.kt (JetBrains, Apache-2.0).
import { describe, expect, test } from 'vitest';
import { tryGreedyResolve, tryResolve } from './mergeResolveUtil';
import '../test/dsl';

// Note the argument order: base first.
function testSimple(base: string, left: string, right: string, expected: string | null): void {
  expect(tryResolve(left, base, right), 'simple').toBe(expected);
}

function testGreedy(base: string, left: string, right: string, expected: string | null): void {
  expect(tryGreedyResolve(left, base, right), 'greedy').toBe(expected);
}

/** The 5-argument form gives different expectations for simple/greedy. */
function check(base: string, left: string, right: string, expectedSimple: string | null, expectedGreedy: string | null = expectedSimple): void {
  testSimple(base, left, right, expectedSimple);
  testGreedy(base, left, right, expectedGreedy);
}

describe('MergeResolveUtilTest', () => {
  test('testSimple', () => {
    check(
      "",
      "",
      "",
      ""
    )

    check(
      "x x x",
      "x x x",
      "x x x",
      "x x x"
    )

    check(
      "x x x",
      "x Y x",
      "x x x",
      "x Y x"
    )

    check(
      "x x",
      "x x",
      "x Y x",
      "x Y x"
    )

    check(
      "x X x",
      "x x",
      "x X x",
      "x x"
    )
  });

  test('testSameModification', () => {
    check(
      "x x x",
      "x Y x",
      "x Y x",
      "x Y x"
    )

    check(
      "x x",
      "x Y x",
      "x Y x",
      "x Y x"
    )

    check(
      "x X x",
      "x x",
      "x x",
      "x x"
    )
  });

  test('testNonConflictingChanges', () => {
    check(
      "x x x",
      "x Y x x",
      "x x Z x",
      "x Y x Z x"
    )

    check(
      "x",
      "x Y",
      "Z x",
      "Z x Y"
    )

    check(
      "x x",
      "x",
      "Z x x",
      "Z x"
    )
  });

  test('testFailure', () => {
    check(
      "x x x",
      "x Y x",
      "x Z x",
      null
    )

    check(
      "x x",
      "x Y x",
      "x Z x",
      null
    )
  });

  test('testNonFailureConflicts', () => {
    testGreedy(
      "x X x",
      "x x",
      "x X Y x",
      "x Y x"
    )

    testGreedy(
      "x X x",
      "x x",
      "x Y X x",
      "x Y x"
    )

    testGreedy(
      "x X Y x",
      "x X x",
      "x Y x",
      "x x"
    )

    testGreedy(
      "x X Y Z x",
      "x X x",
      "x Z x",
      "x x"
    )

    testGreedy(
      "x A B C D E F G H K x",
      "x C F K x",
      "x A D H x",
      "x x"
    )
  });

  test('testConfusingConflicts', () => {
    // these cases might be a failure as well

    testGreedy(
      "x X x",
      "x x",
      "x Z x",
      "xZ x"
    )

    testGreedy(
      "x X X x",
      "x X Y X x",
      "x x",
      "x Y x"
    )

    testGreedy(
      "x X x",
      "x x",
      "x Y x",
      "xY x"
    )


    testGreedy(
      "x X X x",
      "x Y x",
      "x X Y x",
      "x Y x"
    )

    // IDEA-200696
    check(
      "version: 1.0.0",
      "version: 2.0.0",
      "version: 1.0.4",
      "version: 2.0.4"
    )
  });

  test('testRegressions', () => {
    check(
      "i\n",
      "i",
      "\ni",
      "i",
      "i"
    )

    testSimple(
      "Y X Y",
      "Y C\nX\nC Y",
      "Y \nX\n Y",
      "Y \nC\nX\nC Y"
    )

    check(
      `
  public static class ChangeData {
    @NotNull public final ChangeKind kind;
    public final int otherPath;

    public ChangeData(@NotNull ChangeKind kind, int otherPath) {
      this.kind = kind;
      this.otherPath = otherPath;
    }

    public boolean isRename() {
      return kind.equals(ChangeKind.RENAMED_FROM) || kind.equals(ChangeKind.RENAMED_TO);
    }

    @Override
    public int hashCode() {
      return Objects.hash(kind, otherPath);
    }
  }

  private enum ChangeKind {
    MODIFIED((byte)0),
    RENAMED_FROM((byte)1),
    RENAMED_TO((byte)2);`,
      `
  public enum ChangeKind {
    NOT_CHANGED((byte)-1),
    MODIFIED((byte)0),
    ADDED((byte)1),
    REMOVED((byte)2);`,
      `
  public static class ChangeData {
  @NotNull public final ChangeKind kind;
  public final int otherPath;

  public ChangeData(@NotNull ChangeKind kind, int otherPath) {
    this.kind = kind;
    this.otherPath = otherPath;
  }

  public boolean isRename() {
    return kind.equals(ChangeKind.RENAMED_FROM) || kind.equals(ChangeKind.RENAMED_TO);
  }

  @Override
  public int hashCode() {
    return Objects.hash(kind, otherPath);
  }
}

private enum ChangeKind {
  MODIFIED((byte)0),
  RENAMED_FROM((byte)1),
  RENAMED_TO((byte)2);`,
      `
  public enum ChangeKind {
    NOT_CHANGED((byte)-1),
  MODIFIED((byte)0),
  ADDED((byte)1),
  REMOVED((byte)2);`
    )
  });
});
