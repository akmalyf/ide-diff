// Ported from intellij-community platform/diff-impl/tests/.../comparison/SplitComparisonUtilTest.kt (JetBrains, Apache-2.0).
import { describe, test } from 'vitest';
import { lines, lines_inner, words, chars, chars_raw, chars_smart, splitter, chSmile, chGun, chFace, chMan, mod, del, ins } from '../test/dsl';

describe('SplitComparisonUtilTest', () => {
  test('testSplitter', () => {
    splitter({}, (t) => {
      t.$("x", "z")
      t.default(mod(0, 0, 1, 1))
      t.testAll()
    });
    splitter({}, (t) => {
      t.$("x_y", "a_b")
      t.default(mod(0, 0, 2, 2))
      t.testAll()
    });
    splitter({}, (t) => {
      t.$("x_y", "a_b y")
      t.default(mod(0, 0, 1, 1), mod(1, 1, 1, 1))
      t.testAll()
    });
    splitter({}, (t) => {
      t.$("x y", "x a_b y")
      t.default(mod(0, 0, 1, 2))
      t.testAll()
    });
    splitter({}, (t) => {
      t.$("x_y", "x a_y b")
      t.default(mod(0, 0, 1, 1), mod(1, 1, 1, 1))
      t.testAll()
    });

    splitter({}, (t) => {
      t.$("x_", "x a_...")
      t.default(mod(0, 0, 2, 2))
      t.testAll()
    });
    splitter({}, (t) => {
      t.$("x_y_", "a_b_")
      t.default(mod(0, 0, 2, 2))
      t.testAll()
    });
    splitter({}, (t) => {
      t.$("x_y", " x _ y ")
      t.default(mod(0, 0, 2, 2))
      t.testDefault()
    });
    splitter({}, (t) => {
      t.$("x_y", " x _ y.")
      t.default(mod(0, 0, 1, 1), mod(1, 1, 1, 1))
      t.testDefault()
    });

    splitter({}, (t) => {
      t.$("a_x_b_", " x_")
      t.default(del(0, 0, 1), mod(1, 0, 1, 1), del(2, 1, 1))
      t.testDefault()
    });
    splitter({}, (t) => {
      t.$("a_x_b_", "!x_")
      t.default(del(0, 0, 1), mod(1, 0, 1, 1), del(2, 1, 1))
      t.testAll()
    });

    splitter({ trim: false }, (t) => {
      t.$("< i", "<i<_i")
      t.default(mod(0, 0, 1, 2))
      t.testDefault()
    });
    splitter({ trim: false }, (t) => {
      t.$(".l j", "U_._l j+")
      t.default(ins(0, 0, 2), mod(0, 2, 1, 1))
      t.testDefault()
    });

    splitter({}, (t) => {
      t.$("      run();", "      //commentary_      while(run(true));")
      t.default(mod(0, 0, 1, 2))
      t.testDefault()
    });
  });

  test('testSquash', () => {
    splitter({ squash: true }, (t) => {
      t.$("x", "z")
      t.default(mod(0, 0, 1, 1))
      t.testAll()
    });
    splitter({ squash: true }, (t) => {
      t.$("x_y", "a_b")
      t.default(mod(0, 0, 2, 2))
      t.testAll()
    });
    splitter({ squash: true }, (t) => {
      t.$("x_y", "a_b y")
      t.default(mod(0, 0, 2, 2))
      t.testAll()
    });

    splitter({ squash: true }, (t) => {
      t.$("a_x_b_", " x_")
      t.default(mod(0, 0, 3, 1))
      t.testDefault()
    });
    splitter({ squash: true }, (t) => {
      t.$("a_x_b_", "!x_")
      t.default(mod(0, 0, 3, 1))
      t.testAll()
    });
  });

  test('testTrim', () => {
    splitter({ trim: true }, (t) => {
      t.$("_", "     _    ")
      t.default(mod(0, 0, 2, 2))
      t.trim()
      t.testAll()
    });

    splitter({ trim: true }, (t) => {
      t.$("", "     _    ")
      t.default(mod(0, 0, 1, 2))
      t.trim(ins(1, 1, 1))
      t.ignore()
      t.testAll()
    });

    splitter({ trim: true }, (t) => {
      t.$("     _    ", "")
      t.default(mod(0, 0, 2, 1))
      t.trim(del(1, 1, 1))
      t.ignore()
      t.testAll()
    });

    splitter({ trim: true }, (t) => {
      t.$("x_y", "z_ ")
      t.default(mod(0, 0, 2, 2))
      t.testAll()
    });

    splitter({ trim: true }, (t) => {
      t.$("z", "z_ ")
      t.default(ins(1, 1, 1))
      t.ignore()
      t.testAll()
    });

    splitter({ trim: true }, (t) => {
      t.$("z_ x", "z_ w")
      t.default(mod(1, 1, 1, 1))
      t.testAll()
    });

    splitter({ trim: true }, (t) => {
      t.$("__z__", "z")
      t.default(del(0, 0, 2), del(3, 1, 2))
      t.ignore()
      t.testAll()
    });
  });
});
