// Ported from intellij-community platform/diff-impl/tests/.../comparison/CharComparisonMergeUtilTest.kt (JetBrains, Apache-2.0).
import { describe, test } from 'vitest';
import { merge_chars, mod3 } from '../test/dsl';

describe('CharComparisonMergeUtilTest', () => {
  test('testSimpleCases', () => {
    merge_chars((t) => {
      t.$("", "", "")
      t.$("", "", "").matching()
      t.changes()
      t.test()
    });

    merge_chars((t) => {
      t.$("xyz", "xyz", "xyz")
      t.$("   ", "   ", "   ").matching()
      t.changes()
      t.test()
    });

    merge_chars((t) => {
      t.$("", "", "x")
      t.$("", "", "-").matching()
      t.changes(mod3(0, 0, 0, 0, 0, 1))
      t.test()
    });

    merge_chars((t) => {
      t.$("x", "yx", "x")
      t.$(" ", "- ", " ").matching()
      t.test()
    });

    merge_chars((t) => {
      t.$("x", "xy", "x")
      t.$(" ", " -", " ").matching()
      t.test()
    });

    merge_chars((t) => {
      t.$("xyz", "xYz", "xyz")
      t.$(" - ", " - ", " - ").matching()
      t.test()
    });

    merge_chars((t) => {
      t.$("xyz", "XyZ", "xyz")
      t.$("- -", "- -", "- -").matching()
      t.test()
    });
  });

  test('testConflictTYpes', () => {
    merge_chars((t) => {
      t.$("abcd", "abcd", "abXcd")
      t.$("    ", "    ", "  -  ").matching()
      t.test()
    });

    merge_chars((t) => {
      t.$("abXcd", "abcd", "abXcd")
      t.$("  -  ", "    ", "  -  ").matching()
      t.test()
    });

    merge_chars((t) => {
      t.$("abcd", "abXcd", "abXcd")
      t.$("    ", "  -  ", "  -  ").matching()
      t.test()
    });

    merge_chars((t) => {
      t.$("abcd", "abXcd", "abcd")
      t.$("    ", "  -  ", "    ").matching()
      t.test()
    });

    merge_chars((t) => {
      t.$("abcd", "abXcd", "abYcd")
      t.$("    ", "  -  ", "  -  ").matching()
      t.test()
    });

    merge_chars((t) => {
      t.$("abXcd", "abXcd", "abYcd")
      t.$("  -  ", "  -  ", "  -  ").matching()
      t.test()
    });

    merge_chars((t) => {
      t.$("abYcd", "abXcd", "abYcd")
      t.$("  -  ", "  -  ", "  -  ").matching()
      t.test()
    });

    merge_chars((t) => {
      t.$("abYcd", "abXcd", "abZcd")
      t.$("  -  ", "  -  ", "  -  ").matching()
      t.test()
    });

    merge_chars((t) => {
      t.$("abXcd", "abcd", "abYcd")
      t.$("  -  ", "    ", "  -  ").matching()
      t.test()
    });
  });

  test('testBoundaryConflicts', () => {
    merge_chars((t) => {
      t.$("abcd", "abcd", "abcdx")
      t.$("    ", "    ", "    -").matching()
      t.test()
    });

    merge_chars((t) => {
      t.$("abcd", "abcdx", "abcdx")
      t.$("    ", "    -", "    -").matching()
      t.test()
    });

    merge_chars((t) => {
      t.$("abcd", "abcdx", "abcdy")
      t.$("    ", "    -", "    -").matching()
      t.test()
    });

    merge_chars((t) => {
      t.$("abcdz", "abcdx", "abcdy")
      t.$("    -", "    -", "    -").matching()
      t.test()
    });

    merge_chars((t) => {
      t.$("xabcd", "abcd", "abcd")
      t.$("-    ", "    ", "    ").matching()
      t.test()
    });

    merge_chars((t) => {
      t.$("xabcd", "yabcd", "abcd")
      t.$("-    ", "-    ", "    ").matching()
      t.test()
    });

    merge_chars((t) => {
      t.$("abcd", "yabcd", "abcd")
      t.$("    ", "-    ", "    ").matching()
      t.test()
    });
  });

  test('testMultipleChanges', () => {
    merge_chars((t) => {
      t.$("XXbXcXXeX", "XyXzXXnXkX", "XqXXeXrXX")
      t.$("  - -  - ", " - -  - - ", " -  - -  ").matching()
      t.test()
    });

    merge_chars((t) => {
      t.$("Ax", "z", "zA")
      t.$("--", "-", "--").matching()
      t.test()
    });

    merge_chars((t) => {
      t.$("ayz", "xyz", "xyq")
      t.$("- -", "- -", "- -").matching()
      t.test()
    });
  });
});
