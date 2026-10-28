// Ported from intellij-community platform/diff-impl/tests/.../comparison/WordMergeComparisonUtilTest.kt (JetBrains, Apache-2.0).
import { describe, test } from 'vitest';
import { words } from '../test/dsl';

describe('WordMergeComparisonUtilTest', () => {
  test('testSimple', () => {
    words((t) => {
      t.$("", "", "")
      t.$("", "", "").default()
      t.testAll()
    });

    words((t) => {
      t.$("", "X", "")
      t.$("", "-", "").default()
      t.testAll()
    });

    words((t) => {
      t.$("X", "", "")
      t.$("-", "", "").default()
      t.testAll()
    });

    words((t) => {
      t.$("a b", "a b", "a b")
      t.$("   ", "   ", "   ").default()
      t.testAll()
    });

    words((t) => {
      t.$("A b c", "a b c", "a b C")
      t.$("-   -", "-   -", "-   -").default()
      t.testAll()
    });

    words((t) => {
      t.$("a c", "a c", "a X c")
      t.$("   ", "   ", " --  ").default()
      t.$("   ", "   ", "  -  ").ignore()
      t.testAll()
    });

    words((t) => {
      t.$("a X c", "a X c", "a c")
      t.$(" --  ", " --  ", "   ").default()
      t.$("  -  ", "  -  ", "   ").ignore()
      t.testAll()
    });

    words((t) => {
      t.$("a X c", "a c", "a Y c")
      t.$(" --  ", "   ", " --  ").default()
      t.$("  -  ", "   ", "  -  ").ignore()
      t.testAll()
    });

    words((t) => {
      t.$("a c", "a X c", "a Y c")
      t.$("   ", " --  ", " --  ").default()
      t.$("   ", "  -  ", "  -  ").ignore()
      t.testAll()
    });
  });

  test('testNewlines', () => {
    words((t) => {
      t.$("i", "i_", "_i")
      t.$("-", "--", "--").default() // TODO
      t.$(" ", "  ", "  ").trim()
      t.testAll()
    });

    words((t) => {
      t.$("_i", "i_", "i")
      t.$("--", "--", "-").default()
      t.$("  ", "  ", " ").trim()
      t.testAll()
    });

    words((t) => {
      t.$("i", "_i", "i_")
      t.$(" ", "- ", " -").default()
      t.$(" ", "  ", "  ").trim()
      t.testAll()
    });

    words((t) => {
      t.$("_i", "i", "i_")
      t.$("- ", " ", " -").default()
      t.$("  ", " ", "  ").trim()
      t.testAll()
    });
  });
});
