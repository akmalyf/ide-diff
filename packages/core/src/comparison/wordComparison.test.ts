// Ported from intellij-community platform/diff-impl/tests/.../comparison/WordComparisonUtilTest.kt (JetBrains, Apache-2.0).
import { describe, test } from 'vitest';
import { lines, lines_inner, words, chars, chars_raw, chars_smart, splitter, chSmile, chGun, chFace, chMan, mod, del, ins } from '../test/dsl';

describe('WordComparisonUtilTest', () => {
  test('testSimpleCases', () => {
    lines_inner((t) => {
      t.$("x z", "y z")
      t.$("-  ", "-  ").default()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("x z", "y z")
      t.$("-  ", "-  ").default()
      t.testAll()
    });

    lines_inner((t) => {
      t.$(" x z", "y z")
      t.$("--  ", "-  ").default()
      t.$(" -  ", "-  ").trim()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("x z ", "y z")
      t.$("-  -", "-  ").default()
      t.$("-   ", "-  ").trim()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("x z ", "y z")
      t.$("-  -", "-  ").default()
      t.$("-   ", "-  ").trim()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("x z", " y z ")
      t.$("-  ", "--  -").default()
      t.$("-  ", " -   ").trim()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("x y", "x z ")
      t.$("  -", "  --").default()
      t.$("  -", "  - ").trim()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("x,y", "x")
      t.$(" --", " ").default()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("x,y", "y")
      t.$("-- ", " ").default()
      t.testAll()
    });

    lines_inner((t) => {
      t.$(".x=", ".!=")
      t.$(" - ", " - ").default()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("X xyz1 Z", "X xyz2 Z")
      t.$("  ----  ", "  ----  ").default()
      t.testAll()
    });
  });

  test('testPunctuation', () => {
    lines_inner((t) => {
      t.$(" x.z.x ", "x..x")
      t.$("-  -  -", "    ").default()
      t.$("   -   ", "    ").trim()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("x..x", " x.z.x ")
      t.$("    ", "-  -  -").default()
      t.$("    ", "   -   ").trim()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("x ... z", "y ... z")
      t.$("-      ", "-      ").default()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("x ... z", "x ... y")
      t.$("      -", "      -").default()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("x ,... z", "x ... y")
      t.$("  -    -", "      -").default()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("x . , .. z", "x ... y")
      t.$("   ---   -", "      -").default()
      t.$("    -    -", "      -").ignore()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("x==y==z", "x====z")
      t.$("   -   ", "      ").default()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("x====z", "x==t==z")
      t.$("      ", "   -   ").default()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("X Y ) {_ A B C", "X Y Z ) {_ y B C ) {")
      t.$("         -    ", "   --      -    ----").default()
      t.$("         -    ", "    -      -     ---").ignore()
      t.testAll()
    });

    // TODO
    words((t) => {
      t.$("@Deprecated @NotNull", "@NotNull")
      t.$(" ------------       ", "        ").default()
      t.testAll()
    });

    // TODO
    words((t) => {
      t.$("@Deprecated_ @NotNull", "@NotNull")
      t.$(" -------------       ", "        ").default()
      t.testAll()
    });
  });

  test('testOldDiffBug', () => {
    lines_inner((t) => {
      t.$("x'y'>", "x'>")
      t.$("  -- ", "   ").default()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("x'>", "x'y'>")
      t.$("   ", "  -- ").default()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("x'>", "x'y'>")
      t.$("   ", "  -- ").default()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("x'y'>", "x'>")
      t.$("  -- ", "   ").default()
      t.testAll()
    });
  });

  test('testWhitespaceOnlyChanges', () => {
    lines_inner((t) => {
      t.$("x  =z", "x=  z")
      t.$(" --  ", "  -- ").default()
      t.testDefault()
      t.testTrim()
    });

    lines_inner((t) => {
      t.$("x  =", "x=  z")
      t.$(" -- ", "  ---").default()
      t.$("    ", "    -").ignore()
      t.testAll()
    });
  });

  test('testNewlines', () => {
    lines_inner((t) => {
      t.$(" x _ y _ z ", "x z")
      t.$("- ------  -", "   ").default()
      t.$("     -     ", "   ").trim()
      t.$("     -     ", "   ").ignore()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("x z", " x _ y _ z ")
      t.$("   ", "- ------  -").default()
      t.$("   ", "     -     ").trim()
      t.$("   ", "     -     ").ignore()
      t.testAll()
    });

    words((t) => {
      t.$("_i", "i_")
      t.$("- ", " -").default()
      t.$("  ", "  ").trim()
      t.testAll()
    });

    words((t) => {
      t.$("i_", "_i")
      t.$("- ", " -").default() // TODO
      t.testAll()
    });

    words((t) => {
      t.$("x_y", "xy")
      t.$("   ", "  ").ignore()
      t.testIgnore()
    });

    words((t) => {
      t.$("A x_y B", "a xy b")
      t.$("-------", "------").ignore()
      t.testIgnore()
    });

    words((t) => {
      t.$("A xy B", "a xy b")
      t.$("-    -", "-    -").ignore()
      t.testIgnore()
    });

    words((t) => {
      t.$("A_B_", "X_")
      t.$("--- ", "- ").default()
      t.testAll()
    });
  });

  test('testFixedBugs', () => {
    lines_inner((t) => {
      t.$(".! ", ".  y!")
      t.$("  -", " --- ").default()
      t.$("   ", " --- ").trim()
      t.$("   ", "   - ").ignore()
      t.testAll()
    });

    lines_inner((t) => {
      t.$(" x n", " y_  x m")
      t.$("   -", "----   -").default()
      t.$("   -", " -     -").trim()
      t.$("   -", " -     -").ignore()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("x_", "x!  ")
      t.$(" -", " ---").default()
      t.$("  ", " -  ").trim()
      t.$("  ", " -  ").ignore()
      t.testAll()
    });
  });

  test('testInnerWhitespaces', () => {
    lines_inner((t) => {
      t.$("<< x >>", "<.<>.>")
      t.$("  ---  ", " -  - ").default()
      t.$("   -   ", " -  - ").ignore()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("<< x >>", "y<<x>>y")
      t.$("  - -  ", "-     -").default()
      t.$("       ", "-     -").ignore()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("x .. z", "x y .. z")
      t.$("      ", " --     ").default()
      t.$("      ", "  -     ").ignore()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("  x..z", "x..y  ")
      t.$("--   -", "   ---").default()
      t.$("     -", "   -  ").trim()
      t.testAll()
    });

    lines_inner((t) => {
      t.$(" x y x _ x z x ", "x x_x x")
      t.$("- --  - - --  -", "       ").default()
      t.$("  --      --   ", "       ").trim()
      t.$("   -       -   ", "       ").ignore()
      t.testAll()
    });
  });

  test('testAlgorithmSpecific', () => {
    // prefer words over punctuation
    lines_inner((t) => {
      t.$("...x", "x...")
      t.$("--- ", " ---").default()
      t.testAll()
    });

    // prefer longer words sequences
    lines_inner((t) => {
      t.$("x x y", "x y")
      t.$("--   ", "   ").default()
      t.$("-    ", "   ").ignore()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("y x x", "y x")
      t.$("   --", "   ").default()
      t.$("    -", "   ").ignore()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("A X A B", "A B")
      t.$("----   ", "   ").default()
      t.$("---    ", "   ").ignore()
      t.testAll()
    });

    // prefer less modified 'sentences'
    lines_inner((t) => {
      t.$("A.X A.Z", "A.X A.Y A.Z")
      t.$("       ", "   ----    ").default()
      t.$("       ", "    ---    ").ignore()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("X.A Z.A", "X.A Y.A Z.A")
      t.$("       ", "   ----    ").default()
      t.$("       ", "    ---    ").ignore()
      t.testAll()
    });

    // prefer punctuation over whitespaces
    lines_inner((t) => {
      t.$(".   ", "   .")
      t.$(" ---", "--- ").default()
      t.testDefault()
    });

    lines_inner((t) => {
      t.$("A B_C D", "A_B C_D")
      t.$(" -  -- ", " - --  ").default()
      t.$(" -  -- ", "   --  ").trim()
      t.$("    -  ", "    -  ").ignore()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("B_C_D_", "X_Y_Z_")
      t.$("- - - ", "- - - ").default()
      t.testAll()
    });

    words((t) => {
      t.$("!x_!_z", "!_!_y z")
      t.$(" -    ", "    -- ").default()
      t.testDefault()
    });
  });

  test('test trailing punctuation', () => {
    lines_inner((t) => {
      t.$("X = { };", "X = { _ };")
      t.$("        ", "     --   ").default()
      t.$("        ", "          ").trim()
      t.testAll()
    });

    // TODO
    lines_inner((t) => {
      t.$("X = { };_", "X = { _ };_")
      t.$("      -- ", "       ----").default()
      t.$("      -- ", "        -- ").trim()
      t.testAll()
    });
  });

  test('test legacy cases from ByWordTest', () => {
    lines_inner((t) => {
      t.$("abc def, 123", "ab def, 12")
      t.$("---      ---", "--      --").default()
      t.testAll()
    });

    lines_inner((t) => {
      t.$(" a[xy]+1", ",a[]+1")
      t.$("-  --   ", "-     ").default()
      t.$("   --   ", "-     ").trim()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("0987_  a.g();_", "yyyy_")
      t.$("------------- ", "---- ").default()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("  abc_2222_", "    x = abc_zzzz_")
    //t.$("      ---- ", "--  ----    ---- ").legacy()
      t.$("      ---- ", " ------     ---- ").default()
      t.$("      ---- ", "    ---     ---- ").trim()
      t.testAll()
    });

    lines_inner((t) => { // Idea58505
      t.$("   if (eventMerger!=null && !dataSelection.getValueIsAdjusting()) {", "   if (eventMerger!=null && (dataSelection==null || !dataSelection.getValueIsAdjusting())) {")
    //("                            -                                      " -
    // "                            -             ------------------------                       -  ").legacy()
      t.$("                                                                   ", "                           ------------------------                                      -  ").default()
      t.$("                                                                   ", "                            -----------------------                                      -  ").ignore()
      t.testAll()
    });

    lines_inner((t) => { // Idea56428
      t.$("messageInsertStatement = connection.prepareStatement(\"INSERT INTO AUDIT (AUDIT_TYPE_ID, STATUS, SERVER_ID, INSTANCE_ID, REQUEST_ID) VALUES (?, ?, ?, ?, ?)\");", "messageInsertStatement = connection.prepareStatement(\"INSERT INTO AUDIT (AUDIT_TYPE_ID, CREATION_TIMESTAMP, STATUS, SERVER_ID, INSTANCE_ID, REQUEST_ID) VALUES (?, ?, ?, ?, ?, ?)\");").plainSource()
    //("                                                     .                                                                                                     .   " -
    // "                                                     .                                   --------------------                                                                 --- .   ").legacy()
      t.$("                                                     .                                                                                                     .   ", "                                                     .                                  --------------------                                                                  --- .   ").default()
      t.$("                                                     .                                                                                                     .   ", "                                                     .                                   -------------------                                                                  --- .   ").ignore()
      t.testAll()
    });

    lines_inner((t) => {
      t.$("f(a, b);", "f(a,_  b);")
      t.$("        ", "    --    ").default()
      t.$("        ", "          ").trim()
      t.testAll()
    });

    lines_inner((t) => {
      t.$(" o.f(a)", "o. f( b)")
      t.$("-    - ", "  -  -- ").default()
      t.$("     - ", "  -  -- ").trim()
      t.$("     - ", "      - ").ignore()
      t.testAll()
    });

    lines_inner((t) => {
      t.$(" 123 ", "xyz")
      t.$(" --- ", "---").trim()
      t.testTrim()
    });
  });

  test('testEmptyRangePositions', () => {
    lines_inner((t) => {
      t.$("x? y", "x y")
      t.$(" -  ", "   ").default()
      t.default(del(1, 1, 1))
      t.testAll()
    });

    lines_inner((t) => {
      t.$("x ?y", "x y")
      t.$("  - ", "   ").default()
      t.default(del(2, 2, 1))
      t.testAll()
    });
  });

  test('testContinuousScript', () => {
    words((t) => {
      t.$("ABCD", "DABC")
      t.$("----", "----").default()
      t.testDefault()
    });

    words((t) => {
      t.$("汉语漢語", "語汉语漢")
      t.$("   -", "-   ").default()
      t.testDefault()
    });

    words((t) => {
      t.$("AB漢CD", "DA漢CD")
      t.$("--   ", "--   ").default()
      t.testDefault()
    });

    words((t) => {
      t.$("AB漢CD", "DA语CD")
      t.$("---  ", "---  ").default()
      t.testDefault()
    });

    words((t) => {
      t.$("a_c", "x_c").plainSource()
      t.$("---", "---").default()
      t.testDefault()
    });

    words((t) => {
      t.$("!_?", "!_+")
      t.$("  -", "  +").default()
      t.testDefault()
    });
  });

  test('testHighSurrogates', () => {
    words((t) => {
      t.$(`${chSmile}${chGun}${chMan}${chFace}`, `${chGun}${chMan}${chFace}${chSmile}`)
      t.$("--      ", "      --").default()
      t.testDefault()
    });

    words((t) => {
      t.$(chSmile, chGun)
      t.$("--", "--").default()
      t.testDefault()
    });

    words((t) => {
      t.$(chFace, chGun)
      t.$("--", "--").default()
      t.testDefault()
    });

    words((t) => {
      t.$(`${chSmile} `, ` ${chGun}`)
      t.$("---", "---").default()
      t.$("-- ", " --").trim()
      t.testAll()
    });

    words((t) => {
      t.$(`${chSmile}${chFace} ${chMan}`, ` ${chGun}${chFace}${chMan} `)
      t.$("--  -  ", "---    -").default()
      t.$("--  -  ", " --     ").trim()
      t.$("--     ", " --     ").ignore()
      t.testAll()
    });
  });
});
