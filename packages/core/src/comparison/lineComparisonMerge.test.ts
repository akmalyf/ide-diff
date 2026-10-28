// Ported from intellij-community platform/diff-impl/tests/.../comparison/LineComparisonMergeUtilTest.kt (JetBrains, Apache-2.0).
import { describe, test } from 'vitest';
import { lines_diff, lines_merge, mod3 } from '../test/dsl';

describe('LineComparisonMergeUtilTest', () => {
  test('testSimpleCases', () => {
    lines_merge((t) => {
      t.$("", "", "")
      t.$("", "", "").matching()
      t.changes()
      t.test()
    });

    lines_merge((t) => {
      t.$("x_y_z", "x_y_z", "x_y_z")
      t.$(" _ _ ", " _ _ ", " _ _ ").matching()
      t.changes()
      t.test()
    });

    lines_merge((t) => {
      t.$("", "", "x")
      t.changes(mod3(0, 0, 0, 1, 1, 1))
      t.test()
    });

    lines_merge((t) => {
      t.$("", "", "_x")
      t.$("", "", "_-").matching()
      t.changes(mod3(1, 1, 1, 0, 0, 1))
      t.test()
    });

    lines_merge((t) => {
      t.$("x", "y", "x")
      t.$("-", "-", "-").matching()
      t.test()
    });

    lines_merge((t) => {
      t.$("x", "x_y", "x")
      t.$(" ", " _-", " ").matching()
      t.test()
    });

    lines_merge((t) => {
      t.$("x", "y_x", "x")
      t.$(" ", "-_ ", " ").matching()
      t.test()
    });

    lines_merge((t) => {
      t.$("x_y_z", "x_Y_z", "x_y_z")
      t.$(" _-_ ", " _-_ ", " _-_ ").matching()
      t.test()
    });

    lines_merge((t) => {
      t.$("x_y_z", "X_y_Z", "x_y_z")
      t.$("-_ _-", "-_ _-", "-_ _-").matching()
      t.test()
    });
  });

  test('testIgnoreWhitespaces', () => {
    lines_diff((t) => {
      t.$("x_ y _z", "x_y_z", "x_  y_  z")
      t.changes()
      t.test('IGNORE_WHITESPACES')
    });

    lines_merge((t) => {
      t.$("x_ y _z", "x_y_z", "x_  y_  z")
      t.changes(mod3(1, 1, 1, 2, 2, 2))
      t.test('IGNORE_WHITESPACES')
    });


    lines_diff((t) => {
      t.$("x_ y _z", "x_Y_z", "x_  y_  z")
      t.changes(mod3(1, 1, 1, 1, 1, 1))
      t.test('IGNORE_WHITESPACES')
    });

    lines_merge((t) => {
      t.$("x_ y _z", "x_Y_z", "x_  y_  z")
      t.changes(mod3(1, 1, 1, 1, 1, 1),
              mod3(2, 2, 2, 1, 1, 1))
      t.test('IGNORE_WHITESPACES')
    });


    lines_merge((t) => {
      t.$("x_ y _z", "x_Y_z", "x_  y_z")
      t.changes(mod3(1, 1, 1, 1, 1, 1))
      t.test('IGNORE_WHITESPACES')
    });

    lines_merge((t) => {
      t.$("x_ y _z", "x_y_z", "x_  y_z")
      t.changes(mod3(1, 1, 1, 1, 1, 1))
      t.test('IGNORE_WHITESPACES')
    });

    lines_merge((t) => {
      t.$(" x _y_z", "x_y_z", "x_y_  z")
      t.changes(mod3(0, 0, 0, 1, 1, 1),
              mod3(2, 2, 2, 1, 1, 1))
      t.test('IGNORE_WHITESPACES')
    });


    lines_diff((t) => {
      t.$(" x_new_y_z", "x_ y _z", "x_y_new_ z")
      t.changes(mod3(1, 1, 1, 1, 0, 0),
              mod3(3, 2, 2, 0, 0, 1))
      t.test('IGNORE_WHITESPACES')
    });

    lines_merge((t) => {
      t.$(" x_new_y_z", "x_ y _z", "x_y_new_ z")
      t.changes(mod3(0, 0, 0, 1, 1, 1),
              mod3(1, 1, 1, 1, 0, 0),
              mod3(2, 1, 1, 1, 1, 1),
              mod3(3, 2, 2, 0, 0, 1),
              mod3(3, 2, 3, 1, 1, 1))
      t.test('IGNORE_WHITESPACES')
    });


    lines_diff((t) => {
      t.$(" x_new_y1_z", "x_ y _z", "x_y2_new_ z")
      t.changes(mod3(1, 1, 1, 2, 1, 2))
      t.test('IGNORE_WHITESPACES')
    });

    lines_merge((t) => {
      t.$(" x_new_y1_z", "x_ y _z", "x_y2_new_ z")
      t.changes(mod3(0, 0, 0, 1, 1, 1),
              mod3(1, 1, 1, 2, 1, 2),
              mod3(3, 2, 3, 1, 1, 1))
      t.test('IGNORE_WHITESPACES')
    });
  });
});
