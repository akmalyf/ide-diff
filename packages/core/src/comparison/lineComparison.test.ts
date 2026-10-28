// Ported from intellij-community platform/diff-impl/tests/.../comparison/LineComparisonUtilTest.kt (JetBrains, Apache-2.0).
import { describe, test } from 'vitest';
import { lines, lines_inner, words, chars, chars_raw, chars_smart, splitter, chSmile, chGun, chFace, chMan, mod, del, ins } from '../test/dsl';

describe('LineComparisonUtilTest', () => {
  test('testEqualStrings', () => {
    lines((t) => {
      t.$("", "")
      t.default()
      t.testAll()
    });

    lines((t) => {
      t.$("x", "x")
      t.default()
      t.testAll()
    });

    lines((t) => {
      t.$("x_y_z_", "x_y_z_")
      t.default()
      t.testAll()
    });

    lines((t) => {
      t.$("_", "_")
      t.default()
      t.testAll()
    });

    lines((t) => {
      t.$(" x_y ", " x_y ")
      t.default()
      t.testAll()
    });
  });

  test('testTrivialCases', () => {
    lines((t) => {
      t.$("x_", "y_")
      t.default(mod(0, 0, 1, 1))
      t.testAll()
    });

    lines((t) => {
      t.$("x", "")
      t.default(mod(0, 0, 1, 1))
      t.testAll()
    });

    lines((t) => {
      t.$("", "x")
      t.default(mod(0, 0, 1, 1))
      t.testAll()
    });

    lines((t) => {
      t.$("x", "y")
      t.default(mod(0, 0, 1, 1))
      t.testAll()
    });

    lines((t) => {
      t.$("x_z", "y_z")
      t.default(mod(0, 0, 1, 1))
      t.testAll()
    });

    lines((t) => {
      t.$("z_x", "z_y")
      t.default(mod(1, 1, 1, 1))
      t.testAll()
    });

    lines((t) => {
      t.$("x", "x_")
      t.default(ins(1, 1, 1))
      t.testAll()
    });

    lines((t) => {
      t.$("x_", "x")
      t.default(del(1, 1, 1))
      t.testAll()
    });
  });

  test('testSimpleCases', () => {
    lines((t) => {
      t.$("x_z", "y_z")
      t.default(mod(0, 0, 1, 1))
      t.testAll()
    });

    lines((t) => {
      t.$("x_", "x_z")
      t.default(mod(1, 1, 1, 1))
      t.testAll()
    });

    lines((t) => {
      t.$("x_y", "n_m")
      t.default(mod(0, 0, 2, 2))
      t.testAll()
    });

    lines((t) => {
      t.$("x_y_z", "n_y_m")
      t.default(mod(0, 0, 1, 1), mod(2, 2, 1, 1))
      t.testAll()
    });

    lines((t) => {
      t.$("x_y_z", "n_k_y")
      t.default(mod(0, 0, 1, 2), del(2, 3, 1))
      t.testAll()
    });

    lines((t) => {
      t.$("x_y_z", "y")
      t.default(del(0, 0, 1), del(2, 1, 1))
      t.testAll()
    });

    lines((t) => {
      t.$("a_b_x", "x_m_n")
      t.default(del(0, 0, 2), ins(3, 1, 2))
      t.testAll()
    });
  });

  test('testEmptyLastLine', () => {
    lines((t) => {
      t.$("x_", "")
      t.default(del(0, 0, 1))
      t.testAll()
    });

    lines((t) => {
      t.$("", "x_")
      t.default(ins(0, 0, 1))
      t.testAll()
    });

    lines((t) => {
      t.$("x_", "x")
      t.default(del(1, 1, 1))
      t.testAll()
    });

    lines((t) => {
      t.$("x_", "x_z ")
      t.default(mod(1, 1, 1, 1))
      t.testAll()
    });
  });

  test('testWhitespaceOnlyChanges', () => {
    lines((t) => {
      t.$("x ", " x")
      t.default(mod(0, 0, 1, 1))
      t.trim()
      t.testAll()
    });

    lines((t) => {
      t.$("x \t", "\t x")
      t.default(mod(0, 0, 1, 1))
      t.trim()
      t.testAll()
    });

    lines((t) => {
      t.$("x_", "x ")
      t.default(mod(0, 0, 2, 1))
      t.trim(del(1, 1, 1))
      t.testAll()
    });

    lines((t) => {
      t.$(" x_y ", "x _ y")
      t.default(mod(0, 0, 2, 2))
      t.trim()
      t.testAll()
    });

    lines((t) => {
      t.$("x y ", "x  y")
      t.default(mod(0, 0, 1, 1))
      t.ignore()
      t.testAll()
    });

    lines((t) => {
      t.$("x y_x y_x y", "  x y  _x y  _x   y")
      t.default(mod(0, 0, 3, 3))
      t.trim(mod(2, 2, 1, 1))
      t.ignore()
      t.testAll()
    });
  });

  test('testAlgorithmSpecific', () => {
    lines((t) => {
      t.$("x_y_z_AAAAA", "AAAAA_x_y_z")
      t.default(del(0, 0, 3), ins(4, 1, 3))
      t.testAll()
    });

    lines((t) => {
      t.$("x_y_z", " y_ m_ n")
      t.default(mod(0, 0, 3, 3))
      t.trim(del(0, 0, 1), mod(2, 1, 1, 2))
      t.testAll()
    });

    lines((t) => {
      t.$("}_ }", " }")
      t.default(del(0, 0, 1))
      t.testDefault()
    });

    lines((t) => {
      t.$("{_}", "{_ {_ }_}_x")
      t.default(ins(1, 1, 2), ins(2, 4, 1))
      t.testDefault()
    });
  });

  test('testNonDeterministicCases', () => {
    lines((t) => {
      t.$("", "__")
      t.default(ins(1, 1, 2))
      t.testAll()
    });

    lines((t) => {
      t.$("__", "")
      t.default(del(1, 1, 2))
      t.testAll()
    });
  });

  test('test regression - shifted similar lines should be matched as a single change, not insertion-deletion', () => {
    lines((t) => {
      t.$(" X_  X", "  X_   X")
      t.$("--_---", "---_----").default()
      t.testDefault()
    });
  });

  test('test prefer chunks bounded by empty line', () => {
    lines((t) => {
      t.$("A_B_o_o_Y_Z_ _A_B_z_z_Y_Z", "A_B_o_o_Y_Z_ _A_B_u_u_Y_Z_ _A_B_z_z_Y_Z")
      t.$(" _ _ _ _ _ _ _ _ _ _ _ _ ", " _ _ _ _ _ _ _-_-_-_-_-_-_-_ _ _ _ _ _ ").default()
      t.testAll()
    });

    lines((t) => {
      t.$("A_B_o_o_Y_Z_ _A_B_ _ _Y_Z", "A_B_o_o_Y_Z_ _A_B_u_u_Y_Z_ _A_B_ _ _Y_Z")
      t.$(" _ _ _ _ _ _ _ _ _ _ _ _ ", " _ _ _ _ _ _ _ _ _-_-_-_-_-_-_-_ _ _ _ ").default()
      t.testAll()
    });

    lines((t) => {
      t.$("A_B_o_o_ _A_B_z_z", "A_B_o_o_ _A_B_u_u_ _A_B_z_z")
      t.$(" _ _ _ _ _ _ _ _ ", " _ _ _ _ _-_-_-_-_-_ _ _ _ ").default()
      t.testAll()
    });

    lines((t) => {
      t.$("o_o_Y_Z_ _z_z_Y_Z", "o_o_Y_Z_ _u_u_Y_Z_ _z_z_Y_Z")
      t.$(" _ _ _ _ _ _ _ _ ", " _ _ _ _ _-_-_-_-_-_ _ _ _ ").default()
      t.testAll()
    });
  });

  test('test prefer chunks bounded by short line', () => {
    lines((t) => {
      t.$("A====_B====_o====_o====_Y====_Z====_!_A====_B====_z====_z====_Y====_Z====", "A====_B====_o====_o====_Y====_Z====_!_A====_B====_u====_u====_Y====_Z====_!_A====_B====_z====_z====_Y====_Z====")
      t.$("     _     _     _     _     _     _ _     _     _     _     _     _     ", "     _     _     _     _     _     _ _-----_-----_-----_-----_-----_-----_-_     _     _     _     _     _     ").default()
      t.testAll()
    });

    lines((t) => {
      t.$("A====_B====_o====_o====_Y====_Z====_ _A====_B====_!_!_Y====_Z====", "A====_B====_o====_o====_Y====_Z====_ _A====_B====_u====_u====_Y====_Z====_ _A====_B====_!_!_Y====_Z====")
      t.$("     _     _     _     _     _     _ _     _     _ _ _     _     ", "     _     _     _     _     _     _ _-----_-----_-----_-----_-----_-----_-_     _     _ _ _     _     ").default()
      t.testAll()
    });

    lines((t) => {
      t.$("A====_B====_o====_o====_Y====_Z====_!_A====_B====_ _ _Y====_Z====", "A====_B====_o====_o====_Y====_Z====_!_A====_B====_u====_u====_Y====_Z====_!_A====_B====_ _ _Y====_Z====")
      t.$("     _     _     _     _     _     _ _     _     _ _ _     _     ", "     _     _     _     _     _     _ _     _     _-----_-----_-----_-----_-_-----_-----_ _ _     _     ").default()
      t.testAll()
    });
  });

  test('test prefer chunks bounded by empty line - using inserted content', () => {
    lines((t) => {
      t.$("e_x_A_B_z", "x_A_B_ _q_A_B_z")
      t.$("-_ _ _ _ ", " _ _ _-_-_-_-_ ").default()
      t.testAll()
    });
  });

  test('test prefer smaller amount of chunks', () => {
    lines((t) => {
      t.$("X_A_X_Y_", "X_Y_")
      t.$("-_-_ _ _", " _ _").default()
      t.testAll()
    });

    lines((t) => {
      t.$(" __x___y", "__y")
      t.$("-**-*__ ", "__ ").default()
      t.default(del(0, 0, 3))
      t.testAll()
    });

    lines((t) => {
      t.$("U======_X======_Y======_z======_X======_Y======_X======_U======_X======_z======", "U======_Y======_X======_U======_X======")
      t.$("       _-------_-------_-------_-------_       _       _       _       _-------", "       _       _       _       _       ").default()
      t.testAll()
    });
  });

  test("test regression - can trim chunks after 'compareTwoSteps'", () => {
    lines((t) => {
      t.$("q__7_ 6_ 7", "_7")
      t.$("-*_ _--*--", "_ ").default()
      t.testDefault()
    });
  });

  test("test regression - can trim chunks after 'optimizeLineChunks'", () => {
    lines((t) => {
      t.$("A=====_ B=====_ }_}_B=====_", "A=====_ }_}_B=====_")
      t.$("      _-------_  _ _      _", "      _  _ _      _").default()
      t.testAll()
    });
  });

  test("test bad cases caused by 'compareTwoStep' logic", () => {
    lines((t) => {
      t.$("x_!", "!_x_y")
      t.$("-_ ", " _-_-").default()
      t.testAll()
    });

    lines((t) => {
      t.$("!_x_y", "x_!")
      t.$("-_ _-", " _-").default()
      t.testAll()
    });

    lines((t) => {
      t.$("x_! ", "!_x_y")
      t.$("-_--", "-_-_-").default()
      t.$("-_  ", " _-_-").trim()
      t.testAll()
    });

    lines((t) => {
      t.$("!_x_y", "x_! ")
      t.$("-_ _-", " _--").default()
      t.testAll()
    });

    splitter({}, (t) => {
      t.$("M===_X===_Y===", " Y===_X===_N")
      // TODO: default(mod(0, 0, 1, 1), mod(2, 2, 1, 1))
      t.default(mod(0, 0, 1, 1), mod(1, 1, 1, 1), mod(2, 2, 1, 1))
      t.testDefault()
    });
  });

  test("test bad cases caused by 'compareSmart' logic", () => {
    lines((t) => {
      t.$("A=====_ B=====_ }_}_B=====", "A=====_ }_}_B=====")
      // TODO t.$("      _-------_  _ _      ", "      _  _ _      ").trim()
      t.$("      _-------_  _ _      ", "      _  _ _      ").default()
      t.$("      _       _--_-_------", "      _--_-_      ").trim()
      t.testAll()
    });

    lines((t) => {
      t.$("A=====_ B=====_X_ }_}_Z_B=====_", "A=====_ }_}_B=====_")
      // TODO t.$("      _-------_-_  _ _-_      _", "      _  _ _      _").default()
      t.$("      _-------_-_--_-_-_      _", "      _--_-_      _").default()
      t.testAll()
    });
  });

  test('test trim changed blocks after second step correction', () => {
    lines((t) => {
      t.$("====}_==== }_Y_====}", "====}_Y_====}")
      t.$("     _------_ _     ", "     _ _     ").default() // result after second step correction
      t.$("     _      _-_-----", "     _-_     ").ignore()  // result looks strange because of 'diff.unimportant.line.char.count'
      t.testAll()
    });
  });

  test('test second step correction processes all confusing lines', () => {
    lines((t) => {
      t.$("====}_==== }_Y_==== }_====}", "==== }_Y_==== }")
      t.$("-----_      _ _      _-----", "      _ _      ").default()
      t.testDefault()
    });
  });

  test('test ignore whitespace policy does not applies two-step correction', () => {
    lines((t) => {
      t.$("1_ _  1", "  1")
      t.$("-_-_   ", "   ").default()
      t.$(" _-_---", "   ").trim()
      t.testAll()
    });

    lines((t) => {
      t.$("  1_ _1", "  1")
      t.$("   _-_-", "   ").default()
      t.testAll()
    });

    lines((t) => {
      t.$("X_ Y_X", "Y ")
      t.$("-_--_-", "--").default()
      t.$("-_  _-", "  ").trim()
      t.testAll()
    });
  });

  test('test regression - second step correction should be performed if there are no ambiguous matchings', () => {
    lines((t) => {
      t.$("}_ }", " }_}")
      t.$("-_--", "--_-").default()
      t.$(" _  ", "  _ ").trim()
      t.testAll()
    });

    lines((t) => {
      t.$(" }_}_ }", "}_}_}")
      t.$("--_ _--", "-_ _-").default()
      t.$("  _ _  ", " _ _ ").trim()
      t.testAll()
    });

    lines((t) => {
      t.$("X_X __Y", "X__Z")
      t.$(" _--__-", " __-").default()
      t.$("-_  __-", " __-").trim()
      t.testAll()
    });
  });

  test('test regression - second step with too many possible matchings', () => {
    lines((t) => {
      t.$(" X_X_X_X_X_X_X_X_X_X_X_X_X_X_X_X_X_X_X_X_X_X_X_ X", "X_X_X_X_X_X_X_X_X_X_X_X_X_X_X_X_X_X_X ")
      t.$("--_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _-_-_-_-_-_--", "-_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _--").default()
      t.$("  _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _-_-_-_-_--", " _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _  ").trim()
      t.testAll()
    });
  });

  test('test regression - second step correction should search for matchings in its prefix', () => {
    lines((t) => {
      t.$("Z_X_Z_X __Y", "X__Y")
      t.$("-_ _-_--__ ", " __ ").default()
      t.$("-_-_-_  __ ", " __ ").trim()
      t.testAll()
    });

    // do not break other IW-matchings during second step
    lines((t) => {
      t.$("Z_X_K_Z_X __Y", "K _X__Y")
      t.$("-_-_-_-_--__ ", "--_-__ ").default()
      t.$("-_-_ _-_  __ ", "  _ __ ").trim()
      t.testAll()
    });
  });

  test('test regression - multiple similar braces nearby', () => {
    // IDEA-111712
    lines((t) => {
      t.$("function fn() {_  return {_    a: 1_  }_}_", "function fn() {_  return {_    a: 1_  };_}_")
      t.$("               _          _        _---_ _", "               _          _        _----_ _").default()
      t.testAll()
    });

    lines((t) => {
      t.$("function fn() {_  return {_    a: 1_  }_}_", "function fn() {_  return {_    a: 1_  }_};_")
      t.$("               _          _        _   _-_", "               _          _        _   _--_").default()
      t.testAll()
    });
  });
});
