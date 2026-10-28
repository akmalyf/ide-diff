// Ported from intellij-community platform/diff-impl/tests/.../comparison/CharComparisonUtilTest.kt (JetBrains, Apache-2.0).
import { describe, test } from 'vitest';
import { lines, lines_inner, words, chars, chars_raw, chars_smart, splitter, chSmile, chGun, chFace, chMan, mod, del, ins } from '../test/dsl';

describe('CharComparisonUtilTest', () => {
  test('testEqualStrings', () => {
    chars((t) => {
      t.$("", "")
      t.$("", "").default()
      t.testAll()
    });

    chars((t) => {
      t.$("x", "x")
      t.$(" ", " ").default()
      t.testAll()
    });

    chars((t) => {
      t.$("x_y_z_", "x_y_z_")
      t.$("      ", "      ").default()
      t.testAll()
    });

    chars((t) => {
      t.$("_", "_")
      t.$(" ", " ").default()
      t.testAll()
    });

    chars((t) => {
      t.$("xxx", "xxx")
      t.$("   ", "   ").default()
      t.testAll()
    });

    chars((t) => {
      t.$("xyz", "xyz")
      t.$("   ", "   ").default()
      t.testAll()
    });

    chars((t) => {
      t.$(".x!", ".x!")
      t.$("   ", "   ").default()
      t.testAll()
    });
  });

  test('testTrivialCases', () => {
    chars((t) => {
      t.$("x", "")
      t.$("-", "").default()
      t.testAll()
    });

    chars((t) => {
      t.$("", "x")
      t.$("", "-").default()
      t.testAll()
    });

    chars((t) => {
      t.$("x", "y")
      t.$("-", "-").default()
      t.testAll()
    });

    chars((t) => {
      t.$("x_", "")
      t.$("--", "").default()
      t.$("- ", "").trim()
      t.testAll()
    });

    chars((t) => {
      t.$("", "x_")
      t.$("", "--").default()
      t.$("", "- ").trim()
      t.testAll()
    });

    chars((t) => {
      t.$("x_", "y_")
      t.$("- ", "- ").default()
      t.testAll()
    });

    chars((t) => {
      t.$("_x", "_y")
      t.$(" -", " -").default()
      t.testAll()
    });
  });

  test('testSimpleCases', () => {
    chars((t) => {
      t.$("xyx", "xxx")
      t.$(" - ", " - ").default()
      t.testAll()
    });

    chars((t) => {
      t.$("xyyx", "xmx")
      t.$(" -- ", " - ").default()
      t.testAll()
    });

    chars((t) => {
      t.$("xyy", "yyx")
      t.$("-  ", "  -").default()
      t.testAll()
    });

    chars((t) => {
      t.$("x!!", "!!x")
      t.$("-  ", "  -").default()
      t.testAll()
    });

    chars((t) => {
      t.$("xyx", "xx")
      t.$(" - ", "  ").default()
      t.testAll()
    });

    chars((t) => {
      t.$("xx", "xyx")
      t.$("  ", " - ").default()
      t.testAll()
    });

    chars((t) => {
      t.$("!...", "...!")
      t.$("-   ", "   -").default()
      t.testAll()
    });
  });

  test('testWhitespaceChangesOnly', () => {
    chars((t) => {
      t.$(" x y z ", "xyz")
      t.$("- - - -", "   ").default()
      t.$("  - -  ", "   ").trim()
      t.$("       ", "   ").ignore()
      t.testAll()
    });

    chars((t) => {
      t.$("xyz", " x y z ")
      t.$("   ", "- - - -").default()
      t.$("   ", "  - -  ").trim()
      t.$("   ", "       ").ignore()
      t.testAll()
    });

    chars((t) => {
      t.$("x ", "x")
      t.$(" -", " ").default()
      t.$("  ", " ").trim()
      t.testAll()
    });

    chars((t) => {
      t.$("x", " x")
      t.$(" ", "- ").default()
      t.$(" ", "  ").trim()
      t.testAll()
    });

    chars((t) => {
      t.$(" x ", "x")
      t.$("- -", " ").default()
      t.$("   ", " ").trim()
      t.testAll()
    });

    chars((t) => {
      t.$("x", " x ")
      t.$(" ", "- -").default()
      t.$(" ", "   ").trim()
      t.testAll()
    });
  });

  test('testWhitespaceChanges', () => {
    chars((t) => {
      t.$(" x ", "z")
      t.$("---", "-").default()
      t.$(" - ", "-").trim()
      t.testAll()
    });

    chars((t) => {
      t.$("x", " z ")
      t.$("-", "---").default()
      t.$("-", " - ").trim()
      t.testAll()
    });

    chars((t) => {
      t.$(" x", "z\t")
      t.$("--", "-.-").default()
      t.$(" -", "-. ").trim()
      t.testAll()
    });

    chars((t) => {
      t.$("x ", "\tz")
      t.$("--", ".--").default()
      t.$("- ", ". -").trim()
      t.testAll()
    });

    chars((t) => {
      t.$("x y z", "xy_z")
      t.$(" - - ", "  - ").default()
      t.$(" - - ", "    ").trim()
      t.$("     ", "    ").ignore()
      t.testAll()
    });

    chars((t) => {
      t.$("x y \n z", "xy\nz")
      t.$(" - -. - ", "  .  ").default()
      t.$(" -  .   ", "  .  ").trim()
      t.$("    .   ", "  .  ").ignore()
      t.testAll()
    });
  });

  test('testIgnoreInnerWhitespaces', () => {
    chars((t) => {
      t.$("x z y", "xmn")
      t.$(" ----", " --").default()
      t.$("  ---", " --").ignore()
      t.testAll()
    });

    chars((t) => {
      t.$("x y z ", "x y m ")
      t.$("    - ", "    - ").default()
      t.testAll()
    });

    chars((t) => {
      t.$("x y z", "x y m ")
      t.$("    -", "    --").default()
      t.$("    -", "    - ").trim()
      t.testAll()
    });

    chars((t) => {
      t.$(" x y z", " m y z")
      t.$(" -    ", " -    ").default()
      t.testAll()
    });

    chars((t) => {
      t.$("x y z", " m y z")
      t.$("-    ", "--    ").default()
      t.$("-    ", " -    ").trim()
      t.testAll()
    });

    chars((t) => {
      t.$("x y z", "x m z")
      t.$("  -  ", "  -  ").default()
      t.testAll()
    });

    chars((t) => {
      t.$("x y z", "x  z")
      t.$("  -  ", "    ").default()
      t.testAll()
    });

    chars((t) => {
      t.$("x  z", "x m z")
      t.$("    ", "  -  ").default()
      t.testAll()
    });

    chars((t) => {
      t.$("x  z", "x n m z")
      t.$("    ", "  ---  ").default()
      t.testAll()
    });
  });

  test('testEmptyRangePositions', () => {
    chars((t) => {
      t.$("x y", "x zy")
      t.default(ins(2, 2, 1))
      t.testAll()
    });

    chars((t) => {
      t.$("x y", "xz y")
      t.default(ins(1, 1, 1))
      t.testAll()
    });

    chars((t) => {
      t.$("x y z", "x  z")
      t.default(del(2, 2, 1))
      t.testAll()
    });

    chars((t) => {
      t.$("x  z", "x m z")
      t.default(ins(2, 2, 1))
      t.testAll()
    });

    chars((t) => {
      t.$("xyx", "xx")
      t.default(del(1, 1, 1))
      t.testAll()
    });

    chars((t) => {
      t.$("xx", "xyx")
      t.default(ins(1, 1, 1))
      t.testAll()
    });

    chars((t) => {
      t.$("xy", "x")
      t.default(del(1, 1, 1))
      t.testAll()
    });

    chars((t) => {
      t.$("x", "xy")
      t.default(ins(1, 1, 1))
      t.testAll()
    });
  });

  test('testAlgorithmSpecific', () => {
    // This is a strange example: "ignore whitespace" produces lesser matching, than "Default".
    // This is fine, as the main goal of "ignore whitespaces" is to reduce 'noise' of diff, and 1 change is better than 3 changes
    // So we actually "ignore" whitespaces during comparison, rather than "mark all whitespaces as matched".
    chars((t) => {
      t.$("x   y   z", "xX      Zz")
      t.$("    -    ", " -      - ").default()
      t.$("    -    ", " -------- ").ignore()
      t.testAll()
    });
  });

  test('testNonDeterministicCases', () => {
    chars((t) => {
      t.$("x", "  ")
      t.ignore(del(0, 0, 1))
      t.testIgnore()
    });

    chars((t) => {
      t.$("  ", "x")
      t.ignore(ins(0, 0, 1))
      t.testIgnore()
    });

    chars((t) => {
      t.$("x .. z", "x y .. z")
      t.$("      ", "  --    ").default()
      t.$("      ", "  -     ").ignore()
      t.default(ins(2, 2, 2))
      t.ignore(ins(2, 2, 1))
      t.testAll()
    });

    chars((t) => {
      t.$(" x _ y _ z ", "x z")
      t.$("-  ------ -", "   ").default()
      t.$("     -     ", "   ").trim()
      t.default(del(0, 0, 1), del(3, 2, 6), del(10, 3, 1))
      t.trim(del(5, 2, 1))
      t.testAll()
    });

    chars((t) => {
      t.$("x z", " x _ y _ z ")
      t.$("   ", "-  ------ -").default()
      t.$("   ", "     -     ").trim()
      t.default(ins(0, 0, 1), ins(2, 3, 6), ins(3, 10, 1))
      t.trim(ins(2, 5, 1))
      t.testAll()
    });
  });

  test('testTwoSteps', () => {
    chars_smart((t) => {
      t.$("  a", "a  ")
      t.$("-- ", " --").default()
      t.testDefault()
    });

    chars_raw((t) => {
      t.$("  a", "a  ")
      t.$("  -", "-  ").default()
      t.testDefault()
    });

    chars_smart((t) => {
      t.$("bba", "abb")
      t.$("  -", "-  ").default()
      t.testDefault()
    });

    chars_raw((t) => {
      t.$("bba", "abb")
      t.$("  -", "-  ").default()
      t.testDefault()
    });

    chars_smart((t) => {
      t.$(`${chSmile}${chFace} ${chMan}`, ` ${chGun}${chFace}${chMan} `)
      t.$("--  -  ", "---    -").default()
      t.testDefault()
    });

    chars_raw((t) => {
      t.$(`${chSmile}${chFace} ${chMan}`, ` ${chGun}${chFace}${chMan} `)
      t.$("--   --", "---  -- ").default()
      t.testDefault()
    });
  });

  test('testHighSurrogates', () => {
    chars((t) => {
      t.$(chSmile, chSmile)
      t.$("  ", "  ").default()
      t.testAll()
    });

    chars((t) => {
      t.$(chSmile, chMan)
      t.$("--", "--").default()
      t.testAll()
    });

    chars((t) => {
      t.$(chSmile, chGun)
      t.$("--", "--").default()
      t.testAll()
    });

    chars((t) => {
      t.$(chFace, chGun)
      t.$("--", "--").default()
      t.testAll()
    });

    chars((t) => {
      t.$(`${chSmile}${chGun}${chMan}${chFace}`, `${chGun}${chMan}${chFace}${chSmile}`)
      t.$("--      ", "      --").default()
      t.testAll()
    });

    chars((t) => {
      t.$(chSmile, chGun)
      t.$("--", "--").default()
      t.testAll()
    });

    chars((t) => {
      t.$(chFace, chGun)
      t.$("--", "--").default()
      t.testAll()
    });

    chars((t) => {
      t.$(`${chSmile} `, chGun)
      t.$("---", "--").default()
      t.$("-- ", "--").trim()
      t.testAll()
    });

    chars((t) => {
      t.$(` ${chSmile}${chFace} ${chMan}`, `${chGun}${chFace}${chMan}`)
      t.$("---  -  ", "--    ").default()
      t.$(" --  -  ", "--    ").trim()
      t.$(" --     ", "--    ").ignore()
      t.testAll()
    });
  });
});
